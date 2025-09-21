package handlers

import (
    "bytes"
    "database/sql"
    "encoding/json"
    "fmt"
    "io"
    "log"
    "net/http"
    "regexp"
    "strings"
    "time"
    "os"

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
	
	err = h.db.QueryRow("SELECT id::text, COALESCE(content, ''), created_at::text, updated_at::text FROM documents WHERE id = $1", documentID.String()).Scan(&idStr, &contentStr, &createdStr, &updatedStr)
	
	if err == sql.ErrNoRows {
		// Document doesn't exist, create it
		_, err = h.db.Exec(
			"INSERT INTO documents (id, content, created_at, updated_at) VALUES ($1, $2, $3, $4)",
			fallbackDoc.ID.String(), fallbackDoc.Content, fallbackDoc.CreatedAt, fallbackDoc.UpdatedAt,
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
	log.Printf("PUT request received for document update")
	id := c.Param("id")
	documentID, err := uuid.Parse(id)
	if err != nil {
		log.Printf("Invalid document ID: %v", err)
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid document ID"})
		return
	}
    log.Printf("Updating document: %s", documentID.String())

	var change models.TextChange
	if err := c.ShouldBindJSON(&change); err != nil {
			c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid request body"})
		return
	}
    // Avoid logging user-provided strings; only log metrics
    // Validate change type against allowlist to reduce taint
    ct := change.ChangeType
    switch ct {
    case "insert", "delete", "replace":
        // ok
    default:
        ct = "unknown"
    }
    log.Printf("Parsed change: type=%s, content_len=%d, pos=%d", ct, len(change.Content), change.Position)

	if containsLinks(change.Content) {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Links are not allowed in content"})
		return
	}

	// First, get the current document content
	log.Printf("Getting current document content...")
	var currentContent string
	err = h.db.QueryRow("SELECT COALESCE(content, '') FROM documents WHERE id = $1", documentID.String()).Scan(&currentContent)
	if err != nil {
		log.Printf("Failed to get current document content: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to get document content"})
		return
	}
	log.Printf("Current content length: %d", len(currentContent))

    // Calculate the new document content based on the change
    originalContent := currentContent
    var newDocumentContent string
    // Prepare inverse change details for potential moderation revert
    invType := change.ChangeType
    invContent := ""
    invLength := change.Length
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
        // inverse: delete the inserted text
        invType = "delete"
        invContent = ""
        invLength = len(change.Content)
    case "delete":
        beforeText := ""
        afterText := ""
        if change.Position < len(currentContent) {
            beforeText = currentContent[:change.Position]
            endPos := change.Position + change.Length
            if endPos <= len(currentContent) {
                // capture deleted segment for potential revert
                invContent = currentContent[change.Position:endPos]
                afterText = currentContent[endPos:]
            }
        } else {
            beforeText = currentContent
        }
        newDocumentContent = beforeText + afterText
        // inverse: insert the deleted segment back
        invType = "insert"
        // invContent set above if available (empty if out of range)
        invLength = 0
    case "replace":
        beforeText := ""
        afterText := ""
        if change.Position < len(currentContent) {
            beforeText = currentContent[:change.Position]
            endPos := change.Position + change.Length
            if endPos <= len(currentContent) {
                // capture replaced segment for potential revert
                invContent = currentContent[change.Position:endPos]
                afterText = currentContent[endPos:]
            }
        } else {
            beforeText = currentContent
        }
        newDocumentContent = beforeText + change.Content + afterText
        // inverse: replace inserted content with previous segment
        invType = "replace"
        invLength = len(change.Content)
    default:
        newDocumentContent = currentContent
    }

    // Update the document content
    log.Printf("Updating document content...")
	_, err = h.db.Exec(
		"UPDATE documents SET content = $1, updated_at = $2 WHERE id = $3",
		newDocumentContent, time.Now(), documentID.String(),
	)
	if err != nil {
		log.Printf("Failed to update document content: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to update document"})
		return
	}
	log.Printf("Document content updated successfully")
	

	// Save the change to the changes table
	log.Printf("Saving change to database...")
	changeID := uuid.New()
	_, err = h.db.Exec(
		`INSERT INTO changes (id, document_id, user_id, user_name, change_type, content, position, length, timestamp)
		VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
		changeID.String(), documentID.String(), change.UserID.String(), change.UserName, change.ChangeType,
		change.Content, change.Position, change.Length, time.Now(),
	)

	if err != nil {
		log.Printf("Failed to save change: %v", err)
		c.JSON(http.StatusInternalServerError, gin.H{"error": "Failed to save change"})
		return
	}
	log.Printf("Change saved to database successfully")

    // Broadcast the change to all WebSocket clients
    log.Printf("Broadcasting change to WebSocket clients...")
    go func() {
        wsMessage := models.WebSocketMessage{
            Type: "text_change",
            Data: map[string]interface{}{
				"changeID":   changeID.String(),
				"documentId": documentID.String(),
				"userID":     change.UserID.String(),
				"userName":   change.UserName,
				"changeType": change.ChangeType,
				"content":    change.Content,
				"position":   change.Position,
				"length":     change.Length,
			},
		}

        if wsData, err := json.Marshal(wsMessage); err == nil {
            h.hub.Broadcast <- wsData
            log.Printf("Broadcasted change to WebSocket clients: ID=%s", changeID.String())
        } else {
            log.Printf("Failed to marshal WebSocket message: %v", err)
        }
    }()

    log.Printf("Document update completed successfully for ID: %s", documentID.String())
    // Respond immediately; moderation happens asynchronously
    c.JSON(http.StatusOK, gin.H{"success": true})

    // Post-commit profanity check and potential revert (async)
    go func(orig string, ch models.TextChange, invType string, invContent string, invLength int) {
        trimmed := strings.TrimSpace(ch.Content)
        if trimmed == "" || (ch.ChangeType != "insert" && ch.ChangeType != "replace") {
            return
        }
        prev, next := getSurroundingWords(orig, ch.Position, 3)
        ctxMsg := strings.TrimSpace(strings.Join(append(append(prev, trimmed), next...), " "))
        if ctxMsg == "" {
            return
        }

        if profanityDebugEnabled() {
            // Do not log raw user content; log only meta
            log.Printf("[Profanity] Post-check start: ctx_len=%d", len(ctxMsg))
        }

        profane, err := checkProfanityHTTP(ctxMsg)
        if err != nil {
            log.Printf("Post-check profanity error: %v", err)
            return
        }
        if !profane {
            if profanityDebugEnabled() {
                log.Printf("[Profanity] Clean: no action")
            }
            return
        }

        // Revert: write original content back
        if _, err := h.db.Exec(
            "UPDATE documents SET content = $1, updated_at = $2 WHERE id = $3",
            orig, time.Now(), documentID.String(),
        ); err != nil {
            log.Printf("Failed to revert document after profanity: %v", err)
            return
        }

        // Record revert change
        revertID := uuid.New()
        sysUser := uuid.Nil // 0000-...
        sysName := "System (moderation)"
        if _, err := h.db.Exec(
            `INSERT INTO changes (id, document_id, user_id, user_name, change_type, content, position, length, timestamp)
             VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
            revertID.String(), documentID.String(), sysUser.String(), sysName, invType,
            invContent, ch.Position, invLength, time.Now(),
        ); err != nil {
            log.Printf("Failed to save revert change: %v", err)
        }

        // Broadcast inverse change so clients update immediately
        msg := models.WebSocketMessage{
            Type: "text_change",
            Data: map[string]interface{}{
                "changeID":   revertID.String(),
                "documentId": documentID.String(),
                "userID":     sysUser.String(),
                "userName":   sysName,
                "changeType": invType,
                "content":    invContent,
                "position":   ch.Position,
                "length":     invLength,
            },
        }
        if wsData, err := json.Marshal(msg); err == nil {
            h.hub.Broadcast <- wsData
            log.Printf("Broadcasted moderation revert: ID=%s", revertID.String())
        }
    }(originalContent, change, invType, invContent, invLength)
}

func (h *Handler) getChanges(c *gin.Context) {
	documentID := c.Param("documentId")
	docID, err := uuid.Parse(documentID)
	if err != nil {
		c.JSON(http.StatusBadRequest, gin.H{"error": "Invalid document ID"})
		return
	}

	var changes []models.Change
	
	// Use direct string interpolation to completely avoid prepared statements
    log.Printf("Querying changes for document: %s", docID.String())
	query := fmt.Sprintf("SELECT id, document_id, user_id, user_name, change_type, content, position, length, timestamp FROM changes WHERE document_id = '%s' ORDER BY timestamp DESC LIMIT 50", docID.String())
	rows, err := h.db.Query(query)
	if err != nil {
		log.Printf("Failed to query changes: %v", err)
		c.JSON(http.StatusOK, changes) // Return empty array instead of error
		return
	}
	defer rows.Close()
	log.Printf("Changes query executed successfully")

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

	if err := rows.Err(); err != nil {
		log.Printf("Row iteration error: %v", err)
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

// getSurroundingWords extracts up to `n` words before and after the position `pos`.
func getSurroundingWords(text string, pos int, n int) ([]string, []string) {
    re := regexp.MustCompile(`\S+`)
    idxs := re.FindAllStringIndex(text, -1)
    words := re.FindAllString(text, -1)
    if len(idxs) != len(words) || len(words) == 0 {
        return []string{}, []string{}
    }

    // Find center token index around pos
    center := -1
    for i, bounds := range idxs {
        start, end := bounds[0], bounds[1]
        if pos >= start && pos <= end {
            center = i
            break
        }
        if pos < start {
            center = i - 1
            break
        }
    }
    if center == -1 {
        center = len(words) - 1
    }

    // Collect up to n previous and next words
    prevStart := center - n
    if prevStart < 0 { prevStart = 0 }
    prev := []string{}
    for i := prevStart; i < center; i++ {
        if i >= 0 && i < len(words) {
            prev = append(prev, words[i])
        }
    }

    next := []string{}
    for i := center + 1; i <= center + n && i < len(words); i++ {
        next = append(next, words[i])
    }
    return prev, next
}

// checkProfanityHTTP calls the external profanity service.
func checkProfanityHTTP(message string) (bool, error) {
    payload := map[string]string{"message": message}
    b, _ := json.Marshal(payload)

    req, err := http.NewRequest("POST", "https://vector.profanity.dev", bytes.NewReader(b))
    if err != nil {
        return false, err
    }
    req.Header.Set("Content-Type", "application/json")

    client := &http.Client{ Timeout: 3 * time.Second }
    if profanityDebugEnabled() {
        log.Printf("[Profanity] Sending request: bytes=%d", len(b))
    }
    resp, err := client.Do(req)
    if err != nil {
        if profanityDebugEnabled() {
            log.Printf("[Profanity] Request error: %v", err)
        }
        return false, err
    }
    defer resp.Body.Close()

    body, _ := io.ReadAll(resp.Body)
    if profanityDebugEnabled() {
        log.Printf("[Profanity] Response status=%d body=\"%s\"", resp.StatusCode, trimForLog(string(body), 200))
    }

    if resp.StatusCode < 200 || resp.StatusCode >= 300 {
        // Treat non-2xx as non-blocking
        return false, nil
    }

    var data interface{}
    if err := json.Unmarshal(body, &data); err != nil {
        if profanityDebugEnabled() {
            log.Printf("[Profanity] JSON parse failed: %v", err)
        }
        return false, nil
    }

    // Interpret common shapes
    if b, ok := data.(bool); ok {
        if profanityDebugEnabled() {
            log.Printf("[Profanity] Parsed boolean: %v", b)
        }
        return b, nil
    }
    if m, ok := data.(map[string]interface{}); ok {
        // direct boolean-like keys
        for key, v := range m {
            lk := strings.ToLower(strings.ReplaceAll(key, "_", ""))
            if lk == "isprofanity" || lk == "isprofane" || lk == "profanity" || lk == "flagged" || lk == "containsprofanity" {
                if vb, ok := v.(bool); ok {
                    if profanityDebugEnabled() { log.Printf("[Profanity] Parsed key %s: %v", key, vb) }
                    return vb, nil
                }
                if vs, ok := v.(string); ok {
                    b := strings.EqualFold(vs, "true") || vs == "1"
                    if profanityDebugEnabled() { log.Printf("[Profanity] Parsed key %s (string): %s -> %v", key, vs, b) }
                    return b, nil
                }
                if vn, ok := v.(float64); ok {
                    b := vn >= 0.5
                    if profanityDebugEnabled() { log.Printf("[Profanity] Parsed key %s (number): %.3f -> %v", key, vn, b) }
                    return b, nil
                }
            }
        }
        // flaggedFor presence
        if v, ok := m["flaggedFor"]; ok {
            if s, ok := v.(string); ok && strings.TrimSpace(s) != "" {
                if profanityDebugEnabled() { log.Printf("[Profanity] flaggedFor present: %s -> profane", s) }
                return true, nil
            }
        }
        // label/result-like
        for _, k := range []string{"label", "result", "prediction"} {
            if v, ok := m[k]; ok {
                if s, ok := v.(string); ok && strings.Contains(strings.ToLower(s), "profan") {
                    if profanityDebugEnabled() {
                        log.Printf("[Profanity] Parsed label %s indicates profane: %s", k, s)
                    }
                    return true, nil
                }
            }
        }
        // scalar score at top level
        if v, ok := m["score"]; ok {
            switch t := v.(type) {
            case float64:
                if t > 0.8 {
                    if profanityDebugEnabled() {
                        log.Printf("[Profanity] Top-level score=%.3f > 0.8 -> profane", t)
                    }
                    return true, nil
                }
            }
        }
        // scores map
        if v, ok := m["scores"]; ok {
            if scores, ok := v.(map[string]interface{}); ok {
                for k, val := range scores {
                    if strings.Contains(strings.ToLower(k), "profan") {
                        switch t := val.(type) {
                        case float64:
                            if t > 0.8 {
                                if profanityDebugEnabled() {
                                    log.Printf("[Profanity] Score %s=%.3f > 0.8 -> profane", k, t)
                                }
                                return true, nil
                            }
                        }
                    }
                }
            }
        }
    }

    return false, nil
}

func profanityDebugEnabled() bool {
    v := strings.ToLower(os.Getenv("PROFANITY_DEBUG"))
    return v == "1" || v == "true" || v == "yes"
}

func trimForLog(s string, n int) string {
    if len(s) <= n {
        return s
    }
    return s[:n] + "…"
}
