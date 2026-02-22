package middleware

import (
	"net/http"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
)

// AdminOnly ensures the authenticated user has an admin role
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

		// Set admin_id for handlers that need it
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
