'use client';

import { ClarityLogo } from '@/components/ui/ClarityLogo';
import Link from 'next/link';
import { useState, useEffect } from 'react';
import {
  MessageSquare,
  BookOpen,
  Crown,
  Moon,
  Sun,
} from 'lucide-react';

export function LandingPage() {
  const [dark, setDark] = useState(false);

  useEffect(() => {
    // Respect system preference on first load
    if (window.matchMedia('(prefers-color-scheme: dark)').matches) {
      setDark(true);
    }
  }, []);

  const t = dark
    ? {
      bg: '#0f1117',
      card: '#1a1d27',
      cardBorder: 'rgba(255,255,255,0.08)',
      text: '#f1f5f9',
      textMuted: '#94a3b8',
      textFaint: '#64748b',
      accent: '#818cf8',
      accentBg: '#4f46e5',
      btnOutlineBg: 'rgba(255,255,255,0.06)',
      btnOutlineBorder: '#475569',
      btnOutlineText: '#e2e8f0',
      pricingRing: 'rgba(99,102,241,0.3)',
      pricingAmberBorder: 'rgba(245,158,11,0.2)',
    }
    : {
      bg: '#ffffff',
      card: '#f8fafc',
      cardBorder: '#e2e8f0',
      text: '#0f172a',
      textMuted: '#475569',
      textFaint: '#94a3b8',
      accent: '#4f46e5',
      accentBg: '#4f46e5',
      btnOutlineBg: '#ffffff',
      btnOutlineBorder: '#cbd5e1',
      btnOutlineText: '#334155',
      pricingRing: 'rgba(99,102,241,0.25)',
      pricingAmberBorder: 'rgba(217,119,6,0.25)',
    };

  return (
    <div style={{ backgroundColor: t.bg, color: t.text, minHeight: '100vh', transition: 'background-color 0.3s, color 0.3s' }}>
      <div className="container mx-auto px-4 py-16">
        {/* Header */}
        <div className="flex justify-between items-center mb-16">
          <ClarityLogo size="lg" />
          <div className="flex items-center gap-3">
            <Link href="/pricing">
              <button
                className="px-3 py-1.5 rounded-md text-sm font-medium transition-all hover:opacity-80"
                style={{ color: t.textMuted, background: 'transparent' }}
              >
                Pricing
              </button>
            </Link>
            <button
              className="px-3 py-1.5 rounded-md text-sm font-medium transition-all hover:opacity-80"
              style={{ color: t.btnOutlineText, background: t.btnOutlineBg, border: `1px solid ${t.btnOutlineBorder}` }}
              onClick={() => window.location.href = '/sign-in'}
            >
              Sign In
            </button>
            <button
              onClick={() => setDark(!dark)}
              className="p-2 rounded-md transition-all hover:opacity-80"
              style={{ color: t.textMuted, background: t.btnOutlineBg, border: `1px solid ${t.btnOutlineBorder}` }}
              aria-label="Toggle dark mode"
            >
              {dark ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
            </button>
          </div>
        </div>

        {/* Hero Section */}
        <div className="max-w-4xl mx-auto text-center mb-20">
          <h1 className="text-5xl md:text-6xl font-bold mb-6" style={{ color: t.text }}>
            Your AI-powered
            <span className="block mt-2" style={{ color: t.accent }}>leadership coach</span>
          </h1>
          <p className="text-xl mb-4 max-w-2xl mx-auto" style={{ color: t.textMuted }}>
            Practice real-world leadership scenarios, get coached by Mira — your AI Chief of Staff,
            and build the executive skills that matter.
          </p>
          <p className="text-sm mb-8" style={{ color: t.textFaint }}>
            Free to start · Plans from <span style={{ color: t.accent }}>$9/mo</span> or <span style={{ color: t.accent }}>₹499/mo</span>
          </p>
          <div className="flex items-center justify-center gap-4">
            <button
              className="px-8 py-3 rounded-lg text-lg font-semibold transition-all hover:opacity-90"
              style={{ color: '#ffffff', background: t.accentBg }}
              onClick={() => window.location.href = '/sign-up'}
            >
              Start Free →
            </button>
            <Link href="/pricing">
              <button
                className="px-8 py-3 rounded-lg text-lg font-semibold transition-all hover:opacity-90"
                style={{ color: t.btnOutlineText, background: t.btnOutlineBg, border: `1px solid ${t.btnOutlineBorder}` }}
              >
                View Pricing
              </button>
            </Link>
          </div>
        </div>

        {/* Features */}
        <div className="grid md:grid-cols-3 gap-8 max-w-5xl mx-auto mb-20">
          {[
            { icon: BookOpen, title: 'Real-World Cases', desc: 'Practice leadership decisions with Harvard-quality case studies tailored to power dynamics, stakeholder navigation, and executive presence.' },
            { icon: MessageSquare, title: 'Chat with Mira', desc: 'Your AI coaching partner who knows your world — get advice on tough conversations, meeting prep, and strategic decisions.' },
            { icon: Crown, title: 'Proactive Coaching', desc: 'Mira nudges you before big meetings, surfaces relevant cases, and tracks your growth over weeks and months.' },
          ].map((f, i) => {
            const Icon = f.icon;
            return (
              <div
                key={i}
                className="rounded-xl p-6 transition-all hover:scale-[1.02]"
                style={{ backgroundColor: t.card, border: `1px solid ${t.cardBorder}` }}
              >
                <div
                  className="w-12 h-12 rounded-lg flex items-center justify-center mb-4"
                  style={{ backgroundColor: dark ? 'rgba(99,102,241,0.1)' : 'rgba(79,70,229,0.08)' }}
                >
                  <Icon className="w-6 h-6" style={{ color: t.accent }} />
                </div>
                <h3 className="text-xl font-semibold mb-2" style={{ color: t.text }}>{f.title}</h3>
                <p style={{ color: t.textMuted }}>{f.desc}</p>
              </div>
            );
          })}
        </div>

        {/* Pricing Preview */}
        <div className="max-w-3xl mx-auto text-center">
          <h2 className="text-2xl font-bold mb-3" style={{ color: t.text }}>Simple, transparent pricing</h2>
          <p className="mb-8" style={{ color: t.textMuted }}>All features included. Choose who provides the AI.</p>
          <div className="grid md:grid-cols-2 gap-4 max-w-lg mx-auto">
            <div className="rounded-xl p-5" style={{ backgroundColor: t.card, border: `1px solid ${t.cardBorder}` }}>
              <div className="text-sm mb-1" style={{ color: t.textMuted }}>Starter</div>
              <div className="text-2xl font-bold" style={{ color: t.text }}>$9<span className="text-sm font-normal" style={{ color: t.textMuted }}>/mo</span></div>
              <div className="text-xs mt-1" style={{ color: t.textFaint }}>or ₹499/mo · BYOLLM</div>
            </div>
            <div className="rounded-xl p-5" style={{ backgroundColor: dark ? 'rgba(99,102,241,0.08)' : 'rgba(79,70,229,0.05)', border: `1px solid ${t.pricingRing}` }}>
              <div className="text-sm mb-1" style={{ color: t.accent }}>Pro</div>
              <div className="text-2xl font-bold" style={{ color: t.text }}>$29<span className="text-sm font-normal" style={{ color: t.textMuted }}>/mo</span></div>
              <div className="text-xs mt-1" style={{ color: t.textFaint }}>or ₹1,499/mo · LLM included</div>
            </div>
          </div>
          <Link href="/pricing" className="text-sm mt-4 inline-block hover:opacity-80" style={{ color: t.accent }}>
            See full pricing →
          </Link>
        </div>
      </div>
    </div>
  );
}
