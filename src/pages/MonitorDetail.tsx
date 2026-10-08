import { useEffect, useMemo, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, ChevronLeft, ChevronRight, CircleAlert, CirclePause, Download, Ellipsis, FileCheck2, LoaderCircle, Radar, SlidersHorizontal, X } from "lucide-react";
import { CATEGORY_LABEL, CATEGORY_SECTION, PRICING, RECENT_DAYS, SEVERITY_RANK, TODAY, addDays, creditsLabel, isRecent, iso, jurisdictionByCode, worstSeverity, type Company, type Monitor, type Severity } from "../data/model";
import { useStore } from "../state/store";
import { Heatmap } from "../components/Heatmap";
import { StopDialog } from "../components/StopDialog";
import { CreateMonitorDialog } from "../components/CreateMonitorDialog";
import { StatusBadge } from "./Monitoring";
import { Button, CategoryChip, Dialog, EventSeverity, Flag, Menu, SEV_STYLE, cx, formatDate, formatDateLong, nf } from "../components/ui";

const CELL: Record<Severity | "none", string> = {
  none: "var(--color-background-subtle)",
  low: "var(--color-low-cell)",
  medium: "var(--color-medium-cell)",
  high: "var(--color-high-cell)",
};
const LOG_PAGE = 12;

const asCompany = (m: Monitor): Company => ({ id: m.id, name: m.name, localName: m.localName, regNo: m.regNo, jurisdiction: m.jurisdiction, status: "Registered" });
const plural = (n: number, one: string, many: string) => `${nf.format(n)} ${n === 1 ? one : many}`;

export function MonitorDetail() {
  const { id } = useParams();
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const { monitors, severity, toast, reports, requestReport, queue } = useStore();
  const m = monitors.find((x) => x.id === id);
  const [stopping, setStopping] = useState(false);
  const [creating, setCreating] = useState<Company | null>(null);
  const [confirmingReport, setConfirmingReport] = useState(false);
  const [day, setDay] = useState<string | null>(null);
  const [page, setPage] = useState(0);
  const isNew = params.get("new") === "1";
  const [baselineReady, setBaselineReady] = useState(!isNew);

  useEffect(() => {
    if (baselineReady) return;
    const t = window.setTimeout(() => setBaselineReady(true), 3500);
    return () => window.clearTimeout(t);
  }, [baselineReady]);
  useEffect(() => setPage(0), [day]);

  const yearAgo = iso(addDays(TODAY, -365));
  const stats = useMemo(() => {
    const byDay = new Map<string, { sev: Severity; n: number }>();
    const counts: Record<Severity, number> = { high: 0, medium: 0, low: 0 };
    for (const e of m?.events ?? []) {
      const s = worstSeverity(e.categories, severity);
      if (e.date >= yearAgo) counts[s]++;
      const cur = byDay.get(e.date);
      if (!cur) byDay.set(e.date, { sev: s, n: 1 });
      else byDay.set(e.date, { sev: SEVERITY_RANK[s] > SEVERITY_RANK[cur.sev] ? s : cur.sev, n: cur.n + 1 });
    }
    return { byDay, counts };
  }, [m, severity, yearAgo]);

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
  // The list this company was opened from, so the analyst can step through it.
  const pos = queue ? queue.ids.indexOf(m.id) : -1;
  const inQueue = pos >= 0;
  const nextId = inQueue ? queue!.ids[pos + 1] : undefined;
  const prevId = inQueue && pos > 0 ? queue!.ids[pos - 1] : undefined;
  const backTo = inQueue && queue!.search ? `/pkyb/monitoring?${queue!.search}` : "/pkyb/monitoring";
  // The lead is the most severe recent change, newest first among equals; with nothing recent, the latest change.
  const recent = m.events.filter(isRecent);
  const lead = recent.length
    ? [...recent].sort((a, b) => SEVERITY_RANK[worstSeverity(b.categories, severity)] - SEVERITY_RANK[worstSeverity(a.categories, severity)] || (a.date < b.date ? 1 : -1))[0]
    : (m.events[0] ?? null);
  const leadSev = lead ? worstSeverity(lead.categories, severity) : null;
  const log = day ? m.events.filter((e) => e.date === day) : m.events;
  const pages = Math.max(1, Math.ceil(log.length / LOG_PAGE));
  const reportState = reports[m.id];
  const price = creditsLabel(PRICING.kybBasicCredits);
  const freshReport = (variant: "primary" | "secondary") =>
    reportState === "generating" ? (
      <Button variant={variant} disabled aria-live="polite">
        <LoaderCircle className="size-4 animate-spin" /> Generating fresh report…
      </Button>
    ) : reportState === "ready" ? (
      <Button variant={variant} onClick={() => toast({ title: "Downloading KYB Basic report", body: `${m.name}, generated ${formatDate(iso(TODAY))}.` })}>
        <Download className="size-4" /> Download fresh report
      </Button>
    ) : (
      <Button
        variant={variant}
        onClick={() => setConfirmingReport(true)}
        className="max-sm:h-auto max-sm:min-h-11 max-sm:w-full max-sm:flex-wrap max-sm:py-2 max-sm:whitespace-normal"
      >
        <FileCheck2 className="size-4" /> Get fresh KYB Basic report{" "}
        <span className="font-normal tnum">
          <span className="max-sm:hidden">· </span>
          {price}
        </span>
      </Button>
    );
  const downloadBaseline = () => toast({ title: "Downloading baseline report", body: `KYB Basic for ${m.name}, generated ${formatDate(m.createdAt)}.` });

  // What each status says about the monitor, in the facts panel. Inactive never ran, so it claims no checks, baseline or cost.
  const facts: Array<[string, ReactNode]> =
    m.status === "active"
      ? [
          ["Monitoring since", formatDate(m.createdAt)],
          ["Last checked", formatDate(m.lastChecked)],
          ["Duration", "Until you stop it"],
          ["Cost", `${PRICING.monitorCredits} credits / year`],
        ]
      : m.status === "stopped"
        ? [
            ["Monitoring since", formatDate(m.createdAt)],
            ["Stopped", formatDate(m.endedAt ?? m.lastChecked)],
            ["Last checked", formatDate(m.lastChecked)],
          ]
        : [
            ["Ordered", formatDate(m.createdAt)],
            ["Status", "Setup failed"],
          ];

  const queueArrow = (to: string | undefined, label: string, dir: "prev" | "next") => {
    const Icon = dir === "prev" ? ChevronLeft : ChevronRight;
    const base = "grid size-8 place-items-center rounded-[4px] border border-border-subtle";
    // An unavailable arrow is not a link: it leaves the tab order instead of pointing at "#".
    return to ? (
      <Link to={to} aria-label={label} className={cx(base, "hover:bg-background-subtle")}>
        <Icon className="size-4" />
      </Link>
    ) : (
      <span aria-hidden className={cx(base, "opacity-40")}>
        <Icon className="size-4" />
      </span>
    );
  };

  return (
    <div className="mx-auto max-w-[1360px] px-4 pt-5 pb-16 lg:px-8">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2">
        <Link to={backTo} className="inline-flex h-8 items-center gap-1.5 text-[13px] font-semibold text-content-link hover:underline">
          <ArrowLeft className="size-4" /> Back to {inQueue ? queue!.label : "Monitoring"}
        </Link>
        {inQueue && (
          <nav aria-label="Company list" className="flex items-center gap-1 text-[13px] text-content-main">
            <span className="mr-1 tnum">
              {nf.format(pos + 1)} of {nf.format(queue!.ids.length)}
            </span>
            {queueArrow(prevId && `/pkyb/monitoring/${prevId}`, "Previous company in queue", "prev")}
            {queueArrow(nextId && `/pkyb/monitoring/${nextId}`, "Next company in queue", "next")}
          </nav>
        )}
      </div>

      <header className="mt-4 flex items-start justify-between gap-x-4">
        <div className="min-w-0">
          <div className="flex items-center gap-3">
            <h1 className="text-[26px] leading-tight font-semibold tracking-[-0.015em]">{m.name}</h1>
            <Flag code={m.jurisdiction} className="h-4 w-6 shrink-0" />
          </div>
          {m.localName && <p className="text-[16px] text-content-main">{m.localName}</p>}
          <p className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-[13px] text-content-main">
            <StatusBadge status={m.status} />
            <span>
              {j.regLabel} <span className="tnum">{m.regNo}</span> · {j.name}
            </span>
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {active && (
            <Menu
              label="More monitor actions"
              trigger={<Ellipsis className="size-5" />}
              items={[
                { label: "Severity settings", icon: SlidersHorizontal, onSelect: () => navigate("/pkyb/settings") },
                { label: "Stop monitoring", icon: X, danger: true, onSelect: () => setStopping(true) },
              ]}
            />
          )}
        </div>
      </header>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,1fr)_300px]">
        <div className="flex min-w-0 flex-col gap-6">
          {/* Stopped and Inactive say so first: no checks run, and the way forward is a new monitor. */}
          {!active && (
            <section aria-labelledby="status-h" className="rounded-[6px] border border-border-neutral bg-white p-5 lg:p-6">
              <div className="flex items-center gap-2 text-content-primary">
                {m.status === "inactive" ? <CircleAlert className="size-5 text-content-main" aria-hidden /> : <CirclePause className="size-5 text-content-main" aria-hidden />}
                <h2 id="status-h" className="text-[18px] font-semibold">
                  {m.status === "inactive" ? "Monitoring never started" : `Stopped ${formatDate(m.endedAt ?? m.lastChecked)}`}
                </h2>
              </div>
              <p className="mt-2 max-w-[62ch] text-[14px] text-content-main">
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

          {/* Lead: what needs attention on this company right now. */}
          {m.events.length === 0 ? (
            active && (
              <section aria-labelledby="idle-h" className="rounded-[6px] border border-border-accent bg-interactive-accent/60 p-5 lg:p-6">
                <div className="flex items-center gap-2 text-interactive-control">
                  {baselineReady ? <Radar className="size-5" aria-hidden /> : <LoaderCircle className="size-5 animate-spin" aria-hidden />}
                  <h2 id="idle-h" className="text-[18px] font-semibold">
                    {baselineReady ? "Monitoring is running" : "Setting up your baseline"}
                  </h2>
                </div>
                <p className="mt-2 max-w-[62ch] text-[14px] text-content-main">
                  {baselineReady ? "No changes since the baseline." : "The KYB Basic baseline report is being generated."} Checks run automatically, and you'll be alerted in-app and by
                  email based on your{" "}
                  <Link to="/pkyb/settings" className="font-semibold text-content-link hover:underline">
                    severity settings
                  </Link>
                  . New changes will be listed here.
                </p>
              </section>
            )
          ) : lead && leadSev ? (
            <section aria-labelledby="lead-h" className={cx("rounded-[6px] border bg-white p-5 lg:p-6", SEV_STYLE[leadSev].line)}>
              <div className="flex flex-wrap items-center gap-3">
                <EventSeverity event={lead} />
                <span className="text-[13px] text-content-main">
                  Detected {formatDate(lead.date)}
                  {recent.length > 1 && ` · ${recent.length - 1} more in the last ${RECENT_DAYS} days`}
                </span>
              </div>
              <h2 id="lead-h" className="mt-3 text-[18px] leading-snug font-semibold tracking-[-0.01em]">
                {lead.categories.map((c) => CATEGORY_LABEL[c]).join(" and ")} changed since your baseline
              </h2>
              <p className="mt-1 text-[13px] text-content-main">
                Registry record on {formatDate(lead.date)} compared with your KYB Basic baseline from {formatDate(m.createdAt)}.
              </p>

              <div className="mt-4">
                <p className="text-[12px] font-semibold text-content-main">Where to check in the fresh report</p>
                <ul className="mt-1 divide-y divide-border-subtle border-y border-border-subtle">
                  {lead.categories.map((c) => (
                    <li key={c} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5">
                      <CategoryChip category={c} />
                      <span className="text-[13px] text-content-main">{CATEGORY_SECTION[c]}</span>
                    </li>
                  ))}
                </ul>
              </div>
              <p className="mt-3 max-w-[64ch] text-[13px] text-content-tertiary">
                pKYB tells you which part of the record changed. The fresh report shows the current values to compare with your baseline.
              </p>

              <div className="mt-4 flex flex-wrap items-center gap-3">
                {freshReport("primary")}
                {reportState === "ready" && <span className="text-[12px] text-interactive-primary">Ready · generated {formatDate(iso(TODAY))}</span>}
              </div>
            </section>
          ) : null}

          {m.events.length > 0 && (
            <>
              <section aria-labelledby="heat-h" className="rounded-[6px] border border-border-subtle bg-white p-5">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
                  <h2 id="heat-h" className="text-[16px] font-semibold">
                    Activity, last 365 days
                  </h2>
                  <span className="flex items-center gap-3 text-[11px] text-content-tertiary">
                    {(["low", "medium", "high"] as Severity[]).map((s) => (
                      <span key={s} className="flex items-center gap-1">
                        <span className="size-2.5 rounded-[2px]" style={{ background: CELL[s] }} />
                        {s[0].toUpperCase() + s.slice(1)}
                      </span>
                    ))}
                  </span>
                </div>
                <Heatmap
                  weeks={53}
                  size={12}
                  gap={3}
                  ariaLabel={`Changes detected for ${m.name} over the last year, coloured by severity`}
                  selected={day}
                  onSelect={setDay}
                  cell={(d) => {
                    const c = stats.byDay.get(d);
                    return {
                      fill: CELL[c?.sev ?? "none"],
                      label: c ? `${c.n} change${c.n > 1 ? "s" : ""} · ${c.sev[0].toUpperCase() + c.sev.slice(1)} · ${formatDate(d)}` : `No changes · ${formatDate(d)}`,
                      active: !!c,
                    };
                  }}
                />
                <p className="mt-2 text-[12px] text-content-tertiary">Each day takes the colour of its most severe change. Select a coloured day to filter the log.</p>
              </section>

              <section aria-labelledby="log-h" className="overflow-hidden rounded-[6px] border border-border-subtle bg-white">
                <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle px-5 py-3.5">
                  <h2 id="log-h" className="text-[16px] font-semibold">
                    Change log <span className="font-normal text-content-tertiary tnum">({nf.format(log.length)})</span>
                  </h2>
                  {day && (
                    <span className="inline-flex h-7 items-center gap-1.5 rounded-full border border-border-accent bg-interactive-accent pr-1 pl-3 text-[12px] font-semibold text-interactive-control">
                      {formatDateLong(day)}
                      <button aria-label="Show all dates" onClick={() => setDay(null)} className="grid size-5 place-items-center rounded-full hover:bg-interactive-accent-hover">
                        <X className="size-3" />
                      </button>
                    </span>
                  )}
                </div>
                {log.length === 0 ? (
                  <p className="px-5 py-10 text-center text-[13px] text-content-main">Nothing was detected on this day.</p>
                ) : (
                  <>
                    <ul className="divide-y divide-border-subtle md:hidden">
                      {log.slice(page * LOG_PAGE, (page + 1) * LOG_PAGE).map((e) => (
                        <li key={e.id} className={cx("px-5 py-3.5", lead?.id === e.id && "bg-base-contrast")}>
                          <div className="flex items-center justify-between gap-3">
                            <span className="flex flex-wrap items-center gap-2">
                              <EventSeverity event={e} size="sm" />
                              <span className="text-[13px] tnum text-content-main">{formatDate(e.date)}</span>
                            </span>
                          </div>
                          <div className="mt-2 flex flex-wrap gap-1.5">
                            {e.categories.map((c) => (
                              <CategoryChip key={c} category={c} />
                            ))}
                          </div>
                        </li>
                      ))}
                    </ul>
                    <div className="overflow-x-auto max-md:hidden">
                      <table className="w-full min-w-[520px] text-left text-[13px]">
                        <thead className="border-b border-border-subtle text-[12px] text-content-main">
                          <tr>
                            <th className="px-5 py-2.5 font-semibold">Detected</th>
                            <th className="px-3 py-2.5 font-semibold">Severity</th>
                            <th className="px-3 pr-5 py-2.5 font-semibold">Change category</th>
                          </tr>
                        </thead>
                        <tbody className="divide-y divide-border-subtle">
                          {log.slice(page * LOG_PAGE, (page + 1) * LOG_PAGE).map((e) => (
                            <tr key={e.id} className={cx(lead?.id === e.id && "bg-base-contrast")}>
                              <td className="px-5 py-3 whitespace-nowrap tnum">{formatDate(e.date)}</td>
                              <td className="px-3 py-3">
                                <EventSeverity event={e} size="sm" />
                              </td>
                              <td className="px-3 pr-5 py-3">
                                <span className="flex flex-wrap gap-1.5">
                                  {e.categories.map((c) => (
                                    <CategoryChip key={c} category={c} />
                                  ))}
                                </span>
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
            </>
          )}
        </div>

        <aside className="flex flex-col gap-4 lg:sticky lg:top-[80px] lg:self-start">
          <section aria-labelledby="facts-h" className="rounded-[6px] border border-border-subtle bg-white">
            <h2 id="facts-h" className="border-b border-border-subtle px-5 py-3.5 text-[16px] font-semibold">
              Monitor
            </h2>
            <dl className="divide-y divide-border-subtle text-[13px]">
              {facts.map(([k, v]) => (
                <div key={k} className="flex justify-between gap-4 px-5 py-3">
                  <dt className="text-content-main">{k}</dt>
                  <dd className="text-right font-medium tnum">{v}</dd>
                </div>
              ))}
            </dl>
            {m.status !== "inactive" && (
              <div className="border-t border-border-subtle px-5 py-4">
                <p className="text-[12px] font-semibold text-content-main">Baseline report · attached</p>
                <div className="mt-2 flex items-center gap-3">
                  {baselineReady ? <FileCheck2 className="size-5 shrink-0 text-interactive-primary" aria-hidden /> : <LoaderCircle className="size-5 shrink-0 animate-spin text-content-tertiary" aria-hidden />}
                  <div className="min-w-0 flex-1">
                    <p className="text-[13px] font-semibold">KYB Basic</p>
                    <p className="text-[12px] text-content-tertiary">{baselineReady ? `Generated ${formatDate(m.createdAt)}` : "Generating…"}</p>
                  </div>
                  {baselineReady && (
                    <div className="-mr-2 flex items-center">
                      <Link to={`/reports/${m.id}`} className="inline-flex h-8 items-center px-2 text-[13px] font-semibold text-content-link hover:underline">
                        View
                      </Link>
                      <button onClick={downloadBaseline} className="inline-flex h-8 items-center px-2 text-[13px] font-semibold text-content-link hover:underline">
                        Download
                      </button>
                    </div>
                  )}
                </div>
              </div>
            )}
          </section>

          {m.events.length > 0 && (
            <section aria-labelledby="mix-h" className="rounded-[6px] border border-border-subtle bg-white p-5">
              <h2 id="mix-h" className="text-[16px] font-semibold">
                Last 365 days
              </h2>
              <ul className="mt-3 flex flex-col gap-2.5">
                {(["high", "medium", "low"] as Severity[]).map((s) => {
                  const total = stats.counts.high + stats.counts.medium + stats.counts.low || 1;
                  return (
                    <li key={s} className="grid grid-cols-[72px_minmax(0,1fr)_28px] items-center gap-3 text-[13px]">
                      <span className={cx("font-medium", SEV_STYLE[s].text)}>{s[0].toUpperCase() + s.slice(1)}</span>
                      <span className="h-2 overflow-hidden rounded-full bg-background-subtle">
                        <span className="block h-full rounded-full" style={{ width: `${(stats.counts[s] / total) * 100}%`, background: CELL[s] }} />
                      </span>
                      <span className="text-right font-semibold tnum">{stats.counts[s]}</span>
                    </li>
                  );
                })}
              </ul>
              <Link to="/pkyb/settings" className="mt-3 -ml-1 inline-flex h-8 items-center gap-1.5 px-1 text-[13px] font-semibold text-content-link hover:underline">
                <SlidersHorizontal className="size-3.5" /> Adjust severity mapping
              </Link>
            </section>
          )}
        </aside>
      </div>

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
