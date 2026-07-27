import { pgTable, serial, text, integer, timestamp } from "drizzle-orm/pg-core";
import { createInsertSchema } from "drizzle-zod";
import { z } from "zod/v4";
import { scriptsTable } from "./scripts";

export const whitelistTable = pgTable("whitelist", {
  id: serial("id").primaryKey(),
  scriptId: integer("script_id").notNull().references(() => scriptsTable.id, { onDelete: "cascade" }),
  discordUserId: text("discord_user_id").notNull(),
  addedBy: text("added_by"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const insertWhitelistSchema = createInsertSchema(whitelistTable).omit({ id: true, createdAt: true });
export type InsertWhitelist = z.infer<typeof insertWhitelistSchema>;
export type WhitelistEntry = typeof whitelistTable.$inferSelect;
