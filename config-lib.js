const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const CONFIG_PATH = path.join(__dirname, 'config.json');

const DEFAULT_SETTINGS = {
  defaultTelegramTarget: '',
  defaultNotionDatabaseId: '',
  notionTokenEnv: 'NOTION_API_TOKEN'
};

const createProjectId = (topic = 'topic') => {
  const slug = String(topic)
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9\u0590-\u05ff]+/g, '-')
    .replace(/^-+|-+$/g, '') || 'topic';
  return `${slug}-${crypto.randomBytes(4).toString('hex')}`;
};

const normalizeProject = (project = {}) => ({
  id: project.id || createProjectId(project.topic),
  topic: String(project.topic || '').trim(),
  url: String(project.url || '').trim(),
  disabled: Boolean(project.disabled),
  telegramTarget: String(project.telegramTarget || project.telegramChatId || '').trim(),
  notionDatabaseId: String(project.notionDatabaseId || '').trim()
});

const normalizeConfig = (rawConfig = {}) => {
  const rawProjects = Array.isArray(rawConfig)
    ? rawConfig
    : Array.isArray(rawConfig.projects)
      ? rawConfig.projects
      : [];

  const settings = {
    ...DEFAULT_SETTINGS,
    ...(rawConfig && typeof rawConfig === 'object' && !Array.isArray(rawConfig) ? rawConfig.settings || {} : {})
  };

  if (!settings.defaultTelegramTarget && rawConfig?.chatId) {
    settings.defaultTelegramTarget = String(rawConfig.chatId).startsWith('telegram:')
      ? String(rawConfig.chatId)
      : `telegram:${rawConfig.chatId}`;
  }

  return {
    settings,
    projects: rawProjects.map((project) => normalizeProject(project))
  };
};

const loadConfig = (configPath = CONFIG_PATH) => {
  const raw = JSON.parse(fs.readFileSync(configPath, 'utf8'));
  return normalizeConfig(raw);
};

const saveConfig = (config, configPath = CONFIG_PATH) => {
  const normalizedConfig = normalizeConfig(config);
  fs.writeFileSync(configPath, `${JSON.stringify(normalizedConfig, null, 2)}\n`);
  return normalizedConfig;
};

const getEffectiveTelegramTarget = (project, settings = DEFAULT_SETTINGS) => {
  return String(project?.telegramTarget || settings.defaultTelegramTarget || '').trim();
};

const getEffectiveNotionDatabaseId = (project, settings = DEFAULT_SETTINGS) => {
  return String(project?.notionDatabaseId || settings.defaultNotionDatabaseId || '').trim();
};

module.exports = {
  CONFIG_PATH,
  DEFAULT_SETTINGS,
  createProjectId,
  getEffectiveNotionDatabaseId,
  getEffectiveTelegramTarget,
  loadConfig,
  normalizeConfig,
  normalizeProject,
  saveConfig
};
