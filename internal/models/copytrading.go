package models

import "time"

// CopyTradingProvider — an admin who has enabled copy trading
type CopyTradingProvider struct {
	ID           uint      `gorm:"primaryKey" json:"id"`
	AdminID      uint      `json:"admin_id" gorm:"uniqueIndex"`
	Admin        User      `json:"admin" gorm:"foreignKey:AdminID"`
	DisplayName  string    `json:"display_name"`
	Description  string    `json:"description"`
	DerivLoginID string    `json:"deriv_login_id"` // provider's Deriv login ID (public, not token)
	IsActive     bool      `json:"is_active" gorm:"default:true"`
	AllowCopying bool      `json:"allow_copying" gorm:"default:true"`
	MinCopyStake float64   `json:"min_copy_stake" gorm:"default:1"`
	MaxCopyStake float64   `json:"max_copy_stake" gorm:"default:100"`
	TotalCopiers int       `json:"total_copiers" gorm:"default:0"`
	WinRate      float64   `json:"win_rate" gorm:"default:0"`
	TotalTrades  int       `json:"total_trades" gorm:"default:0"`
	TotalProfit  float64   `json:"total_profit" gorm:"default:0"`
	CreatedAt    time.Time `json:"created_at"`
	UpdatedAt    time.Time `json:"updated_at"`
}

// CopyTradingSubscription — a user copying a provider
type CopyTradingSubscription struct {
	ID               uint                `gorm:"primaryKey" json:"id"`
	UserID           uint                `json:"user_id"`
	User             User                `json:"user" gorm:"foreignKey:UserID"`
	ProviderID       uint                `json:"provider_id"`
	Provider         CopyTradingProvider `json:"provider" gorm:"foreignKey:ProviderID"`
	StakeMultiplier  float64             `json:"stake_multiplier" gorm:"default:1"` // multiply provider stake by this
	MaxStakePerTrade float64             `json:"max_stake_per_trade" gorm:"default:10"`
	IsActive         bool                `json:"is_active" gorm:"default:true"`
	TotalCopied      int                 `json:"total_copied" gorm:"default:0"`
	TotalProfit      float64             `json:"total_profit" gorm:"default:0"`
	StartedAt        time.Time           `json:"started_at"`
	StoppedAt        *time.Time          `json:"stopped_at,omitempty"`
	CreatedAt        time.Time           `json:"created_at"`
	UpdatedAt        time.Time           `json:"updated_at"`
}

// CopyTrade — a trade that was copied from a provider to a subscriber
type CopyTrade struct {
	ID              uint      `gorm:"primaryKey" json:"id"`
	SubscriptionID  uint      `json:"subscription_id"`
	ProviderTradeID string    `json:"provider_trade_id"` // original Deriv contract ID
	CopierTradeID   string    `json:"copier_trade_id"`   // copied Deriv contract ID
	UserID          uint      `json:"user_id"`
	ProviderID      uint      `json:"provider_id"`
	Symbol          string    `json:"symbol"`
	TradeType       string    `json:"trade_type"`
	OriginalStake   float64   `json:"original_stake"`
	CopiedStake     float64   `json:"copied_stake"`
	Payout          float64   `json:"payout"`
	ProfitLoss      float64   `json:"profit_loss"`
	Status          string    `json:"status"` // "open", "won", "lost"
	CreatedAt       time.Time `json:"created_at"`
	UpdatedAt       time.Time `json:"updated_at"`
}
