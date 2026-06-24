/**
 * Stakeholder Enrichment Agent
 *
 * Discovers unenriched meeting attendees and enriches their profiles
 * using web search + LLM analysis.
 *
 * Pipeline:
 * 1. Find meeting attendees without full StakeholderProfiles
 * 2. For each, search the web for their info (Google Custom Search or fallback)
 * 3. Feed search results to LLM for structured extraction
 * 4. Create/update StakeholderProfile with enriched data
 *
 * Runs daily after calendar sync. Also triggerable on-demand.
 */

import { prisma } from '../lib/prisma';
import { getUserLLMConfig, generateText, withLLMRetry } from '../lib/user-llm';
import { withAgentRun } from '../lib/agent-run';
import { getPastCorrections, markCorrectionApplied } from '../lib/correction-learning';

// ============================================================================
// TYPES
// ============================================================================

interface EnrichmentResult {
    discovered: number;
    enriched: number;
    skipped: number;
    errors: number;
}

interface AttendeeInfo {
    email: string;
    name: string;
    meetingTitles: string[];
    stakeholderProfileId: string | null;
    needsEnrichment: boolean;
}

interface LLMEnrichmentOutput {
    title: string | null;
    company: string | null;
    companyDescription: string | null;
    relationshipType: string | null;
    powerLevel: string | null;
    influenceRole: string | null;
    importance: number | null;
    linkedinUrl: string | null;
    summary: string | null;
}

// Max enrichments per run to control API costs
const MAX_ENRICHMENTS_PER_RUN = 10;
// Re-enrich threshold (30 days)
const RE_ENRICH_THRESHOLD_MS = 30 * 24 * 60 * 60 * 1000;
// Delay between web searches to respect rate limits
const SEARCH_DELAY_MS = 1000;

// ============================================================================
// MAIN ENTRY POINT
// ============================================================================

/**
 * Enrich stakeholder profiles for a user by discovering unenriched meeting
 * attendees, searching the web for their info, and using LLM to extract
 * structured data.
 */
export async function enrichStakeholders(userId: string): Promise<EnrichmentResult> {
    return withAgentRun('stakeholder-enrichment', userId, 'cron', async (ctx) => {
        const result = await _enrichStakeholders(userId, ctx);
        ctx.itemsProcessed = result.enriched;
        ctx.itemsSkipped = result.skipped;
        return result;
    });
}

async function _enrichStakeholders(userId: string, ctx?: { logs: string[] }): Promise<EnrichmentResult> {
    console.log(`[StakeholderEnrichment] Starting for user ${userId.substring(0, 8)}...`);

    const result: EnrichmentResult = { discovered: 0, enriched: 0, skipped: 0, errors: 0 };

    // 1. Get LLM config — bail if none available
    const llmConfig = await getUserLLMConfig(userId);
    if (llmConfig.provider === 'none' || !llmConfig.apiKey) {
        console.warn(`[StakeholderEnrichment] WARNING: No LLM configured for user ${userId.substring(0, 8)} — this should not happen with platform key`);
        return result;
    }

    // 2. Get user context for relationship inference
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: {
            email: true,
            name: true,
            jobTitle: true,
            company: true,
        },
    });
    if (!user) {
        console.log(`[StakeholderEnrichment] User not found — skipping`);
        return result;
    }

    // 3. Discover unenriched attendees
    const attendees = await discoverUnenrichedAttendees(userId);
    result.discovered = attendees.length;
    console.log(`[StakeholderEnrichment] Discovered ${attendees.length} unenriched attendees`);

    if (attendees.length === 0) {
        console.log(`[StakeholderEnrichment] No attendees to enrich — done`);
        return result;
    }

    // 4. Enrich each attendee (limited per run)
    const toEnrich = attendees.slice(0, MAX_ENRICHMENTS_PER_RUN);
    const userDomain = user.email.split('@')[1] || '';

    for (const attendee of toEnrich) {
        try {
            const enriched = await enrichSingleAttendee(
                userId,
                attendee,
                userDomain,
                user,
                llmConfig
            );
            if (enriched) {
                result.enriched++;
            } else {
                result.skipped++;
            }
        } catch (err: any) {
            console.error(`[StakeholderEnrichment] Error enriching ${attendee.email}: ${err.message}`);
            result.errors++;
        }
    }

    if (attendees.length > MAX_ENRICHMENTS_PER_RUN) {
        result.skipped += attendees.length - MAX_ENRICHMENTS_PER_RUN;
    }

    console.log(`[StakeholderEnrichment] Complete: ${result.enriched} enriched, ${result.skipped} skipped, ${result.errors} errors`);
    return result;
}

// ============================================================================
// DISCOVERY
// ============================================================================

/**
 * Find meeting attendees who need enrichment:
 * - Don't have a StakeholderProfile at all
 * - Have a profile but enrichedAt is null
 * - Have a profile but enrichedAt is older than 30 days
 */
async function discoverUnenrichedAttendees(userId: string): Promise<AttendeeInfo[]> {
    // Get all meetings for this user
    const meetings = await prisma.meetingSyncRecord.findMany({
        where: { userId },
        select: {
            title: true,
            participants: true,
            attendees: true,
        },
        orderBy: { startTime: 'desc' },
        take: 200, // Limit to recent meetings
    });

    // Collect unique attendee emails with their meeting titles
    const attendeeMap = new Map<string, { name: string; meetingTitles: Set<string> }>();

    for (const meeting of meetings) {
        // Parse attendees JSON for name info
        const attendeesJson = (meeting.attendees as any[]) || [];
        const participantEmails = meeting.participants || [];

        for (const email of participantEmails) {
            const normalizedEmail = email.toLowerCase().trim();
            if (!normalizedEmail || !normalizedEmail.includes('@')) continue;

            const existing = attendeeMap.get(normalizedEmail);
            if (existing) {
                existing.meetingTitles.add(meeting.title);
            } else {
                // Try to find name from attendees JSON
                const attendeeInfo = attendeesJson.find(
                    (a: any) => a.email?.toLowerCase() === normalizedEmail
                );
                const name = attendeeInfo?.name || attendeeInfo?.displayName || normalizedEmail.split('@')[0];

                attendeeMap.set(normalizedEmail, {
                    name: name,
                    meetingTitles: new Set([meeting.title]),
                });
            }
        }
    }

    // Get the user's own email to exclude
    const user = await prisma.user.findUnique({
        where: { id: userId },
        select: { email: true },
    });
    const userEmail = user?.email?.toLowerCase() || '';

    // Get existing StakeholderProfiles
    const existingProfiles = await prisma.stakeholderProfile.findMany({
        where: { userId },
        select: {
            id: true,
            email: true,
            enrichedAt: true,
        },
    });

    const profileMap = new Map<string, { id: string; enrichedAt: Date | null }>();
    for (const profile of existingProfiles) {
        if (profile.email) {
            profileMap.set(profile.email.toLowerCase(), {
                id: profile.id,
                enrichedAt: profile.enrichedAt,
            });
        }
    }

    // Filter to unenriched attendees
    const now = Date.now();
    const unenriched: AttendeeInfo[] = [];

    for (const [email, info] of attendeeMap) {
        // Skip user's own email
        if (email === userEmail) continue;

        const profile = profileMap.get(email);

        let needsEnrichment = false;
        if (!profile) {
            // No profile at all
            needsEnrichment = true;
        } else if (!profile.enrichedAt) {
            // Profile exists but never enriched
            needsEnrichment = true;
        } else if (now - profile.enrichedAt.getTime() > RE_ENRICH_THRESHOLD_MS) {
            // Profile enriched but stale (>30 days)
            needsEnrichment = true;
        }

        if (needsEnrichment) {
            unenriched.push({
                email,
                name: info.name,
                meetingTitles: Array.from(info.meetingTitles).slice(0, 10),
                stakeholderProfileId: profile?.id || null,
                needsEnrichment: true,
            });
        }
    }

    // Sort by number of meetings (most active first)
    unenriched.sort((a, b) => b.meetingTitles.length - a.meetingTitles.length);

    return unenriched;
}

// ============================================================================
// WEB SEARCH
// ============================================================================

/**
 * Waterfall web search: Tavily (free, primary) → Perplexity Sonar (paid, fallback).
 * Returns search snippets for LLM enrichment.
 */
async function searchWeb(query: string): Promise<string[]> {
    // Try Tavily first (free tier: 1000/month)
    const tavilyResults = await searchTavily(query);
    if (tavilyResults.length > 0) return tavilyResults;

    // Fallback to Perplexity Sonar (paid, better quality)
    const perplexityResults = await searchPerplexity(query);
    if (perplexityResults.length > 0) return perplexityResults;

    // Final fallback: Google Custom Search (legacy, if still configured)
    return searchGoogle(query);
}

async function searchTavily(query: string): Promise<string[]> {
    const apiKey = process.env.TAVILY_API_KEY;
    if (!apiKey) return [];

    try {
        const res = await fetch('https://api.tavily.com/search', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                api_key: apiKey,
                query,
                max_results: 5,
                search_depth: 'basic',
                include_answer: false,
            }),
        });

        if (!res.ok) {
            console.warn(`[StakeholderEnrichment] Tavily returned ${res.status}`);
            return [];
        }

        const data = await res.json() as any;
        return (data.results || []).map((r: any) =>
            `${r.title}\n${r.content}\n${r.url}`
        );
    } catch (e: any) {
        console.error(`[StakeholderEnrichment] Tavily search failed: ${e.message}`);
        return [];
    }
}

async function searchPerplexity(query: string): Promise<string[]> {
    const apiKey = process.env.PERPLEXITY_API_KEY;
    if (!apiKey) return [];

    try {
        const res = await fetch('https://api.perplexity.ai/chat/completions', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${apiKey}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify({
                model: 'sonar',
                messages: [
                    { role: 'user', content: query }
                ],
                max_tokens: 500,
            }),
        });

        if (!res.ok) {
            console.warn(`[StakeholderEnrichment] Perplexity returned ${res.status}`);
            return [];
        }

        const data = await res.json() as any;
        const answer = data.choices?.[0]?.message?.content || '';
        const citations = (data.citations || []).map((url: string) => `Source: ${url}`);
        return answer ? [answer, ...citations] : [];
    } catch (e: any) {
        console.error(`[StakeholderEnrichment] Perplexity search failed: ${e.message}`);
        return [];
    }
}

/**
 * Legacy Google Custom Search fallback.
 * Returns empty array if API keys are not configured.
 */
async function searchGoogle(query: string): Promise<string[]> {
    const apiKey = process.env.GOOGLE_SEARCH_API_KEY;
    const cx = process.env.GOOGLE_SEARCH_CX;

    if (!apiKey || !cx) {
        return [];
    }

    try {
        const url = `https://www.googleapis.com/customsearch/v1?key=${apiKey}&cx=${cx}&q=${encodeURIComponent(query)}&num=5`;
        const res = await fetch(url);
        if (!res.ok) {
            console.warn(`[StakeholderEnrichment] Google Search API returned ${res.status}`);
            return [];
        }
        const data = await res.json();
        return ((data as any).items || []).map((item: any) =>
            `${item.title}\n${item.snippet}\n${item.link}`
        );
    } catch (e: any) {
        console.error(`[StakeholderEnrichment] Google search failed: ${e.message}`);
        return [];
    }
}

/**
 * Check if any web search provider is configured.
 */
function isWebSearchAvailable(): boolean {
    return !!(process.env.TAVILY_API_KEY || process.env.PERPLEXITY_API_KEY ||
              (process.env.GOOGLE_SEARCH_API_KEY && process.env.GOOGLE_SEARCH_CX));
}

/**
 * Fetch basic company info from domain using free public signals.
 * Uses DNS-based heuristics and domain info — no API key required.
 */
async function getDomainContext(domain: string): Promise<string> {
    if (!domain || domain.includes('gmail') || domain.includes('yahoo') || domain.includes('hotmail') || domain.includes('outlook')) {
        return 'Personal email domain — no company info available.';
    }

    try {
        // Fetch the homepage to get company name from title/meta
        const controller = new AbortController();
        const timeout = setTimeout(() => controller.abort(), 5000);
        const res = await fetch(`https://${domain}`, {
            signal: controller.signal,
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; MiraBot/1.0)' },
            redirect: 'follow',
        });
        clearTimeout(timeout);

        if (!res.ok) return `Domain ${domain} exists but returned ${res.status}.`;

        const html = await res.text();
        // Extract title
        const titleMatch = html.match(/<title[^>]*>([^<]+)<\/title>/i);
        const title = titleMatch?.[1]?.trim() || '';
        // Extract meta description
        const metaMatch = html.match(/<meta[^>]*name=["']description["'][^>]*content=["']([^"']+)["']/i);
        const description = metaMatch?.[1]?.trim() || '';

        const parts = [];
        if (title) parts.push(`Website title: "${title}"`);
        if (description) parts.push(`Description: "${description}"`);
        parts.push(`Domain: ${domain}`);
        return parts.join('\n') || `Domain: ${domain}`;
    } catch {
        return `Domain: ${domain} (could not fetch website).`;
    }
}

// ============================================================================
// ENRICHMENT PER PERSON
// ============================================================================

async function enrichSingleAttendee(
    userId: string,
    attendee: AttendeeInfo,
    userDomain: string,
    user: { email: string; name: string | null; jobTitle: string | null; company: string | null },
    llmConfig: any
): Promise<boolean> {
    const domain = attendee.email.split('@')[1] || '';
    const isInternal = domain === userDomain;

    // Collect search results if web search is available
    let searchSnippets: string[] = [];
    const useWebSearch = isWebSearchAvailable();

    if (useWebSearch) {
        // Search for the person — richer query for Tavily/Perplexity
        const personQuery = `"${attendee.name}" "${domain}" LinkedIn profile role title`;
        const personResults = await searchWeb(personQuery);
        searchSnippets.push(...personResults);

        // Brief delay between searches
        await new Promise(resolve => setTimeout(resolve, SEARCH_DELAY_MS));

        // Search for the company (only for external contacts)
        if (!isInternal) {
            const companyQuery = `"${domain}" about company`;
            const companyResults = await searchWeb(companyQuery);
            searchSnippets.push(...companyResults);

            await new Promise(resolve => setTimeout(resolve, SEARCH_DELAY_MS));
        }
    } else if (!isInternal) {
        // No web search configured — try free domain context lookup
        const domainInfo = await getDomainContext(domain);
        if (domainInfo) {
            searchSnippets.push(domainInfo);
        }
    }

    // Build LLM prompt
    const prompt = buildEnrichmentPrompt(attendee, domain, isInternal, user, searchSnippets);

    // Call LLM
    let llmOutput: LLMEnrichmentOutput;
    try {
        const rawResponse = await withLLMRetry(
            () => generateText(llmConfig, prompt, { userId, maxOutputTokens: 1000 }),
            { retries: 2, label: 'StakeholderEnrichment' }
        );

        llmOutput = parseLLMResponse(rawResponse);
    } catch (err: any) {
        console.error(`[StakeholderEnrichment] LLM call failed for ${attendee.email}: ${err.message}`);
        throw err;
    }

    // Upsert the profile
    await upsertEnrichedProfile(userId, attendee, llmOutput, useWebSearch);

    return true;
}

// ============================================================================
// LLM PROMPT
// ============================================================================

function buildEnrichmentPrompt(
    attendee: AttendeeInfo,
    domain: string,
    isInternal: boolean,
    user: { email: string; name: string | null; jobTitle: string | null; company: string | null },
    searchSnippets: string[]
): string {
    const meetingList = attendee.meetingTitles.join('\n  - ');
    const searchSection = searchSnippets.length > 0
        ? `\nWeb Search Results:\n${searchSnippets.join('\n---\n')}`
        : '\nNo web search results available — infer from email, domain, and meeting context only.';

    return `You are analyzing a professional contact for a meeting intelligence system.

Person: ${attendee.name}
Email: ${attendee.email}
Company Domain: ${domain}
Is Internal (same company): ${isInternal}
Meeting Titles They Appear In:
  - ${meetingList}
User's Company: ${user.company || 'Unknown'}
User's Role: ${user.jobTitle || 'Unknown'}
${searchSection}

Based on this information, provide a JSON analysis:
{
  "title": "their likely job title or null if unknown",
  "company": "full company name or null if unknown",
  "companyDescription": "1-line description of what the company does, or null",
  "relationshipType": "one of: internal_peer, internal_report, internal_manager, internal_skip_level, customer, vendor, partner, investor, advisor, recruiter, unknown",
  "powerLevel": "one of: LOW, MEDIUM, HIGH",
  "influenceRole": "one of: DECISION_MAKER, INFLUENCER, GATEKEEPER, END_USER, UNKNOWN",
  "importance": 5,
  "linkedinUrl": "LinkedIn URL if found in search results, otherwise null",
  "summary": "1-2 sentence profile summary"
}

Rules:
- Be conservative — if unsure, use null, "unknown", and lower confidence values.
- For internal contacts (same domain), infer relationship based on meeting patterns.
- importance is a 1-10 scale based on likely impact on the user's work.
- Return ONLY valid JSON, no markdown fences, no explanation.`;
}

// ============================================================================
// RESPONSE PARSING
// ============================================================================

function parseLLMResponse(raw: string): LLMEnrichmentOutput {
    // Strip markdown fences if present
    let cleaned = raw.trim();
    if (cleaned.startsWith('```')) {
        cleaned = cleaned.replace(/^```(?:json)?\n?/, '').replace(/\n?```$/, '');
    }

    try {
        const parsed = JSON.parse(cleaned);
        return {
            title: typeof parsed.title === 'string' ? parsed.title : null,
            company: typeof parsed.company === 'string' ? parsed.company : null,
            companyDescription: typeof parsed.companyDescription === 'string' ? parsed.companyDescription : null,
            relationshipType: typeof parsed.relationshipType === 'string' ? parsed.relationshipType : null,
            powerLevel: validatePowerLevel(parsed.powerLevel),
            influenceRole: validateInfluenceRole(parsed.influenceRole),
            importance: typeof parsed.importance === 'number' ? Math.min(10, Math.max(1, parsed.importance)) : null,
            linkedinUrl: typeof parsed.linkedinUrl === 'string' && parsed.linkedinUrl.includes('linkedin') ? parsed.linkedinUrl : null,
            summary: typeof parsed.summary === 'string' ? parsed.summary : null,
        };
    } catch (e) {
        console.warn(`[StakeholderEnrichment] Failed to parse LLM response: ${cleaned.substring(0, 200)}`);
        return {
            title: null, company: null, companyDescription: null,
            relationshipType: null, powerLevel: null, influenceRole: null,
            importance: null, linkedinUrl: null, summary: null,
        };
    }
}

function validatePowerLevel(val: any): string | null {
    const valid = ['LOW', 'MEDIUM', 'HIGH'];
    if (typeof val === 'string' && valid.includes(val.toUpperCase())) {
        return val.toUpperCase();
    }
    return null;
}

function validateInfluenceRole(val: any): string | null {
    const valid = ['DECISION_MAKER', 'INFLUENCER', 'GATEKEEPER', 'END_USER', 'UNKNOWN'];
    if (typeof val === 'string' && valid.includes(val.toUpperCase())) {
        return val.toUpperCase();
    }
    return null;
}

// ============================================================================
// PROFILE UPSERT
// ============================================================================

/**
 * Create or update StakeholderProfile with enriched data.
 * Only fills in blank fields — never overwrites user-set values.
 */
async function upsertEnrichedProfile(
    userId: string,
    attendee: AttendeeInfo,
    data: LLMEnrichmentOutput,
    usedWebSearch: boolean
): Promise<void> {
    const enrichmentSource = usedWebSearch ? 'web_search' : 'llm_inference';
    const now = new Date();

    if (attendee.stakeholderProfileId) {
        // Profile exists — update only null/empty fields
        const existing = await prisma.stakeholderProfile.findUnique({
            where: { id: attendee.stakeholderProfileId },
            select: {
                role: true,
                organization: true,
                companyDescription: true,
                relationshipType: true,
                powerLevel: true,
                influenceRole: true,
                linkedinUrl: true,
            },
        });

        if (!existing) return;

        const updateData: any = {
            enrichedAt: now,
            enrichmentSource,
        };

        // Only fill in blanks — and only assign role from web search (LLM inference guesses the same generic role for everyone)
        if (!existing.role && data.title && usedWebSearch) updateData.role = data.title;
        if (!existing.organization && data.company) updateData.organization = data.company;
        if (!existing.companyDescription && data.companyDescription) updateData.companyDescription = data.companyDescription;
        if (!existing.relationshipType && data.relationshipType) updateData.relationshipType = data.relationshipType;
        if (!existing.linkedinUrl && data.linkedinUrl) updateData.linkedinUrl = data.linkedinUrl;

        // Check for user corrections before overwriting fields
        const stakeholderContext = { name: attendee.name, email: attendee.email, organization: data.company };
        const correctedFields = new Set<string>();

        for (const field of ['powerLevel', 'influenceRole', 'personaArchetype', 'communicationStyle', 'role']) {
            const corrections = await getPastCorrections(userId, 'stakeholder_profile', field, stakeholderContext);
            if (corrections.length > 0) {
                // User corrected this field — use their value, skip AI prediction
                const latest = corrections[0];
                updateData[field] = latest.userValue;
                correctedFields.add(field);
                await markCorrectionApplied(latest.id);
                console.log(`[StakeholderEnrichment] Applied user correction for ${attendee.email}.${field}: "${latest.userValue}" (${latest.matchReason})`);
            }
        }

        // Only upgrade power level if currently LOW and no user correction
        if (!correctedFields.has('powerLevel') && existing.powerLevel === 'LOW' && data.powerLevel && data.powerLevel !== 'LOW') {
            updateData.powerLevel = data.powerLevel;
        }

        // Only set influence role if currently UNKNOWN and no user correction
        if (!correctedFields.has('influenceRole') && existing.influenceRole === 'UNKNOWN' && data.influenceRole && data.influenceRole !== 'UNKNOWN') {
            updateData.influenceRole = data.influenceRole;
        }

        // Update profile summary in intelligence if we have one
        if (data.summary) {
            await prisma.stakeholderIntelligence.upsert({
                where: { stakeholderId: attendee.stakeholderProfileId },
                create: {
                    stakeholderId: attendee.stakeholderProfileId,
                    profileSummary: data.summary,
                    lastRefreshedAt: now,
                },
                update: {
                    profileSummary: data.summary,
                    lastRefreshedAt: now,
                },
            });
        }

        await prisma.stakeholderProfile.update({
            where: { id: attendee.stakeholderProfileId },
            data: updateData,
        });

        // If we just stored a LinkedIn URL, check for duplicates immediately
        if (updateData.linkedinUrl) {
            await flagLinkedInDuplicate(userId, attendee.stakeholderProfileId, updateData.linkedinUrl);
        }

        console.log(`[StakeholderEnrichment] Updated profile for ${attendee.email}`);
    } else {
        // Create new profile
        const newProfile = await prisma.stakeholderProfile.create({
            data: {
                userId,
                name: attendee.name,
                email: attendee.email,
                role: usedWebSearch ? data.title : null, // Don't assign LLM-guessed roles
                organization: data.company,
                companyDescription: data.companyDescription,
                relationshipType: data.relationshipType,
                linkedinUrl: data.linkedinUrl,
                powerLevel: (data.powerLevel as any) || 'LOW',
                influenceRole: (data.influenceRole as any) || 'UNKNOWN',
                enrichedAt: now,
                enrichmentSource,
            },
        });

        // Create intelligence record with summary
        if (data.summary) {
            await prisma.stakeholderIntelligence.create({
                data: {
                    stakeholderId: newProfile.id,
                    profileSummary: data.summary,
                    lastRefreshedAt: now,
                },
            });
        }

        // If we just stored a LinkedIn URL, check for duplicates immediately
        if (data.linkedinUrl) {
            await flagLinkedInDuplicate(userId, newProfile.id, data.linkedinUrl);
        }

        console.log(`[StakeholderEnrichment] Created profile for ${attendee.email}`);
    }
}

// ============================================================================
// LINKEDIN DUPLICATE DETECTION
// ============================================================================

/**
 * After enrichment stores a LinkedIn URL, check if another profile for this user
 * already has the same URL. If so, create a UserCorrection record so the next
 * identity resolution run picks it up as a high-confidence match.
 */
async function flagLinkedInDuplicate(userId: string, profileId: string, linkedinUrl: string): Promise<void> {
    const normalized = normalizeLinkedInUrl(linkedinUrl);
    if (!normalized) return;

    const match = await prisma.stakeholderProfile.findFirst({
        where: {
            userId,
            id: { not: profileId },
            mergedIntoId: null,
            linkedinUrl: { not: null },
        },
        select: { id: true, name: true, email: true, linkedinUrl: true },
    });

    if (!match) return;

    const matchNormalized = normalizeLinkedInUrl(match.linkedinUrl!);
    if (matchNormalized !== normalized) return;

    // Same LinkedIn URL — flag for identity resolution
    const pairKey = [profileId, match.id].sort().join('|');

    // Check if already flagged
    const existing = await prisma.userCorrection.findFirst({
        where: { userId, entityType: 'identity_resolution', entityId: pairKey },
    });
    if (existing) return;

    const profile = await prisma.stakeholderProfile.findUnique({
        where: { id: profileId },
        select: { name: true },
    });

    console.log(`[StakeholderEnrichment] LinkedIn duplicate detected: "${profile?.name}" ↔ "${match.name}" (${normalized})`);

    // Store as a high-confidence identity resolution candidate
    await prisma.userCorrection.create({
        data: {
            userId,
            entityType: 'identity_resolution',
            entityId: pairKey,
            field: 'duplicate_check',
            aiValue: 'linkedin_match',
            userValue: 'pending',
            context: {
                profileAId: profileId,
                profileBId: match.id,
                profileAName: profile?.name || 'Unknown',
                profileBName: match.name,
                signal: `Same LinkedIn profile: ${normalized}`,
                confidence: 95,
            },
        },
    });
}

/**
 * Normalize a LinkedIn URL to a canonical form for comparison.
 */
function normalizeLinkedInUrl(url: string): string | null {
    if (!url) return null;
    try {
        let cleaned = url.trim().toLowerCase();
        if (!cleaned.startsWith('http')) cleaned = 'https://' + cleaned;
        const parsed = new URL(cleaned);
        if (!parsed.hostname.includes('linkedin.com')) return null;

        let path = parsed.pathname.replace(/\/+$/, '');
        path = path.replace(/^\/pub\//, '/in/');
        path = path.replace(/^\/in\/[a-z]{2}\//, '/in/');

        return 'linkedin.com' + path;
    } catch {
        return null;
    }
}
