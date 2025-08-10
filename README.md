# StoryChain - Collaborative Text Editor

A real-time collaborative text editor.

## Features

- **Real-time collaboration**: Multiple users can edit simultaneously
- **Word-level editing**: Click on any word to edit or click between words to add text
- **30-second cooldown**: Prevents spam and encourages thoughtful edits
- **Markdown support**: Full markdown rendering with live preview
- **Document outline**: Automatic table of contents from headers
- **Change history**: Track all edits with user attribution
- **Link blocking**: Prevents users from adding links to maintain content quality
- **User presence**: See who's online and editing

## Architecture

- **Frontend**: Next.js 15 with TypeScript, Tailwind CSS, Zustand for state management, and Heroicons
- **Backend**: Go with Gin, WebSocket support, and PostgreSQL
- **Database**: PostgreSQL with automatic migrations
- **Real-time**: WebSocket connections for live collaboration

## Quick Start

### Prerequisites

- Node.js 18+
- Go 1.21+
- PostgreSQL 14+

### Backend Setup

1. Navigate to the backend directory:
```bash
cd backend
```

2. Install Go dependencies:
```bash
go mod tidy
```

3. Create a `.env` file:
```bash
cp .env.example .env
```

4. Update the `.env` file with your database credentials:
```env
DATABASE_URL=postgres://username:password@localhost:5432/storychain?sslmode=disable
FRONTEND_URL=http://localhost:3000
PORT=8080
```

5. Create the database:
```sql
CREATE DATABASE storychain;
```

6. Run the backend server:
```bash
go run main.go
```

The backend will automatically run migrations on startup.

### Frontend Setup

1. Navigate to the frontend directory:
```bash
cd frontend
```

2. Install dependencies:
```bash
npm install
```

3. Run the development server:
```bash
npm run dev
```

4. Open [http://localhost:3000](http://localhost:3000) in your browser

## Usage

1. **Editing**: Click on any word to edit it, or click between words to add new text
2. **Cooldown**: After making an edit, you'll have a 30-second cooldown before you can edit again
3. **Preview**: Toggle between edit and preview modes using the button in the top-right
4. **Navigation**: Use the outline sidebar to jump to different sections
5. **History**: View recent changes in the right sidebar, hover to highlight, click to navigate

## API Endpoints

- `GET /api/document/:id` - Get document content
- `PUT /api/document/:id` - Update document with a change
- `GET /api/changes/:documentId` - Get change history
- `GET /api/stats` - Get statistics (edits, users, online count)
- `WS /api/ws` - WebSocket connection for real-time updates

## WebSocket Events

- `user_presence` - User joined/left notifications
- `text_change` - Real-time text modifications
- `stats_update` - Live statistics updates

## Database Schema

- `documents` - Document content and metadata
- `users` - User information and sessions
- `changes` - Edit history with user attribution
- `user_cooldowns` - Cooldown tracking per user

## Development

### Adding New Features

1. Backend changes go in `backend/internal/`
2. Frontend components go in `frontend/src/components/`
3. Shared utilities in `frontend/src/lib/`
4. State management in `frontend/src/stores/`

### Running Tests

```bash
# Backend
cd backend
go test ./...

# Frontend
cd frontend
npm test
```

### Building for Production

```bash
# Backend
cd backend
go build -o storychain-server

# Frontend
cd frontend
npm run build
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details