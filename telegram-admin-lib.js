const { saveConfig } = require('./config-lib');

const TOPIC_COMMAND_SEPARATOR = '|';

const normalizeText = (value) => String(value || '')
  .trim()
  .toLowerCase()
  .replace(/\s+/g, ' ');

const formatProjectLine = (project) => {
  const status = project.disabled ? '🔴 disabled' : '🟢 enabled';
  const target = project.telegramTarget || 'default';
  return [
    `• ${project.topic} (${status})`,
    `  target: ${target}`,
    `  url: ${project.url}`
  ].join('\n');
};

const getHelpText = () => [
  'Available commands:',
  '/topics',
  '/topic add <topic> | <url>',
  '/topic remove <topic>',
  '/topic enable <topic>',
  '/topic disable <topic>',
  '/topic set-url <topic> | <url>',
  '/topic set-telegram <topic> | <telegramTarget>',
  '/topic set-notion <topic> | <databaseId>',
  '/topic help'
].join('\n');

const listTopicsMessage = (config) => {
  const projects = Array.isArray(config?.projects) ? config.projects : [];
  if (!projects.length) {
    return 'No topics configured.';
  }

  return [
    `Configured topics (${projects.length}):`,
    ...projects.map(formatProjectLine)
  ].join('\n\n');
};

const parsePipePayload = (payload, valueName) => {
  const [topicPart, ...valueParts] = String(payload || '').split(TOPIC_COMMAND_SEPARATOR);
  const topic = String(topicPart || '').trim();
  const value = valueParts.join(TOPIC_COMMAND_SEPARATOR).trim();

  if (!topic || !value) {
    throw new Error(`Usage: /topic ${valueName}`);
  }

  return { topic, value };
};

const stripBotMentionFromCommand = (input) => String(input || '')
  .replace(/^\/topics@[^\s]+/, '/topics')
  .replace(/^\/topic@[^\s]+/, '/topic');

const parseCommand = (text) => {
  const input = String(text || '').trim();
  const sanitizedInput = stripBotMentionFromCommand(input);

  if (sanitizedInput === '/topics') {
    return { type: 'topics' };
  }

  if (sanitizedInput === '/topic' || sanitizedInput === '/topic help') {
    return { type: 'help' };
  }

  if (!sanitizedInput.startsWith('/topic ')) {
    throw new Error('Unknown command. Send /topic help');
  }

  const payload = sanitizedInput.slice('/topic '.length).trim();
  const [action, ...restParts] = payload.split(/\s+/);
  const rest = restParts.join(' ').trim();

  if (!action) {
    return { type: 'help' };
  }

  if (action === 'add') {
    const { topic, value } = parsePipePayload(rest, 'add <topic> | <url>');
    return { type: 'add', topic, url: value };
  }

  if (action === 'remove') {
    if (!rest) {
      throw new Error('Usage: /topic remove <topic>');
    }
    return { type: 'remove', topic: rest };
  }

  if (action === 'enable' || action === 'disable') {
    if (!rest) {
      throw new Error(`Usage: /topic ${action} <topic>`);
    }
    return { type: action, topic: rest };
  }

  if (action === 'set-url') {
    const { topic, value } = parsePipePayload(rest, 'set-url <topic> | <url>');
    return { type: 'set-url', topic, url: value };
  }

  if (action === 'set-telegram') {
    const { topic, value } = parsePipePayload(rest, 'set-telegram <topic> | <telegramTarget>');
    return { type: 'set-telegram', topic, telegramTarget: value };
  }

  if (action === 'set-notion') {
    const { topic, value } = parsePipePayload(rest, 'set-notion <topic> | <databaseId>');
    return { type: 'set-notion', topic, notionDatabaseId: value };
  }

  if (action === 'help') {
    return { type: 'help' };
  }

  throw new Error(`Unknown /topic action: ${action}`);
};

const findProjectIndex = (projects, topicQuery) => {
  const normalizedQuery = normalizeText(topicQuery);
  const exactMatches = projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => normalizeText(project.topic) === normalizedQuery);

  if (exactMatches.length === 1) {
    return exactMatches[0].index;
  }

  if (exactMatches.length > 1) {
    throw new Error(`Topic name is ambiguous: ${topicQuery}`);
  }

  const partialMatches = projects
    .map((project, index) => ({ project, index }))
    .filter(({ project }) => normalizeText(project.topic).includes(normalizedQuery));

  if (partialMatches.length === 1) {
    return partialMatches[0].index;
  }

  if (!partialMatches.length) {
    throw new Error(`Topic not found: ${topicQuery}`);
  }

  throw new Error(`Topic name is ambiguous: ${topicQuery}`);
};

const cloneConfig = (config) => JSON.parse(JSON.stringify(config));

const hasTopicConflict = (projects, topic) => {
  const normalizedTopic = normalizeText(topic);
  return projects.some((project) => normalizeText(project.topic) === normalizedTopic);
};

const applyCommand = (config, command) => {
  if (command.type === 'help') {
    return { changed: false, message: getHelpText(), config };
  }

  if (command.type === 'topics') {
    return { changed: false, message: listTopicsMessage(config), config };
  }

  const nextConfig = cloneConfig(config);
  const projects = nextConfig.projects || [];

  if (command.type === 'add') {
    if (hasTopicConflict(projects, command.topic)) {
      throw new Error(`Topic already exists: ${command.topic}`);
    }

    projects.push({
      topic: command.topic,
      url: command.url,
      disabled: false,
      telegramTarget: '',
      notionDatabaseId: ''
    });

    return { changed: true, message: `Added topic: ${command.topic}`, config: nextConfig };
  }

  const projectIndex = findProjectIndex(projects, command.topic);
  const project = projects[projectIndex];

  if (command.type === 'remove') {
    projects.splice(projectIndex, 1);
    return { changed: true, message: `Removed topic: ${project.topic}`, config: nextConfig };
  }

  if (command.type === 'enable') {
    project.disabled = false;
    return { changed: true, message: `Enabled topic: ${project.topic}`, config: nextConfig };
  }

  if (command.type === 'disable') {
    project.disabled = true;
    return { changed: true, message: `Disabled topic: ${project.topic}`, config: nextConfig };
  }

  if (command.type === 'set-url') {
    project.url = command.url;
    return { changed: true, message: `Updated URL for ${project.topic}`, config: nextConfig };
  }

  if (command.type === 'set-telegram') {
    project.telegramTarget = command.telegramTarget;
    return { changed: true, message: `Updated Telegram target for ${project.topic} to ${command.telegramTarget}`, config: nextConfig };
  }

  if (command.type === 'set-notion') {
    project.notionDatabaseId = command.notionDatabaseId;
    return { changed: true, message: `Updated Notion database for ${project.topic}`, config: nextConfig };
  }

  throw new Error(`Unsupported command type: ${command.type}`);
};

const applyCommandAndSave = (config, command, configPath) => {
  const result = applyCommand(config, command);
  if (!result.changed) {
    return result;
  }

  const savedConfig = saveConfig(result.config, configPath);
  return {
    ...result,
    config: savedConfig
  };
};

module.exports = {
  TOPIC_COMMAND_SEPARATOR,
  applyCommand,
  applyCommandAndSave,
  findProjectIndex,
  formatProjectLine,
  getHelpText,
  hasTopicConflict,
  listTopicsMessage,
  normalizeText,
  parseCommand
};
