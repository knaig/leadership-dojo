import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { put } from '@vercel/blob';
import { prisma } from '@/lib/prisma';
import { ensureUserExists } from '@/lib/ensure-user';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const ALLOWED_TYPES = [
    'application/pdf',
    'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet', // .xlsx
    'application/vnd.ms-excel', // .xls
    'text/csv',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document', // .docx
    'text/plain',
];

/**
 * POST /api/upload
 * Upload a document (role doc, org chart, spreadsheet) to Vercel Blob.
 * Accepts multipart/form-data with fields: file, purpose
 */
export async function POST(req: NextRequest) {
    const { userId } = await auth();
    if (!userId) {
        return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    await ensureUserExists(userId);

    try {
        const formData = await req.formData();
        const file = formData.get('file') as File | null;
        const purpose = (formData.get('purpose') as string) || 'context';

        if (!file) {
            return NextResponse.json({ error: 'No file provided' }, { status: 400 });
        }

        if (file.size > MAX_FILE_SIZE) {
            return NextResponse.json({ error: 'File too large (max 10MB)' }, { status: 400 });
        }

        if (!ALLOWED_TYPES.includes(file.type)) {
            return NextResponse.json({
                error: `Unsupported file type. Allowed: PDF, XLSX, XLS, CSV, DOCX, TXT`,
            }, { status: 400 });
        }

        // Upload to Vercel Blob
        const blob = await put(`uploads/${userId}/${Date.now()}-${file.name}`, file, {
            access: 'public',
            addRandomSuffix: true,
        });

        // Parse content for spreadsheets/CSV
        let parsedData = null;
        if (file.type === 'text/csv' || file.type.includes('spreadsheet') || file.type.includes('excel')) {
            parsedData = await parseSpreadsheet(file);
        } else if (file.type === 'text/plain') {
            parsedData = { text: await file.text() };
        }

        // Save record
        const doc = await prisma.uploadedDocument.create({
            data: {
                userId,
                filename: file.name,
                blobUrl: blob.url,
                mimeType: file.type,
                sizeBytes: file.size,
                purpose,
                parsed: parsedData !== null,
                parsedData,
            },
        });

        // Mark context step in onboarding progress
        const user = await prisma.user.findUnique({
            where: { id: userId },
            select: { onboardingProgress: true },
        });
        const progress = {
            ...(user?.onboardingProgress as Record<string, boolean> || {}),
            context: true,
        };
        await prisma.user.update({
            where: { id: userId },
            data: { onboardingProgress: progress },
        });

        return NextResponse.json({
            id: doc.id,
            filename: doc.filename,
            url: blob.url,
            parsed: doc.parsed,
            parsedData: doc.parsedData,
        });
    } catch (error) {
        console.error('[Upload] Error:', error);
        return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
    }
}

async function parseSpreadsheet(file: File): Promise<Record<string, unknown> | null> {
    try {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const workbook = XLSX.read(buffer, { type: 'array' });

        const result: Record<string, unknown[]> = {};
        for (const sheetName of workbook.SheetNames) {
            const sheet = workbook.Sheets[sheetName];
            result[sheetName] = XLSX.utils.sheet_to_json(sheet);
        }

        return result;
    } catch (error) {
        console.error('[Upload] Spreadsheet parse error:', error);
        return null;
    }
}
