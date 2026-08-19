import { useEffect, useRef, useState } from 'react';
import { Calendar, ChevronDown, ChevronLeft, ChevronRight, ChevronUp, Pencil, X } from 'lucide-react';
import type { BoardBed, BoardTask, Occupant } from './board-data.js';
import { ExtendStayCard } from './ExtendStayCard.tsx';
import { formatDate, formatDateWithDay } from '../../lib/format.js';
import { formatBytes } from '../../lib/image.js';
import { PhotoBadge } from './BedCard.tsx';
import { StatusBadge, type StatusKey } from '../../components/status-badge.tsx';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
import { admissions, clients, clientPhotos, concerns, tasks as taskService, type ConcernRow, type TaskDateChangeRow } from '../../services/data-access.js';
import { DischargeWorkflowCard } from './DischargeWorkflowCard.tsx';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { calendarDaysBetween } from '../../domain/zoned-time.js';
import { useAuth } from '../auth/AuthProvider.tsx';

// TODO: same scoped simplification as real-board-data.ts — every configured centre today is
// Europe/London.
const TZ = PRIMROSE_LODGE_SETTINGS.timezone;


const CONCERN_LABEL: Record<string, string> = {
  behaviour: 'Behaviour',
  risk: 'Risk',
  medical: 'Medical',
  welfare: 'Welfare',
  general: 'General',
};

const CATEGORY_LABEL: Record<string, string> = {
  family_contact: 'Family contact',
  milestone: 'Treatment milestone',
  session: 'Session',
  medical: 'Medical',
  survey: 'Survey',
  discharge: 'Discharge',
  admin: 'Admin',
};

/**
 * The client file, redesigned to match the source layout: a centred dialog rather than a right-hand
 * drawer, with identity/facts/progress across the top and a two-column body below (discharge +
 * treatment journey on the left, required actions on the right).
 *
 * Two facts the source mockup shows that this component deliberately omits: pronoun and funding
 * route. Neither exists anywhere in the real schema (clients has no pronoun column; no table records
 * a funding route at all), and every other value here is real — adding two fabricated facts to an
 * otherwise honest panel would be worse than leaving a gap. `date_of_birth` does exist on `clients`
 * but is never collected for any client in this database yet, so showing "Born —" for literally every
 * record would be noise, not signal; it can be added back the day it is actually populated.
 */
export function DetailPanel({
  bed,
  centreId,
  onClose,
  onChanged,
  onPrev,
  onNext,
  readOnly = false,
}: {
  bed: BoardBed;
  centreId: string;
  onClose: () => void;
  /**
   * Called after a task completion/reopen or a discharge action lands, so the board re-reads rather
   * than guessing the new state — a discharge in particular changes which bed this occupant is even
   * on (none, once discharged), which is not something to reconstruct locally.
   */
  onChanged?: (() => void) | undefined;
  onPrev?: (() => void) | undefined;
  onNext?: (() => void) | undefined;
  /** When true the panel is in archive/snapshot mode — all mutation controls are hidden. */
  readOnly?: boolean;
}) {
  const { can } = useAuth();
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [extendStayOpen, setExtendStayOpen] = useState(false);
  const [dischargeOpen, setDischargeOpen] = useState(false);
  const [highRiskBusy, setHighRiskBusy] = useState(false);
  const [editNotesMode, setEditNotesMode] = useState(false);
  const [notesText, setNotesText] = useState('');
  const [notesBusy, setNotesBusy] = useState(false);
  const [notesError, setNotesError] = useState<string | null>(null);
  const [editDetailsMode, setEditDetailsMode] = useState(false);
  const [detailsForm, setDetailsForm] = useState({ therapist: '', buddy: '', keyworker: '', group: '', substance: '', peep: false });
  const [detailsBusy, setDetailsBusy] = useState(false);
  const [detailsError, setDetailsError] = useState<string | null>(null);
  const [editNameMode, setEditNameMode] = useState(false);
  const [nameForm, setNameForm] = useState({ firstName: '', lastName: '' });
  const [nameBusy, setNameBusy] = useState(false);
  const [nameError, setNameError] = useState<string | null>(null);
  const [localDisplayName, setLocalDisplayName] = useState<string | null>(null);
  const [concernEditId, setConcernEditId] = useState<string | null>(null);
  const [concernEditText, setConcernEditText] = useState('');
  const [concernBusy, setConcernBusy] = useState(false);
  const [concernError, setConcernError] = useState<string | null>(null);
  const [newConcernMode, setNewConcernMode] = useState(false);
  const [newConcernText, setNewConcernText] = useState('');
  const [newConcernBusy, setNewConcernBusy] = useState(false);
  const [newConcernError, setNewConcernError] = useState<string | null>(null);
  const [concernRows, setConcernRows] = useState<ConcernRow[]>([]);
  const clientId = bed.occupant?.clientId;
  useEffect(() => {
    if (!clientId) return;
    concerns.list(centreId, clientId).then(setConcernRows).catch(() => {});
  }, [centreId, clientId]);

  const o = bed.occupant;
  if (!o) return null;

  async function toggleHighRisk() {
    if (!o?.admissionId) return;
    setHighRiskBusy(true);
    try {
      await admissions.setHighRisk(o.admissionId, !o.hasRestrictedAlert);
      onChanged?.();
    } finally {
      setHighRiskBusy(false);
    }
  }

  async function saveNotes() {
    if (!o?.admissionId) return;
    setNotesBusy(true);
    setNotesError(null);
    try {
      await admissions.updateNotes(o.admissionId, notesText);
      setEditNotesMode(false);
      onChanged?.();
    } catch (err) {
      setNotesError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setNotesBusy(false);
    }
  }

  function openEditDetails() {
    setDetailsForm({
      therapist:  o?.therapist  ?? '',
      buddy:      o?.buddy      ?? '',
      keyworker:  o?.keyworker  ?? '',
      group:      o?.group      ?? '',
      substance:  o?.substance  ?? '',
      peep:       o?.peeps      ?? false,
    });
    setDetailsError(null);
    setEditDetailsMode(true);
  }

  function openEditName() {
    const parts = (localDisplayName ?? o?.displayName ?? '').split(' ');
    setNameForm({ firstName: parts.slice(0, -1).join(' ') || parts[0] || '', lastName: parts.length > 1 ? (parts[parts.length - 1] ?? '') : '' });
    setNameError(null);
    setEditNameMode(true);
  }

  async function saveName() {
    if (!o?.clientId) return;
    setNameBusy(true);
    setNameError(null);
    try {
      await clients.updateIdentity(o.clientId, nameForm.firstName.trim(), nameForm.lastName.trim());
      const full = `${nameForm.firstName.trim()} ${nameForm.lastName.trim()}`.trim();
      setLocalDisplayName(full);
      setEditNameMode(false);
      onChanged?.();
    } catch (err) {
      setNameError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setNameBusy(false);
    }
  }

  async function saveDetails() {
    if (!o?.admissionId) return;
    setDetailsBusy(true);
    setDetailsError(null);
    try {
      await admissions.updateDetails(o.admissionId, {
        focalTherapistLabel: detailsForm.therapist,
        buddyLabel:          detailsForm.buddy,
        keyWorkerLabel:      detailsForm.keyworker,
        treatmentGroup:      detailsForm.group,
        substanceName:       detailsForm.substance,
        peepRequired:        detailsForm.peep,
      });
      setEditDetailsMode(false);
      onChanged?.();
    } catch (err) {
      setDetailsError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setDetailsBusy(false);
    }
  }

  async function createConcern() {
    if (!newConcernText.trim() || !o?.admissionId || !o?.clientId) return;
    setNewConcernBusy(true);
    setNewConcernError(null);
    try {
      await concerns.log(o.clientId, o.admissionId, centreId, newConcernText.trim(), 'risk');
      const rows = await concerns.list(centreId, o.clientId);
      setConcernRows(rows);
      setNewConcernMode(false);
      setNewConcernText('');
    } catch (err) {
      setNewConcernError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setNewConcernBusy(false);
    }
  }

  async function saveConcern() {
    if (!concernEditId) return;
    setConcernBusy(true);
    setConcernError(null);
    try {
      await concerns.updateNote(concernEditId, concernEditText);
      const rows = await concerns.list(centreId, o?.clientId ?? '');
      setConcernRows(rows);
      setConcernEditId(null);
      setConcernEditText('');
    } catch (err) {
      setConcernError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setConcernBusy(false);
    }
  }

  const sorted = [...o.tasks].sort((a, b) => {
    if (a.dueAt === null) return 1;
    if (b.dueAt === null) return -1;
    return a.dueAt.getTime() - b.dueAt.getTime();
  });

  // The programme's own fixed-order steps (life story, Step 1/2/3, CCP) — a subset of `sorted`, kept
  // in the same due-date order, rather than a separate notion of "stage" invented for this view.
  const milestones = sorted.filter((t) => t.category === 'milestone');
  const milestoneSteps = milestones.map((t) => ({
    label: t.title,
    date: t.dueAt ? formatDate(t.dueAt) : undefined,
    tone: t.isComplete ? ('good' as const) : t.isOverdue ? ('alert' as const) : t.isDueToday ? ('warn' as const) : ('neutral' as const),
  }));

  const needsActionTasks = sorted.filter((t) => !t.isComplete && !t.isNotApplicable && (t.isOverdue || t.isDueToday));
  const comingUpTasks = sorted.filter((t) => !t.isComplete && !t.isNotApplicable && !t.isOverdue && !t.isDueToday);
  const doneTasks = sorted.filter((t) => t.isComplete || t.isNotApplicable);

  const overallStatus: StatusKey =
    o.overdueCount > 0 ? 'overdue' : o.dueTodayCount > 0 ? 'attention' : 'ontrack';
  const pct = Math.min(100, Math.round((o.treatmentDay / o.durationDays) * 100));

  return (
    <>
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="flex h-[94vh] w-full max-w-[1280px] flex-col gap-0 overflow-hidden p-0 sm:rounded-2xl">
        <DialogTitle className="sr-only">Client file — {o.displayName}</DialogTitle>

        {/* Prev / Next navigation — top-left corner */}
        <div className="absolute left-3 top-3 z-10 flex gap-1.5">
          <button
            type="button"
            onClick={onPrev}
            disabled={!onPrev}
            aria-label="Previous client"
            className="flex size-7 items-center justify-center rounded-lg border border-[var(--color-line)] bg-card text-[var(--color-ink-muted)] transition hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronLeft className="size-4" />
          </button>
          <button
            type="button"
            onClick={onNext}
            disabled={!onNext}
            aria-label="Next client"
            className="flex size-7 items-center justify-center rounded-lg border border-[var(--color-line)] bg-card text-[var(--color-ink-muted)] transition hover:bg-muted/60 disabled:opacity-30 disabled:cursor-not-allowed"
          >
            <ChevronRight className="size-4" />
          </button>
        </div>

        {/* 3-column header:
            [profile card] | [key facts + safeguarding status] | [progress card] */}
        <div className="grid grid-cols-1 gap-5 border-b border-[var(--color-line)] p-5 lg:grid-cols-[200px_minmax(0,1fr)_260px]">

          {/* Col 1 — Profile card: photo, name, status, high-risk, ref */}
          <div
            className={`relative flex flex-col items-center gap-2.5 overflow-hidden rounded-xl p-3 text-center ${
              o.hasRestrictedAlert
                ? 'border-t-[3px] border-t-red-400 dark:border-t-red-500'
                : ''
            }`}
          >
            {o.hasRestrictedAlert ? (
              <div className="pointer-events-none absolute inset-x-0 top-0 h-20 rounded-t-xl bg-gradient-to-b from-red-50/80 to-transparent dark:from-red-950/30" />
            ) : null}
            {o.photoUrl ? (
              <button
                type="button"
                onClick={() => setLightboxOpen(true)}
                className="rounded-full transition hover:opacity-90 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
                aria-label={`View ${o.displayName}'s photograph full size`}
              >
                <PhotoBadge occupant={o} size="2xl" />
              </button>
            ) : (
              <PhotoBadge occupant={o} size="2xl" />
            )}

            <div className="flex flex-col items-center gap-1.5">
              {editNameMode ? (
                <div className="flex flex-col gap-2 w-full text-left">
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">First name</span>
                    <input
                      type="text"
                      value={nameForm.firstName}
                      onChange={e => setNameForm(f => ({ ...f, firstName: e.target.value }))}
                      className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[13px] focus:border-[var(--color-accent)] focus:outline-none"
                    />
                  </label>
                  <label className="flex flex-col gap-0.5">
                    <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">Last name</span>
                    <input
                      type="text"
                      value={nameForm.lastName}
                      onChange={e => setNameForm(f => ({ ...f, lastName: e.target.value }))}
                      className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[13px] focus:border-[var(--color-accent)] focus:outline-none"
                    />
                  </label>
                  {nameError && <p className="text-[11px] text-red-600 dark:text-red-400">{nameError}</p>}
                  <div className="flex gap-1.5">
                    <button
                      type="button"
                      disabled={nameBusy || !nameForm.firstName.trim()}
                      onClick={saveName}
                      className="rounded-lg bg-[var(--color-accent)] px-3 py-1 text-[12px] font-semibold text-white disabled:opacity-50 transition hover:opacity-90"
                    >
                      {nameBusy ? 'Saving…' : 'Save'}
                    </button>
                    <button
                      type="button"
                      onClick={() => setEditNameMode(false)}
                      className="rounded-lg border border-[var(--color-line)] px-3 py-1 text-[12px] font-semibold transition hover:bg-[var(--color-accent-soft)]"
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              ) : (
                <div className="flex items-center gap-1.5">
                  <h2 className="font-display text-[17px] font-semibold leading-snug">{localDisplayName ?? o.displayName}</h2>
                  {can('clients.edit_identity') && !readOnly && (
                    <button
                      type="button"
                      onClick={openEditName}
                      title="Edit client name"
                      className="rounded p-0.5 text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]"
                    >
                      <Pencil className="size-3.5" aria-hidden />
                    </button>
                  )}
                </div>
              )}
              <div className="nums text-[11px] text-[var(--color-ink-muted)]">
                Ref {o.reference} &middot; Bed {bed.label} &middot; {o.group || 'No group'}
              </div>
            </div>

            {o.clientId ? (
              <PhotoUpload
                centreId={centreId}
                clientId={o.clientId}
                hasPhoto={o.photoState === 'present'}
                onUploaded={onChanged}
              />
            ) : null}
          </div>

          {/* Col 2 — Key facts grid + safeguarding status banner */}
          <div className="min-w-0">
            {/* Key facts header with edit toggle */}
            <div className="mb-2 flex items-center justify-between">
              <span className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
                Key facts
              </span>
              {o.admissionId && can('admissions.edit') && !readOnly ? (
                editDetailsMode ? (
                  <button
                    type="button"
                    onClick={() => setEditDetailsMode(false)}
                    className="rounded px-1.5 py-0.5 text-[10px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>
                ) : (
                  <button
                    type="button"
                    onClick={openEditDetails}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    <Pencil className="size-3" />
                    Edit
                  </button>
                )
              ) : null}
            </div>

            {editDetailsMode ? (
              /* ── Edit mode ── */
              <div className="flex flex-col gap-2.5">
                <div className="grid grid-cols-1 gap-2.5 sm:grid-cols-2">
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Focal therapist
                    <input
                      type="text"
                      value={detailsForm.therapist}
                      onChange={(e) => setDetailsForm((f) => ({ ...f, therapist: e.target.value }))}
                      placeholder="Name…"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Keyworker
                    <input
                      type="text"
                      value={detailsForm.keyworker}
                      onChange={(e) => setDetailsForm((f) => ({ ...f, keyworker: e.target.value }))}
                      placeholder="Name…"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Buddy
                    <input
                      type="text"
                      value={detailsForm.buddy}
                      onChange={(e) => setDetailsForm((f) => ({ ...f, buddy: e.target.value }))}
                      placeholder="Name…"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Treatment group
                    <input
                      type="text"
                      value={detailsForm.group}
                      onChange={(e) => setDetailsForm((f) => ({ ...f, group: e.target.value }))}
                      placeholder="e.g. A…"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Primary concern / substance
                    <input
                      type="text"
                      value={detailsForm.substance}
                      onChange={(e) => setDetailsForm((f) => ({ ...f, substance: e.target.value }))}
                      placeholder="e.g. Alcohol…"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                    />
                  </label>
                  <div className="flex flex-col justify-end pb-1">
                    <label className="flex cursor-pointer items-center gap-2 text-[10.5px] text-[var(--color-ink-muted)]">
                      <input
                        type="checkbox"
                        checked={detailsForm.peep}
                        onChange={(e) => setDetailsForm((f) => ({ ...f, peep: e.target.checked }))}
                        className="rounded accent-[var(--color-accent)]"
                      />
                      PEEP required (personal evacuation plan)
                    </label>
                  </div>
                </div>
                {detailsError ? (
                  <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{detailsError}</p>
                ) : null}
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    disabled={detailsBusy}
                    onClick={() => void saveDetails()}
                    className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
                  >
                    {detailsBusy ? 'Saving…' : 'Save changes'}
                  </button>
                  <button
                    type="button"
                    disabled={detailsBusy}
                    onClick={() => setEditDetailsMode(false)}
                    className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                  >
                    Cancel
                  </button>
                </div>
              </div>
            ) : (
              /* ── Read mode ── */
              <dl className="nums grid grid-cols-2 gap-x-6 gap-y-3.5 text-[12.5px] sm:grid-cols-4">
                <Fact label="Admitted" value={formatDate(o.admittedAt)} />
                <Fact label="Planned discharge" value={formatDate(o.plannedDischargeDate)} />
                <Fact label="Programme" value={`${o.durationDays} days`} />
                <Fact label="Primary concern" value={o.substance || '—'} />
                <Fact
                  label="Family meeting"
                  value={o.familyMeetingEligibleNow ? 'Eligible now' : `From ${formatDate(o.familyMeetingEligibleFrom)}`}
                />
                <Fact label="Focal therapist" value={o.therapist ?? 'Not assigned'} />
                <Fact label="Keyworker" value={o.keyworker ?? 'Not assigned'} />
                <Fact label="Buddy" value={o.buddy} />
              </dl>
            )}

            {/* Safeguarding / Risks / Concerns — status only, no concern cards */}
            <div
              className={`mt-4 rounded-lg border-l-4 px-3 py-2.5 ${
                o.hasRestrictedAlert
                  ? 'border border-red-300 border-l-red-600 bg-red-50 dark:border-red-800 dark:bg-red-950/50'
                  : (o.hasOpenConcern || o.legacySafeguardingNote)
                  ? 'border border-amber-200 border-l-amber-500 bg-amber-50/60 dark:border-amber-800/60 dark:bg-amber-950/30'
                  : 'border border-[var(--color-line)] border-l-[var(--color-line)] bg-[var(--color-surface)]'
              }`}
            >
              <div className="flex items-center gap-2">
                <span
                  className={`text-[10.5px] font-semibold tracking-[0.05em] uppercase ${
                    o.hasRestrictedAlert
                      ? 'text-red-700 dark:text-red-400'
                      : (o.hasOpenConcern || o.legacySafeguardingNote)
                      ? 'text-amber-700 dark:text-amber-400'
                      : 'text-[var(--color-ink-muted)]'
                  }`}
                >
                  Safeguarding / Risks / Concerns
                </span>
                {o.hasRestrictedAlert ? (
                  <span className="rounded-full bg-red-600 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
                    Alert
                  </span>
                ) : o.hasOpenConcern ? (
                  <span className="rounded-full bg-amber-500 px-1.5 py-0.5 text-[9px] font-bold tracking-wide text-white uppercase">
                    Open
                  </span>
                ) : null}
                {can('risk.record') && !readOnly ? (
                  <button
                    type="button"
                    disabled={highRiskBusy}
                    onClick={() => void toggleHighRisk()}
                    className={`ml-auto rounded-full border px-2 py-0.5 text-[9px] font-semibold tracking-wide uppercase transition disabled:opacity-40 ${
                      o.hasRestrictedAlert
                        ? 'border-red-300 bg-red-50 text-red-700 hover:bg-red-100 dark:border-red-800 dark:bg-red-950/40 dark:text-red-400'
                        : 'border-[var(--color-line)] bg-transparent text-[var(--color-ink-muted)] hover:border-red-300 hover:bg-red-50 hover:text-red-700 dark:hover:border-red-800 dark:hover:bg-red-950/40 dark:hover:text-red-400'
                    }`}
                  >
                    {highRiskBusy ? '…' : o.hasRestrictedAlert ? 'Remove high risk' : 'Set high risk'}
                  </button>
                ) : null}
              </div>
              {concernRows.length > 0 ? (
                <ul className="mt-1.5 space-y-1.5">
                  {concernRows.map((r) => (
                    <li key={r.id} className={`text-[11px] leading-snug ${r.is_resolved ? 'opacity-50' : ''}`}>
                      <div className="flex items-start gap-1">
                        <div className="flex-1">
                          <span className={`mr-1.5 inline-block rounded-full px-1.5 py-0.5 text-[9px] font-bold tracking-wide uppercase ${
                            r.category === 'risk'
                              ? 'bg-red-100 text-red-700 dark:bg-red-900/40 dark:text-red-300'
                              : r.category === 'medical'
                              ? 'bg-blue-100 text-blue-700 dark:bg-blue-900/40 dark:text-blue-300'
                              : 'bg-amber-100 text-amber-700 dark:bg-amber-900/40 dark:text-amber-300'
                          }`}>{CONCERN_LABEL[r.category]}</span>
                          {concernEditId === r.id ? (
                            <div className="mt-1">
                              <textarea
                                autoFocus
                                rows={3}
                                value={concernEditText}
                                onChange={(e) => setConcernEditText(e.target.value)}
                                className="w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[11px] outline-none focus:border-[var(--color-accent)]"
                              />
                              {concernError ? <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">{concernError}</p> : null}
                              <div className="mt-1 flex gap-2">
                                <button type="button" disabled={!concernEditText.trim() || concernBusy}
                                  onClick={() => void saveConcern()}
                                  className="rounded-md bg-[var(--color-accent)] px-2 py-0.5 text-[10.5px] font-medium text-white disabled:opacity-40">
                                  {concernBusy ? 'Saving…' : 'Save'}
                                </button>
                                <button type="button" onClick={() => { setConcernEditId(null); setConcernError(null); }}
                                  className="rounded-md px-2 py-0.5 text-[10.5px] text-[var(--color-ink-muted)] hover:bg-black/5 dark:hover:bg-white/10">
                                  Cancel
                                </button>
                              </div>
                            </div>
                          ) : (
                            <span className={o.hasRestrictedAlert ? 'text-red-700 dark:text-red-300' : o.hasOpenConcern ? 'text-amber-800 dark:text-amber-200' : 'text-[var(--color-ink)]'}>{r.note}</span>
                          )}
                          <span className="ml-2 text-[10px] text-[var(--color-ink-muted)]">{formatDate(new Date(r.logged_at))}</span>
                          {r.is_resolved && <span className="ml-1.5 text-[9px] font-medium uppercase tracking-wide text-[var(--color-ink-muted)]">Resolved</span>}
                        </div>
                        {!r.is_resolved && can('tasks.complete') && concernEditId !== r.id ? (
                          <button type="button" title="Edit note"
                            onClick={() => { setConcernEditId(r.id); setConcernEditText(r.note); setConcernError(null); }}
                            className="shrink-0 rounded p-0.5 text-[var(--color-ink-muted)] hover:bg-black/8 dark:hover:bg-white/10">
                            <Pencil className="size-2.5" />
                          </button>
                        ) : null}
                      </div>
                    </li>
                  ))}
                </ul>
              ) : o.legacySafeguardingNote ? (
                <div className="mt-0.5 flex items-start gap-1">
                  <p className={`flex-1 text-[12px] ${o.hasRestrictedAlert ? 'font-medium text-red-700 dark:text-red-300' : 'text-amber-800 dark:text-amber-200'}`}>
                    {o.legacySafeguardingNote}
                  </p>
                  {can('tasks.complete') && !newConcernMode && !readOnly ? (
                    <button type="button" title="Edit note"
                      onClick={() => { setNewConcernText(o.legacySafeguardingNote ?? ''); setNewConcernError(null); setNewConcernMode(true); }}
                      className="shrink-0 rounded p-0.5 text-[var(--color-ink-muted)] hover:bg-black/8 dark:hover:bg-white/10">
                      <Pencil className="size-2.5" />
                    </button>
                  ) : null}
                </div>
              ) : (
                <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">
                  No notes on file.
                </p>
              )}
              {can('tasks.complete') && !newConcernMode && !readOnly && (concernRows.length > 0 || !o.legacySafeguardingNote) ? (
                <button
                  type="button"
                  onClick={() => { setNewConcernText(''); setNewConcernError(null); setNewConcernMode(true); }}
                  className="mt-2 text-[10.5px] font-medium text-[var(--color-accent)] hover:underline"
                >
                  + Add note
                </button>
              ) : null}
              {newConcernMode ? (
                <div className="mt-2 border-t border-[var(--color-line)]/50 pt-2">
                  <textarea
                    autoFocus
                    rows={3}
                    value={newConcernText}
                    onChange={(e) => setNewConcernText(e.target.value)}
                    placeholder="Add safeguarding / risk note…"
                    className="w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[11px] outline-none focus:border-[var(--color-accent)]"
                  />
                  {newConcernError ? <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">{newConcernError}</p> : null}
                  <div className="mt-1.5 flex gap-2">
                    <button type="button" disabled={!newConcernText.trim() || newConcernBusy}
                      onClick={() => void createConcern()}
                      className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40">
                      {newConcernBusy ? 'Saving…' : 'Log note'}
                    </button>
                    <button type="button" onClick={() => { setNewConcernMode(false); setNewConcernError(null); }}
                      className="rounded-md px-2.5 py-1 text-[11px] text-[var(--color-ink-muted)] hover:bg-black/5 dark:hover:bg-white/10">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : null}
            </div>
            <div className="mt-3 rounded-lg border border-[var(--color-line)] border-l-4 border-l-[var(--color-accent)]/40 px-3 py-2.5">
              <div className="flex items-center gap-2">
                <p className="text-[10.5px] font-semibold tracking-[0.05em] text-[var(--color-ink-muted)] uppercase">Admission notes</p>
                {can('tasks.complete') && !editNotesMode && !readOnly ? (
                  <button type="button" title="Edit notes"
                    onClick={() => { setNotesText(o.admissionNotes ?? ''); setEditNotesMode(true); setNotesError(null); }}
                    className="ml-auto rounded p-0.5 text-[var(--color-ink-muted)] hover:bg-black/8 dark:hover:bg-white/10">
                    <Pencil className="size-3" />
                  </button>
                ) : null}
              </div>
              {editNotesMode ? (
                <div className="mt-1.5">
                  <textarea
                    autoFocus
                    rows={4}
                    value={notesText}
                    onChange={(e) => setNotesText(e.target.value)}
                    placeholder="Add admission notes…"
                    className="w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[11px] outline-none focus:border-[var(--color-accent)]"
                  />
                  {notesError ? <p className="mt-0.5 text-[10px] text-red-600 dark:text-red-400">{notesError}</p> : null}
                  <div className="mt-1.5 flex gap-2">
                    <button type="button" disabled={notesBusy}
                      onClick={() => void saveNotes()}
                      className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white disabled:opacity-40">
                      {notesBusy ? 'Saving…' : 'Save'}
                    </button>
                    <button type="button" onClick={() => { setEditNotesMode(false); setNotesError(null); }}
                      className="rounded-md px-2.5 py-1 text-[11px] text-[var(--color-ink-muted)] hover:bg-black/5 dark:hover:bg-white/10">
                      Cancel
                    </button>
                  </div>
                </div>
              ) : o.admissionNotes ? (
                <p className="mt-0.5 whitespace-pre-wrap text-[12px] text-[var(--color-ink)]">{o.admissionNotes}</p>
              ) : (
                <p className="mt-0.5 text-[12px] italic text-[var(--color-ink-muted)]">No notes recorded.</p>
              )}
            </div>
          </div>

          {/* Col 3 — Programme progress + action buttons */}
          <div className="h-fit rounded-xl border border-[var(--color-line)] p-4">
            <p className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
              Programme progress
            </p>
            <div className="mt-2 flex items-baseline gap-2">
              <p className="nums text-[26px] font-semibold leading-none">
                Day {o.treatmentDay}
                <span className="text-[15px] text-[var(--color-ink-muted)]">/{o.durationDays}</span>
              </p>
              {o.isExtendedStay ? (
                <span className="rounded-full bg-teal-100 px-2 py-0.5 text-[9.5px] font-bold tracking-wide text-teal-700 uppercase dark:bg-teal-900/40 dark:text-teal-400">
                  +{o.extensionDays ?? '?'}d extended
                </span>
              ) : null}
            </div>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-muted">
              <div className="brand-gradient h-full rounded-full" style={{ width: `${pct}%` }} />
            </div>
            <p className="nums mt-1.5 text-[10.5px] text-[var(--color-ink-muted)]">
              {pct}% of the planned stay elapsed
            </p>
            {o.isExtendedStay && o.originalDischargeDate ? (
              <p className="nums mt-1 text-[10.5px] text-teal-700 dark:text-teal-400">
                <span className="line-through text-[var(--color-ink-muted)]">
                  {formatDate(new Date(o.originalDischargeDate + 'T12:00:00Z'))}
                </span>
                {' → '}
                {formatDate(new Date(o.plannedDischargeDate + 'T12:00:00Z'))}
              </p>
            ) : null}
            <div className="nums mt-3.5 grid grid-cols-2 gap-2 text-center text-[11px]">
              <div className="rounded-lg border border-[var(--color-line)] p-2.5">
                <p className="text-[17px] font-semibold leading-none">{o.completedCount}</p>
                <p className="mt-1 text-[var(--color-ink-muted)]">Done</p>
              </div>
              <div
                className={`rounded-lg border p-2.5 ${o.overdueCount > 0 ? 'border-overdue/60 bg-overdue-soft' : 'border-[var(--color-line)]'}`}
              >
                <p className={`text-[17px] font-semibold leading-none ${o.overdueCount > 0 ? 'text-overdue' : ''}`}>
                  {o.overdueCount}
                </p>
                <p className="mt-1 text-[var(--color-ink-muted)]">Overdue</p>
              </div>
            </div>
            {o.admissionId && !readOnly ? (
              <div className="mt-3.5 flex flex-col gap-2 border-t border-[var(--color-line)] pt-3.5">
                <button
                  type="button"
                  onClick={() => setExtendStayOpen(true)}
                  className="w-full rounded-lg border border-teal-300 bg-teal-50 px-3 py-2 text-[12px] font-semibold text-teal-800 transition hover:bg-teal-100 dark:border-teal-700 dark:bg-teal-950/40 dark:text-teal-300 dark:hover:bg-teal-950/60"
                >
                  Extend stay
                </button>
                <button
                  type="button"
                  onClick={() => setDischargeOpen(true)}
                  className="w-full rounded-lg border border-violet-300 bg-violet-50 px-3 py-2 text-[12px] font-semibold text-violet-800 transition hover:bg-violet-100 dark:border-violet-700 dark:bg-violet-950/40 dark:text-violet-300 dark:hover:bg-violet-950/60"
                >
                  Discharge
                </button>
              </div>
            ) : null}
          </div>
        </div>

        {/* Three-column task body */}
        <div className="flex min-h-0 flex-1 gap-4 overflow-hidden p-5">
          <TaskColumn
            title="Needs Action"
            tasks={needsActionTasks}
            admittedAt={o.admittedAt}
            emptyMsg="All clear — nothing overdue or due today."
            onChanged={onChanged}
            readOnly={readOnly}
          />
          <TaskColumn
            title="Coming Up"
            tasks={comingUpTasks}
            admittedAt={o.admittedAt}
            emptyMsg="No upcoming tasks."
            onChanged={onChanged}
            readOnly={readOnly}
          />
          <TaskColumn
            title="Done"
            tasks={doneTasks}
            admittedAt={o.admittedAt}
            emptyMsg="Nothing completed yet."
            onChanged={onChanged}
            readOnly={readOnly}
          />
        </div>

        <footer className="border-t border-[var(--color-line)] px-5 py-3 text-[11px] text-[var(--color-ink-muted)]">
          Detox, medical, safeguarding and therapy notes are not shown in this preview &mdash; they
          sit behind sensitivity level 3 and need the access model first.
        </footer>

        {/* Nested photo lightbox — intentionally inside so closing returns to client file */}
        {o.photoUrl ? (
          <Dialog open={lightboxOpen} onOpenChange={setLightboxOpen}>
            <DialogContent className="w-auto max-w-[92vw] border-none bg-transparent p-0 shadow-none">
              <DialogTitle className="sr-only">{o.displayName} — photograph</DialogTitle>
              <img
                src={o.photoUrl}
                alt={`Photograph of ${o.displayName}`}
                className="max-h-[85vh] max-w-full rounded-xl object-contain shadow-2xl"
              />
            </DialogContent>
          </Dialog>
        ) : null}
      </DialogContent>
    </Dialog>

    {/* Extend Stay — sibling dialog so it gets its own full-screen overlay */}
    {extendStayOpen && o.admissionId ? (
      <Dialog open onOpenChange={(v) => !v && setExtendStayOpen(false)}>
        <DialogContent className="w-full max-w-[480px] gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <DialogTitle className="sr-only">Extend stay — {o.displayName}</DialogTitle>
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
            <div>
              <p className="font-semibold text-[13.5px]">Extend stay</p>
              <p className="text-[11px] text-[var(--color-ink-muted)]">{o.displayName}</p>
            </div>
            <button type="button" onClick={() => setExtendStayOpen(false)}
              className="flex size-7 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition hover:bg-muted/60">
              <X className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-4">
            <ExtendStayCard occupant={o} centreId={centreId} startInFormMode onChanged={() => { setExtendStayOpen(false); onChanged?.(); }} />
          </div>
        </DialogContent>
      </Dialog>
    ) : null}

    {/* Discharge Workflow — sibling dialog so it gets its own full-screen overlay */}
    {dischargeOpen && o.admissionId ? (
      <Dialog open onOpenChange={(v) => !v && setDischargeOpen(false)}>
        <DialogContent className="w-full max-w-[480px] gap-0 overflow-hidden p-0 sm:rounded-2xl">
          <DialogTitle className="sr-only">Discharge — {o.displayName}</DialogTitle>
          <div className="flex items-center justify-between border-b border-[var(--color-line)] px-4 py-3">
            <div>
              <p className="font-semibold text-[13.5px]">Discharge</p>
              <p className="text-[11px] text-[var(--color-ink-muted)]">{o.displayName}</p>
            </div>
            <button type="button" onClick={() => setDischargeOpen(false)}
              className="flex size-7 items-center justify-center rounded-lg text-[var(--color-ink-muted)] transition hover:bg-muted/60">
              <X className="size-4" />
            </button>
          </div>
          <div className="overflow-y-auto p-4">
            <DischargeWorkflowCard occupant={o} startInFormMode onChanged={() => { setDischargeOpen(false); onChanged?.(); }} />
          </div>
        </DialogContent>
      </Dialog>
    ) : null}
    </>
  );
}

/**
 * Upload (or replace) this client's photograph — the missing piece behind the "no photograph" chip
 * shown everywhere else in the app. The bucket, its RLS policies and `client_photos` itself already
 * existed (migrations 0016/0017, tested); this component is the first thing that actually calls them.
 *
 * Hidden behind `photos.upload` rather than shown-but-disabled: the permission check happens at the
 * bucket and the table too, so a caller lacking it could never make this succeed anyway.
 */
function PhotoUpload({
  centreId,
  clientId,
  hasPhoto,
  onUploaded,
}: {
  centreId: string;
  clientId: string;
  hasPhoto: boolean;
  onUploaded?: (() => void) | undefined;
}) {
  const { can } = useAuth();
  const inputRef = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);

  if (!can('photos.upload')) return null;

  const pick = () => inputRef.current?.click();

  const onFile = async (file: File | undefined) => {
    if (!file) return;
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const { uploadedBytes, originalBytes } = await clientPhotos.upload({ centreId, clientId, file });
      // Resizing happens automatically; saying so keeps it from looking like the wrong file was kept.
      setNote(
        uploadedBytes < originalBytes
          ? `Resized ${formatBytes(originalBytes)} → ${formatBytes(uploadedBytes)}`
          : null,
      );
      onUploaded?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Upload failed.');
    } finally {
      setBusy(false);
      if (inputRef.current) inputRef.current.value = '';
    }
  };

  return (
    <div className="flex flex-col items-center gap-1">
      <input
        ref={inputRef}
        type="file"
        accept="image/jpeg,image/png,image/webp"
        className="sr-only"
        onChange={(e) => void onFile(e.target.files?.[0])}
      />
      <button
        type="button"
        disabled={busy}
        onClick={pick}
        className="rounded-md border border-[var(--color-line)] px-2 py-0.5 text-[10px] font-medium whitespace-nowrap transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
      >
        {busy ? 'Uploading…' : hasPhoto ? 'Replace photo' : 'Upload photo'}
      </button>
      {error ? <span className="text-[10px] text-red-600 dark:text-red-400">{error}</span> : null}
      {note ? (
        <span className="nums text-[10px] whitespace-nowrap text-[var(--color-ink-muted)]">{note}</span>
      ) : null}
    </div>
  );
}

/**
 * One action, with the controls to complete or reopen it.
 *
 * Three things decide whether a control appears, and all three are real constraints rather than
 * styling choices:
 *
 * 1. `task.id === null` — the fictional and frozen-snapshot boards have no database row behind them,
 *    so there is nothing to complete. They render exactly as before.
 * 2. `can('tasks.complete')` / `can('tasks.reopen')` — hiding a button the server would refuse is
 *    honest UI, not security. The database enforces both regardless of what is rendered here.
 * 3. `requiresCompletionNote` — asked for up front instead of letting the user submit and bounce off
 *    a server error. The server still enforces it; this only saves a round trip.
 *
 * "Due day N" (rather than an absolute date) matches the source layout — computed from the real
 * admission date and the task's real due date, not a separate stored field.
 */
function TaskRow({
  task: t,
  admittedAt,
  onChanged,
  readOnly,
}: {
  task: BoardTask;
  admittedAt: Date;
  onChanged?: (() => void) | undefined;
  readOnly?: boolean;
}) {
  const { can } = useAuth();
  const [mode, setMode] = useState<'idle' | 'note' | 'reopen'>('idle');
  const [text, setText] = useState('');
  const [reopenDate, setReopenDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [reopensOpen, setReopensOpen] = useState(false);
  const [rescheduleOpen, setRescheduleOpen] = useState(false);
  const [rescheduleDate, setRescheduleDate] = useState('');
  const [rescheduleReason, setRescheduleReason] = useState('');
  const [rescheduleBusy, setRescheduleBusy] = useState(false);
  const [rescheduleError, setRescheduleError] = useState<string | null>(null);
  const [rescheduleHistory, setRescheduleHistory] = useState<TaskDateChangeRow[]>([]);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [historyRows, setHistoryRows] = useState<TaskDateChangeRow[]>([]);
  const [historyLoading, setHistoryLoading] = useState(false);

  const isReal = t.id !== null;
  const canComplete = !readOnly && isReal && !t.isComplete && !t.isNotApplicable && can('tasks.complete');
  const canReopen = !readOnly && isReal && t.isComplete && can('tasks.reopen');
  const canReschedule = !readOnly && isReal && !t.isComplete && !t.isNotApplicable && can('tasks.complete');
  const dayNumber = t.dueAt ? calendarDaysBetween(admittedAt, t.dueAt, TZ) + 1 : null;
  // Whole calendar days, the same way treatment days are counted everywhere else in this codebase.
  const daysOverdue = t.isOverdue && t.dueAt ? calendarDaysBetween(t.dueAt, new Date(), TZ) : 0;
  const wasReopened = t.reopens.length > 0;

  function openReschedule() {
    setRescheduleDate(t.dueAt ? t.dueAt.toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10));
    setRescheduleReason('');
    setRescheduleError(null);
    setRescheduleHistory([]);
    setRescheduleOpen(true);
    if (t.id) taskService.dateHistory(t.id).then(setRescheduleHistory).catch(() => {});
  }

  async function doReschedule() {
    if (!t.id || !rescheduleDate || !rescheduleReason.trim()) return;
    setRescheduleBusy(true);
    setRescheduleError(null);
    try {
      await taskService.reschedule(t.id, new Date(rescheduleDate + 'T12:00:00'), rescheduleReason);
      setRescheduleOpen(false);
      setRescheduleDate('');
      setRescheduleReason('');
      onChanged?.();
    } catch (err) {
      setRescheduleError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setRescheduleBusy(false);
    }
  }

  function openHistory() {
    if (!t.id) return;
    setHistoryRows([]);
    setHistoryLoading(true);
    setHistoryOpen(true);
    taskService.dateHistory(t.id)
      .then(setHistoryRows)
      .catch(() => {})
      .finally(() => setHistoryLoading(false));
  }

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode('idle');
      setText('');
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  const complete = () => {
    if (!t.id) return;
    // Guard the note requirement here too, so the button cannot fire an empty note.
    if (t.requiresCompletionNote && !text.trim()) {
      setMode('note');
      return;
    }
    void run(() => taskService.complete(t.id!, text));
  };

  return (
    <li
      className={`rounded-lg border px-2.5 py-2 ${
        t.isOverdue
          ? 'border-overdue/40 border-l-4 border-l-overdue bg-overdue-soft'
          : wasReopened
            ? 'border-amber-500/40 border-l-4 border-l-amber-500 bg-amber-500/[0.06]'
            : 'border-[var(--color-line)]'
      }`}
    >
      <div className="flex items-start gap-2.5">
        <span className="min-w-0 flex-1">
          <span
            className={`block truncate text-[12.5px] leading-tight ${t.isComplete ? 'text-[var(--color-ink-muted)] line-through' : 'font-medium'}`}
          >
            {t.title}
          </span>
          <span className="nums block text-[10px] text-[var(--color-ink-muted)]">
            {dayNumber !== null ? `Due day ${dayNumber}` : 'No due date'} &middot;{' '}
            {CATEGORY_LABEL[t.category] ?? t.category}
          </span>
          {t.hasDateChanges ? (
            <button
              type="button"
              onClick={openHistory}
              className="mt-0.5 flex items-center gap-1 rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[9.5px] font-semibold text-sky-700 transition hover:bg-sky-100 dark:border-sky-800 dark:bg-sky-950/40 dark:text-sky-400 dark:hover:bg-sky-950/60"
            >
              <Calendar className="size-2.5 shrink-0" />
              Date changed
            </button>
          ) : null}
          {t.isComplete ? (
            <span className="nums mt-0.5 block text-[10px] text-[var(--color-ink-muted)]">
              {t.completedAt ? `Completed ${formatDate(t.completedAt)}` : 'Completed · date not recorded'}
              {t.completedBy ? ` by ${t.completedBy}` : ''}
            </span>
          ) : null}
          {wasReopened ? (
            <button
              type="button"
              onClick={() => setReopensOpen(true)}
              className="mt-0.5 flex items-center gap-1 rounded-full border border-amber-200 bg-amber-50 px-2 py-0.5 text-[9.5px] font-semibold text-amber-700 transition hover:bg-amber-100 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-400 dark:hover:bg-amber-950/60"
            >
              ↺ {t.reopens.length === 1 ? 'Reopened once' : `Reopened ${t.reopens.length}×`}
            </button>
          ) : null}
        </span>
        {t.isComplete ? (
          <StatusBadge status="complete" label="Done" size="sm" />
        ) : t.isNotApplicable ? (
          <span title={t.notApplicableReason ?? undefined}>
            <StatusBadge status="neutral" label="Not applicable" size="sm" />
          </span>
        ) : t.isOverdue ? (
          <StatusBadge
            status="overdue"
            label={daysOverdue === 1 ? '1 day overdue' : `${daysOverdue} days overdue`}
            size="sm"
          />
        ) : t.isDueToday ? (
          <StatusBadge status="attention" label="Today" size="sm" />
        ) : (
          <StatusBadge status="ontrack" label="On track" size="sm" />
        )}

        {canComplete && mode === 'idle' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => (t.requiresCompletionNote ? setMode('note') : complete())}
            className="shrink-0 rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] font-medium transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
          >
            {busy ? '…' : 'Complete'}
          </button>
        ) : null}

        {canReopen && mode === 'idle' ? (
          <button
            type="button"
            disabled={busy}
            onClick={() => setMode('reopen')}
            className="shrink-0 rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10"
          >
            Reopen
          </button>
        ) : null}

        {canReschedule && mode === 'idle' ? (
          <button
            type="button"
            title="Change due date"
            onClick={openReschedule}
            className="shrink-0 rounded-md border border-[var(--color-line)] p-1 text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
          >
            <Calendar className="size-3.5" />
          </button>
        ) : null}
      </div>

      {mode !== 'idle' ? (
        <div className="mt-2 border-t border-[var(--color-line)] pt-2">
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            {mode === 'note' ? 'Completion note (required for this action)' : 'Why is this being reopened?'}
          </label>
          <textarea
            autoFocus
            rows={2}
            value={text}
            onChange={(e) => setText(e.target.value)}
            className="mt-1 w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
          />
          {mode === 'reopen' ? (
            <>
              <label className="mt-2.5 block text-[10.5px] text-[var(--color-ink-muted)]">
                New due date (optional)
                <input
                  type="date"
                  value={reopenDate}
                  onChange={(e) => setReopenDate(e.target.value)}
                  className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                />
              </label>
              <p className="mt-1 text-[10px] text-[var(--color-ink-muted)]">
                This removes the completion record. The reason is kept in the audit trail.
              </p>
            </>
          ) : null}
          <div className="mt-1.5 flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !text.trim()}
              onClick={() =>
                mode === 'note'
                  ? complete()
                  : void run(() =>
                      taskService.reopen(
                        t.id!,
                        text,
                        reopenDate ? new Date(reopenDate + 'T12:00:00') : undefined,
                      ),
                    )
              }
              className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40"
            >
              {busy ? 'Saving…' : mode === 'note' ? 'Complete' : 'Reopen'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => {
                setMode('idle');
                setText('');
                setReopenDate('');
                setError(null);
              }}
              className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-1.5 text-[11px] text-red-600 dark:text-red-400">
          {error}
        </p>
      ) : null}

      {reopensOpen ? (
        <Dialog open onOpenChange={(v) => !v && setReopensOpen(false)}>
          <DialogContent className="max-w-sm p-5">
            <DialogTitle className="text-[14px] font-semibold">Reopen history</DialogTitle>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">{t.title}</p>
            <ul className="mt-4 space-y-3">
              {t.reopens.map((r, i) => (
                <li key={i} className="rounded-lg border border-amber-200/70 bg-amber-50/60 px-3 py-2.5 dark:border-amber-800/50 dark:bg-amber-950/20">
                  <p className="nums text-[10.5px] font-semibold text-amber-800 dark:text-amber-300">
                    {formatDateWithDay(r.at)}
                    {r.by ? <span className="font-normal"> · {r.by}</span> : null}
                  </p>
                  <p className="mt-1 text-[12px] leading-snug text-[var(--color-ink)]">
                    {r.reason ?? <span className="italic text-[var(--color-ink-muted)]">No reason recorded.</span>}
                  </p>
                </li>
              ))}
            </ul>
            <button
              type="button"
              onClick={() => setReopensOpen(false)}
              className="mt-4 w-full rounded-md border border-[var(--color-line)] py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Close
            </button>
          </DialogContent>
        </Dialog>
      ) : null}

      {historyOpen ? (
        <Dialog open onOpenChange={(v) => !v && setHistoryOpen(false)}>
          <DialogContent className="max-w-sm p-5">
            <DialogTitle className="text-[14px] font-semibold">Due date history</DialogTitle>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">{t.title}</p>
            <div className="mt-4">
              {historyLoading ? (
                <p className="text-[12px] text-[var(--color-ink-muted)]">Loading…</p>
              ) : historyRows.length === 0 ? (
                <p className="text-[12px] text-[var(--color-ink-muted)]">No changes recorded.</p>
              ) : (
                <ul className="space-y-3">
                  {historyRows.map((h) => (
                    <li key={h.id} className="rounded-lg border border-[var(--color-line)] px-3 py-2.5 text-[11.5px]">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-[var(--color-ink)]">{h.changed_by_name}</span>
                        <span className="text-[10px] text-[var(--color-ink-muted)]">
                          {formatDate(new Date(h.changed_at))} at {new Date(h.changed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>
                      <div className="mt-1 flex items-center gap-1.5 text-[11px]">
                        {h.old_due_at ? (
                          <>
                            <span className="text-[var(--color-ink-muted)] line-through">{formatDate(new Date(h.old_due_at))}</span>
                            <span className="text-[var(--color-ink-muted)]">→</span>
                          </>
                        ) : null}
                        <span className="font-medium text-[var(--color-ink)]">{formatDate(new Date(h.new_due_at))}</span>
                      </div>
                      <p className="mt-1 text-[11px] italic text-[var(--color-ink-muted)]">&ldquo;{h.reason}&rdquo;</p>
                    </li>
                  ))}
                </ul>
              )}
            </div>
            <button
              type="button"
              onClick={() => setHistoryOpen(false)}
              className="mt-4 w-full rounded-md border border-[var(--color-line)] py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Close
            </button>
          </DialogContent>
        </Dialog>
      ) : null}

      {rescheduleOpen ? (
        <Dialog open onOpenChange={(v) => !v && setRescheduleOpen(false)}>
          <DialogContent className="max-w-sm p-5">
            <DialogTitle className="text-[14px] font-semibold">Change due date</DialogTitle>
            <p className="mt-0.5 text-[11px] text-[var(--color-ink-muted)]">{t.title}</p>
            <div className="mt-4 flex flex-col gap-3">
              <div>
                <label className="text-[11px] font-semibold text-[var(--color-ink-muted)]">New due date</label>
                <input
                  type="date"
                  value={rescheduleDate}
                  onChange={(e) => setRescheduleDate(e.target.value)}
                  className="mt-1 w-full rounded-md border border-[var(--color-line)] bg-transparent px-3 py-1.5 text-[13px] outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              <div>
                <label className="text-[11px] font-semibold text-[var(--color-ink-muted)]">Reason (required)</label>
                <textarea
                  autoFocus
                  rows={3}
                  value={rescheduleReason}
                  onChange={(e) => setRescheduleReason(e.target.value)}
                  placeholder="Why is this date being changed?"
                  className="mt-1 w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-3 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                />
              </div>
              {rescheduleError ? <p className="text-[11px] text-red-600 dark:text-red-400">{rescheduleError}</p> : null}
              <div className="flex gap-2">
                <button
                  type="button"
                  disabled={!rescheduleDate || !rescheduleReason.trim() || rescheduleBusy}
                  onClick={() => void doReschedule()}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-semibold text-white disabled:opacity-40"
                >
                  {rescheduleBusy ? 'Saving…' : 'Save change'}
                </button>
                <button
                  type="button"
                  onClick={() => setRescheduleOpen(false)}
                  className="rounded-md px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
                >
                  Cancel
                </button>
              </div>
              {rescheduleHistory.length > 0 ? (
                <div className="border-t border-[var(--color-line)] pt-3">
                  <p className="text-[10px] font-semibold uppercase tracking-[0.05em] text-[var(--color-ink-muted)]">Date change history</p>
                  <ul className="mt-1.5 space-y-2">
                    {rescheduleHistory.map((h) => (
                      <li key={h.id} className="text-[10.5px] leading-snug">
                        <span className="font-semibold text-[var(--color-ink)]">{h.changed_by_name}</span>
                        {h.old_due_at ? (
                          <span className="text-[var(--color-ink-muted)]"> moved from {formatDate(new Date(h.old_due_at))} to {formatDate(new Date(h.new_due_at))}</span>
                        ) : (
                          <span className="text-[var(--color-ink-muted)]"> set to {formatDate(new Date(h.new_due_at))}</span>
                        )}
                        <span className="block text-[var(--color-ink-muted)]">{formatDate(new Date(h.changed_at))} — &ldquo;{h.reason}&rdquo;</span>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}
            </div>
          </DialogContent>
        </Dialog>
      ) : null}
    </li>
  );
}



function TaskColumn({
  title,
  tasks,
  admittedAt,
  emptyMsg,
  onChanged,
  readOnly,
}: {
  title: string;
  tasks: BoardTask[];
  admittedAt: Date;
  emptyMsg: string;
  onChanged?: (() => void) | undefined;
  readOnly?: boolean;
}) {
  const [collapsed, setCollapsed] = useState(false);
  return (
    <div className="flex min-h-0 flex-1 flex-col overflow-hidden rounded-xl border border-[var(--color-line)]">
      <div className="flex shrink-0 items-center gap-2 border-b border-[var(--color-line)] px-3 py-2.5">
        <span className="flex-1 text-[11px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
          {title}
        </span>
        <span className="nums rounded-full bg-[var(--color-surface)] px-2 py-0.5 text-[11px] text-[var(--color-ink-muted)]">
          {tasks.length}
        </span>
        <button
          type="button"
          onClick={() => setCollapsed((c) => !c)}
          className="rounded p-0.5 text-[var(--color-ink-muted)] transition hover:bg-black/8 dark:hover:bg-white/10"
          aria-label={collapsed ? 'Expand' : 'Collapse'}
        >
          {collapsed ? <ChevronDown className="size-4" /> : <ChevronUp className="size-4" />}
        </button>
      </div>
      {!collapsed ? (
        <ul className="flex min-h-0 flex-1 flex-col gap-1.5 overflow-y-auto p-3">
          {tasks.length === 0 ? (
            <li className="py-4 text-center text-[12px] text-[var(--color-ink-muted)]">{emptyMsg}</li>
          ) : (
            tasks.map((t) => (
              <TaskRow key={t.id ?? t.code} task={t} admittedAt={admittedAt} onChanged={onChanged} {...(readOnly ? { readOnly } : {})} />
            ))
          )}
        </ul>
      ) : null}
    </div>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <div className="text-[10.5px] text-[var(--color-ink-muted)]">{label}</div>
      <div className="truncate font-medium">{value}</div>
    </div>
  );
}
