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
  moderation_notes: string[];
  resume_draft: { markdown: string } | null;
  transcript: string;
  review_result: { notes: string[]; markdown: string } | null;
  final_resume: { markdown: string } | null;
  expires_at?: string;
};

type PersistedState = {
  sessionId: string | null;
  brainDump: string;
  voiceTranscript: string;
  uploadedFileName: string;
  uploadedFileText: string;
  answers: Record<string, string>;
  changeRequest: string;
  exportTemplate: ExportTemplate;
};

type CreateSessionOptions = {
  brainDump?: string;
  voiceTranscript?: string;
  uploadedFileName?: string;
  uploadedFileText?: string;
  answers?: Record<string, string>;
  changeRequest?: string;
  exportTemplate?: ExportTemplate;
};

type ExportTemplate = "professional" | "modern" | "compact";
type FlowStep = "input" | "facts" | "questions" | "draft" | "export";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE_URL ?? "http://localhost:8001";
const STORAGE_KEY = "resume-copilot-session";

const defaultBrainDump =
  "I have worked in operations, customer support, and coordination roles. I am good at solving problems, keeping people updated, and making sure work gets done on time. I have helped teams stay organized and customers feel supported.";

export default function Home() {
  const [session, setSession] = useState<SessionState | null>(null);
  const [brainDump, setBrainDump] = useState(defaultBrainDump);
  const [lastVoiceTranscript, setLastVoiceTranscript] = useState("");
  const [uploadedFileName, setUploadedFileName] = useState("");
  const [uploadedFileText, setUploadedFileText] = useState("");
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
  const [activeStep, setActiveStep] = useState<FlowStep>("input");
  const [editableResumeMarkdown, setEditableResumeMarkdown] = useState("");
  const [savingResume, setSavingResume] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const peerConnectionRef = useRef<RTCPeerConnection | null>(null);
  const dataChannelRef = useRef<RTCDataChannel | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const partialTranscriptRef = useRef<Map<string, string>>(new Map());
  const completedTranscriptRef = useRef<string[]>([]);
  const resumeMarkdown =
    session?.final_resume?.markdown ??
    session?.review_result?.markdown ??
    session?.resume_draft?.markdown ??
    "";
  const hasUnsavedFactChanges =
    JSON.stringify(editableFacts) !== JSON.stringify(session?.facts ?? []);
  const canExportResume = Boolean(resumeMarkdown) && !hasUnsavedFactChanges;
  const hasUnsavedResumeChanges = editableResumeMarkdown.trim() !== resumeMarkdown.trim();

  useEffect(() => {
    setSpeechSupported(
      typeof window !== "undefined" &&
        "RTCPeerConnection" in window &&
        typeof navigator !== "undefined" &&
        Boolean(navigator.mediaDevices?.getUserMedia),
    );
    void restoreSession();

    return () => {
      dataChannelRef.current?.close();
      peerConnectionRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  useEffect(() => {
    if (typeof window === "undefined") {
      return;
    }

    const payload: PersistedState = {
      sessionId: session?.session_id ?? null,
      brainDump,
      voiceTranscript: lastVoiceTranscript,
      uploadedFileName,
      uploadedFileText,
      answers,
      changeRequest,
      exportTemplate,
    };

    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(payload));
  }, [answers, brainDump, changeRequest, exportTemplate, session, uploadedFileName, uploadedFileText, lastVoiceTranscript]);

  useEffect(() => {
    setEditableFacts(session?.facts ?? []);
  }, [session?.facts]);

  useEffect(() => {
    setEditableResumeMarkdown(resumeMarkdown);
  }, [resumeMarkdown]);

  useEffect(() => {
    if (session?.final_resume) {
      setActiveStep("export");
      return;
    }
    if (session?.review_result || session?.resume_draft) {
      setActiveStep("draft");
      return;
    }
    if (session?.questions.length) {
      setActiveStep(hasUnsavedFactChanges ? "facts" : "questions");
      return;
    }
    if (session?.facts.length) {
      setActiveStep("facts");
      return;
    }
    setActiveStep("input");
  }, [
    hasUnsavedFactChanges,
    session?.facts,
    session?.final_resume,
    session?.questions,
    session?.resume_draft,
    session?.review_result,
  ]);

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
      await saveEditedResumeDraft();
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
    const nextVoiceTranscript = options?.voiceTranscript ?? "";
    const nextUploadedFileName = options?.uploadedFileName ?? "";
    const nextUploadedFileText = options?.uploadedFileText ?? "";
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
      setLastVoiceTranscript(nextVoiceTranscript);
      setUploadedFileName(nextUploadedFileName);
      setUploadedFileText(nextUploadedFileText);
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
    setLastVoiceTranscript(persisted.voiceTranscript || "");
    setUploadedFileName(persisted.uploadedFileName || "");
    setUploadedFileText(persisted.uploadedFileText || "");
    setAnswers(persisted.answers || {});
    setChangeRequest(persisted.changeRequest || "");
    setExportTemplate(persisted.exportTemplate || "professional");

    try {
      const response = await fetch(`${API_BASE}/sessions/${persisted.sessionId}`);
      if (response.status === 404) {
        await createFreshSession({
          brainDump: persisted.brainDump || defaultBrainDump,
          voiceTranscript: persisted.voiceTranscript || "",
          uploadedFileName: persisted.uploadedFileName || "",
          uploadedFileText: persisted.uploadedFileText || "",
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

  function getCombinedBrainDump() {
    const typedText = brainDump.trim();
    const voiceText = lastVoiceTranscript.trim();
    const uploadedText = uploadedFileText.trim();
    const parts: string[] = [];

    if (typedText && typedText !== defaultBrainDump.trim()) {
      parts.push(typedText);
    }

    if (voiceText) {
      parts.push(voiceText);
    }

    if (uploadedText) {
      parts.push(uploadedText);
    }

    if (parts.length) {
      return parts.join("\n\n");
    }

    return typedText || defaultBrainDump;
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
        body: JSON.stringify({ brain_dump: getCombinedBrainDump() }),
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

  async function processAndBuildResumeFromWelcome() {
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
        body: JSON.stringify({ brain_dump: getCombinedBrainDump() }),
      });

      if (!intakeResponse.ok) {
        throw new Error("Failed to process your background.");
      }

      const intakeData = (await intakeResponse.json()) as SessionState;
      setSession(intakeData);

      const resumeResponse = await fetch(`${API_BASE}/sessions/${activeSession.session_id}/resume`, {
        method: "POST",
      });

      if (!resumeResponse.ok) {
        throw new Error("Failed to build resume draft.");
      }

      const resumeData = (await resumeResponse.json()) as SessionState;
      setSession(resumeData);
      setShowWelcome(false);
      setActiveStep("draft");
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to process and build resume.");
    } finally {
      setLoading(false);
    }
  }

  async function saveEditedResumeDraft() {
    if (!session?.session_id) {
      return;
    }

    const nextMarkdown = editableResumeMarkdown.trim();
    if (!nextMarkdown || !hasUnsavedResumeChanges) {
      return;
    }

    setSavingResume(true);
    setError("");

    try {
      const response = await fetch(`${API_BASE}/sessions/${session.session_id}/resume-draft`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ markdown: nextMarkdown }),
      });

      if (!response.ok) {
        throw new Error("Failed to save resume changes.");
      }

      const data = (await response.json()) as SessionState;
      setSession(data);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save resume changes.");
    } finally {
      setSavingResume(false);
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
      setUploadedFileName(file.name);
      setUploadedFileText(payload.extracted_text);
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

  function buildLiveTranscript() {
    const partials = Array.from(partialTranscriptRef.current.values()).filter(Boolean);
    return [...completedTranscriptRef.current, ...partials].join(" ").trim();
  }

  function syncLiveTranscript() {
    const transcript = buildLiveTranscript();
    setLastVoiceTranscript(transcript);
    return transcript;
  }

  async function startVoiceCapture() {
    if (!speechSupported || !navigator.mediaDevices?.getUserMedia) {
      setError("Live microphone transcription is not supported in this browser.");
      return;
    }

    try {
      setError("");
      setVoiceStatus("Starting live transcription...");
      completedTranscriptRef.current = lastVoiceTranscript.trim()
        ? [lastVoiceTranscript.trim()]
        : [];
      partialTranscriptRef.current.clear();
      dataChannelRef.current?.close();
      peerConnectionRef.current?.close();
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());

      const tokenResponse = await fetch(`${API_BASE}/audio/realtime-token`, { method: "POST" });
      if (!tokenResponse.ok) {
        const payload = (await tokenResponse.json().catch(() => null)) as { detail?: string } | null;
        throw new Error(payload?.detail ?? "Realtime transcription could not be started.");
      }

      const tokenPayload = (await tokenResponse.json()) as { value: string };
      const ephemeralKey = tokenPayload.value;
      if (!ephemeralKey) {
        throw new Error("Realtime transcription token was missing.");
      }

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      mediaStreamRef.current = stream;
      const peerConnection = new RTCPeerConnection();
      peerConnectionRef.current = peerConnection;

      stream.getTracks().forEach((track) => peerConnection.addTrack(track, stream));

      const dataChannel = peerConnection.createDataChannel("oai-events");
      dataChannelRef.current = dataChannel;
      dataChannel.onopen = () => {
        setVoiceStatus("Live transcription is running...");
        dataChannel.send(
          JSON.stringify({
            type: "session.update",
            session: {
              audio: {
                input: {
                  format: {
                    type: "audio/pcm",
                    rate: 24000,
                  },
                  transcription: {
                    model: "gpt-4o-mini-transcribe",
                    language: "en",
                  },
                  turn_detection: {
                    type: "server_vad",
                    silence_duration_ms: 500,
                  },
                },
              },
            },
          }),
        );
      };
      dataChannel.onerror = () => {
        setError("The live transcription channel ran into a connection problem.");
      };
      dataChannel.onmessage = (event) => {
        const payload = JSON.parse(event.data) as {
          type?: string;
          item_id?: string;
          delta?: string;
          transcript?: string;
        };
        const itemId = payload.item_id ?? "live";

        if (payload.type === "conversation.item.input_audio_transcription.delta" && payload.delta) {
          partialTranscriptRef.current.set(
            itemId,
            `${partialTranscriptRef.current.get(itemId) ?? ""}${payload.delta}`,
          );
          syncLiveTranscript();
          return;
        }

        if (
          payload.type === "conversation.item.input_audio_transcription.completed" &&
          payload.transcript
        ) {
          const transcript = payload.transcript.trim();
          if (transcript) {
            completedTranscriptRef.current.push(transcript);
          }
          partialTranscriptRef.current.delete(itemId);
          syncLiveTranscript();
        }
      };

      const offer = await peerConnection.createOffer();
      await peerConnection.setLocalDescription(offer);

      const sdpResponse = await fetch("https://api.openai.com/v1/realtime/calls", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${ephemeralKey}`,
          "Content-Type": "application/sdp",
        },
        body: offer.sdp,
      });

      if (!sdpResponse.ok) {
        throw new Error("OpenAI realtime connection could not be established.");
      }

      const answerSdp = await sdpResponse.text();
      await peerConnection.setRemoteDescription({
        type: "answer",
        sdp: answerSdp,
      });

      setIsListening(true);
    } catch (err) {
      peerConnectionRef.current?.close();
      peerConnectionRef.current = null;
      dataChannelRef.current?.close();
      dataChannelRef.current = null;
      mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
      mediaStreamRef.current = null;
      setError(err instanceof Error ? err.message : "Unable to start live transcription.");
      setVoiceStatus("");
      setIsListening(false);
    }
  }

  function stopVoiceCapture() {
    dataChannelRef.current?.send(JSON.stringify({ type: "input_audio_buffer.commit" }));
    const transcript = syncLiveTranscript();
    dataChannelRef.current?.close();
    dataChannelRef.current = null;
    peerConnectionRef.current?.close();
    peerConnectionRef.current = null;
    mediaStreamRef.current?.getTracks().forEach((track) => track.stop());
    mediaStreamRef.current = null;
    setIsListening(false);
    setVoiceStatus(transcript ? "Live transcript is ready to review or edit." : "");
  }

  function clearVoiceTranscript() {
    partialTranscriptRef.current.clear();
    completedTranscriptRef.current = [];
    setLastVoiceTranscript("");
    setVoiceStatus("");
  }

  function clearTypedInput() {
    setBrainDump("");
  }

  function handleVoiceTranscriptChange(value: string) {
    setLastVoiceTranscript(value);
    completedTranscriptRef.current = value.trim() ? [value.trim()] : [];
    partialTranscriptRef.current.clear();
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

  const flowSteps: Array<{
    id: FlowStep;
    label: string;
    title: string;
    description: string;
    enabled: boolean;
  }> = [
    {
      id: "input",
      label: "01",
      title: "Career Input",
      description: "Tell your story by typing, upload, or voice.",
      enabled: true,
    },
    {
      id: "facts",
      label: "02",
      title: "Fact Review",
      description: "Edit the extracted facts before moving forward.",
      enabled: Boolean(session?.facts.length),
    },
    {
      id: "questions",
      label: "03",
      title: "Follow-Up Questions",
      description: "Add measurable detail and target-role context.",
      enabled: Boolean(session?.questions.length),
    },
    {
      id: "draft",
      label: "04",
      title: "Draft And Improve",
      description: "Review the draft, transcript, and final changes.",
      enabled: Boolean(session?.resume_draft || session?.review_result || session?.final_resume),
    },
    {
      id: "export",
      label: "05",
      title: "Export",
      description: "Choose a template and download the final result.",
      enabled: canExportResume,
    },
  ];

  const showDraftWorkspace = activeStep === "draft" && !showWelcome && Boolean(resumeMarkdown);

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
        uploadedFileName={uploadedFileName}
        lastVoiceTranscript={lastVoiceTranscript}
        loading={loading}
        onBrainDumpChange={setBrainDump}
        onUseTypedIntro={() => setSessionReady(true)}
        onProcessBuildResume={processAndBuildResumeFromWelcome}
        onVoiceTranscriptChange={handleVoiceTranscriptChange}
        onClearBrainDump={clearTypedInput}
        onClearVoiceTranscript={clearVoiceTranscript}
        onUploadClick={beginFileSelection}
        onVoiceStart={startVoiceCapture}
        onVoiceStop={stopVoiceCapture}
        speechSupported={speechSupported}
        isListening={isListening}
        voiceStatus={voiceStatus}
        uploadingFile={uploadingFile}
        onClose={() => setShowWelcome(false)}
      />
      {showDraftWorkspace ? (
        <main className="mx-auto flex h-screen w-full max-w-[1600px] flex-col p-4">
          <section className="grid h-full min-h-0 gap-4 xl:grid-cols-[40%_60%]">
            <aside className="executive-panel executive-panel-stage executive-panel-support flex min-h-0 flex-col overflow-hidden p-6">
              <div className="shrink-0">
                <BrandLogo />
                <h1 className="executive-display mt-5 text-3xl leading-[0.95] text-ink md:text-[3.2rem]">
                  Resume Co-Pilot
                </h1>
                <p className="mt-3 max-w-xl text-base leading-7 text-[var(--executive-mute)]">
                  You can edit the resume if more changes required and download.
                </p>
              </div>

              <div className="mt-6 grid shrink-0 gap-3 md:grid-cols-3">
                <button
                  type="button"
                  className="executive-primary-button w-full"
                  disabled={!canExportResume || loading || savingResume}
                  onClick={() => void downloadResumeFile("pdf")}
                >
                  Download PDF
                </button>
                <button
                  type="button"
                  className="executive-secondary-button w-full"
                  disabled={!canExportResume || loading || savingResume}
                  onClick={() => void downloadResumeFile("docx")}
                >
                  Download DOCX
                </button>
                <button
                  type="button"
                  className="executive-secondary-button w-full"
                  disabled={!session?.transcript}
                  onClick={() => downloadTextFile("session-transcript.md", session?.transcript ?? "")}
                >
                  Download Transcript
                </button>
              </div>

              <div className="mt-5 min-h-0 flex-1 overflow-hidden rounded-[1.4rem] border border-[var(--executive-line)] bg-[var(--executive-soft)] p-4">
                <div className="flex items-center justify-between gap-3">
                  <p className="executive-kicker">Transcript</p>
                  <span className="text-xs uppercase tracking-[0.2em] text-[var(--executive-mute)]">
                    Source Notes
                  </span>
                </div>
                <div className="mt-3 h-[calc(100%-2rem)] overflow-auto rounded-[1.1rem] border border-[var(--executive-line)] bg-white/80 p-4 text-sm leading-7 text-[var(--executive-mute)]">
                  {session?.transcript ? (
                    <pre className="whitespace-pre-wrap font-inherit text-inherit">
                      {session.transcript}
                    </pre>
                  ) : (
                    <p>The transcript will appear here after the resume is built.</p>
                  )}
                </div>
              </div>
            </aside>

            <section className="executive-panel executive-panel-stage executive-panel-support flex min-h-0 flex-col overflow-hidden p-5 md:p-6">
              <div className="flex shrink-0 items-start justify-between gap-4">
                <div>
                  <p className="executive-kicker">Editable Resume</p>
                  <h2 className="mt-2 text-2xl md:text-3xl">Review And Refine</h2>
                </div>
                <div className="flex flex-wrap gap-3">
                  <button
                    type="button"
                    className="executive-secondary-button"
                    onClick={() => setShowWelcome(true)}
                  >
                    Back To Intake
                  </button>
                  <button
                    type="button"
                    className="executive-primary-button"
                    disabled={!hasUnsavedResumeChanges || savingResume}
                    onClick={() => void saveEditedResumeDraft()}
                  >
                    {savingResume ? "Saving..." : "Save Resume"}
                  </button>
                </div>
              </div>

              {error ? <p className="mt-4 text-sm text-coral">{error}</p> : null}

              <div className="mt-5 min-h-0 flex-1 overflow-hidden rounded-[1.6rem] border border-[rgba(19,32,51,0.08)] bg-[linear-gradient(180deg,#ffffff_0%,#f4f8fb_100%)] p-4 md:p-6">
                <textarea
                  className="h-full w-full resize-none overflow-auto rounded-[1.25rem] border border-[rgba(24,36,53,0.08)] bg-white px-6 py-6 font-['Georgia'] text-[15px] leading-7 text-ink outline-none shadow-[inset_0_1px_0_rgba(255,255,255,0.75)]"
                  value={editableResumeMarkdown}
                  onChange={(event) => setEditableResumeMarkdown(event.target.value)}
                  onBlur={() => void saveEditedResumeDraft()}
                />
              </div>
            </section>
          </section>
        </main>
      ) : (
      <main className="mx-auto flex min-h-screen max-w-[1450px] flex-col gap-8 px-4 py-6 pb-20 md:px-8 xl:px-10">
        <section className="executive-hero relative overflow-hidden rounded-[2.2rem] border border-white/10 p-8 shadow-[0_30px_110px_rgba(11,19,34,0.24)] md:p-10">
        <div className="executive-orbit executive-orbit-a" />
        <div className="executive-orbit executive-orbit-b" />
        <div className="relative grid gap-8 md:grid-cols-[1.3fr_0.9fr]">
        <div className="min-w-0 space-y-6">
          <BrandLogo />
          <p className="text-sm uppercase tracking-[0.35em] text-[var(--executive-bg-strong)]">Resume Co-Pilot</p>
          <h1 className="executive-display max-w-4xl text-4xl leading-[1.02] text-white md:text-6xl">
            Transform a rough career story into a boardroom-ready resume.
          </h1>
          <p className="max-w-3xl text-lg leading-8 text-white/76">
            A premium drafting workspace for capturing experience, refining facts,
            answering strategic follow-up questions, and exporting a polished final result.
          </p>
          <div className="max-w-3xl rounded-[1.6rem] border border-white/10 bg-white/8 px-5 py-4 text-base leading-7 text-white/74 backdrop-blur-sm">
            Start with the concierge welcome, bring in your story by text, upload, or voice,
            then move through extraction, review, refinement, and export in a single guided flow.
          </div>
          <div className="grid gap-3 md:grid-cols-3">
            <div className="executive-metric">
              <strong>Capture</strong>
              <span>Type, upload, or dictate your experience in the format that feels easiest.</span>
            </div>
            <div className="executive-metric">
              <strong>Refine</strong>
              <span>Review extracted facts and answer targeted questions before drafting.</span>
            </div>
            <div className="executive-metric">
              <strong>Deliver</strong>
              <span>Export a professional final resume in Markdown, JSON, DOCX, or PDF.</span>
            </div>
          </div>
        </div>

        <div className="executive-sidebar min-w-0 rounded-[1.75rem] border border-white/10 bg-white/6 p-6 text-white backdrop-blur-sm">
          <p className="text-sm uppercase tracking-[0.25em] text-[var(--executive-bg-strong)]">
            Executive Session
          </p>
          <p className="mt-4 text-2xl leading-9">
            Private by default. Focused on clarity, speed, and professional output.
          </p>
          <p className="mt-4 text-sm leading-7 text-white/72">
            {formatExpiry(session?.expires_at)}
          </p>
          <div className="mt-6 grid gap-3">
            <div className="rounded-[1.2rem] border border-white/10 bg-white/6 px-4 py-3 text-sm leading-7 text-white/72">
              {hasUnsavedFactChanges
                ? "Fact edits need to be synced before final drafting and export."
                : "The workspace is aligned and ready for the next step."}
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-white/6 px-4 py-3 text-sm leading-7 text-white/72">
              No account is required, and the session is designed to remain temporary.
            </div>
            <div className="rounded-[1.2rem] border border-white/10 bg-white/6 px-4 py-3 text-sm leading-7 text-white/72">
              Workflow: intake, facts, questions, review, then export.
            </div>
          </div>
        </div>
        </div>
        </section>

        <section className="grid gap-6 lg:grid-cols-[300px_1fr]">
          <aside className="executive-panel executive-panel-stage executive-panel-progress h-fit p-4 md:sticky md:top-6">
            <p className="executive-kicker">Workflow</p>
            <h2 className="mt-2 text-2xl">Progress</h2>
            <div className="mt-5 space-y-3">
              {flowSteps.map((step) => {
                const isActive = activeStep === step.id;
                return (
                  <button
                    key={step.id}
                    type="button"
                    className={`w-full rounded-[1.35rem] border px-4 py-4 text-left transition ${
                      isActive
                        ? "border-[var(--executive-accent)] bg-[var(--executive-accent-ghost)] shadow-[0_16px_32px_rgba(159,122,57,0.08)]"
                        : "border-[var(--executive-line)] bg-white"
                    } ${step.enabled ? "opacity-100" : "opacity-55"}`}
                    disabled={!step.enabled}
                    onClick={() => setActiveStep(step.id)}
                  >
                    <div className="flex items-center gap-3">
                      <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-[var(--executive-soft)] text-sm font-semibold text-pine">
                        {step.label}
                      </span>
                      <div>
                        <p className="text-base font-semibold text-ink">{step.title}</p>
                        <p className="mt-1 text-sm leading-6 text-[var(--executive-mute)]">
                          {step.description}
                        </p>
                      </div>
                    </div>
                  </button>
                );
              })}
            </div>
            <div className="mt-5 rounded-[1.35rem] border border-[var(--executive-line)] bg-[var(--executive-soft)] px-4 py-4 text-sm leading-7 text-[var(--executive-mute)]">
              Use the sidebar to revisit finished steps. Locked steps open automatically once the required work is complete.
            </div>
            {session?.moderation_notes?.length ? (
              <div className="executive-review-note mt-4 px-4 py-4 text-sm leading-7">
                <p className="executive-kicker">Content Review</p>
                <div className="mt-2 space-y-2">
                  {session.moderation_notes.map((note) => (
                    <p key={note}>{note}</p>
                  ))}
                </div>
              </div>
            ) : null}
          </aside>

          <div className="min-w-0 space-y-6">
            {activeStep === "input" ? (
              <section className="executive-panel executive-panel-stage executive-panel-input p-6 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="executive-kicker">Step 1</p>
                    <h2 className="mt-2 text-3xl">Career Input</h2>
                    <p className="mt-3 max-w-3xl text-base leading-8 text-[var(--executive-mute)]">
                      Start with your story. Add roles, wins, industries, tools, strengths, and the kind of role you want next.
                    </p>
                  </div>
                  <span className="executive-step-chip rounded-full border px-3 py-1 text-sm">
                    {getStageLabel()}
                  </span>
                </div>
                <div className="mt-6 grid gap-4 lg:grid-cols-[1.45fr_0.75fr]">
                  <div className="space-y-4">
                    <textarea
                      className="executive-textarea min-h-[360px] w-full text-lg"
                      value={brainDump}
                      onChange={(event) => setBrainDump(event.target.value)}
                    />
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="executive-primary-button" disabled={loading} onClick={extractFacts}>
                        {loading ? "Working..." : "Analyze My Background"}
                      </button>
                      <button type="button" className="executive-secondary-button" onClick={beginFileSelection}>
                        {uploadingFile ? "Uploading..." : "Upload Resume Or Notes"}
                      </button>
                      <button
                        type="button"
                        className="executive-secondary-button"
                        disabled={!speechSupported}
                        onClick={isListening ? stopVoiceCapture : startVoiceCapture}
                      >
                        {isListening ? "Stop Voice Input" : "Start Voice Input"}
                      </button>
                      <button
                        type="button"
                        className="executive-secondary-button"
                        disabled={loading}
                        onClick={() => void createFreshSession()}
                      >
                        Start New Session
                      </button>
                    </div>
                    {error ? <p className="text-sm text-coral">{error}</p> : null}
                    {lastVoiceTranscript ? (
                      <div className="executive-status-note px-4 py-4 text-sm leading-7">
                        <p className="executive-kicker">Latest Transcript</p>
                        <p className="mt-2">{lastVoiceTranscript}</p>
                      </div>
                    ) : null}
                  </div>
                  <div className="space-y-4">
                    <div className="rounded-[1.5rem] border border-[var(--executive-line)] bg-[var(--executive-soft)] p-5">
                      <p className="executive-kicker">Best Results</p>
                      <div className="mt-3 space-y-2 text-sm leading-7 text-[var(--executive-mute)]">
                        <p>Include titles, scope, achievements, tools, and the roles you want next.</p>
                        <p>Write naturally. The app organizes and sharpens the story later.</p>
                        <p>Upload an existing resume if you want a faster starting point.</p>
                      </div>
                    </div>
                    <div className="rounded-[1.5rem] border border-[var(--executive-line)] bg-white p-5">
                      <p className="executive-kicker">Quick Actions</p>
                      <button type="button" className="executive-secondary-button mt-3 w-full" onClick={() => setShowWelcome(true)}>
                        Reopen Welcome Guide
                      </button>
                      <p className="mt-3 text-sm leading-7 text-[var(--executive-mute)]">
                        {speechSupported ? voiceStatus || "Voice dictation is available in this browser." : "Voice dictation is not supported in this browser."}
                      </p>
                    </div>
                  </div>
                </div>
              </section>
            ) : null}

            {activeStep === "facts" ? (
              <section className="executive-panel executive-panel-stage executive-panel-facts p-6 md:p-8">
                <p className="executive-kicker">Step 2</p>
                <h2 className="mt-2 text-3xl">Fact Extraction Review</h2>
                <p className="mt-3 max-w-3xl text-base leading-8 text-[var(--executive-mute)]">
                  Clean up the extracted facts before moving on. This step makes every later result stronger.
                </p>
                {session?.facts.length ? (
                  <>
                    <div className="mt-6 flex flex-wrap gap-3">
                      <button type="button" className="executive-secondary-button" onClick={() => setActiveStep("input")}>
                        Back To Input
                      </button>
                      <button
                        type="button"
                        className="executive-primary-button"
                        disabled={loading || !hasUnsavedFactChanges}
                        onClick={saveFactEdits}
                      >
                        Save Fact Changes
                      </button>
                      <button type="button" className="executive-secondary-button" disabled={loading} onClick={refreshQuestionsFromFacts}>
                        Continue To Questions
                      </button>
                    </div>
                    {hasUnsavedFactChanges ? (
                      <p className="executive-warning-note mt-4 px-4 py-3 text-sm leading-6">
                        Save or refresh your edits before moving forward.
                      </p>
                    ) : null}
                    <div className="mt-6 grid gap-3">
                      {editableFacts.map((fact, index) => (
                        <div key={`${index}-${fact.label}`} className="rounded-[1.35rem] border border-[var(--executive-line)] bg-white px-4 py-4">
                          <div className="grid gap-3 md:grid-cols-[0.35fr_1fr_auto]">
                            <input
                              className="executive-input"
                              value={fact.label}
                              onChange={(event) => updateFact(index, "label", event.target.value)}
                              placeholder="Label"
                            />
                            <textarea
                              className="executive-textarea min-h-24"
                              value={fact.value}
                              onChange={(event) => updateFact(index, "value", event.target.value)}
                              placeholder="Fact value"
                            />
                            <button type="button" className="executive-ghost-button" onClick={() => removeFact(index)}>
                              Remove
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                    <button type="button" className="executive-secondary-button mt-4" onClick={addFact}>
                      Add Fact
                    </button>
                  </>
                ) : (
                  <div className="mt-6 rounded-[1.5rem] border border-[var(--executive-line)] bg-[var(--executive-soft)] p-5 text-base leading-8 text-[var(--executive-mute)]">
                    Extract facts from the input step first, and this screen will become editable.
                  </div>
                )}
              </section>
            ) : null}

            {activeStep === "questions" ? (
              <section className="executive-panel executive-panel-stage executive-panel-questions p-6 md:p-8">
                <p className="executive-kicker">Step 3</p>
                <h2 className="mt-2 text-3xl">Follow-Up Questions</h2>
                <p className="mt-3 max-w-3xl text-base leading-8 text-[var(--executive-mute)]">
                  Answer these to add specificity, impact, and role alignment before the first draft is generated.
                </p>
                {session?.questions.length ? (
                  <form className="mt-6 space-y-4" onSubmit={buildResume}>
                    {session.questions.map((question) => (
                      <label
                        key={question.id}
                        className="block rounded-[1.35rem] border border-[var(--executive-line)] bg-[var(--executive-soft)] p-4"
                      >
                        <span className="block leading-7 text-pine">{question.prompt}</span>
                        <textarea
                          className="executive-textarea mt-3 min-h-28 w-full"
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
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="executive-secondary-button" onClick={() => setActiveStep("facts")}>
                        Back To Facts
                      </button>
                      <button
                        type="submit"
                        className="executive-primary-button"
                        disabled={loading || hasUnsavedFactChanges}
                      >
                        {hasUnsavedFactChanges ? "Save Facts Or Refresh Questions First" : "Build Resume Draft"}
                      </button>
                    </div>
                  </form>
                ) : (
                  <div className="mt-6 rounded-[1.5rem] border border-[var(--executive-line)] bg-[var(--executive-soft)] p-5 text-base leading-8 text-[var(--executive-mute)]">
                    Refresh the workflow from the fact review step to generate questions here.
                  </div>
                )}
              </section>
            ) : null}

            {activeStep === "draft" ? (
              <section className="space-y-6">
                <section className="executive-panel executive-panel-stage executive-panel-draft p-6 md:p-8">
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <p className="executive-kicker">Step 4</p>
                      <h2 className="mt-2 text-3xl">Draft And Improve</h2>
                      <p className="mt-3 max-w-3xl text-base leading-8 text-[var(--executive-mute)]">
                        Review the generated draft, inspect the transcript, and ask for final improvements.
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-3">
                      <button type="button" className="executive-secondary-button" onClick={() => setActiveStep("questions")}>
                        Back To Questions
                      </button>
                      <button
                        type="button"
                        className="executive-secondary-button"
                        disabled={!session?.transcript}
                        onClick={() => downloadTextFile("session-transcript.md", session?.transcript ?? "")}
                      >
                        Download Transcript
                      </button>
                      <button
                        type="button"
                        className="executive-primary-button"
                        disabled={loading || !session?.resume_draft || hasUnsavedFactChanges}
                        onClick={reviewResume}
                      >
                        Review Draft
                      </button>
                    </div>
                  </div>
                  <div className="mt-6 grid gap-6 xl:grid-cols-[1.1fr_0.9fr]">
                    <div>
                      <p className="executive-kicker">Resume Preview</p>
                      <pre className="executive-code-block mt-3 min-h-[420px]">
                        {resumeMarkdown || "Your resume draft will appear here after you answer the follow-up questions."}
                      </pre>
                    </div>
                    <div className="space-y-4">
                      <div className="rounded-[1.5rem] border border-[var(--executive-line)] bg-[var(--executive-soft)] p-4">
                        <p className="executive-kicker">Transcript</p>
                        {session?.transcript ? (
                          <pre className="executive-code-block mt-3 max-h-[260px] overflow-auto">
                            {session.transcript}
                          </pre>
                        ) : (
                          <p className="mt-3 text-sm leading-7 text-[var(--executive-mute)]">
                            The transcript appears after the first draft is generated.
                          </p>
                        )}
                      </div>
                      {session?.review_result ? (
                        <div className="rounded-[1.5rem] border border-[var(--executive-line)] bg-white p-4">
                          <p className="executive-kicker">AI Suggestions</p>
                          <div className="mt-3 space-y-2">
                            {session.review_result.notes.map((note) => (
                              <p
                                key={note}
                                className="rounded-2xl border border-[var(--executive-line)] bg-[var(--executive-soft)] px-4 py-3 text-sm leading-7"
                              >
                                {note}
                              </p>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  </div>
                </section>

                {session?.review_result ? (
                  <section className="executive-panel executive-panel-stage executive-panel-final p-6 md:p-8">
                    <p className="executive-kicker">Final Pass</p>
                    <h3 className="mt-2 text-2xl">Apply Final Changes</h3>
                    <div className="mt-6 grid gap-6 xl:grid-cols-[1fr_1fr]">
                      <pre className="executive-code-block">{session.review_result.markdown}</pre>
                      <form className="space-y-3" onSubmit={finalizeResume}>
                        <label className="block">
                          <span className="block text-lg text-pine">Ask for any final changes</span>
                          <textarea
                            className="executive-textarea mt-3 min-h-40 w-full"
                            value={changeRequest}
                            onChange={(event) => setChangeRequest(event.target.value)}
                            placeholder="Example: make the summary more confident and emphasize customer operations."
                          />
                        </label>
                        <div className="flex flex-wrap gap-3">
                          <button type="submit" className="executive-primary-button" disabled={loading || hasUnsavedFactChanges}>
                            Prepare Final Resume
                          </button>
                          <button
                            type="button"
                            className="executive-secondary-button"
                            disabled={!canExportResume}
                            onClick={() => setActiveStep("export")}
                          >
                            Go To Export
                          </button>
                        </div>
                      </form>
                    </div>
                  </section>
                ) : null}
              </section>
            ) : null}

            {activeStep === "export" ? (
              <section className="executive-panel executive-panel-stage executive-panel-export p-6 md:p-8">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="executive-kicker">Step 5</p>
                    <h2 className="mt-2 text-3xl">Export</h2>
                    <p className="mt-3 max-w-3xl text-base leading-8 text-[var(--executive-mute)]">
                      Choose a template, review the final resume, and download it in the format you need.
                    </p>
                  </div>
                  <button type="button" className="executive-secondary-button" onClick={() => setActiveStep("draft")}>
                    Back To Draft
                  </button>
                </div>
                <div className="mt-6 flex flex-wrap items-center gap-3">
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
                  <button type="button" className="executive-secondary-button" disabled={!canExportResume} onClick={() => void downloadJsonExport()}>
                    Export JSON
                  </button>
                  <button type="button" className="executive-secondary-button" disabled={!canExportResume} onClick={() => downloadTextFile("resume-output.md", resumeMarkdown)}>
                    Download Markdown
                  </button>
                  <button type="button" className="executive-secondary-button" disabled={!canExportResume || loading} onClick={() => void downloadResumeFile("docx")}>
                    Export DOCX
                  </button>
                  <button type="button" className="executive-primary-button" disabled={!canExportResume || loading} onClick={() => void downloadResumeFile("pdf")}>
                    Export PDF
                  </button>
                </div>
                {hasUnsavedFactChanges ? (
                  <p className="executive-warning-note mt-4 px-4 py-3 text-sm leading-6">
                    Save or refresh your fact edits before building, reviewing, or exporting to keep the resume in sync.
                  </p>
                ) : null}
                <div className="mt-6 grid gap-6 xl:grid-cols-[0.95fr_1.05fr]">
                  <div className="rounded-[1.5rem] border border-[var(--executive-line)] bg-[var(--executive-soft)] p-5">
                    <p className="executive-kicker">Final Checklist</p>
                    <div className="mt-3 space-y-2 text-sm leading-7 text-[var(--executive-mute)]">
                      <p>The preview reflects the current saved facts and latest draft state.</p>
                      <p>Choose the template that best matches the role and application style.</p>
                      <p>Export PDF for submission and DOCX if you want to edit outside the app.</p>
                    </div>
                  </div>
                  <pre className="executive-code-block min-h-[420px]">
                    {resumeMarkdown || "Your final resume will appear here after the drafting step is complete."}
                  </pre>
                </div>
              </section>
            ) : null}
          </div>
        </section>

        <div className="pointer-events-none fixed bottom-4 right-4 rounded-full bg-white/80 px-4 py-2 text-sm tracking-[0.18em] text-ink/70 shadow-[0_10px_30px_rgba(22,33,48,0.08)] backdrop-blur">
          Developed by Ravi Kafley
        </div>
      </main>
      )}
    </>
  );
}
