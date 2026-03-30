package handlers

import (
	"fmt"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strconv"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
	"github.com/keyadaniel56/algocdk/internal/security"
	"github.com/keyadaniel56/algocdk/internal/utils"
)

// GetPublicSitesHandler returns all public sites
func GetPublicSitesHandler(ctx *gin.Context) {
	var sites []models.Site
	if err := database.DB.Preload("Owner").Where("is_public = ? AND status = ?", true, "active").Order("created_at DESC").Find(&sites).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch sites"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"sites": sites})
}

// CreateSiteHandler godoc
// @Summary Create a new site
// @Description Creates a new website by uploading a complete folder
// @Tags admin
// @Accept multipart/form-data
// @Produce json
// @Param name formData string true "Site name"
// @Param slug formData string true "Site slug"
// @Param description formData string false "Site description"
// @Param is_public formData bool false "Is public"
// @Param files formData file true "Website files"
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

	name := ctx.PostForm("name")
	slug := ctx.PostForm("slug")
	description := ctx.PostForm("description")
	isPublic := ctx.PostForm("is_public") == "true"

	if name == "" || slug == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "name and slug are required"})
		return
	}

	// Validate slug - only allow alphanumeric and hyphens to prevent path traversal
	slug = strings.ToLower(strings.ReplaceAll(slug, " ", "-"))
	if !regexp.MustCompile(`^[a-z0-9-]+$`).MatchString(slug) {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "slug may only contain lowercase letters, numbers, and hyphens"})
		return
	}

	// Create site directory
	siteDir := fmt.Sprintf("./sites/user_%d/%s", userID, slug)
	absSiteDir, _ := filepath.Abs(siteDir)
	if err := os.MkdirAll(absSiteDir, 0755); err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create site directory"})
		return
	}

	// Handle file uploads
	form, err := ctx.MultipartForm()
	if err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "failed to parse form"})
		return
	}

	files := form.File["files"]
	if len(files) == 0 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "no files uploaded"})
		return
	}

	// Security scan
	scanResult := security.ScanFiles(files)
	if !scanResult.Safe {
		ctx.JSON(http.StatusBadRequest, gin.H{
			"error":  "Security scan failed",
			"issues": scanResult.Issues,
		})
		return
	}

	// Save all uploaded files
	for _, file := range files {
		relPath := file.Filename
		if strings.Contains(relPath, "/") {
			parts := strings.SplitN(relPath, "/", 2)
			if len(parts) > 1 {
				relPath = parts[1]
			}
		}

		destPath := filepath.Join(absSiteDir, relPath)
		// Prevent path traversal - ensure dest is within site directory
		if !strings.HasPrefix(filepath.Clean(destPath), absSiteDir) {
			continue
		}

		if err := os.MkdirAll(filepath.Dir(destPath), 0755); err != nil {
			continue
		}
		if err := ctx.SaveUploadedFile(file, destPath); err != nil {
			continue
		}
	}

	// Find index.html or first HTML file
	indexPath := filepath.Join(absSiteDir, "index.html")
	if _, err := os.Stat(indexPath); os.IsNotExist(err) {
		filepath.Walk(absSiteDir, func(path string, info os.FileInfo, err error) error {
			if err == nil && !info.IsDir() && strings.HasSuffix(strings.ToLower(path), ".html") {
				indexPath = path
				return filepath.SkipAll
			}
			return nil
		})
	}

	site := models.Site{
		Name:        strings.TrimSpace(name),
		Description: strings.TrimSpace(description),
		Slug:        slug,
		HTMLContent: indexPath,
		OwnerID:     userID,
		IsPublic:    isPublic,
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
// @Description Updates site details and optionally uploads new files
// @Tags admin
// @Accept multipart/form-data
// @Produce json
// @Param id path string true "Site ID"
// @Param name formData string false "Site name"
// @Param slug formData string false "Site slug"
// @Param description formData string false "Site description"
// @Param is_public formData bool false "Is public"
// @Param status formData string false "Site status"
// @Param files formData file false "Website files"
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

	name := ctx.PostForm("name")
	slug := ctx.PostForm("slug")
	description := ctx.PostForm("description")
	isPublicStr := ctx.PostForm("is_public")
	status := ctx.PostForm("status")

	if name != "" {
		site.Name = name
	}
	if slug != "" {
		slug = strings.ToLower(strings.ReplaceAll(slug, " ", "-"))
		if strings.Contains(slug, "/") {
			parts := strings.Split(slug, "/")
			slug = parts[len(parts)-1]
		}
		site.Slug = slug
	}
	if description != "" {
		site.Description = description
	}
	if isPublicStr != "" {
		site.IsPublic = isPublicStr == "true"
	}
	if status != "" {
		site.Status = status
	}

	// Handle file uploads if provided
	form, err := ctx.MultipartForm()
	if err == nil {
		files := form.File["files"]
		if len(files) > 0 {
			// Security scan
			scanResult := security.ScanFiles(files)
			if !scanResult.Safe {
				ctx.JSON(http.StatusBadRequest, gin.H{
					"error":  "Security scan failed",
					"issues": scanResult.Issues,
				})
				return
			}

			siteDir := fmt.Sprintf("./sites/user_%d/%s", userID, site.Slug)
			os.MkdirAll(siteDir, 0755)

			for _, file := range files {
				relPath := file.Filename
				if strings.Contains(relPath, "/") {
					parts := strings.SplitN(relPath, "/", 2)
					if len(parts) > 1 {
						relPath = parts[1]
					}
				}

				destPath := filepath.Join(siteDir, relPath)
				os.MkdirAll(filepath.Dir(destPath), 0755)
				ctx.SaveUploadedFile(file, destPath)
			}

			// Update index path
			indexPath := filepath.Join(siteDir, "index.html")
			if _, err := os.Stat(indexPath); err == nil {
				site.HTMLContent = indexPath
			}
		}
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

	// Redirect to static site path
	siteDir := filepath.Dir(site.HTMLContent)
	relPath := strings.TrimPrefix(siteDir, "./")
	ctx.Redirect(http.StatusFound, "/"+relPath+"/index.html")
}

// ServeSiteAsset serves static assets for a site
func ServeSiteAsset(ctx *gin.Context) {
	slug := ctx.Param("slug")
	assetPath := ctx.Param("filepath")

	var site models.Site
	if err := database.DB.Where("slug = ?", slug).First(&site).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "site not found"})
		return
	}

	// Check permissions
	userID, _ := ctx.Get("user_id")
	isOwner := userID != nil && userID.(uint) == site.OwnerID

	if !isOwner && (!site.IsPublic || site.Status != "active") {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "site not available"})
		return
	}

	// Construct full path
	siteDir := filepath.Dir(site.HTMLContent)
	fullPath := filepath.Join(siteDir, assetPath)

	// Security: ensure path is within site directory
	if !strings.HasPrefix(fullPath, siteDir) {
		ctx.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	// Check if file exists
	if _, err := os.Stat(fullPath); os.IsNotExist(err) {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "file not found"})
		return
	}

	// Serve the file
	ctx.File(fullPath)
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
