# FretWizard Accounts & Sync Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Let FretWizard users sign up and log in (email + password, or Google) and sync their Library, Scale/Chord stacks and Chord Progression through the FretWizard service, while guests keep today's browser-only behaviour.

**Architecture:** The Express service gets a `createApp` factory, thin routers over Prisma-backed services, zod validation, JWT access tokens plus hashed rotating refresh tokens, and normalised SQL Server tables (one row per fretboard). The Vue frontend gets a session/HTTP layer with cross-tab-safe refresh, a Pinia auth store, a runtime switch between `localStorage` and the API, a one-time import of guest data on login, and a sign-in modal.

**Tech Stack:** Backend: Node 24, Express ^4.21.2, Prisma 5.22 + SQL Server, zod 3, jsonwebtoken 9, bcrypt 6, google-auth-library, express-rate-limit 7, `node:test` + supertest. Frontend: Vue 3.5, Pinia 2, TypeScript 5.3, Vite 5.1, Bootstrap 5.3, lodash, Vitest 2 + happy-dom.

**Spec:** `fretWizard-service/docs/superpowers/specs/2026-10-01-accounts-and-sync-design.md`

## Repos and working conventions

- Two sibling git repos under `C:\Users\Saiswan.w\Desktop\fret-wizard\`. **Part A** paths are relative to `fretWizard-service/`; **Part B** paths are relative to `fret-wizard/`.
- Run commands from **Git Bash** in the repo root. (PowerShell 5.1's `>` writes UTF-16, which corrupts the migration file generated in Task A2.)
- Branch `feature/accounts-and-sync` in both repos: backend from `main`, frontend from `fretwizard-2.0`.
- Every commit message ends with the trailer `Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>`; each commit command below passes it as a second `-m`.

## Prerequisites from the owner

- **`Fretwizard_Test` connection string** → `fretWizard-service/.env.test`. Needed from Task A2 Step 8 onward (every integration test). If it is missing when you get there, stop and ask the owner. Never point tests at any other database; the test harness refuses a database whose name doesn't contain "test".
- **Dev database connection string** → `fretWizard-service/.env`. Needed for the optional dev-database reset in Task A2 and for Task B5.
- **Google OAuth client ID** (type "Web application", origins `http://localhost:5173` and `https://devjhom.github.io`) → `GOOGLE_CLIENT_ID` in `fretWizard-service/.env` and `VITE_GOOGLE_CLIENT_ID` in `fret-wizard/.env.development`. Needed only for the Google checks in Task B5. Until then any non-empty placeholder lets the backend start, and the frontend hides the Google button while its variable is empty.

## Execution phases

The owner runs this plan inline (superpowers:executing-plans), one phase per session, stopping after each phase. Progress lives in the ledger at `fretWizard-service/.superpowers/sdd/2026-10-01-accounts-and-sync/progress.md`.

| Phase | Tasks | Needs |
|---|---|---|
| 1 | A1–A2 | `Fretwizard_Test` connection string for A2 Step 8 |
| 2 | A3–A5 | Test database |
| 3 | A6–A11 | Test database |
| 4 | B1–B2 | Nothing (API mocked) |
| 5 | B3–B5, then the final whole-branch review | Google client ID for the B5 Google checks |

## Global Constraints

- Backend code style: CommonJS, `var`, `function` handlers, Swagger JSDoc on every route.
- Express `^4.21.2`; Prisma `5.22` on SQL Server; IDs are `UNIQUEIDENTIFIER` with `@default(uuid())`; PascalCase table/column names; named constraints `PK_…`, `FK_…`, `UQ_…`, `IX_…`.
- JSON on the wire is camelCase. Stacks use the frontend's `FretboardData` shape exactly; `createdAt` on a library card is epoch milliseconds.
- Every error is JSON: `{ "error": { "code", "message", "details"? } }`. Codes: `VALIDATION_ERROR` 400, `UNAUTHORIZED` 401, `NOT_FOUND` 404, `CONFLICT` 409, `LIMIT_EXCEEDED` 409, `RATE_LIMITED` 429, `INTERNAL` 500.
- Another user's resource, or an ID that is not a UUID, responds `404 NOT_FOUND`.
- Access token: JWT HS256, payload `{ sub: userId }`, 15 minutes, `algorithms: ['HS256']` pinned on verify.
- Refresh token: `crypto.randomBytes(32).toString('base64url')`; only `TokenHash` (SHA-256 lowercase hex) is stored; expires 7 days after issue; every refresh issues a new token in the same family (sliding 7 days).
- bcrypt cost 12. Password at least 8 characters and at most 72 bytes. Display name 1–100 characters. Email trimmed, lowercased, at most 255 characters.
- Limits: 200 library cards per user; 1–50 fretboards per stack; 100 chords per progression; card name 1–100 characters; request bodies 1 MB.
- Rate limits per IP: 10 requests/minute on `/auth/signup`, `/auth/login`, `/auth/google`; 60/minute on `/auth/refresh`.
- Frontend: `<script setup lang="ts">` only, path aliases (`@/`, `@services/`, `@stores/`, `@data/`, `@components/`) in every import, existing `localStorage` key names unchanged, theme always stays in `localStorage`.
- API-mode workspace and chord-progression saves are debounced 800 ms (trailing).

## Review Focus

1. **The API fails while a page loads in API mode** (500, timeout, offline). The page falls back to defaults, and the user expects their account's saved stack not to be overwritten by those defaults. → Task B3, test "stops saving a workspace whose load failed".
2. **Old or partial browser data on first login** (legacy card format, fretboards saved before fields such as `currentStrings` existed, a progression key invalid for its tonality, a blank card name). The user expects the import to succeed rather than fail on every login. → Task B2, tests in `guestData.test.ts`.
3. **Malformed or oversized request bodies.** The client expects a JSON `400 VALIDATION_ERROR`, never an HTML page or a 500. → Task A1, tests "malformed JSON" and "bodies over 1 MB".
4. **Importing many cards in one transaction.** Rows written within the same millisecond could tie on `CreatedDate`. The user expects the Library order to match the browser's order. → Task A10, test "import fills an empty account" checks `['One', 'Two', 'Three']`.
5. **The refresh endpoint answers 429/5xx or the network is down.** The user expects to stay logged in (refresh token kept), not to be silently logged out. → Task B1 (`session.test.ts` "unreachable", `http.test.ts` "keeps the session…") and Task B2 ("keeps the refresh token when the API is unreachable").

## File map

**Backend (`fretWizard-service/`)**

| Path | Responsibility |
|---|---|
| `app.js` | `createApp({ prisma, config, googleVerifier })`: middleware, routers, 404, error handler |
| `bin/www` | Loads `.env`, builds real dependencies, listens |
| `lib/config.js` | Reads and checks environment variables |
| `lib/errors.js` | `AppError` and helpers (`notFound`, `unauthorized`, `conflict`, `limitExceeded`, `rateLimited`) |
| `lib/asyncHandler.js` | Forwards async route errors to `next` |
| `lib/limits.js` | `MAX_CARDS`, `MAX_FRETBOARDS`, `MAX_CHORDS` |
| `lib/prisma.js` | The single `PrismaClient` |
| `lib/swagger.js` | OpenAPI spec built from route JSDoc |
| `middleware/errorHandler.js` | Renders every error as JSON |
| `middleware/validate.js` | `validate({ body })` with zod |
| `middleware/requireAuth.js` | Bearer token → `req.userId` |
| `middleware/rateLimits.js` | `createRateLimit(limitPerMinute)` |
| `validation/auth.js`, `fretboard.js`, `library.js`, `workspaces.js`, `chordProgression.js`, `import.js` | zod schemas |
| `mappers/fretboard.js` | `FretboardData` ⇄ fretboard row |
| `services/tokens.js` | Access/refresh tokens: issue, rotate, revoke |
| `services/users.js` | Sign-up, password check, Google sign-in, profile |
| `services/google.js` | Google ID-token verifier |
| `services/library.js`, `workspaces.js`, `chordProgression.js`, `import.js` | Data operations |
| `routes/health.js`, `auth.js`, `me.js`, `libraryCards.js`, `workspaces.js`, `chordProgression.js` | HTTP endpoints |
| `test/support/*.js` | Test config, env guard, database helper, app builder, fixtures |
| `test/unit/*.test.js` | Tests without a database |
| `test/integration/*.test.js` | Tests against `Fretwizard_Test` |
| `test/setupDatabase.js` | Resets the test database before integration tests |

**Frontend (`fret-wizard/`)**

| Path | Responsibility |
|---|---|
| `vitest.config.ts` | Vitest config (happy-dom) |
| `src/services/apiConfig.ts` | `apiBaseUrl()`, `accountsEnabled()`, `googleClientId()` |
| `src/services/apiTypes.ts` | Wire types |
| `src/services/session.ts` | Token storage and cross-tab-safe refresh |
| `src/services/http.ts` | `apiRequest` and `ApiError` |
| `src/services/authApi.ts` | Auth and import endpoints |
| `src/services/guestData.ts` | Collect and clear browser data for import |
| `src/services/authErrors.ts` | API error → form messages |
| `src/services/googleIdentity.ts` | Loads Google Identity Services and renders its button |
| `src/stores/useAuthStore.ts` | Session state and transitions |
| `src/services/adapters/apiAdapter.ts` | API persistence (rewritten) |
| `src/services/adapters/localStorageAdapter.ts` | Per-card operations and exported key lists |
| `src/services/customizerService.ts` | Runtime switch between adapters |
| `src/stores/useLibraryStore.ts` | Per-card operations and `reset()` |
| `src/components/AuthModal.vue`, `AccountMenu.vue` | Sign-in UI |
| `src/layout/DefaultLayout.vue`, `src/main.ts` | Wiring |
| `tests/unit/*.test.ts` | Vitest tests |

---

## Part A — Backend (`fretWizard-service/`)

### Task A1: Service skeleton with JSON errors

**Files:**
- Create: `lib/config.js`, `lib/errors.js`, `lib/asyncHandler.js`, `lib/prisma.js`, `lib/swagger.js`, `middleware/errorHandler.js`, `routes/health.js`, `.env.example`, `test/support/config.js`, `test/unit/config.test.js`, `test/unit/errorHandler.test.js`, `test/unit/app.test.js`
- Modify (full rewrite): `app.js`, `bin/www`
- Modify: `package.json` (scripts), `.gitignore`
- Delete: `routes/index.js`, `routes/users.js`, `routes/cards.js`, `routes/fretboards.js`, `routes/auth.js`, `middleware/auth.js`, `views/`, `public/`, `prisma.config.ts` (Prisma 5.22 never reads it)

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `app.js` exports `{ createApp }`; `createApp({ prisma, config, googleVerifier }) → express app`.
  - `lib/config.js` exports `{ loadConfig }`; `loadConfig(env = process.env) → Config` where `Config = { port: string, jwtSecret: string, googleClientId: string, corsOrigins: string[], trustProxy: boolean | number | string, bcryptCost: number, rateLimits: { auth: number, refresh: number }, logRequests: boolean }`.
  - `lib/errors.js` exports `{ AppError, notFound, unauthorized, conflict, limitExceeded, rateLimited }`; `new AppError(status, code, message, details?)`.
  - `lib/asyncHandler.js` exports `asyncHandler(fn)`.
  - `lib/prisma.js` exports a `PrismaClient` instance.
  - `test/support/config.js` exports `{ testConfig(overrides?) → Config }` (bcrypt cost 4, rate limits 1000, logging off).

- [ ] **Step 1: Create the branch and commit the design docs**

```bash
git checkout -b feature/accounts-and-sync
git add docs/superpowers
git commit -m "docs: accounts and sync design and implementation plan" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 2: Install, remove and add dependencies**

```bash
npm install
npm uninstall jade cookie-parser http-errors
npm install express@^4.21.2 cors@^2.8.5 zod@^3.24.0
npm install -D supertest@^7.1.0
```

Expected: `package.json` now lists `express` `^4.21.2`, `cors`, `zod` and dev dependency `supertest`; `jade`, `cookie-parser` and `http-errors` are gone.

- [ ] **Step 3: Delete the old scaffold**

```bash
git rm -r routes/index.js routes/users.js routes/cards.js routes/fretboards.js routes/auth.js middleware/auth.js views public prisma.config.ts
```

- [ ] **Step 4: Replace the `scripts` block in `package.json`**

```json
  "scripts": {
    "start": "node ./bin/www",
    "dev": "nodemon ./bin/www",
    "db:pull": "prisma db pull",
    "db:generate": "prisma generate",
    "db:migrate": "prisma migrate dev",
    "test": "npm run test:unit",
    "test:unit": "node --test \"test/unit/**/*.test.js\"",
    "lint": "eslint .",
    "lint:fix": "eslint . --fix"
  },
```

- [ ] **Step 5: Write the test config helper**

`test/support/config.js`:

```js
function testConfig(overrides) {
  return Object.assign({
    port: '0',
    jwtSecret: 'test-jwt-secret-that-is-at-least-32-characters',
    googleClientId: 'test-google-client-id',
    corsOrigins: ['http://localhost:5173'],
    trustProxy: false,
    bcryptCost: 4,
    rateLimits: { auth: 1000, refresh: 1000 },
    logRequests: false,
  }, overrides);
}

module.exports = { testConfig };
```

- [ ] **Step 6: Write the failing unit tests**

`test/unit/config.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { loadConfig } = require('../../lib/config');

var validEnv = {
  DATABASE_URL: 'sqlserver://localhost;database=Fretwizard',
  JWT_SECRET: 'a'.repeat(32),
  GOOGLE_CLIENT_ID: 'client-id.apps.googleusercontent.com',
  CORS_ORIGINS: 'http://localhost:5173, https://devjhom.github.io',
};

function envWith(overrides) {
  return Object.assign({}, validEnv, overrides);
}

test('loadConfig reads the environment', function () {
  var config = loadConfig(validEnv);
  assert.equal(config.port, '3000');
  assert.equal(config.jwtSecret, 'a'.repeat(32));
  assert.equal(config.googleClientId, 'client-id.apps.googleusercontent.com');
  assert.deepEqual(config.corsOrigins, ['http://localhost:5173', 'https://devjhom.github.io']);
  assert.equal(config.trustProxy, false);
  assert.equal(config.bcryptCost, 12);
  assert.deepEqual(config.rateLimits, { auth: 10, refresh: 60 });
  assert.equal(config.logRequests, true);
});

test('loadConfig names every missing variable', function () {
  assert.throws(function () {
    loadConfig({});
  }, /DATABASE_URL, JWT_SECRET, GOOGLE_CLIENT_ID, CORS_ORIGINS/);
});

test('loadConfig rejects a JWT secret shorter than 32 characters', function () {
  assert.throws(function () {
    loadConfig(envWith({ JWT_SECRET: 'short' }));
  }, /at least 32 characters/);
});

test('loadConfig parses TRUST_PROXY and PORT', function () {
  assert.equal(loadConfig(envWith({ TRUST_PROXY: 'true' })).trustProxy, true);
  assert.equal(loadConfig(envWith({ TRUST_PROXY: '1' })).trustProxy, 1);
  assert.equal(loadConfig(envWith({ TRUST_PROXY: 'loopback' })).trustProxy, 'loopback');
  assert.equal(loadConfig(envWith({ PORT: '4000' })).port, '4000');
});
```

`test/unit/errorHandler.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var express = require('express');
var request = require('supertest');
var { z } = require('zod');
var { AppError } = require('../../lib/errors');
var errorHandler = require('../../middleware/errorHandler');

function appFailingWith(error) {
  var app = express();
  app.get('/', function (req, res, next) {
    next(error);
  });
  app.use(errorHandler);
  return app;
}

function prismaError(code) {
  return Object.assign(new Error('Prisma failure'), { name: 'PrismaClientKnownRequestError', code: code });
}

test('AppError keeps its status, code, message and details', async function () {
  var details = [{ path: 'email', message: 'Taken' }];
  var res = await request(appFailingWith(new AppError(409, 'CONFLICT', 'Taken', details))).get('/');
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: { code: 'CONFLICT', message: 'Taken', details: details } });
});

test('ZodError becomes VALIDATION_ERROR with one detail per field', async function () {
  var result = z.object({ email: z.string() }).safeParse({});
  var res = await request(appFailingWith(result.error)).get('/');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, {
    error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details: [{ path: 'email', message: 'Required' }] },
  });
});

test('Prisma unique-constraint errors become CONFLICT', async function () {
  var res = await request(appFailingWith(prismaError('P2002'))).get('/');
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: { code: 'CONFLICT', message: 'Already exists' } });
});

test('Prisma record-not-found errors become NOT_FOUND', async function () {
  var res = await request(appFailingWith(prismaError('P2025'))).get('/');
  assert.equal(res.status, 404);
  assert.deepEqual(res.body, { error: { code: 'NOT_FOUND', message: 'Not found' } });
});

test('unknown errors become INTERNAL without leaking details', async function (t) {
  t.mock.method(console, 'error', function () {});
  var res = await request(appFailingWith(new Error('secret database detail'))).get('/');
  assert.equal(res.status, 500);
  assert.deepEqual(res.body, { error: { code: 'INTERNAL', message: 'Something went wrong' } });
});
```

`test/unit/app.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var request = require('supertest');
var { createApp } = require('../../app');
var { testConfig } = require('../support/config');

var app = createApp({ prisma: {}, config: testConfig(), googleVerifier: null });

test('GET /health reports ok', async function () {
  var res = await request(app).get('/health');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { ok: true });
});

test('unknown and removed routes return a JSON 404', async function () {
  for (var path of ['/nope', '/users', '/cards', '/fretboards']) {
    var res = await request(app).get(path);
    assert.equal(res.status, 404, path);
    assert.deepEqual(res.body, { error: { code: 'NOT_FOUND', message: 'Not found' } }, path);
  }
});

test('malformed JSON returns VALIDATION_ERROR', async function () {
  var res = await request(app).post('/health').set('Content-Type', 'application/json').send('{"broken"');
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: { code: 'VALIDATION_ERROR', message: 'Malformed JSON body' } });
});

test('bodies over 1 MB return VALIDATION_ERROR', async function () {
  var res = await request(app).post('/health').send({ blob: 'x'.repeat(1024 * 1024 + 1) });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body, { error: { code: 'VALIDATION_ERROR', message: 'Request body too large' } });
});

test('CORS allows configured origins only', async function () {
  var allowed = await request(app).get('/health').set('Origin', 'http://localhost:5173');
  assert.equal(allowed.headers['access-control-allow-origin'], 'http://localhost:5173');
  var blocked = await request(app).get('/health').set('Origin', 'https://evil.example');
  assert.equal(blocked.headers['access-control-allow-origin'], undefined);
});
```

- [ ] **Step 7: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module '../../lib/config'` (and the same for `lib/errors`, `app`).

- [ ] **Step 8: Write the `lib/` modules**

`lib/config.js`:

```js
var REQUIRED = ['DATABASE_URL', 'JWT_SECRET', 'GOOGLE_CLIENT_ID', 'CORS_ORIGINS'];

function parseList(value) {
  return value.split(',').map(function (item) {
    return item.trim();
  }).filter(Boolean);
}

function parseTrustProxy(value) {
  if (!value || value === 'false') return false;
  if (value === 'true') return true;
  var hops = Number(value);
  return Number.isInteger(hops) ? hops : value;
}

function loadConfig(env) {
  env = env || process.env;
  var missing = REQUIRED.filter(function (name) {
    return !env[name];
  });
  if (missing.length) {
    throw new Error('Missing required environment variables: ' + missing.join(', '));
  }
  if (env.JWT_SECRET.length < 32) {
    throw new Error('JWT_SECRET must be at least 32 characters');
  }
  return {
    port: env.PORT || '3000',
    jwtSecret: env.JWT_SECRET,
    googleClientId: env.GOOGLE_CLIENT_ID,
    corsOrigins: parseList(env.CORS_ORIGINS),
    trustProxy: parseTrustProxy(env.TRUST_PROXY),
    bcryptCost: 12,
    rateLimits: { auth: 10, refresh: 60 },
    logRequests: true,
  };
}

module.exports = { loadConfig };
```

`lib/errors.js`:

```js
class AppError extends Error {
  constructor(status, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function notFound(message) {
  return new AppError(404, 'NOT_FOUND', message || 'Not found');
}

function unauthorized(message) {
  return new AppError(401, 'UNAUTHORIZED', message || 'Unauthorized');
}

function conflict(message) {
  return new AppError(409, 'CONFLICT', message);
}

function limitExceeded(message) {
  return new AppError(409, 'LIMIT_EXCEEDED', message);
}

function rateLimited() {
  return new AppError(429, 'RATE_LIMITED', 'Too many requests. Try again in a minute.');
}

module.exports = { AppError, notFound, unauthorized, conflict, limitExceeded, rateLimited };
```

`lib/asyncHandler.js`:

```js
function asyncHandler(handler) {
  return function (req, res, next) {
    Promise.resolve(handler(req, res, next)).catch(next);
  };
}

module.exports = asyncHandler;
```

`lib/prisma.js`:

```js
var { PrismaClient } = require('@prisma/client');

module.exports = new PrismaClient();
```

`lib/swagger.js`:

```js
var path = require('path');
var swaggerJsdoc = require('swagger-jsdoc');

// swagger-jsdoc globs need forward slashes, also on Windows.
var routeFiles = path.join(__dirname, '..', 'routes', '*.js').replace(/\\/g, '/');

module.exports = swaggerJsdoc({
  definition: {
    openapi: '3.0.0',
    info: { title: 'FretWizard API', version: '1.0.0' },
    components: {
      securitySchemes: {
        bearerAuth: { type: 'http', scheme: 'bearer', bearerFormat: 'JWT' },
      },
      schemas: {
        Error: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                code: { type: 'string' },
                message: { type: 'string' },
                details: {
                  type: 'array',
                  items: {
                    type: 'object',
                    properties: { path: { type: 'string' }, message: { type: 'string' } },
                  },
                },
              },
            },
          },
        },
      },
    },
  },
  apis: [routeFiles],
});
```

- [ ] **Step 9: Write the error handler, health route, app and server**

`middleware/errorHandler.js`:

```js
var { ZodError } = require('zod');
var { AppError } = require('../lib/errors');

function sendError(res, status, code, message, details) {
  var body = { error: { code: code, message: message } };
  if (details && details.length) body.error.details = details;
  res.status(status).json(body);
}

function formatIssues(issues) {
  return issues.map(function (issue) {
    return { path: issue.path.join('.'), message: issue.message };
  });
}

function errorHandler(err, req, res, _next) {
  if (err instanceof AppError) return sendError(res, err.status, err.code, err.message, err.details);
  if (err instanceof ZodError) return sendError(res, 400, 'VALIDATION_ERROR', 'Invalid request', formatIssues(err.issues));
  if (err.type === 'entity.parse.failed') return sendError(res, 400, 'VALIDATION_ERROR', 'Malformed JSON body');
  if (err.type === 'entity.too.large') return sendError(res, 400, 'VALIDATION_ERROR', 'Request body too large');
  if (err.name === 'PrismaClientKnownRequestError' && err.code === 'P2002') {
    return sendError(res, 409, 'CONFLICT', 'Already exists');
  }
  if (err.name === 'PrismaClientKnownRequestError' && err.code === 'P2025') {
    return sendError(res, 404, 'NOT_FOUND', 'Not found');
  }
  console.error(err);
  return sendError(res, 500, 'INTERNAL', 'Something went wrong');
}

module.exports = errorHandler;
```

`routes/health.js`:

```js
var express = require('express');

var router = express.Router();

/**
 * @swagger
 * /health:
 *   get:
 *     summary: Liveness check
 *     tags: [Health]
 *     responses:
 *       200: { description: The service is running }
 */
router.get('/', function (req, res) {
  res.json({ ok: true });
});

module.exports = router;
```

`app.js` (replace the whole file):

```js
var express = require('express');
var logger = require('morgan');
var cors = require('cors');
var swaggerUi = require('swagger-ui-express');

var swaggerSpec = require('./lib/swagger');
var { notFound } = require('./lib/errors');
var errorHandler = require('./middleware/errorHandler');
var healthRouter = require('./routes/health');

function createApp(deps) {
  var config = deps.config;
  var app = express();

  app.set('trust proxy', config.trustProxy);
  if (config.logRequests) app.use(logger('dev'));
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use('/health', healthRouter);

  app.use(function (req, res, next) {
    next(notFound());
  });
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
```

`bin/www` (replace the whole file):

```js
#!/usr/bin/env node

require('dotenv').config({ quiet: true });

var http = require('http');
var debug = require('debug')('fretwizard-service:server');
var { loadConfig } = require('../lib/config');
var prisma = require('../lib/prisma');
var { createApp } = require('../app');

var config = loadConfig();
var app = createApp({ prisma: prisma, config: config, googleVerifier: null });

var port = normalizePort(config.port);
app.set('port', port);

var server = http.createServer(app);

server.listen(port);
server.on('error', onError);
server.on('listening', onListening);

function normalizePort(val) {
  var port = parseInt(val, 10);

  if (isNaN(port)) {
    // named pipe
    return val;
  }

  if (port >= 0) {
    // port number
    return port;
  }

  return false;
}

function onError(error) {
  if (error.syscall !== 'listen') {
    throw error;
  }

  var bind = typeof port === 'string'
    ? 'Pipe ' + port
    : 'Port ' + port;

  // handle specific listen errors with friendly messages
  switch (error.code) {
    case 'EACCES':
      console.error(bind + ' requires elevated privileges');
      process.exit(1);
      break;
    case 'EADDRINUSE':
      console.error(bind + ' is already in use');
      process.exit(1);
      break;
    default:
      throw error;
  }
}

function onListening() {
  var addr = server.address();
  var bind = typeof addr === 'string'
    ? 'pipe ' + addr
    : 'port ' + addr.port;
  debug('Listening on ' + bind);
}
```

- [ ] **Step 10: Add `.env.example` and ignore `.env.test`**

`.env.example`:

```
DATABASE_URL="sqlserver://localhost;database=Fretwizard;integratedSecurity=true;trustServerCertificate=true"
JWT_SECRET="replace-with-at-least-32-random-characters"
GOOGLE_CLIENT_ID="your-client-id.apps.googleusercontent.com"
CORS_ORIGINS="http://localhost:5173"
TRUST_PROXY=false
PORT=3000
```

Append to `.gitignore`:

```
.env.test
```

- [ ] **Step 11: Run the tests to verify they pass, then lint**

Run: `npm run test:unit`
Expected: PASS — 14 tests (4 config, 5 errorHandler, 5 app), 0 failures.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 12: Commit**

```bash
git add -A
git commit -m "feat: service skeleton with createApp, JSON errors, CORS and health check" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A2: Database schema, fresh migration and integration-test harness

**Files:**
- Modify (full rewrite): `prisma/schema.prisma`
- Delete: `prisma/migrations/20260422095044_user/`
- Create (generated): `prisma/migrations/20261001000000_init/migration.sql`
- Create: `test/support/env.js`, `test/support/db.js`, `test/setupDatabase.js`, `test/unit/env.test.js`, `test/integration/schema.test.js`, `.env.test.example`
- Modify: `package.json` (scripts)

**Interfaces:**
- Consumes: nothing from A1 beyond the repo layout.
- Produces:
  - Prisma models `User`, `UserLogin`, `RefreshToken`, `LibraryCard`, `CardFretboard`, `WorkspaceFretboard`, `ChordProgression`, `ProgressionChord`, with the field names exactly as in the schema below (client accessors `prisma.user`, `prisma.userLogin`, `prisma.refreshToken`, `prisma.libraryCard`, `prisma.cardFretboard`, `prisma.workspaceFretboard`, `prisma.chordProgression`, `prisma.progressionChord`; compound unique input `Provider_ProviderUserId`).
  - `test/support/env.js` exports `{ assertTestDatabaseUrl(url), loadTestEnv() }`.
  - `test/support/db.js` exports `{ prisma, useDatabase() }`; `useDatabase()` registers a `beforeEach` that deletes all users (everything cascades) and an `after` that disconnects.

- [ ] **Step 1: Replace `prisma/schema.prisma`**

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "sqlserver"
  url      = env("DATABASE_URL")
}

model User {
  UserId       String   @id(map: "PK_User") @default(uuid()) @db.UniqueIdentifier
  Email        String   @unique(map: "UQ_User_Email") @db.NVarChar(255)
  Username     String   @db.NVarChar(100)
  PasswordHash String?  @db.NVarChar(100)
  IsActive     Boolean  @default(true)
  CreatedDate  DateTime @default(now())
  ModifiedDate DateTime @updatedAt

  Logins              UserLogin[]
  RefreshTokens       RefreshToken[]
  LibraryCards        LibraryCard[]
  WorkspaceFretboards WorkspaceFretboard[]
  ChordProgression    ChordProgression?
}

model UserLogin {
  UserLoginId    String   @id(map: "PK_UserLogin") @default(uuid()) @db.UniqueIdentifier
  UserId         String   @db.UniqueIdentifier
  Provider       String   @db.NVarChar(20)
  ProviderUserId String   @db.NVarChar(255)
  CreatedDate    DateTime @default(now())
  User           User     @relation(fields: [UserId], references: [UserId], onDelete: Cascade, map: "FK_UserLogin_User")

  @@unique([Provider, ProviderUserId], map: "UQ_UserLogin_Provider_ProviderUserId")
  @@index([UserId], map: "IX_UserLogin_UserId")
}

model RefreshToken {
  TokenId     String    @id(map: "PK_RefreshToken") @default(uuid()) @db.UniqueIdentifier
  UserId      String    @db.UniqueIdentifier
  TokenHash   String    @unique(map: "UQ_RefreshToken_TokenHash") @db.Char(64)
  FamilyId    String    @db.UniqueIdentifier
  ExpiresAt   DateTime
  RevokedAt   DateTime?
  CreatedDate DateTime  @default(now())
  User        User      @relation(fields: [UserId], references: [UserId], onDelete: Cascade, map: "FK_RefreshToken_User")

  @@index([UserId], map: "IX_RefreshToken_UserId")
  @@index([FamilyId], map: "IX_RefreshToken_FamilyId")
}

model LibraryCard {
  CardId       String   @id(map: "PK_LibraryCard") @default(uuid()) @db.UniqueIdentifier
  UserId       String   @db.UniqueIdentifier
  Name         String   @db.NVarChar(100)
  Setup        String   @db.NVarChar(10)
  CreatedDate  DateTime @default(now())
  ModifiedDate DateTime @updatedAt
  User         User     @relation(fields: [UserId], references: [UserId], onDelete: Cascade, map: "FK_LibraryCard_User")
  Fretboards   CardFretboard[]

  @@index([UserId, CreatedDate], map: "IX_LibraryCard_UserId_CreatedDate")
}

model CardFretboard {
  CardFretboardId String      @id(map: "PK_CardFretboard") @default(uuid()) @db.UniqueIdentifier
  CardId          String      @db.UniqueIdentifier
  Position        Int
  KeyName         String      @db.NVarChar(5)
  Accidental      String      @db.NVarChar(10)
  Tonality        String      @db.NVarChar(10)
  Pattern         String      @db.NVarChar(50)
  FretAmount      Int
  ChordPosition   Int
  ChordView       String?     @db.NVarChar(10)
  ShapeC          Boolean
  ShapeA          Boolean
  ShapeG          Boolean
  ShapeE          Boolean
  ShapeD          Boolean
  StringLowE      Boolean
  StringA         Boolean
  StringD         Boolean
  StringG         Boolean
  StringB         Boolean
  StringHighE     Boolean
  HighlightNotes  String      @db.NVarChar(500)
  Card            LibraryCard @relation(fields: [CardId], references: [CardId], onDelete: Cascade, map: "FK_CardFretboard_LibraryCard")

  @@unique([CardId, Position], map: "UQ_CardFretboard_CardId_Position")
}

model WorkspaceFretboard {
  WorkspaceFretboardId String  @id(map: "PK_WorkspaceFretboard") @default(uuid()) @db.UniqueIdentifier
  UserId               String  @db.UniqueIdentifier
  Setup                String  @db.NVarChar(10)
  Position             Int
  KeyName              String  @db.NVarChar(5)
  Accidental           String  @db.NVarChar(10)
  Tonality             String  @db.NVarChar(10)
  Pattern              String  @db.NVarChar(50)
  FretAmount           Int
  ChordPosition        Int
  ChordView            String? @db.NVarChar(10)
  ShapeC               Boolean
  ShapeA               Boolean
  ShapeG               Boolean
  ShapeE               Boolean
  ShapeD               Boolean
  StringLowE           Boolean
  StringA              Boolean
  StringD              Boolean
  StringG              Boolean
  StringB              Boolean
  StringHighE          Boolean
  HighlightNotes       String  @db.NVarChar(500)
  User                 User    @relation(fields: [UserId], references: [UserId], onDelete: Cascade, map: "FK_WorkspaceFretboard_User")

  @@unique([UserId, Setup, Position], map: "UQ_WorkspaceFretboard_UserId_Setup_Position")
}

model ChordProgression {
  UserId       String             @id(map: "PK_ChordProgression") @db.UniqueIdentifier
  KeyName      String             @db.NVarChar(5)
  Tonality     String             @db.NVarChar(10)
  ModifiedDate DateTime           @updatedAt
  User         User               @relation(fields: [UserId], references: [UserId], onDelete: Cascade, map: "FK_ChordProgression_User")
  Chords       ProgressionChord[]
}

model ProgressionChord {
  ProgressionChordId String           @id(map: "PK_ProgressionChord") @default(uuid()) @db.UniqueIdentifier
  UserId             String           @db.UniqueIdentifier
  Position           Int
  Degree             Int
  Progression        ChordProgression @relation(fields: [UserId], references: [UserId], onDelete: Cascade, map: "FK_ProgressionChord_ChordProgression")

  @@unique([UserId, Position], map: "UQ_ProgressionChord_UserId_Position")
}
```

- [ ] **Step 2: Validate the schema**

Run: `npx prisma validate`
Expected: `The schema at prisma/schema.prisma is valid 🚀`

- [ ] **Step 3: Replace the migration history with one generated `init` migration (Git Bash)**

```bash
git rm -r prisma/migrations/20260422095044_user
mkdir -p prisma/migrations/20261001000000_init
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261001000000_init/migration.sql
grep -c "ON DELETE CASCADE" prisma/migrations/20261001000000_init/migration.sql
```

Expected: the `grep -c` prints `7` (UserLogin, RefreshToken, LibraryCard, CardFretboard, WorkspaceFretboard, ChordProgression, ProgressionChord). Open the file and confirm it starts with `BEGIN TRY` and creates eight tables. `prisma/migrations/migration_lock.toml` stays as it is (`provider = "mssql"`).

- [ ] **Step 4: Generate the Prisma client**

Run: `npx prisma generate`
Expected: `✔ Generated Prisma Client (v5.22.0)`

- [ ] **Step 5: Write the failing unit test for the test-database guard**

`test/unit/env.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { assertTestDatabaseUrl } = require('../support/env');

test('accepts a URL whose database name contains "test"', function () {
  assert.doesNotThrow(function () {
    assertTestDatabaseUrl('sqlserver://localhost;database=Fretwizard_Test;integratedSecurity=true');
  });
});

test('refuses every other database, even on a server called "test"', function () {
  [
    'sqlserver://localhost;database=Fretwizard;integratedSecurity=true',
    'sqlserver://testserver;database=Fretwizard;integratedSecurity=true',
    undefined,
  ].forEach(function (url) {
    assert.throws(function () {
      assertTestDatabaseUrl(url);
    }, /test database/, String(url));
  });
});
```

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module '../support/env'`.

- [ ] **Step 6: Write the test-environment support files**

`test/support/env.js`:

```js
var path = require('path');
var dotenv = require('dotenv');

var ENV_TEST_PATH = path.join(__dirname, '..', '..', '.env.test');

function databaseName(url) {
  var match = /database=([^;]+)/i.exec(url || '');
  return match ? match[1] : '';
}

function assertTestDatabaseUrl(url) {
  if (!/test/i.test(databaseName(url))) {
    throw new Error('Integration tests need .env.test with DATABASE_URL pointing at a test database (for example Fretwizard_Test). Copy .env.test.example.');
  }
}

function loadTestEnv() {
  dotenv.config({ path: ENV_TEST_PATH, override: true, quiet: true });
  assertTestDatabaseUrl(process.env.DATABASE_URL);
}

module.exports = { assertTestDatabaseUrl, loadTestEnv };
```

`test/support/db.js`:

```js
var { beforeEach, after } = require('node:test');
var { loadTestEnv } = require('./env');

loadTestEnv();

var { PrismaClient } = require('@prisma/client');

var prisma = new PrismaClient();

function useDatabase() {
  beforeEach(async function () {
    // Every other table cascades from User.
    await prisma.user.deleteMany();
  });
  after(async function () {
    await prisma.$disconnect();
  });
}

module.exports = { prisma, useDatabase };
```

`test/setupDatabase.js`:

```js
var childProcess = require('child_process');
var { loadTestEnv } = require('./support/env');

try {
  loadTestEnv();
} catch (err) {
  console.error(err.message);
  process.exit(1);
}

childProcess.execSync('npx prisma migrate reset --force --skip-seed --skip-generate', {
  stdio: 'inherit',
  env: process.env,
});
```

`.env.test.example`:

```
DATABASE_URL="sqlserver://localhost;database=Fretwizard_Test;integratedSecurity=true;trustServerCertificate=true"
```

- [ ] **Step 7: Add the integration scripts to `package.json`**

Replace the three test scripts with:

```json
    "test": "npm run test:unit && npm run test:integration",
    "test:unit": "node --test \"test/unit/**/*.test.js\"",
    "test:integration": "node test/setupDatabase.js && node --test --test-concurrency=1 \"test/integration/**/*.test.js\"",
```

Run: `npm run test:unit`
Expected: PASS — 16 tests.

- [ ] **Step 8: Create `.env.test`**

Copy `.env.test.example` to `.env.test` and set `DATABASE_URL` to the owner's `Fretwizard_Test` connection string. If the owner hasn't provided it yet, stop here and ask for it.

- [ ] **Step 9: Write the schema smoke test**

`test/integration/schema.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');

useDatabase();

var fretboardColumns = {
  Position: 0,
  KeyName: 'F♯',
  Accidental: 'sharp',
  Tonality: 'Minor',
  Pattern: 'Triad',
  FretAmount: 22,
  ChordPosition: 2,
  ChordView: 'fingering',
  ShapeC: false,
  ShapeA: true,
  ShapeG: false,
  ShapeE: false,
  ShapeD: false,
  StringLowE: true,
  StringA: true,
  StringD: false,
  StringG: true,
  StringB: true,
  StringHighE: false,
  HighlightNotes: '["roots","minor thirds","fifths"]',
};

function createUserWithEverything() {
  return prisma.user.create({
    data: {
      Email: 'jo@example.com',
      Username: 'Jo',
      Logins: { create: { Provider: 'google', ProviderUserId: 'google-sub-1' } },
      RefreshTokens: {
        create: {
          TokenHash: 'a'.repeat(64),
          FamilyId: '00000000-0000-4000-8000-000000000001',
          ExpiresAt: new Date(Date.now() + 60 * 1000),
        },
      },
      LibraryCards: { create: { Name: 'Card 1', Setup: 'Chord', Fretboards: { create: [fretboardColumns] } } },
      WorkspaceFretboards: { create: [Object.assign({ Setup: 'Scale' }, fretboardColumns)] },
      ChordProgression: { create: { KeyName: 'F♯', Tonality: 'Minor', Chords: { create: [{ Position: 0, Degree: 3 }] } } },
    },
  });
}

test('stores Unicode note names and low/high E strings unchanged', async function () {
  var user = await createUserWithEverything();
  var workspaceRow = await prisma.workspaceFretboard.findFirst({ where: { UserId: user.UserId } });
  assert.equal(workspaceRow.KeyName, 'F♯');
  assert.equal(workspaceRow.StringLowE, true);
  assert.equal(workspaceRow.StringHighE, false);
  var card = await prisma.libraryCard.findFirst({ where: { UserId: user.UserId }, include: { Fretboards: true } });
  assert.equal(card.Fretboards[0].KeyName, 'F♯');
  var progression = await prisma.chordProgression.findUnique({ where: { UserId: user.UserId } });
  assert.equal(progression.KeyName, 'F♯');
});

test('deleting a user removes everything that belongs to them', async function () {
  var user = await createUserWithEverything();
  await prisma.user.delete({ where: { UserId: user.UserId } });
  var counts = await Promise.all([
    prisma.userLogin.count(),
    prisma.refreshToken.count(),
    prisma.libraryCard.count(),
    prisma.cardFretboard.count(),
    prisma.workspaceFretboard.count(),
    prisma.chordProgression.count(),
    prisma.progressionChord.count(),
  ]);
  assert.deepEqual(counts, [0, 0, 0, 0, 0, 0, 0]);
});
```

- [ ] **Step 10: Run the integration tests**

Run: `npm run test:integration`
Expected: Prisma prints `Database reset successful` and applies `20261001000000_init`; then PASS — 2 tests.

- [ ] **Step 11: Reset the dev database (only if `.env` exists)**

The owner approved discarding dev data (spec D5). If `.env` exists:

Run: `npx prisma migrate reset --force --skip-seed`
Expected: the dev database `Fretwizard` is dropped and recreated with `20261001000000_init`. If `.env` doesn't exist yet, skip this step and note it for Task B5.

- [ ] **Step 12: Lint and commit**

Run: `npm run lint`
Expected: no errors.

```bash
git add -A
git commit -m "feat: normalised schema, fresh init migration and integration-test harness" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A3: Email sign-up, login, access tokens and `/me`

**Files:**
- Create: `validation/auth.js`, `middleware/validate.js`, `middleware/rateLimits.js`, `middleware/requireAuth.js`, `services/tokens.js`, `services/users.js`, `routes/auth.js`, `routes/me.js`, `test/support/app.js`, `test/integration/auth-email.test.js`, `test/integration/me.test.js`
- Modify (full rewrite): `app.js`
- Modify: `package.json` (dependency via npm)

**Interfaces:**
- Consumes: `createApp`, `AppError` helpers, `asyncHandler`, `testConfig` (A1); `prisma`, `useDatabase` (A2).
- Produces:
  - `services/tokens.js`: `REFRESH_TOKEN_TTL_MS` (number), `hashToken(token) → string`, `signAccessToken(config, userId) → string`, `verifyAccessToken(config, token) → userId` (throws if invalid), `issueTokens(db, config, userId) → Promise<{ accessToken, refreshToken }>` (new family; deletes this user's expired tokens first).
  - `services/users.js`: `toUserResponse(userRow) → { id, email, username }`, `createWithPassword(db, config, { username, email, password }) → Promise<userRow>`, `verifyPassword(db, config, { email, password }) → Promise<userRow>`, `findById(db, userId) → Promise<userRow | null>`, `updateUsername(db, userId, username) → Promise<userRow>`.
  - `middleware/validate.js`: `validate({ body })` replaces `req.body` with the parsed value.
  - `middleware/rateLimits.js`: `createRateLimit(limitPerMinute)`.
  - `middleware/requireAuth.js`: `createRequireAuth(config)` → middleware that sets `req.userId`.
  - Router factories take `deps = { prisma, config, googleVerifier }`: `createAuthRouter(deps)`, `createMeRouter(deps)`.
  - `test/support/app.js`: `request` (supertest), `buildApp(options?)` where `options = { config?: Partial<Config>, googleVerifier? }`, `fakeGoogleVerifier(identities)`, `signUp(app, overrides?) → Promise<authResponseBody>` (defaults: username `Jo`, email `jo@example.com`, password `correct-horse-battery`), `bearer(session) → 'Bearer <accessToken>'`.

- [ ] **Step 1: Install the rate limiter**

```bash
npm install express-rate-limit@^7.5.0
```

- [ ] **Step 2: Write the test app helper**

`test/support/app.js`:

```js
var assert = require('node:assert/strict');
var request = require('supertest');
var { createApp } = require('../../app');
var { prisma } = require('./db');
var { testConfig } = require('./config');

function fakeGoogleVerifier(identities) {
  return {
    verify: async function (idToken) {
      if (!Object.prototype.hasOwnProperty.call(identities, idToken)) {
        throw new Error('Invalid Google ID token');
      }
      return identities[idToken];
    },
  };
}

function buildApp(options) {
  options = options || {};
  return createApp({
    prisma: prisma,
    config: testConfig(options.config),
    googleVerifier: options.googleVerifier || fakeGoogleVerifier({}),
  });
}

async function signUp(app, overrides) {
  var body = Object.assign({ username: 'Jo', email: 'jo@example.com', password: 'correct-horse-battery' }, overrides);
  var res = await request(app).post('/auth/signup').send(body);
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body;
}

function bearer(session) {
  return 'Bearer ' + session.accessToken;
}

module.exports = { request, buildApp, fakeGoogleVerifier, signUp, bearer };
```

- [ ] **Step 3: Write the failing integration tests**

`test/integration/auth-email.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, signUp } = require('../support/app');
var { hashToken, REFRESH_TOKEN_TTL_MS } = require('../../services/tokens');

useDatabase();
var app = buildApp();

function login(body) {
  return request(app).post('/auth/login').send(body);
}

test('sign-up creates the account and returns tokens', async function () {
  var body = await signUp(app, { username: '  Jo  ', email: '  Jo@Example.COM ' });
  assert.equal(typeof body.accessToken, 'string');
  assert.equal(typeof body.refreshToken, 'string');
  assert.deepEqual(Object.keys(body.user).sort(), ['email', 'id', 'username']);
  assert.equal(body.user.email, 'jo@example.com');
  assert.equal(body.user.username, 'Jo');
  assert.equal('isNewUser' in body, false);

  var user = await prisma.user.findUnique({ where: { UserId: body.user.id } });
  assert.match(user.PasswordHash, /^\$2b\$/);
});

test('refresh tokens are stored only as a SHA-256 hash with a 7-day expiry', async function () {
  var body = await signUp(app);
  var stored = await prisma.refreshToken.findMany({ where: { UserId: body.user.id } });
  assert.equal(stored.length, 1);
  assert.equal(stored[0].TokenHash, hashToken(body.refreshToken));
  assert.notEqual(stored[0].TokenHash, body.refreshToken);
  assert.equal(stored[0].RevokedAt, null);
  assert.ok(Math.abs(stored[0].ExpiresAt.getTime() - (Date.now() + REFRESH_TOKEN_TTL_MS)) < 60 * 1000);
});

test('sign-up refuses an email that already has an account, in any letter case', async function () {
  await signUp(app, { email: 'jo@example.com' });
  var res = await request(app).post('/auth/signup').send({ username: 'Other', email: 'JO@example.com', password: 'another-password' });
  assert.equal(res.status, 409);
  assert.deepEqual(res.body, { error: { code: 'CONFLICT', message: 'An account with this email already exists' } });
});

test('sign-up validates every field', async function () {
  var res = await request(app).post('/auth/signup').send({ username: ' ', email: 'not-an-email', password: 'short' });
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
  assert.deepEqual(res.body.error.details.map(function (detail) {
    return detail.path;
  }).sort(), ['email', 'password', 'username']);
});

test('sign-up rejects passwords longer than 72 bytes', async function () {
  // 37 characters but 74 bytes in UTF-8.
  var res = await request(app).post('/auth/signup').send({ username: 'Jo', email: 'jo@example.com', password: 'é'.repeat(37) });
  assert.equal(res.status, 400);
  assert.deepEqual(res.body.error.details, [{ path: 'password', message: 'Password must be at most 72 bytes' }]);
});

test('login returns tokens for the right password, ignoring email case and spaces', async function () {
  var session = await signUp(app);
  var res = await login({ email: '  JO@example.com ', password: 'correct-horse-battery' });
  assert.equal(res.status, 200);
  assert.equal(res.body.user.id, session.user.id);
  assert.equal(typeof res.body.accessToken, 'string');
  assert.notEqual(res.body.refreshToken, session.refreshToken);
});

test('wrong password, unknown email and Google-only accounts all get the same 401', async function () {
  await signUp(app, { email: 'jo@example.com' });
  await prisma.user.create({ data: { Email: 'google@example.com', Username: 'G', PasswordHash: null } });
  var attempts = [
    { email: 'jo@example.com', password: 'wrong-password' },
    { email: 'nobody@example.com', password: 'whatever-password' },
    { email: 'google@example.com', password: 'whatever-password' },
  ];
  for (var attempt of attempts) {
    var res = await login(attempt);
    assert.equal(res.status, 401, attempt.email);
    assert.deepEqual(res.body, { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } });
  }
});

test('deactivated users cannot log in', async function () {
  var session = await signUp(app);
  await prisma.user.update({ where: { UserId: session.user.id }, data: { IsActive: false } });
  var res = await login({ email: 'jo@example.com', password: 'correct-horse-battery' });
  assert.equal(res.status, 401);
});

test('login deletes the user\'s expired refresh tokens', async function () {
  var session = await signUp(app);
  await prisma.refreshToken.create({
    data: {
      UserId: session.user.id,
      TokenHash: 'b'.repeat(64),
      FamilyId: '00000000-0000-4000-8000-000000000002',
      ExpiresAt: new Date(Date.now() - 1000),
    },
  });
  var res = await login({ email: 'jo@example.com', password: 'correct-horse-battery' });
  assert.equal(res.status, 200);
  assert.equal(await prisma.refreshToken.count({ where: { TokenHash: 'b'.repeat(64) } }), 0);
  assert.equal(await prisma.refreshToken.count({ where: { UserId: session.user.id } }), 2);
});

test('auth endpoints are rate limited per IP', async function () {
  var limited = buildApp({ config: { rateLimits: { auth: 2, refresh: 1000 } } });
  var body = { email: 'nobody@example.com', password: 'whatever-password' };
  await request(limited).post('/auth/login').send(body).expect(401);
  await request(limited).post('/auth/login').send(body).expect(401);
  var res = await request(limited).post('/auth/login').send(body);
  assert.equal(res.status, 429);
  assert.deepEqual(res.body, { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' } });
});
```

`test/integration/me.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var jwt = require('jsonwebtoken');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, signUp, bearer } = require('../support/app');
var { testConfig } = require('../support/config');

useDatabase();
var app = buildApp();

test('GET /me returns the signed-in user', async function () {
  var session = await signUp(app);
  var res = await request(app).get('/me').set('Authorization', bearer(session));
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, session.user);
});

test('requests without a valid access token get 401', async function () {
  var session = await signUp(app);
  var secret = testConfig().jwtSecret;
  var headers = [
    null,
    'Bearer not-a-jwt',
    'Token ' + session.accessToken,
    'Bearer ' + jwt.sign({ sub: session.user.id }, 'another-secret-that-is-also-32-characters'),
    'Bearer ' + jwt.sign({ sub: session.user.id, exp: Math.floor(Date.now() / 1000) - 10 }, secret),
    'Bearer ' + jwt.sign({ userId: session.user.id }, secret),
  ];
  for (var header of headers) {
    var pending = request(app).get('/me');
    if (header) pending = pending.set('Authorization', header);
    var res = await pending;
    assert.equal(res.status, 401, String(header));
    assert.equal(res.body.error.code, 'UNAUTHORIZED', String(header));
  }
});

test('GET /me refuses a deactivated user', async function () {
  var session = await signUp(app);
  await prisma.user.update({ where: { UserId: session.user.id }, data: { IsActive: false } });
  var res = await request(app).get('/me').set('Authorization', bearer(session));
  assert.equal(res.status, 401);
});

test('PATCH /me changes the display name', async function () {
  var session = await signUp(app);
  var res = await request(app).patch('/me').set('Authorization', bearer(session)).send({ username: '  Jordan  ' });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { id: session.user.id, email: 'jo@example.com', username: 'Jordan' });
  var user = await prisma.user.findUnique({ where: { UserId: session.user.id } });
  assert.equal(user.Username, 'Jordan');
});

test('PATCH /me validates the display name', async function () {
  var session = await signUp(app);
  for (var username of ['', '   ', 'x'.repeat(101)]) {
    var res = await request(app).patch('/me').set('Authorization', bearer(session)).send({ username: username });
    assert.equal(res.status, 400, JSON.stringify(username));
    assert.equal(res.body.error.details[0].path, 'username');
  }
});
```

- [ ] **Step 4: Run the tests to verify they fail**

Run: `npm run test:integration`
Expected: FAIL. The auth tests fail with `Cannot find module '../../services/tokens'`; the `/me` tests get `404` instead of `200`/`401`.

- [ ] **Step 5: Write validation and middleware**

`validation/auth.js`:

```js
var { z } = require('zod');

var email = z.string()
  .trim()
  .toLowerCase()
  .max(255, 'Email must be at most 255 characters')
  .email('Enter a valid email address');

var username = z.string()
  .trim()
  .min(1, 'Enter a display name')
  .max(100, 'Display name must be at most 100 characters');

var newPassword = z.string()
  .min(8, 'Password must be at least 8 characters')
  .refine(function (value) {
    return Buffer.byteLength(value, 'utf8') <= 72;
  }, 'Password must be at most 72 bytes');

var signupSchema = z.object({ username: username, email: email, password: newPassword });
var loginSchema = z.object({ email: email, password: z.string().min(1, 'Enter your password') });
var googleSchema = z.object({ idToken: z.string().min(1, 'idToken is required') });
var refreshSchema = z.object({ refreshToken: z.string().min(1, 'refreshToken is required') });
var updateMeSchema = z.object({ username: username });

module.exports = { signupSchema, loginSchema, googleSchema, refreshSchema, updateMeSchema };
```

`middleware/validate.js`:

```js
function validate(schemas) {
  return function (req, res, next) {
    try {
      if (schemas.body) req.body = schemas.body.parse(req.body);
      next();
    } catch (err) {
      next(err);
    }
  };
}

module.exports = validate;
```

`middleware/rateLimits.js`:

```js
var { rateLimit } = require('express-rate-limit');
var { rateLimited } = require('../lib/errors');

function createRateLimit(limitPerMinute) {
  return rateLimit({
    windowMs: 60 * 1000,
    limit: limitPerMinute,
    standardHeaders: 'draft-7',
    legacyHeaders: false,
    handler: function (req, res, next) {
      next(rateLimited());
    },
  });
}

module.exports = createRateLimit;
```

`middleware/requireAuth.js`:

```js
var { verifyAccessToken } = require('../services/tokens');
var { unauthorized } = require('../lib/errors');

function createRequireAuth(config) {
  return function requireAuth(req, res, next) {
    var match = /^Bearer (\S+)$/.exec(req.headers.authorization || '');
    if (!match) return next(unauthorized('Access token required'));
    try {
      req.userId = verifyAccessToken(config, match[1]);
    } catch (_err) {
      return next(unauthorized('Invalid or expired access token'));
    }
    next();
  };
}

module.exports = createRequireAuth;
```

- [ ] **Step 6: Write the token and user services**

`services/tokens.js`:

```js
var crypto = require('crypto');
var jwt = require('jsonwebtoken');

var ACCESS_TOKEN_TTL = '15m';
var REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(config, userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL });
}

function verifyAccessToken(config, token) {
  var payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  if (typeof payload.sub !== 'string') throw new Error('Access token has no subject');
  return payload.sub;
}

async function createRefreshToken(db, userId, familyId) {
  var token = crypto.randomBytes(32).toString('base64url');
  await db.refreshToken.create({
    data: {
      UserId: userId,
      TokenHash: hashToken(token),
      FamilyId: familyId,
      ExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return token;
}

async function issueTokens(db, config, userId) {
  await db.refreshToken.deleteMany({ where: { UserId: userId, ExpiresAt: { lt: new Date() } } });
  var refreshToken = await createRefreshToken(db, userId, crypto.randomUUID());
  return { accessToken: signAccessToken(config, userId), refreshToken: refreshToken };
}

module.exports = { REFRESH_TOKEN_TTL_MS, hashToken, signAccessToken, verifyAccessToken, issueTokens };
```

`services/users.js`:

```js
var bcrypt = require('bcrypt');
var { conflict, unauthorized } = require('../lib/errors');

var DUMMY_PASSWORD = 'fretwizard-dummy-password';
var dummyHashes = {};

function toUserResponse(user) {
  return { id: user.UserId, email: user.Email, username: user.Username };
}

// Comparing against a real hash when the account can't use a password keeps the
// response time the same, so it doesn't reveal which emails have accounts.
function dummyHash(cost) {
  if (!dummyHashes[cost]) dummyHashes[cost] = bcrypt.hashSync(DUMMY_PASSWORD, cost);
  return dummyHashes[cost];
}

async function createWithPassword(db, config, input) {
  var existing = await db.user.findUnique({ where: { Email: input.email } });
  if (existing) throw conflict('An account with this email already exists');
  var passwordHash = await bcrypt.hash(input.password, config.bcryptCost);
  return db.user.create({ data: { Email: input.email, Username: input.username, PasswordHash: passwordHash } });
}

async function verifyPassword(db, config, input) {
  var user = await db.user.findUnique({ where: { Email: input.email } });
  var canUsePassword = Boolean(user && user.IsActive && user.PasswordHash);
  var matches = await bcrypt.compare(input.password, canUsePassword ? user.PasswordHash : dummyHash(config.bcryptCost));
  if (!canUsePassword || !matches) throw unauthorized('Invalid email or password');
  return user;
}

function findById(db, userId) {
  return db.user.findUnique({ where: { UserId: userId } });
}

function updateUsername(db, userId, username) {
  return db.user.update({ where: { UserId: userId }, data: { Username: username } });
}

module.exports = { toUserResponse, createWithPassword, verifyPassword, findById, updateUsername };
```

- [ ] **Step 7: Write the routers**

`routes/auth.js`:

```js
var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var createRateLimit = require('../middleware/rateLimits');
var users = require('../services/users');
var tokens = require('../services/tokens');
var { signupSchema, loginSchema } = require('../validation/auth');

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         email: { type: string, format: email }
 *         username: { type: string }
 *     TokenPair:
 *       type: object
 *       properties:
 *         accessToken: { type: string }
 *         refreshToken: { type: string }
 *     AuthResponse:
 *       type: object
 *       properties:
 *         accessToken: { type: string }
 *         refreshToken: { type: string }
 *         user: { $ref: '#/components/schemas/User' }
 *         isNewUser: { type: boolean, description: Only returned by /auth/google }
 */

function createAuthRouter(deps) {
  var prisma = deps.prisma;
  var config = deps.config;
  var router = express.Router();

  function authResponse(issued, user, extra) {
    return Object.assign({
      accessToken: issued.accessToken,
      refreshToken: issued.refreshToken,
      user: users.toUserResponse(user),
    }, extra);
  }

  /**
   * @swagger
   * /auth/signup:
   *   post:
   *     summary: Create an account with email and password
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [username, email, password]
   *             properties:
   *               username: { type: string, maxLength: 100 }
   *               email: { type: string, format: email }
   *               password: { type: string, minLength: 8 }
   *     responses:
   *       201: { description: Account created, content: { application/json: { schema: { $ref: '#/components/schemas/AuthResponse' } } } }
   *       400: { description: Validation error }
   *       409: { description: Email already registered }
   *       429: { description: Rate limited }
   */
  router.post('/signup', createRateLimit(config.rateLimits.auth), validate({ body: signupSchema }), asyncHandler(async function (req, res) {
    var user = await users.createWithPassword(prisma, config, req.body);
    var issued = await tokens.issueTokens(prisma, config, user.UserId);
    res.status(201).json(authResponse(issued, user));
  }));

  /**
   * @swagger
   * /auth/login:
   *   post:
   *     summary: Log in with email and password
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [email, password]
   *             properties:
   *               email: { type: string, format: email }
   *               password: { type: string }
   *     responses:
   *       200: { description: Logged in, content: { application/json: { schema: { $ref: '#/components/schemas/AuthResponse' } } } }
   *       401: { description: Invalid email or password }
   *       429: { description: Rate limited }
   */
  router.post('/login', createRateLimit(config.rateLimits.auth), validate({ body: loginSchema }), asyncHandler(async function (req, res) {
    var user = await users.verifyPassword(prisma, config, req.body);
    var issued = await tokens.issueTokens(prisma, config, user.UserId);
    res.json(authResponse(issued, user));
  }));

  return router;
}

module.exports = createAuthRouter;
```

`routes/me.js`:

```js
var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var users = require('../services/users');
var { unauthorized } = require('../lib/errors');
var { updateMeSchema } = require('../validation/auth');

function createMeRouter(deps) {
  var prisma = deps.prisma;
  var router = express.Router();

  /**
   * @swagger
   * /me:
   *   get:
   *     summary: The signed-in user
   *     tags: [Me]
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: The user, content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } }
   *       401: { description: Missing or invalid access token }
   *   patch:
   *     summary: Change the display name
   *     tags: [Me]
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [username]
   *             properties:
   *               username: { type: string, maxLength: 100 }
   *     responses:
   *       200: { description: The updated user, content: { application/json: { schema: { $ref: '#/components/schemas/User' } } } }
   *       400: { description: Validation error }
   */
  router.get('/', asyncHandler(async function (req, res) {
    var user = await users.findById(prisma, req.userId);
    if (!user || !user.IsActive) throw unauthorized('User not found');
    res.json(users.toUserResponse(user));
  }));

  router.patch('/', validate({ body: updateMeSchema }), asyncHandler(async function (req, res) {
    var user = await users.updateUsername(prisma, req.userId, req.body.username);
    res.json(users.toUserResponse(user));
  }));

  return router;
}

module.exports = createMeRouter;
```

- [ ] **Step 8: Mount the routers — replace `app.js`**

```js
var express = require('express');
var logger = require('morgan');
var cors = require('cors');
var swaggerUi = require('swagger-ui-express');

var swaggerSpec = require('./lib/swagger');
var { notFound } = require('./lib/errors');
var errorHandler = require('./middleware/errorHandler');
var createRequireAuth = require('./middleware/requireAuth');
var healthRouter = require('./routes/health');
var createAuthRouter = require('./routes/auth');
var createMeRouter = require('./routes/me');

function createApp(deps) {
  var config = deps.config;
  var requireAuth = createRequireAuth(config);
  var app = express();

  app.set('trust proxy', config.trustProxy);
  if (config.logRequests) app.use(logger('dev'));
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use('/health', healthRouter);
  app.use('/auth', createAuthRouter(deps));
  app.use('/me', requireAuth, createMeRouter(deps));

  app.use(function (req, res, next) {
    next(notFound());
  });
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 9: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — unit 16, integration 2 + 10 (auth-email) + 5 (me) = 17.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 10: Commit**

```bash
git add -A
git commit -m "feat: email sign-up and login with JWT access tokens and /me" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A4: Refresh-token rotation, reuse detection and logout

**Files:**
- Modify (full rewrite): `services/tokens.js`
- Modify: `routes/auth.js` (two routes and one import)
- Create: `test/integration/auth-refresh.test.js`

**Interfaces:**
- Consumes: everything from A3.
- Produces (added to `services/tokens.js`): `revokeFamily(db, familyId)`, `revokeAllForUser(db, userId)`, `rotateRefreshToken(prisma, config, token) → Promise<{ accessToken, refreshToken }>` (throws `unauthorized` on unknown, reused, expired or disabled), `revokeByToken(db, token)`.

- [ ] **Step 1: Write the failing tests**

`test/integration/auth-refresh.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, signUp } = require('../support/app');
var { hashToken, REFRESH_TOKEN_TTL_MS } = require('../../services/tokens');

useDatabase();
var app = buildApp();

function refresh(token) {
  return request(app).post('/auth/refresh').send({ refreshToken: token });
}

function findToken(token) {
  return prisma.refreshToken.findUnique({ where: { TokenHash: hashToken(token) } });
}

test('refresh rotates the token pair within the same family', async function () {
  var session = await signUp(app);
  var res = await refresh(session.refreshToken);
  assert.equal(res.status, 200);
  assert.deepEqual(Object.keys(res.body).sort(), ['accessToken', 'refreshToken']);
  assert.notEqual(res.body.refreshToken, session.refreshToken);

  var old = await findToken(session.refreshToken);
  var fresh = await findToken(res.body.refreshToken);
  assert.ok(old.RevokedAt instanceof Date);
  assert.equal(fresh.FamilyId, old.FamilyId);
  assert.equal(fresh.RevokedAt, null);
  assert.ok(Math.abs(fresh.ExpiresAt.getTime() - (Date.now() + REFRESH_TOKEN_TTL_MS)) < 60 * 1000);

  await request(app).get('/me').set('Authorization', 'Bearer ' + res.body.accessToken).expect(200);
});

test('reusing a rotated token revokes the whole family', async function () {
  var session = await signUp(app);
  var first = await refresh(session.refreshToken);
  assert.equal(first.status, 200);

  var reuse = await refresh(session.refreshToken);
  assert.equal(reuse.status, 401);
  assert.equal(reuse.body.error.code, 'UNAUTHORIZED');

  var afterReuse = await refresh(first.body.refreshToken);
  assert.equal(afterReuse.status, 401);
});

test('revoking one family leaves the user\'s other sessions working', async function () {
  var session = await signUp(app);
  var otherLogin = await request(app).post('/auth/login').send({ email: 'jo@example.com', password: 'correct-horse-battery' });
  await refresh(session.refreshToken);
  await refresh(session.refreshToken);

  var other = await refresh(otherLogin.body.refreshToken);
  assert.equal(other.status, 200);
});

test('expired refresh tokens are rejected', async function () {
  var session = await signUp(app);
  await prisma.refreshToken.updateMany({ where: { UserId: session.user.id }, data: { ExpiresAt: new Date(Date.now() - 1000) } });
  var res = await refresh(session.refreshToken);
  assert.equal(res.status, 401);
});

test('unknown refresh tokens are rejected', async function () {
  var res = await refresh('not-a-real-token');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('deactivated users cannot refresh, and their family is revoked', async function () {
  var session = await signUp(app);
  await prisma.user.update({ where: { UserId: session.user.id }, data: { IsActive: false } });
  var res = await refresh(session.refreshToken);
  assert.equal(res.status, 401);
  var stored = await findToken(session.refreshToken);
  assert.ok(stored.RevokedAt instanceof Date);
});

test('logout revokes the family and always answers 204', async function () {
  var session = await signUp(app);
  await request(app).post('/auth/logout').send({ refreshToken: session.refreshToken }).expect(204);
  assert.equal((await refresh(session.refreshToken)).status, 401);

  await request(app).post('/auth/logout').send({ refreshToken: 'unknown-token' }).expect(204);

  var missing = await request(app).post('/auth/logout').send({});
  assert.equal(missing.status, 400);
});

test('refresh is rate limited per IP', async function () {
  var limited = buildApp({ config: { rateLimits: { auth: 1000, refresh: 1 } } });
  await request(limited).post('/auth/refresh').send({ refreshToken: 'x' }).expect(401);
  var res = await request(limited).post('/auth/refresh').send({ refreshToken: 'x' });
  assert.equal(res.status, 429);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:integration`
Expected: FAIL — `auth-refresh.test.js` gets `404` from `/auth/refresh` and `/auth/logout`.

- [ ] **Step 3: Replace `services/tokens.js`**

```js
var crypto = require('crypto');
var jwt = require('jsonwebtoken');
var { unauthorized } = require('../lib/errors');

var ACCESS_TOKEN_TTL = '15m';
var REFRESH_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000;

function hashToken(token) {
  return crypto.createHash('sha256').update(token).digest('hex');
}

function signAccessToken(config, userId) {
  return jwt.sign({ sub: userId }, config.jwtSecret, { algorithm: 'HS256', expiresIn: ACCESS_TOKEN_TTL });
}

function verifyAccessToken(config, token) {
  var payload = jwt.verify(token, config.jwtSecret, { algorithms: ['HS256'] });
  if (typeof payload.sub !== 'string') throw new Error('Access token has no subject');
  return payload.sub;
}

async function createRefreshToken(db, userId, familyId) {
  var token = crypto.randomBytes(32).toString('base64url');
  await db.refreshToken.create({
    data: {
      UserId: userId,
      TokenHash: hashToken(token),
      FamilyId: familyId,
      ExpiresAt: new Date(Date.now() + REFRESH_TOKEN_TTL_MS),
    },
  });
  return token;
}

async function issueTokens(db, config, userId) {
  await db.refreshToken.deleteMany({ where: { UserId: userId, ExpiresAt: { lt: new Date() } } });
  var refreshToken = await createRefreshToken(db, userId, crypto.randomUUID());
  return { accessToken: signAccessToken(config, userId), refreshToken: refreshToken };
}

async function revokeFamily(db, familyId) {
  await db.refreshToken.updateMany({ where: { FamilyId: familyId, RevokedAt: null }, data: { RevokedAt: new Date() } });
}

async function revokeAllForUser(db, userId) {
  await db.refreshToken.updateMany({ where: { UserId: userId, RevokedAt: null }, data: { RevokedAt: new Date() } });
}

async function rotateRefreshToken(prisma, config, token) {
  var stored = await prisma.refreshToken.findUnique({ where: { TokenHash: hashToken(token) }, include: { User: true } });
  if (!stored) throw unauthorized('Invalid refresh token');
  if (stored.RevokedAt) {
    // A revoked token coming back means it was copied: end every session descended from that login.
    await revokeFamily(prisma, stored.FamilyId);
    throw unauthorized('Refresh token was already used');
  }
  if (stored.ExpiresAt.getTime() <= Date.now()) throw unauthorized('Refresh token expired');
  if (!stored.User.IsActive) {
    await revokeFamily(prisma, stored.FamilyId);
    throw unauthorized('Account is disabled');
  }

  var refreshToken = await prisma.$transaction(async function (tx) {
    var revoked = await tx.refreshToken.updateMany({
      where: { TokenId: stored.TokenId, RevokedAt: null },
      data: { RevokedAt: new Date() },
    });
    if (revoked.count === 0) return null;
    return createRefreshToken(tx, stored.UserId, stored.FamilyId);
  });
  if (!refreshToken) {
    // Another request rotated this token between our read and our write.
    await revokeFamily(prisma, stored.FamilyId);
    throw unauthorized('Refresh token was already used');
  }
  return { accessToken: signAccessToken(config, stored.UserId), refreshToken: refreshToken };
}

async function revokeByToken(db, token) {
  var stored = await db.refreshToken.findUnique({ where: { TokenHash: hashToken(token) } });
  if (stored) await revokeFamily(db, stored.FamilyId);
}

module.exports = {
  REFRESH_TOKEN_TTL_MS,
  hashToken,
  signAccessToken,
  verifyAccessToken,
  issueTokens,
  revokeFamily,
  revokeAllForUser,
  rotateRefreshToken,
  revokeByToken,
};
```

- [ ] **Step 4: Add `/auth/refresh` and `/auth/logout` to `routes/auth.js`**

Change the validation import line to:

```js
var { signupSchema, loginSchema, refreshSchema } = require('../validation/auth');
```

Insert directly above `  return router;`:

```js
  /**
   * @swagger
   * /auth/refresh:
   *   post:
   *     summary: Exchange a refresh token for a new token pair
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [refreshToken]
   *             properties:
   *               refreshToken: { type: string }
   *     responses:
   *       200: { description: New token pair, content: { application/json: { schema: { $ref: '#/components/schemas/TokenPair' } } } }
   *       401: { description: Unknown or reused or expired token or disabled account }
   *       429: { description: Rate limited }
   */
  router.post('/refresh', createRateLimit(config.rateLimits.refresh), validate({ body: refreshSchema }), asyncHandler(async function (req, res) {
    res.json(await tokens.rotateRefreshToken(prisma, config, req.body.refreshToken));
  }));

  /**
   * @swagger
   * /auth/logout:
   *   post:
   *     summary: Revoke the refresh token's whole family
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [refreshToken]
   *             properties:
   *               refreshToken: { type: string }
   *     responses:
   *       204: { description: Logged out (also for unknown tokens) }
   *       400: { description: refreshToken missing }
   */
  router.post('/logout', validate({ body: refreshSchema }), asyncHandler(async function (req, res) {
    await tokens.revokeByToken(prisma, req.body.refreshToken);
    res.status(204).end();
  }));

```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — unit 16, integration 25 (2 + 10 + 5 + 8).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: refresh-token rotation with reuse detection and logout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A5: Google sign-in

**Files:**
- Create: `services/google.js`, `test/integration/auth-google.test.js`
- Modify (full rewrite): `services/users.js`
- Modify: `routes/auth.js` (one route and imports), `bin/www` (real verifier)
- Modify: `package.json` (dependency via npm)

**Interfaces:**
- Consumes: `tokens.revokeAllForUser`, `tokens.issueTokens` (A4); `fakeGoogleVerifier` (A3).
- Produces:
  - `services/google.js`: `createGoogleVerifier(clientId) → { verify(idToken) → Promise<{ sub, email, emailVerified, name }> }`. The fake verifier in tests returns the same shape.
  - `services/users.js` adds `signInWithGoogle(prisma, identity) → Promise<{ user: userRow, isNewUser: boolean }>`.

- [ ] **Step 1: Install the Google library**

```bash
npm install google-auth-library
```

- [ ] **Step 2: Write the failing tests**

`test/integration/auth-google.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, fakeGoogleVerifier, signUp } = require('../support/app');

useDatabase();

var identities = {
  'token-new': { sub: 'google-1', email: 'Jo@Example.com', emailVerified: true, name: '  Jo Smith  ' },
  'token-no-name': { sub: 'google-2', email: 'sam@example.com', emailVerified: true, name: undefined },
  'token-unverified': { sub: 'google-3', email: 'unverified@example.com', emailVerified: false, name: 'U' },
  'token-existing': { sub: 'google-4', email: 'jo@example.com', emailVerified: true, name: 'Jo From Google' },
};
var app = buildApp({ googleVerifier: fakeGoogleVerifier(identities) });

function google(idToken) {
  return request(app).post('/auth/google').send({ idToken: idToken });
}

test('a first Google sign-in creates an account', async function () {
  var res = await google('token-new');
  assert.equal(res.status, 200);
  assert.equal(res.body.isNewUser, true);
  assert.equal(res.body.user.email, 'jo@example.com');
  assert.equal(res.body.user.username, 'Jo Smith');
  assert.equal(typeof res.body.accessToken, 'string');
  assert.equal(typeof res.body.refreshToken, 'string');

  var user = await prisma.user.findUnique({ where: { UserId: res.body.user.id }, include: { Logins: true } });
  assert.equal(user.PasswordHash, null);
  assert.deepEqual(user.Logins.map(function (login) {
    return [login.Provider, login.ProviderUserId];
  }), [['google', 'google-1']]);
});

test('signing in again with the same Google account returns the same user', async function () {
  var first = await google('token-new');
  var second = await google('token-new');
  assert.equal(second.status, 200);
  assert.equal(second.body.isNewUser, false);
  assert.equal(second.body.user.id, first.body.user.id);
  assert.equal(await prisma.user.count(), 1);
});

test('a missing Google name falls back to the part of the email before @', async function () {
  var res = await google('token-no-name');
  assert.equal(res.body.user.username, 'sam');
});

test('Google sign-in links an existing password account and clears its password', async function () {
  var session = await signUp(app, { email: 'jo@example.com' });

  var res = await google('token-existing');
  assert.equal(res.status, 200);
  assert.equal(res.body.isNewUser, false);
  assert.equal(res.body.user.id, session.user.id);
  assert.equal(res.body.user.username, 'Jo');

  var user = await prisma.user.findUnique({ where: { UserId: session.user.id } });
  assert.equal(user.PasswordHash, null);

  var oldSession = await request(app).post('/auth/refresh').send({ refreshToken: session.refreshToken });
  assert.equal(oldSession.status, 401);
  var passwordLogin = await request(app).post('/auth/login').send({ email: 'jo@example.com', password: 'correct-horse-battery' });
  assert.equal(passwordLogin.status, 401);
  var googleSession = await request(app).post('/auth/refresh').send({ refreshToken: res.body.refreshToken });
  assert.equal(googleSession.status, 200);
});

test('unverified emails and invalid ID tokens are rejected', async function () {
  for (var idToken of ['token-unverified', 'forged-token']) {
    var res = await google(idToken);
    assert.equal(res.status, 401, idToken);
    assert.deepEqual(res.body, { error: { code: 'UNAUTHORIZED', message: 'Google sign-in failed' } });
  }
  assert.equal(await prisma.user.count(), 0);
});

test('a deactivated account cannot sign in with Google', async function () {
  var first = await google('token-new');
  await prisma.user.update({ where: { UserId: first.body.user.id }, data: { IsActive: false } });
  var res = await google('token-new');
  assert.equal(res.status, 401);
});

test('email sign-up is refused for an email that belongs to a Google account', async function () {
  await google('token-new');
  var res = await request(app).post('/auth/signup').send({ username: 'Jo', email: 'jo@example.com', password: 'correct-horse-battery' });
  assert.equal(res.status, 409);
});

test('idToken is required', async function () {
  var res = await request(app).post('/auth/google').send({});
  assert.equal(res.status, 400);
  assert.equal(res.body.error.details[0].path, 'idToken');
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:integration`
Expected: FAIL — `auth-google.test.js` gets `404` from `/auth/google`.

- [ ] **Step 4: Write the Google verifier**

`services/google.js`:

```js
var { OAuth2Client } = require('google-auth-library');

function createGoogleVerifier(clientId) {
  var client = new OAuth2Client();
  return {
    verify: async function (idToken) {
      // Checks the signature, issuer, audience and expiry.
      var ticket = await client.verifyIdToken({ idToken: idToken, audience: clientId });
      var payload = ticket.getPayload();
      return {
        sub: payload.sub,
        email: payload.email,
        emailVerified: payload.email_verified === true,
        name: payload.name,
      };
    },
  };
}

module.exports = { createGoogleVerifier };
```

- [ ] **Step 5: Replace `services/users.js`**

```js
var bcrypt = require('bcrypt');
var tokens = require('./tokens');
var { conflict, unauthorized } = require('../lib/errors');

var GOOGLE = 'google';
var DUMMY_PASSWORD = 'fretwizard-dummy-password';
var dummyHashes = {};

function toUserResponse(user) {
  return { id: user.UserId, email: user.Email, username: user.Username };
}

// Comparing against a real hash when the account can't use a password keeps the
// response time the same, so it doesn't reveal which emails have accounts.
function dummyHash(cost) {
  if (!dummyHashes[cost]) dummyHashes[cost] = bcrypt.hashSync(DUMMY_PASSWORD, cost);
  return dummyHashes[cost];
}

async function createWithPassword(db, config, input) {
  var existing = await db.user.findUnique({ where: { Email: input.email } });
  if (existing) throw conflict('An account with this email already exists');
  var passwordHash = await bcrypt.hash(input.password, config.bcryptCost);
  return db.user.create({ data: { Email: input.email, Username: input.username, PasswordHash: passwordHash } });
}

async function verifyPassword(db, config, input) {
  var user = await db.user.findUnique({ where: { Email: input.email } });
  var canUsePassword = Boolean(user && user.IsActive && user.PasswordHash);
  var matches = await bcrypt.compare(input.password, canUsePassword ? user.PasswordHash : dummyHash(config.bcryptCost));
  if (!canUsePassword || !matches) throw unauthorized('Invalid email or password');
  return user;
}

function googleUsername(name, email) {
  var fromName = (name || '').trim().slice(0, 100);
  return fromName || email.split('@')[0].slice(0, 100);
}

async function signInWithGoogle(prisma, identity) {
  if (!identity.emailVerified || !identity.email) throw unauthorized('Google sign-in failed');
  var email = identity.email.trim().toLowerCase();

  var login = await prisma.userLogin.findUnique({
    where: { Provider_ProviderUserId: { Provider: GOOGLE, ProviderUserId: identity.sub } },
    include: { User: true },
  });
  if (login) {
    if (!login.User.IsActive) throw unauthorized('Google sign-in failed');
    return { user: login.User, isNewUser: false };
  }

  var existing = await prisma.user.findUnique({ where: { Email: email } });
  if (existing) {
    if (!existing.IsActive) throw unauthorized('Google sign-in failed');
    // Google proved who owns this email; the password never was, so it goes,
    // along with every session that password may have started.
    var linked = await prisma.$transaction(async function (tx) {
      await tx.userLogin.create({ data: { UserId: existing.UserId, Provider: GOOGLE, ProviderUserId: identity.sub } });
      await tokens.revokeAllForUser(tx, existing.UserId);
      return tx.user.update({ where: { UserId: existing.UserId }, data: { PasswordHash: null } });
    });
    return { user: linked, isNewUser: false };
  }

  var created = await prisma.user.create({
    data: {
      Email: email,
      Username: googleUsername(identity.name, email),
      Logins: { create: { Provider: GOOGLE, ProviderUserId: identity.sub } },
    },
  });
  return { user: created, isNewUser: true };
}

function findById(db, userId) {
  return db.user.findUnique({ where: { UserId: userId } });
}

function updateUsername(db, userId, username) {
  return db.user.update({ where: { UserId: userId }, data: { Username: username } });
}

module.exports = { toUserResponse, createWithPassword, verifyPassword, signInWithGoogle, findById, updateUsername };
```

- [ ] **Step 6: Add `/auth/google` to `routes/auth.js`**

Replace the validation import and add the errors import:

```js
var { unauthorized } = require('../lib/errors');
var { signupSchema, loginSchema, googleSchema, refreshSchema } = require('../validation/auth');
```

Insert directly above the `/auth/refresh` JSDoc block:

```js
  /**
   * @swagger
   * /auth/google:
   *   post:
   *     summary: Sign up or log in with a Google ID token
   *     tags: [Auth]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [idToken]
   *             properties:
   *               idToken: { type: string, description: Credential from Google Identity Services }
   *     responses:
   *       200: { description: Signed in; isNewUser tells whether the account was just created, content: { application/json: { schema: { $ref: '#/components/schemas/AuthResponse' } } } }
   *       401: { description: Google sign-in failed }
   *       429: { description: Rate limited }
   */
  router.post('/google', createRateLimit(config.rateLimits.auth), validate({ body: googleSchema }), asyncHandler(async function (req, res) {
    var identity;
    try {
      identity = await deps.googleVerifier.verify(req.body.idToken);
    } catch (_err) {
      throw unauthorized('Google sign-in failed');
    }
    var result = await users.signInWithGoogle(prisma, identity);
    var issued = await tokens.issueTokens(prisma, config, result.user.UserId);
    res.json(authResponse(issued, result.user, { isNewUser: result.isNewUser }));
  }));

```

- [ ] **Step 7: Use the real verifier in `bin/www`**

Add below `var prisma = require('../lib/prisma');`:

```js
var { createGoogleVerifier } = require('../services/google');
```

Replace the `var app = …` line with:

```js
var app = createApp({ prisma: prisma, config: config, googleVerifier: createGoogleVerifier(config.googleClientId) });
```

- [ ] **Step 8: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — unit 16, integration 33 (25 + 8).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 9: Commit**

```bash
git add -A
git commit -m "feat: Google sign-in with account linking" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A6: Fretboard validation and the row mapper

**Files:**
- Create: `lib/limits.js`, `validation/fretboard.js`, `mappers/fretboard.js`, `test/support/fixtures.js`, `test/unit/fretboard.test.js`

**Interfaces:**
- Consumes: nothing.
- Produces:
  - `lib/limits.js`: `{ MAX_CARDS: 200, MAX_FRETBOARDS: 50, MAX_CHORDS: 100 }`.
  - `validation/fretboard.js`: `{ SETUPS, KEYS, setupSchema, tonalitySchema, fretboardSchema, stackSchema }`. `fretboardSchema` strips unknown keys, including `currentSetup`.
  - `mappers/fretboard.js`: `toFretboardColumns(fretboard, position) → row columns`, `toFretboardData(row, setup) → FretboardData`, `toStackRows(fretboards) → rows with Position 0..n-1`.
  - `test/support/fixtures.js`: `sampleFretboard(overrides?)` (a valid `FretboardData` with `currentKey: 'F♯'`, `currentSetup: 'Scale'`, `chordView: 'fingering'`, `currentStrings.e: false`), `withSetup(fretboards, setup)`, `sampleProgression(overrides?)` (`{ key: 'F♯', tonality: 'Minor', progression: [{ id: 'client-1', degree: 0 }, { id: 'client-2', degree: 3 }, { id: 'client-3', degree: 4 }] }`).

- [ ] **Step 1: Write the fixtures**

`test/support/fixtures.js`:

```js
function sampleFretboard(overrides) {
  return Object.assign({
    fretAmount: 22,
    currentKey: 'F♯',
    currentSetup: 'Scale',
    currentPattern: 'Diatonic Scale',
    currentTonality: 'Minor',
    currentAccidental: 'sharp',
    currentHighlightNotes: ['roots', 'minor thirds', 'fifths'],
    currentCAGED: { CShape: false, AShape: true, GShape: false, EShape: false, DShape: false },
    currentStrings: { E: true, A: true, D: false, G: true, B: true, e: false },
    currentChordPosition: 2,
    chordView: 'fingering',
  }, overrides);
}

function withSetup(fretboards, setup) {
  return fretboards.map(function (fretboard) {
    return Object.assign({}, fretboard, { currentSetup: setup });
  });
}

function sampleProgression(overrides) {
  return Object.assign({
    key: 'F♯',
    tonality: 'Minor',
    progression: [{ id: 'client-1', degree: 0 }, { id: 'client-2', degree: 3 }, { id: 'client-3', degree: 4 }],
  }, overrides);
}

module.exports = { sampleFretboard, withSetup, sampleProgression };
```

- [ ] **Step 2: Write the failing tests**

`test/unit/fretboard.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { fretboardSchema, stackSchema } = require('../../validation/fretboard');
var { toFretboardColumns, toFretboardData, toStackRows } = require('../../mappers/fretboard');
var { sampleFretboard } = require('../support/fixtures');

function issuePaths(schema, value) {
  var result = schema.safeParse(value);
  assert.equal(result.success, false, 'expected validation to fail for ' + JSON.stringify(value));
  return result.error.issues.map(function (issue) {
    return issue.path.join('.');
  });
}

test('accepts a fretboard as the frontend sends it', function () {
  assert.equal(fretboardSchema.safeParse(sampleFretboard()).success, true);
});

test('strips fields that have no column, at every level', function () {
  var parsed = fretboardSchema.parse(sampleFretboard({
    currentSetup: 'Chord',
    extra: 'ignored',
    currentCAGED: { CShape: true, AShape: true, GShape: true, EShape: true, DShape: true, XShape: true },
  }));
  assert.equal('currentSetup' in parsed, false);
  assert.equal('extra' in parsed, false);
  assert.deepEqual(Object.keys(parsed.currentCAGED), ['CShape', 'AShape', 'GShape', 'EShape', 'DShape']);
});

test('rejects out-of-range and unknown values, naming the field', function () {
  var cases = [
    [{ fretAmount: 11 }, 'fretAmount'],
    [{ fretAmount: 25 }, 'fretAmount'],
    [{ fretAmount: 12.5 }, 'fretAmount'],
    [{ currentKey: 'H' }, 'currentKey'],
    [{ currentPattern: 'Sixth Chord' }, 'currentPattern'],
    [{ currentTonality: 'Dorian' }, 'currentTonality'],
    [{ currentAccidental: 'natural' }, 'currentAccidental'],
    [{ currentHighlightNotes: ['roots', 'roots'] }, 'currentHighlightNotes'],
    [{ currentHighlightNotes: ['ninths'] }, 'currentHighlightNotes.0'],
    [{ currentStrings: { E: true, A: true, D: true, G: true, B: true } }, 'currentStrings.e'],
    [{ currentChordPosition: 24 }, 'currentChordPosition'],
    [{ chordView: 'diagram' }, 'chordView'],
  ];
  cases.forEach(function (entry) {
    assert.deepEqual(issuePaths(fretboardSchema, sampleFretboard(entry[0])), [entry[1]], JSON.stringify(entry[0]));
  });
});

test('a stack holds 1 to 50 fretboards', function () {
  assert.equal(stackSchema.safeParse([]).success, false);
  assert.equal(stackSchema.safeParse(Array(51).fill(sampleFretboard())).success, false);
  assert.equal(stackSchema.safeParse(Array(50).fill(sampleFretboard())).success, true);
});

test('the mapper round-trips a fretboard through a row', function () {
  var fretboard = sampleFretboard({ currentSetup: 'Chord' });
  var row = toFretboardColumns(fretboardSchema.parse(fretboard), 3);
  assert.equal(row.Position, 3);
  assert.equal(row.KeyName, 'F♯');
  assert.equal(row.StringLowE, true);
  assert.equal(row.StringHighE, false);
  assert.equal(row.ChordView, 'fingering');
  assert.equal(row.HighlightNotes, '["roots","minor thirds","fifths"]');
  assert.deepEqual(toFretboardData(row, 'Chord'), fretboard);
});

test('the mapper omits chordView when the row has none', function () {
  var fretboard = sampleFretboard();
  delete fretboard.chordView;
  var row = toFretboardColumns(fretboard, 0);
  assert.equal(row.ChordView, null);
  var data = toFretboardData(row, 'Scale');
  assert.equal('chordView' in data, false);
  assert.deepEqual(data, fretboard);
});

test('toStackRows numbers positions in stack order', function () {
  var rows = toStackRows([sampleFretboard({ currentKey: 'C' }), sampleFretboard({ currentKey: 'D' })]);
  assert.deepEqual(rows.map(function (row) {
    return [row.Position, row.KeyName];
  }), [[0, 'C'], [1, 'D']]);
});
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm run test:unit`
Expected: FAIL with `Cannot find module '../../validation/fretboard'`.

- [ ] **Step 4: Write limits, validation and mapper**

`lib/limits.js`:

```js
module.exports = {
  MAX_CARDS: 200,
  MAX_FRETBOARDS: 50,
  MAX_CHORDS: 100,
};
```

`validation/fretboard.js`:

```js
var { z } = require('zod');
var { MAX_FRETBOARDS } = require('../lib/limits');

// Allowed values mirror fret-wizard/src/lib/music-theory/constants.ts.
var SETUPS = ['Scale', 'Chord'];
var TONALITIES = ['Major', 'Minor'];
var ACCIDENTALS = ['sharp', 'flat'];
var KEYS = ['C', 'C♯', 'D', 'D♯', 'E', 'F', 'F♯', 'G', 'G♯', 'A', 'A♯', 'B', 'D♭', 'E♭', 'G♭', 'A♭', 'B♭'];
var PATTERNS = [
  'Pentatonic Scale', 'Blue Scale', 'Diatonic Scale', 'Chromatic Scale',
  'Power Chord', 'Triad', 'Seventh Chord', 'Add9 Chord', 'Add11 Chord', 'Add13 Chord', 'Dominant Chord',
];
var DEGREES = [
  'roots', 'minor seconds', 'seconds', 'minor thirds', 'thirds', 'fourths',
  'tritones', 'fifths', 'minor sixths', 'sixths', 'minor sevenths', 'sevenths',
];
var CHORD_VIEWS = ['shapes', 'fingering'];

var setupSchema = z.enum(SETUPS);
var tonalitySchema = z.enum(TONALITIES);

var fretboardSchema = z.object({
  fretAmount: z.number().int().min(12, 'Must be between 12 and 24').max(24, 'Must be between 12 and 24'),
  currentKey: z.enum(KEYS),
  currentPattern: z.enum(PATTERNS),
  currentTonality: tonalitySchema,
  currentAccidental: z.enum(ACCIDENTALS),
  currentHighlightNotes: z.array(z.enum(DEGREES)).max(DEGREES.length).refine(function (notes) {
    return new Set(notes).size === notes.length;
  }, 'Highlight notes must be unique'),
  currentCAGED: z.object({
    CShape: z.boolean(),
    AShape: z.boolean(),
    GShape: z.boolean(),
    EShape: z.boolean(),
    DShape: z.boolean(),
  }),
  currentStrings: z.object({
    E: z.boolean(),
    A: z.boolean(),
    D: z.boolean(),
    G: z.boolean(),
    B: z.boolean(),
    e: z.boolean(),
  }),
  currentChordPosition: z.number().int().min(0).max(23),
  chordView: z.enum(CHORD_VIEWS).optional(),
});

var stackSchema = z.array(fretboardSchema)
  .min(1, 'A stack needs at least one fretboard')
  .max(MAX_FRETBOARDS, 'A stack can hold at most ' + MAX_FRETBOARDS + ' fretboards');

module.exports = { SETUPS, KEYS, setupSchema, tonalitySchema, fretboardSchema, stackSchema };
```

`mappers/fretboard.js`:

```js
// The only place that converts between the frontend's FretboardData and a
// CardFretboard / WorkspaceFretboard row (both tables share these columns).
// SQL Server column names are case-insensitive, so the low and high E strings
// are StringLowE / StringHighE rather than StringE / Stringe.

function toFretboardColumns(fretboard, position) {
  return {
    Position: position,
    KeyName: fretboard.currentKey,
    Accidental: fretboard.currentAccidental,
    Tonality: fretboard.currentTonality,
    Pattern: fretboard.currentPattern,
    FretAmount: fretboard.fretAmount,
    ChordPosition: fretboard.currentChordPosition,
    ChordView: fretboard.chordView || null,
    ShapeC: fretboard.currentCAGED.CShape,
    ShapeA: fretboard.currentCAGED.AShape,
    ShapeG: fretboard.currentCAGED.GShape,
    ShapeE: fretboard.currentCAGED.EShape,
    ShapeD: fretboard.currentCAGED.DShape,
    StringLowE: fretboard.currentStrings.E,
    StringA: fretboard.currentStrings.A,
    StringD: fretboard.currentStrings.D,
    StringG: fretboard.currentStrings.G,
    StringB: fretboard.currentStrings.B,
    StringHighE: fretboard.currentStrings.e,
    HighlightNotes: JSON.stringify(fretboard.currentHighlightNotes),
  };
}

function toFretboardData(row, setup) {
  var data = {
    fretAmount: row.FretAmount,
    currentKey: row.KeyName,
    currentSetup: setup,
    currentPattern: row.Pattern,
    currentTonality: row.Tonality,
    currentAccidental: row.Accidental,
    currentHighlightNotes: JSON.parse(row.HighlightNotes),
    currentCAGED: {
      CShape: row.ShapeC,
      AShape: row.ShapeA,
      GShape: row.ShapeG,
      EShape: row.ShapeE,
      DShape: row.ShapeD,
    },
    currentStrings: {
      E: row.StringLowE,
      A: row.StringA,
      D: row.StringD,
      G: row.StringG,
      B: row.StringB,
      e: row.StringHighE,
    },
    currentChordPosition: row.ChordPosition,
  };
  if (row.ChordView) data.chordView = row.ChordView;
  return data;
}

function toStackRows(fretboards) {
  return fretboards.map(function (fretboard, index) {
    return toFretboardColumns(fretboard, index);
  });
}

module.exports = { toFretboardColumns, toFretboardData, toStackRows };
```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm run test:unit`
Expected: PASS — 23 tests.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: fretboard validation and row mapper" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A7: Library card endpoints

**Files:**
- Create: `validation/library.js`, `services/library.js`, `routes/libraryCards.js`, `test/integration/library-cards.test.js`
- Modify (full rewrite): `app.js`

**Interfaces:**
- Consumes: `fretboardSchema`, `stackSchema`, `setupSchema` (A6); `toFretboardData`, `toStackRows` (A6); `MAX_CARDS` (A6); `notFound`, `limitExceeded` (A1); test helpers (A3, A6).
- Produces:
  - `validation/library.js`: `{ createCardSchema, updateCardSchema }`.
  - `services/library.js`: `listCards(db, userId) → Promise<LibraryCard[]>`, `assertCardCapacity(db, userId, adding)` (throws `LIMIT_EXCEEDED`), `createCard(db, userId, { name, setup, fretboards }, createdDate?) → Promise<LibraryCard>`, `updateCard(prisma, userId, cardId, { name?, fretboards? }) → Promise<LibraryCard>`, `deleteCard(db, userId, cardId)`. `LibraryCard = { id, name, setup, fretboards: FretboardData[], createdAt: number }`.
  - Router factory `createLibraryCardsRouter(deps)`.

- [ ] **Step 1: Write the failing tests**

`test/integration/library-cards.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, signUp, bearer } = require('../support/app');
var { sampleFretboard, withSetup } = require('../support/fixtures');

useDatabase();
var app = buildApp();

var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cardBody(overrides) {
  return Object.assign({ name: 'Minor shapes', setup: 'Scale', fretboards: [sampleFretboard()] }, overrides);
}

function createCard(session, body) {
  return request(app).post('/library-cards').set('Authorization', bearer(session)).send(body);
}

function listCards(session) {
  return request(app).get('/library-cards').set('Authorization', bearer(session));
}

function patchCard(session, id, body) {
  return request(app).patch('/library-cards/' + id).set('Authorization', bearer(session)).send(body);
}

function deleteCard(session, id) {
  return request(app).delete('/library-cards/' + id).set('Authorization', bearer(session));
}

test('library endpoints require an access token', async function () {
  var res = await request(app).get('/library-cards');
  assert.equal(res.status, 401);
  assert.equal(res.body.error.code, 'UNAUTHORIZED');
});

test('creating a card returns it in the frontend shape', async function () {
  var session = await signUp(app);
  var before = Date.now();
  var res = await createCard(session, cardBody({ name: '  Minor shapes  ', fretboards: [sampleFretboard({ currentSetup: 'Chord' })] }));
  assert.equal(res.status, 201);
  assert.match(res.body.id, UUID);
  assert.equal(res.body.name, 'Minor shapes');
  assert.equal(res.body.setup, 'Scale');
  assert.deepEqual(res.body.fretboards, [sampleFretboard({ currentSetup: 'Scale' })]);
  assert.equal(typeof res.body.createdAt, 'number');
  assert.ok(res.body.createdAt >= before - 1000 && res.body.createdAt <= Date.now() + 1000);
});

test('listing returns only your own cards, oldest first', async function () {
  var jo = await signUp(app);
  var sam = await signUp(app, { email: 'sam@example.com' });
  await createCard(jo, cardBody({ name: 'First' }));
  await createCard(sam, cardBody({ name: 'Not yours' }));
  await createCard(jo, cardBody({ name: 'Second', setup: 'Chord' }));

  var res = await listCards(jo);
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.map(function (card) {
    return card.name;
  }), ['First', 'Second']);
  assert.deepEqual(res.body[1].fretboards, withSetup([sampleFretboard()], 'Chord'));
});

test('a stack keeps its order', async function () {
  var session = await signUp(app);
  var stack = ['C', 'G♯', 'B♭'].map(function (key) {
    return sampleFretboard({ currentKey: key });
  });
  var res = await createCard(session, cardBody({ fretboards: stack }));
  assert.deepEqual(res.body.fretboards.map(function (fretboard) {
    return fretboard.currentKey;
  }), ['C', 'G♯', 'B♭']);
});

test('PATCH renames a card', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody())).body;
  var res = await patchCard(session, card.id, { name: 'Renamed' });
  assert.equal(res.status, 200);
  assert.equal(res.body.name, 'Renamed');
  assert.deepEqual(res.body.fretboards, card.fretboards);
});

test('PATCH replaces the whole stack', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody({ fretboards: [sampleFretboard(), sampleFretboard(), sampleFretboard()] }))).body;
  var res = await patchCard(session, card.id, { fretboards: [sampleFretboard({ currentKey: 'E' })] });
  assert.equal(res.status, 200);
  assert.deepEqual(res.body.fretboards, [sampleFretboard({ currentKey: 'E' })]);
  assert.equal(await prisma.cardFretboard.count({ where: { CardId: card.id } }), 1);
});

test('PATCH needs a name or fretboards', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody())).body;
  var res = await patchCard(session, card.id, {});
  assert.equal(res.status, 400);
  assert.equal(res.body.error.code, 'VALIDATION_ERROR');
});

test('DELETE removes the card and its fretboards', async function () {
  var session = await signUp(app);
  var card = (await createCard(session, cardBody())).body;
  var res = await deleteCard(session, card.id);
  assert.equal(res.status, 204);
  assert.deepEqual((await listCards(session)).body, []);
  assert.equal(await prisma.cardFretboard.count(), 0);
});

test('another user\'s card is not found and stays untouched', async function () {
  var jo = await signUp(app);
  var sam = await signUp(app, { email: 'sam@example.com' });
  var card = (await createCard(jo, cardBody())).body;

  assert.equal((await patchCard(sam, card.id, { name: 'Mine now' })).status, 404);
  assert.equal((await deleteCard(sam, card.id)).status, 404);
  assert.deepEqual((await listCards(sam)).body, []);

  var joCards = (await listCards(jo)).body;
  assert.equal(joCards.length, 1);
  assert.equal(joCards[0].name, 'Minor shapes');
});

test('IDs that are not UUIDs are not found', async function () {
  var session = await signUp(app);
  assert.equal((await patchCard(session, '123', { name: 'x' })).status, 404);
  assert.equal((await deleteCard(session, 'not-a-uuid')).status, 404);
});

test('a library holds at most 200 cards', async function () {
  var session = await signUp(app);
  await prisma.libraryCard.createMany({
    data: Array.from({ length: 200 }, function (_, index) {
      return { UserId: session.user.id, Name: 'Card ' + index, Setup: 'Scale' };
    }),
  });
  var res = await createCard(session, cardBody());
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'LIMIT_EXCEEDED');
  assert.equal(await prisma.libraryCard.count({ where: { UserId: session.user.id } }), 200);
});

test('card bodies are validated', async function () {
  var session = await signUp(app);
  var bodies = [
    cardBody({ name: '   ' }),
    cardBody({ setup: 'Bass' }),
    cardBody({ fretboards: [] }),
    cardBody({ fretboards: Array(51).fill(sampleFretboard()) }),
    cardBody({ fretboards: [sampleFretboard({ fretAmount: 99 })] }),
  ];
  for (var body of bodies) {
    var res = await createCard(session, body);
    assert.equal(res.status, 400, JSON.stringify(body).slice(0, 80));
  }
  assert.equal(await prisma.libraryCard.count(), 0);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:integration`
Expected: FAIL — `library-cards.test.js` gets `404` from `/library-cards`.

- [ ] **Step 3: Write validation and the library service**

`validation/library.js`:

```js
var { z } = require('zod');
var { setupSchema, stackSchema } = require('./fretboard');

var cardName = z.string()
  .trim()
  .min(1, 'Enter a card name')
  .max(100, 'Card name must be at most 100 characters');

var createCardSchema = z.object({ name: cardName, setup: setupSchema, fretboards: stackSchema });

var updateCardSchema = z.object({ name: cardName.optional(), fretboards: stackSchema.optional() })
  .refine(function (patch) {
    return patch.name !== undefined || patch.fretboards !== undefined;
  }, 'Provide a name or fretboards to update');

module.exports = { createCardSchema, updateCardSchema };
```

`services/library.js`:

```js
var { toFretboardData, toStackRows } = require('../mappers/fretboard');
var { notFound, limitExceeded } = require('../lib/errors');
var { MAX_CARDS } = require('../lib/limits');

var includeFretboards = { Fretboards: { orderBy: { Position: 'asc' } } };

function toCardResponse(card) {
  return {
    id: card.CardId,
    name: card.Name,
    setup: card.Setup,
    fretboards: card.Fretboards.map(function (row) {
      return toFretboardData(row, card.Setup);
    }),
    createdAt: card.CreatedDate.getTime(),
  };
}

async function listCards(db, userId) {
  var cards = await db.libraryCard.findMany({
    where: { UserId: userId },
    orderBy: [{ CreatedDate: 'asc' }, { CardId: 'asc' }],
    include: includeFretboards,
  });
  return cards.map(toCardResponse);
}

async function assertCardCapacity(db, userId, adding) {
  var count = await db.libraryCard.count({ where: { UserId: userId } });
  if (count + adding > MAX_CARDS) {
    throw limitExceeded('A library can hold at most ' + MAX_CARDS + ' cards');
  }
}

// createdDate is passed explicitly so cards created in one import keep their order.
async function createCard(db, userId, input, createdDate) {
  var card = await db.libraryCard.create({
    data: {
      UserId: userId,
      Name: input.name,
      Setup: input.setup,
      CreatedDate: createdDate || new Date(),
      Fretboards: { create: toStackRows(input.fretboards) },
    },
    include: includeFretboards,
  });
  return toCardResponse(card);
}

async function updateCard(prisma, userId, cardId, patch) {
  return prisma.$transaction(async function (tx) {
    var owned = await tx.libraryCard.count({ where: { CardId: cardId, UserId: userId } });
    if (owned === 0) throw notFound('Card not found');

    var data = {};
    if (patch.name !== undefined) data.Name = patch.name;
    if (patch.fretboards !== undefined) {
      await tx.cardFretboard.deleteMany({ where: { CardId: cardId } });
      data.Fretboards = { create: toStackRows(patch.fretboards) };
    }
    var card = await tx.libraryCard.update({ where: { CardId: cardId }, data: data, include: includeFretboards });
    return toCardResponse(card);
  });
}

async function deleteCard(db, userId, cardId) {
  var result = await db.libraryCard.deleteMany({ where: { CardId: cardId, UserId: userId } });
  if (result.count === 0) throw notFound('Card not found');
}

module.exports = { listCards, assertCardCapacity, createCard, updateCard, deleteCard };
```

- [ ] **Step 4: Write the router**

`routes/libraryCards.js`:

```js
var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var library = require('../services/library');
var { notFound } = require('../lib/errors');
var { createCardSchema, updateCardSchema } = require('../validation/library');

var UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function cardIdFrom(req) {
  if (!UUID_PATTERN.test(req.params.id)) throw notFound('Card not found');
  return req.params.id;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     FretboardData:
 *       type: object
 *       required: [fretAmount, currentKey, currentPattern, currentTonality, currentAccidental, currentHighlightNotes, currentCAGED, currentStrings, currentChordPosition]
 *       properties:
 *         fretAmount: { type: integer, minimum: 12, maximum: 24 }
 *         currentKey: { type: string, example: F♯ }
 *         currentSetup: { type: string, enum: [Scale, Chord], description: Ignored on input and filled from the parent on output }
 *         currentPattern: { type: string, example: Triad }
 *         currentTonality: { type: string, enum: [Major, Minor] }
 *         currentAccidental: { type: string, enum: [sharp, flat] }
 *         currentHighlightNotes: { type: array, items: { type: string } }
 *         currentCAGED: { type: object, properties: { CShape: { type: boolean }, AShape: { type: boolean }, GShape: { type: boolean }, EShape: { type: boolean }, DShape: { type: boolean } } }
 *         currentStrings: { type: object, properties: { E: { type: boolean }, A: { type: boolean }, D: { type: boolean }, G: { type: boolean }, B: { type: boolean }, e: { type: boolean } } }
 *         currentChordPosition: { type: integer, minimum: 0, maximum: 23 }
 *         chordView: { type: string, enum: [shapes, fingering] }
 *     LibraryCard:
 *       type: object
 *       properties:
 *         id: { type: string, format: uuid }
 *         name: { type: string }
 *         setup: { type: string, enum: [Scale, Chord] }
 *         fretboards: { type: array, items: { $ref: '#/components/schemas/FretboardData' } }
 *         createdAt: { type: integer, description: Epoch milliseconds }
 */

function createLibraryCardsRouter(deps) {
  var prisma = deps.prisma;
  var router = express.Router();

  /**
   * @swagger
   * /library-cards:
   *   get:
   *     summary: Your library cards, oldest first
   *     tags: [Library]
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: Cards, content: { application/json: { schema: { type: array, items: { $ref: '#/components/schemas/LibraryCard' } } } } }
   *   post:
   *     summary: Create a library card
   *     tags: [Library]
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [name, setup, fretboards]
   *             properties:
   *               name: { type: string, maxLength: 100 }
   *               setup: { type: string, enum: [Scale, Chord] }
   *               fretboards: { type: array, minItems: 1, maxItems: 50, items: { $ref: '#/components/schemas/FretboardData' } }
   *     responses:
   *       201: { description: Created card, content: { application/json: { schema: { $ref: '#/components/schemas/LibraryCard' } } } }
   *       400: { description: Validation error }
   *       409: { description: LIMIT_EXCEEDED (200 cards) }
   */
  router.get('/', asyncHandler(async function (req, res) {
    res.json(await library.listCards(prisma, req.userId));
  }));

  router.post('/', validate({ body: createCardSchema }), asyncHandler(async function (req, res) {
    await library.assertCardCapacity(prisma, req.userId, 1);
    res.status(201).json(await library.createCard(prisma, req.userId, req.body));
  }));

  /**
   * @swagger
   * /library-cards/{id}:
   *   patch:
   *     summary: Rename a card and/or replace its stack
   *     tags: [Library]
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               name: { type: string, maxLength: 100 }
   *               fretboards: { type: array, minItems: 1, maxItems: 50, items: { $ref: '#/components/schemas/FretboardData' } }
   *     responses:
   *       200: { description: Updated card, content: { application/json: { schema: { $ref: '#/components/schemas/LibraryCard' } } } }
   *       404: { description: Not found or not yours }
   *   delete:
   *     summary: Delete a card
   *     tags: [Library]
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: id, required: true, schema: { type: string, format: uuid } }
   *     responses:
   *       204: { description: Deleted }
   *       404: { description: Not found or not yours }
   */
  router.patch('/:id', validate({ body: updateCardSchema }), asyncHandler(async function (req, res) {
    res.json(await library.updateCard(prisma, req.userId, cardIdFrom(req), req.body));
  }));

  router.delete('/:id', asyncHandler(async function (req, res) {
    await library.deleteCard(prisma, req.userId, cardIdFrom(req));
    res.status(204).end();
  }));

  return router;
}

module.exports = createLibraryCardsRouter;
```

- [ ] **Step 5: Mount the router — replace `app.js`**

```js
var express = require('express');
var logger = require('morgan');
var cors = require('cors');
var swaggerUi = require('swagger-ui-express');

var swaggerSpec = require('./lib/swagger');
var { notFound } = require('./lib/errors');
var errorHandler = require('./middleware/errorHandler');
var createRequireAuth = require('./middleware/requireAuth');
var healthRouter = require('./routes/health');
var createAuthRouter = require('./routes/auth');
var createMeRouter = require('./routes/me');
var createLibraryCardsRouter = require('./routes/libraryCards');

function createApp(deps) {
  var config = deps.config;
  var requireAuth = createRequireAuth(config);
  var app = express();

  app.set('trust proxy', config.trustProxy);
  if (config.logRequests) app.use(logger('dev'));
  app.use(cors({ origin: config.corsOrigins }));
  app.use(express.json({ limit: '1mb' }));

  app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerSpec));
  app.use('/health', healthRouter);
  app.use('/auth', createAuthRouter(deps));
  app.use('/me', requireAuth, createMeRouter(deps));
  app.use('/library-cards', requireAuth, createLibraryCardsRouter(deps));

  app.use(function (req, res, next) {
    next(notFound());
  });
  app.use(errorHandler);

  return app;
}

module.exports = { createApp };
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — unit 23, integration 45 (33 + 12).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: library card endpoints with ownership checks and card limit" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A8: Workspace endpoints (Scale and Chord page stacks)

**Files:**
- Create: `validation/workspaces.js`, `services/workspaces.js`, `routes/workspaces.js`, `test/integration/workspaces.test.js`
- Modify: `app.js` (one require, one mount)

**Interfaces:**
- Consumes: `stackSchema` (A6), mapper (A6), `notFound` (A1).
- Produces:
  - `validation/workspaces.js`: `{ workspaceSchema }` (`{ fretboards: stack }`).
  - `services/workspaces.js`: `setupFromParam(param) → 'Scale' | 'Chord' | null` (`'scale'` → `'Scale'`, `'chord'` → `'Chord'`), `getWorkspace(db, userId, setup) → Promise<{ fretboards } | null>`, `hasWorkspace(db, userId, setup) → Promise<boolean>`, `replaceWorkspace(db, userId, setup, fretboards)` (call inside a transaction).
  - Router factory `createWorkspacesRouter(deps)`.

- [ ] **Step 1: Write the failing tests**

`test/integration/workspaces.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { useDatabase } = require('../support/db');
var { request, buildApp, signUp, bearer } = require('../support/app');
var { sampleFretboard, withSetup } = require('../support/fixtures');

useDatabase();
var app = buildApp();

function getWorkspace(session, setup) {
  return request(app).get('/workspaces/' + setup).set('Authorization', bearer(session));
}

function putWorkspace(session, setup, fretboards) {
  return request(app).put('/workspaces/' + setup).set('Authorization', bearer(session)).send({ fretboards: fretboards });
}

test('workspace endpoints require an access token', async function () {
  var res = await request(app).get('/workspaces/scale');
  assert.equal(res.status, 401);
});

test('a workspace that was never saved is not found', async function () {
  var session = await signUp(app);
  var res = await getWorkspace(session, 'scale');
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('a saved workspace reads back exactly, in order', async function () {
  var session = await signUp(app);
  var noChordView = sampleFretboard({ currentKey: 'B♭', currentSetup: 'Chord' });
  delete noChordView.chordView;
  var stack = [sampleFretboard({ currentKey: 'C' }), noChordView, sampleFretboard({ currentKey: 'G♯' })];

  var put = await putWorkspace(session, 'scale', stack);
  assert.equal(put.status, 204);

  var res = await getWorkspace(session, 'scale');
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { fretboards: withSetup(stack, 'Scale') });
  assert.equal('chordView' in res.body.fretboards[1], false);
});

test('PUT replaces the whole stack', async function () {
  var session = await signUp(app);
  await putWorkspace(session, 'chord', [sampleFretboard(), sampleFretboard(), sampleFretboard()]);
  await putWorkspace(session, 'chord', [sampleFretboard({ currentKey: 'E' })]);
  var res = await getWorkspace(session, 'chord');
  assert.deepEqual(res.body.fretboards, withSetup([sampleFretboard({ currentKey: 'E' })], 'Chord'));
});

test('the Scale and Chord workspaces are independent', async function () {
  var session = await signUp(app);
  await putWorkspace(session, 'scale', [sampleFretboard({ currentKey: 'A' })]);
  assert.equal((await getWorkspace(session, 'chord')).status, 404);
  await putWorkspace(session, 'chord', [sampleFretboard({ currentKey: 'D' })]);
  assert.equal((await getWorkspace(session, 'scale')).body.fretboards[0].currentKey, 'A');
  assert.equal((await getWorkspace(session, 'chord')).body.fretboards[0].currentKey, 'D');
});

test('each user sees only their own workspace', async function () {
  var jo = await signUp(app);
  var sam = await signUp(app, { email: 'sam@example.com' });
  await putWorkspace(jo, 'scale', [sampleFretboard()]);
  assert.equal((await getWorkspace(sam, 'scale')).status, 404);
});

test('only scale and chord workspaces exist', async function () {
  var session = await signUp(app);
  for (var setup of ['bass', 'Scale', 'progression']) {
    assert.equal((await getWorkspace(session, setup)).status, 404, setup);
    assert.equal((await putWorkspace(session, setup, [sampleFretboard()])).status, 404, setup);
  }
});

test('workspace bodies are validated', async function () {
  var session = await signUp(app);
  var res = await putWorkspace(session, 'scale', []);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.details[0].path, 'fretboards');
  assert.equal((await getWorkspace(session, 'scale')).status, 404);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:integration`
Expected: FAIL — `workspaces.test.js` gets `404` where it expects `204`/`200`, and `404` instead of `401` for the token check.

- [ ] **Step 3: Write validation and the workspace service**

`validation/workspaces.js`:

```js
var { z } = require('zod');
var { stackSchema } = require('./fretboard');

var workspaceSchema = z.object({ fretboards: stackSchema });

module.exports = { workspaceSchema };
```

`services/workspaces.js`:

```js
var { toFretboardData, toStackRows } = require('../mappers/fretboard');

var SETUP_BY_PARAM = { scale: 'Scale', chord: 'Chord' };

function setupFromParam(param) {
  return Object.prototype.hasOwnProperty.call(SETUP_BY_PARAM, param) ? SETUP_BY_PARAM[param] : null;
}

// No rows for (UserId, Setup) means the workspace was never saved.
async function getWorkspace(db, userId, setup) {
  var rows = await db.workspaceFretboard.findMany({
    where: { UserId: userId, Setup: setup },
    orderBy: { Position: 'asc' },
  });
  if (rows.length === 0) return null;
  return {
    fretboards: rows.map(function (row) {
      return toFretboardData(row, setup);
    }),
  };
}

async function hasWorkspace(db, userId, setup) {
  return (await db.workspaceFretboard.count({ where: { UserId: userId, Setup: setup } })) > 0;
}

// Call inside a transaction: the delete and the insert must land together.
async function replaceWorkspace(db, userId, setup, fretboards) {
  await db.workspaceFretboard.deleteMany({ where: { UserId: userId, Setup: setup } });
  await db.workspaceFretboard.createMany({
    data: toStackRows(fretboards).map(function (row) {
      return Object.assign({ UserId: userId, Setup: setup }, row);
    }),
  });
}

module.exports = { setupFromParam, getWorkspace, hasWorkspace, replaceWorkspace };
```

- [ ] **Step 4: Write the router**

`routes/workspaces.js`:

```js
var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var workspaces = require('../services/workspaces');
var { notFound } = require('../lib/errors');
var { workspaceSchema } = require('../validation/workspaces');

function setupFrom(req) {
  var setup = workspaces.setupFromParam(req.params.setup);
  if (!setup) throw notFound('Workspace not found');
  return setup;
}

function createWorkspacesRouter(deps) {
  var prisma = deps.prisma;
  var router = express.Router();

  /**
   * @swagger
   * /workspaces/{setup}:
   *   get:
   *     summary: The current stack of the Scale or Chord page
   *     tags: [Workspaces]
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: setup, required: true, schema: { type: string, enum: [scale, chord] } }
   *     responses:
   *       200: { description: The stack, content: { application/json: { schema: { type: object, properties: { fretboards: { type: array, items: { $ref: '#/components/schemas/FretboardData' } } } } } } }
   *       404: { description: Never saved or unknown setup }
   *   put:
   *     summary: Replace the stack of the Scale or Chord page
   *     tags: [Workspaces]
   *     security: [{ bearerAuth: [] }]
   *     parameters:
   *       - { in: path, name: setup, required: true, schema: { type: string, enum: [scale, chord] } }
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             required: [fretboards]
   *             properties:
   *               fretboards: { type: array, minItems: 1, maxItems: 50, items: { $ref: '#/components/schemas/FretboardData' } }
   *     responses:
   *       204: { description: Saved }
   *       400: { description: Validation error }
   *       404: { description: Unknown setup }
   */
  router.get('/:setup', asyncHandler(async function (req, res) {
    var workspace = await workspaces.getWorkspace(prisma, req.userId, setupFrom(req));
    if (!workspace) throw notFound('Workspace not saved yet');
    res.json(workspace);
  }));

  router.put('/:setup', validate({ body: workspaceSchema }), asyncHandler(async function (req, res) {
    var setup = setupFrom(req);
    await prisma.$transaction(function (tx) {
      return workspaces.replaceWorkspace(tx, req.userId, setup, req.body.fretboards);
    });
    res.status(204).end();
  }));

  return router;
}

module.exports = createWorkspacesRouter;
```

- [ ] **Step 5: Mount the router in `app.js`**

Add below `var createLibraryCardsRouter = require('./routes/libraryCards');`:

```js
var createWorkspacesRouter = require('./routes/workspaces');
```

Add below `app.use('/library-cards', requireAuth, createLibraryCardsRouter(deps));`:

```js
  app.use('/workspaces', requireAuth, createWorkspacesRouter(deps));
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — unit 23, integration 53 (45 + 8).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: Scale and Chord workspace endpoints" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A9: Chord Progression endpoints

**Files:**
- Create: `validation/chordProgression.js`, `services/chordProgression.js`, `routes/chordProgression.js`, `test/integration/chord-progression.test.js`
- Modify: `app.js` (one require, one mount)

**Interfaces:**
- Consumes: `tonalitySchema` (A6), `MAX_CHORDS` (A6), `notFound` (A1), `sampleProgression` (A6).
- Produces:
  - `validation/chordProgression.js`: `{ chordProgressionSchema }`. Incoming chord `id`s are stripped.
  - `services/chordProgression.js`: `getProgression(db, userId) → Promise<{ key, tonality, progression: [{ id, degree }] } | null>`, `hasProgression(db, userId) → Promise<boolean>`, `replaceProgression(db, userId, { key, tonality, progression })` (call inside a transaction).
  - Router factory `createChordProgressionRouter(deps)`.

- [ ] **Step 1: Write the failing tests**

`test/integration/chord-progression.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { useDatabase } = require('../support/db');
var { request, buildApp, signUp, bearer } = require('../support/app');
var { sampleProgression } = require('../support/fixtures');

useDatabase();
var app = buildApp();

var UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function getProgression(session) {
  return request(app).get('/chord-progression').set('Authorization', bearer(session));
}

function putProgression(session, body) {
  return request(app).put('/chord-progression').set('Authorization', bearer(session)).send(body);
}

function degrees(progression) {
  return progression.map(function (chord) {
    return chord.degree;
  });
}

test('chord progression endpoints require an access token', async function () {
  var res = await request(app).get('/chord-progression');
  assert.equal(res.status, 401);
});

test('a progression that was never saved is not found', async function () {
  var session = await signUp(app);
  var res = await getProgression(session);
  assert.equal(res.status, 404);
  assert.equal(res.body.error.code, 'NOT_FOUND');
});

test('a saved progression reads back in order, with server-generated ids', async function () {
  var session = await signUp(app);
  var put = await putProgression(session, sampleProgression());
  assert.equal(put.status, 204);

  var res = await getProgression(session);
  assert.equal(res.status, 200);
  assert.equal(res.body.key, 'F♯');
  assert.equal(res.body.tonality, 'Minor');
  assert.deepEqual(degrees(res.body.progression), [0, 3, 4]);
  res.body.progression.forEach(function (chord) {
    assert.match(chord.id, UUID);
  });
});

test('PUT replaces the key and the chords, and an empty progression is allowed', async function () {
  var session = await signUp(app);
  await putProgression(session, sampleProgression());
  await putProgression(session, { key: 'G', tonality: 'Major', progression: [] });
  var res = await getProgression(session);
  assert.deepEqual(res.body, { key: 'G', tonality: 'Major', progression: [] });
});

test('each user sees only their own progression', async function () {
  var jo = await signUp(app);
  var sam = await signUp(app, { email: 'sam@example.com' });
  await putProgression(jo, sampleProgression());
  assert.equal((await getProgression(sam)).status, 404);
});

test('the key must belong to the tonality', async function () {
  var session = await signUp(app);
  var bad = await putProgression(session, sampleProgression({ key: 'C♯', tonality: 'Major' }));
  assert.equal(bad.status, 400);
  assert.deepEqual(bad.body.error.details, [{ path: 'key', message: 'C♯ is not a Major progression key' }]);
  var good = await putProgression(session, sampleProgression({ key: 'C♯', tonality: 'Minor' }));
  assert.equal(good.status, 204);
});

test('tonality, degrees and length are validated', async function () {
  var session = await signUp(app);
  var cases = [
    [sampleProgression({ tonality: 'Lydian' }), 'tonality'],
    [sampleProgression({ progression: [{ id: 'x', degree: 7 }] }), 'progression.0.degree'],
    [sampleProgression({ progression: Array(101).fill({ id: 'x', degree: 1 }) }), 'progression'],
  ];
  for (var entry of cases) {
    var res = await putProgression(session, entry[0]);
    assert.equal(res.status, 400, entry[1]);
    assert.equal(res.body.error.details[0].path, entry[1]);
  }
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:integration`
Expected: FAIL — `chord-progression.test.js` gets `404` from `/chord-progression`.

- [ ] **Step 3: Write validation and the service**

`validation/chordProgression.js`:

```js
var { z } = require('zod');
var { tonalitySchema } = require('./fretboard');
var { MAX_CHORDS } = require('../lib/limits');

// Mirrors majorProgressionKeys / minorProgressionKeys in fret-wizard/src/lib/music-theory/progressions.ts.
var KEYS_BY_TONALITY = {
  Major: ['C', 'G', 'D', 'A', 'E', 'B', 'F♯', 'D♭', 'A♭', 'E♭', 'B♭', 'F'],
  Minor: ['A', 'E', 'B', 'F♯', 'C♯', 'G♯', 'E♭', 'B♭', 'F', 'C', 'G', 'D'],
};

var chordProgressionSchema = z.object({
  key: z.string(),
  tonality: tonalitySchema,
  progression: z.array(z.object({ degree: z.number().int().min(0).max(6) }))
    .max(MAX_CHORDS, 'A progression can hold at most ' + MAX_CHORDS + ' chords'),
}).superRefine(function (value, ctx) {
  if (!KEYS_BY_TONALITY[value.tonality].includes(value.key)) {
    ctx.addIssue({
      code: z.ZodIssueCode.custom,
      path: ['key'],
      message: value.key + ' is not a ' + value.tonality + ' progression key',
    });
  }
});

module.exports = { chordProgressionSchema };
```

`services/chordProgression.js`:

```js
async function getProgression(db, userId) {
  var progression = await db.chordProgression.findUnique({
    where: { UserId: userId },
    include: { Chords: { orderBy: { Position: 'asc' } } },
  });
  if (!progression) return null;
  return {
    key: progression.KeyName,
    tonality: progression.Tonality,
    progression: progression.Chords.map(function (chord) {
      return { id: chord.ProgressionChordId, degree: chord.Degree };
    }),
  };
}

async function hasProgression(db, userId) {
  return (await db.chordProgression.count({ where: { UserId: userId } })) > 0;
}

// Call inside a transaction: the upsert, delete and insert must land together.
async function replaceProgression(db, userId, input) {
  await db.chordProgression.upsert({
    where: { UserId: userId },
    create: { UserId: userId, KeyName: input.key, Tonality: input.tonality },
    update: { KeyName: input.key, Tonality: input.tonality },
  });
  await db.progressionChord.deleteMany({ where: { UserId: userId } });
  if (input.progression.length > 0) {
    await db.progressionChord.createMany({
      data: input.progression.map(function (chord, index) {
        return { UserId: userId, Position: index, Degree: chord.degree };
      }),
    });
  }
}

module.exports = { getProgression, hasProgression, replaceProgression };
```

- [ ] **Step 4: Write the router**

`routes/chordProgression.js`:

```js
var express = require('express');
var asyncHandler = require('../lib/asyncHandler');
var validate = require('../middleware/validate');
var chordProgression = require('../services/chordProgression');
var { notFound } = require('../lib/errors');
var { chordProgressionSchema } = require('../validation/chordProgression');

/**
 * @swagger
 * components:
 *   schemas:
 *     ChordProgression:
 *       type: object
 *       required: [key, tonality, progression]
 *       properties:
 *         key: { type: string, example: F♯ }
 *         tonality: { type: string, enum: [Major, Minor] }
 *         progression:
 *           type: array
 *           maxItems: 100
 *           items:
 *             type: object
 *             properties:
 *               id: { type: string, description: Server-generated; ignored on input }
 *               degree: { type: integer, minimum: 0, maximum: 6 }
 */

function createChordProgressionRouter(deps) {
  var prisma = deps.prisma;
  var router = express.Router();

  /**
   * @swagger
   * /chord-progression:
   *   get:
   *     summary: The saved Chord Progression
   *     tags: [Chord Progression]
   *     security: [{ bearerAuth: [] }]
   *     responses:
   *       200: { description: The progression, content: { application/json: { schema: { $ref: '#/components/schemas/ChordProgression' } } } }
   *       404: { description: Never saved }
   *   put:
   *     summary: Replace the Chord Progression
   *     tags: [Chord Progression]
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema: { $ref: '#/components/schemas/ChordProgression' }
   *     responses:
   *       204: { description: Saved }
   *       400: { description: Validation error }
   */
  router.get('/', asyncHandler(async function (req, res) {
    var progression = await chordProgression.getProgression(prisma, req.userId);
    if (!progression) throw notFound('Chord progression not saved yet');
    res.json(progression);
  }));

  router.put('/', validate({ body: chordProgressionSchema }), asyncHandler(async function (req, res) {
    await prisma.$transaction(function (tx) {
      return chordProgression.replaceProgression(tx, req.userId, req.body);
    });
    res.status(204).end();
  }));

  return router;
}

module.exports = createChordProgressionRouter;
```

- [ ] **Step 5: Mount the router in `app.js`**

Add below `var createWorkspacesRouter = require('./routes/workspaces');`:

```js
var createChordProgressionRouter = require('./routes/chordProgression');
```

Add below `app.use('/workspaces', requireAuth, createWorkspacesRouter(deps));`:

```js
  app.use('/chord-progression', requireAuth, createChordProgressionRouter(deps));
```

- [ ] **Step 6: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — unit 23, integration 60 (53 + 7).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "feat: chord progression endpoints" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A10: Guest-data import

**Files:**
- Create: `validation/import.js`, `services/import.js`, `test/integration/import.test.js`
- Modify: `routes/me.js` (one route and imports)

**Interfaces:**
- Consumes: `createCardSchema` (A7), `workspaceSchema` (A8), `chordProgressionSchema` (A9); `library.assertCardCapacity`, `library.createCard` (A7); `workspaces.setupFromParam`, `hasWorkspace`, `replaceWorkspace` (A8); `chordProgression.hasProgression`, `replaceProgression` (A9).
- Produces:
  - `validation/import.js`: `{ importSchema }`.
  - `services/import.js`: `importGuestData(prisma, userId, { libraryCards?, workspaces?: { scale?, chord? }, chordProgression? }) → Promise<{ importedCards: number, appliedWorkspaces: ('scale' | 'chord')[], appliedChordProgression: boolean }>`.
  - `POST /me/import`.

- [ ] **Step 1: Write the failing tests**

`test/integration/import.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { prisma, useDatabase } = require('../support/db');
var { request, buildApp, signUp, bearer } = require('../support/app');
var { sampleFretboard, sampleProgression } = require('../support/fixtures');

useDatabase();
var app = buildApp();

function importBody() {
  return {
    libraryCards: [
      { name: 'One', setup: 'Scale', fretboards: [sampleFretboard({ currentKey: 'C' })] },
      { name: 'Two', setup: 'Chord', fretboards: [sampleFretboard({ currentKey: 'D' }), sampleFretboard({ currentKey: 'E' })] },
      { name: 'Three', setup: 'Scale', fretboards: [sampleFretboard({ currentKey: 'G' })] },
    ],
    workspaces: {
      scale: { fretboards: [sampleFretboard({ currentKey: 'A' })] },
      chord: { fretboards: [sampleFretboard({ currentKey: 'B' })] },
    },
    chordProgression: sampleProgression(),
  };
}

function postImport(session, body) {
  return request(app).post('/me/import').set('Authorization', bearer(session)).send(body);
}

function get(session, path) {
  return request(app).get(path).set('Authorization', bearer(session));
}

function put(session, path, body) {
  return request(app).put(path).set('Authorization', bearer(session)).send(body);
}

function names(cards) {
  return cards.map(function (card) {
    return card.name;
  });
}

test('import fills an empty account and keeps the browser\'s card order', async function () {
  var session = await signUp(app);
  var res = await postImport(session, importBody());
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { importedCards: 3, appliedWorkspaces: ['scale', 'chord'], appliedChordProgression: true });

  var cards = (await get(session, '/library-cards')).body;
  assert.deepEqual(names(cards), ['One', 'Two', 'Three']);
  assert.deepEqual(cards[1].fretboards.map(function (fretboard) {
    return fretboard.currentKey;
  }), ['D', 'E']);
  assert.equal((await get(session, '/workspaces/scale')).body.fretboards[0].currentKey, 'A');
  assert.equal((await get(session, '/workspaces/chord')).body.fretboards[0].currentKey, 'B');
  assert.equal((await get(session, '/chord-progression')).body.key, 'F♯');
});

test('the account wins for workspaces and the progression; cards are appended', async function () {
  var session = await signUp(app);
  await put(session, '/workspaces/scale', { fretboards: [sampleFretboard({ currentKey: 'F' })] });
  await put(session, '/chord-progression', sampleProgression({ key: 'C', tonality: 'Major' }));
  await request(app).post('/library-cards').set('Authorization', bearer(session))
    .send({ name: 'Existing', setup: 'Scale', fretboards: [sampleFretboard()] }).expect(201);

  var res = await postImport(session, importBody());
  assert.deepEqual(res.body, { importedCards: 3, appliedWorkspaces: ['chord'], appliedChordProgression: false });

  assert.equal((await get(session, '/workspaces/scale')).body.fretboards[0].currentKey, 'F');
  assert.equal((await get(session, '/workspaces/chord')).body.fretboards[0].currentKey, 'B');
  assert.equal((await get(session, '/chord-progression')).body.key, 'C');
  assert.deepEqual(names((await get(session, '/library-cards')).body), ['Existing', 'One', 'Two', 'Three']);
});

test('one invalid item rejects the whole import', async function () {
  var session = await signUp(app);
  var body = importBody();
  body.libraryCards[1].fretboards[0].fretAmount = 99;

  var res = await postImport(session, body);
  assert.equal(res.status, 400);
  assert.equal(res.body.error.details[0].path, 'libraryCards.1.fretboards.0.fretAmount');
  assert.equal(await prisma.libraryCard.count(), 0);
  assert.equal((await get(session, '/workspaces/scale')).status, 404);
  assert.equal((await get(session, '/chord-progression')).status, 404);
});

test('an import that would pass 200 cards is refused and changes nothing', async function () {
  var session = await signUp(app);
  await prisma.libraryCard.createMany({
    data: Array.from({ length: 199 }, function (_, index) {
      return { UserId: session.user.id, Name: 'Card ' + index, Setup: 'Scale' };
    }),
  });

  var res = await postImport(session, importBody());
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'LIMIT_EXCEEDED');
  assert.equal(await prisma.libraryCard.count({ where: { UserId: session.user.id } }), 199);
  assert.equal((await get(session, '/workspaces/scale')).status, 404);
});

test('an empty import changes nothing', async function () {
  var session = await signUp(app);
  var res = await postImport(session, {});
  assert.equal(res.status, 200);
  assert.deepEqual(res.body, { importedCards: 0, appliedWorkspaces: [], appliedChordProgression: false });
});

test('import requires an access token', async function () {
  var res = await request(app).post('/me/import').send(importBody());
  assert.equal(res.status, 401);
});
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm run test:integration`
Expected: FAIL — `import.test.js` gets `404` from `/me/import` (except the 401 test, which passes because `/me` is already protected).

- [ ] **Step 3: Write validation and the import service**

`validation/import.js`:

```js
var { z } = require('zod');
var { createCardSchema } = require('./library');
var { workspaceSchema } = require('./workspaces');
var { chordProgressionSchema } = require('./chordProgression');
var { MAX_CARDS } = require('../lib/limits');

var importSchema = z.object({
  libraryCards: z.array(createCardSchema).max(MAX_CARDS, 'At most ' + MAX_CARDS + ' cards can be imported').optional(),
  workspaces: z.object({ scale: workspaceSchema.optional(), chord: workspaceSchema.optional() }).optional(),
  chordProgression: chordProgressionSchema.optional(),
});

module.exports = { importSchema };
```

`services/import.js`:

```js
var library = require('./library');
var workspaces = require('./workspaces');
var chordProgression = require('./chordProgression');

var IMPORT_TIMEOUT_MS = 30 * 1000;

// Cards are always added. Workspaces and the progression only fill empty slots:
// if the account already has its own, the account wins.
async function importGuestData(prisma, userId, input) {
  var cards = input.libraryCards || [];
  var incomingWorkspaces = input.workspaces || {};

  return prisma.$transaction(async function (tx) {
    await library.assertCardCapacity(tx, userId, cards.length);
    var startedAt = Date.now();
    for (var i = 0; i < cards.length; i++) {
      // One millisecond apart, so the Library lists them in the browser's order.
      await library.createCard(tx, userId, cards[i], new Date(startedAt + i));
    }

    var appliedWorkspaces = [];
    for (var param of ['scale', 'chord']) {
      var setup = workspaces.setupFromParam(param);
      if (incomingWorkspaces[param] && !(await workspaces.hasWorkspace(tx, userId, setup))) {
        await workspaces.replaceWorkspace(tx, userId, setup, incomingWorkspaces[param].fretboards);
        appliedWorkspaces.push(param);
      }
    }

    var appliedChordProgression = false;
    if (input.chordProgression && !(await chordProgression.hasProgression(tx, userId))) {
      await chordProgression.replaceProgression(tx, userId, input.chordProgression);
      appliedChordProgression = true;
    }

    return {
      importedCards: cards.length,
      appliedWorkspaces: appliedWorkspaces,
      appliedChordProgression: appliedChordProgression,
    };
  }, { timeout: IMPORT_TIMEOUT_MS });
}

module.exports = { importGuestData };
```

- [ ] **Step 4: Add `POST /me/import` to `routes/me.js`**

Add below `var users = require('../services/users');`:

```js
var importService = require('../services/import');
var { importSchema } = require('../validation/import');
```

Insert directly above `  return router;`:

```js
  /**
   * @swagger
   * /me/import:
   *   post:
   *     summary: Copy a guest's browser data into the account
   *     description: Cards are appended. Each workspace and the progression are only saved if the account has none yet. All or nothing.
   *     tags: [Me]
   *     security: [{ bearerAuth: [] }]
   *     requestBody:
   *       required: true
   *       content:
   *         application/json:
   *           schema:
   *             type: object
   *             properties:
   *               libraryCards: { type: array, maxItems: 200, items: { type: object, properties: { name: { type: string }, setup: { type: string, enum: [Scale, Chord] }, fretboards: { type: array, items: { $ref: '#/components/schemas/FretboardData' } } } } }
   *               workspaces: { type: object, properties: { scale: { type: object, properties: { fretboards: { type: array, items: { $ref: '#/components/schemas/FretboardData' } } } }, chord: { type: object, properties: { fretboards: { type: array, items: { $ref: '#/components/schemas/FretboardData' } } } } } }
   *               chordProgression: { $ref: '#/components/schemas/ChordProgression' }
   *     responses:
   *       200: { description: What was applied, content: { application/json: { schema: { type: object, properties: { importedCards: { type: integer }, appliedWorkspaces: { type: array, items: { type: string, enum: [scale, chord] } }, appliedChordProgression: { type: boolean } } } } } }
   *       400: { description: Validation error; nothing saved }
   *       409: { description: LIMIT_EXCEEDED; nothing saved }
   */
  router.post('/import', validate({ body: importSchema }), asyncHandler(async function (req, res) {
    res.json(await importService.importGuestData(prisma, req.userId, req.body));
  }));

```

- [ ] **Step 5: Run the tests to verify they pass**

Run: `npm test`
Expected: PASS — unit 23, integration 66 (60 + 6).

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Commit**

```bash
git add -A
git commit -m "feat: all-or-nothing guest-data import" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task A11: API documentation check and project docs

**Files:**
- Create: `test/unit/swagger.test.js`
- Modify (full rewrite): `CLAUDE.md`, `structure.md`

**Interfaces:**
- Consumes: `lib/swagger.js` (A1) and the JSDoc on every route (A1–A10).
- Produces: nothing new for later tasks. The backend is complete; Part B builds against it.

- [ ] **Step 1: Write the documentation coverage test**

`test/unit/swagger.test.js`:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var swaggerSpec = require('../../lib/swagger');

var EXPECTED = {
  '/health': ['get'],
  '/auth/signup': ['post'],
  '/auth/login': ['post'],
  '/auth/google': ['post'],
  '/auth/refresh': ['post'],
  '/auth/logout': ['post'],
  '/me': ['get', 'patch'],
  '/me/import': ['post'],
  '/library-cards': ['get', 'post'],
  '/library-cards/{id}': ['delete', 'patch'],
  '/workspaces/{setup}': ['get', 'put'],
  '/chord-progression': ['get', 'put'],
};

var PROTECTED = ['/me', '/me/import', '/library-cards', '/library-cards/{id}', '/workspaces/{setup}', '/chord-progression'];

test('every endpoint is documented', function () {
  assert.deepEqual(Object.keys(swaggerSpec.paths).sort(), Object.keys(EXPECTED).sort());
  Object.keys(EXPECTED).forEach(function (path) {
    assert.deepEqual(Object.keys(swaggerSpec.paths[path]).sort(), EXPECTED[path], path);
  });
});

test('protected endpoints declare bearer auth', function () {
  PROTECTED.forEach(function (path) {
    Object.keys(swaggerSpec.paths[path]).forEach(function (method) {
      assert.deepEqual(swaggerSpec.paths[path][method].security, [{ bearerAuth: [] }], method + ' ' + path);
    });
  });
});
```

- [ ] **Step 2: Run the test**

Run: `npm run test:unit`
Expected: PASS — 25 tests. If either test fails, fix the JSDoc block of the route it names (missing method, missing `security: [{ bearerAuth: [] }]`, or a YAML indentation error that makes swagger-jsdoc skip the block), then re-run.

- [ ] **Step 3: Replace `CLAUDE.md`**

```markdown
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
```

- [ ] **Step 4: Replace `structure.md`**

~~~~markdown
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
  -> route handler -> service -> Prisma -> SQL Server
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
~~~~

- [ ] **Step 5: Run everything**

Run: `npm test`
Expected: PASS — unit 25, integration 66.

Run: `npm run lint`
Expected: no errors.

- [ ] **Step 6: Start the real server (only if `.env` exists)**

Run: `npm start`, then in a second terminal `curl -s http://localhost:3000/health`
Expected: `{"ok":true}`. Stop the server with Ctrl+C. If `.env` doesn't exist yet, skip this step; Task B5 covers it.

- [ ] **Step 7: Commit**

```bash
git add -A
git commit -m "docs: API documentation check, CLAUDE.md and structure.md for the new service" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

## Part B — Frontend (`fret-wizard/`)

The backend from Part A must be complete. The frontend tests mock `fetch`, so they don't need it running; only the manual checks in Tasks B4 and B5 do.

### Task B1: Test setup, API config, session and HTTP client

**Files:**
- Create: `vitest.config.ts`, `.env.development`, `src/services/apiConfig.ts`, `src/services/apiTypes.ts`, `src/services/session.ts`, `src/services/http.ts`, `tests/unit/support.ts`, `tests/unit/session.test.ts`, `tests/unit/http.test.ts`
- Modify: `src/vite-env.d.ts`, `package.json` (dev dependencies via npm, `test` script)

**Interfaces:**
- Consumes: the API contract (spec Section 6).
- Produces:
  - `apiConfig.ts`: `apiBaseUrl() → string | undefined` (trailing slashes removed), `accountsEnabled() → boolean`, `googleClientId() → string | undefined`.
  - `apiTypes.ts`: `User`, `TokenPair`, `AuthResponse`, `ApiErrorDetail`, `ApiErrorBody`, `ImportRequest`, `ImportResult`.
  - `session.ts`: `refreshTokenStorageKey = 'refreshToken'`, `type RefreshOutcome = 'refreshed' | 'rejected' | 'unreachable'`, `getAccessToken()`, `getRefreshToken()`, `setTokens(pair)`, `clearTokens()`, `onSessionExpired(handler)`, `expireSession()`, `refreshSession() → Promise<RefreshOutcome>`.
  - `http.ts`: `class ApiError { status, code, message, details }`, `type HttpMethod`, `apiRequest<T>(method, path, body?) → Promise<T>` (204 → `undefined`).
  - `tests/unit/support.ts`: `API = 'http://api.test'`, `enableAccounts()`, `jsonResponse(status, body?)`, `routeFetch(routes)` (keys like `'POST /auth/refresh'`; returns the `vi.fn` mock), `requestBody(init)`.

- [ ] **Step 1: Create the branch**

```bash
git checkout fretwizard-2.0
git checkout -b feature/accounts-and-sync
```

(`temp.txt` is untracked; leave it alone and never `git add` it.)

- [ ] **Step 2: Install Vitest and add the test script**

```bash
npm install -D vitest@^2.1.9 happy-dom@^15.11.7
```

In `package.json`, add to `"scripts"` after `"preview"`:

```json
    "test": "vitest run",
```

`vitest.config.ts`:

```ts
import { defineConfig, mergeConfig } from 'vitest/config'
import viteConfig from './vite.config'

export default mergeConfig(viteConfig, defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.ts'],
    restoreMocks: true,
    unstubEnvs: true,
    unstubGlobals: true,
  },
}))
```

- [ ] **Step 3: Declare the env variables**

`src/vite-env.d.ts` (replace the file):

```ts
/// <reference types="vite/client" />

interface ImportMetaEnv {
  readonly VITE_API_BASE_URL?: string
  readonly VITE_GOOGLE_CLIENT_ID?: string
}

interface ImportMeta {
  readonly env: ImportMetaEnv
}
```

`.env.development`:

```
# Local backend (fretWizard-service: npm start). Leave VITE_API_BASE_URL unset to run guest-only.
VITE_API_BASE_URL=http://localhost:3000
# Google OAuth client ID (Web application). While empty, the Google button is hidden.
VITE_GOOGLE_CLIENT_ID=
```

There is deliberately no `.env.production`: production builds have no `VITE_API_BASE_URL`, so the GitHub Pages site stays guest-only until the API is hosted.

- [ ] **Step 4: Write the test support file**

`tests/unit/support.ts`:

```ts
import { vi } from 'vitest'

export const API = 'http://api.test'

export const enableAccounts = (): void => {
  vi.stubEnv('VITE_API_BASE_URL', API)
}

export const jsonResponse = (status: number, body?: unknown): Response =>
  new Response(body === undefined ? null : JSON.stringify(body), {
    status,
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
  })

type Handler = (init: RequestInit) => Response | Promise<Response>

// Stubs fetch with handlers keyed by "METHOD /path"; unknown requests throw.
export const routeFetch = (routes: Record<string, Handler>) => {
  const mock = vi.fn(async (input: RequestInfo | URL, init: RequestInit = {}) => {
    const url = new URL(typeof input === 'string' ? input : input.toString())
    const key = `${init.method ?? 'GET'} ${url.pathname}`
    const handler = routes[key]
    if (!handler) throw new Error(`Unexpected request: ${key}`)
    return handler(init)
  })
  vi.stubGlobal('fetch', mock)
  return mock
}

export const requestBody = (init: RequestInit | undefined): unknown => JSON.parse(String(init?.body))
```

- [ ] **Step 5: Write the failing tests**

`tests/unit/session.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import {
  clearTokens,
  expireSession,
  getAccessToken,
  getRefreshToken,
  onSessionExpired,
  refreshSession,
  refreshTokenStorageKey,
  setTokens,
} from '@services/session'
import { API, enableAccounts, jsonResponse, requestBody, routeFetch } from './support'

const rejected = { error: { code: 'UNAUTHORIZED', message: 'Invalid refresh token' } }

describe('session', () => {
  beforeEach(() => {
    enableAccounts()
    localStorage.clear()
    clearTokens()
    onSessionExpired(() => {})
  })

  it('keeps the access token in memory and the refresh token in localStorage', () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    expect(getAccessToken()).toBe('access-1')
    expect(localStorage.getItem(refreshTokenStorageKey)).toBe('refresh-1')

    clearTokens()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('refreshes with the stored refresh token and stores the new pair', async () => {
    setTokens({ accessToken: 'old', refreshToken: 'refresh-1' })
    const fetchMock = routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { accessToken: 'access-2', refreshToken: 'refresh-2' }),
    })

    await expect(refreshSession()).resolves.toBe('refreshed')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/auth/refresh`)
    expect(requestBody(fetchMock.mock.calls[0][1])).toEqual({ refreshToken: 'refresh-1' })
    expect(getAccessToken()).toBe('access-2')
    expect(getRefreshToken()).toBe('refresh-2')
  })

  it('shares one request between concurrent refreshes', async () => {
    setTokens({ accessToken: 'old', refreshToken: 'refresh-1' })
    const fetchMock = routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { accessToken: 'access-2', refreshToken: 'refresh-2' }),
    })

    const outcomes = await Promise.all([refreshSession(), refreshSession(), refreshSession()])
    expect(outcomes).toEqual(['refreshed', 'refreshed', 'refreshed'])
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('reports a rejected refresh token and leaves clearing it to the caller', async () => {
    setTokens({ accessToken: 'old', refreshToken: 'refresh-1' })
    routeFetch({ 'POST /auth/refresh': () => jsonResponse(401, rejected) })

    await expect(refreshSession()).resolves.toBe('rejected')
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('treats rate limits, server errors and network failures as unreachable and keeps the token', async () => {
    setTokens({ accessToken: 'old', refreshToken: 'refresh-1' })
    const responses = [
      () => jsonResponse(429, { error: { code: 'RATE_LIMITED', message: 'Too many requests. Try again in a minute.' } }),
      () => jsonResponse(500, { error: { code: 'INTERNAL', message: 'Something went wrong' } }),
      () => {
        throw new TypeError('Failed to fetch')
      },
    ]
    for (const respond of responses) {
      routeFetch({ 'POST /auth/refresh': respond })
      await expect(refreshSession()).resolves.toBe('unreachable')
    }
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('does not call the API without a refresh token', async () => {
    const fetchMock = routeFetch({})
    await expect(refreshSession()).resolves.toBe('rejected')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('reads the refresh token inside the cross-tab lock', async () => {
    setTokens({ accessToken: 'old', refreshToken: 'refresh-1' })
    const request = vi.fn(async (_name: string, task: () => Promise<unknown>) => {
      // Another tab rotated the token while this tab waited for the lock.
      localStorage.setItem(refreshTokenStorageKey, 'rotated-by-other-tab')
      return task()
    })
    vi.stubGlobal('navigator', { locks: { request } })
    const fetchMock = routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { accessToken: 'access-3', refreshToken: 'refresh-3' }),
    })

    await refreshSession()
    expect(request).toHaveBeenCalledWith('fw-refresh', expect.any(Function))
    expect(requestBody(fetchMock.mock.calls[0][1])).toEqual({ refreshToken: 'rotated-by-other-tab' })
  })

  it('expireSession clears the tokens and notifies the handler', () => {
    const expired = vi.fn()
    onSessionExpired(expired)
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })

    expireSession()
    expect(expired).toHaveBeenCalledOnce()
    expect(getAccessToken()).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })
})
```

`tests/unit/http.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { ApiError, apiRequest } from '@services/http'
import { clearTokens, getRefreshToken, onSessionExpired, setTokens } from '@services/session'
import { API, enableAccounts, jsonResponse, requestBody, routeFetch } from './support'

const unauthorized = { error: { code: 'UNAUTHORIZED', message: 'Invalid or expired access token' } }
const user = { id: 'user-1', email: 'jo@example.com', username: 'Jo' }

const authorization = (init: RequestInit | undefined): string | undefined =>
  (init?.headers as Record<string, string> | undefined)?.Authorization

describe('apiRequest', () => {
  beforeEach(() => {
    enableAccounts()
    localStorage.clear()
    clearTokens()
    onSessionExpired(() => {})
  })

  it('sends JSON with the bearer token', async () => {
    setTokens({ accessToken: 'access-1', refreshToken: 'refresh-1' })
    const fetchMock = routeFetch({ 'PATCH /me': () => jsonResponse(200, user) })

    await expect(apiRequest('PATCH', '/me', { username: 'Jo' })).resolves.toEqual(user)
    const [url, init] = fetchMock.mock.calls[0]
    expect(url).toBe(`${API}/me`)
    expect(init?.headers).toEqual({ 'Content-Type': 'application/json', Authorization: 'Bearer access-1' })
    expect(requestBody(init)).toEqual({ username: 'Jo' })
  })

  it('sends no body headers without a body and no Authorization without a token', async () => {
    const fetchMock = routeFetch({ 'GET /health': () => jsonResponse(200, { ok: true }) })
    await apiRequest('GET', '/health')
    expect(fetchMock.mock.calls[0][1]?.headers).toEqual({})
    expect(fetchMock.mock.calls[0][1]?.body).toBeUndefined()
  })

  it('removes trailing slashes from VITE_API_BASE_URL', async () => {
    vi.stubEnv('VITE_API_BASE_URL', `${API}//`)
    const fetchMock = routeFetch({ 'GET /health': () => jsonResponse(200, { ok: true }) })
    await apiRequest('GET', '/health')
    expect(fetchMock.mock.calls[0][0]).toBe(`${API}/health`)
  })

  it('returns undefined for 204 responses', async () => {
    routeFetch({ 'DELETE /library-cards/card-1': () => jsonResponse(204) })
    await expect(apiRequest('DELETE', '/library-cards/card-1')).resolves.toBeUndefined()
  })

  it('turns error bodies into ApiError', async () => {
    const details = [{ path: 'email', message: 'Enter a valid email address' }]
    routeFetch({
      'POST /auth/signup': () => jsonResponse(400, { error: { code: 'VALIDATION_ERROR', message: 'Invalid request', details } }),
    })
    const error = await apiRequest('POST', '/auth/signup', {}).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(error).toMatchObject({ status: 400, code: 'VALIDATION_ERROR', message: 'Invalid request', details })
  })

  it('falls back to INTERNAL when the error body is not JSON', async () => {
    routeFetch({ 'GET /me': () => new Response('Bad gateway', { status: 502 }) })
    await expect(apiRequest('GET', '/me')).rejects.toMatchObject({ status: 502, code: 'INTERNAL', details: [] })
  })

  it('refreshes once and retries after a 401', async () => {
    setTokens({ accessToken: 'expired', refreshToken: 'refresh-1' })
    const fetchMock = routeFetch({
      'GET /library-cards': (init) => authorization(init) === 'Bearer fresh' ? jsonResponse(200, []) : jsonResponse(401, unauthorized),
      'POST /auth/refresh': () => jsonResponse(200, { accessToken: 'fresh', refreshToken: 'refresh-2' }),
    })

    await expect(apiRequest('GET', '/library-cards')).resolves.toEqual([])
    expect(fetchMock).toHaveBeenCalledTimes(3)
  })

  it('expires the session when the refresh token is rejected', async () => {
    setTokens({ accessToken: 'expired', refreshToken: 'refresh-1' })
    const expired = vi.fn()
    onSessionExpired(expired)
    routeFetch({
      'GET /me': () => jsonResponse(401, unauthorized),
      'POST /auth/refresh': () => jsonResponse(401, unauthorized),
    })

    await expect(apiRequest('GET', '/me')).rejects.toMatchObject({ status: 401, code: 'UNAUTHORIZED' })
    expect(expired).toHaveBeenCalledOnce()
    expect(getRefreshToken()).toBeNull()
  })

  it('keeps the session when the refresh endpoint is unreachable', async () => {
    setTokens({ accessToken: 'expired', refreshToken: 'refresh-1' })
    const expired = vi.fn()
    onSessionExpired(expired)
    routeFetch({
      'GET /me': () => jsonResponse(401, unauthorized),
      'POST /auth/refresh': () => jsonResponse(503, { error: { code: 'INTERNAL', message: 'Something went wrong' } }),
    })

    await expect(apiRequest('GET', '/me')).rejects.toMatchObject({ status: 401 })
    expect(expired).not.toHaveBeenCalled()
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('never refreshes for /auth/ endpoints', async () => {
    const fetchMock = routeFetch({
      'POST /auth/login': () => jsonResponse(401, { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }),
    })
    await expect(apiRequest('POST', '/auth/login', {})).rejects.toMatchObject({ status: 401 })
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
```

- [ ] **Step 6: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Failed to resolve import "@services/session"` (and `"@services/http"`).

- [ ] **Step 7: Write the config and types**

`src/services/apiConfig.ts`:

```ts
export const apiBaseUrl = (): string | undefined => {
  const value = import.meta.env.VITE_API_BASE_URL
  return value ? value.replace(/\/+$/, '') : undefined
}

// Without an API URL the app is guest-only, exactly as before accounts existed.
export const accountsEnabled = (): boolean => apiBaseUrl() !== undefined

export const googleClientId = (): string | undefined => import.meta.env.VITE_GOOGLE_CLIENT_ID || undefined
```

`src/services/apiTypes.ts`:

```ts
import type { Setup } from '@data/constants'
import type { FretboardData } from '@/lib/fretboardData'
import type { ChordProgression } from '@services/adapters/localStorageAdapter'

export interface User {
  id: string
  email: string
  username: string
}

export interface TokenPair {
  accessToken: string
  refreshToken: string
}

export interface AuthResponse extends TokenPair {
  user: User
  isNewUser?: boolean
}

export interface ApiErrorDetail {
  path: string
  message: string
}

export interface ApiErrorBody {
  error: {
    code: string
    message: string
    details?: ApiErrorDetail[]
  }
}

export interface ImportRequest {
  libraryCards?: { name: string; setup: Setup; fretboards: FretboardData[] }[]
  workspaces?: {
    scale?: { fretboards: FretboardData[] }
    chord?: { fretboards: FretboardData[] }
  }
  chordProgression?: ChordProgression
}

export interface ImportResult {
  importedCards: number
  appliedWorkspaces: ('scale' | 'chord')[]
  appliedChordProgression: boolean
}
```

- [ ] **Step 8: Write the session module**

`src/services/session.ts`:

```ts
import { apiBaseUrl } from '@services/apiConfig'
import type { TokenPair } from '@services/apiTypes'

export type RefreshOutcome = 'refreshed' | 'rejected' | 'unreachable'

export const refreshTokenStorageKey = 'refreshToken'
const refreshLockName = 'fw-refresh'

// The access token lives in memory only; the refresh token survives reloads in localStorage.
let accessToken: string | null = null
let refreshInFlight: Promise<RefreshOutcome> | null = null
let sessionExpiredHandler: () => void = () => {}

export const getAccessToken = (): string | null => accessToken

export const getRefreshToken = (): string | null => localStorage.getItem(refreshTokenStorageKey)

export const setTokens = (tokens: TokenPair): void => {
  accessToken = tokens.accessToken
  localStorage.setItem(refreshTokenStorageKey, tokens.refreshToken)
}

export const clearTokens = (): void => {
  accessToken = null
  localStorage.removeItem(refreshTokenStorageKey)
}

export const onSessionExpired = (handler: () => void): void => {
  sessionExpiredHandler = handler
}

export const expireSession = (): void => {
  clearTokens()
  sessionExpiredHandler()
}

// Serialises refreshes across tabs, so two tabs never send the same refresh token
// (the server treats that as reuse and revokes the whole session).
const withRefreshLock = <T>(task: () => Promise<T>): Promise<T> => {
  if (typeof navigator !== 'undefined' && navigator.locks) {
    return navigator.locks.request(refreshLockName, task) as Promise<T>
  }
  return task()
}

const requestRefresh = async (): Promise<RefreshOutcome> => {
  // Read inside the lock: another tab may have rotated the token while we waited.
  const refreshToken = getRefreshToken()
  if (!refreshToken) return 'rejected'
  try {
    const res = await fetch(`${apiBaseUrl()}/auth/refresh`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ refreshToken }),
    })
    if (res.status === 400 || res.status === 401) return 'rejected'
    if (!res.ok) return 'unreachable'
    setTokens(await res.json() as TokenPair)
    return 'refreshed'
  } catch {
    return 'unreachable'
  }
}

export const refreshSession = (): Promise<RefreshOutcome> => {
  if (!refreshInFlight) {
    refreshInFlight = withRefreshLock(requestRefresh).finally(() => {
      refreshInFlight = null
    })
  }
  return refreshInFlight
}
```

- [ ] **Step 9: Write the HTTP client**

`src/services/http.ts`:

```ts
import { apiBaseUrl } from '@services/apiConfig'
import { expireSession, getAccessToken, refreshSession } from '@services/session'
import type { ApiErrorBody, ApiErrorDetail } from '@services/apiTypes'

export type HttpMethod = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE'

export class ApiError extends Error {
  status: number
  code: string
  details: ApiErrorDetail[]

  constructor(status: number, code: string, message: string, details: ApiErrorDetail[] = []) {
    super(message)
    this.name = 'ApiError'
    this.status = status
    this.code = code
    this.details = details
  }
}

const send = (method: HttpMethod, path: string, body: unknown): Promise<Response> => {
  const headers: Record<string, string> = {}
  if (body !== undefined) headers['Content-Type'] = 'application/json'
  const token = getAccessToken()
  if (token) headers['Authorization'] = `Bearer ${token}`
  return fetch(`${apiBaseUrl()}${path}`, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}

const toApiError = async (res: Response): Promise<ApiError> => {
  try {
    const { error } = await res.json() as ApiErrorBody
    return new ApiError(res.status, error.code, error.message, error.details ?? [])
  } catch {
    return new ApiError(res.status, 'INTERNAL', 'Something went wrong')
  }
}

export const apiRequest = async <T>(method: HttpMethod, path: string, body?: unknown): Promise<T> => {
  let res = await send(method, path, body)
  if (res.status === 401 && !path.startsWith('/auth/')) {
    const outcome = await refreshSession()
    if (outcome === 'refreshed') {
      res = await send(method, path, body)
    } else if (outcome === 'rejected') {
      expireSession()
    }
  }
  if (!res.ok) throw await toApiError(res)
  if (res.status === 204) return undefined as T
  return await res.json() as T
}
```

- [ ] **Step 10: Run the tests and the type-checked build**

Run: `npm test`
Expected: PASS — 18 tests (8 session, 10 http).

Run: `npm run build`
Expected: `vue-tsc` reports no errors and Vite writes `dist/`.

- [ ] **Step 11: Commit**

```bash
git add package.json package-lock.json vitest.config.ts .env.development src/vite-env.d.ts src/services/apiConfig.ts src/services/apiTypes.ts src/services/session.ts src/services/http.ts tests/unit
git commit -m "feat: API config, session tokens with cross-tab-safe refresh, and HTTP client" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B2: Guest-data collection and the auth store

**Files:**
- Create: `src/services/authApi.ts`, `src/services/guestData.ts`, `src/stores/useAuthStore.ts`, `tests/unit/guestData.test.ts`, `tests/unit/authStore.test.ts`
- Modify: `src/services/adapters/localStorageAdapter.ts` (export two key constants)

**Interfaces:**
- Consumes: `apiRequest`, `ApiError` (B1); `session.ts` (B1); `accountsEnabled` (B1); local adapter reads; `defaultDataFor` (`src/lib/fretboardData.ts`); `progressionKeys` (`@data/progressions`).
- Produces:
  - `authApi.ts`: `SignupInput`, `LoginInput`, `signupRequest`, `loginRequest`, `googleRequest(idToken)`, `logoutRequest(refreshToken)`, `fetchMe()`, `importRequest(data)`.
  - `localStorageAdapter.ts`: `export const chordProgressionStorageKey`, `export const syncedStorageKeys: string[]`.
  - `guestData.ts`: `collectGuestData() → ImportRequest | null`, `clearGuestData()`.
  - `useAuthStore` (Pinia id `auth`): state `user`, `status: 'restoring' | 'guest' | 'authenticated'`, `sessionVersion`, `importFailed`; getter `isAuthenticated`; actions `startSessionListeners()`, `restoreSession()`, `signup(input)`, `login(input)`, `loginWithGoogle(idToken)`, `logout()`, `becomeGuest()`. Status becomes `authenticated` only **after** the guest-data import has run.

- [ ] **Step 1: Export the synced storage keys from the local adapter**

In `src/services/adapters/localStorageAdapter.ts`, change

```ts
const chordProgressionStorageKey = 'chordProgression'
```

to

```ts
export const chordProgressionStorageKey = 'chordProgression'
```

and add directly below the `fretboardListStorageKeys` object:

```ts
// Everything that syncs to an account; cleared after a successful import.
export const syncedStorageKeys: string[] = [
  libraryCardsStorageKey,
  chordProgressionStorageKey,
  ...Object.values(fretboardStorageKeys),
  ...Object.values(fretboardListStorageKeys),
]
```

- [ ] **Step 2: Write the failing tests**

`tests/unit/guestData.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Pattern, Setup, Theme, Tonality } from '@data/constants'
import { defaultDataFor } from '@/lib/fretboardData'
import { clearGuestData, collectGuestData } from '@services/guestData'

const save = (key: string, value: unknown) => localStorage.setItem(key, JSON.stringify(value))

describe('guest data', () => {
  beforeEach(() => localStorage.clear())

  it('returns null when the browser has nothing to import', () => {
    localStorage.setItem('theme', Theme.light)
    expect(collectGuestData()).toBeNull()
  })

  it('collects cards, both stacks and the progression', () => {
    const scale = { ...defaultDataFor(Setup.Scale), currentKey: 'A' }
    const chord = { ...defaultDataFor(Setup.Chord), currentKey: 'E' }
    save('libraryCards', [{ id: 'card-1', name: 'Shapes', setup: Setup.Chord, fretboards: [chord], createdAt: 5 }])
    save('scaleFretboardList', [scale])
    save('chordFretboardList', [chord, chord])
    save('chordProgression', { key: 'G', tonality: Tonality.MAJOR, progression: [{ id: 'p-1', degree: 4 }] })

    expect(collectGuestData()).toEqual({
      libraryCards: [{ name: 'Shapes', setup: Setup.Chord, fretboards: [chord] }],
      workspaces: { scale: { fretboards: [scale] }, chord: { fretboards: [chord, chord] } },
      chordProgression: { key: 'G', tonality: Tonality.MAJOR, progression: [{ id: 'p-1', degree: 4 }] },
    })
  })

  it('converts legacy single-fretboard cards', () => {
    const data = { ...defaultDataFor(Setup.Scale), currentKey: 'D' }
    save('libraryCards', [{ id: 'old', name: 'Old card', data, createdAt: 1 }])
    expect(collectGuestData()?.libraryCards).toEqual([{ name: 'Old card', setup: Setup.Scale, fretboards: [data] }])
  })

  it('picks up the legacy currentFretboard/fretboardList keys', () => {
    const scale = { ...defaultDataFor(Setup.Scale), currentKey: 'F' }
    const chord = { ...defaultDataFor(Setup.Chord), currentKey: 'B' }
    save('currentFretboard', scale)
    save('fretboardList', [scale, chord])

    const data = collectGuestData()
    expect(data?.workspaces?.scale?.fretboards).toEqual([scale])
    expect(data?.workspaces?.chord?.fretboards).toEqual([chord])
  })

  it('fills fields that older fretboards are missing', () => {
    save('scaleFretboardList', [{
      fretAmount: 15,
      currentKey: 'D',
      currentPattern: Pattern.Diatonic,
      currentTonality: Tonality.MAJOR,
      currentAccidental: 'sharp',
      currentHighlightNotes: ['roots'],
    }])

    const [fretboard] = collectGuestData()?.workspaces?.scale?.fretboards ?? []
    expect(fretboard).toMatchObject({
      fretAmount: 15,
      currentKey: 'D',
      currentSetup: Setup.Scale,
      currentHighlightNotes: ['roots'],
      currentChordPosition: 0,
      currentStrings: { E: true, A: true, D: true, G: true, B: true, e: true },
      currentCAGED: { CShape: true, AShape: true, GShape: true, EShape: true, DShape: true },
    })
  })

  it('repairs values the server would reject', () => {
    save('libraryCards', [{ id: 'c', name: '   ', setup: Setup.Scale, fretboards: [defaultDataFor(Setup.Scale)], createdAt: 1 }])
    save('chordProgression', { key: 'C♯', tonality: Tonality.MAJOR, progression: [{ id: 'p-1', degree: 2 }] })

    const data = collectGuestData()
    expect(data?.libraryCards?.[0].name).toBe('Untitled card')
    expect(data?.chordProgression).toEqual({ key: 'C', tonality: Tonality.MAJOR, progression: [{ id: 'p-1', degree: 2 }] })
  })

  it('clearGuestData removes every synced key and keeps the theme', () => {
    localStorage.setItem('theme', Theme.light)
    for (const key of ['libraryCards', 'scaleFretboardList', 'chordFretboardList', 'scaleCurrentFretboard', 'chordCurrentFretboard', 'chordProgression']) {
      localStorage.setItem(key, '[]')
    }

    clearGuestData()
    expect(localStorage.length).toBe(1)
    expect(localStorage.getItem('theme')).toBe(Theme.light)
  })
})
```

`tests/unit/authStore.test.ts`:

```ts
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { Setup } from '@data/constants'
import { defaultDataFor } from '@/lib/fretboardData'
import { useAuthStore } from '@stores/useAuthStore'
import { ApiError } from '@services/http'
import { clearTokens, expireSession, getAccessToken, getRefreshToken } from '@services/session'
import { enableAccounts, jsonResponse, requestBody, routeFetch } from './support'

const user = { id: 'user-1', email: 'jo@example.com', username: 'Jo' }
const authResponse = { accessToken: 'access-1', refreshToken: 'refresh-1', user }
const credentials = { email: 'jo@example.com', password: 'correct-horse-battery' }
const unauthorized = { error: { code: 'UNAUTHORIZED', message: 'Invalid email or password' } }
const importResult = { importedCards: 1, appliedWorkspaces: [], appliedChordProgression: false }

const saveGuestCard = () => {
  localStorage.setItem('libraryCards', JSON.stringify([
    { id: 'card-1', name: 'Card 1', setup: Setup.Scale, fretboards: [defaultDataFor(Setup.Scale)], createdAt: 1 },
  ]))
}

const guestStore = () => {
  const auth = useAuthStore()
  auth.status = 'guest'
  return auth
}

describe('auth store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    clearTokens()
    enableAccounts()
  })

  it('starts as a guest when accounts are disabled', async () => {
    vi.stubEnv('VITE_API_BASE_URL', '')
    localStorage.setItem('refreshToken', 'refresh-1')
    const fetchMock = routeFetch({})
    const auth = useAuthStore()

    await auth.restoreSession()
    expect(auth.status).toBe('guest')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('starts as a guest without a refresh token', async () => {
    const fetchMock = routeFetch({})
    const auth = useAuthStore()

    await auth.restoreSession()
    expect(auth.status).toBe('guest')
    expect(fetchMock).not.toHaveBeenCalled()
  })

  it('restores a saved session', async () => {
    localStorage.setItem('refreshToken', 'refresh-1')
    routeFetch({
      'POST /auth/refresh': () => jsonResponse(200, { accessToken: 'access-2', refreshToken: 'refresh-2' }),
      'GET /me': () => jsonResponse(200, user),
    })
    const auth = useAuthStore()

    await auth.restoreSession()
    expect(auth.status).toBe('authenticated')
    expect(auth.user).toEqual(user)
    expect(auth.sessionVersion).toBe(1)
    expect(getAccessToken()).toBe('access-2')
  })

  it('forgets a rejected refresh token', async () => {
    localStorage.setItem('refreshToken', 'refresh-1')
    routeFetch({ 'POST /auth/refresh': () => jsonResponse(401, unauthorized) })
    const auth = useAuthStore()

    await auth.restoreSession()
    expect(auth.status).toBe('guest')
    expect(getRefreshToken()).toBeNull()
  })

  it('keeps the refresh token when the API is unreachable', async () => {
    localStorage.setItem('refreshToken', 'refresh-1')
    routeFetch({ 'POST /auth/refresh': () => jsonResponse(503, { error: { code: 'INTERNAL', message: 'Something went wrong' } }) })
    const auth = useAuthStore()

    await auth.restoreSession()
    expect(auth.status).toBe('guest')
    expect(getRefreshToken()).toBe('refresh-1')
  })

  it('imports guest data before switching to the account', async () => {
    saveGuestCard()
    const auth = guestStore()
    let statusDuringImport = ''
    const fetchMock = routeFetch({
      'POST /auth/login': () => jsonResponse(200, authResponse),
      'POST /me/import': () => {
        statusDuringImport = auth.status
        return jsonResponse(200, importResult)
      },
    })

    await auth.login(credentials)
    expect(statusDuringImport).toBe('guest')
    expect(requestBody(fetchMock.mock.calls[1][1])).toMatchObject({ libraryCards: [{ name: 'Card 1', setup: Setup.Scale }] })
    expect(localStorage.getItem('libraryCards')).toBeNull()
    expect(auth.status).toBe('authenticated')
    expect(auth.user).toEqual(user)
    expect(auth.importFailed).toBe(false)
    expect(auth.sessionVersion).toBe(1)
  })

  it('keeps local data and flags the failure when the import fails', async () => {
    saveGuestCard()
    routeFetch({
      'POST /auth/login': () => jsonResponse(200, authResponse),
      'POST /me/import': () => jsonResponse(500, { error: { code: 'INTERNAL', message: 'Something went wrong' } }),
    })
    const auth = guestStore()

    await auth.login(credentials)
    expect(auth.status).toBe('authenticated')
    expect(auth.importFailed).toBe(true)
    expect(localStorage.getItem('libraryCards')).not.toBeNull()
  })

  it('skips the import when the browser has nothing saved', async () => {
    const fetchMock = routeFetch({ 'POST /auth/login': () => jsonResponse(200, authResponse) })
    const auth = guestStore()

    await auth.login(credentials)
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(auth.status).toBe('authenticated')
  })

  it('stays a guest when login fails', async () => {
    routeFetch({ 'POST /auth/login': () => jsonResponse(401, unauthorized) })
    const auth = guestStore()

    const error = await auth.login(credentials).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(ApiError)
    expect(auth.status).toBe('guest')
    expect(auth.user).toBeNull()
    expect(getRefreshToken()).toBeNull()
  })

  it('signs up and signs in with Google through the same flow', async () => {
    const fetchMock = routeFetch({
      'POST /auth/signup': () => jsonResponse(201, authResponse),
      'POST /auth/google': () => jsonResponse(200, { ...authResponse, isNewUser: true }),
      'POST /auth/logout': () => jsonResponse(204),
    })
    const auth = guestStore()

    await auth.signup({ username: 'Jo', ...credentials })
    expect(auth.status).toBe('authenticated')
    expect(requestBody(fetchMock.mock.calls[0][1])).toEqual({ username: 'Jo', ...credentials })

    await auth.logout()
    await auth.loginWithGoogle('google-credential')
    expect(auth.status).toBe('authenticated')
    expect(requestBody(fetchMock.mock.calls[2][1])).toEqual({ idToken: 'google-credential' })
  })

  it('logs out', async () => {
    const fetchMock = routeFetch({
      'POST /auth/login': () => jsonResponse(200, authResponse),
      'POST /auth/logout': () => jsonResponse(204),
    })
    const auth = guestStore()
    await auth.login(credentials)

    await auth.logout()
    expect(requestBody(fetchMock.mock.calls[1][1])).toEqual({ refreshToken: 'refresh-1' })
    expect(auth.status).toBe('guest')
    expect(auth.user).toBeNull()
    expect(getRefreshToken()).toBeNull()
    expect(getAccessToken()).toBeNull()
    expect(auth.sessionVersion).toBe(2)
  })

  it('becomes a guest when the session expires', async () => {
    routeFetch({ 'POST /auth/login': () => jsonResponse(200, authResponse) })
    const auth = guestStore()
    auth.startSessionListeners()
    await auth.login(credentials)

    expireSession()
    expect(auth.status).toBe('guest')
    expect(auth.user).toBeNull()
  })

  it('becomes a guest when another tab logs out', async () => {
    routeFetch({ 'POST /auth/login': () => jsonResponse(200, authResponse) })
    const auth = guestStore()
    auth.startSessionListeners()
    await auth.login(credentials)

    window.dispatchEvent(new StorageEvent('storage', { key: 'refreshToken', newValue: null }))
    expect(auth.status).toBe('guest')
  })
})
```

- [ ] **Step 3: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL with `Failed to resolve import "@services/guestData"` and `"@stores/useAuthStore"`.

- [ ] **Step 4: Write the auth API wrapper**

`src/services/authApi.ts`:

```ts
import { apiRequest } from '@services/http'
import type { AuthResponse, ImportRequest, ImportResult, User } from '@services/apiTypes'

export interface SignupInput {
  username: string
  email: string
  password: string
}

export interface LoginInput {
  email: string
  password: string
}

export const signupRequest = (input: SignupInput): Promise<AuthResponse> => apiRequest<AuthResponse>('POST', '/auth/signup', input)

export const loginRequest = (input: LoginInput): Promise<AuthResponse> => apiRequest<AuthResponse>('POST', '/auth/login', input)

export const googleRequest = (idToken: string): Promise<AuthResponse> => apiRequest<AuthResponse>('POST', '/auth/google', { idToken })

export const logoutRequest = (refreshToken: string): Promise<void> => apiRequest<void>('POST', '/auth/logout', { refreshToken })

export const fetchMe = (): Promise<User> => apiRequest<User>('GET', '/me')

export const importRequest = (data: ImportRequest): Promise<ImportResult> => apiRequest<ImportResult>('POST', '/me/import', data)
```

- [ ] **Step 5: Write guest-data collection**

`src/services/guestData.ts`:

```ts
import { Setup, Tonality } from '@data/constants'
import { progressionKeys } from '@data/progressions'
import { FretboardData, defaultDataFor } from '@/lib/fretboardData'
import * as local from '@services/adapters/localStorageAdapter'
import type { ChordProgression } from '@services/adapters/localStorageAdapter'
import type { ImportRequest } from '@services/apiTypes'

// Older saves can lack fields added since; fill them so the server accepts the import.
const withDefaults = (fretboard: Partial<FretboardData>, setup: Setup): FretboardData => ({
  ...defaultDataFor(setup),
  ...fretboard,
  currentSetup: setup,
})

const cardName = (name: string | undefined): string => (name ?? '').trim().slice(0, 100) || 'Untitled card'

const normalizeProgression = (saved: ChordProgression): ChordProgression => {
  const tonality = saved.tonality === Tonality.MINOR ? Tonality.MINOR : Tonality.MAJOR
  const keys = progressionKeys(tonality)
  return {
    key: keys.includes(saved.key) ? saved.key : keys[0],
    tonality,
    progression: saved.progression ?? [],
  }
}

export const collectGuestData = (): ImportRequest | null => {
  // Reading the stacks first also migrates the legacy currentFretboard/fretboardList keys.
  const scale = local.fetchFretboards(Setup.Scale)
  const chord = local.fetchFretboards(Setup.Chord)
  const cards = local.fetchLibraryCards()
  const hasProgression = localStorage.getItem(local.chordProgressionStorageKey) !== null
  if (!scale && !chord && !cards && !hasProgression) return null

  const data: ImportRequest = {}
  if (cards?.length) {
    data.libraryCards = cards.map(card => ({
      name: cardName(card.name),
      setup: card.setup,
      fretboards: card.fretboards.map(fretboard => withDefaults(fretboard, card.setup)),
    }))
  }
  if (scale?.length || chord?.length) {
    data.workspaces = {}
    if (scale?.length) data.workspaces.scale = { fretboards: scale.map(fretboard => withDefaults(fretboard, Setup.Scale)) }
    if (chord?.length) data.workspaces.chord = { fretboards: chord.map(fretboard => withDefaults(fretboard, Setup.Chord)) }
  }
  if (hasProgression) data.chordProgression = normalizeProgression(local.fetchChordProgression())
  return data
}

export const clearGuestData = (): void => {
  local.syncedStorageKeys.forEach(key => localStorage.removeItem(key))
}
```

- [ ] **Step 6: Write the auth store**

`src/stores/useAuthStore.ts`:

```ts
import { defineStore } from 'pinia'
import { accountsEnabled } from '@services/apiConfig'
import { fetchMe, googleRequest, importRequest, loginRequest, logoutRequest, signupRequest } from '@services/authApi'
import type { LoginInput, SignupInput } from '@services/authApi'
import { clearGuestData, collectGuestData } from '@services/guestData'
import { clearTokens, getRefreshToken, onSessionExpired, refreshSession, refreshTokenStorageKey, setTokens } from '@services/session'
import type { AuthResponse, User } from '@services/apiTypes'

export type AuthStatus = 'restoring' | 'guest' | 'authenticated'

export const useAuthStore = defineStore('auth', {
  state: () => ({
    user: null as User | null,
    status: 'restoring' as AuthStatus,
    // Pages are keyed on this, so they remount and reload whenever the session changes.
    sessionVersion: 0,
    importFailed: false,
  }),
  getters: {
    isAuthenticated: (state): boolean => state.status === 'authenticated',
  },
  actions: {
    startSessionListeners() {
      onSessionExpired(() => this.becomeGuest())
      window.addEventListener('storage', (event: StorageEvent) => {
        // Another tab logged out (storage events never fire in the tab that made the change).
        if (event.key === refreshTokenStorageKey && event.newValue === null && this.status === 'authenticated') {
          this.becomeGuest()
        }
      })
    },
    async restoreSession() {
      if (!accountsEnabled() || !getRefreshToken()) {
        this.status = 'guest'
        return
      }
      const outcome = await refreshSession()
      if (outcome !== 'refreshed') {
        // Unreachable keeps the token, so the next page load tries again.
        if (outcome === 'rejected') clearTokens()
        this.status = 'guest'
        return
      }
      try {
        this.user = await fetchMe()
      } catch (error) {
        console.log('restoreSession: ', error)
        this.status = 'guest'
        return
      }
      await this.enterAuthenticated()
    },
    async signup(input: SignupInput) {
      await this.completeLogin(await signupRequest(input))
    },
    async login(input: LoginInput) {
      await this.completeLogin(await loginRequest(input))
    },
    async loginWithGoogle(idToken: string) {
      await this.completeLogin(await googleRequest(idToken))
    },
    async completeLogin(response: AuthResponse) {
      setTokens(response)
      this.user = response.user
      await this.enterAuthenticated()
    },
    async enterAuthenticated() {
      // Import while still in guest mode, so no page saves defaults to the account first.
      await this.importGuestData()
      this.status = 'authenticated'
      this.sessionVersion++
    },
    async importGuestData() {
      const data = collectGuestData()
      if (!data) return
      try {
        await importRequest(data)
        clearGuestData()
        this.importFailed = false
      } catch (error) {
        console.log('importGuestData: ', error)
        this.importFailed = true
      }
    },
    async logout() {
      const refreshToken = getRefreshToken()
      if (refreshToken) {
        try {
          await logoutRequest(refreshToken)
        } catch (error) {
          console.log('logout: ', error)
        }
      }
      this.becomeGuest()
    },
    becomeGuest() {
      clearTokens()
      this.user = null
      this.status = 'guest'
      this.sessionVersion++
    },
  },
})
```

- [ ] **Step 7: Run the tests and the build**

Run: `npm test`
Expected: PASS — 38 tests (18 + 7 guestData + 13 authStore).

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 8: Commit**

```bash
git add src/services/adapters/localStorageAdapter.ts src/services/authApi.ts src/services/guestData.ts src/stores/useAuthStore.ts tests/unit/guestData.test.ts tests/unit/authStore.test.ts
git commit -m "feat: auth store with guest-data import on login" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B3: Persistence switch — per-card Library, API adapter, debounced saves

**Files:**
- Modify: `src/services/adapters/localStorageAdapter.ts` (per-card operations; `saveLibraryCards` becomes internal)
- Modify (full rewrite): `src/services/adapters/apiAdapter.ts`, `src/services/customizerService.ts`, `src/stores/useLibraryStore.ts`
- Modify: `src/stores/useAuthStore.ts` (flush before logout), `src/components/LibraryPage.vue` (`handleCreate`), `src/components/FretboardPage.vue` (`saveToLibrary`)
- Create: `tests/unit/localStorageAdapter.test.ts`, `tests/unit/apiAdapter.test.ts`, `tests/unit/libraryStore.test.ts`
- Modify: `tests/unit/authStore.test.ts` (one test)

**Interfaces:**
- Consumes: `apiRequest`, `ApiError` (B1); `useAuthStore().isAuthenticated` (B2).
- Produces:
  - `localStorageAdapter.ts`: `LibraryCardInput { name, setup, fretboards }`, `LibraryCardPatch { name?, fretboards? }`, `createLibraryCard(input) → LibraryCard`, `updateLibraryCard(id, patch) → LibraryCard | undefined`, `deleteLibraryCard(id)`.
  - `apiAdapter.ts`: `SAVE_DELAY_MS = 800`, `flushPendingSaves() → Promise<void>`, `fetchCurrentFretboard(setup)` (defaults), `saveCurrentFretboard` (no-op), `fetchFretboards`, `saveFretboards` (debounced, skipped after a failed load), `fetchLibraryCards`, `createLibraryCard`, `updateLibraryCard`, `deleteLibraryCard`, `fetchChordProgression`, `saveChordProgression` (debounced, same guard).
  - `customizerService.ts`: same function names as both adapters plus `fetchCurrentTheme`, `saveCurrentTheme` (always local) and `flushPendingSaves`. `saveLibraryCards` no longer exists.
  - `useLibraryStore`: `createCard(...) → Promise<LibraryCard | undefined>`, `reset()`, `updateCard(id, patch)`; `renameCard`, `deleteCard`, `updateCardFretboards`, `loadCards`, `ensureLoaded` keep their names.

- [ ] **Step 1: Write the failing tests**

`tests/unit/localStorageAdapter.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { Setup } from '@data/constants'
import { defaultDataFor } from '@/lib/fretboardData'
import { createLibraryCard, deleteLibraryCard, fetchLibraryCards, updateLibraryCard } from '@services/adapters/localStorageAdapter'

describe('local library cards', () => {
  beforeEach(() => localStorage.clear())

  it('creates a card with an id and a timestamp and stores it', () => {
    const fretboards = [defaultDataFor(Setup.Chord)]
    const card = createLibraryCard({ name: 'Card 1', setup: Setup.Chord, fretboards })

    expect(card).toMatchObject({ name: 'Card 1', setup: Setup.Chord, fretboards })
    expect(card.id).toMatch(/^[0-9a-f-]{36}$/)
    expect(typeof card.createdAt).toBe('number')
    expect(card.fretboards[0]).not.toBe(fretboards[0])
    expect(fetchLibraryCards()).toEqual([card])
  })

  it('renames a card and replaces its stack', () => {
    const card = createLibraryCard({ name: 'Card 1', setup: Setup.Scale, fretboards: [defaultDataFor(Setup.Scale)] })
    const stack = [{ ...defaultDataFor(Setup.Scale), currentKey: 'G' }]

    expect(updateLibraryCard(card.id, { name: 'Shapes' })?.name).toBe('Shapes')
    expect(updateLibraryCard(card.id, { fretboards: stack })?.fretboards).toEqual(stack)
    expect(fetchLibraryCards()).toEqual([{ ...card, name: 'Shapes', fretboards: stack }])
  })

  it('returns undefined when updating a card that does not exist', () => {
    createLibraryCard({ name: 'Card 1', setup: Setup.Scale, fretboards: [defaultDataFor(Setup.Scale)] })
    const before = localStorage.getItem('libraryCards')

    expect(updateLibraryCard('missing', { name: 'x' })).toBeUndefined()
    expect(localStorage.getItem('libraryCards')).toBe(before)
  })

  it('deletes a card', () => {
    const keep = createLibraryCard({ name: 'Keep', setup: Setup.Scale, fretboards: [defaultDataFor(Setup.Scale)] })
    const drop = createLibraryCard({ name: 'Drop', setup: Setup.Scale, fretboards: [defaultDataFor(Setup.Scale)] })

    deleteLibraryCard(drop.id)
    expect(fetchLibraryCards()).toEqual([keep])
  })
})
```

`tests/unit/apiAdapter.test.ts`:

```ts
import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest'
import { Setup } from '@data/constants'
import { defaultDataFor } from '@/lib/fretboardData'
import { defaultChordProgression } from '@services/adapters/localStorageAdapter'
import { enableAccounts, jsonResponse, requestBody, routeFetch } from './support'

const notFound = { error: { code: 'NOT_FOUND', message: 'Workspace not saved yet' } }
const serverError = { error: { code: 'INTERNAL', message: 'Something went wrong' } }

// A fresh module per test: the adapter keeps pending saves and failed loads in module state.
const loadAdapter = async () => {
  vi.resetModules()
  return import('@services/adapters/apiAdapter')
}

const putCount = (fetchMock: ReturnType<typeof routeFetch>): number =>
  fetchMock.mock.calls.filter(([, init]) => init?.method === 'PUT').length

describe('API adapter', () => {
  beforeEach(() => {
    enableAccounts()
    localStorage.clear()
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  it('reads a saved workspace and never stores the current fretboard separately', async () => {
    const api = await loadAdapter()
    const stack = [defaultDataFor(Setup.Scale)]
    const fetchMock = routeFetch({ 'GET /workspaces/scale': () => jsonResponse(200, { fretboards: stack }) })

    await expect(api.fetchFretboards(Setup.Scale)).resolves.toEqual(stack)
    expect(api.fetchCurrentFretboard(Setup.Chord)).toEqual(defaultDataFor(Setup.Chord))
    api.saveCurrentFretboard(Setup.Scale, stack[0])
    await api.flushPendingSaves()
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('treats a never-saved workspace as empty and saves the first stack', async () => {
    const api = await loadAdapter()
    const stack = [defaultDataFor(Setup.Scale)]
    const fetchMock = routeFetch({
      'GET /workspaces/scale': () => jsonResponse(404, notFound),
      'PUT /workspaces/scale': () => jsonResponse(204),
    })

    await expect(api.fetchFretboards(Setup.Scale)).resolves.toBeUndefined()
    api.saveFretboards(Setup.Scale, stack)
    await api.flushPendingSaves()
    expect(putCount(fetchMock)).toBe(1)
    expect(requestBody(fetchMock.mock.calls[1][1])).toEqual({ fretboards: stack })
  })

  it('coalesces rapid workspace saves into one request with the latest stack', async () => {
    const api = await loadAdapter()
    const fetchMock = routeFetch({ 'PUT /workspaces/chord': () => jsonResponse(204) })
    const latest = [defaultDataFor(Setup.Chord), { ...defaultDataFor(Setup.Chord), currentKey: 'E' }]

    api.saveFretboards(Setup.Chord, [defaultDataFor(Setup.Chord)])
    api.saveFretboards(Setup.Chord, latest)
    expect(fetchMock).not.toHaveBeenCalled()

    await api.flushPendingSaves()
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(requestBody(fetchMock.mock.calls[0][1])).toEqual({ fretboards: latest })
  })

  it('saves on its own 800 ms after the last change', async () => {
    vi.useFakeTimers()
    const api = await loadAdapter()
    const fetchMock = routeFetch({ 'PUT /workspaces/scale': () => jsonResponse(204) })

    api.saveFretboards(Setup.Scale, [defaultDataFor(Setup.Scale)])
    await vi.advanceTimersByTimeAsync(api.SAVE_DELAY_MS - 1)
    expect(fetchMock).not.toHaveBeenCalled()
    await vi.advanceTimersByTimeAsync(1)
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('stops saving a workspace whose load failed, so defaults cannot overwrite the account', async () => {
    const api = await loadAdapter()
    let respond: () => Response = () => jsonResponse(500, serverError)
    const fetchMock = routeFetch({
      'GET /workspaces/scale': () => respond(),
      'PUT /workspaces/scale': () => jsonResponse(204),
    })
    const saveAndFlush = async () => {
      api.saveFretboards(Setup.Scale, [defaultDataFor(Setup.Scale)])
      await api.flushPendingSaves()
    }

    await expect(api.fetchFretboards(Setup.Scale)).resolves.toBeUndefined()
    await saveAndFlush()
    expect(putCount(fetchMock)).toBe(0)

    respond = () => {
      throw new TypeError('Failed to fetch')
    }
    await expect(api.fetchFretboards(Setup.Scale)).resolves.toBeUndefined()
    await saveAndFlush()
    expect(putCount(fetchMock)).toBe(0)

    respond = () => jsonResponse(200, { fretboards: [defaultDataFor(Setup.Scale)] })
    await api.fetchFretboards(Setup.Scale)
    await saveAndFlush()
    expect(putCount(fetchMock)).toBe(1)
  })

  it('falls back to the default progression and guards its saves the same way', async () => {
    const api = await loadAdapter()
    let status = 404
    const fetchMock = routeFetch({
      'GET /chord-progression': () => jsonResponse(status, status === 404 ? notFound : serverError),
      'PUT /chord-progression': () => jsonResponse(204),
    })

    await expect(api.fetchChordProgression()).resolves.toEqual(defaultChordProgression)
    api.saveChordProgression(defaultChordProgression)
    await api.flushPendingSaves()
    expect(putCount(fetchMock)).toBe(1)

    status = 500
    await expect(api.fetchChordProgression()).resolves.toEqual(defaultChordProgression)
    api.saveChordProgression(defaultChordProgression)
    await api.flushPendingSaves()
    expect(putCount(fetchMock)).toBe(1)
  })

  it('sends one request per library card change', async () => {
    const api = await loadAdapter()
    const card = { id: 'card-1', name: 'Card 1', setup: Setup.Scale, fretboards: [defaultDataFor(Setup.Scale)], createdAt: 1 }
    const fetchMock = routeFetch({
      'GET /library-cards': () => jsonResponse(200, [card]),
      'POST /library-cards': () => jsonResponse(201, card),
      'PATCH /library-cards/card-1': () => jsonResponse(200, { ...card, name: 'Renamed' }),
      'DELETE /library-cards/card-1': () => jsonResponse(204),
    })

    await expect(api.fetchLibraryCards()).resolves.toEqual([card])
    await expect(api.createLibraryCard({ name: 'Card 1', setup: Setup.Scale, fretboards: card.fretboards })).resolves.toEqual(card)
    expect(requestBody(fetchMock.mock.calls[1][1])).toEqual({ name: 'Card 1', setup: Setup.Scale, fretboards: card.fretboards })
    await expect(api.updateLibraryCard('card-1', { name: 'Renamed' })).resolves.toMatchObject({ name: 'Renamed' })
    expect(requestBody(fetchMock.mock.calls[2][1])).toEqual({ name: 'Renamed' })
    await api.deleteLibraryCard('card-1')
    expect(fetchMock.mock.calls[3][1]?.method).toBe('DELETE')
  })
})
```

`tests/unit/libraryStore.test.ts`:

```ts
import { describe, it, expect, beforeEach } from 'vitest'
import { createPinia, setActivePinia } from 'pinia'
import { Setup } from '@data/constants'
import { defaultDataFor } from '@/lib/fretboardData'
import { useAuthStore } from '@stores/useAuthStore'
import { useLibraryStore } from '@stores/useLibraryStore'
import { clearTokens } from '@services/session'
import { enableAccounts, jsonResponse, routeFetch } from './support'

const storedCards = () => JSON.parse(localStorage.getItem('libraryCards') ?? 'null')

describe('library store', () => {
  beforeEach(() => {
    setActivePinia(createPinia())
    localStorage.clear()
    clearTokens()
    enableAccounts()
  })

  it('creates, renames, restacks and deletes cards in localStorage for guests', async () => {
    useAuthStore().status = 'guest'
    const library = useLibraryStore()

    const card = await library.createCard('Card 1', Setup.Scale)
    expect(library.cards).toHaveLength(1)

    await library.renameCard(card!.id, 'Shapes')
    await library.updateCardFretboards(card!.id, [{ ...defaultDataFor(Setup.Scale), currentKey: 'G' }])
    expect(library.cards[0]).toMatchObject({ name: 'Shapes', fretboards: [{ currentKey: 'G' }] })
    expect(storedCards()[0]).toMatchObject({ name: 'Shapes', fretboards: [{ currentKey: 'G' }] })

    await library.deleteCard(card!.id)
    expect(library.cards).toEqual([])
    expect(storedCards()).toEqual([])
  })

  it('keeps the card the API returns when signed in', async () => {
    useAuthStore().status = 'authenticated'
    const serverCard = { id: 'server-id', name: 'Card 1', setup: Setup.Scale, fretboards: [defaultDataFor(Setup.Scale)], createdAt: 5 }
    routeFetch({
      'GET /library-cards': () => jsonResponse(200, []),
      'POST /library-cards': () => jsonResponse(201, serverCard),
    })
    const library = useLibraryStore()

    await expect(library.createCard('Card 1', Setup.Scale)).resolves.toEqual(serverCard)
    expect(library.cards).toEqual([serverCard])
    expect(localStorage.getItem('libraryCards')).toBeNull()
  })

  it('returns undefined and changes nothing when the API rejects a new card', async () => {
    useAuthStore().status = 'authenticated'
    routeFetch({
      'GET /library-cards': () => jsonResponse(200, []),
      'POST /library-cards': () => jsonResponse(409, { error: { code: 'LIMIT_EXCEEDED', message: 'A library can hold at most 200 cards' } }),
    })
    const library = useLibraryStore()

    await expect(library.createCard('Card 1', Setup.Scale)).resolves.toBeUndefined()
    expect(library.cards).toEqual([])
  })

  it('reset forgets the cards and the active card, and the next load reads again', async () => {
    useAuthStore().status = 'guest'
    const library = useLibraryStore()
    const card = await library.createCard('Card 1', Setup.Scale)
    library.activeCardId = card!.id

    library.reset()
    expect(library.cards).toEqual([])
    expect(library.activeCardId).toBeNull()
    expect(library.isLoaded).toBe(false)

    await library.ensureLoaded()
    expect(library.cards).toHaveLength(1)
  })
})
```

Add to `tests/unit/authStore.test.ts` — the import at the top:

```ts
import { saveFretboards } from '@services/adapters/apiAdapter'
```

and this test inside the `describe`:

```ts
  it('sends pending saves before logging out', async () => {
    const fetchMock = routeFetch({
      'POST /auth/login': () => jsonResponse(200, authResponse),
      'PUT /workspaces/scale': () => jsonResponse(204),
      'POST /auth/logout': () => jsonResponse(204),
    })
    const auth = guestStore()
    await auth.login(credentials)

    saveFretboards(Setup.Scale, [defaultDataFor(Setup.Scale)])
    await auth.logout()

    const order = fetchMock.mock.calls.map(([url, init]) => `${init?.method} ${new URL(String(url)).pathname}`)
    expect(order).toEqual(['POST /auth/login', 'PUT /workspaces/scale', 'POST /auth/logout'])
  })
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `npm test`
Expected: FAIL — `createLibraryCard` is not exported by `localStorageAdapter`, `flushPendingSaves`/`SAVE_DELAY_MS` don't exist on `apiAdapter`, `library.reset` is not a function, and the logout-order test sees no `PUT`.

- [ ] **Step 3: Add per-card operations to the local adapter**

In `src/services/adapters/localStorageAdapter.ts`, add at the top:

```ts
import _ from 'lodash'
```

Add directly below the `LibraryCard` interface:

```ts
export interface LibraryCardInput {
  name: string
  setup: Setup
  fretboards: FretboardData[]
}

export interface LibraryCardPatch {
  name?: string
  fretboards?: FretboardData[]
}
```

Replace

```ts
export const saveLibraryCards = (cards: LibraryCard[]): void => {
  try {
    localStorage.setItem(libraryCardsStorageKey, JSON.stringify(cards))
  } catch (error) {
    console.log('saveLibraryCards: ', error)
  }
}
```

with

```ts
const saveLibraryCards = (cards: LibraryCard[]): void => {
  try {
    localStorage.setItem(libraryCardsStorageKey, JSON.stringify(cards))
  } catch (error) {
    console.log('saveLibraryCards: ', error)
  }
}

export const createLibraryCard = (input: LibraryCardInput): LibraryCard => {
  const card: LibraryCard = {
    id: crypto.randomUUID(),
    name: input.name,
    setup: input.setup,
    fretboards: _.cloneDeep(input.fretboards),
    createdAt: Date.now(),
  }
  saveLibraryCards([...(fetchLibraryCards() ?? []), card])
  return card
}

export const updateLibraryCard = (id: string, patch: LibraryCardPatch): LibraryCard | undefined => {
  const cards = fetchLibraryCards() ?? []
  const card = cards.find(c => c.id === id)
  if (!card) return undefined
  if (patch.name !== undefined) card.name = patch.name
  if (patch.fretboards !== undefined) card.fretboards = _.cloneDeep(patch.fretboards)
  saveLibraryCards(cards)
  return card
}

export const deleteLibraryCard = (id: string): void => {
  saveLibraryCards((fetchLibraryCards() ?? []).filter(card => card.id !== id))
}
```

- [ ] **Step 4: Rewrite the API adapter**

`src/services/adapters/apiAdapter.ts` (replace the file):

```ts
import _ from 'lodash'
import { Setup } from '@data/constants'
import { FretboardData, defaultDataFor } from '@/lib/fretboardData'
import { ApiError, apiRequest } from '@services/http'
import { defaultChordProgression } from '@services/adapters/localStorageAdapter'
import type { ChordProgression, LibraryCard, LibraryCardInput, LibraryCardPatch } from '@services/adapters/localStorageAdapter'

export const SAVE_DELAY_MS = 800

interface PendingSave {
  (save: () => Promise<void>): void
  flush: () => Promise<void> | undefined
}

const progressionKey = 'chordProgression'
const pendingSaves = new Map<string, PendingSave>()
// Anything whose last load failed for a reason other than "not saved yet". Saving it now
// would overwrite the account with the defaults the page fell back to, so saves are skipped
// until a load succeeds.
const failedLoads = new Set<string>()

const saveLater = (key: string, save: () => Promise<void>): void => {
  let pending = pendingSaves.get(key)
  if (!pending) {
    pending = _.debounce((run: () => Promise<void>) => run(), SAVE_DELAY_MS) as PendingSave
    pendingSaves.set(key, pending)
  }
  pending(save)
}

export const flushPendingSaves = async (): Promise<void> => {
  await Promise.all([...pendingSaves.values()].map(pending => pending.flush()))
}

const isNotFound = (error: unknown): boolean => error instanceof ApiError && error.status === 404

const load = async <T>(key: string, label: string, request: () => Promise<T>): Promise<T | undefined> => {
  try {
    const value = await request()
    failedLoads.delete(key)
    return value
  } catch (error) {
    if (isNotFound(error)) {
      failedLoads.delete(key)
    } else {
      failedLoads.add(key)
      console.log(`${label}: `, error)
    }
    return undefined
  }
}

const workspacePath = (setup: Setup): string => `/workspaces/${setup.toLowerCase()}`

// The selected fretboard is part of the stack; the API has no separate "current fretboard".
export const fetchCurrentFretboard = (setup: Setup): FretboardData => defaultDataFor(setup)

export const saveCurrentFretboard = (_setup: Setup, _fretboard: FretboardData): void => {}

export const fetchFretboards = async (setup: Setup): Promise<FretboardData[] | undefined> => {
  const workspace = await load(setup, 'fetchFretboards', () => apiRequest<{ fretboards: FretboardData[] }>('GET', workspacePath(setup)))
  return workspace?.fretboards
}

export const saveFretboards = (setup: Setup, fretboards: FretboardData[]): void => {
  if (failedLoads.has(setup)) return
  const snapshot = _.cloneDeep(fretboards)
  saveLater(setup, () => apiRequest<void>('PUT', workspacePath(setup), { fretboards: snapshot })
    .catch(error => console.log('saveFretboards: ', error)))
}

export const fetchLibraryCards = async (): Promise<LibraryCard[] | undefined> => {
  try {
    return await apiRequest<LibraryCard[]>('GET', '/library-cards')
  } catch (error) {
    console.log('fetchLibraryCards: ', error)
    return undefined
  }
}

export const createLibraryCard = (input: LibraryCardInput): Promise<LibraryCard> =>
  apiRequest<LibraryCard>('POST', '/library-cards', input)

export const updateLibraryCard = (id: string, patch: LibraryCardPatch): Promise<LibraryCard> =>
  apiRequest<LibraryCard>('PATCH', `/library-cards/${id}`, patch)

export const deleteLibraryCard = (id: string): Promise<void> =>
  apiRequest<void>('DELETE', `/library-cards/${id}`)

export const fetchChordProgression = async (): Promise<ChordProgression> => {
  const progression = await load(progressionKey, 'fetchChordProgression', () => apiRequest<ChordProgression>('GET', '/chord-progression'))
  return progression ?? structuredClone(defaultChordProgression)
}

export const saveChordProgression = (progression: ChordProgression): void => {
  if (failedLoads.has(progressionKey)) return
  const snapshot = _.cloneDeep(progression)
  saveLater(progressionKey, () => apiRequest<void>('PUT', '/chord-progression', snapshot)
    .catch(error => console.log('saveChordProgression: ', error)))
}
```

- [ ] **Step 5: Rewrite the customizer service**

`src/services/customizerService.ts` (replace the file):

```ts
import { Setup, Theme } from '@data/constants'
import { FretboardData } from '@/lib/fretboardData'
import * as local from '@services/adapters/localStorageAdapter'
import * as api from '@services/adapters/apiAdapter'
import { useAuthStore } from '@stores/useAuthStore'
import type { ChordProgression, LibraryCard, LibraryCardInput, LibraryCardPatch } from '@services/adapters/localStorageAdapter'

// Signed-in users read and write through the API; guests use localStorage.
// The theme always stays on this device.
const useApi = (): boolean => useAuthStore().isAuthenticated

export const fetchCurrentTheme = (): Theme | null => local.fetchCurrentTheme()

export const saveCurrentTheme = (theme: Theme): void => local.saveCurrentTheme(theme)

export const fetchCurrentFretboard = (setup: Setup): FretboardData | undefined => {
  return useApi() ? api.fetchCurrentFretboard(setup) : local.fetchCurrentFretboard(setup)
}

export const saveCurrentFretboard = (setup: Setup, fretboard: FretboardData): void => {
  if (useApi()) api.saveCurrentFretboard(setup, fretboard)
  else local.saveCurrentFretboard(setup, fretboard)
}

export const fetchFretboards = (setup: Setup): Promise<FretboardData[] | undefined> | FretboardData[] | undefined => {
  return useApi() ? api.fetchFretboards(setup) : local.fetchFretboards(setup)
}

export const saveFretboards = (setup: Setup, fretboards: FretboardData[]): void => {
  if (useApi()) api.saveFretboards(setup, fretboards)
  else local.saveFretboards(setup, fretboards)
}

export const fetchLibraryCards = (): Promise<LibraryCard[] | undefined> | LibraryCard[] | undefined => {
  return useApi() ? api.fetchLibraryCards() : local.fetchLibraryCards()
}

export const createLibraryCard = (input: LibraryCardInput): Promise<LibraryCard> | LibraryCard => {
  return useApi() ? api.createLibraryCard(input) : local.createLibraryCard(input)
}

export const updateLibraryCard = (id: string, patch: LibraryCardPatch): Promise<LibraryCard> | LibraryCard | undefined => {
  return useApi() ? api.updateLibraryCard(id, patch) : local.updateLibraryCard(id, patch)
}

export const deleteLibraryCard = (id: string): Promise<void> | void => {
  return useApi() ? api.deleteLibraryCard(id) : local.deleteLibraryCard(id)
}

export const fetchChordProgression = (): Promise<ChordProgression> | ChordProgression => {
  return useApi() ? api.fetchChordProgression() : local.fetchChordProgression()
}

export const saveChordProgression = (progression: ChordProgression): void => {
  if (useApi()) api.saveChordProgression(progression)
  else local.saveChordProgression(progression)
}

// Sends debounced API saves now. Call before reading back what was just saved.
export const flushPendingSaves = (): Promise<void> => api.flushPendingSaves()
```

- [ ] **Step 6: Rewrite the library store**

`src/stores/useLibraryStore.ts` (replace the file):

```ts
import { defineStore } from 'pinia'
import _ from 'lodash'
import { Setup } from '@data/constants'
import { defaultDataFor, FretboardData } from '@/lib/fretboardData'
import { createLibraryCard, deleteLibraryCard, fetchLibraryCards, updateLibraryCard } from '@services/customizerService'
import type { LibraryCard, LibraryCardPatch } from '@services/adapters/localStorageAdapter'

export type { LibraryCard }

export const useLibraryStore = defineStore('library', {
  state: () => ({
    cards: [] as LibraryCard[],
    activeCardId: null as string | null,
    isLoaded: false,
  }),
  getters: {
    activeCard: (state): LibraryCard | undefined => state.cards.find(c => c.id === state.activeCardId),
  },
  actions: {
    async loadCards() {
      this.cards = (await fetchLibraryCards()) ?? []
      this.isLoaded = true
    },
    async ensureLoaded() {
      if (!this.isLoaded) await this.loadCards()
    },
    reset() {
      this.cards = []
      this.activeCardId = null
      this.isLoaded = false
    },
    async createCard(name: string, setup: Setup = Setup.Scale, fretboards: FretboardData[] = [defaultDataFor(setup)]): Promise<LibraryCard | undefined> {
      await this.ensureLoaded()
      try {
        const card = await createLibraryCard({ name, setup, fretboards: _.cloneDeep(fretboards) })
        this.cards.push(card)
        return card
      } catch (error) {
        console.log('createCard: ', error)
        return undefined
      }
    },
    async deleteCard(id: string) {
      try {
        await deleteLibraryCard(id)
      } catch (error) {
        console.log('deleteCard: ', error)
        return
      }
      this.cards = this.cards.filter(c => c.id !== id)
      if (this.activeCardId === id) this.activeCardId = null
    },
    async renameCard(id: string, newName: string) {
      await this.updateCard(id, { name: newName })
    },
    async updateCardFretboards(id: string, fretboards: FretboardData[]) {
      await this.ensureLoaded()
      await this.updateCard(id, { fretboards: _.cloneDeep(fretboards) })
    },
    async updateCard(id: string, patch: LibraryCardPatch) {
      if (!this.cards.some(c => c.id === id)) return
      try {
        const updated = await updateLibraryCard(id, patch)
        if (updated) this.cards = this.cards.map(c => (c.id === id ? updated : c))
      } catch (error) {
        console.log('updateCard: ', error)
      }
    },
  },
})
```

- [ ] **Step 7: Flush pending saves before logout**

In `src/stores/useAuthStore.ts`, add to the imports:

```ts
import { flushPendingSaves } from '@services/adapters/apiAdapter'
```

and make `logout` start with the flush:

```ts
    async logout() {
      // Send the last debounced edits while the tokens are still valid.
      if (this.status === 'authenticated') await flushPendingSaves()
      const refreshToken = getRefreshToken()
      if (refreshToken) {
        try {
          await logoutRequest(refreshToken)
        } catch (error) {
          console.log('logout: ', error)
        }
      }
      this.becomeGuest()
    },
```

- [ ] **Step 8: Use the card the store returns in the two callers**

In `src/components/LibraryPage.vue`, replace `handleCreate` with:

```ts
const handleCreate = async () => {
  const newCard = await libraryStore.createCard(`Card ${libraryStore.cards.length + 1}`)
  if (!newCard) return
  editingId.value = newCard.id
  editingName.value = newCard.name
}
```

In `src/components/FretboardPage.vue`, replace `saveToLibrary` with:

```ts
const saveToLibrary = async () => {
    await libraryStore.ensureLoaded();
    const card = await libraryStore.createCard(`Card ${libraryStore.cards.length + 1}`, props.setup, stack.value);
    if (card) libraryStore.activeCardId = card.id;
}
```

- [ ] **Step 9: Run the tests and the build**

Run: `npm test`
Expected: PASS — 54 tests (38 + 4 localStorageAdapter + 7 apiAdapter + 4 libraryStore + 1 authStore).

Run: `npm run build`
Expected: no type errors (nothing imports `saveLibraryCards` any more).

- [ ] **Step 10: Commit**

```bash
git add src/services src/stores src/components/LibraryPage.vue src/components/FretboardPage.vue tests/unit
git commit -m "feat: switch persistence between localStorage and the API at runtime" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B4: Sign-in UI and app wiring

**Files:**
- Create: `src/types/gsi.d.ts`, `src/services/googleIdentity.ts`, `src/services/authErrors.ts`, `src/components/AuthModal.vue`, `src/components/AccountMenu.vue`, `tests/unit/authErrors.test.ts`
- Modify: `src/layout/DefaultLayout.vue`, `src/main.ts`

**Interfaces:**
- Consumes: `useAuthStore` (B2, B3), `ApiError` (B1), `googleClientId`, `accountsEnabled` (B1), `flushPendingSaves` from `customizerService` (B3), `useLibraryStore().reset()` (B3).
- Produces:
  - `authErrors.ts`: `AuthErrorView { message, fields }`, `describeAuthError(error) → AuthErrorView`.
  - `googleIdentity.ts`: `renderGoogleButton(element, clientId, onCredential) → Promise<void>`.
  - `AccountMenu.vue` (no props): "Sign in" button for guests, display name + "Log out" for signed-in users, and the import-failure notice; owns `AuthModal`.
  - `AuthModal.vue`: emits `close`.

- [ ] **Step 1: Write the failing test for error messages**

`tests/unit/authErrors.test.ts`:

```ts
import { describe, it, expect } from 'vitest'
import { ApiError } from '@services/http'
import { describeAuthError } from '@services/authErrors'

describe('describeAuthError', () => {
  it('explains an email that already has an account', () => {
    expect(describeAuthError(new ApiError(409, 'CONFLICT', 'An account with this email already exists')))
      .toEqual({ message: 'An account with this email already exists', fields: {} })
  })

  it('shows the server message for 401s', () => {
    expect(describeAuthError(new ApiError(401, 'UNAUTHORIZED', 'Invalid email or password')))
      .toEqual({ message: 'Invalid email or password', fields: {} })
    expect(describeAuthError(new ApiError(401, 'UNAUTHORIZED', 'Google sign-in failed')))
      .toEqual({ message: 'Google sign-in failed', fields: {} })
  })

  it('puts validation messages beside their fields', () => {
    const error = new ApiError(400, 'VALIDATION_ERROR', 'Invalid request', [
      { path: 'email', message: 'Enter a valid email address' },
      { path: 'password', message: 'Password must be at least 8 characters' },
    ])
    expect(describeAuthError(error)).toEqual({
      message: '',
      fields: { email: 'Enter a valid email address', password: 'Password must be at least 8 characters' },
    })
  })

  it('explains rate limiting', () => {
    expect(describeAuthError(new ApiError(429, 'RATE_LIMITED', 'Too many requests. Try again in a minute.')))
      .toEqual({ message: 'Too many attempts. Try again in a minute.', fields: {} })
  })

  it('falls back to a generic message for everything else', () => {
    const generic = { message: 'Something went wrong. Try again.', fields: {} }
    expect(describeAuthError(new ApiError(500, 'INTERNAL', 'Something went wrong'))).toEqual(generic)
    expect(describeAuthError(new TypeError('Failed to fetch'))).toEqual(generic)
  })
})
```

Run: `npm test`
Expected: FAIL with `Failed to resolve import "@services/authErrors"`.

- [ ] **Step 2: Write the error mapping**

`src/services/authErrors.ts`:

```ts
import { ApiError } from '@services/http'

export interface AuthErrorView {
  message: string
  fields: Record<string, string>
}

const genericMessage = 'Something went wrong. Try again.'

export const describeAuthError = (error: unknown): AuthErrorView => {
  if (error instanceof ApiError) {
    if (error.status === 400 && error.details.length > 0) {
      return { message: '', fields: Object.fromEntries(error.details.map(detail => [detail.path, detail.message])) }
    }
    if (error.status === 409) return { message: 'An account with this email already exists', fields: {} }
    // The server says "Invalid email or password" for logins and "Google sign-in failed" for Google.
    if (error.status === 401) return { message: error.message, fields: {} }
    if (error.status === 429) return { message: 'Too many attempts. Try again in a minute.', fields: {} }
  }
  return { message: genericMessage, fields: {} }
}
```

Run: `npm test`
Expected: PASS — 59 tests.

- [ ] **Step 3: Write the Google Identity Services loader**

`src/types/gsi.d.ts`:

```ts
// Minimal types for Google Identity Services (https://accounts.google.com/gsi/client).
interface GoogleCredentialResponse {
  credential: string
}

interface GoogleIdConfiguration {
  client_id: string
  callback: (response: GoogleCredentialResponse) => void
}

interface GoogleButtonConfiguration {
  type?: 'standard' | 'icon'
  theme?: 'outline' | 'filled_blue' | 'filled_black'
  size?: 'large' | 'medium' | 'small'
  text?: 'signin_with' | 'signup_with' | 'continue_with' | 'signin'
  width?: number
}

interface Window {
  google?: {
    accounts: {
      id: {
        initialize: (config: GoogleIdConfiguration) => void
        renderButton: (parent: HTMLElement, options: GoogleButtonConfiguration) => void
      }
    }
  }
}
```

`src/services/googleIdentity.ts`:

```ts
const scriptUrl = 'https://accounts.google.com/gsi/client'

let scriptLoading: Promise<void> | null = null
let initializedClientId: string | null = null
let credentialHandler: (credential: string) => void = () => {}

// Loaded on demand, the first time the sign-in modal opens.
const loadScript = (): Promise<void> => {
  if (window.google?.accounts?.id) return Promise.resolve()
  if (!scriptLoading) {
    scriptLoading = new Promise<void>((resolve, reject) => {
      const script = document.createElement('script')
      script.src = scriptUrl
      script.async = true
      script.onload = () => resolve()
      script.onerror = () => {
        scriptLoading = null
        reject(new Error('Could not load Google sign-in'))
      }
      document.head.appendChild(script)
    })
  }
  return scriptLoading
}

export const renderGoogleButton = async (element: HTMLElement, clientId: string, onCredential: (credential: string) => void): Promise<void> => {
  await loadScript()
  const id = window.google!.accounts.id
  credentialHandler = onCredential
  if (initializedClientId !== clientId) {
    id.initialize({ client_id: clientId, callback: response => credentialHandler(response.credential) })
    initializedClientId = clientId
  }
  id.renderButton(element, { type: 'standard', theme: 'outline', size: 'large', text: 'continue_with', width: 280 })
}
```

- [ ] **Step 4: Write the sign-in modal**

`src/components/AuthModal.vue`:

```vue
<script setup lang="ts">
import { ref, computed, onMounted, nextTick } from 'vue'
import { useAuthStore } from '@stores/useAuthStore'
import { googleClientId } from '@services/apiConfig'
import { renderGoogleButton } from '@services/googleIdentity'
import { describeAuthError } from '@services/authErrors'

type Mode = 'login' | 'signup'

const emit = defineEmits<{
  (e: 'close'): void
}>()

const authStore = useAuthStore()
const clientId = googleClientId()

const mode = ref<Mode>('login')
const username = ref('')
const email = ref('')
const password = ref('')
const formError = ref('')
const fieldErrors = ref<Record<string, string>>({})
const isSubmitting = ref(false)
const googleUnavailable = ref(false)
const usernameInput = ref<HTMLInputElement | null>(null)
const emailInput = ref<HTMLInputElement | null>(null)
const googleButton = ref<HTMLElement | null>(null)

const isSignup = computed(() => mode.value === 'signup')

const focusFirstField = () => {
  (isSignup.value ? usernameInput.value : emailInput.value)?.focus()
}

const resetErrors = () => {
  formError.value = ''
  fieldErrors.value = {}
}

const showError = (error: unknown) => {
  const view = describeAuthError(error)
  formError.value = view.message
  fieldErrors.value = view.fields
}

const switchMode = async (next: Mode) => {
  mode.value = next
  resetErrors()
  await nextTick()
  focusFirstField()
}

const submit = async () => {
  resetErrors()
  isSubmitting.value = true
  try {
    if (isSignup.value) {
      await authStore.signup({ username: username.value, email: email.value, password: password.value })
    } else {
      await authStore.login({ email: email.value, password: password.value })
    }
    emit('close')
  } catch (error) {
    showError(error)
  } finally {
    isSubmitting.value = false
  }
}

const onGoogleCredential = async (credential: string) => {
  resetErrors()
  try {
    await authStore.loginWithGoogle(credential)
    emit('close')
  } catch (error) {
    showError(error)
  }
}

onMounted(async () => {
  focusFirstField()
  if (clientId && googleButton.value) {
    try {
      await renderGoogleButton(googleButton.value, clientId, onGoogleCredential)
    } catch (error) {
      console.log('renderGoogleButton: ', error)
      googleUnavailable.value = true
    }
  }
})
</script>

<template>
  <div class="modal-backdrop show"></div>
  <div
    class="modal d-block"
    role="dialog"
    aria-modal="true"
    aria-labelledby="auth-title"
    @click.self="emit('close')"
    @keydown.esc="emit('close')"
  >
    <div class="modal-dialog modal-dialog-centered">
      <div class="modal-content auth-card">
        <div class="auth-header">
          <h2 id="auth-title" class="auth-title">{{ isSignup ? 'Create an account' : 'Sign in' }}</h2>
          <button type="button" class="auth-close" aria-label="Close" @click="emit('close')">×</button>
        </div>

        <div class="auth-tabs switch-radio fw-bold">
          <label>
            <input type="radio" name="auth-mode" :checked="!isSignup" @change="switchMode('login')">
            <div class="label px-3">Log in</div>
          </label>
          <label>
            <input type="radio" name="auth-mode" :checked="isSignup" @change="switchMode('signup')">
            <div class="label px-3">Sign up</div>
          </label>
        </div>

        <form class="auth-form" novalidate @submit.prevent="submit">
          <label v-if="isSignup" class="auth-field">
            <span>Display name</span>
            <input ref="usernameInput" v-model="username" class="auth-input" autocomplete="nickname" maxlength="100">
            <small v-if="fieldErrors.username" class="auth-field-error">{{ fieldErrors.username }}</small>
          </label>
          <label class="auth-field">
            <span>Email</span>
            <input ref="emailInput" v-model="email" class="auth-input" type="email" autocomplete="email">
            <small v-if="fieldErrors.email" class="auth-field-error">{{ fieldErrors.email }}</small>
          </label>
          <label class="auth-field">
            <span>Password</span>
            <input
              v-model="password"
              class="auth-input"
              type="password"
              :autocomplete="isSignup ? 'new-password' : 'current-password'"
            >
            <small v-if="fieldErrors.password" class="auth-field-error">{{ fieldErrors.password }}</small>
          </label>

          <p v-if="formError" class="auth-error" role="alert">{{ formError }}</p>

          <button type="submit" class="auth-submit" :disabled="isSubmitting">
            {{ isSubmitting ? 'Please wait…' : isSignup ? 'Create account' : 'Log in' }}
          </button>
        </form>

        <template v-if="clientId">
          <div class="auth-divider"><span>or</span></div>
          <div ref="googleButton" class="google-button"></div>
          <small v-if="googleUnavailable" class="auth-field-error">Google sign-in is unavailable right now.</small>
        </template>
      </div>
    </div>
  </div>
</template>

<style scoped lang="scss">
.modal-backdrop.show {
  opacity: 0.6;
}

.auth-card {
  gap: 1rem;
  padding: 1.5rem;
  text-align: start;
  color: inherit;
  background-color: var(--card-background-color);
  border: 1px solid var(--card-border-color);
  border-radius: 14px;
  box-shadow: var(--card-shadow);
}

.auth-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.auth-title {
  margin: 0;
  font-size: 1.2rem;
  color: var(--accent-text-color);
}

.auth-close {
  border: none;
  background: none;
  color: inherit;
  font-size: 1.5rem;
  line-height: 1;
}

.auth-tabs {
  display: flex;
}

.auth-form {
  display: flex;
  flex-direction: column;
  gap: 0.75rem;
}

.auth-field {
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
  font-weight: 600;
}

.auth-input {
  padding: 0.5em 0.7em;
  border: 1px solid var(--card-border-color);
  border-radius: 8px;
  color: inherit;
  background-color: var(--option-background-color);
  outline: none;

  &:focus {
    border-color: $yellow;
  }
}

.auth-field-error,
.auth-error {
  color: $red-1;
  font-weight: 600;
}

.auth-error {
  margin: 0;
  font-size: 0.85rem;
}

.auth-submit {
  padding: 0.6em;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  color: $black;
  background-color: $yellow;

  &:disabled {
    opacity: 0.6;
  }
}

.auth-divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.8rem;
  color: $gray-1;

  &::before,
  &::after {
    content: '';
    flex: 1;
    border-top: 1px solid var(--card-border-color);
  }
}

.google-button {
  display: flex;
  justify-content: center;
  min-height: 44px;
}
</style>
```

- [ ] **Step 5: Write the account menu**

`src/components/AccountMenu.vue`:

```vue
<script setup lang="ts">
import { ref } from 'vue'
import { useAuthStore } from '@stores/useAuthStore'
import AuthModal from '@components/AuthModal.vue'

const authStore = useAuthStore()
const showAuth = ref(false)
</script>

<template>
  <div class="account-menu">
    <span v-if="authStore.importFailed" class="import-notice">
      We couldn't import the data saved in this browser.
      <button type="button" class="link-button" @click="authStore.importFailed = false">Dismiss</button>
    </span>
    <template v-if="authStore.isAuthenticated && authStore.user">
      <span class="account-name">{{ authStore.user.username }}</span>
      <button type="button" class="account-button" @click="authStore.logout()">Log out</button>
    </template>
    <button v-else-if="authStore.status === 'guest'" type="button" class="account-button" @click="showAuth = true">Sign in</button>
    <AuthModal v-if="showAuth" @close="showAuth = false"/>
  </div>
</template>

<style scoped lang="scss">
.account-menu {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  font-size: 0.85rem;
}

.account-name {
  font-weight: 600;
  color: var(--accent-text-color);
}

.account-button {
  padding: 0.35rem 0.8rem;
  border: none;
  border-radius: 8px;
  font-weight: 700;
  color: inherit;
  background-color: var(--option-background-color);

  &:hover {
    color: $black;
    background-color: $yellow;
  }
}

.import-notice {
  color: $gray-1;
}

.link-button {
  margin-left: 0.25rem;
  padding: 0;
  border: none;
  background: none;
  color: var(--accent-text-color);
  text-decoration: underline;
}
</style>
```

- [ ] **Step 6: Wire the layout**

In `src/layout/DefaultLayout.vue`, make these edits.

Replace the first import line and the customizer import:

```ts
import { ref, onMounted } from 'vue';
import { Setup, Theme } from '@data/constants';
import { fetchCurrentTheme, saveCurrentTheme, fetchFretboards, saveFretboards, saveCurrentFretboard } from '@/services/customizerService';
```

with:

```ts
import { ref, watch, onMounted } from 'vue';
import { Setup, Theme } from '@data/constants';
import { fetchCurrentTheme, saveCurrentTheme, fetchFretboards, saveFretboards, saveCurrentFretboard, flushPendingSaves } from '@/services/customizerService';
import { accountsEnabled } from '@services/apiConfig';
import AccountMenu from '@components/AccountMenu.vue';
import { useAuthStore } from '@stores/useAuthStore';
```

Replace:

```ts
const libraryStore = useLibraryStore();
```

with:

```ts
const libraryStore = useLibraryStore();
const authStore = useAuthStore();
const showAccounts = accountsEnabled();
```

Replace `saveActiveCard` and `onLoadCard` with:

```ts
const saveActiveCard = async () => {
  // Debounced API saves must land before the stack is read back.
  await flushPendingSaves();
  if (currentView.value !== 'scale' && currentView.value !== 'chord') return;

  const setup = setupForView[currentView.value];
  const activeCard = libraryStore.activeCard;
  if (activeCard && activeCard.setup === setup) {
    const fretboards = await fetchFretboards(setup);
    if (fretboards) {
      await libraryStore.updateCardFretboards(activeCard.id, fretboards);
    }
  }
}

const onLoadCard = async (card: LibraryCard) => {
  await saveActiveCard();
  libraryStore.activeCardId = card.id;
  await saveFretboards(card.setup, card.fretboards);
  await saveCurrentFretboard(card.setup, card.fretboards[0]);
  // The page about to mount reads the stack back, so send it now.
  await flushPendingSaves();
  currentView.value = viewForSetup[card.setup];
}
```

Add directly above `onMounted(async () => {`:

```ts
// A new session means different data: forget the cards; the remounted pages reload.
watch(() => authStore.sessionVersion, () => {
  libraryStore.reset();
});

```

In the template, replace the theme switch block

```html
          <div class="switch-theme switch-radio">
            <label>
              <input type="radio" name="theme" :value="Theme.dark" v-model="theme" @change="saveCurrentTheme(theme)">
                <div class="label px-1"><Moon class="theme-icon"/></div>
              </input>
            </label>

            <label>
              <input type="radio" name="theme" :value="Theme.light" v-model="theme" @change="saveCurrentTheme(theme)">
                <div class="label px-1"><Sun class="theme-icon"/></div>
              </input>
            </label>
          </div>
```

with

```html
          <div class="top-bar-actions">
            <AccountMenu v-if="showAccounts"/>
            <div class="switch-theme switch-radio">
              <label>
                <input type="radio" name="theme" :value="Theme.dark" v-model="theme" @change="saveCurrentTheme(theme)">
                  <div class="label px-1"><Moon class="theme-icon"/></div>
                </input>
              </label>

              <label>
                <input type="radio" name="theme" :value="Theme.light" v-model="theme" @change="saveCurrentTheme(theme)">
                  <div class="label px-1"><Sun class="theme-icon"/></div>
                </input>
              </label>
            </div>
          </div>
```

and replace the three page lines

```html
        <LibraryPage v-if="currentView === 'library'" @load-card="onLoadCard"/>
        <ChordProgressionPage v-else-if="currentView === 'progression'"/>
        <FretboardPage v-else :key="currentView" :setup="setupForView[currentView]"/>
```

with

```html
        <template v-if="authStore.status !== 'restoring'">
          <LibraryPage v-if="currentView === 'library'" :key="`library-${authStore.sessionVersion}`" @load-card="onLoadCard"/>
          <ChordProgressionPage v-else-if="currentView === 'progression'" :key="`progression-${authStore.sessionVersion}`"/>
          <FretboardPage v-else :key="`${currentView}-${authStore.sessionVersion}`" :setup="setupForView[currentView]"/>
        </template>
```

In the `<style>` block, replace

```scss
.switch-theme {
  display: flex;
  position: absolute;
  top: 1rem;
  right: 2rem;
}
```

with

```scss
.top-bar-actions {
  display: flex;
  align-items: center;
  gap: 1rem;
  margin-left: auto;
  padding-right: 2rem;
}

.switch-theme {
  display: flex;
}
```

- [ ] **Step 7: Start the session on app start**

`src/main.ts` (replace the file):

```ts
import { createApp } from 'vue'
import { createPinia } from 'pinia'
import App from './App.vue'
import { useAuthStore } from '@stores/useAuthStore'
import 'bootstrap'
import 'bootstrap/dist/css/bootstrap.min.css'
import '@scss/main.scss'

const store = createPinia()
const app = createApp(App)
app.use(store)

// Pages render once restoreSession settles (DefaultLayout waits while status is 'restoring').
const authStore = useAuthStore()
authStore.startSessionListeners()
authStore.restoreSession()

app.mount('#app')
```

- [ ] **Step 8: Run the tests and the build**

Run: `npm test`
Expected: PASS — 59 tests.

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 9: Check the UI in the browser**

Start the backend (`npm start` in `fretWizard-service`, with `.env` configured) and the frontend (`npm run dev` here), then open `http://localhost:5173/fret-wizard/` in landscape:

1. "Sign in" sits left of the theme switch; the Scale page looks as before.
2. Click "Sign in": the modal opens with "Log in" focused on Email; switching to "Sign up" shows Display name. Clicking the backdrop, ×, or pressing Escape closes it.
3. Sign up with password `short`: "Password must be at least 8 characters" appears under Password.
4. Toggle dark/light theme with the modal open: the modal follows the theme.
5. Stop the backend and try to log in: "Something went wrong. Try again." appears.

If the backend's `.env` isn't available yet, do checks 1, 2, 4 and 5 only and note that 3 is still pending.

- [ ] **Step 10: Commit**

```bash
git add src/types/gsi.d.ts src/services/googleIdentity.ts src/services/authErrors.ts src/components/AuthModal.vue src/components/AccountMenu.vue src/layout/DefaultLayout.vue src/main.ts tests/unit/authErrors.test.ts
git commit -m "feat: sign-in modal, account menu and session-aware layout" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

---

### Task B5: Cleanup, frontend docs and end-to-end verification

**Files:**
- Modify: `package.json` (remove the `json-server` script), `CLAUDE.md`

**Interfaces:**
- Consumes: everything above.
- Produces: the finished feature.

- [ ] **Step 1: Remove the json-server script**

In `package.json`, delete the line:

```json
    "json-server": "json-server --watch ./database/all-scales.json",
```

It is unused and would clash with the backend on port 3000.

- [ ] **Step 2: Update the frontend `CLAUDE.md`**

Replace the line starting `**Tech Stack:**` with:

```markdown
**Tech Stack:** Vue 3, TypeScript, Vite 5, Pinia, Bootstrap 5, SCSS, SortableJS, Vitest, GitHub Pages; backend: `../fretWizard-service` (Express + Prisma + SQL Server)
```

Replace the Development Commands table and the two paragraphs after it — everything from the `| Command | Purpose |` header row through the paragraph that begins "The app will fail silently if" — with:

```markdown
| Command | Purpose |
|---------|---------|
| `npm run dev` | Start Vite dev server (hot reload enabled) |
| `npm run build` | TypeScript type check with `vue-tsc` + Vite production build (outputs to `dist/`) |
| `npm run preview` | Preview production build locally |
| `npm test` | Vitest unit tests (`tests/unit/`) |
| `npm run deploy` | Deploy to GitHub Pages (`/fret-wizard/` base path) |

The app works without a backend: guests save everything to `localStorage`. Accounts need the backend running on `VITE_API_BASE_URL` (`.env.development`: `http://localhost:3000`; start it with `npm start` in `../fretWizard-service`). With `VITE_API_BASE_URL` unset (production builds today) every account feature is hidden.
```

Replace the whole `### Service Layer` section with:

```markdown
### Service Layer
- **`customizerService.ts`** — the one entry point for persistence. Signed-in users go through `adapters/apiAdapter.ts`, guests through `adapters/localStorageAdapter.ts`; the theme always stays local. Library writes are per card (`createLibraryCard`, `updateLibraryCard`, `deleteLibraryCard`).
- **`adapters/apiAdapter.ts`** — debounces workspace and chord-progression saves (800 ms); `flushPendingSaves()` sends them immediately. After a failed load (not a 404) it skips saves for that page, so fallback defaults never overwrite the account.
- **`http.ts`** — `apiRequest` + `ApiError`; on a 401 it refreshes once and retries.
- **`session.ts`** — access token in memory, refresh token in `localStorage` (`refreshToken`); refreshes are serialised across tabs with `navigator.locks` and re-read the token inside the lock.
- **`guestData.ts`** — collects browser data for `POST /me/import` and clears it after a successful import.
- **`authApi.ts`, `authErrors.ts`, `googleIdentity.ts`** — auth endpoints, form error messages, Google button.
```

In the `### State` section, add this bullet at the end:

```markdown
- **`src/stores/useAuthStore.ts`** — session status (`restoring` / `guest` / `authenticated`), the user, and `sessionVersion`. DefaultLayout keys the pages on `sessionVersion` so they remount and reload when the session changes; the status turns `authenticated` only after guest data has been imported.
```

Replace the whole `### Persistence Strategy` section with:

```markdown
### Persistence Strategy
- **Guests** → `localStorage` (Library cards, Scale/Chord stacks, Chord Progression, theme), exactly as before accounts existed.
- **Signed-in users** → the backend (`/library-cards`, `/workspaces/:setup`, `/chord-progression`); theme stays in `localStorage`.
- **First login in a browser** → guest data is imported (`POST /me/import`): cards are appended; stacks and the progression only fill empty slots. On success the guest keys are cleared.
```

Replace pitfall 1 (`**Missing json-server** — …`) with:

```markdown
1. **Backend not running** — with `VITE_API_BASE_URL` set but the backend down, guests are unaffected, sign-in shows "Something went wrong", and a saved session stays logged out for that page load (the refresh token is kept for the next one).
```

- [ ] **Step 3: Run the frontend checks**

Run: `npm test`
Expected: PASS — 59 tests.

Run: `npm run build`
Expected: no type errors.

- [ ] **Step 4: Commit**

```bash
git add package.json CLAUDE.md
git commit -m "chore: drop json-server script and document accounts and sync" -m "Co-Authored-By: Claude Opus 5.5 <noreply@anthropic.com>"
```

- [ ] **Step 5: End-to-end verification (spec Section 9.2)**

Needs the backend `.env` with the dev database (reset in Task A2 Step 11, or now with `npx prisma migrate reset --force --skip-seed` in `fretWizard-service`) and, for checks 5 and 6, the real Google client ID in both env files. Run the backend (`npm start`) and the frontend (`npm run dev`); use a fresh browser profile.

1. **Guest unchanged:** without signing in, build a Scale stack, save it to the Library, rename the card, build a Chord Progression, reload — everything is still there.
2. **Sign-up imports guest data:** sign up with email. The Library shows the guest card, the Scale page shows the guest stack, the progression is kept. In DevTools → Application → Local Storage, `libraryCards`, `scaleFretboardList` and `chordProgression` are gone and `refreshToken` is present.
3. **Logout:** log out — the pages show defaults and the Library is empty.
4. **Second browser:** in another browser (or private window), log in with the same email — the Library card, Scale stack and progression appear.
5. **Google, new user:** sign in with a Google account that has no FretWizard account — the display name is the Google name.
6. **Google, existing email:** with an email account whose address is a Google account, sign in with Google — the same Library appears, and password login for that email now answers "Invalid email or password".
7. **Two tabs past expiry:** open two tabs signed in, wait 16 minutes (or shorten `ACCESS_TOKEN_TTL` in `services/tokens.js` to `'1m'` temporarily and restart the backend — revert afterwards), then edit in both tabs — both keep saving and neither is logged out.
8. **Cross-tab logout:** with two tabs open, log out in one — the other switches to "Sign in".
9. **Backend down:** stop the backend and reload while signed in — the app opens as a guest; start the backend and reload — signed in again with the account's data.

Report any check that fails, with what happened, to the owner. Don't mark the task done until all nine pass (or the owner accepts the gap — for example Google checks waiting for the client ID).

- [ ] **Step 6: Finish the branches**

Both repos are on `feature/accounts-and-sync`. Use superpowers:finishing-a-development-branch in each repo to decide how to integrate (merge, PR, or keep).

