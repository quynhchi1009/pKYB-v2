import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftToLine,
  Bell,
  CircleArrowLeft,
  CodeXml,
  FileDiff,
  Gem,
  Headset,
  KeyRound,
  List,
  LogOut,
  Menu as MenuIcon,
  Eye,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  X,
} from "lucide-react";
import { useStore, type Scope } from "../state/store";
import { CATEGORY_LABEL, RECENT_DAYS, SEVERITY_LABEL, SEVERITY_RANK, isRecent, worstSeverity } from "../data/model";
import { NewTag, SEV_STYLE, Toasts, cx, formatNoticeDate } from "./ui";
import { SettingsHost } from "./SettingsPanel";
import { CartDrawer } from "./CartDrawer";
import { AnnouncementHost } from "./PkybAnnouncement";

/* The AsiaVerify wordmark: teal mark and "Asia", white "Verify", on a transparent ground for the charcoal sidebar.
   Collapsed, the frame narrows to the mark alone (the left 530 of 1972px). */
function Logo({ compact }: { compact?: boolean }) {
  return (
    <span className={cx("block h-9 overflow-hidden", compact ? "w-[37px]" : "w-[136px]")}>
      <img src="/asiaverify-logo.png" alt="AsiaVerify" width={1972} height={522} className="h-full w-auto max-w-none" />
    </span>
  );
}

function titleFor(path: string) {
  if (path.startsWith("/search")) return "Search for a business";
  if (path === "/reports") return "View Reports";
  if (path.startsWith("/reports/")) return "View Report";
  if (path.startsWith("/report")) return "Choose a report";
  return "Perpetual KYB (pKYB)";
}

/* Portal2 notifications come in kinds, each with its own line icon. pKYB change alerts are a kind of their own,
   drawn as a document with a change mark: the registry record changed. */
const NOTICE_KIND = {
  pkybChange: { icon: FileDiff, title: "pKYB Change" },
} as const;

const joinNames = (names: string[]) => (names.length < 2 ? names.join("") : `${names.slice(0, -1).join(", ")} and ${names[names.length - 1]}`);

/** Portal2's notifications popover: Refresh and Clear all in the header, a list of icon rows, dismissed one by one. */
function NotificationBell() {
  const { monitors, severity, prefs, simple } = useStore();
  const [open, setOpen] = useState(false);
  const [cleared, setCleared] = useState<string[]>([]);
  const [refreshing, setRefreshing] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const all = useMemo(() => {
    const out: Array<{ id: string; monitorId: string; name: string; date: string; sev: ReturnType<typeof worstSeverity>; changed: string }> = [];
    for (const m of monitors) {
      if (m.status !== "active") continue;
      for (const e of m.events) {
        if (!isRecent(e)) continue;
        const sev = worstSeverity(e.categories, severity);
        // Without severity every change notifies in-app; with it, only the severities the team switched on.
        if (!simple && !prefs.inApp[sev]) continue;
        out.push({ id: e.id, monitorId: m.id, name: m.name, date: e.date, sev, changed: joinNames(e.categories.map((c) => CATEGORY_LABEL[c])) });
      }
    }
    return out.sort((a, b) => (a.date === b.date ? SEVERITY_RANK[b.sev] - SEVERITY_RANK[a.sev] : a.date < b.date ? 1 : -1));
  }, [monitors, severity, prefs, simple]);
  // Clearing empties the bell, not the change feed: the changes themselves stay on record.
  const items = all.filter((n) => !cleared.includes(n.id));

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
  };
  const refresh = () => {
    setRefreshing(true);
    window.setTimeout(() => setRefreshing(false), 700);
  };

  return (
    <div
      className="relative"
      onKeyDown={(e) => {
        if (e.key === "Escape" && open) {
          e.stopPropagation();
          close();
        }
      }}
    >
      <button
        ref={trigger}
        onClick={() => setOpen((o) => !o)}
        aria-label={`Notifications, ${items.length} in the last ${RECENT_DAYS} days`}
        aria-expanded={open}
        className="relative grid size-10 place-items-center rounded-[4px] text-content-primary hover:bg-background-subtle"
      >
        <Bell className="size-6" strokeWidth={1.5} aria-hidden />
        {items.length > 0 && (
          <span aria-hidden className="absolute top-0 right-0 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-interactive-primary px-1 text-[11px] font-bold text-white ring-2 ring-white tnum">
            {items.length > 99 ? "99+" : items.length}
          </span>
        )}
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute top-[calc(100%+14px)] right-[-4px] z-50 w-[min(470px,calc(100vw-24px))] text-content-primary max-sm:fixed max-sm:inset-x-3 max-sm:top-[84px] max-sm:w-auto">
            {/* The notch points at the bell, as Portal2's does. */}
            <span aria-hidden className="absolute -top-[6px] right-[18px] size-3 rotate-45 border-t border-l border-portal-line bg-white max-sm:hidden" />
            <div className="relative overflow-hidden rounded-[8px] bg-white ring-1 ring-portal-line shadow-portal">
              <div className="px-6 pt-5">
                <div className="flex items-center justify-between gap-3 border-b border-border-subtle pb-4">
                  <h2 className="font-heading text-[16px] font-bold">Notifications</h2>
                  <div className="flex gap-2">
                    <button
                      onClick={refresh}
                      aria-busy={refreshing}
                      className="inline-flex h-7 items-center rounded-[4px] bg-portal-sidebar-selected px-3 text-[11px] font-bold tracking-[0.02em] text-white uppercase transition-colors hover:bg-background-demoted"
                    >
                      {refreshing ? "Refreshing" : "Refresh"}
                    </button>
                    <button
                      onClick={() => setCleared(all.map((n) => n.id))}
                      disabled={items.length === 0}
                      className="inline-flex h-7 items-center rounded-[4px] bg-background-subtle px-3 text-[11px] font-bold tracking-[0.02em] text-content-primary uppercase transition-colors hover:bg-portal-line disabled:cursor-not-allowed disabled:opacity-50"
                    >
                      Clear all
                    </button>
                  </div>
                </div>
              </div>

              <ul className={cx("max-h-[380px] overflow-y-auto px-6 pt-2 pb-4 transition-opacity", refreshing && "opacity-50")}>
                {items.length === 0 && (
                  <li className="px-3 py-8 text-center text-[13px] text-content-main">
                    {cleared.length > 0
                      ? "You're all caught up. Cleared alerts stay in the change feed."
                      : simple
                        ? `No changes recorded in the last ${RECENT_DAYS} days.`
                        : `No alerts in the last ${RECENT_DAYS} days at the severities you chose in Severity & alerts.`}
                  </li>
                )}
                {items.slice(0, 12).map((n) => {
                  const kind = NOTICE_KIND.pkybChange;
                  return (
                    <li key={n.id} className="group relative">
                      <Link
                        to={`/reports/${n.monitorId}?tab=pkyb`}
                        state={{ from: "monitoring" }}
                        onClick={() => setOpen(false)}
                        className="flex gap-3 rounded-[8px] px-3 py-3 pr-10 transition-colors hover:bg-background-subtle focus-visible:bg-background-subtle"
                      >
                        {simple ? (
                          // Every change wears the same yellow, so the icon carries it instead of a severity word.
                          <span className={cx("grid size-8 shrink-0 place-items-center rounded-full border", SEV_STYLE.medium.bg, SEV_STYLE.medium.line, SEV_STYLE.medium.text)}>
                            <kind.icon className="size-[18px]" strokeWidth={1.75} aria-hidden />
                          </span>
                        ) : (
                          <kind.icon className="size-7 shrink-0 text-content-primary" strokeWidth={1.5} aria-hidden />
                        )}
                        <span className="min-w-0 flex-1 text-[13px] leading-snug">
                          <span className="block font-bold text-interactive-primary">
                            {kind.title}
                            {!simple && (
                              <>
                                {" "}-{" "}
                                <span className={cx("uppercase", SEV_STYLE[n.sev].text)}>
                                  {SEVERITY_LABEL[n.sev]}
                                  <span className="sr-only"> severity</span>
                                </span>
                              </>
                            )}
                          </span>
                          <span className="mt-0.5 block font-semibold text-content-primary">{n.name}</span>
                          <span className="mt-1.5 block text-[12px] text-content-main">{n.changed} changed. Click here to view the change.</span>
                          <span className="mt-2 block text-right text-[12px] text-content-tertiary tnum">{formatNoticeDate(n.date)}</span>
                        </span>
                      </Link>
                      <button
                        onClick={() => setCleared((c) => [...c, n.id])}
                        aria-label={`Dismiss alert for ${n.name}`}
                        className="absolute top-3 right-3 grid size-6 place-items-center rounded-[4px] text-content-primary opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100 hover:bg-black/5 pointer-coarse:opacity-100"
                      >
                        <X className="size-4" />
                      </button>
                    </li>
                  );
                })}
              </ul>
            </div>
          </div>
        </>
      )}
    </div>
  );
}

function CartButton() {
  const { cart, openCart } = useStore();
  return (
    <button
      onClick={openCart}
      aria-label={cart.length ? `Cart, ${cart.length} ${cart.length === 1 ? "item" : "items"}` : "Cart"}
      className="relative grid size-10 place-items-center rounded-[4px] text-content-primary hover:bg-background-subtle"
    >
      <ShoppingCart className="size-6" strokeWidth={1.5} aria-hidden />
      {cart.length > 0 && <span aria-hidden className="absolute top-1.5 right-1 size-2.5 rounded-full bg-interactive-primary ring-2 ring-white" />}
    </button>
  );
}

type NavItem = { to: string; label: string; icon: typeof Search; tag?: boolean };
const NAV_TOP: NavItem[] = [
  { to: "/search", label: "Search", icon: Search },
  { to: "/reports", label: "View Reports", icon: List },
  { to: "/onboarding", label: "Onboarding Management", icon: Store },
];
const NAV_BOTTOM: NavItem[] = [
  { to: "/plan", label: "My Plan", icon: Gem },
  { to: "/pricing", label: "Products & Pricing", icon: Tag },
  { to: "/api-key", label: "API Key", icon: KeyRound, tag: true },
  { to: "/mcp", label: "MCP", icon: CodeXml, tag: true },
  { to: "/account", label: "Account Settings", icon: Settings },
];

function Sidebar({ collapsed, onCollapse, onNavigate }: { collapsed: boolean; onCollapse: () => void; onNavigate?: () => void }) {
  const navigate = useNavigate();
  const loc = useLocation();
  const inPkyb = loc.pathname.startsWith("/pkyb");

  const row = (active: boolean) =>
    cx(
      "group relative flex h-10 items-center gap-3 rounded-[4px] px-3 text-[14px] font-medium text-white transition-colors",
      active ? "bg-portal-sidebar-selected" : "hover:bg-chrome-control-hover",
      collapsed && "justify-center px-0",
    );

  const item = (n: NavItem) => (
    <NavLink key={n.to} to={n.to} onClick={onNavigate} className={({ isActive }) => row(isActive)} title={collapsed ? n.label : undefined}>
      <n.icon className="size-5 shrink-0" strokeWidth={1.75} />
      {!collapsed && <span className="truncate">{n.label}</span>}
      {!collapsed && n.tag && <NewTag dark />}
    </NavLink>
  );

  return (
    <nav aria-label="Portal" className={cx("nav-scroll flex h-full flex-col overflow-y-auto pt-2 pb-6", collapsed ? "px-3" : "px-4")}>
      <div className="flex flex-col gap-0.5">
        <button className={row(false)} onClick={() => navigate(-1)} title={collapsed ? "Previous Page" : undefined}>
          <CircleArrowLeft className="size-5 shrink-0" strokeWidth={1.75} />
          {!collapsed && "Previous Page"}
        </button>
        <button className={cx(row(false), "max-lg:hidden")} onClick={onCollapse} title={collapsed ? "Expand Sidebar" : undefined}>
          <ArrowLeftToLine className={cx("size-5 shrink-0 transition-transform", collapsed && "rotate-180")} strokeWidth={1.75} />
          {!collapsed && "Collapse Sidebar"}
        </button>
      </div>
      <div className="my-3 h-px bg-chrome-border" />
      <div className="flex flex-col gap-0.5">
        {NAV_TOP.map(item)}
        {/* Perpetual KYB is one page now: the overview, with settings opening over it. Company pages stay under it. */}
        <NavLink to="/pkyb/monitoring" onClick={onNavigate} className={() => row(inPkyb)} title={collapsed ? "Perpetual KYB" : undefined}>
          <Eye className={cx("size-5 shrink-0", inPkyb && "text-chrome-accent")} strokeWidth={1.75} />
          {!collapsed && (
            <>
              <span className={cx("truncate", inPkyb && "font-semibold")}>Perpetual KYB</span>
              <NewTag dark />
            </>
          )}
        </NavLink>
        {NAV_BOTTOM.map(item)}
      </div>
      <div className="mt-auto pt-6">
        <button className={row(false)} title={collapsed ? "Logout" : undefined}>
          <LogOut className="size-5 shrink-0" strokeWidth={1.75} />
          {!collapsed && "Logout"}
        </button>
      </div>
    </nav>
  );
}

const SCOPES: Array<{ value: Scope; label: string; short: string }> = [
  { value: "current", label: "Current", short: "Current" },
  { value: "simple", label: "Without severity & alerts", short: "No severity" },
];

/** A prototype control, not product UI: it flips the whole prototype between the current scope and the one without severity and alerts. */
function ScopeSwitch() {
  const { scope, setScope } = useStore();
  const onKey = (e: React.KeyboardEvent) => {
    if (!["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown"].includes(e.key)) return;
    e.preventDefault();
    const next: Scope = scope === "current" ? "simple" : "current";
    setScope(next);
    document.getElementById(`scope-${next}`)?.focus();
  };
  return (
    <div
      role="radiogroup"
      aria-label="Prototype version"
      onKeyDown={onKey}
      className="fixed bottom-4 left-1/2 z-[55] flex -translate-x-1/2 items-center gap-2 rounded-full bg-portal-sidebar p-1 pl-4 text-white shadow-dialog max-sm:pl-1"
    >
      <span aria-hidden className="text-[11px] font-semibold tracking-[0.06em] text-chrome-content-main uppercase max-sm:hidden">
        Version
      </span>
      {SCOPES.map((s) => {
        const on = scope === s.value;
        return (
          <button
            key={s.value}
            id={`scope-${s.value}`}
            role="radio"
            aria-checked={on}
            tabIndex={on ? 0 : -1}
            onClick={() => setScope(s.value)}
            className={cx(
              "h-8 rounded-full px-3.5 text-[13px] font-semibold whitespace-nowrap transition-colors",
              on ? "bg-white text-content-primary" : "text-white hover:bg-chrome-control-hover",
            )}
          >
            <span className="max-sm:hidden">{s.label}</span>
            <span className="sm:hidden">{s.short}</span>
          </button>
        );
      })}
    </div>
  );
}

/* Portal2 layout: a full-height charcoal sidebar carries the logo; the white top bar sits beside it,
   holding the page title in capitals and the bell and cart. */
export function AppShell({ children }: { children: ReactNode }) {
  const loc = useLocation();
  const [collapsed, setCollapsed] = useState(false);
  const [drawer, setDrawer] = useState(false);

  return (
    <div className="flex min-h-dvh bg-portal-canvas">
      <a
        href="#main"
        className="sr-only z-[70] rounded-[4px] bg-white px-4 py-2 text-[14px] font-semibold text-interactive-primary shadow-pop focus:not-sr-only focus:fixed focus:top-2 focus:left-2"
      >
        Skip to main content
      </a>

      <aside className={cx("sticky top-0 flex h-dvh shrink-0 flex-col bg-portal-sidebar max-lg:hidden", collapsed ? "w-[72px]" : "w-[260px]")}>
        <Link to="/pkyb/monitoring" aria-label="AsiaVerify home" className={cx("flex h-[92px] shrink-0 items-center", collapsed ? "justify-center" : "px-7")}>
          <Logo compact={collapsed} />
        </Link>
        <div className="min-h-0 flex-1">
          <Sidebar collapsed={collapsed} onCollapse={() => setCollapsed((c) => !c)} />
        </div>
      </aside>

      {drawer && (
        <div className="fixed inset-0 z-50 lg:hidden">
          <div className="absolute inset-0 bg-background-scrim" onClick={() => setDrawer(false)} />
          <aside className="absolute inset-y-0 left-0 flex w-[280px] flex-col bg-portal-sidebar shadow-dialog">
            <div className="flex h-[76px] shrink-0 items-center justify-between pr-4 pl-6">
              <Logo />
              <button className="grid size-9 place-items-center rounded-[4px] text-white hover:bg-chrome-control-hover" onClick={() => setDrawer(false)} aria-label="Close navigation">
                <X className="size-5" />
              </button>
            </div>
            <div className="min-h-0 flex-1">
              <Sidebar collapsed={false} onCollapse={() => {}} onNavigate={() => setDrawer(false)} />
            </div>
          </aside>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="sticky top-0 z-30 flex h-[76px] shrink-0 items-center gap-3 border-b border-portal-line bg-white px-4 sm:px-6 lg:px-11">
          <button className="-ml-1 grid size-10 place-items-center rounded-[4px] text-content-primary hover:bg-background-subtle lg:hidden" onClick={() => setDrawer(true)} aria-label="Open navigation">
            <MenuIcon className="size-5" />
          </button>
          <span className="truncate font-heading text-[18px] font-bold tracking-[0.01em] text-content-primary uppercase">{titleFor(loc.pathname)}</span>
          <div className="ml-auto flex items-center gap-2">
            <NotificationBell />
            <CartButton />
            {/* Portal2's Get Help: an outlined green button, collapsing to an icon on phones. */}
            <button
              aria-label="Get help"
              className="ml-2 inline-flex h-8 items-center gap-1.5 rounded-[4px] border border-interactive-primary bg-white px-6 text-[14px] font-bold text-interactive-primary transition-colors hover:bg-interactive-accent max-sm:ml-0 max-sm:size-10 max-sm:justify-center max-sm:px-0"
            >
              <Headset className="size-5 sm:hidden" aria-hidden />
              <span className="max-sm:sr-only">Get Help</span>
            </button>
          </div>
        </header>

        <main id="main" tabIndex={-1} className="min-w-0 flex-1 focus:outline-none">
          {children}
        </main>
      </div>
      <Toasts />
      <SettingsHost />
      <CartDrawer />
      <AnnouncementHost />
      <ScopeSwitch />
    </div>
  );
}
