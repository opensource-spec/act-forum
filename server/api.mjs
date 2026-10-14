const env = { DB: globalThis.localForumDb };
const getCurrentUser = async () => globalThis.localForumUser();
import { seeds, communities } from '../lib/forum-data';
const dynamic = 'force-dynamic';
const json = (data, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
async function GET() {
  try {
    const user = await getCurrentUser();
    const db = env.DB;
    if (!db) return json({ error: 'Service unavailable' }, 503);
    const [posts, comments, votes, saved, joins, mine] = await Promise.all([
      db
        .prepare(
          'SELECT id,author,community,title,body,created FROM posts ORDER BY created DESC LIMIT 200',
        )
        .all(),
      db
        .prepare('SELECT id,post,author,body,created FROM comments ORDER BY created ASC LIMIT 1000')
        .all(),
      db.prepare('SELECT post,SUM(value) AS score FROM votes GROUP BY post').all(),
      user
        ? db.prepare('SELECT post FROM saved WHERE user=?').bind(user.userId).all()
        : Promise.resolve({ results: [] }),
      user
        ? db.prepare('SELECT community FROM memberships WHERE user=?').bind(user.userId).all()
        : Promise.resolve({ results: [] }),
      user
        ? db.prepare('SELECT post,value FROM votes WHERE user=?').bind(user.userId).all()
        : Promise.resolve({ results: [] }),
    ]);
    return json({
      posts: posts.results,
      comments: comments.results,
      votes: votes.results,
      saved: saved.results,
      joins: joins.results,
      mine: mine.results,
      user: user ? { name: user.displayName } : null,
    });
  } catch {
    return json({ error: 'Could not load discussions' }, 503);
  }
}
async function POST(req) {
  try {
    if (req.headers.get('origin') !== new URL(req.url).origin)
      return json({ error: 'Invalid origin' }, 403);
    const user = await getCurrentUser();
    if (!user) return json({ error: 'Sign in to participate' }, 401);
    if (Number(req.headers.get('content-length') || 0) > 2e4)
      return json({ error: 'Request too large' }, 413);
    const raw = await req.text();
    if (raw.length > 12e3) return json({ error: 'Request too large' }, 413);
    let input;
    try {
      input = JSON.parse(raw);
    } catch {
      return json({ error: 'Invalid request' }, 400);
    }
    if (!input || typeof input !== 'object') return json({ error: 'Invalid request' }, 400);
    const db = env.DB;
    if (!db) return json({ error: 'Service unavailable' }, 503);
    const now = Date.now();
    const delay = input.action === 'post' ? 3e4 : input.action === 'comment' ? 5e3 : 1200;
    const rate = await db
      .prepare(
        'INSERT INTO limits(user,at) VALUES(?,?) ON CONFLICT(user) DO UPDATE SET at=excluded.at WHERE limits.at<=? RETURNING at',
      )
      .bind(user.userId, now, now - delay)
      .first();
    if (!rate) return json({ error: 'Please wait a moment' }, 429);
    const author = user.displayName;
    if (input.action === 'post') {
      if (
        typeof input.title !== 'string' ||
        typeof input.body !== 'string' ||
        !input.title.trim() ||
        input.title.length > 180 ||
        !input.body.trim() ||
        input.body.length > 5e3 ||
        !communities.slice(1).some((c) => c.id === input.community)
      )
        return json({ error: 'Check title, text and community' }, 400);
      await db
        .prepare(
          'INSERT INTO posts(id,author,owner,community,title,body,created) VALUES(?,?,?,?,?,?,?)',
        )
        .bind(
          crypto.randomUUID(),
          author,
          user.userId,
          input.community,
          input.title.trim(),
          input.body.trim(),
          now,
        )
        .run();
      return json({ ok: true });
    }
    if (input.action === 'join') {
      if (!communities.slice(1).some((c) => c.id === input.community))
        return json({ error: 'Invalid community' }, 400);
      if (input.value)
        await db
          .prepare('INSERT OR IGNORE INTO memberships(user,community) VALUES(?,?)')
          .bind(user.userId, input.community)
          .run();
      else
        await db
          .prepare('DELETE FROM memberships WHERE user=? AND community=?')
          .bind(user.userId, input.community)
          .run();
      return json({ ok: true });
    }
    if (input.action === 'delete_comment') {
      if (typeof input.commentId !== 'string') return json({ error: 'Invalid comment' }, 400);
      const com = await db.prepare('SELECT author FROM comments WHERE id=?').bind(input.commentId).first();
      if (!com) return json({ error: 'Comment not found' }, 404);
      if (com.author !== author) return json({ error: 'Unauthorized' }, 403);
      await db.prepare('DELETE FROM comments WHERE id=?').bind(input.commentId).run();
      return json({ ok: true });
    }
    if (typeof input.post !== 'string' || input.post.length > 60)
      return json({ error: 'Invalid post' }, 400);
    if (
      !seeds.some((p) => p.id === input.post) &&
      !(await db.prepare('SELECT id FROM posts WHERE id=?').bind(input.post).first())
    )
      return json({ error: 'Post not found' }, 404);
    if (input.action === 'vote') {
      if (![-1, 0, 1].includes(input.value)) return json({ error: 'Invalid vote' }, 400);
      await db
        .prepare(
          'INSERT INTO votes(user,post,value) VALUES(?,?,?) ON CONFLICT(user,post) DO UPDATE SET value=excluded.value',
        )
        .bind(user.userId, input.post, input.value)
        .run();
    } else if (input.action === 'save') {
      if (input.value)
        await db
          .prepare('INSERT OR IGNORE INTO saved(user,post) VALUES(?,?)')
          .bind(user.userId, input.post)
          .run();
      else
        await db
          .prepare('DELETE FROM saved WHERE user=? AND post=?')
          .bind(user.userId, input.post)
          .run();
    } else if (input.action === 'comment') {
      if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 2e3)
        return json({ error: 'Comment must be between 1 and 2000 characters' }, 400);
      await db
        .prepare('INSERT INTO comments(id,post,author,body,created) VALUES(?,?,?,?,?)')
        .bind(crypto.randomUUID(), input.post, author, input.body.trim(), now)
        .run();
    } else if (input.action === 'report') {
      await db
        .prepare('INSERT OR IGNORE INTO reports(user,post,created) VALUES(?,?,?)')
        .bind(user.userId, input.post, now)
        .run();
    } else if (input.action === 'delete') {
      if (typeof input.post !== 'string') return json({ error: 'Invalid post' }, 400);
      const post = await db.prepare('SELECT owner, author FROM posts WHERE id=?').bind(input.post).first();
      if (!post) return json({ error: 'Post not found' }, 404);
      if (post.owner !== user.userId && post.author !== author) return json({ error: 'Unauthorized' }, 403);

      await db.prepare('DELETE FROM comments WHERE post=?').bind(input.post).run();
      await db.prepare('DELETE FROM votes WHERE post=?').bind(input.post).run();
      await db.prepare('DELETE FROM saved WHERE post=?').bind(input.post).run();
      await db.prepare('DELETE FROM posts WHERE id=?').bind(input.post).run();
    } else {
      return json({ error: 'Unknown action' }, 400);
    }
    return json({ ok: true });
  } catch {
    return json({ error: 'Could not save. Please try again.' }, 500);
  }
}
export { GET, POST, dynamic };