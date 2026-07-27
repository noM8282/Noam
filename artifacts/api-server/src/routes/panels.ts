import { Router } from "express";
import { db, panelsTable } from "@workspace/db";
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
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

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
  const panels = await db
    .select()
    .from(panelsTable)
    .where(eq(panelsTable.ownerId, userId));
  res.json(ListPanelsResponse.parse(panels.map(formatPanel)));
});

router.post("/panels", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreatePanelBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [panel] = await db
    .insert(panelsTable)
    .values({ ...parsed.data, ownerId: userId, requiredRoles: parsed.data.requiredRoles ?? [] })
    .returning();
  res.status(201).json(CreatePanelResponse.parse(formatPanel(panel)));
});

router.get("/panels/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetPanelParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const userId = req.session.userId!;
  const [panel] = await db
    .select()
    .from(panelsTable)
    .where(and(eq(panelsTable.id, params.data.id), eq(panelsTable.ownerId, userId)));
  if (!panel) {
    res.status(404).json({ error: "Panel not found" });
    return;
  }
  res.json(GetPanelResponse.parse(formatPanel(panel)));
});

router.patch("/panels/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = UpdatePanelParams.safeParse({ id: parseId(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdatePanelBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  const [panel] = await db
    .update(panelsTable)
    .set(bodyParsed.data)
    .where(and(eq(panelsTable.id, paramsParsed.data.id), eq(panelsTable.ownerId, userId)))
    .returning();
  if (!panel) {
    res.status(404).json({ error: "Panel not found" });
    return;
  }
  res.json(UpdatePanelResponse.parse(formatPanel(panel)));
});

router.delete("/panels/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeletePanelParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const userId = req.session.userId!;
  const deleted = await db
    .delete(panelsTable)
    .where(and(eq(panelsTable.id, params.data.id), eq(panelsTable.ownerId, userId)))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Panel not found" });
    return;
  }
  res.json(DeletePanelResponse.parse({ success: true }));
});

export default router;
