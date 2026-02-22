# Build stage - use nightly for edition 2024 support
FROM rustlang/rust:nightly-slim AS builder

# Install build dependencies
RUN apt-get update && apt-get install -y pkg-config libssl-dev && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy all Cargo files
COPY Cargo.toml ./
COPY Cargo.lock ./
COPY src ./src

# Build the actual application
RUN cargo build --release

# Verify binary size is reasonable (should be >5MB with all deps)
RUN ls -la /app/target/release/listener && \
    SIZE=$(stat -c%s /app/target/release/listener) && \
    if [ "$SIZE" -lt 5000000 ]; then echo "Binary too small ($SIZE bytes), rebuild failed"; exit 1; fi

# Runtime stage
FROM debian:bookworm-slim

# Install runtime dependencies
RUN apt-get update && apt-get install -y ca-certificates libssl3 curl && rm -rf /var/lib/apt/lists/*

WORKDIR /app

# Copy the binary from builder
COPY --from=builder /app/target/release/listener /app/listener

# Verify binary was copied and set execute permissions
RUN chmod +x /app/listener && \
    ls -la /app/listener

# Create non-root user
RUN groupadd -g 1000 appuser && \
    useradd -u 1000 -g appuser appuser

USER appuser

EXPOSE 8080

ENV RUST_LOG=info
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=8080
ENV REDIS_URL=redis://redis:6379

CMD ["/app/listener"]
