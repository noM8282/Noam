import { Router } from "express";
import {
  GetBotInviteResponse,
  ListBotGuildsResponse,
  ListGuildChannelsParams,
  ListGuildChannelsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const DISCORD_API = "https://discord.com/api/v10";
// Discord channel type 0 = GUILD_TEXT, 5 = GUILD_ANNOUNCEMENT
const TEXT_CHANNEL_TYPES = new Set([0, 5]);

router.get("/bot/invite", (_req, res): void => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "DISCORD_CLIENT_ID not configured" });
    return;
  }
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  // administrator = permission bit 8
  url.searchParams.set("permissions", "8");
  url.searchParams.set("scope", "bot applications.commands");
  res.json(GetBotInviteResponse.parse({ url: url.toString() }));
});

router.get("/guilds", requireAuth, async (req, res): Promise<void> => {
  const userToken = req.session.discordAccessToken;
  const botToken = process.env.DISCORD_BOT_TOKEN;

  if (!userToken) {
    res.status(401).json({ error: "No Discord access token in session. Please log in again." });
    return;
  }
  if (!botToken) {
    res.status(500).json({ error: "DISCORD_BOT_TOKEN not configured" });
    return;
  }

  // Fetch user guilds and bot guilds in parallel
  const [userRes, botRes] = await Promise.all([
    fetch(`${DISCORD_API}/users/@me/guilds`, {
      headers: { Authorization: `Bearer ${userToken}` },
    }),
    fetch(`${DISCORD_API}/users/@me/guilds?limit=200`, {
      headers: { Authorization: `Bot ${botToken}` },
    }),
  ]);

  if (!userRes.ok) {
    req.log.error({ status: userRes.status }, "Failed to fetch user guilds from Discord");
    res.status(502).json({ error: "Failed to fetch your Discord servers" });
    return;
  }
  if (!botRes.ok) {
    req.log.error({ status: botRes.status }, "Failed to fetch bot guilds from Discord");
    res.status(502).json({ error: "Failed to fetch bot servers" });
    return;
  }

  const userGuilds = (await userRes.json()) as Array<{ id: string; name: string; icon: string | null }>;
  const botGuilds = (await botRes.json()) as Array<{ id: string; name: string; icon: string | null }>;

  // Return only guilds where the bot is present
  const botGuildIds = new Set(botGuilds.map((g) => g.id));
  const shared = userGuilds
    .filter((g) => botGuildIds.has(g.id))
    .map((g) => ({ id: g.id, name: g.name, icon: g.icon ?? null }));

  res.json(ListBotGuildsResponse.parse(shared));
});

router.get("/guilds/:guildId/channels", requireAuth, async (req, res): Promise<void> => {
  const params = ListGuildChannelsParams.safeParse({ guildId: req.params.guildId });
  if (!params.success) {
    res.status(400).json({ error: "Invalid guildId" });
    return;
  }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) {
    res.status(500).json({ error: "DISCORD_BOT_TOKEN not configured" });
    return;
  }

  const channelRes = await fetch(`${DISCORD_API}/guilds/${params.data.guildId}/channels`, {
    headers: { Authorization: `Bot ${botToken}` },
  });

  if (!channelRes.ok) {
    req.log.error({ status: channelRes.status, guildId: params.data.guildId }, "Failed to fetch channels");
    res.status(502).json({ error: "Failed to fetch channels — make sure the bot has access to this server" });
    return;
  }

  const channels = (await channelRes.json()) as Array<{ id: string; name: string; type: number }>;
  const textChannels = channels
    .filter((c) => TEXT_CHANNEL_TYPES.has(c.type))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ id: c.id, name: c.name }));

  res.json(ListGuildChannelsResponse.parse(textChannels));
});

export default router;
