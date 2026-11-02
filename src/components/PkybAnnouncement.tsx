import { useCallback, useLayoutEffect, useRef, useState, type RefObject } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { ArrowRight, Bell, Eye, Gem, List, RotateCcw, Search, ShoppingCart, X } from "lucide-react";
import { PRICING } from "../data/model";
import { Button, Dialog, NewTag, cx } from "./ui";

/* The launch announcement: shown on login until it is dismissed for the session. Add ?announcement to any
   URL to see it again. */
const SEEN_KEY = "pkyb-announcement-seen";
const wasSeen = () => {
  try {
    return sessionStorage.getItem(SEEN_KEY) === "1";
  } catch {
    return false;
  }
};
const markSeen = () => {
  try {
    sessionStorage.setItem(SEEN_KEY, "1");
  } catch {
    /* A blocked store only means it shows again next load. */
  }
};

export function AnnouncementHost() {
  const [params] = useSearchParams();
  const navigate = useNavigate();
  const [open, setOpen] = useState(() => params.has("announcement") || !wasSeen());
  const close = () => {
    markSeen();
    setOpen(false);
  };

  return (
    <Dialog open={open} onClose={close} title="Perpetual KYB is now live" labelledBy="pkyb-announce-title" width={640} bare>
      <div className="max-h-[calc(100dvh-32px)] overflow-y-auto">
        <EntryPointGraphic onClose={close} />
        <div className="px-6 pt-6 pb-6 sm:px-8 sm:pb-7">
          <h2 id="pkyb-announce-title" className="font-heading text-[26px] leading-tight font-semibold tracking-[-0.015em] text-content-primary">
            Perpetual KYB is Now Live!
          </h2>
          {/* Draft copy: the brief's text is a lorem ipsum placeholder. */}
          <p className="mt-2.5 text-[14px] leading-relaxed text-content-main">
            Keep watching the companies you have already checked. After a KYB Basic report, Perpetual KYB tells you when the company&rsquo;s registry record changes, so you know when to pull a fresh one.
          </p>
          <p className="mt-4 flex gap-2.5 rounded-[6px] bg-background-accent px-3.5 py-3 text-[13px] leading-snug text-content-main">
            <Eye className="mt-px size-4 shrink-0 text-interactive-primary" strokeWidth={1.75} aria-hidden />
            <span>
              Find it on <span className="font-semibold text-content-primary">Choose A Report</span>: pick KYB Basic, then tick{" "}
              <span className="font-semibold text-content-primary">Add pKYB monitoring</span> in Your Report. It costs <span className="tnum">{PRICING.monitorCredits}</span> credits per company per year, on top of the report.
            </span>
          </p>
          <div className="mt-6 flex flex-col-reverse gap-3 sm:flex-row sm:justify-end">
            <Button variant="ghost" onClick={close}>
              Got it
            </Button>
            <Button
              variant="primary"
              data-autofocus=""
              onClick={() => {
                close();
                navigate("/search?from=pkyb");
              }}
            >
              Search for a company <ArrowRight className="size-4" aria-hidden />
            </Button>
          </div>
        </div>
      </div>
    </Dialog>
  );
}

/* ---------- The graphic ---------- */

// The Choose A Report page, drawn at a fixed size and moved with transforms only. The sequence is locate, read,
// place: the page shows with the option outlined, everything else dims so the eye has one thing to hold, the
// camera glides in until the option is readable, then pulls back to show where it lives on the page.
const STAGE_W = 900;
const STAGE_H = 500;
const BEATS = {
  dimIn: 500, // the page is already on screen; now dim everything but the option (400ms)
  zoomIn: 1000, // the camera glides in
  hold: 2700, // arrives; two pings say "this one"
  zoomOut: 4100, // the camera pulls back, the dim lifting over its first half
  end: 5900,
};
const DIM_FADE = 400;
const clamp = (n: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, n));
// A camera glide reads as one move when it starts and ends gently.
const glide = (p: number) => (p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2);

/** Where an element sits inside the stage, before any transform. */
function placeIn(el: HTMLElement, stage: HTMLElement) {
  let x = 0;
  let y = 0;
  for (let n: HTMLElement | null = el; n && n !== stage; n = n.offsetParent as HTMLElement | null) {
    x += n.offsetLeft;
    y += n.offsetTop;
  }
  return { x, y };
}

function EntryPointGraphic({ onClose }: { onClose: () => void }) {
  const frame = useRef<HTMLDivElement>(null);
  const stage = useRef<HTMLDivElement>(null);
  const target = useRef<HTMLDivElement>(null);
  const ping = useRef<HTMLSpanElement>(null);
  const dim = useRef<HTMLSpanElement>(null);
  const runs = useRef<Animation[]>([]);
  const [still] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);

  const stop = () => {
    runs.current.forEach((a) => a.cancel());
    runs.current = [];
  };

  const play = useCallback(() => {
    const f = frame.current;
    const s = stage.current;
    const t = target.current;
    const veil = dim.current;
    if (!f || !s || !t || !veil || !f.clientWidth) return;
    stop();
    const W = f.clientWidth;
    const H = f.clientHeight;
    const wide = `translate(0px, 0px) scale(${W / STAGE_W})`;
    s.style.transform = wide;
    if (still) return;

    // The dim covers the stage with a hole cut to the option's outline, so the option stays lit at every scale.
    const at = placeIn(t, s);
    const hole = { x: at.x - 4, y: at.y - 4, w: t.offsetWidth + 8, h: t.offsetHeight + 8, r: 8 };
    veil.style.clipPath = `path(evenodd, "M0 0H${STAGE_W}V${STAGE_H}H0Z M${hole.x + hole.r} ${hole.y}H${hole.x + hole.w - hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.w} ${hole.y + hole.r}V${hole.y + hole.h - hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.w - hole.r} ${hole.y + hole.h}H${hole.x + hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x} ${hole.y + hole.h - hole.r}V${hole.y + hole.r}A${hole.r} ${hole.r} 0 0 1 ${hole.x + hole.r} ${hole.y}Z")`;

    // The camera zooms in exponentially, so every step feels the same size, and the option travels in a straight
    // line from where it sits on the page to the middle of the frame. Edges are clamped so the page never ends.
    const fx = at.x + t.offsetWidth / 2;
    const fy = at.y + t.offsetHeight / 2;
    const z0 = W / STAGE_W;
    const z1 = (W * 0.74) / t.offsetWidth;
    const cam = (p: number) => {
      const z = z0 * Math.pow(z1 / z0, p);
      const tx = clamp(z0 * fx * (1 - p) + (W / 2) * p - z * fx, W - z * STAGE_W, 0);
      const ty = clamp(z0 * fy * (1 - p) + (H / 2) * p - z * fy, H - z * STAGE_H, 0);
      return `translate(${tx}px, ${ty}px) scale(${z})`;
    };
    const D = BEATS.end;
    const STEPS = 36;
    const frames: Keyframe[] = [
      { offset: 0, transform: wide },
      { offset: BEATS.zoomIn / D, transform: wide },
    ];
    for (let i = 1; i <= STEPS; i++) frames.push({ offset: (BEATS.zoomIn + ((BEATS.hold - BEATS.zoomIn) * i) / STEPS) / D, transform: cam(glide(i / STEPS)) });
    frames.push({ offset: BEATS.zoomOut / D, transform: cam(1) });
    for (let i = 1; i <= STEPS; i++) frames.push({ offset: (BEATS.zoomOut + ((D - BEATS.zoomOut) * i) / STEPS) / D, transform: cam(1 - glide(i / STEPS)) });

    s.style.willChange = "transform";
    const camera = s.animate(frames, { duration: D });
    const lights = veil.animate(
      [
        { offset: 0, opacity: 0 },
        { offset: BEATS.dimIn / D, opacity: 0 },
        { offset: (BEATS.dimIn + DIM_FADE) / D, opacity: 1 },
        { offset: BEATS.zoomOut / D, opacity: 1 },
        { offset: (BEATS.zoomOut + (D - BEATS.zoomOut) / 2) / D, opacity: 0 },
        { offset: 1, opacity: 0 },
      ],
      { duration: D },
    );
    const rings = ping.current?.animate([{ opacity: 0.55, transform: "scale(1)" }, { opacity: 0, transform: "scale(1.14)" }], {
      delay: BEATS.hold + 60,
      duration: 650,
      iterations: 2,
      easing: "cubic-bezier(0.16, 1, 0.3, 1)",
    });
    runs.current = [camera, lights, ...(rings ? [rings] : [])];
    camera.finished
      .then(() => {
        s.style.willChange = "";
      })
      .catch(() => {
        /* Cancelled by a replay or by closing. */
      });
  }, [still]);

  // The dialog is still hidden when this mounts, so the first real size arrives from the observer.
  useLayoutEffect(() => {
    const f = frame.current;
    if (!f) return;
    let started = false;
    const watch = new ResizeObserver(() => {
      if (!f.clientWidth) return;
      // A resize mid-sequence would leave the camera on stale numbers, so the sequence starts over at the new size.
      if (!started || runs.current[0]?.playState === "running") {
        started = true;
        play();
      } else if (stage.current) {
        stage.current.style.transform = `translate(0px, 0px) scale(${f.clientWidth / STAGE_W})`;
      }
    });
    watch.observe(f);
    return () => {
      watch.disconnect();
      stop();
    };
  }, [play]);

  return (
    <div
      ref={frame}
      role="img"
      aria-label="The Choose A Report page. In the Your Report panel, the Add pKYB monitoring option is highlighted."
      className="relative aspect-[900/500] w-full overflow-hidden bg-portal-canvas"
    >
      <div ref={stage} aria-hidden className="absolute top-0 left-0 flex h-[500px] w-[900px] origin-top-left select-none">
        <MiniSidebar />
        <div className="flex min-w-0 flex-1 flex-col">
          <div className="flex h-11 shrink-0 items-center justify-between border-b border-portal-line bg-white pr-16 pl-5">
            <span className="font-heading text-[13px] font-bold tracking-[0.01em] uppercase">Choose a report</span>
            <span className="flex gap-3.5">
              <Bell className="size-4" strokeWidth={1.5} />
              <ShoppingCart className="size-4" strokeWidth={1.5} />
            </span>
          </div>
          <div className="px-5 pt-4">
            <p className="truncate font-heading text-[13px] font-bold">
              XYZ Technology Systems Company Limited <span className="mx-1 font-normal">|</span> <span lang="zh">XYZ技术系统有限公司</span>
            </p>
            <div className="mt-3 flex gap-2.5">
              {["KYB", "UBO", "Legal Documents"].map((p, i) => (
                <span
                  key={p}
                  className={cx(
                    "inline-flex h-6 items-center rounded-full border px-3.5 text-[9.5px] font-semibold tracking-[0.04em] uppercase",
                    i === 0 ? "border-portal-pill-selected bg-portal-pill-selected text-white" : "border-portal-pill-line bg-white text-content-primary",
                  )}
                >
                  {p}
                </span>
              ))}
            </div>
            <div className="mt-3.5 flex items-start gap-4">
              <MiniReports />
              <MiniSlip target={target} ping={ping} />
            </div>
          </div>
        </div>
        <span ref={dim} className="pointer-events-none absolute inset-0 z-20 bg-navy-950/55 opacity-0" />
      </div>

      <button
        onClick={onClose}
        aria-label="Close"
        className="absolute top-3 right-3 z-10 grid size-8 place-items-center rounded-full bg-white/95 text-content-main shadow-pop transition-colors hover:text-content-primary max-sm:size-11"
      >
        <X className="size-4" />
      </button>
      {!still && (
        <button
          onClick={play}
          className="absolute bottom-3 left-3 z-10 inline-flex h-7 items-center gap-1.5 rounded-full bg-white/95 px-2.5 text-[12px] font-semibold text-content-main shadow-pop transition-colors hover:text-content-primary max-sm:h-9"
        >
          <RotateCcw className="size-3.5" aria-hidden /> Replay
        </button>
      )}
    </div>
  );
}

const MINI_NAV = [
  { label: "Search", icon: Search, on: true },
  { label: "View Reports", icon: List },
  { label: "Perpetual KYB", icon: Eye, tag: true },
  { label: "My Plan", icon: Gem },
];

function MiniSidebar() {
  return (
    <div className="flex w-[124px] shrink-0 flex-col bg-portal-sidebar px-2.5 pt-4">
      <img src="/asiaverify-logo.png" alt="" width={1972} height={522} className="ml-1 h-[22px] w-auto self-start" />
      <div className="mt-6 flex flex-col gap-1">
        {MINI_NAV.map((n) => (
          <span key={n.label} className={cx("flex h-7 items-center gap-2 rounded-[4px] px-2 text-[10px] font-medium whitespace-nowrap text-white", n.on && "bg-portal-sidebar-selected")}>
            <n.icon className="size-3.5 shrink-0" strokeWidth={1.75} />
            {n.label}
            {n.tag && <span className="rounded-full bg-interactive-primary px-1.5 py-px text-[8px] font-semibold">New</span>}
          </span>
        ))}
      </div>
    </div>
  );
}

function MiniReports() {
  const cards = [
    { name: "KYB Lite", parts: "Business Overview + Basic Information" },
    { name: "KYB Basic", parts: "Lite Report + In-Depth Business Information", on: true },
    { name: "KYB Basic + Direct UBO", parts: "Lite Report + In-Depth Business Information + Direct UBO" },
  ];
  return (
    <div className="w-[436px] shrink-0 rounded-[8px] bg-background-elevated px-5 pt-4 pb-5">
      <div className="flex items-center gap-5 font-heading text-[12px]">
        <span className="relative font-semibold after:absolute after:inset-x-0 after:-bottom-1.5 after:h-0.5 after:rounded-full after:bg-interactive-primary">Configure</span>
        <span aria-hidden className="h-3.5 w-px bg-content-main" />
        <span className="text-content-main">Compare</span>
      </div>
      <div className="mt-5 flex flex-col gap-2.5">
        {cards.map((c) => (
          <div key={c.name} className={cx("flex items-start gap-3.5 rounded-[8px] bg-background-elevated px-4 py-3 shadow-card", c.on && "ring-1 ring-interactive-primary")}>
            <span className={cx("mt-0.5 size-3 shrink-0 rounded-full border", c.on ? "border-[3.5px] border-interactive-primary bg-white" : "border-interactive-secondary bg-white")} />
            <span className="min-w-0">
              <span className="flex items-center gap-2">
                <span className="font-heading text-[10.5px] font-bold tracking-[0.02em] uppercase">{c.name}</span>
                {c.on && (
                  <span className="inline-flex h-4 items-center gap-1 rounded-full border border-border-accent bg-white px-1.5 text-[8.5px] font-semibold text-interactive-control">
                    <Eye className="size-2.5" /> pKYB available
                  </span>
                )}
              </span>
              <span className="mt-1 block text-[10px] leading-snug text-content-main">{c.parts}</span>
            </span>
          </div>
        ))}
      </div>
    </div>
  );
}

function MiniSlip({ target, ping }: { target: RefObject<HTMLDivElement | null>; ping: RefObject<HTMLSpanElement | null> }) {
  return (
    <div className="w-[276px] shrink-0 rounded-[8px] bg-background-elevated px-5 pt-4 pb-4 shadow-portal">
      <p className="font-heading text-[12.5px] font-bold">Your Report</p>
      <p className="mt-0.5 text-[9.5px] text-content-main">View your selected reports below.</p>
      <div className="mt-3 border-b border-border-subtle pb-3">
        <div className="flex items-baseline justify-between text-[10px]">
          <span className="text-content-main">Report Type:</span>
          <span className="font-semibold uppercase">KYB Basic</span>
        </div>

        <div ref={target} className="relative mt-2.5">
          <span aria-hidden className="pointer-events-none absolute -inset-1 rounded-[8px] border-2 border-interactive-primary" />
          <span ref={ping} aria-hidden className="pointer-events-none absolute -inset-1 rounded-[8px] border-2 border-interactive-primary opacity-0" />
          <div className="relative flex gap-2.5 rounded-[6px] border border-border-subtle bg-white px-3 py-2.5">
            <span className="mt-0.5 size-3.5 shrink-0 rounded-[3px] border border-interactive-secondary bg-white" />
            <span className="min-w-0 flex-1">
              <span className="flex items-center justify-between gap-2">
                <span className="flex items-center gap-1.5 text-[11px] font-semibold">
                  Add pKYB monitoring <NewTag />
                </span>
              </span>
              <span className="mt-0.5 block text-[10px] font-semibold tnum">+{PRICING.monitorCredits} credits / year</span>
              <span className="mt-1 block text-[9.5px] leading-snug text-content-main">
                Alerts when the registry record changes. This report becomes the baseline. <span className="font-semibold text-content-link underline underline-offset-2">Find out more</span>
              </span>
            </span>
          </div>
        </div>
      </div>
      <div className="flex items-center justify-between border-b border-border-subtle py-3 text-[10px]">
        <span className="text-content-main">Language:</span>
        <span className="flex gap-4 font-semibold">
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] border border-interactive-secondary bg-white" /> EN
          </span>
          <span className="flex items-center gap-1.5">
            <span className="size-3 rounded-[3px] border border-interactive-secondary bg-white" /> OG
          </span>
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-2">
        <span className="grid h-8 place-items-center rounded-[4px] bg-interactive-primary text-[11px] font-semibold text-white opacity-50">Generate report</span>
        <span className="grid h-8 place-items-center rounded-[4px] border border-interactive-primary bg-white text-[11px] font-semibold text-interactive-primary opacity-50">Add to cart</span>
      </div>
    </div>
  );
}
