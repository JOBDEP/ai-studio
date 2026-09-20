import fs from "node:fs";
import path from "node:path";
import { cfg } from "../env";
import type { UploadMeta } from "../types";

// Plain REST against Google's OAuth2 and YouTube Data API v3 endpoints —
// no `googleapis` dependency, matching the thin-client style already used
// for fal.ai. Needs a one-time refresh token from `npm run youtube-auth`.

interface TokenResponse {
  access_token: string;
  expires_in: number;
  token_type: string;
}

async function getAccessToken(): Promise<string> {
  if (!cfg.youtubeClientId || !cfg.youtubeClientSecret || !cfg.youtubeRefreshToken) {
    throw new Error(
      "Missing YOUTUBE_CLIENT_ID, YOUTUBE_CLIENT_SECRET or YOUTUBE_REFRESH_TOKEN in .env. " +
        "Run `npm run youtube-auth` once to get a refresh token (see pipeline/README.md)."
    );
  }
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.youtubeClientId,
      client_secret: cfg.youtubeClientSecret,
      refresh_token: cfg.youtubeRefreshToken,
      grant_type: "refresh_token",
    }),
  });
  if (!res.ok) {
    const text = await res.text().catch(() => "");
    throw new Error(`YouTube token refresh failed (${res.status}): ${text.slice(0, 400)}`);
  }
  return ((await res.json()) as TokenResponse).access_token;
}

export interface UploadResult {
  videoId: string;
  url: string;
  thumbnailSet: boolean;
  uploadedAt: string;
}

export interface UploadOptions {
  jobDir: string;
  meta: UploadMeta;
  videoPath: string;
  thumbnailPath?: string;
  dryRun: boolean;
}

// Google's simple "resumable" initiation, done as a single PUT since a
// 40-60s short is a few MB — no need for chunked resume on a file this
// small. Real resumability (retry a partial PUT) is left for later if
// uploads start failing partway on a slow connection.
export async function uploadVideo(opts: UploadOptions): Promise<UploadResult> {
  const { meta, videoPath, thumbnailPath, dryRun } = opts;
  const videoBytes = fs.statSync(videoPath).size;

  if (dryRun) {
    console.log("[upload] --dry-run: no network calls made. Would upload:");
    console.log(`  title:       ${meta.title}`);
    console.log(`  description: ${meta.description.split("\n")[0]}…`);
    console.log(`  tags:        ${meta.tags.join(", ")}`);
    console.log(`  privacy:     ${meta.privacyStatus}`);
    console.log(`  madeForKids: ${meta.madeForKids}`);
    console.log(`  video:       ${path.basename(videoPath)} (${(videoBytes / 1024 / 1024).toFixed(1)} MB)`);
    console.log(`  thumbnail:   ${thumbnailPath ? path.basename(thumbnailPath) : "(none)"}`);
    return { videoId: "DRY_RUN", url: "", thumbnailSet: false, uploadedAt: new Date().toISOString() };
  }

  const accessToken = await getAccessToken();

  const initRes = await fetch(
    "https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json; charset=UTF-8",
        "X-Upload-Content-Type": "video/mp4",
        "X-Upload-Content-Length": String(videoBytes),
      },
      body: JSON.stringify({
        snippet: {
          title: meta.title,
          description: meta.description,
          tags: meta.tags,
          categoryId: meta.categoryId,
        },
        status: {
          privacyStatus: meta.privacyStatus,
          selfDeclaredMadeForKids: meta.madeForKids,
        },
      }),
    }
  );
  if (!initRes.ok) {
    const text = await initRes.text().catch(() => "");
    throw new Error(`YouTube upload init failed (${initRes.status}): ${text.slice(0, 500)}`);
  }
  const uploadUrl = initRes.headers.get("location");
  if (!uploadUrl) throw new Error("YouTube upload init returned no resumable session URL.");

  const putRes = await fetch(uploadUrl, {
    method: "PUT",
    headers: { "Content-Type": "video/mp4", "Content-Length": String(videoBytes) },
    body: fs.readFileSync(videoPath),
  });
  if (!putRes.ok) {
    const text = await putRes.text().catch(() => "");
    throw new Error(`YouTube video upload failed (${putRes.status}): ${text.slice(0, 500)}`);
  }
  const video = (await putRes.json()) as { id: string };

  let thumbnailSet = false;
  if (thumbnailPath && fs.existsSync(thumbnailPath)) {
    // Custom thumbnails need a phone-verified channel; a channel that isn't
    // verified gets a 403 here. That's not fatal — the upload itself
    // already succeeded — so warn and move on.
    const thumbRes = await fetch(
      `https://www.googleapis.com/upload/youtube/v3/thumbnails/set?videoId=${video.id}`,
      {
        method: "POST",
        headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "image/jpeg" },
        body: fs.readFileSync(thumbnailPath),
      }
    );
    if (thumbRes.ok) thumbnailSet = true;
    else console.warn(`[upload] thumbnail not set (${thumbRes.status}) — is the channel phone-verified?`);
  }

  return {
    videoId: video.id,
    url: `https://youtube.com/shorts/${video.id}`,
    thumbnailSet,
    uploadedAt: new Date().toISOString(),
  };
}
