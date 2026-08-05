import { useEffect } from 'react';
import type { BoardBed } from './board-data.js';
import { formatDate, formatDateWithDay } from '../../lib/format.js';
import { PhotoBadge } from './BedCard.tsx';
import { Chip } from '../../components/ui.tsx';

const CATEGORY_LABEL: Record<string, string> = {
  family_contact: 'Family contact',
  milestone: 'Treatment milestone',
  session: 'Session',
  medical: 'Medical',
  survey: 'Survey',
  discharge: 'Discharge',
  admin: 'Admin',
};

export function DetailPanel({ bed, onClose }: { bed: BoardBed; onClose: () => void }) {
  const o = bed.occupant;

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  if (!o) return null;

  const sorted = [...o.tasks].sort((a, b) => {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt.getTime() - b.dueAt.getTime();
  });

  return (
    <>
      <div
        className="fixed inset-0 z-20 bg-black/25 backdrop-blur-[1px]"
        onClick={onClose}
        aria-hidden="true"
      />
      <aside
        role="dialog"
        aria-modal="true"
        aria-label={`Client file ${o.reference}`}
        className="fixed inset-y-0 right-0 z-30 flex w-full max-w-[440px] flex-col border-l border-[var(--color-line)] bg-[var(--color-panel)] shadow-2xl"
      >
        <header className="flex items-start gap-3 border-b border-[var(--color-line)] p-4">
          <PhotoBadge occupant={o} size="lg" />
          <div className="min-w-0 flex-1">
            <div className="truncate text-[15px] font-semibold">{o.displayName}</div>
            <div className="nums mt-0.5 text-[11.5px] text-[var(--color-ink-muted)]">
              {o.reference} &middot; Bed {bed.label} &middot; Group {o.group}
            </div>
            <div className="mt-1.5 flex flex-wrap gap-1">
              {o.hasRestrictedAlert ? (
                <Chip icon="&#9873;" label="Restricted alert" tone="alert" />
              ) : null}
              {o.photoState !== 'verified' ? (
                <Chip
                  icon="!"
                  label={o.photoState === 'missing' ? 'No photograph' : 'Photo unverified'}
                  tone="warn"
                />
              ) : null}
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-2 py-1 text-[13px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            aria-label="Close panel"
          >
            &#10005;
          </button>
        </header>

        <div className="nums grid grid-cols-2 gap-y-3 border-b border-[var(--color-line)] p-4 text-[12px]">
          <Fact label="Admitted" value={formatDateWithDay(o.admittedAt)} />
          <Fact label="Planned discharge" value={formatDateWithDay(o.plannedDischargeDate)} />
          <Fact label="Treatment day" value={`${o.treatmentDay} of ${o.durationDays}`} />
          <Fact
            label="Family meeting"
            value={
              o.familyMeetingEligibleNow
                ? 'Eligible now'
                : `From ${formatDate(o.familyMeetingEligibleFrom)}`
            }
          />
          <Fact label="Focal therapist" value={o.therapist ?? 'Not assigned'} />
          <Fact label="Buddy" value={o.buddy} />
        </div>

        <div className="min-h-0 flex-1 overflow-y-auto p-4">
          <div className="mb-2.5 flex items-baseline justify-between">
            <h3 className="text-[11px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
              Required actions
            </h3>
            <span className="nums text-[11px] text-[var(--color-ink-muted)]">
              {o.completedCount} of {o.totalCount} complete
            </span>
          </div>

          <p className="mb-3 rounded-lg bg-[var(--color-accent-soft)] px-2.5 py-2 text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
            Each action carries a <strong className="font-semibold">due date</strong> separate from
            its completion. That is what makes lateness measurable &mdash; the whiteboard stores one
            value per action, so it cannot record &ldquo;due Monday, done Wednesday&rdquo;.
          </p>

          <ul className="flex flex-col gap-1">
            {sorted.map((t) => (
              <li
                key={t.code}
                className="flex items-center gap-2.5 rounded-lg border border-[var(--color-line)] px-2.5 py-2"
              >
                <span
                  aria-hidden="true"
                  className={`grid size-[17px] shrink-0 place-items-center rounded-full text-[9.5px] font-bold ${
                    t.isComplete
                      ? 'bg-emerald-600 text-white'
                      : t.isOverdue
                        ? 'bg-red-600 text-white'
                        : t.isDueToday
                          ? 'bg-amber-500 text-white'
                          : 'border border-[var(--color-line)]'
                  }`}
                >
                  {t.isComplete ? '✓' : t.isOverdue ? '!' : t.isDueToday ? '●' : ''}
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-[12.5px] leading-tight">{t.title}</span>
                  <span className="text-[10px] text-[var(--color-ink-muted)]">
                    {CATEGORY_LABEL[t.category] ?? t.category}
                  </span>
                </span>
                <span className="nums shrink-0 text-right text-[11px] text-[var(--color-ink-muted)]">
                  {t.dueAt ? formatDate(t.dueAt) : '—'}
                </span>
                {t.isComplete ? (
                  <Chip icon="&#10003;" label="Done" tone="good" />
                ) : t.isOverdue ? (
                  <Chip icon="&#9650;" label="Overdue" tone="alert" />
                ) : t.isDueToday ? (
                  <Chip icon="&#9679;" label="Today" tone="warn" />
                ) : (
                  <Chip icon="&#9719;" label="Open" />
                )}
              </li>
            ))}
          </ul>
        </div>

        <footer className="border-t border-[var(--color-line)] px-4 py-3 text-[11px] text-[var(--color-ink-muted)]">
          Detox, medical, safeguarding and therapy notes are not shown in this preview &mdash; they
          sit behind sensitivity level 3 and need the access model first.
        </footer>
      </aside>
    </>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0 pr-3">
      <div className="text-[10.5px] text-[var(--color-ink-muted)]">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}
