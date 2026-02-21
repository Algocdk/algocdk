package models

import "time"

type ScreenShareSession struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	AdminID   uint       `json:"admin_id"`
	AdminName string     `json:"admin_name"`
	IsActive  bool       `json:"is_active"`
	StartedAt time.Time  `json:"started_at"`
	EndedAt   *time.Time `json:"ended_at,omitempty"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type ScreenShareParticipant struct {
	ID        uint       `gorm:"primaryKey" json:"id"`
	SessionID uint       `json:"session_id"`
	UserID    uint       `json:"user_id"`
	Username  string     `json:"username"`
	JoinedAt  time.Time  `json:"joined_at"`
	LeftAt    *time.Time `json:"left_at,omitempty"`
	IsActive  bool       `json:"is_active"`
	CreatedAt time.Time  `json:"created_at"`
	UpdatedAt time.Time  `json:"updated_at"`
}

type ScreenShareMessage struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	SessionID uint      `json:"session_id"`
	UserID    uint      `json:"user_id"`
	Username  string    `json:"username"`
	Message   string    `json:"message"`
	CreatedAt time.Time `json:"created_at"`
}

type ScreenShareJoinRequest struct {
	ID        uint      `gorm:"primaryKey" json:"id"`
	SessionID uint      `json:"session_id"`
	UserID    uint      `json:"user_id"`
	Username  string    `json:"username"`
	Status    string    `json:"status" gorm:"default:pending"` // pending, approved, rejected
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
}
