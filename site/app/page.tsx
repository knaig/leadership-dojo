import { getAllCourses, getAllCases } from "@/lib/data";

const DIFFICULTY_COLOR: Record<string, string> = {
  Foundation: "text-green-400 bg-green-400/10",
  Intermediate: "text-blue-400 bg-blue-400/10",
  Advanced: "text-purple-400 bg-purple-400/10",
  Mastery: "text-orange-400 bg-orange-400/10",
};

export default function Home() {
  const courses = getAllCourses();
  const cases = getAllCases();
  const categories = [...new Set(courses.map((c) => c.category))];

  return (
    <div className="max-w-5xl mx-auto px-6 py-16">
      {/* Hero */}
      <div className="mb-16">
        <h1 className="text-4xl font-bold tracking-tight text-white mb-4">
          Learn by doing, not by reading.
        </h1>
        <p className="text-neutral-400 text-lg max-w-2xl">
          {courses.length} courses. {cases.length} case studies. Real scenarios
          from digital public infrastructure, government tech, and civic innovation.
          No theory without practice.
        </p>
        <div className="flex gap-4 mt-8">
          <a
            href="/courses"
            className="px-5 py-2.5 bg-orange-500 text-white rounded-lg text-sm font-medium hover:bg-orange-600 transition-colors"
          >
            Browse courses
          </a>
          <a
            href="/cases"
            className="px-5 py-2.5 border border-neutral-700 text-neutral-300 rounded-lg text-sm font-medium hover:border-neutral-500 hover:text-white transition-colors"
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
            className="border border-neutral-800 rounded-xl p-6 text-center"
          >
            <div className="text-3xl font-bold text-orange-400">{n}</div>
            <div className="text-neutral-500 text-sm mt-1">{label}</div>
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
              <span className="text-xs font-medium text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded">New</span>
              <span className="text-neutral-600 text-sm">Latest course</span>
            </div>
            <a href={`/courses/${latest.slug}`} className="block border border-orange-500/30 bg-orange-500/5 rounded-xl p-6 hover:border-orange-500/60 transition-colors no-underline">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-xl font-semibold text-white mb-2">{latest.title}</h2>
                  <p className="text-neutral-400 text-sm mb-4">{latest.subtitle}</p>
                  <p className="text-neutral-500 text-sm leading-relaxed max-w-xl">{latest.description.slice(0, 180)}…</p>
                </div>
                <span className={`shrink-0 text-xs px-2 py-1 rounded font-medium ${DIFFICULTY_COLOR[latest.difficulty] ?? "text-neutral-400 bg-neutral-800"}`}>
                  {latest.difficulty}
                </span>
              </div>
              <div className="flex items-center gap-4 mt-6 text-xs text-neutral-600">
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
        <h2 className="text-lg font-semibold text-white mb-6">Topics</h2>
        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
          {categories.map((cat) => {
            const count = courses.filter((c) => c.category === cat).length;
            return (
              <a
                key={cat}
                href={`/courses?category=${encodeURIComponent(cat)}`}
                className="border border-neutral-800 rounded-lg px-4 py-3 hover:border-neutral-600 transition-colors no-underline"
              >
                <div className="text-sm font-medium text-neutral-200">{cat}</div>
                <div className="text-xs text-neutral-600 mt-0.5">{count} course{count !== 1 ? "s" : ""}</div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
}
