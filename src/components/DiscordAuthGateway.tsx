import React, { useState, useEffect } from "react";
import { motion } from "motion/react";
import {
  ShieldCheck,
  ExternalLink,
  Bot,
  AlertCircle,
  CheckCircle2,
  User,
  Key,
  ArrowRight,
  ArrowLeft,
  Lock,
  Code2,
  Copy,
  Check,
  Sparkles,
} from "lucide-react";
import { DiscordUserSession, ALLOWED_DISCORD_ROLES } from "../types.js";

interface DiscordAuthGatewayProps {
  targetPortalName: "voter" | "admin";
  onVerified: (session: DiscordUserSession) => void;
  onCancel: () => void;
}

export default function DiscordAuthGateway({
  targetPortalName,
  onVerified,
  onCancel,
}: DiscordAuthGatewayProps) {
  const [tokenInput, setTokenInput] = useState<string>("");
  const [username, setUsername] = useState<string>("");
  const [selectedRole, setSelectedRole] = useState<string>("V. Primario di Reparto");
  const [verificationCode, setVerificationCode] = useState<string>("");
  const [webGeneratedCode, setWebGeneratedCode] = useState<string>("");
  const [isVerifying, setIsVerifying] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [showBotApiGuide, setShowBotApiGuide] = useState<boolean>(false);
  const [copiedApi, setCopiedApi] = useState<boolean>(false);

  // Generate a temporary reference code on mount
  useEffect(() => {
    fetch("/api/discord/generate-code", { method: "POST" })
      .then((res) => res.json())
      .then((data) => {
        if (data.code) {
          setWebGeneratedCode(data.code);
        }
      })
      .catch(() => {});
  }, []);

  const handleVerify = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrorMessage(null);
    setSuccessMessage(null);

    if (!tokenInput.trim() && !username.trim() && !verificationCode.trim()) {
      setErrorMessage("Inserisci il tuo Token di Accesso Permanente o il tuo Nome Utente Discord.");
      return;
    }

    setIsVerifying(true);

    try {
      const response = await fetch("/api/discord/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          tokenInput: tokenInput.trim(),
          username: username.trim(),
          code: verificationCode.trim(),
          selectedRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Impossibile verificare il tuo account Discord.");
      }

      setSuccessMessage(
        data.message || `Account convalidato! Ruolo: ${data.userSession.roleName} • Token: ${data.token}`
      );

      // Save session token in localStorage for persistence
      localStorage.setItem("discordToken", data.token);
      localStorage.setItem("discordUserSession", JSON.stringify(data.userSession));

      // If Master Token or Proprietario or Vice Proprietario, automatically authorize Admin Portal as well
      if (
        data.userSession?.isMaster ||
        data.userSession?.roleName === "Proprietario" ||
        data.userSession?.roleName === "Vice Proprietario"
      ) {
        localStorage.setItem("adminToken", data.token);
      } else {
        localStorage.removeItem("adminToken");
      }

      setTimeout(() => {
        onVerified(data.userSession);
      }, 900);
    } catch (err: any) {
      setErrorMessage(err.message || "Qualcosa è andato storto durante la verifica.");
    } finally {
      setIsVerifying(false);
    }
  };

  // Quick helper to simulate a Discord Bot webhook verification
  const handleSimulateBotVerify = async () => {
    setIsVerifying(true);
    setErrorMessage(null);
    setSuccessMessage(null);

    try {
      const testUsername = username.trim() || `UtenteDiscord_${Math.floor(Math.random() * 8999 + 1000)}`;
      const response = await fetch("/api/discord/bot-verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          username: testUsername,
          roleName: selectedRole,
        }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Errore nella simulazione del Bot.");
      }

      setTokenInput(data.token);
      setSuccessMessage(
        `🤖 Bot Registrazione Completata! Generato Token di Accesso Permanente: ${data.token}`
      );
    } catch (err: any) {
      setErrorMessage(err.message);
    } finally {
      setIsVerifying(false);
    }
  };

  const portalTitle = targetPortalName === "voter" ? "Portale Elettore" : "Area Amministratore";

  const apiEndpointExample = `// Esempio chiamata dal tuo Bot Discord su /login:
POST ${window.location.origin}/api/discord/bot-verify
Headers: { "Content-Type": "application/json" }
Body: {
  "username": "mario_rossi",
  "roleName": "Direttore Generale",
  "discordId": "1234567890"
}

// Risposta dal Server:
{
  "success": true,
  "token": "EMS-AUTH-A9812C",
  "userSession": { ... }
}`;

  const copyApiToClipboard = () => {
    navigator.clipboard.writeText(apiEndpointExample);
    setCopiedApi(true);
    setTimeout(() => setCopiedApi(false), 2000);
  };

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 py-12">
      <motion.div
        initial={{ opacity: 0, scale: 0.96, y: 10 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        transition={{ duration: 0.3 }}
        className="max-w-2xl w-full bg-[#111116] border border-indigo-500/30 rounded-2xl shadow-2xl shadow-indigo-950/40 overflow-hidden relative"
      >
        {/* Top Gradient Banner */}
        <div className="h-2 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600" />

        <div className="p-6 md:p-8 space-y-6">
          {/* Header */}
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 pb-6 border-b border-white/10">
            <div className="flex items-center gap-3">
              <div className="w-12 h-12 bg-indigo-500/10 border border-indigo-500/30 rounded-xl flex items-center justify-center text-indigo-400 shadow-inner shrink-0">
                <ShieldCheck size={26} />
              </div>
              <div>
                <span className="text-[10px] font-extrabold uppercase tracking-wider text-indigo-400 bg-indigo-500/10 px-2.5 py-0.5 rounded border border-indigo-500/20">
                  Sistema di Token Permanenti Discord
                </span>
                <h2 className="text-xl md:text-2xl font-black text-white mt-1">
                  Accesso Riservato: {portalTitle}
                </h2>
              </div>
            </div>

            <button
              onClick={onCancel}
              className="px-3 py-1.5 bg-white/5 hover:bg-white/10 border border-white/10 rounded-lg text-xs font-bold text-slate-300 hover:text-white transition-colors flex items-center gap-1.5 cursor-pointer shrink-0"
            >
              <ArrowLeft size={14} /> Torna alla Home
            </button>
          </div>

          {/* Explanation Banner */}
          <div className="bg-indigo-950/20 border border-indigo-500/20 rounded-xl p-4 text-xs text-slate-300 space-y-2 leading-relaxed">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 font-bold text-indigo-300 text-sm">
                <ShieldCheck className="text-indigo-400" size={18} />
                <span>Accesso tramite Token Personale Dipendente</span>
              </div>
            </div>
            <p>
              Per accedere al <strong>{portalTitle}</strong>, inserisci il <strong>Token Personale</strong> rilasciato dalla Direzione EMS / Amministrazione. Il token identifica univocamente il tuo <strong>Nome, Cognome e Grado</strong> e ti permette di votare.
            </p>
          </div>

          {/* Error and Success feedback */}
          {errorMessage && (
            <div className="bg-rose-500/10 border border-rose-500/20 rounded-xl p-4 text-xs text-rose-200 flex items-start gap-2.5">
              <AlertCircle size={18} className="text-rose-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">Errore di Autenticazione:</span>
                {errorMessage}
              </div>
            </div>
          )}

          {successMessage && (
            <div className="bg-emerald-500/10 border border-emerald-500/20 rounded-xl p-4 text-xs text-emerald-200 flex items-start gap-2.5">
              <CheckCircle2 size={18} className="text-emerald-400 shrink-0 mt-0.5" />
              <div>
                <span className="font-bold block mb-0.5">Autenticazione Riuscita!</span>
                {successMessage}
              </div>
            </div>
          )}

          {/* Form */}
          <form onSubmit={handleVerify} className="bg-[#16161c] border border-white/10 rounded-xl p-6 space-y-5">
            {/* Direct Token Input */}
            <div className="space-y-2">
              <label className="text-xs font-bold uppercase tracking-wider text-indigo-300 flex items-center justify-between">
                <span className="flex items-center gap-1.5">
                  <Key size={16} className="text-indigo-400" />
                  Inserisci Token Personale Dipendente
                </span>
                <span className="text-[11px] text-slate-400 font-mono">es. EMS-A8F12B</span>
              </label>
              <input
                type="text"
                value={tokenInput}
                onChange={(e) => setTokenInput(e.target.value)}
                placeholder="Incolla o digita il tuo Token di Accesso qui..."
                className="w-full px-4 py-3 bg-[#0a0a0f] border border-indigo-500/40 rounded-xl text-white text-sm font-mono tracking-wider focus:outline-hidden focus:border-indigo-400 focus:ring-2 focus:ring-indigo-500/30 transition-all"
                autoFocus
              />
              <p className="text-[11px] text-slate-400 italic">
                * Il token ti è stato assegnato dall'Amministratore con Nome, Cognome e Grado.
              </p>
            </div>

            <div className="pt-2">
              <button
                type="submit"
                disabled={isVerifying}
                className={`w-full py-3.5 bg-gradient-to-r from-indigo-600 via-purple-600 to-pink-600 hover:from-indigo-500 hover:to-pink-500 text-white font-bold rounded-xl text-xs uppercase tracking-wider shadow-lg shadow-indigo-950/50 flex items-center justify-center gap-2 cursor-pointer transition-all ${
                  isVerifying ? "opacity-50 cursor-wait" : ""
                }`}
              >
                {isVerifying ? (
                  <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white" />
                ) : (
                  <>
                    <span>Verifica Token ed Entra nel Portale</span>
                    <ArrowRight size={16} />
                  </>
                )}
              </button>
            </div>
          </form>
        </div>
      </motion.div>
    </div>
  );
}

