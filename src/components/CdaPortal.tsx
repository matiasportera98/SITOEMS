import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  ShieldCheck,
  Award,
  Vote,
  Clock,
  CheckCircle2,
  XCircle,
  AlertTriangle,
  RotateCcw,
  Send,
  UserCheck,
  Key,
  Info,
  ChevronDown,
  RefreshCw,
  FileText,
  Lock,
  ThumbsUp,
  ThumbsDown,
  MinusCircle,
  Sparkles,
  Users,
  Shield,
  HelpCircle,
  AlertCircle,
  FilePlus,
  Plus,
  Search,
  Trash2,
  UserPlus,
  Building,
  Check,
  User,
} from "lucide-react";

const MASTER_OWNERS = ["Giovanni Manzo", "Simone Rizzus", "Antony Romano"];
import {
  Candidatura,
  CdaUserVote,
  DiscordUserSession,
  getRoleBadgeStyle,
  CdaProposal,
  CdaProposalType,
  CdaCoSigner,
  ALL_EMS_PROMOTION_ROLES,
} from "../types.js";

interface CdaPortalProps {
  discordSession: DiscordUserSession | null;
  onSessionUpdated?: (session: DiscordUserSession) => void;
}

interface CdaUserPermissions {
  isCdaMember: boolean;
  token: string;
  username: string;
  roleName: string;
  cdaRank: number;
  isMaster: boolean;
  canReinderizzare: boolean;
  canDirectReview: boolean;
  canDirectApprove?: boolean;
  canDirectReturn?: boolean;
  canVote: boolean;
  canPreventiveAccept: boolean;
  canResolveTie: boolean;
  isReasonOptional: boolean;
}

export default function CdaPortal({ discordSession, onSessionUpdated }: CdaPortalProps) {
  // Token state
  const [tokenInput, setTokenInput] = useState<string>("");
  const [activeToken, setActiveToken] = useState<string>(() => {
    return discordSession?.token || localStorage.getItem("discordToken") || "";
  });
  const [verifyingToken, setVerifyingToken] = useState<boolean>(false);
  const [authError, setAuthError] = useState<string | null>(null);

  // Data state
  const [permissions, setPermissions] = useState<CdaUserPermissions | null>(null);
  const [candidature, setCandidature] = useState<Candidatura[]>([]);
  const [proposals, setProposals] = useState<CdaProposal[]>([]);
  const [loadingData, setLoadingData] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Section Navigation (Candidature vs Proposte CDA)
  const [sectionTab, setSectionTab] = useState<"CANDIDATURE" | "PROPOSTE">("CANDIDATURE");

  // Filter state
  const [activeTab, setActiveTab] = useState<"ALL" | "PENDING_RENDER" | "IN_VOTING" | "TIE" | "COMPLETED">("ALL");

  // Action modal states for Candidature & Proposals
  const [selectedCand, setSelectedCand] = useState<Candidatura | null>(null);
  const [selectedProp, setSelectedProp] = useState<CdaProposal | null>(null);
  const [detailCand, setDetailCand] = useState<Candidatura | null>(null);
  const [detailProp, setDetailProp] = useState<CdaProposal | null>(null);
  const [modalAction, setModalAction] = useState<"RENDER" | "DIRECT_APPROVE" | "DIRECT_RETURN" | "VOTE" | "PREVENTIVE" | "RESOLVE_TIE" | "CANCEL" | null>(null);
  const [actionReason, setActionReason] = useState<string>("");
  const [voteDecision, setVoteDecision] = useState<"FAVOREVOLE" | "CONTRARIO" | "ASTENUTO">("FAVOREVOLE");
  const [tieDecision, setTieDecision] = useState<"APPROVE" | "REJECT">("APPROVE");
  const [reinstatementSelectedRole, setReinstatementSelectedRole] = useState<string>("");
  const [voterOwnerName, setVoterOwnerName] = useState<string>("");
  const [submittingAction, setSubmittingAction] = useState<boolean>(false);

  const getProposalReinstatementRoles = useCallback((prop?: CdaProposal | null): string[] => {
    if (!prop) return ALL_EMS_PROMOTION_ROLES;
    if (prop.reinstatementVotingRoles && prop.reinstatementVotingRoles.length > 0) {
      return prop.reinstatementVotingRoles;
    }
    if (prop.targetProposedRole) {
      const roles = prop.targetProposedRole.split(/[/,]/).map((r) => r.trim()).filter(Boolean);
      if (roles.length > 0) return roles;
    }
    return ALL_EMS_PROMOTION_ROLES;
  }, []);

  const getUserVote = useCallback(
    (
      votesObj?: Record<string, CdaUserVote>,
      userToken?: string,
      username?: string,
      selectedOwner?: string
    ): CdaUserVote | null => {
      if (!votesObj) return null;

      if (selectedOwner) {
        const ownerKey = selectedOwner.toLowerCase().replace(/\s+/g, "_");
        if (votesObj[ownerKey]) return votesObj[ownerKey];
        const match = Object.values(votesObj).find(
          (v) => v.voterName?.toLowerCase() === selectedOwner.toLowerCase()
        );
        if (match) return match;
      }

      if (userToken && votesObj[userToken]) {
        return votesObj[userToken];
      }

      if (username) {
        const uKey = username.toLowerCase().replace(/\s+/g, "_");
        if (votesObj[uKey]) return votesObj[uKey];
        if (votesObj[username]) return votesObj[username];
        const match = Object.values(votesObj).find(
          (v) => v.voterName?.toLowerCase() === username.toLowerCase()
        );
        if (match) return match;
      }

      return null;
    },
    []
  );

  useEffect(() => {
    if (modalAction === "VOTE" && (selectedCand || selectedProp)) {
      const cdaData = (selectedCand || selectedProp)?.cdaData || {};
      const existing = getUserVote(
        cdaData.votes,
        permissions?.token,
        permissions?.username,
        voterOwnerName || undefined
      );
      if (existing) {
        if (existing.decision) setVoteDecision(existing.decision);
        if (existing.reason) setActionReason(existing.reason);
        if (existing.chosenRole) setReinstatementSelectedRole(existing.chosenRole);
      }
    }
  }, [modalAction, selectedCand, selectedProp, voterOwnerName, permissions, getUserVote]);

  const openProposalActionModal = useCallback((
    prop: CdaProposal,
    action: "RENDER" | "DIRECT_APPROVE" | "DIRECT_RETURN" | "VOTE" | "PREVENTIVE" | "RESOLVE_TIE" | "CANCEL"
  ) => {
    setSelectedCand(null);
    setSelectedProp(prop);
    setModalAction(action);
    setActionReason("");
    setErrorMsg(null);
    setVoteDecision("FAVOREVOLE");
    setTieDecision("APPROVE");
    const roles = getProposalReinstatementRoles(prop);
    setReinstatementSelectedRole(roles[0] || "Tirocinante");
  }, [getProposalReinstatementRoles]);

  // New Proposal Modal state
  const [showNewProposalModal, setShowNewProposalModal] = useState<boolean>(false);
  const [newPropType, setNewPropType] = useState<CdaProposalType>("GENERICA");
  const [newPropProposer, setNewPropProposer] = useState<string>("");
  const [newPropTitle, setNewPropTitle] = useState<string>("");
  const [newPropDesc, setNewPropDesc] = useState<string>("");
  const [newPropTargetName, setNewPropTargetName] = useState<string>("");
  const [newPropTargetCurrentRole, setNewPropTargetCurrentRole] = useState<string>("Tirocinante");
  const [newPropTargetProposedRole, setNewPropTargetProposedRole] = useState<string>("Infermiere");
  const [newPropReinstatementVotingRoles, setNewPropReinstatementVotingRoles] = useState<string[]>(["Tirocinante", "Infermiere", "Medico"]);

  // Co-signers lookup & list
  const [coSignerPrefixInput, setCoSignerPrefixInput] = useState<string>("");
  const [coSignersList, setCoSignersList] = useState<CdaCoSigner[]>([]);
  const [lookingUpCoSigner, setLookingUpCoSigner] = useState<boolean>(false);
  const [coSignerError, setCoSignerError] = useState<string | null>(null);
  const [submittingProposal, setSubmittingProposal] = useState<boolean>(false);

  // Real-time tick for countdown timers
  const [, setNowTick] = useState<number>(Date.now());

  useEffect(() => {
    const timer = setInterval(() => {
      setNowTick(Date.now());
    }, 1000);
    return () => clearInterval(timer);
  }, []);

  useEffect(() => {
    if (discordSession?.token && discordSession.token !== activeToken) {
      setActiveToken(discordSession.token);
    }
  }, [discordSession?.token]);

  const handleReloadCda = async () => {
    const tok = activeToken || discordSession?.token || localStorage.getItem("discordToken") || "";
    if (tok) {
      await fetchCdaData(tok);
      setSuccessMsg("Dati CDA ricaricati e aggiornati con successo!");
    } else {
      window.location.reload();
    }
  };

  // Safe response JSON parser
  const parseJsonResponse = async (res: Response) => {
    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("application/json")) {
      throw new Error(`Risposta del server non valida (${res.status}). Riprova.`);
    }
    return await res.json();
  };

  // Fetch CDA data (Candidature + Proposals)
  const fetchCdaData = useCallback(
    async (tokenToUse?: string, isSilent = false) => {
      const token = tokenToUse || activeToken;
      if (!token) return;

      if (!isSilent) {
        setLoadingData(true);
        setErrorMsg(null);
      }

      try {
        const [candRes, propRes] = await Promise.all([
          fetch(`/api/cda/candidature?token=${encodeURIComponent(token)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
          fetch(`/api/cda/proposals?token=${encodeURIComponent(token)}`, {
            headers: { Authorization: `Bearer ${token}` },
          }),
        ]);

        const candData = await parseJsonResponse(candRes);
        const propData = await parseJsonResponse(propRes);

        if (!candRes.ok) {
          if (!isSilent) {
            setErrorMsg(candData.error || "Errore di accesso alla sezione CDA.");
            setPermissions(null);
          }
          return;
        }

        setPermissions(candData.userPermissions);
        const newCands = candData.candidature || [];
        setCandidature(newCands);
        let newProps: CdaProposal[] = [];
        if (propRes.ok && propData.proposals) {
          newProps = propData.proposals || [];
          setProposals(newProps);
        }

        setDetailCand((prev) => (prev ? newCands.find((c: Candidatura) => c.id === prev.id) || prev : null));
        setDetailProp((prev) => (prev ? newProps.find((p: CdaProposal) => p.id === prev.id) || prev : null));
      } catch (err) {
        if (!isSilent) {
          console.error("Error fetching CDA data:", err);
          setErrorMsg("Errore di connessione al server durante il caricamento della sezione CDA.");
        }
      } finally {
        if (!isSilent) {
          setLoadingData(false);
        }
      }
    },
    [activeToken]
  );

  // Co-signer Lookup
  const handleAddCoSigner = async () => {
    if (!coSignerPrefixInput.trim()) return;
    setLookingUpCoSigner(true);
    setCoSignerError(null);

    const cleanInput = coSignerPrefixInput.trim().toUpperCase().replace(/^EMS-?/i, "");

    try {
      const res = await fetch(`/api/cda/proposals/lookup-cosigner?prefix=${encodeURIComponent(cleanInput)}`);
      const data = await parseJsonResponse(res);

      if (data.success && data.matches && data.matches.length > 0) {
        const match = data.matches[0];
        const newCoSigner: CdaCoSigner = {
          name: match.name,
          role: match.role,
          tokenPrefix: match.tokenPrefix || cleanInput.substring(0, 2),
        };

        if (!coSignersList.some((c) => c.name.toLowerCase() === match.name.toLowerCase())) {
          setCoSignersList([...coSignersList, newCoSigner]);
          setCoSignerPrefixInput("");
        } else {
          setCoSignerError("Questo firmatario è già stato inserito.");
        }
      } else {
        // Fallback: Add with the prefix code
        const fallbackCoSigner: CdaCoSigner = {
          name: `Firmatario [EMS-${cleanInput.substring(0, 2)}]`,
          role: "Co-Firmatario CDA",
          tokenPrefix: cleanInput.substring(0, 2),
        };
        if (!coSignersList.some((c) => c.tokenPrefix === fallbackCoSigner.tokenPrefix)) {
          setCoSignersList([...coSignersList, fallbackCoSigner]);
          setCoSignerPrefixInput("");
        } else {
          setCoSignerError("Prefisso token già presente tra i co-firmatari.");
        }
      }
    } catch (err) {
      setCoSignerError("Errore durante la ricerca del firmatario.");
    } finally {
      setLookingUpCoSigner(false);
    }
  };

  const handleRemoveCoSigner = (index: number) => {
    setCoSignersList(coSignersList.filter((_, i) => i !== index));
  };

  // Submit New Proposal
  const handleSubmitProposal = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeToken) return;

    setSubmittingProposal(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch("/api/cda/proposals", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          type: newPropType,
          proposerName: newPropProposer || permissions?.username || "Membro CDA",
          title: newPropType === "PROMOZIONE"
            ? `Proposta di Promozione per ${newPropTargetName}`
            : newPropType === "REINTEGRO"
            ? `Proposta di Reintegro per ${newPropTargetName}`
            : newPropTitle,
          description: newPropDesc,
          targetEmployeeName: (newPropType === "PROMOZIONE" || newPropType === "REINTEGRO") ? newPropTargetName : undefined,
          targetCurrentRole: (newPropType === "PROMOZIONE" || newPropType === "REINTEGRO") ? newPropTargetCurrentRole : undefined,
          targetProposedRole: newPropType === "PROMOZIONE"
            ? newPropTargetProposedRole
            : newPropType === "REINTEGRO"
            ? newPropReinstatementVotingRoles.join(" / ")
            : undefined,
          reinstatementVotingRoles: newPropType === "REINTEGRO" ? newPropReinstatementVotingRoles : undefined,
          coSigners: coSignersList,
        }),
      });

      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante la creazione della proposta CDA.");
      } else {
        setSuccessMsg("Proposta CDA creata con successo! Inviata per la valutazione del Segretario CDA o superiori.");
        setShowNewProposalModal(false);
        setNewPropTitle("");
        setNewPropDesc("");
        setNewPropTargetName("");
        setNewPropTargetCurrentRole("Tirocinante");
        setNewPropTargetProposedRole("Infermiere");
        setNewPropReinstatementVotingRoles(["Tirocinante", "Infermiere", "Medico"]);
        setCoSignersList([]);
        setCoSignerPrefixInput("");
        fetchCdaData();
      }
    } catch (err) {
      setErrorMsg("Errore di rete durante la creazione della proposta.");
    } finally {
      setSubmittingProposal(false);
    }
  };

  useEffect(() => {
    if (!activeToken) return;

    fetchCdaData(activeToken, false);

    // Continuous real-time background polling for CDA data updates (every 4s)
    const pollInterval = setInterval(() => {
      fetchCdaData(activeToken, true);
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [activeToken, fetchCdaData]);

  // Keyboard shortcut: Escape key closes active modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (modalAction) {
          cancelActionModal();
        } else if (detailProp) {
          setDetailProp(null);
        } else if (detailCand) {
          setDetailCand(null);
        } else if (showNewProposalModal) {
          setShowNewProposalModal(false);
        }
      }
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [modalAction, detailProp, detailCand, showNewProposalModal]);

  // Handle direct token submission
  const handleVerifyToken = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!tokenInput.trim()) return;

    setVerifyingToken(true);
    setAuthError(null);

    const cleanTok = tokenInput.trim().toUpperCase();

    try {
      const res = await fetch(`/api/cda/candidature?token=${encodeURIComponent(cleanTok)}`, {
        headers: {
          Authorization: `Bearer ${cleanTok}`,
        },
      });
      const data = await parseJsonResponse(res);

      if (!res.ok || !data.userPermissions?.isCdaMember) {
        setAuthError(
          data.error ||
            "Token non autorizzato. Solo i membri CDA con ruoli validi (Membro, Segretario, Vice Presidente, Presidente, Consigliere Finale) o la chiave Master possono accedere."
        );
        setVerifyingToken(false);
        return;
      }

      localStorage.setItem("discordToken", cleanTok);
      setActiveToken(cleanTok);
      setPermissions(data.userPermissions);
      setCandidature(data.candidature || []);
      setTokenInput("");

      if (onSessionUpdated && data.userPermissions) {
        onSessionUpdated({
          username: data.userPermissions.username,
          roleName: data.userPermissions.roleName,
          grade: data.userPermissions.cdaRank,
          isAllowed: true,
          verifiedAt: new Date().toISOString(),
          token: cleanTok,
        });
      }
    } catch (err) {
      setAuthError("Errore durante la verifica del Token.");
    } finally {
      setVerifyingToken(false);
    }
  };

  // Close all modals helper (used when operation finishes successfully)
  const closeModal = () => {
    setSelectedCand(null);
    setSelectedProp(null);
    setModalAction(null);
    setActionReason("");
    setDetailCand(null);
    setDetailProp(null);
    setErrorMsg(null);
    setVoterOwnerName("");
  };

  // Cancel action modal helper (keeps detail card open if user was viewing it)
  const cancelActionModal = () => {
    setSelectedCand(null);
    setSelectedProp(null);
    setModalAction(null);
    setActionReason("");
    setErrorMsg(null);
    setVoterOwnerName("");
  };

  // Helper to check if an item was submitted by the logged in member
  const isMyCandidatura = useCallback(
    (cand: Candidatura) => {
      if (!permissions) return false;
      const uname = (permissions.username || "").trim().toLowerCase();
      const cName = (cand.fullName || "").trim().toLowerCase();
      const tok = permissions.token;
      return Boolean((uname && cName && uname === cName) || (tok && cand.token && tok === cand.token));
    },
    [permissions]
  );

  const isMyProposal = useCallback(
    (prop: CdaProposal) => {
      if (!permissions) return false;
      const uname = (permissions.username || "").trim().toLowerCase();
      const pName = (prop.proposerName || "").trim().toLowerCase();
      const tok = permissions.token;
      return Boolean((uname && pName && uname === pName) || (tok && prop.token && tok === prop.token));
    },
    [permissions]
  );

  // Proposal Action Handlers
  const handleProposalRender = async () => {
    if (!selectedProp || !activeToken) return;
    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/proposals/${encodeURIComponent(selectedProp.id)}/render`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante l'avvio della votazione della proposta.");
      } else {
        setSuccessMsg("Proposta CDA inviata in votazione di 24 ore!");
        closeModal();
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante la richiesta.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleProposalVote = async () => {
    if (!selectedProp || !activeToken) return;

    if (permissions?.isMaster && !voterOwnerName) {
      setErrorMsg("Seleziona per quale Proprietario stai votando (Giovanni Manzo, Simone Rizzus o Antony Romano).");
      return;
    }

    if (selectedProp.type === "REINTEGRO" && voteDecision === "FAVOREVOLE" && !reinstatementSelectedRole) {
      setErrorMsg("Seleziona il grado con il quale la persona deve essere reintegrata.");
      return;
    }

    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/proposals/${encodeURIComponent(selectedProp.id)}/vote`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          decision: voteDecision,
          reason: actionReason,
          chosenRole: selectedProp.type === "REINTEGRO" && voteDecision === "FAVOREVOLE" ? reinstatementSelectedRole : undefined,
          voterName: voterOwnerName || undefined,
        }),
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante il voto della proposta.");
      } else {
        setSuccessMsg(`Voto '${voteDecision}' registrato per la proposta CDA!`);
        closeModal();
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante la registrazione del voto.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleProposalDirectApprove = async () => {
    if (!selectedProp || !activeToken) return;

    if (selectedProp.type === "REINTEGRO" && !reinstatementSelectedRole) {
      setErrorMsg("Seleziona il grado con il quale la persona deve essere reintegrata.");
      return;
    }

    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/proposals/${encodeURIComponent(selectedProp.id)}/direct-approve`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          reason: actionReason,
          chosenRole: selectedProp.type === "REINTEGRO" ? reinstatementSelectedRole : undefined,
        }),
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante l'approvazione diretta della proposta.");
      } else {
        setSuccessMsg("Proposta CDA approvata direttamente con successo!");
        closeModal();
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante la richiesta.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleProposalDirectReturn = async () => {
    if (!selectedProp || !activeToken) return;
    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/proposals/${encodeURIComponent(selectedProp.id)}/direct-return`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ reason: actionReason }),
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante il rifiuto della proposta.");
      } else {
        setSuccessMsg("Proposta CDA respinta direttamente con successo.");
        closeModal();
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante la richiesta.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleProposalPreventive = async () => {
    if (!selectedProp || !activeToken) return;

    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/proposals/${encodeURIComponent(selectedProp.id)}/preventive`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          reason: actionReason,
        }),
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante la chiusura preventiva della votazione della proposta.");
      } else {
        setSuccessMsg(data.message || "Votazione della proposta chiusa preventivamente con successo!");
        closeModal();
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante la chiusura preventiva.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleProposalResolveTie = async () => {
    if (!selectedProp || !activeToken) return;

    if (selectedProp.type === "REINTEGRO" && tieDecision === "APPROVE" && !reinstatementSelectedRole) {
      setErrorMsg("Seleziona il grado con il quale la persona deve essere reintegrata.");
      return;
    }

    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/proposals/${encodeURIComponent(selectedProp.id)}/resolve-tie`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          decision: tieDecision,
          reason: actionReason,
          chosenRole: selectedProp.type === "REINTEGRO" && tieDecision === "APPROVE" ? reinstatementSelectedRole : undefined,
        }),
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante la risoluzione del pareggio.");
      } else {
        setSuccessMsg("Pareggio della proposta CDA risolto con successo!");
        closeModal();
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante la risoluzione del pareggio.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleProposalCancel = async () => {
    if (!selectedProp || !activeToken) return;

    if (!permissions?.isMaster && (!actionReason || actionReason.trim().length < 3)) {
      setErrorMsg("La motivazione del ritiro è obbligatoria per il proponente.");
      return;
    }

    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/proposals/${encodeURIComponent(selectedProp.id)}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ reason: actionReason }),
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante il ritiro della proposta.");
      } else {
        setSuccessMsg("Proposta CDA ritirata con successo.");
        closeModal();
        setDetailProp(null);
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante il ritiro della proposta.");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Action Handlers
  const handleRenderToCda = async () => {
    if (!selectedCand || !activeToken) return;
    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/render/${encodeURIComponent(selectedCand.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante il reindirizzamento.");
      } else {
        setSuccessMsg(data.message || "Candidatura reindirizzata alla votazione CDA!");
        closeModal();
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante la richiesta.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleDirectReview = async (action: "APPROVE" | "RETURN") => {
    if (!selectedCand || !activeToken) return;

    if (!permissions?.isReasonOptional && (!actionReason || actionReason.trim().length < 3)) {
      setErrorMsg("Il motivo dell'azione è obbligatorio per il tuo ruolo!");
      return;
    }

    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/direct-review/${encodeURIComponent(selectedCand.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ action, reason: actionReason }),
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante la gestione della candidatura.");
      } else {
        setSuccessMsg(data.message || "Candidatura aggiornata con successo.");
        closeModal();
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante la richiesta.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleVote = async () => {
    if (!selectedCand || !activeToken) return;

    if (permissions?.isMaster && !voterOwnerName) {
      setErrorMsg("Seleziona per quale Proprietario stai votando (Giovanni Manzo, Simone Rizzus o Antony Romano).");
      return;
    }

    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/vote/${encodeURIComponent(selectedCand.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({
          decision: voteDecision,
          reason: actionReason,
          voterName: voterOwnerName || undefined,
        }),
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante l'invio del voto.");
      } else {
        setSuccessMsg(data.message || "Voto registrato con successo!");
        closeModal();
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante l'invio del voto.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handlePreventiveAccept = async () => {
    if (!selectedCand || !activeToken) return;
    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/preventive-accept/${encodeURIComponent(selectedCand.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ reason: actionReason }),
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante l'accettazione preventiva.");
      } else {
        setSuccessMsg(data.message || "Candidatura accettata preventivamente con successo!");
        closeModal();
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante la richiesta.");
    } finally {
      setSubmittingAction(false);
    }
  };

  const handleResolveTie = async () => {
    if (!selectedCand || !activeToken) return;

    if (!permissions?.isReasonOptional && (!actionReason || actionReason.trim().length < 3)) {
      setErrorMsg("Specificare il motivo della decisione di parità!");
      return;
    }

    setSubmittingAction(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const res = await fetch(`/api/cda/resolve-tie/${encodeURIComponent(selectedCand.id)}`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${activeToken}`,
        },
        body: JSON.stringify({ decision: tieDecision, reason: actionReason }),
      });
      const data = await parseJsonResponse(res);

      if (!res.ok) {
        setErrorMsg(data.error || "Errore durante la risoluzione della parità.");
      } else {
        setSuccessMsg(data.message || "Parità risolta con successo!");
        closeModal();
        fetchCdaData();
      }
    } catch (e) {
      setErrorMsg("Errore di rete durante la richiesta.");
    } finally {
      setSubmittingAction(false);
    }
  };

  // Timer formatting helper
  const renderTimer = (expiresAtStr?: string) => {
    if (!expiresAtStr) return null;
    const expiresAt = new Date(expiresAtStr).getTime();
    const diff = expiresAt - Date.now();

    if (diff <= 0) {
      return (
        <span className="inline-flex items-center gap-1 text-rose-400 font-bold bg-rose-500/10 px-2.5 py-1 rounded-full border border-rose-500/30 text-xs">
          <Clock size={13} className="animate-spin" /> Timer Scaduto (Elaborazione...)
        </span>
      );
    }

    const hours = Math.floor(diff / (1000 * 60 * 60));
    const minutes = Math.floor((diff % (1000 * 60 * 60)) / (1000 * 60));
    const seconds = Math.floor((diff % (1000 * 60)) / 1000);

    return (
      <span className="inline-flex items-center gap-1.5 text-amber-300 font-mono font-extrabold bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30 text-xs shadow-sm">
        <Clock size={14} className="text-amber-400 animate-pulse" />
        <span>
          {String(hours).padStart(2, "0")}:{String(minutes).padStart(2, "0")}:
          {String(seconds).padStart(2, "0")}
        </span>
        <span className="text-[10px] text-amber-400/80 uppercase font-sans">rimaste</span>
      </span>
    );
  };

  // Vote calculation summary helper
  const getVoteStats = (votesMap?: Record<string, CdaUserVote>) => {
    if (!votesMap) return { fav: 0, con: 0, ast: 0, total: 0, status: "TIE" as const };
    const votesArr = Object.values(votesMap);
    let fav = 0;
    let con = 0;
    let ast = 0;

    votesArr.forEach((v) => {
      if (v.decision === "FAVOREVOLE") fav++;
      else if (v.decision === "CONTRARIO") con++;
      else if (v.decision === "ASTENUTO") ast++;
    });

    const total = votesArr.length;
    let status: "FAVOREVOLE" | "CONTRARIO" | "TIE" = "TIE";
    if (fav > con) status = "FAVOREVOLE";
    else if (con > fav) status = "CONTRARIO";

    return { fav, con, ast, total, status };
  };

  // Filtered candidatures
  const filteredCandidature = candidature.filter((c) => {
    const cdaStatus = c.cdaData?.status || "PENDING_RENDER";
    if (activeTab === "PENDING_RENDER") {
      return cdaStatus === "PENDING_RENDER" && c.status === "PENDING";
    }
    if (activeTab === "IN_VOTING") {
      return cdaStatus === "IN_VOTING";
    }
    if (activeTab === "TIE") {
      return cdaStatus === "TIE_PENDING";
    }
    if (activeTab === "COMPLETED") {
      return (
        cdaStatus === "APPROVED" ||
        cdaStatus === "REJECTED" ||
        cdaStatus === "RETURNED" ||
        c.status === "APPROVED" ||
        c.status === "REJECTED"
      );
    }
    return true; // "ALL"
  });

  // Filtered proposals
  const filteredProposals = proposals.filter((p) => {
    const cdaStatus = p.cdaData?.status || "PENDING_RENDER";
    if (activeTab === "PENDING_RENDER") {
      return cdaStatus === "PENDING_RENDER" && p.status === "PENDING";
    }
    if (activeTab === "IN_VOTING") {
      return cdaStatus === "IN_VOTING";
    }
    if (activeTab === "TIE") {
      return cdaStatus === "TIE_PENDING";
    }
    if (activeTab === "COMPLETED") {
      return (
        cdaStatus === "APPROVED" ||
        cdaStatus === "REJECTED" ||
        cdaStatus === "RETURNED" ||
        p.status === "APPROVED" ||
        p.status === "REJECTED"
      );
    }
    return true; // "ALL"
  });

  // Render Token verification form if permissions not loaded or user not CDA
  if (!permissions || !permissions.isCdaMember) {
    return (
      <div className="max-w-3xl mx-auto px-4 py-12 animate-fadeIn">
        <div className="bg-[#141418] border border-amber-500/30 rounded-3xl p-6 sm:p-10 shadow-2xl space-y-8 text-center relative overflow-hidden">
          <div className="absolute -right-16 -top-16 w-48 h-48 bg-amber-500/10 rounded-full blur-3xl pointer-events-none" />

          <div className="mx-auto w-16 h-16 bg-gradient-to-tr from-amber-600 to-amber-400 rounded-2xl flex items-center justify-center text-white shadow-xl shadow-amber-950/60 border border-amber-300/30">
            <Award size={36} />
          </div>

          <div className="space-y-2">
            <span className="text-2xs font-extrabold uppercase tracking-widest text-amber-400 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/30">
              Sezione Riservata CDA
            </span>
            <h2 className="text-2xl sm:text-3xl font-black text-white tracking-tight">
              Consiglio di Amministrazione (CDA)
            </h2>
            <p className="text-xs sm:text-sm text-slate-400 max-w-xl mx-auto leading-relaxed">
              L'accesso a questa categoria è strettamente riservato agli utenti in possesso del Token di verifica aziendale con ruoli nel Consiglio di Amministrazione:
              <span className="block mt-1 font-semibold text-amber-300">
                Membro CDA, Segretario CDA, Vice Presidente CDA, Presidente CDA, Consigliere Finale CDA
              </span>
            </p>
          </div>

          {authError && (
            <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-4 text-left flex items-start gap-3">
              <AlertTriangle size={18} className="shrink-0 text-rose-400 mt-0.5" />
              <span>{authError}</span>
            </div>
          )}

          <form onSubmit={handleVerifyToken} className="max-w-md mx-auto space-y-4">
            <div className="space-y-2 text-left">
              <label htmlFor="cda-token-input" className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                Inserisci il tuo Token di Accesso CDA
              </label>
              <div className="relative">
                <Key className="absolute left-3.5 top-1/2 -translate-y-1/2 text-slate-500" size={18} />
                <input
                  id="cda-token-input"
                  type="text"
                  required
                  value={tokenInput}
                  onChange={(e) => setTokenInput(e.target.value.toUpperCase())}
                  placeholder="Es: CDA-9821, EMS-..., "
                  className="w-full bg-[#0a0a0f] border border-slate-700/80 focus:border-amber-500 rounded-xl py-3.5 pl-11 pr-4 text-sm font-mono font-bold text-white uppercase tracking-wider placeholder:normal-case placeholder:font-sans placeholder:text-slate-600 focus:outline-none focus:ring-1 focus:ring-amber-500 transition-all"
                />
              </div>
            </div>

            <button
              type="submit"
              disabled={verifyingToken || !tokenInput.trim()}
              className="w-full py-3.5 px-6 bg-gradient-to-r from-amber-600 via-amber-500 to-amber-600 hover:from-amber-500 hover:to-amber-500 disabled:opacity-50 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-lg shadow-amber-950/60 border border-amber-300/40 flex items-center justify-center gap-2"
            >
              {verifyingToken ? (
                <>
                  <RefreshCw size={16} className="animate-spin" /> Verifica In Corso...
                </>
              ) : (
                <>
                  <ShieldCheck size={16} /> Verfica ed Entra nel Portale CDA
                </>
              )}
            </button>
          </form>

          <div className="pt-4 border-t border-slate-800/80 text-[11px] text-slate-500 flex items-center justify-center gap-2">
            <Info size={14} className="text-amber-400 shrink-0" />
            <span>Tutte le operazioni nel CDA vengono crittografate e salvate nei log di sistema.</span>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-8 py-4 sm:py-8 space-y-6 sm:space-y-8 animate-fadeIn w-full max-w-full overflow-x-hidden">
      {/* Top Banner / User CDA Identity */}
      <div className="bg-gradient-to-r from-[#14141e] via-[#111116] to-[#181512] border border-amber-500/30 rounded-3xl p-6 sm:p-8 shadow-2xl relative overflow-hidden flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
        <div className="space-y-2">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="bg-amber-500/20 text-amber-300 border border-amber-500/40 font-black text-2xs uppercase tracking-widest px-3 py-1 rounded-full flex items-center gap-1.5">
              <Award size={13} className="text-amber-400" /> Categoria CDA Attiva
            </span>
            <span className="bg-slate-800 text-slate-300 border border-slate-700 font-mono text-2xs px-2.5 py-1 rounded-full">
              Token: {permissions.token}
            </span>
          </div>

          <h1 className="text-2xl sm:text-3xl font-black text-white tracking-tight flex items-center gap-3">
            Portale Consiglio di Amministrazione (CDA)
          </h1>
          <p className="text-xs sm:text-sm text-slate-400 max-w-2xl leading-relaxed">
            Sezione riservata per la gestione, la trattazione, la votazione a maggioranza (24h) e l'approvazione delle candidature aziendali EMS.
          </p>
        </div>

        {/* User Card and Reload Button */}
        <div className="flex items-center gap-3 shrink-0 w-full md:w-auto">
          <button
            onClick={handleReloadCda}
            disabled={loadingData}
            title="Ricarica Pagina / Aggiorna Dati CDA"
            className="p-3 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-2xl cursor-pointer active:scale-95 transition-all flex items-center gap-2 font-extrabold text-xs shrink-0 shadow-md"
          >
            <RefreshCw size={18} className={loadingData ? "animate-spin text-amber-400" : ""} />
            <span className="hidden sm:inline">Ricarica Dati CDA</span>
          </button>

          <div className="bg-[#0c0c10]/80 border border-amber-500/30 rounded-2xl p-4 sm:p-5 flex items-center gap-4 shrink-0 shadow-inner w-full sm:w-auto">
            <div className="w-12 h-12 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 font-black text-xl shrink-0">
              <UserCheck size={24} />
            </div>
            <div className="space-y-1">
              <span className="text-[10px] uppercase font-extrabold text-slate-500 tracking-wider block">
                Membro Connesso
              </span>
              <div className="text-sm font-black text-white">{permissions.username}</div>
              <div className="inline-block bg-amber-500/20 text-amber-300 border border-amber-500/30 px-2.5 py-0.5 rounded-md text-[11px] font-bold">
                {permissions.roleName}
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Status Messages */}
      {errorMsg && (
        <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-2xl p-4 flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <AlertTriangle size={18} className="text-rose-400 shrink-0" />
            <span>{errorMsg}</span>
          </div>
          <button onClick={() => setErrorMsg(null)} className="text-rose-400 hover:text-white text-xs font-bold px-2 py-1">
            Chiudi
          </button>
        </div>
      )}

      {successMsg && (
        <div className="bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs rounded-2xl p-4 flex items-center justify-between gap-3 animate-fadeIn">
          <div className="flex items-center gap-2">
            <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
            <span>{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white text-xs font-bold px-2 py-1">
            Chiudi
          </button>
        </div>
      )}

      {/* Top Section Tab Navigation: Candidature EMS vs Proposte CDA */}
      <div className="flex flex-col sm:flex-row items-center justify-between gap-4 bg-[#141419] p-3 rounded-2xl border border-slate-800">
        <div className="flex items-center gap-2 w-full sm:w-auto">
          <button
            onClick={() => setSectionTab("CANDIDATURE")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              sectionTab === "CANDIDATURE"
                ? "bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 shadow-lg shadow-amber-950/50 border border-amber-300/40"
                : "bg-[#0d0d12] text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <FileText size={16} />
            <span>Candidature EMS</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${sectionTab === "CANDIDATURE" ? "bg-slate-950 text-amber-300" : "bg-slate-800 text-slate-400"}`}>
              {candidature.length}
            </span>
          </button>

          <button
            onClick={() => setSectionTab("PROPOSTE")}
            className={`flex-1 sm:flex-none flex items-center justify-center gap-2 px-5 py-3 rounded-xl text-xs font-black uppercase tracking-wider transition-all cursor-pointer ${
              sectionTab === "PROPOSTE"
                ? "bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 shadow-lg shadow-amber-950/50 border border-amber-300/40"
                : "bg-[#0d0d12] text-slate-400 hover:text-slate-200 border border-slate-800"
            }`}
          >
            <FilePlus size={16} />
            <span>Proposte CDA</span>
            <span className={`px-2 py-0.5 rounded-full text-[10px] ${sectionTab === "PROPOSTE" ? "bg-slate-950 text-amber-300" : "bg-slate-800 text-slate-400"}`}>
              {proposals.length}
            </span>
          </button>
        </div>

        {/* Create proposal button for all CDA members */}
        <button
          onClick={() => {
            setNewPropProposer(permissions?.username || "");
            setShowNewProposalModal(true);
          }}
          className="w-full sm:w-auto px-5 py-3 bg-gradient-to-r from-emerald-600 to-emerald-500 hover:from-emerald-500 hover:to-emerald-400 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all shadow-md shadow-emerald-950/50 border border-emerald-400/30 flex items-center justify-center gap-2"
        >
          <Plus size={16} />
          <span>Crea Proposta CDA</span>
        </button>
      </div>

      {/* Tabs / Filter Navigation */}
      <div className="flex items-center justify-between gap-4 flex-wrap pb-2 border-b border-slate-800">
        <div className="flex items-center gap-2 overflow-x-auto pb-1 max-w-full flex-nowrap sm:flex-wrap no-scrollbar">
          {[
            {
              id: "ALL",
              label: sectionTab === "CANDIDATURE" ? "Tutte le Candidature" : "Tutte le Proposte",
              icon: FileText,
              count: sectionTab === "CANDIDATURE" ? candidature.length : proposals.length,
            },
            {
              id: "PENDING_RENDER",
              label: "In Attesa Valutazione",
              icon: Clock,
              count:
                sectionTab === "CANDIDATURE"
                  ? candidature.filter((c) => (c.cdaData?.status || "PENDING_RENDER") === "PENDING_RENDER" && c.status === "PENDING").length
                  : proposals.filter((p) => (p.cdaData?.status || "PENDING_RENDER") === "PENDING_RENDER" && p.status === "PENDING").length,
            },
            {
              id: "IN_VOTING",
              label: "In Votazione 24h",
              icon: Vote,
              count:
                sectionTab === "CANDIDATURE"
                  ? candidature.filter((c) => c.cdaData?.status === "IN_VOTING").length
                  : proposals.filter((p) => p.cdaData?.status === "IN_VOTING").length,
            },
            {
              id: "TIE",
              label: "In Parità",
              icon: AlertTriangle,
              count:
                sectionTab === "CANDIDATURE"
                  ? candidature.filter((c) => c.cdaData?.status === "TIE_PENDING").length
                  : proposals.filter((p) => p.cdaData?.status === "TIE_PENDING").length,
            },
            {
              id: "COMPLETED",
              label: "Completate",
              icon: CheckCircle2,
              count:
                sectionTab === "CANDIDATURE"
                  ? candidature.filter((c) => c.cdaData?.status === "APPROVED" || c.cdaData?.status === "REJECTED" || c.status === "APPROVED" || c.status === "REJECTED").length
                  : proposals.filter((p) => p.cdaData?.status === "APPROVED" || p.cdaData?.status === "REJECTED" || p.status === "APPROVED" || p.status === "REJECTED").length,
            },
          ].map((tab) => {
            const Icon = tab.icon;
            const isActive = activeTab === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setActiveTab(tab.id as any)}
                className={`flex items-center gap-2 px-3.5 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-all cursor-pointer whitespace-nowrap shrink-0 ${
                  isActive
                    ? "bg-gradient-to-r from-amber-600 to-amber-500 text-slate-950 font-black shadow-lg shadow-amber-950/50 border border-amber-300/50"
                    : "bg-[#141419] text-slate-400 hover:text-white hover:bg-slate-800/80 border border-slate-800"
                }`}
              >
                <Icon size={15} />
                <span>{tab.label}</span>
                <span
                  className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                    isActive ? "bg-slate-950 text-amber-300" : "bg-slate-800 text-slate-300"
                  }`}
                >
                  {tab.count}
                </span>
              </button>
            );
          })}
        </div>

        <button
          onClick={() => fetchCdaData()}
          disabled={loadingData}
          className="flex items-center gap-2 px-3.5 py-2 bg-[#141419] hover:bg-slate-800 text-slate-300 hover:text-white border border-slate-800 rounded-xl text-xs font-bold transition-all cursor-pointer"
        >
          <RefreshCw size={14} className={loadingData ? "animate-spin text-amber-400" : ""} />
          <span>Aggiorna Dati</span>
        </button>
      </div>

      {/* Main List Grid */}
      {loadingData && candidature.length === 0 && proposals.length === 0 ? (
        <div className="p-16 text-center space-y-3">
          <RefreshCw size={32} className="animate-spin text-amber-400 mx-auto" />
          <p className="text-xs text-slate-400 font-bold uppercase tracking-wider">
            Caricamento dati e votazioni CDA in corso...
          </p>
        </div>
      ) : sectionTab === "CANDIDATURE" ? (
        filteredCandidature.length === 0 ? (
          <div className="bg-[#141419] border border-slate-800/80 rounded-3xl p-12 text-center space-y-3">
            <FileText size={40} className="text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-300">Nessuna candidatura trovata</h3>
            <p className="text-xs text-slate-500">Non ci sono candidature in questa categoria al momento.</p>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredCandidature.map((cand) => {
              const cdaData = cand.cdaData || {};
              const cdaStatus = cdaData.status || "PENDING_RENDER";
              const stats = getVoteStats(cdaData.votes);
              const isMine = isMyCandidatura(cand);
              const cardUserVote = getUserVote(cdaData.votes, permissions?.token, permissions?.username);

              return (
                <div
                  key={cand.id}
                  onClick={() => setDetailCand(cand)}
                  className={`bg-[#121217] hover:bg-[#16161f] border rounded-2xl p-4 transition-all shadow-md hover:shadow-xl hover:border-amber-500/50 cursor-pointer relative flex flex-col justify-between gap-3 group ${
                    cdaStatus === "IN_VOTING"
                      ? "border-amber-500/40 shadow-amber-950/10"
                      : cdaStatus === "TIE_PENDING"
                      ? "border-purple-500/40 shadow-purple-950/10"
                      : "border-slate-800/80"
                  }`}
                >
                  {/* Top Status & Green Dot */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      {cdaStatus === "PENDING_RENDER" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 text-[10px] font-bold border border-slate-700">
                          <Clock size={11} className="text-amber-400" /> In Attesa
                        </span>
                      )}
                      {cdaStatus === "IN_VOTING" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-extrabold border border-amber-500/40 animate-pulse">
                          <Vote size={11} /> Votazione (24h)
                        </span>
                      )}
                      {cdaStatus === "IN_VOTING" && cardUserVote && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/25 text-indigo-200 text-[10px] font-extrabold border border-indigo-500/40">
                          <CheckCircle2 size={11} className="text-emerald-400" /> Votato ({cardUserVote.decision})
                        </span>
                      )}
                      {cdaStatus === "TIE_PENDING" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-extrabold border border-purple-500/40">
                          <AlertTriangle size={11} /> Parità
                        </span>
                      )}
                      {cdaStatus === "APPROVED" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold border border-emerald-500/40">
                          <CheckCircle2 size={11} /> Approvata
                        </span>
                      )}
                      {(cdaStatus === "REJECTED" || cdaStatus === "RETURNED") && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-extrabold border border-rose-500/40">
                          <XCircle size={11} /> {cdaStatus === "RETURNED" ? "Rimandata" : "Rifiutata"}
                        </span>
                      )}
                    </div>

                    {/* Green Dot for User's own item */}
                    {isMine && (
                      <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-300 shrink-0" title="Candidatura presentata da te">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400 animate-pulse" />
                        <span>Tua</span>
                      </span>
                    )}
                  </div>

                  {/* Title & Info */}
                  <div className="space-y-1.5">
                    <div className="flex items-center justify-between gap-2">
                      <h4 className="text-sm font-black text-white group-hover:text-amber-300 transition-colors line-clamp-1">
                        {cand.fullName}
                      </h4>
                      {cand.token && (
                        <span className="text-[9px] font-mono text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20 shrink-0">
                          {cand.token}
                        </span>
                      )}
                    </div>

                    {/* Roles */}
                    <div className="flex items-center gap-1.5 text-[11px] flex-wrap">
                      {(() => {
                        const badgeCurr = getRoleBadgeStyle(cand.currentRole);
                        const badgeDes = getRoleBadgeStyle(cand.desiredRole);
                        return (
                          <>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeCurr.className}`} style={badgeCurr.style}>
                              {cand.currentRole}
                            </span>
                            <span className="text-amber-400 font-bold">➔</span>
                            <span className={`px-2 py-0.5 rounded text-[10px] font-bold ${badgeDes.className}`} style={badgeDes.style}>
                              {cand.desiredRole}
                            </span>
                          </>
                        );
                      })()}
                    </div>
                  </div>

                  {/* Footer Info */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 gap-2">
                    <div className="flex items-center gap-1 text-slate-400 font-medium">
                      <Clock size={11} className="text-slate-500" />
                      <span>{new Date(cand.submittedAt).toLocaleDateString("it-IT")}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {cdaStatus === "IN_VOTING" && cdaData.expiresAt ? (
                        <span className="text-amber-300 font-mono font-bold">
                          {renderTimer(cdaData.expiresAt)}
                        </span>
                      ) : stats.total > 0 ? (
                        <span className="font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                          {stats.fav}👍 {stats.con}👎
                        </span>
                      ) : (
                        <span className="text-slate-500 group-hover:text-amber-400 transition-colors font-bold flex items-center gap-0.5">
                          Dettagli ➔
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      ) : (
        /* PROPOSTE CDA SECTION GRID */
        filteredProposals.length === 0 ? (
          <div className="bg-[#141419] border border-slate-800/80 rounded-3xl p-12 text-center space-y-3">
            <FilePlus size={40} className="text-slate-600 mx-auto" />
            <h3 className="text-base font-bold text-slate-300">Nessuna Proposta CDA trovata</h3>
            <p className="text-xs text-slate-500">Non ci sono proposte in questa categoria al momento.</p>
            <button
              onClick={() => {
                setNewPropProposer(permissions?.username || "");
                setShowNewProposalModal(true);
              }}
              className="mt-2 inline-flex items-center gap-2 px-4 py-2 bg-amber-500/20 text-amber-300 border border-amber-500/40 rounded-xl text-xs font-bold"
            >
              <Plus size={14} /> Crea la prima Proposta
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3.5">
            {filteredProposals.map((prop) => {
              const cdaData = prop.cdaData || {};
              const cdaStatus = cdaData.status || "PENDING_RENDER";
              const stats = getVoteStats(cdaData.votes);
              const isMine = isMyProposal(prop);
              const cardUserVote = getUserVote(cdaData.votes, permissions?.token, permissions?.username);

              return (
                <div
                  key={prop.id}
                  onClick={() => setDetailProp(prop)}
                  className={`bg-[#121217] hover:bg-[#16161f] border rounded-2xl p-4 transition-all shadow-md hover:shadow-xl hover:border-amber-500/50 cursor-pointer relative flex flex-col justify-between gap-3 group ${
                    cdaStatus === "IN_VOTING"
                      ? "border-amber-500/40 shadow-amber-950/10"
                      : cdaStatus === "TIE_PENDING"
                      ? "border-purple-500/40 shadow-purple-950/10"
                      : "border-slate-800/80"
                  }`}
                >
                  {/* Top Status & Green Dot */}
                  <div className="flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 flex-wrap">
                      <span
                        className={`px-2 py-0.5 rounded-full text-[9px] font-extrabold uppercase ${
                          prop.type === "REINTEGRO"
                            ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                            : prop.type === "PROMOZIONE"
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        }`}
                      >
                        {prop.type === "REINTEGRO" ? "Reintegro" : prop.type === "PROMOZIONE" ? "Promozione" : "Proposta"}
                      </span>

                      {cdaStatus === "PENDING_RENDER" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-amber-300 text-[10px] font-bold border border-slate-700">
                          <Clock size={11} className="text-amber-400" /> In Valutazione
                        </span>
                      )}
                      {cdaStatus === "IN_VOTING" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300 text-[10px] font-extrabold border border-amber-500/40 animate-pulse">
                          <Vote size={11} /> Votazione (24h)
                        </span>
                      )}
                      {cdaStatus === "IN_VOTING" && cardUserVote && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-indigo-500/25 text-indigo-200 text-[10px] font-extrabold border border-indigo-500/40">
                          <CheckCircle2 size={11} className="text-emerald-400" /> Votato ({cardUserVote.decision})
                        </span>
                      )}
                      {cdaStatus === "TIE_PENDING" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-purple-500/20 text-purple-300 text-[10px] font-extrabold border border-purple-500/40">
                          <AlertTriangle size={11} /> Parità
                        </span>
                      )}
                      {cdaStatus === "APPROVED" && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 text-[10px] font-extrabold border border-emerald-500/40">
                          <CheckCircle2 size={11} /> Approvata
                        </span>
                      )}
                      {(cdaStatus === "REJECTED" || cdaStatus === "RETURNED") && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-rose-500/20 text-rose-300 text-[10px] font-extrabold border border-rose-500/40">
                          <XCircle size={11} /> Respinta
                        </span>
                      )}
                      {(cdaStatus === "CANCELLED" || prop.status === "CANCELLED") && (
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full bg-slate-800 text-rose-400 text-[10px] font-extrabold border border-rose-500/30">
                          <XCircle size={11} /> Ritirata
                        </span>
                      )}
                    </div>

                    {/* Green Dot for User's own proposal */}
                    {isMine && (
                      <span className="inline-flex items-center gap-1 bg-emerald-500/15 border border-emerald-500/40 px-2 py-0.5 rounded-full text-[10px] font-bold text-emerald-300 shrink-0" title="Proposta creata da te">
                        <span className="w-2 h-2 rounded-full bg-emerald-400 shadow-xs shadow-emerald-400 animate-pulse" />
                        <span>Tua</span>
                      </span>
                    )}
                  </div>

                  {/* Title & Proposer */}
                  <div className="space-y-1">
                    <h4 className="text-sm font-black text-white group-hover:text-amber-300 transition-colors line-clamp-1">
                      {prop.title}
                    </h4>
                    <p className="text-[11px] text-slate-400 line-clamp-1">
                      Da: <strong className="text-amber-300 font-semibold">{prop.proposerName}</strong>
                      {prop.type === "PROMOZIONE" && prop.targetEmployeeName && (
                        <span className="text-purple-300"> • Per: <strong>{prop.targetEmployeeName}</strong></span>
                      )}
                      {prop.type === "REINTEGRO" && prop.targetEmployeeName && (
                        <span className="text-teal-300"> • Reintegro per: <strong>{prop.targetEmployeeName}</strong></span>
                      )}
                    </p>
                  </div>

                  {/* Footer Info */}
                  <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-[10px] text-slate-400 gap-2">
                    <div className="flex items-center gap-1 text-slate-400 font-medium">
                      <Clock size={11} className="text-slate-500" />
                      <span>{prop.submittedAt ? new Date(prop.submittedAt).toLocaleDateString("it-IT") : (prop.createdAt ? new Date(prop.createdAt).toLocaleDateString("it-IT") : "-")}</span>
                    </div>

                    <div className="flex items-center gap-1.5">
                      {cdaStatus === "IN_VOTING" && cdaData.expiresAt ? (
                        <span className="text-amber-300 font-mono font-bold">
                          {renderTimer(cdaData.expiresAt)}
                        </span>
                      ) : stats.total > 0 ? (
                        <span className="font-bold text-slate-300 bg-slate-800 px-2 py-0.5 rounded">
                          {stats.fav}👍 {stats.con}👎
                        </span>
                      ) : (
                        <span className="text-slate-500 group-hover:text-amber-400 transition-colors font-bold flex items-center gap-0.5">
                          Dettagli ➔
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )
      )}

      {/* CREA NUOVA PROPOSTA CDA MODAL */}
      <AnimatePresence>
        {showNewProposalModal && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setShowNewProposalModal(false);
            }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 cursor-pointer"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#121217] border border-amber-500/40 rounded-3xl max-w-2xl w-full shadow-2xl relative overflow-hidden cursor-default max-h-[88vh] flex flex-col"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 sm:p-6 border-b border-slate-800 shrink-0 bg-[#121217]">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400">
                    <FilePlus size={20} />
                  </div>
                  <div>
                    <h3 className="text-lg font-black text-white">Nuova Proposta CDA</h3>
                    <p className="text-xs text-slate-400">
                      Compila il modulo per inviare una proposta all'esame e alla votazione del CDA.
                    </p>
                  </div>
                </div>
                <button
                  type="button"
                  onClick={() => setShowNewProposalModal(false)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer transition-colors"
                >
                  <XCircle size={20} />
                </button>
              </div>

              <form onSubmit={handleSubmitProposal} className="flex flex-col flex-1 overflow-hidden">
                {/* Scrollable Body */}
                <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
                  {/* Proposal Type Switcher */}
                <div className="space-y-2">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                    Tipo di Proposta
                  </label>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
                    <button
                      type="button"
                      onClick={() => setNewPropType("GENERICA")}
                      className={`p-3 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        newPropType === "GENERICA"
                          ? "bg-amber-500/20 text-amber-300 border-amber-500/50 shadow-md"
                          : "bg-[#0a0a0f] text-slate-400 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <FileText size={15} /> Generica
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPropType("PROMOZIONE")}
                      className={`p-3 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        newPropType === "PROMOZIONE"
                          ? "bg-purple-500/20 text-purple-300 border-purple-500/50 shadow-md"
                          : "bg-[#0a0a0f] text-slate-400 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <Award size={15} /> Promozione EMS
                    </button>
                    <button
                      type="button"
                      onClick={() => setNewPropType("REINTEGRO")}
                      className={`p-3 rounded-2xl border text-xs font-extrabold flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        newPropType === "REINTEGRO"
                          ? "bg-teal-500/20 text-teal-300 border-teal-500/50 shadow-md"
                          : "bg-[#0a0a0f] text-slate-400 border-slate-800 hover:border-slate-700"
                      }`}
                    >
                      <RotateCcw size={15} /> Reintegro EMS
                    </button>
                  </div>
                </div>

                {/* Proposer Name */}
                <div className="space-y-2">
                  <label htmlFor="proposer-name-input" className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                    Nome e Cognome Proponente <span className="text-amber-400">*</span>
                  </label>
                  <input
                    id="proposer-name-input"
                    type="text"
                    required
                    value={newPropProposer}
                    onChange={(e) => setNewPropProposer(e.target.value)}
                    placeholder="Inserisci nome del proponente"
                    className="w-full bg-[#0a0a0f] border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Reinstatement Specific Fields */}
                {newPropType === "REINTEGRO" && (
                  <div className="bg-[#0a0a0f] border border-teal-500/30 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-teal-300 uppercase tracking-wider">
                      <RotateCcw size={16} /> Dettagli Reintegro Personale EMS
                    </div>

                    {/* Target Name */}
                    <div className="space-y-2">
                      <label htmlFor="reinstatement-target-name" className="text-xs font-bold text-slate-300 block">
                        Nome e Cognome Persona da Reintegrare <span className="text-amber-400">*</span>
                      </label>
                      <input
                        id="reinstatement-target-name"
                        type="text"
                        required
                        value={newPropTargetName}
                        onChange={(e) => setNewPropTargetName(e.target.value)}
                        placeholder="Inserisci nome e cognome completo"
                        className="w-full bg-[#13131a] border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-teal-500"
                      />
                    </div>

                    {/* Previous Role */}
                    <div className="space-y-2">
                      <div className="flex items-center justify-between gap-1">
                        <label htmlFor="reinstatement-prev-role" className="text-xs font-bold text-slate-300 block">
                          Ruolo Precedente Ricoperto <span className="text-amber-400">*</span>
                        </label>
                        {(() => {
                          const badge = getRoleBadgeStyle(newPropTargetCurrentRole);
                          return (
                            <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${badge.className}`} style={badge.style}>
                              {newPropTargetCurrentRole}
                            </span>
                          );
                        })()}
                      </div>
                      <select
                        id="reinstatement-prev-role"
                        value={newPropTargetCurrentRole}
                        onChange={(e) => setNewPropTargetCurrentRole(e.target.value)}
                        className="w-full bg-[#13131a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white focus:outline-none focus:border-teal-500"
                      >
                        {ALL_EMS_PROMOTION_ROLES.map((role) => (
                          <option key={role} value={role} className="bg-slate-900 text-white font-medium">
                            {role}
                          </option>
                        ))}
                      </select>
                    </div>

                    {/* Roles to Vote Among */}
                    <div className="space-y-2.5">
                      <div className="flex items-center justify-between">
                        <label className="text-xs font-bold text-teal-300 block uppercase tracking-wider">
                          Ruoli tra cui Votare <span className="text-amber-400">*</span>
                        </label>
                        <span className="text-[10px] text-slate-400">
                          Selezionati: {newPropReinstatementVotingRoles.length}
                        </span>
                      </div>
                      <p className="text-[11px] text-slate-400">
                        Seleziona i ruoli candidati tra cui il CDA potrà esprimere la votazione per il reintegro:
                      </p>

                      <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 max-h-48 overflow-y-auto p-2 bg-[#13131a] rounded-xl border border-slate-800">
                        {ALL_EMS_PROMOTION_ROLES.map((role) => {
                          const isSelected = newPropReinstatementVotingRoles.includes(role);
                          return (
                            <button
                              key={role}
                              type="button"
                              onClick={() => {
                                if (isSelected) {
                                  if (newPropReinstatementVotingRoles.length > 1) {
                                    setNewPropReinstatementVotingRoles(
                                      newPropReinstatementVotingRoles.filter((r) => r !== role)
                                    );
                                  }
                                } else {
                                  setNewPropReinstatementVotingRoles([
                                    ...newPropReinstatementVotingRoles,
                                    role,
                                  ]);
                                }
                              }}
                              className={`px-2.5 py-1.5 rounded-lg text-xs font-bold transition-all text-left flex items-center justify-between border cursor-pointer ${
                                isSelected
                                  ? "bg-teal-500/20 border-teal-500/60 text-teal-200 shadow-sm"
                                  : "bg-[#0a0a0f] border-slate-800 text-slate-400 hover:border-slate-700 hover:text-slate-200"
                              }`}
                            >
                              <span className="truncate">{role}</span>
                              {isSelected ? (
                                <CheckCircle2 size={13} className="text-teal-400 shrink-0 ml-1" />
                              ) : (
                                <span className="w-3 h-3 rounded-full border border-slate-700 shrink-0 ml-1" />
                              )}
                            </button>
                          );
                        })}
                      </div>

                      {/* Selected Roles Preview Badges */}
                      <div className="flex flex-wrap gap-1.5 pt-1">
                        <span className="text-[10px] text-slate-500 font-bold self-center uppercase">Ruoli opzione:</span>
                        {newPropReinstatementVotingRoles.map((role) => {
                          const badge = getRoleBadgeStyle(role);
                          return (
                            <span key={role} className={`px-2 py-0.5 rounded-md text-[10px] font-bold ${badge.className}`} style={badge.style}>
                              {role}
                            </span>
                          );
                        })}
                      </div>
                    </div>
                  </div>
                )}

                {/* Promotion Specific Fields */}
                {newPropType === "PROMOZIONE" && (
                  <div className="bg-[#0a0a0f] border border-amber-500/20 rounded-2xl p-4 space-y-4">
                    <div className="flex items-center gap-2 text-xs font-bold text-amber-300 uppercase tracking-wider">
                      <Award size={16} /> Dettagli Promozione Dipendente EMS
                    </div>

                    <div className="space-y-2">
                      <label htmlFor="target-emp-name" className="text-xs font-bold text-slate-300 block">
                        Nome e Cognome Dipendente EMS <span className="text-amber-400">*</span>
                      </label>
                      <input
                        id="target-emp-name"
                        type="text"
                        required
                        value={newPropTargetName}
                        onChange={(e) => setNewPropTargetName(e.target.value)}
                        placeholder="Es: Luca Bianchi"
                        className="w-full bg-[#13131a] border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-1">
                          <label htmlFor="target-curr-role" className="text-xs font-bold text-slate-300 block">
                            Ruolo Attuale
                          </label>
                          {/* Live Role Badge Preview */}
                          {(() => {
                            const badge = getRoleBadgeStyle(newPropTargetCurrentRole);
                            return (
                              <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${badge.className}`} style={badge.style}>
                                {newPropTargetCurrentRole}
                              </span>
                            );
                          })()}
                        </div>
                        <select
                          id="target-curr-role"
                          value={newPropTargetCurrentRole}
                          onChange={(e) => setNewPropTargetCurrentRole(e.target.value)}
                          className="w-full bg-[#13131a] border border-slate-700 rounded-xl p-3 text-xs font-bold text-white focus:outline-none focus:border-amber-500"
                        >
                          {ALL_EMS_PROMOTION_ROLES.map((role) => (
                            <option key={role} value={role} className="bg-slate-900 text-white font-medium">
                              {role}
                            </option>
                          ))}
                        </select>
                      </div>

                      <div className="space-y-2">
                        <div className="flex items-center justify-between gap-1">
                          <label htmlFor="target-prop-role" className="text-xs font-bold text-amber-400 block">
                            Ruolo Proposto <span className="text-amber-400">*</span>
                          </label>
                          {/* Live Role Badge Preview */}
                          {(() => {
                            const badge = getRoleBadgeStyle(newPropTargetProposedRole);
                            return (
                              <span className={`px-2.5 py-0.5 rounded-md text-[11px] font-bold ${badge.className}`} style={badge.style}>
                                {newPropTargetProposedRole}
                              </span>
                            );
                          })()}
                        </div>
                        <select
                          id="target-prop-role"
                          value={newPropTargetProposedRole}
                          onChange={(e) => setNewPropTargetProposedRole(e.target.value)}
                          className="w-full bg-[#13131a] border border-amber-500/50 rounded-xl p-3 text-xs font-bold text-amber-300 focus:outline-none focus:border-amber-500"
                        >
                          {ALL_EMS_PROMOTION_ROLES.map((role) => (
                            <option key={role} value={role} className="bg-slate-900 text-white font-medium">
                              {role}
                            </option>
                          ))}
                        </select>
                      </div>
                    </div>
                  </div>
                )}

                {/* Proposal Title / Subject */}
                {newPropType === "GENERICA" && (
                  <div className="space-y-2">
                    <label htmlFor="prop-title-input" className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                      Oggetto / Titolo della Proposta <span className="text-amber-400">*</span>
                    </label>
                    <input
                      id="prop-title-input"
                      type="text"
                      required
                      value={newPropTitle}
                      onChange={(e) => setNewPropTitle(e.target.value)}
                      placeholder="Es: Riorganizzazione Turni di Guardia Notturni"
                      className="w-full bg-[#0a0a0f] border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                    />
                  </div>
                )}

                {/* Description / Details */}
                <div className="space-y-2">
                  <label htmlFor="prop-desc-textarea" className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                    Cosa Vuoi Proporre (Motivazione e Dettagli) <span className="text-amber-400">*</span>
                  </label>
                  <textarea
                    id="prop-desc-textarea"
                    rows={4}
                    required
                    value={newPropDesc}
                    onChange={(e) => setNewPropDesc(e.target.value)}
                    placeholder="Descrivi dettagliatamente il contenuto della proposta e i motivi per cui il CDA dovrebbe approvarla..."
                    className="w-full bg-[#0a0a0f] border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500"
                  />
                </div>

                {/* Co-Signers Section */}
                <div className="space-y-3 pt-2 border-t border-slate-800">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                    Firma Multipla / Co-Firmatari (Inserisci 2 Lettere del Token dopo EMS-)
                  </label>
                  <div className="flex gap-2">
                    <div className="relative flex-1">
                      <span className="absolute left-3 top-1/2 -translate-y-1/2 font-mono text-xs font-bold text-amber-400">
                        EMS-
                      </span>
                      <input
                        type="text"
                        maxLength={10}
                        value={coSignerPrefixInput}
                        onChange={(e) => setCoSignerPrefixInput(e.target.value.toUpperCase())}
                        placeholder="AB"
                        className="w-full bg-[#0a0a0f] border border-slate-700 rounded-xl py-2.5 pl-14 pr-3 text-xs font-mono font-bold text-white uppercase focus:outline-none focus:border-amber-500"
                      />
                    </div>
                    <button
                      type="button"
                      onClick={handleAddCoSigner}
                      disabled={lookingUpCoSigner || !coSignerPrefixInput.trim()}
                      className="px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 rounded-xl font-bold text-xs flex items-center gap-1.5 cursor-pointer"
                    >
                      {lookingUpCoSigner ? <RefreshCw size={14} className="animate-spin" /> : <UserPlus size={14} />}
                      <span>Aggiungi Firma</span>
                    </button>
                  </div>

                  {coSignerError && (
                    <p className="text-2xs text-rose-400 font-bold">{coSignerError}</p>
                  )}

                  {/* Added Co-Signers List */}
                  {coSignersList.length > 0 && (
                    <div className="flex items-center gap-2 flex-wrap pt-2">
                      <span className="text-[10px] font-bold text-slate-400 uppercase">Firmatari aggiunti:</span>
                      {coSignersList.map((cs, i) => (
                        <span
                          key={i}
                          className="inline-flex items-center gap-1.5 bg-amber-500/10 text-amber-300 border border-amber-500/30 px-3 py-1 rounded-full text-xs font-bold"
                        >
                          <span>{cs.name}</span>
                          <span className="font-mono text-[10px] text-amber-400 bg-amber-500/20 px-1.5 py-0.5 rounded">
                            EMS-{cs.tokenPrefix}
                          </span>
                          <button
                            type="button"
                            onClick={() => handleRemoveCoSigner(i)}
                            className="text-slate-400 hover:text-rose-400 cursor-pointer"
                          >
                            <XCircle size={14} />
                          </button>
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                </div>

                {/* Sticky Footer */}
                <div className="p-5 sm:p-6 pt-4 border-t border-slate-800 flex items-center justify-end gap-3 shrink-0 bg-[#121217]">
                  <button
                    type="button"
                    onClick={() => setShowNewProposalModal(false)}
                    className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold cursor-pointer transition-colors"
                  >
                    Annulla
                  </button>
                  <button
                    type="submit"
                    disabled={submittingProposal}
                    className="px-6 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-amber-950/50 border border-amber-300/40 flex items-center gap-2 cursor-pointer transition-all"
                  >
                    {submittingProposal ? <RefreshCw size={14} className="animate-spin" /> : <Send size={14} />}
                    <span>Invia Proposta CDA</span>
                  </button>
                </div>
              </form>
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* ACTION MODAL DIALOG (Candidature & Proposte) */}
      <AnimatePresence>
        {(selectedCand || selectedProp) && modalAction && (() => {
          const activeTarget = selectedCand || selectedProp;
          const activeCdaData = activeTarget?.cdaData || {};
          const activeExistingVote = getUserVote(
            activeCdaData.votes,
            permissions?.token,
            permissions?.username,
            voterOwnerName || undefined
          );

          return (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) cancelActionModal();
            }}
            className="fixed inset-0 z-[70] flex items-center justify-center p-4 bg-black/80 backdrop-blur-md animate-fadeIn cursor-pointer"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#141419] border border-amber-500/40 rounded-3xl max-w-lg w-full shadow-2xl relative cursor-default max-h-[88vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="p-5 sm:p-6 pb-4 border-b border-slate-800 flex items-start justify-between gap-3 shrink-0 bg-[#141419]">
                <div className="space-y-1 text-left">
                  <span className="text-[10px] font-extrabold uppercase tracking-widest text-amber-400">
                    Operazione CDA • {selectedCand ? selectedCand.fullName : selectedProp?.title}
                  </span>
                  <h3 className="text-xl font-black text-white">
                    {modalAction === "RENDER" && "Reindirizza a Votazione CDA (Timer 24h)"}
                    {modalAction === "DIRECT_APPROVE" && "Accetta Direttamente (Proprietario)"}
                    {modalAction === "DIRECT_RETURN" && "Respingi / Rimanda Indietro (Proprietario)"}
                    {modalAction === "VOTE" && (
                      activeExistingVote
                        ? (voterOwnerName ? `Vuoi cambiare il voto di ${voterOwnerName}?` : "Vuoi cambiare il tuo voto CDA?")
                        : "Esprimi il tuo Voto CDA"
                    )}
                    {modalAction === "PREVENTIVE" && "Chiusura Preventiva Votazione (Proprietario)"}
                    {modalAction === "RESOLVE_TIE" && "Risoluzione Parità Voti (Proprietario)"}
                    {modalAction === "CANCEL" && "Annulla / Ritira Proposta CDA (Proprietario)"}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={cancelActionModal}
                  className="p-1.5 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer shrink-0 transition-colors"
                  title="Chiudi Finestra"
                >
                  <XCircle size={22} />
                </button>
              </div>

              {/* Scrollable Body */}
              <div className="p-5 sm:p-6 space-y-5 overflow-y-auto flex-1">
                {errorMsg && (
                <div className="bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs rounded-xl p-3 flex items-center gap-2">
                  <AlertTriangle size={16} className="text-rose-400 shrink-0" />
                  <span>{errorMsg}</span>
                </div>
              )}

              {/* Vote Choice */}
              {modalAction === "VOTE" && (
                <div className="space-y-4">
                  {/* Notice banner if already voted */}
                  {activeExistingVote ? (
                    <div className="bg-amber-500/15 border border-amber-500/40 rounded-2xl p-4 text-left space-y-1.5 animate-fadeIn">
                      <div className="flex items-center gap-2 text-amber-300 font-extrabold text-xs uppercase tracking-wider">
                        <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                        <span>
                          {voterOwnerName
                            ? `${voterOwnerName} ha già votato per questa proposta!`
                            : "Hai già votato per questa proposta!"}
                        </span>
                      </div>
                      <p className="text-xs text-slate-200">
                        Voto attualmente registrato:{" "}
                        <strong className="text-white uppercase font-black bg-amber-500/30 px-2 py-0.5 rounded border border-amber-400/40">
                          {activeExistingVote.decision}
                        </strong>
                        {activeExistingVote.chosenRole && (
                          <span className="ml-1 text-teal-300 font-bold">
                            ({activeExistingVote.chosenRole})
                          </span>
                        )}
                      </p>
                      <p className="text-[11px] text-amber-200/90 pt-0.5">
                        👇 <strong>Vuoi cambiare il tuo voto?</strong> Seleziona una nuova decisione qui sotto e clicca su <em>&ldquo;Conferma Modifica Voto&rdquo;</em>.
                      </p>
                    </div>
                  ) : voterOwnerName ? (
                    <div className="bg-slate-900/80 border border-slate-800 rounded-2xl p-3 text-left text-xs text-slate-400">
                      Nessun voto registrato ancora per <strong className="text-white">{voterOwnerName}</strong>.
                    </div>
                  ) : null}

                  {/* Master Key Owner Selector */}
                  {permissions?.isMaster && (
                    <div className="bg-amber-500/10 border border-amber-500/30 rounded-2xl p-4 space-y-2.5 text-left">
                      <label className="text-xs font-extrabold text-amber-300 uppercase tracking-wider flex items-center gap-1.5">
                        <Key size={15} className="text-amber-400 shrink-0" />
                        Seleziona Proprietario (Master Key) <span className="text-rose-400 font-black">*</span>
                      </label>
                      <p className="text-[11px] text-amber-200/80 leading-relaxed">
                        Stai votando con Chiave Master. Seleziona per quale Proprietario stai registrando il voto CDA:
                      </p>
                      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                        {MASTER_OWNERS.map((ownerName) => {
                          const isSelected = voterOwnerName === ownerName;
                          return (
                            <button
                              key={ownerName}
                              type="button"
                              onClick={() => setVoterOwnerName(ownerName)}
                              className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all border cursor-pointer ${
                                isSelected
                                  ? "bg-gradient-to-r from-amber-500 to-amber-600 text-slate-950 border-amber-300 shadow-md shadow-amber-950/50 scale-[1.02]"
                                  : "bg-slate-900/90 text-amber-100 border-amber-500/30 hover:border-amber-400/60 hover:bg-amber-500/10"
                              }`}
                            >
                              <div className="flex items-center gap-2 truncate">
                                <User size={14} className={isSelected ? "text-slate-950" : "text-amber-400"} />
                                <span className="truncate">{ownerName}</span>
                              </div>
                              {isSelected && <Check size={14} className="shrink-0 text-slate-950" strokeWidth={3} />}
                            </button>
                          );
                        })}
                      </div>
                    </div>
                  )}

                  <div className="space-y-2">
                    <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                      Seleziona la tua decisione di voto:
                    </label>
                    <div className="grid grid-cols-3 gap-2">
                    <button
                      type="button"
                      onClick={() => setVoteDecision("FAVOREVOLE")}
                      className={`p-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                        voteDecision === "FAVOREVOLE"
                          ? "bg-emerald-600 text-white border-emerald-400 shadow-lg shadow-emerald-950/50"
                          : "bg-slate-900 text-slate-400 border-slate-800"
                      }`}
                    >
                      <ThumbsUp size={18} /> Favorevole
                    </button>

                    <button
                      type="button"
                      onClick={() => setVoteDecision("CONTRARIO")}
                      className={`p-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                        voteDecision === "CONTRARIO"
                          ? "bg-rose-600 text-white border-rose-400 shadow-lg shadow-rose-950/50"
                          : "bg-slate-900 text-slate-400 border-slate-800"
                      }`}
                    >
                      <ThumbsDown size={18} /> Contrario
                    </button>

                    <button
                      type="button"
                      onClick={() => setVoteDecision("ASTENUTO")}
                      className={`p-3 rounded-xl border font-bold text-xs flex flex-col items-center gap-1.5 cursor-pointer transition-all ${
                        voteDecision === "ASTENUTO"
                          ? "bg-slate-700 text-white border-slate-500 shadow-lg"
                          : "bg-slate-900 text-slate-400 border-slate-800"
                      }`}
                    >
                      <MinusCircle size={18} /> Astenuto
                    </button>
                  </div>
                </div>
              </div>
            )}

              {/* Tie resolution Choice */}
              {modalAction === "RESOLVE_TIE" && (
                <div className="space-y-3">
                  <label className="text-xs font-bold uppercase tracking-wider text-slate-300 block">
                    Decisione finale di Risoluzione Parità (Riservata ai Proprietari):
                  </label>
                  <div className="grid grid-cols-2 gap-3">
                    <button
                      type="button"
                      onClick={() => setTieDecision("APPROVE")}
                      className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        tieDecision === "APPROVE"
                          ? "bg-emerald-600 text-white border-emerald-400"
                          : "bg-slate-900 text-slate-400 border-slate-800"
                      }`}
                    >
                      <CheckCircle2 size={16} /> Approva
                    </button>

                    <button
                      type="button"
                      onClick={() => setTieDecision("REJECT")}
                      className={`p-3 rounded-xl border font-bold text-xs flex items-center justify-center gap-2 cursor-pointer transition-all ${
                        tieDecision === "REJECT"
                          ? "bg-rose-600 text-white border-rose-400"
                          : "bg-slate-900 text-slate-400 border-slate-800"
                      }`}
                    >
                      <XCircle size={16} /> Rifiuta
                    </button>
                  </div>
                </div>
              )}

              {/* Role Selection for Reinstatement Proposals */}
              {selectedProp && selectedProp.type === "REINTEGRO" && (
                (modalAction === "VOTE" && voteDecision === "FAVOREVOLE") ||
                modalAction === "DIRECT_APPROVE" ||
                (modalAction === "RESOLVE_TIE" && tieDecision === "APPROVE")
              ) && (
                <div className="bg-[#0a0a0f] border border-teal-500/30 p-4 rounded-2xl space-y-2.5 text-left">
                  <label className="text-xs font-bold uppercase tracking-wider text-teal-300 flex items-center gap-1.5">
                    <UserCheck size={14} className="text-teal-400" />
                    Seleziona Grado di Reintegro <span className="text-rose-400 font-extrabold">* (Obbligatorio)</span>
                  </label>
                  <p className="text-[11px] text-slate-400">
                    Seleziona il grado con il quale la persona (<strong className="text-white">{selectedProp.targetEmployeeName || "Utente"}</strong>) deve essere reintegrata:
                  </p>
                  <div className="flex flex-wrap gap-2 pt-1">
                    {getProposalReinstatementRoles(selectedProp).map((r) => {
                      const isSelected = reinstatementSelectedRole === r;
                      return (
                        <button
                          key={r}
                          type="button"
                          onClick={() => setReinstatementSelectedRole(r)}
                          className={`px-3 py-2 rounded-xl text-xs font-black transition-all cursor-pointer border ${
                            isSelected
                              ? "bg-teal-500 text-slate-950 border-teal-300 shadow-md shadow-teal-950/50 scale-105"
                              : "bg-slate-900 text-slate-300 border-slate-700 hover:border-slate-500"
                          }`}
                        >
                          {r}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Reason input box */}
              {(modalAction === "DIRECT_APPROVE" ||
                modalAction === "DIRECT_RETURN" ||
                modalAction === "PREVENTIVE" ||
                modalAction === "RESOLVE_TIE" ||
                modalAction === "VOTE" ||
                modalAction === "CANCEL") && (
                <div className="space-y-2">
                  <label htmlFor="modal-reason-textarea" className="text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center justify-between">
                    <span>
                      {modalAction === "CANCEL" ? "Motivazione del Ritiro" : "Motivazione dell'Azione"}{" "}
                      {modalAction === "CANCEL" ? (
                        !permissions?.isMaster && <span className="text-rose-400 font-extrabold">* (Obbligatoria)</span>
                      ) : (
                        !permissions?.isReasonOptional && <span className="text-rose-400 font-extrabold">* (Obbligatoria)</span>
                      )}
                    </span>
                    {permissions?.isMaster && (
                      <span className="text-[10px] text-amber-400 font-normal">
                        Opzionale per Key Master / Proprietario
                      </span>
                    )}
                  </label>
                  <textarea
                    id="modal-reason-textarea"
                    rows={3}
                    value={actionReason}
                    onChange={(e) => setActionReason(e.target.value)}
                    placeholder={
                      modalAction === "CANCEL"
                        ? permissions?.isMaster
                          ? "Motivo del ritiro (opzionale per Master Key)..."
                          : "Inserisci la motivazione obbligatoria per il ritiro della proposta..."
                        : "Scrivi qui il motivo della tua decisione..."
                    }
                    className="w-full bg-[#0a0a0f] border border-slate-700 rounded-xl p-3 text-xs text-white focus:outline-none focus:border-amber-500 focus:ring-1 focus:ring-amber-500"
                  />
                </div>
              )}
              </div>

              {/* Confirm / Cancel Buttons Sticky Footer */}
              <div className="p-5 sm:p-6 pt-4 border-t border-slate-800 flex items-center justify-end gap-3 shrink-0 bg-[#141419]">
                <button
                  type="button"
                  onClick={cancelActionModal}
                  disabled={submittingAction}
                  className="px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 rounded-xl text-xs font-bold transition-all cursor-pointer"
                >
                  Annulla
                </button>

                <button
                  type="button"
                  onClick={() => {
                    if (selectedCand) {
                      if (modalAction === "RENDER") handleRenderToCda();
                      else if (modalAction === "DIRECT_APPROVE") handleDirectReview("APPROVE");
                      else if (modalAction === "DIRECT_RETURN") handleDirectReview("RETURN");
                      else if (modalAction === "VOTE") handleVote();
                      else if (modalAction === "PREVENTIVE") handlePreventiveAccept();
                      else if (modalAction === "RESOLVE_TIE") handleResolveTie();
                    } else if (selectedProp) {
                      if (modalAction === "RENDER") handleProposalRender();
                      else if (modalAction === "DIRECT_APPROVE") handleProposalDirectApprove();
                      else if (modalAction === "DIRECT_RETURN") handleProposalDirectReturn();
                      else if (modalAction === "VOTE") handleProposalVote();
                      else if (modalAction === "PREVENTIVE") handleProposalPreventive();
                      else if (modalAction === "RESOLVE_TIE") handleProposalResolveTie();
                      else if (modalAction === "CANCEL") handleProposalCancel();
                    }
                  }}
                  disabled={submittingAction}
                  className="px-5 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-amber-950/50 border border-amber-300/40 cursor-pointer transition-all flex items-center gap-2"
                >
                  {submittingAction ? (
                    <>
                      <RefreshCw size={14} className="animate-spin" /> Elaborazione...
                    </>
                  ) : modalAction === "VOTE" && activeExistingVote ? (
                    <>
                      <CheckCircle2 size={14} /> Conferma Modifica Voto
                    </>
                  ) : (
                    <>
                      <CheckCircle2 size={14} /> Conferma Operazione
                    </>
                  )}
                </button>
              </div>
            </motion.div>
          </div>
          );
        })()}
      </AnimatePresence>

      {/* DETAIL MODAL CANDIDATURA */}
      <AnimatePresence>
        {detailCand && !modalAction && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setDetailCand(null);
            }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 cursor-pointer"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#121217] border border-amber-500/40 rounded-3xl max-w-2xl w-full shadow-2xl relative cursor-default max-h-[88vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-center justify-between p-5 sm:p-6 pb-4 border-b border-slate-800 shrink-0 bg-[#121217]">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0">
                    <UserCheck size={22} />
                  </div>
                  <div>
                    <h3 className="text-xl font-black text-white flex items-center gap-2">
                      {detailCand.fullName}
                      {detailCand.token && (
                        <span className="text-[10px] font-mono text-amber-400 bg-amber-500/10 px-2.5 py-0.5 rounded-full border border-amber-500/30">
                          {detailCand.token}
                        </span>
                      )}
                    </h3>
                    <p className="text-xs text-slate-400">
                      Inviata il: {new Date(detailCand.submittedAt).toLocaleString("it-IT")} • ID: {detailCand.id}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDetailCand(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <XCircle size={22} />
                </button>
              </div>

              {/* Status Badge & Content */}
              {(() => {
                const cdaData = detailCand.cdaData || {};
                const cdaStatus = cdaData.status || "PENDING_RENDER";
                const stats = getVoteStats(cdaData.votes);
                const userVote = getUserVote(cdaData.votes, permissions?.token, permissions?.username);

                return (
                  <>
                    <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
                      <div className="flex items-center justify-between gap-3 flex-wrap bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Stato CDA:</span>
                        {cdaStatus === "PENDING_RENDER" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-amber-300 text-xs font-bold border border-slate-700">
                            <Clock size={13} className="text-amber-400" /> In Attesa di Reindirizzamento CDA
                          </span>
                        )}
                        {cdaStatus === "IN_VOTING" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-extrabold border border-amber-500/40 animate-pulse">
                            <Vote size={13} /> Votazione CDA Attiva (24h)
                          </span>
                        )}
                        {cdaStatus === "TIE_PENDING" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-extrabold border border-purple-500/40">
                            <AlertTriangle size={13} className="text-purple-400" /> Parità Voti (Decisione Proprietari)
                          </span>
                        )}
                        {cdaStatus === "APPROVED" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-extrabold border border-emerald-500/40">
                            <CheckCircle2 size={13} /> Approvata CDA
                          </span>
                        )}
                        {(cdaStatus === "REJECTED" || cdaStatus === "RETURNED") && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-extrabold border border-rose-500/40">
                            <XCircle size={13} /> {cdaStatus === "RETURNED" ? "Rimandata Indietro" : "Rifiutata CDA"}
                          </span>
                        )}
                      </div>

                      {cdaStatus === "IN_VOTING" && cdaData.expiresAt && (
                        <div>{renderTimer(cdaData.expiresAt)}</div>
                      )}
                    </div>

                    {/* Roles & Schedule Grid */}
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 text-xs">
                      <div className="bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Ruolo Attuale
                        </span>
                        <div>
                          {(() => {
                            const badge = getRoleBadgeStyle(detailCand.currentRole);
                            return (
                              <span className={`inline-block px-3 py-1 rounded-lg text-xs ${badge.className}`} style={badge.style}>
                                {detailCand.currentRole}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Ruolo Desiderato
                        </span>
                        <div>
                          {(() => {
                            const badge = getRoleBadgeStyle(detailCand.desiredRole);
                            return (
                              <span className={`inline-block px-3 py-1 rounded-lg text-xs ${badge.className}`} style={badge.style}>
                                {detailCand.desiredRole}
                              </span>
                            );
                          })()}
                        </div>
                      </div>

                      <div className="bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800 space-y-1">
                        <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 block">
                          Fascia Oraria Lavorativa
                        </span>
                        <span className="text-xs font-bold text-slate-200 mt-1 block">
                          {detailCand.timeSlot}
                        </span>
                      </div>
                    </div>

                    {/* Offer Text */}
                    <div className="bg-[#0a0a0f] p-4 rounded-2xl border border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                        Cosa Offre come Persona / Dipendente:
                      </span>
                      <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans bg-[#13131a] p-3.5 rounded-xl border border-slate-800">
                        {detailCand.offerText}
                      </div>
                    </div>

                    {/* Voting Tally & Stats Bar */}
                    {(cdaStatus === "IN_VOTING" || cdaStatus === "TIE_PENDING" || stats.total > 0) && (
                      <div className="bg-[#0a0a0f] border border-amber-500/20 rounded-2xl p-4 sm:p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                          <div className="flex items-center gap-2">
                            <Vote size={18} className="text-amber-400" />
                            <span className="text-xs font-black uppercase tracking-wider text-white">
                              Risultato Votazione CDA ({stats.total} Voti Totali Espressi)
                            </span>
                          </div>

                          <div>
                            {stats.status === "FAVOREVOLE" && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-extrabold border border-emerald-500/30">
                                <ThumbsUp size={13} /> Maggioranza Favorevole
                              </span>
                            )}
                            {stats.status === "CONTRARIO" && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-extrabold border border-rose-500/30">
                                <ThumbsDown size={13} /> Maggioranza Contraria
                              </span>
                            )}
                            {stats.status === "TIE" && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-extrabold border border-amber-500/30">
                                <AlertTriangle size={13} /> Parità Voti ({stats.fav} vs {stats.con})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                              Favorevoli
                            </span>
                            <span className="text-lg font-black text-emerald-300">{stats.fav}</span>
                            <span className="text-[10px] text-emerald-400/80 block">
                              {stats.total > 0 ? Math.round((stats.fav / stats.total) * 100) : 0}%
                            </span>
                          </div>

                          <div className="bg-rose-950/20 border border-rose-500/30 p-3 rounded-xl">
                            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                              Contrari
                            </span>
                            <span className="text-lg font-black text-rose-300">{stats.con}</span>
                            <span className="text-[10px] text-rose-400/80 block">
                              {stats.total > 0 ? Math.round((stats.con / stats.total) * 100) : 0}%
                            </span>
                          </div>

                          <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Astenuti
                            </span>
                            <span className="text-lg font-black text-slate-300">{stats.ast}</span>
                            <span className="text-[10px] text-slate-500 block">
                              {stats.total > 0 ? Math.round((stats.ast / stats.total) * 100) : 0}%
                            </span>
                          </div>
                        </div>

                        {userVote && (
                          <div className="bg-indigo-950/60 border border-indigo-500/40 p-4 rounded-2xl space-y-2 text-left shadow-lg">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-300 uppercase tracking-wider">
                                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                                Hai già votato per questa candidatura
                              </span>
                              <span className="text-[10px] text-indigo-400 font-mono">
                                {new Date(userVote.timestamp).toLocaleString("it-IT")}
                              </span>
                            </div>
                            <div className="text-xs text-slate-200 flex items-center gap-2 flex-wrap">
                              <span>Il tuo voto registrato è:</span>
                              <span className="px-2.5 py-0.5 rounded-md font-black text-xs uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                {userVote.decision}
                              </span>
                              {userVote.chosenRole && (
                                <span className="text-teal-300 text-xs font-bold">
                                  (Grado: {userVote.chosenRole})
                                </span>
                              )}
                            </div>
                            {userVote.reason && (
                              <p className="text-[11px] text-slate-300 italic pt-1 border-t border-indigo-500/20">
                                &ldquo;{userVote.reason}&rdquo;
                              </p>
                            )}
                            <div className="pt-1 text-[11px] text-indigo-200/90 font-medium">
                              💡 <strong>Vuoi cambiare il tuo voto?</strong> Puoi modificare la tua scelta in qualsiasi momento prima della chiusura della votazione.
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {cdaData.cdaActionReason && (
                      <div className="bg-[#0a0a0f] border border-slate-800 p-3.5 rounded-2xl text-xs space-y-1">
                        <span className="font-bold text-amber-400 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                          <Info size={13} /> Dettaglio / Motivazione CDA:
                        </span>
                        <p className="text-slate-300">{cdaData.cdaActionReason}</p>
                        {cdaData.cdaActionBy && (
                          <p className="text-[10px] text-slate-500 pt-1">
                            Eseguito da: {cdaData.cdaActionBy} ({cdaData.cdaActionRole || "CDA"})
                          </p>
                        )}
                      </div>
                    )}
                    </div>

                    {/* Action Buttons Sticky Footer */}
                    {permissions && (
                      <div className="p-5 sm:p-6 pt-4 border-t border-slate-800 flex items-center justify-end gap-3 flex-wrap shrink-0 bg-[#121217]">
                        {cdaStatus === "PENDING_RENDER" && permissions.canReinderizzare && (
                          <button
                            onClick={() => {
                              setSelectedCand(detailCand);
                              setModalAction("RENDER");
                            }}
                            className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-md border border-amber-300/40"
                          >
                            <Send size={14} /> Reindirizza a Votazione CDA (24h)
                          </button>
                        )}

                        {(cdaStatus === "PENDING_RENDER" || cdaStatus === "IN_VOTING") && (permissions.canDirectApprove ?? permissions.isMaster) && (
                          <button
                            onClick={() => {
                              setSelectedCand(detailCand);
                              setModalAction("DIRECT_APPROVE");
                            }}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
                          >
                            <CheckCircle2 size={14} /> Accetta Direttamente
                          </button>
                        )}

                        {(cdaStatus === "PENDING_RENDER" || cdaStatus === "IN_VOTING") && (permissions.canDirectReturn ?? permissions.isMaster) && (
                          <button
                            onClick={() => {
                              setSelectedCand(detailCand);
                              setModalAction("DIRECT_RETURN");
                            }}
                            className="px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
                          >
                            <XCircle size={14} /> Rimanda Indietro / Rifiuta
                          </button>
                        )}

                        {cdaStatus === "IN_VOTING" && permissions.canVote && (
                          <button
                            onClick={() => {
                              setSelectedCand(detailCand);
                              setModalAction("VOTE");
                            }}
                            className={`px-4 py-2.5 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-md border ${
                              userVote
                                ? "bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 border-amber-300/50 shadow-amber-950/40"
                                : "bg-indigo-600 hover:bg-indigo-500 border-indigo-400/30 shadow-indigo-950/50"
                            }`}
                          >
                            <Vote size={14} /> {userVote ? "Cambia / Modifica Voto CDA" : "Esprimi Voto CDA"}
                          </button>
                        )}

                        {cdaStatus === "IN_VOTING" && (permissions.canPreventiveAccept ?? permissions.isMaster) && (
                          <button
                            onClick={() => {
                              setSelectedCand(detailCand);
                              setModalAction("PREVENTIVE");
                            }}
                            className="px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
                          >
                            <Sparkles size={14} /> CHIUDI VOTAZIONE
                          </button>
                        )}

                        {cdaStatus === "TIE_PENDING" && (permissions.canResolveTie ?? permissions.isMaster) && (
                          <button
                            onClick={() => {
                              setSelectedCand(detailCand);
                              setModalAction("RESOLVE_TIE");
                            }}
                            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-md shadow-purple-950/50 border border-purple-400/30"
                          >
                            <AlertTriangle size={14} /> Risolvi Parità Voti
                          </button>
                        )}
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>

      {/* DETAIL MODAL PROPOSTA */}
      <AnimatePresence>
        {detailProp && !modalAction && (
          <div
            onClick={(e) => {
              if (e.target === e.currentTarget) setDetailProp(null);
            }}
            className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-3 sm:p-4 cursor-pointer"
          >
            <motion.div
              onClick={(e) => e.stopPropagation()}
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              exit={{ opacity: 0, scale: 0.95 }}
              className="bg-[#121217] border border-amber-500/40 rounded-3xl max-w-2xl w-full shadow-2xl relative cursor-default max-h-[88vh] flex flex-col overflow-hidden"
            >
              {/* Header */}
              <div className="flex items-start justify-between p-5 sm:p-6 pb-4 border-b border-slate-800 gap-4 shrink-0 bg-[#121217]">
                <div className="flex items-start gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-amber-500/10 border border-amber-500/30 flex items-center justify-center text-amber-400 shrink-0 mt-0.5">
                    <FilePlus size={22} />
                  </div>
                  <div>
                    <div className="flex items-center gap-2 flex-wrap">
                      <span
                        className={`px-2.5 py-0.5 rounded-full text-[10px] font-extrabold uppercase ${
                          detailProp.type === "REINTEGRO"
                            ? "bg-teal-500/20 text-teal-300 border border-teal-500/30"
                            : detailProp.type === "PROMOZIONE"
                            ? "bg-purple-500/20 text-purple-300 border border-purple-500/30"
                            : "bg-blue-500/20 text-blue-300 border border-blue-500/30"
                        }`}
                      >
                        {detailProp.type === "REINTEGRO" ? "Reintegro EMS" : detailProp.type === "PROMOZIONE" ? "Promozione EMS" : "Proposta Generica"}
                      </span>
                      <span className="text-[10px] text-slate-500">
                        Proposta da: <strong className="text-amber-300">{detailProp.proposerName}</strong>
                      </span>
                    </div>
                    <h3 className="text-xl font-black text-white mt-1">{detailProp.title}</h3>
                    <p className="text-xs text-slate-500">
                      Creata il: {detailProp.submittedAt ? new Date(detailProp.submittedAt).toLocaleString("it-IT") : (detailProp.createdAt ? new Date(detailProp.createdAt).toLocaleString("it-IT") : "-")} • ID: {detailProp.id}
                    </p>
                  </div>
                </div>
                <button
                  onClick={() => setDetailProp(null)}
                  className="p-2 text-slate-400 hover:text-white rounded-lg hover:bg-slate-800 cursor-pointer"
                >
                  <XCircle size={22} />
                </button>
              </div>

              {/* Status Badge & Content */}
              {(() => {
                const cdaData = detailProp.cdaData || {};
                const cdaStatus = cdaData.status || "PENDING_RENDER";
                const stats = getVoteStats(cdaData.votes);
                const userVote = getUserVote(cdaData.votes, permissions?.token, permissions?.username);

                return (
                  <>
                    <div className="p-5 sm:p-6 space-y-6 overflow-y-auto flex-1">
                    <div className="flex items-center justify-between gap-3 flex-wrap bg-[#0a0a0f] p-3.5 rounded-2xl border border-slate-800">
                      <div className="flex items-center gap-2">
                        <span className="text-xs text-slate-400 font-bold uppercase tracking-wider">Stato CDA:</span>
                        {cdaStatus === "PENDING_RENDER" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-amber-300 text-xs font-bold border border-slate-700">
                            <Clock size={13} className="text-amber-400" /> In Valutazione Segretario CDA+
                          </span>
                        )}
                        {cdaStatus === "IN_VOTING" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-extrabold border border-amber-500/40 animate-pulse">
                            <Vote size={13} /> Votazione CDA Attiva (24h)
                          </span>
                        )}
                        {cdaStatus === "TIE_PENDING" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-purple-500/20 text-purple-300 text-xs font-extrabold border border-purple-500/40">
                            <AlertTriangle size={13} className="text-purple-400" /> Parità Voti (Decisione Proprietari)
                          </span>
                        )}
                        {cdaStatus === "APPROVED" && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-extrabold border border-emerald-500/40">
                            <CheckCircle2 size={13} /> Proposta Approvata CDA
                          </span>
                        )}
                        {(cdaStatus === "REJECTED" || cdaStatus === "RETURNED") && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-extrabold border border-rose-500/40">
                            <XCircle size={13} /> {cdaStatus === "RETURNED" ? "Proposta Respinta" : "Proposta Bocciata"}
                          </span>
                        )}
                        {(cdaStatus === "CANCELLED" || detailProp.status === "CANCELLED") && (
                          <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-slate-800 text-rose-400 text-xs font-extrabold border border-rose-500/30">
                            <XCircle size={13} /> Proposta Ritirata / Annullata
                          </span>
                        )}
                      </div>

                      {cdaStatus === "IN_VOTING" && cdaData.expiresAt && (
                        <div>{renderTimer(cdaData.expiresAt)}</div>
                      )}
                    </div>

                    {/* Co-signers Bar */}
                    {detailProp.coSigners && detailProp.coSigners.length > 0 && (
                      <div className="bg-[#0a0a0f] p-3 rounded-2xl border border-slate-800 flex items-center gap-2 flex-wrap">
                        <span className="text-[10px] font-extrabold text-slate-400 uppercase tracking-wider flex items-center gap-1">
                          <Users size={13} className="text-amber-400" /> Co-Firmatari Proposta:
                        </span>
                        {detailProp.coSigners.map((cs, idx) => (
                          <span
                            key={idx}
                            className="bg-amber-500/10 text-amber-300 border border-amber-500/30 px-2.5 py-1 rounded-lg text-xs font-bold flex items-center gap-1.5"
                          >
                            <span>{cs.name}</span>
                            <span className="text-[9px] font-mono bg-amber-500/20 px-1 py-0.2 rounded text-amber-400">
                              EMS-{cs.tokenPrefix}
                            </span>
                          </span>
                        ))}
                      </div>
                    )}

                    {/* Reinstatement Details Card */}
                    {detailProp.type === "REINTEGRO" && detailProp.targetEmployeeName && (
                      <div className="bg-[#0a0a0f] p-4 rounded-2xl border border-teal-500/30 space-y-3">
                        <div className="text-xs font-bold text-teal-300 uppercase tracking-wider flex items-center gap-2">
                          <RotateCcw size={15} /> Proposta Reintegro per: <strong className="text-white">{detailProp.targetEmployeeName}</strong>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs">
                          <div className="bg-[#13131a] p-3 rounded-xl border border-slate-800 flex flex-col gap-1.5">
                            <span className="text-[10px] text-slate-400 block uppercase font-bold">Ruolo Precedente Ricoperto</span>
                            {(() => {
                              const badge = getRoleBadgeStyle(detailProp.targetCurrentRole || "");
                              return (
                                <span className={`inline-block px-2.5 py-1 rounded-md text-xs font-bold w-fit ${badge.className}`} style={badge.style}>
                                  {detailProp.targetCurrentRole || "Non specificato"}
                                </span>
                              );
                            })()}
                          </div>
                          <div className="bg-[#13131a] p-3 rounded-xl border border-slate-800 flex flex-col gap-1.5">
                            <span className="text-[10px] text-teal-300 block uppercase font-bold">Ruoli in Opzione di Votazione</span>
                            <div className="flex flex-wrap gap-1.5">
                              {(detailProp.reinstatementVotingRoles || (detailProp.targetProposedRole ? detailProp.targetProposedRole.split("/") : [])).map((r, i) => {
                                const cleanR = r.trim();
                                const badge = getRoleBadgeStyle(cleanR);
                                return (
                                  <span key={i} className={`inline-block px-2 py-0.5 rounded-md text-[11px] font-bold ${badge.className}`} style={badge.style}>
                                    {cleanR}
                                  </span>
                                );
                              })}
                            </div>
                          </div>
                        </div>

                        {(detailProp.finalApprovedRole || (cdaStatus === "APPROVED" && detailProp.targetProposedRole)) && (
                          <div className="bg-emerald-950/30 border border-emerald-500/40 p-3 rounded-xl flex items-center justify-between text-xs text-emerald-200">
                            <span className="font-bold flex items-center gap-1.5 uppercase text-[11px]">
                              <CheckCircle2 size={15} className="text-emerald-400" /> Grado Assegnato al Reintegro:
                            </span>
                            {(() => {
                              const roleName = detailProp.finalApprovedRole || detailProp.targetProposedRole || "";
                              const badge = getRoleBadgeStyle(roleName);
                              return (
                                <span className={`inline-block px-3 py-1 rounded-lg text-xs font-black ${badge.className}`} style={badge.style}>
                                  {roleName}
                                </span>
                              );
                            })()}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Promotion Details Card */}
                    {detailProp.type === "PROMOZIONE" && detailProp.targetEmployeeName && (
                      <div className="bg-[#0a0a0f] p-4 rounded-2xl border border-purple-500/30 space-y-3">
                        <div className="text-xs font-bold text-purple-300 uppercase tracking-wider flex items-center gap-2">
                          <Award size={15} /> Proposta Promozione per: <strong className="text-white">{detailProp.targetEmployeeName}</strong>
                        </div>
                        <div className="flex items-center gap-3 text-xs flex-wrap">
                          <div className="bg-[#13131a] px-3 py-2 rounded-xl border border-slate-800 flex flex-col gap-1">
                            <span className="text-[10px] text-slate-500 block uppercase font-bold">Ruolo Attuale</span>
                            {(() => {
                              const badge = getRoleBadgeStyle(detailProp.targetCurrentRole || "");
                              return (
                                <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs ${badge.className}`} style={badge.style}>
                                  {detailProp.targetCurrentRole || "Non specificato"}
                                </span>
                              );
                            })()}
                          </div>
                          <span className="text-amber-400 font-black text-base">➔</span>
                          <div className="bg-[#13131a] px-3 py-2 rounded-xl border border-slate-800 flex flex-col gap-1">
                            <span className="text-[10px] text-purple-400 block uppercase font-bold">Ruolo Proposto</span>
                            {(() => {
                              const badge = getRoleBadgeStyle(detailProp.targetProposedRole || "");
                              return (
                                <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs ${badge.className}`} style={badge.style}>
                                  {detailProp.targetProposedRole || "Non specificato"}
                                </span>
                              );
                            })()}
                          </div>
                        </div>
                      </div>
                    )}

                    {/* Description / Content Box */}
                    <div className="bg-[#0a0a0f] p-4 rounded-2xl border border-slate-800 space-y-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider text-amber-400 block">
                        Contenuto / Motivazione della Proposta:
                      </span>
                      <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans bg-[#13131a] p-3.5 rounded-xl border border-slate-800">
                        {detailProp.description}
                      </div>
                    </div>

                    {/* Cancellation Details if CANCELLED */}
                    {(detailProp.status === "CANCELLED" || cdaStatus === "CANCELLED") && (
                      <div className="bg-rose-950/20 border border-rose-500/30 rounded-2xl p-4 space-y-1.5 text-xs text-rose-200">
                        <div className="font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                          <AlertTriangle size={15} /> Proposta Ritirata
                        </div>
                        <p className="text-slate-200 leading-relaxed">
                          <strong>Motivazione Ritiro:</strong> {detailProp.cancellationReason || "Nessuna motivazione specificata"}
                        </p>
                        {detailProp.cancelledBy && (
                          <p className="text-[11px] text-slate-400 pt-1 border-t border-rose-500/20">
                            Ritirata da: <strong className="text-white">{detailProp.cancelledBy}</strong>
                            {detailProp.cancelledAt && ` il ${new Date(detailProp.cancelledAt).toLocaleString("it-IT")}`}
                          </p>
                        )}
                      </div>
                    )}

                    {/* Voting Tally & Stats Bar */}
                    {(cdaStatus === "IN_VOTING" || cdaStatus === "TIE_PENDING" || stats.total > 0) && (
                      <div className="bg-[#0a0a0f] border border-amber-500/20 rounded-2xl p-4 sm:p-5 space-y-4">
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-800">
                          <div className="flex items-center gap-2">
                            <Vote size={18} className="text-amber-400" />
                            <span className="text-xs font-black uppercase tracking-wider text-white">
                              Risultato Votazione CDA Proposta ({stats.total} Voti Totali)
                            </span>
                          </div>

                          <div>
                            {stats.status === "FAVOREVOLE" && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-extrabold border border-emerald-500/30">
                                <ThumbsUp size={13} /> Maggioranza Favorevole
                              </span>
                            )}
                            {stats.status === "CONTRARIO" && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-extrabold border border-rose-500/30">
                                <ThumbsDown size={13} /> Maggioranza Contraria
                              </span>
                            )}
                            {stats.status === "TIE" && (
                              <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-extrabold border border-amber-500/30">
                                <AlertTriangle size={13} /> Parità Voti ({stats.fav} vs {stats.con})
                              </span>
                            )}
                          </div>
                        </div>

                        <div className="grid grid-cols-3 gap-3 text-center">
                          <div className="bg-emerald-950/20 border border-emerald-500/30 p-3 rounded-xl">
                            <span className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider block">
                              Favorevoli
                            </span>
                            <span className="text-lg font-black text-emerald-300">{stats.fav}</span>
                          </div>

                          <div className="bg-rose-950/20 border border-rose-500/30 p-3 rounded-xl">
                            <span className="text-[10px] font-bold text-rose-400 uppercase tracking-wider block">
                              Contrari
                            </span>
                            <span className="text-lg font-black text-rose-300">{stats.con}</span>
                          </div>

                          <div className="bg-slate-900 border border-slate-700 p-3 rounded-xl">
                            <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                              Astenuti
                            </span>
                            <span className="text-lg font-black text-slate-300">{stats.ast}</span>
                          </div>
                        </div>

                        {userVote && (
                          <div className="bg-indigo-950/60 border border-indigo-500/40 p-4 rounded-2xl space-y-2 text-left shadow-lg">
                            <div className="flex items-center justify-between gap-2 flex-wrap">
                              <span className="inline-flex items-center gap-1.5 text-xs font-black text-indigo-300 uppercase tracking-wider">
                                <CheckCircle2 size={15} className="text-emerald-400 shrink-0" />
                                Hai già votato per questa proposta CDA
                              </span>
                              <span className="text-[10px] text-indigo-400 font-mono">
                                {new Date(userVote.timestamp).toLocaleString("it-IT")}
                              </span>
                            </div>
                            <div className="text-xs text-slate-200 flex items-center gap-2 flex-wrap">
                              <span>Il tuo voto registrato è:</span>
                              <span className="px-2.5 py-0.5 rounded-md font-black text-xs uppercase bg-emerald-500/20 text-emerald-300 border border-emerald-500/40">
                                {userVote.decision}
                              </span>
                              {userVote.chosenRole && (
                                <span className="text-teal-300 text-xs font-bold">
                                  (Grado: {userVote.chosenRole})
                                </span>
                              )}
                            </div>
                            {userVote.reason && (
                              <p className="text-[11px] text-slate-300 italic pt-1 border-t border-indigo-500/20">
                                &ldquo;{userVote.reason}&rdquo;
                              </p>
                            )}
                            <div className="pt-1 text-[11px] text-indigo-200/90 font-medium">
                              💡 <strong>Vuoi cambiare il tuo voto?</strong> Puoi modificare la tua scelta in qualsiasi momento prima della chiusura della votazione.
                            </div>
                          </div>
                        )}
                      </div>
                    )}

                    {cdaData.cdaActionReason && (
                      <div className="bg-[#0a0a0f] border border-slate-800 p-3.5 rounded-2xl text-xs space-y-1">
                        <span className="font-bold text-amber-400 flex items-center gap-1.5 text-[11px] uppercase tracking-wider">
                          <Info size={13} /> Dettaglio / Motivazione CDA:
                        </span>
                        <p className="text-slate-300">{cdaData.cdaActionReason}</p>
                        {cdaData.cdaActionBy && (
                          <p className="text-[10px] text-slate-500 pt-1">
                            Eseguito da: {cdaData.cdaActionBy} ({cdaData.cdaActionRole || "CDA"})
                          </p>
                        )}
                      </div>
                    )}
                    </div>

                    {/* Proposal Action Buttons Sticky Footer */}
                    {permissions && (
                      <div className="p-5 sm:p-6 pt-4 border-t border-slate-800 flex items-center justify-end gap-3 flex-wrap shrink-0 bg-[#121217]">
                        {cdaStatus === "PENDING_RENDER" && permissions.canReinderizzare && (
                          <button
                            onClick={() => openProposalActionModal(detailProp, "RENDER")}
                            className="px-4 py-2.5 bg-gradient-to-r from-amber-600 to-amber-500 hover:from-amber-500 hover:to-amber-400 text-slate-950 font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-md border border-amber-300/40"
                          >
                            <Send size={14} /> Reindirizza a Votazione CDA (24h)
                          </button>
                        )}

                        {(cdaStatus === "PENDING_RENDER" || cdaStatus === "IN_VOTING") && (permissions.canDirectApprove ?? permissions.isMaster) && (
                          <button
                            onClick={() => openProposalActionModal(detailProp, "DIRECT_APPROVE")}
                            className="px-4 py-2.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-sm"
                          >
                            <CheckCircle2 size={14} /> Accetta Direttamente
                          </button>
                        )}

                        {(cdaStatus === "PENDING_RENDER" || cdaStatus === "IN_VOTING") && (permissions.canDirectReturn ?? permissions.isMaster) && (
                          <button
                            onClick={() => openProposalActionModal(detailProp, "DIRECT_RETURN")}
                            className="px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
                          >
                            <XCircle size={14} /> Respingi Proposta / Rifiuta
                          </button>
                        )}

                        {cdaStatus === "IN_VOTING" && permissions.canVote && (
                          <button
                            onClick={() => openProposalActionModal(detailProp, "VOTE")}
                            className={`px-4 py-2.5 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-md border ${
                              userVote
                                ? "bg-gradient-to-r from-amber-600 to-indigo-600 hover:from-amber-500 hover:to-indigo-500 border-amber-300/50 shadow-amber-950/40"
                                : "bg-indigo-600 hover:bg-indigo-500 border-indigo-400/30 shadow-indigo-950/50"
                            }`}
                          >
                            <Vote size={14} /> {userVote ? "Cambia / Modifica Voto CDA" : "Esprimi Voto CDA"}
                          </button>
                        )}

                        {cdaStatus === "IN_VOTING" && (permissions.canPreventiveAccept ?? permissions.isMaster) && (
                          <button
                            onClick={() => openProposalActionModal(detailProp, "PREVENTIVE")}
                            className="px-4 py-2.5 bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-extrabold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
                          >
                            <Sparkles size={14} /> CHIUDI VOTAZIONE
                          </button>
                        )}

                        {cdaStatus === "TIE_PENDING" && (permissions.canResolveTie ?? permissions.isMaster) && (
                          <button
                            onClick={() => openProposalActionModal(detailProp, "RESOLVE_TIE")}
                            className="px-4 py-2.5 bg-purple-600 hover:bg-purple-500 text-white font-black text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5 shadow-md shadow-purple-950/50 border border-purple-400/30"
                          >
                            <AlertTriangle size={14} /> Risolvi Parità Voti
                          </button>
                        )}

                        {(() => {
                          const canWithdraw =
                            cdaStatus !== "IN_VOTING" &&
                            detailProp.status !== "APPROVED" &&
                            detailProp.status !== "REJECTED" &&
                            detailProp.status !== "CANCELLED" &&
                            detailProp.status !== "RETURNED" &&
                            permissions?.isMaster;

                          if (!canWithdraw) return null;

                          return (
                            <button
                              onClick={() => openProposalActionModal(detailProp, "CANCEL")}
                              className="px-4 py-2.5 bg-rose-600/20 hover:bg-rose-600/40 text-rose-300 border border-rose-500/30 font-bold text-xs uppercase tracking-wider rounded-xl cursor-pointer transition-all flex items-center gap-1.5"
                            >
                              <RotateCcw size={14} /> Ritira Proposta
                            </button>
                          );
                        })()}
                      </div>
                    )}
                  </>
                );
              })()}
            </motion.div>
          </div>
        )}
      </AnimatePresence>
    </div>
  );
}
