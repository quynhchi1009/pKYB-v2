import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  DEMO_ORG_SEVERITY,
  TODAY,
  iso,
  generateMonitors,
  generateReportOrders,
  isoLocal,
  orderNoFor,
  REPORT_TYPE_LABEL,
  type Company,
  type ReportOrder,
  type ReportType,
  type Monitor,
  type Severity,
  type SeverityMap,
} from "../data/model";

export type NotifyPrefs = {
  inApp: Record<Severity, boolean>;
  weekly: Record<Severity, boolean>;
  daily: Record<Severity, boolean>;
};


/** Who changed the org-wide severity mapping last, and what they changed. */
export type SeverityChange = { summary: string; by: string; at: string };

export type Toast = { id: number; title: string; body?: string; tone?: "success" | "neutral"; action?: { label: string; onClick: () => void } };

type Store = {
  monitors: Monitor[];
  /** The mapping every view colours by: the saved mapping, or the unsaved draft while the settings side panel previews it. */
  severity: SeverityMap;
  /** The mapping as saved, whatever is being previewed. */
  savedSeverity: SeverityMap;
  /** Recolours the app with an unsaved mapping (the side-panel settings variant); null ends the preview. */
  previewSeverity: (map: SeverityMap | null) => void;
  previewing: boolean;
  /** Prototype review switch for how Severity & Notification settings open: A, a modal popup; B, a right side panel. */
  settingsVariant: "a" | "b";
  setSettingsVariant: (v: "a" | "b") => void;
  /** Replaces the whole mapping and records who changed it, so the page can show attribution. */
  saveSeverity: (map: SeverityMap, summary: string) => void;
  severityChange: SeverityChange | null;
  prefs: NotifyPrefs;
  savePrefs: (p: NotifyPrefs) => void;
  createMonitor: (c: Company) => Monitor;
  stopMonitors: (ids: string[]) => void;
  /** Set reviewed state on many events at once. Returns nothing; callers keep the ids for Undo. */
  setReviewed: (eventIds: string[], reviewed: boolean) => void;
  /** Marks events reviewed and shows a toast with Undo. */
  reviewWithUndo: (eventIds: string[], label?: string, body?: string) => void;
  reports: Record<string, "generating" | "ready">;
  /** Every report order on the account, newest first: what View Reports lists. */
  reportOrders: ReportOrder[];
  /** Places a one-off report order. It shows as Processing in View Reports, then turns Completed. */
  orderReport: (c: Company, type: ReportType, opts?: { aml?: boolean }) => ReportOrder;
  /** The list the analyst opened a company from, so the company page can offer "Next". */
  requestReport: (monitorId: string) => void;
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [monitors, setMonitors] = useState<Monitor[]>(() => generateMonitors());
  const [reportOrders, setReportOrders] = useState<ReportOrder[]>(() => generateReportOrders(monitors));
  const [severity, setSeverityMap] = useState<SeverityMap>(DEMO_ORG_SEVERITY);
  const [preview, setPreview] = useState<SeverityMap | null>(null);
  const [settingsVariant, setSettingsVariant] = useState<"a" | "b">("a");
  const [severityChange, setSeverityChange] = useState<SeverityChange | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs>({
    inApp: { low: false, medium: true, high: true },
    weekly: { low: true, medium: true, high: true },
    daily: { low: false, medium: false, high: false },
  });
  const [toasts, setToasts] = useState<Toast[]>([]);
  const [reports, setReports] = useState<Record<string, "generating" | "ready">>({});
  const seq = useRef(0);
  const orderSeq = useRef(1);

  // Toasts dismiss themselves (see Toasts in ui.tsx) so a hover or focus can pause the timer.
  const toast = useCallback((t: Omit<Toast, "id">) => {
    const id = ++seq.current;
    setToasts((all) => [...all, { ...t, id }]);
  }, []);
  const dismissToast = useCallback((id: number) => setToasts((all) => all.filter((x) => x.id !== id)), []);

  const setReviewed = useCallback((eventIds: string[], reviewed: boolean) => {
    const ids = new Set(eventIds);
    setMonitors((all) =>
      all.map((m) =>
        m.events.some((e) => ids.has(e.id))
          ? {
              ...m,
              events: m.events.map((e) =>
                ids.has(e.id) ? { ...e, reviewed, reviewedBy: reviewed ? "You" : undefined, reviewedAt: reviewed ? iso(TODAY) : undefined } : e,
              ),
            }
          : m,
      ),
    );
  }, []);
  const reviewWithUndo = useCallback(
    (eventIds: string[], label?: string, body?: string) => {
      if (!eventIds.length) return;
      setReviewed(eventIds, true);
      toast({
        title: label ?? (eventIds.length === 1 ? "Marked as reviewed" : `${eventIds.length} changes marked as reviewed`),
        body,
        action: { label: "Undo", onClick: () => setReviewed(eventIds, false) },
      });
    },
    [setReviewed, toast],
  );
  const requestReport = useCallback((monitorId: string) => {
    setReports((r) => ({ ...r, [monitorId]: "generating" }));
    window.setTimeout(() => setReports((r) => ({ ...r, [monitorId]: "ready" })), 3000);
  }, []);

  /** A new order, stamped with today's demo date and the current clock time. */
  const newOrder = useCallback((c: Company, type: ReportType, extra: Partial<ReportOrder>): ReportOrder => {
    const now = new Date();
    const at = new Date(TODAY);
    at.setHours(now.getHours(), now.getMinutes(), now.getSeconds());
    const orderNo = orderNoFor(at, orderSeq.current++);
    return {
      id: orderNo,
      orderNo,
      createdAt: isoLocal(at),
      companyName: c.name,
      localName: c.localName,
      regNo: c.regNo,
      jurisdiction: c.jurisdiction,
      user: "Me",
      type,
      status: "processing",
      aml: false,
      ...extra,
    };
  }, []);

  const orderReport = useCallback(
    (c: Company, type: ReportType, opts?: { aml?: boolean }) => {
      const o = newOrder(c, type, { aml: !!opts?.aml });
      setReportOrders((all) => [o, ...all]);
      window.setTimeout(() => {
        setReportOrders((all) => all.map((x) => (x.id === o.id ? { ...x, status: "completed" } : x)));
        toast({ title: `${REPORT_TYPE_LABEL[type]} report ready`, body: `${c.name}. Open it from View Reports.` });
      }, 4000);
      return o;
    },
    [newOrder, toast],
  );

  const value = useMemo<Store>(
    () => ({
      monitors,
      severity: preview ?? severity,
      savedSeverity: severity,
      previewSeverity: setPreview,
      previewing: !!preview,
      settingsVariant,
      setSettingsVariant,
      saveSeverity: (map, summary) => {
        setSeverityMap(map);
        setSeverityChange({ summary, by: "You", at: iso(TODAY) });
      },
      severityChange,
      prefs,
      savePrefs: setPrefs,
      createMonitor: (c) => {
        const existing = monitors.find((m) => m.regNo === c.regNo && m.status === "active");
        if (existing) return existing;
        const m: Monitor = {
          id: `new-${c.id}`,
          name: c.name,
          localName: c.localName,
          regNo: c.regNo,
          jurisdiction: c.jurisdiction,
          createdAt: iso(TODAY),
          lastChecked: iso(TODAY),
          status: "active",
          events: [],
        };
        setMonitors((all) => [m, ...all]);
        // The monitor's KYB Basic baseline is a report order like any other, so it lists in View Reports.
        setReportOrders((all) => [newOrder(c, "basic", { status: "completed", monitorId: m.id }), ...all]);
        return m;
      },
      stopMonitors: (ids) =>
        setMonitors((all) =>
          all.map((m) => (ids.includes(m.id) && m.status === "active" ? { ...m, status: "stopped", endedAt: iso(TODAY) } : m)),
        ),
      setReviewed,
      reviewWithUndo,
      reports,
      requestReport,
      reportOrders,
      orderReport,
      toasts,
      toast,
      dismissToast,
    }),
    [monitors, severity, preview, settingsVariant, severityChange, prefs, toasts, toast, dismissToast, setReviewed, reviewWithUndo, reports, requestReport, reportOrders, orderReport, newOrder],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
