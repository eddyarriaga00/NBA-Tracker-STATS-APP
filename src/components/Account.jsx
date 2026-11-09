import { useEffect, useState } from 'react';
import { Avatar, useNickname } from './Comments';
import { Icon } from './icons';
import { Segmented } from './ui';
import {
  accountsEnabled,
  continueWithGoogle,
  createEmailAccount,
  googleEnabled,
  signInWithEmail,
  signOut,
  useAccount,
} from '../lib/account';

function GoogleLogo() {
  return (
    <svg viewBox="0 0 48 48" className="h-[18px] w-[18px]" aria-hidden>
      <path fill="#FFC107" d="M43.6 20.5H42V20H24v8h11.3C33.7 32.7 29.2 36 24 36c-6.6 0-12-5.4-12-12s5.4-12 12-12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 12.9 4 4 12.9 4 24s8.9 20 20 20 20-8.9 20-20c0-1.3-.1-2.4-.4-3.5z" />
      <path fill="#FF3D00" d="m6.3 14.7 6.6 4.8C14.7 15.1 19 12 24 12c3.1 0 5.9 1.2 8 3.1l5.7-5.7C34.1 6.1 29.3 4 24 4 16.3 4 9.7 8.3 6.3 14.7z" />
      <path fill="#4CAF50" d="M24 44c5.2 0 9.9-2 13.4-5.2l-6.2-5.2C29.2 35.1 26.7 36 24 36c-5.2 0-9.6-3.3-11.3-8l-6.5 5C9.5 39.6 16.2 44 24 44z" />
      <path fill="#1976D2" d="M43.6 20.5H42V20H24v8h11.3c-.8 2.2-2.2 4.2-4.1 5.6l6.2 5.2C37 39.2 44 34 44 24c0-1.3-.1-2.4-.4-3.5z" />
    </svg>
  );
}

const input =
  'w-full rounded-xl bg-fill px-3.5 py-2.5 text-[16px] outline-none placeholder:text-label-3 focus-visible:ring-2 focus-visible:ring-accent';

function SignIn({ onDone, initialError = '' }) {
  const [mode, setMode] = useState('create');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState(initialError);
  const [google, setGoogle] = useState(null);
  const [name] = useNickname();

  useEffect(() => {
    googleEnabled().then(setGoogle);
    const onErr = (e) => setErr(e.detail);
    window.addEventListener('auth-error', onErr);
    return () => window.removeEventListener('auth-error', onErr);
  }, []);

  const submit = async (e) => {
    e.preventDefault();
    setErr('');
    setBusy(true);
    try {
      if (mode === 'create') await createEmailAccount(email.trim(), password, name);
      else await signInWithEmail(email.trim(), password);
      onDone();
    } catch (x) {
      setErr(x.message);
    } finally {
      setBusy(false);
    }
  };

  const google_ = async () => {
    setErr('');
    setBusy(true);
    try {
      await continueWithGoogle(); // leaves the page for Google
    } catch (x) {
      setErr(x.message);
      setBusy(false);
    }
  };

  return (
    <div>
      <div className="text-center">
        <div className="font-display text-[22px] font-bold tracking-tight">Sign in</div>
        <p className="mx-auto mt-1 max-w-xs text-[13.5px] text-label-2">
          Keep your nickname, picks and comments on every device. Everything you’ve done as a guest comes with you.
        </p>
      </div>

      {google && (
        <>
          <button
            onClick={google_}
            disabled={busy}
            className="mt-5 flex w-full items-center justify-center gap-2.5 rounded-xl bg-white py-2.5 text-[15px] font-semibold text-[#1f1f1f] shadow-[0_0_0_1px_rgba(0,0,0,0.12)] transition active:scale-[0.99] disabled:opacity-60"
          >
            <GoogleLogo />
            Continue with Google
          </button>
          <div className="my-4 flex items-center gap-3 text-[12px] text-label-3">
            <span className="h-px flex-1 bg-sep" />
            or use email
            <span className="h-px flex-1 bg-sep" />
          </div>
        </>
      )}

      <Segmented
        className={google ? '' : 'mt-5'}
        value={mode}
        onChange={(m) => {
          setMode(m);
          setErr('');
        }}
        options={[
          { value: 'create', label: 'Create account' },
          { value: 'signin', label: 'Sign in' },
        ]}
      />
      <form onSubmit={submit} className="mt-3 space-y-2.5">
        <input
          className={input}
          type="email"
          autoComplete="email"
          inputMode="email"
          placeholder="Email"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          required
        />
        <input
          className={input}
          type="password"
          autoComplete={mode === 'create' ? 'new-password' : 'current-password'}
          placeholder={mode === 'create' ? 'Password (6+ characters)' : 'Password'}
          minLength={6}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          required
        />
        {err && <p className="px-1 text-[13px] text-live">{err}</p>}
        <button disabled={busy} className="w-full rounded-xl bg-accent py-2.5 text-[15px] font-semibold text-white transition active:opacity-80 disabled:opacity-60">
          {busy ? 'One sec…' : mode === 'create' ? 'Create account' : 'Sign in'}
        </button>
        {mode === 'signin' && (
          <p className="px-1 text-center text-[11.5px] text-label-3">Signing in switches this device to that account.</p>
        )}
      </form>
    </div>
  );
}

function SignedIn({ acct, onDone }) {
  const [name] = useNickname();
  const [busy, setBusy] = useState(false);
  return (
    <div className="text-center">
      <div className="mx-auto w-fit">
        {acct.avatar ? (
          <img src={acct.avatar} alt="" referrerPolicy="no-referrer" className="h-16 w-16 rounded-full object-cover" />
        ) : (
          <Avatar name={name || acct.email} size={64} />
        )}
      </div>
      <div className="mt-2 font-display text-[22px] font-bold tracking-tight">{name || 'No nickname yet'}</div>
      <div className="text-[13.5px] text-label-2">{acct.email}</div>
      <div className="mt-1 inline-flex items-center gap-1.5 rounded-full bg-fill px-2.5 py-0.5 text-[12px] font-semibold text-label-2">
        {acct.provider === 'Google' && <GoogleLogo />}
        Signed in with {acct.provider}
      </div>
      <p className="mx-auto mt-3 max-w-xs text-[13px] text-label-2">Your nickname, picks and comments are saved to this account on every device.</p>
      <button
        disabled={busy}
        onClick={async () => {
          setBusy(true);
          await signOut();
          setBusy(false);
          onDone();
        }}
        className="mt-5 w-full rounded-xl bg-fill py-2.5 text-[15px] font-semibold text-live transition active:opacity-80"
      >
        Sign out
      </button>
    </div>
  );
}

function Sheet({ onClose, error }) {
  const acct = useAccount();
  useEffect(() => {
    const esc = (e) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', esc);
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', esc);
      document.body.style.overflow = '';
    };
  }, [onClose]);
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/40 backdrop-blur-sm md:items-center" onClick={onClose}>
      <div
        role="dialog"
        aria-modal="true"
        aria-label="Account"
        onClick={(e) => e.stopPropagation()}
        className="rise relative max-h-[90dvh] w-full overflow-y-auto rounded-t-3xl bg-card px-5 pb-[calc(20px+env(safe-area-inset-bottom))] pt-3 shadow-2xl md:max-w-md md:rounded-3xl"
      >
        <span className="mx-auto mb-3 block h-1 w-10 rounded-full bg-fill-strong md:hidden" />
        <button onClick={onClose} aria-label="Close" className="absolute right-4 top-4 grid h-8 w-8 place-items-center rounded-full bg-fill text-label-2">
          <Icon.X className="h-4 w-4" />
        </button>
        <div className="pt-4">
          {!acct ? (
            <div className="skeleton mx-auto h-[260px] rounded-2xl" />
          ) : acct.guest ? (
            <SignIn onDone={onClose} initialError={error} />
          ) : (
            <SignedIn acct={acct} onDone={onClose} />
          )}
        </div>
      </div>
    </div>
  );
}

/** Mounted once in the shell; anything can open it with openAccount(). */
export function AccountSheet() {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState('');
  useEffect(() => {
    const on = () => {
      setError('');
      setOpen(true);
    };
    const onErr = (e) => {
      setError(e.detail || 'Google sign-in didn’t finish.'); // a failed Google return shows here
      setOpen(true);
    };
    window.addEventListener('open-account', on);
    window.addEventListener('auth-error', onErr);
    return () => {
      window.removeEventListener('open-account', on);
      window.removeEventListener('auth-error', onErr);
    };
  }, []);
  if (!accountsEnabled || !open) return null;
  return <Sheet error={error} onClose={() => setOpen(false)} />;
}

/** Row at the top of the settings menu. */
export function AccountRow({ onOpen }) {
  const acct = useAccount();
  const [name] = useNickname();
  if (!accountsEnabled) return null;
  const signedIn = acct && !acct.guest;
  return (
    <button onClick={onOpen} className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-left hover:bg-fill">
      {signedIn && acct.avatar ? (
        <img src={acct.avatar} alt="" referrerPolicy="no-referrer" className="h-8 w-8 rounded-full object-cover" />
      ) : (
        <Avatar name={signedIn ? name || acct.email : name || '?'} size={32} />
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[15px] font-semibold">{signedIn ? name || acct.email : 'Sign in'}</span>
        <span className="block truncate text-[11.5px] text-label-2">
          {signedIn ? acct.email : 'Google or email · keep picks on every device'}
        </span>
      </span>
      <Icon.ChevronRight className="h-4 w-4 text-label-3" />
    </button>
  );
}
