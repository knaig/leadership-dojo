"""Bridge: Node.js worker calls this Python script to make voice calls via voicera SDK.

Usage from Node:
    child_process.spawn('python3', ['voice/make_call.py'], {
        env: { ...process.env, CALL_CONFIG: JSON.stringify(config) }
    })

The script reads CALL_CONFIG from env, makes the call using voicera SDK
with tool calling, and writes the result to stdout as JSON.

Tool calls query the leadership-coach database directly via psycopg2
(same Neon PostgreSQL the Node worker uses).
"""

import asyncio
import json
import os
import sys
from datetime import datetime, timezone

# Add the voicera SDK to path
VOICERA_PATH = os.getenv("VOICERA_SDK_PATH", "/Users/karthiknaig/Projects/karthikVoicEra")
sys.path.insert(0, VOICERA_PATH)

from voicera import VoiceCall

# ============================================================================
# DATABASE CONNECTION (same Neon DB as the Node worker)
# ============================================================================

_db_conn = None

def get_db():
    global _db_conn
    if _db_conn is None or _db_conn.closed:
        import psycopg2
        import psycopg2.extras
        _db_conn = psycopg2.connect(os.environ["DATABASE_URL"])
        _db_conn.autocommit = True
    return _db_conn


def db_query(sql: str, params: tuple = ()) -> list[dict]:
    """Run a SQL query and return rows as dicts."""
    conn = get_db()
    with conn.cursor(cursor_factory=__import__('psycopg2.extras', fromlist=['RealDictCursor']).RealDictCursor) as cur:
        cur.execute(sql, params)
        if cur.description:
            return [dict(row) for row in cur.fetchall()]
        return []


def db_execute(sql: str, params: tuple = ()) -> None:
    """Execute a SQL statement (INSERT/UPDATE)."""
    conn = get_db()
    with conn.cursor() as cur:
        cur.execute(sql, params)


# ============================================================================
# TOOL DEFINITIONS — Mira's in-call capabilities
# ============================================================================

def setup_tools(call: VoiceCall, user_id: str):
    """Register all tools that Mira can use during a call."""

    @call.tool("lookup_stakeholder")
    def lookup_stakeholder(name: str) -> str:
        """Look up a stakeholder's profile, role, and relationship context by name."""
        rows = db_query("""
            SELECT sp.name, sp."influenceRole", sp."relationshipStrength",
                   sp."communicationStyle", sp."motivations", sp."doPlaybook", sp."dontPlaybook"
            FROM "StakeholderProfile" sp
            WHERE sp."userId" = %s AND LOWER(sp.name) LIKE LOWER(%s)
            LIMIT 3
        """, (user_id, f"%{name}%"))
        if not rows:
            return f"I don't have detailed information about {name} yet. I've only seen them in your calendar."
        return json.dumps(rows, default=str)

    @call.tool("check_calendar_today")
    def check_calendar_today() -> str:
        """Check today's remaining meetings."""
        rows = db_query("""
            SELECT title, "startTime", "endTime", "meetingCategory", participants
            FROM "MeetingSyncRecord"
            WHERE "userId" = %s AND "startTime" >= NOW() AND "startTime" < NOW() + INTERVAL '24 hours'
              AND status != 'cancelled'
            ORDER BY "startTime" ASC LIMIT 8
        """, (user_id,))
        if not rows:
            return "No more meetings today."
        meetings = []
        for r in rows:
            start = r["startTime"].strftime("%I:%M %p") if r.get("startTime") else "?"
            meetings.append(f"{start} — {r['title']} ({r.get('meetingCategory', 'unclassified')})")
        return "\n".join(meetings)

    @call.tool("create_commitment")
    def create_commitment(description: str, due_date: str = "") -> str:
        """Create a commitment/action item that the user just stated they would do."""
        db_execute("""
            INSERT INTO "MeetingCommitment" (id, "userId", description, status, "madeAt", "createdAt", "updatedAt")
            VALUES (gen_random_uuid(), %s, %s, 'OPEN', NOW(), NOW(), NOW())
        """, (user_id, description))
        return f"Got it — I'll track: {description}"

    @call.tool("check_commitments")
    def check_commitments() -> str:
        """Check the user's open and overdue commitments."""
        rows = db_query("""
            SELECT ra.description, ra."dueDate", ra.status
            FROM "RelationshipAction" ra
            JOIN "StrategicObjective" so ON ra."goalId" = so.id
            WHERE so."userId" = %s AND ra.status = 'IN_PROGRESS'
            ORDER BY ra."dueDate" ASC NULLS LAST LIMIT 5
        """, (user_id,))
        if not rows:
            return "No open commitments."
        items = []
        for r in rows:
            due = r["dueDate"].strftime("%b %d") if r.get("dueDate") else "no due date"
            items.append(f"- {r['description']} (due: {due})")
        return "\n".join(items)

    @call.tool("lookup_person_from_calendar")
    def lookup_person(name: str) -> str:
        """Look up how often a person appears in the user's calendar and in what context."""
        rows = db_query("""
            SELECT title, "startTime", "meetingCategory"
            FROM "MeetingSyncRecord"
            WHERE "userId" = %s AND participants::text ILIKE %s
            ORDER BY "startTime" DESC LIMIT 5
        """, (user_id, f"%{name}%"))
        if not rows:
            return f"I haven't seen {name} in your recent meetings."
        meetings = [f"{r['startTime'].strftime('%b %d')} — {r['title']}" for r in rows]
        return f"{name} appeared in {len(rows)} recent meetings:\n" + "\n".join(meetings)


# ============================================================================
# MAIN
# ============================================================================

async def main():
    config = json.loads(os.environ["CALL_CONFIG"])

    user_id = config["userId"]
    phone = config["phone"]
    system_prompt = config["systemPrompt"]
    variables = config.get("variables", {})
    greeting = config.get("greeting", "")
    max_duration = config.get("maxDurationSeconds", 600)

    # Provider configs — use env defaults if not specified
    llm_config = config.get("llm", {
        "provider": os.getenv("VOICERA_LLM_PROVIDER", "gemini"),
        "model": os.getenv("VOICERA_LLM_MODEL", "gemini-2.0-flash"),
    })
    stt_config = config.get("stt", {
        "provider": "deepgram",
        "language": "English",
    })
    tts_config = config.get("tts", {
        "provider": "cartesia",
        "args": {"voice_id": "95d51f79-c397-46f9-b49a-23763d3eaa2d"},
    })

    call = VoiceCall(
        phone=phone,
        system_prompt=system_prompt,
        greeting=greeting,
        stt=stt_config,
        tts=tts_config,
        llm=llm_config,
        telephony={"provider": "vobiz"},
        max_duration=max_duration,
        variables=variables,
    )

    # Register tools with direct DB access
    setup_tools(call, user_id)

    # Run the call
    result = await call.start()

    # Output result as JSON to stdout for the Node worker to read
    output = {
        "callId": result.call_id,
        "transcript": result.transcript,
        "transcriptLines": result.transcript_lines,
        "durationSeconds": result.duration,
        "startedAt": result.started_at,
        "endedAt": result.ended_at,
        "userId": user_id,
        "status": "completed",
    }
    print("VOICERA_RESULT:" + json.dumps(output))


if __name__ == "__main__":
    asyncio.run(main())
