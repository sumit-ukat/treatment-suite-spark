import { useState } from 'react';
import { Pencil } from 'lucide-react';
import type { BoardBed } from './board-data.js';
import { PhotoBadge } from './BedCard.tsx';
import { Chip } from '../../components/ui.tsx';
import { Dialog, DialogContent, DialogTitle } from '../../components/ui/dialog.tsx';
import { formatDate } from '../../lib/format.js';
import { admissions } from '../../services/data-access.js';
import { useAuth } from '../auth/AuthProvider.tsx';
import { TaskRow } from './DetailPanel.tsx';
import { CATEGORY_LABEL, categoryStatus, COLUMNS, type CategoryKey } from './category-status.js';

/**
 * Category-scoped detail: shows and edits only the fields/tasks belonging to one board category,
 * for one client — never the full client file (that stays `DetailPanel`'s job). Task
 * completion/reopen reuses `TaskRow` verbatim, and the editable Admin fields reuse the same
 * `admissions.updateDetails` RPC `DetailPanel` uses — no parallel mutation path.
 */
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

  const status = categoryStatus(o, category);
  const label = CATEGORY_LABEL[category];

  return (
    <Dialog open onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="max-w-[560px] gap-0 p-0">
        <DialogTitle className="sr-only">{`${o.displayName} — ${label}`}</DialogTitle>

        {/* Header */}
        <div className="flex items-start gap-3 border-b border-[var(--color-line)] p-5">
          <PhotoBadge occupant={o} size="md" />
          <div className="min-w-0 flex-1">
            <h2 className="truncate pr-8 font-display text-[16px] font-semibold text-[var(--color-ink)]">{o.displayName}</h2>
            <p className="text-[12px] text-[var(--color-ink-muted)]">Room {bed.label} · {label}</p>
          </div>
        </div>

        {/* Facts row */}
        <div className="grid grid-cols-2 gap-4 border-b border-[var(--color-line)] px-5 py-4 text-[12.5px]">
          <Fact label="Therapist" value={o.therapist ?? 'Not assigned'} />
          <Fact label="Client status" value="Admitted" />
          <Fact label="Admission date" value={formatDate(o.admittedAt)} />
          <Fact label="Planned discharge" value={formatDate(o.plannedDischargeDate)} />
        </div>

        {/* Status bar */}
        <div className="flex items-center justify-between gap-3 bg-[var(--color-surface)] px-5 py-3">
          <div className="min-w-0">
            <div className="text-[13.5px] font-semibold text-[var(--color-ink)]">{label}</div>
            <div className="text-[11.5px] text-[var(--color-ink-muted)]">{status.totalCount} internal {status.totalCount === 1 ? 'detail' : 'details'}</div>
          </div>
          {status.attentionCount > 0 ? (
            <Chip icon="⚠" label={`${status.attentionCount} need attention`} tone="warn" />
          ) : null}
        </div>

        {/* Field/task grid */}
        <div className="max-h-[60vh] overflow-y-auto p-5">
          {category === 'admin' ? (
            <AdminFields o={o} onChanged={onChanged} readOnly={readOnly} />
          ) : category === 'custom' ? (
            <TaskList tasks={o.tasks.filter((t) => t.isManual)} admittedAt={o.admittedAt} onChanged={onChanged} readOnly={readOnly} emptyLabel="No custom assignments for this client." />
          ) : category === 'doctor' ? (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">No internal fields recorded yet for this category.</p>
          ) : !o.programmeModules.includes(category) ? (
            <p className="text-[12.5px] text-[var(--color-ink-muted)]">Not part of this client&apos;s treatment programme.</p>
          ) : (
            <TaskList
              tasks={o.tasks.filter((t) => COLUMNS.some((c) => c.group === category && c.code === t.code))}
              admittedAt={o.admittedAt}
              onChanged={onChanged}
              readOnly={readOnly}
              emptyLabel="No tasks recorded for this category."
            />
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}

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

function TaskList({
  tasks,
  admittedAt,
  onChanged,
  readOnly,
  emptyLabel,
}: {
  tasks: readonly import('./board-data.js').BoardTask[];
  admittedAt: Date;
  onChanged?: (() => void) | undefined;
  readOnly?: boolean;
  emptyLabel: string;
}) {
  if (tasks.length === 0) {
    return <p className="text-[12.5px] text-[var(--color-ink-muted)]">{emptyLabel}</p>;
  }
  return (
    <ul className="flex flex-col gap-1.5">
      {tasks.map((t) => (
        <TaskRow key={t.id ?? t.code} task={t} admittedAt={admittedAt} onChanged={onChanged} {...(readOnly ? { readOnly } : {})} />
      ))}
    </ul>
  );
}

/**
 * Focal Therapist / Buddy / Group / Substance / Peeps edit the same admission row `DetailPanel`'s
 * "Key facts" editor does, via the same `admissions.updateDetails` RPC — Keyworker isn't shown here
 * (it isn't one of this board's 10 Admin columns) but is round-tripped unchanged so editing here
 * never silently clears it. GP Summary is a real task, so it uses `TaskRow` directly rather than a
 * plain field. Doctor and Detox Ends have no backing column anywhere yet — shown as "Not set", never
 * invented, and not editable until a real field exists.
 */
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
            <input
              type="text"
              value={form.therapist}
              onChange={(e) => setForm((f) => ({ ...f, therapist: e.target.value }))}
              placeholder="Name…"
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Buddy
            <input
              type="text"
              value={form.buddy}
              onChange={(e) => setForm((f) => ({ ...f, buddy: e.target.value }))}
              placeholder="Name…"
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Group
            <input
              type="text"
              value={form.group}
              onChange={(e) => setForm((f) => ({ ...f, group: e.target.value }))}
              placeholder="e.g. A…"
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
          <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
            Substance
            <input
              type="text"
              value={form.substance}
              onChange={(e) => setForm((f) => ({ ...f, substance: e.target.value }))}
              placeholder="e.g. Alcohol…"
              className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
            />
          </label>
        </div>
        <label className="flex cursor-pointer items-center gap-2 text-[10.5px] text-[var(--color-ink-muted)]">
          <input
            type="checkbox"
            checked={form.peep}
            onChange={(e) => setForm((f) => ({ ...f, peep: e.target.checked }))}
            className="rounded accent-[var(--color-accent)]"
          />
          Peeps (personal evacuation plan required)
        </label>
        {error ? <p role="alert" className="text-[11px] text-red-600 dark:text-red-400">{error}</p> : null}
        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={busy}
            onClick={save}
            className="rounded-md bg-[var(--color-accent)] px-3 py-1.5 text-[12px] font-medium text-white transition disabled:opacity-50"
          >
            {busy ? 'Saving…' : 'Save'}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => setEditMode(false)}
            className="rounded-md px-3 py-1.5 text-[12px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
          >
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
        <button
          type="button"
          onClick={openEdit}
          className="flex items-center gap-1 self-end rounded px-1.5 py-0.5 text-[10px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10"
        >
          <Pencil className="size-3" /> Edit
        </button>
      ) : null}
      <div className="grid grid-cols-2 gap-2">
        <Field label="Focal Therapist" highlight={!o.therapist}>
          {o.therapist ?? 'Not assigned'}
        </Field>
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
