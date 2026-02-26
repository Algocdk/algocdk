package middleware

import (
	"github.com/gin-gonic/gin"
	"github.com/keyadaniel56/algocdk/internal/database"
)

func DBMiddleware() gin.HandlerFunc {
	return func(c *gin.Context) {
		c.Set("db", database.DB)
		c.Next()
	}
}
