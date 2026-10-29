import { useState } from 'react';
export type Upload = { type: string; data: string };
export function MediaPicker({ onChange, lang, onBusy }: { onChange: (items: Upload[]) => void; lang: string; onBusy: (value: boolean) => void }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <label>{lang === 'en' ? 'Photos and video' : 'Նկարներ և տեսանյութ'}
    <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4" disabled={busy} onChange={async (e) => {
      const files = Array.from(e.target.files || []); onChange([]); setError(''); setBusy(true); onBusy(true);
      try {
        const photos = files.filter((f) => f.type.startsWith('image/')), videos = files.filter((f) => f.type === 'video/mp4');
        if (photos.length + videos.length !== files.length || photos.length > 3 || videos.length > 1 || photos.some((f) => f.size > 5*1024*1024) || videos.some((f) => f.size > 25*1024*1024)) throw Error();
        const items = await Promise.all(files.map((file) => new Promise<Upload>((resolve,reject) => {
          const reader = new FileReader(); reader.onload = () => resolve({ type: file.type, data: String(reader.result).split(',')[1] }); reader.onerror = reject; reader.readAsDataURL(file);
        })));
        onChange(items);
      } catch { setError(lang === 'en' ? 'Choose up to 3 photos (5 MB each) and 1 MP4 (25 MB).' : 'Ընտրիր մինչև 3 նկար (յուրաքանչյուրը՝ 5 ՄԲ) և 1 MP4 (25 ՄԲ)։'); }
      finally { setBusy(false); onBusy(false); }
    }} />
    <small>{lang === 'en' ? '3 photos · 5 MB each · 15 MB total. 1 MP4 · 25 MB · 30 seconds · H.264/AAC.' : '3 նկար · 5 ՄԲ յուրաքանչյուրը · 15 ՄԲ ընդհանուր։ 1 MP4 · 25 ՄԲ · 30 վայրկյան · H.264/AAC։'}</small>
    {busy && <p role="status">…</p>}{error && <p role="alert">{error}</p>}
  </label>;
}
export function PostMedia({ media }: { media?: string }) {
  const items: { id: string; type: string }[] = JSON.parse(media || '[]');
  return <div className="post-media" onClick={(e) => e.stopPropagation()}>{items.map((m) => m.type.startsWith('image/') ?
    <a key={m.id} href={'/api/media/' + m.id} target="_blank" rel="noreferrer"><img loading="lazy" src={'/api/media/' + m.id} alt="Post attachment" /></a> :
    <video key={m.id} controls playsInline preload="metadata" src={'/api/media/' + m.id} />)}</div>;
}
