import { getCase, getAllCases } from "@/lib/data";
import { notFound } from "next/navigation";
import CaseReader from "./CaseReader";

export async function generateStaticParams() {
  const cases = getAllCases();
  return cases.map((c) => ({ id: c.id }));
}

const TYPE_COLOR: Record<string, string> = {
  crisis: "text-red-700 bg-red-100 border-red-200 dark:text-red-400 dark:bg-red-400/10 dark:border-red-400/20",
  pitch: "text-orange-700 bg-orange-100 border-orange-200 dark:text-orange-400 dark:bg-orange-400/10 dark:border-orange-400/20",
  negotiation: "text-blue-700 bg-blue-100 border-blue-200 dark:text-blue-400 dark:bg-blue-400/10 dark:border-blue-400/20",
  decision: "text-purple-700 bg-purple-100 border-purple-200 dark:text-purple-400 dark:bg-purple-400/10 dark:border-purple-400/20",
  general: "text-gray-600 bg-gray-100 border-gray-200 dark:text-neutral-400 dark:bg-neutral-800 dark:border-neutral-700",
};

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseStudy = getCase(id);
  if (!caseStudy) notFound();

  const stakeholders = caseStudy.stakeholder_map ? Object.entries(caseStudy.stakeholder_map) : [];

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs mb-8" style={{ color: "var(--muted-2)" }}>
        <a href="/cases" className="hover:underline" style={{ color: "var(--muted)" }}>Cases</a>
        <span>/</span>
        <span>{caseStudy.title}</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-xs px-2 py-0.5 rounded border font-medium capitalize ${TYPE_COLOR[caseStudy.case_type] ?? TYPE_COLOR.general}`}>
            {caseStudy.case_type}
          </span>
          <span className="text-sm" style={{ color: "var(--muted)" }}>{caseStudy.country}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-4" style={{ color: "var(--text)" }}>{caseStudy.title}</h1>
        {caseStudy.tags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {caseStudy.tags.map((tag) => (
              <span key={tag} className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--muted-2)", background: "var(--surface-2)", border: "1px solid var(--border)" }}>
                {tag}
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Context */}
      <div className="mb-10 grid gap-3">
        {caseStudy.context.your_position && (
          <div className="rounded-xl p-5" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
            <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>Your position</div>
            <p className="text-sm leading-relaxed" style={{ color: "var(--text-2)" }}>{caseStudy.context.your_position}</p>
          </div>
        )}
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {caseStudy.context.recent_events && (
            <div className="rounded-xl p-4" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>Context</div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{caseStudy.context.recent_events}</p>
            </div>
          )}
          {caseStudy.context.cultural_factors && (
            <div className="rounded-xl p-4" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
              <div className="text-xs font-semibold uppercase tracking-widest mb-2" style={{ color: "var(--muted)" }}>Cultural factors</div>
              <p className="text-xs leading-relaxed" style={{ color: "var(--muted)" }}>{caseStudy.context.cultural_factors}</p>
            </div>
          )}
        </div>
      </div>

      {/* Stakeholders */}
      {stakeholders.length > 0 && (
        <div className="mb-10">
          <div className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--muted)" }}>Stakeholders</div>
          <div className="space-y-2">
            {stakeholders.map(([name, info]) => (
              <div key={name} className="rounded-lg px-4 py-3 flex items-start gap-4" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium mb-0.5" style={{ color: "var(--text-2)" }}>{name}</div>
                  <div className="text-xs" style={{ color: "var(--muted)" }}>{info.stance}</div>
                </div>
                <div className="text-xs shrink-0" style={{ color: "var(--muted-2)" }}>Power: {info.power}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="mb-10" style={{ borderTop: "1px solid var(--border)" }} />

      <CaseReader caseStudy={caseStudy} />
    </div>
  );
}
