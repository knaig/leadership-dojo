import { getAllCourses, getAllCases } from "@/lib/data";

const DIFFICULTY_COLOR: Record<string, { light: string; dark: string }> = {
  Foundation: { light: "text-green-700 bg-green-100 border-green-200", dark: "dark:text-green-400 dark:bg-green-400/10 dark:border-green-400/20" },
  Intermediate: { light: "text-blue-700 bg-blue-100 border-blue-200", dark: "dark:text-blue-400 dark:bg-blue-400/10 dark:border-blue-400/20" },
  Advanced: { light: "text-purple-700 bg-purple-100 border-purple-200", dark: "dark:text-purple-400 dark:bg-purple-400/10 dark:border-purple-400/20" },
  Mastery: { light: "text-orange-700 bg-orange-100 border-orange-200", dark: "dark:text-orange-400 dark:bg-orange-400/10 dark:border-orange-400/20" },
};

function difficultyClass(d: string) {
  const c = DIFFICULTY_COLOR[d];
  return c ? `${c.light} ${c.dark}` : "text-gray-600 bg-gray-100 border-gray-200 dark:text-neutral-400 dark:bg-neutral-800 dark:border-neutral-700";
}

export default function Home() {
  const courses = getAllCourses();
  const cases = getAllCases();
  const categories = [...new Set(courses.map((c) => c.category))];

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      {/* Hero */}
      <div className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight mb-4" style={{ color: "var(--text)" }}>
          Learn by doing, not by reading.
        </h1>
        <p className="text-lg max-w-2xl" style={{ color: "var(--muted)" }}>
          {courses.length} courses. {cases.length} case studies. Real scenarios
          from digital public infrastructure, government tech, and civic innovation.
          No theory without practice.
        </p>
        <div className="flex gap-4 mt-8">
          <a
            href="/courses"
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors text-white"
            style={{ background: "var(--accent)" }}
          >
            Browse courses
          </a>
          <a
            href="/cases"
            className="px-5 py-2.5 rounded-lg text-sm font-medium transition-colors"
            style={{ border: "1px solid var(--border-strong)", color: "var(--text-2)" }}
          >
            Browse cases
          </a>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-4 mb-16">
        {[
          { n: courses.length, label: "Courses" },
          { n: cases.length, label: "Case studies" },
          { n: categories.length, label: "Topic areas" },
        ].map(({ n, label }) => (
          <div
            key={label}
            className="rounded-xl p-6 text-center"
            style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
          >
            <div className="text-3xl font-bold" style={{ color: "var(--accent)" }}>{n}</div>
            <div className="text-sm mt-1" style={{ color: "var(--muted)" }}>{label}</div>
          </div>
        ))}
      </div>

      {/* Latest: pitch course */}
      {(() => {
        const latest = courses.find((c) => c.id === "product-pitch-presentations");
        if (!latest) return null;
        return (
          <div className="mb-16">
            <div className="flex items-center gap-2 mb-4">
              <span className="text-xs font-medium px-2 py-0.5 rounded" style={{ color: "var(--accent)", background: "var(--accent-bg)", border: "1px solid var(--accent-border)" }}>New</span>
              <span className="text-sm" style={{ color: "var(--muted-2)" }}>Latest course</span>
            </div>
            <a
              href={`/courses/${latest.slug}`}
              className="block rounded-xl p-6 no-underline transition-all hover:shadow-md"
              style={{ border: "1px solid var(--accent-border)", background: "var(--accent-bg)" }}
            >
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text)" }}>{latest.title}</h2>
                  <p className="text-sm mb-4" style={{ color: "var(--muted)" }}>{latest.subtitle}</p>
                  <p className="text-sm leading-relaxed max-w-xl" style={{ color: "var(--muted)" }}>{latest.description.slice(0, 180)}…</p>
                </div>
                <span className={`shrink-0 text-xs px-2 py-1 rounded border font-medium ${difficultyClass(latest.difficulty)}`}>
                  {latest.difficulty}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-6 text-xs" style={{ color: "var(--muted-2)" }}>
                <span>{latest.duration}</span>
                <span>·</span>
                <span>{latest.modules.length} modules</span>
                <span>·</span>
                <span>{latest.category}</span>
              </div>
            </a>
          </div>
        );
      })()}

      {/* Categories */}
      <div>
        <h2 className="text-lg font-semibold mb-6" style={{ color: "var(--text)" }}>Topics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {categories.map((cat) => {
            const count = courses.filter((c) => c.category === cat).length;
            return (
              <a
                key={cat}
                href={`/courses?category=${encodeURIComponent(cat)}`}
                className="rounded-lg px-4 py-3 no-underline transition-all hover:shadow-sm"
                style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
              >
                <div className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{cat}</div>
                <div className="text-xs mt-0.5" style={{ color: "var(--muted-2)" }}>{count} course{count !== 1 ? "s" : ""}</div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
