package models

import (
	"github.com/keyadaniel56/algocdk/internal/utils"
	"gorm.io/gorm"
)

type SuperAdmin struct {
	ID           uint                `json:"id" gorm:"primaryKey"`
	UUID         string              `json:"uuid" gorm:"uniqueIndex;type:varchar(36)"`
	Name         string              `json:"name"`
	Email        string              `json:"email" gorm:"uniqueIndex"`
	Password     string              `json:"-"`
	Role         string              `json:"role" gorm:"default:superadmin"`
	Country      string              `json:"country" gorm:"default:kenya"`
	Membership   string              `json:"member_ship_type" gorm:"default:owner"`
	CreatedAt    utils.FormattedTime `json:"created_at"`
	UpdatedAt    utils.FormattedTime `json:"updated_at"`
	TotalProfits uint                `json:"total_profits"`
	ActiveBots   uint                `json:"active_bots"`
	TotalTrades  uint                `json:"total_trades"`
}

// BeforeCreate hook to generate UUID
func (s *SuperAdmin) BeforeCreate(tx *gorm.DB) error {
	if s.UUID == "" {
		s.UUID = utils.GenerateUUID()
	}
	return nil
}
