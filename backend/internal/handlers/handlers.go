package handlers

import (
	"database/sql"
	"log"
	"net/http"
	"regexp"
	"time"

	"storychain-backend/internal/models"
	"storychain-backend/internal/websocket"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
)

type Handler struct {
	db  *sql.DB
	hub *websocket.Hub
}

func SetupRoutes(r *gin.RouterGroup, db *sql.DB, hub *websocket.Hub) {
	h := &Handler{db: db, hub: hub}

	r.GET("/ws", func(c *gin.Context) {
		websocket.HandleWebSocket(c, hub)
	})

	r.GET("/document/:id", h.getDocument)
	r.PUT("/document/:id", h.updateDocument)
	r.GET("/changes/:documentId", h.getChanges)
	r.GET("/stats", h.getStats)
}

func (h *Handler) getDocument(c *gin.Context) {
	id := c.Param("id")
	documentID, err := uuid.Parse(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid document ID"})
		return
	}

	var doc models.Document
	
	// Use explicit column selection to avoid column count issues
	query := "SELECT id, content, created_at, updated_at FROM documents WHERE id = $1"
	err = h.db.QueryRow(query, documentID).Scan(&doc.ID, &doc.Content, &doc.CreatedAt, &doc.UpdatedAt)

	if err == sql.ErrNoRows {
		doc = models.Document{
			ID:        documentID,
			Content:   "# Welcome to StoryChain\n\nClick on any word to edit it, or click between words to add new text. You have a 30-second cooldown after each edit.",
			CreatedAt: time.Now(),
			UpdatedAt: time.Now(),
		}

		_, err = h.db.Exec(
			"INSERT INTO documents (id, content, created_at, updated_at) VALUES ($1, $2, $3, $4)",
			doc.ID, doc.Content, doc.CreatedAt, doc.UpdatedAt,
		)
		if err != nil {
			log.Printf("Failed to create document: %v", err)
			c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to create document"})
			return
		}
	} else if err != nil {
		log.Printf("Failed to retrieve document: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to retrieve document"})
		return
	}

	c.JSON(http.StatusOK, doc)
}

func (h *Handler) updateDocument(c *gin.Context) {
	id := c.Param("id")
	documentID, err := uuid.Parse(id)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid document ID"})
		return
	}

	var change models.TextChange
	if err := c.ShouldBindJSON(&change); err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}

	if containsLinks(change.Content) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Links are not allowed in content"})
		return
	}

	_, err = h.db.Exec(
		`INSERT INTO changes (id, document_id, user_id, user_name, change_type, content, position, length, timestamp)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		uuid.New(), documentID, change.UserID, change.UserName, change.ChangeType,
		change.Content, change.Position, change.Length, time.Now(),
	)

	if err != nil {
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save change"})
		return
	}

	c.JSON(http.StatusOK, gin.H{"success": true})
}

func (h *Handler) getChanges(c *gin.Context) {
	documentID := c.Param("documentId")
	docID, err := uuid.Parse(documentID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid document ID"})
		return
	}

	var changes []models.Change
	
	// Check if changes table exists and has data
	var count int
	err = h.db.QueryRow("SELECT COUNT(*) FROM changes WHERE document_id = $1", docID).Scan(&count)
	if err != nil {
		log.Printf("Failed to count changes: %v", err)
		// Return empty array instead of error for better UX
		c.JSON(http.StatusOK, changes)
		return
	}

	if count > 0 {
		query := `SELECT id, document_id, user_id, user_name, change_type, content, position, length, timestamp FROM changes WHERE document_id = $1 ORDER BY timestamp DESC LIMIT 50`
		rows, err := h.db.Query(query, docID)
		if err != nil {
			log.Printf("Failed to query changes: %v", err)
			c.JSON(http.StatusOK, changes) // Return empty array instead of error
			return
		}
		defer rows.Close()

		for rows.Next() {
			var change models.Change
			err := rows.Scan(
				&change.ID, &change.DocumentID, &change.UserID, &change.UserName,
				&change.ChangeType, &change.Content, &change.Position, &change.Length, &change.Timestamp,
			)
			if err != nil {
				log.Printf("Failed to scan change: %v", err)
				continue
			}
			changes = append(changes, change)
		}
	}

	c.JSON(http.StatusOK, changes)
}

func (h *Handler) getStats(c *gin.Context) {
	var totalEdits int
	h.db.QueryRow("SELECT COUNT(*) FROM changes").Scan(&totalEdits)

	var uniqueUsers int
	h.db.QueryRow("SELECT COUNT(DISTINCT user_id) FROM changes").Scan(&uniqueUsers)

	onlineCount := h.hub.GetOnlineCount()

	stats := gin.H{
		"total_edits":   totalEdits,
		"unique_users":  uniqueUsers,
		"online_count":  onlineCount,
	}

	c.JSON(http.StatusOK, stats)
}

func containsLinks(content string) bool {
	urlRegex := `(?i)https?://[^\s<>"{}|\\^` + "`" + `\[\]]+|www\.[^\s<>"{}|\\^` + "`" + `\[\]]+|ftp://[^\s<>"{}|\\^` + "`" + `\[\]]+`
	emailRegex := `\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b`
	
	matched, _ := regexp.MatchString(urlRegex, content)
	if matched {
		return true
	}
	
	matched, _ = regexp.MatchString(emailRegex, content)
	return matched
}