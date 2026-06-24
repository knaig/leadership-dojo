'use client';

import { useRouter } from 'next/navigation';
import { motion } from 'framer-motion';
import { useState } from 'react';

const capacities = [
  {
    id: 'situational-awareness',
    icon: '👁️',
    title: 'Situational Awareness',
    tagline: 'Reading what\'s not said',
    color: 'amber',
    description: 'The ability to perceive, comprehend, and anticipate what\'s happening in complex environments. Seeing the subtext, sensing the dynamics, understanding context before acting.',
    whyAIProof: 'AI can\'t be in the room. It can\'t read body language, sense tension, or feel the energy shift when someone walks in. This is fundamentally human.',
    whatItLooksLike: [
      'Walking into a meeting and instantly sensing something is off',
      'Noticing who exchanges glances when a topic comes up',
      'Reading between the lines of a carefully worded email',
      'Anticipating objections before they\'re voiced',
      'Understanding the real agenda behind the stated agenda'
    ],
    howWeDevelop: [
      'Cases that train pattern recognition in stakeholder dynamics',
      'Analysis of your meeting notes to surface missed signals',
      'Real-time prep briefs before important meetings',
      'Post-meeting debriefs comparing what you noticed vs. what happened'
    ],
    courses: ['Reading Political Subtext', 'Power Mapping & Analysis', 'Cross-Cultural Navigation']
  },
  {
    id: 'outcome-orientation',
    icon: '🎯',
    title: 'Outcome Orientation',
    tagline: 'Focus on what matters',
    color: 'orange',
    description: 'Ruthless clarity about what you\'re actually trying to achieve, cutting through noise, activity traps, and comfortable busy-work to drive real results.',
    whyAIProof: 'AI optimizes for metrics you give it. You need to know which metrics matter. AI can\'t tell you what "success" means in your specific context with your specific constraints.',
    whatItLooksLike: [
      'Asking "what are we actually trying to achieve?" in meetings',
      'Saying no to activities that feel productive but aren\'t',
      'Measuring progress by outcomes, not outputs',
      'Killing projects that aren\'t working before they consume everything',
      'Knowing when "done" is good enough vs. when excellence is required'
    ],
    howWeDevelop: [
      'Cases that trap you in activity bias—then show you the escape',
      'Analysis of your calendar: time spent vs. outcomes achieved',
      'Weekly outcome audits: what actually moved this week?',
      'Pattern detection when you\'re in "busy" mode vs. "effective" mode'
    ],
    courses: ['Action Bias & Strategic Patience', 'Decision-Making Under Uncertainty', 'Goal Alignment in Multi-Stakeholder Systems']
  },
  {
    id: 'relationship-capital',
    icon: '🤝',
    title: 'Relationship Capital',
    tagline: 'Trust built over time',
    color: 'emerald',
    description: 'The network of trust, goodwill, and mutual obligation you build through genuine human connection. The ultimate moat against AI—relationships require skin in the game.',
    whyAIProof: 'Trust requires vulnerability, reciprocity, and time. AI can\'t owe favors. It can\'t have shared history. It can\'t put itself at risk for you. This is irreducibly human.',
    whatItLooksLike: [
      'People take your calls because of who you are, not your title',
      'You hear about problems before they\'re crises—because people tell you',
      'Coalitions form around you naturally',
      'Past investments pay dividends years later',
      'You can ask for hard things because you\'ve given hard things'
    ],
    howWeDevelop: [
      'Stakeholder relationship mapping from your communications',
      'Network topology analysis: who connects to whom through you',
      'Dormant relationship alerts: who haven\'t you invested in lately?',
      'Quality tracking: are you making deposits or withdrawals?',
      'Cases on coalition building and strategic networking'
    ],
    courses: ['Relationship Capital & Network Building', 'Managing Up & Sideways', 'Coalition Building & Ecosystem Development']
  },
  {
    id: 'domain-mastery',
    icon: '🧠',
    title: 'Domain Mastery',
    tagline: 'Your context, deeply',
    color: 'blue',
    description: 'Deep expertise in your specific environment—the unwritten rules, historical context, key players, and domain-specific knowledge that makes you effective where you are.',
    whyAIProof: 'AI has general knowledge. You have this organization\'s quirks, this stakeholder\'s history, this project\'s landmines. Context is king, and context is local.',
    whatItLooksLike: [
      'Knowing why a proposal will fail before writing it',
      'Understanding which precedents matter and which don\'t',
      'Speaking the specific language that lands with your stakeholders',
      'Anticipating obstacles others don\'t see coming',
      'Leveraging institutional knowledge that isn\'t written down'
    ],
    howWeDevelop: [
      'System learns your domain from documents you share',
      'Stakeholder profiles built from your interactions',
      'Historical context captured from your notes',
      'You teach the system—it remembers and applies',
      'Contextual cases that use your actual stakeholders'
    ],
    courses: ['DPI Ecosystem Overview', 'Working with Donors', 'Navigating the Vendor Ecosystem']
  },
  {
    id: 'decision-quality',
    icon: '⚖️',
    title: 'Decision Quality',
    tagline: 'Judgment under uncertainty',
    color: 'violet',
    description: 'The ability to make good calls with incomplete information, under time pressure, with high stakes. Not being right every time—being right enough, fast enough.',
    whyAIProof: 'AI needs data. You need to act now. AI can give you options, but you have to make the call, own the consequences, and live with the uncertainty.',
    whatItLooksLike: [
      'Making the call when everyone else is waiting for more information',
      'Knowing which decisions are reversible and which aren\'t',
      'Balancing speed and accuracy appropriately',
      'Learning from bad decisions without becoming paralyzed',
      'Building confidence in others to trust your judgment'
    ],
    howWeDevelop: [
      'Cases with decision points under realistic constraints',
      'Analysis of your past decisions: patterns, biases, outcomes',
      'Real-time decision frameworks for common situations',
      'Post-mortems on significant decisions (good and bad)',
      'Calibration training: are you overconfident or underconfident?'
    ],
    courses: ['Decision-Making Under Uncertainty', 'System 1 vs System 2 Thinking', 'Cognitive Biases in Government']
  },
  {
    id: 'execution-velocity',
    icon: '🚀',
    title: 'Execution Velocity',
    tagline: 'Fast on the right things',
    color: 'rose',
    description: 'The ability to move quickly—but on the things that matter. Not just doing things fast, but knowing which things deserve speed and executing with minimal friction.',
    whyAIProof: 'AI can suggest, draft, analyze. But shipping requires navigation of human systems, organizational dynamics, and real-world friction that only you can handle.',
    whatItLooksLike: [
      'Projects that should take months taking weeks',
      'Unblocking yourself and others without waiting',
      'Parallel-tracking instead of sequential dependencies',
      'Knowing when to ask permission vs. when to ask forgiveness',
      'Shipping before it\'s perfect when that\'s the right call'
    ],
    howWeDevelop: [
      'Analysis of your project timelines: where does time go?',
      'Blocker pattern detection: what keeps slowing you down?',
      'Cases on navigating organizational friction',
      'Real-time nudges when you\'re stuck in planning mode',
      'Execution audits: did speed help or hurt?'
    ],
    courses: ['Project Coordination', 'Influence Without Authority', 'Change Management']
  }
];

export default function DojoCapacitiesPage() {
  const router = useRouter();
  const [selectedCapacity, setSelectedCapacity] = useState(capacities[0]);

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
              <span className="text-amber-400 text-sm font-medium">The 6 Capacities</span>
            </div>

            <h1 className="text-4xl md:text-5xl font-bold mb-6">
              <span className="bg-gradient-to-r from-slate-100 via-slate-200 to-slate-400 bg-clip-text text-transparent">
                We don't teach skills.
              </span>
              <br />
              <span className="bg-gradient-to-r from-amber-400 via-orange-400 to-amber-500 bg-clip-text text-transparent">
                We develop capacities.
              </span>
            </h1>

            <p className="text-xl text-slate-400 max-w-2xl mx-auto">
              Skills can be automated. Capacities—the ability to read situations,
              build trust, exercise judgment—these are uniquely human.
            </p>
          </motion.div>
        </div>
      </section>

      {/* Capacity Grid Overview */}
      <section className="py-12 px-8 border-t border-slate-800/50">
        <div className="max-w-5xl mx-auto">
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-4">
            {capacities.map((cap, idx) => (
              <motion.button
                key={cap.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.4, delay: idx * 0.1 }}
                onClick={() => setSelectedCapacity(cap)}
                className={`p-4 rounded-xl border transition-all text-center
                  ${selectedCapacity.id === cap.id
                    ? `bg-${cap.color}-500/20 border-${cap.color}-500/40 ${cap.color === 'amber' ? 'bg-amber-500/20 border-amber-500/40' : ''} ${cap.color === 'orange' ? 'bg-orange-500/20 border-orange-500/40' : ''} ${cap.color === 'emerald' ? 'bg-emerald-500/20 border-emerald-500/40' : ''} ${cap.color === 'blue' ? 'bg-blue-500/20 border-blue-500/40' : ''} ${cap.color === 'violet' ? 'bg-violet-500/20 border-violet-500/40' : ''} ${cap.color === 'rose' ? 'bg-rose-500/20 border-rose-500/40' : ''}`
                    : 'bg-slate-900/30 border-slate-800/50 hover:border-slate-700'
                  }
                `}
              >
                <div className="text-3xl mb-2">{cap.icon}</div>
                <div className={`text-xs font-medium
                  ${selectedCapacity.id === cap.id ? 'text-slate-100' : 'text-slate-400'}
                `}>
                  {cap.title}
                </div>
              </motion.button>
            ))}
          </div>
        </div>
      </section>

      {/* Selected Capacity Deep Dive */}
      <section className="py-16 px-8">
        <div className="max-w-5xl mx-auto">
          <motion.div
            key={selectedCapacity.id}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4 }}
            className={`rounded-2xl border p-8 md:p-12
              ${selectedCapacity.color === 'amber' ? 'bg-amber-500/5 border-amber-500/20' : ''}
              ${selectedCapacity.color === 'orange' ? 'bg-orange-500/5 border-orange-500/20' : ''}
              ${selectedCapacity.color === 'emerald' ? 'bg-emerald-500/5 border-emerald-500/20' : ''}
              ${selectedCapacity.color === 'blue' ? 'bg-blue-500/5 border-blue-500/20' : ''}
              ${selectedCapacity.color === 'violet' ? 'bg-violet-500/5 border-violet-500/20' : ''}
              ${selectedCapacity.color === 'rose' ? 'bg-rose-500/5 border-rose-500/20' : ''}
            `}
          >
            {/* Header */}
            <div className="flex items-start gap-6 mb-8">
              <div className="text-6xl">{selectedCapacity.icon}</div>
              <div>
                <h2 className="text-3xl font-bold text-slate-100 mb-2">{selectedCapacity.title}</h2>
                <p className={`text-lg
                  ${selectedCapacity.color === 'amber' ? 'text-amber-400' : ''}
                  ${selectedCapacity.color === 'orange' ? 'text-orange-400' : ''}
                  ${selectedCapacity.color === 'emerald' ? 'text-emerald-400' : ''}
                  ${selectedCapacity.color === 'blue' ? 'text-blue-400' : ''}
                  ${selectedCapacity.color === 'violet' ? 'text-violet-400' : ''}
                  ${selectedCapacity.color === 'rose' ? 'text-rose-400' : ''}
                `}>
                  {selectedCapacity.tagline}
                </p>
              </div>
            </div>

            {/* Description */}
            <p className="text-lg text-slate-300 mb-12 max-w-3xl">
              {selectedCapacity.description}
            </p>

            {/* Grid sections */}
            <div className="grid md:grid-cols-2 gap-8 mb-12">
              {/* Why AI-Proof */}
              <div className="bg-slate-900/50 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">🛡️</span>
                  <h3 className="text-lg font-bold text-slate-100">Why AI Can't Replace This</h3>
                </div>
                <p className="text-slate-400">{selectedCapacity.whyAIProof}</p>
              </div>

              {/* What it looks like */}
              <div className="bg-slate-900/50 rounded-xl p-6">
                <div className="flex items-center gap-2 mb-4">
                  <span className="text-xl">✨</span>
                  <h3 className="text-lg font-bold text-slate-100">What It Looks Like</h3>
                </div>
                <ul className="space-y-2">
                  {selectedCapacity.whatItLooksLike.map((item, idx) => (
                    <li key={idx} className="flex items-start gap-2 text-sm text-slate-400">
                      <span className={`mt-1.5 w-1.5 h-1.5 rounded-full flex-shrink-0
                        ${selectedCapacity.color === 'amber' ? 'bg-amber-400' : ''}
                        ${selectedCapacity.color === 'orange' ? 'bg-orange-400' : ''}
                        ${selectedCapacity.color === 'emerald' ? 'bg-emerald-400' : ''}
                        ${selectedCapacity.color === 'blue' ? 'bg-blue-400' : ''}
                        ${selectedCapacity.color === 'violet' ? 'bg-violet-400' : ''}
                        ${selectedCapacity.color === 'rose' ? 'bg-rose-400' : ''}
                      `} />
                      {item}
                    </li>
                  ))}
                </ul>
              </div>
            </div>

            {/* How we develop */}
            <div className="mb-12">
              <div className="flex items-center gap-2 mb-6">
                <span className="text-xl">🥋</span>
                <h3 className="text-lg font-bold text-slate-100">How the Dojo Develops This</h3>
              </div>
              <div className="grid md:grid-cols-2 gap-4">
                {selectedCapacity.howWeDevelop.map((item, idx) => (
                  <div
                    key={idx}
                    className={`flex items-center gap-3 p-4 rounded-lg border
                      ${selectedCapacity.color === 'amber' ? 'bg-amber-500/10 border-amber-500/20' : ''}
                      ${selectedCapacity.color === 'orange' ? 'bg-orange-500/10 border-orange-500/20' : ''}
                      ${selectedCapacity.color === 'emerald' ? 'bg-emerald-500/10 border-emerald-500/20' : ''}
                      ${selectedCapacity.color === 'blue' ? 'bg-blue-500/10 border-blue-500/20' : ''}
                      ${selectedCapacity.color === 'violet' ? 'bg-violet-500/10 border-violet-500/20' : ''}
                      ${selectedCapacity.color === 'rose' ? 'bg-rose-500/10 border-rose-500/20' : ''}
                    `}
                  >
                    <span className={`text-lg
                      ${selectedCapacity.color === 'amber' ? 'text-amber-400' : ''}
                      ${selectedCapacity.color === 'orange' ? 'text-orange-400' : ''}
                      ${selectedCapacity.color === 'emerald' ? 'text-emerald-400' : ''}
                      ${selectedCapacity.color === 'blue' ? 'text-blue-400' : ''}
                      ${selectedCapacity.color === 'violet' ? 'text-violet-400' : ''}
                      ${selectedCapacity.color === 'rose' ? 'text-rose-400' : ''}
                    `}>→</span>
                    <span className="text-sm text-slate-300">{item}</span>
                  </div>
                ))}
              </div>
            </div>

            {/* Related courses */}
            <div>
              <div className="flex items-center gap-2 mb-4">
                <span className="text-xl">📚</span>
                <h3 className="text-lg font-bold text-slate-100">Related Courses</h3>
              </div>
              <div className="flex flex-wrap gap-2">
                {selectedCapacity.courses.map((course, idx) => (
                  <span
                    key={idx}
                    className="px-4 py-2 bg-slate-800/50 rounded-lg text-sm text-slate-300"
                  >
                    {course}
                  </span>
                ))}
              </div>
            </div>
          </motion.div>
        </div>
      </section>

      {/* How They Work Together */}
      <section className="py-24 px-8 border-t border-slate-800/50">
        <div className="max-w-4xl mx-auto">
          <motion.div
            initial={{ opacity: 0, y: 40 }}
            whileInView={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.8 }}
            viewport={{ once: true }}
          >
            <h2 className="text-3xl font-bold text-slate-100 mb-6 text-center">
              How They Work Together
            </h2>
            <p className="text-lg text-slate-400 text-center mb-12 max-w-2xl mx-auto">
              The 6 capacities aren't independent—they reinforce each other in practice.
            </p>

            <div className="bg-slate-900/30 border border-slate-800/50 rounded-2xl p-8">
              <div className="space-y-6">
                {[
                  {
                    scenario: 'Before a high-stakes meeting',
                    flow: '👁️ Situational Awareness (sense the dynamics) → 🧠 Domain Mastery (know the context) → 🤝 Relationship Capital (leverage trust)'
                  },
                  {
                    scenario: 'Facing a complex decision',
                    flow: '🎯 Outcome Orientation (clarify what matters) → ⚖️ Decision Quality (make the call) → 🚀 Execution Velocity (move fast on it)'
                  },
                  {
                    scenario: 'Navigating organizational politics',
                    flow: '👁️ Situational Awareness (read the room) → 🤝 Relationship Capital (know who to align with) → 🧠 Domain Mastery (understand the history)'
                  },
                  {
                    scenario: 'Launching a new initiative',
                    flow: '🎯 Outcome Orientation (define success) → 🤝 Relationship Capital (build coalition) → 🚀 Execution Velocity (ship fast)'
                  }
                ].map((item, idx) => (
                  <div key={idx} className="p-4 bg-slate-800/30 rounded-xl">
                    <div className="text-amber-400 text-sm font-medium mb-2">{item.scenario}</div>
                    <div className="text-slate-300">{item.flow}</div>
                  </div>
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
              Ready to develop your capacities?
            </h2>
            <p className="text-lg text-slate-400 mb-12">
              See how the Dojo observes, reflects, and prescribes practice for each capacity.
            </p>

            <div className="flex flex-col sm:flex-row items-center justify-center gap-4">
              <button
                onClick={() => router.push('/dojo/how-it-works')}
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
          <button onClick={() => router.push('/dojo')} className="hover:text-slate-300 transition-colors">
            ← Leadership Dojo
          </button>
          <div className="flex items-center gap-6">
            <button onClick={() => router.push('/dojo/method')} className="hover:text-slate-300 transition-colors">
              Method
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
