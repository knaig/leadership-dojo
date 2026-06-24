/**
 * Jira adapter — issues, sprints for project context.
 */
import { prisma } from '../../prisma';

async function jiraRequest(userId: string, path: string): Promise<any> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'jira' },
        select: { access_token: true, refresh_token: true, expires_at: true, id: true },
    });
    if (!account?.access_token) throw new Error(`No Jira account for user ${userId}`);

    // Refresh if needed
    const now = Math.floor(Date.now() / 1000);
    let token = account.access_token;
    if (account.expires_at && account.expires_at <= now + 300 && account.refresh_token) {
        const res = await fetch('https://auth.atlassian.com/oauth/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                grant_type: 'refresh_token',
                client_id: process.env.JIRA_CLIENT_ID || '',
                client_secret: process.env.JIRA_CLIENT_SECRET || '',
                refresh_token: account.refresh_token,
            }),
        });
        if (res.ok) {
            const data = await res.json() as any;
            token = data.access_token;
            await prisma.account.update({
                where: { id: account.id },
                data: { access_token: token, refresh_token: data.refresh_token || account.refresh_token, expires_at: now + (data.expires_in || 3600) },
            });
        }
    }

    // Get cloud ID first (Jira requires it)
    const cloudRes = await fetch('https://api.atlassian.com/oauth/token/accessible-resources', {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    const clouds = await cloudRes.json() as any[];
    const cloudId = clouds[0]?.id;
    if (!cloudId) throw new Error('No Jira cloud instance found');

    const res = await fetch(`https://api.atlassian.com/ex/jira/${cloudId}/rest/api/3${path}`, {
        headers: { 'Authorization': `Bearer ${token}`, 'Accept': 'application/json' },
    });
    if (!res.ok) throw new Error(`Jira API ${path} failed: ${res.status}`);
    return res.json();
}

export interface JiraIssue {
    id: string;
    key: string;
    summary: string;
    status: string;
    priority: string;
    assignee: string | null;
    project: string;
    issueType: string;
    createdAt: Date;
    updatedAt: Date;
    url: string;
}

export class JiraAdapter {
    provider = 'jira';
    private userId: string;

    constructor(userId: string) { this.userId = userId; }

    async listMyIssues(options?: { maxResults?: number }): Promise<JiraIssue[]> {
        const jql = encodeURIComponent('assignee = currentUser() ORDER BY updated DESC');
        const data = await jiraRequest(this.userId, `/search?jql=${jql}&maxResults=${options?.maxResults || 50}&fields=summary,status,priority,assignee,project,issuetype,created,updated`);

        return (data.issues || []).map((i: any) => ({
            id: i.id,
            key: i.key,
            summary: i.fields?.summary || '',
            status: i.fields?.status?.name || 'Unknown',
            priority: i.fields?.priority?.name || 'Medium',
            assignee: i.fields?.assignee?.displayName || null,
            project: i.fields?.project?.name || '',
            issueType: i.fields?.issuetype?.name || 'Task',
            createdAt: new Date(i.fields?.created),
            updatedAt: new Date(i.fields?.updated),
            url: `${i.self?.split('/rest/')[0]}/browse/${i.key}`,
        }));
    }
}
