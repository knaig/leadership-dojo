import { prisma } from '@/lib/db';
import OpenAI from 'openai';
import { scrapeUrl } from '@/lib/scraper';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * The Scout Agent
 * Ingests external content and converts it into a Case Draft.
 */
export async function ingestArticle(url: string) {
    console.log(`[IngestAgent] Scouting: ${url}`);

    // 1. Fetch & Scrape
    const { title, rawText } = await scrapeUrl(url);

    if (!rawText) {
        return { success: false, error: "Failed to scrape content" };
    }

    // 2. Fact Extraction (LLM)
    console.log(`[IngestAgent] Extracting Facts from ${rawText.length} chars...`);

    const extractionPrompt = `
    You are an expert Case Writer for a leadership curriculum.
    Analyze the following article text and extract a structured "Fact Sheet".
    The Fact Sheet must include:
    - The Core Dilemma (What is the conflict?)
    - The Key Stakeholders (Who are they and what do they want?)
    - Timeline of events
    - 3 Key Constraints (Budget, Time, Politics, etc.)

    Article Text:
    ${rawText}
    `;

    const factSheetCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: extractionPrompt }],
    });

    const factSheet = factSheetCompletion.choices[0].message.content;

    // 3. Case Drafting (LLM)
    console.log(`[IngestAgent] Drafting Case Scenario...`);

    const draftPrompt = `
    Based on this Fact Sheet, generate a Leadership Case JSON.
    
    Fact Sheet:
    ${factSheet}

    JSON Structure required:
    {
      "title": "String",
      "slug": "String (kebab-case)",
      "description": "String",
      "cluster": "String (One of: Self-Leadership, Communication, Relationship & Trust, Team Leadership, Decision & Execution, Strategy & Systems, Influence & Negotiation, Institutional Thinking)",
      "skills": ["String (slugs)"],
      "content": {
         "meta": { "country": "String", "role": "String", "difficulty": "Medium" },
         "context": { "description": "String", "stakeholders": [] },
         "rounds": [
            { "id": "r1", "type": "opening", "title": "String", "description": "String", "options": [] }
         ]
      }
    }
    
    Return ONLY valid JSON.
    `;

    const draftCompletion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: draftPrompt }],
        response_format: { type: "json_object" }
    });

    const draftJson = JSON.parse(draftCompletion.choices[0].message.content || "{}");

    // 4. Persistence
    if (!draftJson.slug) return null;

    // Check usage
    const existing = await prisma.ingestedArticle.findUnique({ where: { url } });
    if (existing) {
        console.warn(`[IngestAgent] URL already ingested.`);
        return existing.generatedCaseId;
    }

    // Create IngestedArticle record
    const article = await prisma.ingestedArticle.create({
        data: {
            url,
            title,
            content: rawText.slice(0, 5000), // Store snippet
            status: 'CONVERTED'
        }
    });

    // Create Case (Draft)
    const newCase = await prisma.case.create({
        data: {
            title: draftJson.title,
            slug: `${draftJson.slug}-${Date.now()}`, // Ensure uniqueness
            description: draftJson.description,
            cluster: draftJson.cluster,
            isCore: false, // Ingested cases are usually Electives
            sourceUrl: url,
            generatedFrom: { connect: { id: article.id } },
        }
    });

    // Create version for the case
    const version = await prisma.caseVersion.create({
        data: {
            caseId: newCase.id,
            version: 1,
            status: 'DRAFT',
            createdBy: 'ai-agent',
            content: draftJson.content
        }
    });

    // Update case with current version
    await prisma.case.update({
        where: { id: newCase.id },
        data: { currentVersionId: version.id }
    });

    console.log(`[IngestAgent] Case Draft Created: ${newCase.slug}`);
    return newCase.id;
}
