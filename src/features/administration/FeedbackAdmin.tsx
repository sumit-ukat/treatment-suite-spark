import { useEffect, useState } from 'react';
import { Mail, Plus, Trash2 } from 'lucide-react';
import { useAuth } from '../auth/AuthProvider.tsx';
import { feedback as feedbackService, type FeedbackRecipientRow, type FeedbackRow } from '../../services/data-access.js';
import { Chip, Panel, type Tone } from '../../components/ui.tsx';

const STATUS_LABEL: Record<FeedbackRow['status'], string> = {
  open: 'Open',
  in_progress: 'In progress',
  resolved: 'Resolved',
  wont_fix: "Won't fix",
};

const STATUS_TONE: Record<FeedbackRow['status'], Tone> = {
  open: 'alert',
  in_progress: 'warn',
  resolved: 'good',
  wont_fix: 'neutral',
};

function StatusDot({ status }: { status: FeedbackRow['status'] }) {
  const color: Record<Tone, string> = {
    neutral: 'bg-[var(--color-ink-muted)]',
    good: 'bg-emerald-500',
    warn: 'bg-amber-500',
    alert: 'bg-red-500',
    accent: 'bg-[var(--color-accent)]',
  };
  return <span aria-hidden="true" className={`size-1.5 shrink-0 rounded-full ${color[STATUS_TONE[status]]}`} />;
}

function formatDateTime(iso: string): string {
  return new Date(iso).toLocaleString('en-GB', {
    day: 'numeric',
    month: 'short',
    hour: '2-digit',
    minute: '2-digit',
  });
}

/**
 * The "tool issue log" (migration 0085) — bug reports and feature requests filed from the
 * `FeedbackButton` in both headers. Email notification to `feedback_recipients` is a deliberately
 * separate, not-yet-built step (needs an email provider the user hasn't set up yet); this screen is
 * already the real, durable record regardless of whether that step ever lands.
 */
export function FeedbackAdmin() {
  const { can } = useAuth();
  const canManage = can('administration.manage_users');

  const [rows, setRows] = useState<FeedbackRow[]>([]);
  const [recipients, setRecipients] = useState<FeedbackRecipientRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [reloadToken, setReloadToken] = useState(0);
  const [newEmail, setNewEmail] = useState('');
  const [recipientError, setRecipientError] = useState<string | null>(null);
  const [busyRecipientAction, setBusyRecipientAction] = useState(false);

  useEffect(() => {
    if (!canManage) {
      setLoading(false);
      return;
    }
    let cancelled = false;
    setLoading(true);
    Promise.all([feedbackService.list(), feedbackService.recipients.list()])
      .then(([f, r]) => {
        if (cancelled) return;
        setRows(f);
        setRecipients(r);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (!cancelled) setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [canManage, reloadToken]);

  const reload = () => setReloadToken((t) => t + 1);

  async function changeStatus(id: string, status: FeedbackRow['status']) {
    setRows((prev) => prev.map((r) => (r.id === id ? { ...r, status } : r)));
    try {
      await feedbackService.setStatus(id, status);
    } catch {
      reload();
    }
  }

  async function addRecipient() {
    const email = newEmail.trim();
    if (!email) return;
    setBusyRecipientAction(true);
    setRecipientError(null);
    try {
      await feedbackService.recipients.add(email);
      setNewEmail('');
      reload();
    } catch (err) {
      setRecipientError(err instanceof Error ? err.message : 'Could not add that address.');
    } finally {
      setBusyRecipientAction(false);
    }
  }

  async function removeRecipient(id: string) {
    setBusyRecipientAction(true);
    try {
      await feedbackService.recipients.remove(id);
      reload();
    } finally {
      setBusyRecipientAction(false);
    }
  }

  if (!canManage) {
    return (
      <div className="mx-auto max-w-[480px] px-5 py-16 text-center">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to view tool feedback.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading tool feedback…</div>;
  }

  if (loadError) {
    return (
      <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        Could not load this screen: {loadError}
      </div>
    );
  }

  const openCount = rows.filter((r) => r.status === 'open').length;

  return (
    <div className="flex flex-col gap-4 p-4 sm:p-5">
      <Panel
        title="Recipients"
        subtitle="Email addresses notified when someone files a report — not wired up to an email provider yet."
      >
        <div className="flex flex-col gap-2">
          {recipients.map((r) => (
            <div
              key={r.id}
              className="flex items-center justify-between gap-2 rounded-lg border border-[var(--color-line)] px-3 py-2"
            >
              <span className="flex min-w-0 items-center gap-2 text-[12.5px]">
                <Mail className="size-3.5 shrink-0 text-[var(--color-ink-muted)]" aria-hidden="true" />
                <span className="truncate">{r.email}</span>
              </span>
              <button
                type="button"
                onClick={() => void removeRecipient(r.id)}
                disabled={busyRecipientAction}
                title="Remove"
                className="shrink-0 rounded-md p-1 text-[var(--color-ink-muted)] transition hover:bg-red-500/10 hover:text-red-600 disabled:opacity-40"
              >
                <Trash2 className="size-3.5" aria-hidden="true" />
              </button>
            </div>
          ))}
          <div className="mt-1 flex items-center gap-2">
            <input
              type="email"
              value={newEmail}
              onChange={(e) => setNewEmail(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && void addRecipient()}
              placeholder="name@ukat.co.uk"
              className="min-w-0 flex-1 rounded-md border border-[var(--color-line)] bg-transparent px-2.5 py-1.5 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
            />
            <button
              type="button"
              onClick={() => void addRecipient()}
              disabled={busyRecipientAction || !newEmail.trim()}
              className="flex shrink-0 items-center gap-1 rounded-md bg-[var(--color-accent)] px-2.5 py-1.5 text-[12px] font-medium text-white disabled:opacity-40"
            >
              <Plus className="size-3.5" aria-hidden="true" /> Add
            </button>
          </div>
          {recipientError ? <p className="text-[11px] text-red-600 dark:text-red-400">{recipientError}</p> : null}
        </div>
      </Panel>

      <Panel
        title="Reports"
        subtitle={`${rows.length} filed${openCount ? ` · ${openCount} open` : ''}`}
      >
        {rows.length === 0 ? (
          <p className="py-6 text-center text-[12.5px] text-[var(--color-ink-muted)]">Nothing filed yet.</p>
        ) : (
          <div className="flex flex-col gap-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-[var(--color-line)] p-3">
                <div className="flex flex-wrap items-center gap-2">
                  <Chip
                    label={r.kind === 'bug' ? 'Bug' : 'Feature request'}
                    tone={r.kind === 'bug' ? 'alert' : 'accent'}
                  />
                  <label className="flex items-center gap-1.5 rounded-md border border-[var(--color-line)] px-1.5 py-0.5">
                    <StatusDot status={r.status} />
                    <select
                      value={r.status}
                      onChange={(e) => void changeStatus(r.id, e.target.value as FeedbackRow['status'])}
                      className="bg-transparent text-[11px] font-medium outline-none"
                    >
                      {(Object.keys(STATUS_LABEL) as FeedbackRow['status'][]).map((s) => (
                        <option key={s} value={s}>
                          {STATUS_LABEL[s]}
                        </option>
                      ))}
                    </select>
                  </label>
                  <span className="ml-auto text-[11px] text-[var(--color-ink-muted)]">
                    {formatDateTime(r.created_at)}
                  </span>
                </div>

                <p className="mt-2 text-[12.5px] whitespace-pre-wrap">{r.description}</p>

                <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[11px] text-[var(--color-ink-muted)]">
                  <span>{r.reporter_name ?? r.reporter_email ?? 'Unknown user'}</span>
                  {r.page_path ? <span className="font-mono">{r.page_path}</span> : null}
                </div>

                {r.screenshot_url ? (
                  <a
                    href={r.screenshot_url}
                    target="_blank"
                    rel="noreferrer"
                    className="mt-2 inline-block overflow-hidden rounded-lg border border-[var(--color-line)]"
                  >
                    <img src={r.screenshot_url} alt="Attached screenshot" className="h-28 w-auto object-cover object-top" />
                  </a>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </Panel>
    </div>
  );
}
