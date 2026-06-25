import type { Metadata } from "next";
import "./globals.css";
import ThemeToggle from "./components/ThemeToggle";

export const metadata: Metadata = {
  title: "Dojo — Leadership Case Studies",
  description:
    "Case-based leadership learning for civic tech builders and government advisors. 42 courses, 45+ cases.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className="h-full" suppressHydrationWarning>
      <head>
        {/* Prevent flash of wrong theme */}
        <script dangerouslySetInnerHTML={{
          __html: `(function(){var s=localStorage.getItem('theme');var d=window.matchMedia('(prefers-color-scheme: dark)').matches;if(s==='dark'||(s!=='light'&&d))document.documentElement.classList.add('dark');})()`
        }} />
      </head>
      <body className="min-h-full flex flex-col" style={{ background: "var(--bg)", color: "var(--text)" }}>
        <header style={{ borderBottom: "1px solid var(--border)", background: "var(--bg)" }} className="px-6 py-4 flex items-center justify-between sticky top-0 z-10 backdrop-blur-sm bg-opacity-90">
          <a href="/" className="flex items-center gap-3 no-underline">
            <span className="font-bold text-xl tracking-tight" style={{ color: "var(--accent)" }}>Dojo</span>
            <span className="text-sm hidden sm:block" style={{ color: "var(--muted-2)" }}>Leadership Case Studies</span>
          </a>
          <div className="flex items-center gap-5">
            <nav className="flex gap-5 text-sm" style={{ color: "var(--muted)" }}>
              <a href="/courses" className="hover:opacity-80 transition-opacity" style={{ color: "inherit" }}>Courses</a>
              <a href="/cases" className="hover:opacity-80 transition-opacity" style={{ color: "inherit" }}>Cases</a>
            </nav>
            <ThemeToggle />
          </div>
        </header>
        <main className="flex-1">{children}</main>
        <footer className="px-6 py-4 text-xs text-center" style={{ borderTop: "1px solid var(--border)", color: "var(--muted-2)" }}>
          COSS Leadership Program
        </footer>
      </body>
    </html>
  );
}
