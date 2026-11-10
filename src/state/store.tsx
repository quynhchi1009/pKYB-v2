import { createContext, useCallback, useContext, useMemo, useRef, useState, type ReactNode } from "react";
import {
  CURRENT_USER,
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

/** One report order waiting in the cart. A KYB Basic line can carry pKYB monitoring, which is built on that report. */
export type CartItem = {
  id: string;
  company: Company;
  report: ReportType;
  languages: Array<"en" | "og">;
  aml: boolean;
  matchType?: string;
  monitoring?: { frequency: string; expiry: string };
  /** pKYB monitoring attached to this KYB Basic order: the report is its baseline. */
  pkyb: boolean;
};

type Store = {
  /** The signed-in user's own pKYB monitors. A teammate's monitor on the same company is a separate monitor and never appears here. */
  monitors: Monitor[];
  /**
   * Every monitor in the enterprise group, teammates' included. Only for reading a report's baseline link:
   * lists, counts, alerts and "already monitored" checks all use `monitors`.
   */
  groupMonitors: Monitor[];
  /** The saved mapping every view colours by. */
  severity: SeverityMap;
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
  /** Every report order on the account, newest first: what View Reports lists. */
  reportOrders: ReportOrder[];
  /** Places a one-off report order. It shows as Processing in View Reports, then turns Completed. */
  orderReport: (c: Company, type: ReportType, opts?: { aml?: boolean }) => ReportOrder;
  cart: CartItem[];
  cartOpen: boolean;
  /** True right after an add, so the drawer can say so. It clears when the drawer closes. */
  cartJustAdded: boolean;
  openCart: () => void;
  closeCart: () => void;
  /** Adds an order and opens the cart. Ordering the same report for the same company again replaces the earlier line. */
  addToCart: (item: Omit<CartItem, "id">) => void;
  /** Removes lines and offers Undo. */
  removeFromCart: (ids: string[]) => void;
  setCartPkyb: (id: string, on: boolean) => void;
  /** Places every cart line as a report order, starting a monitor where pKYB is attached. Empties the cart. */
  checkout: () => { reports: number; monitors: number };
  toasts: Toast[];
  toast: (t: Omit<Toast, "id">) => void;
  dismissToast: (id: number) => void;
};

const Ctx = createContext<Store | null>(null);

export function StoreProvider({ children }: { children: ReactNode }) {
  const [monitors, setMonitors] = useState<Monitor[]>(() => generateMonitors());
  const [reportOrders, setReportOrders] = useState<ReportOrder[]>(() => generateReportOrders(monitors));
  const [severity, setSeverityMap] = useState<SeverityMap>(DEMO_ORG_SEVERITY);
  const [severityChange, setSeverityChange] = useState<SeverityChange | null>(null);
  const [prefs, setPrefs] = useState<NotifyPrefs>({
    inApp: { low: false, medium: true, high: true },
    weekly: { low: true, medium: true, high: true },
    daily: { low: false, medium: false, high: false },
  });
  const [cart, setCart] = useState<CartItem[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  const [cartJustAdded, setCartJustAdded] = useState(false);
  const [toasts, setToasts] = useState<Toast[]>([]);
  const seq = useRef(0);
  const cartSeq = useRef(1);
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
      user: CURRENT_USER,
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

  const openCart = useCallback(() => setCartOpen(true), []);
  const closeCart = useCallback(() => {
    setCartOpen(false);
    setCartJustAdded(false);
  }, []);
  const addToCart = useCallback((item: Omit<CartItem, "id">) => {
    setCart((all) => [
      { ...item, id: `cart-${cartSeq.current++}` },
      ...all.filter((x) => !(x.company.id === item.company.id && x.report === item.report)),
    ]);
    setCartJustAdded(true);
    setCartOpen(true);
  }, []);
  const removeFromCart = useCallback(
    (ids: string[]) => {
      const gone = cart.filter((x) => ids.includes(x.id));
      if (!gone.length) return;
      setCart((all) => all.filter((x) => !ids.includes(x.id)));
      toast({
        title: gone.length === 1 ? "Removed from cart" : `${gone.length} items removed from cart`,
        body: gone.length === 1 ? gone[0].company.name : undefined,
        action: { label: "Undo", onClick: () => setCart((all) => [...gone, ...all]) },
      });
    },
    [cart, toast],
  );
  const setCartPkyb = useCallback((id: string, on: boolean) => setCart((all) => all.map((x) => (x.id === id ? { ...x, pkyb: on } : x))), []);

  // A monitor belongs to whoever ordered its baseline report.
  const ownMonitors = useMemo(() => {
    const theirs = new Set(reportOrders.filter((o) => o.monitorId && o.user !== CURRENT_USER).map((o) => o.monitorId));
    return monitors.filter((m) => !theirs.has(m.id));
  }, [monitors, reportOrders]);

  const value = useMemo<Store>(() => {
    const createMonitor = (c: Company): Monitor => {
      const existing = ownMonitors.find((m) => m.regNo === c.regNo && m.status === "active");
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
    };
    return {
      monitors: ownMonitors,
      groupMonitors: monitors,
      severity,
      saveSeverity: (map, summary) => {
        setSeverityMap(map);
        setSeverityChange({ summary, by: "You", at: iso(TODAY) });
      },
      severityChange,
      prefs,
      savePrefs: setPrefs,
      createMonitor,
      checkout: () => {
        let started = 0;
        for (const item of cart) {
          const watched = ownMonitors.some((m) => m.regNo === item.company.regNo && m.status === "active");
          if (item.pkyb && !watched) {
            createMonitor(item.company);
            started++;
          } else {
            orderReport(item.company, item.report, { aml: item.aml });
          }
        }
        const placed = cart.length;
        setCart([]);
        return { reports: placed, monitors: started };
      },
      stopMonitors: (ids) =>
        setMonitors((all) =>
          all.map((m) => (ids.includes(m.id) && m.status === "active" ? { ...m, status: "stopped", endedAt: iso(TODAY) } : m)),
        ),
      setReviewed,
      reviewWithUndo,
      reportOrders,
      orderReport,
      cart,
      cartOpen,
      cartJustAdded,
      openCart,
      closeCart,
      addToCart,
      removeFromCart,
      setCartPkyb,
      toasts,
      toast,
      dismissToast,
    };
  }, [
    monitors,
    ownMonitors,
    severity,
    severityChange,
    prefs,
    toasts,
    toast,
    dismissToast,
    setReviewed,
    reviewWithUndo,
    reportOrders,
    orderReport,
    newOrder,
    cart,
    cartOpen,
    cartJustAdded,
    openCart,
    closeCart,
    addToCart,
    removeFromCart,
    setCartPkyb,
  ]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useStore() {
  const s = useContext(Ctx);
  if (!s) throw new Error("useStore outside StoreProvider");
  return s;
}
