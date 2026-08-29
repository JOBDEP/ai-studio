"use client";

import { useMemo, useState } from "react";
import { MODELS, ModelKind } from "@/lib/models";
import BudgetMeter from "@/components/BudgetMeter";

interface GalleryItem {
  id: string;
  kind: ModelKind;
  prompt: string;
  url: string;
  costUsd: number;
}

const ASPECT_RATIOS = ["1:1", "16:9", "9:16", "4:3"];

export default function Studio() {
  const [kind, setKind] = useState<ModelKind>("image");
  const [modelId, setModelId] = useState(MODELS.find((m) => m.kind === "image")!.id);
  const [aspectRatio, setAspectRatio] = useState("1:1");
  const [idea, setIdea] = useState("");
  const [prompt, setPrompt] = useState("");
  const [enhancing, setEnhancing] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [gallery, setGallery] = useState<GalleryItem[]>([]);
  const [refreshKey, setRefreshKey] = useState(0);

  const modelsForKind = useMemo(() => MODELS.filter((m) => m.kind === kind), [kind]);
  const activeModel = useMemo(() => MODELS.find((m) => m.id === modelId), [modelId]);

  function switchKind(next: ModelKind) {
    setKind(next);
    setModelId(MODELS.find((m) => m.kind === next)!.id);
    setError(null);
  }

  async function handleEnhance() {
    if (!idea.trim()) return;
    setEnhancing(true);
    setError(null);
    try {
      const res = await fetch("/api/enhance-prompt", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ idea, kind }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Failed to enhance prompt.");
      setPrompt(data.prompt);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Failed to enhance prompt.");
    } finally {
      setEnhancing(false);
    }
  }

  async function handleGenerate() {
    const finalPrompt = prompt.trim() || idea.trim();
    if (!finalPrompt) {
      setError("Write an idea or prompt first.");
      return;
    }
    setGenerating(true);
    setError(null);
    try {
      const endpoint = kind === "image" ? "/api/generate-image" : "/api/generate-video";
      const body =
        kind === "image"
          ? { prompt: finalPrompt, modelId, aspectRatio }
          : { prompt: finalPrompt, modelId };

      const res = await fetch(endpoint, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || "Generation failed.");

      setGallery((prev) => [
        { id: crypto.randomUUID(), kind, prompt: finalPrompt, url: data.url, costUsd: data.costUsd },
        ...prev,
      ]);
      setRefreshKey((k) => k + 1);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Generation failed.");
    } finally {
      setGenerating(false);
    }
  }

  return (
    <div className="min-h-screen bg-bg text-gray-100">
      <header className="border-b border-border px-6 py-4 flex items-center justify-between">
        <div>
          <h1 className="text-lg font-semibold tracking-tight">AI Studio</h1>
          <p className="text-xs text-gray-500">fal.ai generation + Claude prompt enhancement</p>
        </div>
        <BudgetMeter refreshKey={refreshKey} />
      </header>

      <main className="max-w-5xl mx-auto px-6 py-8 grid grid-cols-1 lg:grid-cols-[380px_1fr] gap-8">
        <section className="space-y-5">
          <div className="flex rounded-lg overflow-hidden border border-border w-fit">
            {(["image", "video"] as ModelKind[]).map((k) => (
              <button
                key={k}
                onClick={() => switchKind(k)}
                className={`px-4 py-1.5 text-sm capitalize ${
                  kind === k ? "bg-accent text-white" : "bg-panel text-gray-400 hover:text-gray-200"
                }`}
              >
                {k}
              </button>
            ))}
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Model</label>
            <select
              value={modelId}
              onChange={(e) => setModelId(e.target.value)}
              className="w-full bg-panel border border-border rounded-md px-3 py-2 text-sm"
            >
              {modelsForKind.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.label} — ~${m.estCostUsd.toFixed(3)}
                </option>
              ))}
            </select>
            {activeModel && <p className="text-xs text-gray-500 mt-1">{activeModel.description}</p>}
          </div>

          {kind === "image" && (
            <div>
              <label className="block text-xs text-gray-400 mb-1">Aspect ratio</label>
              <div className="flex gap-2 flex-wrap">
                {ASPECT_RATIOS.map((ar) => (
                  <button
                    key={ar}
                    onClick={() => setAspectRatio(ar)}
                    className={`px-3 py-1 text-xs rounded-md border ${
                      aspectRatio === ar
                        ? "border-accent text-accent"
                        : "border-border text-gray-400 hover:text-gray-200"
                    }`}
                  >
                    {ar}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div>
            <label className="block text-xs text-gray-400 mb-1">Rough idea</label>
            <textarea
              value={idea}
              onChange={(e) => setIdea(e.target.value)}
              placeholder="e.g. a cat astronaut floating above a neon city"
              rows={3}
              className="w-full bg-panel border border-border rounded-md px-3 py-2 text-sm resize-none"
            />
            <button
              onClick={handleEnhance}
              disabled={enhancing || !idea.trim()}
              className="mt-2 text-xs px-3 py-1.5 rounded-md border border-border hover:border-accent disabled:opacity-40"
            >
              {enhancing ? "Enhancing…" : "✨ Enhance with Claude"}
            </button>
          </div>

          <div>
            <label className="block text-xs text-gray-400 mb-1">Final prompt (editable)</label>
            <textarea
              value={prompt}
              onChange={(e) => setPrompt(e.target.value)}
              placeholder="Enhanced or hand-written prompt sent to the model"
              rows={4}
              className="w-full bg-panel border border-border rounded-md px-3 py-2 text-sm resize-none"
            />
          </div>

          {error && (
            <div className="text-sm text-red-400 bg-red-950/40 border border-red-900 rounded-md px-3 py-2">
              {error}
            </div>
          )}

          <button
            onClick={handleGenerate}
            disabled={generating}
            className="w-full py-2.5 rounded-md bg-accent hover:bg-accent/90 text-white text-sm font-medium disabled:opacity-50"
          >
            {generating ? "Generating…" : `Generate ${kind}`}
          </button>
        </section>

        <section>
          <h2 className="text-sm text-gray-400 mb-3">Gallery</h2>
          {gallery.length === 0 ? (
            <div className="text-sm text-gray-600 border border-dashed border-border rounded-lg p-10 text-center">
              Nothing generated yet this session.
            </div>
          ) : (
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {gallery.map((item) => (
                <div key={item.id} className="border border-border rounded-lg overflow-hidden bg-panel">
                  {item.kind === "image" ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={item.url} alt={item.prompt} className="w-full aspect-square object-cover" />
                  ) : (
                    <video src={item.url} controls className="w-full aspect-square object-cover" />
                  )}
                  <div className="p-2">
                    <p className="text-xs text-gray-400 line-clamp-2">{item.prompt}</p>
                    <p className="text-[10px] text-gray-600 mt-1">${item.costUsd.toFixed(3)}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      </main>
    </div>
  );
}
