package utils

import (
	"os"
	"time"

	"github.com/golang-jwt/jwt/v5"
)

func RefreshToken(email string) (string, error) {
	secret := os.Getenv("REFRESH_TOKEN_SECRET")
	if secret == "" {
		secret = os.Getenv("JWT_SECRET") // fallback to JWT_SECRET if not set
	}
	claims := jwt.MapClaims{
		"email": email,
		"exp":   time.Now().Add(time.Hour * 24 * 7).Unix(),
		"iat":   time.Now().Unix(),
	}
	token := jwt.NewWithClaims(jwt.SigningMethodHS256, claims)
	return token.SignedString([]byte(secret))
}
