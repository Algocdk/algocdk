package models

import (
	"time"

	"github.com/keyadaniel56/algocdk/internal/utils"
	"gorm.io/gorm"
)

type ChartIndicator struct {
	ID          uint      `gorm:"primaryKey" json:"id"`
	UUID        string    `json:"uuid" gorm:"uniqueIndex;type:varchar(36)"`
	Name        string    `gorm:"not null" json:"name"`
	Description string    `json:"description"`
	Code        string    `gorm:"type:text;not null" json:"code"`
	Category    string    `json:"category"` // e.g., "Trend", "Momentum", "Volatility"
	IsFree      bool      `gorm:"default:true" json:"is_free"`
	Price       float64   `gorm:"default:0" json:"price"`
	Image       string    `json:"image"`                     // Indicator image/thumbnail
	Features    string    `gorm:"type:text" json:"features"` // JSON array of features
	AdminID     uint      `json:"admin_id"`
	Admin       Admin     `gorm:"foreignKey:AdminID" json:"admin,omitempty"`
	CreatedAt   time.Time `json:"created_at"`
	UpdatedAt   time.Time `json:"updated_at"`
}

// BeforeCreate hook to generate UUID
func (c *ChartIndicator) BeforeCreate(tx *gorm.DB) error {
	if c.UUID == "" {
		c.UUID = utils.GenerateUUID()
	}
	return nil
}

type UserIndicator struct {
	ID          uint           `gorm:"primaryKey" json:"id"`
	UserID      uint           `json:"user_id"`
	IndicatorID uint           `json:"indicator_id"`
	Indicator   ChartIndicator `gorm:"foreignKey:IndicatorID" json:"indicator,omitempty"`
	PurchasedAt time.Time      `json:"purchased_at"`
}
