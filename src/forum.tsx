'use client';
import { useState, useEffect } from 'react';
import {
  ArrowUp,
  ArrowDown,
  MessageCircle,
  Bookmark,
  Search,
  Plus,
  Home,
  Flame,
  Clock,
  TrendingUp,
  ArrowUpRight,
  ChevronDown,
  Menu,
  X,
  Flag,
  Share2,
  UserRound,
  Check,
  Send,
  Trash2,
} from 'lucide-react';
import { communities, seeds } from '../lib/forum-data';
import LocalAuth from './local-auth';
import { copy, type Lang } from '../lib/forum-copy';
type Post = {
  id: string;
  author: string;
  community: string;
  title: string;
  body: string;
  created: number;
  score: number;
  tag: string;
};
type Comment = { id: string; post: string; author: string; body: string; created: number };
type Data = {
  posts: Omit<Post, 'score' | 'tag'>[];
  comments: Comment[];
  votes: { post: string; score: number }[];
  mine: { post: string; value: number }[];
  saved: { post: string }[];
  joins: { community: string }[];
  user: { name: string } | null;
};
type ForumAction =
  | { action: 'post'; title: string; body: string; community: string }
  | { action: 'comment'; post: string; body: string }
  | { action: 'vote'; post: string; value: number }
  | { action: 'save'; post: string; value: boolean }
  | { action: 'join'; community: string; value: boolean }
  | { action: 'report'; post: string }
  | { action: 'delete'; post: string }
  | { action: 'delete_comment'; commentId: string };

const initial: Data = {
  posts: [],
  comments: [],
  votes: [],
  mine: [],
  saved: [],
  joins: [],
  user: null,
};
export default function Forum() {
  const [lang, setLang] = useState<Lang>('hy'),
    [data, setData] = useState<Data>(initial),
    [view, setView] = useState('home'),
    [community, setCommunity] = useState('all'),
    [sort, setSort] = useState('hot'),
    [query, setQuery] = useState(''),
    [modal, setModal] = useState(''),
    [selected, setSelected] = useState<string | null>(null),
    [menu, setMenu] = useState(false),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(false),
    [title, setTitle] = useState(''),
    [body, setBody] = useState(''),
    [draftCommunity, setDraftCommunity] = useState('general'),
    [comment, setComment] = useState('');
  const t = copy[lang];
  async function load() {
    try {
      const r = await fetch('/api/forum');
      if (!r.ok) throw Error();
      setData(await r.json());
      setFailure(false);
    } catch {
      setFailure(true);
    }
  }
  useEffect(() => {
    try {
      const l = localStorage.getItem('campus-lang');
      if (l === 'en') setLang(l);
    } catch {}
    load();
    const id = setInterval(load, 30000);
    return () => clearInterval(id);
  }, []);
  useEffect(() => {
    document.documentElement.lang = lang;
    try {
      localStorage.setItem('campus-lang', lang);
    } catch {}
  }, [lang]);
  useEffect(() => {
    if (!toast) return;
    const id = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(id);
  }, [toast]);
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        setModal('');
        setSelected(null);
        setMenu(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    const id = new URLSearchParams(location.search).get('post');
    if (id) setSelected(id);
  }, []);
  useEffect(() => {
    if (!modal) return;
    const previous = document.activeElement as HTMLElement;
    document.body.style.overflow = 'hidden';
    const dialog = document.querySelector('.modal');
    const focusable = () =>
      Array.from(
        dialog?.querySelectorAll<HTMLElement>(
          'button:not(:disabled),a[href],input,textarea,select',
        ) || [],
      );
    focusable()[0]?.focus();
    const trap = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const items = focusable(),
        first = items[0],
        last = items[items.length - 1];
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    };
    window.addEventListener('keydown', trap);
    return () => {
      document.body.style.overflow = '';
      window.removeEventListener('keydown', trap);
      previous?.focus();
    };
  }, [modal]);
  const all: Post[] = [
    ...seeds.map((p) => ({ ...p, title: p.title.hy, body: p.body.hy })),
    ...data.posts.map((p) => ({ ...p, score: 0, tag: 'discussion' })),
  ].map((p) => ({
    ...p,
    score: p.score + Number(data.votes.find((v) => v.post === p.id)?.score || 0),
  }));
  const posts = all
    .filter(
      (p) =>
        (community === 'all' || p.community === community) &&
        (view !== 'saved' || data.saved.some((s) => s.post === p.id)) &&
        (view !== 'profile' || p.author === data.user?.name) &&
        (!query ||
          `${p.title} ${p.body} ${p.author}`
            .toLocaleLowerCase()
            .includes(query.toLocaleLowerCase())),
    )
    .sort((a, b) =>
      sort === 'new'
        ? b.created - a.created
        : sort === 'top'
          ? b.score - a.score
          : a.tag === 'pinned'
            ? -1
            : b.tag === 'pinned'
              ? 1
              : b.score - a.score,
    );
  const current = all.find((p) => p.id === selected);
  async function mutate(input: ForumAction) {
    if (!data.user) {
      setModal('login');
      return false;
    }
    if (busy) return false;
    setBusy(true);
    try {
      const r = await fetch('/api/forum', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(input),
      });
      if (r.status === 401) {
        setModal('login');
        return false;
      }
      if (!r.ok) {
        setToast(
          r.status === 429
            ? lang === 'en'
              ? 'Slow down a little. Try again in a moment.'
              : 'Մի փոքր սպասիր և փորձիր կրկին։'
            : t.error,
        );
        return false;
      }
      await load();
      return true;
    } catch {
      setToast(t.error);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function navigate(v: string, c = 'all') {
    setView(v);
    setCommunity(c);
    setSelected(null);
    setMenu(false);
    setQuery('');
    if (v === 'popular') setSort('top');
  }
  async function share(p: Post) {
    try {
      await navigator.clipboard.writeText(location.origin + '/?post=' + encodeURIComponent(p.id));
      setToast(t.copied);
    } catch {
      setToast(t.error);
    }
  }
  const iconSize = 19;
  function postCard(p: Post, detail = false) {
    const c = communities.find((c) => c.id === p.community)!;
    const vote = data.mine.find((v) => v.post === p.id)?.value || 0;
    const saved = data.saved.some((s) => s.post === p.id);
    return (
      <article className={'post ' + (p.tag === 'pinned' ? 'pinned' : '')} key={p.id}>
        <div className="post-meta">
          <button
            aria-label={c[lang]}
            className={'community-icon ' + p.community}
            onClick={() => navigate('home', p.community)}
          >
            {c.symbol}
          </button>
          <button className="community-name" onClick={() => navigate('home', p.community)}>
            {c[lang]}
          </button>
          <span className="dot">·</span>
          <span>u/{p.author}</span>
          <span className="post-date">
            · {data.posts.some((x) => x.id === p.id) ? t.latest : t.time}
          </span>
          {p.tag === 'pinned' && <span className="pin">↗ {t.pinned}</span>}
        </div>
        <button className="post-title" onClick={() => setSelected(p.id)}>
          {p.title}
        </button>
        <p className={'post-body ' + (detail ? 'full' : '')}>{p.body}</p>

        <div className="post-actions">
          <div className="vote">
            <button
              disabled={busy}
              className={vote === 1 ? 'voted' : ''}
              aria-label={lang === 'en' ? 'Upvote' : 'Դրական քվե'}
              onClick={() => mutate({ action: 'vote', post: p.id, value: vote === 1 ? 0 : 1 })}
            >
              <ArrowUp size={17} />
            </button>
            <b>{p.score}</b>
            <button
              disabled={busy}
              className={vote === -1 ? 'voted' : ''}
              aria-label={lang === 'en' ? 'Downvote' : 'Բացասական քվե'}
              onClick={() => mutate({ action: 'vote', post: p.id, value: vote === -1 ? 0 : -1 })}
            >
              <ArrowDown size={17} />
            </button>
          </div>
          <button aria-label={t.comments} onClick={() => setSelected(p.id)}>
            <MessageCircle size={17} />
            <span>
              {data.comments.filter((c) => c.post === p.id).length}{' '}
              <span className="action-label">{t.comments}</span>
            </span>
          </button>
          <button aria-label={t.share} onClick={() => share(p)}>
            <Share2 size={16} />
            <span className="action-label">{t.share}</span>
          </button>
          <button
            aria-label={saved ? t.unsave : t.save}
            className={saved ? 'lime-text' : ''}
            disabled={busy}
            onClick={() => mutate({ action: 'save', post: p.id, value: !saved })}
          >
            <Bookmark size={16} fill={saved ? 'currentColor' : 'none'} />
            <span className="action-label">{saved ? t.unsave : t.save}</span>
          </button>
          {data.user && p.author === data.user.name && (
            <button
              aria-label="Delete"
              disabled={busy}
              onClick={async () => {
                const confirmMsg = lang === 'en' ? 'Delete this post?' : 'Ջնջե՞լ այս հրապարակումը:';
                if (confirm(confirmMsg)) {
                  const success = await mutate({ action: 'delete', post: p.id });
                  if (success && selected === p.id) setSelected(null);
                }
              }}
            >
              <Trash2 size={16} />
              <span className="action-label">{lang === 'en' ? 'Delete' : 'Ջնջել'}</span>
            </button>
          )}
          {detail && (
            <button
              aria-label={t.report}
              onClick={async () => {
                if (await mutate({ action: 'report', post: p.id })) setToast(t.reported);
              }}
            >
              <Flag size={16} />
            </button>
          )}
        </div>
      </article>
    );
  }
  return (
    <>
      <header className="header">
        <button className="mobile-menu" onClick={() => setMenu(!menu)} aria-label="Menu">
          <Menu />
        </button>
        <a className="logo" href="/">
          ACT<span> Forum</span>
        </a>
        <label className="search">
          <Search size={18} />
          <input
            value={query}
            onChange={(e) => {
              setQuery(e.target.value);
              setSelected(null);
            }}
            placeholder={t.search}
            aria-label={t.search}
          />
          <kbd>/</kbd>
        </label>
        <button
          className="language"
          aria-label={t.language}
          onClick={() => setLang(lang === 'hy' ? 'en' : 'hy')}
        >
          <span className={lang === 'hy' ? 'active' : ''}>ՀԱՅ</span>
          <span className="slash">/</span>
          <span className={lang === 'en' ? 'active' : ''}>EN</span>
        </button>
        <div className="header-actions">
          <button
            className="header-create"
            onClick={() => setModal(data.user ? 'create' : 'login')}
          >
            <Plus size={18} />
            {t.create}
          </button>
          <button
            className="avatar"
            aria-label={data.user ? t.account : t.signin}
            onClick={() => (data.user ? navigate('profile') : setModal('login'))}
          >
            <UserRound size={20} />
          </button>
        </div>
      </header>
      <div className="layout">
        <aside className={'sidebar ' + (menu ? 'open' : '')}>
          <div className="nav-main">
            {[
              { id: 'home', icon: Home, name: t.home },
              { id: 'popular', icon: Flame, name: t.popular },
              { id: 'saved', icon: Bookmark, name: t.saved },
            ].map((n) => (
              <button
                key={n.id}
                className={'nav-item ' + (view === n.id && community === 'all' ? 'active' : '')}
                onClick={() => navigate(n.id)}
              >
                <n.icon size={iconSize} />
                {n.name}
                {n.id === 'home' && <span className="nav-dot" />}
              </button>
            ))}
          </div>
          <div className="sidebar-title">{t.communities}</div>
          <nav>
            {communities.slice(1).map((c) => (
              <button
                key={c.id}
                className={'nav-item community-nav ' + (community === c.id ? 'active' : '')}
                onClick={() => navigate('home', c.id)}
              >
                <span className={'small-symbol ' + c.id}>{c.symbol}</span>
                {c[lang]}
                {data.joins.some((j) => j.community === c.id) && <Check size={13} />}
              </button>
            ))}
          </nav>
          <button className="explore" onClick={() => setModal('communities')}>
            <Plus size={16} />
            {t.explore}
          </button>
        </aside>
        <main>
          <div className="feed-head">
            <div>
              <h2>
                {view === 'saved'
                  ? t.saved
                  : view === 'profile'
                    ? t.myposts
                    : community === 'all'
                      ? t.feed
                      : communities.find((c) => c.id === community)?.[lang]}
              </h2>
              <span>
                {posts.length} {t.count}
              </span>
            </div>
            {view === 'profile' && (
              <button
                className="back"
                onClick={async () => {
                  try {
                    await fetch('/auth/logout', {
                      method: 'POST',
                      headers: { 'Content-Type': 'application/json' },
                    });
                    await load();
                    navigate('home');
                  } catch {
                    setToast(t.error);
                  }
                }}
              >
                {lang === 'en' ? 'Sign out' : 'Դուրս գալ'}
              </button>
            )}
            {community !== 'all' && (
              <button
                className="join-small"
                onClick={() =>
                  mutate({
                    action: 'join',
                    community,
                    value: !data.joins.some((j) => j.community === community),
                  })
                }
              >
                {data.joins.some((j) => j.community === community) ? t.joined : t.join}
              </button>
            )}
          </div>
          <div className="feed-toolbar">
            <div className="sort-tabs">
              {[
                { id: 'hot', icon: Flame, label: t.hot },
                { id: 'new', icon: Clock, label: t.new },
                { id: 'top', icon: TrendingUp, label: t.top },
              ].map((s) => (
                <button
                  className={sort === s.id ? 'selected' : ''}
                  key={s.id}
                  onClick={() => setSort(s.id)}
                >
                  <s.icon size={16} />
                  {s.label}
                </button>
              ))}
            </div>
            <button className="all-filter" onClick={() => setModal('communities')}>
              {community === 'all' ? t.all : communities.find((c) => c.id === community)?.[lang]}
              <ChevronDown size={14} />
            </button>
          </div>
          {failure && (
            <div className="error-banner">
              {t.unavailable}
              <button onClick={load}>{t.retry}</button>
            </div>
          )}
          {selected && current ? (
            <>
              <button className="back" onClick={() => setSelected(null)}>
                ← {t.back}
              </button>
              {postCard(current, true)}
              <section className="comments-panel">
                <h3>
                  {t.comments}{' '}
                  <span>{data.comments.filter((c) => c.post === current.id).length}</span>
                </h3>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await mutate({ action: 'comment', post: current.id, body: comment }))
                      setComment('');
                  }}
                >
                  <textarea
                    required
                    maxLength={2000}
                    value={comment}
                    onChange={(e) => setComment(e.target.value)}
                    placeholder={t.comment}
                    aria-label={t.comment}
                  />
                  <button className="primary" disabled={busy || !comment.trim()}>
                    <Send size={16} />
                    {t.send}
                  </button>
                </form>
                {data.comments
                  .filter((c) => c.post === current.id)
                  .map((c) => (
                    <div className="comment" key={c.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <div style={{ display: 'flex', gap: '12px' }}>
                        <div className="comment-avatar">{c.author[0].toUpperCase()}</div>
                        <div>
                          <b>u/{c.author}</b>
                          <p>{c.body}</p>
                        </div>
                      </div>
                      {data.user && c.author === data.user.name && (
                        <button
                          style={{ background: 'transparent', border: 'none', cursor: 'pointer', opacity: 0.7, padding: '4px' }}
                          title={lang === 'en' ? 'Delete comment' : 'Ջնջել մեկնաբանությունը'}
                          disabled={busy}
                          onClick={async () => {
                            const confirmMsg = lang === 'en' ? 'Delete this comment?' : 'Ջնջե՞լ այս մեկնաբանությունը:';
                            if (confirm(confirmMsg)) {
                              await mutate({ action: 'delete_comment', commentId: c.id });
                            }
                          }}
                        >
                          <Trash2 size={15} />
                        </button>
                      )}
                    </div>
                  ))}
              </section>
            </>
          ) : posts.length ? (
            posts.map((p) => postCard(p))
          ) : (
            <div className="empty">
              <MessageCircle size={38} />
              <h3>{t.empty}</h3>
              <p>{t.emptySub}</p>
              <button className="primary" onClick={() => setModal(data.user ? 'create' : 'login')}>
                {t.create}
              </button>
            </div>
          )}
        </main>
      </div>
      {modal && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal('');
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className="modal">
            <button className="close" aria-label={t.close} onClick={() => setModal('')}>
              <X size={20} />
            </button>
            {modal === 'create' ? (
              <>
                <h2 id="dialog-title">{t.create}</h2>
                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (await mutate({ action: 'post', title, body, community: draftCommunity })) {
                      setModal('');
                      setTitle('');
                      setBody('');
                      navigate('home');
                      setSort('new');
                    }
                  }}
                >
                  <label>
                    {t.communities}
                    <select
                      value={draftCommunity}
                      onChange={(e) => setDraftCommunity(e.target.value)}
                    >
                      {communities.slice(1).map((c) => (
                        <option key={c.id} value={c.id}>
                          {c[lang]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label>
                    {t.title}
                    <input
                      autoFocus
                      required
                      maxLength={180}
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                      placeholder={t.title}
                    />
                  </label>
                  <label>
                    {t.body}
                    <textarea
                      required
                      maxLength={5000}
                      value={body}
                      onChange={(e) => setBody(e.target.value)}
                      placeholder={t.body}
                    />
                  </label>
                  <div className="form-footer">
                    <small>{body.length}/5000</small>
                    <button type="button" onClick={() => setModal('')}>
                      {t.cancel}
                    </button>
                    <button className="primary" disabled={busy || !title.trim() || !body.trim()}>
                      {busy ? '…' : t.publish}
                      <ArrowUpRight size={16} />
                    </button>
                  </div>
                </form>
              </>
            ) : modal === 'login' ? (
              <LocalAuth
                lang={lang}
                onDone={() => {
                  setModal('');
                  load();
                }}
              />
            ) : modal === 'communities' ? (
              <>
                <h2 id="dialog-title">{t.explore}</h2>
                {communities.map((c) => (
                  <button
                    className="community-choice"
                    key={c.id}
                    onClick={() => {
                      navigate('home', c.id);
                      setModal('');
                    }}
                  >
                    <span className="small-symbol">{c.symbol}</span>
                    {c[lang]}
                    <ArrowUpRight size={18} />
                  </button>
                ))}
              </>
            ) : modal === 'rules' ? (
              <>
                <h2 id="dialog-title">{t.guidelines}</h2>
                {[t.r1, t.r2, t.r3, t.r4].map((r, i) => (
                  <div className="rule" key={r}>
                    <span>0{i + 1}</span>
                    <p>{r}</p>
                  </div>
                ))}
              </>
            ) : (
              <>
                <h2 id="dialog-title">{t.welcome}</h2>
                <p>{t.about}</p>
                <p>{t.author}</p>
              </>
            )}
          </section>
        </div>
      )}
      {toast && (
        <div className="toast" role="status">
          {toast}
        </div>
      )}
    </>
  );
}