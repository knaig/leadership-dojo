"use client";

import { useState, useEffect } from "react";
import { NetworkGraph } from "@/components/context/NetworkGraph";
import { Shell } from "@/components/v2/Shell";
// import { StakeholderProfile } from "@prisma/client"; // Can't import from client

export default function ContextGardenPage() {
    const [stakeholders, setStakeholders] = useState<any[]>([]);
    const [loading, setLoading] = useState(true);
    const [viewMode, setViewMode] = useState<'list' | 'graph'>('graph');

    const [isAddModalOpen, setIsAddModalOpen] = useState(false);
    const [newName, setNewName] = useState("");
    const [newRole, setNewRole] = useState("Peer");
    const [newValueExchange, setNewValueExchange] = useState("");
    const [newPoliticalCapital, setNewPoliticalCapital] = useState("");

    useEffect(() => {
        fetchStakeholders();
    }, []);

    const fetchStakeholders = async () => {
        try {
            const res = await fetch("/api/context/stakeholders");
            const data = await res.json();
            setStakeholders(data);
        } catch (e) {
            console.error(e);
        } finally {
            setLoading(false);
        }
    };

    const handleVerify = async (id: string, newStatus: string) => {
        if (newStatus === "ARCHIVED") {
            if (!confirm("Are you sure you want to remove this person from your graph?")) return;

            // Optimistic delete
            setStakeholders(prev => prev.filter(s => s.id !== id));
            await fetch(`/api/context/stakeholders/${id}`, { method: "DELETE" });
            return;
        }

        // Optimistic update
        setStakeholders(prev => prev.map(s => s.id === id ? { ...s, validationStatus: newStatus } : s));
        await fetch(`/api/context/stakeholders/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ validationStatus: newStatus, lastValidatedAt: new Date() })
        });
    };

    const handleUpdate = async (id: string, updates: any) => {
        setStakeholders(prev => prev.map(s => s.id === id ? { ...s, ...updates } : s));
        await fetch(`/api/context/stakeholders/${id}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify(updates)
        });
    };

    const handleAddPerson = async () => {
        if (!newName) return;

        const name = newName;
        const role = newRole;
        const valueExchange = newValueExchange;
        const politicalCapital = newPoliticalCapital;

        // Temporary ID for optimistic UI
        const tempId = "temp-" + Date.now();
        const newPerson = {
            id: tempId,
            name,
            role,
            valueExchange,
            politicalCapital,
            influenceLevel: "low",
            relationshipStrength: 0.5,
            validationStatus: "VERIFIED",
            interactionCount: 0
        };

        setStakeholders(prev => [newPerson, ...prev]);
        setIsAddModalOpen(false); // Close Modal immediately
        setNewName("");
        setNewRole("Peer");
        setNewValueExchange("");
        setNewPoliticalCapital("");

        try {
            const res = await fetch("/api/context/stakeholders", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({ name, role, valueExchange, politicalCapital })
            });
            if (res.ok) {
                const saved = await res.json();
                // Replace temp with real
                setStakeholders(prev => prev.map(p => p.id === tempId ? saved : p));
            }
        } catch (e) {
            alert("Failed to save person.");
            setStakeholders(prev => prev.filter(p => p.id !== tempId));
        }
    };

    const verifiedStakeholders = stakeholders.filter(s => s.validationStatus === 'VERIFIED');
    const draftStakeholders = stakeholders.filter(s => s.validationStatus === 'DRAFT');

    return (
        <Shell>
            <div className="p-8 max-w-7xl mx-auto relative">
                {/* ADD PERSON MODAL */}
                {isAddModalOpen && (
                    <div className="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
                        <div className="bg-card rounded-xl shadow-2xl p-6 w-full max-w-md border border-border">
                            <h3 className="text-xl font-bold mb-4 text-foreground">Add Stakeholder</h3>

                            <div className="space-y-4">
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">Name</label>
                                    <input
                                        autoFocus
                                        type="text"
                                        className="w-full bg-background border border-input rounded-lg p-2 text-foreground"
                                        placeholder="e.g. Jai Shankar"
                                        value={newName}
                                        onChange={(e) => setNewName(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">Role</label>
                                    <select
                                        className="w-full bg-background border border-input rounded-lg p-2 text-foreground"
                                        value={newRole}
                                        onChange={(e) => setNewRole(e.target.value)}
                                    >
                                        <option value="Peer">Peer</option>
                                        <option value="Direct Report">Direct Report</option>
                                        <option value="Manager">Manager</option>
                                        <option value="Decision Maker">Decision Maker</option>
                                        <option value="Sponsor">Sponsor</option>
                                        <option value="Gatekeeper">Gatekeeper</option>
                                        <option value="Champion">Champion</option>
                                        <option value="Influencer">Influencer</option>
                                        <option value="Blocker">Blocker</option>
                                        <option value="Detractor">Detractor</option>
                                        <option value="Neutral">Neutral</option>
                                    </select>
                                </div>

                                {/* CURRENCY & LEVERAGE */}
                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">Value Exchange (Gives/Gets)</label>
                                    <textarea
                                        className="w-full bg-background border border-input rounded-lg p-2 text-foreground text-sm min-h-[60px]"
                                        placeholder="What do they want? What can you give? (e.g. Wants visibility, Gives budget)"
                                        value={newValueExchange}
                                        onChange={(e) => setNewValueExchange(e.target.value)}
                                    />
                                </div>

                                <div>
                                    <label className="block text-sm font-medium text-muted-foreground mb-1">Political Capital (Leverage)</label>
                                    <textarea
                                        className="w-full bg-background border border-input rounded-lg p-2 text-foreground text-sm min-h-[60px]"
                                        placeholder="High/Med/Low? Why are they important? (e.g. Controls final approval)"
                                        value={newPoliticalCapital}
                                        onChange={(e) => setNewPoliticalCapital(e.target.value)}
                                    />
                                </div>
                            </div>

                            <div className="mt-6 flex justify-end gap-3">
                                <button
                                    onClick={() => setIsAddModalOpen(false)}
                                    className="px-4 py-2 text-muted-foreground hover:bg-accent rounded-lg"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={handleAddPerson}
                                    className="px-4 py-2 bg-primary text-primary-foreground rounded-lg hover:opacity-90 disabled:opacity-50"
                                    disabled={!newName}
                                >
                                    Save
                                </button>
                            </div>
                        </div>
                    </div>
                )}

                <header className="mb-8 flex justify-between items-end">
                    <div>
                        <h1 className="text-3xl font-bold tracking-tight mb-2 text-foreground">The Context Garden 🌿</h1>
                        <p className="text-muted-foreground">
                            Map your political landscape. The AI uses this to safeguard its advice.
                        </p>
                    </div>
                    <div className="flex gap-4">
                        <div className="bg-muted p-1 rounded-lg flex text-sm font-medium">
                            <button
                                onClick={() => setViewMode('list')}
                                className={`px-3 py-1.5 rounded-md transition-colors ${viewMode === 'list' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                List View
                            </button>
                            <button
                                onClick={() => setViewMode('graph')}
                                className={`px-3 py-1.5 rounded-md transition-colors ${viewMode === 'graph' ? 'bg-background shadow text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                            >
                                Network Graph
                            </button>
                        </div>
                        <button
                            onClick={() => { setIsAddModalOpen(true); }}
                            className="bg-primary text-primary-foreground px-4 py-2 rounded-lg text-sm font-medium hover:opacity-90 transition-colors flex items-center gap-2"
                        >
                            <span>+</span> Add Person
                        </button>
                    </div>
                </header>

                {viewMode === 'graph' && (
                    <div className="mb-12">
                        <NetworkGraph stakeholders={verifiedStakeholders} />
                        <p className="text-xs text-center text-muted-foreground mt-2">
                            Visualizing {verifiedStakeholders.length} verified relationships.
                            (Drafts are not shown in the graph until verified).
                        </p>
                    </div>
                )}

                {viewMode === 'list' && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-8">
                        {/* DRAFT COLUMN (To Be Verified) */}
                        <section className="bg-amber-50/5 dark:bg-amber-900/10 p-6 rounded-xl border border-amber-100 dark:border-amber-900/20">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-foreground">
                                <span>🌱</span> Drafts (Detected)
                                <span className="text-xs bg-amber-200 text-amber-800 dark:bg-amber-900 dark:text-amber-100 px-2 py-1 rounded-full">{draftStakeholders.length}</span>
                            </h2>
                            <div className="space-y-4">
                                {draftStakeholders.map(s => (
                                    <StakeholderCard key={s.id} stakeholder={s} onVerify={handleVerify} onUpdate={handleUpdate} />
                                ))}
                                {draftStakeholders.length === 0 && (
                                    <div className="text-muted-foreground text-sm italic">No new drafts found.</div>
                                )}
                            </div>
                        </section>

                        {/* VERIFIED COLUMN (The Graph) */}
                        <section className="bg-card p-6 rounded-xl border border-border shadow-sm">
                            <h2 className="text-xl font-semibold mb-4 flex items-center gap-2 text-foreground">
                                <span>🌳</span> The Graph (Trusted)
                                <span className="text-xs bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-100 px-2 py-1 rounded-full">{verifiedStakeholders.length}</span>
                            </h2>
                            <div className="space-y-4">
                                {verifiedStakeholders.map(s => (
                                    <StakeholderCard key={s.id} stakeholder={s} onVerify={handleVerify} onUpdate={handleUpdate} isVerified />
                                ))}
                                {verifiedStakeholders.length === 0 && (
                                    <div className="text-muted-foreground text-sm italic">Your graph is empty. Verify drafts or add people manually.</div>
                                )}
                            </div>
                        </section>
                    </div>
                )}
            </div>
        </Shell>
    );
}

function StakeholderCard({ stakeholder, onVerify, onUpdate, isVerified = false }: any) {
    return (
        <div className={`p-4 rounded-lg border ${isVerified ? 'bg-white border-gray-200' : 'bg-white border-amber-200 dashed-border'}`}>
            <div className="flex justify-between items-start mb-2">
                <div>
                    <h3 className="font-semibold">{stakeholder.name}</h3>
                    <p className="text-sm text-gray-500">{stakeholder.role || "Unknown Role"}</p>
                </div>
                <div className="flex gap-2">
                    {isVerified ? (
                        <button onClick={() => onVerify(stakeholder.id, "ARCHIVED")} className="text-xs text-gray-400 hover:text-red-500">Remove</button>
                    ) : (
                        <>
                            <button onClick={() => onVerify(stakeholder.id, "ARCHIVED")} className="text-xs text-gray-400 hover:text-red-500 px-2">Ignore</button>
                            <button onClick={() => onVerify(stakeholder.id, "VERIFIED")} className="text-xs bg-green-600 text-white px-3 py-1 rounded hover:bg-green-700 font-medium">Verify</button>
                        </>
                    )}
                </div>
            </div>

            {/* Editable Fields */}
            <div className="grid grid-cols-2 gap-2 mt-3">
                <select
                    className="text-xs border rounded p-1"
                    value={stakeholder.role === "Unknown" ? "" : stakeholder.role || ""}
                    onChange={(e) => onUpdate(stakeholder.id, { role: e.target.value })}
                >
                    <option value="">Select Role...</option>
                    <option value="Peer">Peer</option>
                    <option value="Direct Report">Direct Report</option>
                    <option value="Manager">Manager</option>
                    <option value="Decision Maker">Decision Maker</option>
                    <option value="Sponsor">Sponsor</option>
                    <option value="Gatekeeper">Gatekeeper</option>
                    <option value="Champion">Champion</option>
                    <option value="Influencer">Influencer</option>
                    <option value="Blocker">Blocker</option>
                    <option value="Detractor">Detractor</option>
                    <option value="Neutral">Neutral</option>
                </select>

                <select
                    className="text-xs border rounded p-1"
                    value={stakeholder.influenceLevel || "low"}
                    onChange={(e) => onUpdate(stakeholder.id, { influenceLevel: e.target.value })}
                >
                    <option value="low">Low Influence</option>
                    <option value="medium">Medium Influence</option>
                    <option value="high">High Influence</option>
                </select>
            </div>
        </div>
    );
}
