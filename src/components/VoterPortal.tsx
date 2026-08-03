import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import { Vote, ChevronUp, ChevronDown, Check, User, AlertCircle, FileText, Send, Sparkles, Search, Plus, Trash2, X, Move } from "lucide-react";
import { RoleId, Candidate, SiteSettings, ROLE_IDS_SORTED_ASC, ROLE_IDS_SORTED_DESC, ROLE_CONFIGS } from "../types.js";
import RoleBadge from "./RoleBadge.js";

interface VoterPortalProps {
  configVersion: number;
}

export default function VoterPortal({ configVersion }: VoterPortalProps) {
  // Public configurations fetched from API
  const [settings, setSettings] = useState<SiteSettings | null>(null);
  const [candidates, setCandidates] = useState<Candidate[]>([]);
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Voter inputs
  const [voterFullName, setVoterFullName] = useState<string>("");
  const [selections, setSelections] = useState<Record<RoleId, string[]>>(() => {
    // Initialize all roles with empty lists
    const initial: any = {};
    Object.values(RoleId).forEach((roleId) => {
      initial[roleId] = [];
    });
    return initial;
  });

  // Flow control states
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [submitSuccess, setSubmitSuccess] = useState<boolean>(false);
  const [lastSubmittedVote, setLastSubmittedVote] = useState<any | null>(null);
  const [validationError, setValidationError] = useState<string | null>(null);
  const [ascendingOrder, setAscendingOrder] = useState<boolean>(true); // Default: Lowest to Highest

  // Interactive Drag-and-Drop States & Helper variables
  const [candidateSearchQuery, setCandidateSearchQuery] = useState<string>("");
  const [selectedCandidateForAssignment, setSelectedCandidateForAssignment] = useState<string | null>(null);
  const [draggingCandidateName, setDraggingCandidateName] = useState<string | null>(null);
  const [dragOverRoleId, setDragOverRoleId] = useState<RoleId | null>(null);

  // Extracted unique candidate names pool
  const allCandidateNames: string[] = candidates
    .map((c) => c.name)
    .filter((value, index, self) => self.indexOf(value) === index);

  // Find where a candidate is currently assigned
  const getCandidateAssignment = (candidateName: string): RoleId | null => {
    for (const roleId of Object.values(RoleId)) {
      if (selections[roleId]?.includes(candidateName)) {
        return roleId;
      }
    }
    return null;
  };

  // Helper to assign a candidate to a role and remove them from other roles
  const assignCandidateToRole = (candidateName: string, targetRoleId: RoleId) => {
    if (!settings?.votingActive) return;
    if (!allCandidateNames.includes(candidateName)) return;

    setSelections((prev) => {
      const next = { ...prev };

      // 1. Remove candidate from any role they are currently assigned to (single-presence constraint)
      Object.values(RoleId).forEach((roleId) => {
        if (next[roleId]) {
          next[roleId] = next[roleId].filter((name) => name !== candidateName);
        }
      });

      // 2. Add to target role
      const currentSelections = next[targetRoleId] || [];
      if (!settings.allowMultipleSelection) {
        // Single selection: replace
        next[targetRoleId] = [candidateName];
      } else {
        // Multiple selection: append if not already there
        if (!currentSelections.includes(candidateName)) {
          next[targetRoleId] = [...currentSelections, candidateName];
        }
      }

      return next;
    });

    // Reset selected candidate for two-step assignment
    setSelectedCandidateForAssignment(null);
  };

  // Helper to remove a candidate from a role
  const removeCandidateFromRole = (candidateName: string, roleId: RoleId) => {
    if (!settings?.votingActive) return;

    setSelections((prev) => {
      const current = prev[roleId] || [];
      return {
        ...prev,
        [roleId]: current.filter((name) => name !== candidateName),
      };
    });
  };

  // Fetch configs
  useEffect(() => {
    let active = true;
    setLoading(true);
    fetch("/api/config")
      .then((res) => {
        if (!res.ok) throw new Error("Impossibile caricare la configurazione dei voti.");
        return res.json();
      })
      .then((data) => {
        if (active) {
          setSettings(data.settings);
          setCandidates(data.candidates);
          setError(null);
          setLoading(false);
        }
      })
      .catch((err) => {
        if (active) {
          setError(err.message || "Errore di connessione.");
          setLoading(false);
        }
      });
    return () => {
      active = false;
    };
  }, [configVersion]);

  // Handle checking/unchecking a candidate
  const handleToggleCandidate = (roleId: RoleId, candidateName: string) => {
    if (!settings?.votingActive) return;

    setSelections((prev) => {
      const current = prev[roleId] || [];
      const isSelected = current.includes(candidateName);

      if (isSelected) {
        // Uncheck
        return {
          ...prev,
          [roleId]: current.filter((name) => name !== candidateName),
        };
      } else {
        // Check
        if (!settings.allowMultipleSelection) {
          // If multiple selection is disabled, replace the array with just this candidate
          return {
            ...prev,
            [roleId]: [candidateName],
          };
        } else {
          // Otherwise, append
          return {
            ...prev,
            [roleId]: [...current, candidateName],
          };
        }
      }
    });
  };

  // Submit voting form
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setValidationError(null);

    if (!settings?.votingActive) {
      setValidationError("Le votazioni sono attualmente chiuse.");
      return;
    }

    if (!voterFullName.trim() || voterFullName.trim().length < 3) {
      setValidationError("Inserisci il tuo nome e cognome completo (minimo 3 caratteri).");
      return;
    }

    try {
      setIsSubmitting(true);
      const token = localStorage.getItem("discordToken");
      const headers: Record<string, string> = { "Content-Type": "application/json" };
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const response = await fetch("/api/vote", {
        method: "POST",
        headers,
        body: JSON.stringify({ voterFullName, selections }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore durante l'invio del voto.");
      }

      setSubmitSuccess(true);
      setLastSubmittedVote(data.vote);
      
      // Reset form
      setVoterFullName("");
      const initial: any = {};
      Object.values(RoleId).forEach((roleId) => {
        initial[roleId] = [];
      });
      setSelections(initial);
    } catch (err: any) {
      setValidationError(err.message || "Qualcosa è andato storto.");
    } finally {
      setIsSubmitting(false);
    }
  };

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-20 text-slate-400">
        <div className="animate-spin rounded-full h-10 w-10 border-b-2 border-indigo-500 mb-4" />
        <p className="text-sm font-medium">Caricamento scheda elettorale...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-6 max-w-xl mx-auto my-10 bg-red-950/20 border border-red-500/20 rounded-lg text-red-200 flex items-start gap-3">
        <AlertCircle className="shrink-0 mt-0.5 text-red-400" />
        <div>
          <h3 className="font-semibold text-red-100 mb-1">Errore del portale</h3>
          <p className="text-sm text-red-300">{error}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-3 px-3 py-1.5 bg-red-600 hover:bg-red-500 text-white rounded text-xs font-semibold cursor-pointer transition-colors"
          >
            Riprova
          </button>
        </div>
      </div>
    );
  }

  const sortedRoleIds = ascendingOrder ? ROLE_IDS_SORTED_ASC : ROLE_IDS_SORTED_DESC;

  return (
    <div className="max-w-4xl mx-auto px-2 sm:px-4 py-4 sm:py-8 w-full max-w-full overflow-x-hidden" id="voter-portal-root">
      <AnimatePresence mode="wait">
        {submitSuccess ? (
          <motion.div
            key="success-card"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.95 }}
            transition={{ duration: 0.4 }}
            className="bg-[#161618] rounded-xl border border-white/10 shadow-2xl p-8 max-w-2xl mx-auto overflow-hidden relative text-slate-200"
          >
            {/* Top decorative badge */}
            <div className="absolute top-0 left-0 right-0 h-1 bg-gradient-to-r from-emerald-500 to-teal-500" />
            
            <div className="text-center mb-8">
              <div className="mx-auto w-16 h-16 bg-emerald-500/10 rounded-full flex items-center justify-center mb-4 text-emerald-400 border border-emerald-500/20">
                <Check size={32} strokeWidth={3} />
              </div>
              <h2 className="text-2xl font-bold text-white">Voto Registrato con Successo!</h2>
              <p className="text-slate-400 mt-2 text-sm">
                Grazie per aver partecipato alla votazione per i ruoli della nostra organizzazione.
              </p>
            </div>

            {/* Receipt detail */}
            <div className="bg-[#111112] border border-white/5 rounded-lg p-5 text-sm font-sans mb-8">
              <div className="flex justify-between items-center pb-3 border-b border-dashed border-white/10 mb-4">
                <span className="text-xs text-slate-500 font-mono">ID RICEVUTA: {lastSubmittedVote?.id}</span>
                <span className="text-xs text-slate-500 font-mono">
                  {lastSubmittedVote ? new Date(lastSubmittedVote.timestamp).toLocaleString("it-IT") : ""}
                </span>
              </div>

              <div className="space-y-2 mb-4">
                <div className="flex justify-between">
                  <span className="text-slate-400">Elettore:</span>
                  <span className="font-semibold text-white">{lastSubmittedVote?.voterFullName}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Stato votazione:</span>
                  <span className="text-emerald-400 font-medium flex items-center gap-1">
                    <Check size={14} /> Salvato in archivio protetto
                  </span>
                </div>
              </div>              <div className="pt-4 border-t border-white/10">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-slate-500 mb-3">Preferenze espresse:</h4>
                <div className="max-h-60 overflow-y-auto space-y-2.5 pr-2 custom-scrollbar">
                  {ROLE_IDS_SORTED_DESC.map((roleId) => {
                    const selectionsForRole = lastSubmittedVote?.selections[roleId] || [];
                    return (
                      <div key={roleId} className="flex justify-between gap-4 py-1 border-b border-white/5 last:border-0 text-xs">
                        <span className="text-slate-400 font-medium">{ROLE_CONFIGS[roleId].name}:</span>
                        <span className="text-slate-200 text-right font-medium">
                          {selectionsForRole.length > 0 ? (
                            selectionsForRole.join(", ")
                          ) : (
                            <span className="text-slate-500 italic">Nessuna selezione</span>
                          )}
                        </span>
                      </div>
                    );
                  })}
                </div>
              </div>

              {/* Excluded Candidates List on the Receipt */}
              <div className="mt-4 pt-4 border-t border-white/10">
                <h4 className="text-xs font-semibold uppercase tracking-wider text-red-400 mb-2">Candidati Esclusi (Non Assegnati):</h4>
                <div className="flex flex-wrap gap-1.5 max-h-32 overflow-y-auto pr-1">
                  {allCandidateNames
                    .filter((name) => {
                      return !Object.values(RoleId).some((roleId) =>
                        lastSubmittedVote?.selections[roleId]?.includes(name)
                      );
                    })
                    .map((name) => (
                      <span
                        key={name}
                        className="px-2 py-0.5 bg-red-500/10 border border-red-500/20 rounded text-red-400 text-[10px] font-semibold"
                      >
                        {name}
                      </span>
                    ))}
                  {allCandidateNames.filter((name) => {
                    return !Object.values(RoleId).some((roleId) =>
                      lastSubmittedVote?.selections[roleId]?.includes(name)
                    );
                  }).length === 0 && (
                    <span className="text-xs text-slate-500 italic">Nessun candidato escluso.</span>
                  )}
                </div>
              </div>
            </div>

            <div className="flex justify-center gap-4">
              <button
                type="button"
                onClick={() => setSubmitSuccess(false)}
                className="px-5 py-2.5 bg-white/5 hover:bg-white/10 border border-white/10 text-white font-semibold rounded-lg text-sm transition-all cursor-pointer"
              >
                Invia un'altra scheda
              </button>
            </div>
          </motion.div>
        ) : (
          <motion.form
            key="voting-form"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onSubmit={handleSubmit}
            className="space-y-8"
          >
            {/* Header info */}
            <div className="bg-[#161618] rounded-xl border border-white/10 shadow-lg p-6 md:p-8">
              <div className="flex items-start md:items-center justify-between gap-4 mb-4">
                <div>
                  <h1 className="text-2xl md:text-3xl font-bold text-white tracking-tight">
                    {settings?.title || "Votazione Interna Ruoli"}
                  </h1>
                  <p className="text-slate-400 mt-2 text-sm leading-relaxed max-w-2xl">
                    {settings?.description || "Seleziona i candidati per ciascuna carica istituzionale."}
                    <span className="block mt-2 text-xs text-indigo-400 font-semibold bg-indigo-500/5 px-2.5 py-1 rounded-md border border-indigo-500/10">
                      💡 Nota: Non è obbligatorio esprimere una preferenza per ciascuno dei 12 ruoli. Puoi lasciare i gradi vuoti se preferisci.
                    </span>
                  </p>
                </div>
                {settings?.votingActive ? (
                  <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 rounded-full text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-emerald-500 animate-pulse" />
                    Aperto
                  </div>
                ) : (
                  <div className="shrink-0 flex items-center gap-1.5 px-3 py-1 bg-rose-500/10 text-rose-400 border border-rose-500/20 rounded-full text-xs font-semibold">
                    <span className="w-2 h-2 rounded-full bg-rose-500" />
                    Chiuso
                  </div>
                )}
              </div>

              {!settings?.votingActive && (
                <div className="bg-amber-500/10 border border-amber-500/20 rounded-lg p-4 text-amber-200 text-sm flex items-start gap-2.5 mb-6">
                  <AlertCircle className="shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <span className="font-semibold">Votazioni Chiuse:</span> Le votazioni non sono attualmente attive. Puoi visualizzare i candidati, ma l'invio è disabilitato.
                  </div>
                </div>
              )}

              {/* Voter Name field */}
              <div className="pt-6 border-t border-white/5 max-w-xl">
                <label htmlFor="voter-fullname" className="block text-sm font-semibold text-slate-300 mb-2">
                  Nome e cognome dell'elettore <span className="text-red-400">*</span>
                </label>
                <div className="relative">
                  <span className="absolute inset-y-0 left-0 pl-3.5 flex items-center text-slate-500 pointer-events-none">
                    <User size={18} />
                  </span>
                  <input
                    id="voter-fullname"
                    type="text"
                    required
                    disabled={!settings?.votingActive}
                    value={voterFullName}
                    onChange={(e) => setVoterFullName(e.target.value)}
                    placeholder="Esempio: Mario Rossi"
                    className="w-full pl-10 pr-4 py-3 bg-white/5 border border-white/10 rounded-lg text-white placeholder-slate-500 focus:outline-hidden focus:ring-2 focus:ring-indigo-500 focus:border-transparent transition-all font-medium text-sm disabled:opacity-50"
                  />
                </div>
                <p className="text-xs text-slate-500 mt-1.5 leading-normal">
                  Il campo è strettamente obbligatorio per convalidare l'unicità del voto nel database protetto dell'organizzazione.
                </p>
              </div>
            </div>

            {/* Hierarchy Section / Interactive track */}
            <div>
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
                <div className="flex items-center gap-2">
                  <FileText className="text-slate-400" size={20} />
                  <h2 className="text-lg font-bold text-white">Scheda Elettorale Gerarchica</h2>
                </div>
                <div className="flex items-center bg-white/5 border border-white/10 rounded-lg p-0.5 shadow-md self-start sm:self-auto">
                  <button
                    type="button"
                    onClick={() => setAscendingOrder(true)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                      ascendingOrder ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <ChevronUp size={14} /> Grado Basso → Alto
                  </button>
                  <button
                    type="button"
                    onClick={() => setAscendingOrder(false)}
                    className={`flex items-center gap-1 px-3 py-1.5 rounded-md text-xs font-semibold cursor-pointer transition-all ${
                      !ascendingOrder ? "bg-indigo-600 text-white font-bold" : "text-slate-400 hover:text-slate-200"
                    }`}
                  >
                    <ChevronDown size={14} /> Grado Alto → Basso
                  </button>
                </div>
              </div>

              {/* Progress direction label */}
              <div className="flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/5 rounded-lg text-xs font-semibold text-slate-400 mb-6 shadow-inner">
                {ascendingOrder ? (
                  <>
                    <span>Grado Basso (V. Primario di Reparto)</span>
                    <div className="grow border-t border-dashed border-white/10" />
                    <ChevronUp size={14} className="animate-bounce text-indigo-400" />
                    <span>Grado Alto (Direttore Generale)</span>
                  </>
                ) : (
                  <>
                    <span>Grado Alto (Direttore Generale)</span>
                    <div className="grow border-t border-dashed border-white/10" />
                    <ChevronDown size={14} className="animate-bounce text-indigo-400" />
                    <span>Grado Basso (V. Primario di Reparto)</span>
                  </>
                )}
              </div>

              {/* Interactive Workspace Grid Layout */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start">
                
                {/* LEFT COLUMN: 12 Hierarchical Roles Dropzones (8 cols) */}
                <div className="lg:col-span-8 space-y-5 relative pl-3 border-l border-white/10 ml-1.5 py-1">
                  {sortedRoleIds.map((roleId, roleIdx) => {
                    const roleConfig = ROLE_CONFIGS[roleId];
                    const selectedForThisRole = selections[roleId] || [];
                    const isOver = dragOverRoleId === roleId;
                    const canClickAssign = selectedCandidateForAssignment !== null;

                    return (
                      <motion.div
                        key={roleId}
                        initial={{ opacity: 0, x: -10 }}
                        animate={{ opacity: 1, x: 0 }}
                        transition={{ delay: roleIdx * 0.03 }}
                        onDragOver={(e) => {
                          if (settings?.votingActive) {
                            e.preventDefault();
                            setDragOverRoleId(roleId);
                          }
                        }}
                        onDragLeave={() => setDragOverRoleId(null)}
                        onDrop={(e) => {
                          if (!settings?.votingActive) return;
                          e.preventDefault();
                          setDragOverRoleId(null);
                          const name = e.dataTransfer.getData("text/plain");
                          if (name) {
                            assignCandidateToRole(name, roleId);
                          }
                        }}
                        onClick={() => {
                          if (canClickAssign && settings?.votingActive) {
                            assignCandidateToRole(selectedCandidateForAssignment!, roleId);
                          }
                        }}
                        className={`relative bg-[#161618] rounded-xl border p-5 md:p-6 transition-all duration-200 shadow-md ${
                          isOver
                            ? "border-emerald-500 bg-emerald-500/5 scale-[1.01] ring-1 ring-emerald-500"
                            : canClickAssign
                            ? "border-indigo-500/40 bg-indigo-500/5 cursor-pointer hover:border-indigo-500 hover:scale-[1.005]"
                            : selectedForThisRole.length > 0
                            ? "border-indigo-500/30 bg-[#161618]/90"
                            : "border-white/5 hover:border-white/10"
                        }`}
                        id={`voting-role-section-${roleId}`}
                      >
                        {/* Connecting hierarchy bullet node */}
                        <div
                          className={`absolute -left-[17px] top-8 w-2.5 h-2.5 rounded-full border bg-[#0A0A0B] transition-all duration-350 ${
                            selectedForThisRole.length > 0
                              ? "border-emerald-400 bg-emerald-400 shadow-emerald-500/50 shadow-xs"
                              : "border-white/20"
                          }`}
                        />

                        {/* Dropzone header badge and constraints */}
                        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
                          <RoleBadge roleId={roleId} showGrade={true} />
                          
                          <div className="text-[10px] font-bold tracking-wider space-x-1.5 flex items-center flex-wrap gap-y-1">
                            {settings?.allowMultipleSelection ? (
                              <span className="text-indigo-400 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                                Multivoto attivo
                              </span>
                            ) : (
                              <span className="text-amber-400 bg-amber-500/10 px-2 py-0.5 rounded border border-amber-500/20">
                                Scelta singola
                              </span>
                            )}
                            {selectedForThisRole.length > 0 && (
                              <>
                                <span className="text-emerald-400 bg-emerald-500/10 px-2 py-0.5 rounded border border-emerald-500/20">
                                  Assegnati: {selectedForThisRole.length}
                                </span>
                                {settings?.votingActive && (
                                  <button
                                    type="button"
                                    onClick={(e) => {
                                      e.stopPropagation();
                                      setSelections((prev) => ({
                                        ...prev,
                                        [roleId]: [],
                                      }));
                                    }}
                                    className="text-red-400 hover:text-red-300 hover:bg-red-500/10 px-2 py-0.5 rounded border border-red-500/20 font-bold cursor-pointer transition-colors"
                                    title="Svuota tutte le preferenze di questo ruolo"
                                  >
                                    Svuota
                                  </button>
                                )}
                              </>
                            )}
                          </div>
                        </div>

                        {/* Interactive Drop Content */}
                        <div className="mt-2">
                          {selectedForThisRole.length === 0 ? (
                            <div
                              className={`flex flex-col items-center justify-center py-5 border border-dashed rounded-lg text-center transition-colors ${
                                isOver
                                  ? "border-emerald-500 text-emerald-400"
                                  : canClickAssign
                                  ? "border-indigo-500/40 text-indigo-400 animate-pulse bg-indigo-500/5"
                                  : "border-white/10 text-slate-500 hover:border-white/20"
                              }`}
                            >
                              <Move size={18} className="mb-1.5 opacity-60" />
                              {canClickAssign ? (
                                <p className="text-xs font-bold">
                                  Fai clic qui per assegnare <span className="text-white">"{selectedCandidateForAssignment}"</span>
                                </p>
                              ) : (
                                <p className="text-xs font-medium">
                                  Trascina qui un candidato o selezionalo a destra
                                </p>
                              )}
                            </div>
                          ) : (
                            <div className="flex flex-wrap gap-2">
                              {selectedForThisRole.map((candName) => (
                                <div
                                  key={candName}
                                  className="flex items-center gap-2 px-3 py-1.5 bg-[#0A0A0B] border border-white/10 rounded-lg text-xs font-semibold text-slate-200 shadow-sm"
                                >
                                  <div className="w-1.5 h-1.5 rounded-full bg-indigo-400 shrink-0" />
                                  <span>{candName}</span>
                                  {settings?.votingActive && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeCandidateFromRole(candName, roleId);
                                      }}
                                      className="p-0.5 text-slate-500 hover:text-red-400 hover:bg-red-500/10 rounded-md cursor-pointer transition-colors shrink-0"
                                      title="Rimuovi da questo grado"
                                    >
                                      <X size={12} />
                                    </button>
                                  )}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>

                        {/* Interactive selector list in card for mouse-only users */}
                        {settings?.votingActive && (
                          <div className="mt-3 flex justify-end">
                            <select
                              value=""
                              onChange={(e) => {
                                if (e.target.value) {
                                  assignCandidateToRole(e.target.value, roleId);
                                }
                              }}
                              className="text-[11px] bg-[#0A0A0B] hover:bg-white/5 border border-white/10 text-slate-400 font-bold px-2 py-1.5 rounded-md focus:outline-hidden focus:border-indigo-500 transition-colors"
                            >
                              <option value="">+ Seleziona candidato...</option>
                              {allCandidateNames
                                .filter((name) => !selectedForThisRole.includes(name))
                                .map((name) => {
                                  const currentAssignment = getCandidateAssignment(name);
                                  return (
                                    <option key={name} value={name}>
                                      {name} {currentAssignment ? `(Sposta da ${ROLE_CONFIGS[currentAssignment].name})` : ""}
                                    </option>
                                  );
                                })}
                            </select>
                          </div>
                        )}
                      </motion.div>
                    );
                  })}
                </div>

                {/* RIGHT COLUMN: Candidates Pool (4 cols - Sticky for Desktop) */}
                <div className="lg:col-span-4 lg:sticky lg:top-6 space-y-5">
                  <div className="bg-[#161618] rounded-xl border border-white/10 shadow-lg p-5 space-y-4">
                    
                    {/* Pool Header */}
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold text-sm text-white flex items-center gap-2">
                        <User size={16} className="text-indigo-400" />
                        Candidati Disponibili
                      </h3>
                      <span className="text-[10px] font-extrabold bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 px-2 py-0.5 rounded-full">
                        {allCandidateNames.length} totali
                      </span>
                    </div>

                    <p className="text-[11px] text-slate-400 leading-normal">
                      Trascina un candidato sul grado a sinistra, o clicca su di esso per poi fare clic sul grado di destinazione. I candidati non assegnati diventeranno <strong>esclusi</strong>.
                    </p>

                    {/* Search bar */}
                    <div className="relative">
                      <span className="absolute inset-y-0 left-0 pl-2.5 flex items-center text-slate-500 pointer-events-none">
                        <Search size={14} />
                      </span>
                      <input
                        type="text"
                        placeholder="Cerca candidato..."
                        value={candidateSearchQuery}
                        onChange={(e) => setCandidateSearchQuery(e.target.value)}
                        className="w-full bg-[#0A0A0B] border border-white/10 rounded-lg pl-8 pr-7 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-indigo-500 font-medium"
                      />
                      {candidateSearchQuery && (
                        <button
                          type="button"
                          onClick={() => setCandidateSearchQuery("")}
                          className="absolute inset-y-0 right-0 pr-2 flex items-center text-slate-500 hover:text-white"
                        >
                          <X size={12} />
                        </button>
                      )}
                    </div>

                    {/* Candidates Pool List */}
                    <div className="max-h-[380px] overflow-y-auto pr-1 space-y-2.5 custom-scrollbar">
                      
                      {/* Section 1: Unassigned Candidates */}
                      <div className="space-y-1.5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Non assegnati (Esclusi - {allCandidateNames.filter((name) => !getCandidateAssignment(name)).length})
                        </div>
                        {allCandidateNames
                          .filter((name) => !getCandidateAssignment(name))
                          .filter((name) =>
                            name.toLowerCase().includes(candidateSearchQuery.toLowerCase())
                          )
                          .map((name) => {
                            const isSelectedForClickAssign = selectedCandidateForAssignment === name;
                            return (
                              <div
                                key={name}
                                draggable={settings?.votingActive}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("text/plain", name);
                                  setDraggingCandidateName(name);
                                }}
                                onDragEnd={() => setDraggingCandidateName(null)}
                                onClick={() => {
                                  if (!settings?.votingActive) return;
                                  setSelectedCandidateForAssignment(
                                    selectedCandidateForAssignment === name ? null : name
                                  );
                                }}
                                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-semibold select-none cursor-grab active:cursor-grabbing transition-all ${
                                  isSelectedForClickAssign
                                    ? "bg-indigo-600/20 border-indigo-500 text-white shadow-md"
                                    : "bg-[#0A0A0B] border-white/5 hover:border-white/10 text-slate-300 hover:text-white"
                                }`}
                              >
                                <div className="flex items-center gap-2 truncate">
                                  <Move size={12} className="text-slate-500 shrink-0" />
                                  <span className="truncate">{name}</span>
                                </div>
                                <span className="text-[9px] uppercase tracking-wider font-extrabold text-red-400 bg-red-500/10 border border-red-500/20 px-1.5 py-0.2 rounded shrink-0">
                                  Escluso
                                </span>
                              </div>
                            );
                          })}
                        {allCandidateNames.filter((name) => !getCandidateAssignment(name)).length === 0 && (
                          <div className="text-[11px] italic text-slate-500 py-1 text-center bg-[#0A0A0B]/20 rounded border border-white/5">
                            Tutti i candidati sono stati assegnati.
                          </div>
                        )}
                      </div>

                      {/* Section 2: Already Assigned Candidates */}
                      <div className="space-y-1.5 pt-2 border-t border-white/5">
                        <div className="text-[10px] font-bold text-slate-500 uppercase tracking-wider mb-1">
                          Già assegnati ({allCandidateNames.filter((name) => getCandidateAssignment(name)).length})
                        </div>
                        {allCandidateNames
                          .filter((name) => getCandidateAssignment(name))
                          .filter((name) =>
                            name.toLowerCase().includes(candidateSearchQuery.toLowerCase())
                          )
                          .map((name) => {
                            const currentRole = getCandidateAssignment(name)!;
                            const isSelectedForClickAssign = selectedCandidateForAssignment === name;
                            return (
                              <div
                                key={name}
                                draggable={settings?.votingActive}
                                onDragStart={(e) => {
                                  e.dataTransfer.setData("text/plain", name);
                                  setDraggingCandidateName(name);
                                }}
                                onDragEnd={() => setDraggingCandidateName(null)}
                                onClick={() => {
                                  if (!settings?.votingActive) return;
                                  setSelectedCandidateForAssignment(
                                    selectedCandidateForAssignment === name ? null : name
                                  );
                                }}
                                className={`flex items-center justify-between p-2.5 rounded-lg border text-xs font-semibold select-none cursor-grab active:cursor-grabbing opacity-85 hover:opacity-100 transition-all ${
                                  isSelectedForClickAssign
                                    ? "bg-indigo-600/20 border-indigo-500 text-white"
                                    : "bg-[#0A0A0B] border-white/5 text-slate-400 hover:text-slate-200"
                                }`}
                              >
                                <span className="truncate pr-2">{name}</span>
                                <div className="flex items-center gap-1.5 shrink-0">
                                  <span className="text-[9px] uppercase tracking-wider font-extrabold text-emerald-400 bg-emerald-500/10 border border-emerald-500/20 px-1.5 py-0.2 rounded truncate max-w-[100px]">
                                    {ROLE_CONFIGS[currentRole].name}
                                  </span>
                                  {settings?.votingActive && (
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        removeCandidateFromRole(name, currentRole);
                                      }}
                                      className="p-1 text-slate-400 hover:text-red-400 hover:bg-red-500/15 rounded transition-colors cursor-pointer shrink-0"
                                      title="Rimuovi assegnazione"
                                    >
                                      <X size={10} />
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                      </div>

                      {allCandidateNames.length === 0 && (
                        <div className="text-xs italic text-slate-500 text-center py-4">
                          Nessun candidato presente nel database.
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Sidebar Guidelines banner */}
                  <div className="bg-white/5 rounded-xl border border-white/5 p-4 text-xs text-slate-400 leading-relaxed shadow-md">
                    <div className="flex gap-2 text-slate-200 font-semibold mb-1.5 items-center">
                      <Sparkles size={14} className="text-indigo-400 animate-pulse" />
                      <span>Linee Guida d'Assegnazione</span>
                    </div>
                    Ogni candidato può risiedere in un solo grado contemporaneamente. Trascina un candidato già inserito per riassegnarlo istantaneamente a una nuova carica gerarchica.
                  </div>
                </div>

              </div>
            </div>

            {/* Error messaging */}
            {validationError && (
              <div className="bg-red-500/10 border border-red-500/20 text-red-200 rounded-lg p-4 text-sm flex items-start gap-2.5 max-w-xl mx-auto shadow-sm">
                <AlertCircle className="shrink-0 mt-0.5 text-red-400" />
                <div>
                  <span className="font-bold">Attenzione:</span> {validationError}
                </div>
              </div>
            )}

            {/* Submit block */}
            <div className="flex flex-col items-center pt-8 pb-12 border-t border-white/5">
              <button
                type="submit"
                disabled={isSubmitting || !settings?.votingActive}
                className={`w-full max-w-md py-4 rounded-xl text-white font-bold text-base shadow-lg cursor-pointer flex items-center justify-center gap-2 transition-all ${
                  !settings?.votingActive
                    ? "bg-white/5 text-slate-500 border border-white/10 shadow-none cursor-not-allowed"
                    : isSubmitting
                    ? "bg-indigo-800 animate-pulse cursor-wait"
                    : "bg-indigo-600 hover:bg-indigo-500 hover:shadow-lg hover:shadow-indigo-500/20 active:scale-98"
                }`}
              >
                {isSubmitting ? (
                  <>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-white" />
                    <span>Registrazione voto...</span>
                  </>
                ) : (
                  <>
                    <Send size={18} />
                    <span>Invia Voto Ufficiale</span>
                  </>
                )}
              </button>
              <p className="text-xs text-slate-500 mt-3 text-center max-w-sm">
                Inviando questa scheda di voto si dichiara che le preferenze espresse rispecchiano fedelmente la propria volontà istituzionale.
              </p>
            </div>
          </motion.form>
        )}
      </AnimatePresence>
    </div>
  );
}
