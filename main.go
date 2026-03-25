package main

import (
	"fmt"
	"log"
	"time"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/config"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
	"github.com/keyadaniel56/algocdk/internal/routes"
	"github.com/keyadaniel56/algocdk/tasks"
)

func main() {
	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("%v", err.Error())
	}

	database.InitDB()
	seedLegacySubscriptions()
	tasks.DeactivateExpiredBots()
	tasks.StartSubscriptionExpiryScheduler()
	r := gin.Default()
	r.SetTrustedProxies(nil)

	routes.SetUpRouter(r)

	log.Printf("Server running at http://localhost:%s", cfg.Port)
	log.Printf("For HTTPS access from other devices, use: https://YOUR_IP:%s", cfg.Port)

	if err := r.RunTLS(":"+cfg.Port, "cert.pem", "key.pem"); err != nil {
		log.Println("HTTPS failed, falling back to HTTP:", err)
		r.Run(":" + cfg.Port)
	}
}

// seedLegacySubscriptions creates subscription records for admins who were
// promoted before the subscription system existed.
func seedLegacySubscriptions() {
	var admins []models.User
	database.DB.Where("role IN ?", []string{"Admin", "admin"}).Find(&admins)

	now := time.Now()
	expiry := now.AddDate(0, 1, 0)

	for _, admin := range admins {
		var existing models.Subscription
		if database.DB.Where("user_id = ?", admin.ID).First(&existing).Error == nil {
			continue // already has a subscription record
		}
		sub := models.Subscription{
			UserID:    admin.ID,
			Plan:      "admin",
			Status:    "active",
			Reference: "LEGACY_" + fmt.Sprintf("%d", admin.ID),
			Amount:    500.0,
			StartedAt: now,
			ExpiresAt: expiry,
			CreatedAt: now,
			UpdatedAt: now,
		}
		if err := database.DB.Create(&sub).Error; err != nil {
			log.Printf("[Seed] Failed to create subscription for admin %d: %v", admin.ID, err)
		} else {
			log.Printf("[Seed] Created legacy subscription for admin %d (%s), expires %s", admin.ID, admin.Email, expiry.Format("2006-01-02"))
		}
	}
}
