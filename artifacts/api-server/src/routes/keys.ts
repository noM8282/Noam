import { Router } from "express";
import { db, licensesTable, scriptsTable } from "@workspace/db";
import { eq, and, inArray } from "drizzle-orm";
import { randomUUID } from "crypto";
import {
  GenerateKeyBody,
  GenerateKeyResponse,
  GetKeyParams,
  GetKeyResponse,
  DeleteKeyParams,
  DeleteKeyResponse,
  RevokeKeyParams,
  RevokeKeyResponse,
  ListKeysResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

function formatKey(k: typeof licensesTable.$inferSelect) {
  return {
    id: k.id,
    key: k.key,
    scriptId: k.scriptId,
    userId: k.userId,
    expiresAt: k.expiresAt ? k.expiresAt.toISOString() : null,
    status: k.status as "active" | "revoked" | "expired",
    whitelisted: k.whitelisted,
    createdAt: k.createdAt.toISOString(),
  };
}

async function getUserScriptIds(userId: number): Promise<number[]> {
  const scripts = await db
    .select({ id: scriptsTable.id })
    .from(scriptsTable)
    .where(eq(scriptsTable.ownerId, userId));
  return scripts.map((s) => s.id);
}

router.get("/keys", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;
  const scriptIds = await getUserScriptIds(userId);
  if (scriptIds.length === 0) {
    res.json(ListKeysResponse.parse([]));
    return;
  }
  const keys = await db
    .select()
    .from(licensesTable)
    .where(inArray(licensesTable.scriptId, scriptIds));
  res.json(ListKeysResponse.parse(keys.map(formatKey)));
});

router.post("/keys", requireAuth, async (req, res): Promise<void> => {
  const parsed = GenerateKeyBody.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({ error: parsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  // Verify script ownership
  const [script] = await db
    .select()
    .from(scriptsTable)
    .where(and(eq(scriptsTable.id, parsed.data.scriptId), eq(scriptsTable.ownerId, userId)));
  if (!script) {
    res.status(404).json({ error: "Script not found" });
    return;
  }
  const key = `SCH-${randomUUID().replace(/-/g, "").toUpperCase().slice(0, 20)}`;
  const [license] = await db
    .insert(licensesTable)
    .values({
      key,
      scriptId: parsed.data.scriptId,
      userId: parsed.data.userId,
      expiresAt: parsed.data.expiresAt ? new Date(parsed.data.expiresAt) : undefined,
      whitelisted: parsed.data.whitelisted ?? false,
      status: "active",
    })
    .returning();
  res.status(201).json(GenerateKeyResponse.parse(formatKey(license)));
});

router.get("/keys/:id", requireAuth, async (req, res): Promise<void> => {
  const params = GetKeyParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const userId = req.session.userId!;
  const scriptIds = await getUserScriptIds(userId);
  if (scriptIds.length === 0) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  const [key] = await db
    .select()
    .from(licensesTable)
    .where(and(eq(licensesTable.id, params.data.id), inArray(licensesTable.scriptId, scriptIds)));
  if (!key) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  res.json(GetKeyResponse.parse(formatKey(key)));
});

router.delete("/keys/:id", requireAuth, async (req, res): Promise<void> => {
  const params = DeleteKeyParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const userId = req.session.userId!;
  const scriptIds = await getUserScriptIds(userId);
  if (scriptIds.length === 0) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  const deleted = await db
    .delete(licensesTable)
    .where(and(eq(licensesTable.id, params.data.id), inArray(licensesTable.scriptId, scriptIds)))
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  res.json(DeleteKeyResponse.parse({ success: true }));
});

router.post("/keys/:id/revoke", requireAuth, async (req, res): Promise<void> => {
  const params = RevokeKeyParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const userId = req.session.userId!;
  const scriptIds = await getUserScriptIds(userId);
  if (scriptIds.length === 0) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  const [key] = await db
    .update(licensesTable)
    .set({ status: "revoked" })
    .where(and(eq(licensesTable.id, params.data.id), inArray(licensesTable.scriptId, scriptIds)))
    .returning();
  if (!key) {
    res.status(404).json({ error: "Key not found" });
    return;
  }
  res.json(RevokeKeyResponse.parse(formatKey(key)));
});

export default router;
