import { useEffect, useState } from 'react';
import { Ban, Check, Flag, Shield, Trash2, Users } from 'lucide-react';
import { copy, type Lang } from '../lib/forum-copy';

export type ModerationAction =
  | { action: 'mod_ban'; userId: string; value: boolean; reason?: string }
  | { action: 'mod_delete_user'; userId: string }
  | { action: 'mod_review_community'; community: string; status: 'approved' | 'rejected'; reason?: string }
  | { action: 'mod_lock' | 'mod_pin'; post: string; value: boolean }
  | { action: 'mod_dismiss_reports'; post: string };

type Member = { id: string; username: string; role: string; banned: number; banReason: string; posts: number; comments: number };
type ModerationData = {
  users: Member[];
  pendingCommunities: { id: string; en: string; hy: string; description: string; author: string }[];
  reports: { post: string; title: string | { en: string; hy: string }; count: number }[];
  log: { id: string; moderator: string; action: string; target: string; reason: string; created: number }[];
};

export default function Moderation({ lang, busy, revision, onAction, onOpenPost }: {
  lang: Lang;
  busy: boolean;
  revision: number;
  onAction: (action: ModerationAction) => Promise<boolean>;
  onOpenPost: (id: string) => void;
}) {
  const t = copy[lang];
  const [data, setData] = useState<ModerationData | null>(null);
  const [error, setError] = useState(false);
  const [query, setQuery] = useState('');
  const [banTarget, setBanTarget] = useState<Member | null>(null);
  const [reason, setReason] = useState('');
  const [retry, setRetry] = useState(0);
  const [feedback, setFeedback] = useState<Record<string, string>>({});
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/moderation', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw new Error();
      setData(await response.json());
      setError(false);
    }).catch(() => { if (!controller.signal.aborted) setError(true); });
    return () => controller.abort();
  }, [revision, retry]);
  if (error) return <div className="error-banner">{t.error}<button onClick={() => setRetry(retry + 1)}>{t.retry}</button></div>;
  if (!data) return <p role="status">{t.loading}</p>;
  const members = data.users.filter((u) => u.username.toLowerCase().includes(query.toLowerCase()));
  const actionLabels: Record<string, string> = {
    approve_community: t.approveCommunity, reject_community: t.rejectCommunity,
    ban_user: t.banUser, unban_user: t.unbanUser, delete_user: t.deleteAccount,
    delete_post: t.deleteDiscussion, delete_comment: t.deleteComment,
    lock_post: t.lockDiscussion, unlock_post: t.unlockDiscussion,
    pin_post: t.pinDiscussion, unpin_post: t.unpinDiscussion, dismiss_reports: t.dismissReports,
  };
  return <div className="moderation-panel">
    <header className="moderation-heading"><Shield size={26} /><div><h1>{t.moderation}</h1><p>{t.moderationIntro}</p></div></header>
    <div className="moderation-stats">
      <div><Users size={18} /><b>{data.users.length}</b><span>{t.members}</span></div>
      <div><Ban size={18} /><b>{data.users.filter((u) => u.banned).length}</b><span>{t.bannedUsers}</span></div>
      <div><Flag size={18} /><b>{data.reports.length}</b><span>{t.reports}</span></div>
    </div>
    <section className="moderation-section" aria-labelledby="community-review-title">
      <h2 id="community-review-title">{t.pendingCommunities} ({data.pendingCommunities.length})</h2>
      {data.pendingCommunities.map((c) => <article className="community-request" key={c.id}>
        <strong>{c[lang]}</strong><small>c/{c.id} · u/{c.author}</small>
        {c.en !== c.hy && <small>{lang === 'en' ? c.hy : c.en}</small>}<p>{c.description}</p>
        <label>{t.reviewReason}<input maxLength={500} value={feedback[c.id] || ''}
          onChange={(e) => setFeedback({ ...feedback, [c.id]: e.target.value })} /></label>
        <div className="moderation-actions">
          <button className="primary" disabled={busy} onClick={() => onAction({ action: 'mod_review_community', community: c.id, status: 'approved', reason: feedback[c.id] })}><Check size={15} />{t.approveCommunity}</button>
          <button disabled={busy} onClick={() => onAction({ action: 'mod_review_community', community: c.id, status: 'rejected', reason: feedback[c.id] })}>{t.rejectCommunity}</button>
        </div>
      </article>)}
      {!data.pendingCommunities.length && <p className="muted">{t.noPendingCommunities}</p>}
    </section>
    <section className="moderation-section" aria-labelledby="members-title">
      <h2 id="members-title">{t.members}</h2>
      <input className="moderation-search" aria-label={t.searchMembers} placeholder={t.searchMembers} value={query} onChange={(e) => setQuery(e.target.value)} />
      {members.map((member) => <article className="member-row" key={member.id}>
        <div className="member-info"><strong>u/{member.username}</strong>
          <span className={member.banned ? 'status-banned' : ''}>{member.role === 'moderator' ? t.moderator : member.banned ? t.banned : t.activeMember}</span>
          <small>{member.posts} {t.count} · {member.comments} {t.comments.toLowerCase()}</small>
          {Boolean(member.banned) && member.banReason && <p>{member.banReason}</p>}
        </div>
        {member.role !== 'moderator' && <div className="moderation-actions">
          <button disabled={busy} onClick={() => {
            if (member.banned) void onAction({ action: 'mod_ban', userId: member.id, value: false });
            else { setBanTarget(member); setReason(''); }
          }}><Ban size={14} />{member.banned ? t.unbanUser : t.banUser}</button>
          <button className="danger-action" disabled={busy} onClick={() => {
            if (confirm(`${t.confirmDeleteAccount}\n\nu/${member.username}`))
              void onAction({ action: 'mod_delete_user', userId: member.id });
          }}><Trash2 size={14} />{t.deleteAccount}</button>
        </div>}
        {banTarget?.id === member.id && <form className="ban-form" onSubmit={async (event) => {
          event.preventDefault();
          if (await onAction({ action: 'mod_ban', userId: member.id, value: true, reason })) setBanTarget(null);
        }}><label>{t.banReason}<input autoFocus maxLength={500} value={reason} onChange={(e) => setReason(e.target.value)} /></label>
          <p>{t.banExplanation}</p><div className="moderation-actions">
            <button type="button" onClick={() => setBanTarget(null)}>{t.cancel}</button>
            <button className="primary" disabled={busy}>{t.confirmBan}</button>
          </div></form>}
      </article>)}
      {!members.length && <p className="muted">{t.noMembers}</p>}
    </section>
    <section className="moderation-section" aria-labelledby="reports-title"><h2 id="reports-title">{t.reports}</h2>
      {data.reports.length ? data.reports.map((report) => <article className="report-row" key={report.post}>
        <button className="report-title" onClick={() => onOpenPost(report.post)}>{typeof report.title === 'string' ? report.title : report.title[lang]}</button>
        <span>{report.count} {t.reports.toLowerCase()}</span>
        <button disabled={busy} onClick={() => onAction({ action: 'mod_dismiss_reports', post: report.post })}><Check size={15} />{t.dismissReports}</button>
      </article>) : <p className="muted">{t.noReports}</p>}
    </section>
    <section className="moderation-section" aria-labelledby="log-title"><h2 id="log-title">{t.moderationLog}</h2>
      {data.log.length ? <ol className="moderation-log">{data.log.map((entry) => <li key={entry.id}>
        <strong>{actionLabels[entry.action] || entry.action}</strong><span>{entry.target}</span>
        <small>u/{entry.moderator} · {new Date(entry.created).toLocaleString(lang === 'hy' ? 'hy-AM' : 'en-US')}</small>
        {entry.reason && <p>{entry.reason}</p>}
      </li>)}</ol> : <p className="muted">{t.noModerationActions}</p>}
    </section>
  </div>;
}
