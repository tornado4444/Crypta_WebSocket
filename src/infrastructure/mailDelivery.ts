const nodemailer = require("nodemailer");

import { logger } from "./logger";

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(input ?? "").trim(), 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function pickEnv(...keys: string[]): string {
  for (const key of keys) {
    const value = String(process.env[key] ?? "").trim();

    if (value) {
      return value;
    }
  }

  return "";
}

export interface SendSystemEmailAttachment {
  filename: string;
  content: string | Buffer;
  contentType?: string;
}

export interface SendSystemEmailInput {
  to: string;
  subject: string;
  text: string;
  html?: string;
  attachments?: SendSystemEmailAttachment[];
}

export async function sendSystemEmail(input: SendSystemEmailInput): Promise<void> {
  const host = pickEnv("AUTH_RESET_SMTP_HOST", "SMTP_HOST", "MAIL_HOST", "EMAIL_SMTP_HOST");
  const user = pickEnv("AUTH_RESET_SMTP_USER", "SMTP_USER", "MAIL_USER", "EMAIL_SMTP_USER");
  const pass = pickEnv(
    "AUTH_RESET_SMTP_PASS",
    "SMTP_PASS",
    "SMTP_PASSWORD",
    "MAIL_PASS",
    "MAIL_PASSWORD",
    "EMAIL_SMTP_PASS",
    "EMAIL_SMTP_PASSWORD",
    "GMAIL_APP_PASSWORD"
  );
  const authMode = pickEnv("AUTH_RESET_SMTP_AUTH_MODE").toLowerCase();
  const oauthClientId = pickEnv(
    "AUTH_RESET_SMTP_OAUTH_CLIENT_ID",
    "AUTH_RESET_GOOGLE_CLIENT_ID",
    "GOOGLE_CLIENT_ID"
  );
  const oauthClientSecret = pickEnv(
    "AUTH_RESET_SMTP_OAUTH_CLIENT_SECRET",
    "AUTH_RESET_GOOGLE_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET"
  );
  const oauthRefreshToken = pickEnv(
    "AUTH_RESET_SMTP_OAUTH_REFRESH_TOKEN",
    "AUTH_RESET_GOOGLE_REFRESH_TOKEN",
    "GOOGLE_REFRESH_TOKEN"
  );
  const oauthAccessToken = pickEnv(
    "AUTH_RESET_SMTP_OAUTH_ACCESS_TOKEN",
    "AUTH_RESET_GOOGLE_ACCESS_TOKEN",
    "GOOGLE_ACCESS_TOKEN"
  );
  const normalizedHost = host.toLowerCase();
  const looksLikeGmailSmtp = normalizedHost.includes("gmail") || normalizedHost.includes("googlemail");
  const useOAuth2 =
    authMode === "oauth2" ||
    (looksLikeGmailSmtp && !pass) ||
    Boolean(oauthClientId) ||
    Boolean(oauthClientSecret) ||
    Boolean(oauthRefreshToken);

  if (!host || !user) {
    throw new Error("SMTP credentials are not configured");
  }

  const port = parsePositiveInt(pickEnv("AUTH_RESET_SMTP_PORT", "SMTP_PORT", "MAIL_PORT"), 587);
  const secureRaw = pickEnv("AUTH_RESET_SMTP_SECURE", "SMTP_SECURE", "MAIL_SECURE").toLowerCase();
  const secure = secureRaw ? secureRaw === "true" || secureRaw === "1" : port === 465;

  let transporter;

  if (useOAuth2) {
    if (!oauthClientId || !oauthClientSecret || !oauthRefreshToken) {
      throw new Error("SMTP OAuth2 is not configured");
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        type: "OAuth2",
        user,
        clientId: oauthClientId,
        clientSecret: oauthClientSecret,
        refreshToken: oauthRefreshToken,
        accessToken: oauthAccessToken || undefined
      }
    });
  } else {
    if (!pass) {
      throw new Error("SMTP credentials are not configured");
    }

    transporter = nodemailer.createTransport({
      host,
      port,
      secure,
      auth: {
        user,
        pass
      }
    });
  }

  const from = pickEnv("AUTH_RESET_SMTP_FROM", "SMTP_FROM", "MAIL_FROM") || user;
  const replyTo = pickEnv("AUTH_RESET_SMTP_REPLY_TO", "SMTP_REPLY_TO", "MAIL_REPLY_TO") || undefined;

  await transporter.sendMail({
    from,
    replyTo,
    to: input.to,
    subject: input.subject,
    text: input.text,
    html: input.html,
    attachments: input.attachments,
    headers: {
      "X-Auto-Response-Suppress": "OOF, AutoReply"
    }
  });
}

export function isSystemEmailConfigured(): boolean {
  const host = pickEnv("AUTH_RESET_SMTP_HOST", "SMTP_HOST", "MAIL_HOST", "EMAIL_SMTP_HOST");
  const user = pickEnv("AUTH_RESET_SMTP_USER", "SMTP_USER", "MAIL_USER", "EMAIL_SMTP_USER");

  if (!host || !user) {
    return false;
  }

  const pass = pickEnv(
    "AUTH_RESET_SMTP_PASS",
    "SMTP_PASS",
    "SMTP_PASSWORD",
    "MAIL_PASS",
    "MAIL_PASSWORD",
    "EMAIL_SMTP_PASS",
    "EMAIL_SMTP_PASSWORD",
    "GMAIL_APP_PASSWORD"
  );
  const authMode = pickEnv("AUTH_RESET_SMTP_AUTH_MODE").toLowerCase();
  const oauthClientId = pickEnv("AUTH_RESET_SMTP_OAUTH_CLIENT_ID", "AUTH_RESET_GOOGLE_CLIENT_ID", "GOOGLE_CLIENT_ID");
  const oauthClientSecret = pickEnv(
    "AUTH_RESET_SMTP_OAUTH_CLIENT_SECRET",
    "AUTH_RESET_GOOGLE_CLIENT_SECRET",
    "GOOGLE_CLIENT_SECRET"
  );
  const oauthRefreshToken = pickEnv(
    "AUTH_RESET_SMTP_OAUTH_REFRESH_TOKEN",
    "AUTH_RESET_GOOGLE_REFRESH_TOKEN",
    "GOOGLE_REFRESH_TOKEN"
  );

  if (authMode === "oauth2") {
    return Boolean(oauthClientId && oauthClientSecret && oauthRefreshToken);
  }

  const configured = Boolean(pass || (oauthClientId && oauthClientSecret && oauthRefreshToken));

  if (!configured) {
    logger.warn("[mail] SMTP host/user are set, but no password or OAuth2 credentials were found.");
  }

  return configured;
}
