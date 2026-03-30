package middleware

import (
	"fmt"
	"net/http"
	"os"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
)

// pageRoleFromCookie parses the auth_token cookie and returns the role claim, or "".
func pageRoleFromCookie(ctx *gin.Context) string {
	tokenStr, err := ctx.Cookie("auth_token")
	if err != nil || tokenStr == "" {
		return ""
	}
	token, err := jwt.Parse(tokenStr, func(t *jwt.Token) (interface{}, error) {
		if _, ok := t.Method.(*jwt.SigningMethodHMAC); !ok {
			return nil, fmt.Errorf("unexpected alg")
		}
		return []byte(os.Getenv("JWT_SECRET")), nil
	})
	if err != nil || !token.Valid {
		return ""
	}
	claims, ok := token.Claims.(jwt.MapClaims)
	if !ok {
		return ""
	}
	role, _ := claims["role"].(string)
	return strings.ToLower(role)
}

// PageGuardAdmin redirects to /unauthorized if the cookie role is not admin/superadmin.
func PageGuardAdmin() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		role := pageRoleFromCookie(ctx)
		if role == "" {
			ctx.Redirect(http.StatusFound, "/auth")
			ctx.Abort()
			return
		}
		if role != "admin" && role != "superadmin" {
			ctx.Redirect(http.StatusFound, "/unauthorized")
			ctx.Abort()
			return
		}
		ctx.Next()
	}
}

// PageGuardSuperAdmin redirects to /unauthorized if the cookie role is not superadmin.
func PageGuardSuperAdmin() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		role := pageRoleFromCookie(ctx)
		if role == "" {
			ctx.Redirect(http.StatusFound, "/auth")
			ctx.Abort()
			return
		}
		if role != "superadmin" {
			ctx.Redirect(http.StatusFound, "/unauthorized")
			ctx.Abort()
			return
		}
		ctx.Next()
	}
}

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
