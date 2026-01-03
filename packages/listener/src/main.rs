mod config;
mod error;
mod handlers;
mod models;
mod redis_client;
mod sse;

use actix_cors::Cors;
use actix_web::{http::Method, web, App, HttpServer};
use std::sync::Arc;
use std::time::Duration;
use tracing::{debug, error, info, warn};
use tracing_actix_web::TracingLogger;

use crate::config::Settings;
use crate::handlers::{
    create_session_handler, fetch_requests_handler, health_check_handler,
    ingest_webhook_handler, ingest_webhook_handler_base, stream_requests_handler,
};
use crate::redis_client::RedisClient;

/// Application state shared across all handlers
pub struct AppState {
    pub redis: Arc<RedisClient>,
    pub settings: Arc<Settings>,
}

#[actix_web::main]
async fn main() -> anyhow::Result<()> {
    // Load environment variables from .env file (if exists)
    dotenvy::dotenv().ok();

    // Initialize logging
    init_tracing();

    // Load configuration
    let settings = Settings::load().map_err(|e| {
        eprintln!("Failed to load settings: {}", e);
        e
    })?;
    let settings = Arc::new(settings);

    info!(
        server_host = %settings.server.host,
        server_port = %settings.server.port,
        redis_url = %settings.redis.url,
        "Starting webhook listener server"
    );

    // Initialize Redis client with retry logic
    let mut redis_client = None;
    let mut retries = 0;
    const MAX_RETRIES: u32 = 10;
    const RETRY_DELAY: u64 = 2; // seconds
    
    while redis_client.is_none() && retries < MAX_RETRIES {
        match RedisClient::new(&settings.redis).await {
            Ok(client) => {
                info!("Successfully connected to Redis");
                redis_client = Some(client);
            }
            Err(e) => {
                retries += 1;
                if retries >= MAX_RETRIES {
                    eprintln!("Failed to connect to Redis at {} after {} attempts: {}", settings.redis.url, MAX_RETRIES, e);
                    return Err(anyhow::anyhow!("Redis connection failed: {}", e));
                }
                eprintln!("Failed to connect to Redis (attempt {}/{}): {}. Retrying in {}s...", 
                    retries, MAX_RETRIES, e, RETRY_DELAY);
                tokio::time::sleep(tokio::time::Duration::from_secs(RETRY_DELAY)).await;
            }
        }
    }
    
    let redis_client = match redis_client {
        Some(client) => Arc::new(client),
        None => {
            return Err(anyhow::anyhow!("Failed to initialize Redis client after {} attempts", MAX_RETRIES));
        }
    };

    // Store API URL in Redis for frontend discovery
    let api_url = settings.server.listen_url.clone();
    if let Err(e) = redis_client.set_api_url(&api_url).await {
        warn!("Failed to store API URL in Redis: {}", e);
    } else {
        info!(api_url = %api_url, "Stored API URL in Redis for frontend discovery");
    }

    // Create shared application state
    let app_state = web::Data::new(AppState {
        redis: redis_client.clone(),
        settings: settings.clone(),
    });

    // Spawn background task for maintenance (SSE cleanup + Redis keepalive)
    let maintenance_redis = redis_client.clone();
    let maintenance_api_url = api_url.clone();
    tokio::spawn(async move {
        let mut interval = tokio::time::interval(Duration::from_secs(60)); // Every minute
        let mut api_url_refresh_counter = 0u32;
        
        loop {
            interval.tick().await;
            
            // Clean up stale SSE channels
            let removed = maintenance_redis.cleanup_stale_sse_channels().await;
            let channel_count = maintenance_redis.get_sse_channel_count().await;
            debug!(
                removed = removed,
                active_channels = channel_count,
                "Maintenance: SSE channel cleanup completed"
            );
            
            // Redis keepalive ping (also verifies connection health)
            match maintenance_redis.health_check().await {
                Ok(true) => {
                    debug!("Maintenance: Redis health check passed");
                }
                Ok(false) => {
                    warn!("Maintenance: Redis health check returned unexpected response");
                }
                Err(e) => {
                    error!("Maintenance: Redis health check failed: {}. ConnectionManager should auto-reconnect.", e);
                }
            }
            
            // Refresh API URL in Redis every 10 minutes (600 seconds / 60 = 10 iterations)
            api_url_refresh_counter += 1;
            if api_url_refresh_counter >= 10 {
                api_url_refresh_counter = 0;
                if let Err(e) = maintenance_redis.set_api_url(&maintenance_api_url).await {
                    warn!("Maintenance: Failed to refresh API URL in Redis: {}", e);
                } else {
                    debug!("Maintenance: Refreshed API URL in Redis");
                }
            }
        }
    });

    // Start HTTP server
    let server_host = settings.server.host.clone();
    let server_port = settings.server.port;
    let cors_origins = settings.server.cors_allowed_origins.clone();

    info!("Binding to {}:{}", server_host, server_port);
    
    HttpServer::new(move || {
        // Configure CORS
        let cors = build_cors(&cors_origins);

        App::new()
            .app_data(app_state.clone())
            .app_data(web::PayloadConfig::new(settings.server.max_body_size))
            .wrap(TracingLogger::default())
            .wrap(cors)
            // Health check endpoint
            .route("/health", web::get().to(health_check_handler))
            // Session creation
            .route("/c", web::post().to(create_session_handler))
            // SSE stream
            .route("/s/{session_id}", web::get().to(stream_requests_handler))
            // Fetch historical requests
            .route("/r/{session_id}", web::get().to(fetch_requests_handler))
            // Webhook ingestion (all HTTP methods) - base path
            .service(
                web::resource("/i/{session_id}")
                    .route(web::get().to(ingest_webhook_handler_base))
                    .route(web::post().to(ingest_webhook_handler_base))
                    .route(web::put().to(ingest_webhook_handler_base))
                    .route(web::patch().to(ingest_webhook_handler_base))
                    .route(web::delete().to(ingest_webhook_handler_base))
                    .route(web::head().to(ingest_webhook_handler_base))
                    .route(web::method(Method::OPTIONS).to(ingest_webhook_handler_base)),
            )
            // Catch-all for ingestion with sub-paths
            .service(
                web::resource("/i/{session_id}/{tail:.*}")
                    .route(web::get().to(ingest_webhook_handler))
                    .route(web::post().to(ingest_webhook_handler))
                    .route(web::put().to(ingest_webhook_handler))
                    .route(web::patch().to(ingest_webhook_handler))
                    .route(web::delete().to(ingest_webhook_handler))
                    .route(web::head().to(ingest_webhook_handler))
                    .route(web::method(Method::OPTIONS).to(ingest_webhook_handler)),
            )
    })
    .bind((server_host.as_str(), server_port))
    .map_err(|e| {
        eprintln!("Failed to bind to {}:{}: {}", server_host, server_port, e);
        anyhow::anyhow!("Failed to bind server: {}", e)
    })?
    .workers(num_cpus::get())
    .shutdown_timeout(30)
    .run()
    .await
    .map_err(|e| {
        eprintln!("Server error: {}", e);
        anyhow::anyhow!("Server error: {}", e)
    })?;

    info!("Server shutting down");
    Ok(())
}

/// Initialize tracing/logging subscriber
fn init_tracing() {
    use tracing_subscriber::{layer::SubscriberExt, util::SubscriberInitExt, EnvFilter};

    let env_filter = EnvFilter::try_from_default_env().unwrap_or_else(|_| EnvFilter::new("info"));

    tracing_subscriber::registry()
        .with(env_filter)
        .with(tracing_subscriber::fmt::layer().with_target(true))
        .init();
}

/// Build CORS configuration
fn build_cors(allowed_origins: &str) -> Cors {
    if allowed_origins == "*" {
        Cors::permissive()
    } else {
        let origins: Vec<&str> = allowed_origins.split(',').map(|s| s.trim()).collect();
        let mut cors = Cors::default()
            .allowed_methods(vec!["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"])
            .allowed_headers(vec![
                actix_web::http::header::CONTENT_TYPE,
                actix_web::http::header::AUTHORIZATION,
                actix_web::http::header::ACCEPT,
            ])
            .max_age(3600);

        for origin in origins {
            cors = cors.allowed_origin(origin);
        }

        cors
    }
}
