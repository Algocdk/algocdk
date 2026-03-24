package handlers

import (
	"bytes"
	"encoding/json"
	"fmt"
	"io"
	"net/http"
	"os"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
)

const AdminSubscriptionAmount = 500.0 // KSH 500

// GetSubscriptionStatus returns the current user's subscription info
func GetSubscriptionStatus(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var sub models.Subscription
	if err := database.DB.Where("user_id = ?", userID).First(&sub).Error; err != nil {
		c.JSON(http.StatusOK, gin.H{"plan": "free", "status": "active"})
		return
	}

	c.JSON(http.StatusOK, gin.H{
		"plan":         sub.Plan,
		"status":       sub.Status,
		"amount":       sub.Amount,
		"started_at":   sub.StartedAt,
		"cancelled_at": sub.CancelledAt,
	})
}

// InitializeSubscriptionPayment starts a Paystack payment for the KSH 500 admin plan
func InitializeSubscriptionPayment(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// Block if already on active admin plan
	var existing models.Subscription
	if err := database.DB.Where("user_id = ? AND plan = ? AND status = ?", userID, "admin", "active").First(&existing).Error; err == nil {
		c.JSON(http.StatusConflict, gin.H{"error": "you already have an active admin subscription"})
		return
	}

	reference := fmt.Sprintf("SUB_%d_%d", userID, time.Now().Unix())

	payload := map[string]interface{}{
		"email":     user.Email,
		"amount":    int(AdminSubscriptionAmount * 100), // Paystack uses kobo/cents
		"reference": reference,
		"currency":  "KES",
		"callback_url": os.Getenv("BASE_URL") + "/api/subscription/verify?reference=" + reference,
	}

	body, _ := json.Marshal(payload)
	req, _ := http.NewRequest("POST", "https://api.paystack.co/transaction/initialize", bytes.NewReader(body))
	req.Header.Add("Authorization", "Bearer "+os.Getenv("PAYSTACK_SECRET_KEY"))
	req.Header.Add("Content-Type", "application/json")

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "payment initialization failed"})
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result map[string]interface{}
	if err := json.Unmarshal(respBody, &result); err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "payment initialization failed"})
		return
	}

	if result["status"] != true {
		msg, _ := result["message"].(string)
		c.JSON(http.StatusBadRequest, gin.H{"error": "payment initialization failed", "details": msg, "paystack_response": string(respBody)})
		return
	}

	// Save or update pending subscription record
	now := time.Now()
	sub := models.Subscription{
		UserID:    userID,
		Plan:      "admin",
		Status:    "pending",
		Reference: reference,
		Amount:    AdminSubscriptionAmount,
		StartedAt: now,
		CreatedAt: now,
		UpdatedAt: now,
	}
	if err := database.DB.Where("user_id = ?", userID).First(&existing).Error; err == nil {
		database.DB.Model(&existing).Updates(map[string]interface{}{
			"plan": "admin", "status": "pending", "reference": reference,
			"amount": AdminSubscriptionAmount, "started_at": now, "updated_at": now,
			"cancelled_at": nil,
		})
	} else {
		database.DB.Create(&sub)
	}

	data := result["data"].(map[string]interface{})
	c.JSON(http.StatusOK, gin.H{
		"message":           "Payment initialized",
		"reference":         reference,
		"authorization_url": data["authorization_url"],
	})
}

// VerifySubscriptionPayment verifies Paystack payment and activates the subscription
// This endpoint is public - Paystack redirects here without a JWT token
func VerifySubscriptionPayment(c *gin.Context) {
	reference := c.Query("reference")
	if reference == "" {
		c.JSON(http.StatusBadRequest, gin.H{"error": "reference is required"})
		return
	}

	// Find the subscription by reference (no JWT needed)
	var sub models.Subscription
	if err := database.DB.Where("reference = ?", reference).First(&sub).Error; err != nil {
		// Redirect to profile with error
		c.Redirect(http.StatusFound, "/profile?sub=failed")
		return
	}

	req, _ := http.NewRequest("GET", "https://api.paystack.co/transaction/verify/"+reference, nil)
	req.Header.Add("Authorization", "Bearer "+os.Getenv("PAYSTACK_SECRET_KEY"))

	client := &http.Client{}
	resp, err := client.Do(req)
	if err != nil {
		c.Redirect(http.StatusFound, "/profile?sub=failed")
		return
	}
	defer resp.Body.Close()

	respBody, _ := io.ReadAll(resp.Body)
	var result struct {
		Status bool `json:"status"`
		Data   struct {
			Status string `json:"status"`
		} `json:"data"`
	}
	if err := json.Unmarshal(respBody, &result); err != nil || !result.Status || result.Data.Status != "success" {
		c.Redirect(http.StatusFound, "/profile?sub=failed")
		return
	}

	now := time.Now()
	database.DB.Model(&sub).Updates(map[string]interface{}{
		"status": "active", "started_at": now, "updated_at": now,
	})
	database.DB.Model(&models.User{}).Where("id = ?", sub.UserID).Update("membership", "Premium")

	// Redirect back to profile with success
	c.Redirect(http.StatusFound, "/profile?sub=success")
}

// CancelSubscription cancels the user's active admin subscription
func CancelSubscription(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var sub models.Subscription
	if err := database.DB.Where("user_id = ? AND plan = ? AND status = ?", userID, "admin", "active").First(&sub).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "no active admin subscription found"})
		return
	}

	now := time.Now()
	database.DB.Model(&sub).Updates(map[string]interface{}{
		"status": "cancelled", "cancelled_at": now, "updated_at": now,
	})

	// Downgrade membership back to freemium (role stays as-is)
	database.DB.Model(&models.User{}).Where("id = ?", userID).Update("membership", "freemium")

	c.JSON(http.StatusOK, gin.H{"message": "Subscription cancelled successfully"})
}
