# FretWizard Service - Project Structure

A beginner-friendly guide to this Express.js + Prisma project.

## What is Express.js?

Express is a minimal web framework for Node.js. It handles HTTP requests (GET, POST, PUT, DELETE) and sends responses. Think of it as the "web server" layer — it receives requests from clients (browsers, mobile apps, Postman) and routes them to the right handler function.

## What is Prisma?

Prisma is an ORM (Object-Relational Mapper) for Node.js. Instead of writing raw SQL queries, you call JavaScript methods like `prisma.user.findMany()` and Prisma translates them into SQL for you. It connects to your database (SQL Server in this project) and provides type-safe access to your tables.

---

## Folder Structure

```
fretWizard-service/
├── bin/
│   └── www                  # Server entry point
├── generated/
│   └── prisma/              # Auto-generated Prisma client (do not edit)
├── node_modules/            # Installed npm packages (do not edit)
├── prisma/
│   └── schema.prisma        # Database schema definition
├── public/
│   └── stylesheets/
│       └── style.css        # Static CSS file
├── routes/
│   ├── index.js             # Home page route (GET /)
│   └── users.js             # User CRUD API routes (GET/POST/PUT/DELETE /users)
├── views/
│   ├── layout.jade          # Base HTML template
│   ├── index.jade           # Home page template
│   └── error.jade           # Error page template
├── .env                     # Environment variables (database connection string)
├── app.js                   # Express app configuration (the core of the app)
├── package.json             # Project metadata, dependencies, and scripts
└── package-lock.json        # Locked dependency versions
```

---

## Key Files Explained

### `bin/www` — The Server Starter

This is the file that actually starts the HTTP server. It:
1. Imports the Express app from `app.js`
2. Reads the port number from the `PORT` environment variable (defaults to `3000`)
3. Creates an HTTP server and starts listening for requests

You don't usually edit this file. It's the reason `npm start` runs `node ./bin/www` instead of `node app.js` — it separates "server setup" from "app configuration."

### `app.js` — The Application Core

This is where the Express app is configured. It sets up:

- **Middleware** — functions that process every request before it reaches a route:
  - `morgan` — logs HTTP requests to the console (e.g., `GET /users 200 12ms`)
  - `express.json()` — parses JSON request bodies so `req.body` works
  - `express.urlencoded()` — parses form submissions
  - `cookie-parser` — reads cookies from requests
  - `express.static()` — serves files from the `public/` folder
- **Swagger** — API documentation UI available at `/api-docs`
- **Routes** — maps URL paths to route handler files:
  - `/` maps to `routes/index.js`
  - `/users` maps to `routes/users.js`
- **Error handling** — catches 404 errors and server errors

**How middleware works:** When a request comes in, it passes through each `app.use()` in order, top to bottom. Each middleware can modify the request/response or pass it along with `next()`. Eventually the request reaches a matching route handler.

### `routes/users.js` — The User API

This file defines 5 REST API endpoints for managing users:

| Method | URL | What it does |
|--------|-----|-------------|
| GET | `/users` | List all users |
| GET | `/users/:id` | Get a single user by ID |
| POST | `/users` | Create a new user |
| PUT | `/users/:id` | Update a user's username |
| DELETE | `/users/:id` | Delete a user |

Each handler:
1. Calls Prisma to interact with the database
2. Returns JSON data to the client
3. Passes errors to Express's error handler via `next(err)`

The file also contains Swagger/JSDoc comments (`/** @swagger ... */`) that generate the interactive API documentation at `/api-docs`.

### `prisma/schema.prisma` — The Database Schema

This file tells Prisma:
- **Which database to connect to** — SQL Server, using the connection string from `.env`
- **What tables exist** — currently just `User` with two columns:
  - `UserId` (UUID, primary key)
  - `Username` (optional string, up to 100 characters)

When you modify this file and run `prisma generate`, Prisma regenerates the client code in `node_modules/@prisma/client/` so your JavaScript code stays in sync with the database.

### `.env` — Environment Variables

Stores the database connection string. This file is **not committed to git** (it's in `.gitignore`) because it contains credentials. Each developer sets up their own `.env` with their local database details.

```
DATABASE_URL="sqlserver://SERVERNAME;database=Fretwizard;integratedSecurity=true;trustServerCertificate=true"
```

### `views/` — Server-Side Templates (Jade/Pug)

These templates render HTML pages on the server. This project primarily serves a JSON API, so these are only used for the home page and error pages. `layout.jade` is the base template that others extend.

---

## NPM Scripts

Run these from the terminal with `npm run <script>`:

| Script | Command | What it does |
|--------|---------|-------------|
| `start` | `node ./bin/www` | Start the server (production) |
| `dev` | `nodemon ./bin/www` | Start with auto-reload on file changes (development) |
| `db:pull` | `prisma db pull` | Pull the current database schema into `schema.prisma` |
| `db:generate` | `prisma generate` | Regenerate the Prisma client after schema changes |
| `db:migrate` | `prisma migrate dev` | Create and apply a database migration |

---

## How a Request Flows Through the App

```
Client (browser/Postman)
  │
  ▼
bin/www (HTTP server, port 3000)
  │
  ▼
app.js (middleware chain: logger → JSON parser → cookie parser → static files)
  │
  ▼
Route matching (/users → routes/users.js)
  │
  ▼
Route handler (e.g., GET /users → prisma.user.findMany())
  │
  ▼
Prisma ORM → SQL Server database
  │
  ▼
JSON response back to client
```

---

## Getting Started

1. `npm install` — install all dependencies
2. Copy `.env.example` to `.env` and set your database connection string
3. `npm run db:generate` — generate the Prisma client
4. `npm run dev` — start the dev server at `http://localhost:3000`
5. Visit `http://localhost:3000/api-docs` for interactive API documentation
