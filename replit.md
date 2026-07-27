# LuaBox

A full-stack script management platform for developers who build and distribute scripts (Lua, game mods, etc.) to Discord communities. Includes a web dashboard and a Discord bot.

## Run & Operate

- `pnpm --filter @workspace/api-server run dev` — API server (port 8080, proxied at `/api`)
- `pnpm --filter @workspace/dashboard run dev` — Web dashboard (proxied at `/`)
- `pnpm --filter @workspace/discord-bot run build && pnpm --filter @workspace/discord-bot run start` — Discord bot
- `pnpm run typecheck` — full typecheck across all packages
- `pnpm --filter @workspace/api-spec run codegen` — regenerate API hooks and Zod schemas from the OpenAPI spec
- `pnpm --filter @workspace/db run push` — push DB schema changes (dev only)
- Required env: `DATABASE_URL`, `SESSION_SECRET`, `DISCORD_CLIENT_ID`, `DISCORD_CLIENT_SECRET`, `DISCORD_BOT_TOKEN`
- Optional env: `DISCORD_REDIRECT_URI` — override OAuth2 redirect URI (defaults to `https://$REPLIT_DEV_DOMAIN/api/auth/discord/callback`)

## Discord Setup (Required)

In your Discord application at https://discord.com/developers/applications:
1. **OAuth2 → Redirects**: Add `https://<your-dev-domain>/api/auth/discord/callback`
2. **Bot → Privileged Gateway Intents**: Enable as needed
3. **Bot invite URL** (OAuth2 → URL Generator): scopes `bot` + `applications.commands`, permissions as required

## Stack

- pnpm workspaces, Node.js 24, TypeScript 5.9
- Frontend: React + Vite + Tailwind CSS + shadcn/ui, wouter routing
- API: Express 5 with express-session (PostgreSQL session store)
- DB: PostgreSQL + Drizzle ORM
- Auth: Discord OAuth2 (custom implementation, no passport)
- Validation: Zod (`zod/v4`), `drizzle-zod`
- API codegen: Orval (from OpenAPI spec)
- Discord bot: discord.js v14

## Where things live

- `lib/api-spec/openapi.yaml` — OpenAPI spec (source of truth for all endpoints)
- `lib/db/src/schema/` — database tables (users, scripts, panels, licenses, whitelist, servers)
- `artifacts/api-server/src/routes/` — Express route handlers
- `artifacts/api-server/src/middlewares/auth.ts` — `requireAuth` middleware
- `artifacts/dashboard/src/` — React frontend
- `artifacts/discord-bot/src/index.ts` — Discord bot (all slash commands in one file)

## Database Tables

- `users` — Discord-authenticated users
- `scripts` — script projects with version + status
- `panels` — Discord embed panels linked to scripts
- `licenses` — license keys (generated with `SCH-` prefix)
- `whitelist` — per-script Discord user whitelist
- `servers` — connected Discord guilds

## Discord Bot Commands

- `/panel create|send|delete` — manage Discord embed panels
- `/whitelist add|remove|list` — manage per-script whitelists
- `/key generate|revoke` — manage license keys
- `/script list` — list active scripts
- `/server setup` — connect a Discord guild to LuaBox

## Architecture decisions

- Discord OAuth2 implemented directly with fetch (no passport.js) for simplicity
- Sessions stored in PostgreSQL via `connect-pg-simple` using the `SESSION_SECRET` env
- API is contract-first: all types generated from `lib/api-spec/openapi.yaml` via Orval
- Discord bot runs as a separate process with direct DB access (no API round-trip)
- `DISCORD_REDIRECT_URI` falls back to `REPLIT_DEV_DOMAIN` for zero-config dev

## User preferences

_Populate as you build — explicit user instructions worth remembering across sessions._

## Gotchas

- After any OpenAPI spec change, run codegen: `pnpm --filter @workspace/api-spec run codegen`
- Discord OAuth2 redirect URI must be registered in the Discord Developer Portal
- Bot slash commands register globally on startup (~1 hour Discord propagation) or per-guild immediately
- Session cookie is `secure: true` in production — ensure HTTPS
