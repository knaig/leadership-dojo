import { getAllCourses } from "@/lib/data";

const DIFFICULTY: Record<string, string> = {
  Foundation: "text-green-700 bg-green-100 dark:text-green-400 dark:bg-green-400/10",
  Intermediate: "text-blue-700 bg-blue-100 dark:text-blue-400 dark:bg-blue-400/10",
  Advanced: "text-purple-700 bg-purple-100 dark:text-purple-400 dark:bg-purple-400/10",
  Mastery: "text-orange-700 bg-orange-100 dark:text-orange-400 dark:bg-orange-400/10",
};

export default function CoursesPage() {
  const courses = getAllCourses();
  const categories = [...new Set(courses.map((c) => c.category))];

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold tracking-tight mb-2" style={{ color: "var(--text)" }}>All Courses</h1>
        <p style={{ color: "var(--muted)" }}>{courses.length} courses across {categories.length} topic areas</p>
      </div>

      {categories.map((cat) => {
        const catCourses = courses.filter((c) => c.category === cat);
        return (
          <div key={cat} className="mb-12">
            <h2
              className="text-xs font-semibold uppercase tracking-widest mb-4 pb-2"
              style={{ color: "var(--muted)", borderBottom: "1px solid var(--border)" }}
            >
              {cat}
            </h2>
            <div className="grid gap-2">
              {catCourses.map((course) => (
                <a
                  key={course.id}
                  href={`/courses/${course.slug}`}
                  className="flex items-start justify-between gap-4 rounded-lg px-5 py-4 no-underline group transition-all hover:shadow-sm"
                  style={{ border: "1px solid var(--border)", background: "var(--surface)" }}
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-xs font-mono" style={{ color: "var(--muted-2)" }}>
                        {String(course.courseNumber).padStart(2, "0")}
                      </span>
                      <h3 className="text-sm font-medium truncate transition-colors" style={{ color: "var(--text-2)" }}>
                        {course.title}
                      </h3>
                    </div>
                    <p className="text-xs" style={{ color: "var(--muted-2)" }}>{course.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-xs hidden sm:block" style={{ color: "var(--muted-2)" }}>{course.duration}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${DIFFICULTY[course.difficulty] ?? "text-gray-600 bg-gray-100 dark:text-neutral-400 dark:bg-neutral-800"}`}>
                      {course.difficulty}
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
