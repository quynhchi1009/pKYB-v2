import { useId, useState, type ReactNode } from "react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router-dom";
import { ArrowRight, BadgeCheck, ChevronDown, CircleHelp, FileText, FileUser, Eye, TextSearch, type LucideIcon } from "lucide-react";
import { PKYB_UNSUPPORTED, PRICING, SEARCH_COMPANIES, TODAY, iso, jurisdictionByCode, type Company, type ReportType } from "../data/model";
import { useStore } from "../state/store";
import { Button, Flag, NewTag, cx, formatDate } from "../components/ui";
import { CreateMonitorDialog } from "../components/CreateMonitorDialog";
import { PkybInfoDialog } from "../components/PkybInfoDialog";

// Ordered from lightest to most complete, so the list reads as a ladder. `parts` is what each report is made of.
const REPORTS: Array<{ id: string; name: string; parts: string[]; icon: LucideIcon }> = [
  { id: "lite", name: "KYB Lite", parts: ["Business Overview", "Basic Information"], icon: FileText },
  { id: "basic", name: "KYB Basic", parts: ["Lite Report", "In-Depth Business Information"], icon: TextSearch },
  { id: "basic-ubo", name: "KYB Basic + Direct UBO", parts: ["Lite Report", "In-Depth Business Information", "Direct UBO"], icon: FileUser },
  { id: "complete", name: "KYB Complete", parts: ["Advanced", "AML", "UBO", "Risk Assessment", "Benchmarking"], icon: FileUser },
];
// The Portal's own option lists for the add-ons.
const MATCH_TYPES = ["Exact Match", "Non-Exact Match"];
/** Monitoring frequency in days: monthly steps up to six months. */
const FREQUENCIES = [30, 60, 90, 120, 150, 180];
// Monitoring add-on expiry: from today up to one year ahead.
const EXPIRY_MIN = iso(TODAY);
const EXPIRY_MAX = iso(new Date(TODAY.getFullYear() + 1, TODAY.getMonth(), TODAY.getDate()));
// The sample sheet's values are invented, so no real company's record is shown as a sample.
const SAMPLE_ROWS: Array<[string, string]> = [
  ["Company Name (English)", "Sample Technology Co., Ltd."],
  ["Company Name (Native)", "样本科技有限公司"],
  ["Unified Social Credit Code", "91110108MA00SAMP1E"],
  ["Old registration number", "110108000000000"],
  ["Organisation Code", "00000000-0"],
  ["Incorporation Date", "2010-03-03"],
  ["Company Status", "In operation (opening)"],
  ["Registration Authority", "District Market Supervision and Administration Bureau"],
  ["Company Type", "Limited Liability Company"],
  ["Legal Representative", "Zhang San"],
  ["Employee Count", "Less than 50 people"],
  ["Operation Start Date", "2010-03-03"],
  ["Operation End Date", "No fixed term"],
  ["Registered Address", "No. 1, Sample Road, Haidian District, Beijing"],
];
const PRODUCT_TABS = [
  { id: "kyb", label: "KYB" },
  { id: "ubo", label: "UBO" },
  { id: "legal", label: "Legal Documents" },
];
const VIEW_TABS = ["Configure", "Compare"] as const;
/** pKYB monitors are built on a KYB Basic baseline, so only that report offers it. */
const PKYB_REPORT = "basic";
/**
 * Two candidate flows for explaining pKYB before the report is generated, switchable with `?v=` for review:
 * A (low-key) puts "Find out more" on the pKYB checkbox; B (higher-key) confirms the add-on in a dialog
 * after Generate report.
 */
const VERSIONS = [
  { id: "a", label: "A · Find out more" },
  { id: "b", label: "B · Confirm on generate" },
] as const;
type Version = (typeof VERSIONS)[number]["id"];

export function ChooseReport() {
  const { id } = useParams();
  const { monitors } = useStore();
  // A monitor's "Get New KYB Report" lands here with the monitor's id, so monitored companies resolve too.
  const m = monitors.find((x) => x.id === id);
  const company: Company | undefined =
    SEARCH_COMPANIES.find((c) => c.id === id) ?? (m && { id: m.id, name: m.name, localName: m.localName, regNo: m.regNo, jurisdiction: m.jurisdiction, status: "Registered" });
  if (!company) {
    return (
      <div className="mx-auto max-w-[640px] px-4 py-24 text-center">
        <p className="text-[16px] font-semibold">We couldn't find that company</p>
        <p className="mt-1 text-[14px] text-content-main">The link may be out of date. Search for the company to choose a report.</p>
        <Link to="/search" className="mt-4 inline-block font-semibold text-content-link hover:underline">
          Search for a company
        </Link>
      </div>
    );
  }
  return <ReportPage company={company} />;
}

function ReportPage({ company }: { company: Company }) {
  const j = jurisdictionByCode[company.jurisdiction];
  const { monitors, createMonitor, orderReport, toast } = useStore();
  const navigate = useNavigate();
  const monitor = monitors.find((m) => m.regNo === company.regNo && m.status === "active");
  const [product, setProduct] = useState("kyb");
  const [view, setView] = useState<(typeof VIEW_TABS)[number]>("Configure");
  const [report, setReport] = useState("basic");
  const [aml, setAml] = useState(false);
  const [matchType, setMatchType] = useState("");
  const [monitoring, setMonitoring] = useState(false);
  const [frequency, setFrequency] = useState("");
  const [expiry, setExpiry] = useState("");
  const [sampleId, setSampleId] = useState<string | null>(null);
  const [lang, setLang] = useState({ en: false, og: false });
  const [pkyb, setPkyb] = useState(false);
  const [params, setParams] = useSearchParams();
  const version: Version = params.get("v") === "b" ? "b" : "a";
  const [infoOpen, setInfoOpen] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const selected = REPORTS.find((r) => r.id === report)!;
  const offersPkyb = report === PKYB_REPORT;
  const unsupported = PKYB_UNSUPPORTED.has(company.jurisdiction);
  const addPkyb = offersPkyb && pkyb && !monitor && !unsupported;
  const sample = REPORTS.find((r) => r.id === (sampleId ?? report))!;
  const matchName = company.localName ?? company.name;
  // The first thing still needed before the order can go through, in the order the page asks for it.
  const missing =
    aml && !matchType
      ? "Choose an AML match type to continue."
      : monitoring && (!frequency || !expiry)
        ? "Set the monitoring frequency and expiry date to continue."
        : !(lang.en || lang.og)
          ? "Choose a language to continue."
          : null;
  const ready = !missing;
  const summary = [selected.name, ...(aml ? ["AML (Company)"] : []), ...(monitoring ? ["Monitoring"] : []), ...(addPkyb ? ["pKYB monitoring"] : [])].join(" + ");

  const generate = () => {
    if (addPkyb && version === "b") {
      setConfirmOpen(true);
      return;
    }
    placeOrder();
  };

  const placeOrder = () => {
    if (addPkyb) {
      const m = createMonitor(company);
      toast({ title: "Report generated and monitoring started", body: `This KYB Basic report is the baseline for ${company.name}. Later changes are compared against it.` });
      navigate(`/reports/${m.id}`);
      return;
    }
    orderReport(company, selected.id as ReportType, { aml });
    toast({
      title: `Generating ${selected.name} report`,
      body: `For ${company.name}. It's in View Reports, and opens there when it's ready.`,
      action: { label: "View Reports", onClick: () => navigate("/reports") },
    });
  };

  // Portal2's Business Information block: the registry fields we hold for this company.
  const info: Array<[string, ReactNode]> = [
    ["Company Name (English)", company.name],
    ...(company.localName ? [["Company Name (Native)", <span lang="zh">{company.localName}</span>] as [string, ReactNode]] : []),
    [company.jurisdiction === "CN" ? "Unified Social Credit Code" : "Business Registration No.", <span className="tnum">{company.regNo}</span>],
    ["Jurisdiction", j.name],
    ["Company Status", company.status],
  ];

  return (
    <div className="px-4 pt-8 pb-16 sm:px-6 lg:px-8">
      <h1 className="flex flex-wrap items-center gap-x-2.5 gap-y-1 font-heading text-[18px] leading-tight font-bold text-content-primary">
        <span>{company.name}</span>
        {company.localName && (
          <>
            <span aria-hidden>|</span>
            <span lang="zh">{company.localName}</span>
          </>
        )}
        <Flag code={company.jurisdiction} className="ml-2 h-4 w-6 shrink-0" />
      </h1>

      <div role="group" aria-label="Product" className="mt-6 mb-5 flex flex-wrap gap-4">
        {PRODUCT_TABS.map((t) => (
          <button
            key={t.id}
            aria-pressed={product === t.id}
            onClick={() => setProduct(t.id)}
            className={cx(
              "inline-flex h-8 min-w-[100px] items-center justify-center rounded-full border px-4 text-[12px] font-semibold tracking-[0.04em] uppercase transition-colors max-sm:h-10",
              product === t.id
                ? "border-portal-pill-selected bg-portal-pill-selected text-white"
                : "border-portal-pill-line bg-white text-content-primary hover:border-border-neutral",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_368px]">
        <div className="min-w-0 rounded-[8px] bg-background-elevated">
          {product !== "kyb" ? (
            <p className="px-5 py-12 text-center text-[13px] text-content-main">
              {PRODUCT_TABS.find((t) => t.id === product)!.label} reports aren't part of this prototype. Choose KYB to configure a report.
            </p>
          ) : (
            <div className="px-5 pt-7 pb-10 sm:px-8 xl:px-12">
              <div role="group" aria-label="Report view" className="flex items-center">
                {VIEW_TABS.map((t, i) => (
                  <span key={t} className="flex items-center">
                    {i > 0 && <span aria-hidden className="mx-6 h-5 w-px bg-content-main" />}
                    <button
                      aria-pressed={view === t}
                      onClick={() => setView(t)}
                      className={cx(
                        "relative h-10 font-heading text-[16px] transition-colors after:absolute after:inset-x-0 after:bottom-0 after:h-0.5 after:rounded-full",
                        view === t ? "font-semibold text-content-primary after:bg-interactive-primary" : "text-content-main hover:text-content-primary",
                      )}
                    >
                      {t}
                    </button>
                  </span>
                ))}
              </div>

              {view === "Compare" ? (
                <p className="py-12 text-center text-[13px] text-content-main">Compare isn't part of this prototype. Choose Configure to pick a report.</p>
              ) : (
                <div className="mt-8 flex flex-col gap-10">
                  <section aria-labelledby="info-h">
                    <SectionHeading id="info-h">Business information</SectionHeading>
                    <dl className="mt-3 text-[14px] sm:grid sm:grid-cols-[132px_minmax(0,1fr)] sm:gap-x-1">
                      {info.map(([k, v]) => (
                        <div key={k} className="contents">
                          <dt className="bg-background-accent px-2 pt-2 pb-1 text-[12px] leading-snug font-semibold text-content-primary sm:py-2.5">{k}</dt>
                          <dd className="border-b border-border-subtle px-2 pt-1 pb-2.5 text-content-primary sm:py-2.5">{v}</dd>
                        </div>
                      ))}
                    </dl>
                  </section>

                  <section aria-labelledby="kyb-h" className="-mt-4">
                    {/* Portal2 runs the report cards straight on from the table, so the heading is for screen readers. */}
                    <h2 id="kyb-h" tabIndex={-1} className="sr-only scroll-mt-[96px]">
                      KYB reports
                    </h2>
                    <div role="radiogroup" aria-labelledby="kyb-h" className="flex flex-col gap-3">
                      {REPORTS.map((r) => {
                        const on = report === r.id;
                        return (
                          <label
                            key={r.id}
                            className={cx(
                              "relative flex cursor-pointer items-start gap-4 rounded-[8px] bg-background-elevated py-4 pr-5 pl-5 shadow-card transition-shadow sm:gap-6 sm:pr-28 sm:pl-7",
                              on ? "ring-1 ring-interactive-primary" : "hover:ring-1 hover:ring-border-accent",
                            )}
                          >
                            <input
                              type="radio"
                              name="report"
                              checked={on}
                              onChange={() => {
                                setReport(r.id);
                                setSampleId(null);
                              }}
                              className="mt-px size-4 shrink-0 accent-interactive-primary"
                            />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-x-3 gap-y-1">
                                <span className="font-heading text-[14px] leading-tight font-bold tracking-[0.02em] text-content-primary uppercase">{r.name}</span>
                                {r.id === PKYB_REPORT && (
                                  <span className="inline-flex h-5 items-center gap-1 rounded-full border border-border-accent bg-white px-2 text-[11px] font-semibold text-interactive-control">
                                    <Eye className="size-3" aria-hidden /> pKYB available
                                  </span>
                                )}
                              </span>
                              <span className="mt-2 flex items-start gap-2 text-[14px] leading-snug text-content-main">
                                <r.icon className="mt-px size-[18px] shrink-0 text-content-primary" strokeWidth={1.75} aria-hidden />
                                {/* Each part stays whole and carries its "+", so narrow cards break between parts, never inside one. */}
                                <span>
                                  {r.parts.map((part, i) => (
                                    <span key={part}>
                                      <span className="whitespace-nowrap">
                                        {part}
                                        {i < r.parts.length - 1 && " +"}
                                      </span>{" "}
                                    </span>
                                  ))}
                                </span>
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                setSampleId(r.id);
                                document.getElementById("sample-h")?.scrollIntoView({ behavior: "smooth", block: "start" });
                              }}
                              className="shrink-0 rounded-[4px] px-1.5 py-1 text-[12px] font-semibold text-content-link hover:underline sm:absolute sm:top-3 sm:right-4"
                            >
                              Preview
                            </button>
                          </label>
                        );
                      })}
                    </div>
                  </section>

                  <section aria-labelledby="addon-h">
                    <SectionHeading id="addon-h">Report add-ons</SectionHeading>
                    <p className="mt-3 mb-4 text-[14px] text-content-main">Optional. Added to whichever report you choose.</p>
                    <div className="flex flex-col gap-3">
                      <AddOn name="AML (Company)" checked={aml} onChange={setAml} desc={<>Matching based on “<span lang="zh">{matchName}</span>”</>} help="AML screening compares this name with sanctions, PEP and adverse media records. The match type sets how closely a record has to match to be reported.">
                        <Field label="Match type">
                          {(id) => (
                            <SelectBox id={id} value={matchType} onChange={setMatchType} placeholder="Select match type" options={MATCH_TYPES.map((t) => ({ value: t, label: t }))} />
                          )}
                        </Field>
                      </AddOn>

                      <AddOn name="Monitoring" checked={monitoring} onChange={setMonitoring} desc={<>Set a frequent monitor to track changes in “<span lang="zh">{matchName}</span>”</>}>
                        <div className="grid gap-4 sm:grid-cols-2">
                          <Field label="Frequency" hint="How often the monitor runs, in days.">
                            {(id, hintId) => (
                              <SelectBox
                                id={id}
                                describedBy={hintId}
                                value={frequency}
                                onChange={setFrequency}
                                placeholder="Select frequency"
                                options={FREQUENCIES.map((d) => ({ value: String(d), label: `${d} (${d / 30} ${d === 30 ? "month" : "months"})` }))}
                              />
                            )}
                          </Field>
                          <Field label="Expiry date" hint="When the monitor stops, up to 1 year from today.">
                            {(id, hintId) => (
                              <input
                                id={id}
                                type="date"
                                aria-describedby={hintId}
                                min={EXPIRY_MIN}
                                max={EXPIRY_MAX}
                                value={expiry}
                                onChange={(e) => setExpiry(e.target.value)}
                                className={cx(FIELD, "tnum", !expiry && "text-content-tertiary")}
                              />
                            )}
                          </Field>
                        </div>
                      </AddOn>
                    </div>
                  </section>

                  <section aria-labelledby="sample-h" className="scroll-mt-[96px]">
                    <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border-subtle pb-3">
                      <h2 id="sample-h" className="font-heading text-[16px] font-bold tracking-[0.02em] text-content-primary uppercase">
                        Sample <span className="font-normal normal-case text-content-main">({sample.name})</span>
                      </h2>
                      <p className="text-[12px] text-content-tertiary">Illustrative values. Your report uses this company's registry record.</p>
                    </div>
                    <SampleSheet />
                  </section>
                </div>
              )}
            </div>
          )}
        </div>

        {/* The order slip: what's being ordered, line by line, ending in the commit. */}
        <aside className="lg:sticky lg:top-[100px] lg:self-start">
          <section aria-labelledby="your-h" className="rounded-[8px] bg-background-elevated px-6 pt-10 pb-12 shadow-portal sm:px-11">
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <h2 id="your-h" className="font-heading text-[16px] font-bold text-content-primary">
                  Your Report
                </h2>
                <p className="mt-1 text-[13px] text-content-main">View your selected reports below.</p>
              </div>
              <FileUser className="size-14 shrink-0 text-content-primary" strokeWidth={1.5} aria-hidden />
            </div>

            <div className="mt-8 border-b border-border-subtle px-2 pb-6">
              <div className="flex items-baseline justify-between gap-4 text-[13px] text-content-primary">
                <span className="text-content-main">Report Type:</span>
                <span className="text-right font-semibold uppercase">{selected.name}</span>
              </div>

              {offersPkyb && (
                <div className="mt-4">
                  <PkybOption
                    company={company}
                    monitorId={monitor?.id}
                    unsupported={unsupported}
                    checked={pkyb}
                    onChange={setPkyb}
                    onLearnMore={version === "a" ? () => setInfoOpen(true) : undefined}
                  />
                </div>
              )}

              {(aml || monitoring) && (
                <div className="mt-4 flex flex-col gap-2 text-[13px] text-content-primary">
                  {aml && (
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-content-main">AML (Company):</span>
                      <span className={cx("text-right", matchType ? "font-semibold" : "text-content-tertiary")}>{matchType || "Match type not set"}</span>
                    </div>
                  )}
                  {monitoring && (
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-content-main">Monitoring:</span>
                      <span className={cx("text-right tnum", frequency && expiry ? "font-semibold" : "text-content-tertiary")}>
                        {frequency ? `Every ${frequency} days` : "Frequency not set"}
                        {expiry && ` · until ${formatDate(expiry)}`}
                      </span>
                    </div>
                  )}
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-b border-border-subtle px-2 py-6">
              <span id="lang-h" className="text-[13px] text-content-main">
                Language:
              </span>
              <div role="group" aria-labelledby="lang-h" className="flex gap-6">
                {(["en", "og"] as const).map((l) => (
                  <label key={l} title={l === "en" ? "English" : "Original language"} className="inline-flex min-h-8 cursor-pointer items-center gap-2 text-[13px] font-semibold text-content-primary">
                    <input
                      type="checkbox"
                      checked={lang[l]}
                      onChange={() => setLang((s) => ({ ...s, [l]: !s[l] }))}
                      className="size-4 cursor-pointer accent-interactive-primary"
                    />
                    {l.toUpperCase()}
                  </label>
                ))}
              </div>
            </div>

            <div className="mt-5 flex flex-col gap-4">
              <Button variant="primary" disabled={!ready} onClick={generate} className="w-full">
                Generate report
              </Button>
              <Button disabled={!ready} onClick={() => toast({ title: "Added to cart", body: `${summary} for ${company.name}.` })} className="w-full">
                Add to cart
              </Button>
              {missing && (
                <p className="text-center text-[12px] text-content-tertiary" aria-live="polite">
                  {missing}
                </p>
              )}
            </div>
          </section>
        </aside>
      </div>

      <PkybInfoDialog company={company} open={infoOpen} added={pkyb} onAdd={() => setPkyb(true)} onClose={() => setInfoOpen(false)} />
      <CreateMonitorDialog
        company={confirmOpen ? company : null}
        onClose={() => setConfirmOpen(false)}
        order={{ extras: [...(aml ? ["AML (Company)"] : []), ...(monitoring ? ["Monitoring"] : [])], onConfirm: placeOrder }}
      />

      {/* Review control for the two pKYB flows. Not part of either design. */}
      <div role="group" aria-label="Prototype version" className="fixed bottom-4 left-4 z-40 flex items-center gap-1 rounded-full bg-background-system p-1 pl-3 text-[12px] text-white shadow-pop lg:left-[276px]">
        <span className="mr-1 font-semibold text-chrome-content-tertiary">Prototype</span>
        {VERSIONS.map((v) => (
          <button
            key={v.id}
            aria-pressed={version === v.id}
            onClick={() => {
              const next = new URLSearchParams(params);
              next.set("v", v.id);
              setParams(next, { replace: true });
              setInfoOpen(false);
              setConfirmOpen(false);
            }}
            className={cx(
              "h-7 rounded-full px-3 font-semibold transition-colors",
              version === v.id ? "bg-white text-content-primary" : "text-chrome-content-main hover:bg-chrome-control-hover hover:text-white",
            )}
          >
            {v.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/** Portal2 section heading: capitals over a hairline. */
function SectionHeading({ id, children }: { id: string; children: ReactNode }) {
  return (
    <h2 id={id} className="border-b border-border-subtle pb-3 font-heading text-[16px] font-bold tracking-[0.02em] text-content-primary uppercase">
      {children}
    </h2>
  );
}

/**
 * The pKYB opt-in on a KYB Basic order. Ticking it makes this report the monitor's baseline; leaving it
 * unticked orders the report alone. Companies already monitored, and jurisdictions pKYB doesn't cover,
 * get a note in its place.
 */
function PkybOption({
  company,
  monitorId,
  unsupported,
  checked,
  onChange,
  onLearnMore,
}: {
  company: Company;
  monitorId?: string;
  unsupported: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
  /** Version A: a "Find out more" link that opens the pKYB explainer. */
  onLearnMore?: () => void;
}) {
  if (monitorId) {
    return (
      <div className="rounded-[6px] border border-border-accent bg-interactive-selected px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-interactive-control">
          <Eye className="size-3.5 shrink-0" aria-hidden /> Already monitored
        </p>
        <p className="mt-0.5 text-[12px] text-content-main">Changes to this company appear in Monitoring.</p>
        <Link to={`/reports/${monitorId}?tab=pkyb`} className="mt-1 inline-flex min-h-7 items-center gap-1 text-[12px] font-semibold text-content-link hover:underline">
          View monitoring <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    );
  }

  if (unsupported) {
    return (
      <div className="rounded-[6px] border border-border-subtle bg-background-subtle px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-content-main">
          <Eye className="size-3.5 shrink-0" aria-hidden /> pKYB monitoring
        </p>
        <p className="mt-0.5 text-[12px] text-content-main">Not available for {jurisdictionByCode[company.jurisdiction].name} companies yet.</p>
      </div>
    );
  }

  return (
    <label
      className={cx(
        "flex cursor-pointer gap-2.5 rounded-[6px] border px-3 py-2.5 transition-colors",
        checked ? "border-interactive-primary bg-interactive-selected" : "border-border-subtle hover:border-border-accent hover:bg-base-contrast",
      )}
    >
      <input type="checkbox" checked={checked} onChange={(e) => onChange(e.target.checked)} className="mt-0.5 size-4 shrink-0 accent-interactive-primary" />
      <span className="min-w-0 flex-1">
        <span className="flex flex-wrap items-center justify-between gap-x-2 gap-y-0.5">
          <span className="flex items-center gap-1.5 text-[13px] font-semibold text-content-primary">
            Add pKYB monitoring <NewTag />
          </span>
          <span className="text-[12px] font-semibold text-content-primary tnum">+{PRICING.monitorCredits} credits / year</span>
        </span>
        <span className="mt-0.5 block text-[12px] leading-snug text-content-main">
          Alerts when the registry record changes. This report becomes the baseline.
          {onLearnMore && (
            <>
              {" "}
              <button
                type="button"
                onClick={(e) => {
                  // Inside the checkbox's label: open the explainer without toggling the box.
                  e.preventDefault();
                  onLearnMore();
                }}
                className="font-semibold whitespace-nowrap text-content-link underline underline-offset-2 hover:no-underline"
              >
                Find out more
              </button>
            </>
          )}
        </span>
      </span>
    </label>
  );
}

const FIELD =
  "h-9 w-full rounded-[4px] border border-interactive-secondary bg-white px-2.5 text-[13px] text-content-primary transition-colors hover:border-content-main focus:border-interactive-primary max-sm:h-11 max-sm:text-[16px]";

/** An optional add-on: a checkbox row that opens its own settings once ticked. */
function AddOn({
  name,
  desc,
  help,
  checked,
  onChange,
  children,
}: {
  name: string;
  desc: ReactNode;
  help?: string;
  checked: boolean;
  onChange: (v: boolean) => void;
  children: ReactNode;
}) {
  const helpId = useId();
  return (
    <div className={cx("rounded-[8px] bg-background-elevated shadow-card transition-shadow", checked ? "ring-1 ring-interactive-primary" : "hover:ring-1 hover:ring-border-accent")}>
      <div className="flex items-start gap-4 px-5 py-4 sm:gap-6 sm:pl-7">
        <input
          id={`${helpId}-cb`}
          type="checkbox"
          checked={checked}
          onChange={(e) => onChange(e.target.checked)}
          aria-describedby={`${helpId}-desc`}
          className="mt-px size-4 shrink-0 cursor-pointer accent-interactive-primary"
        />
        <span className="min-w-0 flex-1">
          <label htmlFor={`${helpId}-cb`} className="block cursor-pointer font-heading text-[14px] leading-tight font-bold tracking-[0.02em] text-content-primary uppercase">
            {name}
          </label>
          <span className="mt-1.5 flex flex-wrap items-center gap-1.5 text-[14px] leading-snug text-content-main">
            <span id={`${helpId}-desc`}>{desc}</span>
            {help && (
              <span className="group relative inline-flex">
                <button type="button" aria-label={`About ${name}`} aria-describedby={`${helpId}-tip`} className="grid size-6 place-items-center rounded-full text-content-tertiary hover:text-content-primary">
                  <CircleHelp className="size-4" aria-hidden />
                </button>
                <span
                  id={`${helpId}-tip`}
                  role="tooltip"
                  className="pointer-events-none absolute bottom-full left-1/2 z-20 mb-1.5 hidden w-[260px] -translate-x-1/2 rounded-[6px] bg-background-system px-3 py-2 text-[12px] leading-snug text-white shadow-pop group-focus-within:block group-hover:block max-sm:left-auto max-sm:right-0 max-sm:translate-x-0"
                >
                  {help}
                </span>
              </span>
            )}
          </span>
        </span>
      </div>
      {checked && <div className="border-t border-border-subtle px-5 py-4 sm:pl-[68px]">{children}</div>}
    </div>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: (id: string, hintId?: string) => ReactNode }) {
  const id = useId();
  const hintId = hint ? `${id}-hint` : undefined;
  return (
    <div className="min-w-0">
      <span className="flex items-center gap-2">
        <label htmlFor={id} className="text-[13px] font-semibold text-content-primary">
          {label}
        </label>
        <span className="inline-flex h-[18px] items-center rounded-[3px] border border-border-neutral px-1.5 text-[11px] font-semibold text-content-main">Required</span>
      </span>
      {hint && (
        <span id={hintId} className="mt-0.5 block text-[12px] text-content-main">
          {hint}
        </span>
      )}
      <div className="mt-2 max-w-[360px]">{children(id, hintId)}</div>
    </div>
  );
}

function SelectBox({
  id,
  describedBy,
  value,
  onChange,
  placeholder,
  options,
}: {
  id: string;
  describedBy?: string;
  value: string;
  onChange: (v: string) => void;
  placeholder: string;
  options: Array<{ value: string; label: string }>;
}) {
  return (
    <span className="relative block">
      <select
        id={id}
        aria-describedby={describedBy}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={cx(FIELD, "appearance-none pr-9", !value && "text-content-tertiary")}
      >
        <option value="" disabled>
          {placeholder}
        </option>
        {options.map((o) => (
          <option key={o.value} value={o.value} className="text-content-primary">
            {o.label}
          </option>
        ))}
      </select>
      <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-content-tertiary" aria-hidden />
    </span>
  );
}

/** A miniature of the report's Basic Information page, faded at the foot to show the document carries on. */
function SampleSheet() {
  return (
    <div className="mt-4 rounded-[6px] bg-base-contrast px-3 pt-6 sm:px-10">
      <div
        aria-label="Sample report page"
        role="img"
        className="mx-auto h-[400px] max-w-[540px] overflow-hidden border border-b-0 border-border-subtle bg-white px-6 pt-7 [mask-image:linear-gradient(to_bottom,#000_62%,transparent)] sm:px-9"
      >
        <div className="flex items-end justify-between gap-4 border-b border-border-subtle pb-2.5">
          <p className="text-[16px] font-semibold text-interactive-primary">Company Information</p>
          <BadgeCheck className="size-7 text-interactive-primary" strokeWidth={1.75} aria-hidden />
        </div>
        <p className="mt-3 mb-2 text-[11px] font-semibold text-content-primary">Basic Information</p>
        <dl className="grid grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-x-4 gap-y-[7px] text-[11px] leading-snug">
          {SAMPLE_ROWS.map(([k, v]) => (
            <div key={k} className="contents">
              <dt className="font-semibold text-content-main">{k}</dt>
              <dd className="text-content-primary tnum">{v}</dd>
            </div>
          ))}
        </dl>
      </div>
    </div>
  );
}
