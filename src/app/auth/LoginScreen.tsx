import { useState } from 'react';
import markUrl from '../brand/ukat-mark.png';
import wordmarkUrl from '../brand/ukat-wordmark.png';
import { useAuth } from './AuthProvider.tsx';

/**
 * Sign-in screen.
 *
 * Dark panel because the supplied logo is a white mark. Autocomplete attributes are set correctly so
 * password managers work properly — a login form that fights the password manager is a login form
 * that gets a weak password typed into it.
 */
export function LoginScreen() {
  const { signIn, configError } = useAuth();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const onSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (busy) return;
    setBusy(true);
    setError(null);
    const { error: err } = await signIn(email.trim(), password);
    if (err) {
      setError(err);
      setBusy(false);
    }
    // On success the auth listener swaps the whole view; leave `busy` set so the button stays
    // disabled through the transition rather than flashing back to enabled.
  };

  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--color-chrome)] px-4 py-10">
      <div className="w-full max-w-[400px]">
        {/*
          White card, so the supplied wordmark is used exactly as provided — navy "UK", magenta
          "Addiction Treatment", grey "Centres", all at full legibility. This is the one screen where
          the full lockup belongs: the front door, with room to breathe.
        */}
        <div className="rounded-2xl bg-white p-7 shadow-2xl">
          <img
            src={wordmarkUrl}
            alt="UK Addiction Treatment Centres"
            width={527}
            height={96}
            className="h-9 w-auto"
          />

          <h1 className="mt-6 text-[17px] font-semibold text-[#1f1a26]">Treatment Operations</h1>
          <p className="mt-1 text-[12.5px] text-[#635b70]">Sign in with your work account.</p>

          {configError ? (
            <div className="mt-5 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-900">
              {configError}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-[#635b70]">Email</span>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@ukat.co.uk"
                  className="rounded-lg border border-[#ddd5e8] bg-[#faf8fc] px-3 py-2.5 text-[13px] text-[#1f1a26] placeholder:text-[#9d94ab] focus:border-[var(--brand-purple)] focus:bg-white focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-[#635b70]">Password</span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-lg border border-[#ddd5e8] bg-[#faf8fc] px-3 py-2.5 text-[13px] text-[#1f1a26] focus:border-[var(--brand-purple)] focus:bg-white focus:outline-none"
                />
              </label>

              {error ? (
                <div
                  role="alert"
                  className="rounded-lg border border-red-300 bg-red-50 px-3 py-2 text-[11.5px] text-red-800"
                >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 rounded-lg bg-[var(--brand-purple)] px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[#653d88] disabled:opacity-60"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-5 flex flex-col items-center gap-2 text-center text-[10.5px] leading-relaxed text-[var(--color-chrome-ink-dim)]">
          <img src={markUrl} alt="" width={256} height={256} className="h-5 w-5 opacity-70" />
          <span>
            Development environment · fictional data only.
            <br />
            Access is granted per centre. Contact your centre manager if you cannot see a centre you
            expect.
          </span>
        </p>
      </div>
    </div>
  );
}

/** Signed in, but assigned nothing. Deny-by-default makes this a legitimate outcome. */
export function NoAccessScreen() {
  const { signOut, email } = useAuth();
  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--color-chrome)] px-4">
      <div className="max-w-[420px] text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-white/10 text-[18px] text-[var(--brand-pink)]">
          &#9873;
        </div>
        <h1 className="mt-4 text-[16px] font-semibold text-[var(--color-chrome-ink)]">
          No access assigned
        </h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-chrome-ink-dim)]">
          You are signed in as <strong className="font-medium">{email}</strong>, but no centre has been
          assigned to your account yet. Nothing is visible until an administrator grants access to at
          least one centre.
        </p>
        <button
          type="button"
          onClick={() => void signOut()}
          className="mt-5 rounded-lg border border-[var(--color-chrome-line)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-chrome-ink)] transition hover:bg-[var(--color-chrome-hover)]"
        >
          Sign out
        </button>
      </div>
    </div>
  );
}

/** Signed in, but loading the user's access failed. Shown rather than silently degraded. */
export function AccessErrorScreen() {
  const { loadError, signOut } = useAuth();
  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--color-chrome)] px-4">
      <div className="max-w-[440px] text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-red-500/15 text-[18px] text-red-300">
          !
        </div>
        <h1 className="mt-4 text-[16px] font-semibold text-[var(--color-chrome-ink)]">
          Could not load your access
        </h1>
        <p className="mt-2 text-[12.5px] leading-relaxed text-[var(--color-chrome-ink-dim)]">
          You are signed in, but your roles and permissions could not be read. Rather than show a
          partial view that might understate what you can see, nothing is loaded.
        </p>
        {loadError ? (
          <pre className="mt-3 overflow-x-auto rounded-lg bg-black/30 px-3 py-2 text-left text-[11px] text-red-200">
            {loadError}
          </pre>
        ) : null}
        <div className="mt-5 flex justify-center gap-2">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-lg bg-[var(--brand-purple)] px-3.5 py-2 text-[12.5px] font-medium text-white"
          >
            Try again
          </button>
          <button
            type="button"
            onClick={() => void signOut()}
            className="rounded-lg border border-[var(--color-chrome-line)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-chrome-ink)] transition hover:bg-[var(--color-chrome-hover)]"
          >
            Sign out
          </button>
        </div>
      </div>
    </div>
  );
}

export function LoadingScreen() {
  return (
    <div className="grid min-h-dvh place-items-center bg-[var(--color-chrome)]">
      <div className="flex flex-col items-center gap-3">
        <img
          src={markUrl}
          alt=""
          width={256}
          height={256}
          className="h-9 w-9 animate-pulse opacity-80"
        />
        <span className="text-[12px] text-[var(--color-chrome-ink-dim)]">Loading…</span>
      </div>
    </div>
  );
}
