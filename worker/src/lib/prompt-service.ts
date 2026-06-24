/**
 * Prompt Service (Worker-side)
 *
 * Port of web/lib/prompt-service.ts for CommonJS worker context.
 * Reads prompt templates from DB, assembles with variable replacement.
 */

import { prisma } from './prisma';

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
 */
export async function getActivePromptTemplate(
    name: string,
    userId?: string,
): Promise<PromptTemplateRecord | null> {
    if (userId) {
        const experiment = await prisma.experiment.findFirst({
            where: { promptTemplateName: name, status: 'active' },
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

    // Process conditionals: {{#if varName}}content{{/if}} and {{#if varName == "value"}}content{{/if}}
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
 * Pick a random first message from the template's options.
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
