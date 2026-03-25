package tasks

import (
	"log"
	"time"

	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/models"
)

// ExpireSubscriptions marks active subscriptions past their ExpiresAt as expired
// and downgrades the user's membership back to freemium.
func ExpireSubscriptions() {
	log.Println("[Scheduler] Checking for expired subscriptions...")

	var expired []models.Subscription
	database.DB.Where("status = ? AND expires_at IS NOT NULL AND expires_at != '' AND expires_at < ? AND plan = ?", "active", time.Now(), "admin").Find(&expired)

	if len(expired) == 0 {
		log.Println("[Scheduler] No expired subscriptions found.")
		return
	}

	for _, sub := range expired {
		database.DB.Model(&sub).Updates(map[string]interface{}{
			"status":     "expired",
			"updated_at": time.Now(),
		})
		database.DB.Model(&models.User{}).Where("id = ?", sub.UserID).Update("membership", "freemium")
		log.Printf("[Scheduler] Expired subscription ID %d (UserID: %d)\n", sub.ID, sub.UserID)
	}
}

// StartSubscriptionExpiryScheduler runs ExpireSubscriptions every hour
func StartSubscriptionExpiryScheduler() {
	go func() {
		for {
			ExpireSubscriptions()
			time.Sleep(1 * time.Hour)
		}
	}()
}
