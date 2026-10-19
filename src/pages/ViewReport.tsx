import { useEffect, useMemo, useRef, useState, type KeyboardEvent, type ReactNode } from "react";
import { Link, useLocation, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowLeft, BadgeCheck, ChevronLeft, ChevronRight, ChevronUp, ChevronsLeft, ChevronsRight, CircleHelp, Download, Eye, FilePlus2, ScanSearch, Share2, type LucideIcon } from "lucide-react";
import { PKYB_UNSUPPORTED, REPORT_TYPE_LABEL, STATUS_COPY, jurisdictionByCode, reportFacts, type Company, type Monitor, type ReportFacts, type ReportOrder } from "../data/model";
import { useStore } from "../state/store";
import { Button, Flag, cx, formatDate, nf } from "../components/ui";
import { CreateMonitorDialog } from "../components/CreateMonitorDialog";
import { MonitorPanel } from "./MonitorPanel";

/** What a report is about, and when it was pulled. `m.id` seeds the demo registry record, so a report reads the same on every visit. */
type Subject = Pick<Monitor, "id" | "name" | "localName" | "regNo" | "jurisdiction" | "createdAt">;

type Section = { id: string; label: string; page: number; desc: string; children?: Array<{ id: string; label: string; desc: string }> };

// Section names and order follow the Portal's KYB Basic report viewer.
// `desc` is the hover note beside each entry in Jump to section, as the Portal shows it.
const SECTIONS: Section[] = [
  { id: "cover", label: "Cover Page", page: 1, desc: "The report cover: company name, jurisdiction and generation date." },
  { id: "risk-overview", label: "Risk Overview", page: 2, desc: "A summary of the registry record at a glance." },
  {
    id: "company",
    label: "Company Information",
    page: 2,
    desc: "Registration details, business activity and capital.",
    children: [
      { id: "company-registration", label: "Basic Information", desc: "Names, registration numbers, status, type and address." },
      { id: "company-activity", label: "Business Activity", desc: "The company's registered principal activity." },
      { id: "company-capital", label: "Capital", desc: "Registered or issued share capital." },
    ],
  },
  { id: "directors", label: "Directors & Officers", page: 3, desc: "People appointed to run the company, with their roles." },
  { id: "shareholders", label: "Shareholders", page: 3, desc: "Individuals and companies holding shares, with their stakes." },
  { id: "joint-shareholders", label: "Joint Shareholders", page: 3, desc: "Shares held jointly by more than one party." },
  { id: "risk-assessment", label: "Risk Assessment", page: 3, desc: "Registry-based indicators such as company age and recent officer changes." },
  { id: "ubo", label: "UBO (Ultimate Beneficial Owner)", page: 3, desc: "Individuals holding 25% or more of the company directly." },
  { id: "history", label: "Historical Changes", page: 3, desc: "Changes recorded in the registry before this report." },
  { id: "branches", label: "Branches", page: 3, desc: "Registered branch offices operating under the same business license in different locations." },
  { id: "legal-alerts", label: "Legal Alerts", page: 3, desc: "Litigation and enforcement records found in registry sources." },
  { id: "sources", label: "Data Source & Disclaimers", page: 3, desc: "Where the data came from and the limits of this report." },
];
const PAGES = 3;
const pageOf = (id: string) => SECTIONS.find((s) => s.id === id || s.children?.some((c) => c.id === id))?.page ?? 1;

/**
 * A completed report from View Reports, at `/reports/:orderId`. A pKYB monitor's id also resolves here, to the
 * KYB Basic baseline the monitor was ordered with, so every "View baseline" link keeps working. The company's monitor
 * is the report's last tab (`?tab=pkyb`), so a monitor never has a page of its own.
 */
export function ViewReport() {
  const { id } = useParams();
  const { monitors, reportOrders } = useStore();
  const byOrder = reportOrders.find((o) => o.id === id);
  const monitor = monitors.find((x) => x.id === (byOrder?.monitorId ?? id));
  const order: ReportOrder | undefined =
    byOrder ??
    reportOrders.find((o) => o.monitorId === id) ??
    (monitor && monitor.status !== "inactive"
      ? {
          id: monitor.id,
          orderNo: "",
          createdAt: monitor.createdAt,
          companyName: monitor.name,
          localName: monitor.localName,
          regNo: monitor.regNo,
          jurisdiction: monitor.jurisdiction,
          user: "Me",
          type: "basic",
          status: "completed",
          aml: false,
          monitorId: monitor.id,
        }
      : undefined);

  // Setup failed before the baseline was generated: there is no report to show, only the monitor's own tab.
  if (!order && monitor?.status === "inactive") {
    const subject: Subject = { id: monitor.id, name: monitor.name, localName: monitor.localName, regNo: monitor.regNo, jurisdiction: monitor.jurisdiction, createdAt: monitor.createdAt };
    return <Report m={subject} monitor={monitor} />;
  }
  if (!order || order.status !== "completed") {
    const title = order?.status === "processing" ? "This report is still being prepared" : order?.status === "unfulfilled" ? "This report couldn't be fulfilled" : "We couldn't find that report";
    const body =
      order?.status === "processing"
        ? "We're retrieving the registry record. It opens from View Reports once it's completed."
        : order?.status === "unfulfilled"
          ? "The registry couldn't supply this report, so no credits were charged."
          : "The link may be out of date. Find the report in View Reports.";
    return (
      <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
        <p className="text-[16px] font-semibold">{title}</p>
        <p className="mt-1 text-[14px] text-content-main">{body}</p>
        <Link to="/reports" className="mt-4 inline-block font-semibold text-content-link hover:underline">
          Go to View Reports
        </Link>
      </div>
    );
  }
  const subject: Subject = {
    // Baselines seed from the monitor, so the baseline reads the same from the monitor page and from View Reports.
    id: order.monitorId ?? order.id,
    name: order.companyName,
    localName: order.localName,
    regNo: order.regNo,
    jurisdiction: order.jurisdiction,
    createdAt: order.createdAt.slice(0, 10),
  };
  // The company's monitor: the one this report is the baseline of, or any running monitor on the same registration.
  const linked = (order.monitorId && monitor) || monitors.find((x) => x.regNo === order.regNo && x.status === "active");
  return <Report m={subject} order={order} monitor={linked || undefined} />;
}

// The report row's tabs, in the Portal's order. Each language of a report is its own tab.
const REPORT_TABS = [
  { lang: "en", label: "KYB Report [EN]" },
  { lang: "og", label: "KYB Report [OG]" },
] as const;

type ViewTab = "en" | "og" | "pkyb";

/** `order` is absent only for a monitor whose setup failed: the page then holds just the pKYB tab. */
function Report({ m, order, monitor }: { m: Subject; order?: ReportOrder; monitor?: Monitor }) {
  const { toast } = useStore();
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const fromMonitoring = (location.state as { from?: string } | null)?.from === "monitoring";
  const facts = useMemo(() => reportFacts(m), [m]);
  const [page, setPage] = useState(1);
  const [active, setActive] = useState("cover");
  const [companyOpen, setCompanyOpen] = useState(true);
  const [lang, setLang] = useState<"en" | "og">("en");
  const onPkyb = !!monitor && (!order || params.get("tab") === "pkyb");
  const tab: ViewTab = onPkyb ? "pkyb" : lang;
  // Switching tabs rewrites the query in place: the tab is shareable, but Back still leaves the page.
  const pickTab = (next: ViewTab) => {
    const q = new URLSearchParams(params);
    if (next === "pkyb") q.set("tab", "pkyb");
    else {
      q.delete("tab");
      setLang(next);
    }
    setParams(q, { replace: true, state: location.state });
  };
  const pending = useRef<string | null>(null);
  // A section picked from the rail stays highlighted until the reader scrolls on their own, even when the page
  // is too short to bring it to the top.
  const picked = useRef(false);
  const showLocal = lang === "og" && !!m.localName;

  const jump = (sectionId: string) => {
    pending.current = sectionId;
    picked.current = true;
    setActive(sectionId);
    setPage(pageOf(sectionId));
  };
  const goPage = (p: number) => {
    const next = Math.min(PAGES, Math.max(1, p));
    jump(SECTIONS.find((s) => s.page === next)!.id);
  };

  // After a page change, bring the requested section to the top of the viewport.
  useEffect(() => {
    const target = pending.current;
    if (!target) return;
    pending.current = null;
    const el = document.getElementById(`sec-${target}`);
    el?.scrollIntoView({ block: "start" });
  }, [page, active]);

  // Keep "Jump to section" in step with what the reader is looking at: the last section whose heading has
  // passed under the top bar. A parent with subsections has no visible heading, so only its subsections count.
  useEffect(() => {
    const ids = SECTIONS.filter((s) => s.page === page).flatMap((s) => s.children?.map((c) => c.id) ?? [s.id]);
    const onScroll = () => {
      if (picked.current) return;
      let current = ids[0];
      for (const sid of ids) {
        const el = document.getElementById(`sec-${sid}`);
        if (el && el.getBoundingClientRect().top <= 140) current = sid;
      }
      setActive(current);
    };
    const release = () => {
      picked.current = false;
    };
    const intents = ["wheel", "touchmove", "keydown"] as const;
    window.addEventListener("scroll", onScroll, { passive: true });
    intents.forEach((e) => window.addEventListener(e, release, { passive: true }));
    return () => {
      window.removeEventListener("scroll", onScroll);
      intents.forEach((e) => window.removeEventListener(e, release));
    };
  }, [page]);

  const name = showLocal ? m.localName! : m.name;
  const monitoring = monitor?.status === "active";
  const reportName = REPORT_TYPE_LABEL[order?.type ?? "basic"];
  const [creating, setCreating] = useState<Company | null>(null);
  const { createMonitor } = useStore();
  const navigate = useNavigate();
  const canCreate = !monitoring && !PKYB_UNSUPPORTED.has(m.jurisdiction);
  const asCompany: Company = { id: m.id, name: m.name, localName: m.localName, regNo: m.regNo, jurisdiction: m.jurisdiction, status: "Registered" };
  const startMonitor = () => {
    const created = createMonitor(asCompany);
    toast({ title: "Report generated and monitoring started", body: `This new KYB Basic report is the baseline for ${m.name}. Later changes are compared against it.` });
    navigate(`/reports/${created.id}`);
  };
  // Arrow keys move along the tab strip, as in any tablist; Tab leaves it for the open panel.
  const tabKeys = (e: KeyboardEvent<HTMLDivElement>) => {
    if (!["ArrowLeft", "ArrowRight", "Home", "End"].includes(e.key)) return;
    const tabOrder: ViewTab[] = [...(order ? (["en", "og"] as ViewTab[]) : []), ...(monitor ? (["pkyb"] as ViewTab[]) : [])];
    const i = tabOrder.indexOf(tab);
    const next = e.key === "Home" ? 0 : e.key === "End" ? tabOrder.length - 1 : (i + (e.key === "ArrowRight" ? 1 : -1) + tabOrder.length) % tabOrder.length;
    e.preventDefault();
    pickTab(tabOrder[next]);
    requestAnimationFrame(() => document.getElementById(`tab-${tabOrder[next]}`)?.focus());
  };
  const notInPrototype = (what: string) => toast({ title: what, body: "Not part of this prototype." });

  return (
    <div className="px-4 pt-8 pb-16 sm:px-6 lg:px-8">
      <Link
        to={fromMonitoring ? "/pkyb/monitoring" : "/reports"}
        className="-ml-1 mb-3 inline-flex h-8 items-center gap-1.5 rounded-[4px] px-1 text-[13px] font-semibold text-content-link hover:underline"
      >
        <ArrowLeft className="size-4" aria-hidden /> {fromMonitoring ? "Overview" : "View Reports"}
      </Link>
      {/* Portal2 report header: name line, registration line, then a hairline. */}
      <header className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3 border-b border-portal-line pb-4">
        <div className="min-w-0">
          <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-heading text-[18px] leading-tight font-bold text-content-primary">
            <span>{m.name}</span>
            {m.localName && (
              <>
                <span aria-hidden>|</span>
                <span lang="zh">{m.localName}</span>
              </>
            )}
            <Flag code={m.jurisdiction} className="ml-2 h-4 w-6 shrink-0" />
          </h1>
          <p className="mt-3 flex flex-wrap gap-x-3 gap-y-1 text-[14px] text-content-main uppercase">
            <span>
              Business Registration No. <span className="tnum">{m.regNo}</span>
            </span>
            <span aria-hidden className="text-border-neutral">
              |
            </span>
            <span>{order ? reportName : jurisdictionByCode[m.jurisdiction].name}</span>
            {order?.orderNo && (
              <>
                <span aria-hidden className="text-border-neutral">
                  |
                </span>
                <span>
                  Order No. <span className="tnum">{order.orderNo}</span>
                </span>
              </>
            )}
          </p>
        </div>
        {/* No running monitor on this company: offer one, confirmed in the order dialog (Version B) that prices the monitor and its KYB Basic baseline. */}
        {canCreate && (
          <Button variant="secondary" size="sm" onClick={() => setCreating(asCompany)}>
            <Eye className="size-4" aria-hidden /> Create pKYB
          </Button>
        )}
      </header>

      {/* One tab strip for the company: each language of the report, then its pKYB monitor. The monitor tab keeps
          its radar and status so it reads as pKYB, but selects like the others. */}
      <div className="mt-5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <span id="reports-h" className="mr-3 text-[14px] font-bold text-content-primary">
          View Report(s):
        </span>
        <div role="tablist" aria-labelledby="reports-h" onKeyDown={tabKeys} className="flex flex-wrap items-center gap-3">
          {order &&
            REPORT_TABS.map((t) => {
              const on = tab === t.lang;
              return (
                <button
                  key={t.lang}
                  role="tab"
                  id={`tab-${t.lang}`}
                  aria-selected={on}
                  aria-controls="report-panel"
                  tabIndex={on ? 0 : -1}
                  onClick={() => pickTab(t.lang)}
                  className={cx(
                    "inline-flex h-8 items-center rounded-[4px] border px-4 text-[13px] font-semibold transition-colors max-sm:h-10",
                    on
                      ? "border-portal-pill-selected bg-portal-pill-selected text-white"
                      : "border-border-subtle bg-portal-line text-content-main hover:border-border-neutral hover:text-content-primary",
                  )}
                >
                  {t.label}
                </button>
              );
            })}
          {order && monitor && <span className="h-5 w-px bg-border-neutral max-sm:hidden" aria-hidden />}
          {monitor && (
            <button
              role="tab"
              id="tab-pkyb"
              aria-selected={onPkyb}
              aria-controls="pkyb-panel"
              tabIndex={onPkyb ? 0 : -1}
              onClick={() => pickTab("pkyb")}
              className={cx(
                "inline-flex h-8 items-center gap-2 rounded-[4px] border pr-3 pl-3 text-[13px] font-semibold transition-colors max-sm:h-10",
                onPkyb
                  ? "border-portal-pill-selected bg-portal-pill-selected text-white"
                  : "border-border-accent bg-interactive-accent text-interactive-control hover:border-interactive-primary hover:bg-interactive-accent-hover",
              )}
            >
              <Eye className={cx("size-4", onPkyb ? "text-white" : "text-interactive-primary")} aria-hidden />
              pKYB Monitoring
              <span className={cx("inline-flex items-center gap-1.5 border-l pl-2 text-[12px] font-medium", onPkyb ? "border-white/30 text-white/85" : "border-border-accent text-interactive-primary")}>
                <span
                  className={cx(
                    "size-1.5 rounded-full",
                    monitoring ? (onPkyb ? "bg-chrome-accent" : "bg-interactive-primary") : onPkyb ? "bg-white/60" : "bg-content-tertiary",
                  )}
                  aria-hidden
                />
                {STATUS_COPY[monitor.status].label}
              </span>
            </button>
          )}
        </div>
      </div>

      {onPkyb && monitor && (
        <div role="tabpanel" id="pkyb-panel" aria-labelledby="tab-pkyb" className="mt-5">
          <MonitorPanel m={monitor} onViewBaseline={order?.monitorId === monitor.id ? () => pickTab("en") : undefined} />
        </div>
      )}

      {!onPkyb && order && (
        <div role="tabpanel" id="report-panel" aria-labelledby={`tab-${lang}`} className="mt-5 rounded-[8px] border border-border-subtle bg-background-elevated">
          {/* Report actions and paging, as on the Portal's report viewer. */}
          <div className="relative grid gap-5 border-b border-border-neutral py-5 pl-5 max-xl:pr-14 sm:grid-cols-2 sm:pl-8 xl:pr-8 xl:grid-cols-[repeat(3,minmax(0,1fr))_auto] xl:items-end xl:gap-7">
            <ToolAction icon={FilePlus2} title="Add UBO Report / Legal Documents" action="Select report type" onClick={() => notInPrototype("Add UBO Report / Legal Documents")} />
            <ToolAction
              icon={ScanSearch}
              title="Add / Update AML Report"
              help="Screen this company against sanctions, PEP and adverse media records."
              action="Configure AML report"
              onClick={() => notInPrototype("Add / Update AML Report")}
            />
            <ToolAction
              icon={Download}
              title="Download Report"
              action="Download PDF report"
              onClick={() => toast({ title: `Downloading ${reportName} report`, body: `${m.name} · generated ${formatDate(facts.generated)}` })}
            />
            <div className="flex flex-col items-start gap-3 sm:items-end">
              <button
                aria-label="Share report"
                onClick={() => notInPrototype("Share report")}
                className="grid size-9 place-items-center rounded-[4px] text-content-primary hover:bg-background-subtle max-xl:absolute max-xl:top-4 max-xl:right-4"
              >
                <Share2 className="size-6" strokeWidth={1.5} aria-hidden />
              </button>
              <nav aria-label="Report pages" className="flex items-center gap-3">
                <span className="text-[14px] whitespace-nowrap text-content-primary tnum" aria-live="polite">
                  Page {page} of {PAGES}
                </span>
                <div className="flex gap-1.5">
                  <PageBtn label="First page" disabled={page === 1} onClick={() => goPage(1)}>
                    <ChevronsLeft className="size-4" />
                  </PageBtn>
                  <PageBtn label="Previous page" disabled={page === 1} onClick={() => goPage(page - 1)}>
                    <ChevronLeft className="size-4" />
                  </PageBtn>
                  <PageBtn label="Next page" disabled={page === PAGES} onClick={() => goPage(page + 1)}>
                    <ChevronRight className="size-4" />
                  </PageBtn>
                  <PageBtn label="Last page" disabled={page === PAGES} onClick={() => goPage(PAGES)}>
                    <ChevronsRight className="size-4" />
                  </PageBtn>
                </div>
              </nav>
            </div>
          </div>

          <div className="grid lg:grid-cols-[288px_minmax(0,1fr)]">
            {/* Jump to section */}
            <aside className="border-border-subtle max-lg:border-b lg:border-r">
              <div className="lg:sticky lg:top-[76px] lg:max-h-[calc(100dvh-76px)] lg:overflow-y-auto">
                <div className="px-4 py-4 lg:hidden">
                  <label htmlFor="jump" className="mb-1 block text-[12px] font-medium text-content-main">
                    Jump to section
                  </label>
                  <select
                    id="jump"
                    value={active}
                    onChange={(e) => jump(e.target.value)}
                    className="h-11 w-full rounded-[4px] border border-interactive-secondary bg-white px-2.5 text-[16px] text-content-primary"
                  >
                    {SECTIONS.map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.label}
                      </option>
                    ))}
                  </select>
                </div>

                <nav aria-labelledby="jump-h" className="py-5 pr-4 pl-2 max-lg:hidden">
                  <h2 id="jump-h" className="px-2 pb-3 font-sans text-[13px] font-normal text-content-main uppercase">
                    Jump to section
                  </h2>
                  <ul className="flex flex-col gap-1">
                    {SECTIONS.map((s) => {
                      const self = active === s.id;
                      const holdsActive = !!s.children?.some((c) => c.id === active);
                      return (
                        <li key={s.id}>
                          <div className="relative flex items-center">
                            <RailItem
                              id={s.id}
                              desc={s.desc}
                              current={self || holdsActive}
                              onClick={() => jump(s.children?.[0].id ?? s.id)}
                              className={cx(
                                s.children && "pr-10",
                                self ? RAIL_ACTIVE : holdsActive ? "font-semibold text-content-link hover:bg-interactive-selected" : RAIL_IDLE,
                              )}
                            >
                              {s.label}
                            </RailItem>
                            {s.children && (
                              <button
                                onClick={() => setCompanyOpen((o) => !o)}
                                aria-expanded={companyOpen}
                                aria-label={`${companyOpen ? "Hide" : "Show"} ${s.label} subsections`}
                                className="absolute right-1 grid size-8 place-items-center rounded-[4px] text-content-primary hover:bg-background-subtle"
                              >
                                <ChevronUp className={cx("size-4 transition-transform", !companyOpen && "rotate-180")} />
                              </button>
                            )}
                          </div>
                          {s.children && companyOpen && (
                            <ul className="mt-1 ml-2 flex flex-col gap-1 border-l border-border-subtle">
                              {s.children.map((c) => (
                                <li key={c.id}>
                                  <RailItem
                                    id={c.id}
                                    desc={c.desc}
                                    current={active === c.id}
                                    onClick={() => jump(c.id)}
                                    className={cx("pl-5", active === c.id ? RAIL_ACTIVE : RAIL_IDLE)}
                                  >
                                    {c.label}
                                  </RailItem>
                                </li>
                              ))}
                            </ul>
                          )}
                        </li>
                      );
                    })}
                  </ul>
                </nav>
              </div>
            </aside>

            {/* Report pages */}
            <div className="min-w-0 px-4 py-4 lg:px-6">
              {page === 1 && (
                <ReportSection id="cover" title="Cover Page">
                  <Cover m={m} facts={facts} name={name} showLocal={showLocal} reportName={reportName} />
                </ReportSection>
              )}
              {page === 2 && <PageTwo m={m} facts={facts} reportName={reportName} screened={order.aml || order.type === "complete"} />}
              {page === 3 && <PageThree m={m} facts={facts} tracked={!!order.monitorId && monitoring} />}

              <div className="mt-10 flex items-center justify-between border-t border-border-subtle pt-3">
                <button
                  onClick={() => goPage(page - 1)}
                  disabled={page === 1}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[4px] px-2 text-[13px] font-semibold whitespace-nowrap text-content-main hover:bg-background-subtle hover:text-content-primary disabled:invisible"
                >
                  <ChevronLeft className="size-4" /> Previous page
                </button>
                <span className="text-[12px] whitespace-nowrap text-content-tertiary tnum max-sm:hidden">
                  Page {page} of {PAGES}
                </span>
                <button
                  onClick={() => goPage(page + 1)}
                  disabled={page === PAGES}
                  className="inline-flex h-9 items-center gap-1.5 rounded-[4px] px-2 text-[13px] font-semibold whitespace-nowrap text-interactive-primary hover:bg-interactive-accent disabled:invisible"
                >
                  Next page <ChevronRight className="size-4" />
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
      <CreateMonitorDialog company={creating} onClose={() => setCreating(null)} order={{ extras: [], onConfirm: startMonitor }} />
    </div>
  );
}

/** One report action in the toolbar: an icon and title over an outlined button, as the Portal lays them out. */
function ToolAction({ icon: Icon, title, help, action, onClick }: { icon: LucideIcon; title: string; help?: string; action: string; onClick: () => void }) {
  return (
    <div className="flex min-w-0 flex-col gap-3">
      <p className="flex items-center gap-3 text-[14px] font-bold text-content-primary">
        <Icon className="size-8 shrink-0" strokeWidth={1.5} aria-hidden />
        <span className="min-w-0">{title}</span>
        {help && (
          <span className="group relative inline-flex">
            <button type="button" aria-label={`About ${title}`} className="grid size-6 place-items-center rounded-full text-content-tertiary hover:text-content-primary">
              <CircleHelp className="size-4" aria-hidden />
            </button>
            <span
              role="tooltip"
              className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-[240px] -translate-x-1/2 rounded-[4px] bg-background-demoted px-3 py-2 text-[12px] leading-snug font-normal text-white shadow-pop group-focus-within:block group-hover:block"
            >
              {help}
            </span>
          </span>
        )}
      </p>
      <Button onClick={onClick} className="w-full uppercase">
        {action}
      </Button>
    </div>
  );
}

const RAIL_ACTIVE =
  "bg-interactive-selected font-semibold text-content-link before:absolute before:inset-y-0 before:left-0 before:w-[3px] before:bg-content-link";
const RAIL_IDLE = "text-content-primary hover:bg-interactive-selected";

/**
 * A Jump to section entry. Hover or keyboard focus shows the section's note beside the rail. The note is
 * fixed-positioned from the entry's rect, because the rail scrolls and would clip anything that overhangs it.
 */
function RailItem({
  id,
  desc,
  current,
  onClick,
  className,
  children,
}: {
  id: string;
  desc: string;
  current: boolean;
  onClick: () => void;
  className?: string;
  children: ReactNode;
}) {
  const [tip, setTip] = useState<{ top: number; left: number } | null>(null);
  const show = (el: HTMLElement) => {
    const r = el.getBoundingClientRect();
    setTip({ top: r.top + r.height / 2, left: r.right + 12 });
  };
  const hide = () => setTip(null);
  return (
    <>
      <button
        onClick={onClick}
        onMouseEnter={(e) => show(e.currentTarget)}
        onMouseLeave={hide}
        onFocus={(e) => e.currentTarget.matches(":focus-visible") && show(e.currentTarget)}
        onBlur={hide}
        aria-current={current ? "location" : undefined}
        aria-describedby={`tip-${id}`}
        className={cx("relative flex min-h-10 flex-1 items-center px-3 py-2 text-left text-[13px] transition-colors", className)}
      >
        {children}
      </button>
      <span
        id={`tip-${id}`}
        role="tooltip"
        hidden={!tip}
        style={tip ? { top: tip.top, left: tip.left } : undefined}
        className="pointer-events-none fixed z-30 w-max max-w-[420px] -translate-y-1/2 rounded-[4px] bg-background-demoted px-3 py-2 text-[12px] leading-snug text-white shadow-pop"
      >
        {desc}
      </span>
    </>
  );
}

function PageBtn({ label, children, ...rest }: { label: string; children: ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      aria-label={label}
      title={label}
      className="grid size-9 place-items-center rounded-[4px] border border-border-subtle bg-white text-content-primary transition-colors hover:border-border-neutral hover:bg-background-subtle disabled:cursor-not-allowed disabled:text-content-tertiary/50 disabled:hover:border-border-subtle disabled:hover:bg-white max-sm:size-10"
      {...rest}
    >
      {children}
    </button>
  );
}

/** A report heading in the Portal's style: a pale green band in capitals over a soft rule. `hidden` keeps a parent heading for screen readers only. */
function ReportSection({ id, title, children, level = 2, hidden }: { id: string; title: string; children: ReactNode; level?: 2 | 3; hidden?: boolean }) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <section id={`sec-${id}`} aria-labelledby={`h-${id}`} className="scroll-mt-[92px]">
      <H
        id={`h-${id}`}
        className={
          hidden ? "sr-only" : "border-b border-border-accent bg-interactive-accent px-2.5 py-2 font-heading text-[16px] font-bold text-interactive-control uppercase"
        }
      >
        {title}
      </H>
      <div className={hidden ? undefined : "pt-1"}>{children}</div>
    </section>
  );
}

/** The printed cover: a typographic sheet in the report's mint-to-sky wash, with the vertical REPORT band. */
function Cover({ m, facts, name, showLocal, reportName }: { m: Subject; facts: ReportFacts; name: string; showLocal: boolean; reportName: string }) {
  return (
    <div className="@container relative mx-auto aspect-[1/1.32] w-full max-w-[780px] overflow-hidden border border-border-subtle bg-[linear-gradient(165deg,#eef6f1_0%,#e7eff3_58%,#eef6e9_100%)]">
      {/* Façade band: a window grid under the vertical REPORT lettering. Decorative. */}
      <div
        aria-hidden
        className="absolute inset-y-0 left-[9%] w-[24%]"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, rgb(255 255 255 / 0.22) 0 1px, transparent 1px 11.5%), repeating-linear-gradient(0deg, rgb(255 255 255 / 0.16) 0 1px, transparent 1px 3.2%), linear-gradient(180deg,#c3d3db 0%,#9db3c0 55%,#7f98a7 100%)",
        }}
      >
        <span className="absolute -bottom-[2%] left-1/2 -translate-x-1/2 rotate-180 text-[26cqw] leading-[0.8] font-bold tracking-[-0.02em] text-white/90 [writing-mode:vertical-rl]">
          REPORT
        </span>
      </div>
      <p aria-hidden className="absolute top-[6%] left-[35.5%] rotate-180 text-[max(11px,1.7cqw)] tracking-[0.3em] text-content-primary [writing-mode:vertical-rl] tnum">
        No. {facts.reportNo}
      </p>

      <p className="absolute top-[6%] right-[8%] flex items-center gap-1.5 text-[max(13px,2.6cqw)] font-bold tracking-[-0.01em]">
        <BadgeCheck className="size-[1.3em] text-interactive-primary" strokeWidth={2} aria-hidden />
        <span className="text-interactive-primary">Asia</span>
        <span className="-ml-1.5 text-navy-900">Verify</span>
      </p>

      <div className="absolute right-[8%] bottom-[7%] left-[42%] text-right">
        <p className="text-[max(12px,1.7cqw)] font-semibold tracking-[0.12em] text-interactive-control uppercase">{reportName} Report</p>
        <p className="mt-[1.2cqw] text-[max(18px,4.2cqw)] leading-tight font-semibold tracking-[-0.015em] text-content-primary [text-wrap:balance]" lang={showLocal ? "zh" : undefined}>
          {name}
        </p>
        {m.localName && !showLocal && (
          <p className="mt-[0.6cqw] text-[max(15px,3.4cqw)] leading-tight font-semibold text-content-primary" lang="zh">
            {m.localName}
          </p>
        )}
        <p className="mt-[2.4cqw] border-t border-content-primary/15 pt-[1.6cqw] text-[max(11px,1.6cqw)] text-content-main tnum">
          {jurisdictionByCode[m.jurisdiction].name} · <span className="whitespace-nowrap">Generated {formatDate(facts.generated)}</span>
        </p>
      </div>
    </div>
  );
}

/** Label-and-value rows, as the Portal prints them: a tinted label cell beside a ruled value cell. */
function Facts({ rows }: { rows: Array<[string, ReactNode]> }) {
  return (
    <dl className="flex flex-col gap-1 text-[14px]">
      {rows.map(([k, v]) => (
        <div key={k} className="grid sm:grid-cols-[152px_minmax(0,1fr)] sm:gap-1">
          <dt className="flex items-center bg-background-accent px-2.5 py-2 leading-snug font-semibold text-content-primary">{k}</dt>
          <dd className="flex items-center border-b border-border-subtle px-3.5 py-2 leading-snug text-content-primary">{v}</dd>
        </div>
      ))}
    </dl>
  );
}

/** A small data table that becomes stacked rows below md. */
function Rows<T>({ cols, rows, empty }: { cols: Array<{ label: string; cell: (r: T) => ReactNode; className?: string }>; rows: T[]; empty: string }) {
  if (rows.length === 0) return <p className="border-b border-border-subtle px-3 py-2.5 text-[13px] text-content-tertiary">{empty}</p>;
  const grid = { gridTemplateColumns: `minmax(0,1.6fr) ${cols.slice(1).map(() => "minmax(0,1fr)").join(" ")}` };
  return (
    <div role="table" className="text-[13px]">
      <div role="row" className="grid gap-4 bg-background-accent px-3 py-2 text-[13px] font-semibold text-content-primary max-md:hidden" style={grid}>
        {cols.map((c) => (
          <span key={c.label} role="columnheader" className={c.className}>
            {c.label}
          </span>
        ))}
      </div>
      <div role="rowgroup" className="divide-y divide-border-subtle border-b border-border-subtle">
        {rows.map((r, i) => (
          <div key={i} role="row" className="grid gap-x-4 gap-y-0.5 px-3 py-2.5 max-md:!grid-cols-1" style={grid}>
            {cols.map((c, ci) => (
              <span key={c.label} role="cell" className={cx(ci === 0 ? "font-medium text-content-primary" : "text-content-main max-md:text-[12px]", c.className)}>
                {ci > 0 && <span className="text-content-tertiary md:hidden">{c.label}: </span>}
                {c.cell(r)}
              </span>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}

function PageTwo({ m, facts, reportName, screened }: { m: Subject; facts: ReportFacts; reportName: string; screened: boolean }) {
  const j = jurisdictionByCode[m.jurisdiction];
  const years = Math.floor((new Date(facts.generated).getTime() - new Date(facts.incorporated).getTime()) / (365.25 * 86400000));
  const ubo = facts.shareholders.filter((s) => s.kind === "Individual" && s.pct >= 25);
  return (
    <div className="flex flex-col gap-8">
      <ReportSection id="risk-overview" title="Risk Overview">
        <p className="mb-3 text-[13px] text-content-main">
          A summary of the registry record on {formatDate(facts.generated)}. It reflects what the {j.name} registry holds, not a credit or compliance rating.
        </p>
        <Facts
          rows={[
            ["Company status", facts.status],
            ["Years since incorporation", `${nf.format(years)} years`],
            ["Legal alerts", "None found in registry sources"],
            ["Ultimate beneficial owners", ubo.length ? `${ubo.length} individual${ubo.length > 1 ? "s" : ""} with 25% or more` : "None identified at 25% or more"],
            ["Sanctions, PEP and adverse media", screened ? "Screened. See the AML Report delivered with this order." : `Not included in ${reportName}. Add the AML Report to screen.`],
          ]}
        />
      </ReportSection>

      <ReportSection id="company" title="Company Information" hidden>
        <div className="flex flex-col gap-6">
          <ReportSection id="company-registration" title="Basic Information" level={3}>
            <Facts
              rows={[
                ["Company Name (English)", m.name],
                ...(m.localName ? [["Company Name (Native)", <span lang="zh">{m.localName}</span>] as [string, ReactNode]] : []),
                [j.regLabel, <span className="tnum">{m.regNo}</span>],
                ["Old registration number", "No record found"],
                ["Incorporation Date", <span className="tnum">{facts.incorporated}</span>],
                ["Company Status", facts.status],
                ["Company Type", facts.companyType],
                ["Company Address", facts.address],
              ]}
            />
          </ReportSection>
          <ReportSection id="company-activity" title="Business Activity" level={3}>
            <Facts rows={[["Principal activity", facts.activity]]} />
          </ReportSection>
          <ReportSection id="company-capital" title="Capital" level={3}>
            <Facts rows={[[m.jurisdiction === "CN" ? "Registered capital" : "Issued share capital", <span className="tnum">{facts.capital}</span>]]} />
          </ReportSection>
        </div>
      </ReportSection>
    </div>
  );
}

function PageThree({ m, facts, tracked }: { m: Subject; facts: ReportFacts; tracked: boolean }) {
  const j = jurisdictionByCode[m.jurisdiction];
  const ubo = facts.shareholders.filter((s) => s.kind === "Individual" && s.pct >= 25);
  const years = Math.floor((new Date(facts.generated).getTime() - new Date(facts.incorporated).getTime()) / (365.25 * 86400000));
  const recentOfficers = facts.directors.filter((d) => new Date(facts.generated).getTime() - new Date(d.appointed).getTime() < 365 * 86400000).length;
  return (
    <div className="flex flex-col gap-8">
      <ReportSection id="directors" title="Directors & Officers">
        <Rows
          rows={facts.directors}
          empty="No directors or officers recorded."
          cols={[
            { label: "Name", cell: (d) => d.name },
            { label: "Role", cell: (d) => d.role },
            { label: "Appointed", cell: (d) => <span className="tnum">{formatDate(d.appointed)}</span> },
          ]}
        />
      </ReportSection>

      <ReportSection id="shareholders" title="Shareholders">
        <Rows
          rows={facts.shareholders}
          empty="No shareholders recorded."
          cols={[
            { label: "Name", cell: (s) => s.name },
            { label: "Type", cell: (s) => s.kind },
            { label: "Shareholding", cell: (s) => <span className="tnum">{s.pct}%</span> },
          ]}
        />
      </ReportSection>

      <ReportSection id="joint-shareholders" title="Joint Shareholders">
        <Rows rows={[]} empty="No joint shareholdings recorded." cols={[{ label: "Name", cell: () => null }]} />
      </ReportSection>

      <ReportSection id="risk-assessment" title="Risk Assessment">
        <Facts
          rows={[
            ["Company age", `${nf.format(years)} years`],
            ["Officer appointments in the last 12 months", nf.format(recentOfficers)],
            ["Corporate shareholders", nf.format(facts.shareholders.filter((s) => s.kind === "Corporate").length)],
            ["Registered branches", nf.format(facts.branches.length)],
          ]}
        />
      </ReportSection>

      <ReportSection id="ubo" title="UBO (Ultimate Beneficial Owner)">
        <Rows
          rows={ubo}
          empty="No individual holds 25% or more, directly, in the registry record."
          cols={[
            { label: "Name", cell: (s) => s.name },
            { label: "Basis", cell: () => "Direct shareholding" },
            { label: "Ownership", cell: (s) => <span className="tnum">{s.pct}%</span> },
          ]}
        />
      </ReportSection>

      <ReportSection id="history" title="Historical Changes">
        <Rows
          rows={facts.history}
          empty="No changes recorded before this report."
          cols={[
            { label: "Change", cell: (h) => h.detail },
            { label: "Field", cell: (h) => h.field },
            { label: "Date", cell: (h) => <span className="tnum">{formatDate(h.date)}</span> },
          ]}
        />
        {tracked && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[13px] text-content-main">
            <Eye className="size-4 text-interactive-primary" aria-hidden />
            Changes after {formatDate(facts.generated)} are tracked by your pKYB monitor.
          </p>
        )}
      </ReportSection>

      <ReportSection id="branches" title="Branches">
        <Rows rows={facts.branches} empty="No branches registered." cols={[{ label: "Branch address", cell: (b) => b }]} />
      </ReportSection>

      <ReportSection id="legal-alerts" title="Legal Alerts">
        <p className="rounded-[6px] border border-border-subtle px-4 py-3 text-[13px] text-content-main">No legal alerts found in the registry sources searched for this report.</p>
      </ReportSection>

      <ReportSection id="sources" title="Data Source & Disclaimers">
        <div className="space-y-2 text-[13px] text-content-main">
          <p>
            Data retrieved from the {j.name} company registry on {formatDate(facts.generated)}. Report No. <span className="tnum">{facts.reportNo}</span>.
          </p>
          <p>This report reflects the registry record at the time of retrieval. Fields the registry does not publish are not shown.</p>
        </div>
      </ReportSection>
    </div>
  );
}
