package handlers

import (
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
	"github.com/keyadaniel56/algocdk/internal/utils"
)

// RefreshTokenHandler godoc
// @Summary Refresh access token
// @Description Refreshes the access token using a valid refresh token
// @Tags auth
// @Accept json
// @Produce json
// @Param body body object true "Refresh token"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/auth/refresh [post]
func RefreshTokenHandler(ctx *gin.Context) {
	var payload struct {
		RefreshToken string `json:"refresh_token"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	payload.RefreshToken = strings.TrimSpace(payload.RefreshToken)
	if payload.RefreshToken == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "refresh token is required"})
		return
	}

	// Parse and validate refresh token
	token, err := jwt.Parse(payload.RefreshToken, func(token *jwt.Token) (interface{}, error) {
		return []byte(os.Getenv("REFRESH_TOKEN")), nil
	})

	if err != nil || !token.Valid {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired refresh token"})
		return
	}

	claims := token.Claims.(jwt.MapClaims)
	email := claims["email"].(string)

	// Get user from database
	var user models.User
	if err := database.DB.Where("email = ?", email).First(&user).Error; err != nil {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "user not found"})
		return
	}

	// Generate new access token
	newAccessToken, err := utils.GenerateToken(user.ID, user.Email, user.Role)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate token"})
		return
	}

	// Generate new refresh token
	newRefreshToken, err := utils.RefreshToken(user.Email)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to generate refresh token"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message":       "token refreshed successfully",
		"token":         newAccessToken,
		"refresh_token": newRefreshToken,
	})
}
