'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import {
  getReflectionDebt,
  saveReflection,
  assessReflectionQuality,
  type Reflection
} from '@/lib/config/accountability';

export default function ReflectPage() {
  const router = useRouter();
  const [step, setStep] = useState(1);
  const [debt, setDebt] = useState(0);
  const [pendingCases, setPendingCases] = useState<string[]>([]);

  // Form data
  const [hadMeetings, setHadMeetings] = useState<boolean | null>(null);
  const [noMeetingsReason, setNoMeetingsReason] = useState('');
  const [whatHappened, setWhatHappened] = useState('');
  const [whatYouDid, setWhatYouDid] = useState('');
  const [mode, setMode] = useState<'builder' | 'founder' | 'advisor' | 'mixed' | ''>('');
  const [missedStakeholders, setMissedStakeholders] = useState('');
  const [missedTiming, setMissedTiming] = useState('');
  const [missedLegitimacy, setMissedLegitimacy] = useState('');
  const [missedImpulses, setMissedImpulses] = useState('');
  const [oneDifferently, setOneDifferently] = useState('');

  // Quality feedback
  const [qualityIssues, setQualityIssues] = useState<string[]>([]);
  const [qualityScore, setQualityScore] = useState(0);

  useEffect(() => {
    const reflectionDebt = getReflectionDebt();
    setDebt(reflectionDebt.pendingReflections.length);
    setPendingCases(reflectionDebt.pendingReflections);
  }, []);

  const handleStep1 = (answer: boolean) => {
    setHadMeetings(answer);
    setStep(answer ? 2 : 1.5);
  };

  const handleNoMeetings = () => {
    if (noMeetingsReason.length < 10) {
      setQualityIssues(['Please provide at least 10 characters explaining why']);
      return;
    }

    // Save as valid reflection
    const reflection: Reflection = {
      id: Date.now().toString(),
      caseId: pendingCases[0] || 'no-case',
      date: new Date().toISOString(),
      hadRelevantMeetings: false,
      noMeetingsReason,
      qualityScore: 100
    };

    saveReflection(reflection);
    setStep(6); // Success
  };

  const handleSubmitReflection = () => {
    // Build reflection object
    const reflection: Partial<Reflection> = {
      hadRelevantMeetings: true,
      whatHappened,
      whatYouDid,
      modeDetected: mode as any,
      whatYouMissed: {
        stakeholders: missedStakeholders,
        politicalTiming: missedTiming,
        legitimacyConcerns: missedLegitimacy,
        yourImpulses: missedImpulses
      },
      oneDifferently
    };

    // Assess quality
    const assessment = assessReflectionQuality(reflection);
    setQualityScore(assessment.score);
    setQualityIssues(assessment.issues);

    if (!assessment.accepted) {
      setStep(5); // Show quality feedback
      return;
    }

    // Save reflection
    const fullReflection: Reflection = {
      id: Date.now().toString(),
      caseId: pendingCases[0] || 'completed-case',
      date: new Date().toISOString(),
      hadRelevantMeetings: true,
      whatHappened,
      whatYouDid,
      modeDetected: mode as any,
      whatYouMissed: {
        stakeholders: missedStakeholders,
        politicalTiming: missedTiming,
        legitimacyConcerns: missedLegitimacy,
        yourImpulses: missedImpulses
      },
      oneDifferently,
      qualityScore: assessment.score
    };

    saveReflection(fullReflection);
    setStep(6); // Success
  };

  const handleRetry = () => {
    setQualityIssues([]);
    setStep(2); // Back to questions
  };

  if (debt === 0) {
    return (
      <div className="min-h-screen bg-[#0A0E14] text-[#E6E8EB] flex items-center justify-center px-6">
        <div className="max-w-[680px] space-y-6">
          <h1 className="text-3xl font-serif">No Reflections Due</h1>
          <p className="text-[#9CA3AF] text-lg leading-relaxed">
            You're all caught up. Complete a practice case to schedule your next reflection.
          </p>
          <button
            onClick={() => router.push('/')}
            className="text-[#3B82F6] hover:text-[#60A5FA] transition-colors"
          >
            ← Back to home
          </button>
        </div>
      </div>
    );
  }

  // Step 1: Did you have meetings?
  if (step === 1) {
    return (
      <div className="min-h-screen bg-[#0A0E14] text-[#E6E8EB] flex items-center justify-center px-6">
        <div className="max-w-[680px] space-y-8">
          <div>
            <p className="text-[#9CA3AF] mb-2">Reflection {debt > 1 ? `(${debt} due)` : ''}</p>
            <h1 className="text-3xl font-serif mb-6">
              Did you have relevant meetings today?
            </h1>
            <p className="text-[#9CA3AF] leading-relaxed">
              Since your last practice case, did you have any:
            </p>
            <ul className="mt-4 space-y-2 text-[#9CA3AF]">
              <li>• Stakeholder meetings</li>
              <li>• Technical recommendations to give</li>
              <li>• Government/partner communications</li>
              <li>• Strategy discussions</li>
            </ul>
          </div>

          <div className="flex gap-4">
            <button
              onClick={() => handleStep1(true)}
              className="flex-1 bg-[#3B82F6] hover:bg-[#2563EB] text-white px-8 py-4 rounded-lg font-medium transition-colors"
            >
              Yes - Let's reflect
            </button>
            <button
              onClick={() => handleStep1(false)}
              className="flex-1 bg-[#1A1F29] hover:bg-[#252A34] border border-[#2A2F39] px-8 py-4 rounded-lg font-medium transition-colors"
            >
              No - Tell me why
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 1.5: No meetings - explain why
  if (step === 1.5) {
    return (
      <div className="min-h-screen bg-[#0A0E14] text-[#E6E8EB] flex items-center justify-center px-6">
        <div className="max-w-[680px] space-y-8">
          <h1 className="text-3xl font-serif">Why no relevant meetings?</h1>

          <div className="space-y-4">
            <textarea
              value={noMeetingsReason}
              onChange={(e) => setNoMeetingsReason(e.target.value)}
              placeholder="e.g., On vacation, Weekend, Deep work day (no meetings), Other..."
              className="w-full bg-[#1A1F29] border border-[#2A2F39] rounded-lg p-4 text-[#E6E8EB] min-h-[120px] focus:outline-none focus:border-[#3B82F6] transition-colors"
            />
            <p className="text-[#9CA3AF] text-sm">
              {noMeetingsReason.length}/10 characters minimum
            </p>
          </div>

          {qualityIssues.length > 0 && (
            <div className="bg-red-900/30 border border-red-500 rounded-lg p-4">
              <ul className="space-y-1 text-red-400 text-sm">
                {qualityIssues.map((issue, i) => (
                  <li key={i}>• {issue}</li>
                ))}
              </ul>
            </div>
          )}

          <div className="flex gap-4">
            <button
              onClick={() => setStep(1)}
              className="text-[#9CA3AF] hover:text-[#E6E8EB] transition-colors"
            >
              ← Back
            </button>
            <button
              onClick={handleNoMeetings}
              className="flex-1 bg-[#3B82F6] hover:bg-[#2563EB] text-white px-8 py-4 rounded-lg font-medium transition-colors"
            >
              Submit Reflection
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Steps 2-4: The 5 questions
  if (step >= 2 && step <= 4) {
    return (
      <div className="min-h-screen bg-[#0A0E14] text-[#E6E8EB] px-6 py-12">
        <div className="max-w-[680px] mx-auto space-y-8">
          <div>
            <p className="text-[#9CA3AF] mb-2">Reflection {debt > 1 ? `(${debt} due)` : ''}</p>
            <h1 className="text-3xl font-serif mb-2">Reflect on a Meeting</h1>
            <p className="text-[#9CA3AF]">Choose ONE meeting where you most needed advisor cognition</p>
          </div>

          {/* Question 1: What happened */}
          <div className="space-y-3">
            <label className="block text-lg font-medium">
              1. What happened? <span className="text-[#F59E0B]">*</span>
            </label>
            <p className="text-[#9CA3AF] text-sm">2-3 sentences. Be specific: Who was there? What was discussed?</p>
            <textarea
              value={whatHappened}
              onChange={(e) => setWhatHappened(e.target.value)}
              placeholder="The Minister's office called to discuss the digital ID rollout timeline. Present: Minister Kandiu, World Bank PM, and our tech lead. They want to announce before elections..."
              className="w-full bg-[#1A1F29] border border-[#2A2F39] rounded-lg p-4 text-[#E6E8EB] min-h-[120px] focus:outline-none focus:border-[#3B82F6] transition-colors"
            />
            <p className="text-[#9CA3AF] text-sm">{whatHappened.length}/50 characters minimum</p>
          </div>

          {/* Question 2: What you did */}
          <div className="space-y-3">
            <label className="block text-lg font-medium">
              2. What did you say or do? <span className="text-[#F59E0B]">*</span>
            </label>
            <p className="text-[#9CA3AF] text-sm">Exact words or specific actions. Don't summarize.</p>
            <textarea
              value={whatYouDid}
              onChange={(e) => setWhatYouDid(e.target.value)}
              placeholder="I said: 'We can build a prototype in 3 weeks to show the Minister.' I suggested starting with technical architecture before stakeholder mapping..."
              className="w-full bg-[#1A1F29] border border-[#2A2F39] rounded-lg p-4 text-[#E6E8EB] min-h-[100px] focus:outline-none focus:border-[#3B82F6] transition-colors"
            />
            <p className="text-[#9CA3AF] text-sm">{whatYouDid.length}/30 characters minimum</p>
          </div>

          {/* Question 3: Mode */}
          <div className="space-y-3">
            <label className="block text-lg font-medium">
              3. What mode were you in? <span className="text-[#F59E0B]">*</span>
            </label>
            <div className="space-y-2">
              {[
                { value: 'builder', label: 'Builder Mode', desc: 'Technical solutions, "we should just..."' },
                { value: 'founder', label: 'Founder Mode', desc: 'Taking ownership, heroic fixing' },
                { value: 'advisor', label: 'Advisor Mode', desc: 'Asking questions, facilitating' },
                { value: 'mixed', label: 'Not sure / Mixed', desc: '' }
              ].map((option) => (
                <label
                  key={option.value}
                  className={`block p-4 border rounded-lg cursor-pointer transition-all ${
                    mode === option.value
                      ? 'border-[#3B82F6] bg-[#3B82F6]/10'
                      : 'border-[#2A2F39] bg-[#1A1F29] hover:border-[#3B82F6]/50'
                  }`}
                >
                  <input
                    type="radio"
                    name="mode"
                    value={option.value}
                    checked={mode === option.value}
                    onChange={(e) => setMode(e.target.value as any)}
                    className="sr-only"
                  />
                  <div className="flex items-center justify-between">
                    <div>
                      <div className="font-medium">{option.label}</div>
                      {option.desc && <div className="text-sm text-[#9CA3AF] mt-1">{option.desc}</div>}
                    </div>
                    {mode === option.value && (
                      <svg className="w-5 h-5 text-[#3B82F6]" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                      </svg>
                    )}
                  </div>
                </label>
              ))}
            </div>
          </div>

          {/* Question 4: What you missed */}
          <div className="space-y-3">
            <label className="block text-lg font-medium">
              4. What did you miss in the moment?
            </label>
            <p className="text-[#9CA3AF] text-sm">Be honest about blind spots. At least one field required.</p>

            <div className="space-y-4">
              <div>
                <label className="block text-sm text-[#9CA3AF] mb-2">Stakeholders not considered:</label>
                <input
                  type="text"
                  value={missedStakeholders}
                  onChange={(e) => setMissedStakeholders(e.target.value)}
                  placeholder="e.g., Rural chiefs, opposition leaders..."
                  className="w-full bg-[#1A1F29] border border-[#2A2F39] rounded-lg p-3 text-[#E6E8EB] focus:outline-none focus:border-[#3B82F6] transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm text-[#9CA3AF] mb-2">Political timing factors:</label>
                <input
                  type="text"
                  value={missedTiming}
                  onChange={(e) => setMissedTiming(e.target.value)}
                  placeholder="e.g., Elections in 6 months, budget cycle..."
                  className="w-full bg-[#1A1F29] border border-[#2A2F39] rounded-lg p-3 text-[#E6E8EB] focus:outline-none focus:border-[#3B82F6] transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm text-[#9CA3AF] mb-2">Legitimacy concerns:</label>
                <input
                  type="text"
                  value={missedLegitimacy}
                  onChange={(e) => setMissedLegitimacy(e.target.value)}
                  placeholder="e.g., Local team not consulted, bypassed director..."
                  className="w-full bg-[#1A1F29] border border-[#2A2F39] rounded-lg p-3 text-[#E6E8EB] focus:outline-none focus:border-[#3B82F6] transition-colors"
                />
              </div>

              <div>
                <label className="block text-sm text-[#9CA3AF] mb-2">Your own impulses:</label>
                <input
                  type="text"
                  value={missedImpulses}
                  onChange={(e) => setMissedImpulses(e.target.value)}
                  placeholder="e.g., Urge to solve immediately, need to be right..."
                  className="w-full bg-[#1A1F29] border border-[#2A2F39] rounded-lg p-3 text-[#E6E8EB] focus:outline-none focus:border-[#3B82F6] transition-colors"
                />
              </div>
            </div>
          </div>

          {/* Question 5: One thing differently */}
          <div className="space-y-3">
            <label className="block text-lg font-medium">
              5. One thing you'd do differently: <span className="text-[#F59E0B]">*</span>
            </label>
            <p className="text-[#9CA3AF] text-sm">Specific behavior, not general intent.</p>
            <textarea
              value={oneDifferently}
              onChange={(e) => setOneDifferently(e.target.value)}
              placeholder="Ask who else needs to be consulted BEFORE proposing any technical solution. Specifically: 'Who else should be in this conversation?'"
              className="w-full bg-[#1A1F29] border border-[#2A2F39] rounded-lg p-4 text-[#E6E8EB] min-h-[100px] focus:outline-none focus:border-[#3B82F6] transition-colors"
            />
            <p className="text-[#9CA3AF] text-sm">{oneDifferently.length}/30 characters minimum</p>
          </div>

          {/* Navigation */}
          <div className="flex gap-4 pt-4">
            <button
              onClick={() => router.push('/')}
              className="text-[#9CA3AF] hover:text-[#E6E8EB] transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleSubmitReflection}
              className="flex-1 bg-[#3B82F6] hover:bg-[#2563EB] text-white px-8 py-4 rounded-lg font-medium transition-colors"
            >
              Submit Reflection
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 5: Quality feedback (rejected)
  if (step === 5) {
    return (
      <div className="min-h-screen bg-[#0A0E14] text-[#E6E8EB] flex items-center justify-center px-6">
        <div className="max-w-[680px] space-y-8">
          <div>
            <h1 className="text-3xl font-serif mb-4">Reflection Needs More Detail</h1>
            <p className="text-[#9CA3AF] leading-relaxed">
              Your reflection scored {qualityScore}/100. We need at least 60 for acceptance.
            </p>
          </div>

          <div className="bg-red-900/30 border border-red-500 rounded-lg p-6">
            <h3 className="font-semibold text-red-400 mb-3">Issues to fix:</h3>
            <ul className="space-y-2">
              {qualityIssues.map((issue, i) => (
                <li key={i} className="text-red-300">• {issue}</li>
              ))}
            </ul>
          </div>

          <div className="bg-blue-900/30 border border-blue-500 rounded-lg p-6">
            <h3 className="font-semibold text-blue-400 mb-3">Why quality matters:</h3>
            <p className="text-[#9CA3AF]">
              Generic reflections don't change behavior. Be specific about what YOU said,
              what YOU missed, and what YOU will do differently.
              This isn't about sounding good - it's about genuine self-awareness.
            </p>
          </div>

          <div className="flex gap-4">
            <button
              onClick={handleRetry}
              className="flex-1 bg-[#3B82F6] hover:bg-[#2563EB] text-white px-8 py-4 rounded-lg font-medium transition-colors"
            >
              Revise Reflection
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Step 6: Success
  if (step === 6) {
    const newDebt = debt - 1;

    return (
      <div className="min-h-screen bg-[#0A0E14] text-[#E6E8EB] flex items-center justify-center px-6">
        <div className="max-w-[680px] space-y-8">
          <div className="text-center">
            <div className="text-6xl mb-4">✓</div>
            <h1 className="text-3xl font-serif mb-4">Reflection Saved</h1>
            <p className="text-[#9CA3AF] text-lg">
              Quality score: {qualityScore}/100
            </p>
          </div>

          <div className="bg-green-900/30 border border-green-500 rounded-lg p-6 space-y-3">
            <div className="flex justify-between items-center">
              <span>Reflection debt:</span>
              <span className="font-semibold">{debt} → {newDebt}</span>
            </div>
            <div className="flex justify-between items-center">
              <span>Practice mode:</span>
              <span className="font-semibold text-green-400">
                {newDebt === 0 ? 'UNLOCKED ✓' : newDebt < 2 ? 'UNLOCKED' : 'LOCKED'}
              </span>
            </div>
          </div>

          {newDebt > 0 && (
            <div className="bg-amber-900/30 border border-amber-500 rounded-lg p-6">
              <p className="text-amber-300">
                You still have {newDebt} reflection{newDebt > 1 ? 's' : ''} pending.
                Complete {newDebt === 1 ? 'it' : 'them'} to avoid lockout.
              </p>
            </div>
          )}

          <div className="text-center pt-4">
            <button
              onClick={() => router.push('/')}
              className="text-[#3B82F6] hover:text-[#60A5FA] transition-colors text-lg"
            >
              Back to Home →
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
}
