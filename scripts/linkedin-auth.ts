// One-time LinkedIn OAuth bootstrap: npm run linkedin-auth
//
// Prerequisites:
//   1. LinkedIn Developer app (https://developer.linkedin.com → My Apps) with
//      the Advertising API product approved.
//   2. Add this redirect URL in the app's Auth tab:
//        http://localhost:8976/callback
//   3. Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env.local.
//
// Opens the consent URL, captures the redirect, exchanges the code, and prints
// the access token (~60 days) and refresh token (~365 days) to put in
// .env.local / Vercel env. The nightly sync auto-refreshes access tokens from
// the refresh token; you only need to redo this flow when the refresh token
// itself expires.
import { config } from "dotenv";
config({ path: ".env.local" });
config({ path: ".env" });

import http from "http";
import { randomBytes } from "crypto";

const PORT = 8976;
const REDIRECT_URI = `http://localhost:${PORT}/callback`;
const SCOPES = "r_ads r_ads_reporting";

async function main() {
  const clientId = process.env.LINKEDIN_CLIENT_ID;
  const clientSecret = process.env.LINKEDIN_CLIENT_SECRET;
  if (!clientId || !clientSecret) {
    console.error("Set LINKEDIN_CLIENT_ID and LINKEDIN_CLIENT_SECRET in .env.local first.");
    process.exit(1);
  }
  const state = randomBytes(16).toString("hex");
  const authUrl =
    `https://www.linkedin.com/oauth/v2/authorization?response_type=code` +
    `&client_id=${encodeURIComponent(clientId)}` +
    `&redirect_uri=${encodeURIComponent(REDIRECT_URI)}` +
    `&state=${state}` +
    `&scope=${encodeURIComponent(SCOPES)}`;

  console.log("\n1. Open this URL in your browser and approve access:\n");
  console.log(authUrl + "\n");
  console.log(`2. Waiting for LinkedIn to redirect to ${REDIRECT_URI} ...\n`);

  const code = await new Promise<string>((resolve, reject) => {
    const server = http.createServer((req, res) => {
      const url = new URL(req.url ?? "/", REDIRECT_URI);
      if (url.pathname !== "/callback") {
        res.writeHead(404).end();
        return;
      }
      const err = url.searchParams.get("error_description") ?? url.searchParams.get("error");
      const returnedState = url.searchParams.get("state");
      const c = url.searchParams.get("code");
      if (err || !c || returnedState !== state) {
        res.writeHead(400, { "Content-Type": "text/plain" });
        res.end(`Authorization failed: ${err ?? "missing code/state"}`);
        server.close();
        reject(new Error(err ?? "missing code/state"));
        return;
      }
      res.writeHead(200, { "Content-Type": "text/html" });
      res.end("<h2>LinkedIn authorized ✔</h2>You can close this tab and return to the terminal.");
      server.close();
      resolve(c);
    });
    server.listen(PORT);
  });

  const body = new URLSearchParams({
    grant_type: "authorization_code",
    code,
    redirect_uri: REDIRECT_URI,
    client_id: clientId,
    client_secret: clientSecret,
  });
  const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  const data = await res.json();
  if (!res.ok || !data.access_token) {
    console.error("Token exchange failed:", JSON.stringify(data, null, 2));
    process.exit(1);
  }

  console.log("Success! Add these to .env.local (and Vercel env):\n");
  console.log(`LINKEDIN_ACCESS_TOKEN=${data.access_token}`);
  if (data.refresh_token) {
    console.log(`LINKEDIN_REFRESH_TOKEN=${data.refresh_token}`);
    console.log(
      `\nAccess token expires in ${Math.round((data.expires_in ?? 0) / 86400)} days; ` +
        `refresh token in ${Math.round((data.refresh_token_expires_in ?? 0) / 86400)} days. ` +
        `The sync auto-refreshes using the refresh token.`
    );
  } else {
    console.log(
      "\nNo refresh token returned (app may need 'Token introspection/refresh' enabled). " +
        "The access token lasts ~60 days; re-run this script before it expires."
    );
  }
  console.log("\nDon't forget LINKEDIN_AD_ACCOUNT_ID (numeric id from Campaign Manager URL).");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
