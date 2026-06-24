
export interface Playbook {
    name: string;
    description: string;
    steps: string[];
    talkingPoints: string[];
}

export class PlaybookService {

    static getPlaybook(scenario: 'BUILD' | 'REPAIR' | 'ACTIVATE' | 'STRENGTHEN'): Playbook {
        switch (scenario) {
            case 'BUILD':
                return {
                    name: "Building from Zero",
                    description: "For stakeholders with no prior relationship.",
                    steps: [
                        "Find a warm intro (who knows both of you?)",
                        "Create a legitimate reason to meet (value-first)",
                        "Start small (15 min coffee, not 1hr meeting)",
                        "Prepare thoroughly (know their priorities)"
                    ],
                    talkingPoints: [
                        "I'm working on [Project] and would love your perspective...",
                        "I know you've done [X] in the past, and I'd value your advice on...",
                        "Sarah suggested I reach out because..."
                    ]
                };

            case 'REPAIR':
                return {
                    name: "Repairing a Relationship",
                    description: "For stakeholders with negative or strained history.",
                    steps: [
                        "Acknowledge the tension/past issue (don't ignore it)",
                        "Listen more than you talk",
                        "Find a small area of alignment",
                        " deliver on a small promise consistently"
                    ],
                    talkingPoints: [
                        "I know we got off on the wrong foot regarding...",
                        "I want to understand your concerns about...",
                        "How can we align better on this project?"
                    ]
                };

            default:
                return {
                    name: "General Relationship Building",
                    description: "Standard approach.",
                    steps: ["Reach out", "Provide value", "Follow up"],
                    talkingPoints: ["How can I help you?"]
                };
        }
    }
}
