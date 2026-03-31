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
  onClearUpload: () => void;
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
  onClearUpload,
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-[rgba(9,19,32,0.62)] px-4 py-4 backdrop-blur-md">
      <div className="welcome-panel relative flex h-[calc(100vh-1rem)] w-full max-w-[1300px] flex-col overflow-hidden rounded-[2rem] border border-white/40 bg-[linear-gradient(145deg,rgba(248,250,252,0.99),rgba(237,243,247,0.97))] shadow-[0_48px_130px_rgba(9,19,32,0.28)]">
        <div className="welcome-noise pointer-events-none absolute inset-0 opacity-60" />
        <div className="welcome-ambient welcome-ambient-a pointer-events-none absolute" />
        <div className="welcome-ambient welcome-ambient-b pointer-events-none absolute" />

        <div className="welcome-modal-scroll relative h-full p-3">
          <div className="grid h-full gap-3 xl:grid-cols-[32%_68%]">

            {/* ── Left panel ── */}
            <section className="welcome-dashboard-panel flex h-full min-h-0 flex-col p-5">
              <div className="welcome-brand-header">
                <div className="welcome-brand-logo relative z-[2] shrink-0">
                  <BrandLogo compact />
                </div>
                <div className="welcome-brand-copy">
                  <p className="welcome-brand-eyebrow">Resume Builder</p>
                  <h1 className="welcome-brand-title">AI Resume Upgrade Workspace</h1>
                </div>
              </div>

              {/* Privacy badge */}
              <div className="mt-4 flex flex-wrap gap-2">
                <span className="privacy-shield">
                  <span className="privacy-shield-dot" />
                  Zero data retention
                </span>
                <span className="privacy-shield">
                  <span className="privacy-shield-dot" />
                  Session auto-clears
                </span>
              </div>

              <p className="mt-4 text-[0.88rem] leading-6 text-ink/72">
                Share your career story in any format. We extract the facts, ask follow-up questions, and two independent AI specialists each produce a full resume — ready to download.
              </p>

              {/* Input method tiles */}
              <div className="mt-5 grid gap-2.5 md:grid-cols-2">
                <button
                  type="button"
                  className="welcome-action-tile group"
                  disabled={!speechSupported}
                  onClick={() => {
                    if (isListening) { onVoiceStop(); return; }
                    onVoiceStart();
                  }}
                >
                  <span className="block text-xl">{isListening ? "⏹" : "🎙"}</span>
                  <span className="mt-1 block text-[0.7rem] uppercase tracking-[0.18em] text-pine/60">
                    {speechSupported ? "Live Voice" : "Unavailable"}
                  </span>
                  <span className="mt-0.5 block text-[1rem] font-semibold leading-tight text-ink">
                    {isListening ? "Stop Recording" : "Record Career Story"}
                  </span>
                </button>

                <button
                  type="button"
                  className="welcome-action-tile"
                  onClick={onUploadClick}
                >
                  <span className="block text-xl">{uploadingFile ? "⏳" : uploadedFileName ? "✅" : "📄"}</span>
                  <span className="mt-1 block text-[0.7rem] uppercase tracking-[0.18em] text-pine/60">Upload File</span>
                  <span className="mt-0.5 block text-[1rem] font-semibold leading-tight text-ink">
                    {uploadingFile ? "Uploading..." : uploadedFileName ? uploadedFileName : "Resume, CV or Notes"}
                  </span>
                  {uploadedFileName && !uploadingFile ? (
                    <span
                      role="button"
                      tabIndex={0}
                      className="mt-1.5 block text-[0.72rem] text-red-400 hover:text-red-600"
                      onClick={(e) => { e.stopPropagation(); onClearUpload(); }}
                      onKeyDown={(e) => { if (e.key === "Enter") { e.stopPropagation(); onClearUpload(); } }}
                    >
                      ✕ Remove file
                    </span>
                  ) : null}
                </button>
              </div>

              {/* What to include */}
              <div className="mt-4 rounded-[1.15rem] border border-[rgba(24,36,53,0.08)] bg-[rgba(248,251,253,0.88)] px-4 pt-3.5 pb-4">
                <p className="text-[0.7rem] font-semibold uppercase tracking-[0.2em] text-[#1c6b84]">What to include</p>
                <ul className="mt-2 space-y-[0.35rem] text-[0.82rem] leading-[1.45] text-[var(--executive-mute)]">
                  <li>• Job titles, employers, and dates you remember</li>
                  <li>• Tools, software, equipment, or methods you use</li>
                  <li>• Achievements, projects, or results you are proud of</li>
                  <li>• The type of role you are applying for next</li>
                  <li>• Certifications, education, or training</li>
                </ul>
              </div>

              <div className="mt-4 rounded-[1rem] border border-[rgba(28,107,132,0.14)] bg-[rgba(236,244,247,0.92)] px-4 py-3 text-[0.8rem] leading-5 text-[#25576d]">
                Works for every profession — engineering, nursing, teaching, trades, law, hospitality, finance, and more. No profession is too niche.
              </div>

              <div className="mt-4 flex items-center justify-between gap-3">
                <button
                  type="button"
                  className="executive-ghost-button px-4 py-2 text-sm"
                  onClick={onResetEverything}
                >
                  Reset Everything
                </button>
                <p className="text-xs text-[var(--executive-mute)]">Developed by Ravi Kafley</p>
              </div>
            </section>

            {/* ── Right panel ── */}
            <section className="welcome-dashboard-panel flex h-full min-h-0 flex-col overflow-hidden p-4">
              <div className="flex shrink-0 items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-[0.82rem] leading-5 text-emerald-700 font-medium">✓ You have added career material. Click &ldquo;Build My Resume&rdquo; when you are ready.</p>
                  <h2 className="welcome-display mt-1 text-[1.35rem] leading-[0.96] text-ink md:text-[1.65rem]">
                    Add your career material below.
                  </h2>
                  <p className="mt-1 text-[0.84rem] leading-5 text-[var(--executive-mute)]">
                    Type, paste, or speak — use whichever is easiest. More detail produces a richer resume.
                  </p>
                </div>
                <button
                  type="button"
                  className="executive-primary-button shrink-0 px-5 py-3 text-[0.82rem]"
                  disabled={loading}
                  onClick={onProcessBuildResume}
                >
                  {loading ? "Processing..." : "Build My Resume →"}
                </button>
              </div>

              {/* Voice status */}
              {(isListening || voiceStatus) ? (
                <div className="welcome-status-card mt-3 shrink-0">
                  {isListening ? (
                    <span className="flex items-center gap-2">
                      <span className="inline-block h-2 w-2 animate-pulse rounded-full bg-red-400" />
                      {voiceStatus || "Recording — speak naturally about your career..."}
                    </span>
                  ) : voiceStatus}
                </div>
              ) : null}

              <div className="mt-3 flex min-h-0 flex-1 flex-col gap-2.5 overflow-hidden">

                {/* Voice transcript */}
                <div
                  className="welcome-input-shell min-h-[9rem] xl:min-h-0"
                  style={{ flex: "1 1 0" }}
                >
                  <div className="welcome-input-toolbar">
                    <p className="welcome-section-label text-[0.78rem] uppercase tracking-[0.2em]">
                      Voice Transcript
                    </p>
                    <button type="button" className="welcome-mini-button" onClick={onClearVoiceTranscript}>
                      Clear
                    </button>
                    <span className="welcome-badge justify-self-end">Live Voice</span>
                  </div>
                  <textarea
                    rows={5}
                    className="welcome-editor h-[calc(100%-2.5rem)] min-h-[5rem] w-full"
                    value={lastVoiceTranscript}
                    onChange={(event) => onVoiceTranscriptChange(event.target.value)}
                    placeholder="Your live transcript appears here as you speak. You can also type or paste directly."
                  />
                </div>

                {/* Type / paste */}
                <div
                  className="welcome-input-shell min-h-[9rem] xl:min-h-0"
                  style={{ flex: "1 1 0" }}
                >
                  <div className="welcome-input-toolbar">
                    <p className="welcome-section-label text-[0.78rem] uppercase tracking-[0.2em]">
                      Type or Paste
                    </p>
                    <button type="button" className="welcome-mini-button" onClick={onClearBrainDump}>
                      Clear
                    </button>
                    <span className="welcome-badge justify-self-end">Free Text</span>
                  </div>
                  <textarea
                    rows={5}
                    className="welcome-editor h-[calc(100%-2.5rem)] min-h-[5rem] w-full"
                    value={brainDump}
                    onChange={(event) => onBrainDumpChange(event.target.value)}
                    placeholder="Paste your existing resume, type your career history, or write rough notes — anything helps. Include roles, tools, wins, and the kind of job you want next."
                  />
                </div>

                {/* Job search promo */}
                <div className="shrink-0 flex items-center justify-between gap-3 rounded-[1.1rem] border border-[rgba(15,118,110,0.18)] bg-[rgba(215,243,238,0.7)] px-4 py-3" style={{ flexBasis: "auto" }}>
                  <p className="text-[0.8rem] leading-5 text-[#0f5c54]">
                    We can support tailored job search and application support materials for greater success. Do you want to try?
                  </p>
                  <a
                    href={process.env.NEXT_PUBLIC_JOB_SEARCH_URL ?? "http://localhost:7860"}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-lg bg-[#0f766e] px-3 py-1.5 text-[0.75rem] font-semibold text-white hover:bg-[#115e59] transition-colors"
                  >
                    Yes
                  </a>
                </div>

              </div>
            </section>
          </div>
        </div>
      </div>
    </div>
  );
}
