
import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/prisma';
import { createProvider } from '@/lib/llm/factory';
import { LLMConfig } from '@/lib/llm/types';

export const maxDuration = 60;

export async function POST(req: Request) {
    try {
        const session = await auth();
        if (!session?.user?.id) {
            return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
        }
        const userId = session.user.id;

        const { query } = await req.json();

        // 1. Fetch User's Context Graph (All Stakeholders)
        const stakeholders = await prisma.stakeholderProfile.findMany({
            where: { userId, validationStatus: 'VERIFIED' },
            // Explicitly selecting fields that exist in schema
            select: { name: true, role: true, relationshipStrength: true, politicalCapital: true, valueExchange: true }
        });

        // 2. Setup LLM & Knowledge
        const { MENTAL_MODELS } = await import('@/lib/knowledge/mental-models');

        // Use Gemini Pro by default for this heavy lifting, hardcoded for stability now
        const config: LLMConfig = {
            provider: 'gemini',
            apiKey: process.env.GOOGLE_GENERATIVE_AI_API_KEY || '',
            model: 'gemini-pro',
            temperature: 0.7
        };
        const llm = createProvider(config);

        // 3. Prompt for Strategy Generation
        const prompt = `
        You are an expert political advisor and executive coach (McKinsey/HBS level).
        
        USER SITUATION: "${query}"

        THE CONTEXT GRAPH (Stakeholders):
        ${JSON.stringify(stakeholders, null, 2)}

        AVAILABLE MENTAL MODELS:
        ${JSON.stringify(MENTAL_MODELS.map(m => ({ name: m.name, desc: m.description, source: m.source })))}

        YOUR TASK:
        1. Identify relevant stakeholders.
        2. Select the ONE most applicable Mental Model from the list provided.
        3. Formulate a high-fidelity "Game Plan".
        4. Create a "Quantitative Case": Invent a realistic ROI, Cost-Benefit, or Risk Calculation relevant to this specific situation.
        5. Create a "Visual Concept": Generate a Mermaid.js diagram representing the strategy.

        OUTPUT FORMAT (JSON only):
        {
            "identifiedStakeholders": ["Name 1"],
            "strategy": "One sentence summary (e.g. 'Leverage Loss Aversion to unlock budget').",
            "talkingPoints": ["Bullet 1", "Bullet 2", "Bullet 3"],
            "selectedModel": {
                "name": "Exact Name from list",
                "source": "Citation",
                "reason": "Why needed here"
            },
            "caseChallenge": {
                 "title": "The Simulation: A similar scenario",
                 "content": "Description of a parallel situation where a leader faces this exact problem. Do not reveal the solution yet."
            },
            "caseSolution": {
                 "title": "The Strategic Unlock",
                 "content": "How applying the [Model Name] solves it."
            },
            "quantitativeAnalysis": {
                "title": "The Numbers (ROI/Risk)",
                "content": "Markdown text with numbers. E.g. '$50k savings vs $10k cost...'"
            },
            "visualDiagram": {
                "title": "Strategy Map",
                "type": "mermaid",
                "code": "graph TD; A[Start] --> B[End];" 
            }
        }
        
        Constraints:
        - Mermaid code must be valid and simple (graph UD, sequenceDiagram, or quadrantChart).
        - No markdown formatting outside the JSON fields.
        `;

        const response = await (llm as any).generate(prompt);

        let result = {};
        try {
            const cleanJson = response.replace(/```json/g, '').replace(/```/g, '').trim();
            result = JSON.parse(cleanJson);
        } catch (e) {
            console.error("LLM JSON Parse Error", e);
            result = { strategy: "Could not structure advice.", talkingPoints: [response] };
        }

        return NextResponse.json({ success: true, data: result });

    } catch (error) {
        console.error('[Simulator] Error:', error);
        return NextResponse.json({ error: 'Failed to generate prep' }, { status: 500 });
    }
}
