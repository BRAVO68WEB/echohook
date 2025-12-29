use serde::Deserialize;
use std::env;

/// Application configuration
#[derive(Debug, Clone, Deserialize)]
pub struct Settings {
    pub server: ServerSettings,
    pub redis: RedisSettings,
    pub session: SessionSettings,
}

#[derive(Debug, Clone, Deserialize)]
pub struct ServerSettings {
    pub host: String,
    pub port: u16,
    pub listen_url: String,
    pub max_body_size: usize,
    pub cors_allowed_origins: String,
}

#[derive(Debug, Clone, Deserialize)]
pub struct RedisSettings {
    pub url: String,
    pub pool_size: usize,
}

#[derive(Debug, Clone, Deserialize)]
pub struct SessionSettings {
    pub ttl_seconds: u64,
    pub max_requests_per_session: usize,
}

impl Settings {
    /// Load configuration from environment variables
    pub fn load() -> anyhow::Result<Self> {
        let server_port: u16 = env::var("SERVER_PORT")
            .unwrap_or_else(|_| "8080".to_string())
            .parse()
            .unwrap_or(8080);

        let settings = Settings {
            server: ServerSettings {
                host: env::var("SERVER_HOST").unwrap_or_else(|_| "0.0.0.0".to_string()),
                port: server_port,
                listen_url: env::var("LISTEN_URL")
                    .unwrap_or_else(|_| format!("http://localhost:{}", server_port)),
                max_body_size: env::var("MAX_BODY_SIZE")
                    .unwrap_or_else(|_| "10485760".to_string())
                    .parse()
                    .unwrap_or(10_485_760), // 10 MB
                cors_allowed_origins: env::var("CORS_ALLOWED_ORIGINS")
                    .unwrap_or_else(|_| "*".to_string()),
            },
            redis: RedisSettings {
                url: env::var("REDIS_URL").unwrap_or_else(|_| "redis://localhost:6379".to_string()),
                pool_size: env::var("REDIS_POOL_SIZE")
                    .unwrap_or_else(|_| "10".to_string())
                    .parse()
                    .unwrap_or(10),
            },
            session: SessionSettings {
                ttl_seconds: env::var("SESSION_TTL")
                    .unwrap_or_else(|_| "10800".to_string())
                    .parse()
                    .unwrap_or(10800), // 3 hours
                max_requests_per_session: env::var("MAX_REQUESTS_PER_SESSION")
                    .unwrap_or_else(|_| "1000".to_string())
                    .parse()
                    .unwrap_or(1000),
            },
        };

        Ok(settings)
    }
}

