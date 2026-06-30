"use client";

import { useState } from "react";
import type { CourseModule } from "@/lib/data";

// Renders an array of strings as a list with optional tint
function StringList({ items, bullet = "—", color }: { items: unknown[]; bullet?: string; color?: string }) {
  return (
    <ul className="space-y-1.5 mt-2">
      {items.map((item, i) => {
        const text = typeof item === "string"
          ? item
          : typeof item === "object" && item !== null
            ? Object.values(item as Record<string, string>).join(" — ")
            : String(item);
        return (
          <li key={i} className="flex items-start gap-2 text-sm">
            <span className="shrink-0 mt-0.5 font-mono text-xs" style={{ color: color ?? "var(--muted-2)" }}>{bullet}</span>
            <span style={{ color: "var(--text-2)" }}>{text}</span>
          </li>
        );
      })}
    </ul>
  );
}

// Renders a comparison pair (weak/strong, bad/good, wrongFrame/rightFrame, badExamples/goodExamples)
function ComparisonPair({ badLabel, badValue, goodLabel, goodValue }: {
  badLabel: string; badValue: string | string[];
  goodLabel: string; goodValue: string | string[];
}) {
  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-3">
      <div className="rounded-lg p-3" style={{ background: "rgba(239,68,68,0.06)", border: "1px solid rgba(239,68,68,0.2)" }}>
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "rgb(185,28,28)" }}>{badLabel}</div>
        {Array.isArray(badValue)
          ? badValue.map((v, i) => <p key={i} className="text-xs italic mb-1" style={{ color: "var(--text-2)" }}>{v}</p>)
          : <p className="text-xs italic" style={{ color: "var(--text-2)" }}>{badValue}</p>}
      </div>
      <div className="rounded-lg p-3" style={{ background: "rgba(34,197,94,0.06)", border: "1px solid rgba(34,197,94,0.2)" }}>
        <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "rgb(21,128,61)" }}>{goodLabel}</div>
        {Array.isArray(goodValue)
          ? goodValue.map((v, i) => <p key={i} className="text-xs italic mb-1" style={{ color: "var(--text-2)" }}>{v}</p>)
          : <p className="text-xs italic" style={{ color: "var(--text-2)" }}>{goodValue}</p>}
      </div>
    </div>
  );
}

// Renders a single keyPoint object
function KeyPoint({ kp }: { kp: Record<string, unknown> }) {
  const title = kp.title as string | undefined;
  const description = kp.description as string | undefined;

  // Comparison fields
  const hasBadGood = !!(kp.badExamples || kp.goodExamples || kp.bad || kp.good || kp.weak || kp.strong || kp.wrongFrame || kp.rightFrame || kp.badAsk || kp.goodAsk);

  // Template/pattern — single highlighted string
  const template = (kp.template || kp.pattern || kp.example) as string | undefined;

  // List fields
  const listFields: [string, string][] = [
    ["examples", "Examples"],
    ["validWhyNows", "Why it works now"],
    ["works", "Works for"],
    ["doesNotWork", "Does not work for"],
    ["beats", "The five beats"],
    ["gapCategories", "Gap categories"],
    ["audiences", "Audiences"],
    ["criteria", "Selection criteria"],
    ["rules", "Rules"],
    ["axes", "Axes"],
    ["implications", "Implications"],
    ["timeMap", "Time constraints"],
    ["applications", "Applications"],
    ["questions", "Questions to ask"],
    ["credibilityAnchors", "Credibility anchors"],
    ["characteristics", "Characteristics"],
  ];

  return (
    <div className="rounded-xl p-5 mb-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
      {title && (
        <h4 className="text-sm font-semibold mb-2" style={{ color: "var(--text)" }}>{title}</h4>
      )}
      {description && (
        <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{description}</p>
      )}

      {/* Comparison pairs */}
      {hasBadGood && (
        <>
          {Boolean(kp.badExamples || kp.goodExamples) && (
            <ComparisonPair
              badLabel="Avoid" badValue={(kp.badExamples as string[]) ?? []}
              goodLabel="Strong" goodValue={(kp.goodExamples as string[]) ?? []}
            />
          )}
          {Boolean(kp.bad || kp.good) && (
            <ComparisonPair
              badLabel="Weak" badValue={(kp.bad as string) ?? ""}
              goodLabel="Strong" goodValue={(kp.good as string) ?? ""}
            />
          )}
          {Boolean(kp.weak || kp.strong) && (
            <ComparisonPair
              badLabel="Weak" badValue={(kp.weak as string) ?? ""}
              goodLabel="Strong" goodValue={(kp.strong as string) ?? ""}
            />
          )}
          {Boolean(kp.wrongFrame || kp.rightFrame) && (
            <ComparisonPair
              badLabel="Wrong frame" badValue={(kp.wrongFrame as string) ?? ""}
              goodLabel="Right frame" goodValue={(kp.rightFrame as string) ?? ""}
            />
          )}
          {Boolean(kp.badAsk || kp.goodAsk) && (
            <ComparisonPair
              badLabel="Vague ask" badValue={(kp.badAsk as string) ?? ""}
              goodLabel="Precise ask" goodValue={(kp.goodAsk as string) ?? ""}
            />
          )}
        </>
      )}

      {/* Template / Pattern block */}
      {template && (
        <div className="mt-3 rounded-lg px-4 py-3 text-sm font-mono leading-relaxed" style={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)", color: "var(--text-2)" }}>
          <span className="text-xs not-italic font-sans font-semibold uppercase tracking-wide block mb-1" style={{ color: "var(--muted)" }}>
            {kp.template ? "Template" : kp.pattern ? "Pattern" : "Example"}
          </span>
          {template}
        </div>
      )}

      {/* List fields */}
      {listFields.map(([key, label]) => {
        const val = kp[key];
        if (!Array.isArray(val) || val.length === 0) return null;
        return (
          <div key={key} className="mt-3">
            <div className="text-xs font-semibold uppercase tracking-wide mb-1" style={{ color: "var(--muted)" }}>{label}</div>
            <StringList items={val as string[]} bullet="→" color="var(--accent)" />
          </div>
        );
      })}

      {/* sweetSpot */}
      {Boolean(kp.sweetSpot) && (
        <div className="mt-3 text-sm italic" style={{ color: "var(--muted)" }}>
          Sweet spot: {kp.sweetSpot as string}
        </div>
      )}
    </div>
  );
}

function ModuleBody({ mod }: { mod: CourseModule }) {
  const content = mod.content as Record<string, unknown>;
  const overview = content.overview as string | undefined;
  const keyPoints = content.keyPoints as Record<string, unknown>[] | undefined;
  const commonMistake = content.commonMistake as string | undefined;
  const casesArr = content.cases as { caseId: string; title: string; framework: string; scenario: string }[] | undefined;

  return (
    <div className="mt-4 space-y-4">
      {/* Overview */}
      {overview && (
        <div className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>
          {overview}
        </div>
      )}

      {/* Key points */}
      {keyPoints && keyPoints.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>Key points</div>
          {keyPoints.map((kp, i) => <KeyPoint key={i} kp={kp} />)}
        </div>
      )}

      {/* Common mistake */}
      {commonMistake && (
        <div className="rounded-xl px-5 py-4" style={{ background: "rgba(239,68,68,0.05)", border: "1px solid rgba(239,68,68,0.2)" }}>
          <div className="text-xs font-semibold uppercase tracking-wide mb-2" style={{ color: "rgb(185,28,28)" }}>Common mistake</div>
          <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{commonMistake}</p>
        </div>
      )}

      {/* Practice cases */}
      {casesArr && casesArr.length > 0 && (
        <div>
          <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>Practice cases</div>
          <div className="space-y-2">
            {casesArr.map((c) => (
              <a
                key={c.caseId}
                href={`/cases/${c.caseId}`}
                className="flex items-start justify-between gap-3 rounded-lg px-4 py-3 no-underline group transition-all hover:shadow-sm"
                style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
              >
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{c.title}</div>
                  <div className="text-xs mt-0.5" style={{ color: "var(--muted-2)" }}>{c.scenario}</div>
                </div>
                <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ color: "var(--accent)", border: "1px solid var(--accent-border)" }}>
                  {c.framework}
                </span>
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

export default function ModuleAccordion({ modules }: { modules: CourseModule[] }) {
  const [open, setOpen] = useState<Set<string>>(new Set([modules[0]?.id]));

  function toggle(id: string) {
    setOpen((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  return (
    <div className="space-y-2">
      {modules.map((mod, i) => {
        const isOpen = open.has(mod.id);
        const isCaseStudy = mod.type === "case_study";
        return (
          <div key={mod.id} className="rounded-xl overflow-hidden transition-all" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
            <button
              onClick={() => toggle(mod.id)}
              className="w-full flex items-start justify-between gap-4 px-5 py-4 text-left"
            >
              <div className="flex items-center gap-3 min-w-0">
                <span className="text-xs font-mono shrink-0" style={{ color: "var(--muted-2)" }}>{String(i + 1).padStart(2, "0")}</span>
                <div>
                  <div className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{mod.title}</div>
                  <div className="flex items-center gap-2 mt-0.5">
                    <span className="text-xs" style={{ color: "var(--muted-2)" }}>{mod.duration}</span>
                    {isCaseStudy && (
                      <span className="text-xs px-1.5 py-0.5 rounded" style={{ color: "var(--accent)", background: "var(--accent-bg)", fontSize: "10px" }}>
                        Practice
                      </span>
                    )}
                  </div>
                </div>
              </div>
              <span className="shrink-0 text-lg leading-none mt-0.5" style={{ color: "var(--muted-2)", transform: isOpen ? "rotate(180deg)" : "rotate(0deg)", display: "inline-block", transition: "transform 0.2s" }}>
                ↓
              </span>
            </button>
            {isOpen && (
              <div className="px-5 pb-6" style={{ borderTop: "1px solid var(--border)" }}>
                <ModuleBody mod={mod} />
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}
