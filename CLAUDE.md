# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

- **Install:** `npm install` (also generates the Prisma client)
- **Start:** `npm start` (port from `PORT`, default 3000) · **Dev:** `npm run dev`
- **Unit tests:** `npm run test:unit` (no database needed)
- **All tests:** `npm test` (needs `.env.test` pointing at a database whose name contains "test"; it is reset first)
- **Lint:** `npm run lint`
- **Prisma:** `npm run db:generate` after editing `prisma/schema.prisma`; `npm run db:migrate` to add a migration
- **API docs:** `http://localhost:3000/api-docs`

## Architecture

JSON API for the FretWizard frontend: accounts (email + password, Google), Library cards, Scale/Chord workspaces, Chord Progression, and a one-time import of a guest's browser data. Express 4 + Prisma 5 + SQL Server, CommonJS.

- `app.js` — `createApp({ prisma, config, googleVerifier })`; `bin/www` loads `.env`, builds the real dependencies and listens. Tests build the app with a test config and a fake Google verifier.
- `routes/` — thin router factories taking the deps object: validate → call a service → respond.
- `services/` — the Prisma work. Functions take `db` first (the PrismaClient, or a transaction client), so `services/import.js` can run several of them in one transaction.
- `validation/` — zod schemas. `mappers/fretboard.js` is the only converter between the frontend's `FretboardData` and fretboard rows.
- `middleware/` — `requireAuth` (sets `req.userId`), `validate`, `rateLimits`, `errorHandler`.
- `lib/` — config, errors, limits, asyncHandler, prisma, swagger.

Design spec: `docs/superpowers/specs/2026-10-01-accounts-and-sync-design.md`.

## Conventions

- Database names are PascalCase; JSON is camelCase.
- Every query for a user's data filters by `UserId`. Another user's resource, or a non-UUID id, is a 404.
- Throw the helpers from `lib/errors.js`; `errorHandler` renders `{ error: { code, message, details? } }`.
- Access tokens: JWT HS256, 15 min. Refresh tokens: random, stored as SHA-256 hashes, 7 days, rotated on every refresh; a reused token revokes its whole family.
- Adding a `FretboardData` field means: a column in both `CardFretboard` and `WorkspaceFretboard`, `mappers/fretboard.js`, `validation/fretboard.js`, and a migration.
- Every route has a Swagger JSDoc block; `test/unit/swagger.test.js` checks coverage and bearer-auth declarations.
- Code style: `var`, `function` handlers, CommonJS.
