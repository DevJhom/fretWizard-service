# FretWizard Service - Project Structure

A beginner-friendly guide to how this Express.js + Prisma API is put together.

## What it does

The backend for the FretWizard frontend:

- **Accounts** — sign up and log in with email + password, or with Google.
- **Library** — named, saved stacks of fretboards (`/library-cards`).
- **Workspaces** — the current stack on the Scale and Chord pages (`/workspaces/scale`, `/workspaces/chord`).
- **Chord Progression** — the saved progression (`/chord-progression`).
- **Import** — copies a guest's browser data into their account on first login (`/me/import`).

Run the server and open `http://localhost:3000/api-docs` to try every endpoint.

## Folder structure

```
fretWizard-service/
├── bin/www                 # Starts the HTTP server (loads .env, builds dependencies)
├── app.js                  # createApp(): middleware, routers, 404, error handler
├── lib/                    # Small shared helpers
│   ├── config.js           # Reads and checks environment variables
│   ├── errors.js           # AppError and helpers such as notFound()
│   ├── limits.js           # 200 cards, 50 fretboards per stack, 100 chords
│   ├── asyncHandler.js     # Sends errors from async routes to the error handler
│   ├── prisma.js           # The one PrismaClient
│   └── swagger.js          # Builds /api-docs from the comments above each route
├── middleware/
│   ├── requireAuth.js      # Checks the Bearer access token and sets req.userId
│   ├── validate.js         # Checks req.body against a zod schema
│   ├── rateLimits.js       # Per-IP limits on the auth endpoints
│   └── errorHandler.js     # Turns every error into JSON
├── validation/             # zod schemas: what a valid request body looks like
├── mappers/fretboard.js    # FretboardData (JSON) <-> fretboard table row
├── services/               # Database work, one file per area
├── routes/                 # HTTP endpoints, one file per area
├── prisma/
│   ├── schema.prisma       # The tables
│   └── migrations/         # The SQL that creates them
└── test/
    ├── unit/               # Tests that need no database
    ├── integration/        # Tests against the Fretwizard_Test database
    └── support/            # Test helpers
```

## How a request flows

```
Client
  -> bin/www (HTTP server)
  -> app.js middleware: logger -> CORS -> JSON body parser
  -> requireAuth (protected routes only)
  -> validate (zod)
  -> route handler -> service -> Prisma -> PostgreSQL
  -> JSON response
     (any error -> errorHandler -> { "error": { "code", "message" } })
```

Routes stay thin: check the input, call a service, send the result. Services do the database work. Every service function takes `db` first — usually the shared `prisma`, or `tx` inside a transaction — so the import endpoint can run several services in one transaction.

## Authentication in one paragraph

Logging in returns two tokens. The **access token** (a JWT that lasts 15 minutes) goes in the `Authorization: Bearer ...` header of every protected request. The **refresh token** (random, lasts 7 days) is exchanged at `/auth/refresh` for a new pair, and the old one is revoked. The database only stores a SHA-256 hash of each refresh token. If a revoked refresh token is ever used again, every token from that login is revoked, because it was probably copied.

## Tables

| Table | Holds |
|---|---|
| `User` | Email, display name, password hash (empty for Google-only accounts) |
| `UserLogin` | Google (later other providers) identities linked to a user |
| `RefreshToken` | Hashed refresh tokens, grouped by login "family" |
| `LibraryCard` + `CardFretboard` | A named card and its fretboards, one row per fretboard |
| `WorkspaceFretboard` | The Scale/Chord page stacks, one row per fretboard |
| `ChordProgression` + `ProgressionChord` | The progression's key and tonality, and its chords |

Deleting a user deletes everything they own (`ON DELETE CASCADE`).

## Environment

Copy `.env.example` to `.env` and fill it in. For tests, copy `.env.test.example` to `.env.test`; it must point at a database whose name contains "test", because the integration tests empty it.

## NPM scripts

| Script | What it does |
|---|---|
| `npm start` / `npm run dev` | Start the server (`dev` restarts on changes) |
| `npm test` | Unit tests, then reset the test database and run the integration tests |
| `npm run test:unit` | Only the tests that need no database |
| `npm run lint` | ESLint |
| `npm run db:generate` | Regenerate the Prisma client after editing the schema |
| `npm run db:migrate` | Create and apply a migration |
