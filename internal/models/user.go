package models

import (
	"time"

	"github.com/keyadaniel56/algocdk/internal/utils"
	"gorm.io/gorm"
)

type User struct {
	ID                   uint                `json:"id" gorm:"primaryKey"`
	UUID                 string              `json:"uuid" gorm:"uniqueIndex;type:varchar(36)"`
	Name                 string              `json:"name"`
	Email                string              `json:"email" gorm:"uniqueIndex"`
	Password             string              `json:"-"`
	Role                 string              `json:"role" gorm:"default:user"`
	Country              string              `json:"country"`
	Membership           string              `json:"member_ship_type" gorm:"default:freemium"`
	EmailVerified        bool                `gorm:"default:false"`
	VerificationToken    string              `json:"-"`
	RefreshToken         string              `json:"refresh_token"`
	ResetToken           string              `json:"-"`
	ResetExpiry          time.Time           `json:"-"`
	CreatedAt            utils.FormattedTime `json:"created_at"`
	UpdatedAt            utils.FormattedTime `json:"updated_at"`
	TotalProfits         uint                `json:"total_profits"`
	ActiveBots           uint                `json:"active_bots"`
	TotalTrades          uint                `json:"total_trades"`
	SubscriptionExpiry   time.Time           `json:"subscription_expiry"`
	UpgradeRequestStatus string              `json:"upgrade_request_status" gorm:"type:varchar(20);default:null"`
}

// BeforeCreate hook to generate UUID
func (u *User) BeforeCreate(tx *gorm.DB) error {
	if u.UUID == "" {
		u.UUID = utils.GenerateUUID()
	}
	return nil
}
