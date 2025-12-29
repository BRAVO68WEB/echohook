# Build stage
FROM rust:1.92.0-alpine AS builder

# Install build dependencies
RUN apk add --no-cache musl-dev openssl-dev openssl-libs-static

WORKDIR /app

# Copy workspace Cargo.toml if it exists
COPY Cargo.toml* ./

# Copy Cargo files for dependency caching
COPY packages/listener/Cargo.toml ./packages/listener/
COPY Cargo.lock* ./

# Create a dummy main.rs to cache dependencies
RUN mkdir -p packages/listener/src && \
    echo "fn main() {}" > packages/listener/src/main.rs

# Build dependencies (this layer will be cached)
# Build from workspace root to handle workspace properly
RUN cargo build --release --package listener || true

# Remove dummy main.rs and copy actual source
RUN rm -rf packages/listener/src
COPY packages/listener/src ./packages/listener/src

# Build the actual application from workspace root
RUN cargo build --release --package listener

# Verify binary exists
RUN ls -la /app/target/release/listener || \
    (echo "Binary not found! Checking alternative locations:" && \
     find /app -name "listener" -type f 2>/dev/null || true && \
     find /app/target -name "listener" -type f 2>/dev/null || true && \
     exit 1)

# Runtime stage
FROM alpine:latest

# Install runtime dependencies
RUN apk add --no-cache ca-certificates openssl libgcc curl

WORKDIR /app

# Copy the binary from builder (workspace builds to root target/)
COPY --from=builder /app/target/release/listener /app/listener

# Verify binary was copied and set execute permissions
RUN chmod +x /app/listener && \
    ls -la /app/listener

# Create non-root user
RUN addgroup -g 1000 appuser && \
    adduser -D -u 1000 -G appuser appuser

USER appuser

EXPOSE 8080

ENV RUST_LOG=info
ENV SERVER_HOST=0.0.0.0
ENV SERVER_PORT=8080
ENV REDIS_URL=redis://redis:6379

# Use exec form to ensure proper signal handling
CMD ["/app/listener"]

