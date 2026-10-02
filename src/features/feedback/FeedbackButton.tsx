import { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { AlertTriangle, Camera, Check, Loader2, Megaphone } from 'lucide-react';
import html2canvas from 'html2canvas';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
import { feedback as feedbackService } from '../../services/data-access.js';

type Kind = 'bug' | 'feature_request';

const KIND_OPTIONS: ReadonlyArray<{ value: Kind; label: string; hint: string }> = [
  {
    value: 'bug',
    label: 'Something is broken',
    hint: 'An error, wrong data, or a page not behaving as it should.',
  },
  {
    value: 'feature_request',
    label: "Something is missing",
    hint: "A feature or option that isn't here yet but should be.",
  },
];

/**
 * Captures only the visible viewport, not the full (possibly very long) page — faster, and keeps the
 * image well under the feedback-screenshots bucket's 5MB limit without needing to downscale after.
 * Returns null on any failure (unsupported CSS, a decode error) rather than blocking the report —
 * the checkbox below simply has nothing to offer in that case.
 */
async function captureViewport(): Promise<Blob | null> {
  try {
    const canvas = await html2canvas(document.body, {
      x: window.scrollX,
      y: window.scrollY,
      width: window.innerWidth,
      height: window.innerHeight,
      windowWidth: window.innerWidth,
      windowHeight: window.innerHeight,
      scale: Math.min(window.devicePixelRatio || 1, 1.5),
      backgroundColor: '#ffffff',
      logging: false,
    });
    return await new Promise((resolve) => canvas.toBlob((blob) => resolve(blob), 'image/jpeg', 0.85));
  } catch {
    return null;
  }
}

/**
 * The header's always-visible "Feedback" trigger. Capture happens before the dialog opens — never
 * while it's on screen — so a snapshot always shows the real page the user was looking at, not this
 * form. Screenshot stays opt-in even once captured: the checkbox below defaults off, since this app
 * routinely has a client's clinical detail on screen.
 */
export function FeedbackButton({ centreId }: { centreId: string | null }) {
  const location = useLocation();
  const [open, setOpen] = useState(false);
  const [preparing, setPreparing] = useState(false);
  const [kind, setKind] = useState<Kind>('bug');
  const [description, setDescription] = useState('');
  const [includeScreenshot, setIncludeScreenshot] = useState(false);
  const [screenshot, setScreenshot] = useState<{ blob: Blob; previewUrl: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [submitted, setSubmitted] = useState(false);

  function reset() {
    setKind('bug');
    setDescription('');
    setIncludeScreenshot(false);
    if (screenshot) URL.revokeObjectURL(screenshot.previewUrl);
    setScreenshot(null);
    setError(null);
    setSubmitted(false);
  }

  async function handleOpen() {
    setPreparing(true);
    const blob = await captureViewport();
    setPreparing(false);
    setScreenshot(blob ? { blob, previewUrl: URL.createObjectURL(blob) } : null);
    setOpen(true);
  }

  function closeDialog() {
    setOpen(false);
    reset();
  }

  async function submit() {
    if (!description.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await feedbackService.submit({
        kind,
        description: description.trim(),
        pagePath: location.pathname,
        centreId,
        screenshot: includeScreenshot && screenshot ? screenshot.blob : undefined,
      });
      setSubmitted(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not send that — please try again.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <>
      <button
        type="button"
        onClick={() => void handleOpen()}
        disabled={preparing}
        title="Report an issue or suggest a feature"
        className="flex items-center gap-1.5 rounded-lg px-2 py-1.5 text-[12px] font-medium text-[var(--color-ink-muted)] transition hover:bg-black/5 hover:text-[var(--color-ink)] disabled:opacity-60 dark:hover:bg-white/10"
      >
        {preparing ? (
          <Loader2 className="size-4 animate-spin" aria-hidden="true" />
        ) : (
          <Megaphone className="size-4" aria-hidden="true" />
        )}
        <span className="hidden lg:inline">Feedback</span>
      </button>

      <Dialog open={open} onOpenChange={(v) => !v && closeDialog()}>
        <DialogContent className="flex max-h-[90vh] w-full max-w-[480px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <DialogTitle className="sr-only">Report an issue or suggest a feature</DialogTitle>

          {submitted ? (
            <div className="flex flex-col items-center gap-3 px-6 py-10 text-center">
              <span className="grid size-10 place-items-center rounded-full bg-emerald-500/12 text-emerald-700 dark:bg-emerald-400/15 dark:text-emerald-300">
                <Check className="size-5" aria-hidden="true" />
              </span>
              <p className="text-[13.5px] font-semibold">Thanks — that's been logged.</p>
              <p className="text-[12px] text-[var(--color-ink-muted)]">
                It's in the tool feedback log now, and the team watching it has been notified.
              </p>
              <button
                type="button"
                onClick={closeDialog}
                className="mt-2 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white"
              >
                Done
              </button>
            </div>
          ) : (
            <>
              <div className="flex items-center gap-2 border-b border-[var(--color-line)] px-5 py-3.5">
                <Megaphone className="size-4 text-[var(--color-accent)]" aria-hidden="true" />
                <span className="text-[13.5px] font-semibold">Report an issue or suggest a feature</span>
              </div>

              <div className="flex flex-col gap-4 overflow-y-auto px-5 py-4">
                <div className="flex flex-col gap-1.5">
                  <p className="text-[10.5px] font-medium text-[var(--color-ink-muted)]">What's this about?</p>
                  {KIND_OPTIONS.map((opt) => (
                    <button
                      key={opt.value}
                      type="button"
                      onClick={() => setKind(opt.value)}
                      className={`flex items-start gap-2.5 rounded-xl border p-2.5 text-left transition ${
                        kind === opt.value
                          ? 'border-[var(--color-accent)] bg-[var(--color-accent-soft)]'
                          : 'border-[var(--color-line)]'
                      }`}
                    >
                      <span
                        className={`mt-0.5 grid size-4 shrink-0 place-items-center rounded-full text-[9px] font-bold ${
                          kind === opt.value ? 'bg-[var(--color-accent)] text-white' : 'bg-black/[0.06] dark:bg-white/10'
                        }`}
                      >
                        {kind === opt.value ? <Check className="size-2.5" aria-hidden="true" /> : null}
                      </span>
                      <span>
                        <span className="block text-[12px] font-semibold">{opt.label}</span>
                        <span className="block text-[11px] text-[var(--color-ink-muted)]">{opt.hint}</span>
                      </span>
                    </button>
                  ))}
                </div>

                <label className="block text-[10.5px] font-medium text-[var(--color-ink-muted)]">
                  {kind === 'bug' ? 'What happened?' : "What's the idea?"}
                  <textarea
                    autoFocus
                    rows={4}
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    placeholder={
                      kind === 'bug'
                        ? 'What were you doing, and what went wrong?'
                        : "What would you like the tool to do that it doesn't today?"
                    }
                    className="mt-1 block w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2.5 py-2 text-[12.5px] outline-none focus:border-[var(--color-accent)]"
                  />
                </label>

                <div className="rounded-xl border border-[var(--color-line)] p-3">
                  <label className="flex cursor-pointer items-start gap-2.5">
                    <input
                      type="checkbox"
                      checked={includeScreenshot}
                      disabled={!screenshot}
                      onChange={(e) => setIncludeScreenshot(e.target.checked)}
                      className="mt-0.5 rounded accent-[var(--color-accent)]"
                    />
                    <span className="min-w-0">
                      <span className="flex items-center gap-1.5 text-[12px] font-medium">
                        <Camera className="size-3.5" aria-hidden="true" />
                        Include a screenshot of this screen
                        {!screenshot ? (
                          <span className="text-[10.5px] font-normal text-[var(--color-ink-muted)]">(unavailable)</span>
                        ) : null}
                      </span>
                      <span className="mt-0.5 flex items-start gap-1 text-[10.5px] text-[var(--color-ink-muted)]">
                        <AlertTriangle
                          className="mt-0.5 size-3 shrink-0 text-amber-600 dark:text-amber-400"
                          aria-hidden="true"
                        />
                        Off by default — only turn this on if the screen doesn't show a client's name or clinical
                        details.
                      </span>
                    </span>
                  </label>
                  {includeScreenshot && screenshot ? (
                    <img
                      src={screenshot.previewUrl}
                      alt="Screenshot preview"
                      className="mt-2.5 max-h-40 w-full rounded-lg border border-[var(--color-line)] object-cover object-top"
                    />
                  ) : null}
                </div>

                {error ? <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
              </div>

              <div className="flex items-center justify-end gap-2 border-t border-[var(--color-line)] px-5 py-3">
                <button
                  type="button"
                  onClick={closeDialog}
                  disabled={busy}
                  className="rounded-md px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  disabled={busy || !description.trim()}
                  onClick={() => void submit()}
                  className="flex items-center gap-1.5 rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white transition disabled:opacity-40"
                >
                  {busy ? <Loader2 className="size-3.5 animate-spin" aria-hidden="true" /> : null}
                  {busy ? 'Sending…' : 'Send'}
                </button>
              </div>
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
