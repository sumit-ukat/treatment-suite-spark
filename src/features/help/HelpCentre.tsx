import { useMemo, useState, type ReactNode } from 'react';
import {
  BookOpen,
  ChevronDown,
  Info,
  Lightbulb,
  Search,
  TriangleAlert,
  X,
} from 'lucide-react';
import { PageHeader } from '../../components/metric-card.tsx';
import { ARTICLES, CATEGORIES, type CategoryId, type HelpArticle, type HelpBlock } from './help-content.js';

/**
 * The user guide.
 *
 * Built as one searchable page rather than a tree of nested pages, because the question a confused
 * person actually has is "how do I do X" — not "which section of the manual would X live under".
 * Search is therefore the primary control and the categories are a secondary way in, not the other
 * way round. Everything is on one route, so a search never navigates anywhere and the back button
 * never becomes part of using the guide.
 *
 * Matching is deliberately forgiving: each article carries a keyword list of the words people
 * actually type (including the wrong ones — "gray", "can't", "walked out"), every term in the query
 * must appear somewhere in the article, and the whole body is searched rather than just titles. An
 * article that matches opens itself, so a search of one word lands you on the answer rather than on
 * a list of headings you then have to click.
 */

/* ─────────────────────────── search ─────────────────────────── */

/** Flattens an article to one lowercase string once, so filtering never re-walks the blocks. */
function haystack(a: HelpArticle): string {
  const parts: string[] = [a.title, a.summary, ...a.keywords];
  for (const b of a.body) {
    if (b.kind === 'p' || b.kind === 'note' || b.kind === 'warn') parts.push(b.text);
    else if (b.kind === 'steps' || b.kind === 'bullets') parts.push(...b.items);
    else if (b.kind === 'table') {
      parts.push(...b.head);
      for (const row of b.rows) parts.push(...row);
    }
  }
  // Curly apostrophes are what the content uses; nobody types them into a search box.
  return parts.join('   ').toLowerCase().replace(/[’‘]/g, "'");
}

const INDEX: ReadonlyArray<{ article: HelpArticle; text: string }> = ARTICLES.map((article) => ({
  article,
  text: haystack(article),
}));

function normalise(q: string): string {
  return q.toLowerCase().replace(/[’‘]/g, "'").trim();
}

/**
 * Wraps every occurrence of any search term in a <mark>, so a long article shows you why it matched
 * without you having to read it. Terms are escaped — a user typing "()" should get no results, not a
 * regex crash.
 */
function Highlight({ text, terms }: { text: string; terms: readonly string[] }) {
  if (terms.length === 0) return <>{text}</>;
  const escaped = terms.map((t) => t.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).filter(Boolean);
  if (escaped.length === 0) return <>{text}</>;
  const re = new RegExp(`(${escaped.join('|')})`, 'gi');
  const pieces = text.split(re);
  return (
    <>
      {pieces.map((piece, i) =>
        re.test(piece) && i % 2 === 1 ? (
          <mark key={i} className="rounded-[3px] bg-amber-200/70 px-0.5 text-inherit dark:bg-amber-500/30">
            {piece}
          </mark>
        ) : (
          <span key={i}>{piece}</span>
        ),
      )}
    </>
  );
}

/* ─────────────────────────── blocks ─────────────────────────── */

function Block({ block, terms }: { block: HelpBlock; terms: readonly string[] }) {
  switch (block.kind) {
    case 'p':
      return (
        <p className="text-[13px] leading-relaxed text-[var(--color-ink)]">
          <Highlight text={block.text} terms={terms} />
        </p>
      );

    case 'steps':
      return (
        <ol className="flex flex-col gap-2">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
              <span className="tabular mt-px grid size-[20px] shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
                {i + 1}
              </span>
              <span className="min-w-0 flex-1">
                <Highlight text={item} terms={terms} />
              </span>
            </li>
          ))}
        </ol>
      );

    case 'bullets':
      return (
        <ul className="flex flex-col gap-1.5">
          {block.items.map((item, i) => (
            <li key={i} className="flex gap-2.5 text-[13px] leading-relaxed">
              <span aria-hidden className="mt-[7px] size-1.5 shrink-0 rounded-full bg-[var(--color-ink-muted)]" />
              <span className="min-w-0 flex-1">
                <Highlight text={item} terms={terms} />
              </span>
            </li>
          ))}
        </ul>
      );

    case 'note':
      return (
        <Callout tone="note" icon={<Lightbulb className="size-3.5" />}>
          <Highlight text={block.text} terms={terms} />
        </Callout>
      );

    case 'warn':
      return (
        <Callout tone="warn" icon={<TriangleAlert className="size-3.5" />}>
          <Highlight text={block.text} terms={terms} />
        </Callout>
      );

    case 'table':
      return (
        // Wide tables scroll inside their own box rather than pushing the page sideways.
        <div className="overflow-x-auto rounded-lg border border-[var(--color-line)]">
          <table className="w-full min-w-[420px] border-collapse text-left">
            <thead>
              <tr className="bg-[var(--color-surface)]">
                {block.head.map((h, i) => (
                  <th
                    key={i}
                    className="border-b border-[var(--color-line)] px-3 py-2 text-[10.5px] font-semibold tracking-[0.06em] text-muted-foreground uppercase"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {block.rows.map((row, r) => (
                <tr key={r} className="border-b border-[var(--color-line)] last:border-b-0">
                  {row.map((cell, c) => (
                    <td
                      key={c}
                      className={`px-3 py-2 align-top text-[12.5px] leading-snug ${
                        c === 0 ? 'font-medium text-[var(--color-ink)]' : 'text-[var(--color-ink-muted)]'
                      }`}
                    >
                      <Highlight text={cell} terms={terms} />
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      );
  }
}

function Callout({
  tone,
  icon,
  children,
}: {
  tone: 'note' | 'warn';
  icon: ReactNode;
  children: ReactNode;
}) {
  const cls =
    tone === 'warn'
      ? 'border-amber-500/35 bg-amber-500/[0.08] text-amber-900 dark:text-amber-200'
      : 'border-[var(--color-accent)]/30 bg-[var(--color-accent-soft)] text-[var(--color-ink)]';
  return (
    <div className={`flex gap-2.5 rounded-lg border p-3 ${cls}`}>
      <span aria-hidden className="mt-0.5 shrink-0">
        {icon}
      </span>
      <p className="text-[12.5px] leading-relaxed">{children}</p>
    </div>
  );
}

/* ─────────────────────────── article ─────────────────────────── */

function Article({
  article,
  terms,
  open,
  onToggle,
}: {
  article: HelpArticle;
  terms: readonly string[];
  open: boolean;
  onToggle: () => void;
}) {
  const category = CATEGORIES.find((c) => c.id === article.category);
  return (
    <li className="overflow-hidden rounded-xl border border-[var(--color-line)] bg-card">
      <button
        type="button"
        onClick={onToggle}
        aria-expanded={open}
        className="flex w-full items-start gap-3 px-4 py-3.5 text-left transition hover:bg-muted/50 focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-[var(--color-accent)]"
      >
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-[13.5px] font-semibold">
              <Highlight text={article.title} terms={terms} />
            </h3>
            {category ? (
              <span className="shrink-0 rounded bg-muted px-1.5 py-0.5 text-[10px] font-medium tracking-wide text-muted-foreground">
                {category.label}
              </span>
            ) : null}
          </div>
          {!open ? (
            <p className="mt-1 text-[12px] leading-snug text-muted-foreground">
              <Highlight text={article.summary} terms={terms} />
            </p>
          ) : null}
        </div>
        <ChevronDown
          aria-hidden
          className={`mt-0.5 size-4 shrink-0 text-muted-foreground transition-transform ${open ? 'rotate-180' : ''}`}
        />
      </button>
      {open ? (
        <div className="flex flex-col gap-3 border-t border-[var(--color-line)] px-4 py-4">
          {article.body.map((block, i) => (
            <Block key={i} block={block} terms={terms} />
          ))}
          {article.screenshot ? (
            <div className="mt-1 overflow-hidden rounded-lg border border-[var(--color-line)]">
              <img
                src={article.screenshot}
                alt={`Screenshot: ${article.title}`}
                className="block w-full"
              />
            </div>
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

/* ─────────────────────────── page ─────────────────────────── */

const FIRST_DAY_ITEMS: ReadonlyArray<{
  id: string;
  category: CategoryId;
  label: string;
  desc: string;
}> = [
  { id: "finding-your-way",        category: "start",          label: "Find your way around",  desc: "What each menu item is for"              },
  { id: "roomboard-read-card",     category: "roomboard",      label: "Read a bed card",        desc: "Everything on an occupied card"          },
  { id: "roomboard-colours",       category: "roomboard",      label: "What the colours mean",  desc: "Red, amber, green, blue and teal"        },
  { id: "treatmentboard-complete", category: "treatmentboard", label: "Mark a task as done",    desc: "Clicking a square on the Treatment board" },
  { id: "admissions-admit",        category: "admissions",     label: "Admit a new client",     desc: "Step-by-step from clicking Admissions"   },
];

/** The questions people ask in their first week — offered as one-click searches. */
const QUICK_SEARCHES: readonly string[] = [
  "admit a new client",
  "mark a task done",
  "what the colours mean",
  "graduate a client",
  "past date",
  "why can’t I see",
];

export function HelpCentre({ centreName }: { centreName?: string | undefined }) {
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<CategoryId | 'all'>('all');
  const [openIds, setOpenIds] = useState<readonly string[]>([]);
  const [openSections, setOpenSections] = useState<ReadonlySet<CategoryId>>(new Set());

  const terms = useMemo(
    () => normalise(query).split(/\s+/).filter((t) => t.length >= 2),
    [query],
  );

  // Every term must appear somewhere in the article — an "and" search, because "discharge approve"
  // should find the one article about approving a discharge, not every article mentioning either.
  const matches = useMemo(() => {
    const byCategory = INDEX.filter((e) => category === 'all' || e.article.category === category);
    if (terms.length === 0) return byCategory.map((e) => e.article);
    return byCategory.filter((e) => terms.every((t) => e.text.includes(t))).map((e) => e.article);
  }, [terms, category]);

  const toggleSection = (id: CategoryId) =>
    setOpenSections((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next as ReadonlySet<CategoryId>;
    });

  const openArticle = (id: string, cat: CategoryId) => {
    setQuery('');
    setCategory('all');
    setOpenIds([id]);
    setOpenSections(new Set([cat]) as ReadonlySet<CategoryId>);
  };

  const searching = terms.length > 0;
  // A search opens what it found; without one, the reader chooses. Tracking only manual toggles
  // keeps a search from being fought by whatever was left open before it.
  const isOpen = (id: string) => (searching ? true : openIds.includes(id));
  const toggle = (id: string) =>
    setOpenIds((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const grouped = useMemo(() => {
    const out: Array<{ id: CategoryId; label: string; items: HelpArticle[] }> = [];
    for (const c of CATEGORIES) {
      const items = matches.filter((a) => a.category === c.id);
      if (items.length > 0) out.push({ id: c.id, label: c.label, items });
    }
    return out;
  }, [matches]);

  return (
    <div className="space-y-5 px-4 py-5 sm:px-5">
      <PageHeader
        {...(centreName ? { eyebrow: centreName } : {})}
        title="Guide & help"
        description="Search for whatever you are trying to do, or browse the sections below. Written for someone using this tool for the first time."
      />

      {/* ── Your first day — numbered steps that jump straight to the relevant article. ── */}
      <div className="rounded-2xl border bg-card p-4 shadow-soft">
        <p className="mb-3 text-[11px] font-semibold tracking-[0.07em] text-[var(--color-ink-muted)] uppercase">Your first day</p>
        <ol className="flex flex-col gap-2">
          {FIRST_DAY_ITEMS.map((item, i) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => openArticle(item.id, item.category)}
                className="flex w-full items-center gap-3 rounded-lg px-2 py-1.5 text-left transition hover:bg-muted/50"
              >
                <span className="grid size-[22px] shrink-0 place-items-center rounded-full bg-primary-soft text-[11px] font-bold text-primary">
                  {i + 1}
                </span>
                <span className="min-w-0">
                  <span className="block text-[13px] font-medium text-[var(--color-ink)]">{item.label}</span>
                  <span className="block text-[11px] text-[var(--color-ink-muted)]">{item.desc}</span>
                </span>
              </button>
            </li>
          ))}
        </ol>
      </div>

      {/* ── Search — the primary control, so it is the biggest thing on the page. ── */}
      <div className="rounded-2xl border bg-card p-4 shadow-soft">
        <label className="relative block">
          <span className="sr-only">Search the guide</span>
          <Search
            className="pointer-events-none absolute top-1/2 left-3.5 size-4 -translate-y-1/2 text-muted-foreground"
            aria-hidden
          />
          <input
            type="search"
            autoFocus
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — try “admit”, “overdue”, “extend a stay”…"
            className="h-11 w-full rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] pr-10 pl-10 text-[13.5px] transition focus:border-[var(--color-accent)] focus:outline-none"
          />
          {query ? (
            <button
              type="button"
              onClick={() => setQuery('')}
              aria-label="Clear search"
              className="absolute top-1/2 right-3 -translate-y-1/2 rounded p-1 text-muted-foreground transition hover:text-foreground"
            >
              <X className="size-3.5" />
            </button>
          ) : null}
        </label>

        {!searching ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5">
            <span className="mr-0.5 text-[11.5px] text-muted-foreground">Common questions:</span>
            {QUICK_SEARCHES.map((q) => (
              <button
                key={q}
                type="button"
                onClick={() => setQuery(q)}
                className="rounded-full border border-[var(--color-line)] px-2.5 py-1 text-[11.5px] text-[var(--color-ink-muted)] transition hover:border-[var(--color-accent)] hover:text-[var(--color-accent)]"
              >
                {q}
              </button>
            ))}
          </div>
        ) : (
          <p className="tabular mt-3 text-[12px] text-muted-foreground">
            {matches.length === 0
              ? 'No matches'
              : `${matches.length} article${matches.length === 1 ? '' : 's'} match “${query.trim()}”`}
          </p>
        )}
      </div>

      {/* ── Category filter — the secondary way in, for people who would rather browse. ── */}
      <div className="flex flex-wrap gap-1.5">
        <button
          type="button"
          onClick={() => setCategory('all')}
          aria-pressed={category === 'all'}
          className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
            category === 'all'
              ? 'bg-primary text-primary-foreground'
              : 'border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-muted/60'
          }`}
        >
          Everything
        </button>
        {CATEGORIES.map((c) => (
          <button
            key={c.id}
            type="button"
            onClick={() => setCategory(category === c.id ? 'all' : c.id)}
            aria-pressed={category === c.id}
            title={c.blurb}
            className={`rounded-full px-3 py-1.5 text-[12px] font-medium transition ${
              category === c.id
                ? 'bg-primary text-primary-foreground'
                : 'border border-[var(--color-line)] text-[var(--color-ink-muted)] hover:bg-muted/60'
            }`}
          >
            {c.label}
          </button>
        ))}
      </div>

      {matches.length === 0 ? (
        <div className="rounded-2xl border border-dashed border-[var(--color-line)] py-14 text-center">
          <BookOpen className="mx-auto size-6 text-muted-foreground" aria-hidden />
          <p className="mt-3 text-[13px] font-medium">Nothing in the guide matches that</p>
          <p className="mx-auto mt-1 max-w-[380px] text-[12px] text-muted-foreground">
            Try fewer words, or a plainer one — “bed” rather than “bed allocation procedure”. If the
            guide genuinely does not cover it, ask your centre manager.
          </p>
          <button
            type="button"
            onClick={() => {
              setQuery('');
              setCategory('all');
            }}
            className="mt-3 text-[12px] font-medium text-primary transition hover:underline"
          >
            Clear search
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {grouped.map((g) => {
            const sectionOpen = searching || openSections.has(g.id);
            return (
              <section key={g.id}>
                <button
                  type="button"
                  onClick={() => toggleSection(g.id)}
                  className="flex w-full items-center justify-between rounded-lg border border-[var(--color-line)] bg-card px-3 py-2.5 text-left transition hover:bg-muted/40"
                >
                  <h2 className="text-[12px] font-semibold text-[var(--color-ink)]">{g.label}</h2>
                  <div className="flex items-center gap-2 shrink-0">
                    <span className="text-[11px] text-[var(--color-ink-muted)]">{g.items.length} article{g.items.length !== 1 ? 's' : ''}</span>
                    <ChevronDown
                      aria-hidden
                      className={`size-4 text-muted-foreground transition-transform ${sectionOpen ? 'rotate-180' : ''}`}
                    />
                  </div>
                </button>
                {sectionOpen ? (
                  <ul className="mt-2 flex flex-col gap-2">
                    {g.items.map((a) => (
                      <Article
                        key={a.id}
                        article={a}
                        terms={terms}
                        open={isOpen(a.id)}
                        onToggle={() => toggle(a.id)}
                      />
                    ))}
                  </ul>
                ) : null}
              </section>
            );
          })}
        </div>
      )}

      <div className="flex gap-2.5 rounded-xl border border-[var(--color-line)] bg-[var(--color-surface)] p-4">
        <Info className="mt-0.5 size-4 shrink-0 text-muted-foreground" aria-hidden />
        <p className="text-[12px] leading-relaxed text-muted-foreground">
          This guide describes what the tool does today. Some screens still show placeholder figures
          while the underlying data is connected — where that is the case, the screen itself says so
          in an amber box. If something here does not match what you see, trust the screen and tell
          your centre manager.
        </p>
      </div>
    </div>
  );
}
