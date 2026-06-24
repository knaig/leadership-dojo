interface AttendeeChipProps {
  name: string;
  role: string | null;
  whatWorks: string | null;
  watchFor: string | null;
  sharedContext?: string | null;
}

export function AttendeeChip({ name, role, whatWorks, watchFor, sharedContext }: AttendeeChipProps) {
  const hasIntel = whatWorks || watchFor || sharedContext;

  return (
    <div className={`p-3 rounded-lg border ${hasIntel ? 'bg-secondary/50 border-border' : 'bg-muted/30 border-dashed border-border'}`}>
      <div className="flex items-center justify-between">
        <div className="font-medium text-sm">{name}</div>
        {!hasIntel && (
          <span className="text-[10px] px-1.5 py-0.5 rounded bg-amber-500/10 text-amber-600 dark:text-amber-400">
            Low intel
          </span>
        )}
      </div>
      {role && <div className="text-xs text-muted-foreground">{role}</div>}
      {whatWorks && (
        <div className="text-xs text-green-700 dark:text-green-400 mt-1.5">✓ {whatWorks}</div>
      )}
      {watchFor && (
        <div className="text-xs text-amber-700 dark:text-amber-400 mt-0.5">⚠ {watchFor}</div>
      )}
      {sharedContext && (
        <div className="text-xs text-muted-foreground mt-0.5">{sharedContext}</div>
      )}
      {!hasIntel && (
        <div className="text-xs text-muted-foreground/60 mt-1 italic">
          Tell Mira about {name.split(' ')[0]} to get intel
        </div>
      )}
    </div>
  );
}
