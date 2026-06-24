import { getAllCases } from "@/lib/data";

const TYPE_COLOR: Record<string, string> = {
  crisis: "text-red-400 bg-red-400/10",
  pitch: "text-orange-400 bg-orange-400/10",
  negotiation: "text-blue-400 bg-blue-400/10",
  decision: "text-purple-400 bg-purple-400/10",
  stakeholder: "text-green-400 bg-green-400/10",
};

export default function CasesPage() {
  const cases = getAllCases();
  const types = [...new Set(cases.map((c) => c.case_type))];

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">All Cases</h1>
        <p className="text-neutral-500">{cases.length} case studies from {[...new Set(cases.map((c) => c.country))].length} countries</p>
      </div>

      {types.map((type) => {
        const typeCases = cases.filter((c) => c.case_type === type);
        return (
          <div key={type} className="mb-12">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-4 pb-2 border-b border-neutral-800 capitalize">
              {type} ({typeCases.length})
            </h2>
            <div className="grid gap-3">
              {typeCases.map((c) => (
                <a
                  key={c.id}
                  href={`/cases/${c.id}`}
                  className="flex items-start justify-between gap-4 border border-neutral-800 rounded-lg px-5 py-4 hover:border-neutral-600 transition-colors no-underline group"
                >
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium text-neutral-200 group-hover:text-white transition-colors mb-1">
                      {c.title}
                    </h3>
                    <div className="flex flex-wrap gap-2 mt-2">
                      {c.tags.slice(0, 4).map((tag) => (
                        <span key={tag} className="text-xs text-neutral-600 bg-neutral-900 px-2 py-0.5 rounded border border-neutral-800">
                          {tag}
                        </span>
                      ))}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-neutral-600 text-xs hidden sm:block">{c.country}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${TYPE_COLOR[c.case_type] ?? "text-neutral-400 bg-neutral-800"}`}>
                      {c.case_type}
                    </span>
                  </div>
                </a>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}
