import { useEffect, useMemo, useState } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ArrowDown, ArrowUpDown, Check, ChevronLeft, ChevronRight, Download, Ellipsis, Search, Square, SquareCheck, SquareMinus, X } from "lucide-react";
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
  isRecent,
  iso,
  jurisdictionByCode,
  worstSeverity,
  type ChangeEvent,
  type Company,
  type Monitor,
  type MonitorStatus,
  type Severity,
} from "../data/model";
import { useStore } from "../state/store";
import { applyFilters, buildRow, describeFilters, filtersFromParams, type Filters, type Row } from "../data/queue";
import { Heatmap } from "../components/Heatmap";
import { StopDialog } from "../components/StopDialog";
import { CreateMonitorDialog } from "../components/CreateMonitorDialog";
import { Button, CategoryChip, EventSeverity, Flag, Menu, SEV_STYLE, Select, cx, formatDate, formatDateLong, nf } from "../components/ui";

type Tab = "active" | "feed" | "history";
type Update = (patch: Record<string, string | null>) => void;
const FILTER_KEYS = ["q", "jur", "sev", "cat", "recent", "sort", "day", "status", "alerts"];
const TABS: Array<[Tab, string, string]> = [
  ["active", "Active monitors", "Active"],
  ["feed", "Change feed", "Feed"],
  ["history", "Order history", "History"],
];

const PAGE = 25;
const HIGH_RAMP = ["var(--color-background-subtle)", "var(--color-high-ramp-1)", "var(--color-high-ramp-2)", "var(--color-high-cell)"];
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
  const day = params.get("day");
  const status = (params.get("status") as MonitorStatus | null) ?? "all";

  const active = useMemo(() => monitors.filter((m) => m.status === "active"), [monitors]);

  const rows = useMemo<Row[]>(
    () =>
      active.map((m) => buildRow(m, severity)),
    [active, severity],
  );

  const triage = useMemo(() => {
    const by: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    let companies = 0;
    for (const r of rows) if (r.recentSev) (by[r.recentSev]++, companies++);
    const heatSince = iso(addDays(TODAY, -26 * 7));
    let recent = 0;
    let peak = 1;
    // The heatmap shares the headline's lens: High changes, so a busy stretch stands out.
    const highByDay = new Map<string, number>();
    for (const r of rows)
      for (const e of r.m.events) {
        if (isRecent(e)) recent++;
        if (worstSeverity(e.categories, severity) !== "high") continue;
        const n = (highByDay.get(e.date) ?? 0) + 1;
        highByDay.set(e.date, n);
        if (e.date >= heatSince && n > peak) peak = n;
      }
    return { by, companies, recent, highByDay, peak };
  }, [rows, severity]);
  // The ramp scales to the busiest day on screen, so it never saturates into one flat colour.
  const rampStep = (n: number) => (n === 0 ? 0 : n <= triage.peak / 3 ? 1 : n <= (2 * triage.peak) / 3 ? 2 : 3);

  const f = filtersFromParams(params);
  const onTabKey = (e: React.KeyboardEvent) => {
    const i = TABS.findIndex(([t]) => t === tab);
    const to = e.key === "ArrowRight" ? (i + 1) % TABS.length : e.key === "ArrowLeft" ? (i + TABS.length - 1) % TABS.length : e.key === "Home" ? 0 : e.key === "End" ? TABS.length - 1 : -1;
    if (to < 0) return;
    e.preventDefault();
    setTab(TABS[to][0]);
    document.getElementById(`tab-${TABS[to][0]}`)?.focus();
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 pt-6 pb-16 lg:px-8">
      <header className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.015em]">Monitoring</h1>
          <p className="mt-1 text-[14px] text-content-main">Registry changes across the companies you monitor. Checks run automatically.</p>
        </div>
      </header>

      {/* Triage band: one surface, three jobs, in reading order. */}
      <section aria-label="Triage" className="mt-6 grid overflow-hidden rounded-[6px] border border-border-subtle bg-white lg:grid-cols-[minmax(0,1.05fr)_minmax(0,1.4fr)]">
        <div className="flex flex-col justify-between gap-5 p-5 lg:p-6">
          <div>
            <p className="text-[13px] font-semibold text-content-main">Changed in the last {RECENT_DAYS} days</p>
            <p className="mt-1 flex items-baseline gap-2">
              <span className="text-[44px] leading-none font-semibold tracking-[-0.03em] tnum">{nf.format(triage.companies)}</span>
              <span className="text-[14px] text-content-main">{triage.companies === 1 ? "company" : "companies"}</span>
            </p>
            {/* The chips are the severity filter for the table below: press one to narrow to it, press it again to clear. */}
            <div role="group" aria-label={`Filter companies by their most severe change in the last ${RECENT_DAYS} days`} className="mt-4 flex flex-wrap gap-2">
              {(["high", "medium", "low"] as Severity[]).map((s) => {
                const pressed = tab === "active" && f.sev === s;
                return (
                  <button
                    key={s}
                    aria-pressed={pressed}
                    onClick={() => (pressed ? update({ sev: null }) : update({ tab: null, recent: "1", sev: s }))}
                    className={cx(
                      "inline-flex h-8 items-center gap-2 rounded-full border px-3 text-[13px] transition-colors hover:brightness-[0.97] max-sm:h-10",
                      SEV_STYLE[s].bg,
                      SEV_STYLE[s].line,
                      SEV_STYLE[s].text,
                      pressed && "shadow-[inset_0_0_0_1px_currentColor]",
                    )}
                  >
                    {pressed ? <Check className="size-3.5" strokeWidth={2.5} aria-hidden /> : <span className={cx("size-2 rounded-full", SEV_STYLE[s].dot)} aria-hidden />}
                    <span className="font-semibold tnum">{nf.format(triage.by[s])}</span> {SEVERITY_LABEL[s]}
                  </button>
                );
              })}
            </div>
          </div>
          <div>
            <dl className="text-[13px]">
              <dt className="text-content-tertiary">Changes, last {RECENT_DAYS} days</dt>
              <dd className="font-semibold tnum">{nf.format(triage.recent)}</dd>
            </dl>
          </div>
        </div>
        <div className="border-t border-border-subtle bg-base-contrast/60 p-5 lg:border-t-0 lg:border-l lg:p-6">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <p className="text-[13px] font-semibold text-content-main">High-severity changes per day · last 26 weeks</p>
            <span className="flex items-center gap-1.5 text-[11px] text-content-tertiary">
              None
              {HIGH_RAMP.map((c) => (
                <span key={c} className="size-2.5 rounded-[2px]" style={{ background: c }} />
              ))}
              <span className="tnum">{triage.peak}</span>
            </span>
          </div>
          <Heatmap
            weeks={26}
            size={13}
            gap={3}
            ariaLabel="High-severity changes per day across your portfolio"
            selected={tab === "feed" && f.sev === "high" ? day : null}
            onSelect={(d) => update(d ? { day: d, tab: "feed", sev: "high", alerts: null } : { day: null })}
            cell={(d) => {
              const n = triage.highByDay.get(d) ?? 0;
              return {
                fill: HIGH_RAMP[rampStep(n)],
                label: `${n === 0 ? "No" : n} High-severity change${n === 1 ? "" : "s"} · ${formatDate(d)}`,
                active: n > 0,
              };
            }}
          />
          <p className="mt-2 text-[12px] text-content-tertiary">Select a day to open its High changes in the feed.</p>
        </div>
      </section>

      <div role="tablist" aria-label="Monitoring views" onKeyDown={onTabKey} className="mt-8 flex gap-1 overflow-x-auto overflow-y-hidden border-b border-border-subtle">
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
                "-mb-px flex h-11 shrink-0 items-center gap-2 border-b-2 px-3 text-[14px] transition-colors",
                tab === t ? "border-interactive-primary font-semibold text-content-primary" : "border-transparent text-content-main hover:text-content-primary",
              )}
            >
              <span className="max-sm:hidden">{label}</span>
              <span className="sm:hidden">{short}</span>
              {n !== null && <span className={cx("rounded-full px-1.5 text-[11px] tnum", tab === t ? "bg-interactive-accent text-interactive-control" : "bg-background-subtle text-content-tertiary")}>{nf.format(n)}</span>}
            </button>
          );
        })}
      </div>

      <div role="tabpanel" id={`panel-${tab}`} aria-labelledby={`tab-${tab}`}>
        {tab === "active" && <ActiveTable rows={rows} f={f} update={update} page={Number(params.get("page") ?? 0)} search={params.toString()} />}
        {tab === "feed" && (
          <ChangeFeed
            rows={rows}
            day={day}
            setDay={(d) => update({ day: d })}
            jur={f.jur}
            setJur={(v) => update({ jur: v })}
            sev={f.sev}
            setSev={(v) => update({ sev: v })}
            cat={f.cat}
            setCat={(v) => update({ cat: v })}
            alertsOnly={params.get("alerts") === "1"}
            clearAlerts={() => update({ alerts: null })}
            search={params.toString()}
          />
        )}
        {tab === "history" && <OrderHistory status={status} setStatus={(v) => update({ status: v })} />}
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

function ActiveTable({ rows, f, update, page, search }: { rows: Row[]; f: Filters; update: Update; page: number; search: string }) {
  const navigate = useNavigate();
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [stopping, setStopping] = useState<Array<{ id: string; name: string }>>([]);
  const { q, jur, sev, cat, recent: onlyRecent, sort } = f;
  const { setQueue, severity } = useStore();
  const setPage = (n: number) => update({ page: n ? String(n) : null });
  const setSort = (v: "severity" | "date") => update({ sort: v === "severity" ? null : v });

  const filtered = useMemo(() => applyFilters(rows, f), [rows, q, jur, sev, cat, onlyRecent, sort]);
  // Opening a company from here remembers this list, so the company page can step through it.
  const remember = () => setQueue({ ids: filtered.map((r) => r.m.id), label: describeFilters(f), search });
  const open = (id: string) => {
    remember();
    navigate(`/pkyb/monitoring/${id}`);
  };
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
  const filtersOn = q || jur !== "all" || sev !== "all" || cat !== "all" || onlyRecent;

  return (
    <>
      {/* Severity is filtered by the triage chips above, so the bar carries no second severity control. */}
      <FilterBar q={q} setQ={(v) => update({ q: v })} jur={jur} setJur={(v) => update({ jur: v })} cat={cat} setCat={(v) => update({ cat: v })}>
        <label className="flex h-9 cursor-pointer items-center gap-2 rounded-[4px] border border-interactive-secondary bg-white px-3 text-[13px] select-none max-sm:h-11">
          <input type="checkbox" checked={onlyRecent} onChange={(e) => update({ recent: e.target.checked ? "1" : null })} className="size-4 accent-interactive-primary" />
          Changed in last {RECENT_DAYS} days
        </label>
        {filtersOn && (
          <button
            onClick={() => update({ q: null, jur: null, sev: null, cat: null, recent: null })}
            className="inline-flex h-9 items-center gap-1 px-1 text-[13px] font-semibold text-content-link hover:underline max-sm:h-11"
          >
            <X className="size-3.5" /> Clear filters
          </button>
        )}
      </FilterBar>

      <div className="rounded-[6px] border border-border-subtle bg-white">
        {selected.size > 0 && (
          <div className="sticky top-14 z-10 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-t-[5px] border-b border-border-subtle bg-background-system px-4 py-2 text-[13px] text-white">
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
                <Link to={`/pkyb/monitoring/${r.m.id}`} onClick={remember} className="min-w-0 flex-1">
                  <span className="flex items-center gap-2">
                    <span className={cx("truncate text-[14px] text-content-primary", r.recent > 0 ? "font-semibold" : "font-medium")}>{r.m.name}</span>
                  </span>
                  <span className="mt-0.5 flex items-center gap-1.5 text-[12px] text-content-tertiary">
                    <Flag code={j.code} /> {j.name} · <span className="tnum">{r.latest ? `Detected ${formatDate(r.latest.date)}` : `Checked ${formatDate(r.m.lastChecked)}`}</span>
                  </span>
                  {r.latest && r.latestSev ? (
                    <span className="mt-2 flex flex-wrap items-center gap-1.5">
                      <EventSeverity event={r.latest} size="sm" />
                      {r.latest.categories.map((c) => (
                        <CategoryChip key={c} category={c} />
                      ))}
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
                <th className="px-3 py-1.5 font-semibold" aria-sort={sort === "severity" ? "descending" : "none"}>
                  <button onClick={() => setSort("severity")} title="Sort by severity, most severe first" className={cx("inline-flex h-6 items-center gap-1", sort === "severity" && "text-content-primary")}>
                    Change by severity {sort === "severity" ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUpDown className="size-3.5 text-content-tertiary" aria-hidden />}
                  </button>
                </th>
                <th className="px-3 py-1.5 font-semibold" aria-sort={sort === "date" ? "descending" : "none"}>
                  <button onClick={() => setSort("date")} title="Sort by date detected, newest first" className={cx("inline-flex h-6 items-center gap-1", sort === "date" && "text-content-primary")}>
                    Detected {sort === "date" ? <ArrowDown className="size-3.5" aria-hidden /> : <ArrowUpDown className="size-3.5 text-content-tertiary" aria-hidden />}
                  </button>
                </th>
                <th className="px-3 py-2.5 font-semibold whitespace-nowrap">Last checked</th>
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
                        <span className="flex flex-wrap items-center gap-1.5">
                          <EventSeverity event={r.latest} size="sm" />
                          {r.latest.categories.map((c) => (
                            <CategoryChip key={c} category={c} />
                          ))}
                        </span>
                      ) : (
                        <span className="text-content-tertiary">No changes since baseline</span>
                      )}
                    </td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-content-main tnum">{r.latest ? formatDate(r.latest.date) : "—"}</td>
                    <td className="px-3 py-3.5 whitespace-nowrap text-content-tertiary tnum">{formatDate(r.m.lastChecked)}</td>
                    <td className="py-2.5 pr-3" onClick={(e) => e.stopPropagation()}>
                      <span className="flex items-center justify-end gap-1">
                        <Link to={`/pkyb/monitoring/${r.m.id}`} onClick={remember} className="inline-flex h-8 items-center px-2 text-[13px] font-semibold text-content-link hover:underline">
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
                  <td colSpan={7} className="px-4 py-14 text-center">
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

function ChangeFeed({
  rows,
  day,
  setDay,
  jur,
  setJur,
  sev,
  setSev,
  cat,
  setCat,
  alertsOnly,
  clearAlerts,
  search,
}: {
  rows: Row[];
  day: string | null;
  setDay: (d: string | null) => void;
  jur: string;
  setJur: (v: string) => void;
  sev: "all" | Severity;
  setSev: (v: "all" | Severity) => void;
  cat: string;
  setCat: (v: string) => void;
  /** Only recent changes at the severities the analyst gets in-app alerts for: exactly what the bell counts. */
  alertsOnly: boolean;
  clearAlerts: () => void;
  search: string;
}) {
  const { severity, prefs } = useStore();
  const [page, setPage] = useState(0);
  const events = useMemo(() => {
    const out: Array<{ e: ChangeEvent; m: Monitor; s: Severity }> = [];
    for (const r of rows)
      for (const e of r.m.events) {
        if (alertsOnly && !isRecent(e)) continue;
        if (day && e.date !== day) continue;
        if (jur !== "all" && r.m.jurisdiction !== jur) continue;
        if (cat !== "all" && !e.categories.includes(cat as never)) continue;
        const s = worstSeverity(e.categories, severity);
        if (alertsOnly && !prefs.inApp[s]) continue;
        if (sev !== "all" && s !== sev) continue;
        out.push({ e, m: r.m, s });
      }
    return out.sort((a, b) => (a.e.date === b.e.date ? SEVERITY_RANK[b.s] - SEVERITY_RANK[a.s] : a.e.date < b.e.date ? 1 : -1));
  }, [rows, day, jur, sev, cat, severity, alertsOnly, prefs]);
  useEffect(() => setPage(0), [day, jur, sev, cat, alertsOnly]);
  const { setQueue } = useStore();
  const rememberFeed = () =>
    setQueue({ ids: [...new Set(events.map((x) => x.m.id))], label: day ? `Change feed · ${formatDate(day)}` : "Change feed", search });
  const slice = events.slice(page * PAGE, (page + 1) * PAGE);
  const groups: Array<[string, typeof slice]> = [];
  for (const it of slice) {
    const g = groups[groups.length - 1];
    if (g && g[0] === it.e.date) g[1].push(it);
    else groups.push([it.e.date, [it]]);
  }

  return (
    <>
      <FilterBar jur={jur} setJur={setJur} sev={sev} setSev={setSev} cat={cat} setCat={setCat}>
        {alertsOnly && (
          <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border-accent bg-interactive-accent pr-1.5 pl-3 text-[13px] font-semibold text-interactive-control">
            Your in-app alerts
            <button aria-label="Show all changes" onClick={clearAlerts} className="grid size-6 place-items-center rounded-full hover:bg-interactive-accent-hover">
              <X className="size-3.5" />
            </button>
          </span>
        )}
        {day && (
          <span className="inline-flex h-9 items-center gap-2 rounded-full border border-border-accent bg-interactive-accent pr-1.5 pl-3 text-[13px] font-semibold text-interactive-control">
            {formatDateLong(day)}
            <button aria-label="Clear day" onClick={() => setDay(null)} className="grid size-6 place-items-center rounded-full hover:bg-interactive-accent-hover">
              <X className="size-3.5" />
            </button>
          </span>
        )}
      </FilterBar>
      <div className="rounded-[6px] border border-border-subtle bg-white">
        {groups.map(([date, items]) => (
          <section key={date} aria-label={formatDateLong(date)}>
            <h2 className="sticky top-14 z-[1] border-b border-border-subtle bg-base-contrast px-4 py-2 first:rounded-t-[6px] text-[12px] font-semibold text-content-main">{formatDateLong(date)}</h2>
            <ul className="divide-y divide-border-subtle">
              {items.map(({ e, m }) => (
                <li key={e.id} className="relative grid gap-2 px-4 py-3 hover:bg-base-contrast sm:grid-cols-[104px_minmax(0,1fr)] sm:items-center sm:gap-4">
                    <span>
                      <EventSeverity event={e} size="sm" />
                    </span>
                    <span className="min-w-0">
                      <span className="flex items-center gap-2">
                        <Flag code={m.jurisdiction} />
                        <Link
                          to={`/pkyb/monitoring/${m.id}`}
                          onClick={rememberFeed}
                          title={m.name}
                          className="truncate text-[14px] font-semibold text-content-primary hover:underline after:absolute after:inset-0"
                        >
                          {m.name}
                        </Link>
                      </span>
                      <span className="mt-1.5 flex flex-wrap gap-1.5">
                        {e.categories.map((c) => (
                          <CategoryChip key={c} category={c} />
                        ))}
                      </span>
                    </span>
                </li>
              ))}
            </ul>
          </section>
        ))}
        {events.length === 0 && (
          <div className="px-4 py-14 text-center">
            <p className="text-[14px] font-semibold">{day || jur !== "all" || sev !== "all" || cat !== "all" || alertsOnly ? "No changes match" : "No changes yet"}</p>
            <p className="mt-1 text-[13px] text-content-main">
              {day
                ? "Nothing was detected on this day for these filters."
                : jur !== "all" || sev !== "all" || cat !== "all" || alertsOnly
                  ? "Adjust the filters to see more of the feed."
                  : "Registry changes across your monitored companies will be listed here as they're detected."}
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

/* ---------------------------------------------------------------- Order history */

function OrderHistory({ status, setStatus }: { status: "all" | MonitorStatus; setStatus: (s: "all" | MonitorStatus) => void }) {
  const { monitors } = useStore();
  const [jur, setJur] = useState("all");
  const [q, setQ] = useState("");
  const [page, setPage] = useState(0);
  const [creating, setCreating] = useState<Company | null>(null);
  const counts = useMemo(() => {
    const c: Record<MonitorStatus, number> = { active: 0, stopped: 0, inactive: 0 };
    monitors.forEach((m) => c[m.status]++);
    return c;
  }, [monitors]);
  const list = useMemo(() => {
    const needle = q.trim().toLowerCase();
    return monitors
      .filter((m) => (status === "all" || m.status === status) && (jur === "all" || m.jurisdiction === jur) && (!needle || m.name.toLowerCase().includes(needle) || m.regNo.includes(needle)))
      .sort((a, b) => ((a.endedAt ?? a.createdAt) < (b.endedAt ?? b.createdAt) ? 1 : -1));
  }, [monitors, status, jur, q]);
  useEffect(() => setPage(0), [status, jur, q]);

  const exportCsv = () => {
    const head = ["Company", "Registration no.", "Jurisdiction", "Status", "Created", "Ended", "Changes recorded"];
    const lines = list.map((m) => [m.name, m.regNo, jurisdictionByCode[m.jurisdiction].name, STATUS_COPY[m.status].label, m.createdAt, m.endedAt ?? "", String(m.events.length)]);
    const csv = [head, ...lines].map((r) => r.map((v) => `"${v.replace(/"/g, '""')}"`).join(",")).join("\n");
    const url = URL.createObjectURL(new Blob([csv], { type: "text/csv" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `pkyb-order-history-${iso(TODAY)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <>
      <div className="flex flex-wrap items-center gap-2 pt-4" role="radiogroup" aria-label="Order status">
        {(["all", "active", "stopped", "inactive"] as const).map((s) => (
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
            {s === "all" ? "All orders" : STATUS_COPY[s].label}
            <span className="tnum opacity-70">{nf.format(s === "all" ? monitors.length : counts[s])}</span>
          </button>
        ))}
      </div>
      {status === "all" ? (
        <dl className="mt-3 grid max-w-[980px] gap-x-6 gap-y-2 text-[13px] md:grid-cols-3">
          {(["active", "stopped", "inactive"] as const).map((s) => (
            <div key={s}>
              <dt className="font-semibold text-content-primary">{STATUS_COPY[s].label}</dt>
              <dd className="text-content-main">{STATUS_COPY[s].explain}</dd>
            </div>
          ))}
        </dl>
      ) : (
        <p className="mt-3 max-w-[70ch] text-[13px] text-content-main">
          <span className="font-semibold text-content-primary">{STATUS_COPY[status].label}:</span> {STATUS_COPY[status].explain}
        </p>
      )}
      <FilterBar q={q} setQ={setQ} jur={jur} setJur={setJur}>
        <Button variant="secondary" className="ml-auto" onClick={exportCsv}>
          <Download className="size-4" /> Export CSV
        </Button>
      </FilterBar>
      <div className="overflow-hidden rounded-[6px] border border-border-subtle bg-white">
        <div className="overflow-x-auto">
          <table className="w-full min-w-[940px] text-left text-[13px]">
            <thead className="border-b border-border-subtle text-[12px] text-content-main">
              <tr>
                <th className="px-4 py-2.5 font-semibold">Company</th>
                <th className="px-3 py-2.5 font-semibold">Jurisdiction</th>
                <th className="px-3 py-2.5 font-semibold">Status</th>
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
                    <Link to={`/pkyb/monitoring/${m.id}`} className="block font-medium text-content-primary hover:text-content-link hover:underline">
                      {m.name}
                    </Link>
                    <span className="text-[12px] text-content-tertiary tnum">{m.regNo}</span>
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap">
                    <span className="flex items-center gap-2 text-content-main">
                      <Flag code={m.jurisdiction} /> {jurisdictionByCode[m.jurisdiction].name}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <StatusBadge status={m.status} />
                  </td>
                  <td className="px-3 py-3 whitespace-nowrap text-content-main tnum">{formatDate(m.createdAt)}</td>
                  <td className="px-3 py-3 whitespace-nowrap text-content-main tnum">{m.endedAt ? formatDate(m.endedAt) : <span className="text-content-tertiary">Runs until stopped</span>}</td>
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
                  <td colSpan={7} className="px-4 py-14 text-center">
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
