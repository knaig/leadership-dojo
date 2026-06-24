import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Dojo — Leadership Case Studies",
  description:
    "Case-based leadership learning for civic tech builders and government advisors. 42 courses, 45+ cases.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full">
      <body className="min-h-full flex flex-col" style={{ background: "#0f0f0f", color: "#e5e5e5" }}>
        <header className="border-b border-neutral-800 px-6 py-4 flex items-center justify-between">
          <a href="/" className="flex items-center gap-3 no-underline">
            <span className="text-orange-500 font-bold text-xl tracking-tight">Dojo</span>
            <span className="text-neutral-600 text-sm hidden sm:block">Leadership Case Studies</span>
          </a>
          <nav className="flex gap-6 text-sm text-neutral-400">
            <a href="/courses" className="hover:text-neutral-100 transition-colors">Courses</a>
            <a href="/cases" className="hover:text-neutral-100 transition-colors">Cases</a>
          </nav>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="border-t border-neutral-800 px-6 py-4 text-neutral-600 text-xs text-center">
          COSS Leadership Program
        </footer>
      </body>
    </html>
  );
}
