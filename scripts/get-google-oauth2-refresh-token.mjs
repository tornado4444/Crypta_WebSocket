import http from "node:http";
import { URL } from "node:url";

function pickEnv(...keys) {
  for (const key of keys) {
    const value = String(process.env[key] ?? "").trim();
    if (value) {
      return value;
    }
  }
  return "";
}

const clientId = pickEnv("AUTH_RESET_SMTP_OAUTH_CLIENT_ID", "AUTH_RESET_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID");
const clientSecret = pickEnv("AUTH_RESET_SMTP_OAUTH_CLIENT_SECRET", "AUTH_RESET_GOOGLE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET");
const redirectUri = pickEnv("AUTH_RESET_SMTP_OAUTH_REDIRECT_URI") || "http://127.0.0.1:8787/oauth2/callback";
const scope = pickEnv("AUTH_RESET_SMTP_OAUTH_SCOPE") || "https://mail.google.com/";

if (!clientId || !clientSecret) {
  console.error("Set AUTH_RESET_SMTP_OAUTH_CLIENT_ID and AUTH_RESET_SMTP_OAUTH_CLIENT_SECRET in .env first.");
  process.exit(1);
}

const authUrl = new URL("https://accounts.google.com/o/oauth2/v2/auth");
authUrl.searchParams.set("client_id", clientId);
authUrl.searchParams.set("redirect_uri", redirectUri);
authUrl.searchParams.set("response_type", "code");
authUrl.searchParams.set("scope", scope);
authUrl.searchParams.set("access_type", "offline");
authUrl.searchParams.set("prompt", "consent");

console.log("Open this URL in your browser and sign in with the Gmail account that should send reset emails:");
console.log(authUrl.toString());
console.log("");

const redirect = new URL(redirectUri);
const server = http.createServer(async (req, res) => {
  try {
    const incoming = new URL(req.url || "/", redirectUri);

    if (incoming.pathname !== redirect.pathname) {
      res.writeHead(404, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Not found");
      return;
    }

    const code = incoming.searchParams.get("code");
    const error = incoming.searchParams.get("error");

    if (error) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end(`OAuth failed: ${error}`);
      console.error(`OAuth failed: ${error}`);
      server.close();
      process.exit(1);
    }

    if (!code) {
      res.writeHead(400, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Missing code");
      return;
    }

    const tokenResponse = await fetch("https://oauth2.googleapis.com/token", {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded"
      },
      body: new URLSearchParams({
        code,
        client_id: clientId,
        client_secret: clientSecret,
        redirect_uri: redirectUri,
        grant_type: "authorization_code"
      })
    });

    const tokenJson = await tokenResponse.json();

    if (!tokenResponse.ok) {
      res.writeHead(500, { "Content-Type": "text/plain; charset=utf-8" });
      res.end("Token exchange failed. Check terminal output.");
      console.error("Token exchange failed:", tokenJson);
      server.close();
      process.exit(1);
    }

    res.writeHead(200, { "Content-Type": "text/plain; charset=utf-8" });
    res.end("OAuth completed. Return to terminal.");

    console.log("");
    console.log("Put these values into .env:");
    console.log(`AUTH_RESET_SMTP_AUTH_MODE=oauth2`);
    console.log(`AUTH_RESET_SMTP_OAUTH_CLIENT_ID=${clientId}`);
    console.log(`AUTH_RESET_SMTP_OAUTH_CLIENT_SECRET=${clientSecret}`);
    console.log(`AUTH_RESET_SMTP_OAUTH_REFRESH_TOKEN=${tokenJson.refresh_token || ""}`);
    if (tokenJson.access_token) {
      console.log(`AUTH_RESET_SMTP_OAUTH_ACCESS_TOKEN=${tokenJson.access_token}`);
    }

    server.close();
  } catch (error) {
    console.error("OAuth helper failed:", error);
    server.close();
    process.exit(1);
  }
});

server.listen(Number(redirect.port || 8787), redirect.hostname, () => {
  console.log(`Waiting for Google OAuth callback on ${redirectUri}`);
});
