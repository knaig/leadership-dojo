import { auth } from '@/auth';
import { redirect } from 'next/navigation';
import { getBuilderCase } from '@/lib/actions/builder';
import Link from 'next/link';

export default async function WarRoomPage(props: { params: Promise<{ id: string }> }) {
    const params = await props.params;
    const session = await auth();
    // if (!session?.user) redirect('/');

    const caseData = await getBuilderCase(params.id);

    if (!caseData) {
        return <div>Case not found</div>;
    }

    return (
        <div className="h-screen bg-[#050505] text-[#E6E8EB] flex flex-col">
            {/* Header */}
            <header className="h-16 border-b border-white/5 flex items-center justify-between px-6 bg-[#0A0E14]">
                <div className="flex items-center gap-4">
                    <Link href="/builder" className="text-[#9CA3AF] hover:text-white">← Needs Saving</Link>
                    <div className="h-6 w-px bg-white/10" />
                    <h1 className="font-serif font-bold text-lg">{caseData.title}</h1>
                    <span className="px-2 py-0.5 rounded bg-yellow-500/10 text-yellow-500 text-xs font-bold tracking-widest border border-yellow-500/20">
                        DRAFT
                    </span>
                </div>
                <div className="flex gap-3">
                    <button className="text-sm bg-white/5 hover:bg-white/10 px-4 py-2 rounded-lg">
                        Preview
                    </button>
                    <button className="text-sm bg-[#3B82F6] hover:bg-[#2563EB] text-white px-4 py-2 rounded-lg font-medium">
                        Save Changes
                    </button>
                </div>
            </header>

            {/* Main Workspace */}
            <div className="flex-1 flex overflow-hidden">

                {/* Navigation Sidebar */}
                <div className="w-64 bg-[#0A0E14] border-r border-white/5 flex flex-col">
                    <div className="p-4 space-y-1">
                        <div className="text-xs font-bold text-[#525252] uppercase tracking-widest mb-2 px-2">Outline</div>
                        <button className="w-full text-left px-3 py-2 rounded bg-[#3B82F6]/10 text-[#3B82F6] text-sm font-medium">1. Context & Setup</button>
                        <button className="w-full text-left px-3 py-2 rounded hover:bg-white/5 text-[#9CA3AF] text-sm">2. Stakeholders</button>
                        <button className="w-full text-left px-3 py-2 rounded hover:bg-white/5 text-[#9CA3AF] text-sm">3. The Email (R1)</button>
                        <button className="w-full text-left px-3 py-2 rounded hover:bg-white/5 text-[#9CA3AF] text-sm">4. The Trap (R2)</button>
                        <button className="w-full text-left px-3 py-2 rounded hover:bg-white/5 text-[#9CA3AF] text-sm">5. Outcome (R3)</button>
                    </div>

                    <div className="mt-auto p-4 border-t border-white/5">
                        <button className="flex items-center gap-2 w-full justify-center p-3 rounded-xl bg-gradient-to-r from-purple-500/20 to-blue-500/20 border border-purple-500/30 hover:border-purple-500/50 transition-colors">
                            <span className="text-lg">✨</span>
                            <span className="font-medium bg-clip-text text-transparent bg-gradient-to-r from-purple-400 to-blue-400">AI Auto-Fill</span>
                        </button>
                    </div>
                </div>

                {/* Editor Canvas */}
                <div className="flex-1 overflow-y-auto p-12 max-w-4xl mx-auto">
                    <h2 className="text-2xl font-serif mb-8">Context & Setup</h2>

                    <div className="space-y-6">
                        <div>
                            <label className="block text-sm font-medium text-[#9CA3AF] mb-2">Internal Title</label>
                            <input
                                type="text"
                                defaultValue={caseData.title}
                                className="w-full bg-[#0F141C] border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-[#3B82F6]"
                            />
                        </div>

                        <div>
                            <label className="block text-sm font-medium text-[#9CA3AF] mb-2">The Situation (Prompt)</label>
                            <p className="text-xs text-[#525252] mb-2">What is the "messy reality" the leader is walking into?</p>
                            <textarea
                                defaultValue={caseData.content.context?.description}
                                className="w-full h-40 bg-[#0F141C] border border-white/10 rounded-lg p-3 text-white focus:outline-none focus:border-[#3B82F6]"
                                placeholder="e.g. You are advising the Minister of Health on a new AI procurement..."
                            />
                        </div>

                        <div className="grid grid-cols-2 gap-6">
                            <div>
                                <label className="block text-sm font-medium text-[#9CA3AF] mb-2">Country / Region</label>
                                <input type="text" defaultValue={caseData.content.meta?.country} className="w-full bg-[#0F141C] border border-white/10 rounded-lg p-3 text-white" />
                            </div>
                            <div>
                                <label className="block text-sm font-medium text-[#9CA3AF] mb-2">Role</label>
                                <input type="text" defaultValue={caseData.content.meta?.role} className="w-full bg-[#0F141C] border border-white/10 rounded-lg p-3 text-white" />
                            </div>
                        </div>
                    </div>

                    {/* AI Action Form */}
                    <form action={async (formData) => {
                        'use server';
                        const { generateCaseFromDescription } = await import('@/lib/actions/ai_builder');
                        const desc = formData.get('description') as string;
                        if (desc) {
                            await generateCaseFromDescription(params.id, desc);
                            redirect(`/builder/${params.id}`);
                        }
                    }} className="mt-12 pt-8 border-t border-white/10">
                        <h3 className="text-lg font-medium mb-4 flex items-center gap-2">
                            <span className="text-xl">✨</span> AI Assistance
                        </h3>
                        <div className="bg-gradient-to-r from-[#3B82F6]/10 to-purple-500/10 p-6 rounded-xl border border-white/5">
                            <label className="block text-sm text-[#E6E8EB] mb-2">Auto-Fill from Description</label>
                            <div className="flex gap-4">
                                <input name="description" placeholder="Describe the messy reality..." className="flex-1 bg-[#0A0E14] border border-white/10 rounded-lg px-4" />
                                <button type="submit" className="bg-white text-black font-medium px-6 py-2 rounded-lg hover:bg-gray-200">
                                    Generate
                                </button>
                            </div>
                        </div>
                    </form>
                </div>

            </div>
        </div>
    );
}
