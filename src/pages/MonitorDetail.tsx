import { useEffect, useId, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CirclePause, CircleStop, Download, FileCheck2, LoaderCircle, Radar, SlidersHorizontal, X } from "lucide-react";
import { PRICING, SEVERITY_LABEL, SEVERITY_RANK, TODAY, addDays, creditsLabel, iso, jurisdictionByCode, worstSeverity, type Company, type Monitor, type Severity } from "../data/model";
import { useStore } from "../state/store";
import { Heatmap } from "../components/Heatmap";
import { StopDialog } from "../components/StopDialog";
import { CreateMonitorDialog } from "../components/CreateMonitorDialog";
import { StatusBadge } from "./Monitoring";
import { Button, ChangeChips, Dialog, Flag, SEV_STYLE, cx, formatDate, formatDateLong, nf } from "../components/ui";

const CELL: Record<Severity | "none", string> = {
  none: "var(--color-background-subtle)",
  low: "var(--color-low-cell)",
  medium: "var(--color-medium-cell)",
  high: "var(--color-high-cell)",
};
const LOG_PAGE = 12;

/** Fixed windows for the change log. "Last week" and "Last month" are the previous calendar week (Mon–Sun) and month. */
type LogRange = "7d" | "30d" | "week" | "month" | "ytd" | "all";
const RANGES: Array<{ value: LogRange; label: string }> = [
  { value: "7d", label: "Last 7 days" },
  { value: "30d", label: "Last 30 days" },
  { value: "week", label: "Last week" },
  { value: "month", label: "Last month" },
  { value: "ytd", label: "Year to date" },
  { value: "all", label: "All time" },
];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m + 1)}-${pad(d)}`;
function rangeBounds(r: LogRange): { from?: string; to?: string } {
  const y = TODAY.getFullYear();
  const mo = TODAY.getMonth();
  switch (r) {
    case "7d":
      return { from: iso(addDays(TODAY, -7)) };
    case "30d":
      return { from: iso(addDays(TODAY, -30)) };
    case "week": {
      const monday = addDays(TODAY, -((TODAY.getDay() + 6) % 7) - 7);
      return { from: iso(monday), to: iso(addDays(monday, 6)) };
    }
    case "month": {
      const last = new Date(y, mo, 0);
      return { from: ymd(last.getFullYear(), last.getMonth(), 1), to: ymd(last.getFullYear(), last.getMonth(), last.getDate()) };
    }
    case "ytd":
      return { from: ymd(y, 0, 1) };
    default:
      return {};
  }
}

const asCompany = (m: Monitor): Company => ({ id: m.id, name: m.name, localName: m.localName, regNo: m.regNo, jurisdiction: m.jurisdiction, status: "Registered" });
const plural = (n: number, one: string, many: string) => `${nf.format(n)} ${n === 1 ? one : many}`;

export function MonitorDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const { monitors, severity, toast, reports, requestReport } = useStore();
  const m = monitors.find((x) => x.id === id);
  const [stopping, setStopping] = useState(false);
  const [creating, setCreating] = useState<Company | null>(null);
  const [confirmingReport, setConfirmingReport] = useState(false);
  const [range, setRange] = useState<LogRange>("all");
  const [day, setDay] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const isNew = params.get("new") === "1";
  const [baselineReady, setBaselineReady] = useState(!isNew);

  useEffect(() => {
    if (baselineReady) return;
    const t = window.setTimeout(() => setBaselineReady(true), 3500);
    return () => window.clearTimeout(t);
  }, [baselineReady]);
  useEffect(() => setPage(0), [day, range]);

  const yearAgo = iso(addDays(TODAY, -365));
  const { from, to } = rangeBounds(range);
  const inRange = (d: string) => (!from || d >= from) && (!to || d <= to);

  const byDay = useMemo(() => {
    const out = new Map<string, { sev: Severity; n: number }>();
    for (const e of m?.events ?? []) {
      const s = worstSeverity(e.categories, severity);
      const cur = out.get(e.date);
      if (!cur) out.set(e.date, { sev: s, n: 1 });
      else out.set(e.date, { sev: SEVERITY_RANK[s] > SEVERITY_RANK[cur.sev] ? s : cur.sev, n: cur.n + 1 });
    }
    return out;
  }, [m, severity]);

  if (!m) {
    return (
      <div className="mx-auto max-w-[720px] px-4 py-20 text-center">
        <p className="text-[16px] font-semibold">This monitor doesn't exist</p>
        <Link to="/pkyb/monitoring" className="mt-2 inline-block text-content-link hover:underline">
          Back to Monitoring
        </Link>
      </div>
    );
  }

  const j = jurisdictionByCode[m.jurisdiction];
  const active = m.status === "active";
  const yearEvents = m.events.filter((e) => e.date >= yearAgo);
  const yearDays = new Set(yearEvents.map((e) => e.date)).size;

  // The date filter drives both the log and the severity summary beside it; a day picked on the grid narrows the log further.
  const ranged = m.events.filter((e) => inRange(e.date));
  const log = day ? m.events.filter((e) => e.date === day) : ranged;
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const e of ranged) counts[worstSeverity(e.categories, severity)]++;
  const rangeLabel = RANGES.find((r) => r.value === range)!.label;
  const rangeSpan = range === "all" ? `Since ${formatDate(m.createdAt)}` : `${formatDate(from!)} – ${formatDate(to ?? iso(TODAY))}`;

  const selectDay = (d: string | null) => {
    setDay(d);
    if (d) {
      const smooth = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      requestAnimationFrame(() => document.getElementById("change-log")?.scrollIntoView({ behavior: smooth ? "smooth" : "auto", block: "nearest" }));
    }
  };
  const pages = Math.max(1, Math.ceil(log.length / LOG_PAGE));
  const reportState = reports[m.id];
  const price = creditsLabel(PRICING.kybBasicCredits);
  const freshReport =
    reportState === "generating" ? (
      <Button variant="primary" size="sm" disabled aria-live="polite">
        <LoaderCircle className="size-4 animate-spin" /> Generating fresh report…
      </Button>
    ) : reportState === "ready" ? (
      <Button variant="primary" size="sm" onClick={() => toast({ title: "Downloading KYB Basic report", body: `${m.name}, generated ${formatDate(iso(TODAY))}.` })}>
        <Download className="size-4" /> Download fresh report
      </Button>
    ) : (
      <Button variant="primary" size="sm" onClick={() => setConfirmingReport(true)} className="max-sm:w-full">
        <FileCheck2 className="size-4" /> Get fresh KYB Basic report
        <span className="font-normal tnum">· {price}</span>
      </Button>
    );
  const downloadBaseline = () => toast({ title: "Downloading baseline report", body: `KYB Basic for ${m.name}, generated ${formatDate(m.createdAt)}.` });

  // What each status says about the monitor. Inactive never ran, so it claims no baseline or cost. Check timing is never shown.
  const facts: Array<[string, ReactNode]> =
    m.status === "active"
      ? [
          ["Monitoring since", formatDate(m.createdAt)],
          ["Duration", "Until you stop it"],
          ["Cost", `${PRICING.monitorCredits} credits / year`],
        ]
      : m.status === "stopped"
        ? [
            ["Monitoring since", formatDate(m.createdAt)],
            ["Stopped", formatDate(m.endedAt ?? m.lastChecked)],
          ]
        : [
            ["Ordered", formatDate(m.createdAt)],
            ["Status", "Setup failed"],
          ];

  return (
    <div className="mx-auto max-w-[1360px] px-4 pt-6 pb-16 lg:px-8">
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
        <div className="min-w-0">
          {/* The flag rides on the name's last line, so a wrapped name never strands it at the far edge. */}
          <h1 className="text-[22px] leading-tight font-semibold tracking-[-0.015em] text-balance [overflow-wrap:anywhere] sm:text-[26px]">
            {m.name}
            <Flag code={m.jurisdiction} className="ml-3 h-4 w-6 -translate-y-0.5 align-middle" />
          </h1>
          {m.localName && <p className="text-[16px] text-content-main [overflow-wrap:anywhere]">{m.localName}</p>}
          <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-[13px] text-content-main">
            <MonitorDetails m={m} facts={facts} baselineReady={baselineReady} onDownloadBaseline={downloadBaseline} />
            <span>
              {j.regLabel} <span className="tnum">{m.regNo}</span> · {j.name}
            </span>
          </div>
        </div>
        {/* Stopping is the monitor's only action besides the report. Red outline, not fill: it confirms first and never outranks the report. */}
        {active && (
          <Button variant="danger-outline" size="sm" onClick={() => setStopping(true)}>
            <CircleStop className="size-4" aria-hidden /> Stop monitoring
          </Button>
        )}
      </header>

      {/* Stopped and Inactive say so first: no checks run, and the way forward is a new monitor. */}
      {!active && (
        <section aria-labelledby="status-h" className="mt-6 rounded-[6px] border border-border-neutral bg-white p-5 lg:p-6">
          <div className="flex items-center gap-2 text-content-primary">
            {m.status === "inactive" ? <CircleAlert className="size-5 text-content-main" aria-hidden /> : <CirclePause className="size-5 text-content-main" aria-hidden />}
            <h2 id="status-h" className="text-[18px] font-semibold">
              {m.status === "inactive" ? "Monitoring never started" : `Stopped ${formatDate(m.endedAt ?? m.lastChecked)}`}
            </h2>
          </div>
          <p className="mt-2 max-w-[64ch] text-[14px] text-content-main">
            {m.status === "inactive"
              ? "Setup failed, so no checks have run for this company. Inactive orders can't be restarted; create a new monitor instead."
              : `You stopped this monitor, so checks no longer run. ${
                  m.events.length ? `Its ${plural(m.events.length, "recorded change", "recorded changes")} and baseline report stay` : "Its baseline report stays"
                } here for your records.`}
          </p>
          <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-2">
            <Button variant={m.status === "inactive" ? "primary" : "secondary"} onClick={() => setCreating(asCompany(m))}>
              <Radar className="size-4" /> Create pKYB monitor
            </Button>
            <span className="text-[12px] text-content-tertiary">Starts a new order with a new KYB Basic baseline.</span>
          </div>
        </section>
      )}

      {m.events.length === 0 ? (
        active && (
          <section aria-labelledby="idle-h" className="mt-6 rounded-[6px] border border-border-accent bg-interactive-accent/60 p-5 lg:p-6">
            <div className="flex items-center gap-2 text-interactive-control">
              {baselineReady ? <Radar className="size-5" aria-hidden /> : <LoaderCircle className="size-5 animate-spin" aria-hidden />}
              <h2 id="idle-h" className="text-[18px] font-semibold">
                {baselineReady ? "Monitoring is running" : "Setting up your baseline"}
              </h2>
            </div>
            <p className="mt-2 max-w-[64ch] text-[14px] text-content-main">
              {baselineReady ? "No changes since the baseline." : "The KYB Basic baseline report is being generated."} Checks run automatically, and you'll be alerted in-app and by email
              based on your{" "}
              <Link to="/pkyb/settings" className="font-semibold text-content-link hover:underline">
                severity settings
              </Link>
              . New changes will be listed here.
            </p>
          </section>
        )
      ) : (
        <>
          {/* The year at a glance is the page's centrepiece: when things changed, and how badly, before any row of the log. */}
          <section aria-labelledby="heat-h" className="mt-6 rounded-[6px] border border-border-subtle bg-white px-4 pt-4 pb-3 sm:px-6 sm:pt-5 sm:pb-4">
            <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
              <div>
                <h2 id="heat-h" className="text-[18px] leading-snug font-semibold">
                  Activity, last 365 days
                </h2>
                <p className="mt-0.5 text-[13px] text-content-main tnum">
                  {yearEvents.length
                    ? `${plural(yearEvents.length, "change", "changes")} on ${plural(yearDays, "day", "days")} · latest ${formatDate(yearEvents[0].date)}`
                    : "No changes in the last 365 days"}
                </p>
              </div>
              <span className="flex items-center gap-4 text-[12px] text-content-main">
                {(["low", "medium", "high"] as Severity[]).map((s) => (
                  <span key={s} className="flex items-center gap-1.5">
                    <span className="size-3 rounded-[2px]" style={{ background: CELL[s] }} aria-hidden />
                    {SEVERITY_LABEL[s]}
                  </span>
                ))}
              </span>
            </div>
            <Heatmap
              weeks={53}
              size={18}
              gap={4}
              ariaLabel={`Changes detected for ${m.name} over the last year, coloured by severity. Select a day to filter the change log.`}
              selected={day}
              onSelect={selectDay}
              cell={(d) => {
                const c = byDay.get(d);
                return {
                  fill: CELL[c?.sev ?? "none"],
                  label: c ? `${c.n} change${c.n > 1 ? "s" : ""} · ${SEVERITY_LABEL[c.sev]} · ${formatDate(d)}` : `No changes · ${formatDate(d)}`,
                  active: !!c,
                  dim: !day && range !== "all" && !inRange(d),
                };
              }}
            />
            <p className="mt-1 text-[12px] text-content-tertiary">Select a day to see its changes in the log.</p>
          </section>

          <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
            <section id="change-log" aria-labelledby="log-h" className="min-w-0 scroll-mt-24 self-start overflow-hidden rounded-[6px] border border-border-subtle bg-white">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-3">
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <h2 id="log-h" className="text-[16px] font-semibold">
                    Change log <span className="font-normal text-content-tertiary tnum">({nf.format(log.length)})</span>
                  </h2>
                  {day ? (
                    <span className="inline-flex h-8 items-center gap-1.5 rounded-full border border-border-accent bg-interactive-accent pr-1 pl-3 text-[12px] font-semibold text-interactive-control">
                      {formatDateLong(day)}
                      <button aria-label="Show the date filter again" onClick={() => setDay(null)} className="grid size-6 place-items-center rounded-full hover:bg-interactive-accent-hover">
                        <X className="size-3.5" />
                      </button>
                    </span>
                  ) : (
                    <label className="relative">
                      <span className="sr-only">Date detected</span>
                      <select
                        value={range}
                        onChange={(e) => setRange(e.target.value as LogRange)}
                        className="h-8 appearance-none rounded-[4px] border border-interactive-secondary bg-white pr-8 pl-2.5 text-[13px] text-content-primary hover:border-content-main focus:border-interactive-primary max-sm:h-11 max-sm:text-[16px]"
                      >
                        {RANGES.map((r) => (
                          <option key={r.value} value={r.value}>
                            {r.label}
                          </option>
                        ))}
                      </select>
                      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-content-main" aria-hidden />
                    </label>
                  )}
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1 max-sm:w-full">
                  {reportState === "ready" && <span className="text-[12px] text-interactive-primary">Ready · generated {formatDate(iso(TODAY))}</span>}
                  {freshReport}
                </div>
              </div>
              {log.length === 0 ? (
                <div className="px-5 py-12 text-center">
                  <p className="text-[14px] font-semibold">No changes in this period</p>
                  <p className="mt-1 text-[13px] text-content-main">
                    Nothing was detected {range === "all" ? "yet" : `in ${rangeLabel.toLowerCase()} (${rangeSpan})`}.{" "}
                    {range !== "all" && (
                      <button onClick={() => setRange("all")} className="font-semibold text-content-link hover:underline">
                        Show all time
                      </button>
                    )}
                  </p>
                </div>
              ) : (
                <>
                  <ul className="divide-y divide-border-subtle md:hidden">
                    {log.slice(page * LOG_PAGE, (page + 1) * LOG_PAGE).map((e) => (
                      <li key={e.id} className="px-5 py-3.5">
                        <span className="text-[13px] text-content-main tnum">Detected {formatDate(e.date)}</span>
                        <div className="mt-2">
                          <LogChange categories={e.categories} was={e.detectedSeverity} />
                        </div>
                      </li>
                    ))}
                  </ul>
                  <div className="overflow-x-auto max-md:hidden">
                    <table className="w-full min-w-[520px] text-left text-[13px]">
                      <thead className="border-b border-border-subtle text-[12px] text-content-main">
                        <tr>
                          <th className="w-[140px] px-5 py-2.5 font-semibold">Detected</th>
                          <th className="px-3 pr-5 py-2.5 font-semibold">Change by severity</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border-subtle">
                        {log.slice(page * LOG_PAGE, (page + 1) * LOG_PAGE).map((e) => (
                          <tr key={e.id} className={cx(day === e.date && "bg-interactive-selected")}>
                            <td className="px-5 py-3 whitespace-nowrap tnum">{formatDate(e.date)}</td>
                            <td className="px-3 pr-5 py-3">
                              <LogChange categories={e.categories} was={e.detectedSeverity} />
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </>
              )}
              {pages > 1 && (
                <div className="flex items-center justify-end gap-3 border-t border-border-subtle px-5 py-3 text-[13px] text-content-main">
                  <span className="tnum">
                    Page {page + 1} of {pages}
                  </span>
                  <button aria-label="Previous page" disabled={page === 0} onClick={() => setPage(page - 1)} className="grid size-8 place-items-center rounded-[4px] border border-border-subtle hover:bg-background-subtle disabled:opacity-40">
                    <ChevronLeft className="size-4" />
                  </button>
                  <button aria-label="Next page" disabled={page >= pages - 1} onClick={() => setPage(page + 1)} className="grid size-8 place-items-center rounded-[4px] border border-border-subtle hover:bg-background-subtle disabled:opacity-40">
                    <ChevronRight className="size-4" />
                  </button>
                </div>
              )}
            </section>

            <aside className="lg:sticky lg:top-[80px] lg:self-start">
              <section aria-labelledby="mix-h" aria-live="polite" className="rounded-[6px] border border-border-subtle bg-white p-5">
                <h2 id="mix-h" className="text-[16px] font-semibold">
                  {rangeLabel}
                </h2>
                <p className="text-[12px] text-content-tertiary tnum">
                  {rangeSpan} · {plural(ranged.length, "change", "changes")}
                </p>
                <ul className="mt-4 flex flex-col gap-2.5">
                  {(["high", "medium", "low"] as Severity[]).map((s) => {
                    const total = ranged.length || 1;
                    return (
                      <li key={s} className="grid grid-cols-[72px_minmax(0,1fr)_28px] items-center gap-3 text-[13px]">
                        <span className={cx("font-medium", SEV_STYLE[s].text)}>{SEVERITY_LABEL[s]}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-background-subtle">
                          <span className="block h-full rounded-full transition-[width] duration-300 ease-out-expo" style={{ width: `${(counts[s] / total) * 100}%`, background: CELL[s] }} />
                        </span>
                        <span className="text-right font-semibold tnum">{counts[s]}</span>
                      </li>
                    );
                  })}
                </ul>
                <Link to="/pkyb/settings" className="mt-3 -ml-1 inline-flex h-8 items-center gap-1.5 px-1 text-[13px] font-semibold text-content-link hover:underline">
                  <SlidersHorizontal className="size-3.5" /> Adjust severity mapping
                </Link>
              </section>
            </aside>
          </div>
        </>
      )}

      <StopDialog targets={stopping ? [{ id: m.id, name: m.name }] : []} onClose={() => setStopping(false)} />
      <CreateMonitorDialog company={creating} onClose={() => setCreating(null)} />
      <Dialog
        open={confirmingReport}
        onClose={() => setConfirmingReport(false)}
        width={480}
        labelledBy="fresh-report-title"
        title="Get a fresh KYB Basic report?"
        footer={
          <>
            <Button variant="ghost" onClick={() => setConfirmingReport(false)} data-autofocus="">
              Cancel
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                setConfirmingReport(false);
                requestReport(m.id);
              }}
            >
              Get report · {price}
            </Button>
          </>
        }
      >
        <div className="flex flex-col gap-3 text-[14px] text-content-main">
          <p>
            This uses <span className="font-semibold text-content-primary tnum">{price}</span> for <span className="font-semibold text-content-primary">{m.name}</span>. The report shows the registry's
            current record, so you can compare it with your baseline from {formatDate(m.createdAt)}.
          </p>
          <p>Each fresh report is charged separately.</p>
        </div>
      </Dialog>
    </div>
  );
}

/** A change's categories, tinted by today's severity mapping. When the mapping has moved since detection, the original stays as a note. */
function LogChange({ categories, was }: { categories: Monitor["events"][number]["categories"]; was: Severity }) {
  const { severity } = useStore();
  const now = worstSeverity(categories, severity);
  return (
    <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
      <ChangeChips categories={categories} />
      {was !== now && <span className="text-[11px] whitespace-nowrap text-content-tertiary">Detected as {SEVERITY_LABEL[was]}</span>}
    </span>
  );
}

/**
 * The status badge opens the monitor's own details: when it started, what it costs, and the baseline it compares against.
 * A light popover rather than a panel, so the page leads with activity and the facts are one click from the word "Active".
 */
function MonitorDetails({ m, facts, baselineReady, onDownloadBaseline }: { m: Monitor; facts: Array<[string, ReactNode]>; baselineReady: boolean; onDownloadBaseline: () => void }) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const panelId = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => {
      if (!wrap.current?.contains(e.target as Node)) setOpen(false);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      setOpen(false);
      btn.current?.focus();
    };
    document.addEventListener("pointerdown", away);
    document.addEventListener("keydown", key);
    return () => {
      document.removeEventListener("pointerdown", away);
      document.removeEventListener("keydown", key);
    };
  }, [open]);

  return (
    <div ref={wrap} className="relative">
      <button
        ref={btn}
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => setOpen((o) => !o)}
        className="group -my-1 -ml-1 inline-flex min-h-8 items-center gap-2 rounded-[6px] py-1 pr-1.5 pl-1 hover:bg-background-subtle max-sm:min-h-11"
      >
        <StatusBadge status={m.status} />
        <span className="inline-flex items-center gap-0.5 text-[13px] font-semibold text-content-link group-hover:underline">
          Monitor details
          <ChevronDown className={cx("size-4 transition-transform duration-200 ease-out-expo", open && "rotate-180")} aria-hidden />
        </span>
      </button>
      {open && (
        <div
          id={panelId}
          role="region"
          aria-label="Monitor details"
          className="popover-in absolute top-full left-0 z-30 mt-2 w-[min(340px,calc(100vw-32px))] rounded-[6px] border border-border-subtle bg-white text-[13px] shadow-pop"
        >
          <dl className="divide-y divide-border-subtle">
            {facts.map(([k, v]) => (
              <div key={k} className="flex justify-between gap-4 px-4 py-2.5">
                <dt className="text-content-main">{k}</dt>
                <dd className="text-right font-medium text-content-primary tnum">{v}</dd>
              </div>
            ))}
          </dl>
          {m.status !== "inactive" && (
            <div className="border-t border-border-subtle bg-base-contrast px-4 py-3">
              <p className="text-[12px] font-semibold text-content-main">Baseline report</p>
              <div className="mt-1.5 flex items-center gap-3">
                {baselineReady ? <FileCheck2 className="size-5 shrink-0 text-interactive-primary" aria-hidden /> : <LoaderCircle className="size-5 shrink-0 animate-spin text-content-tertiary" aria-hidden />}
                <div className="min-w-0 flex-1">
                  <p className="font-semibold text-content-primary">KYB Basic</p>
                  <p className="text-[12px] text-content-tertiary tnum">{baselineReady ? `Generated ${formatDate(m.createdAt)}` : "Generating…"}</p>
                </div>
                {baselineReady && (
                  <div className="-mr-2 flex items-center">
                    <Link to={`/reports/${m.id}`} className="inline-flex h-8 items-center px-2 font-semibold text-content-link hover:underline">
                      View
                    </Link>
                    <button onClick={onDownloadBaseline} className="inline-flex h-8 items-center px-2 font-semibold text-content-link hover:underline">
                      Download
                    </button>
                  </div>
                )}
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
