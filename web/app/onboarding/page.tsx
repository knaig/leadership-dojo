'use client';

import { useState, useEffect, useCallback, useRef, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
    ArrowRight, ArrowLeft, Loader2, Check, Phone, MessageSquare,
    ChevronDown, ChevronUp, Wifi,
} from 'lucide-react';
import { useUser, useAuth } from '@clerk/nextjs';
import Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';
import { BRAND } from '@/lib/brand';
import { MiraLogo } from '@/components/ui/MiraLogo';

type Step = 1 | 2 | 3;

const STEP_LABELS: Record<Step, string> = {
    1: 'About you',
    2: 'Connect your work',
    3: 'WhatsApp',
};

// Detect provider from email domain
function detectProvider(email: string | undefined | null): 'google' | 'microsoft' | null {
    if (!email) return null;
    const domain = email.split('@')[1]?.toLowerCase() || '';
    if (domain.includes('gmail') || domain.includes('google')) return 'google';
    if (domain.includes('outlook') || domain.includes('hotmail') || domain.includes('live') || domain.includes('microsoft')) return 'microsoft';
    return null;
}

export default function OnboardingPage() {
    return (
        <Suspense fallback={<div className="flex items-center justify-center min-h-screen"><Loader2 className="animate-spin" size={24} /></div>}>
            <OnboardingContent />
        </Suspense>
    );
}

function OnboardingContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const { user: clerkUser } = useUser();
    const { userId } = useAuth();

    const [currentStep, setCurrentStep] = useState<Step>(1);
    const [isSubmitting, setIsSubmitting] = useState(false);
    const [slideDirection, setSlideDirection] = useState<'forward' | 'back'>('forward');

    // Step 1 state
    const [name, setName] = useState('');
    const [jobTitle, setJobTitle] = useState('');
    const [company, setCompany] = useState('');
    const [preferredChannel, setPreferredChannel] = useState<'text' | 'voice'>('text');
    const [countryCode, setCountryCode] = useState('+91');
    const [phoneNumber, setPhoneNumber] = useState('');
    const [profileLoaded, setProfileLoaded] = useState(false);

    // Step 2 state
    const [googleConnected, setGoogleConnected] = useState(false);
    const [microsoftConnected, setMicrosoftConnected] = useState(false);
    const [showMoreSources, setShowMoreSources] = useState(false);
    const [skippedStep2, setSkippedStep2] = useState(false);

    // Step 3 state — WhatsApp
    const [whatsappStatus, setWhatsappStatus] = useState<'idle' | 'pending' | 'connected' | 'error'>('idle');
    const [qrCodeData, setQrCodeData] = useState<string | null>(null);
    const pusherRef = useRef<Pusher | null>(null);
    const channelRef = useRef<Channel | null>(null);

    // Pre-fill name from Clerk
    useEffect(() => {
        if (clerkUser) {
            const fullName = [clerkUser.firstName, clerkUser.lastName].filter(Boolean).join(' ');
            if (fullName && !name) setName(fullName);
        }
    }, [clerkUser]); // eslint-disable-line react-hooks/exhaustive-deps

    // Restore saved profile state (countryCode, preferredChannel) after OAuth redirect
    // so the showWhatsApp condition uses the user's actual selection, not the default '+91'
    useEffect(() => {
        const googleParam = searchParams.get('google');
        const success = searchParams.get('success');
        if (!googleParam && !success) return;

        fetch('/api/me')
            .then(r => r.ok ? r.json() : null)
            .then(data => {
                if (!data) return;
                if (data.countryCode) setCountryCode(data.countryCode);
                if (data.preferredChannel) setPreferredChannel(data.preferredChannel as 'text' | 'voice');
                if (data.phoneNumber) setPhoneNumber(data.phoneNumber);
                if (data.jobTitle) setJobTitle(data.jobTitle);
                if (data.company) setCompany(data.company);
                if (data.name) setName(data.name);
            })
            .finally(() => setProfileLoaded(true));
    }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

    // Detect connection success from URL params (OAuth redirect back)
    useEffect(() => {
        const googleParam = searchParams.get('google');
        const success = searchParams.get('success');

        if (googleParam === 'connected' || success === 'google_connected') {
            setGoogleConnected(true);
            setCurrentStep(2);
            // Auto-advance after 2 seconds (wait for profile to load first)
            const timer = setTimeout(() => goToStep(3), 2000);
            return () => clearTimeout(timer);
        }
        if (success === 'microsoft_connected') {
            setMicrosoftConnected(true);
            setCurrentStep(2);
            const timer = setTimeout(() => goToStep(3), 2000);
            return () => clearTimeout(timer);
        }
    }, [searchParams]); // eslint-disable-line react-hooks/exhaustive-deps

    // Pusher subscription for WhatsApp QR code
    useEffect(() => {
        if (whatsappStatus !== 'pending' || !userId) return;

        const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
        const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;
        if (!pusherKey || !pusherCluster) return;

        pusherRef.current = new Pusher(pusherKey, {
            cluster: pusherCluster,
            authorizer: (channel) => ({
                authorize: async (socketId: string, callback: (error: Error | null, authData: any) => void) => {
                    try {
                        const response = await fetch('/api/pusher/auth', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                            credentials: 'include',
                            body: new URLSearchParams({
                                socket_id: socketId,
                                channel_name: channel.name,
                            }),
                        });
                        if (!response.ok) {
                            callback(new Error('Auth failed'), null);
                            return;
                        }
                        const authData = await response.json();
                        callback(null, authData);
                    } catch (error) {
                        callback(error as Error, null);
                    }
                },
            }),
        });

        const channelName = `private-user-${userId}`;
        channelRef.current = pusherRef.current.subscribe(channelName);

        channelRef.current.bind('whatsapp-qr', (data: { qr: string }) => {
            setQrCodeData(data.qr);
        });

        channelRef.current.bind('whatsapp-connected', () => {
            setWhatsappStatus('connected');
            setQrCodeData(null);
        });

        return () => {
            if (channelRef.current) {
                channelRef.current.unbind_all();
                pusherRef.current?.unsubscribe(channelName);
            }
            pusherRef.current?.disconnect();
            pusherRef.current = null;
            channelRef.current = null;
        };
    }, [whatsappStatus, userId]);

    const goToStep = useCallback((step: Step) => {
        setSlideDirection(step > currentStep ? 'forward' : 'back');
        setCurrentStep(step);
    }, [currentStep]);

    // Determine if Step 3 should show WhatsApp or "all set"
    const showWhatsApp = countryCode === '+91' || skippedStep2;
    const emailDomain = clerkUser?.primaryEmailAddress?.emailAddress;
    const detectedProvider = detectProvider(emailDomain);

    // --- Step 1 handler ---
    async function handleStep1Continue() {
        if (!jobTitle.trim() || !company.trim()) return;
        if (preferredChannel === 'voice' && !phoneNumber.trim()) return;

        setIsSubmitting(true);
        try {
            // Save profile
            const res = await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobTitle: jobTitle.trim(),
                    company: company.trim(),
                    team: '',
                    orgBrief: '',
                    stakeholders: [],
                    stepOnly: true,
                }),
            });
            if (!res.ok) {
                console.error('[Onboarding] Profile save failed:', res.status);
            }

            // Save channel preference and phone
            await fetch('/api/me', {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    preferredChannel,
                    countryCode,
                    ...(name.trim() ? { name: name.trim() } : {}),
                    ...(phoneNumber.trim() ? {
                        phoneNumber: (() => {
                            let num = phoneNumber.trim().replace(/[\s\-()]/g, '');
                            if (num.startsWith(countryCode)) num = num.slice(countryCode.length);
                            if (num.startsWith('+')) num = num.replace(/^\+\d{1,3}/, '');
                            return countryCode + num;
                        })(),
                    } : {}),
                }),
            });

            // Schedule first call for voice users
            if (preferredChannel === 'voice' && phoneNumber.trim()) {
                try {
                    await fetch('/api/calls/schedule', {
                        method: 'POST',
                        headers: { 'Content-Type': 'application/json' },
                        body: JSON.stringify({ trigger: 'first_login' }),
                    });
                } catch (scheduleErr) {
                    console.error('[Onboarding] Failed to schedule first-login call:', scheduleErr);
                }
            }

            goToStep(2);
        } catch (e) {
            console.error('[Onboarding] Step 1 error:', e);
        }
        setIsSubmitting(false);
    }

    // --- Step 2 handlers ---
    function handleConnectGoogle() {
        // The callback will redirect back to /onboarding?google=connected
        window.location.href = '/api/auth/google';
    }

    function handleConnectMicrosoft() {
        window.location.href = '/api/auth/microsoft';
    }

    function handleSkipStep2() {
        setSkippedStep2(true);
        goToStep(3);
    }

    // --- Step 3 handlers ---
    async function handleInitiateWhatsApp() {
        setWhatsappStatus('pending');
        try {
            const res = await fetch('/api/whatsapp/connect', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
            });
            if (!res.ok) {
                setWhatsappStatus('error');
            }
        } catch {
            setWhatsappStatus('error');
        }
    }

    async function handleFinish() {
        setIsSubmitting(true);
        try {
            await fetch('/api/onboarding', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jobTitle: jobTitle.trim(),
                    company: company.trim(),
                    team: '',
                    orgBrief: '',
                    stakeholders: [],
                }),
            });
            router.push('/dashboard');
        } catch (e) {
            console.error('[Onboarding] Finish error:', e);
            router.push('/dashboard');
        } finally {
            setIsSubmitting(false);
        }
    }

    // --- Input class helpers ---
    const inputClass = 'w-full bg-card border border-border rounded-xl px-4 py-3 text-foreground placeholder:text-muted-foreground/50 focus:outline-none focus:border-primary/50 text-sm';
    const cardBtnClass = (active: boolean) =>
        `p-4 rounded-xl border-2 text-left transition-all ${
            active
                ? 'border-primary bg-primary/5 text-foreground'
                : 'border-border text-muted-foreground hover:border-primary/30'
        }`;

    return (
        <div className="min-h-screen bg-background text-foreground flex flex-col">
            {/* Progress dots */}
            <div className="fixed top-0 left-0 right-0 z-50 bg-background/80 backdrop-blur border-b border-border">
                <div className="max-w-lg mx-auto px-4 py-4 flex items-center justify-center gap-3">
                    {([1, 2, 3] as Step[]).map((step) => (
                        <button
                            key={step}
                            onClick={() => {
                                if (step < currentStep) goToStep(step);
                            }}
                            className={`w-2.5 h-2.5 rounded-full transition-all duration-300 ${
                                step === currentStep
                                    ? 'w-8 bg-primary'
                                    : step < currentStep
                                        ? 'bg-primary/60 cursor-pointer hover:bg-primary/80'
                                        : 'bg-border'
                            }`}
                            title={STEP_LABELS[step]}
                        />
                    ))}
                </div>
            </div>

            <div className="flex-1 flex items-center justify-center p-4 pt-20">
                <div
                    key={currentStep}
                    className={`w-full max-w-lg animate-in ${
                        slideDirection === 'forward' ? 'slide-in-from-right-4' : 'slide-in-from-left-4'
                    } fade-in duration-300`}
                >

                    {/* ===== STEP 1: Tell Mira about you ===== */}
                    {currentStep === 1 && (
                        <div className="space-y-6">
                            <div className="text-center space-y-3">
                                <MiraLogo size={56} className="mx-auto" />
                                <h1 className="text-2xl font-semibold">Tell Mira about you</h1>
                                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                                    I&apos;m {BRAND.name}, your AI executive coach. A little about you helps me show up prepared.
                                </p>
                            </div>

                            <div className="space-y-3">
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Your name</label>
                                    <input
                                        type="text"
                                        value={name}
                                        onChange={e => setName(e.target.value)}
                                        placeholder="How should I address you?"
                                        className={inputClass}
                                        autoFocus
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Job title <span className="text-red-400">*</span></label>
                                    <input
                                        type="text"
                                        value={jobTitle}
                                        onChange={e => setJobTitle(e.target.value)}
                                        placeholder="e.g., VP Engineering, Director of Product"
                                        className={inputClass}
                                        onKeyDown={e => { if (e.key === 'Enter') handleStep1Continue(); }}
                                    />
                                </div>
                                <div className="space-y-1">
                                    <label className="text-xs text-muted-foreground">Company <span className="text-red-400">*</span></label>
                                    <input
                                        type="text"
                                        value={company}
                                        onChange={e => setCompany(e.target.value)}
                                        placeholder="Where do you work?"
                                        className={inputClass}
                                        onKeyDown={e => { if (e.key === 'Enter') handleStep1Continue(); }}
                                    />
                                </div>
                            </div>

                            {/* Channel preference */}
                            <div className="space-y-2">
                                <label className="text-xs text-muted-foreground">How do you want Mira to reach you?</label>
                                <div className="grid grid-cols-2 gap-3">
                                    <button
                                        onClick={() => setPreferredChannel('text')}
                                        className={cardBtnClass(preferredChannel === 'text')}
                                    >
                                        <MessageSquare size={20} className="mb-1.5" />
                                        <div className="font-medium text-sm">Text</div>
                                        <div className="text-[10px] text-muted-foreground">Chat in the app</div>
                                    </button>
                                    <button
                                        onClick={() => setPreferredChannel('voice')}
                                        className={cardBtnClass(preferredChannel === 'voice')}
                                    >
                                        <Phone size={20} className="mb-1.5" />
                                        <div className="font-medium text-sm">Voice</div>
                                        <div className="text-[10px] text-muted-foreground">Mira calls you</div>
                                    </button>
                                </div>

                                {/* Phone number — slides in when Voice is selected */}
                                {preferredChannel === 'voice' && (
                                    <div className="mt-3 space-y-1 animate-in slide-in-from-top-2 duration-200">
                                        <label className="text-xs text-muted-foreground">Your phone number</label>
                                        <div className="flex gap-2">
                                            <select
                                                value={countryCode}
                                                onChange={e => setCountryCode(e.target.value)}
                                                className="bg-card border border-border rounded-xl px-3 py-3 text-foreground text-sm focus:outline-none focus:border-primary/50 w-24 shrink-0"
                                            >
                                                <option value="+91">+91</option>
                                                <option value="+1">+1</option>
                                                <option value="+44">+44</option>
                                                <option value="+971">+971</option>
                                                <option value="+65">+65</option>
                                                <option value="+61">+61</option>
                                                <option value="+49">+49</option>
                                                <option value="+81">+81</option>
                                                <option value="+86">+86</option>
                                                <option value="+33">+33</option>
                                            </select>
                                            <input
                                                type="tel"
                                                value={phoneNumber}
                                                onChange={e => setPhoneNumber(e.target.value)}
                                                placeholder="98765 43210"
                                                className={`flex-1 ${inputClass}`}
                                            />
                                        </div>
                                        <p className="text-[10px] text-muted-foreground">
                                            Mira will call you for morning briefs and meeting prep. Your number stays private.
                                        </p>
                                    </div>
                                )}
                            </div>

                            <button
                                onClick={handleStep1Continue}
                                disabled={!jobTitle.trim() || !company.trim() || isSubmitting || (preferredChannel === 'voice' && !phoneNumber.trim())}
                                className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                            >
                                {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <>Continue <ArrowRight size={16} /></>}
                            </button>
                        </div>
                    )}

                    {/* ===== STEP 2: Connect your work ===== */}
                    {currentStep === 2 && (
                        <div className="space-y-6">
                            <div className="text-center space-y-3">
                                <div className="w-14 h-14 rounded-2xl bg-blue-500/10 flex items-center justify-center mx-auto">
                                    <Wifi size={28} className="text-blue-500" />
                                </div>
                                <h1 className="text-2xl font-semibold">Connect your work</h1>
                                <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                                    This is where the magic happens. Mira analyzes your calendar and email to coach you with real context.
                                </p>
                            </div>

                            {/* Provider cards */}
                            <div className="grid grid-cols-2 gap-4">
                                {/* Google */}
                                <div className={`relative rounded-2xl border-2 p-5 space-y-3 transition-all ${
                                    googleConnected
                                        ? 'border-green-500/50 bg-green-500/5'
                                        : detectedProvider === 'google'
                                            ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
                                            : 'border-border bg-card hover:border-primary/30'
                                }`}>
                                    {detectedProvider === 'google' && !googleConnected && (
                                        <span className="absolute -top-2.5 left-4 bg-primary text-primary-foreground text-[10px] font-medium px-2 py-0.5 rounded-full">
                                            Detected
                                        </span>
                                    )}
                                    <div className="space-y-1">
                                        <div className="text-lg font-semibold">Google</div>
                                        <div className="text-xs text-muted-foreground">Calendar + Gmail + Drive</div>
                                    </div>
                                    {googleConnected ? (
                                        <div className="flex items-center gap-2 text-green-500 text-sm font-medium">
                                            <Check size={18} /> Connected
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleConnectGoogle}
                                            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
                                        >
                                            Connect
                                        </button>
                                    )}
                                </div>

                                {/* Microsoft */}
                                <div className={`relative rounded-2xl border-2 p-5 space-y-3 transition-all ${
                                    microsoftConnected
                                        ? 'border-green-500/50 bg-green-500/5'
                                        : detectedProvider === 'microsoft'
                                            ? 'border-primary/50 bg-primary/5 ring-2 ring-primary/20'
                                            : 'border-border bg-card hover:border-primary/30'
                                }`}>
                                    {detectedProvider === 'microsoft' && !microsoftConnected && (
                                        <span className="absolute -top-2.5 left-4 bg-primary text-primary-foreground text-[10px] font-medium px-2 py-0.5 rounded-full">
                                            Detected
                                        </span>
                                    )}
                                    <div className="space-y-1">
                                        <div className="text-lg font-semibold">Microsoft</div>
                                        <div className="text-xs text-muted-foreground">Outlook + Mail + OneDrive</div>
                                    </div>
                                    {microsoftConnected ? (
                                        <div className="flex items-center gap-2 text-green-500 text-sm font-medium">
                                            <Check size={18} /> Connected
                                        </div>
                                    ) : (
                                        <button
                                            onClick={handleConnectMicrosoft}
                                            className="w-full flex items-center justify-center gap-2 bg-primary text-primary-foreground py-2.5 rounded-xl text-sm font-medium hover:bg-primary/90 transition-colors"
                                        >
                                            Connect
                                        </button>
                                    )}
                                </div>
                            </div>

                            {/* More sources — expandable */}
                            <div>
                                <button
                                    onClick={() => setShowMoreSources(!showMoreSources)}
                                    className="flex items-center gap-2 text-xs text-muted-foreground hover:text-foreground transition-colors w-full justify-center"
                                >
                                    More sources {showMoreSources ? <ChevronUp size={14} /> : <ChevronDown size={14} />}
                                </button>
                                {showMoreSources && (
                                    <div className="mt-3 grid grid-cols-3 gap-2 animate-in slide-in-from-top-2 duration-200">
                                        {['Slack', 'Zoom', 'Dropbox', 'Notion', 'Linear', 'Jira'].map((source) => (
                                            <div
                                                key={source}
                                                className="rounded-xl border border-border bg-card/50 p-3 text-center opacity-60"
                                            >
                                                <div className="text-xs font-medium text-muted-foreground">{source}</div>
                                                <div className="text-[10px] text-muted-foreground/60 mt-0.5">Coming soon</div>
                                            </div>
                                        ))}
                                    </div>
                                )}
                            </div>

                            {/* Navigation */}
                            <div className="flex gap-3">
                                <button onClick={() => goToStep(1)}
                                    className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                                    <ArrowLeft size={14} /> Back
                                </button>
                                <button
                                    onClick={() => goToStep(3)}
                                    disabled={!googleConnected && !microsoftConnected}
                                    className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                                >
                                    Continue <ArrowRight size={16} />
                                </button>
                            </div>
                            <button onClick={handleSkipStep2}
                                className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1">
                                Skip for now
                            </button>
                        </div>
                    )}

                    {/* ===== STEP 3: WhatsApp or All Set ===== */}
                    {currentStep === 3 && (
                        <div className="space-y-6">
                            {showWhatsApp ? (
                                /* ----- WhatsApp connect ----- */
                                <>
                                    <div className="text-center space-y-3">
                                        <div className="w-14 h-14 rounded-2xl bg-green-500/10 flex items-center justify-center mx-auto">
                                            <svg width="28" height="28" viewBox="0 0 24 24" fill="none" className="text-green-500">
                                                <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="currentColor"/>
                                                <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.963 7.963 0 01-4.105-1.134l-.29-.175-3.032.795.81-2.957-.192-.304A7.963 7.963 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" fill="currentColor"/>
                                            </svg>
                                        </div>
                                        <h1 className="text-2xl font-semibold">Connect WhatsApp</h1>
                                        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                                            Mira can learn from your work conversations on WhatsApp to give you sharper coaching.
                                        </p>
                                    </div>

                                    {/* QR area */}
                                    <div className="rounded-2xl border border-border bg-card p-6 min-h-[240px] flex items-center justify-center">
                                        {whatsappStatus === 'idle' && (
                                            <button
                                                onClick={handleInitiateWhatsApp}
                                                className="flex flex-col items-center gap-3 text-center"
                                            >
                                                <div className="w-16 h-16 rounded-full bg-green-500/10 flex items-center justify-center">
                                                    <svg width="32" height="32" viewBox="0 0 24 24" fill="none" className="text-green-500">
                                                        <path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z" fill="currentColor"/>
                                                        <path d="M12 2C6.477 2 2 6.477 2 12c0 1.89.525 3.66 1.438 5.168L2 22l4.832-1.438A9.955 9.955 0 0012 22c5.523 0 10-4.477 10-10S17.523 2 12 2zm0 18a7.963 7.963 0 01-4.105-1.134l-.29-.175-3.032.795.81-2.957-.192-.304A7.963 7.963 0 014 12c0-4.411 3.589-8 8-8s8 3.589 8 8-3.589 8-8 8z" fill="currentColor"/>
                                                    </svg>
                                                </div>
                                                <span className="text-sm font-medium text-primary">Tap to generate QR code</span>
                                                <span className="text-xs text-muted-foreground">Scan with WhatsApp to connect</span>
                                            </button>
                                        )}

                                        {whatsappStatus === 'pending' && !qrCodeData && (
                                            <div className="flex flex-col items-center gap-3">
                                                <Loader2 size={32} className="animate-spin text-green-500" />
                                                <span className="text-sm text-muted-foreground">Generating QR code...</span>
                                            </div>
                                        )}

                                        {whatsappStatus === 'pending' && qrCodeData && (
                                            <div className="flex flex-col items-center gap-3">
                                                {/* Render QR as an image (base64 or URL from Pusher event) */}
                                                <img
                                                    src={qrCodeData}
                                                    alt="WhatsApp QR Code"
                                                    className="w-48 h-48 rounded-lg"
                                                />
                                                <span className="text-xs text-muted-foreground">Open WhatsApp &rarr; Linked Devices &rarr; Scan this code</span>
                                            </div>
                                        )}

                                        {whatsappStatus === 'connected' && (
                                            <div className="flex flex-col items-center gap-3 text-green-500">
                                                <Check size={40} />
                                                <span className="text-sm font-medium">WhatsApp connected</span>
                                            </div>
                                        )}

                                        {whatsappStatus === 'error' && (
                                            <div className="flex flex-col items-center gap-3">
                                                <span className="text-sm text-red-400">Something went wrong. Try again?</span>
                                                <button
                                                    onClick={handleInitiateWhatsApp}
                                                    className="text-xs text-primary hover:text-primary/80"
                                                >
                                                    Retry
                                                </button>
                                            </div>
                                        )}
                                    </div>

                                    <p className="text-[10px] text-muted-foreground text-center">
                                        Mira only reads &mdash; never sends messages on your behalf. Your privacy is sacred.
                                    </p>

                                    <div className="flex gap-3">
                                        <button onClick={() => goToStep(2)}
                                            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                                            <ArrowLeft size={14} /> Back
                                        </button>
                                        <button
                                            onClick={handleFinish}
                                            disabled={isSubmitting}
                                            className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                                        >
                                            {isSubmitting
                                                ? <Loader2 size={16} className="animate-spin" />
                                                : whatsappStatus === 'connected'
                                                    ? <>Get Started <ArrowRight size={16} /></>
                                                    : <>Get Started <ArrowRight size={16} /></>
                                            }
                                        </button>
                                    </div>
                                    {whatsappStatus !== 'connected' && (
                                        <button onClick={handleFinish} disabled={isSubmitting}
                                            className="w-full text-xs text-muted-foreground/60 hover:text-muted-foreground transition-colors py-1">
                                            Skip &mdash; I&apos;ll do this later
                                        </button>
                                    )}
                                </>
                            ) : (
                                /* ----- All set! ----- */
                                <>
                                    <div className="text-center space-y-4">
                                        <MiraLogo size={64} className="mx-auto" />
                                        <h1 className="text-2xl font-semibold">You&apos;re all set!</h1>
                                        <p className="text-sm text-muted-foreground max-w-sm mx-auto">
                                            Mira is getting to know your world. The more you share, the sharper your coaching becomes.
                                        </p>

                                        {(googleConnected || microsoftConnected) && (
                                            <div className="flex items-center justify-center gap-4 text-sm text-green-500">
                                                {googleConnected && (
                                                    <span className="flex items-center gap-1.5">
                                                        <Check size={16} /> Google
                                                    </span>
                                                )}
                                                {microsoftConnected && (
                                                    <span className="flex items-center gap-1.5">
                                                        <Check size={16} /> Microsoft
                                                    </span>
                                                )}
                                            </div>
                                        )}
                                    </div>

                                    <div className="flex gap-3 pt-4">
                                        <button onClick={() => goToStep(2)}
                                            className="flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
                                            <ArrowLeft size={14} /> Back
                                        </button>
                                        <button
                                            onClick={handleFinish}
                                            disabled={isSubmitting}
                                            className="flex-1 flex items-center justify-center gap-2 bg-primary text-primary-foreground py-3 rounded-xl font-medium hover:bg-primary/90 transition-colors disabled:opacity-50"
                                        >
                                            {isSubmitting ? <Loader2 size={16} className="animate-spin" /> : <>Get Started <ArrowRight size={16} /></>}
                                        </button>
                                    </div>
                                </>
                            )}
                        </div>
                    )}

                </div>
            </div>
        </div>
    );
}
