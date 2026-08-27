import { Camera, CheckCircle2, X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import type { AccessibleCentre } from '../auth/AuthProvider.tsx';
import { useAuth } from '../auth/AuthProvider.tsx';
import {
  admissions,
  clientPhotos,
  roomsAndBeds,
  tasks as taskService,
  type BedRow,
  type ClientSearchResult,
  type RoomRow,
} from '../../services/data-access.js';
import { Chip } from '../../components/ui.tsx';
import { PageHeader } from '../../components/metric-card.tsx';
import { useClientSearch } from '../clients/useClientSearch.js';
import { formatDate } from '../../lib/format.js';
import { formatBytes } from '../../lib/image.js';

/**
 * The admission form — the first UI that calls `app.admit_client`.
 *
 * Brief section 9 also asks for "search for an existing client first" — that needed a client
 * directory to search against, which migration 0028 and the Clients screen now provide, so this form
 * supports both paths `app.admit_client` has always accepted: pick an existing client via search, or
 * create a new one. Which is available depends on what the signed-in role holds: reusing a client
 * needs only `admissions.create`, but creating one also needs `clients.edit_identity` (the server's
 * own rule, in migration 0022) — a role with the first but not the second can admit a returning
 * client but cannot register a new one, and the "New client" tab is disabled to say so rather than
 * silently failing at submit.
 *
 * This form performs no business logic. It collects input, shows a review step, and sends one RPC
 * call. Whether a bed is really free, whether the discharge date is right, whether a duplicate
 * admission exists — all of that is decided by the database, proven in migrations 0022/0023. If this
 * component gets it wrong, the server refuses the request; it does not silently succeed wrong.
 */

type Step = 'form' | 'review' | 'done';
type ClientMode = 'new' | 'existing';

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
  substanceName: string;
  peepRequired: boolean;
  highRisk: boolean;
  focalTherapistLabel: string;
  buddyLabel: string;
  doctorLabel: string;
  peepsLabel: string;
  detoxEndsDate: string;
  programmeModules: string[];
  extraAssignments: Array<{ name: string; dueDay: string; type: 'milestone' | 'session' | 'admin' }>;
  safeguardingConcerns: string;
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
  substanceName: '',
  peepRequired: false,
  highRisk: false,
  focalTherapistLabel: '',
  buddyLabel: '',
  doctorLabel: '',
  peepsLabel: '',
  detoxEndsDate: '',
  programmeModules: ['contact', 'survey', 'familyvisit', 'lifestep', 'careplan'],
  extraAssignments: [],
  safeguardingConcerns: '',
  reason: '',
};

function SectionHeading({ children }: { children: React.ReactNode }) {
  return (
    <h3 className="text-[11px] font-semibold tracking-[0.06em] text-[var(--color-ink-muted)] uppercase">
      {children}
    </h3>
  );
}

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
  // The server's own split (migration 0022): reusing a client needs only admissions.create, but
  // creating one also needs clients.edit_identity. A role with the first but not the second can
  // still admit a returning client — it just cannot register a new one.
  const canCreateNew = can('clients.edit_identity');

  const [beds, setBeds] = useState<Array<RoomRow & { bed: BedRow }>>([]);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // A bed clicked directly on the room board arrives here as `?bed=<label>` — matched against the
  // loaded bed list by label (the only identifier the board's own BoardBed type carries) rather than
  // by id, since the board never fetches the real bed/room ids that would let it link straight there.
  const [searchParams] = useSearchParams();
  const preselectBedLabel = searchParams.get('bed');

  const [mode, setMode] = useState<ClientMode>(() => (canCreateNew ? 'new' : 'existing'));
  const [selectedClient, setSelectedClient] = useState<ClientSearchResult | null>(null);
  const clientSearch = useClientSearch(centre.id);

  const [form, setForm] = useState<FormState>(EMPTY);
  const [step, setStep] = useState<Step>('form');
  const [submitError, setSubmitError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ admissionId: string } | null>(null);

  const [photoFile, setPhotoFile] = useState<File | null>(null);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoError, setPhotoError] = useState<string | null>(null);

  function handlePhotoChange(e: React.ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoFile(file);
    const url = URL.createObjectURL(file);
    setPhotoPreview(url);
  }

  function clearPhoto() {
    setPhotoFile(null);
    if (photoPreview) URL.revokeObjectURL(photoPreview);
    setPhotoPreview(null);
    setPhotoError(null);
  }

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    roomsAndBeds.availableBeds(centre.id)
      .then((bedRows) => {
        if (cancelled) return;
        setBeds(bedRows);
        setLoadError(null);
        if (preselectBedLabel) {
          const match = bedRows.find((r) => r.bed.label === preselectBedLabel);
          if (match) setForm((f) => ({ ...f, bedKey: `${match.id}:${match.bed.id}` }));
        }
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
    (mode === 'new'
      ? Boolean(form.firstName.trim() && form.lastName.trim())
      : Boolean(selectedClient && !selectedClient.has_open_admission)) &&
    form.bedKey &&
    Number(form.plannedDuration) > 0;

  const submit = async () => {
    if (!selectedBed) return;
    if (mode === 'existing' && !selectedClient) return;
    setBusy(true);
    setSubmitError(null);
    try {
      const admittedAt = new Date(`${form.admittedDate}T${form.admittedTime}:00`).toISOString();
      const substanceName = form.substanceName.trim() || undefined;
      const admissionId = await admissions.admitClient({
        centreId: centre.id,
        bedId: selectedBed.bed.id,
        admittedAt,
        plannedDuration: Number(form.plannedDuration),
        plannedDurationUnit: form.plannedDurationUnit,
        ...(mode === 'existing'
          ? { clientId: selectedClient!.client_id }
          : { firstName: form.firstName.trim(), lastName: form.lastName.trim() }),
        preferredName: form.preferredName.trim() || undefined,
        treatmentGroup: form.treatmentGroup.trim() || undefined,
        substanceName,
        peepRequired: form.peepRequired,
        highRisk: form.highRisk,
        safeguardingNotes: form.safeguardingConcerns.trim() || undefined,
        focalTherapistLabel: form.focalTherapistLabel.trim() || undefined,
        buddyLabel: form.buddyLabel.trim() || undefined,
        doctorLabel: form.doctorLabel.trim() || undefined,
        peepsLabel: form.peepsLabel.trim() || undefined,
        detoxEnds: form.detoxEndsDate || undefined,
        programmeModules: form.programmeModules,
        reason: form.reason.trim() || undefined,
      });
      // Extra assignments — blocking: if one fails the admission already succeeded but the user sees
      // the error so they can add the task manually via the profile panel.
      const admittedAt = new Date(`${form.admittedDate}T${form.admittedTime}:00`);
      for (const ea of form.extraAssignments) {
        if (!ea.name.trim()) continue;
        const dueDay = Math.max(1, parseInt(ea.dueDay, 10) || 1);
        const dueAt = new Date(admittedAt);
        dueAt.setDate(dueAt.getDate() + dueDay - 1);
        await taskService.addManualTask({
          admissionId,
          title: ea.name.trim(),
          category: ea.type,
          dueAt: dueAt.toISOString(),
        });
      }
      // Upload photo after admission — non-blocking: a photo failure never rolls back the admission.
      if (photoFile) {
        try {
          const clientId =
            mode === 'existing'
              ? selectedClient!.client_id
              : await admissions.getClientId(admissionId);
          await clientPhotos.upload({ centreId: centre.id, clientId, file: photoFile });
        } catch {
          // Swallowed intentionally — admission succeeded; photo can be added later.
        }
      }
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

  // Covers both modes so the review/done screens don't need to branch on `mode` themselves.
  const clientLabel =
    mode === 'existing'
      ? selectedClient?.display_name ?? selectedClient?.reference ?? ''
      : `${form.firstName} ${form.lastName}${form.preferredName ? ` "${form.preferredName}"` : ''}`;

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
        <div className="mx-auto grid size-12 place-items-center rounded-xl bg-emerald-500/12 text-emerald-600 dark:text-emerald-400">
          <CheckCircle2 className="size-6" />
        </div>
        <h2 className="mt-3.5 font-display text-[16px] font-semibold">Admission created</h2>
        <p className="mt-1.5 text-[12.5px] text-[var(--color-ink-muted)]">
          {clientLabel} has been admitted to bed {selectedBed?.bed.label} at {centre.name}. 20 standard
          tasks were generated automatically
          {form.extraAssignments.filter((e) => e.name.trim()).length > 0
            ? `, plus ${form.extraAssignments.filter((e) => e.name.trim()).length} custom assignment${form.extraAssignments.filter((e) => e.name.trim()).length !== 1 ? 's' : ''}.`
            : '.'
          }
        </p>
        <button
          type="button"
          onClick={() => {
            setForm(EMPTY);
            setSelectedClient(null);
            setResult(null);
            setStep('form');
            clearPhoto();
            void roomsAndBeds.availableBeds(centre.id).then(setBeds);
          }}
          className="mt-4 rounded-lg bg-[var(--color-ink)] px-3.5 py-2 text-[12.5px] font-medium text-[var(--color-surface)]"
        >
          Admit another client
        </button>
      </div>
    );
  }

  // Shown on the review screen only — a preview of what `app.admit_client` will compute server-side,
  // not a value sent with the request. If the server's own calculation ever disagreed (a different
  // calendar convention, for instance), that would be a bug worth finding, not something to paper
  // over by only ever showing the server's answer.
  const plannedDischargePreview = (() => {
    const start = new Date(`${form.admittedDate}T00:00:00`);
    const days = form.plannedDurationUnit === 'weeks' ? Number(form.plannedDuration) * 7 : Number(form.plannedDuration);
    if (!Number.isFinite(days)) return null;
    const end = new Date(start);
    end.setDate(end.getDate() + days);
    return end;
  })();

  if (step === 'review' && selectedBed) {
    return (
      <div className="mx-auto max-w-[560px] px-5 py-8">
        <PageHeader
          eyebrow={centre.name}
          title="Review before admitting"
          description="Nothing is saved until you confirm. The server will still refuse this if the bed has since been taken, or anything else is wrong — this screen cannot override that."
        />

        {photoPreview ? (
          <div className="mt-4 flex items-center gap-3 rounded-xl border border-[var(--color-line)] bg-card p-3">
            <img src={photoPreview} alt="Client photo preview" className="size-14 rounded-full object-cover border border-[var(--color-line)]" />
            <div className="min-w-0">
              <p className="text-[12px] font-medium text-[var(--color-ink)]">Photo attached</p>
              <p className="text-[11px] text-[var(--color-ink-muted)] truncate">{photoFile?.name} · {formatBytes(photoFile?.size ?? 0)}</p>
            </div>
          </div>
        ) : null}

        <dl className="mt-5 grid grid-cols-2 gap-3 rounded-2xl border bg-card p-4 text-[13px] shadow-soft">
          <div>
            <dt className="text-[11px] text-[var(--color-ink-muted)]">Client</dt>
            <dd className="font-medium">
              {clientLabel}
              {mode === 'existing' ? (
                <span className="ml-1.5 font-normal text-[var(--color-ink-muted)]">(existing)</span>
              ) : null}
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
          {plannedDischargePreview ? (
            <div>
              <dt className="text-[11px] text-[var(--color-ink-muted)]">Planned discharge</dt>
              <dd className="font-medium">{formatDate(plannedDischargePreview)}</dd>
            </div>
          ) : null}
          {form.treatmentGroup ? (
            <div>
              <dt className="text-[11px] text-[var(--color-ink-muted)]">Group</dt>
              <dd className="font-medium">{form.treatmentGroup}</dd>
            </div>
          ) : null}
          {form.substanceName.trim() ? (
            <div>
              <dt className="text-[11px] text-[var(--color-ink-muted)]">Substance</dt>
              <dd className="font-medium">{form.substanceName.trim()}</dd>
            </div>
          ) : null}
          <div>
            <dt className="text-[11px] text-[var(--color-ink-muted)]">PEEP required</dt>
            <dd className="font-medium">{form.peepRequired ? 'Yes' : 'No'}</dd>
          </div>
          <div>
            <dt className="text-[11px] text-[var(--color-ink-muted)]">High risk</dt>
            <dd className={`font-medium ${form.highRisk ? 'text-red-600 dark:text-red-400' : ''}`}>
              {form.highRisk ? 'Yes — profile highlighted' : 'No'}
            </dd>
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
          {form.peepsLabel ? (
            <div>
              <dt className="text-[11px] text-[var(--color-ink-muted)]">Peeps</dt>
              <dd className="font-medium">{form.peepsLabel}</dd>
            </div>
          ) : null}
          {form.detoxEndsDate ? (
            <div>
              <dt className="text-[11px] text-[var(--color-ink-muted)]">Detox ends</dt>
              <dd className="font-medium">{form.detoxEndsDate}</dd>
            </div>
          ) : null}
          <div className="col-span-2">
            <dt className="text-[11px] text-[var(--color-ink-muted)]">Programme modules</dt>
            <dd className="font-medium">
              {form.programmeModules.length === 0
                ? 'None selected'
                : [
                    { code: 'contact',     label: 'Contact/Comms'         },
                    { code: 'survey',      label: '7 Day Satisfaction'     },
                    { code: 'familyvisit', label: 'Family Visit'           },
                    { code: 'lifestep',    label: 'Life Story & Step Works'},
                    { code: 'careplan',    label: 'Care Plan'              },
                  ]
                    .filter(({ code }) => form.programmeModules.includes(code))
                    .map(({ label }) => label)
                    .join(', ')
              }
            </dd>
          </div>
          {form.extraAssignments.filter((e) => e.name.trim()).length > 0 ? (
            <div className="col-span-2">
              <dt className="text-[11px] text-[var(--color-ink-muted)]">Custom assignments</dt>
              <dd className="mt-1 flex flex-col gap-1">
                {form.extraAssignments.filter((e) => e.name.trim()).map((ea, i) => (
                  <span key={i} className="text-[12.5px]">
                    {ea.name.trim()}
                    <span className="ml-1.5 text-[var(--color-ink-muted)]">
                      · day {Math.max(1, parseInt(ea.dueDay, 10) || 1)} · {ea.type === 'milestone' ? 'Step work' : ea.type === 'session' ? 'Session' : 'Admin'}
                    </span>
                  </span>
                ))}
              </dd>
            </div>
          ) : null}
          {form.safeguardingConcerns.trim() ? (
            <div className="col-span-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 dark:border-amber-700 dark:bg-amber-950/40">
              <dt className="text-[11px] font-semibold text-amber-800 dark:text-amber-400">Safeguarding / Risks / Concerns</dt>
              <dd className="mt-0.5 whitespace-pre-wrap text-[12.5px] text-amber-900 dark:text-amber-200">{form.safeguardingConcerns.trim()}</dd>
            </div>
          ) : null}
        </dl>

        <p className="mt-3 text-[11px] leading-relaxed text-[var(--color-ink-muted)]">
          Required actions are generated automatically from the standard care programme once this is
          confirmed. This admission is written to audit history against your account.
        </p>

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
    <div className="mx-auto max-w-[980px] px-5 py-8">
      <PageHeader
        eyebrow={centre.name}
        title="Admit a client"
        description={
          preselectBedLabel && selectedBed
            ? `Bed ${preselectBedLabel} is pre-selected from the room board — change it below if needed.`
            : `${beds.length} bed${beds.length === 1 ? '' : 's'} currently available.`
        }
      />

      <div className="mt-5 grid gap-5 lg:grid-cols-[1fr_300px]">
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
      <SectionHeading>Client details</SectionHeading>
      <div
        role="tablist"
        aria-label="Client"
        className="mt-2.5 inline-flex rounded-lg border border-[var(--color-line)] p-0.5"
      >
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'existing'}
          onClick={() => setMode('existing')}
          className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition ${
            mode === 'existing'
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          Existing client
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'new'}
          disabled={!canCreateNew}
          title={canCreateNew ? undefined : 'Registering a new client needs clients.edit_identity'}
          onClick={() => setMode('new')}
          className={`rounded-md px-3 py-1.5 text-[12.5px] font-medium transition disabled:cursor-not-allowed disabled:opacity-40 ${
            mode === 'new'
              ? 'bg-[var(--color-accent)] text-white'
              : 'text-[var(--color-ink-muted)] hover:text-[var(--color-ink)]'
          }`}
        >
          New client
        </button>
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (canReview) setStep('review');
        }}
        className="mt-4 flex flex-col gap-4"
      >
        {mode === 'existing' ? (
          <Field
            label="Find a client"
            hint="By name or reference. Only clients with an admission at this centre — past or present — appear here."
          >
            <input
              type="search"
              className={inputCls}
              value={clientSearch.query}
              onChange={(e) => {
                clientSearch.setQuery(e.target.value);
                setSelectedClient(null);
              }}
              placeholder="Search…"
            />
            {clientSearch.error ? (
              <p className="text-[11px] text-red-600 dark:text-red-400">{clientSearch.error}</p>
            ) : selectedClient ? (
              <div className="flex items-center justify-between rounded-md border border-[var(--color-accent)] bg-[var(--color-accent-soft)] px-2.5 py-1.5 text-[12.5px]">
                <span className="font-medium">
                  {selectedClient.display_name ?? selectedClient.reference}
                </span>
                <button
                  type="button"
                  onClick={() => setSelectedClient(null)}
                  className="text-[11px] text-[var(--color-ink-muted)] underline underline-offset-2"
                >
                  Change
                </button>
              </div>
            ) : clientSearch.results.length > 0 ? (
              <ul className="flex flex-col gap-1 rounded-md border border-[var(--color-line)] p-1">
                {clientSearch.results.map((r) => (
                  <li key={r.client_id}>
                    <button
                      type="button"
                      disabled={r.has_open_admission}
                      onClick={() => setSelectedClient(r)}
                      className="flex w-full items-center justify-between gap-2 rounded-md px-2 py-1.5 text-left text-[12.5px] transition hover:bg-black/5 disabled:cursor-not-allowed disabled:opacity-50 dark:hover:bg-white/10"
                    >
                      <span className="truncate">
                        {r.display_name ?? r.reference}
                        {r.display_name ? (
                          <span className="ml-1.5 text-[11px] text-[var(--color-ink-muted)]">
                            {r.reference}
                          </span>
                        ) : null}
                      </span>
                      {r.has_open_admission ? (
                        <Chip label="Already admitted" tone="warn" />
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            ) : clientSearch.query.trim().length >= 2 && !clientSearch.loading ? (
              <p className="text-[11px] text-[var(--color-ink-muted)]">No clients matched.</p>
            ) : null}
          </Field>
        ) : (
          <>
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
          </>
        )}

        <SectionHeading>Admission &amp; bed</SectionHeading>

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

        <div className="grid grid-cols-3 gap-3">
          <Field label="Treatment group (optional)">
            <input
              className={inputCls}
              value={form.treatmentGroup}
              onChange={(e) => set('treatmentGroup', e.target.value)}
              placeholder="e.g. A"
            />
          </Field>
          <Field label="Primary substance (optional)">
            <input
              type="text"
              className={inputCls}
              value={form.substanceName}
              onChange={(e) => set('substanceName', e.target.value)}
              placeholder="e.g. Alcohol, Cannabis"
            />
          </Field>
          <Field label="Detox ends (optional)">
            <input
              type="date"
              className={inputCls}
              value={form.detoxEndsDate}
              onChange={(e) => set('detoxEndsDate', e.target.value)}
            />
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

        <label className="flex items-center gap-2 text-[13px]">
          <input
            type="checkbox"
            checked={form.highRisk}
            onChange={(e) => set('highRisk', e.target.checked)}
          />
          <span className={form.highRisk ? 'font-semibold text-red-600 dark:text-red-400' : ''}>
            High risk client
          </span>
          {form.highRisk ? (
            <span className="rounded-full bg-red-100 px-2 py-0.5 text-[9.5px] font-bold tracking-wide text-red-700 uppercase dark:bg-red-900/40 dark:text-red-400">
              Profile will be highlighted
            </span>
          ) : null}
        </label>

        <SectionHeading>Care team</SectionHeading>

        <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Field label="Focal therapist (optional)">
            <input
              className={inputCls}
              value={form.focalTherapistLabel}
              onChange={(e) => set('focalTherapistLabel', e.target.value)}
              placeholder="Name"
            />
          </Field>
          <Field label="Buddy (optional)" hint="Centre staff">
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
          <Field label="Peeps (optional)">
            <input
              className={inputCls}
              value={form.peepsLabel}
              onChange={(e) => set('peepsLabel', e.target.value)}
              placeholder="Name"
            />
          </Field>
        </div>

        <SectionHeading>Treatment programme modules</SectionHeading>

        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
          <p className="mb-2.5 text-[11px] text-[var(--color-ink-muted)]">
            Tick each module that applies to this client&apos;s programme. The Treatment Board will
            grey out columns for any unticked module.
          </p>
          <div className="grid grid-cols-2 gap-y-2 gap-x-4 sm:grid-cols-3">
            {(
              [
                { code: 'contact',     label: 'Contact / Comms'        },
                { code: 'survey',      label: '7 Day Satisfaction'      },
                { code: 'familyvisit', label: 'Family Visit'            },
                { code: 'lifestep',    label: 'Life Story & Step Works' },
                { code: 'careplan',    label: 'Care Plan'               },
              ] as const
            ).map(({ code, label }) => (
              <label key={code} className="flex items-center gap-2 text-[13px] cursor-pointer">
                <input
                  type="checkbox"
                  checked={form.programmeModules.includes(code)}
                  onChange={(e) =>
                    set(
                      'programmeModules',
                      e.target.checked
                        ? [...form.programmeModules, code]
                        : form.programmeModules.filter((m) => m !== code),
                    )
                  }
                />
                {label}
              </label>
            ))}
          </div>
        </div>

        <SectionHeading>Additional assignments (optional)</SectionHeading>

        <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
          <p className="mb-2.5 text-[11px] text-[var(--color-ink-muted)]">
            Add any tasks beyond the standard 20 — step work, one-to-one sessions, admin items. They appear in
            the client profile alongside the standard tasks, and roll up in the Treatment Board&apos;s Extra column.
          </p>
          {form.extraAssignments.length > 0 && (
            <div className="mb-2 flex flex-col gap-2">
              {form.extraAssignments.map((ea, i) => (
                <div key={i} className="flex items-center gap-2">
                  <input
                    type="text"
                    placeholder="Assignment name"
                    value={ea.name}
                    onChange={(e) => {
                      const next = [...form.extraAssignments];
                      next[i] = { ...next[i]!, name: e.target.value };
                      set('extraAssignments', next);
                    }}
                    className={`${inputCls} min-w-0 flex-1`}
                  />
                  <div className="flex items-center gap-1 shrink-0">
                    <span className="text-[11px] text-[var(--color-ink-muted)]">Day</span>
                    <input
                      type="number"
                      min={1}
                      max={365}
                      value={ea.dueDay}
                      onChange={(e) => {
                        const next = [...form.extraAssignments];
                        next[i] = { ...next[i]!, dueDay: e.target.value };
                        set('extraAssignments', next);
                      }}
                      className={`${inputCls} w-16 text-center`}
                    />
                  </div>
                  <select
                    value={ea.type}
                    onChange={(e) => {
                      const next = [...form.extraAssignments];
                      next[i] = { ...next[i]!, type: e.target.value as 'milestone' | 'session' | 'admin' };
                      set('extraAssignments', next);
                    }}
                    className={`${inputCls} shrink-0`}
                  >
                    <option value="milestone">Step work</option>
                    <option value="session">Session</option>
                    <option value="admin">Admin</option>
                  </select>
                  <button
                    type="button"
                    onClick={() => set('extraAssignments', form.extraAssignments.filter((_, j) => j !== i))}
                    className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-950/30 dark:hover:text-red-400"
                    aria-label="Remove assignment"
                  >
                    <X className="size-4" />
                  </button>
                </div>
              ))}
            </div>
          )}
          <button
            type="button"
            onClick={() => set('extraAssignments', [...form.extraAssignments, { name: '', dueDay: '1', type: 'milestone' }])}
            className="text-[12px] font-medium text-[var(--color-accent)] hover:underline"
          >
            + Add assignment
          </button>
        </div>

        <SectionHeading>Safeguarding / Risks / Concerns</SectionHeading>

        <Field
          label="Safeguarding, risks or concerns (optional)"
          hint="Recorded in the admission audit trail. Full notes will sit behind sensitivity level 3 once that access model is in place."
        >
          <textarea
            className={`${inputCls} min-h-[72px] resize-y border-amber-400 bg-amber-50 focus:border-amber-600 dark:border-amber-700 dark:bg-amber-950/30`}
            value={form.safeguardingConcerns}
            onChange={(e) => set('safeguardingConcerns', e.target.value)}
            placeholder="e.g. history of self-harm, domestic abuse disclosure, risk of absconding…"
          />
        </Field>

        <SectionHeading>Admission notes</SectionHeading>

        <Field label="Notes (optional)">
          <textarea
            className={`${inputCls} min-h-[64px] resize-y`}
            value={form.reason}
            onChange={(e) => set('reason', e.target.value)}
          />
        </Field>

        <SectionHeading>Client photo (optional)</SectionHeading>

        {photoPreview ? (
          <div className="flex items-center gap-3 rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] p-3">
            <img src={photoPreview} alt="Preview" className="size-14 rounded-full object-cover border border-[var(--color-line)]" />
            <div className="min-w-0 flex-1">
              <p className="truncate text-[12.5px] font-medium">{photoFile?.name}</p>
              <p className="text-[11px] text-[var(--color-ink-muted)]">{formatBytes(photoFile?.size ?? 0)}</p>
            </div>
            <button
              type="button"
              onClick={clearPhoto}
              className="flex size-7 shrink-0 items-center justify-center rounded-full text-[var(--color-ink-muted)] hover:bg-muted/60"
              aria-label="Remove photo"
            >
              <X className="size-4" />
            </button>
          </div>
        ) : (
          <label className="flex cursor-pointer items-center gap-3 rounded-lg border border-dashed border-[var(--color-line)] px-4 py-3 transition hover:border-[var(--color-accent)] hover:bg-[var(--color-accent-soft)]">
            <Camera className="size-5 shrink-0 text-[var(--color-ink-muted)]" />
            <div>
              <p className="text-[12.5px] font-medium text-[var(--color-ink)]">Upload a photo</p>
              <p className="text-[11px] text-[var(--color-ink-muted)]">JPEG, PNG or WebP · max 5MB · resized automatically</p>
            </div>
            <input
              type="file"
              accept="image/jpeg,image/png,image/webp"
              className="sr-only"
              onChange={handlePhotoChange}
            />
          </label>
        )}
        {photoError ? <p className="text-[11px] text-red-600 dark:text-red-400">{photoError}</p> : null}

        <button
          type="submit"
          disabled={!canReview}
          className="mt-1 self-start rounded-lg bg-[var(--color-accent)] px-4 py-2 text-[13px] font-medium text-white disabled:opacity-50"
        >
          Review admission
        </button>
      </form>
      </div>

      {/* A live preview of the form, not a second source of truth — every value here is read straight
          out of `form`/`selectedBed`, so it can never disagree with what Review actually shows next. */}
      <aside className="h-fit rounded-2xl border bg-card p-4 shadow-soft lg:sticky lg:top-4">
        <h3 className="font-display text-[13px] font-semibold">Admission summary</h3>
        <dl className="mt-3 flex flex-col gap-2.5 text-[12.5px]">
          <SummaryRow label="Client" value={clientLabel.trim() || 'Not entered yet'} />
          <SummaryRow
            label="Bed"
            value={selectedBed ? `${selectedBed.bed.label} · Room ${selectedBed.label}` : 'Not selected yet'}
          />
          <SummaryRow label="Admitted" value={`${form.admittedDate} ${form.admittedTime}`} />
          <SummaryRow label="Duration" value={`${form.plannedDuration} ${form.plannedDurationUnit}`} />
          {plannedDischargePreview ? (
            <SummaryRow label="Planned discharge" value={formatDate(plannedDischargePreview)} />
          ) : null}
          {form.treatmentGroup ? <SummaryRow label="Group" value={form.treatmentGroup} /> : null}
          {form.substanceName.trim() ? (
            <SummaryRow label="Substance" value={form.substanceName.trim()} />
          ) : null}
          <SummaryRow label="PEEP required" value={form.peepRequired ? 'Yes' : 'No'} />
          {form.highRisk ? (
            <div className="min-w-0">
              <dt className="text-[10.5px] font-semibold text-red-600 dark:text-red-400">High risk</dt>
              <dd className="mt-0.5 text-[12.5px] font-medium text-red-600 dark:text-red-400">Profile highlighted</dd>
            </div>
          ) : null}
          {form.focalTherapistLabel ? <SummaryRow label="Therapist" value={form.focalTherapistLabel} /> : null}
          {form.buddyLabel ? <SummaryRow label="Buddy" value={form.buddyLabel} /> : null}
          {form.doctorLabel ? <SummaryRow label="Doctor" value={form.doctorLabel} /> : null}
          {form.peepsLabel ? <SummaryRow label="Peeps" value={form.peepsLabel} /> : null}
          {form.detoxEndsDate ? <SummaryRow label="Detox ends" value={form.detoxEndsDate} /> : null}
          <SummaryRow
            label="Programme modules"
            value={
              form.programmeModules.length === 5
                ? 'All modules'
                : form.programmeModules.length === 0
                ? 'None selected'
                : `${form.programmeModules.length} / 5 modules`
            }
          />
          {form.safeguardingConcerns.trim() ? (
            <div className="min-w-0">
              <dt className="text-[10.5px] font-semibold text-amber-700 dark:text-amber-400">Safeguarding / Risks</dt>
              <dd className="mt-0.5 truncate text-[12.5px] font-medium">{form.safeguardingConcerns.trim()}</dd>
            </div>
          ) : null}
        </dl>
      </aside>
      </div>
    </div>
  );
}

function SummaryRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="min-w-0">
      <dt className="text-[10.5px] text-[var(--color-ink-muted)]">{label}</dt>
      <dd className="truncate font-medium">{value}</dd>
    </div>
  );
}
