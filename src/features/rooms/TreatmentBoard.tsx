import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, CircleAlert, Clock3, Flag, History, Minus, Plus, Printer, Search, X } from 'lucide-react';
import { ArchivePicker, type DateRange } from './ArchivePicker.tsx';
import type { BoardBed } from './board-data.js';
import { useBoardData } from './use-board-data.js';
import { type Tone } from '../../components/ui.tsx';
import { incidents as incidentsService } from '../../services/data-access.js';
import { PhotoBadge } from './BedCard.tsx';
import { PageHeader } from '../../components/metric-card.tsx';
import { DetailPanel } from './DetailPanel.tsx';
import { CategoryDetailPanel } from './CategoryDetailPanel.tsx';
import { CATEGORY_LABEL, categoryStatus, type CategoryKey } from './category-status.js';

// Soft card radius/shadow used across the reskinned board — kept local to this screen (not the
// shared --radius/--shadow-soft tokens) since the reskin is rolling out here first.
const CARD_RADIUS = 'rounded-[10px]';
const CARD_SHADOW = 'shadow-[0_2px_4px_rgba(32,37,53,0.04),0_1px_2px_rgba(32,37,53,0.03)] dark:shadow-none';

/** Per-category header tint — matches the reference board's own `operationalGroups` tone
 * assignment exactly (admin/careplan=violet, contact/doctor=red, survey/custom=light blue,
 * familyvisit=green, lifestep=amber), remapped onto this app's own token palette. */
const CATEGORY_TINT: Record<CategoryKey, { bg: string; text: string }> = {
  admin: { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  contact: { bg: 'bg-[var(--color-overdue-soft)]', text: 'text-[var(--color-overdue)]' },
  survey: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]' },
  familyvisit: { bg: 'bg-emerald-50 dark:bg-emerald-950/25', text: 'text-emerald-700 dark:text-emerald-400' },
  lifestep: { bg: 'bg-[var(--color-attention-soft)]', text: 'text-[var(--color-attention)]' },
  careplan: { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]' },
  doctor: { bg: 'bg-[var(--color-overdue-soft)]', text: 'text-[var(--color-overdue)]' },
  custom: { bg: 'bg-[var(--color-info-soft)]', text: 'text-[var(--color-info)]' },
};

// ─── Column definitions ───────────────────────────────────────────────────────

/** Left-to-right order of the board's 8 category columns. */
const CATEGORY_ORDER: readonly CategoryKey[] = [
  'admin', 'contact', 'survey', 'familyvisit', 'lifestep', 'careplan', 'doctor', 'custom',
];

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmtStr(s: string): string {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

/** Icon-box tone: background, icon colour and the lucide glyph — mirrors the reference board's
 * state-icon treatment (done/overdue/due/neutral) instead of a pill chip. */
const TONE_ICON: Record<Tone, { bg: string; text: string; Icon: typeof Check }> = {
  good: { bg: 'bg-emerald-50 dark:bg-emerald-950/30', text: 'text-emerald-600 dark:text-emerald-400', Icon: Check },
  alert: { bg: 'bg-[var(--color-overdue-soft)]', text: 'text-[var(--color-overdue)]', Icon: CircleAlert },
  warn: { bg: 'bg-[var(--color-attention-soft)]', text: 'text-[var(--color-attention)]', Icon: Clock3 },
  neutral: { bg: 'bg-black/[0.05] dark:bg-white/[0.08]', text: 'text-[var(--color-ink-muted)]', Icon: Minus },
  accent: { bg: 'bg-[var(--color-accent-soft)]', text: 'text-[var(--color-accent)]', Icon: Minus },
};

/** Cell background tint by tone — reference's care-lane-cell.overdue/.due/.done treatment. */
/** Deliberately faint — a hint, not a wash. Most rows have several non-neutral cells at once, so
 * anything much stronger than this reads as the whole grid changing colour rather than one cell
 * flagging something; the icon + label already carry the actual signal. */
const CELL_TINT: Record<Tone, string> = {
  good: 'bg-emerald-50/40 dark:bg-emerald-950/10',
  alert: 'bg-[var(--color-overdue-soft)]/35',
  warn: 'bg-[var(--color-attention-soft)]/35',
  neutral: '',
  accent: '',
};

const BAR_CLS: Record<Tone, string> = {
  good: 'bg-emerald-500', alert: 'bg-red-500', warn: 'bg-amber-500', neutral: 'bg-black/20 dark:bg-white/25', accent: 'bg-[var(--color-accent)]',
};

/** Reference board's `.board-stat` — a single bordered row of flat, divided stat cells, replacing
 * individually-bordered StatTile cards for this denser reskinned board. */
function BoardStat({ label, value, tone, active, onClick }: {
  label: string; value: number; tone?: Tone | undefined; active?: boolean | undefined; onClick?: (() => void) | undefined;
}) {
  const valueTone =
    tone === 'alert' ? 'text-[var(--color-overdue)]' : tone === 'warn' ? 'text-[var(--color-attention)]' : 'text-[var(--color-ink)]';
  const shared = `min-w-0 border-l border-[var(--color-line)] px-3.5 text-left first:border-l-0 ${
    active ? 'bg-[var(--color-accent-soft)] shadow-[inset_0_-2px_0_var(--color-accent)]' : ''
  }`;
  const inner = (
    <>
      <span className="block min-h-[28px] text-[11px] leading-snug text-[var(--color-ink-muted)]">{label}</span>
      <span className={`nums mt-[5px] block text-[24px] font-semibold ${valueTone}`}>{value}</span>
    </>
  );
  if (!onClick) return <div className={shared}>{inner}</div>;
  return (
    <button type="button" onClick={onClick} className={`${shared} cursor-pointer transition hover:bg-[var(--color-accent-soft)]/40`}>
      {inner}
    </button>
  );
}

function fractionPct(fraction: string): number {
  const [done, total] = fraction.split('/').map(Number);
  if (!total) return 0;
  return Math.min(100, Math.round((done! / total) * 100));
}

// ─── Category cell — rolled-up status, clickable to open its detail panel ─────

function CategoryCell({ bed, category, onOpen }: { bed: BoardBed; category: CategoryKey; onOpen: () => void }) {
  const cellCls = 'w-[126px] overflow-hidden border-b border-r border-[var(--color-line)] px-2.5 py-3 align-top last:border-r-0';

  if (!bed.occupant) {
    return <td className={`${cellCls} bg-card`}><span className="text-[var(--color-ink-muted)]">—</span></td>;
  }

  const status = categoryStatus(bed.occupant, category);
  const { bg, text, Icon } = TONE_ICON[status.tone];
  // bg-card only as a fallback (never alongside a tint class): a cell with nothing to flag must
  // stay opaque so it doesn't transparently pick up whatever colour the row is washed with.
  const bgCls = CELL_TINT[status.tone] || 'bg-card';

  return (
    <td
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onOpen(); } }}
      title={`Open ${CATEGORY_LABEL[category]} details`}
      className={`${cellCls} ${bgCls} cursor-pointer select-none transition hover:shadow-[inset_0_0_0_1px_var(--color-accent-ring)] focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]`}
    >
      <div className="flex min-w-0 items-center gap-1.5">
        <span className={`grid size-5 shrink-0 place-items-center rounded-[5px] ${bg} ${text}`}>
          <Icon className="size-3" />
        </span>
        <span className="truncate text-[10.5px] font-semibold text-[var(--color-ink)]">{status.label}</span>
      </div>
      {status.sublabel ? (
        <div className="mt-1.5 truncate text-[10px] text-[var(--color-ink-muted)]">{status.sublabel}</div>
      ) : null}
      {status.fraction ? (
        <div className="mt-2 flex items-center gap-1.5">
          <div className="h-[3px] w-full max-w-12 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12">
            <div className={`h-full rounded-full ${BAR_CLS[status.tone]}`} style={{ width: `${fractionPct(status.fraction)}%` }} />
          </div>
          <span className="nums shrink-0 text-[9.5px] text-[var(--color-ink-muted)]">{status.fraction}</span>
        </div>
      ) : null}
    </td>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type FilterId = 'all' | 'overdue' | 'due_today' | 'available' | 'discharge_soon' | 'no_therapist' | 'open_concerns';

const TREATMENT_FILTER_IDS: readonly FilterId[] =
  ['all', 'overdue', 'due_today', 'available', 'discharge_soon', 'no_therapist', 'open_concerns'];

export function TreatmentBoard({
  centreId,
  centreName,
}: {
  centreId: string;
  centreName: string;
}) {
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const tableWrapRef = useRef<HTMLDivElement>(null);
  const topScrollRef = useRef<HTMLDivElement>(null);
  const [tableScrollWidth, setTableScrollWidth] = useState(0);

  // Archive / snapshot: null range = live board. asOf uses the end date of the range.
  const [archiveRange, setArchiveRange] = useState<DateRange>({ start: '', end: '' });
  const [showDatePicker, setShowDatePicker] = useState(false);

  const asOf = archiveRange.end
    ? new Date(archiveRange.end + 'T23:59:59')
    : null;

  const { beds, loading, refreshing, error, loadedAt, refresh } = useBoardData(centreId, asOf);
  const [query, setQuery] = useState('');
  // Read once, from whoever linked here with e.g. ?filter=overdue (the Overview page's stat cards) —
  // not kept in sync afterwards, same as Room Board's equivalent filter buttons.
  const [activeFilter, setActiveFilter] = useState<FilterId>(() => {
    const requested = searchParams.get('filter');
    return TREATMENT_FILTER_IDS.includes(requested as FilterId) ? (requested as FilterId) : 'all';
  });
  const [openBedLabel, setOpenBedLabel] = useState<string | null>(null);
  const [openCategory, setOpenCategory] = useState<{ bedLabel: string; category: CategoryKey } | null>(null);
  const [incidentCount, setIncidentCount] = useState<number | null>(null);

  useEffect(() => {
    incidentsService.count7d(centreId).then(setIncidentCount).catch(() => {});
  }, [centreId]);

  const selected = beds.find((b) => b.label === openBedLabel) ?? null;
  const selectedCategoryBed = openCategory ? beds.find((b) => b.label === openCategory.bedLabel) ?? null : null;

  // Keep top scrollbar phantom width in sync with real table scroll width.
  useEffect(() => {
    const el = tableWrapRef.current;
    if (!el) return;
    const update = () => setTableScrollWidth(el.scrollWidth);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, [beds]);

  const counts = useMemo(() => ({
    clients:       beds.filter((b) => b.occupant).length,
    available:     beds.filter((b) => !b.occupant).length,
    overdue:       beds.filter((b) => (b.occupant?.overdueCount ?? 0) > 0).length,
    dueToday:      beds.filter((b) => (b.occupant?.dueTodayCount ?? 0) > 0).length,
    dischargeSoon: beds.filter((b) => b.occupant !== null && b.occupant.daysUntilDischarge <= 7).length,
    noTherapist:   beds.filter((b) => b.occupant !== null && !b.occupant.therapist).length,
    openConcerns:  beds.filter((b) => b.occupant?.hasOpenConcern === true).length,
  }), [beds]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return beds.filter((bed) => {
      if (activeFilter === 'overdue'        && (bed.occupant?.overdueCount ?? 0) === 0) return false;
      if (activeFilter === 'due_today'      && (bed.occupant?.dueTodayCount ?? 0) === 0) return false;
      if (activeFilter === 'available'      && bed.occupant !== null) return false;
      if (activeFilter === 'discharge_soon' && (bed.occupant === null || bed.occupant.daysUntilDischarge > 7)) return false;
      if (activeFilter === 'no_therapist'   && (bed.occupant === null || !!bed.occupant.therapist)) return false;
      if (activeFilter === 'open_concerns'  && !bed.occupant?.hasOpenConcern) return false;
      if (!q) return true;
      const o = bed.occupant;
      return (
        bed.label.toLowerCase().includes(q) ||
        (o?.displayName.toLowerCase().includes(q) ?? false) ||
        (o?.reference.toLowerCase().includes(q) ?? false) ||
        (o?.therapist?.toLowerCase().includes(q) ?? false)
      );
    });
  }, [beds, activeFilter, query]);

  if (loading) {
    return <div className="p-6 text-[13px] text-[var(--color-ink-muted)]">Loading treatment board…</div>;
  }
  if (error) {
    return (
      <div className="m-4 rounded-lg border border-red-300 bg-red-50 p-3 text-[13px] text-red-800 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        Could not load the treatment board: {error}
      </div>
    );
  }

  const toggle = (f: FilterId) => setActiveFilter((prev) => (prev === f ? 'all' : f));

  // Header cell — dense, uppercase, letter-spaced, matching the reference board's matrix-head
  const th = 'border-b border-[var(--color-line)] bg-card px-3 py-2.5 text-left text-[10px] font-semibold tracking-[0.06em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap';

  return (
    <div className="space-y-6 px-4 py-5 sm:px-5">

      {/* ── Page header — matches BoardPage's PageHeader ── */}
      <PageHeader
        title={`${centreName} treatment board`}
        description={`Every bed scanned by care priority.${loadedAt ? ` Last updated at ${fmtTime(loadedAt)}.` : ''}${refreshing ? ' Updating…' : ''}`}
        actions={
          <>
            <label className="relative flex items-center">
              <Search
                className="pointer-events-none absolute left-2.5 size-4 text-[var(--color-ink-muted)]"
                aria-hidden
              />
              <input
                type="search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search client name or bed"
                className="h-9 w-[220px] rounded-[7px] border border-[var(--color-line)] bg-card pl-9 pr-3 text-[12px] transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            {!asOf ? (
              <button
                type="button"
                onClick={() => navigate('../admissions')}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-[7px] bg-[var(--color-accent)] px-3 text-[12px] font-semibold text-white transition hover:opacity-90"
              >
                <Plus className="size-4" /> Admit client
              </button>
            ) : null}
            <button
              type="button"
              title="View board on a past date"
              onClick={() => setShowDatePicker((v) => !v)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-[7px] border px-3 text-[12px] font-medium transition ${
                asOf
                  ? 'border-amber-400 bg-amber-50 text-amber-800 hover:bg-amber-100 dark:border-amber-700 dark:bg-amber-950/30 dark:text-amber-300'
                  : 'border-[var(--color-line)] bg-card text-[var(--color-ink)] hover:bg-[var(--color-accent-soft)]'
              }`}
            >
              <History className="size-3.5" /> {asOf ? 'Archive' : 'Archive'}
            </button>
            {!asOf ? (
              <button
                type="button"
                onClick={() => window.print()}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-[7px] border border-[var(--color-line)] bg-card px-3 text-[12px] font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-accent-soft)]"
              >
                <Printer className="size-3.5" /> Print
              </button>
            ) : null}
          </>
        }
      />

      {/* ── Archive date picker ── */}
      {showDatePicker ? (
        <ArchivePicker
          value={archiveRange}
          onConfirm={(r) => { setArchiveRange(r); setShowDatePicker(false); }}
          onClear={() => { setArchiveRange({ start: '', end: '' }); setShowDatePicker(false); }}
        />
      ) : null}

      {/* ── Archive banner ── */}
      {asOf ? (
        <div className="flex flex-wrap items-center gap-3 rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-[12.5px] text-amber-900 dark:border-amber-700/60 dark:bg-amber-950/20 dark:text-amber-200">
          <History className="size-4 shrink-0" />
          <span>
            <span className="font-semibold">Archive view</span>
            {archiveRange.start && archiveRange.start !== archiveRange.end
              ? <> — period <span className="font-semibold">{new Date(archiveRange.start + 'T12:00:00').toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })} → {asOf.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}</span></>
              : <> — board as it stood on <span className="font-semibold">{asOf.toLocaleDateString('en-GB', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })}</span></>
            }
            . No changes can be made in this view.
          </span>
          <button
            type="button"
            onClick={() => { setArchiveRange({ start: '', end: '' }); setShowDatePicker(false); }}
            className="ml-auto flex items-center gap-1 rounded-lg border border-amber-300 px-2.5 py-1 text-[11.5px] font-medium hover:bg-amber-100 dark:border-amber-700 dark:hover:bg-amber-950/40"
          >
            <X className="size-3.5" /> Back to live
          </button>
        </div>
      ) : null}

      {/* ── Summary tiles — a single divided row, matching the reference board's density ── */}
      <div className={`grid grid-cols-4 border border-[var(--color-line)] bg-card py-[17px] ${CARD_RADIUS} ${CARD_SHADOW} print:hidden lg:grid-cols-8`}>
        <BoardStat
          label="Clients"
          value={counts.clients}
          active={activeFilter === 'all'}
          onClick={() => setActiveFilter('all')}
        />
        <BoardStat
          label="Beds free"
          value={counts.available}
          active={activeFilter === 'available'}
          onClick={() => toggle('available')}
        />
        <BoardStat
          label="Overdue tasks"
          value={counts.overdue}
          tone="alert"
          active={activeFilter === 'overdue'}
          onClick={() => toggle('overdue')}
        />
        <BoardStat
          label="Tasks due today"
          value={counts.dueToday}
          tone="warn"
          active={activeFilter === 'due_today'}
          onClick={() => toggle('due_today')}
        />
        <BoardStat
          label="Discharging this week"
          value={counts.dischargeSoon}
          tone="warn"
          active={activeFilter === 'discharge_soon'}
          onClick={() => toggle('discharge_soon')}
        />
        <BoardStat
          label="No therapist assigned"
          value={counts.noTherapist}
          active={activeFilter === 'no_therapist'}
          onClick={() => toggle('no_therapist')}
        />
        <BoardStat
          label="Open concerns"
          value={counts.openConcerns}
          tone="warn"
          active={activeFilter === 'open_concerns'}
          onClick={() => toggle('open_concerns')}
        />
        {incidentCount !== null && (
          <BoardStat
            label="Incident reports (7d)"
            value={incidentCount}
            tone={incidentCount > 0 ? 'alert' : 'neutral'}
          />
        )}
      </div>

      {/* ── Table ── */}
      {/* Top scrollbar — mirrors the bottom one so users can scroll without reaching the foot */}
      <div
        ref={topScrollRef}
        className="overflow-x-auto rounded-t-[10px]"
        style={{ height: 12 }}
        onScroll={(e) => {
          if (tableWrapRef.current) tableWrapRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <div style={{ width: tableScrollWidth, height: 1 }} />
      </div>

      <div
        ref={tableWrapRef}
        className={`overflow-x-auto rounded-b-[10px] border border-[var(--color-line)] bg-card ${CARD_SHADOW}`}
        onScroll={(e) => {
          if (topScrollRef.current) topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <table className="w-full table-fixed border-separate border-spacing-0 text-[12.5px]">

          <thead className="sticky top-0 z-20">
            <tr>
              <th className={`sticky left-0 z-30 w-16 ${th}`}>Bed</th>
              {/* Shadow on Client column marks the freeze boundary */}
              <th className={`sticky left-16 z-30 w-[240px] border-r border-[var(--color-line)] shadow-[2px_0_6px_rgba(0,0,0,0.06)] ${th}`}>
                Client &amp; Placement
              </th>
              <th className={`w-[120px] border-r border-[var(--color-line)] ${th}`}>Programme</th>
              {CATEGORY_ORDER.map((key) => {
                const tint = CATEGORY_TINT[key];
                return (
                  <th
                    key={key}
                    className={`w-[126px] whitespace-normal border-r border-[var(--color-line)] last:border-r-0 ${tint.bg} ${th}`}
                    style={{ whiteSpace: 'normal' }}
                  >
                    <span className={tint.text}>{CATEGORY_LABEL[key]}</span>
                    <span className="mt-0.5 block text-[9px] font-normal normal-case tracking-normal text-[var(--color-ink-muted)]">
                      Open details
                    </span>
                  </th>
                );
              })}
            </tr>
          </thead>

          <tbody>
            {visible.map((bed) => {
              const o = bed.occupant;
              const cb = 'border-b border-[var(--color-line)]';
              const stickyCell = `sticky z-10 bg-card ${cb}`;

              /* ── Empty bed ── */
              if (!o) {
                return (
                  <tr key={bed.label} className="opacity-60">
                    <td className={`${stickyCell} left-0 w-16 px-3 py-3`}>
                      <span className="nums rounded-md bg-[color:color-mix(in_oklab,var(--brand-blue)_24%,transparent)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--brand-blue-ink)]">
                        {bed.label}
                      </span>
                    </td>
                    <td className={`${stickyCell} left-16 w-[240px] border-r border-[var(--color-line)] px-3 py-3 italic text-[var(--color-ink-muted)] shadow-[2px_0_6px_rgba(0,0,0,0.04)]`}>
                      Available{bed.shared ? ' — shared room' : ''}
                    </td>
                    <td className={`${cb} w-[120px] border-r border-[var(--color-line)] px-3 py-3 text-[var(--color-ink-muted)]`}>—</td>
                    {CATEGORY_ORDER.map((key) => (
                      <td key={key} className={`${cb} w-[126px] border-r border-[var(--color-line)] px-3 py-3 text-[var(--color-ink-muted)] last:border-r-0`}>—</td>
                    ))}
                  </tr>
                );
              }

              /* ── Occupied bed ──
                 No row-level background wash: with several flagged cells often landing in the same
                 row, tinting the whole row on top of that read as the entire row changing colour.
                 The overdue-count badge on the client cell and each cell's own (now much lighter)
                 tint carry the signal instead — see CategoryCell / CELL_TINT above. */
              const pct = Math.min(100, Math.round((o.treatmentDay / o.durationDays) * 100));
              const urgentDischarge = o.daysUntilDischarge <= 2;
              const osc = `sticky z-10 bg-card ${cb}`;

              return (
                <tr key={bed.label}>
                  {/* Frozen: Bed */}
                  <td className={`${osc} left-0 w-16 px-3 py-3`}>
                    <span className="nums rounded-md bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--color-accent)]">
                      {bed.label}
                    </span>
                  </td>

                  {/* Frozen: Client — the only cell that opens the full client file */}
                  <td
                    role="button"
                    tabIndex={0}
                    onClick={() => setOpenBedLabel(bed.label)}
                    onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); setOpenBedLabel(bed.label); } }}
                    title="Open full client file"
                    className={`${osc} relative left-16 w-[240px] cursor-pointer px-3 py-3 shadow-[2px_0_6px_rgba(0,0,0,0.05)] transition hover:bg-[var(--color-accent-soft)]/50 focus-visible:outline focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)] ${
                      o.hasRestrictedAlert
                        ? 'border-r-[3px] border-r-red-400 dark:border-r-red-500'
                        : o.hasOpenConcern
                        ? 'border-r-[3px] border-r-amber-400 dark:border-r-amber-500'
                        : o.isExtendedStay
                        ? 'border-r-[3px] border-r-teal-400 dark:border-r-teal-500'
                        : 'border-r border-[var(--color-line)]'
                    }`}
                  >
                    <div className="relative flex items-center gap-2">
                      <PhotoBadge occupant={o} size="sm" />
                      {/* min-w-0 here (not just on the outer flex-1) is what lets the name below
                          actually truncate instead of being squeezed off by its siblings. */}
                      <div className="min-w-0 flex-1">
                        <div className="flex min-w-0 items-center gap-1">
                          <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-[var(--color-ink)]">
                            {o.displayName}
                          </span>
                          {o.hasRestrictedAlert && (
                            <span
                              title="Restricted alert"
                              className="flex shrink-0 items-center rounded-[4px] bg-red-500/15 p-1 text-red-700 dark:text-red-300"
                            >
                              <Flag className="size-2.5 fill-current" />
                            </span>
                          )}
                        </div>
                        <div className="nums truncate text-[11px] text-[var(--color-ink-muted)]">
                          {o.therapist ?? 'No therapist assigned'}
                        </div>
                      </div>
                      {o.overdueCount > 0 ? (
                        <span
                          title={`${o.overdueCount} overdue task${o.overdueCount === 1 ? '' : 's'}`}
                          className="nums flex shrink-0 items-center gap-1 rounded-[5px] bg-[var(--color-overdue-soft)] px-1.5 py-0.5 text-[10px] font-bold text-[var(--color-overdue)]"
                        >
                          <CircleAlert className="size-3" />
                          {o.overdueCount}
                        </span>
                      ) : null}
                      <ArrowRight className="size-3.5 shrink-0 text-[var(--color-ink-muted)]" />
                    </div>
                  </td>

                  {/* Programme: treatment day + planned discharge */}
                  <td className={`${cb} w-[120px] overflow-hidden border-r border-[var(--color-line)] bg-card px-3 py-3 whitespace-nowrap`}>
                    <div className="nums text-[12.5px] font-medium text-[var(--color-ink)]">
                      Day {o.treatmentDay} <span className="text-[var(--color-ink-muted)]">of {o.durationDays}</span>
                    </div>
                    <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12">
                      <div className="h-full rounded-full bg-[var(--color-accent)]" style={{ width: `${pct}%` }} />
                    </div>
                    <div className={`nums mt-1 text-[10.5px] ${urgentDischarge ? 'font-semibold text-red-600 dark:text-red-400' : 'text-[var(--color-ink-muted)]'}`}>
                      {fmtStr(o.plannedDischargeDate)}
                    </div>
                  </td>

                  {/* 8 category cells */}
                  {CATEGORY_ORDER.map((key) => (
                    <CategoryCell
                      key={key}
                      bed={bed}
                      category={key}
                      onOpen={() => setOpenCategory({ bedLabel: bed.label, category: key })}
                    />
                  ))}
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Full client file, opened from the Client & Placement cell ── */}
      {selected ? (() => {
        const occupiedVisible = visible.filter((b) => b.occupant !== null);
        const idx = occupiedVisible.findIndex((b) => b.label === openBedLabel);
        return (
          <DetailPanel
            key={selected.label}
            bed={selected}
            centreId={centreId}
            onClose={() => setOpenBedLabel(null)}
            onChanged={() => refresh()}
            onPrev={idx > 0 ? () => setOpenBedLabel(occupiedVisible[idx - 1]!.label) : undefined}
            onNext={idx < occupiedVisible.length - 1 ? () => setOpenBedLabel(occupiedVisible[idx + 1]!.label) : undefined}
            readOnly={!!asOf}
          />
        );
      })() : null}

      {/* ── Category-scoped detail, opened from a status cell ── */}
      {openCategory && selectedCategoryBed ? (
        <CategoryDetailPanel
          key={`${openCategory.bedLabel}-${openCategory.category}`}
          bed={selectedCategoryBed}
          category={openCategory.category}
          onClose={() => setOpenCategory(null)}
          onChanged={() => refresh()}
          readOnly={!!asOf}
        />
      ) : null}

      {/* ── Legend ── */}
      <div className={`border border-[var(--color-line)] bg-card p-5 ${CARD_RADIUS} ${CARD_SHADOW}`}>
        <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
          What the icons and colours mean
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2.5 text-[12px] text-[var(--color-ink)]">
          {(
            [
              { tone: 'good'    as Tone, label: 'Done — every task in this category is complete'         },
              { tone: 'alert'   as Tone, label: 'Overdue — one or more tasks were due and are unfinished' },
              { tone: 'warn'    as Tone, label: 'Due — one or more tasks are due today'                   },
              { tone: 'neutral' as Tone, label: 'On track / No actions — assigned but not due, or nothing assigned' },
            ] satisfies Array<{ tone: Tone; label: string }>
          ).map(({ tone, label }) => {
            const { bg, text, Icon } = TONE_ICON[tone];
            return (
              <div key={label} className="flex items-center gap-2">
                <span className={`grid size-5 shrink-0 place-items-center rounded-[5px] ${bg} ${text}`}>
                  <Icon className="size-3" />
                </span>
                {label}
              </div>
            );
          })}
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-red-500" />
            Red dot — safeguarding concern flagged for this client
          </div>
        </div>
        <p className="mt-3 text-[11px] text-[var(--color-ink-muted)]">
          Select a status cell to open its internal details. Client details remain visible while you scroll.
        </p>
      </div>

    </div>
  );
}
