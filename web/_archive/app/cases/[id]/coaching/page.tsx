import { prisma } from '@/lib/db';
import CoachingDashboard from '@/components/coaching/CoachingDashboard';
import { loadCaseById } from '@/lib/cases/loader'; // Fallback

export default async function CoachingPage({ params }: { params: { id: string } }) {
    // 1. Try DB first (Platform Mode)
    // Note: params used to be a promise in some versions, but in 16.1.1 standard usage is awaited or sync depending on config.
    // Assuming sync for simplicity, or we await it.
    const { id } = await params;

    let caseData = null;

    // DB Fetch
    const dbCase = await prisma.case.findUnique({
        where: { slug: id }
    });

    if (dbCase) {
        caseData = { title: dbCase.title, id: dbCase.id };
    } else {
        // Fallback to legacy loader
        const legacy = loadCaseById(id);
        if (legacy) {
            caseData = { title: legacy.title, id: legacy.id };
        }
    }

    if (!caseData) {
        return (
            <div className="min-h-screen bg-[#0A0E14] flex items-center justify-center text-white">
                Case Not Found: {id}
            </div>
        );
    }

    return <CoachingDashboard caseData={caseData} />;
}
