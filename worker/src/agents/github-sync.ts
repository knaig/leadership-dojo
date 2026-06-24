/**
 * GitHub Sync Agent
 *
 * Fetches PRs and issues from GitHub repositories linked as ProjectResources.
 * Stores raw data in GitHubSyncRecord for downstream fact extraction.
 *
 * Trigger: pg-boss job `github-sync` queued after installation or on schedule.
 */

import { prisma } from '../lib/prisma';
import { getGitHubInstallationClient } from '../lib/github-auth';
import { Octokit } from '@octokit/rest';

interface GitHubSyncOptions {
    userId: string;
    resourceId?: string; // If provided, sync only this resource
    trigger?: string;
}

export async function runGitHubSync(options: GitHubSyncOptions): Promise<void> {
    const { userId, resourceId, trigger } = options;
    const label = `[github-sync][${userId.substring(0, 8)}]`;
    console.log(`${label} Starting sync (trigger: ${trigger || 'manual'})`);

    const octokit = await getGitHubInstallationClient(userId);
    if (!octokit) {
        console.log(`${label} No GitHub client available, skipping`);
        return;
    }

    // Find resources to sync
    const whereClause: any = {
        project: { userId },
        sourceType: 'GITHUB_REPO',
    };
    if (resourceId) {
        whereClause.id = resourceId;
    }

    const resources = await prisma.projectResource.findMany({
        where: whereClause,
        include: { project: true },
    });

    if (resources.length === 0) {
        console.log(`${label} No GitHub resources found`);
        return;
    }

    for (const resource of resources) {
        try {
            await syncResource(octokit, userId, resource, label);
        } catch (error: any) {
            console.error(`${label} Error syncing resource ${resource.id}:`, error.message);
            await prisma.projectResource.update({
                where: { id: resource.id },
                data: { syncStatus: `Error: ${error.message}` },
            });
        }
    }

    console.log(`${label} Sync complete`);
}

async function syncResource(
    octokit: Octokit,
    userId: string,
    resource: any,
    label: string
): Promise<void> {
    const [owner, repo] = resource.externalId.split('/');
    if (!owner || !repo) {
        console.error(`${label} Invalid repo format for resource ${resource.id}: ${resource.externalId}`);
        return;
    }

    console.log(`${label} Syncing ${owner}/${repo}`);

    // Determine since date (last sync or 30 days ago)
    const since = resource.lastSyncAt
        ? new Date(resource.lastSyncAt).toISOString()
        : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

    // Sync PRs
    const prs = await octokit.rest.pulls.list({
        owner,
        repo,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
    });

    for (const pr of prs.data) {
        // Skip PRs not updated since last sync
        if (new Date(pr.updated_at) < new Date(since)) continue;

        await prisma.gitHubSyncRecord.upsert({
            where: {
                resourceId_entityType_externalId: {
                    resourceId: resource.id,
                    entityType: 'pull_request',
                    externalId: String(pr.number),
                },
            },
            create: {
                userId,
                resourceId: resource.id,
                entityType: 'pull_request',
                externalId: String(pr.number),
                title: pr.title,
                content: pr.body?.substring(0, 5000) || null,
                author: pr.user?.login || null,
                state: pr.state,
                metadata: {
                    merged: pr.merged_at !== null,
                    reviewers: pr.requested_reviewers?.map((r: any) => r.login) || [],
                    labels: pr.labels?.map((l: any) => l.name) || [],
                    additions: pr.additions,
                    deletions: pr.deletions,
                },
                occurredAt: new Date(pr.created_at),
            },
            update: {
                title: pr.title,
                content: pr.body?.substring(0, 5000) || null,
                state: pr.state,
                metadata: {
                    merged: pr.merged_at !== null,
                    reviewers: pr.requested_reviewers?.map((r: any) => r.login) || [],
                    labels: pr.labels?.map((l: any) => l.name) || [],
                    additions: pr.additions,
                    deletions: pr.deletions,
                },
                syncedAt: new Date(),
            },
        });
    }

    const prCount = prs.data.filter(pr => new Date(pr.updated_at) >= new Date(since)).length;
    console.log(`${label} Synced ${prCount} PRs for ${owner}/${repo}`);

    // Sync Issues (excluding PRs which also appear as issues)
    const issues = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: 100,
        since,
    });

    let issueCount = 0;
    for (const issue of issues.data) {
        if (issue.pull_request) continue; // Skip PRs

        await prisma.gitHubSyncRecord.upsert({
            where: {
                resourceId_entityType_externalId: {
                    resourceId: resource.id,
                    entityType: 'issue',
                    externalId: String(issue.number),
                },
            },
            create: {
                userId,
                resourceId: resource.id,
                entityType: 'issue',
                externalId: String(issue.number),
                title: issue.title,
                content: issue.body?.substring(0, 5000) || null,
                author: issue.user?.login || null,
                state: issue.state,
                metadata: {
                    labels: issue.labels?.map((l: any) => typeof l === 'string' ? l : l.name) || [],
                    assignees: issue.assignees?.map((a: any) => a.login) || [],
                },
                occurredAt: new Date(issue.created_at),
            },
            update: {
                title: issue.title,
                content: issue.body?.substring(0, 5000) || null,
                state: issue.state,
                metadata: {
                    labels: issue.labels?.map((l: any) => typeof l === 'string' ? l : l.name) || [],
                    assignees: issue.assignees?.map((a: any) => a.login) || [],
                },
                syncedAt: new Date(),
            },
        });
        issueCount++;
    }

    console.log(`${label} Synced ${issueCount} issues for ${owner}/${repo}`);

    // Update resource sync status
    await prisma.projectResource.update({
        where: { id: resource.id },
        data: {
            lastSyncAt: new Date(),
            syncStatus: 'success',
        },
    });
}
