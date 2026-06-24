import { getAllCourses } from "@/lib/data";

const DIFFICULTY_COLOR: Record<string, string> = {
  Foundation: "text-green-400 bg-green-400/10",
  Intermediate: "text-blue-400 bg-blue-400/10",
  Advanced: "text-purple-400 bg-purple-400/10",
  Mastery: "text-orange-400 bg-orange-400/10",
};


export default function CoursesPage() {
  const courses = getAllCourses();
  const categories = [...new Set(courses.map((c) => c.category))];

  return (
    <div className="max-w-5xl mx-auto px-6 py-12">
      <div className="mb-10">
        <h1 className="text-3xl font-bold text-white tracking-tight mb-2">All Courses</h1>
        <p className="text-neutral-500">{courses.length} courses across {categories.length} topic areas</p>
      </div>

      {categories.map((cat) => {
        const catCourses = courses.filter((c) => c.category === cat);
        return (
          <div key={cat} className="mb-12">
            <h2 className="text-xs font-semibold text-neutral-500 uppercase tracking-widest mb-4 pb-2 border-b border-neutral-800">
              {cat}
            </h2>
            <div className="grid gap-3">
              {catCourses.map((course) => (
                <a
                  key={course.id}
                  href={`/courses/${course.slug}`}
                  className="flex items-start justify-between gap-4 border border-neutral-800 rounded-lg px-5 py-4 hover:border-neutral-600 transition-colors no-underline group"
                >
                  <div className="min-w-0">
                    <div className="flex items-center gap-2 mb-1">
                      <span className="text-neutral-600 text-xs font-mono">{String(course.courseNumber).padStart(2, "0")}</span>
                      <h3 className="text-sm font-medium text-neutral-200 group-hover:text-white transition-colors truncate">
                        {course.title}
                      </h3>
                    </div>
                    <p className="text-neutral-600 text-xs">{course.subtitle}</p>
                  </div>
                  <div className="flex items-center gap-3 shrink-0">
                    <span className="text-neutral-600 text-xs hidden sm:block">{course.duration}</span>
                    <span className={`text-xs px-2 py-0.5 rounded font-medium ${DIFFICULTY_COLOR[course.difficulty] ?? "text-neutral-400 bg-neutral-800"}`}>
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
