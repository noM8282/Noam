import { Router } from "express";
import { db, usersTable, scriptsTable, panelsTable, licensesTable, serversTable } from "@workspace/db";
import { eq, count } from "drizzle-orm";
import { GetOverviewStatsResponse } from "@workspace/api-zod";
import { requireAuth } from "../middlewares/auth";

const router = Router();

router.get("/overview/stats", requireAuth, async (req, res): Promise<void> => {
  const userId = req.session.userId!;

  const [scriptCount] = await db
    .select({ count: count() })
    .from(scriptsTable)
    .where(eq(scriptsTable.ownerId, userId));

  const [panelCount] = await db
    .select({ count: count() })
    .from(panelsTable)
    .where(eq(panelsTable.ownerId, userId));

  const [keyCount] = await db
    .select({ count: count() })
    .from(licensesTable)
    .where(
      eq(
        licensesTable.scriptId,
        db
          .select({ id: scriptsTable.id })
          .from(scriptsTable)
          .where(eq(scriptsTable.ownerId, userId))
          .limit(1)
      )
    );

  // Total keys across all user's scripts - use a join approach
  const userScripts = await db
    .select({ id: scriptsTable.id })
    .from(scriptsTable)
    .where(eq(scriptsTable.ownerId, userId));

  let totalKeys = 0;
  if (userScripts.length > 0) {
    const scriptIds = userScripts.map((s) => s.id);
    const keyCounts = await Promise.all(
      scriptIds.map((scriptId) =>
        db
          .select({ count: count() })
          .from(licensesTable)
          .where(eq(licensesTable.scriptId, scriptId))
      )
    );
    totalKeys = keyCounts.reduce((sum, [row]) => sum + Number(row.count), 0);
  }

  const [serverCount] = await db
    .select({ count: count() })
    .from(serversTable)
    .where(eq(serversTable.ownerId, userId));

  const [userCount] = await db.select({ count: count() }).from(usersTable);

  res.json(
    GetOverviewStatsResponse.parse({
      totalScripts: Number(scriptCount.count),
      totalPanels: Number(panelCount.count),
      totalKeys,
      activeUsers: Number(userCount.count),
      connectedServers: Number(serverCount.count),
    })
  );
});

export default router;
