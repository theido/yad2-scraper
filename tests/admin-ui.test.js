const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');

test('local admin renders project values without interpolating them into HTML', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'admin', 'public', 'app.js'), 'utf8');

  assert.doesNotMatch(source, /article\.innerHTML/);
  assert.match(source, /element\.textContent\s*=/);
  assert.match(source, /input\.value\s*=/);
});

test('admin UI tracks versions, sync state, and fallback save protection', () => {
  const source = fs.readFileSync(path.join(__dirname, '..', 'admin', 'public', 'app.js'), 'utf8');
  assert.match(source, /version: state\.version/);
  assert.match(source, /sync\.status/);
  assert.match(source, /saveButton\.disabled/);
  assert.doesNotMatch(source, /configPath/);
  assert.match(source, /GitHub verified/);
});
