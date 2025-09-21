package websocket

import (
    "encoding/json"
    "log"
    "net/http"
    "sync"
    "time"

	"storychain-backend/internal/models"

	"github.com/gin-gonic/gin"
	"github.com/google/uuid"
	"github.com/gorilla/websocket"
)

var upgrader = websocket.Upgrader{
	CheckOrigin: func(r *http.Request) bool {
		return true
	},
}

type Client struct {
	ID       uuid.UUID
	Name     string
	Conn     *websocket.Conn
	Send     chan []byte
	Hub      *Hub
	Cooldown time.Time
}

type Hub struct {
    Clients    map[*Client]bool
    Broadcast  chan []byte
    Register   chan *Client
    Unregister chan *Client
    mu         sync.RWMutex
}

func NewHub() *Hub {
    return &Hub{
        Clients:    make(map[*Client]bool),
        // Buffer broadcasts to avoid dropping messages and to decouple producers
        Broadcast:  make(chan []byte, 256),
        Register:   make(chan *Client),
        Unregister: make(chan *Client),
    }
}

func (h *Hub) Run() {
    for {
        select {
        case client := <-h.Register:
            h.mu.Lock()
            h.Clients[client] = true
            h.mu.Unlock()
            
            h.broadcastUserPresence(client.ID, client.Name, "joined")
            log.Printf("Client (%s) connected", client.ID)

		case client := <-h.Unregister:
			h.mu.Lock()
			if _, ok := h.Clients[client]; ok {
				delete(h.Clients, client)
				close(client.Send)
			}
			h.mu.Unlock()
			
            h.broadcastUserPresence(client.ID, client.Name, "left")
            log.Printf("Client (%s) disconnected", client.ID)

        case message := <-h.Broadcast:
            log.Printf("Hub broadcasting message to %d clients", len(h.Clients))
            // Send to all clients; collect any that need removal, then remove under write lock
            var toRemove []*Client
            h.mu.RLock()
            for client := range h.Clients {
                select {
                case client.Send <- message:
                    // ok
                default:
                    // Client's send buffer is full; mark for removal
                    toRemove = append(toRemove, client)
                }
            }
            h.mu.RUnlock()
            if len(toRemove) > 0 {
                h.mu.Lock()
                for _, client := range toRemove {
                    if h.Clients[client] {
                        log.Printf("Removing slow client (%s)", client.ID)
                        close(client.Send)
                        delete(h.Clients, client)
                    }
                }
                h.mu.Unlock()
            }
        }
    }
}

func (h *Hub) GetOnlineCount() int {
	h.mu.RLock()
	defer h.mu.RUnlock()
	return len(h.Clients)
}

func (h *Hub) broadcastUserPresence(userID uuid.UUID, userName, status string) {
	presence := models.UserPresence{
		UserID:   userID,
		UserName: userName,
		Status:   status,
	}

	message := models.WebSocketMessage{
		Type: "user_presence",
		Data: presence,
	}

	if data, err := json.Marshal(message); err == nil {
		h.Broadcast <- data
	}
}

func HandleWebSocket(c *gin.Context, hub *Hub) {
	conn, err := upgrader.Upgrade(c.Writer, c.Request, nil)
	if err != nil {
		log.Printf("WebSocket upgrade error: %v", err)
		return
	}

	userID := uuid.New()
	userName := c.Query("name")
	if userName == "" {
		userName = "Anonymous"
	}

	client := &Client{
		ID:   userID,
		Name: userName,
		Conn: conn,
		Send: make(chan []byte, 256),
		Hub:  hub,
	}

	hub.Register <- client

	go client.writePump()
	go client.readPump()
}

func (c *Client) readPump() {
	defer func() {
		c.Hub.Unregister <- c
		c.Conn.Close()
	}()

	c.Conn.SetReadLimit(512)
	c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
	c.Conn.SetPongHandler(func(string) error {
		c.Conn.SetReadDeadline(time.Now().Add(60 * time.Second))
		return nil
	})

	for {
		_, message, err := c.Conn.ReadMessage()
		if err != nil {
			break
		}

		var wsMessage models.WebSocketMessage
		if err := json.Unmarshal(message, &wsMessage); err != nil {
			continue
		}

		switch wsMessage.Type {
		case "text_change":
			if time.Now().Before(c.Cooldown) {
				continue
			}
			c.Cooldown = time.Now().Add(10 * time.Second)
			c.Hub.Broadcast <- message
		case "cursor_position":
			c.Hub.Broadcast <- message
		}
	}
}

func (c *Client) writePump() {
	ticker := time.NewTicker(54 * time.Second)
	defer func() {
		ticker.Stop()
		c.Conn.Close()
	}()

	for {
		select {
		case message, ok := <-c.Send:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if !ok {
				c.Conn.WriteMessage(websocket.CloseMessage, []byte{})
				return
			}

			w, err := c.Conn.NextWriter(websocket.TextMessage)
			if err != nil {
				return
			}
			w.Write(message)

			n := len(c.Send)
			for i := 0; i < n; i++ {
				w.Write(<-c.Send)
			}

			if err := w.Close(); err != nil {
				return
			}

		case <-ticker.C:
			c.Conn.SetWriteDeadline(time.Now().Add(10 * time.Second))
			if err := c.Conn.WriteMessage(websocket.PingMessage, nil); err != nil {
				return
			}
		}
	}
}
