package routes

import (
	"net/http"

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
	router.Use(middleware.DBMiddleware()) // Add DB to context

	// Helper: serve an HTML file with no-cache headers so the SW never serves stale pages
	serveHTML := func(path string) gin.HandlerFunc {
		return func(c *gin.Context) {
			c.Header("Cache-Control", "no-cache, no-store, must-revalidate")
			c.Header("Pragma", "no-cache")
			c.Header("Expires", "0")
			c.File(path)
		}
	}
	fp := "./frontend" // shorthand used below
	// NOTE: /sites is NOT served statically - all access goes through ViewSiteHandler
	router.GET("/swagger/*any", ginSwagger.WrapHandler(swaggerFiles.Handler))
	api := router.Group("/api")
	api.GET("/marketplace", handlers.MarketplaceHandler)
	router.GET("/api/paystack/callback", paystack.HandleCallbackRedirect)
	router.SetTrustedProxies(nil)
	router.GET("/bots/:id", middleware.AuthMiddleware(), handlers.ServeBotHandler)
	{
		auth := api.Group("/auth")
		{
			auth.POST("/signup", handlers.SignupHandler)
			auth.POST("/login", handlers.LoginHandler)
			auth.POST("/refresh", handlers.RefreshTokenHandler)
			auth.POST("/forgot_password/", handlers.ForgotPasswordHandler)
			auth.GET("/verify-email", handlers.VerifyEmailHandler)
			auth.POST("/resend-verification", handlers.ResendVerificationHandler)
			auth.POST("/reset-password", handlers.ResetPasswordHandler)
			// sets auth_token cookie from token in request body so server-side guards work
			auth.POST("/set-cookie", func(c *gin.Context) {
				var body struct {
					Token string `json:"token"`
				}
				if err := c.ShouldBindJSON(&body); err != nil || body.Token == "" {
					c.JSON(400, gin.H{"error": "token required"})
					return
				}
				c.SetCookie("auth_token", body.Token, 86400*7, "/", "", false, false)
				c.JSON(200, gin.H{"ok": true})
			})
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
			user.GET("/notifications", handlers.GetNotifications)
			user.PUT("/notifications/:id/read", handlers.MarkNotificationRead)
			user.DELETE("/account", handlers.DeleteAccountHandler)
			user.POST("/reset-password", handlers.ResetPasswordHandler)
			user.GET("/bots", handlers.GetUserBotsHandler)
			user.POST("/trades", handlers.RecordTradeHandler)
			user.GET("/trades", handlers.GetUserTradesHandler)

			user.POST("/favorite/:bot_id", handlers.ToggleFavorite)
			user.POST("/favorite/indicator/:indicator_id", handlers.ToggleFavoriteIndicator)
			user.GET("/favorite", handlers.GetUserFavorites)

			// Chart Indicators
			user.GET("/indicators", handlers.GetUserIndicators)
			user.POST("/indicators/:id/add", handlers.AddIndicatorToUser)
			user.POST("/indicators/custom", handlers.CreateUserIndicator)
			user.PUT("/indicators/custom/:id", handlers.UpdateUserIndicator)
			user.DELETE("/indicators/custom/:id", handlers.DeleteUserIndicator)
			user.GET("/indicators/custom", handlers.GetUserCustomIndicators)

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
			superadmin.POST("/send-message", handlers.SendMessage)
			superadmin.GET("/subscribers", handlers.GetAllSubscribers)
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

			// Chart Indicators Management
			admin.GET("/indicators", handlers.GetChartIndicators)
			admin.POST("/indicators", handlers.CreateChartIndicator)
			admin.PUT("/indicators/:id", handlers.UpdateChartIndicator)
			admin.DELETE("/indicators/:id", handlers.DeleteChartIndicator)

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

			// Copy Trading (Admin as provider)
			admin.POST("/copy-trading/enable", handlers.EnableCopyTrading)
			admin.POST("/copy-trading/disable", handlers.DisableCopyTrading)
			admin.GET("/copy-trading/stats", handlers.GetProviderStats)
			admin.GET("/copy-trading/copiers", handlers.GetProviderCopiers)
			admin.GET("/copy-trading/trades", handlers.GetProviderTrades)
		}

		// Copy Trading (Public + User)
		copyTrading := api.Group("/copy-trading")
		{
			copyTrading.GET("/providers", handlers.ListCopyTradingProviders)
			copyTrading.GET("/providers/:id", handlers.GetProviderByID)
			copyTrading.Use(middleware.AuthMiddleware())
			{
				copyTrading.POST("/subscribe/:provider_id", handlers.StartCopying)
				copyTrading.DELETE("/subscribe/:provider_id", handlers.StopCopying)
				copyTrading.GET("/my-subscriptions", handlers.GetMySubscriptions)
				copyTrading.GET("/my-trades", handlers.GetMyCopiedTrades)
				copyTrading.POST("/record-trade", handlers.RecordCopyTrade)
			}
		}

		// Public Sites
		api.GET("/sites/public", handlers.GetPublicSitesHandler)

		// Chart Indicators (Public & User)
		indicators := api.Group("/indicators")
		{
			indicators.GET("", handlers.GetChartIndicators) // Public marketplace
			indicators.Use(middleware.AuthMiddleware())
			{
				indicators.GET("/my", handlers.GetUserIndicators)
				indicators.POST("/:id/add", handlers.AddIndicatorToUser)
			}
		}

		// ================= SUBSCRIPTION =================
		subGroup := api.Group("/subscription")
		subGroup.Use(middleware.AuthMiddleware())
		{
			subGroup.GET("/status", handlers.GetSubscriptionStatus)
			subGroup.POST("/initialize", handlers.InitializeSubscriptionPayment)
			subGroup.POST("/cancel", handlers.CancelSubscription)
			// History only needs auth — not AdminOnly — so expired admins can still view and renew
			subGroup.GET("/history", handlers.GetAdminSubscriptionHistory)
		}
		// verify is public - Paystack redirects here without JWT
		api.GET("/subscription/verify", handlers.VerifySubscriptionPayment)

		paystackGroup := api.Group("/payment")
		paystackGroup.Use(middleware.AuthMiddleware())
		{
			paystackGroup.POST("/initialize", paystack.InitializePayment)
			paystackGroup.GET("/verify", paystack.VerifyPayment)
			paystackGroup.POST("/callback", paystack.FrontendCallback)
			paystackGroup.POST("/update-transaction", paystack.UpdateTransaction)
		}
		paystackGroup.POST("/webhook", paystack.PaystackCallback)

		// ============================================
		// DERIV OAUTH INTEGRATION
		// ============================================

		derivOAuth := api.Group("/deriv/oauth")
		derivOAuth.Use(middleware.AuthMiddleware())
		{
			derivOAuth.GET("/initiate", handlers.InitiateDerivOAuth)
			derivOAuth.POST("/callback", handlers.HandleDerivOAuthCallback)
			derivOAuth.GET("/accounts", handlers.GetLinkedDerivAccounts)
			derivOAuth.DELETE("/accounts/:account_id", handlers.UnlinkDerivAccount)
		}

		// ============================================
		// DERIV BROKER INTEGRATION (Legacy - Token Based)
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

		// ============================================
		// DERIV TRADING WITH OAUTH
		// ============================================
		derivTrading := api.Group("/deriv/trading")
		derivTrading.Use(middleware.AuthMiddleware())
		{
			derivTrading.POST("/place", handlers.PlaceDerivTrade)
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
	// Serve uploads directory for user-uploaded images
	router.Static("/uploads", "./uploads")
	router.StaticFile("/api.js", frontendPath+"/api.js")
	router.StaticFile("/auth.js", frontendPath+"/auth.js")
	router.StaticFile("/token-refresh-manager.js", frontendPath+"/token-refresh-manager.js")
	router.StaticFile("/offline-detector.js", frontendPath+"/offline-detector.js")
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
	router.StaticFile("/favicon.ico", frontendPath+"/favicon.svg")
	router.StaticFile("/favicon.svg", frontendPath+"/favicon.svg")

	// Serve HTML files — all with no-cache headers so the SW never serves stale pages
	router.GET("/", serveHTML(fp+"/index.html"))
	router.GET("/auth", serveHTML(fp+"/auth.html"))
	router.GET("/verify-email", serveHTML(fp+"/verify-email.html"))
	router.GET("/reset-password", serveHTML(fp+"/reset-password.html"))
	router.GET("/verify-success", serveHTML(fp+"/verify-success.html"))
	router.GET("/settings", serveHTML(fp+"/settings.html"))
	router.GET("/profile", serveHTML(fp+"/userprofile.html"))
	router.GET("/notifications", serveHTML(fp+"/notifications.html"))
	router.GET("/superadmin-signup", serveHTML(fp+"/superadmin-signup.html"))
	router.GET("/unauthorized", serveHTML(fp+"/unauthorized.html"))
	router.GET("/superadmin", middleware.PageGuardSuperAdmin(), serveHTML(fp+"/superadmin_dashboard.html"))
	router.GET("/app", serveHTML(fp+"/app.html"))
	router.GET("/mybots", serveHTML(fp+"/mybots.html"))
	router.GET("/my-indicators", serveHTML(fp+"/my-indicators.html"))
	router.GET("/botstore", serveHTML(fp+"/botstore.html"))
	router.GET("/support", serveHTML(fp+"/support.html"))
	router.GET("/privacy", serveHTML(fp+"/privacy.html"))
	router.GET("/terms", serveHTML(fp+"/terms.html"))
	router.GET("/marketchart", serveHTML(fp+"/marketchart.html"))
	router.GET("/trading", serveHTML(fp+"/trading.html"))
	router.GET("/digits", serveHTML(fp+"/digits.html"))
	router.GET("/updown", serveHTML(fp+"/updown.html"))
	router.GET("/barriers", serveHTML(fp+"/barriers.html"))
	router.GET("/copy-trading", serveHTML(fp+"/copy-trading.html"))
	router.GET("/multipliers", serveHTML(fp+"/multipliers.html"))
	router.GET("/accumulators", serveHTML(fp+"/accumulators.html"))
	router.GET("/options", serveHTML(fp+"/options.html"))
	router.GET("/admin", middleware.PageGuardAdmin(), serveHTML(fp+"/admin_dashboard.html"))
	router.GET("/sites", serveHTML(fp+"/sites.html"))
	router.GET("/global.html", serveHTML(fp+"/global.html"))
	router.GET("/indicator-template", serveHTML(fp+"/indicator-template.html"))
	router.GET("/screenshare-admin", serveHTML(fp+"/screenshare-admin.html"))
	router.GET("/screenshare-viewer", serveHTML(fp+"/screenshare-viewer.html"))
	router.GET("/public-sites", serveHTML(fp+"/public-sites.html"))

	// Alias .html paths so the service worker cache entries don't 404
	router.GET("/index.html", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/")
	})
	router.GET("/app.html", func(c *gin.Context) {
		c.Redirect(http.StatusMovedPermanently, "/app")
	})

	// Site files - serve static sites from ./sites directory
	router.Static("/sites", "./sites")

	// Site viewer route (must be after static to handle direct file access)
	router.GET("/site/:slug", handlers.ViewSiteHandler)
	router.GET("/deriv-oauth", serveHTML(fp+"/deriv-oauth.html"))
	router.GET("/deriv-connect", serveHTML(fp+"/deriv-connect.html"))
	router.GET("/deriv/callback", serveHTML(fp+"/deriv-connect.html"))
	router.GET("/test-balance", serveHTML(fp+"/test-balance.html"))
	router.StaticFile("/screenshare-admin.js", frontendPath+"/screenshare-admin.js")
	router.StaticFile("/screenshare-viewer.js", frontendPath+"/screenshare-viewer.js")
	router.StaticFile("/admin-indicators.html", frontendPath+"/admin-indicators.html")
	router.StaticFile("/custom_strategy_template.js", frontendPath+"/custom_strategy_template.js")
	router.StaticFile("/indicator-loader.js", frontendPath+"/indicator-loader.js")
	router.StaticFile("/indicator-renderer.js", frontendPath+"/indicator-renderer.js")
	router.StaticFile("/marketchart-functions.js", frontendPath+"/marketchart-functions.js")

	// PWA Files
	router.StaticFile("/manifest.json", frontendPath+"/manifest.json")
	router.StaticFile("/pwa-manager.js", frontendPath+"/pwa-manager.js")
	router.StaticFile("/premium-effects.js", frontendPath+"/premium-effects.js")
	router.StaticFile("/premium-theme.css", frontendPath+"/premium-theme.css")
	router.StaticFile("/sw.js", frontendPath+"/sw.js")
	router.StaticFile("/offline.html", frontendPath+"/offline.html")
	router.Static("/icons", frontendPath+"/icons")

	// SPA fallback
	// router.NoRoute(func(c *gin.Context) {
	// 	c.File(frontendPath + "/index.html")
	// })
}
