/**
 * Email Thread Summarizer
 * 
 * Uses LLM to generate concise summaries of email threads with sentiment and topic extraction.
 */

import { GeminiProvider } from '@/lib/llm/providers/gemini';

interface EmailThreadInput {
    subject: string;
    from: string;
    snippets: string;
    messageCount: number;
}

interface EmailSummaryOutput {
    summary: string;
    sentiment: 'positive' | 'negative' | 'neutral' | 'action_required';
    topics: string[];
}

/**
 * Generate a summary of an email thread
 */
export async function generateEmailThreadSummary(
    input: EmailThreadInput
): Promise<EmailSummaryOutput> {
    const prompt = `Analyze this email thread and provide a structured summary.

## Email Thread
Subject: ${input.subject}
From: ${input.from}
Messages: ${input.messageCount}

Content snippets:
${input.snippets}

## Your Task
Provide a JSON response with:
1. "summary": A 2-3 sentence summary of the thread's main points
2. "sentiment": One of: "positive", "negative", "neutral", "action_required"
3. "topics": Array of 2-5 key topics/themes (e.g., ["budget", "timeline", "project update"])

Focus on:
- Main purpose of the thread
- Any decisions or action items
- Tone and urgency level

Respond ONLY with valid JSON.`;

    try {
        const llm = new GeminiProvider(process.env.GOOGLE_GENERATIVE_AI_API_KEY || '');
        const response = await llm.generateText(prompt, 'gemini-2.0-flash');

        // Parse JSON response
        const jsonMatch = response.match(/\{[\s\S]*\}/);
        if (!jsonMatch) {
            throw new Error('No JSON found in response');
        }

        const parsed = JSON.parse(jsonMatch[0]);

        return {
            summary: parsed.summary || 'Unable to summarize',
            sentiment: parsed.sentiment || 'neutral',
            topics: Array.isArray(parsed.topics) ? parsed.topics : [],
        };
    } catch (error) {
        console.error('Error in email summarization:', error);
        // Return defaults on error
        return {
            summary: `Email thread: ${input.subject}`,
            sentiment: 'neutral',
            topics: [],
        };
    }
}

/**
 * Generate a batch of email summaries efficiently
 */
export async function generateBatchEmailSummaries(
    threads: EmailThreadInput[]
): Promise<EmailSummaryOutput[]> {
    // Process in parallel with concurrency limit
    const results: EmailSummaryOutput[] = [];
    const concurrencyLimit = 3;

    for (let i = 0; i < threads.length; i += concurrencyLimit) {
        const batch = threads.slice(i, i + concurrencyLimit);
        const batchResults = await Promise.all(
            batch.map(thread => generateEmailThreadSummary(thread))
        );
        results.push(...batchResults);
    }

    return results;
}
