'use client';

import { cn } from '@/lib/utils';
import { BRAND } from '@/lib/brand';

interface LogoProps {
    size?: 'sm' | 'md' | 'lg';
    showText?: boolean;
    className?: string;
}

export function ClarityLogo({ size = 'md', showText = true, className }: LogoProps) {
    const sizeClasses = {
        sm: 'w-6 h-6 text-xs',
        md: 'w-8 h-8 text-sm',
        lg: 'w-10 h-10 text-lg'
    };

    const textClasses = {
        sm: 'text-sm',
        md: 'text-lg',
        lg: 'text-2xl'
    };

    return (
        <div className={cn('flex items-center gap-2', className)}>
            <div
                className={cn(
                    'rounded-lg flex items-center justify-center font-bold text-white',
                    'bg-gradient-to-br from-indigo-500 to-purple-600',
                    sizeClasses[size]
                )}
            >
                {BRAND.logoLetter}
            </div>
            {showText && (
                <span className={cn('font-bold text-white', textClasses[size])}>
                    {BRAND.name}
                </span>
            )}
        </div>
    );
}
