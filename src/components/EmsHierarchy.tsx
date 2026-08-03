import React, { useState, useEffect } from "react";
import {
  Crown,
  Building2,
  ShieldCheck,
  Award,
  Star,
  Gem,
  Shirt,
  Users,
  Search,
  Plus,
  Edit3,
  Trash2,
  RefreshCw,
  X,
  Check,
  Info,
  Sparkles,
  ChevronDown,
  UserCheck,
} from "lucide-react";
import {
  HierarchyCategoryKey,
  HierarchyMember,
  HIERARCHY_CATEGORIES,
  HierarchyCategoryConfig,
} from "../types.js";

interface RoleStyle {
  badgeBg: string;
  text: string;
  border: string;
  avatarBg: string;
  avatarText: string;
  iconColor: string;
  symbol: "star" | "cross" | "crown" | "crown-vice" | "gem";
}

function getRoleStyle(roleName: string): RoleStyle {
  const name = roleName.toLowerCase().trim();

  if (name.includes("proprietario")) {
    if (name.includes("vice") || name.includes("v.")) {
      return {
        badgeBg: "bg-slate-950/90 border-[#b89bf3]/50 font-extrabold shadow-sm shadow-indigo-950/30",
        text: "bg-gradient-to-r from-[#8fb3f5] via-[#b89bf3] to-[#f28fbe] bg-clip-text text-transparent font-black",
        border: "border-[#b89bf3]/60",
        avatarBg: "bg-slate-950 border-[#b89bf3]/60",
        avatarText: "bg-gradient-to-r from-[#8fb3f5] via-[#b89bf3] to-[#f28fbe] bg-clip-text text-transparent font-black",
        iconColor: "",
        symbol: "crown-vice",
      };
    }
    return {
      badgeBg: "bg-slate-900/90 text-white border-slate-200/80 font-black",
      text: "text-white font-black",
      border: "border-slate-200/70",
      avatarBg: "bg-slate-900 border-slate-200/80",
      avatarText: "text-white",
      iconColor: "text-slate-100",
      symbol: "crown",
    };
  }

  if (name.includes("cda") || name.includes("c.d.a.") || name.includes("consiglio di amministrazione")) {
    return {
      badgeBg: "bg-gradient-to-r from-amber-500/30 via-yellow-400/40 to-amber-500/30 text-yellow-300 border-yellow-400/90 font-black shadow-md shadow-amber-950/60",
      text: "text-yellow-300 font-black",
      border: "border-yellow-400/80",
      avatarBg: "bg-amber-950 border-yellow-400/80",
      avatarText: "text-yellow-300 font-black",
      iconColor: "text-yellow-300",
      symbol: "crown",
    };
  }

  if (name.includes("direttore generale")) {
    return {
      badgeBg: "bg-cyan-500/20 text-cyan-300 border-cyan-500/40",
      text: "text-cyan-300",
      border: "border-cyan-500/40",
      avatarBg: "bg-cyan-950/80 border-cyan-500/60",
      avatarText: "text-cyan-300",
      iconColor: "text-cyan-400",
      symbol: "gem",
    };
  }

  if (name.includes("direttore sanitario")) {
    if (name.includes("vice") || name.includes("v.")) {
      return {
        badgeBg: "bg-red-500/20 text-red-300 border-red-500/40",
        text: "text-red-300",
        border: "border-red-500/40",
        avatarBg: "bg-red-950/80 border-red-500/60",
        avatarText: "text-red-300",
        iconColor: "text-red-400",
        symbol: "crown",
      };
    }
    return {
      badgeBg: "bg-red-700/25 text-red-200 border-red-600/50 font-extrabold",
      text: "text-red-200",
      border: "border-red-600/50",
      avatarBg: "bg-red-900/90 border-red-500/70",
      avatarText: "text-red-200",
      iconColor: "text-red-300",
      symbol: "crown",
    };
  }

  if (name.includes("segretario")) {
    return {
      badgeBg: "bg-violet-700/20 text-violet-300 border-violet-600/40",
      text: "text-violet-300",
      border: "border-violet-600/40",
      avatarBg: "bg-violet-950/80 border-violet-600/60",
      avatarText: "text-violet-300",
      iconColor: "text-violet-400",
      symbol: "cross",
    };
  }

  if (name.includes("supervisore generale")) {
    return {
      badgeBg: "bg-purple-600/20 text-purple-300 border-purple-500/40",
      text: "text-purple-300",
      border: "border-purple-500/40",
      avatarBg: "bg-purple-950/80 border-purple-500/60",
      avatarText: "text-purple-300",
      iconColor: "text-purple-400",
      symbol: "cross",
    };
  }

  if (name.includes("supervisore")) {
    if (name.includes("assistente") || name.includes("aiuto")) {
      return {
        badgeBg: "bg-pink-400/20 text-pink-300 border-pink-400/40",
        text: "text-pink-300",
        border: "border-pink-400/40",
        avatarBg: "bg-pink-950/80 border-pink-400/50",
        avatarText: "text-pink-300",
        iconColor: "text-pink-400",
        symbol: "star",
      };
    }
    if (name.includes("vice") || name.includes("v.")) {
      return {
        badgeBg: "bg-pink-600/20 text-pink-300 border-pink-500/40",
        text: "text-pink-300",
        border: "border-pink-500/40",
        avatarBg: "bg-pink-950/80 border-pink-500/60",
        avatarText: "text-pink-300",
        iconColor: "text-pink-400",
        symbol: "star",
      };
    }
    return {
      badgeBg: "bg-rose-600/20 text-rose-300 border-rose-500/40",
      text: "text-rose-300",
      border: "border-rose-500/40",
      avatarBg: "bg-rose-950/80 border-rose-500/60",
      avatarText: "text-rose-300",
      iconColor: "text-rose-400",
      symbol: "star",
    };
  }

  if (name.includes("responsabile del presidio") || name.includes("responsabile presidio")) {
    if (name.includes("vice") || name.includes("v.")) {
      return {
        badgeBg: "bg-orange-400/20 text-orange-300 border-orange-400/40",
        text: "text-orange-300",
        border: "border-orange-400/40",
        avatarBg: "bg-orange-950/80 border-orange-400/50",
        avatarText: "text-orange-300",
        iconColor: "text-orange-400",
        symbol: "star",
      };
    }
    return {
      badgeBg: "bg-orange-600/20 text-orange-300 border-orange-500/40",
      text: "text-orange-300",
      border: "border-orange-500/40",
      avatarBg: "bg-orange-950/80 border-orange-500/60",
      avatarText: "text-orange-300",
      iconColor: "text-orange-400",
      symbol: "star",
    };
  }

  if (name.includes("primario")) {
    if (name.includes("vice") || name.includes("v.")) {
      return {
        badgeBg: "bg-amber-400/20 text-amber-300 border-amber-400/40",
        text: "text-amber-300",
        border: "border-amber-400/40",
        avatarBg: "bg-amber-950/80 border-amber-400/50",
        avatarText: "text-amber-300",
        iconColor: "text-amber-400",
        symbol: "star",
      };
    }
    return {
      badgeBg: "bg-amber-700/20 text-amber-200 border-amber-600/40",
      text: "text-amber-200",
      border: "border-amber-600/40",
      avatarBg: "bg-amber-950/80 border-amber-600/60",
      avatarText: "text-amber-200",
      iconColor: "text-amber-400",
      symbol: "star",
    };
  }

  return {
    badgeBg: "bg-slate-800 text-slate-200 border-slate-700",
    text: "text-slate-200",
    border: "border-slate-700",
    avatarBg: "bg-slate-900 border-slate-700",
    avatarText: "text-slate-300",
    iconColor: "text-slate-400",
    symbol: "star",
  };
}

function renderRoleSymbolIcon(symbol: "star" | "cross" | "crown" | "crown-vice" | "gem", className: string) {
  switch (symbol) {
    case "crown-vice":
      return (
        <Crown
          className={className}
          style={{ stroke: "url(#viceProprietarioGradient)" }}
        />
      );
    case "crown":
      return <Crown className={className} />;
    case "gem":
      return <Gem className={className} />;
    case "cross":
      return <Award className={className} />;
    case "star":
    default:
      return <Star className={className} />;
  }
}

interface EmsHierarchyProps {
  isAdmin?: boolean;
  adminToken?: string;
}

export default function EmsHierarchy({ isAdmin = false, adminToken }: EmsHierarchyProps) {
  const [members, setMembers] = useState<HierarchyMember[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [searchTerm, setSearchTerm] = useState("");
  const [selectedCategoryFilter, setSelectedCategoryFilter] = useState<string>("ALL");

  // Admin Modal states
  const [showModal, setShowModal] = useState(false);
  const [editingMember, setEditingMember] = useState<HierarchyMember | null>(null);
  const [formName, setFormName] = useState("");
  const [formRole, setFormRole] = useState("");
  const [formCategory, setFormCategory] = useState<HierarchyCategoryKey>("FUNZIONARI");
  const [formBadge, setFormBadge] = useState("");
  const [formDiscordTag, setFormDiscordTag] = useState("");
  const [formError, setFormError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Confirm delete and sync modal states
  const [memberToDelete, setMemberToDelete] = useState<{ id: string; name: string } | null>(null);
  const [showSyncConfirm, setShowSyncConfirm] = useState(false);

  const fetchHierarchy = async () => {
    try {
      setLoading(true);
      setError(null);
      const res = await fetch("/api/hierarchy");
      const data = await res.json();
      if (data.success) {
        setMembers(data.members || []);
      } else {
        setError(data.error || "Impossibile caricare la gerarchia.");
      }
    } catch (err) {
      setError("Errore di connessione al server.");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchHierarchy();
  }, []);

  const showNotification = (msg: string) => {
    setSuccessMsg(msg);
    setTimeout(() => setSuccessMsg(null), 4000);
  };

  const handleOpenAddModal = () => {
    setEditingMember(null);
    setFormName("");
    setFormRole("");
    setFormCategory("FUNZIONARI");
    setFormBadge("");
    setFormDiscordTag("");
    setFormError(null);
    setShowModal(true);
  };

  const handleOpenEditModal = (m: HierarchyMember) => {
    setEditingMember(m);
    setFormName(m.name);
    setFormRole(m.roleName);
    setFormCategory(m.categoryKey);
    setFormBadge(m.badge || "");
    setFormDiscordTag(m.discordTag || "");
    setFormError(null);
    setShowModal(true);
  };

  const handleSaveMember = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formName.trim()) {
      setFormError("Inserisci il Nome ed il Cognome.");
      return;
    }
    if (!formRole.trim()) {
      setFormError("Inserisci il Grado o Ruolo.");
      return;
    }

    try {
      setSaving(true);
      setFormError(null);

      const url = editingMember
        ? `/api/admin/hierarchy/${editingMember.id}`
        : "/api/admin/hierarchy";
      const method = editingMember ? "PUT" : "POST";

      const res = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${adminToken || localStorage.getItem("adminToken")}`,
        },
        body: JSON.stringify({
          name: formName.trim(),
          roleName: formRole.trim(),
          categoryKey: formCategory,
          badge: formBadge.trim(),
          discordTag: formDiscordTag.trim(),
        }),
      });

      const data = await res.json();
      if (data.success) {
        setShowModal(false);
        fetchHierarchy();
        showNotification(data.message || "Operazione completata con successo!");
      } else {
        setFormError(data.error || "Errore durante il salvataggio.");
      }
    } catch (err) {
      setFormError("Errore di rete durante il salvataggio.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmDeleteMember = async () => {
    if (!memberToDelete) return;

    try {
      setSaving(true);
      const res = await fetch(`/api/admin/hierarchy/${memberToDelete.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${adminToken || localStorage.getItem("adminToken")}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        setMembers((prev) => prev.filter((m) => m.id !== memberToDelete.id));
        showNotification(data.message || `Membro ${memberToDelete.name} rimosso.`);
        setMemberToDelete(null);
        fetchHierarchy();
      } else {
        alert(data.error || "Errore durante l'eliminazione.");
      }
    } catch (err) {
      alert("Errore di rete durante l'eliminazione.");
    } finally {
      setSaving(false);
    }
  };

  const handleConfirmSyncHierarchy = async () => {
    setShowSyncConfirm(false);
    try {
      setSyncing(true);
      const res = await fetch("/api/admin/hierarchy/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${adminToken || localStorage.getItem("adminToken")}`,
        },
      });
      const data = await res.json();
      if (data.success) {
        fetchHierarchy();
        showNotification(data.message || "Gerarchia risincronizzata con successo!");
      } else {
        alert(data.error || "Errore durante la sincronizzazione.");
      }
    } catch (err) {
      alert("Errore di rete durante la sincronizzazione.");
    } finally {
      setSyncing(false);
    }
  };

  // Category Icon Resolver
  const getCategoryIcon = (key: HierarchyCategoryKey) => {
    switch (key) {
      case "PROPRIETARI":
        return <Crown className="w-5 h-5 text-amber-400" />;
      case "DIRIGENZA_GENERALE":
        return <Building2 className="w-5 h-5 text-cyan-400" />;
      case "DIRIGENZA_SANITARIA":
        return <ShieldCheck className="w-5 h-5 text-red-400" />;
      case "SUPERVISIONE":
        return <Star className="w-5 h-5 text-purple-400" />;
      case "FUNZIONARI":
        return <Award className="w-5 h-5 text-orange-400" />;
      default:
        return <Users className="w-5 h-5 text-slate-400" />;
    }
  };

  // Filter members by search and category filter
  const filteredMembers = members.filter((m) => {
    const matchesSearch =
      m.name.toLowerCase().includes(searchTerm.toLowerCase()) ||
      m.roleName.toLowerCase().includes(searchTerm.toLowerCase()) ||
      (m.badge && m.badge.toLowerCase().includes(searchTerm.toLowerCase()));
    const matchesCategory =
      selectedCategoryFilter === "ALL" || m.categoryKey === selectedCategoryFilter;
    return matchesSearch && matchesCategory;
  });

  // Group members by category ordered by HIERARCHY_CATEGORIES config order
  const categoriesList = Object.values(HIERARCHY_CATEGORIES).sort((a, b) => a.order - b.order);

  return (
    <div className="max-w-7xl mx-auto px-2 sm:px-6 py-4 sm:py-8 space-y-6 sm:space-y-8 w-full max-w-full overflow-x-hidden">
      {/* Hidden SVG Gradient Definitions for Vice Proprietario */}
      <svg width="0" height="0" className="absolute w-0 h-0 pointer-events-none shrink-0" aria-hidden="true">
        <defs>
          <linearGradient id="viceProprietarioGradient" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#8fb3f5" />
            <stop offset="50%" stopColor="#b89bf3" />
            <stop offset="100%" stopColor="#f28fbe" />
          </linearGradient>
        </defs>
      </svg>

      {/* Top Banner / Hero Header */}
      <div className="relative overflow-hidden bg-gradient-to-br from-slate-900 via-[#111118] to-slate-950 border border-slate-800 rounded-3xl p-6 md:p-8 shadow-2xl">
        <div className="absolute top-0 right-0 w-96 h-96 bg-red-600/10 rounded-full blur-3xl -mr-20 -mt-20 pointer-events-none" />
        <div className="absolute bottom-0 left-0 w-80 h-80 bg-indigo-600/10 rounded-full blur-3xl -ml-20 -mb-20 pointer-events-none" />

        <div className="relative z-10 flex flex-col md:flex-row items-start md:items-center justify-between gap-6">
          <div className="space-y-3 max-w-2xl">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-red-500/10 border border-red-500/30 text-red-400 text-xs font-bold uppercase tracking-wider">
              <Sparkles className="w-3.5 h-3.5" /> Organigramma Ufficiale EMS
            </div>
            <h1 className="text-2xl md:text-4xl font-black text-white tracking-tight uppercase">
              Gerarchia <span className="text-transparent bg-clip-text bg-gradient-to-r from-red-500 via-rose-400 to-amber-400">EMS</span>
            </h1>
            <p className="text-slate-400 text-sm leading-relaxed">
              Struttura organizzativa e ruoli ufficiali del Soccorso Sanitario Emerals RP 4.0. Consultazione pubblica aggiornata per tutti i componenti del corpo.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <div className="bg-slate-950/80 border border-slate-800 px-4 py-2.5 rounded-2xl flex items-center gap-3">
              <Users className="w-5 h-5 text-red-400" />
              <div>
                <span className="block text-xs text-slate-400 font-semibold uppercase">Membri Totali</span>
                <span className="text-lg font-black text-white">{members.length}</span>
              </div>
            </div>

            {isAdmin && (
              <div className="flex flex-wrap gap-2">
                <button
                  onClick={handleOpenAddModal}
                  className="flex items-center gap-2 px-4 py-2.5 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs uppercase tracking-wider rounded-2xl shadow-lg shadow-red-950/40 transition-all cursor-pointer active:scale-95"
                >
                  <Plus className="w-4 h-4" /> Nuovo Membro
                </button>
                <button
                  onClick={() => setShowSyncConfirm(true)}
                  disabled={syncing}
                  className="flex items-center gap-2 px-4 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-200 font-bold text-xs uppercase tracking-wider rounded-2xl border border-slate-700 transition-all cursor-pointer active:scale-95 disabled:opacity-50"
                  title="Sincronizza automaticamente con i candidati ed i proprietari"
                >
                  <RefreshCw className={`w-4 h-4 ${syncing ? "animate-spin" : ""}`} /> Sincronizza
                </button>
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Success Notification Alert */}
      {successMsg && (
        <div className="bg-emerald-950/80 border border-emerald-500/40 text-emerald-300 px-5 py-3 rounded-2xl flex items-center justify-between text-sm shadow-xl animate-fade-in">
          <div className="flex items-center gap-2.5">
            <UserCheck className="w-5 h-5 text-emerald-400 shrink-0" />
            <span className="font-semibold">{successMsg}</span>
          </div>
          <button onClick={() => setSuccessMsg(null)} className="text-emerald-400 hover:text-white p-1">
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Search and Category Quick Filter Toolbar */}
      <div className="flex flex-col md:flex-row items-center justify-between gap-4 bg-slate-900/80 p-4 rounded-2xl border border-slate-800">
        {/* Search Bar */}
        <div className="relative w-full md:w-80">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Cerca per nome, ruolo o badge..."
            className="w-full bg-slate-950 border border-slate-800 rounded-xl pl-10 pr-4 py-2 text-xs text-white placeholder-slate-500 focus:outline-none focus:border-red-500/60 transition-all"
          />
          {searchTerm && (
            <button
              onClick={() => setSearchTerm("")}
              className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
            >
              <X className="w-3.5 h-3.5" />
            </button>
          )}
        </div>

        {/* Category Pills */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-2 pt-0.5 max-w-full touch-pan-x scrollbar-thin scrollbar-thumb-slate-700/80 hover:scrollbar-thumb-slate-600 scrollbar-track-slate-950/60 rounded-xl">
          <button
            onClick={() => setSelectedCategoryFilter("ALL")}
            className={`shrink-0 px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
              selectedCategoryFilter === "ALL"
                ? "bg-red-600 text-white shadow-md shadow-red-950/40"
                : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
            }`}
          >
            Tutti ({members.length})
          </button>

          {categoriesList.map((cat) => {
            const count = members.filter((m) => m.categoryKey === cat.key).length;
            const isSelected = selectedCategoryFilter === cat.key;
            return (
              <button
                key={cat.key}
                onClick={() => setSelectedCategoryFilter(cat.key)}
                className={`shrink-0 flex items-center gap-1.5 px-3.5 py-1.5 rounded-xl text-xs font-bold uppercase tracking-wider whitespace-nowrap transition-all cursor-pointer ${
                  isSelected
                    ? "bg-slate-800 text-white border border-slate-600 shadow-md"
                    : "bg-slate-950 text-slate-400 border border-slate-800 hover:text-slate-200"
                }`}
              >
                {getCategoryIcon(cat.key)}
                <span>{cat.title}</span>
                <span className="text-[10px] bg-slate-900 px-1.5 py-0.5 rounded-full border border-slate-700/60 font-mono">
                  {count}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Loading state */}
      {loading && (
        <div className="py-20 text-center space-y-3">
          <div className="inline-block w-8 h-8 border-3 border-red-500 border-t-transparent rounded-full animate-spin" />
          <p className="text-slate-400 text-xs font-bold uppercase tracking-wider">
            Caricamento Gerarchia EMS in corso...
          </p>
        </div>
      )}

      {/* Error state */}
      {error && !loading && (
        <div className="bg-red-950/50 border border-red-500/30 p-6 rounded-2xl text-center space-y-3">
          <p className="text-red-300 text-sm font-semibold">{error}</p>
          <button
            onClick={fetchHierarchy}
            className="px-4 py-2 bg-red-600 text-white rounded-xl text-xs font-bold uppercase"
          >
            Riprova
          </button>
        </div>
      )}

      {/* Main Hierarchy List Grouped by Categories & Sub-grouped by Specific Roles */}
      {!loading && !error && (
        <div className="space-y-10">
          {categoriesList.map((catConfig) => {
            // Filter members for this category
            const categoryMembers = filteredMembers.filter((m) => m.categoryKey === catConfig.key);

            // If filtering and no members in this category, skip rendering category block
            if (selectedCategoryFilter !== "ALL" && selectedCategoryFilter !== catConfig.key) {
              return null;
            }

            // Group members by specific roleName within this category
            const rolesMap = new Map<string, HierarchyMember[]>();

            // Pre-fill known roles from catConfig.rolesIncluded for correct order
            catConfig.rolesIncluded.forEach((role) => {
              rolesMap.set(role, []);
            });

            // Populate members into role buckets
            categoryMembers.forEach((m) => {
              const cleanRole = m.roleName.trim();
              let matchedRoleKey = cleanRole;

              // Match against known roles case-insensitively if possible
              for (const knownRole of Array.from(rolesMap.keys())) {
                if (knownRole.toLowerCase() === cleanRole.toLowerCase()) {
                  matchedRoleKey = knownRole;
                  break;
                }
              }

              if (!rolesMap.has(matchedRoleKey)) {
                rolesMap.set(matchedRoleKey, []);
              }
              rolesMap.get(matchedRoleKey)!.push(m);
            });

            // Filter out roles with zero members
            const activeRoleGroups = Array.from(rolesMap.entries()).filter(
              ([_, list]) => list.length > 0
            );

            return (
              <div
                key={catConfig.key}
                className={`rounded-3xl border border-slate-800/90 bg-slate-900/50 backdrop-blur-md p-6 space-y-6 shadow-xl transition-all`}
              >
                {/* Category Header */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800/80 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-2xl bg-slate-950 border border-slate-800 shadow-inner">
                      {getCategoryIcon(catConfig.key)}
                    </div>
                    <div>
                      <div className="flex items-center gap-2">
                        <h2 className="text-lg md:text-xl font-black text-white uppercase tracking-wider">
                          {catConfig.title}
                        </h2>
                        <span className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${catConfig.badgeBg}`}>
                          {categoryMembers.length} {categoryMembers.length === 1 ? "Membro Totale" : "Membri Totali"}
                        </span>
                      </div>
                      <p className="text-slate-400 text-xs mt-0.5">{catConfig.description}</p>
                    </div>
                  </div>

                  <div className="text-[11px] text-slate-400 bg-slate-950/80 px-3 py-1.5 rounded-xl border border-slate-800/90 self-start sm:self-auto font-medium">
                    Ruoli: <span className="font-bold text-slate-200">{catConfig.rolesIncluded.join(", ")}</span>
                  </div>
                </div>

                {/* Sub-groups by Specific Role */}
                {activeRoleGroups.length === 0 ? (
                  <div className="text-center py-8 bg-slate-950/40 rounded-2xl border border-dashed border-slate-800">
                    <p className="text-slate-500 text-xs italic">
                      Nessun membro presente in questa categoria.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-6">
                    {activeRoleGroups.map(([roleTitle, roleMembers]) => {
                      const groupRoleStyle = getRoleStyle(roleTitle);

                      return (
                        <div
                          key={roleTitle}
                          className="space-y-3 bg-slate-950/70 p-4 rounded-2xl border border-slate-800/80 shadow-md"
                        >
                          {/* Sub-Header per Specifico Ruolo */}
                          <div className="flex items-center justify-between border-b border-slate-800/80 pb-2.5">
                            <div className="flex items-center gap-2.5">
                              <span className={`p-1.5 rounded-lg ${groupRoleStyle.badgeBg} border shadow-sm inline-flex items-center justify-center`}>
                                {renderRoleSymbolIcon(groupRoleStyle.symbol, `w-4 h-4 ${groupRoleStyle.iconColor}`)}
                              </span>
                              <h3 className={`text-sm md:text-base font-black ${groupRoleStyle.text} uppercase tracking-wider`}>
                                {roleTitle}
                              </h3>
                              <span className={`text-[10px] font-extrabold px-2.5 py-0.5 rounded-full ${groupRoleStyle.badgeBg} border inline-flex items-center justify-center leading-none`}>
                                {roleMembers.length} {roleMembers.length === 1 ? "Persona" : "Persone"}
                              </span>
                            </div>
                          </div>

                          {/* Card Grid per Membri di questo Ruolo Specifico */}
                          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3.5 pt-1">
                            {roleMembers.map((m) => {
                              const memberRoleStyle = getRoleStyle(m.roleName);

                              return (
                                <div
                                  key={m.id}
                                  className={`group relative bg-slate-950 border border-slate-800/90 hover:${memberRoleStyle.border} rounded-2xl p-4 flex items-center justify-between gap-4 transition-all hover:shadow-xl hover:-translate-y-0.5`}
                                >
                                  {/* Member Details */}
                                  <div className="flex items-center gap-3.5 min-w-0">
                                    {/* Avatar Circle con Accento Ruolo */}
                                    <div className={`w-11 h-11 rounded-2xl flex items-center justify-center font-black text-sm shrink-0 ${memberRoleStyle.avatarBg} ${memberRoleStyle.avatarText} border shadow-md group-hover:scale-105 transition-transform`}>
                                      {m.name
                                        .split(" ")
                                        .map((w) => w[0])
                                        .join("")
                                        .toUpperCase()
                                        .slice(0, 2)}
                                    </div>

                                    <div className="min-w-0 space-y-1.5 flex-1">
                                      {/* Nome e Cognome */}
                                      <span className="block font-bold text-sm text-white truncate group-hover:text-amber-300 transition-colors">
                                        {m.name}
                                      </span>

                                      {/* Ruolo / Grado Ben Visibile con Colore Specifica del Ruolo e Simbolo */}
                                      <div className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-lg border text-[11px] font-black tracking-wide uppercase leading-none shadow-sm max-w-full w-fit ${memberRoleStyle.badgeBg}`}>
                                        {renderRoleSymbolIcon(memberRoleStyle.symbol, `w-3.5 h-3.5 ${memberRoleStyle.iconColor} shrink-0`)}
                                        <span className={`whitespace-nowrap text-center leading-none ${memberRoleStyle.text}`}>{m.roleName}</span>
                                      </div>

                                      {/* Badge e Tag Discord (se presenti) */}
                                      <div className="flex flex-wrap items-center gap-1.5 pt-0.5">
                                        {m.discordTag && (
                                          <span className="inline-flex items-center justify-center gap-1 text-[10px] font-mono font-bold px-2 py-0.5 rounded-md bg-indigo-950/80 text-indigo-300 border border-indigo-500/40 shrink-0 leading-none">
                                            <span className="text-indigo-400 font-extrabold leading-none">@</span>
                                            <span className="whitespace-nowrap leading-none">{m.discordTag.replace(/^@/, '')}</span>
                                          </span>
                                        )}
                                        {m.badge && (
                                          <div className="inline-flex items-center gap-2 px-3 py-1.5 rounded-xl bg-gradient-to-r from-amber-500/25 via-yellow-400/35 to-amber-500/25 text-yellow-300 border border-yellow-400/90 shadow-md shadow-amber-950/50 max-w-full w-fit">
                                            <Award className="w-4 h-4 text-yellow-300 shrink-0" />
                                            <span className="text-[10px] font-black uppercase tracking-wider text-yellow-300 whitespace-nowrap leading-none">{m.badge}</span>
                                          </div>
                                        )}
                                      </div>
                                    </div>
                                  </div>

                                  {/* Admin Controls */}
                                  {isAdmin && (
                                    <div className="flex items-center gap-1 opacity-90 sm:opacity-0 group-hover:opacity-100 transition-opacity shrink-0 bg-slate-900/90 p-1 rounded-xl border border-slate-800">
                                      <button
                                        onClick={() => handleOpenEditModal(m)}
                                        className="p-1.5 text-slate-400 hover:text-amber-400 hover:bg-amber-500/10 rounded-lg transition-colors cursor-pointer"
                                        title="Modifica Membro"
                                      >
                                        <Edit3 className="w-3.5 h-3.5" />
                                      </button>
                                      <button
                                        onClick={() => setMemberToDelete({ id: m.id, name: m.name })}
                                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                                        title="Rimuovi dalla Gerarchia"
                                      >
                                        <Trash2 className="w-3.5 h-3.5" />
                                      </button>
                                    </div>
                                  )}
                                </div>
                              );
                            })}
                          </div>
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

      {/* Admin Add/Edit Member Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 backdrop-blur-md p-4">
          <div className="bg-[#111118] border border-slate-800 rounded-3xl w-full max-w-lg overflow-hidden shadow-2xl animate-fade-in">
            {/* Modal Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-slate-800 bg-slate-900/50">
              <div className="flex items-center gap-2">
                <Sparkles className="w-4 h-4 text-red-400" />
                <h3 className="text-base font-bold text-white uppercase tracking-wider">
                  {editingMember ? "Modifica Membro Gerarchia" : "Aggiungi Membro Gerarchia"}
                </h3>
              </div>
              <button
                onClick={() => setShowModal(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {/* Modal Body / Form */}
            <form onSubmit={handleSaveMember} className="p-6 space-y-4">
              {formError && (
                <div className="p-3 bg-red-950/80 border border-red-500/40 text-red-300 rounded-xl text-xs font-semibold">
                  {formError}
                </div>
              )}

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Nome e Cognome *
                </label>
                <input
                  type="text"
                  required
                  value={formName}
                  onChange={(e) => setFormName(e.target.value)}
                  placeholder="Es. Dott. Mario Rossi"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Grado / Ruolo EMS *
                </label>
                <input
                  type="text"
                  required
                  value={formRole}
                  onChange={(e) => setFormRole(e.target.value)}
                  placeholder="Es. Primario di Reparto, Proprietario, Supervisore..."
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-red-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Categoria Gerarchica *
                </label>
                <select
                  value={formCategory}
                  onChange={(e) => setFormCategory(e.target.value as HierarchyCategoryKey)}
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-red-500 cursor-pointer"
                >
                  <option value="PROPRIETARI">PROPRIETARI (Proprietario, Vice Proprietario)</option>
                  <option value="DIRIGENZA_GENERALE">DIRIGENZA GENERALE (Direttore Generale)</option>
                  <option value="DIRIGENZA_SANITARIA">DIRIGENZA SANITARIA (Segretario, V. Direttore, Direttore Sanitario)</option>
                  <option value="SUPERVISIONE">SUPERVISIONE (Assistente, V. Supervisore, Supervisore, Sup. Generale)</option>
                  <option value="FUNZIONARI">FUNZIONARI (Vice Primario, Primario, V. Responsabile, Responsabile Presidio)</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-300 uppercase mb-1.5">
                  Tag Discord (Opzionale)
                </label>
                <input
                  type="text"
                  value={formDiscordTag}
                  onChange={(e) => setFormDiscordTag(e.target.value)}
                  placeholder="Es. @mario_rossi o nickname#1234"
                  className="w-full bg-slate-950 border border-slate-800 rounded-xl px-3.5 py-2.5 text-sm text-white focus:outline-none focus:border-red-500 font-mono"
                />
              </div>

              <div>
                <label className="block text-xs font-extrabold text-amber-300 uppercase mb-1.5 flex items-center gap-1.5">
                  <Award className="w-4 h-4 text-yellow-400" /> Ruolo C.D.A. (Consiglio di Amministrazione)
                </label>
                <select
                  value={formBadge}
                  onChange={(e) => setFormBadge(e.target.value)}
                  className="w-full bg-slate-950 border border-amber-500/40 rounded-xl px-3.5 py-2.5 text-sm text-yellow-200 font-extrabold focus:outline-none focus:border-yellow-400 cursor-pointer shadow-inner"
                >
                  <option value="" className="bg-slate-900 text-slate-400 font-normal">-- Nessun Ruolo C.D.A. (Vuoto) --</option>
                  <option value="Presidente C.D.A." className="bg-slate-900 text-yellow-300 font-bold">Presidente C.D.A.</option>
                  <option value="Vice-Presidente C.D.A." className="bg-slate-900 text-yellow-300 font-bold">Vice-Presidente C.D.A.</option>
                  <option value="Segretario C.D.A." className="bg-slate-900 text-yellow-300 font-bold">Segretario C.D.A.</option>
                  <option value="Consigliere Finale C.D.A." className="bg-slate-900 text-yellow-300 font-bold">Consigliere Finale C.D.A.</option>
                  <option value="Membro C.D.A." className="bg-slate-900 text-yellow-300 font-bold">Membro C.D.A.</option>
                </select>

                {/* Quick Selection Pills */}
                <div className="flex flex-wrap items-center gap-1.5 mt-2.5">
                  {[
                    { label: "Vuoto", value: "" },
                    { label: "Presidente C.D.A.", value: "Presidente C.D.A." },
                    { label: "Vice-Presidente C.D.A.", value: "Vice-Presidente C.D.A." },
                    { label: "Segretario C.D.A.", value: "Segretario C.D.A." },
                    { label: "Consigliere Finale C.D.A.", value: "Consigliere Finale C.D.A." },
                    { label: "Membro C.D.A.", value: "Membro C.D.A." },
                  ].map((option) => (
                    <button
                      key={option.label}
                      type="button"
                      onClick={() => setFormBadge(option.value)}
                      className={`text-[10px] font-extrabold px-3 py-1.5 rounded-lg border transition-all cursor-pointer whitespace-nowrap inline-flex items-center justify-center leading-none ${
                        formBadge === option.value
                          ? "bg-gradient-to-r from-amber-500/30 via-yellow-400/40 to-amber-500/30 text-yellow-300 border-yellow-400 shadow-sm shadow-amber-950/60 scale-105"
                          : "bg-slate-950 text-slate-400 border-slate-800 hover:border-slate-700 hover:text-slate-200"
                      }`}
                    >
                      {option.label}
                    </button>
                  ))}
                </div>
              </div>

              <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-800">
                <button
                  type="button"
                  onClick={() => setShowModal(false)}
                  className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold uppercase hover:bg-slate-700"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={saving}
                  className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-red-600 to-rose-600 hover:from-red-500 hover:to-rose-500 text-white font-bold text-xs uppercase rounded-xl shadow-lg shadow-red-950/50 cursor-pointer disabled:opacity-50"
                >
                  {saving ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  ) : (
                    <Check className="w-4 h-4" />
                  )}
                  {editingMember ? "Salva Modifiche" : "Aggiungi Membro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
      {/* Modal Eliminazione Membro */}
      {memberToDelete && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-rose-400">
              <div className="p-3 bg-rose-500/10 rounded-2xl border border-rose-500/20">
                <Trash2 className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Rimuovi Membro</h3>
                <p className="text-xs text-slate-400">Conferma l'eliminazione dalla gerarchia</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Sei sicuro di voler eliminare <span className="font-bold text-white">{memberToDelete.name}</span> dalla Gerarchia EMS? L'operazione non potrà essere annullata.
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setMemberToDelete(null)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold uppercase hover:bg-slate-700 transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmDeleteMember}
                disabled={saving}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-rose-600 to-red-600 hover:from-rose-500 hover:to-red-500 text-white font-bold text-xs uppercase rounded-xl shadow-lg shadow-rose-950/50 cursor-pointer disabled:opacity-50"
              >
                {saving ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <Trash2 className="w-4 h-4" />
                )}
                Conferma Eliminazione
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Modal Sincronizzazione Gerarchia */}
      {showSyncConfirm && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 z-50 animate-fade-in">
          <div className="bg-slate-900 border border-slate-800 rounded-3xl max-w-md w-full p-6 space-y-5 shadow-2xl">
            <div className="flex items-center gap-3 text-cyan-400">
              <div className="p-3 bg-cyan-500/10 rounded-2xl border border-cyan-500/20">
                <RefreshCw className="w-6 h-6" />
              </div>
              <div>
                <h3 className="text-lg font-bold text-white">Sincronizza Gerarchia</h3>
                <p className="text-xs text-slate-400">Aggiorna da candidati e proprietari</p>
              </div>
            </div>

            <p className="text-sm text-slate-300 leading-relaxed">
              Vuoi risincronizzare automaticamente l'organigramma con tutti i candidati ufficiali e i proprietari correnti registrati nel sistema?
            </p>

            <div className="flex items-center justify-end gap-3 pt-3 border-t border-slate-800">
              <button
                type="button"
                onClick={() => setShowSyncConfirm(false)}
                className="px-4 py-2 bg-slate-800 text-slate-300 rounded-xl text-xs font-bold uppercase hover:bg-slate-700 transition-colors"
              >
                Annulla
              </button>
              <button
                type="button"
                onClick={handleConfirmSyncHierarchy}
                disabled={syncing}
                className="flex items-center gap-2 px-5 py-2 bg-gradient-to-r from-cyan-600 to-blue-600 hover:from-cyan-500 hover:to-blue-500 text-white font-bold text-xs uppercase rounded-xl shadow-lg shadow-cyan-950/50 cursor-pointer disabled:opacity-50"
              >
                {syncing ? (
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                ) : (
                  <RefreshCw className="w-4 h-4" />
                )}
                Sincronizza Ora
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
