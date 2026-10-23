import { DatabaseSync } from 'node:sqlite';
import { mkdir } from 'node:fs/promises';
import { randomBytes, randomUUID, scryptSync } from 'node:crypto';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { initializeDatabase } from '../server/database.mjs';

const password = process.env.FORUM_MODERATOR_PASSWORD;
if (!password || password.length < 10 || password.length > 128)
  throw new Error('Supply FORUM_MODERATOR_PASSWORD (10–128 characters) for this one-time setup.');
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const databasePath = process.env.FORUM_DB_PATH || path.join(root, 'data', 'forum.sqlite');
await mkdir(path.dirname(databasePath), { recursive: true });
const db = new DatabaseSync(databasePath);
try {
  initializeDatabase(db);
  const existing = db.prepare('SELECT id FROM local_users WHERE username=?').get('moderator');
  if (existing) throw new Error('The moderator account already exists; its password was not changed.');
  const salt = randomBytes(16).toString('hex');
  const hash = scryptSync(password, salt, 64).toString('hex');
  db.prepare('INSERT INTO local_users(id,username,salt,hash,created,role) VALUES(?,?,?,?,?,?)')
    .run(randomUUID(), 'moderator', salt, hash, Date.now(), 'moderator');
  console.log('Moderator account created.');
} finally {
  db.close();
}
