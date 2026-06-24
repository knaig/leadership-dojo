'use client';

/**
 * Mira logo — peacock feather inspired by Mirabai, devotee of Krishna.
 * The peacock feather (mor pankh) is Krishna's signature adornment.
 * Bold, vibrant design visible at all sizes.
 */
export function MiraLogo({ size = 36, className = '' }: { size?: number; className?: string }) {
    const id = `mira-${size}-${Math.random().toString(36).slice(2, 6)}`;
    return (
        <svg
            width={size}
            height={size}
            viewBox="0 0 40 40"
            fill="none"
            xmlns="http://www.w3.org/2000/svg"
            className={className}
        >
            <defs>
                <linearGradient id={`${id}-feather`} x1="12" y1="2" x2="28" y2="36" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#34d399" />
                    <stop offset="35%" stopColor="#2dd4bf" />
                    <stop offset="65%" stopColor="#818cf8" />
                    <stop offset="100%" stopColor="#6366f1" />
                </linearGradient>
                <linearGradient id={`${id}-eye`} x1="16" y1="9" x2="25" y2="22" gradientUnits="userSpaceOnUse">
                    <stop offset="0%" stopColor="#fbbf24" />
                    <stop offset="100%" stopColor="#f59e0b" />
                </linearGradient>
            </defs>
            {/* Background circle for contrast */}
            <circle cx="20" cy="20" r="19" fill="#0f172a" />
            {/* Feather shaft — curved quill */}
            <path d="M20 37 C20 37, 17.5 27, 18.5 18 C19 13, 21 8, 20 2"
                stroke="#a5b4fc" strokeWidth="1.2" strokeLinecap="round" fill="none" opacity="0.7" />
            {/* Outer vane — full feather shape */}
            <path d="M20 4 C13 8, 8 13, 7 18 C6 23, 10 28, 20 30 C30 28, 34 23, 33 18 C32 13, 27 8, 20 4Z"
                fill={`url(#${id}-feather)`} opacity="0.5" />
            {/* Inner vane */}
            <path d="M20 7 C14.5 10, 10.5 14, 9.5 18 C8.5 22, 12.5 26, 20 28 C27.5 26, 31.5 22, 30.5 18 C29.5 14, 25.5 10, 20 7Z"
                fill={`url(#${id}-feather)`} opacity="0.75" />
            {/* Eye outer ring */}
            <ellipse cx="20" cy="17" rx="7" ry="8" fill={`url(#${id}-feather)`} />
            {/* Eye dark ring */}
            <ellipse cx="20" cy="17" rx="5" ry="6" fill="#1e1b4b" />
            {/* Eye golden iris */}
            <ellipse cx="20" cy="16.5" rx="3.5" ry="4.2" fill={`url(#${id}-eye)`} />
            {/* Eye dark pupil */}
            <ellipse cx="20" cy="16" rx="1.8" ry="2.2" fill="#1e1b4b" />
            {/* Eye highlight */}
            <circle cx="18.8" cy="14.8" r="1" fill="white" opacity="0.85" />
        </svg>
    );
}
