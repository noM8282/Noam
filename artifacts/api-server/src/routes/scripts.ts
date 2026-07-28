import { Router } from "express";
import { db, scriptsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  CreateScriptBody,
  CreateScriptResponse,
  GetScriptParams,
  GetScriptResponse,
  UpdateScriptParams,
  UpdateScriptBody,
  UpdateScriptResponse,
  DeleteScriptParams,
  DeleteScriptResponse,
  ToggleScriptParams,
  ToggleScriptResponse,
  ListScriptsResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";
import { obfuscateLua } from "../lib/obfuscate";

const router = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function formatScript(s: typeof scriptsTable.$inferSelect) {
  return {
    id: s.id,
    ownerId: s.ownerId,
    name: s.name,
    description: s.description,
    version: s.version,
    status: s.status as "active" | "disabled",
    content: s.content,
    obfuscatedContent: s.obfuscatedContent,
    createdAt: s.createdAt.toISOString(),
  };
}

router.get("/scripts", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const scripts = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.ownerId, userId));
  res.json(ListScriptsResponse.parse(scripts.map(formatScript)));
});

router.post("/scripts", requireAuth, async (req, res): Promise<void> => {
  const parsed = CreateScriptBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;

  const { content, ...rest } = parsed.data;
  const obfuscatedContent = content ? obfuscateLua(content) : undefined;

  const [script] = await db
    .insert(scriptsTable)
    .values({ ...rest, ownerId: userId, content, obfuscatedContent })
    .returning();
  res.status(201).json(CreateScriptResponse.parse(formatScript(script)));
});

router.get("/scripts/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetScriptParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const userId = req.session.userId!;
  const [script] = await db
    .select()
    .from(scriptsTable)
    .where(and(eq(scriptsTable.id, params.data.id), eq(scriptsTable.ownerId, userId)));
  if (!script) {
    res.status(404).json({ error: "Script not found" });
    return;
  }
  res.json(GetScriptResponse.parse(formatScript(script)));
});

router.patch("/scripts/:id", requireAuth, async (req, res): Promise<void> => {
  const paramsParsed = UpdateScriptParams.safeParse({ id: parseId(req.params.id) });
  if (!paramsParsed.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = UpdateScriptBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  const userId = req.session.userId!;

  const { content, ...rest } = bodyParsed.data;
  const updateData: Partial<typeof scriptsTable.$inferInsert> = { ...rest };
  if (content !== undefined) {
    updateData.content = content;
    updateData.obfuscatedContent = obfuscateLua(content);
  }

  const [script] = await db
    .update(scriptsTable)
    .set(updateData)
    .where(and(eq(scriptsTable.id, paramsParsed.data.id), eq(scriptsTable.ownerId, userId)))
    .returning();
  if (!script) {
    res.status(404).json({ error: "Script not found" });
    return;
  }
  res.json(UpdateScriptResponse.parse(formatScript(script)));
});

router.delete("/scripts/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteScriptParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const userId = req.session.userId!;
  const deleted = await db
    .delete(scriptsTable)
    .where(and(eq(scriptsTable.id, params.data.id), eq(scriptsTable.ownerId, userId)))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Script not found" });
    return;
  }
  res.json(DeleteScriptResponse.parse({ success: true }));
});

router.post("/scripts/:id/toggle", requireAuth, async (req, res): Promise<void> => {
  const params = ToggleScriptParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const userId = req.session.userId!;
  const [current] = await db
    .select()
    .from(scriptsTable)
    .where(and(eq(scriptsTable.id, params.data.id), eq(scriptsTable.ownerId, userId)));
  if (!current) {
    res.status(404).json({ error: "Script not found" });
    return;
  }
  const newStatus = current.status === "active" ? "disabled" : "active";
  const [updated] = await db
    .update(scriptsTable)
    .set({ status: newStatus })
    .where(eq(scriptsTable.id, params.data.id))
    .returning();
  res.json(ToggleScriptResponse.parse(formatScript(updated)));
});

export default router;
