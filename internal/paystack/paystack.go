package paystack

import (
	"bytes"
	"crypto/hmac"
	"crypto/sha512"
	"encoding/hex"
	"encoding/json"
	"fmt"
	"io"
	"log"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
	"gorm.io/gorm"
)

var httpClient = &http.Client{Timeout: 10 * time.Second}

// PaystackSubaccount represents the subaccount object in Paystack response
type PaystackSubaccount struct {
	ID               int     `json:"id"`
	SubaccountCode   string  `json:"subaccount_code"`
	BusinessName     string  `json:"business_name"`
	Description      string  `json:"description"`
	PercentageCharge float64 `json:"percentage_charge"`
	SettlementBank   string  `json:"settlement_bank"`
	AccountNumber    string  `json:"account_number"`
	Currency         string  `json:"currency"`
	Active           bool    `json:"active"`
	IsVerified       bool    `json:"is_verified"`
}

// PaystackVerifyResponse struct for Paystack API response
type PaystackVerifyResponse struct {
	Status  bool   `json:"status"`
	Message string `json:"message"`
	Data    struct {
		Status     string             `json:"status"`
		Amount     int                `json:"amount"`
		Reference  string             `json:"reference"`
		Subaccount PaystackSubaccount `json:"subaccount"`
		Fees       int                `json:"fees"`
		Customer   struct {
			Email string `json:"email"`
		} `json:"customer"`
	} `json:"data"`
}

// CreatePaystackSubaccount creates a subaccount for an admin
func CreatePaystackSubaccount(admin *models.Admin) error {
	log.Printf("Creating Paystack subaccount for admin ID %d", admin.ID)
	payload := map[string]interface{}{
		"business_name":     admin.AccountName,
		"settlement_bank":   admin.BankCode,
		"account_number":    admin.AccountNumber,
		"percentage_charge": 10,
	}

	body, _ := json.Marshal(payload)
	log.Printf("Subaccount payload: %s", string(body))
	req, _ := http.NewRequest("POST", "https://api.paystack.co/subaccount", bytes.NewReader(body))
	req.Header.Add("Authorization", "Bearer "+os.Getenv("PAYSTACK_SECRET_KEY"))
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("Accept", "application/json")
	req.Header.Add("Cache-Control", "no-cache")

	client := httpClient
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Paystack subaccount creation failed: %v", err)
		return fmt.Errorf("Paystack API error: %v", err)
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	log.Printf("Subaccount response: %s", string(respBody))
	if resp.StatusCode != http.StatusOK && resp.StatusCode != http.StatusCreated {
		return fmt.Errorf("Paystack error: %s", string(respBody))
	}

	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		log.Printf("Failed to parse subaccount response: %v", err)
		return fmt.Errorf("failed to parse Paystack response: %v", err)
	}

	if data, ok := result["data"].(map[string]interface{}); ok {
		admin.PaystackSubaccountCode = data["subaccount_code"].(string)
		if err := database.DB.Save(admin).Error; err != nil {
			log.Printf("Failed to save admin subaccount: %v", err)
			return fmt.Errorf("failed to save admin subaccount: %v", err)
		}
		log.Printf("Subaccount created: %s", admin.PaystackSubaccountCode)
		return nil
	}

	log.Printf("No subaccount_code in response")
	return fmt.Errorf("failed to parse Paystack response: no data field")
}

// InitializePayment godoc
// @Summary Initialize payment
// @Description Initializes a payment transaction for purchasing or renting a bot
// @Tags payment
// @Accept json
// @Produce json
// @Param body body object true "Payment initialization details"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/payment/initialize [post]
func InitializePayment(ctx *gin.Context) {
	var input struct {
		Amount      float64 `json:"amount"`
		BotID       uint    `json:"bot_id"`
		PaymentType string  `json:"payment_type"`
		Description string  `json:"description"`
	}

	if err := ctx.ShouldBindJSON(&input); err != nil {
		log.Printf("Invalid input: %v", err)
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid input"})
		return
	}

	userID := ctx.GetUint("user_id")
	log.Printf("Initializing payment for user_id: %d, bot_id: %d, payment_type: %s", userID, input.BotID, input.PaymentType)

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		log.Printf("User not found: %v", err)
		ctx.JSON(http.StatusNotFound, gin.H{"message": "User not found"})
		return
	}

	var bot models.Bot
	if err := database.DB.First(&bot, input.BotID).Error; err != nil {
		log.Printf("Bot not found: %v", err)
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Bot not found"})
		return
	}

	var admin models.Admin
	if err := database.DB.Where("person_id = ?", bot.OwnerID).First(&admin).Error; err != nil {
		log.Printf("Admin not found: %v", err)
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Admin not found"})
		return
	}

	var existing models.Transaction
	if err := database.DB.
		Where("user_id = ? AND bot_id = ? AND payment_type = ? AND status = ?", userID, input.BotID, input.PaymentType, "pending").
		First(&existing).Error; err == nil {
		log.Printf("Pending transaction exists: %s", existing.Reference)
		ctx.JSON(http.StatusBadRequest, gin.H{
			"message":   "A pending transaction already exists for this bot",
			"reference": existing.Reference,
		})
		return
	}

	var subaccountCode string
	var companyPercent float64
	if admin.BankCode == "" || admin.AccountNumber == "" || admin.AccountName == "" {
		log.Printf("No bank details for admin ID %d, company takes 100%%", admin.ID)
		companyPercent = 1.0
	} else {
		if admin.PaystackSubaccountCode == "" {
			log.Printf("Creating subaccount for admin ID %d", admin.ID)
			if err := CreatePaystackSubaccount(&admin); err != nil {
				log.Printf("Failed to create Paystack subaccount: %v, proceeding without split", err)
				companyPercent = 1.0
			} else {
				subaccountCode = admin.PaystackSubaccountCode
				switch input.PaymentType {
				case "purchase":
					companyPercent = 0.30
				case "rent":
					companyPercent = 0.20
				default:
					log.Printf("Invalid payment type: %s", input.PaymentType)
					ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payment type"})
					return
				}
			}
		} else {
			subaccountCode = admin.PaystackSubaccountCode
			switch input.PaymentType {
			case "purchase":
				companyPercent = 0.30
			case "rent":
				companyPercent = 0.20
			default:
				log.Printf("Invalid payment type: %s", input.PaymentType)
				ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payment type"})
				return
			}
		}
	}

	if input.PaymentType == "purchase" {
		var existing models.Transaction
		if err := database.DB.
			Where("user_id = ? AND bot_id = ? AND payment_type = ? AND status = ?", userID, input.BotID, "purchase", "success").
			First(&existing).Error; err == nil {
			log.Printf("Bot already purchased: %s", existing.Reference)
			ctx.JSON(http.StatusBadRequest, gin.H{"message": "You already purchased this bot"})
			return
		}
	}

	var expectedPrice float64
	if input.PaymentType == "purchase" {
		expectedPrice = bot.Price
	} else if input.PaymentType == "rent" {
		expectedPrice = bot.RentPrice
	} else {
		log.Printf("Invalid payment type: %s", input.PaymentType)
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payment type"})
		return
	}
	if input.Amount < expectedPrice {
		log.Printf("Invalid amount: %f, expected >= %f", input.Amount, expectedPrice)
		ctx.JSON(http.StatusBadRequest, gin.H{"message": fmt.Sprintf("Amount must be at least KES %.2f", expectedPrice)})
		return
	}

	companyShare := input.Amount * companyPercent
	adminShare := input.Amount - companyShare
	reference := fmt.Sprintf("ALG_%d_%d", userID, time.Now().Unix())

	payload := map[string]interface{}{
		"email":        user.Email,
		"amount":       int(input.Amount * 100),
		"reference":    reference,
		"callback_url": os.Getenv("BASE_URL") + "/api/paystack/callback?reference=" + reference,
		"currency":     "KES",
	}
	if subaccountCode != "" {
		payload["subaccount"] = subaccountCode
		payload["bearer"] = "subaccount"
		payload["transaction_charge"] = int(companyShare * 100)
	}

	body, _ := json.Marshal(payload)
	log.Printf("Paystack payload: %s", string(body))
	req, _ := http.NewRequest("POST", "https://api.paystack.co/transaction/initialize", bytes.NewReader(body))
	req.Header.Add("Authorization", "Bearer "+os.Getenv("PAYSTACK_SECRET_KEY"))
	req.Header.Add("Content-Type", "application/json")
	req.Header.Add("Accept", "application/json")
	req.Header.Add("Cache-Control", "no-cache")

	client := httpClient
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Paystack request error: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Paystack request failed", "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	log.Printf("Paystack raw response: %s", string(respBody))
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		log.Printf("Failed to parse Paystack response: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to parse Paystack response"})
		return
	}

	if result["status"] != true {
		log.Printf("Paystack initialization failed: %v", result["message"])
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Failed to initialize payment", "error": result["message"]})
		return
	}

	transaction := models.Transaction{
		UserID:         userID,
		AdminID:        admin.ID,
		BotID:          input.BotID,
		Amount:         input.Amount,
		CompanyShare:   companyShare,
		AdminShare:     adminShare,
		Status:         "pending",
		Reference:      reference,
		PaymentChannel: "Paystack",
		PaymentType:    input.PaymentType,
		Description:    input.Description,
		CreatedAt:      time.Now(),
	}

	if err := database.DB.Create(&transaction).Error; err != nil {
		log.Printf("Failed to save transaction: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to save transaction"})
		return
	}

	data := result["data"].(map[string]interface{})
	log.Printf("Paystack response data: %v", data)
	ctx.JSON(http.StatusOK, gin.H{
		"message": "Payment initialized",
		"data":    data,
	})
}

// VerifyPayment godoc
// @Summary Verify payment
// @Description Verifies a payment transaction using the reference
// @Tags payment
// @Produce json
// @Param reference query string true "Transaction reference"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/payment/verify [get]
func VerifyPayment(ctx *gin.Context) {
	reference := ctx.Query("reference")
	if reference == "" {
		log.Printf("Missing reference in verify request")
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Reference is required"})
		return
	}
	log.Printf("Verifying payment for reference: %s", reference)

	req, _ := http.NewRequest("GET", fmt.Sprintf("https://api.paystack.co/transaction/verify/%s", reference), nil)
	req.Header.Add("Authorization", "Bearer "+os.Getenv("PAYSTACK_SECRET_KEY"))
	req.Header.Add("Accept", "application/json")
	req.Header.Add("Cache-Control", "no-cache")

	client := httpClient
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Paystack verify request failed: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to verify payment", "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	log.Printf("Paystack verify response: %s", string(respBody))
	var result PaystackVerifyResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		log.Printf("Failed to parse Paystack verify response: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to parse Paystack response", "error": err.Error()})
		return
	}

	if !result.Status || result.Data.Status != "success" {
		log.Printf("Payment verification failed: status=%v, message=%s, transaction_status=%s", result.Status, result.Message, result.Data.Status)
		ctx.JSON(http.StatusBadRequest, gin.H{
			"message": "Payment verification failed",
			"error":   result.Message,
			"status":  result.Data.Status,
		})
		return
	}

	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic in VerifyPayment: %v", r)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Internal server error"})
		}
	}()

	var transaction models.Transaction
	if err := tx.Where("reference = ?", reference).First(&transaction).Error; err != nil {
		log.Printf("Transaction not found: %s", reference)
		tx.Rollback()
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Transaction not found"})
		return
	}

	var bot models.Bot
	if err := tx.First(&bot, transaction.BotID).Error; err != nil {
		log.Printf("Bot not found: %d", transaction.BotID)
		tx.Rollback()
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Bot not found"})
		return
	}
	amountPaid := float64(result.Data.Amount) / 100.0
	expectedPrice := bot.Price
	if transaction.PaymentType == "rent" {
		expectedPrice = bot.RentPrice
	}
	if amountPaid < expectedPrice {
		log.Printf("Payment amount too low: paid=%.2f, expected=%.2f", amountPaid, expectedPrice)
		tx.Rollback()
		ctx.JSON(http.StatusForbidden, gin.H{
			"message": fmt.Sprintf("Payment amount (KES %.2f) is less than expected (KES %.2f)", amountPaid, expectedPrice),
		})
		return
	}

	transaction.Status = "success"
	if err := tx.Save(&transaction).Error; err != nil {
		log.Printf("Failed to update transaction: %v", err)
		tx.Rollback()
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update transaction"})
		return
	}

	if transaction.PaymentType == "purchase" {
		originalOwnerID := bot.OwnerID
		bot.OwnerID = transaction.UserID
		if err := tx.Save(&bot).Error; err != nil {
			log.Printf("Failed to update bot ownership: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update bot ownership"})
			return
		}

		sale := models.Sale{
			BotID:     transaction.BotID,
			SellerID:  originalOwnerID,
			BuyerID:   transaction.UserID,
			Amount:    transaction.Amount,
			SaleType:  "purchase",
			SaleDate:  time.Now(),
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		if err := tx.Create(&sale).Error; err != nil {
			log.Printf("Failed to record sale: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to record sale"})
			return
		}

		if err := tx.Where("user_id = ? AND bot_id = ?", originalOwnerID, bot.ID).Delete(&models.UserBot{}).Error; err != nil {
			log.Printf("Failed to remove old owner access: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to remove old owner access"})
			return
		}

		var existing models.UserBot
		if err := tx.Where("user_id = ? AND bot_id = ?", transaction.UserID, transaction.BotID).First(&existing).Error; err == gorm.ErrRecordNotFound {
			userBot := models.UserBot{
				UserID:       transaction.UserID,
				BotID:        transaction.BotID,
				AccessType:   "purchase",
				IsActive:     true,
				PurchaseDate: time.Now(),
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
			}
			if err := tx.Create(&userBot).Error; err != nil {
				log.Printf("Failed to create user_bot entry: %v", err)
				tx.Rollback()
				ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create user_bot entry"})
				return
			}
		}
	} else if transaction.PaymentType == "rent" {
		var existing models.UserBot
		if err := tx.Where("user_id = ? AND bot_id = ?", transaction.UserID, transaction.BotID).First(&existing).Error; err == gorm.ErrRecordNotFound {
			expiry := time.Now().Add(30 * 24 * time.Hour)
			userBot := models.UserBot{
				UserID:       transaction.UserID,
				BotID:        transaction.BotID,
				AccessType:   "rent",
				IsActive:     true,
				PurchaseDate: time.Now(),
				ExpiryDate:   &expiry,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
			}
			if err := tx.Create(&userBot).Error; err != nil {
				log.Printf("Failed to create user_bot entry for rent: %v", err)
				tx.Rollback()
				ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create user_bot entry"})
				return
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to commit transaction"})
		return
	}

	log.Printf("Payment verified successfully for reference: %s", reference)
	ctx.JSON(http.StatusOK, gin.H{
		"message": "Payment verified and bot access updated",
		"data":    result.Data,
	})
}

// FrontendCallback godoc
// @Summary Frontend payment callback
// @Description Handles callback from Paystack frontend integration
// @Tags payment
// @Accept json
// @Produce json
// @Param body body object true "Callback details"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/payment/callback [post]
func FrontendCallback(ctx *gin.Context) {
	var input struct {
		Reference   string  `json:"reference"`
		BotID       uint    `json:"bot_id"`
		AmountPaid  float64 `json:"amount_paid"`
		PaymentType string  `json:"payment_type"`
	}

	if err := ctx.ShouldBindJSON(&input); err != nil {
		log.Printf("Invalid callback input: %v", err)
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid input"})
		return
	}
	log.Printf("Frontend callback received: reference=%s, bot_id=%d, amount_paid=%.2f, payment_type=%s", input.Reference, input.BotID, input.AmountPaid, input.PaymentType)

	if input.PaymentType != "purchase" && input.PaymentType != "rent" {
		log.Printf("Invalid payment type: %s", input.PaymentType)
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid payment type, must be 'purchase' or 'rent'"})
		return
	}

	req, _ := http.NewRequest("GET", fmt.Sprintf("https://api.paystack.co/transaction/verify/%s", input.Reference), nil)
	req.Header.Add("Authorization", "Bearer "+os.Getenv("PAYSTACK_SECRET_KEY"))
	req.Header.Add("Accept", "application/json")

	client := httpClient
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Paystack verify request failed: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to verify payment", "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	log.Printf("Paystack verify response: %s", string(respBody))
	var result PaystackVerifyResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		log.Printf("Failed to parse Paystack verify response: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to parse Paystack response", "error": err.Error()})
		return
	}

	if !result.Status || result.Data.Status != "success" {
		log.Printf("Payment verification failed: status=%v, message=%s, transaction_status=%s", result.Status, result.Message, result.Data.Status)
		ctx.JSON(http.StatusBadRequest, gin.H{
			"message": "Payment verification failed",
			"error":   result.Message,
			"status":  result.Data.Status,
		})
		return
	}

	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic in FrontendCallback: %v", r)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Internal server error"})
		}
	}()

	var transaction models.Transaction
	if err := tx.Where("reference = ?", input.Reference).First(&transaction).Error; err != nil {
		if err != gorm.ErrRecordNotFound {
			log.Printf("Error finding transaction: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Error finding transaction"})
			return
		}

		userID := ctx.GetUint("user_id")
		var bot models.Bot
		if err := tx.First(&bot, input.BotID).Error; err != nil {
			log.Printf("Bot not found: %d", input.BotID)
			tx.Rollback()
			ctx.JSON(http.StatusNotFound, gin.H{"message": "Bot not found"})
			return
		}

		var admin models.Admin
		if err := tx.Where("person_id = ?", bot.OwnerID).First(&admin).Error; err != nil {
			log.Printf("Admin not found: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusNotFound, gin.H{"message": "Admin not found"})
			return
		}

		expectedPrice := bot.Price
		if input.PaymentType == "rent" {
			expectedPrice = bot.RentPrice
		}
		if input.AmountPaid < expectedPrice {
			log.Printf("Invalid amount: paid=%.2f, expected=%.2f", input.AmountPaid, expectedPrice)
			tx.Rollback()
			ctx.JSON(http.StatusBadRequest, gin.H{
				"message": fmt.Sprintf("Amount must be at least KES %.2f", expectedPrice),
			})
			return
		}

		var companyPercent float64
		if admin.PaystackSubaccountCode == "" && (admin.BankCode == "" || admin.AccountNumber == "" || admin.AccountName == "") {
			companyPercent = 1.0
		} else {
			if admin.PaystackSubaccountCode == "" {
				log.Printf("Creating subaccount for admin ID %d", admin.ID)
				if err := CreatePaystackSubaccount(&admin); err != nil {
					log.Printf("Failed to create Paystack subaccount: %v", err)
					tx.Rollback()
					ctx.JSON(http.StatusInternalServerError, gin.H{
						"message": "Failed to create Paystack subaccount",
						"error":   err.Error(),
					})
					return
				}
			}
			companyPercent = 0.30
			if input.PaymentType == "rent" {
				companyPercent = 0.20
			}
		}

		transaction = models.Transaction{
			UserID:         userID,
			AdminID:        admin.ID,
			BotID:          input.BotID,
			Amount:         input.AmountPaid,
			CompanyShare:   input.AmountPaid * companyPercent,
			AdminShare:     input.AmountPaid * (1 - companyPercent),
			Status:         "pending",
			Reference:      input.Reference,
			PaymentChannel: "Paystack",
			PaymentType:    input.PaymentType,
			Description:    fmt.Sprintf("Payment for bot %d (%s)", input.BotID, input.PaymentType),
			CreatedAt:      time.Now(),
		}
		if err := tx.Create(&transaction).Error; err != nil {
			log.Printf("Failed to create transaction: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to save transaction"})
			return
		}
	}

	if transaction.Status == "pending" {
		transaction.Status = "success"
		transaction.Amount = input.AmountPaid
		if err := tx.Save(&transaction).Error; err != nil {
			log.Printf("Failed to update transaction: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update transaction"})
			return
		}

		var bot models.Bot
		if err := tx.First(&bot, transaction.BotID).Error; err != nil {
			log.Printf("Bot not found: %d", transaction.BotID)
			tx.Rollback()
			ctx.JSON(http.StatusNotFound, gin.H{"message": "Bot not found"})
			return
		}
		amountPaid := float64(result.Data.Amount) / 100.0
		expectedPrice := bot.Price
		if transaction.PaymentType == "rent" {
			expectedPrice = bot.RentPrice
		}
		if amountPaid < expectedPrice {
			log.Printf("Payment amount too low: paid=%.2f, expected=%.2f", amountPaid, expectedPrice)
			tx.Rollback()
			ctx.JSON(http.StatusForbidden, gin.H{
				"message": fmt.Sprintf("Payment amount (KES %.2f) is less than expected (KES %.2f)", amountPaid, expectedPrice),
			})
			return
		}

		if transaction.PaymentType == "purchase" {
			originalOwnerID := bot.OwnerID
			bot.OwnerID = transaction.UserID
			if err := tx.Save(&bot).Error; err != nil {
				log.Printf("Failed to update bot ownership: %v", err)
				tx.Rollback()
				ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update bot ownership"})
				return
			}

			sale := models.Sale{
				BotID:     transaction.BotID,
				SellerID:  originalOwnerID,
				BuyerID:   transaction.UserID,
				Amount:    transaction.Amount,
				SaleType:  "purchase",
				SaleDate:  time.Now(),
				CreatedAt: time.Now(),
				UpdatedAt: time.Now(),
			}
			if err := tx.Create(&sale).Error; err != nil {
				log.Printf("Failed to record sale: %v", err)
				tx.Rollback()
				ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to record sale"})
				return
			}

			if err := tx.Where("user_id = ? AND bot_id = ?", originalOwnerID, bot.ID).Delete(&models.UserBot{}).Error; err != nil {
				log.Printf("Failed to remove old owner access: %v", err)
				tx.Rollback()
				ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to remove old owner access"})
				return
			}

			var existing models.UserBot
			if err := tx.Where("user_id = ? AND bot_id = ?", transaction.UserID, transaction.BotID).First(&existing).Error; err == gorm.ErrRecordNotFound {
				userBot := models.UserBot{
					UserID:       transaction.UserID,
					BotID:        transaction.BotID,
					AccessType:   "purchase",
					IsActive:     true,
					PurchaseDate: time.Now(),
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				if err := tx.Create(&userBot).Error; err != nil {
					log.Printf("Failed to create user_bot entry: %v", err)
					tx.Rollback()
					ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create user_bot entry"})
					return
				}
			}
		} else if transaction.PaymentType == "rent" {
			var existing models.UserBot
			if err := tx.Where("user_id = ? AND bot_id = ?", transaction.UserID, transaction.BotID).First(&existing).Error; err == gorm.ErrRecordNotFound {
				expiry := time.Now().Add(30 * 24 * time.Hour)
				userBot := models.UserBot{
					UserID:       transaction.UserID,
					BotID:        transaction.BotID,
					AccessType:   "rent",
					IsActive:     true,
					PurchaseDate: time.Now(),
					ExpiryDate:   &expiry,
					CreatedAt:    time.Now(),
					UpdatedAt:    time.Now(),
				}
				if err := tx.Create(&userBot).Error; err != nil {
					log.Printf("Failed to create user_bot entry for rent: %v", err)
					tx.Rollback()
					ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create user_bot entry"})
					return
				}
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to commit transaction"})
		return
	}

	log.Printf("Payment processed successfully for reference: %s", input.Reference)
	ctx.JSON(http.StatusOK, gin.H{
		"message": "Payment verified and bot access updated",
		"data":    result.Data,
	})
}

// PaystackCallback godoc
// @Summary Paystack webhook callback
// @Description Handles webhook notifications from Paystack
// @Tags payment
// @Accept json
// @Produce json
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/payment/webhook [post]
func PaystackCallback(ctx *gin.Context) {
	signature := ctx.GetHeader("X-Paystack-Signature")
	body, err := io.ReadAll(ctx.Request.Body)
	if err != nil {
		log.Printf("Invalid webhook request: %v", err)
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid request"})
		return
	}
	ctx.Request.Body = io.NopCloser(bytes.NewReader(body))

	h := hmac.New(sha512.New, []byte(os.Getenv("PAYSTACK_SECRET_KEY")))
	h.Write(body)
	expectedSignature := hex.EncodeToString(h.Sum(nil))
	if signature != expectedSignature {
		log.Printf("Invalid Paystack webhook signature: expected %s, got %s", expectedSignature, signature)
		ctx.JSON(http.StatusUnauthorized, gin.H{"message": "Invalid signature"})
		return
	}

	var event struct {
		Event string                 `json:"event"`
		Data  map[string]interface{} `json:"data"`
	}
	if err := json.Unmarshal(body, &event); err != nil {
		log.Printf("Invalid webhook payload: %v", err)
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid JSON"})
		return
	}
	log.Printf("Webhook received: event=%s, data=%v", event.Event, event.Data)

	if event.Event != "charge.success" {
		log.Printf("Ignoring non-success event: %s", event.Event)
		ctx.JSON(http.StatusOK, gin.H{"message": "Event ignored"})
		return
	}

	reference, ok := event.Data["reference"].(string)
	if !ok || reference == "" {
		log.Printf("Missing or invalid reference in webhook")
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid reference"})
		return
	}

	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic in PaystackCallback: %v", r)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Internal server error"})
		}
	}()

	var transaction models.Transaction
	if err := tx.Where("reference = ?", reference).First(&transaction).Error; err != nil {
		log.Printf("Transaction not found: %s", reference)
		tx.Rollback()
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Transaction not found"})
		return
	}

	req, _ := http.NewRequest("GET", fmt.Sprintf("https://api.paystack.co/transaction/verify/%s", reference), nil)
	req.Header.Add("Authorization", "Bearer "+os.Getenv("PAYSTACK_SECRET_KEY"))
	req.Header.Add("Accept", "application/json")

	client := httpClient
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Paystack verify request failed: %v", err)
		tx.Rollback()
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to verify payment", "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	log.Printf("Paystack verify response: %s", string(respBody))
	var result PaystackVerifyResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		log.Printf("Failed to parse Paystack verify response: %v", err)
		tx.Rollback()
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to parse Paystack response", "error": err.Error()})
		return
	}

	if !result.Status || result.Data.Status != "success" {
		log.Printf("Payment verification failed: status=%v, message=%s, transaction_status=%s", result.Status, result.Message, result.Data.Status)
		tx.Rollback()
		ctx.JSON(http.StatusBadRequest, gin.H{
			"message": "Payment verification failed",
			"error":   result.Message,
			"status":  result.Data.Status,
		})
		return
	}

	transaction.Status = "success"
	if err := tx.Save(&transaction).Error; err != nil {
		log.Printf("Failed to update transaction: %v", err)
		tx.Rollback()
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update transaction"})
		return
	}

	var bot models.Bot
	if err := tx.First(&bot, transaction.BotID).Error; err != nil {
		log.Printf("Bot not found: %d", transaction.BotID)
		tx.Rollback()
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Bot not found"})
		return
	}
	amountPaid := float64(result.Data.Amount) / 100.0
	expectedPrice := bot.Price
	if transaction.PaymentType == "rent" {
		expectedPrice = bot.RentPrice
	}
	if amountPaid < expectedPrice {
		log.Printf("Payment amount too low: paid=%.2f, expected=%.2f", amountPaid, expectedPrice)
		tx.Rollback()
		ctx.JSON(http.StatusForbidden, gin.H{
			"message": fmt.Sprintf("Payment amount (KES %.2f) is less than expected (KES %.2f)", amountPaid, expectedPrice),
		})
		return
	}

	if transaction.PaymentType == "purchase" {
		originalOwnerID := bot.OwnerID
		bot.OwnerID = transaction.UserID
		if err := tx.Save(&bot).Error; err != nil {
			log.Printf("Failed to update bot ownership: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update bot ownership"})
			return
		}

		sale := models.Sale{
			BotID:     transaction.BotID,
			SellerID:  originalOwnerID,
			BuyerID:   transaction.UserID,
			Amount:    transaction.Amount,
			SaleType:  "purchase",
			SaleDate:  time.Now(),
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		if err := tx.Create(&sale).Error; err != nil {
			log.Printf("Failed to record sale: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to record sale"})
			return
		}

		if err := tx.Where("user_id = ? AND bot_id = ?", originalOwnerID, bot.ID).Delete(&models.UserBot{}).Error; err != nil {
			log.Printf("Failed to remove old owner access: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to remove old owner access"})
			return
		}

		var existing models.UserBot
		if err := tx.Where("user_id = ? AND bot_id = ?", transaction.UserID, transaction.BotID).First(&existing).Error; err == gorm.ErrRecordNotFound {
			userBot := models.UserBot{
				UserID:       transaction.UserID,
				BotID:        transaction.BotID,
				AccessType:   "purchase",
				IsActive:     true,
				PurchaseDate: time.Now(),
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
			}
			if err := tx.Create(&userBot).Error; err != nil {
				log.Printf("Failed to create user_bot entry: %v", err)
				tx.Rollback()
				ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create user_bot entry"})
				return
			}
		}
	} else if transaction.PaymentType == "rent" {
		var existing models.UserBot
		if err := tx.Where("user_id = ? AND bot_id = ?", transaction.UserID, transaction.BotID).First(&existing).Error; err == gorm.ErrRecordNotFound {
			expiry := time.Now().Add(30 * 24 * time.Hour)
			userBot := models.UserBot{
				UserID:       transaction.UserID,
				BotID:        transaction.BotID,
				AccessType:   "rent",
				IsActive:     true,
				PurchaseDate: time.Now(),
				ExpiryDate:   &expiry,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
			}
			if err := tx.Create(&userBot).Error; err != nil {
				log.Printf("Failed to create user_bot entry for rent: %v", err)
				tx.Rollback()
				ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create user_bot entry"})
				return
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to commit transaction"})
		return
	}

	log.Printf("Webhook processed successfully for reference: %s", reference)
	ctx.JSON(http.StatusOK, gin.H{
		"message": "Webhook processed successfully",
		"data":    result.Data,
	})
}

// UpdateTransaction godoc
// @Summary Update transaction status
// @Description Updates the status of a transaction (only to 'failed' allowed)
// @Tags payment
// @Accept json
// @Produce json
// @Param body body object true "Transaction update details"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/payment/update-transaction [post]
func UpdateTransaction(ctx *gin.Context) {
	var input struct {
		Reference string `json:"reference"`
		Status    string `json:"status"`
	}

	if err := ctx.ShouldBindJSON(&input); err != nil {
		log.Printf("Invalid input for update transaction: %v", err)
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid input"})
		return
	}

	if input.Status != "failed" {
		log.Printf("Invalid status: %s, only 'failed' is allowed", input.Status)
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Invalid status, only 'failed' is allowed"})
		return
	}

	userID := ctx.GetUint("user_id")
	var transaction models.Transaction
	if err := database.DB.Where("reference = ? AND user_id = ?", input.Reference, userID).First(&transaction).Error; err != nil {
		log.Printf("Transaction not found: %s", input.Reference)
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Transaction not found"})
		return
	}

	if transaction.Status != "pending" {
		log.Printf("Transaction is not pending: %s, current status: %s", input.Reference, transaction.Status)
		ctx.JSON(http.StatusBadRequest, gin.H{
			"message": fmt.Sprintf("Transaction is not pending, current status: %s", transaction.Status),
		})
		return
	}

	transaction.Status = input.Status
	transaction.UpdatedAt = time.Now()
	if err := database.DB.Save(&transaction).Error; err != nil {
		log.Printf("Failed to update transaction: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update transaction"})
		return
	}

	log.Printf("Transaction updated to %s for reference: %s", input.Status, input.Reference)
	ctx.JSON(http.StatusOK, gin.H{
		"message": fmt.Sprintf("Transaction updated to %s", input.Status),
	})
}

// HandleCallbackRedirect godoc
// @Summary Handle Paystack callback redirect
// @Description Handles the redirect callback from Paystack
// @Tags payment
// @Produce json
// @Param reference query string true "Transaction reference"
// @Success 302 {string} string "Redirect to frontend"
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/paystack/callback [get]
func HandleCallbackRedirect(ctx *gin.Context) {
	reference := ctx.Query("reference")
	if reference == "" {
		reference = ctx.Query("trxref") // Paystack sometimes uses trxref
	}
	if reference == "" {
		log.Printf("Missing reference in callback redirect")
		ctx.JSON(http.StatusBadRequest, gin.H{"message": "Reference is required"})
		return
	}
	log.Printf("Handling callback redirect for reference: %s", reference)

	// Verify the payment
	req, _ := http.NewRequest("GET", fmt.Sprintf("https://api.paystack.co/transaction/verify/%s", reference), nil)
	req.Header.Add("Authorization", "Bearer "+os.Getenv("PAYSTACK_SECRET_KEY"))
	req.Header.Add("Accept", "application/json")

	client := httpClient
	resp, err := client.Do(req)
	if err != nil {
		log.Printf("Paystack verify request failed: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to verify payment", "error": err.Error()})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	log.Printf("Paystack verify response: %s", string(respBody))
	var result PaystackVerifyResponse
	if err := json.Unmarshal(respBody, &result); err != nil {
		log.Printf("Failed to parse Paystack verify response: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to parse Paystack response", "error": err.Error()})
		return
	}

	if !result.Status || result.Data.Status != "success" {
		log.Printf("Payment verification failed: status=%v, message=%s, transaction_status=%s", result.Status, result.Message, result.Data.Status)
		// Update transaction to failed if abandoned
		if result.Data.Status == "abandoned" {
			var transaction models.Transaction
			if err := database.DB.Where("reference = ?", reference).First(&transaction).Error; err == nil {
				transaction.Status = "failed"
				transaction.UpdatedAt = time.Now()
				if err := database.DB.Save(&transaction).Error; err != nil {
					log.Printf("Failed to update transaction to failed: %v", err)
				} else {
					log.Printf("Transaction updated to failed for reference: %s", reference)
				}
			}
		}
		ctx.JSON(http.StatusBadRequest, gin.H{
			"message": "Payment verification failed",
			"error":   result.Message,
			"status":  result.Data.Status,
		})
		return
	}

	tx := database.DB.Begin()
	defer func() {
		if r := recover(); r != nil {
			log.Printf("Panic in HandleCallbackRedirect: %v", r)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Internal server error"})
		}
	}()

	var transaction models.Transaction
	if err := tx.Where("reference = ?", reference).First(&transaction).Error; err != nil {
		log.Printf("Transaction not found: %s", reference)
		tx.Rollback()
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Transaction not found"})
		return
	}

	var bot models.Bot
	if err := tx.First(&bot, transaction.BotID).Error; err != nil {
		log.Printf("Bot not found: %d", transaction.BotID)
		tx.Rollback()
		ctx.JSON(http.StatusNotFound, gin.H{"message": "Bot not found"})
		return
	}

	amountPaid := float64(result.Data.Amount) / 100.0
	expectedPrice := bot.Price
	if transaction.PaymentType == "rent" {
		expectedPrice = bot.RentPrice
	}
	if amountPaid < expectedPrice {
		log.Printf("Payment amount too low: paid=%.2f, expected=%.2f", amountPaid, expectedPrice)
		tx.Rollback()
		ctx.JSON(http.StatusForbidden, gin.H{
			"message": fmt.Sprintf("Payment amount (KES %.2f) is less than expected (KES %.2f)", amountPaid, expectedPrice),
		})
		return
	}

	transaction.Status = "success"
	if err := tx.Save(&transaction).Error; err != nil {
		log.Printf("Failed to update transaction: %v", err)
		tx.Rollback()
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update transaction"})
		return
	}

	if transaction.PaymentType == "purchase" {
		originalOwnerID := bot.OwnerID
		bot.OwnerID = transaction.UserID
		if err := tx.Save(&bot).Error; err != nil {
			log.Printf("Failed to update bot ownership: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to update bot ownership"})
			return
		}

		sale := models.Sale{
			BotID:     transaction.BotID,
			SellerID:  originalOwnerID,
			BuyerID:   transaction.UserID,
			Amount:    transaction.Amount,
			SaleType:  "purchase",
			SaleDate:  time.Now(),
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}
		if err := tx.Create(&sale).Error; err != nil {
			log.Printf("Failed to record sale: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to record sale"})
			return
		}

		if err := tx.Where("user_id = ? AND bot_id = ?", originalOwnerID, bot.ID).Delete(&models.UserBot{}).Error; err != nil {
			log.Printf("Failed to remove old owner access: %v", err)
			tx.Rollback()
			ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to remove old owner access"})
			return
		}

		var existing models.UserBot
		if err := tx.Where("user_id = ? AND bot_id = ?", transaction.UserID, transaction.BotID).First(&existing).Error; err == gorm.ErrRecordNotFound {
			userBot := models.UserBot{
				UserID:       transaction.UserID,
				BotID:        transaction.BotID,
				AccessType:   "purchase",
				IsActive:     true,
				PurchaseDate: time.Now(),
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
			}
			if err := tx.Create(&userBot).Error; err != nil {
				log.Printf("Failed to create user_bot entry: %v", err)
				tx.Rollback()
				ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create user_bot entry"})
				return
			}
		}
	} else if transaction.PaymentType == "rent" {
		var existing models.UserBot
		if err := tx.Where("user_id = ? AND bot_id = ?", transaction.UserID, transaction.BotID).First(&existing).Error; err == gorm.ErrRecordNotFound {
			expiry := time.Now().Add(30 * 24 * time.Hour)
			userBot := models.UserBot{
				UserID:       transaction.UserID,
				BotID:        transaction.BotID,
				AccessType:   "rent",
				IsActive:     true,
				PurchaseDate: time.Now(),
				ExpiryDate:   &expiry,
				CreatedAt:    time.Now(),
				UpdatedAt:    time.Now(),
			}
			if err := tx.Create(&userBot).Error; err != nil {
				log.Printf("Failed to create user_bot entry for rent: %v", err)
				tx.Rollback()
				ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to create user_bot entry"})
				return
			}
		}
	}

	if err := tx.Commit().Error; err != nil {
		log.Printf("Failed to commit transaction: %v", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"message": "Failed to commit transaction"})
		return
	}

	log.Printf("Callback redirect processed successfully for reference: %s", reference)
	ctx.Redirect(http.StatusFound, "/mybots?payment=success&reference="+reference)
}
