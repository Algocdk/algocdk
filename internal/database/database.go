package database

import (
	"fmt"
	"log"
	"os"

	"github.com/keyadaniel56/algocdk/internal/models"
	"gorm.io/driver/postgres"
	"gorm.io/driver/sqlite"
	"gorm.io/gorm"
)

var DB *gorm.DB

func InitDB() {
	var err error

	if dsn := os.Getenv("DATABASE_URL"); dsn != "" {
		DB, err = gorm.Open(postgres.Open(dsn), &gorm.Config{})
	} else {
		dbPath := os.Getenv("DB_PATH")
		if dbPath == "" {
			dbPath = "app.db"
		}
		DB, err = gorm.Open(sqlite.Open(dbPath), &gorm.Config{})
	}
	if err != nil {
		log.Fatalf("%v", err.Error())
	}
	DB.AutoMigrate(
		&models.User{},
		&models.Bot{},
		&models.Favorite{},
		&models.BotUser{},
		&models.Admin{},
		&models.AdminRequest{},
		&models.Site{},
		&models.SiteUser{},
		&models.Transaction{},
		&models.SalesHistory{},
		&models.UserBot{},
		&models.Sale{},
		&models.DerivCredentials{},
		&models.DerivOAuthSession{},
		&models.SuperAdmin{},
		&models.ScreenShareSession{},
		&models.Notification{},
		&models.ScreenShareParticipant{},
		&models.ScreenShareMessage{},
		&models.ScreenShareJoinRequest{},
		&models.ChartIndicator{},
		&models.UserIndicator{},
		&models.Subscription{},
	)
	fmt.Println("database connected")
}
