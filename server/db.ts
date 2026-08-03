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
import { RoleId, Candidate, Vote, SiteSettings, Candidatura, CandidaturaStatus, CdaData, CdaStatus, CdaUserVote, CdaProposal, CdaProposalStatus } from "../src/types.js";

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

export function sanitizeForFirestore<T>(obj: T): T {
  if (!obj) return obj;
  return JSON.parse(JSON.stringify(obj));
}

export async function safeFirestoreWrite(writeFn: () => Promise<any>, retries = 3): Promise<any> {
  for (let attempt = 1; attempt <= retries; attempt++) {
    try {
      return await writeFn();
    } catch (err: any) {
      const isCancelled =
        err?.message?.includes("CANCELLED") ||
        err?.code === 1 ||
        err?.code === "cancelled" ||
        err?.message?.includes("stream");
      if (isCancelled && attempt < retries) {
        await new Promise((resolve) => setTimeout(resolve, 350 * attempt));
        continue;
      }
      throw err;
    }
  }
}

if (firebaseConfig && firebaseConfig.apiKey && firebaseConfig.projectId) {
  try {
    const app = getApps().length === 0
      ? initializeApp({
          apiKey: firebaseConfig.apiKey,
          authDomain: firebaseConfig.authDomain,
          projectId: firebaseConfig.projectId,
          storageBucket: firebaseConfig.storageBucket,
          messagingSenderId: firebaseConfig.messagingSenderId,
          appId: firebaseConfig.appId,
        })
      : getApp();

    try {
      setLogLevel("error");
    } catch (_err) {
      // Ignore
    }

    const dbId = firebaseConfig.firestoreDatabaseId || "(default)";
    try {
      firestoreDb = initializeFirestore(app, {
        experimentalForceLongPolling: true,
      }, dbId);
    } catch (_e) {
      firestoreDb = getFirestore(app, dbId);
    }
    console.log("Firebase Firestore initialized with long-polling and databaseId:", dbId);
  } catch (err) {
    console.error("Error initializing Firebase Firestore:", err);
  }
}

// High-security PBKDF2 password hashing with timing-safe comparison
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

// Default candidate dataset
const DEFAULT_CANDIDATES: Candidate[] = [
  { id: "1", name: "Dott. Gabriele Leone", roleId: RoleId.V_PRIMARIO },
  { id: "2", name: "Dott.ssa Sofia Ricci", roleId: RoleId.V_PRIMARIO },
  { id: "3", name: "Dott. Alessandro Moretti", roleId: RoleId.V_PRIMARIO },
  { id: "4", name: "Dott.ssa Elena Esposito", roleId: RoleId.V_PRIMARIO },
  { id: "5", name: "Dott. Roberto Ferri", roleId: RoleId.PRIMARIO },
  { id: "6", name: "Dott.ssa Angela Martini", roleId: RoleId.PRIMARIO },
  { id: "7", name: "Dott. Federico Russo", roleId: RoleId.V_RESPONSABILE_PRESIDIO },
  { id: "8", name: "Dott.ssa Valeria Bruno", roleId: RoleId.RESPONSABILE_PRESIDIO },
  { id: "9", name: "Dott. Stefano Colombo", roleId: RoleId.RESPONSABILE_PRESIDIO },
  { id: "10", name: "Dott.ssa Beatrice Galli", roleId: RoleId.AIUTO_SUPERVISORE },
  { id: "11", name: "Dott. Lorenzo De Luca", roleId: RoleId.V_SUPERVISORE },
  { id: "12", name: "Dott.ssa Giulia Costa", roleId: RoleId.V_SUPERVISORE },
  { id: "13", name: "Dott. Michele Romano", roleId: RoleId.SUPERVISORE },
  { id: "14", name: "Dott.ssa Francesca Serra", roleId: RoleId.SUPERVISORE },
  { id: "15", name: "Prof. Paolo Bianchi", roleId: RoleId.SUPERVISORE_GENERALE },
  { id: "16", name: "Dott.ssa Chiara Marchetti", roleId: RoleId.SEGRETARIO_DIREZIONE },
  { id: "17", name: "Dott. Andrea Gatti", roleId: RoleId.SEGRETARIO_DIREZIONE },
  { id: "18", name: "Dott.ssa Silvia Ferrara", roleId: RoleId.SEGRETARIO_DIREZIONE },
  { id: "19", name: "Dott. Giovanni Vitale", roleId: RoleId.V_DIRETTORE },
  { id: "20", name: "Dott.ssa Roberta Lombardi", roleId: RoleId.V_DIRETTORE },
  { id: "21", name: "Dott. Salvatore Marini", roleId: RoleId.DIRETTORE },
  { id: "22", name: "Dott.ssa Cristina Barbieri", roleId: RoleId.DIRETTORE },
  { id: "23", name: "Dott. Vincenzo Greco", roleId: RoleId.DIRETTORE_GENERALE },
  { id: "24", name: "Dott.ssa Laura Corti", roleId: RoleId.DIRETTORE_GENERALE },
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
export async function syncFromFirestore(): Promise<DatabaseSchema> {
  const currentLocal = initLocalDB();
  if (!firestoreDb) return currentLocal;

  try {
    const settingsDocRef = doc(firestoreDb, "config", "settings");
    const adminDocRef = doc(firestoreDb, "config", "admin");

    const [settingsSnap, adminSnap, candidatesSnap, votesSnap, candidatureSnap, cdaProposalsSnap] = await Promise.all([
      getDoc(settingsDocRef),
      getDoc(adminDocRef),
      getDocs(collection(firestoreDb, "candidates")),
      getDocs(collection(firestoreDb, "votes")),
      getDocs(collection(firestoreDb, "candidature")),
      getDocs(collection(firestoreDb, "cda_proposals")),
    ]);

    const hasData = settingsSnap.exists() || candidatesSnap.size > 0;

    if (hasData) {
      const settings = settingsSnap.exists() ? (settingsSnap.data() as SiteSettings) : currentLocal.settings;
      const adminPasswordHash = adminSnap.exists() && adminSnap.data()?.passwordHash
        ? adminSnap.data()?.passwordHash
        : currentLocal.adminPasswordHash;
      const emergencyPasswordHash = adminSnap.exists() && adminSnap.data()?.emergencyPasswordHash
        ? adminSnap.data()?.emergencyPasswordHash
        : (currentLocal.emergencyPasswordHash || hashPassword("sblocco123"));

      const candidates: Candidate[] = [];
      candidatesSnap.forEach((d) => {
        candidates.push({ ...(d.data() as Candidate), id: d.id });
      });

      const votes: Vote[] = [];
      votesSnap.forEach((d) => {
        votes.push({ ...(d.data() as Vote), id: d.id });
      });

      votes.sort((a, b) => new Date(a.timestamp).getTime() - new Date(b.timestamp).getTime());

      const candidature: Candidatura[] = [];
      candidatureSnap.forEach((d) => {
        candidature.push({ ...(d.data() as Candidatura), id: d.id });
      });
      candidature.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      const cdaProposals: CdaProposal[] = [];
      cdaProposalsSnap.forEach((d) => {
        cdaProposals.push({ ...(d.data() as CdaProposal), id: d.id });
      });
      cdaProposals.sort((a, b) => new Date(b.submittedAt).getTime() - new Date(a.submittedAt).getTime());

      inMemoryDb = {
        settings,
        adminPasswordHash,
        emergencyPasswordHash,
        candidates: candidates.length > 0 ? candidates : currentLocal.candidates,
        votes,
        candidature: candidature.length > 0 ? candidature : (currentLocal.candidature || []),
        cdaProposals: cdaProposals.length > 0 ? cdaProposals : (currentLocal.cdaProposals || []),
      };

      saveLocalDB(inMemoryDb);
      console.log(`Cloud Firestore synced: ${inMemoryDb.candidates.length} candidates, ${inMemoryDb.votes.length} votes.`);
      return inMemoryDb;
    } else {
      console.log("Firestore empty. Migrating initial dataset to Cloud Firestore...");
      await seedFirestore(currentLocal);
      return currentLocal;
    }
  } catch (err) {
    console.error("Firestore sync error, continuing with local storage:", err);
    return currentLocal;
  }
}

async function seedFirestore(data: DatabaseSchema) {
  if (!firestoreDb) return;
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
    console.error("Error seeding Firestore:", err);
  }
}

export function initDB(): DatabaseSchema {
  return initLocalDB();
}

// Database helper operations with immediate local cache update + async Cloud Firestore persistence

export function getSettings(): SiteSettings {
  const db = initDB();
  return db.settings;
}

export function updateSettings(newSettings: Partial<SiteSettings>): SiteSettings {
  const db = initDB();
  db.settings = { ...db.settings, ...newSettings };
  saveLocalDB(db);

  if (firestoreDb) {
    setDoc(doc(firestoreDb, "config", "settings"), db.settings).catch((e) =>
      console.error("Firestore updateSettings error:", e)
    );
  }
  return db.settings;
}

export function verifyAdminPassword(password: string): boolean {
  const db = initDB();
  return verifyPassword(password, db.adminPasswordHash);
}

export function updateAdminPassword(newPassword: string): void {
  const db = initDB();
  db.adminPasswordHash = hashPassword(newPassword);
  saveLocalDB(db);

  if (firestoreDb) {
    setDoc(doc(firestoreDb, "config", "admin"), {
      passwordHash: db.adminPasswordHash,
      emergencyPasswordHash: db.emergencyPasswordHash || hashPassword("sblocco123"),
    }).catch((e) =>
      console.error("Firestore updateAdminPassword error:", e)
    );
  }
}

export function verifyEmergencyPassword(password: string): boolean {
  const db = initDB();
  const hash = db.emergencyPasswordHash || hashPassword("sblocco123");
  return verifyPassword(password, hash);
}

export function updateEmergencyPassword(newPassword: string): void {
  const db = initDB();
  db.emergencyPasswordHash = hashPassword(newPassword);
  saveLocalDB(db);

  if (firestoreDb) {
    setDoc(doc(firestoreDb, "config", "admin"), {
      passwordHash: db.adminPasswordHash,
      emergencyPasswordHash: db.emergencyPasswordHash,
    }).catch((e) =>
      console.error("Firestore updateEmergencyPassword error:", e)
    );
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

  if (firestoreDb) {
    setDoc(doc(firestoreDb, "candidates", newCandidate.id), newCandidate).catch((e) =>
      console.error("Firestore addCandidate error:", e)
    );
  }
  return newCandidate;
}

export function removeCandidate(id: string): boolean {
  const db = initDB();
  const index = db.candidates.findIndex((c) => c.id === id);
  if (index !== -1) {
    db.candidates.splice(index, 1);
    saveLocalDB(db);

    if (firestoreDb) {
      deleteDoc(doc(firestoreDb, "candidates", id)).catch((e) =>
        console.error("Firestore removeCandidate error:", e)
      );
    }
    return true;
  }
  return false;
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

  if (firestoreDb) {
    setDoc(doc(firestoreDb, "votes", newVote.id), newVote).catch((e) =>
      console.error("Firestore addVote error:", e)
    );
  }
  return newVote;
}

export function clearAllVotes(): void {
  const db = initDB();
  const previousVoteIds = db.votes.map((v) => v.id);
  db.votes = [];
  saveLocalDB(db);

  if (firestoreDb) {
    const batch = writeBatch(firestoreDb);
    previousVoteIds.forEach((id) => {
      batch.delete(doc(firestoreDb, "votes", id));
    });
    batch.commit().catch((e) => console.error("Firestore clearAllVotes error:", e));
  }
}

export function removeVote(id: string): boolean {
  const db = initDB();
  const index = db.votes.findIndex((v) => v.id === id);
  if (index !== -1) {
    db.votes.splice(index, 1);
    saveLocalDB(db);

    if (firestoreDb) {
      deleteDoc(doc(firestoreDb, "votes", id)).catch((e) =>
        console.error("Firestore removeVote error:", e)
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

  if (firestoreDb) {
    const batch = writeBatch(firestoreDb);
    oldCandidates.forEach((oldC) => {
      if (!updatedCandidates.some((c) => c.id === oldC.id)) {
        batch.delete(doc(firestoreDb, "candidates", oldC.id));
      }
    });

    updatedCandidates.forEach((c) => {
      batch.set(doc(firestoreDb, "candidates", c.id), sanitizeForFirestore(c));
    });

    batch.commit().catch((e) => console.error("Firestore updateCandidatesBulk error:", e));
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
      if (firestoreDb) {
        db.votes.forEach((vote) => {
          setDoc(doc(firestoreDb, "votes", vote.id), sanitizeForFirestore(vote)).catch((e) =>
            console.error("Firestore updateVote error during candidate rename:", e)
          );
        });
      }
    }

    saveLocalDB(db);

    if (firestoreDb) {
      setDoc(doc(firestoreDb, "candidates", id), sanitizeForFirestore(db.candidates[index])).catch((e) =>
        console.error("Firestore updateCandidate error:", e)
      );
    }
    return db.candidates[index];
  }
  return null;
}

// Firestore tokens and access logs sync helpers
export async function syncTokensAndLogsFirestore(): Promise<{ tokens: any[]; logs: any[] }> {
  if (!firestoreDb) return { tokens: [], logs: [] };
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
    console.error("Error syncing tokens and logs from Firestore:", err);
    return { tokens: [], logs: [] };
  }
}

export function saveTokenFirestore(tokenDoc: any): void {
  if (!firestoreDb || !tokenDoc || !tokenDoc.token) return;
  setDoc(doc(firestoreDb, "employee_tokens", tokenDoc.token.toUpperCase()), sanitizeForFirestore(tokenDoc)).catch((e) =>
    console.error("Firestore saveToken error:", e)
  );
}

export function deleteTokenFirestore(tokenStr: string): void {
  if (!firestoreDb || !tokenStr) return;
  deleteDoc(doc(firestoreDb, "employee_tokens", tokenStr.toUpperCase())).catch((e) =>
    console.error("Firestore deleteToken error:", e)
  );
}

export async function syncRevokedTokensFirestore(): Promise<any[]> {
  if (!firestoreDb) return [];
  try {
    const snap = await getDocs(collection(firestoreDb, "revoked_tokens"));
    const list: any[] = [];
    snap.forEach((d) => list.push(d.data()));
    return list;
  } catch (err) {
    console.error("Error syncing revoked_tokens from Firestore:", err);
    return [];
  }
}

export function saveRevokedTokenFirestore(revokedDoc: any): void {
  if (!firestoreDb || !revokedDoc || !revokedDoc.token) return;
  setDoc(doc(firestoreDb, "revoked_tokens", revokedDoc.token.toUpperCase()), sanitizeForFirestore(revokedDoc)).catch((e) =>
    console.error("Firestore saveRevokedToken error:", e)
  );
}

export function deleteRevokedTokenFirestore(tokenStr: string): void {
  if (!firestoreDb || !tokenStr) return;
  deleteDoc(doc(firestoreDb, "revoked_tokens", tokenStr.toUpperCase())).catch((e) =>
    console.error("Firestore deleteRevokedToken error:", e)
  );
}

export function saveAccessLogFirestore(logDoc: any): void {
  if (!firestoreDb || !logDoc || !logDoc.id) return;
  setDoc(doc(firestoreDb, "access_logs", logDoc.id), sanitizeForFirestore(logDoc)).catch((e) =>
    console.error("Firestore saveAccessLog error:", e)
  );
}

export function clearAccessLogsFirestore(): void {
  if (!firestoreDb) return;
  getDocs(collection(firestoreDb, "access_logs"))
    .then((snap) => {
      const batch = writeBatch(firestoreDb);
      snap.forEach((d) => batch.delete(d.ref));
      return batch.commit();
    })
    .catch((e) => console.error("Firestore clearAccessLogs error:", e));
}

// Firestore hierarchy members sync helpers
export async function syncHierarchyMembersFirestore(): Promise<any[]> {
  if (!firestoreDb) return [];
  try {
    const snap = await getDocs(collection(firestoreDb, "hierarchy_members"));
    const members: any[] = [];
    snap.forEach((d) => members.push({ ...d.data(), id: d.id }));
    return members;
  } catch (err) {
    console.error("Error syncing hierarchy_members from Firestore:", err);
    return [];
  }
}

export function saveHierarchyMemberFirestore(memberDoc: any): void {
  if (!firestoreDb || !memberDoc || !memberDoc.id) return;
  const cleanDoc = JSON.parse(JSON.stringify(memberDoc));
  setDoc(doc(firestoreDb, "hierarchy_members", memberDoc.id), cleanDoc).catch((e) =>
    console.error("Firestore saveHierarchyMember error:", e)
  );
}

export function deleteHierarchyMemberFirestore(id: string): void {
  if (!firestoreDb || !id) return;
  deleteDoc(doc(firestoreDb, "hierarchy_members", id)).catch((e) =>
    console.error("Firestore deleteHierarchyMember error:", e)
  );
}

export async function saveAllHierarchyMembersFirestore(members: any[]): Promise<void> {
  if (!firestoreDb) return;
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
    console.error("Firestore saveAllHierarchyMembers error:", err);
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

  if (firestoreDb) {
    setDoc(doc(firestoreDb, "candidature", newCand.id), sanitizeForFirestore(newCand)).catch((e) =>
      console.error("Firestore addCandidatura error:", e)
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

    if (firestoreDb) {
      setDoc(doc(firestoreDb, "candidature", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        console.error("Firestore updateCandidaturaStatus error:", e)
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

    if (firestoreDb) {
      setDoc(doc(firestoreDb, "candidature", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        console.error("Firestore cancelCandidatura error:", e)
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
  const index = db.candidature.findIndex(
    (c) =>
      c.id === cleanId ||
      String(c.id).trim().toLowerCase() === cleanId.toLowerCase() ||
      encodeURIComponent(c.id) === cleanId
  );

  let targetId = cleanId;
  if (index !== -1) {
    targetId = db.candidature[index].id;
    db.candidature.splice(index, 1);
    saveLocalDB(db);
  }

  if (firestoreDb) {
    if (targetId) {
      deleteDoc(doc(firestoreDb, "candidature", targetId)).catch((e) =>
        console.error("Firestore deleteCandidatura targetId error:", e)
      );
    }
    if (cleanId && cleanId !== targetId) {
      deleteDoc(doc(firestoreDb, "candidature", cleanId)).catch((e) =>
        console.error("Firestore deleteCandidatura cleanId error:", e)
      );
    }
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

    if (firestoreDb) {
      setDoc(doc(firestoreDb, "candidature", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        console.error("Firestore updateCandidaturaCda error:", e)
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

    if (firestoreDb) {
      setDoc(doc(firestoreDb, "candidature", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        console.error("Firestore resetCandidaturaToVoting error:", e)
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

        if (firestoreDb) {
          setDoc(doc(firestoreDb, "candidature", updatedCand.id), sanitizeForFirestore(updatedCand)).catch((e) =>
            console.error("Firestore processExpiredCdaTimers error:", e)
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

  if (firestoreDb) {
    setDoc(doc(firestoreDb, "cda_proposals", prop.id), sanitizeForFirestore(prop)).catch((e) =>
      console.error("Firestore addCdaProposal error:", e)
    );
  }

  return prop;
}

export function updateCdaProposalCda(
  id: string,
  cdaData: Partial<CdaData>,
  statusOverride?: CandidaturaStatus,
  reviewedBy?: string,
  rejectionReason?: string
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

    if (firestoreDb) {
      setDoc(doc(firestoreDb, "cda_proposals", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        console.error("Firestore updateCdaProposalCda error:", e)
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
  const index = db.cdaProposals.findIndex(
    (p) => p.id === cleanId || String(p.id).trim().toLowerCase() === cleanId.toLowerCase()
  );

  if (index !== -1) {
    const target = db.cdaProposals[index];
    db.cdaProposals.splice(index, 1);
    saveLocalDB(db);

    if (firestoreDb) {
      deleteDoc(doc(firestoreDb, "cda_proposals", target.id)).catch((e) =>
        console.error("Firestore deleteCdaProposal error:", e)
      );
    }
    return true;
  }
  return false;
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

    if (firestoreDb) {
      setDoc(doc(firestoreDb, "cda_proposals", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        console.error("Firestore cancelCdaProposal error:", e)
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

    if (firestoreDb) {
      setDoc(doc(firestoreDb, "cda_proposals", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        console.error("Firestore resetCdaProposalToPreEvaluation error:", e)
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

    if (firestoreDb) {
      setDoc(doc(firestoreDb, "cda_proposals", updated.id), sanitizeForFirestore(updated)).catch((e) =>
        console.error("Firestore resetCdaProposalToVoting error:", e)
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

        votesArr.forEach((v) => {
          if (v.decision === "FAVOREVOLE") fav++;
          else if (v.decision === "CONTRARIO") con++;
          else if (v.decision === "ASTENUTO") ast++;
        });

        let outcome: "APPROVED" | "REJECTED" | "TIE";
        let newStatus: CdaProposalStatus = prop.status;
        let newCdaStatus: CdaStatus = prop.cdaData.status;
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
          outcome = "TIE";
          newStatus = "PENDING";
          newCdaStatus = "TIE_PENDING";
          summary = `Risultato in Parità (${fav} favorevoli vs ${con} contrari). In attesa di decisione definitiva da parte del Vice Presidente CDA o grado superiore.`;
        }

        const updatedProp: CdaProposal = {
          ...prop,
          status: newStatus,
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

        if (firestoreDb) {
          setDoc(doc(firestoreDb, "cda_proposals", updatedProp.id), sanitizeForFirestore(updatedProp)).catch((e) =>
            console.error("Firestore processExpiredCdaProposalTimers error:", e)
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



