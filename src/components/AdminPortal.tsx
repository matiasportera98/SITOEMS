import React, { useState, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Lock,
  Unlock,
  Users,
  User,
  Settings,
  FileText,
  Plus,
  Trash2,
  Download,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  LogOut,
  RefreshCw,
  Award,
  ChevronRight,
  TrendingUp,
  BarChart2,
  X,
  Percent,
  Sparkles,
  Calculator,
  Brain,
  Edit2,
  Key,
  Copy,
  ShieldCheck,
  UserCheck,
  History,
  Clock,
  Filter,
  Search,
  ShieldAlert,
  RotateCcw,
} from "lucide-react";
import {
  RoleId,
  Candidate,
  Vote,
  SiteSettings,
  ROLE_IDS_SORTED_ASC,
  ROLE_IDS_SORTED_DESC,
  ROLE_CONFIGS,
  ALLOWED_DISCORD_ROLES,
  DiscordUserSession,
  AccessLog,
  Candidatura,
  CandidaturaStatus,
  CdaProposal,
  CdaProposalType,
  getRoleBadgeStyle,
  getUserEffectiveGrade,
} from "../types.js";
import RoleBadge from "./RoleBadge.js";
import EmsHierarchy from "./EmsHierarchy.js";

interface AdminPortalProps {
  onConfigChanged: () => void;
}

type TabType = "candidates" | "votes" | "analytics" | "tokens" | "logs" | "hierarchy" | "candidature" | "cda_proposals" | "settings";

export default function AdminPortal({ onConfigChanged }: AdminPortalProps) {
  const [token, setToken] = useState<string | null>(() => localStorage.getItem("adminToken"));
  const [password, setPassword] = useState<string>("");
  const [showPassword, setShowPassword] = useState<boolean>(false);
  const [loginError, setLoginError] = useState<string | null>(null);
  const [isLoggingIn, setIsLoggingIn] = useState<boolean>(false);

  // Authenticated state & data
  const [activeTab, setActiveTab] = useState<TabType>("votes");
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [votes, setVotes] = useState<Vote[]>([]);
  const [isLoadingData, setIsLoadingData] = useState<boolean>(false);
  const [dashboardError, setDashboardError] = useState<string | null>(null);

  // Employee Token Management State
  const [employeeTokens, setEmployeeTokens] = useState<DiscordUserSession[]>([]);
  const [isLoadingTokens, setIsLoadingTokens] = useState<boolean>(false);
  const [newEmpFullName, setNewEmpFullName] = useState<string>("");
  const [newEmpRole, setNewEmpRole] = useState<string>("Primario di Reparto");
  const [newEmpCustomToken, setNewEmpCustomToken] = useState<string>("");
  const [newEmpCdaRole, setNewEmpCdaRole] = useState<string>("DEFAULT");
  const [isGeneratingToken, setIsGeneratingToken] = useState<boolean>(false);
  const [tokenActionError, setTokenActionError] = useState<string | null>(null);
  const [tokenSuccessMessage, setTokenSuccessMessage] = useState<string | null>(null);
  const [copiedToken, setCopiedToken] = useState<string | null>(null);

  // TEST Token Generator State (Visible ONLY to Proprietario token)
  const [testEmpFullName, setTestEmpFullName] = useState<string>("");
  const [testEmpRole, setTestEmpRole] = useState<string>("V. Primario di Reparto");
  const [testEmpCdaRole, setTestEmpCdaRole] = useState<string>("DEFAULT");
  const [testEmpCustomToken, setTestEmpCustomToken] = useState<string>("");
  const [testDurationUnit, setTestDurationUnit] = useState<"unlimited" | "minutes" | "hours" | "days">("minutes");
  const [testDurationValue, setTestDurationValue] = useState<number | string>(30);
  const [isGeneratingTestToken, setIsGeneratingTestToken] = useState<boolean>(false);
  const [testTokenError, setTestTokenError] = useState<string | null>(null);
  const [testTokenSuccessMessage, setTestTokenSuccessMessage] = useState<string | null>(null);

  // Edit Employee Token / CDA Role Modal State
  const [editingTokenObj, setEditingTokenObj] = useState<DiscordUserSession | null>(null);
  const [editEmpToken, setEditEmpToken] = useState<string>("");
  const [editEmpFullName, setEditEmpFullName] = useState<string>("");
  const [editEmpRole, setEditEmpRole] = useState<string>("");
  const [editEmpCdaRole, setEditEmpCdaRole] = useState<string>("DEFAULT");
  const [isUpdatingToken, setIsUpdatingToken] = useState<boolean>(false);

  // Confirm Token Revocation Modal State
  const [tokenToConfirmRevoke, setTokenToConfirmRevoke] = useState<DiscordUserSession | null>(null);
  const [isRevokingToken, setIsRevokingToken] = useState<boolean>(false);

  // Session details & permissions
  const [sessionInfo, setSessionInfo] = useState<{
    roleName: string;
    username?: string;
    reviewerName?: string;
    grade: number;
    canManageTokens: boolean;
    isMaster: boolean;
  } | null>(null);

  const getLocalReviewerName = (): string => {
    if (sessionInfo?.username && sessionInfo.username !== "Amministratore" && sessionInfo.username !== "Proprietario (Master)") {
      return sessionInfo.username.replace(/\s*\(.*?\)\s*$/, "").trim();
    }
    const savedSession = localStorage.getItem("discordUserSession");
    if (savedSession) {
      try {
        const parsed = JSON.parse(savedSession);
        if (parsed.username) {
          return parsed.username.replace(/\s*\(.*?\)\s*$/, "").trim();
        }
      } catch (e) {}
    }
    if (sessionInfo?.reviewerName && sessionInfo.reviewerName !== "Amministratore") {
      return sessionInfo.reviewerName.replace(/\s*\(.*?\)\s*$/, "").trim();
    }
    return sessionInfo?.roleName || "Amministratore";
  };

  const getAdminHeaders = (authToken?: string) => {
    const activeToken = authToken || token || localStorage.getItem("adminToken") || "";
    const empToken = localStorage.getItem("discordToken") || "";
    const revName = getLocalReviewerName();

    const headers: Record<string, string> = {
      Authorization: `Bearer ${activeToken}`,
    };
    if (empToken) {
      headers["X-Employee-Token"] = empToken;
    }
    if (revName && revName !== "Amministratore") {
      headers["X-Reviewer-Name"] = revName;
    }
    return headers;
  };

  const isMasterSession = Boolean(sessionInfo?.isMaster);
  const cleanUserRole = (sessionInfo?.roleName || "").toLowerCase();
  const isProprietarioUser = Boolean(
    isMasterSession ||
    (cleanUserRole.includes("proprietario") && !cleanUserRole.includes("vice") && !cleanUserRole.includes("v."))
  );
  const isHighOwner = Boolean(
    isMasterSession ||
    (sessionInfo?.grade !== undefined && sessionInfo.grade >= 99) ||
    cleanUserRole.includes("proprietario")
  );

  const visibleEmployeeTokens = (isProprietarioUser
    ? employeeTokens
    : employeeTokens.filter((emp) => !emp.isMaster && !emp.isTestToken)
  ).sort((a, b) => {
    const gradeA = getUserEffectiveGrade(a);
    const gradeB = getUserEffectiveGrade(b);
    if (gradeB !== gradeA) {
      return gradeB - gradeA;
    }
    return a.username.localeCompare(b.username);
  });

  const [nowMs, setNowMs] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowMs(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  // Manage candidates state
  const [selectedRoleId, setSelectedRoleId] = useState<RoleId>(RoleId.V_PRIMARIO);
  const [newCandidateName, setNewCandidateName] = useState<string>("");
  const [isAddingCandidate, setIsAddingCandidate] = useState<boolean>(false);
  const [candidateActionError, setCandidateActionError] = useState<string | null>(null);
  const [candidateIdToConfirmDelete, setCandidateIdToConfirmDelete] = useState<string | null>(null);
  
  // Custom states for independent candidate list management
  const [candidateSearchQuery, setCandidateSearchQuery] = useState<string>("");
  const [viewMode, setViewMode] = useState<"flat" | "grouped">("flat");
  const [isSavingBulk, setIsSavingBulk] = useState<boolean>(false);
  const [bulkText, setBulkText] = useState<string>("");
  const [isBulkEditing, setIsBulkEditing] = useState<boolean>(false);

  // Manage settings state
  const [editTitle, setEditTitle] = useState<string>("");
  const [editDescription, setEditDescription] = useState<string>("");
  const [editVotingActive, setEditVotingActive] = useState<boolean>(true);
  const [editAllowMultiple, setEditAllowMultiple] = useState<boolean>(true);
  const [editRequireAll, setEditRequireAll] = useState<boolean>(false);
  const [newAdminPassword, setNewAdminPassword] = useState<string>("");
  const [newEmergencyPassword, setNewEmergencyPassword] = useState<string>("");
  const [isSavingSettings, setIsSavingSettings] = useState<boolean>(false);
  const [settingsSuccessMessage, setSettingsSuccessMessage] = useState<string | null>(null);

  // Emergency unlock state
  const [showUnlockForm, setShowUnlockForm] = useState<boolean>(false);
  const [unlockCode, setUnlockCode] = useState<string>("");
  const [showUnlockCode, setShowUnlockCode] = useState<boolean>(false);
  const [unlockError, setUnlockError] = useState<string | null>(null);
  const [isUnlocking, setIsUnlocking] = useState<boolean>(false);

  // Reset votes confirmation modal state
  const [showResetModal, setShowResetModal] = useState<boolean>(false);
  const [resetConfirmText, setResetConfirmText] = useState<string>("");
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [voteIdToConfirmDelete, setVoteIdToConfirmDelete] = useState<string | null>(null);
  const [analyticsSubTab, setAnalyticsSubTab] = useState<"charts" | "hierarchy">("charts");

  // Edit individual candidate state
  const [editingCandidateId, setEditingCandidateId] = useState<string | null>(null);
  const [editingName, setEditingName] = useState<string>("");
  const [editingRoleId, setEditingRoleId] = useState<RoleId | "">("");
  const [isUpdatingCandidate, setIsUpdatingCandidate] = useState<boolean>(false);

  // Access Logs Management State
  const [accessLogs, setAccessLogs] = useState<AccessLog[]>([]);
  const [isLoadingLogs, setIsLoadingLogs] = useState<boolean>(false);
  const [logsFilterText, setLogsFilterText] = useState<string>("");
  const [logsStatusFilter, setLogsStatusFilter] = useState<string>("ALL");
  const [logsCategoryFilter, setLogsCategoryFilter] = useState<string>("ALL");
  const [showClearLogsModal, setShowClearLogsModal] = useState<boolean>(false);
  const [isClearingLogs, setIsClearingLogs] = useState<boolean>(false);

  // Synchronized scrollbars for logs table
  const topLogsScrollRef = useRef<HTMLDivElement>(null);
  const bottomLogsScrollRef = useRef<HTMLDivElement>(null);
  const logsTableRef = useRef<HTMLTableElement>(null);
  const [logsTableWidth, setLogsTableWidth] = useState<number>(0);
  const isSyncingScroll = useRef<boolean>(false);

  useEffect(() => {
    const updateWidth = () => {
      if (logsTableRef.current) {
        setLogsTableWidth(logsTableRef.current.scrollWidth);
      }
    };
    updateWidth();
    const observer = new ResizeObserver(updateWidth);
    if (logsTableRef.current) observer.observe(logsTableRef.current);
    return () => observer.disconnect();
  }, [accessLogs, logsFilterText, logsStatusFilter, logsCategoryFilter, activeTab]);

  const handleTopLogsScroll = () => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (topLogsScrollRef.current && bottomLogsScrollRef.current) {
      bottomLogsScrollRef.current.scrollLeft = topLogsScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  const handleBottomLogsScroll = () => {
    if (isSyncingScroll.current) return;
    isSyncingScroll.current = true;
    if (topLogsScrollRef.current && bottomLogsScrollRef.current) {
      topLogsScrollRef.current.scrollLeft = bottomLogsScrollRef.current.scrollLeft;
    }
    requestAnimationFrame(() => {
      isSyncingScroll.current = false;
    });
  };

  // Candidature Management State
  const [candidatureList, setCandidatureList] = useState<Candidatura[]>([]);
  const [isLoadingCandidature, setIsLoadingCandidature] = useState<boolean>(false);
  const [candidatureFilterStatus, setCandidatureFilterStatus] = useState<"ALL" | "PENDING" | "APPROVED" | "REJECTED">("ALL");

  // Rejection modal state
  const [rejectingCandidatura, setRejectingCandidatura] = useState<Candidatura | null>(null);
  const [rejectionReasonInput, setRejectionReasonInput] = useState<string>("");
  const [rejectModalError, setRejectModalError] = useState<string | null>(null);
  const [isSubmittingRejection, setIsSubmittingRejection] = useState<boolean>(false);

  // Deleting candidature modal state
  const [deletingCandidatura, setDeletingCandidatura] = useState<Candidatura | null>(null);
  const [isDeletingCandidatura, setIsDeletingCandidatura] = useState<boolean>(false);
  const [deleteCandidaturaError, setDeleteCandidaturaError] = useState<string | null>(null);

  // Approval state
  const [approvingId, setApprovingId] = useState<string | null>(null);

  // Reset to voting state
  const [resettingModalCandidatura, setResettingModalCandidatura] = useState<Candidatura | null>(null);
  const [isSubmittingReset, setIsSubmittingReset] = useState<boolean>(false);
  const [resetModalError, setResetModalError] = useState<string | null>(null);

  // CDA Proposals Management State
  const [cdaProposalsList, setCdaProposalsList] = useState<CdaProposal[]>([]);
  const [isLoadingCdaProposals, setIsLoadingCdaProposals] = useState<boolean>(false);
  const [cdaProposalsFilterStatus, setCdaProposalsFilterStatus] = useState<"ALL" | "PENDING" | "IN_VOTING" | "APPROVED" | "REJECTED">("ALL");

  const [approvingProposalId, setApprovingProposalId] = useState<string | null>(null);
  const [rejectingProposal, setRejectingProposal] = useState<CdaProposal | null>(null);
  const [rejectionProposalReasonInput, setRejectionProposalReasonInput] = useState<string>("");
  const [rejectProposalModalError, setRejectProposalModalError] = useState<string | null>(null);
  const [isSubmittingProposalRejection, setIsSubmittingProposalRejection] = useState<boolean>(false);

  const [resettingProposalModal, setResettingProposalModal] = useState<CdaProposal | null>(null);
  const [isSubmittingProposalReset, setIsSubmittingProposalReset] = useState<boolean>(false);
  const [resetProposalModalError, setResetProposalModalError] = useState<string | null>(null);

  const [deletingProposal, setDeletingProposal] = useState<CdaProposal | null>(null);
  const [isDeletingProposal, setIsDeletingProposal] = useState<boolean>(false);
  const [deleteProposalError, setDeleteProposalError] = useState<string | null>(null);

  const handleOpenResetModal = (cand: Candidatura) => {
    setResettingModalCandidatura(cand);
    setResetModalError(null);
  };

  const handleConfirmResetCandidatura = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!resettingModalCandidatura) return;

    const activeToken = token || localStorage.getItem("adminToken") || "";
    if (!activeToken) {
      setResetModalError("Token di autenticazione non trovato. Effettua il login.");
      return;
    }

    setIsSubmittingReset(true);
    setResetModalError(null);

    try {
      const response = await fetch(`/api/admin/candidature/${encodeURIComponent(resettingModalCandidatura.id)}/reset`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(activeToken),
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile risettare la candidatura.");
      }

      setResettingModalCandidatura(null);
      fetchCandidature(activeToken);
      fetchAccessLogs(activeToken);
    } catch (err: any) {
      setResetModalError(err.message || "Errore durante il reset della candidatura.");
    } finally {
      setIsSubmittingReset(false);
    }
  };

  const fetchCandidature = async (authToken?: string, isSilent = false) => {
    const useToken = authToken || token;
    if (!useToken) return;
    if (!isSilent) setIsLoadingCandidature(true);
    try {
      const response = await fetch("/api/admin/candidature", {
        headers: getAdminHeaders(useToken),
      });
      const data = await response.json();
      if (response.ok && data.candidature) {
        setCandidatureList(data.candidature);
      }
    } catch (err) {
      console.error("Errore recupero candidature:", err);
    } finally {
      if (!isSilent) setIsLoadingCandidature(false);
    }
  };

  const fetchCdaProposals = async (authToken?: string, isSilent = false) => {
    const useToken = authToken || token;
    if (!useToken) return;
    if (!isSilent) setIsLoadingCdaProposals(true);
    try {
      const response = await fetch("/api/admin/cda-proposals", {
        headers: getAdminHeaders(useToken),
      });
      const data = await response.json();
      if (response.ok && Array.isArray(data.proposals)) {
        setCdaProposalsList(data.proposals);
      }
    } catch (err) {
      console.error("Errore recupero proposte CDA:", err);
    } finally {
      if (!isSilent) setIsLoadingCdaProposals(false);
    }
  };

  const handleApproveCdaProposal = async (proposalId: string) => {
    const activeToken = token || localStorage.getItem("adminToken") || "";
    if (!activeToken) return;

    setApprovingProposalId(proposalId);
    try {
      const response = await fetch(`/api/admin/cda-proposals/${encodeURIComponent(proposalId)}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(activeToken),
        },
        body: JSON.stringify({ reviewerName: getLocalReviewerName() }),
      });

      const data = await response.json();
      if (!response.ok) {
        alert(data.error || "Impossibile approvare la proposta CDA.");
      } else {
        fetchCdaProposals(activeToken, true);
        fetchAccessLogs(activeToken, true);
      }
    } catch (err) {
      console.error("Error approving CDA proposal:", err);
      alert("Errore di connessione durante l'approvazione della proposta CDA.");
    } finally {
      setApprovingProposalId(null);
    }
  };

  const handleConfirmRejectCdaProposal = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!rejectingProposal) return;

    const activeToken = token || localStorage.getItem("adminToken") || "";
    if (!activeToken) {
      setRejectProposalModalError("Token di autenticazione non trovato. Effettua il login.");
      return;
    }

    setIsSubmittingProposalRejection(true);
    setRejectProposalModalError(null);

    try {
      const response = await fetch(`/api/admin/cda-proposals/${encodeURIComponent(rejectingProposal.id)}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(activeToken),
        },
        body: JSON.stringify({
          reason: rejectionProposalReasonInput.trim(),
          reviewerName: getLocalReviewerName(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setRejectProposalModalError(data.error || "Impossibile rifiutare la proposta CDA.");
      } else {
        setRejectingProposal(null);
        setRejectionProposalReasonInput("");
        fetchCdaProposals(activeToken, true);
        fetchAccessLogs(activeToken, true);
      }
    } catch (err: any) {
      setRejectProposalModalError("Errore di rete durante il rifiuto della proposta CDA.");
    } finally {
      setIsSubmittingProposalRejection(false);
    }
  };

  const handleConfirmResetCdaProposal = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!resettingProposalModal) return;

    const activeToken = token || localStorage.getItem("adminToken") || "";
    if (!activeToken) {
      setResetProposalModalError("Token di autenticazione non trovato. Effettua il login.");
      return;
    }

    setIsSubmittingProposalReset(true);
    setResetProposalModalError(null);

    try {
      const response = await fetch(`/api/admin/cda-proposals/${encodeURIComponent(resettingProposalModal.id)}/reset-voting`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(activeToken),
        },
        body: JSON.stringify({
          reviewer: getLocalReviewerName(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setResetProposalModalError(data.error || "Impossibile resettare la votazione della proposta CDA.");
      } else {
        setResettingProposalModal(null);
        fetchCdaProposals(activeToken, true);
        fetchAccessLogs(activeToken, true);
      }
    } catch (err: any) {
      setResetProposalModalError("Errore di rete durante il reset della votazione.");
    } finally {
      setIsSubmittingProposalReset(false);
    }
  };

  const handleConfirmResetPreEvaluation = async () => {
    if (!resettingProposalModal) return;

    const activeToken = token || localStorage.getItem("adminToken") || "";
    if (!activeToken) {
      setResetProposalModalError("Token di autenticazione non trovato. Effettua il login.");
      return;
    }

    setIsSubmittingProposalReset(true);
    setResetProposalModalError(null);

    try {
      const response = await fetch(`/api/admin/cda-proposals/${encodeURIComponent(resettingProposalModal.id)}/reset-pre-evaluation`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(activeToken),
        },
        body: JSON.stringify({
          reviewer: getLocalReviewerName(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setResetProposalModalError(data.error || "Impossibile rimandare la proposta in pre-valutazione.");
      } else {
        setResettingProposalModal(null);
        fetchCdaProposals(activeToken, true);
        fetchAccessLogs(activeToken, true);
      }
    } catch (err: any) {
      setResetProposalModalError("Errore di rete durante il ripristino in pre-valutazione.");
    } finally {
      setIsSubmittingProposalReset(false);
    }
  };

  const handleConfirmDeleteCdaProposal = async () => {
    if (!deletingProposal) return;

    const activeToken = token || localStorage.getItem("adminToken") || "";
    if (!activeToken) {
      setDeleteProposalError("Token di autenticazione non trovato.");
      return;
    }

    setIsDeletingProposal(true);
    setDeleteProposalError(null);

    try {
      const response = await fetch(`/api/admin/cda-proposals/${encodeURIComponent(deletingProposal.id)}`, {
        method: "DELETE",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(activeToken),
        },
        body: JSON.stringify({
          reviewer: getLocalReviewerName(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        setDeleteProposalError(data.error || "Impossibile eliminare la proposta CDA.");
      } else {
        setDeletingProposal(null);
        fetchCdaProposals(activeToken, true);
        fetchAccessLogs(activeToken, true);
      }
    } catch (err: any) {
      setDeleteProposalError("Errore durante l'eliminazione della proposta CDA.");
    } finally {
      setIsDeletingProposal(false);
    }
  };

  const handleApproveCandidatura = async (id: string) => {
    const activeToken = token || localStorage.getItem("adminToken") || "";
    if (!activeToken) {
      alert("Token di autenticazione non trovato. Effettua il login.");
      return;
    }
    const reviewerName = getLocalReviewerName();
    setApprovingId(id);
    try {
      const response = await fetch(`/api/admin/candidature/${encodeURIComponent(id)}/approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(activeToken),
        },
        body: JSON.stringify({
          reviewerName,
        }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile approvare la candidatura.");
      }
      fetchCandidature(activeToken);
      fetchAccessLogs(activeToken);
    } catch (err: any) {
      alert(err.message || "Errore durante l'approvazione.");
    } finally {
      setApprovingId(null);
    }
  };

  const handleOpenRejectModal = (cand: Candidatura) => {
    setRejectingCandidatura(cand);
    setRejectionReasonInput("");
    setRejectModalError(null);
  };

  const handleConfirmRejectCandidatura = async (e: React.FormEvent) => {
    e.preventDefault();
    const activeToken = token || localStorage.getItem("adminToken") || "";
    if (!activeToken || !rejectingCandidatura) return;

    setRejectModalError(null);
    const isProprietario = isMasterSession || sessionInfo?.roleName.toLowerCase().includes("proprietario");

    if (!isProprietario && !rejectionReasonInput.trim()) {
      setRejectModalError("Motivo del rifiuto obbligatorio per gli amministratori. Digita una motivazione.");
      return;
    }

    const reviewerName = getLocalReviewerName();
    setIsSubmittingRejection(true);
    try {
      const response = await fetch(`/api/admin/candidature/${encodeURIComponent(rejectingCandidatura.id)}/reject`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(activeToken),
        },
        body: JSON.stringify({
          reason: rejectionReasonInput.trim(),
          reviewerName,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile rifiutare la candidatura.");
      }

      setRejectingCandidatura(null);
      setRejectionReasonInput("");
      fetchCandidature(activeToken);
      fetchAccessLogs(activeToken);
    } catch (err: any) {
      setRejectModalError(err.message || "Errore durante il rifiuto.");
    } finally {
      setIsSubmittingRejection(false);
    }
  };

  const handleOpenDeleteCandidaturaModal = (cand: Candidatura) => {
    setDeletingCandidatura(cand);
    setDeleteCandidaturaError(null);
  };

  const handleConfirmDeleteCandidatura = async () => {
    if (!deletingCandidatura) return;
    const activeToken = token || localStorage.getItem("adminToken") || "";
    if (!activeToken) {
      setDeleteCandidaturaError("Token di autenticazione non trovato. Effettua il login.");
      return;
    }

    setIsDeletingCandidatura(true);
    setDeleteCandidaturaError(null);
    try {
      const response = await fetch(`/api/admin/candidature/${encodeURIComponent(deletingCandidatura.id)}`, {
        method: "DELETE",
        headers: getAdminHeaders(activeToken),
      });
      const data = await response.json();
      if (response.ok) {
        setCandidatureList((prev) => prev.filter((c) => c.id !== deletingCandidatura.id));
        setDeletingCandidatura(null);
        fetchAccessLogs(activeToken);
      } else {
        setDeleteCandidaturaError(data.error || "Impossibile eliminare la candidatura.");
      }
    } catch (err: any) {
      console.error("Errore durante la cancellazione:", err);
      setDeleteCandidaturaError(err.message || "Errore di connessione durante la cancellazione.");
    } finally {
      setIsDeletingCandidatura(false);
    }
  };

  // Fetch access logs
  const fetchAccessLogs = async (authToken?: string, isSilent = false) => {
    const useToken = authToken || token;
    if (!useToken) return;
    if (!isSilent) setIsLoadingLogs(true);
    try {
      const response = await fetch("/api/admin/access-logs", {
        headers: getAdminHeaders(useToken),
      });
      const data = await response.json();
      if (response.ok && data.logs) {
        setAccessLogs(data.logs);
      }
    } catch (err) {
      console.error("Errore recupero log degli accessi:", err);
    } finally {
      if (!isSilent) setIsLoadingLogs(false);
    }
  };

  // Clear access logs
  const handleClearAccessLogs = async () => {
    if (!token) return;
    setIsClearingLogs(true);
    try {
      const response = await fetch("/api/admin/access-logs", {
        method: "DELETE",
        headers: getAdminHeaders(token),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile svuotare i log.");
      }
      setAccessLogs([]);
      setShowClearLogsModal(false);
    } catch (err: any) {
      alert(err.message || "Errore durante lo svuotamento dei log.");
    } finally {
      setIsClearingLogs(false);
    }
  };

  // Fetch session details & permissions
  const fetchSessionInfo = async (authToken?: string) => {
    const useToken = authToken || token;
    if (!useToken) return;
    try {
      const response = await fetch("/api/admin/session-info", {
        headers: getAdminHeaders(useToken),
      });
      const data = await response.json();
      if (response.ok && data.success) {
        setSessionInfo({
          roleName: data.roleName,
          username: data.username,
          reviewerName: data.reviewerName,
          grade: data.grade,
          canManageTokens: data.canManageTokens,
          isMaster: data.isMaster,
        });
      }
    } catch (err) {
      console.error("Errore recupero session info:", err);
    }
  };

  // Fetch employee tokens
  const fetchEmployeeTokens = async (authToken?: string, isSilent = false) => {
    const useToken = authToken || token;
    if (!useToken) return;
    if (!isSilent) setIsLoadingTokens(true);
    try {
      const response = await fetch("/api/admin/employee-tokens", {
        headers: getAdminHeaders(useToken),
      });
      const data = await response.json();
      if (response.ok && data.tokens) {
        setEmployeeTokens(data.tokens);
      } else if (response.status === 403) {
        setEmployeeTokens([]);
      }
    } catch (err) {
      console.error("Errore recupero token dipendenti:", err);
    } finally {
      if (!isSilent) setIsLoadingTokens(false);
    }
  };

  // Fetch admin dashboard data
  const fetchDashboardData = async (authToken: string, isSilent = false) => {
    if (!isSilent) setIsLoadingData(true);
    try {
      const response = await fetch("/api/admin/dashboard", {
        headers: getAdminHeaders(authToken),
      });
      const data = await response.json();
      if (!response.ok) {
        if (response.status === 401) {
          // Do not logout if token is Master Secret Token
          if (isMasterSession) {
            console.warn("Ricevuto 401 per token master, ignoro il logout.");
          } else {
            handleLogout();
            throw new Error("Sessione scaduta. Effettua di nuovo il login.");
          }
        }
        throw new Error(data.error || "Impossibile caricare i dati.");
      }

      setSettings(data.settings);
      setCandidates(data.candidates);
      setVotes(data.votes);

      // Initialize edit fields only on explicit initial load
      if (!isSilent) {
        setEditTitle(data.settings.title);
        setEditDescription(data.settings.description);
        setEditVotingActive(data.settings.votingActive);
        setEditAllowMultiple(data.settings.allowMultipleSelection);
        setEditRequireAll(data.settings.requireAllRoles);
        setDashboardError(null);
      }

      // Also fetch session info, employee tokens, access logs, and candidature
      fetchSessionInfo(authToken);
      fetchEmployeeTokens(authToken, isSilent);
      fetchAccessLogs(authToken, isSilent);
      fetchCandidature(authToken, isSilent);
      fetchCdaProposals(authToken, isSilent);
    } catch (err: any) {
      if (!isSilent) setDashboardError(err.message || "Errore di caricamento.");
    } finally {
      if (!isSilent) setIsLoadingData(false);
    }
  };

  // Generate Employee Token Handler
  const handleGenerateEmployeeToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setTokenActionError(null);
    setTokenSuccessMessage(null);

    if (sessionInfo && !sessionInfo.canManageTokens) {
      setTokenActionError("Accesso riservato: Solo il personale con grado da V. Direttore in su può generare token.");
      return;
    }

    if (!newEmpFullName.trim()) {
      setTokenActionError("Inserisci Nome e Cognome del dipendente.");
      return;
    }

    setIsGeneratingToken(true);
    try {
      const cdaRoleVal = newEmpCdaRole === "DEFAULT" ? undefined : newEmpCdaRole;
      const hasCdaVal = newEmpCdaRole === "DEFAULT" ? undefined : true;

      const response = await fetch("/api/admin/employee-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: newEmpFullName.trim(),
          roleName: newEmpRole,
          customToken: newEmpCustomToken.trim() || undefined,
          cdaRoleName: cdaRoleVal,
          hasCdaAccess: hasCdaVal,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile generare il token.");
      }

      setTokenSuccessMessage(data.message);
      setNewEmpFullName("");
      setNewEmpCustomToken("");
      setNewEmpCdaRole("DEFAULT");
      fetchEmployeeTokens(token!);
    } catch (err: any) {
      setTokenActionError(err.message || "Errore durante la generazione.");
    } finally {
      setIsGeneratingToken(false);
    }
  };

  // Generate TEST Token Handler (Only Proprietario Token Allowed)
  const handleGenerateTestToken = async (e: React.FormEvent) => {
    e.preventDefault();
    setTestTokenError(null);
    setTestTokenSuccessMessage(null);

    if (!isProprietarioUser) {
      setTestTokenError("Accesso riservato: Solo la Proprietà può generare Token TEST.");
      return;
    }

    if (!testEmpFullName.trim()) {
      setTestTokenError("Inserisci il Nome / Etichetta per il Token TEST.");
      return;
    }

    setIsGeneratingTestToken(true);
    try {
      const cdaRoleVal = testEmpCdaRole === "DEFAULT" ? undefined : testEmpCdaRole;

      const response = await fetch("/api/admin/test-tokens", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          fullName: testEmpFullName.trim(),
          roleName: testEmpRole,
          cdaRoleName: cdaRoleVal,
          customToken: testEmpCustomToken.trim() || undefined,
          durationUnit: testDurationUnit,
          durationValue: testDurationUnit === "unlimited" ? undefined : Number(testDurationValue),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile generare il token TEST.");
      }

      setTestTokenSuccessMessage(data.message);
      setTestEmpFullName("");
      setTestEmpCustomToken("");
      setTestEmpCdaRole("DEFAULT");
      fetchEmployeeTokens(token!);
    } catch (err: any) {
      setTestTokenError(err.message || "Errore durante la generazione del token TEST.");
    } finally {
      setIsGeneratingTestToken(false);
    }
  };

  // Start Editing Token / CDA Access
  const handleStartEditToken = (empToken: DiscordUserSession) => {
    setEditingTokenObj(empToken);
    setEditEmpToken(empToken.token);
    setEditEmpFullName(empToken.username);
    setEditEmpRole(empToken.roleName);
    if (empToken.cdaRoleName) {
      setEditEmpCdaRole(empToken.cdaRoleName);
    } else {
      setEditEmpCdaRole("DEFAULT");
    }
  };

  // Save Updated Token Permissions
  const handleSaveTokenPermissions = async () => {
    if (!editingTokenObj) return;
    setIsUpdatingToken(true);
    setTokenActionError(null);
    setTokenSuccessMessage(null);

    const activeToken = token || localStorage.getItem("adminToken") || "";

    try {
      const cdaRoleVal = editEmpCdaRole === "DEFAULT" ? "" : editEmpCdaRole;
      const hasCdaVal = editEmpCdaRole === "DEFAULT" ? false : true;

      const response = await fetch(`/api/admin/employee-tokens/${encodeURIComponent(editingTokenObj.token)}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          ...getAdminHeaders(activeToken),
        },
        body: JSON.stringify({
          newToken: editEmpToken.trim().toUpperCase(),
          fullName: editEmpFullName.trim(),
          roleName: editEmpRole,
          cdaRoleName: cdaRoleVal,
          hasCdaAccess: hasCdaVal,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile aggiornare i permessi del token.");
      }

      setTokenSuccessMessage(data.message);
      setEditingTokenObj(null);

      const newTokenStr = data.token || activeToken;
      if (activeToken.toUpperCase() === editingTokenObj.token.toUpperCase() && data.token) {
        setToken(data.token);
        localStorage.setItem("adminToken", data.token);
        fetchEmployeeTokens(data.token);
      } else {
        fetchEmployeeTokens(activeToken);
      }
    } catch (err: any) {
      setTokenActionError(err.message || "Errore durante l'aggiornamento.");
    } finally {
      setIsUpdatingToken(false);
    }
  };

  // Revoke Token Handler
  const handleRevokeToken = async (tokenToRevoke: string) => {
    setTokenActionError(null);
    if (sessionInfo && !sessionInfo.canManageTokens) {
      setTokenActionError("Accesso riservato: Solo il personale con grado da V. Direttore in su può revocare token.");
      return;
    }
    const targetTokenObj = employeeTokens.find((emp) => emp.token.toUpperCase() === tokenToRevoke.toUpperCase());
    if (targetTokenObj?.isMaster) {
      setTokenActionError("Il Token Master è permanente e non può essere eliminato.");
      return;
    }
    try {
      const response = await fetch(`/api/admin/employee-tokens/${encodeURIComponent(tokenToRevoke)}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile revocare il token.");
      }

      setEmployeeTokens((prev) => prev.filter((t) => t.token.toUpperCase() !== tokenToRevoke.toUpperCase()));
    } catch (err: any) {
      setTokenActionError(err.message || "Errore durante la revoca.");
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    setCopiedToken(text);
    setTimeout(() => setCopiedToken(null), 2000);
  };

  useEffect(() => {
    if (!token) return;

    // Initial load
    fetchDashboardData(token, false);

    // Continuous real-time background polling for access logs & admin updates (every 2.5s)
    const pollInterval = setInterval(() => {
      fetchDashboardData(token, true);
    }, 2500);

    return () => clearInterval(pollInterval);
  }, [token]);

  // Handle Login
  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoginError(null);
    setIsLoggingIn(true);

    const empToken = localStorage.getItem("discordToken") || "";
    const reviewerName = getLocalReviewerName();

    try {
      const response = await fetch("/api/admin/login", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(empToken ? { "X-Employee-Token": empToken } : {}),
          ...(reviewerName ? { "X-Reviewer-Name": reviewerName } : {}),
        },
        body: JSON.stringify({ password, employeeToken: empToken, reviewerName }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Password non corretta.");
      }

      localStorage.setItem("adminToken", data.token);
      if (data.isMaster || data.sessionInfo?.isMaster) {
        localStorage.setItem("discordToken", data.token);
        if (data.sessionInfo) {
          localStorage.setItem("discordUserSession", JSON.stringify(data.sessionInfo));
        }
      }
      setToken(data.token);
      setPassword("");
      fetchSessionInfo(data.token);
    } catch (err: any) {
      setLoginError(err.message || "Errore del server.");
    } finally {
      setIsLoggingIn(false);
    }
  };

  // Handle Emergency Unlock
  const handleEmergencyUnlock = async (e: React.FormEvent) => {
    e.preventDefault();
    setUnlockError(null);
    if (!unlockCode.trim()) return;

    setIsUnlocking(true);
    try {
      const response = await fetch("/api/admin/unlock", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ unlockCode: unlockCode.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Password di sblocco d'emergenza non valida.");
      }

      localStorage.setItem("adminToken", data.token);
      setToken(data.token);
      setUnlockCode("");
      setLoginError(null);
      setShowUnlockForm(false);
    } catch (err: any) {
      setUnlockError(err.message || "Errore durante lo sblocco.");
    } finally {
      setIsUnlocking(false);
    }
  };

  // Handle Logout
  const handleLogout = async () => {
    if (token) {
      fetch("/api/admin/logout", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
      }).catch(() => {});
    }
    localStorage.removeItem("adminToken");
    setToken(null);
    setSettings(null);
    setCandidates([]);
    setVotes([]);
  };

  // Handle Add Candidate
  const handleAddCandidate = async (e: React.FormEvent) => {
    e.preventDefault();
    setCandidateActionError(null);
    if (!newCandidateName.trim()) return;

    setIsAddingCandidate(true);
    try {
      const response = await fetch("/api/admin/candidates", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ roleId: selectedRoleId, name: newCandidateName.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile aggiungere il candidato.");
      }

      setNewCandidateName("");
      // Refresh local candidates
      setCandidates((prev) => [...prev, data.candidate]);
      onConfigChanged(); // Notify main app
    } catch (err: any) {
      setCandidateActionError(err.message || "Qualcosa è andato storto.");
    } finally {
      setIsAddingCandidate(false);
    }
  };

  // Handle Delete Candidate
  const handleDeleteCandidate = async (id: string) => {
    const activeToken = token || localStorage.getItem("adminToken") || "";
    setCandidateActionError(null);
    setCandidateIdToConfirmDelete(null);

    try {
      const response = await fetch(`/api/admin/candidates/${id}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${activeToken}` },
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile rimuovere il candidato.");
      }

      // Update local state
      setCandidates((prev) => prev.filter((c) => c.id !== id));
      onConfigChanged(); // Notify main app
    } catch (err: any) {
      setCandidateActionError(err.message || "Impossibile rimuovere il candidato.");
    }
  };

  // Handle Edit/Update Candidate
  const handleUpdateCandidate = async (id: string) => {
    if (!editingName.trim()) {
      setCandidateActionError("Il nome non può essere vuoto.");
      return;
    }
    if (!editingRoleId) {
      setCandidateActionError("Devi selezionare un ruolo valido.");
      return;
    }

    setIsUpdatingCandidate(true);
    setCandidateActionError(null);

    try {
      const response = await fetch(`/api/admin/candidates/${id}`, {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ name: editingName.trim(), roleId: editingRoleId }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile aggiornare il candidato.");
      }

      // Update local state
      setCandidates((prev) =>
        prev.map((c) => (c.id === id ? data.candidate : c))
      );
      setEditingCandidateId(null);
      setEditingName("");
      setEditingRoleId("");
      onConfigChanged(); // Notify main app
    } catch (err: any) {
      setCandidateActionError(err.message || "Qualcosa è andato storto durante l'aggiornamento.");
    } finally {
      setIsUpdatingCandidate(false);
    }
  };

  const startEditingCandidate = (cand: Candidate) => {
    setEditingCandidateId(cand.id);
    setEditingName(cand.name);
    setEditingRoleId(cand.roleId);
    setCandidateActionError(null);
  };

  const cancelEditingCandidate = () => {
    setEditingCandidateId(null);
    setEditingName("");
    setEditingRoleId("");
  };

  // Handle Save Candidates Bulk
  const handleSaveBulkCandidates = async () => {
    setCandidateActionError(null);
    setIsSavingBulk(true);

    try {
      const names = bulkText
        .split("\n")
        .map((line) => line.trim())
        .filter((line) => line.length > 0);

      const response = await fetch("/api/admin/candidates/bulk", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({ names }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile aggiornare la lista dei candidati.");
      }

      setCandidates(data.candidates);
      setIsBulkEditing(false);
      onConfigChanged(); // Notify main app
    } catch (err: any) {
      setCandidateActionError(err.message || "Impossibile aggiornare.");
    } finally {
      setIsSavingBulk(false);
    }
  };

  const handleOpenBulkEdit = () => {
    const names = candidates.map((c) => c.name).join("\n");
    setBulkText(names);
    setIsBulkEditing(true);
  };

  // Handle Save Settings
  const handleSaveSettings = async (e: React.FormEvent) => {
    e.preventDefault();
    setSettingsSuccessMessage(null);
    setIsSavingSettings(true);

    try {
      const response = await fetch("/api/admin/settings", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${token}`,
        },
        body: JSON.stringify({
          title: editTitle,
          description: editDescription,
          votingActive: editVotingActive,
          allowMultipleSelection: editAllowMultiple,
          requireAllRoles: editRequireAll,
          newPassword: newAdminPassword.trim().length >= 6 ? newAdminPassword.trim() : undefined,
          newEmergencyPassword: newEmergencyPassword.trim().length >= 6 ? newEmergencyPassword.trim() : undefined,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile salvare le impostazioni.");
      }

      setSettings(data.settings);
      setNewAdminPassword("");
      setNewEmergencyPassword("");
      setSettingsSuccessMessage("Impostazioni salvate con successo!");
      onConfigChanged(); // Notify main app
      
      // Clear success message after 4s
      setTimeout(() => setSettingsSuccessMessage(null), 4000);
    } catch (err: any) {
      alert(err.message || "Errore nel salvataggio.");
    } finally {
      setIsSavingSettings(false);
    }
  };

  // Handle Reset All Votes
  const REQUIRED_RESET_PHRASE = "CONFERMA AZZERA DATI CON IL TOKEN DI PROPRIETARIO MASTER";

  const handleResetVotes = async () => {
    if (resetConfirmText.trim().toUpperCase() !== REQUIRED_RESET_PHRASE) {
      alert("Testo di conferma non valido. Inserire la frase di conferma richiesta.");
      return;
    }

    setIsResetting(true);
    try {
      const response = await fetch("/api/admin/votes/clear", {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });

      if (!response.ok) {
        throw new Error("Errore durante la cancellazione.");
      }

      setVotes([]);
      setShowResetModal(false);
      setResetConfirmText("");
      alert("Tutti i voti sono stati cancellati correttamente.");
    } catch (err: any) {
      alert(err.message || "Impossibile resettare i voti.");
    } finally {
      setIsResetting(false);
    }
  };

  // Handle Delete Individual Vote
  const handleDeleteVote = async (voteId: string) => {
    const activeToken = token || localStorage.getItem("adminToken") || "";
    try {
      const response = await fetch(`/api/admin/votes/${voteId}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${activeToken}` },
      });

      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "Errore durante l'eliminazione del voto.");
      }

      setVotes((prev) => prev.filter((v) => v.id !== voteId));
      setVoteIdToConfirmDelete(null);
      onConfigChanged(); // Notify main app
    } catch (err: any) {
      console.error(err);
    }
  };

  // Helper to compute stats
  const computeStats = () => {
    const totalVotes = votes.length;
    if (totalVotes === 0) return null;

    // Count votes per candidate per role
    const statsMap: Record<RoleId, Record<string, number>> = {} as any;
    Object.values(RoleId).forEach((r) => {
      statsMap[r] = {};
    });

    votes.forEach((vote) => {
      Object.entries(vote.selections).forEach(([roleKey, candidatesList]) => {
        const roleId = roleKey as RoleId;
        if (Array.isArray(candidatesList)) {
          candidatesList.forEach((candName) => {
            statsMap[roleId][candName] = (statsMap[roleId][candName] || 0) + 1;
          });
        }
      });
    });

    // Extract winners per role
    const winners: Record<RoleId, { name: string; count: number }[]> = {} as any;
    Object.values(RoleId).forEach((roleId) => {
      const roleVotes = statsMap[roleId] || {};
      const sorted = Object.entries(roleVotes)
        .map(([name, count]) => ({ name, count }))
        .sort((a, b) => b.count - a.count);
      winners[roleId] = sorted;
    });

    return {
      totalVotes,
      winners,
    };
  };

  const stats = computeStats();

  const filteredAccessLogs = accessLogs.filter((log) => {
    if (logsCategoryFilter !== "ALL" && log.category !== logsCategoryFilter) {
      return false;
    }
    if (logsStatusFilter !== "ALL" && log.status !== logsStatusFilter) {
      return false;
    }
    if (!logsFilterText.trim()) return true;
    const q = logsFilterText.toLowerCase();
    return (
      (log.username && log.username.toLowerCase().includes(q)) ||
      (log.roleName && log.roleName.toLowerCase().includes(q)) ||
      (log.action && log.action.toLowerCase().includes(q)) ||
      (log.ip && log.ip.toLowerCase().includes(q)) ||
      (log.token && log.token.toLowerCase().includes(q)) ||
      (log.details && log.details.toLowerCase().includes(q))
    );
  });

  const pendingCandidatureCount = candidatureList.filter((c) => c.status === "PENDING").length;

  const filteredCandidatureList = candidatureList.filter((cand) => {
    if (candidatureFilterStatus === "ALL") return true;
    return cand.status === candidatureFilterStatus;
  });

  const pendingProposalsCount = cdaProposalsList.filter(
    (p) => p.status === "PENDING_COSIGNERS" || p.status === "PENDING_REVISION" || p.status === "IN_VOTING" || p.status === "PENDING"
  ).length;

  const filteredCdaProposals = cdaProposalsList.filter((prop) => {
    if (cdaProposalsFilterStatus === "ALL") return true;
    if (cdaProposalsFilterStatus === "PENDING") {
      return prop.status === "PENDING" || prop.status === "PENDING_COSIGNERS" || prop.status === "PENDING_REVISION";
    }
    if (cdaProposalsFilterStatus === "REJECTED") {
      return prop.status === "REJECTED" || prop.status === "RETURNED" || prop.status === "CANCELLED";
    }
    return prop.status === cdaProposalsFilterStatus;
  });

  // LOGIN SCREEN
  if (!token) {
    return (
      <div className="max-w-md mx-auto my-12 px-4" id="admin-login-container">
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#161618] rounded-xl border border-white/5 shadow-xl overflow-hidden"
        >
          {/* Top colored strip */}
          <div className="h-2 bg-indigo-600" />

          <form onSubmit={handleLogin} className="p-6 md:p-8 space-y-6">
            <div className="text-center">
              <div className="mx-auto w-12 h-12 bg-white/5 border border-white/10 rounded-lg flex items-center justify-center text-indigo-400 mb-3 shadow-inner">
                <Lock size={22} />
              </div>
              <h1 className="text-xl font-bold text-white">Area Amministratore</h1>
              <p className="text-slate-400 text-xs mt-1 leading-relaxed">
                Autenticazione richiesta per modificare candidati, gestire impostazioni ed esportare il database dei voti.
              </p>
            </div>

            {loginError && (
              <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-200 text-xs flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-red-400" />
                <span>{loginError}</span>
              </div>
            )}

            <div className="space-y-1.5">
              <label htmlFor="admin-password" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Password Amministrazione
              </label>
              <div className="relative">
                <input
                  id="admin-password"
                  type={showPassword ? "text" : "password"}
                  required
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Inserisci password d'accesso"
                  className="w-full pl-3 pr-10 py-3 bg-[#0A0A0B] border border-white/10 rounded-lg text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium text-sm transition-colors"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center text-slate-500 hover:text-slate-300 cursor-pointer"
                >
                  {showPassword ? <EyeOff size={18} /> : <Eye size={18} />}
                </button>
              </div>
              <p className="text-[10px] text-slate-500 italic">
                Nota: Se è la prima configurazione, la password predefinita è <span className="font-semibold text-slate-400 select-all">admin123</span>.
              </p>
            </div>

            <button
              type="submit"
              disabled={isLoggingIn}
              className={`w-full py-3 rounded-lg text-white font-semibold text-sm cursor-pointer flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 shadow-md shadow-indigo-950/40 transition-colors ${
                isLoggingIn ? "opacity-50 cursor-wait" : ""
              }`}
            >
              {isLoggingIn ? (
                <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
              ) : (
                <>
                  <Unlock size={16} />
                  <span>Accedi</span>
                </>
              )}
            </button>

            {/* Emergency unlock toggle button & section */}
            <div className="pt-4 border-t border-white/5 space-y-3">
              <button
                type="button"
                onClick={() => {
                  setShowUnlockForm(!showUnlockForm);
                  setUnlockError(null);
                }}
                className="w-full text-center text-xs text-amber-400 hover:text-amber-300 font-semibold cursor-pointer flex items-center justify-center gap-1.5 transition-colors py-1"
              >
                <span>🔑 Accesso bloccato per troppi tentativi? Sblocca con Password d'Emergenza</span>
              </button>

              {showUnlockForm && (
                <motion.div
                  initial={{ opacity: 0, height: 0 }}
                  animate={{ opacity: 1, height: "auto" }}
                  className="bg-amber-950/20 border border-amber-500/20 rounded-xl p-4 space-y-3 mt-2"
                >
                  <div className="text-xs text-amber-200/90 leading-relaxed font-medium">
                    Inserisci la password di sblocco d'emergenza per azzerare istantaneamente il blocco di sicurezza ed accedere all'area riservata (default iniziale: <span className="font-mono text-amber-300 select-all font-bold">sblocco123</span>).
                  </div>

                  {unlockError && (
                    <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-2.5 text-red-200 text-xs flex items-center gap-2">
                      <AlertCircle size={14} className="shrink-0 text-red-400" />
                      <span>{unlockError}</span>
                    </div>
                  )}

                  <div className="relative">
                    <input
                      type={showUnlockCode ? "text" : "password"}
                      value={unlockCode}
                      onChange={(e) => setUnlockCode(e.target.value)}
                      placeholder="Password di Sblocco d'Emergenza"
                      className="w-full pl-3 pr-10 py-2.5 bg-[#0A0A0B] border border-amber-500/30 rounded-lg text-white font-medium text-xs focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400"
                    />
                    <button
                      type="button"
                      onClick={() => setShowUnlockCode(!showUnlockCode)}
                      className="absolute inset-y-0 right-0 pr-3 flex items-center text-amber-500/70 hover:text-amber-300 cursor-pointer"
                    >
                      {showUnlockCode ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={handleEmergencyUnlock}
                    disabled={isUnlocking || !unlockCode.trim()}
                    className={`w-full py-2.5 bg-amber-600 hover:bg-amber-500 text-white font-semibold text-xs rounded-lg cursor-pointer flex items-center justify-center gap-1.5 shadow-sm transition-colors ${
                      isUnlocking || !unlockCode.trim() ? "opacity-50 cursor-not-allowed" : ""
                    }`}
                  >
                    {isUnlocking ? (
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                    ) : (
                      <>
                        <Unlock size={14} />
                        <span>Sblocca ed Accedi Subito</span>
                      </>
                    )}
                  </button>
                </motion.div>
              )}
            </div>
          </form>
        </motion.div>
      </div>
    );
  }

  // LOGGED IN DASHBOARD
  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-4 sm:py-8 w-full max-w-full overflow-x-hidden" id="admin-dashboard-root">
      {/* Dashboard Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#161618] rounded-xl border border-white/5 shadow-md p-4 sm:p-6 mb-6 sm:mb-8">
        <div>
          <span className="text-[10px] font-extrabold uppercase tracking-widest text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20 shadow-sm">
            Modalità Amministrazione
          </span>
          <h1 className="text-xl sm:text-2xl font-bold text-white mt-2">Pannello di Controllo</h1>
          <p className="text-slate-400 text-xs mt-0.5">
            Gestisci candidati istituzionali, configurazioni di voto e monitora i dati in tempo reale.
          </p>
          {sessionInfo && (
            <div className="mt-2.5 inline-flex items-center gap-2 px-3 py-1 bg-indigo-500/10 border border-indigo-500/20 rounded-lg text-xs text-indigo-300 font-medium max-w-full truncate">
              <User size={13} className="text-indigo-400 shrink-0" />
              <span className="truncate">Connesso come: <strong className="text-white font-semibold">{sessionInfo.reviewerName || sessionInfo.username || sessionInfo.roleName}</strong></span>
            </div>
          )}
        </div>
        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={() => fetchDashboardData(token)}
            disabled={isLoadingData}
            title="Aggiorna Dati"
            className="p-2.5 bg-white/5 hover:bg-white/10 text-slate-300 border border-white/10 rounded-lg cursor-pointer active:scale-95 transition-all"
          >
            <RefreshCw size={18} className={isLoadingData ? "animate-spin" : ""} />
          </button>
          <button
            onClick={handleLogout}
            className="flex items-center gap-2 px-4 py-2 bg-red-500/10 hover:bg-red-500/20 text-red-400 font-semibold border border-red-500/20 rounded-lg text-xs cursor-pointer transition-colors active:scale-95"
          >
            <LogOut size={14} /> Log Out
          </button>
        </div>
      </div>

      {/* Tabs Navigation */}
      <div className="flex border-b border-white/10 mb-6 gap-1 sm:gap-2 overflow-x-auto pb-1 max-w-full flex-nowrap sm:flex-wrap custom-scrollbar">
        <button
          onClick={() => setActiveTab("votes")}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
            activeTab === "votes"
              ? "border-indigo-500 text-indigo-400 font-extrabold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <BarChart2 size={16} /> Registro Voti ({votes.length})
        </button>
        <button
          onClick={() => setActiveTab("analytics")}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
            activeTab === "analytics"
              ? "border-indigo-500 text-indigo-400 font-extrabold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Percent size={16} /> Percentuali di Voto
        </button>
        <button
          onClick={() => setActiveTab("candidates")}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
            activeTab === "candidates"
              ? "border-indigo-500 text-indigo-400 font-extrabold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Users size={16} /> Candidati per Ruolo ({candidates.length})
        </button>
        <button
          onClick={() => setActiveTab("tokens")}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
            activeTab === "tokens"
              ? "border-indigo-500 text-indigo-400 font-extrabold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Key size={16} /> Token Dipendenti ({visibleEmployeeTokens.length})
          {sessionInfo && !sessionInfo.canManageTokens && (
            <span className="ml-1 px-1.5 py-0.5 text-[9px] bg-red-950/80 text-red-300 border border-red-500/30 rounded flex items-center gap-1 font-sans font-normal normal-case">
              <Lock size={10} /> Riservato (≥ V. Direttore)
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("logs")}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
            activeTab === "logs"
              ? "border-indigo-500 text-indigo-400 font-extrabold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <History size={16} /> Log Accessi ({accessLogs.length})
        </button>
        <button
          onClick={() => setActiveTab("hierarchy")}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
            activeTab === "hierarchy"
              ? "border-amber-500 text-amber-400 font-extrabold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Award size={16} /> Gerarchia EMS
        </button>
        <button
          onClick={() => setActiveTab("candidature")}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
            activeTab === "candidature"
              ? "border-indigo-500 text-indigo-400 font-extrabold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <FileText size={16} /> Candidature ({candidatureList.length})
          {pendingCandidatureCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
              {pendingCandidatureCount} in valutazione
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("cda_proposals")}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
            activeTab === "cda_proposals"
              ? "border-amber-500 text-amber-400 font-extrabold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Award size={16} /> Proposte CDA ({cdaProposalsList.length})
          {pendingProposalsCount > 0 && (
            <span className="px-1.5 py-0.5 rounded-full text-[10px] font-bold bg-amber-500/20 text-amber-300 border border-amber-500/40 animate-pulse">
              {pendingProposalsCount} attive
            </span>
          )}
        </button>
        <button
          onClick={() => setActiveTab("settings")}
          className={`flex items-center gap-2 px-4 py-3 font-semibold text-xs uppercase tracking-wider cursor-pointer border-b-2 transition-all ${
            activeTab === "settings"
              ? "border-indigo-500 text-indigo-400 font-extrabold"
              : "border-transparent text-slate-400 hover:text-slate-200"
          }`}
        >
          <Settings size={16} /> Impostazioni Generali
        </button>
      </div>

      {isLoadingData && votes.length === 0 && candidates.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-slate-400">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-500 mb-3" />
          <p className="text-xs">Sincronizzazione archivio...</p>
        </div>
      ) : (
        <div className="space-y-6">
          {/* TAB 1: REGISTRO VOTI */}
          {activeTab === "votes" && (
            <div className="space-y-6 animate-fadeIn">
              {/* Quick statistics */}
              {stats ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                  <div className="bg-[#161618] rounded-xl border border-white/5 shadow-md p-6 flex items-center gap-4">
                    <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/20 rounded-lg flex items-center justify-center text-indigo-400 shrink-0 shadow-inner">
                      <FileText size={20} />
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Schede Ricevute</span>
                      <span className="text-3xl font-extrabold text-white">{stats.totalVotes}</span>
                    </div>
                  </div>
                  
                  <div className="bg-[#161618] rounded-xl border border-white/5 shadow-md p-6 flex items-center gap-4">
                    <div className="w-12 h-12 bg-emerald-500/10 border border-emerald-500/20 rounded-lg flex items-center justify-center text-emerald-400 shrink-0 shadow-inner">
                      <TrendingUp size={20} />
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Votazione Direzione</span>
                      <span className="text-lg font-bold text-white truncate block max-w-[200px]">
                        {stats.winners[RoleId.DIRETTORE_GENERALE]?.[0]?.name || "Nessun voto"}
                      </span>
                      <span className="text-slate-400 text-2xs block">
                        {stats.winners[RoleId.DIRETTORE_GENERALE]?.[0]
                          ? `${stats.winners[RoleId.DIRETTORE_GENERALE][0].count} preferenze`
                          : "In attesa di schede"}
                      </span>
                    </div>
                  </div>

                  <div className="bg-[#161618] rounded-xl border border-white/5 shadow-md p-6 flex items-center gap-4">
                    <div className="w-12 h-12 bg-amber-500/10 border border-amber-500/20 rounded-lg flex items-center justify-center text-amber-400 shrink-0 shadow-inner">
                      <Award size={20} />
                    </div>
                    <div>
                      <span className="block text-xs font-semibold text-slate-500 uppercase tracking-wider">Carica Più Votata</span>
                      <span className="text-lg font-bold text-white truncate block max-w-[200px]">
                        {Object.values(RoleId)
                          .map((r) => stats.winners[r]?.[0])
                          .filter(Boolean)
                          .sort((a, b) => b.count - a.count)[0]?.name || "In attesa"}
                      </span>
                      <span className="text-slate-400 text-2xs block">
                        {Object.values(RoleId)
                          .map((r) => stats.winners[r]?.[0])
                          .filter(Boolean)
                          .sort((a, b) => b.count - a.count)[0]
                          ? `${
                              Object.values(RoleId)
                                .map((r) => stats.winners[r]?.[0])
                                .filter(Boolean)
                                .sort((a, b) => b.count - a.count)[0].count
                            } preferenze complessive`
                          : "In attesa di schede"}
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="bg-[#161618] border border-white/5 rounded-xl p-8 text-center text-slate-400 max-w-xl mx-auto text-sm">
                  <FileText className="mx-auto text-slate-600 mb-3" size={32} />
                  Nessun voto è presente nel database elettorale. Condividi l'URL del portale per raccogliere le schede.
                </div>
              )}

              {/* Action buttons and download options */}
              {votes.length > 0 && (
                <div className="bg-[#161618] rounded-xl border border-white/5 p-5 flex flex-wrap gap-4 items-center justify-between">
                  <div className="text-slate-300 text-xs font-medium">
                    Ci sono <span className="font-bold text-white">{votes.length}</span> moduli salvati pronti per l'analisi.
                  </div>
                  <div className="flex flex-wrap gap-3">
                    <a
                      href={`/api/admin/export/html?token=${token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 bg-indigo-600 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/15 text-white font-semibold text-xs rounded-lg shadow-sm cursor-pointer transition-colors"
                    >
                      <Sparkles size={14} /> Scarica Report Grafico (Percentuali & Ruoli)
                    </a>
                    <a
                      href={`/api/admin/export?token=${token}`}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 hover:shadow-lg hover:shadow-emerald-500/15 text-white font-semibold text-xs rounded-lg shadow-sm cursor-pointer transition-colors"
                    >
                      <Download size={14} /> Esporta database (CSV per Excel)
                    </a>
                    <button
                      onClick={() => setShowResetModal(true)}
                      className="flex items-center gap-2 px-4 py-2.5 bg-red-600/20 hover:bg-red-600/30 text-red-400 font-semibold text-xs border border-red-500/20 rounded-lg shadow-sm cursor-pointer transition-all active:scale-98"
                    >
                      <Trash2 size={14} /> Cancella database voti
                    </button>
                  </div>
                </div>
              )}

              {/* Summary of all votes (interactive table) */}
              {votes.length > 0 && (
                <div className="bg-[#161618] rounded-xl border border-white/5 shadow-md overflow-hidden">
                  <div className="px-6 py-4 bg-white/5 border-b border-white/5 font-bold text-sm text-slate-300">
                    Registro Cronologico delle Schede Ricevute
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-left text-xs text-slate-300 border-collapse">
                      <thead>
                        <tr className="bg-white/5 text-slate-400 font-bold uppercase tracking-wider border-b border-white/5 text-[10px]">
                          <th className="px-6 py-3.5">Elettore (Nome e Cognome)</th>
                          <th className="px-6 py-3.5">Data Invio (Locale)</th>
                          <th className="px-6 py-3.5">Preferenze Espresse</th>
                          <th className="px-6 py-3.5 text-right">Azioni</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5">
                        {votes.map((vote) => {
                          const isConfirming = voteIdToConfirmDelete === vote.id;
                          return (
                            <tr key={vote.id} className="hover:bg-white/5 transition-colors">
                              <td className="px-6 py-4 font-bold text-white whitespace-nowrap">{vote.voterFullName}</td>
                              <td className="px-6 py-4 text-slate-400 whitespace-nowrap">
                                {new Date(vote.timestamp).toLocaleString("it-IT")}
                              </td>
                              <td className="px-6 py-4">
                                <div className="space-y-1.5 max-w-xl">
                                  {ROLE_IDS_SORTED_DESC.map((roleId) => {
                                    const selectedList = vote.selections[roleId] || [];
                                    if (selectedList.length === 0) return null;
                                    return (
                                      <div key={roleId} className="flex items-start gap-1 text-[11px]">
                                        <span className="font-semibold text-slate-400 text-2xs shrink-0 bg-white/5 px-1.5 py-0.2 rounded border border-white/10">
                                          {ROLE_CONFIGS[roleId].name}:
                                        </span>
                                        <span className="text-slate-200 font-medium">{selectedList.join(", ")}</span>
                                      </div>
                                    );
                                  })}
                                </div>
                              </td>
                              <td className="px-6 py-4 text-right whitespace-nowrap">
                                {isConfirming ? (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <span className="text-red-400 text-[10px] uppercase font-bold animate-pulse">Sicuro?</span>
                                    <button
                                      onClick={() => handleDeleteVote(vote.id)}
                                      className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded-md cursor-pointer transition-colors"
                                      title="Conferma"
                                    >
                                      <Check size={14} />
                                    </button>
                                    <button
                                      onClick={() => setVoteIdToConfirmDelete(null)}
                                      className="p-1 text-slate-400 hover:bg-white/5 rounded-md cursor-pointer transition-colors"
                                      title="Annulla"
                                    >
                                      <X size={14} />
                                    </button>
                                  </div>
                                ) : (
                                  <button
                                    onClick={() => handleDeleteVote(vote.id)}
                                    className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md cursor-pointer transition-colors inline-flex items-center gap-1"
                                    title="Elimina questo voto"
                                  >
                                    <Trash2 size={13} />
                                    <span className="text-[10px]">Elimina</span>
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: GESTIONE CANDIDATI */}
          {activeTab === "candidates" && (
            <div className="space-y-6 animate-fadeIn">
              
              {/* Header and Control Row */}
              <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 bg-[#161618] rounded-xl border border-white/5 p-4 shadow-sm">
                <div className="flex items-center gap-3">
                  <Users size={20} className="text-indigo-400" />
                  <div>
                    <h3 className="font-bold text-sm text-white">Gestione Elenco Persone / Candidati</h3>
                    <p className="text-[11px] text-slate-400">Aggiungi, modifica o cancella i candidati in modo unificato o per grado</p>
                  </div>
                </div>
                
                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => setViewMode(viewMode === "flat" ? "grouped" : "flat")}
                    className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-semibold text-slate-200 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <span>Vista:</span>
                    <span className="text-indigo-400 font-bold">
                      {viewMode === "flat" ? "Elenco Unificato" : "Suddiviso per Ruolo"}
                    </span>
                  </button>

                  <button
                    type="button"
                    onClick={handleOpenBulkEdit}
                    className="px-3 py-1.5 bg-indigo-600/20 hover:bg-indigo-600/30 border border-indigo-500/30 rounded-lg text-xs font-semibold text-indigo-300 transition-colors flex items-center gap-1.5 cursor-pointer"
                  >
                    <RefreshCw size={12} className="animate-pulse" />
                    <span>Importa/Modifica in blocco (Bulk)</span>
                  </button>
                </div>
              </div>

              {candidateActionError && (
                <div className="bg-red-500/10 border border-red-500/20 rounded-lg p-3 text-red-200 text-xs flex items-center gap-2">
                  <AlertCircle size={14} className="text-red-400 shrink-0" />
                  <span>{candidateActionError}</span>
                </div>
              )}

              {/* BULK EDIT PANEL */}
              {isBulkEditing && (
                <motion.div
                  initial={{ opacity: 0, y: -10 }}
                  animate={{ opacity: 1, y: 0 }}
                  className="bg-[#161618] rounded-xl border border-indigo-500/30 p-6 space-y-4 shadow-lg shadow-indigo-950/10"
                >
                  <div className="flex items-center justify-between">
                    <h4 className="font-bold text-xs uppercase tracking-wider text-indigo-400 flex items-center gap-1.5">
                      <FileText size={14} />
                      Aggiornamento Massivo dell'Elenco Persone
                    </h4>
                    <button
                      type="button"
                      onClick={() => setIsBulkEditing(false)}
                      className="text-slate-400 hover:text-white"
                    >
                      <X size={16} />
                    </button>
                  </div>

                  <p className="text-[11px] text-slate-400 leading-relaxed">
                    Inserisci o incolla i nomi dei candidati, <strong>uno per riga</strong>.
                    I candidati già presenti conserveranno il loro ID e i voti ricevuti, i nuovi verranno aggiunti all'istante, mentre i nomi rimossi verranno eliminati dal database.
                  </p>

                  <textarea
                    rows={12}
                    value={bulkText}
                    onChange={(e) => setBulkText(e.target.value)}
                    placeholder="Dott. Mario Rossi&#10;Dott.ssa Giulia Bianchi&#10;Prof. Francesco Neri"
                    className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg p-3.5 text-xs text-white placeholder-slate-600 font-mono focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-normal"
                  />

                  <div className="flex justify-end gap-3 pt-2">
                    <button
                      type="button"
                      onClick={() => setIsBulkEditing(false)}
                      className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                    >
                      Annulla
                    </button>
                    <button
                      type="button"
                      disabled={isSavingBulk}
                      onClick={handleSaveBulkCandidates}
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                    >
                      {isSavingBulk ? (
                        <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                      ) : (
                        <>
                          <Check size={14} />
                          <span>Aggiorna Elenco</span>
                        </>
                      )}
                    </button>
                  </div>
                </motion.div>
              )}

              {/* GRID WORKSPACE */}
              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8 items-start">
                
                {/* Left Side: Single Candidate Quick-Add */}
                <div className="lg:col-span-1 space-y-6">
                  <div className="bg-[#161618] rounded-xl border border-white/5 shadow-md p-6 space-y-4">
                    <h3 className="font-bold text-sm text-white flex items-center gap-2">
                      <Plus size={16} className="text-indigo-400" />
                      Aggiungi Persona Singola
                    </h3>
                    
                    <p className="text-[11px] text-slate-400">
                      Inserisci il nome e il cognome per inserire una singola persona nella lista globale.
                    </p>

                    <form onSubmit={handleAddCandidate} className="space-y-4">
                      {/* Optional role assignment selector, defaulting to first role */}
                      <div className="space-y-1.5">
                        <label htmlFor="select-candidate-role" className="text-2xs font-bold uppercase tracking-wider text-slate-500">
                          Assegna a Grado Predefinito (Facoltativo)
                        </label>
                        <select
                          id="select-candidate-role"
                          value={selectedRoleId}
                          onChange={(e) => setSelectedRoleId(e.target.value as RoleId)}
                          className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg py-2.5 px-3 text-xs text-white font-medium focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                        >
                          {ROLE_IDS_SORTED_ASC.map((roleId) => (
                            <option key={roleId} value={roleId} className="bg-[#161618] text-white text-xs">
                              {ROLE_CONFIGS[roleId].name}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-1.5">
                        <label htmlFor="candidate-name" className="text-2xs font-bold uppercase tracking-wider text-slate-500">
                          Nome e Cognome
                        </label>
                        <input
                          id="candidate-name"
                          type="text"
                          required
                          value={newCandidateName}
                          onChange={(e) => setNewCandidateName(e.target.value)}
                          placeholder="Es: Dott. Mario Rossi"
                          className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg py-2.5 px-3 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                        />
                      </div>

                      <button
                        type="submit"
                        disabled={isAddingCandidate || !newCandidateName.trim()}
                        className="w-full py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-40 text-white font-semibold text-xs rounded-lg cursor-pointer flex items-center justify-center gap-2 transition-colors shadow-md shadow-indigo-950/20"
                      >
                        {isAddingCandidate ? (
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                        ) : (
                          <>
                            <Plus size={14} />
                            <span>Aggiungi alla lista</span>
                          </>
                        )}
                      </button>
                    </form>
                  </div>

                  <div className="bg-white/5 rounded-xl border border-white/5 p-5 text-xs text-slate-400 leading-relaxed shadow-sm">
                    <div className="flex gap-2 text-slate-200 font-semibold mb-2 items-center">
                      <AlertCircle size={14} className="text-indigo-400" />
                      <span>Integrazione Drag & Drop</span>
                    </div>
                    Nella nuova area di compilazione dell'utente, tutte le persone qui inserite compariranno nel pool a destra. Gli utenti le potranno disporre liberamente nelle cariche desiderate. Le persone non collocate verranno automaticamente escluse.
                  </div>
                </div>

                {/* Right Side: List of Candidates */}
                <div className="lg:col-span-2 space-y-4">
                  
                  {/* Search and stats bar */}
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-[#161618] rounded-xl border border-white/5 p-4 shadow-sm">
                    <div className="relative flex-1">
                      <span className="absolute inset-y-0 left-0 pl-3 flex items-center text-slate-500 pointer-events-none">
                        <Users size={14} />
                      </span>
                      <input
                        type="text"
                        placeholder="Cerca tra i candidati..."
                        value={candidateSearchQuery}
                        onChange={(e) => setCandidateSearchQuery(e.target.value)}
                        className="w-full max-w-sm bg-[#0A0A0B] border border-white/10 rounded-lg pl-8 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 font-medium"
                      />
                    </div>
                    <div className="text-2xs font-extrabold text-slate-400 bg-[#0A0A0B] border border-white/5 px-2.5 py-1.5 rounded-lg shrink-0">
                      TOTALE: <span className="text-indigo-400">{candidates.length}</span> PERSONE
                    </div>
                  </div>

                  {/* FLAT LIST VIEW */}
                  {viewMode === "flat" && (
                    <div className="bg-[#161618] rounded-xl border border-white/5 p-6 shadow-md space-y-4">
                      <h4 className="font-bold text-xs uppercase tracking-wider text-slate-400 pb-3 border-b border-white/5">
                        Elenco Unificato Persone (Alfabetico)
                      </h4>

                      {candidates.length === 0 ? (
                        <div className="text-xs italic text-slate-500 py-6 text-center">
                          Nessun candidato presente in archivio. Clicca su "Importa/Modifica in blocco (Bulk)" per aggiungere una lista di nomi velocemente.
                        </div>
                      ) : (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 max-h-[500px] overflow-y-auto pr-1 custom-scrollbar">
                          {candidates
                            .filter((c) => c.name.toLowerCase().includes(candidateSearchQuery.toLowerCase()))
                            .sort((a, b) => a.name.localeCompare(b.name))
                            .map((cand) => {
                              const isConfirming = candidateIdToConfirmDelete === cand.id;
                              const isEditing = editingCandidateId === cand.id;

                              if (isEditing) {
                                return (
                                  <div
                                    key={cand.id}
                                    className="flex flex-col gap-2 p-3 bg-[#111113] rounded-lg border border-indigo-500/30 text-xs transition-all w-full col-span-1"
                                  >
                                    <div className="flex flex-col gap-1.5">
                                      <input
                                        type="text"
                                        value={editingName}
                                        onChange={(e) => setEditingName(e.target.value)}
                                        className="w-full bg-[#0A0A0B] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 font-medium"
                                        placeholder="Nome e cognome"
                                        autoFocus
                                      />
                                      <select
                                        value={editingRoleId}
                                        onChange={(e) => setEditingRoleId(e.target.value as RoleId)}
                                        className="w-full bg-[#0A0A0B] border border-white/10 rounded px-2.5 py-1.5 text-xs text-white focus:outline-hidden focus:border-indigo-500 font-medium"
                                      >
                                        {ROLE_IDS_SORTED_DESC.map((rId) => (
                                          <option key={rId} value={rId}>
                                            {ROLE_CONFIGS[rId].name} (Grado {ROLE_CONFIGS[rId].grade})
                                          </option>
                                        ))}
                                      </select>
                                    </div>
                                    <div className="flex items-center justify-end gap-1.5 mt-1 border-t border-white/5 pt-2">
                                      <button
                                        onClick={() => handleUpdateCandidate(cand.id)}
                                        disabled={isUpdatingCandidate || !editingName.trim()}
                                        className="px-2.5 py-1 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1 shadow-xs"
                                        title="Salva modifiche"
                                      >
                                        {isUpdatingCandidate ? (
                                          <div className="animate-spin rounded-full h-3 w-3 border-b border-white" />
                                        ) : (
                                          <>
                                            <Check size={11} />
                                            <span>Salva</span>
                                          </>
                                        )}
                                      </button>
                                      <button
                                        onClick={cancelEditingCandidate}
                                        disabled={isUpdatingCandidate}
                                        className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1"
                                        title="Annulla"
                                      >
                                        <X size={11} />
                                        <span>Annulla</span>
                                      </button>
                                    </div>
                                  </div>
                                );
                              }

                              return (
                                <div
                                  key={cand.id}
                                  className="flex items-center justify-between p-3 bg-[#0A0A0B]/60 hover:bg-[#0A0A0B]/90 rounded-lg border border-white/5 text-xs font-semibold text-slate-300 transition-colors"
                                >
                                  <div className="flex flex-col truncate pr-4">
                                    <span className="truncate text-slate-200">{cand.name}</span>
                                    {cand.roleId && (
                                      <span className="text-[10px] text-slate-500 font-medium truncate mt-0.5">
                                        Grado predefinito: {ROLE_CONFIGS[cand.roleId as RoleId]?.name || cand.roleId}
                                      </span>
                                    )}
                                  </div>
                                  
                                  <div className="flex items-center gap-1 shrink-0">
                                    <button
                                      onClick={() => startEditingCandidate(cand)}
                                      className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md cursor-pointer transition-colors"
                                      title="Modifica nome/ruolo"
                                    >
                                      <Edit2 size={12} />
                                    </button>
                                    <button
                                      onClick={() => handleDeleteCandidate(cand.id)}
                                      className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md cursor-pointer transition-colors"
                                      title="Elimina candidato"
                                    >
                                      <Trash2 size={13} />
                                    </button>
                                  </div>
                                </div>
                              );
                            })}
                          
                          {candidates.filter((c) => c.name.toLowerCase().includes(candidateSearchQuery.toLowerCase())).length === 0 && (
                            <div className="text-xs italic text-slate-500 text-center py-4 col-span-2">
                              Nessuna corrispondenza trovata per "{candidateSearchQuery}".
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  {/* GROUPED LIST VIEW */}
                  {viewMode === "grouped" && (
                    <div className="space-y-4 max-h-[550px] overflow-y-auto pr-1 custom-scrollbar">
                      {ROLE_IDS_SORTED_DESC.map((roleId) => {
                        const roleCandidates = candidates
                          .filter((c) => c.roleId === roleId)
                          .filter((c) => c.name.toLowerCase().includes(candidateSearchQuery.toLowerCase()));

                        return (
                          <div key={roleId} className="bg-[#161618] rounded-xl border border-white/5 p-5 shadow-sm" id={`admin-role-list-${roleId}`}>
                            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5 mb-4">
                              <RoleBadge roleId={roleId} showGrade={true} />
                              <span className="text-2xs font-semibold text-slate-400">
                                {roleCandidates.length} candidati attivi
                              </span>
                            </div>

                            {roleCandidates.length === 0 ? (
                              <div className="text-xs italic text-slate-500 py-1 flex items-center gap-1.5">
                                <AlertCircle size={12} className="text-slate-600" />
                                Nessun candidato corrispondente trovato in questa sezione.
                              </div>
                            ) : (
                              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                                {roleCandidates.map((cand) => {
                                  const isConfirming = candidateIdToConfirmDelete === cand.id;
                                  const isEditing = editingCandidateId === cand.id;

                                  if (isEditing) {
                                    return (
                                      <div
                                        key={cand.id}
                                        className="flex flex-col gap-2 p-3 bg-[#111113] rounded-lg border border-indigo-500/30 text-xs transition-all w-full col-span-1 sm:col-span-1"
                                      >
                                        <div className="flex flex-col gap-1.5">
                                          <input
                                            type="text"
                                            value={editingName}
                                            onChange={(e) => setEditingName(e.target.value)}
                                            className="w-full bg-[#0A0A0B] border border-white/10 rounded px-2 py-1 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 font-medium"
                                            placeholder="Nome e cognome"
                                            autoFocus
                                          />
                                          <select
                                            value={editingRoleId}
                                            onChange={(e) => setEditingRoleId(e.target.value as RoleId)}
                                            className="w-full bg-[#0A0A0B] border border-white/10 rounded px-2 py-1 text-xs text-white focus:outline-hidden focus:border-indigo-500 font-medium"
                                          >
                                            {ROLE_IDS_SORTED_DESC.map((rId) => (
                                              <option key={rId} value={rId}>
                                                {ROLE_CONFIGS[rId].name}
                                              </option>
                                            ))}
                                          </select>
                                        </div>
                                        <div className="flex items-center justify-end gap-1.5 mt-1 border-t border-white/5 pt-2">
                                          <button
                                            onClick={() => handleUpdateCandidate(cand.id)}
                                            disabled={isUpdatingCandidate || !editingName.trim()}
                                            className="px-2 py-0.5 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white rounded text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1"
                                            title="Salva modifiche"
                                          >
                                            {isUpdatingCandidate ? (
                                              <div className="animate-spin rounded-full h-3 w-3 border-b border-white" />
                                            ) : (
                                              <>
                                                <Check size={11} />
                                                <span>Salva</span>
                                              </>
                                            )}
                                          </button>
                                          <button
                                            onClick={cancelEditingCandidate}
                                            disabled={isUpdatingCandidate}
                                            className="px-2 py-0.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded text-[10px] font-bold cursor-pointer transition-colors flex items-center gap-1"
                                            title="Annulla"
                                          >
                                            <X size={11} />
                                            <span>Annulla</span>
                                          </button>
                                        </div>
                                      </div>
                                    );
                                  }

                                  return (
                                    <div
                                      key={cand.id}
                                      className="flex items-center justify-between p-2.5 bg-[#0A0A0B]/65 hover:bg-[#0A0A0B]/90 rounded-lg border border-white/5 text-xs font-semibold text-slate-300 transition-colors"
                                    >
                                      <span className="truncate pr-4 text-slate-200">{cand.name}</span>
                                      {isConfirming ? (
                                        <div className="flex items-center gap-1.5 shrink-0">
                                          <span className="text-red-400 text-[10px] uppercase font-bold animate-pulse">Sicuro?</span>
                                          <button
                                            onClick={() => handleDeleteCandidate(cand.id)}
                                            className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded-md cursor-pointer transition-colors"
                                            title="Conferma"
                                          >
                                            <Check size={14} />
                                          </button>
                                          <button
                                            onClick={() => setCandidateIdToConfirmDelete(null)}
                                            className="p-1 text-slate-400 hover:bg-white/5 rounded-md cursor-pointer transition-colors"
                                            title="Annulla"
                                          >
                                            <X size={14} />
                                          </button>
                                        </div>
                                      ) : (
                                        <div className="flex items-center gap-1 shrink-0">
                                          <button
                                            onClick={() => startEditingCandidate(cand)}
                                            className="p-1.5 text-slate-500 hover:text-indigo-400 hover:bg-indigo-500/10 rounded-md cursor-pointer transition-colors"
                                            title="Modifica"
                                          >
                                            <Edit2 size={12} />
                                          </button>
                                          <button
                                            onClick={() => handleDeleteCandidate(cand.id)}
                                            className="p-1.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md cursor-pointer transition-colors shrink-0"
                                            title="Elimina"
                                          >
                                            <Trash2 size={13} />
                                          </button>
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  )}

                </div>
              </div>
            </div>
          )}

          {/* TAB 3: ANALISI PERCENTUALI PER RUOLO */}
          {activeTab === "analytics" && (
            <div className="space-y-6 animate-fadeIn">
              {/* Header inside tab */}
              <div className="bg-[#161618] rounded-xl border border-white/5 p-6 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                <div>
                  <h2 className="text-lg font-bold text-white flex items-center gap-2">
                    <Percent className="text-indigo-400" size={18} />
                    Analisi Percentuali di Voto per Ruolo
                  </h2>
                  <p className="text-slate-400 text-xs mt-1">
                    Visualizza in tempo reale le preferenze ottenute da ogni candidato espresse in percentuale sul totale delle schede caricate.
                  </p>
                </div>
                <div className="bg-[#0A0A0B] border border-white/5 rounded-lg px-3.5 py-2 shrink-0 text-xs text-slate-300">
                  Schede totali in archivio: <strong className="text-indigo-400 text-sm font-extrabold">{votes.length}</strong>
                </div>
              </div>

              {votes.length === 0 ? (
                <div className="bg-[#161618] border border-white/5 rounded-xl p-12 text-center text-slate-400 max-w-xl mx-auto">
                  <Percent className="mx-auto text-slate-600 mb-3" size={36} />
                  <p className="text-sm font-semibold text-white">Nessun voto registrato in archivio.</p>
                  <p className="text-xs text-slate-500 mt-1">
                    Invia delle schede di voto nel portale elettore per visualizzare i grafici e le percentuali qui.
                  </p>
                </div>
              ) : (
                <>
                  {/* Sub-tabs selector */}
                  <div className="flex border-b border-white/5 pb-0.5 gap-2">
                    <button
                      onClick={() => setAnalyticsSubTab("charts")}
                      type="button"
                      className={`px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                        analyticsSubTab === "charts"
                          ? "border-red-500 text-white bg-white/5 rounded-t-lg"
                          : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/2 rounded-t-lg"
                      }`}
                    >
                      <BarChart2 size={14} />
                      Preferenze per Ruolo
                    </button>
                    <button
                      onClick={() => setAnalyticsSubTab("hierarchy")}
                      type="button"
                      className={`px-4 py-2.5 text-xs font-extrabold uppercase tracking-wider border-b-2 transition-all cursor-pointer flex items-center gap-2 ${
                        analyticsSubTab === "hierarchy"
                          ? "border-red-500 text-white bg-white/5 rounded-t-lg"
                          : "border-transparent text-slate-400 hover:text-slate-200 hover:bg-white/2 rounded-t-lg"
                      }`}
                    >
                      <Sparkles size={14} className="text-amber-400 animate-pulse" />
                      Gerarchia Ipotetica Simulata
                    </button>
                  </div>

                  {analyticsSubTab === "charts" ? (
                    <>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                        {ROLE_IDS_SORTED_DESC.map((roleId) => {
                          const config = ROLE_CONFIGS[roleId];
                          // Hex mapping to bypass Tailwind dynamic compilation limits
                          const hexColorMap: Record<RoleId, string> = {
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
                          const roleColorHex = hexColorMap[roleId] || "#6366f1";

                          // Find candidates in state
                          const roleCandidates = candidates.filter((c) => c.roleId === roleId);
                          
                          // Count votes from memory
                          const counts: Record<string, number> = {};
                          roleCandidates.forEach((c) => { counts[c.name] = 0; });
                          
                          votes.forEach((vote) => {
                            const selectionsForRole = vote.selections[roleId] || [];
                            selectionsForRole.forEach((name) => {
                              counts[name] = (counts[name] || 0) + 1;
                            });
                          });

                          // Sort descending
                          const results = Object.entries(counts)
                            .map(([name, count]) => {
                              const percentage = votes.length > 0 ? (count / votes.length) * 100 : 0;
                              return { name, count, percentage };
                            })
                            .sort((a, b) => b.count - a.count);

                          const votedResults = results.filter((r) => r.count > 0);
                          const excludedResults = results.filter((r) => r.count === 0);

                          return (
                            <div
                              key={roleId}
                              className="bg-[#161618] rounded-xl border border-white/5 overflow-hidden shadow-md flex flex-col justify-between"
                            >
                              {/* Header card with colored role line */}
                              <div className="px-5 py-4 bg-white/2 border-b border-white/5 flex items-center justify-between">
                                <div className="flex items-center gap-2">
                                  <div 
                                    style={{ backgroundColor: roleColorHex }}
                                    className="w-3 h-3 rounded-full" 
                                  />
                                  <h3 className="font-extrabold text-sm text-white truncate max-w-[200px]" title={config.name}>
                                    {config.name}
                                  </h3>
                                </div>
                                <span className="text-[10px] font-extrabold text-slate-400 bg-white/5 border border-white/5 px-2 py-0.5 rounded uppercase">
                                  Grado {config.grade}
                                </span>
                              </div>

                              <div className="p-5 space-y-4 flex-grow">
                                {results.length === 0 ? (
                                  <p className="text-xs italic text-slate-500 py-2 text-center">Nessuna persona inserita in questa carica.</p>
                                ) : (
                                  <>
                                    {/* Voted candidates */}
                                    {votedResults.length === 0 ? (
                                      <p className="text-xs italic text-slate-500 py-2 text-center">Nessun voto espresso per questo ruolo.</p>
                                    ) : (
                                      <div className="space-y-4">
                                        {votedResults.map((cand, idx) => {
                                          const pctWidth = cand.percentage.toFixed(1);
                                          const isLeading = idx === 0 && cand.count > 0;
                                          return (
                                            <div key={cand.name} className="space-y-1.5">
                                              <div className="flex justify-between items-center text-xs">
                                                <span className="font-semibold text-slate-200 flex items-center gap-1">
                                                  {isLeading && <span title="Capolista" className="text-amber-400">👑</span>}
                                                  {cand.name}
                                                </span>
                                                <div className="space-x-1.5 text-slate-400 font-mono text-2xs">
                                                  <span className="font-bold text-white text-xs">{pctWidth}%</span>
                                                  <span>({cand.count} {cand.count === 1 ? "voto" : "voti"})</span>
                                                </div>
                                              </div>
                                              {/* Progress bar */}
                                              <div className="w-full bg-[#0A0A0B] rounded-full h-2 overflow-hidden border border-white/5 shadow-inner">
                                                <div
                                                  style={{ width: `${pctWidth}%`, backgroundColor: roleColorHex }}
                                                  className="h-full rounded-full transition-all duration-500"
                                                />
                                              </div>
                                            </div>
                                          );
                                        })}
                                      </div>
                                    )}

                                    {/* Excluded candidates */}
                                    {excludedResults.length > 0 && (
                                      <div className="pt-3.5 border-t border-white/5 space-y-2">
                                        <div className="flex items-center justify-between text-[10px] uppercase font-bold text-slate-500 tracking-wider">
                                          <span>Esclusi ({excludedResults.length})</span>
                                          <span>0.0%</span>
                                        </div>
                                        <div className="flex flex-wrap gap-1.5">
                                          {excludedResults.map((cand) => (
                                            <span
                                              key={cand.name}
                                              className="inline-block bg-[#0c0102]/60 text-slate-400 text-[10px] font-semibold px-2 py-0.5 rounded border border-red-950/20"
                                              title={`${cand.name} ha ottenuto 0 voti`}
                                            >
                                              {cand.name}
                                            </span>
                                          ))}
                                        </div>
                                      </div>
                                    )}
                                  </>
                                )}
                              </div>
                            </div>
                          );
                        })}
                      </div>

                      {/* SEZIONE ESCLUSI */}
                      <div className="bg-[#161618] rounded-xl border border-red-950/40 p-6 shadow-md mt-6">
                        <div className="flex items-center gap-2 mb-4 border-b border-white/5 pb-3">
                          <div className="w-3 h-3 rounded-full bg-red-600 animate-pulse" />
                          <h3 className="font-extrabold text-sm text-white uppercase tracking-wider flex items-center gap-1.5">
                            Candidati Esclusi (Nessun Ruolo Assegnato)
                          </h3>
                        </div>
                        <p className="text-slate-400 text-xs mb-5">
                          Percentuale di schede elettorali salvate in cui il candidato non è stato inserito in alcuna delle 12 cariche gerarchiche.
                        </p>
                        
                        {(() => {
                          const allCandidateNames: string[] = Array.from(new Set(candidates.map((c) => c.name)));
                          const exclusions: Record<string, number> = {};
                          allCandidateNames.forEach((name) => {
                            exclusions[name] = 0;
                          });

                          votes.forEach((vote) => {
                            allCandidateNames.forEach((name) => {
                              const isSelectedInVote = Object.values(vote.selections).some((selList) => {
                                const list = (selList || []) as string[];
                                return list.includes(name);
                              });
                              if (!isSelectedInVote) {
                                exclusions[name] = (exclusions[name] || 0) + 1;
                              }
                            });
                          });

                          const exclusionResults = Object.entries(exclusions)
                            .map(([name, count]) => {
                              const percentage = votes.length > 0 ? (count / votes.length) * 100 : 0;
                              return { name, count, percentage };
                            })
                            .sort((a, b) => b.count - a.count);

                          if (exclusionResults.length === 0) {
                            return <p className="text-xs italic text-slate-500 text-center py-2">Nessun candidato presente nel sistema.</p>;
                          }

                          return (
                            <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
                              {exclusionResults.map((cand) => {
                                const pctWidth = cand.percentage.toFixed(1);
                                return (
                                  <div key={cand.name} className="bg-[#0c0102]/60 border border-red-950/20 rounded-lg p-3.5 space-y-2">
                                    <div className="flex justify-between items-center text-xs">
                                      <span className="font-bold text-slate-200">{cand.name}</span>
                                      <div className="space-x-1 text-red-400 font-mono text-2xs">
                                        <span className="font-bold text-xs">{pctWidth}%</span>
                                        <span>({cand.count} {cand.count === 1 ? "volta" : "volte"})</span>
                                      </div>
                                    </div>
                                    <div className="w-full bg-[#050001] rounded-full h-1.5 overflow-hidden border border-white/5 shadow-inner">
                                      <div
                                        style={{ width: `${pctWidth}%` }}
                                        className="h-full rounded-full bg-red-600 transition-all duration-500"
                                      />
                                    </div>
                                    <div className="flex justify-between items-center">
                                      <span className="inline-block bg-red-950/30 text-red-400 text-[10px] font-bold px-2 py-0.5 rounded border border-red-900/30 uppercase">
                                        Escluso
                                      </span>
                                      <span className="text-[10px] text-slate-500">
                                        Tasso esclusione
                                      </span>
                                    </div>
                                  </div>
                                );
                              })}
                            </div>
                          );
                        })()}
                      </div>
                    </>
                  ) : (
                    /* GERARCHIA IPOTETICA SIMULATA */
                    (() => {
                      const allCandidateNames: string[] = Array.from(new Set(candidates.map((c) => c.name)));
                      
                      if (allCandidateNames.length === 0) {
                        return (
                          <div className="bg-[#161618] border border-white/5 rounded-xl p-12 text-center text-slate-400 max-w-xl mx-auto">
                            <Users className="mx-auto text-slate-600 mb-3" size={36} />
                            <p className="text-sm font-semibold text-white">Nessun candidato registrato.</p>
                            <p className="text-xs text-slate-500 mt-1">
                              Aggiungi candidati nella scheda "Candidati" per poter simulare la gerarchia ipotetica.
                            </p>
                          </div>
                        );
                      }

                      // 1. OBJECTIVE CALCULATION (PERFORMANCE BASED)
                      const objectiveScores: Record<string, number> = {};
                      allCandidateNames.forEach((name) => { objectiveScores[name] = 0; });

                      votes.forEach((vote) => {
                        Object.entries(vote.selections).forEach(([roleId, selectedNames]) => {
                          const names = (selectedNames || []) as string[];
                          const config = ROLE_CONFIGS[roleId as RoleId];
                          if (config) {
                            names.forEach((name) => {
                              if (objectiveScores[name] !== undefined) {
                                // Objective Score: Vote in higher grade role has more weight
                                objectiveScores[name] += config.grade * 10;
                              }
                            });
                          }
                        });
                      });

                      const objectiveSorted = Object.entries(objectiveScores)
                        .map(([name, score]) => {
                          let totalVotesCount = 0;
                          votes.forEach((vote) => {
                            Object.values(vote.selections).forEach((selList) => {
                              if (Array.isArray(selList) && selList.includes(name)) {
                                totalVotesCount++;
                              }
                            });
                          });
                          return { name, score, totalVotesCount };
                        })
                        .sort((a, b) => b.score - a.score);

                      // 2. SUBJECTIVE CALCULATION (CONCORDANCE & EXCLUSIONS BASED)
                      const candidateExclusions: Record<string, number> = {};
                      const candidateInclusions: Record<string, number> = {};
                      allCandidateNames.forEach((name) => {
                        candidateExclusions[name] = 0;
                        candidateInclusions[name] = 0;
                      });

                      votes.forEach((vote) => {
                        allCandidateNames.forEach((name) => {
                          const isSelectedInVote = Object.values(vote.selections).some((selList) => {
                            return Array.isArray(selList) && selList.includes(name);
                          });
                          if (isSelectedInVote) {
                            candidateInclusions[name]++;
                          } else {
                            candidateExclusions[name]++;
                          }
                        });
                      });

                      const subjectiveScores: Record<string, number> = {};
                      allCandidateNames.forEach((name) => {
                        let voteWeightScore = 0;
                        votes.forEach((vote) => {
                          Object.entries(vote.selections).forEach(([roleId, selectedNames]) => {
                            const names = (selectedNames || []) as string[];
                            const config = ROLE_CONFIGS[roleId as RoleId];
                            if (config && names.includes(name)) {
                              // Positive contribution based on role grade
                              voteWeightScore += config.grade * 5;
                            }
                          });
                        });
                        
                        const exclCount = candidateExclusions[name] || 0;
                        // Heavily penalize exclusions (-15 points per ballot where totally excluded)
                        const exclusionPenalty = exclCount * 15;
                        subjectiveScores[name] = voteWeightScore - exclusionPenalty;
                      });

                      const subjectiveSorted = Object.entries(subjectiveScores)
                        .map(([name, score]) => {
                          return {
                            name,
                            score,
                            exclusions: candidateExclusions[name] || 0,
                            inclusions: candidateInclusions[name] || 0,
                          };
                        })
                        .sort((a, b) => b.score - a.score);

                      // FILTERING: Eligible candidates (score >= 0) vs Excluded candidates (score < 0)
                      const subjectiveEligible = subjectiveSorted.filter((c) => c.score >= 0);
                      const subjectiveExcluded = subjectiveSorted.filter((c) => c.score < 0);

                      const objectiveEligible = objectiveSorted.filter((c) => c.score >= 0);
                      const objectiveExcluded = objectiveSorted.filter((c) => c.score < 0);

                      // Helper: Partition eligible candidates into 12 role buckets based on score distribution
                      const partitionInto12Roles = <T extends { score: number }>(eligibleList: T[]): T[][] => {
                        const buckets: T[][] = Array.from({ length: 12 }, () => []);
                        const N = eligibleList.length;

                        if (N === 0) return buckets;

                        const maxScore = eligibleList[0].score;
                        const minScore = eligibleList[N - 1].score;
                        const range = maxScore - minScore;

                        if (range <= 0) {
                          // All eligible candidates have the exact same score.
                          // Distribute them across the 12 roles (~N/12 per role)
                          for (let i = 0; i < N; i++) {
                            const bucketIdx = Math.min(11, Math.floor((i / N) * 12));
                            buckets[bucketIdx].push(eligibleList[i]);
                          }
                        } else {
                          // Group candidates into 12 score brackets (0 = highest score tier, 11 = lowest score tier >= 0)
                          for (let i = 0; i < N; i++) {
                            const cand = eligibleList[i];
                            const fraction = (maxScore - cand.score) / range;
                            let bucketIdx = Math.floor(fraction * 12);
                            if (bucketIdx >= 12) bucketIdx = 11;
                            if (bucketIdx < 0) bucketIdx = 0;

                            buckets[bucketIdx].push(cand);
                          }
                        }

                        return buckets;
                      };

                      const subjectiveBuckets = partitionInto12Roles(subjectiveEligible);
                      const objectiveBuckets = partitionInto12Roles(objectiveEligible);

                      const rolesDesc = ROLE_IDS_SORTED_DESC;

                      return (
                        <div className="space-y-8 animate-fadeIn">
                          {/* Explanation Banner */}
                          <div className="bg-gradient-to-r from-red-950/20 via-slate-900 to-[#161618] rounded-xl border border-red-950/30 p-6 flex flex-col md:flex-row gap-6 items-start md:items-center">
                            <div className="p-3 bg-red-600/10 rounded-lg border border-red-500/20 text-red-500 shrink-0">
                              <Sparkles size={24} className="text-amber-400 animate-pulse" />
                            </div>
                            <div className="space-y-1">
                              <h3 className="text-sm font-extrabold text-white uppercase tracking-wider">
                                Simulazione Comparativa della Struttura Aziendale
                              </h3>
                              <p className="text-xs text-slate-400 leading-relaxed">
                                L'algoritmo ordina i candidati per punteggio e li distribuisce nei 12 livelli di organigramma in base alle fasce di merito ottenute (mediamente circa 2 per ruolo, con la possibilità di averne 0, 1, 2, 3 o più in ciascun grado). I candidati con punteggio inferiore a 0 (&lt; 0 pt) vengono invece esclusi dalla struttura.
                              </p>
                            </div>
                          </div>

                          {/* Columns container */}
                          <div className="grid grid-cols-1 xl:grid-cols-2 gap-8">
                            
                            {/* COLUMN 1: SUBJECTIVE (SOGGETTIVA) */}
                            <div className="space-y-6">
                              <div className="bg-[#161618] rounded-xl border border-white/5 p-5 space-y-4">
                                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-amber-500/10 rounded-md text-amber-400 border border-amber-500/20">
                                      <Brain size={16} />
                                    </div>
                                    <div>
                                      <h4 className="text-xs uppercase font-extrabold text-white tracking-wider">
                                        1. Metodo Soggettivo (Consenso & Integrazione)
                                      </h4>
                                      <p className="text-[10px] text-slate-500">Valuta i voti ricevuti e penalizza le esclusioni totali</p>
                                    </div>
                                  </div>
                                  <span className="text-[10px] bg-amber-500/10 text-amber-400 border border-amber-500/20 font-extrabold px-2 py-0.5 rounded-full uppercase font-mono">
                                    CONSENSO
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  💡 <strong>Filosofia</strong>: Premia l'integrazione e il consenso unanime. Valuta positivamente ogni inserimento in ruolo (pesato per il livello del ruolo) ma applica una <strong>penalità pesante per ogni esclusione totale</strong> (schede in cui il candidato non è stato votato in nessuna carica). Questo favorisce figure di raccordo ampiamente accettate da tutta l'organizzazione rispetto a candidati polarizzanti che hanno molti voti alti ma anche molte esclusioni.
                                </p>
                                <div className="bg-[#0A0A0B] p-3 rounded-lg border border-white/5 font-mono text-[10px] text-amber-400/80 flex items-center justify-between">
                                  <span>Algoritmo di Calcolo:</span>
                                  <span className="font-bold">(Grado Ruolo × 5) − (N. Esclusioni × 15)</span>
                                </div>
                              </div>

                              {/* Table */}
                              <div className="bg-[#161618] rounded-xl border border-white/5 overflow-hidden shadow-lg">
                                <div className="px-5 py-3.5 bg-white/2 border-b border-white/5 flex items-center justify-between">
                                  <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Organigramma su Base Consenso</span>
                                  <span className="text-[10px] text-slate-500 font-extrabold uppercase font-mono">
                                    {subjectiveEligible.length} Assegnati {subjectiveExcluded.length > 0 && `(${subjectiveExcluded.length} Esclusi)`}
                                  </span>
                                </div>
                                <div className="divide-y divide-white/5">
                                  {rolesDesc.map((roleId, index) => {
                                    const config = ROLE_CONFIGS[roleId];
                                    const assignedCands = subjectiveBuckets[index] || [];
                                    
                                    const hexColorMap: Record<RoleId, string> = {
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
                                    const roleColorHex = hexColorMap[roleId] || "#6366f1";

                                    return (
                                      <div key={roleId} className="p-4 flex items-start justify-between gap-4 hover:bg-white/2 transition-colors">
                                        <div className="flex items-center gap-3 min-w-0 pt-1">
                                          <div 
                                            style={{ backgroundColor: roleColorHex }}
                                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-md shadow-slate-950/30" 
                                          />
                                          <div className="min-w-0">
                                            <div className="text-[11px] font-bold text-slate-300 leading-tight">
                                              {config.name}
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-0.5 uppercase font-semibold">
                                              Grado {config.grade} {assignedCands.length > 1 && `(${assignedCands.length} membri)`}
                                            </div>
                                          </div>
                                        </div>

                                        {assignedCands.length > 0 ? (
                                          <div className="flex flex-col gap-2 shrink-0 max-w-[280px]">
                                            {assignedCands.map((cand) => (
                                              <div key={cand.name} className="flex items-center justify-end gap-2.5 text-right bg-white/2 p-1.5 rounded-lg border border-white/5">
                                                <div>
                                                  <div className="text-xs font-black text-white">{cand.name}</div>
                                                  <div className="text-[10px] text-slate-400 flex items-center gap-1.5 justify-end mt-0.5 font-medium">
                                                    <span className="text-emerald-400">Incluso: {cand.inclusions}v</span>
                                                    <span className="text-slate-600">|</span>
                                                    <span className="text-red-400">Escluso: {cand.exclusions}v</span>
                                                  </div>
                                                </div>
                                                <div className="bg-amber-500/10 border border-amber-500/20 text-amber-400 text-[10px] font-mono font-bold px-2 py-1 rounded min-w-[52px] text-center shrink-0">
                                                  {cand.score > 0 ? `+${cand.score}` : cand.score} pt
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="text-[10px] text-slate-600 italic border border-dashed border-white/5 px-2.5 py-1 rounded bg-black/25">
                                            Posizione Vacante
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Excluded list (score < 0) */}
                                {subjectiveExcluded.length > 0 && (
                                  <div className="p-4 bg-red-950/20 border-t border-red-900/30 space-y-2">
                                    <div className="text-[10px] uppercase font-extrabold text-red-400 tracking-wider flex items-center gap-1.5">
                                      <span>⚠️ Candidati Esclusi dall'Organigramma (Punteggio &lt; 0 pt)</span>
                                      <span className="bg-red-500/20 text-red-300 px-1.5 py-0.2 rounded font-mono text-[9px]">{subjectiveExcluded.length}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400">
                                      Candidati con punteggio negativo derivante da un alto tasso di esclusione:
                                    </p>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      {subjectiveExcluded.map((cand) => (
                                        <div 
                                          key={cand.name}
                                          className="bg-black/60 border border-red-900/40 rounded-lg px-2.5 py-1 flex items-center gap-2 text-2xs"
                                        >
                                          <span className="font-bold text-slate-300">{cand.name}</span>
                                          <span className="text-red-400 font-mono font-bold">
                                            ({cand.score} pt)
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                            {/* COLUMN 2: OBJECTIVE (OGGETTIVA) */}
                            <div className="space-y-6">
                              <div className="bg-[#161618] rounded-xl border border-white/5 p-5 space-y-4">
                                <div className="flex items-center justify-between border-b border-white/5 pb-3">
                                  <div className="flex items-center gap-2">
                                    <div className="p-1.5 bg-cyan-500/10 rounded-md text-cyan-400 border border-cyan-500/20">
                                      <Calculator size={16} />
                                    </div>
                                    <div>
                                      <h4 className="text-xs uppercase font-extrabold text-white tracking-wider">
                                        2. Metodo Oggettivo (Matematico & Effettivo)
                                      </h4>
                                      <p className="text-[10px] text-slate-500">Somma ponderata basata interamente sul livello dei voti</p>
                                    </div>
                                  </div>
                                  <span className="text-[10px] bg-cyan-500/10 text-cyan-400 border border-cyan-500/20 font-extrabold px-2 py-0.5 rounded-full uppercase font-mono">
                                    MATEMATICO
                                  </span>
                                </div>
                                <p className="text-xs text-slate-400 leading-relaxed">
                                  💡 <strong>Filosofia</strong>: Rappresenta il puro calcolo meritocratico e cumulativo dei voti espressi. Ogni volta che un candidato viene inserito in un ruolo riceve punti aggiuntivi, che crescono progressivamente con l'altezza del ruolo nel sistema (Grado 1 a 12). Non ci sono penalità per essere stati esclusi: conta solo il peso assoluto delle preferenze ricevute.
                                </p>
                                <div className="bg-[#0A0A0B] p-3 rounded-lg border border-white/5 font-mono text-[10px] text-cyan-400/80 flex items-center justify-between">
                                  <span>Algoritmo di Calcolo:</span>
                                  <span className="font-bold">Somma di (Voti in Ruolo × Grado × 10)</span>
                                </div>
                              </div>

                              {/* Table */}
                              <div className="bg-[#161618] rounded-xl border border-white/5 overflow-hidden shadow-lg">
                                <div className="px-5 py-3.5 bg-white/2 border-b border-white/5 flex items-center justify-between">
                                  <span className="text-xs font-bold uppercase text-slate-400 tracking-wider">Organigramma su Base Matematica</span>
                                  <span className="text-[10px] text-slate-500 font-extrabold uppercase font-mono">
                                    {objectiveEligible.length} Assegnati {objectiveExcluded.length > 0 && `(${objectiveExcluded.length} Esclusi)`}
                                  </span>
                                </div>
                                <div className="divide-y divide-white/5">
                                  {rolesDesc.map((roleId, index) => {
                                    const config = ROLE_CONFIGS[roleId];
                                    const assignedCands = objectiveBuckets[index] || [];
                                    
                                    const hexColorMap: Record<RoleId, string> = {
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
                                    const roleColorHex = hexColorMap[roleId] || "#6366f1";

                                    return (
                                      <div key={roleId} className="p-4 flex items-start justify-between gap-4 hover:bg-white/2 transition-colors">
                                        <div className="flex items-center gap-3 min-w-0 pt-1">
                                          <div 
                                            style={{ backgroundColor: roleColorHex }}
                                            className="w-2.5 h-2.5 rounded-full shrink-0 shadow-md shadow-slate-950/30" 
                                          />
                                          <div className="min-w-0">
                                            <div className="text-[11px] font-bold text-slate-300 leading-tight">
                                              {config.name}
                                            </div>
                                            <div className="text-[10px] text-slate-500 mt-0.5 uppercase font-semibold">
                                              Grado {config.grade} {assignedCands.length > 1 && `(${assignedCands.length} membri)`}
                                            </div>
                                          </div>
                                        </div>

                                        {assignedCands.length > 0 ? (
                                          <div className="flex flex-col gap-2 shrink-0 max-w-[280px]">
                                            {assignedCands.map((cand) => (
                                              <div key={cand.name} className="flex items-center justify-end gap-2.5 text-right bg-white/2 p-1.5 rounded-lg border border-white/5">
                                                <div>
                                                  <div className="text-xs font-black text-white">{cand.name}</div>
                                                  <div className="text-[10px] text-slate-400 mt-0.5 font-medium">
                                                    <span className="text-cyan-400">{cand.totalVotesCount} {cand.totalVotesCount === 1 ? "voto ricevuto" : "voti totali"}</span>
                                                  </div>
                                                </div>
                                                <div className="bg-cyan-500/10 border border-cyan-500/20 text-cyan-400 text-[10px] font-mono font-bold px-2 py-1 rounded min-w-[52px] text-center shrink-0">
                                                  {cand.score} pt
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        ) : (
                                          <div className="text-[10px] text-slate-600 italic border border-dashed border-white/5 px-2.5 py-1 rounded bg-black/25">
                                            Posizione Vacante
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>

                                {/* Excluded list (score < 0) */}
                                {objectiveExcluded.length > 0 && (
                                  <div className="p-4 bg-red-950/20 border-t border-red-900/30 space-y-2">
                                    <div className="text-[10px] uppercase font-extrabold text-red-400 tracking-wider flex items-center gap-1.5">
                                      <span>⚠️ Candidati Esclusi dall'Organigramma (Punteggio &lt; 0 pt)</span>
                                      <span className="bg-red-500/20 text-red-300 px-1.5 py-0.2 rounded font-mono text-[9px]">{objectiveExcluded.length}</span>
                                    </div>
                                    <p className="text-[10px] text-slate-400">
                                      Candidati con punteggio inferiore a 0 punti:
                                    </p>
                                    <div className="flex flex-wrap gap-2 pt-1">
                                      {objectiveExcluded.map((cand) => (
                                        <div 
                                          key={cand.name}
                                          className="bg-black/60 border border-red-900/40 rounded-lg px-2.5 py-1 flex items-center gap-2 text-2xs"
                                        >
                                          <span className="font-bold text-slate-300">{cand.name}</span>
                                          <span className="text-red-400 font-mono font-bold">
                                            ({cand.score} pt)
                                          </span>
                                        </div>
                                      ))}
                                    </div>
                                  </div>
                                )}
                              </div>
                            </div>

                          </div>
                        </div>
                      );
                    })()
                  )}
                </>
              )}
          </div>
        )}

          {/* TAB: GESTIONE TOKEN DIPENDENTI */}
          {activeTab === "tokens" && (
            <div className="space-y-6 animate-fadeIn">
              {sessionInfo && !sessionInfo.canManageTokens ? (
                <div className="bg-[#161618] rounded-xl border border-red-500/20 p-8 text-center max-w-2xl mx-auto shadow-2xl backdrop-blur-md my-8">
                  <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/30 flex items-center justify-center mx-auto mb-4 text-red-400">
                    <Lock size={32} />
                  </div>
                  <h3 className="text-lg font-bold text-white mb-2">Accesso Riservato — Gestione Token Dipendenti</h3>
                  <p className="text-slate-300 text-xs leading-relaxed mb-6">
                    L'accesso, la generazione e la revoca dei Token Dipendenti sono riservati esclusivamente al personale con grado di <strong className="text-emerald-400 font-semibold">V. Direttore o superiore</strong> (Dirigenza Sanitaria e Amministrazione).
                  </p>
                  <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-lg bg-slate-900 border border-white/10 text-xs text-slate-400">
                    <span>Il tuo Ruolo Attuale:</span>
                    <span className="font-semibold text-slate-200">{sessionInfo.roleName || "In fase di verifica"}</span>
                    <span className="text-[10px] text-red-400 bg-red-950/60 px-1.5 py-0.5 rounded border border-red-500/20 font-mono">
                      Grado {sessionInfo.grade} &lt; 10
                    </span>
                  </div>
                </div>
              ) : (
                <>
                  {/* SEZIONE SPECIALE: GENERATORE TOKEN TEST (RISERVATO SOLO AL TOKEN PROPRIETARIO) */}
                  {isProprietarioUser && (
                    <div className="bg-gradient-to-r from-purple-950/40 via-[#161618] to-indigo-950/30 rounded-xl border border-purple-500/30 shadow-xl overflow-hidden">
                      <div className="px-6 py-4 bg-purple-500/10 border-b border-purple-500/20 flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-sm text-purple-200">
                          <Sparkles size={18} className="text-purple-400 animate-pulse" />
                          <span>Sezione Speciale: Generatore Token TEST con Scadenza Personalizzabile</span>
                        </div>
                        <span className="text-xs text-purple-300 bg-purple-500/20 px-2.5 py-1 rounded border border-purple-500/30 font-extrabold uppercase tracking-wider font-mono">
                          RISERVATO PROPRIETÀ
                        </span>
                      </div>

                      <form onSubmit={handleGenerateTestToken} className="p-6 space-y-4">
                        {testTokenError && (
                          <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-xs text-rose-300 flex items-center gap-2">
                            <AlertCircle size={16} className="text-rose-400 shrink-0" />
                            <span>{testTokenError}</span>
                          </div>
                        )}

                        {testTokenSuccessMessage && (
                          <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300 flex items-center gap-2">
                            <Check size={16} className="text-emerald-400 shrink-0" />
                            <span>{testTokenSuccessMessage}</span>
                          </div>
                        )}

                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-12 gap-3.5 items-end">
                          {/* Nome e Cognome TEST */}
                          <div className={`space-y-1.5 ${testDurationUnit === "unlimited" ? "xl:col-span-3" : "xl:col-span-3"}`}>
                            <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block truncate">
                              Nome / Etichetta TEST
                            </label>
                            <input
                              type="text"
                              required
                              value={testEmpFullName}
                              onChange={(e) => setTestEmpFullName(e.target.value)}
                              placeholder="Es. Tester CDA Segretario"
                              className="w-full bg-[#0A0A0B] border border-purple-500/30 rounded-lg py-2.5 px-3 text-sm text-white font-medium focus:outline-hidden focus:border-purple-500"
                            />
                          </div>

                          {/* Grado / Ruolo EMS TEST */}
                          <div className={`space-y-1.5 ${testDurationUnit === "unlimited" ? "xl:col-span-3" : "xl:col-span-2"}`}>
                            <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block truncate">
                              Ruolo EMS TEST
                            </label>
                            <select
                              value={testEmpRole}
                              onChange={(e) => setTestEmpRole(e.target.value)}
                              className="w-full bg-[#0A0A0B] border border-purple-500/30 rounded-lg py-2.5 px-3 text-sm text-white font-medium focus:outline-hidden focus:border-purple-500 truncate"
                            >
                              {ALLOWED_DISCORD_ROLES.filter((role) => {
                                if (!isHighOwner) {
                                  const clean = role.toLowerCase();
                                  if (clean.includes("proprietario") || clean.includes("consigliere finale")) {
                                    return false;
                                  }
                                }
                                return true;
                              }).map((role) => (
                                <option key={role} value={role}>
                                  {role}
                                </option>
                              ))}
                            </select>
                          </div>

                          {/* Ruolo CDA TEST */}
                          <div className="space-y-1.5 xl:col-span-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-amber-300 block flex items-center gap-1 truncate">
                              <Award size={13} className="text-amber-400 shrink-0" /> Ruolo CDA
                            </label>
                            <select
                              value={testEmpCdaRole}
                              onChange={(e) => setTestEmpCdaRole(e.target.value)}
                              className="w-full bg-[#0A0A0B] border border-amber-500/30 rounded-lg py-2.5 px-3 text-sm text-amber-200 font-medium focus:outline-hidden focus:border-amber-500 truncate"
                            >
                              <option value="DEFAULT">Nessun Ruolo CDA</option>
                              {isHighOwner && <option value="Consigliere Finale CDA">Consigliere Finale CDA</option>}
                              <option value="Presidente CDA">Presidente CDA</option>
                              <option value="Vice Presidente CDA">Vice Presidente CDA</option>
                              <option value="Segretario CDA">Segretario CDA</option>
                              <option value="Membro CDA">Membro CDA</option>
                            </select>
                          </div>

                          {/* Token Personalizzato */}
                          <div className="space-y-1.5 xl:col-span-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block truncate">
                              Token Personalizzato
                            </label>
                            <input
                              type="text"
                              value={testEmpCustomToken}
                              onChange={(e) => setTestEmpCustomToken(e.target.value)}
                              placeholder="Es. TEST-CUSTOM-123"
                              className="w-full bg-[#0A0A0B] border border-purple-500/30 rounded-lg py-2.5 px-3 text-sm text-white font-mono focus:outline-hidden focus:border-purple-500"
                            />
                          </div>

                          {/* Unità Durata */}
                          <div className="space-y-1.5 xl:col-span-2">
                            <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block flex items-center gap-1 truncate">
                              <Clock size={13} className="text-purple-400 shrink-0" /> Durata Token
                            </label>
                            <select
                              value={testDurationUnit}
                              onChange={(e) => setTestDurationUnit(e.target.value as any)}
                              className="w-full bg-[#0A0A0B] border border-purple-500/30 rounded-lg py-2.5 px-3 text-sm text-white font-medium focus:outline-hidden focus:border-purple-500 truncate"
                            >
                              <option value="minutes">Minuti</option>
                              <option value="hours">Ore</option>
                              <option value="days">Giorni</option>
                              <option value="unlimited">Senza Scadenza</option>
                            </select>
                          </div>

                          {/* Valore Durata (quando testDurationUnit !== 'unlimited') */}
                          {testDurationUnit !== "unlimited" && (
                            <div className="space-y-1.5 xl:col-span-1">
                              <label className="text-xs font-bold uppercase tracking-wider text-purple-300 block truncate">
                                Valore ({testDurationUnit === "minutes" ? "Min" : testDurationUnit === "hours" ? "Ore" : "Gg"})
                              </label>
                              <input
                                type="number"
                                min="1"
                                max="999"
                                required
                                value={testDurationValue}
                                onChange={(e) => setTestDurationValue(e.target.value)}
                                className="w-full bg-[#0A0A0B] border border-purple-500/30 rounded-lg py-2.5 px-2.5 text-sm text-white font-mono focus:outline-hidden focus:border-purple-500 text-center"
                              />
                            </div>
                          )}
                        </div>

                        <div className="pt-2 flex justify-end">
                          <button
                            type="submit"
                            disabled={isGeneratingTestToken}
                            className="px-6 py-2.5 bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-500 hover:to-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-lg transition-all flex items-center gap-2 cursor-pointer"
                          >
                            {isGeneratingTestToken ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                            ) : (
                              <>
                                <Sparkles size={16} />
                                <span>Genera Token TEST</span>
                              </>
                            )}
                          </button>
                        </div>
                      </form>
                    </div>
                  )}

                  {/* Form card to generate new employee token */}
              <div className="bg-[#161618] rounded-xl border border-white/5 shadow-md overflow-hidden">
                <div className="px-6 py-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                    <Key size={18} className="text-indigo-400" />
                    <span>Registrazione Dipendente & Generazione Token Standard</span>
                  </div>
                  <span className="text-xs text-indigo-400 bg-indigo-500/10 px-2.5 py-1 rounded border border-indigo-500/20 font-semibold">
                    Accesso Riservato Portale Elettore
                  </span>
                </div>

                <form onSubmit={handleGenerateEmployeeToken} className="p-6 space-y-4">
                  {tokenActionError && (
                    <div className="bg-rose-500/10 border border-rose-500/20 rounded-lg p-3 text-xs text-rose-300 flex items-center gap-2">
                      <AlertCircle size={16} className="text-rose-400 shrink-0" />
                      <span>{tokenActionError}</span>
                    </div>
                  )}

                  {tokenSuccessMessage && (
                    <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-lg p-3 text-xs text-emerald-300 flex items-center gap-2">
                      <Check size={16} className="text-emerald-400 shrink-0" />
                      <span>{tokenSuccessMessage}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
                    {/* Nome e Cognome */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                        Nome e Cognome Dipendente
                      </label>
                      <input
                        type="text"
                        required
                        value={newEmpFullName}
                        onChange={(e) => setNewEmpFullName(e.target.value)}
                        placeholder="Es. Mario Rossi"
                        className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg py-2.5 px-3 text-sm text-white font-medium focus:outline-hidden focus:border-indigo-500"
                      />
                    </div>

                    {/* Grado / Ruolo EMS */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                        Grado / Ruolo EMS
                      </label>
                      <select
                        value={newEmpRole}
                        onChange={(e) => setNewEmpRole(e.target.value)}
                        className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg py-2.5 px-3 text-sm text-white font-medium focus:outline-hidden focus:border-indigo-500"
                      >
                        {ALLOWED_DISCORD_ROLES.filter((role) => {
                          if (!isHighOwner) {
                            const clean = role.toLowerCase();
                            if (clean.includes("proprietario") || clean.includes("consigliere finale")) {
                              return false;
                            }
                          }
                          return true;
                        }).map((role) => (
                          <option key={role} value={role}>
                            {role}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Permesso & Ruolo CDA */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-amber-400 block flex items-center gap-1">
                        <Award size={13} className="text-amber-400" />
                        Ruolo / Accesso CDA
                      </label>
                      <select
                        value={newEmpCdaRole}
                        onChange={(e) => setNewEmpCdaRole(e.target.value)}
                        className="w-full bg-[#0A0A0B] border border-amber-500/30 rounded-lg py-2.5 px-3 text-sm text-amber-200 font-medium focus:outline-hidden focus:border-amber-500"
                      >
                        <option value="DEFAULT">Niente</option>
                        {isHighOwner && <option value="Consigliere Finale CDA">Consigliere Finale CDA</option>}
                        <option value="Presidente CDA">Presidente CDA</option>
                        <option value="Vice Presidente CDA">Vice Presidente CDA</option>
                        <option value="Segretario CDA">Segretario CDA</option>
                        <option value="Membro CDA">Membro CDA</option>
                      </select>
                    </div>

                    {/* Custom Token string (optional) */}
                    <div className="space-y-1.5">
                      <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                        Token Personalizzato (Opzionale)
                      </label>
                      <input
                        type="text"
                        value={newEmpCustomToken}
                        onChange={(e) => setNewEmpCustomToken(e.target.value)}
                        placeholder="Automatico se vuoto (es. EMS-A9F12B)"
                        className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg py-2.5 px-3 text-sm text-white font-mono focus:outline-hidden focus:border-indigo-500"
                      />
                    </div>
                  </div>

                  <div className="pt-2 flex justify-end">
                    <button
                      type="submit"
                      disabled={isGeneratingToken}
                      className="px-6 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-xs uppercase tracking-wider rounded-lg shadow-md transition-colors flex items-center gap-2 cursor-pointer"
                    >
                      {isGeneratingToken ? (
                        <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                      ) : (
                        <>
                          <Plus size={16} />
                          <span>Genera Token Dipendente</span>
                        </>
                      )}
                    </button>
                  </div>
                </form>
              </div>

              {/* Table of active employee tokens */}
              <div className="bg-[#161618] rounded-xl border border-white/5 shadow-md overflow-hidden">
                <div className="px-6 py-4 bg-white/5 border-b border-white/5 flex items-center justify-between">
                  <div className="flex items-center gap-2 font-bold text-sm text-slate-200">
                    <UserCheck size={18} className="text-emerald-400" />
                    <span>Registro Token Dipendenti Rilasciati ({visibleEmployeeTokens.length})</span>
                  </div>
                  <button
                    onClick={() => fetchEmployeeTokens()}
                    disabled={isLoadingTokens}
                    className="p-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded border border-white/10 text-xs flex items-center gap-1 cursor-pointer"
                  >
                    <RefreshCw size={12} className={isLoadingTokens ? "animate-spin" : ""} /> Aggiorna
                  </button>
                </div>

                {visibleEmployeeTokens.length === 0 ? (
                  <div className="p-8 text-center text-slate-400 text-xs">
                    Nessun token dipendente generato al momento. Compila il modulo in alto per accreditare il primo dipendente.
                  </div>
                ) : (
                  <div className="overflow-x-auto">
                    <table className="w-full text-left border-collapse">
                      <thead>
                        <tr className="bg-white/5 border-b border-white/5 text-[10px] uppercase font-bold text-slate-400 tracking-wider">
                          <th className="py-2.5 px-3.5 whitespace-nowrap">Dipendente (Nome e Cognome)</th>
                          <th className="py-2.5 px-3.5 whitespace-nowrap">Grado / Ruolo EMS</th>
                          <th className="py-2.5 px-3.5 whitespace-nowrap">Ruolo & Accesso CDA</th>
                          <th className="py-2.5 px-3.5 whitespace-nowrap">Token di Accesso</th>
                          <th className="py-2.5 px-3.5 whitespace-nowrap">Stato / Scadenza</th>
                          <th className="py-2.5 px-3.5 text-right whitespace-nowrap">Azione</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-white/5 text-xs text-slate-200">
                        {visibleEmployeeTokens.map((empToken) => {
                          const isExpired = empToken.expiresAt ? new Date().getTime() > new Date(empToken.expiresAt).getTime() : false;

                          return (
                            <tr key={empToken.token} className={`hover:bg-white/5 transition-colors ${isExpired ? "bg-rose-950/10 opacity-75" : ""}`}>
                              <td className="py-2.5 px-3.5 font-bold text-white whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <ShieldCheck size={16} className={empToken.isTestToken ? "text-purple-400 shrink-0" : "text-indigo-400 shrink-0"} />
                                  <div className="flex items-center gap-1.5 whitespace-nowrap">
                                    <span>{empToken.username}</span>
                                    {empToken.isTestToken && (
                                      <span className="h-5 px-1.5 bg-purple-500/20 text-purple-300 border border-purple-500/40 rounded text-[10px] font-bold font-mono inline-flex items-center gap-1 whitespace-nowrap shrink-0">
                                        <Sparkles size={10} className="text-purple-400 shrink-0" /> TEST
                                      </span>
                                    )}
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                <span className="h-6 px-2.5 bg-indigo-500/15 border border-indigo-500/30 text-indigo-300 font-semibold rounded-md text-[11px] inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0">
                                  {empToken.roleName}
                                </span>
                              </td>
                              <td className="py-2.5 px-3.5 whitespace-nowrap">
                                {empToken.cdaRoleName ? (
                                  <span className="h-6 px-2.5 bg-amber-500/20 text-amber-300 border border-amber-500/40 font-bold rounded-md text-[11px] inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0">
                                    <Award size={11} className="text-amber-400 shrink-0" />
                                    {empToken.cdaRoleName}
                                  </span>
                                ) : (
                                  <span className="h-6 px-2.5 bg-slate-800/80 text-slate-400 border border-slate-700/80 font-medium rounded-md text-[11px] inline-flex items-center justify-center gap-1 whitespace-nowrap shrink-0">
                                    Niente
                                  </span>
                                )}
                              </td>
                              <td className="py-2.5 px-3.5 font-mono font-bold text-amber-300 whitespace-nowrap">
                                <div className="flex items-center gap-2">
                                  <span>{empToken.token}</span>
                                  <button
                                    onClick={() => copyToClipboard(empToken.token)}
                                    className="p-1 bg-white/10 hover:bg-white/20 rounded text-slate-300 hover:text-white cursor-pointer transition-colors shrink-0"
                                    title="Copia Token"
                                  >
                                    {copiedToken === empToken.token ? (
                                      <Check size={12} className="text-emerald-400" />
                                    ) : (
                                      <Copy size={12} />
                                    )}
                                  </button>
                                </div>
                              </td>
                              <td className="py-2.5 px-3.5 text-xs whitespace-nowrap">
                                {(() => {
                                  if (empToken.expiresAt) {
                                    const diffMs = new Date(empToken.expiresAt).getTime() - nowMs;
                                    const isExp = diffMs <= 0;

                                    if (isExp) {
                                      return (
                                        <div className="flex flex-col gap-0.5">
                                          <span className="h-6 px-2.5 bg-rose-500/20 text-rose-300 border border-rose-500/30 rounded-md text-[11px] font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 w-fit">
                                            <Clock size={11} className="text-rose-400 shrink-0" /> SCADUTO
                                          </span>
                                          <span className="text-[10px] text-slate-400 font-mono">
                                            {new Date(empToken.expiresAt).toLocaleString("it-IT")}
                                          </span>
                                        </div>
                                      );
                                    }

                                    const totalSecs = Math.floor(diffMs / 1000);
                                    const days = Math.floor(totalSecs / 86400);
                                    const hours = Math.floor((totalSecs % 86400) / 3600);
                                    const minutes = Math.floor((totalSecs % 3600) / 60);
                                    const seconds = totalSecs % 60;

                                    const parts: string[] = [];
                                    if (days > 0) parts.push(`${days}g`);
                                    if (hours > 0 || days > 0) parts.push(`${hours}h`);
                                    if (minutes > 0 || hours > 0 || days > 0) parts.push(`${minutes}m`);
                                    parts.push(`${seconds}s`);

                                    return (
                                      <div className="flex flex-col gap-0.5">
                                        <span className="h-6 px-2.5 bg-amber-500/20 text-amber-200 border border-amber-500/40 rounded-md text-[11px] font-bold font-mono inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 w-fit">
                                          <Clock size={11} className="text-amber-400 shrink-0 animate-pulse" /> Durata Rimanente: {parts.join(" ")}
                                        </span>
                                        <span className="text-[10px] text-slate-400 font-mono">
                                          Scade: {new Date(empToken.expiresAt).toLocaleString("it-IT")}
                                        </span>
                                      </div>
                                    );
                                  }

                                  if (empToken.isTestToken) {
                                    return (
                                      <span className="h-6 px-2.5 bg-purple-500/20 text-purple-300 border border-purple-500/30 rounded-md text-[11px] font-bold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0">
                                        <Sparkles size={11} className="text-purple-400 shrink-0" /> TEST • Senza Scadenza
                                      </span>
                                    );
                                  }

                                  return (
                                    <span className="h-6 px-2.5 bg-emerald-500/10 text-emerald-300 border border-emerald-500/30 rounded-md text-[11px] font-semibold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0">
                                      Permanente
                                    </span>
                                  );
                                })()}
                              </td>
                              <td className="py-2.5 px-3.5 text-right whitespace-nowrap">
                                {empToken.isMaster ? (
                                  <span className="h-6 px-2.5 bg-amber-500/15 text-amber-300 border border-amber-500/30 rounded-md text-[11px] font-extrabold inline-flex items-center justify-center gap-1.5 whitespace-nowrap shrink-0 ml-auto">
                                    <Lock size={11} className="text-amber-400 shrink-0" /> Permanente (Master)
                                  </span>
                                ) : (
                                  <div className="flex items-center justify-end gap-1.5">
                                    <button
                                      onClick={() => handleStartEditToken(empToken)}
                                      className="h-6 px-2.5 bg-slate-700/60 hover:bg-slate-600/80 text-slate-200 border border-slate-500/40 rounded-md text-[11px] font-semibold cursor-pointer transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                                      title="Modifica Nome, Grado e Ruolo CDA"
                                    >
                                      <Edit2 size={11} className="shrink-0" /> Configura
                                    </button>
                                    <button
                                      onClick={() => setTokenToConfirmRevoke(empToken)}
                                      className="h-6 px-2.5 bg-rose-500/10 hover:bg-rose-500/20 text-rose-400 border border-rose-500/20 rounded-md text-[11px] font-semibold cursor-pointer transition-colors flex items-center gap-1 whitespace-nowrap shrink-0"
                                      title="Revoca Token"
                                    >
                                      <Trash2 size={11} className="shrink-0" />
                                    </button>
                                  </div>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                )}
              </div>

              {/* Edit Token Permissions Modal */}
              <AnimatePresence>
                {editingTokenObj && (
                  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-[#161618] border border-amber-500/30 rounded-xl shadow-2xl max-w-lg w-full overflow-hidden"
                    >
                      <div className="p-4 bg-amber-500/10 border-b border-amber-500/20 flex items-center justify-between">
                        <div className="flex items-center gap-2 font-bold text-amber-300 text-sm">
                          <Settings size={18} />
                          <span>Configurazione Token & Permessi Utente</span>
                        </div>
                        <button
                          onClick={() => setEditingTokenObj(null)}
                          className="p-1 hover:bg-white/10 rounded text-slate-400 hover:text-white cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="p-6 space-y-4">
                        {tokenActionError && (
                          <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-lg flex items-center gap-2">
                            <AlertCircle size={14} className="shrink-0 text-rose-400" />
                            <span>{tokenActionError}</span>
                          </div>
                        )}

                        {/* Codice Token (Editable) */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-amber-300 block">
                            Codice Token (Identificativo Accesso)
                          </label>
                          <input
                            type="text"
                            value={editEmpToken}
                            onChange={(e) => setEditEmpToken(e.target.value.toUpperCase())}
                            placeholder="Es. EMS-12345"
                            className="w-full bg-[#0A0A0B] border border-amber-500/30 rounded-lg py-2.5 px-3 text-sm text-amber-300 font-mono font-bold focus:outline-hidden focus:border-amber-500"
                          />
                        </div>

                        {/* Nome Dipendente */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                            Nome e Cognome Dipendente (Titolare Token)
                          </label>
                          <input
                            type="text"
                            value={editEmpFullName}
                            onChange={(e) => setEditEmpFullName(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg py-2.5 px-3 text-sm text-white font-medium focus:outline-hidden focus:border-amber-500"
                          />
                        </div>

                        {/* Grado / Ruolo EMS */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-slate-400 block">
                            Grado EMS (Generale)
                          </label>
                          <select
                            value={editEmpRole}
                            onChange={(e) => setEditEmpRole(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg py-2.5 px-3 text-sm text-white font-medium focus:outline-hidden focus:border-amber-500"
                          >
                            {ALLOWED_DISCORD_ROLES.filter((role) => {
                              if (!isHighOwner) {
                                const clean = role.toLowerCase();
                                if (clean.includes("proprietario") || clean.includes("consigliere finale")) {
                                  return false;
                                }
                              }
                              return true;
                            }).map((role) => (
                              <option key={role} value={role}>
                                {role}
                              </option>
                            ))}
                          </select>
                        </div>

                        {/* Custom Role / Access Override */}
                        <div className="space-y-1.5">
                          <label className="text-xs font-bold uppercase tracking-wider text-amber-400 block flex items-center gap-1">
                            <Award size={14} className="text-amber-400" />
                            Incarico Speciale / Ruolo Area CDA
                          </label>
                          <select
                            value={editEmpCdaRole}
                            onChange={(e) => setEditEmpCdaRole(e.target.value)}
                            className="w-full bg-[#0A0A0B] border border-amber-500/40 rounded-lg py-2.5 px-3 text-sm text-amber-200 font-bold focus:outline-hidden focus:border-amber-500"
                          >
                            <option value="DEFAULT">Nessuno</option>
                            {isHighOwner && <option value="Consigliere Finale CDA">Consigliere Finale CDA</option>}
                            <option value="Presidente CDA">Presidente CDA</option>
                            <option value="Vice Presidente CDA">Vice Presidente CDA</option>
                            <option value="Segretario CDA">Segretario CDA</option>
                            <option value="Membro CDA">Membro CDA</option>
                          </select>
                          <p className="text-[11px] text-slate-400 pt-1 leading-relaxed">
                            Se selezioni un ruolo o incarico specifico, questo token avrà accesso alla relativa area con i poteri di voto e gestione dedicati, indipendentemente dal suo grado generale.
                          </p>
                        </div>

                        <div className="pt-4 flex items-center justify-end gap-2 border-t border-white/5">
                          <button
                            type="button"
                            onClick={() => setEditingTokenObj(null)}
                            className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs rounded-lg transition-colors cursor-pointer"
                          >
                            Annulla
                          </button>
                          <button
                            type="button"
                            disabled={isUpdatingToken}
                            onClick={handleSaveTokenPermissions}
                            className="px-5 py-2 bg-amber-500 hover:bg-amber-400 text-black font-extrabold text-xs uppercase tracking-wider rounded-lg shadow-md transition-colors flex items-center gap-1.5 cursor-pointer"
                          >
                            {isUpdatingToken ? (
                              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-black" />
                            ) : (
                              <>
                                <Check size={16} />
                                <span>Salva Configurazione</span>
                              </>
                            )}
                          </button>
                        </div>
                      </div>
                    </motion.div>
                  </div>
                )}

                {/* Modal Conferma Eliminazione Definitiva Token */}
                {tokenToConfirmRevoke && (
                  <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4">
                    <motion.div
                      initial={{ opacity: 0, scale: 0.95 }}
                      animate={{ opacity: 1, scale: 1 }}
                      exit={{ opacity: 0, scale: 0.95 }}
                      className="bg-[#161618] border border-rose-500/30 rounded-xl shadow-2xl max-w-md w-full overflow-hidden"
                    >
                      <div className="bg-rose-500/10 border-b border-rose-500/20 p-4 flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <div className="p-2 bg-rose-500/20 rounded-lg text-rose-400">
                            <AlertCircle size={20} />
                          </div>
                          <div>
                            <h3 className="text-sm font-bold text-white">Conferma Eliminazione Definitiva</h3>
                            <p className="text-[11px] text-rose-300/80">Revoca permanente token d'accesso</p>
                          </div>
                        </div>
                        <button
                          type="button"
                          onClick={() => setTokenToConfirmRevoke(null)}
                          className="p-1 hover:bg-white/10 rounded-lg text-slate-400 hover:text-white transition-colors cursor-pointer"
                        >
                          <X size={16} />
                        </button>
                      </div>

                      <div className="p-5 space-y-4 text-xs text-slate-300">
                        <p>
                          Sei sicuro di voler eliminare <span className="font-bold text-white">DEFINITIVAMENTE</span> il token per:
                        </p>
                        <div className="p-3 bg-[#0A0A0B] border border-white/10 rounded-lg space-y-2">
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Dipendente:</span>
                            <span className="font-bold text-white">{tokenToConfirmRevoke.username}</span>
                          </div>
                          <div className="flex justify-between items-center">
                            <span className="text-slate-400">Grado / Ruolo:</span>
                            <span className="font-semibold text-indigo-300">{tokenToConfirmRevoke.roleName}</span>
                          </div>
                          <div className="flex justify-between items-center font-mono">
                            <span className="text-slate-400">Token:</span>
                            <span className="font-bold text-amber-300">{tokenToConfirmRevoke.token}</span>
                          </div>
                        </div>

                        <div className="p-3 bg-amber-500/10 border border-amber-500/20 rounded-lg text-amber-200 text-[11px] space-y-1">
                          <p className="font-bold flex items-center gap-1 text-amber-300">
                            <AlertCircle size={13} className="shrink-0" /> Attenzione:
                          </p>
                          <p>
                            L'utente verrà disconnesso all'istante e il token non verrà più ricreato in automatico dopo il riavvio o l'aggiornamento del sito.
                          </p>
                        </div>
                      </div>

                      <div className="bg-white/5 border-t border-white/5 p-4 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => setTokenToConfirmRevoke(null)}
                          disabled={isRevokingToken}
                          className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-lg transition-colors cursor-pointer"
                        >
                          Annulla
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            setIsRevokingToken(true);
                            await handleRevokeToken(tokenToConfirmRevoke.token);
                            setIsRevokingToken(false);
                            setTokenToConfirmRevoke(null);
                          }}
                          disabled={isRevokingToken}
                          className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-lg transition-colors flex items-center gap-1.5 cursor-pointer shadow-md"
                        >
                          {isRevokingToken ? (
                            <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                          ) : (
                            <>
                              <Trash2 size={13} />
                              <span>Sì, Elimina Definitivamente</span>
                            </>
                          )}
                        </button>
                      </div>
                    </motion.div>
                  </div>
                )}
              </AnimatePresence>
                </>
              )}
            </div>
          )}

          {/* TAB 5: LOG ACCESSI */}
          {activeTab === "logs" && (
            <div className="space-y-6 animate-fadeIn">
              {/* Header card for access logs */}
              <div className="bg-[#161618] rounded-xl border border-white/5 shadow-md p-6 flex flex-col md:flex-row md:items-center justify-between gap-4">
                <div>
                  <div className="flex items-center gap-2 mb-1 flex-wrap">
                    <History size={20} className="text-indigo-400" />
                    <h3 className="font-bold text-lg text-white">Registro Log degli Accessi</h3>
                    <span className="text-2xs bg-indigo-500/20 text-indigo-300 px-2.5 py-0.5 rounded-full border border-indigo-500/30 font-bold">
                      {accessLogs.length} eventi
                    </span>
                    <span className="flex items-center gap-1.5 text-2xs bg-emerald-500/10 text-emerald-400 px-2.5 py-0.5 rounded-full border border-emerald-500/20 font-bold">
                      <span className="w-2 h-2 rounded-full bg-emerald-400 animate-pulse"></span>
                      Tempo Reale Attivo (2.5s)
                    </span>
                  </div>
                  <p className="text-xs text-slate-400">
                    Tracciamento automatico ed in tempo reale degli accessi al portale, autorizzazioni token, tentativi di login, voti, candidature e modifiche amministrative effettuate dagli utenti.
                  </p>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  <button
                    onClick={() => fetchAccessLogs(token!)}
                    disabled={isLoadingLogs}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold text-xs rounded-lg border border-white/10 cursor-pointer active:scale-95 transition-all"
                  >
                    <RefreshCw size={14} className={isLoadingLogs ? "animate-spin" : ""} />
                    <span>Aggiorna</span>
                  </button>

                  <button
                    onClick={() => setShowClearLogsModal(true)}
                    disabled={accessLogs.length === 0}
                    className="flex items-center gap-1.5 px-3.5 py-2 bg-red-500/10 hover:bg-red-500/20 disabled:opacity-40 text-red-400 font-semibold text-xs rounded-lg border border-red-500/20 cursor-pointer active:scale-95 transition-all"
                  >
                    <Trash2 size={14} />
                    <span>Svuota Log</span>
                  </button>
                </div>
              </div>

              {/* Filters bar */}
              <div className="bg-[#161618] rounded-xl border border-white/5 shadow-md p-4 flex flex-col gap-4">
                <div className="flex flex-col md:flex-row items-center justify-between gap-4">
                  {/* Search input */}
                  <div className="relative w-full md:w-80">
                    <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
                    <input
                      type="text"
                      value={logsFilterText}
                      onChange={(e) => setLogsFilterText(e.target.value)}
                      placeholder="Cerca per Utente, IP, Token, Azione..."
                      className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg pl-9 pr-3 py-2 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                    />
                    {logsFilterText && (
                      <button
                        onClick={() => setLogsFilterText("")}
                        className="absolute right-2.5 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      >
                        <X size={12} />
                      </button>
                    )}
                  </div>

                  {/* Status filter pills */}
                  <div className="flex items-center gap-1.5 flex-wrap">
                    <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                      <Filter size={12} /> Stato:
                    </span>
                    {[
                      { id: "ALL", label: "Tutti" },
                      { id: "SUCCESS", label: "Successo" },
                      { id: "DENIED", label: "Negato" },
                      { id: "REVOKED", label: "Revocato" },
                      { id: "INFO", label: "Info" },
                    ].map((btn) => (
                      <button
                        key={btn.id}
                        onClick={() => setLogsStatusFilter(btn.id)}
                        className={`px-3 py-1 rounded-full text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                          logsStatusFilter === btn.id
                            ? "bg-indigo-600 text-white shadow-sm"
                            : "bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5"
                        }`}
                      >
                        {btn.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Category filter pills */}
                <div className="flex items-center gap-1.5 flex-wrap pt-3 border-t border-white/5">
                  <span className="text-2xs font-bold uppercase tracking-wider text-slate-400 mr-1 flex items-center gap-1">
                    <Filter size={12} /> Categoria Log:
                  </span>
                  {[
                    { id: "ALL", label: "Tutte le Categorie" },
                    { id: "ACCESSI", label: "Accessi Sito / Token" },
                    { id: "CANDIDATURE", label: "Candidature" },
                    { id: "CDA", label: "CDA (Consiglio Amministrazione)" },
                    { id: "MODIFICHE_ADMIN", label: "Modifiche Admin" },
                    { id: "VOTI", label: "Voti" },
                  ].map((btn) => (
                    <button
                      key={btn.id}
                      onClick={() => setLogsCategoryFilter(btn.id)}
                      className={`px-3 py-1.5 rounded-lg text-2xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        logsCategoryFilter === btn.id
                          ? "bg-purple-600 text-white shadow-sm border border-purple-400/40"
                          : "bg-white/5 text-slate-400 hover:text-slate-200 border border-white/5"
                      }`}
                    >
                      {btn.label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Logs Table */}
              <div className="bg-[#161618] rounded-xl border border-white/5 shadow-md overflow-hidden">
                {/* Top Scrollbar Bar */}
                <div
                  ref={topLogsScrollRef}
                  onScroll={handleTopLogsScroll}
                  className="overflow-x-auto dark-scrollbar border-b border-white/5 bg-[#0A0A0B] py-1"
                >
                  <div style={{ width: logsTableWidth ? `${logsTableWidth}px` : "1200px", height: "4px" }} />
                </div>

                {/* Main Table Container with Bottom Scrollbar */}
                <div
                  ref={bottomLogsScrollRef}
                  onScroll={handleBottomLogsScroll}
                  className="overflow-x-auto dark-scrollbar"
                >
                  <table ref={logsTableRef} className="w-full text-left text-xs min-w-[1100px]">
                    <thead className="bg-[#0A0A0B] border-b border-white/5 text-slate-400 font-bold uppercase text-[10px] tracking-wider">
                      <tr>
                        <th className="p-3.5">Data e Ora</th>
                        <th className="p-3.5">Categoria</th>
                        <th className="p-3.5">Esito</th>
                        <th className="p-3.5">Azione / Evento</th>
                        <th className="p-3.5">Utente / Dipendente</th>
                        <th className="p-3.5">Grado</th>
                        <th className="p-3.5">Token</th>
                        <th className="p-3.5">IP Client</th>
                        <th className="p-3.5">Dettagli Evento</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 text-slate-300">
                      {filteredAccessLogs.length === 0 ? (
                        <tr>
                          <td colSpan={9} className="p-8 text-center text-slate-500">
                            Nessun log degli accessi trovato per i filtri selezionati.
                          </td>
                        </tr>
                      ) : (
                        filteredAccessLogs.map((log) => (
                          <tr key={log.id} className="hover:bg-white/[0.02] transition-colors">
                            <td className="p-3.5 font-mono text-slate-400 whitespace-nowrap text-[11px]">
                              {new Date(log.timestamp).toLocaleString("it-IT", {
                                day: "2-digit",
                                month: "2-digit",
                                year: "numeric",
                                hour: "2-digit",
                                minute: "2-digit",
                                second: "2-digit",
                              })}
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              {log.category === "CANDIDATURE" && (
                                <span className="inline-block bg-purple-500/15 text-purple-300 border border-purple-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                  Candidature
                                </span>
                              )}
                              {log.category === "CDA" && (
                                <span className="inline-block bg-amber-400/15 text-amber-300 border border-amber-400/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                  CDA
                                </span>
                              )}
                              {log.category === "MODIFICHE_ADMIN" && (
                                <span className="inline-block bg-rose-500/15 text-rose-300 border border-rose-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                  Modifica Admin
                                </span>
                              )}
                              {log.category === "VOTI" && (
                                <span className="inline-block bg-blue-500/15 text-blue-300 border border-blue-500/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                  Voti
                                </span>
                              )}
                              {(!log.category || log.category === "ACCESSI") && (
                                <span className="inline-block bg-sky-400/15 text-sky-300 border border-sky-400/30 px-2 py-0.5 rounded text-[10px] font-bold uppercase">
                                  Accessi
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              {log.status === "SUCCESS" && (
                                <span className="inline-flex items-center gap-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase">
                                  <Check size={10} /> Successo
                                </span>
                              )}
                              {log.status === "DENIED" && (
                                <span className="inline-flex items-center gap-1 bg-red-500/10 text-red-400 border border-red-500/20 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase">
                                  <X size={10} /> Negato
                                </span>
                              )}
                              {log.status === "REVOKED" && (
                                <span className="inline-flex items-center gap-1 bg-amber-500/10 text-amber-400 border border-amber-500/20 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase">
                                  <ShieldAlert size={10} /> Revocato
                                </span>
                              )}
                              {log.status === "INFO" && (
                                <span className="inline-flex items-center gap-1 bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded text-[10px] font-extrabold uppercase">
                                  <Clock size={10} /> Info
                                </span>
                              )}
                            </td>
                            <td className="p-3.5 font-bold text-white whitespace-nowrap">
                              {log.action}
                            </td>
                            <td className="p-3.5 font-medium text-slate-200 whitespace-nowrap">
                              {log.username}
                            </td>
                            <td className="p-3.5 whitespace-nowrap">
                              {log.roleName !== "-" ? (
                                <span className="inline-block px-2.5 py-1 bg-indigo-500/10 border border-indigo-500/20 text-indigo-300 font-semibold rounded text-[10px]">
                                  {log.roleName}
                                </span>
                              ) : (
                                <span className="text-slate-500">-</span>
                              )}
                            </td>
                            <td className="p-3.5 font-mono text-[11px] text-slate-400 whitespace-nowrap">
                              {log.token}
                            </td>
                            <td className="p-3.5 font-mono text-[11px] text-indigo-300 bg-indigo-950/30 px-2 py-0.5 rounded border border-indigo-500/20 whitespace-nowrap">
                              {log.ip}
                            </td>
                            <td className="p-3.5 text-slate-400 max-w-xs truncate" title={log.details || ""}>
                              {log.details}
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: IMPOSTAZIONI SITO */}
          {activeTab === "settings" && (
            <div className="max-w-2xl mx-auto bg-[#161618] rounded-xl border border-white/5 shadow-md overflow-hidden animate-fadeIn">
              <div className="px-6 py-4 bg-white/5 border-b border-white/5 font-bold text-sm text-slate-300">
                Impostazioni del Portale Votazioni
              </div>

              <form onSubmit={handleSaveSettings} className="p-6 space-y-6">
                {settingsSuccessMessage && (
                  <div className="bg-emerald-500/10 border border-emerald-500/20 text-emerald-400 text-xs rounded-lg p-3.5 flex items-center gap-2">
                    <Check size={16} strokeWidth={2.5} className="text-emerald-400 shrink-0" />
                    <span className="font-semibold">{settingsSuccessMessage}</span>
                  </div>
                )}

                <div className="space-y-4">
                  <div className="space-y-1.5">
                    <label htmlFor="settings-title" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Titolo Principale del Portale
                    </label>
                    <input
                      id="settings-title"
                      type="text"
                      required
                      value={editTitle}
                      onChange={(e) => setEditTitle(e.target.value)}
                      placeholder="Titolo"
                      className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg py-2.5 px-3 text-sm text-white font-medium focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <label htmlFor="settings-description" className="text-xs font-bold uppercase tracking-wider text-slate-400">
                      Descrizione / Istruzioni di Voto
                    </label>
                    <textarea
                      id="settings-description"
                      required
                      rows={3}
                      value={editDescription}
                      onChange={(e) => setEditDescription(e.target.value)}
                      placeholder="Istruzioni"
                      className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg py-2.5 px-3 text-sm text-white font-medium focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 leading-normal"
                    />
                  </div>

                  {/* Toggles */}
                  <div className="pt-4 border-t border-white/5 space-y-4">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 mb-3">Opzioni del Flusso Voto</h4>
                    
                    <label className="flex items-center justify-between p-3.5 bg-[#0A0A0B]/60 hover:bg-[#0A0A0B]/90 border border-white/5 rounded-lg cursor-pointer select-none transition-colors">
                      <div className="pr-4">
                        <span className="block text-xs font-bold text-slate-200">Abilita Votazioni (Stato Aperto)</span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">Se disattivato, gli utenti visualizzeranno la scheda elettorale ma non potranno inviare i voti.</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={editVotingActive}
                        onChange={(e) => setEditVotingActive(e.target.checked)}
                        className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3.5 bg-[#0A0A0B]/60 hover:bg-[#0A0A0B]/90 border border-white/5 rounded-lg cursor-pointer select-none transition-colors">
                      <div className="pr-4">
                        <span className="block text-xs font-bold text-slate-200">Consenti Voto Multiplo per Carica</span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">Se attivato, l'utente può esprimere più preferenze (checkbox) per ruolo; se disattivato, solo una scelta (radio).</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={editAllowMultiple}
                        onChange={(e) => setEditAllowMultiple(e.target.checked)}
                        className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                      />
                    </label>

                    <label className="flex items-center justify-between p-3.5 bg-[#0A0A0B]/60 hover:bg-[#0A0A0B]/90 border border-white/5 rounded-lg cursor-pointer select-none transition-colors">
                      <div className="pr-4">
                        <span className="block text-xs font-bold text-slate-200">Forza voto per tutti i 12 ruoli</span>
                        <span className="block text-[10px] text-slate-400 mt-0.5">Se attivato, l'elettore deve selezionare almeno una preferenza per ciascuno dei ruoli per convalidare l'invio.</span>
                      </div>
                      <input
                        type="checkbox"
                        checked={editRequireAll}
                        onChange={(e) => setEditRequireAll(e.target.checked)}
                        className="w-4 h-4 accent-indigo-500 rounded cursor-pointer"
                      />
                    </label>

                  </div>

                  {/* Change password */}
                  <div className="pt-4 border-t border-white/5 space-y-3">
                    <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">Cambia Password Amministrazione</h4>
                    
                    <div className="space-y-1">
                      <input
                        type="password"
                        value={newAdminPassword}
                        onChange={(e) => setNewAdminPassword(e.target.value)}
                        placeholder="Inserisci nuova password (min. 6 caratteri)"
                        className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg py-2.5 px-3 text-sm text-white focus:outline-hidden focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 font-medium"
                      />
                      <p className="text-[10px] text-slate-400">
                        Lascia il campo vuoto se non desideri modificare la password d'accesso corrente.
                      </p>
                    </div>
                  </div>

                  {/* Change emergency password */}
                  <div className="pt-4 border-t border-white/5 space-y-3">
                    <div className="flex items-center justify-between">
                      <h4 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                        <Lock size={14} className="text-amber-400" /> Password di Sblocco d'Emergenza
                      </h4>
                      <span className="text-[10px] bg-amber-500/10 text-amber-300 border border-amber-500/20 px-2 py-0.5 rounded font-mono font-bold">
                        Bypass Blocco IP
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300 leading-relaxed">
                      Questa password consente all'amministratore di sbloccare l'area riservata e rimuovere immediatamente i blocchi di sicurezza generati da troppi tentativi falliti.
                    </p>
                    
                    <div className="space-y-1">
                      <input
                        type="password"
                        value={newEmergencyPassword}
                        onChange={(e) => setNewEmergencyPassword(e.target.value)}
                        placeholder="Inserisci nuova password di sblocco d'emergenza (min. 6 caratteri)"
                        className="w-full bg-[#0A0A0B] border border-amber-500/30 rounded-lg py-2.5 px-3 text-sm text-white focus:outline-hidden focus:border-amber-400 focus:ring-1 focus:ring-amber-400 font-medium"
                      />
                      <p className="text-[10px] text-slate-400">
                        Predefinito iniziale: <span className="font-mono text-slate-300 font-semibold">sblocco123</span>. Lascia il campo vuoto se non desideri modificarla.
                      </p>
                    </div>
                  </div>
                </div>

                <div className="pt-4 border-t border-white/5 flex justify-end">
                  <button
                    type="submit"
                    disabled={isSavingSettings}
                    className="px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 text-white font-semibold text-xs rounded-lg shadow-sm cursor-pointer transition-colors active:scale-95 flex items-center gap-1.5"
                  >
                    {isSavingSettings ? (
                      <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                    ) : (
                      <>
                        <Check size={14} strokeWidth={2.5} />
                        <span>Salva Impostazioni</span>
                      </>
                    )}
                  </button>
                </div>
              </form>
            </div>
          )}

          {/* TAB 7: GERARCHIA EMS */}
          {activeTab === "hierarchy" && (
            <div className="animate-fadeIn">
              <EmsHierarchy isAdmin={true} adminToken={token || undefined} />
            </div>
          )}

          {/* TAB 8: GESTIONE CANDIDATURE */}
          {activeTab === "candidature" && (
            <div className="space-y-6 animate-fadeIn">
              {/* Header Stats */}
              <div className="grid grid-cols-1 sm:grid-cols-4 gap-4">
                <div className="bg-[#161618] border border-white/5 rounded-xl p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-400">
                    Totale Candidature
                  </span>
                  <p className="text-2xl font-black text-white mt-1">{candidatureList.length}</p>
                </div>
                <div className="bg-[#161618] border border-slate-700/80 rounded-xl p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-slate-300 flex items-center gap-1">
                    <RefreshCw size={12} className="animate-spin text-slate-400" /> In Valutazione
                  </span>
                  <p className="text-2xl font-black text-slate-200 mt-1">
                    {candidatureList.filter((c) => c.status === "PENDING").length}
                  </p>
                </div>
                <div className="bg-[#161618] border border-emerald-500/20 rounded-xl p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-emerald-400">
                    Accettate
                  </span>
                  <p className="text-2xl font-black text-emerald-300 mt-1">
                    {candidatureList.filter((c) => c.status === "APPROVED").length}
                  </p>
                </div>
                <div className="bg-[#161618] border border-rose-500/20 rounded-xl p-4">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-rose-400">
                    Rifiutate
                  </span>
                  <p className="text-2xl font-black text-rose-300 mt-1">
                    {candidatureList.filter((c) => c.status === "REJECTED").length}
                  </p>
                </div>
              </div>

              {/* Filters & Actions bar */}
              <div className="bg-[#161618] border border-white/5 rounded-xl p-4 flex flex-col sm:flex-row items-center justify-between gap-4">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="text-xs font-bold uppercase tracking-wider text-slate-400 mr-2 flex items-center gap-1">
                    <Filter size={14} /> Filtra:
                  </span>
                  {(["ALL", "PENDING", "APPROVED", "REJECTED"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setCandidatureFilterStatus(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold uppercase tracking-wider transition-all cursor-pointer ${
                        candidatureFilterStatus === st
                          ? "bg-indigo-600 text-white shadow-sm"
                          : "bg-white/5 hover:bg-white/10 text-slate-400"
                      }`}
                    >
                      {st === "ALL" && "Tutte"}
                      {st === "PENDING" && "(In Valutazione)"}
                      {st === "APPROVED" && "Accettate"}
                      {st === "REJECTED" && "Rifiutate"}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => fetchCandidature(token)}
                  className="flex items-center gap-1.5 text-xs text-slate-300 bg-white/5 hover:bg-white/10 px-3 py-1.5 rounded-lg border border-white/10 transition-colors cursor-pointer"
                >
                  <RefreshCw size={14} className={isLoadingCandidature ? "animate-spin" : ""} />
                  Aggiorna Lista
                </button>
              </div>

              {/* Candidature Items */}
              {isLoadingCandidature ? (
                <div className="text-center py-12 text-slate-400 bg-[#161618] rounded-xl border border-white/5">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400 mx-auto mb-2" />
                  <p className="text-xs font-medium">Caricamento candidature in corso...</p>
                </div>
              ) : filteredCandidatureList.length === 0 ? (
                <div className="text-center py-12 text-slate-400 bg-[#161618] rounded-xl border border-white/5">
                  <FileText size={32} className="mx-auto mb-2 text-slate-600" />
                  <p className="text-sm font-semibold">Nessuna candidatura trovata.</p>
                  <p className="text-xs text-slate-500 mt-1">Non ci sono candidature registrate con i filtri selezionati.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredCandidatureList.map((cand) => (
                    <div
                      key={cand.id}
                      className={`bg-[#161618] rounded-2xl border p-5 sm:p-6 transition-all space-y-4 ${
                        cand.status === "PENDING"
                          ? "border-slate-700 shadow-lg shadow-black/20"
                          : cand.status === "APPROVED"
                          ? "border-emerald-500/30"
                          : "border-rose-500/30"
                      }`}
                    >
                      {/* Top Header */}
                      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-white/5">
                        <div className="flex items-center gap-3">
                          <div className="p-2.5 bg-white/5 rounded-xl text-indigo-400 border border-white/10">
                            <Users size={20} />
                          </div>
                          <div>
                            <h3 className="text-base font-bold text-white flex items-center gap-2">
                              {cand.fullName}
                              {cand.token && (
                                <span className="text-2xs font-mono font-normal text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                  {cand.token}
                                </span>
                              )}
                            </h3>
                            <p className="text-2xs text-slate-400 font-medium">
                              Inviata il: {new Date(cand.submittedAt).toLocaleString("it-IT")} • ID: {cand.id}
                            </p>
                          </div>
                        </div>

                        {/* Status Badge */}
                        <div>
                          {cand.status === "PENDING" && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-slate-300 text-xs font-bold border border-slate-600">
                              <RefreshCw size={12} className="animate-spin text-slate-400" />
                              (in valutazione)
                            </span>
                          )}
                          {cand.status === "APPROVED" && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold border border-emerald-500/30">
                              <Check size={12} /> Accettata
                            </span>
                          )}
                          {cand.status === "REJECTED" && (
                            <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold border border-rose-500/30">
                              <X size={12} /> Rifiutata
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Main Details Grid */}
                      <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
                        <div className="bg-[#0A0A0B] p-3 rounded-xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Ruolo Attuale
                          </span>
                          <div>
                            {(() => {
                              const badge = getRoleBadgeStyle(cand.currentRole);
                              return (
                                <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs ${badge.className}`} style={badge.style}>
                                  {cand.currentRole}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="bg-[#0A0A0B] p-3 rounded-xl border border-white/5 space-y-1">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Ruolo Desiderato
                          </span>
                          <div>
                            {(() => {
                              const badge = getRoleBadgeStyle(cand.desiredRole);
                              return (
                                <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs ${badge.className}`} style={badge.style}>
                                  {cand.desiredRole}
                                </span>
                              );
                            })()}
                          </div>
                        </div>

                        <div className="bg-[#0A0A0B] p-3 rounded-xl border border-white/5">
                          <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                            Fascia Oraria Lavorativa
                          </span>
                          <span className="text-xs font-medium text-slate-200 mt-0.5 block">
                            {cand.timeSlot}
                          </span>
                        </div>
                      </div>

                      {/* Offer Description (5+ lines text) */}
                      <div className="bg-[#0A0A0B] p-4 rounded-xl border border-white/5 space-y-1.5">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                          Cosa Offre come Persona / Dipendente:
                        </span>
                        <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans bg-[#121214] p-3 rounded-lg border border-white/5">
                          {cand.offerText}
                        </div>
                      </div>

                      {/* Rejection reason box if rejected */}
                      {cand.status === "REJECTED" && (
                        <div className="bg-rose-950/30 border border-rose-900/50 p-3.5 rounded-xl text-xs space-y-1">
                          <span className="font-bold text-rose-300 flex items-center gap-1 text-[11px] uppercase tracking-wider">
                            <AlertCircle size={12} /> Motivo del Rifiuto:
                          </span>
                          <p className="text-rose-200">{cand.rejectionReason || "Nessun motivo specificato."}</p>
                          {cand.reviewedBy && (
                            <p className="text-2xs text-rose-400/70 pt-1">
                              Rifiutato da: {cand.reviewedBy}
                            </p>
                          )}
                        </div>
                      )}

                      {/* Approval Info if approved */}
                      {cand.status === "APPROVED" && cand.reviewedBy && (
                        <div className="bg-emerald-950/20 border border-emerald-900/40 p-3 rounded-xl text-xs text-emerald-300 flex items-center justify-between">
                          <span>Accettato da: <strong>{cand.reviewedBy}</strong></span>
                          {cand.reviewedAt && (
                            <span className="text-2xs text-emerald-400/80">
                              {new Date(cand.reviewedAt).toLocaleString("it-IT")}
                            </span>
                          )}
                        </div>
                      )}

                      {/* Admin Actions */}
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/5">
                        <button
                          onClick={() => handleOpenResetModal(cand)}
                          className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-extrabold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                          title="Annulla la decisione del Vice Presidente / Presidente e risetta la candidatura a Votazione CDA (timer 24h)"
                        >
                          <RotateCcw size={14} />
                          <span>Risetta a Votazione CDA</span>
                        </button>

                        {cand.status !== "APPROVED" && (
                          <button
                            onClick={() => handleApproveCandidatura(cand.id)}
                            disabled={approvingId === cand.id}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
                          >
                            {approvingId === cand.id ? (
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                            ) : (
                              <>
                                <Check size={14} /> Accetta Candidatura
                              </>
                            )}
                          </button>
                        )}

                        {cand.status !== "REJECTED" && (
                          <button
                            onClick={() => handleOpenRejectModal(cand)}
                            className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
                          >
                            <X size={14} /> Rifiuta Candidatura
                          </button>
                        )}

                        <button
                          onClick={() => handleOpenDeleteCandidaturaModal(cand)}
                          className="p-2 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl border border-white/5 cursor-pointer transition-colors"
                          title="Elimina record candidatura"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* TAB: PROPOSTE CDA */}
          {activeTab === "cda_proposals" && (
            <div className="space-y-6 animate-fadeIn">
              {/* Header stats */}
              <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-4 gap-4">
                <div className="bg-[#161618] rounded-xl border border-white/5 p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-slate-400 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Totale Proposte CDA</span>
                    <Award size={18} className="text-amber-400" />
                  </div>
                  <div className="text-2xl font-black text-white">{cdaProposalsList.length}</div>
                  <p className="text-[10px] text-slate-500 mt-1">Registrate nel sistema</p>
                </div>

                <div className="bg-[#161618] rounded-xl border border-amber-500/20 p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-amber-400 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">In Attesa / Votazione</span>
                    <Clock size={18} className="text-amber-400" />
                  </div>
                  <div className="text-2xl font-black text-amber-300">{pendingProposalsCount}</div>
                  <p className="text-[10px] text-amber-400/70 mt-1">Richiedono voto o decisione</p>
                </div>

                <div className="bg-[#161618] rounded-xl border border-emerald-500/20 p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-emerald-400 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Approvate</span>
                    <Check size={18} className="text-emerald-400" />
                  </div>
                  <div className="text-2xl font-black text-emerald-300">
                    {cdaProposalsList.filter((p) => p.status === "APPROVED").length}
                  </div>
                  <p className="text-[10px] text-emerald-400/70 mt-1">Deliberate con esito positivo</p>
                </div>

                <div className="bg-[#161618] rounded-xl border border-rose-500/20 p-4 flex flex-col justify-between">
                  <div className="flex items-center justify-between text-rose-400 mb-2">
                    <span className="text-xs font-bold uppercase tracking-wider">Respinte / Annullate</span>
                    <X size={18} className="text-rose-400" />
                  </div>
                  <div className="text-2xl font-black text-rose-300">
                    {cdaProposalsList.filter((p) => p.status === "REJECTED" || p.status === "RETURNED" || p.status === "CANCELLED").length}
                  </div>
                  <p className="text-[10px] text-rose-400/70 mt-1">Respinte o cancellate</p>
                </div>
              </div>

              {/* Filters & Refresh */}
              <div className="flex flex-wrap items-center justify-between gap-3 bg-[#161618] p-3.5 rounded-xl border border-white/5">
                <div className="flex items-center gap-1.5 overflow-x-auto py-1">
                  {(["ALL", "PENDING", "IN_VOTING", "APPROVED", "REJECTED"] as const).map((st) => (
                    <button
                      key={st}
                      onClick={() => setCdaProposalsFilterStatus(st)}
                      className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer whitespace-nowrap ${
                        cdaProposalsFilterStatus === st
                          ? "bg-amber-500 text-black shadow-md shadow-amber-500/20 font-black"
                          : "bg-white/5 text-slate-400 hover:text-white hover:bg-white/10"
                      }`}
                    >
                      {st === "ALL" && "Tutte"}
                      {st === "PENDING" && "In Attesa"}
                      {st === "IN_VOTING" && "In Votazione CDA"}
                      {st === "APPROVED" && "Approvate"}
                      {st === "REJECTED" && "Respinte / Annullate"}
                    </button>
                  ))}
                </div>

                <button
                  onClick={() => fetchCdaProposals(token)}
                  disabled={isLoadingCdaProposals}
                  className="px-3.5 py-1.5 bg-white/5 hover:bg-white/10 text-slate-300 rounded-lg text-xs font-bold flex items-center gap-1.5 cursor-pointer border border-white/10 transition-colors"
                >
                  <RefreshCw size={14} className={isLoadingCdaProposals ? "animate-spin" : ""} />
                  <span>Aggiorna Elenco</span>
                </button>
              </div>

              {/* List Cards */}
              {isLoadingCdaProposals && cdaProposalsList.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-12 text-slate-400">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-amber-500 mb-3" />
                  <p className="text-xs">Caricamento proposte CDA...</p>
                </div>
              ) : filteredCdaProposals.length === 0 ? (
                <div className="bg-[#161618] rounded-2xl border border-white/5 p-8 text-center space-y-3">
                  <Award size={32} className="mx-auto text-slate-600" />
                  <h4 className="text-sm font-bold text-slate-300">Nessuna proposta CDA trovata</h4>
                  <p className="text-xs text-slate-500">Non ci sono proposte corrispondenti ai criteri di filtraggio selezionati.</p>
                </div>
              ) : (
                <div className="space-y-4">
                  {filteredCdaProposals.map((prop) => (
                    <div
                      key={prop.id}
                      className="bg-[#161618] rounded-2xl border border-white/10 p-5 space-y-4 hover:border-amber-500/30 transition-all shadow-lg"
                    >
                      {/* Top Header Row */}
                      <div className="flex flex-wrap items-start justify-between gap-3 pb-3 border-b border-white/5">
                        <div className="space-y-1">
                          <div className="flex flex-wrap items-center gap-2">
                            <span
                              className={`px-2.5 py-0.5 rounded-md text-[10px] font-black uppercase tracking-wider border ${
                                prop.type === "PROMOZIONE"
                                  ? "bg-purple-500/20 text-purple-300 border-purple-500/40"
                                  : "bg-blue-500/20 text-blue-300 border-blue-500/40"
                              }`}
                            >
                              {prop.type === "PROMOZIONE" ? "Promozione Grado" : "Proposizione Direttiva"}
                            </span>
                            <span className="text-[11px] font-mono text-slate-500">ID: {prop.id}</span>
                          </div>
                          <h3 className="text-base font-bold text-white">{prop.title}</h3>
                          <p className="text-xs text-slate-400">
                            Presentata da: <strong className="text-slate-200">{prop.proposerName}</strong> ({prop.proposerRole})
                          </p>
                        </div>

                        {/* Status Badge */}
                        <div className="text-right">
                          <span
                            className={`inline-flex items-center gap-1 px-3 py-1 rounded-xl text-xs font-bold border ${
                              prop.status === "APPROVED"
                                ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/40"
                                : prop.status === "REJECTED" || prop.status === "RETURNED" || prop.status === "CANCELLED"
                                ? "bg-rose-500/20 text-rose-300 border-rose-500/40"
                                : prop.status === "IN_VOTING"
                                ? "bg-amber-500/20 text-amber-300 border-amber-500/40 animate-pulse"
                                : "bg-indigo-500/20 text-indigo-300 border-indigo-500/40"
                            }`}
                          >
                            {prop.status === "APPROVED" && "APPROVATA"}
                            {prop.status === "REJECTED" && "RESPINTA"}
                            {prop.status === "RETURNED" && "RESTITUITA"}
                            {prop.status === "CANCELLED" && "ANNULLATA"}
                            {prop.status === "IN_VOTING" && "IN VOTAZIONE CDA"}
                            {prop.status === "PENDING_COSIGNERS" && "IN ATTESA CO-FIRME"}
                            {prop.status === "PENDING_REVISION" && "IN ATTESA SEGRETERIA"}
                            {prop.status === "PENDING" && "IN VALUTAZIONE"}
                          </span>
                          <div className="text-[10px] text-slate-500 mt-1 font-mono">
                            {new Date(prop.submittedAt).toLocaleString([], { dateStyle: "short", timeStyle: "short" })}
                          </div>
                        </div>
                      </div>

                      {/* Content details */}
                      {prop.type === "PROMOZIONE" ? (
                        <div className="bg-black/30 rounded-xl p-3.5 border border-white/5 space-y-2">
                          <div className="text-xs text-slate-300 font-semibold">
                            Candidato Promozione: <span className="text-white font-bold">{prop.targetEmployeeName || "Dipendente EMS"}</span>
                          </div>
                          <div className="flex flex-wrap items-center gap-3 text-xs">
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">Ruolo Attuale:</span>
                              <span className={getRoleBadgeStyle(prop.targetCurrentRole || "")}>{prop.targetCurrentRole || "N/D"}</span>
                            </div>
                            <ChevronRight size={14} className="text-slate-500" />
                            <div className="flex items-center gap-1.5">
                              <span className="text-slate-400">Ruolo Proposto:</span>
                              <span className={getRoleBadgeStyle(prop.targetProposedRole || "")}>{prop.targetProposedRole || "N/D"}</span>
                            </div>
                          </div>
                        </div>
                      ) : (
                        <div className="bg-black/30 rounded-xl p-3.5 border border-white/5 space-y-1">
                          <span className="text-[11px] uppercase tracking-wider text-slate-400 font-bold">Descrizione / Testo Proposta:</span>
                          <p className="text-xs text-slate-200 whitespace-pre-wrap leading-relaxed">{prop.description}</p>
                        </div>
                      )}

                      {/* Co-signers status if present */}
                      {prop.coSigners && prop.coSigners.length > 0 && (
                        <div className="text-xs space-y-1 bg-white/5 p-3 rounded-xl border border-white/5">
                          <span className="font-bold text-slate-300">Co-firmatari Richiesti:</span>
                          <div className="flex flex-wrap gap-2 mt-1">
                            {prop.coSigners.map((cs, idx) => (
                              <span
                                key={idx}
                                className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border flex items-center gap-1 ${
                                  cs.fullToken
                                    ? "bg-emerald-500/20 text-emerald-300 border-emerald-500/30"
                                    : "bg-amber-500/10 text-amber-300 border-amber-500/30"
                                }`}
                              >
                                {cs.fullToken ? <Check size={10} /> : <Clock size={10} />}
                                {cs.name} ({cs.role})
                              </span>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Rejection / Action Reason if any */}
                      {(prop.rejectionReason || prop.cdaData?.cdaActionReason) && (
                        <div className="p-3 bg-rose-500/10 border border-rose-500/20 rounded-xl text-xs text-rose-300 space-y-0.5">
                          <strong className="font-bold text-rose-200">Motivazione Decisione / Note:</strong>
                          <p className="text-rose-300/90">{prop.rejectionReason || prop.cdaData?.cdaActionReason}</p>
                        </div>
                      )}

                      {/* Admin Actions */}
                      <div className="flex flex-wrap items-center justify-end gap-2 pt-2 border-t border-white/5">
                        <button
                          onClick={() => {
                            setResettingProposalModal(prop);
                            setResetProposalModalError(null);
                          }}
                          className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-extrabold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-sm active:scale-95"
                          title="Risetta la proposta CDA e riapri la votazione di 24 ore"
                        >
                          <RotateCcw size={14} />
                          <span>Risetta a Votazione CDA</span>
                        </button>

                        {prop.status !== "APPROVED" && (
                          <button
                            onClick={() => handleApproveCdaProposal(prop.id)}
                            disabled={approvingProposalId === prop.id}
                            className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 disabled:opacity-50 text-white font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
                          >
                            {approvingProposalId === prop.id ? (
                              <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                            ) : (
                              <>
                                <Check size={14} /> Accetta Proposta
                              </>
                            )}
                          </button>
                        )}

                        {prop.status !== "REJECTED" && (
                          <button
                            onClick={() => {
                              setRejectingProposal(prop);
                              setRejectionProposalReasonInput("");
                              setRejectProposalModalError(null);
                            }}
                            className="px-4 py-2 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 font-bold text-xs rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
                          >
                            <X size={14} /> Rifiuta Proposta
                          </button>
                        )}

                        <button
                          onClick={() => {
                            setDeletingProposal(prop);
                            setDeleteProposalError(null);
                          }}
                          className="p-2 bg-white/5 hover:bg-red-500/20 text-slate-400 hover:text-red-400 rounded-xl border border-white/5 cursor-pointer transition-colors"
                          title="Elimina record proposta CDA"
                        >
                          <Trash2 size={14} />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      )}

      {/* RESET TO VOTING MODAL FOR CANDIDATURE */}
      {resettingModalCandidatura && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#161618] rounded-2xl border border-amber-500/30 max-w-lg w-full shadow-2xl overflow-hidden"
          >
            <form onSubmit={handleConfirmResetCandidatura} className="p-6 space-y-4">
              <div className="flex justify-between items-start gap-4 pb-3 border-b border-white/10">
                <div>
                  <h3 className="font-bold text-lg text-amber-300 flex items-center gap-2">
                    <RotateCcw size={20} className="text-amber-400" /> Risetta e Riapri Votazione CDA
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Candidato: <strong className="text-white">{resettingModalCandidatura.fullName}</strong> ({resettingModalCandidatura.desiredRole})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setResettingModalCandidatura(null)}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {resetModalError && (
                <div className="bg-rose-950/80 border border-rose-500/40 rounded-xl p-3 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="text-rose-400 shrink-0" />
                  <span>{resetModalError}</span>
                </div>
              )}

              <div className="bg-amber-500/10 border border-amber-500/30 rounded-xl p-3.5 text-xs text-amber-200 leading-relaxed">
                Stai per riaprire e risettare la candidatura in stato <strong className="text-amber-300">Votazione CDA Attiva</strong> con un nuovo timer di 24 ore.
                <br /><br />
                Verrà <strong className="text-white">annullata qualsiasi decisione precedente</strong> (Accettazione o Rifiuto) presa da Vice Presidente, Presidente o CDA.
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setResettingModalCandidatura(null)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold rounded-xl text-xs cursor-pointer transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingReset}
                  className="px-5 py-2 bg-amber-600 hover:bg-amber-500 disabled:opacity-50 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider cursor-pointer transition-colors flex items-center gap-1.5 shadow-md"
                >
                  {isSubmittingReset ? (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-slate-950" />
                  ) : (
                    <>
                      <RotateCcw size={14} /> Conferma e Riapri Votazione
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* REJECTION REASON MODAL FOR CANDIDATURE */}
      {rejectingCandidatura && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#161618] rounded-2xl border border-rose-500/30 max-w-lg w-full shadow-2xl overflow-hidden"
          >
            <form onSubmit={handleConfirmRejectCandidatura} className="p-6 space-y-4">
              <div className="flex justify-between items-start gap-4 pb-3 border-b border-white/10">
                <div>
                  <h3 className="font-bold text-lg text-white flex items-center gap-2">
                    <AlertCircle size={20} className="text-rose-400" /> Rifiuta Candidatura
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Candidato: <strong className="text-white">{rejectingCandidatura.fullName}</strong> ({rejectingCandidatura.desiredRole})
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRejectingCandidatura(null)}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {rejectModalError && (
                <div className="bg-rose-950/80 border border-rose-500/40 rounded-xl p-3 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="text-rose-400 shrink-0" />
                  <span>{rejectModalError}</span>
                </div>
              )}

              {/* Informative banner about rules */}
              <div className="bg-slate-900 border border-slate-700/80 rounded-xl p-3 text-xs text-slate-300">
                {isMasterSession || sessionInfo?.roleName.toLowerCase().includes("proprietario") ? (
                  <p className="text-amber-300 font-semibold flex items-center gap-1.5">
                    <ShieldCheck size={14} /> Come Token Proprietario puoi rifiutare con o senza motivazione.
                  </p>
                ) : (
                  <p className="text-slate-300 font-medium flex items-center gap-1.5">
                    <AlertCircle size={14} className="text-rose-400" /> Per rifiutare una candidatura è <strong className="text-rose-300">obbligatorio</strong> inserire il motivo del rifiuto.
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                  Motivo del Rifiuto{" "}
                  {isMasterSession || sessionInfo?.roleName.toLowerCase().includes("proprietario") ? (
                    <span className="text-slate-500 text-2xs font-normal">(Opzionale per Proprietario)</span>
                  ) : (
                    <span className="text-rose-400 text-2xs font-normal">(Obbligatorio)</span>
                  )}
                </label>
                <textarea
                  rows={4}
                  value={rejectionReasonInput}
                  onChange={(e) => setRejectionReasonInput(e.target.value)}
                  placeholder="Scrivi qui la motivazione del rifiuto..."
                  className="w-full bg-[#0A0A0B] border border-white/10 focus:border-rose-500 rounded-xl p-3 text-xs text-white placeholder-slate-600 outline-none leading-relaxed"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setRejectingCandidatura(null)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold rounded-xl text-xs cursor-pointer transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingRejection}
                  className="px-5 py-2 bg-rose-600 hover:bg-rose-500 disabled:opacity-50 text-white font-bold rounded-xl text-xs cursor-pointer transition-colors flex items-center gap-1.5 shadow-md"
                >
                  {isSubmittingRejection ? (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                  ) : (
                    <>
                      <X size={14} /> Conferma Rifiuto
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* CONFIRMATION CLEAR LOGS MODAL */}
      {showClearLogsModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#161618] rounded-xl border border-red-500/20 max-w-md w-full shadow-2xl overflow-hidden"
          >
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start gap-4">
                <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-center text-red-400 shrink-0">
                  <AlertCircle size={20} />
                </div>
                <button
                  onClick={() => setShowClearLogsModal(false)}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div>
                <h3 className="font-bold text-base text-white">Svuotare il Registro dei Log?</h3>
                <p className="text-xs text-slate-400 mt-1 leading-normal">
                  Questa azione eliminerà permanentemente tutti i <strong>{accessLogs.length} eventi di accesso</strong> registrati finora. L'operazione è irreversibile.
                </p>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setShowClearLogsModal(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleClearAccessLogs}
                  disabled={isClearingLogs}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors flex items-center gap-1"
                >
                  {isClearingLogs ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                  ) : (
                    <>
                      <Trash2 size={12} />
                      <span>Svuota Registro Log</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* CONFIRMATION RESET MODAL */}
      {showResetModal && (
        <div className="fixed inset-0 bg-black/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#161618] rounded-xl border border-red-500/20 max-w-md w-full shadow-2xl overflow-hidden"
          >
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start gap-4">
                <div className="w-10 h-10 bg-red-500/10 border border-red-500/20 rounded-lg flex items-center justify-center text-red-400 shrink-0">
                  <AlertCircle size={20} />
                </div>
                <button
                  onClick={() => {
                    setShowResetModal(false);
                    setResetConfirmText("");
                  }}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              <div>
                <h3 className="font-bold text-base text-white">Sei assolutamente sicuro?</h3>
                <p className="text-xs text-slate-400 mt-1 leading-normal">
                  Questa azione eliminerà irrevocabilmente <strong>tutte le {votes.length} schede elettorali salvate</strong> nel database di voto. L'operazione non può essere annullata.
                </p>
              </div>

              <div className="space-y-1.5 pt-2">
                <label htmlFor="confirm-reset-input" className="text-[10px] font-bold uppercase tracking-wider text-slate-400 block">
                  Digita o incolla il testo di conferma esatto:
                  <span className="font-extrabold select-all text-red-400 bg-red-500/10 px-2 py-1 rounded border border-red-500/20 block mt-1.5 font-mono text-2xs">
                    CONFERMA AZZERA DATI CON IL TOKEN DI PROPRIETARIO MASTER
                  </span>
                </label>
                <input
                  id="confirm-reset-input"
                  type="text"
                  required
                  value={resetConfirmText}
                  onChange={(e) => setResetConfirmText(e.target.value)}
                  placeholder="Incolla o digita la frase esatta"
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg py-2 px-3 text-xs text-white font-mono focus:outline-hidden focus:ring-1 focus:ring-red-500 focus:border-red-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => {
                    setShowResetModal(false);
                    setResetConfirmText("");
                  }}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 font-semibold rounded-lg text-xs cursor-pointer transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleResetVotes}
                  disabled={isResetting || resetConfirmText.trim().toUpperCase() !== "CONFERMA AZZERA DATI CON IL TOKEN DI PROPRIETARIO MASTER"}
                  className="px-4 py-2 bg-red-600 hover:bg-red-500 disabled:opacity-40 text-white font-semibold rounded-lg text-xs cursor-pointer transition-colors flex items-center gap-1"
                >
                  {isResetting ? (
                    <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                  ) : (
                    <>
                      <Trash2 size={12} />
                      <span>Conferma Rimozione Totale</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* DELETE CANDIDATURE CONFIRMATION MODAL */}
      {deletingCandidatura && (
        <div className="fixed inset-0 bg-black/75 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#161618] rounded-2xl border border-rose-500/40 max-w-lg w-full shadow-2xl overflow-hidden"
          >
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start gap-4 pb-3 border-b border-white/10">
                <div>
                  <h3 className="font-bold text-lg text-white flex items-center gap-2">
                    <Trash2 size={20} className="text-rose-400" /> Elimina Candidatura
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Candidato: <strong className="text-white">{deletingCandidatura.fullName}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => {
                    setDeletingCandidatura(null);
                    setDeleteCandidaturaError(null);
                  }}
                  className="p-1 text-slate-400 hover:text-slate-200 rounded cursor-pointer"
                >
                  <X size={18} />
                </button>
              </div>

              {deleteCandidaturaError && (
                <div className="bg-rose-950/80 border border-rose-500/40 rounded-xl p-3 text-rose-200 text-xs flex items-center gap-2">
                  <AlertCircle size={16} className="text-rose-400 shrink-0" />
                  <span>{deleteCandidaturaError}</span>
                </div>
              )}

              <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 text-xs space-y-2">
                <p className="text-slate-300">
                  Stai per eliminare la candidatura inviata da <strong className="text-white">{deletingCandidatura.fullName}</strong> per la posizione <strong className="text-amber-400">{deletingCandidatura.desiredRole}</strong>.
                </p>
                <p className="text-rose-400 font-semibold flex items-center gap-1.5">
                  <AlertCircle size={14} className="shrink-0" />
                  Questa azione è irreversibile e rimuoverà definitivamente il record sia dall'archivio locale che da Cloud Firestore.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => {
                    setDeletingCandidatura(null);
                    setDeleteCandidaturaError(null);
                  }}
                  disabled={isDeletingCandidatura}
                  className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs rounded-xl cursor-pointer transition-colors"
                >
                  Annulla
                </button>
                <button
                  type="button"
                  onClick={handleConfirmDeleteCandidatura}
                  disabled={isDeletingCandidatura}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white font-bold text-xs rounded-xl cursor-pointer transition-colors flex items-center gap-1.5 shadow-lg shadow-rose-950/50 disabled:opacity-50"
                >
                  {isDeletingCandidatura ? (
                    <>
                      <div className="animate-spin rounded-full h-3 w-3 border-b-2 border-white" />
                      <span>Eliminazione in corso...</span>
                    </>
                  ) : (
                    <>
                      <Trash2 size={14} />
                      <span>Elimina Definitivamente</span>
                    </>
                  )}
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}
      {/* REJECT PROPOSAL MODAL */}
      {rejectingProposal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#161618] rounded-2xl border border-rose-500/30 max-w-lg w-full shadow-2xl overflow-hidden"
          >
            <form onSubmit={handleConfirmRejectCdaProposal} className="p-6 space-y-4">
              <div className="flex justify-between items-start gap-4 pb-3 border-b border-white/10">
                <div>
                  <h3 className="font-bold text-lg text-rose-300 flex items-center gap-2">
                    <X size={20} className="text-rose-400" /> Rifiuta Proposta CDA
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Proposta: <strong className="text-white">{rejectingProposal.title}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setRejectingProposal(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>

              {rejectProposalModalError && (
                <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-rose-400" />
                  <span>{rejectProposalModalError}</span>
                </div>
              )}

              <div className="space-y-1.5">
                <label className="text-xs font-bold text-slate-300">Motivazione del Rifiuto (Obbligatoria)</label>
                <textarea
                  value={rejectionProposalReasonInput}
                  onChange={(e) => setRejectionProposalReasonInput(e.target.value)}
                  placeholder="Inserisci la motivazione formale del rifiuto della proposta CDA..."
                  rows={3}
                  className="w-full bg-black/40 border border-white/10 rounded-xl p-3 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-rose-500"
                />
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setRejectingProposal(null)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold rounded-xl"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isSubmittingProposalRejection}
                  className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center gap-2"
                >
                  {isSubmittingProposalRejection ? (
                    <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                  ) : (
                    "Conferma Rifiuto"
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}

      {/* RESET PROPOSAL MODAL */}
      {resettingProposalModal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#161618] rounded-2xl border border-amber-500/30 max-w-lg w-full shadow-2xl overflow-hidden"
          >
            <div className="p-6 space-y-4">
              <div className="flex justify-between items-start gap-4 pb-3 border-b border-white/10">
                <div>
                  <h3 className="font-bold text-lg text-amber-300 flex items-center gap-2">
                    <RotateCcw size={20} className="text-amber-400" /> Gestione Votazione / Stato Proposta CDA
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Proposta: <strong className="text-white">{resettingProposalModal.title}</strong>
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setResettingProposalModal(null)}
                  className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10"
                >
                  <X size={18} />
                </button>
              </div>

              {resetProposalModalError && (
                <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-rose-400" />
                  <span>{resetProposalModalError}</span>
                </div>
              )}

              <p className="text-xs text-slate-300 leading-relaxed">
                Scegli l'azione da eseguire sulla votazione della proposta CDA:
              </p>

              <div className="space-y-3 pt-2">
                <button
                  type="button"
                  disabled={isSubmittingProposalReset}
                  onClick={() => handleConfirmResetPreEvaluation()}
                  className="w-full p-3.5 bg-indigo-500/10 hover:bg-indigo-500/20 text-indigo-300 border border-indigo-500/30 rounded-xl font-bold text-xs transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50"
                >
                  <div className="text-left space-y-0.5">
                    <div className="font-black text-indigo-200 text-xs flex items-center gap-2">
                      <Clock size={14} /> Rimanda in Pre-Valutazione
                    </div>
                    <div className="text-[11px] text-slate-400 font-normal">
                      Annulla la votazione e riporta la proposta allo stato di pre-valutazione iniziale (PRIMA della votazione).
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-indigo-400 group-hover:translate-x-1 transition-transform" />
                </button>

                <button
                  type="button"
                  disabled={isSubmittingProposalReset}
                  onClick={() => handleConfirmResetCdaProposal()}
                  className="w-full p-3.5 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-xl font-bold text-xs transition-all flex items-center justify-between group cursor-pointer disabled:opacity-50"
                >
                  <div className="text-left space-y-0.5">
                    <div className="font-black text-amber-200 text-xs flex items-center gap-2">
                      <RotateCcw size={14} /> Risetta e Riapri Votazione (Timer 24h)
                    </div>
                    <div className="text-[11px] text-slate-400 font-normal">
                      Azzera i voti e avvia una nuova votazione di 24 ore nel Portale CDA.
                    </div>
                  </div>
                  <ChevronRight size={16} className="text-amber-400 group-hover:translate-x-1 transition-transform" />
                </button>
              </div>

              <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setResettingProposalModal(null)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold rounded-xl"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </motion.div>
        </div>
      )}

      {/* DELETE PROPOSAL MODAL */}
      {deletingProposal && (
        <div className="fixed inset-0 bg-black/70 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#161618] rounded-2xl border border-red-500/30 max-w-md w-full shadow-2xl p-6 space-y-4"
          >
            <div className="flex items-center gap-3 text-red-400">
              <Trash2 size={24} />
              <h3 className="font-bold text-lg text-white">Elimina Proposta CDA</h3>
            </div>

            {deleteProposalError && (
              <div className="p-3 bg-rose-500/20 border border-rose-500/40 rounded-xl text-xs text-rose-300 flex items-center gap-2">
                <AlertCircle size={16} className="shrink-0 text-rose-400" />
                <span>{deleteProposalError}</span>
              </div>
            )}

            <p className="text-xs text-slate-300">
              Sei sicuro di voler eliminare la proposta <strong className="text-white">{deletingProposal.title}</strong>? L'operazione è irreversibile.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-white/10">
              <button
                onClick={() => setDeletingProposal(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-bold rounded-xl"
              >
                Annulla
              </button>
              <button
                onClick={handleConfirmDeleteCdaProposal}
                disabled={isDeletingProposal}
                className="px-4 py-2 bg-red-600 hover:bg-red-500 text-white text-xs font-bold rounded-xl disabled:opacity-50 flex items-center gap-2"
              >
                {isDeletingProposal ? (
                  <div className="animate-spin rounded-full h-3.5 w-3.5 border-b-2 border-white" />
                ) : (
                  "Elimina Definitivamente"
                )}
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
