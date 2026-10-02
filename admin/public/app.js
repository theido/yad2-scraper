const state = {
  config: null,
  notionDatabases: []
};

const el = {
  configPath: document.querySelector('#config-path'),
  projectCount: document.querySelector('#project-count'),
  notionStatus: document.querySelector('#notion-status'),
  saveButton: document.querySelector('#save-button'),
  refreshButton: document.querySelector('#refresh-button'),
  projectForm: document.querySelector('#project-form'),
  projectsList: document.querySelector('#projects-list'),
  clearForm: document.querySelector('#clear-form'),
  databaseSelect: document.querySelector('#database-select'),
  toast: document.querySelector('#toast'),
  defaultTelegramTarget: document.querySelector('#defaultTelegramTarget'),
  defaultNotionDatabaseId: document.querySelector('#defaultNotionDatabaseId'),
  notionTokenEnv: document.querySelector('#notionTokenEnv'),
  projectTopic: document.querySelector('#project-topic'),
  projectTelegramTarget: document.querySelector('#project-telegramTarget'),
  projectUrl: document.querySelector('#project-url'),
  projectNotionDatabaseId: document.querySelector('#project-notionDatabaseId'),
  projectDisabled: document.querySelector('#project-disabled')
};

const showToast = (message, type = 'success') => {
  el.toast.textContent = message;
  el.toast.className = `toast ${type}`;
  setTimeout(() => {
    el.toast.className = 'toast hidden';
  }, 3200);
};

const fetchJson = async (url, options) => {
  const response = await fetch(url, options);
  const data = await response.json();
  if (!response.ok) throw new Error(data.error || `Request failed: ${response.status}`);
  return data;
};

const fillDefaults = () => {
  const settings = state.config.settings;
  el.defaultTelegramTarget.value = settings.defaultTelegramTarget || '';
  el.defaultNotionDatabaseId.value = settings.defaultNotionDatabaseId || '';
  el.notionTokenEnv.value = settings.notionTokenEnv || 'NOTION_API_TOKEN';
};

const resetForm = () => {
  el.projectForm.reset();
  el.projectNotionDatabaseId.value = '';
  el.databaseSelect.value = '';
};

const renderDatabaseOptions = () => {
  const current = el.databaseSelect.value;
  el.databaseSelect.innerHTML = '<option value="">Choose a Notion database…</option>';
  state.notionDatabases.forEach((database) => {
    const option = document.createElement('option');
    option.value = database.id;
    option.textContent = `${database.title} — ${database.id}`;
    el.databaseSelect.appendChild(option);
  });
  el.databaseSelect.value = current;
};

const createTextElement = (tagName, text, className = '') => {
  const element = document.createElement(tagName);
  element.textContent = String(text || '');
  if (className) element.className = className;
  return element;
};

const createProjectInput = ({ field, value = '', type = 'text', placeholder = '' }) => {
  const input = document.createElement('input');
  input.dataset.field = field;
  input.type = type;
  if (type === 'checkbox') {
    input.checked = Boolean(value);
  } else {
    input.value = String(value || '');
    input.placeholder = placeholder;
  }
  return input;
};

const createProjectField = (labelText, input, className = '') => {
  const label = document.createElement('label');
  if (className) label.className = className;
  label.append(createTextElement('span', labelText), input);
  return label;
};

const buildProjectCard = (project, index) => {
  const article = document.createElement('article');
  article.className = 'project-card';

  const header = document.createElement('div');
  header.className = 'project-header';
  const heading = document.createElement('div');
  heading.append(
    createTextElement('h3', project.topic),
    createTextElement('p', project.url)
  );

  const meta = document.createElement('div');
  meta.className = 'project-meta';
  meta.append(
    createTextElement('span', project.disabled ? 'Disabled' : 'Enabled', `badge${project.disabled ? ' disabled' : ''}`),
    createTextElement(
      'span',
      project.telegramTarget || 'No Telegram target',
      `badge${project.telegramTarget ? '' : ' disabled'}`
    )
  );
  header.append(heading, meta);

  const fields = document.createElement('div');
  fields.className = 'project-fields';
  fields.append(
    createProjectField('Topic name', createProjectInput({ field: 'topic', value: project.topic })),
    createProjectField('Telegram target', createProjectInput({
      field: 'telegramTarget',
      value: project.telegramTarget,
      placeholder: 'telegram:-5464355735'
    })),
    createProjectField('Yad2 URL', createProjectInput({ field: 'url', value: project.url })),
    createProjectField('Notion database ID', createProjectInput({
      field: 'notionDatabaseId',
      value: project.notionDatabaseId,
      placeholder: 'Paste a Notion database ID'
    })),
    createProjectField(
      'Disabled',
      createProjectInput({ field: 'disabled', value: project.disabled, type: 'checkbox' }),
      'checkbox-row'
    )
  );

  const actions = document.createElement('div');
  actions.className = 'card-actions';
  const duplicateButton = createTextElement('button', 'Duplicate', 'secondary');
  duplicateButton.dataset.action = 'duplicate';
  const deleteButton = createTextElement('button', 'Delete', 'danger');
  deleteButton.dataset.action = 'delete';
  actions.append(duplicateButton, deleteButton);

  article.append(header, fields, actions);

  article.querySelectorAll('[data-field]').forEach((input) => {
    input.addEventListener('input', (event) => {
      const field = event.target.dataset.field;
      state.config.projects[index][field] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
      updateStatus();
    });
    if (input.type === 'checkbox') {
      input.addEventListener('change', (event) => {
        const field = event.target.dataset.field;
        state.config.projects[index][field] = event.target.checked;
        updateStatus();
      });
    }
  });

  article.querySelector('[data-action="delete"]').addEventListener('click', () => {
    state.config.projects.splice(index, 1);
    renderProjects();
    updateStatus();
  });

  article.querySelector('[data-action="duplicate"]').addEventListener('click', () => {
    const clone = structuredClone(state.config.projects[index]);
    clone.id = '';
    clone.topic = `${clone.topic} copy`;
    state.config.projects.splice(index + 1, 0, clone);
    renderProjects();
    updateStatus();
  });

  return article;
};

const renderProjects = () => {
  el.projectsList.innerHTML = '';
  state.config.projects.forEach((project, index) => {
    el.projectsList.appendChild(buildProjectCard(project, index));
  });
  if (state.config.projects.length === 0) {
    el.projectsList.innerHTML = '<p>No topics yet. Add one above.</p>';
  }
  updateStatus();
};

const updateStatus = () => {
  el.projectCount.textContent = String(state.config.projects.length);
  fillDefaults();
};

const loadConfig = async () => {
  const { config, configPath } = await fetchJson('/api/config');
  state.config = config;
  el.configPath.textContent = configPath;
  fillDefaults();
  renderProjects();
};

const loadStatus = async () => {
  try {
    const status = await fetchJson('/api/status');
    el.notionStatus.textContent = status.notionTokenConfigured ? 'Connected' : 'Missing token';
  } catch (error) {
    el.notionStatus.textContent = 'Unavailable';
  }
};

const loadDatabases = async () => {
  try {
    const { databases } = await fetchJson('/api/notion/databases');
    state.notionDatabases = databases;
    renderDatabaseOptions();
    el.notionStatus.textContent = `Connected (${databases.length} DBs)`;
  } catch (error) {
    el.notionStatus.textContent = 'Token or access missing';
    showToast(error.message, 'error');
  }
};

el.databaseSelect.addEventListener('change', () => {
  el.projectNotionDatabaseId.value = el.databaseSelect.value;
});

el.projectForm.addEventListener('submit', (event) => {
  event.preventDefault();
  const project = {
    topic: el.projectTopic.value.trim(),
    telegramTarget: el.projectTelegramTarget.value.trim(),
    url: el.projectUrl.value.trim(),
    notionDatabaseId: el.projectNotionDatabaseId.value.trim(),
    disabled: el.projectDisabled.checked
  };

  if (!project.topic || !project.url) {
    showToast('Topic and URL are required.', 'error');
    return;
  }

  state.config.projects.push(project);
  renderProjects();
  resetForm();
  showToast('Topic added. Save config when ready.');
});

el.clearForm.addEventListener('click', resetForm);

el.refreshButton.addEventListener('click', async () => {
  await Promise.all([loadConfig(), loadStatus(), loadDatabases()]);
  showToast('Refreshed.');
});

el.saveButton.addEventListener('click', async () => {
  try {
    state.config.settings.defaultTelegramTarget = el.defaultTelegramTarget.value.trim();
    state.config.settings.defaultNotionDatabaseId = el.defaultNotionDatabaseId.value.trim();
    state.config.settings.notionTokenEnv = el.notionTokenEnv.value.trim() || 'NOTION_API_TOKEN';

    const { config } = await fetchJson('/api/config', {
      method: 'PUT',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ config: state.config })
    });
    state.config = config;
    renderProjects();
    showToast('Config saved to config.json.');
  } catch (error) {
    showToast(error.message, 'error');
  }
});

(async () => {
  await loadConfig();
  await loadStatus();
  await loadDatabases();
})();
