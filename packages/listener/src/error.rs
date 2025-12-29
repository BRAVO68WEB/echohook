use actix_web::{http::StatusCode, HttpResponse, ResponseError};
use serde::Serialize;

/// Application-specific error types
#[derive(Debug, thiserror::Error)]
pub enum AppError {
    #[error("Session not found or expired")]
    SessionNotFound,

    #[error("Invalid UUID format: {0}")]
    InvalidUuid(String),

    #[error("Payload too large: {size} bytes exceeds limit of {limit} bytes")]
    PayloadTooLarge { size: usize, limit: usize },

    #[error("Rate limit exceeded: {0}")]
    RateLimitExceeded(String),

    #[error("Redis error: {0}")]
    Redis(#[from] redis::RedisError),

    #[error("Serialization error: {0}")]
    Serialization(#[from] serde_json::Error),

    #[error("Internal server error: {0}")]
    Internal(String),
}

/// Error response body
#[derive(Serialize)]
pub struct ErrorResponse {
    pub error: String,
    pub message: String,
    pub status: u16,
}

impl ResponseError for AppError {
    fn status_code(&self) -> StatusCode {
        match self {
            AppError::SessionNotFound => StatusCode::NOT_FOUND,
            AppError::InvalidUuid(_) => StatusCode::BAD_REQUEST,
            AppError::PayloadTooLarge { .. } => StatusCode::PAYLOAD_TOO_LARGE,
            AppError::RateLimitExceeded(_) => StatusCode::TOO_MANY_REQUESTS,
            AppError::Redis(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Serialization(_) => StatusCode::INTERNAL_SERVER_ERROR,
            AppError::Internal(_) => StatusCode::INTERNAL_SERVER_ERROR,
        }
    }

    fn error_response(&self) -> HttpResponse {
        let status = self.status_code();
        let error_code = match self {
            AppError::SessionNotFound => "session_not_found",
            AppError::InvalidUuid(_) => "invalid_uuid",
            AppError::PayloadTooLarge { .. } => "payload_too_large",
            AppError::RateLimitExceeded(_) => "rate_limit_exceeded",
            AppError::Redis(_) => "redis_error",
            AppError::Serialization(_) => "serialization_error",
            AppError::Internal(_) => "internal_error",
        };

        HttpResponse::build(status).json(ErrorResponse {
            error: error_code.to_string(),
            message: self.to_string(),
            status: status.as_u16(),
        })
    }
}

/// Result type alias for handlers
pub type AppResult<T> = Result<T, AppError>;

