
export interface MentalModel {
    id: string;
    name: string;
    source: string;
    description: string;
    application: string;
}

export const MENTAL_MODELS: MentalModel[] = [
    {
        id: "pyramid_principle",
        name: "The Pyramid Principle",
        source: "Barbara Minto, 'The Pyramid Principle' (1978)",
        description: "Start with the answer first. Group and summarize supporting arguments logically.",
        application: "Use when communicating with busy executives to reduce cognitive load."
    },
    {
        id: "batna",
        name: "Best Alternative to a Negotiated Agreement (BATNA)",
        source: "Roger Fisher & William Ury, 'Getting to Yes' (1981)",
        description: "The measure of the balance of power in a negotiation. You cannot make a wise decision about whether to accept a negotiated agreement unless you know your alternatives.",
        application: "Use in negotiation prep to determine your walk-away point and leverage."
    },
    {
        id: "loss_aversion",
        name: "Loss Aversion (Prospect Theory)",
        source: "Kahneman & Tversky (1979)",
        description: "The pain of losing is psychologically about twice as powerful as the pleasure of gaining.",
        application: "Use when proposing change: Frame the cost of inaction (loss) rather than just the benefits of the new plan."
    },
    {
        id: "scarf_model",
        name: "The SCARF Model",
        source: "David Rock, NeuroLeadership Institute (2008)",
        description: "A brain-based model for collaborating with and influencing others. SCARF stands for Status, Certainty, Autonomy, Relatedness, and Fairness.",
        application: "Use when managing conflict or giving feedback to minimize threat response."
    },
    {
        id: "trust_equation",
        name: "The Trust Equation",
        source: "Maister, Green, & Galford, 'The Trusted Advisor' (2000)",
        description: "Trust = (Credibility + Reliability + Intimacy) / Self-Orientation.",
        application: "Use to diagnose why a relationship is failing. Usually, Self-Orientation is too high."
    },
    {
        id: "zone_of_possible_agreement",
        name: "ZOPA (Zone of Possible Agreement)",
        source: "Negotiation Theory",
        description: "The range in a negotiation where two parties can find common ground.",
        application: "Use to map out the overlapping interests between you and the stakeholder."
    },
    {
        id: "situational_leadership",
        name: "Situational Leadership II",
        source: "Ken Blanchard",
        description: "Leadership style must change based on the development level of the person (D1-D4).",
        application: "Use when deciding whether to direct, coach, support, or delegate."
    }
];
