/**
 * Parses chat message content to extract artifact code fences,
 * and auto-detects structured markdown that should be rendered in the side panel.
 *
 * Two detection paths:
 * 1. Explicit fences: ```artifact:meeting-notes ... ```
 * 2. Auto-detection: long structured markdown with headings, lists, and known patterns
 */

export interface Artifact {
    id: string;
    type: string;       // meeting-notes, stakeholder-brief, email-summary, prep, report, etc.
    title: string;      // Extracted from first heading or generated from type
    content: string;    // Raw markdown content inside the fence
    autoDetected?: boolean; // True if detected via heuristics, not explicit fence
}

export interface ParsedMessage {
    /** Message content with artifact fences removed (for inline chat rendering) */
    inlineContent: string;
    /** Extracted artifacts for side panel rendering */
    artifacts: Artifact[];
}

const ARTIFACT_FENCE_REGEX = /```artifact:([a-z0-9-]+)\n([\s\S]*?)```/g;

const TYPE_LABELS: Record<string, string> = {
    'meeting-notes': 'Meeting Notes',
    'stakeholder-brief': 'Stakeholder Brief',
    'email-summary': 'Email Summary',
    'prep': 'Meeting Prep',
    'report': 'Report',
    'action-items': 'Action Items',
    'goals': 'Goals Progress',
    'weekly-snapshot': 'Weekly Snapshot',
    'coaching': 'Coaching Observation',
};

// Patterns that hint at specific artifact types (case-insensitive)
const TYPE_PATTERNS: Array<{ pattern: RegExp; type: string }> = [
    { pattern: /meeting\s*notes|notes\s*from/i, type: 'meeting-notes' },
    { pattern: /action\s*items|to[\s-]*do|tasks|commitments/i, type: 'action-items' },
    { pattern: /meeting\s*prep|preparation|briefing|brief\s*for/i, type: 'prep' },
    { pattern: /stakeholder|profile|person.*brief/i, type: 'stakeholder-brief' },
    { pattern: /email\s*summary|email.*recap|thread.*summary/i, type: 'email-summary' },
    { pattern: /goal|progress|kpi|metric/i, type: 'goals' },
    { pattern: /weekly|snapshot|week\s*in\s*review/i, type: 'weekly-snapshot' },
    { pattern: /coach|observation|feedback|reflection/i, type: 'coaching' },
];

function extractTitle(content: string, type: string): string {
    const headingMatch = content.match(/^#\s+(.+)$/m);
    if (headingMatch) {
        return headingMatch[1].trim();
    }
    return TYPE_LABELS[type] || type.replace(/-/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function inferType(content: string): string {
    for (const { pattern, type } of TYPE_PATTERNS) {
        if (pattern.test(content)) return type;
    }
    return 'report';
}

let artifactCounter = 0;

export function parseMessageArtifacts(content: string): ParsedMessage {
    const artifacts: Artifact[] = [];

    const inlineContent = content.replace(ARTIFACT_FENCE_REGEX, (_, type: string, body: string) => {
        const trimmedBody = body.trim();
        artifacts.push({
            id: `artifact-${Date.now()}-${++artifactCounter}`,
            type,
            title: extractTitle(trimmedBody, type),
            content: trimmedBody,
        });
        return '';
    }).trim();

    return { inlineContent, artifacts };
}

/**
 * Quick check — does this message contain any artifact fences?
 */
export function hasArtifacts(content: string): boolean {
    return /```artifact:[a-z0-9-]+\n/.test(content);
}

/**
 * Auto-detect structured markdown that should be offered as a panel artifact.
 * Returns null if the content doesn't qualify.
 *
 * Criteria: 15+ lines, has headings, has lists or structured sections.
 */
export function detectStructuredContent(content: string): Artifact | null {
    const lines = content.split('\n');

    // Must be substantial
    if (lines.length < 15) return null;

    const headingCount = lines.filter(l => /^#{1,3}\s+/.test(l)).length;
    const listItemCount = lines.filter(l => /^\s*[-*•]\s+|^\s*\d+[.)]\s+/.test(l)).length;
    const hasTable = /\|.*\|.*\|/.test(content);

    // Need at least 2 headings or 1 heading + 4 list items or a table with heading
    const isStructured =
        headingCount >= 2 ||
        (headingCount >= 1 && listItemCount >= 4) ||
        (headingCount >= 1 && hasTable);

    if (!isStructured) return null;

    const type = inferType(content);

    return {
        id: `artifact-${Date.now()}-${++artifactCounter}`,
        type,
        title: extractTitle(content, type),
        content,
        autoDetected: true,
    };
}
