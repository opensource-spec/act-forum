import { useState } from 'react';
import { Plus, ArrowUpRight, Users } from 'lucide-react';
import { copy, type Lang } from '../lib/forum-copy';

export type Community = { id: string; en: string; hy: string; symbol: string; description?: string };
export type CommunityRequest = Community & { status: 'pending' | 'approved' | 'rejected'; reason: string };
export type CommunityAction =
  | { action: 'create_community'; id: string; en: string; hy: string; description: string }
  | { action: 'join'; community: string; value: boolean };

export default function Communities({ lang, communities, joins, submissions, signedIn, busy, query, onAction, onOpen, onSignIn }: {
  lang: Lang; communities: Community[]; joins: { community: string }[]; submissions: CommunityRequest[];
  signedIn: boolean; busy: boolean; query: string;
  onAction: (action: CommunityAction) => Promise<boolean>; onOpen: (id: string) => void; onSignIn: () => void;
}) {
  const t = copy[lang];
  const [section, setSection] = useState<'joined' | 'explore'>('joined');
  const [creating, setCreating] = useState(false);
  const [draft, setDraft] = useState({ id: '', en: '', hy: '', description: '' });
  const joined = (id: string) => joins.some((j) => j.community === id);
  const shown = communities.filter((c) => c.id !== 'all' && (section === 'explore' || joined(c.id)) &&
    `${c.en} ${c.hy} ${c.id} ${c.description || ''}`.toLocaleLowerCase().includes(query.toLocaleLowerCase()));
  return <div className="communities-page">
    <header className="directory-heading"><div><span className="eyebrow">ACT COMMUNITY</span><h1>{t.communities}</h1></div>
      <button className="primary" onClick={() => signedIn ? setCreating(!creating) : onSignIn()}><Plus size={16} />{t.createCommunity}</button>
    </header>
    {creating && signedIn && <form className="community-form" onSubmit={async (event) => {
      event.preventDefault();
      if (await onAction({ action: 'create_community', ...draft })) {
        setCreating(false); setDraft({ id: '', en: '', hy: '', description: '' });
      }
    }}>
      <h2>{t.createCommunity}</h2><p>{t.approvalHint}</p>
      <label>{t.communitySlug}<input required pattern="[a-z0-9][a-z0-9-]{2,39}" minLength={3} maxLength={40}
        value={draft.id} onChange={(e) => setDraft({ ...draft, id: e.target.value.toLowerCase() })} aria-describedby="slug-hint" /></label>
      <small id="slug-hint">{t.communitySlugHint}</small>
      <label>{t.communityNameEn}<input maxLength={80} value={draft.en} onChange={(e) => setDraft({ ...draft, en: e.target.value })} /></label>
      <label>{t.communityNameHy}<input maxLength={80} value={draft.hy} onChange={(e) => setDraft({ ...draft, hy: e.target.value })} /></label>
      <small>{t.communityNameHint}</small>
      <label>{t.communityDescription}<textarea required maxLength={1000} value={draft.description} onChange={(e) => setDraft({ ...draft, description: e.target.value })} /></label>
      <div className="form-footer"><button type="button" onClick={() => setCreating(false)}>{t.cancel}</button>
        <button className="primary" disabled={busy || (!draft.en.trim() && !draft.hy.trim()) || !draft.description.trim()}>{t.submitCommunity}</button></div>
    </form>}
    <div className="sort-tabs community-tabs" role="tablist" aria-label={t.communities}>
      {(['joined', 'explore'] as const).map((value) => <button role="tab" aria-selected={section === value}
        aria-controls="community-list" id={`community-tab-${value}`} key={value} className={section === value ? 'selected' : ''}
        onClick={() => setSection(value)}>{value === 'joined' ? t.joinedCommunities : t.explore}</button>)}
    </div>
    <div id="community-list" role="tabpanel" aria-labelledby={`community-tab-${section}`}>
      {shown.length ? <div className="directory-grid">{shown.map((c) => <article className="directory-card" key={c.id}>
        <span className={'section-symbol ' + c.id}>{c.symbol}</span>
        <button className="directory-title" onClick={() => onOpen(c.id)}>{c[lang]}<ArrowUpRight size={16} /></button>
        <small>c/{c.id}</small><p>{c.description || t.sectionHint}</p>
        <button className={joined(c.id) ? 'join-small' : 'primary'} disabled={busy}
          onClick={() => onAction({ action: 'join', community: c.id, value: !joined(c.id) })}>{joined(c.id) ? t.leaveCommunity : t.join}</button>
      </article>)}</div> : <div className="empty"><Users size={32} /><p>{section === 'joined' && !query ? t.noJoinedCommunities : t.noCommunities}</p>
        {section === 'joined' && <button className="primary" onClick={() => setSection('explore')}>{t.explore}</button>}
      </div>}
    </div>
    {signedIn && submissions.length > 0 && <section className="moderation-section community-requests"><h2>{t.mySubmissions}</h2>
      {submissions.map((c) => <article className="community-request" key={c.id}><strong>{c[lang]}</strong><small>c/{c.id}</small>
        <span>{c.status === 'pending' ? t.pendingCommunity : c.status === 'approved' ? t.approvedCommunity : t.rejectedCommunity}</span>
        {c.reason && <p>{c.reason}</p>}
        {c.status === 'approved' && <button className="back" onClick={() => onOpen(c.id)}>{t.openCommunity}<ArrowUpRight size={15} /></button>}
      </article>)}
    </section>}
  </div>;
}
