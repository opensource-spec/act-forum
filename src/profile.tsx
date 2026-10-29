import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Camera, Check, KeyRound, LogOut, Shield, UserRound } from 'lucide-react';
import { profileCopy } from '../lib/profile-copy';
import type { Lang } from '../lib/forum-copy';

type ProfileData = { username: string; role: string; created: number; avatar: string | null; bio: string };
async function photoBlob(file: File): Promise<Blob> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type) || file.size > 5 * 1024 * 1024) throw Error('INVALID_IMAGE');
  const bitmap = await createImageBitmap(file);
  try {
    if (!bitmap.width || !bitmap.height || bitmap.width * bitmap.height > 16000000) throw Error('INVALID_IMAGE');
    const canvas = document.createElement('canvas');
    canvas.width = canvas.height = 320;
    const context = canvas.getContext('2d');
    if (!context) throw Error('INVALID_IMAGE');
    const side = Math.min(bitmap.width, bitmap.height);
    context.drawImage(bitmap, (bitmap.width - side) / 2, (bitmap.height - side) / 2, side, side, 0, 0, 320, 320);
    return await new Promise<Blob>((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(Error('INVALID_IMAGE')), 'image/png'));
  } finally { bitmap.close(); }
}

export default function Profile({ lang, name, postCount, commentCount, communityCount, onChanged, onSignIn, onSignOut, children }: {
  lang: Lang; name: string; postCount: number; commentCount: number; communityCount: number;
  onChanged: () => Promise<void>; onSignIn: () => void; onSignOut: () => Promise<void>; children: ReactNode;
}) {
  const t = profileCopy[lang];
  const [profile, setProfile] = useState<ProfileData | null>(null);
  const [username, setUsername] = useState(name);
  const [bio, setBio] = useState('');
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [tab, setTab] = useState('activity');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState<{ error: boolean; text: string } | null>(null);
  const [loadError, setLoadError] = useState(false);
  const [retry, setRetry] = useState(0);
  const fileInput = useRef<HTMLInputElement>(null);
  const noticeElement = useRef<HTMLDivElement>(null);
  const inFlight = useRef(false);
  useEffect(() => { if (notice) noticeElement.current?.scrollIntoView({ block: 'nearest' }); }, [notice]);
  useEffect(() => {
    const controller = new AbortController();
    fetch('/api/profile', { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw Error();
      const data = await response.json(); setProfile(data); setUsername(data.username); setBio(data.bio || ''); setLoadError(false);
    }).catch(() => { if (!controller.signal.aborted) setLoadError(true); });
    return () => controller.abort();
  }, [name, retry]);
  function errorText(code: string) {
    const messages: Record<string, string> = { WRONG_PASSWORD: t.wrongPassword, PASSWORD_MISMATCH: t.mismatch,
      INVALID_PASSWORD: t.invalidPassword, INVALID_USERNAME: t.invalidUsername, USERNAME_TAKEN: t.taken,
      INVALID_IMAGE: t.imageError, RATE_LIMIT: t.rate, SIGN_IN_REQUIRED: t.expired };
    return messages[code] || t.error;
  }
  async function save(route: string, options: RequestInit, success: string, clear?: () => void) {
    if (inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      const response = await fetch(route, options);
      if (!response.ok) {
        const data = await response.json();
        if (response.status === 401) { await onChanged(); onSignIn(); }
        throw Error(data.error);
      }
      clear?.();
      setNotice({ error: false, text: success });
      const refreshed = await fetch('/api/profile');
      if (refreshed.ok) setProfile(await refreshed.json());
      await onChanged();
    } catch (error) { setNotice({ error: true, text: errorText(error instanceof Error ? error.message : '') }); }
    finally { inFlight.current = false; setBusy(false); }
  }
  async function upload(file?: File) {
    if (!file || inFlight.current) return;
    inFlight.current = true; setBusy(true); setNotice(null);
    try {
      const body = await photoBlob(file);
      inFlight.current = false;
      await save('/api/profile/avatar', { method: 'PUT', headers: { 'Content-Type': 'image/png' }, body }, t.savedPhoto);
    } catch { setNotice({ error: true, text: t.imageError }); }
    finally { inFlight.current = false; setBusy(false); if (fileInput.current) fileInput.current.value = ''; }
  }
  if (loadError) return <div className="error-banner" role="alert">{t.loadError}<button onClick={() => setRetry(retry + 1)}>{t.retry}</button></div>;
  if (!profile) return <p role="status">{t.loading}</p>;
  return <div className="profile-page">
    <section className="profile-hero" aria-labelledby="profile-heading">
      <div className="profile-cover"><span>ACT / COMMUNITY</span><span className="profile-cover-mark" aria-hidden="true">✳</span></div>
      <div className="profile-identity">
        <div className="profile-portrait">{profile.avatar ? <img src={profile.avatar} alt={t.photo} /> : <span>{profile.username.slice(0, 2).toUpperCase()}</span>}</div>
        <div className="profile-name"><span className="profile-role">{profile.role === 'moderator' ? <Shield size={13} /> : <UserRound size={13} />}{profile.role === 'moderator' ? t.moderator : t.member}</span>
          <h1 id="profile-heading">u/{profile.username}</h1><p>{t.subtitle}</p>
          {profile.bio && <p className="profile-bio">{profile.bio}</p>}
          <small>{t.since} {new Date(profile.created).toLocaleDateString(lang === 'hy' ? 'hy-AM' : 'en-US', { month: 'long', year: 'numeric' })}</small>
        </div>
        <button className="profile-signout" disabled={busy} onClick={async () => {
          setBusy(true); try { await onSignOut(); } catch { setNotice({ error: true, text: t.error }); setBusy(false); }
        }}><LogOut size={15} />{t.signout}</button>
      </div>
      <div className="profile-photo-actions"><input ref={fileInput} type="file" accept="image/jpeg,image/png,image/webp" aria-label={t.upload} hidden onChange={(e) => void upload(e.target.files?.[0])} />
        <button className="profile-photo-button" disabled={busy} onClick={() => fileInput.current?.click()}><Camera size={16} />{busy ? '…' : t.upload}</button>
        {profile.avatar && <button className="profile-remove" disabled={busy} onClick={() => save('/api/profile/avatar', { method: 'DELETE' }, t.removedPhoto)}>{t.remove}</button>}
        <small>{t.photoHint}</small>
      </div>
      <div className="profile-stats">{[[postCount, t.posts], [commentCount, t.comments], [communityCount, t.communities]].map(([value, label]) =>
        <div key={label}><strong>{value}</strong><span>{label}</span></div>)}</div>
    </section>
    {notice && <div ref={noticeElement} className={'profile-notice ' + (notice.error ? 'is-error' : '')} role={notice.error ? 'alert' : 'status'}>{!notice.error && <Check size={16} />}{notice.text}</div>}
    <div className="profile-tabs" aria-label={t.profile}>
      <button className={tab === 'activity' ? 'selected' : ''} aria-pressed={tab === 'activity'} onClick={() => setTab('activity')}>{t.activity}<span>{postCount}</span></button>
      <button className={tab === 'settings' ? 'selected' : ''} aria-pressed={tab === 'settings'} onClick={() => setTab('settings')}>{t.settings}</button>
    </div>
    {tab === 'activity' ? children : <div className="profile-settings">
      <form className="profile-setting-card" onSubmit={(e) => { e.preventDefault(); void save('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'bio', bio }) }, lang === 'en' ? 'Description updated.' : 'Նկարագրությունը թարմացվել է։'); }}>
        <h2>{lang === 'en' ? 'About you' : 'Քո մասին'}</h2><label>{lang === 'en' ? 'Public description' : 'Հանրային նկարագրություն'}<textarea maxLength={300} value={bio} onChange={(e) => setBio(e.target.value)} /></label><small>{bio.length}/300</small><button className="primary" disabled={busy}>{lang === 'en' ? 'Save description' : 'Պահպանել նկարագրությունը'}</button>
      </form>
      <form className="profile-setting-card" onSubmit={(e) => { e.preventDefault(); void save('/api/profile', {
        method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ action: 'username', username }),
      }, t.savedName); }}>
        <UserRound size={22} /><h2>{t.usernameTitle}</h2><p>{t.usernameHint}</p>
        <label>{t.username}<input required autoComplete="username" minLength={3} maxLength={24} pattern="[A-Za-z0-9_-]{3,24}" value={username} onChange={(e) => setUsername(e.target.value)} /></label>
        <button className="primary" disabled={busy || username.trim().toLowerCase() === profile.username}>{t.saveUsername}</button>
      </form>
      <form className="profile-setting-card" onSubmit={(e) => {
        e.preventDefault();
        if (newPassword !== confirmPassword) { setNotice({ error: true, text: t.mismatch }); return; }
        void save('/api/profile', { method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ action: 'password', currentPassword, newPassword, confirmPassword }),
        }, t.savedPassword, () => { setCurrentPassword(''); setNewPassword(''); setConfirmPassword(''); });
      }}>
        <KeyRound size={22} /><h2>{t.passwordTitle}</h2><p>{t.passwordHint}</p>
        <input type="text" autoComplete="username" value={profile.username} readOnly hidden />
        <label>{t.currentPassword}<input required type="password" autoComplete="current-password" maxLength={128} value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} /></label>
        <label>{t.newPassword}<input required type="password" autoComplete="new-password" minLength={10} maxLength={128} value={newPassword} onChange={(e) => setNewPassword(e.target.value)} /></label>
        <label>{t.confirmPassword}<input required type="password" autoComplete="new-password" minLength={10} maxLength={128} value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} /></label>
        <button className="primary" disabled={busy}>{t.savePassword}</button>
      </form>
    </div>}
  </div>;
}
