package models

import (
	"time"

	"github.com/google/uuid"
)

type Document struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Content   string    `json:"content" db:"content"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
	UpdatedAt time.Time `json:"updated_at" db:"updated_at"`
}

type User struct {
	ID        uuid.UUID `json:"id" db:"id"`
	Name      string    `json:"name" db:"name"`
	SessionID string    `json:"session_id" db:"session_id"`
	LastSeen  time.Time `json:"last_seen" db:"last_seen"`
	CreatedAt time.Time `json:"created_at" db:"created_at"`
}

type Change struct {
	ID         uuid.UUID `json:"id" db:"id"`
	DocumentID uuid.UUID `json:"document_id" db:"document_id"`
	UserID     uuid.UUID `json:"user_id" db:"user_id"`
	UserName   string    `json:"user_name" db:"user_name"`
	ChangeType string    `json:"change_type" db:"change_type"`
	Content    string    `json:"content" db:"content"`
	Position   int       `json:"position" db:"position"`
	Length     int       `json:"length" db:"length"`
	Timestamp  time.Time `json:"timestamp" db:"timestamp"`
}

type UserCooldown struct {
	UserID    uuid.UUID `json:"user_id" db:"user_id"`
	ExpiresAt time.Time `json:"expires_at" db:"expires_at"`
}

type WebSocketMessage struct {
	Type string      `json:"type"`
	Data interface{} `json:"data"`
}

type TextChange struct {
	DocumentID uuid.UUID `json:"document_id"`
	UserID     uuid.UUID `json:"user_id"`
	UserName   string    `json:"user_name"`
	ChangeType string    `json:"change_type"`
	Content    string    `json:"content"`
	Position   int       `json:"position"`
	Length     int       `json:"length"`
}

type UserPresence struct {
	UserID   uuid.UUID `json:"user_id"`
	UserName string    `json:"user_name"`
	Status   string    `json:"status"`
}