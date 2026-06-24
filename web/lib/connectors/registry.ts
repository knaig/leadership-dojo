import { ConnectorType } from '@prisma/client';

/**
 * Adapter interface — implemented in worker/src/lib/connector-adapters.ts.
 * Defined here for shared type reference across web and worker.
 */
export interface ConnectorAdapterInterface {
  readonly provider: string;
  readonly syncJobName: string;
  readonly extractJobName: string;
  isAuthenticated(userId: string): Promise<boolean>;
  sync(options: { userId: string; resourceId?: string; fullResync?: boolean; trigger?: string }): Promise<{ synced: number; created: number; updated: number; errors: string[] }>;
  disconnect(userId: string): Promise<void>;
}

export interface ConnectorDefinition {
  type: ConnectorType;
  provider: string;
  name: string;
  description: string;
  icon: string; // lucide-react icon name
  color: string;
  bgColor: string;
  authType: 'oauth2' | 'github_app' | 'api_key' | 'manual';
  authUrl?: string;
  supportsWatch: boolean;
  supportsProjectScoping: boolean;
  syncJobName: string;
  extractJobName: string;
  category: 'communication' | 'code' | 'documents' | 'project_management';
  features: string[];
  requiresMCP?: boolean;
}

export const CONNECTOR_REGISTRY: ConnectorDefinition[] = [
  {
    type: 'CALENDAR',
    provider: 'gcal',
    name: 'Google Calendar',
    description: 'Track meetings, prep time, and follow-through on commitments',
    icon: 'Calendar',
    color: 'text-blue-500',
    bgColor: 'bg-blue-500/10',
    authType: 'oauth2',
    authUrl: '/api/auth/google',
    supportsWatch: true,
    supportsProjectScoping: false,
    syncJobName: 'calendar-sync',
    extractJobName: 'knowledge-extract-calendar',
    category: 'communication',
    features: ['Meeting preparation', 'Post-meeting reflections', 'Time allocation analysis'],
  },
  {
    type: 'EMAIL',
    provider: 'gmail',
    name: 'Gmail',
    description: 'Analyze sent emails for communication patterns and stakeholder relationships',
    icon: 'Mail',
    color: 'text-red-500',
    bgColor: 'bg-red-500/10',
    authType: 'oauth2',
    authUrl: '/api/auth/google',
    supportsWatch: true,
    supportsProjectScoping: false,
    syncJobName: 'email-sync',
    extractJobName: 'knowledge-extract-email',
    category: 'communication',
    features: ['Email sentiment analysis', 'Response time tracking', 'Stakeholder extraction'],
  },
  {
    type: 'DOCUMENTS',
    provider: 'gdrive',
    name: 'Google Drive',
    description: 'Analyze documents for strategic thinking and clarity of communication',
    icon: 'FileText',
    color: 'text-yellow-500',
    bgColor: 'bg-yellow-500/10',
    authType: 'oauth2',
    authUrl: '/api/auth/google',
    supportsWatch: true,
    supportsProjectScoping: true,
    syncJobName: 'drive-sync',
    extractJobName: 'knowledge-extract-document',
    category: 'documents',
    features: ['Document quality analysis', 'Strategic thinking indicators', 'Writing patterns'],
  },
  {
    type: 'GITHUB',
    provider: 'github',
    name: 'GitHub',
    description: 'Track PRs, issues, and code reviews for project intelligence',
    icon: 'Github',
    color: 'text-gray-400',
    bgColor: 'bg-gray-500/10',
    authType: 'github_app',
    authUrl: '/api/auth/github',
    supportsWatch: true,
    supportsProjectScoping: true,
    syncJobName: 'github-sync',
    extractJobName: 'knowledge-extract-github',
    category: 'code',
    features: ['PR velocity tracking', 'Code review patterns', 'Contributor network'],
  },
  {
    type: 'NOTES',
    provider: 'apple_notes',
    name: 'Apple Notes',
    description: 'Connect via Claude Cowork to analyze meeting notes and reflections',
    icon: 'StickyNote',
    color: 'text-orange-500',
    bgColor: 'bg-orange-500/10',
    authType: 'manual',
    supportsWatch: false,
    supportsProjectScoping: false,
    syncJobName: '',
    extractJobName: '',
    category: 'documents',
    features: ['Meeting notes analysis', 'Reflection capture', 'Quick voice notes'],
    requiresMCP: true,
  },
  {
    type: 'MANUAL',
    provider: 'voice_memo',
    name: 'Voice Memos',
    description: 'Capture quick reflections and thoughts via voice',
    icon: 'Mic',
    color: 'text-purple-500',
    bgColor: 'bg-purple-500/10',
    authType: 'manual',
    supportsWatch: false,
    supportsProjectScoping: false,
    syncJobName: '',
    extractJobName: '',
    category: 'communication',
    features: ['Voice-to-text', 'Quick capture', 'On-the-go reflections'],
  },
  {
    type: 'MANUAL',
    provider: 'manual',
    name: 'Manual Input',
    description: 'Add notes, reflections, and context directly',
    icon: 'StickyNote',
    color: 'text-emerald-500',
    bgColor: 'bg-emerald-500/10',
    authType: 'manual',
    supportsWatch: false,
    supportsProjectScoping: false,
    syncJobName: '',
    extractJobName: '',
    category: 'documents',
    features: ['Quick notes', 'Structured reflections', 'Context teaching'],
  },
];

export function getConnectorDefinition(provider: string): ConnectorDefinition | undefined {
  return CONNECTOR_REGISTRY.find(c => c.provider === provider);
}

export function getConnectorsByCategory(category: ConnectorDefinition['category']): ConnectorDefinition[] {
  return CONNECTOR_REGISTRY.filter(c => c.category === category);
}
