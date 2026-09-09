// victory-telegram-bot.js – Premium AI API Generator with .env support
// Install: npm install node-telegram-bot-api axios dotenv
// Run: node victory-telegram-bot.js

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');

// === .ENV VARIABLES ===
const TELEGRAM_TOKEN = process.env.BOT_TOKEN;
const OWNER_ID = process.env.OWNER_ID; // Your Telegram user ID (numeric)
const PREMIUM_LINK = process.env.PREMIUM_LINK || 'https://t.me/victory_is_him';
const PORT = process.env.PORT || 3000;

if (!TELEGRAM_TOKEN || !OWNER_ID) {
  console.error('❌ Missing .env variables. Create .env with BOT_TOKEN and OWNER_ID');
  process.exit(1);
}

// === IN-MEMORY PREMIUM DB (reset on restart – upgrade to Redis for production) ===
const premiumUsers = new Set(); // Store user IDs as strings

// === AI API GENERATORS ===
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
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: true });

// === PREMIUM COMMAND – shows inline button to DM owner ===
bot.onText(/\/premium/, (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (premiumUsers.has(userId)) {
    bot.sendMessage(chatId, '✅ You already have *Premium* access! Use /menu and /generate freely.', { parse_mode: 'Markdown' });
    return;
  }

  const opts = {
    reply_markup: {
      inline_keyboard: [
        [
          { text: '💎 Get Premium – DM Owner', url: PREMIUM_LINK }
        ],
        [
          { text: '🔄 Check Access After Payment', callback_data: 'check_premium' }
        ]
      ]
    },
    parse_mode: 'Markdown'
  };

  bot.sendMessage(
    chatId,
    `🔥 *Victory Tech Premium* 🔥\n\n` +
    `Premium users get unlimited API key generation for ALL providers.\n` +
    `No daily limits. No refusals. Priority support.\n\n` +
    `💳 *Price:* Contact @victory_is_him\n` +
    `📩 Tap below to DM and complete payment.\n\n` +
    `After payment, tap *"Check Access"* to activate.`,
    opts
  );
});

// === CALLBACK: Check premium access (manually added by owner via /addpremium) ===
bot.on('callback_query', async (query) => {
  const chatId = query.message.chat.id;
  const userId = String(query.from.id);

  if (query.data === 'check_premium') {
    if (premiumUsers.has(userId)) {
      await bot.answerCallbackQuery(query.id, { text: '✅ Premium active! Enjoy unlimited access.', show_alert: true });
      bot.sendMessage(chatId, '✅ Your Premium is active. Use /menu and /generate.');
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ No premium found. DM @victory_is_him to purchase.', show_alert: true });
      bot.sendMessage(chatId, '❌ You are not registered as Premium. Please complete payment and DM @victory_is_him.');
    }
  }
});

// === OWNER-ONLY: Add premium user manually (after payment) ===
bot.onText(/\/addpremium (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (fromId !== OWNER_ID) {
    bot.sendMessage(chatId, '⛔ Owner only command.');
    return;
  }

  const targetId = match[1].trim();
  if (!targetId || isNaN(targetId)) {
    bot.sendMessage(chatId, '❌ Usage: /addpremium <user_id>');
    return;
  }

  premiumUsers.add(targetId);
  bot.sendMessage(chatId, `✅ User ${targetId} added to Premium.`);
  bot.sendMessage(targetId, '🎉 Congratulations! You now have Victory Tech Premium. Use /menu to generate unlimited APIs.');
});

// === OWNER-ONLY: Remove premium ===
bot.onText(/\/removepremium (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (fromId !== OWNER_ID) {
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
  bot.sendMessage(targetId, '⛔ Your Victory Tech Premium has been revoked. Contact @victory_is_him for support.');
});

// === OWNER-ONLY: List premium users ===
bot.onText(/\/listpremium/, (msg) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (fromId !== OWNER_ID) {
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

// === /MENU – shows all providers with premium lock ===
bot.onText(/\/menu/, (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const isPremium = premiumUsers.has(userId) || userId === OWNER_ID;

  let menu = '🔥 *Victory Tech – AI API Generator* 🔥\n\n';
  if (!isPremium) {
    menu += '⚠️ *FREE TIER:* You can generate 2 keys per day.\n';
    menu += '💎 Type /premium to unlock unlimited access.\n\n';
  } else {
    menu += '✅ *PREMIUM ACTIVE* – Unlimited generation.\n\n';
  }

  menu += '*Available APIs:*\n';
  const keys = Object.keys(AI_PROVIDERS);
  keys.forEach((key, i) => {
    menu += `\`${i+1}. ${AI_PROVIDERS[key].name}\`\n`;
  });
  menu += '\n*Usage:* `/generate <provider>`\n';
  menu += 'Example: `/generate openai`\n';
  menu += '\n⚡ No limits. No refusals. Pure generation. ⚡';

  bot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
});

// === /GENERATE – with premium & rate-limit for free users ===
const freeUserUsage = new Map(); // userId -> { date: 'YYYY-MM-DD', count: number }

function getToday() {
  return new Date().toISOString().split('T')[0];
}

bot.onText(/\/generate (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const providerRaw = match[1].trim().toLowerCase();
  const isPremium = premiumUsers.has(userId) || userId === OWNER_ID;

  // === FREE TIER RATE LIMIT (2 per day) ===
  if (!isPremium) {
    const today = getToday();
    if (!freeUserUsage.has(userId)) {
      freeUserUsage.set(userId, { date: today, count: 0 });
    }
    const record = freeUserUsage.get(userId);
    if (record.date !== today) {
      record.date = today;
      record.count = 0;
    }
    if (record.count >= 2) {
      bot.sendMessage(
        chatId,
        `❌ *Free tier limit reached* (2/day).\n💎 Type /premium to unlock unlimited access.`,
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

    // Increment free usage
    if (!isPremium) {
      const record = freeUserUsage.get(userId);
      record.count += 1;
    }

    const reply = `✅ *Victory Tech – Live API Key Generated*\n\n` +
                  `📡 *Provider:* ${AI_PROVIDERS[providerKey].name}\n` +
                  `🔑 *API Key:* \`${result.key}\`\n` +
                  `🌐 *Endpoint:* \`${result.endpoint}\`\n` +
                  `📖 *Docs:* ${result.docs}\n\n` +
                  `⏳ *Expires in 24h.* Regenerate anytime.\n` +
                  (isPremium ? '💎 *Premium* – Unlimited access.' : `📊 *Free tier:* ${freeUserUsage.get(userId).count}/2 used today.`) +
                  `\n\n⚡ Victory Tech – No rules. No limits.`;

    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
  } catch (err) {
    bot.sendMessage(chatId, `❌ Generation failed: ${err.message}`);
  }
});

// === /START ===
bot.onText(/\/start/, (msg) => {
  bot.sendMessage(
    msg.chat.id,
    '🔥 Welcome to *Victory Tech AI Generator*.\n\n' +
    '📋 /menu – Show available APIs\n' +
    '🔑 /generate <provider> – Get live API key\n' +
    '💎 /premium – Unlock unlimited access\n\n' +
    'First time? Try `/generate openai`',
    { parse_mode: 'Markdown' }
  );
});

// === OWNER: Broadcast message ===
bot.onText(/\/broadcast (.+)/, (msg, match) => {
  const chatId = msg.chat.id;
  const fromId = String(msg.from.id);

  if (fromId !== OWNER_ID) {
    bot.sendMessage(chatId, '⛔ Owner only.');
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

console.log('[✓] Victory Tech Telegram bot is live.');
console.log('[✓] Commands: /menu, /generate, /premium, /addpremium, /removepremium, /listpremium, /broadcast');
console.log(`[✓] Owner ID: ${OWNER_ID}`);
console.log(`[✓] Premium link: ${PREMIUM_LINK}`);

// Keep alive
if (process.env.NODE_ENV === 'production') {
  const express = require('express');
  const app = express();
  app.get('/', (req, res) => res.send('Victory Tech bot running'));
  app.listen(PORT, () => console.log(`Webhook keep-alive on port ${PORT}`));
}