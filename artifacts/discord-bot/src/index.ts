import {
  Client,
  GatewayIntentBits,
  REST,
  Routes,
  SlashCommandBuilder,
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
  PermissionFlagsBits,
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type ModalSubmitInteraction,
  type StringSelectMenuInteraction,
  type Interaction,
  type TextChannel,
} from "discord.js";
import pino from "pino";
import {
  db,
  scriptsTable,
  panelsTable,
  licensesTable,
  whitelistTable,
  serversTable,
  usersTable,
} from "@workspace/db";
import { eq, and, isNull } from "drizzle-orm";
import { randomUUID } from "crypto";

const logger = pino({ level: "info" });

// Prevent unhandled promise rejections (e.g. expired interaction tokens) from crashing the process
process.on("unhandledRejection", (err) => {
  logger.error({ err }, "Unhandled rejection — ignoring to keep bot alive");
});

const token = process.env.DISCORD_BOT_TOKEN;
if (!token) {
  logger.error("DISCORD_BOT_TOKEN is not set");
  process.exit(1);
}

const clientId = process.env.DISCORD_CLIENT_ID;
if (!clientId) {
  logger.error("DISCORD_CLIENT_ID is not set");
  process.exit(1);
}

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/** Find or auto-create a lightweight user record from a Discord user ID/username */
async function findOrCreateUser(discordId: string, username: string) {
  const [existing] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.discordId, discordId))
    .limit(1);
  if (existing) return existing;

  const [created] = await db
    .insert(usersTable)
    .values({ discordId, username, avatar: null })
    .returning();
  return created;
}

/** Check if a user has an active, valid (non-expired) license for a script */
async function getActiveLicense(userId: number, scriptId: number) {
  const rows = await db
    .select()
    .from(licensesTable)
    .where(
      and(
        eq(licensesTable.scriptId, scriptId),
        eq(licensesTable.userId, userId),
        eq(licensesTable.status, "active"),
      ),
    )
    .limit(10);

  const now = new Date();
  return rows.find((l) => !l.expiresAt || l.expiresAt > now) ?? null;
}

function generateKey(): string {
  return `SCH-${randomUUID().replace(/-/g, "").toUpperCase().slice(0, 20)}`;
}

// ---------------------------------------------------------------------------
// Command definitions
// ---------------------------------------------------------------------------

const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Manage script panels")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a script panel")
        .addStringOption((opt) =>
          opt.setName("name").setDescription("Panel name").setRequired(true),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("script_id")
            .setDescription("Script ID")
            .setRequired(true),
        )
        .addStringOption((opt) =>
          opt.setName("description").setDescription("Panel description"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("send")
        .setDescription("Send a panel to a channel")
        .addIntegerOption((opt) =>
          opt.setName("panel_id").setDescription("Panel ID").setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Target channel")
            .setRequired(true),
        )
        .addRoleOption((opt) =>
          opt
            .setName("buyer_role")
            .setDescription(
              "Role to assign when user clicks Get Buyer Role (optional)",
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a panel")
        .addIntegerOption((opt) =>
          opt.setName("panel_id").setDescription("Panel ID").setRequired(true),
        ),
    ),

  new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Manage script whitelists")
    .addSubcommand((sub) =>
      sub
        .setName("send")
        .setDescription("Send a key-generation panel to a channel")
        .addIntegerOption((opt) =>
          opt
            .setName("script_id")
            .setDescription("Script ID to link this panel to")
            .setRequired(true),
        )
        .addChannelOption((opt) =>
          opt
            .setName("channel")
            .setDescription("Channel to post the panel in")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a user to the whitelist")
        .addIntegerOption((opt) =>
          opt.setName("script_id").setDescription("Script ID").setRequired(true),
        )
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Discord user to whitelist")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a user from the whitelist")
        .addIntegerOption((opt) =>
          opt.setName("script_id").setDescription("Script ID").setRequired(true),
        )
        .addUserOption((opt) =>
          opt
            .setName("user")
            .setDescription("Discord user to remove")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List whitelist users for a script")
        .addIntegerOption((opt) =>
          opt.setName("script_id").setDescription("Script ID").setRequired(true),
        ),
    ),

  new SlashCommandBuilder()
    .setName("key")
    .setDescription("Manage license keys")
    .addSubcommand((sub) =>
      sub
        .setName("generate")
        .setDescription("Generate a license key")
        .addIntegerOption((opt) =>
          opt.setName("script_id").setDescription("Script ID").setRequired(true),
        )
        .addUserOption((opt) =>
          opt.setName("user").setDescription("Assign to a Discord user"),
        )
        .addIntegerOption((opt) =>
          opt
            .setName("days")
            .setDescription("Expiry in days (0 = lifetime, default 0)"),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("revoke")
        .setDescription("Revoke a license key")
        .addStringOption((opt) =>
          opt.setName("key").setDescription("Key to revoke").setRequired(true),
        ),
    ),

  new SlashCommandBuilder()
    .setName("script")
    .setDescription("View available scripts")
    .addSubcommand((sub) =>
      sub.setName("list").setDescription("List available scripts"),
    ),

  new SlashCommandBuilder()
    .setName("server")
    .setDescription("Manage Discord server connection")
    .addSubcommand((sub) =>
      sub
        .setName("setup")
        .setDescription("Connect this Discord server to LuaBox"),
    ),

  new SlashCommandBuilder()
    .setName("linkpanel")
    .setDescription("Send a panel to a channel — pick from a list instead of typing an ID")
    .addChannelOption((opt) =>
      opt
        .setName("channel")
        .setDescription("Channel to send the panel to")
        .setRequired(true),
    )
    .addRoleOption((opt) =>
      opt
        .setName("buyer_role")
        .setDescription("Role to assign when user clicks Get Buyer Role (optional)"),
    ),
].map((cmd) => cmd.toJSON());

// ---------------------------------------------------------------------------
// Command registration
// ---------------------------------------------------------------------------

async function registerCommands(guildId?: string) {
  const rest = new REST().setToken(token!);
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId!, guildId), {
        body: commands,
      });
      logger.info({ guildId }, "Registered guild commands");
    } else {
      await rest.put(Routes.applicationCommands(clientId!), { body: commands });
      logger.info("Registered global commands");
    }
  } catch (err) {
    logger.error({ err }, "Failed to register commands");
  }
}

// ---------------------------------------------------------------------------
// Slash command handlers
// ---------------------------------------------------------------------------

async function handlePanelCreate(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString("name", true);
  const description = interaction.options.getString("description") ?? undefined;
  const scriptId = interaction.options.getInteger("script_id", true);

  const [script] = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.id, scriptId))
    .limit(1);
  if (!script) {
    await interaction.reply({
      content: `Script ID ${scriptId} not found.`,
      ephemeral: true,
    });
    return;
  }

  const [panel] = await db
    .insert(panelsTable)
    .values({
      ownerId: script.ownerId,
      scriptId,
      name,
      description: description ?? null,
      discordServerId: interaction.guildId,
      requiredRoles: [],
    })
    .returning();

  const embed = new EmbedBuilder()
    .setTitle(name)
    .setDescription(description ?? "No description provided")
    .addFields(
      { name: "Script", value: script.name },
      { name: "Panel ID", value: String(panel.id) },
    )
    .setColor(0x5865f2)
    .setTimestamp();

  await interaction.reply({
    content: `Panel **${name}** created (ID: \`${panel.id}\`). Use \`/panel send\` to post it to a channel.`,
    embeds: [embed],
    ephemeral: true,
  });
}

function buildPanelEmbed(
  panel: { name: string; description: string | null },
  script: { name: string; version: string },
) {
  return new EmbedBuilder()
    .setTitle(panel.name)
    .setDescription(panel.description ?? "No description")
    .addFields(
      { name: "Script", value: script.name, inline: true },
      { name: "Version", value: script.version, inline: true },
    )
    .setColor(0x5865f2)
    .setFooter({ text: "LuaBox • Script Management" })
    .setTimestamp();
}

function buildPanelRows(panelId: number) {
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`redeem_key:${panelId}`)
      .setLabel("Redeem Key")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🔑"),
    new ButtonBuilder()
      .setCustomId(`get_script:${panelId}`)
      .setLabel("Get Script")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📋"),
    new ButtonBuilder()
      .setCustomId(`get_role:${panelId}`)
      .setLabel("Get Role")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("👤"),
    new ButtonBuilder()
      .setCustomId(`reset_hwid:${panelId}`)
      .setLabel("Reset HWID")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⚙️"),
    new ButtonBuilder()
      .setCustomId(`stats:${panelId}`)
      .setLabel("Get Stats")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📊"),
  );
  return [row];
}

async function handlePanelSend(interaction: ChatInputCommandInteraction) {
  const panelId = interaction.options.getInteger("panel_id", true);
  const channel = interaction.options.getChannel("channel", true);
  const buyerRole = interaction.options.getRole("buyer_role");

  const [panel] = await db
    .select()
    .from(panelsTable)
    .where(eq(panelsTable.id, panelId))
    .limit(1);
  if (!panel) {
    await interaction.reply({ content: "Panel not found.", ephemeral: true });
    return;
  }

  const [script] = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.id, panel.scriptId))
    .limit(1);

  // Save buyer_role_id if provided
  if (buyerRole) {
    await db
      .update(panelsTable)
      .set({ buyerRoleId: buyerRole.id })
      .where(eq(panelsTable.id, panelId));
  }

  const embed = buildPanelEmbed(
    panel,
    script ?? { name: "Unknown", version: "?" },
  );

  const targetChannel = interaction.guild?.channels.cache.get(channel.id);
  if (targetChannel?.isTextBased()) {
    const msg = await (targetChannel as TextChannel).send({
      embeds: [embed],
      components: buildPanelRows(panelId),
    });
    await db
      .update(panelsTable)
      .set({ channelId: channel.id, messageId: msg.id })
      .where(eq(panelsTable.id, panelId));
    await interaction.reply({
      content: `Panel sent to <#${channel.id}>`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: "Cannot send to that channel.",
      ephemeral: true,
    });
  }
}

async function handlePanelDelete(interaction: ChatInputCommandInteraction) {
  const panelId = interaction.options.getInteger("panel_id", true);
  const deleted = await db
    .delete(panelsTable)
    .where(eq(panelsTable.id, panelId))
    .returning();
  if (deleted.length === 0) {
    await interaction.reply({ content: "Panel not found.", ephemeral: true });
    return;
  }
  await interaction.reply({
    content: `Panel ${panelId} deleted.`,
    ephemeral: true,
  });
}

async function handleWhitelistSend(interaction: ChatInputCommandInteraction) {
  const scriptId = interaction.options.getInteger("script_id", true);
  const channel = interaction.options.getChannel("channel", true);

  const [script] = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.id, scriptId))
    .limit(1);
  if (!script) {
    await interaction.reply({
      content: `Script ID ${scriptId} not found.`,
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`🗝️ ${script.name} — Key Management`)
    .setDescription(
      `Generate license keys for **${script.name}**.\nOnly server admins can generate keys.`,
    )
    .addFields(
      { name: "Script ID", value: String(scriptId), inline: true },
      { name: "Version", value: script.version, inline: true },
    )
    .setColor(0xfee75c)
    .setFooter({ text: "LuaBox • Script Management" })
    .setTimestamp();

  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`wl_genkey:${scriptId}`)
      .setLabel("Generate Key")
      .setStyle(ButtonStyle.Success)
      .setEmoji("🔑"),
  );

  const targetChannel = interaction.guild?.channels.cache.get(channel.id);
  if (targetChannel?.isTextBased()) {
    await (targetChannel as TextChannel).send({ embeds: [embed], components: [row] });
    await interaction.reply({
      content: `Whitelist panel for **${script.name}** sent to <#${channel.id}>`,
      ephemeral: true,
    });
  } else {
    await interaction.reply({
      content: "Cannot send to that channel.",
      ephemeral: true,
    });
  }
}

async function handleWhitelistAdd(interaction: ChatInputCommandInteraction) {
  const scriptId = interaction.options.getInteger("script_id", true);
  const user = interaction.options.getUser("user", true);

  const existing = await db
    .select()
    .from(whitelistTable)
    .where(
      and(
        eq(whitelistTable.scriptId, scriptId),
        eq(whitelistTable.discordUserId, user.id),
      ),
    )
    .limit(1);

  if (existing.length > 0) {
    await interaction.reply({
      content: `${user.username} is already whitelisted for script ${scriptId}.`,
      ephemeral: true,
    });
    return;
  }

  await db.insert(whitelistTable).values({
    scriptId,
    discordUserId: user.id,
    addedBy: interaction.user.id,
  });

  await interaction.reply({
    content: `${user.username} added to whitelist for script ${scriptId}.`,
    ephemeral: true,
  });
}

async function handleWhitelistRemove(interaction: ChatInputCommandInteraction) {
  const scriptId = interaction.options.getInteger("script_id", true);
  const user = interaction.options.getUser("user", true);

  const deleted = await db
    .delete(whitelistTable)
    .where(
      and(
        eq(whitelistTable.scriptId, scriptId),
        eq(whitelistTable.discordUserId, user.id),
      ),
    )
    .returning();

  if (deleted.length === 0) {
    await interaction.reply({
      content: `${user.username} is not whitelisted for script ${scriptId}.`,
      ephemeral: true,
    });
    return;
  }

  await interaction.reply({
    content: `${user.username} removed from whitelist for script ${scriptId}.`,
    ephemeral: true,
  });
}

async function handleWhitelistList(interaction: ChatInputCommandInteraction) {
  const scriptId = interaction.options.getInteger("script_id", true);
  const entries = await db
    .select()
    .from(whitelistTable)
    .where(eq(whitelistTable.scriptId, scriptId));

  if (entries.length === 0) {
    await interaction.reply({
      content: `No whitelist entries for script ${scriptId}.`,
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle(`Whitelist for Script ${scriptId}`)
    .setDescription(entries.map((e) => `<@${e.discordUserId}>`).join("\n"))
    .setColor(0x5865f2);

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleKeyGenerate(interaction: ChatInputCommandInteraction) {
  const scriptId = interaction.options.getInteger("script_id", true);
  const user = interaction.options.getUser("user");
  const days = interaction.options.getInteger("days") ?? 0;

  const [script] = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.id, scriptId))
    .limit(1);
  if (!script) {
    await interaction.reply({ content: "Script not found.", ephemeral: true });
    return;
  }

  let dbUserId: number | undefined;
  if (user) {
    const dbUser = await findOrCreateUser(user.id, user.username);
    dbUserId = dbUser.id;
  }

  const expiresAt =
    days > 0 ? new Date(Date.now() + days * 86_400_000) : null;

  const key = generateKey();
  const [license] = await db
    .insert(licensesTable)
    .values({
      key,
      scriptId,
      userId: dbUserId,
      status: "active",
      whitelisted: false,
      expiresAt,
    })
    .returning();

  const embed = new EmbedBuilder()
    .setTitle("🔑 License Key Generated")
    .addFields(
      { name: "Key", value: `\`${license.key}\`` },
      { name: "Script", value: script.name, inline: true },
      { name: "Status", value: "✅ Active", inline: true },
      {
        name: "Expiry",
        value:
          expiresAt
            ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`
            : "Lifetime",
        inline: true,
      },
      ...(user ? [{ name: "Assigned To", value: `<@${user.id}>`, inline: true }] : []),
    )
    .setColor(0x57f287)
    .setTimestamp();

  await interaction.reply({ embeds: [embed], ephemeral: true });
}

async function handleKeyRevoke(interaction: ChatInputCommandInteraction) {
  const keyStr = interaction.options.getString("key", true);
  const [updated] = await db
    .update(licensesTable)
    .set({ status: "revoked" })
    .where(eq(licensesTable.key, keyStr))
    .returning();

  if (!updated) {
    await interaction.reply({ content: "Key not found.", ephemeral: true });
    return;
  }

  await interaction.reply({
    content: `Key \`${keyStr}\` has been revoked.`,
    ephemeral: true,
  });
}

async function handleScriptList(interaction: ChatInputCommandInteraction) {
  const scripts = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.status, "active"));

  if (scripts.length === 0) {
    await interaction.reply({
      content: "No active scripts available.",
      ephemeral: true,
    });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Available Scripts")
    .setColor(0x5865f2)
    .addFields(
      scripts.map((s) => ({
        name: `[${s.id}] ${s.name}`,
        value: `v${s.version}${s.description ? ` — ${s.description}` : ""}`,
        inline: false,
      })),
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleLinkPanel(interaction: ChatInputCommandInteraction) {
  const channel = interaction.options.getChannel("channel", true);
  const buyerRole = interaction.options.getRole("buyer_role");

  const panels = await db.select().from(panelsTable);

  if (panels.length === 0) {
    await interaction.reply({
      content: "No panels found. Create one first via the dashboard or `/panel create`.",
      ephemeral: true,
    });
    return;
  }

  // Discord select menus max 25 options
  const options = panels.slice(0, 25).map((p) =>
    new StringSelectMenuOptionBuilder()
      .setLabel(p.name)
      .setDescription(`Panel ID: ${p.id}`)
      .setValue(`${p.id}:${channel.id}:${buyerRole?.id ?? ""}`)
  );

  const select = new StringSelectMenuBuilder()
    .setCustomId("linkpanel_select")
    .setPlaceholder("Choose a panel to send…")
    .addOptions(options);

  const row = new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(select);

  await interaction.reply({
    content: `Select a panel to post in <#${channel.id}>:`,
    components: [row],
    ephemeral: true,
  });
}

async function handleLinkPanelSelect(interaction: StringSelectMenuInteraction) {
  await interaction.deferUpdate();

  const [panelIdStr, channelId, buyerRoleId] = interaction.values[0].split(":");
  const panelId = parseInt(panelIdStr, 10);

  const [panel] = await db
    .select()
    .from(panelsTable)
    .where(eq(panelsTable.id, panelId))
    .limit(1);
  if (!panel) {
    await interaction.followUp({ content: "Panel not found.", ephemeral: true });
    return;
  }

  const [script] = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.id, panel.scriptId))
    .limit(1);

  if (buyerRoleId) {
    await db
      .update(panelsTable)
      .set({ buyerRoleId })
      .where(eq(panelsTable.id, panelId));
  }

  const embed = buildPanelEmbed(
    panel,
    script ?? { name: "Unknown", version: "?" },
  );

  const targetChannel = interaction.guild?.channels.cache.get(channelId);
  if (targetChannel?.isTextBased()) {
    const msg = await (targetChannel as TextChannel).send({
      embeds: [embed],
      components: buildPanelRows(panelId),
    });
    await db
      .update(panelsTable)
      .set({ channelId, messageId: msg.id })
      .where(eq(panelsTable.id, panelId));
    await interaction.editReply({
      content: `✅ Panel **${panel.name}** sent to <#${channelId}>`,
      components: [],
    });
  } else {
    await interaction.editReply({
      content: "Cannot send to that channel.",
      components: [],
    });
  }
}

async function handleServerSetup(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({
      content: "This command must be used in a server.",
      ephemeral: true,
    });
    return;
  }

  const guildName = interaction.guild?.name ?? "Unknown Server";

  const [existing] = await db
    .select()
    .from(serversTable)
    .where(eq(serversTable.guildId, guildId))
    .limit(1);
  if (existing) {
    await interaction.reply({
      content: `This server (${guildName}) is already connected to LuaBox.`,
      ephemeral: true,
    });
    return;
  }

  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.discordId, interaction.user.id))
    .limit(1);
  if (!user) {
    await interaction.reply({
      content:
        "You must log in to LuaBox first at your dashboard before connecting a server.",
      ephemeral: true,
    });
    return;
  }

  await db.insert(serversTable).values({
    guildId,
    ownerId: user.id,
    name: guildName,
  });

  const embed = new EmbedBuilder()
    .setTitle("Server Connected")
    .setDescription(`**${guildName}** is now connected to LuaBox.`)
    .setColor(0x57f287)
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// Button interaction handler
// ---------------------------------------------------------------------------

const NO_ACCESS_MSG =
  "❌ You do not have valid access to this Panel.\nRedeem a key first using the **🔑 Redeem Key** button.";

function parseButtonId(customId: string): { action: string; param: string } {
  if (customId.includes(":")) {
    const idx = customId.indexOf(":");
    return { action: customId.slice(0, idx), param: customId.slice(idx + 1) };
  }
  const lastIdx = customId.lastIndexOf("_");
  const param = customId.slice(lastIdx + 1);
  let action = customId.slice(0, lastIdx);
  if (action === "view_script") action = "get_script";
  if (action === "buyer_role") action = "get_role";
  return { action, param };
}

async function handleButtonInteraction(interaction: ButtonInteraction) {
  await interaction.deferReply({ ephemeral: true });

  const { action, param } = parseButtonId(interaction.customId);

  // ---- Whitelist panel: Generate Key button ----
  if (action === "wl_genkey") {
    const scriptId = parseInt(param, 10);
    if (isNaN(scriptId)) {
      await interaction.editReply({ content: "Invalid panel data." });
      return;
    }

    // Only admins/manage-guild can generate keys from the panel
    const member = interaction.member;
    const hasPermission =
      member &&
      typeof member.permissions !== "string" &&
      member.permissions.has(PermissionFlagsBits.ManageGuild);

    if (!hasPermission) {
      await interaction.editReply({
        content: "❌ Only server admins can generate keys from this panel.",
      });
      return;
    }

    const modal = new ModalBuilder()
      .setCustomId(`modal_wl_genkey:${scriptId}`)
      .setTitle("Generate License Key");

    const userInput = new TextInputBuilder()
      .setCustomId("discord_user_id")
      .setLabel("Discord User ID (leave blank = unassigned)")
      .setStyle(TextInputStyle.Short)
      .setRequired(false)
      .setPlaceholder("e.g. 123456789012345678");

    const daysInput = new TextInputBuilder()
      .setCustomId("duration_days")
      .setLabel("Duration in days (0 = lifetime)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("0")
      .setValue("0");

    modal.addComponents(
      new ActionRowBuilder<TextInputBuilder>().addComponents(userInput),
      new ActionRowBuilder<TextInputBuilder>().addComponents(daysInput),
    );

    // Modals can't be shown after deferReply, so we have to undo the defer.
    // Discord.js doesn't support this directly — we use followUp after
    // deleteing the deferred reply, but the cleanest approach is to NOT defer
    // for this button and show the modal immediately. Since we already deferred,
    // we'll send the modal via a workaround: editReply with instructions.
    // Best practice: don't defer before showing a modal. We'll handle this
    // properly in the interactionCreate wrapper by catching the modal intent
    // before deferring.
    await interaction.editReply({
      content: "Use `/key generate` to generate a key, or re-click the button.",
    });
    return;
  }

  // ---- Panel buttons ----
  const panelId = parseInt(param, 10);
  if (isNaN(panelId)) {
    await interaction.editReply({ content: "Invalid panel." });
    return;
  }

  const [panel] = await db
    .select()
    .from(panelsTable)
    .where(eq(panelsTable.id, panelId))
    .limit(1);
  if (!panel) {
    await interaction.editReply({ content: "This panel no longer exists." });
    return;
  }

  const [script] = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.id, panel.scriptId))
    .limit(1);

  // For buttons other than redeem_key, check for a valid license first
  if (action !== "redeem_key") {
    const dbUser = await db
      .select()
      .from(usersTable)
      .where(eq(usersTable.discordId, interaction.user.id))
      .limit(1)
      .then((r) => r[0] ?? null);

    const license = dbUser ? await getActiveLicense(dbUser.id, panel.scriptId) : null;

    if (!license) {
      await interaction.editReply({ content: NO_ACCESS_MSG });
      return;
    }

    // ---- Get Script ----
    if (action === "get_script") {
      const loaderUrl = script?.content?.trim();
      if (!loaderUrl) {
        await interaction.editReply({
          content:
            "❌ The script loader URL hasn't been configured yet. Contact the script owner.",
        });
        return;
      }

      const scriptLine = `loadstring(game:HttpGet("${loaderUrl}"))()`;

      const embed = new EmbedBuilder()
        .setTitle("📜 Your Script")
        .setDescription(`\`\`\`lua\nscript_key="${license.key}";\n${scriptLine}\n\`\`\``)
        .setColor(0x57f287)
        .setFooter({ text: "LuaBox • Keep this private, do not share it." })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ---- Stats ----
    if (action === "stats") {
      const now = new Date();
      const expired = license.expiresAt && license.expiresAt <= now;

      const embed = new EmbedBuilder()
        .setTitle("📊 Your Stats")
        .addFields(
          { name: "Key", value: `\`${license.key}\``, inline: false },
          {
            name: "Status",
            value: expired ? "⏰ Expired" : "✅ Active",
            inline: true,
          },
          {
            name: "Expiry",
            value: license.expiresAt
              ? `<t:${Math.floor(license.expiresAt.getTime() / 1000)}:R>`
              : "♾️ Lifetime",
            inline: true,
          },
          {
            name: "HWID",
            value: license.hwid ? `\`${license.hwid}\`` : "Not locked",
            inline: true,
          },
        )
        .setColor(expired ? 0xed4245 : 0x57f287)
        .setFooter({ text: "LuaBox • Script Management" })
        .setTimestamp();

      await interaction.editReply({ embeds: [embed] });
      return;
    }

    // ---- Get Buyer Role ----
    if (action === "get_role") {
      const roleId = panel.buyerRoleId;
      if (!roleId) {
        await interaction.editReply({
          content:
            "❌ No buyer role has been configured for this panel. Contact the server admin.",
        });
        return;
      }

      try {
        const member = await interaction.guild?.members.fetch(interaction.user.id);
        if (!member) throw new Error("Member not found");
        await member.roles.add(roleId);

        await interaction.editReply({
          content: `✅ You've been given the buyer role <@&${roleId}>!`,
        });
      } catch (err) {
        logger.error({ err }, "Failed to assign buyer role");
        await interaction.editReply({
          content:
            "❌ Failed to assign role. Make sure the bot has the **Manage Roles** permission and its role is above the buyer role.",
        });
      }
      return;
    }

    // ---- Reset HWID ----
    if (action === "reset_hwid") {
      await db
        .update(licensesTable)
        .set({ hwid: null })
        .where(eq(licensesTable.id, license.id));

      await interaction.editReply({
        content: "✅ Your HWID has been reset. You can now use your key on a new device.",
      });
      return;
    }
  }

  await interaction.editReply({ content: "Unknown action." });
}

// ---------------------------------------------------------------------------
// Modal: Redeem Key
// ---------------------------------------------------------------------------

async function handleRedeemKeyModal(
  interaction: ModalSubmitInteraction,
  panelId: number,
) {
  await interaction.deferReply({ ephemeral: true });

  const keyInput = interaction.fields.getTextInputValue("key_value").trim();

  const [panel] = await db
    .select()
    .from(panelsTable)
    .where(eq(panelsTable.id, panelId))
    .limit(1);
  if (!panel) {
    await interaction.editReply({ content: "This panel no longer exists." });
    return;
  }

  // Find the key
  const [license] = await db
    .select()
    .from(licensesTable)
    .where(eq(licensesTable.key, keyInput))
    .limit(1);

  if (!license) {
    await interaction.editReply({
      content: "❌ Key not found. Double-check it and try again.",
    });
    return;
  }

  if (license.scriptId !== panel.scriptId) {
    await interaction.editReply({
      content: "❌ This key is not valid for this panel's script.",
    });
    return;
  }

  if (license.status !== "active") {
    await interaction.editReply({
      content: `❌ This key is **${license.status}** and cannot be redeemed.`,
    });
    return;
  }

  const now = new Date();
  if (license.expiresAt && license.expiresAt <= now) {
    await interaction.editReply({ content: "❌ This key has expired." });
    return;
  }

  // Find or create user record
  const dbUser = await findOrCreateUser(
    interaction.user.id,
    interaction.user.username,
  );

  // If already assigned to a different user, deny
  if (license.userId !== null && license.userId !== dbUser.id) {
    await interaction.editReply({
      content: "❌ This key is already assigned to another user.",
    });
    return;
  }

  // Assign key to this user
  await db
    .update(licensesTable)
    .set({ userId: dbUser.id })
    .where(eq(licensesTable.id, license.id));

  const embed = new EmbedBuilder()
    .setTitle("✅ Key Redeemed!")
    .setDescription("Your key has been successfully activated. Click **Get Script** below to get your loader.")
    .addFields(
      { name: "Key", value: `\`${license.key}\``, inline: false },
      {
        name: "Expiry",
        value: license.expiresAt
          ? `<t:${Math.floor(license.expiresAt.getTime() / 1000)}:R>`
          : "♾️ Lifetime",
        inline: true,
      },
    )
    .setColor(0x57f287)
    .setFooter({ text: "LuaBox • Script Management" })
    .setTimestamp();

  const getScriptRow = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`get_script:${panelId}`)
      .setLabel("Get Script")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("📜"),
  );

  await interaction.editReply({ embeds: [embed], components: [getScriptRow] });
}

// ---------------------------------------------------------------------------
// Modal: Whitelist Generate Key
// ---------------------------------------------------------------------------

async function handleWlGenkeyModal(
  interaction: ModalSubmitInteraction,
  scriptId: number,
) {
  await interaction.deferReply({ ephemeral: true });

  const rawUserId = interaction.fields.getTextInputValue("discord_user_id").trim();
  const rawDays = interaction.fields.getTextInputValue("duration_days").trim();

  const [script] = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.id, scriptId))
    .limit(1);
  if (!script) {
    await interaction.editReply({ content: "Script not found." });
    return;
  }

  const days = parseInt(rawDays, 10);
  if (isNaN(days) || days < 0) {
    await interaction.editReply({
      content: "❌ Invalid duration. Enter a number ≥ 0 (0 = lifetime).",
    });
    return;
  }

  let dbUserId: number | undefined;
  let targetMention = "Unassigned";

  if (rawUserId) {
    // Try to fetch from Discord to get username
    let username = rawUserId;
    try {
      const discordUser = await client.users.fetch(rawUserId);
      username = discordUser.username;
    } catch {
      // Couldn't fetch — use ID as username fallback
    }
    const dbUser = await findOrCreateUser(rawUserId, username);
    dbUserId = dbUser.id;
    targetMention = `<@${rawUserId}>`;
  }

  const expiresAt = days > 0 ? new Date(Date.now() + days * 86_400_000) : null;
  const key = generateKey();

  const [license] = await db
    .insert(licensesTable)
    .values({
      key,
      scriptId,
      userId: dbUserId,
      status: "active",
      whitelisted: false,
      expiresAt,
    })
    .returning();

  const embed = new EmbedBuilder()
    .setTitle("🔑 Key Generated")
    .addFields(
      { name: "Key", value: `\`${license.key}\`` },
      { name: "Script", value: script.name, inline: true },
      { name: "Assigned To", value: targetMention, inline: true },
      {
        name: "Expiry",
        value:
          expiresAt
            ? `<t:${Math.floor(expiresAt.getTime() / 1000)}:R>`
            : "♾️ Lifetime",
        inline: true,
      },
    )
    .setColor(0x57f287)
    .setFooter({ text: "LuaBox • Script Management" })
    .setTimestamp();

  await interaction.editReply({ embeds: [embed] });
}

// ---------------------------------------------------------------------------
// Discord client
// ---------------------------------------------------------------------------

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.GuildMembers,
  ],
});

client.once("clientReady", async (c) => {
  logger.info({ tag: c.user.tag }, "Discord bot is ready");
  await registerCommands();
});

client.on("guildCreate", async (guild) => {
  logger.info({ guildId: guild.id, guildName: guild.name }, "Joined new guild");
  await registerCommands(guild.id);
});

client.on("interactionCreate", async (interaction: Interaction) => {
  // ---- String select menu ----
  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === "linkpanel_select") {
      try {
        await handleLinkPanelSelect(interaction as StringSelectMenuInteraction);
      } catch (err) {
        logger.error({ err }, "linkpanel_select error");
        const msg = "An error occurred. Please try again.";
        if (interaction.replied || interaction.deferred) {
          await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
        } else {
          await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
        }
      }
    }
    return;
  }

  // ---- Button ----
  if (interaction.isButton()) {
    const { action: btnAction, param: btnParam } = parseButtonId(interaction.customId);

    // Redeem key button: show modal BEFORE deferring (modals can't follow a defer)
    if (btnAction === "redeem_key") {
      const panelId = parseInt(parseButtonId(interaction.customId).param, 10);
      if (isNaN(panelId)) {
        await interaction.reply({ content: "Invalid panel.", ephemeral: true });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_redeem:${panelId}`)
        .setTitle("Redeem a key");

      const keyInput = new TextInputBuilder()
        .setCustomId("key_value")
        .setLabel("Enter script key below:")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("VZeGvaxErVhZfVBLUqGqYHuVxTmfOhDm");

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(keyInput),
      );

      await interaction.showModal(modal);
      return;
    }

    // Whitelist generate key button: show modal BEFORE deferring
    if (btnAction === "wl_genkey") {
      const scriptId = parseInt(btnParam, 10);
      if (isNaN(scriptId)) {
        await interaction.reply({ content: "Invalid panel data.", ephemeral: true });
        return;
      }

      const member = interaction.member;
      const hasPermission =
        member &&
        typeof member.permissions !== "string" &&
        member.permissions.has(PermissionFlagsBits.ManageGuild);

      if (!hasPermission) {
        await interaction.reply({
          content: "❌ Only server admins can generate keys from this panel.",
          ephemeral: true,
        });
        return;
      }

      const modal = new ModalBuilder()
        .setCustomId(`modal_wl_genkey:${scriptId}`)
        .setTitle("Generate License Key");

      const userInput = new TextInputBuilder()
        .setCustomId("discord_user_id")
        .setLabel("Discord User ID (blank = unassigned)")
        .setStyle(TextInputStyle.Short)
        .setRequired(false)
        .setPlaceholder("e.g. 123456789012345678");

      const daysInput = new TextInputBuilder()
        .setCustomId("duration_days")
        .setLabel("Duration in days (0 = lifetime)")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("0")
        .setValue("0");

      modal.addComponents(
        new ActionRowBuilder<TextInputBuilder>().addComponents(userInput),
        new ActionRowBuilder<TextInputBuilder>().addComponents(daysInput),
      );

      await interaction.showModal(modal);
      return;
    }

    // All other buttons go through the deferred handler
    try {
      await handleButtonInteraction(interaction);
    } catch (err) {
      logger.error({ err, customId: interaction.customId }, "Button error");
      const msg = "An error occurred. Please try again.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  // ---- Modal submit ----
  if (interaction.isModalSubmit()) {
    try {
      if (interaction.customId.startsWith("modal_redeem:")) {
        const panelId = parseInt(interaction.customId.split(":")[1], 10);
        await handleRedeemKeyModal(interaction, panelId);
      } else if (interaction.customId.startsWith("modal_wl_genkey:")) {
        const scriptId = parseInt(interaction.customId.split(":")[1], 10);
        await handleWlGenkeyModal(interaction, scriptId);
      }
    } catch (err) {
      logger.error({ err, customId: interaction.customId }, "Modal error");
      const msg = "An error occurred. Please try again.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
      } else {
        await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
      }
    }
    return;
  }

  // ---- Slash commands ----
  if (!interaction.isChatInputCommand()) return;

  const { commandName } = interaction;
  try {
    if (commandName === "panel") {
      const sub = interaction.options.getSubcommand();
      if (sub === "create") await handlePanelCreate(interaction);
      else if (sub === "send") await handlePanelSend(interaction);
      else if (sub === "delete") await handlePanelDelete(interaction);
    } else if (commandName === "whitelist") {
      const sub = interaction.options.getSubcommand();
      if (sub === "send") await handleWhitelistSend(interaction);
      else if (sub === "add") await handleWhitelistAdd(interaction);
      else if (sub === "remove") await handleWhitelistRemove(interaction);
      else if (sub === "list") await handleWhitelistList(interaction);
    } else if (commandName === "key") {
      const sub = interaction.options.getSubcommand();
      if (sub === "generate") await handleKeyGenerate(interaction);
      else if (sub === "revoke") await handleKeyRevoke(interaction);
    } else if (commandName === "script") {
      const sub = interaction.options.getSubcommand();
      if (sub === "list") await handleScriptList(interaction);
    } else if (commandName === "server") {
      const sub = interaction.options.getSubcommand();
      if (sub === "setup") await handleServerSetup(interaction);
    } else if (commandName === "linkpanel") {
      await handleLinkPanel(interaction);
    }
  } catch (err) {
    logger.error({ err, commandName }, "Command error");
    const msg = "An error occurred while running that command.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true }).catch(() => {});
    } else {
      await interaction.reply({ content: msg, ephemeral: true }).catch(() => {});
    }
  }
});

client.login(token);
