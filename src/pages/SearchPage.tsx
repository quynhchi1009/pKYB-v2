import { useMemo, useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { ChevronDown, Eye, Search } from "lucide-react";
import { JURISDICTIONS, SEARCH_COMPANIES } from "../data/model";
import { Button } from "../components/ui";

export function SearchPage() {
  const [params, setParams] = useSearchParams();
  const q = params.get("q") ?? "Shenzhen";
  const [draft, setDraft] = useState(q);
  const [jur, setJur] = useState("all");
  const fromPkyb = params.get("from") === "pkyb";

  const results = useMemo(
    () => SEARCH_COMPANIES.filter((c) => (c.name + (c.localName ?? "") + c.regNo).toLowerCase().includes(q.toLowerCase()) && (jur === "all" || c.jurisdiction === jur)),
    [q, jur],
  );

  return (
    <div className="px-4 pt-6 pb-16 sm:px-6 lg:px-8">
      {fromPkyb && (
        <div className="mb-4 flex items-center gap-3 rounded-[6px] border border-border-accent bg-interactive-accent px-4 py-3 text-[13px] text-interactive-control">
          <Eye className="size-4 shrink-0" />
          <span>
            Find the company you want to monitor and choose <span className="font-semibold">View</span>. Pick KYB Basic, then add pKYB monitoring in <span className="font-semibold">Your Report</span>.
          </span>
        </div>
      )}
      {/* Portal2 search: one off-white panel holding the form, a hairline, then the results table. */}
      <div className="rounded-[8px] bg-background-elevated px-4 pt-7 pb-6 sm:px-5">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            const next = new URLSearchParams(params);
            next.set("q", draft);
            setParams(next);
          }}
        >
          <h1 className="font-heading text-[18px] leading-tight font-bold text-content-primary">Search for a business to verify</h1>
          <p className="mt-2 text-[14px] text-content-primary">Select a jurisdiction then enter the desired business name in either English/Original Language, or business registration number.</p>
          <div className="mt-5 grid gap-3 sm:grid-cols-[160px_minmax(0,1fr)_136px]">
            <label className="relative">
              <span className="sr-only">Jurisdiction</span>
              <select
                value={jur}
                onChange={(e) => setJur(e.target.value)}
                className="h-9 w-full appearance-none rounded-[4px] border border-border-subtle bg-white pr-8 pl-3 text-[13px] text-content-primary transition-colors hover:border-border-neutral focus:border-interactive-primary max-sm:h-11 max-sm:text-[16px]"
              >
                <option value="all">All jurisdictions</option>
                {JURISDICTIONS.map((j) => (
                  <option key={j.code} value={j.code}>
                    {j.name}
                  </option>
                ))}
              </select>
              <ChevronDown className="pointer-events-none absolute top-1/2 right-2.5 size-4 -translate-y-1/2 text-content-tertiary" aria-hidden />
            </label>
            <label className="relative">
              <span className="sr-only">Business name or registration number</span>
              <Search className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-content-tertiary" aria-hidden />
              <input
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Business name or registration no."
                className="h-9 w-full rounded-[4px] border border-content-primary bg-white pr-3 pl-9 text-[13px] transition-colors placeholder:text-content-tertiary focus:border-interactive-primary max-sm:h-11 max-sm:text-[16px]"
              />
            </label>
            <Button variant="primary" type="submit" className="w-full font-bold">
              Search
            </Button>
          </div>
        </form>

        <div className="mt-5 border-t border-border-subtle pt-5">
          <p className="sr-only" aria-live="polite">
            {results.length} {results.length === 1 ? "company" : "companies"} found for {q}
          </p>

          {results.length === 0 ? (
            <p className="rounded-[8px] bg-white px-5 py-10 text-center text-[13px] text-content-main shadow-card">
              No businesses match ‘{q}’. Check the spelling, try the original-language name, or search by registration number.
            </p>
          ) : (
            <>
              <ul className="divide-y divide-border-subtle overflow-hidden rounded-[8px] bg-white shadow-card md:hidden">
                {results.map((c) => (
                  <li key={c.id} className="flex items-center gap-4 px-4 py-3.5">
                    <span className="min-w-0 flex-1 text-[13px] text-content-primary">
                      <span className="block">{c.name}</span>
                      {c.localName && (
                        <span className="mt-1 block" lang="zh">
                          {c.localName}
                        </span>
                      )}
                      <span className="mt-1 block text-content-main tnum">{c.regNo}</span>
                    </span>
                    <Link to={`/report/${c.id}`} className="inline-flex h-10 items-center px-2 text-[13px] font-bold text-interactive-primary hover:underline">
                      View
                    </Link>
                  </li>
                ))}
              </ul>

              <div className="overflow-hidden rounded-[8px] bg-white shadow-card max-md:hidden">
                <table className="w-full text-left text-[13px]">
                  <thead className="bg-portal-line text-[12px] text-content-primary uppercase">
                    <tr>
                      <th className="w-[33%] px-2.5 py-[18px] font-bold">Business name</th>
                      <th className="w-[33%] px-2.5 py-[18px] font-bold">Registration no.</th>
                      <th className="px-2.5 py-[18px] font-bold">Action</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border-subtle">
                    {results.map((c) => (
                      <tr key={c.id} className="transition-colors hover:bg-base-contrast">
                        <td className="px-2.5 py-3 text-content-primary">
                          <span className="block">{c.name}</span>
                          {c.localName && (
                            <span className="mt-1 block" lang="zh">
                              {c.localName}
                            </span>
                          )}
                        </td>
                        <td className="px-2.5 py-3 text-content-primary tnum">{c.regNo}</td>
                        <td className="px-2.5 py-3">
                          <Link to={`/report/${c.id}`} className="inline-flex h-8 items-center px-0.5 font-bold text-interactive-primary hover:underline">
                            View
                          </Link>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </div>
      </div>
    </div>
  );
}
