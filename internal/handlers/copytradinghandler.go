package handlers

import (
	"net/http"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
)

// ── Admin: enable copy trading ─────────────────────────────────────────

func EnableCopyTrading(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	var req struct {
		DisplayName  string  `json:"display_name"`
		Description  string  `json:"description"`
		DerivLoginID string  `json:"deriv_login_id"`
		MinCopyStake float64 `json:"min_copy_stake"`
		MaxCopyStake float64 `json:"max_copy_stake"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	var provider models.CopyTradingProvider
	result := database.DB.Where("admin_id = ?", adminID).First(&provider)
	if result.Error != nil {
		// Create new
		provider = models.CopyTradingProvider{
			AdminID:      adminID,
			DisplayName:  req.DisplayName,
			Description:  req.Description,
			DerivLoginID: req.DerivLoginID,
			MinCopyStake: req.MinCopyStake,
			MaxCopyStake: req.MaxCopyStake,
			IsActive:     true,
			AllowCopying: true,
		}
		if err := database.DB.Create(&provider).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to enable copy trading"})
			return
		}
	} else {
		// Update existing
		database.DB.Model(&provider).Updates(map[string]interface{}{
			"display_name":   req.DisplayName,
			"description":    req.Description,
			"deriv_login_id": req.DerivLoginID,
			"min_copy_stake": req.MinCopyStake,
			"max_copy_stake": req.MaxCopyStake,
			"is_active":      true,
			"allow_copying":  true,
		})
	}
	c.JSON(http.StatusOK, gin.H{"success": true, "provider": provider})
}

func DisableCopyTrading(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	database.DB.Model(&models.CopyTradingProvider{}).
		Where("admin_id = ?", adminID).
		Update("allow_copying", false)
	c.JSON(http.StatusOK, gin.H{"success": true})
}

func GetProviderStats(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	var provider models.CopyTradingProvider
	if err := database.DB.Where("admin_id = ?", adminID).First(&provider).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not a copy trading provider"})
		return
	}
	// Count active copiers
	var copierCount int64
	database.DB.Model(&models.CopyTradingSubscription{}).
		Where("provider_id = ? AND is_active = ?", provider.ID, true).
		Count(&copierCount)
	provider.TotalCopiers = int(copierCount)
	database.DB.Save(&provider)
	c.JSON(http.StatusOK, gin.H{"provider": provider})
}

func GetProviderCopiers(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	var provider models.CopyTradingProvider
	if err := database.DB.Where("admin_id = ?", adminID).First(&provider).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not a provider"})
		return
	}
	var subs []models.CopyTradingSubscription
	database.DB.Preload("User").Where("provider_id = ?", provider.ID).Find(&subs)
	c.JSON(http.StatusOK, gin.H{"copiers": subs})
}

func GetProviderTrades(c *gin.Context) {
	adminID := c.GetUint("admin_id")
	var provider models.CopyTradingProvider
	if err := database.DB.Where("admin_id = ?", adminID).First(&provider).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "not a provider"})
		return
	}
	var trades []models.CopyTrade
	database.DB.Where("provider_id = ?", provider.ID).Order("created_at desc").Limit(50).Find(&trades)
	c.JSON(http.StatusOK, gin.H{"trades": trades})
}

// ── Public: list providers ─────────────────────────────────────────────

func ListCopyTradingProviders(c *gin.Context) {
	var providers []models.CopyTradingProvider
	database.DB.Preload("Admin").
		Where("is_active = ? AND allow_copying = ?", true, true).
		Order("total_trades desc").
		Find(&providers)
	c.JSON(http.StatusOK, gin.H{"providers": providers})
}

func GetProviderByID(c *gin.Context) {
	id, _ := strconv.Atoi(c.Param("id"))
	var provider models.CopyTradingProvider
	if err := database.DB.Preload("Admin").First(&provider, id).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"provider": provider})
}

// ── User: subscribe / unsubscribe ──────────────────────────────────────

func StartCopying(c *gin.Context) {
	userID := c.GetUint("user_id")
	providerID, _ := strconv.Atoi(c.Param("provider_id"))

	var req struct {
		StakeMultiplier  float64 `json:"stake_multiplier"`
		MaxStakePerTrade float64 `json:"max_stake_per_trade"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if req.StakeMultiplier <= 0 {
		req.StakeMultiplier = 1
	}
	if req.MaxStakePerTrade <= 0 {
		req.MaxStakePerTrade = 10
	}

	// Check provider exists and allows copying
	var provider models.CopyTradingProvider
	if err := database.DB.First(&provider, providerID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "provider not found"})
		return
	}
	if !provider.AllowCopying || !provider.IsActive {
		c.JSON(http.StatusForbidden, gin.H{"error": "provider is not accepting copiers"})
		return
	}

	// Check not already copying
	var existing models.CopyTradingSubscription
	if err := database.DB.Where("user_id = ? AND provider_id = ? AND is_active = ?", userID, providerID, true).First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "already copying this provider"})
		return
	}

	now := time.Now()
	sub := models.CopyTradingSubscription{
		UserID:           userID,
		ProviderID:       uint(providerID),
		StakeMultiplier:  req.StakeMultiplier,
		MaxStakePerTrade: req.MaxStakePerTrade,
		IsActive:         true,
		StartedAt:        now,
	}
	if err := database.DB.Create(&sub).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to start copying"})
		return
	}

	// Update copier count
	database.DB.Model(&provider).UpdateColumn("total_copiers", provider.TotalCopiers+1)

	c.JSON(http.StatusOK, gin.H{"success": true, "subscription": sub, "provider_deriv_login_id": provider.DerivLoginID})
}

func StopCopying(c *gin.Context) {
	userID := c.GetUint("user_id")
	providerID, _ := strconv.Atoi(c.Param("provider_id"))

	now := time.Now()
	result := database.DB.Model(&models.CopyTradingSubscription{}).
		Where("user_id = ? AND provider_id = ? AND is_active = ?", userID, providerID, true).
		Updates(map[string]interface{}{"is_active": false, "stopped_at": now})

	if result.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active subscription found"})
		return
	}

	// Update copier count
	database.DB.Model(&models.CopyTradingProvider{}).Where("id = ?", providerID).
		UpdateColumn("total_copiers", database.DB.Raw("GREATEST(total_copiers - 1, 0)"))

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func GetMySubscriptions(c *gin.Context) {
	userID := c.GetUint("user_id")
	var subs []models.CopyTradingSubscription
	database.DB.Preload("Provider").Preload("Provider.Admin").
		Where("user_id = ?", userID).
		Order("created_at desc").
		Find(&subs)
	c.JSON(http.StatusOK, gin.H{"subscriptions": subs})
}

func GetMyCopiedTrades(c *gin.Context) {
	userID := c.GetUint("user_id")
	var trades []models.CopyTrade
	database.DB.Where("user_id = ?", userID).Order("created_at desc").Limit(50).Find(&trades)
	c.JSON(http.StatusOK, gin.H{"trades": trades})
}

// RecordCopyTrade — called when a copied trade result comes back from Deriv
func RecordCopyTrade(c *gin.Context) {
	userID := c.GetUint("user_id")
	var req struct {
		SubscriptionID  uint    `json:"subscription_id"`
		ProviderTradeID string  `json:"provider_trade_id"`
		CopierTradeID   string  `json:"copier_trade_id"`
		ProviderID      uint    `json:"provider_id"`
		Symbol          string  `json:"symbol"`
		TradeType       string  `json:"trade_type"`
		OriginalStake   float64 `json:"original_stake"`
		CopiedStake     float64 `json:"copied_stake"`
		Payout          float64 `json:"payout"`
		ProfitLoss      float64 `json:"profit_loss"`
		Status          string  `json:"status"`
	}
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	trade := models.CopyTrade{
		SubscriptionID:  req.SubscriptionID,
		ProviderTradeID: req.ProviderTradeID,
		CopierTradeID:   req.CopierTradeID,
		UserID:          userID,
		ProviderID:      req.ProviderID,
		Symbol:          req.Symbol,
		TradeType:       req.TradeType,
		OriginalStake:   req.OriginalStake,
		CopiedStake:     req.CopiedStake,
		Payout:          req.Payout,
		ProfitLoss:      req.ProfitLoss,
		Status:          req.Status,
	}
	database.DB.Create(&trade)

	// Update subscription stats
	database.DB.Model(&models.CopyTradingSubscription{}).Where("id = ?", req.SubscriptionID).
		UpdateColumns(map[string]interface{}{
			"total_copied": database.DB.Raw("total_copied + 1"),
			"total_profit": database.DB.Raw("total_profit + ?", req.ProfitLoss),
		})

	c.JSON(http.StatusOK, gin.H{"success": true})
}
