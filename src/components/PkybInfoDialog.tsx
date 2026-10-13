import { Link } from "react-router-dom";
import { BellRing, FileCheck2, Radar } from "lucide-react";
import { CATEGORIES, CATEGORY_LABEL, DEFAULT_SEVERITY, PRICING, type Company } from "../data/model";
import { useStore } from "../state/store";
import { Button, CATEGORY_ICON, Dialog } from "./ui";

const STEPS: Array<{ when: string; what: string; icon: typeof Radar }> = [
  { when: "Today", what: "This KYB Basic report becomes the baseline", icon: FileCheck2 },
  { when: "Ongoing", what: "Automatic registry checks until you stop", icon: Radar },
  { when: "On change", what: "Alerts at the severity you set", icon: BellRing },
];

/**
 * Version A of the Choose a Report pKYB flow: the low-key explainer behind "Find out more" on the
 * pKYB checkbox. A lighter cut of the Create monitor dialog: what pKYB does, what it watches, who
 * sets severity and what it costs. No order summary; ordering stays in the Your Report panel.
 */
export function PkybInfoDialog({
  company,
  open,
  added,
  onAdd,
  onClose,
}: {
  company: Company;
  open: boolean;
  added: boolean;
  onAdd: () => void;
  onClose: () => void;
}) {
  const { severity } = useStore();
  const customised = CATEGORIES.some((c) => severity[c] !== DEFAULT_SEVERITY[c]);

  return (
    <Dialog
      open={open}
      onClose={onClose}
      title="What is pKYB monitoring?"
      labelledBy="pkyb-info-title"
      width={600}
      footer={
        added ? (
          <Button variant="primary" onClick={onClose} data-autofocus="">
            Got it
          </Button>
        ) : (
          <>
            <Button variant="ghost" onClick={onClose} data-autofocus="">
              Close
            </Button>
            <Button
              variant="primary"
              onClick={() => {
                onAdd();
                onClose();
              }}
            >
              Add pKYB monitoring
            </Button>
          </>
        )
      }
    >
      <p className="text-[14px] leading-relaxed text-content-main">
        Perpetual KYB keeps watching <span className="font-semibold text-content-primary">{company.name}</span> after this report. When its registry record
        changes, you're told, so you know when to pull a fresh report.
      </p>

      <ol aria-label="How it works" className="mt-5 grid gap-3 sm:grid-cols-3">
        {STEPS.map((s) => (
          <li key={s.when} className="rounded-[6px] bg-background-accent px-3.5 py-3">
            <s.icon className="size-5 text-interactive-primary" strokeWidth={1.75} aria-hidden />
            <p className="mt-2 text-[13px] font-semibold text-content-primary">{s.when}</p>
            <p className="mt-0.5 text-[12px] leading-snug text-content-main">{s.what}</p>
          </li>
        ))}
      </ol>

      <section aria-labelledby="pkyb-info-cats" className="mt-6">
        <h3 id="pkyb-info-cats" className="text-[14px] font-semibold text-content-primary">
          9 change categories monitored
        </h3>
        <ul className="mt-2.5 grid grid-cols-2 gap-x-4 gap-y-2 text-[13px] text-content-main sm:grid-cols-3">
          {CATEGORIES.map((c) => {
            const Icon = CATEGORY_ICON[c];
            return (
              <li key={c} className="flex items-center gap-2">
                <Icon className="size-4 shrink-0 text-interactive-primary" strokeWidth={1.75} aria-hidden />
                {CATEGORY_LABEL[c]}
              </li>
            );
          })}
        </ul>
      </section>

      <dl className="mt-6 grid gap-3 border-t border-border-subtle pt-4 text-[13px] sm:grid-cols-2">
        <div>
          <dt className="text-[12px] font-semibold text-content-main">Severity</dt>
          <dd className="mt-0.5 text-content-primary">
            {customised ? "Your team's settings apply. " : "Every category starts at Medium. "}
            <Link to="/pkyb/settings" onClick={onClose} className="font-semibold text-content-link hover:underline">
              Severity Settings
            </Link>
          </dd>
        </div>
        <div>
          <dt className="text-[12px] font-semibold text-content-main">Cost</dt>
          <dd className="mt-0.5 text-content-primary tnum">
            {PRICING.monitorCredits} credits / year, until you stop it
          </dd>
        </div>
      </dl>
    </Dialog>
  );
}
