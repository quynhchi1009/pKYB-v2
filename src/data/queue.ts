// Shared triage logic: the Monitoring table and the company page's queue bar must agree on
// which monitors match a filter and in what order, so both read from here.
import { CATEGORY_LABEL, RECENT_DAYS, SEVERITY_LABEL, SEVERITY_RANK, isRecent, worstSeverity, type Category, type ChangeEvent, type Monitor, type Severity, type SeverityMap } from "./model";

export type Row = {
  m: Monitor;
  latest?: ChangeEvent;
  latestSev?: Severity;
  /** Changes detected in the last RECENT_DAYS days. */
  recent: number;
  recentSev?: Severity;
};

export type Filters = {
  q: string;
  jur: string;
  sev: "all" | Severity;
  cat: string;
  recent: boolean;
  sort: "severity" | "date";
};

export function filtersFromParams(p: URLSearchParams): Filters {
  return {
    q: p.get("q") ?? "",
    jur: p.get("jur") ?? "all",
    sev: (p.get("sev") as Severity | null) ?? "all",
    cat: p.get("cat") ?? "all",
    recent: p.get("recent") === "1",
    sort: p.get("sort") === "date" ? "date" : "severity",
  };
}

/** The row features the most severe recent change; with nothing recent, the latest one. */
export function buildRow(m: Monitor, severity: SeverityMap): Row {
  const rec = m.events.filter(isRecent);
  let focus: ChangeEvent | undefined;
  let recSev: Severity | undefined;
  for (const e of rec) {
    const s = worstSeverity(e.categories, severity);
    if (!recSev || SEVERITY_RANK[s] > SEVERITY_RANK[recSev]) (recSev = s), (focus = e);
  }
  const latest = focus ?? m.events[0];
  return { m, latest, latestSev: latest && worstSeverity(latest.categories, severity), recent: rec.length, recentSev: recSev };
}

export function applyFilters(rows: Row[], f: Filters): Row[] {
  const needle = f.q.trim().toLowerCase();
  const out = rows.filter((r) => {
    if (needle && !(r.m.name.toLowerCase().includes(needle) || r.m.regNo.toLowerCase().includes(needle) || (r.m.localName ?? "").includes(needle))) return false;
    if (f.jur !== "all" && r.m.jurisdiction !== f.jur) return false;
    if (f.recent && !r.recent) return false;
    if (f.sev !== "all" && r.latestSev !== f.sev) return false;
    if (f.cat !== "all" && !r.latest?.categories.includes(f.cat as Category)) return false;
    return true;
  });
  const rank = (r: Row) => (r.recentSev ? 10 + SEVERITY_RANK[r.recentSev] : r.latestSev ? SEVERITY_RANK[r.latestSev] : 0);
  const byDate = (a: Row, b: Row) => ((b.latest?.date ?? "") > (a.latest?.date ?? "") ? 1 : (b.latest?.date ?? "") < (a.latest?.date ?? "") ? -1 : 0);
  out.sort((a, b) => (f.sort === "severity" ? rank(b) - rank(a) || byDate(a, b) : byDate(a, b)));
  return out;
}

/** Short human label for a filter set, e.g. "High · Last 30 days". */
export function describeFilters(f: Filters): string {
  const parts: string[] = [];
  if (f.sev !== "all") parts.push(SEVERITY_LABEL[f.sev]);
  if (f.cat !== "all") parts.push(CATEGORY_LABEL[f.cat as Category]);
  if (f.recent) parts.push(`Last ${RECENT_DAYS} days`);
  if (f.jur !== "all") parts.push(f.jur);
  if (f.q.trim()) parts.push(`“${f.q.trim()}”`);
  return parts.length ? parts.join(" · ") : "All active monitors";
}
