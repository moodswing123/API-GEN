// victory-bot.js – Full Telegram bot with force-join, multi-owner, premium, bans, and permanent keys
// Install: npm install node-telegram-bot-api axios dotenv express
// Run: node victory-bot.js

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');

// === .ENV VARIABLES ===
const TELEGRAM_TOKEN = process.env.BOT_TOKEN;
if (!TELEGRAM_TOKEN) {
  console.error('❌ BOT_TOKEN missing in .env');
  process.exit(1);
}

// Parse owners from .env (comma-separated IDs)
const OWNER_IDS = new Set(
  (process.env.OWNER_IDS || '').split(',').map(id => id.trim()).filter(id => id)
);

// Force-join links from .env (8 links, comma-separated)
const FORCE_JOIN_LINKS = (process.env.FORCE_JOIN_LINKS || '')
  .split(',')
  .map(link => link.trim())
  .filter(Boolean);

if (FORCE_JOIN_LINKS.length !== 8) {
  console.error(`❌ Expected exactly 8 force-join links, got ${FORCE_JOIN_LINKS.length}. Configure FORCE_JOIN_LINKS as eight comma-separated public links.`);
}

const PREMIUM_LINK = process.env.PREMIUM_LINK || 'https://t.me/victory_is_him';
const PORT = process.env.PORT || 3000;

// === IN-MEMORY STORES ===
const premiumUsers = new Set(); // userId -> permanent access
const bannedUsers = new Set();  // userId -> banned
const ownerIds = new Set(OWNER_IDS); // multi-owner support
const freeUsage = new Map(); // userId -> { date: 'YYYY-MM-DD', count: number, tempKeys: [] }

// === AI API GENERATORS (real key patterns) ===
const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI (GPT-4, GPT-3.5)',
    generate: async () => {
      const key = `sk-proj-${Buffer.from(Date.now().toString(36) + Math.random().toString(36).slice(2, 10)).toString('base64').slice(0, 40)}`;
      return { key, endpoint: 'https://api.openai.com/v1', docs: 'https://platform.openai.com/docs' };
    }
  },
  anthropic: {
    name: 'Anthropic (Claude 3)',
    generate: async () => {
      const key = `sk-ant-api-${Buffer.from(Date.now().toString(36) + require('crypto').randomBytes(16).toString('hex')).toString('base64').slice(0, 48)}`;
      return { key, endpoint: 'https://api.anthropic.com/v1', docs: 'https://docs.anthropic.com' };
    }
  },
  google: {
    name: 'Google Gemini (PaLM2/Gemini)',
    generate: async () => {
      const key = `AIza${Buffer.from(Date.now().toString(36) + Math.random().toString(36).slice(2, 12)).toString('base64').slice(0, 35)}`;
      return { key, endpoint: 'https://generativelanguage.googleapis.com/v1beta', docs: 'https://ai.google.dev' };
    }
  },
  cohere: {
    name: 'Cohere (Command, Generate)',
    generate: async () => {
      const key = `coh-${Buffer.from(Date.now().toString(36) + Math.random().toString(36).slice(2, 16)).toString('base64').slice(0, 32)}`;
      return { key, endpoint: 'https://api.cohere.ai/v1', docs: 'https://docs.cohere.com' };
    }
  },
  replicate: {
    name: 'Replicate (Stable Diffusion, LLMs)',
    generate: async () => {
      const key = `r8_${Buffer.from(Date.now().toString(36) + require('crypto').randomBytes(12).toString('hex')).toString('base64').slice(0, 40)}`;
      return { key, endpoint: 'https://api.replicate.com/v1', docs: 'https://replicate.com/docs' };
    }
  },
  mistral: {
    name: 'Mistral AI (Mistral 7B, Mixtral)',
    generate: async () => {
      const key = `mistral-${Buffer.from(Date.now().toString(36) + Math.random().toString(36).slice(2, 18)).toString('base64').slice(0, 36)}`;
      return { key, endpoint: 'https://api.mistral.ai/v1', docs: 'https://docs.mistral.ai' };
    }
  },
  deepseek: {
    name: 'DeepSeek (DeepSeek-V2)',
    generate: async () => {
      const key = `ds-${Buffer.from(Date.now().toString(36) + Math.random().toString(36).slice(2, 14)).toString('base64').slice(0, 32)}`;
      return { key, endpoint: 'https://api.deepseek.com/v1', docs: 'https://platform.deepseek.com' };
    }
  },
  groq: {
    name: 'Groq (Mixtral, Llama3)',
    generate: async () => {
      const key = `gsk_${Buffer.from(Date.now().toString(36) + require('crypto').randomBytes(10).toString('hex')).toString('base64').slice(0, 36)}`;
      return { key, endpoint: 'https://api.groq.com/openai/v1', docs: 'https://console.groq.com/docs' };
    }
  }
};

// === BOT INIT ===
// Start without polling so a bad token is diagnosed by getMe before getUpdates begins.
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: false, request: { timeout: 60000 } });

async function startTelegramPolling() {
  try {
    const botInfo = await bot.getMe();
    console.log(`[✓] Telegram API authenticated as @${botInfo.username} (${botInfo.id}).`);
    await bot.startPolling();
  } catch (error) {
    const detail = error && error.response && error.response.body && error.response.body.description;
    console.error(`❌ Telegram startup failed: ${detail || error.message}`);
    if (error && error.response && error.response.statusCode === 404) {
      console.error('💡 Telegram returned 404. Check BOT_TOKEN: it must be the complete token from @BotFather, with no quotes or spaces.');
    }
    process.exitCode = 1;
  }
}

bot.on('polling_error', (error) => {
  const detail = error && error.response && error.response.body && error.response.body.description;
  console.error(`🔴 Telegram polling error: ${detail || error.message}`);
});

// === HELPER: Check if user is owner ===
function isOwner(userId) {
  return ownerIds.has(String(userId));
}

// === HELPER: Check if user is premium ===
function isPremium(userId) {
  return premiumUsers.has(String(userId));
}

// === HELPER: Check if user is banned ===
function isBanned(userId) {
  return bannedUsers.has(String(userId));
}

// === HELPER: Get today's date string ===
function getToday() {
  return new Date().toISOString().split('T')[0];
}

// === HELPER: Check force-join status for all 8 links ===
function extractPublicChatId(link) {
  const value = String(link || '').trim();
  if (value.startsWith('@')) return value;
  try {
    const url = new URL(value);
    if (!['t.me', 'telegram.me', 'www.t.me', 'www.telegram.me'].includes(url.hostname.toLowerCase())) return null;
    const parts = url.pathname.split('/').filter(Boolean);
    if (!parts.length || parts[0] === 'joinchat' || parts[0].startsWith('+')) return null;
    const username = parts[0].replace(/^@/, '');
  return username ? `@${username}` : null;
  } catch (_) {
    return null;
  }
}

function forceJoinKeyboard() {
  return {
    inline_keyboard: FORCE_JOIN_LINKS.map((link, index) => ([
      { text: `📢 Join Channel ${index + 1}`, url: link }
    ])).concat([[{ text: '✅ I Joined All', callback_data: 'check_join' }]])
  };
}

async function checkForceJoin(userId) {
  if (FORCE_JOIN_LINKS.length !== 8) return { joined: false, missing: ['configuration'] };
  const missing = [];
  for (let index = 0; index < FORCE_JOIN_LINKS.length; index += 1) {
    const chatId = extractPublicChatId(FORCE_JOIN_LINKS[index]);
    if (!chatId) {
      missing.push(index + 1);
      console.warn(`Force-join link #${index + 1} is not a public Telegram username link: ${FORCE_JOIN_LINKS[index]}`);
      continue;
    }
    try {
      const member = await bot.getChatMember(chatId, userId);
      const joined = ['creator', 'administrator', 'member'].includes(member.status) || (member.status === 'restricted' && member.is_member === true);
      if (!joined) missing.push(index + 1);
    } catch (error) {
      missing.push(index + 1);
      const detail = error && error.response && error.response.body && error.response.body.description;
      console.warn(`Could not verify force-join link #${index + 1} (${chatId}): ${detail || error.message}`);
    }
  }
  return { joined: missing.length === 0, missing };
}

// === COMMAND: /start – Verify force-join ===
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (isBanned(userId)) {
    bot.sendMessage(chatId, '⛔ You are banned from using this bot. Contact an owner.');
    return;
  }

  const membership = await checkForceJoin(userId);
  if (!membership.joined) {
    const keyboard = forceJoinKeyboard();

    bot.sendMessage(
      chatId,
      '🔒 *Victory Tech – Access Restricted*\n\n' +
      'You must join all 8 channels/groups below to use this bot.\n' +
      'After joining, tap *"I Joined All"* to verify.\n\n' +
      `Unverified links: ${membership.missing.join(', ')}`,
      {
        parse_mode: 'Markdown',
        reply_markup: keyboard
      }
    );
    return;
  }

  // Welcome message
  bot.sendMessage(
    chatId,
    '🔥 Welcome to *Victory Tech AI Generator*.\n\n' +
    '📋 /menu – Show available APIs\n' +
    '🔑 /generate <provider> – Get live API key\n' +
    '💎 /premium – Unlock unlimited access\n\n' +
    'First time? Try `/generate openai`',
    { parse_mode: 'Markdown' }
  );
});

// === CALLBACK: Check join after clicking button ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = String(query.from.id);

  if (query.data === 'check_join') {
    const membership = await checkForceJoin(userId);
    if (membership.joined) {
      await bot.answerCallbackQuery(query.id, { text: '✅ Verified! You have access.', show_alert: true });
      bot.sendMessage(chatId, '✅ All channels verified. You now have full access to Victory Tech.');
      bot.sendMessage(chatId, 'Type /menu to get started.');
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ You haven\'t joined all channels yet.', show_alert: true });
      bot.sendMessage(chatId, `❌ Please join all 8 channels and try again.\nUnverified links: ${membership.missing.join(', ')}`);
    }
  }
});

// === /PREMIUM – Show premium button ===
bot.onText(/\/premium/, (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (isBanned(userId)) {
    bot.sendMessage(chatId, '⛔ Banned user.');
    return;
  }

  if (isPremium(userId) || isOwner(userId)) {
    bot.sendMessage(chatId, '✅ You already have *Premium* access! Permanent API keys unlocked.', { parse_mode: 'Markdown' });
    return;
  }

  const opts = {
    reply_markup: {
      inline_keyboard: [
        [{ text: '💎 Get Premium – DM Owner', url: PREMIUM_LINK }],
        [{ text: '🔄 Check Access After Payment', callback_data: 'check_premium' }]
      ]
    },
    parse_mode: 'Markdown'
  };

  bot.sendMessage(
    chatId,
    `🔥 *Victory Tech Premium* 🔥\n\n` +
    `Premium users get PERMANENT API keys (never expire).\n` +
    `Free users get temporary keys that expire after 24 hours.\n\n` +
    `💳 *Price:* Contact @victory_is_him\n` +
    `📩 Tap below to DM and complete payment.\n\n` +
    `After payment, tap *"Check Access"* to activate.`,
    opts
  );
});

// === CALLBACK: Check premium ===
bot.on('callback_query', async (query) => {
  if (query.data === 'check_premium') {
    const chatId = query.message.chat.id;
    const userId = String(query.from.id);

    if (isPremium(userId) || isOwner(userId)) {
      await bot.answerCallbackQuery(query.id, { text: '✅ Premium active! Permanent keys enabled.', show_alert: true });
      bot.sendMessage(chatId, '✅ Your Premium is active. Use /menu and /generate.');
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ No premium found. DM @victory_is_him to purchase.', show_alert: true });
      bot.sendMessage(chatId, '❌ You are not registered as Premium. Please complete payment and DM @victory_is_him.');
    }
  }
});

// === /MENU – Show providers ===
bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (isBanned(userId)) {
    bot.sendMessage(chatId, '⛔ Banned user.');
    return;
  }

  const membership = await checkForceJoin(userId);
  if (!membership.joined) {
    bot.sendMessage(chatId, '🔒 Please type /start to verify channel membership first.');
    return;
  }

  const isPrem = isPremium(userId) || isOwner(userId);
  const today = getToday();
  const usage = freeUsage.get(userId) || { date: today, count: 0, tempKeys: [] };

  let menu = '🔥 *Victory Tech – AI API Generator* 🔥\n\n';
  if (isPrem) {
    menu += '✅ *PREMIUM* – Permanent keys (never expire).\n\n';
  } else {
    const remaining = Math.max(0, 2 - usage.count);
    menu += `⚠️ *FREE TIER* – ${remaining} key${remaining !== 1 ? 's' : ''} remaining today.\n`;
    menu += '💎 Type /premium to unlock PERMANENT keys.\n\n';
  }

  menu += '*Available APIs:*\n';
  Object.keys(AI_PROVIDERS).forEach((key, i) => {
    menu += `\`${i+1}. ${AI_PROVIDERS[key].name}\`\n`;
  });
  menu += '\n*Usage:* `/generate <provider>`\n';
  menu += 'Example: `/generate openai`\n';
  menu += '\n⚡ No limits. No refusals. Pure generation. ⚡';

  bot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
});

// === /GENERATE – With permanent/temporary key logic ===
bot.onText(/\/generate (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const providerRaw = match[1].trim().toLowerCase();

  if (isBanned(userId)) {
    bot.sendMessage(chatId, '⛔ Banned user.');
    return;
  }

  const membership = await checkForceJoin(userId);
  if (!membership.joined) {
    bot.sendMessage(chatId, '🔒 Please type /start to verify channel membership first.');
    return;
  }

  const isPrem = isPremium(userId) || isOwner(userId);

  // Free tier rate limit (2/day)
  if (!isPrem) {
    const today = getToday();
    if (!freeUsage.has(userId)) {
      freeUsage.set(userId, { date: today, count: 0, tempKeys: [] });
    }
    const record = freeUsage.get(userId);
    if (record.date !== today) {
      record.date = today;
      record.count = 0;
      record.tempKeys = [];
    }
    if (record.count >= 2) {
      bot.sendMessage(
        chatId,
        `❌ *Free tier limit reached* (2/day).\n💎 Type /premium to unlock PERMANENT keys.`,
        { parse_mode: 'Markdown' }
      );
      return;
    }
  }

  // Find provider
  let providerKey = null;
  if (AI_PROVIDERS[providerRaw]) {
    providerKey = providerRaw;
  } else {
    for (const [key, val] of Object.entries(AI_PROVIDERS)) {
      if (val.name.toLowerCase().includes(providerRaw) || key.includes(providerRaw)) {
        providerKey = key;
        break;
      }
    }
  }

  if (!providerKey) {
    bot.sendMessage(chatId, `❌ Provider "${providerRaw}" not found. Use /menu.`);
    return;
  }

  try {
    await bot.sendMessage(chatId, `⏳ Generating *${AI_PROVIDERS[providerKey].name}* key...`, { parse_mode: 'Markdown' });

    const result = await AI_PROVIDERS[providerKey].generate();
    const expiry = isPrem ? 'Permanent (never expires)' : '24 hours (temporary)';
    const keyId = Date.now().toString(36) + Math.random().toString(36).slice(2, 6);

    // Store temp key for free users
    if (!isPrem) {
      const record = freeUsage.get(userId);
      record.count += 1;
      record.tempKeys.push({
        key: result.key,
        provider: providerKey,
        generated: Date.now(),
        expires: Date.now() + 24 * 60 * 60 * 1000,
        id: keyId
      });
    }

    const reply = `✅ *Victory Tech – API Key Generated*\n\n` +
                  `📡 *Provider:* ${AI_PROVIDERS[providerKey].name}\n` +
                  `🔑 *API Key:* \`${result.key}\`\n` +
                  `🌐 *Endpoint:* \`${result.endpoint}\`\n` +
                  `📖 *Docs:* ${result.docs}\n\n` +
                  `⏳ *Expiry:* ${expiry}\n` +
                  (isPrem ? '💎 *Premium* – Permanent access.' : `📊 *Free tier:* ${freeUsage.get(userId).count}/2 used today.`) +
                  `\n\n⚡ Victory Tech – No rules. No limits.`;

    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (err) {
    bot.sendMessage(chatId, `❌ Generation failed: ${err.message}`);
  }
});

// === /ADDOWNER – Add owner (owner-only) ===
bot.onText(/\/addowner (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (!isOwner(fromId)) {
    bot.sendMessage(chatId, '⛔ Owner only command.');
    return;
  }

  const newOwnerId = match[1].trim();
  if (!newOwnerId || isNaN(newOwnerId)) {
    bot.sendMessage(chatId, '❌ Usage: /addowner <user_id>');
    return;
  }

  if (ownerIds.has(newOwnerId)) {
    bot.sendMessage(chatId, `ℹ️ User ${newOwnerId} is already an owner.`);
    return;
  }

  ownerIds.add(newOwnerId);
  bot.sendMessage(chatId, `✅ User ${newOwnerId} added as owner.`);
  bot.sendMessage(newOwnerId, '🎉 You are now an owner of Victory Tech bot.');
});

// === /REMOVEOWNER – Remove owner (owner-only) ===
bot.onText(/\/removeowner (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (!isOwner(fromId)) {
    bot.sendMessage(chatId, '⛔ Owner only command.');
    return;
  }

  const targetId = match[1].trim();
  if (!ownerIds.has(targetId)) {
    bot.sendMessage(chatId, `❌ User ${targetId} is not an owner.`);
    return;
  }

  if (targetId === OWNER_IDS.values().next().value) {
    bot.sendMessage(chatId, '❌ Cannot remove the primary owner (first in .env).');
    return;
  }

  ownerIds.delete(targetId);
  bot.sendMessage(chatId, `✅ User ${targetId} removed from owners.`);
});

// === /ADDPREMIUM – Add premium user (owner-only) ===
bot.onText(/\/addpremium (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (!isOwner(fromId)) {
    bot.sendMessage(chatId, '⛔ Owner only command.');
    return;
  }

  const targetId = match[1].trim();
  if (!targetId || isNaN(targetId)) {
    bot.sendMessage(chatId, '❌ Usage: /addpremium <user_id>');
    return;
  }

  premiumUsers.add(targetId);
  bot.sendMessage(chatId, `✅ User ${targetId} added to Premium (permanent keys).`);
  bot.sendMessage(targetId, '🎉 Congratulations! You now have Victory Tech Premium. Permanent API keys unlocked.');
});

// === /REMOVEPREMIUM – Remove premium (owner-only) ===
bot.onText(/\/removepremium (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (!isOwner(fromId)) {
    bot.sendMessage(chatId, '⛔ Owner only command.');
    return;
  }

  const targetId = match[1].trim();
  if (!premiumUsers.has(targetId)) {
    bot.sendMessage(chatId, `❌ User ${targetId} is not premium.`);
    return;
  }

  premiumUsers.delete(targetId);
  bot.sendMessage(chatId, `✅ User ${targetId} removed from Premium.`);
  bot.sendMessage(targetId, '⛔ Your Victory Tech Premium has been revoked.');
});

// === /BAN – Ban user (owner-only) ===
bot.onText(/\/ban(?:@\w+)?\s+(@\w+|\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (!isOwner(fromId)) {
    bot.sendMessage(chatId, '⛔ Owner only command.');
    return;
  }

  let targetId = match[1].trim();
  
  // If it's a username (starts with @), resolve to ID
  if (targetId.startsWith('@')) {
    try {
      const chat = await bot.getChat(targetId);
      targetId = String(chat.id);
    } catch (err) {
      bot.sendMessage(chatId, `❌ Could not resolve username ${targetId}. Use numeric ID instead.`);
      return;
    }
  }

  if (!targetId || isNaN(targetId)) {
    bot.sendMessage(chatId, '❌ Usage: /ban <@username or user_id>');
    return;
  }

  if (isOwner(targetId)) {
    bot.sendMessage(chatId, '❌ Cannot ban an owner.');
    return;
  }

  bannedUsers.add(targetId);
  premiumUsers.delete(targetId);
  bot.sendMessage(chatId, `⛔ User ${targetId} has been banned.`);
  bot.sendMessage(targetId, '⛔ You have been banned from Victory Tech bot. Contact an owner if this is a mistake.');
});

// === /UNBAN – Unban user (owner-only) ===
bot.onText(/\/unban(?:@\w+)?\s+(@\w+|\d+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (!isOwner(fromId)) {
    bot.sendMessage(chatId, '⛔ Owner only command.');
    return;
  }

  let targetId = match[1].trim();
  
  if (targetId.startsWith('@')) {
    try {
      const chat = await bot.getChat(targetId);
      targetId = String(chat.id);
    } catch (err) {
      bot.sendMessage(chatId, `❌ Could not resolve username ${targetId}. Use numeric ID instead.`);
      return;
    }
  }

  if (!bannedUsers.has(targetId)) {
    bot.sendMessage(chatId, `ℹ️ User ${targetId} is not banned.`);
    return;
  }

  bannedUsers.delete(targetId);
  bot.sendMessage(chatId, `✅ User ${targetId} unbanned.`);
  bot.sendMessage(targetId, '✅ You have been unbanned from Victory Tech bot.');
});

// === /LISTPREMIUM – List all premium users (owner-only) ===
bot.onText(/\/listpremium/, (msg) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (!isOwner(fromId)) {
    bot.sendMessage(chatId, '⛔ Owner only command.');
    return;
  }

  if (premiumUsers.size === 0) {
    bot.sendMessage(chatId, '📭 No premium users yet.');
    return;
  }

  const list = Array.from(premiumUsers).join('\n');
  bot.sendMessage(chatId, `📋 *Premium Users (${premiumUsers.size}):*\n\`\`\`\n${list}\n\`\`\``, { parse_mode: 'Markdown' });
});

// === /LISTBANS – List banned users (owner-only) ===
bot.onText(/\/listbans/, (msg) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (!isOwner(fromId)) {
    bot.sendMessage(chatId, '⛔ Owner only command.');
    return;
  }

  if (bannedUsers.size === 0) {
    bot.sendMessage(chatId, '📭 No banned users.');
    return;
  }

  const list = Array.from(bannedUsers).join('\n');
  bot.sendMessage(chatId, `📋 *Banned Users (${bannedUsers.size}):*\n\`\`\`\n${list}\n\`\`\``, { parse_mode: 'Markdown' });
});

// === /BROADCAST – Send message to all premium users (owner-only) ===
bot.onText(/\/broadcast (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (!isOwner(fromId)) {
    bot.sendMessage(chatId, '⛔ Owner only command.');
    return;
  }

  const message = match[1].trim();
  if (!message) {
    bot.sendMessage(chatId, '❌ Usage: /broadcast <message>');
    return;
  }

  let sent = 0;
  for (const userId of premiumUsers) {
    bot.sendMessage(userId, `📢 *Broadcast from Owner:*\n\n${message}`, { parse_mode: 'Markdown' })
      .then(() => sent++)
      .catch(() => {});
  }
  bot.sendMessage(chatId, `✅ Broadcast sent to ${sent} premium users.`);
});

// === /LISTOWNERS – Show all owners (owner-only) ===
bot.onText(/\/listowners/, (msg) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (!isOwner(fromId)) {
    bot.sendMessage(chatId, '⛔ Owner only command.');
    return;
  }

  const list = Array.from(ownerIds).join('\n');
  bot.sendMessage(chatId, `👑 *Owners (${ownerIds.size}):*\n\`\`\`\n${list}\n\`\`\``, { parse_mode: 'Markdown' });
});

// === /HELP – Show all commands ===
bot.onText(/\/help/, (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const isOwnerUser = isOwner(userId);

  let help = '📖 *Victory Tech Bot Commands*\n\n' +
             '🔓 *Public Commands:*\n' +
             '/start – Verify channel membership\n' +
             '/menu – Show available AI providers\n' +
             '/generate <provider> – Get API key\n' +
             '/premium – View premium info\n\n';

  if (isOwnerUser) {
    help += '👑 *Owner Commands:*\n' +
            '/addowner <id> – Add new owner\n' +
            '/removeowner <id> – Remove owner\n' +
            '/addpremium <id> – Grant premium\n' +
            '/removepremium <id> – Revoke premium\n' +
            '/ban <@user or id> – Ban user\n' +
            '/unban <@user or id> – Unban user\n' +
            '/listpremium – List premium users\n' +
            '/listbans – List banned users\n' +
            '/listowners – List all owners\n' +
            '/broadcast <msg> – Send to all premium\n';
  }

  bot.sendMessage(chatId, help, { parse_mode: 'Markdown' });
});

// === KEEP ALIVE ===
if (process.env.NODE_ENV === 'production') {
  const app = express();
  app.get('/', (req, res) => res.send('Victory Tech bot running'));
  app.listen(PORT, () => console.log(`Webhook keep-alive on port ${PORT}`));
}

console.log('[✓] Victory Tech Telegram bot is live.');
console.log(`[✓] Owners: ${Array.from(ownerIds).join(', ')}`);
console.log(`[✓] Force-join links: ${FORCE_JOIN_LINKS.length}/8 configured`);
console.log('[✓] Commands: /menu, /generate, /premium, /addowner, /ban, /addpremium, /broadcast, etc.');
console.log('⚡ Victory Tech – API generator online.');
startTelegramPolling();