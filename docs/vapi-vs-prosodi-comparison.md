# Vapi vs Prosodi: Voice AI Platform Comparison for Telephony

**Use Case:** Outbound phone calls to users (executive coaching calls via Mira)
**Date:** March 2026

---

## TL;DR

| | Vapi | Prosodi |
|---|---|---|
| **Status** | Production-ready, widely used | Pre-release (waitlist only) |
| **Telephony** | First-class, built-in | Via LiveKit SIP (self-managed) |
| **Pricing** | ~$0.15-0.25/min all-in | Self-hosted = provider costs only |
| **Open Source** | No | Yes (not yet public) |
| **Our Switch Cost** | Already integrated | Full rewrite of voice layer |

**Bottom line:** Prosodi is promising but not usable today. Vapi is the right choice now. Revisit Prosodi in 6 months.

---

## 1. Product Maturity

### Vapi
- **Live and production-ready** since 2024
- Large user base, active community, well-documented API
- Persistent Assistants, webhooks, call analytics all working
- 14 TTS providers, 10+ LLM providers, 6 STT providers integrated
- Phone number provisioning built in (Twilio, Telnyx)

### Prosodi
- **Not released** — currently accepting early access signups
- No public GitHub repo yet
- No public API documentation
- Built on LiveKit (which IS production-ready and open source)
- Claims "zero markup" pricing and "bring your own everything"

---

## 2. Telephony Capabilities

### Vapi
- Native phone number provisioning (free numbers available)
- Import numbers from Twilio/Telnyx
- Outbound + inbound calling
- Voicemail detection
- SIP trunking
- Call recording + transcription
- Live call control (transfer, end, inject)
- Warm transfers between assistants
- Webhook events for all call lifecycle stages
- Concurrency management

### Prosodi (via LiveKit)
- SIP support (UDP, TCP, TLS)
- Inbound + outbound via SIP trunks
- DTMF support
- Cold + warm call transfers
- HD voice
- Krisp AI noise cancellation
- Secure trunking (SRTP)
- Region pinning for compliance
- Tested with: Twilio, Telnyx, Exotel, Plivo, Wavix
- **Requires self-managed SIP trunk setup**
- **No managed phone number provisioning**

---

## 3. Pricing

### Vapi
| Component | Cost |
|---|---|
| Vapi orchestration | ~$0.05/min |
| STT (Deepgram) | ~$0.01/min |
| LLM (GPT-4o) | ~$0.02-0.20/min |
| TTS (ElevenLabs) | ~$0.04/min |
| Telephony | ~$0.01/min |
| **Total typical** | **$0.13-0.25/min** |

With ~5 min calls, 2 users, daily = ~$6-15/month currently.
At 50 users = ~$150-375/month.
At 500 users = ~$1,500-3,750/month.

### Prosodi (projected)
| Component | Cost |
|---|---|
| Prosodi platform | $0 (self-hosted) |
| STT (Deepgram direct) | ~$0.0059/min |
| LLM (Gemini/own key) | ~$0.01-0.15/min |
| TTS (ElevenLabs direct) | ~$0.02-0.04/min |
| Telephony (Twilio/Telnyx direct) | ~$0.01/min |
| Infra (server hosting) | ~$20-50/mo fixed |
| **Total typical** | **$0.05-0.15/min + infra** |

**Savings at scale:** 30-50% cheaper than Vapi at 50+ users.
**Break-even point:** ~$100/mo in Vapi spend (roughly 20-30 daily users).

---

## 4. Architecture Fit

### Vapi (Current Stack)
```
Worker (Render) → Vapi API → Phone Call
                    ↓
              Vapi Webhook → Web (Vercel) → DB
```
- Simple integration: one API call triggers a call
- Vapi manages all voice infra
- Dynamic context via assistantOverrides.variableValues
- Prompt editing possible in Vapi dashboard (no deploy needed)

### Prosodi (Would Require)
```
Worker (Render) → LiveKit Server (self-hosted) → SIP Trunk → Phone Call
                         ↓
                   Custom Agent (Python) → Webhook → DB
```
- LiveKit Agents framework is **Python** (our stack is TypeScript)
- Need to self-host LiveKit server OR use LiveKit Cloud
- SIP trunk setup and management
- Build custom agent logic (currently Vapi handles this)
- More ops burden: monitoring, scaling, failover

---

## 5. Provider Flexibility

### Vapi
| Category | Supported Providers |
|---|---|
| STT | Deepgram, Google, Gladia, Speechmatics, AssemblyAI, Talkscriber |
| TTS | ElevenLabs, PlayHT, Azure, OpenAI, Cartesia, LMNT, RimeAI, Deepgram |
| LLM | OpenAI, Anthropic, Gemini, Groq, DeepInfra, Perplexity, TogetherAI, OpenRouter |
| Telephony | Twilio, Telnyx (built-in), any via SIP |

### Prosodi
| Category | Supported Providers |
|---|---|
| STT | "Swap any STT" — specifics unknown |
| TTS | "Swap any TTS" — specifics unknown |
| LLM | "Swap any LLM" — specifics unknown |
| Telephony | Via LiveKit SIP: Twilio, Telnyx, Exotel, Plivo, Wavix |

Prosodi's "bring your own everything" is appealing but unproven.

---

## 6. What Matters for Mira

| Requirement | Vapi | Prosodi |
|---|---|---|
| Outbound calls to Indian numbers | Yes (working today) | Theoretically via SIP |
| Persistent assistant with dynamic context | Yes (assistantOverrides) | Unknown |
| Indian-accented voice (ElevenLabs) | Yes | Likely (if ElevenLabs supported) |
| Webhook for call events | Yes | Via LiveKit webhooks |
| Call recording + transcription | Yes | Via LiveKit |
| Managed phone numbers | Yes | No (bring your own SIP) |
| No infrastructure to manage | Yes | No (self-host required) |
| TypeScript SDK | Yes | No (Python framework) |

---

## 7. When to Switch

**Don't switch now.** Switch when ALL of these are true:

1. Prosodi has a public release with documentation
2. Monthly Vapi spend exceeds $200+ (20+ daily active users)
3. Prosodi supports TypeScript agents (or we're OK adding Python)
4. Prosodi has proven telephony with Indian carriers
5. Someone on the team can own the voice infra ops

**Estimated timeline:** 6-12 months from now, if Prosodi delivers.

**Interim optimization:** Reduce call duration and frequency to manage Vapi costs. A 3-min daily call instead of 5-min saves 40% on voice costs.

---

## 8. Risk Assessment

### Staying on Vapi
- **Cost risk:** Per-minute pricing scales linearly. At 500 users, $1.5-3.7K/month.
- **Vendor lock-in:** Moderate. Assistants, webhooks, and call flow are Vapi-specific.
- **Upside:** Zero ops burden. Focus on product, not infrastructure.

### Switching to Prosodi
- **Availability risk:** Product doesn't exist yet.
- **Integration risk:** Python agent framework vs our TypeScript stack.
- **Ops risk:** Self-hosting voice infra is non-trivial (latency, uptime, scaling).
- **Upside:** 30-50% cost savings at scale. Full control over the stack.

---

## Sources

- [Vapi Pricing](https://vapi.ai/pricing)
- [Vapi Documentation](https://docs.vapi.ai/)
- [Prosodi.ai](https://www.prosodi.ai/)
- [LiveKit Agents - GitHub](https://github.com/livekit/agents)
- [LiveKit Telephony Docs](https://docs.livekit.io/agents/start/telephony/)
- [Vapi Pricing Breakdown (Telnyx)](https://telnyx.com/resources/vapi-pricing)
- [Vapi Review (Lindy)](https://www.lindy.ai/blog/vapi-ai)
