import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  FileText,
  User,
  Shield,
  Clock,
  HeartHandshake,
  Loader2,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Send,
  RefreshCw,
  Sparkles,
  Award,
  X,
} from "lucide-react";
import {
  Candidatura,
  CANDIDATURA_CURRENT_ROLES,
  CANDIDATURA_DESIRED_ROLES,
  DiscordUserSession,
  getRoleBadgeStyle,
} from "../types.js";

interface CandidaturaPortalProps {
  discordSession?: DiscordUserSession | null;
}

export default function CandidaturaPortal({ discordSession }: CandidaturaPortalProps) {
  const [fullName, setFullName] = useState<string>(discordSession?.username || "");
  const [currentRole, setCurrentRole] = useState<string>("Primario");
  const [desiredRole, setDesiredRole] = useState<string>("V. Primario di Reparto");
  const [timeSlot, setTimeSlot] = useState<string>("");
  const [offerText, setOfferText] = useState<string>("");

  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [formSuccess, setFormSuccess] = useState<string | null>(null);

  // Status tracking state
  const [activeCandidatura, setActiveCandidatura] = useState<Candidatura | null>(null);
  const [isLoadingStatus, setIsLoadingStatus] = useState<boolean>(true);

  // Cancellation modal state
  const [showCancelModal, setShowCancelModal] = useState<boolean>(false);
  const [cancelReason, setCancelReason] = useState<string>("");
  const [cancelError, setCancelError] = useState<string | null>(null);
  const [isCancelling, setIsCancelling] = useState<boolean>(false);

  // Handle Candidate Cancellation Submit
  const handleCancelCandidaturaSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setCancelError(null);

    const cleanReason = cancelReason.trim();
    if (!cleanReason || cleanReason.length < 3) {
      setCancelError("Inserire obbligatoriamente il motivo dell'annullamento (almeno 3 caratteri).");
      return;
    }

    if (!activeCandidatura) return;

    setIsCancelling(true);
    try {
      const token = localStorage.getItem("discordToken") || localStorage.getItem("adminToken");
      const response = await fetch(`/api/candidature/${encodeURIComponent(activeCandidatura.id)}/cancel`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          id: activeCandidatura.id,
          fullName: activeCandidatura.fullName,
          reason: cleanReason,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore durante l'annullamento della candidatura.");
      }

      setActiveCandidatura(data.candidatura);
      setShowCancelModal(false);
      setCancelReason("");
    } catch (err: any) {
      setCancelError(err.message || "Errore di connessione durante l'annullamento.");
    } finally {
      setIsCancelling(false);
    }
  };

  // Calculate valid lines count in offerText
  const linesArray = offerText.split(/\r\n|\r|\n/).filter((line) => line.trim().length > 0);
  const validLinesCount = linesArray.length;
  const isLineCountValid = validLinesCount >= 5;

  // Fetch active user candidatura status from server
  const fetchMyStatus = async (isSilent = false) => {
    if (!isSilent) setIsLoadingStatus(true);
    try {
      const savedCandId = localStorage.getItem("myCandidaturaId");
      const savedCandName = localStorage.getItem("myCandidaturaName") || fullName || discordSession?.username;
      const token = localStorage.getItem("discordToken") || localStorage.getItem("adminToken");

      let url = "/api/candidature/my-status";
      const params = new URLSearchParams();
      if (savedCandId) params.append("id", savedCandId);
      if (savedCandName) params.append("fullName", savedCandName);
      if (params.toString()) url += `?${params.toString()}`;

      const response = await fetch(url, {
        headers: token ? { Authorization: `Bearer ${token}` } : {},
      });

      const data = await response.json();
      if (response.ok && data.candidatura) {
        setActiveCandidatura(data.candidatura);
        localStorage.setItem("myCandidaturaId", data.candidatura.id);
        localStorage.setItem("myCandidaturaName", data.candidatura.fullName);
      } else {
        if (!savedCandId && !savedCandName) {
          setActiveCandidatura(null);
        }
      }
    } catch (err) {
      if (!isSilent) console.error("Errore nel recupero stato candidatura:", err);
    } finally {
      if (!isSilent) setIsLoadingStatus(false);
    }
  };

  useEffect(() => {
    if (discordSession?.username && !fullName) {
      setFullName(discordSession.username);
    }
    fetchMyStatus(false);

    // Continuous background polling for status updates (every 4s)
    const pollInterval = setInterval(() => {
      fetchMyStatus(true);
    }, 4000);

    return () => clearInterval(pollInterval);
  }, [discordSession]);

  // Handle Form Submission
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);
    setFormSuccess(null);

    if (!fullName.trim()) {
      setFormError("Inserisci Nome e Cognome.");
      return;
    }
    if (!timeSlot.trim()) {
      setFormError("Inserisci la fascia oraria di lavoro.");
      return;
    }
    if (!isLineCountValid) {
      setFormError(`Devi inserire almeno 5 righe valide in 'Cosa Offri'. Attualmente ne hai inserite ${validLinesCount}.`);
      return;
    }

    setIsSubmitting(true);
    try {
      const token = localStorage.getItem("discordToken") || localStorage.getItem("adminToken");
      const response = await fetch("/api/candidature", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({
          fullName: fullName.trim(),
          currentRole,
          desiredRole,
          timeSlot: timeSlot.trim(),
          offerText: offerText.trim(),
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.candidatura) {
          setActiveCandidatura(data.candidatura);
          localStorage.setItem("myCandidaturaId", data.candidatura.id);
          localStorage.setItem("myCandidaturaName", data.candidatura.fullName);
        }
        throw new Error(data.error || "Errore durante l'invio della candidatura.");
      }

      if (data.candidatura) {
        setActiveCandidatura(data.candidatura);
        localStorage.setItem("myCandidaturaId", data.candidatura.id);
        localStorage.setItem("myCandidaturaName", data.candidatura.fullName);
      }
      setFormSuccess(data.message || "Candidatura inviata con successo! È ora in fase di valutazione.");
    } catch (err: any) {
      setFormError(err.message || "Errore durante l'invio.");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleResetNewApplication = () => {
    localStorage.removeItem("myCandidaturaId");
    localStorage.removeItem("myCandidaturaName");
    setActiveCandidatura(null);
    setOfferText("");
    setTimeSlot("");
    setFormError(null);
    setFormSuccess(null);
  };

  if (isLoadingStatus) {
    return (
      <div className="max-w-4xl mx-auto py-20 px-6 text-center">
        <div className="inline-flex items-center gap-3 bg-[#111116] border border-slate-800/80 rounded-2xl p-6 text-slate-400 shadow-2xl">
          <Loader2 size={24} className="animate-spin text-red-500" />
          <span className="font-semibold text-sm">Caricamento portale candidature in corso...</span>
        </div>
      </div>
    );
  }

  const currentRoleStyle = getRoleBadgeStyle(currentRole);
  const desiredRoleStyle = getRoleBadgeStyle(desiredRole);

  return (
    <div className="max-w-4xl mx-auto py-6 sm:py-10 px-2 sm:px-6 w-full max-w-full overflow-x-hidden">
      {/* Title & Banner - Matches Main Site EMS Theme */}
      <div className="text-center mb-10 space-y-3">
        <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-gradient-to-r from-red-600/20 via-rose-600/20 to-amber-600/20 border border-red-500/30 text-rose-300 text-xs font-bold uppercase tracking-wider shadow-inner">
          <Sparkles size={14} className="text-red-400" />
          Modulo Ufficiale Avanzamento Carriera EMS
        </div>
        <h1 className="text-3xl sm:text-4xl font-black text-white tracking-tight uppercase">
          <span className="bg-gradient-to-r from-white via-slate-100 to-slate-300 bg-clip-text text-transparent">
            Portale Candidatura
          </span>
        </h1>
        <p className="text-sm text-slate-400 max-w-2xl mx-auto font-medium leading-relaxed">
          Invia la tua candidatura formale per il passaggio di grado interno al corpo EMS.
          I dati inviati saranno esaminati dalla Direzione nell'Area Riservata.
        </p>
      </div>

      {/* --- STATE 1: PENDING (IN VALUTAZIONE) --- */}
      {activeCandidatura && activeCandidatura.status === "PENDING" && (
        <motion.div
          initial={{ opacity: 0, y: 15 }}
          animate={{ opacity: 1, y: 0 }}
          className="bg-[#111116] border-2 border-slate-800 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6"
        >
          {/* Header Status Badge */}
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-slate-800/80">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-slate-900/90 rounded-2xl border border-slate-700/80 text-slate-300 shadow-inner">
                <Loader2 size={28} className="animate-spin text-amber-400" />
              </div>
              <div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/10 text-amber-300 text-xs font-bold uppercase tracking-wider border border-amber-500/30">
                    <Loader2 size={12} className="animate-spin text-amber-400" />
                    (in valutazione)
                  </span>
                  <span className="text-2xs text-slate-500 font-mono">
                    ID: {activeCandidatura.id}
                  </span>
                </div>
                <h2 className="text-lg font-bold text-white mt-1">
                  Candidatura Inviata & In Fase di Valutazione
                </h2>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <button
                onClick={fetchMyStatus}
                className="flex items-center gap-1.5 text-xs text-red-400 hover:text-red-300 bg-red-950/30 border border-red-800/40 px-3 py-1.5 rounded-xl cursor-pointer transition-all active:scale-95 font-semibold"
              >
                <RefreshCw size={12} /> Aggiorna Stato
              </button>
              <button
                onClick={() => {
                  setCancelReason("");
                  setCancelError(null);
                  setShowCancelModal(true);
                }}
                className="flex items-center gap-1.5 text-xs text-amber-300 hover:text-amber-200 bg-amber-950/40 border border-amber-700/50 px-3 py-1.5 rounded-xl cursor-pointer transition-all active:scale-95 font-semibold shadow-sm"
              >
                <XCircle size={13} /> Annulla Candidatura
              </button>
            </div>
          </div>

          {/* Alert Message */}
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-4 flex items-start gap-3 text-xs text-slate-300">
            <Clock size={18} className="text-slate-400 shrink-0 mt-0.5" />
            <p className="leading-relaxed">
              La tua candidatura è stata ricevuta con successo ed è attualmente{" "}
              <strong className="text-amber-300 font-bold">in valutazione</strong>. Rimarrà salvata in questa schermata fino a quando la Direzione non accetta o rifiuta la tua richiesta.
            </p>
          </div>

          {/* Submission Details Summary */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4 text-xs">
            <div className="bg-[#0a0a0f] border border-slate-800/80 rounded-2xl p-4 space-y-2">
              <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 block">
                Candidato
              </span>
              <p className="text-base font-bold text-white">{activeCandidatura.fullName}</p>
              {activeCandidatura.token && (
                <p className="text-2xs font-mono text-red-400">Token: {activeCandidatura.token}</p>
              )}
            </div>

            <div className="bg-[#0a0a0f] border border-slate-800/80 rounded-2xl p-4 space-y-2">
              <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 block">
                Data Invio
              </span>
              <p className="text-sm font-semibold text-slate-200">
                {new Date(activeCandidatura.submittedAt).toLocaleString("it-IT")}
              </p>
            </div>

            <div className="bg-[#0a0a0f] border border-slate-800/80 rounded-2xl p-4 space-y-2">
              <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 block">
                Ruolo Attuale
              </span>
              <div>
                {(() => {
                  const badge = getRoleBadgeStyle(activeCandidatura.currentRole);
                  return (
                    <span className={`inline-block px-3 py-1 rounded-lg text-xs ${badge.className}`} style={badge.style}>
                      {activeCandidatura.currentRole}
                    </span>
                  );
                })()}
              </div>
            </div>

            <div className="bg-[#0a0a0f] border border-slate-800/80 rounded-2xl p-4 space-y-2">
              <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 block">
                Ruolo Desiderato
              </span>
              <div>
                {(() => {
                  const badge = getRoleBadgeStyle(activeCandidatura.desiredRole);
                  return (
                    <span className={`inline-block px-3 py-1 rounded-lg text-xs ${badge.className}`} style={badge.style}>
                      {activeCandidatura.desiredRole}
                    </span>
                  );
                })()}
              </div>
            </div>

            <div className="md:col-span-2 bg-[#0a0a0f] border border-slate-800/80 rounded-2xl p-4 space-y-2">
              <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 block">
                Fascia Oraria Lavorativa
              </span>
              <p className="text-xs font-medium text-slate-200">{activeCandidatura.timeSlot}</p>
            </div>

            <div className="md:col-span-2 bg-[#0a0a0f] border border-slate-800/80 rounded-2xl p-4 space-y-2">
              <span className="text-2xs font-bold uppercase tracking-wider text-slate-500 block">
                Cosa Offri Come Persona / Dipendente
              </span>
              <div className="text-xs text-slate-300 leading-relaxed whitespace-pre-wrap font-sans bg-[#121218] p-3.5 rounded-xl border border-slate-800/80">
                {activeCandidatura.offerText}
              </div>
            </div>
          </div>
        </motion.div>
      )}

      {/* --- STATE 2: APPROVED (ACCETTATA) --- */}
      {activeCandidatura && activeCandidatura.status === "APPROVED" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#111116] border-2 border-emerald-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-emerald-950">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-emerald-950/80 rounded-2xl border border-emerald-500/50 text-emerald-400">
                <CheckCircle2 size={32} />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-emerald-500/20 text-emerald-300 text-xs font-bold uppercase tracking-wider border border-emerald-500/40">
                  Candidatura Accettata
                </span>
                <h2 className="text-xl font-bold text-white mt-1">
                  Congratulazioni {activeCandidatura.fullName}!
                </h2>
              </div>
            </div>
          </div>

          <div className="bg-emerald-950/30 border border-emerald-800/50 rounded-2xl p-5 text-sm text-emerald-200 space-y-2">
            <p className="font-semibold text-emerald-300">
              La tua candidatura per il ruolo di{" "}
              {(() => {
                const badge = getRoleBadgeStyle(activeCandidatura.desiredRole);
                return (
                  <span className={`inline-block px-2.5 py-0.5 rounded-md text-xs mx-1 ${badge.className}`} style={badge.style}>
                    {activeCandidatura.desiredRole}
                  </span>
                );
              })()}{" "}
              è stata approvata dalla Direzione EMS.
            </p>
            {activeCandidatura.reviewedAt && (
              <p className="text-xs text-emerald-400/80">
                Data approvazione: {new Date(activeCandidatura.reviewedAt).toLocaleString("it-IT")}
              </p>
            )}
          </div>

          <div className="pt-2 text-center">
            <button
              onClick={handleResetNewApplication}
              className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider border border-slate-700 transition-all cursor-pointer"
            >
              <Send size={14} /> Invia una Nuova Candidatura
            </button>
          </div>
        </motion.div>
      )}

      {/* --- STATE 3: REJECTED (RIFIUTATA) --- */}
      {activeCandidatura && activeCandidatura.status === "REJECTED" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#111116] border-2 border-rose-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-rose-950">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-rose-950/80 rounded-2xl border border-rose-500/50 text-rose-400">
                <XCircle size={32} />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-rose-500/20 text-rose-300 text-xs font-bold uppercase tracking-wider border border-rose-500/40">
                  Candidatura Non Accolta
                </span>
                <h2 className="text-xl font-bold text-white mt-1">
                  Esito Candidatura per {activeCandidatura.fullName}
                </h2>
              </div>
            </div>
          </div>

          {/* Rejection Reason Card */}
          <div className="bg-rose-950/40 border border-rose-800/60 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-rose-300">
              <AlertCircle size={16} /> Motivo del Rifiuto:
            </div>
            <div className="bg-[#0a0a0f] p-4 rounded-xl border border-rose-900/50 text-xs text-rose-100 font-medium leading-relaxed whitespace-pre-wrap">
              {activeCandidatura.rejectionReason || "Nessun motivo aggiuntivo specificato dalla Direzione."}
            </div>
            {activeCandidatura.reviewedAt && (
              <p className="text-2xs text-rose-300/70 pt-1">
                Data valutazione: {new Date(activeCandidatura.reviewedAt).toLocaleString("it-IT")}
              </p>
            )}
          </div>

          <div className="pt-2 text-center">
            <button
              onClick={handleResetNewApplication}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-red-950/50 transition-all cursor-pointer active:scale-95"
            >
              <Send size={14} /> Presenta Nuova Candidatura Corretta
            </button>
          </div>
        </motion.div>
      )}

      {/* --- STATE 4: CANCELLED (ANNULLATA DALL'UTENTE) --- */}
      {activeCandidatura && activeCandidatura.status === "CANCELLED" && (
        <motion.div
          initial={{ opacity: 0, scale: 0.98 }}
          animate={{ opacity: 1, scale: 1 }}
          className="bg-[#111116] border-2 border-amber-500/60 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6"
        >
          <div className="flex flex-col sm:flex-row items-center justify-between gap-4 pb-6 border-b border-amber-950">
            <div className="flex items-center gap-3.5">
              <div className="p-3 bg-amber-950/80 rounded-2xl border border-amber-500/50 text-amber-400">
                <XCircle size={32} />
              </div>
              <div>
                <span className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 text-xs font-bold uppercase tracking-wider border border-amber-500/40">
                  Candidatura Annullata
                </span>
                <h2 className="text-xl font-bold text-white mt-1">
                  Candidatura Annullata per {activeCandidatura.fullName}
                </h2>
              </div>
            </div>
          </div>

          <div className="bg-amber-950/30 border border-amber-800/50 rounded-2xl p-5 space-y-3">
            <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-amber-300">
              <AlertCircle size={16} /> Motivo dell'Annullamento:
            </div>
            <div className="bg-[#0a0a0f] p-4 rounded-xl border border-amber-900/40 text-xs text-amber-100 font-medium leading-relaxed whitespace-pre-wrap">
              {activeCandidatura.cancellationReason || "Annullata direttamente dall'utente."}
            </div>
            {activeCandidatura.cancelledAt && (
              <p className="text-2xs text-amber-400/70 pt-1">
                Data Annullamento: {new Date(activeCandidatura.cancelledAt).toLocaleString("it-IT")}
              </p>
            )}
          </div>

          <div className="pt-2 text-center">
            <button
              onClick={handleResetNewApplication}
              className="inline-flex items-center gap-2 px-6 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider border border-slate-700 transition-all cursor-pointer active:scale-95"
            >
              <Send size={14} /> Presenta una Nuova Candidatura
            </button>
          </div>
        </motion.div>
      )}

      {/* --- FORM STATE: NO ACTIVE CANDIDATURE OR RESET --- */}
      {!activeCandidatura && (
        <form
          onSubmit={handleSubmit}
          className="bg-[#111116] border border-slate-800/90 rounded-3xl p-6 sm:p-8 shadow-2xl backdrop-blur-md space-y-6"
        >
          {formError && (
            <div className="bg-rose-950/80 border border-rose-500/50 rounded-2xl p-4 flex items-center gap-3 text-xs text-rose-200">
              <AlertCircle size={18} className="text-rose-400 shrink-0" />
              <span>{formError}</span>
            </div>
          )}

          {formSuccess && (
            <div className="bg-emerald-950/80 border border-emerald-500/50 rounded-2xl p-4 flex items-center gap-3 text-xs text-emerald-200">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0" />
              <span>{formSuccess}</span>
            </div>
          )}

          {/* Field 1: Nome e Cognome */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <User size={14} className="text-red-400" />
              1. Nome e Cognome <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={fullName}
              onChange={(e) => setFullName(e.target.value)}
              placeholder="Es. Mario Rossi"
              className="w-full bg-[#0a0a0f] border border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
            />
          </div>

          {/* Field 2 & 3: Ruolo Attuale e Ruolo Desiderato */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            {/* Field 2: Ruolo Attuale */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Shield size={14} className="text-amber-400" />
                  2. Ruolo Attuale <span className="text-rose-400">*</span>
                </label>
                {/* Live Role Badge Preview */}
                <span
                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${currentRoleStyle.className}`}
                  style={currentRoleStyle.style}
                >
                  {currentRole}
                </span>
              </div>
              <select
                value={currentRole}
                onChange={(e) => setCurrentRole(e.target.value)}
                className="w-full bg-[#0a0a0f] border border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-2xl px-4 py-3 text-sm text-white outline-none cursor-pointer transition-all font-medium"
              >
                {CANDIDATURA_CURRENT_ROLES.map((r) => (
                  <option key={r.name} value={r.name} className="bg-slate-900 text-white font-medium">
                    {r.name}
                  </option>
                ))}
              </select>
              <p className="text-2xs text-slate-500">
                Selezionabile da Primario fino a V. Responsabile del Presidio.
              </p>
            </div>

            {/* Field 3: Ruolo Desiderato */}
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                  <Award size={14} className="text-red-400" />
                  3. Ruolo Desiderato <span className="text-rose-400">*</span>
                </label>
                {/* Live Role Badge Preview */}
                <span
                  className={`px-2.5 py-0.5 rounded-md text-xs font-bold ${desiredRoleStyle.className}`}
                  style={desiredRoleStyle.style}
                >
                  {desiredRole}
                </span>
              </div>
              <select
                value={desiredRole}
                onChange={(e) => setDesiredRole(e.target.value)}
                className="w-full bg-[#0a0a0f] border border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-2xl px-4 py-3 text-sm text-white outline-none cursor-pointer transition-all font-medium"
              >
                {CANDIDATURA_DESIRED_ROLES.map((r) => (
                  <option key={r.name} value={r.name} className="bg-slate-900 text-white font-medium">
                    {r.name}
                  </option>
                ))}
              </select>
              <p className="text-2xs text-slate-500">
                Selezionabile dal grado di V. Primario di Reparto fino a Responsabile del Presidio.
              </p>
            </div>
          </div>

          {/* Field 4: Fascia Oraria */}
          <div className="space-y-2">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
              <Clock size={14} className="text-cyan-400" />
              4. Fascia Oraria Lavorativa <span className="text-rose-400">*</span>
            </label>
            <input
              type="text"
              required
              value={timeSlot}
              onChange={(e) => setTimeSlot(e.target.value)}
              placeholder="Es. Lunedì-Venerdì dalle 15:00 alle 22:00, Sabato disponibile"
              className="w-full bg-[#0a0a0f] border border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-2xl px-4 py-3 text-sm text-white placeholder-slate-600 outline-none transition-all"
            />
            <p className="text-2xs text-slate-500">
              Scrivi manualmente i tuoi orari e giorni abituali di presenza.
            </p>
          </div>

          {/* Field 5: Cosa Offrono (Minimo 5 righe) */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold uppercase tracking-wider text-slate-300 flex items-center gap-2">
                <HeartHandshake size={14} className="text-rose-400" />
                5. Cosa Offri come Persona / Dipendente <span className="text-rose-400">*</span>
              </label>
              <span
                className={`text-2xs font-bold px-2.5 py-0.5 rounded-full border ${
                  isLineCountValid
                    ? "bg-emerald-500/10 text-emerald-400 border-emerald-500/30"
                    : "bg-rose-500/10 text-rose-400 border-rose-500/30"
                }`}
              >
                Righe valide: {validLinesCount} / 5 minime
              </span>
            </div>
            <textarea
              required
              rows={7}
              value={offerText}
              onChange={(e) => setOfferText(e.target.value)}
              placeholder="Scrivi qui la tua presentazione dettagliata (minimo 5 righe)...&#10;1. Esperienze e qualifiche nel corpo EMS&#10;2. Punti di forza personali ed etica professionale&#10;3. Obiettivi e contributi previsti per il reparto&#10;4. Disponibilità all'affiancamento dei colleghi&#10;5. Motivazione personale per la promozione"
              className="w-full bg-[#0a0a0f] border border-slate-800 focus:border-red-500 focus:ring-1 focus:ring-red-500 rounded-2xl p-4 text-sm text-white placeholder-slate-600 outline-none transition-all leading-relaxed font-sans"
            />
            <p className="text-2xs text-slate-500">
              È richiesto un testo articolato di almeno 5 righe per consentire un'adeguata valutazione da parte dei dirigenti.
            </p>
          </div>

          {/* Submit Button */}
          <button
            type="submit"
            disabled={isSubmitting || !isLineCountValid}
            className={`w-full py-4 rounded-2xl font-bold text-sm uppercase tracking-wider transition-all cursor-pointer flex items-center justify-center gap-2 shadow-xl active:scale-98 ${
              isLineCountValid && !isSubmitting
                ? "bg-gradient-to-r from-red-600 via-rose-600 to-red-600 hover:from-red-500 hover:to-rose-500 text-white shadow-red-950/50"
                : "bg-slate-800/80 text-slate-500 border border-slate-700/60 cursor-not-allowed"
            }`}
          >
            {isSubmitting ? (
              <>
                <Loader2 size={18} className="animate-spin text-white" />
                Invio in corso...
              </>
            ) : (
              <>
                <Send size={18} /> Invia Candidatura Formale
              </>
            )}
          </button>
        </form>
      )}

      {/* --- MODAL ANNULLAMENTO CANDIDATURA --- */}
      {showCancelModal && activeCandidatura && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-md flex items-center justify-center p-4 animate-fadeIn">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#121216] border border-amber-500/40 rounded-3xl p-6 sm:p-8 max-w-lg w-full shadow-2xl space-y-6"
          >
            <div className="flex items-center justify-between pb-4 border-b border-white/10">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-amber-500/10 border border-amber-500/30 rounded-xl text-amber-400">
                  <XCircle size={24} />
                </div>
                <div>
                  <h3 className="font-bold text-lg text-white">Annulla Candidatura</h3>
                  <p className="text-2xs text-slate-400">Stai per ritirare la tua candidatura formale</p>
                </div>
              </div>
              <button
                onClick={() => setShowCancelModal(false)}
                className="text-slate-400 hover:text-white p-2 rounded-xl hover:bg-white/5 transition-all cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <form onSubmit={handleCancelCandidaturaSubmit} className="space-y-4">
              <div className="bg-amber-950/20 border border-amber-800/40 rounded-2xl p-4 text-xs text-amber-200">
                <p>
                  Candidato: <strong className="text-white">{activeCandidatura.fullName}</strong>
                </p>
                <p>
                  Ruolo Desiderato: <strong className="text-white">{activeCandidatura.desiredRole}</strong>
                </p>
              </div>

              {cancelError && (
                <div className="p-3 bg-rose-500/10 border border-rose-500/30 rounded-xl text-xs text-rose-300 font-semibold flex items-center gap-2">
                  <AlertCircle size={16} className="shrink-0 text-rose-400" />
                  <span>{cancelError}</span>
                </div>
              )}

              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-300">
                  Motivo dell'Annullamento <span className="text-rose-400">* (Obbligatorio)</span>
                </label>
                <textarea
                  required
                  rows={4}
                  value={cancelReason}
                  onChange={(e) => setCancelReason(e.target.value)}
                  placeholder="Inserisci qui il motivo dettagliato per cui stai annullando la tua candidatura..."
                  className="w-full bg-[#0a0a0f] border border-slate-700 focus:border-amber-500 focus:ring-1 focus:ring-amber-500 rounded-2xl p-3.5 text-xs text-white placeholder-slate-500 outline-none transition-all leading-relaxed"
                />
                <p className="text-2xs text-slate-500">
                  ⚠️ Il motivo è obbligatorio e verrà registrato per la Direzione EMS.
                </p>
              </div>

              <div className="flex items-center justify-end gap-3 pt-2 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setShowCancelModal(false)}
                  className="px-4 py-2.5 rounded-xl text-xs font-semibold text-slate-400 hover:text-slate-200 hover:bg-white/5 transition-all cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isCancelling || cancelReason.trim().length < 3}
                  className="px-5 py-2.5 bg-amber-600 hover:bg-amber-500 disabled:opacity-40 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-lg transition-all cursor-pointer flex items-center gap-2"
                >
                  {isCancelling ? (
                    <>
                      <Loader2 size={14} className="animate-spin" /> Annullamento...
                    </>
                  ) : (
                    <>
                      <XCircle size={14} /> Conferma Annullamento
                    </>
                  )}
                </button>
              </div>
            </form>
          </motion.div>
        </div>
      )}
    </div>
  );
}
