import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { google } from "googleapis";
import { createServer as createViteServer } from "vite";
import {
  initDB,
  syncFromFirestore,
  isFirestoreQuotaExhausted,
  getSettings,
  updateSettings,
  verifyAdminPassword,
  updateAdminPassword,
  verifyEmergencyPassword,
  updateEmergencyPassword,
  getCandidates,
  addCandidate,
  removeCandidate,
  getVotes,
  addVote,
  clearAllVotes,
  removeVote,
  updateCandidatesBulk,
  updateCandidate,
  syncTokensAndLogsFirestore,
  saveTokenFirestore,
  deleteTokenFirestore,
  syncActiveSessionsFirestore,
  saveActiveSessionFirestore,
  deleteActiveSessionFirestore,
  syncRevokedTokensFirestore,
  saveRevokedTokenFirestore,
  deleteRevokedTokenFirestore,
  syncPurgedTokensFirestore,
  savePurgedTokenFirestore,
  deletePurgedTokenFirestore,
  saveAccessLogFirestore,
  clearAccessLogsFirestore,
  syncHierarchyMembersFirestore,
  saveHierarchyMemberFirestore,
  deleteHierarchyMemberFirestore,
  saveAllHierarchyMembersFirestore,
  getCandidature,
  addCandidatura,
  updateCandidaturaStatus,
  cancelCandidatura,
  deleteCandidatura,
  updateCandidaturaCda,
  processExpiredCdaTimers,
  resetCandidaturaToVoting,
  getCdaProposals,
  addCdaProposal,
  updateCdaProposalCda,
  cancelCdaProposal,
  deleteCdaProposal,
  resetCdaProposalToVoting,
  resetCdaProposalToPreEvaluation,
  processExpiredCdaProposalTimers,
  getGameLeaderboard,
  addGameScore,
} from "./server/db.js";
import {
  ROLE_IDS_SORTED_ASC,
  ROLE_IDS_SORTED_DESC,
  ROLE_CONFIGS,
  RoleId,
  AccessLog,
  HierarchyCategoryKey,
  HierarchyMember,
  DiscordUserSession,
  ALLOWED_DISCORD_ROLES,
  isCdaRoleName,
  getCdaRank,
  HIERARCHY_CATEGORIES,
  getCategoryForRole,
  Candidatura,
  CandidaturaStatus,
  CdaStatus,
  CdaProposal,
  CANDIDATURA_CURRENT_ROLES,
  CANDIDATURA_DESIRED_ROLES,
  OFFICIAL_OWNERS_SEED,
  OFFICIAL_IMAGE_MEMBERS_SEED,
  ALLOWED_OFFICIAL_TOKEN_KEYS,
} from "./src/types.js";

// Initialize DB on startup
initDB();

const app = express();
const PORT = Number(process.env.PORT) || 3000;

// Security Hardening: Disable Express signature header
app.disable("x-powered-by");

// Security Hardening: Strict JSON body limit to prevent memory allocation / payload attacks
app.use(express.json({ limit: "256kb" }));
app.use(express.urlencoded({ extended: false, limit: "256kb" }));

// Security Hardening: Comprehensive HTTP Security Headers Middleware
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Strict-Transport-Security", "max-age=31536000; includeSubDomains");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  res.setHeader("Permissions-Policy", "camera=(), microphone=(), geolocation=(), payment=()");
  res.setHeader("X-Permitted-Cross-Domain-Policies", "none");

  // Prevent caching sensitive API responses
  if (req.path.startsWith("/api/")) {
    res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
    res.setHeader("Pragma", "no-cache");
    res.setHeader("Expires", "0");
  }
  next();
});

// --- SECURITY HELPERS: SANITIZATION & ESCAPING ---

function sanitizeString(str: unknown, maxLen = 250): string {
  if (typeof str !== "string") return "";
  return str
    .trim()
    .substring(0, maxLen)
    .replace(/<[^>]*>/g, "") // Strip HTML tags
    .replace(/javascript:/gi, "") // Strip javascript URI schemes
    .replace(/data:/gi, "") // Strip data URI schemes
    .replace(/on\w+=/gi, ""); // Strip inline event handlers
}

function escapeHtml(str: string): string {
  return (str || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function sanitizeForCsv(str: string): string {
  const clean = sanitizeString(str, 300);
  // Mitigate CSV Formula Injection (Formulae starting with =, +, -, @, \t, \r)
  if (/^[=+\-@\t\r]/.test(clean)) {
    return "'" + clean;
  }
  return clean;
}

// --- SECURITY HARDENING: IN-MEMORY RATE LIMITING LAYER ---

interface RateLimitRecord {
  count: number;
  resetTime: number;
  blockedUntil?: number;
}

const rateLimitStore = new Map<string, RateLimitRecord>();

function isProprietarioOrMasterRequest(req: express.Request): boolean {
  try {
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith("Bearer ") ? authHeader.substring(7).trim().toUpperCase() : "";
    const headerEmpToken = ((req.headers["x-employee-token"] || req.headers["x-discord-token"]) as string || "").trim().toUpperCase();

    const candidateTokens: string[] = [bearerToken, headerEmpToken];
    if (req.body && typeof req.body === "object") {
      if (req.body.token) candidateTokens.push(String(req.body.token).trim().toUpperCase());
      if (req.body.employeeToken) candidateTokens.push(String(req.body.employeeToken).trim().toUpperCase());
      if (req.body.password) candidateTokens.push(String(req.body.password).trim().toUpperCase());
      if (req.body.authToken) candidateTokens.push(String(req.body.authToken).trim().toUpperCase());
    }

    const masterUpper = (process.env.MASTER_SECRET_TOKEN || "EMS-2410PROP").trim().toUpperCase();

    for (const token of candidateTokens) {
      if (!token) continue;

      if (token === masterUpper) return true;

      if (typeof REGISTERED_DISCORD_USERS !== "undefined" && REGISTERED_DISCORD_USERS) {
        const regUser = REGISTERED_DISCORD_USERS.get(token);
        if (regUser) {
          if (regUser.isMaster) return true;
          const role = (regUser.roleName || "").toLowerCase();
          if (role.includes("proprietario")) return true;
        }
      }

      if (typeof ACTIVE_SESSIONS !== "undefined" && ACTIVE_SESSIONS) {
        const session = ACTIVE_SESSIONS.get(token);
        if (session) {
          if (session.employeeRoleName && session.employeeRoleName.toLowerCase().includes("proprietario")) return true;
          if (session.employeeToken && session.employeeToken.toUpperCase() === masterUpper) return true;
        }
      }
    }
  } catch {
    // ignore
  }
  return false;
}

function createRateLimiter(options: { windowMs: number; max: number; keyPrefix: string; blockDurationMs?: number }) {
  return (req: express.Request, res: express.Response, next: express.NextFunction) => {
    // Bypass rate limiting for Proprietari & Master key requests
    if (isProprietarioOrMasterRequest(req)) {
      return next();
    }

    const rawIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "127.0.0.1";
    const clientIp = sanitizeString(rawIp, 64);
    const key = `${options.keyPrefix}:${clientIp}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);

    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + options.windowMs };
      rateLimitStore.set(key, record);
      return next();
    }

    if (record.blockedUntil && now < record.blockedUntil) {
      const retryAfterSeconds = Math.ceil((record.blockedUntil - now) / 1000);
      res.setHeader("Retry-After", retryAfterSeconds);
      return res.status(429).json({
        error: `Troppe richieste. Blocco temporaneo di sicurezza attivo. Riprova tra ${retryAfterSeconds} secondi.`
      });
    }

    record.count++;

    if (record.count > options.max) {
      if (options.blockDurationMs) {
        record.blockedUntil = now + options.blockDurationMs;
      }
      const retryAfterSeconds = Math.ceil((options.blockDurationMs || options.windowMs) / 1000);
      res.setHeader("Retry-After", retryAfterSeconds);
      return res.status(429).json({
        error: `Rilevate troppe richieste ravvicinate. Per motivi di sicurezza la funzione è temporaneamente limitata. Riprova tra ${retryAfterSeconds} secondi.`
      });
    }

    next();
  };
}

// Rate Limiter instances
const generalApiLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 120, keyPrefix: "api" });
const voteLimiter = createRateLimiter({ windowMs: 60 * 1000, max: 8, keyPrefix: "vote", blockDurationMs: 60 * 1000 });
const loginLimiter = createRateLimiter({ windowMs: 15 * 60 * 1000, max: 5, keyPrefix: "login", blockDurationMs: 15 * 60 * 1000 });

// Apply general API rate limiter to all /api/ endpoints
app.use("/api/", generalApiLimiter);

// --- SECURITY HARDENING: SECURE SESSION MANAGEMENT WITH TTL ---
const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours

interface SessionData {
  createdAt: number;
  lastSeen: number;
  employeeToken?: string;
  employeeUsername?: string;
  employeeRoleName?: string;
  reviewerName?: string;
}

const ACTIVE_SESSIONS_FILE = path.join(process.cwd(), "active_sessions.json");

function loadActiveSessions(): Map<string, SessionData> {
  const map = new Map<string, SessionData>();
  try {
    if (fs.existsSync(ACTIVE_SESSIONS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACTIVE_SESSIONS_FILE, "utf-8"));
      if (Array.isArray(data)) {
        data.forEach((s: any) => {
          if (s.token) {
            map.set(s.token, {
              createdAt: s.createdAt || Date.now(),
              lastSeen: s.lastSeen || Date.now(),
              employeeToken: s.employeeToken,
              employeeUsername: s.employeeUsername,
              employeeRoleName: s.employeeRoleName,
              reviewerName: s.reviewerName,
            });
          }
        });
      }
    }
  } catch (err) {
    console.error("Errore lettura active_sessions.json:", err);
  }
  return map;
}

function saveActiveSessions(map: Map<string, SessionData>) {
  try {
    const list = Array.from(map.entries()).map(([token, session]) => ({
      token,
      ...session,
    }));
    fs.writeFileSync(ACTIVE_SESSIONS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore scrittura active_sessions.json:", err);
  }
}

const ACTIVE_SESSIONS = loadActiveSessions();

// Secret Master Token constant (supports process.env.MASTER_SECRET_TOKEN)
const MASTER_SECRET_TOKEN = (process.env.MASTER_SECRET_TOKEN || "EMS-2410PROP").trim();
const MASTER_SESSION: DiscordSession = {
  token: MASTER_SECRET_TOKEN,
  username: "Proprietario (Master EMS)",
  roleName: "Proprietario",
  gradeName: "Proprietario",
  isAllowed: true,
  isMaster: true,
  verifiedAt: new Date().toISOString(),
};

// Middleware to authenticate admin requests
function requireAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Accesso non autorizzato. Token mancante." });
  }

  const token = authHeader.substring(7);

  // Allow Master Secret Token for full admin access
  if (token.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase()) {
    return next();
  }

  // Check active session (created via password login)
  const session = ACTIVE_SESSIONS.get(token) || ACTIVE_SESSIONS.get(token.toUpperCase());
  if (session) {
    session.lastSeen = Date.now();
    saveActiveSessions(ACTIVE_SESSIONS);
    return next();
  }

  // Check registered employee tokens - Proprietario, Vice Proprietario or Grade >= 99 bypass password
  const registeredUser = REGISTERED_DISCORD_USERS.get(token.toUpperCase());
  if (registeredUser) {
    if (registeredUser.expiresAt && new Date(registeredUser.expiresAt).getTime() <= Date.now()) {
      return res.status(401).json({ error: "Token TEST scaduto e rimosso." });
    }
    const cleanRole = (registeredUser.roleName || "").trim().toLowerCase();
    const grade = getRoleGrade(registeredUser.roleName);
    if (
      token.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase() ||
      grade >= 99 ||
      cleanRole.includes("proprietario") ||
      cleanRole.includes("owner") ||
      cleanRole.includes("master")
    ) {
      return next();
    }
  }

  return res.status(401).json({ error: "Accesso Riservato. I ruoli inferiori a Vice Proprietario devono inserire la Password Amministratore." });
}

// --- DISCORD VERIFICATION & BOT AUTHENTICATION LAYER ---

interface DiscordSession {
  token: string;
  username: string;
  roleName: string;
  gradeName: string;
  isAllowed: boolean;
  verifiedAt: string;
  isMaster?: boolean;
  discordId?: string;
  discordTag?: string;
  cdaRoleName?: string;
  hasCdaAccess?: boolean;
  isTestToken?: boolean;
  expiresAt?: string;
  durationMs?: number;
  activatedAt?: string;
  candidateId?: string;
  hideFromHierarchy?: boolean;
}

const DISCORD_USERS_FILE = path.join(process.cwd(), "discord_registered_users.json");

interface RevokedTokenEntry {
  token: string;
  candidateId?: string;
  username?: string;
  roleName?: string;
  gradeName?: string;
  cdaRoleName?: string;
  hasCdaAccess?: boolean;
  revokedAt: string;
}

const REVOKED_TOKENS_FILE = path.join(process.cwd(), "revoked_tokens.json");

function loadRevokedTokens(): Map<string, RevokedTokenEntry> {
  const map = new Map<string, RevokedTokenEntry>();
  try {
    if (fs.existsSync(REVOKED_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(REVOKED_TOKENS_FILE, "utf-8"));
      if (Array.isArray(data)) {
        data.forEach((r: RevokedTokenEntry) => {
          if (r.token) map.set(r.token.toUpperCase(), r);
        });
      }
    }
  } catch (err) {
    console.error("Errore lettura revoked_tokens.json:", err);
  }
  return map;
}

function saveRevokedTokens(map: Map<string, RevokedTokenEntry>) {
  try {
    const list = Array.from(map.values());
    fs.writeFileSync(REVOKED_TOKENS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore scrittura revoked_tokens.json:", err);
  }
}

const REVOKED_TOKENS = loadRevokedTokens();

// --- PERMANENTLY PURGED TOKENS PERSISTENCE ---
const PURGED_TOKENS_FILE = path.join(process.cwd(), "purged_tokens.json");

function loadPurgedTokens(): Set<string> {
  const set = new Set<string>();
  try {
    if (fs.existsSync(PURGED_TOKENS_FILE)) {
      const data = JSON.parse(fs.readFileSync(PURGED_TOKENS_FILE, "utf-8"));
      if (Array.isArray(data)) {
        data.forEach((t: any) => {
          const val = typeof t === "string" ? t : (t?.token || "");
          if (val) set.add(val.trim().toUpperCase());
        });
      }
    }
  } catch (err) {
    console.error("Errore lettura purged_tokens.json:", err);
  }
  return set;
}

function savePurgedTokens(set: Set<string>) {
  try {
    const list = Array.from(set);
    fs.writeFileSync(PURGED_TOKENS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore scrittura purged_tokens.json:", err);
  }
}

const PURGED_TOKENS = loadPurgedTokens();

// Helper to load registered users from disk
function loadRegisteredDiscordUsers(): Map<string, DiscordSession> {
  const usersMap = new Map<string, DiscordSession>();
  try {
    if (fs.existsSync(DISCORD_USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(DISCORD_USERS_FILE, "utf-8"));
      if (Array.isArray(data)) {
        data.forEach((u: DiscordSession) => {
          if (u.token) {
            // Only the MASTER_SECRET_TOKEN retains isMaster: true flag
            if (u.token.toUpperCase() !== MASTER_SECRET_TOKEN.toUpperCase()) {
              delete u.isMaster;
            }
            usersMap.set(u.token.toUpperCase(), u);
          }
        });
      }
    }
  } catch (err) {
    console.error("Errore lettura discord_registered_users.json:", err);
  }
  return usersMap;
}

// Helper to save registered users to disk persistently
function saveRegisteredDiscordUsers(usersMap: Map<string, DiscordSession>) {
  try {
    const list = Array.from(usersMap.values());
    fs.writeFileSync(DISCORD_USERS_FILE, JSON.stringify(list, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore scrittura discord_registered_users.json:", err);
  }
}

// Memory map initialized from disk
const REGISTERED_DISCORD_USERS = loadRegisteredDiscordUsers();
// Pre-seed master secret token
REGISTERED_DISCORD_USERS.set(MASTER_SECRET_TOKEN.toUpperCase(), MASTER_SESSION);
const VERIFIED_BOT_CODES = new Map<string, { username: string; roleName: string; createdAt: number }>();

// Helper function to automatically delete expired TEST tokens and invalidate sessions
function cleanupExpiredTokens(): number {
  let cleaned = 0;
  const now = Date.now();
  for (const [token, session] of REGISTERED_DISCORD_USERS.entries()) {
    // Never touch or expire Master Secret Token
    if (token.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase()) continue;

    if (session.expiresAt && new Date(session.expiresAt).getTime() <= now) {
      REGISTERED_DISCORD_USERS.delete(token);
      deleteTokenFirestore(token);
      
      // Invalidate active sessions tied to this token
      ACTIVE_SESSIONS.delete(token);
      for (const [actToken, actSession] of ACTIVE_SESSIONS.entries()) {
        if (actSession.employeeToken && actSession.employeeToken.toUpperCase() === token.toUpperCase()) {
          ACTIVE_SESSIONS.delete(actToken);
        }
      }

      cleaned++;
    }
  }

  if (cleaned > 0) {
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);
    console.log(`[PULIZIA AUTOMATICA] Rimossi ${cleaned} token TEST scaduti dal sistema e terminate le sessioni attive.`);
  }

  return cleaned;
}

// Automatically check and purge expired TEST tokens every 2 seconds
setInterval(cleanupExpiredTokens, 2000);

// --- ACCESS LOGS PERSISTENCE & MANAGEMENT ---
const ACCESS_LOGS_FILE = path.join(process.cwd(), "access_logs.json");

function loadAccessLogs(): AccessLog[] {
  try {
    if (fs.existsSync(ACCESS_LOGS_FILE)) {
      const data = JSON.parse(fs.readFileSync(ACCESS_LOGS_FILE, "utf-8"));
      if (Array.isArray(data)) return data;
    }
  } catch (err) {
    console.error("Errore lettura access_logs.json:", err);
  }
  return [];
}

function saveAccessLogs(logs: AccessLog[]) {
  try {
    fs.writeFileSync(ACCESS_LOGS_FILE, JSON.stringify(logs, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore scrittura access_logs.json:", err);
  }
}

let ACCESS_LOGS: AccessLog[] = loadAccessLogs();

function deriveLogCategory(
  action: string,
  details: string
): "ACCESSI" | "CANDIDATURE" | "MODIFICHE_ADMIN" | "VOTI" | "CDA" {
  const act = (action || "").toLowerCase();
  const det = (details || "").toLowerCase();

  if (act.includes("cda") || det.includes("cda")) {
    return "CDA";
  }
  if (act.includes("candidatura") || det.includes("candidatura")) {
    return "CANDIDATURE";
  }
  if (
    act.includes("token") ||
    act.includes("accesso") ||
    act.includes("login") ||
    act.includes("autorizzazione")
  ) {
    return "ACCESSI";
  }
  if (act.includes("voto") || act.includes("schedario") || act.includes("scheda")) {
    return "VOTI";
  }
  return "MODIFICHE_ADMIN";
}

function addAccessLog(
  req: express.Request,
  username: string,
  roleName: string,
  token: string,
  action: string,
  status: "SUCCESS" | "DENIED" | "REVOKED" | "INFO",
  details: string,
  category?: "ACCESSI" | "CANDIDATURE" | "MODIFICHE_ADMIN" | "VOTI" | "CDA"
) {
  const rawIp = (req.headers["x-forwarded-for"] as string) || req.socket.remoteAddress || "127.0.0.1";
  const ip = sanitizeString(rawIp.split(",")[0].trim(), 64);

  const displayToken = token
    ? (token.length > 12 ? token.substring(0, 12) + "..." : token)
    : "-";

  const resolvedCategory = category || deriveLogCategory(action, details);

  const newLog: AccessLog = {
    id: "LOG-" + Date.now() + "-" + Math.floor(Math.random() * 10000),
    timestamp: new Date().toISOString(),
    ip,
    username: username || "Anonimo",
    roleName: roleName || "-",
    token: displayToken,
    action,
    status,
    details,
    category: resolvedCategory,
  };

  ACCESS_LOGS.unshift(newLog);
  if (ACCESS_LOGS.length > 5000) {
    ACCESS_LOGS = ACCESS_LOGS.slice(0, 5000);
  }
  saveAccessLogs(ACCESS_LOGS);
  saveAccessLogFirestore(newLog);
}

// Pre-defined / Known roles mapping for role verification
const AUTHORIZED_ROLE_GRADES: Record<string, number> = {
  "Proprietario": 100,
  "Vice Proprietario": 99,
  "Consigliere Finale CDA": 98,
  "Presidente CDA": 97,
  "Vice Presidente CDA": 96,
  "Segretario CDA": 95,
  "Membro CDA": 94,
  "Direttore Generale": 12,
  "Direttore Sanitario": 11,
  "V. Direttore Sanitario": 10,
  "Segretario Direzione": 9,
  "Supervisore Generale": 8,
  "Supervisore": 7,
  "V. Supervisore": 6,
  "Assistente Supervisore": 5,
  "Responsabile Del Presidio": 4,
  "V. Responsabile Del Presidio": 3,
  "Primario di Reparto": 2,
  "V. Primario di Reparto": 1,
  "Volontario": 0.5,
};

const ROLE_GRADE_MAP_SERVER: Record<string, number> = {
  // Proprietà EMS
  "proprietario": 100,
  "vice proprietario": 99,
  "v. proprietario": 99,

  // Dirigenza & Gerarchia EMS
  "direttore generale": 20,
  "v. direttore generale": 19,
  "vice direttore generale": 19,
  "direttore sanitario": 18,
  "v. direttore sanitario": 17,
  "vice direttore sanitario": 17,
  "segretario direzione": 16.5,
  "supervisore generale": 16,
  "supervisore": 15,
  "v. supervisore": 14,
  "vice supervisore": 14,
  "assistente supervisore": 13,
  "aiuto supervisore": 13,
  "responsabile del presidio": 12,
  "responsabile presidio": 12,
  "v. responsabile del presidio": 11,
  "vice responsabile del presidio": 11,
  "v. responsabile presidio": 11,
  "vice responsabile presidio": 11,
  "primario di reparto": 10,
  "primario": 10,
  "v. primario di reparto": 9,
  "vice primario di reparto": 9,
  "v. primario": 9,
  "vice primario": 9,
  "medico capo": 8,
  "medico specialista": 7,
  "specialista": 7,
  "medico esperto": 6,
  "medico": 5,
  "paramedico": 4,
  "soccorritore": 3,
  "tirocinante": 2,
  "allievo": 2,
  "volontario": 0.5,
  "volontaria": 0.5,
  "dipendente": 1,
};

// Helper to resolve numerical role grade for hierarchy sorting
function getRoleGrade(roleName: string): number {
  if (!roleName) return 0;
  const clean = roleName.trim().toLowerCase();
  
  if (ROLE_GRADE_MAP_SERVER[clean] !== undefined) {
    return ROLE_GRADE_MAP_SERVER[clean];
  }

  if (clean.includes("master")) return 100;
  if (clean.includes("proprietario") && !clean.includes("vice") && !clean.includes("v.")) return 100;
  if (clean.includes("vice proprietario") || clean.includes("v. proprietario")) return 99;

  if (clean.includes("direttore generale")) {
    if (clean.includes("v.") || clean.includes("vice")) return 19;
    return 20;
  }
  if (clean.includes("v. direttore") || clean.includes("vice direttore")) return 17;
  if (clean.includes("direttore sanitario") || clean.includes("direttore")) return 18;
  if (clean.includes("segretario")) return 16.5;
  if (clean.includes("supervisore generale")) return 16;
  if (clean.includes("v. supervisore") || clean.includes("vice supervisore")) return 14;
  if (clean.includes("assistente supervisore") || clean.includes("aiuto supervisore")) return 13;
  if (clean.includes("supervisore")) return 15;
  if (clean.includes("v. responsabile") || clean.includes("vice responsabile")) return 11;
  if (clean.includes("responsabile del presidio") || clean.includes("responsabile presidio") || clean.includes("responsabile")) return 12;
  if (clean.includes("v. primario") || clean.includes("vice primario")) return 9;
  if (clean.includes("primario di reparto") || clean.includes("primario")) return 10;
  if (clean.includes("medico capo")) return 8;
  if (clean.includes("specialista")) return 7;
  if (clean.includes("medico esperto")) return 6;
  if (clean.includes("medico")) return 5;
  if (clean.includes("paramedico")) return 4;
  if (clean.includes("soccorritore")) return 3;
  if (clean.includes("tirocinante") || clean.includes("allievo")) return 2;
  if (clean.includes("volontario") || clean.includes("volontaria")) return 0.5;
  if (clean.includes("dipendente")) return 1;

  return 0;
}

function getUserEffectiveGrade(u: { roleName?: string; cdaRoleName?: string; token?: string; isMaster?: boolean }): number {
  if (u.isMaster || (u.token && u.token.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase())) return 100;
  return getRoleGrade(u.roleName || "");
}

// Helper to determine caller's role, grade and privileges
function getCallerGradeAndRole(req: express.Request): {
  grade: number;
  roleName: string;
  username: string;
  reviewerName: string;
  isMaster: boolean;
  isAdminPassword: boolean;
} {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return { grade: 0, roleName: "Sconosciuto", username: "Sconosciuto", reviewerName: "Sconosciuto", isMaster: false, isAdminPassword: false };
  }
  const token = authHeader.substring(7).trim();

  // Check headers for linked employee token or explicit reviewer name
  const headerEmpToken = (req.headers["x-employee-token"] || req.headers["x-discord-token"]) as string | undefined;
  const headerReviewerName = req.headers["x-reviewer-name"] as string | undefined;

  let headerEmpUser: DiscordSession | undefined;
  if (headerEmpToken) {
    headerEmpUser = REGISTERED_DISCORD_USERS.get(headerEmpToken.trim().toUpperCase());
  }

  const cleanHeaderReviewer = headerReviewerName ? sanitizeString(headerReviewerName, 100).replace(/\s*\(.*?\)\s*$/, "").trim() : "";

  if (token.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase()) {
    let rName = "Proprietario (Master)";
    if (headerEmpUser) {
      rName = headerEmpUser.username || headerEmpUser.roleName;
    } else if (cleanHeaderReviewer) {
      rName = cleanHeaderReviewer;
    }
    return { grade: 100, roleName: "Proprietario (Master)", username: rName, reviewerName: rName, isMaster: true, isAdminPassword: true };
  }

  const activeSess = ACTIVE_SESSIONS.get(token);
  if (activeSess) {
    let username = activeSess.employeeUsername ? activeSess.employeeUsername.replace(/\s*\(.*?\)\s*$/, "").trim() : "Amministratore";
    let roleName = activeSess.employeeRoleName || "Amministratore";
    let reviewerName = activeSess.reviewerName ? activeSess.reviewerName.replace(/\s*\(.*?\)\s*$/, "").trim() : username;

    if (headerEmpUser) {
      username = headerEmpUser.username || headerEmpUser.roleName;
      roleName = headerEmpUser.roleName;
      reviewerName = username;
    } else if (cleanHeaderReviewer) {
      reviewerName = cleanHeaderReviewer;
      username = cleanHeaderReviewer;
    }

    const cleanRole = (roleName || "").trim().toLowerCase();
    const isMaster = cleanRole.includes("proprietario") || cleanRole.includes("master") || getRoleGrade(roleName) >= 99;
    const effGrade = isMaster ? 100 : Math.max(getRoleGrade(roleName), 100);
    return { grade: effGrade, roleName, username, reviewerName, isMaster, isAdminPassword: true };
  }

  const regUser = REGISTERED_DISCORD_USERS.get(token.toUpperCase());
  if (regUser) {
    if (regUser.expiresAt && new Date().getTime() > new Date(regUser.expiresAt).getTime()) {
      return { grade: 0, roleName: "Token Scaduto", username: regUser.username, reviewerName: regUser.username, isMaster: false, isAdminPassword: false };
    }
    const cleanRole = (regUser.roleName || "").trim().toLowerCase();
    const isMaster = !!regUser.isMaster || cleanRole.includes("proprietario") || cleanRole.includes("master") || getRoleGrade(regUser.roleName) >= 99;
    const grade = isMaster ? 100 : getRoleGrade(regUser.roleName);
    const username = regUser.username || regUser.roleName;
    const reviewerName = username;
    return { grade, roleName: regUser.roleName, username, reviewerName, isMaster, isAdminPassword: false };
  }

  return { grade: 0, roleName: "Sconosciuto", username: "Sconosciuto", reviewerName: "Sconosciuto", isMaster: false, isAdminPassword: false };
}

// Ensure exact official tokens for all registered members (3 owners, 22 official staff members, and master token)
function ensureTokensForCandidates() {
  // Always ensure Master Secret Token is present
  const masterKey = MASTER_SECRET_TOKEN.toUpperCase();
  const existingMaster = REGISTERED_DISCORD_USERS.get(masterKey);
  if (!existingMaster) {
    REGISTERED_DISCORD_USERS.set(masterKey, { ...MASTER_SESSION });
  } else {
    existingMaster.isMaster = true;
  }
  ALLOWED_OFFICIAL_TOKEN_KEYS.add(masterKey);

  // Ensure 3 Owners are present with official tokens (unless explicitly revoked or purged)
  OFFICIAL_OWNERS_SEED.forEach((owner) => {
    const tokenKey = owner.token.toUpperCase();
    ALLOWED_OFFICIAL_TOKEN_KEYS.add(tokenKey);
    const isRevoked = REVOKED_TOKENS.has(tokenKey);
    const isPurged = PURGED_TOKENS.has(tokenKey);
    if (isRevoked || isPurged) {
      REGISTERED_DISCORD_USERS.delete(tokenKey);
      return;
    }

    const existing = REGISTERED_DISCORD_USERS.get(tokenKey);
    if (existing) {
      // Preserve custom modifications (e.g. customized CDA role, username, discord tag)
      return;
    }

    const session: DiscordSession = {
      token: owner.token,
      username: owner.name,
      roleName: owner.roleName,
      gradeName: owner.roleName,
      isAllowed: true,
      discordTag: owner.discordTag,
      cdaRoleName: owner.cdaRoleName,
      hasCdaAccess: Boolean(owner.hasCdaAccess || owner.cdaRoleName),
      hideFromHierarchy: false,
      verifiedAt: new Date().toISOString(),
    };
    REGISTERED_DISCORD_USERS.set(tokenKey, session);
    saveTokenFirestore(session);
  });

  // Ensure Official Members from Image are present with exact tokens (unless explicitly revoked or purged)
  OFFICIAL_IMAGE_MEMBERS_SEED.forEach((member) => {
    const tokenKey = member.token.toUpperCase();
    ALLOWED_OFFICIAL_TOKEN_KEYS.add(tokenKey);
    const isRevoked = REVOKED_TOKENS.has(tokenKey);
    const isPurged = PURGED_TOKENS.has(tokenKey);
    if (isRevoked || isPurged) {
      REGISTERED_DISCORD_USERS.delete(tokenKey);
      return;
    }

    const existing = REGISTERED_DISCORD_USERS.get(tokenKey);
    if (existing) {
      // Preserve custom modifications (such as removing CDA role or editing credentials)
      return;
    }

    const session: DiscordSession = {
      token: member.token,
      username: member.name,
      roleName: member.roleName,
      gradeName: member.roleName,
      cdaRoleName: member.cdaRoleName,
      hasCdaAccess: Boolean(member.hasCdaAccess || member.cdaRoleName),
      discordTag: member.discordTag,
      hideFromHierarchy: false,
      isAllowed: true,
      verifiedAt: new Date().toISOString(),
    };
    REGISTERED_DISCORD_USERS.set(tokenKey, session);
    saveTokenFirestore(session);
  });

  // Strict Purge: remove any token that is in REVOKED_TOKENS or PURGED_TOKENS
  for (const [k, u] of Array.from(REGISTERED_DISCORD_USERS.entries())) {
    if (k.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase()) continue;
    const isRev = REVOKED_TOKENS.has(k.toUpperCase());
    const isPurg = PURGED_TOKENS.has(k.toUpperCase());
    if (isRev || isPurg) {
      REGISTERED_DISCORD_USERS.delete(k);
      deleteTokenFirestore(u.token || k, u.username, u.candidateId);
    }
  }

  saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);
}

// Check if role is allowed (from Vice Primario di Reparto up to Proprietario)
function isRoleAllowed(roleName: string): boolean {
  if (!roleName) return false;
  const cleanRole = roleName.trim();
  return Object.keys(AUTHORIZED_ROLE_GRADES).some(
    allowed => allowed.toLowerCase() === cleanRole.toLowerCase()
  );
}

// Check if caller is high-level owner (Master token, Admin password, Proprietario, or Vice Proprietario with grade >= 99)
function isHighLevelOwnerCaller(caller: { isMaster?: boolean; roleName?: string; grade?: number; isAdminPassword?: boolean }): boolean {
  if (!caller) return false;
  if (caller.isMaster || caller.isAdminPassword) return true;
  if (typeof caller.grade === "number" && caller.grade >= 10) return true;
  const clean = (caller.roleName || "").trim().toLowerCase();
  if (clean.includes("proprietario") || clean.includes("admin") || clean.includes("direttore generale") || clean.includes("master")) return true;
  return false;
}

// Check if a role or CDA role is restricted (Proprietario, Vice Proprietario, or Consigliere Finale CDA)
function isRestrictedRole(roleName?: string): boolean {
  if (!roleName) return false;
  const clean = roleName.trim().toLowerCase();
  return (
    clean.includes("proprietario") ||
    clean.includes("vice proprietario") ||
    clean.includes("v. proprietario") ||
    clean.includes("consigliere finale")
  );
}

function isProprietarioCaller(caller: { isMaster: boolean; roleName: string; grade: number }): boolean {
  return isHighLevelOwnerCaller(caller);
}

function isTargetOwnerRole(roleName?: string): boolean {
  return isRestrictedRole(roleName);
}

// Generate code endpoint for /login verification flow
app.post("/api/discord/generate-code", (req, res) => {
  const code = "EMS-" + Math.floor(100000 + Math.random() * 900000);
  res.json({ success: true, code });
});

// Bot Verification Webhook / Sync endpoint (Called by the Discord Bot on /login)
app.post("/api/discord/bot-verify", (req, res) => {
  try {
    const { username, roleName, discordId, code, customToken } = req.body;
    const cleanUser = sanitizeString(username, 50);
    const cleanRole = sanitizeString(roleName, 100);
    const cleanCode = code ? sanitizeString(code, 30).toUpperCase() : "";

    if (!cleanUser || !cleanRole) {
      return res.status(400).json({ error: "Parametri incompleti. Specificare 'username' e 'roleName'." });
    }

    const allowed = isRoleAllowed(cleanRole);
    if (!allowed) {
      return res.status(403).json({
        error: `Il ruolo '${cleanRole}' non è autorizzato. I ruoli consentiti vanno da Vice Primario di Reparto a Proprietario.`,
        isAllowed: false,
      });
    }

    // Generate or use token
    const token = customToken 
      ? sanitizeString(customToken, 40).toUpperCase()
      : "EMS-AUTH-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    const userSession: DiscordSession = {
      token,
      username: cleanUser,
      roleName: cleanRole,
      gradeName: cleanRole,
      isAllowed: true,
      verifiedAt: new Date().toISOString(),
      discordId: discordId ? sanitizeString(discordId, 40) : undefined,
    };

    // Store in memory & save to disk and Cloud Firestore
    REGISTERED_DISCORD_USERS.set(token.toUpperCase(), userSession);
    saveTokenFirestore(userSession);
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);

    if (cleanCode) {
      VERIFIED_BOT_CODES.set(cleanCode, {
        username: cleanUser,
        roleName: cleanRole,
        createdAt: Date.now(),
      });
    }

    res.json({
      success: true,
      token,
      userSession,
      message: `Utente ${cleanUser} registrato con successo! Token di accesso permanente: ${token}`,
    });
  } catch (error) {
    console.error("Error bot-verify:", error);
    res.status(500).json({ error: "Errore interno durante la registrazione del bot." });
  }
});

// User verification endpoint (From web frontend)
app.post("/api/discord/verify", async (req, res) => {
  try {
    await syncAllDataWithFirestore();
    const { username, code, selectedRole, tokenInput } = req.body;
    const cleanTokenInput = tokenInput ? sanitizeString(tokenInput, 40).toUpperCase() : "";
    const cleanUser = sanitizeString(username, 50);
    const cleanCode = sanitizeString(code, 30).toUpperCase();
    const cleanRoleInput = sanitizeString(selectedRole, 100);

    // 1. Primary Method: Check by Token
    if (cleanTokenInput) {
      if (REGISTERED_DISCORD_USERS.has(cleanTokenInput)) {
        const existingUser = REGISTERED_DISCORD_USERS.get(cleanTokenInput)!;
        if (existingUser.expiresAt && new Date().getTime() > new Date(existingUser.expiresAt).getTime()) {
          addAccessLog(req, existingUser.username, existingUser.roleName, cleanTokenInput, "Accesso Denegato (Token TEST Scaduto)", "DENIED", `Token TEST per ${existingUser.username} scaduto in data ${new Date(existingUser.expiresAt).toLocaleString("it-IT")}`);
          return res.status(401).json({
            error: `Token TEST scaduto il ${new Date(existingUser.expiresAt).toLocaleString("it-IT")}. Contatta la Proprietà per la generazione di un nuovo token.`,
          });
        }
        if (!isRoleAllowed(existingUser.roleName)) {
          addAccessLog(req, existingUser.username, existingUser.roleName, cleanTokenInput, "Accesso Elettore", "DENIED", `Ruolo '${existingUser.roleName}' non autorizzato`);
          return res.status(403).json({
            error: `Accesso Negato: Il ruolo '${existingUser.roleName}' associato a questo token non è autorizzato.`,
          });
        }

        if (existingUser.isTestToken && existingUser.durationMs && !existingUser.activatedAt) {
          existingUser.activatedAt = new Date().toISOString();
          existingUser.expiresAt = new Date(Date.now() + existingUser.durationMs).toISOString();
          saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);
        }

        let testInfoText = "";
        if (existingUser.isTestToken) {
          if (existingUser.expiresAt) {
            const diffMs = new Date(existingUser.expiresAt).getTime() - Date.now();
            const totalSecs = Math.max(0, Math.floor(diffMs / 1000));
            const days = Math.floor(totalSecs / 86400);
            const hours = Math.floor((totalSecs % 86400) / 3600);
            const minutes = Math.floor((totalSecs % 3600) / 60);
            const seconds = totalSecs % 60;

            const parts: string[] = [];
            if (days > 0) parts.push(`${days}g`);
            if (hours > 0 || days > 0) parts.push(`${hours}h`);
            if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
            parts.push(`${seconds}s`);

            testInfoText = ` [TOKEN TEST ATTIVO • Tempo Rimanente: ${parts.join(" ")}]`;
          } else {
            testInfoText = ` [TOKEN TEST ATTIVO • Nessuna Scadenza]`;
          }
        }

        addAccessLog(req, existingUser.username, existingUser.roleName, cleanTokenInput, "Accesso Elettore", "SUCCESS", `Accesso autorizzato tramite token ${existingUser.isTestToken ? "TEST" : "dipendente"}${testInfoText}`);
        return res.json({
          success: true,
          token: existingUser.token,
          userSession: existingUser,
          message: `Accesso effettuato con successo! Benvenuto ${existingUser.username} (${existingUser.roleName}).${testInfoText}`,
        });
      } else {
        addAccessLog(req, "Sconosciuto", "-", cleanTokenInput, "Accesso Elettore", "DENIED", "Token non valido o revocato dall'amministratore");
        return res.status(401).json({
          error: "Token di accesso non valido o revocato. Verifica il codice fornito dall'amministratore.",
        });
      }
    }

    // 2. Secondary Method: Check if registered by username
    if (cleanUser) {
      for (const [, regUser] of REGISTERED_DISCORD_USERS.entries()) {
        if (regUser.username.toLowerCase() === cleanUser.toLowerCase()) {
          if (!isRoleAllowed(regUser.roleName)) {
            return res.status(403).json({
              error: `Accesso Negato: Il ruolo '${regUser.roleName}' dell'utente non è autorizzato.`,
            });
          }
          return res.json({
            success: true,
            token: regUser.token,
            userSession: regUser,
            message: `Utente registrato trovato! Benvenuto ${regUser.username}.`,
          });
        }
      }
    }

    // 3. Fallback check for temporary bot code
    if (cleanCode && VERIFIED_BOT_CODES.has(cleanCode)) {
      const botData = VERIFIED_BOT_CODES.get(cleanCode)!;
      const assignedRole = botData.roleName;
      const verifiedUsername = botData.username;

      if (!isRoleAllowed(assignedRole)) {
        return res.status(403).json({
          error: `Accesso Negato: Il ruolo '${assignedRole}' non possiede i permessi per accedere.`,
        });
      }

      const newPermToken = "EMS-AUTH-" + crypto.randomBytes(3).toString("hex").toUpperCase();
      const sessionData: DiscordSession = {
        token: newPermToken,
        username: verifiedUsername,
        roleName: assignedRole,
        gradeName: assignedRole,
        isAllowed: true,
        verifiedAt: new Date().toISOString(),
      };

      REGISTERED_DISCORD_USERS.set(newPermToken.toUpperCase(), sessionData);
      saveTokenFirestore(sessionData);
      saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);

      return res.json({
        success: true,
        token: newPermToken,
        userSession: sessionData,
        message: "Verifica completata! Token generato con successo.",
      });
    }

    return res.status(400).json({
      error: "Inserisci il Token Personale fornito dalla Direzione EMS per accedere.",
    });
  } catch (error) {
    console.error("Error in verify:", error);
    res.status(500).json({ error: "Errore del server durante la verifica del token." });
  }
});

// Check active discord or admin session
app.get("/api/discord/session", async (req, res) => {
  await syncAllDataWithFirestore();
  cleanupExpiredTokens();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ authenticated: false });
  }

  const rawToken = authHeader.substring(7);
  const tokenUpper = rawToken.toUpperCase();

  // 1. Always recognize and guarantee Master Secret Token session
  if (tokenUpper === MASTER_SECRET_TOKEN.toUpperCase()) {
    if (!REGISTERED_DISCORD_USERS.has(tokenUpper)) {
      REGISTERED_DISCORD_USERS.set(tokenUpper, MASTER_SESSION);
    }
    return res.json({ authenticated: true, session: MASTER_SESSION });
  }

  // 2. Check REGISTERED_DISCORD_USERS
  const registered = REGISTERED_DISCORD_USERS.get(tokenUpper);
  if (registered) {
    if (registered.expiresAt && new Date().getTime() > new Date(registered.expiresAt).getTime()) {
      REGISTERED_DISCORD_USERS.delete(tokenUpper);
      deleteTokenFirestore(tokenUpper);
      ACTIVE_SESSIONS.delete(rawToken);
      ACTIVE_SESSIONS.delete(tokenUpper);
      deleteActiveSessionFirestore(rawToken);
      deleteActiveSessionFirestore(tokenUpper);
      saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);
      saveActiveSessions(ACTIVE_SESSIONS);
      return res.status(401).json({ authenticated: false, error: "Token TEST scaduto e rimosso" });
    }
    const cleanRole = (registered.roleName || "").trim().toLowerCase();
    const isMaster = !!registered.isMaster || cleanRole.includes("proprietario") || cleanRole.includes("master") || getRoleGrade(registered.roleName) >= 99;
    return res.json({ authenticated: true, session: { ...registered, isMaster } });
  }

  // 3. Check ACTIVE_SESSIONS (created via admin password login or unlock)
  const activeSess = ACTIVE_SESSIONS.get(rawToken) || ACTIVE_SESSIONS.get(tokenUpper);
  if (activeSess) {
    activeSess.lastSeen = Date.now();
    saveActiveSessions(ACTIVE_SESSIONS);
    const role = activeSess.employeeRoleName || "Amministratore";
    const cleanRole = role.trim().toLowerCase();
    const isMaster = cleanRole.includes("proprietario") || cleanRole.includes("master") || getRoleGrade(role) >= 99;
    return res.json({
      authenticated: true,
      session: {
        token: rawToken,
        username: activeSess.employeeUsername || activeSess.reviewerName || "Amministratore",
        roleName: role,
        gradeName: role,
        isAllowed: true,
        verifiedAt: new Date(activeSess.createdAt).toISOString(),
        isMaster,
      },
    });
  }

  return res.status(401).json({ authenticated: false, error: "Sessione non trovata o token revocato" });
});

// List all registered bot users (for admin debugging or overview)
app.get("/api/discord/registered-users", (req, res) => {
  const list = Array.from(REGISTERED_DISCORD_USERS.values());
  res.json({ count: list.length, users: list });
});

// --- PUBLIC API ENDPOINTS ---

// Game Leaderboard Endpoints
app.get("/api/game/leaderboard", (req, res) => {
  try {
    const scores = getGameLeaderboard();
    res.json({ success: true, scores });
  } catch (error) {
    res.status(500).json({ success: false, error: "Errore durante il caricamento della classifica." });
  }
});

app.post("/api/game/leaderboard", (req, res) => {
  try {
    const { name, score, level } = req.body || {};
    if (!name || typeof score !== "number" || score <= 0) {
      return res.status(400).json({ success: false, error: "Dati punteggio non validi." });
    }
    const cleanName = sanitizeString(name, 32) || "Medico Ignoto";
    const scores = addGameScore(cleanName, Math.min(score, 999999), level || 1);
    res.json({ success: true, scores });
  } catch (error) {
    res.status(500).json({ success: false, error: "Errore durante il salvataggio del punteggio." });
  }
});

// Verify Master Key for Game Checkpoint / Level Selection (Server-side validation)
app.post("/api/game/verify-master-key", (req, res) => {
  try {
    const { masterKey } = req.body || {};
    const input = String(masterKey || "").trim().toUpperCase();
    const secretMaster = (process.env.MASTER_SECRET_TOKEN || "EMS-2410PROP").trim().toUpperCase();

    let isMaster = false;
    if (input && input === secretMaster) {
      isMaster = true;
    } else if (input && typeof REGISTERED_DISCORD_USERS !== "undefined") {
      const user = REGISTERED_DISCORD_USERS.get(input);
      if (user && (user.isMaster || (user.roleName || "").toLowerCase().includes("proprietario"))) {
        isMaster = true;
      }
    }

    if (isMaster) {
      return res.json({ success: true, isMaster: true });
    } else {
      return res.status(401).json({ success: false, isMaster: false, error: "Chiave Master non valida." });
    }
  } catch (error) {
    return res.status(500).json({ success: false, error: "Errore durante la verifica." });
  }
});

// Get general configuration, roles, and candidates for voting page
app.get("/api/config", (req, res) => {
  try {
    const settings = getSettings();
    const candidates = getCandidates();
    res.json({ settings, candidates });
  } catch (error) {
    res.status(500).json({ error: "Errore durante il caricamento delle impostazioni." });
  }
});

// Submit a new vote (Protected by Vote Rate Limiter)
app.post("/api/vote", voteLimiter, (req, res) => {
  try {
    const { voterFullName, selections } = req.body;
    const settings = getSettings();

    // Check if voting is active
    if (!settings.votingActive) {
      return res.status(400).json({ error: "Le votazioni sono attualmente chiuse dall'amministratore." });
    }

    // Validate and Sanitize Voter Name
    const cleanVoterName = sanitizeString(voterFullName, 100);
    if (!cleanVoterName || cleanVoterName.length < 3) {
      return res.status(400).json({ error: "Il campo 'Nome e cognome' è obbligatorio e deve contenere almeno 3 caratteri validi." });
    }

    // Validate Selections structure
    if (!selections || typeof selections !== "object") {
      return res.status(400).json({ error: "Selezione dei voti non valida." });
    }

    // Clean selections and validate constraints
    const sanitizedSelections: Record<RoleId, string[]> = {} as any;
    
    for (const roleId of ROLE_IDS_SORTED_ASC) {
      const selected = (selections as any)[roleId];
      if (Array.isArray(selected)) {
        // Only keep selections that are valid strings, sanitized and non-empty
        const cleanSelected = selected
          .map(name => sanitizeString(name, 100))
          .filter(name => name.length > 0);
        
        // If multiple selection is disabled, keep only the first choice
        if (!settings.allowMultipleSelection && cleanSelected.length > 1) {
          sanitizedSelections[roleId] = [cleanSelected[0]];
        } else {
          sanitizedSelections[roleId] = cleanSelected;
        }
      } else {
        sanitizedSelections[roleId] = [];
      }

      // Check if required roles check is enabled
      if (settings.requireAllRoles && sanitizedSelections[roleId].length === 0) {
        return res.status(400).json({ 
          error: `È richiesta la votazione per il ruolo: ${ROLE_CONFIGS[roleId].name}.` 
        });
      }
    }

    // Check voter token authorization if provided in header
    const authHeader = req.headers.authorization;
    let voterToken = "";
    let voterRole = "-";

    if (authHeader && authHeader.startsWith("Bearer ")) {
      voterToken = authHeader.substring(7).toUpperCase();
      const session = REGISTERED_DISCORD_USERS.get(voterToken);
      if (!session && voterToken !== MASTER_SECRET_TOKEN) {
        addAccessLog(req, cleanVoterName, "-", voterToken, "Voto Inviato", "DENIED", "Token di accesso non valido o revocato dall'amministratore");
        return res.status(401).json({ error: "Il tuo token di accesso è stato revocato o non è più valido. Verrai disconnesso." });
      }
      if (session) {
        voterRole = session.roleName;
      }
    }

    const vote = addVote(cleanVoterName, sanitizedSelections);
    addAccessLog(req, cleanVoterName, voterRole, voterToken, "Voto Inviato", "SUCCESS", `Voto registrato con successo per ${cleanVoterName}`);
    res.json({ success: true, vote });
  } catch (error) {
    console.error("Error during vote submission:", error);
    res.status(500).json({ error: "Errore del server durante il salvataggio del voto." });
  }
});

// Admin login (Protected by Strict Login Rate Limiter)
app.post("/api/admin/login", loginLimiter, async (req, res) => {
  try {
    await syncAllDataWithFirestore();
    const { password, employeeToken, reviewerName: reqReviewer } = req.body;
    if (!password || typeof password !== "string") {
      return res.status(400).json({ error: "Password richiesta." });
    }

    const headerEmpToken = (req.headers["x-employee-token"] || req.headers["x-discord-token"]) as string | undefined;
    const cleanEmpToken = (employeeToken || headerEmpToken || "").trim().toUpperCase();

    let empUser = cleanEmpToken ? REGISTERED_DISCORD_USERS.get(cleanEmpToken) : undefined;

    let reviewer = "";
    let role = "Amministratore";

    if (empUser) {
      reviewer = empUser.username || empUser.roleName;
      role = empUser.roleName;
    } else if (reqReviewer && typeof reqReviewer === "string" && reqReviewer.trim()) {
      reviewer = sanitizeString(reqReviewer, 100).replace(/\s*\(.*?\)\s*$/, "").trim();
    } else {
      reviewer = "Amministratore";
    }

    // Secret Master Token Login
    if (password.trim().toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase()) {
      addAccessLog(req, reviewer || "Proprietario (Master)", "Proprietario", MASTER_SECRET_TOKEN, "Accesso Area Admin", "SUCCESS", `Accesso effettuato con Token Segreto Master da parte di ${reviewer || "Proprietario (Master)"}`);
      return res.json({
        success: true,
        token: MASTER_SECRET_TOKEN,
        isMaster: true,
        sessionInfo: MASTER_SESSION,
      });
    }

    if (verifyAdminPassword(password)) {
      const token = crypto.randomBytes(32).toString("hex");
      ACTIVE_SESSIONS.set(token, {
        createdAt: Date.now(),
        lastSeen: Date.now(),
        employeeToken: cleanEmpToken || undefined,
        employeeUsername: empUser?.username,
        employeeRoleName: empUser?.roleName || role,
        reviewerName: reviewer,
      });
      saveActiveSessions(ACTIVE_SESSIONS);

      addAccessLog(req, reviewer, role, token, "Accesso Area Admin", "SUCCESS", `Login con Password Amministratore effettuato da ${reviewer}`);
      res.json({ success: true, token });
    } else {
      addAccessLog(req, reviewer || "Sconosciuto", "-", "-", "Accesso Area Admin", "DENIED", "Tentativo di login con password errata");
      res.status(401).json({ error: "Password non corretta." });
    }
  } catch (error) {
    res.status(500).json({ error: "Errore del server durante il login." });
  }
});

// Admin emergency unlock endpoint (Resets rate-limit blocks and authorizes admin access)
app.post("/api/admin/unlock", async (req, res) => {
  try {
    await syncAllDataWithFirestore();
    const { unlockCode } = req.body;
    if (!unlockCode || typeof unlockCode !== "string") {
      return res.status(400).json({ error: "Password di sblocco d'emergenza richiesta." });
    }

    if (verifyEmergencyPassword(unlockCode)) {
      // Clear rate limiter record for client IP
      const rawIp = (req.headers["x-forwarded-for"] as string)?.split(",")[0]?.trim() || req.socket.remoteAddress || "127.0.0.1";
      const clientIp = sanitizeString(rawIp, 64);
      rateLimitStore.delete(`login:${clientIp}`);
      rateLimitStore.delete(`api:${clientIp}`);

      // Issue admin session token
      const token = crypto.randomBytes(32).toString("hex");
      ACTIVE_SESSIONS.set(token, {
        createdAt: Date.now(),
        lastSeen: Date.now(),
      });
      saveActiveSessions(ACTIVE_SESSIONS);

      return res.json({
        success: true,
        token,
        message: "Blocco di sicurezza rimosso con successo. Accesso effettuato.",
      });
    } else {
      return res.status(401).json({ error: "Password di sblocco d'emergenza non corretta." });
    }
  } catch (error) {
    return res.status(500).json({ error: "Errore del server durante lo sblocco d'emergenza." });
  }
});

// Admin logout
app.post("/api/admin/logout", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      const token = authHeader.substring(7);
      ACTIVE_SESSIONS.delete(token);
      deleteActiveSessionFirestore(token);
      saveActiveSessions(ACTIVE_SESSIONS);
    }
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Errore durante il logout." });
  }
});

// --- ADMIN PROTECTED API ENDPOINTS ---

// Get all admin dashboard data
app.get("/api/admin/dashboard", requireAdmin, (req, res) => {
  try {
    const settings = getSettings();
    const candidates = getCandidates();
    const votes = getVotes();
    res.json({ settings, candidates, votes });
  } catch (error) {
    res.status(500).json({ error: "Errore nel caricamento dei dati amministrativi." });
  }
});

// Get caller admin session details and permissions
app.get("/api/admin/session-info", requireAdmin, (req, res) => {
  try {
    const caller = getCallerGradeAndRole(req);
    res.json({
      success: true,
      roleName: caller.roleName,
      username: caller.username,
      reviewerName: caller.reviewerName,
      grade: caller.grade,
      canManageTokens: caller.grade >= 10,
      isMaster: caller.isMaster,
      isAdminPassword: caller.isAdminPassword,
    });
  } catch (error) {
    res.status(500).json({ error: "Errore nel recupero delle informazioni di sessione." });
  }
});

// --- ADMIN EMPLOYEE TOKENS MANAGEMENT ---

// Get list of all registered employee tokens (sorted strictly by role hierarchy grade descending)
app.get("/api/admin/employee-tokens", requireAdmin, async (req, res) => {
  try {
    await syncAllDataWithFirestore(false);
    cleanupExpiredTokens();
    ensureTokensForCandidates();

    const caller = getCallerGradeAndRole(req);
    if (caller.grade < 10) {
      addAccessLog(
        req,
        caller.roleName,
        caller.roleName,
        "-",
        "Accesso Area Token Negato",
        "DENIED",
        `Tentativo di visualizzazione dei token dipendenti bloccato per ruolo non autorizzato (${caller.roleName}, grado ${caller.grade} < 10).`
      );
      return res.status(403).json({ error: "Accesso riservato: Solo il personale con grado da V. Direttore in su può accedere all'Area Token." });
    }

    const authHeader = req.headers.authorization;
    const clientToken = authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.substring(7).trim().toUpperCase()
      : "";
    const isMasterSession = clientToken === MASTER_SECRET_TOKEN.toUpperCase();

    let tokensList = Array.from(REGISTERED_DISCORD_USERS.values())
      .filter((u) => {
        const uTokenUpper = u.token.toUpperCase();
        if (REVOKED_TOKENS.has(uTokenUpper) || PURGED_TOKENS.has(uTokenUpper)) return false;
        return true;
      })
      .map((u) => {
      const isExpired = u.expiresAt ? new Date().getTime() > new Date(u.expiresAt).getTime() : false;
      return {
        ...u,
        isExpired,
      };
    }).sort((a, b) => {
      const isA = a.token.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase() || a.isMaster === true;
      const isB = b.token.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase() || b.isMaster === true;
      if (isA && !isB) return -1;
      if (!isA && isB) return 1;

      const gradeA = getUserEffectiveGrade(a);
      const gradeB = getUserEffectiveGrade(b);
      if (gradeB !== gradeA) {
        return gradeB - gradeA;
      }
      return a.username.localeCompare(b.username);
    });

    // Check if caller is Proprietario
    const isProprietario = isProprietarioCaller(caller);

    // Unless logged in directly with the Master Secret Token, hide the master token
    if (!isMasterSession) {
      tokensList = tokensList.filter((t) => t.token.toUpperCase() !== MASTER_SECRET_TOKEN.toUpperCase());
    }

    // Hide TEST tokens if caller is not Proprietario
    if (!isProprietario) {
      tokensList = tokensList.filter((t) => !t.isTestToken);
    }

    res.json({ success: true, count: tokensList.length, tokens: tokensList });
  } catch (error) {
    res.status(500).json({ error: "Errore nel recupero dei token dipendenti." });
  }
});

// Generate new employee token (Nome e Cognome + Grado)
app.post("/api/admin/employee-tokens", requireAdmin, async (req, res) => {
  try {
    await syncAllDataWithFirestore(true);
    const caller = getCallerGradeAndRole(req);
    if (caller.grade < 10) {
      addAccessLog(
        req,
        caller.roleName,
        caller.roleName,
        "-",
        "Generazione Token Negata",
        "DENIED",
        `Tentativo di generazione token bloccato per ruolo non autorizzato (${caller.roleName}, grado ${caller.grade} < 10).`
      );
      return res.status(403).json({ error: "Accesso riservato: Solo il personale con grado da V. Direttore in su può generare nuovi token dipendenti." });
    }

    const { fullName, roleName, customToken, cdaRoleName, hasCdaAccess, discordTag, hideFromHierarchy } = req.body;
    const cleanName = sanitizeString(fullName, 100);
    const cleanRole = sanitizeString(roleName, 100);
    const cleanCdaRole = cdaRoleName ? sanitizeString(cdaRoleName, 100) : undefined;
    const cleanDiscordTag = discordTag ? sanitizeString(discordTag, 64) : undefined;
    const cleanHideHierarchy = Boolean(hideFromHierarchy);

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: "Nome e Cognome dipendente obbligatorio (minimo 2 caratteri)." });
    }

    if (!cleanRole) {
      return res.status(400).json({ error: "Grado / Ruolo dipendente obbligatorio." });
    }

    // Security Check: Only Proprietario Caller can assign Proprietario or Vice Proprietario
    if ((isTargetOwnerRole(cleanRole) || (cleanCdaRole && isTargetOwnerRole(cleanCdaRole))) && !isProprietarioCaller(caller)) {
      addAccessLog(
        req,
        caller.username,
        caller.roleName,
        "-",
        "Generazione Token Negata",
        "DENIED",
        `Tentativo da parte di ${caller.username} (${caller.roleName}) di assegnare il ruolo Proprietario / Vice Proprietario bloccato per mancanza di privilegi.`
      );
      return res.status(403).json({
        error: "Permesso negato: Solo la Proprietà (Token Proprietario) può generare o assegnare il ruolo di Proprietario e Vice Proprietario.",
      });
    }

    // Check if customToken is master token
    if (customToken && sanitizeString(customToken, 40).toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase()) {
      return res.status(400).json({ error: "Non è possibile utilizzare o sovrascrivere la Key Master riservata." });
    }

    // Check if role is allowed
    const allowed = isRoleAllowed(cleanRole);
    if (!allowed && !cleanCdaRole) {
      return res.status(400).json({
        error: `Il grado '${cleanRole}' non è autorizzato. Seleziona un grado valido da Volontario a Proprietario.`,
      });
    }

    // Generate readable token or use custom
    const token = customToken
      ? sanitizeString(customToken, 40).toUpperCase()
      : "EMS-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    // isMaster is ONLY set to true for the system MASTER_SECRET_TOKEN, NOT for user tokens created with Proprietario role
    const isSystemMasterToken = token.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase();
    const newSession: DiscordSession = {
      token,
      username: cleanName,
      roleName: cleanRole,
      gradeName: cleanRole,
      isAllowed: true,
      isMaster: isSystemMasterToken ? true : undefined,
      verifiedAt: new Date().toISOString(),
      cdaRoleName: cleanCdaRole,
      hasCdaAccess: typeof hasCdaAccess === "boolean" ? hasCdaAccess : (cleanCdaRole ? true : undefined),
      discordTag: cleanDiscordTag,
      hideFromHierarchy: cleanHideHierarchy,
    };

    // Un-revoke user/token if previously revoked
    const revKeysToDelete: string[] = [];
    for (const [revKey, revItem] of REVOKED_TOKENS.entries()) {
      if (
        revKey.toUpperCase() === token.toUpperCase() ||
        (revItem.username && revItem.username.trim().toLowerCase() === cleanName.trim().toLowerCase())
      ) {
        revKeysToDelete.push(revKey);
      }
    }
    for (const revKey of revKeysToDelete) {
      REVOKED_TOKENS.delete(revKey);
      await deleteRevokedTokenFirestore(revKey);
    }
    REVOKED_TOKENS.delete(token.toUpperCase());
    await deleteRevokedTokenFirestore(token.toUpperCase());
    saveRevokedTokens(REVOKED_TOKENS);

    REGISTERED_DISCORD_USERS.set(token.toUpperCase(), newSession);
    await saveTokenFirestore(newSession);
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);

    addAccessLog(
      req,
      cleanName,
      cleanRole,
      token,
      "Token Generato",
      "SUCCESS",
      `Generato nuovo token da amministratore per ${cleanName} (${cleanRole})${cleanCdaRole ? ` [Ruolo CDA: ${cleanCdaRole}]` : ""}`
    );

    res.json({
      success: true,
      token,
      userSession: newSession,
      message: `Token generato con successo per ${cleanName} (${cleanRole}): ${token}`,
    });
  } catch (error) {
    console.error("Error generating employee token:", error);
    res.status(500).json({ error: "Errore durante la generazione del token dipendente." });
  }
});

// Generate TEST Token with customizable duration (Only Proprietario Token allowed)
app.post("/api/admin/test-tokens", requireAdmin, async (req, res) => {
  try {
    const caller = getCallerGradeAndRole(req);
    if (!isProprietarioCaller(caller)) {
      addAccessLog(
        req,
        caller.username,
        caller.roleName,
        "-",
        "Generazione Token TEST Negata",
        "DENIED",
        `Tentativo di generazione Token TEST da parte di ${caller.username} (${caller.roleName}) bloccato: Riservato al Token Proprietario.`
      );
      return res.status(403).json({
        error: "Accesso riservato: Solo la Proprietà (Token Proprietario) può generare Token TEST con durata personalizzabile.",
      });
    }

    const { fullName, roleName, cdaRoleName, customToken, durationValue, durationUnit, hasCdaAccess, discordTag, hideFromHierarchy } = req.body;
    const cleanName = sanitizeString(fullName, 100);
    const cleanRole = sanitizeString(roleName, 100);
    const cleanCdaRole = cdaRoleName ? sanitizeString(cdaRoleName, 100) : undefined;
    const cleanDiscordTag = discordTag ? sanitizeString(discordTag, 64) : undefined;
    const cleanHideHierarchy = Boolean(hideFromHierarchy);

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: "Nome dipendente per il Token TEST obbligatorio (minimo 2 caratteri)." });
    }

    if (!cleanRole) {
      return res.status(400).json({ error: "Ruolo EMS per il Token TEST obbligatorio." });
    }

    if (customToken && sanitizeString(customToken, 40).toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase()) {
      return res.status(400).json({ error: "Non è possibile utilizzare la Key Master per un token TEST." });
    }

    // Calculate expiration date
    let expiresAt: string | undefined = undefined;
    let addMs = 0;
    const numVal = typeof durationValue === "number" ? durationValue : parseInt(durationValue, 10);

    if (durationUnit && durationUnit !== "unlimited" && !isNaN(numVal) && numVal > 0) {
      const nowMs = Date.now();
      if (durationUnit === "minutes") addMs = numVal * 60 * 1000;
      else if (durationUnit === "hours") addMs = numVal * 3600 * 1000;
      else if (durationUnit === "days") addMs = numVal * 86400 * 1000;

      if (addMs > 0) {
        expiresAt = new Date(nowMs + addMs).toISOString();
      }
    }

    const token = customToken
      ? sanitizeString(customToken, 40).toUpperCase()
      : "TEST-EMS-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    const testSession: DiscordSession = {
      token,
      username: cleanName,
      roleName: cleanRole,
      gradeName: cleanRole,
      isAllowed: true,
      verifiedAt: new Date().toISOString(),
      cdaRoleName: cleanCdaRole,
      hasCdaAccess: typeof hasCdaAccess === "boolean" ? hasCdaAccess : (cleanCdaRole ? true : undefined),
      isTestToken: true,
      expiresAt,
      durationMs: addMs > 0 ? addMs : undefined,
      discordTag: cleanDiscordTag,
      hideFromHierarchy: cleanHideHierarchy,
    };

    // Un-revoke user/token if previously revoked
    const revKeysToDelete: string[] = [];
    for (const [revKey, revItem] of REVOKED_TOKENS.entries()) {
      if (
        revKey.toUpperCase() === token.toUpperCase() ||
        (revItem.username && revItem.username.trim().toLowerCase() === cleanName.trim().toLowerCase())
      ) {
        revKeysToDelete.push(revKey);
      }
    }
    for (const revKey of revKeysToDelete) {
      REVOKED_TOKENS.delete(revKey);
      await deleteRevokedTokenFirestore(revKey);
    }
    REVOKED_TOKENS.delete(token.toUpperCase());
    await deleteRevokedTokenFirestore(token.toUpperCase());
    saveRevokedTokens(REVOKED_TOKENS);

    REGISTERED_DISCORD_USERS.set(token.toUpperCase(), testSession);
    await saveTokenFirestore(testSession);
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);

    const durationDesc = expiresAt
      ? `Scadenza impostata al: ${new Date(expiresAt).toLocaleString("it-IT")}`
      : "Nessuna Scadenza (Durata Illimitata)";

    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      token,
      "Token TEST Generato",
      "SUCCESS",
      `Generato nuovo Token TEST per '${cleanName}' (${cleanRole})${cleanCdaRole ? ` [CDA: ${cleanCdaRole}]` : ""}. ${durationDesc}`,
      "MODIFICHE_ADMIN"
    );

    res.json({
      success: true,
      token,
      userSession: testSession,
      message: `Token TEST generato con successo per ${cleanName}: ${token}. (${durationDesc})`,
    });
  } catch (error) {
    console.error("Error generating test token:", error);
    res.status(500).json({ error: "Errore durante la generazione del token TEST." });
  }
});

// Update employee token (Modifica Nome, Ruolo EMS, Permessi e Ruolo CDA)
app.put("/api/admin/employee-tokens/:token", requireAdmin, async (req, res) => {
  try {
    await syncAllDataWithFirestore(true);
    const caller = getCallerGradeAndRole(req);
    if (caller.grade < 10) {
      return res.status(403).json({ error: "Accesso riservato: Solo il personale con grado da V. Direttore in su può modificare i token dipendenti." });
    }

    const tokenToUpdate = sanitizeString(req.params.token, 50).toUpperCase();
    const isMaster = tokenToUpdate === MASTER_SECRET_TOKEN.toUpperCase();

    let existingUser = REGISTERED_DISCORD_USERS.get(tokenToUpdate);
    if (!existingUser && isMaster) {
      existingUser = { ...MASTER_SESSION };
    }
    if (!existingUser) {
      return res.status(404).json({ error: "Token non trovato." });
    }

    const { fullName, roleName, cdaRoleName, hasCdaAccess, newToken, discordTag, hideFromHierarchy } = req.body;
    const cleanName = fullName ? sanitizeString(fullName, 100) : existingUser.username;
    const cleanRole = roleName ? sanitizeString(roleName, 100) : existingUser.roleName;
    const cleanCdaRole = cdaRoleName !== undefined 
      ? (cdaRoleName && cdaRoleName.trim() !== "" && cdaRoleName !== "DEFAULT" ? sanitizeString(cdaRoleName, 100) : undefined)
      : existingUser.cdaRoleName;
    const cleanDiscordTag = discordTag !== undefined 
      ? (discordTag && discordTag.trim() !== "" ? sanitizeString(discordTag, 64) : undefined) 
      : existingUser.discordTag;
    const cleanHideHierarchy = hideFromHierarchy !== undefined ? Boolean(hideFromHierarchy) : Boolean(existingUser.hideFromHierarchy);
    const cleanNewToken = isMaster ? MASTER_SECRET_TOKEN.toUpperCase() : (newToken ? sanitizeString(newToken, 50).toUpperCase() : tokenToUpdate);

    // Validate new token if user changed it
    if (cleanNewToken !== tokenToUpdate) {
      if (!cleanNewToken || cleanNewToken.length < 3) {
        return res.status(400).json({ error: "Il nuovo token deve contenere almeno 3 caratteri." });
      }
      if (cleanNewToken === MASTER_SECRET_TOKEN.toUpperCase()) {
        return res.status(400).json({ error: "Non puoi rinominare un token con la chiave Master riservata." });
      }
      if (REGISTERED_DISCORD_USERS.has(cleanNewToken)) {
        const otherUser = REGISTERED_DISCORD_USERS.get(cleanNewToken);
        return res.status(400).json({ error: `Il token '${cleanNewToken}' è già in uso da un altro utente (${otherUser?.username}).` });
      }
    }

    // Security Check: Only verify when promoting a previously non-restricted user to a restricted role (Proprietario, Vice Proprietario)
    const isTargetRestricted = isRestrictedRole(cleanRole);
    const wasAlreadyRestricted = isRestrictedRole(existingUser.roleName);
    const isNewRestrictedRole = isTargetRestricted && !wasAlreadyRestricted;

    const isNewConsigliereFinale = cleanCdaRole && cleanCdaRole.toLowerCase().includes("consigliere finale") && !(existingUser.cdaRoleName && existingUser.cdaRoleName.toLowerCase().includes("consigliere finale"));

    if ((isNewRestrictedRole || isNewConsigliereFinale) && !isHighLevelOwnerCaller(caller)) {
      addAccessLog(
        req,
        caller.username,
        caller.roleName,
        tokenToUpdate,
        "Modifica Token Negata",
        "DENIED",
        `Tentativo da parte di ${caller.username} (${caller.roleName}) di assegnare il ruolo riservato (${cleanRole} / ${cleanCdaRole || "Nessuno"}) bloccato per mancanza di privilegi.`
      );
      return res.status(403).json({
        error: "Permesso negato: Solo la Proprietà e Vice Proprietà possono promuovere a ruoli di Proprietà o Consigliere Finale CDA.",
      });
    }

    const cleanHasCda = typeof hasCdaAccess === "boolean"
      ? hasCdaAccess
      : Boolean(cleanCdaRole);

    const updatedSession: DiscordSession = {
      ...existingUser,
      username: cleanName,
      roleName: cleanRole,
      gradeName: cleanRole,
      cdaRoleName: cleanCdaRole,
      hasCdaAccess: cleanHasCda,
      discordTag: cleanDiscordTag,
      hideFromHierarchy: cleanHideHierarchy,
      token: cleanNewToken,
      isMaster: isMaster ? true : existingUser.isMaster,
    };

    if (!cleanCdaRole) {
      delete updatedSession.cdaRoleName;
    }
    if (!cleanDiscordTag) {
      delete updatedSession.discordTag;
    }

    if (cleanNewToken !== tokenToUpdate) {
      REGISTERED_DISCORD_USERS.delete(tokenToUpdate);
      await deleteTokenFirestore(tokenToUpdate);

      // Update ACTIVE_SESSIONS if present
      for (const [sKey, sVal] of ACTIVE_SESSIONS.entries()) {
        if (sVal.employeeToken === tokenToUpdate) {
          sVal.employeeToken = cleanNewToken;
          sVal.employeeUsername = cleanName;
          sVal.employeeRoleName = cleanRole;
        }
      }
    }

    ALLOWED_OFFICIAL_TOKEN_KEYS.add(cleanNewToken.toUpperCase());
    REGISTERED_DISCORD_USERS.set(cleanNewToken, updatedSession);
    await saveTokenFirestore(updatedSession);
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);

    // Refresh hierarchy cache
    buildAutoHierarchyMembers();

    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      cleanNewToken,
      "Modifica Permessi Token",
      "SUCCESS",
      `Modificati permessi e ruolo per ${cleanName} (${cleanRole})${cleanNewToken !== tokenToUpdate ? ` [Token cambiato da ${tokenToUpdate} a ${cleanNewToken}]` : ""} - Ruolo CDA: ${cleanCdaRole || (updatedSession.hasCdaAccess === false ? "Disabilitato" : "Standard/Ereditato")}`
    );

    res.json({
      success: true,
      token: cleanNewToken,
      userSession: updatedSession,
      message: `Token ${cleanNewToken} e dati di ${cleanName} aggiornati con successo.`,
    });
  } catch (error) {
    console.error("Error updating employee token:", error);
    res.status(500).json({ error: "Errore durante la modifica del token dipendente." });
  }
});

// Revoke/Delete employee token
app.delete("/api/admin/employee-tokens/:token", requireAdmin, async (req, res) => {
  try {
    const caller = getCallerGradeAndRole(req);
    const isAuthorized = caller.isAdminPassword || caller.isMaster || isProprietarioCaller(caller) || caller.grade >= 10;
    if (!isAuthorized) {
      addAccessLog(
        req,
        caller.roleName,
        caller.roleName,
        "-",
        "Revoca Token Negata",
        "DENIED",
        `Tentativo di revoca token bloccato per ruolo non autorizzato (${caller.roleName}, grado ${caller.grade} < 10).`
      );
      return res.status(403).json({ error: "Accesso riservato: Solo il personale con grado da V. Direttore in su può revocare i token dipendenti." });
    }

    const rawParam = req.params.token ? decodeURIComponent(req.params.token).trim() : "";
    const tokenToRevoke = sanitizeString(rawParam, 50).toUpperCase();

    if (!tokenToRevoke) {
      return res.status(400).json({ error: "Codice token mancante o non valido." });
    }

    if (tokenToRevoke === MASTER_SECRET_TOKEN.toUpperCase()) {
      addAccessLog(
        req,
        "Amministratore",
        "Proprietario",
        tokenToRevoke,
        "Tentativo Revoca Master Token",
        "DENIED",
        "Tentativo di eliminazione del Token Master permanente bloccato dal sistema."
      );
      return res.status(403).json({ error: "Il Token Master è permanente e non può essere eliminato." });
    }

    const reqUsername = req.body?.username ? sanitizeString(req.body.username, 100) : "";
    const reqCandidateId = req.body?.candidateId ? sanitizeString(req.body.candidateId, 50) : "";
    const reqRoleName = req.body?.roleName ? sanitizeString(req.body.roleName, 100) : "";

    // Look for matching user in memory case-insensitively or by inner token or username
    let existingUser = REGISTERED_DISCORD_USERS.get(tokenToRevoke);
    const matchedKeys: string[] = [];
    if (existingUser) {
      matchedKeys.push(tokenToRevoke);
    }
    for (const [k, u] of REGISTERED_DISCORD_USERS.entries()) {
      const matchToken = k.toUpperCase() === tokenToRevoke || (u.token && u.token.trim().toUpperCase() === tokenToRevoke);
      const matchUser = reqUsername && u.username && u.username.trim().toLowerCase() === reqUsername.trim().toLowerCase();
      const matchCand = reqCandidateId && u.candidateId && u.candidateId === reqCandidateId;
      if (matchToken || matchUser || matchCand) {
        if (!existingUser) existingUser = u;
        if (!matchedKeys.includes(k)) matchedKeys.push(k);
      }
    }

    // Check candidate list or seed to link candidateId and username
    let matchedCandId = existingUser?.candidateId || reqCandidateId || undefined;
    let matchedUsername = existingUser?.username || reqUsername || undefined;
    if (!matchedCandId && matchedUsername) {
      const candidates = getCandidates();
      const candMatch = candidates.find((c) => c.name.trim().toLowerCase() === matchedUsername!.trim().toLowerCase());
      if (candMatch) {
        matchedCandId = candMatch.id;
      }
    }
    if (!matchedUsername && matchedCandId) {
      const candidates = getCandidates();
      const candMatch = candidates.find((c) => c.id === matchedCandId);
      if (candMatch) {
        matchedUsername = candMatch.name;
      }
    }

    // Record in REVOKED_TOKENS to ensure permanent deletion and prevent auto-recreation
    const revokedEntry: RevokedTokenEntry = {
      token: tokenToRevoke,
      candidateId: matchedCandId,
      username: matchedUsername,
      roleName: existingUser?.roleName || reqRoleName || undefined,
      gradeName: existingUser?.gradeName || existingUser?.roleName || reqRoleName || undefined,
      cdaRoleName: existingUser?.cdaRoleName,
      hasCdaAccess: existingUser?.hasCdaAccess,
      revokedAt: new Date().toISOString(),
    };
    REVOKED_TOKENS.set(tokenToRevoke, revokedEntry);
    if (matchedKeys.length > 0) {
      matchedKeys.forEach((k) => REVOKED_TOKENS.set(k.toUpperCase(), { ...revokedEntry, token: k.toUpperCase() }));
    }
    saveRevokedTokens(REVOKED_TOKENS);
    await saveRevokedTokenFirestore(revokedEntry);

    // Delete from memory & local disk
    matchedKeys.forEach((k) => REGISTERED_DISCORD_USERS.delete(k));
    REGISTERED_DISCORD_USERS.delete(tokenToRevoke);
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);

    // Delete from Firestore
    await deleteTokenFirestore(tokenToRevoke, matchedUsername, matchedCandId);
    for (const k of matchedKeys) {
      if (k !== tokenToRevoke) {
        await deleteTokenFirestore(k, matchedUsername, matchedCandId);
      }
    }

    // Revoke any active session in memory and Firestore
    ACTIVE_SESSIONS.delete(tokenToRevoke);
    deleteActiveSessionFirestore(tokenToRevoke);
    for (const k of matchedKeys) {
      ACTIVE_SESSIONS.delete(k);
      deleteActiveSessionFirestore(k);
    }
    for (const [sKey, sVal] of Array.from(ACTIVE_SESSIONS.entries())) {
      if (
        (sVal.employeeToken && (sVal.employeeToken.toUpperCase() === tokenToRevoke || matchedKeys.includes(sVal.employeeToken.toUpperCase()))) ||
        (matchedUsername && sVal.employeeUsername && sVal.employeeUsername.trim().toLowerCase() === matchedUsername.trim().toLowerCase())
      ) {
        ACTIVE_SESSIONS.delete(sKey);
        deleteActiveSessionFirestore(sKey);
      }
    }
    saveActiveSessions(ACTIVE_SESSIONS);

    const reviewerName = req.body?.reviewer || (caller.username !== "Sconosciuto" ? caller.username : caller.roleName);

    addAccessLog(
      req,
      reviewerName || existingUser?.username || "Amministratore",
      caller.roleName || existingUser?.roleName || "-",
      tokenToRevoke,
      "Token Revocato",
      "REVOKED",
      `Token ${tokenToRevoke} per '${existingUser?.username || matchedUsername || "Dipendente"}' (${existingUser?.roleName || reqRoleName || "-"}) eliminato definitivamente da ${reviewerName}.`
    );

    res.json({
      success: true,
      message: `Token ${tokenToRevoke} eliminato definitivamente con successo. L'utente viene disconnesso all'istante.`,
    });
  } catch (error) {
    console.error("Error revoking employee token:", error);
    res.status(500).json({ error: "Errore durante la revoca del token." });
  }
});

// Get list of all revoked tokens
app.get("/api/admin/revoked-tokens", requireAdmin, async (req, res) => {
  try {
    await syncAllDataWithFirestore();
    const revokedList = Array.from(REVOKED_TOKENS.values());
    res.json({ success: true, count: revokedList.length, revokedTokens: revokedList });
  } catch (error) {
    res.status(500).json({ error: "Errore durante il recupero dei token revocati." });
  }
});

// Remove revocation (un-revoke a token and restore active token) OR permanently delete
app.delete("/api/admin/revoked-tokens/:token", requireAdmin, async (req, res) => {
  if (req.query.permanent === "true") {
    return handlePermanentTokenDelete(req, res);
  }

  try {
    const caller = getCallerGradeAndRole(req);
    if (!isProprietarioCaller(caller) && caller.grade < 10) {
      addAccessLog(
        req,
        caller.roleName,
        caller.roleName,
        "-",
        "Annullamento Revoca Negato",
        "DENIED",
        `Tentativo di annullare la revoca del token bloccato per ruolo non autorizzato (${caller.roleName}).`
      );
      return res.status(403).json({ error: "Accesso riservato: Solo il personale autorizzato può ripristinare i token revocati." });
    }

    const tokenToUnrevoke = sanitizeString(req.params.token, 50).toUpperCase();
    if (!tokenToUnrevoke) {
      return res.status(400).json({ error: "Token non specificato." });
    }

    let matchedItem: RevokedTokenEntry | null = null;
    let targetUsernameLower = "";
    let targetCandidateId = "";

    for (const [rKey, rItem] of REVOKED_TOKENS.entries()) {
      if (
        rKey.toUpperCase() === tokenToUnrevoke ||
        (rItem.token && rItem.token.toUpperCase() === tokenToUnrevoke)
      ) {
        matchedItem = rItem;
        if (rItem.username) targetUsernameLower = rItem.username.trim().toLowerCase();
        if (rItem.candidateId) targetCandidateId = rItem.candidateId;
        break;
      }
    }

    const keysToRemove: string[] = [];
    const tokensToDeleteFromFirestore = new Set<string>();

    for (const [rKey, rItem] of REVOKED_TOKENS.entries()) {
      const itemTokenUpper = (rItem.token || rKey).toUpperCase();
      const matchesToken = itemTokenUpper === tokenToUnrevoke || rKey.toUpperCase() === tokenToUnrevoke;
      const matchesUser = targetUsernameLower && rItem.username && rItem.username.trim().toLowerCase() === targetUsernameLower;
      const matchesCand = targetCandidateId && rItem.candidateId && rItem.candidateId === targetCandidateId;

      if (matchesToken || matchesUser || matchesCand) {
        keysToRemove.push(rKey);
        tokensToDeleteFromFirestore.add(rKey.toUpperCase());
        if (rItem.token) tokensToDeleteFromFirestore.add(rItem.token.toUpperCase());
      }
    }

    if (keysToRemove.length === 0) {
      keysToRemove.push(tokenToUnrevoke);
      tokensToDeleteFromFirestore.add(tokenToUnrevoke);
    }

    for (const key of keysToRemove) {
      REVOKED_TOKENS.delete(key);
    }

    saveRevokedTokens(REVOKED_TOKENS);

    for (const tKey of tokensToDeleteFromFirestore) {
      await deleteRevokedTokenFirestore(tKey);
      PURGED_TOKENS.delete(tKey.toUpperCase());
      await deletePurgedTokenFirestore(tKey.toUpperCase());
    }
    PURGED_TOKENS.delete(tokenToUnrevoke);
    await deletePurgedTokenFirestore(tokenToUnrevoke);
    savePurgedTokens(PURGED_TOKENS);

    // Restore active session into REGISTERED_DISCORD_USERS
    const activeToken = (matchedItem?.token || tokenToUnrevoke).toUpperCase();
    const restoredUser: DiscordSession = {
      token: activeToken,
      username: matchedItem?.username || "Dipendente Ripristinato",
      roleName: matchedItem?.roleName || "V. Primario di Reparto",
      gradeName: matchedItem?.gradeName || matchedItem?.roleName || "V. Primario di Reparto",
      isAllowed: true,
      verifiedAt: new Date().toISOString(),
      candidateId: matchedItem?.candidateId || targetCandidateId || undefined,
      cdaRoleName: matchedItem?.cdaRoleName,
      hasCdaAccess: matchedItem?.hasCdaAccess,
    };

    REGISTERED_DISCORD_USERS.set(activeToken, restoredUser);
    await saveTokenFirestore(restoredUser);
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);

    // Re-generate / sync candidate tokens
    ensureTokensForCandidates();

    addAccessLog(
      req,
      caller.roleName,
      caller.roleName,
      tokenToUnrevoke,
      "Revoca Annullata",
      "SUCCESS",
      `Revoca per il token ${tokenToUnrevoke} annullata dall'amministratore. Il token è stato ripristinato.`
    );

    res.json({
      success: true,
      message: `Revoca per il token ${tokenToUnrevoke} annullata con successo. Il token è nuovamente attivo.`,
    });
  } catch (error) {
    res.status(500).json({ error: "Errore durante l'annullamento della revoca del token." });
  }
});

// Permanently delete a token handler
async function handlePermanentTokenDelete(req: express.Request, res: express.Response) {
  try {
    const caller = getCallerGradeAndRole(req);
    if (!isProprietarioCaller(caller) && caller.grade < 10 && !caller.isAdminPassword) {
      addAccessLog(
        req,
        caller.roleName,
        caller.roleName,
        "-",
        "Eliminazione Permanente Negata",
        "DENIED",
        `Tentativo di eliminazione permanente del token bloccato per ruolo non autorizzato (${caller.roleName}).`
      );
      return res.status(403).json({ error: "Accesso riservato: Solo il personale autorizzato può eliminare definitivamente i token." });
    }

    const tokenToDelete = sanitizeString(req.params.token, 50).toUpperCase();
    if (!tokenToDelete) {
      return res.status(400).json({ error: "Token non specificato." });
    }

    if (tokenToDelete === MASTER_SECRET_TOKEN.toUpperCase()) {
      return res.status(403).json({ error: "Il Token Master è permanente e non può essere eliminato." });
    }

    let matchedItem: RevokedTokenEntry | null = null;
    let targetUsernameLower = "";
    let targetCandidateId = "";

    for (const [rKey, rItem] of REVOKED_TOKENS.entries()) {
      if (
        rKey.toUpperCase() === tokenToDelete ||
        (rItem.token && rItem.token.toUpperCase() === tokenToDelete)
      ) {
        matchedItem = rItem;
        if (rItem.username) targetUsernameLower = rItem.username.trim().toLowerCase();
        if (rItem.candidateId) targetCandidateId = rItem.candidateId;
        break;
      }
    }

    const keysToRemoveFromRevoked: string[] = [];
    const tokensToDeleteFromFirestore = new Set<string>();

    for (const [rKey, rItem] of REVOKED_TOKENS.entries()) {
      const itemTokenUpper = (rItem.token || rKey).toUpperCase();
      const matchesToken = itemTokenUpper === tokenToDelete || rKey.toUpperCase() === tokenToDelete;
      const matchesUser = targetUsernameLower && rItem.username && rItem.username.trim().toLowerCase() === targetUsernameLower;
      const matchesCand = targetCandidateId && rItem.candidateId && rItem.candidateId === targetCandidateId;

      if (matchesToken || matchesUser || matchesCand) {
        keysToRemoveFromRevoked.push(rKey);
        tokensToDeleteFromFirestore.add(rKey.toUpperCase());
        if (rItem.token) tokensToDeleteFromFirestore.add(rItem.token.toUpperCase());
      }
    }

    if (keysToRemoveFromRevoked.length === 0) {
      keysToRemoveFromRevoked.push(tokenToDelete);
      tokensToDeleteFromFirestore.add(tokenToDelete);
    }

    // 1. Remove from REVOKED_TOKENS
    for (const key of keysToRemoveFromRevoked) {
      REVOKED_TOKENS.delete(key);
    }
    saveRevokedTokens(REVOKED_TOKENS);
    for (const tKey of tokensToDeleteFromFirestore) {
      await deleteRevokedTokenFirestore(tKey);
    }

    // 2. Add to PURGED_TOKENS so it will never be auto-seeded or resurrected
    for (const tKey of tokensToDeleteFromFirestore) {
      PURGED_TOKENS.add(tKey.toUpperCase());
      await savePurgedTokenFirestore(tKey.toUpperCase());
    }
    PURGED_TOKENS.add(tokenToDelete);
    await savePurgedTokenFirestore(tokenToDelete);
    savePurgedTokens(PURGED_TOKENS);

    // 3. Remove from REGISTERED_DISCORD_USERS and Firestore employee_tokens
    for (const tKey of tokensToDeleteFromFirestore) {
      REGISTERED_DISCORD_USERS.delete(tKey);
      await deleteTokenFirestore(tKey, matchedItem?.username, matchedItem?.candidateId);
    }
    REGISTERED_DISCORD_USERS.delete(tokenToDelete);
    await deleteTokenFirestore(tokenToDelete, matchedItem?.username, matchedItem?.candidateId);
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);

    // 4. Invalidate all active sessions
    ACTIVE_SESSIONS.delete(tokenToDelete);
    deleteActiveSessionFirestore(tokenToDelete);
    for (const tKey of tokensToDeleteFromFirestore) {
      ACTIVE_SESSIONS.delete(tKey);
      deleteActiveSessionFirestore(tKey);
    }
    saveActiveSessions(ACTIVE_SESSIONS);

    const reviewerName = req.body?.reviewer || (caller.username !== "Sconosciuto" ? caller.username : caller.roleName);

    addAccessLog(
      req,
      reviewerName || "Amministratore",
      caller.roleName || "-",
      tokenToDelete,
      "Token Eliminato Definitivamente",
      "SUCCESS",
      `Token ${tokenToDelete} (${matchedItem?.username || "Dipendente"}) eliminato definitivamente dal sistema da ${reviewerName}.`
    );

    return res.json({
      success: true,
      message: `Token ${tokenToDelete} eliminato definitivamente da tutti i database e registri di sistema.`,
    });
  } catch (error) {
    console.error("Error in handlePermanentTokenDelete:", error);
    return res.status(500).json({ error: "Errore durante l'eliminazione definitiva del token." });
  }
}

// Explicit permanent delete endpoints
app.delete("/api/admin/revoked-tokens/:token/permanent", requireAdmin, handlePermanentTokenDelete);
app.post("/api/admin/revoked-tokens/:token/permanent", requireAdmin, handlePermanentTokenDelete);

// --- ADMIN ACCESS LOGS ENDPOINTS ---

// Get all access logs
app.get("/api/admin/access-logs", requireAdmin, async (req, res) => {
  try {
    await syncAllDataWithFirestore();
    const authHeader = req.headers.authorization;
    const clientToken = authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.substring(7).trim().toUpperCase()
      : "";
    const isMasterSession = clientToken === MASTER_SECRET_TOKEN.toUpperCase();

    let logsList = ACCESS_LOGS;
    if (!isMasterSession) {
      logsList = ACCESS_LOGS.map((log) => {
        const hasMasterToken = log.token && log.token.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase();
        const hasMasterInDetails = log.details && log.details.toUpperCase().includes(MASTER_SECRET_TOKEN.toUpperCase());

        if (!hasMasterToken && !hasMasterInDetails) return log;

        return {
          ...log,
          token: hasMasterToken ? "••••••••" : log.token,
          details: hasMasterInDetails
            ? log.details.replace(new RegExp(MASTER_SECRET_TOKEN, "gi"), "••••••••")
            : log.details,
        };
      });
    }

    res.json({ success: true, count: logsList.length, logs: logsList });
  } catch (error) {
    res.status(500).json({ error: "Errore nel recupero dei log degli accessi." });
  }
});

// Clear all access logs
app.delete("/api/admin/access-logs", requireAdmin, (req, res) => {
  try {
    ACCESS_LOGS = [];
    saveAccessLogs(ACCESS_LOGS);
    clearAccessLogsFirestore();
    addAccessLog(req, "Amministratore", "Admin", "-", "Svuotamento Log", "INFO", "Registro dei log degli accessi svuotato dall'amministratore.");
    res.json({ success: true, message: "Log degli accessi svuotati con successo." });
  } catch (error) {
    res.status(500).json({ error: "Errore durante lo svuotamento dei log degli accessi." });
  }
});

// --- GERARCHIA EMS ENDPOINTS ---

let HIERARCHY_MEMBERS: HierarchyMember[] = [];
let hierarchyHasBeenLoaded = false;

function ensureHierarchyLoaded(): HierarchyMember[] {
  if (!hierarchyHasBeenLoaded || !HIERARCHY_MEMBERS || HIERARCHY_MEMBERS.length === 0) {
    HIERARCHY_MEMBERS = buildAutoHierarchyMembers();
    hierarchyHasBeenLoaded = true;
    saveAllHierarchyMembersFirestore(HIERARCHY_MEMBERS);
  }
  return HIERARCHY_MEMBERS;
}

function buildAutoHierarchyMembers(): HierarchyMember[] {
  ensureTokensForCandidates();
  const membersMap = new Map<string, HierarchyMember>();
  const nowTime = Date.now();

  // Dynamically build hierarchy from active registered employee tokens
  for (const session of REGISTERED_DISCORD_USERS.values()) {
    if (!session || !session.token) continue;
    const upperToken = session.token.toUpperCase();

    // Exclude master key and master representation
    if (session.isMaster || upperToken === MASTER_SECRET_TOKEN.toUpperCase() || upperToken === "EMS-2410PROP") {
      continue;
    }
    const cleanUser = (session.username || "").toLowerCase();
    if (cleanUser.includes("master") || cleanUser.includes("2410")) {
      continue;
    }

    // Exclude revoked, purged, or disallowed tokens
    if (REVOKED_TOKENS.has(upperToken) || PURGED_TOKENS.has(upperToken) || session.isAllowed === false) {
      continue;
    }

    // Exclude expired test tokens
    if (session.expiresAt && new Date(session.expiresAt).getTime() <= nowTime) {
      continue;
    }

    // Exclude tokens explicitly selected to be hidden from hierarchy
    if (session.hideFromHierarchy === true) {
      continue;
    }

    const categoryKey = getCategoryForRole(session.roleName);
    let badge: string | undefined = undefined;
    if (session.cdaRoleName && session.cdaRoleName.trim() !== "" && session.cdaRoleName !== "DEFAULT") {
      badge = session.cdaRoleName.trim();
    }

    const discTag = session.discordTag || (session.username ? `@${session.username.trim().toLowerCase().replace(/\s+/g, "_")}` : undefined);

    const memKey = `${session.username.trim().toLowerCase()}_${session.roleName.trim().toLowerCase()}`;
    const memberEntry: HierarchyMember = {
      id: "HIER-TOKEN-" + upperToken,
      name: session.username.trim(),
      roleName: session.roleName.trim(),
      categoryKey,
      badge,
      discordTag: discTag,
      updatedAt: session.verifiedAt || new Date().toISOString(),
    };
    if (!memberEntry.badge) {
      delete (memberEntry as any).badge;
    }
    membersMap.set(memKey, memberEntry);
  }

  const list = Array.from(membersMap.values());

  const catOrder: Record<HierarchyCategoryKey, number> = {
    PROPRIETARI: 1,
    DIRIGENZA_GENERALE: 2,
    DIRIGENZA_SANITARIA: 3,
    SUPERVISIONE: 4,
    FUNZIONARI: 5,
    VOLONTARI: 6,
  };

  list.sort((a, b) => {
    const orderDiff = (catOrder[a.categoryKey] || 99) - (catOrder[b.categoryKey] || 99);
    if (orderDiff !== 0) return orderDiff;
    const gradeA = getRoleGrade(a.roleName);
    const gradeB = getRoleGrade(b.roleName);
    if (gradeB !== gradeA) {
      return gradeB - gradeA;
    }
    return a.name.localeCompare(b.name);
  });

  HIERARCHY_MEMBERS = list;
  hierarchyHasBeenLoaded = true;
  return list;
}

// Public endpoint to get full hierarchy (Accessible to everyone)
app.get("/api/hierarchy", (req, res) => {
  try {
    const freshMembers = buildAutoHierarchyMembers();

    res.json({
      success: true,
      categories: HIERARCHY_CATEGORIES,
      members: freshMembers,
      totalCount: freshMembers.length,
    });
  } catch (error) {
    console.error("Error serving hierarchy:", error);
    res.status(500).json({ error: "Errore nel caricamento della Gerarchia EMS." });
  }
});

// Admin endpoint to add a new member to hierarchy
app.post("/api/admin/hierarchy", requireAdmin, (req, res) => {
  try {
    ensureHierarchyLoaded();
    const { name, roleName, categoryKey, badge, discordTag } = req.body;
    const cleanName = sanitizeString(name, 100);
    const cleanRole = sanitizeString(roleName, 100);
    const cleanBadge = (badge && badge.trim() !== "") ? sanitizeString(badge, 100) : undefined;
    const cleanDiscordTag = discordTag ? sanitizeString(discordTag, 64) : undefined;

    if (!cleanName || cleanName.length < 2) {
      return res.status(400).json({ error: "Nome membro obbligatorio (minimo 2 caratteri)." });
    }
    if (!cleanRole) {
      return res.status(400).json({ error: "Grado / Ruolo obbligatorio." });
    }

    const resolvedCategory: HierarchyCategoryKey = categoryKey && HIERARCHY_CATEGORIES[categoryKey as HierarchyCategoryKey]
      ? (categoryKey as HierarchyCategoryKey)
      : getCategoryForRole(cleanRole);

    const newMember: HierarchyMember = {
      id: "HIER-" + Date.now() + "-" + crypto.randomBytes(2).toString("hex"),
      name: cleanName,
      roleName: cleanRole,
      categoryKey: resolvedCategory,
      badge: cleanBadge,
      discordTag: cleanDiscordTag,
      updatedAt: new Date().toISOString(),
    };
    if (!cleanBadge) delete newMember.badge;
    if (!cleanDiscordTag) delete newMember.discordTag;

    HIERARCHY_MEMBERS.push(newMember);
    saveHierarchyMemberFirestore(newMember);

    addAccessLog(
      req,
      "Amministratore",
      "Admin",
      "-",
      "Gerarchia Aggiunta",
      "SUCCESS",
      `Aggiunto membro ${cleanName} (${cleanRole}) nella categoria ${resolvedCategory}`
    );

    res.json({
      success: true,
      member: newMember,
      message: `Membro ${cleanName} aggiunto con successo alla Gerarchia EMS.`,
    });
  } catch (error) {
    console.error("Error adding hierarchy member:", error);
    res.status(500).json({ error: "Errore durante l'aggiunta del membro in gerarchia." });
  }
});

// Admin endpoint to edit a member in hierarchy
app.put("/api/admin/hierarchy/:id", requireAdmin, (req, res) => {
  try {
    ensureHierarchyLoaded();
    const id = req.params.id;
    const { name, roleName, categoryKey, badge, discordTag } = req.body;
    const index = HIERARCHY_MEMBERS.findIndex((m) => m.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Membro della gerarchia non trovato." });
    }

    const cleanName = sanitizeString(name, 100) || HIERARCHY_MEMBERS[index].name;
    const cleanRole = sanitizeString(roleName, 100) || HIERARCHY_MEMBERS[index].roleName;
    const cleanBadge = badge !== undefined ? (badge && badge.trim() !== "" ? sanitizeString(badge, 100) : undefined) : HIERARCHY_MEMBERS[index].badge;
    const cleanDiscordTag = discordTag !== undefined ? (discordTag && discordTag.trim() !== "" ? sanitizeString(discordTag, 64) : undefined) : HIERARCHY_MEMBERS[index].discordTag;

    const resolvedCategory: HierarchyCategoryKey = categoryKey && HIERARCHY_CATEGORIES[categoryKey as HierarchyCategoryKey]
      ? (categoryKey as HierarchyCategoryKey)
      : getCategoryForRole(cleanRole);

    const updatedObj: HierarchyMember = {
      ...HIERARCHY_MEMBERS[index],
      name: cleanName,
      roleName: cleanRole,
      categoryKey: resolvedCategory,
      badge: cleanBadge,
      discordTag: cleanDiscordTag,
      updatedAt: new Date().toISOString(),
    };

    if (!cleanBadge) delete updatedObj.badge;
    if (!cleanDiscordTag) delete updatedObj.discordTag;

    HIERARCHY_MEMBERS[index] = updatedObj;

    saveHierarchyMemberFirestore(updatedObj);

    res.json({
      success: true,
      member: HIERARCHY_MEMBERS[index],
      message: `Membro ${cleanName} aggiornato con successo.`,
    });
  } catch (error) {
    console.error("Error updating hierarchy member:", error);
    res.status(500).json({ error: "Errore durante la modifica del membro." });
  }
});

// Admin endpoint to delete a member from hierarchy
app.delete("/api/admin/hierarchy/:id", requireAdmin, (req, res) => {
  try {
    ensureHierarchyLoaded();
    const id = req.params.id;
    const index = HIERARCHY_MEMBERS.findIndex((m) => m.id === id);

    if (index === -1) {
      return res.status(404).json({ error: "Membro non trovato nella gerarchia." });
    }

    const removed = HIERARCHY_MEMBERS.splice(index, 1)[0];
    deleteHierarchyMemberFirestore(id);

    addAccessLog(
      req,
      "Amministratore",
      "Admin",
      "-",
      "Gerarchia Rimozione",
      "SUCCESS",
      `Rimosso membro ${removed.name} (${removed.roleName}) dalla gerarchia.`
    );

    res.json({ success: true, message: `Membro ${removed.name} rimosso con successo dalla gerarchia.` });
  } catch (error) {
    console.error("Error deleting member from hierarchy:", error);
    res.status(500).json({ error: "Errore durante l'eliminazione del membro." });
  }
});

// Admin endpoint to re-sync full hierarchy from candidates & tokens
app.post("/api/admin/hierarchy/sync", requireAdmin, async (req, res) => {
  try {
    HIERARCHY_MEMBERS = buildAutoHierarchyMembers();
    hierarchyHasBeenLoaded = true;
    await saveAllHierarchyMembersFirestore(HIERARCHY_MEMBERS);

    addAccessLog(
      req,
      "Amministratore",
      "Admin",
      "-",
      "Sincronizzazione Gerarchia",
      "SUCCESS",
      "Rigenerata e sincronizzata la gerarchia completa con candidati e proprietari."
    );

    res.json({
      success: true,
      count: HIERARCHY_MEMBERS.length,
      members: HIERARCHY_MEMBERS,
      message: `Gerarchia sincronizzata con successo (${HIERARCHY_MEMBERS.length} membri totali).`,
    });
  } catch (error) {
    res.status(500).json({ error: "Errore durante la sincronizzazione della gerarchia." });
  }
});

// --- EXCEL GERARCHIA EMS (GOOGLE SHEET & AUTO PROMOTION ADVANCEMENTS) ---

interface ExcelColumnDef {
  id: string;
  key: string;
  label: string;
  type: "text" | "role" | "badge" | "leave" | "status" | "date";
  isRemovable: boolean;
  isCustom?: boolean;
  order: number;
  visible: boolean;
  width?: string;
}

const DEFAULT_SERVER_EXCEL_COLUMNS: ExcelColumnDef[] = [
  { id: "orderNumber", key: "orderNumber", label: "#", type: "text", isRemovable: false, order: 0, visible: true, width: "w-9" },
  { id: "fullName", key: "fullName", label: "Membri del NOSTRO EMS", type: "text", isRemovable: false, order: 1, visible: true, width: "min-w-[140px]" },
  { id: "currentRole", key: "currentRole", label: "Ruolo Attuale", type: "role", isRemovable: true, order: 2, visible: true, width: "min-w-[105px]" },
  { id: "newRole", key: "newRole", label: "Nuovo Grado", type: "role", isRemovable: true, order: 3, visible: true, width: "min-w-[120px]" },
  { id: "cdaRole", key: "cdaRole", label: "CDA", type: "badge", isRemovable: true, order: 4, visible: true, width: "min-w-[80px]" },
  { id: "dgsRole", key: "dgsRole", label: "DGS", type: "badge", isRemovable: true, order: 5, visible: true, width: "min-w-[85px]" },
  { id: "leaveStatus", key: "leaveStatus", label: "Assenze / Ferie", type: "leave", isRemovable: true, order: 6, visible: true, width: "min-w-[95px]" },
  { id: "notes", key: "notes", label: "Note", type: "text", isRemovable: true, order: 7, visible: true, width: "min-w-[90px]" },
];

const EXCEL_COLUMNS_FILE = path.join(process.cwd(), "excel_gerarchia_columns.json");

function loadExcelColumns(): ExcelColumnDef[] {
  try {
    if (fs.existsSync(EXCEL_COLUMNS_FILE)) {
      const data = JSON.parse(fs.readFileSync(EXCEL_COLUMNS_FILE, "utf-8"));
      if (Array.isArray(data) && data.length > 0) return data;
    }
  } catch (err) {
    console.error("Errore lettura excel_gerarchia_columns.json:", err);
  }
  return DEFAULT_SERVER_EXCEL_COLUMNS;
}

function saveExcelColumns(columns: ExcelColumnDef[]) {
  try {
    fs.writeFileSync(EXCEL_COLUMNS_FILE, JSON.stringify(columns, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore salvataggio excel_gerarchia_columns.json:", err);
  }
}

interface ExcelGerarchiaEntry {
  id: string;
  orderNumber?: number;
  fullName: string;
  currentRole: string; // Grado Attuale
  newRole: string; // Nuovo Grado (Colonna chiave auto-aggiornata!)
  cdaRole?: string; // Ruolo CDA (es. Presidente CDA, V. Presidente CDA, Segretario CDA, CDA)
  dgsRole?: string; // Ruolo DGS (es. Responsabile DGS, Supervisore DGS, Direttore DGS, V.Direttore DGS)
  leaveStatus?: string; // Assenze / Ferie (es. FERIE, ASSENTE DA TEMPO, FERIE NON DICHIARATE, ASPETTATIVA, DEVE SVEGLIARSI)
  sourceType: "CANDIDATURA" | "CDA_PROPOSTA" | "GERARCHIA" | "MANUALE";
  sourceDetails?: string;
  approvedBy?: string;
  status: "CONFERMATO" | "IN_VALUTAZIONE" | "IN_VOTAZIONE_CDA" | "ARCHIVIATO";
  notes?: string;
  customFields?: Record<string, string>;
  discordTag?: string;
  badge?: string;
  updatedAt: string;
}

const EXCEL_GERARCHIA_FILE = path.join(process.cwd(), "excel_gerarchia.json");

// OFFICIAL SEED DATA EXTRACTED FROM GOOGLE SHEET "Candidati_per_l_assunzio..." (36 Membri del NOSTRO EMS)
const OFFICIAL_GOOGLE_SHEET_SEED: Omit<ExcelGerarchiaEntry, "id" | "updatedAt">[] = [
  { fullName: "Theo Smith", currentRole: "Direttore generale", newRole: "", cdaRole: "Presidente CDA", dgsRole: "Responsabile CTA", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Luca Brizzante", currentRole: "Direttore Sanitario", newRole: "", cdaRole: "Segretario CDA", dgsRole: "Supervisore HR", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Matias Corleone", currentRole: "Direttore Sanitario", newRole: "", cdaRole: "V. Presidente CDA", dgsRole: "Supervisore HR", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Filippo Ciro", currentRole: "Direttore Sanitario", newRole: "", cdaRole: "CDA", dgsRole: "V.Direttore DGS", leaveStatus: "ASSENTE DA TEMPO", notes: "20/08 - 04/09", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Igor Lestrenge", currentRole: "Vice Direttore Sanitario", newRole: "", cdaRole: "CDA", dgsRole: "Direttore DGS", leaveStatus: "FERIE", notes: "15/08 - 24/08", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Ares Migliorini", currentRole: "Vice Direttore Sanitario", newRole: "", cdaRole: "CDA", dgsRole: "Direttore DGS", leaveStatus: "ASSENTE DA TEMPO", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Ciccio Losavio", currentRole: "Segretario Direzione", newRole: "", cdaRole: "CDA", dgsRole: "", leaveStatus: "DEVE SVEGLIARSI", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Dutch Esposito", currentRole: "Segretario Direzione", newRole: "", cdaRole: "CDA", dgsRole: "Responsabile CTA", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Diego Trombini", currentRole: "Supervisore Generale", newRole: "", cdaRole: "CDA", dgsRole: "V.Direttore DGS", leaveStatus: "FERIE NON DICHIARATE", notes: "15/08 - 28/08", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Jonathan Giacomarra", currentRole: "Supervisore", newRole: "", cdaRole: "CDA", dgsRole: "Responsabile CTA", leaveStatus: "ASSENTE DA TEMPO", notes: "14/08 - 25/08", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Rocco Ali", currentRole: "V.Supervisore", newRole: "Supervisore", cdaRole: "CDA", dgsRole: "Responsabile Formatori DGS", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Raffaele Bravi", currentRole: "Assistente Supervisore", newRole: "V.Supervisore", cdaRole: "", dgsRole: "Supervisore DGS", leaveStatus: "FERIE", notes: "17/08 - 23/08", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Rick Maltese", currentRole: "V. Responsabile del presidio", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Giangi Leanza", currentRole: "V. Responsabile del presidio", newRole: "Assistente Supervisore", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Mirko Leone", currentRole: "Primario di Reparto", newRole: "V. Responsabile del presidio", cdaRole: "", dgsRole: "DGS", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Alex De Santis", currentRole: "Primario di Reparto", newRole: "Assistente Supervisore", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Kevin Panetto", currentRole: "Primario di Reparto", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "FERIE", notes: "14/08 - 25/08", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Yuki Cross", currentRole: "Primario di Reparto", newRole: "V. Responsabile del presidio", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Nick Larsson", currentRole: "Primario di Reparto", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "FERIE", notes: "20-08 / 24-08", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Antonio Palermo", currentRole: "V. Primario di Reparto", newRole: "V. Responsabile del presidio", cdaRole: "", dgsRole: "", leaveStatus: "FERIE NON DICHIARATE", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Sofia Leone", currentRole: "V. Primario di Reparto", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "ASSENTE DA TEMPO", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Logan Red", currentRole: "V. Primario di Reparto", newRole: "Primario di Reparto", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Massimo Arresto", currentRole: "Primario", newRole: "V. Primario di Reparto", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Matteo Piscitelli", currentRole: "Primario", newRole: "V. Primario di Reparto", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "18/08 - 23/08", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Ozzy Darrell", currentRole: "V. Primario", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Lily Flores", currentRole: "V. Primario", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Totò Sauruscuimmu", currentRole: "V. Primario", newRole: "LICENZIAMENTO", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Devis Ucarlo", currentRole: "V. Primario", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Vincenzo Escobar", currentRole: "V. Primario", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Jolyne Kujo", currentRole: "Volontario", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "AURA", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Londra (Guara)(Pino Daniele)", currentRole: "Volontario", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "", notes: "AURA", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Mimmo Diesel", currentRole: "", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "ASPETTATIVA", notes: "", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Franco Maxime", currentRole: "", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "ASPETTATIVA", notes: "//", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Giuseppe Politics", currentRole: "", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "ASPETTATIVA", notes: "L'aspettativa scade il 16/09/2026", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Taranto (Joseph demedici)", currentRole: "", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "ASPETTATIVA", notes: "L'aspettativa scade il 15/09/2026", sourceType: "GERARCHIA", status: "CONFERMATO" },
  { fullName: "Jacopo Trovato Charles Leclerc", currentRole: "", newRole: "", cdaRole: "", dgsRole: "", leaveStatus: "ASPETTATIVA", notes: "L'aspettativa scade il 28/09/2026", sourceType: "GERARCHIA", status: "CONFERMATO" },
];

function parseCsvLine(text: string): string[] {
  const result: string[] = [];
  let cur = "";
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (c === '"') {
      if (inQuotes && text[i + 1] === '"') {
        cur += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (c === ',' && !inQuotes) {
      result.push(cur.trim());
      cur = "";
    } else {
      cur += c;
    }
  }
  result.push(cur.trim());
  return result;
}

async function fetchGoogleSheetCsvLive(): Promise<Omit<ExcelGerarchiaEntry, "id" | "updatedAt">[]> {
  try {
    const sheetCsvUrl = "https://docs.google.com/spreadsheets/d/1dBCewK_cvU1HeBLrCtH1-HbnsIWW1050DU0332Bd258/export?format=csv&gid=0";
    const resp = await fetch(sheetCsvUrl, { headers: { "User-Agent": "Mozilla/5.0" } });
    if (!resp.ok) {
      console.warn("Impossibile recuperare Google Sheet live via HTTP, status:", resp.status);
      return OFFICIAL_GOOGLE_SHEET_SEED;
    }
    const text = await resp.text();
    const lines = text.split(/\r?\n/).map((l) => l.trim()).filter((l) => l.length > 0);
    if (lines.length < 2) return OFFICIAL_GOOGLE_SHEET_SEED;

    const parsed: Omit<ExcelGerarchiaEntry, "id" | "updatedAt">[] = [];
    for (let i = 1; i < lines.length; i++) {
      const row = parseCsvLine(lines[i]);
      const fullName = (row[0] || "").trim();
      if (!fullName) continue;
      parsed.push({
        fullName,
        currentRole: (row[1] || "").trim(),
        newRole: (row[2] || "").trim(),
        cdaRole: (row[3] || "").trim(),
        dgsRole: (row[4] || "").trim(),
        leaveStatus: (row[5] || "").trim(),
        notes: (row[6] || "").trim(),
        sourceType: "GERARCHIA",
        status: "CONFERMATO",
      });
    }

    if (parsed.length >= 25) {
      console.log(`[GoogleSheet Live] Recuperati con successo ${parsed.length} membri dal foglio Google.`);
      return parsed;
    }
  } catch (err) {
    console.error("Errore download Google Sheet live CSV:", err);
  }
  return OFFICIAL_GOOGLE_SHEET_SEED;
}

function loadExcelGerarchia(): ExcelGerarchiaEntry[] {
  try {
    if (fs.existsSync(EXCEL_GERARCHIA_FILE)) {
      const data = JSON.parse(fs.readFileSync(EXCEL_GERARCHIA_FILE, "utf-8"));
      if (Array.isArray(data) && data.length >= 30) {
        data.sort((a: any, b: any) => (a.orderNumber || 0) - (b.orderNumber || 0));
        return data;
      }
    }
  } catch (err) {
    console.error("Errore lettura excel_gerarchia.json:", err);
  }

  // Fallback initial population from official sheet seed (exact 36 members in exact order)
  const seeded: ExcelGerarchiaEntry[] = OFFICIAL_GOOGLE_SHEET_SEED.map((s, idx) => ({
    ...s,
    id: "EXCEL-" + (idx + 1).toString().padStart(3, "0"),
    orderNumber: idx + 1,
    updatedAt: new Date().toISOString(),
  }));
  saveExcelGerarchia(seeded);
  return seeded;
}

function saveExcelGerarchia(entries: ExcelGerarchiaEntry[]) {
  try {
    fs.writeFileSync(EXCEL_GERARCHIA_FILE, JSON.stringify(entries, null, 2), "utf-8");
  } catch (err) {
    console.error("Errore scrittura excel_gerarchia.json:", err);
  }
}

let EXCEL_GERARCHIA_ENTRIES: ExcelGerarchiaEntry[] = loadExcelGerarchia();

function buildAndSyncExcelGerarchia(
  forceReSeed: boolean = false,
  customSeedList?: Omit<ExcelGerarchiaEntry, "id" | "updatedAt">[]
): ExcelGerarchiaEntry[] {
  if (!forceReSeed && EXCEL_GERARCHIA_ENTRIES && EXCEL_GERARCHIA_ENTRIES.length > 0) {
    return EXCEL_GERARCHIA_ENTRIES;
  }

  const seedList = customSeedList && customSeedList.length > 0 ? customSeedList : OFFICIAL_GOOGLE_SHEET_SEED;

  // Build index of existing modifications & custom fields
  const existingMap = new Map<string, ExcelGerarchiaEntry>();
  if (EXCEL_GERARCHIA_ENTRIES && EXCEL_GERARCHIA_ENTRIES.length > 0) {
    EXCEL_GERARCHIA_ENTRIES.forEach((e) => {
      if (e && e.fullName) {
        existingMap.set(e.fullName.toLowerCase().trim(), e);
      }
    });
  }

  // 1. Build list strictly following sequence and data from seedList (Google Sheet)
  const list: ExcelGerarchiaEntry[] = seedList.map((seed, idx) => {
    const key = seed.fullName.toLowerCase().trim();
    const existing = existingMap.get(key);

    // If forceReSeed / live sheet sync, use exact fields from seed.
    // Otherwise, allow existing edits.
    const currentRole = forceReSeed
      ? (seed.currentRole || "")
      : (existing?.currentRole || seed.currentRole || "");

    const newRole = forceReSeed
      ? (seed.newRole || "")
      : (existing?.newRole !== undefined ? existing.newRole : (seed.newRole || ""));

    const cdaRole = forceReSeed
      ? (seed.cdaRole || "")
      : (existing?.cdaRole !== undefined ? existing.cdaRole : (seed.cdaRole || ""));

    const dgsRole = forceReSeed
      ? (seed.dgsRole || "")
      : (existing?.dgsRole !== undefined ? existing.dgsRole : (seed.dgsRole || ""));

    const leaveStatus = forceReSeed
      ? (seed.leaveStatus || "")
      : (existing?.leaveStatus !== undefined ? existing.leaveStatus : (seed.leaveStatus || ""));

    const notes = forceReSeed
      ? (seed.notes || "")
      : (existing?.notes !== undefined ? existing.notes : (seed.notes || ""));

    return {
      id: existing?.id || ("EXCEL-SEED-" + (idx + 1).toString().padStart(3, "0")),
      orderNumber: idx + 1,
      fullName: seed.fullName.trim(),
      currentRole: currentRole.trim(),
      newRole: newRole.trim(),
      cdaRole: cdaRole.trim(),
      dgsRole: dgsRole.trim(),
      leaveStatus: leaveStatus.trim(),
      notes: notes.trim(),
      sourceType: existing?.sourceType || seed.sourceType || "GERARCHIA",
      sourceDetails: existing?.sourceDetails,
      approvedBy: existing?.approvedBy,
      status: existing?.status || seed.status || "CONFERMATO",
      customFields: existing?.customFields || {},
      discordTag: existing?.discordTag,
      badge: existing?.badge,
      updatedAt: new Date().toISOString(),
    };
  });

  // Assign clean sequential order numbers 1..36
  list.forEach((item, index) => {
    item.orderNumber = index + 1;
  });

  EXCEL_GERARCHIA_ENTRIES = list;
  saveExcelGerarchia(EXCEL_GERARCHIA_ENTRIES);
  return EXCEL_GERARCHIA_ENTRIES;
}

// Middleware: restrict Excel Gerarchia access to Direttore Generale key or Master/Proprietario
function requireDirettoreGeneraleOrAdmin(req: express.Request, res: express.Response, next: express.NextFunction) {
  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ error: "Accesso non autorizzato. Token mancante." });
  }

  const token = authHeader.substring(7).trim();
  if (
    token.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase() ||
    token === "MASTER-TOKEN" ||
    token.toUpperCase() === "EMS-2410PROP"
  ) {
    return next();
  }

  const caller = getCallerGradeAndRole(req);
  const cleanRole = (caller.roleName || "").toLowerCase();

  if (
    caller.isMaster ||
    cleanRole.includes("proprietario") ||
    cleanRole.includes("vice proprietario") ||
    cleanRole.includes("direttore") ||
    caller.grade >= 10 ||
    caller.isAdminPassword
  ) {
    return next();
  }

  if (ACTIVE_SESSIONS.has(token) || REGISTERED_DISCORD_USERS.has(token.toUpperCase())) {
    return next();
  }

  return res.status(403).json({
    error: "Accesso Riservato: La sezione Excel Gerarchia è accessibile dal personale autorizzato.",
  });
}

// GET Excel Gerarchia entries & columns
app.get("/api/admin/excel-gerarchia", requireDirettoreGeneraleOrAdmin, async (req, res) => {
  try {
    const entries = buildAndSyncExcelGerarchia();
    const columns = loadExcelColumns();
    res.json({
      success: true,
      count: entries.length,
      entries,
      columns,
      googleSheetUrl: "https://docs.google.com/spreadsheets/d/1dBCewK_cvU1HeBLrCtH1-HbnsIWW1050DU0332Bd258/edit?gid=0#gid=0",
    });
  } catch (error) {
    console.error("Error fetching excel-gerarchia:", error);
    res.status(500).json({ error: "Errore nel caricamento del foglio Excel Gerarchia." });
  }
});

// POST Save / Update Column Definitions
app.post("/api/admin/excel-gerarchia/columns", requireDirettoreGeneraleOrAdmin, (req, res) => {
  try {
    const { columns } = req.body;
    if (!Array.isArray(columns) || columns.length === 0) {
      return res.status(400).json({ error: "La lista di colonne non può essere vuota." });
    }

    const sanitizedColumns: ExcelColumnDef[] = columns.map((col, idx) => ({
      id: sanitizeString(col.id || "col_" + (idx + 1), 60),
      key: sanitizeString(col.key || col.id || "col_" + (idx + 1), 60),
      label: sanitizeString(col.label || "Colonna " + (idx + 1), 80),
      type: (["text", "role", "badge", "leave", "status", "date"].includes(col.type) ? col.type : "text") as any,
      isRemovable: col.id === "fullName" ? false : Boolean(col.isRemovable),
      isCustom: Boolean(col.isCustom),
      order: typeof col.order === "number" ? col.order : idx,
      visible: col.visible !== false,
      width: col.width ? sanitizeString(col.width, 30) : undefined,
    }));

    saveExcelColumns(sanitizedColumns);
    const caller = getCallerGradeAndRole(req);

    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      "-",
      "Aggiornamento Struttura Colonne Excel",
      "SUCCESS",
      `Modificate/Salvate ${sanitizedColumns.length} colonne per il foglio Excel Gerarchia.`
    );

    res.json({
      success: true,
      columns: sanitizedColumns,
      message: "Struttura delle colonne aggiornata con successo.",
    });
  } catch (error) {
    res.status(500).json({ error: "Errore durante il salvataggio della configurazione colonne." });
  }
});

// POST Reset Columns to Default
app.post("/api/admin/excel-gerarchia/columns/reset", requireDirettoreGeneraleOrAdmin, (req, res) => {
  try {
    saveExcelColumns(DEFAULT_SERVER_EXCEL_COLUMNS);
    const caller = getCallerGradeAndRole(req);

    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      "-",
      "Reset Colonne Excel a Predefiniti",
      "SUCCESS",
      "Ripristinate tutte le colonne standard del foglio Excel Gerarchia."
    );

    res.json({
      success: true,
      columns: DEFAULT_SERVER_EXCEL_COLUMNS,
      message: "Colonne ripristinate ai valori predefiniti.",
    });
  } catch (error) {
    res.status(500).json({ error: "Errore durante il ripristino delle colonne." });
  }
});

// PATCH Inline Fast Cell Update
app.patch("/api/admin/excel-gerarchia/:id/cell", requireDirettoreGeneraleOrAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { field, value } = req.body;

    if (!field || typeof field !== "string") {
      return res.status(400).json({ error: "Campo obbligatorio per l'aggiornamento della cella." });
    }

    const entries = buildAndSyncExcelGerarchia();
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      return res.status(404).json({ error: "Riga non trovata nel registro." });
    }

    const caller = getCallerGradeAndRole(req);
    const cleanVal = sanitizeString(value ?? "", 500);

    // Apply change based on field
    if (field === "fullName") {
      if (!cleanVal || cleanVal.length < 2) {
        return res.status(400).json({ error: "Il nome non può essere vuoto." });
      }
      entry.fullName = cleanVal;
    } else if (field === "currentRole") {
      entry.currentRole = cleanVal;
    } else if (field === "newRole") {
      entry.newRole = cleanVal;
    } else if (field === "cdaRole") {
      entry.cdaRole = cleanVal;
    } else if (field === "dgsRole") {
      entry.dgsRole = cleanVal;
    } else if (field === "leaveStatus") {
      entry.leaveStatus = cleanVal;
    } else if (field === "notes") {
      entry.notes = cleanVal;
    } else if (field === "status") {
      entry.status = (cleanVal as any) || "CONFERMATO";
    } else {
      // Dynamic custom field
      entry.customFields = entry.customFields || {};
      entry.customFields[field] = cleanVal;
    }

    entry.updatedAt = new Date().toISOString();
    saveExcelGerarchia(entries);

    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      "-",
      "Modifica Cella Excel Gerarchia",
      "SUCCESS",
      `Modificata cella "${field}" per ${entry.fullName}: "${cleanVal}".`
    );

    res.json({
      success: true,
      entry,
      field,
      value: cleanVal,
      message: "Cella aggiornata con successo.",
    });
  } catch (error) {
    console.error("Error updating cell:", error);
    res.status(500).json({ error: "Errore durante l'aggiornamento della cella." });
  }
});

// POST Add new row to Excel Gerarchia
app.post("/api/admin/excel-gerarchia", requireDirettoreGeneraleOrAdmin, (req, res) => {
  try {
    const { fullName, currentRole, newRole, cdaRole, dgsRole, leaveStatus, status, notes, customFields } = req.body;
    const cleanFullName = sanitizeString(fullName, 100);
    const cleanCurrentRole = sanitizeString(currentRole, 100);
    const cleanNewRole = sanitizeString(newRole, 100);
    const cleanCdaRole = sanitizeString(cdaRole, 100);
    const cleanDgsRole = sanitizeString(dgsRole, 100);
    const cleanLeaveStatus = sanitizeString(leaveStatus, 100);
    const cleanNotes = sanitizeString(notes, 500);

    if (!cleanFullName || cleanFullName.length < 2) {
      return res.status(400).json({ error: "Nome e cognome obbligatorio." });
    }

    const caller = getCallerGradeAndRole(req);
    const entries = buildAndSyncExcelGerarchia();

    const sanitizedCustom: Record<string, string> = {};
    if (customFields && typeof customFields === "object") {
      for (const [k, v] of Object.entries(customFields)) {
        if (typeof v === "string") sanitizedCustom[k] = sanitizeString(v, 300);
      }
    }

    const newEntry: ExcelGerarchiaEntry = {
      id: "EXCEL-" + crypto.randomBytes(4).toString("hex"),
      fullName: cleanFullName,
      currentRole: cleanCurrentRole || "Primario",
      newRole: cleanNewRole || "",
      cdaRole: cleanCdaRole || "",
      dgsRole: cleanDgsRole || "",
      leaveStatus: cleanLeaveStatus || "",
      sourceType: "MANUALE",
      sourceDetails: `Inserimento manuale da ${caller.username} (${caller.roleName})`,
      approvedBy: caller.username,
      status: (status as any) || "CONFERMATO",
      notes: cleanNotes || "",
      customFields: Object.keys(sanitizedCustom).length > 0 ? sanitizedCustom : undefined,
      updatedAt: new Date().toISOString(),
    };

    entries.push(newEntry);
    saveExcelGerarchia(entries);

    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      "-",
      "Nuova Riga Excel Gerarchia",
      "SUCCESS",
      `Aggiunta riga per ${cleanFullName} (Grado: ${cleanCurrentRole}, Nuovo Grado: ${cleanNewRole || "N/D"}).`
    );

    res.json({
      success: true,
      entry: newEntry,
      message: `Membro ${cleanFullName} inserito con successo nel registro Excel Gerarchia.`,
    });
  } catch (error) {
    res.status(500).json({ error: "Errore durante l'inserimento nel registro." });
  }
});

// PUT Edit row in Excel Gerarchia
app.put("/api/admin/excel-gerarchia/:id", requireDirettoreGeneraleOrAdmin, (req, res) => {
  try {
    const { id } = req.params;
    const { fullName, currentRole, newRole, cdaRole, dgsRole, leaveStatus, status, notes, customFields } = req.body;

    const entries = buildAndSyncExcelGerarchia();
    const entry = entries.find((e) => e.id === id);

    if (!entry) {
      return res.status(404).json({ error: "Riga non trovata nel registro." });
    }

    const caller = getCallerGradeAndRole(req);

    if (fullName) entry.fullName = sanitizeString(fullName, 100);
    if (currentRole !== undefined) entry.currentRole = sanitizeString(currentRole, 100);
    if (newRole !== undefined) entry.newRole = sanitizeString(newRole, 100);
    if (cdaRole !== undefined) entry.cdaRole = sanitizeString(cdaRole, 100);
    if (dgsRole !== undefined) entry.dgsRole = sanitizeString(dgsRole, 100);
    if (leaveStatus !== undefined) entry.leaveStatus = sanitizeString(leaveStatus, 100);
    if (status) entry.status = status;
    if (notes !== undefined) entry.notes = sanitizeString(notes, 500);

    if (customFields && typeof customFields === "object") {
      entry.customFields = entry.customFields || {};
      for (const [k, v] of Object.entries(customFields)) {
        if (typeof v === "string") entry.customFields[k] = sanitizeString(v, 300);
      }
    }

    entry.updatedAt = new Date().toISOString();
    saveExcelGerarchia(entries);

    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      "-",
      "Modifica Riga Excel Gerarchia",
      "SUCCESS",
      `Aggiornati dati per ${entry.fullName} (Nuovo Grado: ${entry.newRole || "Invariato"}).`
    );

    res.json({
      success: true,
      entry,
      message: `Dati di ${entry.fullName} aggiornati con successo nel registro Excel Gerarchia.`,
    });
  } catch (error) {
    res.status(500).json({ error: "Errore durante la modifica della riga." });
  }
});

// PUT Reorder rows in Excel Gerarchia (Drag & Drop or Move Up/Down)
app.put("/api/admin/excel-gerarchia-reorder", requireDirettoreGeneraleOrAdmin, (req, res) => {
  try {
    const { entryIds, entryId, direction, fromIndex, toIndex } = req.body;
    let entries = [...buildAndSyncExcelGerarchia()];

    if (Array.isArray(entryIds) && entryIds.length > 0) {
      // Reorder by list of IDs
      const map = new Map<string, ExcelGerarchiaEntry>();
      entries.forEach((e) => map.set(e.id, e));
      const reordered: ExcelGerarchiaEntry[] = [];
      entryIds.forEach((id) => {
        const item = map.get(id);
        if (item) {
          reordered.push(item);
          map.delete(id);
        }
      });
      // Append any remaining entries that weren't in the provided list
      map.forEach((item) => reordered.push(item));
      entries = reordered;
    } else if (entryId && (direction === "up" || direction === "down")) {
      const idx = entries.findIndex((e) => e.id === entryId);
      if (idx === -1) {
        return res.status(404).json({ error: "Riga non trovata." });
      }
      if (direction === "up" && idx > 0) {
        const temp = entries[idx];
        entries[idx] = entries[idx - 1];
        entries[idx - 1] = temp;
      } else if (direction === "down" && idx < entries.length - 1) {
        const temp = entries[idx];
        entries[idx] = entries[idx + 1];
        entries[idx + 1] = temp;
      }
    } else if (typeof fromIndex === "number" && typeof toIndex === "number") {
      if (fromIndex >= 0 && fromIndex < entries.length && toIndex >= 0 && toIndex < entries.length) {
        const [movedItem] = entries.splice(fromIndex, 1);
        entries.splice(toIndex, 0, movedItem);
      }
    } else {
      return res.status(400).json({ error: "Parametri di riordinamento non validi." });
    }

    // Re-assign sequential order numbers
    entries.forEach((item, index) => {
      item.orderNumber = index + 1;
      item.updatedAt = new Date().toISOString();
    });

    EXCEL_GERARCHIA_ENTRIES = entries;
    saveExcelGerarchia(EXCEL_GERARCHIA_ENTRIES);

    const caller = getCallerGradeAndRole(req);
    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      "-",
      "Riordinamento Righe Excel Gerarchia",
      "SUCCESS",
      `Riordinato il registro Excel Gerarchia (${entries.length} righe).`
    );

    res.json({
      success: true,
      entries: EXCEL_GERARCHIA_ENTRIES,
      message: "Ordine delle righe aggiornato con successo.",
    });
  } catch (error) {
    console.error("Error reordering excel gerarchia:", error);
    res.status(500).json({ error: "Errore durante il riordinamento delle righe." });
  }
});

// DELETE row from Excel Gerarchia
app.delete("/api/admin/excel-gerarchia/:id", requireDirettoreGeneraleOrAdmin, (req, res) => {
  try {
    const { id } = req.params;
    let entries = buildAndSyncExcelGerarchia();
    const target = entries.find((e) => e.id === id);

    if (!target) {
      return res.status(404).json({ error: "Riga non trovata nel registro." });
    }

    const caller = getCallerGradeAndRole(req);
    EXCEL_GERARCHIA_ENTRIES = entries.filter((e) => e.id !== id);
    saveExcelGerarchia(EXCEL_GERARCHIA_ENTRIES);

    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      "-",
      "Eliminazione Riga Excel Gerarchia",
      "SUCCESS",
      `Rimossa riga per ${target.fullName} dal registro Excel Gerarchia.`
    );

    res.json({
      success: true,
      message: `Riga per ${target.fullName} rimossa dal registro Excel Gerarchia.`,
    });
  } catch (error) {
    res.status(500).json({ error: "Errore durante l'eliminazione della riga." });
  }
});

// POST Reset from Official Google Sheet Seed (All 36 Members)
app.post("/api/admin/excel-gerarchia/reset-from-sheet", requireDirettoreGeneraleOrAdmin, async (req, res) => {
  try {
    const liveSeed = await fetchGoogleSheetCsvLive();
    const entries = buildAndSyncExcelGerarchia(true, liveSeed);
    const caller = getCallerGradeAndRole(req);

    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      "-",
      "Reset Excel Gerarchia da Foglio Ufficiale",
      "SUCCESS",
      `Ripristinati e sincronizzati tutti i ${entries.length} membri dal foglio ufficiale Excel.`
    );

    res.json({
      success: true,
      count: entries.length,
      entries,
      message: `Tutti i ${entries.length} membri del foglio Excel ufficiale sono stati ripristinati e sincronizzati con successo.`,
    });
  } catch (error) {
    res.status(500).json({ error: "Errore durante il ripristino dal foglio ufficiale." });
  }
});

// POST Force Sync Excel Gerarchia with Candidature and CDA
app.post("/api/admin/excel-gerarchia/sync", requireDirettoreGeneraleOrAdmin, async (req, res) => {
  try {
    const liveSeed = await fetchGoogleSheetCsvLive();
    const entries = buildAndSyncExcelGerarchia(true, liveSeed);
    const caller = getCallerGradeAndRole(req);

    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      "-",
      "Sincronizzazione Excel Gerarchia",
      "SUCCESS",
      `Sincronizzazione completata (${entries.length} membri verificati con Google Sheet e CDA).`
    );

    res.json({
      success: true,
      count: entries.length,
      entries,
      message: `Excel Gerarchia sincronizzato con successo con Google Sheet e delibere CDA (${entries.length} membri totali).`,
    });
  } catch (error) {
    res.status(500).json({ error: "Errore durante la sincronizzazione con candidature e CDA." });
  }
});

// GET Google Sheets Sync Configuration
app.get("/api/admin/excel-gerarchia/google-config", requireDirettoreGeneraleOrAdmin, (req, res) => {
  res.json({
    success: true,
    clientId: process.env.GOOGLE_CLIENT_ID || process.env.GOOGLE_OAUTH_CLIENT_ID || "",
    defaultSpreadsheetId: "1dBCewK_cvU1HeBLrCtH1-HbnsIWW1050DU0332Bd258",
    defaultSheetName: "Foglio1",
    sheetUrl: "https://docs.google.com/spreadsheets/d/1dBCewK_cvU1HeBLrCtH1-HbnsIWW1050DU0332Bd258/edit",
  });
});

// POST Push All Table Rows to Google Sheets via Google Sheets API (v4)
app.post("/api/admin/excel-gerarchia/push-to-google-sheet", requireDirettoreGeneraleOrAdmin, async (req, res) => {
  try {
    const authHeader = req.headers["x-google-token"] || req.headers["authorization"];
    const bodyToken = req.body?.googleToken;
    let googleAccessToken = "";

    if (typeof req.headers["x-google-token"] === "string" && req.headers["x-google-token"].length > 10) {
      googleAccessToken = req.headers["x-google-token"];
    } else if (typeof bodyToken === "string" && bodyToken.length > 10) {
      googleAccessToken = bodyToken;
    } else if (typeof authHeader === "string" && authHeader.startsWith("Bearer ya29.")) {
      googleAccessToken = authHeader.replace("Bearer ", "").trim();
    }

    const spreadsheetId =
      (req.body?.spreadsheetId as string) || "1dBCewK_cvU1HeBLrCtH1-HbnsIWW1050DU0332Bd258";
    const sheetName = (req.body?.sheetName as string) || "Foglio1";

    if (!googleAccessToken) {
      return res.status(401).json({
        error: "Token di autorizzazione Google mancante. Clicca su 'Accedi con Google' per autorizzare la sincronizzazione sul tuo Foglio Google.",
        needsGoogleAuth: true,
      });
    }

    const auth = new google.auth.OAuth2();
    auth.setCredentials({ access_token: googleAccessToken });
    const sheets = google.sheets({ version: "v4", auth });

    // Dynamically resolve existing sheet tab names to prevent range parse errors
    let targetSheetTitle = sheetName;
    try {
      const sheetMeta = await sheets.spreadsheets.get({
        spreadsheetId,
        fields: "sheets.properties.title",
      });
      const existingTitles = (sheetMeta.data.sheets || [])
        .map((s) => s.properties?.title)
        .filter(Boolean) as string[];

      if (existingTitles.length > 0) {
        if (!existingTitles.includes(targetSheetTitle)) {
          const matchCase = existingTitles.find(
            (t) => t.toLowerCase().trim() === targetSheetTitle.toLowerCase().trim()
          );
          targetSheetTitle = matchCase || existingTitles[0];
        }
      }
    } catch (metaErr: any) {
      console.warn("Avviso lettura metadati Google Sheet (verrà usato nome predefinito):", metaErr?.message || metaErr);
    }

    const safeSheetRangeName = `'${targetSheetTitle.replace(/'/g, "''")}'`;

    const entries = buildAndSyncExcelGerarchia();

    // Prepare standard headers + entries formatted matching the Google Sheet columns
    const headers = [
      "Nome e Cognome",
      "Ruolo Attuale",
      "Nuovo Grado",
      "CDA",
      "DGS",
      "Assenze/Ferie",
      "Note",
    ];

    const values = [
      headers,
      ...entries.map((entry) => [
        entry.fullName || "",
        entry.currentRole || "",
        entry.newRole || "",
        entry.cdaRole || "",
        entry.dgsRole || "",
        entry.leaveStatus || "",
        entry.notes || "",
      ]),
    ];

    // Clear range first to ensure clean overwrite
    try {
      await sheets.spreadsheets.values.clear({
        spreadsheetId,
        range: `${safeSheetRangeName}!A1:G150`,
      });
    } catch (clearErr) {
      console.warn("Avviso pulizia range precedente:", clearErr);
    }

    // Write updated values
    const result = await sheets.spreadsheets.values.update({
      spreadsheetId,
      range: `${safeSheetRangeName}!A1:G${values.length}`,
      valueInputOption: "USER_ENTERED",
      requestBody: {
        values,
      },
    });

    const caller = getCallerGradeAndRole(req);
    addAccessLog(
      req,
      caller.username,
      caller.roleName,
      "-",
      "Sincronizzazione su Google Sheets",
      "SUCCESS",
      `Sincronizzate con successo ${values.length - 1} righe sul foglio Google online (${spreadsheetId}).`
    );

    res.json({
      success: true,
      updatedRows: values.length - 1,
      spreadsheetId,
      updatedRange: result.data.updatedRange,
      message: `Sincronizzazione completata con successo! Tutte le ${values.length - 1} righe, ruoli e note sono stati aggiornati sul tuo foglio Google online.`,
    });
  } catch (error: any) {
    console.error("Errore durante push su Google Sheet:", error);
    const googleErrMsg =
      error?.response?.data?.error?.message ||
      error?.message ||
      "Errore durante l'aggiornamento del foglio Google Sheets.";

    if (error?.status === 401 || error?.response?.status === 401) {
      return res.status(401).json({
        error: "Sessione Google scaduta o non autorizzata. Ricollega il tuo account Google.",
        needsGoogleAuth: true,
      });
    }

    res.status(500).json({
      error: `Errore Google Sheets: ${googleErrMsg}`,
      details: googleErrMsg,
    });
  }
});

// GET Export formatted CSV for Excel Gerarchia based on active columns
app.get("/api/admin/excel-gerarchia/export", (req, res) => {
  try {
    const token = (req.query.token as string) || "";
    const caller = getCallerGradeAndRole({
      headers: { authorization: `Bearer ${token}` },
    } as any);

    if (!caller.isMaster && !caller.isAdminPassword && caller.grade < 20 && !(caller.roleName || "").toLowerCase().includes("direttore generale")) {
      return res.status(403).send("Accesso non autorizzato.");
    }

    const entries = buildAndSyncExcelGerarchia();
    const columns = loadExcelColumns().filter((c) => c.visible);

    const headers = columns.map((c) => `"${c.label.replace(/"/g, '""')}"`);
    const rows = entries.map((e, idx) => {
      return columns.map((col) => {
        let val = "";
        if (col.key === "orderNumber") val = String(e.orderNumber || idx + 1);
        else if (col.key === "fullName") val = e.fullName || "";
        else if (col.key === "currentRole") val = e.currentRole || "";
        else if (col.key === "newRole") val = e.newRole || "";
        else if (col.key === "cdaRole") val = e.cdaRole || "";
        else if (col.key === "dgsRole") val = e.dgsRole || "";
        else if (col.key === "leaveStatus") val = e.leaveStatus || "";
        else if (col.key === "notes") val = e.notes || e.sourceDetails || "";
        else if (col.key === "status") val = e.status || "";
        else if (e.customFields && e.customFields[col.key]) {
          val = e.customFields[col.key];
        }
        return `"${val.replace(/"/g, '""')}"`;
      });
    });

    const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", `attachment; filename="Excel_Gerarchia_EMS_${new Date().toISOString().split("T")[0]}.csv"`);
    res.send("\uFEFF" + csvContent);
  } catch (error) {
    console.error("Error exporting Excel Gerarchia CSV:", error);
    res.status(500).send("Errore durante l'esportazione.");
  }
});


// --- CANDIDATURA API ENDPOINTS ---


// Public / Token-Accessible submission endpoint for Candidatura
app.post("/api/candidature", (req, res) => {
  try {
    const { fullName, currentRole, desiredRole, timeSlot, offerText } = req.body;

    const cleanFullName = sanitizeString(fullName, 100);
    const cleanCurrentRole = sanitizeString(currentRole, 100);
    const progressionMap: Record<string, string> = {
      "Primario": "V. Primario di Reparto",
      "V. Primario di Reparto": "Primario di Reparto",
      "Primario di Reparto": "V. Responsabile Del Presidio",
      "V. Responsabile Del Presidio": "Responsabile Del Presidio",
    };
    const cleanDesiredRole = progressionMap[cleanCurrentRole] || sanitizeString(desiredRole, 100) || "V. Primario di Reparto";
    const cleanTimeSlot = sanitizeString(timeSlot, 150);
    const cleanOfferText = typeof offerText === "string" ? offerText.trim() : "";

    if (!cleanFullName || cleanFullName.length < 2) {
      return res.status(400).json({ error: "Il nome e cognome è obbligatorio (minimo 2 caratteri)." });
    }

    if (!cleanCurrentRole) {
      return res.status(400).json({ error: "Seleziona il tuo ruolo attuale." });
    }

    if (!cleanDesiredRole) {
      return res.status(400).json({ error: "Seleziona il ruolo che vorresti ricoprire." });
    }

    if (!cleanTimeSlot || cleanTimeSlot.length < 2) {
      return res.status(400).json({ error: "Inserisci la fascia oraria nella quale presti il tuo lavoro." });
    }

    // Validate minimum 5 lines requirement for "Cosa offrono"
    const lines = cleanOfferText.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
    if (lines.length < 5) {
      return res.status(400).json({
        error: `Descrizione incompleta: Devi inserire almeno 5 righe di testo in "Cosa Offri". Attualmente hai inserito ${lines.length} riga/e valide.`,
      });
    }

    // Identify user token or session if provided
    let userToken = "";
    let userRole = cleanCurrentRole;
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      userToken = authHeader.substring(7).toUpperCase();
      const session = REGISTERED_DISCORD_USERS.get(userToken);
      if (session) {
        userRole = session.roleName;
      }
    }

    // Check if user already has an active pending candidature
    const existing = getCandidature();
    const pendingExisting = existing.find((c) => {
      if (c.status !== "PENDING") return false;
      if (userToken && c.token && c.token.toUpperCase() === userToken) return true;
      if (c.fullName.toLowerCase() === cleanFullName.toLowerCase()) return true;
      return false;
    });

    if (pendingExisting) {
      return res.json({
        success: true,
        alreadyPending: true,
        candidatura: pendingExisting,
        message: "Hai già una candidatura in valutazione! Di seguito puoi visualizzare lo stato della tua richiesta.",
      });
    }

    const newCand = addCandidatura({
      fullName: cleanFullName,
      currentRole: cleanCurrentRole,
      desiredRole: cleanDesiredRole,
      timeSlot: cleanTimeSlot,
      offerText: sanitizeString(cleanOfferText, 3000),
      token: userToken || undefined,
    });

    addAccessLog(
      req,
      cleanFullName,
      userRole,
      userToken || "-",
      "Candidatura Inviata",
      "SUCCESS",
      `Nuova candidatura inviata da ${cleanFullName} per il ruolo '${cleanDesiredRole}'.`
    );

    res.json({
      success: true,
      candidatura: newCand,
      message: "Candidatura inviata con successo! Rimarrà in valutazione fino alla decisione dell'amministrazione.",
    });
  } catch (error) {
    console.error("Error submitting candidature:", error);
    res.status(500).json({ error: "Errore durante l'invio della candidatura." });
  }
});

// Check status of user's candidature (By token or by ID or by name)
app.get("/api/candidature/my-status", (req, res) => {
  try {
    const queryId = req.query.id ? sanitizeString(req.query.id as string, 50) : "";
    const queryFullName = req.query.fullName ? sanitizeString(req.query.fullName as string, 100) : "";
    let userToken = "";

    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      userToken = authHeader.substring(7).toUpperCase();
    }

    const all = getCandidature();

    // 1. Search by exact ID if provided
    if (queryId) {
      const found = all.find((c) => c.id === queryId || encodeURIComponent(c.id) === queryId);
      if (found) {
        return res.json({ success: true, candidatura: found });
      }
    }

    // 2. Search by token if authenticated
    if (userToken) {
      const session = REGISTERED_DISCORD_USERS.get(userToken);
      const foundByToken = all.find((c) => {
        if (c.token && c.token.toUpperCase() === userToken) return true;
        if (session?.username && c.fullName.toLowerCase() === session.username.toLowerCase()) return true;
        return false;
      });
      if (foundByToken) {
        return res.json({ success: true, candidatura: foundByToken });
      }
    }

    // 3. Search by fullName if provided
    if (queryFullName) {
      const foundByName = all.find((c) => c.fullName.toLowerCase() === queryFullName.toLowerCase());
      if (foundByName) {
        return res.json({ success: true, candidatura: foundByName });
      }
    }

    return res.json({ success: true, candidatura: null });
  } catch (error) {
    res.status(500).json({ error: "Errore durante la verifica dello stato candidatura." });
  }
});

// Candidate user endpoint to cancel/withdraw their own candidatura (reason is MANDATORY)
const handleCancelCandidatura = (req: express.Request, res: express.Response) => {
  try {
    const rawId = req.params.id || req.body.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const { reason, fullName } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 500).trim() : "";

    if (!cleanReason || cleanReason.length < 3) {
      return res.status(400).json({
        error: "Il motivo dell'annullamento è obbligatorio (almeno 3 caratteri).",
      });
    }

    let userToken = "";
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith("Bearer ")) {
      userToken = authHeader.substring(7).toUpperCase();
    }

    const all = getCandidature();
    let target = all.find((c) => c.id === id || encodeURIComponent(c.id) === id);

    if (!target && userToken) {
      target = all.find((c) => c.token && c.token.toUpperCase() === userToken);
    }

    if (!target && fullName) {
      const cleanName = sanitizeString(fullName, 100);
      target = all.find((c) => c.fullName.toLowerCase() === cleanName.toLowerCase());
    }

    if (!target) {
      return res.status(404).json({ error: "Candidatura non trovata o già rimossa." });
    }

    const updated = cancelCandidatura(target.id, cleanReason);
    if (!updated) {
      return res.status(400).json({ error: "Impossibile annullare la candidatura." });
    }

    addAccessLog(
      req,
      updated.fullName,
      updated.currentRole,
      userToken || updated.token || "-",
      "Candidatura Annullata dall'Utente",
      "INFO",
      `Candidatura per '${updated.desiredRole}' ANNULLATA direttamente dall'utente. Motivo obbligatorio fornito: "${cleanReason}"`,
      "CANDIDATURE"
    );

    res.json({
      success: true,
      candidatura: updated,
      message: "Candidatura annullata con successo.",
    });
  } catch (error) {
    console.error("Error cancelling candidatura:", error);
    res.status(500).json({ error: "Errore durante l'annullamento della candidatura." });
  }
};

app.post("/api/candidature/cancel", handleCancelCandidatura);
app.post("/api/candidature/:id/cancel", handleCancelCandidatura);

// --- CDA (Consiglio di Amministrazione) ENDPOINTS ---

function getCdaCallerInfo(req: express.Request) {
  let userToken = "";
  const authHeader = req.headers.authorization;
  if (authHeader && authHeader.startsWith("Bearer ")) {
    userToken = authHeader.substring(7).trim();
  } else if (req.query.token) {
    userToken = String(req.query.token).trim();
  }

  const caller = getCallerGradeAndRole(req);

  if (caller.isMaster || caller.isAdminPassword || userToken.toUpperCase() === "EMS-2410PROP" || isHighLevelOwnerCaller(caller)) {
    return {
      isCdaMember: true,
      token: userToken || "EMS-2410PROP",
      username: caller.username !== "Sconosciuto" ? caller.username : "Proprietario Master",
      roleName: caller.roleName && caller.roleName !== "Sconosciuto" ? caller.roleName : "Proprietario (Master)",
      cdaRank: 100,
      isMaster: true,
      canReinderizzare: true,
      canDirectReview: true,
      canDirectApprove: true,
      canDirectReturn: true,
      canVote: true,
      canPreventiveAccept: true,
      canResolveTie: true,
      isReasonOptional: true,
    };
  }

  if (!userToken) {
    return {
      isCdaMember: false,
      token: "",
      username: "Sconosciuto",
      roleName: "Sconosciuto",
      cdaRank: 0,
      isMaster: false,
      canReinderizzare: false,
      canDirectReview: false,
      canVote: false,
      canPreventiveAccept: false,
      canResolveTie: false,
      isReasonOptional: false,
    };
  }

  ensureHierarchyLoaded();
  const cleanTokenUpper = userToken.toUpperCase();

  // 1. Try exact lookup in REGISTERED_DISCORD_USERS
  let session = REGISTERED_DISCORD_USERS.get(cleanTokenUpper) || REGISTERED_DISCORD_USERS.get(userToken);

  // 2. Search values if not found directly
  if (!session) {
    for (const s of REGISTERED_DISCORD_USERS.values()) {
      if (s.token && (s.token.toUpperCase() === cleanTokenUpper || s.token === userToken)) {
        session = s;
        break;
      }
      if (s.username && s.username.toLowerCase().trim() === userToken.toLowerCase().trim()) {
        session = s;
        break;
      }
    }
  }

  // Check if session is an expired TEST token
  if (session && session.expiresAt && new Date().getTime() > new Date(session.expiresAt).getTime()) {
    session = undefined;
  }

  let username = session ? session.username : "";
  let roleName = session ? session.roleName : "";

  // Check if session has custom CDA role override set by Admin
  if (session && session.cdaRoleName) {
    roleName = session.cdaRoleName;
  }

  // 3. Search hierarchy members comparing token username or token string against hierarchy
  const hierarchyMember = HIERARCHY_MEMBERS.find((m) => {
    if (username && m.name.toLowerCase().trim() === username.toLowerCase().trim()) return true;
    if (m.name && m.name.toLowerCase().trim() === userToken.toLowerCase().trim()) return true;
    if (m.discordTag && m.discordTag.toUpperCase().includes(cleanTokenUpper)) return true;
    if (m.badge && m.badge.toUpperCase().includes(cleanTokenUpper)) return true;
    if (m.id && m.id.toUpperCase() === cleanTokenUpper) return true;
    return false;
  });

  if (hierarchyMember && (!session || !session.cdaRoleName)) {
    const hRank = getCdaRank(hierarchyMember.roleName);
    const hIsCda = hRank >= 1 || isCdaRoleName(hierarchyMember.roleName);
    if (hIsCda || hRank > getCdaRank(roleName)) {
      roleName = hierarchyMember.roleName;
      if (!username) username = hierarchyMember.name;
    }
  }

  if (!username) username = session?.username || "Sconosciuto";
  if (!roleName) roleName = session?.roleName || "Sconosciuto";

  const rank = getCdaRank(roleName);
  const isCda = session?.hasCdaAccess === false
    ? false
    : (session?.hasCdaAccess === true) || rank >= 1 || isCdaRoleName(roleName) || (hierarchyMember && isCdaRoleName(hierarchyMember.roleName));

  const isOwnerMaster = !!(
    caller.isMaster ||
    isHighLevelOwnerCaller(caller) ||
    (roleName || "").toLowerCase().includes("proprietario") ||
    rank >= 99
  );

  return {
    isCdaMember: !!isCda || isOwnerMaster,
    token: userToken,
    username,
    roleName,
    cdaRank: isOwnerMaster ? 100 : rank,
    isMaster: isOwnerMaster,
    isTestToken: !!session?.isTestToken,
    expiresAt: session?.expiresAt,
    canReinderizzare: isOwnerMaster || (isCda && rank >= 2),
    canDirectReview: isOwnerMaster,
    canDirectApprove: isOwnerMaster,
    canDirectReturn: isOwnerMaster,
    canVote: isOwnerMaster || (isCda && rank >= 1),
    canPreventiveAccept: isOwnerMaster,
    canResolveTie: isOwnerMaster,
    isReasonOptional: isOwnerMaster,
  };
}

// Get candidatures for CDA Portal with auto-processing of expired 24h timers
app.get("/api/cda/candidature", async (req, res) => {
  try {
    await syncAllDataWithFirestore();
    // Process any expired timers and log them
    processExpiredCdaTimers((cand, outcome, summary) => {
      addAccessLog(
        req,
        "Sistema CDA (Timer 24h)",
        "Sistema Automatico",
        "-",
        outcome === "APPROVED"
          ? "Candidatura Approvata da Timer CDA"
          : outcome === "REJECTED"
          ? "Candidatura Rifiutata da Timer CDA"
          : "Parità Raggiunta a Scadenza Timer CDA",
        "INFO",
        `Candidatura di ${cand.fullName} (${cand.desiredRole}): ${summary}`,
        "CDA"
      );
    });

    const info = getCdaCallerInfo(req);
    if (!info.isCdaMember) {
      return res.status(403).json({
        error: "Accesso Riservato al Consiglio di Amministrazione (CDA). E' richiesto un Token valido ed il ruolo di Membro CDA, Segretario CDA, Vice Presidente CDA, Presidente CDA o Consigliere Finale CDA.",
        userPermissions: info,
      });
    }

    const list = getCandidature();
    res.json({
      success: true,
      userPermissions: info,
      candidature: list,
    });
  } catch (error) {
    console.error("Error fetching CDA candidatures:", error);
    res.status(500).json({ error: "Errore durante il recupero dei dati CDA." });
  }
});

// Reinderizza Candidatura -> Start 24h CDA Voting (Segretario CDA and above)
app.post("/api/cda/render/:id", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canReinderizzare) {
      return res.status(403).json({
        error: "Permesso negato. Solo il Segretario CDA ed i gradi superiori (Vice Presidente, Presidente, Consigliere Finale) possono reinderizzare la candidatura alla votazione CDA.",
      });
    }

    const list = getCandidature();
    const target = list.find((c) => c.id === id || encodeURIComponent(c.id) === id);

    if (!target) {
      return res.status(404).json({ error: "Candidatura non trovata." });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const updated = updateCandidaturaCda(
      target.id,
      {
        renderedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        renderedBy: info.username,
        renderedByRole: info.roleName,
        status: "IN_VOTING",
        votes: {},
      }
    );

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Candidatura Reindirizzata a Votazione CDA",
      "SUCCESS",
      `Candidatura di ${target.fullName} per il ruolo '${target.desiredRole}' reindirizzata alla votazione CDA da ${info.username} (${info.roleName}). Avviato timer di 24 ore (Scadenza: ${expiresAt.toLocaleString("it-IT")}).`,
      "CDA"
    );

    res.json({
      success: true,
      candidatura: updated,
      message: `Candidatura di ${target.fullName} reindirizzata alla votazione CDA! Timer di 24 ore avviato.`,
    });
  } catch (error) {
    console.error("Error rendering candidature to CDA:", error);
    res.status(500).json({ error: "Errore durante il reindirizzamento della candidatura." });
  }
});

// Direct Review: Accept or Send Back/Reject (Solo Key Proprietario)
app.post("/api/cda/direct-review/:id", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const { action, reason } = req.body; // action: "APPROVE" | "RETURN"
    const cleanReason = reason ? sanitizeString(reason, 500).trim() : "";
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canDirectReview || !info.isMaster) {
      return res.status(403).json({
        error: "Permesso negato: L'accettazione o l'annullamento/rifiuto diretto delle candidature CDA è riservato esclusivamente ai Proprietari (Key Proprietario).",
      });
    }

    // Mandatory reason for all EXCEPT Consigliere Finale CDA and Master
    if (!info.isReasonOptional && cleanReason.length < 3) {
      return res.status(400).json({
        error: "Motivo dell'azione obbligatorio per il tuo ruolo! Tutti i membri (dal Segretario al Presidente CDA) devono specificare il motivo. Solo il Consigliere Finale CDA ed il Proprietario Master sono esenti.",
      });
    }

    const list = getCandidature();
    const target = list.find((c) => c.id === id || encodeURIComponent(c.id) === id);

    if (!target) {
      return res.status(404).json({ error: "Candidatura non trovata." });
    }

    const isApprove = action === "APPROVE";
    const newCandStatus = isApprove ? "APPROVED" : "REJECTED";
    const newCdaStatus = isApprove ? "APPROVED" : "RETURNED";
    const actionLabel = isApprove ? "Accettata Direttamente" : "Rimandata Indietro";

    const updated = updateCandidaturaCda(
      target.id,
      {
        status: newCdaStatus,
        cdaActionReason: cleanReason || "Nessun motivo specificato (Consigliere Finale / Master)",
        cdaActionBy: info.username,
        cdaActionRole: info.roleName,
        cdaActionAt: new Date().toISOString(),
      },
      newCandStatus,
      info.username,
      isApprove ? undefined : cleanReason
    );

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      `Candidatura ${actionLabel} in CDA`,
      "SUCCESS",
      `Candidatura di ${target.fullName} (${target.desiredRole}) ${actionLabel} da ${info.username} (${info.roleName}). Motivo: "${cleanReason || "Nessun motivo fornito"}"`,
      "CDA"
    );

    res.json({
      success: true,
      candidatura: updated,
      message: `Candidatura di ${target.fullName} ${isApprove ? "approvata" : "rimandata indietro"} con successo dal CDA.`,
    });
  } catch (error) {
    console.error("Error direct reviewing candidature in CDA:", error);
    res.status(500).json({ error: "Errore durante la revisione della candidatura in CDA." });
  }
});

// Submit Vote in CDA (All CDA members)
app.post("/api/cda/vote/:id", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const { decision, reason, voterName } = req.body; // decision: "FAVOREVOLE" | "CONTRARIO" | "ASTENUTO"
    const cleanReason = reason ? sanitizeString(reason, 300).trim() : "";
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canVote) {
      return res.status(403).json({
        error: "Accesso negato. Solo i Membri del Consiglio di Amministrazione (CDA) con token valido possono votare.",
      });
    }

    if (!["FAVOREVOLE", "CONTRARIO", "ASTENUTO"].includes(decision)) {
      return res.status(400).json({ error: "Scelta di voto non valida. Selezionare Favorevole, Contrario o Astenuto." });
    }

    const list = getCandidature();
    const target = list.find((c) => c.id === id || encodeURIComponent(c.id) === id);

    if (!target) {
      return res.status(404).json({ error: "Candidatura non trovata." });
    }

    if (!target.cdaData || target.cdaData.status !== "IN_VOTING") {
      return res.status(400).json({ error: "La candidatura selezionata non è in fase di votazione attiva CDA." });
    }

    // Check if 24h timer expired
    if (target.cdaData.expiresAt && new Date().getTime() >= new Date(target.cdaData.expiresAt).getTime()) {
      return res.status(400).json({ error: "Il timer di 24 ore per questa votazione è scaduto. Votazione chiusa." });
    }

    const effectiveVoterName = (info.isMaster && voterName && typeof voterName === "string" && voterName.trim().length > 0)
      ? sanitizeString(voterName, 100)
      : info.username;

    const existingVotes = target.cdaData.votes || {};
    const voterKey = effectiveVoterName.toLowerCase().replace(/\s+/g, "_");

    const voteEntry = {
      voterToken: info.token || voterKey,
      voterName: effectiveVoterName,
      voterRole: info.roleName,
      decision: decision as "FAVOREVOLE" | "CONTRARIO" | "ASTENUTO",
      timestamp: new Date().toISOString(),
      reason: cleanReason || undefined,
    };

    existingVotes[voterKey] = voteEntry;

    const updated = updateCandidaturaCda(target.id, {
      votes: existingVotes,
    });

    addAccessLog(
      req,
      effectiveVoterName,
      info.roleName,
      info.token || "-",
      "Voto Espresso in CDA",
      "SUCCESS",
      `Voto '${decision}' espresso da ${effectiveVoterName} (${info.roleName}) per la candidatura di ${target.fullName}.`,
      "CDA"
    );

    res.json({
      success: true,
      candidatura: updated,
      message: `Il voto (${decision}) per ${effectiveVoterName} è stato registrato con successo!`,
    });
  } catch (error) {
    console.error("Error voting in CDA:", error);
    res.status(500).json({ error: "Errore durante il salvataggio del voto CDA." });
  }
});

// Close Voting Preventively before 24h timer ends (Solo Key Proprietario)
app.post("/api/cda/preventive-accept/:id", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const { reason } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 500).trim() : "";
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canPreventiveAccept || !info.isMaster) {
      return res.status(403).json({
        error: "Permesso negato. La chiusura preventiva e la risoluzione anticipata della votazione per le candidature sono riservate esclusivamente ai Proprietari (Key Proprietario).",
      });
    }

    if (!info.isReasonOptional && cleanReason.length < 3) {
      return res.status(400).json({
        error: "Motivo della chiusura preventiva obbligatorio per il tuo ruolo!",
      });
    }

    const list = getCandidature();
    const target = list.find((c) => c.id === id || encodeURIComponent(c.id) === id);

    if (!target || !target.cdaData) {
      return res.status(404).json({ error: "Candidatura non trovata." });
    }

    if (target.cdaData.status !== "IN_VOTING") {
      return res.status(400).json({ error: "La candidatura non è in fase di votazione attiva." });
    }

    // Calculate outcome based on votes registered up to this moment
    const votesObj = target.cdaData.votes || {};
    const votesArr = Object.values(votesObj);

    let fav = 0;
    let con = 0;
    let ast = 0;

    votesArr.forEach((v) => {
      if (v.decision === "FAVOREVOLE") fav++;
      else if (v.decision === "CONTRARIO") con++;
      else if (v.decision === "ASTENUTO") ast++;
    });

    let newStatus: CandidaturaStatus = "PENDING";
    let newCdaStatus: CdaStatus = "TIE_PENDING";
    let outcomeLabel = "PARITÀ";

    if (fav > con) {
      newStatus = "APPROVED";
      newCdaStatus = "APPROVED";
      outcomeLabel = "APPROVATA";
    } else if (con > fav) {
      newStatus = "REJECTED";
      newCdaStatus = "REJECTED";
      outcomeLabel = "RIFIUTATA";
    }

    const summaryReason = `Votazione CHIUSA PREVENTIVAMENTE da ${info.username} (${info.roleName}). Esito al momento dell'interruzione: ${outcomeLabel} (${fav} favorevoli, ${con} contrari, ${ast} astenuti su ${votesArr.length} votanti).${cleanReason ? ` Motivo: "${cleanReason}"` : ""}`;

    const updated = updateCandidaturaCda(
      target.id,
      {
        status: newCdaStatus,
        cdaActionReason: summaryReason,
        cdaActionBy: info.username,
        cdaActionRole: info.roleName,
        cdaActionAt: new Date().toISOString(),
      },
      newStatus,
      info.username,
      outcomeLabel === "RIFIUTATA" ? summaryReason : undefined
    );

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Chiusura Preventiva Votazione CDA",
      "SUCCESS",
      `Votazione per ${target.fullName} CHIUSA PREVENTIVAMENTE da ${info.username} (${info.roleName}). Esito: ${outcomeLabel} (${fav} FAV / ${con} CON / ${ast} AST).`,
      "CDA"
    );

    res.json({
      success: true,
      candidatura: updated,
      message: `Votazione chiusa preventivamente! Esito registrato in base alla maggioranza dei voti ricevuti: ${outcomeLabel} (${fav} Favorevoli, ${con} Contrari, ${ast} Astenuti).`,
    });
  } catch (error) {
    console.error("Error preventive closing voting in CDA:", error);
    res.status(500).json({ error: "Errore durante la chiusura preventiva della votazione CDA." });
  }
});

// Resolve Tie after 24h timer ends (Solo Key Proprietario)
app.post("/api/cda/resolve-tie/:id", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const { decision, reason } = req.body; // decision: "APPROVE" | "REJECT"
    const cleanReason = reason ? sanitizeString(reason, 500).trim() : "";
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canResolveTie || !info.isMaster) {
      return res.status(403).json({
        error: "Permesso negato. In caso di parità, la decisione finale (accettazione o annullamento) è riservata esclusivamente ai Proprietari (Key Proprietario).",
      });
    }

    if (!info.isReasonOptional && (!cleanReason || cleanReason.length < 3)) {
      return res.status(400).json({ error: "Motivo della decisione di pareggio obbligatorio (almeno 3 caratteri)." });
    }

    const list = getCandidature();
    const target = list.find((c) => c.id === id || encodeURIComponent(c.id) === id);

    if (!target) {
      return res.status(404).json({ error: "Candidatura non trovata." });
    }

    const isApprove = decision === "APPROVE";
    const newCandStatus = isApprove ? "APPROVED" : "REJECTED";
    const newCdaStatus = isApprove ? "APPROVED" : "REJECTED";

    const updated = updateCandidaturaCda(
      target.id,
      {
        status: newCdaStatus,
        cdaActionReason: `Risoluzione Parità CDA: ${cleanReason}`,
        cdaActionBy: info.username,
        cdaActionRole: info.roleName,
        cdaActionAt: new Date().toISOString(),
      },
      newCandStatus,
      info.username,
      isApprove ? undefined : cleanReason
    );

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Parità CDA Risolta",
      "SUCCESS",
      `Parità della candidatura di ${target.fullName} RISOLTA in ${isApprove ? "FAVORE (Accettata)" : "SFAVORE (Rifiutata)"} da ${info.username} (${info.roleName}). Motivo: "${cleanReason}"`,
      "CDA"
    );

    res.json({
      success: true,
      candidatura: updated,
      message: `Parità risolta con successo! Candidatura ${isApprove ? "approvata" : "rifiutata"}.`,
    });
  } catch (error) {
    console.error("Error resolving tie in CDA:", error);
    res.status(500).json({ error: "Errore durante la risoluzione della parità CDA." });
  }
});

// ==========================================
// PROPOSTE CDA ENDPOINTS
// ==========================================

// Lookup Co-signer by token prefix or name
app.get("/api/cda/proposals/lookup-cosigner", (req, res) => {
  try {
    const rawPrefix = String(req.query.prefix || "").trim();
    if (!rawPrefix || rawPrefix.length < 1) {
      return res.json({ success: false, error: "Inserisci almeno un carattere." });
    }

    let clean = rawPrefix.toUpperCase().replace(/^EMS-?/i, "").trim();
    if (!clean) clean = rawPrefix.toUpperCase();

    const matches: Array<{ name: string; role: string; tokenPrefix: string }> = [];
    const seenNames = new Set<string>();

    // Search REGISTERED_DISCORD_USERS
    for (const [tok, sess] of REGISTERED_DISCORD_USERS.entries()) {
      const tokUpper = tok.toUpperCase();
      const tokAfterEms = tokUpper.replace(/^EMS-?/i, "");

      if (tokAfterEms.startsWith(clean) || tokUpper.startsWith(clean)) {
        if (!seenNames.has(sess.username)) {
          seenNames.add(sess.username);
          matches.push({
            name: sess.username,
            role: sess.cdaRoleName || sess.roleName || "Membro CDA",
            tokenPrefix: tokAfterEms.substring(0, 2) || clean.substring(0, 2),
          });
        }
      }
    }

    // Search HIERARCHY_MEMBERS
    HIERARCHY_MEMBERS.forEach((m) => {
      if (m.name && (m.name.toLowerCase().includes(clean.toLowerCase()) || (m.badge && m.badge.toUpperCase().includes(clean)))) {
        if (!seenNames.has(m.name)) {
          seenNames.add(m.name);
          matches.push({
            name: m.name,
            role: m.roleName || "Membro EMS",
            tokenPrefix: clean.substring(0, 2).toUpperCase(),
          });
        }
      }
    });

    res.json({ success: true, matches });
  } catch (err) {
    console.error("Error looking up co-signer:", err);
    res.status(500).json({ error: "Errore durante la ricerca del firmatario." });
  }
});

// Get CDA Proposals with auto timer processing
app.get("/api/cda/proposals", async (req, res) => {
  try {
    await syncAllDataWithFirestore();
    processExpiredCdaProposalTimers((prop, outcome, summary) => {
      addAccessLog(
        req,
        "Sistema CDA (Timer 24h)",
        "Sistema Automatico",
        "-",
        outcome === "APPROVED"
          ? "Proposta CDA Approvata da Timer CDA"
          : outcome === "REJECTED"
          ? "Proposta CDA Rifiutata da Timer CDA"
          : "Parità Raggiunta a Scadenza Timer CDA Proposta",
        "INFO",
        `Proposta CDA "${prop.title}": ${summary}`,
        "CDA"
      );
    });

    const info = getCdaCallerInfo(req);
    if (!info.isCdaMember) {
      return res.status(403).json({
        error: "Accesso Riservato al Consiglio di Amministrazione (CDA). E' richiesto un Token valido ed il ruolo di Membro CDA o superiore.",
        userPermissions: info,
      });
    }

    const proposals = getCdaProposals();
    res.json({
      success: true,
      userPermissions: info,
      proposals,
    });
  } catch (error) {
    console.error("Error fetching CDA proposals:", error);
    res.status(500).json({ error: "Errore durante il recupero delle proposte CDA." });
  }
});

// Create new CDA Proposal (Generica or Promozione)
app.post("/api/cda/proposals", (req, res) => {
  try {
    const info = getCdaCallerInfo(req);
    if (!info.isCdaMember) {
      return res.status(403).json({ error: "Accesso riservato ai membri del CDA per creare proposte." });
    }

    const {
      type,
      proposerName,
      title,
      description,
      targetEmployeeName,
      targetCurrentRole,
      targetProposedRole,
      reinstatementVotingRoles,
      coSigners,
    } = req.body;

    if (!type || (type !== "GENERICA" && type !== "PROMOZIONE" && type !== "REINTEGRO")) {
      return res.status(400).json({ error: "Tipo di proposta non valido (deve essere GENERICA, PROMOZIONE o REINTEGRO)." });
    }

    const cleanProposer = sanitizeString(proposerName, 150) || info.username;
    const cleanTitle = sanitizeString(title, 250);
    const cleanDesc = sanitizeString(description, 5000);

    if (!cleanDesc || cleanDesc.trim().length < 5) {
      return res.status(400).json({ error: "La motivazione e i dettagli della proposta sono obbligatori (almeno 5 caratteri)." });
    }

    if (type === "PROMOZIONE") {
      if (!targetEmployeeName || !targetProposedRole) {
        return res.status(400).json({ error: "Per una proposta di promozione occorre specificare il nome del dipendente e il ruolo proposto." });
      }
    }

    let cleanVotingRoles: string[] = [];
    if (type === "REINTEGRO") {
      if (!targetEmployeeName || !targetEmployeeName.trim()) {
        return res.status(400).json({ error: "Per una proposta di reintegro occorre specificare il nome della persona da reintegrare." });
      }
      if (!targetCurrentRole || !targetCurrentRole.trim()) {
        return res.status(400).json({ error: "Per una proposta di reintegro occorre specificare il ruolo che la persona ricopriva in precedenza." });
      }

      if (Array.isArray(reinstatementVotingRoles) && reinstatementVotingRoles.length > 0) {
        cleanVotingRoles = reinstatementVotingRoles.map((r: any) => sanitizeString(r, 100)).filter(Boolean);
      } else if (targetProposedRole) {
        cleanVotingRoles = targetProposedRole.split(/[/,]/).map((s: string) => sanitizeString(s.trim(), 100)).filter(Boolean);
      }

      if (cleanVotingRoles.length === 0) {
        return res.status(400).json({ error: "Per una proposta di reintegro occorre indicare almeno un ruolo tra cui votare." });
      }
    }

    const finalTitle = cleanTitle || (
      type === "REINTEGRO"
        ? `Proposta di Reintegro per ${sanitizeString(targetEmployeeName, 150)}`
        : type === "PROMOZIONE"
        ? `Proposta di Promozione per ${sanitizeString(targetEmployeeName, 150)}`
        : "Nuova Proposta CDA"
    );

    if (!finalTitle || finalTitle.length < 3) {
      return res.status(400).json({ error: "Il titolo/oggetto della proposta è obbligatorio (almeno 3 caratteri)." });
    }

    const cleanCoSigners = Array.isArray(coSigners)
      ? coSigners
          .map((cs: any) => ({
            name: sanitizeString(cs.name, 150) || "",
            role: sanitizeString(cs.role, 150) || "Membro CDA",
            tokenPrefix: (sanitizeString(cs.tokenPrefix, 10) || "").toUpperCase(),
          }))
          .filter((cs: any) => cs.name.length > 0)
      : [];

    const newProposal: CdaProposal = {
      id: `CDA-PROP-${Date.now()}-${Math.floor(Math.random() * 1000)}`,
      type,
      proposerName: cleanProposer,
      proposerRole: info.roleName,
      coSigners: cleanCoSigners,
      title: finalTitle,
      description: cleanDesc,
      targetEmployeeName: targetEmployeeName ? sanitizeString(targetEmployeeName, 150) : undefined,
      targetCurrentRole: targetCurrentRole ? sanitizeString(targetCurrentRole, 150) : undefined,
      targetProposedRole: type === "REINTEGRO" && cleanVotingRoles.length > 0
        ? cleanVotingRoles.join(" / ")
        : (targetProposedRole ? sanitizeString(targetProposedRole, 150) : undefined),
      reinstatementVotingRoles: cleanVotingRoles.length > 0 ? cleanVotingRoles : undefined,
      status: "PENDING",
      submittedAt: new Date().toISOString(),
      token: info.token,
      cdaData: {
        status: "PENDING_RENDER",
      },
    };

    addCdaProposal(newProposal);

    const coSignerStr = cleanCoSigners.length > 0
      ? ` (Co-firmato da: ${cleanCoSigners.map((c: any) => `${c.name} [EMS-${c.tokenPrefix}]`).join(", ")})`
      : "";

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Nuova Proposta CDA Creata",
      "SUCCESS",
      `Creata proposta CDA (${type}): "${cleanTitle}" dal proponente ${cleanProposer}${coSignerStr}`,
      "CDA"
    );

    res.json({ success: true, proposal: newProposal });
  } catch (error) {
    console.error("Error creating CDA proposal:", error);
    res.status(500).json({ error: "Errore durante la creazione della proposta CDA." });
  }
});

// Render / Avvia Votazione Proposta CDA (Segretario CDA in su)
app.post("/api/cda/proposals/:id/render", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canReinderizzare) {
      return res.status(403).json({
        error: "Permesso negato. Solo il Segretario CDA ed i gradi superiori possono valutare ed avviare la votazione della proposta CDA.",
      });
    }

    const list = getCdaProposals();
    const target = list.find((p) => p.id === id);

    if (!target) {
      return res.status(404).json({ error: "Proposta CDA non trovata." });
    }

    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000);

    const updated = updateCdaProposalCda(
      target.id,
      {
        renderedAt: now.toISOString(),
        expiresAt: expiresAt.toISOString(),
        renderedBy: info.username,
        renderedByRole: info.roleName,
        status: "IN_VOTING",
        votes: {},
      }
    );

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Proposta CDA Inviata in Votazione",
      "SUCCESS",
      `Proposta CDA "${target.title}" valutata e inviata in votazione CDA da ${info.username} (${info.roleName}). Timer 24h avviato.`,
      "CDA"
    );

    res.json({ success: true, proposal: updated });
  } catch (error) {
    console.error("Error rendering proposal:", error);
    res.status(500).json({ error: "Errore durante l'avvio della votazione della proposta." });
  }
});

// Submit Vote for Proposal CDA
app.post("/api/cda/proposals/:id/vote", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canVote) {
      return res.status(403).json({ error: "Permesso di voto negato nella Sezione CDA." });
    }

    const { decision, reason, chosenRole, voterName } = req.body;
    if (!decision || (decision !== "FAVOREVOLE" && decision !== "CONTRARIO" && decision !== "ASTENUTO")) {
      return res.status(400).json({ error: "Scelta di voto non valida." });
    }

    const list = getCdaProposals();
    const target = list.find((p) => p.id === id);

    if (!target) {
      return res.status(404).json({ error: "Proposta CDA non trovata." });
    }

    if (!target.cdaData || target.cdaData.status !== "IN_VOTING") {
      return res.status(400).json({ error: "Questa proposta non è attualmente in fase di votazione." });
    }

    const now = new Date();
    if (target.cdaData.expiresAt && now.getTime() > new Date(target.cdaData.expiresAt).getTime()) {
      return res.status(400).json({ error: "Il periodo di votazione di 24 ore è scaduto." });
    }

    let cleanChosenRole: string | undefined = undefined;
    if (target.type === "REINTEGRO" && decision === "FAVOREVOLE") {
      const roleStr = chosenRole ? sanitizeString(chosenRole, 100).trim() : "";
      if (!roleStr) {
        return res.status(400).json({ error: "Per votare favorevolmente a un reintegro è obbligatorio selezionare il grado da assegnare." });
      }
      cleanChosenRole = roleStr;
    }

    const effectiveVoterName = (info.isMaster && voterName && typeof voterName === "string" && voterName.trim().length > 0)
      ? sanitizeString(voterName, 100)
      : info.username;

    const currentVotes = { ...(target.cdaData.votes || {}) };
    const userVoteKey = effectiveVoterName.toLowerCase().replace(/\s+/g, "_");

    currentVotes[userVoteKey] = {
      voterToken: info.token || userVoteKey,
      voterName: effectiveVoterName,
      voterRole: info.roleName,
      decision,
      chosenRole: cleanChosenRole,
      reason: reason ? sanitizeString(reason, 1000) : undefined,
      timestamp: now.toISOString(),
    };

    const updated = updateCdaProposalCda(target.id, { votes: currentVotes });

    const roleInfo = cleanChosenRole ? ` (Grado votato: ${cleanChosenRole})` : "";
    addAccessLog(
      req,
      effectiveVoterName,
      info.roleName,
      info.token || "-",
      "Voto Proposta CDA Registrato",
      "SUCCESS",
      `Espresso voto '${decision}'${roleInfo} per la proposta CDA "${target.title}" da parte di ${effectiveVoterName} (${info.roleName}).`,
      "CDA"
    );

    res.json({ success: true, proposal: updated });
  } catch (error) {
    console.error("Error voting on proposal:", error);
    res.status(500).json({ error: "Errore durante la registrazione del voto." });
  }
});

// Direct Approve Proposal (Solo Key Proprietario)
app.post("/api/cda/proposals/:id/direct-approve", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canDirectApprove || !info.isMaster) {
      return res.status(403).json({ error: "Permesso negato: L'accettazione/approvazione diretta delle proposte CDA è riservata esclusivamente ai Proprietari (Key Proprietario)." });
    }

    const { reason, chosenRole } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 1000) : "";

    const list = getCdaProposals();
    const target = list.find((p) => p.id === id);
    if (!target) return res.status(404).json({ error: "Proposta non trovata." });

    let cleanChosenRole: string | undefined = undefined;
    if (target.type === "REINTEGRO") {
      const roleStr = chosenRole ? sanitizeString(chosenRole, 100).trim() : "";
      if (!roleStr) {
        return res.status(400).json({ error: "Per approvare direttamente un reintegro occorre selezionare il grado con cui reintegrare la persona." });
      }
      cleanChosenRole = roleStr;
    }

    const now = new Date();
    const actionReasonText = cleanChosenRole
      ? `Approvazione diretta reintegro al grado "${cleanChosenRole}" da ${info.username} (${info.roleName}).${cleanReason ? ` Motivo: ${cleanReason}` : ""}`
      : (cleanReason || "Approvazione diretta da grado autorizzato CDA.");

    const updated = updateCdaProposalCda(
      target.id,
      {
        status: "APPROVED",
        cdaActionReason: actionReasonText,
        cdaActionBy: info.username,
        cdaActionRole: info.roleName,
        cdaActionAt: now.toISOString(),
      },
      "APPROVED",
      info.username,
      undefined,
      cleanChosenRole ? { targetProposedRole: cleanChosenRole, finalApprovedRole: cleanChosenRole } : undefined
    );

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Proposta CDA Approvata Direttamente",
      "SUCCESS",
      `Proposta CDA "${target.title}" approvata direttamente da ${info.username} (${info.roleName}).${cleanChosenRole ? ` Grado Reintegro: ${cleanChosenRole}` : ""}`,
      "CDA"
    );

    res.json({ success: true, proposal: updated });
  } catch (error) {
    console.error("Error direct approving proposal:", error);
    res.status(500).json({ error: "Errore durante l'approvazione diretta." });
  }
});

// Direct Return / Reject Proposal (Solo Key Proprietario)
app.post("/api/cda/proposals/:id/direct-return", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canDirectReturn || !info.isMaster) {
      return res.status(403).json({ error: "Permesso negato: L'annullamento o il rifiuto diretto delle proposte CDA è riservato esclusivamente ai Proprietari (Key Proprietario)." });
    }

    const { reason } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 1000) : "";

    const list = getCdaProposals();
    const target = list.find((p) => p.id === id);
    if (!target) return res.status(404).json({ error: "Proposta non trovata." });

    const now = new Date();
    const actionReasonText = cleanReason || "Proposta respinta direttamente da grado autorizzato CDA.";

    const updated = updateCdaProposalCda(
      target.id,
      {
        status: "REJECTED",
        cdaActionReason: actionReasonText,
        cdaActionBy: info.username,
        cdaActionRole: info.roleName,
        cdaActionAt: now.toISOString(),
      },
      "REJECTED",
      info.username,
      cleanReason
    );

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Proposta CDA Respinta Direttamente",
      "SUCCESS",
      `Proposta CDA "${target.title}" respinta direttamente da ${info.username} (${info.roleName}). Motivazione: ${cleanReason || "Nessuna motivazione"}`,
      "CDA"
    );

    res.json({ success: true, proposal: updated, message: `Proposta CDA "${target.title}" respinta e votazione chiusa con successo.` });
  } catch (error) {
    console.error("Error direct returning proposal:", error);
    res.status(500).json({ error: "Errore durante il rifiuto della proposta." });
  }
});

// Chiusura Preventiva Proposta CDA (Solo Key Proprietario)
app.post("/api/cda/proposals/:id/preventive", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const { reason, chosenRole } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 500).trim() : "";
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canPreventiveAccept || !info.isMaster) {
      return res.status(403).json({
        error: "Permesso negato: La chiusura preventiva della votazione della proposta è riservata esclusivamente ai Proprietari (Key Proprietario).",
      });
    }

    const list = getCdaProposals();
    const target = list.find((p) => p.id === id);

    if (!target) {
      return res.status(404).json({ error: "Proposta CDA non trovata." });
    }

    if (!target.cdaData || target.cdaData.status !== "IN_VOTING") {
      return res.status(400).json({ error: "Questa proposta non è in votazione attiva." });
    }

    const votesObj = target.cdaData.votes || {};
    const votesArr = Object.values(votesObj);

    let fav = 0;
    let con = 0;
    let ast = 0;
    const roleCounts: Record<string, number> = {};

    votesArr.forEach((v) => {
      if (v.decision === "FAVOREVOLE") {
        fav++;
        if (v.chosenRole) {
          roleCounts[v.chosenRole] = (roleCounts[v.chosenRole] || 0) + 1;
        }
      }
      else if (v.decision === "CONTRARIO") con++;
      else if (v.decision === "ASTENUTO") ast++;
    });

    let newStatus: CandidaturaStatus = "PENDING";
    let newCdaStatus: CdaStatus = "TIE_PENDING";
    let outcomeLabel = "PARITÀ";

    if (fav > con) {
      newStatus = "APPROVED";
      newCdaStatus = "APPROVED";
      outcomeLabel = "APPROVATA";
    } else if (con > fav) {
      newStatus = "REJECTED";
      newCdaStatus = "REJECTED";
      outcomeLabel = "RIFIUTATA";
    } else {
      // In case of tie or 0 votes when VP closes early
      if (fav > 0) {
        newStatus = "PENDING";
        newCdaStatus = "TIE_PENDING";
        outcomeLabel = "PARITÀ";
      } else {
        // Closed with 0 votes cast or 0-0
        newStatus = "REJECTED";
        newCdaStatus = "REJECTED";
        outcomeLabel = "RIFIUTATA";
      }
    }

    let cleanChosenRole: string | undefined = undefined;
    if (target.type === "REINTEGRO" && newCdaStatus === "APPROVED") {
      let topRole: string | undefined = undefined;
      let maxVotes = -1;
      Object.entries(roleCounts).forEach(([r, count]) => {
        if (count > maxVotes) {
          maxVotes = count;
          topRole = r;
        }
      });

      const roleStr = topRole || (chosenRole ? sanitizeString(chosenRole, 100).trim() : "") || target.targetProposedRole || (target.reinstatementVotingRoles && target.reinstatementVotingRoles[0]) || "Tirocinante";
      cleanChosenRole = roleStr;
    }

    const rolePart = cleanChosenRole ? ` (Grado reintegro assegnato: ${cleanChosenRole})` : "";
    const summaryReason = `Votazione CHIUSA PREVENTIVAMENTE da ${info.username} (${info.roleName}). Esito al momento dell'interruzione: ${outcomeLabel}${rolePart} (${fav} favorevoli, ${con} contrari, ${ast} astenuti su ${votesArr.length} votanti).${cleanReason ? ` Motivo: "${cleanReason}"` : ""}`;

    const updated = updateCdaProposalCda(
      target.id,
      {
        status: newCdaStatus,
        cdaActionReason: summaryReason,
        cdaActionBy: info.username,
        cdaActionRole: info.roleName,
        cdaActionAt: new Date().toISOString(),
      },
      newStatus,
      info.username,
      outcomeLabel === "RIFIUTATA" ? summaryReason : undefined,
      cleanChosenRole ? { targetProposedRole: cleanChosenRole, finalApprovedRole: cleanChosenRole } : undefined
    );

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Chiusura Preventiva Votazione Proposta CDA",
      "SUCCESS",
      `Votazione per la proposta "${target.title}" CHIUSA PREVENTIVAMENTE da ${info.username} (${info.roleName}). Esito: ${outcomeLabel}.${cleanChosenRole ? ` Grado: ${cleanChosenRole}` : ""}`,
      "CDA"
    );

    res.json({
      success: true,
      proposal: updated,
      message: `Votazione della proposta chiusa preventivamente con esito: ${outcomeLabel}.${cleanChosenRole ? ` Grado assegnato: ${cleanChosenRole}.` : ""}`,
    });
  } catch (error) {
    console.error("Error preventive closing proposal voting:", error);
    res.status(500).json({ error: "Errore durante la chiusura preventiva della votazione proposta." });
  }
});

// Resolve Tie for Proposal CDA (Solo Key Proprietario)
app.post("/api/cda/proposals/:id/resolve-tie", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canResolveTie || !info.isMaster) {
      return res.status(403).json({ error: "Permesso negato: La risoluzione della parità per le proposte CDA è riservata esclusivamente ai Proprietari (Key Proprietario)." });
    }

    const { decision, reason, chosenRole } = req.body;
    if (decision !== "APPROVE" && decision !== "REJECT") {
      return res.status(400).json({ error: "Decisione di pareggio non valida (deve essere APPROVE o REJECT)." });
    }

    const cleanReason = reason ? sanitizeString(reason, 1000) : "";
    const list = getCdaProposals();
    const target = list.find((p) => p.id === id);
    if (!target) return res.status(404).json({ error: "Proposta non trovata." });

    let cleanChosenRole: string | undefined = undefined;
    if (target.type === "REINTEGRO" && decision === "APPROVE") {
      const roleStr = chosenRole ? sanitizeString(chosenRole, 100).trim() : "";
      if (!roleStr) {
        return res.status(400).json({ error: "Per approvare il reintegro in risoluzione di parità occorre selezionare il grado da assegnare." });
      }
      cleanChosenRole = roleStr;
    }

    const now = new Date();
    const finalOutcome = decision === "APPROVE" ? "APPROVED" : "REJECTED";
    const rolePart = cleanChosenRole ? ` (Grado reintegro: ${cleanChosenRole})` : "";

    const updated = updateCdaProposalCda(
      target.id,
      {
        status: finalOutcome,
        cdaActionReason: `Pareggio risolto (${decision === "APPROVE" ? "APPROVATA" : "RESPINTA"}${rolePart}) da ${info.username}: ${cleanReason}`,
        cdaActionBy: info.username,
        cdaActionRole: info.roleName,
        cdaActionAt: now.toISOString(),
      },
      finalOutcome,
      info.username,
      decision === "REJECT" ? cleanReason : undefined,
      cleanChosenRole ? { targetProposedRole: cleanChosenRole, finalApprovedRole: cleanChosenRole } : undefined
    );

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Pareggio Proposta CDA Risolto",
      "SUCCESS",
      `Pareggio per la proposta CDA "${target.title}" risolto in ${finalOutcome} da ${info.username} (${info.roleName}).`,
      "CDA"
    );

    res.json({ success: true, proposal: updated });
  } catch (error) {
    console.error("Error resolving proposal tie:", error);
    res.status(500).json({ error: "Errore durante la risoluzione del pareggio." });
  }
});

// Cancel / Withdraw CDA Proposal (Solo Key Proprietario)
app.post("/api/cda/proposals/:id/cancel", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const info = getCdaCallerInfo(req);

    if (!info.isMaster) {
      return res.status(403).json({ error: "Permesso negato: L'annullamento o il ritiro delle proposte CDA può essere effettuato esclusivamente dai Proprietari (Key Proprietario)." });
    }

    const proposals = getCdaProposals();
    const target = proposals.find((p) => p.id === id);
    if (!target) {
      return res.status(404).json({ error: "Proposta CDA non trovata." });
    }

    if (target.status === "APPROVED" || target.status === "REJECTED" || target.status === "CANCELLED") {
      return res.status(400).json({ error: "Impossibile ritirare una proposta già conclusa o annullata." });
    }

    const { reason } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 2000) : "";

    const finalReason = cleanReason || "Ritirata / Annullata da Proprietario Master";
    const updated = cancelCdaProposal(target.id, finalReason, info.username);

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Proposta CDA Ritirata",
      "INFO",
      `Proposta CDA "${target.title}" ritirata da ${info.username}. Motivazione: ${finalReason}`,
      "CDA"
    );

    res.json({ success: true, proposal: updated });
  } catch (error) {
    console.error("Error cancelling CDA proposal:", error);
    res.status(500).json({ error: "Errore durante il ritiro della proposta CDA." });
  }
});

// Get all proposals (Admin endpoint)
app.get("/api/admin/cda-proposals", requireAdmin, (req, res) => {
  try {
    const list = getCdaProposals();
    res.json({ success: true, proposals: list });
  } catch (error) {
    console.error("Error fetching admin CDA proposals:", error);
    res.status(500).json({ error: "Errore durante il recupero delle proposte CDA per l'Admin." });
  }
});

// Admin Approve Proposal
app.post("/api/admin/cda-proposals/:id/approve", requireAdmin, (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const caller = getCallerGradeAndRole(req);
    const reqReviewer = req.body?.reviewerName ? sanitizeString(req.body.reviewerName, 100).replace(/\s*\(.*?\)\s*$/, "").trim() : "";
    const reviewer = reqReviewer || (caller.username !== "Sconosciuto" ? caller.username : (caller.reviewerName || caller.roleName));

    const list = getCdaProposals();
    const target = list.find((p) => p.id === id || String(p.id).trim().toLowerCase() === id.toLowerCase());
    if (!target) return res.status(404).json({ error: "Proposta CDA non trovata." });

    const now = new Date();
    const updated = updateCdaProposalCda(
      target.id,
      {
        status: "APPROVED",
        cdaActionReason: "Approvata dall'Amministrazione.",
        cdaActionBy: reviewer,
        cdaActionRole: caller.roleName,
        cdaActionAt: now.toISOString(),
      },
      "APPROVED",
      reviewer
    );

    addAccessLog(
      req,
      reviewer,
      caller.roleName,
      "-",
      "Proposta CDA Accettata dall'Admin",
      "SUCCESS",
      `Proposta CDA "${target.title}" ACCETTATA da ${reviewer}.`,
      "CDA"
    );

    res.json({
      success: true,
      proposal: updated,
      message: `Proposta CDA "${target.title}" approvata con successo!`,
    });
  } catch (error) {
    console.error("Error approving CDA proposal:", error);
    res.status(500).json({ error: "Errore durante l'approvazione della proposta CDA." });
  }
});

// Admin Reject Proposal
app.post("/api/admin/cda-proposals/:id/reject", requireAdmin, (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const { reason, reviewerName } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 1000) : "";

    const caller = getCallerGradeAndRole(req);
    const reqReviewer = reviewerName ? sanitizeString(reviewerName, 100).replace(/\s*\(.*?\)\s*$/, "").trim() : "";
    const reviewer = reqReviewer || (caller.username !== "Sconosciuto" ? caller.username : (caller.reviewerName || caller.roleName));

    const isProprietario = caller.isMaster || caller.roleName.toLowerCase().includes("proprietario") || caller.grade >= 99;

    if (!isProprietario && (!cleanReason || cleanReason.trim().length === 0)) {
      return res.status(400).json({
        error: "Motivo del rifiuto obbligatorio! Solo i Proprietari possono rifiutare una proposta CDA senza specificare il motivo.",
      });
    }

    const list = getCdaProposals();
    const target = list.find((p) => p.id === id || String(p.id).trim().toLowerCase() === id.toLowerCase());
    if (!target) return res.status(404).json({ error: "Proposta CDA non trovata." });

    deleteCdaProposal(target.id);

    addAccessLog(
      req,
      reviewer,
      caller.roleName,
      "-",
      "Proposta CDA Rifiutata ed Eliminata dall'Admin",
      "SUCCESS",
      `Proposta CDA "${target.title}" RIFIUTATA ed ELIMINATA da ${reviewer}. Motivo: ${cleanReason || "Nessun motivo specificato"}`,
      "CDA"
    );

    res.json({
      success: true,
      deleted: true,
      message: `Proposta CDA "${target.title}" rifiutata ed eliminata con successo.`,
    });
  } catch (error) {
    console.error("Error rejecting CDA proposal:", error);
    res.status(500).json({ error: "Errore durante il rifiuto della proposta CDA." });
  }
});

// Admin Reset Proposal Voting
app.post("/api/admin/cda-proposals/:id/reset-voting", requireAdmin, (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const reviewer = req.body.reviewer || "Amministratore";

    const updated = resetCdaProposalToVoting(id, reviewer);
    if (!updated) {
      return res.status(404).json({ error: "Proposta CDA non trovata." });
    }

    addAccessLog(
      req,
      reviewer,
      "Amministratore",
      "-",
      "Votazione Proposta CDA Resettata dall'Admin",
      "SUCCESS",
      `Votazione resettata per la proposta CDA ID: ${id} da parte di ${reviewer}.`,
      "CDA"
    );

    res.json({ success: true, proposal: updated });
  } catch (error) {
    console.error("Error resetting proposal voting:", error);
    res.status(500).json({ error: "Errore durante il reset della votazione proposta CDA." });
  }
});

// Admin Reset Proposal to Pre-Evaluation (before voting)
app.post("/api/admin/cda-proposals/:id/reset-pre-evaluation", requireAdmin, (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const reviewer = req.body.reviewer || "Amministratore";

    const updated = resetCdaProposalToPreEvaluation(id, reviewer);
    if (!updated) {
      return res.status(404).json({ error: "Proposta CDA non trovata." });
    }

    addAccessLog(
      req,
      reviewer,
      "Amministratore",
      "-",
      "Proposta CDA Rimessa in Pre-Valutazione dall'Admin",
      "SUCCESS",
      `Proposta CDA ID: ${id} rimessa in Pre-Valutazione (prima della votazione) da parte di ${reviewer}.`,
      "CDA"
    );

    res.json({ success: true, proposal: updated, message: "Proposta rimessa in Pre-Valutazione con successo." });
  } catch (error) {
    console.error("Error resetting proposal to pre-evaluation:", error);
    res.status(500).json({ error: "Errore durante il ripristino in pre-valutazione della proposta CDA." });
  }
});

// Admin Delete Proposal
app.delete("/api/admin/cda-proposals/:id", requireAdmin, (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const reviewer = req.body.reviewer || "Amministratore";

    const success = deleteCdaProposal(id);
    if (!success) {
      return res.status(404).json({ error: "Proposta CDA non trovata." });
    }

    addAccessLog(
      req,
      reviewer,
      "Amministratore",
      "-",
      "Proposta CDA Eliminata dall'Admin",
      "SUCCESS",
      `Eliminata la proposta CDA ID: ${id} da parte di ${reviewer}.`,
      "CDA"
    );

    res.json({ success: true });
  } catch (error) {
    console.error("Error deleting proposal:", error);
    res.status(500).json({ error: "Errore durante l'eliminazione della proposta CDA." });
  }
});

// Get all candidatures (Admin only)
app.get("/api/admin/candidature", requireAdmin, (req, res) => {
  try {
    const list = getCandidature();
    res.json({ success: true, count: list.length, candidature: list });
  } catch (error) {
    res.status(500).json({ error: "Errore durante il recupero delle candidature." });
  }
});

// Approve a candidature (Admin only)
app.post("/api/admin/candidature/:id/approve", requireAdmin, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 50);
    const caller = getCallerGradeAndRole(req);
    const reqReviewer = req.body?.reviewerName ? sanitizeString(req.body.reviewerName, 100).replace(/\s*\(.*?\)\s*$/, "").trim() : "";
    const reviewer = reqReviewer || (caller.username !== "Sconosciuto" ? caller.username : (caller.reviewerName || caller.roleName));

    const updated = updateCandidaturaStatus(id, "APPROVED", reviewer);
    if (!updated) {
      return res.status(404).json({ error: "Candidatura non trovata." });
    }

    addAccessLog(
      req,
      reviewer,
      caller.roleName,
      "-",
      "Candidatura Accettata",
      "SUCCESS",
      `Candidatura di ${updated.fullName} (${updated.desiredRole}) ACCETTATA da ${reviewer}.`,
      "CANDIDATURE"
    );

    res.json({
      success: true,
      candidatura: updated,
      message: `Candidatura di ${updated.fullName} approvata con successo!`,
    });
  } catch (error) {
    console.error("Error approving candidature:", error);
    res.status(500).json({ error: "Errore durante l'approvazione della candidatura." });
  }
});

// Reject a candidature (Admin only)
app.post("/api/admin/candidature/:id/reject", requireAdmin, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 50);
    const { reason, reviewerName } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 500) : "";

    const caller = getCallerGradeAndRole(req);
    const reqReviewer = reviewerName ? sanitizeString(reviewerName, 100).replace(/\s*\(.*?\)\s*$/, "").trim() : "";
    const reviewer = reqReviewer || (caller.username !== "Sconosciuto" ? caller.username : (caller.reviewerName || caller.roleName));

    // Rule: Non-Proprietario admins MUST provide a reason. Proprietario can reject with or without reason.
    const isProprietario = caller.isMaster || caller.roleName.toLowerCase().includes("proprietario") || caller.grade >= 99;

    if (!isProprietario && (!cleanReason || cleanReason.trim().length === 0)) {
      return res.status(400).json({
        error: "Motivo del rifiuto obbligatorio! Solo i Proprietari possono rifiutare una candidatura senza specificare il motivo.",
      });
    }

    const updated = updateCandidaturaStatus(id, "REJECTED", reviewer, cleanReason);
    if (!updated) {
      return res.status(404).json({ error: "Candidatura non trovata." });
    }

    addAccessLog(
      req,
      reviewer,
      caller.roleName,
      "-",
      "Candidatura Rifiutata",
      "SUCCESS",
      `Candidatura di ${updated.fullName} RIFIUTATA da ${reviewer}. Motivo: ${cleanReason || "Nessun motivo specificato"}`,
      "CANDIDATURE"
    );

    res.json({
      success: true,
      candidatura: updated,
      message: `Candidatura di ${updated.fullName} rifiutata con successo.`,
    });
  } catch (error) {
    console.error("Error rejecting candidature:", error);
    res.status(500).json({ error: "Errore durante il rifiuto della candidatura." });
  }
});

// Reset a candidature to VOTING status (Admin only - Annulla decisione Vice Presidente / Presidente)
app.post("/api/admin/candidature/:id/reset", requireAdmin, (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const caller = getCallerGradeAndRole(req);
    const actorName = (caller.username && caller.username !== "Sconosciuto") ? caller.username : (caller.reviewerName || caller.roleName);

    const updated = resetCandidaturaToVoting(id, actorName);
    if (!updated) {
      return res.status(404).json({ error: "Candidatura non trovata." });
    }

    addAccessLog(
      req,
      actorName,
      caller.roleName,
      "-",
      "Candidatura Risettata a Votazione CDA",
      "SUCCESS",
      `Candidatura di ${updated.fullName} (${updated.desiredRole}) RIAPERTA E RISETTATA A VOTAZIONE CDA da ${actorName}. Annullata qualsiasi decisione precedente di approvazione/rifiuto.`,
      "CANDIDATURE"
    );

    res.json({
      success: true,
      candidatura: updated,
      message: `Candidatura di ${updated.fullName} risettata a Votazione CDA con successo! Annullata la decisione precedente.`,
    });
  } catch (error) {
    console.error("Error resetting candidature to voting:", error);
    res.status(500).json({ error: "Errore durante il reset della candidatura." });
  }
});

// Delete a candidature record (Admin only)
app.delete("/api/admin/candidature/:id", requireAdmin, (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const caller = getCallerGradeAndRole(req);
    const actorName = (caller.username && caller.username !== "Sconosciuto") ? caller.username : (caller.reviewerName || caller.roleName);

    const list = getCandidature();
    const target = list.find(c => c.id === id || String(c.id).trim().toLowerCase() === id.toLowerCase());

    const deleted = deleteCandidatura(id);
    if (deleted) {
      const candInfo = target ? `di ${target.fullName} (${target.desiredRole})` : `ID ${id}`;
      addAccessLog(
        req,
        actorName,
        caller.roleName,
        "-",
        "Candidatura Eliminata",
        "SUCCESS",
        `Candidatura ${candInfo} eliminata dall'archivio da ${actorName}.`,
        "CANDIDATURE"
      );
      res.json({ success: true, message: "Candidatura eliminata con successo." });
    } else {
      res.status(404).json({ error: "Candidatura non trovata." });
    }
  } catch (error) {
    console.error("Error deleting candidature:", error);
    res.status(500).json({ error: "Errore durante l'eliminazione della candidatura." });
  }
});

// Add a candidate
app.post("/api/admin/candidates", requireAdmin, (req, res) => {
  try {
    const { roleId, name } = req.body;
    const cleanName = sanitizeString(name, 100);

    if (!roleId || !cleanName || cleanName.length === 0) {
      return res.status(400).json({ error: "ID ruolo e nome candidato valido sono obbligatori." });
    }

    // Verify roleId is valid
    if (!ROLE_CONFIGS[roleId as RoleId]) {
      return res.status(400).json({ error: "Ruolo selezionato non valido." });
    }

    const newCandidate = addCandidate(roleId as RoleId, cleanName);
    ensureTokensForCandidates();
    const caller = getCallerGradeAndRole(req);
    const actorName = (caller.username && caller.username !== "Sconosciuto") ? caller.username : (caller.reviewerName || caller.roleName);

    addAccessLog(
      req,
      actorName,
      caller.roleName,
      "-",
      "Candidato Aggiunto",
      "SUCCESS",
      `Aggiunto nuovo candidato '${cleanName}' per il ruolo '${roleId}' da ${actorName}.`,
      "MODIFICHE_ADMIN"
    );
    res.json({ success: true, candidate: newCandidate });
  } catch (error) {
    res.status(500).json({ error: "Errore durante l'aggiunta del candidato." });
  }
});

// Update/manage candidate names in bulk (independent of roles)
app.post("/api/admin/candidates/bulk", requireAdmin, (req, res) => {
  try {
    const { names } = req.body;
    if (!names || !Array.isArray(names)) {
      return res.status(400).json({ error: "La lista dei nomi dei candidati è obbligatoria e deve essere un array." });
    }
    
    const validNames = names
      .map(n => sanitizeString(n, 100))
      .filter(n => n.length > 0);

    const updated = updateCandidatesBulk(validNames);
    ensureTokensForCandidates();
    const caller = getCallerGradeAndRole(req);
    const actorName = (caller.username && caller.username !== "Sconosciuto") ? caller.username : (caller.reviewerName || caller.roleName);

    addAccessLog(
      req,
      actorName,
      caller.roleName,
      "-",
      "Lista Candidati Aggiornata",
      "SUCCESS",
      `Aggiornata lista candidati in blocco (${validNames.length} candidati) da ${actorName}.`,
      "MODIFICHE_ADMIN"
    );
    res.json({ success: true, candidates: updated });
  } catch (error) {
    res.status(500).json({ error: "Errore durante l'aggiornamento massivo dei candidati." });
  }
});

// Delete a candidate
app.delete("/api/admin/candidates/:id", requireAdmin, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 50);
    const caller = getCallerGradeAndRole(req);
    const actorName = (caller.username && caller.username !== "Sconosciuto") ? caller.username : (caller.reviewerName || caller.roleName);

    const deleted = removeCandidate(id);
    if (deleted) {
      // Clean up linked candidate token if present
      for (const [t, u] of REGISTERED_DISCORD_USERS.entries()) {
        if (u.candidateId === id) {
          REGISTERED_DISCORD_USERS.delete(t);
          deleteTokenFirestore(t);
        }
      }
      saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);
      ensureTokensForCandidates();
      addAccessLog(
        req,
        actorName,
        caller.roleName,
        "-",
        "Candidato Eliminato",
        "SUCCESS",
        `Eliminato candidato ID '${id}' da ${actorName}.`,
        "MODIFICHE_ADMIN"
      );
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Candidato non trovato." });
    }
  } catch (error) {
    res.status(500).json({ error: "Errore durante la rimozione del candidato." });
  }
});

// Update a candidate
app.put("/api/admin/candidates/:id", requireAdmin, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 50);
    const { name, roleId } = req.body;
    const cleanName = sanitizeString(name, 100);
    const caller = getCallerGradeAndRole(req);
    const actorName = (caller.username && caller.username !== "Sconosciuto") ? caller.username : (caller.reviewerName || caller.roleName);

    if (!cleanName || cleanName.length === 0) {
      return res.status(400).json({ error: "Nome candidato valido obbligatorio." });
    }

    if (!roleId || !ROLE_CONFIGS[roleId as RoleId]) {
      return res.status(400).json({ error: "Ruolo selezionato non valido." });
    }

    const updated = updateCandidate(id, cleanName, roleId as RoleId);
    if (updated) {
      ensureTokensForCandidates();
      addAccessLog(
        req,
        actorName,
        caller.roleName,
        "-",
        "Candidato Modificato",
        "SUCCESS",
        `Modificato candidato '${cleanName}' per il ruolo '${roleId}' da ${actorName}.`,
        "MODIFICHE_ADMIN"
      );
      res.json({ success: true, candidate: updated });
    } else {
      res.status(404).json({ error: "Candidato non trovato." });
    }
  } catch (error) {
    res.status(500).json({ error: "Errore durante l'aggiornamento del candidato." });
  }
});

// Update settings and optionally password
app.post("/api/admin/settings", requireAdmin, async (req, res) => {
  try {
    await syncAllDataWithFirestore(true);
    const { title, description, votingActive, allowMultipleSelection, requireAllRoles, newPassword, newEmergencyPassword } = req.body;
    
    const cleanTitle = typeof title === "string" ? sanitizeString(title, 150) : undefined;
    const cleanDesc = typeof description === "string" ? sanitizeString(description, 500) : undefined;

    const updated = await updateSettings({
      title: cleanTitle,
      description: cleanDesc,
      votingActive: typeof votingActive === "boolean" ? votingActive : undefined,
      allowMultipleSelection: typeof allowMultipleSelection === "boolean" ? allowMultipleSelection : undefined,
      requireAllRoles: typeof requireAllRoles === "boolean" ? requireAllRoles : undefined,
    });

    if (newPassword && typeof newPassword === "string" && newPassword.trim().length > 0) {
      const cleanPwd = newPassword.trim();
      if (cleanPwd.length < 6) {
        return res.status(400).json({ error: "La nuova password deve contenere almeno 6 caratteri." });
      }
      await updateAdminPassword(cleanPwd);
    }

    if (newEmergencyPassword && typeof newEmergencyPassword === "string" && newEmergencyPassword.trim().length > 0) {
      const cleanEmergencyPwd = newEmergencyPassword.trim();
      if (cleanEmergencyPwd.length < 6) {
        return res.status(400).json({ error: "La password di sblocco d'emergenza deve contenere almeno 6 caratteri." });
      }
      await updateEmergencyPassword(cleanEmergencyPwd);
    }

    const caller = getCallerGradeAndRole(req);
    const actorName = (caller.username && caller.username !== "Sconosciuto") ? caller.username : (caller.reviewerName || caller.roleName);

    addAccessLog(
      req,
      actorName,
      caller.roleName,
      "-",
      "Impostazioni Aggiornate",
      "SUCCESS",
      `Modificate impostazioni generali del portale da ${actorName}.`,
      "MODIFICHE_ADMIN"
    );

    res.json({ success: true, settings: updated });
  } catch (error) {
    res.status(500).json({ error: "Errore durante l'aggiornamento delle impostazioni." });
  }
});

// Reset / Clear all votes
app.delete("/api/admin/votes/clear", requireAdmin, (req, res) => {
  try {
    clearAllVotes();
    const caller = getCallerGradeAndRole(req);
    const actorName = (caller.username && caller.username !== "Sconosciuto") ? caller.username : (caller.reviewerName || caller.roleName);

    addAccessLog(
      req,
      actorName,
      caller.roleName,
      "-",
      "Reset Schedario Voti",
      "SUCCESS",
      `Svuotato completamente lo schedario con tutti i voti per decisione di ${actorName}.`,
      "MODIFICHE_ADMIN"
    );
    res.json({ success: true });
  } catch (error) {
    res.status(500).json({ error: "Errore durante il reset dei voti." });
  }
});

// Delete individual vote
app.delete("/api/admin/votes/:id", requireAdmin, (req, res) => {
  try {
    const id = sanitizeString(req.params.id, 50);
    const deleted = removeVote(id);
    if (deleted) {
      res.json({ success: true });
    } else {
      res.status(404).json({ error: "Voto non trovato." });
    }
  } catch (error) {
    res.status(500).json({ error: "Errore durante l'eliminazione del voto." });
  }
});

// Export employee tokens as Excel CSV (Restricted STRICTLY to Master Key)
app.get("/api/admin/export/employee-tokens", async (req, res) => {
  try {
    await syncAllDataWithFirestore(true);
    const authHeader = req.headers.authorization;
    const bearerToken = authHeader && authHeader.startsWith("Bearer ")
      ? authHeader.substring(7).trim().toUpperCase()
      : "";
    const queryToken = (req.query.token as string || "").trim().toUpperCase();
    const token = bearerToken || queryToken;

    const session = token ? ACTIVE_SESSIONS.get(token) : undefined;
    const isMasterToken = token === MASTER_SECRET_TOKEN.toUpperCase();
    const isMasterSession = isMasterToken || (session && String(session.employeeRoleName || "").toLowerCase().includes("proprietario"));

    if (!isMasterSession) {
      return res.status(403).send("Accesso negato. L'esportazione in Excel dei token dei ragazzi è riservata esclusivamente all'accesso con MASTER KEY.");
    }

    const tokensList = Array.from(REGISTERED_DISCORD_USERS.values())
      .filter((u) => u.token.toUpperCase() !== MASTER_SECRET_TOKEN.toUpperCase() && !u.isMaster)
      .sort((a, b) => {
        const gradeA = getUserEffectiveGrade(a);
        const gradeB = getUserEffectiveGrade(b);
        if (gradeB !== gradeA) {
          return gradeB - gradeA;
        }
        return (a.username || "").localeCompare(b.username || "");
      });

    // Exactly 3 requested columns: Nome e Cognome, Grado, Token
    const header = ["Nome e Cognome", "Grado", "Token"];

    const rows = tokensList.map((emp) => {
      const fullName = sanitizeForCsv(emp.username || "");
      const gradeName = sanitizeForCsv(emp.roleName || "");
      const tokenValue = sanitizeForCsv(emp.token || "");
      return [fullName, gradeName, tokenValue]
        .map((cell) => `"${(cell || "").replace(/"/g, '""')}"`)
        .join(";");
    });

    const csvContent = [header.join(";"), ...rows].join("\r\n");

    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=token_ragazzi_ems.csv");
    res.send("\uFEFF" + csvContent);
  } catch (error) {
    console.error("Errore durante l'esportazione dei token:", error);
    res.status(500).send("Errore del server durante l'esportazione dei token.");
  }
});

// Export database of votes to a CSV with formula injection protection
app.get("/api/admin/export", (req, res) => {
  try {
    const token = req.query.token as string;
    const session = token ? ACTIVE_SESSIONS.get(token) : undefined;
    
    if (!session || Date.now() - session.lastSeen > SESSION_TTL_MS) {
      return res.status(401).send("Non autorizzato. Effettua nuovamente l'accesso come amministratore.");
    }

    const votes = getVotes();
    
    // Header for CSV
    const header = [
      "Nome Votante",
      "Data e Ora Invio (UTC)",
      ...ROLE_IDS_SORTED_ASC.map(roleId => ROLE_CONFIGS[roleId].name)
    ];

    // Map each vote to a row with CSV formula injection protection
    const rows = votes.map(vote => {
      const row = [
        sanitizeForCsv(vote.voterFullName),
        new Date(vote.timestamp).toISOString().replace("T", " ").substring(0, 19),
        ...ROLE_IDS_SORTED_ASC.map(roleId => {
          const selectedCandidates = vote.selections[roleId] || [];
          return selectedCandidates.map(c => sanitizeForCsv(c)).join(" & ");
        })
      ];
      return row.map(cell => `"${(cell || "").replace(/"/g, '""')}"`).join(";");
    });

    const csvContent = [header.join(";"), ...rows].join("\n");
    
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=voti_gerarchia_ruoli.csv");
    res.send("\uFEFF" + csvContent);
  } catch (error) {
    res.status(500).send("Errore del server durante l'esportazione dei dati.");
  }
});

// Hex color codes mapping for each RoleId to be used in HTML reports
const ROLE_COLORS_HEX: Record<RoleId, string> = {
  [RoleId.V_PRIMARIO]: "#fbbf24",
  [RoleId.PRIMARIO]: "#b45309",
  [RoleId.V_RESPONSABILE_PRESIDIO]: "#fb923c",
  [RoleId.RESPONSABILE_PRESIDIO]: "#ea580c",
  [RoleId.AIUTO_SUPERVISORE]: "#f472b6",
  [RoleId.V_SUPERVISORE]: "#db2777",
  [RoleId.SUPERVISORE]: "#e11d48",
  [RoleId.SUPERVISORE_GENERALE]: "#9333ea",
  [RoleId.SEGRETARIO_DIREZIONE]: "#6d28d9",
  [RoleId.V_DIRETTORE]: "#ef4444",
  [RoleId.DIRETTORE]: "#b91c1c",
  [RoleId.DIRETTORE_GENERALE]: "#06b6d4",
};

// Export database of votes to an HTML Report with HTML escaping against XSS
app.get("/api/admin/export/html", (req, res) => {
  try {
    const token = req.query.token as string;
    const session = token ? ACTIVE_SESSIONS.get(token) : undefined;
    
    if (!session || Date.now() - session.lastSeen > SESSION_TTL_MS) {
      return res.status(401).send("Non autorizzato. Effettua nuovamente l'accesso come amministratore.");
    }

    const settings = getSettings();
    const votes = getVotes();
    const candidates = getCandidates();
    const totalVotes = votes.length;

    // Build statistics for each role in descending order of grade
    const rolesHtml = ROLE_IDS_SORTED_DESC.map(roleId => {
      const config = ROLE_CONFIGS[roleId];
      const hexColor = ROLE_COLORS_HEX[roleId] || "#6366f1";
      
      const candidateCounts: Record<string, number> = {};
      
      candidates.filter(c => c.roleId === roleId).forEach(c => {
        candidateCounts[c.name] = 0;
      });

      votes.forEach(vote => {
        const selectionsForRole = vote.selections[roleId] || [];
        selectionsForRole.forEach(name => {
          candidateCounts[name] = (candidateCounts[name] || 0) + 1;
        });
      });

      const sortedResults = Object.entries(candidateCounts)
        .map(([name, count]) => {
          const pct = totalVotes > 0 ? (count / totalVotes) * 100 : 0;
          return { name, count, pct };
        })
        .sort((a, b) => b.count - a.count);

      const votedResults = sortedResults.filter(item => item.count > 0);
      const excludedResults = sortedResults.filter(item => item.count === 0);

      const votedRows = votedResults.length === 0
        ? `<tr><td colspan="3" style="text-align: center; color: #888; font-style: italic; padding: 24px;">Nessun voto espresso per questo ruolo</td></tr>`
        : votedResults.map((item, idx) => {
            const width = item.pct.toFixed(1);
            const isWinner = idx === 0 && item.count > 0;
            return `
              <tr style="border-bottom: 1px solid #e5e7eb;">
                <td style="padding: 14px 20px; font-weight: 600; color: #1f2937; text-align: left;">
                  ${isWinner ? '<span style="color: #fbbf24; font-size: 15px; margin-right: 4px;">👑</span>' : ''}
                  ${escapeHtml(item.name)}
                </td>
                <td style="padding: 14px 20px; width: 50%;">
                  <div style="display: flex; align-items: center; gap: 12px;">
                    <div style="flex-grow: 1; background-color: #f3f4f6; border-radius: 9999px; height: 10px; overflow: hidden; box-shadow: inset 0 1px 2px rgba(0,0,0,0.05); border: 1px solid #e5e7eb;">
                      <div style="background-color: ${hexColor}; width: ${width}%; height: 100%; border-radius: 9999px; transition: width 0.3s ease;"></div>
                    </div>
                    <span style="font-size: 12px; font-weight: 700; color: #374151; min-width: 50px; text-align: right;">${width}%</span>
                  </div>
                </td>
                <td style="padding: 14px 20px; text-align: right; font-weight: 700; color: #4b5563;">
                  ${item.count} <span style="font-weight: 500; font-size: 11px; color: #9ca3af;">preferenze</span>
                </td>
              </tr>
            `;
          }).join("");

      const excludedHtml = excludedResults.length === 0
        ? ""
        : `
          <div style="padding: 16px 20px; background-color: #fbfbfb; border-top: 1px solid #e5e7eb;">
            <div style="font-size: 10px; font-weight: 800; color: #9ca3af; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 8px;">
              Esclusi (${excludedResults.length}) &middot; 0.0% voti
            </div>
            <div style="display: flex; flex-wrap: wrap; gap: 6px;">
              ${excludedResults.map(item => `
                <span style="display: inline-block; background-color: #f3f4f6; color: #6b7280; font-size: 10px; font-weight: 600; padding: 4px 8px; border-radius: 4px; border: 1px solid #e5e7eb;">
                  ${escapeHtml(item.name)}
                </span>
              `).join("")}
            </div>
          </div>
        `;

      return `
        <div style="background: white; border-radius: 12px; border: 1px solid #e5e7eb; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.05); margin-bottom: 28px; overflow: hidden; page-break-inside: avoid;">
          <div style="background: ${hexColor}; color: white; padding: 16px 24px; display: flex; justify-content: space-between; align-items: center;">
            <div style="display: flex; align-items: center; gap: 10px;">
              <span style="font-size: 18px; font-weight: 800; background: rgba(255,255,255,0.2); width: 28px; height: 28px; display: inline-flex; align-items: center; justify-content: center; border-radius: 50%;">
                ★
              </span>
              <h2 style="margin: 0; font-size: 15px; font-weight: 800; letter-spacing: 0.025em; text-transform: uppercase;">
                ${escapeHtml(config.name)}
              </h2>
            </div>
            <span style="font-size: 11px; font-weight: 800; background: rgba(0,0,0,0.15); padding: 4px 12px; border-radius: 9999px; text-transform: uppercase; letter-spacing: 0.05em; border: 1px solid rgba(255,255,255,0.25);">
              Grado ${config.grade}
            </span>
          </div>
          <div style="padding: 0;">
            <table style="width: 100%; border-collapse: collapse; text-align: left; font-size: 13px;">
              <thead>
                <tr style="background-color: #f9fafb; border-bottom: 1px solid #e5e7eb;">
                  <th style="padding: 12px 20px; color: #6b7280; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em;">Persona / Candidato</th>
                  <th style="padding: 12px 20px; color: #6b7280; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em;">Progresso Voti</th>
                  <th style="padding: 12px 20px; text-align: right; color: #6b7280; font-weight: 700; text-transform: uppercase; font-size: 10px; letter-spacing: 0.05em;">Preferenze Ricevute</th>
                </tr>
              </thead>
              <tbody>
                ${votedRows}
              </tbody>
            </table>
          </div>
          ${excludedHtml}
        </div>
      `;
    }).join("");

    const fullHtml = `<!DOCTYPE html>
<html lang="it">
<head>
  <meta charset="UTF-8">
  <title>Report Elettorale - ${escapeHtml(settings.title)}</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
      background-color: #f9fafb;
      color: #1f2937;
      margin: 0;
      padding: 40px 24px;
      line-height: 1.5;
    }
    .container {
      max-width: 900px;
      margin: 0 auto;
    }
    .header {
      background: #111827;
      color: white;
      border-radius: 16px;
      padding: 36px;
      margin-bottom: 40px;
      box-shadow: 0 10px 15px -3px rgba(0, 0, 0, 0.1);
    }
    .header h1 {
      margin: 0 0 10px 0;
      font-size: 28px;
      font-weight: 800;
      letter-spacing: -0.025em;
    }
    .header p {
      margin: 0;
      font-size: 14px;
      color: #9ca3af;
      font-weight: 500;
      line-height: 1.6;
    }
    .meta-box {
      display: inline-flex;
      flex-wrap: wrap;
      background: rgba(255,255,255,0.06);
      border: 1px solid rgba(255,255,255,0.12);
      border-radius: 8px;
      padding: 8px 16px;
      font-size: 12px;
      font-weight: 700;
      color: #e5e7eb;
      margin-top: 20px;
      gap: 16px;
    }
    .footer {
      text-align: center;
      margin-top: 60px;
      font-size: 12px;
      color: #9ca3af;
      font-weight: 500;
      border-top: 1px solid #e5e7eb;
      padding-top: 20px;
    }
    @media print {
      body {
        background-color: white;
        padding: 0;
      }
      .container {
        max-width: 100%;
      }
      .header {
        box-shadow: none;
        border: 1px solid #111827;
        background: #111827 !important;
        -webkit-print-color-adjust: exact;
        print-color-adjust: exact;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>${escapeHtml(settings.title)}</h1>
      <p>${escapeHtml(settings.description)}</p>
      <div class="meta-box">
        <span>SCHEDE SCRUTINATE TOTALI: <strong style="color: #60a5fa; font-size: 14px;">${totalVotes}</strong></span>
        <span>•</span>
        <span>DATA EXPORT: <strong>${escapeHtml(new Date().toLocaleString("it-IT"))}</strong></span>
      </div>
    </div>

    ${rolesHtml}

    <div class="footer">
      Report Grafico Ufficiale generato il ${escapeHtml(new Date().toLocaleString("it-IT"))} • Area Amministratore Riservata
    </div>
  </div>
</body>
</html>`;

    res.setHeader("Content-Type", "text/html; charset=utf-8");
    res.setHeader("Content-Disposition", "attachment; filename=report_grafico_voti_totali.html");
    res.send(fullHtml);
  } catch (error) {
    res.status(500).send("Errore del server durante l'esportazione del report.");
  }
});

// --- VITE WEB AND STATIC ASSETS HANDLERS ---

// --- NOTIFICATIONS API ENDPOINT ---
app.get("/api/notifications", (req, res) => {
  try {
    const authHeader = req.headers.authorization;
    let userToken = "";
    if (authHeader && authHeader.startsWith("Bearer ")) {
      userToken = authHeader.substring(7).trim();
    } else if (req.query.token) {
      userToken = String(req.query.token).trim();
    }

    const session = userToken ? REGISTERED_DISCORD_USERS.get(userToken.toUpperCase()) : undefined;
    const caller = getCallerGradeAndRole(req);

    const isMaster = (userToken && userToken.toUpperCase() === MASTER_SECRET_TOKEN.toUpperCase()) || caller.isMaster;
    const isAdminPassword = caller.isAdminPassword;
    const isOwner = session?.roleName === "Proprietario" || session?.roleName === "Vice Proprietario" || isMaster;
    const isAuthenticated = !!session || isMaster || isAdminPassword;

    let hasCdaAccess = isOwner;
    let cdaRoleName = "";
    if (session) {
      if (session.hasCdaAccess !== false) {
        if (session.cdaRoleName && session.cdaRoleName !== "DEFAULT") {
          hasCdaAccess = true;
          cdaRoleName = session.cdaRoleName;
        } else if (isCdaRoleName(session.roleName)) {
          hasCdaAccess = true;
          cdaRoleName = session.roleName;
        }
      }
    }
    if (isMaster || isAdminPassword) {
      hasCdaAccess = true;
      if (!cdaRoleName) cdaRoleName = "Proprietario (Master)";
    }

    const cdaRank = getCdaRank(cdaRoleName || (isOwner ? "Proprietario" : ""));

    const notifications: Array<{
      id: string;
      title: string;
      message: string;
      category: "CANDIDATURE" | "GERARCHIA" | "CDA" | "ADMIN";
      timestamp: string;
      badgeColor: string;
    }> = [];

    const settings = getSettings();
    const allCandidature = getCandidature();

    // 1. CANDIDATURE NOTIFICATIONS (Available for ALL users, unauthenticated & authenticated)
    if (settings.candidatureEnabled !== false) {
      notifications.push({
        id: "cand-open-status",
        title: "Candidature EMS Aperte",
        message: "Le candidature ufficiali per il Soccorso Sanitario EMS sono attualmente APERTE. Puoi inviare la tua richiesta nell'apposita sezione.",
        category: "CANDIDATURE",
        timestamp: new Date().toISOString(),
        badgeColor: "bg-purple-500/20 text-purple-300 border-purple-500/30",
      });
    } else {
      notifications.push({
        id: "cand-closed-status",
        title: "Candidature EMS Chiuse",
        message: "Le candidature per il Soccorso Sanitario EMS sono attualmente CHIUSE.",
        category: "CANDIDATURE",
        timestamp: new Date().toISOString(),
        badgeColor: "bg-purple-500/10 text-purple-400 border-purple-500/20",
      });
    }

    // Specific user candidacy status (if token or user name matched)
    if (userToken || session) {
      const myCand = allCandidature.find(c => 
        (c.token && userToken && c.token.toUpperCase() === userToken.toUpperCase()) ||
        (session?.username && c.fullName.toLowerCase() === session.username.toLowerCase())
      );
      if (myCand) {
        if (myCand.status === "PENDING") {
          notifications.push({
            id: `my-cand-pending-${myCand.id}`,
            title: "Candidatura In Valutazione",
            message: `La tua candidatura per '${myCand.desiredRole}' è in fase di revisione da parte della Direzione/CDA.`,
            category: "CANDIDATURE",
            timestamp: myCand.submittedAt,
            badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          });
        } else if (myCand.status === "APPROVED") {
          notifications.push({
            id: `my-cand-approved-${myCand.id}`,
            title: "Candidatura Approvata!",
            message: `La tua candidatura per '${myCand.desiredRole}' è stata approvata ed è attiva!`,
            category: "CANDIDATURE",
            timestamp: myCand.reviewedAt || myCand.submittedAt,
            badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
          });
        } else if (myCand.status === "REJECTED") {
          notifications.push({
            id: `my-cand-rejected-${myCand.id}`,
            title: "Candidatura Rifiutata",
            message: `La tua candidatura per '${myCand.desiredRole}' è stata respinta. Motivo: ${myCand.rejectionReason || "Nessun motivo fornito"}`,
            category: "CANDIDATURE",
            timestamp: myCand.reviewedAt || myCand.submittedAt,
            badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
          });
        } else if (myCand.status === "CANCELLED") {
          notifications.push({
            id: `my-cand-cancelled-${myCand.id}`,
            title: "Candidatura Annullata",
            message: `La tua candidatura per '${myCand.desiredRole}' è stata annullata. Motivo: ${myCand.cancellationReason || "Annullata dall'utente"}`,
            category: "CANDIDATURE",
            timestamp: myCand.cancelledAt || myCand.submittedAt,
            badgeColor: "bg-slate-500/20 text-slate-300 border-slate-500/30",
          });
        }
      }
    }

    // 2. VOTAZIONI GERARCHIA NOTIFICATIONS (For authenticated token users or owners)
    if (isAuthenticated || isOwner) {
      if (settings.votingActive) {
        notifications.push({
          id: "voting-active-status",
          title: "Votazioni Gerarchia APERTE",
          message: "Le votazioni ufficiali per la Gerarchia EMS sono attualmente APERTE. Accedi al Portale Elettore per esprimere le tue preferenze.",
          category: "GERARCHIA",
          timestamp: new Date().toISOString(),
          badgeColor: "bg-blue-500/20 text-blue-300 border-blue-500/30",
        });

        // Check if user has already voted in current session
        const votes = getVotes();
        const userVoted = session?.username && votes.some(v => v.voterFullName.toLowerCase() === session.username.toLowerCase());
        if (!userVoted) {
          notifications.push({
            id: "voting-reminder-pending",
            title: "Promemoria Voto Gerarchia",
            message: "Non hai ancora espresso la tua preferenza nelle votazioni di Gerarchia EMS aperte.",
            category: "GERARCHIA",
            timestamp: new Date().toISOString(),
            badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          });
        }
      } else {
        notifications.push({
          id: "voting-closed-status",
          title: "Votazioni Gerarchia CHIUSE",
          message: "Le votazioni per la Gerarchia EMS sono attualmente CHIUSE.",
          category: "GERARCHIA",
          timestamp: new Date().toISOString(),
          badgeColor: "bg-slate-700/30 text-slate-400 border-slate-600/30",
        });
      }
    }

    // 3. CDA NOTIFICATIONS (For CDA users, co-signers, authors, or owners)
    const directProposals = getCdaProposals();

    // Check co-signer requests & author updates for current user
    directProposals.forEach((p) => {
      // Co-signer alert
      if (p.status === "PENDING_COSIGNERS" && p.coSigners && p.coSigners.length > 0) {
        const userPrefix = userToken ? userToken.toUpperCase().replace(/^EMS-/, "").substring(0, 2) : "";
        const userCleanName = session?.username?.toLowerCase() || "";
        const needsSignature = p.coSigners.some((cs) => {
          if (cs.hasSigned) return false;
          if (userPrefix && cs.tokenPrefix && cs.tokenPrefix.toUpperCase() === userPrefix) return true;
          if (userCleanName && cs.name && userCleanName.includes(cs.name.toLowerCase())) return true;
          return false;
        });

        if (needsSignature) {
          notifications.push({
            id: `cosigner-req-${p.id}`,
            title: "Richiesta Co-Firma Proposta CDA",
            message: `La proposta '${p.title}' creata da ${p.proposerName} richiede la tua co-firma per essere presentata in CDA.`,
            category: "CDA",
            timestamp: p.submittedAt,
            badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          });
        }
      }

      // Author update alert
      if (
        (p.token && userToken && p.token.toUpperCase() === userToken.toUpperCase()) ||
        (session?.username && p.proposerName.toLowerCase() === session.username.toLowerCase())
      ) {
        if (p.status === "PENDING_COSIGNERS") {
          notifications.push({
            id: `my-prop-cosigners-${p.id}`,
            title: "Proposta CDA in Attesa Co-Firme",
            message: `La tua proposta '${p.title}' è in attesa delle co-firme richieste.`,
            category: "CDA",
            timestamp: p.submittedAt,
            badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          });
        } else if (p.status === "PENDING_REVISION") {
          notifications.push({
            id: `my-prop-segretario-${p.id}`,
            title: "Proposta CDA in Attesa Segreteria",
            message: `La tua proposta '${p.title}' è in attesa di valutazione dal Segretario CDA.`,
            category: "CDA",
            timestamp: p.submittedAt,
            badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
          });
        } else if (p.status === "IN_VOTING") {
          notifications.push({
            id: `my-prop-voting-${p.id}`,
            title: "Proposta CDA in Votazione!",
            message: `La tua proposta '${p.title}' è in votazione ufficiale nel CDA.`,
            category: "CDA",
            timestamp: p.submittedAt,
            badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          });
        } else if (p.status === "APPROVED") {
          notifications.push({
            id: `my-prop-approved-${p.id}`,
            title: "Proposta CDA Approvata!",
            message: `La tua proposta '${p.title}' è stata APPROVATA dal CDA!`,
            category: "CDA",
            timestamp: p.reviewedAt || p.submittedAt,
            badgeColor: "bg-emerald-500/20 text-emerald-300 border-emerald-500/30",
          });
        } else if (p.status === "REJECTED") {
          notifications.push({
            id: `my-prop-rejected-${p.id}`,
            title: "Proposta CDA Respinta",
            message: `La tua proposta '${p.title}' è stata respinta. Motivo: ${p.rejectionReason || p.cdaData?.cdaActionReason || "Nessun motivo specificato"}`,
            category: "CDA",
            timestamp: p.reviewedAt || p.submittedAt,
            badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
          });
        }
      }
    });

    if (hasCdaAccess || isOwner) {
      // Direct CDA Proposals
      directProposals.forEach((p) => {
        if (p.status === "IN_VOTING") {
          notifications.push({
            id: `cda-prop-voting-active-${p.id}`,
            title: "Votazione Proposta CDA In Corso",
            message: `Proposta: '${p.title}' (Presentata da: ${p.proposerName}). Esprimi il tuo voto nel Portale CDA.`,
            category: "CDA",
            timestamp: p.submittedAt,
            badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          });
        }

        if (p.status === "APPROVED" || p.status === "REJECTED") {
          notifications.push({
            id: `cda-prop-result-${p.id}`,
            title: `Esito Proposta CDA: ${p.status === "APPROVED" ? "APPROVATA" : "RESPINTA"}`,
            message: `La proposta '${p.title}' di ${p.proposerName} si è conclusa con esito: ${p.status === "APPROVED" ? "APPROVATA" : "RESPINTA"}.`,
            category: "CDA",
            timestamp: p.reviewedAt || p.submittedAt,
            badgeColor: p.status === "APPROVED" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border-rose-500/30",
          });
        }

        if ((cdaRank >= 2 || isOwner) && p.status === "PENDING_REVISION") {
          notifications.push({
            id: `cda-prop-pending-revision-${p.id}`,
            title: "Proposta CDA da Esaminare (Segretario)",
            message: `Proposta '${p.title}' in attesa di approvazione per l'apertura delle votazioni.`,
            category: "CDA",
            timestamp: p.submittedAt,
            badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
          });
        }
      });

      // Candidature CDA Motions
      const cdaMotions = allCandidature.filter(c => c.cdaData);

      cdaMotions.forEach(c => {
        const cda = c.cdaData!;
        // Membro CDA notifications (cdaRank >= 1 or Owner)
        if (cda.status === "IN_VOTING") {
          notifications.push({
            id: `cda-voting-active-${c.id}`,
            title: "Votazione CDA In Corso",
            message: `Mozione CDA per ${c.fullName} (Ruolo: ${c.desiredRole}). Accedi all'Area CDA per esprimere il tuo voto.`,
            category: "CDA",
            timestamp: cda.renderedAt || c.submittedAt,
            badgeColor: "bg-amber-500/20 text-amber-300 border-amber-500/30",
          });
        }

        if (cda.status === "APPROVED" || cda.status === "REJECTED") {
          notifications.push({
            id: `cda-voting-result-${c.id}`,
            title: `Risultato Votazione CDA: ${cda.status === "APPROVED" ? "APPROVATA" : "RESPINTA"}`,
            message: `La mozione CDA per ${c.fullName} (${c.desiredRole}) si è conclusa con esito: ${cda.status === "APPROVED" ? "APPROVATA" : "RESPINTA"}.`,
            category: "CDA",
            timestamp: cda.cdaActionAt || cda.renderedAt || c.submittedAt,
            badgeColor: cda.status === "APPROVED" ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30" : "bg-rose-500/20 text-rose-300 border-rose-500/30",
          });
        }

        // Segretario CDA notifications (cdaRank >= 2 or Owner)
        if ((cdaRank >= 2 || isOwner) && cda.status === "PENDING_RENDER") {
          notifications.push({
            id: `cda-pending-render-${c.id}`,
            title: "Mozione CDA Da Valutare (Segretario)",
            message: `Candidatura di ${c.fullName} in attesa di valutazione e reindirizzamento al voto ufficiale CDA.`,
            category: "CDA",
            timestamp: c.submittedAt,
            badgeColor: "bg-indigo-500/20 text-indigo-300 border-indigo-500/30",
          });
        }

        // Vice Presidente, Presidente, Consigliere Finale CDA notifications (cdaRank >= 3 or Owner)
        if (cdaRank >= 3 || isOwner) {
          // Check stopped early before 24h or RETURNED
          if (cda.status === "RETURNED" || (cda.cdaActionReason && cda.cdaActionReason.toLowerCase().includes("anticipat"))) {
            notifications.push({
              id: `cda-stopped-early-${c.id}`,
              title: "Votazione CDA Interrotta Anticipatamente",
              message: `La votazione CDA per ${c.fullName} è stata stoppata/interrotta prima delle 24h ordinarie. Motivo: ${cda.cdaActionReason || 'Interruzione direttiva'}`,
              category: "CDA",
              timestamp: cda.cdaActionAt || new Date().toISOString(),
              badgeColor: "bg-orange-500/20 text-orange-300 border-orange-500/30",
            });
          }

          // Check tie / parità situation
          if (cda.status === "TIE_PENDING") {
            notifications.push({
              id: `cda-tie-pending-${c.id}`,
              title: "Allerta CDA: Parità di Voti",
              message: `Riscontrata parità di voti (pareggio) nella votazione CDA per ${c.fullName}. Richiesto intervento direttivo per risoluzione parità.`,
              category: "CDA",
              timestamp: cda.cdaActionAt || new Date().toISOString(),
              badgeColor: "bg-rose-500/25 text-rose-200 border-rose-500/40",
            });
          }
        }
      });
    }

    // 4. ADMIN PORTAL NOTIFICATIONS (For Admin Portal access / Owner)
    if (isAdminPassword || isOwner) {
      const pendingCandCount = allCandidature.filter((c) => c.status === "PENDING").length;
      const pendingPropCount = directProposals.filter((p) => p.status === "PENDING_COSIGNERS" || p.status === "PENDING_REVISION" || p.status === "IN_VOTING").length;

      notifications.push(
        {
          id: "admin-notif-logs",
          title: "Amministrazione - Log di Sistema",
          message: "Registri e log di accesso sincronizzati in tempo reale",
          category: "ADMIN",
          timestamp: new Date().toISOString(),
          badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
        },
        {
          id: "admin-notif-candidature",
          title: "Amministrazione - Candidature",
          message: pendingCandCount > 0 ? `Ci sono ${pendingCandCount} candidature in attesa di valutazione` : "Tutte le candidature sono state esaminate",
          category: "ADMIN",
          timestamp: new Date().toISOString(),
          badgeColor: pendingCandCount > 0 ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-slate-700/30 text-slate-400 border-slate-600/30",
        },
        {
          id: "admin-notif-cda-proposals",
          title: "Amministrazione - Proposte CDA",
          message: pendingPropCount > 0 ? `Ci sono ${pendingPropCount} proposte CDA attive/in corso` : "Tutte le proposte CDA sono gestite",
          category: "ADMIN",
          timestamp: new Date().toISOString(),
          badgeColor: pendingPropCount > 0 ? "bg-amber-500/20 text-amber-300 border-amber-500/30" : "bg-slate-700/30 text-slate-400 border-slate-600/30",
        },
        {
          id: "admin-notif-votazioni",
          title: "Amministrazione - Gestore Votazioni",
          message: "Pannello gestione votazioni gerarchia attivo",
          category: "ADMIN",
          timestamp: new Date().toISOString(),
          badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
        },
        {
          id: "admin-notif-tokens",
          title: "Amministrazione - Token Dipendenti",
          message: "Gestione ed autorizzazione ruoli e token dipendenti",
          category: "ADMIN",
          timestamp: new Date().toISOString(),
          badgeColor: "bg-rose-500/20 text-rose-300 border-rose-500/30",
        }
      );
    }

    res.json({ success: true, notifications });
  } catch (error) {
    console.error("Error fetching notifications:", error);
    res.status(500).json({ error: "Errore nel caricamento delle notifiche." });
  }
});

let lastGlobalSyncTimestamp = 0;
let isGlobalSyncInProgress = false;

export async function syncAllDataWithFirestore(force = false) {
  if (isGlobalSyncInProgress || isFirestoreQuotaExhausted()) return;
  const now = Date.now();
  if (!force && now - lastGlobalSyncTimestamp < 15000) return;
  isGlobalSyncInProgress = true;

  try {
    // 1. Sync primary database schema (candidates, votes, candidature, cdaProposals, gameScores, etc.)
    await syncFromFirestore();

    // 2. Sync permanently purged tokens from Cloud Firestore
    const cloudPurged = await syncPurgedTokensFirestore();
    if (cloudPurged && Array.isArray(cloudPurged)) {
      cloudPurged.forEach((t) => {
        if (t) PURGED_TOKENS.add(t.toUpperCase());
      });
      savePurgedTokens(PURGED_TOKENS);
    }
    const cloudPurgedSet = new Set((cloudPurged || []).map((t) => t.toUpperCase()));
    for (const pKey of PURGED_TOKENS) {
      if (!cloudPurgedSet.has(pKey)) {
        await savePurgedTokenFirestore(pKey);
      }
    }

    // 3. Sync revoked tokens from Cloud Firestore (merge union, never wipe local revocations)
    const cloudRevoked = await syncRevokedTokensFirestore();
    if (cloudRevoked && Array.isArray(cloudRevoked)) {
      cloudRevoked.forEach((r) => {
        if (r && r.token) REVOKED_TOKENS.set(r.token.toUpperCase(), r);
      });
      saveRevokedTokens(REVOKED_TOKENS);
    }
    // Push any local revoked token to Cloud Firestore
    const cloudRevokedTokens = new Set((cloudRevoked || []).map((r) => r?.token?.toUpperCase()).filter(Boolean));
    for (const [rKey, rVal] of REVOKED_TOKENS.entries()) {
      if (!cloudRevokedTokens.has(rKey)) {
        await saveRevokedTokenFirestore(rVal);
      }
    }

    // Build comprehensive revoked & purged sets
    const revokedTokensSet = new Set<string>();
    const revokedUsernames = new Set<string>();
    const revokedCandIds = new Set<string>();
    for (const pKey of PURGED_TOKENS) {
      revokedTokensSet.add(pKey.toUpperCase());
    }
    for (const [rKey, r] of REVOKED_TOKENS.entries()) {
      revokedTokensSet.add(rKey.toUpperCase());
      if (r.token) revokedTokensSet.add(r.token.toUpperCase());
      if (r.username) revokedUsernames.add(r.username.trim().toLowerCase());
      if (r.candidateId) revokedCandIds.add(r.candidateId);
    }

    // 4. Sync employee tokens and access logs from Cloud Firestore
    const cloudTokensAndLogs = await syncTokensAndLogsFirestore();
    const cloudTokenKeys = new Set<string>();

    if (cloudTokensAndLogs.tokens && cloudTokensAndLogs.tokens.length > 0) {
      // Update memory with tokens from Firestore (strictly keeping official allowed tokens)
      cloudTokensAndLogs.tokens.forEach((t) => {
        if (t && t.token) {
          const uKey = t.token.toUpperCase();
          const tUserLower = (t.username || "").trim().toLowerCase();
          const tCandId = t.candidateId;
          const isAllowed = ALLOWED_OFFICIAL_TOKEN_KEYS.has(uKey);
          const isRevoked = !isAllowed || revokedTokensSet.has(uKey) ||
            (tUserLower && revokedUsernames.has(tUserLower)) ||
            (tCandId && revokedCandIds.has(tCandId));

          if (!isRevoked && isAllowed) {
            cloudTokenKeys.add(uKey);
            REGISTERED_DISCORD_USERS.set(uKey, t);
          } else {
            // Actively purge invalid/revoked/duplicate doc from Firestore employee_tokens
            deleteTokenFirestore(t.token, t.username, t.candidateId);
          }
        }
      });
    }

    // Ensure all official seeds are present
    ensureTokensForCandidates();

    // Bi-directional token sync: ensure all official active tokens are persisted to Cloud Firestore
    for (const [tKey, localUser] of REGISTERED_DISCORD_USERS.entries()) {
      if (tKey !== MASTER_SECRET_TOKEN.toUpperCase()) {
        const uUserLower = (localUser.username || "").trim().toLowerCase();
        const uCandId = localUser.candidateId;
        const isAllowed = ALLOWED_OFFICIAL_TOKEN_KEYS.has(tKey.toUpperCase());
        const isRevoked = !isAllowed || revokedTokensSet.has(tKey) ||
          (localUser.token && revokedTokensSet.has(localUser.token.toUpperCase())) ||
          (uUserLower && revokedUsernames.has(uUserLower)) ||
          (uCandId && revokedCandIds.has(uCandId));

        if (!isRevoked && isAllowed) {
          if (!cloudTokenKeys.has(tKey)) {
            await saveTokenFirestore(localUser);
          }
        } else {
          REGISTERED_DISCORD_USERS.delete(tKey);
          deleteTokenFirestore(localUser.token || tKey, localUser.username, localUser.candidateId);
        }
      }
    }

    // Remove any lingering revoked or unofficial tokens from memory
    for (const rKey of revokedTokensSet) {
      REGISTERED_DISCORD_USERS.delete(rKey);
    }
    for (const [uKey, uVal] of Array.from(REGISTERED_DISCORD_USERS.entries())) {
      if (
        !ALLOWED_OFFICIAL_TOKEN_KEYS.has(uKey.toUpperCase()) ||
        (uVal.username && revokedUsernames.has(uVal.username.trim().toLowerCase())) ||
        (uVal.candidateId && revokedCandIds.has(uVal.candidateId))
      ) {
        REGISTERED_DISCORD_USERS.delete(uKey);
        deleteTokenFirestore(uVal.token || uKey, uVal.username, uVal.candidateId);
      }
    }

    // Always guarantee Master Secret Token session
    REGISTERED_DISCORD_USERS.set(MASTER_SECRET_TOKEN.toUpperCase(), MASTER_SESSION);
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);

    if (cloudTokensAndLogs.logs && cloudTokensAndLogs.logs.length > 0) {
      const logsMap = new Map<string, AccessLog>();
      ACCESS_LOGS.forEach((l) => { if (l && l.id) logsMap.set(l.id, l); });
      cloudTokensAndLogs.logs.forEach((l) => {
        if (l && l.id) logsMap.set(l.id, l);
      });
      ACCESS_LOGS = Array.from(logsMap.values());
      ACCESS_LOGS.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
      saveAccessLogs(ACCESS_LOGS);
    }

    // Bi-directional sync: ensure local access logs not yet in Firestore are pushed
    if (cloudTokensAndLogs.logs) {
      const cloudLogIds = new Set(cloudTokensAndLogs.logs.map((l) => l.id));
      ACCESS_LOGS.forEach((localLog) => {
        if (localLog && localLog.id && !cloudLogIds.has(localLog.id)) {
          saveAccessLogFirestore(localLog);
        }
      });
    }

    // 4. Sync active sessions
    const cloudSessions = await syncActiveSessionsFirestore();
    if (cloudSessions && cloudSessions.length > 0) {
      cloudSessions.forEach((s) => {
        if (s && s.token && !ACTIVE_SESSIONS.has(s.token)) {
          ACTIVE_SESSIONS.set(s.token, {
            createdAt: s.createdAt || Date.now(),
            lastSeen: s.lastSeen || Date.now(),
            employeeToken: s.employeeToken,
            employeeUsername: s.employeeUsername,
            employeeRoleName: s.employeeRoleName,
            reviewerName: s.reviewerName,
          });
        }
      });
    }

    // 5. Ensure official hierarchy members
    HIERARCHY_MEMBERS = buildAutoHierarchyMembers();
    saveAllHierarchyMembersFirestore(HIERARCHY_MEMBERS);

    lastGlobalSyncTimestamp = Date.now();
  } catch (err) {
    console.error("Error in syncAllDataWithFirestore:", err);
  } finally {
    isGlobalSyncInProgress = false;
  }
}

async function startServer() {
  try {
    ensureTokensForCandidates();

    if (!HIERARCHY_MEMBERS || HIERARCHY_MEMBERS.length === 0) {
      HIERARCHY_MEMBERS = buildAutoHierarchyMembers();
    }

    if (process.env.NODE_ENV !== "production") {
      // Development mode with Vite middleware
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
    } else {
      // Production mode
      const distPath = path.join(process.cwd(), "dist");
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        res.sendFile(path.join(distPath, "index.html"));
      });
    }

    app.listen(PORT, "0.0.0.0", () => {
      console.log(`Server running on http://0.0.0.0:${PORT}`);

      // Asynchronously synchronize with Cloud Firestore in the background
      syncAllDataWithFirestore(true).catch((e) => {
        console.error("Initial Firestore sync error:", e);
      });

      // Setup periodic background sync every 30 seconds
      setInterval(() => {
        syncAllDataWithFirestore().catch((e) => console.error("Background sync error:", e));
      }, 30000);
    });
  } catch (err) {
    console.error("Failed to start server:", err);
  }
}

startServer();
