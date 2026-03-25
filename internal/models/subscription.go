package models

import "time"

type Subscription struct {
	ID          uint       `gorm:"primaryKey" json:"id"`
	UserID      uint       `gorm:"uniqueIndex" json:"user_id"`
	Plan        string     `json:"plan" gorm:"default:free"`
	Status      string     `json:"status" gorm:"default:active"` // "active", "cancelled", "expired"
	Reference   string     `json:"reference"`
	Amount      float64    `json:"amount"`
	StartedAt   time.Time  `json:"started_at"`
	ExpiresAt   time.Time  `json:"expires_at"`
	CancelledAt *time.Time `json:"cancelled_at"`
	CreatedAt   time.Time  `json:"created_at"`
	UpdatedAt   time.Time  `json:"updated_at"`
}
