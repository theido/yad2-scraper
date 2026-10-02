const test = require('node:test');
const assert = require('node:assert/strict');

const { normalizeConfig } = require('../config-lib');
const {
  applyCommand,
  listTopicsMessage,
  parseCommand
} = require('../telegram-admin-lib');
const {
  assertAdminConfiguration,
  isAllowedChat
} = require('../telegram-admin-bot');

const createConfig = () => normalizeConfig({
  settings: {
    defaultTelegramTarget: 'telegram:-999',
    defaultNotionDatabaseId: '',
    notionTokenEnv: 'NOTION_API_TOKEN'
  },
  projects: [
    {
      id: 'sorento-main',
      topic: 'סורנטו',
      url: 'https://example.com/sorento',
      disabled: false,
      telegramTarget: 'telegram:-999',
      notionDatabaseId: ''
    },
    {
      id: 'explorer-main',
      topic: 'אקספלורר',
      url: 'https://example.com/explorer',
      disabled: false,
      telegramTarget: 'telegram:-111',
      notionDatabaseId: 'db-1'
    }
  ]
});

test('parseCommand parses list and update commands', () => {
  assert.deepEqual(parseCommand('/topics'), { type: 'topics' });
  assert.deepEqual(parseCommand('/topics@my_bot'), { type: 'topics' });
  assert.deepEqual(parseCommand('/topic add קאמפר | https://example.com/camper'), {
    type: 'add',
    topic: 'קאמפר',
    url: 'https://example.com/camper'
  });
  assert.deepEqual(parseCommand('/topic remove אקספלורר'), { type: 'remove', topic: 'אקספלורר' });
  assert.deepEqual(parseCommand('/topic disable סורנטו'), { type: 'disable', topic: 'סורנטו' });
  assert.deepEqual(parseCommand('/topic set-url אקספלורר | https://yad2.example'), {
    type: 'set-url',
    topic: 'אקספלורר',
    url: 'https://yad2.example'
  });
  assert.deepEqual(parseCommand('/topic set-telegram סורנטו | telegram:-12345'), {
    type: 'set-telegram',
    topic: 'סורנטו',
    telegramTarget: 'telegram:-12345'
  });
});

test('applyCommand disables and re-enables topics', () => {
  const config = createConfig();

  const disabledResult = applyCommand(config, { type: 'disable', topic: 'סורנטו' });
  assert.equal(disabledResult.config.projects[0].disabled, true);
  assert.equal(disabledResult.message, 'Disabled topic: סורנטו');

  const enabledResult = applyCommand(disabledResult.config, { type: 'enable', topic: 'סורנטו' });
  assert.equal(enabledResult.config.projects[0].disabled, false);
  assert.equal(enabledResult.message, 'Enabled topic: סורנטו');
});

test('applyCommand updates topic URL and telegram target', () => {
  const config = createConfig();

  const urlResult = applyCommand(config, {
    type: 'set-url',
    topic: 'אקספלורר',
    url: 'https://new.example/explorer'
  });
  assert.equal(urlResult.config.projects[1].url, 'https://new.example/explorer');

  const telegramResult = applyCommand(urlResult.config, {
    type: 'set-telegram',
    topic: 'אקספלורר',
    telegramTarget: 'telegram:-222'
  });
  assert.equal(telegramResult.config.projects[1].telegramTarget, 'telegram:-222');
});

test('applyCommand adds and removes topics', () => {
  const config = createConfig();

  const addedResult = applyCommand(config, {
    type: 'add',
    topic: 'קאמפר',
    url: 'https://example.com/camper'
  });

  assert.equal(addedResult.config.projects.length, 3);
  assert.equal(addedResult.config.projects[2].topic, 'קאמפר');
  assert.equal(addedResult.config.projects[2].url, 'https://example.com/camper');
  assert.equal(addedResult.config.projects[2].disabled, false);
  assert.equal(addedResult.message, 'Added topic: קאמפר');

  const removedResult = applyCommand(addedResult.config, {
    type: 'remove',
    topic: 'קאמפר'
  });

  assert.equal(removedResult.config.projects.length, 2);
  assert.equal(removedResult.message, 'Removed topic: קאמפר');
});

test('listTopicsMessage summarizes configured topics', () => {
  const message = listTopicsMessage(createConfig());
  assert.match(message, /Configured topics \(2\):/);
  assert.match(message, /סורנטו/);
  assert.match(message, /אקספלורר/);
  assert.match(message, /🟢 enabled/);
});

test('applyCommand throws when topic does not exist', () => {
  assert.throws(
    () => applyCommand(createConfig(), { type: 'disable', topic: 'לא-קיים' }),
    /Topic not found/
  );
});

test('applyCommand rejects duplicate topic add', () => {
  assert.throws(
    () => applyCommand(createConfig(), { type: 'add', topic: 'סורנטו', url: 'https://duplicate.example' }),
    /Topic already exists/
  );
});

test('Telegram admin fails closed without an explicit chat allowlist', () => {
  assert.throws(
    () => assertAdminConfiguration({ apiToken: 'token', allowedChatIds: [] }),
    /TELEGRAM_ADMIN_CHAT_IDS/
  );
  assert.equal(isAllowedChat({ chat: { id: -123 } }, []), false);
});

test('Telegram admin accepts only explicitly allowed chats', () => {
  assert.equal(isAllowedChat({ chat: { id: -123 } }, ['-123']), true);
  assert.equal(isAllowedChat({ chat: { id: -999 } }, ['-123']), false);
});
