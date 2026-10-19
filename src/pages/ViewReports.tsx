import { useEffect, useId, useMemo, useRef, useState, type FormEvent, type ReactNode } from "react";
import { Link, useNavigate } from "react-router-dom";
import { ArrowDownNarrowWide, ArrowUpNarrowWide, CalendarDays, Check, ChevronDown, ChevronLeft, ChevronRight, Download, LoaderCircle, Eye, Search } from "lucide-react";
import {
  JURISDICTIONS,
  PKYB_UNSUPPORTED,
  REPORT_STATUS_COPY,
  REPORT_TYPES,
  REPORT_TYPE_LABEL,
  TODAY,
  addDays,
  iso,
  jurisdictionByCode,
  type Company,
  type ReportOrder,
  type ReportStatus,
  type ReportType,
} from "../data/model";
import { useStore } from "../state/store";
import { Button, Flag, cx, formatDate, nf } from "../components/ui";
import { CreateMonitorDialog } from "../components/CreateMonitorDialog";

const STATUSES: ReportStatus[] = ["completed", "processing", "unfulfilled"];
const RANGES = [
  { value: "any", label: "Any time" },
  { value: "7", label: "Last 7 days" },
  { value: "30", label: "Last 30 days" },
  { value: "90", label: "Last 90 days" },
  { value: "custom", label: "Custom range" },
] as const;
type Range = (typeof RANGES)[number]["value"];

type Filters = { status: ReportStatus[]; type: ReportType[]; jurisdiction: string[]; range: Range; from: string; to: string };
const EMPTY: Filters = { status: [], type: [], jurisdiction: [], range: "any", from: "", to: "" };
const same = (a: Filters, b: Filters) => JSON.stringify(a) === JSON.stringify(b);
const PAGE_SIZES = [10, 20, 50];

const time = new Intl.DateTimeFormat("en-GB", { hour: "numeric", minute: "2-digit", hour12: true });
const formatTime = (at: string) => time.format(new Date(at)).replace(" ", "").toUpperCase();

/** View Reports: every report the account has ordered, newest first. Completed reports open in the viewer. */
export function ViewReports() {
  const { reportOrders, monitors, createMonitor, toast } = useStore();
  const navigate = useNavigate();
  const [creating, setCreating] = useState<Company | null>(null);
  const monitored = useMemo(() => new Set(monitors.filter((m) => m.status === "active").map((m) => m.regNo)), [monitors]);
  // pKYB is built on KYB Basic, so only a completed KYB Basic report offers it, and only while the company has no running monitor.
  const offersPkyb = (o: ReportOrder) => o.type === "basic" && o.status === "completed" && !monitored.has(o.regNo) && !PKYB_UNSUPPORTED.has(o.jurisdiction);
  const createFor = (o: ReportOrder) => setCreating({ id: o.id, name: o.companyName, localName: o.localName, regNo: o.regNo, jurisdiction: o.jurisdiction, status: "Registered" });
  const startMonitor = () => {
    if (!creating) return;
    const m = createMonitor(creating);
    toast({ title: "Report generated and monitoring started", body: `This new KYB Basic report is the baseline for ${creating.name}. Later changes are compared against it.` });
    navigate(`/reports/${m.id}`);
  };
  const [query, setQuery] = useState("");
  const [search, setSearch] = useState("");
  const [draft, setDraft] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  const [sort, setSort] = useState<{ key: "date" | "name"; dir: "asc" | "desc" }>({ key: "date", dir: "desc" });
  const [size, setSize] = useState(10);
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase();
    const f = applied;
    const from = f.range === "custom" ? f.from : f.range === "any" ? "" : iso(addDays(TODAY, -Number(f.range)));
    const to = f.range === "custom" ? f.to : "";
    const out = reportOrders.filter(
      (o) =>
        (!q || [o.companyName, o.localName ?? "", o.regNo, o.orderNo].some((v) => v.toLowerCase().includes(q))) &&
        (!f.status.length || f.status.includes(o.status)) &&
        (!f.type.length || f.type.includes(o.type)) &&
        (!f.jurisdiction.length || f.jurisdiction.includes(o.jurisdiction)) &&
        (!from || o.createdAt.slice(0, 10) >= from) &&
        (!to || o.createdAt.slice(0, 10) <= to),
    );
    const dir = sort.dir === "asc" ? 1 : -1;
    return out.sort((a, b) => (sort.key === "date" ? (a.createdAt < b.createdAt ? -1 : 1) : a.companyName.localeCompare(b.companyName)) * dir);
  }, [reportOrders, search, applied, sort]);

  const pages = Math.max(1, Math.ceil(rows.length / size));
  useEffect(() => setPage(1), [search, applied, size, sort]);
  useEffect(() => {
    if (page > pages) setPage(pages);
  }, [page, pages]);
  const shown = rows.slice((page - 1) * size, page * size);

  const pageIds = shown.map((o) => o.id);
  const allOnPage = pageIds.length > 0 && pageIds.every((id) => selected.has(id));
  const someOnPage = pageIds.some((id) => selected.has(id));
  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });
  const togglePage = () =>
    setSelected((s) => {
      const n = new Set(s);
      pageIds.forEach((id) => (allOnPage ? n.delete(id) : n.add(id)));
      return n;
    });

  const download = () => {
    const picked = reportOrders.filter((o) => selected.has(o.id));
    const ready = picked.filter((o) => o.status === "completed");
    const skipped = picked.length - ready.length;
    toast({
      title: ready.length ? `Downloading ${ready.length} report${ready.length > 1 ? "s" : ""}` : "Nothing to download yet",
      body: skipped ? `${skipped} ${skipped > 1 ? "aren't" : "isn't"} completed, so ${skipped > 1 ? "they were" : "it was"} left out.` : "PDFs save to your Download Centre.",
    });
  };

  const onSearch = (e: FormEvent) => {
    e.preventDefault();
    setSearch(query);
  };
  const clear = () => {
    setDraft(EMPTY);
    setApplied(EMPTY);
    setQuery("");
    setSearch("");
  };
  const filtered = !same(applied, EMPTY) || !!search;
  const sortBy = (key: "date" | "name") => setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: key === "date" ? "desc" : "asc" }));

  return (
    <div className="px-4 pt-6 pb-16 sm:px-6 lg:px-8">
      <section aria-labelledby="reports-h" className="rounded-[8px] border border-border-subtle bg-white p-4 sm:p-6 lg:p-5 xl:p-6">
        <h1 id="reports-h" className="font-heading text-[18px] font-bold text-content-primary">
          Your Reports
        </h1>

        <form role="search" onSubmit={onSearch} className="mt-5 flex gap-3 max-sm:flex-col">
          <label className="relative min-w-0 flex-1">
            <span className="sr-only">Search reports</span>
            <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-tertiary" aria-hidden />
            <input
              type="search"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="Enter Business Name, Registration Number or Order Number"
              className="h-10 w-full rounded-[4px] border border-interactive-secondary bg-white pr-3 pl-9 text-[13px] text-content-primary placeholder:text-content-tertiary hover:border-content-main focus:border-interactive-primary max-sm:h-11 max-sm:text-[16px]"
            />
          </label>
          <Button variant="primary" type="submit" className="h-10 w-[164px] uppercase max-sm:w-full">
            Search
          </Button>
        </form>

        <div className="mt-5 flex flex-wrap items-start justify-between gap-x-6 gap-y-4">
          <div className="flex min-w-0 flex-col gap-4">
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="mr-1 text-[14px] text-content-primary">Filter By:</span>
              <FilterPill
                label="Order Status"
                options={STATUSES.map((s) => ({ value: s, label: REPORT_STATUS_COPY[s].label }))}
                value={draft.status}
                onChange={(status) => setDraft((d) => ({ ...d, status: status as ReportStatus[] }))}
              />
              <FilterPill
                label="Report Type"
                options={REPORT_TYPES.map((t) => ({ value: t, label: REPORT_TYPE_LABEL[t] }))}
                value={draft.type}
                onChange={(type) => setDraft((d) => ({ ...d, type: type as ReportType[] }))}
              />
              <FilterPill
                label="Jurisdiction"
                options={JURISDICTIONS.map((j) => ({ value: j.code, label: j.name, flag: j.code }))}
                value={draft.jurisdiction}
                onChange={(jurisdiction) => setDraft((d) => ({ ...d, jurisdiction }))}
              />
              <FilterPill
                label="Date Range"
                single
                options={RANGES.filter((r) => r.value !== "custom").map((r) => ({ value: r.value, label: r.label }))}
                value={draft.range === "any" ? [] : [draft.range]}
                onChange={([range]) => setDraft((d) => ({ ...d, range: (range as Range) ?? "any", ...(range !== "custom" && { from: "", to: "" }) }))}
              />
            </div>
            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              <span className="text-[14px] text-content-primary">Custom Date Range:</span>
              <div className="flex h-10 items-center gap-2 rounded-[4px] border border-border-subtle bg-white px-3 focus-within:border-interactive-primary has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-interactive-primary max-sm:h-11">
                <CalendarDays className="size-4 shrink-0 text-content-tertiary" aria-hidden />
                <DateInput label="Start date" value={draft.from} max={draft.to || iso(TODAY)} onChange={(from) => setDraft((d) => ({ ...d, from, range: from || d.to ? "custom" : "any" }))} />
                <span className="text-[13px] text-content-main">to</span>
                <DateInput label="End date" value={draft.to} min={draft.from} max={iso(TODAY)} onChange={(to) => setDraft((d) => ({ ...d, to, range: to || d.from ? "custom" : "any" }))} />
              </div>
            </div>
          </div>

          <div className="flex flex-col items-end gap-4 max-sm:w-full max-sm:items-stretch">
            <div className="flex gap-3">
              <button
                onClick={() => setApplied(draft)}
                disabled={same(draft, applied)}
                className="inline-flex h-10 w-[104px] items-center justify-center rounded-[4px] bg-portal-pill-selected text-[14px] font-semibold text-white uppercase transition-colors hover:bg-content-primary disabled:cursor-not-allowed disabled:opacity-50 max-sm:flex-1"
              >
                Apply
              </button>
              <button
                onClick={clear}
                disabled={!filtered && same(draft, EMPTY) && !query}
                className="inline-flex h-10 w-[104px] items-center justify-center rounded-[4px] bg-background-subtle text-[14px] font-semibold text-content-primary uppercase transition-colors hover:bg-portal-line disabled:cursor-not-allowed disabled:opacity-50 max-sm:flex-1"
              >
                Clear
              </button>
            </div>
            <button
              onClick={download}
              disabled={selected.size === 0}
              aria-label={selected.size ? `Download ${selected.size} selected report${selected.size > 1 ? "s" : ""}` : "Download selected reports (select reports first)"}
              title={selected.size ? `Download ${selected.size} selected` : "Select reports to download"}
              className="inline-flex h-9 items-center gap-2 rounded-[4px] px-2 text-[13px] font-semibold text-content-primary transition-colors hover:bg-background-subtle disabled:cursor-not-allowed disabled:text-content-tertiary disabled:hover:bg-transparent"
            >
              {selected.size > 0 && <span className="tnum">{nf.format(selected.size)} selected</span>}
              <Download className="size-5" strokeWidth={1.75} aria-hidden />
            </button>
          </div>
        </div>

        {!same(draft, applied) && (
          <p className="mt-3 text-[12px] text-content-tertiary" aria-live="polite">
            Filters changed. Select Apply to update the list.
          </p>
        )}

        <div className="mt-5 overflow-hidden rounded-[6px] border border-border-subtle">
          {/* md and up: the Portal table */}
          <div className="overflow-x-auto max-md:hidden">
            <table className="w-full min-w-[1000px] text-left text-[13px]">
              <thead className="bg-background-subtle text-[12px] leading-tight font-semibold text-content-primary uppercase">
                <tr>
                  <th className="w-11 py-3 pl-4">
                    <Checkbox label="Select all reports on this page" checked={allOnPage} mixed={!allOnPage && someOnPage} onChange={togglePage} />
                  </th>
                  <SortHead label="Date" active={sort.key === "date"} dir={sort.dir} onClick={() => sortBy("date")} />
                  <th className="px-2.5 py-3 font-semibold">Order No.</th>
                  <SortHead label="Business Name" active={sort.key === "name"} dir={sort.dir} onClick={() => sortBy("name")} />
                  <th className="px-2.5 py-3 font-semibold">Registration No.</th>
                  <th className="px-2.5 py-3 font-semibold">Jurisdiction</th>
                  <th className="px-2.5 py-3 font-semibold">User Name</th>
                  <th className="px-2.5 py-3 font-semibold">Report Type</th>
                  <th className="px-2.5 py-3 font-semibold">Status</th>
                  <th className="px-2.5 py-3 font-semibold">Add-on</th>
                  <th className="py-3 pr-4 pl-2.5 font-semibold">Action</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border-subtle">
                {shown.map((o) => (
                  <tr key={o.id} className={cx("transition-colors", selected.has(o.id) ? "bg-interactive-selected" : "hover:bg-base-contrast")}>
                    <td className="py-4 pl-4">
                      <Checkbox label={`Select ${o.companyName}, order ${o.orderNo}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                    </td>
                    <td className="px-2.5 py-4 whitespace-nowrap tnum">
                      {formatDate(o.createdAt.slice(0, 10))}
                      <span className="block text-content-main">{formatTime(o.createdAt)}</span>
                    </td>
                    <td className="w-[126px] min-w-[126px] px-2.5 py-4 text-[12px] break-all tnum">{o.orderNo}</td>
                    <td className="min-w-[152px] px-2.5 py-4">
                      <span className="block font-medium text-content-primary">{o.companyName}</span>
                      {o.localName && (
                        <span lang="zh" className="block text-content-main">
                          {o.localName}
                        </span>
                      )}
                    </td>
                    <td className="min-w-[116px] px-2.5 py-4 text-[12px] break-all tnum">{o.regNo}</td>
                    <td className="px-2.5 py-4">
                      <span className="inline-flex items-center gap-2">
                        <Flag code={o.jurisdiction} />
                        {jurisdictionByCode[o.jurisdiction]?.name}
                      </span>
                    </td>
                    <td className="px-2.5 py-4">{o.user}</td>
                    <td className="min-w-[108px] px-2.5 py-4 text-[12px] uppercase">{REPORT_TYPE_LABEL[o.type]}</td>
                    <td className="px-2.5 py-4 text-[12px] whitespace-nowrap">
                      <StatusText status={o.status} />
                    </td>
                    <td className="px-2.5 py-4 text-[12px]">
                      <AddOns o={o} pkyb={offersPkyb(o)} onCreatePkyb={() => createFor(o)} onAddAml={() => toast({ title: "Add AML Report", body: "Not part of this prototype." })} />
                    </td>
                    <td className="py-4 pr-4 pl-2.5">
                      <RowAction o={o} />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* Below md: stacked rows from the same data */}
          <ul className="divide-y divide-border-subtle md:hidden">
            <li className="flex items-center gap-3 bg-background-subtle px-4 py-2.5 text-[12px] font-semibold uppercase">
              <Checkbox label="Select all reports on this page" checked={allOnPage} mixed={!allOnPage && someOnPage} onChange={togglePage} />
              <span className="flex-1">Reports</span>
              <button onClick={() => sortBy("date")} className="inline-flex h-9 items-center gap-1 rounded-[4px] px-2 font-semibold normal-case hover:bg-portal-line">
                {sort.key === "date" && sort.dir === "asc" ? "Oldest first" : "Newest first"}
              </button>
            </li>
            {shown.map((o) => (
              <li key={o.id} className={cx("flex gap-3 px-4 py-3.5", selected.has(o.id) && "bg-interactive-selected")}>
                <span className="pt-0.5">
                  <Checkbox label={`Select ${o.companyName}, order ${o.orderNo}`} checked={selected.has(o.id)} onChange={() => toggle(o.id)} />
                </span>
                <div className="min-w-0 flex-1">
                  <p className="text-[14px] leading-snug font-semibold [overflow-wrap:anywhere]">{o.companyName}</p>
                  {o.localName && (
                    <p lang="zh" className="text-[13px] text-content-main">
                      {o.localName}
                    </p>
                  )}
                  <p className="mt-1 flex flex-wrap items-center gap-x-2 text-[12px] text-content-main tnum">
                    <Flag code={o.jurisdiction} />
                    {jurisdictionByCode[o.jurisdiction]?.name} · {formatDate(o.createdAt.slice(0, 10))}, {formatTime(o.createdAt)}
                  </p>
                  <p className="mt-0.5 text-[12px] text-content-tertiary tnum [overflow-wrap:anywhere]">
                    Order {o.orderNo} · {o.user}
                  </p>
                  <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px]">
                    <span className="font-semibold uppercase">{REPORT_TYPE_LABEL[o.type]}</span>
                    <StatusText status={o.status} />
                    <AddOns o={o} compact pkyb={offersPkyb(o)} onCreatePkyb={() => createFor(o)} onAddAml={() => toast({ title: "Add AML Report", body: "Not part of this prototype." })} />
                  </div>
                </div>
                <div className="shrink-0 pt-0.5">
                  <RowAction o={o} />
                </div>
              </li>
            ))}
          </ul>

          {shown.length === 0 && (
            <div className="px-5 py-14 text-center">
              {reportOrders.length === 0 ? (
                <>
                  <p className="text-[14px] font-semibold">No reports yet</p>
                  <p className="mt-1 text-[13px] text-content-main">
                    Reports you order appear here.{" "}
                    <Link to="/search" className="font-semibold text-content-link hover:underline">
                      Search for a business
                    </Link>{" "}
                    to order one.
                  </p>
                </>
              ) : (
                <>
                  <p className="text-[14px] font-semibold">No reports match</p>
                  <p className="mt-1 text-[13px] text-content-main">
                    Try another search or fewer filters.{" "}
                    <button onClick={clear} className="font-semibold text-content-link hover:underline">
                      Clear all
                    </button>
                  </p>
                </>
              )}
            </div>
          )}
        </div>

        <CreateMonitorDialog company={creating} onClose={() => setCreating(null)} order={{ extras: [], onConfirm: startMonitor }} />
        {rows.length > 0 && <Pagination page={page} pages={pages} size={size} total={rows.length} onPage={setPage} onSize={setSize} />}
      </section>
    </div>
  );
}

function SortHead({ label, active, dir, onClick }: { label: string; active: boolean; dir: "asc" | "desc"; onClick: () => void }) {
  const Icon = active && dir === "asc" ? ArrowUpNarrowWide : ArrowDownNarrowWide;
  return (
    <th className="px-2.5 py-3 font-semibold" aria-sort={active ? (dir === "asc" ? "ascending" : "descending") : "none"}>
      <button onClick={onClick} className="-mx-1.5 inline-flex h-7 items-center gap-1.5 rounded-[4px] px-1.5 whitespace-nowrap uppercase hover:bg-portal-line">
        {label}
        <Icon className={cx("size-3.5", active ? "text-content-primary" : "text-content-tertiary")} aria-hidden />
      </button>
    </th>
  );
}

function Checkbox({ label, checked, mixed, onChange }: { label: string; checked: boolean; mixed?: boolean; onChange: () => void }) {
  const ref = useRef<HTMLInputElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.indeterminate = !!mixed;
  }, [mixed]);
  return (
    <label className="-m-1.5 inline-grid size-7 cursor-pointer place-items-center rounded-[4px] hover:bg-background-subtle">
      <input ref={ref} type="checkbox" aria-label={label} checked={checked} onChange={onChange} className="size-4 cursor-pointer accent-interactive-primary" />
    </label>
  );
}

function StatusText({ status }: { status: ReportStatus }) {
  return (
    <span title={REPORT_STATUS_COPY[status].explain} className={cx("inline-flex items-center gap-1.5 uppercase", status === "unfulfilled" ? "text-content-main" : "text-content-primary")}>
      {status === "processing" && <LoaderCircle className="size-3.5 animate-spin text-content-tertiary" aria-hidden />}
      {REPORT_STATUS_COPY[status].label}
    </span>
  );
}

const NA = () => (
  <span className="text-content-tertiary">
    <span aria-hidden>N/A</span>
    <span className="sr-only">None</span>
  </span>
);

/** What was added to the report: AML screening, or the pKYB monitor it is the baseline of. KYB Basic can still take AML. */
function AddOns({ o, compact, pkyb, onCreatePkyb, onAddAml }: { o: ReportOrder; compact?: boolean; pkyb: boolean; onCreatePkyb: () => void; onAddAml: () => void }) {
  const canAddAml = o.type === "basic" && !o.aml && o.status === "completed";
  if (!o.aml && !o.monitorId && !canAddAml && !pkyb) return compact ? null : <NA />;
  return (
    <span className={cx("flex gap-x-3 gap-y-1", compact ? "flex-row flex-wrap" : "flex-col items-start")}>
      {o.aml && <span className="font-medium">AML</span>}
      {o.monitorId && (
        <Link to={`/reports/${o.id}?tab=pkyb`} className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-content-link hover:underline">
          <Eye className="size-3.5 text-interactive-primary" aria-hidden />
          pKYB
        </Link>
      )}
      {pkyb && (
        <button onClick={onCreatePkyb} aria-label={`Create pKYB monitor for ${o.companyName}`} className="inline-flex items-center gap-1 font-semibold whitespace-nowrap text-interactive-primary hover:underline">
          Create pKYB
        </button>
      )}
      {canAddAml && (
        <button onClick={onAddAml} className="font-semibold whitespace-nowrap text-interactive-primary hover:underline">
          Add AML
        </button>
      )}
    </span>
  );
}

function RowAction({ o }: { o: ReportOrder }) {
  if (o.status !== "completed") return <NA />;
  return (
    <Link
      to={`/reports/${o.id}`}
      aria-label={`View ${REPORT_TYPE_LABEL[o.type]} report for ${o.companyName}`}
      className="-mx-2 inline-flex h-8 items-center rounded-[4px] px-2 font-semibold text-interactive-primary hover:bg-interactive-accent max-md:text-[13px]"
    >
      View
    </Link>
  );
}

function DateInput({ label, value, min, max, onChange }: { label: string; value: string; min?: string; max?: string; onChange: (v: string) => void }) {
  return (
    <label className="group relative">
      <span className="sr-only">{label}</span>
      {!value && (
        <span aria-hidden className="pointer-events-none absolute inset-y-0 left-1 flex items-center text-[13px] text-content-tertiary group-focus-within:hidden">
          {label}
        </span>
      )}
      <input
        type="date"
        value={value}
        min={min}
        max={max}
        onChange={(e) => onChange(e.target.value)}
        onClick={(e) => e.currentTarget.showPicker?.()}
        className={cx(
          "date-bare h-8 w-[116px] cursor-pointer bg-transparent px-1 text-[13px] text-content-primary tnum focus:outline-none",
          !value && "text-transparent focus:text-content-primary",
        )}
      />
    </label>
  );
}

/** A Filter By pill: the Portal's charcoal chip, opening a checklist (or a single-choice list). */
function FilterPill({
  label,
  options,
  value,
  onChange,
  single,
}: {
  label: string;
  options: Array<{ value: string; label: string; flag?: string }>;
  value: string[];
  onChange: (v: string[]) => void;
  single?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const wrap = useRef<HTMLDivElement>(null);
  const btn = useRef<HTMLButtonElement>(null);
  const id = useId();
  useEffect(() => {
    if (!open) return;
    const away = (e: PointerEvent) => !wrap.current?.contains(e.target as Node) && setOpen(false);
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
  const count = value.length;
  const summary: ReactNode = single && count ? (options.find((o) => o.value === value[0])?.label ?? "Custom") : count ? <span className="tnum">{count}</span> : null;

  return (
    <div ref={wrap} className="relative">
      <button
        ref={btn}
        aria-expanded={open}
        aria-controls={id}
        onClick={() => setOpen((o) => !o)}
        className={cx(
          "inline-flex h-9 items-center gap-2 rounded-full pr-3 pl-4 text-[13px] font-medium text-white transition-colors max-sm:h-10",
          count ? "bg-interactive-primary hover:bg-interactive-control" : "bg-portal-pill-selected hover:bg-content-primary",
        )}
      >
        {label}
        {summary && <span className="rounded-full bg-white/20 px-1.5 text-[12px] font-semibold">{summary}</span>}
        <ChevronDown className={cx("size-4 transition-transform duration-200 ease-out-expo", open && "rotate-180")} aria-hidden />
      </button>
      {open && (
        <div
          id={id}
          role="group"
          aria-label={label}
          className="popover-in absolute top-full left-0 z-30 mt-2 w-[232px] overflow-hidden rounded-[6px] border border-border-subtle bg-white py-1 text-[13px] shadow-pop"
        >
          <ul className="max-h-[300px] overflow-y-auto">
            {options.map((o) => {
              const on = value.includes(o.value);
              return (
                <li key={o.value}>
                  <button
                    aria-pressed={on}
                    onClick={() => {
                      if (single) {
                        onChange(on || o.value === "any" ? [] : [o.value]);
                        setOpen(false);
                      } else onChange(on ? value.filter((v) => v !== o.value) : [...value, o.value]);
                    }}
                    className={cx("flex min-h-9 w-full items-center gap-2.5 px-3 text-left hover:bg-background-subtle", on && "font-semibold")}
                  >
                    <span
                      className={cx(
                        "grid size-4 shrink-0 place-items-center border",
                        single ? "rounded-full" : "rounded-[3px]",
                        on ? "border-interactive-primary bg-interactive-primary text-white" : "border-interactive-secondary bg-white",
                      )}
                      aria-hidden
                    >
                      {on && <Check className="size-3" strokeWidth={3} />}
                    </span>
                    {o.flag && <Flag code={o.flag} />}
                    {o.label}
                  </button>
                </li>
              );
            })}
          </ul>
          {!single && count > 0 && (
            <button onClick={() => onChange([])} className="block w-full border-t border-border-subtle px-3 py-2 text-left font-semibold text-content-link hover:bg-background-subtle">
              Clear {label.toLowerCase()}
            </button>
          )}
        </div>
      )}
    </div>
  );
}

/** The Portal pager: page size, total, numbered pages with gaps, and Go to. */
function Pagination({ page, pages, size, total, onPage, onSize }: { page: number; pages: number; size: number; total: number; onPage: (p: number) => void; onSize: (n: number) => void }) {
  const [goto, setGoto] = useState(String(page));
  useEffect(() => setGoto(String(page)), [page]);
  const nums: Array<number | "gap"> = [];
  const win = new Set([1, pages, page - 1, page, page + 1, ...(page <= 3 ? [2, 3, 4, 5] : []), ...(page >= pages - 2 ? [pages - 4, pages - 3, pages - 2] : [])]);
  let last = 0;
  for (let p = 1; p <= pages; p++) {
    if (!win.has(p)) continue;
    if (p - last > 1) nums.push("gap");
    nums.push(p);
    last = p;
  }
  const btn = "grid h-8 min-w-8 place-items-center rounded-[4px] px-2 text-[13px] tnum transition-colors max-sm:h-10 max-sm:min-w-10";
  return (
    <nav aria-label="Report pages" className="mt-5 flex flex-wrap items-center justify-end gap-x-4 gap-y-3 text-[13px] text-content-main">
      <label className="relative">
        <span className="sr-only">Reports per page</span>
        <select
          value={size}
          onChange={(e) => onSize(Number(e.target.value))}
          className="h-8 appearance-none rounded-[4px] border border-border-subtle bg-white pr-8 pl-3 text-[13px] text-content-primary hover:border-border-neutral max-sm:h-10 max-sm:text-[16px]"
        >
          {PAGE_SIZES.map((n) => (
            <option key={n} value={n}>
              {n}/page
            </option>
          ))}
        </select>
        <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-content-tertiary" aria-hidden />
      </label>
      <span className="tnum">Total {nf.format(total)}</span>
      <div className="flex items-center gap-1.5">
        <button aria-label="Previous page" disabled={page === 1} onClick={() => onPage(page - 1)} className={cx(btn, "text-content-primary hover:bg-background-subtle disabled:text-content-tertiary/50 disabled:hover:bg-transparent")}>
          <ChevronLeft className="size-4" />
        </button>
        {nums.map((n, i) =>
          n === "gap" ? (
            <span key={`g${i}`} className="grid h-8 min-w-6 place-items-center text-content-tertiary" aria-hidden>
              …
            </span>
          ) : (
            <button
              key={n}
              aria-label={`Page ${n}`}
              aria-current={n === page ? "page" : undefined}
              onClick={() => onPage(n)}
              className={cx(btn, n === page ? "bg-portal-pill-selected font-semibold text-white" : "border border-border-subtle bg-white text-content-primary hover:border-border-neutral")}
            >
              {n}
            </button>
          ),
        )}
        <button aria-label="Next page" disabled={page === pages} onClick={() => onPage(page + 1)} className={cx(btn, "text-content-primary hover:bg-background-subtle disabled:text-content-tertiary/50 disabled:hover:bg-transparent")}>
          <ChevronRight className="size-4" />
        </button>
      </div>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const n = Math.min(pages, Math.max(1, Math.round(Number(goto)) || 1));
          onPage(n);
          setGoto(String(n));
        }}
        className="flex items-center gap-2"
      >
        <label htmlFor="goto-page">Go to</label>
        <input
          id="goto-page"
          inputMode="numeric"
          value={goto}
          onChange={(e) => setGoto(e.target.value.replace(/\D/g, ""))}
          onBlur={(e) => e.currentTarget.form?.requestSubmit()}
          className="h-8 w-12 rounded-[4px] border border-border-subtle bg-white text-center text-[13px] text-content-primary tnum hover:border-border-neutral focus:border-interactive-primary max-sm:h-10 max-sm:text-[16px]"
        />
      </form>
    </nav>
  );
}
