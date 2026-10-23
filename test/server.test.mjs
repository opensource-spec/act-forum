import assert from 'node:assert/strict';
import { test, before, after } from 'node:test';
import { spawn, spawnSync } from 'node:child_process';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import net from 'node:net';
import { once } from 'node:events';
import { DatabaseSync } from 'node:sqlite';

const root = fileURLToPath(new URL('../', import.meta.url));
const password = 'local-test-password-only';
let temporary, databasePath, db, server, base;

before(async () => {
  temporary = await mkdtemp(path.join(tmpdir(), 'act-forum-test-'));
  databasePath = path.join(temporary, 'forum.sqlite');
  const setup = spawnSync(process.execPath, ['scripts/create-moderator.mjs'], {
    cwd: root, env: { ...process.env, FORUM_DB_PATH: databasePath, FORUM_MODERATOR_PASSWORD: password }, encoding: 'utf8',
  });
  assert.equal(setup.status, 0, setup.stderr);
  db = new DatabaseSync(databasePath);
  const probe = net.createServer();
  probe.listen(0, '127.0.0.1');
  await once(probe, 'listening');
  const port = probe.address().port;
  await new Promise((resolve) => probe.close(resolve));
  base = `http://127.0.0.1:${port}`;
  server = spawn(process.execPath, ['server/index.mjs'], {
    cwd: root, env: { ...process.env, FORUM_DB_PATH: databasePath, FORUM_PORT: String(port), FORUM_HOST: '127.0.0.1' },
    stdio: ['ignore', 'pipe', 'pipe'],
  });
  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => reject(new Error('Test server did not start')), 10000);
    server.stdout.on('data', (chunk) => {
      if (chunk.toString().includes('ACT Forum listening')) { clearTimeout(timeout); resolve(); }
    });
    server.once('error', (error) => { clearTimeout(timeout); reject(error); });
    server.once('exit', (code) => { clearTimeout(timeout); reject(new Error(`Test server exited: ${code}`)); });
  });
});

after(async () => {
  if (server && server.exitCode === null) {
    const closed = once(server, 'exit');
    server.kill('SIGTERM');
    await closed;
  }
  db?.close();
  if (temporary) await rm(temporary, { recursive: true, force: true });
});

async function request(route, input, cookie) {
  const response = await fetch(base + route, {
    method: input ? 'POST' : 'GET',
    headers: { Origin: base, 'Content-Type': 'application/json', ...(cookie ? { Cookie: cookie } : {}) },
    ...(input ? { body: JSON.stringify(input) } : {}),
  });
  const contentType = response.headers.get('content-type');
  return { status: response.status, body: contentType?.includes('json') ? await response.json() : await response.text(),
    cookie: response.headers.get('set-cookie')?.split(';')[0] };
}
async function mutation(input, cookie) {
  db.exec('DELETE FROM limits');
  return request('/api/forum', input, cookie);
}

test('real HTTP sessions enforce role permissions, bans, unbans, and account deletion', async () => {
  assert.equal((await request('/api/moderation')).status, 401);
  const admin = await request('/auth/login', { username: 'moderator', password });
  assert.equal(admin.status, 200);
  assert.ok(admin.cookie);
  const member = await request('/auth/register', { username: 'test_member', password, role: 'moderator' });
  assert.equal(member.status, 200);
  assert.equal((await request('/api/forum', null, member.cookie)).body.user.role, 'member');
  assert.equal((await request('/api/moderation', null, member.cookie)).status, 403);
  assert.equal((await mutation({ action: 'mod_lock', post: 'welcome', value: true }, member.cookie)).status, 403);
  const members = (await request('/api/moderation', null, admin.cookie)).body.users;
  const userId = members.find((u) => u.username === 'test_member').id;
  assert.equal((await mutation({ action: 'mod_ban', userId, value: true }, admin.cookie)).status, 200);
  assert.equal((await request('/api/forum', null, member.cookie)).body.user, null);
  assert.equal((await mutation({ action: 'comment', post: 'welcome', body: 'Stale session' }, member.cookie)).status, 401);
  const blocked = await request('/auth/login', { username: 'test_member', password });
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error, 'ACCOUNT_BANNED');
  assert.equal((await mutation({ action: 'mod_ban', userId, value: false }, admin.cookie)).status, 200);
  const restored = await request('/auth/login', { username: 'test_member', password });
  assert.equal(restored.status, 200);
  assert.equal((await request('/api/forum', null, member.cookie)).body.user, null, 'unban does not revive revoked sessions');
  assert.equal((await mutation({ action: 'comment', post: 'welcome', body: 'Works again' }, restored.cookie)).status, 200);
  assert.equal((await mutation({ action: 'mod_delete_user', userId }, admin.cookie)).status, 200);
  assert.equal((await request('/api/forum', null, restored.cookie)).body.user, null);
  assert.equal((await request('/auth/login', { username: 'test_member', password })).status, 401);
  assert.equal((await request('/auth/register', { username: 'moderator', password })).status, 409);
  const originViolation = await fetch(base + '/api/forum', { method: 'POST', headers: { Origin: 'https://different.example', Cookie: admin.cookie },
    body: JSON.stringify({ action: 'mod_lock', post: 'welcome', value: true }) });
  assert.equal(originViolation.status, 403);
  const page = await request('/?view=discussions&post=welcome');
  assert.equal(page.status, 200);
  assert.ok(page.body.includes('--lime: #b6ff00'));
  assert.ok(!page.body.includes(password));
});

test('moderator setup refuses to reset an existing account', () => {
  const before = db.prepare('SELECT hash FROM local_users WHERE username=?').get('moderator').hash;
  const setup = spawnSync(process.execPath, ['scripts/create-moderator.mjs'], {
    cwd: root, env: { ...process.env, FORUM_DB_PATH: databasePath, FORUM_MODERATOR_PASSWORD: 'different-local-test-password' }, encoding: 'utf8',
  });
  assert.notEqual(setup.status, 0);
  assert.equal(db.prepare('SELECT hash FROM local_users WHERE username=?').get('moderator').hash, before);
});
