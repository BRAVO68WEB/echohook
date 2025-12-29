mod config;
mod error;
mod handlers;
mod models;
mod redis_client;
mod sse;

use actix_cors::Cors;
use actix_web::{http::Method, web, App, HttpServer};
use std::sync::Arc;
use tracing::info;
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

    // Initialize Redis client
    let redis_client = RedisClient::new(&settings.redis).await.map_err(|e| {
        eprintln!("Failed to connect to Redis at {}: {}", settings.redis.url, e);
        e
    })?;
    let redis_client = Arc::new(redis_client);

    // Create shared application state
    let app_state = web::Data::new(AppState {
        redis: redis_client,
        settings: settings.clone(),
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
