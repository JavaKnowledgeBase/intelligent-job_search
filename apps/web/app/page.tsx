"use client";

import { ChangeEvent, FormEvent, useEffect, useRef, useState } from "react";
import { BrandLogo } from "./brand-logo";
import { WelcomeOverlay } from "./welcome-overlay";

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
  expires_at?: string;
};

type PersistedState = {
  sessionId: string | null;
  brainDump: string;
  answers: Record<string, string>;
  changeRequest: string;
  exportTemplate: ExportTemplate;
};

type CreateSessionOptions = {
  brainDump?: string;
  answers?: Record<string, string>;
  changeRequest?: string;
  exportTemplate?: ExportTemplate;
};

type ExportTemplate = "professional" | "modern" | "compact";

type SpeechRecognitionEventLike = Event & {
  results: SpeechRecognitionResultList;
};

type SpeechRecognitionErrorEventLike = Event & {
  error: string;
};

interface SpeechRecognitionLike extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onend: (() => void) | null;
  onerror: ((event: SpeechRecognitionErrorEventLike) => void) | null;
  onresult: ((event: SpeechRecognitionEventLike) => void) | null;
  start: () => void;
  stop: () => void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionLike;
    webkitSpeechRecognition?: new () => SpeechRecognitionLike;
  }
}

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001";
const STORAGE_KEY = "resume-copilot-session";

const defaultBrainDump =
  "I have worked in operations, customer support, and coordination roles. I am good at solving problems, keeping people updated, and making sure work gets done on time. I have helped teams stay organized and customers feel supported.";

export default function Home() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [brainDump, setBrainDump] = useState(defaultBrainDump);
  const [editableFacts, setEditableFacts] = useState<ResumeFact[]>([]);
  const [answers, setAnswers] = useState<Record<string, string>>({});
  const [changeRequest, setChangeRequest] = useState("");
  const [exportTemplate, setExportTemplate] = useState<ExportTemplate>("professional");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [sessionReady, setSessionReady] = useState(false);
  const [showWelcome, setShowWelcome] = useState(true);
  const [speechSupported, setSpeechSupported] = useState(false);
  const [isListening, setIsListening] = useState(false);
  const [voiceStatus, setVoiceStatus] = useState("");
  const [uploadingFile, setUploadingFile] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const recognitionRef = useRef<SpeechRecognitionLike | null>(null);
  const resumeMarkdown =
    session?.final_resume?.markdown ??
    session?.review_result?.markdown ??
    session?.resume_draft?.markdown ??
    "";
  const hasUnsavedFactChanges =
    JSON.stringify(editableFacts) !== JSON.stringify(session?.facts ?? []);
  const canExportResume = Boolean(resumeMarkdown) && !hasUnsavedFactChanges;

  useEffect(() => {
    const SpeechRecognitionCtor =
      typeof window === "undefined"
        ? undefined
        : window.SpeechRecognition ?? window.webkitSpeechRecognition;
    setSpeechSupported(Boolean(SpeechRecognitionCtor));
    void restoreSession();

    return () => {
      recognitionRef.current?.stop();
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload: PersistedState = {
      sessionId: session?.session_id ?? null,
      brainDump,
      answers,
      changeRequest,
      exportTemplate,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [answers, brainDump, changeRequest, exportTemplate, session]);

  useEffect(() => {
    setEditableFacts(session?.facts ?? []);
  }, [session?.facts]);

  function downloadTextFile(filename: string, contents: string) {
    if (!contents.trim()) {
      setError("There is nothing ready to download yet.");
      return;
    }

    const blob = new Blob([contents], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
  }

  async function downloadResumeFile(format: "pdf" | "docx") {
    if (!session?.session_id) {
      setError("Start a session before exporting a file.");
      return;
    }

    try {
      setError("");
      const response = await fetch(
        `${API_BASE}/sessions/${session.session_id}/export/${format}?template=${exportTemplate}`,
      );
      if (!response.ok) {
        throw new Error(`Failed to export ${format.toUpperCase()}.`);
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = `resume-output.${format}`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export your resume.");
    }
  }

  async function downloadJsonExport() {
    if (!session?.session_id) {
      setError("Start a session before exporting a file.");
      return;
    }

    try {
      setError("");
      const response = await fetch(`${API_BASE}/sessions/${session.session_id}/export/json`);
      if (!response.ok) {
        throw new Error("Failed to export JSON.");
      }

      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement("a");
      anchor.href = url;
      anchor.download = "resume-output.json";
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to export JSON.");
    }
  }

  function getPersistedState(): PersistedState | null {
    if (typeof window === "undefined") {
      return null;
    }

    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return null;
    }

    try {
      return JSON.parse(raw) as PersistedState;
    } catch {
      return null;
    }
  }

  async function createFreshSession(options?: CreateSessionOptions) {
    const nextBrainDump = options?.brainDump ?? defaultBrainDump;
    const nextAnswers = options?.answers ?? {};
    const nextChangeRequest = options?.changeRequest ?? "";
    const nextExportTemplate = options?.exportTemplate ?? "professional";

    setLoading(true);
    setError("");
    setSessionReady(false);

    try {
      const response = await fetch(`${API_BASE}/sessions`, { method: "POST" });
      if (!response.ok) {
        throw new Error("Failed to create session.");
      }
      const data = (await response.json()) as SessionState;
      setSession(data);
      setAnswers(nextAnswers);
      setChangeRequest(nextChangeRequest);
      setExportTemplate(nextExportTemplate);
      setBrainDump(nextBrainDump);
      setSessionReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to create session.");
    } finally {
      setLoading(false);
    }
  }

  async function restoreSession() {
    setLoading(true);
    setError("");
    setSessionReady(false);

    const persisted = getPersistedState();
    if (!persisted?.sessionId) {
      await createFreshSession();
      return;
    }

    setBrainDump(persisted.brainDump || defaultBrainDump);
    setAnswers(persisted.answers || {});
    setChangeRequest(persisted.changeRequest || "");
    setExportTemplate(persisted.exportTemplate || "professional");

    try {
      const response = await fetch(`${API_BASE}/sessions/${persisted.sessionId}`);
      if (response.status === 404) {
        await createFreshSession({
          brainDump: persisted.brainDump || defaultBrainDump,
          answers: persisted.answers || {},
          changeRequest: persisted.changeRequest || "",
          exportTemplate: persisted.exportTemplate || "professional",
        });
        return;
      }
      if (!response.ok) {
        throw new Error("Failed to restore your session.");
      }

      const data = (await response.json()) as SessionState;
      setSession(data);
      setSessionReady(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to restore your session.");
    } finally {
      setLoading(false);
    }
  }

  async function extractFacts() {
    let activeSession = session;
    if (!activeSession) {
      try {
        const response = await fetch(`${API_BASE}/sessions`, { method: "POST" });
        if (!response.ok) {
          throw new Error("Failed to create session.");
        }
        activeSession = (await response.json()) as SessionState;
        setSession(activeSession);
        setSessionReady(true);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Failed to create session.");
        return;
      }
    }

    setLoading(true);
    setError("");

    try {
      const intakeResponse = await fetch(`${API_BASE}/sessions/${activeSession.session_id}/intake`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ brain_dump: brainDump }),
      });

      if (!intakeResponse.ok) {
        throw new Error("Failed to extract facts.");
      }

      const questionsResponse = await fetch(
        `${API_BASE}/sessions/${activeSession.session_id}/questions`,
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
      const factsResponse = await fetch(`${API_BASE}/sessions/${session.session_id}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facts: editableFacts.filter((fact) => fact.label.trim() && fact.value.trim()),
        }),
      });

      if (!factsResponse.ok) {
        throw new Error("Failed to save fact edits.");
      }

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

  async function saveFactEdits() {
    if (!session) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/sessions/${session.session_id}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facts: editableFacts.filter((fact) => fact.label.trim() && fact.value.trim()),
        }),
      });

      if (!response.ok) {
        throw new Error("Failed to save fact edits.");
      }

      const data = (await response.json()) as SessionState;
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save fact edits.");
    } finally {
      setLoading(false);
    }
  }

  async function refreshQuestionsFromFacts() {
    if (!session) {
      return;
    }

    setLoading(true);
    setError("");

    try {
      const factsResponse = await fetch(`${API_BASE}/sessions/${session.session_id}/facts`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          facts: editableFacts.filter((fact) => fact.label.trim() && fact.value.trim()),
        }),
      });

      if (!factsResponse.ok) {
        throw new Error("Failed to save fact edits.");
      }

      const questionsResponse = await fetch(`${API_BASE}/sessions/${session.session_id}/questions`, {
        method: "POST",
      });

      if (!questionsResponse.ok) {
        throw new Error("Failed to refresh follow-up questions.");
      }

      const data = (await questionsResponse.json()) as SessionState;
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to refresh follow-up questions.");
    } finally {
      setLoading(false);
    }
  }

  function updateFact(index: number, field: keyof ResumeFact, value: string) {
    setEditableFacts((current) =>
      current.map((fact, factIndex) =>
        factIndex === index ? { ...fact, [field]: value } : fact,
      ),
    );
  }

  function addFact() {
    setEditableFacts((current) => [...current, { label: "", value: "" }]);
  }

  function removeFact(index: number) {
    setEditableFacts((current) => current.filter((_, factIndex) => factIndex !== index));
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

  async function handleFileUpload(event: ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) {
      return;
    }

    setUploadingFile(true);
    setError("");

    try {
      const formData = new FormData();
      formData.append("file", file);
      const response = await fetch(`${API_BASE}/uploads/extract`, {
        method: "POST",
        body: formData,
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Failed to read that file.");
      }

      const payload = (await response.json()) as { extracted_text: string };
      setBrainDump(payload.extracted_text);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to read that file.");
    } finally {
      event.target.value = "";
      setUploadingFile(false);
    }
  }

  function beginFileSelection() {
    fileInputRef.current?.click();
  }

  function startVoiceCapture() {
    const SpeechRecognitionCtor =
      typeof window === "undefined"
        ? undefined
        : window.SpeechRecognition ?? window.webkitSpeechRecognition;

    if (!SpeechRecognitionCtor) {
      setError("Microphone capture is not supported in this browser.");
      return;
    }

    recognitionRef.current?.stop();

    const recognition = new SpeechRecognitionCtor();
    recognition.lang = "en-US";
    recognition.continuous = true;
    recognition.interimResults = true;

    recognition.onresult = (event) => {
      const transcript = Array.from(event.results)
        .map((result) => result[0]?.transcript ?? "")
        .join(" ")
        .trim();

      if (transcript) {
        setBrainDump(transcript);
      }
    };

    recognition.onerror = (event) => {
      setVoiceStatus("");
      setIsListening(false);
      setError(`Microphone error: ${event.error}`);
    };

    recognition.onend = () => {
      setVoiceStatus("");
      setIsListening(false);
    };

    recognitionRef.current = recognition;
    setError("");
    setIsListening(true);
    setVoiceStatus("Listening... speak naturally and we will fill the text box.");
    recognition.start();
  }

  function stopVoiceCapture() {
    recognitionRef.current?.stop();
    setIsListening(false);
    setVoiceStatus("");
  }

  function formatExpiry(expiresAt?: string) {
    if (!expiresAt) {
      return "Session active";
    }

    const parsed = new Date(expiresAt);
    if (Number.isNaN(parsed.getTime())) {
      return "Session active";
    }

    return `Session expires at ${parsed.toLocaleTimeString([], {
      hour: "numeric",
      minute: "2-digit",
    })}`;
  }

  function getStageLabel() {
    if (hasUnsavedFactChanges) {
      return "Fact Edits Pending";
    }
    if (session?.final_resume) {
      return "Final Ready";
    }
    if (session?.review_result) {
      return "Review Stage";
    }
    if (session?.resume_draft) {
      return "Step 3 of 4";
    }
    if (session?.questions.length) {
      return "Step 2 of 4";
    }
    return "Step 1 of 4";
  }

  return (
    <>
      <input
        ref={fileInputRef}
        hidden
        type="file"
        accept=".txt,.md,.docx,.pdf"
        onChange={handleFileUpload}
      />
      <WelcomeOverlay
        open={showWelcome}
        brainDump={brainDump}
        onBrainDumpChange={setBrainDump}
        onUseTypedIntro={() => setSessionReady(true)}
        onUploadClick={beginFileSelection}
        onVoiceStart={startVoiceCapture}
        onVoiceStop={stopVoiceCapture}
        speechSupported={speechSupported}
        isListening={isListening}
        voiceStatus={voiceStatus}
        uploadingFile={uploadingFile}
        onClose={() => setShowWelcome(false)}
      />
      <main className="mx-auto flex min-h-screen max-w-7xl flex-col gap-8 px-6 py-10 lg:px-10">
        <section className="grid gap-6 rounded-[2rem] border border-white/60 bg-white/75 p-8 shadow-[0_30px_80px_rgba(22,33,48,0.08)] backdrop-blur md:grid-cols-[1.3fr_0.9fr]">
        <div className="space-y-5">
          <BrandLogo />
          <p className="text-sm uppercase tracking-[0.3em] text-coral">Resume Co-Pilot</p>
          <h1 className="max-w-3xl text-4xl leading-tight md:text-6xl">
            Turn a messy career story into a clean resume draft in one sitting.
          </h1>
          <p className="max-w-2xl text-lg leading-8 text-ink/75">
            We are starting with a text-first MVP so we can perfect the core
            interview flow before adding voice, uploads, and PDF export.
          </p>
          <div className="max-w-2xl rounded-[1.5rem] border border-ink/10 bg-white/70 px-5 py-4 text-base leading-7 text-ink/80">
            Start here: click <span className="font-semibold text-coral">Start Building And Type</span> on the welcome screen, then use the large text box below.
            Upload and voice intake are being added into the same opening flow.
          </div>
        </div>

        <div className="rounded-[1.5rem] bg-ink p-6 text-sand">
          <p className="text-sm uppercase tracking-[0.25em] text-sand/70">
            Session Promise
          </p>
          <p className="mt-4 text-2xl leading-9">
            No account required. No persistent profile needed for the first
            version. The session expires automatically.
          </p>
          <p className="mt-4 text-sm leading-6 text-sand/75">
            {formatExpiry(session?.expires_at)}
          </p>
        </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[1.1fr_0.9fr]">
          <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(22,33,48,0.06)]">
          <div className="mb-5 flex items-center justify-between">
            <h2 className="text-2xl">Career Brain Dump</h2>
            <span className="rounded-full bg-tide px-3 py-1 text-sm text-pine">
              {getStageLabel()}
            </span>
          </div>
          <p className="mb-4 rounded-[1rem] bg-tide px-4 py-3 text-sm leading-6 text-pine">
            {loading && !sessionReady
              ? "Preparing your session..."
              : "Paste your background, job history, skills, and goals here. Then click Extract Facts to begin."}
          </p>
          <textarea
            className="min-h-[320px] w-full rounded-[1.5rem] border border-ink/10 bg-sand/70 p-5 text-lg leading-8 text-ink outline-none transition focus:border-coral"
            value={brainDump}
            onChange={(event) => setBrainDump(event.target.value)}
          />
          <div className="mt-5 flex gap-3">
            <button
              type="button"
              className="rounded-full bg-coral px-5 py-3 text-white transition hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              onClick={extractFacts}
            >
              {loading ? "Working..." : "Extract Facts"}
            </button>
            <button
              type="button"
              className="rounded-full border border-ink/15 px-5 py-3 text-ink disabled:cursor-not-allowed disabled:opacity-60"
              disabled={loading}
              onClick={() => void createFreshSession()}
            >
              Start New Session
            </button>
            <button
              type="button"
              className="rounded-full border border-ink/15 px-5 py-3 text-ink"
              onClick={() => setShowWelcome(true)}
            >
              Show Welcome
            </button>
          </div>
          {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}
          {session?.facts.length ? (
            <div className="mt-6 rounded-[1.5rem] bg-tide p-5">
              <div className="flex items-center justify-between gap-4">
                <div>
                  <h3 className="text-lg text-pine">Extracted Facts</h3>
                  <p className="mt-1 text-sm leading-6 text-pine/75">
                    Edit these before building if the draft needs clearer facts.
                  </p>
                  {hasUnsavedFactChanges ? (
                    <p className="mt-2 text-sm font-semibold text-coral">
                      You have unsaved fact edits.
                    </p>
                  ) : null}
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={loading || !hasUnsavedFactChanges}
                    onClick={saveFactEdits}
                  >
                    Save Facts
                  </button>
                  <button
                    type="button"
                    className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={loading}
                    onClick={refreshQuestionsFromFacts}
                  >
                    Refresh Questions
                  </button>
                </div>
              </div>
              <div className="mt-3 grid gap-3">
                {editableFacts.map((fact, index) => (
                  <div key={`${index}-${fact.label}`} className="rounded-2xl bg-white/75 px-4 py-4">
                    <div className="grid gap-3 md:grid-cols-[0.35fr_1fr_auto]">
                      <input
                        className="rounded-2xl border border-ink/10 bg-white px-4 py-3 text-sm uppercase tracking-[0.14em] text-pine/80 outline-none focus:border-coral"
                        value={fact.label}
                        onChange={(event) => updateFact(index, "label", event.target.value)}
                        placeholder="Label"
                      />
                      <textarea
                        className="min-h-24 rounded-2xl border border-ink/10 bg-white px-4 py-3 leading-7 text-ink outline-none focus:border-coral"
                        value={fact.value}
                        onChange={(event) => updateFact(index, "value", event.target.value)}
                        placeholder="Fact value"
                      />
                      <button
                        type="button"
                        className="rounded-full border border-ink/15 px-4 py-3 text-sm text-ink"
                        onClick={() => removeFact(index)}
                      >
                        Remove
                      </button>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-4">
                <button
                  type="button"
                  className="rounded-full border border-ink/15 px-4 py-2 text-sm text-ink"
                  onClick={addFact}
                >
                  Add Fact
                </button>
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
                  disabled={loading || hasUnsavedFactChanges}
                >
                  {hasUnsavedFactChanges ? "Save Facts Or Refresh Questions First" : "Build Resume Draft"}
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
              <div className="flex flex-wrap gap-3">
                <button
                  className="rounded-full border border-ink/15 px-5 py-3 text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!session?.transcript}
                  onClick={() => downloadTextFile("session-transcript.md", session?.transcript ?? "")}
                >
                  Download Transcript
                </button>
                <button
                  className="rounded-full bg-coral px-5 py-3 text-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={loading || !session?.resume_draft || hasUnsavedFactChanges}
                  onClick={reviewResume}
                >
                  Review Transcript + Draft
                </button>
              </div>
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
                    disabled={loading || hasUnsavedFactChanges}
                  >
                    Prepare Final Resume
                  </button>
                </form>
              </div>
            ) : null}
          </div>

          <div className="rounded-[2rem] border border-ink/10 bg-white/80 p-6 shadow-[0_20px_60px_rgba(22,33,48,0.06)]">
            <div className="flex items-center justify-between gap-4">
              <h2 className="text-2xl">Resume Output</h2>
              <div className="flex flex-wrap items-center gap-3">
                <label className="flex items-center gap-3 rounded-full border border-ink/15 bg-white px-4 py-2 text-sm text-ink">
                  <span className="uppercase tracking-[0.18em] text-ink/60">Template</span>
                  <select
                    className="bg-transparent outline-none"
                    value={exportTemplate}
                    onChange={(event) => setExportTemplate(event.target.value as ExportTemplate)}
                  >
                    <option value="professional">Professional</option>
                    <option value="modern">Modern</option>
                    <option value="compact">Compact</option>
                  </select>
                </label>
                <button
                  className="rounded-full border border-ink/15 px-5 py-3 text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canExportResume}
                  onClick={() => void downloadJsonExport()}
                >
                  Export JSON
                </button>
                <button
                  className="rounded-full border border-ink/15 px-5 py-3 text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canExportResume}
                  onClick={() => downloadTextFile("resume-output.md", resumeMarkdown)}
                >
                  Download Markdown
                </button>
                <button
                  className="rounded-full border border-ink/15 px-5 py-3 text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canExportResume || loading}
                  onClick={() => void downloadResumeFile("docx")}
                >
                  Export DOCX
                </button>
                <button
                  className="rounded-full border border-ink/15 px-5 py-3 text-ink disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!canExportResume || loading}
                  onClick={() => void downloadResumeFile("pdf")}
                >
                  Export PDF
                </button>
              </div>
            </div>
            {hasUnsavedFactChanges ? (
              <p className="mt-4 rounded-[1rem] bg-[#fff0ea] px-4 py-3 text-sm leading-6 text-coral">
                Save or refresh your fact edits before building, reviewing, or exporting to keep the resume in sync.
              </p>
            ) : null}
            <pre className="mt-4 overflow-x-auto whitespace-pre-wrap rounded-[1.25rem] bg-ink p-5 text-sm leading-7 text-sand">
              {resumeMarkdown ||
                "Your resume draft will appear here after you answer the follow-up questions."}
            </pre>
          </div>
          </div>
        </section>

        <div className="pointer-events-none fixed bottom-4 right-4 rounded-full bg-white/80 px-4 py-2 text-sm tracking-[0.18em] text-ink/70 shadow-[0_10px_30px_rgba(22,33,48,0.08)] backdrop-blur">
          Developed by Ravi Kafley
        </div>
      </main>
    </>
  );
}
