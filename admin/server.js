const http = require('http');
const fs = require('fs');
const path = require('path');
const { URL } = require('url');
const { loadConfig, saveConfig, CONFIG_PATH, normalizeConfig } = require('../config-lib');
const { listAccessibleNotionDatabases } = require('../notion-lib');

const HOST = process.env.ADMIN_HOST || '127.0.0.1';
const PORT = Number(process.env.ADMIN_PORT || 4312);
const PUBLIC_DIR = path.join(__dirname, 'public');

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png'
};

const sendJson = (res, statusCode, payload) => {
  res.writeHead(statusCode, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store'
  });
  res.end(JSON.stringify(payload));
};

const readBody = async (req) => {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString('utf8');
  return raw ? JSON.parse(raw) : {};
};

const resolveNotionToken = (config) => {
  const envName = config?.settings?.notionTokenEnv || 'NOTION_API_TOKEN';
  return process.env[envName] || process.env.NOTION_API_TOKEN || process.env.NOTION_API_KEY || '';
};

const serveStatic = (req, res, pathname) => {
  const safePath = pathname === '/' ? '/index.html' : pathname;
  const filePath = path.join(PUBLIC_DIR, safePath);
  if (!filePath.startsWith(PUBLIC_DIR)) {
    sendJson(res, 403, { error: 'Forbidden' });
    return;
  }

  fs.readFile(filePath, (error, content) => {
    if (error) {
      sendJson(res, 404, { error: 'Not found' });
      return;
    }
    const ext = path.extname(filePath);
    res.writeHead(200, { 'Content-Type': MIME_TYPES[ext] || 'application/octet-stream' });
    res.end(content);
  });
};

const server = http.createServer(async (req, res) => {
  try {
    const url = new URL(req.url, `http://${req.headers.host}`);

    if (req.method === 'GET' && url.pathname === '/api/config') {
      const config = loadConfig();
      return sendJson(res, 200, { config, configPath: CONFIG_PATH });
    }

    if (req.method === 'PUT' && url.pathname === '/api/config') {
      const body = await readBody(req);
      const normalized = saveConfig(normalizeConfig(body.config || body));
      return sendJson(res, 200, { success: true, config: normalized });
    }

    if (req.method === 'GET' && url.pathname === '/api/notion/databases') {
      const config = loadConfig();
      const token = resolveNotionToken(config);
      if (!token) {
        return sendJson(res, 400, { error: 'No Notion token available in environment' });
      }
      const databases = await listAccessibleNotionDatabases(token, url.searchParams.get('query') || '');
      return sendJson(res, 200, { databases });
    }

    if (req.method === 'GET' && url.pathname === '/api/status') {
      const config = loadConfig();
      return sendJson(res, 200, {
        notionTokenConfigured: Boolean(resolveNotionToken(config)),
        projectCount: config.projects.length
      });
    }

    serveStatic(req, res, url.pathname);
  } catch (error) {
    console.error('Admin server error:', error);
    sendJson(res, 500, { error: error.message || 'Internal server error' });
  }
});

server.listen(PORT, HOST, () => {
  console.log(`Yad2 admin server running at http://${HOST}:${PORT}`);
});
