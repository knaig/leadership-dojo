"use client";

import { useState } from "react";
import type { CaseStudy, Round } from "@/lib/data";

function RoundView({
  round,
  onSubmit,
  isLast,
}: {
  round: Round;
  onSubmit: (response: string) => void;
  isLast: boolean;
}) {
  const [response, setResponse] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const isCoaching = round.type === "outcome_coaching";

  function handleSubmit() {
    if (!response.trim() && !isCoaching) return;
    setSubmitted(true);
    onSubmit(response);
  }

  return (
    <div className="space-y-6">
      {/* Situation */}
      <div className="rounded-xl p-6" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-mono" style={{ color: "var(--muted-2)" }}>Round {round.round}</span>
          <span className="text-xs capitalize" style={{ color: "var(--muted-2)" }}>/ {round.type.replace(/_/g, " ")}</span>
        </div>
        <div className="text-sm leading-relaxed whitespace-pre-wrap" style={{ color: "var(--text-2)" }}>
          {round.situation}
        </div>
      </div>

      {/* Prompt */}
      <div className="font-medium text-base" style={{ color: "var(--accent)" }}>{round.prompt}</div>

      {/* Input */}
      {!submitted && !isCoaching && (
        <div className="space-y-3">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Write your response..."
            rows={5}
            className="w-full rounded-xl p-4 text-sm resize-none focus:outline-none transition-colors"
            style={{
              background: "var(--surface)",
              border: "1px solid var(--border)",
              color: "var(--text)",
              caretColor: "var(--accent)",
            }}
            onFocus={(e) => e.target.style.borderColor = "var(--border-strong)"}
            onBlur={(e) => e.target.style.borderColor = "var(--border)"}
          />
          <button
            onClick={handleSubmit}
            disabled={!response.trim()}
            className="px-5 py-2.5 text-sm font-medium rounded-lg transition-opacity text-white disabled:opacity-40 disabled:cursor-not-allowed"
            style={{ background: "var(--accent)" }}
          >
            Submit response
          </button>
        </div>
      )}

      {/* Reveal after submit */}
      {(submitted || isCoaching) && (
        <div className="space-y-4">
          {response && (
            <div className="rounded-xl p-4" style={{ background: "var(--surface)", border: "1px solid var(--border)" }}>
              <div className="text-xs uppercase tracking-widest mb-2" style={{ color: "var(--muted-2)" }}>Your response</div>
              <p className="text-sm whitespace-pre-wrap" style={{ color: "var(--muted)" }}>{response}</p>
            </div>
          )}

          <div className="rounded-xl p-5" style={{ background: "var(--surface-2)", border: "1px solid var(--border-strong)" }}>
            {round.evaluate && (
              <div className="mb-4">
                <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>
                  What to look for
                </div>
                <ul className="space-y-2">
                  {round.evaluate.map((e, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-2)" }}>
                      <span className="shrink-0 mt-0.5" style={{ color: "var(--muted-2)" }}>—</span>
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {round.coaching_focus && (
              <div>
                <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--muted)" }}>
                  Coaching focus
                </div>
                <ul className="space-y-2">
                  {round.coaching_focus.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-2)" }}>
                      <span className="shrink-0 mt-0.5" style={{ color: "var(--accent)" }}>→</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>

          {!isLast && (
            <button
              onClick={() => onSubmit(response)}
              className="text-sm transition-opacity hover:opacity-70"
              style={{ color: "var(--muted)" }}
            >
              Next round →
            </button>
          )}
        </div>
      )}

      {/* Coaching round (no input required) */}
      {isCoaching && !submitted && (
        <div className="rounded-xl p-5" style={{ background: "var(--accent-bg)", border: "1px solid var(--accent-border)" }}>
          {round.coaching_focus && (
            <div>
              <div className="text-xs font-semibold uppercase tracking-widest mb-3" style={{ color: "var(--accent)" }}>
                Coaching
              </div>
              <ul className="space-y-2">
                {round.coaching_focus.map((f, i) => (
                  <li key={i} className="flex items-start gap-2 text-sm" style={{ color: "var(--text-2)" }}>
                    <span className="shrink-0 mt-0.5" style={{ color: "var(--accent)" }}>→</span>
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

export default function CaseReader({ caseStudy }: { caseStudy: CaseStudy }) {
  const [currentRound, setCurrentRound] = useState(0);
  const [responses, setResponses] = useState<string[]>([]);
  const [completed, setCompleted] = useState(false);

  const round = caseStudy.rounds[currentRound];
  const isLast = currentRound === caseStudy.rounds.length - 1;

  function handleSubmit(response: string) {
    setResponses([...responses, response]);
    if (isLast) {
      setCompleted(true);
    } else {
      setTimeout(() => setCurrentRound((r) => r + 1), 200);
    }
  }

  if (completed) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">⛩</div>
        <h2 className="text-xl font-semibold mb-2" style={{ color: "var(--text)" }}>Case complete</h2>
        <p className="text-sm mb-8" style={{ color: "var(--muted)" }}>You worked through all {caseStudy.rounds.length} rounds.</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => { setCurrentRound(0); setResponses([]); setCompleted(false); }}
            className="px-4 py-2 rounded-lg text-sm transition-opacity hover:opacity-80"
            style={{ border: "1px solid var(--border-strong)", color: "var(--text-2)" }}
          >
            Restart
          </button>
          <a href="/cases" className="px-4 py-2 rounded-lg text-sm text-white transition-opacity hover:opacity-80" style={{ background: "var(--accent)" }}>
            More cases
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Progress bar */}
      <div className="flex items-center gap-1.5 mb-8">
        {caseStudy.rounds.map((_, i) => (
          <div
            key={i}
            className="h-1 flex-1 rounded-full transition-all duration-300"
            style={{
              background: i < currentRound
                ? "var(--accent)"
                : i === currentRound
                ? "color-mix(in srgb, var(--accent) 40%, transparent)"
                : "var(--border)",
            }}
          />
        ))}
      </div>

      <RoundView
        key={currentRound}
        round={round}
        onSubmit={handleSubmit}
        isLast={isLast}
      />
    </div>
  );
}
