"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface FieldStatus {
  set: boolean;
  source: "settings" | "env" | "none";
  preview: string;
}
interface ConfigStatus {
  anthropicApiKey: FieldStatus;
  openaiApiKey: FieldStatus;
  elevenlabsApiKey: FieldStatus;
  elevenlabsVoiceId: FieldStatus;
  pexelsApiKey: FieldStatus;
}
interface JobLogLine {
  stage: string;
  message: string;
  at: string;
}
interface JobStatus {
  state: "running" | "done" | "error";
  log: JobLogLine[];
  result?: { title: string; durationSec: number };
  error?: string;
}

const FIELDS: { key: keyof ConfigStatus; label: string; help: string; type: string }[] = [
  { key: "anthropicApiKey", label: "Anthropic API key", help: "console.anthropic.com/settings/keys — writes the script (or use OpenAI below instead)", type: "password" },
  { key: "openaiApiKey", label: "OpenAI API key", help: "platform.openai.com/api-keys — alternative to Anthropic for writing the script", type: "password" },
  { key: "elevenlabsApiKey", label: "ElevenLabs API key", help: "elevenlabs.io/app/settings/api-keys — narrates it", type: "password" },
  { key: "elevenlabsVoiceId", label: "ElevenLabs voice ID", help: "elevenlabs.io/app/voice-lab — open your cloned voice, copy its ID", type: "text" },
  { key: "pexelsApiKey", label: "Pexels API key", help: "pexels.com/api — free stock footage", type: "password" },
];

function emptyStatus(): ConfigStatus {
  const blank: FieldStatus = { set: false, source: "none", preview: "" };
  return { anthropicApiKey: blank, openaiApiKey: blank, elevenlabsApiKey: blank, elevenlabsVoiceId: blank, pexelsApiKey: blank };
}

export default function ShortsStudio() {
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [config, setConfig] = useState<ConfigStatus>(emptyStatus());
  const [drafts, setDrafts] = useState<Record<string, string>>({});
  const [savingKeys, setSavingKeys] = useState(false);
  const [savedNote, setSavedNote] = useState("");

  const [text, setText] = useState("");
  const [mock, setMock] = useState(false);
  const [job, setJob] = useState<string | null>(null);
  const [status, setStatus] = useState<JobStatus | null>(null);
  const [starting, setStarting] = useState(false);
  const [startError, setStartError] = useState<string | null>(null);
  const logEndRef = useRef<HTMLDivElement>(null);

  const loadConfig = useCallback(() => {
    fetch("/api/shorts/config")
      .then((r) => r.json())
      .then((c: ConfigStatus) => setConfig(c))
      .catch(() => {});
  }, []);

  useEffect(() => {
    loadConfig();
  }, [loadConfig]);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ block: "nearest" });
  }, [status?.log.length]);

  useEffect(() => {
    if (!job || status?.state !== "running") return;
    const t = setInterval(() => {
      fetch(`/api/shorts/status?job=${encodeURIComponent(job)}`)
        .then((r) => r.json())
        .then((s: JobStatus) => setStatus(s))
        .catch(() => {});
    }, 1200);
    return () => clearInterval(t);
  }, [job, status?.state]);

  async function saveKeys() {
    setSavingKeys(true);
    setSavedNote("");
    try {
      const res = await fetch("/api/shorts/config", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(drafts),
      });
      const c = (await res.json()) as ConfigStatus;
      if (!res.ok) throw new Error("Save failed.");
      setConfig(c);
      setDrafts({});
      setSavedNote("Saved.");
    } catch {
      setSavedNote("Could not save — try again.");
    } finally {
      setSavingKeys(false);
    }
  }

  async function generate() {
    if (!text.trim() && !mock) {
      setStartError("Write a story first, or turn on demo mode.");
      return;
    }
    setStarting(true);
    setStartError(null);
    setStatus(null);
    setJob(null);
    try {
      const res = await fetch("/api/shorts/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: text.trim() || "A stranger returns a lost wallet stuffed with cash — and gets a surprise reward.", mock }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Could not start.");
      setJob(data.job);
      setStatus({ state: "running", log: [] });
    } catch (e) {
      setStartError(e instanceof Error ? e.message : "Could not start.");
    } finally {
      setStarting(false);
    }
  }

  const hasLlmKey = config.anthropicApiKey.set || config.openaiApiKey.set;
  const missingLive = !mock && (!hasLlmKey || !config.elevenlabsApiKey.set || !config.elevenlabsVoiceId.set || !config.pexelsApiKey.set);

  return (
    <div className="min-h-screen bg-bg text-gray-100">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">Shorts Generator</h1>
          <p className="text-xs text-gray-500">Story in, captioned vertical video out</p>
        </div>
        <a href="/" className="text-xs text-gray-400 hover:text-gray-200 underline underline-offset-2">
          ← AI Studio
        </a>
      </header>

      <main className="max-w-2xl mx-auto px-6 py-8 space-y-6">
        <section className="border border-border rounded-lg bg-panel">
          <button
            onClick={() => setSettingsOpen((v) => !v)}
            className="w-full flex items-center justify-between px-4 py-3 text-sm"
          >
            <span className="flex items-center gap-2">
              <span>⚙ Settings — API keys</span>
              {!missingLive && (
                <span className="text-[10px] px-1.5 py-0.5 rounded bg-accent/20 text-accent">all set</span>
              )}
            </span>
            <span className="text-gray-500">{settingsOpen ? "▲" : "▼"}</span>
          </button>
          {settingsOpen && (
            <div className="px-4 pb-4 space-y-3 border-t border-border pt-3">
              {FIELDS.map((f) => {
                const st = config[f.key];
                return (
                  <div key={f.key}>
                    <label className="block text-xs text-gray-400 mb-1">
                      {f.label}
                      {st.set && (
                        <span className="ml-2 text-gray-600">
                          currently {st.preview} ({st.source === "env" ? "from .env" : "saved here"})
                        </span>
                      )}
                    </label>
                    <input
                      type={f.type}
                      value={drafts[f.key] ?? ""}
                      onChange={(e) => setDrafts((d) => ({ ...d, [f.key]: e.target.value }))}
                      placeholder={st.set ? "Leave blank to keep the current one" : "Paste it here"}
                      className="w-full bg-bg border border-border rounded-md px-3 py-2 text-sm"
                    />
                    <p className="text-[11px] text-gray-600 mt-0.5">{f.help}</p>
                  </div>
                );
              })}
              <div className="flex items-center gap-3 pt-1">
                <button
                  onClick={saveKeys}
                  disabled={savingKeys || Object.keys(drafts).length === 0}
                  className="px-3 py-1.5 text-xs rounded-md bg-accent hover:bg-accent/90 text-white disabled:opacity-40"
                >
                  {savingKeys ? "Saving…" : "Save keys"}
                </button>
                {savedNote && <span className="text-xs text-gray-500">{savedNote}</span>}
              </div>
              <p className="text-[11px] text-gray-600 pt-1">
                Keys are saved on this computer only, in <code>data/pipeline-config.json</code> (never committed to
                git), and never leave it except to the service each key belongs to.
              </p>
            </div>
          )}
        </section>

        <section className="space-y-3">
          <div>
            <label className="block text-xs text-gray-400 mb-1">Story</label>
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="e.g. A man buys a used couch for $20 and finds $41,000 hidden inside it."
              rows={4}
              className="w-full bg-panel border border-border rounded-md px-3 py-2 text-sm resize-none"
            />
          </div>

          <label className="flex items-center gap-2 text-xs text-gray-400">
            <input type="checkbox" checked={mock} onChange={(e) => setMock(e.target.checked)} />
            Demo mode — no API keys needed (canned script, silent voice, colour placeholders instead of real footage)
          </label>

          {missingLive && !mock && (
            <p className="text-xs text-yellow-500">
              Add the keys above for a real video (Anthropic or OpenAI, plus ElevenLabs and Pexels), or turn on demo
              mode to try the pipeline right now.
            </p>
          )}

          {startError && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {startError}
            </div>
          )}

          <button
            onClick={generate}
            disabled={starting || status?.state === "running"}
            className="w-full py-2.5 rounded-md bg-accent hover:bg-accent/90 text-white text-sm font-medium disabled:opacity-50"
          >
            {starting || status?.state === "running" ? "Generating…" : "Generate short"}
          </button>
        </section>

        {status && (
          <section className="border border-border rounded-lg bg-panel p-4 space-y-3">
            <div className="max-h-48 overflow-y-auto space-y-1 font-mono text-[11px] text-gray-400">
              {status.log.map((l, i) => (
                <div key={i}>
                  <span className="text-accent">[{l.stage}]</span> {l.message}
                </div>
              ))}
              {status.state === "running" && <div className="text-gray-600 animate-pulse">working…</div>}
              <div ref={logEndRef} />
            </div>

            {status.state === "error" && (
              <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
                {status.error}
              </div>
            )}

            {status.state === "done" && job && (
              <div className="space-y-2">
                <p className="text-sm text-gray-200">{status.result?.title}</p>
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video
                  src={`/api/shorts/media?job=${encodeURIComponent(job)}&file=final.mp4`}
                  poster={`/api/shorts/media?job=${encodeURIComponent(job)}&file=cover.jpg`}
                  controls
                  className="w-full max-w-[280px] mx-auto rounded-lg border border-border"
                />
                <a
                  href={`/api/shorts/media?job=${encodeURIComponent(job)}&file=final.mp4`}
                  download
                  className="block text-center text-xs text-accent underline underline-offset-2"
                >
                  Download final.mp4
                </a>
              </div>
            )}
          </section>
        )}
      </main>
    </div>
  );
}
