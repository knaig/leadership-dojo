import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@clerk/nextjs/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

interface AttendeeIntel {
  name: string;
  role: string | null;
  whatWorks: string | null;
  watchFor: string | null;
  sharedContext: string | null;
}

interface GameplanMeeting {
  id: string;
  title: string;
  description: string | null;
  startTime: string;
  endTime: string;
  meetingType: string | null;
  attendees: { name: string; email: string; response: string }[];
  lifecycleStage: string | null;
  desiredOutcome: string | null;
  stakes: 'low' | 'medium' | 'high';
  edge: string | null;
  attendeeIntel: AttendeeIntel[];
  userGrowthTip: string | null;
  userRole: string | null; // organizer, participant, etc.
  projectContext: string | null; // which project this relates to
  confidence: number; // 0-100: how much AI knows about this meeting context
  hasOutcome: boolean;
  hasBrief: boolean;
  hasDeepPrep: boolean;
  conversationPrepId: string | null;
  minutesUntilNext: number | null;
}

// Predicates that indicate "what works" with a person
const POSITIVE_PREDICATES = [
  'responds_to', 'communication_style', 'prefers', 'values',
  'appreciates', 'motivated_by', 'works_well_with', 'likes'
];

// Predicates that indicate "watch for" with a person
const CAUTION_PREDICATES = [
  'dislikes', 'sensitive_to', 'pushes_back_on', 'frustrated_by',
  'avoid', 'careful_with', 'dont', 'annoyed_by'
];

function classifyPredicate(predicate: string): 'positive' | 'caution' | 'neutral' {
  const lower = predicate.toLowerCase();
  if (POSITIVE_PREDICATES.some(p => lower.includes(p))) return 'positive';
  if (CAUTION_PREDICATES.some(p => lower.includes(p))) return 'caution';
  return 'neutral';
}

function inferStakes(meeting: {
  meetingType: string | null;
  title: string;
  description?: string | null;
  attendees: any;
  userImportanceOverride?: string | null;
}): 'low' | 'medium' | 'high' {
  // User override takes precedence
  if (meeting.userImportanceOverride) {
    const override = meeting.userImportanceOverride;
    if (override === 'critical' || override === 'high') return 'high';
    if (override === 'medium') return 'medium';
    if (override === 'low') return 'low';
  }

  const title = meeting.title.toLowerCase();
  const desc = (meeting.description || '').toLowerCase();
  const text = `${title} ${desc}`;
  const type = meeting.meetingType?.toLowerCase() || '';

  // High stakes indicators — check both title and description
  const highKeywords = ['review', 'budget', 'board', 'investor', 'pitch', 'negotiat',
    'performance', 'crisis', 'escalat', 'vendor', 'contract', 'deadline', 'incident',
    'compliance', 'audit', 'risk', 'dispute', 'termina', 'penalty', 'sla'];
  if (highKeywords.some(k => text.includes(k))) {
    return 'high';
  }

  // Medium stakes
  const medKeywords = ['1:1', '1-on-1', 'strategy', 'planning', 'alignment', 'feedback',
    'roadmap', 'quarterly', 'weekly sync', 'status update', 'standup', 'retrospective'];
  if (medKeywords.some(k => text.includes(k)) || type === '1:1') {
    return 'medium';
  }

  // Check attendee count — more people = higher stakes
  const attendeeList = Array.isArray(meeting.attendees) ? meeting.attendees : [];
  if (attendeeList.length > 5) return 'medium';

  return 'low';
}

function formatDateLabel(dateStr: string): string {
  // Parse at noon to avoid any date boundary issues
  const date = new Date(dateStr + 'T12:00:00');
  const dayName = date.toLocaleDateString('en-US', { weekday: 'long' });
  const monthDay = date.toLocaleDateString('en-US', { month: 'long', day: 'numeric' });
  // Today/Tomorrow logic is handled client-side via formatDateLabelClient
  return `${dayName}, ${monthDay}`;
}

async function generateEdges(
  meetings: { id: string; title: string; description: string | null; userNotes: string | null; attendeeIntel: AttendeeIntel[]; userStrengths: string[] }[]
): Promise<Record<string, string>> {
  const meetingsWithIntel = meetings.filter(m => m.attendeeIntel.length > 0 || m.description || m.userNotes);
  if (meetingsWithIntel.length === 0) return {};

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) return {};

  const meetingDescriptions = meetingsWithIntel.map((m, i) => {
    const attendeeInfo = m.attendeeIntel
      .map(a => {
        const parts = [a.name];
        if (a.role) parts.push(`(${a.role})`);
        if (a.whatWorks) parts.push(`responds to: ${a.whatWorks}`);
        if (a.watchFor) parts.push(`watch for: ${a.watchFor}`);
        if (a.sharedContext) parts.push(a.sharedContext);
        return parts.join(' — ');
      })
      .join('; ');
    const strengths = m.userStrengths.length > 0 ? ` User strength: ${m.userStrengths[0]}.` : '';
    const desc = m.description ? `\n  Calendar context: ${m.description.slice(0, 200)}` : '';
    const notes = m.userNotes ? `\n  User's notes: ${m.userNotes.slice(0, 200)}` : '';
    return `[MEETING index=${i}] "${m.title}"${desc}${notes}\n  Attendees: ${attendeeInfo || 'No attendee intel available'}\n  ${strengths}`;
  }).join('\n\n');

  const prompt = `For each meeting below, write ONE tactical tip (max 15 words) that gives the user a concrete edge.

STRICT RULES:
- Each tip MUST be specific to THAT meeting only. Do NOT mix information across meetings.
- ONLY reference people who are explicitly listed as attendees of THAT specific meeting. Do NOT mention people from other meetings.
- Do NOT echo back the user's notes or description. Generate an ORIGINAL insight based on what you know about the attendees.
- Use attendee intelligence (what works, what to watch for) to craft actionable advice.
- If you have no intelligence about a meeting's attendees, focus the tip on a smart framing or preparation strategy.
- Be specific and grounded. Never hallucinate context that isn't provided.
- If there is genuinely nothing useful to say, respond with "Set your outcome to get a personalized edge."

${meetingDescriptions}

Return a JSON array with one entry per meeting: [{ "index": 0, "edge": "..." }, ...]
The "index" must exactly match the index= value shown in each [MEETING] header.`;

  try {
    const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key=${apiKey}`;
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          temperature: 0.7,
          maxOutputTokens: 1024,
          responseMimeType: 'application/json'
        }
      })
    });

    if (!response.ok) return {};

    const data = await response.json();
    const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
    if (!content) return {};

    const parsed = JSON.parse(content);
    const edges: Record<string, string> = {};
    for (const item of parsed) {
      const meeting = meetingsWithIntel[item.index];
      if (meeting) {
        edges[meeting.id] = item.edge;
      }
    }
    return edges;
  } catch (e) {
    console.error('[Gameplan] Edge generation failed:', e);
    return {};
  }
}

export async function GET(req: NextRequest) {
  const { userId } = await auth();
  if (!userId) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  const { searchParams } = new URL(req.url);
  const dateStr = searchParams.get('date');
  const tzOffsetStr = searchParams.get('tz'); // Client's getTimezoneOffset() value

  // Client always sends ?date= so server just validates it
  if (!dateStr || !/^\d{4}-\d{2}-\d{2}$/.test(dateStr)) {
    return NextResponse.json({ error: 'date query parameter required (YYYY-MM-DD)' }, { status: 400 });
  }

  // Convert user's local midnight to UTC using their timezone offset
  // getTimezoneOffset() returns UTC-local in minutes (e.g., IST → -330, PST → 480)
  const tzOffset = tzOffsetStr ? parseInt(tzOffsetStr, 10) : 0;
  const targetDate = new Date(dateStr + 'T00:00:00.000Z');
  targetDate.setMinutes(targetDate.getMinutes() + tzOffset); // now represents user's local midnight in UTC
  const nextDate = new Date(targetDate.getTime() + 24 * 60 * 60 * 1000); // +24h

  try {
    // Fetch the user's email for self-identification
    const dbUser = await prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, name: true }
    });
    const userEmail = dbUser?.email?.toLowerCase() || '';
    const userName = dbUser?.name?.toLowerCase() || '';

    // Stale-check: if calendar data is > 5 min old, queue a background sync
    const syncStatus = await prisma.syncStatus.findUnique({
      where: { userId_connector: { userId, connector: 'calendar' } }
    });
    const staleMins = syncStatus?.lastSyncAt
      ? (Date.now() - syncStatus.lastSyncAt.getTime()) / 60000
      : Infinity;

    if (staleMins > 5) {
      try {
        const payload = JSON.stringify({ userId });
        await prisma.$queryRaw`
          INSERT INTO pgboss.job (name, data, state, retry_limit, retry_count, retry_delay, expire_seconds, start_after, keep_until)
          VALUES (
            'calendar-sync',
            ${payload}::jsonb,
            'created',
            2, 0, 30, 300,
            now(),
            now() + interval '1 day'
          )
        `;
        console.log(`[Gameplan] Stale data (${Math.round(staleMins)}m), queued background sync`);
      } catch (e) {
        // Non-critical — just log and continue serving cached data
        console.warn('[Gameplan] Failed to queue background sync:', e);
      }
    }

    // Fetch meetings for the target date
    const meetings = await prisma.meetingSyncRecord.findMany({
      where: {
        userId,
        startTime: { gte: targetDate, lt: nextDate },
        status: { not: 'cancelled' }
      },
      orderBy: { startTime: 'asc' }
    });

    // Fetch user intelligence for growth areas
    const userIntel = await prisma.userIntelligence.findUnique({
      where: { userId }
    });

    const profile = (userIntel?.profile as any) || {};
    const growthAreas = (profile.growthAreas || []) as Array<{ area: string; evidence?: string[]; confidence?: number }>;
    const strengths = (profile.strengths || []) as Array<{ area: string; evidence?: string[]; confidence?: number }>;

    // Helper: check if an attendee is the logged-in user
    function isSelf(attendee: { name?: string; email?: string }): boolean {
      const email = (attendee.email || '').toLowerCase();
      const name = (attendee.name || '').toLowerCase();
      if (userEmail && email === userEmail) return true;
      if (userName && name === userName) return true;
      // Also match partial: "karthik" in email "karthik@coss.org.in"
      if (userEmail && email && userEmail.split('@')[0] === email.split('@')[0]) return true;
      return false;
    }

    // Collect all attendee names AND emails for batch lookups (excluding self)
    const allAttendeeNames: string[] = [];
    const allAttendeeEmails: string[] = [];
    for (const meeting of meetings) {
      const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];
      for (const a of attendees as any[]) {
        if (isSelf(a)) continue; // Skip self
        const name = a.name || a.email?.split('@')[0] || '';
        if (name) allAttendeeNames.push(name.toLowerCase());
        if (a.email) allAttendeeEmails.push(a.email.toLowerCase());
      }
    }

    const uniqueNames = [...new Set(allAttendeeNames)];
    const uniqueEmails = [...new Set(allAttendeeEmails)];

    // Batch fetch knowledge entities for all attendees (by name)
    const entities = uniqueNames.length > 0
      ? await prisma.knowledgeEntity.findMany({
          where: {
            userId,
            type: 'PERSON',
            nameNormalized: { in: uniqueNames }
          }
        })
      : [];

    const entityMap = new Map(entities.map(e => [e.nameNormalized, e]));

    // Batch fetch facts for all found entities
    const entityIds = entities.map(e => e.id);
    const allFacts = entityIds.length > 0
      ? await prisma.knowledgeFact.findMany({
          where: {
            userId,
            subjectId: { in: entityIds },
            validTo: null // current facts only
          },
          orderBy: { confidence: 'desc' }
        })
      : [];

    // Group facts by entity
    const factsByEntity = new Map<string, typeof allFacts>();
    for (const fact of allFacts) {
      const existing = factsByEntity.get(fact.subjectId) || [];
      existing.push(fact);
      factsByEntity.set(fact.subjectId, existing);
    }

    // Batch fetch StakeholderProfiles by email (richer intel)
    const stakeholderProfiles = uniqueEmails.length > 0
      ? await prisma.stakeholderProfile.findMany({
          where: {
            userId,
            email: { in: uniqueEmails }
          },
          include: {
            intelligence: true
          }
        })
      : [];

    // Also try matching by name for stakeholders without email match
    const stakeholdersByName = uniqueNames.length > 0
      ? await prisma.stakeholderProfile.findMany({
          where: {
            userId,
            OR: uniqueNames.map(n => ({ name: { contains: n, mode: 'insensitive' as const } }))
          },
          include: {
            intelligence: true
          }
        })
      : [];

    // Build stakeholder lookup maps
    const stakeholderByEmail = new Map(
      stakeholderProfiles.map(s => [(s.email || '').toLowerCase(), s])
    );
    const stakeholderByName = new Map(
      [...stakeholderProfiles, ...stakeholdersByName].map(s => [s.name.toLowerCase(), s])
    );

    // Check for linked conversation preps
    const meetingTitles = meetings.map(m => m.title);
    const conversationPreps = meetingTitles.length > 0
      ? await prisma.conversationPrep.findMany({
          where: {
            userId,
            title: { in: meetingTitles },
            scheduledAt: { gte: targetDate, lt: nextDate }
          },
          select: { id: true, title: true, scheduledAt: true, status: true }
        })
      : [];

    const prepsByTitle = new Map(conversationPreps.map(p => [p.title, { id: p.id, status: p.status }]));

    // Build meeting data
    const edgeInputs: { id: string; title: string; description: string | null; userNotes: string | null; attendeeIntel: AttendeeIntel[]; userStrengths: string[] }[] = [];

    const gameplanMeetings: GameplanMeeting[] = meetings.map((meeting, index) => {
      const attendees = Array.isArray(meeting.attendees) ? meeting.attendees : [];
      // Filter out self from attendee list shown to user
      const typedAttendees = (attendees as any[])
        .filter(a => !isSelf(a))
        .map(a => ({
          name: a.name || a.email?.split('@')[0] || 'Unknown',
          email: a.email || '',
          response: a.response || a.responseStatus || 'needsAction'
        }));

      // Build attendee intel — combining KnowledgeFact + StakeholderProfile
      const attendeeIntel: AttendeeIntel[] = typedAttendees.map(a => {
        const normalizedName = a.name.toLowerCase();
        const normalizedEmail = a.email.toLowerCase();

        // Try KnowledgeEntity facts
        const entity = entityMap.get(normalizedName);
        const facts = entity ? (factsByEntity.get(entity.id) || []).slice(0, 8) : [];

        // Try StakeholderProfile (by email first, then name)
        const stakeholder = stakeholderByEmail.get(normalizedEmail) || stakeholderByName.get(normalizedName);
        const intel = stakeholder?.intelligence;

        let whatWorks: string | null = null;
        let watchFor: string | null = null;
        let role: string | null = null;
        let sharedContext: string | null = null;

        // First, use StakeholderIntelligence if available (richest source)
        if (intel) {
          if (intel.successPatterns?.length > 0) {
            whatWorks = intel.successPatterns[0];
          }
          if (intel.objectionPatterns?.length > 0) {
            watchFor = `Often raises: ${intel.objectionPatterns[0]}`;
          } else if (intel.failurePatterns?.length > 0) {
            watchFor = intel.failurePatterns[0];
          }
          if (intel.recentTopics?.length > 0) {
            sharedContext = `Recent topics: ${intel.recentTopics.slice(0, 3).join(', ')}`;
          }
        }

        // Then augment/fill gaps from KnowledgeFacts
        let relationship: string | null = null;
        for (const fact of facts) {
          const classification = classifyPredicate(fact.predicate);
          if (classification === 'positive' && !whatWorks) {
            whatWorks = fact.objectValue || null;
          } else if (classification === 'caution' && !watchFor) {
            watchFor = fact.objectValue || null;
          }
          // Try to extract role
          if (!role && (fact.predicate === 'role' || fact.predicate === 'title' || fact.predicate === 'position' || fact.predicate === 'has_role')) {
            role = fact.objectValue || null;
          }
          // Extract relationship to user (manages, reports_to)
          if (!relationship && (fact.predicate === 'reports_to' || fact.predicate === 'manages')) {
            relationship = fact.predicate === 'reports_to' ? 'Reports to you' : 'Your direct report';
          }
        }

        // Also check reverse: user manages this person
        if (!relationship && entity) {
          const userEntity = entities.find(e => e.nameNormalized === userName);
          if (userEntity) {
            const userFacts = factsByEntity.get(userEntity.id) || [];
            for (const f of userFacts) {
              if (f.predicate === 'manages' && f.objectEntityId === entity.id) {
                relationship = 'Your direct report';
                break;
              }
            }
          }
        }

        // Use relationship as role if no other role found
        if (relationship && !role) {
          role = relationship;
        } else if (relationship && role) {
          role = `${role} · ${relationship}`;
        }

        // Use StakeholderProfile for role + relationship
        if (stakeholder) {
          if (!role && stakeholder.role) {
            role = stakeholder.role;
          }
          // influenceLevel stores relationship type from onboarding (MANAGES, REPORTS_TO, PEER, etc.)
          if (!relationship && stakeholder.influenceLevel) {
            const relMap: Record<string, string> = {
              'MANAGES': 'Your direct report',
              'REPORTS_TO': 'You report to them',
              'PEER': 'Peer',
              'CROSS_FUNCTIONAL': 'Cross-functional',
              'EXTERNAL': 'External',
            };
            const mapped = relMap[stakeholder.influenceLevel];
            if (mapped && mapped !== 'Peer') {
              relationship = mapped;
              if (!role) {
                role = relationship;
              } else {
                role = `${role} · ${relationship}`;
              }
            }
          }
        }

        // Check entity properties for role
        if (!role && entity) {
          const props = entity.properties as any;
          role = props?.title || props?.role || null;
        }

        return {
          name: a.name,
          role,
          whatWorks,
          watchFor,
          sharedContext
        };
      });

      const stakes = inferStakes(meeting);
      const prepInfo = prepsByTitle.get(meeting.title) || null;
      const conversationPrepId = prepInfo?.id || null;

      // Compute buffer time to next meeting
      let minutesUntilNext: number | null = null;
      if (index < meetings.length - 1) {
        const nextStart = meetings[index + 1].startTime.getTime();
        const thisEnd = meeting.endTime.getTime();
        minutesUntilNext = Math.round((nextStart - thisEnd) / (1000 * 60));
      }

      // Growth tip for this meeting
      let userGrowthTip: string | null = null;
      if (growthAreas.length > 0 && stakes !== 'low') {
        userGrowthTip = growthAreas[0].area;
      }

      // Determine user's role in this meeting
      const allRawAttendees = attendees as any[];
      const selfEntry = allRawAttendees.find(a => isSelf(a));
      const isOrganizer = selfEntry?.organizer === true || selfEntry?.self === true;
      let userRole: string | null = null;

      // Check project snapshots for role context
      const projectSnapshots = (profile.projectSnapshot || {}) as Record<string, any>;
      const titleLower = meeting.title.toLowerCase();
      let projectContext: string | null = null;

      for (const [projectName, snapshot] of Object.entries(projectSnapshots)) {
        if (titleLower.includes(projectName.toLowerCase()) ||
            (meeting.description || '').toLowerCase().includes(projectName.toLowerCase())) {
          projectContext = `${projectName} (${snapshot.health || 'active'})`;
          if (snapshot.userRole) {
            userRole = snapshot.userRole;
          }
          break;
        }
      }

      if (!userRole) {
        userRole = isOrganizer ? 'organizer' : 'participant';
      }

      // Compute confidence score (0-100): how much does AI know about this meeting?
      let confidence = 0;
      // +20 if we have stakeholder intel for at least one attendee
      if (attendeeIntel.some(a => a.whatWorks || a.watchFor || a.role)) confidence += 20;
      // +15 if meeting has description
      if (meeting.description) confidence += 15;
      // +15 if user has set desired outcome
      if (meeting.desiredOutcome) confidence += 15;
      // +15 if project context is identified
      if (projectContext) confidence += 15;
      // +10 if deep prep exists
      if (prepInfo?.status === 'READY') confidence += 10;
      // +10 for each attendee with full intel (max 20)
      const intelCount = attendeeIntel.filter(a => a.whatWorks && a.watchFor).length;
      confidence += Math.min(20, intelCount * 10);
      // +5 if user intelligence profile exists
      if (userIntel) confidence += 5;
      confidence = Math.min(100, confidence);

      edgeInputs.push({ id: meeting.id, title: meeting.title, description: meeting.description, userNotes: meeting.userNotes, attendeeIntel, userStrengths: strengths.map(s => s.area) });

      return {
        id: meeting.id,
        title: meeting.title,
        description: meeting.description,
        startTime: meeting.startTime.toISOString(),
        endTime: meeting.endTime.toISOString(),
        meetingType: meeting.meetingType,
        attendees: typedAttendees,
        lifecycleStage: meeting.lifecycleStage,
        outcomeResult: meeting.outcomeResult || null,
        outcome: meeting.outcome || null,
        desiredOutcome: meeting.desiredOutcome,
        stakes,
        edge: null, // filled after batch edge generation
        attendeeIntel,
        userGrowthTip,
        userRole,
        projectContext,
        confidence,
        hasOutcome: !!meeting.desiredOutcome,
        outcomeSuggestions: meeting.outcomeSuggestions || [],
        hasBrief: !!meeting.briefSentAt,
        hasDeepPrep: prepInfo?.status === 'READY',
        conversationPrepId,
        minutesUntilNext,
        userImportanceOverride: meeting.userImportanceOverride || null,
        userNotes: meeting.userNotes || null,
      };
    });

    // Generate edges — fire and forget to avoid timeout.
    // Edge generation is a nice-to-have; don't block the response for it.
    // We try with a short timeout; if it fails, edges stay null.
    try {
      const edgePromise = generateEdges(edgeInputs);
      const timeoutPromise = new Promise<Record<string, string>>((resolve) => setTimeout(() => resolve({}), 4000));
      const edges = await Promise.race([edgePromise, timeoutPromise]);
      for (const m of gameplanMeetings) {
        m.edge = edges[m.id] || null;
      }
    } catch {
      // Edges stay null — that's fine
    }

    // Compute summary
    const totalFaceTime = gameplanMeetings.reduce((sum, m) => {
      const start = new Date(m.startTime).getTime();
      const end = new Date(m.endTime).getTime();
      return sum + (end - start) / (1000 * 60);
    }, 0);

    return NextResponse.json({
      date: dateStr,
      dateLabel: formatDateLabel(dateStr),
      meetings: gameplanMeetings,
      summary: {
        total: gameplanMeetings.length,
        highStakes: gameplanMeetings.filter(m => m.stakes === 'high').length,
        readyCount: gameplanMeetings.filter(m => m.hasOutcome || m.hasBrief).length,
        totalFaceTime: Math.round(totalFaceTime)
      }
    });
  } catch (error: any) {
    console.error('[Gameplan API] Error:', error?.message || error, error?.stack);
    return NextResponse.json({ error: error?.message || 'Failed to fetch gameplan' }, { status: 500 });
  }
}
