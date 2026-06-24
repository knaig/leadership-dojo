'use client';

import { useState, useCallback, useRef, useEffect } from 'react';
import { Phone, PhoneOff, Loader2, Mic, MicOff } from 'lucide-react';

type CallState = 'idle' | 'connecting' | 'active' | 'ending' | 'error';

export function VoiceCallButton({ compact = false, callType = 'general', meetingId }: {
    compact?: boolean;
    callType?: string;
    meetingId?: string;
}) {
    const [callState, setCallState] = useState<CallState>('idle');
    const [errorMsg, setErrorMsg] = useState('');
    const [duration, setDuration] = useState(0);
    const [isMuted, setIsMuted] = useState(false);
    const vapiRef = useRef<any>(null);
    const timerRef = useRef<NodeJS.Timeout | null>(null);

    // Cleanup on unmount
    useEffect(() => {
        return () => {
            if (vapiRef.current) {
                try { vapiRef.current.stop(); } catch {}
            }
            if (timerRef.current) clearInterval(timerRef.current);
        };
    }, []);

    const startCall = useCallback(async () => {
        setCallState('connecting');
        setErrorMsg('');
        setDuration(0);

        try {
            // 1. Get assistant config from API
            console.log('[VoiceCall] Requesting call config...');
            const res = await fetch('/api/vapi/call', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ type: 'web', callType, meetingId }),
            });

            if (!res.ok) {
                const data = await res.json().catch(() => ({ error: `HTTP ${res.status}` }));
                throw new Error(data.error || `API returned ${res.status}`);
            }

            const data = await res.json();
            const { assistant, publicKey, voiceCallId } = data;
            console.log('[VoiceCall] Got config:', { hasAssistantId: !!assistant?.assistantId, hasPublicKey: !!publicKey, voiceCallId });

            if (!publicKey) {
                throw new Error('Vapi public key not configured. Add NEXT_PUBLIC_VAPI_PUBLIC_KEY to env.');
            }

            // 2. Check microphone permission before starting Vapi
            try {
                const permResult = await navigator.permissions.query({ name: 'microphone' as PermissionName });
                console.log('[VoiceCall] Microphone permission:', permResult.state);
                if (permResult.state === 'denied') {
                    throw new Error('Microphone access denied. Please allow microphone in your browser settings.');
                }
            } catch (permErr: any) {
                // permissions.query may not support 'microphone' in all browsers — proceed anyway
                console.log('[VoiceCall] Mic permission check skipped:', permErr.message);
            }

            // 3. Create Vapi Web instance and start call
            console.log('[VoiceCall] Loading Vapi SDK...');
            const { default: Vapi } = await import('@vapi-ai/web');
            const vapi = new Vapi(publicKey);
            vapiRef.current = vapi;

            // Event handlers
            vapi.on('call-start', () => {
                console.log('[VoiceCall] Call started');
                setCallState('active');
                // Start duration timer
                const startTime = Date.now();
                timerRef.current = setInterval(() => {
                    setDuration(Math.floor((Date.now() - startTime) / 1000));
                }, 1000);
            });

            vapi.on('call-end', () => {
                console.log('[VoiceCall] Call ended');
                setCallState('idle');
                if (timerRef.current) clearInterval(timerRef.current);
                vapiRef.current = null;
            });

            vapi.on('error', (err: any) => {
                console.error('[VoiceCall] Vapi error event:', err);
                const msg = err?.errorMessage || err?.message || err?.error?.message || 'Call error — check console for details';
                setErrorMsg(msg);
                setCallState('error');
                if (timerRef.current) clearInterval(timerRef.current);
                vapiRef.current = null;
                setTimeout(() => setCallState('idle'), 8000);
            });

            // Also listen for speech-start as a backup signal that things are working
            vapi.on('speech-start', () => {
                console.log('[VoiceCall] Speech started (Mira is talking)');
            });

            // Start the call
            console.log('[VoiceCall] Starting Vapi call...', assistant.assistantId ? `assistantId: ${assistant.assistantId}` : 'inline assistant');
            let callResult;
            if (assistant.assistantId) {
                callResult = await vapi.start(assistant.assistantId, assistant.assistantOverrides);
            } else {
                callResult = await vapi.start(assistant);
            }
            console.log('[VoiceCall] vapi.start() returned:', callResult ? 'call object' : 'null/undefined');

        } catch (error) {
            console.error('[VoiceCall] Error:', error);
            const msg = error instanceof Error ? error.message : 'Call failed';
            setErrorMsg(msg);
            setCallState('error');
            setTimeout(() => setCallState('idle'), 8000);
        }
    }, [callType, meetingId]);

    const endCall = useCallback(() => {
        setCallState('ending');
        if (vapiRef.current) {
            try { vapiRef.current.stop(); } catch {}
        }
        if (timerRef.current) clearInterval(timerRef.current);
        setTimeout(() => {
            setCallState('idle');
            vapiRef.current = null;
        }, 1000);
    }, []);

    const toggleMute = useCallback(() => {
        if (vapiRef.current) {
            const newMuted = !isMuted;
            vapiRef.current.setMuted(newMuted);
            setIsMuted(newMuted);
        }
    }, [isMuted]);

    const formatDuration = (s: number) => {
        const m = Math.floor(s / 60);
        const sec = s % 60;
        return `${m}:${sec.toString().padStart(2, '0')}`;
    };

    // IDLE — show call button
    if (callState === 'idle') {
        return (
            <button
                onClick={startCall}
                className={`flex items-center gap-2 rounded-full transition-all ${
                    compact
                        ? 'p-2 bg-primary/10 hover:bg-primary/20 text-primary'
                        : 'px-4 py-2.5 bg-primary text-primary-foreground hover:bg-primary/90 shadow-lg'
                }`}
                title="Talk to Mira (web call — free)"
            >
                <Phone size={compact ? 16 : 18} />
                {!compact && <span className="text-sm font-medium">Talk to Mira</span>}
            </button>
        );
    }

    // CONNECTING
    if (callState === 'connecting') {
        return (
            <div className={`flex items-center gap-2 rounded-full ${
                compact ? 'p-2 bg-primary/10' : 'px-4 py-2.5 bg-primary/10'
            }`}>
                <Loader2 size={compact ? 16 : 18} className="animate-spin text-primary" />
                {!compact && <span className="text-sm text-primary">Connecting...</span>}
            </div>
        );
    }

    // ACTIVE — show controls
    if (callState === 'active') {
        return (
            <div className={`flex items-center gap-2 ${compact ? '' : 'px-3 py-2 bg-emerald-500/10 rounded-full'}`}>
                <span className="text-xs text-emerald-500 font-mono">{formatDuration(duration)}</span>
                <button
                    onClick={toggleMute}
                    className="p-1.5 rounded-full hover:bg-muted transition-colors"
                    title={isMuted ? 'Unmute' : 'Mute'}
                >
                    {isMuted
                        ? <MicOff size={14} className="text-red-400" />
                        : <Mic size={14} className="text-emerald-500" />
                    }
                </button>
                <button
                    onClick={endCall}
                    className="p-1.5 rounded-full bg-red-500 hover:bg-red-600 transition-colors"
                    title="End call"
                >
                    <PhoneOff size={14} className="text-white" />
                </button>
            </div>
        );
    }

    // ENDING
    if (callState === 'ending') {
        return (
            <div className={`flex items-center gap-2 rounded-full ${compact ? 'p-2' : 'px-4 py-2.5'} bg-muted`}>
                <Loader2 size={compact ? 14 : 16} className="animate-spin text-muted-foreground" />
                {!compact && <span className="text-sm text-muted-foreground">Ending...</span>}
            </div>
        );
    }

    // ERROR
    return (
        <button
            onClick={startCall}
            className={`flex items-center gap-2 rounded-full ${
                compact ? 'p-2 bg-red-500/10' : 'px-4 py-2.5 bg-red-500/10'
            }`}
            title={errorMsg}
        >
            <Phone size={compact ? 16 : 18} className="text-red-400" />
            {!compact && <span className="text-sm text-red-400">{errorMsg || 'Failed'}</span>}
        </button>
    );
}
