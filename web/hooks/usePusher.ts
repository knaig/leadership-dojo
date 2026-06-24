'use client';

/**
 * usePusher Hook
 *
 * Manages real-time WebSocket connection via Pusher for chat messages.
 * Automatically subscribes to the user's private channel and handles events.
 */

import { useEffect, useRef, useState, useCallback } from 'react';
import Pusher from 'pusher-js';
import type { Channel } from 'pusher-js';

interface Message {
    id: string;
    role: 'user' | 'assistant';
    content: string;
    createdAt: Date;
}

interface SystemEvent {
    type: string;
    message: string;
    data?: any;
}

interface ProactiveNudge {
    trigger: string;
    messageId: string;
    preview: string;
}

interface UsePusherOptions {
    userId: string | null | undefined;
    onMessage: (message: Message) => void;
    onTyping?: (isTyping: boolean) => void;
    onSystemEvent?: (event: SystemEvent) => void;
    onModeChange?: (mode: string) => void;
    onProactiveNudge?: (nudge: ProactiveNudge) => void;
}

interface UsePusherReturn {
    isConnected: boolean;
    connectionState: string;
}

export function usePusher({
    userId,
    onMessage,
    onTyping,
    onSystemEvent,
    onModeChange,
    onProactiveNudge,
}: UsePusherOptions): UsePusherReturn {
    const pusherRef = useRef<Pusher | null>(null);
    const channelRef = useRef<Channel | null>(null);
    const [isConnected, setIsConnected] = useState(false);
    const [connectionState, setConnectionState] = useState('disconnected');

    // Store callbacks in refs to avoid re-subscription on callback changes
    const onMessageRef = useRef(onMessage);
    const onTypingRef = useRef(onTyping);
    const onSystemEventRef = useRef(onSystemEvent);
    const onModeChangeRef = useRef(onModeChange);
    const onProactiveNudgeRef = useRef(onProactiveNudge);

    // Update refs when callbacks change
    useEffect(() => {
        onMessageRef.current = onMessage;
        onTypingRef.current = onTyping;
        onSystemEventRef.current = onSystemEvent;
        onModeChangeRef.current = onModeChange;
        onProactiveNudgeRef.current = onProactiveNudge;
    }, [onMessage, onTyping, onSystemEvent, onModeChange, onProactiveNudge]);

    // Stable handlers that use refs
    const handleMessage = useCallback((data: any) => {
        console.log('[Pusher] 📥 Received new-message event:', JSON.stringify(data));
        // Parse createdAt if it's a string
        const message: Message = {
            ...data,
            createdAt: data.createdAt ? new Date(data.createdAt) : new Date()
        };
        onMessageRef.current(message);
    }, []);

    const handleTyping = useCallback((data: { isTyping: boolean }) => {
        console.log('[Pusher] 📥 Received typing event:', data.isTyping);
        onTypingRef.current?.(data.isTyping);
    }, []);

    const handleSystemEvent = useCallback((data: SystemEvent) => {
        console.log('[Pusher] 📥 Received system-event:', data.type, data.message);
        onSystemEventRef.current?.(data);
    }, []);

    const handleModeChange = useCallback((data: { mode: string }) => {
        console.log('[Pusher] 📥 Received mode-change:', data.mode);
        onModeChangeRef.current?.(data.mode);
    }, []);

    const handleProactiveNudge = useCallback((data: ProactiveNudge) => {
        console.log('[Pusher] 🔔 Received proactive-nudge:', data.trigger);
        onProactiveNudgeRef.current?.(data);
    }, []);

    useEffect(() => {
        // Don't initialize if no userId or missing env vars
        if (!userId) {
            console.log('[Pusher] No userId, skipping initialization');
            return;
        }

        const pusherKey = process.env.NEXT_PUBLIC_PUSHER_KEY;
        const pusherCluster = process.env.NEXT_PUBLIC_PUSHER_CLUSTER;

        if (!pusherKey || !pusherCluster) {
            console.warn('[Pusher] Missing NEXT_PUBLIC_PUSHER_KEY or NEXT_PUBLIC_PUSHER_CLUSTER');
            return;
        }

        console.log('[Pusher] Initializing for user:', userId);

        // Initialize Pusher client with custom authorizer to include credentials
        pusherRef.current = new Pusher(pusherKey, {
            cluster: pusherCluster,
            // Use custom authorizer to include credentials for Clerk auth
            authorizer: (channel) => ({
                authorize: async (socketId: string, callback: (error: Error | null, authData: any) => void) => {
                    try {
                        const response = await fetch('/api/pusher/auth', {
                            method: 'POST',
                            headers: {
                                'Content-Type': 'application/x-www-form-urlencoded',
                            },
                            credentials: 'include', // Important: sends cookies for Clerk auth
                            body: new URLSearchParams({
                                socket_id: socketId,
                                channel_name: channel.name,
                            }),
                        });

                        console.log('[Pusher] Auth response status:', response.status);

                        if (!response.ok) {
                            const text = await response.text();
                            console.error('[Pusher] Auth failed, status:', response.status, 'body:', text);
                            try {
                                const error = JSON.parse(text);
                                callback(new Error(error.error || 'Auth failed'), null);
                            } catch {
                                callback(new Error(`Auth failed with status ${response.status}`), null);
                            }
                            return;
                        }

                        const authData = await response.json();
                        callback(null, authData);
                    } catch (error) {
                        console.error('[Pusher] Auth error:', error);
                        callback(error as Error, null);
                    }
                },
            }),
        });

        // Subscribe to private user channel
        const channelName = `private-user-${userId}`;
        channelRef.current = pusherRef.current.subscribe(channelName);

        // Bind message events
        channelRef.current.bind('new-message', handleMessage);
        channelRef.current.bind('typing', handleTyping);
        channelRef.current.bind('system-event', handleSystemEvent);
        channelRef.current.bind('mode-change', handleModeChange);
        channelRef.current.bind('proactive-nudge', handleProactiveNudge);

        // Connection state handlers
        pusherRef.current.connection.bind('connected', () => {
            console.log('[Pusher] Connected');
            setIsConnected(true);
            setConnectionState('connected');
        });

        pusherRef.current.connection.bind('disconnected', () => {
            console.log('[Pusher] Disconnected');
            setIsConnected(false);
            setConnectionState('disconnected');
        });

        // Log errors but don't clobber connectionState — transient errors
        // fire even when the socket is still alive. Let state_change be
        // the single source of truth for connection state.
        pusherRef.current.connection.bind('error', (err: any) => {
            console.warn('[Pusher] Connection error (non-fatal):', err?.type, err?.data?.code, err?.data?.message || JSON.stringify(err?.data));
        });

        pusherRef.current.connection.bind('state_change', (states: { current: string; previous: string }) => {
            console.log(`[Pusher] State: ${states.previous} → ${states.current}`);
            setConnectionState(states.current);
            setIsConnected(states.current === 'connected');
        });

        // Subscription success/error
        channelRef.current.bind('pusher:subscription_succeeded', () => {
            console.log('[Pusher] Subscribed to', channelName);
        });

        channelRef.current.bind('pusher:subscription_error', (err: any) => {
            console.error('[Pusher] Subscription error:', err);
        });

        // Cleanup on unmount
        return () => {
            console.log('[Pusher] Cleaning up');
            if (channelRef.current) {
                channelRef.current.unbind_all();
                pusherRef.current?.unsubscribe(channelName);
            }
            pusherRef.current?.disconnect();
            pusherRef.current = null;
            channelRef.current = null;
        };
    }, [userId]); // Only re-run when userId changes - handlers are stable via refs

    return {
        isConnected,
        connectionState,
    };
}
