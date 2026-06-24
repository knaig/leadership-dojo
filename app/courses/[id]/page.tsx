import { getCourse, getAllCourses } from "@/lib/data";
import { notFound } from "next/navigation";

export async function generateStaticParams() {
  const courses = getAllCourses();
  return courses.map((c) => ({ id: c.slug }));
}

const DIFFICULTY_COLOR: Record<string, string> = {
  Foundation: "text-green-400 bg-green-400/10 border-green-400/20",
  Intermediate: "text-blue-400 bg-blue-400/10 border-blue-400/20",
  Advanced: "text-purple-400 bg-purple-400/10 border-purple-400/20",
  Mastery: "text-orange-400 bg-orange-400/10 border-orange-400/20",
};

export default async function CoursePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const course = getCourse(id);
  if (!course) notFound();

  return (
    <div className="max-w-3xl mx-auto px-6 py-12">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-xs text-neutral-600 mb-8">
        <a href="/courses" className="hover:text-neutral-400 transition-colors">Courses</a>
        <span>/</span>
        <span className="text-neutral-500">{course.title}</span>
      </div>

      {/* Header */}
      <div className="mb-10">
        <div className="flex items-center gap-3 mb-3">
          <span className="text-neutral-600 text-sm font-mono">#{course.courseNumber}</span>
          <span className={`text-xs px-2 py-0.5 rounded border font-medium ${DIFFICULTY_COLOR[course.difficulty] ?? "text-neutral-400 bg-neutral-800 border-neutral-700"}`}>
            {course.difficulty}
          </span>
          <span className="text-neutral-700 text-xs">{course.category}</span>
        </div>
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">{course.title}</h1>
        <p className="text-neutral-400 text-lg mb-4">{course.subtitle}</p>
        <div className="flex items-center gap-4 text-sm text-neutral-600">
          <span>{course.duration}</span>
          <span>·</span>
          <span>{course.modules.length} modules</span>
        </div>
      </div>

      {/* Description */}
      <div className="mb-10 p-5 bg-neutral-900 rounded-xl border border-neutral-800">
        <p className="text-neutral-300 leading-relaxed">{course.description}</p>
      </div>

      {/* Learning objectives */}
      <div className="mb-10">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest mb-4">What you will learn</h2>
        <ul className="space-y-2">
          {course.learningObjectives.map((obj, i) => (
            <li key={i} className="flex items-start gap-3 text-sm text-neutral-300">
              <span className="text-orange-500 mt-0.5 shrink-0">→</span>
              <span>{obj}</span>
            </li>
          ))}
        </ul>
      </div>

      {/* Modules */}
      <div className="mb-10">
        <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest mb-4">Modules</h2>
        <div className="space-y-3">
          {course.modules.map((mod, i) => (
            <div key={mod.id} className="border border-neutral-800 rounded-lg p-4">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-neutral-700 text-xs font-mono">{String(i + 1).padStart(2, "0")}</span>
                    <span className="text-neutral-200 text-sm font-medium">{mod.title}</span>
                  </div>
                  {mod.type === "case_study" && (
                    <span className="text-xs text-orange-400 bg-orange-400/10 px-2 py-0.5 rounded">Practice cases</span>
                  )}
                </div>
                <span className="text-neutral-600 text-xs shrink-0">{mod.duration}</span>
              </div>

              {/* Case links */}
              {mod.type === "case_study" && (mod.content as { cases?: { caseId: string; title: string; framework: string }[] }).cases && (
                <div className="mt-3 space-y-2">
                  {(mod.content as { cases: { caseId: string; title: string; framework: string; scenario: string }[] }).cases.map((c) => (
                    <a
                      key={c.caseId}
                      href={`/cases/${c.caseId}`}
                      className="flex items-start justify-between gap-3 bg-neutral-800/60 rounded-lg px-4 py-3 hover:bg-neutral-800 transition-colors no-underline group"
                    >
                      <div>
                        <div className="text-sm font-medium text-neutral-200 group-hover:text-white transition-colors">{c.title}</div>
                        <div className="text-xs text-neutral-500 mt-0.5">{c.scenario}</div>
                      </div>
                      <span className="text-xs text-orange-400 border border-orange-400/30 px-2 py-0.5 rounded shrink-0">{c.framework}</span>
                    </a>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Prerequisites */}
      {course.prerequisites.length > 0 && (
        <div>
          <h2 className="text-sm font-semibold text-neutral-400 uppercase tracking-widest mb-3">Prerequisites</h2>
          <div className="flex flex-wrap gap-2">
            {course.prerequisites.map((p) => (
              <a key={p} href={`/courses/${p}`} className="text-xs text-neutral-400 border border-neutral-800 rounded px-3 py-1 hover:border-neutral-600 transition-colors no-underline">
                {p.replace(/-/g, " ")}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}
