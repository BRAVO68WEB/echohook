use serde::{Deserialize, Serialize};
use std::collections::HashMap;

/// Session data stored in Redis
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Session {
    pub session_id: String,
    pub created_at: String,
    pub expires_at: String,
}

/// Captured webhook request
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct WebhookRequest {
    pub request_id: String,
    pub method: String,
    pub path: String,
    pub query_params: HashMap<String, String>,
    pub headers: HashMap<String, String>,
    pub body: String,
    pub ip_address: String,
    pub user_agent: String,
    pub timestamp: String,
    pub content_length: usize,
}

/// Response for session creation
#[derive(Debug, Serialize)]
pub struct CreateSessionResponse {
    pub session_id: String,
    pub ingestion_url: String,
    pub stream_url: String,
    pub requests_url: String,
    pub expires_at: String,
}

/// Response for webhook capture
#[derive(Debug, Serialize)]
pub struct CaptureResponse {
    pub status: String,
    pub request_id: String,
}

/// Response for fetching requests
#[derive(Debug, Serialize)]
pub struct RequestsResponse {
    pub session_id: String,
    pub total_requests: usize,
    pub requests: Vec<WebhookRequest>,
}

/// Query parameters for fetching requests
#[derive(Debug, Deserialize)]
pub struct FetchRequestsQuery {
    #[serde(default = "default_limit")]
    pub limit: usize,
    #[serde(default)]
    pub offset: usize,
}

fn default_limit() -> usize {
    100
}

impl FetchRequestsQuery {
    pub fn validated_limit(&self) -> usize {
        self.limit.min(1000).max(1)
    }
}

/// Health check response
#[derive(Debug, Serialize)]
pub struct HealthResponse {
    pub status: String,
    pub redis: String,
    pub version: String,
    pub uptime_seconds: u64,
}

