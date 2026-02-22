package handlers

import (
	"crypto/subtle"
	"errors"
	"fmt"
	"io/fs"
	"io/ioutil"
	"log"
	"net/http"
	"os"
	"path/filepath"
	"regexp"
	"strings"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
	"github.com/keyadaniel56/algocdk/internal/utils"
	"gorm.io/gorm"
)

// SuperAdminRegisterHandler godoc
// @Summary Register a super admin
// @Description Registers a new super admin with the provided details and secret
// @Tags superadmin
// @Accept json
// @Produce json
// @Param body body object true "Super admin registration details"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/auth/signup [post]
func SuperAdminRegisterHandler(ctx *gin.Context) {
	var superAdminSecret = os.Getenv("SUPER_ADMIN_SECRET")
	var payload struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
		Secret   string `json:"secret"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	// Check secret using constant-time comparison
	if subtle.ConstantTimeCompare([]byte(payload.Secret), []byte(superAdminSecret)) == 0 {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	// Sanitize inputs
	payload.Name = strings.TrimSpace(payload.Name)
	payload.Email = strings.ToLower(strings.TrimSpace(payload.Email))
	payload.Password = strings.TrimSpace(payload.Password)

	// Validate inputs
	if payload.Name == "" || payload.Email == "" || payload.Password == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "all fields required"})
		return
	}
	if !utils.IsValidEmail(payload.Email) {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid email format"})
		return
	}
	if len(payload.Password) < 8 {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "password must be at least 8 characters"})
		return
	}

	// Check for existing email
	var existing models.User
	if err := database.DB.Where("email = ?", payload.Email).First(&existing).Error; err == nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "email already exists"})
		return
	}

	// Hash password
	hashedPassword, err := utils.HashPassword(payload.Password)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}
	clientIP := ctx.ClientIP()
	country, err := utils.DetectCountry(clientIP)
	if err != nil || country == "" {
		country = "Uknown"
	}
	// Create super admin
	superAdmin := models.SuperAdmin{
		Name:      payload.Name,
		Email:     payload.Email,
		Password:  hashedPassword,
		Role:      "superadmin",
		CreatedAt: utils.FormattedTime(time.Now()),
		UpdatedAt: utils.FormattedTime(time.Now()),
	}

	if err := database.DB.Create(&superAdmin).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "could not create superadmin"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "superadmin registered successfully"})
}

// SuperAdminLoginHandler godoc
// @Summary Login as super admin
// @Description Logs in a super admin and returns a token
// @Tags superadmin
// @Accept json
// @Produce json
// @Param body body object true "Super admin login details"
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/auth/login [post]
func SuperAdminLoginHandler(ctx *gin.Context) {
	var payload struct {
		Email        string `json:"email"`
		Password     string `json:"password"`
		RefreshToken string `json:"refresh_token"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
	}

	payload.Email = strings.ToLower(strings.TrimSpace(payload.Email))
	payload.Password = strings.TrimSpace(payload.Password)
	if payload.Email == "" || payload.Password == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "email and password required"})
		return
	}
	if !utils.IsValidEmail(payload.Email) {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid email format"})
		return
	}

	var superadmin models.SuperAdmin
	if err := database.DB.Where("email=?", payload.Email).First(&superadmin).Error; err != nil {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "invalid credentials"})
		return
	}
	if !utils.IsHashed(superadmin.Password, payload.Password) {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "invalid password"})
		return
	}

	// ensure role is set
	if superadmin.Role == "" {
		superadmin.Role = "superadmin"
	}

	token, err := utils.GenerateToken(superadmin.ID, superadmin.Email, "superadmin")
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "could not generate token"})
		return
	}

	var last_login utils.FormattedTime
	last_login = utils.FormattedTime(time.Now())

	payload.RefreshToken, _ = utils.RefreshToken(superadmin.Email)
	ctx.JSON(http.StatusOK, gin.H{
		"message":       "login succesful",
		"token":         token,
		"refresh_token": payload.RefreshToken,
		"role":          superadmin.Role,
		"membership":    superadmin.Membership,
		"user": gin.H{
			"id":         superadmin.ID,
			"name":       superadmin.Name,
			"email":      superadmin.Email,
			"created_at": superadmin.CreatedAt,
		},
		"last_login": last_login,
	})

}

// SuperAdminProfileHandler godoc
// @Summary Get super admin profile
// @Description Retrieves the profile of a super admin by ID
// @Tags superadmin
// @Produce json
// @Param id path string true "Super Admin ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]string
// @Router /api/superadmin/profile/{id} [get]
func SuperAdminProfileHandler(ctx *gin.Context) {
	id := ctx.Param("id")
	var user models.SuperAdmin
	if err := database.DB.First(&user, id).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	// ensure role is present in response
	role := user.Role
	if role == "" {
		role = "superadmin"
	}
	ctx.JSON(http.StatusOK, gin.H{
		"user": gin.H{
			"id":         user.ID,
			"name":       user.Name,
			"email":      user.Email,
			"joined":     time.Time(user.CreatedAt).Format(time.RFC3339),
			"membership": user.Membership,
			"role":       role,
		},
	})

}

// SuperAdminDashboardHandler godoc
// @Summary Get super admin dashboard
// @Description Retrieves dashboard information for a super admin by ID
// @Tags superadmin
// @Produce json
// @Param id path string true "Super Admin ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Router /api/superadmin/superadmindashboard/{id} [get]
func SuperAdminDashboardHandler(ctx *gin.Context) {
	id := ctx.Param("id")
	var user models.SuperAdmin

	if err := database.DB.First(&user, id).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if user.Role != "superadmin" {
		ctx.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{
		"message": "Welcome to the SuperAdmin Dashboard",
		"user": gin.H{
			"id":        user.ID,
			"name":      user.Name,
			"email":     user.Email,
			"role":      user.Role,
			"joined":    user.CreatedAt,
			"updatedat": user.UpdatedAt,
		},
		// You can add additional stats, bot counts, etc. here
	})
}

// CreateUser godoc
// @Summary Create a new user
// @Description Creates a new user as a super admin
// @Tags superadmin
// @Accept json
// @Produce json
// @Param body body object true "User creation details"
// @Security ApiKeyAuth
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/create_user [post]
func CreateUser(ctx *gin.Context) {
	var payload struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}

	payload.Email = strings.ToLower(strings.TrimSpace(payload.Email))
	payload.Name = strings.TrimSpace(payload.Name)
	payload.Password = strings.TrimSpace(payload.Password)

	payload.Email = strings.ToLower(strings.TrimSpace(payload.Email))
	payload.Name = strings.TrimSpace(payload.Name)
	payload.Password = strings.TrimSpace(payload.Password)

	if payload.Email == "" || payload.Name == "" || payload.Password == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "all fields required"})
		return
	}

	if !utils.IsValidEmail(payload.Email) {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid email"})
		return
	}

	if !utils.IsValidPassword(payload.Password) {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid password strength"})
		return
	}
	var existing models.User
	if err := database.DB.Where("email = ?", payload.Email).First(&existing).Error; err == nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "user already exists"})
		return
	}

	hashedPassword, err := utils.HashPassword(payload.Password)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}
	clientIP := ctx.ClientIP()
	country, err := utils.DetectCountry(clientIP)
	if err != nil || country == "" {
		country = "Uknown"
	}
	user := models.User{
		Name:      payload.Name,
		Email:     payload.Email,
		Password:  hashedPassword,
		Role:      "user",
		Country:   country,
		CreatedAt: utils.FormattedTime(time.Now()),
		UpdatedAt: utils.FormattedTime(time.Now()),
	}

	if err := database.DB.Create(&user).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create user", "details": err.Error()})
		return
	}

	ctx.JSON(http.StatusCreated, gin.H{
		"message": "user created successfully",
		"user_id": user.ID,
		"email":   user.Email,
	})
}

// UpdateUser godoc
// @Summary Update a user
// @Description Updates user details by ID as a super admin
// @Tags superadmin
// @Accept json
// @Produce json
// @Param id path string true "User ID"
// @Param body body object true "User update details"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/update_user/{id} [post]
func UpdateUser(ctx *gin.Context) {

	id := ctx.Param("id")
	var payload struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	var user models.User
	if err := database.DB.First(&user, id).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}
	if payload.Name != "" {
		user.Name = strings.TrimSpace(payload.Name)
	}
	if payload.Password != "" {
		hashed, _ := utils.HashPassword(payload.Password)
		user.Password = hashed
	}

	if payload.Email != "" {

		if !utils.IsValidEmail(payload.Email) {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid email"})
			return
		}
		user.Email = payload.Email
	}
	user.UpdatedAt = utils.FormattedTime(time.Now())
	if err := database.DB.Save(&user).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to update profile", "details": err.Error()})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{
		"message": "profile updated succesfully",
		"data": gin.H{
			"id":              user.ID,
			"name":            user.Name,
			"email":           user.Email,
			"membership_type": user.Membership,
			"created_at":      user.CreatedAt,
			"updated_at":      user.UpdatedAt,
		},
	})
}

// DeleteUser godoc
// @Summary Delete a user
// @Description Deletes a user by ID as a super admin
// @Tags superadmin
// @Produce json
// @Param id path string true "User ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]string
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/delete_user/{id} [delete]
func DeleteUser(ctx *gin.Context) {
	id := ctx.Param("id")

	var user models.User

	if err := database.DB.First(&user, id).Error; err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "user witht that id not found"})
		return
	}

	if err := database.DB.Delete(&user).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": err.Error()})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "user deleted succesfully"})
}

// GetAllUsers godoc
// @Summary Get all users
// @Description Retrieves a list of all users as a super admin
// @Tags superadmin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/users [get]
func GetAllUsers(ctx *gin.Context) {
	var users []models.User

	if err := database.DB.Find(&users).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch users"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{"users": users})
}

// GetUserByID godoc
// @Summary Get user by ID
// @Description Retrieves a user by ID as a super admin
// @Tags superadmin
// @Produce json
// @Param id path string true "User ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]string
// @Router /api/superadmin/user/{id} [get]
func GetUserByID(ctx *gin.Context) {
	id := ctx.Param("id")
	var user models.User

	if err := database.DB.First(&user, id).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "User not found"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"user": user})
}

// CreateAdmin godoc
// @Summary Create a new admin
// @Description Creates a new admin as a super admin
// @Tags superadmin
// @Accept json
// @Produce json
// @Param body body object true "Admin creation details"
// @Security ApiKeyAuth
// @Success 201 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/create_admin [post]
func CreateAdmin(ctx *gin.Context) {
	var payload struct {
		Name     string `json:"name"`
		Email    string `json:"email"`
		Password string `json:"password"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body", "details": err.Error()})
		return
	}

	payload.Email = strings.ToLower(strings.TrimSpace(payload.Email))
	payload.Name = strings.TrimSpace(payload.Name)
	payload.Password = strings.TrimSpace(payload.Password)

	if payload.Email == "" || payload.Name == "" || payload.Password == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "all fields required"})
		return
	}

	var existing models.User
	if err := database.DB.Where("email = ?", payload.Email).First(&existing).Error; err == nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "user already exists"})
		return
	}

	hashedPassword, err := utils.HashPassword(payload.Password)
	if err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to hash password"})
		return
	}

	person := models.User{
		Name:       payload.Name,
		Email:      payload.Email,
		Password:   hashedPassword,
		Role:       "Admin",
		Membership: "Premium",
		CreatedAt:  utils.FormattedTime(time.Now()),
		UpdatedAt:  utils.FormattedTime(time.Now()),
	}

	if err := database.DB.Create(&person).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create person", "details": err.Error()})
		return
	}

	admin := models.Admin{
		PersonID: person.ID,
	}
	if err := database.DB.Create(&admin).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to create admin record", "details": err.Error()})
		return
	}

	ctx.JSON(http.StatusCreated, gin.H{
		"message": "admin created successfully",
		"data": gin.H{
			"message":    "admin created successfully",
			"person_id":  person.ID,
			"admin_id":   admin.ID,
			"email":      person.Email,
			"role":       person.Role,
			"created_at": person.CreatedAt,
			"updated_at": person.UpdatedAt,
		},
	})
}

// GetAllAdmins godoc
// @Summary Get all admins
// @Description Retrieves a list of all admins as a super admin
// @Tags superadmin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/get_all_admins [get]
func GetAllAdmins(ctx *gin.Context) {
	var admins []models.User

	if err := database.DB.Where("role IN ?", []string{"Admin", "Senior Admin", "Super Admin", "ADMIN"}).Find(&admins).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch admins"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"admins": admins})
}

// ToggleAdminStatus godoc
// @Summary Toggle admin status
// @Description Toggles the status of an admin by ID
// @Tags superadmin
// @Produce json
// @Param id path string true "Admin ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/toggle_admin_status/{id} [get]
func ToggleAdminStatus(ctx *gin.Context) {
	id := ctx.Param("id")
	var admin models.User

	if err := database.DB.First(&admin, id).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "Admin not found"})
		return
	}

	if admin.UpgradeRequestStatus == "Active" || admin.UpgradeRequestStatus == "" {
		admin.UpgradeRequestStatus = "Suspended"
	} else {
		admin.UpgradeRequestStatus = "Active"
	}

	if err := database.DB.Save(&admin).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update status"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"admin": admin})
}

// UpdateAdmin godoc
// @Summary Update an admin
// @Description Updates admin details by ID
// @Tags superadmin
// @Accept json
// @Produce json
// @Param id path string true "Admin ID"
// @Param body body object true "Admin update details"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/update_admin/{id} [post]
func UpdateAdmin(ctx *gin.Context) {
	id := ctx.Param("id")
	var admin models.User

	if err := database.DB.First(&admin, id).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "Admin not found"})
		return
	}

	var input struct {
		Name     string `json:"name"`
		Email    string `json:"email" binding:"email"`
		Role     string `json:"role"`
		Phone    string `json:"phone"`
		Country  string `json:"country"`
		Password string `json:"password"`
	}

	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": err.Error()})
		return
	}

	if input.Name != "" {
		admin.Name = input.Name
	}
	if input.Email != "" {
		if !utils.IsValidEmail(input.Email) {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid email format"})
			return
		}
	}
	if input.Role != "" {
		admin.Role = input.Role
	}
	if input.Country != "" {
		admin.Country = input.Country
	}

	if input.Password != "" {
		if !utils.IsValidPassword(input.Password) {
			ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid password strength"})
			return
		}
		admin.Password = input.Password
	}
	if err := database.DB.Save(&admin).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update admin"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"admin": admin})
}

// DeleteAdmin godoc
// @Summary Delete an admin
// @Description Deletes an admin by ID
// @Tags superadmin
// @Produce json
// @Param id path string true "Admin ID"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/delete_admin/{id} [delete]
func DeleteAdmin(ctx *gin.Context) {
	id := ctx.Param("id")
	var admin models.User

	if err := database.DB.First(&admin, id).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "Admin not found"})
		return
	}

	if err := database.DB.Delete(&admin).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to delete admin"})
		return
	}

	ctx.JSON(http.StatusOK, gin.H{"message": "Admin deleted successfully"})
}

// UpdateAdminPassword godoc
// @Summary Update admin password
// @Description Updates the password for an admin by ID
// @Tags superadmin
// @Accept json
// @Produce json
// @Param id path string true "Admin ID"
// @Param body body object true "New password"
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 400 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/update_admin_password/{id} [post]
func UpdateAdminPassword(ctx *gin.Context) {
	var payload struct {
		Password string `json:"password"`
	}

	if err := ctx.ShouldBindJSON(&payload); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid request body"})
		return
	}
	id := ctx.Param("id")
	var admin models.User

	if payload.Password == "" {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "the password field is reuired in order to update"})
	}
	if !utils.IsValidPassword(payload.Password) {
		ctx.JSON(http.StatusBadRequest, gin.H{"error": "invalid password strength"})
		return
	}
	if err := database.DB.First(&admin, id).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "Admin not found"})
		return
	}
	if err := database.DB.Save(&admin).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update user password"})
		return
	}
	ctx.JSON(http.StatusOK, gin.H{
		"message": "updated succesfully",
		"data": gin.H{
			"user": admin,
		},
	})
}

// GetBotsHandler godoc
// @Summary Get all bots
// @Description Retrieves a list of all bots with owner and subscriber info
// @Tags superadmin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/bots [get]
func GetBotsHandler(ctx *gin.Context) {
	var bots []models.Bot

	if err := database.DB.Find(&bots).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "failed to fetch bots"})
		return
	}

	var response []gin.H
	for _, bot := range bots {
		var owner models.User
		if err := database.DB.Select("id", "name", "email").First(&owner, bot.OwnerID).Error; err != nil {
			log.Printf(" Owner not found for bot %d (owner_id=%d): %v", bot.ID, bot.OwnerID, err)
			owner = models.User{
				Name:  "Unknown",
				Email: "N/A",
			}
		}

		var subscriberCount int64
		if err := database.DB.Table("bot_users").Where("bot_id = ?", bot.ID).Count(&subscriberCount).Error; err != nil {
			log.Printf(" Failed to count subscribers for bot %d: %v", bot.ID, err)
			subscriberCount = 0
		}

		response = append(response, gin.H{
			"id":                 bot.ID,
			"name":               bot.Name,
			"subscriptionType":   bot.SubscriptionType,
			"price":              bot.Price,
			"subscriptionCount":  subscriberCount,
			"subscriptionExpiry": bot.SubscriptionExpiry,
			"status":             bot.Status,
			"owner": gin.H{
				"id":    owner.ID,
				"name":  owner.Name,
				"email": owner.Email,
			},
		})
	}
	ctx.JSON(http.StatusOK, gin.H{"bots": response})
}

// ScanAllBotsHandler godoc
// @Summary Scan all bots
// @Description Scans all bot files for invalid App IDs
// @Tags superadmin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/scan_bots [get]
func ScanAllBotsHandler(c *gin.Context) {
	rootDir := "./uploads"
	var invalidBots []map[string]interface{}

	// Regex to match app_id or appId assignments
	re := regexp.MustCompile(`(?i)(app[_]?id)\s*[:=]\s*['"]?(\d+)['"]?`)

	// Walk through all files in uploads
	err := filepath.WalkDir(rootDir, func(path string, d fs.DirEntry, err error) error {
		if err != nil {
			return err
		}

		// Only scan .html or .js files
		if !d.IsDir() && (filepath.Ext(path) == ".html" || filepath.Ext(path) == ".js") {
			bytes, err := ioutil.ReadFile(path)
			if err != nil {
				return err
			}

			matches := re.FindAllStringSubmatch(string(bytes), -1)
			for _, m := range matches {
				if len(m) > 2 && m[2] != "1089" {
					// Try to find bot record
					var bot models.Bot
					err := database.DB.Where("html_file = ?", path).First(&bot).Error
					if errors.Is(err, gorm.ErrRecordNotFound) {
						bot = models.Bot{} // fallback
					} else if err != nil {
						return err
					}

					// Try to find owner
					var owner models.User
					// ownerName := "Unknown Owner"
					if bot.OwnerID != 0 {
						err := database.DB.Where("id = ?", bot.OwnerID).First(&owner).Error
						if err == nil {
							// ownerName = owner.Name
						}
					}

					invalidBots = append(invalidBots, map[string]interface{}{
						"bot_name": bot.Name,
						"owner":    bot.OwnerID,
						"file":     path,
						"app_id":   m[2],
						"name":     bot.Name,
						"filename": bot.HTMLFile,
					})
				}
			}
		}
		return nil
	})

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Failed to scan bots",
			"details": err.Error(),
		})
		return
	}

	if len(invalidBots) > 0 {
		c.JSON(http.StatusOK, gin.H{
			"message":      fmt.Sprintf("Scan completed. Found %d bots with invalid App IDs.", len(invalidBots)),
			"invalid_bots": invalidBots,
		})
		return
	}

	c.JSON(http.StatusOK, gin.H{"message": "All bots are valid"})
}

// GetAllTransactions godoc
// @Summary Get all transactions
// @Description Retrieves all transactions for super admin
// @Tags superadmin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/transactions [get]
func GetAllTransactions(ctx *gin.Context) {
	userID, exists := ctx.Get("user_id")
	if !exists {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	userIDUint, ok := userID.(uint)
	if !ok {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user id"})
		return
	}

	// Verify superadmin role
	var user models.User
	if err := database.DB.First(&user, userIDUint).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if user.Role != "superadmin" {
		ctx.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	var transactions []models.Transaction
	if err := database.DB.Order("created_at DESC").Find(&transactions).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Error fetching all transactions",
			"details": err.Error(),
		})
		return
	}

	totalSales := 0.0
	totalCompanyShare := 0.0
	totalAdminShare := 0.0
	byAdmin := make(map[uint][]models.Transaction)
	for _, tx := range transactions {
		if tx.PaymentType == "purchase" || tx.PaymentType == "rent" {
			totalSales += tx.Amount
			totalCompanyShare += tx.CompanyShare
			totalAdminShare += tx.AdminShare
		}
		byAdmin[tx.AdminID] = append(byAdmin[tx.AdminID], tx)
	}

	ctx.JSON(http.StatusOK, gin.H{
		"transactions":        transactions,
		"total_sales":         totalSales,
		"total_company_share": totalCompanyShare,
		"total_admin_share":   totalAdminShare,
		"total_transactions":  len(transactions),
		"by_admin":            byAdmin,
	})
}

// GetAllSales godoc
// @Summary Get all sales
// @Description Retrieves all sales data for super admin analytics
// @Tags superadmin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/sales [get]
func GetAllSales(ctx *gin.Context) {
	var transactions []models.Transaction
	if err := database.DB.Where("status = ?", "success").Order("created_at DESC").Find(&transactions).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to fetch sales"})
		return
	}

	// Calculate analytics
	totalSales := 0.0
	totalCompanyRevenue := 0.0
	totalAdminRevenue := 0.0
	totalTransactions := len(transactions)
	salesByType := make(map[string]int)
	salesByMonth := make(map[string]float64)
	allSales := []gin.H{}

	for _, tx := range transactions {
		totalSales += tx.Amount
		totalCompanyRevenue += tx.CompanyShare
		totalAdminRevenue += tx.AdminShare
		salesByType[tx.PaymentType]++

		// Group by month
		monthKey := tx.CreatedAt.Format("2006-01")
		salesByMonth[monthKey] += tx.Amount

		// Get buyer, seller, and bot info
		var buyer, seller models.User
		var bot models.Bot

		database.DB.Select("id, name, email").First(&buyer, tx.UserID)

		// Get seller (bot owner)
		if err := database.DB.Select("id, name, owner_id").First(&bot, tx.BotID).Error; err == nil {
			database.DB.Select("id, name, email").First(&seller, bot.OwnerID)
		}

		allSales = append(allSales, gin.H{
			"id":             tx.ID,
			"transaction_id": tx.Reference,
			"amount":         tx.Amount,
			"company_share":  tx.CompanyShare,
			"admin_share":    tx.AdminShare,
			"sale_type":      tx.PaymentType,
			"sale_date":      tx.CreatedAt,
			"buyer": gin.H{
				"id":    buyer.ID,
				"name":  buyer.Name,
				"email": buyer.Email,
			},
			"seller": gin.H{
				"id":    seller.ID,
				"name":  seller.Name,
				"email": seller.Email,
			},
			"bot": gin.H{
				"id":   bot.ID,
				"name": bot.Name,
			},
		})
	}

	ctx.JSON(http.StatusOK, gin.H{
		"sales": allSales,
		"analytics": gin.H{
			"total_sales":        totalSales,
			"company_revenue":    totalCompanyRevenue,
			"admin_revenue":      totalAdminRevenue,
			"total_transactions": totalTransactions,
			"sales_by_type":      salesByType,
			"sales_by_month":     salesByMonth,
			"recent_sales":       allSales[:minInt(10, len(allSales))],
		},
	})
}

func minInt(a, b int) int {
	if a < b {
		return a
	}
	return b
}

// GetPlatformPerformance godoc
// @Summary Get platform performance metrics
// @Description Retrieves comprehensive platform performance analytics
// @Tags superadmin
// @Produce json
// @Security ApiKeyAuth
// @Success 200 {object} map[string]interface{}
// @Failure 500 {object} map[string]string
// @Router /api/superadmin/performance [get]
func GetPlatformPerformance(ctx *gin.Context) {
	// Get user metrics
	var totalUsers, activeUsers int64
	database.DB.Model(&models.User{}).Count(&totalUsers)
	database.DB.Model(&models.User{}).Where("updated_at > ?", time.Now().AddDate(0, 0, -30)).Count(&activeUsers)

	// Get bot metrics
	var totalBots, activeBots int64
	database.DB.Model(&models.Bot{}).Count(&totalBots)
	database.DB.Model(&models.Bot{}).Where("status = ?", "active").Count(&activeBots)

	// Get transaction metrics
	var transactions []models.Transaction
	database.DB.Where("status = ?", "success").Find(&transactions)

	totalRevenue := 0.0
	totalCompanyRevenue := 0.0
	monthlyRevenue := make(map[string]float64)
	revenueByPaymentType := make(map[string]float64)

	for _, tx := range transactions {
		totalRevenue += tx.Amount
		totalCompanyRevenue += tx.CompanyShare

		monthKey := tx.CreatedAt.Format("2006-01")
		monthlyRevenue[monthKey] += tx.Amount
		revenueByPaymentType[tx.PaymentType] += tx.Amount
	}

	// Get top performing bots
	var topBots []struct {
		BotID      uint
		BotName    string
		TotalSales float64
		SalesCount int64
	}

	database.DB.Table("transactions").
		Select("bot_id, COUNT(*) as sales_count, SUM(amount) as total_sales").
		Joins("JOIN bots ON transactions.bot_id = bots.id").
		Where("transactions.status = ?", "success").
		Group("bot_id").
		Order("total_sales DESC").
		Limit(10).
		Scan(&topBots)

	// Add bot names
	for i := range topBots {
		var bot models.Bot
		if err := database.DB.Select("name").First(&bot, topBots[i].BotID).Error; err == nil {
			topBots[i].BotName = bot.Name
		}
	}

	// Get top admins by revenue
	var topAdmins []struct {
		AdminID          uint
		AdminName        string
		TotalRevenue     float64
		TransactionCount int64
	}

	database.DB.Table("transactions").
		Select("admin_id, COUNT(*) as transaction_count, SUM(admin_share) as total_revenue").
		Where("status = ?", "success").
		Group("admin_id").
		Order("total_revenue DESC").
		Limit(10).
		Scan(&topAdmins)

	// Add admin names
	for i := range topAdmins {
		var admin models.Admin
		var user models.User
		if err := database.DB.First(&admin, topAdmins[i].AdminID).Error; err == nil {
			if err := database.DB.Select("name").First(&user, admin.PersonID).Error; err == nil {
				topAdmins[i].AdminName = user.Name
			}
		}
	}

	// Calculate growth rates (comparing last 30 days to previous 30 days)
	last30Days := time.Now().AddDate(0, 0, -30)
	previous30Days := time.Now().AddDate(0, 0, -60)

	var recentUsers, previousUsers int64
	database.DB.Model(&models.User{}).Where("created_at > ?", last30Days).Count(&recentUsers)
	database.DB.Model(&models.User{}).Where("created_at BETWEEN ? AND ?", previous30Days, last30Days).Count(&previousUsers)

	userGrowthRate := 0.0
	if previousUsers > 0 {
		userGrowthRate = float64(recentUsers-previousUsers) / float64(previousUsers) * 100
	}

	var recentRevenue, previousRevenue float64
	database.DB.Model(&models.Transaction{}).
		Where("created_at > ? AND status = ?", last30Days, "success").
		Select("COALESCE(SUM(amount), 0)").Scan(&recentRevenue)
	database.DB.Model(&models.Transaction{}).
		Where("created_at BETWEEN ? AND ? AND status = ?", previous30Days, last30Days, "success").
		Select("COALESCE(SUM(amount), 0)").Scan(&previousRevenue)

	revenueGrowthRate := 0.0
	if previousRevenue > 0 {
		revenueGrowthRate = (recentRevenue - previousRevenue) / previousRevenue * 100
	}

	ctx.JSON(http.StatusOK, gin.H{
		"user_metrics": gin.H{
			"total_users":      totalUsers,
			"active_users":     activeUsers,
			"user_growth_rate": userGrowthRate,
		},
		"bot_metrics": gin.H{
			"total_bots":  totalBots,
			"active_bots": activeBots,
		},
		"revenue_metrics": gin.H{
			"total_revenue":       totalRevenue,
			"company_revenue":     totalCompanyRevenue,
			"revenue_growth_rate": revenueGrowthRate,
			"monthly_revenue":     monthlyRevenue,
			"revenue_by_type":     revenueByPaymentType,
		},
		"top_performers": gin.H{
			"top_bots":   topBots,
			"top_admins": topAdmins,
		},
		"transaction_count": len(transactions),
	})
}

// RecordTransaction godoc
// @Summary Record a transaction
// @Description Records a new transaction by admin or super admin
// @Tags admin
// @Accept json
// @Produce json
// @Param body body object true "Transaction details"
// @Security ApiKeyAuth
// @Success 201 {object} models.Transaction
// @Failure 400 {object} map[string]string
// @Failure 401 {object} map[string]string
// @Failure 403 {object} map[string]string
// @Failure 404 {object} map[string]string
// @Failure 500 {object} map[string]string
// @Router /api/admin/transactions [post]
func RecordTransaction(ctx *gin.Context) {
	userID, exists := ctx.Get("user_id")
	if !exists {
		ctx.JSON(http.StatusUnauthorized, gin.H{"error": "unauthorized"})
		return
	}

	userIDUint, ok := userID.(uint)
	if !ok {
		ctx.JSON(http.StatusInternalServerError, gin.H{"error": "invalid user id"})
		return
	}

	// Verify admin role
	var user models.User
	if err := database.DB.First(&user, userIDUint).Error; err != nil {
		ctx.JSON(http.StatusNotFound, gin.H{"error": "user not found"})
		return
	}

	if user.Role != "ADMIN" && user.Role != "superadmin" {
		ctx.JSON(http.StatusForbidden, gin.H{"error": "access denied"})
		return
	}

	var input struct {
		UserID         uint    `json:"user_id" binding:"required"`
		BotID          uint    `json:"bot_id" binding:"required"`
		Amount         float64 `json:"amount" binding:"required,gt=0"`
		CompanyShare   float64 `json:"company_share" binding:"gte=0"`
		AdminShare     float64 `json:"admin_share" binding:"gte=0"`
		Reference      string  `json:"reference" binding:"required"`
		Status         string  `json:"status" binding:"required,oneof=pending success failed"`
		PaymentChannel string  `json:"payment_channel" binding:"required"`
		PaymentType    string  `json:"payment_type" binding:"required,oneof=purchase rent"`
		Description    string  `json:"description"`
	}

	if err := ctx.ShouldBindJSON(&input); err != nil {
		ctx.JSON(http.StatusBadRequest, gin.H{
			"error":   "Invalid input",
			"details": err.Error(),
		})
		return
	}

	transaction := models.Transaction{
		UserID:         input.UserID,
		AdminID:        userIDUint,
		BotID:          input.BotID,
		Amount:         input.Amount,
		CompanyShare:   input.CompanyShare,
		AdminShare:     input.AdminShare,
		Reference:      input.Reference,
		Status:         input.Status,
		PaymentChannel: input.PaymentChannel,
		PaymentType:    input.PaymentType,
		Description:    input.Description,
		CreatedAt:      time.Now(),
		UpdatedAt:      time.Now(),
	}

	if err := database.DB.Create(&transaction).Error; err != nil {
		ctx.JSON(http.StatusInternalServerError, gin.H{
			"error":   "Error recording transaction",
			"details": err.Error(),
		})
		return
	}

	ctx.JSON(http.StatusCreated, transaction)
}

// SendMessage sends messages/notifications to selected users and admins
func SendMessage(c *gin.Context) {
	var req struct {
		Recipients []struct {
			ID    string `json:"id"`
			Type  string `json:"type"`
			Email string `json:"email"`
		} `json:"recipients"`
		Subject          string `json:"subject"`
		Message          string `json:"message"`
		SendEmail        bool   `json:"send_email"`
		SendNotification bool   `json:"send_notification"`
	}

	if err := c.ShouldBindJSON(&req); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request"})
		return
	}

	// Send emails if requested
	if req.SendEmail {
		for _, recipient := range req.Recipients {
			go func(email, subject, message string) {
				log.Printf("Email sent to %s: %s", email, subject)
			}(recipient.Email, req.Subject, req.Message)
		}
	}

	// Create in-app notifications if requested
	if req.SendNotification {
		for _, recipient := range req.Recipients {
			notification := models.Notification{
				UserID:  recipient.ID,
				Title:   req.Subject,
				Message: req.Message,
				Type:    "admin_message",
				Read:    false,
			}
			database.DB.Create(&notification)
		}
	}

	c.JSON(http.StatusOK, gin.H{"message": "Messages sent successfully"})
}
