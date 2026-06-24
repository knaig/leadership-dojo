import { getCase, getAllCases } from "@/lib/data";
import { notFound } from "next/navigation";
import CaseReader from "./CaseReader";

export async function generateStaticParams() {
  const cases = getAllCases();
  return cases.map((c) => ({ id: c.id }));
}

const TYPE_COLOR: Record<string, string> = {
  crisis: "text-red-400 bg-red-400/10 border-red-400/20",
  pitch: "text-orange-400 bg-orange-400/10 border-orange-400/20",
  negotiation: "text-blue-400 bg-blue-400/10 border-blue-400/20",
};

export default async function CasePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const caseStudy = getCase(id);
  if (!caseStudy) notFound();

  const stakeholders = caseStudy.stakeholder_map ? Object.entries(caseStudy.stakeholder_map) : [];

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-neutral-600 mb-8">
        <a href="/cases" className="hover:text-neutral-400 transition-colors">Cases</a>
        <span>/</span>
        <span className="text-neutral-500">{caseStudy.title}</span>
      </div>

      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center gap-3 mb-3">
          <span className={`text-xs px-2 py-0.5 rounded border font-medium capitalize ${TYPE_COLOR[caseStudy.case_type] ?? "text-neutral-400 bg-neutral-800 border-neutral-700"}`}>
            {caseStudy.case_type}
          </span>
          <span className="text-neutral-600 text-sm">{caseStudy.country}</span>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-4">{caseStudy.title}</h1>
        <div className="flex flex-wrap gap-2">
          {caseStudy.tags.map((tag) => (
            <span key={tag} className="text-xs text-neutral-600 bg-neutral-900 border border-neutral-800 px-2 py-0.5 rounded">
              {tag}
            </span>
          ))}
        </div>
      </div>

      {/* Context */}
      <div className="mb-10 grid gap-3">
        <div className="border border-neutral-800 rounded-xl p-5">
          <div className="text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-2">Your position</div>
          <p className="text-neutral-300 text-sm leading-relaxed">{caseStudy.context.your_position}</p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="border border-neutral-800 rounded-xl p-4">
            <div className="text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-2">Context</div>
            <p className="text-neutral-400 text-xs leading-relaxed">{caseStudy.context.recent_events}</p>
          </div>
          <div className="border border-neutral-800 rounded-xl p-4">
            <div className="text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-2">Cultural factors</div>
            <p className="text-neutral-400 text-xs leading-relaxed">{caseStudy.context.cultural_factors}</p>
          </div>
        </div>
      </div>

      {/* Stakeholders */}
      {stakeholders.length > 0 && (
        <div className="mb-10">
          <div className="text-xs font-semibold text-neutral-600 uppercase tracking-widest mb-4">Stakeholders</div>
          <div className="space-y-2">
            {stakeholders.map(([name, info]) => (
              <div key={name} className="border border-neutral-800 rounded-lg px-4 py-3 flex items-start gap-4">
                <div className="min-w-0 flex-1">
                  <div className="text-sm font-medium text-neutral-300 mb-0.5">{name}</div>
                  <div className="text-xs text-neutral-600">{info.stance}</div>
                </div>
                <div className="text-xs text-neutral-700 shrink-0">Power: {info.power}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Divider */}
      <div className="border-t border-neutral-800 mb-10" />

      {/* Interactive reader */}
      <CaseReader caseStudy={caseStudy} />
    </div>
  );
}
