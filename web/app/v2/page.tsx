'use client';
import { TodayBrief } from '@/components/v2/TodayBrief';

export default function HomePage() {
    return (
        <div className="flex-1 overflow-y-auto">
            <TodayBrief />
        </div>
    );
}
