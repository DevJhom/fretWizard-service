# Switch to PostgreSQL Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace SQL Server with PostgreSQL as fretWizard-service's only database, so the backend can be hosted cheaply. All 66 integration tests must pass on Postgres.

**Architecture:** Prisma is already the only database layer: no file in `services/`, `routes/` or `test/` contains raw SQL. So the switch is confined to:
- the Prisma provider and column-type annotations
- the regenerated `init` migration
- the test-database guard, which parses the connection URL
- the local Docker database
- docs

No adapter and no dual support: SQL Server stays reachable in git history only.

**Tech Stack:** Node (CommonJS), Express 4, Prisma 5.22 (unchanged), PostgreSQL 16 (`postgres:16-alpine` in Docker), `node:test`.

**Spec:** No separate spec. The decision was made in conversation on 2026-10-05:
- Postgres suits a small hobby project better: cheaper hosting and a lighter database.
- Switch outright instead of supporting both databases.
- There's no data to carry over: the backend was never deployed, and the dev database is empty.

The accounts-and-sync design (`docs/superpowers/specs/2026-10-01-accounts-and-sync-design.md`) still defines all behaviour; only the database engine changes.

## Global Constraints

- Prisma stays on `5.22.x`. Don't upgrade during this work, even though the CLI suggests it.
- Postgres image: `postgres:16-alpine`. Database role `fretwizard`. Databases `fretwizard` (dev) and `fretwizard_test` (tests), lower case.
- Table, column and constraint names stay exactly as they are (PascalCase, `PK_*` / `FK_*` / `UQ_*` / `IX_*`). The API's JSON shape does not change.
- Type mapping:
  - `@db.UniqueIdentifier` → `@db.Uuid`
  - `@db.NVarChar(n)` → `@db.VarChar(n)` with the same `n`
  - `@db.Char(64)` stays
  - `DateTime`, `Int` and `Boolean` keep no annotation
- Claude cannot read or write `.env*` files (permission rule). The owner edits `.env` and `.env.test` at the marked owner steps.
- Code style: `var`, `function` handlers, CommonJS. Match the surrounding code.
- Work on branch `feature/postgres`, created from `main`. Commits carry no `Co-Authored-By` trailer.
- Execution is phase by phase, with a stop after each phase (see Execution phases).

## Review Focus

1. **Non-UUID ids in a URL** (`/library-cards/abc`) must stay a 404. Postgres rejects a malformed UUID with Prisma error `P2023` (a 500) where SQL Server didn't. `routes/libraryCards.js:8-11` checks the format before querying, and the existing test "IDs that are not UUIDs are not found" pins it. Task 3 Step 5 must see it pass. Also confirm there are no other `:id` params, with the grep in Task 3 Step 6.
2. **Email letter case:** SQL Server compared case-insensitively; Postgres doesn't. Emails are lower-cased in `validation/auth.js:5` and `services/users.js:42`, and the existing tests "sign-up refuses an email that already has an account, in any letter case" and "login … ignoring email case and spaces" pin it. They must pass in Task 3 Step 5.
3. **Unicode note names** (♯, ♭) must round-trip. The existing test "stores Unicode note names and low/high E strings unchanged" covers `VARCHAR` in a UTF-8 database.
4. **The test guard must refuse the dev database, and the old `sqlserver://` URL,** so a stale `.env.test` can never wipe a real database. Task 2's unit tests pin both.
5. **Port 5432 already in use** by a locally installed Postgres would make the container fail to bind, and the tests could then hit the wrong server. Task 1 Step 1 checks the port first.

---

## Execution phases

| Phase | Tasks | Needs from the owner | Stop after |
|---|---|---|---|
| 1 | Task 1 (Docker Postgres), Task 2 (test guard) | The owner step after Task 1: update `.env` / `.env.test` | Container healthy, unit tests green |
| 2 | Task 3 (schema + migration), Task 4 (dev database, smoke check, docs) | Nothing | 66/66 integration on Postgres, docs updated |

---

### Task 1: Local Postgres in Docker

**Files:**
- Modify: `docker-compose.yml` (replace the SQL Server service)
- Create: `docker/postgres-init.sql`

**Interfaces:**
- Produces: a Postgres server on `localhost:5432`, role `fretwizard`, password from `POSTGRES_PASSWORD` in `.env`, and databases `fretwizard` and `fretwizard_test`. Container `fretwizard-pg`, volume `fretwizard-pg-data`. Tasks 3–4 connect with:
  - dev: `postgresql://fretwizard:<POSTGRES_PASSWORD>@localhost:5432/fretwizard?schema=public`
  - tests: `postgresql://fretwizard:<POSTGRES_PASSWORD>@localhost:5432/fretwizard_test?schema=public`

- [ ] **Step 1: Create the branch and check that port 5432 is free**

```bash
git checkout -b feature/postgres
netstat -ano | grep -E ':5432\s'
```
Expected: no output. If something is listening, stop and tell the owner. A local Postgres install must be stopped, or the compose port changed to `5433:5432` with both URLs using `5433`.

- [ ] **Step 2: Replace `docker-compose.yml`**

```yaml
# Local PostgreSQL for development and tests.
# Set POSTGRES_PASSWORD in .env, then: docker compose up -d
services:
  postgres:
    image: postgres:16-alpine
    container_name: fretwizard-pg
    environment:
      POSTGRES_USER: fretwizard
      POSTGRES_PASSWORD: ${POSTGRES_PASSWORD:?Set POSTGRES_PASSWORD in .env}
      POSTGRES_DB: fretwizard
    ports:
      - "5432:5432"
    volumes:
      - pgdata:/var/lib/postgresql/data
      # Runs once, on the first start with an empty volume
      - ./docker/postgres-init.sql:/docker-entrypoint-initdb.d/init.sql:ro
    restart: unless-stopped
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U fretwizard -d fretwizard"]
      interval: 5s
      timeout: 5s
      retries: 10

volumes:
  pgdata:
    # Fixed name so the data survives `docker compose down`
    name: fretwizard-pg-data
```

- [ ] **Step 3: Create `docker/postgres-init.sql`**

```sql
-- The dev database (fretwizard) comes from POSTGRES_DB; this adds the test one.
CREATE DATABASE fretwizard_test;
```

- [ ] **Step 4: Validate the compose file**

Run: `docker compose config --quiet`
Expected: either no output, or only the error `required variable POSTGRES_PASSWORD is missing a value`, which is fine until the owner step. Any YAML error must be fixed.

- [ ] **Step 5: Commit**

```bash
git add docker-compose.yml docker/postgres-init.sql
git commit -m "chore: run PostgreSQL in Docker instead of SQL Server"
```

> **OWNER STEP (between Task 1 and Task 3).** Claude can't edit `.env*` files.
> 1. Pick a password of letters and digits only. Symbols would need URL-encoding inside `DATABASE_URL`.
> 2. In `fretWizard-service/.env`:
>    - remove `MSSQL_SA_PASSWORD`
>    - add `POSTGRES_PASSWORD=<password>`
>    - set `DATABASE_URL=postgresql://fretwizard:<password>@localhost:5432/fretwizard?schema=public`
> 3. In `fretWizard-service/.env.test`, set `DATABASE_URL=postgresql://fretwizard:<password>@localhost:5432/fretwizard_test?schema=public`.
> 4. Leave every other variable as it is.
> 5. Tell Claude when it's done. Claude then runs `docker compose up -d` and checks `docker compose ps` shows `healthy`.
>
> The old SQL Server container (`fretwizard-sql`, port 1433) can keep running during the switch; it doesn't conflict. Removing it is optional, in Task 4.

---

### Task 2: Test-database guard reads Postgres URLs

The guard in `test/support/env.js` stops the integration suite unless the `.env.test` database name contains "test". It currently parses the SQL Server `database=...` format and must learn the URL path format, `postgresql://user:pass@host:port/<database>?schema=public`.

**Files:**
- Modify: `test/support/env.js:6-9`
- Test: `test/unit/env.test.js`, `test/unit/config.test.js:6`

**Interfaces:**
- Consumes: nothing new.
- Produces: `assertTestDatabaseUrl(url: string | undefined): void` (unchanged signature). It throws `Error(/test database/)` unless the URL's database (its path) contains "test", case-insensitive. `test/setupDatabase.js` and `test/support/db.js` keep calling `loadTestEnv()` unchanged.

- [ ] **Step 1: Write the failing tests.** Replace `test/unit/env.test.js` with:

```js
var test = require('node:test');
var assert = require('node:assert/strict');
var { assertTestDatabaseUrl } = require('../support/env');

test('accepts a URL whose database name contains "test"', function () {
  assert.doesNotThrow(function () {
    assertTestDatabaseUrl('postgresql://fretwizard:secret@localhost:5432/fretwizard_test?schema=public');
  });
});

test('refuses every other database, even when the server or user is called "test"', function () {
  [
    'postgresql://fretwizard:secret@localhost:5432/fretwizard?schema=public',
    'postgresql://fretwizard:secret@testserver:5432/fretwizard',
    'postgresql://test:secret@localhost:5432/fretwizard',
    'postgresql://fretwizard:test@localhost:5432/fretwizard?schema=test',
    // A stale SQL Server .env.test must not pass
    'sqlserver://localhost;database=Fretwizard_Test;integratedSecurity=true',
    'not a url',
    undefined,
  ].forEach(function (url) {
    assert.throws(function () {
      assertTestDatabaseUrl(url);
    }, /test database/, String(url));
  });
});
```

In `test/unit/config.test.js` line 6, change the sample URL. It is only checked for presence, so this is for consistency:

```js
  DATABASE_URL: 'postgresql://fretwizard:secret@localhost:5432/fretwizard',
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `node --test test/unit/env.test.js`
Expected: FAIL. The accept test throws, because the Postgres URL has no `database=`. The refuse test fails on the `sqlserver://…Fretwizard_Test` entry, which the old parser accepts.

- [ ] **Step 3: Implement.** In `test/support/env.js`, replace `databaseName`:

```js
// postgresql://user:password@host:port/<database>?schema=public
function databaseName(url) {
  try {
    return decodeURIComponent(new URL(url).pathname.replace(/^\//, ''));
  } catch (err) {
    return '';
  }
}
```

The error message in `assertTestDatabaseUrl` names `Fretwizard_Test`. Change it to:

```js
    throw new Error('Integration tests need .env.test with DATABASE_URL pointing at a test database (for example postgresql://fretwizard:PASSWORD@localhost:5432/fretwizard_test?schema=public).');
```

- [ ] **Step 4: Run the unit suite and lint**

Run: `npm run test:unit && npm run lint`
Expected: all unit tests pass (25 or more), and lint is clean.

- [ ] **Step 5: Commit**

```bash
git add test/support/env.js test/unit/env.test.js test/unit/config.test.js
git commit -m "test: parse PostgreSQL URLs in the test-database guard"
```

**Phase 1 stops here.** Report: the container status (after the owner step), the unit test summary, and the commits.

---

### Task 3: Prisma schema and `init` migration on Postgres

**Files:**
- Modify: `prisma/schema.prisma` (provider + 37 of its 38 `@db.*` annotations)
- Replace: `prisma/migrations/20261001000000_init/migration.sql`
- Modify: `prisma/migrations/migration_lock.toml`
- Modify: `mappers/fretboard.js:3-4` (a comment that names SQL Server)

**Interfaces:**
- Consumes: Task 1's databases and the owner's `.env` / `.env.test`; Task 2's guard.
- Produces: a Postgres `init` migration with the same 8 tables, 7 cascading foreign keys and the same constraint names. The Prisma client API is unchanged (model and field names identical), so no file in `services/`, `routes/` or `mappers/` changes, apart from the comment.

The `init` migration is regenerated in place, keeping its folder name. It has only ever been applied to local databases, which are being replaced.

- [ ] **Step 1: Confirm the owner step is done and the database is up**

```bash
docker compose up -d
docker compose ps
```
Expected: `fretwizard-pg` shows `healthy` (it may take a few seconds). If compose reports `POSTGRES_PASSWORD is missing`, the owner step isn't done: stop and ask.

- [ ] **Step 2: Switch the schema**

```bash
sed -i 's/provider = "sqlserver"/provider = "postgresql"/; s/@db\.UniqueIdentifier/@db.Uuid/g; s/@db\.NVarChar(/@db.VarChar(/g' prisma/schema.prisma
grep -c '@db\.Uuid' prisma/schema.prisma
grep -c '@db\.VarChar(' prisma/schema.prisma
grep -nE 'sqlserver|UniqueIdentifier|NVarChar' prisma/schema.prisma
npx prisma validate
```
Expected:
- `15` for `@db.Uuid`, `22` for `@db.VarChar(`, and nothing for the last grep (with `@db.Char(64)`, that's all 38 annotations).
- `prisma validate` prints `The schema at prisma\schema.prisma is valid`.

If the counts differ, compare with `git diff prisma/schema.prisma` before going on.

- [ ] **Step 3: Regenerate the migration** (Git Bash, so the file is written as UTF-8 without a BOM)

```bash
npx prisma migrate diff --from-empty --to-schema-datamodel prisma/schema.prisma --script > prisma/migrations/20261001000000_init/migration.sql
printf '# Please do not edit this file manually\n# It should be added in your version-control system (i.e. Git)\nprovider = "postgresql"\n' > prisma/migrations/migration_lock.toml
grep -c 'CREATE TABLE' prisma/migrations/20261001000000_init/migration.sql
grep -c 'ON DELETE CASCADE' prisma/migrations/20261001000000_init/migration.sql
grep -nE 'NVARCHAR|UNIQUEIDENTIFIER|\[' prisma/migrations/20261001000000_init/migration.sql
grep -c 'UUID' prisma/migrations/20261001000000_init/migration.sql
npx prisma generate
```
Expected:
- `8` tables and `7` cascades.
- No NVARCHAR, UNIQUEIDENTIFIER or `[bracket]` identifiers.
- A UUID count of 15 or more.
- `prisma generate` succeeds.

- [ ] **Step 4: Update the mapper comment.** In `mappers/fretboard.js`, replace lines 3–4:

```js
// SQL Server column names are case-insensitive, so the low and high E strings
// are StringLowE / StringHighE rather than StringE / Stringe.
```
with:
```js
// The low and high E strings are StringLowE / StringHighE rather than
// StringE / Stringe: names that differ only by case are easy to mix up.
```

- [ ] **Step 5: Run the whole suite on Postgres**

Run: `npm test`
Expected:
- Unit tests pass.
- `test/setupDatabase.js` resets `fretwizard_test`, applying the new `init` migration.
- `ℹ tests 66`, `ℹ pass 66`, `ℹ fail 0`.

Check by name that these pass (Review Focus 1–3):
- "IDs that are not UUIDs are not found"
- "sign-up refuses an email that already has an account, in any letter case"
- "login returns tokens for the right password, ignoring email case and spaces"
- "stores Unicode note names and low/high E strings unchanged"

If anything fails, use superpowers:systematic-debugging. Likely Postgres-specific causes:
- a malformed UUID reaching Prisma (`P2023` → 500)
- ordering that relied on SQL Server's UNIQUEIDENTIFIER sort order (only `services/library.js:22` uses `CardId` as a tie-breaker, after `CreatedDate`)
- transaction behaviour in `services/import.js`

- [ ] **Step 6: Confirm no other route takes a raw id**

```bash
grep -rn "req.params" routes
```
Expected: only `routes/libraryCards.js` (the `:id`, checked against `UUID_PATTERN`), and `setup` in workspaces, which is validated against `scale`/`chord`. If another UUID param appears, add the same `UUID_PATTERN` check and a 404 test before committing.

- [ ] **Step 7: Lint and commit**

```bash
npm run lint
git add prisma/schema.prisma prisma/migrations mappers/fretboard.js
git commit -m "feat: switch the database from SQL Server to PostgreSQL"
```

---

### Task 4: Dev database, smoke check and docs

**Files:**
- Modify: `CLAUDE.md` (backend), `structure.md:56`, `../fret-wizard/CLAUDE.md:14`, `../NEXT-SESSION.md`
- Append: `.superpowers/sdd/2026-10-01-accounts-and-sync/progress.md`

**Interfaces:**
- Consumes: Task 3's migration.
- Produces: the dev database `fretwizard` migrated, and docs that describe Postgres only.

- [ ] **Step 1: Migrate the dev database**

```bash
npx prisma migrate deploy
npx prisma migrate status
```
Expected: `Applying migration 20261001000000_init`, then `Database schema is up to date!`.

- [ ] **Step 2: Smoke-boot the server with the real `.env`**

```bash
(node ./bin/www > ../../srv.log 2>&1 &)
for i in 1 2 3 4 5 6 7 8 9 10; do curl -s -m 2 http://localhost:3000/health && break; sleep 1; done; echo
curl -s -o /dev/null -w "library-cards without token: %{http_code}\n" http://localhost:3000/library-cards
curl -s -X POST http://localhost:3000/auth/signup -H "Content-Type: application/json" -d '{"username":"x","email":"short@example.com","password":"123"}'; echo
PID=$(netstat -ano | grep -E ':3000\s.*LISTENING' | awk '{print $NF}' | head -1); taskkill //PID $PID //F
rm -f ../../srv.log
```
Expected:
- `{"ok":true}`
- `library-cards without token: 401`
- a `VALIDATION_ERROR` with "Password must be at least 8 characters"

- [ ] **Step 3: Update the backend `CLAUDE.md`**

Replace the **Database** line under Commands with:
```markdown
- **Database:** `docker compose up -d` starts PostgreSQL 16 on `localhost:5432` (`docker-compose.yml`; role `fretwizard`, password from `POSTGRES_PASSWORD` in `.env`; databases `fretwizard` and `fretwizard_test`; data in the `fretwizard-pg-data` volume)
```

In the Architecture paragraph, change `Express 4 + Prisma 5 + SQL Server, CommonJS.` to `Express 4 + Prisma 5 + PostgreSQL, CommonJS.`

Under Conventions, replace `- Database names are PascalCase; JSON is camelCase.` with:
```markdown
- Database names are PascalCase; JSON is camelCase. In raw SQL (psql, pgAdmin) quote them: `SELECT * FROM "User";`
```

- [ ] **Step 4: Update `structure.md` and the frontend `CLAUDE.md`**

- In `structure.md` line 56, change `-> Prisma -> SQL Server` to `-> Prisma -> PostgreSQL`.
- In `../fret-wizard/CLAUDE.md` line 14, change `(Express + Prisma + SQL Server)` to `(Express + Prisma + PostgreSQL)`.

Then confirm nothing else outside the historical docs names SQL Server:
```bash
grep -rniE "sql ?server|sqlserver|mssql" --exclude-dir=node_modules --exclude-dir=docs --exclude-dir=.superpowers --exclude='.env*' --exclude=package-lock.json . ../fret-wizard/CLAUDE.md
```
Expected: no output. `.env*` is excluded because Claude may not read those files. The 2026-10-01 spec and plan under `docs/` are historical and stay unchanged.

- [ ] **Step 5: Record progress**

Append to `.superpowers/sdd/2026-10-01-accounts-and-sync/progress.md`:
```
2026-10-05: Database switched from SQL Server to PostgreSQL 16 (plan docs/superpowers/plans/2026-10-05-postgres-switch.md, branch feature/postgres). npm test on Postgres → integration 66/66. Dev DB fretwizard migrated with migrate deploy. Docker: container fretwizard-pg, volume fretwizard-pg-data.
```

In `../NEXT-SESSION.md`:
- In "Done on 2026-10-05", replace the SQL Server and compose bullets with one bullet: "Database: PostgreSQL 16 in Docker (`docker compose up -d` in `fretWizard-service`; container `fretwizard-pg`, port 5432; databases `fretwizard` and `fretwizard_test`)."
- Delete the "Switch to compose" leftover.
- Add a leftover: "Optional: remove the old SQL Server container and data: `docker rm -f fretwizard-sql` and `docker volume rm fretwizard-sql-data`."

- [ ] **Step 6: Commit**

```bash
git add CLAUDE.md structure.md
git commit -m "docs: describe the PostgreSQL setup"
```

Don't commit the frontend `CLAUDE.md` here. It already has other uncommitted edits (the new-card modal and the removed json-server row), which should be committed together with the modal work, when the owner asks. `.superpowers/` and `NEXT-SESSION.md` aren't tracked in either repo.

**Phase 2 stops here.** Report:
- the `npm test` summary
- `migrate status`
- the smoke-check output
- the commits

Then ask the owner whether to merge `feature/postgres` into `main` (superpowers:finishing-a-development-branch).
