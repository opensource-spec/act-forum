import assert from 'node:assert/strict';
import { beforeEach, afterEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import { DatabaseSync } from 'node:sqlite';
import { buildCommentTree } from '../lib/comment-threads.ts';
import { databaseAdapter, initializeDatabase } from '../server/database.mjs';
import { readRoute, routeURL, uniquePosts } from '../lib/forum-navigation.ts';

const migrations = JSON.parse(await readFile(new URL('../db/migrations.json', import.meta.url), 'utf8'));
let db;
let user;
const alice = { userId: 'alice-id', displayName: 'alice' };
const bob = { userId: 'bob-id', displayName: 'bob' };
const moderator = { userId: 'moderator-id', displayName: 'moderator' };
globalThis.localForumUser = () => user;
const { GET, POST, MODERATION_GET } = await import('../dist/forum-api.mjs');

beforeEach(() => {
  db = new DatabaseSync(':memory:');
  db.exec(`PRAGMA foreign_keys=ON;
    CREATE TABLE local_users(id TEXT PRIMARY KEY,username TEXT UNIQUE,created INTEGER DEFAULT 0);
    CREATE TABLE local_sessions(token TEXT PRIMARY KEY,user TEXT REFERENCES local_users(id),expires INTEGER);`);
  db.prepare('INSERT INTO local_users(id,username) VALUES(?,?)').run(alice.userId, alice.displayName);
  db.prepare('INSERT INTO local_users(id,username) VALUES(?,?)').run(bob.userId, bob.displayName);
  db.exec(migrations[0].sql.replaceAll('--> statement-breakpoint', ''));
  db.prepare('INSERT INTO comments VALUES(?,?,?,?,?)').run('legacy', 'welcome', 'alice', 'Existing comment', 1);
  for (const migration of migrations.slice(1)) db.exec(migration.sql);
  db.prepare("INSERT INTO local_users(id,username,role) VALUES(?,?,'moderator')").run(moderator.userId, moderator.displayName);
  globalThis.localForumDb = databaseAdapter(db);
  user = alice;
});
afterEach(() => db.close());

async function act(input, actor = alice, expected = 200, resetRate = true) {
  user = actor;
  if (resetRate) db.exec('DELETE FROM limits');
  const response = await POST(new Request('http://localhost/api/forum', {
    method: 'POST', headers: { origin: 'http://localhost', 'Content-Type': 'application/json' },
    body: JSON.stringify(input),
  }));
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
async function comment(body, parentId, actor = alice, post = 'welcome') {
  await act({ action: 'comment', post, body, parentId }, actor);
  return db.prepare('SELECT id FROM comments WHERE body=?').get(body).id;
}
async function state(actor = alice) {
  user = actor;
  const response = await GET();
  assert.equal(response.status, 200);
  return response.json();
}

test('migration preserves existing comments and backfills ownership', async () => {
  const old = (await state()).comments.find((c) => c.id === 'legacy');
  assert.equal(old.body, 'Existing comment');
  assert.equal(old.parentId, null);
  assert.equal(old.likes, 0);
  assert.equal(old.canDelete, 1);
  assert.equal(old.deleted, 0);
  await act({ action: 'delete_comment', commentId: 'legacy' });
  assert.equal((await state()).comments.find((c) => c.id === 'legacy').deleted, 1);
});

test('any signed-in user can reply to another user and to a nested reply', async () => {
  const reply = await comment('Bob replies to Alice', 'legacy', bob);
  const nested = await comment('Alice replies to Bob', reply);
  const { comments } = await state();
  assert.equal(comments.find((c) => c.id === reply).parentId, 'legacy');
  assert.equal(comments.find((c) => c.id === nested).parentId, reply);
  const tree = buildCommentTree(comments, 'top');
  assert.equal(tree[0].replies[0].replies[0].id, nested);
  assert.equal(tree[0].replyCount, 2);
});

test('replies reject nonexistent parents, parents from other posts, and malformed content', async () => {
  for (const parentId of ['missing', '', 12, {}])
    await act({ action: 'comment', post: 'welcome', parentId, body: 'Nope' }, alice, 400);
  await act({ action: 'comment', post: 'coding', parentId: 'legacy', body: 'Wrong post' }, alice, 400);
  for (const body of ['', '  ', 'x'.repeat(2001)])
    await act({ action: 'comment', post: 'welcome', body }, alice, 400);
});

test('likes are unique per user, reversible, and included in public counts', async () => {
  await act({ action: 'like_comment', commentId: 'legacy', value: true }, bob);
  await act({ action: 'like_comment', commentId: 'legacy', value: true }, bob);
  await act({ action: 'like_comment', commentId: 'legacy', value: true });
  let item = (await state(bob)).comments[0];
  assert.equal(item.likes, 2);
  assert.equal(item.liked, 1);
  await act({ action: 'like_comment', commentId: 'legacy', value: false }, bob);
  item = (await state(bob)).comments[0];
  assert.equal(item.likes, 1);
  assert.equal(item.liked, 0);
  item = (await state(null)).comments[0];
  assert.equal(item.likes, 1);
  assert.equal(item.liked, 0);
  assert.equal(item.canDelete, 0);
});

test('top sorts roots and replies by likes while preserving their threads; new sorts by time', async () => {
  const second = await comment('Second root');
  const olderReply = await comment('Older reply', 'legacy', bob);
  const newerReply = await comment('Newer reply', 'legacy');
  db.prepare('UPDATE comments SET created=? WHERE id=?').run(2, second);
  db.prepare('UPDATE comments SET created=? WHERE id=?').run(3, olderReply);
  db.prepare('UPDATE comments SET created=? WHERE id=?').run(4, newerReply);
  await act({ action: 'like_comment', commentId: second, value: true }, bob);
  await act({ action: 'like_comment', commentId: olderReply, value: true });
  await act({ action: 'like_comment', commentId: olderReply, value: true }, bob);
  const { comments } = await state();
  const top = buildCommentTree(comments, 'top');
  assert.deepEqual(top.map((c) => c.id), [second, 'legacy']);
  assert.deepEqual(top[1].replies.map((c) => c.id), [olderReply, newerReply]);
  const newest = buildCommentTree(comments, 'new');
  assert.deepEqual(newest.map((c) => c.id), [second, 'legacy']);
  assert.deepEqual(newest[1].replies.map((c) => c.id), [newerReply, olderReply]);
  assert.equal(comments[0].id, 'legacy', 'sorting does not mutate the API array');
});

test('equal likes have stable oldest-first ordering regardless of API order', async () => {
  const second = await comment('Tie breaker');
  const { comments } = await state();
  assert.deepEqual(buildCommentTree(comments.reverse(), 'top').map((c) => c.id), ['legacy', second]);
});

test('deleting a parent hides its content and likes but preserves replies and new replies', async () => {
  const reply = await comment('Keep this reply', 'legacy', bob);
  await act({ action: 'like_comment', commentId: 'legacy', value: true }, bob);
  await act({ action: 'delete_comment', commentId: 'legacy' });
  const { comments } = await state();
  const parent = comments.find((c) => c.id === 'legacy');
  assert.equal(parent.body, '');
  assert.equal(parent.author, '[deleted]');
  assert.equal(parent.likes, 0);
  assert.equal(parent.canDelete, 0);
  assert.equal(comments.find((c) => c.id === reply).parentId, 'legacy');
  await act({ action: 'like_comment', commentId: 'legacy', value: true }, bob, 404);
  await comment('Continue under deleted parent', 'legacy', bob);
});

test('only the owner may delete a comment, even if another account has the same display name', async () => {
  await act({ action: 'delete_comment', commentId: 'legacy' }, bob, 403);
  await act({ action: 'delete_comment', commentId: 'legacy' }, { ...bob, displayName: 'alice' }, 403);
  assert.equal((await state()).comments[0].body, 'Existing comment');
});

test('anonymous writes, invalid likes, and rapid repeated requests are rejected', async () => {
  await act({ action: 'comment', post: 'welcome', body: 'Anonymous' }, null, 401);
  await act({ action: 'like_comment', commentId: 'legacy', value: true }, null, 401);
  await act({ action: 'like_comment', commentId: 'legacy', value: 1 }, alice, 400);
  await act({ action: 'like_comment', commentId: 'missing', value: true }, alice, 404);
  await act({ action: 'like_comment', commentId: 'legacy', value: true });
  await act({ action: 'like_comment', commentId: 'legacy', value: false }, alice, 429, false);
});

test('deleting a post removes its entire thread and comment likes', async () => {
  await act({ action: 'post', community: 'general', title: 'A new post', body: 'Body' });
  const post = db.prepare('SELECT id FROM posts').get().id;
  const root = await comment('Post comment', undefined, alice, post);
  const reply = await comment('Post reply', root, bob, post);
  await act({ action: 'like_comment', commentId: reply, value: true });
  await act({ action: 'delete', post });
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM comments WHERE post=?').get(post).count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM comment_likes').get().count, 0);
  assert.equal(db.prepare('SELECT COUNT(*) AS count FROM comments WHERE id=?').get('legacy').count, 1);
});

test('threads are not cut off at the old 1000-comment limit', async () => {
  const insert = db.prepare('INSERT INTO comments(id,post,author,body,created,parent,owner) VALUES(?,?,?,?,?,?,?)');
  for (let i = 0; i < 1005; i++) insert.run(`many-${i}`, 'welcome', 'bob', `Reply ${i}`, i + 2, 'legacy', bob.userId);
  const { comments } = await state();
  assert.equal(comments.length, 1006);
  assert.equal(buildCommentTree(comments, 'top')[0].replies.length, 1005);
});

test('moderation endpoints and actions reject members and forged role fields', async () => {
  user = null;
  assert.equal((await MODERATION_GET()).status, 401);
  user = { ...alice, role: 'moderator' };
  assert.equal((await MODERATION_GET()).status, 403);
  for (const input of [
    { action: 'mod_ban', userId: bob.userId, value: true },
    { action: 'mod_delete_user', userId: bob.userId },
    { action: 'mod_lock', post: 'welcome', value: true },
    { action: 'mod_pin', post: 'welcome', value: true },
    { action: 'mod_dismiss_reports', post: 'welcome' },
  ]) await act({ ...input, role: 'moderator' }, { ...alice, role: 'moderator' }, 403);
});

test('moderators can remove another user comment without losing replies', async () => {
  const reply = await comment('Keep Bob reply', 'legacy', bob);
  assert.equal((await state(moderator)).comments[0].canDelete, 1);
  await act({ action: 'delete_comment', commentId: 'legacy' }, moderator);
  const comments = (await state()).comments;
  assert.equal(comments.find((c) => c.id === 'legacy').deleted, 1);
  assert.equal(comments.find((c) => c.id === reply).body, 'Keep Bob reply');
  assert.equal(db.prepare('SELECT action FROM moderation_log').get().action, 'delete_comment');
});

test('moderators can delete user posts and starter posts, which stay removed', async () => {
  const { post } = await act({ action: 'post', community: 'tech', title: 'Member post', body: 'Content' });
  await act({ action: 'delete', post }, bob, 403);
  assert.equal((await state(moderator)).posts.find((p) => p.id === post).canDelete, 1);
  await act({ action: 'delete', post }, moderator);
  assert.ok(!(await state()).posts.some((p) => p.id === post));
  await act({ action: 'delete', post: 'welcome' }, moderator);
  assert.equal((await state()).controls.find((p) => p.post === 'welcome').removed, 1);
  await act({ action: 'comment', post: 'welcome', body: 'Cannot resurrect it' }, alice, 404);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM moderation_log').get().n, 2);
});

test('ban revokes sessions, blocks all participation, and unban restores access', async () => {
  db.prepare('INSERT INTO local_sessions VALUES(?,?,?)').run('alice-session', alice.userId, Date.now() + 100000);
  await act({ action: 'mod_ban', userId: alice.userId, value: true, reason: 'Repeated spam' }, moderator);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM local_sessions WHERE user=?').get(alice.userId).n, 0);
  for (const input of [
    { action: 'post', community: 'tech', title: 'No', body: 'No' },
    { action: 'comment', post: 'welcome', body: 'No' },
    { action: 'like_comment', commentId: 'legacy', value: true },
  ]) await act(input, alice, 403);
  assert.equal((await state()).user, null);
  await act({ action: 'mod_ban', userId: alice.userId, value: false }, moderator);
  assert.equal((await state()).user.name, 'alice');
  await comment('Back after unban');
});

test('account deletion removes login data and anonymizes contributions without granting ownership', async () => {
  const { post } = await act({ action: 'post', community: 'tech', title: 'Keep post', body: 'Keep content' });
  db.prepare('INSERT INTO local_sessions VALUES(?,?,?)').run('alice-session', alice.userId, Date.now() + 100000);
  await act({ action: 'like_comment', commentId: 'legacy', value: true });
  await act({ action: 'mod_delete_user', userId: alice.userId }, moderator);
  assert.equal(db.prepare('SELECT id FROM local_users WHERE id=?').get(alice.userId), undefined);
  assert.equal(db.prepare('SELECT COUNT(*) AS n FROM local_sessions WHERE user=?').get(alice.userId).n, 0);
  const data = await state(bob);
  assert.equal(data.posts.find((p) => p.id === post).author, '[deleted]');
  assert.equal(data.posts.find((p) => p.id === post).canDelete, 0);
  assert.equal(data.comments[0].body, 'Existing comment');
  assert.equal(data.comments[0].author, '[deleted]');
  assert.equal(data.comments[0].canDelete, 0);
  assert.equal(data.comments[0].likes, 0);
  await act({ action: 'comment', post: 'welcome', body: 'Deleted account' }, alice, 401);
});

test('moderator accounts are protected against ban and deletion', async () => {
  await act({ action: 'mod_ban', userId: moderator.userId, value: true }, moderator, 403);
  await act({ action: 'mod_delete_user', userId: moderator.userId }, moderator, 403);
});

test('locking rejects member comments and replies while keeping reading and moderator replies available', async () => {
  await act({ action: 'mod_lock', post: 'welcome', value: true }, moderator);
  for (const parentId of [undefined, 'legacy'])
    await act({ action: 'comment', post: 'welcome', parentId, body: 'Blocked' }, alice, 403);
  await comment('Moderator notice', undefined, moderator);
  assert.equal((await state(null)).controls.find((c) => c.post === 'welcome').locked, 1);
  await act({ action: 'mod_lock', post: 'welcome', value: false }, moderator);
  await comment('Discussion reopened');
});

test('pinning and unpinning work for both starter and user posts', async () => {
  const { post } = await act({ action: 'post', community: 'tech', title: 'Pinned later', body: 'Content' });
  for (const id of [post, 'coding']) {
    await act({ action: 'mod_pin', post: id, value: true }, moderator);
    assert.equal((await state()).controls.find((p) => p.post === id).pinned, 1);
    await act({ action: 'mod_pin', post: id, value: false }, moderator);
    assert.equal((await state()).controls.find((p) => p.post === id).pinned, 0);
  }
});

test('report queue and audit data are moderator-only and reports can be dismissed', async () => {
  await act({ action: 'report', post: 'welcome' }, bob);
  await act({ action: 'report', post: 'welcome' }, alice);
  user = moderator;
  let response = await MODERATION_GET();
  let data = await response.json();
  assert.equal(data.reports[0].count, 2);
  assert.equal(data.users.length, 3);
  assert.ok(data.users.every((u) => !('hash' in u) && !('salt' in u)));
  await act({ action: 'mod_dismiss_reports', post: 'welcome' }, moderator);
  data = await (await MODERATION_GET()).json();
  assert.equal(data.reports.length, 0);
  assert.equal(data.log[0].action, 'dismiss_reports');
});

test('all discussions remain available beyond the old 200-post limit', async () => {
  const insert = db.prepare('INSERT INTO posts(id,author,owner,community,title,body,created) VALUES(?,?,?,?,?,?,?)');
  for (let i = 0; i < 205; i++) insert.run(`post-${i}`, 'alice', alice.userId, 'tech', `Post ${i}`, 'Content', i);
  assert.equal((await state()).posts.length, 205);
});

test('navigation preserves the selected post across reloads and uses one entry per post ID', () => {
  const route = { view: 'discussions', community: 'tech', post: 'post-123' };
  assert.deepEqual(readRoute(new URL(routeURL(route), 'http://localhost').search), route);
  assert.deepEqual(readRoute('?view=unknown&community=../invalid'), { view: 'home', community: 'all', post: null });
  assert.deepEqual(readRoute('?view=communities'), { view: 'communities', community: 'all', post: null });
  assert.equal(readRoute('?community=chess-club').community, 'chess-club');
  assert.equal(readRoute('?post=welcome').post, 'welcome');
  assert.deepEqual(uniquePosts([{ id: 'a', title: 'Old' }, { id: 'b', title: 'Other' }, { id: 'a', title: 'New' }]),
    [{ id: 'a', title: 'New' }, { id: 'b', title: 'Other' }]);
});

test('database initialization applies migrations once and preserves existing data on restart', () => {
  const fresh = new DatabaseSync(':memory:');
  try {
    initializeDatabase(fresh);
    fresh.prepare('INSERT INTO local_users(id,username,salt,hash,created,role) VALUES(?,?,?,?,?,?)')
      .run('persisted', 'persisted', 'salt', 'hash', 1, 'moderator');
    initializeDatabase(fresh);
    assert.equal(fresh.prepare('SELECT COUNT(*) AS n FROM local_migrations').get().n, migrations.length);
    assert.equal(fresh.prepare('SELECT role FROM local_users WHERE id=?').get('persisted').role, 'moderator');
  } finally { fresh.close(); }
});

const communityDraft = { action: 'create_community', id: 'chess-club', en: 'Chess club', hy: 'Շախմատի ակումբ', description: 'Play chess together.' };

test('community approval controls visibility, joining and posting, and automatically joins the creator', async () => {
  await act({ ...communityDraft, status: 'approved' });
  assert.equal((await state()).submissions[0].status, 'pending');
  for (const actor of [null, bob]) {
    const visible = await state(actor);
    assert.equal(visible.communities.some((c) => c.id === communityDraft.id), false);
    assert.equal(visible.submissions.length, 0);
  }
  await act({ action: 'join', community: communityDraft.id, value: true }, bob, 400);
  await act({ action: 'post', community: communityDraft.id, title: 'Hello', body: 'First post' }, alice, 400);
  await act({ action: 'mod_review_community', community: communityDraft.id, status: 'approved' }, alice, 403);
  user = moderator;
  assert.equal((await (await MODERATION_GET()).json()).pendingCommunities[0].id, communityDraft.id);
  await act({ action: 'mod_review_community', community: communityDraft.id, status: 'approved', reason: 'Thanks for your request.' }, moderator);
  const published = (await state(null)).communities.find((c) => c.id === communityDraft.id);
  assert.ok(published);
  assert.equal('reason' in published, false, 'private review feedback is only shared with the creator and moderators');
  assert.ok((await state()).joins.some((j) => j.community === communityDraft.id));
  await act({ action: 'join', community: communityDraft.id, value: true }, bob);
  await act({ action: 'post', community: communityDraft.id, title: 'Hello', body: 'First post' }, bob);
  await act({ action: 'join', community: communityDraft.id, value: false }, bob);
  assert.equal((await state(bob)).joins.length, 0);
  assert.ok((await state()).posts.some((p) => p.community === communityDraft.id));
  await act({ action: 'mod_review_community', community: communityDraft.id, status: 'rejected' }, moderator, 409);
  assert.equal(db.prepare("SELECT COUNT(*) AS n FROM moderation_log WHERE action='approve_community'").get().n, 1);
});

test('rejected communities remain private with feedback, including moderator submissions', async () => {
  await act(communityDraft, moderator);
  assert.equal((await state(moderator)).submissions[0].status, 'pending');
  await act({ action: 'mod_review_community', community: communityDraft.id, status: 'rejected', reason: 'Please describe the purpose.' }, moderator);
  const own = (await state(moderator)).submissions[0];
  assert.equal(own.status, 'rejected');
  assert.equal(own.reason, 'Please describe the purpose.');
  assert.equal((await state()).communities.some((c) => c.id === communityDraft.id), false);
  await act({ action: 'join', community: communityDraft.id, value: true }, moderator, 400);
});

test('community submissions validate input, prevent duplicates and require an active account', async () => {
  await act(communityDraft, null, 401);
  await act({ ...communityDraft, id: 'general' }, alice, 409);
  await act({ ...communityDraft, id: 'all' }, alice, 409);
  for (const patch of [{ id: '../x' }, { id: 'a' }, { id: 'A-club' }, { en: '', hy: '' }, { en: 'x'.repeat(81) }, { description: '' }])
    await act({ ...communityDraft, ...patch }, alice, 400);
  await act({ ...communityDraft, en: '' });
  assert.equal((await state()).submissions[0].en, communityDraft.hy);
  await act({ ...communityDraft, id: 'another-club' }, alice, 429, false);
  await act(communityDraft, bob, 409);
  await act({ action: 'mod_ban', userId: alice.userId, value: true }, moderator);
  await act({ ...communityDraft, id: 'blocked-club' }, alice, 403);
});

test('deleting a community creator preserves the community and existing memberships', async () => {
  await act(communityDraft);
  await act({ action: 'mod_review_community', community: communityDraft.id, status: 'approved' }, moderator);
  await act({ action: 'join', community: communityDraft.id, value: true }, bob);
  await act({ action: 'mod_delete_user', userId: alice.userId }, moderator);
  assert.equal(db.prepare('SELECT creator FROM communities WHERE id=?').get(communityDraft.id).creator, null);
  const result = await state(bob);
  assert.ok(result.communities.some((c) => c.id === communityDraft.id));
  assert.ok(result.joins.some((j) => j.community === communityDraft.id));
});
