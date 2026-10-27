const test = require('node:test');
const assert = require('node:assert/strict');
const { once } = require('node:events');
const { createServer } = require('../admin/server');
const { normalizeConfig } = require('../config-lib');

const local = normalizeConfig({ projects: [{ id: 'local', topic: 'Local' }] });
const remote = normalizeConfig({ settings: { defaultTelegramTarget: 'telegram:default', defaultNotionDatabaseId: 'default-db' }, projects: [{ id: 'remote', topic: 'Remote', telegramTarget: 'telegram:topic', notionDatabaseId: 'topic-db' }] });
async function fixture(t, extra = {}) {
  let stored = structuredClone(local);
  let value = JSON.stringify(remote);
  const calls = [];
  const runGh = async (args, input) => {
    calls.push({ args, input });
    if (args.includes('--input')) value = JSON.parse(input).value;
    return JSON.stringify({ value });
  };
  const server = createServer({ githubSync: true, allowedHosts: ['admin.test'], allowedOrigins: ['https://admin.test'], loadLocal: () => stored, saveLocal: c => { stored = c; return c; }, runGh, ...extra });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  t.after(() => new Promise(resolve => { server.close(resolve); server.closeAllConnections(); }));
  const request = (method = 'GET', body, headers = {}) => new Promise((resolve, reject) => {
    const req = require('node:http').request({ host: '127.0.0.1', port: server.address().port, path: '/api/config', method, headers: { Host: 'admin.test', ...(method === 'PUT' ? { Origin: 'https://admin.test', 'Content-Type': 'application/json' } : {}), ...headers } }, res => {
      let data = '';
      res.on('data', chunk => { data += chunk; });
      res.on('end', () => resolve({ status: res.statusCode, data: JSON.parse(data), headers: res.headers }));
    });
    req.on('error', reject);
    req.end(body === undefined ? undefined : JSON.stringify(body));
  });
  return { request, calls, stored: () => stored };
}

test('GitHub is source of truth and full routing is written, read back, then persisted locally', async t => {
  const f = await fixture(t);
  const read = await f.request();
  assert.equal(read.status, 200, JSON.stringify(read.data));
  assert.deepEqual(read.data.config, remote);
  assert.equal(read.data.source, 'github');
  assert.equal(read.data.sync.enabled, true);
  assert.equal(read.data.configPath, undefined);
  const config = structuredClone(remote); config.projects[0].topic = 'Updated $(touch /bad)';
  const write = await f.request('PUT', { config, version: read.data.version, repository: 'attacker/repo' });
  assert.equal(write.status, 200);
  assert.equal(write.data.sync.status, 'verified');
  assert.deepEqual(f.stored(), config);
  const call = f.calls.find(c => c.input);
  assert.deepEqual(JSON.parse(call.input), { name: 'SCRAPER_PROJECTS', value: JSON.stringify(config) });
  assert.ok(f.calls.every(c => c.args.some(a => a.includes('repos/theido/yad2-scraper/actions/variables/SCRAPER_PROJECTS'))));
  assert.ok(f.calls.length >= 4);
});

test('unavailable GitHub shows marked fallback, never saves or leaks error details', async t => {
  const f = await fixture(t, { runGh: async () => { throw new Error('/secret/path token=private'); } });
  const read = await f.request();
  assert.equal(read.data.source, 'local-fallback');
  assert.equal(read.data.version, null);
  assert.equal(read.data.sync.status, 'error');
  const write = await f.request('PUT', { config: remote, version: 'any' });
  assert.equal(write.status, 502);
  assert.deepEqual(f.stored(), local);
  assert.doesNotMatch(JSON.stringify([read.data, write.data]), /secret|private/);
});

test('read-back mismatch refuses local persistence', async t => {
  let calls = 0;
  const f = await fixture(t, { runGh: async () => { calls++; return JSON.stringify({ value: JSON.stringify(remote) }); } });
  const read = await f.request();
  const config = structuredClone(remote); config.projects[0].topic = 'Changed';
  const write = await f.request('PUT', { config, version: read.data.version });
  assert.equal(write.status, 502);
  assert.match(write.data.error, /read-back/);
  assert.deepEqual(f.stored(), local);
  assert.equal(calls, 4);
});

test('stale/missing versions reject; simultaneous saves cannot overwrite each other', async t => {
  const f = await fixture(t);
  const read = await f.request();
  assert.equal((await f.request('PUT', { config: remote })).status, 409);
  const config = structuredClone(remote); config.projects[0].topic = 'Changed';
  const results = await Promise.all([f.request('PUT', { config, version: read.data.version }), f.request('PUT', { config, version: read.data.version })]);
  assert.deepEqual(results.map(r => r.status).sort(), [200, 409]);
});

test('Host/Origin allowlists and JSON-only mutations reject CSRF/rebinding with no CORS', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('GET', undefined, { Host: 'evil.test' })).status, 403);
  assert.equal((await f.request('GET', undefined, { Origin: 'https://evil.test' })).status, 403);
  for (const headers of [{ Origin: '' }, { Origin: 'null' }, { Origin: 'https://evil.test' }, { 'Content-Type': 'text/plain' }]) {
    const result = await f.request('PUT', { config: remote }, headers);
    assert.ok([403, 415].includes(result.status));
    assert.equal(result.headers['access-control-allow-origin'], undefined);
  }
  assert.equal(f.calls.length, 0);
});

test('body size is bounded before any GitHub write', async t => {
  const f = await fixture(t);
  assert.equal((await f.request('PUT', { padding: 'x'.repeat(50 * 1024) })).status, 413);
  assert.equal(f.calls.length, 0);
});

test('sync is opt-in and local-only saves use version protection', async t => {
  const f = await fixture(t, { githubSync: false });
  const read = await f.request();
  assert.equal(read.data.sync.enabled, false);
  assert.deepEqual(read.data.config, local);
  assert.equal((await f.request('PUT', { config: remote, version: read.data.version })).status, 200);
  assert.deepEqual(f.stored(), remote);
  assert.equal(f.calls.length, 0);
});

test('local write failure reports GitHub already updated, not success', async t => {
  const f = await fixture(t, { saveLocal: () => { throw new Error('private path'); } });
  const read = await f.request();
  const write = await f.request('PUT', { config: remote, version: read.data.version });
  assert.equal(write.status, 500);
  assert.match(write.data.error, /GitHub updated and verified/);
  assert.equal(write.data.success, false);
});

test('legacy GitHub project IDs and versions remain stable across reloads', async t => {
  const f = await fixture(t, { runGh: async () => JSON.stringify({ value: JSON.stringify([{ topic: 'Legacy', telegramChatId: 'telegram:legacy' }]) }) });
  const a = await f.request(); const b = await f.request();
  assert.deepEqual(a.data, b.data);
  assert.equal(a.data.config.projects[0].telegramTarget, 'telegram:legacy');
});

test('GitHub PATCH and verification read failures never persist locally', async t => {
  for (const failOn of [3, 4]) {
    let calls = 0;
    const f = await fixture(t, { runGh: async () => {
      if (++calls === failOn) throw new Error('private gh stderr');
      return JSON.stringify({ value: JSON.stringify(remote) });
    } });
    const read = await f.request();
    const write = await f.request('PUT', { config: remote, version: read.data.version });
    assert.equal(write.status, 502);
    assert.equal(write.data.success, false);
    assert.deepEqual(f.stored(), local);
    assert.doesNotMatch(write.data.error, /private/);
  }
});

test('gh adapter uses execFile without shell, stdin payload and bounded timeout/output', async () => {
  const fs = require('node:fs');
  const path = require('node:path');
  const vm = require('node:vm');
  const filename = path.join(__dirname, '../admin/server.js');
  const realRequire = require('node:module').createRequire(filename);
  let captured;
  const sandbox = { module: { exports: {} }, __dirname: path.dirname(filename), process, Buffer, console, require: name => name === 'child_process' ? {
    execFile: (file, args, options, callback) => {
      captured = { file, args, options };
      return { stdin: { on() {}, end(input) { captured.input = input; callback(null, 'ok'); } } };
    }
  } : realRequire(name) };
  vm.runInNewContext(fs.readFileSync(filename, 'utf8'), sandbox);
  assert.equal(await sandbox.module.exports.runGh(['api', '--input', '-'], '$(do-not-execute)'), 'ok');
  assert.equal(captured.file, 'gh');
  assert.equal(captured.input, '$(do-not-execute)');
  assert.equal(captured.options.shell, undefined);
  assert.equal(captured.options.timeout, 15000);
  assert.equal(captured.options.killSignal, 'SIGKILL');
  assert.equal(captured.options.maxBuffer, 256 * 1024);
});
