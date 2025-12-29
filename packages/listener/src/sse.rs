use crate::models::WebhookRequest;
use actix_web::web::Bytes;
use chrono::Utc;
use futures::{Stream, StreamExt};
use serde_json::json;
use std::pin::Pin;
use std::task::{Context, Poll};
use std::time::Duration;
use tokio::sync::broadcast;
use tokio::time::interval;
use tokio_stream::wrappers::{BroadcastStream, IntervalStream};
use tokio_stream::wrappers::errors::BroadcastStreamRecvError;
use tracing::{debug, info, warn};

/// Ping interval for SSE keep-alive (30 seconds)
const PING_INTERVAL: Duration = Duration::from_secs(30);

/// SSE stream for real-time webhook notifications
pub struct SseStream {
    event_stream:
        Pin<Box<dyn Stream<Item = Result<Bytes, actix_web::Error>> + Send + Sync + 'static>>,
}

impl SseStream {
    /// Create a new SSE stream with an already-initialized receiver
    pub fn new(receiver: broadcast::Receiver<WebhookRequest>, session_id: String) -> Self {
        info!(
            session_id = %session_id,
            receiver_count = receiver.len(),
            "Creating new SSE stream"
        );

        // Stream of webhook requests from broadcast channel
        let request_stream = BroadcastStream::new(receiver).filter_map({
            let session_id = session_id.clone();
            move |result| {
                let session_id = session_id.clone();
                async move {
                    match result {
                        Ok(request) => {
                            info!(
                                session_id = %session_id,
                                request_id = %request.request_id,
                                method = %request.method,
                                "Broadcast request received, sending via SSE"
                            );
                            let data = serde_json::to_string(&request).unwrap_or_default();
                            Some(Ok(Bytes::from(format!(
                                "event: request\ndata: {}\n\n",
                                data
                            ))))
                        }
                        Err(BroadcastStreamRecvError::Lagged(count)) => {
                            warn!(
                                session_id = %session_id,
                                lagged = count,
                                "SSE receiver lagged, messages dropped"
                            );
                            None
                        }
                    }
                }
            }
        });

        // Stream of periodic pings
        let ping_stream = IntervalStream::new(interval(PING_INTERVAL)).map({
            move |_| {
                let ping_data = json!({ "timestamp": Utc::now().to_rfc3339() });
                debug!("Sending SSE ping");
                Ok(Bytes::from(format!(
                    "event: ping\ndata: {}\n\n",
                    ping_data
                )))
            }
        });

        // Initial ping once
        let initial_ping = futures::stream::once(async {
            let ping_data = json!({ "timestamp": Utc::now().to_rfc3339() });
            Ok(Bytes::from(format!(
                "event: ping\ndata: {}\n\n",
                ping_data
            )))
        });

        // Combine: initial ping -> then requests and pings interleaved
        let event_stream = initial_ping.chain(futures::stream::select(request_stream, ping_stream));

        Self {
            event_stream: Box::pin(event_stream),
        }
    }
}

impl Stream for SseStream {
    type Item = Result<Bytes, actix_web::Error>;

    fn poll_next(mut self: Pin<&mut Self>, cx: &mut Context<'_>) -> Poll<Option<Self::Item>> {
        self.event_stream.as_mut().poll_next(cx)
    }
}
