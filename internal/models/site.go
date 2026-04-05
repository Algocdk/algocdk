package models

import (
	"github.com/keyadaniel56/algocdk/internal/utils"
)

type Site struct {
	ID          uint                `json:"id" gorm:"primaryKey"`
	Name        string              `json:"name" gorm:"not null"`
	Description string              `json:"description" gorm:"type:text"`
	Slug        string              `json:"slug" gorm:"uniqueIndex;not null"`
	HTMLContent string              `json:"html_content" gorm:"type:text"` // File path
	Thumbnail   string              `json:"thumbnail" gorm:"type:text"`    // Logo/thumbnail URL
	OwnerID     uint                `json:"owner_id" gorm:"not null"`
	Owner       User                `json:"owner" gorm:"foreignKey:OwnerID"`
	Status      string              `json:"status" gorm:"default:active"`
	IsPublic    bool                `json:"is_public" gorm:"default:true"`
	ViewCount   uint                `json:"view_count" gorm:"default:0"`
	CreatedAt   utils.FormattedTime `json:"created_at"`
	UpdatedAt   utils.FormattedTime `json:"updated_at"`
}

type SiteUser struct {
	ID       uint                `json:"id" gorm:"primaryKey"`
	SiteID   uint                `json:"site_id" gorm:"not null"`
	Site     Site                `json:"site" gorm:"foreignKey:SiteID"`
	UserID   uint                `json:"user_id" gorm:"not null"`
	User     User                `json:"user" gorm:"foreignKey:UserID"`
	Role     string              `json:"role" gorm:"default:member"` // member, moderator
	JoinedAt utils.FormattedTime `json:"joined_at"`
}
