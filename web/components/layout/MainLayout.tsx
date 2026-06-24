import { TopNav } from './TopNav';

export default function MainLayout({ children }: { children: React.ReactNode }) {
    return (
        <div className="min-h-screen bg-background text-foreground font-sans selection:bg-primary/30 selection:text-foreground">
            <TopNav />
            <main className="w-full min-h-screen pt-24 px-8">
                {children}
            </main>
        </div>
    );
}

