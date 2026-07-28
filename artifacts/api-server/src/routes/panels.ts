import { Router } from "express";
import { db, panelsTable, scriptsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreatePanelBody,
  CreatePanelResponse,
  GetPanelParams,
  GetPanelResponse,
  UpdatePanelParams,
  UpdatePanelBody,
  UpdatePanelResponse,
  DeletePanelParams,
  DeletePanelResponse,
  ListPanelsResponse,
  SendPanelParams,
  SendPanelBody,
  SendPanelResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();
const DISCORD_API = "https://discord.com/api/v10";

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function formatPanel(p: typeof panelsTable.$inferSelect) {
  return {
    id: p.id,
    ownerId: p.ownerId,
    scriptId: p.scriptId,
    name: p.name,
    description: p.description,
    discordServerId: p.discordServerId,
    channelId: p.channelId,
    messageId: p.messageId,
    requiredRoles: p.requiredRoles ?? [],
    createdAt: p.createdAt.toISOString(),
  };
}

router.get("/panels", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const panels = await db.select().from(panelsTable).where(eq(panelsTable.ownerId, userId));
  res.json(ListPanelsResponse.parse(panels.map(formatPanel)));
});

router.post("/panels", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePanelBody.safeParse(req.body);
  if (!parsed.success) { res.status(400).json({ error: parsed.error.message }); return; }
  const userId = req.session.userId!;
  const [panel] = await db
    .insert(panelsTable)
    .values({ ...parsed.data, ownerId: userId, requiredRoles: parsed.data.requiredRoles ?? [] })
    .returning();
  res.status(201).json(CreatePanelResponse.parse(formatPanel(panel)));
});

router.get("/panels/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPanelParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const userId = req.session.userId!;
  const [panel] = await db
    .select().from(panelsTable)
    .where(and(eq(panelsTable.id, params.data.id), eq(panelsTable.ownerId, userId)));
  if (!panel) { res.status(404).json({ error: "Panel not found" }); return; }
  res.json(GetPanelResponse.parse(formatPanel(panel)));
});

router.patch("/panels/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = UpdatePanelParams.safeParse({ id: parseId(req.params.id) });
  if (!paramsParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const bodyParsed = UpdatePanelBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }
  const userId = req.session.userId!;
  const [panel] = await db
    .update(panelsTable).set(bodyParsed.data)
    .where(and(eq(panelsTable.id, paramsParsed.data.id), eq(panelsTable.ownerId, userId)))
    .returning();
  if (!panel) { res.status(404).json({ error: "Panel not found" }); return; }
  res.json(UpdatePanelResponse.parse(formatPanel(panel)));
});

router.delete("/panels/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeletePanelParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const userId = req.session.userId!;
  const deleted = await db
    .delete(panelsTable)
    .where(and(eq(panelsTable.id, params.data.id), eq(panelsTable.ownerId, userId)))
    .returning();
  if (deleted.length === 0) { res.status(404).json({ error: "Panel not found" }); return; }
  res.json(DeletePanelResponse.parse({ success: true }));
});

// POST /panels/:id/send — send a styled Discord embed matching the reference design
router.post("/panels/:id/send", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = SendPanelParams.safeParse({ id: parseId(req.params.id) });
  if (!paramsParsed.success) { res.status(400).json({ error: "Invalid id" }); return; }
  const bodyParsed = SendPanelBody.safeParse(req.body);
  if (!bodyParsed.success) { res.status(400).json({ error: bodyParsed.error.message }); return; }

  const botToken = process.env.DISCORD_BOT_TOKEN;
  if (!botToken) { res.status(500).json({ error: "DISCORD_BOT_TOKEN not configured" }); return; }

  const userId = req.session.userId!;
  const [panel] = await db
    .select().from(panelsTable)
    .where(and(eq(panelsTable.id, paramsParsed.data.id), eq(panelsTable.ownerId, userId)));
  if (!panel) { res.status(404).json({ error: "Panel not found" }); return; }

  let scriptName = `Script #${panel.scriptId}`;
  const [script] = await db
    .select({ name: scriptsTable.name })
    .from(scriptsTable)
    .where(eq(scriptsTable.id, panel.scriptId));
  if (script) scriptName = script.name;

  // Embed — matches the reference style: title = script name, description = label
  const embed = {
    title: scriptName.toUpperCase(),
    description: panel.description ?? "Op",
    color: 0x5865f2, // Discord blurple
    footer: { text: "LuaBox • License Management" },
    timestamp: new Date().toISOString(),
  };

  // Buttons exactly matching reference: View Script (blue), Redeem Key (green),
  // Stats (gray), Get Buyer Role (blue), Reset HWID (red)
  const components = [
    {
      type: 1,
      components: [
        { type: 2, label: "📜 View Script",    style: 1, custom_id: `view_script_${panel.id}` },
        { type: 2, label: "🔑 Redeem Key",     style: 3, custom_id: `redeem_key_${panel.id}` },
      ],
    },
    {
      type: 1,
      components: [
        { type: 2, label: "📊 Stats",          style: 2, custom_id: `stats_${panel.id}` },
        { type: 2, label: "👤 Get Buyer Role", style: 1, custom_id: `buyer_role_${panel.id}` },
      ],
    },
    {
      type: 1,
      components: [
        { type: 2, label: "⚙️ Reset HWID",    style: 4, custom_id: `reset_hwid_${panel.id}` },
      ],
    },
  ];

  const discordRes = await fetch(`${DISCORD_API}/channels/${bodyParsed.data.channelId}/messages`, {
    method: "POST",
    headers: { Authorization: `Bot ${botToken}`, "Content-Type": "application/json" },
    body: JSON.stringify({ embeds: [embed], components }),
  });

  if (!discordRes.ok) {
    const err = await discordRes.text();
    req.log.error({ status: discordRes.status, err }, "Failed to send panel to Discord");
    res.status(502).json({ error: "Failed to send to Discord. Make sure the bot can send messages in that channel." });
    return;
  }

  const message = (await discordRes.json()) as { id: string };
  await db.update(panelsTable)
    .set({ channelId: bodyParsed.data.channelId, messageId: message.id })
    .where(eq(panelsTable.id, panel.id));

  res.json(SendPanelResponse.parse({ success: true }));
});

export default router;
