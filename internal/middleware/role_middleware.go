package middleware

import (
	"net/http"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
)

// AdminOnly ensures the authenticated user has an admin role AND an active subscription
func AdminOnly() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		userIDInterface, exists := ctx.Get("user_id")
		if !exists {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			ctx.Abort()
			return
		}

		userID, ok := userIDInterface.(uint)
		if !ok {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user id"})
			ctx.Abort()
			return
		}

		var user models.User
		if err := database.DB.First(&user, userID).Error; err != nil {
			ctx.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			ctx.Abort()
			return
		}

		role := strings.ToLower(user.Role)
		if !strings.Contains(role, "admin") {
			ctx.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			ctx.Abort()
			return
		}

		// Check subscription is active and not expired
		var sub models.Subscription
		if err := database.DB.Where("user_id = ? AND plan = ?", userID, "admin").First(&sub).Error; err != nil {
			ctx.JSON(http.StatusPaymentRequired, gin.H{
				"error": "subscription required",
				"code":  "NO_SUBSCRIPTION",
			})
			ctx.Abort()
			return
		}

		if sub.Status != "active" || (!sub.ExpiresAt.IsZero() && sub.ExpiresAt.Before(time.Now())) {
			// Auto-mark as expired in DB if still showing active
			if sub.Status == "active" {
				database.DB.Model(&sub).Updates(map[string]interface{}{
					"status":     "expired",
					"updated_at": time.Now(),
				})
				database.DB.Model(&models.User{}).Where("id = ?", userID).Update("membership", "freemium")
			}
			ctx.JSON(http.StatusPaymentRequired, gin.H{
				"error":      "subscription expired",
				"code":       "SUBSCRIPTION_EXPIRED",
				"expires_at": sub.ExpiresAt,
			})
			ctx.Abort()
			return
		}

		ctx.Set("admin_id", userID)
		ctx.Next()
	}
}

// SuperAdminOnly ensures the authenticated user is a superadmin
func SuperAdminOnly() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		userIDInterface, exists := ctx.Get("user_id")
		if !exists {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
			ctx.Abort()
			return
		}

		userID, ok := userIDInterface.(uint)
		if !ok {
			ctx.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user id"})
			ctx.Abort()
			return
		}

		var sa models.SuperAdmin
		if err := database.DB.First(&sa, userID).Error; err != nil {
			ctx.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			ctx.Abort()
			return
		}

		role := strings.ToLower(sa.Role)
		if role != "superadmin" {
			ctx.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
			ctx.Abort()
			return
		}

		ctx.Next()
	}
}
