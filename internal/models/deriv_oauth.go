package models

import "time"

// DerivOAuthSession stores OAuth session metadata only — tokens are NOT persisted server-side
type DerivOAuthSession struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"not null;index"`
	AccountID string    `json:"account_id" gorm:"size:50;not null"`
	IsVirtual bool      `json:"is_virtual" gorm:"default:false"`
	Currency  string    `json:"currency" gorm:"size:10"`
	ExpiresAt time.Time `json:"expires_at"`
	IsActive  bool      `json:"is_active" gorm:"default:true;index"`
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}

func (DerivOAuthSession) TableName() string {
	return "deriv_oauth_sessions"
}
