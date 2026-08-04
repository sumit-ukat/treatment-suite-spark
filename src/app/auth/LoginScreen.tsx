import { useState } from 'react';
import logoUrl from '../brand/prl-logo.svg';
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
      <div className="w-full max-w-[380px]">
        <div className="mb-6 flex justify-center">
          <img src={logoUrl} alt="Primrose Lodge" className="h-10 w-auto" />
        </div>

        <div className="rounded-2xl border border-[var(--color-chrome-line)] bg-[var(--color-chrome-raised)] p-6 shadow-2xl">
          <h1 className="text-[16px] font-semibold text-[var(--color-chrome-ink)]">
            Treatment Operations
          </h1>
          <p className="mt-1 text-[12px] text-[var(--color-chrome-ink-dim)]">
            Sign in with your work account.
          </p>

          {configError ? (
            <div className="mt-4 rounded-lg border border-amber-500/40 bg-amber-500/10 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-200">
              {configError}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-5 flex flex-col gap-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-[var(--color-chrome-ink-dim)]">
                  Email
                </span>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@ukat.co.uk"
                  className="rounded-lg border border-[var(--color-chrome-line)] bg-black/25 px-3 py-2 text-[13px] text-[var(--color-chrome-ink)] placeholder:text-[var(--color-chrome-ink-dim)]/60 focus:border-[var(--brand-pink)] focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-[var(--color-chrome-ink-dim)]">
                  Password
                </span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-lg border border-[var(--color-chrome-line)] bg-black/25 px-3 py-2 text-[13px] text-[var(--color-chrome-ink)] focus:border-[var(--brand-pink)] focus:outline-none"
                />
              </label>

              {error ? (
                <div
                  role="alert"
                  className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11.5px] text-red-200"
                >
                  {error}
                </div>
              ) : null}

              <button
                type="submit"
                disabled={busy}
                className="mt-1 rounded-lg bg-[var(--brand-purple)] px-3 py-2.5 text-[13px] font-semibold text-white transition hover:bg-[var(--brand-pink)] disabled:opacity-60"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}
        </div>

        <p className="mt-4 text-center text-[10.5px] leading-relaxed text-[var(--color-chrome-ink-dim)]">
          Development environment · fictional data only.
          <br />
          Access is granted per centre. Contact your centre manager if you cannot see a centre you
          expect.
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
        <img src={logoUrl} alt="" className="h-8 w-auto opacity-70" />
        <span className="text-[12px] text-[var(--color-chrome-ink-dim)]">Loading…</span>
      </div>
    </div>
  );
}
