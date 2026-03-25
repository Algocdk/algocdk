package handlers

import (
	"fmt"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
	services "github.com/keyadaniel56/algocdk/service"
	"gorm.io/gorm"
)

var derivService = services.NewDerivService()

// ============================================
// OAUTH HANDLERS
// ============================================

// InitiateDerivOAuth generates OAuth URL for user
func InitiateDerivOAuth(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	appID := os.Getenv("DERIV_APP_ID")
	fmt.Printf("DEBUG: DERIV_APP_ID from env: '%s'\n", appID)
	if appID == "" {
		appID = "1089"
		fmt.Println("DEBUG: Using default app_id 1089")
	}

	oauthURL := fmt.Sprintf("https://oauth.deriv.com/oauth2/authorize?app_id=%s&l=EN&brand=deriv", appID)
	fmt.Printf("DEBUG: Generated OAuth URL: %s\n", oauthURL)

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"oauth_url": oauthURL,
		"user_id":   userID,
	})
}

// HandleDerivOAuthCallback processes OAuth callback
func HandleDerivOAuthCallback(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req struct {
		Accounts []struct {
			Token    string `json:"token"`
			Currency string `json:"currency"`
			Account  string `json:"account"`
		} `json:"accounts"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	if len(req.Accounts) == 0 {
		c.JSON(http.StatusBadRequest, gin.H{"error": "No accounts provided"})
		return
	}

	// Deactivate old sessions
	database.DB.Model(&models.DerivOAuthSession{}).Where("user_id = ?", userID).Update("is_active", false)

	// Store new sessions without validation (tokens are already validated by Deriv OAuth)
	for _, acc := range req.Accounts {
		// Determine if virtual based on account prefix
		isVirtual := len(acc.Account) > 0 && (acc.Account[0] == 'V' || acc.Account[:3] == "VRT")

		session := models.DerivOAuthSession{
			UserID:    userID.(uint),
			AccountID: acc.Account,
			Token1:    acc.Token,
			Currency:  acc.Currency,
			IsVirtual: isVirtual,
			ExpiresAt: time.Now().Add(60 * 24 * time.Hour), // 60 days
			IsActive:  true,
		}
		if err := database.DB.Create(&session).Error; err != nil {
			fmt.Printf("Failed to save session: %v\n", err)
			continue
		}
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Deriv accounts linked successfully"})
}

// GetLinkedDerivAccounts returns user's linked accounts
func GetLinkedDerivAccounts(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var sessions []models.DerivOAuthSession
	database.DB.Where("user_id = ? AND is_active = ?", userID, true).Find(&sessions)

	accounts := []gin.H{}
	for _, s := range sessions {
		accounts = append(accounts, gin.H{
			"account_id": s.AccountID,
			"currency":   s.Currency,
			"is_virtual": s.IsVirtual,
			"expires_at": s.ExpiresAt,
		})
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "accounts": accounts})
}

// UnlinkDerivAccount removes OAuth session
func UnlinkDerivAccount(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	accountID := c.Param("account_id")
	database.DB.Where("user_id = ? AND account_id = ?", userID, accountID).Delete(&models.DerivOAuthSession{})

	c.JSON(http.StatusOK, gin.H{"success": true, "message": "Account unlinked"})
}

// ============================================
// PUBLIC DERIV HANDLERS (No Auth Required)
// ============================================

// AuthenticateDeriv authenticates user with Deriv API token
func AuthenticateDeriv(c *gin.Context) {
	var req struct {
		APIToken string `json:"api_token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	userInfo, err := derivService.AuthenticateAndGetUserInfo(req.APIToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "Authentication failed",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"message":   "Authentication successful",
		"user_info": userInfo,
	})
}

// GetDerivUserInfo fetches user information from Deriv
func GetDerivUserInfo(c *gin.Context) {
	var req struct {
		APIToken string `json:"api_token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	userInfo, err := derivService.AuthenticateAndGetUserInfo(req.APIToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "Failed to fetch user info",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    userInfo,
	})
}

// GetDerivBalance fetches account balance
func GetDerivBalance(c *gin.Context) {
	var req struct {
		APIToken string `json:"api_token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	balance, err := derivService.GetBalance(req.APIToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "Failed to fetch balance",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    balance,
	})
}

// GetDerivAccountList fetches all accounts (demo + real)
func GetDerivAccountList(c *gin.Context) {
	var req struct {
		APIToken string `json:"api_token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	accountList, err := derivService.GetAccountList(req.APIToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "Failed to fetch account list",
			"details": err.Error(),
		})
		return
	}

	// Separate demo and real accounts with proper bool conversion
	demoAccounts := []map[string]interface{}{}
	realAccounts := []map[string]interface{}{}

	for _, account := range accountList.Accounts {
		// Convert to map with proper boolean values
		accountMap := map[string]interface{}{
			"loginid":              account.LoginID,
			"currency":             account.Currency,
			"is_virtual":           account.IsVirtual == 1,
			"is_disabled":          account.IsDisabled == 1,
			"landing_company_name": account.LandingCompany,
			"account_category":     account.AccountCategory,
			"account_type":         account.AccountType,
		}

		if account.IsVirtual == 1 {
			demoAccounts = append(demoAccounts, accountMap)
		} else {
			realAccounts = append(realAccounts, accountMap)
		}
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data": gin.H{
			"total_accounts": len(accountList.Accounts),
			"demo_accounts":  demoAccounts,
			"real_accounts":  realAccounts,
		},
	})
}

// SwitchDerivAccount switches between demo and real accounts
func SwitchDerivAccount(c *gin.Context) {
	var req struct {
		APIToken string `json:"api_token" binding:"required"`
		LoginID  string `json:"loginid" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	userInfo, err := derivService.SwitchAccount(req.APIToken, req.LoginID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "Failed to switch account",
			"details": err.Error(),
		})
		return
	}

	accountType := "real"
	if userInfo.IsVirtual {
		accountType = "demo"
	}

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"message":      "Account switched successfully",
		"account_type": accountType,
		"user_info":    userInfo,
	})
}

// ============================================
// PROTECTED DERIV HANDLERS (Auth Required)
// ============================================

// GetDerivAccountDetails fetches detailed account information
func GetDerivAccountDetails(c *gin.Context) {
	apiToken := c.GetHeader("X-API-Token")
	if apiToken == "" {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "API token required in X-API-Token header",
		})
		return
	}

	details, err := derivService.GetAccountDetails(apiToken)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error":   "Failed to fetch account details",
			"details": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"data":    details,
	})
}

// ValidateDerivToken validates Deriv API token
func ValidateDerivToken(c *gin.Context) {
	var req struct {
		APIToken string `json:"api_token" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	valid, err := derivService.ValidateToken(req.APIToken)
	if !valid {
		c.JSON(http.StatusUnauthorized, gin.H{
			"valid": false,
			"error": err.Error(),
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"valid":   true,
		"message": "Token is valid",
	})
}

// ============================================
// TOKEN MANAGEMENT HANDLERS (With Stored Tokens)
// ============================================

// SaveDerivToken saves user's Deriv API tokens without validation
func SaveDerivToken(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	var req models.SaveTokenRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	// Basic token format validation only
	if req.DemoToken != "" && len(req.DemoToken) < 10 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Demo token appears to be invalid (too short)",
		})
		return
	}
	if req.RealToken != "" && len(req.RealToken) < 10 {
		c.JSON(http.StatusBadRequest, gin.H{
			"error": "Real token appears to be invalid (too short)",
		})
		return
	}

	// Deactivate existing tokens
	database.DB.Model(&models.DerivCredentials{}).
		Where("user_id = ?", userID).
		Update("is_active", false)

	// Save demo token if provided
	if req.DemoToken != "" {
		credentials := models.DerivCredentials{
			UserID:      userID.(uint),
			APIToken:    req.DemoToken,
			LoginID:     "demo_default",
			AccountType: "demo",
			IsActive:    true,
		}
		database.DB.Create(&credentials)
	}

	// Save real token if provided
	if req.RealToken != "" {
		credentials := models.DerivCredentials{
			UserID:      userID.(uint),
			APIToken:    req.RealToken,
			LoginID:     "real_default",
			AccountType: "real",
			IsActive:    true,
		}
		database.DB.Create(&credentials)
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Deriv API tokens saved successfully. Validation will occur when tokens are used.",
	})
}

// GetUserDerivToken retrieves user's saved Deriv token
func GetUserDerivToken(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	accountType := c.Query("account_type")
	if accountType == "" {
		accountType = "demo" // Default to demo
	}

	var credentials models.DerivCredentials
	if err := database.DB.Where("user_id = ? AND account_type = ?", userID, accountType).
		Order("created_at DESC").First(&credentials).Error; err != nil {
		if err == gorm.ErrRecordNotFound {
			c.JSON(http.StatusOK, gin.H{
				"success":   true,
				"has_token": false,
				"token":     nil,
			})
			return
		}
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to retrieve token",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success":   true,
		"has_token": true,
		"token":     credentials.APIToken,
		"data": gin.H{
			"loginid":      credentials.LoginID,
			"account_type": credentials.AccountType,
			"created_at":   credentials.CreatedAt,
		},
	})
}

// DeleteDerivToken removes user's Deriv API token
func DeleteDerivToken(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	if err := database.DB.Where("user_id = ?", userID).
		Delete(&models.DerivCredentials{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to delete token",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Deriv API token removed successfully",
	})
}

// UpdateDerivAccountPreference updates user's preferred account
func UpdateDerivAccountPreference(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	var req models.UpdateAccountTypeRequest
	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	result := database.DB.Model(&models.DerivCredentials{}).
		Where("user_id = ? AND is_active = ?", userID, true).
		Updates(map[string]interface{}{
			"loginid":      req.LoginID,
			"account_type": req.AccountType,
		})

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error": "Failed to update preference",
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"success": true,
		"message": "Account preference updated",
		"data": gin.H{
			"loginid":      req.LoginID,
			"account_type": req.AccountType,
		},
	})
}

// GetDerivUserInfoWithStoredToken fetches user info using OAuth session
func GetDerivUserInfoWithStoredToken(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var session models.DerivOAuthSession
	if err := database.DB.Where("user_id = ? AND is_active = ?", userID, true).First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No Deriv account linked"})
		return
	}

	userInfo, err := derivService.AuthenticateAndGetUserInfo(session.Token1)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to fetch user info", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": userInfo})
}

// GetDerivBalanceWithStoredToken fetches balance using OAuth session
func GetDerivBalanceWithStoredToken(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var session models.DerivOAuthSession
	if err := database.DB.Where("user_id = ? AND is_active = ?", userID, true).First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No Deriv account linked"})
		return
	}

	balance, err := derivService.GetBalance(session.Token1)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to fetch balance", "details": err.Error()})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "data": balance})
}

// GetDerivAccountListWithStoredToken fetches account list using OAuth session
func GetDerivAccountListWithStoredToken(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var session models.DerivOAuthSession
	if err := database.DB.Where("user_id = ? AND is_active = ?", userID, true).First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No Deriv account linked"})
		return
	}

	accountList, err := derivService.GetAccountList(session.Token1)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to fetch account list", "details": err.Error()})
		return
	}

	accounts := []map[string]interface{}{}
	for _, account := range accountList.Accounts {
		userInfo, err := derivService.SwitchAccount(session.Token1, account.LoginID)
		balance := 0.0
		if err == nil {
			balance = userInfo.Balance
		}

		accountMap := map[string]interface{}{
			"loginid":              account.LoginID,
			"currency":             account.Currency,
			"is_virtual":           account.IsVirtual == 1,
			"is_disabled":          account.IsDisabled == 1,
			"landing_company_name": account.LandingCompany,
			"account_category":     account.AccountCategory,
			"account_type":         account.AccountType,
			"balance":              balance,
		}
		accounts = append(accounts, accountMap)
	}

	c.JSON(http.StatusOK, gin.H{"success": true, "accounts": accounts})
}

// SwitchDerivAccountWithStoredToken switches account using stored token
func SwitchDerivAccountWithStoredToken(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{
			"error": "User not authenticated",
		})
		return
	}

	var req struct {
		LoginID string `json:"loginid" binding:"required"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid request",
			"details": err.Error(),
		})
		return
	}

	var session models.DerivOAuthSession
	if err := database.DB.Where("user_id = ? AND is_active = ?", userID, true).First(&session).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "No Deriv account linked"})
		return
	}

	_, err := derivService.SwitchAccount(session.Token1, req.LoginID)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to switch account", "details": err.Error()})
		return
	}

	balanceInfo, err := derivService.GetBalance(session.Token1)
	if err != nil {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Failed to get balance after switch", "details": err.Error()})
		return
	}

	accountType := "real"
	if balanceInfo.IsVirtual {
		accountType = "demo"
	}

	database.DB.Model(&session).Updates(map[string]interface{}{
		"account_id": req.LoginID,
		"is_virtual": balanceInfo.IsVirtual,
	})

	c.JSON(http.StatusOK, gin.H{
		"success":      true,
		"message":      "Account switched successfully",
		"account_type": accountType,
		"loginid":      req.LoginID,
		"balance":      balanceInfo.Balance,
		"currency":     balanceInfo.Currency,
		"is_virtual":   balanceInfo.IsVirtual,
	})
}

// PlaceDerivTrade places a trade using OAuth session
func PlaceDerivTrade(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "User not authenticated"})
		return
	}

	var req struct {
		Symbol    string  `json:"symbol" binding:"required"`
		TradeType string  `json:"trade_type" binding:"required"`
		Stake     float64 `json:"amount" binding:"required"`
		Duration  int     `json:"duration" binding:"required"`
		BotID     uint    `json:"bot_id,omitempty"`
		AccountID string  `json:"account_id"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request", "details": err.Error()})
		return
	}

	var session models.DerivOAuthSession
	query := database.DB.Where("user_id = ? AND is_active = ?", userID, true)
	if req.AccountID != "" {
		query = query.Where("account_id = ?", req.AccountID)
	}
	if err := query.First(&session).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{
			"error":   "No Deriv account linked",
			"message": "Please link your Deriv account via OAuth",
		})
		return
	}

	tradeResult, err := derivService.PlaceTrade(session.Token1, req.Symbol, req.TradeType, req.Stake, req.Duration)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Failed to place trade", "details": err.Error()})
		return
	}

	trade := models.Trade{
		UserID:       userID.(uint),
		BotID:        req.BotID,
		DerivTradeID: tradeResult.ContractID,
		Symbol:       req.Symbol,
		TradeType:    req.TradeType,
		Stake:        req.Stake,
		Payout:       tradeResult.Payout,
		Status:       "open",
		OpenTime:     time.Now(),
		CreatedAt:    time.Now(),
	}

	database.DB.Create(&trade)

	c.JSON(http.StatusOK, gin.H{
		"success":     true,
		"message":     "Trade placed successfully",
		"contract_id": tradeResult.ContractID,
		"payout":      tradeResult.Payout,
		"trade_id":    trade.ID,
	})
}
