'use client';

import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { ArrowRight } from 'lucide-react';

export function SignInButton({ children }: { children?: React.ReactNode }) {
  const router = useRouter();

  return (
    <Button
      size="lg"
      className="text-lg px-8 py-6"
      onClick={() => router.push('/sign-in')}
    >
      {children || (
        <>
          Sign in with Google
          <ArrowRight className="h-5 w-5 ml-2" />
        </>
      )}
    </Button>
  );
}
