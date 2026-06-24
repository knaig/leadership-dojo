import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getMyCases, createDraftCase } from '@/lib/actions/builder';
import Link from 'next/link';

export default async function BuilderDashboard() {
    const session = await auth();
    // if (!session?.user) redirect('/');

    const cases = await getMyCases();

    return (
        <div className="min-h-screen bg-[#050505] text-[#E6E8EB] p-8">
            <header className="flex items-center justify-between mb-12">
                <h1 className="text-3xl font-serif">Case Studio</h1>
                <div className="flex gap-4">
                    <Link href="/dashboard" className="text-[#9CA3AF] hover:text-white px-4 py-2">
                        Back to Learning
                    </Link>
                    <form action={async (formData) => {
                        'use server';
                        const id = await createDraftCase("New Untitled Case");
                        redirect(`/builder/${id}`);
                    }}>
                        <button type="submit" className="bg-[#3B82F6] hover:bg-[#2563EB] text-white px-6 py-2 rounded-lg font-medium">
                            + New Case
                        </button>
                    </form>
                </div>
            </header>

            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {cases.map((c) => (
                    <div key={c.id} className="bg-[#0A0E14] border border-white/5 p-6 rounded-xl hover:border-[#3B82F6]/50 transition-colors group">
                        <div className="flex justify-between items-start mb-4">
                            <div className="text-xs font-bold text-[#E6E8EB]/40 uppercase tracking-widest">DRAFT</div>
                            <div className="text-xs text-[#E6E8EB]/40">{c.updatedAt.toLocaleDateString()}</div>
                        </div>

                        <h3 className="text-xl font-medium mb-2 group-hover:text-[#3B82F6] transition-colors">{c.title}</h3>

                        <div className="h-px w-full bg-white/5 my-4" />

                        <Link href={`/builder/${c.id}`} className="inline-flex items-center text-sm text-[#3B82F6] font-medium">
                            Open War Room →
                        </Link>
                    </div>
                ))}

                {cases.length === 0 && (
                    <div className="col-span-full text-center py-20 border border-dashed border-white/10 rounded-xl">
                        <div className="text-lg text-[#9CA3AF] mb-2">No missions created yet.</div>
                        <div className="text-sm text-[#525252]">Your war stories are waiting to be told.</div>
                    </div>
                )}
            </div>
        </div>
    );
}
