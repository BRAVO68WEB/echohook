use crate::error::{AppError, AppResult};
use crate::models::{
    CaptureResponse, CreateSessionResponse, FetchRequestsQuery, HealthResponse, RequestsResponse,
    WebhookRequest,
};
use crate::sse::SseStream;
use crate::AppState;
use actix_web::{web, HttpRequest, HttpResponse};
use chrono::Utc;
use std::collections::HashMap;
use std::time::{SystemTime, UNIX_EPOCH};
use tracing::{info, instrument};
use uuid::Uuid;

/// Extract real client IP address from request headers
fn extract_ip_address(req: &HttpRequest) -> String {
    // Priority: X-Real-IP > X-Forwarded-For (first IP) > peer address
    if let Some(real_ip) = req.headers().get("X-Real-IP") {
        if let Ok(ip) = real_ip.to_str() {
            return ip.to_string();
        }
    }

    if let Some(forwarded) = req.headers().get("X-Forwarded-For") {
        if let Ok(ips) = forwarded.to_str() {
            if let Some(first_ip) = ips.split(',').next() {
                return first_ip.trim().to_string();
            }
        }
    }

    req.peer_addr()
        .map(|addr| addr.ip().to_string())
        .unwrap_or_else(|| "unknown".to_string())
}

/// Extract User-Agent header
fn get_user_agent(req: &HttpRequest) -> String {
    req.headers()
        .get("User-Agent")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("unknown")
        .to_string()
}

/// Validate UUID format
fn validate_uuid(session_id: &str) -> AppResult<Uuid> {
    Uuid::parse_str(session_id).map_err(|_| AppError::InvalidUuid(session_id.to_string()))
}

/// Health check endpoint
#[instrument(skip(state))]
pub async fn health_check_handler(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let redis_healthy = state.redis.health_check().await.unwrap_or(false);
    let sse_channels = state.redis.get_sse_channel_count().await;

    let uptime = SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap()
        .as_secs();

    let response = HealthResponse {
        status: if redis_healthy { "healthy" } else { "degraded" }.to_string(),
        redis: if redis_healthy { "connected" } else { "disconnected" }.to_string(),
        version: env!("CARGO_PKG_VERSION").to_string(),
        uptime_seconds: uptime,
        sse_channels,
    };

    Ok(HttpResponse::Ok().json(response))
}

/// Create a new webhook session
#[instrument(skip(state))]
pub async fn create_session_handler(state: web::Data<AppState>) -> AppResult<HttpResponse> {
    let session_id = Uuid::now_v7().to_string();
    let ttl = state.settings.session.ttl_seconds;

    let session = state.redis.create_session(&session_id, ttl).await?;

    let base_url = &state.settings.server.listen_url;
    let response = CreateSessionResponse {
        session_id: session.session_id.clone(),
        ingestion_url: format!("{}/i/{}", base_url, session.session_id),
        stream_url: format!("{}/s/{}", base_url, session.session_id),
        requests_url: format!("{}/r/{}", base_url, session.session_id),
        expires_at: session.expires_at,
    };

    info!(session_id = %session.session_id, "Created new session");

    Ok(HttpResponse::Created().json(response))
}

/// Ingest a webhook request (base path without tail)
#[instrument(skip(state, req, body), fields(method = %req.method(), path = %req.path()))]
pub async fn ingest_webhook_handler_base(
    path: web::Path<String>,
    req: HttpRequest,
    body: web::Bytes,
    state: web::Data<AppState>,
) -> AppResult<HttpResponse> {
    let session_id = path.into_inner();
    ingest_webhook_impl(session_id, req, body, state).await
}

/// Ingest a webhook request (with tail path)
#[instrument(skip(state, req, body), fields(method = %req.method(), path = %req.path()))]
pub async fn ingest_webhook_handler(
    path: web::Path<(String, String)>,
    req: HttpRequest,
    body: web::Bytes,
    state: web::Data<AppState>,
) -> AppResult<HttpResponse> {
    let (session_id, _tail) = path.into_inner();
    ingest_webhook_impl(session_id, req, body, state).await
}

/// Internal implementation for webhook ingestion
async fn ingest_webhook_impl(
    session_id: String,
    req: HttpRequest,
    body: web::Bytes,
    state: web::Data<AppState>,
) -> AppResult<HttpResponse> {

    // Validate UUID format
    validate_uuid(&session_id)?;

    // Check body size
    let max_size = state.settings.server.max_body_size;
    if body.len() > max_size {
        return Err(AppError::PayloadTooLarge {
            size: body.len(),
            limit: max_size,
        });
    }

    // Check if session exists
    if !state.redis.session_exists(&session_id).await? {
        return Err(AppError::SessionNotFound);
    }

    // Check rate limit (max requests per session)
    let current_count = state.redis.get_request_count(&session_id).await?;
    if current_count >= state.settings.session.max_requests_per_session {
        return Err(AppError::RateLimitExceeded(format!(
            "Maximum {} requests per session exceeded",
            state.settings.session.max_requests_per_session
        )));
    }

    // Build request data
    let method = req.method().to_string();
    let path = req.path().to_string();
    let query_params = req.query_string().to_string();

    let mut headers = HashMap::new();
    for (key, value) in req.headers() {
        if let Ok(v) = value.to_str() {
            headers.insert(key.as_str().to_string(), v.to_string());
        }
    }

    let body_str = String::from_utf8_lossy(&body).to_string();
    let ip_address = extract_ip_address(&req);
    let user_agent = get_user_agent(&req);
    let timestamp = Utc::now().to_rfc3339();
    let request_id = Uuid::now_v7().to_string();

    // handle ?a=b , ?a= and ?a
    let query_params = query_params
        .split('&')
        .filter(|s| !s.is_empty())
        .map(|param| {
            let (key, value) = param.split_once('=').unwrap_or((param, ""));
            (key.to_string(), value.to_string())
        })
        .collect::<HashMap<String, String>>();

    let webhook_request = WebhookRequest {
        request_id: request_id.clone(),
        method,
        path,
        query_params,
        headers,
        body: body_str,
        ip_address,
        user_agent,
        timestamp,
        content_length: body.len(),
    };

    // Save to Redis
    let ttl = state.settings.session.ttl_seconds;
    state
        .redis
        .save_request(&session_id, &webhook_request, ttl)
        .await?;

    Ok(HttpResponse::Ok().json(CaptureResponse {
        status: "captured".to_string(),
        request_id,
    }))
}

/// Stream requests via SSE
#[instrument(skip(state, req))]
pub async fn stream_requests_handler(
    path: web::Path<String>,
    req: HttpRequest,
    state: web::Data<AppState>,
) -> AppResult<HttpResponse> {
    let session_id = path.into_inner();

    // Validate UUID format
    validate_uuid(&session_id)?;

    // Check if session exists
    if !state.redis.session_exists(&session_id).await? {
        return Err(AppError::SessionNotFound);
    }

    info!(session_id = %session_id, "Client connected to SSE stream");

    // Get the SSE receiver before creating the stream
    info!(session_id = %session_id, "Requesting SSE channel from Redis client");
    let receiver = state.redis.get_sse_channel(&session_id).await;
    info!(
        session_id = %session_id,
        receiver_len = receiver.len(),
        "Got SSE receiver, creating stream"
    );
    
    // Create SSE stream with the initialized receiver
    let sse_stream = SseStream::new(receiver, session_id.clone());
    info!(session_id = %session_id, "SSE stream created, starting to serve events");

    // Get origin from request for CORS
    let origin = req.headers()
        .get("origin")
        .and_then(|h| h.to_str().ok())
        .unwrap_or("*");

    Ok(HttpResponse::Ok()
        .content_type("text/event-stream")
        .insert_header(("Cache-Control", "no-cache, no-transform"))
        .insert_header(("Connection", "keep-alive"))
        .insert_header(("X-Accel-Buffering", "no")) // Disable nginx buffering
        .insert_header(("Access-Control-Allow-Origin", origin))
        .insert_header(("Access-Control-Allow-Credentials", "true"))
        .insert_header(("Access-Control-Allow-Headers", "Cache-Control"))
        .insert_header(("Access-Control-Expose-Headers", "Content-Type"))
        .streaming(sse_stream))
}

/// Fetch historical requests
#[instrument(skip(state))]
pub async fn fetch_requests_handler(
    path: web::Path<String>,
    query: web::Query<FetchRequestsQuery>,
    state: web::Data<AppState>,
) -> AppResult<HttpResponse> {
    let session_id = path.into_inner();

    // Validate UUID format
    validate_uuid(&session_id)?;

    // Check if session exists
    if !state.redis.session_exists(&session_id).await? {
        return Err(AppError::SessionNotFound);
    }

    let limit = query.validated_limit();
    let offset = query.offset;

    let requests = state.redis.get_requests(&session_id, limit, offset).await?;
    let total = state.redis.get_request_count(&session_id).await?;

    let response = RequestsResponse {
        session_id,
        total_requests: total,
        requests,
    };

    Ok(HttpResponse::Ok().json(response))
}

