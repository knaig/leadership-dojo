'use client';

import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { motion } from 'framer-motion';
import { ArrowLeft } from 'lucide-react';

export default function DojoLandingPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Back to Home */}
      <div className="fixed top-6 left-6 z-50">
        <Link
          href="/"
          className="flex items-center gap-2 px-4 py-2 bg-slate-800/80 backdrop-blur-sm border border-slate-700 rounded-full text-slate-300 hover:text-white hover:bg-slate-700 transition-colors"
        >
          <ArrowLeft className="h-4 w-4" />
          <span className="text-sm">Back to Home</span>
        </Link>
      </div>

      {/* Hero Section */}
      <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
        {/* Background gradient */}
        <div className="absolute inset-0 bg-gradient-to-br from-slate-950 via-slate-900 to-slate-950" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_30%_20%,rgba(251,191,36,0.08),transparent_50%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_70%_80%,rgba(139,92,246,0.06),transparent_50%)]" />

        {/* Grid pattern */}
        <div className="absolute inset-0 opacity-[0.02]" style={{
          backgroundImage: `linear-gradient(rgba(255,255,255,0.1) 1px, transparent 1px),
                           linear-gradient(90deg, rgba(255,255,255,0.1) 1px, transparent 1px)`,
          backgroundSize: '64px 64px'
        }} />

        <div className="relative z-10 max-w-5xl mx-auto px-8 text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
          >
            {/* Badge */}
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full mb-8">
              <span className="text-amber-400 text-sm font-medium">Leadership Dojo</span>
              <span className="text-slate-500">|</span>
              <span className="text-slate-400 text-sm">Deliberate Practice for the AI Age</span>
            </div>

            {/* Main headline */}
            <h1 className="text-5xl md:text-7xl font-bold mb-6">
              <span className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
                The age of the
              </span>
              <br />
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                "good enough" generalist
              </span>
              <br />
              <span className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
                is over.
              </span>
            </h1>

            {/* Subheadline */}
            <p className="text-xl md:text-2xl text-slate-400 max-w-3xl mx-auto mb-12 leading-relaxed">
              AI commoditizes mediocre work instantly. But it can't replace{' '}
              <span className="text-slate-200">judgment</span>,{' '}
              <span className="text-slate-200">relationships</span>, or{' '}
              <span className="text-slate-200">contextual mastery</span>.
              <br />
              <span className="text-amber-400/80">The Dojo trains what AI can't replicate.</span>
            </p>

            {/* CTA Buttons */}
            <div className="flex items-center justify-center gap-4">
              <button
                onClick={() => router.push('/dojo/method')}
                className="px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold rounded-xl transition-all hover:scale-105 shadow-lg shadow-amber-500/20"
              >
                Explore the Method
              </button>
              <button
                onClick={() => router.push('/dojo/capacities')}
                className="px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold rounded-xl border border-slate-700 transition-all"
              >
                The 6 Capacities
              </button>
            </div>
          </motion.div>
        </div>

        {/* Scroll indicator */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 1, duration: 1 }}
          className="absolute bottom-8 left-1/2 -translate-x-1/2"
        >
          <div className="flex flex-col items-center gap-2 text-slate-500">
            <span className="text-xs uppercase tracking-wider">Scroll to explore</span>
            <motion.div
              animate={{ y: [0, 8, 0] }}
              transition={{ duration: 1.5, repeat: Infinity }}
            >
              ↓
            </motion.div>
          </div>
        </motion.div>
      </section>

      {/* The Problem Section */}
      <section className="py-32 px-8 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-8">
              The New Reality
            </h2>

            <div className="grid md:grid-cols-2 gap-12">
              <div className="space-y-6">
                <p className="text-lg text-slate-400 leading-relaxed">
                  AI is reshaping work. The middle is hollowing out. You now need to be either:
                </p>

                <div className="space-y-4">
                  <div className="flex items-start gap-4 p-4 bg-slate-900/50 border border-slate-800/50 rounded-xl">
                    <div className="w-10 h-10 rounded-lg bg-violet-500/20 flex items-center justify-center text-lg">
                      🎯
                    </div>
                    <div>
                      <h3 className="font-semibold text-slate-100">An Extreme Specialist</h3>
                      <p className="text-sm text-slate-400">So deep in a niche that AI can't match your expertise</p>
                    </div>
                  </div>

                  <div className="flex items-start gap-4 p-4 bg-amber-500/10 border border-amber-500/20 rounded-xl">
                    <div className="w-10 h-10 rounded-lg bg-amber-500/20 flex items-center justify-center text-lg">
                      ⚡
                    </div>
                    <div>
                      <h3 className="font-semibold text-amber-400">An Extraordinary Generalist</h3>
                      <p className="text-sm text-slate-400">High awareness, high judgment, high velocity on what matters</p>
                    </div>
                  </div>
                </div>
              </div>

              <div className="bg-slate-900/30 border border-slate-800/50 rounded-xl p-8">
                <h3 className="text-lg font-semibold text-slate-100 mb-4">The Dojo is for the second path.</h3>
                <p className="text-slate-400 mb-6">
                  We train the capacities that make generalists extraordinary:
                </p>
                <ul className="space-y-3">
                  {[
                    'Navigate ambiguity that AI cannot parse',
                    'Build relationships that require human trust',
                    'Make judgment calls with incomplete information',
                    'Coordinate across domains with situational awareness',
                    'Move fast on the things that actually matter'
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3 text-slate-300">
                      <span className="text-amber-400 mt-1">→</span>
                      <span>{item}</span>
                    </li>
                  ))}
                </ul>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Not An AI Assistant Section */}
      <section className="py-32 px-8 bg-gradient-to-b from-slate-950 to-slate-900/50 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
            className="text-center mb-16"
          >
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-6">
              Not an AI assistant.<br />
              <span className="text-amber-400">A training system that uses AI.</span>
            </h2>
          </motion.div>

          <div className="grid md:grid-cols-2 gap-8">
            {/* What Others Do */}
            <motion.div
              initial={{ opacity: 0, x: -20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-slate-800 flex items-center justify-center text-2xl">
                  🤖
                </div>
                <div>
                  <h3 className="font-bold text-slate-400">AI Assistants</h3>
                  <p className="text-sm text-slate-500">(Copilot, Gemini, etc.)</p>
                </div>
              </div>

              <ul className="space-y-4">
                {[
                  { text: 'Let AI do your work', emphasis: false },
                  { text: 'Write emails faster', emphasis: false },
                  { text: 'Summarize meetings', emphasis: false },
                  { text: 'Generate content', emphasis: false },
                  { text: 'Optimize for productivity metrics', emphasis: false },
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-slate-500">
                    <span className="w-5 h-5 rounded-full border border-slate-700 flex items-center justify-center text-xs">
                      ✓
                    </span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 pt-6 border-t border-slate-800">
                <p className="text-sm text-slate-500 italic">
                  "Makes you faster at work AI will eventually do anyway"
                </p>
              </div>
            </motion.div>

            {/* What We Do */}
            <motion.div
              initial={{ opacity: 0, x: 20 }}
              whileInView={{ opacity: 1, x: 0 }}
              transition={{ duration: 0.6 }}
              viewport={{ once: true }}
              className="bg-gradient-to-br from-amber-500/10 to-orange-500/5 border border-amber-500/20 rounded-xl p-8"
            >
              <div className="flex items-center gap-3 mb-6">
                <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-2xl">
                  ⛩️
                </div>
                <div>
                  <h3 className="font-bold text-amber-400">Leadership Dojo</h3>
                  <p className="text-sm text-amber-400/60">Deliberate practice system</p>
                </div>
              </div>

              <ul className="space-y-4">
                {[
                  { text: 'Train you to do work AI can\'t', emphasis: true },
                  { text: 'Write emails that build relationships', emphasis: true },
                  { text: 'Develop judgment from meetings', emphasis: true },
                  { text: 'Build situational awareness', emphasis: true },
                  { text: 'Optimize for behavior change', emphasis: true },
                ].map((item, idx) => (
                  <li key={idx} className="flex items-center gap-3 text-amber-100">
                    <span className="w-5 h-5 rounded-full bg-amber-500/30 flex items-center justify-center text-xs text-amber-400">
                      ✓
                    </span>
                    <span>{item.text}</span>
                  </li>
                ))}
              </ul>

              <div className="mt-8 pt-6 border-t border-amber-500/20">
                <p className="text-sm text-amber-400/80 font-medium">
                  "Makes you irreplaceable at work only humans can do"
                </p>
              </div>
            </motion.div>
          </div>
        </div>
      </section>

      {/* The Core Insight */}
      <section className="py-32 px-8 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-8">
              We don't teach skills.<br />
              <span className="text-amber-400">We develop capacities.</span>
            </h2>

            <p className="text-lg text-slate-400 mb-12 max-w-2xl mx-auto">
              Skills can be automated. Capacities—the ability to read situations,
              build trust, exercise judgment—these are uniquely human.
            </p>

            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {[
                { icon: '��️', capacity: 'Situational Awareness', description: 'Reading what\'s not said' },
                { icon: '🎯', capacity: 'Outcome Orientation', description: 'Focus on what matters' },
                { icon: '🤝', capacity: 'Relationship Capital', description: 'Trust built over time' },
                { icon: '🧠', capacity: 'Domain Mastery', description: 'Your context, deeply' },
                { icon: '⚖️', capacity: 'Decision Quality', description: 'Judgment under uncertainty' },
                { icon: '🚀', capacity: 'Execution Velocity', description: 'Fast on the right things' },
              ].map((item, idx) => (
                <motion.div
                  key={idx}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  viewport={{ once: true }}
                  className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-6 hover:border-amber-500/30 transition-colors"
                >
                  <div className="text-3xl mb-3">{item.icon}</div>
                  <h3 className="font-semibold text-slate-100 mb-1">{item.capacity}</h3>
                  <p className="text-sm text-slate-500">{item.description}</p>
                </motion.div>
              ))}
            </div>

            <button
              onClick={() => router.push('/dojo/capacities')}
              className="mt-12 px-6 py-3 bg-slate-800 hover:bg-slate-700 text-slate-100 rounded-lg transition-colors"
            >
              Explore all 6 capacities →
            </button>
          </motion.div>
        </div>
      </section>

      {/* CTA Section */}
      <section className="py-32 px-8 bg-gradient-to-b from-slate-900/50 to-slate-950 border-t border-slate-800/50">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl md:text-4xl font-bold text-slate-100 mb-6">
              Ready to train differently?
            </h2>
            <p className="text-lg text-slate-400 mb-12">
              Discover how the Dojo observes your real work,
              identifies growth edges, and prescribes deliberate practice.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => router.push('/dojo/method')}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold rounded-xl transition-all hover:scale-105 shadow-lg shadow-amber-500/20"
              >
                See How It Works
              </button>
              <button
                onClick={() => router.push('/')}
                className="w-full sm:w-auto px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold rounded-xl border border-slate-700 transition-all"
              >
                Start Training
              </button>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Footer */}
      <footer className="py-8 px-8 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto flex items-center justify-between text-sm text-slate-500">
          <span>Leadership Dojo</span>
          <div className="flex items-center gap-6">
            <button onClick={() => router.push('/dojo/method')} className="hover:text-slate-300 transition-colors">
              Method
            </button>
            <button onClick={() => router.push('/dojo/capacities')} className="hover:text-slate-300 transition-colors">
              Capacities
            </button>
            <button onClick={() => router.push('/dojo/how-it-works')} className="hover:text-slate-300 transition-colors">
              How It Works
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
