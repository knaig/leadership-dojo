import { getCourse, getAllCourses } from "@/lib/data";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  const courses = getAllCourses();
  return courses.map((c) => ({ id: c.slug }));
}

const DIFFICULTY: Record<string, string> = {
  Foundation: "text-green-700 bg-green-100 border-green-200 dark:text-green-400 dark:bg-green-400/10 dark:border-green-400/20",
  Intermediate: "text-blue-700 bg-blue-100 border-blue-200 dark:text-blue-400 dark:bg-blue-400/10 dark:border-blue-400/20",
  Advanced: "text-purple-700 bg-purple-100 border-purple-200 dark:text-purple-400 dark:bg-purple-400/10 dark:border-purple-400/20",
  Mastery: "text-orange-700 bg-orange-100 border-orange-200 dark:text-orange-400 dark:bg-orange-400/10 dark:border-orange-400/20",
};

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = getCourse(id);
  if (!course) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs mb-8" style={{ color: "var(--muted-2)" }}>
        <a href="/courses" className="hover:underline" style={{ color: "var(--muted)" }}>Courses</a>
        <span>/</span>
        <span>{course.title}</span>
      </div>

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-sm font-mono" style={{ color: "var(--muted)" }}>#{course.courseNumber}</span>
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${DIFFICULTY[course.difficulty] ?? "text-gray-600 bg-gray-100 border-gray-200 dark:text-neutral-400 dark:bg-neutral-800 dark:border-neutral-700"}`}>
            {course.difficulty}
          </span>
          <span className="text-xs" style={{ color: "var(--muted)" }}>{course.category}</span>
        </div>
        <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: "var(--text)" }}>{course.title}</h1>
        <p className="text-lg mb-4" style={{ color: "var(--muted)" }}>{course.subtitle}</p>
        <div className="flex items-center gap-4 text-sm" style={{ color: "var(--muted-2)" }}>
          <span>{course.duration}</span>
          <span>·</span>
          <span>{course.modules.length} modules</span>
        </div>
      </div>

      {/* Description */}
      <div className="mb-10 p-5 rounded-xl" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <p className="leading-relaxed" style={{ color: "var(--text-2)" }}>{course.description}</p>
      </div>

      {/* Learning objectives */}
      <div className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--muted)" }}>What you will learn</h2>
        <ul className="space-y-2">
          {course.learningObjectives.map((obj, i) => (
            <li key={i} className="flex items-start gap-3 text-sm" style={{ color: "var(--text-2)" }}>
              <span className="mt-0.5 shrink-0" style={{ color: "var(--accent)" }}>→</span>
              <span>{obj}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Modules */}
      <div className="mb-10">
        <h2 className="text-xs font-semibold uppercase tracking-widest mb-4" style={{ color: "var(--muted)" }}>Modules</h2>
        <div className="space-y-3">
          {course.modules.map((mod, i) => (
            <div key={mod.id} className="rounded-lg p-4" style={{ border: "1px solid var(--border)", background: "var(--surface)" }}>
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-mono" style={{ color: "var(--muted-2)" }}>{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{mod.title}</span>
                  </div>
                  {mod.type === "case_study" && (
                    <span className="text-xs px-2 py-0.5 rounded" style={{ color: "var(--accent)", background: "var(--accent-bg)" }}>Practice cases</span>
                  )}
                </div>
                <span className="text-xs shrink-0" style={{ color: "var(--muted-2)" }}>{mod.duration}</span>
              </div>

              {mod.type === "case_study" && (mod.content as { cases?: { caseId: string; title: string; framework: string; scenario: string }[] }).cases && (
                <div className="mt-3 space-y-2">
                  {(mod.content as { cases: { caseId: string; title: string; framework: string; scenario: string }[] }).cases.map((c) => (
                    <a
                      key={c.caseId}
                      href={`/cases/${c.caseId}`}
                      className="flex items-start justify-between gap-3 rounded-lg px-4 py-3 no-underline group transition-colors"
                      style={{ background: "var(--surface-2)", border: "1px solid var(--border)" }}
                    >
                      <div>
                        <div className="text-sm font-medium" style={{ color: "var(--text-2)" }}>{c.title}</div>
                        <div className="text-xs mt-0.5" style={{ color: "var(--muted-2)" }}>{c.scenario}</div>
                      </div>
                      <span className="text-xs px-2 py-0.5 rounded shrink-0" style={{ color: "var(--accent)", border: "1px solid var(--accent-border)" }}>{c.framework}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {course.prerequisites.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>Prerequisites</h2>
          <div className="flex flex-wrap gap-2">
            {course.prerequisites.map((p) => (
              <a key={p} href={`/courses/${p}`} className="text-xs rounded px-3 py-1 no-underline hover:opacity-80 transition-opacity" style={{ color: "var(--muted)", border: "1px solid var(--border)" }}>
                {p.replace(/-/g, " ")}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
