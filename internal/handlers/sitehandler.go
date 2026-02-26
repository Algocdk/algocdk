package handlers

import (
	"fmt"
	"io/ioutil"
	"net/http"
	"os"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
	"github.com/keyadaniel56/algocdk/internal/utils"
)

// GetPublicSitesHandler returns all public sites
func GetPublicSitesHandler(ctx *gin.Context) {
	var sites []models.Site
	if err := database.DB.Where("is_public = ? AND status = ?", true, "active").Order("created_at DESC").Find(&sites).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch sites"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"sites": sites})
}

// CreateSiteHandler godoc
// @Summary Create a new site
// @Description Creates a new website with HTML, CSS, and JS content stored as files
// @Tags admin
// @Accept json
// @Produce json
// @Param body body object true "Site creation details"
// @Security ApiKeyAuth
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Router /api/admin/create-site [post]
func CreateSiteHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	var payload struct {
		Name        string `json:"name" binding:"required"`
		Description string `json:"description"`
		Slug        string `json:"slug" binding:"required"`
		HTMLContent string `json:"html_content"`
		CSSContent  string `json:"css_content"`
		JSContent   string `json:"js_content"`
		IsPublic    bool   `json:"is_public"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// Validate slug format
	payload.Slug = strings.ToLower(strings.ReplaceAll(payload.Slug, " ", "-"))
	if strings.Contains(payload.Slug, "/") {
		parts := strings.Split(payload.Slug, "/")
		payload.Slug = parts[len(parts)-1]
	}

	// Create site directory
	siteDir := fmt.Sprintf("./sites/user_%d/%s", userID, payload.Slug)
	os.MkdirAll(siteDir, 0755)

	// Save HTML file
	htmlPath := fmt.Sprintf("%s/index.html", siteDir)
	htmlContent := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>%s</title>
    <link rel="stylesheet" href="/sites/user_%d/%s/style.css">
</head>
<body>
    %s
    <script src="/sites/user_%d/%s/script.js"></script>
</body>
</html>`, payload.Name, userID, payload.Slug, payload.HTMLContent, userID, payload.Slug)

	ioutil.WriteFile(htmlPath, []byte(htmlContent), 0644)
	ioutil.WriteFile(fmt.Sprintf("%s/style.css", siteDir), []byte(payload.CSSContent), 0644)
	ioutil.WriteFile(fmt.Sprintf("%s/script.js", siteDir), []byte(payload.JSContent), 0644)

	site := models.Site{
		Name:        strings.TrimSpace(payload.Name),
		Description: strings.TrimSpace(payload.Description),
		Slug:        payload.Slug,
		HTMLContent: htmlPath,
		OwnerID:     userID,
		IsPublic:    payload.IsPublic,
		Status:      "active",
		CreatedAt:   utils.FormattedTime(time.Now()),
		UpdatedAt:   utils.FormattedTime(time.Now()),
	}

	if err := database.DB.Create(&site).Error; err != nil {
		if strings.Contains(err.Error(), "UNIQUE constraint failed") {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "A site with this slug already exists. Please choose a different slug."})
		} else {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "failed to create site"})
		}
		return
	}

	ctx.JSON(http.StatusCreated, gin.H{
		"message": "site created successfully",
		"site":    site,
	})
}

// GetAdminSitesHandler godoc
// @Summary Get admin's sites
// @Description Retrieves all sites owned by the authenticated admin
// @Tags admin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/sites [get]
func GetAdminSitesHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	if userID == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	fmt.Printf("[GetAdminSites] Fetching sites for user_id: %d\n", userID)

	var sites []models.Site
	if err := database.DB.Where("owner_id = ?", userID).Order("created_at DESC").Find(&sites).Error; err != nil {
		fmt.Printf("[GetAdminSites] Database error: %v\n", err)
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch sites"})
		return
	}

	fmt.Printf("[GetAdminSites] Found %d sites for user_id %d\n", len(sites), userID)
	ctx.JSON(http.StatusOK, gin.H{"sites": sites})
}

// UpdateSiteHandler godoc
// @Summary Update a site
// @Description Updates site details and content files
// @Tags admin
// @Accept json
// @Produce json
// @Param id path string true "Site ID"
// @Param body body object true "Site update details"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/update-site/{id} [put]
func UpdateSiteHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	siteID := ctx.Param("id")

	var site models.Site
	if err := database.DB.Where("id = ? AND owner_id = ?", siteID, userID).First(&site).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	var payload struct {
		Name        string `json:"name"`
		Description string `json:"description"`
		Slug        string `json:"slug"`
		HTMLContent string `json:"html_content"`
		CSSContent  string `json:"css_content"`
		JSContent   string `json:"js_content"`
		IsPublic    bool   `json:"is_public"`
		Status      string `json:"status"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	if payload.Name != "" {
		site.Name = payload.Name
	}
	if payload.Slug != "" {
		// Validate slug format
		payload.Slug = strings.ToLower(strings.ReplaceAll(payload.Slug, " ", "-"))
		// Remove any URL parts if user entered full URL
		if strings.Contains(payload.Slug, "/") {
			parts := strings.Split(payload.Slug, "/")
			payload.Slug = parts[len(parts)-1]
		}
		site.Slug = payload.Slug
	}
	site.Description = payload.Description
	site.IsPublic = payload.IsPublic

	// Update files if content provided
	if payload.HTMLContent != "" || payload.CSSContent != "" || payload.JSContent != "" {
		siteDir := fmt.Sprintf("./sites/user_%d/%s", userID, site.Slug)
		os.MkdirAll(siteDir, 0755)

		if payload.HTMLContent != "" {
			htmlContent := fmt.Sprintf(`<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>%s</title>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    %s
    <script src="script.js"></script>
</body>
</html>`, site.Name, payload.HTMLContent)
			ioutil.WriteFile(fmt.Sprintf("%s/index.html", siteDir), []byte(htmlContent), 0644)
		}
		if payload.CSSContent != "" {
			ioutil.WriteFile(fmt.Sprintf("%s/style.css", siteDir), []byte(payload.CSSContent), 0644)
		}
		if payload.JSContent != "" {
			ioutil.WriteFile(fmt.Sprintf("%s/script.js", siteDir), []byte(payload.JSContent), 0644)
		}
	}
	if payload.Status != "" {
		site.Status = payload.Status
	}
	site.UpdatedAt = utils.FormattedTime(time.Now())

	if err := database.DB.Save(&site).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update site"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "site updated successfully",
		"site":    site,
	})
}

// DeleteSiteHandler godoc
// @Summary Delete a site
// @Description Deletes a site owned by the authenticated admin
// @Tags admin
// @Produce json
// @Param id path string true "Site ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/delete-site/{id} [delete]
func DeleteSiteHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	siteID := ctx.Param("id")

	var site models.Site
	if err := database.DB.Where("id = ? AND owner_id = ?", siteID, userID).First(&site).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	if err := database.DB.Delete(&site).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to delete site"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "site deleted successfully"})
}

// ViewSiteHandler godoc
// @Summary View a public site
// @Description Serves a public site by its slug
// @Tags public
// @Produce html
// @Param slug path string true "Site slug"
// @Success 200 {string} string "HTML content"
// @Failure 404 {object} map[string]string
// @Router /site/{slug} [get]
func ViewSiteHandler(ctx *gin.Context) {
	slug := ctx.Param("slug")

	var site models.Site
	if err := database.DB.Where("slug = ?", slug).First(&site).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	// Allow owner to view their own sites regardless of public status
	userID, _ := ctx.Get("user_id")
	isOwner := userID != nil && userID.(uint) == site.OwnerID

	if !isOwner && (!site.IsPublic || site.Status != "active") {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "site not available"})
		return
	}

	// Increment view count
	database.DB.Model(&site).Update("view_count", site.ViewCount+1)

	// Serve HTML file
	ctx.File(site.HTMLContent)
}

// GetSiteMembersHandler godoc
// @Summary Get site members
// @Description Retrieves all members of a site owned by the authenticated admin
// @Tags admin
// @Produce json
// @Param id path string true "Site ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/sites/{id}/members [get]
func GetSiteMembersHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	siteID := ctx.Param("id")

	// Verify ownership
	var site models.Site
	if err := database.DB.Where("id = ? AND owner_id = ?", siteID, userID).First(&site).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	var members []models.SiteUser
	if err := database.DB.Preload("User").Where("site_id = ?", siteID).Find(&members).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch members"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"members": members})
}

// AddSiteMemberHandler godoc
// @Summary Add site member
// @Description Adds a user as a member to a site
// @Tags admin
// @Accept json
// @Produce json
// @Param id path string true "Site ID"
// @Param body body object true "Member details"
// @Security ApiKeyAuth
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 409 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/sites/{id}/members [post]
func AddSiteMemberHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	siteID := ctx.Param("id")

	var payload struct {
		UserEmail string `json:"user_email" binding:"required"`
		Role      string `json:"role"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// Verify ownership
	var site models.Site
	if err := database.DB.Where("id = ? AND owner_id = ?", siteID, userID).First(&site).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	// Find user by email
	var user models.User
	if err := database.DB.Where("email = ?", payload.UserEmail).First(&user).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	// Check if already a member
	var existingMember models.SiteUser
	if err := database.DB.Where("site_id = ? AND user_id = ?", siteID, user.ID).First(&existingMember).Error; err == nil {
		ctx.JSON(http.StatusConflict, gin.H{"error": "user is already a member"})
		return
	}

	role := "member"
	if payload.Role != "" {
		role = payload.Role
	}

	siteIDInt, _ := strconv.Atoi(siteID)
	member := models.SiteUser{
		SiteID:   uint(siteIDInt),
		UserID:   user.ID,
		Role:     role,
		JoinedAt: utils.FormattedTime(time.Now()),
	}

	if err := database.DB.Create(&member).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to add member"})
		return
	}

	ctx.JSON(http.StatusCreated, gin.H{
		"message": "member added successfully",
		"member":  member,
	})
}

// RemoveSiteMemberHandler godoc
// @Summary Remove site member
// @Description Removes a user from a site
// @Tags admin
// @Produce json
// @Param site_id path string true "Site ID"
// @Param user_id path string true "User ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/sites/{site_id}/members/{user_id} [delete]
func RemoveSiteMemberHandler(ctx *gin.Context) {
	userID := ctx.GetUint("user_id")
	siteID := ctx.Param("site_id")
	memberUserID := ctx.Param("user_id")

	// Verify ownership
	var site models.Site
	if err := database.DB.Where("id = ? AND owner_id = ?", siteID, userID).First(&site).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	if err := database.DB.Where("site_id = ? AND user_id = ?", siteID, memberUserID).Delete(&models.SiteUser{}).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to remove member"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "member removed successfully"})
}
