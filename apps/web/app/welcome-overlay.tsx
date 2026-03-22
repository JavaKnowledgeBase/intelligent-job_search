"use client";

import { useEffect, useState } from "react";

type WelcomeOverlayProps = {
  open: boolean;
  brainDump: string;
  onBrainDumpChange: (value: string) => void;
  onUseTypedIntro: () => void;
  onUploadClick: () => void;
  onVoiceStart: () => void;
  onVoiceStop: () => void;
  speechSupported: boolean;
  isListening: boolean;
  voiceStatus: string;
  uploadingFile: boolean;
  onClose: () => void;
};

const animatedLines = [
  "Private session",
  "Type your story",
  "Upload a resume",
  "Speak with microphone",
  "AI-guided follow-up",
  "Review and export",
];

export function WelcomeOverlay({
  open,
  brainDump,
  onBrainDumpChange,
  onUseTypedIntro,
  onUploadClick,
  onVoiceStart,
  onVoiceStop,
  speechSupported,
  isListening,
  voiceStatus,
  uploadingFile,
  onClose,
}: WelcomeOverlayProps) {
  const [voiceEnabled, setVoiceEnabled] = useState(false);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const welcomeMessage =
    "Welcome to Resume Co-Pilot. Start by typing, uploading, or speaking your career story. We guide you step by step, and we do not save your content as a permanent profile.";

  useEffect(() => {
    if (!open || !voiceEnabled || typeof window === "undefined" || !("speechSynthesis" in window)) {
      return;
    }

    const utterance = new SpeechSynthesisUtterance(welcomeMessage);
    utterance.rate = 1;
    utterance.pitch = 1;
    utterance.volume = 0.9;
    utterance.onend = () => setIsSpeaking(false);

    window.speechSynthesis.cancel();
    setIsSpeaking(true);
    window.speechSynthesis.speak(utterance);

    return () => {
      window.speechSynthesis.cancel();
      setIsSpeaking(false);
    };
  }, [open, voiceEnabled, welcomeMessage]);

  if (!open) {
    return null;
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/45 px-4 py-4 backdrop-blur-sm">
      <div className="welcome-panel relative flex max-h-[92vh] w-full max-w-6xl flex-col overflow-hidden rounded-[2rem] border border-white/70 bg-[linear-gradient(180deg,rgba(255,255,255,0.98),rgba(244,248,249,0.96))] shadow-[0_40px_120px_rgba(22,33,48,0.22)]">
        <div className="welcome-noise pointer-events-none absolute inset-0 opacity-60" />
        <div className="welcome-marquee pointer-events-none absolute inset-x-0 top-0 overflow-hidden border-b border-ink/5 bg-white/55 py-3">
          <div className="welcome-track">
            {animatedLines.concat(animatedLines).map((line, index) => (
              <span key={`${line}-${index}`} className="welcome-chip">
                {line}
              </span>
            ))}
          </div>
        </div>

        <div className="relative overflow-y-auto px-5 pb-5 pt-16 md:px-8 md:pb-8 md:pt-20">
          <div className="grid gap-6 lg:grid-cols-[0.9fr_1.1fr]">
            <section className="space-y-5">
              <div className="rounded-[1.75rem] border border-ink/10 bg-white/88 p-6 shadow-[0_12px_30px_rgba(22,33,48,0.06)]">
                <p className="text-sm uppercase tracking-[0.28em] text-coral">Welcome</p>
                <h1 className="mt-3 text-3xl leading-tight text-ink md:text-4xl">
                  Resume Co-Pilot
                </h1>
                <p className="mt-3 text-base leading-8 text-ink/75">
                  Start with the method that feels easiest for you. We will turn your rough career
                  story into a structured resume draft and guide the rest of the process.
                </p>
              </div>

              <div className="rounded-[1.75rem] border border-ink/10 bg-white/88 p-6 shadow-[0_12px_30px_rgba(22,33,48,0.06)]">
                <div className="flex items-start justify-between gap-4">
                  <div>
                    <p className="text-sm uppercase tracking-[0.2em] text-pine/70">Voice Guide</p>
                    <p className="mt-2 text-sm leading-7 text-ink/75">
                      Play the welcome narration, mute it, or start microphone dictation.
                    </p>
                  </div>
                  <div className="flex h-16 w-16 items-center justify-center rounded-full bg-[radial-gradient(circle_at_30%_30%,#5b66df,#4650c7)] text-white shadow-[0_12px_28px_rgba(70,80,199,0.24)]">
                    <span className="text-sm uppercase tracking-[0.2em]">Audio</span>
                  </div>
                </div>

                <div className="mt-5 grid gap-3 sm:grid-cols-3">
                  <button
                    type="button"
                    className="rounded-2xl border border-ink/10 bg-slate-50 px-4 py-4 text-left transition hover:border-coral hover:bg-white"
                    onClick={() => {
                      if (!("speechSynthesis" in window)) {
                        return;
                      }

                      if (isSpeaking) {
                        window.speechSynthesis.cancel();
                        setIsSpeaking(false);
                        setVoiceEnabled(false);
                        return;
                      }

                      setVoiceEnabled(false);
                      setTimeout(() => setVoiceEnabled(true), 0);
                    }}
                  >
                    <span className="block text-sm uppercase tracking-[0.18em] text-pine/60">Voice</span>
                    <span className="mt-2 block text-lg text-ink">
                      {isSpeaking ? "Stop Welcome" : "Play Welcome"}
                    </span>
                  </button>

                  <button
                    type="button"
                    className="rounded-2xl border border-ink/10 bg-slate-50 px-4 py-4 text-left transition hover:border-coral hover:bg-white"
                    onClick={() => {
                      if (!("speechSynthesis" in window)) {
                        return;
                      }
                      window.speechSynthesis.cancel();
                      setIsSpeaking(false);
                      setVoiceEnabled(false);
                    }}
                  >
                    <span className="block text-sm uppercase tracking-[0.18em] text-pine/60">Audio</span>
                    <span className="mt-2 block text-lg text-ink">Mute</span>
                  </button>

                  <button
                    type="button"
                    className="rounded-2xl border border-ink/10 bg-slate-50 px-4 py-4 text-left transition hover:border-coral hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                    disabled={!speechSupported}
                    onClick={isListening ? onVoiceStop : onVoiceStart}
                  >
                    <span className="block text-sm uppercase tracking-[0.18em] text-pine/60">Microphone</span>
                    <span className="mt-2 block text-lg text-ink">
                      {isListening ? "Stop Dictation" : "Start Dictation"}
                    </span>
                  </button>
                </div>

                <div className="mt-4 rounded-[1.1rem] bg-[#eef2ff] px-4 py-3 text-sm leading-6 text-[#4650c7]">
                  {isListening
                    ? voiceStatus || "Listening..."
                    : speechSupported
                      ? "Microphone is ready when you want to dictate."
                      : "Microphone capture is not supported in this browser."}
                </div>
              </div>

              <div className="rounded-[1.75rem] border border-ink/10 bg-white/88 p-6 shadow-[0_12px_30px_rgba(22,33,48,0.06)]">
                <p className="text-sm uppercase tracking-[0.2em] text-pine/70">Privacy Promise</p>
                <p className="mt-3 leading-7 text-ink/80">
                  We do not save your content as a permanent profile. This experience is designed as a
                  temporary working session, and the session expires automatically.
                </p>
              </div>
            </section>

            <section className="space-y-5 rounded-[1.9rem] border border-[#f1be1a]/55 bg-[linear-gradient(180deg,rgba(255,255,255,0.94),rgba(249,244,234,0.9))] p-5 shadow-[0_18px_40px_rgba(241,190,26,0.08)] md:p-6">
              <div className="space-y-3">
                <p className="text-sm uppercase tracking-[0.2em] text-pine/70">Start Here</p>
                <h2 className="text-2xl leading-tight text-ink md:text-3xl">
                  Type your story first, or bring it in another way.
                </h2>
                <p className="text-base leading-8 text-ink/75">
                  Use the text area below, upload a file, or dictate your experience. When this looks
                  right, continue into the main workflow.
                </p>
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-2xl border border-ink/10 bg-white/82 px-4 py-4">
                  <span className="block text-sm uppercase tracking-[0.18em] text-pine/60">Type</span>
                  <span className="mt-2 block text-lg text-ink">Write directly</span>
                </div>
                <button
                  type="button"
                  className="rounded-2xl border border-ink/10 bg-white/82 px-4 py-4 text-left transition hover:border-coral hover:bg-white"
                  onClick={onUploadClick}
                >
                  <span className="block text-sm uppercase tracking-[0.18em] text-pine/60">Upload</span>
                  <span className="mt-2 block text-lg text-ink">
                    {uploadingFile ? "Uploading..." : "Bring a file"}
                  </span>
                </button>
                <button
                  type="button"
                  className="rounded-2xl border border-ink/10 bg-white/82 px-4 py-4 text-left transition hover:border-coral hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={!speechSupported}
                  onClick={isListening ? onVoiceStop : onVoiceStart}
                >
                  <span className="block text-sm uppercase tracking-[0.18em] text-pine/60">Speak</span>
                  <span className="mt-2 block text-lg text-ink">
                    {isListening ? "Listening now" : "Dictate instead"}
                  </span>
                </button>
              </div>

              <div className="rounded-[1.5rem] border border-ink/10 bg-white/92 p-4">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <p className="text-sm uppercase tracking-[0.2em] text-[#4650c7]">Career Story</p>
                  <span className="rounded-full bg-sand px-3 py-1 text-xs uppercase tracking-[0.18em] text-pine/70">
                    Temporary Draft
                  </span>
                </div>
                <textarea
                  className="min-h-[260px] w-full rounded-[1.25rem] border border-ink/10 bg-sand/75 p-5 text-lg leading-8 text-ink outline-none transition focus:border-coral"
                  value={brainDump}
                  onChange={(event) => onBrainDumpChange(event.target.value)}
                  placeholder="Share your roles, accomplishments, strengths, tools, industries, and the type of work you want next."
                />
              </div>

              <div className="rounded-[1.35rem] border border-ink/10 bg-white/72 p-5">
                <p className="text-sm uppercase tracking-[0.2em] text-pine/70">What Happens Next</p>
                <div className="mt-3 space-y-2 text-sm leading-7 text-ink/80">
                  <p>1. We extract the most useful facts from your story.</p>
                  <p>2. We ask targeted follow-up questions to strengthen the resume.</p>
                  <p>3. We build, review, and export your final draft.</p>
                </div>
              </div>

              <div className="flex flex-wrap gap-3">
                <button
                  type="button"
                  className="rounded-full bg-ink px-6 py-4 text-white transition hover:opacity-90"
                  onClick={() => {
                    onUseTypedIntro();
                    onClose();
                  }}
                >
                  Continue With This Text
                </button>
                <button
                  type="button"
                  className="rounded-full border border-ink/15 bg-white px-6 py-4 text-ink transition hover:border-coral"
                  onClick={onClose}
                >
                  Close Welcome
                </button>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
