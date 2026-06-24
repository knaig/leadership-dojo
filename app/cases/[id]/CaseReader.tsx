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
      <div className="bg-neutral-900 border border-neutral-800 rounded-xl p-6">
        <div className="flex items-center gap-2 mb-4">
          <span className="text-xs font-mono text-neutral-600">Round {round.round}</span>
          <span className="text-xs text-neutral-700 capitalize">/ {round.type.replace(/_/g, " ")}</span>
        </div>
        <div className="text-neutral-300 text-sm leading-relaxed whitespace-pre-wrap">
          {round.situation}
        </div>
      </div>

      {/* Prompt */}
      <div className="text-orange-400 font-medium text-base">{round.prompt}</div>

      {/* Input */}
      {!submitted && !isCoaching && (
        <div className="space-y-3">
          <textarea
            value={response}
            onChange={(e) => setResponse(e.target.value)}
            placeholder="Write your response..."
            rows={5}
            className="w-full bg-neutral-900 border border-neutral-800 rounded-xl p-4 text-neutral-200 text-sm resize-none focus:outline-none focus:border-neutral-600 placeholder-neutral-700"
          />
          <button
            onClick={handleSubmit}
            disabled={!response.trim()}
            className="px-5 py-2.5 bg-orange-500 text-white text-sm font-medium rounded-lg hover:bg-orange-600 transition-colors disabled:opacity-40 disabled:cursor-not-allowed"
          >
            Submit response
          </button>
        </div>
      )}

      {/* Reveal */}
      {(submitted || isCoaching) && (
        <div className="space-y-4">
          {response && (
            <div className="bg-neutral-900/50 border border-neutral-800 rounded-xl p-4">
              <div className="text-xs text-neutral-600 mb-2">Your response</div>
              <p className="text-neutral-400 text-sm whitespace-pre-wrap">{response}</p>
            </div>
          )}

          <div className="border border-neutral-700 rounded-xl p-5 bg-neutral-900/30">
            {round.evaluate && (
              <div className="mb-4">
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
                  What to look for
                </div>
                <ul className="space-y-2">
                  {round.evaluate.map((e, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                      <span className="text-neutral-600 shrink-0 mt-0.5">—</span>
                      <span>{e}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            {round.coaching_focus && (
              <div>
                <div className="text-xs font-semibold text-neutral-400 uppercase tracking-widest mb-3">
                  Coaching focus
                </div>
                <ul className="space-y-2">
                  {round.coaching_focus.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                      <span className="text-orange-500 shrink-0 mt-0.5">→</span>
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
              className="text-sm text-neutral-400 hover:text-white transition-colors"
            >
              Next round →
            </button>
          )}
        </div>
      )}

      {isCoaching && !submitted && (
        <div className="space-y-4">
          <div className="border border-orange-500/20 rounded-xl p-5 bg-orange-500/5">
            {round.coaching_focus && (
              <div>
                <div className="text-xs font-semibold text-orange-400 uppercase tracking-widest mb-3">
                  Coaching
                </div>
                <ul className="space-y-2">
                  {round.coaching_focus.map((f, i) => (
                    <li key={i} className="flex items-start gap-2 text-sm text-neutral-300">
                      <span className="text-orange-500 shrink-0 mt-0.5">→</span>
                      <span>{f}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
          </div>
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
    const newResponses = [...responses, response];
    setResponses(newResponses);

    if (isLast) {
      setCompleted(true);
    } else {
      setTimeout(() => {
        setCurrentRound((r) => r + 1);
      }, 300);
    }
  }

  if (completed) {
    return (
      <div className="text-center py-16">
        <div className="text-4xl mb-4">⛩</div>
        <h2 className="text-xl font-semibold text-white mb-2">Case complete</h2>
        <p className="text-neutral-500 text-sm mb-8">You worked through all {caseStudy.rounds.length} rounds.</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => { setCurrentRound(0); setResponses([]); setCompleted(false); }}
            className="px-4 py-2 border border-neutral-700 text-neutral-300 rounded-lg text-sm hover:border-neutral-500 transition-colors"
          >
            Restart
          </button>
          <a href="/cases" className="px-4 py-2 bg-orange-500 text-white rounded-lg text-sm hover:bg-orange-600 transition-colors">
            More cases
          </a>
        </div>
      </div>
    );
  }

  return (
    <div>
      {/* Progress */}
      <div className="flex items-center gap-2 mb-8">
        {caseStudy.rounds.map((_, i) => (
          <div
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors ${
              i < currentRound
                ? "bg-orange-500"
                : i === currentRound
                ? "bg-orange-500/50"
                : "bg-neutral-800"
            }`}
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
