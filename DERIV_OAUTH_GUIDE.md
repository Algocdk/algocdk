# Deriv OAuth Implementation Guide

## Overview

The platform now uses **OAuth 2.0** for Deriv authentication instead of storing API tokens. This significantly improves security by:

- Never storing long-lived API tokens in the database
- Using short-lived OAuth sessions (24-hour expiry)
- Allowing users to authenticate directly with Deriv
- Eliminating token exposure risks

## Setup Instructions

### 1. Register Your App on Deriv

1. Go to https://app.deriv.com/account/api-token
2. Click "Register application"
3. Fill in the details:
   - **App Name**: Algocdk Trading Platform
   - **Redirect URL**: `http://localhost:3000/deriv/callback` (or your production URL)
   - **Verification URL**: `http://localhost:3000/deriv/verify` (optional)
4. Select required scopes:
   - ✅ Read
   - ✅ Trade
   - ✅ Trading information
   - ✅ Payments
5. Click "Create" and note your **App ID**

### 2. Configure Environment Variables

Add to your `.env` file:

```env
DERIV_APP_ID=your_app_id_here
DERIV_REDIRECT_URL=http://localhost:3000/deriv/callback
DERIV_VERIFICATION_URL=http://localhost:3000/deriv/verify
```

### 3. Run Database Migration

The new `deriv_oauth_sessions` table will be created automatically on next startup.

```bash
go run main.go
```

## API Endpoints

### OAuth Flow

#### 1. Initiate OAuth
```http
GET /api/deriv/oauth/initiate
Authorization: Bearer {jwt_token}
```

Response:
```json
{
  "success": true,
  "oauth_url": "https://oauth.deriv.com/oauth2/authorize?app_id=xxxxx",
  "user_id": 123
}
```

#### 2. Handle Callback
```http
POST /api/deriv/oauth/callback
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "accounts": [
    {
      "token": "a1-xxxxx",
      "currency": "USD",
      "account": "CR12345"
    }
  ]
}
```

#### 3. Get Linked Accounts
```http
GET /api/deriv/oauth/accounts
Authorization: Bearer {jwt_token}
```

Response:
```json
{
  "success": true,
  "accounts": [
    {
      "account_id": "CR12345",
      "currency": "USD",
      "is_virtual": false,
      "expires_at": "2024-01-15T10:30:00Z"
    }
  ]
}
```

#### 4. Unlink Account
```http
DELETE /api/deriv/oauth/accounts/{account_id}
Authorization: Bearer {jwt_token}
```

### Trading with OAuth

```http
POST /api/deriv/trading/place
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "symbol": "R_100",
  "trade_type": "CALL",
  "amount": 10.0,
  "duration": 5,
  "account_id": "CR12345"
}
```

## Frontend Integration

### User Flow

1. User navigates to `/deriv-oauth`
2. Clicks "Link Deriv Account via OAuth"
3. Popup opens to Deriv OAuth page
4. User logs in to Deriv and authorizes
5. Deriv redirects with tokens
6. Frontend sends tokens to backend
7. Backend validates and stores session

### Example Code

```javascript
// Initiate OAuth
async function linkDerivAccount() {
    const res = await fetch('/api/deriv/oauth/initiate', {
        headers: { 'Authorization': `Bearer ${token}` }
    });
    const data = await res.json();
    
    // Open OAuth popup
    window.open(data.oauth_url, '_blank', 'width=800,height=600');
    
    // Listen for callback
    window.addEventListener('message', handleOAuthCallback);
}

// Handle OAuth callback
async function handleOAuthCallback(event) {
    if (event.data.accounts) {
        await fetch('/api/deriv/oauth/callback', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${token}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({ accounts: event.data.accounts })
        });
    }
}
```

## Security Features

### Token Encryption
- OAuth tokens are stored encrypted in the database
- Sessions expire after 24 hours
- Automatic cleanup of expired sessions

### Session Management
- One active session per account
- Old sessions automatically deactivated
- Users can manually unlink accounts

### Validation
- All tokens validated on first use
- Invalid tokens rejected immediately
- Failed authentication triggers re-auth flow

## Migration from Token Storage

### For Existing Users

Users with stored API tokens can continue using them via legacy endpoints:
- `/api/deriv/token/save` (deprecated)
- `/api/deriv/token` (deprecated)
- `/api/deriv/trade` (deprecated)

Encourage migration to OAuth:
1. Display banner: "Switch to secure OAuth authentication"
2. Link to `/deriv-oauth` page
3. After OAuth setup, delete old tokens

### Database Cleanup

Remove old tokens after migration:
```sql
DELETE FROM deriv_credentials WHERE user_id IN (
  SELECT user_id FROM deriv_oauth_sessions WHERE is_active = 1
);
```

## Testing

### Test OAuth Flow

1. Start server: `go run main.go`
2. Login to platform
3. Navigate to `/deriv-oauth`
4. Click "Link Deriv Account"
5. Use Deriv demo account credentials
6. Verify account appears in linked accounts list

### Test Trading

```bash
curl -X POST http://localhost:3000/api/deriv/trading/place \
  -H "Authorization: Bearer YOUR_JWT_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "symbol": "R_100",
    "trade_type": "CALL",
    "amount": 10.0,
    "duration": 5,
    "account_id": "VRTC12345"
  }'
```

## Troubleshooting

### "No Deriv account linked"
- User needs to complete OAuth flow
- Check session hasn't expired
- Verify account_id matches linked account

### "OAuth URL not opening"
- Check DERIV_APP_ID is set correctly
- Verify popup blocker isn't blocking window
- Ensure redirect URL matches Deriv app settings

### "Token validation failed"
- OAuth session may have expired (24h limit)
- User needs to re-authenticate
- Check Deriv API status

## Production Deployment

1. Update redirect URLs in Deriv app settings
2. Set production environment variables:
   ```env
   DERIV_APP_ID=your_production_app_id
   DERIV_REDIRECT_URL=https://yourdomain.com/deriv/callback
   ```
3. Enable HTTPS (required for OAuth)
4. Test OAuth flow in production
5. Monitor session expiry and re-auth rates

## Benefits

✅ **Enhanced Security**: No long-lived tokens stored  
✅ **User Control**: Users manage authorization via Deriv  
✅ **Compliance**: Follows OAuth 2.0 best practices  
✅ **Transparency**: Users see exactly what's authorized  
✅ **Revocable**: Users can revoke access anytime from Deriv  

## Support

For issues or questions:
- Check Deriv OAuth docs: https://api.deriv.com/docs/oauth/
- Review server logs for authentication errors
- Test with Deriv demo accounts first
