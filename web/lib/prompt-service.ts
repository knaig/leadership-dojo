/**
 * Prompt Service — Reads prompt templates from DB with hardcoded fallback.
 *
 * This is the core of the conversation control plane. Prompts are stored in
 * the PromptTemplate table, versioned, and editable from the admin panel.
 * If no active template exists for a prompt name, falls back to the
 * hardcoded prompts in vapi.ts.
 */

import { prisma } from '@/lib/prisma';

export interface ResolvedPrompt {
    system: string;
    firstMessage: string;
    maxDurationSeconds: number;
    // Observation metadata
    templateName: string;
    templateVersion: number;
    source: 'database' | 'hardcoded';
}

interface PromptTemplateRecord {
    id: string;
    name: string;
    version: number;
    content: string;
    firstMessageOptions: unknown;
    variables: unknown;
    maxDurationSeconds: number | null;
    status: string;
}

/**
 * Fetch the active prompt template for a given name.
 * Checks for user-specific experiment overrides first,
 * then falls back to the global active version.
 */
export async function getActivePromptTemplate(
    name: string,
    userId?: string,
): Promise<PromptTemplateRecord | null> {
    // 1. Check if user is in an experiment with a specific version
    if (userId) {
        const experiment = await prisma.experiment.findFirst({
            where: {
                promptTemplateName: name,
                status: 'active',
            },
        });

        if (experiment) {
            const assignments = experiment.userAssignments as Record<string, string[]>;
            const group = Object.entries(assignments).find(([, users]) =>
                users.includes(userId)
            );

            if (group) {
                const version = group[0] === 'A'
                    ? experiment.promptVersionA
                    : experiment.promptVersionB;

                if (version) {
                    const template = await prisma.promptTemplate.findUnique({
                        where: { name_version: { name, version } },
                    });
                    if (template) return template;
                }
            }
        }
    }

    // 2. Get the global active version
    const template = await prisma.promptTemplate.findFirst({
        where: { name, status: 'active' },
        orderBy: { version: 'desc' },
    });

    return template;
}

/**
 * Assemble a prompt by replacing {{variable}} placeholders with values.
 * Supports simple conditionals: {{#if varName}}...{{/if}}
 */
export function assemblePrompt(
    template: string,
    variables: Record<string, string>,
): string {
    let result = template;

    // Process conditionals first: {{#if varName}}content{{/if}}
    result = result.replace(
        /\{\{#if\s+(\w+)\s*(?:==\s*"([^"]*)")?\}\}([\s\S]*?)\{\{\/if\}\}/g,
        (_match, varName, eqValue, content) => {
            const val = variables[varName] || '';
            if (eqValue !== undefined) {
                return val === eqValue ? content : '';
            }
            return val && val !== 'false' && val !== '' ? content : '';
        }
    );

    // Replace variables: {{varName}}
    result = result.replace(/\{\{(\w+)\}\}/g, (_match, varName) => {
        return variables[varName] ?? '';
    });

    return result.trim();
}

/**
 * Pick a random first message from the template's options,
 * replacing variables in the selected message.
 */
export function pickFirstMessage(
    options: unknown,
    variables: Record<string, string>,
): string {
    if (!Array.isArray(options) || options.length === 0) {
        return `Hey ${variables.userName || 'there'}. It's Mira.`;
    }
    const picked = options[Math.floor(Math.random() * options.length)] as string;
    return assemblePrompt(picked, variables);
}

/**
 * Get active conversation config (confidence thresholds, adaptation rules, etc.)
 */
export async function getActiveConversationConfig() {
    const config = await prisma.conversationConfig.findFirst({
        where: { status: 'active' },
        orderBy: { version: 'desc' },
    });
    return config;
}

/**
 * Preview what a user would receive — assembles the full prompt without triggering a call.
 */
export async function previewPrompt(
    templateName: string,
    variables: Record<string, string>,
    userId?: string,
): Promise<{
    template: PromptTemplateRecord | null;
    assembledPrompt: string;
    firstMessage: string;
    variables: Record<string, string>;
    source: 'database' | 'hardcoded';
}> {
    const template = await getActivePromptTemplate(templateName, userId);

    if (!template) {
        return {
            template: null,
            assembledPrompt: '(no active template — using hardcoded fallback)',
            firstMessage: '',
            variables,
            source: 'hardcoded',
        };
    }

    const assembledPrompt = assemblePrompt(template.content, variables);
    const firstMessage = pickFirstMessage(template.firstMessageOptions, variables);

    return {
        template,
        assembledPrompt,
        firstMessage,
        variables,
        source: 'database',
    };
}
