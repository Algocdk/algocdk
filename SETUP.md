# Setup Guide

## Quick Start

### Prerequisites
- Go 1.21+
- SQLite3

### Installation

1. Clone and install dependencies:
```bash
git clone https://github.com/keyadaniel56/algocdk.git
cd algocdk
go mod download
```

2. Configure environment:
```bash
cp .env.example .env
# Edit .env with your settings
```

3. Build and run:
```bash
go build -o algocdk main.go
./algocdk
```

Server starts at `http://localhost:3000`

## Environment Variables

```env
PORT=3000
JWT_SECRET=your-secret-key
DB_PATH=app.db
PAYSTACK_SECRET_KEY=your-paystack-key
PAYSTACK_PUBLIC_KEY=your-paystack-public-key
```

## API Documentation

Access Swagger docs at: `http://localhost:3000/swagger/index.html`

## Production Build

```bash
go build -ldflags="-s -w" -o algocdk main.go
```

## Support

- GitHub Issues: Report bugs and request features
- Email: support@algocdk.com
