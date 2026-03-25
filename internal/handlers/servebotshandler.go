package handlers

import (
	"net/http"
	"path/filepath"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
)

func ServeBotHandler(c *gin.Context) {
	userID := c.GetUint("user_id")
	if userID == 0 {
		c.JSON(http.StatusUnauthorized, gin.H{"message": "unauthorized"})
		return
	}

	botID := c.Param("id")

	var bot models.Bot
	if err := database.DB.First(&bot, botID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"message": "bot not found"})
		return
	}

	// Verify the user has access to this bot
	var userBot models.UserBot
	if err := database.DB.Where("user_id = ? AND bot_id = ?", userID, bot.ID).First(&userBot).Error; err != nil {
		c.JSON(http.StatusForbidden, gin.H{"message": "access denied"})
		return
	}

	// Validate the file path stays within the uploads directory
	uploadsDir, _ := filepath.Abs("./uploads")
	filePath, err := filepath.Abs(bot.HTMLFile)
	if err != nil || !strings.HasPrefix(filePath, uploadsDir) {
		c.JSON(http.StatusForbidden, gin.H{"message": "access denied"})
		return
	}

	c.File(filePath)
}
