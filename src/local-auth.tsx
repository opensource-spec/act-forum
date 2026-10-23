'use client';
import { useState } from 'react';
export default function LocalAuth({ lang, onDone }: { lang: 'hy' | 'en'; onDone: () => void }) {
  const [register, setRegister] = useState(false),
    [username, setUsername] = useState(''),
    [password, setPassword] = useState(''),
    [error, setError] = useState(''),
    [busy, setBusy] = useState(false);
  const en = lang === 'en';
  async function submit(e: React.FormEvent) {
    e.preventDefault();
    if (busy) return;
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
    <>
      <h2 id="dialog-title">
        {register ? (en ? 'Create account' : 'Ստեղծել հաշիվ') : en ? 'Sign in' : 'Մուտք գործել'}
      </h2>
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
            value={username}
            onChange={(e) => setUsername(e.target.value)}
          />
        </label>
        <label>
          {en ? 'Password' : 'Գաղտնաբառ'}
          <input
            required
            type="password"
            minLength={register ? 10 : 1}
            maxLength={128}
            autoComplete={register ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
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
        </button>
        <button
          type="button"
          className="auth-switch"
          onClick={() => {
            setRegister(!register);
            setError('');
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
    </>
  );
}
