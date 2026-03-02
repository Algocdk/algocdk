#!/bin/bash

# Test Deriv OAuth Endpoints
BASE_URL="http://localhost:3000"
TOKEN="your_jwt_token_here"

echo "=== Testing Deriv OAuth Endpoints ==="
echo ""

# 1. Test Initiate OAuth
echo "1. Testing GET /api/deriv/oauth/initiate"
curl -X GET "$BASE_URL/api/deriv/oauth/initiate" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\nStatus: %{http_code}\n\n"

# 2. Test Get Linked Accounts (should be empty initially)
echo "2. Testing GET /api/deriv/oauth/accounts"
curl -X GET "$BASE_URL/api/deriv/oauth/accounts" \
  -H "Authorization: Bearer $TOKEN" \
  -w "\nStatus: %{http_code}\n\n"

# 3. Test OAuth Callback (simulate)
echo "3. Testing POST /api/deriv/oauth/callback"
curl -X POST "$BASE_URL/api/deriv/oauth/callback" \
  -H "Authorization: Bearer $TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "accounts": [
      {
        "token": "test_token_123",
        "currency": "USD",
        "account": "CR12345"
      }
    ]
  }' \
  -w "\nStatus: %{http_code}\n\n"

echo "=== Tests Complete ==="
echo ""
echo "Expected Results:"
echo "1. Should return oauth_url with status 200"
echo "2. Should return empty accounts array with status 200"
echo "3. Should fail validation (invalid token) with status 400/401"
