import { useEffect, useState, type ReactNode } from 'react';
import { MessageCircle, Shield, UserRound } from 'lucide-react';
import { profileCopy } from '../lib/profile-copy';
import type { Lang } from '../lib/forum-copy';

type PublicUser = { username: string; role: string; created: number; avatar: string | null; posts: string[]; bio: string };
export default function PublicProfile({ username, lang, own, renderPosts }: {
  username: string; lang: Lang; own: boolean; renderPosts: (ids: string[]) => ReactNode;
}) {
  const [user, setUser] = useState<PublicUser | null>(null);
  const [error, setError] = useState('');
  const [retry, setRetry] = useState(0);
  const t = profileCopy[lang], en = lang === 'en';
  useEffect(() => {
    const controller = new AbortController();
    setError(''); setUser(null);
    fetch('/api/users/' + encodeURIComponent(username), { signal: controller.signal }).then(async (response) => {
      if (!response.ok) throw Error(response.status === 404 ? 'missing' : 'failed');
      const data = await response.json();
      if (!controller.signal.aborted) setUser(data);
    }).catch((e) => { if (!controller.signal.aborted) setError(e.message); });
    return () => controller.abort();
  }, [username, retry]);
  if (error) return <div className="empty" role="alert"><UserRound size={32} /><h1>{error === 'missing' ? (en ? 'Profile not found' : 'Պրոֆիլը չի գտնվել') : t.loadError}</h1>
    {error === 'missing' && <p>{en ? 'This account may have been renamed or removed.' : 'Հնարավոր է՝ հաշիվը վերանվանվել կամ հեռացվել է։'}</p>}
    {error !== 'missing' && <button onClick={() => setRetry(retry + 1)}>{t.retry}</button>}<a href="/">{en ? 'Back to feed' : 'Վերադառնալ լրահոս'}</a></div>;
  if (!user) return <p role="status">{en ? 'Loading profile…' : 'Պրոֆիլը բեռնվում է…'}</p>;
  return <div className="profile-page">
    <section className="profile-hero" aria-labelledby="public-profile-title">
      <div className="profile-cover"><span>ACT / COMMUNITY</span><span className="profile-cover-mark" aria-hidden="true">✳</span></div>
      <div className="profile-identity">
        <div className="profile-portrait">{user.avatar ? <img src={user.avatar} alt={t.photo} /> : <span>{user.username.slice(0, 2).toUpperCase()}</span>}</div>
        <div className="profile-name"><span className="profile-role">{user.role === 'moderator' ? <Shield size={13} /> : <UserRound size={13} />}{user.role === 'moderator' ? t.moderator : t.member}</span>
          <h1 id="public-profile-title">u/{user.username}</h1><small>{t.since} {new Date(user.created).toLocaleDateString(en ? 'en-US' : 'hy-AM', { month: 'long', year: 'numeric' })}</small></div>
        {user.bio && <p className="profile-bio">{user.bio}</p>}
        {own && <a className="profile-signout" href="/?view=profile">{t.settings}</a>}
      </div>
    </section>
    <div className="public-profile-heading"><h2>{t.posts}</h2><span>{user.posts.length}</span></div>
    {user.posts.length ? renderPosts(user.posts) : <div className="empty"><MessageCircle size={30} /><h3>{en ? 'No posts yet' : 'Դեռ գրառումներ չկան'}</h3></div>}
  </div>;
}
