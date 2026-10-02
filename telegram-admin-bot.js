require('dotenv').config();

const { CONFIG_PATH, loadConfig } = require('./config-lib');
const {
  applyCommandAndSave,
  getHelpText,
  parseCommand
} = require('./telegram-admin-lib');

const API_TOKEN = process.env.API_TOKEN || '';
const TELEGRAM_API_BASE = API_TOKEN ? `https://api.telegram.org/bot${API_TOKEN}` : '';
const POLL_TIMEOUT_SECONDS = Number(process.env.TELEGRAM_ADMIN_POLL_TIMEOUT || 30);
const ALLOWED_CHAT_IDS = String(process.env.TELEGRAM_ADMIN_CHAT_IDS || '')
  .split(',')
  .map((value) => value.trim())
  .filter(Boolean);

const assertAdminConfiguration = ({ apiToken = API_TOKEN, allowedChatIds = ALLOWED_CHAT_IDS } = {}) => {
  if (!apiToken) {
    throw new Error('Missing API_TOKEN in environment.');
  }

  if (!Array.isArray(allowedChatIds) || allowedChatIds.length === 0) {
    throw new Error('Missing TELEGRAM_ADMIN_CHAT_IDS. Telegram admin refuses to start without an explicit allowlist.');
  }
};

const telegramRequest = async (method, payload = {}) => {
  const response = await fetch(`${TELEGRAM_API_BASE}/${method}`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json'
    },
    body: JSON.stringify(payload)
  });

  const data = await response.json();
  if (!data.ok) {
    throw new Error(data.description || `Telegram API error calling ${method}`);
  }

  return data.result;
};

const isAllowedChat = (message, allowedChatIds = ALLOWED_CHAT_IDS) => {
  if (!Array.isArray(allowedChatIds) || allowedChatIds.length === 0) return false;
  return allowedChatIds.includes(String(message.chat.id));
};

const sendMessage = async (message, text) => {
  const payload = {
    chat_id: message.chat.id,
    text,
    disable_web_page_preview: true
  };

  if (message.message_thread_id) {
    payload.message_thread_id = message.message_thread_id;
  }

  await telegramRequest('sendMessage', payload);
};

const handleTextCommand = async (message, configPath = CONFIG_PATH) => {
  if (!isAllowedChat(message)) {
    await sendMessage(message, 'This chat is not allowed to manage topics. Set TELEGRAM_ADMIN_CHAT_IDS to allow it.');
    return;
  }

  const text = String(message.text || '').trim();

  try {
    const command = parseCommand(text);
    const config = loadConfig(configPath);
    const result = applyCommandAndSave(config, command, configPath);
    await sendMessage(message, result.message);
  } catch (error) {
    const helpSuffix = text.startsWith('/topic') || text.startsWith('/topics')
      ? `\n\n${getHelpText()}`
      : '';
    await sendMessage(message, `${error.message}${helpSuffix}`);
  }
};

const processUpdate = async (update, configPath = CONFIG_PATH) => {
  const message = update.message || update.edited_message;
  if (!message?.text) {
    return;
  }

  if (!message.text.startsWith('/topic') && !message.text.startsWith('/topics')) {
    return;
  }

  await handleTextCommand(message, configPath);
};

const pollUpdates = async (offset) => {
  return telegramRequest('getUpdates', {
    offset,
    timeout: POLL_TIMEOUT_SECONDS,
    allowed_updates: ['message', 'edited_message']
  });
};

const runBot = async ({ once = false, configPath = CONFIG_PATH } = {}) => {
  assertAdminConfiguration();

  let offset = 0;
  console.log(`Telegram admin bot started. Config path: ${configPath}`);
  console.log(`Allowed chat IDs: ${ALLOWED_CHAT_IDS.join(', ')}`);

  do {
    const updates = await pollUpdates(offset);
    for (const update of updates) {
      offset = update.update_id + 1;
      await processUpdate(update, configPath);
    }

    if (once) {
      break;
    }
  } while (true);
};

if (require.main === module) {
  const once = process.argv.includes('--once');
  runBot({ once }).catch((error) => {
    console.error(error.message || error);
    process.exitCode = 1;
  });
}

module.exports = {
  assertAdminConfiguration,
  handleTextCommand,
  isAllowedChat,
  pollUpdates,
  processUpdate,
  runBot,
  telegramRequest
};
