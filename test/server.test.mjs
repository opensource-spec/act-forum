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

test('profiles support safe renaming, password confirmation and session rotation, and validated avatar uploads', async () => {
  assert.equal((await request('/api/profile')).status, 401);
  assert.equal((await request('/api/profile', { action: 'username', username: 'intruder' })).status, 401);
  const registered = await request('/auth/register', { username: 'profile_member', password });
  assert.equal(registered.status, 200);
  const originalCookie = registered.cookie;
  const otherSession = await request('/auth/login', { username: 'profile_member', password });
  assert.equal(otherSession.status, 200);
  const originalProfile = await request('/api/profile', null, originalCookie);
  assert.equal(originalProfile.body.username, 'profile_member');
  assert.equal(originalProfile.body.avatar, null);
  assert.equal('hash' in originalProfile.body, false);
  assert.equal('salt' in originalProfile.body, false);
  const userId = db.prepare('SELECT id FROM local_users WHERE username=?').get('profile_member').id;
  await mutation({ action: 'post', community: 'tech', title: 'My project', body: 'Original author.' }, originalCookie);
  await mutation({ action: 'comment', post: 'welcome', body: 'My comment' }, originalCookie);
  await mutation({ action: 'join', community: 'tech', value: true }, originalCookie);
  const publicProfile = await request('/api/users/profile_member');
  assert.equal(publicProfile.status, 200);
  assert.deepEqual(Object.keys(publicProfile.body).sort(), ['avatar', 'created', 'posts', 'role', 'username']);
  assert.equal(publicProfile.body.username, 'profile_member');
  assert.equal(publicProfile.body.posts.length, 1);
  const publicPost = publicProfile.body.posts[0];
  db.prepare('INSERT INTO post_controls(post,removed) VALUES(?,1)').run(publicPost);
  assert.deepEqual((await request('/api/users/profile_member')).body.posts, []);
  db.prepare('DELETE FROM post_controls WHERE post=?').run(publicPost);
  assert.equal((await request('/api/users/no_such_member')).status, 404);
  assert.equal((await request('/api/users/profile_member', { username: 'hijacked' })).status, 405);
  const wrongOrigin = await fetch(base + '/api/profile', { method: 'POST',
    headers: { Origin: 'https://other.example', Cookie: originalCookie, 'Content-Type': 'application/json' },
    body: JSON.stringify({ action: 'username', username: 'hijacked' }) });
  assert.equal(wrongOrigin.status, 403);
  assert.equal((await request('/api/profile', { action: 'username', username: 'bad name' }, originalCookie)).status, 400);
  assert.equal((await request('/api/profile', { action: 'username', username: 'moderator' }, originalCookie)).status, 409);
  assert.equal((await request('/api/profile', { action: 'username', username: 'Renamed_Member', role: 'moderator', userId: 'someone-else' }, originalCookie)).status, 200);
  const renamed = db.prepare('SELECT id,username,role FROM local_users WHERE id=?').get(userId);
  assert.equal(renamed.username, 'renamed_member'); assert.equal(renamed.role, 'member');
  assert.equal(db.prepare('SELECT author FROM posts WHERE owner=?').get(userId).author, 'renamed_member');
  assert.equal(db.prepare('SELECT author FROM comments WHERE owner=?').get(userId).author, 'renamed_member');
  assert.equal((await request('/api/forum', null, otherSession.cookie)).body.user.name, 'renamed_member');
  assert.equal((await request('/api/forum', null, originalCookie)).body.joins[0].community, 'tech');
  assert.equal((await request('/auth/login', { username: 'profile_member', password })).status, 401);
  const renamedLogin = await request('/auth/login', { username: 'renamed_member', password });
  assert.equal(renamedLogin.status, 200);

  const nextPassword = 'changed-test-password-only';
  const change = { action: 'password', currentPassword: password, newPassword: nextPassword, confirmPassword: nextPassword };
  const before = db.prepare('SELECT hash FROM local_users WHERE id=?').get(userId).hash;
  assert.equal((await request('/api/profile', { ...change, currentPassword: 'wrong-password' }, originalCookie)).body.error, 'WRONG_PASSWORD');
  assert.equal((await request('/api/profile', { ...change, confirmPassword: 'different-password' }, originalCookie)).body.error, 'PASSWORD_MISMATCH');
  assert.equal((await request('/api/profile', { ...change, newPassword: 'short', confirmPassword: 'short' }, originalCookie)).body.error, 'INVALID_PASSWORD');
  assert.equal(db.prepare('SELECT hash FROM local_users WHERE id=?').get(userId).hash, before);
  const changed = await request('/api/profile', change, originalCookie);
  assert.equal(changed.status, 200); assert.ok(changed.cookie); assert.notEqual(changed.cookie, originalCookie);
  assert.notEqual(db.prepare('SELECT hash FROM local_users WHERE id=?').get(userId).hash, before);
  for (const stale of [originalCookie, otherSession.cookie, renamedLogin.cookie])
    assert.equal((await request('/api/profile', null, stale)).status, 401);
  assert.equal((await request('/api/profile', null, changed.cookie)).status, 200);
  assert.equal((await request('/auth/login', { username: 'renamed_member', password })).status, 401);
  assert.equal((await request('/auth/login', { username: 'renamed_member', password: nextPassword })).status, 200);

  const pixel = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
  const upload = (body, contentType = 'image/png', sessionCookie = changed.cookie, method = 'PUT') => fetch(base + '/api/profile/avatar', {
    method, headers: { Origin: base, Cookie: sessionCookie, 'Content-Type': contentType }, ...(body ? { body } : {}),
  });
  assert.equal((await upload(pixel, 'image/png', '')).status, 401);
  assert.equal((await upload('<svg onload="alert(1)"></svg>', 'image/svg+xml')).status, 415);
  assert.equal((await upload(Buffer.from('not a png'))).status, 400);
  const corrupt = Buffer.from(pixel); corrupt[40] ^= 255;
  assert.equal((await upload(corrupt)).status, 400);
  assert.equal((await upload(Buffer.alloc(524289))).status, 413);
  assert.equal((await upload(pixel)).status, 200);
  const photoProfile = (await request('/api/profile', null, changed.cookie)).body;
  assert.match(photoProfile.avatar, /^\/api\/avatars\//);
  assert.equal((await request('/api/forum', null, changed.cookie)).body.user.avatar, photoProfile.avatar);
  const image = await fetch(base + photoProfile.avatar);
  assert.equal(image.status, 200); assert.equal(image.headers.get('content-type'), 'image/png');
  assert.equal(image.headers.get('x-content-type-options'), 'nosniff');
  assert.deepEqual(Buffer.from(await image.arrayBuffer()), pixel);
  assert.equal((await upload(null, 'image/png', changed.cookie, 'DELETE')).status, 200);
  assert.equal((await request('/api/profile', null, changed.cookie)).body.avatar, null);
  assert.equal((await fetch(base + photoProfile.avatar)).status, 404);
  db.prepare('UPDATE local_users SET banned=1 WHERE id=?').run(userId);
  assert.equal((await upload(pixel)).status, 401);
  assert.equal((await request('/api/profile', { action: 'username', username: 'banned_rename' }, changed.cookie)).status, 401);
});
