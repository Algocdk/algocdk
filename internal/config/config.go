package config

import (
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
)

type Config struct {
	DBHost     string
	DBPort     string
	DBUser     string
	DBPassword string
	DBName     string
	Port       string
	JWT_SECRET string
	BASE_URL   string
}

func Load() (*Config, error) {
	// try root .env first, then internal/.env
	if err := godotenv.Load(); err != nil {
		if err2 := godotenv.Load("internal/.env"); err2 != nil {
			log.Println("Warning: no .env file found, using environment variables")
		}
	}

	config := &Config{
		DBHost:     os.Getenv("DB_HOST"),
		DBPort:     os.Getenv("DB_PORT"),
		DBUser:     os.Getenv("DB_USER"),
		DBPassword: os.Getenv("DB_PASSWORD"),
		DBName:     os.Getenv("DB_NAME"),
		Port:       os.Getenv("PORT"),
		JWT_SECRET: os.Getenv("JWT_SECRET"),
	}

	// Set defaults if not provided
	if config.Port == "" {
		config.Port = "3000"
	}
	if config.DBPort == "" {
		config.DBPort = "5433"
	}

	return config, nil
}

// GetDSN returns the PostgreSQL connection string
func (c *Config) GetDSN() string {
	return fmt.Sprintf("postgres://%s:%s@%s:%s/%s",
		c.DBUser,
		c.DBPassword,
		c.DBHost,
		c.DBPort,
		c.DBName)
}
