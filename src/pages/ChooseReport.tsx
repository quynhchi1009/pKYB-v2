import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { ArrowRight, Check, FileText, FileUser, Plus, Radar, TextSearch, type LucideIcon } from "lucide-react";
import { PKYB_UNSUPPORTED, PRICING, SEARCH_COMPANIES, jurisdictionByCode, type Company } from "../data/model";
import { useStore } from "../state/store";
import { Button, Flag, NewTag, cx } from "../components/ui";

// Ordered from lightest to most complete, so the list reads as a ladder. `parts` is what each report is made of.
const REPORTS: Array<{ id: string; name: string; parts: string[]; icon: LucideIcon }> = [
  { id: "lite", name: "KYB Lite", parts: ["Business Overview", "Basic Information"], icon: FileText },
  { id: "basic", name: "KYB Basic", parts: ["Lite Report", "In-Depth Business Information"], icon: TextSearch },
  { id: "basic-ubo", name: "KYB Basic + Direct UBO", parts: ["Lite Report", "In-Depth Business Information", "Direct UBO"], icon: FileUser },
  { id: "complete", name: "KYB Complete", parts: ["Advanced", "AML", "UBO", "Risk Assessment", "Benchmarking"], icon: FileUser },
];
const ADDONS = [{ id: "aml", name: "AML (Company)", desc: "Sanctions, PEP and adverse media screening for the company" }];
const PRODUCT_TABS = [
  { id: "kyb", label: "KYB" },
  { id: "ubo", label: "UBO" },
  { id: "legal", label: "Legal Documents" },
];
const VIEW_TABS = ["Configure", "Compare"] as const;
/** pKYB monitors are built on a KYB Basic baseline, so only that report offers it. */
const PKYB_REPORT = "basic";

export function ChooseReport() {
  const { id } = useParams();
  const company = SEARCH_COMPANIES.find((c) => c.id === id);
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
  const { monitors, createMonitor, toast } = useStore();
  const navigate = useNavigate();
  const monitor = monitors.find((m) => m.regNo === company.regNo && m.status === "active");
  const [product, setProduct] = useState("kyb");
  const [view, setView] = useState<(typeof VIEW_TABS)[number]>("Configure");
  const [report, setReport] = useState("basic");
  const [addons, setAddons] = useState<string[]>([]);
  const [lang, setLang] = useState({ en: false, og: false });
  const [pkyb, setPkyb] = useState(false);
  const selected = REPORTS.find((r) => r.id === report)!;
  const offersPkyb = report === PKYB_REPORT;
  const unsupported = PKYB_UNSUPPORTED.has(company.jurisdiction);
  const addPkyb = offersPkyb && pkyb && !monitor && !unsupported;
  const ready = lang.en || lang.og;
  const summary = [selected.name, ...(addons.length ? ["AML (Company)"] : []), ...(addPkyb ? ["pKYB monitoring"] : [])].join(" + ");

  const generate = () => {
    if (addPkyb) {
      const m = createMonitor(company);
      toast({ title: "Report generated and monitoring started", body: `This KYB Basic report is the baseline for ${company.name}. Later changes are compared against it.` });
      navigate(`/reports/${m.id}`);
      return;
    }
    toast({ title: `Generating ${selected.name} report`, body: `For ${company.name}. We'll notify you when it's ready.` });
  };

  return (
    <div className="mx-auto max-w-[1280px] px-4 pt-6 pb-16 lg:px-8">
      <header className="mb-5">
        <h1 className="flex flex-wrap items-center gap-x-3 gap-y-1 text-[24px] leading-tight font-semibold tracking-[-0.01em] text-content-primary">
          <span>{company.name}</span>
          {company.localName && (
            <>
              <span className="h-5 w-px bg-border-neutral max-sm:hidden" aria-hidden />
              <span lang="zh" className="font-normal text-content-main">
                {company.localName}
              </span>
            </>
          )}
          <Flag code={company.jurisdiction} className="h-4 w-6 shrink-0" />
        </h1>
        <dl className="mt-2 flex flex-col gap-y-0.5 text-[13px] sm:flex-row sm:flex-wrap sm:items-center sm:[&>div+div]:ml-4 sm:[&>div+div]:border-l sm:[&>div+div]:border-border-subtle sm:[&>div+div]:pl-4">
          <div className="flex gap-1.5">
            <dt className="text-content-tertiary">Business Registration No.</dt>
            <dd className="font-medium text-content-primary tnum">{company.regNo}</dd>
          </div>
          <div className="flex gap-1.5">
            <dt className="text-content-tertiary">Jurisdiction</dt>
            <dd className="font-medium text-content-primary">{j.name}</dd>
          </div>
        </dl>
      </header>

      <div role="group" aria-label="Product" className="mb-5 flex flex-wrap gap-2">
        {PRODUCT_TABS.map((t) => (
          <button
            key={t.id}
            aria-pressed={product === t.id}
            onClick={() => setProduct(t.id)}
            className={cx(
              "inline-flex h-8 items-center rounded-full border px-4 text-[12px] font-semibold tracking-[0.04em] uppercase transition-colors max-sm:h-10",
              product === t.id ? "border-interactive-inverse bg-interactive-inverse text-white" : "border-interactive-secondary bg-white text-content-main hover:border-content-main hover:text-content-primary",
            )}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_360px]">
        <div className="min-w-0 rounded-[6px] border border-border-subtle bg-white">
          {product !== "kyb" ? (
            <p className="px-5 py-12 text-center text-[13px] text-content-main">
              {PRODUCT_TABS.find((t) => t.id === product)!.label} reports aren't part of this prototype. Choose KYB to configure a report.
            </p>
          ) : (
            <>
              <div role="group" aria-label="Report view" className="flex gap-6 border-b border-border-subtle px-5">
                {VIEW_TABS.map((t) => (
                  <button
                    key={t}
                    aria-pressed={view === t}
                    onClick={() => setView(t)}
                    className={cx(
                      "-mb-px h-11 border-b-2 text-[14px] transition-colors",
                      view === t ? "border-interactive-primary font-semibold text-content-primary" : "border-transparent text-content-main hover:text-content-primary",
                    )}
                  >
                    {t}
                  </button>
                ))}
              </div>

              {view === "Compare" ? (
                <p className="px-5 py-12 text-center text-[13px] text-content-main">Compare isn't part of this prototype. Choose Configure to pick a report.</p>
              ) : (
                <div className="flex flex-col gap-8 p-5 lg:p-6">
                  <section aria-labelledby="kyb-h">
                    <h2 id="kyb-h" tabIndex={-1} className="mb-3 text-[16px] font-semibold text-content-primary focus:outline-none">
                      KYB reports
                    </h2>
                    <div role="radiogroup" aria-labelledby="kyb-h" className="divide-y divide-border-subtle overflow-hidden rounded-[6px] border border-border-subtle">
                      {REPORTS.map((r) => {
                        const on = report === r.id;
                        return (
                          <label
                            key={r.id}
                            className={cx(
                              "relative flex cursor-pointer items-start gap-3.5 px-4 py-3.5 transition-colors",
                              on ? "bg-interactive-selected shadow-[inset_0_0_0_1px_var(--color-interactive-primary)]" : "hover:bg-base-contrast",
                            )}
                          >
                            <input type="radio" name="report" checked={on} onChange={() => setReport(r.id)} className="mt-0.5 size-4 shrink-0 accent-interactive-primary" />
                            <r.icon className={cx("mt-px size-[18px] shrink-0", on ? "text-interactive-primary" : "text-content-tertiary")} strokeWidth={1.75} aria-hidden />
                            <span className="min-w-0 flex-1">
                              <span className="flex flex-wrap items-center gap-x-2 gap-y-1">
                                <span className="text-[14px] font-semibold text-content-primary">{r.name}</span>
                                {r.id === PKYB_REPORT && (
                                  <span className="inline-flex h-5 items-center gap-1 rounded-full border border-border-accent bg-white px-2 text-[11px] font-semibold text-interactive-control">
                                    <Radar className="size-3" aria-hidden /> pKYB available
                                  </span>
                                )}
                              </span>
                              <span className="mt-1 flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[13px] text-content-main">
                                {r.parts.map((part, i) => (
                                  <span key={part} className="inline-flex items-center gap-1.5">
                                    {i > 0 && <Plus className="size-3 shrink-0 text-content-tertiary" strokeWidth={2.5} aria-label="plus" />}
                                    {part}
                                  </span>
                                ))}
                              </span>
                            </span>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.preventDefault();
                                toast({ title: `${r.name} preview`, body: "Sample reports aren't part of this prototype." });
                              }}
                              className="-my-1 shrink-0 rounded-[4px] px-1.5 py-1 text-[13px] font-semibold text-content-link hover:underline"
                            >
                              Preview
                            </button>
                          </label>
                        );
                      })}
                    </div>
                  </section>

                  <section aria-labelledby="addon-h">
                    <h2 id="addon-h" className="text-[16px] font-semibold text-content-primary">
                      Report add-ons
                    </h2>
                    <p className="mt-0.5 mb-3 text-[13px] text-content-main">Optional. Added to whichever report you choose.</p>
                    {ADDONS.map((a) => {
                      const on = addons.includes(a.id);
                      return (
                        <label
                          key={a.id}
                          className={cx(
                            "flex cursor-pointer items-start gap-3.5 rounded-[6px] border px-4 py-3 transition-colors",
                            on ? "border-interactive-primary bg-interactive-selected" : "border-border-subtle hover:bg-base-contrast",
                          )}
                        >
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={(e) => setAddons((x) => (e.target.checked ? [...x, a.id] : x.filter((y) => y !== a.id)))}
                            className="mt-0.5 size-4 shrink-0 accent-interactive-primary"
                          />
                          <span>
                            <span className="block text-[14px] font-semibold text-content-primary">{a.name}</span>
                            <span className="block text-[13px] text-content-main">{a.desc}</span>
                          </span>
                        </label>
                      );
                    })}
                  </section>
                </div>
              )}
            </>
          )}
        </div>

        {/* The order slip: what's being ordered, line by line, ending in the commit. */}
        <aside className="lg:sticky lg:top-[80px] lg:self-start">
          <section aria-labelledby="your-h" className="rounded-[6px] border border-border-subtle bg-white">
            <div className="border-b border-border-subtle px-5 py-4">
              <h2 id="your-h" className="text-[16px] font-semibold text-content-primary">
                Your report
              </h2>
              <p className="mt-0.5 truncate text-[12px] text-content-tertiary">For {company.name}</p>
            </div>

            <div className="px-5 py-4">
              <p className="text-[12px] font-semibold text-content-main">Report type</p>
              <p className="mt-1.5 flex items-center gap-2 text-[14px] font-semibold text-content-primary">
                <selected.icon className="size-4 shrink-0 text-interactive-primary" strokeWidth={1.75} aria-hidden />
                {selected.name}
              </p>

              {offersPkyb && (
                // The elbow ties the monitor to the report it is built on.
                <div className="relative mt-2 pl-6">
                  <span aria-hidden className="absolute top-0 left-2 h-5 w-3 rounded-bl-[4px] border-b border-l border-border-accent" />
                  <PkybOption company={company} monitorId={monitor?.id} unsupported={unsupported} checked={pkyb} onChange={setPkyb} />
                </div>
              )}

              {addons.length > 0 && (
                <div className="mt-4 border-t border-dashed border-border-subtle pt-3">
                  <p className="text-[12px] font-semibold text-content-main">Add-ons</p>
                  <p className="mt-1 text-[13px] text-content-primary">AML (Company)</p>
                </div>
              )}
            </div>

            <div className="flex items-center justify-between gap-4 border-t border-border-subtle px-5 py-3">
              <span id="lang-h" className="text-[12px] font-semibold text-content-main">
                Language
              </span>
              <div role="group" aria-labelledby="lang-h" className="flex gap-1.5">
                {(["en", "og"] as const).map((l) => (
                  <button
                    key={l}
                    aria-pressed={lang[l]}
                    title={l === "en" ? "English" : "Original language"}
                    onClick={() => setLang((s) => ({ ...s, [l]: !s[l] }))}
                    className={cx(
                      "inline-flex h-8 min-w-[52px] items-center justify-center gap-1 rounded-[4px] border px-2.5 text-[12px] font-semibold tracking-[0.04em] transition-colors max-sm:h-10",
                      lang[l] ? "border-interactive-primary bg-interactive-selected text-interactive-control" : "border-interactive-secondary text-content-main hover:border-content-main hover:text-content-primary",
                    )}
                  >
                    {lang[l] && <Check className="size-3.5" strokeWidth={2.5} aria-hidden />}
                    {l.toUpperCase()}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-2 rounded-b-[6px] border-t border-border-subtle bg-base-contrast px-5 py-4">
              <Button variant="primary" disabled={!ready} onClick={generate} className="w-full">
                Generate report
              </Button>
              <Button disabled={!ready} onClick={() => toast({ title: "Added to cart", body: `${summary} for ${company.name}.` })} className="w-full">
                Add to cart
              </Button>
              {!ready && <p className="pt-0.5 text-center text-[12px] text-content-tertiary">Choose a language to continue.</p>}
            </div>
          </section>
        </aside>
      </div>
    </div>
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
}: {
  company: Company;
  monitorId?: string;
  unsupported: boolean;
  checked: boolean;
  onChange: (v: boolean) => void;
}) {
  if (monitorId) {
    return (
      <div className="rounded-[6px] border border-border-accent bg-interactive-selected px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-interactive-control">
          <Radar className="size-3.5 shrink-0" aria-hidden /> Already monitored
        </p>
        <p className="mt-0.5 text-[12px] text-content-main">Changes to this company appear in Monitoring.</p>
        <Link to={`/pkyb/monitoring/${monitorId}`} className="mt-1 inline-flex min-h-7 items-center gap-1 text-[12px] font-semibold text-content-link hover:underline">
          View monitoring <ArrowRight className="size-3.5" aria-hidden />
        </Link>
      </div>
    );
  }

  if (unsupported) {
    return (
      <div className="rounded-[6px] border border-border-subtle bg-background-subtle px-3 py-2.5">
        <p className="flex items-center gap-1.5 text-[13px] font-semibold text-content-main">
          <Radar className="size-3.5 shrink-0" aria-hidden /> pKYB monitoring
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
        <span className="mt-0.5 block text-[12px] leading-snug text-content-main">Alerts when the registry record changes. This report becomes the baseline.</span>
      </span>
    </label>
  );
}
