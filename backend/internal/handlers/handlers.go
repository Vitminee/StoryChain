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

	// Create a fallback document if database fails
	fallbackDoc := models.Document{
		ID:        documentID,
		Content:   "# Welcome to StoryChain\n\nThis is a collaborative text editor where you can edit text in real-time with other users.\n\n## How it works\n- Click on any word to edit it\n- Click between words or at the end to add new text\n- You get a 10-second cooldown after each edit\n- Changes are saved automatically and synced with all users\n\n## Features\n- **Real-time collaboration**: See changes from other users instantly\n- **Markdown support**: Use markdown syntax for formatting\n- **Change history**: Track all edits in the sidebar\n- **User presence**: See who's online and editing\n\nStart editing by clicking on any word above!",
		CreatedAt: time.Now(),
		UpdatedAt: time.Now(),
	}

	// Try to get document from database
	var doc models.Document
	var idStr, contentStr, createdStr, updatedStr sql.NullString
	
	err = h.db.QueryRow("SELECT id::text, COALESCE(content, ''), created_at::text, updated_at::text FROM documents WHERE id = $1", documentID).Scan(&idStr, &contentStr, &createdStr, &updatedStr)
	
	if err == sql.ErrNoRows {
		// Document doesn't exist, create it
		_, err = h.db.Exec(
			"INSERT INTO documents (id, content, created_at, updated_at) VALUES ($1, $2, $3, $4)",
			fallbackDoc.ID, fallbackDoc.Content, fallbackDoc.CreatedAt, fallbackDoc.UpdatedAt,
		)
		if err != nil {
			log.Printf("Failed to create document: %v", err)
			// Return fallback document even if insert fails
		}
		c.JSON(http.StatusOK, fallbackDoc)
		return
	} else if err != nil {
		log.Printf("Failed to retrieve document: %v", err)
		// Return fallback document if query fails
		c.JSON(http.StatusOK, fallbackDoc)
		return
	}

	// Parse the retrieved data
	doc.ID = documentID
	doc.Content = contentStr.String
	if doc.Content == "" {
		doc.Content = fallbackDoc.Content
	}
	doc.CreatedAt, _ = time.Parse(time.RFC3339, createdStr.String)
	doc.UpdatedAt, _ = time.Parse(time.RFC3339, updatedStr.String)

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

	// First, get the current document content
	var currentContent string
	err = h.db.QueryRow("SELECT COALESCE(content, '') FROM documents WHERE id = $1", documentID).Scan(&currentContent)
	if err != nil {
		log.Printf("Failed to get current document content: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get document content"})
		return
	}
	log.Printf("Current document content length: %d", len(currentContent))
	log.Printf("Change details - Type: %s, Position: %d, Length: %d, Content: %q", 
		change.ChangeType, change.Position, change.Length, change.Content)

	// Calculate the new document content based on the change
	var newDocumentContent string
	switch change.ChangeType {
	case "insert":
		beforeText := ""
		afterText := ""
		if change.Position <= len(currentContent) {
			beforeText = currentContent[:change.Position]
			afterText = currentContent[change.Position:]
		} else {
			beforeText = currentContent
		}
		newDocumentContent = beforeText + change.Content + afterText
	case "delete":
		beforeText := ""
		afterText := ""
		if change.Position < len(currentContent) {
			beforeText = currentContent[:change.Position]
			endPos := change.Position + change.Length
			if endPos <= len(currentContent) {
				afterText = currentContent[endPos:]
			}
		} else {
			beforeText = currentContent
		}
		newDocumentContent = beforeText + afterText
	case "replace":
		beforeText := ""
		afterText := ""
		if change.Position < len(currentContent) {
			beforeText = currentContent[:change.Position]
			endPos := change.Position + change.Length
			if endPos <= len(currentContent) {
				afterText = currentContent[endPos:]
			}
		} else {
			beforeText = currentContent
		}
		newDocumentContent = beforeText + change.Content + afterText
	default:
		newDocumentContent = currentContent
	}

	// Update the document content
	log.Printf("Updating document content from length %d to length %d", len(currentContent), len(newDocumentContent))
	result, err := h.db.Exec(
		"UPDATE documents SET content = $1, updated_at = $2 WHERE id = $3",
		newDocumentContent, time.Now(), documentID,
	)
	if err != nil {
		log.Printf("Failed to update document content: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update document"})
		return
	}
	
	rowsAffected, err := result.RowsAffected()
	if err != nil {
		log.Printf("Failed to get rows affected: %v", err)
	} else {
		log.Printf("Document update affected %d rows", rowsAffected)
	}

	// Save the change to the changes table
	_, err = h.db.Exec(
		`INSERT INTO changes (id, document_id, user_id, user_name, change_type, content, position, length, timestamp)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		uuid.New(), documentID, change.UserID, change.UserName, change.ChangeType,
		change.Content, change.Position, change.Length, time.Now(),
	)

	if err != nil {
		log.Printf("Failed to save change: %v", err)
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