import { Router } from "express";
import { db, whitelistTable, scriptsTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListWhitelistParams,
  ListWhitelistResponse,
  AddToWhitelistParams,
  AddToWhitelistBody,
  AddToWhitelistResponse,
  RemoveFromWhitelistParams,
  RemoveFromWhitelistResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

function parseId(raw: string | string[]): number {
  return parseInt(Array.isArray(raw) ? raw[0] : raw, 10);
}

async function verifyScriptOwnership(scriptId: number, userId: number): Promise<boolean> {
  const [script] = await db
    .select({ id: scriptsTable.id })
    .from(scriptsTable)
    .where(and(eq(scriptsTable.id, scriptId), eq(scriptsTable.ownerId, userId)));
  return !!script;
}

router.get("/scripts/:id/whitelist", requireAuth, async (req, res): Promise<void> => {
  const params = ListWhitelistParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const userId = req.session.userId!;
  const isOwner = await verifyScriptOwnership(params.data.id, userId);
  if (!isOwner) {
    res.status(404).json({ error: "Script not found" });
    return;
  }
  const entries = await db
    .select()
    .from(whitelistTable)
    .where(eq(whitelistTable.scriptId, params.data.id));
  res.json(
    ListWhitelistResponse.parse(
      entries.map((e) => ({
        id: e.id,
        scriptId: e.scriptId,
        discordUserId: e.discordUserId,
        addedBy: e.addedBy,
        createdAt: e.createdAt.toISOString(),
      }))
    )
  );
});

router.post("/scripts/:id/whitelist", requireAuth, async (req, res): Promise<void> => {
  const params = AddToWhitelistParams.safeParse({ id: parseId(req.params.id) });
  if (!params.success) {
    res.status(400).json({ error: "Invalid id" });
    return;
  }
  const bodyParsed = AddToWhitelistBody.safeParse(req.body);
  if (!bodyParsed.success) {
    res.status(400).json({ error: bodyParsed.error.message });
    return;
  }
  const userId = req.session.userId!;
  const isOwner = await verifyScriptOwnership(params.data.id, userId);
  if (!isOwner) {
    res.status(404).json({ error: "Script not found" });
    return;
  }
  const [entry] = await db
    .insert(whitelistTable)
    .values({
      scriptId: params.data.id,
      discordUserId: bodyParsed.data.discordUserId,
      addedBy: bodyParsed.data.addedBy,
    })
    .returning();
  res.status(201).json(
    AddToWhitelistResponse.parse({
      id: entry.id,
      scriptId: entry.scriptId,
      discordUserId: entry.discordUserId,
      addedBy: entry.addedBy,
      createdAt: entry.createdAt.toISOString(),
    })
  );
});

router.delete("/scripts/:id/whitelist/:entryId", requireAuth, async (req, res): Promise<void> => {
  const params = RemoveFromWhitelistParams.safeParse({
    id: parseId(req.params.id),
    entryId: parseId(req.params.entryId),
  });
  if (!params.success) {
    res.status(400).json({ error: "Invalid params" });
    return;
  }
  const userId = req.session.userId!;
  const isOwner = await verifyScriptOwnership(params.data.id, userId);
  if (!isOwner) {
    res.status(404).json({ error: "Script not found" });
    return;
  }
  const deleted = await db
    .delete(whitelistTable)
    .where(
      and(
        eq(whitelistTable.id, params.data.entryId),
        eq(whitelistTable.scriptId, params.data.id)
      )
    )
    .returning();
  if (deleted.length === 0) {
    res.status(404).json({ error: "Whitelist entry not found" });
    return;
  }
  res.json(RemoveFromWhitelistResponse.parse({ success: true }));
});

export default router;
