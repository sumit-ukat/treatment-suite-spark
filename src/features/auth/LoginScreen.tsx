import { Lock, ShieldCheck } from 'lucide-react';
import { useState } from 'react';
import wordmarkUrl from '../../assets/brand/ukat-wordmark.png';
import { BrandMark } from '../../components/brand.tsx';
import { useAuth } from './AuthProvider.tsx';

/**
 * Sign-in screen — a split hero layout ported from the Lovable redesign's own sign-in page.
 *
 * Its two headline stats there were "10 Centres" and "185 Beds"; the second is fabricated (this
 * codebase's real bed capacities are confirmed for Primrose Lodge only — see centres-data.ts's own
 * header comment), and a login screen has no disclaimer banner nearby the way the dashboard does to
 * say so. Dropped rather than carried over as if it were fact; "10 Centres" and "24/7" stay, since
 * both are true regardless of any one centre's configuration.
 *
 * Autocomplete attributes are set correctly so password managers work properly — a login form that
 * fights the password manager is a login form that gets a weak password typed into it.
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
    <div className="grid min-h-dvh lg:grid-cols-[1.05fr_1fr]">
      <aside className="brand-gradient relative hidden flex-col justify-between overflow-hidden p-12 text-white lg:flex">
        <div aria-hidden className="absolute -top-32 -right-24 size-[28rem] rounded-full bg-brand-blue/25 blur-3xl" />
        <div aria-hidden className="absolute -bottom-40 -left-20 size-[26rem] rounded-full bg-brand-pink/30 blur-3xl" />

        <div className="relative flex items-center gap-3">
          <BrandMark />
          <div>
            <p className="font-display text-sm font-semibold">Treatment Operations</p>
            <p className="text-xs opacity-80">UK Addiction Treatment Centres</p>
          </div>
        </div>

        <div className="relative max-w-lg">
          <h1 className="font-display text-4xl leading-tight font-semibold">
            The daily working view of every bed, every client, every action.
          </h1>
          <p className="mt-4 text-sm leading-relaxed opacity-85">
            Ten residential centres in one calm operational picture — occupancy, admissions,
            required care actions and a complete audit trail.
          </p>
          <dl className="mt-10 grid grid-cols-2 gap-6">
            {([['10', 'Centres'], ['24/7', 'Coverage']] as const).map(([v, l]) => (
              <div key={l}>
                <dt className="nums font-display text-2xl font-semibold">{v}</dt>
                <dd className="text-xs opacity-80">{l}</dd>
              </div>
            ))}
          </dl>
        </div>

        <p className="relative flex items-center gap-2 text-xs opacity-80">
          <ShieldCheck className="size-4" /> Access is logged. All activity appears in audit history.
        </p>
      </aside>

      <main className="flex items-center justify-center bg-[var(--color-surface)] px-5 py-12 sm:px-10">
        <div className="w-full max-w-sm">
          {/*
            The full wordmark lockup — navy "UK", magenta "Addiction Treatment", grey "Centres" — on
            the mobile header (where the dark hero panel is hidden) and nowhere else on this side; the
            hero panel already carries the mark-only BrandMark for anyone on a wide enough screen to
            see both.
          */}
          <img
            src={wordmarkUrl}
            alt="UK Addiction Treatment Centres"
            width={527}
            height={96}
            className="mb-8 h-8 w-auto lg:hidden"
          />

          <h2 className="font-display text-2xl font-semibold text-[var(--color-ink)]">Sign in</h2>
          <p className="mt-1.5 text-sm text-[var(--color-ink-muted)]">
            Use your UKAT staff account to continue.
          </p>

          {configError ? (
            <div className="mt-5 rounded-lg border border-amber-400 bg-amber-50 px-3 py-2.5 text-[11.5px] leading-relaxed text-amber-900">
              {configError}
            </div>
          ) : (
            <form onSubmit={onSubmit} className="mt-8 flex flex-col gap-3.5">
              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-[var(--color-ink-muted)]">
                  Work email
                </span>
                <input
                  type="email"
                  name="email"
                  autoComplete="username"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="you@ukat.co.uk"
                  className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2.5 text-[13px] text-[var(--color-ink)] transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none"
                />
              </label>

              <label className="flex flex-col gap-1.5">
                <span className="text-[11.5px] font-medium text-[var(--color-ink-muted)]">
                  Password
                </span>
                <input
                  type="password"
                  name="password"
                  autoComplete="current-password"
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-3 py-2.5 text-[13px] text-[var(--color-ink)] transition focus:border-[var(--color-accent)] focus:outline-none"
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
                className="mt-1 h-11 rounded-lg bg-[var(--color-accent)] text-[13px] font-semibold text-white transition hover:bg-[var(--color-accent-hover)] disabled:opacity-60"
              >
                {busy ? 'Signing in…' : 'Sign in'}
              </button>
            </form>
          )}

          <p className="mt-6 flex items-center gap-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3 text-xs text-[var(--color-ink-muted)]">
            <Lock className="size-4 shrink-0" />
            Development environment · fictional data only. Access is granted per centre — contact
            your centre manager if you cannot see a centre you expect.
          </p>
        </div>
      </main>
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
        <BrandMark className="animate-pulse" />
        <span className="text-[12px] text-[var(--color-chrome-ink-dim)]">Loading…</span>
      </div>
    </div>
  );
}
