import { useMemo, useState } from 'react';
import { ArrowUp, ChevronDown, ChevronRight, MessageCircle, Send, Trash2 } from 'lucide-react';
import { buildCommentTree, type CommentSort, type CommentThread, type ForumComment } from '../lib/comment-threads';
import { copy, type Lang } from '../lib/forum-copy';

export type CommentAction =
  | { action: 'comment'; post: string; body: string; parentId?: string }
  | { action: 'like_comment'; commentId: string; value: boolean }
  | { action: 'delete_comment'; commentId: string };

type Props = {
  postId: string;
  postAuthor: string;
  comments: ForumComment[];
  user: { name: string } | null;
  lang: Lang;
  busy: boolean;
  locked?: boolean;
  onAction: (action: CommentAction) => Promise<boolean>;
  onSignIn: () => void;
};

function Composer({ lang, busy, label, reply = false, onSubmit, onCancel }: {
  lang: Lang;
  busy: boolean;
  label: string;
  reply?: boolean;
  onSubmit: (body: string) => Promise<boolean>;
  onCancel?: () => void;
}) {
  const [body, setBody] = useState('');
  const t = copy[lang];
  return (
    <form className="comment-composer" onSubmit={async (event) => {
      event.preventDefault();
      if (body.trim() && await onSubmit(body)) setBody('');
    }}>
      <label className="composer-label">
        {label}
        <textarea required maxLength={2000} value={body} autoFocus={reply}
          placeholder={reply ? t.replyPlaceholder : t.comment}
          onChange={(event) => setBody(event.target.value)} />
      </label>
      <div className="composer-actions">
        <small>{body.length}/2000</small>
        {onCancel && <button type="button" disabled={busy} onClick={onCancel}>{t.cancel}</button>}
        <button className="primary" disabled={busy || !body.trim()}>
          <Send size={14} />{reply ? t.reply : t.send}
        </button>
      </div>
    </form>
  );
}

function Thread({ node, depth = 0, ...props }: Omit<Props, 'comments'> & { node: CommentThread; depth?: number }) {
  const [collapsed, setCollapsed] = useState(false);
  const [replying, setReplying] = useState(false);
  const t = copy[props.lang];
  const name = node.deleted ? t.deletedAuthor : `u/${node.author}`;
  const date = new Date(node.created);
  return (
    <li className={'comment-thread' + (depth >= 4 ? ' thread-deep' : '')}>
      <article className={'comment' + (collapsed ? ' comment-collapsed' : '')} aria-label={`${t.commentBy} ${name}`}>
        <div className="comment-heading">
          <button className="thread-toggle" aria-expanded={!collapsed}
            aria-controls={`comment-content-${node.id}`}
            aria-label={`${collapsed ? t.expandThread : t.collapseThread}: ${name}`}
            onClick={() => setCollapsed(!collapsed)}>
            {collapsed ? <ChevronRight size={15} /> : <ChevronDown size={15} />}
          </button>
          <span className="comment-avatar" aria-hidden="true">{node.deleted ? '–' : node.author[0]?.toUpperCase()}</span>
          <b>{name}</b>
          {!node.deleted && node.author === props.postAuthor && <span className="op-badge">{t.originalPoster}</span>}
          <span className="dot">·</span>
          <time dateTime={date.toISOString()} title={date.toLocaleString(props.lang === 'hy' ? 'hy-AM' : 'en-US')}>
            {date.toLocaleDateString(props.lang === 'hy' ? 'hy-AM' : 'en-US', { month: 'short', day: 'numeric' })}
          </time>
          {collapsed && <span className="collapsed-count">{node.replyCount} {t.replies}</span>}
        </div>
        <div id={`comment-content-${node.id}`} hidden={collapsed}>
          <p className={'comment-body' + (node.deleted ? ' deleted-comment' : '')}>
            {node.deleted ? t.deletedComment : node.body}
          </p>
          <div className="comment-actions">
            {!node.deleted && <button className={'comment-like' + (node.liked ? ' liked' : '')}
              aria-label={node.liked ? t.unlikeComment : t.likeComment} aria-pressed={Boolean(node.liked)}
              disabled={props.busy}
              onClick={() => props.onAction({ action: 'like_comment', commentId: node.id, value: !node.liked })}>
              <ArrowUp size={16} /><span>{node.likes}</span><span>{t.likes}</span>
            </button>}
            <button disabled={props.busy || props.locked} aria-expanded={replying} onClick={() => {
              if (!props.user) props.onSignIn();
              else setReplying(!replying);
            }}><MessageCircle size={15} />{t.reply}</button>
            {Boolean(node.canDelete) && <button disabled={props.busy} aria-label={t.deleteComment}
              onClick={async () => {
                if (confirm(t.confirmDeleteComment)) await props.onAction({ action: 'delete_comment', commentId: node.id });
              }}><Trash2 size={14} /><span>{t.delete}</span></button>}
          </div>
          {replying && props.user && !props.locked && <Composer lang={props.lang} busy={props.busy} reply
            label={`${t.replyingTo} ${name}`} onCancel={() => setReplying(false)}
            onSubmit={async (body) => {
              const saved = await props.onAction({ action: 'comment', post: props.postId, parentId: node.id, body });
              if (saved) setReplying(false);
              return saved;
            }} />}
          {node.replies.length > 0 && <ol className="comment-replies">
            {node.replies.map((child) => <Thread key={child.id} node={child} depth={depth + 1} {...props} />)}
          </ol>}
        </div>
      </article>
    </li>
  );
}

export default function Comments(props: Props) {
  const [sort, setSort] = useState<CommentSort>('top');
  const t = copy[props.lang];
  const comments = useMemo(() => props.comments.filter((c) => c.post === props.postId), [props.comments, props.postId]);
  const threads = useMemo(() => buildCommentTree(comments, sort), [comments, sort]);
  return (
    <section className="comments-panel" aria-labelledby="comments-title">
      <div className="comments-header">
        <h3 id="comments-title">{t.comments}<span>{comments.filter((c) => !c.deleted).length}</span></h3>
        <span className="discussion-label">{t.discussion}</span>
      </div>
      {props.locked ? <p className="locked-notice">{t.discussionLocked}</p> : props.user ? <Composer lang={props.lang} busy={props.busy} label={`${t.commentAs} u/${props.user.name}`}
        onSubmit={(body) => props.onAction({ action: 'comment', post: props.postId, body })} /> :
        <div className="comment-signin"><p>{t.login}</p><button className="primary" onClick={props.onSignIn}>{t.signin}</button></div>}
      <div className="comment-toolbar">
        <label>{t.sortComments}
          <select value={sort} onChange={(event) => setSort(event.target.value as CommentSort)}>
            <option value="top">{t.topComments}</option>
            <option value="new">{t.newestComments}</option>
          </select>
        </label>
        <span>{sort === 'top' ? t.topCommentsHint : t.newCommentsHint}</span>
      </div>
      {threads.length ? <ol className="comment-list">
        {threads.map((node) => <Thread key={node.id} node={node} {...props} />)}
      </ol> : <div className="empty comments-empty"><MessageCircle size={28} /><h3>{t.noComments}</h3><p>{t.firstComment}</p></div>}
    </section>
  );
}
