'use client';
import { useState } from 'react';
import { Eye, EyeOff, MessageCircle, ArrowRight } from 'lucide-react';
export default function LocalAuth({ lang, onDone }: { lang: 'hy' | 'en'; onDone: () => void }) {
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const [visible, setVisible] = useState(false);
  const [confirmation, setConfirmation] = useState('');
  const en = lang === 'en';
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
    if (register && password !== confirmation) {
      setError(en ? 'Passwords do not match.' : 'Գաղտնաբառերը չեն համընկնում։');
      return;
    }
    setBusy(true);
    setError('');
    try {
      const res = await fetch(register ? '/auth/register' : '/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password }),
      });
      if (!res.ok) {
        const data = (await res.json()) as { error?: string };
        setError(
          data.error === 'ACCOUNT_BANNED'
            ? en ? 'This account has been banned.' : 'Այս հաշիվն արգելափակված է։'
            : data.error === 'USERNAME_TAKEN'
            ? en
              ? 'Username is already taken.'
              : 'Այս օգտանունն արդեն զբաղված է։'
            : data.error === 'RATE_LIMIT'
              ? en
                ? 'Too many attempts. Try again later.'
                : 'Չափազանց շատ փորձեր։ Փորձիր ավելի ուշ։'
              : data.error === 'INVALID_INPUT'
                ? en
                  ? 'Use a 3–24 character username and a password of at least 10 characters.'
                  : 'Օգտանունը՝ 3–24 նիշ, գաղտնաբառը՝ առնվազն 10 նիշ։'
                : en
                  ? 'Incorrect username or password.'
                  : 'Սխալ օգտանուն կամ գաղտնաբառ։',
        );
        return;
      }
      setPassword('');
      onDone();
    } catch {
      setError(en ? 'Connection failed. Try again.' : 'Կապի սխալ։ Փորձիր կրկին։');
    } finally {
      setBusy(false);
    }
  }
  return (
    <div className="auth-content">
      <div className="auth-brand"><MessageCircle size={25} /><span>ACT<span>Forum</span></span></div>
      <div className="auth-eyebrow">{en ? 'YOUR CAMPUS. YOUR COMMUNITY.' : 'ՔՈ ՀԱՄԱԼՍԱՐԱՆԸ։ ՔՈ ՀԱՄԱՅՆՔԸ։'}</div>
      <h2 id="dialog-title">
        {register ? (en ? 'Find your people.' : 'Գտիր քո համայնքը։') : en ? 'Welcome back.' : 'Բարի վերադարձ։'}
      </h2>
      <p className="auth-intro">{register ? (en ? 'Join the conversation. Share an idea. Make campus yours.' : 'Միացիր զրույցին։ Կիսվիր գաղափարներով։ Դարձիր համայնքի մաս։') : (en ? 'Sign in to pick up the conversation.' : 'Մուտք գործիր՝ զրույցը շարունակելու համար։')}</p>
      <form onSubmit={submit}>
        <label>
          {en ? 'Username' : 'Օգտանուն'}
          <input
            autoFocus
            required
            minLength={3}
            maxLength={24}
            pattern="[A-Za-z0-9_-]+"
            autoComplete="username"
            placeholder={en ? 'Your username' : 'Քո օգտանունը'}
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          {en ? 'Password' : 'Գաղտնաբառ'}
          <span className="auth-password"><input
            required
            type={visible ? 'text' : 'password'}
            minLength={register ? 10 : 1}
            maxLength={128}
            autoComplete={register ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          /><button type="button" aria-label={visible ? (en ? 'Hide password' : 'Թաքցնել գաղտնաբառը') : (en ? 'Show password' : 'Ցուցադրել գաղտնաբառը')} aria-pressed={visible} onClick={() => setVisible(!visible)}>{visible ? <EyeOff size={18} /> : <Eye size={18} />}</button></span>
        </label>
        {register && <label>{en ? 'Confirm password' : 'Կրկնել գաղտնաբառը'}<input required type={visible ? 'text' : 'password'} autoComplete="new-password" minLength={10} maxLength={128} value={confirmation} onChange={(e) => setConfirmation(e.target.value)} /></label>}
        {register && (
          <p>
            {en
              ? 'Use letters, numbers, _ or - in your username. Password: at least 10 characters.'
              : 'Օգտանունում օգտագործիր լատինատառեր, թվեր, _ կամ -։ Գաղտնաբառը՝ առնվազն 10 նիշ։'}
          </p>
        )}
        {error && (
          <p role="alert" className="auth-error">
            {error}
          </p>
        )}
        <button className="primary" disabled={busy}>
          {busy ? '…' : register ? (en ? 'Register' : 'Գրանցվել') : en ? 'Sign in' : 'Մուտք գործել'}
          <ArrowRight size={17} />
        </button>
        <button
          type="button"
          className="auth-switch"
          disabled={busy}
          onClick={() => {
            setRegister(!register);
            setError('');
            setPassword(''); setConfirmation(''); setVisible(false);
          }}
        >
          {register
            ? en
              ? 'Already have an account? Sign in'
              : 'Արդեն հաշիվ ունե՞ս։ Մուտք գործիր'
            : en
              ? 'Create account'
              : 'Ստեղծել հաշիվ'}
        </button>
      </form>
      <div className="auth-footnote">{en ? 'A little curiosity can start a great conversation.' : 'Մի փոքր հետաքրքրասիրությունը կարող է լավ զրույցի սկիզբ դառնալ։'}</div>
    </div>
  );
}
