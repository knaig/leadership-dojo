'use client';
import { SignUp } from '@clerk/nextjs';
import { BRAND } from '@/lib/brand';
import { MiraLogo } from '@/components/ui/MiraLogo';

export default function SignUpPage() {
    return (
        <div className="min-h-screen flex flex-col lg:flex-row">
            {/* Left: Branding */}
            <div className="flex-1 bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 flex items-center justify-center p-8 lg:p-16">
                <div className="max-w-md space-y-6">
                    <div className="flex items-center gap-3">
                        <MiraLogo size={40} />
                        <span className="text-xl font-semibold text-white">{BRAND.name}</span>
                    </div>
                    <h1 className="text-3xl lg:text-4xl font-bold text-white leading-tight">
                        Become a meeting<br />champion.
                    </h1>
                    <p className="text-slate-400 text-base leading-relaxed">
                        {BRAND.name} connects to your calendar, email, and docs — preps you
                        before meetings, tracks outcomes after, and helps you see patterns you'd otherwise miss.
                    </p>
                    <div className="space-y-3 pt-4">
                        <div className="flex items-start gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-emerald-400 mt-2 flex-shrink-0" />
                            <span className="text-slate-300 text-sm">Connect Google Calendar, Gmail, and Drive in one click</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-amber-400 mt-2 flex-shrink-0" />
                            <span className="text-slate-300 text-sm">Bring your own LLM key — Gemini, OpenAI, or Anthropic</span>
                        </div>
                        <div className="flex items-start gap-3">
                            <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 mt-2 flex-shrink-0" />
                            <span className="text-slate-300 text-sm">Your data stays yours — nothing shared, nothing sold</span>
                        </div>
                    </div>
                </div>
            </div>

            {/* Right: Sign Up */}
            <div className="flex items-center justify-center p-8 lg:p-16 bg-background">
                <SignUp
                    appearance={{
                        layout: {
                            logoImageUrl: '/logo.svg',
                            socialButtonsVariant: 'blockButton',
                        },
                        elements: {
                            rootBox: 'mx-auto',
                            card: 'shadow-none border border-border bg-card',
                            headerTitle: 'text-foreground',
                            headerSubtitle: 'text-muted-foreground',
                            socialButtonsBlockButton: 'border-border',
                            formFieldInput: 'bg-input border-border text-foreground',
                            footerActionLink: 'text-primary hover:text-primary/80',
                        }
                    }}
                />
            </div>
        </div>
    );
}
