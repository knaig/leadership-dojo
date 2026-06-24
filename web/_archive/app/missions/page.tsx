'use client';

import { useEffect, useState } from 'react';
import { MissionStatus } from '@prisma/client';

interface Mission {
    id: string;
    title: string;
    description: string;
    capacity: {
        name: string;
        slug: string;
    };
    targetScore: number;
    baselineScore: number;
    currentScore: number | null;
    deadline: string;
    status: MissionStatus;
    artifactIds: string[];
    scoreChange: number | null;
    validated: boolean;
    validatedAt: string | null;
    validationNotes: string | null;
    startedAt: string | null;
    completedAt: string | null;
    createdAt: string;
}

interface MissionStats {
    total: number;
    active: number;
    inProgress: number;
    completed: number;
    validated: number;
    failed: number;
    averageScoreChange: number;
    successRate: number;
}

export default function MissionsPage() {
    const [missions, setMissions] = useState<Mission[]>([]);
    const [stats, setStats] = useState<MissionStats | null>(null);
    const [loading, setLoading] = useState(true);
    const [filter, setFilter] = useState<MissionStatus | 'ALL'>('ALL');

    useEffect(() => {
        fetchMissions();
        fetchStats();
    }, [filter]);

    const fetchMissions = async () => {
        setLoading(true);
        try {
            const url = filter === 'ALL' ? '/api/missions' : `/api/missions?status=${filter}`;
            const res = await fetch(url);
            const data = await res.json();
            if (data.success) {
                setMissions(data.missions);
            }
        } catch (error) {
            console.error('Error fetching missions:', error);
        } finally {
            setLoading(false);
        }
    };

    const fetchStats = async () => {
        try {
            const res = await fetch('/api/missions?stats=true');
            const data = await res.json();
            if (data.success) {
                setStats(data.stats);
            }
        } catch (error) {
            console.error('Error fetching stats:', error);
        }
    };

    const handleAction = async (missionId: string, action: string) => {
        try {
            const res = await fetch(`/api/missions/${missionId}`, {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ action }),
            });
            const data = await res.json();
            if (data.success) {
                fetchMissions();
                fetchStats();
            }
        } catch (error) {
            console.error('Error updating mission:', error);
        }
    };

    const getStatusColor = (status: MissionStatus) => {
        switch (status) {
            case 'ACTIVE':
                return 'bg-blue-100 text-blue-800';
            case 'IN_PROGRESS':
                return 'bg-yellow-100 text-yellow-800';
            case 'COMPLETED':
                return 'bg-purple-100 text-purple-800';
            case 'VALIDATED':
                return 'bg-green-100 text-green-800';
            case 'FAILED':
                return 'bg-red-100 text-red-800';
            default:
                return 'bg-gray-100 text-gray-800';
        }
    };

    const getStatusActions = (mission: Mission) => {
        switch (mission.status) {
            case 'ACTIVE':
                return (
                    <button
                        onClick={() => handleAction(mission.id, 'start')}
                        className="px-3 py-1 bg-blue-600 text-white rounded-md hover:bg-blue-700 text-sm"
                    >
                        Start Mission
                    </button>
                );
            case 'IN_PROGRESS':
                return (
                    <button
                        onClick={() => handleAction(mission.id, 'complete')}
                        className="px-3 py-1 bg-purple-600 text-white rounded-md hover:bg-purple-700 text-sm"
                    >
                        Mark Complete
                    </button>
                );
            case 'COMPLETED':
                return (
                    <span className="text-sm text-gray-600">Awaiting validation...</span>
                );
            default:
                return null;
        }
    };

    const getDaysRemaining = (deadline: string) => {
        const days = Math.ceil((new Date(deadline).getTime() - Date.now()) / (1000 * 60 * 60 * 24));
        if (days < 0) return <span className="text-red-600">Overdue by {Math.abs(days)} days</span>;
        if (days === 0) return <span className="text-orange-600">Due today</span>;
        if (days <= 3) return <span className="text-orange-600">{days} days left</span>;
        return <span className="text-gray-600">{days} days left</span>;
    };

    return (
        <div className="min-h-screen bg-gradient-to-br from-slate-50 to-blue-50 p-8">
            <div className="max-w-7xl mx-auto">
                {/* Header */}
                <div className="mb-8">
                    <h1 className="text-4xl font-bold text-gray-900 mb-2">Practice Missions</h1>
                    <p className="text-gray-600">
                        Track your leadership development through targeted practice missions
                    </p>
                </div>

                {/* Stats Cards */}
                {stats && (
                    <div className="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8">
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <div className="text-3xl font-bold text-blue-600">{stats.active + stats.inProgress}</div>
                            <div className="text-sm text-gray-600">Active Missions</div>
                        </div>
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <div className="text-3xl font-bold text-green-600">{stats.validated}</div>
                            <div className="text-sm text-gray-600">Validated</div>
                        </div>
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <div className="text-3xl font-bold text-purple-600">
                                {stats.averageScoreChange > 0 ? '+' : ''}
                                {stats.averageScoreChange.toFixed(1)}
                            </div>
                            <div className="text-sm text-gray-600">Avg Score Change</div>
                        </div>
                        <div className="bg-white rounded-lg shadow-sm p-6">
                            <div className="text-3xl font-bold text-indigo-600">
                                {stats.successRate.toFixed(0)}%
                            </div>
                            <div className="text-sm text-gray-600">Success Rate</div>
                        </div>
                    </div>
                )}

                {/* Filter Tabs */}
                <div className="flex gap-2 mb-6 overflow-x-auto">
                    {['ALL', 'ACTIVE', 'IN_PROGRESS', 'COMPLETED', 'VALIDATED', 'FAILED'].map((status) => (
                        <button
                            key={status}
                            onClick={() => setFilter(status as MissionStatus | 'ALL')}
                            className={`px-4 py-2 rounded-lg font-medium whitespace-nowrap transition-colors ${filter === status
                                    ? 'bg-blue-600 text-white'
                                    : 'bg-white text-gray-700 hover:bg-gray-100'
                                }`}
                        >
                            {status.replace('_', ' ')}
                        </button>
                    ))}
                </div>

                {/* Missions List */}
                {loading ? (
                    <div className="text-center py-12">
                        <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-blue-600 mx-auto"></div>
                        <p className="text-gray-600 mt-4">Loading missions...</p>
                    </div>
                ) : missions.length === 0 ? (
                    <div className="bg-white rounded-lg shadow-sm p-12 text-center">
                        <p className="text-gray-600 text-lg">No missions found</p>
                        <p className="text-gray-500 mt-2">
                            Visit the Recommendations page to get personalized practice missions
                        </p>
                    </div>
                ) : (
                    <div className="space-y-4">
                        {missions.map((mission) => (
                            <div
                                key={mission.id}
                                className="bg-white rounded-lg shadow-sm p-6 hover:shadow-md transition-shadow"
                            >
                                <div className="flex items-start justify-between mb-4">
                                    <div className="flex-1">
                                        <div className="flex items-center gap-3 mb-2">
                                            <h3 className="text-xl font-semibold text-gray-900">{mission.title}</h3>
                                            <span className={`px-3 py-1 rounded-full text-xs font-medium ${getStatusColor(mission.status)}`}>
                                                {mission.status.replace('_', ' ')}
                                            </span>
                                        </div>
                                        <p className="text-gray-600 mb-3">{mission.description}</p>
                                        <div className="flex items-center gap-4 text-sm text-gray-500">
                                            <span className="font-medium text-blue-600">{mission.capacity.name}</span>
                                            <span>•</span>
                                            <span>{getDaysRemaining(mission.deadline)}</span>
                                            <span>•</span>
                                            <span>{mission.artifactIds.length} evidence artifacts</span>
                                        </div>
                                    </div>
                                    <div className="ml-4">{getStatusActions(mission)}</div>
                                </div>

                                {/* Progress Bar */}
                                <div className="mb-4">
                                    <div className="flex justify-between text-sm mb-1">
                                        <span className="text-gray-600">Progress</span>
                                        <span className="text-gray-900 font-medium">
                                            {mission.currentScore !== null
                                                ? `${mission.currentScore.toFixed(1)} / ${mission.targetScore.toFixed(1)}`
                                                : `Baseline: ${mission.baselineScore.toFixed(1)}`}
                                        </span>
                                    </div>
                                    <div className="w-full bg-gray-200 rounded-full h-2">
                                        <div
                                            className="bg-blue-600 h-2 rounded-full transition-all"
                                            style={{
                                                width: `${Math.min(
                                                    ((mission.currentScore || mission.baselineScore) / mission.targetScore) * 100,
                                                    100
                                                )}%`,
                                            }}
                                        ></div>
                                    </div>
                                </div>

                                {/* Validation Info */}
                                {mission.validated && (
                                    <div className={`mt-4 p-4 rounded-lg ${mission.status === 'VALIDATED' ? 'bg-green-50' : 'bg-red-50'}`}>
                                        <div className="flex items-center gap-2 mb-2">
                                            <span className={`font-semibold ${mission.status === 'VALIDATED' ? 'text-green-800' : 'text-red-800'}`}>
                                                {mission.status === 'VALIDATED' ? '✓ Mission Validated' : '✗ Mission Failed'}
                                            </span>
                                            {mission.scoreChange !== null && (
                                                <span className={`text-sm ${mission.scoreChange >= 0 ? 'text-green-700' : 'text-red-700'}`}>
                                                    ({mission.scoreChange >= 0 ? '+' : ''}{mission.scoreChange.toFixed(1)} points)
                                                </span>
                                            )}
                                        </div>
                                        {mission.validationNotes && (
                                            <p className="text-sm text-gray-700">{mission.validationNotes}</p>
                                        )}
                                    </div>
                                )}
                            </div>
                        ))}
                    </div>
                )}
            </div>
        </div>
    );
}
