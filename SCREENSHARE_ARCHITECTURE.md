# Screen Sharing Architecture Diagram

## System Architecture

```
┌─────────────────────────────────────────────────────────────────────┐
│                         ALGOCDK PLATFORM                             │
└─────────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────┐
│                          FRONTEND LAYER                              │
├─────────────────────────────────────────────────────────────────────┤
│                                                                       │
│  ┌──────────────────────┐         ┌──────────────────────┐         │
│  │   Admin Interface    │         │   Viewer Interface   │         │
│  │  (screenshare-admin) │         │ (screenshare-viewer) │         │
│  ├──────────────────────┤         ├──────────────────────┤         │
│  │ • Start/Stop Session │         │ • Browse Sessions    │         │
│  │ • Screen Preview     │         │ • Join Session       │         │
│  │ • Participant List   │         │ • View Screen        │         │
│  │ • Chat Interface     │         │ • Chat Interface     │         │
│  └──────────┬───────────┘         └──────────┬───────────┘         │
│             │                                 │                      │
│             │  getDisplayMedia()              │  Canvas Rendering   │
│             │  Screen Capture                 │  Image Display      │
│             │                                 │                      │
└─────────────┼─────────────────────────────────┼──────────────────────┘
              │                                 │
              │ WebSocket (WS/WSS)              │ WebSocket (WS/WSS)
              │ + JWT Auth                      │ + JWT Auth
              │                                 │
┌─────────────┴─────────────────────────────────┴──────────────────────┐
│                        WEBSOCKET LAYER                                │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│                    ┌─────────────────────────┐                       │
│                    │   WebSocket Upgrader    │                       │
│                    │  (gorilla/websocket)    │                       │
│                    └────────────┬────────────┘                       │
│                                 │                                     │
│                    ┌────────────▼────────────┐                       │
│                    │   ScreenShareHub        │                       │
│                    │  (Connection Manager)   │                       │
│                    ├─────────────────────────┤                       │
│                    │ • Session Rooms Map     │                       │
│                    │ • Admin Connections     │                       │
│                    │ • Viewer Connections    │                       │
│                    │ • Message Broadcasting  │                       │
│                    └────────────┬────────────┘                       │
│                                 │                                     │
└─────────────────────────────────┼─────────────────────────────────────┘
                                  │
                                  │ Message Routing
                                  │
┌─────────────────────────────────┼─────────────────────────────────────┐
│                         HANDLER LAYER                                 │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌──────────────────────────────────────────────────────────────┐   │
│  │              ScreenShareHandler                               │   │
│  ├──────────────────────────────────────────────────────────────┤   │
│  │                                                               │   │
│  │  Admin Endpoints:                  User Endpoints:           │   │
│  │  • StartScreenShareSession         • GetActiveSessions       │   │
│  │  • StopScreenShareSession          • GetSessionMessages      │   │
│  │  • GetSessionParticipants                                    │   │
│  │                                                               │   │
│  │  WebSocket Handler:                                          │   │
│  │  • ScreenShareWebSocket                                      │   │
│  │    - Authenticate user                                       │   │
│  │    - Route messages                                          │   │
│  │    - Handle screen_data, chat, notifications                │   │
│  │                                                               │   │
│  └───────────────────────────┬──────────────────────────────────┘   │
│                              │                                        │
└──────────────────────────────┼────────────────────────────────────────┘
                               │
                               │ Database Operations
                               │
┌──────────────────────────────┼────────────────────────────────────────┐
│                        DATABASE LAYER                                 │
├───────────────────────────────────────────────────────────────────────┤
│                                                                        │
│  ┌────────────────────┐  ┌──────────────────────┐  ┌──────────────┐ │
│  │ ScreenShareSession │  │ ScreenShareParticipant│  │ ScreenShare  │ │
│  │                    │  │                       │  │   Message    │ │
│  ├────────────────────┤  ├──────────────────────┤  ├──────────────┤ │
│  │ • id               │  │ • id                 │  │ • id         │ │
│  │ • admin_id         │  │ • session_id         │  │ • session_id │ │
│  │ • admin_name       │  │ • user_id            │  │ • user_id    │ │
│  │ • is_active        │  │ • username           │  │ • username   │ │
│  │ • started_at       │  │ • joined_at          │  │ • message    │ │
│  │ • ended_at         │  │ • left_at            │  │ • created_at │ │
│  │ • created_at       │  │ • is_active          │  │              │ │
│  │ • updated_at       │  │ • created_at         │  │              │ │
│  │                    │  │ • updated_at         │  │              │ │
│  └────────────────────┘  └──────────────────────┘  └──────────────┘ │
│                                                                        │
│                        SQLite Database (GORM)                         │
└────────────────────────────────────────────────────────────────────────┘
```

## Message Flow Diagram

### Admin Starting Session

```
┌──────────┐                ┌──────────┐              ┌──────────┐
│  Admin   │                │  Server  │              │ Database │
│ Browser  │                │ (Gin/Go) │              │ (SQLite) │
└────┬─────┘                └────┬─────┘              └────┬─────┘
     │                           │                         │
     │ 1. POST /api/admin/       │                         │
     │    screenshare/start      │                         │
     ├──────────────────────────>│                         │
     │                           │                         │
     │                           │ 2. Create Session       │
     │                           ├────────────────────────>│
     │                           │                         │
     │                           │ 3. Session Created      │
     │                           │<────────────────────────┤
     │                           │                         │
     │ 4. Session Response       │                         │
     │<──────────────────────────┤                         │
     │                           │                         │
     │ 5. getDisplayMedia()      │                         │
     │    (Screen Capture)       │                         │
     │<──────────────────────────┤                         │
     │                           │                         │
     │ 6. WS Connect             │                         │
     │    /ws/screenshare        │                         │
     ├──────────────────────────>│                         │
     │                           │                         │
     │ 7. WS Connected           │                         │
     │<──────────────────────────┤                         │
     │                           │                         │
     │ 8. Stream Frames          │                         │
     │    (screen_data)          │                         │
     ├──────────────────────────>│                         │
     │                           │                         │
```

### User Joining Session

```
┌──────────┐     ┌──────────┐     ┌──────────┐     ┌──────────┐
│  Viewer  │     │  Server  │     │ Database │     │  Admin   │
│ Browser  │     │ (Gin/Go) │     │ (SQLite) │     │ Browser  │
└────┬─────┘     └────┬─────┘     └────┬─────┘     └────┬─────┘
     │                │                 │                 │
     │ 1. GET /api/   │                 │                 │
     │    screenshare/│                 │                 │
     │    sessions    │                 │                 │
     ├───────────────>│                 │                 │
     │                │                 │                 │
     │                │ 2. Query Active │                 │
     │                │    Sessions     │                 │
     │                ├────────────────>│                 │
     │                │                 │                 │
     │                │ 3. Sessions     │                 │
     │                │<────────────────┤                 │
     │                │                 │                 │
     │ 4. Sessions    │                 │                 │
     │    List        │                 │                 │
     │<───────────────┤                 │                 │
     │                │                 │                 │
     │ 5. WS Connect  │                 │                 │
     │    /ws/        │                 │                 │
     │    screenshare │                 │                 │
     ├───────────────>│                 │                 │
     │                │                 │                 │
     │                │ 6. Save         │                 │
     │                │    Participant  │                 │
     │                ├────────────────>│                 │
     │                │                 │                 │
     │                │ 7. Notify Admin │                 │
     │                │    (user_joined)│                 │
     │                ├─────────────────┼────────────────>│
     │                │                 │                 │
     │ 8. Receive     │                 │                 │
     │    Screen Data │                 │                 │
     │<───────────────┤                 │                 │
     │                │                 │                 │
```

### Chat Message Flow

```
┌──────────┐          ┌──────────┐          ┌──────────┐          ┌──────────┐
│  User A  │          │  Server  │          │ Database │          │  User B  │
└────┬─────┘          └────┬─────┘          └────┬─────┘          └────┬─────┘
     │                     │                     │                     │
     │ 1. Send Chat        │                     │                     │
     │    Message          │                     │                     │
     ├────────────────────>│                     │                     │
     │                     │                     │                     │
     │                     │ 2. Save Message     │                     │
     │                     ├────────────────────>│                     │
     │                     │                     │                     │
     │                     │ 3. Broadcast to All │                     │
     │                     │    Participants     │                     │
     │                     ├─────────────────────┼────────────────────>│
     │                     │                     │                     │
     │ 4. Echo Back        │                     │ 5. Receive Message  │
     │<────────────────────┤                     │                     │
     │                     │                     │                     │
```

## WebSocket Message Types

```
┌─────────────────────────────────────────────────────────────────┐
│                    WebSocket Messages                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  screen_data (Admin → Viewers)                                  │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ {                                                       │    │
│  │   "type": "screen_data",                               │    │
│  │   "data": "data:image/jpeg;base64,/9j/4AAQSkZJRg..."  │    │
│  │ }                                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  chat (Any → All)                                               │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ {                                                       │    │
│  │   "type": "chat",                                       │    │
│  │   "user_id": 10,                                        │    │
│  │   "username": "john_doe",                               │    │
│  │   "message": "Hello everyone!",                         │    │
│  │   "timestamp": "2024-01-15T10:32:00Z"                   │    │
│  │ }                                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  user_joined (System → Admin)                                   │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ {                                                       │    │
│  │   "type": "user_joined",                                │    │
│  │   "user_id": 10,                                        │    │
│  │   "username": "john_doe",                               │    │
│  │   "timestamp": "2024-01-15T10:31:00Z"                   │    │
│  │ }                                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  user_left (System → Admin)                                     │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ {                                                       │    │
│  │   "type": "user_left",                                  │    │
│  │   "user_id": 10,                                        │    │
│  │   "username": "john_doe",                               │    │
│  │   "timestamp": "2024-01-15T10:35:00Z"                   │    │
│  │ }                                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
│  session_ended (System → Viewers)                               │
│  ┌────────────────────────────────────────────────────────┐    │
│  │ {                                                       │    │
│  │   "type": "session_ended",                              │    │
│  │   "timestamp": "2024-01-15T10:40:00Z"                   │    │
│  │ }                                                       │    │
│  └────────────────────────────────────────────────────────┘    │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

## Security Flow

```
┌──────────────────────────────────────────────────────────────────┐
│                      Security Layers                              │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  1. Authentication Layer                                          │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ • JWT Token Validation                              │     │
│     │ • User Identity Verification                        │     │
│     │ • Token Expiry Check                                │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                   │
│  2. Authorization Layer                                           │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ • Role-Based Access Control (RBAC)                  │     │
│     │ • Admin/SuperAdmin for session creation             │     │
│     │ • Authenticated users for viewing                   │     │
│     │ • Session ownership verification                    │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                   │
│  3. WebSocket Security                                            │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ • Token-based WS authentication                     │     │
│     │ • Origin validation (CORS)                          │     │
│     │ • Connection rate limiting                          │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                   │
│  4. Data Security                                                 │
│     ┌─────────────────────────────────────────────────────┐     │
│     │ • Encrypted connections (WSS in production)         │     │
│     │ • User data sanitization                            │     │
│     │ • SQL injection prevention (GORM)                   │     │
│     └─────────────────────────────────────────────────────┘     │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Performance Optimization

```
┌──────────────────────────────────────────────────────────────────┐
│                   Performance Strategies                          │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Frame Rate Control                                               │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ • 10 FPS default (100ms interval)                      │     │
│  │ • Adjustable based on network conditions               │     │
│  │ • Balance between smoothness and bandwidth             │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Image Compression                                                │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ • JPEG format with 70% quality                         │     │
│  │ • Reduces bandwidth by ~60%                            │     │
│  │ • Maintains acceptable visual quality                  │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Connection Management                                            │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ • Separate rooms per session                           │     │
│  │ • Efficient message routing                            │     │
│  │ • Automatic cleanup on disconnect                      │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
│  Database Optimization                                            │
│  ┌────────────────────────────────────────────────────────┐     │
│  │ • Indexed queries on active sessions                   │     │
│  │ • Batch inserts for messages                           │     │
│  │ • Efficient participant tracking                       │     │
│  └────────────────────────────────────────────────────────┘     │
│                                                                   │
└───────────────────────────────────────────────────────────────────┘
```

## Deployment Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                    Production Deployment                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌──────────────┐                                               │
│  │   Clients    │                                               │
│  │  (Browsers)  │                                               │
│  └──────┬───────┘                                               │
│         │ HTTPS/WSS                                             │
│         │                                                        │
│  ┌──────▼───────────────────────────────────────────────┐      │
│  │              Load Balancer / Reverse Proxy           │      │
│  │                    (Nginx/Caddy)                     │      │
│  │  • SSL/TLS Termination                               │      │
│  │  • WebSocket Upgrade                                 │      │
│  │  • Rate Limiting                                     │      │
│  └──────┬───────────────────────────────────────────────┘      │
│         │                                                        │
│  ┌──────▼───────────────────────────────────────────────┐      │
│  │           Algocdk Application Server                 │      │
│  │                  (Go/Gin)                            │      │
│  │  • Screen Share Handler                              │      │
│  │  • WebSocket Hub                                     │      │
│  │  • Session Management                                │      │
│  └──────┬───────────────────────────────────────────────┘      │
│         │                                                        │
│  ┌──────▼───────────────────────────────────────────────┐      │
│  │              SQLite Database                         │      │
│  │  • Sessions                                          │      │
│  │  • Participants                                      │      │
│  │  • Messages                                          │      │
│  └──────────────────────────────────────────────────────┘      │
│                                                                  │
└──────────────────────────────────────────────────────────────────┘
```

This architecture provides a scalable, secure, and performant screen sharing solution for your trading platform.
