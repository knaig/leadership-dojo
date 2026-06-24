import { describe, it, expect } from 'vitest';
import { assemblePrompt, pickFirstMessage } from '../lib/prompt-service';

describe('assemblePrompt', () => {
    it('replaces simple variables', () => {
        const template = 'Hello {{userName}}, your meeting is at {{meetingTime}}.';
        const result = assemblePrompt(template, {
            userName: 'Karthik',
            meetingTime: '2:00 PM',
        });
        expect(result).toBe('Hello Karthik, your meeting is at 2:00 PM.');
    });

    it('replaces missing variables with empty string', () => {
        const template = 'Hello {{userName}}. Context: {{additionalContext}}';
        const result = assemblePrompt(template, { userName: 'Karthik' });
        expect(result).toBe('Hello Karthik. Context:');
    });

    it('handles simple if conditionals (truthy)', () => {
        const template = '{{#if meetingDesiredOutcome}}Goal: {{meetingDesiredOutcome}}{{/if}}';
        const result = assemblePrompt(template, { meetingDesiredOutcome: 'Get budget approved' });
        expect(result).toBe('Goal: Get budget approved');
    });

    it('handles simple if conditionals (falsy)', () => {
        const template = '{{#if meetingDesiredOutcome}}Goal: {{meetingDesiredOutcome}}{{/if}} Rest of prompt.';
        const result = assemblePrompt(template, {});
        expect(result).toBe('Rest of prompt.');
    });

    it('handles equality conditionals', () => {
        const template = '{{#if confidenceMode == "LEARNING"}}Ask questions only.{{/if}}{{#if confidenceMode == "COACHING"}}Be direct.{{/if}}';
        const result = assemblePrompt(template, { confidenceMode: 'LEARNING' });
        expect(result).toBe('Ask questions only.');
    });

    it('handles multiline templates', () => {
        const template = `You are Mira.

{{voiceRules}}

## MEETING
{{meetingTitle}}`;
        const result = assemblePrompt(template, {
            voiceRules: 'Keep it short.',
            meetingTitle: 'Leadership Review',
        });
        expect(result).toContain('Keep it short.');
        expect(result).toContain('Leadership Review');
    });

    it('handles nested variables inside conditionals', () => {
        const template = '{{#if meetingStakes}}- Stakes: {{meetingStakes}}{{/if}}';
        const result = assemblePrompt(template, { meetingStakes: 'High — board decision' });
        expect(result).toBe('- Stakes: High — board decision');
    });
});

describe('pickFirstMessage', () => {
    it('picks from array and replaces variables', () => {
        const options = ['Hey {{userName}}. Ready?', 'Morning {{userName}}.'];
        const result = pickFirstMessage(options, { userName: 'Karthik' });
        expect(result).toMatch(/Karthik/);
    });

    it('returns default greeting when options is null', () => {
        const result = pickFirstMessage(null, { userName: 'Karthik' });
        expect(result).toBe('Hey Karthik. It\'s Mira.');
    });

    it('returns default greeting when options is empty array', () => {
        const result = pickFirstMessage([], { userName: 'Test' });
        expect(result).toBe('Hey Test. It\'s Mira.');
    });
});
