import express from "express";
import path from "path";
import fs from "fs";
import crypto from "crypto";
import { createServer as createViteServer } from "vite";
import {
  initDB,
  syncFromFirestore,
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
  syncRevokedTokensFirestore,
  saveRevokedTokenFirestore,
  deleteRevokedTokenFirestore,
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
} from "./src/types.js";

// Initialize DB on startup
initDB();

const app = express();
const PORT = process.env.PORT || 3000;

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

interface SessionData {
  createdAt: number;
  lastSeen: number;
  employeeToken?: string;
  employeeUsername?: string;
  employeeRoleName?: string;
  reviewerName?: string;
}

const ACTIVE_SESSIONS = new Map<string, SessionData>();
const SESSION_TTL_MS = 4 * 60 * 60 * 1000; // 4 hours admin session timeout

// Periodic automatic cleanup of expired sessions
setInterval(() => {
  const now = Date.now();
  for (const [token, session] of ACTIVE_SESSIONS.entries()) {
    if (now - session.lastSeen > SESSION_TTL_MS) {
      ACTIVE_SESSIONS.delete(token);
    }
  }
}, 5 * 60 * 1000);

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
  if (token.toUpperCase() === MASTER_SECRET_TOKEN) {
    return next();
  }

  // Check active session (created via password login)
  const session = ACTIVE_SESSIONS.get(token);
  if (session) {
    const now = Date.now();
    if (now - session.lastSeen > SESSION_TTL_MS) {
      ACTIVE_SESSIONS.delete(token);
      return res.status(401).json({ error: "Sessione scaduta per inattività. Effettua nuovamente il login." });
    }
    session.lastSeen = now;
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
}

const DISCORD_USERS_FILE = path.join(process.cwd(), "discord_registered_users.json");

interface RevokedTokenEntry {
  token: string;
  candidateId?: string;
  username?: string;
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
    list.forEach((r) => {
      if (r.token) saveRevokedTokenFirestore(r);
    });
  } catch (err) {
    console.error("Errore scrittura revoked_tokens.json:", err);
  }
}

const REVOKED_TOKENS = loadRevokedTokens();

// Helper to load registered users from disk
function loadRegisteredDiscordUsers(): Map<string, DiscordSession> {
  const usersMap = new Map<string, DiscordSession>();
  try {
    if (fs.existsSync(DISCORD_USERS_FILE)) {
      const data = JSON.parse(fs.readFileSync(DISCORD_USERS_FILE, "utf-8"));
      if (Array.isArray(data)) {
        data.forEach((u: DiscordSession) => {
          if (u.token) usersMap.set(u.token.toUpperCase(), u);
        });
      }
    }
  } catch (err) {
    console.error("Errore lettura discord_registered_users.json:", err);
  }
  return usersMap;
}

// Helper to save registered users to disk and Cloud Firestore
function saveRegisteredDiscordUsers(usersMap: Map<string, DiscordSession>) {
  try {
    const list = Array.from(usersMap.values());
    fs.writeFileSync(DISCORD_USERS_FILE, JSON.stringify(list, null, 2), "utf-8");
    list.forEach((u) => {
      if (u.token) saveTokenFirestore(u);
    });
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

    return { grade: 100, roleName, username, reviewerName, isMaster: false, isAdminPassword: true };
  }

  const regUser = REGISTERED_DISCORD_USERS.get(token.toUpperCase());
  if (regUser) {
    if (regUser.expiresAt && new Date().getTime() > new Date(regUser.expiresAt).getTime()) {
      return { grade: 0, roleName: "Token Scaduto", username: regUser.username, reviewerName: regUser.username, isMaster: false, isAdminPassword: false };
    }
    const grade = getRoleGrade(regUser.roleName);
    const username = regUser.username || regUser.roleName;
    const reviewerName = username;
    return { grade, roleName: regUser.roleName, username, reviewerName, isMaster: false, isAdminPassword: false };
  }

  return { grade: 0, roleName: "Sconosciuto", username: "Sconosciuto", reviewerName: "Sconosciuto", isMaster: false, isAdminPassword: false };
}

// Auto-generate tokens for all candidates registered in "Candidati per ruolo"
function ensureTokensForCandidates() {
  const candidates = getCandidates();
  let newCreated = 0;

  // Always ensure Master Secret Token is present
  REGISTERED_DISCORD_USERS.set(MASTER_SECRET_TOKEN.toUpperCase(), MASTER_SESSION);

  // Build sets of revoked candidate IDs and usernames
  const revokedCandidateIds = new Set<string>();
  const revokedUsernames = new Set<string>();
  for (const r of REVOKED_TOKENS.values()) {
    if (r.candidateId) revokedCandidateIds.add(r.candidateId);
    if (r.username) revokedUsernames.add(r.username.trim().toLowerCase());
  }

  candidates.forEach((cand) => {
    const cleanCandName = cand.name.trim().toLowerCase();

    // DO NOT auto-generate a token if this candidate's token was explicitly revoked/deleted by admin
    if (revokedCandidateIds.has(cand.id) || revokedUsernames.has(cleanCandName)) {
      return;
    }

    const roleConfig = ROLE_CONFIGS[cand.roleId];
    const roleName = roleConfig ? roleConfig.name : "V. Primario di Reparto";

    // Check if token already exists for candidate
    let existingToken: string | null = null;
    for (const [t, u] of REGISTERED_DISCORD_USERS.entries()) {
      if (
        (u.candidateId && u.candidateId === cand.id) ||
        u.username.trim().toLowerCase() === cleanCandName
      ) {
        existingToken = t;
        u.candidateId = cand.id; // ensure linked
        break;
      }
    }

    if (!existingToken) {
      const cleanInitials = cand.name
        .split(" ")
        .map((w) => w.replace(/[^a-zA-Z]/g, "")[0])
        .filter(Boolean)
        .join("")
        .toUpperCase()
        .slice(0, 3);

      const randomSuffix = crypto.randomBytes(2).toString("hex").toUpperCase();
      const generatedToken = `EMS-${cleanInitials || "CAND"}${randomSuffix}`;

      const session: DiscordSession = {
        token: generatedToken,
        username: cand.name.trim(),
        roleName: roleName,
        gradeName: roleName,
        isAllowed: true,
        verifiedAt: new Date().toISOString(),
        candidateId: cand.id,
      };

      REGISTERED_DISCORD_USERS.set(generatedToken.toUpperCase(), session);
      newCreated++;
    }
  });

  if (newCreated > 0) {
    console.log(`Auto-generati ${newCreated} token per i candidati registrati per ruolo.`);
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

// Check if caller is high-level owner (Master token, Proprietario, or Vice Proprietario with grade >= 99)
function isHighLevelOwnerCaller(caller: { isMaster: boolean; roleName: string; grade: number }): boolean {
  if (!caller) return false;
  if (caller.isMaster) return true;
  if (caller.grade >= 99) return true;
  const clean = (caller.roleName || "").trim().toLowerCase();
  if (clean.includes("proprietario")) return true;
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

    // Store in memory & save to disk persistently
    REGISTERED_DISCORD_USERS.set(token.toUpperCase(), userSession);
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
app.post("/api/discord/verify", (req, res) => {
  try {
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

// Check active discord session
app.get("/api/discord/session", (req, res) => {
  cleanupExpiredTokens();

  const authHeader = req.headers.authorization;
  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ authenticated: false });
  }

  const token = authHeader.substring(7).toUpperCase();

  // Always recognize and guarantee Master Secret Token session
  if (token === MASTER_SECRET_TOKEN.toUpperCase()) {
    if (!REGISTERED_DISCORD_USERS.has(token)) {
      REGISTERED_DISCORD_USERS.set(token, MASTER_SESSION);
    }
    return res.json({ authenticated: true, session: MASTER_SESSION });
  }

  const session = REGISTERED_DISCORD_USERS.get(token);

  if (!session) {
    return res.status(401).json({ authenticated: false, error: "Sessione non trovata o token revocato" });
  }

  if (session.expiresAt && new Date().getTime() > new Date(session.expiresAt).getTime()) {
    REGISTERED_DISCORD_USERS.delete(token);
    deleteTokenFirestore(token);
    ACTIVE_SESSIONS.delete(token);
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);
    return res.status(401).json({ authenticated: false, error: "Token TEST scaduto e rimosso" });
  }

  res.json({ authenticated: true, session });
});

// List all registered bot users (for admin debugging or overview)
app.get("/api/discord/registered-users", (req, res) => {
  const list = Array.from(REGISTERED_DISCORD_USERS.values());
  res.json({ count: list.length, users: list });
});

// --- PUBLIC API ENDPOINTS ---


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
app.post("/api/admin/login", loginLimiter, (req, res) => {
  try {
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
app.post("/api/admin/unlock", (req, res) => {
  try {
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
app.get("/api/admin/employee-tokens", requireAdmin, (req, res) => {
  try {
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

    let tokensList = Array.from(REGISTERED_DISCORD_USERS.values()).map((u) => {
      const isExpired = u.expiresAt ? new Date().getTime() > new Date(u.expiresAt).getTime() : false;
      return {
        ...u,
        isExpired,
      };
    }).sort((a, b) => {
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
app.post("/api/admin/employee-tokens", requireAdmin, (req, res) => {
  try {
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

    const { fullName, roleName, customToken, cdaRoleName, hasCdaAccess } = req.body;
    const cleanName = sanitizeString(fullName, 100);
    const cleanRole = sanitizeString(roleName, 100);
    const cleanCdaRole = cdaRoleName ? sanitizeString(cdaRoleName, 100) : undefined;

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
        error: `Il grado '${cleanRole}' non è autorizzato per la votazione. Seleziona un grado da Vice Primario di Reparto a Proprietario.`,
      });
    }

    // Generate readable token or use custom
    const token = customToken
      ? sanitizeString(customToken, 40).toUpperCase()
      : "EMS-" + crypto.randomBytes(3).toString("hex").toUpperCase();

    const newSession: DiscordSession = {
      token,
      username: cleanName,
      roleName: cleanRole,
      gradeName: cleanRole,
      isAllowed: true,
      verifiedAt: new Date().toISOString(),
      cdaRoleName: cleanCdaRole,
      hasCdaAccess: typeof hasCdaAccess === "boolean" ? hasCdaAccess : (cleanCdaRole ? true : undefined),
    };

    // Un-revoke user if previously revoked
    for (const [revKey, revItem] of REVOKED_TOKENS.entries()) {
      if (revItem.username && revItem.username.trim().toLowerCase() === cleanName.trim().toLowerCase()) {
        REVOKED_TOKENS.delete(revKey);
        deleteRevokedTokenFirestore(revKey);
      }
    }
    saveRevokedTokens(REVOKED_TOKENS);

    REGISTERED_DISCORD_USERS.set(token.toUpperCase(), newSession);
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
app.post("/api/admin/test-tokens", requireAdmin, (req, res) => {
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

    const { fullName, roleName, cdaRoleName, customToken, durationValue, durationUnit, hasCdaAccess } = req.body;
    const cleanName = sanitizeString(fullName, 100);
    const cleanRole = sanitizeString(roleName, 100);
    const cleanCdaRole = cdaRoleName ? sanitizeString(cdaRoleName, 100) : undefined;

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
    };

    REGISTERED_DISCORD_USERS.set(token.toUpperCase(), testSession);
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
app.put("/api/admin/employee-tokens/:token", requireAdmin, (req, res) => {
  try {
    const caller = getCallerGradeAndRole(req);
    if (caller.grade < 10) {
      return res.status(403).json({ error: "Accesso riservato: Solo il personale con grado da V. Direttore in su può modificare i token dipendenti." });
    }

    const tokenToUpdate = sanitizeString(req.params.token, 50).toUpperCase();
    if (tokenToUpdate === MASTER_SECRET_TOKEN.toUpperCase()) {
      return res.status(403).json({ error: "Il Token Master permanente non può essere modificato." });
    }

    const existingUser = REGISTERED_DISCORD_USERS.get(tokenToUpdate);
    if (!existingUser) {
      return res.status(404).json({ error: "Token non trovato." });
    }

    const { fullName, roleName, cdaRoleName, hasCdaAccess, newToken } = req.body;
    const cleanName = fullName ? sanitizeString(fullName, 100) : existingUser.username;
    const cleanRole = roleName ? sanitizeString(roleName, 100) : existingUser.roleName;
    const cleanCdaRole = cdaRoleName !== undefined ? (cdaRoleName ? sanitizeString(cdaRoleName, 100) : undefined) : existingUser.cdaRoleName;
    const cleanNewToken = newToken ? sanitizeString(newToken, 50).toUpperCase() : tokenToUpdate;

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

    // Security Check: Only High-Level Owner Callers (Vice Proprietario, Proprietario, Master) can assign restricted roles (Proprietario, Vice Proprietario, Consigliere Finale CDA)
    if ((isRestrictedRole(cleanRole) || (cleanCdaRole && isRestrictedRole(cleanCdaRole))) && !isHighLevelOwnerCaller(caller)) {
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
        error: "Permesso negato: Solo la Proprietà e Vice Proprietà (Token Proprietario / Vice Proprietario / Master) possono assegnare i ruoli di Proprietario, Vice Proprietario e Consigliere Finale CDA.",
      });
    }

    const updatedSession: DiscordSession = {
      ...existingUser,
      username: cleanName,
      roleName: cleanRole,
      gradeName: cleanRole,
      cdaRoleName: cleanCdaRole,
      hasCdaAccess: typeof hasCdaAccess === "boolean" ? hasCdaAccess : (cleanCdaRole ? true : existingUser.hasCdaAccess),
      token: cleanNewToken,
    };

    if (!cleanCdaRole) {
      delete updatedSession.cdaRoleName;
      delete updatedSession.hasCdaAccess;
    }

    if (cleanNewToken !== tokenToUpdate) {
      REGISTERED_DISCORD_USERS.delete(tokenToUpdate);
      deleteTokenFirestore(tokenToUpdate);

      // Update ACTIVE_SESSIONS if present
      for (const [sKey, sVal] of ACTIVE_SESSIONS.entries()) {
        if (sVal.employeeToken === tokenToUpdate) {
          sVal.employeeToken = cleanNewToken;
          sVal.employeeUsername = cleanName;
          sVal.employeeRoleName = cleanRole;
        }
      }
    }

    REGISTERED_DISCORD_USERS.set(cleanNewToken, updatedSession);
    saveTokenFirestore(updatedSession);
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);

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
app.delete("/api/admin/employee-tokens/:token", requireAdmin, (req, res) => {
  try {
    const caller = getCallerGradeAndRole(req);
    if (caller.grade < 10) {
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

    const tokenToRevoke = sanitizeString(req.params.token, 50).toUpperCase();

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

    if (!REGISTERED_DISCORD_USERS.has(tokenToRevoke)) {
      return res.status(404).json({ error: "Token non trovato o già revocato." });
    }

    const existingUser = REGISTERED_DISCORD_USERS.get(tokenToRevoke);

    // Record in REVOKED_TOKENS to ensure permanent deletion and prevent auto-recreation
    const revokedEntry: RevokedTokenEntry = {
      token: tokenToRevoke,
      candidateId: existingUser?.candidateId,
      username: existingUser?.username,
      revokedAt: new Date().toISOString(),
    };
    REVOKED_TOKENS.set(tokenToRevoke.toUpperCase(), revokedEntry);
    saveRevokedTokens(REVOKED_TOKENS);

    REGISTERED_DISCORD_USERS.delete(tokenToRevoke);
    deleteTokenFirestore(tokenToRevoke);
    saveRegisteredDiscordUsers(REGISTERED_DISCORD_USERS);

    // Revoke any active session as well
    ACTIVE_SESSIONS.delete(tokenToRevoke);

    addAccessLog(
      req,
      existingUser?.username || "Dipendente",
      existingUser?.roleName || "-",
      tokenToRevoke,
      "Token Revocato",
      "REVOKED",
      `Token ${tokenToRevoke} eliminato dall'amministratore. L'utente viene disconnesso all'istante.`
    );

    res.json({ success: true, message: `Token ${tokenToRevoke} revocato con successo. L'utente verrà sloggato immediatamente.` });
  } catch (error) {
    res.status(500).json({ error: "Errore durante la revoca del token." });
  }
});

// --- ADMIN ACCESS LOGS ENDPOINTS ---

// Get all access logs
app.get("/api/admin/access-logs", requireAdmin, (req, res) => {
  try {
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
  if (!hierarchyHasBeenLoaded && (!HIERARCHY_MEMBERS || HIERARCHY_MEMBERS.length === 0)) {
    HIERARCHY_MEMBERS = buildAutoHierarchyMembers();
    hierarchyHasBeenLoaded = true;
    saveAllHierarchyMembersFirestore(HIERARCHY_MEMBERS);
  }
  return HIERARCHY_MEMBERS;
}

function buildAutoHierarchyMembers(): HierarchyMember[] {
  ensureTokensForCandidates();
  const membersMap = new Map<string, HierarchyMember>();

  // 1. Add Owners & Token Holders from REGISTERED_DISCORD_USERS
  REGISTERED_DISCORD_USERS.forEach((user) => {
    if (user.isAllowed && user.username) {
      const categoryKey = getCategoryForRole(user.roleName);
      const key = `${user.username.trim().toLowerCase()}_${user.roleName.trim().toLowerCase()}`;
      if (!membersMap.has(key)) {
        membersMap.set(key, {
          id: "HIER-" + crypto.randomBytes(4).toString("hex"),
          name: user.username.trim(),
          roleName: user.roleName.trim(),
          categoryKey,
          badge: user.roleName.toLowerCase().includes("proprietario") ? "Proprietario / Fondatore EMS" : "Membro Verificato EMS",
          discordTag: user.discordTag || `@${user.username.trim().toLowerCase().replace(/\s+/g, "_")}`,
          updatedAt: new Date().toISOString(),
        });
      }
    }
  });

  // 2. Add candidates from "Candidati per ruolo"
  const candidates = getCandidates();
  candidates.forEach((cand) => {
    const roleConfig = ROLE_CONFIGS[cand.roleId];
    const roleName = roleConfig ? roleConfig.name : "V. Primario di Reparto";
    const categoryKey = getCategoryForRole(roleName);
    const key = `${cand.name.trim().toLowerCase()}_${roleName.trim().toLowerCase()}`;

    if (!membersMap.has(key)) {
      membersMap.set(key, {
        id: "HIER-" + crypto.randomBytes(4).toString("hex"),
        name: cand.name.trim(),
        roleName: roleName,
        categoryKey,
        badge: "Candidato Ufficiale",
        discordTag: `@${cand.name.trim().toLowerCase().replace(/\s+/g, "_")}`,
        updatedAt: new Date().toISOString(),
      });
    }
  });

  const list = Array.from(membersMap.values());
  list.sort((a, b) => {
    const gradeA = getRoleGrade(a.roleName);
    const gradeB = getRoleGrade(b.roleName);
    if (gradeB !== gradeA) {
      return gradeB - gradeA;
    }
    return a.name.localeCompare(b.name);
  });

  hierarchyHasBeenLoaded = true;
  return list;
}

// Public endpoint to get full hierarchy (Accessible to everyone)
app.get("/api/hierarchy", (req, res) => {
  try {
    ensureHierarchyLoaded();

    res.json({
      success: true,
      categories: HIERARCHY_CATEGORIES,
      members: HIERARCHY_MEMBERS,
      totalCount: HIERARCHY_MEMBERS.length,
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


// --- CANDIDATURA API ENDPOINTS ---

// Public / Token-Accessible submission endpoint for Candidatura
app.post("/api/candidature", (req, res) => {
  try {
    const { fullName, currentRole, desiredRole, timeSlot, offerText } = req.body;

    const cleanFullName = sanitizeString(fullName, 100);
    const cleanCurrentRole = sanitizeString(currentRole, 100);
    const cleanDesiredRole = sanitizeString(desiredRole, 100);
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

  if (caller.isMaster || caller.isAdminPassword || userToken.toUpperCase() === "EMS-2410PROP") {
    return {
      isCdaMember: true,
      token: userToken || "EMS-2410PROP",
      username: caller.username !== "Sconosciuto" ? caller.username : "Proprietario Master",
      roleName: "Proprietario (Master)",
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

  return {
    isCdaMember: !!isCda,
    token: userToken,
    username,
    roleName,
    cdaRank: rank,
    isMaster: false,
    isTestToken: !!session?.isTestToken,
    expiresAt: session?.expiresAt,
    canReinderizzare: isCda && rank >= 2,
    canDirectReview: isCda && rank >= 2,
    canDirectApprove: isCda && rank >= 3,
    canDirectReturn: isCda && rank >= 2,
    canVote: isCda && rank >= 1,
    canPreventiveAccept: isCda && rank >= 3,
    canResolveTie: isCda && rank >= 3,
    isReasonOptional: rank >= 5,
  };
}

// Get candidatures for CDA Portal with auto-processing of expired 24h timers
app.get("/api/cda/candidature", (req, res) => {
  try {
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

// Direct Review: Accept or Send Back/Reject (Segretario CDA and above)
app.post("/api/cda/direct-review/:id", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const { action, reason } = req.body; // action: "APPROVE" | "RETURN"
    const cleanReason = reason ? sanitizeString(reason, 500).trim() : "";
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canDirectReview) {
      return res.status(403).json({
        error: "Permesso negato. Solo il Segretario CDA ed i gradi superiori possono gestire o rimandare indietro direttamente la candidatura.",
      });
    }

    if (action === "APPROVE" && !info.canDirectApprove && info.cdaRank < 3 && !info.isMaster) {
      return res.status(403).json({
        error: "Permesso negato: Il Segretario CDA non può accettare direttamente le candidature! Può solo inviarle a votazione CDA o annullarle (rimandandole indietro al mittente).",
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
    const { decision, reason } = req.body; // decision: "FAVOREVOLE" | "CONTRARIO" | "ASTENUTO"
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

    const existingVotes = target.cdaData.votes || {};
    const voterKey = info.token || info.username;

    const voteEntry = {
      voterToken: info.token,
      voterName: info.username,
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
      info.username,
      info.roleName,
      info.token || "-",
      "Voto Espresso in CDA",
      "SUCCESS",
      `Voto '${decision}' espresso da ${info.username} (${info.roleName}) per la candidatura di ${target.fullName}.`,
      "CDA"
    );

    res.json({
      success: true,
      candidatura: updated,
      message: `Il tuo voto (${decision}) è stato registrato con successo!`,
    });
  } catch (error) {
    console.error("Error voting in CDA:", error);
    res.status(500).json({ error: "Errore durante il salvataggio del voto CDA." });
  }
});

// Close Voting Preventively before 24h timer ends (Vice Presidente CDA and above)
app.post("/api/cda/preventive-accept/:id", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const { reason } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 500).trim() : "";
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canPreventiveAccept) {
      return res.status(403).json({
        error: "Permesso negato. La chiusura preventiva della votazione prima delle 24h è riservata dal grado di Vice Presidente CDA in su (Vice Presidente, Presidente, Consigliere Finale, Proprietario Master).",
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

// Resolve Tie after 24h timer ends (Vice Presidente CDA and above)
app.post("/api/cda/resolve-tie/:id", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const { decision, reason } = req.body; // decision: "APPROVE" | "REJECT"
    const cleanReason = reason ? sanitizeString(reason, 500).trim() : "";
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canResolveTie) {
      return res.status(403).json({
        error: "Permesso negato. In caso di parità, la risoluzione è riservata dal grado di Vice Presidente CDA in su.",
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
app.get("/api/cda/proposals", (req, res) => {
  try {
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
      coSigners,
    } = req.body;

    if (!type || (type !== "GENERICA" && type !== "PROMOZIONE")) {
      return res.status(400).json({ error: "Tipo di proposta non valido (deve essere GENERICA o PROMOZIONE)." });
    }

    const cleanProposer = sanitizeString(proposerName, 150) || info.username;
    const cleanTitle = sanitizeString(title, 250);
    const cleanDesc = sanitizeString(description, 5000);

    if (!cleanTitle || cleanTitle.length < 3) {
      return res.status(400).json({ error: "Il titolo/oggetto della proposta è obbligatorio (almeno 3 caratteri)." });
    }
    if (!cleanDesc || cleanDesc.length < 5) {
      return res.status(400).json({ error: "I dettagli/motivazione della proposta sono obbligatori." });
    }

    if (type === "PROMOZIONE") {
      if (!targetEmployeeName || !targetProposedRole) {
        return res.status(400).json({ error: "Per una proposta di promozione occorre specificare il nome del dipendente e il ruolo proposto." });
      }
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
      title: cleanTitle,
      description: cleanDesc,
      targetEmployeeName: targetEmployeeName ? sanitizeString(targetEmployeeName, 150) : undefined,
      targetCurrentRole: targetCurrentRole ? sanitizeString(targetCurrentRole, 150) : undefined,
      targetProposedRole: targetProposedRole ? sanitizeString(targetProposedRole, 150) : undefined,
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

    const { decision, reason } = req.body;
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

    const currentVotes = { ...(target.cdaData.votes || {}) };
    const userVoteKey = info.username.toLowerCase().replace(/\s+/g, "_");

    currentVotes[userVoteKey] = {
      voterToken: info.token || userVoteKey,
      voterName: info.username,
      voterRole: info.roleName,
      decision,
      reason: reason ? sanitizeString(reason, 1000) : undefined,
      timestamp: now.toISOString(),
    };

    const updated = updateCdaProposalCda(target.id, { votes: currentVotes });

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Voto Proposta CDA Registrato",
      "SUCCESS",
      `Espresso voto '${decision}' per la proposta CDA "${target.title}" da parte di ${info.username} (${info.roleName}).`,
      "CDA"
    );

    res.json({ success: true, proposal: updated });
  } catch (error) {
    console.error("Error voting on proposal:", error);
    res.status(500).json({ error: "Errore durante la registrazione del voto." });
  }
});

// Direct Approve Proposal
app.post("/api/cda/proposals/:id/direct-approve", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || (!info.canDirectApprove && !info.canDirectReview)) {
      return res.status(403).json({ error: "Non hai i permessi di grado CDA per approvare direttamente questa proposta." });
    }

    const { reason } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 1000) : "";

    const list = getCdaProposals();
    const target = list.find((p) => p.id === id);
    if (!target) return res.status(404).json({ error: "Proposta non trovata." });

    const now = new Date();
    const updated = updateCdaProposalCda(
      target.id,
      {
        status: "APPROVED",
        cdaActionReason: cleanReason || "Approvazione diretta da grado autorizzato CDA.",
        cdaActionBy: info.username,
        cdaActionRole: info.roleName,
        cdaActionAt: now.toISOString(),
      },
      "APPROVED",
      info.username
    );

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Proposta CDA Approvata Direttamente",
      "SUCCESS",
      `Proposta CDA "${target.title}" approvata direttamente da ${info.username} (${info.roleName}).`,
      "CDA"
    );

    res.json({ success: true, proposal: updated });
  } catch (error) {
    console.error("Error direct approving proposal:", error);
    res.status(500).json({ error: "Errore durante l'approvazione diretta." });
  }
});

// Direct Return / Reject Proposal
app.post("/api/cda/proposals/:id/direct-return", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canDirectReturn) {
      return res.status(403).json({ error: "Non hai i permessi di grado CDA per respingere direttamente questa proposta." });
    }

    const { reason } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 1000) : "";

    const list = getCdaProposals();
    const target = list.find((p) => p.id === id);
    if (!target) return res.status(404).json({ error: "Proposta non trovata." });

    deleteCdaProposal(target.id);

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Proposta CDA Respinta ed Eliminata",
      "SUCCESS",
      `Proposta CDA "${target.title}" respinta ed eliminata da ${info.username} (${info.roleName}). Motivazione: ${cleanReason || "Nessuna motivazione"}`,
      "CDA"
    );

    res.json({ success: true, deleted: true, message: `Proposta CDA "${target.title}" respinta ed eliminata con successo.` });
  } catch (error) {
    console.error("Error direct returning proposal:", error);
    res.status(500).json({ error: "Errore durante il rifiuto della proposta." });
  }
});

// Chiusura Preventiva Proposta CDA
app.post("/api/cda/proposals/:id/preventive", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const { reason } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 500).trim() : "";
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canPreventiveAccept) {
      return res.status(403).json({
        error: "Permesso negato. La chiusura preventiva della votazione della proposta è riservata dal grado di Vice Presidente CDA in su.",
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
      outcomeLabel === "RIFIUTATA" ? summaryReason : undefined
    );

    addAccessLog(
      req,
      info.username,
      info.roleName,
      info.token || "-",
      "Chiusura Preventiva Votazione Proposta CDA",
      "SUCCESS",
      `Votazione per la proposta "${target.title}" CHIUSA PREVENTIVAMENTE da ${info.username} (${info.roleName}). Esito: ${outcomeLabel}.`,
      "CDA"
    );

    res.json({
      success: true,
      proposal: updated,
      message: `Votazione della proposta chiusa preventivamente con esito: ${outcomeLabel}.`,
    });
  } catch (error) {
    console.error("Error preventive closing proposal voting:", error);
    res.status(500).json({ error: "Errore durante la chiusura preventiva della votazione proposta." });
  }
});

// Resolve Tie for Proposal CDA
app.post("/api/cda/proposals/:id/resolve-tie", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember || !info.canResolveTie) {
      return res.status(403).json({ error: "Solo il Vice Presidente CDA o superiori possono risolvere un pareggio per le proposte CDA." });
    }

    const { decision, reason } = req.body;
    if (decision !== "APPROVE" && decision !== "REJECT") {
      return res.status(400).json({ error: "Decisione di pareggio non valida (deve essere APPROVE o REJECT)." });
    }

    const cleanReason = reason ? sanitizeString(reason, 1000) : "";
    const list = getCdaProposals();
    const target = list.find((p) => p.id === id);
    if (!target) return res.status(404).json({ error: "Proposta non trovata." });

    const now = new Date();
    const finalOutcome = decision === "APPROVE" ? "APPROVED" : "REJECTED";

    const updated = updateCdaProposalCda(
      target.id,
      {
        status: finalOutcome,
        cdaActionReason: `Pareggio risolto (${decision === "APPROVE" ? "APPROVATA" : "RESPINTA"}) da ${info.username}: ${cleanReason}`,
        cdaActionBy: info.username,
        cdaActionRole: info.roleName,
        cdaActionAt: now.toISOString(),
      },
      finalOutcome,
      info.username,
      decision === "REJECT" ? cleanReason : undefined
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

// Cancel / Withdraw CDA Proposal (by author with mandatory reason, or Master Key)
app.post("/api/cda/proposals/:id/cancel", (req, res) => {
  try {
    const rawId = req.params.id || "";
    const id = sanitizeString(rawId, 250) || rawId.trim();
    const info = getCdaCallerInfo(req);

    if (!info.isCdaMember && !info.isMaster) {
      return res.status(403).json({ error: "Accesso riservato ai membri CDA per ritirare una proposta." });
    }

    const proposals = getCdaProposals();
    const target = proposals.find((p) => p.id === id);
    if (!target) {
      return res.status(404).json({ error: "Proposta CDA non trovata." });
    }

    if (target.status === "APPROVED" || target.status === "REJECTED" || target.status === "CANCELLED") {
      return res.status(400).json({ error: "Impossibile ritirare una proposta già conclusa o annullata." });
    }

    // Check if caller is the proposer or Master Key
    const isProposer = (
      (target.token && info.token && target.token.trim().toUpperCase() === info.token.trim().toUpperCase()) ||
      (target.proposerName && info.username && target.proposerName.trim().toLowerCase() === info.username.trim().toLowerCase())
    );

    if (!info.isMaster && !isProposer) {
      return res.status(403).json({ error: "Solo l'autore della proposta o il Proprietario Master possono ritirare questa proposta." });
    }

    const { reason } = req.body;
    const cleanReason = reason ? sanitizeString(reason, 2000) : "";

    // Validation: reason is mandatory for regular proposer, optional for master key
    if (!info.isMaster) {
      if (!cleanReason || cleanReason.trim().length < 3) {
        return res.status(400).json({ error: "La motivazione del ritiro è obbligatoria." });
      }
    }

    const finalReason = cleanReason || (info.isMaster ? "Ritirata da Proprietario Master" : "Ritirata dal proponente");
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
app.post("/api/admin/settings", requireAdmin, (req, res) => {
  try {
    const { title, description, votingActive, allowMultipleSelection, requireAllRoles, newPassword, newEmergencyPassword } = req.body;
    
    const cleanTitle = typeof title === "string" ? sanitizeString(title, 150) : undefined;
    const cleanDesc = typeof description === "string" ? sanitizeString(description, 500) : undefined;

    const updated = updateSettings({
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
      updateAdminPassword(cleanPwd);
    }

    if (newEmergencyPassword && typeof newEmergencyPassword === "string" && newEmergencyPassword.trim().length > 0) {
      const cleanEmergencyPwd = newEmergencyPassword.trim();
      if (cleanEmergencyPwd.length < 6) {
        return res.status(400).json({ error: "La password di sblocco d'emergenza deve contenere almeno 6 caratteri." });
      }
      updateEmergencyPassword(cleanEmergencyPwd);
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

async function startServer() {
  // Sync state from Cloud Firestore
  await syncFromFirestore();

  // Sync employee tokens and access logs from Cloud Firestore
  const cloudTokensAndLogs = await syncTokensAndLogsFirestore();
  if (cloudTokensAndLogs.tokens && cloudTokensAndLogs.tokens.length > 0) {
    cloudTokensAndLogs.tokens.forEach((t) => {
      if (t.token) REGISTERED_DISCORD_USERS.set(t.token.toUpperCase(), t);
    });
  }

  // Sync revoked tokens from Cloud Firestore and remove them from active tokens map
  const cloudRevoked = await syncRevokedTokensFirestore();
  if (cloudRevoked && cloudRevoked.length > 0) {
    cloudRevoked.forEach((r) => {
      if (r.token) REVOKED_TOKENS.set(r.token.toUpperCase(), r);
    });
    saveRevokedTokens(REVOKED_TOKENS);
  }

  // Remove any revoked tokens from memory map
  for (const rKey of REVOKED_TOKENS.keys()) {
    REGISTERED_DISCORD_USERS.delete(rKey);
  }
  if (cloudTokensAndLogs.logs && cloudTokensAndLogs.logs.length > 0) {
    const existingIds = new Set(ACCESS_LOGS.map((l) => l.id));
    cloudTokensAndLogs.logs.forEach((l) => {
      if (l.id && !existingIds.has(l.id)) {
        ACCESS_LOGS.push(l);
      }
    });
    ACCESS_LOGS.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());
    saveAccessLogs(ACCESS_LOGS);
  }

  // Ensure tokens exist for all candidates organized by role hierarchy
  ensureTokensForCandidates();

  // Sync hierarchy members from Cloud Firestore
  const cloudMembers = await syncHierarchyMembersFirestore();
  if (cloudMembers && cloudMembers.length > 0) {
    HIERARCHY_MEMBERS = cloudMembers;
  } else {
    HIERARCHY_MEMBERS = buildAutoHierarchyMembers();
    saveAllHierarchyMembersFirestore(HIERARCHY_MEMBERS);
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
  });
}

startServer();
