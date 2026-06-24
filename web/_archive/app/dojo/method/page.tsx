'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';

export default function DojoMethodPage() {
  const router = useRouter();

  return (
    <div className="min-h-screen bg-slate-950">
      {/* Header */}
      <header className="sticky top-0 z-50 bg-slate-950/80 backdrop-blur-sm border-b border-slate-800/50">
        <div className="max-w-6xl mx-auto px-8 py-4 flex items-center justify-between">
          <button
            onClick={() => router.push('/dojo')}
            className="flex items-center gap-2 text-slate-400 hover:text-slate-100 transition-colors"
          >
            <span>←</span>
            <span className="text-sm">Leadership Dojo</span>
          </button>
          <nav className="flex items-center gap-6 text-sm">
            <button onClick={() => router.push('/dojo/capacities')} className="text-slate-400 hover:text-slate-100 transition-colors">
              Capacities
            </button>
            <button onClick={() => router.push('/dojo/how-it-works')} className="text-slate-400 hover:text-slate-100 transition-colors">
              How It Works
            </button>
            <button onClick={() => router.push('/')} className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-semibold rounded-lg transition-colors">
              Start Training
            </button>
          </nav>
        </div>
      </header>

      {/* Hero */}
      <section className="py-24 px-8">
        <div className="max-w-4xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6 }}
          >
            <div className="inline-flex items-center gap-2 px-4 py-2 bg-amber-500/10 border border-amber-500/20 rounded-full mb-6">
              <span className="text-amber-400 text-sm font-medium">The Method</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              <span className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Learn → Apply → Observe →
              </span>
              <br />
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                Improve → Learn
              </span>
            </h1>

            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Most training stops at "Learn." The Dojo closes the loop by observing
              your real work, surfacing blind spots, and prescribing targeted practice.
            </p>
          </motion.div>
        </div>
      </section>

      {/* The Core Loop - Main Flowchart */}
      <section className="py-16 px-8 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-2xl font-bold text-slate-100 mb-12 text-center">The Core Loop</h2>

            {/* Visual Flowchart */}
            <div className="relative bg-slate-900/30 border border-slate-800/50 rounded-2xl p-8 md:p-12">
              {/* Top: User's World */}
              <div className="text-center mb-12">
                <motion.div
                  initial={{ opacity: 0, scale: 0.9 }}
                  whileInView={{ opacity: 1, scale: 1 }}
                  transition={{ duration: 0.5 }}
                  viewport={{ once: true }}
                  className="inline-block bg-gradient-to-br from-violet-500/20 to-purple-500/10 border border-violet-500/30 rounded-2xl p-6"
                >
                  <div className="text-3xl mb-2">🌍</div>
                  <h3 className="text-lg font-bold text-violet-300 mb-2">YOUR WORLD</h3>
                  <div className="flex flex-wrap justify-center gap-2 text-sm">
                    <span className="px-3 py-1 bg-slate-800/50 rounded-full text-slate-400">Domain context</span>
                    <span className="px-3 py-1 bg-slate-800/50 rounded-full text-slate-400">Relationships</span>
                    <span className="px-3 py-1 bg-slate-800/50 rounded-full text-slate-400">Projects</span>
                  </div>
                </motion.div>

                <div className="text-slate-600 text-2xl my-4">↓</div>
              </div>

              {/* Main Loop - 4 Stages */}
              <div className="grid md:grid-cols-4 gap-6 mb-12">
                {[
                  {
                    stage: 'OBSERVE',
                    icon: '👁️',
                    color: 'amber',
                    description: 'Work artifacts → Situational patterns → Evidence',
                    details: ['Emails you send', 'Meetings you attend', 'Documents you write', 'Decisions you make']
                  },
                  {
                    stage: 'REFLECT',
                    icon: '🪞',
                    color: 'blue',
                    description: '"Here\'s what you did" → "Here\'s what it reveals"',
                    details: ['Patterns in your behavior', 'Blind spots surfaced', 'Strengths identified', 'Growth edges exposed']
                  },
                  {
                    stage: 'PRACTICE',
                    icon: '🥋',
                    color: 'emerald',
                    description: 'Targeted cases → Deliberate repetition → Feedback',
                    details: ['Cases matched to gaps', 'Progressive difficulty', 'AI coaching', 'Spaced repetition']
                  },
                  {
                    stage: 'APPLY',
                    icon: '🎯',
                    color: 'orange',
                    description: 'Next real situation → Conscious application → Observe...',
                    details: ['Pre-meeting prep', 'In-moment nudges', 'Post-situation review', 'Track improvement']
                  }
                ].map((item, idx) => (
                  <motion.div
                    key={item.stage}
                    initial={{ opacity: 0, y: 20 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    transition={{ duration: 0.5, delay: idx * 0.15 }}
                    viewport={{ once: true }}
                    className={`relative bg-${item.color}-500/10 border border-${item.color}-500/20 rounded-xl p-6
                      ${item.color === 'amber' ? 'bg-amber-500/10 border-amber-500/20' : ''}
                      ${item.color === 'blue' ? 'bg-blue-500/10 border-blue-500/20' : ''}
                      ${item.color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20' : ''}
                      ${item.color === 'orange' ? 'bg-orange-500/10 border-orange-500/20' : ''}
                    `}
                  >
                    {/* Arrow between stages */}
                    {idx < 3 && (
                      <div className="hidden md:block absolute -right-3 top-1/2 -translate-y-1/2 text-slate-600 text-xl z-10">
                        →
                      </div>
                    )}

                    <div className="text-3xl mb-3">{item.icon}</div>
                    <h3 className={`text-sm font-bold uppercase tracking-wider mb-2
                      ${item.color === 'amber' ? 'text-amber-400' : ''}
                      ${item.color === 'blue' ? 'text-blue-400' : ''}
                      ${item.color === 'emerald' ? 'text-emerald-400' : ''}
                      ${item.color === 'orange' ? 'text-orange-400' : ''}
                    `}>
                      {item.stage}
                    </h3>
                    <p className="text-sm text-slate-400 mb-4">{item.description}</p>

                    <ul className="space-y-1">
                      {item.details.map((detail, i) => (
                        <li key={i} className="text-xs text-slate-500 flex items-center gap-2">
                          <span className="w-1 h-1 rounded-full bg-slate-600" />
                          {detail}
                        </li>
                      ))}
                    </ul>
                  </motion.div>
                ))}
              </div>

              {/* Arrow back and outcomes */}
              <div className="flex items-start justify-center gap-8 md:gap-16">
                {/* Loop back arrow */}
                <div className="hidden md:flex flex-col items-center">
                  <div className="text-slate-600 text-xl">↑</div>
                  <div className="w-px h-8 bg-slate-700" />
                  <div className="text-slate-600 text-xl">←←←←←←←←←←←←←←←←</div>
                </div>
              </div>

              {/* Bottom: Dual Outcomes */}
              <div className="grid md:grid-cols-2 gap-8 mt-12 pt-8 border-t border-slate-800/50">
                <motion.div
                  initial={{ opacity: 0, x: -20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
                  viewport={{ once: true }}
                  className="bg-slate-800/30 border border-slate-700/50 rounded-xl p-6 text-center"
                >
                  <div className="text-3xl mb-3">🤖</div>
                  <h3 className="text-lg font-bold text-slate-100 mb-2">SYSTEM LEARNS</h3>
                  <ul className="space-y-2 text-sm text-slate-400">
                    <li>• Your context deepens</li>
                    <li>• Your patterns emerge</li>
                    <li>• What works for you</li>
                  </ul>
                </motion.div>

                <motion.div
                  initial={{ opacity: 0, x: 20 }}
                  whileInView={{ opacity: 1, x: 0 }}
                  transition={{ duration: 0.5 }}
                  viewport={{ once: true }}
                  className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6 text-center"
                >
                  <div className="text-3xl mb-3">🧠</div>
                  <h3 className="text-lg font-bold text-amber-400 mb-2">YOU GROW</h3>
                  <ul className="space-y-2 text-sm text-amber-100/80">
                    <li>• Awareness sharpens</li>
                    <li>• Judgment improves</li>
                    <li>• Capacity expands</li>
                  </ul>
                </motion.div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Why This Works */}
      <section className="py-24 px-8 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-slate-100 mb-4 text-center">Why This Works</h2>
            <p className="text-lg text-slate-400 text-center mb-16 max-w-2xl mx-auto">
              Traditional training fails because it stops at knowledge transfer.
              The Dojo succeeds because it creates behavior change.
            </p>

            <div className="grid md:grid-cols-3 gap-8">
              {[
                {
                  icon: '📊',
                  title: 'Evidence, Not Intuition',
                  description: 'Every insight is backed by specific examples from your actual work. No vague feedback—concrete evidence of what you did and what it means.'
                },
                {
                  icon: '🎯',
                  title: 'Your Context, Specifically',
                  description: 'The system learns your organization, your stakeholders, your domain. It becomes a coach who knows your world, not a generic advisor.'
                },
                {
                  icon: '🔄',
                  title: 'Continuous, Not Periodic',
                  description: 'Not annual reviews or quarterly check-ins. The Dojo observes continuously and provides feedback in the rhythm of your actual work.'
                },
                {
                  icon: '🥋',
                  title: 'Deliberate Practice',
                  description: 'Cases aren\'t random. They\'re selected specifically for your gaps, at the edge of your current competence, with immediate feedback.'
                },
                {
                  icon: '🔗',
                  title: 'Practice ↔ Reality Connection',
                  description: 'What you learn in cases connects directly to what you do at work. See exactly how training translates to real situations.'
                },
                {
                  icon: '😤',
                  title: 'Accountability That Works',
                  description: 'Sometimes annoying by design. The system won\'t let you skip reflection or avoid uncomfortable truths. That\'s how growth happens.'
                }
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  viewport={{ once: true }}
                  className="bg-slate-900/30 border border-slate-800/50 rounded-xl p-6 hover:border-slate-700 transition-colors"
                >
                  <div className="text-3xl mb-4">{item.icon}</div>
                  <h3 className="text-lg font-bold text-slate-100 mb-2">{item.title}</h3>
                  <p className="text-sm text-slate-400">{item.description}</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* The Difference */}
      <section className="py-24 px-8 border-t border-slate-800/50 bg-gradient-to-b from-slate-950 to-slate-900/30">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-slate-100 mb-12 text-center">
              The Difference
            </h2>

            <div className="bg-slate-900/50 border border-slate-800/50 rounded-2xl overflow-hidden">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-slate-800">
                    <th className="text-left py-4 px-6 text-slate-500 font-medium"></th>
                    <th className="text-center py-4 px-6 text-slate-400 font-medium">Traditional Training</th>
                    <th className="text-center py-4 px-6 text-amber-400 font-medium">Leadership Dojo</th>
                  </tr>
                </thead>
                <tbody>
                  {[
                    { aspect: 'Method', traditional: 'Courses & workshops', dojo: 'Observe → Reflect → Practice → Apply' },
                    { aspect: 'Evidence', traditional: 'Test scores', dojo: 'Real work artifacts' },
                    { aspect: 'Context', traditional: 'Generic examples', dojo: 'Your specific situations' },
                    { aspect: 'Feedback', traditional: 'End of course', dojo: 'Continuous, evidence-based' },
                    { aspect: 'Practice', traditional: 'Random exercises', dojo: 'Targeted at your gaps' },
                    { aspect: 'Accountability', traditional: 'Completion certificates', dojo: 'Behavior change tracking' },
                    { aspect: 'Outcome', traditional: 'Knowledge gained', dojo: 'Capacity developed' },
                  ].map((row, idx) => (
                    <tr key={row.aspect} className={idx < 6 ? 'border-b border-slate-800/50' : ''}>
                      <td className="py-4 px-6 text-slate-300 font-medium">{row.aspect}</td>
                      <td className="py-4 px-6 text-center text-slate-500">{row.traditional}</td>
                      <td className="py-4 px-6 text-center text-amber-100">{row.dojo}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How The System Evolves */}
      <section className="py-24 px-8 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-slate-100 mb-4 text-center">
              The System Evolves With You
            </h2>
            <p className="text-lg text-slate-400 text-center mb-16 max-w-2xl mx-auto">
              The Dojo learns at multiple levels, becoming more valuable over time.
            </p>

            <div className="relative">
              {/* Vertical timeline line */}
              <div className="absolute left-8 md:left-1/2 top-0 bottom-0 w-px bg-gradient-to-b from-amber-500/50 via-emerald-500/50 to-violet-500/50" />

              <div className="space-y-12">
                {[
                  {
                    level: 'Level 1',
                    title: 'Learn the User',
                    color: 'amber',
                    items: ['Your strengths & weaknesses', 'Your context & domain', 'Your relationships', 'Your growth trajectory']
                  },
                  {
                    level: 'Level 2',
                    title: 'Learn from the User',
                    color: 'emerald',
                    items: ['Corrections you make', 'Context you add', 'Patterns that work for you', 'Your unique insights']
                  },
                  {
                    level: 'Level 3',
                    title: 'Learn Across Users',
                    color: 'violet',
                    items: ['What works for similar roles', 'Common pitfalls to avoid', 'Effective patterns to recommend', 'Content gaps to fill']
                  }
                ].map((level, idx) => (
                  <motion.div
                    key={level.level}
                    initial={{ opacity: 0, x: idx % 2 === 0 ? -20 : 20 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    transition={{ duration: 0.5 }}
                    viewport={{ once: true }}
                    className={`relative flex items-start gap-8 ${idx % 2 === 0 ? 'md:flex-row' : 'md:flex-row-reverse'}`}
                  >
                    <div className="w-16 md:w-1/2" />

                    {/* Node */}
                    <div className={`absolute left-4 md:left-1/2 -translate-x-1/2 w-8 h-8 rounded-full border-4 border-slate-950
                      ${level.color === 'amber' ? 'bg-amber-500' : ''}
                      ${level.color === 'emerald' ? 'bg-emerald-500' : ''}
                      ${level.color === 'violet' ? 'bg-violet-500' : ''}
                    `} />

                    <div className={`flex-1 ml-12 md:ml-0 p-6 rounded-xl border
                      ${level.color === 'amber' ? 'bg-amber-500/10 border-amber-500/20' : ''}
                      ${level.color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20' : ''}
                      ${level.color === 'violet' ? 'bg-violet-500/10 border-violet-500/20' : ''}
                    `}>
                      <div className={`text-xs font-bold uppercase tracking-wider mb-1
                        ${level.color === 'amber' ? 'text-amber-400' : ''}
                        ${level.color === 'emerald' ? 'text-emerald-400' : ''}
                        ${level.color === 'violet' ? 'text-violet-400' : ''}
                      `}>
                        {level.level}
                      </div>
                      <h3 className="text-xl font-bold text-slate-100 mb-4">{level.title}</h3>
                      <ul className="space-y-2">
                        {level.items.map((item, i) => (
                          <li key={i} className="flex items-center gap-2 text-sm text-slate-400">
                            <span className={`w-1.5 h-1.5 rounded-full
                              ${level.color === 'amber' ? 'bg-amber-400' : ''}
                              ${level.color === 'emerald' ? 'bg-emerald-400' : ''}
                              ${level.color === 'violet' ? 'bg-violet-400' : ''}
                            `} />
                            {item}
                          </li>
                        ))}
                      </ul>
                    </div>
                  </motion.div>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* CTA */}
      <section className="py-24 px-8 border-t border-slate-800/50 bg-gradient-to-b from-slate-900/30 to-slate-950">
        <div className="max-w-3xl mx-auto text-center">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-slate-100 mb-6">
              Ready to close the loop?
            </h2>
            <p className="text-lg text-slate-400 mb-12">
              Stop learning without applying. Start developing real capacity.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => router.push('/dojo/capacities')}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold rounded-xl transition-all hover:scale-105 shadow-lg shadow-amber-500/20"
              >
                Explore the 6 Capacities
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
          <button onClick={() => router.push('/dojo')} className="hover:text-slate-300 transition-colors">
            ← Leadership Dojo
          </button>
          <div className="flex items-center gap-6">
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
