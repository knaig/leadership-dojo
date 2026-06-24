/**
 * React hook for feature flag checking
 */

'use client';

import { useSession } from 'next-auth/react';
import { useState, useEffect } from 'react';
import { SubscriptionTier } from '@prisma/client';
import { hasFeature, Feature, getUpgradeMessage } from '@/lib/feature-flags';

interface FeatureAccess {
    hasAccess: boolean;
    upgradeMessage?: string;
    tier: SubscriptionTier;
}

export function useFeature(feature: Feature): FeatureAccess {
    const { data: session } = useSession();
    const [access, setAccess] = useState<FeatureAccess>({
        hasAccess: false,
        tier: 'FREE' as SubscriptionTier,
    });

    useEffect(() => {
        async function checkAccess() {
            if (!session?.user?.id) {
                setAccess({
                    hasAccess: false,
                    upgradeMessage: 'Please sign in',
                    tier: 'FREE' as SubscriptionTier,
                });
                return;
            }

            try {
                const response = await fetch('/api/subscription');
                const data = await response.json();

                const tier = data.tier || 'FREE';
                const enabled = data.enabledFeatures || [];
                const disabled = data.disabledFeatures || [];

                const hasAccess = hasFeature(tier, feature, enabled, disabled);

                setAccess({
                    hasAccess,
                    upgradeMessage: hasAccess ? undefined : getUpgradeMessage(feature),
                    tier,
                });
            } catch (error) {
                console.error('Failed to check feature access:', error);
                setAccess({
                    hasAccess: false,
                    upgradeMessage: 'Error checking access',
                    tier: 'FREE' as SubscriptionTier,
                });
            }
        }

        checkAccess();
    }, [session, feature]);

    return access;
}

/**
 * Component wrapper for feature-gated content
 */
export function FeatureGate({
    feature,
    children,
    fallback,
}: {
    feature: Feature;
    children: React.ReactNode;
    fallback?: React.ReactNode;
}) {
    const { hasAccess, upgradeMessage } = useFeature(feature);

    if (hasAccess) {
        return <>{children}</>;
    }

    if (fallback) {
        return <>{fallback}</>;
    }

    return (
        <div className="p-4 border border-dashed rounded-lg bg-muted/50 text-center">
            <p className="text-sm text-muted-foreground">{upgradeMessage}</p>
        </div>
    );
}
