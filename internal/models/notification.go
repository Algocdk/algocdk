package models

import "time"

type Notification struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	UserID    string    `json:"user_id"`
	Title     string    `json:"title"`
	Message   string    `json:"message"`
	Type      string    `json:"type"` // admin_message, system, trade, etc
	Read      bool      `json:"read" gorm:"default:false"`
	CreatedAt time.Time `json:"created_at"`
}
