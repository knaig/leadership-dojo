/**
 * GitHub App Token Management
 *
 * Handles GitHub App JWT generation and installation access token lifecycle.
 * Follows the same pattern as google-auth.ts for OAuth token management.
 */

import { prisma } from './prisma';
import { Octokit } from '@octokit/rest';
import jwt from 'jsonwebtoken';
import { encryptOAuthToken, decryptOAuthToken } from './encryption';

/**
 * Generate a short-lived JWT for authenticating as the GitHub App.
 * Valid for 10 minutes per GitHub's requirements.
 */
function generateGitHubAppJWT(): string {
    const now = Math.floor(Date.now() / 1000);
    return jwt.sign(
        { iat: now - 60, exp: now + 10 * 60, iss: process.env.GITHUB_APP_ID },
        process.env.GITHUB_APP_PRIVATE_KEY!.replace(/\\n/g, '\n'),
        { algorithm: 'RS256' }
    );
}

/**
 * Get an authenticated Octokit client for a user's GitHub App installation.
 * Handles token caching and automatic refresh.
 *
 * Returns null if the user has no GitHub installation.
 */
export async function getGitHubInstallationClient(userId: string): Promise<Octokit | null> {
    const installation = await prisma.gitHubInstallation.findFirst({
        where: { userId },
    });

    if (!installation) {
        console.log(`[github-auth] No GitHub installation found for user ${userId.substring(0, 8)}`);
        return null;
    }

    // Check if existing token is still valid (with 5-minute buffer)
    if (installation.accessToken && installation.tokenExpiresAt) {
        const bufferMs = 5 * 60 * 1000;
        if (new Date(installation.tokenExpiresAt).getTime() > Date.now() + bufferMs) {
            const decryptedToken = decryptOAuthToken(installation.accessToken);
            if (decryptedToken) {
                return new Octokit({ auth: decryptedToken });
            }
        }
    }

    // Generate new installation access token
    try {
        const appJwt = generateGitHubAppJWT();
        const appOctokit = new Octokit({ auth: appJwt });

        const { data } = await appOctokit.rest.apps.createInstallationAccessToken({
            installation_id: installation.installationId,
        });

        // Encrypt and store the new token
        const encryptedToken = encryptOAuthToken(data.token);

        await prisma.gitHubInstallation.update({
            where: { id: installation.id },
            data: {
                accessToken: encryptedToken,
                tokenExpiresAt: new Date(data.expires_at),
            },
        });

        return new Octokit({ auth: data.token });
    } catch (error: any) {
        console.error(
            `[github-auth] Failed to get installation token for user ${userId.substring(0, 8)}:`,
            error.message
        );
        return null;
    }
}
