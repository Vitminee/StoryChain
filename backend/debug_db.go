package main

import (
	"database/sql"
	"fmt"
	"log"
	"os"

	"github.com/joho/godotenv"
	_ "github.com/lib/pq"
)

func main() {
	// Load .env file
	if err := godotenv.Load(); err != nil {
		log.Println("No .env file found")
	}

	// Get database URL
	dbURL := os.Getenv("DATABASE_URL")
	if dbURL == "" {
		dbURL = "postgres://localhost:5432/storychain?sslmode=disable&prefer_simple_protocol=true"
	}

	fmt.Printf("Connecting to: %s\n", dbURL)

	// Connect to database
	db, err := sql.Open("postgres", dbURL)
	if err != nil {
		log.Fatal("Failed to open database:", err)
	}
	defer db.Close()

	// Test connection
	if err := db.Ping(); err != nil {
		log.Fatal("Failed to ping database:", err)
	}

	fmt.Println("Database connection successful!")

	// Check what tables exist
	fmt.Println("\n=== Checking tables ===")
	tables, err := db.Query(`
		SELECT table_name 
		FROM information_schema.tables 
		WHERE table_schema = 'public'
		ORDER BY table_name
	`)
	if err != nil {
		log.Fatal("Failed to query tables:", err)
	}
	defer tables.Close()

	for tables.Next() {
		var tableName string
		tables.Scan(&tableName)
		fmt.Printf("Table: %s\n", tableName)
	}

	// Check documents table schema
	fmt.Println("\n=== Documents table schema ===")
	columns, err := db.Query(`
		SELECT column_name, data_type 
		FROM information_schema.columns 
		WHERE table_name = 'documents' 
		ORDER BY ordinal_position
	`)
	if err != nil {
		log.Printf("Failed to query documents schema: %v\n", err)
	} else {
		defer columns.Close()
		for columns.Next() {
			var colName, dataType string
			columns.Scan(&colName, &dataType)
			fmt.Printf("Column: %s (%s)\n", colName, dataType)
		}
	}

	// Test document query
	fmt.Println("\n=== Testing document query ===")
	var id, content string
	var created_at, updated_at string
	err = db.QueryRow(`
		SELECT id, content, created_at, updated_at 
		FROM documents 
		WHERE id = '00000000-0000-0000-0000-000000000001'
	`).Scan(&id, &content, &created_at, &updated_at)
	
	if err == sql.ErrNoRows {
		fmt.Println("No document found with that ID")
	} else if err != nil {
		fmt.Printf("Error querying document: %v\n", err)
	} else {
		fmt.Printf("Document found: ID=%s, Content length=%d\n", id, len(content))
	}

	fmt.Println("\nDatabase debug complete!")
}