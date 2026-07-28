# LuaBox — Script Management Platform

A full-stack script management platform for Lua script developers, with a web dashboard and Discord bot integration.

## Architecture

| Service | Path | Description |
|---|---|---|
| Dashboard (React/Vite) | `artifacts/dashboard/` | Web UI — login, scripts, panels, keys, servers |
| API Server (Express) | `artifacts/api-server/` | REST API, session auth, Discord OAuth |
| Discord Bot (discord.js) | `artifacts/discord-bot/` | Slash commands for panels & whitelist |
| DB library | `lib/db/` | Drizzle ORM schema + pg pool |
| API client | `lib/api-client-react/` | React Query hooks (orval-generated) |
| API spec | `lib/api-spec/` | OpenAPI YAML + orval config |
| Zod schemas | `lib/api-zod/` | Runtime validation types (orval-generated) |

## Running the project

All services start via their Replit workflows:
- **Dashboard** — `artifacts/dashboard: web` workflow (Vite dev server)
- **API Server** — `artifacts/api-server: API Server` workflow (esbuild + Node)
- **Discord Bot** — `Discord Bot` workflow (esbuild + Node watch)

## Required secrets

| Secret | Where to get it |
|---|---|
| `SESSION_SECRET` | Any random string (already set) |
| `DISCORD_BOT_TOKEN` | Discord Developer Portal → App → Bot tab |
| `DISCORD_CLIENT_ID` | Discord Developer Portal → App → General Information → Application ID |
| `DISCORD_CLIENT_SECRET` | Discord Developer Portal → App → OAuth2 tab |

`DATABASE_URL` and `PG*` vars are managed automatically by Replit.

## Database

PostgreSQL via Replit's built-in database. Schema managed with Drizzle ORM.
Tables: `users`, `scripts`, `panels`, `licenses`, `whitelist`, `servers`, `sessions`.

To regenerate the API client/zod schemas after changing `lib/api-spec/openapi.yaml`:
```
pnpm --filter @workspace/api-spec run generate
```

## Setup status

All services verified running after initial setup (2026-07-28):
- ✅ `pnpm install` — dependencies installed across all workspace packages
- ✅ `pnpm --filter @workspace/db run push` — Drizzle schema pushed to Replit PostgreSQL
- ✅ Dashboard (`artifacts/dashboard: web`) — Vite dev server running, login page visible
- ✅ API Server (`artifacts/api-server: API Server`) — Express server listening, health check OK
- ✅ Discord Bot (`Discord Bot`) — Bot online, global slash commands registered

Secrets configured: `SESSION_SECRET`, `DISCORD_BOT_TOKEN`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`

## User preferences

- Keep existing monorepo structure (pnpm workspace)
- Do not restructure or migrate the stack
