# Token Refresh System Integration

## Overview
The token refresh system automatically refreshes user authentication tokens before they expire, preventing users from being logged out during active sessions.

## How It Works

1. **Access Token**: Short-lived token (7 days) used for API requests
2. **Refresh Token**: Long-lived token (7 days) used to get new access tokens
3. **Automatic Refresh**: Checks every 5 minutes and refreshes if token expires in less than 1 hour

## Integration Steps

### 1. Add Scripts to HTML Pages

Add these scripts to the `<head>` or before `</body>` in all authenticated pages:

```html
<!-- Load API and token manager first -->
<script src="/api.js"></script>

<!-- Load token refresh manager -->
<script src="/token-refresh-manager.js"></script>
```

### 2. Example Integration

```html
<!DOCTYPE html>
<html>
<head>
    <title>My Page</title>
    <!-- Other head content -->
</head>
<body>
    <!-- Page content -->
    
    <!-- Scripts at the end of body -->
    <script src="/api.js"></script>
    <script src="/token-refresh-manager.js"></script>
    <script src="/your-page-script.js"></script>
</body>
</html>
```

### 3. Pages That Need Integration

Add the token refresh manager to these pages:
- `/app.html` - Dashboard
- `/mybots.html` - My Bots
- `/botstore.html` - Bot Store
- `/marketchart.html` - Market Chart
- `/trading.html` - Trading
- `/settings.html` - Settings
- `/profile.html` - User Profile
- `/admin_dashboard.html` - Admin Dashboard
- `/superadmin_dashboard.html` - SuperAdmin Dashboard
- All other authenticated pages

## Backend Setup

### 1. Environment Variables

Add to your `.env` file:

```env
JWT_SECRET=your-jwt-secret-key
REFRESH_TOKEN=your-refresh-token-secret-key
```

Make sure `REFRESH_TOKEN` is different from `JWT_SECRET` for security.

### 2. API Endpoint

The refresh endpoint is already configured at:
```
POST /api/auth/refresh
```

Request body:
```json
{
  "refresh_token": "your-refresh-token"
}
```

Response:
```json
{
  "message": "token refreshed successfully",
  "token": "new-access-token",
  "refresh_token": "new-refresh-token"
}
```

## Manual Token Refresh

You can manually trigger a token refresh:

```javascript
// Check and refresh if needed
await TokenManager.refreshIfNeeded();

// Force refresh now
await TokenRefreshManager.checkNow();
```

## Testing

1. Login to the application
2. Open browser console
3. Check for log message: `[TokenRefresh] Token refresh manager loaded`
4. Wait or manually trigger refresh
5. Verify new tokens are stored in localStorage

## Security Notes

- Refresh tokens are stored in localStorage
- Tokens are automatically cleared on logout
- Failed refresh attempts redirect to login page
- Use HTTPS in production to protect tokens in transit

## Troubleshooting

### Token not refreshing
- Check browser console for errors
- Verify `REFRESH_TOKEN` environment variable is set
- Ensure refresh token is valid and not expired

### User still getting logged out
- Check token expiration times in `generatetoken.go`
- Verify `CHECK_INTERVAL` in `token-refresh-manager.js`
- Ensure scripts are loaded in correct order

### Multiple tabs
- Token refresh works across tabs using localStorage events
- Refresh in one tab updates tokens in all tabs
