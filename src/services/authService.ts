import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
const nodemailer = require("nodemailer");

import type { PrismaClient } from "@prisma/client";

import { logger } from "../infrastructure/logger";
import { getPrismaClient } from "../infrastructure/prismaClient";

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const DISPLAY_NAME_RE = /^[\p{L}\p{N} _.-]{2,40}$/u;
const AVATAR_MIME_RE = /^data:image\/(png|jpeg|jpg|webp|gif);base64$/i;
const BASE64_RE = /^[A-Za-z0-9+/=\s]+$/;

const BANNED_USER_MESSAGE =
  "\u041F\u0440\u043E\u0431\u0430\u0447\u0430\u0454\u043C\u043E, \u0430\u043B\u0435 \u0432\u0438 \u0432\u0438\u043B\u0443\u0447\u0435\u043D\u0456 \u0456\u0437-\u0437\u0430 \u043F\u043E\u0440\u0443\u0448\u0435\u043D\u043D\u044F \u043F\u0440\u0430\u0432!";
const OWNER_REQUIRED_MESSAGE = "Owner account required";
const OWNER_SETUP_KEY = (process.env.OWNER_SETUP_KEY ?? process.env.ADMIN_VIEW_KEY ?? "").trim();
const OWNER_SETUP_DISABLED_MESSAGE = "Owner setup key is not configured";
const OWNER_SETUP_KEY_REQUIRED_MESSAGE = "Owner setup key is required";
const OWNER_SETUP_KEY_INVALID_MESSAGE = "Invalid owner setup key";
const PASSWORD_RESET_USER_NOT_FOUND_MESSAGE = "No account found for this email. Please register first";
const AUTH_MEM_FALLBACK_FILE =
  (process.env.AUTH_FALLBACK_FILE ?? "").trim() || path.resolve(process.cwd(), "data", "auth_fallback_users.json");

function parsePositiveInt(input: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(String(input ?? "").trim(), 10);

  if (!Number.isFinite(parsed) || parsed <= 0) {
    return fallback;
  }

  return Math.trunc(parsed);
}

function parseBooleanFlag(input: string | undefined, fallback: boolean): boolean {
  const normalized = String(input ?? "").trim().toLowerCase();

  if (!normalized) {
    return fallback;
  }

  return normalized === "1" || normalized === "true" || normalized === "yes" || normalized === "on";
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

function escapeHtml(input: string): string {
  return input
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

const AUTH_RESET_ALLOW_CONSOLE_FALLBACK = parseBooleanFlag(
  process.env.AUTH_RESET_ALLOW_CONSOLE_FALLBACK,
  false
);
const AUTH_RESET_BROWSER_GMAIL = parseBooleanFlag(process.env.AUTH_RESET_BROWSER_GMAIL, false);

const PASSWORD_RESET_CODE_TTL_MS = parsePositiveInt(process.env.AUTH_RESET_CODE_TTL_MS, 10 * 60 * 1000);
const PASSWORD_RESET_COOLDOWN_MS = parsePositiveInt(process.env.AUTH_RESET_COOLDOWN_MS, 60 * 1000);
const PASSWORD_RESET_MAX_ATTEMPTS = parsePositiveInt(process.env.AUTH_RESET_MAX_ATTEMPTS, 5);
const PASSWORD_RESET_EMAIL_SUBJECT =
  (process.env.AUTH_RESET_EMAIL_SUBJECT ?? "\u041A\u043E\u0434 \u0432\u0456\u0434\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u043F\u0430\u0440\u043E\u043B\u044F CryptoAggregator").trim() ||
  "\u041A\u043E\u0434 \u0432\u0456\u0434\u043D\u043E\u0432\u043B\u0435\u043D\u043D\u044F \u043F\u0430\u0440\u043E\u043B\u044F CryptoAggregator";

interface WalletSnapshot {
  usd: number;
  btc: number;
  eth: number;
}

export interface PortfolioPositionSnapshot {
  symbol: string;
  assetCode: string;
  amount: number;
  investedUsd: number;
  averageBuyPriceUsd: number;
  lastBuyAt: string;
}

export interface AuthPublicUser {
  id: string;
  email: string;
  displayName: string;
  avatarUrl: string | null;
  isOwner: boolean;
  wallet: WalletSnapshot;
  portfolio: PortfolioPositionSnapshot[];
  isBanned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  createdAt: string;
}

interface AuthSuccess {
  token: string;
  user: AuthPublicUser;
}

interface AuthFailure {
  error: string;
  status: number;
}

interface AuthListSuccess {
  users: AuthPublicUser[];
}

interface AuthListFailure {
  error: string;
  status: number;
}

interface AuthAdminSuccess {
  ok: true;
}

interface AuthOwnerAccessSuccess {
  ok: true;
}

interface AuthOperationSuccess {
  ok: true;
  message: string;
  deliveryMode?: "email" | "gmail_compose";
  composeUrl?: string;
  deliveryProvider?: "smtp" | "resend";
  deliveryId?: string;
  deliveryTo?: string;
  deliveryFrom?: string;
}

interface ResetEmailDelivery {
  provider: "smtp" | "resend";
  id?: string;
  to: string;
  from: string;
}

type TokenMode = "db" | "mem";

interface TokenPayload {
  sub: string;
  email?: string;
  mode?: TokenMode;
  isOwner?: boolean;
}

interface TokenContext {
  token: string;
  payload: TokenPayload;
}

interface DbUserRow {
  id: bigint;
  email: string;
  displayName: string;
  passwordHash: string;
  avatarUrl: string | null;
  isOwner: boolean;
  balanceUsd: number;
  balanceBtc: number;
  balanceEth: number;
  portfolioJson: string | null;
  isBanned: boolean;
  banReason: string | null;
  bannedAt: Date | null;
  createdAt: Date;
}

interface MemoryUserRow {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  avatarUrl: string | null;
  isOwner: boolean;
  wallet: WalletSnapshot;
  portfolio: PortfolioPositionSnapshot[];
  isBanned: boolean;
  banReason: string | null;
  bannedAt: Date | null;
  createdAt: Date;
}

interface PersistedMemoryUserRow {
  id: string;
  email: string;
  displayName: string;
  passwordHash: string;
  avatarUrl: string | null;
  isOwner: boolean;
  wallet: WalletSnapshot;
  portfolio: PortfolioPositionSnapshot[];
  isBanned: boolean;
  banReason: string | null;
  bannedAt: string | null;
  createdAt: string;
}

interface PasswordResetSession {
  codeHash: string;
  expiresAt: number;
  attemptsLeft: number;
  nextRequestAt: number;
  isVerified: boolean;
  verifiedAt: number | null;
}

type ResetTarget =
  | {
      mode: "db";
      user: DbUserRow;
    }
  | {
      mode: "mem";
      user: MemoryUserRow;
    };

interface ProfileUpdateInput {
  displayName?: string;
  avatarUrl?: string | null;
}

interface WalletDepositInput {
  amountUsd: number;
}

interface PortfolioBuyInput {
  symbol: string;
  assetCode: string;
  amountUsd: number;
  assetUnits: number;
}

interface PortfolioSellInput {
  symbol: string;
  assetCode: string;
  amountUsd: number;
  assetUnits: number;
  sellAll?: boolean;
}

export type AuthResult = AuthSuccess | AuthFailure;
export type AuthListResult = AuthListSuccess | AuthListFailure;
export type AuthAdminResult = AuthAdminSuccess | AuthFailure;
export type AuthOwnerAccessResult = AuthOwnerAccessSuccess | AuthFailure;
export type AuthOperationResult = AuthOperationSuccess | AuthFailure;

function isSuccess(result: AuthResult): result is AuthSuccess {
  return (result as AuthSuccess).token !== undefined;
}

function isFailure(result: AuthResult | TokenContext | AuthAdminResult): result is AuthFailure {
  return (result as AuthFailure).status !== undefined;
}

export function authResultIsSuccess(result: AuthResult): result is AuthSuccess {
  return isSuccess(result);
}

export function authListResultIsSuccess(result: AuthListResult): result is AuthListSuccess {
  return (result as AuthListSuccess).users !== undefined;
}

export function authAdminResultIsSuccess(result: AuthAdminResult): result is AuthAdminSuccess {
  return (result as AuthAdminSuccess).ok === true;
}

export function authOwnerAccessResultIsSuccess(
  result: AuthOwnerAccessResult
): result is AuthOwnerAccessSuccess {
  return (result as AuthOwnerAccessSuccess).ok === true;
}

export function authOperationResultIsSuccess(
  result: AuthOperationResult
): result is AuthOperationSuccess {
  return (result as AuthOperationSuccess).ok === true;
}

export class AuthService {
  public static readonly BANNED_USER_MESSAGE = BANNED_USER_MESSAGE;

  private authTableEnsured = false;
  private warnedDbFallback = false;

  private memSeq = 1;
  private readonly memUsersById = new Map<string, MemoryUserRow>();
  private readonly memUsersByEmail = new Map<string, MemoryUserRow>();
  private readonly memStoragePath: string;
  private readonly passwordResetSessions = new Map<string, PasswordResetSession>();

  constructor(private readonly jwtSecret: string) {
    this.memStoragePath = AUTH_MEM_FALLBACK_FILE;
    this.loadMemoryUsersFromDisk();
  }

  public isEnabled(): boolean {
    return Boolean(this.jwtSecret);
  }

  public async register(
    emailInput: string,
    passwordInput: string,
    displayNameInput: string
  ): Promise<AuthResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const email = emailInput.trim().toLowerCase();
    const password = passwordInput.trim();
    const displayName = displayNameInput.trim().normalize("NFC");

    const emailError = this.validateEmail(email);

    if (emailError) {
      return { error: emailError, status: 400 };
    }

    const passwordError = this.validatePassword(password);

    if (passwordError) {
      return { error: passwordError, status: 400 };
    }

    const displayNameError = this.validateDisplayName(displayName);

    if (displayNameError) {
      return { error: displayNameError, status: 400 };
    }

    const prisma = getPrismaClient();

    if (prisma) {
      try {
        await this.ensureAuthTable(prisma);

        const existing = await this.findUserByEmail(prisma, email);

        if (existing) {
          return { error: "Email is already registered", status: 409 };
        }

        const passwordHash = await bcrypt.hash(password, 10);
        const wallet = this.buildInitialWallet();
        const portfolio = this.buildInitialPortfolio();
        const isOwner = !(await this.dbOwnerExists(prisma));

        const inserted = await prisma.$queryRaw<DbUserRow[]>`
          INSERT INTO "ClientUser" (
            email,
            "passwordHash",
            "displayName",
            "avatarUrl",
            "isOwner",
            "balanceUsd",
            "balanceBtc",
            "balanceEth",
            "portfolioJson"
          )
          VALUES (
            ${email},
            ${passwordHash},
            ${displayName},
            ${null},
            ${isOwner},
            ${wallet.usd},
            ${wallet.btc},
            ${wallet.eth},
            ${this.serializePortfolio(portfolio)}
          )
          RETURNING
            id,
            email,
            "displayName",
            "passwordHash",
            "avatarUrl",
            "isOwner",
            "balanceUsd",
            "balanceBtc",
            "balanceEth",
            "portfolioJson",
            "isBanned",
            "banReason",
            "bannedAt",
            "createdAt"
        `;

        const user = inserted[0];

        return {
          token: this.issueToken(user.id.toString(), user.email, "db", user.isOwner),
          user: this.toPublicUserFromDb(user)
        };
      } catch (error) {
        this.warnMemoryFallback(error);
      }
    }

    return this.registerInMemory(email, password, displayName);
  }

  public async login(emailInput: string, passwordInput: string): Promise<AuthResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const email = emailInput.trim().toLowerCase();
    const password = passwordInput.trim();

    if (!email || !password) {
      return { error: "Email and password are required", status: 400 };
    }

    const emailError = this.validateEmail(email);

    if (emailError) {
      return { error: emailError, status: 400 };
    }

    const prisma = getPrismaClient();

    if (prisma) {
      try {
        await this.ensureAuthTable(prisma);

        const user = await this.findUserByEmail(prisma, email);

        if (user) {
          if (this.isBannedDbUser(user)) {
            return this.bannedFailure();
          }

          const validPassword = await bcrypt.compare(password, user.passwordHash);

          if (!validPassword) {
            return { error: "Invalid credentials", status: 401 };
          }

          return {
            token: this.issueToken(user.id.toString(), user.email, "db", user.isOwner),
            user: this.toPublicUserFromDb(user)
          };
        }
      } catch (error) {
        this.warnMemoryFallback(error);
      }
    }

    return this.loginInMemory(email, password);
  }

  public async requestPasswordResetCode(emailInput: string): Promise<AuthOperationResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const email = emailInput.trim().toLowerCase();
    const emailError = this.validateEmail(email);

    if (emailError) {
      return { error: emailError, status: 400 };
    }

    const now = Date.now();
    const existingSession = this.passwordResetSessions.get(email);

    if (existingSession && existingSession.nextRequestAt > now) {
      return { error: "Please wait before requesting a new code", status: 429 };
    }

    const resetTarget = await this.resolveResetTarget(email);

    if (resetTarget && "status" in resetTarget) {
      return resetTarget;
    }

    if (!resetTarget) {
      return { error: PASSWORD_RESET_USER_NOT_FOUND_MESSAGE, status: 404 };
    }

    if (resetTarget.mode === "db" && this.isBannedDbUser(resetTarget.user)) {
      return this.bannedFailure();
    }

    if (resetTarget.mode === "mem" && this.isBannedMemoryUser(resetTarget.user)) {
      return this.bannedFailure();
    }

    const code = this.generateResetCode();
    this.passwordResetSessions.set(email, {
      codeHash: this.hashResetCode(email, code),
      expiresAt: now + PASSWORD_RESET_CODE_TTL_MS,
      attemptsLeft: PASSWORD_RESET_MAX_ATTEMPTS,
      nextRequestAt: now + PASSWORD_RESET_COOLDOWN_MS,
      isVerified: false,
      verifiedAt: null
    });

    if (AUTH_RESET_BROWSER_GMAIL) {
      return {
        ok: true,
        message: "Gmail compose ready",
        deliveryMode: "gmail_compose",
        composeUrl: this.buildGmailComposeUrl(email, code)
      };
    }

    let emailDelivery: ResetEmailDelivery | null = null;

    try {
      emailDelivery = await this.sendResetCodeEmail(email, code);
    } catch (error) {
      const resetEmailErrorMessage = error instanceof Error ? error.message : String(error ?? "");

      if (!AUTH_RESET_ALLOW_CONSOLE_FALLBACK) {
        this.passwordResetSessions.delete(email);
        logger.error("[auth] Failed to send password reset code email:", error);

        if (resetEmailErrorMessage.includes("SMTP OAuth2 is not configured")) {
          return {
            error: "Password reset email service is not configured yet",
            status: 503
          };
        }

        if (resetEmailErrorMessage.includes("SMTP credentials are not configured")) {
          return {
            error: "Password reset email service is not configured yet",
            status: 503
          };
        }

        const normalizedResetEmailError = resetEmailErrorMessage.toLowerCase();

        if (
          normalizedResetEmailError.includes("invalid_grant") ||
          normalizedResetEmailError.includes("unauthorized_client") ||
          normalizedResetEmailError.includes("oauth")
        ) {
          return {
            error: "Password reset email service is temporarily unavailable",
            status: 503
          };
        }

        if (normalizedResetEmailError.includes("invalid login") || normalizedResetEmailError.includes("authentication")) {
          return {
            error: "Password reset email service is temporarily unavailable",
            status: 503
          };
        }

        if (
          normalizedResetEmailError.includes("you can only send testing emails to your own email address") ||
          (normalizedResetEmailError.includes("resend.dev") && normalizedResetEmailError.includes("verify a domain"))
        ) {
          return {
            error: "Resend test sender can only deliver to your own email until a domain is verified",
            status: 503
          };
        }

        return { error: "Password reset email service is unavailable", status: 503 };
      }

      logger.warn("[auth] Failed to send password reset code email; using console fallback");
      logger.warn(`[auth] Password reset code for ${email}: ${code}`);
    }

    return {
      ok: true,
      message: "Verification code sent",
      deliveryMode: "email",
      deliveryProvider: emailDelivery?.provider,
      deliveryId: emailDelivery?.id,
      deliveryTo: emailDelivery?.to,
      deliveryFrom: emailDelivery?.from
    };
  }

  public async verifyPasswordResetCode(emailInput: string, codeInput: string): Promise<AuthOperationResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const email = emailInput.trim().toLowerCase();
    const code = codeInput.trim();

    const emailError = this.validateEmail(email);

    if (emailError) {
      return { error: emailError, status: 400 };
    }

    if (!code) {
      return { error: "Verification code is required", status: 400 };
    }

    if (!this.isValidResetCodeFormat(code)) {
      return { error: "Invalid verification code", status: 400 };
    }

    const session = this.passwordResetSessions.get(email);

    if (!session) {
      return { error: "Please request a new verification code", status: 400 };
    }

    if (session.expiresAt < Date.now()) {
      this.passwordResetSessions.delete(email);
      return { error: "Verification code expired", status: 400 };
    }

    const expectedHash = this.hashResetCode(email, code);

    if (expectedHash !== session.codeHash) {
      const attemptsLeft = Math.max(0, session.attemptsLeft - 1);

      if (attemptsLeft <= 0) {
        this.passwordResetSessions.delete(email);
        return { error: "Too many invalid code attempts", status: 429 };
      }

      this.passwordResetSessions.set(email, {
        ...session,
        attemptsLeft
      });

      return { error: "Invalid verification code", status: 400 };
    }

    this.passwordResetSessions.set(email, {
      ...session,
      isVerified: true,
      verifiedAt: Date.now()
    });

    return { ok: true, message: "Verification code confirmed" };
  }

  public async confirmPasswordResetCode(
    emailInput: string,
    codeInput: string,
    newPasswordInput: string
  ): Promise<AuthOperationResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const email = emailInput.trim().toLowerCase();
    const code = codeInput.trim();
    const newPassword = newPasswordInput.trim();

    const emailError = this.validateEmail(email);

    if (emailError) {
      return { error: emailError, status: 400 };
    }

    if (!code) {
      return { error: "Verification code is required", status: 400 };
    }

    if (!this.isValidResetCodeFormat(code)) {
      return { error: "Invalid verification code", status: 400 };
    }

    const passwordError = this.validatePassword(newPassword);

    if (passwordError) {
      return { error: passwordError, status: 400 };
    }

    const session = this.passwordResetSessions.get(email);

    if (!session) {
      return { error: "Please request a new verification code", status: 400 };
    }

    if (session.expiresAt < Date.now()) {
      this.passwordResetSessions.delete(email);
      return { error: "Verification code expired", status: 400 };
    }

    if (!session.isVerified) {
      return { error: "Please verify the code first", status: 400 };
    }

    const expectedHash = this.hashResetCode(email, code);

    if (expectedHash !== session.codeHash) {
      const attemptsLeft = Math.max(0, session.attemptsLeft - 1);

      if (attemptsLeft <= 0) {
        this.passwordResetSessions.delete(email);
        return { error: "Too many invalid code attempts", status: 429 };
      }

      this.passwordResetSessions.set(email, {
        ...session,
        attemptsLeft
      });

      return { error: "Invalid verification code", status: 400 };
    }

    const resetTarget = await this.resolveResetTarget(email);

    if (resetTarget && "status" in resetTarget) {
      return resetTarget;
    }

    if (!resetTarget) {
      this.passwordResetSessions.delete(email);
      return { error: "User not found", status: 404 };
    }

    if (resetTarget.mode === "db" && this.isBannedDbUser(resetTarget.user)) {
      return this.bannedFailure();
    }

    if (resetTarget.mode === "mem" && this.isBannedMemoryUser(resetTarget.user)) {
      return this.bannedFailure();
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    if (resetTarget.mode === "db") {
      const prisma = getPrismaClient();

      if (!prisma) {
        return { error: "Database is unavailable", status: 503 };
      }

      try {
        await this.ensureAuthTable(prisma);

        await prisma.$executeRaw`
          UPDATE "ClientUser"
          SET
            "passwordHash" = ${passwordHash},
            "updatedAt" = ${new Date()}
          WHERE id = ${resetTarget.user.id}
        `;
      } catch (error) {
        this.warnMemoryFallback(error);
        return { error: "Database is unavailable", status: 503 };
      }
    } else {
      const updated: MemoryUserRow = {
        ...resetTarget.user,
        passwordHash
      };

      this.memUsersById.set(updated.id, updated);
      this.memUsersByEmail.set(updated.email, updated);
      this.persistMemoryUsers();
    }

    this.passwordResetSessions.delete(email);
    return { ok: true, message: "Password reset successful" };
  }

  public async me(authorizationHeader: string | undefined): Promise<AuthResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const tokenContext = this.parseTokenContext(authorizationHeader);

    if (isFailure(tokenContext)) {
      return tokenContext;
    }

    const { token, payload } = tokenContext;

    if (payload.mode === "mem") {
      const user = this.memUsersById.get(payload.sub);

      if (!user) {
        return { error: "User not found", status: 404 };
      }

      if (this.isBannedMemoryUser(user)) {
        return this.bannedFailure();
      }

      return {
        token,
        user: this.toPublicUserFromMemory(user)
      };
    }

    const prisma = getPrismaClient();

    if (prisma && this.isNumericId(payload.sub)) {
      try {
        await this.ensureAuthTable(prisma);

        const user = await this.findUserById(prisma, BigInt(payload.sub));

        if (user) {
          if (this.isBannedDbUser(user)) {
            return this.bannedFailure();
          }

          return {
            token,
            user: this.toPublicUserFromDb(user)
          };
        }
      } catch (error) {
        this.warnMemoryFallback(error);
      }
    }

    const memUser = this.memUsersById.get(payload.sub);

    if (!memUser) {
      return { error: "User not found", status: 404 };
    }

    if (this.isBannedMemoryUser(memUser)) {
      return this.bannedFailure();
    }

    return {
      token,
      user: this.toPublicUserFromMemory(memUser)
    };
  }

  public async updateProfile(
    authorizationHeader: string | undefined,
    input: ProfileUpdateInput
  ): Promise<AuthResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const tokenContext = this.parseTokenContext(authorizationHeader);

    if (isFailure(tokenContext)) {
      return tokenContext;
    }

    const nextDisplayNameRaw =
      input.displayName !== undefined ? String(input.displayName).trim().normalize("NFC") : undefined;

    const avatarValidation = this.validateAvatarUrlInput(input.avatarUrl);

    if (avatarValidation.error) {
      return { error: avatarValidation.error, status: 400 };
    }

    if (nextDisplayNameRaw !== undefined) {
      const nameError = this.validateDisplayName(nextDisplayNameRaw);

      if (nameError) {
        return { error: nameError, status: 400 };
      }
    }

    if (nextDisplayNameRaw === undefined && input.avatarUrl === undefined) {
      return { error: "No profile fields to update", status: 400 };
    }

    const { token, payload } = tokenContext;

    if (payload.mode === "mem") {
      const memUser = this.memUsersById.get(payload.sub);

      if (!memUser) {
        return { error: "User not found", status: 404 };
      }

      if (this.isBannedMemoryUser(memUser)) {
        return this.bannedFailure();
      }

      const updated: MemoryUserRow = {
        ...memUser,
        displayName: nextDisplayNameRaw ?? memUser.displayName,
        avatarUrl: input.avatarUrl === undefined ? memUser.avatarUrl : avatarValidation.value
      };

      this.memUsersById.set(updated.id, updated);
      this.memUsersByEmail.set(updated.email, updated);
      this.persistMemoryUsers();

      return {
        token,
        user: this.toPublicUserFromMemory(updated)
      };
    }

    const prisma = getPrismaClient();

    if (prisma && this.isNumericId(payload.sub)) {
      try {
        await this.ensureAuthTable(prisma);

        const id = BigInt(payload.sub);
        const current = await this.findUserById(prisma, id);

        if (!current) {
          return { error: "User not found", status: 404 };
        }

        if (this.isBannedDbUser(current)) {
          return this.bannedFailure();
        }

        const nextDisplayName = nextDisplayNameRaw ?? current.displayName;
        const nextAvatar = input.avatarUrl === undefined ? current.avatarUrl : avatarValidation.value;

        const rows = await prisma.$queryRaw<DbUserRow[]>`
          UPDATE "ClientUser"
          SET
            "displayName" = ${nextDisplayName},
            "avatarUrl" = ${nextAvatar},
            "updatedAt" = ${new Date()}
          WHERE id = ${id}
          RETURNING
            id,
            email,
            "displayName",
            "passwordHash",
            "avatarUrl",
            "isOwner",
            "balanceUsd",
            "balanceBtc",
            "balanceEth",
            "portfolioJson",
            "isBanned",
            "banReason",
            "bannedAt",
            "createdAt"
        `;

        const updated = rows[0];

        return {
          token,
          user: this.toPublicUserFromDb(updated)
        };
      } catch (error) {
        this.warnMemoryFallback(error);
      }
    }

    const memUser = this.memUsersById.get(payload.sub);

    if (!memUser) {
      return { error: "Database is unavailable", status: 503 };
    }

    if (this.isBannedMemoryUser(memUser)) {
      return this.bannedFailure();
    }

    const updated: MemoryUserRow = {
      ...memUser,
      displayName: nextDisplayNameRaw ?? memUser.displayName,
      avatarUrl: input.avatarUrl === undefined ? memUser.avatarUrl : avatarValidation.value
    };

    this.memUsersById.set(updated.id, updated);
    this.memUsersByEmail.set(updated.email, updated);
    this.persistMemoryUsers();

    return {
      token,
      user: this.toPublicUserFromMemory(updated)
    };
  }

  public async depositWallet(
    authorizationHeader: string | undefined,
    input: WalletDepositInput
  ): Promise<AuthResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const tokenContext = this.parseTokenContext(authorizationHeader);

    if (isFailure(tokenContext)) {
      return tokenContext;
    }

    const amountUsd = this.toFiniteNumber(input.amountUsd);

    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return { error: "Deposit amount must be greater than 0", status: 400 };
    }

    const normalizedAmountUsd = Math.round(amountUsd * 100) / 100;
    const { token, payload } = tokenContext;

    if (payload.mode === "mem") {
      const memUser = this.memUsersById.get(payload.sub);

      if (!memUser) {
        return { error: "User not found", status: 404 };
      }

      if (this.isBannedMemoryUser(memUser)) {
        return this.bannedFailure();
      }

      const updated: MemoryUserRow = {
        ...memUser,
        wallet: {
          ...memUser.wallet,
          usd: this.toFiniteNumber(memUser.wallet.usd) + normalizedAmountUsd
        }
      };

      this.memUsersById.set(updated.id, updated);
      this.memUsersByEmail.set(updated.email, updated);
      this.persistMemoryUsers();

      return {
        token,
        user: this.toPublicUserFromMemory(updated)
      };
    }

    const prisma = getPrismaClient();

    if (prisma && this.isNumericId(payload.sub)) {
      try {
        await this.ensureAuthTable(prisma);

        const id = BigInt(payload.sub);
        const current = await this.findUserById(prisma, id);

        if (!current) {
          return { error: "User not found", status: 404 };
        }

        if (this.isBannedDbUser(current)) {
          return this.bannedFailure();
        }

        const nextUsd = this.toFiniteNumber(current.balanceUsd) + normalizedAmountUsd;
        const rows = await prisma.$queryRaw<DbUserRow[]>`
          UPDATE "ClientUser"
          SET
            "balanceUsd" = ${nextUsd},
            "updatedAt" = ${new Date()}
          WHERE id = ${id}
          RETURNING
            id,
            email,
            "displayName",
            "passwordHash",
            "avatarUrl",
            "isOwner",
            "balanceUsd",
            "balanceBtc",
            "balanceEth",
            "portfolioJson",
            "isBanned",
            "banReason",
            "bannedAt",
            "createdAt"
        `;

        const updated = rows[0];

        if (!updated) {
          return { error: "User not found", status: 404 };
        }

        return {
          token,
          user: this.toPublicUserFromDb(updated)
        };
      } catch (error) {
        this.warnMemoryFallback(error);
      }
    }

    const fallbackUser = this.memUsersById.get(payload.sub);

    if (!fallbackUser) {
      return { error: "Database is unavailable", status: 503 };
    }

    if (this.isBannedMemoryUser(fallbackUser)) {
      return this.bannedFailure();
    }

    const updated: MemoryUserRow = {
      ...fallbackUser,
      wallet: {
        ...fallbackUser.wallet,
        usd: this.toFiniteNumber(fallbackUser.wallet.usd) + normalizedAmountUsd
      }
    };

    this.memUsersById.set(updated.id, updated);
    this.memUsersByEmail.set(updated.email, updated);
    this.persistMemoryUsers();

    return {
      token,
      user: this.toPublicUserFromMemory(updated)
    };
  }

  public async buyAsset(
    authorizationHeader: string | undefined,
    input: PortfolioBuyInput
  ): Promise<AuthResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const tokenContext = this.parseTokenContext(authorizationHeader);

    if (isFailure(tokenContext)) {
      return tokenContext;
    }

    const symbol = String(input.symbol || "").trim().toUpperCase();
    const assetCode = String(input.assetCode || "").trim().toUpperCase();
    const amountUsd = this.toFiniteNumber(input.amountUsd);
    const assetUnits = this.toFiniteNumber(input.assetUnits);

    if (!symbol || !assetCode) {
      return { error: "Asset symbol is required", status: 400 };
    }

    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return { error: "Investment amount must be greater than 0", status: 400 };
    }

    if (!Number.isFinite(assetUnits) || assetUnits <= 0) {
      return { error: "Asset units must be greater than 0", status: 400 };
    }

    const normalizedAmountUsd = Math.round(amountUsd * 100) / 100;
    const { token, payload } = tokenContext;
    const performedAt = new Date().toISOString();

    if (payload.mode === "mem") {
      const memUser = this.memUsersById.get(payload.sub);

      if (!memUser) {
        return { error: "User not found", status: 404 };
      }

      if (this.isBannedMemoryUser(memUser)) {
        return this.bannedFailure();
      }

      if (this.toFiniteNumber(memUser.wallet.usd) + 1e-9 < normalizedAmountUsd) {
        return { error: "Insufficient USD balance", status: 400 };
      }

      const updated: MemoryUserRow = {
        ...memUser,
        wallet: {
          usd: Math.max(0, this.toFiniteNumber(memUser.wallet.usd) - normalizedAmountUsd),
          btc: this.toFiniteNumber(memUser.wallet.btc) + (assetCode === "BTC" ? assetUnits : 0),
          eth: this.toFiniteNumber(memUser.wallet.eth) + (assetCode === "ETH" ? assetUnits : 0)
        },
        portfolio: this.applyPortfolioBuy(
          memUser.portfolio,
          {
            symbol,
            assetCode,
            amountUsd: normalizedAmountUsd,
            assetUnits
          },
          performedAt
        )
      };

      this.memUsersById.set(updated.id, updated);
      this.memUsersByEmail.set(updated.email, updated);
      this.persistMemoryUsers();

      return {
        token,
        user: this.toPublicUserFromMemory(updated)
      };
    }

    const prisma = getPrismaClient();

    if (prisma && this.isNumericId(payload.sub)) {
      try {
        await this.ensureAuthTable(prisma);

        const id = BigInt(payload.sub);
        const current = await this.findUserById(prisma, id);

        if (!current) {
          return { error: "User not found", status: 404 };
        }

        if (this.isBannedDbUser(current)) {
          return this.bannedFailure();
        }

        if (this.toFiniteNumber(current.balanceUsd) + 1e-9 < normalizedAmountUsd) {
          return { error: "Insufficient USD balance", status: 400 };
        }

        const nextPortfolio = this.applyPortfolioBuy(
          this.parsePortfolioJson(current.portfolioJson),
          {
            symbol,
            assetCode,
            amountUsd: normalizedAmountUsd,
            assetUnits
          },
          performedAt
        );
        const nextUsd = Math.max(0, this.toFiniteNumber(current.balanceUsd) - normalizedAmountUsd);
        const nextBtc = this.toFiniteNumber(current.balanceBtc) + (assetCode === "BTC" ? assetUnits : 0);
        const nextEth = this.toFiniteNumber(current.balanceEth) + (assetCode === "ETH" ? assetUnits : 0);
        const rows = await prisma.$queryRaw<DbUserRow[]>`
          UPDATE "ClientUser"
          SET
            "balanceUsd" = ${nextUsd},
            "balanceBtc" = ${nextBtc},
            "balanceEth" = ${nextEth},
            "portfolioJson" = ${this.serializePortfolio(nextPortfolio)},
            "updatedAt" = ${new Date()}
          WHERE id = ${id}
          RETURNING
            id,
            email,
            "displayName",
            "passwordHash",
            "avatarUrl",
            "isOwner",
            "balanceUsd",
            "balanceBtc",
            "balanceEth",
            "portfolioJson",
            "isBanned",
            "banReason",
            "bannedAt",
            "createdAt"
        `;

        const updated = rows[0];

        if (!updated) {
          return { error: "User not found", status: 404 };
        }

        return {
          token,
          user: this.toPublicUserFromDb(updated)
        };
      } catch (error) {
        this.warnMemoryFallback(error);
      }
    }

    const fallbackUser = this.memUsersById.get(payload.sub);

    if (!fallbackUser) {
      return { error: "Database is unavailable", status: 503 };
    }

    if (this.isBannedMemoryUser(fallbackUser)) {
      return this.bannedFailure();
    }

    if (this.toFiniteNumber(fallbackUser.wallet.usd) + 1e-9 < normalizedAmountUsd) {
      return { error: "Insufficient USD balance", status: 400 };
    }

    const updated: MemoryUserRow = {
      ...fallbackUser,
      wallet: {
        usd: Math.max(0, this.toFiniteNumber(fallbackUser.wallet.usd) - normalizedAmountUsd),
        btc: this.toFiniteNumber(fallbackUser.wallet.btc) + (assetCode === "BTC" ? assetUnits : 0),
        eth: this.toFiniteNumber(fallbackUser.wallet.eth) + (assetCode === "ETH" ? assetUnits : 0)
      },
      portfolio: this.applyPortfolioBuy(
        fallbackUser.portfolio,
        {
          symbol,
          assetCode,
          amountUsd: normalizedAmountUsd,
          assetUnits
        },
        performedAt
      )
    };

    this.memUsersById.set(updated.id, updated);
    this.memUsersByEmail.set(updated.email, updated);
    this.persistMemoryUsers();

    return {
      token,
      user: this.toPublicUserFromMemory(updated)
    };
  }

  public async sellAsset(
    authorizationHeader: string | undefined,
    input: PortfolioSellInput
  ): Promise<AuthResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const tokenContext = this.parseTokenContext(authorizationHeader);

    if (isFailure(tokenContext)) {
      return tokenContext;
    }

    const symbol = String(input.symbol || "").trim().toUpperCase();
    const assetCode = String(input.assetCode || "").trim().toUpperCase();
    const amountUsd = this.toFiniteNumber(input.amountUsd);
    const assetUnits = this.toFiniteNumber(input.assetUnits);

    if (!symbol || !assetCode) {
      return { error: "Asset symbol is required", status: 400 };
    }

    if (!Number.isFinite(amountUsd) || amountUsd <= 0) {
      return { error: "Trade amount must be greater than 0", status: 400 };
    }

    if (!Number.isFinite(assetUnits) || assetUnits <= 0) {
      return { error: "Asset units must be greater than 0", status: 400 };
    }

    const normalizedAmountUsd = Math.round(amountUsd * 100) / 100;
    const { token, payload } = tokenContext;

    if (payload.mode === "mem") {
      const memUser = this.memUsersById.get(payload.sub);

      if (!memUser) {
        return { error: "User not found", status: 404 };
      }

      if (this.isBannedMemoryUser(memUser)) {
        return this.bannedFailure();
      }

      const hasPortfolioPosition = this.hasPortfolioPosition(memUser.portfolio, symbol);
      let nextPortfolio = this.applyPortfolioSell(memUser.portfolio, input);
      const canUseWalletFallback =
        !nextPortfolio &&
        !hasPortfolioPosition &&
        this.canSellFromWalletOnly(memUser.wallet, assetCode, assetUnits);

      if (canUseWalletFallback) {
        nextPortfolio = this.normalizePortfolioPositions(memUser.portfolio);
      }

      if (!nextPortfolio) {
        return { error: "Insufficient asset balance", status: 400 };
      }

      const updated: MemoryUserRow = {
        ...memUser,
        wallet: {
          usd: this.toFiniteNumber(memUser.wallet.usd) + normalizedAmountUsd,
          btc: assetCode === "BTC" ? Math.max(0, this.toFiniteNumber(memUser.wallet.btc) - assetUnits) : this.toFiniteNumber(memUser.wallet.btc),
          eth: assetCode === "ETH" ? Math.max(0, this.toFiniteNumber(memUser.wallet.eth) - assetUnits) : this.toFiniteNumber(memUser.wallet.eth)
        },
        portfolio: nextPortfolio
      };

      this.memUsersById.set(updated.id, updated);
      this.memUsersByEmail.set(updated.email, updated);
      this.persistMemoryUsers();

      return {
        token,
        user: this.toPublicUserFromMemory(updated)
      };
    }

    const prisma = getPrismaClient();

    if (prisma && this.isNumericId(payload.sub)) {
      try {
        await this.ensureAuthTable(prisma);

        const id = BigInt(payload.sub);
        const current = await this.findUserById(prisma, id);

        if (!current) {
          return { error: "User not found", status: 404 };
        }

        if (this.isBannedDbUser(current)) {
          return this.bannedFailure();
        }

        const currentPortfolio = this.parsePortfolioJson(current.portfolioJson);
        const currentWallet: WalletSnapshot = {
          usd: this.toFiniteNumber(current.balanceUsd),
          btc: this.toFiniteNumber(current.balanceBtc),
          eth: this.toFiniteNumber(current.balanceEth)
        };
        const hasPortfolioPosition = this.hasPortfolioPosition(currentPortfolio, symbol);
        let nextPortfolio = this.applyPortfolioSell(currentPortfolio, input);
        const canUseWalletFallback =
          !nextPortfolio &&
          !hasPortfolioPosition &&
          this.canSellFromWalletOnly(currentWallet, assetCode, assetUnits);

        if (canUseWalletFallback) {
          nextPortfolio = this.normalizePortfolioPositions(currentPortfolio);
        }

        if (!nextPortfolio) {
          return { error: "Insufficient asset balance", status: 400 };
        }

        const nextUsd = this.toFiniteNumber(current.balanceUsd) + normalizedAmountUsd;
        const nextBtc = assetCode === "BTC" ? Math.max(0, this.toFiniteNumber(current.balanceBtc) - assetUnits) : this.toFiniteNumber(current.balanceBtc);
        const nextEth = assetCode === "ETH" ? Math.max(0, this.toFiniteNumber(current.balanceEth) - assetUnits) : this.toFiniteNumber(current.balanceEth);
        const rows = await prisma.$queryRaw<DbUserRow[]>`
          UPDATE "ClientUser"
          SET
            "balanceUsd" = ${nextUsd},
            "balanceBtc" = ${nextBtc},
            "balanceEth" = ${nextEth},
            "portfolioJson" = ${this.serializePortfolio(nextPortfolio)},
            "updatedAt" = ${new Date()}
          WHERE id = ${id}
          RETURNING
            id,
            email,
            "displayName",
            "passwordHash",
            "avatarUrl",
            "isOwner",
            "balanceUsd",
            "balanceBtc",
            "balanceEth",
            "portfolioJson",
            "isBanned",
            "banReason",
            "bannedAt",
            "createdAt"
        `;

        const updated = rows[0];

        if (!updated) {
          return { error: "User not found", status: 404 };
        }

        return {
          token,
          user: this.toPublicUserFromDb(updated)
        };
      } catch (error) {
        this.warnMemoryFallback(error);
      }
    }

    const fallbackUser = this.memUsersById.get(payload.sub);

    if (!fallbackUser) {
      return { error: "Database is unavailable", status: 503 };
    }

    if (this.isBannedMemoryUser(fallbackUser)) {
      return this.bannedFailure();
    }

    const nextPortfolio = this.applyPortfolioSell(fallbackUser.portfolio, input);

    if (!nextPortfolio) {
      return { error: "Insufficient asset balance", status: 400 };
    }

    const updated: MemoryUserRow = {
      ...fallbackUser,
      wallet: {
        usd: this.toFiniteNumber(fallbackUser.wallet.usd) + normalizedAmountUsd,
        btc: assetCode === "BTC" ? Math.max(0, this.toFiniteNumber(fallbackUser.wallet.btc) - assetUnits) : this.toFiniteNumber(fallbackUser.wallet.btc),
        eth: assetCode === "ETH" ? Math.max(0, this.toFiniteNumber(fallbackUser.wallet.eth) - assetUnits) : this.toFiniteNumber(fallbackUser.wallet.eth)
      },
      portfolio: nextPortfolio
    };

    this.memUsersById.set(updated.id, updated);
    this.memUsersByEmail.set(updated.email, updated);
    this.persistMemoryUsers();

    return {
      token,
      user: this.toPublicUserFromMemory(updated)
    };
  }

  public async activateOwnerAccess(
    authorizationHeader: string | undefined,
    setupKeyInput: string
  ): Promise<AuthResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    if (!OWNER_SETUP_KEY) {
      return { error: OWNER_SETUP_DISABLED_MESSAGE, status: 503 };
    }

    const setupKey = String(setupKeyInput || "").trim();

    if (!setupKey) {
      return { error: OWNER_SETUP_KEY_REQUIRED_MESSAGE, status: 400 };
    }

    if (setupKey !== OWNER_SETUP_KEY) {
      return { error: OWNER_SETUP_KEY_INVALID_MESSAGE, status: 403 };
    }

    const tokenContext = this.parseTokenContext(authorizationHeader);

    if (isFailure(tokenContext)) {
      return tokenContext;
    }

    const { payload } = tokenContext;

    const promoteMemoryUser = (user: MemoryUserRow): AuthResult => {
      for (const item of this.memUsersById.values()) {
        const normalized: MemoryUserRow = {
          ...item,
          isOwner: item.id === user.id
        };

        this.memUsersById.set(normalized.id, normalized);
        this.memUsersByEmail.set(normalized.email, normalized);
      }

      const updated = this.memUsersById.get(user.id);

      if (!updated) {
        return { error: "User not found", status: 404 };
      }

      this.persistMemoryUsers();

      return {
        token: this.issueToken(updated.id, updated.email, "mem", true),
        user: this.toPublicUserFromMemory(updated)
      };
    };

    if (payload.mode === "mem") {
      const memUser = this.memUsersById.get(payload.sub);

      if (!memUser) {
        return { error: "User not found", status: 404 };
      }

      if (this.isBannedMemoryUser(memUser)) {
        return this.bannedFailure();
      }

      if (!memUser.isOwner) {
        return { error: OWNER_REQUIRED_MESSAGE, status: 403 };
      }
      return promoteMemoryUser(memUser);
    }

    const prisma = getPrismaClient();

    if (prisma && this.isNumericId(payload.sub)) {
      try {
        await this.ensureAuthTable(prisma);

        const id = BigInt(payload.sub);
        const current = await this.findUserById(prisma, id);

        if (!current) {
          return { error: "User not found", status: 404 };
        }

        if (this.isBannedDbUser(current)) {
          return this.bannedFailure();
        }

        if (!current.isOwner) {
          return { error: OWNER_REQUIRED_MESSAGE, status: 403 };
        }
        await prisma.$executeRaw`
          UPDATE "ClientUser"
          SET "isOwner" = false,
              "updatedAt" = ${new Date()}
          WHERE "isOwner" = true
            AND id <> ${id}
        `;

        const rows = await prisma.$queryRaw<DbUserRow[]>`
          UPDATE "ClientUser"
          SET
            "isOwner" = true,
            "updatedAt" = ${new Date()}
          WHERE id = ${id}
          RETURNING
            id,
            email,
            "displayName",
            "passwordHash",
            "avatarUrl",
            "isOwner",
            "balanceUsd",
            "balanceBtc",
            "balanceEth",
            "portfolioJson",
            "isBanned",
            "banReason",
            "bannedAt",
            "createdAt"
        `;

        const updated = rows[0];

        if (!updated) {
          return { error: "User not found", status: 404 };
        }

        return {
          token: this.issueToken(updated.id.toString(), updated.email, "db", true),
          user: this.toPublicUserFromDb(updated)
        };
      } catch (error) {
        this.warnMemoryFallback(error);
      }
    }

    const fallbackUser = this.memUsersById.get(payload.sub);

    if (!fallbackUser) {
      return { error: "Database is unavailable", status: 503 };
    }

    if (this.isBannedMemoryUser(fallbackUser)) {
      return this.bannedFailure();
    }

    if (!fallbackUser.isOwner) {
      return { error: OWNER_REQUIRED_MESSAGE, status: 403 };
    }
    return promoteMemoryUser(fallbackUser);
  }

  public async requireOwnerAccess(
    authorizationHeader: string | undefined
  ): Promise<AuthOwnerAccessResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const tokenContext = this.parseTokenContext(authorizationHeader);

    if (isFailure(tokenContext)) {
      return tokenContext;
    }

    const { payload } = tokenContext;

    if (payload.mode === "mem") {
      const memUser = this.memUsersById.get(payload.sub);

      if (!memUser) {
        return { error: "User not found", status: 404 };
      }

      if (!memUser.isOwner) {
        return { error: OWNER_REQUIRED_MESSAGE, status: 403 };
      }

      return { ok: true };
    }

    const prisma = getPrismaClient();

    if (prisma && this.isNumericId(payload.sub)) {
      try {
        await this.ensureAuthTable(prisma);
        const user = await this.findUserById(prisma, BigInt(payload.sub));

        if (!user) {
          return { error: "User not found", status: 404 };
        }

        if (!user.isOwner) {
          return { error: OWNER_REQUIRED_MESSAGE, status: 403 };
        }

        return { ok: true };
      } catch (error) {
        this.warnMemoryFallback(error);
      }
    }

    const fallbackUser = this.memUsersById.get(payload.sub);

    if (!fallbackUser) {
      return { error: "User not found", status: 404 };
    }

    if (!fallbackUser.isOwner) {
      return { error: OWNER_REQUIRED_MESSAGE, status: 403 };
    }

    return { ok: true };
  }

  public async listUsers(limitInput: number): Promise<AuthListResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const limit = this.normalizeLimit(limitInput, 200, 1000);
    const prisma = getPrismaClient();

    if (prisma) {
      try {
        await this.ensureAuthTable(prisma);

        const rows = await prisma.$queryRawUnsafe<DbUserRow[]>(`
          SELECT
            id,
            email,
            "displayName",
            "passwordHash",
            "avatarUrl",
            "isOwner",
            "balanceUsd",
            "balanceBtc",
            "balanceEth",
            "portfolioJson",
            "isBanned",
            "banReason",
            "bannedAt",
            "createdAt"
          FROM "ClientUser"
          ORDER BY "createdAt" DESC
          LIMIT ${limit}
        `);

        return {
          users: rows.map((row) => this.toPublicUserFromDb(row))
        };
      } catch (error) {
        this.warnMemoryFallback(error);
      }
    }

    const memUsers = Array.from(this.memUsersById.values())
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())
      .slice(0, limit)
      .map((row) => this.toPublicUserFromMemory(row));

    return { users: memUsers };
  }

  public async getUserById(userIdInput: string): Promise<AuthPublicUser | null> {
    const userId = String(userIdInput || "").trim();

    if (!userId) {
      return null;
    }

    const memUser = this.memUsersById.get(userId);

    if (memUser) {
      return this.toPublicUserFromMemory(memUser);
    }

    if (!this.isNumericId(userId)) {
      return null;
    }

    const prisma = getPrismaClient();

    if (!prisma) {
      return null;
    }

    try {
      await this.ensureAuthTable(prisma);
      const row = await this.findUserById(prisma, BigInt(userId));
      return row ? this.toPublicUserFromDb(row) : null;
    } catch (error) {
      this.warnMemoryFallback(error);
      return null;
    }
  }

  public async adminBanUser(userIdInput: string): Promise<AuthAdminResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const userId = String(userIdInput || "").trim();

    if (!userId) {
      return { error: "Invalid user id", status: 400 };
    }

    const memUser = this.memUsersById.get(userId);

    if (memUser) {
      const updated: MemoryUserRow = {
        ...memUser,
        isBanned: true,
        banReason: BANNED_USER_MESSAGE,
        bannedAt: new Date()
      };

      this.memUsersById.set(updated.id, updated);
      this.memUsersByEmail.set(updated.email, updated);
      this.persistMemoryUsers();
      return { ok: true };
    }

    if (!this.isNumericId(userId)) {
      return { error: "User not found", status: 404 };
    }

    const prisma = getPrismaClient();

    if (!prisma) {
      return { error: "Database is unavailable", status: 503 };
    }

    try {
      await this.ensureAuthTable(prisma);

      const rows = await prisma.$queryRaw<DbUserRow[]>`
        UPDATE "ClientUser"
        SET
          "isBanned" = true,
          "banReason" = ${BANNED_USER_MESSAGE},
          "bannedAt" = ${new Date()},
          "updatedAt" = ${new Date()}
        WHERE id = ${BigInt(userId)}
        RETURNING
          id,
          email,
          "displayName",
          "passwordHash",
          "avatarUrl",
          "isOwner",
          "balanceUsd",
          "balanceBtc",
          "balanceEth",
          "portfolioJson",
          "isBanned",
          "banReason",
          "bannedAt",
          "createdAt"
      `;

      if (!rows.length) {
        return { error: "User not found", status: 404 };
      }

      return { ok: true };
    } catch (error) {
      this.warnMemoryFallback(error);
      return { error: "Database is unavailable", status: 503 };
    }
  }

  public async adminUnbanUser(userIdInput: string): Promise<AuthAdminResult> {
    if (!this.isEnabled()) {
      return { error: "Auth service is unavailable", status: 503 };
    }

    const userId = String(userIdInput || "").trim();

    if (!userId) {
      return { error: "Invalid user id", status: 400 };
    }

    const memUser = this.memUsersById.get(userId);

    if (memUser) {
      const updated: MemoryUserRow = {
        ...memUser,
        isBanned: false,
        banReason: null,
        bannedAt: null
      };

      this.memUsersById.set(updated.id, updated);
      this.memUsersByEmail.set(updated.email, updated);
      this.persistMemoryUsers();
      return { ok: true };
    }

    if (!this.isNumericId(userId)) {
      return { error: "User not found", status: 404 };
    }

    const prisma = getPrismaClient();

    if (!prisma) {
      return { error: "Database is unavailable", status: 503 };
    }

    try {
      await this.ensureAuthTable(prisma);

      const rows = await prisma.$queryRaw<DbUserRow[]>`
        UPDATE "ClientUser"
        SET
          "isBanned" = false,
          "banReason" = NULL,
          "bannedAt" = NULL,
          "updatedAt" = ${new Date()}
        WHERE id = ${BigInt(userId)}
        RETURNING
          id,
          email,
          "displayName",
          "passwordHash",
          "avatarUrl",
          "isOwner",
          "balanceUsd",
          "balanceBtc",
          "balanceEth",
          "portfolioJson",
          "isBanned",
          "banReason",
          "bannedAt",
          "createdAt"
      `;

      if (!rows.length) {
        return { error: "User not found", status: 404 };
      }

      return { ok: true };
    } catch (error) {
      this.warnMemoryFallback(error);
      return { error: "Database is unavailable", status: 503 };
    }
  }

  private async registerInMemory(
    email: string,
    password: string,
    displayName: string
  ): Promise<AuthResult> {
    const existing = this.memUsersByEmail.get(email);

    if (existing) {
      return { error: "Email is already registered", status: 409 };
    }

    const passwordHash = await bcrypt.hash(password, 10);
    const id = `mem_${this.memSeq++}`;
    const createdAt = new Date();

    const user: MemoryUserRow = {
      id,
      email,
      displayName,
      passwordHash,
      avatarUrl: null,
      isOwner: !this.memoryOwnerExists(),
      wallet: this.buildInitialWallet(),
      portfolio: this.buildInitialPortfolio(),
      isBanned: false,
      banReason: null,
      bannedAt: null,
      createdAt
    };

    this.memUsersById.set(id, user);
    this.memUsersByEmail.set(email, user);
    this.persistMemoryUsers();

    return {
      token: this.issueToken(user.id, user.email, "mem", user.isOwner),
      user: this.toPublicUserFromMemory(user)
    };
  }

  private async loginInMemory(email: string, password: string): Promise<AuthResult> {
    const user = this.memUsersByEmail.get(email);

    if (!user) {
      return { error: "Invalid credentials", status: 401 };
    }

    if (this.isBannedMemoryUser(user)) {
      return this.bannedFailure();
    }

    const validPassword = await bcrypt.compare(password, user.passwordHash);

    if (!validPassword) {
      return { error: "Invalid credentials", status: 401 };
    }

    return {
      token: this.issueToken(user.id, user.email, "mem", user.isOwner),
      user: this.toPublicUserFromMemory(user)
    };
  }

  private async ensureAuthTable(prisma: PrismaClient): Promise<void> {
    if (this.authTableEnsured) {
      return;
    }

    await prisma.$executeRawUnsafe(`
      CREATE TABLE IF NOT EXISTS "ClientUser" (
        id BIGSERIAL PRIMARY KEY,
        email VARCHAR(190) UNIQUE NOT NULL,
        "passwordHash" VARCHAR(255) NOT NULL,
        "displayName" VARCHAR(80) NOT NULL,
        "avatarUrl" TEXT,
        "isOwner" BOOLEAN NOT NULL DEFAULT FALSE,
        "balanceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "balanceBtc" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "balanceEth" DOUBLE PRECISION NOT NULL DEFAULT 0,
        "portfolioJson" TEXT NOT NULL DEFAULT '[]',
        "isBanned" BOOLEAN NOT NULL DEFAULT FALSE,
        "banReason" TEXT,
        "bannedAt" TIMESTAMP(3),
        "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
      );
    `);

    await prisma.$executeRawUnsafe('ALTER TABLE "ClientUser" ADD COLUMN IF NOT EXISTS "avatarUrl" TEXT;');
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ClientUser" ADD COLUMN IF NOT EXISTS "balanceUsd" DOUBLE PRECISION NOT NULL DEFAULT 0;'
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ClientUser" ADD COLUMN IF NOT EXISTS "balanceBtc" DOUBLE PRECISION NOT NULL DEFAULT 0;'
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ClientUser" ADD COLUMN IF NOT EXISTS "balanceEth" DOUBLE PRECISION NOT NULL DEFAULT 0;'
    );
    await prisma.$executeRawUnsafe(
      "ALTER TABLE \"ClientUser\" ADD COLUMN IF NOT EXISTS \"portfolioJson\" TEXT NOT NULL DEFAULT '[]';"
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ClientUser" ADD COLUMN IF NOT EXISTS "isOwner" BOOLEAN NOT NULL DEFAULT FALSE;'
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ClientUser" ADD COLUMN IF NOT EXISTS "isBanned" BOOLEAN NOT NULL DEFAULT FALSE;'
    );
    await prisma.$executeRawUnsafe('ALTER TABLE "ClientUser" ADD COLUMN IF NOT EXISTS "banReason" TEXT;');
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ClientUser" ADD COLUMN IF NOT EXISTS "bannedAt" TIMESTAMP(3);'
    );
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ClientUser" ADD COLUMN IF NOT EXISTS "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;'
    );

    await prisma.$executeRawUnsafe('ALTER TABLE "ClientUser" ALTER COLUMN "balanceUsd" SET DEFAULT 0;');
    await prisma.$executeRawUnsafe('ALTER TABLE "ClientUser" ALTER COLUMN "balanceBtc" SET DEFAULT 0;');
    await prisma.$executeRawUnsafe('ALTER TABLE "ClientUser" ALTER COLUMN "balanceEth" SET DEFAULT 0;');
    await prisma.$executeRawUnsafe("ALTER TABLE \"ClientUser\" ALTER COLUMN \"portfolioJson\" SET DEFAULT '[]';");
    await prisma.$executeRawUnsafe(
      "UPDATE \"ClientUser\" SET \"portfolioJson\" = '[]' WHERE COALESCE(BTRIM(\"portfolioJson\"), '') = '';"
    );

    await this.assignDbOwnerIfMissing(prisma);

    this.authTableEnsured = true;
  }

  private async findUserByEmail(prisma: PrismaClient, email: string): Promise<DbUserRow | null> {
    const rows = await prisma.$queryRaw<DbUserRow[]>`
      SELECT
        id,
        email,
        "displayName",
        "passwordHash",
        "avatarUrl",
        "isOwner",
        "balanceUsd",
        "balanceBtc",
        "balanceEth",
        "portfolioJson",
        "isBanned",
        "banReason",
        "bannedAt",
        "createdAt"
      FROM "ClientUser"
      WHERE email = ${email}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  private async findUserById(prisma: PrismaClient, id: bigint): Promise<DbUserRow | null> {
    const rows = await prisma.$queryRaw<DbUserRow[]>`
      SELECT
        id,
        email,
        "displayName",
        "passwordHash",
        "avatarUrl",
        "isOwner",
        "balanceUsd",
        "balanceBtc",
        "balanceEth",
        "portfolioJson",
        "isBanned",
        "banReason",
        "bannedAt",
        "createdAt"
      FROM "ClientUser"
      WHERE id = ${id}
      LIMIT 1
    `;

    return rows[0] ?? null;
  }

  private loadMemoryUsersFromDisk(): void {
    try {
      if (!fs.existsSync(this.memStoragePath)) {
        return;
      }

      const raw = fs.readFileSync(this.memStoragePath, "utf8");

      if (!raw.trim()) {
        return;
      }

      const parsed = JSON.parse(raw) as { users?: PersistedMemoryUserRow[] };
      const users = Array.isArray(parsed?.users) ? parsed.users : [];

      let maxSeq = 0;

      for (const item of users) {
        if (!item || typeof item !== "object") {
          continue;
        }

        const id = String(item.id || "").trim();
        const email = String(item.email || "").trim().toLowerCase();
        const displayName = String(item.displayName || "").trim();
        const passwordHash = String(item.passwordHash || "").trim();

        if (!id || !email || !displayName || !passwordHash) {
          continue;
        }

        const createdAt = new Date(item.createdAt);
        const bannedAt = item.bannedAt ? new Date(item.bannedAt) : null;

        const restored: MemoryUserRow = {
          id,
          email,
          displayName,
          passwordHash,
          avatarUrl: typeof item.avatarUrl === "string" && item.avatarUrl.trim() ? item.avatarUrl.trim() : null,
          isOwner: Boolean(item.isOwner),
          wallet: {
            usd: this.toFiniteNumber(item.wallet?.usd),
            btc: this.toFiniteNumber(item.wallet?.btc),
            eth: this.toFiniteNumber(item.wallet?.eth)
          },
            portfolio: this.normalizePortfolioPositions(item.portfolio),
          isBanned: Boolean(item.isBanned),
          banReason: typeof item.banReason === "string" ? item.banReason : null,
          bannedAt: bannedAt && Number.isFinite(bannedAt.getTime()) ? bannedAt : null,
          createdAt: Number.isFinite(createdAt.getTime()) ? createdAt : new Date()
        };

        this.memUsersById.set(restored.id, restored);
        this.memUsersByEmail.set(restored.email, restored);

        const seqMatch = /^mem_(\d+)$/.exec(restored.id);

        if (seqMatch) {
          maxSeq = Math.max(maxSeq, Number.parseInt(seqMatch[1], 10));
        }
      }

      this.memSeq = Math.max(this.memSeq, maxSeq + 1);

      if (!this.memoryOwnerExists()) {
        const firstUser = Array.from(this.memUsersById.values()).sort(
          (a, b) => a.createdAt.getTime() - b.createdAt.getTime()
        )[0];

        if (firstUser) {
          firstUser.isOwner = true;
          this.memUsersById.set(firstUser.id, firstUser);
          this.memUsersByEmail.set(firstUser.email, firstUser);
        }
      }
    } catch (error) {
      logger.warn("[auth] Failed to restore in-memory users from disk:", error);
    }
  }

  private persistMemoryUsers(): void {
    try {
      const directory = path.dirname(this.memStoragePath);
      fs.mkdirSync(directory, { recursive: true });

      const users: PersistedMemoryUserRow[] = Array.from(this.memUsersById.values()).map((user) => ({
        id: user.id,
        email: user.email,
        displayName: user.displayName,
        passwordHash: user.passwordHash,
        avatarUrl: user.avatarUrl,
        isOwner: Boolean(user.isOwner),
        wallet: {
          usd: this.toFiniteNumber(user.wallet.usd),
          btc: this.toFiniteNumber(user.wallet.btc),
          eth: this.toFiniteNumber(user.wallet.eth)
        },
        portfolio: this.normalizePortfolioPositions(user.portfolio),
        isBanned: Boolean(user.isBanned),
        banReason: user.banReason,
        bannedAt: user.bannedAt ? user.bannedAt.toISOString() : null,
        createdAt: user.createdAt.toISOString()
      }));

      fs.writeFileSync(this.memStoragePath, JSON.stringify({ users }, null, 2), "utf8");
    } catch (error) {
      logger.warn("[auth] Failed to persist in-memory users:", error);
    }
  }
  private normalizeLimit(limitInput: number, fallback: number, max: number): number {
    if (!Number.isFinite(limitInput) || limitInput <= 0) {
      return fallback;
    }

    return Math.min(Math.floor(limitInput), max);
  }

  private toPublicUserFromDb(row: DbUserRow): AuthPublicUser {
    return {
      id: row.id.toString(),
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      isOwner: Boolean(row.isOwner),
      wallet: {
        usd: this.toFiniteNumber(row.balanceUsd),
        btc: this.toFiniteNumber(row.balanceBtc),
        eth: this.toFiniteNumber(row.balanceEth)
      },
      portfolio: this.parsePortfolioJson(row.portfolioJson),
      isBanned: Boolean(row.isBanned),
      banReason: row.banReason,
      bannedAt: row.bannedAt ? row.bannedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString()
    };
  }

  private toPublicUserFromMemory(row: MemoryUserRow): AuthPublicUser {
    return {
      id: row.id,
      email: row.email,
      displayName: row.displayName,
      avatarUrl: row.avatarUrl,
      isOwner: Boolean(row.isOwner),
      wallet: {
        usd: this.toFiniteNumber(row.wallet.usd),
        btc: this.toFiniteNumber(row.wallet.btc),
        eth: this.toFiniteNumber(row.wallet.eth)
      },
      portfolio: this.normalizePortfolioPositions(row.portfolio),
      isBanned: Boolean(row.isBanned),
      banReason: row.banReason,
      bannedAt: row.bannedAt ? row.bannedAt.toISOString() : null,
      createdAt: row.createdAt.toISOString()
    };
  }

  private extractBearerToken(authorizationHeader: string | undefined): string | null {
    if (!authorizationHeader) {
      return null;
    }

    const [scheme, token] = authorizationHeader.split(" ");

    if (!scheme || !token || scheme.toLowerCase() !== "bearer") {
      return null;
    }

    return token;
  }

  private parseTokenContext(authorizationHeader: string | undefined): TokenContext | AuthFailure {
    const token = this.extractBearerToken(authorizationHeader);

    if (!token) {
      return { error: "Missing bearer token", status: 401 };
    }

    const payload = this.verifyToken(token);

    if (!payload || !payload.sub) {
      return { error: "Invalid or expired token", status: 401 };
    }

    return {
      token,
      payload
    };
  }

  private verifyToken(token: string): TokenPayload | null {
    try {
      return jwt.verify(token, this.jwtSecret) as TokenPayload;
    } catch {
      return null;
    }
  }

  private issueToken(userId: string, email: string, mode: TokenMode, isOwner = false): string {
    return jwt.sign({ sub: userId, email, mode, isOwner }, this.jwtSecret, {
      expiresIn: "7d"
    });
  }

  private isNumericId(input: string): boolean {
    return /^\d+$/.test(input);
  }

  private validateEmail(email: string): string | null {
    if (!email || !EMAIL_RE.test(email)) {
      return "Invalid email";
    }

    if (email.length > 190) {
      return "Invalid email";
    }

    return null;
  }

  private validatePassword(password: string): string | null {
    if (password.length < 8 || !/[A-Za-z]/.test(password) || !/\d/.test(password)) {
      return "Password must contain at least 8 characters, letters and digits";
    }

    return null;
  }

  private validateDisplayName(displayName: string): string | null {
    if (!displayName || !DISPLAY_NAME_RE.test(displayName)) {
      return "Display name must be 2-40 chars (letters, numbers, spaces, _.-)";
    }

    return null;
  }

  private validateAvatarUrlInput(input: string | null | undefined): {
    value: string | null;
    error: string | null;
  } {
    if (input === undefined) {
      return { value: null, error: null };
    }

    if (input === null) {
      return { value: null, error: null };
    }

    const raw = String(input).trim();

    if (!raw) {
      return { value: null, error: null };
    }

    const commaIdx = raw.indexOf(",");

    if (commaIdx < 0) {
      return {
        value: null,
        error: "Avatar must be an image data URL (png/jpg/webp/gif) up to 2MB"
      };
    }

    const header = raw.slice(0, commaIdx);
    const payload = raw.slice(commaIdx + 1);

    if (!AVATAR_MIME_RE.test(header) || !payload || !BASE64_RE.test(payload)) {
      return {
        value: null,
        error: "Avatar must be an image data URL (png/jpg/webp/gif) up to 2MB"
      };
    }

    if (raw.length > 2_000_000) {
      return {
        value: null,
        error: "Avatar must be an image data URL (png/jpg/webp/gif) up to 2MB"
      };
    }

    return {
      value: raw,
      error: null
    };
  }

  private async resolveResetTarget(email: string): Promise<ResetTarget | AuthFailure | null> {
    const prisma = getPrismaClient();

    if (prisma) {
      try {
        await this.ensureAuthTable(prisma);
        const dbUser = await this.findUserByEmail(prisma, email);

        if (dbUser) {
          return {
            mode: "db",
            user: dbUser
          };
        }
      } catch (error) {
        this.warnMemoryFallback(error);
      }
    }

    const memUser = this.memUsersByEmail.get(email);

    if (!memUser) {
      return null;
    }

    return {
      mode: "mem",
      user: memUser
    };
  }

  private generateResetCode(): string {
    return crypto.randomInt(0, 1_000_000).toString().padStart(6, "0");
  }

  private hashResetCode(email: string, code: string): string {
    return crypto
      .createHash("sha256")
      .update(`${this.jwtSecret}:${email}:${code}`)
      .digest("hex");
  }

  private isValidResetCodeFormat(code: string): boolean {
    return /^\d{6}$/.test(code);
  }

  private async sendResetCodeEmail(email: string, code: string): Promise<ResetEmailDelivery> {
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
    const looksLikeGmailSmtp =
      normalizedHost.includes("gmail") || normalizedHost.includes("googlemail");
    const useOAuth2 =
      authMode === "oauth2" ||
      (looksLikeGmailSmtp && !pass) ||
      Boolean(oauthClientId) ||
      Boolean(oauthClientSecret) ||
      Boolean(oauthRefreshToken);

    if (!host || !user) {
      logger.error("[auth] SMTP credentials are not configured", {
        hostConfigured: Boolean(host),
        userConfigured: Boolean(user),
        passConfigured: Boolean(pass),
        oauthConfigured: Boolean(oauthClientId && oauthClientSecret && oauthRefreshToken)
      });
      throw new Error("SMTP credentials are not configured");
    }

    const port = parsePositiveInt(pickEnv("AUTH_RESET_SMTP_PORT", "SMTP_PORT", "MAIL_PORT"), 587);
    const secureRaw = pickEnv("AUTH_RESET_SMTP_SECURE", "SMTP_SECURE", "MAIL_SECURE").toLowerCase();
    const secure = secureRaw ? secureRaw === "true" || secureRaw === "1" : port === 465;

    let transporter;

    if (useOAuth2) {
      if (!oauthClientId || !oauthClientSecret || !oauthRefreshToken) {
        logger.error("[auth] SMTP OAuth2 is not configured", {
          clientIdConfigured: Boolean(oauthClientId),
          clientSecretConfigured: Boolean(oauthClientSecret),
          refreshTokenConfigured: Boolean(oauthRefreshToken)
        });
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
        logger.error("[auth] SMTP credentials are not configured", {
          hostConfigured: Boolean(host),
          userConfigured: Boolean(user),
          passConfigured: Boolean(pass)
        });
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
    const ttlMinutes = Math.max(1, Math.round(PASSWORD_RESET_CODE_TTL_MS / 60_000));
    const requestTime = new Date().toLocaleString("uk-UA", {
      dateStyle: "medium",
      timeStyle: "short"
    });
    const intro =
      "\u0412\u0438 \u043e\u0442\u0440\u0438\u043c\u0430\u043b\u0438 \u0437\u0430\u043f\u0438\u0442 \u043d\u0430 \u0432\u0456\u0434\u043d\u043e\u0432\u043b\u0435\u043d\u043d\u044f \u043f\u0430\u0440\u043e\u043b\u044f \u0434\u043b\u044f \u0430\u043a\u0430\u0443\u043d\u0442\u0430 CryptoAggregator.";
    const codeLine = `\u041a\u043e\u0434 \u043f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u043d\u044f: ${code}`;
    const ttlLine = `\u041a\u043e\u0434 \u0434\u0456\u0439\u0441\u043d\u0438\u0439 \u043f\u0440\u0438\u0431\u043b\u0438\u0437\u043d\u043e ${ttlMinutes} \u0445\u0432\u0438\u043b\u0438\u043d.`;
    const accountLine = `Email \u0430\u043a\u0430\u0443\u043d\u0442\u0430: ${email}`;
    const requestTimeLine = `\u0427\u0430\u0441 \u0437\u0430\u043f\u0438\u0442\u0443: ${requestTime}`;
    const safetyLine =
      "\u041d\u0435 \u043f\u0435\u0440\u0435\u0434\u0430\u0432\u0430\u0439\u0442\u0435 \u0446\u0435\u0439 \u043a\u043e\u0434 \u0456\u043d\u0448\u0438\u043c \u043b\u044e\u0434\u044f\u043c, \u043d\u0430\u0432\u0456\u0442\u044c \u044f\u043a\u0449\u043e \u0432\u043e\u043d\u0438 \u043d\u0430\u0437\u0438\u0432\u0430\u044e\u0442\u044c\u0441\u044f \u043f\u0456\u0434\u0442\u0440\u0438\u043c\u043a\u043e\u044e.";
    const outro =
      "\u042f\u043a\u0449\u043e \u0432\u0438 \u043d\u0435 \u043d\u0430\u0434\u0441\u0438\u043b\u0430\u043b\u0438 \u0446\u0435\u0439 \u0437\u0430\u043f\u0438\u0442, \u043f\u0440\u043e\u0441\u0442\u043e \u043f\u0440\u043e\u0456\u0433\u043d\u043e\u0440\u0443\u0439\u0442\u0435 \u0446\u0435\u0439 \u043b\u0438\u0441\u0442.";
    const escapedCode = escapeHtml(code);
    const escapedEmail = escapeHtml(email);
    const escapedRequestTime = escapeHtml(requestTime);
    const textBody = [intro, codeLine, ttlLine, accountLine, requestTimeLine, safetyLine, outro].join("\n");
    const htmlBody = `
        <div style="margin:0;padding:24px;background:#f4f7fb;font-family:Segoe UI,Arial,sans-serif;color:#14213d;">
          <div style="max-width:560px;margin:0 auto;background:#ffffff;border:1px solid #dce7f5;border-radius:16px;overflow:hidden;">
            <div style="padding:20px 24px;background:#14213d;color:#ffffff;">
              <div style="font-size:12px;letter-spacing:0.08em;text-transform:uppercase;opacity:0.75;">CryptoAggregator</div>
              <div style="margin-top:8px;font-size:24px;font-weight:700;">Код відновлення пароля</div>
            </div>
            <div style="padding:24px;">
              <p style="margin:0 0 16px 0;line-height:1.6;">${intro}</p>
              <div style="margin:0 0 16px 0;padding:16px;border-radius:12px;background:#eef5ff;border:1px solid #cfe0ff;">
                <div style="font-size:13px;color:#52627a;margin-bottom:6px;">Код підтвердження</div>
                <div style="font-size:32px;font-weight:800;letter-spacing:0.16em;color:#0f172a;">${escapedCode}</div>
              </div>
              <p style="margin:0 0 8px 0;line-height:1.6;">${ttlLine}</p>
              <p style="margin:0 0 8px 0;line-height:1.6;"><strong>Email акаунта:</strong> ${escapedEmail}</p>
              <p style="margin:0 0 16px 0;line-height:1.6;"><strong>Час запиту:</strong> ${escapedRequestTime}</p>
              <p style="margin:0 0 16px 0;line-height:1.6;">${safetyLine}</p>
              <p style="margin:0;line-height:1.6;color:#52627a;">${outro}</p>
            </div>
          </div>
        </div>`;

    if (this.shouldUseResendApi(normalizedHost, pass)) {
      return this.sendResetCodeViaResendApi({
        from,
        replyTo,
        to: email,
        subject: PASSWORD_RESET_EMAIL_SUBJECT,
        text: textBody,
        html: htmlBody,
        apiKey: pickEnv("AUTH_RESET_RESEND_API_KEY", "RESEND_API_KEY") || pass
      });
    }

    const info = await transporter.sendMail({
      from,
      replyTo,
      to: email,
      subject: PASSWORD_RESET_EMAIL_SUBJECT,
      headers: {
        "X-Auto-Response-Suppress": "OOF, AutoReply"
      },
      text: textBody,
      html: htmlBody
    });

    const rejected = Array.isArray(info.rejected) ? info.rejected.map(String).filter(Boolean) : [];

    if (rejected.length) {
      logger.error("[auth] Password reset email was rejected by SMTP provider", {
        to: email,
        rejected,
        response: info.response
      });
      throw new Error("Password reset email was rejected by SMTP provider");
    }

    logger.info("[auth] Password reset email accepted by SMTP provider", {
      to: email,
      messageId: info.messageId,
      accepted: Array.isArray(info.accepted) ? info.accepted : [],
      response: info.response
    });

    return {
      provider: "smtp",
      id: info.messageId,
      to: email,
      from
    };
  }

  private shouldUseResendApi(normalizedHost: string, smtpPass: string): boolean {
    const explicitApiKey = pickEnv("AUTH_RESET_RESEND_API_KEY", "RESEND_API_KEY");
    return Boolean(explicitApiKey) || (normalizedHost.includes("resend") && smtpPass.startsWith("re_"));
  }

  private async sendResetCodeViaResendApi(input: {
    apiKey: string;
    from: string;
    replyTo?: string;
    to: string;
    subject: string;
    text: string;
    html: string;
  }): Promise<ResetEmailDelivery> {
    if (!input.apiKey) {
      throw new Error("Resend API key is not configured");
    }

    const response = await fetch("https://api.resend.com/emails", {
      method: "POST",
      headers: {
        Authorization: `Bearer ${input.apiKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        from: input.from,
        to: [input.to],
        subject: input.subject,
        text: input.text,
        html: input.html,
        reply_to: input.replyTo || undefined,
        headers: {
          "X-Auto-Response-Suppress": "OOF, AutoReply"
        }
      })
    });

    const payload = (await response.json().catch(() => null)) as { id?: string; message?: string; name?: string } | null;

    if (!response.ok || !payload?.id) {
      logger.error("[auth] Resend API failed to create password reset email", {
        to: input.to,
        status: response.status,
        payload
      });
      throw new Error(payload?.message || "Password reset email service is unavailable");
    }

    logger.info("[auth] Password reset email accepted by Resend API", {
      to: input.to,
      resendEmailId: payload.id
    });

    return {
      provider: "resend",
      id: payload.id,
      to: input.to,
      from: input.from
    };
  }

  private buildGmailComposeUrl(email: string, code: string): string {
    const ttlMinutes = Math.max(1, Math.round(PASSWORD_RESET_CODE_TTL_MS / 60_000));
    const bodyLines = [
      "\u0412\u0438 \u043e\u0442\u0440\u0438\u043c\u0430\u043b\u0438 \u0437\u0430\u043f\u0438\u0442 \u043d\u0430 \u0432\u0456\u0434\u043d\u043e\u0432\u043b\u0435\u043d\u043d\u044f \u043f\u0430\u0440\u043e\u043b\u044f \u0434\u043b\u044f \u0430\u043a\u0430\u0443\u043d\u0442\u0430 CryptoAggregator.",
      "",
      `\u041a\u043e\u0434 \u043f\u0456\u0434\u0442\u0432\u0435\u0440\u0434\u0436\u0435\u043d\u043d\u044f: ${code}`,
      `\u041a\u043e\u0434 \u0434\u0456\u0439\u0441\u043d\u0438\u0439 \u043f\u0440\u0438\u0431\u043b\u0438\u0437\u043d\u043e ${ttlMinutes} \u0445\u0432\u0438\u043b\u0438\u043d.`,
      "",
      "\u041d\u0430\u0434\u0456\u0448\u043b\u0456\u0442\u044c \u0446\u0435\u0439 \u043b\u0438\u0441\u0442 \u0441\u0430\u043c\u0456 \u0441\u043e\u0431\u0456 \u0443 Gmail, \u0430 \u043f\u043e\u0442\u0456\u043c \u0432\u0432\u0435\u0434\u0456\u0442\u044c \u043a\u043e\u0434 \u0443 \u0444\u043e\u0440\u043c\u0456 \u043d\u0430 \u0441\u0430\u0439\u0442\u0456."
    ];

    const composeUrl = new URL("https://mail.google.com/mail/");
    composeUrl.searchParams.set("view", "cm");
    composeUrl.searchParams.set("fs", "1");
    composeUrl.searchParams.set("tf", "1");
    composeUrl.searchParams.set("to", email);
    composeUrl.searchParams.set("su", PASSWORD_RESET_EMAIL_SUBJECT);
    composeUrl.searchParams.set("body", bodyLines.join("\n"));
    return composeUrl.toString();
  }

  private buildInitialWallet(): WalletSnapshot {
    return {
      usd: 0,
      btc: 0,
      eth: 0
    };
  }

  private buildInitialPortfolio(): PortfolioPositionSnapshot[] {
    return [];
  }

  private parsePortfolioJson(value: string | null | undefined): PortfolioPositionSnapshot[] {
    if (typeof value !== "string" || !value.trim()) {
      return [];
    }

    try {
      const parsed = JSON.parse(value);
      return this.normalizePortfolioPositions(parsed);
    } catch {
      return [];
    }
  }

  private normalizePortfolioPositions(input: unknown): PortfolioPositionSnapshot[] {
    if (!Array.isArray(input)) {
      return [];
    }

    return input
      .map((item) => this.normalizePortfolioPosition(item))
      .filter((item): item is PortfolioPositionSnapshot => Boolean(item));
  }

  private normalizePortfolioPosition(input: unknown): PortfolioPositionSnapshot | null {
    if (!input || typeof input !== "object") {
      return null;
    }

    const record = input as {
      symbol?: unknown;
      assetCode?: unknown;
      amount?: unknown;
      investedUsd?: unknown;
      averageBuyPriceUsd?: unknown;
      lastBuyAt?: unknown;
    };
    const symbol = String(record.symbol || "").trim().toUpperCase();
    const assetCode = String(record.assetCode || "").trim().toUpperCase();
    const amount = this.toFiniteNumber(record.amount);
    const investedUsd = this.toFiniteNumber(record.investedUsd);
    const averageBuyPriceUsd = this.toFiniteNumber(record.averageBuyPriceUsd);
    const lastBuyAtRaw = String(record.lastBuyAt || "").trim();
    const parsedDate = lastBuyAtRaw ? new Date(lastBuyAtRaw) : null;

    if (!symbol || !assetCode || amount <= 0 || investedUsd < 0) {
      return null;
    }

    return {
      symbol,
      assetCode,
      amount,
      investedUsd,
      averageBuyPriceUsd: averageBuyPriceUsd > 0 ? averageBuyPriceUsd : investedUsd / amount,
      lastBuyAt: parsedDate && Number.isFinite(parsedDate.getTime()) ? parsedDate.toISOString() : new Date().toISOString()
    };
  }

  private serializePortfolio(positions: PortfolioPositionSnapshot[]): string {
    return JSON.stringify(this.normalizePortfolioPositions(positions));
  }

  private hasPortfolioPosition(currentPositions: PortfolioPositionSnapshot[], symbol: string): boolean {
    const normalizedSymbol = String(symbol || "").trim().toUpperCase();
    return this.normalizePortfolioPositions(currentPositions).some((item) => item.symbol === normalizedSymbol);
  }

  private canSellFromWalletOnly(wallet: WalletSnapshot, assetCode: string, assetUnits: number): boolean {
    const normalizedAsset = String(assetCode || "").trim().toUpperCase();
    const requestedUnits = this.toFiniteNumber(assetUnits);

    if (!Number.isFinite(requestedUnits) || requestedUnits <= 0) {
      return false;
    }

    if (normalizedAsset === "BTC") {
      return requestedUnits <= this.toFiniteNumber(wallet.btc) + 1e-9;
    }

    if (normalizedAsset === "ETH") {
      return requestedUnits <= this.toFiniteNumber(wallet.eth) + 1e-9;
    }

    return false;
  }

  private applyPortfolioBuy(
    currentPositions: PortfolioPositionSnapshot[],
    input: PortfolioBuyInput,
    performedAtIso: string
  ): PortfolioPositionSnapshot[] {
    const positions = this.normalizePortfolioPositions(currentPositions);
    const existingIndex = positions.findIndex((item) => item.symbol === input.symbol);

    if (existingIndex < 0) {
      return [
        ...positions,
        {
          symbol: input.symbol,
          assetCode: input.assetCode,
          amount: input.assetUnits,
          investedUsd: input.amountUsd,
          averageBuyPriceUsd: input.amountUsd / input.assetUnits,
          lastBuyAt: performedAtIso
        }
      ];
    }

    const existing = positions[existingIndex];
    const nextAmount = existing.amount + input.assetUnits;
    const nextInvestedUsd = existing.investedUsd + input.amountUsd;
    const updated: PortfolioPositionSnapshot = {
      ...existing,
      amount: nextAmount,
      investedUsd: nextInvestedUsd,
      averageBuyPriceUsd: nextAmount > 0 ? nextInvestedUsd / nextAmount : existing.averageBuyPriceUsd,
      lastBuyAt: performedAtIso
    };

    return positions.map((item, index) => (index === existingIndex ? updated : item));
  }

  private applyPortfolioSell(
    currentPositions: PortfolioPositionSnapshot[],
    input: PortfolioSellInput
  ): PortfolioPositionSnapshot[] | null {
    const positions = this.normalizePortfolioPositions(currentPositions);
    const existingIndex = positions.findIndex((item) => item.symbol === input.symbol);

    if (existingIndex < 0) {
      return null;
    }

    const existing = positions[existingIndex];
    const sellUnits = this.toFiniteNumber(input.assetUnits);

    if (!Number.isFinite(sellUnits) || sellUnits <= 0 || sellUnits > existing.amount + 1e-9) {
      return null;
    }

    const remainingAmount = Math.max(0, existing.amount - sellUnits);

    if (remainingAmount <= 1e-9) {
      return positions.filter((_item, index) => index !== existingIndex);
    }

    const sellRatio = Math.min(1, sellUnits / existing.amount);
    const remainingInvestedUsd = Math.max(0, existing.investedUsd * (1 - sellRatio));
    const updated: PortfolioPositionSnapshot = {
      ...existing,
      amount: remainingAmount,
      investedUsd: remainingInvestedUsd,
      averageBuyPriceUsd: remainingAmount > 0 ? remainingInvestedUsd / remainingAmount : existing.averageBuyPriceUsd
    };

    return positions.map((item, index) => (index === existingIndex ? updated : item));
  }

  private async dbOwnerExists(prisma: PrismaClient): Promise<boolean> {
    const rows = await prisma.$queryRaw<{ count: bigint }[]>`
      SELECT COUNT(*)::bigint AS count
      FROM "ClientUser"
      WHERE "isOwner" = true
    `;

    const value = rows[0]?.count;
    const count = typeof value === "bigint" ? Number(value) : Number(value || 0);
    return Number.isFinite(count) && count > 0;
  }

  private async assignDbOwnerIfMissing(prisma: PrismaClient): Promise<void> {
    if (await this.dbOwnerExists(prisma)) {
      return;
    }

    await prisma.$executeRawUnsafe(`
      UPDATE "ClientUser"
      SET "isOwner" = true,
          "updatedAt" = CURRENT_TIMESTAMP
      WHERE id = (
        SELECT id
        FROM "ClientUser"
        ORDER BY "createdAt" ASC, id ASC
        LIMIT 1
      );
    `);
  }

  private memoryOwnerExists(): boolean {
    return Array.from(this.memUsersById.values()).some((user) => Boolean(user.isOwner));
  }

  private toFiniteNumber(value: unknown): number {
    const numeric = Number(value);
    return Number.isFinite(numeric) ? numeric : 0;
  }

  private isBannedDbUser(user: DbUserRow): boolean {
    return Boolean(user.isBanned);
  }

  private isBannedMemoryUser(user: MemoryUserRow): boolean {
    return Boolean(user.isBanned);
  }

  private bannedFailure(): AuthFailure {
    return { error: BANNED_USER_MESSAGE, status: 403 };
  }

  private warnMemoryFallback(error: unknown): void {
    if (this.warnedDbFallback) {
      return;
    }

    this.warnedDbFallback = true;
    logger.warn("[auth] DB unavailable, switched to in-memory auth mode:", error);
  }
}
































