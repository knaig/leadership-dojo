/**
 * Multi-Agent System
 *
 * A sophisticated agent architecture with specialized components:
 *
 * ┌─────────────────────────────────────────────────────────────┐
 * │                      ORCHESTRATOR                           │
 * │  Coordinates the flow between specialist agents             │
 * └─────────────────────────────────────────────────────────────┘
 *                             │
 *           ┌─────────────────┼─────────────────┐
 *           │                 │                 │
 *           ▼                 ▼                 ▼
 * ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
 * │  ROUTER AGENT   │ │  CONTEXT AGENT  │ │  ACTION AGENT   │
 * │  Intent & NER   │ │  RAG & Synth    │ │  Tool Executor  │
 * └─────────────────┘ └─────────────────┘ └─────────────────┘
 *           │                 │                 │
 *           └─────────────────┼─────────────────┘
 *                             │
 *                             ▼
 *                   ┌─────────────────┐
 *                   │ RESPONSE AGENT  │
 *                   │ Final Response  │
 *                   └─────────────────┘
 */

export { orchestrator, MultiAgentOrchestrator } from './orchestrator';
export { routerAgent, RouterAgent } from './router-agent';
export { contextAgent, ContextAgent } from './context-agent';
export { actionAgent, ActionAgent } from './action-agent';
export { responseAgent, ResponseAgent } from './response-agent';

export * from './types';
