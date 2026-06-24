import { NextResponse } from 'next/server';
import { auth } from '@/auth';
import { prisma } from '@/lib/db';
import { encryptApiKey, decryptApiKey, getApiKeyPreview } from '@/lib/encryption';

export const dynamic = 'force-dynamic';

// GET - List user's API keys
export async function GET() {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email },
      include: {
        apiKeys: {
          select: {
            id: true,
            provider: true,
            keyPreview: true,
            isActive: true,
            lastUsed: true,
            createdAt: true,
          }
        }
      }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ apiKeys: user.apiKeys });
  } catch (error: any) {
    console.error('Get API keys error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// POST - Add new API key
export async function POST(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { provider, apiKey } = await req.json();

    if (!provider || !apiKey) {
      return NextResponse.json(
        { error: 'Provider and API key are required' },
        { status: 400 }
      );
    }

    if (provider !== 'openai' && provider !== 'anthropic' && provider !== 'perplexity' && provider !== 'gemini') {
      return NextResponse.json(
        { error: 'Invalid provider. Must be "openai", "anthropic", "perplexity" or "gemini"' },
        { status: 400 }
      );
    }

    // Validate API key format
    if (provider === 'openai' && !apiKey.startsWith('sk-')) {
      return NextResponse.json(
        { error: 'Invalid OpenAI API key format' },
        { status: 400 }
      );
    }

    if (provider === 'anthropic' && !apiKey.startsWith('sk-ant-')) {
      return NextResponse.json(
        { error: 'Invalid Anthropic API key format' },
        { status: 400 }
      );
    }

    if (provider === 'perplexity' && !apiKey.startsWith('pplx-')) {
      return NextResponse.json(
        { error: 'Invalid Perplexity API key format (must start with pplx-)' },
        { status: 400 }
      );
    }

    if (provider === 'gemini' && !apiKey.startsWith('AIza')) {
      return NextResponse.json(
        { error: 'Invalid Gemini API key format (must start with AIza)' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Encrypt the API key
    const encryptedKey = encryptApiKey(apiKey);
    const keyPreview = getApiKeyPreview(apiKey);

    // Create or update API key
    const userApiKey = await prisma.userApiKey.upsert({
      where: {
        userId_provider: {
          userId: user.id,
          provider,
        }
      },
      update: {
        encryptedKey,
        keyPreview,
        isActive: true,
      },
      create: {
        userId: user.id,
        provider,
        encryptedKey,
        keyPreview,
        isActive: true,
      },
      select: {
        id: true,
        provider: true,
        keyPreview: true,
        isActive: true,
        createdAt: true,
      }
    });

    return NextResponse.json({ apiKey: userApiKey });
  } catch (error: any) {
    console.error('Add API key error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}

// DELETE - Remove API key
export async function DELETE(req: Request) {
  try {
    const session = await auth();

    if (!session?.user?.email) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const { searchParams } = new URL(req.url);
    const keyId = searchParams.get('id');

    if (!keyId) {
      return NextResponse.json(
        { error: 'Key ID is required' },
        { status: 400 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { email: session.user.email }
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // Verify the key belongs to the user
    const apiKey = await prisma.userApiKey.findUnique({
      where: { id: keyId }
    });

    if (!apiKey || apiKey.userId !== user.id) {
      return NextResponse.json(
        { error: 'API key not found' },
        { status: 404 }
      );
    }

    await prisma.userApiKey.delete({
      where: { id: keyId }
    });

    return NextResponse.json({ success: true });
  } catch (error: any) {
    console.error('Delete API key error:', error);
    return NextResponse.json(
      { error: 'Internal server error' },
      { status: 500 }
    );
  }
}
