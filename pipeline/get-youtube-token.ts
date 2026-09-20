import http from "node:http";
import { cfg } from "./env";

// One-time local setup: gets a YouTube refresh token via Google's
// "installed app" OAuth flow (loopback redirect). Run this on the machine
// that will actually run uploads — it needs a real browser and a reachable
// localhost, so it will not work inside a sandboxed/headless session.
//
// Prerequisite: a Google Cloud project with the YouTube Data API v3
// enabled, and an OAuth client of type "Desktop app" (console.cloud.google.com
// -> APIs & Services -> Credentials -> Create credentials -> OAuth client ID
// -> Desktop app). Put its client ID/secret in .env as YOUTUBE_CLIENT_ID /
// YOUTUBE_CLIENT_SECRET before running this.

const PORT = 53682;
const REDIRECT_URI = `http://127.0.0.1:${PORT}/oauth2callback`;
const SCOPE = "https://www.googleapis.com/auth/youtube.upload";

function requireClientCreds(): void {
  if (!cfg.youtubeClientId || !cfg.youtubeClientSecret) {
    throw new Error(
      "Set YOUTUBE_CLIENT_ID and YOUTUBE_CLIENT_SECRET in .env first (from a Desktop app OAuth client in Google Cloud Console)."
    );
  }
}

function authorizeUrl(): string {
  const params = new URLSearchParams({
    client_id: cfg.youtubeClientId,
    redirect_uri: REDIRECT_URI,
    response_type: "code",
    scope: SCOPE,
    access_type: "offline",
    prompt: "consent",
  });
  return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

async function exchangeCode(code: string): Promise<string> {
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_id: cfg.youtubeClientId,
      client_secret: cfg.youtubeClientSecret,
      code,
      grant_type: "authorization_code",
      redirect_uri: REDIRECT_URI,
    }),
  });
  const json = (await res.json()) as { refresh_token?: string; error?: string; error_description?: string };
  if (!res.ok || !json.refresh_token) {
    throw new Error(
      `Token exchange failed: ${json.error ?? res.status} ${json.error_description ?? ""}\n` +
        (json.error === "invalid_grant"
          ? "The code was already used or expired — restart this script and try again without reusing an old link."
          : "")
    );
  }
  return json.refresh_token;
}

async function main(): Promise<void> {
  requireClientCreds();
  const url = authorizeUrl();
  console.log("Open this URL, sign in with the Google account for your channel, and approve access:\n");
  console.log(url);
  console.log(`\nWaiting for the redirect to ${REDIRECT_URI} ...`);

  const refreshToken = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const reqUrl = new URL(req.url ?? "/", REDIRECT_URI);
      if (reqUrl.pathname !== "/oauth2callback") {
        res.writeHead(404).end();
        return;
      }
      const code = reqUrl.searchParams.get("code");
      const err = reqUrl.searchParams.get("error");
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end(err ? `<p>Denied: ${err}. You can close this tab.</p>` : "<p>Got it — you can close this tab and go back to the terminal.</p>");
      server.close();
      if (err) reject(new Error(`Google returned an error: ${err}`));
      else if (code) exchangeCode(code).then(resolve, reject);
      else reject(new Error("No code in the redirect."));
    });
    server.listen(PORT);
  });

  console.log("\nSuccess. Add this to your .env:\n");
  console.log(`YOUTUBE_REFRESH_TOKEN=${refreshToken}`);
  console.log("\nThis token does not expire on its own; only re-run this script if you revoke access.");
}

main().catch((err: unknown) => {
  console.error(err instanceof Error ? err.message : err);
  process.exitCode = 1;
});
