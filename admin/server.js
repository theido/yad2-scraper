const http = require('http');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');
const { execFile } = require('child_process');
const { loadConfig, saveConfig, CONFIG_PATH, normalizeConfig } = require('../config-lib');
const { listAccessibleNotionDatabases } = require('../notion-lib');

const VARIABLE = 'repos/theido/yad2-scraper/actions/variables/SCRAPER_PROJECTS';
const PUBLIC_DIR = path.join(__dirname, 'public');
const MAX_BODY = 48 * 1024;
const digest = value => crypto.createHash('sha256').update(value).digest('hex');
const failure = (status, message) => Object.assign(new Error(message), { status });
const sendJson = (res, status, payload) => {
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(payload));
};

// No shell, no value in argv, bounded execution/output. Never return gh stderr to clients.
const runGh = (args, input) => new Promise((resolve, reject) => {
  const child = execFile('gh', args, { timeout: 15000, killSignal: 'SIGKILL', maxBuffer: 256 * 1024, env: { ...process.env, GH_PROMPT_DISABLED: '1' } }, (error, stdout) => {
    if (error) reject(failure(502, 'GitHub request failed or timed out. Reload before retrying.'));
    else resolve(stdout);
  });
  child.stdin.on('error', () => {});
  child.stdin.end(input || '');
});

async function readBody(req) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw failure(413, 'Request body too large');
    chunks.push(chunk);
  }
  try { return JSON.parse(Buffer.concat(chunks).toString('utf8')); }
  catch { throw failure(400, 'Invalid JSON'); }
}

function createServer(options = {}) {
  const port = Number(process.env.ADMIN_PORT || 4312);
  const githubSync = options.githubSync ?? process.env.ADMIN_GITHUB_SYNC === '1';
  const allowedHosts = new Set(options.allowedHosts || (process.env.ADMIN_ALLOWED_HOSTS || `127.0.0.1:${port},localhost:${port}`).split(',').map(s => s.trim()));
  const allowedOrigins = new Set(options.allowedOrigins || (process.env.ADMIN_ALLOWED_ORIGINS || `http://127.0.0.1:${port},http://localhost:${port}`).split(',').map(s => s.trim()));
  const configPath = process.env.ADMIN_CONFIG_PATH || CONFIG_PATH;
  const loadLocal = options.loadLocal || (() => loadConfig(configPath));
  const saveLocal = options.saveLocal || (config => saveConfig(config, configPath));
  const gh = options.runGh || runGh;
  let queue = Promise.resolve();
  const serial = fn => { const next = queue.then(fn); queue = next.catch(() => {}); return next; };
  const readGithub = async () => {
    const result = JSON.parse(await gh(['api', '--hostname', 'github.com', VARIABLE]));
    if (typeof result.value !== 'string') throw failure(502, 'GitHub variable is unavailable');
    const raw = JSON.parse(result.value);
    if (!raw || !(Array.isArray(raw) || Array.isArray(raw.projects))) throw failure(502, 'GitHub variable has invalid configuration');
    // Legacy arrays have no IDs: stable IDs prevent a new random config on every refresh.
    const projects = Array.isArray(raw) ? raw : raw.projects;
    const config = normalizeConfig({ ...(Array.isArray(raw) ? {} : raw), projects: projects.map((p, i) => ({ ...p, id: p.id || `github-${digest(JSON.stringify([p, i])).slice(0, 16)}` })) });
    return { config, version: digest(result.value), source: 'github', sync: { enabled: true, status: 'ready' } };
  };
  const readLocal = () => { const config = loadLocal(); return { config, version: digest(JSON.stringify(config)), source: 'local', sync: { enabled: githubSync, status: 'disabled' } }; };
  const readCurrent = () => githubSync ? readGithub() : Promise.resolve(readLocal());
  const resolveNotionToken = config => process.env[config?.settings?.notionTokenEnv || 'NOTION_API_TOKEN'] || process.env.NOTION_API_TOKEN || process.env.NOTION_API_KEY || '';

  const server = http.createServer(async (req, res) => {
    res.setHeader('X-Content-Type-Options', 'nosniff');
    res.setHeader('Content-Security-Policy', "default-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
    res.setHeader('Referrer-Policy', 'no-referrer');
    try {
      if (!allowedHosts.has(req.headers.host)) throw failure(403, 'Host not permitted');
      if (req.headers.origin && !allowedOrigins.has(req.headers.origin)) throw failure(403, 'Origin not permitted');
      const url = new URL(req.url, 'http://admin.invalid');
      if (!['GET', 'HEAD'].includes(req.method)) {
        if (!allowedOrigins.has(req.headers.origin)) throw failure(403, 'Origin required');
        if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw failure(415, 'JSON required');
        if (Number(req.headers['content-length']) > MAX_BODY) throw failure(413, 'Request body too large');
      }
      if (req.method === 'GET' && url.pathname === '/api/config') {
        const result = await serial(async () => {
          try { return await readCurrent(); }
          catch {
            const fallback = readLocal();
            return { ...fallback, version: null, source: 'local-fallback', sync: { enabled: true, status: 'error', error: 'GitHub unavailable. Showing local fallback; saving is disabled until reload succeeds.' } };
          }
        });
        return sendJson(res, 200, result);
      }
      if (req.method === 'PUT' && url.pathname === '/api/config') {
        const body = await readBody(req);
        if (!body || typeof body.config !== 'object' || !body.config || !Array.isArray(body.config.projects)) throw failure(400, 'A config with projects is required');
        const result = await serial(async () => {
          const current = await readCurrent();
          if (!body.version || body.version !== current.version) throw failure(409, 'Configuration changed. Refresh before saving.');
          const config = normalizeConfig(body.config);
          let version = digest(JSON.stringify(config));
          if (githubSync) {
            const value = JSON.stringify(config);
            if (Buffer.byteLength(value) > MAX_BODY) throw failure(413, 'Configuration too large');
            await gh(['api', '--hostname', 'github.com', '--method', 'PATCH', VARIABLE, '--input', '-'], JSON.stringify({ name: 'SCRAPER_PROJECTS', value }));
            const verified = await readGithub();
            if (verified.version !== digest(value)) throw failure(502, 'GitHub read-back did not match. Local config was not saved; reload before retrying.');
            version = verified.version;
          }
          try { saveLocal(config); }
          catch { throw failure(500, githubSync ? 'GitHub updated and verified, but local persistence failed. Reload to reconcile.' : 'Local persistence failed.'); }
          return { success: true, config, version, source: githubSync ? 'github' : 'local', sync: { enabled: githubSync, status: githubSync ? 'verified' : 'disabled' } };
        });
        return sendJson(res, 200, result);
      }
      if (req.method === 'GET' && url.pathname === '/api/status') {
        const config = loadLocal();
        return sendJson(res, 200, { notionTokenConfigured: Boolean(resolveNotionToken(config)), githubSyncEnabled: githubSync });
      }
      if (req.method === 'GET' && url.pathname === '/api/notion/databases') {
        const { config } = await serial(readCurrent);
        const token = resolveNotionToken(config);
        if (!token) throw failure(400, 'No Notion token available in environment');
        try { return sendJson(res, 200, { databases: await listAccessibleNotionDatabases(token, url.searchParams.get('query') || '') }); }
        catch { throw failure(502, 'Notion request failed'); }
      }
      if (req.method !== 'GET') throw failure(405, 'Method not allowed');
      const files = { '/': 'index.html', '/app.js': 'app.js', '/styles.css': 'styles.css' };
      const file = files[url.pathname];
      if (!file) throw failure(404, 'Not found');
      const content = await fs.promises.readFile(path.join(PUBLIC_DIR, file));
      res.writeHead(200, { 'Content-Type': { 'index.html': 'text/html; charset=utf-8', 'app.js': 'application/javascript; charset=utf-8', 'styles.css': 'text/css; charset=utf-8' }[file], 'Cache-Control': 'no-store' });
      res.end(content);
    } catch (error) {
      sendJson(res, error.status || 502, { success: false, error: error.status ? error.message : 'Configuration service unavailable. Reload before retrying.', sync: { enabled: githubSync, status: 'error' } });
    }
  });
  server.requestTimeout = 10000;
  server.headersTimeout = 10000;
  return server;
}

if (require.main === module) {
  const host = process.env.ADMIN_HOST || '127.0.0.1';
  const port = Number(process.env.ADMIN_PORT || 4312);
  createServer().listen(port, host, () => console.log(`Yad2 admin listening on http://${host}:${port}`));
}
module.exports = { createServer, runGh };
