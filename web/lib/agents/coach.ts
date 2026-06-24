import OpenAI from 'openai';

const openai = new OpenAI({
    apiKey: process.env.OPENAI_API_KEY,
});

/**
 * The Mentor Agent
 * Provides real-time, adaptive feedback during a case session.
 */
export async function generateCoachingFeedback(
    context: string,
    userChoice: string,
    history: any[],
    userResponse: string
) {
    console.log("[CoachAgent] Generating feedback...");

    // 1. Prompt
    const prompt = `
    You are an Expert Leadership Psychologist specializing in Cognitive Bias (Kahneman's Systems) and Behavioral Economics.
    Analyze the user's response to the case update.
    
    Case Context: ${JSON.stringify(history.slice(-2))}
    User Response: "${userResponse}"

    Analyze for TWO dimensions:
    1. **Strategic Quality**: Did they make the right move?
    2. **Cognitive Mode (Kahneman)**:
       - **System 1 (Fast)**: Impulsive, heuristic-led, emotional, status-seeking. (e.g. "Fix it now!", "This is insulting!")
       - **System 2 (Slow)**: Analytical, deliberative, checking constraints. (e.g. "Let's pause and map the stakeholders.")

    Output JSON:
    {
       "feedback": "Direct advice for the user.",
       "score": 0-100,
       "cognitive_analysis": {
          "mode": "System 1" | "System 2",
          "evidence": "Why you think this.",
          "bias_detected": "Name of bias (e.g. Action Bias, Sunk Cost) or Null"
       },
       "socratic_question": "A question to trigger System 2 thinking if they were too fast."
    }
    `;

    // 2. LLM
    const completion = await openai.chat.completions.create({
        model: "gpt-4o",
        messages: [{ role: "user", content: prompt }],
        response_format: { type: "json_object" }
    });

    const result = JSON.parse(completion.choices[0].message.content || "{}");
    return result;
}

/**
 * Socratic Mode Trigger
 * Decides if we should interrupt the user to ask "Why?"
 */
export async function checkSocraticTrigger(
    context: string,
    userChoice: string
): Promise<string | null> {
    // Logic: If the choice is "Risky" or "High Stakes", ask for rationale.
    // For MVP, randomly trigger on 20% of decisions or text match keywords.

    const isRisky = userChoice.toLowerCase().includes("ignore") || userChoice.toLowerCase().includes("fire");

    if (isRisky || Math.random() < 0.2) {
        return "This is a significant decision. In one sentence, why did you choose this option over the others?";
    }

    return null;
}
