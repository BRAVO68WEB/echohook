use crate::config::RedisSettings;
use crate::error::AppResult;
use crate::models::{Session, WebhookRequest};
use chrono::{DateTime, Utc};
use redis::aio::MultiplexedConnection;
use redis::{AsyncCommands, Client as RedisClient2};
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tokio::sync::{broadcast, RwLock};
use tracing::{debug, info, instrument, warn};

/// Redis key prefixes
const SESSION_PREFIX: &str = "session";
const REQUEST_PREFIX: &str = "request";

/// Redis client wrapper with connection pooling and pub/sub support
pub struct RedisClient {
    connection: RwLock<MultiplexedConnection>,
    /// Broadcast channels for SSE by session_id
    sse_channels: RwLock<HashMap<String, broadcast::Sender<WebhookRequest>>>,
}

impl RedisClient {
    /// Create a new Redis client
    pub async fn new(settings: &RedisSettings) -> anyhow::Result<Self> {
        let client = RedisClient2::open(settings.url.as_str())?;
        let connection = client.get_multiplexed_async_connection().await?;

        Ok(Self {
            connection: RwLock::new(connection),
            sse_channels: RwLock::new(HashMap::new()),
        })
    }

    /// Get a connection from the pool
    async fn get_connection(&self) -> AppResult<MultiplexedConnection> {
        let conn = self.connection.read().await.clone();
        Ok(conn)
    }

    /// Get or create a broadcast channel for a session
    pub async fn get_sse_channel(
        &self,
        session_id: &str,
    ) -> broadcast::Receiver<WebhookRequest> {
        info!(
            session_id = %session_id,
            "Getting SSE channel for session"
        );
        let mut channels = self.sse_channels.write().await;

        if let Some(sender) = channels.get(session_id) {
            let receiver_count = sender.receiver_count();
            info!(
                session_id = %session_id,
                receiver_count = receiver_count,
                "Subscribing to existing SSE channel"
            );
            sender.subscribe()
        } else {
            // Create a new channel with capacity for 256 messages
            info!(
                session_id = %session_id,
                "Creating new SSE broadcast channel"
            );
            let (tx, rx) = broadcast::channel(256);
            channels.insert(session_id.to_string(), tx);
            rx
        }
    }

    /// Broadcast a new request to SSE subscribers
    async fn broadcast_request(&self, session_id: &str, request: &WebhookRequest) {
        let channels = self.sse_channels.read().await;
        if let Some(sender) = channels.get(session_id) {
            let receiver_count = sender.receiver_count();
            info!(
                session_id = %session_id,
                request_id = %request.request_id,
                receiver_count = receiver_count,
                "Broadcasting request to SSE subscribers"
            );
            match sender.send(request.clone()) {
                Ok(sent_count) => {
                    debug!(
                        session_id = %session_id,
                        request_id = %request.request_id,
                        sent_count = sent_count,
                        "Successfully broadcast request"
                    );
                }
                Err(e) => {
                    warn!(
                        session_id = %session_id,
                        request_id = %request.request_id,
                        error = %e,
                        "Failed to broadcast request (no active subscribers?)"
                    );
                }
            }
        } else {
            warn!(
                session_id = %session_id,
                request_id = %request.request_id,
                "No SSE channel found for session, skipping broadcast"
            );
        }
    }

    /// Clean up SSE channel when no subscribers remain
    pub async fn cleanup_sse_channel(&self, session_id: &str) {
        let mut channels = self.sse_channels.write().await;
        if let Some(sender) = channels.get(session_id) {
            if sender.receiver_count() == 0 {
                channels.remove(session_id);
                debug!(session_id = %session_id, "Cleaned up SSE channel");
            }
        }
    }

    /// Check Redis health
    #[instrument(skip(self))]
    pub async fn health_check(&self) -> AppResult<bool> {
        let mut conn = self.get_connection().await?;
        let result: String = redis::cmd("PING").query_async(&mut conn).await?;
        Ok(result == "PONG")
    }

    /// Create a new session
    #[instrument(skip(self))]
    pub async fn create_session(&self, session_id: &str, ttl_seconds: u64) -> AppResult<Session> {
        let mut conn = self.get_connection().await?;
        let now = Utc::now();
        let expires_at = now + chrono::Duration::seconds(ttl_seconds as i64);

        let session = Session {
            session_id: session_id.to_string(),
            created_at: now.to_rfc3339(),
            expires_at: expires_at.to_rfc3339(),
        };

        let key = format!("{}:{}", SESSION_PREFIX, session_id);

        // Use a pipeline for atomic operations
        redis::pipe()
            .hset(&key, "session_id", &session.session_id)
            .hset(&key, "created_at", &session.created_at)
            .hset(&key, "expires_at", &session.expires_at)
            .expire(&key, ttl_seconds as i64)
            .query_async::<()>(&mut conn)
            .await?;

        debug!(session_id = %session_id, "Created new session");
        Ok(session)
    }

    /// Get a session by ID
    #[instrument(skip(self))]
    pub async fn get_session(&self, session_id: &str) -> AppResult<Option<Session>> {
        let mut conn = self.get_connection().await?;
        let key = format!("{}:{}", SESSION_PREFIX, session_id);

        let data: HashMap<String, String> = conn.hgetall(&key).await?;

        if data.is_empty() {
            return Ok(None);
        }

        Ok(Some(Session {
            session_id: data.get("session_id").cloned().unwrap_or_default(),
            created_at: data.get("created_at").cloned().unwrap_or_default(),
            expires_at: data.get("expires_at").cloned().unwrap_or_default(),
        }))
    }

    /// Check if a session exists
    #[instrument(skip(self))]
    pub async fn session_exists(&self, session_id: &str) -> AppResult<bool> {
        let mut conn = self.get_connection().await?;
        let key = format!("{}:{}", SESSION_PREFIX, session_id);
        let exists: bool = conn.exists(&key).await?;
        Ok(exists)
    }

    /// Save a webhook request
    #[instrument(skip(self, request), fields(request_id = %request.request_id))]
    pub async fn save_request(
        &self,
        session_id: &str,
        request: &WebhookRequest,
        ttl_seconds: u64,
    ) -> AppResult<()> {
        let mut conn = self.get_connection().await?;

        let request_key = format!("{}:{}:{}", REQUEST_PREFIX, session_id, request.request_id);
        let index_key = format!("{}:{}:requests", SESSION_PREFIX, session_id);

        // Parse timestamp for sorted set score
        let timestamp_ms = request
            .timestamp
            .parse::<DateTime<Utc>>()
            .map(|dt| dt.timestamp_millis())
            .unwrap_or_else(|_| {
                SystemTime::now()
                    .duration_since(UNIX_EPOCH)
                    .unwrap()
                    .as_millis() as i64
            });

        let headers_json = serde_json::to_string(&request.headers)?;

        // Use a pipeline for atomic operations
        redis::pipe()
            .hset(&request_key, "request_id", &request.request_id)
            .hset(&request_key, "method", &request.method)
            .hset(&request_key, "path", &request.path)
            .hset(&request_key, "query_params", &serde_json::to_string(&request.query_params)?)
            .hset(&request_key, "headers", &headers_json)
            .hset(&request_key, "body", &request.body)
            .hset(&request_key, "ip_address", &request.ip_address)
            .hset(&request_key, "user_agent", &request.user_agent)
            .hset(&request_key, "timestamp", &request.timestamp)
            .hset(&request_key, "content_length", request.content_length)
            .expire(&request_key, ttl_seconds as i64)
            .zadd(&index_key, &request.request_id, timestamp_ms)
            .expire(&index_key, ttl_seconds as i64)
            .query_async::<()>(&mut conn)
            .await?;

        // Broadcast to SSE subscribers (in-memory, no Redis pub/sub needed)
        self.broadcast_request(session_id, request).await;

        debug!(
            session_id = %session_id,
            request_id = %request.request_id,
            "Saved webhook request"
        );

        Ok(())
    }

    /// Get requests for a session with pagination
    #[instrument(skip(self))]
    pub async fn get_requests(
        &self,
        session_id: &str,
        limit: usize,
        offset: usize,
    ) -> AppResult<Vec<WebhookRequest>> {
        let mut conn = self.get_connection().await?;
        let index_key = format!("{}:{}:requests", SESSION_PREFIX, session_id);

        // Get request IDs from sorted set (reverse order, newest first)
        let end = if offset + limit > 0 {
            (offset + limit - 1) as isize
        } else {
            0
        };
        let request_ids: Vec<String> = conn.zrevrange(&index_key, offset as isize, end).await?;

        let mut requests = Vec::with_capacity(request_ids.len());

        for request_id in request_ids {
            let request_key = format!("{}:{}:{}", REQUEST_PREFIX, session_id, request_id);
            let data: HashMap<String, String> = conn.hgetall(&request_key).await?;

            if data.is_empty() {
                continue;
            }

            let headers: HashMap<String, String> = data
                .get("headers")
                .and_then(|h| serde_json::from_str(h).ok())
                .unwrap_or_default();

            requests.push(WebhookRequest {
                request_id: data.get("request_id").cloned().unwrap_or_default(),
                method: data.get("method").cloned().unwrap_or_default(),
                path: data.get("path").cloned().unwrap_or_default(),
                query_params: data.get("query_params").and_then(|q| serde_json::from_str(q).ok()).unwrap_or_default(),
                headers,
                body: data.get("body").cloned().unwrap_or_default(),
                ip_address: data.get("ip_address").cloned().unwrap_or_default(),
                user_agent: data.get("user_agent").cloned().unwrap_or_default(),
                timestamp: data.get("timestamp").cloned().unwrap_or_default(),
                content_length: data
                    .get("content_length")
                    .and_then(|s| s.parse().ok())
                    .unwrap_or(0),
            });
        }

        Ok(requests)
    }

    /// Get total request count for a session
    #[instrument(skip(self))]
    pub async fn get_request_count(&self, session_id: &str) -> AppResult<usize> {
        let mut conn = self.get_connection().await?;
        let index_key = format!("{}:{}:requests", SESSION_PREFIX, session_id);
        let count: usize = conn.zcard(&index_key).await?;
        Ok(count)
    }
}

