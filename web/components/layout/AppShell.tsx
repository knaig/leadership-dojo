import { Shell } from '@/components/v2/Shell';

interface AppShellProps {
  children: React.ReactNode;
}

export function AppShell({ children }: AppShellProps) {
  return (
    <Shell>
      {children}
    </Shell>
  );
}

