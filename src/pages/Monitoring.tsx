import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUpDown, Building2, Check, ChevronLeft, ChevronRight, CircleAlert, Ellipsis, Info, Search, Square, SquareCheck, SquareMinus, TriangleAlert, X, type LucideIcon } from "lucide-react";
import {
  CATEGORIES,
  CATEGORY_LABEL,
  JURISDICTIONS,
  SEVERITIES,
  SEVERITY_LABEL,
  SEVERITY_RANK,
  RECENT_DAYS,
  STATUS_COPY,
  TODAY,
  addDays,
  iso,
  isRecent,
  jurisdictionByCode,
  worstSeverity,
  type Category,
  type ChangeEvent,
  type Company,
  type Monitor,
  type MonitorStatus,
  type Severity,
} from "../data/model";
import { useStore } from "../state/store";
import { applyFilters, buildRow, filtersFromParams, type Filters, type Row } from "../data/queue";
import { StopDialog } from "../components/StopDialog";
import { CreateMonitorDialog } from "../components/CreateMonitorDialog";
import { Button, ChangeChips, Flag, Menu, SEV_STYLE, Select, cx, formatDate, nf } from "../components/ui";
import { SettingsMenu, SettingsVariantSwitch } from "../components/SettingsPanel";

type Tab = "active" | "feed" | "history";
type Update = (patch: Record<string, string | null>) => void;
const FILTER_KEYS = ["q", "jur", "sev", "cat", "range", "from", "to", "sort", "fsort", "status", "alerts"];
const TABS: Array<[Tab, string, string]> = [
  ["active", "Active monitors", "Active"],
  ["feed", "Change feed", "Feed"],
  ["history", "Order history", "History"],
];

const PAGE = 25;
const SEV_ICON: Record<Severity, LucideIcon> = { high: TriangleAlert, medium: CircleAlert, low: Info };
const asCompany = (m: Monitor): Company => ({ id: m.id, name: m.name, localName: m.localName, regNo: m.regNo, jurisdiction: m.jurisdiction, status: "Registered" });

export function Monitoring() {
  const { monitors, severity } = useStore();
  const [params, setParams] = useSearchParams();
  const tab = (params.get("tab") as Tab) || "active";
  // Filters live in the URL so Back from a company page returns to the same view.
  const update: Update = (patch) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        for (const [k, v] of Object.entries(patch)) {
          if (v === null || v === "" || v === "all") next.delete(k);
          else next.set(k, v);
        }
        if (Object.keys(patch).some((k) => FILTER_KEYS.includes(k) || k === "tab")) next.delete("page");
        return next;
      },
      { replace: true },
    );
  const setTab = (t: Tab) => update({ tab: t === "active" ? null : t });

  const active = useMemo(() => monitors.filter((m) => m.status === "active"), [monitors]);

  const rows = useMemo<Row[]>(
    () =>
      active.map((m) => buildRow(m, severity)),
    [active, severity],
  );

  const triage = useMemo(() => {
    const by: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const r of rows) if (r.recentSev) by[r.recentSev]++;
    return { by };
  }, [rows]);

  const f = filtersFromParams(params);
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex(([t]) => t === tab);
    const to = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(TABS[to][0]);
    document.getElementById(`tab-${TABS[to][0]}`)?.focus();
  };

  // Which way the view moved, so the incoming panel slides in from that side. 0 on first render: no entrance on load.
  const tabIdx = TABS.findIndex(([t]) => t === tab);
  const prevTabIdx = useRef(tabIdx);
  const tabDir = useRef(0);
  if (prevTabIdx.current !== tabIdx) {
    tabDir.current = tabIdx > prevTabIdx.current ? 1 : -1;
    prevTabIdx.current = tabIdx;
  }

  // The underline is measured from the active tab, and re-measured when tab labels change width (fonts, breakpoints).
  const tabList = useRef<HTMLDivElement>(null);
  const [bar, setBar] = useState<{ x: number; w: number } | null>(null);
  const [barMoves, setBarMoves] = useState(false);
  useLayoutEffect(() => {
    const list = tabList.current;
    if (!list) return;
    const measure = () => {
      const el = list.querySelector<HTMLElement>(`#tab-${tab}`);
      if (el) setBar({ x: el.offsetLeft, w: el.offsetWidth });
    };
    measure();
    const ro = new ResizeObserver(measure);
    list.querySelectorAll("[role=tab]").forEach((b) => ro.observe(b));
    return () => ro.disconnect();
  }, [tab]);
  // Only animate once the underline has been placed, so it never sweeps in from the left edge on load.
  useEffect(() => {
    if (!bar || barMoves) return;
    const id = requestAnimationFrame(() => setBarMoves(true));
    return () => cancelAnimationFrame(id);
  }, [bar, barMoves]);

  return (
    <div className="mx-auto max-w-[1360px] px-4 pt-6 pb-16 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.015em]">Overview</h1>
          <p className="mt-1 text-[14px] text-content-main">Registry changes across the companies you monitor. Checks run automatically.</p>
        </div>
        <SettingsMenu />
      </header>
      <SettingsVariantSwitch />

      {/* Portfolio summary. The per-day heatmap lives on each company page; across hundreds of monitors it only adds noise. */}
      <section aria-label="Portfolio summary" className="@container mt-6">
        <div role="group" aria-label={`Filter active monitors. Severity counts are companies by their most severe change in the last ${RECENT_DAYS} days.`} className="grid grid-cols-2 gap-3 @4xl:grid-cols-4 @4xl:gap-4">
          <StatCard
            value={active.length}
            label="Total monitored"
            icon={Building2}
            onClick={() => update({ tab: null, sev: null })}
          />
          {(["high", "medium", "low"] as Severity[]).map((s) => {
            const pressed = tab === "active" && f.sev === s;
            return (
              <StatCard
                key={s}
                value={triage.by[s]}
                label={`${SEVERITY_LABEL[s]} severity`}
                icon={SEV_ICON[s]}
                severity={s}
                pressed={pressed}
                onClick={() => (pressed ? update({ sev: null }) : update({ tab: null, sev: s }))}
              />
            );
          })}
        </div>
        <p className="mt-2 text-[12px] text-content-tertiary">Severity counts are companies, by their most severe change in the last {RECENT_DAYS} days. Select a card to filter the table.</p>
      </section>

      <div className="mt-8 border-b border-border-subtle">
      <div ref={tabList} role="tablist" aria-label="Monitoring views" onKeyDown={onTabKey} className="relative -mb-px flex gap-1 overflow-x-auto overflow-y-hidden">
        {TABS.map(([t, label, short]) => {
          const n = t === "active" ? active.length : t === "history" ? monitors.length : null;
          return (
            <button
              key={t}
              id={`tab-${t}`}
              role="tab"
              aria-selected={tab === t}
              aria-controls={`panel-${t}`}
              tabIndex={tab === t ? 0 : -1}
              onClick={() => setTab(t)}
              className={cx(
                "flex h-11 shrink-0 items-center gap-2 px-3 text-[14px] transition-colors duration-150",
                tab === t ? "font-semibold text-content-primary" : "text-content-main hover:text-content-primary",
              )}
            >
              <span className="max-sm:hidden">{label}</span>
              <span className="sm:hidden">{short}</span>
              {n !== null && <span className={cx("rounded-full px-1.5 text-[11px] tnum", tab === t ? "bg-interactive-accent text-interactive-control" : "bg-background-subtle text-content-tertiary")}>{nf.format(n)}</span>}
            </button>
          );
        })}
        {/* One underline travels between tabs, so the eye follows the move instead of hunting for the new active tab. */}
        {bar && (
          <span
            aria-hidden
            className={cx(
              "pointer-events-none absolute bottom-0 left-0 h-[2px] w-[100px] origin-left bg-interactive-primary",
              barMoves && "transition-transform duration-300 ease-out-expo motion-reduce:transition-none",
            )}
            style={{ transform: `translateX(${bar.x}px) scaleX(${bar.w / 100})` }}
          />
        )}
      </div>
      </div>

      {/* The panel arrives from the side of the tab you moved toward; `clip` keeps the slide from flashing a scrollbar. */}
      <div className="[overflow-x:clip]">
      <div
        key={tab}
        role="tabpanel"
        id={`panel-${tab}`}
        aria-labelledby={`tab-${tab}`}
        data-dir={tabDir.current}
        className={cx(tabDir.current !== 0 && "tab-panel-in")}
      >
        {tab === "active" && <ActiveTable rows={rows} f={f} update={update} page={Number(params.get("page") ?? 0)} />}
        {tab === "feed" && (
          <ChangeFeed rows={rows} params={params} update={update} />
        )}
        {tab === "history" && <OrderHistory status={params.get("status") ?? "all"} setStatus={(v) => update({ status: v })} />}
      </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- Active monitors */

function FilterBar({
  q,
  setQ,
  jur,
  setJur,
  sev,
  setSev,
  cat,
  setCat,
  children,
}: {
  q?: string;
  setQ?: (v: string) => void;
  jur: string;
  setJur: (v: string) => void;
  sev?: "all" | Severity;
  setSev?: (v: "all" | Severity) => void;
  cat?: string;
  setCat?: (v: string) => void;
  children?: React.ReactNode;
}) {
  return (
    <div className="flex flex-wrap items-end gap-3 py-4">
      {setQ && (
        <label className="flex min-w-[220px] flex-1 flex-col gap-1 sm:max-w-[320px]">
          <span className="text-[12px] font-medium text-content-main">Search company</span>
          <span className="relative">
            <Search className="pointer-events-none absolute top-1/2 left-2.5 size-4 -translate-y-1/2 text-content-tertiary" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Company name or registration no."
              className="h-9 w-full rounded-[4px] border border-interactive-secondary bg-white pr-3 pl-8 text-[13px] placeholder:text-content-tertiary focus:border-interactive-primary max-sm:h-11 max-sm:text-[16px]"
            />
          </span>
        </label>
      )}
      <Select
        label="Jurisdiction"
        value={jur}
        onChange={setJur}
        className="w-[160px]"
        options={[{ value: "all", label: "All jurisdictions" }, ...JURISDICTIONS.map((j) => ({ value: j.code, label: j.name }))]}
      />
      {setSev && (
        <Select
          label="Severity"
          value={sev!}
          onChange={(v) => setSev(v as "all" | Severity)}
          className="w-[140px]"
          options={[{ value: "all", label: "All severities" }, ...SEVERITIES.slice().reverse().map((s) => ({ value: s, label: SEVERITY_LABEL[s] }))]}
        />
      )}
      {setCat && (
        <Select
          label="Change category"
          value={cat!}
          onChange={setCat}
          className="w-[170px]"
          options={[{ value: "all", label: "All categories" }, ...CATEGORIES.map((c) => ({ value: c, label: CATEGORY_LABEL[c] }))]}
        />
      )}
      {children}
    </div>
  );
}

function Pager({ page, setPage, total }: { page: number; setPage: (n: number) => void; total: number }) {
  const pages = Math.max(1, Math.ceil(total / PAGE));
  return (
    <div className="flex items-center justify-end gap-3 px-4 py-3 text-[13px] text-content-main">
      <span className="tnum">
        {total === 0 ? 0 : nf.format(page * PAGE + 1)}–{nf.format(Math.min(total, (page + 1) * PAGE))} of {nf.format(total)}
      </span>
      <div className="flex gap-1">
        <button aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)} className="grid size-8 place-items-center rounded-[4px] border border-border-subtle hover:bg-background-subtle disabled:opacity-40">
          <ChevronLeft className="size-4" />
        </button>
        <button aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="grid size-8 place-items-center rounded-[4px] border border-border-subtle hover:bg-background-subtle disabled:opacity-40">
          <ChevronRight className="size-4" />
        </button>
      </div>
    </div>
  );
}

function ActiveTable({ rows, f: params, update, page }: { rows: Row[]; f: Filters; update: Update; page: number }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stopping, setStopping] = useState<Array<{ id: string; name: string }>>([]);
  // The overview only filters by search, jurisdiction and the severity cards. Category and the 30-day window live on the
  // Change feed, so they're ignored here; a severity card always means "most severe change in the last 30 days".
  const f: Filters = { ...params, cat: "all", recent: params.sev !== "all" };
  const { q, jur, sev, cat, recent: onlyRecent, sort } = f;
  const { severity } = useStore();
  const setPage = (n: number) => update({ page: n ? String(n) : null });
  const setSort = (v: "severity" | "date") => update({ sort: v === "severity" ? null : v });

  const filtered = useMemo(() => applyFilters(rows, f), [rows, q, jur, sev, cat, onlyRecent, sort]);
  const open = (id: string) => navigate(`/reports/${id}?tab=pkyb`, { state: { from: "monitoring" } });
  const pageRows = filtered.slice(page * PAGE, (page + 1) * PAGE);
  const selectedMix = useMemo(() => {
    const mix: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const r of rows) if (selected.has(r.m.id)) for (const e of r.m.events) if (isRecent(e)) mix[worstSeverity(e.categories, severity)]++;
    return mix;
  }, [rows, selected, severity]);
  const allOnPage = pageRows.length > 0 && pageRows.every((r) => selected.has(r.m.id));
  const someOnPage = pageRows.some((r) => selected.has(r.m.id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const filtersOn = q || jur !== "all" || sev !== "all";

  return (
    <>
      {/* Severity is filtered by the summary cards above, so the bar carries no second severity control. */}
      <FilterBar q={q} setQ={(v) => update({ q: v })} jur={jur} setJur={(v) => update({ jur: v })}>
        {filtersOn && (
          <button
            onClick={() => update({ q: null, jur: null, sev: null })}
            className="inline-flex h-9 items-center gap-1 px-1 text-[13px] font-semibold text-content-link hover:underline max-sm:h-11"
          >
            <X className="size-3.5" /> Clear filters
          </button>
        )}
      </FilterBar>

      <div className="rounded-[6px] border border-border-subtle bg-white">
        {selected.size > 0 && (
          <div className="sticky top-[76px] z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-[5px] border-b border-border-subtle bg-background-system px-4 py-2 text-[13px] text-white">
            <span className="font-semibold tnum">{nf.format(selected.size)} selected</span>
            {selectedMix.high > 0 && (
              <span className="inline-flex items-center gap-1.5 text-high-on-dark">
                <span className="size-1.5 rounded-full bg-high-cell" /> includes {nf.format(selectedMix.high)} High
              </span>
            )}
            {allOnPage && selected.size < filtered.length && (
              <button onClick={() => setSelected(new Set(filtered.map((r) => r.m.id)))} className="rounded-[4px] px-2 py-1 font-semibold text-chrome-accent hover:bg-chrome-control-hover">
                Select all {nf.format(filtered.length)} matching
              </button>
            )}
            <span className="ml-auto flex items-center gap-1">
              <button onClick={() => setSelected(new Set())} className="inline-flex h-8 items-center rounded-[4px] px-2 font-semibold text-chrome-content-main hover:bg-chrome-control-hover hover:text-white max-sm:h-10">
                Clear selection
              </button>
              {/* Stopping is the only bulk action, so it sits on the bar rather than behind a one-item menu. It still confirms first. */}
              <button
                onClick={() => setStopping(rows.filter((r) => selected.has(r.m.id)).map((r) => ({ id: r.m.id, name: r.m.name })))}
                className="inline-flex h-8 items-center rounded-[4px] bg-white px-3 font-semibold text-content-primary hover:bg-interactive-accent max-sm:h-10"
              >
                Stop monitoring {nf.format(selected.size)}…
              </button>
            </span>
          </div>
        )}
        <ul className="divide-y divide-border-subtle md:hidden">
          {pageRows.map((r) => {
            const j = jurisdictionByCode[r.m.jurisdiction];
            const isSel = selected.has(r.m.id);
            return (
              <li key={r.m.id} className={cx("flex gap-3 px-4 py-3.5", isSel && "bg-interactive-accent/70")}>
                <button role="checkbox" aria-checked={isSel} aria-label={`Select ${r.m.name}`} onClick={() => toggle(r.m.id)} className="-mx-3 -my-2.5 grid size-11 shrink-0 place-items-center text-content-tertiary">
                  {isSel ? <SquareCheck className="size-4 text-interactive-primary" aria-hidden /> : <Square className="size-4" aria-hidden />}
                </button>
                <Link to={`/reports/${r.m.id}?tab=pkyb`} state={{ from: "monitoring" }} className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cx("truncate text-[14px] text-content-primary", r.recent > 0 ? "font-semibold" : "font-medium")}>{r.m.name}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-content-tertiary">
                    <Flag code={j.code} /> {j.name}
                    {r.latest && <> · <span className="tnum">Detected {formatDate(r.latest.date)}</span></>}
                  </span>
                  {r.latest && r.latestSev ? (
                    <span className="mt-2 block">
                      <ChangeChips categories={r.latest.categories} />
                    </span>
                  ) : (
                    <span className="mt-2 block text-[12px] text-content-tertiary">No changes since baseline</span>
                  )}
                </Link>
                <Menu
                  label={`More actions for ${r.m.name}`}
                  trigger={<Ellipsis className="size-4" />}
                  items={[{ label: "Stop monitoring", danger: true, onSelect: () => setStopping([{ id: r.m.id, name: r.m.name }]) }]}
                />
              </li>
            );
          })}
          {pageRows.length === 0 && (
            <li className="px-4 py-12 text-center">
              <p className="text-[14px] font-semibold">No monitors match these filters</p>
              <p className="mt-1 text-[13px] text-content-main">Clear filters to see all {nf.format(rows.length)} active monitors.</p>
            </li>
          )}
        </ul>
        <div className="overflow-x-auto max-md:hidden">
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead className="border-b border-border-subtle text-[12px] text-content-main">
              <tr>
                <th className="w-10 py-1.5 pl-3">
                  <button
                    role="checkbox"
                    aria-checked={allOnPage ? true : someOnPage ? "mixed" : false}
                    aria-label="Select all companies on this page"
                    onClick={() =>
                      setSelected((s) => {
                        const n = new Set(s);
                        pageRows.forEach((r) => (allOnPage ? n.delete(r.m.id) : n.add(r.m.id)));
                        return n;
                      })
                    }
                    className="grid size-6 place-items-center text-content-tertiary hover:text-content-primary"
                  >
                    {allOnPage ? <SquareCheck className="size-4 text-interactive-primary" aria-hidden /> : someOnPage ? <SquareMinus className="size-4 text-interactive-primary" aria-hidden /> : <Square className="size-4" aria-hidden />}
                  </button>
                </th>
                <th className="px-3 py-2.5 font-semibold">Company</th>
                <th className="px-3 py-2.5 font-semibold">Jurisdiction</th>
                <SortTh label="Change by severity" active={sort === "severity"} title="Sort by severity, most severe first" onClick={() => setSort("severity")} />
                <SortTh label="Detected" active={sort === "date"} title="Sort by date detected, newest first" onClick={() => setSort("date")} />
                <th className="w-[112px] py-2.5 pr-4" />
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {pageRows.map((r) => {
                const j = jurisdictionByCode[r.m.jurisdiction];
                const isSel = selected.has(r.m.id);
                return (
                  <tr
                    key={r.m.id}
                    onClick={() => open(r.m.id)}
                    className={cx("cursor-pointer align-top transition-colors", isSel ? "bg-interactive-accent/70" : "hover:bg-base-contrast")}
                  >
                    <td className="py-3 pl-3" onClick={(e) => e.stopPropagation()}>
                      <button role="checkbox" aria-checked={isSel} aria-label={`Select ${r.m.name}`} onClick={() => toggle(r.m.id)} className="grid size-6 place-items-center text-content-tertiary hover:text-content-primary">
                        {isSel ? <SquareCheck className="size-4 text-interactive-primary" aria-hidden /> : <Square className="size-4" aria-hidden />}
                      </button>
                    </td>
                    <td className="max-w-[300px] px-3 py-3">
                      <span className="flex items-center gap-2">
                        <span className={cx("truncate text-[14px] text-content-primary", r.recent > 0 ? "font-semibold" : "font-medium")}>{r.m.name}</span>
                      </span>
                      <span className="block text-[12px] text-content-tertiary tnum">{r.m.regNo}</span>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className="flex items-center gap-2 text-content-main">
                        <Flag code={j.code} /> {j.name}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      {r.latest && r.latestSev ? (
                        <ChangeChips categories={r.latest.categories} />
                      ) : (
                        <span className="text-content-tertiary">No changes since baseline</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-content-main tnum">{r.latest ? formatDate(r.latest.date) : "—"}</td>
                    <td className="py-2.5 pr-3" onClick={(e) => e.stopPropagation()}>
                      <span className="flex items-center justify-end gap-1">
                        <Link to={`/reports/${r.m.id}?tab=pkyb`} state={{ from: "monitoring" }} className="inline-flex h-8 items-center px-2 text-[13px] font-semibold text-content-link hover:underline">
                          View
                        </Link>
                        <Menu
                          label={`More actions for ${r.m.name}`}
                          trigger={<Ellipsis className="size-4" />}
                          items={[{ label: "Stop monitoring", danger: true, onSelect: () => setStopping([{ id: r.m.id, name: r.m.name }]) }]}
                        />
                      </span>
                    </td>
                  </tr>
                );
              })}
              {pageRows.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-4 py-14 text-center">
                    <p className="text-[14px] font-semibold">No monitors match these filters</p>
                    <p className="mt-1 text-[13px] text-content-main">Try another jurisdiction or severity, or clear filters to see all {nf.format(rows.length)} active monitors.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border-subtle">
          <Pager page={page} setPage={setPage} total={filtered.length} />
        </div>
      </div>
      <StopDialog targets={stopping} onClose={() => setStopping([])} onDone={() => setSelected(new Set())} />
    </>
  );
}

/* ---------------------------------------------------------------- Change feed */

type DateRange = "all" | "7" | "30" | "90" | "custom";
const DATE_RANGES: Array<{ value: DateRange; label: string }> = [
  { value: "all", label: "All dates" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
];

function SortTh({ label, active, title, onClick }: { label: string; active: boolean; title: string; onClick: () => void }) {
  return (
    <th className="px-3 py-1.5 font-semibold" aria-sort={active ? "descending" : "none"}>
      <button onClick={onClick} title={title} className={cx("inline-flex h-6 items-center gap-1", active && "text-content-primary")}>
        {label} {active ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUpDown className="size-3.5 text-content-tertiary" aria-hidden />}
      </button>
    </th>
  );
}

function ChangeFeed({ rows, params, update }: { rows: Row[]; params: URLSearchParams; update: Update }) {
  const { severity, prefs } = useStore();
  const navigate = useNavigate();
  const { q, jur, sev, cat } = filtersFromParams(params);
  const range = (params.get("range") as DateRange | null) ?? "all";
  const from = params.get("from") ?? "";
  const to = params.get("to") ?? "";
  const sort = params.get("fsort") === "severity" ? "severity" : "date";
  /** Only recent changes at the severities the analyst gets in-app alerts for: exactly what the bell counts. */
  const alertsOnly = params.get("alerts") === "1";
  const page = Number(params.get("page") ?? 0);
  const setPage = (n: number) => update({ page: n ? String(n) : null });

  const events = useMemo(() => {
    const needle = q.trim().toLowerCase();
    const since = range === "all" || range === "custom" ? "" : iso(addDays(TODAY, -Number(range)));
    const lo = range === "custom" ? from : since;
    const hi = range === "custom" ? to : "";
    const out: Array<{ e: ChangeEvent; m: Monitor; s: Severity }> = [];
    for (const r of rows) {
      const m = r.m;
      if (needle && !(m.name.toLowerCase().includes(needle) || m.regNo.toLowerCase().includes(needle) || (m.localName ?? "").includes(needle))) continue;
      if (jur !== "all" && m.jurisdiction !== jur) continue;
      for (const e of m.events) {
        if (alertsOnly && !isRecent(e)) continue;
        if ((lo && e.date < lo) || (hi && e.date > hi)) continue;
        if (cat !== "all" && !e.categories.includes(cat as Category)) continue;
        const s = worstSeverity(e.categories, severity);
        if (alertsOnly && !prefs.inApp[s]) continue;
        if (sev !== "all" && s !== sev) continue;
        out.push({ e, m, s });
      }
    }
    const byDate = (a: (typeof out)[number], b: (typeof out)[number]) => (a.e.date === b.e.date ? 0 : a.e.date < b.e.date ? 1 : -1);
    const bySev = (a: (typeof out)[number], b: (typeof out)[number]) => SEVERITY_RANK[b.s] - SEVERITY_RANK[a.s];
    return out.sort((a, b) => (sort === "date" ? byDate(a, b) || bySev(a, b) : bySev(a, b) || byDate(a, b)));
  }, [rows, q, jur, sev, cat, range, from, to, sort, severity, alertsOnly, prefs]);

  const open = (id: string) => navigate(`/reports/${id}?tab=pkyb`, { state: { from: "monitoring" } });
  const slice = events.slice(page * PAGE, (page + 1) * PAGE);
  const filtersOn = q || jur !== "all" || sev !== "all" || cat !== "all" || range !== "all" || alertsOnly;

  return (
    <>
      <FilterBar
        q={q}
        setQ={(v) => update({ q: v })}
        jur={jur}
        setJur={(v) => update({ jur: v })}
        sev={sev}
        setSev={(v) => update({ sev: v })}
        cat={cat}
        setCat={(v) => update({ cat: v })}
      >
        <Select
          label="Date detected"
          value={range}
          onChange={(v) => update(v === "custom" ? { range: v } : { range: v, from: null, to: null })}
          className="w-[150px]"
          options={DATE_RANGES}
        />
        {range === "custom" && (
          <>
            <DateInput label="From" value={from} max={to || iso(TODAY)} onChange={(v) => update({ from: v })} />
            <DateInput label="To" value={to} min={from} max={iso(TODAY)} onChange={(v) => update({ to: v })} />
          </>
        )}
        {alertsOnly && (
          <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border-accent bg-interactive-accent pr-1.5 pl-3 text-[13px] font-semibold text-interactive-control">
            Your in-app alerts
            <button aria-label="Show all changes" onClick={() => update({ alerts: null })} className="grid size-6 place-items-center rounded-full hover:bg-interactive-accent-hover">
              <X className="size-3.5" />
            </button>
          </span>
        )}
        {filtersOn && (
          <button
            onClick={() => update({ q: null, jur: null, sev: null, cat: null, range: null, from: null, to: null, alerts: null })}
            className="inline-flex h-9 items-center gap-1 px-1 text-[13px] font-semibold text-content-link hover:underline max-sm:h-11"
          >
            <X className="size-3.5" /> Clear filters
          </button>
        )}
      </FilterBar>

      <div className="rounded-[6px] border border-border-subtle bg-white">
        <ul className="divide-y divide-border-subtle md:hidden">
          {slice.map(({ e, m }) => {
            const j = jurisdictionByCode[m.jurisdiction];
            return (
              <li key={e.id} className="px-4 py-3.5">
                <Link to={`/reports/${m.id}?tab=pkyb`} state={{ from: "monitoring" }} className="block min-w-0">
                  <span className="block truncate text-[14px] font-semibold text-content-primary">{m.name}</span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-content-tertiary">
                    <Flag code={j.code} /> {j.name} · <span className="tnum">Detected {formatDate(e.date)}</span>
                  </span>
                  <span className="mt-2 block">
                    <ChangeChips categories={e.categories} />
                  </span>
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="overflow-x-auto max-md:hidden">
          <table className="w-full min-w-[960px] text-left text-[13px]">
            <thead className="border-b border-border-subtle text-[12px] text-content-main">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Company</th>
                <th className="px-3 py-2.5 font-semibold">Jurisdiction</th>
                <SortTh label="Change by severity" active={sort === "severity"} title="Sort by severity, most severe first" onClick={() => update({ fsort: "severity" })} />
                <SortTh label="Detected" active={sort === "date"} title="Sort by date detected, newest first" onClick={() => update({ fsort: null })} />
                <th className="w-[112px] py-2.5 pr-4">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {slice.map(({ e, m }) => {
                const j = jurisdictionByCode[m.jurisdiction];
                return (
                  <tr key={e.id} onClick={() => open(m.id)} className="cursor-pointer align-top transition-colors hover:bg-base-contrast">
                    <td className="max-w-[300px] px-4 py-3">
                      <span className="block truncate text-[14px] font-semibold text-content-primary">{m.name}</span>
                      <span className="block text-[12px] text-content-tertiary tnum">{m.regNo}</span>
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap">
                      <span className="flex items-center gap-2 text-content-main">
                        <Flag code={j.code} /> {j.name}
                      </span>
                    </td>
                    <td className="px-3 py-3">
                      <ChangeChips categories={e.categories} />
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-content-main tnum">{formatDate(e.date)}</td>
                    <td className="py-2.5 pr-4 text-right" onClick={(ev) => ev.stopPropagation()}>
                      <Link to={`/reports/${m.id}?tab=pkyb`} state={{ from: "monitoring" }} className="inline-flex h-8 items-center px-2 text-[13px] font-semibold text-content-link hover:underline">
                        View
                      </Link>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        {events.length === 0 && (
          <div className="px-4 py-14 text-center">
            <p className="text-[14px] font-semibold">{filtersOn ? "No changes match" : "No changes yet"}</p>
            <p className="mt-1 text-[13px] text-content-main">
              {filtersOn ? "Adjust the filters to see more of the feed." : "Registry changes across your monitored companies will be listed here as they're detected."}
            </p>
          </div>
        )}
        <div className="border-t border-border-subtle">
          <Pager page={page} setPage={setPage} total={events.length} />
        </div>
      </div>
    </>
  );
}

function DateInput({ label, value, min, max, onChange }: { label: string; value: string; min?: string; max?: string; onChange: (v: string) => void }) {
  return (
    <label className="flex flex-col gap-1">
      <span className="text-[12px] font-medium text-content-main">{label}</span>
      <input
        type="date"
        value={value}
        min={min || undefined}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        className="h-9 rounded-[4px] border border-interactive-secondary bg-white px-2.5 text-[13px] text-content-primary hover:border-content-main focus:border-interactive-primary max-sm:h-11 max-sm:text-[16px]"
      />
    </label>
  );
}

/* ---------------------------------------------------------------- Order history */

/** Order history groups orders by whether they still watch the company: Active, or Inactive (stopped, or setup failed). */
type HistoryStatus = "all" | "active" | "inactive";
const HISTORY_FILTERS: Array<[HistoryStatus, string]> = [
  ["all", "All orders"],
  ["active", "Active"],
  ["inactive", "Inactive"],
];
const historyGroup = (m: Monitor): Exclude<HistoryStatus, "all"> => (m.status === "active" ? "active" : "inactive");

function OrderHistory({ status: raw, setStatus }: { status: string; setStatus: (s: HistoryStatus) => void }) {
  // Old links may still say "stopped"; it is part of Inactive now.
  const status: HistoryStatus = raw === "active" ? "active" : raw === "inactive" || raw === "stopped" ? "inactive" : "all";
  const { monitors } = useStore();
  const [jur, setJur] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState<Company | null>(null);
  const counts = useMemo(() => {
    const c: Record<Exclude<HistoryStatus, "all">, number> = { active: 0, inactive: 0 };
    monitors.forEach((m) => c[historyGroup(m)]++);
    return c;
  }, [monitors]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return monitors
      .filter((m) => (status === "all" || historyGroup(m) === status) && (jur === "all" || m.jurisdiction === jur) && (!needle || m.name.toLowerCase().includes(needle) || m.regNo.includes(needle)))
      .sort((a, b) => ((a.endedAt ?? a.createdAt) < (b.endedAt ?? b.createdAt) ? 1 : -1));
  }, [monitors, status, jur, q]);
  useEffect(() => setPage(0), [status, jur, q]);
  // All orders mixes both groups, so each row says which it is. Under Active or Inactive the filter already does.
  const showStatus = status === "all";

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-4" role="radiogroup" aria-label="Order status">
        {HISTORY_FILTERS.map(([s, label]) => (
          <button
            key={s}
            role="radio"
            aria-checked={status === s}
            onClick={() => setStatus(s)}
            className={cx(
              "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors",
              status === s ? "border-interactive-inverse bg-interactive-inverse font-semibold text-white" : "border-interactive-secondary bg-white text-content-main hover:border-content-main",
            )}
          >
            {label}
            <span className="tnum opacity-70">{nf.format(s === "all" ? monitors.length : counts[s])}</span>
          </button>
        ))}
      </div>
      <FilterBar q={q} setQ={setQ} jur={jur} setJur={setJur} />
      <div className="overflow-hidden rounded-[6px] border border-border-subtle bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[820px] text-left text-[13px]">
            <thead className="border-b border-border-subtle text-[12px] text-content-main">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Company</th>
                {showStatus && <th className="px-3 py-2.5 font-semibold">Status</th>}
                <th className="px-3 py-2.5 font-semibold">Jurisdiction</th>
                <th className="px-3 py-2.5 font-semibold">Created</th>
                <th className="px-3 py-2.5 font-semibold">Ended</th>
                <th className="px-3 py-2.5 text-right font-semibold">Changes recorded</th>
                <th className="w-[1%] px-4 py-2.5">
                  <span className="sr-only">Actions</span>
                </th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border-subtle">
              {list.slice(page * PAGE, (page + 1) * PAGE).map((m) => (
                <tr key={m.id} className="hover:bg-base-contrast">
                  <td className="px-4 py-3">
                    <Link to={`/reports/${m.id}?tab=pkyb`} state={{ from: "monitoring" }} className="block font-medium text-content-primary hover:text-content-link hover:underline">
                      {m.name}
                    </Link>
                    <span className="text-[12px] text-content-tertiary tnum">{m.regNo}</span>
                  </td>
                  {showStatus && (
                    <td className="px-3 py-3 whitespace-nowrap">
                      <StatusBadge status={m.status} />
                    </td>
                  )}
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="flex items-center gap-2 text-content-main">
                      <Flag code={m.jurisdiction} /> {jurisdictionByCode[m.jurisdiction].name}
                    </span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-content-main tnum">
                    {m.status === "inactive" ? (
                      <span title={`Ordered ${formatDate(m.createdAt)}. ${STATUS_COPY.inactive.explain}`} className="inline-flex items-center gap-1.5 text-content-main">
                        <CircleAlert className="size-3.5 text-content-tertiary" aria-hidden />
                        Creation failed
                      </span>
                    ) : (
                      formatDate(m.createdAt)
                    )}
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-content-main tnum">
                    {m.status === "stopped" ? (
                      formatDate(m.endedAt ?? m.lastChecked)
                    ) : m.status === "active" ? (
                      <span className="text-content-tertiary">Runs until stopped</span>
                    ) : (
                      <span className="sr-only">Never started</span>
                    )}
                  </td>
                  <td className="px-3 py-3 text-right tnum">{m.events.length}</td>
                  <td className="px-4 py-1.5 text-right whitespace-nowrap">
                    {m.status !== "active" && (
                      <Button variant="link" size="sm" onClick={() => setCreating(asCompany(m))} aria-label={`Create pKYB monitor for ${m.name}`}>
                        Create pKYB monitor
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
              {list.length === 0 && (
                <tr>
                  <td colSpan={showStatus ? 7 : 6} className="px-4 py-14 text-center">
                    <p className="text-[14px] font-semibold">No orders match</p>
                    <p className="mt-1 text-[13px] text-content-main">Try another status or jurisdiction, or clear the search.</p>
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
        <div className="border-t border-border-subtle">
          <Pager page={page} setPage={setPage} total={list.length} />
        </div>
      </div>
      <CreateMonitorDialog company={creating} onClose={() => setCreating(null)} />
    </>
  );
}

export function StatusBadge({ status }: { status: MonitorStatus }) {
  return (
    <span
      title={STATUS_COPY[status].explain}
      className={cx(
        "inline-flex h-6 items-center gap-1.5 rounded-[4px] border px-2 text-[12px] font-semibold",
        status === "active" && "border-border-accent bg-interactive-accent text-interactive-control",
        status === "stopped" && "border-border-neutral bg-background-subtle text-content-main",
        // Amber is Medium severity and nothing else. Inactive reads as "never ran": neutral, with a hollow dot.
        status === "inactive" && "border-border-neutral bg-white text-content-main",
      )}
    >
      <span
        aria-hidden
        className={cx("size-1.5 rounded-full", status === "active" ? "bg-interactive-primary" : status === "stopped" ? "bg-content-tertiary" : "border border-content-tertiary bg-transparent")}
      />
      {STATUS_COPY[status].label}
    </span>
  );
}

/** One summary figure. Severity cards take their step's tint; the total stays neutral with the brand-green icon. */
function StatCard({ value, label, icon: Icon, severity, pressed, onClick }: { value: number; label: string; icon: LucideIcon; severity?: Severity; pressed?: boolean; onClick: () => void }) {
  const st = severity && SEV_STYLE[severity];
  return (
    <button
      aria-pressed={severity ? pressed : undefined}
      title={severity ? undefined : "Show all active monitors"}
      onClick={onClick}
      className={cx(
        "flex min-w-0 items-center justify-between gap-3 rounded-[6px] border px-4 py-3.5 text-left transition-[filter,box-shadow] duration-150 hover:brightness-[0.97] sm:px-5 sm:py-4",
        st ? cx(st.bg, st.line) : "border-border-subtle bg-white",
        pressed && st && cx("shadow-[inset_0_0_0_1px_currentColor]", st.text),
      )}
    >
      <span className="min-w-0">
        <span className={cx("block text-[26px] leading-tight font-semibold tracking-[-0.015em] tnum", st ? st.text : "text-content-primary")}>{nf.format(value)}</span>
        <span className={cx("mt-0.5 flex items-center gap-1 text-[12px] font-semibold tracking-[0.04em] uppercase", st ? st.text : "text-content-main")}>
          {pressed && <Check className="size-3.5 shrink-0" strokeWidth={2.5} aria-hidden />}
          <span className="truncate">{label}</span>
        </span>
      </span>
      <span
        aria-hidden
        className={cx(
          "grid size-10 shrink-0 place-items-center rounded-full max-[400px]:hidden sm:size-12",
          st ? cx("bg-white/70", st.text) : "bg-interactive-accent text-interactive-control",
        )}
      >
        <Icon className="size-5" strokeWidth={2} />
      </span>
    </button>
  );
}
