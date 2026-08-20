import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { ChevronDown, ChevronRight, History, Plus, Printer, Search, X } from 'lucide-react';
import { ArchivePicker, type DateRange } from './ArchivePicker.tsx';
import type { BoardBed } from './board-data.js';
import { useBoardData } from './use-board-data.js';
import { Chip, StatTile, type Tone } from '../../components/ui.tsx';
import { incidents as incidentsService } from '../../services/data-access.js';
import { PhotoBadge } from './BedCard.tsx';
import { PageHeader } from '../../components/metric-card.tsx';
import { DetailPanel } from './DetailPanel.tsx';

// ─── Column definitions ───────────────────────────────────────────────────────

const COLUMNS = [
  { code: 'family_contact_24h',          label: '24hr',           full: '24-hour family contact',                 group: 'contact'  },
  { code: 'family_contact_week_1',        label: '1st Week',       full: 'Week 1 family contact',                  group: 'contact'  },
  { code: 'family_contact_week_2',        label: '2nd Week',       full: 'Week 2 family contact',                  group: 'contact'  },
  { code: 'family_contact_pre_discharge', label: 'Pre-Discharge',  full: 'Family contact 24 hrs before discharge', group: 'contact'  },
  { code: 'satisfaction_survey_7day', label: '7-Day Survey',   full: '7-day satisfaction survey',  group: 'survey'      },
  { code: 'family_visit',            label: 'Family Visit',   full: 'Family visit',               group: 'familyvisit' },
  { code: 'life_story',        label: 'Life Story/Surrender', full: 'Life story / surrender',          group: 'lifestep' },
  { code: 'step_1',           label: 'Step 1',               full: '12-Step programme — Step 1',      group: 'lifestep' },
  { code: 'step_2',           label: 'Step 2',               full: '12-Step programme — Step 2',      group: 'lifestep' },
  { code: 'step_3',           label: 'Step 3',               full: '12-Step programme — Step 3',      group: 'lifestep' },
  { code: 'side_assignment',  label: 'Side Assignment',      full: 'Side assignment',                 group: 'lifestep' },
  { code: 'ccp',              label: 'CCP',                  full: 'Care & Continuing Plan (CCP)',     group: 'lifestep' },
  { code: 'session_intro',   label: 'Intro CP/121',    full: 'Introductory counselling session',  group: 'careplan' },
  { code: 'session_week_1', label: 'Week 1 CP/121',   full: 'Week 1 CP/121 counselling session', group: 'careplan' },
  { code: 'session_week_2', label: 'Week 2 CP/121',   full: 'Week 2 CP/121 counselling session', group: 'careplan' },
  { code: 'session_week_3', label: 'Week 3 CP/121',   full: 'Week 3 CP/121 counselling session', group: 'careplan' },
  { code: 'session_week_4', label: 'Week 4 CP/121',   full: 'Week 4 CP/121 counselling session', group: 'careplan' },
] as const;

const COL_GROUPS = [
  { label: 'Admin',                   count: 10, cls: 'bg-amber-50  text-amber-800  dark:bg-amber-950/50  dark:text-amber-300',  bCls: 'border-amber-400/60  dark:border-amber-600/40'  },
  { label: 'Contact/Comms',           count: 4,  cls: 'bg-sky-50    text-sky-800    dark:bg-sky-950/50    dark:text-sky-300',    bCls: 'border-sky-400/60    dark:border-sky-600/40'    },
  { label: '7 Day Satisfaction',       count: 1,  cls: 'bg-yellow-50 text-yellow-800 dark:bg-yellow-950/50 dark:text-yellow-300', bCls: 'border-yellow-400/60 dark:border-yellow-600/40' },
  { label: 'Family Visit',            count: 1,  cls: 'bg-teal-50   text-teal-800   dark:bg-teal-950/50   dark:text-teal-300',   bCls: 'border-teal-400/60   dark:border-teal-600/40'   },
  { label: 'Life Story & Step Works', count: 6,  cls: 'bg-violet-50 text-violet-800 dark:bg-violet-950/50 dark:text-violet-300', bCls: 'border-violet-400/60 dark:border-violet-600/40' },
  { label: 'Care Plan',               count: 5,  cls: 'bg-indigo-50 text-indigo-800 dark:bg-indigo-950/50 dark:text-indigo-300', bCls: 'border-indigo-400/60 dark:border-indigo-600/40' },
  { label: 'Doctor – Thursday',       count: 1,  cls: 'bg-rose-50   text-rose-800   dark:bg-rose-950/50   dark:text-rose-300',   bCls: 'border-rose-400/60   dark:border-rose-600/40'   },
] as const;

// ─── Helpers ──────────────────────────────────────────────────────────────────

function fmt(d: Date): string {
  return d.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtStr(s: string): string {
  const [y, m, day] = s.split('-').map(Number);
  return new Date(Date.UTC(y!, m! - 1, day!)).toLocaleDateString('en-GB', {
    day: 'numeric', month: 'short', year: 'numeric',
  });
}

function fmtTime(d: Date): string {
  return d.toLocaleTimeString('en-GB', { hour: '2-digit', minute: '2-digit' });
}

// ─── Task cell ────────────────────────────────────────────────────────────────

// Uses the same icon + tone vocabulary as the attention chips in BedList.
function TaskCell({ bed, code, extraCls }: { bed: BoardBed; code: string; extraCls?: string }) {
  const o = bed.occupant;
  const td = `w-[58px] border-b border-[var(--color-line)] px-1 py-2.5 text-center${extraCls ? ` ${extraCls}` : ''}`;

  if (!o) return <td className={td}><span className="text-[var(--color-ink-muted)]">—</span></td>;

  const task = o.tasks.find((t) => t.code === code);
  if (!task) return <td className={td}><span className="text-[var(--color-ink-muted)]">—</span></td>;

  if (task.isNotApplicable) {
    return (
      <td className={td}>
        <span className="text-[13px] text-[var(--color-ink-muted)]" title={task.notApplicableReason ?? 'Not applicable'}>×</span>
      </td>
    );
  }
  if (task.isComplete) {
    return (
      <td className={td}>
        <span title={task.completedBy ? `Done by ${task.completedBy}` : 'Done'}>
          <Chip icon="✓" label="" tone="good" />
        </span>
      </td>
    );
  }
  if (task.isOverdue) {
    return (
      <td className={td}>
        <span title="Overdue — action needed">
          <Chip icon="▲" label="" tone="alert" />
        </span>
      </td>
    );
  }
  if (task.isDueToday) {
    return (
      <td className={td}>
        <span title="Due today">
          <Chip icon="●" label="" tone="warn" />
        </span>
      </td>
    );
  }
  return (
    <td className={td}>
      <span
        className="text-[15px] leading-none text-[var(--color-ink-muted)]"
        title={task.dueAt ? `Due ${fmt(task.dueAt)}` : 'Not yet due'}
      >
        —
      </span>
    </td>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

type FilterId = 'all' | 'overdue' | 'due_today' | 'available' | 'discharge_soon' | 'no_therapist' | 'open_concerns';

export function TreatmentBoard({
  centreId,
  centreName,
}: {
  centreId: string;
  centreName: string;
}) {
  const navigate = useNavigate();
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
  const [activeFilter, setActiveFilter] = useState<FilterId>('all');
  const [openBedLabel, setOpenBedLabel] = useState<string | null>(null);
  const [incidentCount, setIncidentCount] = useState<number | null>(null);
  const [expandedSection, setExpandedSection] = useState<'admin' | 'contact' | 'lifestep' | 'careplan' | null>(null);
  const expandCol = (s: 'admin' | 'contact' | 'lifestep' | 'careplan') =>
    setExpandedSection((v) => (v === s ? null : s));
  const adminExpanded    = expandedSection === 'admin';
  const contactExpanded  = expandedSection === 'contact';
  const lifeStepExpanded = expandedSection === 'lifestep';
  const carePlanExpanded = expandedSection === 'careplan';

  useEffect(() => {
    incidentsService.count7d(centreId).then(setIncidentCount).catch(() => {});
  }, [centreId]);

  const selected = beds.find((b) => b.label === openBedLabel) ?? null;

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

  // Header cell — matches BedList's header label style
  const th = 'border-b border-[var(--color-line)] bg-card px-3 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap';

  return (
    <div className="space-y-6 px-4 py-5 sm:px-5">

      {/* ── Page header — matches BoardPage's PageHeader ── */}
      <PageHeader
        title={`${centreName} treatment board`}
        description={`Every bed and every clinical task in one view.${loadedAt ? ` Last updated at ${fmtTime(loadedAt)}.` : ''}${refreshing ? ' Updating…' : ''}`}
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
                className="h-9 w-[220px] rounded-lg border border-[var(--color-line)] bg-card pl-9 pr-3 text-[12.5px] transition placeholder:text-[var(--color-ink-muted)] focus:border-[var(--color-accent)] focus:outline-none"
              />
            </label>
            {!asOf ? (
              <button
                type="button"
                onClick={() => navigate('../admissions')}
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-[var(--color-accent)] px-3 text-[12.5px] font-semibold text-white transition hover:opacity-90"
              >
                <Plus className="size-4" /> Admit client
              </button>
            ) : null}
            <button
              type="button"
              title="View board on a past date"
              onClick={() => setShowDatePicker((v) => !v)}
              className={`inline-flex min-h-9 items-center gap-1.5 rounded-lg border px-3 text-[12.5px] font-medium transition ${
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
                className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-[var(--color-line)] bg-card px-3 text-[12.5px] font-medium text-[var(--color-ink)] transition hover:bg-[var(--color-accent-soft)]"
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

      {/* ── Summary tiles — StatTile matches GroupDashboard / BoardPage ── */}
      <div className="flex flex-wrap gap-3 print:hidden">
        <StatTile
          label="Clients"
          value={counts.clients}
          tone="accent"
          active={activeFilter === 'all'}
          onClick={() => setActiveFilter('all')}
        />
        <StatTile
          label="Beds free"
          value={counts.available}
          active={activeFilter === 'available'}
          onClick={() => toggle('available')}
        />
        <StatTile
          label="Overdue tasks"
          value={counts.overdue}
          icon="▲"
          tone="alert"
          active={activeFilter === 'overdue'}
          onClick={() => toggle('overdue')}
        />
        <StatTile
          label="Tasks due today"
          value={counts.dueToday}
          icon="●"
          tone="warn"
          active={activeFilter === 'due_today'}
          onClick={() => toggle('due_today')}
        />
        <StatTile
          label="Discharging this week"
          value={counts.dischargeSoon}
          icon="↗"
          tone="warn"
          active={activeFilter === 'discharge_soon'}
          onClick={() => toggle('discharge_soon')}
        />
        <StatTile
          label="No therapist assigned"
          value={counts.noTherapist}
          active={activeFilter === 'no_therapist'}
          onClick={() => toggle('no_therapist')}
        />
        <StatTile
          label="Open concerns"
          value={counts.openConcerns}
          icon="⚑"
          tone="warn"
          active={activeFilter === 'open_concerns'}
          onClick={() => toggle('open_concerns')}
        />
        {incidentCount !== null && (
          <StatTile
            label="Incident reports (7d)"
            value={incidentCount}
            icon="▲"
            tone={incidentCount > 0 ? 'alert' : 'neutral'}
          />
        )}
      </div>

      {/* ── Table ── */}
      {/* Top scrollbar — mirrors the bottom one so users can scroll without reaching the foot */}
      <div
        ref={topScrollRef}
        className="overflow-x-auto rounded-t-xl"
        style={{ height: 12 }}
        onScroll={(e) => {
          if (tableWrapRef.current) tableWrapRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <div style={{ width: tableScrollWidth, height: 1 }} />
      </div>

      <div
        ref={tableWrapRef}
        className="overflow-x-auto rounded-b-xl border border-[var(--color-line)] bg-card"
        onScroll={(e) => {
          if (topScrollRef.current) topScrollRef.current.scrollLeft = e.currentTarget.scrollLeft;
        }}
      >
        <table className="w-full border-separate border-spacing-0 text-[12.5px]">

          <thead className="sticky top-0 z-20">
            {/* Row 1 — category group spans */}
            <tr>
              <th
                colSpan={3}
                className="border-b border-r border-[var(--color-line)] bg-card px-3 py-2 text-left text-[10.5px] font-semibold tracking-[0.06em] uppercase text-[var(--color-ink-muted)]"
              >
                Client &amp; Placement
              </th>
              {COL_GROUPS.map((g) =>
                g.label === 'Admin' ? (
                  <th
                    key="Admin"
                    colSpan={adminExpanded ? 10 : 1}
                    onClick={() => expandCol('admin')}
                    title={adminExpanded ? 'Click to collapse Admin columns' : 'Click to expand Admin columns'}
                    className="cursor-pointer select-none border-b border-x-2 border-amber-400/60 bg-amber-50 px-2 py-2 text-center text-[10px] font-semibold tracking-[0.06em] uppercase whitespace-nowrap text-amber-800 transition hover:bg-amber-100 dark:border-amber-600/40 dark:bg-amber-950/50 dark:text-amber-300 dark:hover:bg-amber-900/30"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      {adminExpanded
                        ? <ChevronDown className="size-3" />
                        : <ChevronRight className="size-3" />}
                      Admin
                      {!adminExpanded && (
                        <span className="ml-0.5 text-[9px] font-normal opacity-60">+9 cols</span>
                      )}
                    </span>
                  </th>
                ) : g.label === 'Contact/Comms' ? (
                  <th
                    key="Contact/Comms"
                    colSpan={contactExpanded ? 4 : 1}
                    onClick={() => expandCol('contact')}
                    title={contactExpanded ? 'Click to collapse Contact/Comms' : 'Click to expand Contact/Comms'}
                    className="cursor-pointer select-none border-b border-x-2 border-sky-400/60 bg-sky-50 px-2 py-2 text-center text-[10px] font-semibold tracking-[0.06em] uppercase whitespace-nowrap text-sky-800 transition hover:bg-sky-100 dark:border-sky-600/40 dark:bg-sky-950/50 dark:text-sky-300 dark:hover:bg-sky-900/30"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      {contactExpanded
                        ? <ChevronDown className="size-3" />
                        : <ChevronRight className="size-3" />}
                      Contact/Comms
                      {!contactExpanded && (
                        <span className="ml-0.5 text-[9px] font-normal opacity-60">+3 cols</span>
                      )}
                    </span>
                  </th>
                ) : g.label === 'Life Story & Step Works' ? (
                  <th
                    key="Life Story & Step Works"
                    colSpan={lifeStepExpanded ? 6 : 1}
                    onClick={() => expandCol('lifestep')}
                    title={lifeStepExpanded ? 'Click to collapse Life Story & Step Works' : 'Click to expand Life Story & Step Works'}
                    className="cursor-pointer select-none border-b border-x-2 border-violet-400/60 bg-violet-50 px-2 py-2 text-center text-[10px] font-semibold tracking-[0.06em] uppercase text-violet-800 transition hover:bg-violet-100 dark:border-violet-600/40 dark:bg-violet-950/50 dark:text-violet-300 dark:hover:bg-violet-900/30"
                  >
                    <span className="inline-flex flex-col items-center justify-center gap-0.5">
                      <span className="inline-flex items-center gap-1.5">
                        {lifeStepExpanded
                          ? <ChevronDown className="size-3" />
                          : <ChevronRight className="size-3" />}
                        Life Story
                        {!lifeStepExpanded && (
                          <span className="text-[9px] font-normal opacity-60">+5 cols</span>
                        )}
                      </span>
                      <span>&amp; Step Works</span>
                    </span>
                  </th>
                ) : g.label === 'Care Plan' ? (
                  <th
                    key="Care Plan"
                    colSpan={carePlanExpanded ? 5 : 1}
                    onClick={() => expandCol('careplan')}
                    title={carePlanExpanded ? 'Click to collapse Care Plan' : 'Click to expand Care Plan'}
                    className="cursor-pointer select-none border-b border-x-2 border-indigo-400/60 bg-indigo-50 px-2 py-2 text-center text-[10px] font-semibold tracking-[0.06em] uppercase whitespace-nowrap text-indigo-800 transition hover:bg-indigo-100 dark:border-indigo-600/40 dark:bg-indigo-950/50 dark:text-indigo-300 dark:hover:bg-indigo-900/30"
                  >
                    <span className="inline-flex items-center justify-center gap-1.5">
                      {carePlanExpanded
                        ? <ChevronDown className="size-3" />
                        : <ChevronRight className="size-3" />}
                      Care Plan
                      {!carePlanExpanded && (
                        <span className="ml-0.5 text-[9px] font-normal opacity-60">+4 cols</span>
                      )}
                    </span>
                  </th>
                ) : (
                  <th
                    key={g.label}
                    colSpan={g.count}
                    className={`border-b border-x-2 px-2 py-2 text-center text-[10px] font-semibold tracking-[0.06em] uppercase ${g.cls} ${g.bCls}`}
                  >
                    {g.label === '7 Day Satisfaction' ? (
                      <span className="inline-flex flex-col items-center gap-0"><span>7 Day</span><span>Satisfaction</span></span>
                    ) : g.label === 'Doctor – Thursday' ? (
                      <span className="inline-flex flex-col items-center gap-0"><span>Doctor –</span><span>Thursday</span></span>
                    ) : (
                      g.label
                    )}
                  </th>
                )
              )}
            </tr>

            {/* Row 2 — individual column headers */}
            <tr>
              <th className={`sticky left-0 z-30 w-16 ${th}`}>Bed</th>
              {/* Shadow on Client column marks the freeze boundary */}
              <th className={`sticky left-16 z-30 min-w-[168px] border-r border-[var(--color-line)] shadow-[2px_0_6px_rgba(0,0,0,0.06)] ${th}`}>
                Client
              </th>
              <th className={th}>Admitted</th>
              {/* Admin: Focal Therapist — always visible, clicking toggles the section */}
              <th
                onClick={() => expandCol('admin')}
                title={adminExpanded ? 'Collapse Admin' : 'Expand Admin'}
                className={`cursor-pointer select-none border-b border-[var(--color-line)] border-l-2 border-l-amber-400/70 bg-amber-50/70 px-3 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap transition hover:bg-amber-100/60 dark:border-l-amber-500/50 dark:bg-amber-950/25 dark:hover:bg-amber-900/20 ${!adminExpanded ? 'border-r-2 border-r-amber-400/70 dark:border-r-amber-500/50' : ''}`}
              >
                <span className="inline-flex items-center gap-1">
                  {adminExpanded
                    ? <ChevronDown className="size-3 shrink-0 text-amber-500" />
                    : <ChevronRight className="size-3 shrink-0 text-amber-500" />}
                  Focal Therapist
                </span>
              </th>
              {adminExpanded && (
                <>
                  <th className="border-b border-[var(--color-line)] bg-amber-50/70 px-3 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap dark:bg-amber-950/25">Substance</th>
                  <th title="GP summary letter sent to GP" className="w-[58px] border-b border-[var(--color-line)] bg-amber-50/70 px-1 py-2.5 text-center text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] dark:bg-amber-950/25">GP Summary</th>
                  <th className="border-b border-[var(--color-line)] bg-amber-50/70 px-3 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap dark:bg-amber-950/25">Treatment Duration</th>
                  <th className="border-b border-[var(--color-line)] bg-amber-50/70 px-3 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap dark:bg-amber-950/25">Discharge Date</th>
                  <th className="border-b border-[var(--color-line)] bg-amber-50/70 px-3 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap dark:bg-amber-950/25">Detox ends</th>
                  <th className="border-b border-[var(--color-line)] bg-amber-50/70 px-3 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap dark:bg-amber-950/25">Group</th>
                  <th className="border-b border-[var(--color-line)] bg-amber-50/70 px-3 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap dark:bg-amber-950/25">Doctor</th>
                  <th className="border-b border-[var(--color-line)] bg-amber-50/70 px-3 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap dark:bg-amber-950/25">Buddy</th>
                  <th className="border-b border-[var(--color-line)] border-r-2 border-r-amber-400/70 bg-amber-50/70 px-3 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap dark:border-r-amber-500/50 dark:bg-amber-950/25">Peeps</th>
                </>
              )}
              {COLUMNS.map((col) => {
                if (col.group === 'contact') {
                  const isFirst = col.code === 'family_contact_24h';
                  const isLast  = col.code === 'family_contact_pre_discharge';
                  if (!isFirst && !contactExpanded) return null;
                  return (
                    <th
                      key={col.code}
                      title={col.full}
                      onClick={isFirst ? () => expandCol('contact') : undefined}
                      className={[
                        'w-[58px] border-b border-[var(--color-line)] bg-sky-50/70 px-1 py-2.5 text-center text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] dark:bg-sky-950/25',
                        isFirst && 'cursor-pointer select-none border-l-2 border-l-sky-400/70 transition hover:bg-sky-100/60 dark:border-l-sky-500/50',
                        isFirst && !contactExpanded && 'border-r-2 border-r-sky-400/70 dark:border-r-sky-500/50',
                        isLast && contactExpanded && 'border-r-2 border-r-sky-400/70 dark:border-r-sky-500/50',
                      ].filter(Boolean).join(' ')}
                    >
                      {isFirst ? (
                        <span className="inline-flex flex-col items-center gap-0.5">
                          {contactExpanded
                            ? <ChevronDown className="size-2.5 text-sky-500" />
                            : <ChevronRight className="size-2.5 text-sky-500" />}
                          {col.label}
                        </span>
                      ) : col.label}
                    </th>
                  );
                }
                if (col.group === 'lifestep') {
                  const isFirst = col.code === 'life_story';
                  const isLast  = col.code === 'ccp';
                  if (!isFirst && !lifeStepExpanded) return null;
                  return (
                    <th
                      key={col.code}
                      title={col.full}
                      onClick={isFirst ? () => expandCol('lifestep') : undefined}
                      className={[
                        'w-[58px] border-b border-[var(--color-line)] bg-violet-50/70 px-1 py-2.5 text-center text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] dark:bg-violet-950/25',
                        isFirst && 'cursor-pointer select-none border-l-2 border-l-violet-400/70 transition hover:bg-violet-100/60 dark:border-l-violet-500/50',
                        isFirst && !lifeStepExpanded && 'border-r-2 border-r-violet-400/70 dark:border-r-violet-500/50',
                        isLast && lifeStepExpanded && 'border-r-2 border-r-violet-400/70 dark:border-r-violet-500/50',
                      ].filter(Boolean).join(' ')}
                    >
                      {isFirst ? (
                        <span className="inline-flex flex-col items-center gap-0.5">
                          {lifeStepExpanded
                            ? <ChevronDown className="size-2.5 text-violet-500" />
                            : <ChevronRight className="size-2.5 text-violet-500" />}
                          {col.label}
                        </span>
                      ) : col.label}
                    </th>
                  );
                }
                if (col.group === 'careplan') {
                  const isFirst = col.code === 'session_intro';
                  const isLast  = col.code === 'session_week_4';
                  if (!isFirst && !carePlanExpanded) return null;
                  return (
                    <th
                      key={col.code}
                      title={col.full}
                      onClick={isFirst ? () => expandCol('careplan') : undefined}
                      className={[
                        'w-[58px] border-b border-[var(--color-line)] bg-indigo-50/70 px-1 py-2.5 text-center text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] dark:bg-indigo-950/25',
                        isFirst && 'cursor-pointer select-none border-l-2 border-l-indigo-400/70 transition hover:bg-indigo-100/60 dark:border-l-indigo-500/50',
                        isFirst && !carePlanExpanded && 'border-r-2 border-r-indigo-400/70 dark:border-r-indigo-500/50',
                        isLast && carePlanExpanded && 'border-r-2 border-r-indigo-400/70 dark:border-r-indigo-500/50',
                      ].filter(Boolean).join(' ')}
                    >
                      {isFirst ? (
                        <span className="inline-flex flex-col items-center gap-0.5">
                          {carePlanExpanded
                            ? <ChevronDown className="size-2.5 text-indigo-500" />
                            : <ChevronRight className="size-2.5 text-indigo-500" />}
                          {col.label}
                        </span>
                      ) : col.label}
                    </th>
                  );
                }
                if (col.group === 'survey') {
                  return (
                    <th key={col.code} title={col.full}
                      className="w-[58px] border-b border-[var(--color-line)] border-x-2 border-yellow-400/70 bg-yellow-50/70 px-1 py-2.5 text-center text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] dark:border-yellow-600/40 dark:bg-yellow-950/25">
                      {col.label}
                    </th>
                  );
                }
                if (col.group === 'familyvisit') {
                  return (
                    <th key={col.code} title={col.full}
                      className="w-[58px] border-b border-[var(--color-line)] border-x-2 border-teal-400/70 bg-teal-50/70 px-1 py-2.5 text-center text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] dark:border-teal-600/40 dark:bg-teal-950/25">
                      {col.label}
                    </th>
                  );
                }
              })}
              {/* Doctor – Thursday */}
              <th className="border-b border-[var(--color-line)] border-x-2 border-rose-400/70 bg-rose-50/70 px-3 py-2 text-left text-[9px] font-semibold tracking-[0.04em] uppercase leading-tight text-[var(--color-ink-muted)] whitespace-nowrap dark:border-rose-500/50 dark:bg-rose-950/25">
                Reason / Assessment
              </th>
            </tr>
          </thead>

          <tbody>
            {visible.map((bed) => {
              const o = bed.occupant;
              // Shared cell border — horizontal divider only, matching BedList's divide-y
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
                    <td className={`${stickyCell} left-16 min-w-[168px] border-r border-[var(--color-line)] px-3 py-3 italic text-[var(--color-ink-muted)] shadow-[2px_0_6px_rgba(0,0,0,0.04)]`}>
                      Available{bed.shared ? ' — shared room' : ''}
                    </td>
                    <td className={`${cb} px-3 py-3`}>
                      <span className="text-[10.5px] font-semibold uppercase tracking-wide text-[var(--color-ink-muted)]">
                        Available
                      </span>
                    </td>
                    {Array.from({ length: (adminExpanded ? 10 : 1) + (contactExpanded ? 4 : 1) + 2 + (lifeStepExpanded ? 6 : 1) + (carePlanExpanded ? 5 : 1) + 1 }).map((_, i) => (
                      <td key={i} className={`${cb} px-3 py-3 text-[var(--color-ink-muted)]`}>—</td>
                    ))}
                  </tr>
                );
              }

              /* ── Occupied bed ── */
              const pct = Math.min(100, Math.round((o.treatmentDay / o.durationDays) * 100));
              const urgentDischarge = o.daysUntilDischarge <= 2;
              const rowBg = o.overdueCount > 0
                ? 'bg-red-50 dark:bg-red-950/30'
                : o.dueTodayCount > 0
                ? 'bg-amber-50 dark:bg-amber-950/25'
                : o.isExtendedStay
                ? 'bg-teal-50/70 dark:bg-teal-950/20'
                : '';
              const osc = `sticky z-10 ${rowBg || 'bg-card'} ${cb}`;

              return (
                <tr
                  key={bed.label}
                  className={`cursor-pointer transition-colors hover:bg-[var(--color-accent-soft)] ${rowBg}`}
                  onClick={() => setOpenBedLabel(bed.label)}
                >
                  {/* Frozen: Bed */}
                  <td className={`${osc} left-0 w-16 px-3 py-3`}>
                    <span className="nums rounded-md bg-[var(--color-accent-soft)] px-1.5 py-0.5 text-center text-[11px] font-bold text-[var(--color-accent)]">
                      {bed.label}
                    </span>
                  </td>

                  {/* Frozen: Client — shadow marks freeze boundary */}
                  <td
                    className={`${osc} relative left-16 min-w-[168px] px-3 py-3 shadow-[2px_0_6px_rgba(0,0,0,0.05)] ${
                      o.hasRestrictedAlert
                        ? 'border-r-[3px] border-r-red-400 dark:border-r-red-500'
                        : o.hasOpenConcern
                        ? 'border-r-[3px] border-r-amber-400 dark:border-r-amber-500'
                        : o.isExtendedStay
                        ? 'border-r-[3px] border-r-teal-400 dark:border-r-teal-500'
                        : 'border-r border-[var(--color-line)]'
                    }`}
                    title={o.hasRestrictedAlert ? 'High risk — see client profile' : o.hasOpenConcern ? 'Open concern logged — see client profile' : undefined}
                  >
                    {o.hasRestrictedAlert ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-red-50/70 to-transparent dark:from-red-950/25"
                      />
                    ) : o.hasOpenConcern ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-amber-50/70 to-transparent dark:from-amber-950/25"
                      />
                    ) : o.isExtendedStay ? (
                      <span
                        aria-hidden="true"
                        className="pointer-events-none absolute inset-0 bg-gradient-to-r from-teal-50/70 to-transparent dark:from-teal-950/25"
                      />
                    ) : null}
                    <div className="relative flex items-center gap-2">
                      <PhotoBadge occupant={o} size="sm" />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <span className="truncate text-[13px] font-medium text-[var(--color-ink)]">
                            {o.displayName}
                          </span>
                          {o.hasRestrictedAlert && (
                            <Chip icon="⚑" label="Alert" tone="alert" />
                          )}
                        </div>
                        <div className="nums text-[11px] text-[var(--color-ink-muted)]">{o.reference}</div>
                      </div>
                    </div>
                  </td>

                  {/* Admitted */}
                  <td className={`${cb} px-3 py-3 whitespace-nowrap text-[var(--color-ink-muted)]`}>
                    {fmt(o.admittedAt)}
                  </td>

                  {/* Admin: Focal Therapist — always visible */}
                  <td className={`${cb} border-l-2 border-l-amber-300/60 bg-amber-50/30 px-3 py-3 whitespace-nowrap dark:border-l-amber-600/30 dark:bg-amber-950/10 ${!adminExpanded ? 'border-r-2 border-r-amber-300/60 dark:border-r-amber-600/30' : ''}`}>
                    {o.therapist ? (
                      <span className="text-[12.5px]">{o.therapist}</span>
                    ) : (
                      <span className="text-[12.5px] text-amber-600 dark:text-amber-400">Not assigned</span>
                    )}
                  </td>

                  {adminExpanded && (
                    <>
                      {/* Admin: Substance */}
                      <td className={`${cb} bg-amber-50/30 px-3 py-3 text-[var(--color-ink-muted)] dark:bg-amber-950/10`}>—</td>

                      {/* Admin: GP Summary */}
                      <TaskCell bed={bed} code="gp_summary" />

                      {/* Admin: Treatment Duration */}
                      <td className={`${cb} bg-amber-50/30 px-3 py-3 whitespace-nowrap dark:bg-amber-950/10`}>
                        <span className="nums text-[12.5px]">
                          {o.treatmentDay}
                          <span className="text-[var(--color-ink-muted)]"> / {o.durationDays}</span>
                        </span>
                        <div className="mt-1 h-1.5 w-16 overflow-hidden rounded-full bg-black/[0.08] dark:bg-white/12">
                          <div
                            className="h-full rounded-full bg-[var(--color-accent)]"
                            style={{ width: `${pct}%` }}
                          />
                        </div>
                      </td>

                      {/* Admin: Discharge Date */}
                      <td
                        className={`${cb} nums bg-amber-50/30 px-3 py-3 whitespace-nowrap text-[12.5px] dark:bg-amber-950/10 ${
                          urgentDischarge
                            ? 'font-semibold text-red-600 dark:text-red-400'
                            : 'text-[var(--color-ink-muted)]'
                        }`}
                      >
                        {fmtStr(o.plannedDischargeDate)}
                      </td>

                      {/* Admin: Detox ends */}
                      <td className={`${cb} bg-amber-50/30 px-3 py-3 text-[var(--color-ink-muted)] dark:bg-amber-950/10`}>—</td>

                      {/* Admin: Group */}
                      <td className={`${cb} bg-amber-50/30 px-3 py-3 text-center text-[var(--color-ink-muted)] dark:bg-amber-950/10`}>
                        {o.group || '—'}
                      </td>

                      {/* Admin: Doctor */}
                      <td className={`${cb} bg-amber-50/30 px-3 py-3 text-[var(--color-ink-muted)] dark:bg-amber-950/10`}>—</td>

                      {/* Admin: Buddy */}
                      <td className={`${cb} bg-amber-50/30 px-3 py-3 text-[var(--color-ink-muted)] dark:bg-amber-950/10`}>—</td>

                      {/* Admin: Peeps */}
                      <td className={`${cb} border-r-2 border-r-amber-300/60 bg-amber-50/30 px-3 py-3 text-[var(--color-ink-muted)] dark:border-r-amber-600/30 dark:bg-amber-950/10`}>—</td>
                    </>
                  )}

                  {/* Task cells */}
                  {COLUMNS.map((col) => {
                    if (col.group === 'contact'  && col.code !== 'family_contact_24h' && !contactExpanded)  return null;
                    if (col.group === 'lifestep' && col.code !== 'life_story'         && !lifeStepExpanded) return null;
                    if (col.group === 'careplan' && col.code !== 'session_intro'      && !carePlanExpanded) return null;

                    let extraCls = '';
                    if (col.group === 'contact') {
                      const isFirst = col.code === 'family_contact_24h';
                      const isLast  = col.code === 'family_contact_pre_discharge';
                      const needsRight = (isFirst && !contactExpanded) || (isLast && contactExpanded);
                      extraCls = [
                        'bg-sky-50/30 dark:bg-sky-950/10',
                        isFirst    ? 'border-l-2 border-l-sky-300/60 dark:border-l-sky-600/30' : '',
                        needsRight ? 'border-r-2 border-r-sky-300/60 dark:border-r-sky-600/30' : '',
                      ].filter(Boolean).join(' ');
                    } else if (col.group === 'survey') {
                      extraCls = 'border-x-2 border-yellow-300/60 bg-yellow-50/30 dark:border-yellow-600/30 dark:bg-yellow-950/10';
                    } else if (col.group === 'familyvisit') {
                      extraCls = 'border-x-2 border-teal-300/60 bg-teal-50/30 dark:border-teal-600/30 dark:bg-teal-950/10';
                    } else if (col.group === 'lifestep') {
                      const isFirst = col.code === 'life_story';
                      const isLast  = col.code === 'ccp';
                      const needsRight = (isFirst && !lifeStepExpanded) || (isLast && lifeStepExpanded);
                      extraCls = [
                        'bg-violet-50/30 dark:bg-violet-950/10',
                        isFirst    ? 'border-l-2 border-l-violet-300/60 dark:border-l-violet-600/30' : '',
                        needsRight ? 'border-r-2 border-r-violet-300/60 dark:border-r-violet-600/30' : '',
                      ].filter(Boolean).join(' ');
                    } else if (col.group === 'careplan') {
                      const isFirst = col.code === 'session_intro';
                      const isLast  = col.code === 'session_week_4';
                      const needsRight = (isFirst && !carePlanExpanded) || (isLast && carePlanExpanded);
                      extraCls = [
                        'bg-indigo-50/30 dark:bg-indigo-950/10',
                        isFirst    ? 'border-l-2 border-l-indigo-300/60 dark:border-l-indigo-600/30' : '',
                        needsRight ? 'border-r-2 border-r-indigo-300/60 dark:border-r-indigo-600/30' : '',
                      ].filter(Boolean).join(' ');
                    }

                    return <TaskCell key={col.code} bed={bed} code={col.code} {...(extraCls ? { extraCls } : {})} />;
                  })}

                  {/* Doctor – Thursday: assessment reason */}
                  <td className={`${cb} border-x-2 border-rose-300/60 bg-rose-50/30 px-3 py-3 text-[12.5px] text-[var(--color-ink-muted)] dark:border-rose-600/30 dark:bg-rose-950/10`}>
                    —
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* ── Treatment detail panel with prev/next navigation ── */}
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

      {/* ── Legend ── */}
      <div className="rounded-2xl border bg-card p-5 shadow-soft">
        <p className="mb-3 text-[10.5px] font-semibold uppercase tracking-[0.06em] text-[var(--color-ink-muted)]">
          What the icons and colours mean
        </p>
        <div className="flex flex-wrap gap-x-5 gap-y-2.5 text-[12px] text-[var(--color-ink)]">
          {(
            [
              { icon: '✓', tone: 'good'    as Tone, label: 'Done — this task has been completed'              },
              { icon: '▲', tone: 'alert'   as Tone, label: 'Overdue — this task was due and has not been done' },
              { icon: '●', tone: 'warn'    as Tone, label: 'Due today — this task must be done today'          },
              { icon: '—', tone: 'neutral' as Tone, label: 'Still to come — not due yet'                       },
            ] satisfies Array<{ icon: string; tone: Tone; label: string }>
          ).map(({ icon, tone, label }) => (
            <div key={label} className="flex items-center gap-2">
              <Chip icon={icon} label="" tone={tone} />
              {label}
            </div>
          ))}
          <div className="flex items-center gap-2">
            <span className="text-[13px] text-[var(--color-ink-muted)]">×</span>
            Not applicable — this task is not part of this programme
          </div>
          <div className="flex items-center gap-2">
            <span className="size-2 shrink-0 rounded-full bg-red-500" />
            Red dot — safeguarding concern flagged for this client
          </div>
        </div>
      </div>

    </div>
  );
}
