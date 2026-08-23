import React, { useState } from "react";
import { motion } from "motion/react";
import giovanniImg from "../assets/images/giovanni.png";
import antonyImg from "../assets/images/antony.png";
import simoneImg from "../assets/images/simone.png";
import emsLogo from "../assets/images/ems_logo_1784649117886.jpg";
import emeralsGif from "../assets/images/emerals_badge.gif";
import {
  HeartPulse,
  GraduationCap,
  Users,
  ShieldCheck,
  Crown,
  Sparkles,
  Vote,
  Shield,
  ArrowRight,
  CheckCircle2,
  ExternalLink,
  Copy,
  Check,
  Stethoscope,
  Siren,
  Building2,
  Handshake,
  BookOpen,
  Award,
  Clock,
  Phone,
  FileText,
  MessageSquare,
  Activity,
  Briefcase,
  Quote,
  ChevronRight,
  FileSpreadsheet
} from "lucide-react";

interface LandingPageProps {
  onNavigate: (mode: "voter" | "admin" | "hierarchy" | "candidatura" | "cda" | "excel_gerarchia") => void;
}

export default function LandingPage({ onNavigate }: LandingPageProps) {
  const [copiedHandle, setCopiedHandle] = useState<string | null>(null);
  const [activeModal, setActiveModal] = useState<"regolamento" | "contatti" | "discord" | null>(null);
  const [selectedFounder, setSelectedFounder] = useState<{
    name: string;
    role: string;
    discord: string;
    rawHandle: string;
    initials: string;
    avatarUrl: string;
    isOwner: boolean;
    avatarBorder: string;
    badgeClass: string;
    glow: string;
    pastJobs: string[];
    personalDescription: string;
  } | null>(null);

  const copyToClipboard = (text: string, handle: string) => {
    navigator.clipboard.writeText(text);
    setCopiedHandle(handle);
    setTimeout(() => {
      setCopiedHandle(null);
    }, 2500);
  };

  const founders = [
    {
      name: "Antony Romano",
      role: "Proprietario",
      discord: "@anto.romano",
      rawHandle: "anto.romano",
      initials: "AR",
      avatarUrl: antonyImg,
      isOwner: true,
      avatarBorder: "border-amber-500/50 shadow-amber-500/20",
      badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-950/40",
      glow: "hover:shadow-amber-500/10 hover:border-amber-500/40",
      pastJobs: [
        "Direttore Ospedaliero su Emerals RP 3.1",
        "Coordinatore delle Risorse Umane Us-Army sezione psichiatria"
      ],
      personalDescription: "Presente nel mondo del Roleplay medico da oltre 4 anni. Mi occupo della direzione strategica e organizzativa dell'intero corpo EMS, dello sviluppo dei regolamenti interni e della supervisione della crescita di ogni singolo membro. Il mio obiettivo principale è garantire un RP medico di altissimo livello, realistico ed entusiasmante per tutta la community."
    },
    {
      name: "Giovanni Manzo",
      role: "Proprietario",
      discord: "@smokafps",
      rawHandle: "smokafps",
      initials: "GM",
      avatarUrl: giovanniImg,
      isOwner: true,
      avatarBorder: "border-amber-500/50 shadow-amber-500/20",
      badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-950/40",
      glow: "hover:shadow-amber-500/10 hover:border-amber-500/40",
      pastJobs: [
        "Direttore Generale Ospedaliero su Emerals RP 3.1",
        "Ministro della Salute presso il Governo di Blaine County",
        "Ministro della Difesa presso il Governo di Blaine County",
        "Governatore presso il Governo di Blaine County",
        "Responsabile delle Risorse Umane Us-Army",
        "Governatore di Los Santos & Blaine County"
      ],
      personalDescription: "Il mio percorso in città è iniziato nell’Emergency Medical Services, dove ho intrapreso la carriera da medico. Grazie all’impegno, alla dedizione e alle capacità organizzative dimostrate sul campo, ho scalato rapidamente la gerarchia fino a ricoprire, in appena un mese e mezzo, la carica di Direttore Generale dell’EMS. Durante quel periodo ho guidato l’azienda in importanti riorganizzazioni, consolidandone la struttura e migliorandone l’efficienza operativa. I risultati ottenuti mi hanno portato a essere nominato Ministro della Salute del Governo di Blaine County e, successivamente, anche Ministro della Difesa. In quest’ultimo ruolo ho coordinato le Forze dell’Ordine e gestito la sicurezza del territorio, dimostrando capacità di leadership e gestione delle emergenze che mi hanno permesso di essere scelto come Governatore di Blaine County. Parallelamente, ho ricoperto anche l’incarico di Responsabile delle Risorse Umane della U.S. Army, occupandomi della selezione, della formazione e della gestione del personale militare, nonché dei protocolli di comportamento delle FDO, contribuendo allo sviluppo organizzativo del corpo e all’ottimizzazione delle procedure interne. In seguito ho deciso di candidarmi alla guida dell’intero Stato, vincendo le elezioni e diventando Governatore di Los Santos & Blaine County. Ho ricoperto la carica per diversi mesi, amministrando il territorio con responsabilità e ottenendo il rispetto e la fiducia di gran parte delle istituzioni e della cittadinanza. Tuttavia, a causa di alcune problematiche interne all’amministrazione, ho scelto di rassegnare le dimissioni, convinto che fosse la decisione migliore per garantire stabilità al Governo. Terminata l’esperienza politica, sono tornato alle mie origini, riprendendo la guida completa dell’EMS con l’obiettivo di continuare a sviluppare il servizio sanitario, formare nuovi professionisti e garantire un’assistenza efficiente alla comunità, mettendo a disposizione l’esperienza maturata sia in ambito sanitario che istituzionale."
    },
    {
      name: "Simone Rizzus",
      role: "Proprietario",
      discord: "@simolmao",
      rawHandle: "simolmao",
      initials: "SR",
      avatarUrl: simoneImg,
      isOwner: true,
      avatarBorder: "border-amber-500/50 shadow-amber-500/20",
      badgeClass: "bg-amber-500/15 text-amber-300 border-amber-500/40 shadow-sm shadow-amber-950/40",
      glow: "hover:shadow-amber-500/10 hover:border-amber-500/40",
      pastJobs: [
        "Direttore Generale Ospedaliero su Emerals RP 3.1",
        "Ministro del Lavoro presso il Governo di Los Santos",
        "Vice Ministro degli Interni presso il Governo di Los Santos",
        "Direttore di varie aziende di tutta la contea (Import/Export, McDonalds, Triad Records, ecc.)",
        "Ministro del Lavoro presso il Governo di Blaine County",
        "Vice Governatore presso il Governo di Blaine County",
        "Responsabile delle Risorse Umane Us-Army",
        "Vice Governatore di Los Santos & Blaine County"
      ],
      personalDescription: "Simone è una persona proattiva, organizzata e orientata al raggiungimento degli obiettivi. Dimostra una spiccata capacità di apprendimento, affrontando con interesse temi tecnici, informatici e gestionali. Si distingue per un approccio analitico alla risoluzione dei problemi e per la predisposizione a ricercare soluzioni efficaci e strutturate. Nel corso delle proprie esperienze ha sviluppato competenze nell'organizzazione di progetti, nella gestione di attività collaborative e nell'utilizzo di strumenti digitali, affiancando creatività e attenzione ai dettagli. È in grado di adattarsi a contesti differenti, lavorando con costanza e senso di responsabilità. Le sue principali aree di interesse comprendono la tecnologia, l'informatica, la comunicazione digitale e lo sviluppo di progetti creativi, ambiti nei quali dimostra iniziativa, autonomia e una forte motivazione alla crescita personale e professionale."
    }
  ];

  const services = [
    {
      title: "Soccorso in Emergenza",
      description: "Interventi tempestivi in codice rosso, giallo e verde su tutto il territorio cittadino di Los Santos. Gestione di traumi, tso e primo soccorso 24/7.",
      icon: HeartPulse,
      accent: "from-red-500/20 to-rose-600/10",
      iconColor: "text-red-400",
      borderColor: "border-red-500/20 hover:border-red-500/40"
    },
    {
      title: "Formazione del Personale",
      description: "Corsi teorici e pratici di primo soccorso BLSD, lezioni di traumatologia, esami di abilitazione ai gradi superiori e tutoraggio per tirocinanti e paramedici.",
      icon: GraduationCap,
      accent: "from-indigo-500/20 to-purple-600/10",
      iconColor: "text-indigo-400",
      borderColor: "border-indigo-500/20 hover:border-indigo-500/40"
    },
    {
      title: "Gestione Gerarchica dei Ruoli",
      description: "Organizzazione trasparente della catena di comando, con nomine meritorie, promozioni periodiche e valutazione continua dei medici attraverso votazioni certificate.",
      icon: Users,
      accent: "from-purple-500/20 to-violet-600/10",
      iconColor: "text-purple-400",
      borderColor: "border-purple-500/20 hover:border-purple-500/40"
    },
    {
      title: "Collaborazione con Organizzazioni",
      description: "Sinergia strategica con LSPD, BCSO, FBI e Governo per garantire la sicurezza collettiva e la gestione delle grandi emergenze RP.",
      icon: Handshake,
      accent: "from-blue-500/20 to-cyan-600/10",
      iconColor: "text-cyan-400",
      borderColor: "border-cyan-500/20 hover:border-cyan-500/40"
    }
  ];

  return (
    <div className="min-h-screen bg-[#0a0a0f] text-slate-200 antialiased selection:bg-red-500 selection:text-white w-full max-w-full overflow-x-hidden">
      {/* Toast Notification */}
      {copiedHandle && (
        <motion.div
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: 20 }}
          className="fixed bottom-6 left-1/2 -translate-x-1/2 sm:left-auto sm:right-6 sm:translate-x-0 z-50 max-w-[calc(100vw-2rem)] bg-indigo-600 text-white px-4 py-3 rounded-xl shadow-2xl border border-indigo-400/30 flex items-center gap-3 text-xs font-bold"
        >
          <CheckCircle2 size={18} className="text-emerald-300 shrink-0" />
          <span>Username Discord ({copiedHandle}) copiato negli appunti!</span>
        </motion.div>
      )}

      {/* Hero Section */}
      <section className="relative pt-24 sm:pt-20 md:pt-16 pb-16 sm:pb-20 px-4 sm:px-6 overflow-hidden border-b border-slate-800/60">
        {/* Top Left GIF Link to emerals.it */}
        <div className="absolute top-3 left-3 sm:top-6 sm:left-8 z-30">
          <motion.a
            href="https://emerals.it/"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, scale: 0.8 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.1 }}
            whileTap={{ scale: 0.95 }}
            className="block cursor-pointer transition-transform group"
            title="Visita il sito ufficiale Emerals RP (emerals.it)"
          >
            <img 
              src={emeralsGif} 
              alt="Emerals RP" 
              className="w-12 h-12 sm:w-20 sm:h-20 md:w-24 md:h-24 object-contain drop-shadow-[0_0_20px_rgba(16,185,129,0.5)] group-hover:drop-shadow-[0_0_30px_rgba(52,211,153,0.8)] transition-all duration-300"
            />
          </motion.a>
        </div>

        {/* Glow ambient backgrounds */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[600px] h-[350px] bg-gradient-to-tr from-red-600/15 via-indigo-600/15 to-purple-600/10 blur-[130px] rounded-full pointer-events-none" />
        <div className="absolute top-10 right-10 w-72 h-72 bg-red-600/10 blur-[100px] pointer-events-none" />

        <div className="max-w-5xl mx-auto relative z-10 text-center space-y-8">
          {/* Status Badge */}
          <motion.a
            href="https://emerals.it/it"
            target="_blank"
            rel="noopener noreferrer"
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            whileHover={{ scale: 1.05 }}
            className="inline-flex items-center gap-2 sm:gap-2.5 px-3 sm:px-4 py-1.5 rounded-full bg-emerald-950/40 hover:bg-emerald-900/60 border border-emerald-500/30 hover:border-emerald-400/60 backdrop-blur-md cursor-pointer transition-all group max-w-full"
            title="Clicca per visitare il sito ufficiale di Emerals RP"
          >
            <span className="relative flex h-2.5 w-2.5 shrink-0">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-emerald-500"></span>
            </span>
            <span className="text-[10px] sm:text-xs font-bold uppercase tracking-wider text-emerald-300 group-hover:text-emerald-200 transition-colors text-center">
              Servizio Sanitario Operativo • Emerals RP 4.0 24/7
            </span>
          </motion.a>

          {/* Main Title & Tagline */}
          <div className="space-y-4">
            <h1 className="text-4xl md:text-6xl font-extrabold tracking-tight text-white leading-tight">
              EMS - <span className="bg-gradient-to-r from-red-500 via-rose-400 to-indigo-400 bg-clip-text text-transparent">Emergency Medical Services</span>
            </h1>
            <p className="text-base md:text-lg text-slate-300 max-w-3xl mx-auto font-normal leading-relaxed">
              Il dipartimento medico e paramedico ufficiale del server <span className="text-indigo-400 font-semibold">Emerals RP 4.0</span>.
              Gestiamo il soccorso sanitario d'emergenza, l'assistenza ospedaliera, la formazione dei medici e la sicurezza dei cittadini di Los Santos con massima serietà e professionalità nel Roleplay.
            </p>
          </div>

          {/* Call to action buttons */}
          <div className="flex flex-wrap items-center justify-center gap-4 pt-2">
            <button
              onClick={() => onNavigate("cda")}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-yellow-300 via-yellow-400 to-yellow-300 hover:from-yellow-200 hover:to-yellow-300 text-slate-950 font-black text-sm tracking-wide shadow-lg shadow-yellow-950/40 border border-yellow-200 flex items-center gap-2.5 cursor-pointer transition-all hover:scale-102 active:scale-98"
            >
              <Award size={18} className="text-slate-950" />
              <span>Sezione CDA</span>
              <ArrowRight size={16} className="text-slate-950" />
            </button>

            <button
              onClick={() => onNavigate("hierarchy")}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-amber-600 to-red-600 hover:from-amber-500 hover:to-red-500 text-white text-sm font-bold tracking-wide shadow-lg shadow-amber-950/60 border border-amber-400/30 flex items-center gap-2.5 cursor-pointer transition-all hover:scale-102 active:scale-98"
            >
              <Award size={18} />
              <span>Gerarchia EMS</span>
              <ArrowRight size={16} />
            </button>

            <button
              onClick={() => onNavigate("excel_gerarchia")}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-sm font-bold tracking-wide shadow-lg shadow-emerald-950/60 border border-emerald-400/30 flex items-center gap-2.5 cursor-pointer transition-all hover:scale-102 active:scale-98"
            >
              <FileSpreadsheet size={18} />
              <span>Excel Gerarchia</span>
              <ArrowRight size={16} />
            </button>

            <button
              onClick={() => onNavigate("candidatura")}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 text-white text-sm font-bold tracking-wide shadow-lg shadow-blue-950/60 border border-blue-400/30 flex items-center gap-2.5 cursor-pointer transition-all hover:scale-102 active:scale-98"
            >
              <FileText size={18} />
              <span>Invia Candidatura EMS</span>
              <ArrowRight size={16} />
            </button>

            <button
              onClick={() => onNavigate("voter")}
              className="px-6 py-3.5 rounded-xl bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-500 hover:to-purple-500 text-white text-sm font-bold tracking-wide shadow-lg shadow-indigo-950/60 border border-indigo-400/30 flex items-center gap-2.5 cursor-pointer transition-all hover:scale-102 active:scale-98"
            >
              <Vote size={18} />
              <span>Accedi al Portale Elettore</span>
            </button>

            <button
              onClick={() => setActiveModal("discord")}
              className="px-5 py-3.5 rounded-xl bg-[#5865F2]/20 hover:bg-[#5865F2]/30 text-[#7983f5] hover:text-white text-sm font-bold tracking-wide border border-[#5865F2]/40 flex items-center gap-2 cursor-pointer transition-all hover:scale-102 active:scale-98"
            >
              <MessageSquare size={18} />
              <span>Discord Emerals RP 4.0</span>
            </button>
          </div>

          {/* Quick Metrics Bar */}
          <div className="pt-8 grid grid-cols-2 md:grid-cols-4 gap-4 max-w-4xl mx-auto">
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-xs">
              <div className="text-2xl font-black text-red-400">24/7</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Pronto Soccorso Attivo</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-xs">
              <div className="text-2xl font-black text-indigo-400">18 Gradi</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Gerarchia Strutturata</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-xs">
              <div className="text-2xl font-black text-purple-400">355</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Civico EMS</div>
            </div>
            <div className="p-4 rounded-xl bg-slate-900/40 border border-slate-800/80 backdrop-blur-xs">
              <div className="text-2xl font-black text-emerald-400">BLSD</div>
              <div className="text-xs text-slate-400 font-medium mt-1">Formazione Continua</div>
            </div>
          </div>
        </div>
      </section>

      {/* Chi Siamo Section */}
      <section className="py-16 px-6 relative border-b border-slate-800/60 bg-[#0d0d14]/60">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/20 text-red-400 text-xs font-bold uppercase tracking-wider">
              <Stethoscope size={14} /> La Nostra Identità
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">
              Chi Siamo
            </h2>
            <p className="text-slate-400 text-sm md:text-base max-w-2xl mx-auto">
              Missione, valori e principi guida del corpo sanitario di Emerals RP 4.0.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-8 items-center">
            {/* Description Card */}
            <div className="p-6 md:p-8 rounded-2xl bg-slate-900/60 border border-slate-800 space-y-4 shadow-xl">
              <h3 className="text-xl font-bold text-white flex items-center gap-2.5">
                <ShieldCheck className="text-indigo-400 shrink-0" size={22} />
                Eccellenza Medica e Serietà Roleplay
              </h3>
              <p className="text-slate-300 text-sm leading-relaxed">
                Il dipartimento <strong className="text-white">EMS (Emergency Medical Services)</strong> nasce con l'obiettivo di offrire un'esperienza di soccorso sanitario realistica, organizzata e gratificante per tutti i player del server <strong className="text-indigo-300">Emerals RP 4.0</strong>.
              </p>
              <p className="text-slate-300 text-sm leading-relaxed">
                Operiamo secondo rigidi protocolli di ingaggio, rispetto della gerarchia ospedaliera e formazione costante per medici e paramedici. Ogni intervento in strada o in corsia rappresenta un'opportunità di roleplay di altissimo livello.
              </p>
              
              <div className="pt-2 grid grid-cols-2 gap-3 text-xs font-medium text-slate-300">
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>Protocolli BLSD & Trauma</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>Esami e Abilitazioni</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>Turnazioni Garantite</span>
                </div>
                <div className="flex items-center gap-2">
                  <CheckCircle2 size={16} className="text-emerald-400 shrink-0" />
                  <span>Votazioni Trasparenti</span>
                </div>
              </div>
            </div>

            {/* Core Values Grid */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-all space-y-2">
                <div className="w-10 h-10 rounded-lg bg-red-500/10 border border-red-500/20 flex items-center justify-center text-red-400">
                  <Activity size={20} />
                </div>
                <h4 className="font-bold text-white text-sm">Professionalità</h4>
                <p className="text-xs text-slate-400 leading-normal">
                  Standard elevati di comportamento e competenza in tutte le fasi dell'intervento.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-all space-y-2">
                <div className="w-10 h-10 rounded-lg bg-indigo-500/10 border border-indigo-500/20 flex items-center justify-center text-indigo-400">
                  <Award size={20} />
                </div>
                <h4 className="font-bold text-white text-sm">Gerarchia Chiara</h4>
                <p className="text-xs text-slate-400 leading-normal">
                  Catena di comando definita per garantire ordine e supporto a tutti i gradi.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-all space-y-2">
                <div className="w-10 h-10 rounded-lg bg-purple-500/10 border border-purple-500/20 flex items-center justify-center text-purple-400">
                  <BookOpen size={20} />
                </div>
                <h4 className="font-bold text-white text-sm">Formazione</h4>
                <p className="text-xs text-slate-400 leading-normal">
                  Addestramento costante dei tirocinanti per farli crescere all'interno della struttura.
                </p>
              </div>

              <div className="p-5 rounded-xl bg-slate-900/40 border border-slate-800 hover:border-slate-700 transition-all space-y-2">
                <div className="w-10 h-10 rounded-lg bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-center text-emerald-400">
                  <Users size={20} />
                </div>
                <h4 className="font-bold text-white text-sm">Spirito di Gruppo</h4>
                <p className="text-xs text-slate-400 leading-normal">
                  Ambiente inclusivo e di rispetto tra colleghi per rendere il roleplay piacevole.
                </p>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Fondatori Section */}
      <section className="py-16 px-6 relative border-b border-slate-800/60">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-amber-500/10 border border-amber-500/20 text-amber-400 text-xs font-bold uppercase tracking-wider">
              <Crown size={14} /> Leadership & Proprietà
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">
              I Fondatori
            </h2>
            <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto">
              I responsabili principali della gestione, direzione e crescita dell'ospedale EMS di Emerals RP 4.0.
            </p>
          </div>

          {/* Founders Grid */}
          <div className="grid md:grid-cols-3 gap-6">
            {founders.map((founder, idx) => (
              <motion.div
                key={founder.name}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: idx * 0.1 }}
                className={`p-6 rounded-2xl bg-slate-900/70 border border-slate-800 shadow-xl transition-all relative flex flex-col justify-between ${founder.glow}`}
              >
                <div className="space-y-4">
                  {/* Top Badge & Header Link */}
                  <div className="flex items-center justify-between">
                    <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-1 rounded-full border ${founder.badgeClass} flex items-center gap-1`}>
                      <Crown size={12} className={founder.isOwner ? "text-amber-400" : "text-slate-300"} />
                      {founder.role}
                    </span>
                    <button
                      onClick={() => setSelectedFounder(founder)}
                      className="text-[11px] font-bold text-indigo-300 hover:text-white flex items-center gap-1 cursor-pointer bg-indigo-950/60 hover:bg-indigo-900/80 px-2.5 py-1 rounded-lg border border-indigo-500/30 transition-all shadow-sm"
                      title="Apri scheda dettagliata"
                    >
                      <span>Scheda</span>
                      <ChevronRight size={13} />
                    </button>
                  </div>

                  {/* Avatar & Name - Clickable */}
                  <div 
                    onClick={() => setSelectedFounder(founder)}
                    className="flex flex-col items-center text-center pt-2 space-y-3 cursor-pointer group"
                  >
                    <div className="relative">
                      <img
                        src={founder.avatarUrl}
                        alt={founder.name}
                        referrerPolicy="no-referrer"
                        className={`w-20 h-20 sm:w-24 sm:h-24 rounded-full object-cover border-2 ${founder.avatarBorder} shadow-lg shrink-0 transition-transform duration-300 group-hover:scale-105`}
                      />
                      {founder.isOwner ? (
                        <div className="absolute -bottom-1 -right-1 bg-amber-500 text-black rounded-full p-1 border-2 border-slate-900 shadow-md" title="Proprietario">
                          <Crown size={13} className="fill-current" />
                        </div>
                      ) : (
                        <div className="absolute -bottom-1 -right-1 bg-slate-400 text-slate-950 rounded-full p-1 border-2 border-slate-900 shadow-md" title="Vice Proprietario">
                          <Crown size={13} className="fill-current" />
                        </div>
                      )}
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white group-hover:text-amber-300 transition-colors flex items-center justify-center gap-1">
                        <span>{founder.name}</span>
                      </h3>
                      <div className="inline-flex items-center gap-1.5 text-xs text-indigo-300 font-mono mt-1 bg-indigo-950/40 px-2.5 py-1 rounded-md border border-indigo-500/20">
                        <svg className="w-3.5 h-3.5 text-[#5865F2] fill-current" viewBox="0 0 24 24">
                          <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
                        </svg>
                        <span>{founder.discord}</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Actions */}
                <div className="pt-5 mt-4 border-t border-slate-800 space-y-2">
                  <button
                    onClick={() => setSelectedFounder(founder)}
                    className="w-full py-2.5 px-3 rounded-xl bg-indigo-600/20 hover:bg-indigo-600/35 text-indigo-200 hover:text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border border-indigo-500/35 shadow-sm"
                  >
                    <Briefcase size={14} className="text-indigo-400" />
                    <span>Vedi Scheda & Esperienze</span>
                  </button>

                  <button
                    onClick={() => copyToClipboard(founder.rawHandle, founder.rawHandle)}
                    className="w-full py-2 px-3 rounded-xl bg-slate-800/80 hover:bg-slate-700 text-white text-xs font-bold transition-all flex items-center justify-center gap-2 cursor-pointer border border-slate-700/60"
                  >
                    {copiedHandle === founder.rawHandle ? (
                      <>
                        <Check size={14} className="text-emerald-400" />
                        <span>Copiato negli appunti!</span>
                      </>
                    ) : (
                      <>
                        <Copy size={14} className="text-slate-400" />
                        <span>Copia Username Discord</span>
                      </>
                    )}
                  </button>
                </div>
              </motion.div>
            ))}
          </div>
        </div>
      </section>

      {/* Cosa Facciamo Section */}
      <section className="py-16 px-6 relative border-b border-slate-800/60 bg-[#0d0d14]/60">
        <div className="max-w-5xl mx-auto space-y-10">
          <div className="text-center space-y-3">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-indigo-500/10 border border-indigo-500/20 text-indigo-400 text-xs font-bold uppercase tracking-wider">
              <Siren size={14} /> Attività e Servizi
            </div>
            <h2 className="text-3xl md:text-4xl font-extrabold text-white">
              Cosa Facciamo
            </h2>
            <p className="text-slate-400 text-sm md:text-base max-w-xl mx-auto">
              I quattro pilastri operativi che guidano le attività quotidiane dell'ospedale EMS.
            </p>
          </div>

          <div className="grid md:grid-cols-2 gap-6">
            {services.map((service, idx) => {
              const IconComp = service.icon;
              return (
                <motion.div
                  key={service.title}
                  initial={{ opacity: 0, y: 15 }}
                  animate={{ opacity: 1, y: 0 }}
                  transition={{ delay: idx * 0.08 }}
                  className={`p-6 rounded-2xl bg-slate-900/60 border ${service.borderColor} shadow-lg transition-all space-y-4`}
                >
                  <div className="flex items-center gap-4">
                    <div className={`w-12 h-12 rounded-xl bg-gradient-to-br ${service.accent} border border-white/10 flex items-center justify-center ${service.iconColor} shrink-0`}>
                      <IconComp size={24} />
                    </div>
                    <div>
                      <h3 className="text-lg font-bold text-white">{service.title}</h3>
                      <span className="text-[10px] text-slate-500 font-bold uppercase tracking-wider">Emerals RP 4.0 EMS</span>
                    </div>
                  </div>
                  <p className="text-slate-300 text-xs md:text-sm leading-relaxed">
                    {service.description}
                  </p>
                </motion.div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="bg-[#07070a] border-t border-slate-800/80 py-12 px-6 text-slate-400 text-xs">
        <div className="max-w-5xl mx-auto space-y-8">
          <div className="flex flex-col md:flex-row justify-between items-center gap-6 pb-8 border-b border-slate-800/60">
            {/* Left side brand */}
            <div className="flex items-center gap-3">
              <img 
                src={emsLogo} 
                alt="EMS Logo" 
                className="w-10 h-10 rounded-xl object-cover border-2 border-slate-700/80 shadow-md shadow-red-950/30 shrink-0" 
              />
              <div>
                <span className="block text-sm font-bold text-white tracking-wide">
                  EMS - Emergency Medical Services
                </span>
                <span className="block text-[10px] text-red-500 font-bold uppercase tracking-wider">
                  Soccorso Sanitario • Emerals RP 4.0
                </span>
              </div>
            </div>

            {/* Quick footer links */}
            <div className="flex flex-wrap justify-center gap-6 font-medium text-slate-300">
              <button 
                onClick={() => setActiveModal("discord")}
                className="hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <MessageSquare size={14} className="text-[#5865F2]" /> Server Discord
              </button>
              <button 
                onClick={() => setActiveModal("regolamento")}
                className="hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <FileText size={14} className="text-indigo-400" /> Regolamento Interno
              </button>
              <button 
                onClick={() => setActiveModal("contatti")}
                className="hover:text-white transition-colors cursor-pointer flex items-center gap-1.5"
              >
                <Phone size={14} className="text-emerald-400" /> Contatti
              </button>
            </div>
          </div>

          <div className="flex flex-col md:flex-row justify-between items-center gap-4 text-center md:text-left text-slate-500 text-[11px]">
            <div className="flex items-center gap-2 flex-wrap">
              <span>© 2026 Emergency Medical Services (EMS) — Emerals RP 4.0.</span>
              <button
                type="button"
                onClick={() => copyToClipboard("simorizzo.scout@gmail.com", "email_simone")}
                className="text-emerald-400 hover:text-emerald-300 font-bold underline cursor-pointer transition-colors"
                title="Clicca per copiare l'email: simorizzo.scout@gmail.com"
              >
                Tutti i diritti sono riservati a Simone Rizzus
              </button>
              {copiedHandle === "email_simone" && (
                <span className="text-[10px] bg-emerald-500/20 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-md font-extrabold animate-pulse">
                  Email copiata: simorizzo.scout@gmail.com!
                </span>
              )}
            </div>
            <p className="max-w-md text-[10px] text-slate-500 tracking-wider uppercase font-bold">
              PORTALE UFFICIALE EMS - UTILIZZATO DALLO STAFF DELL'OSPEDALE PER FUNZIONI AMMINISTRATIVE
            </p>
          </div>
        </div>
      </footer>

      {/* Modals for Regolamento, Contatti, Discord */}
      {activeModal && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#111116] border border-slate-800 rounded-2xl max-w-2xl w-full p-6 space-y-5 shadow-2xl relative max-h-[85vh] flex flex-col"
          >
            <button
              onClick={() => setActiveModal(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer z-10"
            >
              ✕
            </button>

            {activeModal === "regolamento" && (
              <div className="space-y-4 flex flex-col min-h-0">
                <div className="flex items-center gap-2.5 text-indigo-400 font-bold text-lg border-b border-slate-800 pb-3 shrink-0">
                  <FileText size={20} />
                  <span>Regolamento Interno EMS - Emerals RP 4.0</span>
                </div>
                <div className="text-xs md:text-sm text-slate-300 space-y-4 overflow-y-auto pr-2 custom-scrollbar flex-1 leading-relaxed">
                  <p>
                    <strong>1.</strong> L'EMS è una <strong className="text-white">Fazione Neutrale</strong>: non dovrà favorire nessuno e non dovrà interferire nelle azioni in corso (Ex: curare nel corso di una sparatoria);
                  </p>

                  <p>
                    <strong>2.</strong> Un medico <strong className="text-white">IN SERVIZIO</strong> non può in nessun caso effettuare o prendere parte ad un'azione illegale (Ex: rapire una persona);
                  </p>

                  <p>
                    <strong>3.</strong> Un medico <strong className="text-white">FUORI SERVIZIO</strong> può effettuare azioni legali/illegali ma non può appartenere a nessuna mafia/gang (Pena -&gt; Licenziamento);
                  </p>

                  <p>
                    <strong>4.</strong> Qualsiasi medico (dal Tirocinante al Direttore Generale) <strong className="text-white">IN SERVIZIO</strong> non potrà detenere <strong className="text-white">armi da fuoco</strong>, (Pena -&gt; LAST CHANCE 5d e revoca dell'arma da fuoco);
                  </p>

                  <p>
                    <strong>5.</strong> Il <strong className="text-white">taser</strong> si potrà utilizzare solo dal grado di <strong className="text-white">Medico</strong> in su, se verrà utilizzato da un grado più basso la punizione sarà il warn interno;
                  </p>

                  <p>
                    <strong>6.</strong> Ciascun medico, se <strong className="text-white">IN SERVIZIO</strong>, ha l'obbligo di indossare la propria divisa del rispettivo grado (Pena -&gt; Warn Interno);
                  </p>

                  <div className="space-y-1">
                    <p>
                      <strong>7.</strong> I medici possono vendere sia medikit che bende (non c'è un minimo/un massimo).
                    </p>
                    <ul className="list-disc list-inside pl-3 space-y-0.5 text-slate-400">
                      <li>Il n° massimo di medikit trasportabili è di 10 (15 se si indossa il borsone);</li>
                      <li>Il n° massimo di bende trasportabili è di 10 (15 se si indossa il borsone);</li>
                    </ul>
                  </div>

                  <div className="space-y-1">
                    <p>
                      <strong>8.</strong> Un medico non può farsi corrompere in nessun caso, vediamo di seguito degli esempi:
                    </p>
                    <ul className="list-disc list-inside pl-3 space-y-1 text-slate-400">
                      <li>Curando gratuitamente (eccetto FDO in servizio) o in nero (tramite IBAN);</li>
                      <li>Rianimando gratuitamente (eccetto FDO in servizio) o in nero;</li>
                      <li>Vendendo medikit e bende in nero o regalandoli;</li>
                      <li>Non emettendo fatture per i documenti (PDA, Permessi Maschera Parziale ecc...);</li>
                    </ul>
                    <p className="text-red-400 font-semibold text-xs pt-1">
                      (Pena -&gt; Last Chance o Licenziamento)
                    </p>
                  </div>

                  <div className="space-y-1">
                    <p>
                      <strong>9.</strong> Un medico, <strong className="text-white">IN SERVIZIO</strong>, non può:
                    </p>
                    <ul className="list-disc list-inside pl-3 space-y-0.5 text-slate-400">
                      <li>Essere offeso;</li>
                      <li>Essere picchiato;</li>
                      <li>Essere ucciso;</li>
                      <li>Essere lootato;</li>
                    </ul>
                    <p className="italic text-indigo-300 text-xs pt-1">
                      (In caso di una di queste opzioni l'EMS può rifiutarsi di servire/aiutare quella persona ed ha il diritto di recarsi in Assistenza munita di clip con GoPro accesa)
                    </p>
                  </div>

                  <p>
                    <strong>10.</strong> Un cittadino <strong className="text-white">NON</strong> può rifiutarsi di ricevere ulteriori controlli se un medico lo ritiene necessario;
                  </p>

                  <p>
                    <strong>11.</strong> Ogni dipendente se finirà sotto processo o in cause legali sarà indipendente e <strong className="text-white">l'azienda EMS</strong> si allontana da ogni responsabilità;
                  </p>
                </div>
              </div>
            )}

            {activeModal === "contatti" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 text-emerald-400 font-bold text-lg border-b border-slate-800 pb-3">
                  <Phone size={20} />
                  <span>Contatti Dipartimento EMS</span>
                </div>
                <div className="text-xs text-slate-300 space-y-3">
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800">
                    <span className="text-slate-400 block text-[10px] uppercase font-bold">Centrale Operativa FiveM</span>
                    <span className="font-mono text-emerald-400 font-bold text-sm">Radio 2 (In-Game)</span>
                  </div>
                  <div className="p-3 bg-slate-900 rounded-lg border border-slate-800 flex items-center justify-between">
                    <div>
                      <span className="text-slate-400 block text-[10px] uppercase font-bold">Assistenza e Reclutamenti Discord</span>
                      <span className="text-indigo-300 font-bold text-xs">Canale #ticket-ems sul discord EMS </span>
                    </div>
                    <a
                      href="https://discord.com/channels/986344988482875412/1357780617219145919"
                      target="_blank"
                      rel="noopener noreferrer"
                      className="px-3 py-1.5 bg-[#5865F2] hover:bg-[#4752C4] text-white text-xs font-bold rounded-lg flex items-center gap-1 transition-colors shrink-0"
                    >
                      <span>Entra</span>
                      <ExternalLink size={12} />
                    </a>
                  </div>
                </div>
              </div>
            )}

            {activeModal === "discord" && (
              <div className="space-y-4">
                <div className="flex items-center gap-2.5 text-[#7983f5] font-bold text-lg border-b border-slate-800 pb-3">
                  <MessageSquare size={20} />
                  <span>Seleziona Server Discord</span>
                </div>
                <p className="text-xs text-slate-300 leading-relaxed">
                  Scegli a quale server Discord desideri accedere:
                </p>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                  {/* Option 1: EMS Discord */}
                  <a
                    href="https://discord.gg/8aZKXMj5gE"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-4 bg-[#5865F2]/15 hover:bg-[#5865F2]/25 border border-[#5865F2]/40 rounded-xl flex flex-col justify-between gap-3 group transition-all hover:scale-[1.02] cursor-pointer shadow-lg shadow-[#5865F2]/10"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-red-400">Dipartimento</span>
                        <ExternalLink size={14} className="text-[#7983f5] group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </div>
                      <h4 className="text-sm font-extrabold text-white group-hover:text-[#7983f5] transition-colors">
                        Discord Ufficiale EMS
                      </h4>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        Candidature, ticket assistenza, bandi e comunicazioni interne del corpo sanitario.
                      </p>
                    </div>
                    <div className="text-[11px] font-mono text-indigo-300 font-bold bg-slate-900/80 px-2.5 py-1 rounded border border-slate-800 self-start">
                      discord.gg/8aZKXMj5gE
                    </div>
                  </a>

                  {/* Option 2: General Emerals RP Discord */}
                  <a
                    href="https://discord.gg/emerals"
                    target="_blank"
                    rel="noopener noreferrer"
                    className="p-4 bg-slate-900/90 hover:bg-slate-800/90 border border-slate-700/80 hover:border-indigo-500/50 rounded-xl flex flex-col justify-between gap-3 group transition-all hover:scale-[1.02] cursor-pointer shadow-lg"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold uppercase tracking-wider text-indigo-400">Main Community</span>
                        <ExternalLink size={14} className="text-indigo-400 group-hover:translate-x-0.5 group-hover:-translate-y-0.5 transition-transform" />
                      </div>
                      <h4 className="text-sm font-extrabold text-white group-hover:text-indigo-300 transition-colors">
                        Discord Generale Emerals RP
                      </h4>
                      <p className="text-[11px] text-slate-300 leading-snug">
                        Server principale di Emerals RP 4.0 per regolamento generale, news e supporto FiveM.
                      </p>
                    </div>
                    <div className="text-[11px] font-mono text-indigo-300 font-bold bg-slate-950 px-2.5 py-1 rounded border border-slate-800 self-start">
                      discord.gg/emerals
                    </div>
                  </a>
                </div>

                <div className="p-3 bg-slate-900/60 border border-slate-800 rounded-xl space-y-1.5 text-center">
                  <span className="text-[11px] text-indigo-200 block font-semibold">Username Dirigenza EMS su Discord:</span>
                  <div className="flex flex-wrap justify-center gap-2 font-mono text-xs text-white">
                    <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700">@anto.romano</span>
                    <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700">@smokafps</span>
                    <span className="bg-slate-900 px-2 py-0.5 rounded border border-slate-700">@simolmao</span>
                  </div>
                </div>
              </div>
            )}

            <div className="pt-2 flex justify-end">
              <button
                onClick={() => setActiveModal(null)}
                className="px-4 py-2 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold cursor-pointer"
              >
                Chiudi
              </button>
            </div>
          </motion.div>
        </div>
      )}

      {/* Modal for Selected Founder Details */}
      {selectedFounder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="bg-[#111118] border border-slate-800 rounded-2xl max-w-lg w-full p-6 shadow-2xl relative space-y-5 max-h-[90vh] flex flex-col"
          >
            <button
              onClick={() => setSelectedFounder(null)}
              className="absolute top-4 right-4 text-slate-400 hover:text-white text-lg font-bold p-1 cursor-pointer z-10 transition-colors"
            >
              ✕
            </button>

            {/* Profile Header */}
            <div className="flex items-center gap-4 border-b border-slate-800 pb-4 shrink-0">
              <div className="relative shrink-0">
                <img
                  src={selectedFounder.avatarUrl}
                  alt={selectedFounder.name}
                  className={`w-16 h-16 sm:w-20 sm:h-20 rounded-full object-cover border-2 ${selectedFounder.avatarBorder}`}
                />
                <div className={`absolute -bottom-1 -right-1 ${selectedFounder.isOwner ? 'bg-amber-500 text-black' : 'bg-slate-400 text-black'} rounded-full p-1 border-2 border-slate-900 shadow-md`}>
                  <Crown size={12} className="fill-current" />
                </div>
              </div>

              <div className="space-y-1 min-w-0">
                <span className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${selectedFounder.badgeClass} inline-flex items-center gap-1`}>
                  <Crown size={11} className={selectedFounder.isOwner ? "text-amber-400" : "text-slate-300"} />
                  {selectedFounder.role}
                </span>
                <h3 className="text-xl font-extrabold text-white truncate">{selectedFounder.name}</h3>
                <div className="flex items-center gap-2">
                  <span className="text-xs text-indigo-300 font-mono bg-indigo-950/60 px-2.5 py-1 rounded-md border border-indigo-500/30 inline-flex items-center gap-1.5">
                    <svg className="w-3.5 h-3.5 text-[#5865F2] fill-current" viewBox="0 0 24 24">
                      <path d="M20.317 4.37a19.791 19.791 0 0 0-4.885-1.515.074.074 0 0 0-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 0 0-5.487 0 12.64 12.64 0 0 0-.617-1.25.077.077 0 0 0-.079-.037A19.736 19.736 0 0 0 3.677 4.37a.07.07 0 0 0-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 0 0 .031.057 19.9 19.9 0 0 0 5.993 3.03.078.078 0 0 0 .084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 0 0-.041-.106 13.107 13.107 0 0 1-1.872-.892.077.077 0 0 1-.008-.128 10.2 10.2 0 0 0 .372-.292.074.074 0 0 1 .077-.01c3.928 1.793 8.18 1.793 12.061 0a.074.074 0 0 1 .078.01c.12.098.246.198.373.292a.077.077 0 0 1-.006.127 12.299 12.299 0 0 1-1.873.892.077.077 0 0 0-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 0 0 .084.028 19.839 19.839 0 0 0 6.002-3.03.077.077 0 0 0 .032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 0 0-.031-.028z" />
                    </svg>
                    {selectedFounder.discord}
                  </span>
                </div>
              </div>
            </div>

            {/* Scrollable Modal Content */}
            <div className="space-y-5 overflow-y-auto pr-1 custom-scrollbar flex-1 text-xs md:text-sm">
              {/* Section 1: Previous Jobs */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-amber-400 font-bold text-xs uppercase tracking-wider">
                  <Briefcase size={15} />
                  <span>Lavori Svolti in Precedenza</span>
                </div>
                <div className="bg-slate-900/90 border border-slate-800 rounded-xl p-3.5 divide-y divide-slate-800/70 shadow-sm">
                  {selectedFounder.pastJobs.map((job, idx) => (
                    <div 
                      key={idx}
                      className={`flex items-start gap-2.5 text-slate-200 ${idx === 0 ? "pb-2.5" : idx === selectedFounder.pastJobs.length - 1 ? "pt-2.5" : "py-2.5"}`}
                    >
                      <CheckCircle2 size={16} className="text-emerald-400 shrink-0 mt-0.5" />
                      <span className="leading-snug">{job}</span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Section 2: Personal Description */}
              <div className="space-y-2.5">
                <div className="flex items-center gap-2 text-indigo-400 font-bold text-xs uppercase tracking-wider">
                  <Quote size={15} />
                  <span>Descrizione Personale</span>
                </div>
                <div className="p-4 bg-indigo-950/30 border border-indigo-500/20 rounded-xl relative italic text-indigo-100 leading-relaxed">
                  <p className="relative z-10 text-xs md:text-sm">
                    "{selectedFounder.personalDescription}"
                  </p>
                </div>
              </div>
            </div>

            {/* Modal Footer Actions */}
            <div className="pt-3 border-t border-slate-800 flex items-center justify-between gap-3 shrink-0">
              <button
                onClick={() => copyToClipboard(selectedFounder.rawHandle, selectedFounder.rawHandle)}
                className="py-2 px-3 bg-slate-800 hover:bg-slate-700 text-white rounded-lg text-xs font-bold transition-all flex items-center gap-2 cursor-pointer border border-slate-700"
              >
                {copiedHandle === selectedFounder.rawHandle ? (
                  <>
                    <Check size={14} className="text-emerald-400" />
                    <span>Username Copiato!</span>
                  </>
                ) : (
                  <>
                    <Copy size={14} className="text-slate-400" />
                    <span>Copia Discord</span>
                  </>
                )}
              </button>

              <button
                onClick={() => setSelectedFounder(null)}
                className="px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-xs font-bold cursor-pointer transition-colors"
              >
                Chiudi Scheda
              </button>
            </div>
          </motion.div>
        </div>
      )}
    </div>
  );
}
