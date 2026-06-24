'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useState } from 'react';

export default function DojoHowItWorksPage() {
  const router = useRouter();
  const [activeConnector, setActiveConnector] = useState('email');

  const connectors = [
    {
      id: 'email',
      name: 'Email',
      icon: '📧',
      description: 'Gmail & Outlook integration',
      whatWeAnalyze: [
        'Communication clarity and tone',
        'Stakeholder relationship patterns',
        'Response time and engagement',
        'Political sensitivity in messaging'
      ],
      exampleInsight: '"Your last 3 emails to the Finance team were defensive in tone. Consider the coalition-building approach from Module 4."'
    },
    {
      id: 'calendar',
      name: 'Calendar',
      icon: '📅',
      description: 'Meeting patterns & context',
      whatWeAnalyze: [
        'Stakeholder engagement distribution',
        'Meeting preparation patterns',
        'Follow-up and accountability',
        'Time allocation vs. priorities'
      ],
      exampleInsight: '"You have a meeting with the Minister tomorrow. Based on your notes from January, they\'re still sensitive about the procurement delay."'
    },
    {
      id: 'notes',
      name: 'Meeting Notes',
      icon: '📝',
      description: 'Audio & text from meetings',
      whatWeAnalyze: [
        'Your contribution quality',
        'Active listening indicators',
        'Decision influence patterns',
        'Stakeholder dynamics observed'
      ],
      exampleInsight: '"In Thursday\'s meeting, you spoke 40% of the time but asked zero questions. Consider the inquiry-before-advocacy pattern."'
    },
    {
      id: 'documents',
      name: 'Documents',
      icon: '📄',
      description: 'Drive, local files, PDFs',
      whatWeAnalyze: [
        'Writing quality and clarity',
        'Strategic thinking indicators',
        'Stakeholder awareness in framing',
        'Technical accuracy'
      ],
      exampleInsight: '"Your project proposal doesn\'t address the Finance Ministry\'s concerns from the last steering committee. Consider adding a risk mitigation section."'
    },
    {
      id: 'manual',
      name: 'Quick Notes',
      icon: '🎤',
      description: 'Voice & text on the go',
      whatWeAnalyze: [
        'Real-time situation capture',
        'Reflection quality',
        'Pattern self-awareness',
        'Growth edge identification'
      ],
      exampleInsight: '"You\'ve logged 3 situations this week where you \'should have pushed back but didn\'t.\' Let\'s practice assertive framing."'
    }
  ];

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
            <button onClick={() => router.push('/dojo/method')} className="text-slate-400 hover:text-slate-100 transition-colors">
              Method
            </button>
            <button onClick={() => router.push('/dojo/capacities')} className="text-slate-400 hover:text-slate-100 transition-colors">
              Capacities
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
              <span className="text-amber-400 text-sm font-medium">How It Works</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              <span className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
                Your work becomes
              </span>
              <br />
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                your training data.
              </span>
            </h1>

            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              The Dojo connects to your real work, observes patterns, surfaces blind spots,
              and prescribes targeted practice. Evidence-based, context-aware, continuously evolving.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Step 1: Connect Your Work */}
      <section className="py-16 px-8 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-amber-500/20 flex items-center justify-center text-xl font-bold text-amber-400">
                1
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-100">Connect Your Work</h2>
                <p className="text-slate-400">Choose what the Dojo can see</p>
              </div>
            </div>

            <div className="grid md:grid-cols-5 gap-4 mb-8">
              {connectors.map((connector) => (
                <button
                  key={connector.id}
                  onClick={() => setActiveConnector(connector.id)}
                  className={`p-4 rounded-xl border transition-all text-center
                    ${activeConnector === connector.id
                      ? 'bg-amber-500/20 border-amber-500/40'
                      : 'bg-slate-900/30 border-slate-800/50 hover:border-slate-700'
                    }
                  `}
                >
                  <div className="text-3xl mb-2">{connector.icon}</div>
                  <div className={`text-sm font-medium ${activeConnector === connector.id ? 'text-amber-400' : 'text-slate-400'}`}>
                    {connector.name}
                  </div>
                </button>
              ))}
            </div>

            {/* Selected connector details */}
            <motion.div
              key={activeConnector}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.3 }}
              className="bg-slate-900/50 border border-slate-800/50 rounded-2xl p-8"
            >
              {connectors.filter(c => c.id === activeConnector).map(connector => (
                <div key={connector.id} className="grid md:grid-cols-2 gap-8">
                  <div>
                    <div className="flex items-center gap-3 mb-4">
                      <span className="text-4xl">{connector.icon}</span>
                      <div>
                        <h3 className="text-xl font-bold text-slate-100">{connector.name}</h3>
                        <p className="text-sm text-slate-400">{connector.description}</p>
                      </div>
                    </div>

                    <h4 className="text-sm font-semibold text-slate-300 mb-3">What we analyze:</h4>
                    <ul className="space-y-2">
                      {connector.whatWeAnalyze.map((item, idx) => (
                        <li key={idx} className="flex items-center gap-2 text-sm text-slate-400">
                          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
                          {item}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="bg-amber-500/10 border border-amber-500/20 rounded-xl p-6">
                    <h4 className="text-sm font-semibold text-amber-400 mb-3">Example insight:</h4>
                    <p className="text-slate-300 italic">{connector.exampleInsight}</p>
                  </div>
                </div>
              ))}
            </motion.div>
          </motion.div>
        </div>
      </section>

      {/* Step 2: Define Your Job */}
      <section className="py-16 px-8 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-emerald-500/20 flex items-center justify-center text-xl font-bold text-emerald-400">
                2
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-100">Define Your Job</h2>
                <p className="text-slate-400">So feedback is relevant to what you actually do</p>
              </div>
            </div>

            <div className="grid md:grid-cols-2 gap-8">
              <div className="bg-slate-900/30 border border-slate-800/50 rounded-xl p-6">
                <h3 className="text-lg font-bold text-slate-100 mb-4">We understand:</h3>
                <ul className="space-y-4">
                  {[
                    { icon: '🎯', label: 'Your responsibilities', desc: 'What you\'re accountable for delivering' },
                    { icon: '👥', label: 'Your stakeholders', desc: 'Who you work with and their dynamics' },
                    { icon: '📊', label: 'Your success criteria', desc: 'How your performance is measured' },
                    { icon: '⚡', label: 'Your challenges', desc: 'What makes your job hard' },
                    { icon: '🚀', label: 'Your goals', desc: 'What you\'re trying to improve' },
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-start gap-3">
                      <span className="text-xl">{item.icon}</span>
                      <div>
                        <div className="font-medium text-slate-100">{item.label}</div>
                        <div className="text-sm text-slate-500">{item.desc}</div>
                      </div>
                    </li>
                  ))}
                </ul>
              </div>

              <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-6">
                <h3 className="text-lg font-bold text-emerald-400 mb-4">This enables:</h3>
                <ul className="space-y-3">
                  {[
                    'Feedback calibrated to your role\'s demands',
                    'Cases that match your actual situations',
                    'Stakeholder-specific coaching',
                    'Priority-weighted skill development',
                    'Context-aware pre-meeting briefs'
                  ].map((item, idx) => (
                    <li key={idx} className="flex items-center gap-2 text-slate-300">
                      <span className="text-emerald-400">→</span>
                      {item}
                    </li>
                  ))}
                </ul>

                <div className="mt-6 pt-6 border-t border-emerald-500/20">
                  <p className="text-sm text-emerald-300/80">
                    The system learns your context continuously. As you share more, insights get sharper.
                  </p>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Step 3: Receive Evidence-Based Feedback */}
      <section className="py-16 px-8 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-blue-500/20 flex items-center justify-center text-xl font-bold text-blue-400">
                3
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-100">Receive Evidence-Based Feedback</h2>
                <p className="text-slate-400">Every insight backed by specific examples from your work</p>
              </div>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  type: 'Real-Time Nudges',
                  icon: '⚡',
                  timing: 'Before important moments',
                  example: '"Before your meeting with the Deputy Minister, review the Power Mapping module. Based on your notes, they\'re aligned with the opposition on this issue."',
                  color: 'amber'
                },
                {
                  type: 'Weekly Digests',
                  icon: '📊',
                  timing: 'Every weekend',
                  example: '"This week: 3 wins in stakeholder navigation, 2 missed opportunities for coalition building. Your communication clarity improved 15% vs. last month."',
                  color: 'blue'
                },
                {
                  type: 'Triggered Interventions',
                  icon: '🚨',
                  timing: 'When patterns emerge',
                  example: '"You\'ve avoided 3 difficult conversations this month. This is a recurring pattern. Complete the Conflict Management case series before your next 1:1."',
                  color: 'rose'
                }
              ].map((item, idx) => (
                <motion.div
                  key={item.type}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: idx * 0.15 }}
                  viewport={{ once: true }}
                  className={`rounded-xl border p-6
                    ${item.color === 'amber' ? 'bg-amber-500/10 border-amber-500/20' : ''}
                    ${item.color === 'blue' ? 'bg-blue-500/10 border-blue-500/20' : ''}
                    ${item.color === 'rose' ? 'bg-rose-500/10 border-rose-500/20' : ''}
                  `}
                >
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-2xl">{item.icon}</span>
                    <div>
                      <h3 className={`font-bold
                        ${item.color === 'amber' ? 'text-amber-400' : ''}
                        ${item.color === 'blue' ? 'text-blue-400' : ''}
                        ${item.color === 'rose' ? 'text-rose-400' : ''}
                      `}>{item.type}</h3>
                      <p className="text-xs text-slate-500">{item.timing}</p>
                    </div>
                  </div>
                  <p className="text-sm text-slate-300 italic">"{item.example}"</p>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* Step 4: Practice Deliberately */}
      <section className="py-16 px-8 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <div className="flex items-center gap-4 mb-8">
              <div className="w-12 h-12 rounded-xl bg-violet-500/20 flex items-center justify-center text-xl font-bold text-violet-400">
                4
              </div>
              <div>
                <h2 className="text-2xl font-bold text-slate-100">Practice Deliberately</h2>
                <p className="text-slate-400">Cases selected specifically for your gaps</p>
              </div>
            </div>

            <div className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-8">
              <div className="grid md:grid-cols-2 gap-8">
                <div>
                  <h3 className="text-lg font-bold text-slate-100 mb-6">How cases are matched:</h3>

                  <div className="space-y-4">
                    {[
                      { step: 'Observe', desc: 'Gap detected in stakeholder navigation from email analysis' },
                      { step: 'Match', desc: 'Find case with similar stakeholder dynamics' },
                      { step: 'Contextualize', desc: 'Adjust case to use your domain and stakeholders' },
                      { step: 'Practice', desc: 'Work through case with AI coaching' },
                      { step: 'Apply', desc: 'Use learnings in next real situation' },
                      { step: 'Track', desc: 'Monitor if gap closes in subsequent work' }
                    ].map((item, idx) => (
                      <div key={idx} className="flex items-start gap-4">
                        <div className="w-8 h-8 rounded-lg bg-violet-500/20 flex items-center justify-center text-xs font-bold text-violet-400 flex-shrink-0">
                          {idx + 1}
                        </div>
                        <div>
                          <div className="font-medium text-slate-100">{item.step}</div>
                          <div className="text-sm text-slate-500">{item.desc}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="bg-violet-500/10 border border-violet-500/20 rounded-xl p-6">
                  <h3 className="text-lg font-bold text-violet-400 mb-4">Example learning path:</h3>

                  <div className="space-y-4">
                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="text-xs text-violet-400 mb-1">DETECTED GAP</div>
                      <p className="text-sm text-slate-300">Defensive tone in stakeholder communications</p>
                    </div>

                    <div className="text-center text-slate-500">↓</div>

                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="text-xs text-emerald-400 mb-1">PRESCRIBED PRACTICE</div>
                      <p className="text-sm text-slate-300">Case: "Kenya Data Breach Response" - focuses on maintaining relationships under pressure</p>
                    </div>

                    <div className="text-center text-slate-500">↓</div>

                    <div className="bg-slate-800/50 rounded-lg p-4">
                      <div className="text-xs text-amber-400 mb-1">REAL APPLICATION</div>
                      <p className="text-sm text-slate-300">Pre-meeting brief before your next difficult stakeholder conversation</p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* Privacy & Control */}
      <section className="py-16 px-8 border-t border-slate-800/50 bg-gradient-to-b from-slate-950 to-slate-900/30">
        <div className="max-w-5xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <div className="text-center mb-12">
              <h2 className="text-3xl font-bold text-slate-100 mb-4">You're Always in Control</h2>
              <p className="text-lg text-slate-400">Privacy-first design. You decide what to share.</p>
            </div>

            <div className="grid md:grid-cols-3 gap-6">
              {[
                {
                  icon: '🔒',
                  title: 'Your Data, Your Rules',
                  points: [
                    'Choose exactly what to connect',
                    'Pause or disconnect anytime',
                    'Export or delete all data',
                    'Local processing option'
                  ]
                },
                {
                  icon: '👁️',
                  title: 'Full Transparency',
                  points: [
                    'See exactly what was analyzed',
                    'Understand why conclusions were drawn',
                    'Dispute or correct any observation',
                    'Confidence levels shown'
                  ]
                },
                {
                  icon: '🤝',
                  title: 'You Have Context We Don\'t',
                  points: [
                    'Add context to any observation',
                    'Insights presented as hypotheses',
                    'Your corrections improve the system',
                    'We acknowledge what we don\'t know'
                  ]
                }
              ].map((item, idx) => (
                <motion.div
                  key={item.title}
                  initial={{ opacity: 0, y: 20 }}
                  whileInView={{ opacity: 1, y: 0 }}
                  transition={{ duration: 0.5, delay: idx * 0.1 }}
                  viewport={{ once: true }}
                  className="bg-slate-900/50 border border-slate-800/50 rounded-xl p-6"
                >
                  <div className="text-3xl mb-4">{item.icon}</div>
                  <h3 className="text-lg font-bold text-slate-100 mb-4">{item.title}</h3>
                  <ul className="space-y-2">
                    {item.points.map((point, i) => (
                      <li key={i} className="flex items-center gap-2 text-sm text-slate-400">
                        <span className="w-1.5 h-1.5 rounded-full bg-emerald-400" />
                        {point}
                      </li>
                    ))}
                  </ul>
                </motion.div>
              ))}
            </div>
          </motion.div>
        </div>
      </section>

      {/* What Makes This Different */}
      <section className="py-16 px-8 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-slate-100 mb-12 text-center">
              What Makes This Different
            </h2>

            <div className="space-y-6">
              {[
                {
                  title: 'Not a productivity tool',
                  description: 'We don\'t help you do more. We help you become better at what matters. The goal is behavior change, not efficiency.'
                },
                {
                  title: 'Evidence over intuition',
                  description: 'Every insight is backed by specific examples from your actual work. No vague feedback—concrete evidence of what you did and what it means.'
                },
                {
                  title: 'Your context, specifically',
                  description: 'The system learns your organization, stakeholders, and domain. It becomes a coach who knows your world, not a generic advisor.'
                },
                {
                  title: 'Uncomfortable by design',
                  description: 'The Dojo surfaces what you\'d rather not see. Growth happens at the edge of comfort. Sometimes the system will be annoying—that\'s the point.'
                },
                {
                  title: 'Practice connected to reality',
                  description: 'Cases aren\'t abstract exercises. They\'re selected based on gaps in your real work. What you practice directly addresses what you\'re struggling with.'
                }
              ].map((item, idx) => (
                <div key={idx} className="flex items-start gap-6 p-6 bg-slate-900/30 border border-slate-800/50 rounded-xl">
                  <div className="text-2xl text-amber-400">→</div>
                  <div>
                    <h3 className="text-lg font-bold text-slate-100 mb-2">{item.title}</h3>
                    <p className="text-slate-400">{item.description}</p>
                  </div>
                </div>
              ))}
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
              Ready to turn your work into training?
            </h2>
            <p className="text-lg text-slate-400 mb-12">
              Start developing the capacities that make generalists extraordinary.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => router.push('/')}
                className="w-full sm:w-auto px-8 py-4 bg-gradient-to-r from-amber-500 to-orange-600 hover:from-amber-400 hover:to-orange-500 text-slate-950 font-bold rounded-xl transition-all hover:scale-105 shadow-lg shadow-amber-500/20"
              >
                Start Training Now
              </button>
              <button
                onClick={() => router.push('/dojo')}
                className="w-full sm:w-auto px-8 py-4 bg-slate-800 hover:bg-slate-700 text-slate-100 font-semibold rounded-xl border border-slate-700 transition-all"
              >
                Back to Overview
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
            <button onClick={() => router.push('/dojo/method')} className="hover:text-slate-300 transition-colors">
              Method
            </button>
            <button onClick={() => router.push('/dojo/capacities')} className="hover:text-slate-300 transition-colors">
              Capacities
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
}
