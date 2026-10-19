import { useEffect, useId, useLayoutEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { useSearchParams } from "react-router-dom";
import { Bell, Check, ChevronDown, Eye, RotateCcw, Settings, SlidersHorizontal, X } from "lucide-react";
import { CATEGORIES, CATEGORY_LABEL, DEFAULT_SEVERITY, SEVERITIES, SEVERITY_LABEL, isRecent, worstSeverity, type Severity, type SeverityMap } from "../data/model";
import { buildRow } from "../data/queue";
import { useStore, type NotifyPrefs } from "../state/store";
import { Button, CATEGORY_ICON, Dialog, SEV_STYLE, cx, formatDate, nf } from "./ui";

export type SettingsSection = "severity" | "notifications";

/**
 * One name for the settings and one for each half, used everywhere: "Severity & alerts", made of "Severity" and
 * "Alerts". The URL keeps `severity` / `notifications` so links already in the wild still open the right half.
 */
export const SETTINGS_NAME = "Severity & alerts";
const SECTIONS: Array<{ id: SettingsSection; title: string; desc: string; icon: typeof Bell }> = [
  { id: "severity", title: "Severity", desc: "How serious each type of change is", icon: SlidersHorizontal },
  { id: "notifications", title: "Alerts", desc: "In-app alerts and email digests", icon: Bell },
];
const CHANNELS: Array<{ key: keyof NotifyPrefs; title: string; desc: string }> = [
  { key: "inApp", title: "In-app alerts", desc: "The bell in the top bar" },
  { key: "daily", title: "Daily email digest", desc: "A summary once a day" },
  { key: "weekly", title: "Weekly email digest", desc: "A summary once a week" },
];
const TIERS: Severity[] = ["high", "medium", "low"];
const plural = (n: number, one: string, many: string) => `${nf.format(n)} ${n === 1 ? one : many}`;

// What opened the settings, so closing them puts keyboard focus back there; and the half last shown, which the
// overview's button reopens. Both live for the session only.
let opener: HTMLElement | null = null;
let lastSection: SettingsSection = "severity";

/**
 * Opens Severity & alerts over the current page, at a section. Every settings link in the app goes through here.
 * `returnTo` names where focus goes on close when the control that was clicked won't survive, such as a link inside
 * a popover that closes as the settings open.
 */
export function useOpenSettings() {
  const [, setParams] = useSearchParams();
  return (section: SettingsSection, returnTo?: HTMLElement | null) => {
    opener = returnTo ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set("settings", section);
      return next;
    });
  };
}

/** Focus goes back to the opener if it is still on screen, else to the page content, never to the top of the shell. */
function restoreFocus() {
  const el = opener;
  opener = null;
  const usable = el?.isConnected && el.getClientRects().length > 0 && !el.closest("dialog:not([open]), [inert]");
  (usable ? el : document.getElementById("main"))?.focus({ preventScroll: true });
}

/**
 * Mounted once in the app shell. `?settings=severity|notifications` on any page opens the settings there, so a
 * "severity settings" link never takes the analyst away from the company they were reading.
 */
export function SettingsHost() {
  const [params, setParams] = useSearchParams();
  const { settingsVariant } = useStore();
  const raw = params.get("settings");
  const section: SettingsSection | null = raw === "notifications" ? "notifications" : raw ? "severity" : null;
  const wasOpen = useRef(false);
  if (section) lastSection = section;
  // Closing by any route (Cancel, Escape, Save, Discard) lands here, so focus is restored once for all of them.
  // It waits a frame so a closing native dialog can't move focus after us.
  useEffect(() => {
    if (section) wasOpen.current = true;
    else if (wasOpen.current) {
      wasOpen.current = false;
      const id = requestAnimationFrame(restoreFocus);
      return () => cancelAnimationFrame(id);
    }
  }, [section]);
  const set = (s: SettingsSection | null) =>
    setParams(
      (prev) => {
        const next = new URLSearchParams(prev);
        if (s) next.set("settings", s);
        else next.delete("settings");
        return next;
      },
      { replace: true },
    );
  if (!section) return null;
  return settingsVariant === "b" ? <SidePanel section={section} goTo={set} onClose={() => set(null)} /> : <PopupSettings section={section} goTo={set} onClose={() => set(null)} />;
}

/* ---------------------------------------------------------------- shared draft + save model */

/** One save model for both halves: edit freely, see the impact, then save together. `live` previews the draft mapping app-wide. */
function useSettingsDraft(live: boolean) {
  const { savedSeverity, saveSeverity, severityChange, prefs, savePrefs, toast, monitors, previewSeverity } = useStore();
  const [draftMap, setDraftMap] = useState<SeverityMap>(savedSeverity);
  const [draft, setDraft] = useState<NotifyPrefs>(prefs);
  // Follow the saved values when they change elsewhere (an Undo from a toast, for instance).
  useEffect(() => setDraftMap(savedSeverity), [savedSeverity]);
  useEffect(() => setDraft(prefs), [prefs]);

  const changed = CATEGORIES.filter((c) => draftMap[c] !== savedSeverity[c]);
  const prefChanges = CHANNELS.reduce((n, ch) => n + SEVERITIES.filter((s) => draft[ch.key][s] !== prefs[ch.key][s]).length, 0);
  const pending = changed.length + prefChanges;
  const mappingChanged = changed.length > 0;

  useEffect(() => {
    if (live) previewSeverity(mappingChanged ? draftMap : null);
  }, [live, mappingChanged, draftMap, previewSeverity]);
  useEffect(() => () => previewSeverity(null), [previewSeverity]);

  // What saving would do, before it does it: companies whose headline severity moves, and in-app alert volume.
  const impact = useMemo(() => {
    if (!pending) return null;
    let companies = 0;
    let before = 0;
    let after = 0;
    for (const m of monitors) {
      if (m.status !== "active") continue;
      if (mappingChanged && m.events.length && buildRow(m, savedSeverity).latestSev !== buildRow(m, draftMap).latestSev) companies++;
      for (const e of m.events) {
        if (!isRecent(e)) continue;
        if (prefs.inApp[worstSeverity(e.categories, savedSeverity)]) before++;
        if (draft.inApp[worstSeverity(e.categories, draftMap)]) after++;
      }
    }
    return { companies, before, after };
  }, [monitors, savedSeverity, draftMap, prefs, draft, pending, mappingChanged]);

  const details: string[] = [];
  if (impact) {
    if (mappingChanged) details.push(`${plural(impact.companies, "company changes", "companies change")} severity`);
    if (impact.before !== impact.after) details.push(`in-app alerts ${nf.format(impact.before)} → ${nf.format(impact.after)}`);
    if (!details.length) details.push("alert preferences change");
  }

  const discard = () => {
    setDraftMap(savedSeverity);
    setDraft(prefs);
  };
  const save = () => {
    const prevMap = savedSeverity;
    const prevPrefs = prefs;
    const first = changed[0];
    const summary = changed.length === 1 ? `${CATEGORY_LABEL[first]}: ${SEVERITY_LABEL[savedSeverity[first]]} → ${SEVERITY_LABEL[draftMap[first]]}` : `${changed.length} categories changed`;
    const prefsChanged = prefChanges > 0;
    if (mappingChanged) saveSeverity(draftMap, summary);
    if (prefsChanged) savePrefs(draft);
    const moved = impact?.companies ?? 0;
    toast({
      title:
        mappingChanged && prefsChanged
          ? "Changes saved"
          : mappingChanged
            ? changed.length === 1
              ? `${CATEGORY_LABEL[first]} is now ${SEVERITY_LABEL[draftMap[first]]}`
              : `${changed.length} severity changes saved`
            : "Alert preferences saved",
      body: mappingChanged ? (moved ? `${plural(moved, "company changes", "companies change")} severity in Perpetual KYB.` : "No company changes severity right now.") : undefined,
      action: {
        label: "Undo",
        onClick: () => {
          if (mappingChanged) saveSeverity(prevMap, "Restored the previous mapping");
          if (prefsChanged) savePrefs(prevPrefs);
        },
      },
    });
  };

  return { savedSeverity, severityChange, prefs, draftMap, setDraftMap, draft, setDraft, changed, prefChanges, pending, details, discard, save };
}
type Draft = ReturnType<typeof useSettingsDraft>;

/** Closing with unsaved edits asks first, in place, instead of silently dropping them. */
function useCloseGuard(d: Draft, onClose: () => void) {
  const [asking, setAsking] = useState(false);
  useEffect(() => {
    if (!d.pending) setAsking(false);
  }, [d.pending]);
  const requestClose = () => (d.pending ? setAsking(true) : onClose());
  return { asking, setAsking, requestClose };
}

/* ---------------------------------------------------------------- sections */

function SeverityMapping({ d, compact }: { d: Draft; compact?: boolean }) {
  const customised = CATEGORIES.some((c) => d.savedSeverity[c] !== DEFAULT_SEVERITY[c]);
  const draftIsDefault = CATEGORIES.every((c) => d.draftMap[c] === DEFAULT_SEVERITY[c]);
  const cols = compact ? "grid-cols-[minmax(0,1fr)_132px]" : "grid-cols-[minmax(0,1fr)_minmax(132px,188px)]";
  return (
    <div className="overflow-hidden rounded-[6px] border border-border-subtle bg-white">
      <div className={cx("grid gap-4 border-b border-border-subtle bg-background-subtle px-4 py-2.5 text-[12px] font-semibold text-content-main", cols)}>
        <span>Change category</span>
        <span>Severity</span>
      </div>
      <ul className="divide-y divide-border-subtle">
        {CATEGORIES.map((c) => {
          const Icon = CATEGORY_ICON[c];
          const cur = d.draftMap[c];
          const unsaved = cur !== d.savedSeverity[c];
          return (
            <li key={c} className={cx("grid items-center gap-4 px-4 py-2.5", cols, unsaved && "bg-interactive-selected")}>
              <span className="flex min-w-0 items-start gap-3">
                <Icon className="mt-0.5 size-[18px] shrink-0 text-interactive-primary" aria-hidden />
                <span className="min-w-0">
                  <span className="block text-[14px] font-medium">{CATEGORY_LABEL[c]}</span>
                  {unsaved ? (
                    <span className="block text-[11px] font-semibold text-interactive-control">Unsaved · was {SEVERITY_LABEL[d.savedSeverity[c]]}</span>
                  ) : (
                    cur !== DEFAULT_SEVERITY[c] && <span className="block text-[11px] text-content-tertiary">Default: Medium</span>
                  )}
                </span>
              </span>
              <span className="relative w-full">
                <select
                  aria-label={`${CATEGORY_LABEL[c]} severity`}
                  value={cur}
                  onChange={(e) => d.setDraftMap((m) => ({ ...m, [c]: e.target.value as Severity }))}
                  className={cx(
                    "h-9 w-full cursor-pointer appearance-none rounded-[4px] border pr-9 pl-3 text-[14px] font-semibold transition-colors max-sm:h-11 max-sm:text-[16px]",
                    SEV_STYLE[cur].bg,
                    SEV_STYLE[cur].line,
                    SEV_STYLE[cur].text,
                  )}
                >
                  {TIERS.map((s) => (
                    <option key={s} value={s} className="bg-white text-content-primary">
                      {SEVERITY_LABEL[s]}
                    </option>
                  ))}
                </select>
                <ChevronDown className={cx("pointer-events-none absolute top-1/2 right-3 size-4 -translate-y-1/2", SEV_STYLE[cur].text)} aria-hidden />
              </span>
            </li>
          );
        })}
      </ul>
      <div className="flex flex-wrap items-center justify-between gap-x-3 gap-y-2 border-t border-border-subtle bg-base-contrast px-4 py-3">
        <span className="min-w-0 text-[12px] text-content-tertiary">
          {customised ? "Your team has customised this mapping." : "Every category is at the default, Medium."}
          {d.severityChange && (
            <span className="block">
              Last change: {d.severityChange.summary} · by {d.severityChange.by.toLowerCase()} · {formatDate(d.severityChange.at)}
            </span>
          )}
        </span>
        <Button variant="ghost" size="sm" disabled={draftIsDefault} onClick={() => d.setDraftMap(DEFAULT_SEVERITY)}>
          <RotateCcw className="size-3.5" /> Reset to defaults
        </Button>
      </div>
    </div>
  );
}

/** Channels down the side, severities across the top: which severities reach you, and how. */
function NotificationMatrix({ d }: { d: Draft }) {
  return (
    <div className="overflow-hidden rounded-[6px] border border-border-subtle bg-white">
      <table className="w-full text-left text-[13px]">
        <thead className="border-b border-border-subtle bg-background-subtle text-[12px] font-semibold text-content-main">
          <tr>
            <th className="px-4 py-2.5 font-semibold">Channel</th>
            {TIERS.map((s) => (
              <th key={s} className="w-[68px] px-1 py-2.5 text-center font-semibold">
                <span className={cx("inline-flex items-center gap-1.5", SEV_STYLE[s].text)}>
                  <span className={cx("size-1.5 rounded-full", SEV_STYLE[s].dot)} aria-hidden />
                  {SEVERITY_LABEL[s]}
                </span>
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-border-subtle">
          {CHANNELS.map((ch) => (
            <tr key={ch.key}>
              <th scope="row" className="px-4 py-3 font-normal">
                <span className="block text-[14px] font-semibold text-content-primary">{ch.title}</span>
                <span className="block text-[12px] text-content-tertiary">{ch.desc}</span>
              </th>
              {TIERS.map((s) => {
                const on = d.draft[ch.key][s];
                const unsaved = on !== d.prefs[ch.key][s];
                return (
                  <td key={s} className="px-1 py-3 text-center">
                    <label
                      className={cx(
                        "relative inline-grid size-9 cursor-pointer place-items-center rounded-[4px] border transition-colors max-sm:size-11",
                        on ? cx(SEV_STYLE[s].bg, SEV_STYLE[s].line, SEV_STYLE[s].text) : "border-interactive-secondary bg-white text-transparent hover:border-content-main",
                        "has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-interactive-primary",
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={on}
                        aria-label={`${ch.title}, ${SEVERITY_LABEL[s]}`}
                        onChange={(e) => d.setDraft((p) => ({ ...p, [ch.key]: { ...p[ch.key], [s]: e.target.checked } }))}
                        className="peer absolute inset-0 cursor-pointer opacity-0"
                      />
                      <Check className="size-4" strokeWidth={2.75} aria-hidden />
                      {unsaved && <span aria-hidden className="absolute -top-1 -right-1 size-2 rounded-full bg-interactive-primary ring-2 ring-white" />}
                    </label>
                  </td>
                );
              })}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** The footer both variants share: what will change, then Save. While closing with edits, it asks first. */
function SaveFooter({
  d,
  asking,
  setAsking,
  onClose,
  secondary,
  stacked,
}: {
  stacked?: boolean;
  d: Draft;
  asking: boolean;
  setAsking: (b: boolean) => void;
  onClose: () => void;
  secondary: { label: string; onClick: () => void; disabled?: boolean };
}) {
  if (asking) {
    return (
      <div role="alertdialog" aria-labelledby="discard-q" className="flex flex-wrap items-center gap-x-4 gap-y-3 bg-background-system px-5 py-3.5 text-white sm:px-6">
        <p id="discard-q" className={cx("min-w-0 flex-1 text-[13px]", stacked ? "basis-full" : "max-sm:basis-full")}>
          <span className="font-semibold">Discard {plural(d.pending, "unsaved change", "unsaved changes")}?</span>
          <span className="text-chrome-content-tertiary"> Your saved settings stay as they are.</span>
        </p>
        <span className="ml-auto flex items-center gap-2 max-sm:w-full max-sm:justify-end">
          <button autoFocus onClick={() => setAsking(false)} className="inline-flex h-9 items-center rounded-[4px] px-3 text-[13px] font-semibold text-chrome-content-main hover:bg-chrome-control-hover hover:text-white max-sm:h-11">
            Keep editing
          </button>
          <button
            onClick={() => {
              d.discard();
              onClose();
            }}
            className="inline-flex h-9 items-center rounded-[4px] bg-white px-4 text-[13px] font-semibold text-content-primary hover:bg-interactive-accent max-sm:h-11"
          >
            Discard and close
          </button>
        </span>
      </div>
    );
  }
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-3 border-t border-border-subtle bg-base-contrast px-5 py-3.5 sm:px-6">
      <p className={cx("min-w-0 flex-1 text-[13px]", stacked ? "basis-full" : "max-sm:basis-full")} aria-live="polite">
        {d.pending ? (
          <>
            <span className="font-semibold text-content-primary tnum">{plural(d.pending, "unsaved change", "unsaved changes")}</span>
            <span className="text-content-main"> · {d.details.join(" · ")}</span>
          </>
        ) : (
          <span className="text-content-tertiary">Applies to every monitor on your team's account.</span>
        )}
      </p>
      <span className="ml-auto flex items-center gap-2 max-sm:w-full max-sm:justify-end">
        <Button variant="ghost" onClick={secondary.onClick} disabled={secondary.disabled}>
          {secondary.label}
        </Button>
        <Button variant="primary" disabled={!d.pending} onClick={d.save}>
          Save changes
        </Button>
      </span>
    </div>
  );
}

/* ---------------------------------------------------------------- Variant A: popup */

/** Variant A: a focused modal. Sections are tabs down the left; the impact of a change is told in numbers before saving. */
function PopupSettings({ section, goTo, onClose }: { section: SettingsSection; goTo: (s: SettingsSection) => void; onClose: () => void }) {
  const d = useSettingsDraft(false);
  const { asking, setAsking, requestClose } = useCloseGuard(d, onClose);
  const counts: Record<SettingsSection, number> = { severity: d.changed.length, notifications: d.prefChanges };
  const tabsId = useId();
  const onKey = (e: React.KeyboardEvent) => {
    if (!["ArrowDown", "ArrowUp", "ArrowLeft", "ArrowRight"].includes(e.key)) return;
    e.preventDefault();
    const next = SECTIONS[(SECTIONS.findIndex((s) => s.id === section) + 1) % SECTIONS.length].id;
    goTo(next);
    document.getElementById(`${tabsId}-${next}`)?.focus();
  };

  return (
    <Dialog open onClose={requestClose} title={SETTINGS_NAME} labelledBy="settings-title" width={920} bare>
      <div className="flex h-[min(700px,calc(100dvh-32px))] flex-col">
        <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 pt-5 pb-4 sm:px-6">
          <div>
            <h2 id="settings-title" className="text-[18px] leading-snug font-semibold">
              {SETTINGS_NAME}
            </h2>
            <p className="mt-0.5 text-[13px] text-content-main">Choose how serious each type of change is, and when you're told about it.</p>
          </div>
          <button onClick={requestClose} aria-label="Close settings" className="-mr-2 grid size-8 shrink-0 place-items-center rounded-[4px] text-content-tertiary hover:bg-background-subtle hover:text-content-primary">
            <X className="size-4" />
          </button>
        </header>

        <div className="grid min-h-0 flex-1 md:grid-cols-[236px_minmax(0,1fr)]">
          <div role="tablist" aria-orientation="vertical" aria-label="Settings sections" onKeyDown={onKey} className="flex gap-1 border-border-subtle bg-base-contrast p-3 max-md:border-b md:flex-col md:border-r">
            {SECTIONS.map((s) => {
              const on = s.id === section;
              return (
                <button
                  key={s.id}
                  id={`${tabsId}-${s.id}`}
                  role="tab"
                  aria-selected={on}
                  aria-controls={`${tabsId}-panel`}
                  tabIndex={on ? 0 : -1}
                  onClick={() => goTo(s.id)}
                  className={cx(
                    "relative flex min-w-0 items-start gap-2.5 rounded-[4px] px-3 py-2.5 text-left transition-colors max-md:flex-1",
                    on ? "bg-white text-content-primary shadow-[inset_0_0_0_1px_var(--color-border-subtle)]" : "text-content-main hover:bg-background-subtle hover:text-content-primary",
                  )}
                >
                  {on && <span aria-hidden className="absolute inset-y-2 left-0 w-[2px] rounded-full bg-interactive-primary max-md:hidden" />}
                  <s.icon className={cx("mt-0.5 size-4 shrink-0", on ? "text-interactive-primary" : "text-content-tertiary")} aria-hidden />
                  <span className="min-w-0">
                    <span className={cx("flex items-center gap-2 text-[14px]", on && "font-semibold")}>
                      {s.title}
                      {counts[s.id] > 0 && (
                        <span className="rounded-full bg-interactive-accent px-1.5 text-[11px] font-semibold text-interactive-control tnum">
                          {counts[s.id]}
                          <span className="sr-only"> unsaved</span>
                        </span>
                      )}
                    </span>
                    <span className="block text-[12px] leading-snug text-content-tertiary max-sm:hidden">{s.desc}</span>
                  </span>
                </button>
              );
            })}
          </div>

          <div id={`${tabsId}-panel`} role="tabpanel" aria-labelledby={`${tabsId}-${section}`} className="min-h-0 overflow-y-auto px-5 py-5 sm:px-6">
            {section === "severity" ? (
              <>
                <SectionIntro title="Severity by category">
                  Every change carries one or more of these categories. A change takes the colour of its most serious category, across the overview, the
                  change feed, company pages and alerts.
                </SectionIntro>
                <SeverityMapping d={d} />
              </>
            ) : (
              <>
                <SectionIntro title="Alerts">Pick which severities reach you on each channel. Alerts cover changes detected on companies you monitor.</SectionIntro>
                <NotificationMatrix d={d} />
              </>
            )}
          </div>
        </div>

        <SaveFooter d={d} asking={asking} setAsking={setAsking} onClose={onClose} secondary={{ label: "Cancel", onClick: requestClose }} />
      </div>
    </Dialog>
  );
}

function SectionIntro({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div className="mb-4">
      <h3 className="text-[16px] font-semibold text-content-primary">{title}</h3>
      <p className="mt-1 max-w-[62ch] text-[13px] text-content-main">{children}</p>
    </div>
  );
}

/* ---------------------------------------------------------------- Variant B: right side panel */

/**
 * Variant B: a side panel that leaves the page usable. Both sections stack in one scroll, and while the mapping is
 * unsaved the page behind recolours to the draft, so the analyst sees which rows move before committing.
 * At lg it sits beside the content and pushes it; below lg it is a modal drawer over a scrim.
 */
function SidePanel({ section, goTo, onClose }: { section: SettingsSection; goTo: (s: SettingsSection) => void; onClose: () => void }) {
  const d = useSettingsDraft(true);
  const { asking, setAsking, requestClose } = useCloseGuard(d, onClose);
  const scroller = useRef<HTMLDivElement>(null);
  const title = useRef<HTMLHeadingElement>(null);
  const [wide, setWide] = useState(() => window.matchMedia("(min-width: 1024px)").matches);

  useEffect(() => {
    const mq = window.matchMedia("(min-width: 1024px)");
    const on = () => setWide(mq.matches);
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  // Focus moves into the panel on open; SettingsHost returns it to the opener on close.
  useEffect(() => {
    title.current?.focus({ preventScroll: true });
    document.documentElement.dataset.settingsPanel = "open";
    return () => {
      delete document.documentElement.dataset.settingsPanel;
    };
  }, []);
  // Open on the section that was asked for.
  useLayoutEffect(() => {
    const el = document.getElementById(`sp-${section}`);
    const box = scroller.current;
    if (el && box) box.scrollTo({ top: section === "severity" ? 0 : el.offsetTop - 8, behavior: "smooth" });
  }, [section]);

  return (
    <>
      {!wide && <div className="fixed inset-0 z-40 bg-background-scrim" onClick={requestClose} aria-hidden />}
      <aside
        role="dialog"
        aria-modal={!wide}
        aria-labelledby="sp-title"
        onKeyDown={(e) => {
          if (e.key === "Escape") {
            e.stopPropagation();
            requestClose();
          }
        }}
        className="side-panel-in fixed right-0 bottom-0 z-50 flex w-[min(460px,100vw)] flex-col border-l border-border-subtle bg-white shadow-dialog max-lg:top-0 lg:top-[76px] lg:z-20 lg:shadow-none"
      >
        <header className="flex items-start justify-between gap-4 border-b border-border-subtle px-5 pt-4 pb-3">
          <div className="min-w-0">
            <h2 id="sp-title" ref={title} tabIndex={-1} className="text-[18px] leading-snug font-semibold focus:outline-none">
              {SETTINGS_NAME}
            </h2>
            <p className="text-[13px] text-content-main">How serious each change is, and when you're told</p>
          </div>
          <button onClick={requestClose} aria-label="Close settings" className="-mr-2 grid size-9 shrink-0 place-items-center rounded-[4px] text-content-tertiary hover:bg-background-subtle hover:text-content-primary">
            <X className="size-4" />
          </button>
        </header>

        <nav aria-label="Settings sections" className="flex gap-1 border-b border-border-subtle px-3">
          {SECTIONS.map((s) => {
            const n = s.id === "severity" ? d.changed.length : d.prefChanges;
            return (
              <button
                key={s.id}
                aria-current={s.id === section ? "true" : undefined}
                onClick={() => goTo(s.id)}
                className={cx(
                  "relative flex h-11 items-center gap-2 px-2.5 text-[14px] transition-colors",
                  s.id === section ? "font-semibold text-content-primary after:absolute after:inset-x-2 after:bottom-0 after:h-[2px] after:bg-interactive-primary" : "text-content-main hover:text-content-primary",
                )}
              >
                {s.title}
                {n > 0 && <span className="rounded-full bg-interactive-accent px-1.5 text-[11px] font-semibold text-interactive-control tnum">{n}</span>}
              </button>
            );
          })}
        </nav>

        {d.changed.length > 0 && (
          <p className="flex items-start gap-2 bg-background-system px-5 py-2.5 text-[12px] leading-snug text-chrome-content-main">
            <Eye className="mt-px size-3.5 shrink-0 text-chrome-accent" aria-hidden />
            <span>
              <span className="font-semibold text-white">Previewing on this page.</span> Colours behind this panel show your unsaved mapping. Nothing changes for your team
              until you save.
            </span>
          </p>
        )}

        <div ref={scroller} className="relative min-h-0 flex-1 overflow-y-auto px-5 pt-5 pb-8">
          <section id="sp-severity" aria-labelledby="sp-sev-h">
            <h3 id="sp-sev-h" className="text-[16px] font-semibold">
              Severity by category
            </h3>
            <p className="mt-1 mb-3 text-[13px] text-content-main">A change takes the colour of its most serious category, everywhere in Perpetual KYB.</p>
            <SeverityMapping d={d} compact />
          </section>
          <section id="sp-notifications" aria-labelledby="sp-not-h" className="mt-8">
            <h3 id="sp-not-h" className="text-[16px] font-semibold">
              Alerts
            </h3>
            <p className="mt-1 mb-3 text-[13px] text-content-main">Which severities reach you on each channel.</p>
            <NotificationMatrix d={d} />
          </section>
        </div>

        <SaveFooter d={d} asking={asking} setAsking={setAsking} onClose={onClose} secondary={{ label: "Discard", onClick: d.discard, disabled: !d.pending }} stacked />
      </aside>
    </>
  );
}

/* ---------------------------------------------------------------- Overview header button */

/**
 * The Overview's way in. Both halves live on one surface with its own tabs, so a menu choosing between them only
 * added a click; the button opens whichever half was shown last.
 */
export function SettingsButton() {
  const open = useOpenSettings();
  return (
    <Button variant="ghost" onClick={() => open(lastSection)} className="border border-border-subtle bg-white">
      <Settings className="size-4" aria-hidden /> {SETTINGS_NAME}
    </Button>
  );
}

/** Review control for the two settings layouts. Not part of either design. */
export function SettingsVariantSwitch() {
  const { settingsVariant, setSettingsVariant } = useStore();
  return (
    <div role="group" aria-label="Prototype: settings layout" className="fixed bottom-4 left-4 z-40 flex items-center gap-1 rounded-full bg-background-system p-1 pl-3 text-[12px] text-white shadow-pop lg:left-[276px]">
      <span className="mr-1 font-semibold text-chrome-content-tertiary">Settings</span>
      {(
        [
          ["a", "A · Popup"],
          ["b", "B · Side panel"],
        ] as const
      ).map(([v, label]) => (
        <button
          key={v}
          aria-pressed={settingsVariant === v}
          onClick={() => setSettingsVariant(v)}
          className={cx("h-7 rounded-full px-3 font-semibold transition-colors", settingsVariant === v ? "bg-white text-content-primary" : "text-chrome-content-main hover:bg-chrome-control-hover hover:text-white")}
        >
          {label}
        </button>
      ))}
    </div>
  );
}
