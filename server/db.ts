import fs from "fs";
import path from "path";
import crypto from "crypto";
import { initializeApp, getApps, getApp } from "firebase/app";
import {
  getFirestore,
  initializeFirestore,
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  writeBatch,
  setLogLevel,
} from "firebase/firestore";
import { RoleId, Candidate, Vote, SiteSettings, Candidatura, CandidaturaStatus, CdaData, CdaStatus, CdaUserVote, CdaProposal, CdaProposalStatus, GameScore } from "../src/types.js";

// Database filepath for local fallback / cache
const DB_FILE = path.join(process.cwd(), "db.json");

export interface DatabaseSchema {
  settings: SiteSettings;
  adminPasswordHash: string;
  emergencyPasswordHash?: string;
  candidates: Candidate[];
  votes: Vote[];
  candidature?: Candidatura[];
  cdaProposals?: CdaProposal[];
  gameScores?: GameScore[];
}

// Load Firebase configuration
const configPath = path.join(process.cwd(), "firebase-applet-config.json");
let firebaseConfig: any = null;
if (fs.existsSync(configPath)) {
  try {
    firebaseConfig = JSON.parse(fs.readFileSync(configPath, "utf-8"));
  } catch (e) {
    console.error("Failed to parse firebase-applet-config.json", e);
  }
}

let firestoreDb: any = null;
let firestoreQuotaExhausted = true;
let quotaExhaustedResetTimer: NodeJS.Timeout | null = null;

export function isFirestoreQuotaExhausted(): boolean {
  return firestoreQuotaExhausted;
}

export function sanitizeForFirestore<T>(obj: T): T {
  if (!obj) return obj;
  return JSON.parse(JSON.stringify(obj));
}

export function handleFirestoreError(context: string, err: any) {
  const isQuotaExhausted =
    err?.code === "resource-exhausted" ||
    err?.code === 8 ||
    err?.message?.includes("RESOURCE_EXHAUSTED") ||
    err?.message?.includes("Quota limit exceeded") ||
    err?.message?.includes("quota");

  const isPermissionDenied =
    err?.code === "permission-denied" ||
    err?.code === 7 ||
    err?.message?.includes("PERMISSION_DENIED") ||
    err?.message?.includes("Missing or insufficient permissions");

  const isOffline =
    err?.code === "unavailable" ||
    err?.code === 14 ||
    err?.code === "failed-precondition" ||
    err?.message?.includes("offline") ||
    err?.message?.includes("client is offline") ||
    err?.message?.includes("Failed to get document because the client is offline") ||
    err?.message?.includes("unavailable") ||
    err?.message?.includes("network") ||
    err?.message?.includes("ETIMEDOUT") ||
    err?.message?.includes("ECONNRESET");

  if (isQuotaExhausted) {
    if (!firestoreQuotaExhausted) {
      firestoreQuotaExhausted = true;
      console.warn(`Firestore [${context}]: Quota limit exceeded (Daily free tier). Seamlessly falling back to local disk persistence.`);
      if (!quotaExhaustedResetTimer) {
        quotaExhaustedResetTimer = setTimeout(() => {
          firestoreQuotaExhausted = false;
          quotaExhaustedResetTimer = null;
        }, 15 * 60 * 1000); // Retry after 15 minutes
      }
    }
  } else if (isPermissionDenied) {
    console.warn(`Firestore [${context}]: Permissions denied. Falling back to local disk persistence.`);
  } else if (isOffline) {
    console.warn(`Firestore [${context}]: Firestore offline / network unreachable. Seamlessly using local disk database.`);
  } else {
    console.error(`Firestore [${context}] error:`, err);
  }
}

export async function safeFirestoreWrite(writeFn: () => Promise<any>, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await writeFn();
    } catch (err: any) {
      const isQuotaExhausted =
        err?.code === "resource-exhausted" ||
        err?.code === 8 ||
        err?.message?.includes("RESOURCE_EXHAUSTED") ||
        err?.message?.includes("Quota limit exceeded");

      if (isQuotaExhausted) {
        handleFirestoreError("safeFirestoreWrite", err);
        return null;
      }

      const isCancelled =
        err?.message?.includes("CANCELLED") ||
        err?.code === 1 ||
        err?.code === "cancelled" ||
        err?.message?.includes("stream");
      if (isCancelled && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
        continue;
      }
      handleFirestoreError("safeFirestoreWrite", err);
      return null;
    }
  }
}

//High-security PBKDF2 password hashing with timing-safe comparison
export function hashPassword(password: string): string {
  const salt = crypto.randomBytes(16).toString("hex");
  const iterations = 100000;
  const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
  return `${salt}:${iterations}:${hash}`;
}

export function verifyPassword(password: string, storedHash: string): boolean {
  try {
    const parts = storedHash.split(":");
    if (parts.length === 2) {
      const [salt, originalHash] = parts;
      if (!salt || !originalHash) return false;
      const hash = crypto.pbkdf2Sync(password, salt, 1000, 64, "sha512").toString("hex");
      const bufferA = Buffer.from(hash, "hex");
      const bufferB = Buffer.from(originalHash, "hex");
      if (bufferA.length !== bufferB.length) return false;
      return crypto.timingSafeEqual(bufferA, bufferB);
    } else if (parts.length === 3) {
      const [salt, iterationsStr, originalHash] = parts;
      const iterations = parseInt(iterationsStr, 10) || 100000;
      if (!salt || !originalHash) return false;
      const hash = crypto.pbkdf2Sync(password, salt, iterations, 64, "sha512").toString("hex");
      const bufferA = Buffer.from(hash, "hex");
      const bufferB = Buffer.from(originalHash, "hex");
      if (bufferA.length !== bufferB.length) return false;
      return crypto.timingSafeEqual(bufferA, bufferB);
    }
    return false;
  } catch (error) {
    return false;
  }
}

// Default candidate dataset (Official EMS candidates from published roster, excluding Primario/V. Primario/Dott.)
const DEFAULT_CANDIDATES: Candidate[] = [
  { id: "cand-01", name: "Theo Smith", roleId: RoleId.DIRETTORE_GENERALE },
  { id: "cand-02", name: "Luca Brizzante", roleId: RoleId.DIRETTORE },
  { id: "cand-03", name: "Matias Corleone", roleId: RoleId.DIRETTORE },
  { id: "cand-04", name: "Filippo Ciro", roleId: RoleId.DIRETTORE },
  { id: "cand-05", name: "Igor Lestrenge", roleId: RoleId.V_DIRETTORE },
  { id: "cand-06", name: "Ares Migliorini", roleId: RoleId.V_DIRETTORE },
  { id: "cand-07", name: "Ciccio Losavio", roleId: RoleId.SEGRETARIO_DIREZIONE },
  { id: "cand-08", name: "Dutch Esposito", roleId: RoleId.SEGRETARIO_DIREZIONE },
  { id: "cand-09", name: "Diego Trombini", roleId: RoleId.SUPERVISORE_GENERALE },
  { id: "cand-10", name: "Jonathan Giacomarra", roleId: RoleId.SUPERVISORE },
  { id: "cand-11", name: "Rocco Ali", roleId: RoleId.V_SUPERVISORE },
  { id: "cand-12", name: "Raffaele Bravi", roleId: RoleId.AIUTO_SUPERVISORE },
  { id: "cand-13", name: "Rick Maltese", roleId: RoleId.V_RESPONSABILE_PRESIDIO },
  { id: "cand-14", name: "Giangi Leanza", roleId: RoleId.V_RESPONSABILE_PRESIDIO },
];

const DEFAULT_SETTINGS: SiteSettings = {
  title: "Votazione Interna Ruoli Organizzazione",
  description: "Portale istituzionale per l'assegnazione democratica dei ruoli gerarchici interni. Esprimi la tua preferenza per ciascuna delle cariche indicate.",
  votingActive: true,
  allowMultipleSelection: true,
  requireAllRoles: false,
};

let inMemoryDb: DatabaseSchema | null = null;

// Initialize local DB state
export function initLocalDB(): DatabaseSchema {
  if (inMemoryDb) return inMemoryDb;

  if (fs.existsSync(DB_FILE)) {
    try {
      const content = fs.readFileSync(DB_FILE, "utf-8");
      const data = JSON.parse(content) as DatabaseSchema;
      if (data.settings && data.settings.requireAllRoles) {
        data.settings.requireAllRoles = false;
      }
      if (!data.emergencyPasswordHash) {
        data.emergencyPasswordHash = hashPassword("sblocco123");
      }
      if (!data.candidates || data.candidates.length === 0 || (data.candidates[0] && data.candidates[0].name.includes("Gabriele Leone"))) {
        data.candidates = DEFAULT_CANDIDATES;
      }
      inMemoryDb = data;
      return data;
    } catch (e) {
      console.error("Error reading db.json, resetting...", e);
    }
  }

  inMemoryDb = {
    settings: DEFAULT_SETTINGS,
    adminPasswordHash: hashPassword("admin123"),
    emergencyPasswordHash: hashPassword("sblocco123"),
    candidates: DEFAULT_CANDIDATES,
    votes: [],
  };

  saveLocalDB(inMemoryDb);
  return inMemoryDb;
}

export function saveLocalDB(data: DatabaseSchema): void {
  inMemoryDb = data;
  try {
    const tempFile = `${DB_FILE}.tmp`;
    fs.writeFileSync(tempFile, JSON.stringify(data, null, 2), "utf-8");
    fs.renameSync(tempFile, DB_FILE);
  } catch (e) {
    console.error("Error saving local db.json:", e);
  }
}

// Sync full dataset from Cloud Firestore or seed Firestore if empty
export async function syncFromFirestore(): Promise<DatabaseSchema> { const 
  currentLocal = initLocalDB(); if (!firestoreDb || 
  firestoreQuotaExhausted) return currentLocal;
  try {
    const settingsDocRef = doc(firestoreDb, "config", "settings");
    const adminDocRef = doc(firestoreDb, "config", "admin");

    const [settingsSnap, adminSnap, candidatesSnap, votesSnap, candidatureSnap, cdaProposalsSnap, gameScoresSnap] = await Promise.all([
      getDoc(settingsDocRef),
      getDoc(adminDocRef),
      getDocs(collection(firestoreDb, "candidates")),
      getDocs(collection(firestoreDb, "votes")),
      getDocs(collection(firestoreDb, "candidature")),
      getDocs(collection(firestoreDb, "cda_proposals")),
      getDocs(collection(firestoreDb, "game_scores")),
    ]);

    const hasData = settingsSnap.exists() || adminSnap.exists() || candidatesSnap.size > 0;

    if (hasData) {
      const settings = settingsSnap.exists() ? (settingsSnap.data() as SiteSettings) : currentLocal.settings;
      const adminPasswordHash = adminSnap.exists() && adminSnap.data()?.passwordHash
        ? adminSnap.data()?.passwordHash
        : currentLocal.adminPasswordHash;
      const emergencyPasswordHash = adminSnap.exists() && adminSnap.data()?.emergencyPasswordHash
        ? adminSnap.data()?.emergencyPasswordHash
        : (currentLocal.emergencyPasswordHash || hashPassword("sblocco123"));

      const remoteCandidates: Candidate[] = [];
      candidatesSnap.forEach((d) => {
        remoteCandidates.push({ ...(d.data() as Candidate), id: d.id });
      });

      const remoteVotes: Vote[] = [];
      votesSnap.forEach((d) => {
        remoteVotes.push({ ...(d.data() as Vote), id: d.id });
      });

      const remoteCandidature: Candidatura[] = [];
      candidatureSnap.forEach((d) => {
        remoteCandidature.push({ ...(d.data() as Candidatura), id: d.id });
      });

      const remoteCdaProposals: CdaProposal[] = [];
      cdaProposalsSnap.forEach((d) => {
        remoteCdaProposals.push({ ...(d.data() as CdaProposal), id: d.id });
      });

      const remoteGameScores: GameScore[] = [];
      gameScoresSnap.forEach((d) => {
        remoteGameScores.push({ ...(d.data() as GameScore), id: d.id });
      });

      // Preserve local candidates if remote returned empty set or dummy list
      let mergedCandidates: Candidate[] = remoteCandidates;
      if (mergedCandidates.length === 0 || (mergedCandidates[0] && mergedCandidates[0].name.includes("Gabriele Leone"))) {
        mergedCandidates = (currentLocal.candidates && currentLocal.candidates.length > 0 && !currentLocal.candidates[0].name.includes("Gabriele Leone"))
          ? currentLocal.candidates
          : DEFAULT_CANDIDATES;
        
        //Push initial real candidates to Cloud Firestore
        mergedCandidates.forEach((cand) => {
          if (firestoreDb) {
            setDoc(doc(firestoreDb, "candidates", cand.id), sanitizeForFirestore(cand)).catch((e) =>
              handleFirestoreError("seedCandidates", e)
            );
          }
        });
      }

      const mergedVotes = remoteVotes.length > 0 ? remoteVotes : (currentLocal.votes || []);
      mergedVotes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const mergedCandidature = remoteCandidature.length > 0 ? remoteCandidature : (currentLocal.candidature || []);
      mergedCandidature.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      const mergedCdaProposals = remoteCdaProposals.length > 0 ? remoteCdaProposals : (currentLocal.cdaProposals || []);
      mergedCdaProposals.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      const mergedGameScores = remoteGameScores.length > 0 ? remoteGameScores : (currentLocal.gameScores || []);
      mergedGameScores.sort((a, b) => b.score - a.score);

      inMemoryDb = {
        settings,
        adminPasswordHash,
        emergencyPasswordHash,
        candidates: mergedCandidates,
        votes: mergedVotes,
        candidature: mergedCandidature,
        cdaProposals: mergedCdaProposals,
        gameScores: mergedGameScores,
      };

      saveLocalDB(inMemoryDb);
      console.log(`Cloud Firestore synced: ${inMemoryDb.candidates.length} candidates, ${inMemoryDb.votes.length} votes, ${inMemoryDb.candidature.length} candidature, ${inMemoryDb.cdaProposals.length} proposals.`);
      return inMemoryDb;
    } else {
      console.log("Firestore empty. Migrating initial dataset to Cloud Firestore...");
      await seedFirestore(currentLocal);
      return currentLocal;
    }
  } catch (err) {
    handleFirestoreError("syncFromFirestore", err);
    return currentLocal;
  }
}

async function seedFirestore(data: DatabaseSchema) {
  if (!firestoreDb || firestoreQuotaExhausted) return;
  try {
    await setDoc(doc(firestoreDb, "config", "settings"), sanitizeForFirestore(data.settings));
    await setDoc(doc(firestoreDb, "config", "admin"), sanitizeForFirestore({
      passwordHash: data.adminPasswordHash,
      emergencyPasswordHash: data.emergencyPasswordHash || hashPassword("sblocco123"),
    }));

    const batch = writeBatch(firestoreDb);
    data.candidates.forEach((cand) => {
      batch.set(doc(firestoreDb, "candidates", cand.id), sanitizeForFirestore(cand));
    });

    data.votes.forEach((v) => {
      batch.set(doc(firestoreDb, "votes", v.id), sanitizeForFirestore(v));
    });

    if (data.candidature) {
      data.candidature.forEach((c) => {
        batch.set(doc(firestoreDb, "candidature", c.id), sanitizeForFirestore(c));
      });
    }

    await batch.commit();
    console.log("Cloud Firestore seeded successfully.");
  } catch (err) {
    handleFirestoreError("seedFirestore", err);
  }
}

export function initDB(): DatabaseSchema {
  return initLocalDB();
}

//Database helper operations with immediate local cache update + async Cloud Firestore persistence

export function getSettings(): SiteSettings {
  const db = initDB();
  return db.settings;
}

export async function updateSettings(newSettings: Partial<SiteSettings>): Promise<SiteSettings> {
  const db = initDB();
  db.settings = { ...db.settings, ...newSettings };
  saveLocalDB(db);

  if (firestoreDb && !firestoreQuotaExhausted) {
    try {
      await setDoc(doc(firestoreDb, "config", "settings"), sanitizeForFirestore(db.settings));
    } catch (e) {
      handleFirestoreError("updateSettings", e);
    }
  }
  return db.settings;
}

export function verifyAdminPassword(password: string): boolean {
  const db = initDB();
  return verifyPassword(password, db.adminPasswordHash);
}

export async function updateAdminPassword(newPassword: string): Promise<void> {
  const db = initDB();
  db.adminPasswordHash = hashPassword(newPassword);
  saveLocalDB(db);

  if (firestoreDb && !firestoreQuotaExhausted) {
    try {
      await setDoc(doc(firestoreDb, "config", "admin"), sanitizeForFirestore({
        passwordHash: db.adminPasswordHash,
        emergencyPasswordHash: db.emergencyPasswordHash || hashPassword("sblocco123"),
      }));
    } catch (e) {
      handleFirestoreError("updateAdminPassword", e);
    }
  }
}

export function verifyEmergencyPassword(password: string): boolean {
  const db = initDB();
  const hash = db.emergencyPasswordHash || hashPassword("sblocco123");
  return verifyPassword(password, hash);
}

export async function updateEmergencyPassword(newPassword: string): Promise<void> {
  const db = initDB();
  db.emergencyPasswordHash = hashPassword(newPassword);
  saveLocalDB(db);

  if (firestoreDb && !firestoreQuotaExhausted) {
    try {
      await setDoc(doc(firestoreDb, "config", "admin"), sanitizeForFirestore({
        passwordHash: db.adminPasswordHash,
        emergencyPasswordHash: db.emergencyPasswordHash,
      }));
    } catch (e) {
      handleFirestoreError("updateEmergencyPassword", e);
    }
  }
}

export function getCandidates(): Candidate[] {
  const db = initDB();
  return db.candidates;
}

export function addCandidate(roleId: RoleId, name: string): Candidate {
  const db = initDB();
  const newCandidate: Candidate = {
    id: crypto.randomBytes(8).toString("hex"),
    name: name.trim(),
    roleId,
  };
  db.candidates.push(newCandidate);
  saveLocalDB(db);

  if (firestoreDb && !firestoreQuotaExhausted) {
    setDoc(doc(firestoreDb, "candidates", newCandidate.id), newCandidate).catch((e) =>
      handleFirestoreError("addCandidate", e)
    );
  }
  return newCandidate;
}

export function removeCandidate(id: string): boolean {
  const db = initDB();
  if (!db.candidates) db.candidates = [];

  const cleanId = (id || "").trim();
  const matchingIndices: number[] = [];
  db.candidates.forEach((c, idx) => {
    if (
      c.id === cleanId ||
      String(c.id).trim().toLowerCase() === cleanId.toLowerCase() ||
      encodeURIComponent(c.id) === cleanId
    ) {
      matchingIndices.push(idx);
    }
  });

  let targetId = cleanId;
  if (matchingIndices.length > 0) {
    targetId = db.candidates[matchingIndices[0]].id;
    for (let i = matchingIndices.length - 1; i >= 0; i--) {
      db.candidates.splice(matchingIndices[i], 1);
    }
    saveLocalDB(db);
  }

  if (firestoreDb && !firestoreQuotaExhausted) {
    const idsToDelete = new Set<string>();
    if (targetId) idsToDelete.add(targetId);
    if (cleanId) {
      idsToDelete.add(cleanId);
      idsToDelete.add(encodeURIComponent(cleanId));
      try {
        idsToDelete.add(decodeURIComponent(cleanId));
      } catch (_e) {}
    }
    idsToDelete.forEach((dId) => {
      deleteDoc(doc(firestoreDb, "candidates", dId)).catch((e) =>
        handleFirestoreError("removeCandidate", e)
      );
    });

    getDocs(collection(firestoreDb, "candidates"))
      .then((snap) => {
        snap.forEach((d) => {
          const docData = d.data() as Candidate;
          if (
            d.id === cleanId ||
            d.id === targetId ||
            docData.id === cleanId ||
            docData.id === targetId ||
            String(d.id).trim().toLowerCase() === cleanId.toLowerCase() ||
            (docData.id && String(docData.id).trim().toLowerCase() === cleanId.toLowerCase())
          ) {
            deleteDoc(doc(firestoreDb, "candidates", d.id)).catch((e) =>
              handleFirestoreError("removeCandidate scan", e)
            );
          }
        });
      })
      .catch((e) => handleFirestoreError("removeCandidate scan getDocs", e));
  }

  return true;
}

export function getVotes(): Vote[] {
  const db = initDB();
  return db.votes;
}

export function addVote(voterFullName: string, selections: Record<RoleId, string[]>): Vote {
  const db = initDB();
  const newVote: Vote = {
    id: crypto.randomBytes(12).toString("hex"),
    voterFullName: voterFullName.trim(),
    timestamp: new Date().toISOString(),
    selections,
  };
  db.votes.push(newVote);
  saveLocalDB(db);

  if (firestoreDb && !firestoreQuotaExhausted) {
    setDoc(doc(firestoreDb, "votes", newVote.id), newVote).catch((e) =>
      handleFirestoreError("addVote", e)
    );
  }
  return newVote;
}

export function clearAllVotes(): void {
  const db = initDB();
  const previousVoteIds = db.votes.map((v) => v.id);
  db.votes = [];
  saveLocalDB(db);

  if (firestoreDb && !firestoreQuotaExhausted) {
    const batch = writeBatch(firestoreDb);
    previousVoteIds.forEach((id) => {
      batch.delete(doc(firestoreDb, "votes", id));
    });
    batch.commit().catch((e) => handleFirestoreError("clearAllVotes", e));
  }
}

export function removeVote(id: string): boolean {
  const db = initDB();
  const index = db.votes.findIndex((v) => v.id === id);
  if (index !== -1) {
    db.votes.splice(index, 1);
    saveLocalDB(db);

    if (firestoreDb && !firestoreQuotaExhausted) {
      deleteDoc(doc(firestoreDb, "votes", id)).catch((e) =>
        handleFirestoreError("removeVote", e)
      );
    }
    return true;
  }
  return false;
}

export function updateCandidatesBulk(names: string[]): Candidate[] {
  const db = initDB();
  const trimmedNames = names.map((n) => n.trim()).filter((n) => n.length > 0);
  const uniqueNames = Array.from(new Set(trimmedNames));

  const updatedCandidates: Candidate[] = [];

  uniqueNames.forEach((name) => {
    const existing = db.candidates.find((c) => c.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      updatedCandidates.push({
        ...existing,
        name,
      });
    } else {
      updatedCandidates.push({
        id: crypto.randomBytes(8).toString("hex"),
        name,
        roleId: RoleId.V_PRIMARIO,
      });
    }
  });

  const oldCandidates = [...db.candidates];
  db.candidates = updatedCandidates;
  saveLocalDB(db);

  if (firestoreDb && !firestoreQuotaExhausted) {
    const batch = writeBatch(firestoreDb);
    oldCandidates.forEach((oldC) => {
      if (!updatedCandidates.some((c) => c.id === oldC.id)) {
        batch.delete(doc(firestoreDb, "candidates", oldC.id));
      }
    });

    updatedCandidates.forEach((c) => {
      batch.set(doc(firestoreDb, "candidates", c.id), sanitizeForFirestore(c));
    });

    batch.commit().catch((e) => handleFirestoreError("updateCandidatesBulk", e));
  }

  return db.candidates;
}

export function updateCandidate(id: string, name: string, roleId: RoleId): Candidate | null {
  const db = initDB();
  const index = db.candidates.findIndex((c) => c.id === id);
  if (index !== -1) {
    const oldName = db.candidates[index].name;
    const newName = name.trim();

    db.candidates[index] = {
      ...db.candidates[index],
      name: newName,
      roleId,
    };

    if (oldName !== newName) {
      db.votes.forEach((vote) => {
        if (vote.selections) {
          Object.keys(vote.selections).forEach((roleKey) => {
            const roleSel = vote.selections[roleKey as RoleId];
            if (Array.isArray(roleSel)) {
              vote.selections[roleKey as RoleId] = roleSel.map((candName) =>
                candName === oldName ? newName : candName
              );
            }
          });
        }
      });
      if (firestoreDb && !firestoreQuotaExhausted) {
        db.votes.forEach((vote) => {
          setDoc(doc(firestoreDb, "votes", vote.id), sanitizeForFirestore(vote)).catch((e) =>
            handleFirestoreError("updateVote error during candidate rename", e)
          );
        });
      }
    }

    saveLocalDB(db);

    if (firestoreDb && !firestoreQuotaExhausted) {
      setDoc(doc(firestoreDb, "candidates", id), sanitizeForFirestore(db.candidates[index])).catch((e) =>
        handleFirestoreError("updateCandidate", e)
      );
    }
    return db.candidates[index];
  }
  return null;
}

// Firestore tokens and access logs sync helpers
export async function syncTokensAndLogsFirestore(): Promise<{ tokens: any[]; logs: any[] }> {
  if (!firestoreDb || firestoreQuotaExhausted) return { tokens: [], logs: [] };
  try {
    const [tokensSnap, logsSnap] = await Promise.all([
      getDocs(collection(firestoreDb, "employee_tokens")),
      getDocs(collection(firestoreDb, "access_logs")),
    ]);

    const tokens: any[] = [];
    tokensSnap.forEach((d) => tokens.push(d.data()));

    const logs: any[] = [];
    logsSnap.forEach((d) => logs.push(d.data()));

    logs.sort((a, b) => new Date(b.timestamp).getTime() - new Date(a.timestamp).getTime());

    return { tokens, logs };
  } catch (err) {
    handleFirestoreError("syncTokensAndLogs", err);
    return { tokens: [], logs: [] };
  }
}

export async function saveTokenFirestore(tokenDoc: any): Promise<void> {
  if (!firestoreDb || firestoreQuotaExhausted || !tokenDoc || !tokenDoc.token) return;
  try {
    await setDoc(doc(firestoreDb, "employee_tokens", tokenDoc.token.toUpperCase()), sanitizeForFirestore(tokenDoc));
  } catch (e) {
    handleFirestoreError("saveToken", e);
  }
}

export async function deleteTokenFirestore(tokenStr: string, username?: string, candidateId?: string): Promise<void> {
  if (!firestoreDb || firestoreQuotaExhausted || !tokenStr) return;
  try {
    const upper = tokenStr.toUpperCase();
    await deleteDoc(doc(firestoreDb, "employee_tokens", upper));
    if (tokenStr !== upper) {
      await deleteDoc(doc(firestoreDb, "employee_tokens", tokenStr));
    }
    // Also batch scan to ensure no duplicates or lowercase docs linger in Firestore
    const snap = await getDocs(collection(firestoreDb, "employee_tokens"));
    const batch = writeBatch(firestoreDb);
    let count = 0;
    snap.forEach((d) => {
      const data = d.data();
      const docTokenUpper = (data?.token || d.id || "").toUpperCase();
      const docUserLower = (data?.username || "").trim().toLowerCase();
      const docCandId = data?.candidateId;
      if (
        d.id.toUpperCase() === upper ||
        docTokenUpper === upper ||
        (username && docUserLower && docUserLower === username.trim().toLowerCase()) ||
        (candidateId && docCandId && docCandId === candidateId)
      ) {
        batch.delete(d.ref);
        count++;
      }
    });
    if (count > 0) {
      await batch.commit();
    }
  } catch (e) {
    handleFirestoreError("deleteToken", e);
  }
}

export async function syncRevokedTokensFirestore(): Promise<any[]> {
  if (!firestoreDb || firestoreQuotaExhausted) return [];
  try {
    const snap = await getDocs(collection(firestoreDb, "revoked_tokens"));
    const list: any[] = [];
    snap.forEach((d) => list.push(d.data()));
    return list;
  } catch (err) {
    handleFirestoreError("syncRevokedTokens", err);
    return [];
  }
}

export async function saveRevokedTokenFirestore(revokedDoc: any): Promise<void> {
  if (!firestoreDb || firestoreQuotaExhausted || !revokedDoc || !revokedDoc.token) return;
  try {
    await setDoc(doc(firestoreDb, "revoked_tokens", revokedDoc.token.toUpperCase()), sanitizeForFirestore(revokedDoc));
  } catch (e) {
    handleFirestoreError("saveRevokedToken", e);
  }
}

export async function deleteRevokedTokenFirestore(tokenStr: string): Promise<void> {
  if (!firestoreDb || firestoreQuotaExhausted || !tokenStr) return;
  try {
    await deleteDoc(doc(firestoreDb, "revoked_tokens", tokenStr.toUpperCase()));
  } catch (e) {
    handleFirestoreError("deleteRevokedToken", e);
  }
}

export async function syncPurgedTokensFirestore(): Promise<string[]> {
  if (!firestoreDb || firestoreQuotaExhausted) return [];
  try {
    const snap = await getDocs(collection(firestoreDb, "purged_tokens"));
    const list: string[] = [];
    snap.forEach((d) => {
      const data = d.data();
      const token = data?.token || d.id;
      if (token) list.push(token.toUpperCase());
    });
    return list;
  } catch (err) {
    handleFirestoreError("syncPurgedTokens", err);
    return [];
  }
}

export async function savePurgedTokenFirestore(tokenStr: string): Promise<void> {
  if (!firestoreDb || firestoreQuotaExhausted || !tokenStr) return;
  try {
    await setDoc(doc(firestoreDb, "purged_tokens", tokenStr.toUpperCase()), sanitizeForFirestore({ token: tokenStr.toUpperCase(), purgedAt: new Date().toISOString() }));
  } catch (e) {
    handleFirestoreError("savePurgedToken", e);
  }
}

export async function deletePurgedTokenFirestore(tokenStr: string): Promise<void> {
  if (!firestoreDb || firestoreQuotaExhausted || !tokenStr) return;
  try {
    await deleteDoc(doc(firestoreDb, "purged_tokens", tokenStr.toUpperCase()));
  } catch (e) {
    handleFirestoreError("deletePurgedToken", e);
  }
}

export async function syncActiveSessionsFirestore(): Promise<any[]> {
  if (!firestoreDb || firestoreQuotaExhausted) return [];
  try {
    const snap = await getDocs(collection(firestoreDb, "active_sessions"));
    const list: any[] = [];
    snap.forEach((d) => list.push(d.data()));
    return list;
  } catch (err) {
    handleFirestoreError("syncActiveSessions", err);
    return [];
  }
}

export function saveActiveSessionFirestore(tokenStr: string, sessionDoc: any): void {
  if (!firestoreDb || firestoreQuotaExhausted || !tokenStr) return;
  setDoc(doc(firestoreDb, "active_sessions", tokenStr), sanitizeForFirestore({ token: tokenStr, ...sessionDoc })).catch((e) =>
    handleFirestoreError("saveActiveSession", e)
  );
}

export function deleteActiveSessionFirestore(tokenStr: string): void {
  if (!firestoreDb || firestoreQuotaExhausted || !tokenStr) return;
  deleteDoc(doc(firestoreDb, "active_sessions", tokenStr)).catch((e) =>
    handleFirestoreError("deleteActiveSession", e)
  );
}

export function saveAccessLogFirestore(logDoc: any): void {
  if (!firestoreDb || firestoreQuotaExhausted || !logDoc || !logDoc.id) return;
  setDoc(doc(firestoreDb, "access_logs", logDoc.id), sanitizeForFirestore(logDoc)).catch((e) =>
    handleFirestoreError("saveAccessLog", e)
  );
}

export function clearAccessLogsFirestore(): void {
  if (!firestoreDb || firestoreQuotaExhausted) return;
  getDocs(collection(firestoreDb, "access_logs"))
    .then((snap) => {
      const batch = writeBatch(firestoreDb);
      snap.forEach((d) => batch.delete(d.ref));
      return batch.commit();
    })
    .catch((e) => handleFirestoreError("clearAccessLogs", e));
}

// Firestore hierarchy members sync helpers
export async function syncHierarchyMembersFirestore(): Promise<any[]> {
  if (!firestoreDb || firestoreQuotaExhausted) return [];
  try {
    const snap = await getDocs(collection(firestoreDb, "hierarchy_members"));
    const members: any[] = [];
    snap.forEach((d) => members.push({ ...d.data(), id: d.id }));
    return members;
  } catch (err) {
    handleFirestoreError("syncHierarchyMembers", err);
    return [];
  }
}

export function saveHierarchyMemberFirestore(memberDoc: any): void {
  if (!firestoreDb || firestoreQuotaExhausted || !memberDoc || !memberDoc.id) return;
  const cleanDoc = JSON.parse(JSON.stringify(memberDoc));
  setDoc(doc(firestoreDb, "hierarchy_members", memberDoc.id), cleanDoc).catch((e) =>
    handleFirestoreError("saveHierarchyMember", e)
  );
}

export function deleteHierarchyMemberFirestore(id: string): void {
  if (!firestoreDb || firestoreQuotaExhausted || !id) return;
  deleteDoc(doc(firestoreDb, "hierarchy_members", id)).catch((e) =>
    handleFirestoreError("deleteHierarchyMember", e)
  );
}

export async function saveAllHierarchyMembersFirestore(members: any[]): Promise<void> {
  if (!firestoreDb || firestoreQuotaExhausted) return;
  try {
    const existingSnap = await getDocs(collection(firestoreDb, "hierarchy_members"));
    const batch = writeBatch(firestoreDb);
    existingSnap.forEach((d) => batch.delete(d.ref));
    members.forEach((m) => {
      if (m.id) {
        const cleanM = JSON.parse(JSON.stringify(m));
        batch.set(doc(firestoreDb, "hierarchy_members", m.id), cleanM);
      }
    });
    await batch.commit();
  } catch (err) {
    handleFirestoreError("saveAllHierarchyMembers", err);
  }
}

// --- CANDIDATURE DB OPERATIONS ---

export function getCandidature(): Candidatura[] {
  const db = initDB();
  if (!db.candidature) {
    db.candidature = [];
  }
  return db.candidature;
}

export function addCandidatura(data: Omit<Candidatura, "id" | "status" | "submittedAt">): Candidatura {
  const db = initDB();
  if (!db.candidature) {
    db.candidature = [];
  }

  const newCand: Candidatura = {
    ...data,
    id: "CAND-" + Date.now() + "-" + crypto.randomBytes(2).toString("hex").toUpperCase(),
    status: "PENDING",
    submittedAt: new Date().toISOString(),
  };

  db.candidature.unshift(newCand);
  saveLocalDB(db);

  if (firestoreDb && !firestoreQuotaExhausted) {
    setDoc(doc(firestoreDb, "candidature", newCand.id), sanitizeForFirestore(newCand)).catch((e) =>
      handleFirestoreError("addCandidatura", e)
    );
  }

  return newCand;
}

export function updateCandidaturaStatus(
  id: string,
  status: CandidaturaStatus,
  reviewedBy: string,
  rejectionReason?: string
): Candidatura | null {
  const db = initDB();
  if (!db.candidature) db.candidature = [];

  const cleanId = (id || "").trim();
  const index = db.candidature.findIndex(
    (c) => c.id === cleanId || String(c.id).trim().toLowerCase() === cleanId.toLowerCase()
  );
  if (index !== -1) {
    const updated: Candidatura = {
      ...db.candidature[index],
      status,
      reviewedBy,
      reviewedAt: new Date().toISOString(),
    };

    if (status === "REJECTED" && rejectionReason !== undefined) {
      updated.rejectionReason = rejectionReason;
    } else if (status === "APPROVED") {
      delete updated.rejectionReason;
    }

    db.candidature[index] = updated;
    saveLocalDB(db);

    if (firestoreDb && !firestoreQuotaExhausted) {
      setDoc(doc(firestoreDb, "candidature", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        handleFirestoreError("updateCandidaturaStatus", e)
      );
    }

    return updated;
  }
  return null;
}

export function cancelCandidatura(id: string, reason: string): Candidatura | null {
  const db = initDB();
  if (!db.candidature) db.candidature = [];

  const cleanId = (id || "").trim();
  const index = db.candidature.findIndex(
    (c) => c.id === cleanId || String(c.id).trim().toLowerCase() === cleanId.toLowerCase()
  );
  if (index !== -1) {
    const updated: Candidatura = {
      ...db.candidature[index],
      status: "CANCELLED",
      cancellationReason: reason,
      cancelledAt: new Date().toISOString(),
    };

    db.candidature[index] = updated;
    saveLocalDB(db);

    if (firestoreDb && !firestoreQuotaExhausted) {
      setDoc(doc(firestoreDb, "candidature", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        handleFirestoreError("cancelCandidatura", e)
      );
    }

    return updated;
  }
  return null;
}

export function deleteCandidatura(id: string): boolean {
  const db = initDB();
  if (!db.candidature) db.candidature = [];

  const cleanId = (id || "").trim();
  const matchingIndices: number[] = [];
  db.candidature.forEach((c, idx) => {
    if (
      c.id === cleanId ||
      String(c.id).trim().toLowerCase() === cleanId.toLowerCase() ||
      encodeURIComponent(c.id) === cleanId
    ) {
      matchingIndices.push(idx);
    }
  });

  let targetId = cleanId;
  if (matchingIndices.length > 0) {
    targetId = db.candidature[matchingIndices[0]].id;
    for (let i = matchingIndices.length - 1; i >= 0; i--) {
      db.candidature.splice(matchingIndices[i], 1);
    }
    saveLocalDB(db);
  }

  if (firestoreDb && !firestoreQuotaExhausted) {
    const idsToDelete = new Set<string>();
    if (targetId) idsToDelete.add(targetId);
    if (cleanId) {
      idsToDelete.add(cleanId);
      idsToDelete.add(encodeURIComponent(cleanId));
      try {
        idsToDelete.add(decodeURIComponent(cleanId));
      } catch (_e) {}
    }
    idsToDelete.forEach((dId) => {
      deleteDoc(doc(firestoreDb, "candidature", dId)).catch((e) =>
        handleFirestoreError("deleteCandidatura", e)
      );
    });

    getDocs(collection(firestoreDb, "candidature"))
      .then((snap) => {
        snap.forEach((d) => {
          const docData = d.data() as Candidatura;
          if (
            d.id === cleanId ||
            d.id === targetId ||
            docData.id === cleanId ||
            docData.id === targetId ||
            String(d.id).trim().toLowerCase() === cleanId.toLowerCase() ||
            (docData.id && String(docData.id).trim().toLowerCase() === cleanId.toLowerCase())
          ) {
            deleteDoc(doc(firestoreDb, "candidature", d.id)).catch((e) =>
              handleFirestoreError("deleteCandidatura scan", e)
            );
          }
        });
      })
      .catch((e) => handleFirestoreError("deleteCandidatura scan getDocs", e));
  }

  return true;
}

// --- CDA SPECIFIC DB OPERATIONS ---

export function updateCandidaturaCda(
  id: string,
  cdaData: CdaData,
  statusOverride?: CandidaturaStatus,
  reviewedBy?: string,
  rejectionReason?: string
): Candidatura | null {
  const db = initDB();
  if (!db.candidature) db.candidature = [];

  const cleanId = (id || "").trim();
  const index = db.candidature.findIndex(
    (c) => c.id === cleanId || String(c.id).trim().toLowerCase() === cleanId.toLowerCase()
  );

  if (index !== -1) {
    const existing = db.candidature[index];
    const updated: Candidatura = {
      ...existing,
      cdaData: {
        ...(existing.cdaData || {}),
        ...cdaData,
      },
    };

    if (statusOverride) {
      updated.status = statusOverride;
    }
    if (reviewedBy) {
      updated.reviewedBy = reviewedBy;
      updated.reviewedAt = new Date().toISOString();
    }
    if (rejectionReason !== undefined) {
      updated.rejectionReason = rejectionReason;
    }

    db.candidature[index] = updated;
    saveLocalDB(db);

    if (firestoreDb && !firestoreQuotaExhausted) {
      setDoc(doc(firestoreDb, "candidature", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        handleFirestoreError("updateCandidaturaCda", e)
      );
    }

    return updated;
  }
  return null;
}

export function resetCandidaturaToVoting(id: string, actorName: string): Candidatura | null {
  const db = initDB();
  if (!db.candidature) db.candidature = [];

  const cleanId = (id || "").trim();
  const index = db.candidature.findIndex(
    (c) => c.id === cleanId || String(c.id).trim().toLowerCase() === cleanId.toLowerCase()
  );

  if (index !== -1) {
    const existing = db.candidature[index];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const updated: Candidatura = {
      ...existing,
      status: "PENDING",
      cdaData: {
        status: "IN_VOTING",
        votingStartedAt: now.toISOString(),
        expiresAt: expiresAt,
        votes: {},
        cdaActionReason: `Votazione riaperta/risettata dall'Amministratore (${actorName}). Annullata la decisione precedente.`,
        cdaActionBy: actorName,
        cdaActionAt: now.toISOString(),
      },
    };

    delete updated.rejectionReason;
    delete updated.reviewedBy;
    delete updated.reviewedAt;

    db.candidature[index] = updated;
    saveLocalDB(db);

    if (firestoreDb && !firestoreQuotaExhausted) {
      setDoc(doc(firestoreDb, "candidature", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        handleFirestoreError("resetCandidaturaToVoting", e)
      );
    }

    return updated;
  }
  return null;
}

export function processExpiredCdaTimers(
  logCallback?: (cand: Candidatura, outcome: "APPROVED" | "REJECTED" | "TIE", summary: string) => void
): Candidatura[] {
  const db = initDB();
  if (!db.candidature) return [];

  const now = new Date();
  const updatedList: Candidatura[] = [];

  db.candidature.forEach((cand, idx) => {
    if (cand.cdaData && cand.cdaData.status === "IN_VOTING" && cand.cdaData.expiresAt) {
      const expiresAtDate = new Date(cand.cdaData.expiresAt);
      if (now.getTime() >= expiresAtDate.getTime()) {
        // Timer has expired!
        const votesObj = cand.cdaData.votes || {};
        const votesArr = Object.values(votesObj);

        let fav = 0;
        let con = 0;
        let ast = 0;

        votesArr.forEach((v) => {
          if (v.decision === "FAVOREVOLE") fav++;
          else if (v.decision === "CONTRARIO") con++;
          else if (v.decision === "ASTENUTO") ast++;
        });

        let outcome: "APPROVED" | "REJECTED" | "TIE";
        let newStatus: CandidaturaStatus = cand.status;
        let newCdaStatus: CdaStatus = cand.cdaData.status;
        let summary = "";

        if (fav > con) {
          outcome = "APPROVED";
          newStatus = "APPROVED";
          newCdaStatus = "APPROVED";
          summary = `Approvata automaticamente per maggioranza favorevole alla scadenza del timer 24h (${fav} favorevoli, ${con} contrari, ${ast} astenuti).`;
        } else if (con > fav) {
          outcome = "REJECTED";
          newStatus = "REJECTED";
          newCdaStatus = "REJECTED";
          summary = `Rifiutata automaticamente per maggioranza contraria alla scadenza del timer 24h (${fav} favorevoli, ${con} contrari, ${ast} astenuti).`;
        } else {
          // Tie (parità)
          outcome = "TIE";
          newStatus = "PENDING";
          newCdaStatus = "TIE_PENDING";
          summary = `Risultato in Parità (${fav} favorevoli vs ${con} contrari). In attesa di decisione definitiva da parte del Vice Presidente CDA o grado superiore.`;
        }

        const updatedCand: Candidatura = {
          ...cand,
          status: newStatus,
          cdaData: {
            ...cand.cdaData,
            status: newCdaStatus,
            cdaActionReason: summary,
            cdaActionBy: "Sistema CDA (Timer 24h)",
            cdaActionRole: "Sistema Automatico",
            cdaActionAt: now.toISOString(),
          },
          reviewedBy: "Sistema CDA (Timer 24h)",
          reviewedAt: now.toISOString(),
        };

        if (outcome === "REJECTED") {
          updatedCand.rejectionReason = summary;
        }

        db.candidature[idx] = updatedCand;
        updatedList.push(updatedCand);

        if (firestoreDb && !firestoreQuotaExhausted) {
          setDoc(doc(firestoreDb, "candidature", updatedCand.id), sanitizeForFirestore(updatedCand)).catch((e) =>
            handleFirestoreError("processExpiredCdaTimers", e)
          );
        }

        if (logCallback) {
          logCallback(updatedCand, outcome, summary);
        }
      }
    }
  });

  if (updatedList.length > 0) {
    saveLocalDB(db);
  }

  return updatedList;
}

// CDA PROPOSALS HELPERS
export function getCdaProposals(): CdaProposal[] {
  const db = initDB();
  return db.cdaProposals || [];
}

export function addCdaProposal(prop: CdaProposal): CdaProposal {
  const db = initDB();
  if (!db.cdaProposals) db.cdaProposals = [];

  db.cdaProposals.unshift(prop);
  saveLocalDB(db);

  if (firestoreDb && !firestoreQuotaExhausted) {
    setDoc(doc(firestoreDb, "cda_proposals", prop.id), sanitizeForFirestore(prop)).catch((e) =>
      handleFirestoreError("addCdaProposal", e)
    );
  }

  return prop;
}

export function updateCdaProposalCda(
  id: string,
  cdaData: Partial<CdaData>,
  statusOverride?: CandidaturaStatus,
  reviewedBy?: string,
  rejectionReason?: string,
  proposalPatch?: Partial<CdaProposal>
): CdaProposal | null {
  const db = initDB();
  if (!db.cdaProposals) db.cdaProposals = [];

  const cleanId = (id || "").trim();
  const index = db.cdaProposals.findIndex(
    (p) => p.id === cleanId || String(p.id).trim().toLowerCase() === cleanId.toLowerCase()
  );

  if (index !== -1) {
    const existing = db.cdaProposals[index];
    const updated: CdaProposal = {
      ...existing,
      ...(proposalPatch || {}),
      cdaData: {
        ...(existing.cdaData || {}),
        ...cdaData,
      },
    };

    if (statusOverride) {
      updated.status = statusOverride;
    }
    if (reviewedBy) {
      updated.reviewedBy = reviewedBy;
      updated.reviewedAt = new Date().toISOString();
    }
    if (rejectionReason !== undefined) {
      updated.rejectionReason = rejectionReason;
    }

    db.cdaProposals[index] = updated;
    saveLocalDB(db);

    if (firestoreDb && !firestoreQuotaExhausted) {
      setDoc(doc(firestoreDb, "cda_proposals", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        handleFirestoreError("updateCdaProposalCda", e)
      );
    }

    return updated;
  }
  return null;
}

export function deleteCdaProposal(id: string): boolean {
  const db = initDB();
  if (!db.cdaProposals) db.cdaProposals = [];

  const cleanId = (id || "").trim();
  const matchingIndices: number[] = [];
  db.cdaProposals.forEach((p, idx) => {
    if (
      p.id === cleanId ||
      String(p.id).trim().toLowerCase() === cleanId.toLowerCase() ||
      encodeURIComponent(p.id) === cleanId
    ) {
      matchingIndices.push(idx);
    }
  });

  let targetId = cleanId;
  if (matchingIndices.length > 0) {
    targetId = db.cdaProposals[matchingIndices[0]].id;
    for (let i = matchingIndices.length - 1; i >= 0; i--) {
      db.cdaProposals.splice(matchingIndices[i], 1);
    }
    saveLocalDB(db);
  }

  if (firestoreDb && !firestoreQuotaExhausted) {
    const idsToDelete = new Set<string>();
    if (targetId) idsToDelete.add(targetId);
    if (cleanId) {
      idsToDelete.add(cleanId);
      idsToDelete.add(encodeURIComponent(cleanId));
      try {
        idsToDelete.add(decodeURIComponent(cleanId));
      } catch (_e) {}
    }
    idsToDelete.forEach((dId) => {
      deleteDoc(doc(firestoreDb, "cda_proposals", dId)).catch((e) =>
        handleFirestoreError("deleteCdaProposal", e)
      );
    });

    getDocs(collection(firestoreDb, "cda_proposals"))
      .then((snap) => {
        snap.forEach((d) => {
          const docData = d.data() as CdaProposal;
          if (
            d.id === cleanId ||
            d.id === targetId ||
            docData.id === cleanId ||
            docData.id === targetId ||
            String(d.id).trim().toLowerCase() === cleanId.toLowerCase() ||
            (docData.id && String(docData.id).trim().toLowerCase() === cleanId.toLowerCase())
          ) {
            deleteDoc(doc(firestoreDb, "cda_proposals", d.id)).catch((e) =>
              handleFirestoreError("deleteCdaProposal scan", e)
            );
          }
        });
      })
      .catch((e) => handleFirestoreError("deleteCdaProposal scan getDocs", e));
  }

  return true;
}

export function cancelCdaProposal(id: string, reason?: string, cancelledBy?: string): CdaProposal | null {
  const db = initDB();
  if (!db.cdaProposals) db.cdaProposals = [];

  const cleanId = (id || "").trim();
  const index = db.cdaProposals.findIndex(
    (p) => p.id === cleanId || String(p.id).trim().toLowerCase() === cleanId.toLowerCase()
  );

  if (index !== -1) {
    const existing = db.cdaProposals[index];
    const updated: CdaProposal = {
      ...existing,
      status: "CANCELLED",
      cancellationReason: reason || undefined,
      cancelledAt: new Date().toISOString(),
      cancelledBy: cancelledBy || undefined,
      cdaData: {
        ...(existing.cdaData || {}),
        status: "REJECTED",
        cdaActionReason: reason ? `Proposta ritirata: ${reason}` : "Proposta ritirata",
        cdaActionBy: cancelledBy || "Proponente",
        cdaActionAt: new Date().toISOString(),
      },
    };

    db.cdaProposals[index] = updated;
    saveLocalDB(db);

    if (firestoreDb && !firestoreQuotaExhausted) {
      setDoc(doc(firestoreDb, "cda_proposals", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        handleFirestoreError("cancelCdaProposal", e)
      );
    }

    return updated;
  }
  return null;
}

export function resetCdaProposalToPreEvaluation(id: string, actorName: string): CdaProposal | null {
  const db = initDB();
  if (!db.cdaProposals) db.cdaProposals = [];

  const cleanId = (id || "").trim();
  const index = db.cdaProposals.findIndex(
    (p) => p.id === cleanId || String(p.id).trim().toLowerCase() === cleanId.toLowerCase()
  );

  if (index !== -1) {
    const existing = db.cdaProposals[index];
    const now = new Date();

    const updated: CdaProposal = {
      ...existing,
      status: "PENDING",
      cdaData: {
        status: "PENDING_RENDER",
        cdaActionReason: `Proposta rimessa in Pre-Valutazione dall'Amministratore (${actorName}). Votazione annullata.`,
        cdaActionBy: actorName,
        cdaActionAt: now.toISOString(),
      },
    };

    delete updated.rejectionReason;
    delete updated.reviewedBy;
    delete updated.reviewedAt;

    db.cdaProposals[index] = updated;
    saveLocalDB(db);

    if (firestoreDb && !firestoreQuotaExhausted) {
      setDoc(doc(firestoreDb, "cda_proposals", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        handleFirestoreError("resetCdaProposalToPreEvaluation", e)
      );
    }

    return updated;
  }
  return null;
}

export function resetCdaProposalToVoting(id: string, actorName: string): CdaProposal | null {
  const db = initDB();
  if (!db.cdaProposals) db.cdaProposals = [];

  const cleanId = (id || "").trim();
  const index = db.cdaProposals.findIndex(
    (p) => p.id === cleanId || String(p.id).trim().toLowerCase() === cleanId.toLowerCase()
  );

  if (index !== -1) {
    const existing = db.cdaProposals[index];
    const now = new Date();
    const expiresAt = new Date(now.getTime() + 24 * 60 * 60 * 1000).toISOString();

    const updated: CdaProposal = {
      ...existing,
      status: "PENDING",
      cdaData: {
        status: "IN_VOTING",
        votingStartedAt: now.toISOString(),
        expiresAt: expiresAt,
        votes: {},
        cdaActionReason: `Votazione riaperta/risettata dall'Amministratore (${actorName}). Annullata la decisione precedente.`,
        cdaActionBy: actorName,
        cdaActionAt: now.toISOString(),
      },
    };

    delete updated.rejectionReason;
    delete updated.reviewedBy;
    delete updated.reviewedAt;

    db.cdaProposals[index] = updated;
    saveLocalDB(db);

    if (firestoreDb && !firestoreQuotaExhausted) {
      setDoc(doc(firestoreDb, "cda_proposals", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        handleFirestoreError("resetCdaProposalToVoting", e)
      );
    }

    return updated;
  }
  return null;
}

export function processExpiredCdaProposalTimers(
  logCallback?: (prop: CdaProposal, outcome: "APPROVED" | "REJECTED" | "TIE", summary: string) => void
): CdaProposal[] {
  const db = initDB();
  if (!db.cdaProposals) return [];

  const now = new Date();
  const updatedList: CdaProposal[] = [];

  db.cdaProposals.forEach((prop, idx) => {
    if (prop.cdaData && prop.cdaData.status === "IN_VOTING" && prop.cdaData.expiresAt) {
      const expiresAtDate = new Date(prop.cdaData.expiresAt);
      if (now.getTime() >= expiresAtDate.getTime()) {
        const votesObj = prop.cdaData.votes || {};
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

        let outcome: "APPROVED" | "REJECTED" | "TIE";
        let newStatus: CdaProposalStatus = prop.status;
        let newCdaStatus: CdaStatus = prop.cdaData.status;
        let summary = "";
        let winningRole: string | undefined = undefined;

        if (fav > con) {
          outcome = "APPROVED";
          newStatus = "APPROVED";
          newCdaStatus = "APPROVED";

          if (prop.type === "REINTEGRO") {
            let maxVotes = -1;
            Object.entries(roleCounts).forEach(([r, count]) => {
              if (count > maxVotes) {
                maxVotes = count;
                winningRole = r;
              }
            });
            if (!winningRole) {
              winningRole = prop.targetProposedRole || (prop.reinstatementVotingRoles && prop.reinstatementVotingRoles[0]) || "Tirocinante";
            }
          }

          const roleSuffix = winningRole ? ` (Grado assegnato per maggioranza voti: ${winningRole})` : "";
          summary = `Approvata automaticamente per maggioranza favorevole alla scadenza del timer 24h${roleSuffix} (${fav} favorevoli, ${con} contrari, ${ast} astenuti).`;
        } else if (con > fav) {
          outcome = "REJECTED";
          newStatus = "REJECTED";
          newCdaStatus = "REJECTED";
          summary = `Rifiutata automaticamente per maggioranza contraria alla scadenza del timer 24h (${fav} favorevoli, ${con} contrari, ${ast} astenuti).`;
        } else {
          outcome = "TIE";
          newStatus = "PENDING";
          newCdaStatus = "TIE_PENDING";
          summary = `Risultato in Parità (${fav} favorevoli vs ${con} contrari). In attesa di decisione definitiva da parte del Vice Presidente CDA o grado superior.`;
        }

        const updatedProp: CdaProposal = {
          ...prop,
          status: newStatus,
          targetProposedRole: winningRole || prop.targetProposedRole,
          finalApprovedRole: winningRole || prop.finalApprovedRole,
          cdaData: {
            ...prop.cdaData,
            status: newCdaStatus,
            cdaActionReason: summary,
            cdaActionBy: "Sistema CDA (Timer 24h)",
            cdaActionRole: "Sistema Automatico",
            cdaActionAt: now.toISOString(),
          },
          reviewedBy: "Sistema CDA (Timer 24h)",
          reviewedAt: now.toISOString(),
        };

        if (outcome === "REJECTED") {
          updatedProp.rejectionReason = summary;
        }

        db.cdaProposals[idx] = updatedProp;
        updatedList.push(updatedProp);

        if (firestoreDb && !firestoreQuotaExhausted) {
          setDoc(doc(firestoreDb, "cda_proposals", updatedProp.id), sanitizeForFirestore(updatedProp)).catch((e) =>
            handleFirestoreError("processExpiredCdaProposalTimers", e)
          );
        }

        if (logCallback) {
          logCallback(updatedProp, outcome, summary);
        }
      }
    }
  });

  if (updatedList.length > 0) {
    saveLocalDB(db);
  }

  return updatedList;
}

export function getGameLeaderboard(): GameScore[] {
  const db = initDB();
  const scores = db.gameScores || [];
  return [...scores].sort((a, b) => b.score - a.score).slice(0, 50);
}

export function addGameScore(name: string, score: number, level: number): GameScore[] {
  const db = initDB();
  if (!db.gameScores) db.gameScores = [];

  const cleanName = name.trim() || "Medico Ignoto";
  const newScoreVal = Math.floor(score);
  const normalizedName = cleanName.toLowerCase();

  const existingIndex = db.gameScores.findIndex(
    (s) => s.name.trim().toLowerCase() === normalizedName
  );

  let targetScoreObj: GameScore;

  if (existingIndex !== -1) {
    const existing = db.gameScores[existingIndex];
    if (newScoreVal > existing.score) {
      existing.score = newScoreVal;
      existing.level = Math.max(existing.level, level || 1);
      existing.date = new Date().toISOString();
      existing.name = cleanName; // preserve exact casing
      targetScoreObj = existing;
    } else {
      // Score was not surpassed, return current leaderboard without changes
      return db.gameScores.sort((a, b) => b.score - a.score).slice(0, 50);
    }
  } else {
    targetScoreObj = {
      id: crypto.randomUUID(),
      name: cleanName,
      score: newScoreVal,
      level: level || 1,
      date: new Date().toISOString(),
    };
    db.gameScores.push(targetScoreObj);
  }

  // Sort and keep top 100
  db.gameScores.sort((a, b) => b.score - a.score);
  if (db.gameScores.length > 100) {
    db.gameScores = db.gameScores.slice(0, 100);
  }

  saveLocalDB(db);

  if (firestoreDb && !firestoreQuotaExhausted && targetScoreObj) {
    setDoc(doc(firestoreDb, "game_scores", targetScoreObj.id), sanitizeForFirestore(targetScoreObj)).catch((e) =>
      handleFirestoreError("addGameScore", e)
    );
  }

  return db.gameScores.slice(0, 50);
}



