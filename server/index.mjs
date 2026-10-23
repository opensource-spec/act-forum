import http from 'node:http';
import { readFile, mkdir } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { randomBytes, randomUUID, scrypt, timingSafeEqual, createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { AsyncLocalStorage } from 'node:async_hooks';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase, databaseAdapter } from './database.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const host = process.env.FORUM_HOST || '127.0.0.1',
  port = Number(process.env.FORUM_PORT || 8080);
if (
  !host ||
  !(
    host === '127.0.0.1' ||
    (/^26\.\d{1,3}\.\d{1,3}\.\d{1,3}$/.test(host) &&
      host.split('.').every((part) => Number(part) <= 255))
  ) ||
  !Number.isInteger(port) ||
  port < 1024 ||
  port > 65535
)
  throw Error(
    'Set FORUM_HOST to 127.0.0.1 or your Radmin IPv4 address and FORUM_PORT to a port between 1024 and 65535.',
  );
const origin = `http://${host}:${port}`;
const databasePath = process.env.FORUM_DB_PATH
  ? path.resolve(process.env.FORUM_DB_PATH)
  : path.join(root, 'data', 'forum.sqlite');
await mkdir(path.dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
initializeDatabase(db);
const adapter = databaseAdapter(db);
const context = new AsyncLocalStorage();
globalThis.localForumDb = adapter;
globalThis.localForumUser = () => context.getStore()?.user || null;
const api = await import('../dist/forum-api.mjs');
const html = await readFile(path.join(root, 'dist', 'index.html'));
const bundle = await readFile(path.join(root, 'dist', 'forum.js'));
const scryptAsync = promisify(scrypt);
const digest = (value) => createHash('sha256').update(value).digest('hex');
const authBuckets = new Map();
let activeAuth = 0;
function limited(key, max) {
  const now = Date.now();
  let value = authBuckets.get(key);
  if (!value || now - value.start > 60000) value = { start: now, count: 0 };
  value.count++;
  authBuckets.set(key, value);
  return value.count > max;
}
function session(req) {
  const token = String(req.headers.cookie || '')
    .split(';')
    .map((v) => v.trim())
    .find((v) => v.startsWith('campus_session='))
    ?.slice(15);
  if (!token || !/^[-_a-zA-Z0-9]{43}$/.test(token)) return null;
  const user = db
    .prepare(
      'SELECT u.id,u.username FROM local_sessions s JOIN local_users u ON u.id=s.user WHERE s.token=? AND s.expires>? AND u.banned=0',
    )
    .get(digest(token), Date.now());
  return user ? { userId: user.id, displayName: user.username, email: 'local@invalid' } : null;
}
async function readBody(req, max = 20000) {
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > max) {
      const error = new Error('Too large');
      error.status = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks).toString('utf8');
}
function send(res, status, data, headers = {}) {
  res.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8',
    'Cache-Control': 'no-store',
    ...headers,
  });
  res.end(JSON.stringify(data));
}
function cookie(token) {
  return `campus_session=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=604800`;
}
async function auth(req, res, route) {
  if (req.method !== 'POST') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
  if (req.headers.origin !== origin) return send(res, 403, { error: 'INVALID_ORIGIN' });
  if (!String(req.headers['content-type'] || '').startsWith('application/json'))
    return send(res, 415, { error: 'INVALID_INPUT' });
  if (route === '/auth/logout') {
    const token = String(req.headers.cookie || '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('campus_session='))
      ?.slice(15);
    if (token) db.prepare('DELETE FROM local_sessions WHERE token=?').run(digest(token));
    return send(
      res,
      200,
      { ok: true },
      { 'Set-Cookie': 'campus_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0' },
    );
  }
  if (!['/auth/login', '/auth/register'].includes(route))
    return send(res, 404, { error: 'NOT_FOUND' });
  const ip = req.socket.remoteAddress;
  if (limited('auth:' + ip, 12) || activeAuth >= 4) return send(res, 429, { error: 'RATE_LIMIT' });
  let input;
  try {
    input = JSON.parse(await readBody(req, 3000));
  } catch {
    return send(res, 400, { error: 'INVALID_INPUT' });
  }
  const username = typeof input?.username === 'string' ? input.username.trim().toLowerCase() : '';
  const password = input?.password;
  if (
    !/^[a-z0-9_-]{3,24}$/.test(username) ||
    typeof password !== 'string' ||
    password.length > 128 ||
    password.length < (route === '/auth/register' ? 10 : 1)
  )
    return send(res, 400, { error: 'INVALID_INPUT' });
  if (limited('name:' + username, 8)) return send(res, 429, { error: 'RATE_LIMIT' });
  activeAuth++;
  try {
    let user;
    if (route === '/auth/register') {
      if (username === 'moderator') return send(res, 409, { error: 'USERNAME_TAKEN' });
      if (db.prepare('SELECT id FROM local_users WHERE username=?').get(username))
        return send(res, 409, { error: 'USERNAME_TAKEN' });
      const salt = randomBytes(16).toString('hex'),
        hash = (await scryptAsync(password, salt, 64)).toString('hex');
      user = { id: randomUUID(), username };
      try {
        db.prepare('INSERT INTO local_users(id,username,salt,hash,created) VALUES(?,?,?,?,?)').run(
          user.id,
          username,
          salt,
          hash,
          Date.now(),
        );
      } catch {
        return send(res, 409, { error: 'USERNAME_TAKEN' });
      }
    } else {
      user = db
        .prepare('SELECT id,username,salt,hash,banned FROM local_users WHERE username=?')
        .get(username);
      const result = await scryptAsync(
        password,
        user?.salt || '00000000000000000000000000000000',
        64,
      );
      if (!user || !timingSafeEqual(result, Buffer.from(user.hash, 'hex')))
        return send(res, 401, { error: 'INVALID_CREDENTIALS' });
      if (user.banned) return send(res, 403, { error: 'ACCOUNT_BANNED' });
    }
    // Recheck after password hashing: a concurrent moderation action may have removed or banned this account.
    const activeUser = db.prepare('SELECT banned FROM local_users WHERE id=?').get(user.id);
    if (!activeUser || activeUser.banned) return send(res, 403, { error: 'ACCOUNT_BANNED' });
    const token = randomBytes(32).toString('base64url');
    db.prepare('INSERT INTO local_sessions(token,user,expires) VALUES(?,?,?)').run(
      digest(token),
      user.id,
      Date.now() + 604800000,
    );
    send(res, 200, { ok: true }, { 'Set-Cookie': cookie(token) });
  } finally {
    activeAuth--;
  }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('Referrer-Policy', 'same-origin');
  res.setHeader(
    'Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self' 'unsafe-inline' https://fonts.googleapis.com; font-src 'self' https://fonts.gstatic.com; connect-src 'self'; img-src 'self' data:; frame-ancestors 'none'; base-uri 'none'; form-action 'self'",
  );
  try {
    if (req.headers.host !== `${host}:${port}`) return send(res, 400, { error: 'INVALID_HOST' });
    if (
      req.socket.remoteAddress !== '127.0.0.1' &&
      !String(req.socket.remoteAddress || '').startsWith('26.')
    )
      return send(res, 403, { error: 'VPN_ONLY' });
    if (limited('request:' + req.socket.remoteAddress, 180))
      return send(res, 429, { error: 'RATE_LIMIT' });
    const url = new URL(req.url, origin),
      route = url.pathname;
    if (route.startsWith('/auth/')) return await auth(req, res, route);
    if (route === '/api/forum' || route === '/api/moderation') {
      if (route === '/api/moderation' && req.method !== 'GET')
        return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      if (!['GET', 'POST'].includes(req.method))
        return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
      if (req.method === 'POST' && req.headers.origin !== origin)
        return send(res, 403, { error: 'INVALID_ORIGIN' });
      const response = await context.run({ user: session(req) }, () =>
        req.method === 'GET'
          ? route === '/api/moderation' ? api.MODERATION_GET() : api.GET()
          : readBody(req).then((body) =>
              api.POST(
                new Request(origin + route, {
                  method: 'POST',
                  headers: { origin: req.headers.origin || '', 'content-type': 'application/json' },
                  body,
                }),
              ),
            ),
      );
      res.writeHead(response.status, Object.fromEntries(response.headers));
      res.end(await response.text());
      return;
    }
    if (req.method !== 'GET') return send(res, 405, { error: 'METHOD_NOT_ALLOWED' });
    if (route === '/forum.js') {
      res.writeHead(200, {
        'Content-Type': 'text/javascript; charset=utf-8',
        'Cache-Control': 'no-cache',
      });
      res.end(bundle);
      return;
    }
    if (route !== '/') return send(res, 404, { error: 'NOT_FOUND' });
    res.writeHead(200, { 'Content-Type': 'text/html; charset=utf-8', 'Cache-Control': 'no-cache' });
    res.end(html);
  } catch (e) {
    if (!res.headersSent) send(res, e.status === 413 ? 413 : 500, { error: 'REQUEST_FAILED' });
    else res.end();
  }
});
server.requestTimeout = 15000;
server.headersTimeout = 10000;
server.maxHeadersCount = 50;
server.keepAliveTimeout = 5000;
setInterval(() => {
  db.prepare('DELETE FROM local_sessions WHERE expires<?').run(Date.now());
  for (const [key, value] of authBuckets)
    if (Date.now() - value.start > 60000) authBuckets.delete(key);
}, 60000).unref();
server.listen(port, host, () => console.log(`ACT Forum listening on ${origin}`));
server.on('error', (e) => {
  console.error('Server startup failed:', e.code);
  process.exit(1);
});
for (const signal of ['SIGINT', 'SIGTERM'])
  process.on(signal, () =>
    server.close(() => {
      db.close();
      process.exit(0);
    }),
  );
