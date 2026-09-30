import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, ChevronUp, Pencil, Plus, X } from 'lucide-react';
import type { BoardBed } from './board-data.js';
import { PhotoBadge } from './BedCard.tsx';
import { Chip } from '../../components/ui.tsx';
import { formatDate } from '../../lib/format.js';
import { admissions, tasks as taskService, gpSummary as gpSummaryService, type GpSummaryDetail } from '../../services/data-access.js';
import { useAuth } from '../auth/AuthProvider.tsx';
import { TaskRow } from './DetailPanel.tsx';
import type { BoardTask } from './board-data.js';
import { CATEGORY_LABEL, categoryStatus, COLUMNS, isCustomTask, isDoctorTask, isFamilyVisitTask, type CategoryKey } from './category-status.js';

export function CategoryDetailPanel({
  bed,
  category,
  onClose,
  onChanged,
  readOnly = false,
}: {
  bed: BoardBed;
  category: CategoryKey;
  onClose: () => void;
  onChanged?: (() => void) | undefined;
  readOnly?: boolean;
}) {
  const o = bed.occupant;
  if (!o) return null;

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === 'Escape') onClose(); }
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  const status = categoryStatus(o, category);
  const label = CATEGORY_LABEL[category];

  return createPortal(
    <>
      <div className="fixed inset-0 z-40 bg-black/40 backdrop-blur-[1px]" aria-hidden onClick={onClose} />

      <div
        role="dialog"
        aria-modal="true"
        aria-label={`${o.displayName} — ${label}`}
        className="fixed top-0 right-0 z-50 flex h-full w-full max-w-[520px] flex-col bg-card shadow-2xl"
        style={{ animation: 'cdp-slide-in 0.22s cubic-bezier(0.25,0.46,0.45,0.94) both' }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--color-line)] px-6 pt-7 pb-5 shrink-0">
          <PhotoBadge occupant={o} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[20px] font-semibold tracking-[-0.01em] text-[var(--color-ink)]">
              {o.displayName}
            </h2>
            <p className="mt-0.5 text-[12px] text-[var(--color-ink-muted)]">Room {bed.label} · {label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-1 shrink-0 rounded-[6px] p-1.5 text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Facts row */}
        <div className="grid grid-cols-2 gap-4 border-b border-[var(--color-line)] px-6 py-5 text-[12px] shrink-0">
          <Fact label="Therapist" value={o.therapist ?? 'Not assigned'} />
          <Fact label="Client status" value="Admitted" />
          <Fact label="Admission date" value={formatDate(o.admittedAt)} />
          <Fact label="Planned discharge" value={formatDate(o.plannedDischargeDate)} />
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between gap-3 border-b border-[var(--color-line)] bg-[color-mix(in_srgb,var(--color-surface)_65%,var(--color-panel))] px-6 py-3.5 shrink-0">
          <div className="min-w-0">
            <div className="text-[11px] font-semibold tracking-[0.06em] text-[var(--color-ink)] uppercase">{label}</div>
            <div className="mt-0.5 text-[10.5px] text-[var(--color-ink-muted)]">
              {status.totalCount} internal {status.totalCount === 1 ? 'detail' : 'details'}
            </div>
          </div>
          {status.attentionCount > 0 ? (
            <Chip icon="⚠" label={`${status.attentionCount} need attention`} tone="warn" />
          ) : null}
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto p-6">
          <CategoryContent
            o={o}
            category={category}
            onChanged={onChanged}
            readOnly={readOnly}
          />
        </div>
      </div>

      <style>{`
        @keyframes cdp-slide-in {
          from { transform: translateX(100%); opacity: 0.6; }
          to   { transform: translateX(0);    opacity: 1; }
        }
        @media (prefers-reduced-motion: reduce) {
          [style*="cdp-slide-in"] { animation: none !important; }
        }
      `}</style>
    </>,
    document.body,
  );
}

/* ─── Content router ─────────────────────────────────────────────────────── */

function CategoryContent({
  o,
  category,
  onChanged,
  readOnly,
}: {
  o: NonNullable<BoardBed['occupant']>;
  category: CategoryKey;
  onChanged?: (() => void) | undefined;
  readOnly?: boolean;
}) {
  if (category === 'admin') {
    return <AdminFields o={o} onChanged={onChanged} {...(readOnly ? { readOnly } : {})} />;
  }

  if (category === 'gpsummary') {
    const gp = o.tasks.find((t) => t.code === 'gp_summary');
    if (!gp) return <p className="text-[12.5px] text-[var(--color-ink-muted)]">Not applicable for this client.</p>;
    return <GpSummaryRow task={gp} admittedAt={o.admittedAt} onChanged={onChanged} {...(readOnly ? { readOnly } : {})} />;
  }

  if (category === 'doctor') {
    return (
      <ManualTaskSection
        o={o}
        onChanged={onChanged}
        filterFn={isDoctorTask}
        taskCategory="medical"
        emptyMessage="No items assigned for this category yet."
        {...(readOnly ? { readOnly } : {})}
      />
    );
  }

  if (category === 'custom') {
    // 'side_assignment' is real and auto-created on every admission (see category-status.ts) — shown
    // as a normal task row, with the free-form manual-assignment list underneath it for anything else.
    const sideAssignment = o.tasks.find((t) => t.code === 'side_assignment');
    return (
      <div className="flex flex-col gap-3">
        {sideAssignment ? (
          <ul>
            <TaskRow task={sideAssignment} admittedAt={o.admittedAt} onChanged={onChanged} {...(readOnly ? { readOnly } : {})} />
          </ul>
        ) : null}
        <ManualTaskSection
          o={o}
          onChanged={onChanged}
          filterFn={isCustomTask}
          taskCategory="milestone"
          emptyMessage={sideAssignment ? 'No other custom assignments for this client.' : 'No custom assignments for this client.'}
          {...(readOnly ? { readOnly } : {})}
        />
      </div>
    );
  }

  if (category === 'familyvisit') {
    return (
      <ManualTaskSection
        o={o}
        onChanged={onChanged}
        filterFn={isFamilyVisitTask}
        taskCategory="family_contact"
        emptyMessage="No family visits logged for this client."
        {...(readOnly ? { readOnly } : {})}
      />
    );
  }

  // Module-backed categories: contact / survey / lifestep / careplan
  if (!o.programmeModules.includes(category)) {
    return (
      <p className="text-[12.5px] text-[var(--color-ink-muted)]">
        Not part of this client&apos;s treatment programme.
      </p>
    );
  }

  return <ModuleTaskSection o={o} category={category} onChanged={onChanged} {...(readOnly ? { readOnly } : {})} />;
}

/* ─── Module task section (contact / survey / familyvisit / lifestep / careplan) ─── */

/** Maps our board category key to the closest valid `addManualTask` category. */
function toTaskCategory(cat: CategoryKey): 'milestone' | 'session' | 'admin' {
  if (cat === 'careplan') return 'session';
  if (cat === 'admin') return 'admin';
  return 'milestone';
}

function ModuleTaskSection({
  o,
  category,
  onChanged,
  readOnly,
}: {
  o: NonNullable<BoardBed['occupant']>;
  category: CategoryKey;
  onChanged?: (() => void) | undefined;
  readOnly?: boolean;
}) {
  const { can } = useAuth();
  const canEdit = !!o.admissionId && can('admissions.edit') && !readOnly;
  const categoryColumns = COLUMNS.filter((c) => c.group === category);

  return (
    <ul className="flex flex-col gap-2">
      {categoryColumns.map((col) => {
        const existing = o.tasks.find((t) => t.code === col.code || (t.isManual && t.title === col.full));
        if (existing) {
          return (
            <TaskRow
              key={col.code}
              task={existing}
              admittedAt={o.admittedAt}
              onChanged={onChanged}
              {...(readOnly ? { readOnly } : {})}
            />
          );
        }
        return (
          <AssignRow
            key={col.code}
            taskDef={col}
            admissionId={o.admissionId ?? ''}
            taskCategory={toTaskCategory(category)}
            onChanged={onChanged}
            canEdit={canEdit}
          />
        );
      })}
    </ul>
  );
}

function AssignRow({
  taskDef,
  admissionId,
  taskCategory,
  onChanged,
  canEdit,
}: {
  taskDef: { code: string; full: string; label: string };
  admissionId: string;
  taskCategory: 'milestone' | 'session' | 'admin';
  onChanged?: (() => void) | undefined;
  canEdit: boolean;
}) {
  const [open, setOpen] = useState(false);
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function assign() {
    if (!admissionId) return;
    setBusy(true);
    setError(null);
    try {
      await taskService.addManualTask({
        admissionId,
        title: taskDef.full,
        category: taskCategory,
        ...(dueDate ? { dueAt: new Date(dueDate).toISOString() } : {}),
      });
      onChanged?.();
      setOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not assign task.');
    } finally {
      setBusy(false);
    }
  }

  if (!open) {
    return (
      <li className="flex items-center justify-between gap-3 rounded-[8px] border border-dashed border-[var(--color-line)] px-3 py-2.5">
        <span className="text-[12.5px] text-[var(--color-ink-muted)]">{taskDef.full}</span>
        {canEdit ? (
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="shrink-0 rounded-md border border-[var(--color-accent)]/40 bg-[var(--color-accent-soft)] px-2.5 py-1 text-[11px] font-semibold text-[var(--color-accent)] transition hover:bg-[var(--color-accent)]/15"
          >
            Assign
          </button>
        ) : (
          <span className="shrink-0 text-[11px] text-[var(--color-ink-muted)]">Not assigned</span>
        )}
      </li>
    );
  }

  return (
    <li className="flex flex-col gap-2 rounded-[8px] border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-3 py-3">
      <span className="text-[12.5px] font-medium text-[var(--color-ink)]">{taskDef.full}</span>
      <div className="flex items-center gap-2">
        <label className="flex-1 text-[10.5px] text-[var(--color-ink-muted)]">
          Due date (optional)
          <input
            type="date"
            value={dueDate}
            onChange={(e) => setDueDate(e.target.value)}
            className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-card px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
          />
        </label>
      </div>
      {error ? <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
      <div className="flex items-center gap-2">
        <button
          type="button"
          disabled={busy}
          onClick={assign}
          className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white transition disabled:opacity-50"
        >
          {busy ? 'Assigning…' : 'Assign'}
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => setOpen(false)}
          className="rounded-md px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          Cancel
        </button>
      </div>
    </li>
  );
}

/* ─── Manual task section (Doctor – Thursday / Custom) ───────────────────── */

function ManualTaskSection({
  o,
  onChanged,
  readOnly,
  filterFn,
  taskCategory,
  emptyMessage,
}: {
  o: NonNullable<BoardBed['occupant']>;
  onChanged?: (() => void) | undefined;
  readOnly?: boolean;
  filterFn: (t: BoardTask) => boolean;
  taskCategory: 'milestone' | 'medical' | 'family_contact';
  emptyMessage: string;
}) {
  const { can } = useAuth();
  const canEdit = !!o.admissionId && can('admissions.edit') && !readOnly;
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manualTasks = o.tasks.filter(filterFn);

  async function addTask() {
    if (!o.admissionId || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await taskService.addManualTask({
        admissionId: o.admissionId,
        title: name.trim(),
        category: taskCategory,
        ...(dueDate ? { dueAt: new Date(dueDate).toISOString() } : {}),
      });
      onChanged?.();
      setName('');
      setDueDate('');
      setAddOpen(false);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not add task.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="flex flex-col gap-3">
      {manualTasks.length > 0 ? (
        <ul className="flex flex-col gap-1.5">
          {manualTasks.map((t) => (
            <TaskRow
              key={t.id ?? t.code}
              task={t}
              admittedAt={o.admittedAt}
              onChanged={onChanged}
              {...(readOnly ? { readOnly } : {})}
            />
          ))}
        </ul>
      ) : (
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">{emptyMessage}</p>
      )}

      {canEdit && !addOpen && (
        <button
          type="button"
          onClick={() => setAddOpen(true)}
          className="flex items-center gap-1.5 self-start rounded-md border border-dashed border-[var(--color-line)] px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)]/50 hover:text-[var(--color-accent)]"
        >
          <Plus className="size-3.5" /> Add task
        </button>
      )}

      {addOpen && (
        <div className="flex flex-col gap-2 rounded-[8px] border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-3 py-3">
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Task name
            <input
              type="text"
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. Complete housing form…"
              autoFocus
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-card px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Due date (optional)
            <input
              type="date"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-card px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          {error ? <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
          <div className="flex items-center gap-2">
            <button
              type="button"
              disabled={busy || !name.trim()}
              onClick={addTask}
              className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white transition disabled:opacity-50"
            >
              {busy ? 'Adding…' : 'Add task'}
            </button>
            <button
              type="button"
              disabled={busy}
              onClick={() => { setAddOpen(false); setName(''); setDueDate(''); }}
              className="rounded-md px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
            >
              Cancel
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ─── Shared small components ────────────────────────────────────────────── */

function Fact({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">{label}</div>
      <div className="mt-0.5 text-[var(--color-ink)]">{value}</div>
    </div>
  );
}

/** A boxed label/value cell in a bordered grid — the 1px `bg-[var(--color-line)]` gap between
 * sibling cells (set by the parent grid) draws the dividing lines without per-cell border logic. */
function Field({ label, children, highlight, wide }: {
  label: string; children: React.ReactNode; highlight?: boolean; wide?: boolean;
}) {
  return (
    <div className={`bg-card px-3.5 py-3 ${wide ? 'col-span-2' : ''} ${highlight ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
      <div className="text-[9px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">{label}</div>
      <div className={`mt-1 text-[11.5px] font-medium ${highlight ? 'text-amber-700 dark:text-amber-300' : 'text-[var(--color-ink)]'}`}>
        {children}
      </div>
    </div>
  );
}

/* ─── Admin fields ───────────────────────────────────────────────────────── */

function AdminFields({
  o,
  onChanged,
  readOnly,
}: {
  o: NonNullable<BoardBed['occupant']>;
  onChanged?: (() => void) | undefined;
  readOnly?: boolean;
}) {
  const { can } = useAuth();
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ therapist: '', buddy: '', group: '', substance: '', peep: false, doctor: '', detoxEnds: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pct = Math.min(100, Math.round((o.treatmentDay / o.durationDays) * 100));
  const canEdit = !!o.admissionId && can('admissions.edit') && !readOnly;

  function openEdit() {
    setForm({
      therapist: o.therapist ?? '',
      buddy: o.buddy ?? '',
      group: o.group ?? '',
      substance: o.substance ?? '',
      peep: o.peeps,
      doctor: o.doctor ?? '',
      detoxEnds: o.detoxEnds ?? '',
    });
    setError(null);
    setEditMode(true);
  }

  async function save() {
    if (!o.admissionId) return;
    setBusy(true);
    setError(null);
    try {
      await admissions.updateDetails(o.admissionId, {
        focalTherapistLabel: form.therapist,
        buddyLabel: form.buddy,
        keyWorkerLabel: o.keyworker ?? '',
        treatmentGroup: form.group,
        substanceName: form.substance,
        peepRequired: form.peep,
        doctorLabel: form.doctor,
        detoxEnds: form.detoxEnds || null,
      });
      setEditMode(false);
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  if (editMode) {
    return (
      <div className="flex flex-col gap-2.5">
        <div className="grid grid-cols-2 gap-2.5">
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Focal therapist
            <input type="text" value={form.therapist} onChange={(e) => setForm((f) => ({ ...f, therapist: e.target.value }))} placeholder="Name…"
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
          </label>
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Buddy
            <input type="text" value={form.buddy} onChange={(e) => setForm((f) => ({ ...f, buddy: e.target.value }))} placeholder="Name…"
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
          </label>
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Group
            <input type="text" value={form.group} onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))} placeholder="e.g. A…"
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
          </label>
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Substance
            <input type="text" value={form.substance} onChange={(e) => setForm((f) => ({ ...f, substance: e.target.value }))} placeholder="e.g. Alcohol…"
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
          </label>
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Doctor
            <input type="text" value={form.doctor} onChange={(e) => setForm((f) => ({ ...f, doctor: e.target.value }))} placeholder="Name…"
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
          </label>
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Detox ends
            <input type="date" value={form.detoxEnds} onChange={(e) => setForm((f) => ({ ...f, detoxEnds: e.target.value }))}
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
          </label>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[10.5px] text-[var(--color-ink-muted)]">
          <input type="checkbox" checked={form.peep} onChange={(e) => setForm((f) => ({ ...f, peep: e.target.checked }))} className="rounded accent-[var(--color-accent)]" />
          Peeps (personal evacuation plan required)
        </label>
        {error ? <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button type="button" disabled={busy} onClick={save}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white transition disabled:opacity-50">
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button type="button" disabled={busy} onClick={() => setEditMode(false)}
            className="rounded-md px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-2">
      {canEdit ? (
        <button type="button" onClick={openEdit}
          className="flex items-center gap-1 self-end rounded px-1.5 py-0.5 text-[10px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
          <Pencil className="size-3" /> Edit
        </button>
      ) : null}
      <div className="grid grid-cols-2 gap-px overflow-hidden rounded-[10px] border border-[var(--color-line)] bg-[var(--color-line)]">
        <Field label="Focal Therapist" highlight={!o.therapist}>{o.therapist ?? 'Not assigned'}</Field>
        <Field label="Substance">{o.substance || '—'}</Field>
        <Field label="Treatment Duration">
          {o.treatmentDay} / {o.durationDays} days
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12">
            <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
          </div>
        </Field>
        <Field label="Discharge Date">{formatDate(o.plannedDischargeDate)}</Field>
        <Field label="Detox Ends">{o.detoxEnds ? formatDate(o.detoxEnds) : '—'}</Field>
        <Field label="Group">{o.group || '—'}</Field>
        <Field label="Doctor">{o.doctor ?? '—'}</Field>
        <Field label="Buddy">{o.buddy || '—'}</Field>
        <Field label="Peeps" highlight={o.peeps} wide>{o.peeps ? 'Yes' : 'No'}</Field>
      </div>
    </div>
  );
}

/* ─── GP Summary row: task status + the surgery contact / sign-off log from migration 0058 ───────── */

function GpSummaryRow({
  task,
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
  const canEdit = !readOnly && can('tasks.complete');
  const [detail, setDetail] = useState<GpSummaryDetail | null>(null);
  const [loaded, setLoaded] = useState(false);
  // null until the first load decides it — true (open) whenever anything is still outstanding, so
  // an actionable item is never hidden behind a click; only set to false, once, when everything was
  // already resolved on first load. A manual toggle after that always wins over re-fetches.
  const [expanded, setExpanded] = useState<boolean | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [form, setForm] = useState({ surgeryName: '', surgeryEmail: '', surgeryPhone: '', requestSentAt: '', receivedAt: '' });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState('');
  const [doctorBusy, setDoctorBusy] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);

  function load(isFirst = false) {
    if (!task.id) return;
    gpSummaryService.get(task.id).then((d) => {
      setDetail(d);
      setLoaded(true);
      if (isFirst) {
        const resolved = task.isComplete && d != null && d.compliant === true && !!d.doctor_informed_at && !!d.confirmed_checked_at;
        setExpanded(!resolved);
      }
    }).catch(() => setLoaded(true));
  }
  useEffect(() => { load(true); }, [task.id]);

  function openEdit() {
    setForm({
      surgeryName: detail?.surgery_name ?? '',
      surgeryEmail: detail?.surgery_email ?? '',
      surgeryPhone: detail?.surgery_phone ?? '',
      requestSentAt: detail?.request_sent_at ?? '',
      receivedAt: detail?.received_at ?? '',
    });
    setError(null);
    setEditMode(true);
  }

  async function save() {
    if (!task.id) return;
    setBusy(true);
    setError(null);
    try {
      await gpSummaryService.save(task.id, {
        surgeryName: form.surgeryName,
        surgeryEmail: form.surgeryEmail,
        surgeryPhone: form.surgeryPhone,
        requestSentAt: form.requestSentAt || undefined,
        receivedAt: form.receivedAt || undefined,
      });
      setEditMode(false);
      load();
      // Filling in the last field of the log can auto-complete the task server-side (migration
      // 0061) — re-fetch the board so its own status/reopen chrome reflects that immediately.
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  async function markDoctorInformed() {
    if (!task.id) return;
    setDoctorBusy(true);
    try {
      await gpSummaryService.markDoctorInformed(task.id, doctorName);
      setDoctorName('');
      load();
      onChanged?.();
    } finally {
      setDoctorBusy(false);
    }
  }

  async function markConfirmed() {
    if (!task.id) return;
    setConfirmBusy(true);
    try {
      await gpSummaryService.markConfirmed(task.id);
      load();
      onChanged?.();
    } finally {
      setConfirmBusy(false);
    }
  }

  async function undoDoctorInformed() {
    if (!task.id) return;
    if (!window.confirm('Undo "doctor informed"? This clears who was marked and when.')) return;
    setDoctorBusy(true);
    try {
      await gpSummaryService.undoDoctorInformed(task.id);
      load();
    } finally {
      setDoctorBusy(false);
    }
  }

  async function undoConfirmed() {
    if (!task.id) return;
    if (!window.confirm('Undo "confirmed / checked"? This clears who confirmed it and when.')) return;
    setConfirmBusy(true);
    try {
      await gpSummaryService.undoConfirmed(task.id);
      load();
    } finally {
      setConfirmBusy(false);
    }
  }

  const resolved = task.isComplete && detail != null && detail.compliant === true && !!detail.doctor_informed_at && !!detail.confirmed_checked_at;

  return (
    <div className="flex flex-col gap-2">
      <ul><TaskRow task={task} admittedAt={admittedAt} onChanged={() => { onChanged?.(); load(); }} {...(readOnly ? { readOnly } : {})} /></ul>

      {task.id ? (
        <div className="rounded-[8px] border border-[var(--color-line)] p-3">
          {!loaded ? (
            <p className="text-[11px] text-[var(--color-ink-muted)]">Loading GP Summary details…</p>
          ) : resolved && !expanded ? (
            <button
              type="button"
              onClick={() => setExpanded(true)}
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <span className="flex min-w-0 items-center gap-2">
                <span className="grid size-5 shrink-0 place-items-center rounded-[5px] bg-emerald-50 text-emerald-600 dark:bg-emerald-950/30 dark:text-emerald-400">
                  <Check className="size-3" />
                </span>
                <span className="truncate text-[12px] font-semibold text-[var(--color-ink)]">GP Summary — Done</span>
              </span>
              <span className="flex shrink-0 items-center gap-1.5 text-[10.5px] text-[var(--color-ink-muted)]">
                Compliant · Confirmed by {detail?.confirmed_checked_by_name ?? '—'}
                <ChevronDown className="size-3.5" />
              </span>
            </button>
          ) : editMode ? (
            <div className="flex flex-col gap-2">
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                  Surgery
                  <input type="text" value={form.surgeryName} onChange={(e) => setForm((f) => ({ ...f, surgeryName: e.target.value }))}
                    className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
                </label>
                <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                  Email
                  <input type="email" value={form.surgeryEmail} onChange={(e) => setForm((f) => ({ ...f, surgeryEmail: e.target.value }))}
                    className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
                </label>
                <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                  Telephone
                  <input type="text" value={form.surgeryPhone} onChange={(e) => setForm((f) => ({ ...f, surgeryPhone: e.target.value }))}
                    className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
                </label>
                <div />
                <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                  Date request sent
                  <input type="date" value={form.requestSentAt} onChange={(e) => setForm((f) => ({ ...f, requestSentAt: e.target.value }))}
                    className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
                </label>
                <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                  Date received
                  <input type="date" value={form.receivedAt} onChange={(e) => setForm((f) => ({ ...f, receivedAt: e.target.value }))}
                    className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
                </label>
              </div>
              {error ? <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy} onClick={save}
                  className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white transition disabled:opacity-50">
                  {busy ? 'Saving…' : 'Save'}
                </button>
                <button type="button" disabled={busy} onClick={() => setEditMode(false)}
                  className="rounded-md px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </div>
          ) : (
            <div className="flex flex-col gap-2.5">
              {resolved ? (
                <button
                  type="button"
                  onClick={() => setExpanded(false)}
                  className="flex items-center gap-1 self-start text-[10px] text-[var(--color-ink-muted)] transition hover:text-[var(--color-ink)]"
                >
                  <ChevronUp className="size-3" /> Hide details
                </button>
              ) : null}
              <div className="flex items-center justify-between">
                <span className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">GP Summary log</span>
                {canEdit ? (
                  <button type="button" onClick={openEdit}
                    className="flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                    <Pencil className="size-3" /> Edit
                  </button>
                ) : null}
              </div>
              <GpSummaryTrail detail={detail} />
              <div className="grid grid-cols-2 gap-x-4 gap-y-2 text-[11.5px]">
                <DetailFact label="Surgery" value={detail?.surgery_name ?? undefined} />
                <DetailFact label="Email" value={detail?.surgery_email ?? undefined} />
                <DetailFact label="Telephone" value={detail?.surgery_phone ?? undefined} />
                <DetailFact
                  label="Compliant"
                  value={detail == null || detail.compliant === null ? undefined : detail.compliant ? 'Yes' : 'No'}
                />
                <DetailFact
                  label="Request sent"
                  value={detail?.request_sent_at ? `${formatDate(new Date(detail.request_sent_at + 'T12:00:00'))}${detail.request_sent_by_name ? ` by ${detail.request_sent_by_name}` : ''}` : undefined}
                />
                <DetailFact
                  label="Received"
                  value={detail?.received_at ? formatDate(new Date(detail.received_at + 'T12:00:00')) : undefined}
                />
              </div>

              <div className="mt-1 flex flex-col gap-2 border-t border-[var(--color-line)] pt-2.5 sm:flex-row sm:items-end sm:justify-between">
                {detail?.doctor_informed_at ? (
                  <div className="flex items-center gap-2 text-[11px] text-[var(--color-ink-muted)]">
                    <span>
                      Doctor informed — {detail.ukat_doctor ? `${detail.ukat_doctor}, ` : ''}
                      by {detail.doctor_informed_by_name ?? '—'} on {formatDate(new Date(detail.doctor_informed_at))}
                    </span>
                    {canEdit ? (
                      <button type="button" disabled={doctorBusy} onClick={() => void undoDoctorInformed()}
                        className="shrink-0 text-[10.5px] font-medium text-[var(--color-ink-muted)] underline decoration-dotted transition hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400">
                        {doctorBusy ? '…' : 'Undo'}
                      </button>
                    ) : null}
                  </div>
                ) : canEdit ? (
                  <div className="flex items-center gap-1.5">
                    <input type="text" value={doctorName} onChange={(e) => setDoctorName(e.target.value)} placeholder="UKAT doctor (optional)"
                      className="w-36 rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1 text-[11px] outline-none focus:border-[var(--color-accent)]" />
                    <button type="button" disabled={doctorBusy} onClick={() => void markDoctorInformed()}
                      className="shrink-0 rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] font-medium transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10">
                      {doctorBusy ? '…' : 'Mark doctor informed'}
                    </button>
                  </div>
                ) : (
                  <span className="text-[11px] text-[var(--color-ink-muted)]">Doctor not yet informed</span>
                )}

                {detail?.confirmed_checked_at ? (
                  <div className="flex items-center gap-2 text-[11px] text-[var(--color-ink-muted)]">
                    <span>
                      Confirmed by {detail.confirmed_checked_by_name ?? '—'} on {formatDate(new Date(detail.confirmed_checked_at))}
                    </span>
                    {canEdit ? (
                      <button type="button" disabled={confirmBusy} onClick={() => void undoConfirmed()}
                        className="shrink-0 text-[10.5px] font-medium text-[var(--color-ink-muted)] underline decoration-dotted transition hover:text-red-600 disabled:opacity-50 dark:hover:text-red-400">
                        {confirmBusy ? '…' : 'Undo'}
                      </button>
                    ) : null}
                  </div>
                ) : canEdit ? (
                  <button type="button" disabled={confirmBusy} onClick={() => void markConfirmed()}
                    className="shrink-0 rounded-md border border-[var(--color-line)] px-2 py-1 text-[11px] font-medium transition hover:bg-black/5 disabled:opacity-50 dark:hover:bg-white/10">
                    {confirmBusy ? '…' : 'Mark confirmed / checked'}
                  </button>
                ) : (
                  <span className="text-[11px] text-[var(--color-ink-muted)]">Not yet confirmed</span>
                )}
              </div>
            </div>
          )}
        </div>
      ) : null}
    </div>
  );
}

/** A step ticks the moment its own field is filled in — no separate "mark this step done" action,
 * it just reflects what's already been entered below. */
function GpSummaryTrail({ detail }: { detail: GpSummaryDetail | null }) {
  const steps = [
    { label: 'Surgery details', done: !!detail?.surgery_name },
    { label: 'Request sent', done: !!detail?.request_sent_at },
    { label: 'Received', done: !!detail?.received_at },
    { label: 'Doctor informed', done: !!detail?.doctor_informed_at },
    { label: 'Confirmed', done: !!detail?.confirmed_checked_at },
  ];

  return (
    <div className="flex flex-wrap items-center gap-1">
      {steps.map((s, i) => (
        <div key={s.label} className="flex items-center gap-1">
          <span
            className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-medium whitespace-nowrap transition ${
              s.done
                ? 'bg-emerald-50 text-emerald-700 dark:bg-emerald-950/30 dark:text-emerald-400'
                : 'bg-black/[0.04] text-[var(--color-ink-muted)] dark:bg-white/[0.06]'
            }`}
          >
            {s.done ? <Check className="size-2.5 shrink-0" /> : <span className="size-1.5 shrink-0 rounded-full bg-current opacity-40" />}
            {s.label}
          </span>
          {i < steps.length - 1 ? (
            <div className={`h-px w-2.5 shrink-0 ${s.done ? 'bg-emerald-300 dark:bg-emerald-700' : 'bg-[var(--color-line)]'}`} />
          ) : null}
        </div>
      ))}
    </div>
  );
}

function DetailFact({ label, value }: { label: string; value: string | undefined }) {
  return (
    <div>
      <div className="text-[9.5px] font-semibold tracking-[0.05em] text-[var(--color-ink-muted)] uppercase">{label}</div>
      <div className="mt-0.5 text-[var(--color-ink)]">{value ?? <span className="text-[var(--color-ink-muted)]">—</span>}</div>
    </div>
  );
}
