'use client';

import { BRAND } from '@/lib/brand';

interface LeadershipDojoLogoProps {
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function LeadershipDojoLogo({ size = 'md', showText = true, className = '' }: LeadershipDojoLogoProps) {
  const sizes = {
    sm: { icon: 24, text: 'text-lg' },
    md: { icon: 32, text: 'text-xl' },
    lg: { icon: 48, text: 'text-3xl' },
  };

  const { icon, text } = sizes[size];

  return (
    <div className={`flex items-center gap-3 ${className}`}>
      {/* Logo Icon - Stylized dojo/temple gate with eye representing insight */}
      <svg
        width={icon}
        height={icon}
        viewBox="0 0 48 48"
        fill="none"
        xmlns="http://www.w3.org/2000/svg"
        className="shrink-0"
      >
        {/* Outer hexagon - representing structure and discipline */}
        <path
          d="M24 4L42 14V34L24 44L6 34V14L24 4Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinejoin="round"
          className="text-primary"
        />

        {/* Inner eye shape - representing insight/discernment */}
        <path
          d="M12 24C12 24 16 18 24 18C32 18 36 24 36 24C36 24 32 30 24 30C16 30 12 24 12 24Z"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          className="text-primary"
        />

        {/* Pupil - the point of focus */}
        <circle
          cx="24"
          cy="24"
          r="4"
          fill="currentColor"
          className="text-primary"
        />

        {/* Light reflection */}
        <circle
          cx="26"
          cy="22"
          r="1.5"
          fill="currentColor"
          className="text-background"
        />

        {/* Top pillar - left */}
        <line
          x1="14"
          y1="10"
          x2="14"
          y2="16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-primary/60"
        />

        {/* Top pillar - right */}
        <line
          x1="34"
          y1="10"
          x2="34"
          y2="16"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          className="text-primary/60"
        />
      </svg>

      {showText && (
        <div className="flex flex-col">
          <span className={`font-bold tracking-tight ${text}`}>{BRAND.name}</span>
          <span className="text-xs text-muted-foreground tracking-wide">{BRAND.tagline}</span>
        </div>
      )}
    </div>
  );
}

// Alternative minimal logo for small spaces
export function LeadershipDojoLogoMark({ size = 24, className = '' }: { size?: number; className?: string }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 48 48"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      className={className}
    >
      <path
        d="M24 4L42 14V34L24 44L6 34V14L24 4Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
        className="text-primary"
      />
      <path
        d="M12 24C12 24 16 18 24 18C32 18 36 24 36 24C36 24 32 30 24 30C16 30 12 24 12 24Z"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        className="text-primary"
      />
      <circle
        cx="24"
        cy="24"
        r="4"
        fill="currentColor"
        className="text-primary"
      />
    </svg>
  );
}
