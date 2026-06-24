// Clerk authentication shim - provides backward compatibility for files still using auth()
// This wraps Clerk's auth function to return a NextAuth-compatible session format
import { auth as clerkAuth, currentUser } from '@clerk/nextjs/server';

// Create a session-like object compatible with NextAuth usage patterns
export async function auth() {
  const { userId } = await clerkAuth();

  if (!userId) {
    return null;
  }

  // Get full user details from Clerk
  const user = await currentUser();

  // Return a NextAuth-compatible session object
  return {
    user: {
      id: userId,
      email: user?.emailAddresses?.[0]?.emailAddress || null,
      name: user?.fullName || user?.firstName || null,
      image: user?.imageUrl || null,
    },
    expires: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(), // 30 days
  };
}
