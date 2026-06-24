/**
 * Profile Classifier
 *
 * Classifies stakeholder profiles as person/system/resource/group
 * using structural signals instead of hardcoded regex lists.
 */

export type ProfileClass = 'person' | 'system' | 'resource' | 'group';

interface ClassifiableProfile {
    name: string;
    email: string | null;
    interactionCount: number;
}

/**
 * Classify a profile by structural signals.
 *
 * Priority order:
 * 1. Deterministic rules (calendar resources, noreply patterns)
 * 2. Structural heuristics (name shape, email patterns)
 * 3. Behavioral signal (interaction count overrides weak structural signals)
 */
export function classifyProfile(p: ClassifiableProfile): ProfileClass {
    const nameLower = p.name.toLowerCase().trim();
    const email = (p.email || '').toLowerCase();
    const localPart = email ? email.split('@')[0] : '';
    const domain = email ? email.split('@')[1] || '' : '';

    // ── Deterministic: calendar resources ──
    if (domain.includes('resource.calendar.google.com')) return 'resource';
    if (/\b(room|conference|board\s*room|meeting\s*room|projector|av\s*system)\b/.test(nameLower)) return 'resource';

    // ── Deterministic: system/automated emails ──
    if (isSystemEmail(localPart)) return 'system';

    // ── Structural: generic single-word names with no email or no interactions ──
    if (isGenericWord(nameLower) && p.interactionCount === 0) return 'system';

    // ── Behavioral override: if someone actually communicates with this contact, it's a person ──
    if (p.interactionCount > 0) return 'person';

    // ── Structural: multi-word name likely a person ──
    if (nameLower.includes(' ') && nameLower.length > 5) return 'person';

    // ── Structural: name has a dot (e.g., "j.smith") likely a person ──
    if (nameLower.includes('.') && nameLower.length > 3) return 'person';

    // ── Structural: single short word with no email — probably not a person ──
    if (!email && !nameLower.includes(' ') && nameLower.length <= 4) return 'system';

    // ── Structural: name matches email local part exactly and is very short ──
    if (localPart && nameLower === localPart && nameLower.length <= 3) return 'system';

    // ── Default: if we have an email, lean toward person ──
    if (email) return 'person';

    return 'system';
}

/**
 * Check if an email local part looks like a system/automated address.
 * Uses pattern categories instead of a flat list.
 */
function isSystemEmail(localPart: string): boolean {
    if (!localPart) return false;

    // Exact matches for common system prefixes
    const SYSTEM_EXACT = new Set([
        'noreply', 'no-reply', 'donotreply', 'do-not-reply',
        'mailer-daemon', 'postmaster', 'bounce', 'bounces',
    ]);
    if (SYSTEM_EXACT.has(localPart)) return true;

    // Functional mailboxes (department/role, not a person)
    const FUNCTIONAL_EXACT = new Set([
        'info', 'support', 'admin', 'help', 'hello', 'contact',
        'billing', 'sales', 'marketing', 'hr', 'legal', 'ops',
        'engineering', 'devops', 'security', 'compliance',
        'feedback', 'care', 'service', 'accounts',
        'team', 'staff', 'office', 'reception',
    ]);
    if (FUNCTIONAL_EXACT.has(localPart)) return true;

    // Notification/digest patterns (substring match)
    const NOTIFICATION_PATTERNS = [
        'notification', 'newsletter', 'digest', 'updates',
        'alert', 'calendar-notification', 'news',
    ];
    if (NOTIFICATION_PATTERNS.some(pat => localPart.includes(pat))) return true;

    return false;
}

/**
 * Check if a name is a generic/functional word unlikely to be a person's name.
 */
function isGenericWord(name: string): boolean {
    const GENERIC = new Set([
        'mail', 'email', 'feedback', 'care', 'product', 'design',
        'chairman', 'support', 'admin', 'info', 'help', 'team',
        'hr', 'ops', 'sales', 'marketing', 'engineering',
        'service', 'billing', 'accounts', 'notifications',
        'alert', 'news', 'updates', 'hello', 'contact',
    ]);
    return GENERIC.has(name);
}

/**
 * Filter an array of profiles to only real people.
 */
export function filterToPersons<T extends ClassifiableProfile>(profiles: T[]): T[] {
    return profiles.filter(p => classifyProfile(p) === 'person');
}
