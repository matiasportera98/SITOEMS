import React, { useState, useEffect } from "react";
import { Bell, CheckCheck, Trash2, ShieldAlert, Sparkles, X, Info, Award, FileText, Vote, Shield } from "lucide-react";

export interface NotificationItem {
  id: string;
  title: string;
  message: string;
  category: "CANDIDATURE" | "GERARCHIA" | "CDA" | "ADMIN";
  timestamp: string;
  badgeColor: string;
}

interface NotificationMenuProps {
  discordToken?: string | null;
  adminToken?: string | null;
  onNavigate?: (mode: "voter" | "admin" | "hierarchy" | "candidatura" | "cda") => void;
}

export default function NotificationMenu({ discordToken, adminToken, onNavigate }: NotificationMenuProps) {
  const [isOpen, setIsOpen] = useState<boolean>(false);
  const [notifications, setNotifications] = useState<NotificationItem[]>([]);
  const [clearedIds, setClearedIds] = useState<string[]>(() => {
    try {
      const saved = localStorage.getItem("ems_cleared_notifications");
      return saved ? JSON.parse(saved) : [];
    } catch {
      return [];
    }
  });
  const [isLoading, setIsLoading] = useState<boolean>(false);

  // Fetch notifications periodically or when popover opens
  const fetchNotifications = async () => {
    setIsLoading(true);
    try {
      const token = discordToken || adminToken || localStorage.getItem("discordToken") || localStorage.getItem("adminToken");
      const headers: Record<string, string> = {};
      if (token) {
        headers["Authorization"] = `Bearer ${token}`;
      }

      const res = await fetch("/api/notifications", { headers });
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.notifications)) {
          setNotifications(data.notifications);
        }
      }
    } catch (e) {
      // Ignore network errors gracefully during background updates
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
    const interval = setInterval(fetchNotifications, 10000); // refresh every 10s
    return () => clearInterval(interval);
  }, [discordToken, adminToken]);

  // Filter out notifications that have been cleared by the user
  const activeNotifications = notifications.filter((n) => !clearedIds.includes(n.id));

  // Confirm reading / Clear history
  const handleClearHistory = () => {
    const allCurrentIds = notifications.map((n) => n.id);
    const newCleared = Array.from(new Set([...clearedIds, ...allCurrentIds]));
    setClearedIds(newCleared);
    try {
      localStorage.setItem("ems_cleared_notifications", JSON.stringify(newCleared));
    } catch (e) {
      console.error("Error saving cleared notifications:", e);
    }
  };

  const getCategoryIcon = (category: string) => {
    switch (category) {
      case "CANDIDATURE":
        return <FileText size={14} className="text-purple-400" />;
      case "GERARCHIA":
        return <Vote size={14} className="text-blue-400" />;
      case "CDA":
        return <Award size={14} className="text-amber-400" />;
      case "ADMIN":
        return <Shield size={14} className="text-rose-400" />;
      default:
        return <Bell size={14} className="text-amber-400" />;
    }
  };

  return (
    <div className="relative shrink-0">
      {/* Black button with yellow/amber icon */}
      <button
        onClick={() => {
          setIsOpen(!isOpen);
          if (!isOpen) fetchNotifications();
        }}
        className="relative flex items-center justify-center p-2.5 bg-black hover:bg-neutral-900 border border-amber-500/40 hover:border-amber-400 rounded-xl shadow-lg shadow-black/60 cursor-pointer transition-all active:scale-95 group"
        title="Centro Notifiche"
      >
        <Bell size={18} className="text-amber-400 group-hover:rotate-12 transition-transform duration-200" />
        {activeNotifications.length > 0 && (
          <span className="absolute -top-1 -right-1 bg-gradient-to-r from-amber-500 to-yellow-400 text-black font-black text-[10px] w-5 h-5 rounded-full flex items-center justify-center border-2 border-black shadow-md animate-pulse">
            {activeNotifications.length}
          </span>
        )}
      </button>

      {/* Popover Menu */}
      {isOpen && (
        <>
          {/* Overlay to close on outside click */}
          <div className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs" onClick={() => setIsOpen(false)} />

          <div className="absolute right-0 top-full mt-2.5 w-80 sm:w-96 max-w-[calc(100vw-1.5rem)] bg-[#121216] border border-amber-500/40 rounded-2xl shadow-2xl z-[60] overflow-hidden backdrop-blur-2xl animate-fadeIn">
            {/* Header */}
            <div className="p-3.5 bg-[#0a0a0d] border-b border-white/10 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <div className="p-1.5 bg-amber-500/10 border border-amber-500/30 rounded-lg">
                  <Bell size={16} className="text-amber-400" />
                </div>
                <div>
                  <h3 className="text-xs font-black uppercase tracking-wider text-white">Notifiche di Sistema</h3>
                  <p className="text-[10px] text-slate-400">
                    {activeNotifications.length} {activeNotifications.length === 1 ? "notifica attiva" : "notifiche attive"}
                  </p>
                </div>
              </div>
              <button
                onClick={() => setIsOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-white/10 transition-colors"
              >
                <X size={16} />
              </button>
            </div>

            {/* Confirm reading & Clear history Action bar */}
            {activeNotifications.length > 0 && (
              <div className="px-3.5 py-2 bg-slate-900/80 border-b border-white/5 flex items-center justify-between gap-2">
                <span className="text-[11px] text-slate-400 font-medium">Aggiornate in tempo reale</span>
                <button
                  onClick={handleClearHistory}
                  className="flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/10 hover:bg-amber-500/20 text-amber-300 border border-amber-500/30 rounded-lg text-2xs font-bold transition-all cursor-pointer hover:border-amber-400"
                >
                  <CheckCheck size={13} />
                  <span>Conferma Lettura (Svuota)</span>
                </button>
              </div>
            )}

            {/* Notification Items List */}
            <div className="max-h-80 overflow-y-auto dark-scrollbar p-2 space-y-2">
              {activeNotifications.length === 0 ? (
                <div className="p-6 text-center space-y-2">
                  <div className="w-10 h-10 mx-auto rounded-full bg-emerald-500/10 border border-emerald-500/20 flex items-center justify-between justify-center text-emerald-400">
                    <CheckCheck size={20} className="mx-auto" />
                  </div>
                  <p className="text-xs font-bold text-slate-300">Nessuna nuova notifica</p>
                  <p className="text-[11px] text-slate-500">Tutte le notifiche sono state lette o la cronologia è vuota.</p>
                </div>
              ) : (
                activeNotifications.map((notif) => (
                  <div
                    key={notif.id}
                    className="p-3 bg-[#18181f] hover:bg-[#1e1e27] border border-white/5 rounded-xl transition-all space-y-1.5 relative group"
                  >
                    <div className="flex items-center justify-between gap-2">
                      <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-bold uppercase border ${notif.badgeColor}`}>
                        {getCategoryIcon(notif.category)}
                        {notif.category}
                      </span>
                      <span className="text-[10px] text-slate-500 font-mono">
                        {new Date(notif.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                    </div>

                    <h4 className="text-xs font-bold text-white leading-tight">{notif.title}</h4>
                    <p className="text-[11px] text-slate-300 leading-relaxed">{notif.message}</p>
                  </div>
                ))
              )}
            </div>

            {/* Footer */}
            <div className="p-2.5 bg-[#0a0a0d] border-t border-white/5 text-center">
              <span className="text-[10px] text-slate-500">Notifiche personalizzate in base al tuo ruolo & token</span>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
