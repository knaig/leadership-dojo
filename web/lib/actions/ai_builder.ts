'use server';

import { OpenAI } from 'openai';
import { CaseContent } from '../builder/types';
import { updateCaseContent } from './builder';

// Initialize OpenAI properly
const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export async function generateCaseFromDescription(caseId: string, description: string) {
    if (!process.env.OPENAI_API_KEY) throw new Error("Missing OpenAI Key");

    const systemPrompt = `
    You are an expert case writer for a leadership simulation.
    Create a 3-round case based on the user's description.
    
    Structure:
    1. Context: Country, Role, and the "Messy Reality".
    2. Stakeholders: 3 key players with hidden agendas.
    3. Round 1 (Opening): An email or crisis that demands attention.
    4. Round 2 (Builder Trap): A decision where the "User" is tempted to build a solution themselves (Trap) vs enabling others.
    5. Round 3 (Outcome): The result.

    Output JSON matching this schema:
    {
      "meta": { "country": "...", "role": "...", "difficulty": "Medium" },
      "context": { "description": "...", "stakeholders": [...] },
      "rounds": [...] 
    }
  `;

    const completion = await openai.chat.completions.create({
        model: "gpt-4-turbo-preview",
        messages: [
            { role: "system", content: systemPrompt },
            { role: "user", content: description }
        ],
        response_format: { type: "json_object" }
    });

    const content = JSON.parse(completion.choices[0].message.content || "{}") as CaseContent;

    // Save to DB
    await updateCaseContent(caseId, content);

    return content;
}
