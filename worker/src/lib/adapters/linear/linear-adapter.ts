/**
 * Linear adapter — issues, projects, cycles for engineering leaders.
 * Linear uses API keys or OAuth tokens.
 */
import { prisma } from '../../prisma';

async function linearRequest(userId: string, query: string, variables?: any): Promise<any> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'linear' },
        select: { access_token: true },
    });
    if (!account?.access_token) throw new Error(`No Linear account for user ${userId}`);

    const res = await fetch('https://api.linear.app/graphql', {
        method: 'POST',
        headers: {
            'Authorization': account.access_token,
            'Content-Type': 'application/json',
        },
        body: JSON.stringify({ query, variables }),
    });
    if (!res.ok) throw new Error(`Linear API failed: ${res.status}`);
    const data = await res.json() as any;
    if (data.errors) throw new Error(`Linear GraphQL error: ${data.errors[0].message}`);
    return data.data;
}

export interface LinearIssue {
    id: string;
    title: string;
    description: string | null;
    state: string;
    priority: number;
    assignee: string | null;
    project: string | null;
    createdAt: Date;
    updatedAt: Date;
    url: string;
}

export class LinearAdapter {
    provider = 'linear';
    private userId: string;

    constructor(userId: string) { this.userId = userId; }

    async listMyIssues(options?: { limit?: number }): Promise<LinearIssue[]> {
        const data = await linearRequest(this.userId, `
            query($limit: Int) {
                viewer {
                    assignedIssues(first: $limit, orderBy: updatedAt) {
                        nodes {
                            id title description url priority createdAt updatedAt
                            state { name }
                            assignee { name }
                            project { name }
                        }
                    }
                }
            }
        `, { limit: options?.limit || 50 });

        return (data.viewer?.assignedIssues?.nodes || []).map((i: any) => ({
            id: i.id,
            title: i.title,
            description: i.description,
            state: i.state?.name || 'Unknown',
            priority: i.priority || 0,
            assignee: i.assignee?.name || null,
            project: i.project?.name || null,
            createdAt: new Date(i.createdAt),
            updatedAt: new Date(i.updatedAt),
            url: i.url,
        }));
    }

    async listProjects(): Promise<Array<{ id: string; name: string; state: string; progress: number }>> {
        const data = await linearRequest(this.userId, `
            query {
                projects(first: 20, orderBy: updatedAt) {
                    nodes { id name state progress }
                }
            }
        `);

        return (data.projects?.nodes || []).map((p: any) => ({
            id: p.id, name: p.name, state: p.state || 'started', progress: p.progress || 0,
        }));
    }
}
