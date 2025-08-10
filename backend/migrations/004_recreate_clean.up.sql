-- Drop and recreate tables with clean schema
DROP TABLE IF EXISTS user_cooldowns CASCADE;
DROP TABLE IF EXISTS changes CASCADE;
DROP TABLE IF EXISTS users CASCADE;
DROP TABLE IF EXISTS documents CASCADE;

-- Recreate with simple, clean schema
CREATE TABLE documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    content TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE changes (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL,
    user_id UUID NOT NULL,
    user_name VARCHAR(255) NOT NULL,
    change_type VARCHAR(50) NOT NULL,
    content TEXT NOT NULL,
    position INTEGER NOT NULL,
    length INTEGER NOT NULL DEFAULT 0,
    timestamp TIMESTAMP WITH TIME ZONE DEFAULT CURRENT_TIMESTAMP
);

-- Add foreign key for documents only
ALTER TABLE changes ADD CONSTRAINT changes_document_id_fkey FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE;

-- Indexes
CREATE INDEX idx_changes_document_id ON changes(document_id);
CREATE INDEX idx_changes_timestamp ON changes(timestamp DESC);

-- Insert default document
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