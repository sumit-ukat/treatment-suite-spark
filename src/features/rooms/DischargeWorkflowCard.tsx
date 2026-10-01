import { useEffect, useState } from 'react';
import { Panel } from '../../components/ui.tsx';
import { discharge as dischargeService, referralPartners as referralPartnersService, type ReferralPartnerRow } from '../../services/data-access.js';
import type { DischargeRequestSummary, Occupant } from './board-data.js';
import { PRIMROSE_LODGE_SETTINGS } from '../../domain/centre-settings.js';
import { fromZonedDateString } from '../../domain/zoned-time.js';
import { useAuth } from '../auth/AuthProvider.tsx';

const TZ = PRIMROSE_LODGE_SETTINGS.timezone;

const DISCHARGE_TYPE_LABEL: Record<DischargeRequestSummary['dischargeType'], string> = {
  early: 'Early discharge',
  transfer: 'Transfer out',
  other: 'Other',
};

// Fixed taxonomy for an early discharge's Reason → Sub Reason, validated again server-side
// (request_early_discharge, migration 0073) — this is display/UX only, not the source of truth.
const EARLY_DISCHARGE_REASONS = ['Self Discharged', 'Medical / Treatment Discharged'] as const;
type EarlyDischargeReason = (typeof EARLY_DISCHARGE_REASONS)[number];
const EARLY_DISCHARGE_SUB_REASONS: Record<EarlyDischargeReason, readonly string[]> = {
  'Self Discharged': [
    'Against Clinical Advice',
    'Personal Reasons',
    'Family Emergency',
    'Lack of Motivation',
    'Cravings / Relapse Intention',
    'Homesickness or isolation',
  ],
  'Medical / Treatment Discharged': [
    'Non-compliance with Treatment',
    'Failed Substance Test',
    'Behavioural Issues - Risk to Others',
    'Psychiatric Needs - Needs a higher level of treatment setting',
    'Psychiatric Needs - High Suicidal Risk',
    'Psychiatric Needs - High-Level Mental Health Diagnosis',
    'Psychiatric Needs - Communication needs',
    'Psychiatric Needs - Other Cognitive Function',
    'Physical Needs - self-care/mobility',
    'Physical Needs - risk of infection',
    'Physical Needs - cardiac risks',
  ],
};

function dischargeTimestamp(dateStr: string): Date {
  const noon = fromZonedDateString(dateStr, TZ, { hour: 12, minute: 0 });
  const now = new Date();
  return noon.getTime() > now.getTime() ? now : noon;
}

function WorkflowStatus({ label, variant }: { label: string; variant: 'pending' | 'approved' | 'neutral' }) {
  const colours =
    variant === 'approved'
      ? 'bg-emerald-50 text-emerald-600 dark:bg-emerald-900/20 dark:text-emerald-400'
      : variant === 'pending'
      ? 'bg-amber-50 text-amber-600 dark:bg-amber-900/20 dark:text-amber-400'
      : 'bg-black/[0.06] text-[var(--color-ink-muted)] dark:bg-white/10';
  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-[10px] font-semibold ${colours}`}>
      {label}
    </span>
  );
}

export function DischargeWorkflowCard({
  occupant: o,
  centreId,
  onChanged,
  startInFormMode = false,
}: {
  occupant: Occupant;
  centreId: string;
  onChanged?: (() => void) | undefined;
  startInFormMode?: boolean;
}) {
  const { can, session } = useAuth();
  const canInitiate = can('discharge.initiate');
  const canApprove = can('discharge.approve');
  const canFinalise = can('discharge.finalise');

  const [partners, setPartners] = useState<ReferralPartnerRow[]>([]);
  const [referralPartnerId, setReferralPartnerId] = useState('');
  const [newPartnerMode, setNewPartnerMode] = useState(false);
  const [newPartnerName, setNewPartnerName] = useState('');
  const [partnerBusy, setPartnerBusy] = useState(false);

  useEffect(() => {
    referralPartnersService.list(centreId).then(setPartners).catch(() => {});
  }, [centreId]);

  async function addPartner() {
    if (!newPartnerName.trim()) return;
    setPartnerBusy(true);
    try {
      const id = await referralPartnersService.create(centreId, newPartnerName.trim());
      const updated = await referralPartnersService.list(centreId);
      setPartners(updated);
      setReferralPartnerId(id);
      setNewPartnerMode(false);
      setNewPartnerName('');
    } catch {
      // Non-critical — the discharge itself can still proceed without a linked partner.
    } finally {
      setPartnerBusy(false);
    }
  }

  const [mode, setMode] = useState<'idle' | 'form' | 'reject'>(startInFormMode ? 'form' : 'idle');
  const [dischargeType, setDischargeType] = useState<DischargeRequestSummary['dischargeType'] | 'planned'>(
    () => (canFinalise ? 'planned' : 'early'),
  );
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [reason, setReason] = useState('');
  // Structured Reason/Sub Reason — used only for 'early'; 'transfer'/'other' still use the free-text
  // `reason` above until a taxonomy exists for them too (migration 0073).
  const [earlyReason, setEarlyReason] = useState<EarlyDischargeReason | ''>('');
  const [earlySubReason, setEarlySubReason] = useState('');
  const [transferDestination, setTransferDestination] = useState('');
  const [transferTreatmentType, setTransferTreatmentType] = useState('');
  const [transferDurationDays, setTransferDurationDays] = useState('');
  // What the centre used to track by hand in its discharge-report spreadsheet — captured here, at the
  // moment of discharge, rather than as a separate follow-up step. reportSentAt defaults to today
  // rather than blank: in practice the report is usually sent the same day it's handed over/finalised.
  const [reportStatus, setReportStatus] = useState('');
  const [location, setLocation] = useState('');
  const [notes, setNotes] = useState('');
  const [reportSentAt, setReportSentAt] = useState(() => new Date().toISOString().slice(0, 10));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  if (!o.admissionId) return null;
  const admissionId = o.admissionId;

  const req = o.dischargeRequest;
  const isOwnRequest = req?.requestedBy != null && req.requestedBy === session?.user.id;

  const workflowStage: 'none' | 'pending' | 'approved' = !req ? 'none' : req.status === 'pending' ? 'pending' : 'approved';

  async function run(action: () => Promise<void>) {
    setBusy(true);
    setError(null);
    try {
      await action();
      setMode('idle');
      setReason('');
      setEarlyReason('');
      setEarlySubReason('');
      setTransferDestination('');
      setTransferTreatmentType('');
      setTransferDurationDays('');
      setReportStatus('');
      setLocation('');
      setNotes('');
      setReferralPartnerId('');
      onChanged?.();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'That did not work.');
    } finally {
      setBusy(false);
    }
  }

  const reportInput = () => ({
    reportStatus: reportStatus.trim() || undefined,
    location: location.trim() || undefined,
    notes: notes.trim() || undefined,
    reportSentAt: reportSentAt || undefined,
    referralPartnerId: referralPartnerId || undefined,
  });

  // Whether the discharge-reason part of the form is actually filled in — differs by type, since
  // 'planned' needs nothing (fixed), 'early' needs both structured dropdowns, and 'transfer'/'other'
  // still use the free-text box.
  const canSubmitNewDischarge =
    dischargeType === 'planned' ? true
    : dischargeType === 'early' ? !!earlyReason && !!earlySubReason
    : !!reason.trim();

  const submitNewDischarge = () => {
    if (!canSubmitNewDischarge) return;
    const at = dischargeTimestamp(date).toISOString();
    if (dischargeType === 'planned') {
      void run(() => dischargeService.finalise(admissionId, 'planned', at, 'Completed Treatment', {
        ...reportInput(),
        dischargeReason: 'Completed Treatment',
      }));
    } else if (dischargeType === 'transfer') {
      void run(async () => {
        await dischargeService.requestTransfer(
          admissionId, reason, transferDestination, transferTreatmentType,
          transferDurationDays ? parseInt(transferDurationDays, 10) : null,
        );
      });
    } else if (dischargeType === 'early') {
      void run(async () => {
        await dischargeService.request(
          admissionId, 'early', `${earlyReason} — ${earlySubReason}`,
          { dischargeReason: earlyReason, dischargeSubReason: earlySubReason },
        );
      });
    } else {
      void run(async () => { await dischargeService.request(admissionId, dischargeType, reason); });
    }
  };

  const finaliseApprovedRequest = () => {
    if (!req) return;
    const at = dischargeTimestamp(date).toISOString();
    void run(() => dischargeService.finalise(admissionId, req.dischargeType, at, reason || null, reportInput()));
  };

  const dateField = (
    <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
      Date
      <input
        type="date"
        value={date}
        onChange={(e) => setDate(e.target.value)}
        className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
      />
    </label>
  );

  // What used to live only in the centre's manual discharge-report spreadsheet — captured here so a
  // discharge is never finalised without them, unlike the sheet, where they were the fields most
  // likely to end up blank because filling them in was a separate, easy-to-forget step.
  const reportFields = (
    <>
      <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
        Reports / transfer
        <input
          type="text"
          list="discharge-report-status-options"
          value={reportStatus}
          onChange={(e) => setReportStatus(e.target.value)}
          placeholder="e.g. Discharge report sent to GP"
          className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
        />
        <datalist id="discharge-report-status-options">
          <option value="Discharge report sent to GP" />
          <option value="Discharge report handed to client" />
          <option value="Handed to client / sent to GP" />
          <option value="Referred to secondary treatment" />
          <option value="Referred to supported housing" />
        </datalist>
      </label>
      <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
        Location (where the client went)
        <input
          type="text"
          value={location}
          onChange={(e) => setLocation(e.target.value)}
          placeholder="e.g. Cranleigh, Transform Housing — Reigate…"
          className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
        />
      </label>
      <div className="block text-[10.5px] text-[var(--color-ink-muted)]">
        Referral partner (optional)
        {!newPartnerMode ? (
          <div className="mt-0.5 flex items-center gap-1.5">
            <select
              value={referralPartnerId}
              onChange={(e) => setReferralPartnerId(e.target.value)}
              className="block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
            >
              <option value="">Not linked to a partner org…</option>
              {partners.map((p) => (
                <option key={p.id} value={p.id}>{p.name}</option>
              ))}
            </select>
            <button type="button" onClick={() => setNewPartnerMode(true)}
              className="shrink-0 rounded-md border border-[var(--color-line)] px-2 py-1.5 text-[11px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10">
              New…
            </button>
          </div>
        ) : (
          <div className="mt-0.5 flex items-center gap-1.5">
            <input
              type="text"
              autoFocus
              value={newPartnerName}
              onChange={(e) => setNewPartnerName(e.target.value)}
              placeholder="e.g. Transform Housing"
              className="block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
            />
            <button type="button" disabled={partnerBusy || !newPartnerName.trim()} onClick={() => void addPartner()}
              className="shrink-0 rounded-md bg-[var(--color-accent)] px-2 py-1.5 text-[11px] font-medium text-white transition disabled:opacity-40">
              {partnerBusy ? '…' : 'Add'}
            </button>
            <button type="button" onClick={() => { setNewPartnerMode(false); setNewPartnerName(''); }}
              className="shrink-0 rounded-md px-2 py-1.5 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
              Cancel
            </button>
          </div>
        )}
      </div>
      <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
        Date report sent
        <input
          type="date"
          value={reportSentAt}
          onChange={(e) => setReportSentAt(e.target.value)}
          className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
        />
      </label>
      <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
        Notes (optional)
        <textarea
          rows={2}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          className="mt-0.5 block w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
        />
      </label>
    </>
  );

  return (
    <Panel title="Discharge workflow" subtitle="Each sign-off is written to the audit trail.">

      {/* ── No discharge in progress ── */}
      {workflowStage === 'none' ? (
        <div>
          {mode === 'idle' ? (
            canInitiate || canFinalise ? (
              <button
                type="button"
                onClick={() => setMode('form')}
                className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10"
              >
                Discharge&hellip;
              </button>
            ) : (
              <p className="text-[11px] text-[var(--color-ink-muted)]">No discharge in progress.</p>
            )
          ) : (
            <div className="flex flex-col gap-3">
              <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                Type
                <select
                  value={dischargeType}
                  onChange={(e) => setDischargeType(e.target.value as typeof dischargeType)}
                  className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                >
                  {canFinalise ? <option value="planned">Planned (on schedule)</option> : null}
                  {canInitiate ? <option value="early">Early discharge</option> : null}
                  {canInitiate ? <option value="transfer">Transfer</option> : null}
                  {canInitiate ? <option value="other">Other</option> : null}
                </select>
              </label>

              {dateField}

              {dischargeType === 'planned' ? (
                // Graduated: exactly one valid reason, so it's shown as a fixed confirmation line
                // rather than a dropdown with a single pointless option.
                <div className="rounded-md border border-[var(--color-line)] bg-[var(--color-surface)] px-2 py-1.5 text-[12px]">
                  <span className="text-[10.5px] text-[var(--color-ink-muted)]">Reason</span>
                  <p className="mt-0.5 font-medium text-[var(--color-ink)]">Completed Treatment</p>
                </div>
              ) : dischargeType === 'early' ? (
                <>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Reason
                    <select
                      autoFocus
                      value={earlyReason}
                      onChange={(e) => { setEarlyReason(e.target.value as EarlyDischargeReason | ''); setEarlySubReason(''); }}
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                    >
                      <option value="">Select a reason…</option>
                      {EARLY_DISCHARGE_REASONS.map((r) => (
                        <option key={r} value={r}>{r}</option>
                      ))}
                    </select>
                  </label>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Sub Reason
                    <select
                      value={earlySubReason}
                      onChange={(e) => setEarlySubReason(e.target.value)}
                      disabled={!earlyReason}
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)] disabled:opacity-50"
                    >
                      <option value="">{earlyReason ? 'Select a sub reason…' : 'Pick a reason first…'}</option>
                      {(earlyReason ? EARLY_DISCHARGE_SUB_REASONS[earlyReason] : []).map((sr) => (
                        <option key={sr} value={sr}>{sr}</option>
                      ))}
                    </select>
                  </label>
                </>
              ) : (
                <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                  Reason
                  <textarea
                    autoFocus
                    rows={2}
                    value={reason}
                    onChange={(e) => setReason(e.target.value)}
                    className="mt-0.5 block w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]"
                  />
                </label>
              )}

              {dischargeType === 'transfer' ? (
                <>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Destination facility
                    <input type="text" value={transferDestination} onChange={(e) => setTransferDestination(e.target.value)}
                      placeholder="e.g. Castle Craig, another UKAT centre…"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
                  </label>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Treatment type at destination
                    <input type="text" value={transferTreatmentType} onChange={(e) => setTransferTreatmentType(e.target.value)}
                      placeholder="e.g. Day programme, outpatient…"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
                  </label>
                  <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                    Duration at destination (days, optional)
                    <input type="number" min={1} value={transferDurationDays} onChange={(e) => setTransferDurationDays(e.target.value)}
                      placeholder="Leave blank if unknown"
                      className="mt-0.5 block w-full rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
                  </label>
                </>
              ) : null}

              {dischargeType !== 'planned' ? (
                <p className="text-[10px] text-[var(--color-ink-muted)]">
                  This needs sign-off from a different person before it can be finalised — the report
                  details below are asked for then, not at this submit-for-approval step.
                </p>
              ) : (
                // Only for 'planned': that's the only case here that finalises immediately. Anything
                // else goes through approval first and asks for these at the finalise step instead —
                // see workflowStage === 'approved' below.
                reportFields
              )}

              <div className="flex items-center gap-2">
                <button type="button" disabled={busy || !canSubmitNewDischarge} onClick={submitNewDischarge}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40">
                  {busy ? 'Saving…' : dischargeType === 'planned' ? 'Discharge' : 'Submit for approval'}
                </button>
                <button type="button" disabled={busy} onClick={() => { setMode('idle'); setReason(''); setEarlyReason(''); setEarlySubReason(''); setError(null); }}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      ) : null}

      {/* ── Pending approval ── */}
      {workflowStage === 'pending' && req ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[11px] text-[var(--color-ink-muted)] flex-1">
              <p className="font-medium text-[var(--color-ink)]">{DISCHARGE_TYPE_LABEL[req.dischargeType]}</p>
              <p className="mt-0.5">{req.reason}</p>
              {req.dischargeType === 'transfer' && req.transferDestination ? (
                <p className="mt-0.5">To: {req.transferDestination}{req.transferTreatmentType ? ` · ${req.transferTreatmentType}` : ''}{req.transferDurationDays ? ` · ${req.transferDurationDays}d` : ''}</p>
              ) : null}
            </div>
            <WorkflowStatus label="Pending approval" variant="pending" />
          </div>

          {mode === 'idle' ? (
            canApprove && !isOwnRequest ? (
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy}
                  onClick={() => void run(() => dischargeService.decide(req.id, true, null))}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40">
                  {busy ? 'Saving…' : 'Approve'}
                </button>
                <button type="button" disabled={busy} onClick={() => setMode('reject')}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                  Reject
                </button>
              </div>
            ) : canApprove && isOwnRequest ? (
              <p className="text-[10px] text-[var(--color-ink-muted)]">You requested this — a different person must approve it.</p>
            ) : (
              <p className="text-[11px] text-[var(--color-ink-muted)]">Centre manager signs it off.</p>
            )
          ) : null}

          {mode === 'reject' ? (
            <div className="flex flex-col gap-1.5">
              <label className="block text-[10.5px] text-[var(--color-ink-muted)]">
                Why is this being rejected?
                <textarea autoFocus rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
                  className="mt-0.5 w-full resize-none rounded-md border border-[var(--color-line)] bg-transparent px-2 py-1.5 text-[12px] outline-none focus:border-[var(--color-accent)]" />
              </label>
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy || !reason.trim()}
                  onClick={() => void run(() => dischargeService.decide(req.id, false, reason))}
                  className="rounded-md bg-red-600 px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40">
                  {busy ? 'Saving…' : 'Reject'}
                </button>
                <button type="button" disabled={busy} onClick={() => { setMode('idle'); setReason(''); }}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}

      {/* ── Approved — ready to finalise ── */}
      {workflowStage === 'approved' && req ? (
        <div className="flex flex-col gap-3">
          <div className="flex items-start justify-between gap-2">
            <div className="rounded-lg border border-[var(--color-line)] bg-[var(--color-surface)] px-3 py-2 text-[11px] text-[var(--color-ink-muted)] flex-1">
              <p className="font-medium text-[var(--color-ink)]">{DISCHARGE_TYPE_LABEL[req.dischargeType]}</p>
              <p className="mt-0.5">{req.approvalNotes || req.reason}</p>
            </div>
            <WorkflowStatus label="Approved" variant="approved" />
          </div>

          {canFinalise && mode === 'idle' ? (
            <div className="flex items-center gap-2">
              <button type="button" onClick={() => setMode('form')}
                className="rounded-md border border-[var(--color-line)] px-2.5 py-1.5 text-[11.5px] font-medium transition hover:bg-black/5 dark:hover:bg-white/10">
                Finalise discharge&hellip;
              </button>
              {canApprove ? (
                <button type="button" disabled={busy}
                  onClick={() => void run(() => dischargeService.undecide(req.id))}
                  title="Undo — back to pending, in case this was approved by mistake"
                  className="rounded-md px-2 py-1.5 text-[11px] font-medium text-[var(--color-ink-muted)] underline decoration-dotted transition hover:text-red-600 disabled:opacity-40 dark:hover:text-red-400">
                  Undo approval
                </button>
              ) : null}
            </div>
          ) : mode === 'form' ? (
            <div className="flex flex-col gap-2">
              {dateField}
              {reportFields}
              <div className="flex items-center gap-2">
                <button type="button" disabled={busy} onClick={finaliseApprovedRequest}
                  className="rounded-md bg-[var(--color-accent)] px-2.5 py-1 text-[11px] font-medium text-white transition disabled:opacity-40">
                  {busy ? 'Saving…' : 'Finalise discharge'}
                </button>
                <button type="button" disabled={busy} onClick={() => setMode('idle')}
                  className="rounded-md px-2 py-1 text-[11px] text-[var(--color-ink-muted)] transition hover:bg-black/5 dark:hover:bg-white/10">
                  Cancel
                </button>
              </div>
            </div>
          ) : !canFinalise ? (
            <p className="text-[11px] text-[var(--color-ink-muted)]">Waiting for someone with finalise permission.</p>
          ) : null}
        </div>
      ) : null}

      {error ? (
        <p role="alert" className="mt-2 text-[11px] text-red-600 dark:text-red-400">{error}</p>
      ) : null}
    </Panel>
  );
}
