import { useEffect, useState } from 'react';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import { useAuth } from '../auth/AuthProvider.tsx';
import {
  admissions,
  clinicalLookups,
  roomsAndBeds,
  type BedRow,
  type RoomRow,
  type SubstanceRow,
} from '../../services/data-access.js';
import { Chip } from '../../components/ui.tsx';

/**
 * The admission form — the first UI that calls `app.admit_client`.
 *
 * Scoped deliberately to a NEW client only. Brief section 9 also asks for "search for an existing
 * client first"; that needs a client directory to search, and the Clients screen does not exist
 * yet. Building a search box against nothing to search would be worse than not building it, so this
 * is the create-new path, with the reuse path left for when the directory exists.
 *
 * This form performs no business logic. It collects input, shows a review step, and sends one RPC
 * call. Whether a bed is really free, whether the discharge date is right, whether a duplicate
 * admission exists — all of that is decided by the database, proven in migrations 0022/0023. If this
 * component gets it wrong, the server refuses the request; it does not silently succeed wrong.
 */

type Step = 'form' | 'review' | 'done';

interface FormState {
  firstName: string;
  lastName: string;
  preferredName: string;
  admittedDate: string;
  admittedTime: string;
  plannedDuration: string;
  plannedDurationUnit: 'days' | 'weeks';
  bedKey: string; // `${roomId}:${bedId}`, so the select has one unambiguous value
  treatmentGroup: string;
  substanceId: string;
  peepRequired: boolean;
  focalTherapistLabel: string;
  buddyLabel: string;
  doctorLabel: string;
  reason: string;
}

const EMPTY: FormState = {
  firstName: '',
  lastName: '',
  preferredName: '',
  admittedDate: new Date().toISOString().slice(0, 10),
  admittedTime: '12:00',
  plannedDuration: '28',
  plannedDurationUnit: 'days',
  bedKey: '',
  treatmentGroup: '',
  substanceId: '',
  peepRequired: false,
  focalTherapistLabel: '',
  buddyLabel: '',
  doctorLabel: '',
  reason: '',
};

function Field({
  label,
  children,
  hint,
}: {
  label: string;
  children: React.ReactNode;
  hint?: string;
}) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[11px] font-medium text-[var(--color-ink-muted)]">{label}</span>
      {children}
      {hint ? <span className="text-[10.5px] text-[var(--color-ink-muted)]">{hint}</span> : null}
    </label>
  );
}

const inputCls =
  'rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2.5 py-1.5 text-[13px] focus:border-[var(--color-accent)] focus:outline-none';

export function AdmitClientForm({ centre }: { centre: AccessibleCentre }) {
  const { can } = useAuth();
  const canAdmit = can('admissions.create');

  const [beds, setBeds] = useState<Array<RoomRow & { bed: BedRow }>>([]);
  const [substances, setSubstances] = useState<SubstanceRow[]>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState<Step>('form');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ admissionId: string } | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    Promise.all([roomsAndBeds.availableBeds(centre.id), clinicalLookups.substances()])
      .then(([bedRows, subRows]) => {
        if (cancelled) return;
        setBeds(bedRows);
        setSubstances(subRows);
        setLoadError(null);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setLoadError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [centre.id]);

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) =>
    setForm((f) => ({ ...f, [key]: value }));

  const selectedBed = beds.find((r) => `${r.id}:${r.bed.id}` === form.bedKey);
  const canReview =
    form.firstName.trim() &&
    form.lastName.trim() &&
    form.bedKey &&
    Number(form.plannedDuration) > 0;

  const submit = async () => {
    if (!selectedBed) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const admittedAt = new Date(`${form.admittedDate}T${form.admittedTime}:00`).toISOString();
      const substanceName = substances.find((s) => s.id === form.substanceId)?.name;
      const admissionId = await admissions.admitClient({
        centreId: centre.id,
        bedId: selectedBed.bed.id,
        admittedAt,
        plannedDuration: Number(form.plannedDuration),
        plannedDurationUnit: form.plannedDurationUnit,
        firstName: form.firstName.trim(),
        lastName: form.lastName.trim(),
        preferredName: form.preferredName.trim() || undefined,
        treatmentGroup: form.treatmentGroup.trim() || undefined,
        substanceName,
        peepRequired: form.peepRequired,
        focalTherapistLabel: form.focalTherapistLabel.trim() || undefined,
        buddyLabel: form.buddyLabel.trim() || undefined,
        doctorLabel: form.doctorLabel.trim() || undefined,
        reason: form.reason.trim() || undefined,
      });
      setResult({ admissionId });
      setStep('done');
    } catch (err) {
      // Server-side refusals surface here verbatim: a duplicate admission, an occupied bed, a
      // permission the signed-in user does not hold. Nothing here overrides or reinterprets them.
      setSubmitError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  if (!canAdmit) {
    return (
      <div className="mx-auto max-w-[480px] px-5 py-16 text-center">
        <p className="text-[13px] text-[var(--color-ink-muted)]">
          You do not have permission to admit clients at {centre.name}.
        </p>
      </div>
    );
  }

  if (loading) {
    return <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading available beds…</div>;
  }

  if (loadError) {
    return (
      <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        Could not load this form: {loadError}
      </div>
    );
  }

  if (step === 'done' && result) {
    return (
      <div className="mx-auto max-w-[480px] px-5 py-16 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-emerald-500/12 text-[18px] text-emerald-600 dark:text-emerald-400">
          &#10003;
        </div>
        <h2 className="mt-3.5 text-[16px] font-semibold">Admission created</h2>
        <p className="mt-1.5 text-[12.5px] text-[var(--color-ink-muted)]">
          {form.firstName} {form.lastName} has been admitted to bed {selectedBed?.bed.label} at{' '}
          {centre.name}. 20 tasks were generated automatically.
        </p>
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY);
            setResult(null);
            setStep('form');
            void roomsAndBeds.availableBeds(centre.id).then(setBeds);
          }}
          className="mt-4 rounded-lg bg-[var(--color-ink)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-surface)]"
        >
          Admit another client
        </button>
      </div>
    );
  }

  if (step === 'review' && selectedBed) {
    return (
      <div className="mx-auto max-w-[560px] px-5 py-8">
        <h2 className="text-[16px] font-semibold">Review before admitting</h2>
        <p className="mt-1 text-[12.5px] text-[var(--color-ink-muted)]">
          Nothing is saved until you confirm. The server will still refuse this if the bed has since
          been taken, or anything else is wrong — this screen cannot override that.
        </p>

        <dl className="mt-4 grid grid-cols-2 gap-3 rounded-lg border border-[var(--color-line)] p-4 text-[13px]">
          <div>
            <dt className="text-[11px] text-[var(--color-ink-muted)]">Client</dt>
            <dd className="font-medium">
              {form.firstName} {form.lastName}
              {form.preferredName ? ` "${form.preferredName}"` : ''}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-ink-muted)]">Bed</dt>
            <dd className="font-medium">
              {selectedBed.bed.label} ({selectedBed.room_type})
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-ink-muted)]">Admitted</dt>
            <dd className="font-medium">
              {form.admittedDate} {form.admittedTime}
            </dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-ink-muted)]">Duration</dt>
            <dd className="font-medium">
              {form.plannedDuration} {form.plannedDurationUnit}
            </dd>
          </div>
          {form.treatmentGroup ? (
            <div>
              <dt className="text-[11px] text-[var(--color-ink-muted)]">Group</dt>
              <dd className="font-medium">{form.treatmentGroup}</dd>
            </div>
          ) : null}
          {form.substanceId ? (
            <div>
              <dt className="text-[11px] text-[var(--color-ink-muted)]">Substance</dt>
              <dd className="font-medium">{substances.find((s) => s.id === form.substanceId)?.name}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-[11px] text-[var(--color-ink-muted)]">PEEP required</dt>
            <dd className="font-medium">{form.peepRequired ? 'Yes' : 'No'}</dd>
          </div>
          {form.focalTherapistLabel ? (
            <div>
              <dt className="text-[11px] text-[var(--color-ink-muted)]">Focal therapist</dt>
              <dd className="font-medium">{form.focalTherapistLabel}</dd>
            </div>
          ) : null}
          {form.buddyLabel ? (
            <div>
              <dt className="text-[11px] text-[var(--color-ink-muted)]">Buddy</dt>
              <dd className="font-medium">{form.buddyLabel}</dd>
            </div>
          ) : null}
          {form.doctorLabel ? (
            <div>
              <dt className="text-[11px] text-[var(--color-ink-muted)]">Doctor</dt>
              <dd className="font-medium">{form.doctorLabel}</dd>
            </div>
          ) : null}
        </dl>

        {submitError ? (
          <div className="mt-3 rounded-lg border border-red-300 bg-red-50 p-3 text-[12.5px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
            {submitError}
          </div>
        ) : null}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={() => setStep('form')}
            className="rounded-lg border border-[var(--color-line)] px-3.5 py-2 text-[12.5px] font-medium"
          >
            Back
          </button>
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className="rounded-lg bg-[var(--color-accent)] px-3.5 py-2 text-[12.5px] font-medium text-white disabled:opacity-50"
          >
            {busy ? 'Admitting…' : 'Confirm admission'}
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-[640px] px-5 py-8">
      <h2 className="text-[16px] font-semibold">Admit a client — {centre.name}</h2>
      <p className="mt-1 text-[12.5px] text-[var(--color-ink-muted)]">
        {beds.length} bed{beds.length === 1 ? '' : 's'} currently available. Creates a new client
        record — reusing an existing one will be possible once the client directory exists.
      </p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canReview) setStep('review');
        }}
        className="mt-5 flex flex-col gap-4"
      >
        <div className="grid grid-cols-2 gap-3">
          <Field label="First name">
            <input
              className={inputCls}
              value={form.firstName}
              onChange={(e) => set('firstName', e.target.value)}
              required
            />
          </Field>
          <Field label="Last name">
            <input
              className={inputCls}
              value={form.lastName}
              onChange={(e) => set('lastName', e.target.value)}
              required
            />
          </Field>
        </div>

        <Field label="Preferred name (optional)">
          <input
            className={inputCls}
            value={form.preferredName}
            onChange={(e) => set('preferredName', e.target.value)}
          />
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Admission date">
            <input
              type="date"
              className={inputCls}
              value={form.admittedDate}
              onChange={(e) => set('admittedDate', e.target.value)}
              required
            />
          </Field>
          <Field label="Admission time">
            <input
              type="time"
              className={inputCls}
              value={form.admittedTime}
              onChange={(e) => set('admittedTime', e.target.value)}
              required
            />
          </Field>
        </div>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Treatment duration">
            <input
              type="number"
              min={1}
              className={inputCls}
              value={form.plannedDuration}
              onChange={(e) => set('plannedDuration', e.target.value)}
              required
            />
          </Field>
          <Field label="Unit">
            <select
              className={inputCls}
              value={form.plannedDurationUnit}
              onChange={(e) => set('plannedDurationUnit', e.target.value as 'days' | 'weeks')}
            >
              <option value="days">Days</option>
              <option value="weeks">Weeks</option>
            </select>
          </Field>
        </div>

        <Field
          label="Bed"
          hint={
            beds.length === 0
              ? 'No beds are currently available at this centre.'
              : 'Only beds with no open allocation are listed. The server checks again on submit.'
          }
        >
          <select
            className={inputCls}
            value={form.bedKey}
            onChange={(e) => set('bedKey', e.target.value)}
            required
          >
            <option value="">Select a bed…</option>
            {beds.map((r) => (
              <option key={r.bed.id} value={`${r.id}:${r.bed.id}`}>
                {r.bed.label} — Room {r.label} ({r.room_type})
              </option>
            ))}
          </select>
        </Field>

        <div className="grid grid-cols-2 gap-3">
          <Field label="Treatment group (optional)">
            <input
              className={inputCls}
              value={form.treatmentGroup}
              onChange={(e) => set('treatmentGroup', e.target.value)}
              placeholder="e.g. A"
            />
          </Field>
          <Field label="Primary substance (optional)">
            <select
              className={inputCls}
              value={form.substanceId}
              onChange={(e) => set('substanceId', e.target.value)}
            >
              <option value="">Not recorded</option>
              {substances.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>
          </Field>
        </div>

        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={form.peepRequired}
            onChange={(e) => set('peepRequired', e.target.checked)}
          />
          PEEP required
          <Chip label="Personal Emergency Evacuation Plan" title="Meaning as inferred; unconfirmed — see OPEN_QUESTIONS Q1" />
        </label>

        <div className="grid grid-cols-3 gap-3">
          <Field label="Focal therapist (optional)">
            <input
              className={inputCls}
              value={form.focalTherapistLabel}
              onChange={(e) => set('focalTherapistLabel', e.target.value)}
              placeholder="Name"
            />
          </Field>
          <Field label="Buddy (optional)" hint="Centre staff (Q41)">
            <input
              className={inputCls}
              value={form.buddyLabel}
              onChange={(e) => set('buddyLabel', e.target.value)}
              placeholder="Name"
            />
          </Field>
          <Field label="Doctor (optional)">
            <input
              className={inputCls}
              value={form.doctorLabel}
              onChange={(e) => set('doctorLabel', e.target.value)}
              placeholder="Name"
            />
          </Field>
        </div>

        <Field label="Notes (optional)">
          <textarea
            className={`${inputCls} min-h-[64px] resize-y`}
            value={form.reason}
            onChange={(e) => set('reason', e.target.value)}
          />
        </Field>

        <button
          type="submit"
          disabled={!canReview}
          className="mt-1 self-start rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
        >
          Review admission
        </button>
      </form>
    </div>
  );
}
