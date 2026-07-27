import { Router } from "express";
import { db, serversTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import {
  ListServersResponse,
  DisconnectServerParams,
  DisconnectServerResponse,
} from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

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
