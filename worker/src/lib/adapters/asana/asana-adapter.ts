/**
 * Asana adapter — tasks, projects for project managers.
 */
import { prisma } from '../../prisma';

async function asanaRequest(userId: string, path: string): Promise<any> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'asana' },
        select: { id: true, access_token: true, refresh_token: true, expires_at: true },
    });
    if (!account?.access_token) throw new Error(`No Asana account for user ${userId}`);

    // Refresh if needed
    const now = Math.floor(Date.now() / 1000);
    let token = account.access_token;
    if (account.expires_at && account.expires_at <= now + 300 && account.refresh_token) {
        const res = await fetch('https://app.asana.com/-/oauth_token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
            body: new URLSearchParams({
                grant_type: 'refresh_token',
                client_id: process.env.ASANA_CLIENT_ID || '',
                client_secret: process.env.ASANA_CLIENT_SECRET || '',
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

    const res = await fetch(`https://app.asana.com/api/1.0${path}`, {
        headers: { 'Authorization': `Bearer ${token}` },
    });
    if (!res.ok) throw new Error(`Asana API ${path} failed: ${res.status}`);
    const data = await res.json() as any;
    return data.data;
}

export interface AsanaTask {
    id: string;
    name: string;
    notes: string;
    completed: boolean;
    dueDate: Date | null;
    assignee: string | null;
    project: string | null;
    section: string | null;
    url: string;
    modifiedAt: Date;
}

export class AsanaAdapter {
    provider = 'asana';
    private userId: string;

    constructor(userId: string) { this.userId = userId; }

    async listMyTasks(options?: { limit?: number }): Promise<AsanaTask[]> {
        // Get user's workspace first
        const workspaces = await asanaRequest(this.userId, '/workspaces?limit=1');
        if (!workspaces?.length) return [];
        const workspaceId = workspaces[0].gid;

        // Get user's task list
        const me = await asanaRequest(this.userId, '/users/me');
        const tasks = await asanaRequest(this.userId, `/user_task_lists/${me.gid}/tasks?opt_fields=name,notes,completed,due_on,assignee.name,memberships.project.name,memberships.section.name,modified_at,permalink_url&limit=${options?.limit || 50}&completed_since=now`);

        return (tasks || []).map((t: any) => ({
            id: t.gid,
            name: t.name || '',
            notes: t.notes || '',
            completed: t.completed || false,
            dueDate: t.due_on ? new Date(t.due_on) : null,
            assignee: t.assignee?.name || null,
            project: t.memberships?.[0]?.project?.name || null,
            section: t.memberships?.[0]?.section?.name || null,
            url: t.permalink_url || '',
            modifiedAt: new Date(t.modified_at),
        }));
    }

    async listProjects(): Promise<Array<{ id: string; name: string; status: string }>> {
        const workspaces = await asanaRequest(this.userId, '/workspaces?limit=1');
        if (!workspaces?.length) return [];

        const projects = await asanaRequest(this.userId, `/workspaces/${workspaces[0].gid}/projects?opt_fields=name,current_status_update.title&limit=20`);
        return (projects || []).map((p: any) => ({
            id: p.gid, name: p.name, status: p.current_status_update?.title || 'active',
        }));
    }
}
