'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { checkLockout, getReflectionDebt } from '@/lib/config/accountability';

interface LearningMode {
  id: string;
  title: string;
  subtitle: string;
  description: string;
  icon: string;
  stats: {
    [key: string]: string | number;
  };
  color: string;
  features: string[];
  route: string;
}

export default function ModeSelectorDashboard() {
  const router = useRouter();
  const [isLocked, setIsLocked] = useState(false);
  const [reflectionDebt, setReflectionDebt] = useState(0);

  useEffect(() => {
    const locked = checkLockout();
    setIsLocked(locked);
    const debt = getReflectionDebt();
    setReflectionDebt(debt.pendingReflections.length);
  }, []);

  const learningModes: LearningMode[] = [
    {
      id: 'specialized',
      title: 'Specialized Skills',
      subtitle: 'Case-Based Learning',
      description: 'Navigate complex scenarios to build stakeholder awareness, decision-making under uncertainty, and political sophistication',
      icon: '◊',
      stats: {
        availableCases: 5,
        currentFocus: 'Stakeholder Navigation',
        reflectionDebt: reflectionDebt
      },
      color: '#D4A574',
      features: [
        'Multi-stage scenarios with real stakes',
        'Cognitive pattern detection',
        'Framework acquisition through practice',
        'Applied to government advisory context'
      ],
      route: '/'
    },
    {
      id: 'general',
      title: 'General Learning',
      subtitle: 'Foundational Courses',
      description: 'Master the psychological foundations: System 1/2 thinking, meeting effectiveness, dopamine management, and behavioral economics',
      icon: '△',
      stats: {
        availableCourses: 6,
        currentCourse: 'Coming Soon',
        progress: '0%'
      },
      color: '#8B9D83',
      features: [
        'Structured lessons on cognitive science',
        'Interactive exercises and reflection',
        'Self-paced with clear progression',
        'Foundational knowledge for all contexts'
      ],
      route: '/learning'
    },
    {
      id: 'project',
      title: 'Project Application',
      subtitle: 'Live Coaching',
      description: 'AI coaching on your actual projects with Google Drive integration, stakeholder tracking, ecosystem monitoring, and weekly reflection cycles',
      icon: '⟡',
      stats: {
        activeProjects: 0,
        upcomingMeetings: 0,
        status: 'Coming Soon'
      },
      color: '#7B6B8E',
      features: [
        'Google Drive integration for meeting notes',
        'Stakeholder relationship tracking',
        'Weekly plan-apply-reflect cycles',
        'Real-time ecosystem awareness'
      ],
      route: '/projects'
    }
  ];

  const recommendations = [
    ...(reflectionDebt > 0 ? [{
      mode: 'specialized',
      title: `Complete ${reflectionDebt} pending reflection${reflectionDebt > 1 ? 's' : ''}`,
      reason: isLocked
        ? 'Practice mode locked until reflections completed'
        : 'Reflection debt accumulating - complete before practicing',
      urgency: isLocked ? 'urgent' as const : 'high' as const,
      action: () => router.push('/reflect')
    }] : []),
    {
      mode: 'specialized',
      title: 'Try Kenya Data Breach crisis scenario',
      reason: 'Build crisis management and stakeholder navigation skills',
      urgency: 'medium' as const,
      action: () => router.push('/cases/kenya_data_breach')
    }
  ];

  return (
    <div className="min-h-screen bg-[#1a1a1a] text-[#e8e3d8]">
      {/* Header */}
      <header className="border-b border-[#2a2a2a] px-8 py-6">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-3xl font-light mb-2">Leadership Lab</h1>
              <p className="text-sm text-[#8a8578] mono">Choose Your Learning Mode</p>
            </div>
            <div className="flex items-center gap-6">
              <button
                onClick={() => router.push('/progress')}
                className="text-sm text-[#8a8578] hover:text-[#D4A574] transition-colors"
              >
                Progress
              </button>
              <button className="text-sm text-[#8a8578] hover:text-[#D4A574] transition-colors">
                Settings
              </button>
              <div className="w-10 h-10 rounded-full bg-[#2a2a2a] flex items-center justify-center text-xs">
                DPI
              </div>
            </div>
          </div>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-8 py-12">
        {/* Accountability Warning */}
        {isLocked && (
          <div className="mb-8 bg-gradient-to-r from-[#B85C5C]/20 to-transparent rounded-lg border border-[#B85C5C] p-6 fade-in">
            <h3 className="text-lg font-light text-[#B85C5C] mb-2">🔒 Practice Mode Locked</h3>
            <p className="text-sm text-[#e8e3d8] mb-3">
              You've skipped {reflectionDebt} reflection{reflectionDebt > 1 ? 's' : ''}. Complete your reflections to unlock practice mode.
            </p>
            <button
              onClick={() => router.push('/reflect')}
              className="px-6 py-2 bg-[#B85C5C] text-white rounded-lg text-sm hover:bg-[#C86C6C] transition-colors"
            >
              Complete Reflections Now
            </button>
          </div>
        )}

        {reflectionDebt > 0 && !isLocked && (
          <div className="mb-8 bg-gradient-to-r from-[#D4A574]/20 to-transparent rounded-lg border border-[#D4A574] p-6 fade-in">
            <h3 className="text-lg font-light text-[#D4A574] mb-2">⚠️ Reflection Debt</h3>
            <p className="text-sm text-[#e8e3d8] mb-3">
              You have {reflectionDebt} pending reflection{reflectionDebt > 1 ? 's' : ''}. After 2 skipped reflections, practice mode locks.
            </p>
            <button
              onClick={() => router.push('/reflect')}
              className="px-6 py-2 bg-[#D4A574] text-[#1a1a1a] rounded-lg text-sm hover:bg-[#E6B885] transition-colors"
            >
              Reflect Now
            </button>
          </div>
        )}

        {/* AI Recommendations */}
        {recommendations.length > 0 && (
          <div className="mb-12 fade-in stagger-1">
            <h2 className="text-lg font-light text-[#a09588] mb-6">Recommended Next Steps</h2>
            <div className="space-y-4">
              {recommendations.map((rec, idx) => {
                const mode = learningModes.find(m => m.id === rec.mode);
                if (!mode) return null;

                return (
                  <div
                    key={idx}
                    className={`bg-[#222] rounded-lg border p-5 hover:border-[#3a3a3a] transition-colors cursor-pointer ${
                      rec.urgency === 'urgent'
                        ? 'border-[#B85C5C]'
                        : rec.urgency === 'high'
                        ? 'border-[#D4A574]'
                        : 'border-[#2a2a2a]'
                    }`}
                    onClick={rec.action}
                  >
                    <div className="flex items-start justify-between">
                      <div className="flex items-start gap-4">
                        <div
                          className="w-12 h-12 rounded-lg flex items-center justify-center text-xl flex-shrink-0"
                          style={{
                            background: `linear-gradient(135deg, ${mode.color}40, ${mode.color}20)`,
                            border: `1px solid ${mode.color}60`
                          }}
                        >
                          {mode.icon}
                        </div>
                        <div>
                          <div className="flex items-center gap-3 mb-2">
                            <div className="text-xs text-[#6a6558] mono">{mode.title}</div>
                            {rec.urgency === 'urgent' && (
                              <div className="text-xs text-[#B85C5C] bg-[#B85C5C]/10 px-2 py-0.5 rounded mono">
                                Urgent
                              </div>
                            )}
                            {rec.urgency === 'high' && (
                              <div className="text-xs text-[#D4A574] bg-[#D4A574]/10 px-2 py-0.5 rounded mono">
                                High Priority
                              </div>
                            )}
                          </div>
                          <div className="text-base font-light text-[#e8e3d8] mb-2">{rec.title}</div>
                          <div className="text-sm text-[#8a8578]">{rec.reason}</div>
                        </div>
                      </div>
                      <button className="text-sm text-[#D4A574] hover:underline">
                        {rec.urgency === 'urgent' ? 'Start Now' : 'View'} →
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        )}

        {/* Learning Modes - Hero Cards */}
        <div className="fade-in stagger-2">
          <h2 className="text-lg font-light text-[#a09588] mb-6">Your Learning Modes</h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
            {learningModes.map(mode => (
              <div
                key={mode.id}
                className="mode-card bg-[#222] rounded-lg border border-[#2a2a2a] overflow-hidden cursor-pointer transition-all duration-400 hover:-translate-y-1 hover:shadow-2xl"
                onClick={() => router.push(mode.route)}
              >
                {/* Header */}
                <div
                  className="px-6 py-8 border-b border-[#2a2a2a]"
                  style={{
                    background: `linear-gradient(135deg, ${mode.color}15, transparent)`
                  }}
                >
                  <div
                    className="w-16 h-16 rounded-xl flex items-center justify-center text-4xl mb-4"
                    style={{
                      background: `linear-gradient(135deg, ${mode.color}40, ${mode.color}20)`,
                      border: `2px solid ${mode.color}60`
                    }}
                  >
                    {mode.icon}
                  </div>
                  <h3 className="text-xl font-light mb-1">{mode.title}</h3>
                  <div className="text-sm text-[#8a8578]">{mode.subtitle}</div>
                </div>

                {/* Description */}
                <div className="p-6 border-b border-[#2a2a2a]">
                  <p className="text-sm leading-relaxed text-[#a09588] mb-4">
                    {mode.description}
                  </p>
                  <div className="space-y-2">
                    {mode.features.map((feature, idx) => (
                      <div key={idx} className="flex items-start gap-2 text-xs text-[#8a8578]">
                        <span className="text-[#6a6558]">•</span>
                        <span>{feature}</span>
                      </div>
                    ))}
                  </div>
                </div>

                {/* Stats */}
                <div className="p-6">
                  <div className="space-y-3 text-xs">
                    {Object.entries(mode.stats).map(([key, value]) => (
                      <div key={key} className="flex items-center justify-between">
                        <span className="text-[#8a8578] capitalize">
                          {key.replace(/([A-Z])/g, ' $1').toLowerCase()}
                        </span>
                        <span className="text-[#e8e3d8] mono">{value}</span>
                      </div>
                    ))}
                  </div>
                  <button
                    className="w-full mt-6 py-3 rounded-lg transition-colors text-sm font-light"
                    style={{
                      background: `linear-gradient(135deg, ${mode.color}30, ${mode.color}20)`,
                      border: `1px solid ${mode.color}40`,
                      color: mode.color
                    }}
                    onClick={(e) => {
                      e.stopPropagation();
                      router.push(mode.route);
                    }}
                  >
                    Enter {mode.title}
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* How Modes Interconnect */}
        <div className="mt-16 fade-in stagger-3">
          <div className="bg-gradient-to-br from-[#222] to-[#1a1a1a] rounded-lg border border-[#2a2a2a] p-8">
            <h2 className="text-xl font-light mb-6">How These Modes Work Together</h2>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-8">
              {/* General → Specialized */}
              <div className="relative">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center gap-2 bg-[#8B9D83]/20 px-4 py-2 rounded-lg border border-[#8B9D83]/30">
                    <span className="text-2xl">△</span>
                    <span className="text-sm">General Learning</span>
                  </div>
                </div>
                <div className="text-center mb-4">
                  <div className="text-xs text-[#8a8578]">↓</div>
                  <div className="text-xs text-[#6a6558] italic">provides foundation</div>
                </div>
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 bg-[#D4A574]/20 px-4 py-2 rounded-lg border border-[#D4A574]/30">
                    <span className="text-2xl">◊</span>
                    <span className="text-sm">Specialized Skills</span>
                  </div>
                </div>
                <p className="text-xs text-[#8a8578] mt-4 leading-relaxed text-center">
                  Master System 1/2 thinking, then apply it in complex stakeholder scenarios
                </p>
              </div>

              {/* Specialized → Project */}
              <div className="relative">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center gap-2 bg-[#D4A574]/20 px-4 py-2 rounded-lg border border-[#D4A574]/30">
                    <span className="text-2xl">◊</span>
                    <span className="text-sm">Specialized Skills</span>
                  </div>
                </div>
                <div className="text-center mb-4">
                  <div className="text-xs text-[#8a8578]">↓</div>
                  <div className="text-xs text-[#6a6558] italic">frameworks transfer to</div>
                </div>
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 bg-[#7B6B8E]/20 px-4 py-2 rounded-lg border border-[#7B6B8E]/30">
                    <span className="text-2xl">⟡</span>
                    <span className="text-sm">Project Application</span>
                  </div>
                </div>
                <p className="text-xs text-[#8a8578] mt-4 leading-relaxed text-center">
                  Learn stakeholder mapping in cases, apply to tomorrow's Finance meeting
                </p>
              </div>

              {/* Project → General (Feedback Loop) */}
              <div className="relative">
                <div className="text-center mb-4">
                  <div className="inline-flex items-center gap-2 bg-[#7B6B8E]/20 px-4 py-2 rounded-lg border border-[#7B6B8E]/30">
                    <span className="text-2xl">⟡</span>
                    <span className="text-sm">Project Application</span>
                  </div>
                </div>
                <div className="text-center mb-4">
                  <div className="text-xs text-[#8a8578]">↓</div>
                  <div className="text-xs text-[#6a6558] italic">reveals gaps, triggers</div>
                </div>
                <div className="text-center">
                  <div className="inline-flex items-center gap-2 bg-[#8B9D83]/20 px-4 py-2 rounded-lg border border-[#8B9D83]/30">
                    <span className="text-2xl">△</span>
                    <span className="text-sm">General Learning</span>
                  </div>
                </div>
                <p className="text-xs text-[#8a8578] mt-4 leading-relaxed text-center">
                  Action bias detected in real project → "Dopamine Management" course recommended
                </p>
              </div>
            </div>

            <div className="mt-8 pt-8 border-t border-[#2a2a2a] text-center">
              <p className="text-sm text-[#a09588] leading-relaxed">
                The AI monitors all three modes and creates a personalized curriculum.
                Gaps in real projects trigger courses. Completed courses unlock advanced cases.
                Everything feeds your continuous improvement loop.
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
