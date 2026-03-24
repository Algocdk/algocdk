package handlers

import (
	"net/http"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
	"github.com/keyadaniel56/algocdk/internal/utils"
)

// RequestAdminStatus godoc
// @Summary Request admin status
// @Description Allows a user to request admin status
// @Tags user
// @Accept json
// @Produce json
// @Param body body object true "Admin request details"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Router /api/user/request-admin [post]
func RequestAdminStatus(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var payload struct {
		Reason string `json:"reason" binding:"required"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "reason is required"})
		return
	}

	// Check if user already has a pending request
	var existingRequest models.AdminRequest
	if err := database.DB.Where("user_id = ? AND status = ?", userID, "pending").First(&existingRequest).Error; err == nil {
		ctx.JSON(http.StatusConflict, gin.H{"error": "you already have a pending admin request"})
		return
	}

	// Check if user is already an admin
	var user models.User
	if err := database.DB.First(&user, userID).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if user.Role == "Admin" || user.Role == "admin" || user.Role == "superadmin" {
		ctx.JSON(http.StatusConflict, gin.H{"error": "you are already an admin"})
		return
	}

	// Create admin request
	adminRequest := models.AdminRequest{
		UserID:    userID,
		Reason:    strings.TrimSpace(payload.Reason),
		Status:    "pending",
		CreatedAt: utils.FormattedTime(time.Now()),
		UpdatedAt: utils.FormattedTime(time.Now()),
	}

	if err := database.DB.Create(&adminRequest).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create admin request"})
		return
	}

	// Update user's upgrade request status
	user.UpgradeRequestStatus = "pending"
	database.DB.Save(&user)

	ctx.JSON(http.StatusOK, gin.H{
		"message": "admin request submitted successfully",
		"request": gin.H{
			"id":         adminRequest.ID,
			"status":     adminRequest.Status,
			"created_at": adminRequest.CreatedAt,
		},
	})
}

// GetPendingAdminRequests godoc
// @Summary Get pending admin requests
// @Description Retrieves all pending admin requests for superadmin review
// @Tags superadmin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /api/superadmin/admin-requests [get]
func GetPendingAdminRequests(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Verify superadmin role
	var superAdmin models.SuperAdmin
	if err := database.DB.First(&superAdmin, userID).Error; err != nil {
		ctx.JSON(http.StatusForbidden, gin.H{"error": "access denied - superadmin only"})
		return
	}

	var requests []models.AdminRequest
	if err := database.DB.Preload("User").Where("status = ?", "pending").Order("created_at DESC").Find(&requests).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch admin requests"})
		return
	}

	var response []gin.H
	for _, req := range requests {
		// Check if this user has an active subscription
		var sub models.Subscription
		hasSub := database.DB.Where("user_id = ? AND plan = ? AND status = ?", req.UserID, "admin", "active").First(&sub).Error == nil

		response = append(response, gin.H{
			"id":              req.ID,
			"reason":          req.Reason,
			"status":          req.Status,
			"created_at":      req.CreatedAt,
			"has_subscription": hasSub,
			"user": gin.H{
				"id":      req.User.ID,
				"name":    req.User.Name,
				"email":   req.User.Email,
				"country": req.User.Country,
				"joined":  req.User.CreatedAt,
			},
		})
	}

	ctx.JSON(http.StatusOK, gin.H{
		"requests": response,
		"count":    len(response),
	})
}

// ReviewAdminRequest godoc
// @Summary Review admin request
// @Description Approve or reject an admin request
// @Tags superadmin
// @Accept json
// @Produce json
// @Param id path string true "Request ID"
// @Param body body object true "Review decision"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/superadmin/admin-requests/{id}/review [post]
func ReviewAdminRequest(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Verify superadmin role
	var superAdmin models.SuperAdmin
	if err := database.DB.First(&superAdmin, userID).Error; err != nil {
		ctx.JSON(http.StatusForbidden, gin.H{"error": "access denied - superadmin only"})
		return
	}

	requestID, err := strconv.Atoi(ctx.Param("id"))
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request ID"})
		return
	}

	var payload struct {
		Action string `json:"action" binding:"required,oneof=approve reject"`
		Notes  string `json:"notes"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// Find the admin request
	var adminRequest models.AdminRequest
	if err := database.DB.Preload("User").First(&adminRequest, requestID).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "admin request not found"})
		return
	}

	if adminRequest.Status != "pending" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "request has already been reviewed"})
		return
	}

	// Update request status
	now := time.Now()
	adminRequest.Status = payload.Action + "d" // approved or rejected
	adminRequest.ReviewedBy = &userID
	adminRequest.ReviewedAt = &now
	adminRequest.ReviewNotes = strings.TrimSpace(payload.Notes)
	adminRequest.UpdatedAt = utils.FormattedTime(now)

	if err := database.DB.Save(&adminRequest).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update request"})
		return
	}

	// Update user status
	var user models.User
	if err := database.DB.First(&user, adminRequest.UserID).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "user not found"})
		return
	}

	if payload.Action == "approve" {
		// Mark as approved — role upgrade happens after subscription payment
		user.UpgradeRequestStatus = "approved"
	} else {
		user.UpgradeRequestStatus = "rejected"
	}

	user.UpdatedAt = utils.FormattedTime(now)
	database.DB.Save(&user)

	ctx.JSON(http.StatusOK, gin.H{
		"message": "admin request " + payload.Action + "d successfully",
		"request": gin.H{
			"id":           adminRequest.ID,
			"status":       adminRequest.Status,
			"reviewed_at":  adminRequest.ReviewedAt,
			"review_notes": adminRequest.ReviewNotes,
		},
		"user": gin.H{
			"id":   user.ID,
			"name": user.Name,
			"role": user.Role,
		},
	})
}

// GetAllAdminRequests godoc
// @Summary Get all admin requests
// @Description Retrieves all admin requests with their status
// @Tags superadmin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Router /api/superadmin/admin-requests/all [get]
func GetAllAdminRequests(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Verify superadmin role
	var superAdmin models.SuperAdmin
	if err := database.DB.First(&superAdmin, userID).Error; err != nil {
		ctx.JSON(http.StatusForbidden, gin.H{"error": "access denied - superadmin only"})
		return
	}

	var requests []models.AdminRequest
	if err := database.DB.Preload("User").Preload("Reviewer").Order("created_at DESC").Find(&requests).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch admin requests"})
		return
	}

	var response []gin.H
	for _, req := range requests {
		requestData := gin.H{
			"id":         req.ID,
			"reason":     req.Reason,
			"status":     req.Status,
			"created_at": req.CreatedAt,
			"updated_at": req.UpdatedAt,
			"user": gin.H{
				"id":      req.User.ID,
				"name":    req.User.Name,
				"email":   req.User.Email,
				"country": req.User.Country,
				"role":    req.User.Role,
			},
		}

		if req.ReviewedAt != nil {
			requestData["reviewed_at"] = req.ReviewedAt
			requestData["review_notes"] = req.ReviewNotes
			if req.Reviewer != nil {
				requestData["reviewer"] = gin.H{
					"id":   req.Reviewer.ID,
					"name": req.Reviewer.Name,
				}
			}
		}

		response = append(response, requestData)
	}

	// Get statistics
	var stats struct {
		Total    int64
		Pending  int64
		Approved int64
		Rejected int64
	}
	database.DB.Model(&models.AdminRequest{}).Count(&stats.Total)
	database.DB.Model(&models.AdminRequest{}).Where("status = ?", "pending").Count(&stats.Pending)
	database.DB.Model(&models.AdminRequest{}).Where("status = ?", "approved").Count(&stats.Approved)
	database.DB.Model(&models.AdminRequest{}).Where("status = ?", "rejected").Count(&stats.Rejected)

	ctx.JSON(http.StatusOK, gin.H{
		"requests": response,
		"stats":    stats,
	})
}

// GetUserAdminRequestStatus godoc
// @Summary Get user's admin request status
// @Description Retrieves the current user's admin request status
// @Tags user
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Router /api/user/admin-request-status [get]
func GetUserAdminRequestStatus(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var adminRequest models.AdminRequest
	err := database.DB.Where("user_id = ?", userID).Order("created_at DESC").First(&adminRequest).Error

	if err != nil {
		ctx.JSON(http.StatusOK, gin.H{
			"has_request": false,
			"message":     "no admin request found",
		})
		return
	}

	response := gin.H{
		"has_request": true,
		"request": gin.H{
			"id":         adminRequest.ID,
			"status":     adminRequest.Status,
			"reason":     adminRequest.Reason,
			"created_at": adminRequest.CreatedAt,
		},
	}

	if adminRequest.ReviewedAt != nil {
		response["request"].(gin.H)["reviewed_at"] = adminRequest.ReviewedAt
		response["request"].(gin.H)["review_notes"] = adminRequest.ReviewNotes
	}

	ctx.JSON(http.StatusOK, response)
}
