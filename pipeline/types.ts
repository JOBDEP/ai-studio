// Shared types for the shorts pipeline. The Script JSON is the contract
// between stages: whatever renders the visuals (Pexels b-roll today, a 3D
// render later) only needs the shots array, never the LLM or the voice.

export interface Story {
  id: string;
  title: string;
  body: string;
  source: string; // "text" | "file" | "reddit:r/xyz"
  url?: string;
}

export type Emotion = "neutral" | "curious" | "shocked" | "amused" | "serious" | "excited" | "smug";
export type Camera = "close-up" | "medium" | "wide" | "over-shoulder" | "top-down";

export interface Shot {
  id: number;
  text: string; // exactly what the narrator says during this shot
  emotion: Emotion; // narrator's face/voice tone
  action: string; // one short physical action tag, e.g. "counts cash"
  set: string; // where the shot happens, e.g. "bank lobby"
  camera: Camera;
  brollQuery: string; // 2-4 concrete nouns for the stock-footage search
}

export interface Script {
  title: string;
  hook: string; // spoken first line; must equal shots[0].text
  description: string;
  hashtags: string[];
  shots: Shot[];
}

export interface Word {
  text: string;
  start: number; // seconds
  end: number;
}

export interface ShotTiming {
  id: number;
  start: number;
  end: number;
  durationSec: number;
}

export interface BrollClip {
  shotId: number;
  path: string; // local file
  source: string; // pexels url or "mock"
  durationSec: number; // how long this shot must last on screen
}

export interface QaCheck {
  name: string;
  pass: boolean;
  detail: string;
}

export interface QaReport {
  pass: boolean;
  checks: QaCheck[];
  durationSec: number;
  width: number;
  height: number;
  sizeBytes: number;
}

export interface UploadMeta {
  title: string;
  description: string;
  tags: string[];
  categoryId: string; // 24 = Entertainment
  privacyStatus: "private" | "unlisted" | "public";
  madeForKids: boolean;
}
