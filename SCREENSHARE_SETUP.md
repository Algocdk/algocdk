# Screen Sharing Feature - Quick Setup Guide

## Installation Steps

### 1. Install Dependencies
The required `gorilla/websocket` package is already in your `go.mod`. If needed, run:
```bash
go mod download
```

### 2. Database Migration
The screen sharing tables will be automatically created when you start the application:
- `screen_share_sessions`
- `screen_share_participants`
- `screen_share_messages`

### 3. Build and Run
```bash
# Build the application
go build -o algocdk main.go

# Run the application
./algocdk
```

Or simply:
```bash
go run main.go
```

### 4. Verify Installation
Check that the server starts successfully and you see the screen sharing routes:
```
[GIN-debug] POST   /api/admin/screenshare/start
[GIN-debug] POST   /api/admin/screenshare/stop/:id
[GIN-debug] GET    /api/admin/screenshare/participants/:id
[GIN-debug] GET    /api/screenshare/sessions
[GIN-debug] GET    /api/screenshare/messages/:id
[GIN-debug] GET    /ws/screenshare
```

## Quick Test

### Test as Admin

1. **Login as Admin**
   - Navigate to: `http://localhost:3000/auth`
   - Login with admin credentials

2. **Access Screen Share Admin**
   - Navigate to: `http://localhost:3000/screenshare-admin`
   - Click "Start Screen Share"
   - Grant screen sharing permission
   - Select screen/window to share

3. **Verify Session**
   - Check that status shows "Active"
   - Screen preview should display your shared screen

### Test as User

1. **Login as Regular User**
   - Open a new incognito/private window
   - Navigate to: `http://localhost:3000/auth`
   - Login with user credentials

2. **Join Session**
   - Navigate to: `http://localhost:3000/screenshare-viewer`
   - You should see the active session
   - Click "Join Session"

3. **Verify Viewing**
   - Shared screen should appear
   - Admin should see you in participants list
   - Test chat functionality

## Adding to Navigation

### Admin Dashboard
Add screen sharing link to your admin dashboard (`frontend/admin_dashboard.html`):

```html
<a href="/screenshare-admin" class="nav-link">
    <i class="icon-screen"></i>
    Screen Share
</a>
```

### User Dashboard
Add viewer link to user dashboard (`frontend/app.html`):

```html
<a href="/screenshare-viewer" class="nav-link">
    <i class="icon-video"></i>
    Live Sessions
</a>
```

## Configuration

### Adjust Frame Rate
Edit `frontend/screenshare-admin.js` line 95:
```javascript
setTimeout(streamFrames, 100); // 100ms = 10 FPS
// Change to 50 for 20 FPS, 200 for 5 FPS, etc.
```

### Adjust Image Quality
Edit `frontend/screenshare-admin.js` line 92:
```javascript
const frameData = canvas.toDataURL('image/jpeg', 0.7); // 0.7 = 70% quality
// Range: 0.0 (lowest) to 1.0 (highest)
```

## Troubleshooting

### "Failed to start session"
- Verify you're logged in as admin/superadmin
- Check browser console for errors
- Ensure JWT token is valid

### "Permission denied" for screen capture
- Browser must support Screen Capture API
- User must grant permission
- Try Chrome/Firefox/Edge (latest versions)

### WebSocket connection failed
- Verify server is running
- Check PORT in .env is correct (should be 3000)
- Ensure no firewall blocking WebSocket connections

### Screen not displaying for viewers
- Check admin is actively sharing
- Verify WebSocket connection in browser console
- Ensure both users are in same session

## API Testing with cURL

### Start Session (Admin)
```bash
curl -X POST http://localhost:3000/api/admin/screenshare/start \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "Content-Type: application/json"
```

### Get Active Sessions
```bash
curl http://localhost:3000/api/screenshare/sessions \
  -H "Authorization: Bearer YOUR_TOKEN"
```

### Get Participants
```bash
curl http://localhost:3000/api/admin/screenshare/participants/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

### Stop Session
```bash
curl -X POST http://localhost:3000/api/admin/screenshare/stop/1 \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN"
```

## Production Checklist

- [ ] Enable HTTPS/WSS
- [ ] Configure proper CORS origins
- [ ] Add rate limiting
- [ ] Set up monitoring
- [ ] Add database indexes
- [ ] Configure session timeouts
- [ ] Test with multiple concurrent users
- [ ] Optimize bandwidth settings
- [ ] Set up logging
- [ ] Create backup strategy

## Next Steps

1. Test the feature thoroughly
2. Customize UI to match your platform design
3. Add links to navigation menus
4. Configure production settings
5. Monitor performance with real users

## Support

For detailed documentation, see: `SCREENSHARE_FEATURE.md`

For issues:
1. Check server logs
2. Check browser console
3. Verify authentication
4. Test WebSocket connectivity
