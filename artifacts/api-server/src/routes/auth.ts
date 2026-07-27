import { Router } from "express";
import { db, usersTable } from "@workspace/db";
import { eq } from "drizzle-orm";
import { GetMeResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

const DISCORD_API = "https://discord.com/api/v10";
const DISCORD_SCOPES = "identify";

function getRedirectUri(req: { headers: { host?: string } }): string {
  if (process.env.DISCORD_REDIRECT_URI) {
    return process.env.DISCORD_REDIRECT_URI;
  }
  const domain = process.env.REPLIT_DEV_DOMAIN;
  if (domain) {
    return `https://${domain}/api/auth/discord/callback`;
  }
  const host = req.headers.host ?? "localhost";
  return `http://${host}/api/auth/discord/callback`;
}

router.get("/auth/discord", (req, res): void => {
  const clientId = process.env.DISCORD_CLIENT_ID;
  if (!clientId) {
    res.status(500).json({ error: "DISCORD_CLIENT_ID not configured" });
    return;
  }
  const redirectUri = getRedirectUri(req);
  const url = new URL("https://discord.com/oauth2/authorize");
  url.searchParams.set("client_id", clientId);
  url.searchParams.set("redirect_uri", redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("scope", DISCORD_SCOPES);
  res.redirect(url.toString());
});

router.get("/auth/discord/callback", async (req, res): Promise<void> => {
  const code = req.query.code as string | undefined;
  if (!code) {
    res.status(400).json({ error: "Missing code parameter" });
    return;
  }

  const clientId = process.env.DISCORD_CLIENT_ID;
  const clientSecret = process.env.DISCORD_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    res.status(500).json({ error: "Discord OAuth not configured" });
    return;
  }

  const redirectUri = getRedirectUri(req);

  // Exchange code for token
  const tokenRes = await fetch(`${DISCORD_API}/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: clientId,
      client_secret: clientSecret,
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    req.log.error({ status: tokenRes.status }, "Failed to exchange Discord code");
    res.status(400).json({ error: "Failed to exchange authorization code" });
    return;
  }

  const tokenData = (await tokenRes.json()) as { access_token: string };

  // Fetch Discord user info
  const userRes = await fetch(`${DISCORD_API}/users/@me`, {
    headers: { Authorization: `Bearer ${tokenData.access_token}` },
  });

  if (!userRes.ok) {
    req.log.error({ status: userRes.status }, "Failed to fetch Discord user");
    res.status(400).json({ error: "Failed to fetch Discord user info" });
    return;
  }

  const discordUser = (await userRes.json()) as {
    id: string;
    username: string;
    avatar: string | null;
  };

  // Upsert user in database
  const existing = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.discordId, discordUser.id))
    .limit(1);

  let userId: number;
  if (existing.length > 0) {
    const updated = await db
      .update(usersTable)
      .set({ username: discordUser.username, avatar: discordUser.avatar })
      .where(eq(usersTable.discordId, discordUser.id))
      .returning({ id: usersTable.id });
    userId = updated[0].id;
  } else {
    const inserted = await db
      .insert(usersTable)
      .values({
        discordId: discordUser.id,
        username: discordUser.username,
        avatar: discordUser.avatar,
      })
      .returning({ id: usersTable.id });
    userId = inserted[0].id;
  }

  req.session.userId = userId;
  res.redirect("/");
});

router.get("/auth/me", requireAuth, async (req, res): Promise<void> => {
  const users = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.id, req.session.userId!))
    .limit(1);

  if (users.length === 0) {
    res.status(401).json({ error: "User not found" });
    return;
  }

  const user = users[0];
  res.json(
    GetMeResponse.parse({
      id: user.id,
      discordId: user.discordId,
      username: user.username,
      avatar: user.avatar,
      createdAt: user.createdAt.toISOString(),
    })
  );
});

router.post("/auth/logout", requireAuth, (req, res): void => {
  req.session.destroy((err) => {
    if (err) {
      req.log.error({ err }, "Failed to destroy session");
      res.status(500).json({ error: "Failed to logout" });
      return;
    }
    res.json({ success: true });
  });
});

export default router;
