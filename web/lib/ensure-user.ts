import { prisma } from './prisma';
import { currentUser } from '@clerk/nextjs/server';

/**
 * Ensures a User record exists in the database for a Clerk user.
 * This is needed because Clerk manages users separately from our Prisma User table.
 * When a Clerk user authenticates, we need to create/sync their User record.
 */
export async function ensureUserExists(clerkUserId: string): Promise<string> {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { id: clerkUserId },
  });

  if (existingUser) {
    return existingUser.id;
  }

  // Get Clerk user details
  const clerkUser = await currentUser();

  if (!clerkUser) {
    throw new Error('Could not fetch Clerk user details');
  }

  const email = clerkUser.emailAddresses?.[0]?.emailAddress;

  if (!email) {
    throw new Error('User has no email address');
  }

  // Check if a user with this email already exists (from old NextAuth)
  const existingByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingByEmail) {
    // Update the existing user's ID to match Clerk's ID
    // This handles migration from NextAuth users
    await prisma.user.update({
      where: { id: existingByEmail.id },
      data: { id: clerkUserId },
    });
    return clerkUserId;
  }

  // Create new user — use try/catch to handle race condition where
  // two concurrent requests both pass the findUnique check above
  try {
    const newUser = await prisma.user.create({
      data: {
        id: clerkUserId,
        email,
        name: clerkUser.fullName || clerkUser.firstName || null,
        image: clerkUser.imageUrl || null,
      },
    });

    console.log('[ensureUserExists] Created new user:', newUser.id);
    return newUser.id;
  } catch (error: any) {
    // P2002 = unique constraint violation — another request already created this user
    if (error?.code === 'P2002') {
      console.log('[ensureUserExists] User already created by concurrent request:', clerkUserId);
      return clerkUserId;
    }
    throw error;
  }
}

/**
 * Version that doesn't require currentUser() - uses provided data
 */
export async function ensureUserExistsWithData(
  clerkUserId: string,
  email: string,
  name?: string | null,
  image?: string | null
): Promise<string> {
  // Check if user already exists
  const existingUser = await prisma.user.findUnique({
    where: { id: clerkUserId },
  });

  if (existingUser) {
    return existingUser.id;
  }

  // Check if a user with this email already exists (from old NextAuth)
  const existingByEmail = await prisma.user.findUnique({
    where: { email },
  });

  if (existingByEmail) {
    // Update the existing user's ID to match Clerk's ID
    await prisma.user.update({
      where: { id: existingByEmail.id },
      data: { id: clerkUserId },
    });
    return clerkUserId;
  }

  // Create new user — use try/catch to handle race condition where
  // two concurrent requests both pass the findUnique check above
  try {
    const newUser = await prisma.user.create({
      data: {
        id: clerkUserId,
        email,
        name: name || null,
        image: image || null,
      },
    });

    console.log('[ensureUserExistsWithData] Created new user:', newUser.id);
    return newUser.id;
  } catch (error: any) {
    // P2002 = unique constraint violation — another request already created this user
    if (error?.code === 'P2002') {
      console.log('[ensureUserExistsWithData] User already created by concurrent request:', clerkUserId);
      return clerkUserId;
    }
    throw error;
  }
}
