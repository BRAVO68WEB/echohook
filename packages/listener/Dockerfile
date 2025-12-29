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

CMD ["cargo", "run", "--release", "--package", "listener"]
