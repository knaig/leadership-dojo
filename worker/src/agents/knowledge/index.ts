/**
 * Knowledge Graph Module
 *
 * Zep-style temporal knowledge graph + GraphRAG-style community detection.
 * Extracts entities and facts from all data sources, builds communities,
 * and provides query services for downstream agents.
 */

// Foundation
export { resolveEntity, resolveEntities, findEntity, cleanPersonName, normalizeName } from './entity-resolver';
export { createFact, createFacts, getCurrentFacts, getFactHistory } from './fact-manager';
export { isAlreadyExtracted, logExtraction, getUnextractedIds } from './extraction-log';

// Extractors
export { extractCalendarFacts } from './calendar-fact-extractor';
export { extractEmailFacts } from './email-fact-extractor';
export { extractDocumentFacts } from './document-fact-extractor';
export { extractChatFacts } from './chat-fact-extractor';

// Graph Operations
export { detectCommunities } from './community-detection-agent';
export { runConfidenceDecay, runConfidenceDecayAllUsers } from './confidence-decay';

// Query Service
export {
    getAttendeeIntelligence,
    getMorningBriefContext,
    analyzeKnowledgeGaps,
    findEntitiesByName,
    getTwoHopFacts,
    getEntityCommunities,
} from './graph-query-service';

// Migration
export { migrateStakeholdersToGraph } from './migration';

// Onboarding
export { needsOnboarding, runOnboardingExtraction, generateOnboardingQuestions, buildOnboardingMessage } from './onboarding';
