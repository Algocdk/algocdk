package models

import "time"

// DerivOAuthSession stores OAuth session data
type DerivOAuthSession struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UserID    uint      `json:"user_id" gorm:"not null;index"`
	AccountID string    `json:"account_id" gorm:"size:50;not null"`
	Token1    string    `json:"token1" gorm:"type:text;not null"`
	Token2    string    `json:"token2" gorm:"type:text"`
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
