/**
 * Trello adapter — boards, cards for project managers.
 * Trello uses API key + token (not OAuth2).
 */
import { prisma } from '../../prisma';

async function trelloRequest(userId: string, path: string): Promise<any> {
    const account = await prisma.account.findFirst({
        where: { userId, provider: 'trello' },
        select: { access_token: true },
    });
    if (!account?.access_token) throw new Error(`No Trello account for user ${userId}`);

    const apiKey = process.env.TRELLO_API_KEY || '';
    const separator = path.includes('?') ? '&' : '?';
    const url = `https://api.trello.com/1${path}${separator}key=${apiKey}&token=${account.access_token}`;

    const res = await fetch(url);
    if (!res.ok) throw new Error(`Trello API ${path} failed: ${res.status}`);
    return res.json();
}

export interface TrelloCard {
    id: string;
    name: string;
    description: string;
    listName: string;
    boardName: string;
    dueDate: Date | null;
    labels: string[];
    members: string[];
    url: string;
    lastActivity: Date;
}

export class TrelloAdapter {
    provider = 'trello';
    private userId: string;

    constructor(userId: string) { this.userId = userId; }

    async listMyCards(options?: { limit?: number }): Promise<TrelloCard[]> {
        const data = await trelloRequest(this.userId, `/members/me/cards?fields=name,desc,due,labels,idMembers,url,dateLastActivity,idBoard,idList&limit=${options?.limit || 50}`);

        return (data || []).map((c: any) => ({
            id: c.id,
            name: c.name || '',
            description: c.desc || '',
            listName: '', // would need separate list lookup
            boardName: '', // would need separate board lookup
            dueDate: c.due ? new Date(c.due) : null,
            labels: (c.labels || []).map((l: any) => l.name || l.color),
            members: c.idMembers || [],
            url: c.url || '',
            lastActivity: new Date(c.dateLastActivity),
        }));
    }

    async listBoards(): Promise<Array<{ id: string; name: string; url: string }>> {
        const data = await trelloRequest(this.userId, '/members/me/boards?fields=name,url&filter=open');
        return (data || []).map((b: any) => ({ id: b.id, name: b.name, url: b.url }));
    }
}
