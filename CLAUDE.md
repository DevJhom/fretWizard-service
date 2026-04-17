# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Start server:** `npm start` (runs `node ./bin/www`, default port 3000)
- **Dev server:** `npm run dev` (runs `nodemon app.js` with auto-reload)
- **Install dependencies:** `npm install`

## Architecture

Express.js application using the Jade (Pug) template engine, generated from the Express application generator scaffold.

- **`app.js`** — Express app setup: middleware chain (morgan logger, JSON/URL-encoded body parsing, cookie-parser, static files from `public/`), route mounting, 404/error handling.
- **`bin/www`** — HTTP server entry point. Reads port from `PORT` env var (default 3000).
- **`routes/`** — Express routers mounted in `app.js`. `index.js` at `/`, `users.js` at `/users`.
- **`views/`** — Jade templates. `layout.jade` is the base layout; pages extend it via `block content`.
- **`public/`** — Static assets served at root path.
