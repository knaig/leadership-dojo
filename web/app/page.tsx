import { auth } from '@clerk/nextjs/server';
import { redirect } from 'next/navigation';
import Link from 'next/link';
import { BRAND } from '@/lib/brand';
import { MiraLogo } from '@/components/ui/MiraLogo';

export default async function HomePage() {
  const { userId } = await auth();

  if (userId) {
    redirect('/dashboard');
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 text-white">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 py-4 max-w-6xl mx-auto">
        <div className="flex items-center gap-3">
          <MiraLogo size={36} />
          <span className="text-lg font-semibold">{BRAND.name}</span>
        </div>
        <div className="flex items-center gap-3">
          <Link href="/#security" className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
            Security
          </Link>
          <Link href="/pricing" className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
            Pricing
          </Link>
          <Link href="/sign-in" className="px-4 py-2 text-sm text-slate-300 hover:text-white transition-colors">
            Sign in
          </Link>
          <Link href="/sign-up" className="px-4 py-2 text-sm bg-primary hover:bg-primary/90 rounded-lg transition-colors font-medium">
            Get started
          </Link>
        </div>
      </nav>

      {/* Hero */}
      <main className="max-w-6xl mx-auto px-6 pt-20 pb-32">
        <div className="max-w-3xl">
          <h1 className="text-4xl sm:text-5xl lg:text-6xl font-bold leading-tight">
            Your meetings,<br />
            <span className="text-primary">sharpened by Mira.</span>
          </h1>
          <p className="mt-6 text-lg text-slate-400 leading-relaxed max-w-xl">
            Mira is your AI coach who watches your calendar, preps you before meetings, tracks
            outcomes after, and helps you become the kind of leader people remember from the room.
          </p>
          <div className="mt-8 flex gap-4">
            <Link href="/sign-up" className="px-6 py-3 bg-primary hover:bg-primary/90 rounded-xl text-base font-medium transition-colors">
              Start for free
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="mt-32 grid md:grid-cols-3 gap-8">
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-lg bg-emerald-500/10 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-emerald-400" />
            </div>
            <h3 className="text-lg font-semibold">Meeting Prep</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Before every important meeting, Mira pulls context from your email, docs, and past conversations
              to give you a sharp brief. Walk in prepared, not winging it.
            </p>
          </div>
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-lg bg-amber-500/10 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-amber-400" />
            </div>
            <h3 className="text-lg font-semibold">Outcome Tracking</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              &ldquo;What do you want from this meeting?&rdquo; before. &ldquo;Did you get it?&rdquo; after.
              Over time, you see which meetings actually move the needle and which are just noise.
            </p>
          </div>
          <div className="space-y-3">
            <div className="w-10 h-10 rounded-lg bg-indigo-500/10 flex items-center justify-center">
              <div className="w-2 h-2 rounded-full bg-indigo-400" />
            </div>
            <h3 className="text-lg font-semibold">Pattern Intelligence</h3>
            <p className="text-sm text-slate-400 leading-relaxed">
              Weekly reflections surface trends you can&apos;t see: which stakeholders you&apos;re neglecting,
              which commitments keep slipping, and where your time is actually going.
            </p>
          </div>
        </div>

        {/* How it works */}
        <div className="mt-32 max-w-2xl">
          <h2 className="text-2xl font-bold mb-8">How it works</h2>
          <div className="space-y-6">
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">1</div>
              <div>
                <h3 className="font-semibold">Connect your tools</h3>
                <p className="text-sm text-slate-400 mt-1">Google Calendar, Gmail, and Drive. One click each. Mira starts watching.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">2</div>
              <div>
                <h3 className="font-semibold">Set your KPIs and goals</h3>
                <p className="text-sm text-slate-400 mt-1">Tell Mira what matters. She&apos;ll connect your daily meetings to your bigger objectives.</p>
              </div>
            </div>
            <div className="flex gap-4">
              <div className="w-8 h-8 rounded-full bg-primary/20 text-primary flex items-center justify-center text-sm font-bold flex-shrink-0">3</div>
              <div>
                <h3 className="font-semibold">Let Mira coach you</h3>
                <p className="text-sm text-slate-400 mt-1">Before meetings, after meetings, and in between — Mira shows up when it matters with the right context.</p>
              </div>
            </div>
          </div>
        </div>
        {/* Trust & Security */}
        <div className="mt-32" id="security">
          <h2 className="text-2xl font-bold mb-3">Trust &amp; Security</h2>
          <p className="text-sm text-slate-400 mb-10 max-w-xl">
            We handle sensitive work data &mdash; calendars, emails, stakeholder intelligence. Here&apos;s exactly what we do to earn your trust.
          </p>

          <div className="grid md:grid-cols-2 gap-6">
            {/* Encryption */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-emerald-500/10 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-emerald-400" />
                </div>
                <h3 className="font-semibold text-sm">Encryption at Rest &amp; In Transit</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                All data is encrypted in transit via TLS. OAuth tokens and API keys are encrypted at rest using AES-256-GCM before being stored in the database. Your credentials are never stored in plaintext.
              </p>
            </div>

            {/* Data Control */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-indigo-500/10 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-indigo-400" />
                </div>
                <h3 className="font-semibold text-sm">You Control Your Data</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Export all your data anytime as JSON (GDPR Article 20). Delete your account and all associated data permanently with one action (GDPR Article 17). Disconnect integrations and we revoke the OAuth tokens with Google.
              </p>
            </div>

            {/* Minimal Permissions */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-amber-500/10 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-amber-400" />
                </div>
                <h3 className="font-semibold text-sm">Read-Only Permissions</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Mira only reads your calendar, email, and documents. We never modify, delete, or send anything on your behalf. The OAuth scopes we request are read-only.
              </p>
            </div>

            {/* No Data Selling */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-purple-500/10 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-purple-400" />
                </div>
                <h3 className="font-semibold text-sm">No Data Selling. No Training.</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Your data is never sold, shared with third parties, or used to train AI models. Insights generated from your calendar and email are only visible to you.
              </p>
            </div>

            {/* Infrastructure */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-cyan-500/10 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-cyan-400" />
                </div>
                <h3 className="font-semibold text-sm">Enterprise-Grade Infrastructure</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Hosted on Vercel (SOC 2 Type II) and Neon PostgreSQL with automated backups. Authentication via Clerk with MFA support. All infrastructure runs in secure, isolated environments.
              </p>
            </div>

            {/* BYOLLM */}
            <div className="rounded-xl border border-white/10 bg-white/5 p-5 space-y-2">
              <div className="flex items-center gap-2">
                <div className="w-8 h-8 rounded-lg bg-rose-500/10 flex items-center justify-center">
                  <div className="w-2 h-2 rounded-full bg-rose-400" />
                </div>
                <h3 className="font-semibold text-sm">Bring Your Own LLM Key</h3>
              </div>
              <p className="text-xs text-slate-400 leading-relaxed">
                Use your own API key from Gemini, OpenAI, or Anthropic. Your data goes directly to your chosen provider under your own terms &mdash; never through a middleman.
              </p>
            </div>
          </div>
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t border-white/10 py-8 px-6">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-2 text-xs text-slate-500">
          <span>{BRAND.name} &mdash; {BRAND.tagline}</span>
          <div className="flex items-center gap-4">
            <Link href="/#security" className="hover:text-slate-300 transition-colors">Security</Link>
            <Link href="/pricing" className="hover:text-slate-300 transition-colors">Pricing</Link>
            <span>Your data stays yours.</span>
          </div>
        </div>
      </footer>
    </div>
  );
}
