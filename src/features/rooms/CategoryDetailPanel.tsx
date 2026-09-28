import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { Pencil, Plus, X } from 'lucide-react';
import type { BoardBed } from './board-data.js';
import { PhotoBadge } from './BedCard.tsx';
import { Chip } from '../../components/ui.tsx';
import { formatDate } from '../../lib/format.js';
import { admissions, tasks as taskService } from '../../services/data-access.js';
import { useAuth } from '../auth/AuthProvider.tsx';
import { TaskRow } from './DetailPanel.tsx';
import { CATEGORY_LABEL, categoryStatus, COLUMNS, isCustomTask, type CategoryKey } from './category-status.js';

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
        className="fixed top-0 right-0 z-50 flex h-full w-full max-w-[480px] flex-col bg-card shadow-2xl"
        style={{ animation: 'cdp-slide-in 0.22s cubic-bezier(0.25,0.46,0.45,0.94) both' }}
      >
        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--color-line)] p-5 shrink-0">
          <PhotoBadge occupant={o} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate font-display text-[16px] font-semibold text-[var(--color-ink)]">
              {o.displayName}
            </h2>
            <p className="text-[12px] text-[var(--color-ink-muted)]">Room {bed.label} · {label}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="ml-1 shrink-0 rounded-md p-1.5 text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[var(--color-accent)]"
          >
            <X className="size-4" />
          </button>
        </div>

        {/* Facts row */}
        <div className="grid grid-cols-2 gap-4 border-b border-[var(--color-line)] px-5 py-4 text-[12.5px] shrink-0">
          <Fact label="Therapist" value={o.therapist ?? 'Not assigned'} />
          <Fact label="Client status" value="Admitted" />
          <Fact label="Admission date" value={formatDate(o.admittedAt)} />
          <Fact label="Planned discharge" value={formatDate(o.plannedDischargeDate)} />
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between gap-3 bg-[var(--color-surface)] px-5 py-3 shrink-0">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">{label}</div>
            <div className="text-[11.5px] text-[var(--color-ink-muted)]">
              {status.totalCount} internal {status.totalCount === 1 ? 'detail' : 'details'}
            </div>
          </div>
          {status.attentionCount > 0 ? (
            <Chip icon="⚠" label={`${status.attentionCount} need attention`} tone="warn" />
          ) : null}
        </div>

        {/* Content — scrollable */}
        <div className="flex-1 overflow-y-auto p-5">
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

  if (category === 'doctor') {
    return (
      <p className="text-[12.5px] text-[var(--color-ink-muted)]">
        No internal fields recorded yet for this category.
      </p>
    );
  }

  if (category === 'custom') {
    return <CustomSection o={o} onChanged={onChanged} {...(readOnly ? { readOnly } : {})} />;
  }

  // Module-backed categories: contact / survey / familyvisit / lifestep / careplan
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
      <li className="flex items-center justify-between gap-3 rounded-lg border border-dashed border-[var(--color-line)] px-3 py-2.5">
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
    <li className="flex flex-col gap-2 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-3 py-3">
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

/* ─── Custom task section ────────────────────────────────────────────────── */

function CustomSection({
  o,
  onChanged,
  readOnly,
}: {
  o: NonNullable<BoardBed['occupant']>;
  onChanged?: (() => void) | undefined;
  readOnly?: boolean;
}) {
  const { can } = useAuth();
  const canEdit = !!o.admissionId && can('admissions.edit') && !readOnly;
  const [addOpen, setAddOpen] = useState(false);
  const [name, setName] = useState('');
  const [dueDate, setDueDate] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const manualTasks = o.tasks.filter(isCustomTask);

  async function addTask() {
    if (!o.admissionId || !name.trim()) return;
    setBusy(true);
    setError(null);
    try {
      await taskService.addManualTask({
        admissionId: o.admissionId,
        title: name.trim(),
        category: 'milestone',
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
        <p className="text-[12.5px] text-[var(--color-ink-muted)]">No custom assignments for this client.</p>
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
        <div className="flex flex-col gap-2 rounded-lg border border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] px-3 py-3">
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

function Field({ label, children, highlight }: { label: string; children: React.ReactNode; highlight?: boolean }) {
  return (
    <div className={`rounded-lg px-3 py-2.5 ${highlight ? 'bg-amber-50 dark:bg-amber-950/20' : ''}`}>
      <div className="text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">{label}</div>
      <div className={`mt-1 text-[12.5px] ${highlight ? 'font-medium text-amber-700 dark:text-amber-300' : 'text-[var(--color-ink)]'}`}>
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
  const [form, setForm] = useState({ therapist: '', buddy: '', group: '', substance: '', peep: false });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const gp = o.tasks.find((t) => t.code === 'gp_summary');
  const pct = Math.min(100, Math.round((o.treatmentDay / o.durationDays) * 100));
  const canEdit = !!o.admissionId && can('admissions.edit') && !readOnly;

  function openEdit() {
    setForm({
      therapist: o.therapist ?? '',
      buddy: o.buddy ?? '',
      group: o.group ?? '',
      substance: o.substance ?? '',
      peep: o.peeps,
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
        {gp ? (
          <div className="mt-1 border-t border-[var(--color-line)] pt-3">
            <div className="mb-1.5 text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">GP Summary</div>
            <ul><TaskRow task={gp} admittedAt={o.admittedAt} onChanged={onChanged} {...(readOnly ? { readOnly } : {})} /></ul>
          </div>
        ) : null}
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
      <div className="grid grid-cols-2 gap-2">
        <Field label="Focal Therapist" highlight={!o.therapist}>{o.therapist ?? 'Not assigned'}</Field>
        <Field label="Substance">{o.substance || '—'}</Field>
        <Field label="Treatment Duration">
          {o.treatmentDay} / {o.durationDays} days
          <div className="mt-1.5 h-1.5 w-full overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12">
            <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
          </div>
        </Field>
        <Field label="Discharge Date">{formatDate(o.plannedDischargeDate)}</Field>
        <Field label="Detox Ends">Not set</Field>
        <Field label="Group">{o.group || '—'}</Field>
        <Field label="Doctor">Not set</Field>
        <Field label="Buddy">{o.buddy || '—'}</Field>
        <Field label="Peeps" highlight={o.peeps}>{o.peeps ? 'Yes' : 'No'}</Field>
      </div>
      {gp ? (
        <div className="mt-1 border-t border-[var(--color-line)] pt-3">
          <div className="mb-1.5 text-[10px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">GP Summary</div>
          <ul><TaskRow task={gp} admittedAt={o.admittedAt} onChanged={onChanged} {...(readOnly ? { readOnly } : {})} /></ul>
        </div>
      ) : (
        <Field label="GP Summary">Not applicable</Field>
      )}
    </div>
  );
}
