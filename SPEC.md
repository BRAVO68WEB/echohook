# Webhook Testing App Specification

## Overview
A real-time webhook testing and inspection tool that allows developers to create temporary endpoints for testing webhook integrations. The system captures and displays all incoming HTTP requests with full details. 

## Architecture

### Technology Stack
- **Backend**: Rust with Actix-web framework
- **Frontend**: Next.js (React)
- **Database**: Redis for temporary data persistence
- **Protocol**: Server-Sent Events (SSE) for real-time updates

---

## Backend Specification (Rust + Actix)

### Dependencies
```toml
[dependencies]
actix-web = "4"
actix-cors = "0.7"
redis = { version = "1.0.2", features = ["tokio-comp", "connection-manager"] }
tokio = { version = "1", features = ["full"] }
serde = { version = "1.0", features = ["derive"] }
serde_json = "1.0"
uuid = { version = "1.6", features = ["v7", "serde"] }
chrono = { version = "0.4", features = ["serde"] }
```

### API Endpoints

#### 1. Create Session
- **Endpoint**: `POST /c`
- **Description**: Creates a new webhook session
- **Response**:
  ```json
  {
    "session_id": "01936d3f-8c63-7890-abcd-ef1234567890",
    "ingestion_url": "https://<LISTEN_URL>/i/01936d3f-8c63-7890-abcd-ef1234567890",
    "stream_url": "https://<LISTEN_URL>/s/01936d3f-8c63-7890-abcd-ef1234567890",
    "requests_url": "https://<LISTEN_URL>/r/01936d3f-8c63-7890-abcd-ef1234567890",
    "expires_at": "2025-12-27T15:30:00Z"
  }
  ```
- **Status Code**: `201 Created`

#### 2. Webhook Ingestion
- **Endpoint**: `ANY /i/<uuid>`
- **Methods**: `GET, POST, PUT, PATCH, DELETE, HEAD, OPTIONS`
- **Description**: Captures all incoming webhook requests
- **Captured Data**:
  - UUID v7 session ID
  - Full request path (including query parameters)
  - HTTP method
  - Headers (all key-value pairs)
  - Body/Payload (raw bytes + parsed JSON if applicable)
  - IP address (real client IP, check X-Forwarded-For)
  - User-Agent
  - Timestamp (ISO 8601)
  - Request ID (generated UUIDv7 for each request)
- **Response**:  
  ```json
  {
    "status": "captured",
    "request_id": "01936d40-1234-7890-abcd-ef1234567890"
  }
  ```
- **Status Code**: `200 OK`

#### 3. Stream Requests (SSE)
- **Endpoint**: `GET /s/<uuid>`
- **Description**: Server-Sent Events stream for real-time webhook notifications
- **Headers**:  
  - `Content-Type: text/event-stream`
  - `Cache-Control: no-cache`
  - `Connection: keep-alive`
- **Event Format**:
  ```
  event: request
  data: {"request_id":"... ","method":"POST","path":"/i/...","timestamp":"... "}

  event: ping
  data: {"timestamp":"2025-12-27T12:30:00Z"}
  ```
- **Keep-Alive**: Send ping events every 30 seconds
- **Error Handling**: Return `404` if session doesn't exist or expired

#### 4. Fetch Historical Requests
- **Endpoint**:  `GET /r/<uuid>`
- **Description**: Retrieves all captured requests for a session
- **Query Parameters**:
  - `limit` (optional, default:  100, max: 1000)
  - `offset` (optional, default: 0)
- **Response**:
  ```json
  {
    "session_id": "01936d3f-8c63-7890-abcd-ef1234567890",
    "total_requests": 42,
    "requests": [
      {
        "request_id": "01936d40-1234-7890-abcd-ef1234567890",
        "method": "POST",
        "path": "/i/01936d3f-8c63-7890-abcd-ef1234567890/webhook/payment",
        "query_params": "event=success&amount=100",
        "headers": {
          "content-type": "application/json",
          "user-agent": "GitHub-Hookshot/abc123",
          "x-github-event": "push"
        },
        "body":  "{\"action\": \"opened\",\"number\":1}",
        "ip_address": "192.0.2.1",
        "user_agent": "GitHub-Hookshot/abc123",
        "timestamp": "2025-12-27T12:15:30. 123Z",
        "content_length": 1234
      }
    ]
  }
  ```
- **Status Code**: `200 OK` or `404 Not Found`

---

## Redis Data Schema

### Session Key
- **Key**: `session:<uuid>`
- **Type**: Hash
- **TTL**: 3 hours (10800 seconds)
- **Fields**:
  ```
  session_id: "01936d3f-8c63-7890-abcd-ef1234567890"
  created_at: "2025-12-27T12:00:00Z"
  expires_at: "2025-12-27T15:00:00Z"
  ```

### Request Key
- **Key**: `request:<session_uuid>:<request_id>`
- **Type**: Hash
- **TTL**: 3 hours (10800 seconds)
- **Fields**:
  ```
  request_id: "..."
  method: "POST"
  path: "/i/. ../webhook"
  query_params: "..."
  headers: "{...json...}"
  body: "..."
  ip_address: "192.0.2.1"
  user_agent: "..."
  timestamp: "..."
  content_length: "1234"
  ```

### Request Index
- **Key**: `session:<uuid>: requests`
- **Type**: Sorted Set (ZSET)
- **TTL**: 3 hours (10800 seconds)
- **Score**: Unix timestamp (milliseconds)
- **Member**: `request_id`
- **Purpose**: Maintain chronological order and enable pagination

### SSE Subscribers
- **Key**: `session:<uuid>:subscribers`
- **Type**: Redis Pub/Sub channel
- **Purpose**: Broadcast new requests to connected SSE clients

---

## Frontend Specification (Next.js)

### Pages/Routes

#### 1. Home Page (`/`)
- **Description**: Landing page with session creation
- **Components**:
  - Hero section explaining the tool
  - "Create New Session" button
  - Recently created sessions (localStorage)

#### 2. Session Page (`/session/[uuid]`)
- **Description**: Main webhook inspection interface
- **Features**:
  - Display session URL for webhook ingestion
  - Copy-to-clipboard button for webhook URL
  - Real-time request list (via SSE)
  - Request details panel
  - Session expiration countdown timer
  - Filter/search requests by method, path, headers

### Components

#### SessionCreator
- Button to create new session
- Calls `POST /c` endpoint
- Redirects to session page on success

#### WebhookURL Display
- Shows the ingestion URL
- Copy button with visual feedback
- QR code for mobile testing (optional)

#### RequestList
- Real-time updating list of captured requests
- Shows:  timestamp, method, path, status badge
- Click to view details
- Virtual scrolling for performance (if >100 requests)

#### RequestDetails
- Full request information display
- Tabs:  Headers, Body, Raw
- Syntax highlighting for JSON payloads
- Pretty-print/raw toggle for body
- Copy individual sections

#### SSEClient Hook
```typescript
useSSE(sessionId: string) => {
  requests: Request[]
  isConnected: boolean
  error: Error | null
}
```

### Data Fetching

#### Initial Load
```typescript
// Fetch historical requests on component mount
const response = await fetch(`https://<LISTEN_URL>/r/${uuid}`)
const { requests } = await response.json()
```

#### Real-time Updates
```typescript
// Connect to SSE stream
const eventSource = new EventSource(`https://<LISTEN_URL>/s/${uuid}`)

eventSource.addEventListener('request', (event) => {
  const newRequest = JSON.parse(event. data)
  // Prepend to request list
})

eventSource.addEventListener('ping', (event) => {
  // Update connection status
})
```

### State Management
- React Context or Zustand for global state
- Local state for UI interactions
- localStorage for session history (last 10 sessions)

---

## Data Models

### Session
```rust
#[derive(Serialize, Deserialize)]
struct Session {
    session_id: String,        // UUIDv7
    created_at: String,         // ISO 8601
    expires_at: String,         // ISO 8601
}
```

### WebhookRequest
```rust
#[derive(Serialize, Deserialize, Clone)]
struct WebhookRequest {
    request_id: String,         // UUIDv7
    method: String,             // GET, POST, etc.
    path: String,               // Full path with query
    query_params: String,       // Raw query string
    headers: HashMap<String, String>,
    body: Option<Vec<u8>>,      // Raw bytes
    ip_address: String,         // Client IP
    user_agent: String,         // User-Agent header
    timestamp: String,          // ISO 8601
    content_length: usize,      // Body size in bytes
}
```

---

## Security Considerations

### Rate Limiting
- Maximum 1000 requests per session
- Maximum 10 sessions per IP per hour (optional)
- Maximum body size: 10 MB per request

### Input Validation
- Validate UUID format for all session parameters
- Sanitize all user input before storage
- Limit header size (8 KB total)

### CORS
- Enable CORS for frontend domain
- Allow all origins for ingestion endpoints (`/i/*`)

### IP Address Extraction
```rust
// Priority order for real IP: 
1. X-Real-IP header
2. X-Forwarded-For header (first IP)
3. Connection peer address
```

---

## Error Handling

### Backend Error Responses
```json
{
  "error":  "session_not_found",
  "message":  "Session has expired or does not exist",
  "status": 404
}
```

### Common Error Codes
- `400`: Invalid UUID format
- `404`: Session not found or expired
- `413`: Payload too large
- `429`: Rate limit exceeded
- `500`: Internal server error (Redis connection failure)

---

## Performance Requirements

### Backend
- Handle 1000 concurrent SSE connections per instance
- Process webhook requests within 50ms (excluding network latency)
- Redis connection pooling (minimum 10 connections)

### Frontend
- Initial page load < 2 seconds
- SSE reconnection with exponential backoff
- Debounce search/filter operations (300ms)

---

## Deployment Considerations

### Environment Variables
```bash
# Backend
REDIS_URL=redis://localhost:6379
SERVER_HOST=0.0.0.0
SERVER_PORT=8080
SESSION_TTL=10800  # 3 hours in seconds
MAX_BODY_SIZE=10485760  # 10 MB
CORS_ALLOWED_ORIGINS=https://<FE_URL>

# Frontend
NEXT_PUBLIC_API_URL=https://<LISTEN_URL>
```

### Health Check
- **Endpoint**: `GET /health`
- **Response**:  
  ```json
  {
    "status": "healthy",
    "redis":  "connected",
    "uptime": 3600
  }
  ```

---

## Future Enhancements (Optional)
- Custom response configuration (status code, headers, body)
- Request replay functionality
- Webhook forwarding to external URLs
- Export requests as HAR/JSON/CSV
- Webhook signature validation
- Basic authentication for session access
- Custom session TTL (1 hour to 24 hours)
- Webhook request simulation/testing tool

---

## Development Workflow

### Backend Testing
```bash
cargo test
cargo run
```

### Frontend Testing
```bash
npm run dev
npm run build
npm run lint
```

### Local Development URLs
- Backend: `http://localhost:8080`
- Frontend: `http://localhost:3000`
- Redis: `localhost:6379`

---

## Success Metrics
- Session creation < 100ms
- Webhook capture latency < 50ms
- SSE message delivery < 200ms
- Support 10,000 active sessions simultaneously
- 99.9% uptime for webhook ingestion