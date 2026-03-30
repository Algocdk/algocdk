// package models

// import "time"

// type Bot struct {
// 	ID        uint      `json:"id" gorm:"primaryKey"`
// 	Name      string    `json:"name"`
// 	HTMLFile  string    `json:"html_file"`
// 	Image     string    `json:"image"`
// 	Price     float64   `json:"price"`      //  Main purchase price
// 	RentPrice float64   `json:"rent_price"` //  Rental price per period
// 	Strategy  string    `json:"strategy"`
// 	OwnerID   uint      `json:"owner_id"`
// 	CreatedAt time.Time `json:"created_at"`
// 	UpdatedAt time.Time `json:"updated_at"`
// 	Status    string    `json:"status" gorm:"default:'inactive'"`

// 	SubscriptionType   string `json:"subscription_type"`   // e.g. "monthly", "weekly", "lifetime"
// 	SubscriptionExpiry string `json:"subscription_expiry"` // optional: template expiry or plan info

// 	Description string `json:"description"`
// 	Category    string `json:"category"`
// 	Version     string `json:"version"`
// }

package models

import (
	"time"

	"github.com/keyadaniel56/algocdk/internal/utils"
	"gorm.io/gorm"
)

type Bot struct {
	ID        uint      `json:"id" gorm:"primaryKey"`
	UUID      string    `json:"uuid" gorm:"uniqueIndex;type:varchar(36)"`
	Name      string    `json:"name"`
	HTMLFile  string    `json:"html_file"`
	Image     string    `json:"image"`
	Price     float64   `json:"price"`
	RentPrice float64   `json:"rent_price"`
	Strategy  string    `json:"strategy"`
	OwnerID   uint      `json:"owner_id"` // foreign key
	Owner     User      `json:"owner"`    // preload this
	CreatedAt time.Time `json:"created_at"`
	UpdatedAt time.Time `json:"updated_at"`
	Status    string    `json:"status" gorm:"default:'inactive'"`

	SubscriptionType   string `json:"subscription_type"`
	SubscriptionExpiry string `json:"subscription_expiry"`

	Description string `json:"description"`
	Category    string `json:"category"`
	Version     string `json:"version"`

	// Performance metrics
	Performance   string `json:"performance"` // e.g., "+187%"
	WinRate       string `json:"win_rate"`    // e.g., "89%"
	TotalTrades   string `json:"trades"`      // e.g., "12,847"
	Backtested    bool   `json:"backtested" gorm:"default:false"`
	BacktestImage string `json:"backtest_image"`            // Screenshot/proof of backtest results
	Features      string `gorm:"type:text" json:"features"` // JSON array of features
}

// BeforeCreate hook to generate UUID
func (b *Bot) BeforeCreate(tx *gorm.DB) error {
	if b.UUID == "" {
		b.UUID = utils.GenerateUUID()
	}
	return nil
}
