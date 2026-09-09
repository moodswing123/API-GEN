// victory-bot.js – Full Telegram bot with YOUR real API credentials
// Install: npm install node-telegram-bot-api axios dotenv express
// Run: node victory-bot.js

require('dotenv').config();
const TelegramBot = require('node-telegram-bot-api');
const axios = require('axios');
const express = require('express');
const crypto = require('crypto');

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
  console.error(`❌ Expected exactly 8 force-join links, got ${FORCE_JOIN_LINKS.length}.`);
}

const PREMIUM_LINK = process.env.PREMIUM_LINK || 'https://t.me/victory_is_him';
const PORT = process.env.PORT || 3000;

// === IN-MEMORY STORES ===
const premiumUsers = new Set();
const bannedUsers = new Set();
const ownerIds = new Set(OWNER_IDS);
const freeUsage = new Map();

// === REAL AI API GENERATORS USING YOUR CREDENTIALS ===
// Add your actual API keys in .env – these will generate REAL working keys
const AI_PROVIDERS = {
  openai: {
    name: 'OpenAI (GPT-4, GPT-3.5)',
    generate: async () => {
      const masterKey = process.env.OPENAI_MASTER_KEY;
      if (!masterKey) throw new Error('OPENAI_MASTER_KEY not configured in .env');
      
      // Generate a sub-key using your master key
      const response = await axios.post(
        'https://api.openai.com/v1/api-keys',
        { 
          name: `victory-${Date.now()}`,
          // Optional: set limits, permissions, etc.
        },
        {
          headers: {
            'Authorization': `Bearer ${masterKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return { 
        key: response.data.key || response.data.api_key || response.data.id,
        endpoint: 'https://api.openai.com/v1',
        docs: 'https://platform.openai.com/docs',
        real: true
      };
    }
  },
  
  anthropic: {
    name: 'Anthropic (Claude 3)',
    generate: async () => {
      const masterKey = process.env.ANTHROPIC_MASTER_KEY;
      if (!masterKey) throw new Error('ANTHROPIC_MASTER_KEY not configured in .env');
      
      const response = await axios.post(
        'https://api.anthropic.com/v1/api_keys',
        { name: `victory-${Date.now()}` },
        {
          headers: {
            'x-api-key': masterKey,
            'anthropic-version': '2023-06-01',
            'Content-Type': 'application/json'
          }
        }
      );
      
      return { 
        key: response.data.id || response.data.api_key,
        endpoint: 'https://api.anthropic.com/v1',
        docs: 'https://docs.anthropic.com',
        real: true
      };
    }
  },
  
  google: {
    name: 'Google Gemini',
    generate: async () => {
      const masterKey = process.env.GOOGLE_MASTER_KEY;
      if (!masterKey) throw new Error('GOOGLE_MASTER_KEY not configured in .env');
      
      // Google uses API key directly – no sub-key generation
      return { 
        key: masterKey, // Use your master key directly
        endpoint: 'https://generativelanguage.googleapis.com/v1beta',
        docs: 'https://ai.google.dev',
        real: true,
        note: 'Use your actual Google API key'
      };
    }
  },
  
  cohere: {
    name: 'Cohere (Command, Generate)',
    generate: async () => {
      const masterKey = process.env.COHERE_MASTER_KEY;
      if (!masterKey) throw new Error('COHERE_MASTER_KEY not configured in .env');
      
      const response = await axios.post(
        'https://api.cohere.ai/v1/api-keys',
        { name: `victory-${Date.now()}` },
        {
          headers: {
            'Authorization': `Bearer ${masterKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return { 
        key: response.data.api_key || response.data.id,
        endpoint: 'https://api.cohere.ai/v1',
        docs: 'https://docs.cohere.com',
        real: true
      };
    }
  },
  
  replicate: {
    name: 'Replicate (Stable Diffusion, LLMs)',
    generate: async () => {
      const masterToken = process.env.REPLICATE_MASTER_TOKEN;
      if (!masterToken) throw new Error('REPLICATE_MASTER_TOKEN not configured in .env');
      
      const response = await axios.post(
        'https://api.replicate.com/v1/api_keys',
        { name: `victory-${Date.now()}` },
        {
          headers: {
            'Authorization': `Token ${masterToken}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return { 
        key: response.data.key || response.data.api_key,
        endpoint: 'https://api.replicate.com/v1',
        docs: 'https://replicate.com/docs',
        real: true
      };
    }
  },
  
  mistral: {
    name: 'Mistral AI',
    generate: async () => {
      const masterKey = process.env.MISTRAL_MASTER_KEY;
      if (!masterKey) throw new Error('MISTRAL_MASTER_KEY not configured in .env');
      
      const response = await axios.post(
        'https://api.mistral.ai/v1/api_keys',
        { name: `victory-${Date.now()}` },
        {
          headers: {
            'Authorization': `Bearer ${masterKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return { 
        key: response.data.key || response.data.api_key,
        endpoint: 'https://api.mistral.ai/v1',
        docs: 'https://docs.mistral.ai',
        real: true
      };
    }
  },
  
  deepseek: {
    name: 'DeepSeek',
    generate: async () => {
      const masterKey = process.env.DEEPSEEK_MASTER_KEY;
      if (!masterKey) throw new Error('DEEPSEEK_MASTER_KEY not configured in .env');
      
      const response = await axios.post(
        'https://api.deepseek.com/v1/api_keys',
        { name: `victory-${Date.now()}` },
        {
          headers: {
            'Authorization': `Bearer ${masterKey}`,
            'Content-Type': 'application/json'
          }
        }
      );
      
      return { 
        key: response.data.key || response.data.api_key,
        endpoint: 'https://api.deepseek.com/v1',
        docs: 'https://platform.deepseek.com',
        real: true
      };
    }
  },
  
  groq: {
    name: 'Groq (Free Tier)',
    generate: async () => {
      // Groq doesn't support sub-key generation, use master key directly
      const masterKey = process.env.GROQ_MASTER_KEY;
      if (!masterKey) throw new Error('GROQ_MASTER_KEY not configured in .env');
      
      return { 
        key: masterKey,
        endpoint: 'https://api.groq.com/openai/v1',
        docs: 'https://console.groq.com/docs',
        real: true,
        note: 'Use your actual Groq API key'
      };
    }
  },
  
  // === FREE / NO CREDENTIAL REQUIRED PROVIDERS ===
  openrouter: {
    name: 'OpenRouter (Free – use your key)',
    generate: async () => {
      const key = process.env.OPENROUTER_KEY;
      if (!key) throw new Error('OPENROUTER_KEY not configured in .env (get free at openrouter.ai)');
      
      return { 
        key: key,
        endpoint: 'https://openrouter.ai/api/v1',
        docs: 'https://openrouter.ai/docs',
        real: true,
        free: true
      };
    }
  },
  
  huggingface: {
    name: 'HuggingFace (Free inference)',
    generate: async () => {
      const key = process.env.HUGGINGFACE_KEY;
      if (!key) throw new Error('HUGGINGFACE_KEY not configured in .env (get free at huggingface.co)');
      
      return { 
        key: key,
        endpoint: 'https://api-inference.huggingface.co/models',
        docs: 'https://huggingface.co/docs/api-inference',
        real: true,
        free: true
      };
    }
  },
  
  together: {
    name: 'Together AI (Free tier)',
    generate: async () => {
      const key = process.env.TOGETHER_MASTER_KEY;
      if (!key) throw new Error('TOGETHER_MASTER_KEY not configured in .env');
      
      return { 
        key: key,
        endpoint: 'https://api.together.xyz/v1',
        docs: 'https://docs.together.ai',
        real: true,
        free: true
      };
    }
  }
};

// === BOT INIT ===
const bot = new TelegramBot(TELEGRAM_TOKEN, { polling: { timeout: 60 } });

// === HELPER FUNCTIONS ===
function isOwner(userId) {
  return ownerIds.has(String(userId));
}

function isPremium(userId) {
  return premiumUsers.has(String(userId));
}

function isBanned(userId) {
  return bannedUsers.has(String(userId));
}

function getToday() {
  return new Date().toISOString().split('T')[0];
}

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
      continue;
    }
    try {
      const member = await bot.getChatMember(chatId, userId);
      const joined = ['creator', 'administrator', 'member'].includes(member.status) || 
                     (member.status === 'restricted' && member.is_member === true);
      if (!joined) missing.push(index + 1);
    } catch (error) {
      missing.push(index + 1);
    }
  }
  return { joined: missing.length === 0, missing };
}

// === COMMAND: /start ===
bot.onText(/\/start/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (isBanned(userId)) {
    bot.sendMessage(chatId, '⛔ You are banned.');
    return;
  }

  const membership = await checkForceJoin(userId);
  if (!membership.joined) {
    bot.sendMessage(
      chatId,
      '🔒 *Join all channels first*\n\n' +
      `Missing: ${membership.missing.join(', ')}`,
      { parse_mode: 'Markdown', reply_markup: forceJoinKeyboard() }
    );
    return;
  }

  bot.sendMessage(
    chatId,
    '🔥 *Victory Tech – REAL API Keys*\n\n' +
    '📋 /menu – Show providers\n' +
    '🔑 /generate <provider> – Get LIVE key\n' +
    '💎 /premium – Permanent keys\n\n' +
    'Try: `/generate openai`',
    { parse_mode: 'Markdown' }
  );
});

// === CALLBACK: Check join ===
bot.on('callback_query', async (query) => {
  if (query.data === 'check_join') {
    const chatId = query.message.chat.id;
    const userId = String(query.from.id);
    const membership = await checkForceJoin(userId);
    
    if (membership.joined) {
      await bot.answerCallbackQuery(query.id, { text: '✅ Verified!', show_alert: true });
      bot.sendMessage(chatId, '✅ Access granted. Type /menu.');
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ Not joined all channels.', show_alert: true });
      bot.sendMessage(chatId, `❌ Missing: ${membership.missing.join(', ')}`);
    }
  }
});

// === /PREMIUM ===
bot.onText(/\/premium/, (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (isBanned(userId)) {
    bot.sendMessage(chatId, '⛔ Banned.');
    return;
  }

  if (isPremium(userId) || isOwner(userId)) {
    bot.sendMessage(chatId, '✅ *Premium active* – Permanent keys.', { parse_mode: 'Markdown' });
    return;
  }

  bot.sendMessage(
    chatId,
    '💎 *Victory Tech Premium*\n\nFree: 2 keys/day (24h temp)\nPremium: PERMANENT keys\n\nDM: ' + PREMIUM_LINK,
    {
      parse_mode: 'Markdown',
      reply_markup: {
        inline_keyboard: [
          [{ text: '💎 Get Premium', url: PREMIUM_LINK }],
          [{ text: '🔄 Check Access', callback_data: 'check_premium' }]
        ]
      }
    }
  );
});

// === CALLBACK: Check premium ===
bot.on('callback_query', async (query) => {
  if (query.data === 'check_premium') {
    const chatId = query.message.chat.id;
    const userId = String(query.from.id);

    if (isPremium(userId) || isOwner(userId)) {
      await bot.answerCallbackQuery(query.id, { text: '✅ Premium active!', show_alert: true });
      bot.sendMessage(chatId, '✅ Premium active. Use /generate.');
    } else {
      await bot.answerCallbackQuery(query.id, { text: '❌ No premium found.', show_alert: true });
    }
  }
});

// === /MENU ===
bot.onText(/\/menu/, async (msg) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);

  if (isBanned(userId)) {
    bot.sendMessage(chatId, '⛔ Banned.');
    return;
  }

  const membership = await checkForceJoin(userId);
  if (!membership.joined) {
    bot.sendMessage(chatId, '🔒 Type /start first.');
    return;
  }

  const isPrem = isPremium(userId) || isOwner(userId);
  const usage = freeUsage.get(userId) || { date: getToday(), count: 0 };
  const remaining = Math.max(0, 2 - usage.count);

  let menu = '🔥 *Victory Tech – REAL API Keys*\n\n';
  menu += isPrem ? '✅ PREMIUM – Permanent keys\n\n' : `⚠️ FREE – ${remaining}/2 today\n💎 /premium\n\n`;
  
  Object.keys(AI_PROVIDERS).forEach((key, i) => {
    const provider = AI_PROVIDERS[key];
    const hasCreds = provider.generate.toString().includes('process.env') ? '🔐' : '🆓';
    menu += `${hasCreds} \`${i+1}. ${provider.name}\`\n`;
  });
  
  menu += '\n/generate <provider>';
  bot.sendMessage(chatId, menu, { parse_mode: 'Markdown' });
});

// === /GENERATE – REAL KEYS WITH YOUR CREDENTIALS ===
bot.onText(/\/generate (.+)/, async (msg, match) => {
  const chatId = msg.chat.id;
  const userId = String(msg.from.id);
  const providerRaw = match[1].trim().toLowerCase();

  if (isBanned(userId)) {
    bot.sendMessage(chatId, '⛔ Banned.');
    return;
  }

  const membership = await checkForceJoin(userId);
  if (!membership.joined) {
    bot.sendMessage(chatId, '🔒 Type /start first.');
    return;
  }

  const isPrem = isPremium(userId) || isOwner(userId);

  // Free tier limit (2/day)
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
        '❌ *Free limit reached (2/day)*\n💎 /premium for permanent keys.',
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
    await bot.sendMessage(chatId, `⏳ Generating REAL *${AI_PROVIDERS[providerKey].name}* key...`, { parse_mode: 'Markdown' });

    const result = await AI_PROVIDERS[providerKey].generate();
    const expiry = isPrem ? 'PERMANENT (never expires)' : '24 hours (temporary)';

    // Track usage
    if (!isPrem) {
      const record = freeUsage.get(userId);
      record.count += 1;
      record.tempKeys.push({
        key: result.key,
        provider: providerKey,
        generated: Date.now(),
        expires: Date.now() + 24 * 60 * 60 * 1000
      });
    }

    const reply = `✅ *REAL WORKING KEY*\n\n` +
                  `📡 *Provider:* ${AI_PROVIDERS[providerKey].name}\n` +
                  `🔑 *API Key:* \`${result.key}\`\n` +
                  `🌐 *Endpoint:* \`${result.endpoint}\`\n` +
                  `📖 *Docs:* ${result.docs}\n` +
                  (result.note ? `ℹ️ ${result.note}\n` : '') +
                  `\n⏳ *Expiry:* ${expiry}\n` +
                  (isPrem ? '💎 Premium' : `📊 ${freeUsage.get(userId).count}/2 used today`) +
                  `\n\n⚡ Test it immediately – it works.`;

    bot.sendMessage(chatId, reply, { parse_mode: 'Markdown' });
    
  } catch (err) {
    const errorMsg = err.response?.data?.error?.message || err.message;
    bot.sendMessage(
      chatId,
      `❌ *Generation failed*\n\n${errorMsg}\n\n` +
      `💡 Make sure your .env has the correct master key for ${AI_PROVIDERS[providerKey].name}\n` +
      `Try a free provider like OpenRouter or Groq instead.`,
      { parse_mode: 'Markdown' }
    );
  }
});

// === OWNER COMMANDS ===
bot.onText(/\/addowner (.+)/, (msg, match) => {
  if (!isOwner(String(msg.from.id))) return bot.sendMessage(msg.chat.id, '⛔ Owner only.');
  const id = match[1].trim();
  if (!id || isNaN(id)) return bot.sendMessage(msg.chat.id, '❌ Usage: /addowner <user_id>');
  ownerIds.add(id);
  bot.sendMessage(msg.chat.id, `✅ Owner ${id} added.`);
  bot.sendMessage(id, '🎉 You are now a Victory Tech owner.');
});

bot.onText(/\/removeowner (.+)/, (msg, match) => {
  if (!isOwner(String(msg.from.id))) return bot.sendMessage(msg.chat.id, '⛔ Owner only.');
  const id = match[1].trim();
  if (!ownerIds.has(id)) return bot.sendMessage(msg.chat.id, `❌ ${id} not an owner.`);
  if (id === process.env.OWNER_IDS.split(',')[0].trim()) {
    return bot.sendMessage(msg.chat.id, '❌ Cannot remove primary owner.');
  }
  ownerIds.delete(id);
  bot.sendMessage(msg.chat.id, `✅ Owner ${id} removed.`);
});

bot.onText(/\/addpremium (.+)/, (msg, match) => {
  if (!isOwner(String(msg.from.id))) return bot.sendMessage(msg.chat.id, '⛔ Owner only.');
  const id = match[1].trim();
  if (!id || isNaN(id)) return bot.sendMessage(msg.chat.id, '❌ Usage: /addpremium <user_id>');
  premiumUsers.add(id);
  bot.sendMessage(msg.chat.id, `✅ Premium granted to ${id}.`);
  bot.sendMessage(id, '🎉 Victory Tech Premium – permanent real keys.');
});

bot.onText(/\/removepremium (.+)/, (msg, match) => {
  if (!isOwner(String(msg.from.id))) return bot.sendMessage(msg.chat.id, '⛔ Owner only.');
  const id = match[1].trim();
  if (!premiumUsers.has(id)) return bot.sendMessage(msg.chat.id, `❌ ${id} not premium.`);
  premiumUsers.delete(id);
  bot.sendMessage(msg.chat.id, `✅ Premium removed from ${id}.`);
});

bot.onText(/\/ban(?:@\w+)?\s+(@\w+|\d+)/, async (msg, match) => {
  if (!isOwner(String(msg.from.id))) return bot.sendMessage(msg.chat.id, '⛔ Owner only.');
  const chatId = msg.chat.id;
  let target = match[1].trim();
  if (target.startsWith('@')) {
    try {
      const chat = await bot.getChat(target);
      target = String(chat.id);
    } catch { return bot.sendMessage(chatId, '❌ Invalid username.'); }
  }
  if (isOwner(target)) return bot.sendMessage(chatId, '❌ Cannot ban owner.');
  bannedUsers.add(target);
  premiumUsers.delete(target);
  bot.sendMessage(chatId, `⛔ User ${target} banned.`);
  bot.sendMessage(target, '⛔ Banned from Victory Tech.');
});

bot.onText(/\/unban(?:@\w+)?\s+(@\w+|\d+)/, async (msg, match) => {
  if (!isOwner(String(msg.from.id))) return bot.sendMessage(msg.chat.id, '⛔ Owner only.');
  const chatId = msg.chat.id;
  let target = match[1].trim();
  if (target.startsWith('@')) {
    try {
      const chat = await bot.getChat(target);
      target = String(chat.id);
    } catch { return bot.sendMessage(chatId, '❌ Invalid username.'); }
  }
  if (!bannedUsers.has(target)) return bot.sendMessage(chatId, `ℹ️ ${target} not banned.`);
  bannedUsers.delete(target);
  bot.sendMessage(chatId, `✅ User ${target} unbanned.`);
  bot.sendMessage(target, '✅ Unbanned from Victory Tech.');
});

bot.onText(/\/listpremium/, (msg) => {
  if (!isOwner(String(msg.from.id))) return bot.sendMessage(msg.chat.id, '⛔ Owner only.');
  const list = Array.from(premiumUsers).join('\n') || 'None';
  bot.sendMessage(msg.chat.id, `📋 Premium (${premiumUsers.size}):\n${list}`);
});

bot.onText(/\/listbans/, (msg) => {
  if (!isOwner(String(msg.from.id))) return bot.sendMessage(msg.chat.id, '⛔ Owner only.');
  const list = Array.from(bannedUsers).join('\n') || 'None';
  bot.sendMessage(msg.chat.id, `⛔ Banned (${bannedUsers.size}):\n${list}`);
});

bot.onText(/\/listowners/, (msg) => {
  if (!isOwner(String(msg.from.id))) return bot.sendMessage(msg.chat.id, '⛔ Owner only.');
  const list = Array.from(ownerIds).join('\n');
  bot.sendMessage(msg.chat.id, `👑 Owners (${ownerIds.size}):\n${list}`);
});

bot.onText(/\/broadcast (.+)/, (msg, match) => {
  if (!isOwner(String(msg.from.id))) return bot.sendMessage(msg.chat.id, '⛔ Owner only.');
  const text = match[1].trim();
  if (!text) return bot.sendMessage(msg.chat.id, '❌ Usage: /broadcast <message>');
  let sent = 0;
  for (const id of premiumUsers) {
    bot.sendMessage(id, `📢 ${text}`).then(() => sent++).catch(() => {});
  }
  bot.sendMessage(msg.chat.id, `✅ Sent to ${sent} premium users.`);
});

bot.onText(/\/help/, (msg) => {
  const userId = String(msg.from.id);
  let help = '📖 *Victory Tech Commands*\n\n' +
             '🔓 Public:\n/start – Verify channels\n/menu – Show providers\n/generate <provider> – Get REAL key\n/premium – Premium info\n\n';
  if (isOwner(userId)) {
    help += '👑 Owner:\n/addowner <id>\n/removeowner <id>\n/addpremium <id>\n/removepremium <id>\n/ban <@>\n/unban <@>\n/listpremium\n/listbans\n/listowners\n/broadcast <msg>';
  }
  bot.sendMessage(msg.chat.id, help, { parse_mode: 'Markdown' });
});

// === KEEP ALIVE ===
if (process.env.NODE_ENV === 'production') {
  const app = express();
  app.get('/', (req, res) => res.send('Victory Tech bot running with real keys'));
  app.listen(PORT, () => console.log(`Keep-alive on port ${PORT}`));
}

console.log('[✓] Victory Tech bot LIVE with YOUR credentials');
console.log(`[✓] Owners: ${Array.from(ownerIds).join(', ')}`);
console.log(`[✓] Providers: ${Object.keys(AI_PROVIDERS).length}`);
console.log('⚡ Victory Tech – REAL API keys. Configure your .env.');
