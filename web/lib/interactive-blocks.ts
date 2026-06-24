/**
 * Interactive Blocks — structured UI elements embedded in chat messages.
 *
 * The worker embeds interactive config as <!--interactive:JSON--> at the
 * end of message content. The frontend parses it and renders the appropriate UI.
 *
 * Block types:
 * - choice_cards: Multiple items, each with a dropdown. Batch resolve. (identity resolution)
 * - buttons: Inline action buttons. Single click. (yes/no, landed/partial/missed)
 * - select: Single dropdown with confirm. (pick one from many)
 * - rating: Star rating or scale. (call feedback)
 */

// ═══════════════════════════════════════════════════════
// TYPES
// ═══════════════════════════════════════════════════════

export interface ChoiceCardItem {
    id: string;
    title: string;
    subtitle?: string;
    options: Array<{ label: string; value: string }>;
    defaultValue?: string;
}

export interface ButtonItem {
    label: string;
    value: string;
    style?: 'primary' | 'secondary' | 'danger' | 'success';
}

export interface SelectBlock {
    prompt: string;
    options: Array<{ label: string; value: string }>;
}

export interface RatingBlock {
    prompt: string;
    max: number; // e.g. 5 for 5-star
}

export type InteractiveBlock =
    | { type: 'choice_cards'; actionId: string; items: ChoiceCardItem[] }
    | { type: 'buttons'; actionId: string; items: ButtonItem[] }
    | { type: 'select'; actionId: string; config: SelectBlock }
    | { type: 'rating'; actionId: string; config: RatingBlock };

export interface InteractivePayload {
    blocks: InteractiveBlock[];
}

// ═══════════════════════════════════════════════════════
// PARSER
// ═══════════════════════════════════════════════════════

const INTERACTIVE_REGEX = /<!--interactive:([\s\S]*?)-->/;

/**
 * Extract interactive payload from message content.
 * Returns the clean content (without the tag) and the parsed payload.
 */
export function parseInteractiveBlocks(content: string): {
    cleanContent: string;
    interactive: InteractivePayload | null;
} {
    const match = content.match(INTERACTIVE_REGEX);
    if (!match) {
        return { cleanContent: content, interactive: null };
    }

    const cleanContent = content.replace(INTERACTIVE_REGEX, '').trim();

    try {
        const payload = JSON.parse(match[1]) as InteractivePayload;
        return { cleanContent, interactive: payload };
    } catch {
        return { cleanContent, interactive: null };
    }
}

/**
 * Check if a message has interactive blocks.
 */
export function hasInteractiveBlocks(content: string): boolean {
    return INTERACTIVE_REGEX.test(content);
}

// ═══════════════════════════════════════════════════════
// BUILDER (for worker-side)
// ═══════════════════════════════════════════════════════

/**
 * Embed interactive payload into message content.
 * Used by agents when constructing messages with UI elements.
 */
export function embedInteractiveBlocks(content: string, payload: InteractivePayload): string {
    return `${content}\n\n<!--interactive:${JSON.stringify(payload)}-->`;
}
