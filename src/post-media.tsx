import { useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';
export type Upload = { type: string; data: string };
export function MediaPicker({ value, onChange, lang, onBusy, disabled }: { value: Upload[]; onChange: (items: Upload[]) => void; lang: string; onBusy: (value: boolean) => void; disabled: boolean }) {
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  return <section className="media-picker"><label>{lang === 'en' ? 'Add photos or video' : 'Ավելացնել նկարներ կամ տեսանյութ'}
    <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4" disabled={busy || disabled} onChange={async (e) => {
      const files = Array.from(e.target.files || []); e.target.value = ''; if (!files.length) return; setError(''); setBusy(true); onBusy(true);
      try {
        const photos = files.filter((f) => f.type.startsWith('image/')), videos = files.filter((f) => f.type === 'video/mp4');
        if (photos.length + videos.length !== files.length || photos.length + value.filter((f) => f.type !== 'video/mp4').length > 3 || videos.length + value.filter((f) => f.type === 'video/mp4').length > 1 || photos.some((f) => f.size > 5*1024*1024) || videos.some((f) => f.size > 25*1024*1024)) throw Error();
        const items = await Promise.all(files.map((file) => new Promise<Upload>((resolve,reject) => {
          const reader = new FileReader(); reader.onload = () => resolve({ type: file.type, data: String(reader.result).split(',')[1] }); reader.onerror = reject; reader.readAsDataURL(file);
        })));
        onChange([...value, ...items]);
      } catch { setError(lang === 'en' ? 'Choose up to 3 photos (5 MB each) and 1 MP4 (25 MB).' : 'Ընտրիր մինչև 3 նկար (յուրաքանչյուրը՝ 5 ՄԲ) և 1 MP4 (25 ՄԲ)։'); }
      finally { setBusy(false); onBusy(false); }
    }} /></label>
    <div className="media-previews">{value.map((item, index) => <div className="media-preview" key={index}>
      {item.type === 'video/mp4' ? <div className="video-placeholder">MP4</div> : <img src={`data:${item.type};base64,${item.data}`} alt={(lang === 'en' ? 'Photo ' : 'Նկար ') + (index + 1)} />}
      <button type="button" disabled={busy || disabled} onClick={() => onChange(value.filter((_, i) => i !== index))}>{lang === 'en' ? 'Remove' : 'Հեռացնել'} {index + 1}</button>
    </div>)}</div>
    <small>{lang === 'en' ? '3 photos · 5 MB each · 15 MB total. 1 MP4 · 25 MB · 30 seconds · H.264/AAC.' : '3 նկար · 5 ՄԲ յուրաքանչյուրը · 15 ՄԲ ընդհանուր։ 1 MP4 · 25 ՄԲ · 30 վայրկյան · H.264/AAC։'}</small>
    {busy && <p role="status">…</p>}{error && <p role="alert">{error}</p>}
  </section>;
}
export function PostMedia({ media, lang }: { media?: string; lang: string }) {
  const items: { id: string; type: string }[] = JSON.parse(media || '[]');
  const [selected, setSelected] = useState(0);
  if (!items.length) return null;
  const index = Math.min(selected, items.length - 1), item = items[index], en = lang === 'en';
  return <section className="post-media" aria-label={en ? 'Post attachments' : 'Գրառման ֆայլեր'} onClick={(e) => e.stopPropagation()}>
    <div className="media-stage">
      {item.type.startsWith('image/') ? <a key={item.id} href={'/api/media/' + item.id} target="_blank" rel="noreferrer"><img loading="lazy" src={'/api/media/' + item.id} alt={(en ? 'Photo ' : 'Նկար ') + (index + 1)} /></a> :
        <video key={item.id} controls playsInline preload="metadata" src={'/api/media/' + item.id} />}
      {items.length > 1 && <>
        <button type="button" className="media-arrow media-previous" disabled={index === 0} aria-label={en ? 'Previous attachment' : 'Նախորդ ֆայլը'} onClick={() => setSelected(index - 1)}><ChevronLeft size={24} /></button>
        <button type="button" className="media-arrow media-next" disabled={index === items.length - 1} aria-label={en ? 'Next attachment' : 'Հաջորդ ֆայլը'} onClick={() => setSelected(index + 1)}><ChevronRight size={24} /></button>
        <span className="media-counter" role="status" aria-live="polite">{index + 1} / {items.length}</span>
      </>}
    </div>
  </section>;
}
