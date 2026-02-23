# Algocdk - Trading Platform

A comprehensive trading platform with bot management, real-time market data, and Deriv API integration.

## Features

### User Management
- User registration with email verification
- JWT authentication with refresh tokens
- Password reset and recovery
- Profile management and account deletion
- Role-based access control (User, Admin, SuperAdmin)
- Admin upgrade request system
- Country detection and user analytics

### Trading
- Deriv API integration (demo and real accounts)
- Multiple contract types: Digits, Up/Down, Touch, Barriers, Multipliers, Accumulators, Options
- Real-time market data via WebSocket
- Trade history and profit tracking
- Automated trading bot execution
- Custom bot loader with draggable overlay
- Market charts with candlestick data
- Economic calendar and market news

### Bot Management
- Bot marketplace with purchase and rental options
- Bot creation with HTML/CSS/JS upload
- Bot versioning and categorization
- User-bot assignment and access control
- Bot performance tracking
- Favorite bots system
- Bot status management (active/inactive)

### Payment System
- Paystack integration for payments
- Bot purchase and rental transactions
- Revenue sharing between platform and admins
- Transaction history and reporting
- Admin bank details management
- Webhook handling for payment verification

### Admin Features
- Admin dashboard with analytics
- Bot creation and management
- User management for bot access
- Transaction tracking and revenue reports
- Site builder for custom landing pages
- Site member management
- Screen sharing sessions with viewers

### SuperAdmin Features
- Platform-wide user management
- Admin creation and approval system
- Bot scanning and monitoring
- Sales and performance analytics
- Transaction oversight
- Admin request review system
- Platform statistics dashboard

### Site Builder
- Create custom sites with HTML/CSS/JS
- Public and private site visibility
- Site member management
- View count tracking
- Slug-based site routing

### Screen Sharing
- Real-time screen sharing for admins
- Viewer join requests with approval
- Two-way audio communication
- Chat messaging during sessions
- Session participant tracking
- WebSocket-based streaming

## Tech Stack

- Backend: Go 1.21+ with Gin
- Database: SQLite with GORM
- Frontend: JavaScript, HTML5, CSS3
- Real-time: WebSocket
- API: Deriv integration

## Installation

```bash
git clone https://github.com/keyadaniel56/algocdk.git
cd algocdk
go mod download
cp .env.example .env
go build -o algocdk main.go
./algocdk
```

Server starts at `http://localhost:3000`

## API Documentation

Swagger docs: `http://localhost:3000/swagger/index.html`

## Key Endpoints

### Authentication
- `POST /api/auth/signup` - User registration
- `POST /api/auth/login` - User login
- `POST /api/auth/forgot_password` - Password reset
- `GET /api/auth/verify-email` - Email verification
- `POST /api/auth/resend-verification` - Resend verification email

### User
- `GET /api/user/profile` - Get user profile
- `PUT /api/user/profile` - Update profile
- `DELETE /api/user/account` - Delete account
- `POST /api/user/reset-password` - Reset password
- `GET /api/user/bots` - Get user's bots
- `POST /api/user/trades` - Record trade
- `GET /api/user/trades` - Get trade history
- `POST /api/user/favorite/:bot_id` - Toggle favorite bot
- `GET /api/user/favorite` - Get favorite bots
- `POST /api/user/request-admin` - Request admin status
- `GET /api/user/admin-request-status` - Check admin request status

### Market Data
- `GET /api/market/data` - Get market data
- `GET /api/market/deriv` - Get Deriv market data
- `GET /api/market/chart/:symbol` - Get chart data
- `GET /api/market/calendar` - Economic calendar
- `GET /api/market/news` - Market news
- `GET /ws/market` - WebSocket market stream

### Deriv Integration
- `POST /api/deriv/auth` - Authenticate with Deriv
- `POST /api/deriv/token/save` - Save API tokens
- `GET /api/deriv/token` - Get saved token
- `DELETE /api/deriv/token` - Delete token
- `GET /api/deriv/me/info` - Get user info
- `GET /api/deriv/me/balance` - Get balance
- `GET /api/deriv/me/accounts` - Get account list
- `POST /api/deriv/me/switch` - Switch account
- `POST /api/deriv/trade` - Place trade

### Admin
- `GET /api/admin/dashboard` - Admin dashboard
- `GET /api/admin/profile` - Admin profile
- `POST /api/admin/create-bot` - Create bot
- `PUT /api/admin/update-bot/:id` - Update bot
- `DELETE /api/admin/delete-bot/:id` - Delete bot
- `GET /api/admin/bots` - List admin bots
- `GET /api/admin/bots/:id/users` - Get bot users
- `DELETE /api/admin/bots/:bot_id/users/:user_id` - Remove user from bot
- `GET /api/admin/transactions` - Get transactions
- `POST /api/admin/transactions` - Record transaction
- `PUT /api/admin/bank-details` - Update bank details
- `POST /api/admin/create-site` - Create site
- `GET /api/admin/sites` - List sites
- `PUT /api/admin/update-site/:id` - Update site
- `DELETE /api/admin/delete-site/:id` - Delete site
- `GET /api/admin/sites/:id/members` - Get site members
- `POST /api/admin/sites/:id/members` - Add site member
- `DELETE /api/admin/sites/:site_id/members/:user_id` - Remove site member
- `POST /api/admin/screenshare/start` - Start screen share
- `POST /api/admin/screenshare/stop/:id` - Stop screen share
- `GET /api/admin/screenshare/participants/:id` - Get participants

### SuperAdmin
- `POST /api/superadmin/auth/signup` - SuperAdmin registration
- `POST /api/superadmin/auth/login` - SuperAdmin login
- `GET /api/superadmin/profile/:id` - Get profile
- `GET /api/superadmin/superadmindashboard/:id` - Dashboard
- `POST /api/superadmin/create_user` - Create user
- `POST /api/superadmin/update_user/:id` - Update user
- `DELETE /api/superadmin/delete_user/:id` - Delete user
- `GET /api/superadmin/users` - Get all users
- `GET /api/superadmin/user/:id` - Get user by ID
- `POST /api/superadmin/create_admin` - Create admin
- `GET /api/superadmin/get_all_admins` - Get all admins
- `GET /api/superadmin/toggle_admin_status` - Toggle admin status
- `POST /api/superadmin/update_admin/:id` - Update admin
- `DELETE /api/superadmin/delete_admin` - Delete admin
- `POST /api/superadmin/update_admin_password` - Update admin password
- `GET /api/superadmin/bots` - Get all bots
- `GET /api/superadmin/scan_bots` - Scan all bots
- `GET /api/superadmin/sales` - Get all sales
- `GET /api/superadmin/performance` - Platform performance
- `GET /api/superadmin/transactions` - All transactions
- `GET /api/superadmin/admin-requests` - Pending admin requests
- `GET /api/superadmin/admin-requests/all` - All admin requests
- `POST /api/superadmin/admin-requests/:id/review` - Review admin request

### Screen Sharing
- `GET /api/screenshare/sessions` - Get active sessions
- `GET /api/screenshare/messages/:id` - Get session messages
- `POST /api/screenshare/join/:id` - Request to join session
- `GET /api/screenshare/requests/:id` - Get join requests
- `POST /api/screenshare/requests/:request_id/review` - Review join request
- `GET /ws/screenshare` - WebSocket screen share stream

### Payment
- `POST /api/payment/initialize` - Initialize payment
- `GET /api/payment/verify` - Verify payment
- `POST /api/payment/callback` - Frontend callback
- `POST /api/payment/webhook` - Paystack webhook

### Public
- `GET /api/marketplace` - Bot marketplace
- `GET /bots/:id` - Serve bot HTML
- `GET /site/:slug` - View public site

## Environment Variables

```env
PORT=3000
JWT_SECRET=your-secret
DB_PATH=app.db
SUPER_ADMIN_SECRET=your-superadmin-secret
PAYSTACK_SECRET_KEY=your-key
PAYSTACK_PUBLIC_KEY=your-public-key
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_USER=your-email@gmail.com
SMTP_PASS=your-app-password
FROM_EMAIL=noreply@algocdk.com
FROM_NAME=Algocdk
EMAIL_MODE=console
BASE_URL=http://localhost:3000
GIN_MODE=release
```

## Docker Deployment

```bash
# Build image
docker build -t algocdk .

# Run container
docker run -p 3000:3000 -e JWT_SECRET=your-secret algocdk

# Or use docker-compose
docker-compose up -d
```

## Production Build

```bash
go build -ldflags="-s -w" -o algocdk main.go
```

## License

MIT License

## Support

- GitHub Issues
- Email: support@algocdk.com