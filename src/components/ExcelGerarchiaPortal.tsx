import React, { useState, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileSpreadsheet,
  ExternalLink,
  Shield,
  Key,
  Lock,
  ArrowRight,
  ArrowLeft,
  CheckCircle2,
  AlertCircle,
  Sparkles,
  Award,
  RefreshCw,
  Eye,
  Info
} from "lucide-react";
import {
  DiscordUserSession,
  getUserEffectiveGrade,
  GOOGLE_SHEET_GERARCHIA_URL
} from "../types.js";
import ExcelGerarchiaView from "./ExcelGerarchiaView.js";

interface ExcelGerarchiaPortalProps {
  discordSession: DiscordUserSession | null;
  onNavigate: (mode: "home" | "voter" | "admin" | "hierarchy" | "candidatura" | "cda" | "excel_gerarchia") => void;
  onSessionUpdated?: (session: DiscordUserSession) => void;
}

export default function ExcelGerarchiaPortal({
  discordSession,
  onNavigate,
  onSessionUpdated,
}: ExcelGerarchiaPortalProps) {
  const [tokenInput, setTokenInput] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [overrideSession, setOverrideSession] = useState<DiscordUserSession | null>(null);

  // Active session priority: overrideSession > discordSession
  const activeSession = overrideSession || discordSession;

  // Saved admin/discord tokens
  const savedToken =
    overrideSession?.token ||
    discordSession?.token ||
    (typeof window !== "undefined" ? localStorage.getItem("adminToken") || localStorage.getItem("discordToken") : null);

  const cleanRole = (activeSession?.roleName || "").toLowerCase();
  const effectiveGrade = activeSession ? getUserEffectiveGrade(activeSession) : 0;

  const isAuthorized = Boolean(
    activeSession?.isMaster ||
    cleanRole.includes("proprietario") ||
    cleanRole.includes("vice proprietario") ||
    cleanRole.includes("direttore generale") ||
    effectiveGrade >= 20 ||
    savedToken?.toUpperCase() === "EMS-2410PROP"
  );

  const handleVerifyKey = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    const key = tokenInput.trim();
    if (!key) {
      setErrorMessage("Inserisci la Key di Accesso del Direttore Generale o della Proprietà.");
      return;
    }

    setIsVerifying(true);

    try {
      const response = await fetch("/api/discord/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenInput: key,
          username: "Direzione Generale",
          selectedRole: "Direttore Generale",
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Key non valida o non autorizzata per la sezione Excel Gerarchia.");
      }

      const session: DiscordUserSession = data.userSession;
      const role = (session.roleName || "").toLowerCase();
      const grade = getUserEffectiveGrade(session);

      if (
        !session.isMaster &&
        !role.includes("direttore generale") &&
        !role.includes("proprietario") &&
        grade < 20
      ) {
        throw new Error("Accesso negato: Questa key appartiene al ruolo " + session.roleName + ", mentre la sezione richiede la Key del Direttore Generale.");
      }

      setSuccessMessage(`Accesso Autorizzato! Benvenuto ${session.username} (${session.roleName}).`);
      setOverrideSession(session);
      localStorage.setItem("discordToken", data.token);
      localStorage.setItem("discordUserSession", JSON.stringify(session));

      if (onSessionUpdated) {
        onSessionUpdated(session);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Errore di connessione durante la verifica della key.");
    } finally {
      setIsVerifying(false);
    }
  };

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-200 py-6 sm:py-10 px-3 sm:px-6 lg:px-8 relative overflow-hidden">
      {/* Background ambient lighting */}
      <div className="absolute top-0 left-1/2 -translate-x-1/2 w-[800px] h-[350px] bg-gradient-to-b from-emerald-600/10 via-teal-600/5 to-transparent blur-[140px] pointer-events-none rounded-full" />
      <div className="absolute top-32 right-10 w-80 h-80 bg-emerald-500/5 blur-[120px] pointer-events-none" />

      <div className="max-w-7xl mx-auto relative z-10 space-y-6">
        {/* Navigation Breadcrumb / Top Bar */}
        <div className="flex flex-wrap items-center justify-between gap-3 pb-2 border-b border-slate-800/80">
          <button
            onClick={() => onNavigate("home")}
            className="inline-flex items-center gap-2 text-xs font-bold text-slate-400 hover:text-white transition-colors cursor-pointer py-1"
          >
            <ArrowLeft size={15} />
            <span>Torna alla Home</span>
          </button>
        </div>

        {/* Header Title Banner */}
        <div className="bg-gradient-to-r from-[#101915] via-[#12221b] to-[#101915] border border-emerald-500/30 rounded-2xl p-5 sm:p-7 shadow-xl shadow-emerald-950/20 relative overflow-hidden">
          <div className="flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
            <div className="space-y-2">
              <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/10 border border-emerald-500/30 text-emerald-400 text-xs font-black uppercase tracking-wider">
                <FileSpreadsheet size={14} /> Sezione Dedicata Ufficiale
              </div>
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-black tracking-tight text-white flex items-center gap-3">
                <span>Excel Gerarchia EMS</span>
                <span className="text-xs sm:text-sm font-bold px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 rounded-full">
                  Google Sheet Live
                </span>
              </h1>
              <p className="text-slate-300 text-xs sm:text-sm max-w-3xl leading-relaxed">
                Registro centrale e foglio di calcolo della catena gerarchica EMS. Gestisce e sincronizza in tempo reale le promozioni approvate, le candidature accettate e le delibere del Consiglio di Amministrazione (CDA).
              </p>
            </div>

            {isAuthorized && (
              <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2 shrink-0">
                <div className="px-3.5 py-2 rounded-xl bg-emerald-950/60 border border-emerald-500/40 text-left">
                  <div className="text-[10px] uppercase font-bold text-emerald-400 tracking-wider">Accesso Attivo</div>
                  <div className="text-xs font-extrabold text-white flex items-center gap-1.5">
                    <Shield size={13} className="text-emerald-400" />
                    <span>{activeSession?.roleName || "Direttore Generale"}</span>
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* If user is authorized, render the full ExcelGerarchiaView */}
        {isAuthorized ? (
          <div className="animate-fadeIn">
            <ExcelGerarchiaView
              authToken={savedToken || "MASTER-TOKEN"}
              sessionInfo={
                activeSession
                  ? {
                      roleName: activeSession.roleName,
                      username: activeSession.username,
                      grade: effectiveGrade,
                      isMaster: Boolean(activeSession.isMaster),
                    }
                  : null
              }
            />
          </div>
        ) : (
          /* Locked State / Gateway for Direttore Generale key */
          <div className="max-w-xl mx-auto py-8">
            <div className="bg-[#12141a] border border-slate-800 hover:border-emerald-500/40 rounded-2xl p-6 sm:p-8 shadow-2xl space-y-6 text-center transition-all">
              <div className="w-16 h-16 rounded-2xl bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center mx-auto text-emerald-400 shadow-lg shadow-emerald-950/50">
                <Lock size={32} />
              </div>

              <div className="space-y-2">
                <h2 className="text-xl sm:text-2xl font-black text-white">
                  Accesso Riservato alla Direzione Generale
                </h2>
                <p className="text-slate-400 text-xs sm:text-sm leading-relaxed">
                  Questa sezione è protetta ed è accessibile esclusivamente tramite la <strong className="text-emerald-300">Key del Direttore Generale</strong> o le credenziali della <strong className="text-amber-300">Proprietà EMS</strong>.
                </p>
              </div>

              {/* Informative highlight */}
              <div className="p-3.5 rounded-xl bg-slate-900/90 border border-slate-800 text-left text-xs space-y-2">
                <div className="flex items-center gap-2 text-emerald-400 font-bold text-2xs uppercase tracking-wider">
                  <Info size={13} />
                  <span>Funzionalità Incluse nel Portale:</span>
                </div>
                <ul className="space-y-1 text-slate-300 text-[11px] list-disc list-inside">
                  <li>Visualizzazione e modifica del Registro Ufficiale Gerarchia</li>
                  <li>Sincronizzazione automatica colonna <strong>"Nuovo Grado"</strong> con Candidature & CDA</li>
                  <li>Visualizzatore incorporato del Google Sheet ufficiale</li>
                  <li>Esportazione report in formato Excel/CSV</li>
                </ul>
              </div>

              {/* Key Form */}
              <form onSubmit={handleVerifyKey} className="space-y-4 pt-2 text-left">
                <div className="space-y-1.5">
                  <label className="block text-xs font-bold text-slate-300 uppercase tracking-wider flex items-center gap-1.5">
                    <Key size={13} className="text-emerald-400" />
                    <span>Inserisci Key Direttore Generale / Proprietà</span>
                  </label>
                  <input
                    type="password"
                    value={tokenInput}
                    onChange={(e) => setTokenInput(e.target.value)}
                    placeholder="Es. EMS-TEST-XXXX o Chiave Master..."
                    className="w-full px-4 py-3 bg-[#0a0a0f] border border-slate-700 focus:border-emerald-500 focus:ring-1 focus:ring-emerald-500 rounded-xl text-white font-mono text-xs placeholder:text-slate-600 transition-all outline-none"
                  />
                </div>

                {errorMessage && (
                  <div className="p-3 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2 animate-fadeIn">
                    <AlertCircle size={15} className="text-rose-400 shrink-0 mt-0.5" />
                    <span>{errorMessage}</span>
                  </div>
                )}

                {successMessage && (
                  <div className="p-3 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2 animate-fadeIn">
                    <CheckCircle2 size={15} className="text-emerald-400 shrink-0 mt-0.5" />
                    <span>{successMessage}</span>
                  </div>
                )}

                <button
                  type="submit"
                  disabled={isVerifying || !tokenInput.trim()}
                  className="w-full py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 disabled:opacity-50 text-white font-bold text-xs uppercase tracking-wider shadow-lg shadow-emerald-950/50 border border-emerald-400/30 flex items-center justify-center gap-2 cursor-pointer transition-all active:scale-98"
                >
                  {isVerifying ? (
                    <>
                      <RefreshCw size={15} className="animate-spin" />
                      <span>Verifica Chiave in corso...</span>
                    </>
                  ) : (
                    <>
                      <Key size={15} />
                      <span>Sblocca Sezione Excel Gerarchia</span>
                      <ArrowRight size={14} />
                    </>
                  )}
                </button>
              </form>

              <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs text-slate-500">
                <button
                  onClick={() => onNavigate("hierarchy")}
                  className="text-slate-400 hover:text-amber-400 transition-colors cursor-pointer flex items-center gap-1"
                >
                  <Award size={13} />
                  <span>Vedi Gerarchia Pubblica EMS</span>
                </button>
                <button
                  onClick={() => onNavigate("home")}
                  className="text-slate-400 hover:text-white transition-colors cursor-pointer"
                >
                  Torna alla Home
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
