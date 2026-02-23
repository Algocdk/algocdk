# Bot User Removal Protection

## Summary
Implemented protection to prevent admins from removing users who purchased their bots. Only rental users can be removed.

## Changes Made

### Backend (adminhandler.go)

#### 1. RemoveUserFromBotHandler
**Added Purchase Protection:**
- Checks `access_type` field in `user_bots` table before deletion
- If `access_type == "purchase"`, returns 403 Forbidden error
- Only allows removal of users with `access_type == "rent"` or other non-purchase types
- Returns clear error message: "cannot remove users who purchased the bot"

**Logic Flow:**
1. Verify bot ownership (existing check)
2. Query `user_bots` table to get user's access type
3. If user not found, return 404
4. If `access_type == "purchase"`, return 403 with error message
5. If rental user, proceed with deletion

#### 2. BotUsersHandler
**Enhanced Response:**
- Now includes `access_type` field for each user
- Added `can_remove` boolean flag (true if access_type != "purchase")
- Frontend can use these fields to show/hide remove button

**Response Format:**
```json
{
  "bot_id": 1,
  "bot_name": "scalpermafia",
  "users": [
    {
      "id": 5,
      "name": "keyadaniel",
      "email": "keyadaniel@gmail.com",
      "access_type": "purchase",
      "can_remove": false
    }
  ]
}
```

### Frontend (admin_dashboard.html)

#### 1. Bot Users Table
**Updated Columns:**
- Changed "Joined" column to "Access Type"
- Shows badge with access type (purchase = green, rent = yellow)

**Conditional Remove Button:**
- If `can_remove == true`: Shows red "Remove" button
- If `can_remove == false`: Shows gray text "Cannot remove (purchased)"

**Visual Indicators:**
- Purchase users: Green badge with "purchase" label
- Rental users: Yellow badge with "rent" label
- Clear messaging for non-removable users

## Database Schema

### user_bots Table
```sql
CREATE TABLE `user_bots` (
  `id` integer PRIMARY KEY AUTOINCREMENT,
  `user_id` integer,
  `bot_id` integer,
  `access_type` text,  -- "purchase" or "rent"
  `is_active` numeric,
  `transaction_id` integer,
  `price` real,
  `expiry_date` datetime,
  `purchase_date` datetime,
  `created_at` datetime,
  `updated_at` datetime,
  ...
);
```

## Business Logic

### Access Types
1. **purchase**: User bought the bot permanently
   - Cannot be removed by admin
   - Lifetime access
   - Protected from deletion

2. **rent**: User rented the bot temporarily
   - Can be removed by admin
   - Time-limited access
   - Admin has control

### Why This Protection?
- **Legal**: Users paid for permanent access
- **Trust**: Maintains platform credibility
- **Revenue**: Protects customer investments
- **Compliance**: Honors purchase agreements

## API Endpoints

### GET /api/admin/bots/:id/users
**Response includes:**
- `access_type`: "purchase" or "rent"
- `can_remove`: boolean flag

### DELETE /api/admin/bots/:bot_id/users/:user_id
**Behavior:**
- Returns 403 if user purchased the bot
- Returns 200 if rental user removed successfully
- Returns 404 if user not found

## Error Messages

### 403 Forbidden (Purchase User)
```json
{
  "error": "cannot remove users who purchased the bot"
}
```

### 404 Not Found
```json
{
  "error": "user not attached to this bot"
}
```

### 200 Success
```json
{
  "message": "user removed from bot"
}
```

## Testing Scenarios

### Test Case 1: Remove Purchase User
1. Admin tries to remove user with `access_type = "purchase"`
2. Backend returns 403 Forbidden
3. Frontend shows "Cannot remove (purchased)" instead of button
4. User remains in bot users list

### Test Case 2: Remove Rental User
1. Admin tries to remove user with `access_type = "rent"`
2. Backend deletes record from `user_bots` table
3. Frontend shows success notification
4. User removed from bot users list

### Test Case 3: View Bot Users
1. Admin views bot users list
2. Purchase users show green "purchase" badge
3. Rental users show yellow "rent" badge
4. Remove button only visible for rental users

## Current Data
```
user_id: 5
bot_id: 1
access_type: purchase
Result: Cannot be removed (protected)
```

## Future Enhancements
- Add expiry date display for rental users
- Show purchase date for all users
- Add filter to show only rental/purchase users
- Implement bulk actions for rental users only
- Add confirmation dialog with access type info
