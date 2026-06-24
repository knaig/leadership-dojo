// Curated video clip library with semantic matching
// Each entry is a specific segment of a longer video — the "30-second insight"

export interface VideoClip {
    id: string;
    title: string;
    description: string;
    embedId: string;
    startSeconds: number;       // YouTube ?start= parameter
    clipDuration: string;       // Display label like "45s clip"
    fullDuration: string;       // Full video duration for context
    speaker: string;
    category: 'meetings' | 'leadership' | 'domain' | 'communication' | 'strategy' | 'execution';
    tags: string[];             // For display
    keywords: string[];         // For semantic matching — lowercase
}

// ═══════════════════════════════════════════════════════
// CLIP LIBRARY
// ═══════════════════════════════════════════════════════

export const VIDEO_LIBRARY: VideoClip[] = [
    // ── MEETINGS ──
    {
        id: 'grove-meetings-1',
        title: "Why most meetings lack an outcome",
        description: "Andy Grove's principle: every meeting must produce a decision or action.",
        embedId: "jKgEjDkHgbk", speaker: "Andy Grove / Intel Philosophy",
        startSeconds: 42, clipDuration: "45s clip", fullDuration: "8 min",
        category: 'meetings', tags: ['Meetings', 'Outcomes'],
        keywords: ['meeting', 'outcome', 'decision', 'action', 'agenda', 'productive', 'effective', 'result', 'output', 'accountability']
    },
    {
        id: 'sinek-why-meetings',
        title: "Start every meeting with WHY",
        description: "If people don't know why they're in the room, they won't contribute.",
        embedId: "qp0HIF3SfI4", speaker: "Simon Sinek",
        startSeconds: 105, clipDuration: "40s clip", fullDuration: "18 min",
        category: 'meetings', tags: ['Purpose', 'Meetings'],
        keywords: ['why', 'purpose', 'inspire', 'motivation', 'alignment', 'vision', 'clarity', 'direction', 'meeting', 'kickoff']
    },
    {
        id: 'treasure-listening',
        title: "How to make people actually listen",
        description: "Julian Treasure's 4 habits that command attention in any room.",
        embedId: "eIho2S0ZahI", speaker: "Julian Treasure",
        startSeconds: 180, clipDuration: "50s clip", fullDuration: "10 min",
        category: 'meetings', tags: ['Communication'],
        keywords: ['listen', 'attention', 'speaking', 'presentation', 'audience', 'persuasion', 'influence', 'presenting', 'board', 'pitch']
    },
    {
        id: 'bezos-memo',
        title: "Why Amazon banned PowerPoint in meetings",
        description: "Bezos on 6-page memos: clarity of thought over polish of slides.",
        embedId: "GltlJO56S1g", speaker: "Jeff Bezos",
        startSeconds: 30, clipDuration: "40s clip", fullDuration: "5 min",
        category: 'meetings', tags: ['Preparation', 'Clarity'],
        keywords: ['preparation', 'memo', 'clarity', 'thinking', 'slides', 'presentation', 'board', 'executive', 'decision', 'narrative']
    },

    // ── LEADERSHIP ──
    {
        id: 'brown-vulnerability',
        title: "The courage to have hard conversations",
        description: "Brene Brown: vulnerability isn't weakness — it's your greatest leadership asset.",
        embedId: "iCvmsMzlF7o", speaker: "Brene Brown",
        startSeconds: 480, clipDuration: "45s clip", fullDuration: "20 min",
        category: 'leadership', tags: ['Leadership', 'Trust'],
        keywords: ['vulnerability', 'trust', 'courage', 'feedback', 'difficult', 'conversation', 'conflict', 'honesty', 'relationship', 'team']
    },
    {
        id: 'frei-trust',
        title: "The 3 pillars that make people trust you",
        description: "Frances Frei: authenticity, logic, and empathy — which one is your wobble?",
        embedId: "pVeq-0dIqpk", speaker: "Frances Frei",
        startSeconds: 240, clipDuration: "50s clip", fullDuration: "15 min",
        category: 'leadership', tags: ['Trust', 'Team'],
        keywords: ['trust', 'authenticity', 'empathy', 'logic', 'team', 'stakeholder', 'relationship', 'credibility', 'respect', 'influence']
    },
    {
        id: 'pink-motivation',
        title: "What actually drives high performers",
        description: "Dan Pink: autonomy, mastery, purpose — not carrots and sticks.",
        embedId: "rrkrvAUbU9Y", speaker: "Dan Pink",
        startSeconds: 420, clipDuration: "45s clip", fullDuration: "18 min",
        category: 'leadership', tags: ['Motivation', 'Team'],
        keywords: ['motivation', 'performance', 'autonomy', 'mastery', 'purpose', 'team', 'engagement', 'retention', 'talent', 'culture', 'hire']
    },
    {
        id: 'edmondson-safety',
        title: "Psychological safety in high-performing teams",
        description: "Amy Edmondson: teams that feel safe to fail outperform everyone else.",
        embedId: "LhoLuui9gX8", speaker: "Amy Edmondson",
        startSeconds: 120, clipDuration: "45s clip", fullDuration: "12 min",
        category: 'leadership', tags: ['Team', 'Culture'],
        keywords: ['safety', 'team', 'culture', 'failure', 'innovation', 'risk', 'experiment', 'learning', 'feedback', 'growth', 'performance']
    },
    {
        id: 'catmull-creativity',
        title: "How Pixar protects creativity from hierarchy",
        description: "Ed Catmull: the Braintrust — honest feedback without authority.",
        embedId: "k2h2lvhzMDc", speaker: "Ed Catmull",
        startSeconds: 60, clipDuration: "40s clip", fullDuration: "15 min",
        category: 'leadership', tags: ['Innovation', 'Feedback'],
        keywords: ['creativity', 'innovation', 'feedback', 'hierarchy', 'product', 'design', 'quality', 'iteration', 'honest', 'review']
    },

    // ── STRATEGY & EXECUTION ──
    {
        id: 'doerr-okrs',
        title: "How Google uses OKRs to 10x results",
        description: "John Doerr: measure what matters — the system behind Google, Intel, and Bono.",
        embedId: "L4N1q4RNi9I", speaker: "John Doerr",
        startSeconds: 180, clipDuration: "50s clip", fullDuration: "12 min",
        category: 'execution', tags: ['Goals', 'OKRs'],
        keywords: ['okr', 'goal', 'objective', 'key result', 'target', 'measure', 'kpi', 'metric', 'progress', 'quarterly', 'planning', 'strategy']
    },
    {
        id: 'christensen-disruption',
        title: "Why great companies get disrupted",
        description: "Clayton Christensen: the innovator's dilemma is a leadership problem, not a tech one.",
        embedId: "yUAtIQDllo8", speaker: "Clayton Christensen",
        startSeconds: 90, clipDuration: "45s clip", fullDuration: "20 min",
        category: 'strategy', tags: ['Strategy', 'Innovation'],
        keywords: ['disruption', 'innovation', 'strategy', 'competition', 'market', 'growth', 'product', 'customer', 'industry', 'change', 'transform']
    },
    {
        id: 'mcchrsytal-teams',
        title: "Team of teams: breaking silos at scale",
        description: "Gen. McChrystal: shared consciousness beats bureaucracy in fast-moving environments.",
        embedId: "bIFPAeEkXuA", speaker: "Gen. Stanley McChrystal",
        startSeconds: 150, clipDuration: "40s clip", fullDuration: "14 min",
        category: 'strategy', tags: ['Organization', 'Scale'],
        keywords: ['scale', 'organization', 'silo', 'cross-functional', 'alignment', 'speed', 'agility', 'communication', 'transparency', 'operational']
    },
    {
        id: 'covey-priorities',
        title: "Put first things first — the big rocks principle",
        description: "Stephen Covey: if you don't schedule your priorities, someone else will.",
        embedId: "zV3gMTOEWt8", speaker: "Stephen Covey",
        startSeconds: 45, clipDuration: "40s clip", fullDuration: "5 min",
        category: 'execution', tags: ['Priorities', 'Time'],
        keywords: ['priority', 'time', 'calendar', 'focus', 'delegation', 'important', 'urgent', 'planning', 'schedule', 'productivity', 'efficiency']
    },

    // ── COMMUNICATION & STAKEHOLDERS ──
    {
        id: 'duarte-persuasion',
        title: "Structure your message like a story",
        description: "Nancy Duarte: the shape of every great presentation — what is vs. what could be.",
        embedId: "1nYFpuc2Umk", speaker: "Nancy Duarte",
        startSeconds: 120, clipDuration: "45s clip", fullDuration: "18 min",
        category: 'communication', tags: ['Presentation', 'Storytelling'],
        keywords: ['presentation', 'story', 'narrative', 'persuasion', 'board', 'pitch', 'executive', 'communication', 'stakeholder', 'slides']
    },
    {
        id: 'grant-disagree',
        title: "How to disagree without being disagreeable",
        description: "Adam Grant: the art of productive conflict — challenge ideas, not people.",
        embedId: "CIlgTGYsMBY", speaker: "Adam Grant",
        startSeconds: 60, clipDuration: "45s clip", fullDuration: "15 min",
        category: 'communication', tags: ['Conflict', 'Negotiation'],
        keywords: ['disagree', 'conflict', 'debate', 'negotiation', 'stakeholder', 'difficult', 'conversation', 'pushback', 'alignment', 'consensus']
    },
    {
        id: 'sandberg-feedback',
        title: "Radical candor: caring personally while challenging directly",
        description: "Kim Scott: the framework for feedback that actually changes behavior.",
        embedId: "f-Tcr0T9Tyw", speaker: "Kim Scott",
        startSeconds: 90, clipDuration: "50s clip", fullDuration: "12 min",
        category: 'leadership', tags: ['Feedback', '1:1s'],
        keywords: ['feedback', 'candor', 'direct report', '1:1', 'one-on-one', 'performance', 'review', 'coaching', 'development', 'growth']
    },

    // ── DOMAIN-ADJACENT (these match via org/industry context) ──
    {
        id: 'horowitz-hard',
        title: "The hard thing about hard things",
        description: "Ben Horowitz: there's no recipe for leadership — just making the least-bad decision.",
        embedId: "F2e3RqL4VWs", speaker: "Ben Horowitz",
        startSeconds: 180, clipDuration: "45s clip", fullDuration: "20 min",
        category: 'leadership', tags: ['Decision Making'],
        keywords: ['hard', 'decision', 'ceo', 'startup', 'scaling', 'crisis', 'layoff', 'pivot', 'fundraise', 'board', 'investor', 'growth']
    },
    {
        id: 'dalio-principles',
        title: "Radical transparency: how Bridgewater makes decisions",
        description: "Ray Dalio: meritocracy of ideas beats hierarchy of authority.",
        embedId: "HXbsVbFAczg", speaker: "Ray Dalio",
        startSeconds: 120, clipDuration: "40s clip", fullDuration: "15 min",
        category: 'strategy', tags: ['Decision Making', 'Culture'],
        keywords: ['transparency', 'decision', 'principles', 'data', 'culture', 'merit', 'debate', 'truth', 'finance', 'investment', 'risk']
    },
    {
        id: 'nadella-empathy',
        title: "Satya Nadella on empathy as a business strategy",
        description: "How Microsoft's cultural reset started with one leadership principle.",
        embedId: "5PBwBjVEI1U", speaker: "Satya Nadella",
        startSeconds: 60, clipDuration: "40s clip", fullDuration: "10 min",
        category: 'leadership', tags: ['Culture', 'Transformation'],
        keywords: ['empathy', 'culture', 'transformation', 'technology', 'cloud', 'enterprise', 'customer', 'innovation', 'growth mindset', 'microsoft']
    },
];

// ═══════════════════════════════════════════════════════
// MATCHING ENGINE
// ═══════════════════════════════════════════════════════

interface UserContext {
    meetingTitles: string[];
    kpiNames: string[];
    patternInsights: string[];
    orgContext: any;            // { organization: { name, industry, ... }, landscape: ... }
    jobTitle: string | null;
    upcomingCategories: string[];   // e.g. ['NEEDLE_MOVER', 'OPERATIONAL']
    hasPresentation: boolean;
    has1on1: boolean;
    recentInsights: string[];
}

function tokenize(text: string): string[] {
    return text.toLowerCase().replace(/[^a-z0-9\s]/g, ' ').split(/\s+/).filter(w => w.length > 2);
}

function scoreClip(clip: VideoClip, context: UserContext): number {
    let score = 0;
    const contextTokens = new Set<string>();

    // Build token set from all user context
    for (const title of context.meetingTitles) tokenize(title).forEach(t => contextTokens.add(t));
    for (const kpi of context.kpiNames) tokenize(kpi).forEach(t => contextTokens.add(t));
    for (const ins of context.patternInsights) tokenize(ins).forEach(t => contextTokens.add(t));
    for (const ins of context.recentInsights) tokenize(ins).forEach(t => contextTokens.add(t));
    if (context.jobTitle) tokenize(context.jobTitle).forEach(t => contextTokens.add(t));

    // Org context tokens
    if (context.orgContext?.organization) {
        const org = context.orgContext.organization;
        if (typeof org === 'object') {
            for (const val of Object.values(org)) {
                if (typeof val === 'string') tokenize(val).forEach(t => contextTokens.add(t));
            }
        }
    }
    if (context.orgContext?.landscape) {
        const land = context.orgContext.landscape;
        if (typeof land === 'string') tokenize(land).forEach(t => contextTokens.add(t));
        else if (typeof land === 'object') {
            for (const val of Object.values(land as Record<string, unknown>)) {
                if (typeof val === 'string') tokenize(val).forEach(t => contextTokens.add(t));
            }
        }
    }

    // Score keyword overlap
    for (const kw of clip.keywords) {
        const kwTokens = tokenize(kw);
        for (const t of kwTokens) {
            if (contextTokens.has(t)) score += 2;
        }
    }

    // Bonus for specific context signals
    if (context.hasPresentation && clip.keywords.some(k => ['presentation', 'board', 'pitch', 'slides', 'presenting'].includes(k))) score += 5;
    if (context.has1on1 && clip.keywords.some(k => ['1:1', 'one-on-one', 'feedback', 'direct report', 'coaching'].includes(k))) score += 5;
    if (context.upcomingCategories.includes('NEEDLE_MOVER') && clip.keywords.some(k => ['decision', 'outcome', 'strategy'].includes(k))) score += 3;

    return score;
}

export interface MatchedVideos {
    meetingClip: VideoClip;
    leadershipClip: VideoClip;
    domainClip: VideoClip;
}

export function matchVideosToContext(context: UserContext): MatchedVideos {
    const scored = VIDEO_LIBRARY.map(clip => ({ clip, score: scoreClip(clip, context) }));

    // Pick best from each category bucket
    const meetingCats = ['meetings', 'communication'] as const;
    const leadershipCats = ['leadership'] as const;
    const domainCats = ['strategy', 'execution', 'domain'] as const;

    const pickBest = (categories: readonly string[], exclude: Set<string>): VideoClip => {
        const candidates = scored
            .filter(s => categories.includes(s.clip.category) && !exclude.has(s.clip.id))
            .sort((a, b) => b.score - a.score);

        if (candidates.length > 0 && candidates[0].score > 0) return candidates[0].clip;

        // Fallback: pick by day-of-year rotation from this category
        const pool = VIDEO_LIBRARY.filter(c => categories.includes(c.category) && !exclude.has(c.id));
        const dayOfYear = Math.floor((Date.now() - new Date(new Date().getFullYear(), 0, 0).getTime()) / 86400000);
        return pool[dayOfYear % pool.length] || VIDEO_LIBRARY[0];
    };

    const used = new Set<string>();

    const meetingClip = pickBest(meetingCats, used);
    used.add(meetingClip.id);

    const leadershipClip = pickBest(leadershipCats, used);
    used.add(leadershipClip.id);

    const domainClip = pickBest(domainCats, used);

    return { meetingClip, leadershipClip, domainClip };
}
