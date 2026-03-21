"use client";

import { FormEvent, useEffect, useState } from "react";

type ResumeFact = {
  label: string;
  value: string;
};

type Question = {
  id: string;
  prompt: string;
};

type SessionState = {
  session_id: string;
  status: string;
  facts: ResumeFact[];
  questions: Question[];
  answers: Record<string, string>;
  resume_draft: { markdown: string } | null;
  transcript: string;
  review_result: { notes: string[]; markdown: string } | null;
  final_resume: { markdown: string } | null;
};

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8000";

const defaultBrainDump =
  "I have worked in operations, customer support, and coordination roles. I am good at solving problems, keeping people updated, and making sure work gets done on time. I have helped teams stay organized and customers feel supported.";

export default function Home() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [brainDump, setBrainDump] = useState(defaultBrainDump);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [changeRequest, setChangeRequest] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    void startSession();
  }, []);

  async function startSession() {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/sessions`, { method: "POST" });
      if (!response.ok) {
        throw new Error("Failed to create session.");
      }
      const data = (await response.json()) as SessionState;
      setSession(data);
      setAnswers({});
      setChangeRequest("");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session.");
    } finally {
      setLoading(false);
    }
  }

  async function extractFacts() {
    if (!session) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const intakeResponse = await fetch(`${API_BASE}/sessions/${session.session_id}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_dump: brainDump }),
      });

      if (!intakeResponse.ok) {
        throw new Error("Failed to extract facts.");
      }

      const questionsResponse = await fetch(
        `${API_BASE}/sessions/${session.session_id}/questions`,
        { method: "POST" },
      );

      if (!questionsResponse.ok) {
        throw new Error("Failed to generate follow-up questions.");
      }

      const data = (await questionsResponse.json()) as SessionState;
      setSession(data);
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Something went wrong while extracting facts.",
      );
    } finally {
      setLoading(false);
    }
  }

  async function buildResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const answersResponse = await fetch(`${API_BASE}/sessions/${session.session_id}/answers`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ answers }),
      });

      if (!answersResponse.ok) {
        throw new Error("Failed to save answers.");
      }

      const resumeResponse = await fetch(`${API_BASE}/sessions/${session.session_id}/resume`, {
        method: "POST",
      });

      if (!resumeResponse.ok) {
        throw new Error("Failed to build resume draft.");
      }

      const data = (await resumeResponse.json()) as SessionState;
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to build resume.");
    } finally {
      setLoading(false);
    }
  }

  async function reviewResume() {
    if (!session) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/sessions/${session.session_id}/review`, {
        method: "POST",
      });

      if (!response.ok) {
        throw new Error("Failed to review resume draft.");
      }

      const data = (await response.json()) as SessionState;
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to review resume.");
    } finally {
      setLoading(false);
    }
  }

  async function finalizeResume(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/sessions/${session.session_id}/finalize`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ change_request: changeRequest }),
      });

      if (!response.ok) {
        throw new Error("Failed to apply requested changes.");
      }

      const data = (await response.json()) as SessionState;
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to finalize resume.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-10 lg:px-10">
      <section className="grid gap-6 rounded-[2rem] border border-white/60 bg-white/75 p-8 shadow-[0_30px_80px_rgba(22,33,48,0.08)] backdrop-blur md:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-5">
          <p className="text-sm uppercase tracking-[0.3em] text-coral">
            Resume Co-Pilot
          </p>
          <h1 className="max-w-3xl text-4xl leading-tight md:text-6xl">
            Turn a messy career story into a clean resume draft in one sitting.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-ink/75">
            We are starting with a text-first MVP so we can perfect the core
            interview flow before adding voice, uploads, and PDF export.
          </p>
        </div>

        <div className="rounded-[1.5rem] bg-ink p-6 text-sand">
          <p className="text-sm uppercase tracking-[0.25em] text-sand/70">
            Session Promise
          </p>
          <p className="mt-4 text-2xl leading-9">
            No account required. No persistent profile needed for the first
            version. The session expires automatically.
          </p>
        </div>
      </section>

      <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
        <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(22,33,48,0.06)]">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl">Career Brain Dump</h2>
            <span className="rounded-full bg-tide px-3 py-1 text-sm text-pine">
              {session?.final_resume
                ? "Final Ready"
                : session?.review_result
                  ? "Review Stage"
                  : session?.resume_draft
                    ? "Step 3 of 4"
                    : session?.questions.length
                      ? "Step 2 of 4"
                      : "Step 1 of 4"}
            </span>
          </div>
          <textarea
            className="min-h-[320px] w-full rounded-[1.5rem] border border-ink/10 bg-sand/70 p-5 text-lg leading-8 text-ink outline-none transition focus:border-coral"
            value={brainDump}
            onChange={(event) => setBrainDump(event.target.value)}
          />
          <div className="mt-5 flex gap-3">
            <button
              className="rounded-full bg-coral px-5 py-3 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading || !session}
              onClick={extractFacts}
            >
              Extract Facts
            </button>
            <button
              className="rounded-full border border-ink/15 px-5 py-3 text-ink disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              onClick={() => void startSession()}
            >
              Start New Session
            </button>
          </div>
          {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}
          {session?.facts.length ? (
            <div className="mt-6 rounded-[1.5rem] bg-tide p-5">
              <h3 className="text-lg text-pine">Extracted Facts</h3>
              <div className="mt-3 grid gap-3">
                {session.facts.map((fact) => (
                  <div key={fact.label} className="rounded-2xl bg-white/75 px-4 py-3">
                    <p className="text-sm uppercase tracking-[0.18em] text-pine/70">
                      {fact.label}
                    </p>
                    <p className="mt-1 leading-7">{fact.value}</p>
                  </div>
                ))}
              </div>
            </div>
          ) : null}
        </div>

        <div className="space-y-6">
          <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(22,33,48,0.06)]">
            <h2 className="text-2xl">Follow-Up Questions</h2>
            {session?.questions.length ? (
              <form className="mt-4 space-y-4" onSubmit={buildResume}>
                {session.questions.map((question) => (
                  <label key={question.id} className="block rounded-[1.25rem] bg-tide p-4">
                    <span className="block leading-7 text-pine">{question.prompt}</span>
                    <textarea
                      className="mt-3 min-h-28 w-full rounded-2xl border border-ink/10 bg-white/85 p-4 leading-7 text-ink outline-none focus:border-coral"
                      value={answers[question.id] ?? ""}
                      onChange={(event) =>
                        setAnswers((current) => ({
                          ...current,
                          [question.id]: event.target.value,
                        }))
                      }
                    />
                  </label>
                ))}
                <button
                  type="submit"
                  className="rounded-full bg-pine px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading}
                >
                  Build Resume Draft
                </button>
              </form>
            ) : (
              <p className="mt-4 rounded-[1.25rem] bg-tide px-4 py-4 leading-7 text-pine">
                Extract the intake first and we will generate targeted follow-up questions here.
              </p>
            )}
          </div>

          <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(22,33,48,0.06)]">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl">AI Review</h2>
              <button
                className="rounded-full bg-coral px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
                disabled={loading || !session?.resume_draft}
                onClick={reviewResume}
              >
                Review Transcript + Draft
              </button>
            </div>

            {session?.transcript ? (
              <pre className="mt-4 max-h-56 overflow-auto whitespace-pre-wrap rounded-[1.25rem] bg-sand/80 p-4 text-sm leading-7 text-ink">
                {session.transcript}
              </pre>
            ) : (
              <p className="mt-4 rounded-[1.25rem] bg-tide px-4 py-4 leading-7 text-pine">
                The transcript will appear here after the first draft is generated.
              </p>
            )}

            {session?.review_result ? (
              <div className="mt-4 space-y-4">
                <div className="rounded-[1.25rem] bg-tide p-4">
                  <h3 className="text-lg text-pine">Review Notes</h3>
                  <div className="mt-3 space-y-2">
                    {session.review_result.notes.map((note) => (
                      <p key={note} className="rounded-2xl bg-white/80 px-4 py-3 leading-7">
                        {note}
                      </p>
                    ))}
                  </div>
                </div>

                <pre className="overflow-x-auto whitespace-pre-wrap rounded-[1.25rem] bg-ink p-5 text-sm leading-7 text-sand">
                  {session.review_result.markdown}
                </pre>

                <form className="space-y-3" onSubmit={finalizeResume}>
                  <label className="block">
                    <span className="block text-lg text-pine">
                      Ask for any final changes
                    </span>
                    <textarea
                      className="mt-3 min-h-28 w-full rounded-2xl border border-ink/10 bg-white/85 p-4 leading-7 text-ink outline-none focus:border-coral"
                      value={changeRequest}
                      onChange={(event) => setChangeRequest(event.target.value)}
                      placeholder="Example: make the summary more confident and emphasize customer operations."
                    />
                  </label>
                  <button
                    type="submit"
                    className="rounded-full bg-pine px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={loading}
                  >
                    Prepare Final Resume
                  </button>
                </form>
              </div>
            ) : null}
          </div>

          <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(22,33,48,0.06)]">
            <h2 className="text-2xl">Resume Output</h2>
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-[1.25rem] bg-ink p-5 text-sm leading-7 text-sand">
              {session?.final_resume?.markdown ??
                session?.review_result?.markdown ??
                session?.resume_draft?.markdown ??
                "Your resume draft will appear here after you answer the follow-up questions."}
            </pre>
          </div>
        </div>
      </section>
    </main>
  );
}
