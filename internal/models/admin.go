package models

import (
	"gorm.io/gorm"
	"time"

	"github.com/keyadaniel56/algocdk/internal/utils"
)

type Admin struct {
	ID          uint   `gorm:"primaryKey" json:"id"`
	UUID        string `json:"uuid" gorm:"uniqueIndex;type:varchar(36)"`
	PersonID    uint   `gorm:"uniqueIndex" json:"person_id"` // links to Person table
	Person      User   `gorm:"foreignKey:PersonID" json:"person"`
	PhoneNumber int64  `json:"phone_number"`
	// Payment / KYC / Paystack
	BankCode               string     `json:"bank_code"`
	AccountNumber          string     `json:"account_number"`
	AccountName            string     `json:"account_name"`
	PaystackSubaccountCode string     `json:"paystack_subaccount_code"`
	KYCStatus              string     `gorm:"default:unverified" json:"kyc_status"`
	VerifiedAt             *time.Time `json:"verified_at"`

	CreatedAt time.Time      `json:"created_at"`
	UpdatedAt time.Time      `json:"updated_at"`
	DeletedAt gorm.DeletedAt `gorm:"index" json:"-"`
}

// BeforeCreate hook to generate UUID
func (a *Admin) BeforeCreate(tx *gorm.DB) error {
	if a.UUID == "" {
		a.UUID = utils.GenerateUUID()
	}
	return nil
}
