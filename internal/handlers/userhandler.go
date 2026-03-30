package handlers

import (
	"fmt"
	"log"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
	"github.com/keyadaniel56/algocdk/internal/utils"
	"gorm.io/gorm"
)

// SignupHandler godoc
// @Summary User signup
// @Description Registers a new user with name, email, and password
// @Tags auth
// @Accept json
// @Produce json
// @Param body body object true "User signup details"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/auth/signup [post]
func SignupHandler(ctx *gin.Context) {
	var payload struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{
			"error":   "invalid request body",
			"details": err.Error(),
		})
		return
	}

	payload.Email = strings.TrimSpace(strings.ToLower(payload.Email))
	payload.Password = strings.TrimSpace(payload.Password)
	payload.Name = strings.TrimSpace(payload.Name)

	if payload.Name == "" || payload.Email == "" || payload.Password == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{
			"error": "all fields must be provided",
		})
		return
	}

	if !utils.IsValidEmail(payload.Email) {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid email"})
		return
	}

	if !utils.IsValidPassword(payload.Password) {
		ctx.JSON(http.StatusBadRequest, gin.H{
			"error": "password must contain a-z, A-Z, 0-9 and a special character",
		})
		return
	}

	// ✅ Get real client IP
	clientIP := ctx.ClientIP()

	// ✅ Cached country detection
	country, err := utils.DetectCountryCached(clientIP)
	if err != nil || country == "" {
		country = "Unknown"
	}

	hashed, err := utils.HashPassword(payload.Password)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "password hashing failed"})
		return
	}

	// Generate verification token
	verificationToken, hashedToken, err := utils.GenerateResetToken()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate verification token"})
		return
	}

	user := models.User{
		Name:              payload.Name,
		Email:             payload.Email,
		Password:          hashed,
		Country:           country,
		EmailVerified:     false,
		VerificationToken: hashedToken,
		CreatedAt:         utils.FormattedTime(time.Now()),
		UpdatedAt:         utils.FormattedTime(time.Now()),
	}

	if err := database.DB.Create(&user).Error; err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			// check if existing account is unverified — resend verification
			var existing models.User
			if dbErr := database.DB.Where("email = ?", payload.Email).First(&existing).Error; dbErr == nil && !existing.EmailVerified {
				newToken, newHashed, tokenErr := utils.GenerateResetToken()
				if tokenErr == nil {
					database.DB.Model(&existing).Updates(map[string]interface{}{
						"verification_token": newHashed,
						"updated_at":         utils.FormattedTime(time.Now()),
					})
					verificationLink := fmt.Sprintf("%s/api/auth/verify-email?token=%s", os.Getenv("BASE_URL"), newToken)
					go utils.SendVerificationEmail(existing.Email, verificationLink)
				}
				ctx.JSON(http.StatusConflict, gin.H{
					"error":  "This email is registered but not yet verified. A new verification email has been sent.",
					"resent": true,
					"email":  payload.Email,
				})
				return
			}
			ctx.JSON(http.StatusConflict, gin.H{"error": "An account with this email already exists. Please log in."})
			return
		}
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Could not create account. Please try again."})
		return
	}

	// Send verification email
	verificationLink := fmt.Sprintf("%s/api/auth/verify-email?token=%s",
		os.Getenv("BASE_URL"), verificationToken)
	go utils.SendVerificationEmail(user.Email, verificationLink)

	ctx.JSON(http.StatusOK, gin.H{
		"message": "Account created successfully! Please check your email to verify your account.",
		"email":   payload.Email,
		"country": country,
	})
}

// LoginHandler godoc
// @Summary User login
// @Description Logs in a user with email and password
// @Tags auth
// @Accept json
// @Produce json
// @Param body body object true "User login details"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/auth/login [post]
func LoginHandler(ctx *gin.Context) {
	var payload struct {
		Email        string `json:"email"`
		Password     string `json:"password"`
		RefreshToken string `json:"refresh_token"`
	}
	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	payload.Email = strings.TrimSpace(strings.ToLower(payload.Email))
	payload.Password = strings.TrimSpace(payload.Password)
	if payload.Email == "" || payload.Password == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "email and password is required to signup"})
	}

	var user models.User
	if err := database.DB.Where("email=?", payload.Email).First(&user).Error; err != nil {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	if !user.EmailVerified {
		ctx.JSON(http.StatusUnauthorized, gin.H{
			"error": "email not verified",
			"code":  "EMAIL_NOT_VERIFIED",
			"email": user.Email,
		})
		return
	}

	if !utils.IsHashed(user.Password, payload.Password) {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
		return
	}
	token, _ := utils.GenerateToken(user.ID, user.Email, user.Role)
	payload.RefreshToken, _ = utils.RefreshToken(user.Email)
	ctx.JSON(http.StatusOK, gin.H{
		"message":       "login succesful",
		"token":         token,
		"refresh_token": payload.RefreshToken,
		"role":          user.Role,
		"membership":    user.Membership,
		"user": gin.H{
			"id":    user.ID,
			"name":  user.Name,
			"email": user.Email,
		},
		"last_login": time.Now(),
	})
}

// ProfileHandler godoc
// @Summary Get user profile
// @Description Retrieves user profile by ID
// @Tags user
// @Produce json
// @Param id path string true "User ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]string
// @Router /api/user/profile/{id} [get]
func ProfileHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	upgradeMessage := ""
	switch user.UpgradeRequestStatus {
	case "pending":
		upgradeMessage = "Your request to become admin is pending."
	case "approved":
		upgradeMessage = "Your request has been approved. You are now an admin."
	case "rejected":
		upgradeMessage = "Your request to become admin has been rejected."
	default:
		upgradeMessage = "You have not requested to become an admin."
	}

	ctx.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":             user.ID,
			"name":           user.Name,
			"email":          user.Email,
			"joined":         time.Time(user.CreatedAt).Format(time.RFC3339),
			"membership":     user.Membership,
			"role":           user.Role,
			"upgrade_status": upgradeMessage,
		},
	})
}

// UpdateProfile godoc
// @Summary Update user profile
// @Description Updates user profile details by ID
// @Tags user
// @Accept json
// @Produce json
// @Param id path string true "User ID"
// @Param body body object true "Profile update details"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/user/updateprofile/{id} [post]
func UpdateProfile(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized - missing user ID"})
		return
	}

	var payload struct {
		FullName string `json:"full_name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Phone    string `json:"phone"`
		Country  string `json:"country"`
		Timezone string `json:"timezone"`
		Language string `json:"language"`
		Bio      string `json:"bio"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body", "details": err.Error()})
		return
	}

	var user models.User
	if err := database.DB.First(&user, "id = ?", userID).Error; err != nil { // Use WHERE for safety
		ctx.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if payload.FullName != "" {
		user.Name = strings.TrimSpace(payload.FullName) // Assuming model field is Name; change to user.FullName if model updated
	}
	// if payload.Phone != "" {
	//     user.Phone = strings.TrimSpace(payload.Phone) // Add to models.User if missing
	// }
	if payload.Country != "" {
		user.Country = strings.TrimSpace(payload.Country)
	}
	// if payload.Timezone != "" {
	//     user.Timezone = strings.TrimSpace(payload.Timezone)
	// }
	// if payload.Language != "" {
	//     user.Language = strings.TrimSpace(payload.Language)
	// }
	// if payload.Bio != "" {
	//     user.Bio = strings.TrimSpace(payload.Bio)
	// }
	if payload.Email != "" {
		if !utils.IsValidEmail(payload.Email) {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid email"})
			return
		}
		user.Email = payload.Email
	}
	if payload.Password != "" {
		hashed, err := utils.HashPassword(payload.Password)
		if err != nil {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password", "details": err.Error()})
			return
		}
		user.Password = hashed
	}

	user.UpdatedAt = utils.FormattedTime(time.Now())
	if err := database.DB.Save(&user).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update profile", "details": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "profile updated successfully",
		"data": gin.H{
			"id":    user.ID,
			"name":  user.Name, // Or "full_name": user.Name
			"email": user.Email,
			// "phone":           user.Phone,
			"country": user.Country,
			// "timezone":        user.Timezone,
			// "language":        user.Language,
			// "bio":             user.Bio,
			"membership_type": user.Membership,
			"created_at":      user.CreatedAt,
			"updated_at":      user.UpdatedAt,
		},
	})
}

// DeleteAccountHandler godoc
// @Summary Delete user account
// @Description Deletes a user account by ID
// @Tags user
// @Produce json
// @Param id path string true "User ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/user/delete_account/{id} [delete]
func DeleteAccountHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}
	if err := database.DB.Delete(&models.User{}, userID).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete account"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"message": "account deleted succesfully"})
}

// ResetPasswordHandler godoc
// @Summary Reset user password
// @Description Resets user password using a token
// @Tags user
// @Accept json
// @Produce json
// @Param id path string true "User ID"
// @Param body body object true "Reset password details"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Router /api/user/reset_password/{id} [post]
func ResetPasswordHandler(ctx *gin.Context) {
	var payload struct {
		Token       string `json:"token"`
		NewPassword string `json:"new_password"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request"})
		return
	}

	if !utils.IsValidPassword(payload.NewPassword) {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "weak password"})
		return
	}

	hashedToken := utils.HashSHA256(payload.Token)

	var user models.User
	if err := database.DB.
		Where("reset_token = ?", hashedToken).
		First(&user).Error; err != nil {

		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid token"})
		return
	}

	if time.Now().After(user.ResetExpiry) {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "token expired"})
		return
	}

	hashedPassword, _ := utils.HashPassword(payload.NewPassword)

	user.Password = hashedPassword
	user.ResetToken = ""
	user.ResetExpiry = time.Time{}

	database.DB.Save(&user)

	ctx.JSON(http.StatusOK, gin.H{"message": "password reset successful"})
}

// ToggleFavorite godoc
// @Summary Toggle favorite bot
// @Description Toggles a bot as favorite for the user
// @Tags user
// @Produce json
// @Param id path string true "Bot ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/user/togole_favorite/{id} [get]
func ToggleFavorite(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)
	userID := c.GetUint("user_id")

	botID, err := strconv.Atoi(c.Param("bot_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid bot ID"})
		return
	}

	var favorite models.Favorite

	// Check if this favorite already exists
	err = db.Where("user_id = ? AND bot_id = ?", userID, botID).First(&favorite).Error

	if err == nil {
		// Exists → unfavorite (delete)
		db.Delete(&favorite)
		c.JSON(http.StatusOK, gin.H{
			"message": "Bot removed from favorites",
			"status":  "unfavorited",
		})
		return
	}

	if err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Not found → favorite it
	newFavorite := models.Favorite{
		UserID: userID,
		BotID:  uint(botID),
	}

	if err := db.Create(&newFavorite).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add favorite"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Bot added to favorites",
		"status":  "favorited",
	})
}

// GetUserFavorites godoc
// @Summary Get user favorites
// @Description Retrieves the list of favorite bots for the user
// @Tags user
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/user/favorite/me [get]
func GetUserFavorites(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "Unauthorized"})
		return
	}

	var favorites []models.Favorite

	// Load all favorites (bots and indicators)
	if err := database.DB.Where("user_id = ?", userID).Find(&favorites).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to fetch favorites"})
		return
	}

	// Return raw favorites with both bot_id and indicator_id
	var items []gin.H
	for _, fav := range favorites {
		item := gin.H{
			"id": fav.ID,
		}
		if fav.BotID > 0 {
			item["bot_id"] = fav.BotID
		}
		if fav.IndicatorID > 0 {
			item["indicator_id"] = fav.IndicatorID
		}
		items = append(items, item)
	}

	c.JSON(http.StatusOK, gin.H{
		"message":   "Favorites retrieved successfully",
		"favorites": items,
	})
}

// ForgotPasswordHandler godoc
// @Summary Forgot password
// @Description Sends a password reset link to the user's email
// @Tags auth
// @Accept json
// @Produce json
// @Param body body object true "Email for password reset"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/auth/forgot_password/ [post]
func ForgotPasswordHandler(ctx *gin.Context) {
	var payload struct {
		Email string `json:"email"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	var user models.User
	if err := database.DB.Where("email=?", payload.Email).First(&user).Error; err != nil {
		ctx.JSON(http.StatusOK, gin.H{"message": "if the email exists , a reset link was sent"})
		return
	}
	token, hashedToken, err := utils.GenerateResetToken()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}
	user.ResetToken = hashedToken
	user.ResetExpiry = time.Now().Add(15 * time.Minute)
	database.DB.Save(&user)

	resetLink := fmt.Sprintf("%s/reset-password?token=%s", os.Getenv("BASE_URL"), token)

	go utils.SendResetEmail(user.Email, resetLink)
	ctx.JSON(http.StatusOK, gin.H{
		"message": "If the email exists, a reset link was sent",
	})
}

// VerifyEmailHandler godoc
// @Summary Verify email address
// @Description Verifies user email using verification token
// @Tags auth
// @Accept json
// @Produce json
// @Param token query string true "Verification token"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Router /api/auth/verify-email [get]
func VerifyEmailHandler(ctx *gin.Context) {
	token := ctx.Query("token")
	if token == "" {
		// Redirect to verification success page with error
		ctx.Redirect(302, "/verify-success?error=missing_token")
		return
	}

	hashedToken := utils.HashSHA256(token)

	var user models.User
	if err := database.DB.Where("verification_token = ?", hashedToken).First(&user).Error; err != nil {
		// Redirect to verification success page with error
		ctx.Redirect(302, "/verify-success?error=invalid_token")
		return
	}

	if user.EmailVerified {
		// Redirect to verification success page with already verified status
		ctx.Redirect(302, "/verify-success?status=already_verified")
		return
	}

	// Verify the email
	user.EmailVerified = true
	user.VerificationToken = ""
	user.UpdatedAt = utils.FormattedTime(time.Now())

	if err := database.DB.Save(&user).Error; err != nil {
		// Redirect to verification success page with error
		ctx.Redirect(302, "/verify-success?error=database_error")
		return
	}

	// Redirect to verification success page with success status
	ctx.Redirect(302, "/verify-success?status=success")
}

// ResendVerificationHandler godoc
// @Summary Resend verification email
// @Description Resends verification email to user
// @Tags auth
// @Accept json
// @Produce json
// @Param body body object true "Email for verification resend"
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Router /api/auth/resend-verification [post]
func ResendVerificationHandler(ctx *gin.Context) {
	var payload struct {
		Email string `json:"email"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	var user models.User
	if err := database.DB.Where("email = ?", payload.Email).First(&user).Error; err != nil {
		ctx.JSON(http.StatusOK, gin.H{"message": "if the email exists, a verification link was sent"})
		return
	}

	if user.EmailVerified {
		ctx.JSON(http.StatusOK, gin.H{"message": "email already verified"})
		return
	}

	// Generate new verification token
	verificationToken, hashedToken, err := utils.GenerateResetToken()
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate verification token"})
		return
	}

	user.VerificationToken = hashedToken
	user.UpdatedAt = utils.FormattedTime(time.Now())
	database.DB.Save(&user)

	// Send verification email
	verificationLink := fmt.Sprintf("%s/api/auth/verify-email?token=%s",
		os.Getenv("BASE_URL"), verificationToken)
	go utils.SendVerificationEmail(user.Email, verificationLink)

	ctx.JSON(http.StatusOK, gin.H{"message": "verification email sent successfully"})
}

func GetBotDetails(ctx *gin.Context) {
	botID := ctx.Param("id")
	var bot models.Bot
	if err := database.DB.First(&bot, botID).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Bot not found"})
		return
	}

	var admin models.Admin
	if err := database.DB.Where("person_id = ?", bot.OwnerID).First(&admin).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Admin not found"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "Bot details retrieved",
		"data": map[string]interface{}{
			"id":           bot.ID,
			"admin_id":     admin.ID,
			"price":        bot.Price,
			"rent_price":   bot.RentPrice,
			"payment_type": bot.SubscriptionType,
			"name":         bot.Name,
			"description":  bot.Description,
		},
	})
}

// GetUserBotsHandler godoc
// @Summary Get user bots
// @Description Retrieves all bots owned by the authenticated user
// @Tags user
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/user/bots [get]
func GetUserBotsHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var userBots []models.UserBot
	if err := database.DB.Preload("Bot").Where("user_id = ?", userID).Find(&userBots).Error; err != nil {
		log.Printf("Error fetching user bots: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch user bots"})
		return
	}

	log.Printf("Found %d user bots for user %d", len(userBots), userID)

	// Get real profit from trades
	var totalProfit float64
	database.DB.Model(&models.Trade{}).Where("user_id = ?", userID).Select("COALESCE(SUM(profit_loss), 0)").Scan(&totalProfit)

	var bots []gin.H
	for _, userBot := range userBots {
		bot := userBot.Bot
		log.Printf("Processing bot: ID=%d, Name=%s", bot.ID, bot.Name)

		// Get bot owner/creator information
		var owner models.User
		var creatorName string
		if err := database.DB.First(&owner, bot.OwnerID).Error; err == nil {
			creatorName = owner.Name
		} else {
			creatorName = "Unknown"
		}

		status := "inactive"
		if userBot.IsActive {
			status = "active"
		}

		// Get bot-specific profit
		var botProfit float64
		database.DB.Model(&models.Trade{}).Where("user_id = ? AND bot_id = ?", userID, bot.ID).Select("COALESCE(SUM(profit_loss), 0)").Scan(&botProfit)

		bots = append(bots, gin.H{
			"id":            bot.ID,
			"name":          bot.Name,
			"status":        status,
			"profit":        botProfit,
			"price":         bot.Price,
			"rent_price":    bot.RentPrice,
			"strategy":      bot.Strategy,
			"description":   bot.Description,
			"image":         bot.Image,
			"performance":   "+0%",
			"access_type":   userBot.AccessType,
			"purchase_type": userBot.AccessType,
			"purchase_date": userBot.PurchaseDate,
			"expiry_date":   userBot.ExpiryDate,
			"is_owned":      true,
			"is_running":    false,
			"is_active":     userBot.IsActive,
			"monthly_cost":  bot.RentPrice,
			"total_cost":    bot.Price,
			"creator":       gin.H{"name": creatorName, "id": bot.OwnerID},
		})
	}

	log.Printf("Returning %d bots to user %d", len(bots), userID)
	ctx.JSON(http.StatusOK, gin.H{
		"message":      "User bots retrieved successfully",
		"bots":         bots,
		"total_profit": totalProfit,
	})
}

// RecordTradeHandler records a new trade from Deriv
func RecordTradeHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var payload struct {
		BotID        uint    `json:"bot_id"`
		DerivTradeID string  `json:"deriv_trade_id"`
		Symbol       string  `json:"symbol"`
		TradeType    string  `json:"trade_type"`
		Stake        float64 `json:"stake"`
		Payout       float64 `json:"payout"`
		ProfitLoss   float64 `json:"profit_loss"`
		Status       string  `json:"status"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	trade := models.Trade{
		UserID:       userID,
		BotID:        payload.BotID,
		DerivTradeID: payload.DerivTradeID,
		Symbol:       payload.Symbol,
		TradeType:    payload.TradeType,
		Stake:        payload.Stake,
		Payout:       payload.Payout,
		ProfitLoss:   payload.ProfitLoss,
		Status:       payload.Status,
		OpenTime:     time.Now(),
		CreatedAt:    time.Now(),
	}

	if payload.Status != "open" {
		now := time.Now()
		trade.CloseTime = &now
	}

	if err := database.DB.Create(&trade).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to record trade"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "Trade recorded successfully"})
}

// GetUserTradesHandler gets user's trade history
func GetUserTradesHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var trades []models.Trade
	if err := database.DB.Where("user_id = ?", userID).Order("created_at DESC").Find(&trades).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch trades"})
		return
	}

	var totalProfit float64
	for _, trade := range trades {
		totalProfit += trade.ProfitLoss
	}

	ctx.JSON(http.StatusOK, gin.H{
		"trades":       trades,
		"total_profit": totalProfit,
	})
}

// GetNotifications returns user notifications
func GetNotifications(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	userID := fmt.Sprintf("%v", userIDInterface)

	var notifications []models.Notification
	database.DB.Where("user_id = ?", userID).Order("created_at DESC").Limit(50).Find(&notifications)

	c.JSON(http.StatusOK, gin.H{"notifications": notifications})
}

// MarkNotificationRead marks a notification as read
func MarkNotificationRead(c *gin.Context) {
	userIDInterface, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	userID := fmt.Sprintf("%v", userIDInterface)
	notificationID := c.Param("id")

	result := database.DB.Model(&models.Notification{}).
		Where("id = ? AND user_id = ?", notificationID, userID).
		Update("read", true)

	if result.Error != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update notification"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Notification marked as read"})
}

// ToggleFavoriteIndicator toggles an indicator as favorite for the user
func ToggleFavoriteIndicator(c *gin.Context) {
	db := c.MustGet("db").(*gorm.DB)
	userID := c.GetUint("user_id")

	indicatorID, err := strconv.Atoi(c.Param("indicator_id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid indicator ID"})
		return
	}

	var favorite models.Favorite

	// Check if this favorite already exists
	err = db.Where("user_id = ? AND indicator_id = ?", userID, indicatorID).First(&favorite).Error

	if err == nil {
		// Exists → unfavorite (delete)
		db.Delete(&favorite)
		c.JSON(http.StatusOK, gin.H{
			"message": "Indicator removed from favorites",
			"status":  "unfavorited",
		})
		return
	}

	if err != gorm.ErrRecordNotFound {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Database error"})
		return
	}

	// Not found → favorite it
	newFavorite := models.Favorite{
		UserID:      userID,
		IndicatorID: uint(indicatorID),
	}

	if err := db.Create(&newFavorite).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add favorite"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"message": "Indicator added to favorites",
		"status":  "favorited",
	})
}
