import { MeetingHub } from '@/components/meetings/MeetingHub';
import { MeetingBlueprint } from '@/components/meetings/MeetingBlueprint';

export default function MeetingsPage() {
    return (
        <div className="flex-1 overflow-y-auto">
            <MeetingHub />
            <MeetingBlueprint />
        </div>
    );
}
