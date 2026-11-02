import { useEffect, useId, useMemo, useRef, useState } from "react";
import { useNavigate } from "react-router-dom";
import { CircleCheck, Eye, ShoppingCart, X } from "lucide-react";
import { PRICING, cartTotalLabel, creditsLabel, reportCredits, type ReportType } from "../data/model";
import { useStore, type CartItem } from "../state/store";
import { Button, Flag, cx, formatDate } from "./ui";

// Portal2 names a cart line by its report tier, with the product in brackets.
const REPORT_LINE: Record<ReportType, string> = {
  lite: "LITE (KYB)",
  basic: "BASIC (KYB)",
  "basic-ubo": "BASIC + DIRECT UBO (KYB)",
  complete: "COMPLETE (KYB)",
};
const LANG_LABEL = { en: "English(EN)", og: "Original(OG)" } as const;

/**
 * Portal2's cart: a drawer sliding in from the right with the order lines, a Select all / Delete bar and
 * the purchase button. A KYB Basic line that carries pKYB shows it hanging off the report line, with
 * its price, so the cost of monitoring is visible before purchase.
 */
export function CartDrawer() {
  const { cart, cartOpen, cartJustAdded, closeCart, removeFromCart, setCartPkyb, checkout, toast } = useStore();
  const navigate = useNavigate();
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const [selected, setSelected] = useState<string[]>([]);

  useEffect(() => {
    const d = ref.current;
    if (!d) return;
    if (cartOpen && !d.open) {
      d.showModal();
      d.querySelector<HTMLElement>("[data-autofocus]")?.focus({ preventScroll: true });
    }
    if (!cartOpen && d.open) d.close();
  }, [cartOpen]);

  // Lines that left the cart can't stay ticked.
  useEffect(() => setSelected((s) => s.filter((id) => cart.some((x) => x.id === id))), [cart]);

  const totals = useMemo(() => {
    const reports = cart.map((x) => x.report);
    const pkyb = cart.filter((x) => x.pkyb).length;
    const priced = reports.map(reportCredits);
    return {
      pkyb,
      reportsLabel: priced.some((p) => p === null) ? creditsLabel(null) : creditsLabel(priced.reduce<number>((n, p) => n + (p ?? 0), 0)),
      total: cartTotalLabel(reports, pkyb),
    };
  }, [cart]);

  const allOn = cart.length > 0 && selected.length === cart.length;

  const purchase = () => {
    const { reports, monitors } = checkout();
    closeCart();
    navigate("/reports");
    toast({
      title: reports === 1 ? "Order placed" : `${reports} orders placed`,
      body: monitors ? `${monitors === 1 ? "pKYB monitoring has" : `pKYB monitoring on ${monitors} companies has`} started. Reports are in View Reports.` : "Your reports are in View Reports.",
    });
  };

  return (
    <dialog
      ref={ref}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        closeCart();
      }}
      onClick={(e) => e.target === ref.current && closeCart()}
      className="drawer m-0 ml-auto h-dvh max-h-none w-[min(500px,100vw)] max-w-none overflow-hidden rounded-none bg-white p-0 text-content-primary shadow-dialog"
    >
      {cartOpen && (
        <div className="flex h-full flex-col">
          <header className="relative px-6 pt-7 pb-5 text-center">
            <button
              onClick={closeCart}
              aria-label="Close cart"
              className="absolute top-4 right-4 grid size-9 place-items-center rounded-[4px] text-content-primary hover:bg-background-subtle max-sm:size-11"
            >
              <X className="size-5" />
            </button>
            <h2 id={titleId} className="font-heading text-[16px] font-bold tracking-[0.02em] uppercase">
              Your cart <span className="tnum">({cart.length})</span>
            </h2>
          </header>

          <div className="min-h-0 flex-1 overflow-y-auto px-6 pb-4">
            {cartJustAdded && (
              <p role="status" className="flex items-center gap-2.5 rounded-[4px] bg-sentiment-positive-elevated px-4 py-3 text-[13px] text-content-on-positive-elevated">
                <CircleCheck className="size-[18px] shrink-0 fill-sentiment-positive text-white" aria-hidden />
                Item successfully added to cart!
              </p>
            )}

            {cart.length === 0 ? (
              <div className="px-4 py-16 text-center">
                <ShoppingCart className="mx-auto size-10 text-content-tertiary" strokeWidth={1.25} aria-hidden />
                <p className="mt-4 text-[14px] font-semibold">Your cart is empty</p>
                <p className="mt-1 text-[13px] text-content-main">Choose a report for a company and add it here to buy several at once.</p>
              </div>
            ) : (
              <>
                <div className="flex items-center justify-between gap-4 px-2 pt-5 pb-3 text-[13px]">
                  <label className="inline-flex min-h-8 cursor-pointer items-center gap-3 font-semibold text-content-main">
                    <input
                      type="checkbox"
                      checked={allOn}
                      onChange={() => setSelected(allOn ? [] : cart.map((x) => x.id))}
                      className="size-4 cursor-pointer accent-interactive-primary"
                    />
                    Select all
                  </label>
                  <button
                    onClick={() => removeFromCart(selected)}
                    disabled={!selected.length}
                    className="min-h-8 px-1 font-semibold text-high hover:underline disabled:cursor-not-allowed disabled:text-content-disabled/50 disabled:no-underline"
                  >
                    Delete{selected.length > 0 && <span className="tnum"> ({selected.length})</span>}
                  </button>
                </div>

                <ul className="border-t border-border-subtle">
                  {cart.map((item) => (
                    <CartLine
                      key={item.id}
                      item={item}
                      checked={selected.includes(item.id)}
                      onCheck={(on) => setSelected((s) => (on ? [...s, item.id] : s.filter((id) => id !== item.id)))}
                      onRemove={() => removeFromCart([item.id])}
                      onDropPkyb={() => setCartPkyb(item.id, false)}
                    />
                  ))}
                </ul>
              </>
            )}
          </div>

          <footer className="border-t border-border-subtle bg-base-contrast px-6 pt-4 pb-5">
            {cart.length > 0 && (
              <dl className="mb-4 flex flex-col gap-1.5 text-[13px]">
                <div className="flex items-baseline justify-between gap-4">
                  <dt className="text-content-main">
                    Reports <span className="tnum">({cart.length})</span>
                  </dt>
                  <dd className="tnum">{totals.reportsLabel}</dd>
                </div>
                {totals.pkyb > 0 && (
                  <div className="flex items-baseline justify-between gap-4">
                    <dt className="text-content-main">
                      pKYB monitoring <span className="tnum">({totals.pkyb})</span>
                    </dt>
                    <dd className="tnum">{creditsLabel(totals.pkyb * PRICING.monitorCredits)} / year</dd>
                  </div>
                )}
                <div className="mt-1 flex items-baseline justify-between gap-4 border-t border-border-subtle pt-2.5 text-[14px] font-semibold">
                  <dt>Total today</dt>
                  <dd className="tnum">{totals.total}</dd>
                </div>
              </dl>
            )}
            <Button variant="primary" disabled={!cart.length} onClick={purchase} className="w-full">
              Confirm &amp; purchase
            </Button>
            {/* Focus lands here, not on the purchase button, so Enter on open never spends credits. */}
            <button
              onClick={closeCart}
              data-autofocus=""
              className="mx-auto mt-2 flex min-h-10 items-center px-3 text-[13px] font-bold tracking-[0.02em] text-interactive-primary uppercase hover:underline"
            >
              Continue browsing
            </button>
          </footer>
        </div>
      )}
    </dialog>
  );
}

function CartLine({
  item,
  checked,
  onCheck,
  onRemove,
  onDropPkyb,
}: {
  item: CartItem;
  checked: boolean;
  onCheck: (on: boolean) => void;
  onRemove: () => void;
  onDropPkyb: () => void;
}) {
  const { company } = item;
  return (
    <li className="group relative flex items-center gap-3 border-b border-border-subtle px-2 py-4 pr-12 transition-colors hover:bg-background-subtle">
      <input
        type="checkbox"
        checked={checked}
        onChange={(e) => onCheck(e.target.checked)}
        aria-label={`Select ${REPORT_LINE[item.report]} for ${company.name}`}
        className="size-4 shrink-0 cursor-pointer accent-interactive-primary"
      />
      <div className="min-w-0 flex-1 text-[13px] leading-snug">
        <div className="flex items-start justify-between gap-3">
          <p className="font-semibold text-content-primary">{company.name}</p>
          <Flag code={company.jurisdiction} className="mt-0.5 h-4 w-6 shrink-0" />
        </div>
        {company.localName && (
          <p lang="zh" className="mt-0.5 text-content-main">
            {company.localName}
          </p>
        )}
        <p className="mt-1.5 font-semibold tracking-[0.02em] text-content-primary">{REPORT_LINE[item.report]}</p>

        {item.pkyb && (
          <div
            className={cx(
              "relative mt-2 ml-3 pl-4",
              // The elbow ties the monitor to the report line above it, as it does in Your Report.
              "before:absolute before:-top-[10px] before:left-0 before:h-[calc(50%+10px)] before:w-4 before:rounded-bl-[6px] before:border-b before:border-l before:border-border-accent",
            )}
          >
            <div className="rounded-[6px] border border-border-accent bg-interactive-selected px-3 py-2.5">
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-0.5">
                <p className="flex items-center gap-1.5 font-semibold text-interactive-control">
                  <Eye className="size-3.5 shrink-0 self-center" aria-hidden /> Perpetual KYB (pKYB)
                </p>
                <p className="font-semibold text-content-primary tnum">{PRICING.monitorCredits} credits / year</p>
              </div>
              <p className="mt-1 text-[12px] text-content-main">Alerts when the registry record changes, until you stop it. This report is the baseline.</p>
              <button onClick={onDropPkyb} className="mt-1 min-h-7 text-[12px] font-semibold text-content-link hover:underline">
                Remove pKYB
              </button>
            </div>
          </div>
        )}

        {item.aml && (
          <p className="mt-2 text-content-main">
            AML (Company): <span className="text-content-primary">{item.matchType || "Match type not set"}</span>
          </p>
        )}
        {item.monitoring && (
          <p className="mt-0.5 text-content-main tnum">
            Monitoring: <span className="text-content-primary">every {item.monitoring.frequency} days, until {formatDate(item.monitoring.expiry)}</span>
          </p>
        )}
        <p className={cx("text-content-main", item.pkyb || item.aml || item.monitoring ? "mt-0.5" : "mt-1")}>
          Language: <span className="text-content-primary">{item.languages.map((l) => LANG_LABEL[l]).join(", ")}</span>
        </p>
      </div>
      <button
        onClick={onRemove}
        aria-label={`Remove ${REPORT_LINE[item.report]} for ${company.name} from cart`}
        className="absolute top-1/2 right-2 grid size-9 -translate-y-1/2 place-items-center rounded-[4px] text-content-primary hover:bg-black/5 max-sm:size-11"
      >
        <X className="size-5" />
      </button>
    </li>
  );
}
