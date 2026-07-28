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
  type ChatInputCommandInteraction,
  type ButtonInteraction,
  type Interaction,
} from "discord.js";
import pino from "pino";
import { db, scriptsTable, panelsTable, licensesTable, whitelistTable, serversTable, usersTable } from "@workspace/db";
import { eq, and } from "drizzle-orm";
import { randomUUID } from "crypto";

const logger = pino({ level: "info" });

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

// --- Command definitions ---

const commands = [
  new SlashCommandBuilder()
    .setName("panel")
    .setDescription("Manage script panels")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Create a script panel")
        .addStringOption((opt) => opt.setName("name").setDescription("Panel name").setRequired(true))
        .addIntegerOption((opt) => opt.setName("script_id").setDescription("Script ID").setRequired(true))
        .addStringOption((opt) => opt.setName("description").setDescription("Panel description"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("send")
        .setDescription("Send a panel to a channel")
        .addIntegerOption((opt) => opt.setName("panel_id").setDescription("Panel ID").setRequired(true))
        .addChannelOption((opt) => opt.setName("channel").setDescription("Target channel").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Delete a panel")
        .addIntegerOption((opt) => opt.setName("panel_id").setDescription("Panel ID").setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName("whitelist")
    .setDescription("Manage script whitelists")
    .addSubcommand((sub) =>
      sub
        .setName("add")
        .setDescription("Add a user to the whitelist")
        .addIntegerOption((opt) => opt.setName("script_id").setDescription("Script ID").setRequired(true))
        .addUserOption((opt) => opt.setName("user").setDescription("Discord user to whitelist").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("remove")
        .setDescription("Remove a user from the whitelist")
        .addIntegerOption((opt) => opt.setName("script_id").setDescription("Script ID").setRequired(true))
        .addUserOption((opt) => opt.setName("user").setDescription("Discord user to remove").setRequired(true))
    )
    .addSubcommand((sub) =>
      sub
        .setName("list")
        .setDescription("List whitelist users for a script")
        .addIntegerOption((opt) => opt.setName("script_id").setDescription("Script ID").setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName("key")
    .setDescription("Manage license keys")
    .addSubcommand((sub) =>
      sub
        .setName("generate")
        .setDescription("Generate a license key")
        .addIntegerOption((opt) => opt.setName("script_id").setDescription("Script ID").setRequired(true))
        .addUserOption((opt) => opt.setName("user").setDescription("Assign to a user"))
    )
    .addSubcommand((sub) =>
      sub
        .setName("revoke")
        .setDescription("Revoke a license key")
        .addStringOption((opt) => opt.setName("key").setDescription("Key to revoke").setRequired(true))
    ),

  new SlashCommandBuilder()
    .setName("script")
    .setDescription("View available scripts")
    .addSubcommand((sub) => sub.setName("list").setDescription("List available scripts")),

  new SlashCommandBuilder()
    .setName("server")
    .setDescription("Manage Discord server connection")
    .addSubcommand((sub) => sub.setName("setup").setDescription("Connect this Discord server to LuaBox")),
].map((cmd) => cmd.toJSON());

// --- Register commands ---

async function registerCommands(guildId?: string) {
  const rest = new REST().setToken(token!);
  try {
    if (guildId) {
      await rest.put(Routes.applicationGuildCommands(clientId!, guildId), { body: commands });
      logger.info({ guildId }, "Registered guild commands");
    } else {
      await rest.put(Routes.applicationCommands(clientId!), { body: commands });
      logger.info("Registered global commands");
    }
  } catch (err) {
    logger.error({ err }, "Failed to register commands");
  }
}

// --- Command handlers ---

async function handlePanelCreate(interaction: ChatInputCommandInteraction) {
  const name = interaction.options.getString("name", true);
  const description = interaction.options.getString("description") ?? undefined;
  const scriptId = interaction.options.getInteger("script_id", true);
  const guildId = interaction.guildId;

  const [script] = await db.select().from(scriptsTable).where(eq(scriptsTable.id, scriptId)).limit(1);
  if (!script) {
    await interaction.reply({ content: `Script ID ${scriptId} not found.`, ephemeral: true });
    return;
  }

  const [panel] = await db
    .insert(panelsTable)
    .values({
      ownerId: script.ownerId,
      scriptId,
      name,
      description: description ?? null,
      discordServerId: guildId,
      requiredRoles: [],
    })
    .returning();

  const embed = new EmbedBuilder()
    .setTitle(name)
    .setDescription(description ?? "No description provided")
    .addFields({ name: "Script", value: script.name }, { name: "Panel ID", value: String(panel.id) })
    .setColor(0x5865f2)
    .setTimestamp();

  await interaction.reply({ content: `Panel **${name}** created (ID: ${panel.id})`, embeds: [embed] });
}

async function handlePanelSend(interaction: ChatInputCommandInteraction) {
  const panelId = interaction.options.getInteger("panel_id", true);
  const channel = interaction.options.getChannel("channel", true);

  const [panel] = await db.select().from(panelsTable).where(eq(panelsTable.id, panelId)).limit(1);
  if (!panel) {
    await interaction.reply({ content: "Panel not found.", ephemeral: true });
    return;
  }

  const [script] = await db.select().from(scriptsTable).where(eq(scriptsTable.id, panel.scriptId)).limit(1);

  const embed = new EmbedBuilder()
    .setTitle(panel.name)
    .setDescription(panel.description ?? "No description")
    .addFields(
      { name: "Script", value: script?.name ?? "Unknown" },
      { name: "Version", value: script?.version ?? "Unknown" },
      ...(panel.requiredRoles?.length ? [{ name: "Required Roles", value: panel.requiredRoles.join(", ") }] : [])
    )
    .setColor(0x5865f2)
    .setTimestamp();

  // Add interactive buttons to the panel
  const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`get_key:${panel.id}`)
      .setLabel("Get Key")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("🔑"),
    new ButtonBuilder()
      .setCustomId(`check_status:${panel.id}`)
      .setLabel("Check Status")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("✅")
  );

  const targetChannel = interaction.guild?.channels.cache.get(channel.id);
  if (targetChannel?.isTextBased()) {
    const msg = await (targetChannel as import("discord.js").TextChannel).send({
      embeds: [embed],
      components: [row],
    });
    await db
      .update(panelsTable)
      .set({ channelId: channel.id, messageId: msg.id })
      .where(eq(panelsTable.id, panelId));
    await interaction.reply({ content: `Panel sent to <#${channel.id}>`, ephemeral: true });
  } else {
    await interaction.reply({ content: "Cannot send to that channel.", ephemeral: true });
  }
}

async function handlePanelDelete(interaction: ChatInputCommandInteraction) {
  const panelId = interaction.options.getInteger("panel_id", true);
  const deleted = await db.delete(panelsTable).where(eq(panelsTable.id, panelId)).returning();
  if (deleted.length === 0) {
    await interaction.reply({ content: "Panel not found.", ephemeral: true });
    return;
  }
  await interaction.reply({ content: `Panel ${panelId} deleted.`, ephemeral: true });
}

async function handleWhitelistAdd(interaction: ChatInputCommandInteraction) {
  const scriptId = interaction.options.getInteger("script_id", true);
  const user = interaction.options.getUser("user", true);

  const existing = await db
    .select()
    .from(whitelistTable)
    .where(and(eq(whitelistTable.scriptId, scriptId), eq(whitelistTable.discordUserId, user.id)))
    .limit(1);

  if (existing.length > 0) {
    await interaction.reply({ content: `${user.username} is already whitelisted for script ${scriptId}.`, ephemeral: true });
    return;
  }

  await db.insert(whitelistTable).values({
    scriptId,
    discordUserId: user.id,
    addedBy: interaction.user.id,
  });

  await interaction.reply({ content: `${user.username} added to whitelist for script ${scriptId}.`, ephemeral: true });
}

async function handleWhitelistRemove(interaction: ChatInputCommandInteraction) {
  const scriptId = interaction.options.getInteger("script_id", true);
  const user = interaction.options.getUser("user", true);

  const deleted = await db
    .delete(whitelistTable)
    .where(and(eq(whitelistTable.scriptId, scriptId), eq(whitelistTable.discordUserId, user.id)))
    .returning();

  if (deleted.length === 0) {
    await interaction.reply({ content: `${user.username} is not whitelisted for script ${scriptId}.`, ephemeral: true });
    return;
  }

  await interaction.reply({ content: `${user.username} removed from whitelist for script ${scriptId}.`, ephemeral: true });
}

async function handleWhitelistList(interaction: ChatInputCommandInteraction) {
  const scriptId = interaction.options.getInteger("script_id", true);
  const entries = await db.select().from(whitelistTable).where(eq(whitelistTable.scriptId, scriptId));

  if (entries.length === 0) {
    await interaction.reply({ content: `No whitelist entries for script ${scriptId}.`, ephemeral: true });
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

  const [script] = await db.select().from(scriptsTable).where(eq(scriptsTable.id, scriptId)).limit(1);
  if (!script) {
    await interaction.reply({ content: "Script not found.", ephemeral: true });
    return;
  }

  let dbUserId: number | undefined;
  if (user) {
    const [dbUser] = await db.select().from(usersTable).where(eq(usersTable.discordId, user.id)).limit(1);
    dbUserId = dbUser?.id;
  }

  const key = `SCH-${randomUUID().replace(/-/g, "").toUpperCase().slice(0, 20)}`;
  const [license] = await db
    .insert(licensesTable)
    .values({ key, scriptId, userId: dbUserId, status: "active", whitelisted: false })
    .returning();

  const embed = new EmbedBuilder()
    .setTitle("License Key Generated")
    .addFields(
      { name: "Key", value: `\`${license.key}\`` },
      { name: "Script", value: script.name },
      { name: "Status", value: license.status },
      ...(user ? [{ name: "Assigned To", value: user.username }] : [])
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

  await interaction.reply({ content: `Key \`${keyStr}\` has been revoked.`, ephemeral: true });
}

async function handleScriptList(interaction: ChatInputCommandInteraction) {
  const scripts = await db
    .select()
    .from(scriptsTable)
    .where(eq(scriptsTable.status, "active"));

  if (scripts.length === 0) {
    await interaction.reply({ content: "No active scripts available.", ephemeral: true });
    return;
  }

  const embed = new EmbedBuilder()
    .setTitle("Available Scripts")
    .setColor(0x5865f2)
    .addFields(
      scripts.map((s) => ({
        name: s.name,
        value: `v${s.version}${s.description ? ` — ${s.description}` : ""}`,
        inline: false,
      }))
    )
    .setTimestamp();

  await interaction.reply({ embeds: [embed] });
}

async function handleServerSetup(interaction: ChatInputCommandInteraction) {
  const guildId = interaction.guildId;
  if (!guildId) {
    await interaction.reply({ content: "This command must be used in a server.", ephemeral: true });
    return;
  }

  const guildName = interaction.guild?.name ?? "Unknown Server";

  const [existing] = await db.select().from(serversTable).where(eq(serversTable.guildId, guildId)).limit(1);
  if (existing) {
    await interaction.reply({ content: `This server (${guildName}) is already connected to LuaBox.`, ephemeral: true });
    return;
  }

  // Find owner by Discord user ID
  const [user] = await db.select().from(usersTable).where(eq(usersTable.discordId, interaction.user.id)).limit(1);
  if (!user) {
    await interaction.reply({
      content: "You must log in to LuaBox first at your dashboard before connecting a server.",
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

// --- Client setup ---

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages],
});

client.once("ready", async (c) => {
  logger.info({ tag: c.user.tag }, "Discord bot is ready");
  await registerCommands();
});

client.on("guildCreate", async (guild) => {
  logger.info({ guildId: guild.id, guildName: guild.name }, "Joined new guild, registering commands");
  await registerCommands(guild.id);
});

async function handleButtonInteraction(interaction: ButtonInteraction) {
  const [action, panelIdStr] = interaction.customId.split(":");
  const panelId = parseInt(panelIdStr, 10);

  if (isNaN(panelId)) {
    await interaction.reply({ content: "Invalid panel.", ephemeral: true });
    return;
  }

  const [panel] = await db.select().from(panelsTable).where(eq(panelsTable.id, panelId)).limit(1);
  if (!panel) {
    await interaction.reply({ content: "This panel no longer exists.", ephemeral: true });
    return;
  }

  // Look up the user by their Discord ID
  const [user] = await db
    .select()
    .from(usersTable)
    .where(eq(usersTable.discordId, interaction.user.id))
    .limit(1);

  if (action === "get_key") {
    if (!user) {
      await interaction.reply({
        content: "You need to log in to the dashboard first to get a key.",
        ephemeral: true,
      });
      return;
    }

    // Find an active license for this script assigned to this user
    const [license] = await db
      .select()
      .from(licensesTable)
      .where(
        and(
          eq(licensesTable.scriptId, panel.scriptId),
          eq(licensesTable.userId, user.id),
          eq(licensesTable.status, "active")
        )
      )
      .limit(1);

    if (!license) {
      await interaction.reply({
        content: "You don't have a license key for this script. Contact the script owner.",
        ephemeral: true,
      });
      return;
    }

    const embed = new EmbedBuilder()
      .setTitle("Your License Key")
      .addFields(
        { name: "Key", value: `\`${license.key}\`` },
        { name: "Status", value: license.status },
        ...(license.expiresAt ? [{ name: "Expires", value: `<t:${Math.floor(license.expiresAt.getTime() / 1000)}:R>` }] : [])
      )
      .setColor(0x57f287)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  if (action === "check_status") {
    if (!user) {
      await interaction.reply({
        content: "You need to log in to the dashboard first to check your status.",
        ephemeral: true,
      });
      return;
    }

    // Check whitelist status
    const [whitelisted] = await db
      .select()
      .from(whitelistTable)
      .where(
        and(
          eq(whitelistTable.scriptId, panel.scriptId),
          eq(whitelistTable.discordUserId, interaction.user.id)
        )
      )
      .limit(1);

    // Check for an active license
    const [license] = await db
      .select()
      .from(licensesTable)
      .where(
        and(
          eq(licensesTable.scriptId, panel.scriptId),
          eq(licensesTable.userId, user.id),
          eq(licensesTable.status, "active")
        )
      )
      .limit(1);

    const embed = new EmbedBuilder()
      .setTitle("Your Access Status")
      .addFields(
        { name: "Whitelisted", value: whitelisted ? "✅ Yes" : "❌ No" },
        { name: "License Key", value: license ? `✅ Active (\`${license.key}\`)` : "❌ None" }
      )
      .setColor(whitelisted || license ? 0x57f287 : 0xed4245)
      .setTimestamp();

    await interaction.reply({ embeds: [embed], ephemeral: true });
    return;
  }

  await interaction.reply({ content: "Unknown action.", ephemeral: true });
}

client.on("interactionCreate", async (interaction: Interaction) => {
  // Handle button interactions
  if (interaction.isButton()) {
    try {
      await handleButtonInteraction(interaction);
    } catch (err) {
      logger.error({ err, customId: interaction.customId }, "Error handling button interaction");
      const msg = "An error occurred. Please try again.";
      if (interaction.replied || interaction.deferred) {
        await interaction.followUp({ content: msg, ephemeral: true });
      } else {
        await interaction.reply({ content: msg, ephemeral: true });
      }
    }
    return;
  }

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
      if (sub === "add") await handleWhitelistAdd(interaction);
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
    }
  } catch (err) {
    logger.error({ err, commandName }, "Error handling command");
    const msg = "An error occurred while running that command.";
    if (interaction.replied || interaction.deferred) {
      await interaction.followUp({ content: msg, ephemeral: true });
    } else {
      await interaction.reply({ content: msg, ephemeral: true });
    }
  }
});

client.login(token);
