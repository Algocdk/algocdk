# UUID Implementation Guide

## Overview
This guide explains how to implement UUIDs (Universally Unique Identifiers) for users, bots, indicators, admins, and superadmins in the AlgoCDK platform.

## What Was Changed

### 1. New UUID Utility (`internal/utils/uuid.go`)
- `GenerateUUID()` - Generates a new UUID string
- `IsValidUUID()` - Validates UUID format

### 2. Updated Models
All major models now have a `UUID` field:
- **User** (`internal/models/user.go`)
- **Bot** (`internal/models/bot.go`)
- **ChartIndicator** (`internal/models/chartindicator.go`)
- **Admin** (`internal/models/admin.go`)
- **SuperAdmin** (`internal/models/superadmin.go`)

Each model includes:
- `UUID string` field with unique index
- `BeforeCreate` hook to auto-generate UUID on creation

### 3. Database Schema
New column added to each table:
```sql
uuid VARCHAR(36) UNIQUE NOT NULL
```

## Installation Steps

### 1. Install UUID Package
```bash
go get github.com/google/uuid
go mod tidy
```

### 2. Run Database Migration
The UUID columns will be automatically added when you restart the application (GORM auto-migration).

For existing data, run this SQL to populate UUIDs:

```sql
-- For users
UPDATE users SET uuid = LOWER(HEX(RANDOMBLOB(4)) || '-' || HEX(RANDOMBLOB(2)) || '-4' || SUBSTR(HEX(RANDOMBLOB(2)), 2) || '-' || SUBSTR('89ab', ABS(RANDOM()) % 4 + 1, 1) || SUBSTR(HEX(RANDOMBLOB(2)), 2) || '-' || HEX(RANDOMBLOB(6))) WHERE uuid IS NULL OR uuid = '';

-- For bots
UPDATE bots SET uuid = LOWER(HEX(RANDOMBLOB(4)) || '-' || HEX(RANDOMBLOB(2)) || '-4' || SUBSTR(HEX(RANDOMBLOB(2)), 2) || '-' || SUBSTR('89ab', ABS(RANDOM()) % 4 + 1, 1) || SUBSTR(HEX(RANDOMBLOB(2)), 2) || '-' || HEX(RANDOMBLOB(6))) WHERE uuid IS NULL OR uuid = '';

-- For chart_indicators
UPDATE chart_indicators SET uuid = LOWER(HEX(RANDOMBLOB(4)) || '-' || HEX(RANDOMBLOB(2)) || '-4' || SUBSTR(HEX(RANDOMBLOB(2)), 2) || '-' || SUBSTR('89ab', ABS(RANDOM()) % 4 + 1, 1) || SUBSTR(HEX(RANDOMBLOB(2)), 2) || '-' || HEX(RANDOMBLOB(6))) WHERE uuid IS NULL OR uuid = '';

-- For admins
UPDATE admins SET uuid = LOWER(HEX(RANDOMBLOB(4)) || '-' || HEX(RANDOMBLOB(2)) || '-4' || SUBSTR(HEX(RANDOMBLOB(2)), 2) || '-' || SUBSTR('89ab', ABS(RANDOM()) % 4 + 1, 1) || SUBSTR(HEX(RANDOMBLOB(2)), 2) || '-' || HEX(RANDOMBLOB(6))) WHERE uuid IS NULL OR uuid = '';

-- For super_admins
UPDATE super_admins SET uuid = LOWER(HEX(RANDOMBLOB(4)) || '-' || HEX(RANDOMBLOB(2)) || '-4' || SUBSTR(HEX(RANDOMBLOB(2)), 2) || '-' || SUBSTR('89ab', ABS(RANDOM()) % 4 + 1, 1) || SUBSTR(HEX(RANDOMBLOB(2)), 2) || '-' || HEX(RANDOMBLOB(6))) WHERE uuid IS NULL OR uuid = '';
```

### 3. Restart Application
```bash
go build -o algocdk main.go
./algocdk
```

## Usage Examples

### Creating New Records
UUIDs are automatically generated:

```go
// Create new user
user := models.User{
    Name:  "John Doe",
    Email: "john@example.com",
}
db.Create(&user)
// user.UUID is now automatically set (e.g., "550e8400-e29b-41d4-a716-446655440000")
```

### Querying by UUID
```go
// Find user by UUID
var user models.User
db.Where("uuid = ?", "550e8400-e29b-41d4-a716-446655440000").First(&user)

// Find bot by UUID
var bot models.Bot
db.Where("uuid = ?", "123e4567-e89b-12d3-a456-426614174000").First(&bot)
```

### API Responses
UUIDs are included in JSON responses:

```json
{
  "id": 1,
  "uuid": "550e8400-e29b-41d4-a716-446655440000",
  "name": "John Doe",
  "email": "john@example.com"
}
```

### Frontend Usage
```javascript
// Use UUID instead of numeric ID for public-facing URLs
const userUUID = "550e8400-e29b-41d4-a716-446655440000";
const response = await fetch(`/api/user/${userUUID}`);

// Bot marketplace
const botUUID = "123e4567-e89b-12d3-a456-426614174000";
window.location.href = `/bot/${botUUID}`;
```

## Benefits

### 1. Security
- Numeric IDs are predictable (1, 2, 3...)
- UUIDs are random and unpredictable
- Prevents enumeration attacks

### 2. Scalability
- UUIDs can be generated independently
- No need for centralized ID generation
- Works across distributed systems

### 3. Privacy
- User IDs not exposed in URLs
- Harder to guess other users' resources
- Better for public-facing APIs

### 4. Flexibility
- Can merge databases without ID conflicts
- Easy to migrate data between systems
- Unique across all tables

## Migration Strategy

### Phase 1: Add UUID Fields (Current)
- ✅ Add UUID columns to all models
- ✅ Auto-generate UUIDs for new records
- Keep numeric IDs for backward compatibility

### Phase 2: Populate Existing Data
- Run SQL migration to add UUIDs to existing records
- Verify all records have UUIDs

### Phase 3: Update API Endpoints (Optional)
- Add UUID-based endpoints alongside ID-based ones
- Example: `/api/user/:id` and `/api/user/uuid/:uuid`

### Phase 4: Frontend Migration (Optional)
- Update frontend to use UUIDs
- Keep ID fallback for compatibility

### Phase 5: Deprecate Numeric IDs (Future)
- Once all systems use UUIDs
- Remove ID-based endpoints
- UUID becomes primary identifier

## Best Practices

### 1. Always Use UUID for Public APIs
```go
// Good - UUID in URL
router.GET("/api/bot/:uuid", handlers.GetBotByUUID)

// Avoid - Numeric ID in public URL
router.GET("/api/bot/:id", handlers.GetBotByID)
```

### 2. Keep Numeric ID for Internal Use
- Database relationships still use numeric IDs
- Better performance for joins
- Smaller storage footprint

### 3. Validate UUIDs
```go
if !utils.IsValidUUID(uuidStr) {
    return errors.New("invalid UUID format")
}
```

### 4. Index UUID Columns
Already done in models with `gorm:"uniqueIndex"`

## Testing

### 1. Test UUID Generation
```go
func TestUUIDGeneration(t *testing.T) {
    uuid1 := utils.GenerateUUID()
    uuid2 := utils.GenerateUUID()
    
    assert.NotEqual(t, uuid1, uuid2)
    assert.True(t, utils.IsValidUUID(uuid1))
    assert.True(t, utils.IsValidUUID(uuid2))
}
```

### 2. Test Model Creation
```go
func TestUserUUIDCreation(t *testing.T) {
    user := models.User{Name: "Test", Email: "test@example.com"}
    db.Create(&user)
    
    assert.NotEmpty(t, user.UUID)
    assert.True(t, utils.IsValidUUID(user.UUID))
}
```

## Troubleshooting

### UUID Not Generated
- Check if `BeforeCreate` hook is called
- Verify GORM callbacks are enabled
- Ensure UUID field is not manually set

### Duplicate UUID Error
- Very rare (1 in 2^122 chance)
- Check if UUID generation is working
- Verify database unique constraint

### Performance Issues
- Ensure UUID column is indexed
- Use numeric ID for internal joins
- Consider UUID v7 for better sorting (future)

## Future Enhancements

### 1. UUID v7 (Time-Ordered)
- Better database performance
- Sortable by creation time
- Requires Go 1.21+

### 2. Short UUIDs
- Base62 encoding for shorter URLs
- Example: `550e8400...` → `2Sg8h9K`
- Better user experience

### 3. Composite Keys
- Use both ID and UUID
- Gradual migration path
- Maximum compatibility

## Summary

✅ **Completed:**
- UUID utility functions
- Model updates with UUID fields
- Auto-generation on creation
- Database schema updates

📋 **Next Steps:**
1. Install `github.com/google/uuid` package
2. Restart application for auto-migration
3. Run SQL to populate existing records
4. Test UUID generation
5. Optionally update API endpoints

🔒 **Security Improvement:**
- Users, bots, indicators now have unique, unpredictable identifiers
- Better protection against enumeration attacks
- Ready for public-facing APIs
