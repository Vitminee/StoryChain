CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(255) NOT NULL,
    session_id VARCHAR(255) UNIQUE NOT NULL,
    last_seen TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    user_name VARCHAR(255) NOT NULL,
    change_type VARCHAR(50) NOT NULL, -- 'insert', 'delete', 'replace'
    content TEXT NOT NULL,
    position INTEGER NOT NULL,
    length INTEGER NOT NULL DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE user_cooldowns (
    user_id UUID PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Indexes for better query performance
CREATE INDEX idx_changes_document_id ON changes(document_id);
CREATE INDEX idx_changes_timestamp ON changes(timestamp DESC);
CREATE INDEX idx_changes_user_id ON changes(user_id);
CREATE INDEX idx_users_session_id ON users(session_id);
CREATE INDEX idx_user_cooldowns_expires_at ON user_cooldowns(expires_at);

-- Function to automatically update updated_at timestamp
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Trigger to automatically update updated_at for documents
CREATE TRIGGER update_documents_updated_at 
    BEFORE UPDATE ON documents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Insert a default document
INSERT INTO documents (id, content) VALUES 
    ('00000000-0000-0000-0000-000000000001', '# Welcome to StoryChain

This is a collaborative text editor where you can edit text in real-time with other users.

## How it works
- Click on any word to edit it
- Click between words or at the end to add new text
- You get a 30-second cooldown after each edit
- Changes are saved automatically and synced with all users

## Features
- **Real-time collaboration**: See changes from other users instantly
- **Markdown support**: Use markdown syntax for formatting
- **Change history**: Track all edits in the sidebar
- **User presence**: See who''s online and editing

Start editing by clicking on any word above!');