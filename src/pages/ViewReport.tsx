import { useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { Link, useParams } from "react-router-dom";
import { ArrowUpRight, BadgeCheck, ChevronLeft, ChevronRight, ChevronUp, ChevronsLeft, ChevronsRight, Download, Radar } from "lucide-react";
import { jurisdictionByCode, reportFacts, type Monitor, type ReportFacts } from "../data/model";
import { useStore } from "../state/store";
import { Button, Flag, cx, formatDate, nf } from "../components/ui";

type Section = { id: string; label: string; page: number; children?: Array<{ id: string; label: string }> };

// Section names and order follow the Portal's KYB Basic report viewer.
const SECTIONS: Section[] = [
  { id: "cover", label: "Cover Page", page: 1 },
  { id: "risk-overview", label: "Risk Overview", page: 2 },
  {
    id: "company",
    label: "Company Information",
    page: 2,
    children: [
      { id: "company-registration", label: "Basic Information" },
      { id: "company-activity", label: "Business Activity" },
      { id: "company-capital", label: "Capital" },
    ],
  },
  { id: "directors", label: "Directors & Officers", page: 3 },
  { id: "shareholders", label: "Shareholders", page: 3 },
  { id: "joint-shareholders", label: "Joint Shareholders", page: 3 },
  { id: "risk-assessment", label: "Risk Assessment", page: 3 },
  { id: "ubo", label: "UBO (Ultimate Beneficial Owner)", page: 3 },
  { id: "history", label: "Historical Changes", page: 3 },
  { id: "branches", label: "Branches", page: 3 },
  { id: "legal-alerts", label: "Legal Alerts", page: 3 },
  { id: "sources", label: "Data Source & Disclaimers", page: 3 },
];
const PAGES = 3;
const pageOf = (id: string) => SECTIONS.find((s) => s.id === id || s.children?.some((c) => c.id === id))?.page ?? 1;

/** The KYB Basic report a pKYB monitor was ordered with. It is the baseline every later change is compared against. */
export function ViewReport() {
  const { id } = useParams();
  const { monitors } = useStore();
  const m = monitors.find((x) => x.id === id);
  if (!m || m.status === "inactive") {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
        <p className="text-[16px] font-semibold">{m ? "This monitor has no baseline report" : "We couldn't find that report"}</p>
        <p className="mt-1 text-[14px] text-content-main">
          {m ? "Setup failed before the KYB Basic report was generated." : "The link may be out of date. Open the company from Monitoring to find its report."}
        </p>
        <Link to={m ? `/pkyb/monitoring/${m.id}` : "/pkyb/monitoring"} className="mt-4 inline-block font-semibold text-content-link hover:underline">
          {m ? "View pKYB" : "Go to Monitoring"}
        </Link>
      </div>
    );
  }
  return <Report m={m} />;
}

// The report row's tabs, in the Portal's order. Each language of a report is its own tab.
const REPORT_TABS = [
  { lang: "en", label: "KYB Report [EN]" },
  { lang: "og", label: "KYB Report [OG]" },
] as const;

function Report({ m }: { m: Monitor }) {
  const { toast } = useStore();
  const facts = useMemo(() => reportFacts(m), [m]);
  const [page, setPage] = useState(1);
  const [active, setActive] = useState("cover");
  const [companyOpen, setCompanyOpen] = useState(true);
  const [lang, setLang] = useState<"en" | "og">("en");
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
  const monitoring = m.status === "active";
  const j = jurisdictionByCode[m.jurisdiction];

  return (
    <div className="mx-auto max-w-[1360px] px-4 pt-6 pb-16 lg:px-8">
      <header className="mb-5">
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[24px] leading-tight font-semibold tracking-[-0.01em] text-content-primary">
          <span>{m.name}</span>
          {m.localName && (
            <>
              <span className="h-5 w-px bg-border-neutral max-sm:hidden" aria-hidden />
              <span lang="zh" className="font-normal text-content-main">
                {m.localName}
              </span>
            </>
          )}
          <Flag code={m.jurisdiction} className="h-4 w-6 shrink-0" />
        </h1>
        <dl className="mt-2 flex flex-col gap-y-0.5 text-[13px] sm:flex-row sm:flex-wrap sm:items-center sm:[&>div+div]:ml-4 sm:[&>div+div]:border-l sm:[&>div+div]:border-border-subtle sm:[&>div+div]:pl-4">
          <div className="flex gap-1.5">
            <dt className="text-content-tertiary">Business Registration No.</dt>
            <dd className="font-medium text-content-primary tnum">{m.regNo}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-content-tertiary">Jurisdiction</dt>
            <dd className="font-medium text-content-primary">{j.name}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-content-tertiary">Generated</dt>
            <dd className="font-medium text-content-primary tnum">{formatDate(facts.generated)}</dd>
          </div>
        </dl>
      </header>

      <div className="rounded-[6px] border border-border-subtle bg-white">
        {/* Report tabs, one per language, with the company's pKYB monitor beside them. */}
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 border-b border-border-subtle px-4 max-sm:pb-3 lg:px-5">
          <div role="group" aria-label="View report" className="flex gap-6">
            {REPORT_TABS.map((t) => {
              const on = lang === t.lang;
              return (
                <button
                  key={t.lang}
                  aria-pressed={on}
                  onClick={() => setLang(t.lang)}
                  className={cx(
                    "-mb-px inline-flex h-11 items-center gap-2 border-b-2 text-[14px] transition-colors",
                    on ? "border-interactive-primary font-semibold text-content-primary" : "border-transparent text-content-main hover:text-content-primary",
                  )}
                >
                  KYB Report
                  <span
                    className={cx(
                      "inline-flex h-5 items-center rounded-[3px] px-1.5 text-[11px] font-semibold tracking-[0.04em]",
                      on ? "bg-interactive-accent text-interactive-control" : "bg-background-subtle text-content-main",
                    )}
                  >
                    {t.lang.toUpperCase()}
                  </span>
                </button>
              );
            })}
          </div>
          <span className="h-5 w-px bg-border-subtle max-sm:hidden" aria-hidden />
          {/* pKYB lives beside the report it was ordered with: one click to this company's monitoring page. */}
          <Link
            to={`/pkyb/monitoring/${m.id}`}
            className="group inline-flex h-8 items-center gap-2 rounded-full border border-border-accent bg-interactive-accent pr-2.5 pl-3 text-[13px] font-semibold text-interactive-control transition-colors hover:border-interactive-primary hover:bg-interactive-accent-hover"
          >
            <Radar className="size-4 text-interactive-primary" aria-hidden />
            pKYB Monitoring
            <span className="inline-flex items-center gap-1 border-l border-border-accent pl-2 text-[12px] font-medium text-interactive-primary">
              <span className={cx("size-1.5 rounded-full", monitoring ? "bg-interactive-primary" : "bg-content-tertiary")} aria-hidden />
              {monitoring ? "Active" : "Stopped"}
            </span>
            <ArrowUpRight className="size-3.5 text-interactive-primary transition-transform duration-150 group-hover:translate-x-px group-hover:-translate-y-px" aria-hidden />
          </Link>
        </div>

        {/* Viewer toolbar */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-border-subtle bg-base-contrast px-4 py-2.5 lg:px-5">
          <Button size="sm" onClick={() => toast({ title: "Downloading KYB Basic report", body: `${m.name} · generated ${formatDate(facts.generated)}` })}>
            <Download className="size-4" aria-hidden /> Download PDF report
          </Button>
          <nav aria-label="Report pages" className="flex items-center gap-3">
            <span className="text-[13px] whitespace-nowrap text-content-main tnum" aria-live="polite">
              Page <span className="font-semibold text-content-primary">{page}</span> of {PAGES}
            </span>
            <div className="flex divide-x divide-border-subtle overflow-hidden rounded-[4px] border border-border-subtle bg-white">
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

        <div className="grid lg:grid-cols-[256px_minmax(0,1fr)]">
          {/* Section rail: the report's contents, grouped by printed page. */}
          <aside className="border-border-subtle max-lg:border-b lg:border-r">
            <div className="lg:sticky lg:top-14 lg:max-h-[calc(100dvh-56px)] lg:overflow-y-auto">
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

              <nav aria-labelledby="jump-h" className="px-3 pt-5 pb-5 max-lg:hidden">
                <h2 id="jump-h" className="px-2 pb-3 font-sans text-[12px] font-semibold tracking-[0.06em] text-content-tertiary uppercase">
                  Jump to section
                </h2>
                {Array.from({ length: PAGES }, (_, i) => i + 1).map((p) => (
                  <div key={p} className={cx(p > 1 && "mt-3")}>
                    <p className={cx("flex items-center gap-2 px-2 pb-1 text-[12px] font-semibold tnum", p === page ? "text-interactive-control" : "text-content-tertiary")}>
                      Page {p}
                      <span className="h-px flex-1 bg-border-subtle" aria-hidden />
                    </p>
                    <ul className="flex flex-col">
                      {SECTIONS.filter((s) => s.page === p).map((s) => {
                        const self = active === s.id;
                        const holdsActive = !!s.children?.some((c) => c.id === active);
                        return (
                          <li key={s.id}>
                            <div className="relative flex items-center">
                              <button
                                onClick={() => jump(s.children?.[0].id ?? s.id)}
                                aria-current={self || holdsActive ? "location" : undefined}
                                className={cx(
                                  "relative flex min-h-9 flex-1 items-center rounded-[4px] px-2 py-1.5 text-left text-[13px] transition-colors",
                                  s.children && "pr-9",
                                  self
                                    ? "bg-interactive-accent font-semibold text-interactive-control before:absolute before:inset-y-1.5 before:left-0 before:w-[2px] before:rounded-full before:bg-interactive-primary"
                                    : holdsActive
                                      ? "font-semibold text-interactive-control hover:bg-background-subtle"
                                      : "text-content-main hover:bg-background-subtle hover:text-content-primary",
                                )}
                              >
                                {s.label}
                              </button>
                              {s.children && (
                                <button
                                  onClick={() => setCompanyOpen((o) => !o)}
                                  aria-expanded={companyOpen}
                                  aria-label={`${companyOpen ? "Hide" : "Show"} ${s.label} subsections`}
                                  className="absolute right-0.5 grid size-8 place-items-center rounded-[4px] text-content-tertiary hover:bg-background-subtle hover:text-content-primary"
                                >
                                  <ChevronUp className={cx("size-4 transition-transform", !companyOpen && "rotate-180")} />
                                </button>
                              )}
                            </div>
                            {s.children && companyOpen && (
                              <ul className="mb-0.5 ml-3 flex flex-col border-l border-border-subtle pl-1">
                                {s.children.map((c) => (
                                  <li key={c.id}>
                                    <button
                                      onClick={() => jump(c.id)}
                                      aria-current={active === c.id ? "location" : undefined}
                                      className={cx(
                                        "relative flex min-h-8 w-full items-center rounded-[4px] px-2.5 text-left text-[13px] transition-colors",
                                        active === c.id
                                          ? "bg-interactive-accent font-semibold text-interactive-control before:absolute before:inset-y-1.5 before:-left-[5px] before:w-[2px] before:rounded-full before:bg-interactive-primary"
                                          : "text-content-main hover:bg-background-subtle hover:text-content-primary",
                                      )}
                                    >
                                      {c.label}
                                    </button>
                                  </li>
                                ))}
                              </ul>
                            )}
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                ))}
              </nav>
            </div>
          </aside>

          {/* Report pages */}
          <div className="min-w-0 px-4 py-5 lg:px-8 lg:py-6">
            {/* Running head, as on the printed report. */}
            <p className="mb-5 flex items-center justify-between gap-4 border-b border-border-subtle pb-2 text-[12px] text-content-tertiary">
              <span>
                KYB Basic Report · <span className="text-content-main">{showLocal ? "Original language" : "English"}</span>
              </span>
              <span className="tnum">No. {facts.reportNo}</span>
            </p>

            {page === 1 && (
              <ReportSection id="cover" title="Cover Page">
                <Cover m={m} facts={facts} name={name} showLocal={showLocal} />
              </ReportSection>
            )}
            {page === 2 && <PageTwo m={m} facts={facts} />}
            {page === 3 && <PageThree m={m} facts={facts} />}

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
    </div>
  );
}

function PageBtn({ label, children, ...rest }: { label: string; children: ReactNode; disabled?: boolean; onClick?: () => void }) {
  return (
    <button
      aria-label={label}
      title={label}
      className="grid size-8 place-items-center text-content-main transition-colors hover:bg-interactive-accent hover:text-interactive-control disabled:cursor-not-allowed disabled:text-content-tertiary/50 disabled:hover:bg-transparent max-sm:size-10"
      {...rest}
    >
      {children}
    </button>
  );
}

/** A report heading in the Portal's style: an uppercase band on a green rule. `hidden` keeps a parent heading for screen readers only. */
function ReportSection({ id, title, children, level = 2, hidden }: { id: string; title: string; children: ReactNode; level?: 2 | 3; hidden?: boolean }) {
  const H = level === 2 ? "h2" : "h3";
  return (
    <section id={`sec-${id}`} aria-labelledby={`h-${id}`} className="scroll-mt-[72px]">
      <H
        id={`h-${id}`}
        className={
          hidden
            ? "sr-only"
            : "border-b-2 border-interactive-primary bg-interactive-accent px-3 py-2 font-heading text-[14px] font-bold tracking-[0.05em] text-interactive-control uppercase"
        }
      >
        {title}
      </H>
      <div className={hidden ? undefined : "pt-3"}>{children}</div>
    </section>
  );
}

/** The printed cover: a typographic sheet in the report's mint-to-sky wash, with the vertical REPORT band. */
function Cover({ m, facts, name, showLocal }: { m: Monitor; facts: ReportFacts; name: string; showLocal: boolean }) {
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
        <p className="text-[max(12px,1.7cqw)] font-semibold tracking-[0.12em] text-interactive-control uppercase">KYB Basic Report</p>
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
    <dl className="flex flex-col gap-0.5 text-[13px]">
      {rows.map(([k, v]) => (
        <div key={k} className="grid sm:grid-cols-[200px_minmax(0,1fr)] sm:gap-0.5">
          <dt className="flex items-center bg-background-subtle px-3 py-2 font-semibold text-content-main">{k}</dt>
          <dd className="flex items-center border-b border-border-subtle px-3 py-2 text-content-primary">{v}</dd>
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
      <div role="row" className="grid gap-4 bg-background-subtle px-3 py-2 text-[12px] font-semibold text-content-main max-md:hidden" style={grid}>
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

function PageTwo({ m, facts }: { m: Monitor; facts: ReportFacts }) {
  const j = jurisdictionByCode[m.jurisdiction];
  const years = Math.floor((new Date(facts.generated).getTime() - new Date(facts.incorporated).getTime()) / (365.25 * 86400000));
  const ubo = facts.shareholders.filter((s) => s.kind === "Individual" && s.pct >= 25);
  return (
    <div className="flex flex-col gap-8">
      <ReportSection id="risk-overview" title="Risk Overview">
        <p className="mb-3 max-w-[64ch] text-[13px] text-content-main">
          A summary of the registry record on {formatDate(facts.generated)}. It reflects what the {j.name} registry holds, not a credit or compliance rating.
        </p>
        <Facts
          rows={[
            ["Company status", facts.status],
            ["Years since incorporation", `${nf.format(years)} years`],
            ["Legal alerts", "None found in registry sources"],
            ["Ultimate beneficial owners", ubo.length ? `${ubo.length} individual${ubo.length > 1 ? "s" : ""} with 25% or more` : "None identified at 25% or more"],
            ["Sanctions, PEP and adverse media", "Not included in KYB Basic. Add the AML Report to screen."],
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

function PageThree({ m, facts }: { m: Monitor; facts: ReportFacts }) {
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
        {m.status === "active" && (
          <p className="mt-3 flex flex-wrap items-center gap-x-2 text-[13px] text-content-main">
            <Radar className="size-4 text-interactive-primary" aria-hidden />
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
        <div className="max-w-[68ch] space-y-2 text-[13px] text-content-main">
          <p>
            Data retrieved from the {j.name} company registry on {formatDate(facts.generated)}. Report No. <span className="tnum">{facts.reportNo}</span>.
          </p>
          <p>This report reflects the registry record at the time of retrieval. Fields the registry does not publish are not shown.</p>
        </div>
      </ReportSection>
    </div>
  );
}
