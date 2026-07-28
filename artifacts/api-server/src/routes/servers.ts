import { Router } from "express";
import { db, serversTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListServersResponse,
  DisconnectServerParams,
  DisconnectServerResponse,
  SyncServersResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const DISCORD_API = "https://discord.com/api/v10";

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

router.get("/servers", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const servers = await db
    .select()
    .from(serversTable)
    .where(eq(serversTable.ownerId, userId));
  res.json(
    ListServersResponse.parse(
      servers.map((s) => ({
        id: s.id,
        guildId: s.guildId,
        name: s.name,
        ownerId: s.ownerId,
        createdAt: s.createdAt.toISOString(),
      }))
    )
  );
});

// POST /servers/sync — discover guilds where both the user and bot are present
// and add any new ones to the servers table
router.post("/servers/sync", requireAuth, async (req, res): Promise<void> => {
  const userToken = req.session.discordAccessToken;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!userToken) {
    res.status(401).json({ error: "No Discord access token. Please log in again." });
    return;
  }
  if (!botToken) {
    res.status(500).json({ error: "DISCORD_BOT_TOKEN not configured" });
    return;
  }

  const userId = req.session.userId!;

  const [userRes, botRes] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${userToken}` },
    }),
    fetch(`${DISCORD_API}/users/@me/guilds?limit=200`, {
      headers: { Authorization: `Bot ${botToken}` },
    }),
  ]);

  if (!userRes.ok || !botRes.ok) {
    res.status(502).json({ error: "Failed to fetch guilds from Discord" });
    return;
  }

  const userGuilds = (await userRes.json()) as Array<{ id: string; name: string }>;
  const botGuilds = (await botRes.json()) as Array<{ id: string; name: string }>;

  const botGuildMap = new Map(botGuilds.map((g) => [g.id, g.name]));

  // Guilds where user is a member and bot is also present
  const shared = userGuilds.filter((g) => botGuildMap.has(g.id));

  // Fetch already-registered guilds to avoid duplicates
  const existing = await db
    .select({ guildId: serversTable.guildId })
    .from(serversTable)
    .where(eq(serversTable.ownerId, userId));
  const existingIds = new Set(existing.map((s) => s.guildId));

  const toInsert = shared.filter((g) => !existingIds.has(g.id));

  if (toInsert.length > 0) {
    await db.insert(serversTable).values(
      toInsert.map((g) => ({
        guildId: g.id,
        name: g.name,
        ownerId: userId,
      }))
    );
  }

  res.json(SyncServersResponse.parse({ synced: toInsert.length, total: shared.length }));
});

router.delete("/servers/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DisconnectServerParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const userId = req.session.userId!;
  const deleted = await db
    .delete(serversTable)
    .where(and(eq(serversTable.id, params.data.id), eq(serversTable.ownerId, userId)))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Server not found" });
    return;
  }
  res.json(DisconnectServerResponse.parse({ success: true }));
});

export default router;
