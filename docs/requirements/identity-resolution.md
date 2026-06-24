# Identity Resolution — Know Who People Are

**Status:** Required — blocks meeting intelligence, email intelligence, stakeholder accuracy

**Problem:** The system treats each email address as a separate person. A real person with 3 emails (personal, work, academic) becomes 3 stakeholder profiles with fragmented intelligence. Meeting lookup fails because it searches by one email, not all of them.

**Example:** Prof. S. Rajagopalan has:
- `srgpalan@gmail.com` (personal, used for Google account)
- `raj@coss.org.in` (work, used in calendar invites)
- `raj@iiitb.ac.in` (academic)
- Known as: "Prof Rajagopalan", "S. Rajagopalan", "Raj", "Prof"

The system created 5 separate profiles. None of them have complete intelligence.

---

## What Identity Resolution Means

**One person = one identity**, regardless of how many emails, names, or nicknames they use.

```
Identity: Prof. S. Rajagopalan
├── Emails: [srgpalan@gmail.com, raj@coss.org.in, raj@iiitb.ac.in]
├── Names: ["Prof. S. Rajagopalan", "Prof Rajagopalan", "Raj", "S. Rajagopalan"]
├── Role: Professor, Advisor
├── Organizations: [COSS, IIITB]
└── All meetings, emails, facts → unified under this identity
```

---

## Proactive Detection

The system should automatically detect probable duplicates from signals:

### Signal 1: Co-attendance
If `raj@coss.org.in` and `srgpalan@gmail.com` never appear in the same meeting, but both appear in meetings titled "AI4Inclusion", they might be the same person.

### Signal 2: Email domain + name overlap
`srgpalan@gmail.com` → "S.R.G. Palan" → partial match with "S. Rajagopalan"
`raj@coss.org.in` → email local part "raj" → partial match with "Rajagopalan"

### Signal 3: Exclusive attendance pattern
If meetings with Prof always have EITHER `srgpalan@gmail.com` OR `raj@coss.org.in` but never both → strong signal they're the same person.

### Signal 4: Calendar title mentions
Meeting titled "Review with Prof" + attendee `raj@coss.org.in` → "Prof" likely refers to this attendee.

### Signal 5: Email thread crossover
If `srgpalan@gmail.com` and `raj@coss.org.in` appear in related email threads (same subject, overlapping participants).

---

## User Confirmation Flow

When the system detects a probable match, it should ask — not silently merge.

### In Chat (Proactive)
After initial sync or when a new potential duplicate is detected:

> "I think raj@coss.org.in and srgpalan@gmail.com might be the same person — they both show up in AI4Inclusion meetings but never together. Is that Prof. Rajagopalan?"

User confirms → profiles merged, all intelligence unified.
User denies → marked as different people, never asked again.

### In People Page
Show a "Possible duplicates" section (or badge) when duplicates are detected:

```
⚠️ Possible duplicate
raj@coss.org.in and S. Rajagopalan (srgpalan@gmail.com)
[Same person] [Different people]
```

### During Onboarding
After first sync completes, if duplicates detected:

> "I found some people who might be using multiple email addresses. Can you help me sort these out?"
> - raj@coss.org.in + srgpalan@gmail.com → Same person? [Yes] [No]
> - karthik@coss.org.in + karthik.naig@gmail.com → Same person? [Yes] [No]

---

## Data Model

### Option A: Multi-email on StakeholderProfile
Add `additionalEmails: String[]` to StakeholderProfile. Primary email stays in `email`, alt emails in the array. All lookups search both.

### Option B: Separate Identity table
```
PersonIdentity {
    id
    userId
    primaryName
    aliases: String[]      // All known names/nicknames
    emails: String[]       // All known email addresses
    stakeholderProfileId   // Links to the primary profile
}
```

**Recommendation:** Option A is simpler and sufficient for now. Option B if we need identity resolution across data sources beyond email.

---

## Resolution Everywhere

Once identity is resolved, every system that looks up a person must search ALL their emails:

- **Context Agent** meeting lookup: search by all emails
- **Email enrichment**: aggregate emails across all addresses
- **Knowledge graph**: merge facts from all email identities
- **Stakeholder synthesis**: use unified data
- **Importance scoring**: aggregate signals across all emails

---

## Implementation Priority

1. **Add `additionalEmails` field** to StakeholderProfile schema
2. **Build duplicate detection agent** — runs after sync, scores probable duplicates
3. **Build confirmation UX** — chat-based ("Is this the same person?") + People page badges
4. **Update all lookups** to search primary + additional emails
5. **Backfill** — run detection on existing data, prompt user to confirm

---

## Success Criteria

- Zero "I don't have notes from that meeting" when notes exist but under a different email
- Every person the user works with regularly has a complete identity (all emails, all names)
- User is asked to confirm duplicates within 24 hours of first sync
- Once confirmed, all intelligence is immediately unified
