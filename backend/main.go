package main

import (
	"log"
	"net/http"
	"os"
	"time"

	"storychain-backend/internal/config"
	"storychain-backend/internal/database"
	"storychain-backend/internal/handlers"
	"storychain-backend/internal/websocket"

	"github.com/gin-gonic/gin"
	"github.com/joho/godotenv"
)

var startTime = time.Now()

func main() {
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	cfg := config.Load()

	db, err := database.Connect(cfg.DatabaseURL)
	if err != nil {
		log.Fatal("Failed to connect to database:", err)
	}
	defer db.Close()

	if err := database.RunMigrations(db); err != nil {
		log.Printf("Migration error: %v", err)
	}

	hub := websocket.NewHub()
	go hub.Run()

	r := gin.Default()

	r.Use(func(c *gin.Context) {
		c.Header("Access-Control-Allow-Origin", cfg.FrontendURL)
		c.Header("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS")
		c.Header("Access-Control-Allow-Headers", "Content-Type, Authorization")
		c.Header("Access-Control-Allow-Credentials", "true")

		if c.Request.Method == "OPTIONS" {
			c.AbortWithStatus(204)
			return
		}

		c.Next()
	})

	r.GET("/status", func(c *gin.Context) {
		uptime := time.Since(startTime).Seconds()
		dbStatus := "ok"
		if err := db.PingContext(c.Request.Context()); err != nil {
			dbStatus = "error"
		}
		c.JSON(http.StatusOK, gin.H{
			"status":         "ok",
			"uptime_seconds": uptime,
			"timestamp":      time.Now().UTC().Format(time.RFC3339),
			"database":       dbStatus,
		})
	})

	api := r.Group("/api")
	handlers.SetupRoutes(api, db, hub)

	port := os.Getenv("PORT")
	if port == "" {
		port = "8080"
	}

	log.Printf("Server starting on port %s", port)
	log.Fatal(r.Run(":" + port))
}
