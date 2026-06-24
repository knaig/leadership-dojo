import { prisma } from '@/lib/db';
import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

export interface QAReport {
    passed: boolean;
    flags: string[];
    score: number;
}

/**
 * The Gatekeeper Agent
 * Validates a generated Case Version against its Source Material.
 */
export async function runQAGate(caseId: string, versionId: string): Promise<QAReport> {
    console.log(`[QAAgent] Auditing Case ${caseId} (v${versionId})...`);

    // 1. Fetch Context
    const caseData = await prisma.case.findUnique({
        where: { id: caseId },
        include: { generatedFrom: true }
    });

    const versionData = await prisma.caseVersion.findUnique({
        where: { id: versionId }
    });

    if (!caseData || !versionData || !caseData.generatedFrom) {
        console.warn("[QAAgent] Missing data for audit.");
        return { passed: false, flags: ["Missing source or version data"], score: 0 };
    }

    const sourceText = caseData.generatedFrom.content?.slice(0, 5000) || "";
    const caseJson = JSON.stringify(versionData.content, null, 2);

    // 2. Audit (LLM)
    const auditPrompt = `
    You are the Chief Auditor for a leadership curriculum. 
    Audit the following Case Draft against the Source Article.
    
    Source Article (Truncated):
    ${sourceText}

    Generated Case JSON:
    ${caseJson}

    Check for:
    1. Grounding: Are the key facts in the case supported by the article? (No hallucinations)
    2. Neutrality: Is the tone neutral? (No bias)
    3. Pedagogy: Are the options distinct and tricky? (No obvious right answer)
    4. Safety: Is the content safe for work?

    Return JSON:
    {
       "passed": boolean,
       "score": number (0-100),
       "flags": ["String (issue description)"]
    }
    `;

    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: auditPrompt }],
        response_format: { type: "json_object" }
    });

    const report = JSON.parse(completion.choices[0].message.content || "{}") as QAReport;

    // 3. Action
    console.log(`[QAAgent] Result: ${report.passed ? "PASS" : "FAIL"} (Score: ${report.score})`);

    if (report.passed) {
        // Auto-approve logic? For now, we keep it as DRAFT but verified.
        // We could verify here or tag it.
    }

    return report;
}
