import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { ChevronDown, ChevronLeft, ChevronRight, CircleAlert, CirclePause, CircleStop, Download, FileCheck2, FilePlus2, LoaderCircle, Eye, SlidersHorizontal, X } from "lucide-react";
import { PRICING, STATUS_COPY, SEVERITY_LABEL, SEVERITY_RANK, TODAY, addDays, iso, worstSeverity, type Company, type Monitor, type Severity } from "../data/model";
import { useStore } from "../state/store";
import { Heatmap } from "../components/Heatmap";
import { StopDialog } from "../components/StopDialog";
import { CreateMonitorDialog } from "../components/CreateMonitorDialog";
import { useOpenSettings } from "../components/SettingsPanel";
import { StatusBadge } from "./Monitoring";
import { Button, ChangeChips, Flag, SEV_STYLE, cx, formatDate, formatDateLong, nf } from "../components/ui";

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

/**
 * A company's pKYB monitor, shown as the "pKYB Monitoring" tab of its report at `/reports/:id?tab=pkyb`: status,
 * the baseline it compares against, the year's activity and the change log. `onViewBaseline` switches to the report
 * tab when the report on screen is this monitor's baseline; otherwise the baseline opens as its own report.
 */
export function MonitorPanel({ m, onViewBaseline }: { m: Monitor; onViewBaseline?: () => void }) {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { severity, toast, reportOrders } = useStore();
  const openSettings = useOpenSettings();
  const [stopping, setStopping] = useState(false);
  const [creating, setCreating] = useState<Company | null>(null);
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
    for (const e of m.events) {
      const s = worstSeverity(e.categories, severity);
      const cur = out.get(e.date);
      if (!cur) out.set(e.date, { sev: s, n: 1 });
      else out.set(e.date, { sev: SEVERITY_RANK[s] > SEVERITY_RANK[cur.sev] ? s : cur.sev, n: cur.n + 1 });
    }
    return out;
  }, [m, severity]);

  const active = m.status === "active";
  const yearEvents = m.events.filter((e) => e.date >= yearAgo);
  const yearDays = new Set(yearEvents.map((e) => e.date)).size;

  // The date filter drives both the log and the severity summary beside it; a day picked on the grid narrows the log further.
  const ranged = m.events.filter((e) => inRange(e.date));
  const log = day ? m.events.filter((e) => e.date === day) : ranged;
  const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
  for (const e of log) counts[worstSeverity(e.categories, severity)]++;
  const mixTotal = log.length;
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
  // Every KYB Basic held on this company, newest first: the monitor's baseline plus any bought since. Unfulfilled orders produced no report.
  const basics: BasicReport[] = reportOrders
    .filter((o) => o.regNo === m.regNo && o.type === "basic" && o.status !== "unfulfilled")
    .map((o) => ({ id: o.id, date: o.createdAt.slice(0, 10), baseline: o.monitorId === m.id, processing: o.status === "processing" }));
  // Monitors outside the demo order history still have a baseline; it opens from the monitor's id.
  if (m.status !== "inactive" && !basics.some((b) => b.baseline)) basics.push({ id: m.id, date: m.createdAt, baseline: true, processing: false });
  const downloadReport = (b: BasicReport) => toast({ title: "Downloading KYB Basic report", body: `${m.name}, generated ${formatDate(b.date)}.` });

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

  const yearSummary = yearEvents.length
    ? `${plural(yearEvents.length, "change", "changes")} on ${plural(yearDays, "day", "days")} · latest ${formatDate(yearEvents[0].date)}`
    : "No changes in the last 365 days";

  return (
    <div>
      {/* Stopped and Inactive say so first: no checks run, and the way forward is a new monitor. */}
      {!active && (
        <section aria-labelledby="status-h" className="mb-5 rounded-[6px] border border-border-neutral bg-white p-5 lg:p-6">
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
              <Eye className="size-4" /> Create pKYB monitor
            </Button>
            <span className="text-[12px] text-content-tertiary">Starts a new order with a new KYB Basic baseline.</span>
          </div>
        </section>
      )}

      {/* Two columns, as in the report viewer: the monitor's facts in the rail, its activity and change log beside them. */}
      <div className="grid rounded-[8px] border border-border-subtle bg-background-elevated lg:grid-cols-[288px_minmax(0,1fr)]">
        <aside aria-labelledby="details-h" className="border-border-subtle max-lg:border-b lg:border-r">
          <div className="flex flex-col gap-6 p-5 lg:sticky lg:top-[76px] lg:max-h-[calc(100dvh-76px)] lg:overflow-y-auto">
            {/* The monitor's two actions lead the rail, one above the other at the same size. A new report is ordered from Choose a Report. */}
            <div className="flex flex-col gap-2">
              <Button variant="primary" size="sm" onClick={() => navigate(`/report/${m.id}`)} className="w-full max-sm:h-10">
                <FilePlus2 className="size-4" aria-hidden /> Get New KYB Report
              </Button>
              {active && (
                <Button variant="danger-outline" size="sm" onClick={() => setStopping(true)} className="w-full max-sm:h-10">
                  <CircleStop className="size-4" aria-hidden /> Stop monitoring
                </Button>
              )}
            </div>
            <PkybDetails m={m} facts={facts} />
            {basics.length > 0 && <BasicHistory reports={basics} baselineReady={baselineReady} onViewBaseline={onViewBaseline} onDownload={downloadReport} />}
            {m.events.length > 0 && (
              <section aria-labelledby="mix-h" aria-live="polite" className="border-t border-border-subtle pt-5">
                <h2 id="mix-h" className="text-[14px] font-semibold text-content-primary">
                  {day ? formatDateLong(day) : rangeLabel}
                </h2>
                <p className="text-[12px] text-content-tertiary tnum">
                  {day ? plural(log.length, "change", "changes") : `${rangeSpan} · ${plural(ranged.length, "change", "changes")}`}
                </p>
                <ul className="mt-3 flex flex-col gap-2.5">
                  {(["high", "medium", "low"] as Severity[]).map((s) => {
                    const total = mixTotal || 1;
                    return (
                      <li key={s} className="grid grid-cols-[64px_minmax(0,1fr)_28px] items-center gap-3 text-[13px]">
                        <span className={cx("font-medium", SEV_STYLE[s].text)}>{SEVERITY_LABEL[s]}</span>
                        <span className="h-2 overflow-hidden rounded-full bg-background-subtle">
                          <span className="block h-full rounded-full transition-[width] duration-300 ease-out-expo" style={{ width: `${(counts[s] / total) * 100}%`, background: CELL[s] }} />
                        </span>
                        <span className="text-right font-semibold tnum">{counts[s]}</span>
                      </li>
                    );
                  })}
                </ul>
                <button onClick={() => openSettings("severity")} className="mt-3 -ml-1 inline-flex h-8 items-center gap-1.5 px-1 text-[13px] font-semibold text-content-link hover:underline">
                  <SlidersHorizontal className="size-3.5" /> Adjust severity
                </button>
              </section>
            )}
          </div>
        </aside>

        <div className="flex min-w-0 flex-col gap-8 px-4 py-5 lg:px-6">
          {m.events.length === 0 ? (
            active ? (
              <section aria-labelledby="idle-h" className="rounded-[6px] border border-border-accent bg-interactive-accent/60 p-5 lg:p-6">
                <div className="flex items-center gap-2 text-interactive-control">
                  {baselineReady ? <Eye className="size-5" aria-hidden /> : <LoaderCircle className="size-5 animate-spin" aria-hidden />}
                  <h2 id="idle-h" className="text-[18px] font-semibold">
                    {baselineReady ? "Monitoring is running" : "Setting up your baseline"}
                  </h2>
                </div>
                <p className="mt-2 max-w-[64ch] text-[14px] text-content-main">
                  {baselineReady ? "No changes since the baseline." : "The KYB Basic baseline report is being generated."} Checks run automatically, and you'll be alerted in-app and by email
                  based on your settings in{" "}
                  <button onClick={() => openSettings("notifications")} className="font-semibold text-content-link hover:underline">
                    Severity & alerts
                  </button>
                  . New changes will be listed here.
                </p>
              </section>
            ) : (
              <p className="py-10 text-center text-[13px] text-content-main">No changes were recorded for this company.</p>
            )
          ) : (
            <>
              {/* The year at a glance leads the content column: when things changed, and how badly, before any row of the log. */}
              <section aria-labelledby="heat-h">
                <div className="mb-3 flex flex-wrap items-end justify-between gap-x-6 gap-y-2">
                  <div>
                    <h2 id="heat-h" className="text-[18px] leading-snug font-semibold">
                      Activity, last 365 days
                    </h2>
                    <p className="mt-0.5 text-[13px] text-content-main tnum">{yearSummary}</p>
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
                <div className="rounded-[6px] border border-border-subtle bg-white px-3 pt-3 pb-2 sm:px-4">
                  <Heatmap
                    weeks={53}
                    size={12}
                    gap={3}
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
                </div>
                <p className="mt-1.5 text-[12px] text-content-tertiary">Select a day to see its changes in the log.</p>
              </section>

              <section id="change-log" aria-labelledby="log-h" className="min-w-0 scroll-mt-24">
                <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <h2 id="log-h" className="text-[18px] leading-snug font-semibold">
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
                </div>
                <div className="overflow-hidden rounded-[6px] border border-border-subtle bg-white">
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
                          <li key={e.id} className="px-4 py-3.5">
                            <span className="text-[13px] text-content-main tnum">Detected {formatDate(e.date)}</span>
                            <div className="mt-2">
                              <LogChange categories={e.categories} was={e.detectedSeverity} />
                            </div>
                          </li>
                        ))}
                      </ul>
                      <div className="overflow-x-auto max-md:hidden">
                        <table className="w-full min-w-[520px] text-left text-[13px]">
                          <thead className="border-b border-border-subtle bg-background-subtle text-[12px] text-content-primary">
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
                </div>
              </section>
            </>
          )}
        </div>
      </div>

      <StopDialog targets={stopping ? [{ id: m.id, name: m.name }] : []} onClose={() => setStopping(false)} />
      <CreateMonitorDialog company={creating} onClose={() => setCreating(null)} />
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

/** The rail's pKYB Details: status, what the monitor costs and how long it runs. */
function PkybDetails({ m, facts }: { m: Monitor; facts: Array<[string, ReactNode]> }) {
  return (
    <section aria-labelledby="details-h">
      <div className="flex items-center justify-between gap-3">
        <h2 id="details-h" className="font-sans text-[13px] font-normal text-content-main uppercase">
          pKYB Details
        </h2>
        <StatusBadge status={m.status} />
      </div>
      <p className="mt-2 text-[12px] leading-snug text-content-tertiary">{STATUS_COPY[m.status].explain}</p>
      <dl className="mt-4 divide-y divide-border-subtle border-y border-border-subtle text-[13px]">
        {facts.map(([k, v]) => (
          <div key={k} className="flex justify-between gap-4 py-2.5">
            <dt className="text-content-main">{k}</dt>
            <dd className="text-right font-medium text-content-primary tnum">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
  );
}

type BasicReport = { id: string; date: string; baseline: boolean; processing: boolean };
const HISTORY_PREVIEW = 4;

/**
 * Every KYB Basic held on the company, newest first. The monitor compares against the one tagged Baseline; the rest
 * were bought since, and stay listed so they aren't lost behind the baseline. Long histories collapse to the latest few.
 */
function BasicHistory({
  reports,
  baselineReady,
  onViewBaseline,
  onDownload,
}: {
  reports: BasicReport[];
  baselineReady: boolean;
  onViewBaseline?: () => void;
  onDownload: (b: BasicReport) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const shown = expanded ? reports : reports.slice(0, HISTORY_PREVIEW);
  const iconAction = "grid size-8 shrink-0 place-items-center rounded-[4px] text-content-main transition-colors hover:bg-interactive-accent hover:text-interactive-primary max-sm:size-10";
  return (
    <section aria-labelledby="history-h" className="border-t border-border-subtle pt-5">
      <h2 id="history-h" className="text-[14px] font-semibold text-content-primary">
        KYB Basic History <span className="font-normal text-content-tertiary tnum">({nf.format(reports.length)})</span>
      </h2>
      <ul className="mt-2 divide-y divide-border-subtle">
        {shown.map((b) => {
          const pending = b.processing || (b.baseline && !baselineReady);
          return (
            <li key={b.id} className="flex items-center gap-3 py-2.5">
              {pending ? <LoaderCircle className="size-5 shrink-0 animate-spin text-content-tertiary" aria-hidden /> : <FileCheck2 className="size-5 shrink-0 text-interactive-primary" aria-hidden />}
              <div className="min-w-0 flex-1">
                <p className="flex flex-wrap items-center gap-x-2 gap-y-0.5 text-[14px] font-semibold text-content-primary">
                  KYB Basic
                  {b.baseline && (
                    <span className="inline-flex h-5 items-center rounded-full bg-interactive-primary px-2 text-[11px] font-semibold text-white">Baseline</span>
                  )}
                </p>
                <p className="text-[12px] text-content-tertiary tnum">{pending ? "Generating…" : `Generated ${formatDate(b.date)}`}</p>
              </div>
              {!pending && (
                <span className="flex shrink-0 items-center">
                  {b.baseline && onViewBaseline ? (
                    <button onClick={onViewBaseline} aria-label={`View KYB Basic from ${formatDate(b.date)}`} title="View" className={iconAction}>
                      <Eye className="size-4" aria-hidden />
                    </button>
                  ) : (
                    <Link to={`/reports/${b.id}`} aria-label={`View KYB Basic from ${formatDate(b.date)}`} title="View" className={iconAction}>
                      <Eye className="size-4" aria-hidden />
                    </Link>
                  )}
                  <button onClick={() => onDownload(b)} aria-label={`Download KYB Basic from ${formatDate(b.date)}`} title="Download" className={iconAction}>
                    <Download className="size-4" aria-hidden />
                  </button>
                </span>
              )}
            </li>
          );
        })}
      </ul>
      {reports.length > HISTORY_PREVIEW && (
        <button onClick={() => setExpanded(!expanded)} className="mt-1 -ml-1 inline-flex h-8 items-center gap-1.5 px-1 text-[13px] font-semibold text-content-link hover:underline">
          {expanded ? "Show fewer" : `Show all ${nf.format(reports.length)}`}
          <ChevronDown className={cx("size-3.5 transition-transform", expanded && "rotate-180")} aria-hidden />
        </button>
      )}
    </section>
  );
}
