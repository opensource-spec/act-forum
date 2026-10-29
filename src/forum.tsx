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
  Trash2,
  Shield,
  Lock,
  Pin,
  Users,
} from 'lucide-react';
import { communities as defaultCommunities, seeds } from '../lib/forum-data';
import Communities, { type Community, type CommunityRequest, type CommunityAction } from './communities';
import LocalAuth from './local-auth';
import Profile from './profile';
import PublicProfile from './public-profile';
import Comments, { type CommentAction } from './comments';
import Moderation, { type ModerationAction } from './moderation';
import { readRoute, routeURL, uniquePosts, type ForumRoute, type ForumView } from '../lib/forum-navigation';
import type { ForumComment } from '../lib/comment-threads';
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
  locked: boolean;
  canDelete: number;
};
type Data = {
  communities: Community[];
  submissions: CommunityRequest[];
  posts: Omit<Post, 'score' | 'tag' | 'locked'>[];
  comments: ForumComment[];
  votes: { post: string; score: number }[];
  mine: { post: string; value: number }[];
  saved: { post: string }[];
  joins: { community: string }[];
  controls: { post: string; removed: number; locked: number; pinned: number | null }[];
  user: { name: string; role: 'member' | 'moderator'; avatar: string | null } | null;
};
type ForumAction =
  | { action: 'post'; title: string; body: string; community: string }
  | CommentAction
  | CommunityAction
  | ModerationAction
  | { action: 'vote'; post: string; value: number }
  | { action: 'save'; post: string; value: boolean }
  | { action: 'join'; community: string; value: boolean }
  | { action: 'report'; post: string }
  | { action: 'delete'; post: string };

const initial: Data = {
  communities: defaultCommunities,
  submissions: [],
  posts: [],
  comments: [],
  votes: [],
  mine: [],
  saved: [],
  joins: [],
  controls: [],
  user: null,
};
export default function Forum() {
  const [lang, setLang] = useState<Lang>('hy'),
    [data, setData] = useState<Data>(initial),
    [route, setRoute] = useState<ForumRoute>(() => readRoute(location.search)),
    [sort, setSort] = useState('new'),
    [query, setQuery] = useState(''),
    [modal, setModal] = useState(''),
    [menu, setMenu] = useState(false),
    [toast, setToast] = useState(''),
    [busy, setBusy] = useState(false),
    [failure, setFailure] = useState(false),
    [loaded, setLoaded] = useState(false),
    [revision, setRevision] = useState(0),
    [title, setTitle] = useState(''),
    [body, setBody] = useState(''),
    [draftCommunity, setDraftCommunity] = useState('general');
  const t = copy[lang];
  const communities = data.communities;
  const { view, community, post: selected } = route;
  const isModerator = data.user?.role === 'moderator';
  async function load() {
    try {
      const r = await fetch('/api/forum');
      if (!r.ok) throw Error();
      setData(await r.json());
      setFailure(false);
      setLoaded(true);
      setRevision((value) => value + 1);
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
        setMenu(false);
      }
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []);
  useEffect(() => {
    const onPopState = () => { setRoute(readRoute(location.search)); setMenu(false); setQuery(''); };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, []);
  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
    if (selected) document.getElementById('discussion-title')?.focus({ preventScroll: true });
  }, [selected, view, community]);
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
  const all: Post[] = uniquePosts([
    ...seeds.map((p) => ({ ...p, title: p.title[lang], body: p.body[lang], canDelete: Number(isModerator) })),
    ...data.posts.map((p) => ({ ...p, score: 0, tag: 'discussion' })),
  ]).filter((p) => !data.controls.some((control) => control.post === p.id && control.removed))
    .map((p) => {
      const control = data.controls.find((item) => item.post === p.id);
      return { ...p, locked: Boolean(control?.locked),
        tag: control?.pinned == null ? p.tag : control.pinned ? 'pinned' : 'discussion',
        score: p.score + Number(data.votes.find((v) => v.post === p.id)?.score || 0) };
    });
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
    .sort((a, b) => view === 'home' ? b.created - a.created || a.id.localeCompare(b.id) :
      (sort === 'hot' ? Number(b.tag === 'pinned') - Number(a.tag === 'pinned') : 0) ||
      (sort === 'new' ? b.created - a.created : b.score - a.score) || b.created - a.created || a.id.localeCompare(b.id));
  const current = all.find((p) => p.id === selected);
  const activeCommunity = communities.find((c) => c.id === (current?.community || community)) || communities[0];
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
        await load();
        setModal('login');
        return false;
      }
      if (!r.ok) {
        const response = await r.json().catch(() => ({}));
        const communityErrors: Record<string, string> = { COMMUNITY_EXISTS: t.communityExists,
          INVALID_COMMUNITY: t.invalidCommunity, COMMUNITY_NOT_PENDING: t.communityNotPending };
        if (communityErrors[response.error]) {
          setToast(communityErrors[response.error]);
          if (response.error === 'COMMUNITY_NOT_PENDING') await load();
          return false;
        }
        if (r.status === 403) {
          setToast(response.error === 'DISCUSSION_LOCKED' ? t.discussionLocked :
            response.error === 'ACCOUNT_BANNED' ? t.accountBanned : t.actionNotAllowed);
          await load();
          return false;
        }
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
      if (input.action === 'create_community') setToast(t.communitySubmitted);
      return true;
    } catch {
      setToast(t.error);
      return false;
    } finally {
      setBusy(false);
    }
  }
  function goTo(next: ForumRoute, postOpened = false) {
    const url = routeURL(next);
    if (url !== location.pathname + location.search) history.pushState({ postOpened }, '', url);
    setRoute(next);
  }
  function openPost(id: string) {
    goTo({ ...route, post: id }, true);
    setMenu(false);
  }
  function backToFeed() {
    if (history.state?.postOpened) history.back();
    else navigate('discussions');
  }
  function navigate(v: ForumView, c = 'all') {
    goTo({ view: v, community: c, post: null });
    setMenu(false);
    setQuery('');
    if (v === 'popular') setSort('top');
  }
  async function share(p: Post) {
    try {
      await navigator.clipboard.writeText(location.origin + routeURL({ view: 'discussions', community: 'all', post: p.id }));
      setToast(t.copied);
    } catch {
      setToast(t.error);
    }
  }
  const iconSize = 19;
  function postCard(p: Post, detail = false) {
    const c = communities.find((c) => c.id === p.community) || { id: p.community, en: p.community, hy: p.community, symbol: '◎' };
    const vote = data.mine.find((v) => v.post === p.id)?.value || 0;
    const saved = data.saved.some((s) => s.post === p.id);
    return (
      <article className={'post ' + (p.tag === 'pinned' ? 'pinned ' : '') + (detail ? 'post-detail' : 'post-preview')}
        key={p.id} data-post-id={p.id}
        onClick={detail ? undefined : (event) => {
          if (!(event.target as HTMLElement).closest('button,a,input,select,textarea') && !window.getSelection()?.toString()) openPost(p.id);
        }}>
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
          {p.author === '[deleted]' || !data.posts.some((item) => item.id === p.id) ? <span>u/{p.author}</span> : <a className="author-link" href={'/?view=profile&user=' + encodeURIComponent(p.author)}>u/{p.author}</a>}
          <span className="post-date">
            · {data.posts.some((x) => x.id === p.id) ? t.latest : t.time}
          </span>
          {p.tag === 'pinned' && <span className="pin">↗ {t.pinned}</span>}
          {p.locked && <span className="locked-badge"><Lock size={12} />{t.locked}</span>}
        </div>
        {detail ? <h1 className="post-title" id="discussion-title" tabIndex={-1}>{p.title}</h1> :
          <a className="post-title" href={routeURL({ ...route, post: p.id })} onClick={(event) => {
            if (event.button === 0 && !event.metaKey && !event.ctrlKey && !event.shiftKey && !event.altKey) {
              event.preventDefault(); openPost(p.id);
            }
          }}>{p.title}</a>}
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
          <button aria-label={t.comments} onClick={() => detail ? document.getElementById('comments-title')?.scrollIntoView({ behavior: 'smooth', block: 'start' }) : openPost(p.id)}>
            <MessageCircle size={17} />
            <span>
              {data.comments.filter((c) => c.post === p.id && !c.deleted).length}{' '}
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
          {Boolean(p.canDelete) && (
            <button
              aria-label={t.deleteDiscussion}
              disabled={busy}
              onClick={async () => {
                if (confirm(t.confirmDeleteDiscussion)) {
                  const success = await mutate({ action: 'delete', post: p.id });
                  if (success && selected === p.id) navigate('discussions');
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
        {detail && isModerator && <div className="post-moderation" aria-label={t.moderation}>
          <span><Shield size={15} />{t.moderator}</span>
          <button disabled={busy} onClick={() => mutate({ action: 'mod_lock', post: p.id, value: !p.locked })}>
            <Lock size={14} />{p.locked ? t.unlockDiscussion : t.lockDiscussion}
          </button>
          <button disabled={busy} onClick={() => mutate({ action: 'mod_pin', post: p.id, value: p.tag !== 'pinned' })}>
            <Pin size={14} />{p.tag === 'pinned' ? t.unpinDiscussion : t.pinDiscussion}
          </button>
        </div>}
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
              if (selected || view === 'moderation') goTo({ view: 'discussions', community: 'all', post: null });
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
            {data.user?.avatar ? <img src={data.user.avatar} alt="" /> : <UserRound size={20} />}
          </button>
        </div>
      </header>
      <div className="layout">
        <aside className={'sidebar ' + (menu ? 'open' : '')}>
          <div className="nav-main">
            {[
              { id: 'home', icon: Home, name: t.home },
              { id: 'discussions', icon: MessageCircle, name: t.discussions },
              { id: 'communities', icon: Users, name: t.communities },
              { id: 'popular', icon: Flame, name: t.popular },
              { id: 'saved', icon: Bookmark, name: t.saved },
            ].map((n) => (
              <button
                key={n.id}
                className={'nav-item ' + (view === n.id && community === 'all' ? 'active' : '')}
                onClick={() => navigate(n.id as ForumView)}
              >
                <n.icon size={iconSize} />
                {n.name}
                {n.id === 'home' && <span className="nav-dot" />}
              </button>
            ))}
            {isModerator && <button className={'nav-item ' + (view === 'moderation' ? 'active' : '')}
              onClick={() => navigate('moderation')}><Shield size={iconSize} />{t.moderation}</button>}
          </div>
          <div className="sidebar-title">{t.sections}</div>
          <nav aria-label={t.sections}>
            {communities.slice(1).filter((c) => data.joins.some((j) => j.community === c.id)).map((c) => (
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
          {!data.joins.length && <p className="sidebar-empty">{t.noJoinedCommunities}</p>}
          <div className="sidebar-footer">
            <button onClick={() => setModal('rules')}>{t.guidelines}</button>
            <button onClick={() => setModal('about')}>{t.aboutlink}</button>
            <small>{t.author}</small>
          </div>
        </aside>
        <main className={selected ? 'discussion-page' : ''}>
          {view === 'profile' && route.user && !selected ? <PublicProfile key={route.user} username={route.user} lang={lang}
            own={route.user === data.user?.name} renderPosts={(ids) => all.filter((p) => ids.includes(p.id)).sort((a, b) => b.created - a.created).map((p) => postCard(p))} /> :
          view === 'profile' && !selected ? (data.user ? <Profile lang={lang} name={data.user.name}
            postCount={data.posts.filter((p) => p.author === data.user?.name).length}
            commentCount={data.comments.filter((c) => !c.deleted && c.author === data.user?.name).length}
            communityCount={data.joins.length} onChanged={load} onSignIn={() => setModal('login')}
            onSignOut={async () => {
              const response = await fetch('/auth/logout', { method: 'POST', headers: { 'Content-Type': 'application/json' } });
              if (!response.ok) throw Error();
              await load(); navigate('home');
            }}>
              {data.posts.filter((p) => p.author === data.user?.name).length ?
                posts.filter((p) => data.posts.some((item) => item.id === p.id)).map((p) => postCard(p)) :
                <div className="empty"><MessageCircle size={30} /><h3>{t.empty}</h3><p>{t.emptySub}</p>
                  <button className="primary" onClick={() => setModal('create')}>{t.create}</button></div>}
            </Profile> : <div className="empty"><UserRound size={32} /><p>{t.signin}</p>
              <button className="primary" onClick={() => setModal('login')}>{t.signin}</button></div>) :
          view === 'communities' && !selected ? <>
            {failure && <div className="error-banner">{t.unavailable}<button onClick={load}>{t.retry}</button></div>}
            <Communities lang={lang} communities={communities} joins={data.joins} submissions={data.submissions}
              signedIn={Boolean(data.user)} busy={busy} query={query} onAction={mutate}
              onOpen={(id) => navigate('home', id)} onSignIn={() => setModal('login')} />
          </> : view === 'moderation' && !selected ? (isModerator ?
            <Moderation lang={lang} busy={busy} revision={revision} onAction={mutate} onOpenPost={openPost} /> :
            <div className="empty"><Shield size={32} /><p>{t.moderatorOnly}</p>
              {!data.user && <button className="primary" onClick={() => setModal('login')}>{t.signin}</button>}
            </div>) : <>
          {!selected && <div className="feed-head">
            <div>
              <h2>
                {view === 'discussions' && community === 'all' ? t.allDiscussions : view === 'saved'
                  ? t.saved
                  : community === 'all'
                      ? view === 'home' ? t.newestPosts : t.feed
                      : communities.find((c) => c.id === community)?.[lang] || t.communityUnavailable}
              </h2>
              <span>
                {posts.length} {t.count}
              </span>
            </div>
            {community !== 'all' && communities.some((c) => c.id === community) && (
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
                {data.joins.some((j) => j.community === community) ? t.leaveCommunity : t.join}
              </button>
            )}
          </div>}
          {!selected && view !== 'home' && <div className="feed-toolbar">
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
          </div>}
          {failure && (
            <div className="error-banner">
              {t.unavailable}
              <button onClick={load}>{t.retry}</button>
            </div>
          )}
          {selected ? (
            <div className="discussion-content">
              <button className="back" onClick={backToFeed}>
                ← {t.backDiscussions}
              </button>
              {current ? <>{postCard(current, true)}
              <Comments key={current.id} postId={current.id} postAuthor={current.author}
                comments={data.comments} user={data.user} lang={lang} busy={busy}
                locked={current.locked && !isModerator}
                onAction={mutate} onSignIn={() => setModal('login')} /></> :
                <div className="empty" role="status">{loaded ? t.postUnavailable : t.loading}</div>}
            </div>
          ) : loaded && !communities.some((c) => c.id === community) ? (
            <div className="empty" role="status">{t.communityUnavailable}</div>
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
          </>}
        </main>
        <aside className="community-rail" aria-label={t.communityInfo}>
          <section className="rail-card">
            <div className="rail-banner"><span>{activeCommunity.symbol}</span><span>ACT / {activeCommunity.id === 'all' ? 'campus' : activeCommunity.id}</span></div>
            <h3>{activeCommunity.id === 'all' ? t.welcome : activeCommunity[lang]}</h3>
            <p>{activeCommunity.description || t.about}</p>
            <div className="community-stats">
              <div><b>{all.filter((p) => activeCommunity.id === 'all' || p.community === activeCommunity.id).length}</b><span>{t.count}</span></div>
              <div><b>{communities.length - 1}</b><span>{t.sections}</span></div>
            </div>
            <button className="primary" onClick={() => { setDraftCommunity(activeCommunity.id === 'all' ? 'general' : activeCommunity.id); setModal(data.user ? 'create' : 'login'); }}><Plus size={16} />{t.create}</button>
          </section>
          <section className="rail-card community-rules">
            <h3>{t.guidelines}</h3>
            <ol>{[t.r1, t.r2, t.r3, t.r4].map((rule) => <li key={rule}>{rule}</li>)}</ol>
          </section>
          <section className="rail-card study-callout">
            <span className="eyebrow">{t.trending}</span><h3>{t.notice}</h3><p>{t.noticebody}</p>
            <button onClick={() => navigate('home', 'study')}>{t.browse}<ArrowUpRight size={15} /></button>
          </section>
        </aside>
      </div>
      {modal && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget) setModal('');
          }}
        >
          <section role="dialog" aria-modal="true" aria-labelledby="dialog-title" className={'modal' + (modal === 'login' ? ' auth-modal' : '')}>
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
