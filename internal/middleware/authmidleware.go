package middleware

import (
	"fmt"
	"net/http"
	"os"
	"strings"

	"github.com/gin-gonic/gin"
	"github.com/golang-jwt/jwt/v5"
)

func AuthMiddleware() gin.HandlerFunc {
	return func(ctx *gin.Context) {
		tokenString := ctx.GetHeader("Authorization")

		// Fall back to query param only for WebSocket connections
		if tokenString == "" {
			tokenString = ctx.Query("token")
		}

		// Fall back to cookie (set on login, used for browser navigation)
		if tokenString == "" {
			if cookie, err := ctx.Cookie("auth_token"); err == nil {
				tokenString = cookie
			}
		}

		if tokenString == "" {
			// If it's a browser navigation (accepts HTML), redirect to login
			if strings.Contains(ctx.GetHeader("Accept"), "text/html") {
				ctx.Redirect(http.StatusFound, "/auth")
				ctx.Abort()
				return
			}
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "missing token"})
			ctx.Abort()
			return
		}

		tokenString = strings.TrimSpace(tokenString)
		if strings.HasPrefix(strings.ToLower(tokenString), "bearer ") {
			tokenString = strings.TrimSpace(tokenString[7:])
		}

		// Enforce HS256 to prevent alg:none and algorithm confusion attacks
		token, err := jwt.Parse(tokenString, func(token *jwt.Token) (interface{}, error) {
			if _, ok := token.Method.(*jwt.SigningMethodHMAC); !ok {
				return nil, fmt.Errorf("unexpected signing method: %v", token.Header["alg"])
			}
			return []byte(os.Getenv("JWT_SECRET")), nil
		})
		if err != nil || !token.Valid {
			ctx.JSON(http.StatusUnauthorized, gin.H{"error": "invalid or expired token"})
			ctx.Abort()
			return
		}

		claims := token.Claims.(jwt.MapClaims)
		ctx.Set("user_id", uint(claims["user_id"].(float64)))
		ctx.Set("email", claims["email"].(string))
		if role, ok := claims["role"].(string); ok {
			ctx.Set("role", role)
		}

		ctx.Next()
	}
}
