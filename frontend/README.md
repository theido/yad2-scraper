# Yad2 Scraper Frontend

React-based web application for managing scraper projects.

## Quick Start

1. Install dependencies:
```bash
npm install
```

2. Copy `.env.example` to `.env` and fill in your GitHub OAuth credentials:
```bash
cp .env.example .env
```

3. Start development server:
```bash
npm run dev
```

4. Build for production:
```bash
npm run build
```

## Environment Variables

- `VITE_GITHUB_CLIENT_ID`: GitHub OAuth App Client ID (public)
- `GITHUB_CLIENT_SECRET`: GitHub OAuth App Client Secret (server-side only)
- `GITHUB_REPO_OWNER`: GitHub repository owner (username or org)
- `GITHUB_REPO_NAME`: Repository name

## Deployment

See the main README.md for deployment instructions.

## Project Structure

```
frontend/
├── api/              # Serverless API routes
├── src/
│   ├── components/  # React components
│   ├── contexts/    # React contexts (Auth, Projects)
│   ├── pages/       # Page components
│   └── lib/         # Utility functions
└── public/          # Static assets
```

