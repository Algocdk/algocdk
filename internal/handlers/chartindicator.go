package handlers

import (
	"net/http"
	"strconv"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
)

// Admin creates a chart indicator
func CreateChartIndicator(c *gin.Context) {
	adminID, exists := c.Get("admin_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	var input struct {
		Name        string  `json:"name" binding:"required"`
		Description string  `json:"description"`
		Code        string  `json:"code" binding:"required"`
		Category    string  `json:"category"`
		IsFree      bool    `json:"is_free"`
		Price       float64 `json:"price"`
		Image       string  `json:"image"`
		Features    string  `json:"features"` // JSON array string
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	indicator := models.ChartIndicator{
		Name:        input.Name,
		Description: input.Description,
		Code:        input.Code,
		Category:    input.Category,
		IsFree:      input.IsFree,
		Price:       input.Price,
		Image:       input.Image,
		Features:    input.Features,
		AdminID:     adminID.(uint),
	}

	if err := database.DB.Create(&indicator).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create indicator"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Indicator created successfully", "indicator": indicator})
}

// Get all chart indicators (marketplace)
func GetChartIndicators(c *gin.Context) {
	var indicators []models.ChartIndicator

	// Check if admin is requesting their own indicators
	if adminID, exists := c.Get("admin_id"); exists {
		if err := database.DB.Where("admin_id = ?", adminID).Preload("Admin").Find(&indicators).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch indicators"})
			return
		}
	} else {
		// Public marketplace - all indicators
		if err := database.DB.Preload("Admin").Find(&indicators).Error; err != nil {
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch indicators"})
			return
		}
	}

	c.JSON(http.StatusOK, gin.H{"indicators": indicators})
}

// Get user's purchased indicators + free indicators
func GetUserIndicators(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	// Get purchased indicators
	var userIndicators []models.UserIndicator
	if err := database.DB.Where("user_id = ?", userID).Preload("Indicator").Find(&userIndicators).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch indicators"})
		return
	}

	// Get free indicators
	var freeIndicators []models.ChartIndicator
	if err := database.DB.Where("is_free = ?", true).Find(&freeIndicators).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch free indicators"})
		return
	}

	// Combine results - convert to UserIndicator format for consistency
	allIndicators := userIndicators
	for _, freeInd := range freeIndicators {
		// Check if not already in purchased list
		alreadyHas := false
		for _, ui := range userIndicators {
			if ui.IndicatorID == freeInd.ID {
				alreadyHas = true
				break
			}
		}
		if !alreadyHas {
			allIndicators = append(allIndicators, models.UserIndicator{
				IndicatorID: freeInd.ID,
				Indicator:   freeInd,
			})
		}
	}

	c.JSON(http.StatusOK, gin.H{"indicators": allIndicators})
}

// Purchase or add free indicator
func AddIndicatorToUser(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	indicatorID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid indicator ID"})
		return
	}

	var indicator models.ChartIndicator
	if err := database.DB.First(&indicator, indicatorID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Indicator not found"})
		return
	}

	// Check if already purchased
	var existing models.UserIndicator
	if err := database.DB.Where("user_id = ? AND indicator_id = ?", userID, indicatorID).First(&existing).Error; err == nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Indicator already added"})
		return
	}

	// If paid, handle payment (integrate with existing payment system)
	if !indicator.IsFree {
		// TODO: Integrate with Paystack payment
		c.JSON(http.StatusPaymentRequired, gin.H{"error": "Payment required", "price": indicator.Price})
		return
	}

	// Add to user
	userIndicator := models.UserIndicator{
		UserID:      userID.(uint),
		IndicatorID: uint(indicatorID),
	}

	if err := database.DB.Create(&userIndicator).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to add indicator"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Indicator added successfully"})
}

// Update indicator (admin only)
func UpdateChartIndicator(c *gin.Context) {
	adminID, exists := c.Get("admin_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	indicatorID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid indicator ID"})
		return
	}

	var indicator models.ChartIndicator
	if err := database.DB.First(&indicator, indicatorID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Indicator not found"})
		return
	}

	if indicator.AdminID != adminID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized to update this indicator"})
		return
	}

	var input struct {
		Name        string  `json:"name"`
		Description string  `json:"description"`
		Code        string  `json:"code"`
		Category    string  `json:"category"`
		IsFree      *bool   `json:"is_free"`
		Price       float64 `json:"price"`
		Image       string  `json:"image"`
		Features    string  `json:"features"`
	}

	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	updates := map[string]interface{}{}
	if input.Name != "" {
		updates["name"] = input.Name
	}
	if input.Description != "" {
		updates["description"] = input.Description
	}
	if input.Code != "" {
		updates["code"] = input.Code
	}
	if input.Category != "" {
		updates["category"] = input.Category
	}
	if input.IsFree != nil {
		updates["is_free"] = *input.IsFree
	}
	if input.Price >= 0 {
		updates["price"] = input.Price
	}
	if input.Image != "" {
		updates["image"] = input.Image
	}
	if input.Features != "" {
		updates["features"] = input.Features
	}

	if err := database.DB.Model(&indicator).Updates(updates).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update indicator"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Indicator updated successfully", "indicator": indicator})
}

// Delete indicator (admin only)
func DeleteChartIndicator(c *gin.Context) {
	adminID, exists := c.Get("admin_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}

	indicatorID, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid indicator ID"})
		return
	}

	var indicator models.ChartIndicator
	if err := database.DB.First(&indicator, indicatorID).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Indicator not found"})
		return
	}

	if indicator.AdminID != adminID.(uint) {
		c.JSON(http.StatusForbidden, gin.H{"error": "Not authorized to delete this indicator"})
		return
	}

	// Delete all user_indicators records first (cascade delete)
	if err := database.DB.Where("indicator_id = ?", indicatorID).Delete(&models.UserIndicator{}).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete user indicator records"})
		return
	}

	// Delete the indicator
	if err := database.DB.Delete(&indicator).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete indicator"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "Indicator deleted successfully"})
}

// ── User Custom Indicators ──

func CreateUserIndicator(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var input struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Code        string `json:"code" binding:"required"`
		Category    string `json:"category"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	ind := models.UserCustomIndicator{
		UserID:      userID.(uint),
		Name:        input.Name,
		Description: input.Description,
		Code:        input.Code,
		Category:    input.Category,
	}
	if err := database.DB.Create(&ind).Error; err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create indicator"})
		return
	}
	c.JSON(http.StatusOK, gin.H{"message": "Indicator created", "indicator": ind})
}

func GetUserCustomIndicators(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	var indicators []models.UserCustomIndicator
	database.DB.Where("user_id = ?", userID).Order("created_at DESC").Find(&indicators)
	c.JSON(http.StatusOK, gin.H{"indicators": indicators})
}

func UpdateUserIndicator(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	var ind models.UserCustomIndicator
	if err := database.DB.Where("id = ? AND user_id = ?", id, userID).First(&ind).Error; err != nil {
		c.JSON(http.StatusNotFound, gin.H{"error": "Indicator not found"})
		return
	}
	var input struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Code        string `json:"code"`
		Category    string `json:"category"`
	}
	if err := c.ShouldBindJSON(&input); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}
	if input.Name != "" {
		ind.Name = input.Name
	}
	if input.Description != "" {
		ind.Description = input.Description
	}
	if input.Code != "" {
		ind.Code = input.Code
	}
	if input.Category != "" {
		ind.Category = input.Category
	}
	database.DB.Save(&ind)
	c.JSON(http.StatusOK, gin.H{"message": "Indicator updated", "indicator": ind})
}

func DeleteUserIndicator(c *gin.Context) {
	userID, exists := c.Get("user_id")
	if !exists {
		c.JSON(http.StatusUnauthorized, gin.H{"error": "Unauthorized"})
		return
	}
	id, err := strconv.Atoi(c.Param("id"))
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid ID"})
		return
	}
	database.DB.Where("id = ? AND user_id = ?", id, userID).Delete(&models.UserCustomIndicator{})
	c.JSON(http.StatusOK, gin.H{"message": "Indicator deleted"})
}
