import { useMemo, useRef, useState, type ReactNode } from "react";
import { Link, NavLink, useLocation, useNavigate } from "react-router-dom";
import {
  ArrowLeftToLine,
  Bell,
  ChevronDown,
  CircleArrowLeft,
  CodeXml,
  Gem,
  Headset,
  KeyRound,
  List,
  LogOut,
  Menu as MenuIcon,
  Radar,
  Search,
  Settings,
  ShoppingCart,
  Store,
  Tag,
  X,
} from "lucide-react";
import { useStore } from "../state/store";
import { CATEGORY_LABEL, RECENT_DAYS, SEVERITY_LABEL, SEVERITY_RANK, isRecent, worstSeverity } from "../data/model";
import { NewTag, SEV_STYLE, Toasts, cx, formatDate } from "./ui";

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
  if (path.startsWith("/reports/")) return "View Report";
  if (path.startsWith("/report")) return "Choose a report";
  return "Perpetual KYB (pKYB)";
}

function NotificationBell() {
  const { monitors, severity, prefs } = useStore();
  const [open, setOpen] = useState(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const items = useMemo(() => {
    const out: Array<{ id: string; monitorId: string; name: string; date: string; label: string; sev: ReturnType<typeof worstSeverity> }> = [];
    for (const m of monitors) {
      if (m.status !== "active") continue;
      for (const e of m.events) {
        if (!isRecent(e)) continue;
        const sev = worstSeverity(e.categories, severity);
        if (!prefs.inApp[sev]) continue;
        out.push({ id: e.id, monitorId: m.id, name: m.name, date: e.date, sev, label: e.categories.map((c) => CATEGORY_LABEL[c]).join(", ") });
      }
    }
    return out.sort((a, b) => (a.date === b.date ? SEVERITY_RANK[b.sev] - SEVERITY_RANK[a.sev] : a.date < b.date ? 1 : -1));
  }, [monitors, severity, prefs]);

  const close = () => {
    setOpen(false);
    trigger.current?.focus();
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
          <div className="absolute top-12 right-0 z-50 w-[min(380px,calc(100vw-24px))] overflow-hidden rounded-[6px] border border-border-subtle bg-white text-content-primary shadow-pop">
            <div className="flex items-baseline justify-between border-b border-border-subtle px-4 py-3">
              <p className="text-[14px] font-semibold">pKYB alerts</p>
              <Link to="/pkyb/settings" onClick={() => setOpen(false)} className="text-[12px] text-content-link hover:underline">
                Alert settings
              </Link>
            </div>
            <ul className="max-h-[360px] overflow-y-auto">
              {items.length === 0 && <li className="px-4 py-6 text-center text-[13px] text-content-main">No alerts in the last {RECENT_DAYS} days at the severities you chose in Alert settings.</li>}
              {items.slice(0, 8).map((n) => (
                <li key={n.id}>
                  <Link
                    to={`/pkyb/monitoring/${n.monitorId}`}
                    onClick={() => setOpen(false)}
                    className="flex gap-3 border-b border-border-subtle/70 px-4 py-3 hover:bg-base-contrast"
                  >
                    <span className={cx("mt-1.5 size-2 shrink-0 rounded-full", SEV_STYLE[n.sev].dot)} aria-hidden />
                    <span className="min-w-0">
                      <span className="block truncate text-[13px] font-semibold">
                        <span className="sr-only">{SEVERITY_LABEL[n.sev]} severity. </span>
                        {n.name}
                      </span>
                      <span className="block text-[12px] text-content-main">
                        {n.label} changed · {formatDate(n.date)}
                      </span>
                    </span>
                  </Link>
                </li>
              ))}
            </ul>
            {/* The feed opens on the same set the bell counts: recent changes at the severities you get alerts for. */}
            <Link
              to="/pkyb/monitoring?tab=feed&alerts=1"
              onClick={() => setOpen(false)}
              className="block px-4 py-2.5 text-center text-[13px] font-semibold text-interactive-primary hover:bg-interactive-accent"
            >
              {items.length ? `See all ${items.length} alerts in the change feed` : "Open the change feed"}
            </Link>
          </div>
        </>
      )}
    </div>
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
  const [pkybOpen, setPkybOpen] = useState(true);

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
        <button
          className={row(inPkyb && collapsed)}
          aria-expanded={pkybOpen}
          onClick={() => (collapsed ? navigate("/pkyb/monitoring") : setPkybOpen((o) => !o))}
          title={collapsed ? "pKYB" : undefined}
        >
          <Radar className={cx("size-5 shrink-0", inPkyb && "text-chrome-accent")} strokeWidth={1.75} />
          {!collapsed && (
            <>
              <span className={cx(inPkyb && "font-semibold")}>pKYB</span>
              <NewTag dark />
              <ChevronDown className={cx("ml-auto size-4 transition-transform", !pkybOpen && "-rotate-90")} />
            </>
          )}
        </button>
        {pkybOpen && !collapsed && (
          <div className="ml-[22px] flex flex-col gap-0.5 border-l border-chrome-border py-0.5 pl-3">
            {[
              { to: "/pkyb/monitoring", label: "Monitoring" },
              { to: "/pkyb/settings", label: "Severity Settings" },
            ].map((s) => (
              <NavLink
                key={s.to}
                to={s.to}
                onClick={onNavigate}
                className={({ isActive }) =>
                  cx(
                    "relative flex h-9 items-center rounded-[4px] px-3 text-[14px] transition-colors",
                    isActive
                      ? "bg-portal-sidebar-selected font-semibold text-white before:absolute before:top-2 before:bottom-2 before:-left-[13px] before:w-[2px] before:rounded-full before:bg-chrome-accent"
                      : "text-chrome-content-main hover:bg-chrome-control-hover hover:text-white",
                  )
                }
              >
                {s.label}
              </NavLink>
            ))}
          </div>
        )}
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
            <Link to="/cart" aria-label="Cart" className="grid size-10 place-items-center rounded-[4px] text-content-primary hover:bg-background-subtle">
              <ShoppingCart className="size-6" strokeWidth={1.5} aria-hidden />
            </Link>
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
    </div>
  );
}
