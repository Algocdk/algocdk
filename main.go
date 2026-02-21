package main

import (
	"log"

	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/config"
	"github.com/keyadaniel56/algocdk/internal/database"
	"github.com/keyadaniel56/algocdk/internal/routes"
	"github.com/keyadaniel56/algocdk/tasks"
)

func main() {

	cfg, err := config.Load()
	if err != nil {
		log.Fatalf("%v", err.Error())
	}

	database.InitDB()
	tasks.DeactivateExpiredBots()
	r := gin.Default()
	r.SetTrustedProxies(nil)

	routes.SetUpRouter(r)

	log.Printf("Server running at http://localhost:%s", cfg.Port)
	log.Printf("For HTTPS access from other devices, use: https://YOUR_IP:%s", cfg.Port)
	
	// Try HTTPS first, fallback to HTTP if cert files don't exist
	if err := r.RunTLS(":"+cfg.Port, "cert.pem", "key.pem"); err != nil {
		log.Println("HTTPS failed, falling back to HTTP:", err)
		r.Run(":" + cfg.Port)
	}
}
