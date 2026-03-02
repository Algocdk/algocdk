# How to Connect Your Deriv Account

## Quick Start

1. **Navigate to Connection Page**
   - Go to `/deriv-connect` in your browser
   - Or click "Connect Deriv" from your dashboard

2. **Click "Connect Deriv Account"**
   - You'll be redirected to Deriv's secure OAuth page
   - The URL will be: `https://oauth.deriv.com/oauth2/authorize?app_id=YOUR_APP_ID`

3. **Log In to Deriv**
   - Enter your Deriv email and password
   - Or use social login if you prefer

4. **Authorize the App**
   - Review the permissions requested
   - Click "Authorize" to grant access

5. **Automatic Redirect**
   - You'll be redirected back to the platform
   - Your accounts (both demo and real) will be automatically linked
   - You'll see a success message

## What Gets Connected

When you authorize the app, the following accounts are linked:
- ✅ All demo accounts (VRTC prefix)
- ✅ All real accounts (CR prefix)
- ✅ Account balances
- ✅ Trading permissions

## Security

- **OAuth 2.0**: Industry-standard secure authentication
- **No Password Storage**: We never see or store your Deriv password
- **Token Encryption**: All tokens are encrypted in our database
- **60-Day Expiry**: Tokens automatically expire after 60 days
- **Revocable**: You can revoke access anytime from Deriv settings

## Using Your Connected Account

Once connected, you can:
- View real-time balances
- Place trades directly from the platform
- Switch between demo and real accounts
- Use automated trading bots
- Track trade history

## Troubleshooting

### "No Deriv account linked" Error
- Go to `/deriv-connect` and link your account
- Check if your session has expired (60 days)
- Try unlinking and reconnecting

### OAuth Redirect Not Working
- Check if popup blockers are enabled
- Ensure you're using HTTPS in production
- Verify your Deriv app_id is correct

### Token Expired
- Simply reconnect your account
- Go to `/deriv-connect` and click "Connect Deriv Account"
- Your old session will be automatically replaced

## Managing Connected Accounts

### View Linked Accounts
- Go to `/deriv-connect`
- Scroll down to see all linked accounts
- Each account shows: Account ID, Currency, Type (Demo/Real)

### Unlink an Account
- Click "Unlink" next to the account
- Confirm the action
- The account will be removed immediately

### Reconnect
- Click "Connect Deriv Account" again
- Follow the OAuth flow
- Old sessions will be deactivated automatically

## API Endpoints (For Developers)

### Initiate OAuth
```
GET /api/deriv/oauth/initiate
Authorization: Bearer {jwt_token}
```

### Handle Callback
```
POST /api/deriv/oauth/callback
Authorization: Bearer {jwt_token}
Content-Type: application/json

{
  "accounts": [
    {
      "account": "CR12345",
      "token": "a1-xxxxx",
      "currency": "USD"
    }
  ]
}
```

### Get Linked Accounts
```
GET /api/deriv/oauth/accounts
Authorization: Bearer {jwt_token}
```

### Place Trade
```
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

## Support

Need help? Contact support@algocdk.com or check the FAQ section.
