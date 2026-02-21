package routes

import (
	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/handlers"
	"github.com/keyadaniel56/algocdk/internal/middleware"
	"github.com/keyadaniel56/algocdk/internal/paystack"

	swaggerFiles "github.com/swaggo/files"
	ginSwagger "github.com/swaggo/gin-swagger"

	_ "github.com/keyadaniel56/algocdk/docs" // <-- important: generated Swagger docs
)

func SetUpRouter(router *gin.Engine) {
	router.Use(middleware.CORSMiddleware())
	router.Static("/sites", "./sites")
	router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	api := router.Group("/api")
	api.GET("/marketplace", handlers.MarketplaceHandler)
	router.GET("/api/paystack/callback", paystack.HandleCallbackRedirect)
	router.SetTrustedProxies(nil)
	router.GET("/bots/:id", handlers.ServeBotHandler)
	{
		auth := api.Group("/auth")
		{
			auth.POST("/signup", handlers.SignupHandler)
			auth.POST("/login", handlers.LoginHandler)
			auth.POST("/forgot_password/", handlers.ForgotPasswordHandler)
			auth.GET("/verify-email", handlers.VerifyEmailHandler)
			auth.POST("/resend-verification", handlers.ResendVerificationHandler)
		}

		// ================= MARKET DATA =================
		market := api.Group("/market")
		{
			market.GET("/data", handlers.GetMarketData)
			market.GET("/deriv", handlers.GetDerivMarketData)
			market.GET("/chart/:symbol", handlers.GetChartData)
			market.GET("/calendar", handlers.GetEconomicCalendar)
			market.GET("/news", handlers.GetMarketNews)
		}

		// WebSocket endpoint
		router.GET("/ws/market", handlers.MarketWebSocket)

		// ================= ADMIN AUTH (PUBLIC) =================

		user := api.Group("/user")
		user.Use(middleware.AuthMiddleware())
		{
			user.GET("/profile", handlers.ProfileHandler)
			user.PUT("/profile", handlers.UpdateProfile)
			user.DELETE("/account", handlers.DeleteAccountHandler)
			user.POST("/reset-password", handlers.ResetPasswordHandler)
			user.GET("/bots", handlers.GetUserBotsHandler)
			user.POST("/trades", handlers.RecordTradeHandler)
			user.GET("/trades", handlers.GetUserTradesHandler)

			user.POST("/favorite/:bot_id", handlers.ToggleFavorite)
			user.GET("/favorite", handlers.GetUserFavorites)

			// Admin requests
			user.POST("/request-admin", handlers.RequestAdminStatus)
			user.GET("/admin-request-status", handlers.GetUserAdminRequestStatus)
		}

		// ================= SUPERADMIN AUTH (PUBLIC) =================
		superadminAuth := api.Group("/superadmin/auth")
		{
			superadminAuth.POST("/signup", handlers.SuperAdminRegisterHandler)
			superadminAuth.POST("/login", handlers.SuperAdminLoginHandler)
		}

		// ================= SUPERADMIN PROTECTED =================
		superadmin := api.Group("/superadmin")
		superadmin.Use(middleware.AuthMiddleware(), middleware.SuperAdminOnly())
		{
			superadmin.GET("/profile/:id", handlers.SuperAdminProfileHandler)
			superadmin.GET("/superadmindashboard/:id", handlers.SuperAdminDashboardHandler)

			// Users
			superadmin.POST("/create_user", handlers.CreateUser)
			superadmin.POST("/update_user/:id", handlers.UpdateUser)
			superadmin.DELETE("/delete_user/:id", handlers.DeleteUser)
			superadmin.GET("/users", handlers.GetAllUsers)
			superadmin.GET("/user/:id", handlers.GetUserByID)

			// Admins
			superadmin.POST("/create_admin", handlers.CreateAdmin)
			superadmin.GET("/get_all_admins", handlers.GetAllAdmins)
			superadmin.GET("/toggle_admin_status", handlers.ToggleAdminStatus)
			superadmin.POST("/update_admin/:id", handlers.UpdateAdmin)
			superadmin.DELETE("/delete_admin", handlers.DeleteAdmin)
			superadmin.POST("/update_admin_password", handlers.UpdateAdminPassword)

			// Bots
			superadmin.GET("/bots", handlers.GetBotsHandler)
			superadmin.GET("/scan_bots", handlers.ScanAllBotsHandler)

			// Sales and Performance Analytics
			superadmin.GET("/sales", handlers.GetAllSales)
			superadmin.GET("/performance", handlers.GetPlatformPerformance)
			superadmin.GET("/transactions", handlers.GetAllTransactions)

			// Admin Requests Management
			superadmin.GET("/admin-requests", handlers.GetPendingAdminRequests)
			superadmin.GET("/admin-requests/all", handlers.GetAllAdminRequests)
			superadmin.POST("/admin-requests/:id/review", handlers.ReviewAdminRequest)
		}

		admin := api.Group("/admin")
		admin.Use(middleware.AuthMiddleware(), middleware.AdminOnly())
		{
			admin.GET("/dashboard", handlers.AdminDashboardHandler)
			admin.POST("/create-bot", handlers.CreateBotHandler)
			admin.PUT("/update-bot/:id", handlers.UpdateBotHandler)
			admin.DELETE("/delete-bot/:id", handlers.DeleteBotHandler)
			admin.GET("/bots", handlers.ListAdminBotsHandler)
			admin.GET("/profile", handlers.AdminProfileHandler)
			admin.PUT("/bank-details", handlers.UpdateAdminBankDetails)
			admin.GET("/transactions", handlers.GetAdminTransactions)
			admin.POST("/transactions", handlers.RecordTransaction)
			admin.GET("/bots/:id/users", handlers.BotUsersHandler)
			admin.DELETE("/bots/:bot_id/users/:user_id", handlers.RemoveUserFromBotHandler)
			admin.POST("/reset_password/:id", handlers.ResetPasswordHandler)

			// Sites Management
			admin.POST("/create-site", handlers.CreateSiteHandler)
			admin.GET("/sites", handlers.GetAdminSitesHandler)
			admin.PUT("/update-site/:id", handlers.UpdateSiteHandler)
			admin.DELETE("/delete-site/:id", handlers.DeleteSiteHandler)
			admin.GET("/sites/:id/members", handlers.GetSiteMembersHandler)
			admin.POST("/sites/:id/members", handlers.AddSiteMemberHandler)
			admin.DELETE("/sites/:site_id/members/:user_id", handlers.RemoveSiteMemberHandler)

			// Screen Sharing
			admin.POST("/screenshare/start", handlers.StartScreenShareSession)
			admin.POST("/screenshare/stop/:id", handlers.StopScreenShareSession)
			admin.GET("/screenshare/participants/:id", handlers.GetSessionParticipants)
		}

		paystackGroup := api.Group("/payment")
		{
			paystackGroup.Use(middleware.AuthMiddleware())
			{
				paystackGroup.POST("/initialize", paystack.InitializePayment)
				paystackGroup.GET("/verify", paystack.VerifyPayment)
				paystackGroup.POST("/callback", paystack.FrontendCallback)
				paystackGroup.POST("update-transaction", paystack.UpdateTransaction)
			}
			paystackGroup.POST("/webhook", paystack.PaystackCallback)
		}

		// ============================================
		// DERIV BROKER INTEGRATION
		// ============================================

		// Public Deriv endpoints - no auth required
		derivGroup := api.Group("/deriv")
		{
			derivGroup.POST("/auth", handlers.AuthenticateDeriv)
			derivGroup.POST("/user/info", handlers.GetDerivUserInfo)
			derivGroup.POST("/user/balance", handlers.GetDerivBalance)
			derivGroup.POST("/accounts/list", handlers.GetDerivAccountList)
			derivGroup.POST("/accounts/switch", handlers.SwitchDerivAccount)
		}

		// Protected Deriv endpoints - requires authentication
		derivProtected := api.Group("/deriv")
		derivProtected.Use(middleware.AuthMiddleware())
		{
			// Account details & validation
			derivProtected.GET("/account/details", handlers.GetDerivAccountDetails)
			derivProtected.POST("/validate", handlers.ValidateDerivToken)

			// Token management
			derivProtected.POST("/token/save", handlers.SaveDerivToken)
			derivProtected.GET("/token", handlers.GetUserDerivToken)
			derivProtected.DELETE("/token", handlers.DeleteDerivToken)

			// Account preference
			derivProtected.PUT("/account/preference", handlers.UpdateDerivAccountPreference)

			// Use stored token (no need to send token in request)
			derivProtected.GET("/me/info", handlers.GetDerivUserInfoWithStoredToken)
			derivProtected.GET("/me/balance", handlers.GetDerivBalanceWithStoredToken)
			derivProtected.GET("/me/accounts", handlers.GetDerivAccountListWithStoredToken)
			derivProtected.POST("/me/switch", handlers.SwitchDerivAccountWithStoredToken)
			derivProtected.POST("/trade", handlers.PlaceDerivTrade)
		}

		// Screen Sharing (requires auth)
		screenShare := api.Group("/screenshare")
		screenShare.Use(middleware.AuthMiddleware())
		{
			screenShare.GET("/sessions", handlers.GetActiveSessions)
			screenShare.GET("/messages/:id", handlers.GetSessionMessages)
			screenShare.POST("/join/:id", handlers.RequestJoinSession)
			screenShare.GET("/requests/:id", handlers.GetJoinRequests)
			screenShare.POST("/requests/:request_id/review", handlers.ReviewJoinRequest)
		}

		// WebSocket for screen sharing
		router.GET("/ws/screenshare", middleware.AuthMiddleware(), handlers.ScreenShareWebSocket)
	}

	// Frontend path
	frontendPath := "./frontend"

	// Serve assets and JavaScript files
	router.Static("/assets", frontendPath)
	router.Static("/js", frontendPath)
	router.Static("/images", frontendPath+"/images")
	router.StaticFile("/api.js", frontendPath+"/api.js")
	router.StaticFile("/auth.js", frontendPath+"/auth.js")
	router.StaticFile("/dashboard.js", frontendPath+"/dashboard.js")
	router.StaticFile("/notifications.js", frontendPath+"/notifications.js")
	router.StaticFile("/trading.js", frontendPath+"/trading.js")
	router.StaticFile("/app.js", frontendPath+"/app.js")
	router.StaticFile("/superadmin-dashboard.js", frontendPath+"/superadmin-dashboard.js")
	router.StaticFile("/admin-dashboard.js", frontendPath+"/admin-dashboard.js")
	router.StaticFile("/output.css", frontendPath+"/output.css")
	router.StaticFile("/theme.css", frontendPath+"/theme.css")
	router.StaticFile("/theme-toggle.js", frontendPath+"/theme-toggle.js")
	router.StaticFile("/theme-enhanced.css", frontendPath+"/theme-enhanced.css")

	// Serve HTML files manually
	router.GET("/", func(c *gin.Context) {
		c.File(frontendPath + "/index.html")
	})
	router.GET("/auth", func(c *gin.Context) {
		c.File(frontendPath + "/auth.html")
	})
	router.GET("/verify-email", func(c *gin.Context) {
		c.File(frontendPath + "/verify-email.html")
	})
	router.GET("/verify-success", func(c *gin.Context) {
		c.File(frontendPath + "/verify-success.html")
	})
	router.GET("/settings", func(c *gin.Context) {
		c.File(frontendPath + "/settings.html")
	})
	router.GET("/profile", func(c *gin.Context) {
		c.File(frontendPath + "/userprofile.html")
	})
	router.GET("/superadmin-signup", func(c *gin.Context) {
		c.File(frontendPath + "/superadmin-signup.html")
	})
	router.GET("/superadmin", func(c *gin.Context) {
		c.File(frontendPath + "/superadmin_dashboard.html")
	})
	router.GET("/app", func(c *gin.Context) {
		c.File(frontendPath + "/app.html")
	})
	router.GET("/mybots", func(c *gin.Context) {
		c.File(frontendPath + "/mybots.html")
	})
	router.GET("/botstore", func(c *gin.Context) {
		c.File(frontendPath + "/botstore.html")
	})
	router.GET("/support", func(c *gin.Context) {
		c.File(frontendPath + "/support.html")
	})
	router.GET("/privacy", func(c *gin.Context) {
		c.File(frontendPath + "/privacy.html")
	})
	router.GET("/terms", func(c *gin.Context) {
		c.File(frontendPath + "/terms.html")
	})
	router.GET("/marketchart", func(c *gin.Context) {
		c.File(frontendPath + "/marketchart.html")
	})
	router.GET("/trading", func(c *gin.Context) {
		c.File(frontendPath + "/trading.html")
	})
	router.GET("/digits", func(c *gin.Context) {
		c.File(frontendPath + "/digits.html")
	})
	router.GET("/updown", func(c *gin.Context) {
		c.File(frontendPath + "/updown.html")
	})
	router.GET("/barriers", func(c *gin.Context) {
		c.File(frontendPath + "/barriers.html")
	})
	router.GET("/multipliers", func(c *gin.Context) {
		c.File(frontendPath + "/multipliers.html")
	})
	router.GET("/accumulators", func(c *gin.Context) {
		c.File(frontendPath + "/accumulators.html")
	})
	router.GET("/options", func(c *gin.Context) {
		c.File(frontendPath + "/options.html")
	})
	router.GET("/admin", func(c *gin.Context) {
		c.File(frontendPath + "/admin_dashboard.html")
	})
	router.GET("/sites", func(c *gin.Context) {
		c.File(frontendPath + "/sites.html")
	})
	router.GET("/global.html", func(c *gin.Context) {
		c.File(frontendPath + "/global.html")
	})
	router.GET("/screenshare-admin", func(c *gin.Context) {
		c.File(frontendPath + "/screenshare-admin.html")
	})
	router.GET("/screenshare-viewer", func(c *gin.Context) {
		c.File(frontendPath + "/screenshare-viewer.html")
	})
	router.StaticFile("/screenshare-admin.js", frontendPath+"/screenshare-admin.js")
	router.StaticFile("/screenshare-viewer.js", frontendPath+"/screenshare-viewer.js")

	// Site viewer route
	router.GET("/site/:slug", handlers.ViewSiteHandler)
	// SPA fallback
	// router.NoRoute(func(c *gin.Context) {
	// 	c.File(frontendPath + "/index.html")
	// })
}
