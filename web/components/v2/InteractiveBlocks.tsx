'use client';
import { useState } from 'react';
import { Check, ChevronDown, Star, Loader2 } from 'lucide-react';
import type { InteractivePayload, InteractiveBlock, ChoiceCardItem, ButtonItem } from '@/lib/interactive-blocks';

interface InteractiveBlocksProps {
    messageId: string;
    payload: InteractivePayload;
    onAction: (actionId: string, responses: Record<string, string>) => Promise<void>;
}

export function InteractiveBlocks({ messageId, payload, onAction }: InteractiveBlocksProps) {
    return (
        <div className="mt-3 space-y-3">
            {payload.blocks.map((block, idx) => (
                <InteractiveBlockRenderer
                    key={`${messageId}-${idx}`}
                    block={block}
                    onAction={onAction}
                />
            ))}
        </div>
    );
}

function InteractiveBlockRenderer({ block, onAction }: { block: InteractiveBlock; onAction: InteractiveBlocksProps['onAction'] }) {
    switch (block.type) {
        case 'choice_cards':
            return <ChoiceCards actionId={block.actionId} items={block.items} onAction={onAction} />;
        case 'buttons':
            return <ActionButtons actionId={block.actionId} items={block.items} onAction={onAction} />;
        case 'select':
            return <SelectDropdown actionId={block.actionId} config={block.config} onAction={onAction} />;
        case 'rating':
            return <RatingInput actionId={block.actionId} config={block.config} onAction={onAction} />;
        default:
            return null;
    }
}

// ═══════════════════════════════════════════════════════
// CHOICE CARDS — batch dropdown choices (identity resolution)
// ═══════════════════════════════════════════════════════

function ChoiceCards({ actionId, items, onAction }: {
    actionId: string;
    items: ChoiceCardItem[];
    onAction: InteractiveBlocksProps['onAction'];
}) {
    const [selections, setSelections] = useState<Record<string, string>>(() => {
        const defaults: Record<string, string> = {};
        items.forEach(item => { defaults[item.id] = item.defaultValue || item.options[0]?.value || ''; });
        return defaults;
    });
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            await onAction(actionId, selections);
            setSubmitted(true);
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        return (
            <div className="flex items-center gap-2 text-xs text-emerald-500 py-2">
                <Check size={14} />
                <span>Responses saved</span>
            </div>
        );
    }

    return (
        <div className="space-y-2">
            {items.map(item => (
                <div key={item.id} className="flex items-center gap-3 p-2.5 rounded-lg border border-border bg-background/50">
                    <div className="flex-1 min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">{item.title}</div>
                        {item.subtitle && <div className="text-[11px] text-muted-foreground truncate">{item.subtitle}</div>}
                    </div>
                    <div className="relative flex-shrink-0">
                        <select
                            value={selections[item.id] || ''}
                            onChange={e => setSelections(prev => ({ ...prev, [item.id]: e.target.value }))}
                            className="appearance-none bg-muted border border-border rounded-lg px-3 py-1.5 pr-7 text-xs text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                        >
                            {item.options.map(opt => (
                                <option key={opt.value} value={opt.value}>{opt.label}</option>
                            ))}
                        </select>
                        <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
                    </div>
                </div>
            ))}
            <button
                onClick={handleSubmit}
                disabled={submitting}
                className="w-full py-2 rounded-lg bg-primary text-primary-foreground text-sm font-medium hover:bg-primary/90 disabled:opacity-50 transition-colors flex items-center justify-center gap-2"
            >
                {submitting ? <Loader2 size={14} className="animate-spin" /> : <Check size={14} />}
                {submitting ? 'Saving...' : 'Confirm All'}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// ACTION BUTTONS — single-click choices (yes/no, outcome)
// ═══════════════════════════════════════════════════════

function ActionButtons({ actionId, items, onAction }: {
    actionId: string;
    items: ButtonItem[];
    onAction: InteractiveBlocksProps['onAction'];
}) {
    const [selected, setSelected] = useState<string | null>(null);
    const [submitting, setSubmitting] = useState(false);

    const handleClick = async (value: string) => {
        setSubmitting(true);
        setSelected(value);
        try {
            await onAction(actionId, { response: value });
        } finally {
            setSubmitting(false);
        }
    };

    if (selected) {
        const item = items.find(i => i.value === selected);
        return (
            <div className="flex items-center gap-2 text-xs text-emerald-500 py-1">
                <Check size={14} />
                <span>{item?.label || selected}</span>
            </div>
        );
    }

    const styleMap: Record<string, string> = {
        primary: 'bg-primary text-primary-foreground hover:bg-primary/90',
        secondary: 'bg-muted text-foreground hover:bg-muted/80 border border-border',
        danger: 'bg-red-500/10 text-red-500 hover:bg-red-500/20 border border-red-500/20',
        success: 'bg-emerald-500/10 text-emerald-500 hover:bg-emerald-500/20 border border-emerald-500/20',
    };

    return (
        <div className="flex flex-wrap gap-2">
            {items.map(item => (
                <button
                    key={item.value}
                    onClick={() => handleClick(item.value)}
                    disabled={submitting}
                    className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors disabled:opacity-50 ${styleMap[item.style || 'secondary']}`}
                >
                    {item.label}
                </button>
            ))}
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// SELECT DROPDOWN — single choice with confirm
// ═══════════════════════════════════════════════════════

function SelectDropdown({ actionId, config, onAction }: {
    actionId: string;
    config: { prompt: string; options: Array<{ label: string; value: string }> };
    onAction: InteractiveBlocksProps['onAction'];
}) {
    const [value, setValue] = useState(config.options[0]?.value || '');
    const [submitted, setSubmitted] = useState(false);
    const [submitting, setSubmitting] = useState(false);

    const handleSubmit = async () => {
        setSubmitting(true);
        try {
            await onAction(actionId, { response: value });
            setSubmitted(true);
        } finally {
            setSubmitting(false);
        }
    };

    if (submitted) {
        const label = config.options.find(o => o.value === value)?.label || value;
        return (
            <div className="flex items-center gap-2 text-xs text-emerald-500 py-1">
                <Check size={14} />
                <span>{label}</span>
            </div>
        );
    }

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{config.prompt}</span>
            <div className="relative">
                <select
                    value={value}
                    onChange={e => setValue(e.target.value)}
                    className="appearance-none bg-muted border border-border rounded-lg px-3 py-1.5 pr-7 text-xs text-foreground cursor-pointer focus:outline-none focus:ring-1 focus:ring-primary"
                >
                    {config.options.map(opt => (
                        <option key={opt.value} value={opt.value}>{opt.label}</option>
                    ))}
                </select>
                <ChevronDown size={12} className="absolute right-2 top-1/2 -translate-y-1/2 pointer-events-none text-muted-foreground" />
            </div>
            <button
                onClick={handleSubmit}
                disabled={submitting}
                className="p-1.5 rounded-lg bg-primary text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            >
                {submitting ? <Loader2 size={12} className="animate-spin" /> : <Check size={12} />}
            </button>
        </div>
    );
}

// ═══════════════════════════════════════════════════════
// RATING — star rating (call feedback, satisfaction)
// ═══════════════════════════════════════════════════════

function RatingInput({ actionId, config, onAction }: {
    actionId: string;
    config: { prompt: string; max: number };
    onAction: InteractiveBlocksProps['onAction'];
}) {
    const [rating, setRating] = useState(0);
    const [hover, setHover] = useState(0);
    const [submitted, setSubmitted] = useState(false);

    const handleClick = async (value: number) => {
        setRating(value);
        setSubmitted(true);
        await onAction(actionId, { rating: String(value) });
    };

    return (
        <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">{config.prompt}</span>
            <div className="flex gap-0.5">
                {Array.from({ length: config.max }, (_, i) => i + 1).map(n => (
                    <button
                        key={n}
                        onClick={() => handleClick(n)}
                        onMouseEnter={() => setHover(n)}
                        onMouseLeave={() => setHover(0)}
                        disabled={submitted}
                        className="p-0.5 transition-colors disabled:cursor-default"
                    >
                        <Star
                            size={16}
                            className={n <= (hover || rating) ? 'fill-amber-400 text-amber-400' : 'text-muted-foreground/30'}
                        />
                    </button>
                ))}
            </div>
            {submitted && <span className="text-xs text-emerald-500">Saved</span>}
        </div>
    );
}
