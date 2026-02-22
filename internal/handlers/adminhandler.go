package handlers

import (
	"fmt"
	"mime/multipart"
	"net/http"
	"os"
	"path/filepath"
	"strconv"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
)

// AdminDashboardHandler godoc
// @Summary Get admin dashboard
// @Description Retrieves the admin dashboard information
// @Tags admin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/dashboard [get]
func AdminDashboardHandler(ctx *gin.Context) {
	userIDInterface, exists := ctx.Get("user_id")
	if !exists {
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	userID, ok := userIDInterface.(uint)
	if !ok {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "invalid user id"})
		return
	}

	var admin models.User
	if err := database.DB.First(&admin, userID).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"message": "user not found"})
		return
	}

	// Get admin's bots
	var bots []models.Bot
	database.DB.Where("owner_id = ?", userID).Find(&bots)

	// Get admin's transactions
	var transactions []models.Transaction
	database.DB.Where("admin_id = ?", userID).Order("created_at DESC").Find(&transactions)

	// Calculate metrics
	totalRevenue := 0.0
	adminShare := 0.0
	activeBots := 0
	totalUsers := 0

	for _, bot := range bots {
		if bot.Status == "active" {
			activeBots++
		}
		// Count users for this bot
		var userCount int64
		database.DB.Table("bot_users").Where("bot_id = ?", bot.ID).Count(&userCount)
		totalUsers += int(userCount)
	}

	for _, tx := range transactions {
		if tx.Status == "success" {
			totalRevenue += tx.Amount
			adminShare += tx.AdminShare
		}
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "Dashboard data loaded successfully",
		"data": gin.H{
			"admin": gin.H{
				"id":    admin.ID,
				"name":  admin.Name,
				"email": admin.Email,
			},
			"totalRevenue":       totalRevenue,
			"adminShare":         adminShare,
			"activeBots":         activeBots,
			"totalBots":          len(bots),
			"totalUsers":         totalUsers,
			"totalTransactions":  len(transactions),
			"recentTransactions": transactions[:min(5, len(transactions))],
		},
	})
}

func min(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// AdminProfileHandler godoc
// @Summary Get admin profile
// @Description Retrieves the profile of the current admin
// @Tags admin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]string
// @Router /api/admin/profile [get]
func AdminProfileHandler(ctx *gin.Context) {
	userIDInterface, exists := ctx.Get("user_id")
	if !exists {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	userID, ok := userIDInterface.(uint)
	if !ok {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user id"})
		return
	}

	var person models.User
	if err := database.DB.Where("id = ?", userID).First(&person).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "admin not found"})
		return
	}

	var admin models.Admin
	if err := database.DB.Where("person_id = ?", person.ID).First(&admin).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "admin record not found"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "Admin profile loaded successfully",
		"admin": gin.H{
			"id":                     admin.ID,
			"person_id":              admin.PersonID,
			"name":                   person.Name,
			"email":                  person.Email,
			"role":                   person.Role,
			"country":                person.Country,
			"membership":             person.Membership,
			"total_profits":          person.TotalProfits,
			"active_bots":            person.ActiveBots,
			"total_trades":           person.TotalTrades,
			"phone_number":           admin.PhoneNumber,
			"bank_code":              admin.BankCode,
			"account_number":         admin.AccountNumber,
			"account_name":           admin.AccountName,
			"paystack_subaccount":    admin.PaystackSubaccountCode,
			"kyc_status":             admin.KYCStatus,
			"verified_at":            admin.VerifiedAt,
			"created_at":             person.CreatedAt,
			"updated_at":             person.UpdatedAt,
			"subscription_expiry":    person.SubscriptionExpiry,
			"upgrade_request_status": person.UpgradeRequestStatus,
		},
	})
}

// CreateBotHandler godoc
// @Summary Create a new bot
// @Description Creates a new bot with the provided details and files
// @Tags admin
// @Accept multipart/form-data
// @Produce json
// @Param name formData string true "Bot name"
// @Param price formData number true "Bot price"
// @Param rent_price formData number false "Bot rent price"
// @Param strategy formData string true "Bot strategy"
// @Param subscription_type formData string false "Subscription type"
// @Param description formData string false "Bot description"
// @Param category formData string false "Bot category"
// @Param version formData string false "Bot version"
// @Param html_file formData file true "HTML file"
// @Param image formData file true "Image file"
// @Security ApiKeyAuth
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/create-bot [post]
func CreateBotHandler(c *gin.Context) {
	// Get user_id from context
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}
	userID, ok := userIDInterface.(uint)
	if !ok {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "invalid user_id"})
		return
	}

	// Parse form values
	name := c.PostForm("name")
	priceStr := c.PostForm("price")
	rentPriceStr := c.PostForm("rent_price")
	strategy := c.PostForm("strategy")
	subscriptionType := c.PostForm("subscription_type")
	description := c.PostForm("description")
	category := c.PostForm("category")
	version := c.PostForm("version")

	if name == "" || priceStr == "" || strategy == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "missing required fields (name, price, strategy)"})
		return
	}

	price, err := strconv.ParseFloat(priceStr, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid price"})
		return
	}

	var rentPrice float64
	if rentPriceStr != "" {
		rentPrice, err = strconv.ParseFloat(rentPriceStr, 64)
		if err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid rent_price"})
			return
		}
	}

	now := time.Now()
	baseFolder := fmt.Sprintf("uploads/user_%d/%d/%02d/%02d", userID, now.Year(), now.Month(), now.Day())

	// Helper function to save uploaded file
	saveFile := func(fileHeader *multipart.FileHeader, folder string) (string, error) {
		if err := os.MkdirAll(folder, os.ModePerm); err != nil {
			return "", err
		}
		newName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(fileHeader.Filename))
		path := filepath.Join(folder, newName)
		if err := c.SaveUploadedFile(fileHeader, path); err != nil {
			return "", err
		}
		return path, nil
	}

	// Save HTML file
	htmlFile, err := c.FormFile("html_file")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "html_file required"})
		return
	}
	htmlPath, err := saveFile(htmlFile, filepath.Join(baseFolder, "html"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save html file"})
		return
	}

	// Save image file
	imageFile, err := c.FormFile("image")
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "image required"})
		return
	}
	imagePath, err := saveFile(imageFile, filepath.Join(baseFolder, "images"))
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save image file"})
		return
	}

	// Create bot record
	bot := models.Bot{
		Name:             name,
		HTMLFile:         htmlPath,
		Image:            imagePath,
		Price:            price,
		RentPrice:        rentPrice,
		Strategy:         strategy,
		OwnerID:          userID,
		CreatedAt:        now,
		UpdatedAt:        now,
		Status:           "inactive", // Admin can activate later
		SubscriptionType: subscriptionType,
		Description:      description,
		Category:         category,
		Version:          version,
	}

	if err := database.DB.Create(&bot).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save bot"})
		return
	}

	// Generate bot link for frontend
	botLink := fmt.Sprintf("https://yourfrontend.com/bots/%d", bot.ID)

	c.JSON(http.StatusCreated, gin.H{
		"message":  "Bot created successfully",
		"bot_id":   bot.ID,
		"bot_link": botLink,
	})
}

// GetAdminTransactions godoc
// @Summary Get admin transactions
// @Description Retrieves all transactions for the admin
// @Tags admin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/transactions [get]
func GetAdminTransactions(ctx *gin.Context) {
	userID, exists := ctx.Get("user_id")
	if !exists {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	userIDUint, ok := userID.(uint)
	if !ok {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user id"})
		return
	}

	var transactions []models.Transaction
	if err := database.DB.Where("admin_id = ?", userIDUint).Order("created_at DESC").Find(&transactions).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Error fetching transactions",
			"details": err.Error(),
		})
		return
	}

	totalSales := 0.0
	totalAdminShare := 0.0
	for _, tx := range transactions {
		if tx.PaymentType == "purchase" || tx.PaymentType == "rent" {
			totalSales += tx.Amount
			totalAdminShare += tx.AdminShare
		}
	}

	ctx.JSON(http.StatusOK, gin.H{
		"transactions":       transactions,
		"total_sales":        totalSales,
		"total_admin_share":  totalAdminShare,
		"total_transactions": len(transactions),
	})
}

// ListAdminBotsHandler godoc
// @Summary List admin bots
// @Description Lists all bots created by the admin
// @Tags admin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]string
// @Router /api/admin/bots [get]
func ListAdminBotsHandler(c *gin.Context) {
	// Get user_id from context
	userID := c.GetUint("user_id")

	// Fetch all bots created by this admin
	var bots []models.Bot
	if err := database.DB.Where("owner_id = ?", userID).Find(&bots).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch bots"})
		return
	}

	var botList []gin.H
	for _, bot := range bots {
		// Fetch users associated with this bot
		var users []models.User
		database.DB.Joins("JOIN bot_users ON bot_users.user_id = people.id").
			Where("bot_users.bot_id = ?", bot.ID).
			Find(&users)

		userList := []gin.H{}
		for _, u := range users {
			userList = append(userList, gin.H{
				"id":    u.ID,
				"name":  u.Name,
				"email": u.Email,
			})
		}

		botList = append(botList, gin.H{
			"id":       bot.ID,
			"name":     bot.Name,
			"price":    bot.Price,
			"strategy": bot.Strategy,
			"html":     bot.HTMLFile,
			"image":    bot.Image,
			"users":    userList,
		})
	}

	c.JSON(http.StatusOK, gin.H{
		"admin_id": userID,
		"bots":     botList,
	})
}

// UpdateBotHandler godoc
// @Summary Update a bot
// @Description Updates an existing bot with new details and optional files
// @Tags admin
// @Accept multipart/form-data
// @Produce json
// @Param id path string true "Bot ID"
// @Param name formData string false "Bot name"
// @Param price formData number false "Bot price"
// @Param strategy formData string false "Bot strategy"
// @Param html_file formData file false "HTML file"
// @Param image formData file false "Image file"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/update-bot/{id} [put]
func UpdateBotHandler(c *gin.Context) {
	userID := c.GetUint("user_id")

	// Fetch bot
	var bot models.Bot
	if err := database.DB.First(&bot, c.Param("id")).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bot not found"})
		return
	}

	// Check ownership
	if bot.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "not your bot"})
		return
	}

	// Optional fields
	name := c.PostForm("name")
	priceStr := c.PostForm("price")
	strategy := c.PostForm("strategy")

	if name != "" {
		bot.Name = name
	}
	if strategy != "" {
		bot.Strategy = strategy
	}
	if priceStr != "" {
		if price, err := strconv.ParseFloat(priceStr, 64); err == nil {
			bot.Price = price
		} else {
			c.JSON(http.StatusBadRequest, gin.H{"error": "invalid price"})
			return
		}
	}

	now := time.Now()
	baseFolder := fmt.Sprintf("uploads/user_%d/%d/%02d/%02d", userID, now.Year(), now.Month(), now.Day())

	// Helper to save file
	saveFile := func(file *multipart.FileHeader, folder string) (string, error) {
		os.MkdirAll(folder, os.ModePerm)
		newName := fmt.Sprintf("%d_%s", time.Now().UnixNano(), filepath.Base(file.Filename))
		path := filepath.Join(folder, newName)
		if err := c.SaveUploadedFile(file, path); err != nil {
			return "", err
		}
		return path, nil
	}

	// Update HTML file if provided
	if file, err := c.FormFile("html_file"); err == nil {
		if htmlPath, err := saveFile(file, filepath.Join(baseFolder, "html")); err == nil {
			bot.HTMLFile = htmlPath
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save html file"})
			return
		}
	}

	// Update image if provided
	if file, err := c.FormFile("image"); err == nil {
		if imagePath, err := saveFile(file, filepath.Join(baseFolder, "images")); err == nil {
			bot.Image = imagePath
		} else {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to save image file"})
			return
		}
	}

	// Update timestamp
	bot.UpdatedAt = time.Now()

	// Save changes
	if err := database.DB.Save(&bot).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update bot"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "bot updated", "bot": bot})
}

// UpdateAdminBankDetails godoc
// @Summary Update admin bank details
// @Description Updates the bank details for the admin
// @Tags admin
// @Accept json
// @Produce json
// @Param body body object true "Bank details"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/bank-details [put]
func UpdateAdminBankDetails(ctx *gin.Context) {
	var input struct {
		BankCode      string `json:"bank_code"`
		AccountNumber string `json:"account_number"`
		AccountName   string `json:"account_name"`
	}
	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid input"})
		return
	}

	userID := ctx.GetUint("user_id")
	var admin models.Admin
	if err := database.DB.Where("person_id = ?", userID).First(&admin).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Admin not found"})
		return
	}

	admin.BankCode = input.BankCode
	admin.AccountNumber = input.AccountNumber
	admin.AccountName = input.AccountName
	if err := database.DB.Save(&admin).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update bank details"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "Bank details updated successfully"})
}

// DeleteBotHandler godoc
// @Summary Delete a bot
// @Description Deletes a bot by ID if owned by the admin
// @Tags admin
// @Produce json
// @Param id path string true "Bot ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/delete-bot/{id} [delete]
func DeleteBotHandler(c *gin.Context) {
	userID := c.GetUint("user_id")
	botIDStr := c.Param("id")
	botID, err := strconv.ParseUint(botIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bot ID"})
		return
	}

	var bot models.Bot
	if err := database.DB.First(&bot, botID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bot not found"})
		return
	}

	if bot.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to delete this bot"})
		return
	}

	if err := database.DB.Delete(&bot).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete bot"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "bot deleted successfully"})
}

// BotUsersHandler godoc
// @Summary Get bot users
// @Description Retrieves users associated with a specific bot
// @Tags admin
// @Produce json
// @Param id path string true "Bot ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/admin/bots/{id}/users [get]
func BotUsersHandler(c *gin.Context) {
	userID := c.GetUint("user_id")
	botIDStr := c.Param("id")
	botID, err := strconv.ParseUint(botIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bot ID"})
		return
	}

	var bot models.Bot
	if err := database.DB.First(&bot, botID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bot not found"})
		return
	}

	if bot.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to view this bot's users"})
		return
	}

	// Get users from bot_users table (assuming many-to-many relationship)
	var users []models.User
	database.DB.Joins("JOIN bot_users ON bot_users.user_id = people.id").
		Where("bot_users.bot_id = ?", bot.ID).
		Find(&users)

	userList := []gin.H{}
	for _, u := range users {
		userList = append(userList, gin.H{"id": u.ID, "name": u.Name, "email": u.Email})
	}

	c.JSON(http.StatusOK, gin.H{"bot_id": bot.ID, "bot_name": bot.Name, "users": userList})
}

// RemoveUserFromBotHandler godoc
// @Summary Remove user from bot
// @Description Removes a user from a specific bot
// @Tags admin
// @Produce json
// @Param bot_id path string true "Bot ID"
// @Param user_id path string true "User ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/bots/{bot_id}/users/{user_id} [delete]
func RemoveUserFromBotHandler(c *gin.Context) {
	userID := c.GetUint("user_id")

	// bot_id from URL
	botIDStr := c.Param("bot_id")
	botID, err := strconv.ParseUint(botIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid bot ID"})
		return
	}

	var bot models.Bot
	if err := database.DB.First(&bot, botID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "bot not found"})
		return
	}

	// ownership check
	if bot.OwnerID != userID {
		c.JSON(http.StatusForbidden, gin.H{"error": "not allowed to modify this bot"})
		return
	}

	// user_id from URL
	removeUserIDStr := c.Param("user_id")
	removeUserID, err := strconv.ParseUint(removeUserIDStr, 10, 64)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "invalid user ID"})
		return
	}

	// delete relationship
	res := database.DB.Exec(
		"DELETE FROM bot_users WHERE bot_id = ? AND user_id = ?",
		bot.ID,
		removeUserID,
	)

	if res.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove user"})
		return
	}

	if res.RowsAffected == 0 {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not attached to this bot"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "user removed from bot"})
}
