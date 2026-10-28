import { seeds, communities } from '../lib/forum-data';

const dynamic = 'force-dynamic';
const json = (data, status = 200) =>
  Response.json(data, { status, headers: { 'Cache-Control': 'no-store' } });
const communityFields = 'id,name_en AS en,name_hy AS hy,description,status,reason,created';
async function publishedCommunity(db, id) {
  if (typeof id !== 'string') return false;
  return communities.slice(1).some((c) => c.id === id) || Boolean(await db.prepare(
    "SELECT id FROM communities WHERE id=? AND status='approved'",
  ).bind(id).first());
}
async function getActor(db) {
  const session = globalThis.localForumUser();
  if (!session) return null;
  // Permissions always come from the database, never a request or a cached role.
  return db.prepare('SELECT id AS userId,username AS displayName,role,banned,avatar_version FROM local_users WHERE id=?')
    .bind(session.userId).first();
}

async function GET() {
  try {
    const db = globalThis.localForumDb;
    if (!db) return json({ error: 'Service unavailable' }, 503);
    const actor = await getActor(db);
    const user = actor && !actor.banned ? actor : null;
    const moderator = user?.role === 'moderator';
    const [posts, comments, votes, saved, joins, mine, controls, published, submissions] = await Promise.all([
      db.prepare(`SELECT p.id,p.author,p.community,p.title,p.body,p.created,
        CASE WHEN p.owner=? OR ?=1 THEN 1 ELSE 0 END AS canDelete
        FROM posts p LEFT JOIN post_controls pc ON pc.post=p.id
        WHERE COALESCE(pc.removed,0)=0 ORDER BY p.created DESC,p.id ASC`)
        .bind(user?.userId || null, Number(moderator)).all(),
      db.prepare(`SELECT c.id,c.post,c.parent AS parentId,c.author,c.body,c.created,c.deleted,
        COUNT(l.user) AS likes,MAX(CASE WHEN l.user=? THEN 1 ELSE 0 END) AS liked,
        CASE WHEN c.deleted=0 AND (c.owner=? OR ?=1) THEN 1 ELSE 0 END AS canDelete
        FROM comments c LEFT JOIN comment_likes l ON l.comment=c.id
        LEFT JOIN post_controls pc ON pc.post=c.post
        WHERE COALESCE(pc.removed,0)=0 AND (c.post IN (SELECT id FROM posts)
          OR c.post IN (${seeds.map(() => '?').join(',')}))
        GROUP BY c.id ORDER BY c.created ASC,c.id ASC`)
        .bind(user?.userId || null, user?.userId || null, Number(moderator), ...seeds.map((p) => p.id)).all(),
      db.prepare('SELECT post,SUM(value) AS score FROM votes GROUP BY post').all(),
      user ? db.prepare('SELECT post FROM saved WHERE user=?').bind(user.userId).all() : { results: [] },
      user ? db.prepare('SELECT community FROM memberships WHERE user=?').bind(user.userId).all() : { results: [] },
      user ? db.prepare('SELECT post,value FROM votes WHERE user=?').bind(user.userId).all() : { results: [] },
      db.prepare('SELECT post,removed,locked,pinned FROM post_controls').all(),
      db.prepare("SELECT id,name_en AS en,name_hy AS hy,description FROM communities WHERE status='approved' ORDER BY created DESC,id").all(),
      user ? db.prepare(`SELECT ${communityFields} FROM communities WHERE creator=? ORDER BY created DESC,id`)
        .bind(user.userId).all() : { results: [] },
    ]);
    return json({ posts: posts.results, comments: comments.results, votes: votes.results,
      saved: saved.results, joins: joins.results, mine: mine.results, controls: controls.results,
      communities: [...communities, ...published.results.map((c) => ({ ...c, symbol: '◎' }))],
      submissions: submissions.results,
      user: user ? { name: user.displayName, role: user.role,
        avatar: user.avatar_version ? `/api/avatars/${user.userId}?v=${user.avatar_version}` : null } : null });
  } catch {
    return json({ error: 'Could not load discussions' }, 503);
  }
}

async function MODERATION_GET() {
  try {
    const db = globalThis.localForumDb;
    const user = await getActor(db);
    if (!user) return json({ error: 'Sign in to participate' }, 401);
    if (user.banned || user.role !== 'moderator') return json({ error: 'Moderator access required' }, 403);
    const [users, reports, log, pendingCommunities] = await Promise.all([
      db.prepare(`SELECT u.id,u.username,u.role,u.banned,u.ban_reason AS banReason,u.created,
        (SELECT COUNT(*) FROM posts p WHERE p.owner=u.id) AS posts,
        (SELECT COUNT(*) FROM comments c WHERE c.owner=u.id AND c.deleted=0) AS comments
        FROM local_users u ORDER BY u.created DESC,u.username ASC`).all(),
      db.prepare(`SELECT r.post,p.title,COUNT(*) AS count,MAX(r.created) AS created
        FROM reports r LEFT JOIN posts p ON p.id=r.post GROUP BY r.post ORDER BY created DESC`).all(),
      db.prepare('SELECT id,moderator,action,target,reason,created FROM moderation_log ORDER BY created DESC LIMIT 100').all(),
      db.prepare(`SELECT c.id,c.name_en AS en,c.name_hy AS hy,c.description,c.created,
        COALESCE(u.username,'[deleted]') AS author FROM communities c LEFT JOIN local_users u ON u.id=c.creator
        WHERE c.status='pending' ORDER BY c.created ASC,c.id`).all(),
    ]);
    return json({ users: users.results, reports: reports.results.map((report) => ({
      ...report, title: report.title || seeds.find((p) => p.id === report.post)?.title || report.post,
    })), log: log.results, pendingCommunities: pendingCommunities.results });
  } catch {
    return json({ error: 'Could not load moderation' }, 503);
  }
}

async function POST(req) {
  try {
    if (req.headers.get('origin') !== new URL(req.url).origin) return json({ error: 'Invalid origin' }, 403);
    const db = globalThis.localForumDb;
    if (!db) return json({ error: 'Service unavailable' }, 503);
    const user = await getActor(db);
    if (!user) return json({ error: 'Sign in to participate' }, 401);
    if (user.banned) return json({ error: 'ACCOUNT_BANNED' }, 403);
    const moderator = user.role === 'moderator';
    if (Number(req.headers.get('content-length') || 0) > 2e4) return json({ error: 'Request too large' }, 413);
    const raw = await req.text();
    if (raw.length > 12e3) return json({ error: 'Request too large' }, 413);
    let input;
    try { input = JSON.parse(raw); } catch { return json({ error: 'Invalid request' }, 400); }
    if (!input || typeof input !== 'object' || typeof input.action !== 'string')
      return json({ error: 'Invalid request' }, 400);
    if (input.action.startsWith('mod_') && !moderator) return json({ error: 'Moderator access required' }, 403);
    const now = Date.now();
    const delay = ['post', 'create_community'].includes(input.action) ? 3e4 : input.action === 'comment' ? 5e3 : 1200;
    const rate = await db.prepare(`INSERT INTO limits(user,at) VALUES(?,?) ON CONFLICT(user)
      DO UPDATE SET at=excluded.at WHERE limits.at<=? RETURNING at`)
      .bind(user.userId, now, now - delay).first();
    if (!rate) return json({ error: 'Please wait a moment' }, 429);
    const audit = (action, target, reason = '') => db.prepare(
      'INSERT INTO moderation_log(id,moderator,action,target,reason,created) VALUES(?,?,?,?,?,?)',
    ).bind(crypto.randomUUID(), user.displayName, action, target, reason, now);

    if (input.action === 'create_community') {
      const { id, en, hy, description } = input;
      if (typeof id !== 'string' || !/^[a-z0-9][a-z0-9-]{2,39}$/.test(id) ||
        typeof en !== 'string' || typeof hy !== 'string' || (!en.trim() && !hy.trim()) ||
        en.length > 80 || hy.length > 80 || typeof description !== 'string' ||
        !description.trim() || description.length > 1000)
        return json({ error: 'INVALID_COMMUNITY' }, 400);
      if (communities.some((c) => c.id === id)) return json({ error: 'COMMUNITY_EXISTS' }, 409);
      const result = await db.prepare(`INSERT INTO communities(id,name_en,name_hy,description,creator,created)
        VALUES(?,?,?,?,?,?) ON CONFLICT(id) DO NOTHING RETURNING id`)
        .bind(id, en.trim() || hy.trim(), hy.trim() || en.trim(), description.trim(), user.userId, now).first();
      if (!result) return json({ error: 'COMMUNITY_EXISTS' }, 409);
      return json({ ok: true, community: id });
    }
    if (input.action === 'mod_review_community') {
      if (typeof input.community !== 'string' || !['approved', 'rejected'].includes(input.status) ||
        (input.reason !== undefined && (typeof input.reason !== 'string' || input.reason.length > 500)))
        return json({ error: 'INVALID_COMMUNITY' }, 400);
      const target = await db.prepare("SELECT id,creator FROM communities WHERE id=? AND status='pending'")
        .bind(input.community).first();
      if (!target) return json({ error: 'COMMUNITY_NOT_PENDING' }, 409);
      await db.batch([
        db.prepare("UPDATE communities SET status=?,reason=? WHERE id=? AND status='pending'")
          .bind(input.status, input.reason?.trim() || '', target.id),
        ...(input.status === 'approved' && target.creator ? [db.prepare(
          'INSERT OR IGNORE INTO memberships(user,community) VALUES(?,?)').bind(target.creator, target.id)] : []),
        audit(input.status === 'approved' ? 'approve_community' : 'reject_community', target.id, input.reason?.trim() || ''),
      ]);
      return json({ ok: true });
    }
    if (input.action === 'mod_ban' || input.action === 'mod_delete_user') {
      if (typeof input.userId !== 'string') return json({ error: 'Invalid user' }, 400);
      const target = await db.prepare('SELECT id,username,role FROM local_users WHERE id=?').bind(input.userId).first();
      if (!target) return json({ error: 'User not found' }, 404);
      if (target.role === 'moderator' || target.id === user.userId)
        return json({ error: 'Moderator accounts are protected' }, 403);
      if (input.action === 'mod_ban') {
        if (typeof input.value !== 'boolean' || (input.reason !== undefined &&
          (typeof input.reason !== 'string' || input.reason.length > 500)))
          return json({ error: 'Invalid ban' }, 400);
        const reason = input.reason?.trim() || '';
        await db.batch([
          db.prepare('UPDATE local_users SET banned=?,ban_reason=? WHERE id=?').bind(Number(input.value), input.value ? reason : '', target.id),
          db.prepare('DELETE FROM local_sessions WHERE user=?').bind(target.id),
          audit(input.value ? 'ban_user' : 'unban_user', target.username, reason),
        ]);
      } else {
        await db.batch([
          db.prepare('DELETE FROM local_sessions WHERE user=?').bind(target.id),
          ...['memberships', 'saved', 'votes', 'comment_likes', 'reports', 'limits'].map((table) =>
            db.prepare(`DELETE FROM ${table} WHERE user=?`).bind(target.id)),
          db.prepare("UPDATE posts SET author='[deleted]',owner='' WHERE owner=?").bind(target.id),
          db.prepare("UPDATE comments SET author='[deleted]',owner=NULL WHERE owner=?").bind(target.id),
          db.prepare('DELETE FROM local_users WHERE id=?').bind(target.id),
          audit('delete_user', target.username),
        ]);
      }
      return json({ ok: true });
    }
    if (input.action === 'post') {
      if (typeof input.title !== 'string' || typeof input.body !== 'string' || !input.title.trim() ||
        input.title.length > 180 || !input.body.trim() || input.body.length > 5000 ||
        !await publishedCommunity(db, input.community))
        return json({ error: 'Check title, text and community' }, 400);
      const id = crypto.randomUUID();
      await db.prepare('INSERT INTO posts(id,author,owner,community,title,body,created) VALUES(?,?,?,?,?,?,?)')
        .bind(id, user.displayName, user.userId, input.community, input.title.trim(), input.body.trim(), now).run();
      return json({ ok: true, post: id });
    }
    if (input.action === 'join') {
      if (typeof input.value !== 'boolean' || !await publishedCommunity(db, input.community)) return json({ error: 'Invalid community' }, 400);
      await db.prepare(input.value ? 'INSERT OR IGNORE INTO memberships(user,community) VALUES(?,?)' :
        'DELETE FROM memberships WHERE user=? AND community=?').bind(user.userId, input.community).run();
      return json({ ok: true });
    }
    if (input.action === 'delete_comment' || input.action === 'like_comment') {
      if (typeof input.commentId !== 'string') return json({ error: 'Invalid comment' }, 400);
      const comment = await db.prepare('SELECT owner,deleted FROM comments WHERE id=?').bind(input.commentId).first();
      if (!comment || comment.deleted) return json({ error: 'Comment not found' }, 404);
      if (input.action === 'delete_comment') {
        if (comment.owner !== user.userId && !moderator) return json({ error: 'Unauthorized' }, 403);
        await db.batch([
          db.prepare("UPDATE comments SET body='',author='[deleted]',owner=NULL,deleted=1 WHERE id=?").bind(input.commentId),
          db.prepare('DELETE FROM comment_likes WHERE comment=?').bind(input.commentId),
          ...(moderator ? [audit('delete_comment', input.commentId)] : []),
        ]);
      } else {
        if (typeof input.value !== 'boolean') return json({ error: 'Invalid comment like' }, 400);
        await db.prepare(input.value ? 'INSERT OR IGNORE INTO comment_likes(user,comment) VALUES(?,?)' :
          'DELETE FROM comment_likes WHERE user=? AND comment=?').bind(user.userId, input.commentId).run();
      }
      return json({ ok: true });
    }
    if (typeof input.post !== 'string' || !input.post || input.post.length > 60) return json({ error: 'Invalid post' }, 400);
    const post = await db.prepare('SELECT owner FROM posts WHERE id=?').bind(input.post).first();
    const seed = seeds.some((p) => p.id === input.post);
    const control = await db.prepare('SELECT removed,locked FROM post_controls WHERE post=?').bind(input.post).first();
    if ((!post && !seed) || control?.removed) return json({ error: 'Post not found' }, 404);

    if (input.action === 'mod_lock' || input.action === 'mod_pin') {
      if (typeof input.value !== 'boolean') return json({ error: 'Invalid setting' }, 400);
      const column = input.action === 'mod_lock' ? 'locked' : 'pinned';
      await db.batch([
        db.prepare(`INSERT INTO post_controls(post,${column}) VALUES(?,?) ON CONFLICT(post) DO UPDATE SET ${column}=excluded.${column}`)
          .bind(input.post, Number(input.value)),
        audit(input.action === 'mod_lock' ? input.value ? 'lock_post' : 'unlock_post' : input.value ? 'pin_post' : 'unpin_post', input.post),
      ]);
    } else if (input.action === 'mod_dismiss_reports') {
      await db.batch([db.prepare('DELETE FROM reports WHERE post=?').bind(input.post), audit('dismiss_reports', input.post)]);
    } else if (input.action === 'vote') {
      if (![-1, 0, 1].includes(input.value)) return json({ error: 'Invalid vote' }, 400);
      await db.prepare('INSERT INTO votes(user,post,value) VALUES(?,?,?) ON CONFLICT(user,post) DO UPDATE SET value=excluded.value')
        .bind(user.userId, input.post, input.value).run();
    } else if (input.action === 'save') {
      await db.prepare(input.value ? 'INSERT OR IGNORE INTO saved(user,post) VALUES(?,?)' :
        'DELETE FROM saved WHERE user=? AND post=?').bind(user.userId, input.post).run();
    } else if (input.action === 'comment') {
      if (control?.locked && !moderator) return json({ error: 'DISCUSSION_LOCKED' }, 403);
      if (typeof input.body !== 'string' || !input.body.trim() || input.body.length > 2000)
        return json({ error: 'Comment must be between 1 and 2000 characters' }, 400);
      const parentId = input.parentId ?? null;
      if (parentId !== null) {
        if (typeof parentId !== 'string' || !parentId || parentId.length > 60) return json({ error: 'Invalid parent comment' }, 400);
        const parent = await db.prepare('SELECT post FROM comments WHERE id=?').bind(parentId).first();
        if (!parent || parent.post !== input.post) return json({ error: 'Reply must belong to a comment on this post' }, 400);
      }
      await db.prepare('INSERT INTO comments(id,post,author,body,created,parent,owner) VALUES(?,?,?,?,?,?,?)')
        .bind(crypto.randomUUID(), input.post, user.displayName, input.body.trim(), now, parentId, user.userId).run();
    } else if (input.action === 'report') {
      await db.prepare('INSERT OR IGNORE INTO reports(user,post,created) VALUES(?,?,?)').bind(user.userId, input.post, now).run();
    } else if (input.action === 'delete') {
      if (!moderator && (!post || post.owner !== user.userId)) return json({ error: 'Unauthorized' }, 403);
      await db.batch([
        ...['comments', 'votes', 'saved', 'reports'].map((table) => db.prepare(`DELETE FROM ${table} WHERE post=?`).bind(input.post)),
        db.prepare('DELETE FROM posts WHERE id=?').bind(input.post),
        db.prepare('INSERT INTO post_controls(post,removed) VALUES(?,1) ON CONFLICT(post) DO UPDATE SET removed=1').bind(input.post),
        ...(moderator ? [audit('delete_post', input.post)] : []),
      ]);
    } else return json({ error: 'Unknown action' }, 400);
    return json({ ok: true });
  } catch {
    return json({ error: 'Could not save. Please try again.' }, 500);
  }
}
export { GET, POST, MODERATION_GET, dynamic };
