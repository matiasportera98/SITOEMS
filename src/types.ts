import type { CSSProperties } from "react";

export enum RoleId {
  VOLONTARIO = "volontario",
  V_PRIMARIO = "v_primario",
  PRIMARIO = "primario",
  V_RESPONSABILE_PRESIDIO = "v_responsabile_presidio",
  RESPONSABILE_PRESIDIO = "responsabile_presidio",
  AIUTO_SUPERVISORE = "aiuto_supervisore",
  V_SUPERVISORE = "v_supervisore",
  SUPERVISORE = "supervisore",
  SUPERVISORE_GENERALE = "supervisore_generale",
  SEGRETARIO_DIREZIONE = "segretario_direzione",
  V_DIRETTORE = "v_direttore",
  DIRETTORE = "direttore",
  DIRETTORE_GENERALE = "direttore_generale",
}

export interface Candidate {
  id: string;
  name: string;
  roleId: RoleId;
}

export interface Vote {
  id: string;
  voterFullName: string;
  timestamp: string; // ISO date string
  selections: Record<RoleId, string[]>; // Map of roleId to array of candidate names (or candidate IDs)
}

export interface SiteSettings {
  title: string;
  description: string;
  votingActive: boolean;
  allowMultipleSelection: boolean;
  requireAllRoles: boolean;
  candidatureEnabled?: boolean;
}

export interface GameScore {
  id: string;
  name: string;
  score: number;
  level: number;
  date: string;
}

export interface RoleConfig {
  id: RoleId;
  name: string;
  color: string; // Tailwind color class suffix
  symbol: "star" | "cross" | "crown" | "gem";
  grade: number; // 1 (lowest) to 12 (highest)
}

export const ROLE_CONFIGS: Record<RoleId, RoleConfig> = {
  [RoleId.VOLONTARIO]: {
    id: RoleId.VOLONTARIO,
    name: "Volontario",
    color: "gradient-volontario",
    symbol: "star",
    grade: 0,
  },
  [RoleId.V_PRIMARIO]: {
    id: RoleId.V_PRIMARIO,
    name: "V. Primario di Reparto",
    color: "amber-400",
    symbol: "star",
    grade: 1,
  },
  [RoleId.PRIMARIO]: {
    id: RoleId.PRIMARIO,
    name: "Primario di Reparto",
    color: "amber-700",
    symbol: "star",
    grade: 2,
  },
  [RoleId.V_RESPONSABILE_PRESIDIO]: {
    id: RoleId.V_RESPONSABILE_PRESIDIO,
    name: "V. Responsabile Del Presidio",
    color: "orange-400",
    symbol: "star",
    grade: 3,
  },
  [RoleId.RESPONSABILE_PRESIDIO]: {
    id: RoleId.RESPONSABILE_PRESIDIO,
    name: "Responsabile Del Presidio",
    color: "orange-600",
    symbol: "star",
    grade: 4,
  },
  [RoleId.AIUTO_SUPERVISORE]: {
    id: RoleId.AIUTO_SUPERVISORE,
    name: "Assistente Supervisore",
    color: "pink-400",
    symbol: "star",
    grade: 5,
  },
  [RoleId.V_SUPERVISORE]: {
    id: RoleId.V_SUPERVISORE,
    name: "V. Supervisore",
    color: "pink-600",
    symbol: "star",
    grade: 6,
  },
  [RoleId.SUPERVISORE]: {
    id: RoleId.SUPERVISORE,
    name: "Supervisore",
    color: "rose-600",
    symbol: "star",
    grade: 7,
  },
  [RoleId.SUPERVISORE_GENERALE]: {
    id: RoleId.SUPERVISORE_GENERALE,
    name: "Supervisore Generale",
    color: "purple-600",
    symbol: "cross",
    grade: 8,
  },
  [RoleId.SEGRETARIO_DIREZIONE]: {
    id: RoleId.SEGRETARIO_DIREZIONE,
    name: "Segretario Direzione",
    color: "violet-700",
    symbol: "cross",
    grade: 9,
  },
  [RoleId.V_DIRETTORE]: {
    id: RoleId.V_DIRETTORE,
    name: "V. Direttore Sanitario",
    color: "red-500",
    symbol: "crown",
    grade: 10,
  },
  [RoleId.DIRETTORE]: {
    id: RoleId.DIRETTORE,
    name: "Direttore Sanitario",
    color: "red-700",
    symbol: "crown",
    grade: 11,
  },
  [RoleId.DIRETTORE_GENERALE]: {
    id: RoleId.DIRETTORE_GENERALE,
    name: "Direttore Generale",
    color: "cyan-500",
    symbol: "gem",
    grade: 12,
  },
};

// Sort role IDs by grade (ascending or descending)
export const ROLE_IDS_SORTED_ASC = (Object.keys(ROLE_CONFIGS) as RoleId[]).sort(
  (a, b) => ROLE_CONFIGS[a].grade - ROLE_CONFIGS[b].grade
);

export const ROLE_IDS_SORTED_DESC = (Object.keys(ROLE_CONFIGS) as RoleId[]).sort(
  (a, b) => ROLE_CONFIGS[b].grade - ROLE_CONFIGS[a].grade
);

export interface DiscordUserSession {
  username: string;
  roleName: string;
  grade: number;
  isAllowed: boolean;
  verifiedAt: string;
  token: string;
  isMaster?: boolean;
  discordTag?: string;
  cdaRoleName?: string;
  hasCdaAccess?: boolean;
  isTestToken?: boolean;
  expiresAt?: string;
  durationMs?: number;
  activatedAt?: string;
  isExpired?: boolean;
  candidateId?: string;
  hideFromHierarchy?: boolean;
}

const ROLE_GRADE_MAP: Record<string, number> = {
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
  "volontario": 1.5,
  "volontaria": 1.5,
  "dipendente": 1,
};

export function getSingleRoleGrade(roleName?: string): number {
  if (!roleName) return 0;
  const clean = roleName.trim().toLowerCase();
  
  if (ROLE_GRADE_MAP[clean] !== undefined) {
    return ROLE_GRADE_MAP[clean];
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

export function getUserEffectiveGrade(u: { roleName?: string; cdaRoleName?: string; token?: string; isMaster?: boolean }): number {
  if (u.isMaster) return 100;
  const clean = (u.roleName || "").trim().toLowerCase();
  if (clean.includes("proprietario") || clean.includes("master")) return 100;
  const grade = getSingleRoleGrade(u.roleName);
  return grade >= 99 ? 100 : grade;
}

export type LogCategory = "ACCESSI" | "CANDIDATURE" | "MODIFICHE_ADMIN" | "VOTI" | "CDA";

export interface AccessLog {
  id: string;
  timestamp: string;
  ip: string;
  username: string;
  roleName: string;
  token: string;
  action: string;
  status: "SUCCESS" | "DENIED" | "REVOKED" | "INFO";
  details: string;
  category?: LogCategory;
}

export const ALLOWED_DISCORD_ROLES = [
  "Proprietario",
  "Vice Proprietario",
  "Direttore Generale",
  "Direttore Sanitario",
  "V. Direttore Sanitario",
  "Segretario Direzione",
  "Supervisore Generale",
  "Supervisore",
  "V. Supervisore",
  "Assistente Supervisore",
  "Responsabile Del Presidio",
  "V. Responsabile Del Presidio",
  "Primario di Reparto",
  "V. Primario di Reparto",
  "Volontario",
  "Consigliere Finale CDA",
  "Presidente CDA",
  "Vice Presidente CDA",
  "Segretario CDA",
  "Membro CDA",
];

export type HierarchyCategoryKey =
  | "PROPRIETARI"
  | "DIRIGENZA_GENERALE"
  | "DIRIGENZA_SANITARIA"
  | "SUPERVISIONE"
  | "FUNZIONARI"
  | "VOLONTARI";

export interface HierarchyMember {
  id: string;
  name: string;
  roleName: string;
  categoryKey: HierarchyCategoryKey;
  badge?: string;
  discordTag?: string;
  updatedAt?: string;
}

export interface HierarchyCategoryConfig {
  key: HierarchyCategoryKey;
  title: string;
  description: string;
  rolesIncluded: string[];
  color: string;
  borderColor: string;
  bgColor: string;
  badgeBg: string;
  order: number;
}

export const HIERARCHY_CATEGORIES: Record<HierarchyCategoryKey, HierarchyCategoryConfig> = {
  PROPRIETARI: {
    key: "PROPRIETARI",
    title: "Proprietari",
    description: "Massimo vertice istituzionale e fondatori del corpo EMS",
    rolesIncluded: ["Proprietario", "Vice Proprietario"],
    color: "amber-400",
    borderColor: "border-slate-800/90 hover:border-slate-700",
    bgColor: "bg-slate-900/50 backdrop-blur-md",
    badgeBg: "bg-amber-500/10 text-amber-300 border-amber-500/30",
    order: 1,
  },
  DIRIGENZA_GENERALE: {
    key: "DIRIGENZA_GENERALE",
    title: "Dirigenza Generale",
    description: "Direzione strategica, gestione generale ed amministrativa",
    rolesIncluded: ["Direttore Generale"],
    color: "cyan-400",
    borderColor: "border-slate-800/90 hover:border-slate-700",
    bgColor: "bg-slate-900/50 backdrop-blur-md",
    badgeBg: "bg-cyan-500/10 text-cyan-300 border-cyan-500/30",
    order: 2,
  },
  DIRIGENZA_SANITARIA: {
    key: "DIRIGENZA_SANITARIA",
    title: "Dirigenza Sanitaria",
    description: "Gestione della struttura sanitaria, protocolli ed organizzazione dei servizi",
    rolesIncluded: ["Direttore Sanitario", "V. Direttore Sanitario", "Segretario Direzione"],
    color: "red-400",
    borderColor: "border-slate-800/90 hover:border-slate-700",
    bgColor: "bg-slate-900/50 backdrop-blur-md",
    badgeBg: "bg-red-500/10 text-red-300 border-red-500/30",
    order: 3,
  },
  SUPERVISIONE: {
    key: "SUPERVISIONE",
    title: "Supervisione",
    description: "Controllo operativo, qualità dell'intervento e coordinamento sul campo",
    rolesIncluded: ["Supervisore Generale", "Supervisore", "V. Supervisore", "Assistente Supervisore"],
    color: "purple-400",
    borderColor: "border-slate-800/90 hover:border-slate-700",
    bgColor: "bg-slate-900/50 backdrop-blur-md",
    badgeBg: "bg-purple-500/10 text-purple-300 border-purple-500/30",
    order: 4,
  },
  FUNZIONARI: {
    key: "FUNZIONARI",
    title: "Funzionari",
    description: "Gestione di presidi ed operatività diretta",
    rolesIncluded: [
      "Responsabile Del Presidio",
      "V. Responsabile Del Presidio",
      "Primario di Reparto",
      "V. Primario di Reparto",
    ],
    color: "orange-400",
    borderColor: "border-slate-800/90 hover:border-slate-700",
    bgColor: "bg-slate-900/50 backdrop-blur-md",
    badgeBg: "bg-orange-500/10 text-orange-300 border-orange-500/30",
    order: 5,
  },
  VOLONTARI: {
    key: "VOLONTARI",
    title: "Volontari",
    description: "Supporto operativo, soccorso ed assistenza alle attività EMS",
    rolesIncluded: ["Volontario"],
    color: "[#f78c8c]",
    borderColor: "border-[#f78c8c]/30 hover:border-[#f78c8c]/60",
    bgColor: "bg-slate-900/50 backdrop-blur-md",
    badgeBg: "bg-gradient-to-r from-[#a7a7a8]/20 to-[#f78c8c]/20 text-[#f78c8c] border-[#f78c8c]/40",
    order: 6,
  },
};

export function getCategoryForRole(roleName: string): HierarchyCategoryKey {
  if (!roleName) return "VOLONTARI";
  const r = roleName.trim().toLowerCase();

  if (r.includes("proprietario")) {
    return "PROPRIETARI";
  }
  if (r.includes("direttore generale")) {
    return "DIRIGENZA_GENERALE";
  }
  if (
    r.includes("direttore sanitario") ||
    r.includes("v. direttore") ||
    r.includes("vice direttore") ||
    r.includes("segretario")
  ) {
    return "DIRIGENZA_SANITARIA";
  }
  if (
    r.includes("supervisore") ||
    r.includes("assistente supervisore") ||
    r.includes("aiuto supervisore")
  ) {
    return "SUPERVISIONE";
  }
  if (
    r.includes("primario") ||
    r.includes("responsabile")
  ) {
    return "FUNZIONARI";
  }
  if (
    r.includes("volontario") ||
    r.includes("volontaria")
  ) {
    return "VOLONTARI";
  }
  return "VOLONTARI";
}

export interface OfficialMemberSeed {
  name: string;
  roleName: string;
  token: string;
  discordTag?: string;
  cdaRoleName?: string;
  hasCdaAccess?: boolean;
}

export const OFFICIAL_OWNERS_SEED: OfficialMemberSeed[] = [
  {
    name: "Antony Romano",
    roleName: "Proprietario",
    token: "EMS-ARPROP",
    discordTag: "@anto.romano",
  },
  {
    name: "Giovanni Manzo",
    roleName: "Proprietario",
    token: "EMS-GMPROP",
    discordTag: "@smokafps",
  },
  {
    name: "Simone Rizzus",
    roleName: "Proprietario",
    token: "EMS-SRPROP",
    discordTag: "@simolmao",
  },
];

export const OFFICIAL_IMAGE_MEMBERS_SEED: OfficialMemberSeed[] = [
  { name: "Matias Corleone", roleName: "Vice Proprietario", token: "EMS-MCA496", discordTag: "@matias_corleone", cdaRoleName: "Vice Presidente CDA", hasCdaAccess: true },
  { name: "Theo Smith", roleName: "Direttore Generale", token: "EMS-TSD286", discordTag: "@theo_smith", cdaRoleName: "Presidente CDA", hasCdaAccess: true },
  { name: "Filippo Ciro", roleName: "Direttore Sanitario", token: "EMS-FC6767", discordTag: "@filippo_ciro", cdaRoleName: "Membro CDA", hasCdaAccess: true },
  { name: "Luca Brizzante", roleName: "Direttore Sanitario", token: "EMS-LBC6A6", discordTag: "@luca_brizzante", cdaRoleName: "Segretario CDA", hasCdaAccess: true },
  { name: "Ares Migliorini", roleName: "V. Direttore Sanitario", token: "EMS-AM59DB", discordTag: "@ares_migliorini", cdaRoleName: "Membro CDA", hasCdaAccess: true },
  { name: "Dutch Esposito", roleName: "V. Direttore Sanitario", token: "EMS-DEC97C", discordTag: "@dutch_esposito", cdaRoleName: "Membro CDA", hasCdaAccess: true },
  { name: "Igor Lestrenge", roleName: "V. Direttore Sanitario", token: "EMS-ILB5D2", discordTag: "@igor_lestrenge", cdaRoleName: "Membro CDA", hasCdaAccess: true },
  { name: "Ciccio Losavio", roleName: "Segretario Direzione", token: "EMS-CLA9CC", discordTag: "@ciccio_losavio", cdaRoleName: "Membro CDA", hasCdaAccess: true },
  { name: "Jonathan Giacomarra", roleName: "Segretario Direzione", token: "EMS-JG211B", discordTag: "@jonathan_giacomarra", cdaRoleName: "Membro CDA", hasCdaAccess: true },
  { name: "Giuseppe Politics", roleName: "Supervisore Generale", token: "EMS-GP67SC", discordTag: "@giuseppe_politics", cdaRoleName: "Membro CDA", hasCdaAccess: true },
  { name: "Diego Trombini", roleName: "Supervisore", token: "EMS-DT0311", discordTag: "@diego_trombini", cdaRoleName: "Membro CDA", hasCdaAccess: true },
  { name: "Rocco Ali", roleName: "Supervisore", token: "EMS-RAA405", discordTag: "@rocco_ali", cdaRoleName: "Membro CDA", hasCdaAccess: true },
  { name: "Raffaele Bravi", roleName: "V. Supervisore", token: "EMS-RB1237", discordTag: "@raffaele_bravi" },
  { name: "Alex De Santis", roleName: "Assistente Supervisore", token: "EMS-ADSY34", discordTag: "@alex_de_santis" },
  { name: "Giangi Leanza", roleName: "Assistente Supervisore", token: "EMS-GLEA9D", discordTag: "@giangi_leanza" },
  { name: "Antonio Palermo", roleName: "V. Responsabile Del Presidio", token: "EMS-AP34FW", discordTag: "@antonio_palermo" },
  { name: "Kevin Panetto", roleName: "V. Responsabile Del Presidio", token: "EMS-KP28RC", discordTag: "@kevin_panetto" },
  { name: "Mirko Leone", roleName: "V. Responsabile Del Presidio", token: "EMS-ML373T", discordTag: "@mirko_leone" },
  { name: "Nick Larsson", roleName: "V. Responsabile Del Presidio", token: "EMS-NLDF73", discordTag: "@nick_larsson" },
  { name: "Rick Maltese", roleName: "V. Responsabile Del Presidio", token: "EMS-RM6E9E", discordTag: "@rick_maltese" },
  { name: "Yuki Cross", roleName: "V. Responsabile Del Presidio", token: "EMS-YCDB15", discordTag: "@yuki_cross" },
  { name: "Massimo Arresto", roleName: "V. Primario di Reparto", token: "EMS-MAFFU23", discordTag: "@massimo_arresto" },
  { name: "Matteo Piscitelli", roleName: "V. Primario di Reparto", token: "EMS-MA264H", discordTag: "@matteo_piscitelli" },
];

export const ALLOWED_OFFICIAL_TOKEN_KEYS = new Set<string>([
  "EMS-2410PROP",
  "EMS-ARPROP",
  "EMS-GMPROP",
  "EMS-SRPROP",
  "EMS-MCA496",
  "EMS-TSD286",
  "EMS-FC6767",
  "EMS-LBC6A6",
  "EMS-AM59DB",
  "EMS-DEC97C",
  "EMS-ILB5D2",
  "EMS-CLA9CC",
  "EMS-JG211B",
  "EMS-GP67SC",
  "EMS-DT0311",
  "EMS-RAA405",
  "EMS-RB1237",
  "EMS-ADSY34",
  "EMS-GLEA9D",
  "EMS-AP34FW",
  "EMS-KP28RC",
  "EMS-ML373T",
  "EMS-NLDF73",
  "EMS-RM6E9E",
  "EMS-YCDB15",
  "EMS-MAFFU23",
  "EMS-MA264H",
]);



export type CandidaturaStatus = "PENDING" | "APPROVED" | "REJECTED" | "CANCELLED";

export type CdaStatus = "PENDING_RENDER" | "IN_VOTING" | "APPROVED" | "REJECTED" | "RETURNED" | "TIE_PENDING";

export interface CdaUserVote {
  voterToken?: string;
  voterName: string;
  voterRole: string;
  decision: "FAVOREVOLE" | "CONTRARIO" | "ASTENUTO";
  chosenRole?: string;
  timestamp: string;
  reason?: string;
}

export interface CdaData {
  renderedAt?: string;
  renderedBy?: string;
  renderedByRole?: string;
  votingStartedAt?: string;
  expiresAt?: string; // 24 hours after renderedAt
  status?: CdaStatus;
  votes?: Record<string, CdaUserVote>; // map of voter identifier -> vote
  cdaActionReason?: string;
  cdaActionBy?: string;
  cdaActionRole?: string;
  cdaActionAt?: string;
}

export interface Candidatura {
  id: string;
  fullName: string;
  currentRole: string; // Range: Primario (#07095e) up to V. Responsabile del presidio
  desiredRole: string; // Range: V. Primario di reparto up to Responsabile del presidio
  timeSlot: string; // Manual text entry for working hours
  offerText: string; // What they offer as a person/employee (minimum 5 lines)
  status: CandidaturaStatus; // PENDING ("in valutazione"), APPROVED, REJECTED, CANCELLED
  rejectionReason?: string; // Reason for rejection
  cancellationReason?: string; // Mandatory reason for cancellation when withdrawn by applicant
  cancelledAt?: string; // ISO date string when cancelled
  submittedAt: string; // ISO date string
  token?: string;
  ip?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  cdaData?: CdaData;
}

export type CdaProposalType = "GENERICA" | "PROMOZIONE" | "REINTEGRO";

export type CdaProposalStatus = "PENDING" | "PENDING_COSIGNERS" | "PENDING_REVISION" | "IN_VOTING" | "APPROVED" | "REJECTED" | "RETURNED" | "CANCELLED";

export interface CdaCoSigner {
  name: string;
  role: string;
  tokenPrefix: string; // The two letters after EMS- e.g. "AB"
  fullToken?: string;
  hasSigned?: boolean;
}

export interface CdaProposal {
  id: string;
  type: CdaProposalType;
  proposerName: string;
  proposerRole: string;
  coSigners?: CdaCoSigner[];
  title: string;
  description: string;
  targetEmployeeName?: string;
  targetCurrentRole?: string;
  targetProposedRole?: string;
  reinstatementVotingRoles?: string[];
  finalApprovedRole?: string;
  status: CdaProposalStatus;
  rejectionReason?: string;
  cancellationReason?: string;
  cancelledAt?: string;
  cancelledBy?: string;
  submittedAt: string;
  token?: string;
  ip?: string;
  reviewedAt?: string;
  reviewedBy?: string;
  cdaData?: CdaData;
}

export const ALL_EMS_PROMOTION_ROLES = [
  "Tirocinante",
  "Infermiere",
  "Medico",
  "Medico Esperto",
  "V. Primario",
  "Primario",
  "V. Primario di Reparto",
  "Primario di Reparto",
  "V. Responsabile Del Presidio",
  "Responsabile Del Presidio",
  "Assistente Supervisore",
  "V. Supervisore",
  "Supervisore",
  "Supervisore Generale",
  "Segretario Direzione",
  "V. Direttore Sanitario",
  "Direttore Sanitario",
  "V. Direttore Generale",
  "Direttore Generale",
];

export function isCdaRoleName(roleName: string): boolean {
  if (!roleName) return false;
  const r = roleName.trim().toLowerCase();
  if (r.includes("proprietario") || r.includes("master")) return true;
  return r.includes("cda");
}

export function getCdaRank(roleName: string): number {
  if (!roleName) return 0;
  const r = roleName.trim().toLowerCase();
  if (r.includes("proprietario") || r.includes("master")) return 100;
  if (r.includes("consigliere finale")) return 5;
  if (r.includes("presidente cda") && !r.includes("vice") && !r.includes("v.")) return 4;
  if (r.includes("vice presidente") || r.includes("v. presidente") || r.includes("vicepresidente")) return 3;
  if (r.includes("segretario")) return 2;
  if (r.includes("membro") || r.includes("cda")) return 1;
  return 0;
}

export const CANDIDATURA_CURRENT_ROLES = [
  { name: "Primario", colorHex: "#07095e" },
  { name: "V. Primario di Reparto", colorHex: "#fbbf24" },
  { name: "Primario di Reparto", colorHex: "#b45309" },
  { name: "V. Responsabile Del Presidio", colorHex: "#fb923c" },
];

export const CANDIDATURA_DESIRED_ROLES = [
  { name: "V. Primario di Reparto", colorHex: "#fbbf24" },
  { name: "Primario di Reparto", colorHex: "#b45309" },
  { name: "V. Responsabile Del Presidio", colorHex: "#fb923c" },
  { name: "Responsabile Del Presidio", colorHex: "#ea580c" },
];

export const CANDIDATURA_ROLE_PROGRESSION: Record<string, string> = {
  "Primario": "V. Primario di Reparto",
  "V. Primario di Reparto": "Primario di Reparto",
  "Primario di Reparto": "V. Responsabile Del Presidio",
  "V. Responsabile Del Presidio": "Responsabile Del Presidio",
};

export function getNextPromotionRole(currentRole: string): string {
  if (!currentRole) return "V. Primario di Reparto";
  const trimmed = currentRole.trim();
  if (CANDIDATURA_ROLE_PROGRESSION[trimmed]) {
    return CANDIDATURA_ROLE_PROGRESSION[trimmed];
  }
  const lower = trimmed.toLowerCase();
  for (const [curr, next] of Object.entries(CANDIDATURA_ROLE_PROGRESSION)) {
    if (curr.toLowerCase() === lower) return next;
  }
  return "V. Primario di Reparto";
}

export interface ExcelColumnDef {
  id: string; // unique identifier (e.g., "fullName", "currentRole", "newRole", "cdaRole", "dgsRole", "leaveStatus", "notes", or custom "custom_xyz")
  key: string;
  label: string;
  type: "text" | "role" | "badge" | "leave" | "status" | "date";
  isRemovable: boolean;
  isCustom?: boolean;
  order: number;
  visible: boolean;
  width?: string;
}

export const DEFAULT_EXCEL_COLUMNS: ExcelColumnDef[] = [
  { id: "orderNumber", key: "orderNumber", label: "#", type: "text", isRemovable: false, order: 0, visible: true, width: "w-9" },
  { id: "fullName", key: "fullName", label: "Membri del NOSTRO EMS", type: "text", isRemovable: false, order: 1, visible: true, width: "min-w-[140px]" },
  { id: "currentRole", key: "currentRole", label: "Ruolo Attuale", type: "role", isRemovable: true, order: 2, visible: true, width: "min-w-[105px]" },
  { id: "newRole", key: "newRole", label: "Nuovo Grado", type: "role", isRemovable: true, order: 3, visible: true, width: "min-w-[120px]" },
  { id: "cdaRole", key: "cdaRole", label: "CDA", type: "badge", isRemovable: true, order: 4, visible: true, width: "min-w-[80px]" },
  { id: "dgsRole", key: "dgsRole", label: "DGS", type: "badge", isRemovable: true, order: 5, visible: true, width: "min-w-[85px]" },
  { id: "leaveStatus", key: "leaveStatus", label: "Assenze / Ferie", type: "leave", isRemovable: true, order: 6, visible: true, width: "min-w-[95px]" },
  { id: "notes", key: "notes", label: "Note", type: "text", isRemovable: true, order: 7, visible: true, width: "min-w-[90px]" },
];

export interface ExcelGerarchiaEntry {
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
  customFields?: Record<string, string>; // Support for user-created custom dynamic columns!
  discordTag?: string;
  badge?: string;
  updatedAt: string;
}

export const GOOGLE_SHEET_GERARCHIA_URL = "https://docs.google.com/spreadsheets/d/1dBCewK_cvU1HeBLrCtH1-HbnsIWW1050DU0332Bd258/edit?gid=0#gid=0";

export interface RoleBadgeStyle {
  style?: CSSProperties;
  className: string;
}

export function getRoleBadgeStyle(roleName: string): RoleBadgeStyle {
  if (!roleName) return { className: "bg-slate-800 text-slate-300 border border-slate-700 font-bold" };
  
  const r = roleName.trim().toLowerCase();
  
  if (r.includes("licenziamento") || r.includes("licenziato")) {
    return { className: "bg-rose-600/30 text-rose-300 border border-rose-500/60 font-black shadow-sm" };
  }
  if (r.includes("aspettativa")) {
    return { className: "bg-emerald-800/30 text-emerald-300 border border-emerald-700/50 font-bold" };
  }
  
  if (r.includes("v. primario di reparto") || r.includes("vice primario di reparto")) {
    return { className: "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold" };
  }
  if (r.includes("primario di reparto")) {
    return { className: "bg-amber-700/20 text-amber-200 border border-amber-600/40 font-bold" };
  }
  if (r === "primario" || r === "primario°") {
    return {
      style: { backgroundColor: "#07095e" },
      className: "text-white font-bold border border-blue-400/40 shadow-sm shadow-blue-950/60",
    };
  }
  if (r.includes("v. primario") || r.includes("vice primario") || r === "v. primario°") {
    return { className: "bg-indigo-500/20 text-indigo-300 border border-indigo-500/40 font-bold" };
  }
  if (r.includes("medico esperto") || r === "medico esperto°") {
    return { className: "bg-teal-500/20 text-teal-300 border border-teal-500/40 font-bold" };
  }
  if (r.includes("medico") || r === "medico°") {
    return { className: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold" };
  }
  if (r.includes("infermiere") || r.includes("infermiero") || r === "infermiere°") {
    return { className: "bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 font-bold" };
  }
  if (r.includes("volontario") || r.includes("volontaria")) {
    return { className: "bg-[#c2410c]/25 text-[#ff7849] border border-[#ea580c]/50 font-bold shadow-xs" };
  }
  if (r.includes("tirocinante") || r.includes("allievo") || r === "tirocinante°") {
    return { className: "bg-lime-500/20 text-lime-300 border border-lime-500/40 font-bold" };
  }
  if (r.includes("v. responsabile") || r.includes("vice responsabile")) {
    return { className: "bg-orange-500/20 text-orange-300 border border-orange-500/40 font-bold" };
  }
  if (r.includes("responsabile del presidio") || r.includes("responsabile presidio")) {
    return { className: "bg-orange-600/20 text-orange-200 border border-orange-600/40 font-bold" };
  }
  if (r.includes("assistente") || r.includes("aiuto")) {
    return { className: "bg-pink-500/20 text-pink-300 border border-pink-500/40 font-bold" };
  }
  if (r.includes("v. supervisore") || r.includes("vice supervisore")) {
    return { className: "bg-pink-600/20 text-pink-200 border border-pink-600/40 font-bold" };
  }
  if (r.includes("supervisore generale")) {
    return { className: "bg-purple-500/20 text-purple-300 border border-purple-500/40 font-bold" };
  }
  if (r.includes("supervisore")) {
    return { className: "bg-rose-500/20 text-rose-300 border border-rose-500/40 font-bold" };
  }
  if (r.includes("segretario")) {
    return { className: "bg-violet-500/20 text-violet-300 border border-violet-500/40 font-bold" };
  }
  if (r.includes("v. direttore") || r.includes("vice direttore")) {
    return { className: "bg-red-500/20 text-red-300 border border-red-500/40 font-bold" };
  }
  if (r.includes("direttore sanitario")) {
    return { className: "bg-red-600/20 text-red-200 border border-red-600/40 font-bold" };
  }
  if (r.includes("direttore generale")) {
    return { className: "bg-cyan-500/20 text-cyan-300 border border-cyan-500/40 font-bold" };
  }
  if (r.includes("proprietario")) {
    return { className: "bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold" };
  }

  return { className: "bg-slate-800 text-slate-300 border border-slate-700 font-bold" };
}


