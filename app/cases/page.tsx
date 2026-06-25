import { getAllCases } from "@/lib/data";

const TYPE_COLOR: Record<string, string> = {
  crisis: "text-red-700 bg-red-100 dark:text-red-400 dark:bg-red-400/10",
  pitch: "text-orange-700 bg-orange-100 dark:text-orange-400 dark:bg-orange-400/10",
  negotiation: "text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-400/10",
  decision: "text-purple-700 bg-purple-100 dark:text-purple-400 dark:bg-purple-400/10",
  stakeholder: "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-400/10",
  general: "text-gray-600 bg-gray-100 dark:text-neutral-400 dark:bg-neutral-800",
};

export default function CasesPage() {
  const cases = getAllCases();
  const types = [...new Set(cases.map((c) => c.case_type))];

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: "var(--text)" }}>All Cases</h1>
        <p style={{ color: "var(--muted)" }}>{cases.length} case studies from {[...new Set(cases.map((c) => c.country))].length} countries</p>
      </div>

      {types.map((type) => {
        const typeCases = cases.filter((c) => c.case_type === type);
        return (
          <div key={type} className="mb-12">
            <h2
              className="text-xs font-semibold uppercase tracking-widest mb-4 pb-2 capitalize"
              style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}
            >
              {type} ({typeCases.length})
            </h2>
            <div className="grid gap-2">
              {typeCases.map((c) => (
                <a
                  key={c.id}
                  href={`/cases/${c.id}`}
                  className="flex items-start justify-between gap-4 rounded-lg px-5 py-4 no-underline group transition-all hover:shadow-sm"
                  style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
                >
                  <div className="min-w-0">
                    <h3 className="text-sm font-medium mb-1 group-hover:opacity-80 transition-opacity" style={{ color: "var(--text-2)" }}>
                      {c.title}
                    </h3>
                    {c.tags.length > 0 && (
                      <div className="flex flex-wrap gap-1.5 mt-2">
                        {c.tags.slice(0, 4).map((tag) => (
                          <span
                            key={tag}
                            className="text-xs px-2 py-0.5 rounded"
                            style={{ color: "var(--muted-2)", background: "var(--surface-2)", border: "1px solid var(--border)" }}
                          >
                            {tag}
                          </span>
                        ))}
                      </div>
                    )}
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs hidden sm:block" style={{ color: "var(--muted-2)" }}>{c.country}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium capitalize ${TYPE_COLOR[c.case_type] ?? TYPE_COLOR.general}`}>
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
