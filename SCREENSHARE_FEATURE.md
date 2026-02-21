# Screen Sharing Feature Documentation

## Overview
The Screen Sharing feature allows admins to share their screen in real-time with platform users, complete with chat functionality and participant management.

## Features

### Admin Capabilities
- ✅ Start/stop screen sharing sessions
- ✅ View live preview of shared screen
- ✅ See list of active participants
- ✅ Receive notifications when users join/leave
- ✅ Chat with all participants
- ✅ Secure session management

### User Capabilities
- ✅ Browse active screen sharing sessions
- ✅ Join any active session
- ✅ View shared screen in real-time
- ✅ Chat with admin and other participants
- ✅ Leave session at any time

### Technical Features
- ✅ WebSocket-based real-time communication
- ✅ Secure JWT authentication
- ✅ Role-based access control
- ✅ Session persistence in database
- ✅ Chat history storage
- ✅ Participant tracking

## Architecture

### Backend Components

#### Models (`internal/models/screenshare.go`)
- **ScreenShareSession**: Tracks active/past sessions
- **ScreenShareParticipant**: Records user participation
- **ScreenShareMessage**: Stores chat messages

#### Handler (`internal/handlers/screensharehandler.go`)
- **StartScreenShareSession**: Admin starts a session
- **StopScreenShareSession**: Admin ends a session
- **GetActiveSessions**: List all active sessions
- **GetSessionParticipants**: Get participants in a session
- **ScreenShareWebSocket**: WebSocket handler for real-time communication
- **GetSessionMessages**: Retrieve chat history

### Frontend Components

#### Admin Interface (`frontend/screenshare-admin.html` & `.js`)
- Session control panel
- Screen preview
- Participant list with real-time updates
- Chat interface
- Screen capture using `getDisplayMedia` API

#### Viewer Interface (`frontend/screenshare-viewer.html` & `.js`)
- Active sessions browser
- Screen viewer with canvas rendering
- Chat interface
- Session information panel

## API Endpoints

### Admin Endpoints (Requires Admin/SuperAdmin Role)

#### Start Session
```
POST /api/admin/screenshare/start
Authorization: Bearer <token>

Response:
{
  "message": "Screen sharing session started",
  "session": {
    "id": 1,
    "admin_id": 5,
    "admin_name": "John Admin",
    "is_active": true,
    "started_at": "2024-01-15T10:30:00Z"
  }
}
```

#### Stop Session
```
POST /api/admin/screenshare/stop/:id
Authorization: Bearer <token>

Response:
{
  "message": "Session stopped"
}
```

#### Get Participants
```
GET /api/admin/screenshare/participants/:id
Authorization: Bearer <token>

Response:
{
  "participants": [
    {
      "id": 1,
      "session_id": 1,
      "user_id": 10,
      "username": "viewer1",
      "joined_at": "2024-01-15T10:31:00Z",
      "is_active": true
    }
  ]
}
```

### User Endpoints (Requires Authentication)

#### Get Active Sessions
```
GET /api/screenshare/sessions
Authorization: Bearer <token>

Response:
{
  "sessions": [
    {
      "id": 1,
      "admin_id": 5,
      "admin_name": "John Admin",
      "is_active": true,
      "started_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### Get Chat Messages
```
GET /api/screenshare/messages/:id
Authorization: Bearer <token>

Response:
{
  "messages": [
    {
      "id": 1,
      "session_id": 1,
      "user_id": 10,
      "username": "viewer1",
      "message": "Hello!",
      "created_at": "2024-01-15T10:32:00Z"
    }
  ]
}
```

### WebSocket Endpoint

#### Connect to Session
```
WS /ws/screenshare?session_id=<id>&token=<token>
```

#### WebSocket Message Types

**Admin → Viewers (screen_data)**
```json
{
  "type": "screen_data",
  "data": "data:image/jpeg;base64,..."
}
```

**Any User → All (chat)**
```json
{
  "type": "chat",
  "message": "Hello everyone!"
}
```

**System → Admin (user_joined)**
```json
{
  "type": "user_joined",
  "user_id": 10,
  "username": "viewer1",
  "timestamp": "2024-01-15T10:31:00Z"
}
```

**System → Admin (user_left)**
```json
{
  "type": "user_left",
  "user_id": 10,
  "username": "viewer1",
  "timestamp": "2024-01-15T10:35:00Z"
}
```

**System → Viewers (session_ended)**
```json
{
  "type": "session_ended",
  "timestamp": "2024-01-15T10:40:00Z"
}
```

## Usage Guide

### For Admins

1. **Navigate to Screen Share Admin Page**
   ```
   http://localhost:3000/screenshare-admin
   ```

2. **Start a Session**
   - Click "Start Screen Share" button
   - Grant screen sharing permission when prompted
   - Select the screen/window to share

3. **Monitor Participants**
   - View real-time list of connected users
   - See join/leave notifications

4. **Chat with Participants**
   - Type messages in the chat box
   - Messages are visible to all participants

5. **Stop Session**
   - Click "Stop Sharing" button
   - All viewers will be disconnected

### For Users

1. **Navigate to Screen Share Viewer Page**
   ```
   http://localhost:3000/screenshare-viewer
   ```

2. **Browse Active Sessions**
   - View all currently active sessions
   - See admin name and start time

3. **Join a Session**
   - Click "Join Session" on any active session
   - View the shared screen in real-time

4. **Participate in Chat**
   - Send messages to all participants
   - View chat history

5. **Leave Session**
   - Click "Leave Session" button
   - Return to sessions list

## Security Features

### Authentication
- All endpoints require JWT authentication
- WebSocket connections validate tokens
- Session ownership verified for admin actions

### Authorization
- Only admins/superadmins can start sessions
- Only session creator can stop their session
- Users can only join active sessions

### Data Protection
- Screen data transmitted over WebSocket (use WSS in production)
- Chat messages stored with user attribution
- Participant tracking for audit purposes

## Performance Considerations

### Frame Rate
- Default: ~10 FPS (100ms interval)
- Adjustable in `screenshare-admin.js` (line 95)
- Balance between smoothness and bandwidth

### Image Quality
- JPEG compression at 70% quality
- Reduces bandwidth usage
- Adjustable in `screenshare-admin.js` (line 92)

### Scalability
- Each session maintains separate WebSocket connections
- Consider load balancing for multiple concurrent sessions
- Monitor server resources with many viewers

## Production Deployment

### 1. Enable HTTPS/WSS
Update WebSocket connection in frontend:
```javascript
const WS_BASE = window.location.protocol === 'https:' 
  ? 'wss://' + window.location.host 
  : 'ws://' + window.location.host;
```

### 2. Configure CORS
Ensure proper CORS settings in production:
```go
CheckOrigin: func(r *http.Request) bool {
    origin := r.Header.Get("Origin")
    return origin == "https://yourdomain.com"
}
```

### 3. Add Rate Limiting
Implement rate limiting for WebSocket connections:
```go
// Example: Limit connections per user
if connectionCount[userID] > maxConnections {
    return errors.New("too many connections")
}
```

### 4. Monitor Resources
- Track active sessions
- Monitor WebSocket connections
- Log bandwidth usage
- Set session timeouts

### 5. Database Optimization
Add indexes for better query performance:
```sql
CREATE INDEX idx_sessions_active ON screen_share_sessions(is_active);
CREATE INDEX idx_participants_session ON screen_share_participants(session_id, is_active);
CREATE INDEX idx_messages_session ON screen_share_messages(session_id);
```

## Troubleshooting

### Screen Sharing Not Starting
- **Issue**: Permission denied
- **Solution**: Ensure browser supports `getDisplayMedia` API
- **Browsers**: Chrome 72+, Firefox 66+, Edge 79+

### WebSocket Connection Failed
- **Issue**: Connection refused
- **Solution**: Check if server is running and firewall allows WebSocket connections
- **Debug**: Check browser console for error messages

### Poor Video Quality
- **Issue**: Laggy or pixelated screen
- **Solution**: Adjust frame rate and quality settings
- **Location**: `screenshare-admin.js` lines 92-95

### Chat Messages Not Appearing
- **Issue**: Messages not broadcasting
- **Solution**: Verify WebSocket connection is established
- **Check**: Browser console for WebSocket status

## Browser Compatibility

| Browser | Screen Capture | WebSocket | Status |
|---------|---------------|-----------|--------|
| Chrome 72+ | ✅ | ✅ | Fully Supported |
| Firefox 66+ | ✅ | ✅ | Fully Supported |
| Edge 79+ | ✅ | ✅ | Fully Supported |
| Safari 13+ | ✅ | ✅ | Fully Supported |
| Opera 60+ | ✅ | ✅ | Fully Supported |

## Future Enhancements

- [ ] Audio sharing support
- [ ] Recording functionality
- [ ] Screen annotation tools
- [ ] Multiple admin support
- [ ] Viewer hand-raise feature
- [ ] Session scheduling
- [ ] Bandwidth optimization
- [ ] Mobile app support
- [ ] Session analytics
- [ ] Breakout rooms

## Support

For issues or questions:
- Check browser console for errors
- Verify authentication tokens
- Ensure proper role permissions
- Review server logs for WebSocket errors

## License

This feature is part of the Algocdk platform and follows the same license terms.
