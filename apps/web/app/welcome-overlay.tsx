"use client";

import { BrandLogo } from "./brand-logo";

type WelcomeOverlayProps = {
  open: boolean;
  brainDump: string;
  uploadedFileName: string;
  lastVoiceTranscript: string;
  loading: boolean;
  onBrainDumpChange: (value: string) => void;
  onVoiceTranscriptChange: (value: string) => void;
  onResetEverything: () => void;
  onProcessBuildResume: () => void;
  onClearBrainDump: () => void;
  onClearVoiceTranscript: () => void;
  onUploadClick: () => void;
  onVoiceStart: () => void;
  onVoiceStop: () => void;
  speechSupported: boolean;
  isListening: boolean;
  voiceStatus: string;
  uploadingFile: boolean;
  onClose: () => void;
};

export function WelcomeOverlay({
  open,
  brainDump,
  uploadedFileName,
  lastVoiceTranscript,
  loading,
  onBrainDumpChange,
  onVoiceTranscriptChange,
  onResetEverything,
  onProcessBuildResume,
  onClearBrainDump,
  onClearVoiceTranscript,
  onUploadClick,
  onVoiceStart,
  onVoiceStop,
  speechSupported,
  isListening,
  voiceStatus,
  uploadingFile,
  onClose,
}: WelcomeOverlayProps) {
  if (!open) {
    return null;
  }

  const transcriptPanelHeight = isListening ? "48%" : "44%";
  const typePanelHeight = isListening ? "34%" : "40%";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(9,19,32,0.58)] px-4 py-4 backdrop-blur-md">
      <div className="welcome-panel relative flex h-[calc(100vh-1rem)] w-full max-w-[1280px] flex-col overflow-hidden rounded-[2rem] border border-white/45 bg-[linear-gradient(145deg,rgba(248,250,252,0.98),rgba(237,243,247,0.96))] shadow-[0_40px_120px_rgba(9,19,32,0.24)]">
        <div className="welcome-noise pointer-events-none absolute inset-0 opacity-60" />
        <div className="welcome-ambient welcome-ambient-a pointer-events-none absolute" />
        <div className="welcome-ambient welcome-ambient-b pointer-events-none absolute" />

        <div className="welcome-modal-scroll relative h-full p-3">
          <div className="grid h-full gap-3 xl:grid-cols-[34%_66%]">
            <section className="welcome-dashboard-panel flex h-full min-h-0 flex-col p-5">
              <div className="welcome-brand-header">
                <div className="welcome-brand-logo relative z-[2] shrink-0">
                  <BrandLogo compact />
                </div>
                <div className="welcome-brand-copy">
                  <p className="welcome-brand-eyebrow">Welcome</p>
                  <h1 className="welcome-brand-title">Your Resume Upgrade Workspace</h1>
                </div>
              </div>

              <div className="mt-4">
                <p className="text-[0.72rem] uppercase tracking-[0.22em] text-[var(--executive-mute)]">Professional Resume Builder</p>
                <p className="mt-2 text-[0.94rem] leading-6 text-ink/78">
                  Start by recording, typing, or uploading existing notes. We will extract facts, ask follow-up questions, and build the draft with you.
                </p>
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <button
                  type="button"
                  className="welcome-action-tile"
                  disabled={!speechSupported}
                  onClick={() => {
                    if (isListening) {
                      onVoiceStop();
                      return;
                    }
                    onVoiceStart();
                  }}
                >
                  <span className="block text-[0.72rem] uppercase tracking-[0.18em] text-pine/60">
                    Record
                  </span>
                  <span className="mt-1 block text-[1.1rem] leading-none text-ink md:text-[1.2rem]">
                    {isListening ? "Stop Recording" : "Start Recording"}
                  </span>
                </button>

                <button
                  type="button"
                  className="welcome-action-tile"
                  onClick={onResetEverything}
                >
                  <span className="block text-[0.72rem] uppercase tracking-[0.18em] text-pine/60">
                    Reset
                  </span>
                  <span className="mt-1 block text-[1.1rem] leading-none text-ink md:text-[1.2rem]">Reset Everything</span>
                </button>
              </div>

              <div className="welcome-upload-card mt-6">
                <div className="mb-2 flex items-center justify-between gap-3">
                  <p className="text-xs uppercase tracking-[0.18em] text-pine/65">Upload File</p>
                  <span className="welcome-badge">
                    Resume Or Notes
                  </span>
                </div>
                <p className="text-[0.88rem] leading-5 text-[var(--executive-mute)]">
                  Bring in an existing resume or notes, then continue with typing or voice if needed.
                </p>
                <button
                  type="button"
                  className="executive-secondary-button mt-4 self-start"
                  onClick={onUploadClick}
                >
                  {uploadingFile ? "Uploading..." : "Choose File"}
                </button>
                {uploadedFileName ? (
                  <p className="mt-3 rounded-2xl border border-[rgba(17,24,39,0.08)] bg-white/80 px-4 py-3 text-sm leading-6 text-[var(--executive-mute)]">
                    Uploaded file: <span className="font-medium text-ink">{uploadedFileName}</span>
                  </p>
                ) : null}
              </div>

              <p className="mt-auto pt-6 text-xs uppercase tracking-[0.18em] text-[var(--executive-mute)]">
                Developed by Ravi Kafley
              </p>
            </section>

            <section className="welcome-dashboard-panel flex h-full min-h-0 flex-col overflow-hidden p-4">
              <div className="flex h-full min-h-0 flex-col">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-[0.72rem] uppercase tracking-[0.22em] text-pine/70">Start Here</p>
                    <h2 className="welcome-display text-[1.35rem] leading-[0.96] text-ink md:text-[1.75rem]">
                      Choose how you want to begin.
                    </h2>
                  </div>
                  <button
                    type="button"
                    className="executive-primary-button shrink-0 px-5 py-3 text-[0.82rem]"
                    disabled={loading}
                    onClick={onProcessBuildResume}
                  >
                    {loading ? "Processing..." : "Process And Build Resume"}
                  </button>
                </div>
                <div className="welcome-status-card mt-2.5">
                  {isListening
                    ? voiceStatus || "Recording..."
                    : speechSupported
                      ? "Press Start Recording to begin speaking."
                      : "Microphone recording is not supported in this browser."}
                </div>

                <div className="mt-2.5 flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">
                  <div
                    className="welcome-input-shell order-1 min-h-[11rem] transition-all duration-300 xl:min-h-0"
                    style={{ flexBasis: transcriptPanelHeight, flexGrow: 0, flexShrink: 0 }}
                  >
                    <div className="welcome-input-toolbar">
                      <p className="welcome-section-label text-[0.82rem] uppercase tracking-[0.2em]">
                        Voice Transcript
                      </p>
                      <button
                        type="button"
                        className="welcome-mini-button"
                        onClick={onClearVoiceTranscript}
                      >
                        Redo
                      </button>
                      <span className="welcome-badge justify-self-end">Live Voice Box</span>
                    </div>
                    <textarea
                      rows={5}
                      className="welcome-editor h-[calc(100%-2.5rem)] min-h-[5rem] w-full"
                      value={lastVoiceTranscript}
                      onChange={(event) => onVoiceTranscriptChange(event.target.value)}
                      placeholder="When you start recording, your transcript will appear here."
                    />
                  </div>

                  <div
                    className="welcome-input-shell order-2 min-h-[11rem] transition-all duration-300 xl:min-h-0"
                    style={{ flexBasis: typePanelHeight, flexGrow: 0, flexShrink: 0 }}
                  >
                    <div className="welcome-input-toolbar">
                      <p className="welcome-section-label text-[0.82rem] uppercase tracking-[0.2em]">
                        Type Or Paste
                      </p>
                      <button
                        type="button"
                        className="welcome-mini-button"
                        onClick={onClearBrainDump}
                      >
                        Redo
                      </button>
                      <span className="welcome-badge justify-self-end">Manual Entry</span>
                    </div>
                    <textarea
                      rows={5}
                      className="welcome-editor h-[calc(100%-2.5rem)] min-h-[5rem] w-full"
                      value={brainDump}
                      onChange={(event) => onBrainDumpChange(event.target.value)}
                      placeholder="Type or paste your experience, roles, accomplishments, strengths, tools, and goals here."
                    />
                  </div>

                  <div className="welcome-status-card order-3">
                    Information shared during this process is used only to prepare your resume. It is not stored for any other purpose and is cleared when you close your browser session.
                  </div>
                </div>
              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
