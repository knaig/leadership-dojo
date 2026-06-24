'use client';

import { useState, useEffect, Suspense } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { AppShell } from '@/components/layout/AppShell';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { ArrowLeft, Plus, Loader2, Calendar } from 'lucide-react';

const CONVERSATION_TYPES = [
    { value: 'ONE_ON_ONE', label: '1:1 Meeting' },
    { value: 'BOARD_PRESENTATION', label: 'Board Presentation' },
    { value: 'INVESTOR_PITCH', label: 'Investor Pitch' },
    { value: 'CUSTOMER_MEETING', label: 'Customer Meeting' },
    { value: 'NEGOTIATION', label: 'Negotiation' },
    { value: 'STAKEHOLDER_ALIGNMENT', label: 'Stakeholder Alignment' },
    { value: 'PERFORMANCE_REVIEW', label: 'Performance Review' },
    { value: 'DIFFICULT_CONVERSATION', label: 'Difficult Conversation' },
    { value: 'CRISIS_COMMUNICATION', label: 'Crisis Communication' },
    { value: 'TEAM_ALL_HANDS', label: 'Team All-Hands' },
    { value: 'SALES_CALL', label: 'Sales Call' },
    { value: 'INTERVIEW', label: 'Interview' },
    { value: 'OTHER', label: 'Other' }
];

interface CalendarEvent {
    id: string;
    title: string;
    description: string;
    startTime: string;
    endTime: string;
    attendees: Array<{ email: string; name: string }>;
    location: string;
}

export default function NewConversationPage() {
    return (
        <Suspense fallback={<div className="p-8 text-center text-zinc-500">Loading...</div>}>
            <NewConversationContent />
        </Suspense>
    );
}

function NewConversationContent() {
    const router = useRouter();
    const searchParams = useSearchParams();
    const dbMeetingId = searchParams.get('dbMeetingId');

    const [isSubmitting, setIsSubmitting] = useState(false);
    const [calendarEvents, setCalendarEvents] = useState<CalendarEvent[]>([]);
    const [loadingEvents, setLoadingEvents] = useState(false);
    const [formData, setFormData] = useState({
        title: '',
        type: 'ONE_ON_ONE',
        stakeholderName: '',
        stakeholderRole: '',
        objective: '',
        scheduledAt: '',
        scheduledTime: ''
    });

    // Fetch meeting details if dbMeetingId is present
    useEffect(() => {
        if (!dbMeetingId) return;

        const fetchMeeting = async () => {
            try {
                const res = await fetch(`/api/meetings/${dbMeetingId}`);
                if (res.ok) {
                    const { meeting } = await res.json();

                    const startDate = new Date(meeting.startTime);
                    const formattedDate = startDate.toISOString().split('T')[0];
                    const formattedTime = startDate.toTimeString().slice(0, 5);

                    // Simple heuristic for type
                    let type = 'ONE_ON_ONE';
                    if (meeting.meetingType) {
                        if (meeting.meetingType === 'board') type = 'BOARD_PRESENTATION';
                        else if (meeting.meetingType === 'external') type = 'CUSTOMER_MEETING';
                    } else if (meeting.title.toLowerCase().includes('board')) {
                        type = 'BOARD_PRESENTATION';
                    }

                    // Guests
                    let stakeholderName = '';
                    if (meeting.attendees && meeting.attendees.length > 0) {
                        stakeholderName = meeting.attendees[0].split('@')[0];
                    }

                    setFormData(prev => ({
                        ...prev,
                        title: meeting.title,
                        type,
                        stakeholderName,
                        objective: meeting.description || '',
                        scheduledAt: formattedDate,
                        scheduledTime: formattedTime
                    }));
                }
            } catch (e) {
                console.error('Failed to load meeting details:', e);
            }
        };
        fetchMeeting();
    }, [dbMeetingId]);

    // Fetch calendar events on mount
    useEffect(() => {
        const fetchEvents = async () => {
            setLoadingEvents(true);
            try {
                const res = await fetch('/api/calendar/events');
                const data = await res.json();
                if (data.events) {
                    setCalendarEvents(data.events);
                }
            } catch (e) {
                console.error('Failed to fetch calendar events:', e);
            } finally {
                setLoadingEvents(false);
            }
        };
        fetchEvents();
    }, []);

    const handleEventSelect = (eventId: string) => {
        if (!eventId) return;

        const event = calendarEvents.find(e => e.id === eventId);
        if (!event) return;

        // Auto-populate form from selected event
        const startDate = new Date(event.startTime);
        const formattedDate = startDate.toISOString().split('T')[0];
        const formattedTime = startDate.toTimeString().slice(0, 5);

        // Get the first attendee's name as stakeholder
        const firstAttendee = event.attendees[0];

        setFormData({
            title: event.title,
            type: formData.type, // Keep current type
            stakeholderName: firstAttendee?.name || '',
            stakeholderRole: '',
            objective: event.description || '',
            scheduledAt: formattedDate,
            scheduledTime: formattedTime
        });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            // Combine date and time
            let scheduledAt: string | undefined;
            if (formData.scheduledAt) {
                const date = new Date(formData.scheduledAt);
                if (formData.scheduledTime) {
                    const [hours, minutes] = formData.scheduledTime.split(':');
                    date.setHours(parseInt(hours), parseInt(minutes));
                }
                scheduledAt = date.toISOString();
            }

            const res = await fetch('/api/conversations', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    title: formData.title,
                    type: formData.type,
                    primaryObjective: formData.objective,  // API expects 'primaryObjective' not 'objective'
                    stakeholders: formData.stakeholderName ? [formData.stakeholderName] : [],
                    scheduledAt
                })
            });

            if (res.ok) {
                const json = await res.json();
                router.push(`/conversations/${json.conversation.id}`);
            }
        } catch (e) {
            console.error(e);
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <AppShell>
            <div className="p-6 max-w-2xl mx-auto">
                {/* Header */}
                <div className="flex items-center gap-4 mb-6">
                    <button
                        onClick={() => router.push('/conversations')}
                        className="p-2 rounded-lg hover:bg-zinc-800 transition-colors"
                    >
                        <ArrowLeft className="w-5 h-5 text-zinc-400" />
                    </button>
                    <h1 className="text-xl font-semibold text-white">New Conversation Prep</h1>
                </div>

                <form onSubmit={handleSubmit}>
                    <Card className="bg-zinc-900 border-zinc-800">
                        <CardHeader>
                            <CardTitle className="text-base">Meeting Details</CardTitle>
                        </CardHeader>
                        <CardContent className="space-y-6">
                            {/* Calendar Event Selector */}
                            {calendarEvents.length > 0 && (
                                <div className="space-y-2 pb-4 border-b border-zinc-800">
                                    <Label htmlFor="calendarEvent">
                                        <Calendar className="w-4 h-4 inline mr-2 text-indigo-400" />
                                        Auto-fill from Calendar Event
                                    </Label>
                                    <select
                                        id="calendarEvent"
                                        onChange={(e) => handleEventSelect(e.target.value)}
                                        className="w-full p-2 rounded-md bg-zinc-800 border border-zinc-700 text-white"
                                        disabled={loadingEvents}
                                    >
                                        <option value="">
                                            {loadingEvents ? 'Loading events...' : 'Select an upcoming meeting...'}
                                        </option>
                                        {calendarEvents.map(event => {
                                            const date = new Date(event.startTime);
                                            const dateStr = date.toLocaleDateString('en-US', {
                                                month: 'short',
                                                day: 'numeric',
                                                hour: 'numeric',
                                                minute: '2-digit'
                                            });
                                            return (
                                                <option key={event.id} value={event.id}>
                                                    {dateStr} - {event.title} ({event.attendees.length} attendees)
                                                </option>
                                            );
                                        })}
                                    </select>
                                    <p className="text-xs text-zinc-500">
                                        Select a calendar event to auto-fill meeting details below
                                    </p>
                                </div>
                            )}

                            {/* Title */}
                            <div className="space-y-2">
                                <Label htmlFor="title">Meeting Title</Label>
                                <Input
                                    id="title"
                                    placeholder="e.g., Q1 Budget Review with CFO"
                                    value={formData.title}
                                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                                    className="bg-zinc-800 border-zinc-700"
                                    required
                                />
                            </div>

                            {/* Type */}
                            <div className="space-y-2">
                                <Label>Conversation Type</Label>
                                <select
                                    value={formData.type}
                                    onChange={(e) => setFormData({ ...formData, type: e.target.value })}
                                    className="w-full p-2 rounded-md bg-zinc-800 border border-zinc-700 text-white"
                                >
                                    {CONVERSATION_TYPES.map((type) => (
                                        <option key={type.value} value={type.value}>{type.label}</option>
                                    ))}
                                </select>
                            </div>

                            {/* Stakeholder */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="stakeholderName">With (Name)</Label>
                                    <Input
                                        id="stakeholderName"
                                        placeholder="e.g., Sarah Chen"
                                        value={formData.stakeholderName}
                                        onChange={(e) => setFormData({ ...formData, stakeholderName: e.target.value })}
                                        className="bg-zinc-800 border-zinc-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="stakeholderRole">Their Role</Label>
                                    <Input
                                        id="stakeholderRole"
                                        placeholder="e.g., CFO"
                                        value={formData.stakeholderRole}
                                        onChange={(e) => setFormData({ ...formData, stakeholderRole: e.target.value })}
                                        className="bg-zinc-800 border-zinc-700"
                                    />
                                </div>
                            </div>

                            {/* Schedule */}
                            <div className="grid grid-cols-2 gap-4">
                                <div className="space-y-2">
                                    <Label htmlFor="scheduledAt">Date</Label>
                                    <Input
                                        id="scheduledAt"
                                        type="date"
                                        value={formData.scheduledAt}
                                        onChange={(e) => setFormData({ ...formData, scheduledAt: e.target.value })}
                                        className="bg-zinc-800 border-zinc-700"
                                    />
                                </div>
                                <div className="space-y-2">
                                    <Label htmlFor="scheduledTime">Time</Label>
                                    <Input
                                        id="scheduledTime"
                                        type="time"
                                        value={formData.scheduledTime}
                                        onChange={(e) => setFormData({ ...formData, scheduledTime: e.target.value })}
                                        className="bg-zinc-800 border-zinc-700"
                                    />
                                </div>
                            </div>

                            {/* Objective */}
                            <div className="space-y-2">
                                <Label htmlFor="objective">What's your objective? *</Label>
                                <Textarea
                                    id="objective"
                                    placeholder="What's the ONE thing you want to achieve in this conversation?"
                                    value={formData.objective}
                                    onChange={(e) => setFormData({ ...formData, objective: e.target.value })}
                                    className="bg-zinc-800 border-zinc-700 min-h-[100px]"
                                    required
                                />
                                <p className="text-xs text-zinc-500">
                                    Be specific. "Get budget approved" is better than "Discuss budget"
                                </p>
                            </div>
                        </CardContent>
                    </Card>

                    <div className="flex justify-end gap-3 mt-6">
                        <Button
                            type="button"
                            variant="ghost"
                            onClick={() => router.push('/conversations')}
                        >
                            Cancel
                        </Button>
                        <Button
                            type="submit"
                            disabled={isSubmitting || !formData.title || !formData.objective}
                            className="bg-indigo-600 hover:bg-indigo-700"
                        >
                            {isSubmitting ? (
                                <>
                                    <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                                    Creating...
                                </>
                            ) : (
                                <>
                                    <Plus className="w-4 h-4 mr-2" />
                                    Create & Prep
                                </>
                            )}
                        </Button>
                    </div>
                </form>
            </div>
        </AppShell>
    );
}
