import React, { useState, useEffect, useMemo, useRef } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  FileSpreadsheet,
  ExternalLink,
  RefreshCw,
  Download,
  Plus,
  Search,
  Filter,
  CheckCircle2,
  Clock,
  Award,
  Shield,
  ArrowRight,
  ArrowLeft,
  Sparkles,
  Edit2,
  Trash2,
  Eye,
  EyeOff,
  Lock,
  UserCheck,
  ChevronDown,
  ChevronUp,
  ChevronLeft,
  ChevronRight,
  AlertCircle,
  FileText,
  Copy,
  Table as TableIcon,
  Maximize2,
  Minimize2,
  RotateCcw,
  Users,
  Calendar,
  AlertTriangle,
  Columns3,
  MoreVertical,
  Check,
  X,
  SlidersHorizontal,
  ArrowLeftRight,
  ArrowUpDown,
  LayoutGrid,
  CheckSquare,
  Square,
  GripVertical,
  ArrowUp,
  ArrowDown,
  Move,
  CloudUpload,
  Radio
} from "lucide-react";

declare global {
  interface Window {
    google?: any;
  }
}
import {
  ExcelGerarchiaEntry,
  ExcelColumnDef,
  DEFAULT_EXCEL_COLUMNS,
  GOOGLE_SHEET_GERARCHIA_URL,
  getRoleBadgeStyle,
  DiscordUserSession,
  ROLE_CONFIGS,
  RoleId
} from "../types.js";
import { googleSignIn, googleLogout, OAUTH_CLIENT_ID } from "../services/googleAuth";

interface ExcelGerarchiaViewProps {
  authToken: string;
  sessionInfo?: {
    roleName: string;
    username?: string;
    grade: number;
    isMaster: boolean;
  } | null;
  onRefreshNeeded?: () => void;
}

const COMMON_ROLE_OPTIONS = [
  "Direttore generale",
  "Direttore",
  "Vice Direttore",
  "Segretario Direzione",
  "Supervisore Generale",
  "Supervisore",
  "V.Supervisore",
  "Assistente Supervisore",
  "Assistente supervisore",
  "V. Resp del presidio",
  "Primario di Reparto",
  "V. Primario di Reparto",
  "Primario",
  "V. Primario",
  "Medico esperto",
  "Medico",
  "Infermiere",
  "Tirocinante",
  "Volontario",
  "In Aspettativa",
  "LICENZIAMENTO"
];

const COMMON_CDA_OPTIONS = [
  "",
  "Presidente CDA",
  "V. Presidente CDA",
  "Segretario CDA",
  "CDA"
];

const COMMON_DGS_OPTIONS = [
  "",
  "Responsabile DGS",
  "Supervisore DGS",
  "Direttore DGS",
  "V.Direttore DGS"
];

const COMMON_LEAVE_OPTIONS = [
  "",
  "FERIE",
  "ASSENTE DA TEMPO",
  "FERIE NON DICHIARATE",
  "ASPETTATIVA",
  "DEVE SVEGLIARSI"
];

export default function ExcelGerarchiaView({
  authToken,
  sessionInfo,
  onRefreshNeeded
}: ExcelGerarchiaViewProps) {
  const [entries, setEntries] = useState<ExcelGerarchiaEntry[]>([]);
  const [columns, setColumns] = useState<ExcelColumnDef[]>(DEFAULT_EXCEL_COLUMNS);
  const [isLoading, setIsLoading] = useState<boolean>(true);
  const [isSyncing, setIsSyncing] = useState<boolean>(false);
  const [isResetting, setIsResetting] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  // Search and Filter states
  const [searchTerm, setSearchTerm] = useState<string>("");
  const [statusFilter, setStatusFilter] = useState<string>("ALL");
  const [viewMode, setViewMode] = useState<"table" | "google_sheet">("table");

  // Visual Layout & Density states (fit to screen by default so all right columns are visible)
  const [densityMode, setDensityMode] = useState<"fit" | "compact" | "scroll">("fit");
  const [showQuickColumnPills, setShowQuickColumnPills] = useState<boolean>(true);
  const [canScrollLeft, setCanScrollLeft] = useState<boolean>(false);
  const [canScrollRight, setCanScrollRight] = useState<boolean>(false);

  const tableScrollContainerRef = useRef<HTMLDivElement | null>(null);
  const topScrollContainerRef = useRef<HTMLDivElement | null>(null);

  // Check scroll capability
  const checkScroll = () => {
    const el = tableScrollContainerRef.current;
    if (el) {
      const hasOverflow = el.scrollWidth > el.clientWidth + 2;
      setCanScrollLeft(el.scrollLeft > 5);
      setCanScrollRight(hasOverflow && el.scrollLeft < el.scrollWidth - el.clientWidth - 5);
    }
  };

  const scrollToLeft = () => {
    if (tableScrollContainerRef.current) {
      tableScrollContainerRef.current.scrollTo({ left: 0, behavior: "smooth" });
    }
  };

  const scrollToRight = () => {
    if (tableScrollContainerRef.current) {
      tableScrollContainerRef.current.scrollTo({
        left: tableScrollContainerRef.current.scrollWidth,
        behavior: "smooth",
      });
    }
  };

  const handleTableScroll = () => {
    if (tableScrollContainerRef.current && topScrollContainerRef.current) {
      topScrollContainerRef.current.scrollLeft = tableScrollContainerRef.current.scrollLeft;
    }
    checkScroll();
  };

  const handleTopScroll = () => {
    if (tableScrollContainerRef.current && topScrollContainerRef.current) {
      tableScrollContainerRef.current.scrollLeft = topScrollContainerRef.current.scrollLeft;
    }
    checkScroll();
  };

  useEffect(() => {
    checkScroll();
    window.addEventListener("resize", checkScroll);
    return () => window.removeEventListener("resize", checkScroll);
  }, [columns, entries, densityMode]);

  // Inline Cell Editing state
  const [editingCell, setEditingCell] = useState<{ rowId: string; field: string } | null>(null);
  const [cellValue, setCellValue] = useState<string>("");
  const [isSavingCell, setIsSavingCell] = useState<boolean>(false);
  const [savedCellIndicator, setSavedCellIndicator] = useState<{ rowId: string; field: string } | null>(null);

  // Column Manager & Edit Modals
  const [isColumnManagerOpen, setIsColumnManagerOpen] = useState<boolean>(false);
  const [isAddColumnModalOpen, setIsAddColumnModalOpen] = useState<boolean>(false);
  const [newColumnLabel, setNewColumnLabel] = useState<string>("");
  const [newColumnType, setNewColumnType] = useState<"text" | "role" | "badge" | "leave" | "status" | "date">("text");

  // Column Header Rename Modal / Prompt
  const [columnToRename, setColumnToRename] = useState<ExcelColumnDef | null>(null);
  const [renameLabelValue, setRenameLabelValue] = useState<string>("");
  const [columnToDelete, setColumnToDelete] = useState<ExcelColumnDef | null>(null);
  const [isSavingColumns, setIsSavingColumns] = useState<boolean>(false);

  // Add / Edit Row Modal States
  const [isModalOpen, setIsModalOpen] = useState<boolean>(false);
  const [editingEntry, setEditingEntry] = useState<ExcelGerarchiaEntry | null>(null);
  const [formFullName, setFormFullName] = useState<string>("");
  const [formCurrentRole, setFormCurrentRole] = useState<string>("Primario");
  const [formNewRole, setFormNewRole] = useState<string>("");
  const [formCdaRole, setFormCdaRole] = useState<string>("");
  const [formDgsRole, setFormDgsRole] = useState<string>("");
  const [formLeaveStatus, setFormLeaveStatus] = useState<string>("");
  const [formStatus, setFormStatus] = useState<"CONFERMATO" | "IN_VALUTAZIONE" | "IN_VOTAZIONE_CDA" | "ARCHIVIATO">("CONFERMATO");
  const [formNotes, setFormNotes] = useState<string>("");
  const [formCustomFields, setFormCustomFields] = useState<Record<string, string>>({});
  const [isSaving, setIsSaving] = useState<boolean>(false);

  // Delete Confirm Modal State
  const [entryToDelete, setEntryToDelete] = useState<ExcelGerarchiaEntry | null>(null);
  const [isDeleting, setIsDeleting] = useState<boolean>(false);

  // Active header dropdown menu
  const [activeHeaderMenu, setActiveHeaderMenu] = useState<string | null>(null);

  // Row Drag & Drop and Reorder State
  const [draggedRowIndex, setDraggedRowIndex] = useState<number | null>(null);
  const [dragOverRowIndex, setDragOverRowIndex] = useState<number | null>(null);
  const [isReordering, setIsReordering] = useState<boolean>(false);

  // Google Sheets Real-Time Sync States
  const [googleAccessToken, setGoogleAccessToken] = useState<string>(() => {
    return localStorage.getItem("google_sheets_access_token") || "";
  });
  const [googleClientId, setGoogleClientId] = useState<string>("");
  const [spreadsheetIdToSync, setSpreadsheetIdToSync] = useState<string>("1dBCewK_cvU1HeBLrCtH1-HbnsIWW1050DU0332Bd258");
  const [sheetNameToSync, setSheetNameToSync] = useState<string>("Foglio1");
  const [autoSyncToGoogle, setAutoSyncToGoogle] = useState<boolean>(() => {
    return localStorage.getItem("excel_auto_sync_google") === "true";
  });
  const [isPushingToGoogle, setIsPushingToGoogle] = useState<boolean>(false);
  const [isGoogleSyncModalOpen, setIsGoogleSyncModalOpen] = useState<boolean>(false);
  const [lastGoogleSyncTime, setLastGoogleSyncTime] = useState<string | null>(null);

  // Reorder row logic
  const handleReorderEntries = async (newOrderedList: ExcelGerarchiaEntry[]) => {
    setIsReordering(true);
    const renumbered = newOrderedList.map((item, idx) => ({
      ...item,
      orderNumber: idx + 1,
    }));
    setEntries(renumbered);

    try {
      const response = await fetch("/api/admin/excel-gerarchia-reorder", {
        method: "PUT",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ entryIds: renumbered.map((e) => e.id) }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore nel salvataggio dell'ordine.");
      }
      if (Array.isArray(data.entries)) {
        setEntries(data.entries);
      }
      setSuccessMessage("Ordine aggiornato con successo!");
      setTimeout(() => setSuccessMessage(null), 3000);

      // Trigger Auto-Sync to Google Sheets if enabled
      if (autoSyncToGoogle && googleAccessToken) {
        triggerAutoSyncToGoogle();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Impossibile salvare il nuovo ordine delle righe.");
      fetchEntries(false);
    } finally {
      setIsReordering(false);
    }
  };

  const handleMoveRow = async (entryId: string, direction: "up" | "down") => {
    const currentIdx = entries.findIndex((e) => e.id === entryId);
    if (currentIdx === -1) return;
    if (direction === "up" && currentIdx === 0) return;
    if (direction === "down" && currentIdx === entries.length - 1) return;

    const targetIdx = direction === "up" ? currentIdx - 1 : currentIdx + 1;
    const newEntries = [...entries];
    const [moved] = newEntries.splice(currentIdx, 1);
    newEntries.splice(targetIdx, 0, moved);

    await handleReorderEntries(newEntries);
  };

  const handleDragStart = (e: React.DragEvent, index: number, entry: ExcelGerarchiaEntry) => {
    setDraggedRowIndex(index);
    e.dataTransfer.setData("text/plain", entry.id);
    e.dataTransfer.effectAllowed = "move";
  };

  const handleDragOver = (e: React.DragEvent, index: number) => {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    if (dragOverRowIndex !== index) {
      setDragOverRowIndex(index);
    }
  };

  const handleDragEnd = () => {
    setDraggedRowIndex(null);
    setDragOverRowIndex(null);
  };

  const handleDrop = async (e: React.DragEvent, targetIndex: number) => {
    e.preventDefault();
    const sourceIndex = draggedRowIndex;
    setDraggedRowIndex(null);
    setDragOverRowIndex(null);

    if (sourceIndex === null || sourceIndex === targetIndex) return;

    const newEntries = [...entries];
    const [moved] = newEntries.splice(sourceIndex, 1);
    newEntries.splice(targetIndex, 0, moved);

    await handleReorderEntries(newEntries);
  };

  // Fetch entries and columns
  const fetchEntries = async (showLoading = true) => {
    if (showLoading) setIsLoading(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/excel-gerarchia", {
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Impossibile caricare il foglio gerarchia.");
      }
      setEntries(data.entries || []);
      if (Array.isArray(data.columns) && data.columns.length > 0) {
        setColumns(data.columns);
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Errore di connessione al server.");
    } finally {
      if (showLoading) setIsLoading(false);
    }
  };

  useEffect(() => {
    fetchEntries();

    const fetchGoogleConfig = async () => {
      try {
        const resp = await fetch("/api/admin/excel-gerarchia/google-config", {
          headers: { Authorization: `Bearer ${authToken}` },
        });
        const data = await resp.json();
        if (data.clientId) {
          setGoogleClientId(data.clientId);
        }
        if (data.defaultSpreadsheetId) {
          setSpreadsheetIdToSync(data.defaultSpreadsheetId);
        }
      } catch (e) {
        // ignore
      }
    };
    fetchGoogleConfig();
  }, [authToken]);

  // Click outside to close header menu
  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (!(e.target as HTMLElement).closest(".header-menu-container")) {
        setActiveHeaderMenu(null);
      }
    };
    window.addEventListener("click", handleClickOutside);
    return () => window.removeEventListener("click", handleClickOutside);
  }, []);

  // Save Columns Configuration to Server
  const saveColumnsConfig = async (newCols: ExcelColumnDef[]) => {
    setIsSavingColumns(true);
    try {
      const response = await fetch("/api/admin/excel-gerarchia/columns", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ columns: newCols }),
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore durante il salvataggio delle colonne.");
      }
      setColumns(data.columns);
      setSuccessMessage("Configurazione colonne salvata con successo!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || "Errore nel salvataggio delle colonne.");
    } finally {
      setIsSavingColumns(false);
    }
  };

  // Reset Columns to Default
  const handleResetColumns = async () => {
    if (!window.confirm("Vuoi ripristinare le colonne del foglio ai valori predefiniti?")) return;
    setIsSavingColumns(true);
    try {
      const response = await fetch("/api/admin/excel-gerarchia/columns/reset", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore durante il ripristino delle colonne.");
      }
      setColumns(data.columns);
      setSuccessMessage("Colonne ripristinate ai valori predefiniti!");
      setTimeout(() => setSuccessMessage(null), 3000);
    } catch (err: any) {
      setErrorMessage(err.message || "Errore nel ripristino delle colonne.");
    } finally {
      setIsSavingColumns(false);
    }
  };

  // Add new column
  const handleAddColumn = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newColumnLabel.trim()) return;

    const key = "col_" + Date.now().toString(36) + "_" + Math.random().toString(36).substring(2, 5);
    const newCol: ExcelColumnDef = {
      id: key,
      key: key,
      label: newColumnLabel.trim(),
      type: newColumnType,
      isRemovable: true,
      isCustom: true,
      order: columns.length,
      visible: true,
      width: "min-w-[150px]",
    };

    const updated = [...columns, newCol];
    await saveColumnsConfig(updated);
    setNewColumnLabel("");
    setNewColumnType("text");
    setIsAddColumnModalOpen(false);
  };

  // Delete column
  const handleDeleteColumn = async () => {
    if (!columnToDelete) return;
    if (columnToDelete.id === "fullName") {
      setErrorMessage("La colonna dei membri non può essere eliminata.");
      setColumnToDelete(null);
      return;
    }

    const updated = columns.filter((c) => c.id !== columnToDelete.id);
    await saveColumnsConfig(updated);
    setColumnToDelete(null);
    setActiveHeaderMenu(null);
  };

  // Rename column
  const handleSaveColumnRename = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!columnToRename || !renameLabelValue.trim()) return;

    const updated = columns.map((c) =>
      c.id === columnToRename.id ? { ...c, label: renameLabelValue.trim() } : c
    );
    await saveColumnsConfig(updated);
    setColumnToRename(null);
    setActiveHeaderMenu(null);
  };

  // Toggle Column Visibility
  const handleToggleColumnVisibility = async (colId: string) => {
    const updated = columns.map((c) =>
      c.id === colId ? { ...c, visible: !c.visible } : c
    );
    await saveColumnsConfig(updated);
  };

  // Move column order
  const handleMoveColumn = async (index: number, direction: "left" | "right") => {
    const targetIndex = direction === "left" ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= columns.length) return;

    const newCols = [...columns];
    const temp = newCols[index];
    newCols[index] = newCols[targetIndex];
    newCols[targetIndex] = temp;

    const reordered = newCols.map((c, i) => ({ ...c, order: i }));
    await saveColumnsConfig(reordered);
  };

  // INLINE CELL EDITING
  const handleStartCellEdit = (rowId: string, field: string, currentValue: string) => {
    setEditingCell({ rowId, field });
    setCellValue(currentValue || "");
  };

  const handleCancelCellEdit = () => {
    setEditingCell(null);
    setCellValue("");
  };

  const handleSaveCell = async (rowId: string, field: string) => {
    if (isSavingCell) return;
    setIsSavingCell(true);

    try {
      const response = await fetch(`/api/admin/excel-gerarchia/${rowId}/cell`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({ field, value: cellValue.trim() }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore nel salvataggio della cella.");
      }

      // Update local state smoothly
      setEntries((prev) =>
        prev.map((item) => (item.id === rowId ? data.entry : item))
      );

      // Trigger temporary green check indicator
      setSavedCellIndicator({ rowId, field });
      setTimeout(() => setSavedCellIndicator(null), 2000);

      setEditingCell(null);

      // Trigger Auto-Sync to Google Sheets if enabled
      if (autoSyncToGoogle && googleAccessToken) {
        triggerAutoSyncToGoogle();
      }
    } catch (err: any) {
      setErrorMessage(err.message || "Errore aggiornamento cella.");
    } finally {
      setIsSavingCell(false);
    }
  };

  // Google Sheets Push / Sync Methods
  const executePushToGoogle = async (tokenToUse?: string) => {
    const token = tokenToUse || googleAccessToken || localStorage.getItem("google_sheets_access_token") || "";
    if (!token) {
      setIsGoogleSyncModalOpen(true);
      return;
    }

    setIsPushingToGoogle(true);
    setErrorMessage(null);
    try {
      const response = await fetch("/api/admin/excel-gerarchia/push-to-google-sheet", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
          "x-google-token": token,
        },
        body: JSON.stringify({
          spreadsheetId: spreadsheetIdToSync,
          sheetName: sheetNameToSync,
          googleToken: token,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        if (data.needsGoogleAuth) {
          setGoogleAccessToken("");
          localStorage.removeItem("google_sheets_access_token");
          setIsGoogleSyncModalOpen(true);
          throw new Error("Sessione Google scaduta o non valida. Ricollega il tuo account Google.");
        }
        throw new Error(data.error || "Errore durante la scrittura su Google Sheets.");
      }

      const now = new Date().toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit", second: "2-digit" });
      setLastGoogleSyncTime(now);
      setSuccessMessage(data.message || `Sincronizzazione su Google Sheets completata con successo alle ${now}!`);
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err.message || "Impossibile sincronizzare su Google Sheets.");
    } finally {
      setIsPushingToGoogle(false);
    }
  };

  const triggerAutoSyncToGoogle = () => {
    // Debounced or direct push in background
    setTimeout(() => {
      executePushToGoogle();
    }, 500);
  };

  const handleConnectGoogle = async () => {
    setErrorMessage(null);
    try {
      // Primary: Use Firebase Auth popup with Google provider
      const authResult = await googleSignIn();
      if (authResult?.accessToken) {
        setGoogleAccessToken(authResult.accessToken);
        setSuccessMessage("Account Google collegato con successo! Invio modifiche in corso...");
        await executePushToGoogle(authResult.accessToken);
        return;
      }
    } catch (firebaseErr: any) {
      console.warn("Firebase Auth signInWithPopup failed, falling back to GIS:", firebaseErr);
      
      // Fallback: Use Google Identity Services with correct client ID
      if (typeof window !== "undefined" && window.google?.accounts?.oauth2) {
        const clientId = googleClientId || OAUTH_CLIENT_ID || "1018634937062-kjimrgdnqe72s4nbot182s8c6ck2ak8q.apps.googleusercontent.com";
        try {
          const tokenClient = window.google.accounts.oauth2.initTokenClient({
            client_id: clientId,
            scope: "https://www.googleapis.com/auth/spreadsheets https://www.googleapis.com/auth/drive.file",
            callback: async (tokenResponse: any) => {
              if (tokenResponse.error) {
                console.error("GIS Error:", tokenResponse);
                setErrorMessage(`Errore autorizzazione Google: ${tokenResponse.error_description || tokenResponse.error}`);
                return;
              }
              if (tokenResponse.access_token) {
                setGoogleAccessToken(tokenResponse.access_token);
                localStorage.setItem("google_sheets_access_token", tokenResponse.access_token);
                setSuccessMessage("Account Google collegato con successo! Invio modifiche in corso...");
                await executePushToGoogle(tokenResponse.access_token);
              }
            },
          });
          tokenClient.requestAccessToken({ prompt: "consent" });
          return;
        } catch (gisErr: any) {
          setErrorMessage(`Errore accesso Google: ${gisErr.message || firebaseErr.message}`);
          return;
        }
      }
      setErrorMessage(`Errore durante l'accesso Google: ${firebaseErr.message || "Autenticazione non completata"}`);
    }
  };

  const handleToggleAutoSync = () => {
    const next = !autoSyncToGoogle;
    setAutoSyncToGoogle(next);
    localStorage.setItem("excel_auto_sync_google", String(next));
    if (next && googleAccessToken) {
      executePushToGoogle();
    }
  };

  // Sync with Candidature and CDA
  const handleSyncWithCdaAndCandidature = async () => {
    setIsSyncing(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/excel-gerarchia/sync", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore durante la sincronizzazione.");
      }
      if (Array.isArray(data.entries) && data.entries.length > 0) {
        setEntries(data.entries);
      } else {
        await fetchEntries(false);
      }
      setSuccessMessage(data.message || "Foglio Gerarchia sincronizzato con successo con Google Sheet e delibere CDA!");
      if (onRefreshNeeded) onRefreshNeeded();
      setTimeout(() => setSuccessMessage(null), 5000);
    } catch (err: any) {
      setErrorMessage(err.message || "Errore durante la sincronizzazione automatica.");
    } finally {
      setIsSyncing(false);
    }
  };

  // Reset & Re-sync from Google Sheet Official 36 Members Seed
  const handleResetFromOfficialSheet = async () => {
    if (!window.confirm("Vuoi ripristinare tutti i 36 membri registrati nel Google Sheet ufficiale mantenendo le promozioni aggiornate?")) {
      return;
    }
    setIsResetting(true);
    setErrorMessage(null);
    setSuccessMessage(null);
    try {
      const response = await fetch("/api/admin/excel-gerarchia/reset-from-sheet", {
        method: "POST",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore durante il ripristino.");
      }
      if (Array.isArray(data.entries) && data.entries.length > 0) {
        setEntries(data.entries);
      } else {
        await fetchEntries(false);
      }
      setSuccessMessage(data.message || "Tutti i 36 membri del foglio ufficiale sono stati ripristinati e sincronizzati!");
      if (onRefreshNeeded) onRefreshNeeded();
      setTimeout(() => setSuccessMessage(null), 6000);
    } catch (err: any) {
      setErrorMessage(err.message || "Errore durante il ripristino dal foglio ufficiale.");
    } finally {
      setIsResetting(false);
    }
  };

  // Open modal for new entry
  const handleOpenAddModal = () => {
    setEditingEntry(null);
    setFormFullName("");
    setFormCurrentRole("Primario");
    setFormNewRole("");
    setFormCdaRole("");
    setFormDgsRole("");
    setFormLeaveStatus("");
    setFormStatus("CONFERMATO");
    setFormNotes("");
    setFormCustomFields({});
    setIsModalOpen(true);
  };

  // Open modal for editing entry
  const handleOpenEditModal = (entry: ExcelGerarchiaEntry) => {
    setEditingEntry(entry);
    setFormFullName(entry.fullName);
    setFormCurrentRole(entry.currentRole || "");
    setFormNewRole(entry.newRole || "");
    setFormCdaRole(entry.cdaRole || "");
    setFormDgsRole(entry.dgsRole || "");
    setFormLeaveStatus(entry.leaveStatus || "");
    setFormStatus(entry.status || "CONFERMATO");
    setFormNotes(entry.notes || "");
    setFormCustomFields(entry.customFields || {});
    setIsModalOpen(true);
  };

  // Save entry (Create or Update)
  const handleSaveEntry = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!formFullName.trim()) return;

    setIsSaving(true);
    setErrorMessage(null);
    try {
      const url = editingEntry
        ? `/api/admin/excel-gerarchia/${editingEntry.id}`
        : "/api/admin/excel-gerarchia";
      const method = editingEntry ? "PUT" : "POST";

      const response = await fetch(url, {
        method,
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${authToken}`,
        },
        body: JSON.stringify({
          fullName: formFullName.trim(),
          currentRole: formCurrentRole.trim(),
          newRole: formNewRole.trim(),
          cdaRole: formCdaRole.trim(),
          dgsRole: formDgsRole.trim(),
          leaveStatus: formLeaveStatus.trim(),
          status: formStatus,
          notes: formNotes.trim(),
          customFields: formCustomFields,
        }),
      });

      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore nel salvataggio della voce.");
      }

      setSuccessMessage(data.message || "Riga salvata con successo.");
      setIsModalOpen(false);
      await fetchEntries(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Errore durante il salvataggio.");
    } finally {
      setIsSaving(false);
    }
  };

  // Delete entry
  const handleDeleteEntry = async () => {
    if (!entryToDelete) return;
    setIsDeleting(true);
    setErrorMessage(null);
    try {
      const response = await fetch(`/api/admin/excel-gerarchia/${entryToDelete.id}`, {
        method: "DELETE",
        headers: {
          Authorization: `Bearer ${authToken}`,
        },
      });
      const data = await response.json();
      if (!response.ok) {
        throw new Error(data.error || "Errore durante l'eliminazione.");
      }
      setSuccessMessage(data.message || "Riga eliminata con successo.");
      setEntryToDelete(null);
      await fetchEntries(false);
      setTimeout(() => setSuccessMessage(null), 4000);
    } catch (err: any) {
      setErrorMessage(err.message || "Errore durante l'eliminazione.");
    } finally {
      setIsDeleting(false);
    }
  };

  // Export CSV
  const handleExportCsv = () => {
    window.location.href = `/api/admin/excel-gerarchia/export?token=${encodeURIComponent(authToken)}`;
  };

  // Helper to render badges with responsive compact styling
  const isFit = densityMode === "fit";

  const renderCdaBadge = (cda?: string) => {
    if (!cda || !cda.trim()) return null;
    const c = cda.trim();
    if (c.includes("Presidente CDA") && !c.includes("V.")) {
      return (
        <span
          title={c}
          className={`${
            isFit ? "px-1.5 py-0.5 text-[9.5px] sm:text-[10px]" : "px-2 py-0.5 text-[10px] sm:text-[11px]"
          } rounded-md font-black bg-amber-400 text-slate-950 border border-amber-300 shadow-xs inline-flex items-center gap-1 max-w-full`}
        >
          <Award size={isFit ? 9 : 10} className="shrink-0" />
          <span className="truncate">{c}</span>
        </span>
      );
    }
    if (c.includes("V. Presidente") || c.includes("Segretario")) {
      return (
        <span
          title={c}
          className={`${
            isFit ? "px-1.5 py-0.5 text-[9.5px] sm:text-[10px]" : "px-2 py-0.5 text-[10px] sm:text-[11px]"
          } rounded-md font-bold bg-amber-400/25 text-amber-200 border border-amber-400/50 inline-flex items-center gap-1 max-w-full`}
        >
          <Award size={isFit ? 9 : 10} className="shrink-0 text-amber-400" />
          <span className="truncate">{c}</span>
        </span>
      );
    }
    return (
      <span
        title={c}
        className={`${
          isFit ? "px-1 py-0.5 text-[9.5px] sm:text-[10px]" : "px-1.5 py-0.5 text-[10px] sm:text-[11px]"
        } rounded font-bold bg-yellow-500/20 text-yellow-300 border border-yellow-500/40 inline-flex items-center gap-1 max-w-full`}
      >
        <span className="truncate">{c}</span>
      </span>
    );
  };

  const renderDgsBadge = (dgs?: string) => {
    if (!dgs || !dgs.trim()) return null;
    const d = dgs.trim();
    return (
      <span
        title={d}
        className={`${
          isFit ? "px-1.5 py-0.5 text-[9.5px] sm:text-[10px]" : "px-2 py-0.5 text-[10px] sm:text-[11px]"
        } rounded-md font-extrabold bg-[#3b0811] text-rose-200 border border-rose-700/60 inline-flex items-center gap-1 max-w-full`}
      >
        <Shield size={isFit ? 9 : 10} className="shrink-0 text-rose-400" />
        <span className="truncate">{d}</span>
      </span>
    );
  };

  const renderLeaveBadge = (status?: string) => {
    if (!status || !status.trim()) return null;
    const s = status.trim().toUpperCase();
    if (s === "FERIE") {
      return (
        <span
          title="Ferie"
          className={`${
            isFit ? "px-1.5 py-0.5 text-[9px] sm:text-[9.5px]" : "px-2 py-0.5 text-[10px]"
          } rounded-md font-black bg-rose-600/30 text-rose-300 border border-rose-500/60 tracking-wider inline-flex items-center gap-1 max-w-full`}
        >
          <Calendar size={isFit ? 9 : 10} className="shrink-0" />
          <span className="truncate">FERIE</span>
        </span>
      );
    }
    if (s.includes("ASSENTE DA TEMPO")) {
      return (
        <span
          title="Assente da tempo"
          className={`${
            isFit ? "px-1.5 py-0.5 text-[8.5px] sm:text-[9px]" : "px-2 py-0.5 text-[9px]"
          } rounded-md font-black bg-amber-600/25 text-amber-300 border border-amber-500/60 tracking-wider inline-flex items-center gap-1 max-w-full`}
        >
          <Clock size={isFit ? 9 : 10} className="shrink-0" />
          <span className="truncate">ASSENTE</span>
        </span>
      );
    }
    if (s.includes("FERIE NON")) {
      return (
        <span
          title="Ferie non dichiarate"
          className={`${
            isFit ? "px-1.5 py-0.5 text-[8.5px] sm:text-[9px]" : "px-2 py-0.5 text-[9px]"
          } rounded-md font-black bg-red-700/40 text-red-200 border border-red-500/70 tracking-wider inline-flex items-center gap-1 max-w-full`}
        >
          <AlertCircle size={isFit ? 9 : 10} className="shrink-0" />
          <span className="truncate">FERIE N.D.</span>
        </span>
      );
    }
    if (s.includes("ASPETTATIVA")) {
      return (
        <span
          title="Aspettativa"
          className={`${
            isFit ? "px-1.5 py-0.5 text-[9px] sm:text-[9.5px]" : "px-2 py-0.5 text-[10px]"
          } rounded-md font-black bg-pink-700/30 text-pink-200 border border-pink-500/60 tracking-wider inline-flex items-center gap-1 max-w-full`}
        >
          <span className="truncate">ASPETTAT.</span>
        </span>
      );
    }
    if (s.includes("DEVE SVEGLIARSI")) {
      return (
        <span
          title="Deve svegliarsi"
          className={`${
            isFit ? "px-1.5 py-0.5 text-[8.5px] sm:text-[9px]" : "px-2 py-0.5 text-[9px]"
          } rounded-md font-black bg-yellow-500/25 text-yellow-300 border border-yellow-500/60 tracking-wider inline-flex items-center gap-1 animate-pulse max-w-full`}
        >
          <AlertTriangle size={isFit ? 9 : 10} className="shrink-0" />
          <span className="truncate">SVEGLIARSI</span>
        </span>
      );
    }
    return (
      <span
        title={status}
        className={`${
          isFit ? "px-1.5 py-0.5 text-[9.5px]" : "px-2 py-0.5 text-[10px]"
        } rounded font-bold bg-slate-800 text-slate-300 border border-slate-700 inline-flex items-center gap-1 max-w-full`}
      >
        <span className="truncate">{status}</span>
      </span>
    );
  };

  const renderNewRoleBadge = (newRole?: string) => {
    if (!newRole || !newRole.trim()) {
      return <span className="text-slate-600 text-xs italic">-</span>;
    }
    const r = newRole.trim();
    if (r.toUpperCase() === "LICENZIAMENTO") {
      return (
        <span
          title="Licenziamento"
          className={`${
            isFit ? "px-1.5 py-0.5 text-[9.5px] sm:text-[10px]" : "px-2.5 py-0.5 text-[11px]"
          } rounded-md font-black bg-red-600 text-white border border-red-400 shadow-md shadow-red-950/60 animate-pulse tracking-wide inline-flex items-center gap-1 max-w-full`}
        >
          <AlertTriangle size={isFit ? 9 : 11} className="shrink-0" />
          <span className="truncate">LICENZIAMENTO</span>
        </span>
      );
    }

    const style = getRoleBadgeStyle(r);
    return (
      <div className="inline-flex items-center gap-1 max-w-full">
        <span
          title={`Nuovo Grado: ${r}`}
          className={`${
            isFit ? "px-1.5 py-0.5 text-[9.5px] sm:text-[10.5px]" : "px-2.5 py-0.5 text-[11px]"
          } rounded-md font-bold shadow-xs inline-flex items-center gap-1 border max-w-full ${style.className}`}
          style={style.style}
        >
          <ArrowRight size={isFit ? 9 : 10} className="text-emerald-400 shrink-0" />
          <span className="truncate">{r}</span>
        </span>
      </div>
    );
  };

  // Visible columns list sorted by order
  const visibleColumns = useMemo(() => {
    return [...columns].filter((c) => c.visible).sort((a, b) => a.order - b.order);
  }, [columns]);

  // Filtered entries
  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      // Search term across all fields including custom fields
      const matchesSearch =
        !searchTerm.trim() ||
        entry.fullName.toLowerCase().includes(searchTerm.toLowerCase()) ||
        entry.currentRole.toLowerCase().includes(searchTerm.toLowerCase()) ||
        (entry.newRole && entry.newRole.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (entry.cdaRole && entry.cdaRole.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (entry.dgsRole && entry.dgsRole.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (entry.leaveStatus && entry.leaveStatus.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (entry.notes && entry.notes.toLowerCase().includes(searchTerm.toLowerCase())) ||
        (entry.customFields &&
          Object.values(entry.customFields).some((v) =>
            typeof v === "string" && v.toLowerCase().includes(searchTerm.toLowerCase())
          ));

      if (!matchesSearch) return false;

      // Status filter
      if (statusFilter === "ALL") return true;
      if (statusFilter === "PROMOTED_ONLY") {
        return entry.newRole && entry.newRole.trim() !== "" && entry.newRole !== entry.currentRole;
      }
      if (statusFilter === "CDA_MEMBERS") {
        return Boolean(entry.cdaRole && entry.cdaRole.trim() !== "");
      }
      if (statusFilter === "DGS_MEMBERS") {
        return Boolean(entry.dgsRole && entry.dgsRole.trim() !== "");
      }
      if (statusFilter === "LEAVE_ABSENCE") {
        return Boolean(entry.leaveStatus && entry.leaveStatus.trim() !== "");
      }
      if (statusFilter === "IN_VOTAZIONE") {
        return entry.status === "IN_VOTAZIONE_CDA" || entry.status === "IN_VALUTAZIONE";
      }
      if (statusFilter === "CONFERMATO") {
        return entry.status === "CONFERMATO";
      }
      return true;
    });
  }, [entries, searchTerm, statusFilter]);

  // Statistics
  const promotedCount = entries.filter((e) => e.newRole && e.newRole.trim() !== "" && e.newRole !== e.currentRole).length;
  const cdaCount = entries.filter((e) => e.cdaRole && e.cdaRole.trim() !== "").length;
  const dgsCount = entries.filter((e) => e.dgsRole && e.dgsRole.trim() !== "").length;
  const leaveCount = entries.filter((e) => e.leaveStatus && e.leaveStatus.trim() !== "").length;
  const inVotingCount = entries.filter((e) => e.status === "IN_VOTAZIONE_CDA" || e.status === "IN_VALUTAZIONE").length;

  // Toggle all columns on or reset to default
  const handleShowAllColumns = async () => {
    const updated = columns.map((c) => ({ ...c, visible: true }));
    setColumns(updated);
    await saveColumnsConfig(updated);
  };

  // Render cell content and interactive inline input
  const renderCell = (entry: ExcelGerarchiaEntry, col: ExcelColumnDef, idx: number) => {
    const isEditing = editingCell?.rowId === entry.id && editingCell?.field === col.key;
    const isJustSaved = savedCellIndicator?.rowId === entry.id && savedCellIndicator?.field === col.key;

    // Value resolution
    let val = "";
    if (col.key === "orderNumber") val = String(entry.orderNumber || idx + 1);
    else if (col.key === "fullName") val = entry.fullName || "";
    else if (col.key === "currentRole") val = entry.currentRole || "";
    else if (col.key === "newRole") val = entry.newRole || "";
    else if (col.key === "cdaRole") val = entry.cdaRole || "";
    else if (col.key === "dgsRole") val = entry.dgsRole || "";
    else if (col.key === "leaveStatus") val = entry.leaveStatus || "";
    else if (col.key === "notes") val = entry.notes || entry.sourceDetails || "";
    else if (col.key === "status") val = entry.status || "CONFERMATO";
    else if (entry.customFields && entry.customFields[col.key]) {
      val = entry.customFields[col.key];
    }

    if (isEditing) {
      return (
        <div className="flex items-center gap-1 min-w-[130px]">
          {col.key === "currentRole" || col.key === "newRole" ? (
            <div className="relative w-full">
              <input
                type="text"
                list={`list-${col.key}`}
                autoFocus
                value={cellValue}
                onChange={(e) => setCellValue(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") handleSaveCell(entry.id, col.key);
                  if (e.key === "Escape") handleCancelCellEdit();
                }}
                className="w-full bg-[#0A0A0B] border border-emerald-400 rounded-md px-2 py-0.5 text-xs text-white focus:outline-hidden"
              />
              <datalist id={`list-${col.key}`}>
                {COMMON_ROLE_OPTIONS.map((r) => (
                  <option key={r} value={r} />
                ))}
              </datalist>
            </div>
          ) : col.key === "cdaRole" ? (
            <select
              autoFocus
              value={cellValue}
              onChange={(e) => setCellValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveCell(entry.id, col.key);
                if (e.key === "Escape") handleCancelCellEdit();
              }}
              className="w-full bg-[#0A0A0B] border border-amber-400 rounded-md px-1.5 py-0.5 text-xs text-amber-200 focus:outline-hidden"
            >
              {COMMON_CDA_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o || "- Nessun Ruolo CDA -"}
                </option>
              ))}
            </select>
          ) : col.key === "dgsRole" ? (
            <select
              autoFocus
              value={cellValue}
              onChange={(e) => setCellValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveCell(entry.id, col.key);
                if (e.key === "Escape") handleCancelCellEdit();
              }}
              className="w-full bg-[#0A0A0B] border border-rose-400 rounded-md px-1.5 py-0.5 text-xs text-rose-200 focus:outline-hidden"
            >
              {COMMON_DGS_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o || "- Nessun Ruolo DGS -"}
                </option>
              ))}
            </select>
          ) : col.key === "leaveStatus" ? (
            <select
              autoFocus
              value={cellValue}
              onChange={(e) => setCellValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveCell(entry.id, col.key);
                if (e.key === "Escape") handleCancelCellEdit();
              }}
              className="w-full bg-[#0A0A0B] border border-pink-400 rounded-md px-1.5 py-0.5 text-xs text-pink-200 focus:outline-hidden"
            >
              {COMMON_LEAVE_OPTIONS.map((o) => (
                <option key={o} value={o}>
                  {o || "- In Servizio (Nessuna Assenza) -"}
                </option>
              ))}
            </select>
          ) : (
            <input
              type="text"
              autoFocus
              value={cellValue}
              onChange={(e) => setCellValue(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleSaveCell(entry.id, col.key);
                if (e.key === "Escape") handleCancelCellEdit();
              }}
              className="w-full bg-[#0A0A0B] border border-emerald-400 rounded-md px-2 py-0.5 text-xs text-white focus:outline-hidden"
            />
          )}

          <button
            type="button"
            onClick={() => handleSaveCell(entry.id, col.key)}
            className="p-1 bg-emerald-600 hover:bg-emerald-500 text-white rounded cursor-pointer shrink-0"
            title="Salva modifica"
          >
            <Check size={11} />
          </button>
          <button
            type="button"
            onClick={handleCancelCellEdit}
            className="p-1 bg-white/10 hover:bg-white/20 text-slate-300 rounded cursor-pointer shrink-0"
            title="Annulla"
          >
            <X size={11} />
          </button>
        </div>
      );
    }

    // Static View / Badge with Quick Edit on Double Click or Hover
    if (col.key === "orderNumber") {
      const isFirst = idx === 0;
      const isLast = idx === entries.length - 1;
      return (
        <div className="flex items-center justify-center gap-1 group/order py-0.5">
          <div
            className="cursor-grab active:cursor-grabbing p-0.5 text-slate-500 hover:text-emerald-400 rounded flex items-center justify-center transition-colors"
            title="Trascina per spostare la riga"
          >
            <GripVertical size={isFit ? 12 : 14} className="shrink-0 opacity-60 group-hover/order:opacity-100" />
          </div>
          <span className={`text-slate-400 font-mono ${isFit ? "text-[10px]" : "text-[11px]"} text-center font-bold min-w-[14px]`}>
            {val}
          </span>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/order:opacity-100 transition-opacity">
            <button
              type="button"
              disabled={isFirst}
              onClick={(e) => {
                e.stopPropagation();
                handleMoveRow(entry.id, "up");
              }}
              className="p-0.5 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/20 rounded disabled:opacity-20 disabled:hover:text-slate-400 disabled:hover:bg-transparent cursor-pointer transition-colors"
              title="Sposta riga su"
            >
              <ChevronUp size={isFit ? 11 : 12} />
            </button>
            <button
              type="button"
              disabled={isLast}
              onClick={(e) => {
                e.stopPropagation();
                handleMoveRow(entry.id, "down");
              }}
              className="p-0.5 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/20 rounded disabled:opacity-20 disabled:hover:text-slate-400 disabled:hover:bg-transparent cursor-pointer transition-colors"
              title="Sposta riga giù"
            >
              <ChevronDown size={isFit ? 11 : 12} />
            </button>
          </div>
        </div>
      );
    }

    if (col.key === "fullName") {
      return (
        <div
          onDoubleClick={() => handleStartCellEdit(entry.id, col.key, val)}
          className={`flex items-center justify-between group/cell cursor-pointer hover:bg-emerald-500/10 ${
            isFit ? "p-0.5" : "p-1"
          } rounded-md transition-colors gap-1 min-w-0`}
          title={`${entry.fullName} (Fai doppio clic per modificare)`}
        >
          <div className="flex items-center gap-1.5 min-w-0 flex-1">
            <div
              className={`${
                isFit ? "w-5 h-5 text-[10px]" : "w-6 h-6 text-[11px]"
              } rounded-md bg-emerald-500/10 border border-emerald-500/30 flex items-center justify-center text-emerald-400 font-black shrink-0`}
            >
              {entry.fullName.charAt(0).toUpperCase()}
            </div>
            <div className="min-w-0 flex-1">
              <span
                className={`block font-bold text-white truncate ${
                  isFit ? "text-[11px] max-w-full" : "text-xs max-w-[130px] lg:max-w-[160px]"
                }`}
                title={entry.fullName}
              >
                {entry.fullName}
              </span>
              {entry.discordTag && !isFit && (
                <span className="text-2xs text-slate-500 font-mono block truncate max-w-[120px]">
                  {entry.discordTag}
                </span>
              )}
            </div>
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0">
            {isJustSaved && <CheckCircle2 size={12} className="text-emerald-400 animate-bounce" />}
            <button
              type="button"
              onClick={() => handleStartCellEdit(entry.id, col.key, val)}
              className="p-0.5 text-slate-400 hover:text-emerald-300 cursor-pointer"
            >
              <Edit2 size={10} />
            </button>
          </div>
        </div>
      );
    }

    if (col.key === "currentRole") {
      const currentStyle = getRoleBadgeStyle(entry.currentRole || "");
      return (
        <div
          onDoubleClick={() => handleStartCellEdit(entry.id, col.key, val)}
          className="flex items-center justify-between group/cell cursor-pointer hover:bg-emerald-500/10 p-0.5 rounded-md transition-colors gap-1 min-w-0"
          title={`Ruolo Attuale: ${entry.currentRole || "Nessuno"} (Fai doppio clic per modificare)`}
        >
          <div className="min-w-0 flex-1">
            {entry.currentRole ? (
              <span
                className={`${
                  isFit ? "px-1.5 py-0.5 text-[9.5px] sm:text-[10px]" : "px-2 py-0.5 text-[11px]"
                } font-bold inline-block truncate max-w-full rounded-md ${currentStyle.className}`}
                style={currentStyle.style}
                title={entry.currentRole}
              >
                {entry.currentRole}
              </span>
            ) : (
              <span className="text-slate-600 text-xs italic">-</span>
            )}
          </div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0">
            {isJustSaved && <CheckCircle2 size={12} className="text-emerald-400 animate-bounce" />}
            <button
              type="button"
              onClick={() => handleStartCellEdit(entry.id, col.key, val)}
              className="p-0.5 text-slate-400 hover:text-emerald-300 cursor-pointer"
            >
              <Edit2 size={10} />
            </button>
          </div>
        </div>
      );
    }

    if (col.key === "newRole") {
      return (
        <div
          onDoubleClick={() => handleStartCellEdit(entry.id, col.key, val)}
          className="flex items-center justify-between group/cell cursor-pointer hover:bg-emerald-500/10 p-0.5 rounded-md transition-colors gap-1 min-w-0"
          title={`Nuovo Grado: ${entry.newRole || "Nessuno"} (Fai doppio clic per modificare)`}
        >
          <div className="min-w-0 flex-1">{renderNewRoleBadge(entry.newRole)}</div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0">
            {isJustSaved && <CheckCircle2 size={12} className="text-emerald-400 animate-bounce" />}
            <button
              type="button"
              onClick={() => handleStartCellEdit(entry.id, col.key, val)}
              className="p-0.5 text-slate-400 hover:text-emerald-300 cursor-pointer"
            >
              <Edit2 size={10} />
            </button>
          </div>
        </div>
      );
    }

    if (col.key === "cdaRole") {
      return (
        <div
          onDoubleClick={() => handleStartCellEdit(entry.id, col.key, val)}
          className="flex items-center justify-between group/cell cursor-pointer hover:bg-amber-500/10 p-0.5 rounded-md transition-colors gap-1 min-w-0"
          title={`CDA: ${entry.cdaRole || "Nessuno"} (Fai doppio clic per modificare)`}
        >
          <div className="min-w-0 flex-1">{renderCdaBadge(entry.cdaRole) || <span className="text-slate-700 text-xs italic">-</span>}</div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0">
            {isJustSaved && <CheckCircle2 size={12} className="text-emerald-400 animate-bounce" />}
            <button
              type="button"
              onClick={() => handleStartCellEdit(entry.id, col.key, val)}
              className="p-0.5 text-slate-400 hover:text-amber-300 cursor-pointer"
            >
              <Edit2 size={10} />
            </button>
          </div>
        </div>
      );
    }

    if (col.key === "dgsRole") {
      return (
        <div
          onDoubleClick={() => handleStartCellEdit(entry.id, col.key, val)}
          className="flex items-center justify-between group/cell cursor-pointer hover:bg-rose-500/10 p-0.5 rounded-md transition-colors gap-1 min-w-0"
          title={`DGS: ${entry.dgsRole || "Nessuno"} (Fai doppio clic per modificare)`}
        >
          <div className="min-w-0 flex-1">{renderDgsBadge(entry.dgsRole) || <span className="text-slate-700 text-xs italic">-</span>}</div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0">
            {isJustSaved && <CheckCircle2 size={12} className="text-emerald-400 animate-bounce" />}
            <button
              type="button"
              onClick={() => handleStartCellEdit(entry.id, col.key, val)}
              className="p-0.5 text-slate-400 hover:text-rose-300 cursor-pointer"
            >
              <Edit2 size={10} />
            </button>
          </div>
        </div>
      );
    }

    if (col.key === "leaveStatus") {
      return (
        <div
          onDoubleClick={() => handleStartCellEdit(entry.id, col.key, val)}
          className="flex items-center justify-between group/cell cursor-pointer hover:bg-pink-500/10 p-0.5 rounded-md transition-colors gap-1 min-w-0"
          title={`Assenze / Ferie: ${entry.leaveStatus || "In Servizio"} (Fai doppio clic per modificare)`}
        >
          <div className="min-w-0 flex-1">{renderLeaveBadge(entry.leaveStatus) || <span className="text-slate-700 text-xs italic">-</span>}</div>
          <div className="flex items-center gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0">
            {isJustSaved && <CheckCircle2 size={12} className="text-emerald-400 animate-bounce" />}
            <button
              type="button"
              onClick={() => handleStartCellEdit(entry.id, col.key, val)}
              className="p-0.5 text-slate-400 hover:text-pink-300 cursor-pointer"
            >
              <Edit2 size={10} />
            </button>
          </div>
        </div>
      );
    }

    // Default & Custom Fields rendering (Notes, etc.)
    return (
      <div
        onDoubleClick={() => handleStartCellEdit(entry.id, col.key, val)}
        className={`flex items-center justify-between group/cell cursor-pointer hover:bg-white/5 p-0.5 rounded-md transition-colors gap-1 min-w-0`}
        title={val ? `${val} (Doppio clic per modificare)` : "Doppio clic per modificare"}
      >
        <span
          className={`text-slate-200 font-medium truncate ${
            isFit ? "text-[10px] sm:text-[11px] max-w-full" : "text-xs max-w-[130px] lg:max-w-[180px]"
          }`}
        >
          {val || <span className="text-slate-700 italic">-</span>}
        </span>
        <div className="flex items-center gap-0.5 opacity-0 group-hover/cell:opacity-100 transition-opacity shrink-0">
          {isJustSaved && <CheckCircle2 size={12} className="text-emerald-400 animate-bounce" />}
          <button
            type="button"
            onClick={() => handleStartCellEdit(entry.id, col.key, val)}
            className="p-0.5 text-slate-400 hover:text-emerald-300 cursor-pointer"
          >
            <Edit2 size={10} />
          </button>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6 animate-fadeIn pb-12">
      {/* Header Banner - Excel Theme (Emerald Green & Gold) */}
      <div className="bg-gradient-to-r from-emerald-950/90 via-[#0d2e1c] to-[#0a2014] border border-emerald-500/30 rounded-3xl p-6 lg:p-7 shadow-2xl relative overflow-hidden">
        <div className="absolute top-0 right-0 w-96 h-96 bg-emerald-500/10 rounded-full blur-3xl pointer-events-none -mr-20 -mt-20" />
        <div className="absolute bottom-0 right-1/3 w-64 h-64 bg-amber-500/10 rounded-full blur-2xl pointer-events-none" />

        <div className="relative z-10 flex flex-col lg:flex-row lg:items-center justify-between gap-6">
          <div className="space-y-2.5">
            <div className="inline-flex items-center gap-2 px-3 py-1 rounded-full bg-emerald-500/20 border border-emerald-400/40 text-emerald-300 text-xs font-bold tracking-wide uppercase">
              <FileSpreadsheet size={14} className="text-emerald-400" />
              <span>Registro Ufficiale Dinamico</span>
              <span className="w-2 h-2 rounded-full bg-emerald-400 animate-ping" />
            </div>

            <h1 className="text-2xl lg:text-3xl font-black text-white tracking-tight flex flex-wrap items-center gap-3">
              <span>Excel Gerarchia EMS</span>
              <span className="text-2xs bg-emerald-500 text-slate-950 font-black px-2.5 py-0.5 rounded-full shadow-xs">
                DIRETTORE GENERALE
              </span>
            </h1>

            <p className="text-slate-300/90 text-xs lg:text-sm max-w-2xl leading-relaxed">
              Gestisci il personale, riordina le righe, modifica ruoli con doppio clic e sincronizza i dati in tempo reale con Google Sheets.
            </p>
          </div>

          {/* Primary Quick Actions */}
          <div className="flex flex-wrap items-center gap-3 shrink-0">
            <button
              type="button"
              onClick={handleOpenAddModal}
              className="h-10 px-5 bg-gradient-to-r from-emerald-500 to-teal-500 hover:from-emerald-400 hover:to-teal-400 text-slate-950 text-xs font-black rounded-xl flex items-center gap-2 transition-all shadow-lg shadow-emerald-950/40 cursor-pointer active:scale-98"
            >
              <Plus size={16} className="text-slate-950" />
              <span>Nuovo Membro</span>
            </button>
          </div>
        </div>

        {/* Cohesive Secondary Toolbar Strip */}
        <div className="relative z-10 mt-6 pt-5 border-t border-emerald-500/20 flex flex-wrap items-center justify-between gap-3 text-xs">
          {/* Google Sheets Sync Suite */}
          <div className="flex flex-wrap items-center gap-2 bg-[#091a11]/90 p-1.5 rounded-2xl border border-emerald-500/30 shadow-inner">
            <div className="px-2.5 py-1 text-2xs font-bold text-emerald-400/90 flex items-center gap-1.5 uppercase tracking-wider">
              <CloudUpload size={13} />
              <span>Google Cloud</span>
            </div>

            <button
              type="button"
              onClick={() => executePushToGoogle()}
              disabled={isPushingToGoogle}
              className="h-8 px-3.5 bg-emerald-600 hover:bg-emerald-500 text-white font-bold rounded-xl flex items-center gap-1.5 transition-all shadow-xs cursor-pointer disabled:opacity-50"
              title="Scrivi e aggiorna tutte le righe direttamente sul tuo Google Sheet online"
            >
              <CloudUpload size={13} className={isPushingToGoogle ? "animate-bounce text-emerald-200" : ""} />
              <span>{isPushingToGoogle ? "In invio..." : "Invia a Google Sheet"}</span>
            </button>

            <button
              type="button"
              onClick={handleToggleAutoSync}
              className={`h-8 px-3 rounded-xl transition-all cursor-pointer font-semibold flex items-center gap-1.5 border ${
                autoSyncToGoogle
                  ? "bg-emerald-500/20 text-emerald-300 border-emerald-400/40 shadow-xs"
                  : "bg-white/5 text-slate-400 hover:text-slate-200 border-white/10 hover:bg-white/10"
              }`}
              title="Attiva o disattiva la sincronizzazione automatica a ogni modifica"
            >
              <Radio size={11} className={autoSyncToGoogle ? "text-emerald-400 animate-pulse" : "text-slate-500"} />
              <span>Auto-Sync: <strong className={autoSyncToGoogle ? "text-emerald-300" : "text-slate-400"}>{autoSyncToGoogle ? "ON" : "OFF"}</strong></span>
            </button>

            <button
              type="button"
              onClick={() => setIsGoogleSyncModalOpen(true)}
              className="h-8 px-2.5 text-slate-400 hover:text-emerald-300 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
              title="Configurazione Google Sheets e autorizzazioni"
            >
              <SlidersHorizontal size={13} />
            </button>
          </div>

          {/* Table Tools Suite */}
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={() => setIsColumnManagerOpen(true)}
              className="h-9 px-3.5 bg-[#12281b] hover:bg-[#183524] border border-emerald-500/30 hover:border-emerald-400/50 text-emerald-200 font-bold rounded-xl flex items-center gap-2 transition-all shadow-xs cursor-pointer"
              title="Aggiungi, rinomina, elimina o riordina colonne"
            >
              <SlidersHorizontal size={13} className="text-emerald-400" />
              <span>Gestione Colonne</span>
              <span className="px-1.5 py-0.5 bg-emerald-500/20 text-emerald-300 text-2xs rounded-md border border-emerald-500/30">
                {visibleColumns.length}
              </span>
            </button>

            <button
              type="button"
              onClick={handleSyncWithCdaAndCandidature}
              disabled={isSyncing}
              className="h-9 px-3.5 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Sincronizza ruoli e promozioni da candidature e CDA"
            >
              <RefreshCw size={13} className={isSyncing ? "animate-spin text-emerald-400" : "text-slate-400"} />
              <span>{isSyncing ? "Sincronizzo..." : "Sincronizza"}</span>
            </button>

            <button
              type="button"
              onClick={handleExportCsv}
              className="h-9 px-3 bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white font-semibold rounded-xl flex items-center gap-1.5 transition-all cursor-pointer"
              title="Esporta la gerarchia attuale in formato CSV"
            >
              <Download size={13} className="text-slate-400" />
              <span>Esporta CSV</span>
            </button>

            <button
              type="button"
              onClick={handleResetFromOfficialSheet}
              disabled={isResetting}
              className="h-9 px-3 bg-white/5 hover:bg-amber-500/20 border border-white/10 hover:border-amber-500/30 text-slate-400 hover:text-amber-300 text-xs font-medium rounded-xl flex items-center gap-1.5 transition-all cursor-pointer disabled:opacity-50"
              title="Ripristina i 36 membri originali dal foglio ufficiale Google Sheet"
            >
              <RotateCcw size={13} className={isResetting ? "animate-spin text-amber-400" : "text-slate-400"} />
              <span>Ripristina 36</span>
            </button>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {errorMessage && (
        <div className="p-4 bg-rose-500/10 border border-rose-500/30 rounded-2xl flex items-center gap-3 text-rose-300 text-xs">
          <AlertCircle size={18} className="shrink-0" />
          <span>{errorMessage}</span>
          <button
            type="button"
            onClick={() => setErrorMessage(null)}
            className="ml-auto text-slate-400 hover:text-white"
          >
            ✕
          </button>
        </div>
      )}

      {successMessage && (
        <div className="p-4 bg-emerald-500/10 border border-emerald-500/30 rounded-2xl flex items-center gap-3 text-emerald-300 text-xs animate-fadeIn">
          <CheckCircle2 size={18} className="shrink-0" />
          <span>{successMessage}</span>
        </div>
      )}

      {/* Stats Summary Cards */}
      <div className="grid grid-cols-2 md:grid-cols-5 gap-3.5">
        <div className="bg-[#161618] border border-white/5 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-2xs font-bold uppercase tracking-wider">Membri Totali</span>
            <Users size={15} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-white">{entries.length}</div>
          <span className="text-2xs text-slate-500">36 registrati nel foglio</span>
        </div>

        <div className="bg-[#161618] border border-white/5 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-2xs font-bold uppercase tracking-wider">Nuovo Grado Assegnato</span>
            <Sparkles size={15} className="text-emerald-400" />
          </div>
          <div className="text-2xl font-black text-emerald-400">{promotedCount}</div>
          <span className="text-2xs text-slate-500">Aggiornati automaticamente</span>
        </div>

        <div className="bg-[#161618] border border-white/5 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-2xs font-bold uppercase tracking-wider">Consiglio CDA</span>
            <Award size={15} className="text-amber-400" />
          </div>
          <div className="text-2xl font-black text-amber-300">{cdaCount}</div>
          <span className="text-2xs text-slate-500">Membri con ruolo CDA</span>
        </div>

        <div className="bg-[#161618] border border-white/5 rounded-2xl p-4 shadow-sm">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-2xs font-bold uppercase tracking-wider">Dipartimento DGS</span>
            <Shield size={15} className="text-rose-400" />
          </div>
          <div className="text-2xl font-black text-rose-300">{dgsCount}</div>
          <span className="text-2xs text-slate-500">Membri con ruolo DGS</span>
        </div>

        <div className="bg-[#161618] border border-white/5 rounded-2xl p-4 shadow-sm col-span-2 md:col-span-1">
          <div className="flex items-center justify-between text-slate-400 mb-1.5">
            <span className="text-2xs font-bold uppercase tracking-wider">Ferie / Assenze</span>
            <Calendar size={15} className="text-pink-400" />
          </div>
          <div className="text-2xl font-black text-pink-300">{leaveCount}</div>
          <span className="text-2xs text-slate-500">In ferie o aspettativa</span>
        </div>
      </div>

      {/* Main Content Card: Tab switch, Search, and Interactive Table */}
      <div className="bg-[#161618] border border-white/5 rounded-2xl p-5 lg:p-6 shadow-md space-y-6">
        <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-white/5 pb-4">
          {/* View Mode Toggle */}
          <div className="flex items-center gap-2 bg-[#0c0c0e] p-1 rounded-xl border border-white/10">
            <button
              type="button"
              onClick={() => setViewMode("table")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "table"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <TableIcon size={14} />
              <span>Tabella Gerarchia & Modifica Colonne</span>
            </button>
            <button
              type="button"
              onClick={() => setViewMode("google_sheet")}
              className={`flex items-center gap-2 px-3.5 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                viewMode === "google_sheet"
                  ? "bg-emerald-600 text-white shadow-sm"
                  : "text-slate-400 hover:text-white"
              }`}
            >
              <ExternalLink size={14} />
              <span>Google Sheet Live</span>
            </button>
          </div>

          {/* Search, Filter & Density Inputs */}
          {viewMode === "table" && (
            <div className="flex flex-wrap items-center gap-2.5">
              <div className="relative">
                <Search size={14} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" />
                <input
                  type="text"
                  placeholder="Cerca in tutte le celle..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="bg-[#0A0A0B] border border-white/10 rounded-xl pl-9 pr-3 py-1.5 text-xs text-white placeholder-slate-500 focus:outline-hidden focus:border-emerald-500 w-52 sm:w-60 transition-all"
                />
              </div>

              <div className="flex items-center gap-1.5">
                <Filter size={13} className="text-slate-500 shrink-0" />
                <select
                  value={statusFilter}
                  onChange={(e) => setStatusFilter(e.target.value)}
                  className="bg-[#0A0A0B] border border-white/10 rounded-xl px-2.5 py-1.5 text-xs text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer font-medium"
                >
                  <option value="ALL">Tutti ({entries.length})</option>
                  <option value="PROMOTED_ONLY">Nuovo Grado ({promotedCount})</option>
                  <option value="CDA_MEMBERS">CDA ({cdaCount})</option>
                  <option value="DGS_MEMBERS">DGS ({dgsCount})</option>
                  <option value="LEAVE_ABSENCE">Ferie/Assenze ({leaveCount})</option>
                  <option value="IN_VOTAZIONE">In Votazione ({inVotingCount})</option>
                  <option value="CONFERMATO">Confermati</option>
                </select>
              </div>

              {/* View Layout Density Toggle */}
              <div className="flex items-center bg-[#0c0c0e] p-1 rounded-xl border border-white/10 text-xs shadow-inner">
                <button
                  type="button"
                  onClick={() => setDensityMode("fit")}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    densityMode === "fit"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/50 ring-1 ring-emerald-400/40"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                  title="Adatta tutte le colonne nello schermo senza dover scorrere"
                >
                  <Minimize2 size={13} className={densityMode === "fit" ? "text-emerald-200" : "text-slate-400"} />
                  <span>Adatta Tutto</span>
                </button>
                <button
                  type="button"
                  onClick={() => setDensityMode("scroll")}
                  className={`px-3 py-1.5 rounded-lg font-bold flex items-center gap-1.5 transition-all cursor-pointer ${
                    densityMode === "scroll"
                      ? "bg-emerald-600 text-white shadow-md shadow-emerald-950/50 ring-1 ring-emerald-400/40"
                      : "text-slate-400 hover:text-white hover:bg-white/5"
                  }`}
                  title="Modalità estesa con scorrimento orizzontale e colonne bloccate"
                >
                  <ArrowLeftRight size={13} className={densityMode === "scroll" ? "text-emerald-200" : "text-slate-400"} />
                  <span>Scorri</span>
                </button>
              </div>

              <button
                type="button"
                onClick={() => setIsAddColumnModalOpen(true)}
                className="px-3 py-1.5 bg-emerald-600/20 hover:bg-emerald-600/30 border border-emerald-500/40 text-emerald-300 rounded-xl text-xs font-bold flex items-center gap-1.5 cursor-pointer"
                title="Aggiungi una nuova colonna personalizzata al foglio"
              >
                <Plus size={13} />
                <span>Colonna</span>
              </button>
            </div>
          )}
        </div>

        {/* Quick Column Visibility Pills Toolbar */}
        {viewMode === "table" && (
          <div className="bg-[#0c0c0e]/80 border border-white/5 rounded-xl p-2.5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-2xs">
              <div className="flex items-center gap-1.5 text-slate-400 font-bold uppercase tracking-wider">
                <Columns3 size={13} className="text-emerald-400" />
                <span>Visibilità Colonne:</span>
                <span className="text-slate-500 font-normal">
                  (clicca per mostrare/nascondere le colonne)
                </span>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleShowAllColumns}
                  className="text-emerald-400 hover:text-emerald-300 font-semibold cursor-pointer underline text-2xs"
                >
                  Mostra Tutte
                </button>
                <span className="text-slate-700">•</span>
                <button
                  type="button"
                  onClick={() => setIsColumnManagerOpen(true)}
                  className="text-slate-400 hover:text-slate-200 font-semibold cursor-pointer text-2xs flex items-center gap-1"
                >
                  <SlidersHorizontal size={11} /> Gestisci
                </button>
              </div>
            </div>

            {/* Pills list */}
            <div className="flex flex-wrap items-center gap-1.5">
              {columns.map((col) => {
                const isVis = col.visible;
                return (
                  <button
                    key={col.id}
                    type="button"
                    onClick={() => handleToggleColumnVisibility(col.id)}
                    className={`px-2.5 py-1 rounded-lg text-xs font-medium flex items-center gap-1.5 transition-all cursor-pointer border ${
                      isVis
                        ? "bg-emerald-950/40 text-emerald-300 border-emerald-500/40 hover:bg-emerald-900/50"
                        : "bg-slate-900/60 text-slate-500 border-white/5 hover:text-slate-400 line-through"
                    }`}
                    title={isVis ? `Nascondi ${col.label}` : `Mostra ${col.label}`}
                  >
                    {isVis ? (
                      <Check size={11} className="text-emerald-400" />
                    ) : (
                      <X size={11} className="text-slate-600" />
                    )}
                    <span>{col.label}</span>
                  </button>
                );
              })}
            </div>
          </div>
        )}

        {/* VIEW 1: DYNAMIC INTERACTIVE TABLE */}
        {viewMode === "table" && (
          <div className="space-y-3">
            {/* Table Header Bar & Horizontal Navigation Controls */}
            <div className="flex flex-wrap items-center justify-between gap-2 text-2xs text-slate-400 px-1">
              <span className="flex items-center gap-1.5">
                <Sparkles size={12} className="text-emerald-400 shrink-0" />
                <span>
                  {densityMode === "fit"
                    ? "Modalità Adatta Tutto: tutte le colonne sono dimensionate per rientrare nello schermo senza scorrimento."
                    : "Modalità Scorri: vista estesa a larghezza intera con scorrimento orizzontale e colonne bloccate."}
                </span>
              </span>

              {/* Scroll buttons when in scroll mode */}
              {densityMode === "scroll" ? (
                <div className="flex items-center gap-2">
                  <button
                    type="button"
                    onClick={scrollToLeft}
                    className="px-2.5 py-1 bg-white/5 hover:bg-white/10 text-slate-300 rounded-md flex items-center gap-1 cursor-pointer transition-colors border border-white/5 font-semibold"
                    title="Scorri all'inizio della tabella"
                  >
                    <ChevronLeft size={13} />
                    <span>Sinistra</span>
                  </button>
                  <button
                    type="button"
                    onClick={scrollToRight}
                    className="px-2.5 py-1 bg-emerald-600/30 hover:bg-emerald-600/50 text-emerald-300 rounded-md flex items-center gap-1 cursor-pointer transition-colors border border-emerald-500/40 font-bold"
                    title="Scorri subito alle colonne di destra (CDA, DGS, Ferie, Note)"
                  >
                    <span>Destra</span>
                    <ChevronRight size={13} />
                  </button>
                </div>
              ) : (
                <span className="text-[11px] text-emerald-400/90 font-semibold bg-emerald-500/10 border border-emerald-500/20 px-2 py-0.5 rounded-md flex items-center gap-1">
                  <Minimize2 size={11} /> 100% Adattato allo schermo
                </span>
              )}
            </div>

            {isLoading ? (
              <div className="flex flex-col items-center justify-center py-16 text-slate-400 space-y-3">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-emerald-500" />
                <p className="text-xs">Caricamento del foglio Excel Gerarchia...</p>
              </div>
            ) : filteredEntries.length === 0 ? (
              <div className="text-center py-16 border border-dashed border-white/10 rounded-2xl bg-white/[0.01]">
                <FileSpreadsheet size={36} className="mx-auto text-slate-600 mb-3" />
                <h4 className="text-sm font-bold text-white mb-1">Nessuna voce trovata</h4>
                <p className="text-xs text-slate-400 max-w-sm mx-auto mb-4">
                  Nessun elemento corrisponde ai filtri di ricerca selezionati.
                </p>
                <div className="flex justify-center gap-3">
                  <button
                    type="button"
                    onClick={handleResetFromOfficialSheet}
                    className="px-4 py-2 bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md inline-flex items-center gap-2"
                  >
                    <RotateCcw size={14} /> Ripristina 36 Membri
                  </button>
                  <button
                    type="button"
                    onClick={handleSyncWithCdaAndCandidature}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md inline-flex items-center gap-2"
                  >
                    <RefreshCw size={14} /> Sincronizza Adesso
                  </button>
                </div>
              </div>
            ) : (
              <div className="space-y-1">
                {/* Top Synchronized Scrollbar (only active in scroll mode) */}
                {densityMode === "scroll" && (
                  <div
                    ref={topScrollContainerRef}
                    onScroll={handleTopScroll}
                    className="overflow-x-auto h-2.5 bg-[#0a0a0c] rounded-md border border-white/5"
                  >
                    <div style={{ width: tableScrollContainerRef.current?.scrollWidth || "1300px", height: "1px" }} />
                  </div>
                )}

                {/* Main Table Container */}
                <div
                  ref={tableScrollContainerRef}
                  onScroll={handleTableScroll}
                  className={`rounded-xl border border-white/10 shadow-inner max-h-[75vh] ${
                    densityMode === "fit"
                      ? "w-full overflow-y-auto overflow-x-hidden scroll-smooth"
                      : "w-full overflow-x-auto overflow-y-auto scroll-smooth"
                  }`}
                >
                  <table
                    className={`text-left border-collapse ${
                      densityMode === "fit"
                        ? "w-full table-fixed text-[11px]"
                        : "min-w-[1300px] w-full table-auto text-xs"
                    }`}
                  >
                    {densityMode === "fit" && (
                      <colgroup>
                        {visibleColumns.map((col) => {
                          let widthStyle = "w-auto";
                          if (col.id === "orderNumber") widthStyle = "w-11 sm:w-13";
                          else if (col.id === "fullName") widthStyle = "w-[19%]";
                          else if (col.id === "currentRole") widthStyle = "w-[15%]";
                          else if (col.id === "newRole") widthStyle = "w-[15%]";
                          else if (col.id === "cdaRole") widthStyle = "w-[11%]";
                          else if (col.id === "dgsRole") widthStyle = "w-[11%]";
                          else if (col.id === "leaveStatus") widthStyle = "w-[11%]";
                          else if (col.id === "notes") widthStyle = "w-[9%]";
                          return <col key={col.id} className={widthStyle} />;
                        })}
                        <col className="w-10 sm:w-12" />
                      </colgroup>
                    )}

                    <thead>
                      <tr className="bg-[#0c0c0e] text-slate-400 font-bold uppercase tracking-wider border-b border-white/10 text-[10px] sticky top-0 z-30 shadow-xs">
                        {visibleColumns.map((col, cIdx) => {
                          const isStickyLeft =
                            densityMode === "scroll" &&
                            (col.id === "orderNumber" ||
                              (cIdx === 1 && visibleColumns[0]?.id === "orderNumber"));
                          return (
                            <th
                              key={col.id}
                              className={`relative group/th ${
                                densityMode === "fit"
                                  ? "py-2 px-1 sm:px-1.5 text-[9.5px] sm:text-[10px]"
                                  : "py-2.5 px-3 text-[10px]"
                              } ${
                                isStickyLeft && col.id === "orderNumber"
                                  ? "w-10 text-center sticky left-0 z-40 bg-[#0c0c0e]"
                                  : isStickyLeft
                                  ? "sticky left-10 z-40 bg-[#0c0c0e]"
                                  : ""
                              }`}
                            >
                              <div className="flex items-center justify-between gap-0.5">
                                <span
                                  className={`truncate ${
                                    col.id === "newRole"
                                      ? "text-emerald-400 flex items-center gap-1 font-black"
                                      : col.id === "cdaRole"
                                      ? "text-amber-300"
                                      : col.id === "dgsRole"
                                      ? "text-rose-300"
                                      : col.id === "leaveStatus"
                                      ? "text-pink-300"
                                      : ""
                                  }`}
                                  title={col.label}
                                >
                                  {col.id === "newRole" && <Sparkles size={10} className="shrink-0" />}
                                  {col.label}
                                </span>

                                {/* Column Options Menu Button */}
                                {col.id !== "orderNumber" && (
                                  <div className="relative header-menu-container">
                                    <button
                                      type="button"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveHeaderMenu(activeHeaderMenu === col.id ? null : col.id);
                                      }}
                                      className="p-0.5 rounded text-slate-500 hover:text-white hover:bg-white/10 transition-colors opacity-0 group-hover/th:opacity-100 cursor-pointer"
                                      title="Opzioni colonna"
                                    >
                                      <MoreVertical size={11} />
                                    </button>

                                    {/* Dropdown menu for column */}
                                    {activeHeaderMenu === col.id && (
                                      <div className="absolute right-0 top-full mt-1 w-44 bg-[#1a1a1e] border border-white/15 rounded-xl shadow-2xl py-1.5 z-50 text-left normal-case text-xs font-normal">
                                        <button
                                          type="button"
                                          onClick={() => {
                                            setColumnToRename(col);
                                            setRenameLabelValue(col.label);
                                            setActiveHeaderMenu(null);
                                          }}
                                          className="w-full px-3 py-2 text-slate-200 hover:bg-emerald-500/20 hover:text-emerald-300 flex items-center gap-2 cursor-pointer transition-colors"
                                        >
                                          <Edit2 size={12} />
                                          <span>Rinomina Colonna</span>
                                        </button>

                                        <button
                                          type="button"
                                          onClick={() => {
                                            handleToggleColumnVisibility(col.id);
                                            setActiveHeaderMenu(null);
                                          }}
                                          className="w-full px-3 py-2 text-slate-200 hover:bg-white/10 flex items-center gap-2 cursor-pointer transition-colors"
                                        >
                                          <EyeOff size={12} />
                                          <span>Nascondi Colonna</span>
                                        </button>

                                        {col.isRemovable && (
                                          <button
                                            type="button"
                                            onClick={() => {
                                              setColumnToDelete(col);
                                              setActiveHeaderMenu(null);
                                            }}
                                            className="w-full px-3 py-2 text-rose-300 hover:bg-rose-500/20 flex items-center gap-2 cursor-pointer transition-colors border-t border-white/5"
                                          >
                                            <Trash2 size={12} />
                                            <span>Elimina Colonna</span>
                                          </button>
                                        )}
                                      </div>
                                    )}
                                  </div>
                                )}
                              </div>
                            </th>
                          );
                        })}

                        {/* Header quick action for adding column and row actions */}
                        <th
                          className={`text-right ${
                            densityMode === "fit"
                              ? "py-2 px-1 w-8 sm:w-9"
                              : "py-2.5 px-2 w-16 sticky right-0 z-40 bg-[#0c0c0e] shadow-[-2px_0_5px_rgba(0,0,0,0.5)]"
                          }`}
                        >
                          <button
                            type="button"
                            onClick={() => setIsAddColumnModalOpen(true)}
                            className="p-1 hover:bg-emerald-500/20 rounded text-emerald-400 hover:text-emerald-300 transition-colors inline-flex items-center gap-0.5 cursor-pointer"
                            title="Aggiungi nuova colonna"
                          >
                            <Plus size={11} />
                            {densityMode === "scroll" && <span className="text-2xs font-bold hidden sm:inline">+Col</span>}
                          </button>
                        </th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-white/5 bg-[#161618]">
                      {filteredEntries.map((entry, idx) => {
                        const isDragging = draggedRowIndex === idx;
                        const isDragOver = dragOverRowIndex === idx;

                        return (
                          <tr
                            key={entry.id}
                            draggable
                            onDragStart={(e) => handleDragStart(e, idx, entry)}
                            onDragOver={(e) => handleDragOver(e, idx)}
                            onDrop={(e) => handleDrop(e, idx)}
                            onDragEnd={handleDragEnd}
                            className={`transition-all group ${
                              isDragging
                                ? "opacity-30 bg-emerald-950/40"
                                : isDragOver
                                ? "bg-emerald-500/20 ring-2 ring-emerald-400 ring-inset shadow-lg"
                                : "hover:bg-white/[0.04]"
                            }`}
                          >
                            {visibleColumns.map((col, cIdx) => {
                              const isStickyLeft =
                                densityMode === "scroll" &&
                                (col.id === "orderNumber" ||
                                  (cIdx === 1 && visibleColumns[0]?.id === "orderNumber"));
                              return (
                                <td
                                  key={col.id}
                                  className={`${
                                    densityMode === "fit"
                                      ? "py-1 px-1 sm:px-1.5"
                                      : "py-1.5 px-2.5"
                                  } ${
                                    isStickyLeft && col.id === "orderNumber"
                                      ? "w-10 text-center sticky left-0 z-20 bg-[#161618] group-hover:bg-[#1d1d21]"
                                      : isStickyLeft
                                      ? "sticky left-10 z-20 bg-[#161618] group-hover:bg-[#1d1d21] shadow-[2px_0_5px_rgba(0,0,0,0.3)]"
                                      : ""
                                  }`}
                                >
                                  {renderCell(entry, col, idx)}
                                </td>
                              );
                            })}

                            {/* Row Actions */}
                            <td
                              className={`${
                                densityMode === "fit"
                                  ? "py-1 px-0.5 text-right whitespace-nowrap"
                                  : "py-1.5 px-2 text-right whitespace-nowrap sticky right-0 z-20 bg-[#161618] group-hover:bg-[#1d1d21] shadow-[-3px_0_6px_rgba(0,0,0,0.4)]"
                              }`}
                            >
                              <div className="flex items-center justify-end gap-0.5">
                                <button
                                  type="button"
                                  disabled={idx === 0}
                                  onClick={() => handleMoveRow(entry.id, "up")}
                                  className="p-1 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md transition-colors cursor-pointer disabled:opacity-20 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                  title="Sposta riga in alto"
                                >
                                  <ArrowUp size={11} />
                                </button>
                                <button
                                  type="button"
                                  disabled={idx === filteredEntries.length - 1}
                                  onClick={() => handleMoveRow(entry.id, "down")}
                                  className="p-1 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md transition-colors cursor-pointer disabled:opacity-20 disabled:hover:text-slate-400 disabled:hover:bg-transparent"
                                  title="Sposta riga in basso"
                                >
                                  <ArrowDown size={11} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => handleOpenEditModal(entry)}
                                  className="p-1 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-md transition-colors cursor-pointer ml-0.5"
                                  title="Modifica riga completa"
                                >
                                  <Edit2 size={11} />
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setEntryToDelete(entry)}
                                  className="p-1 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-md transition-colors cursor-pointer"
                                  title="Elimina riga"
                                >
                                  <Trash2 size={11} />
                                </button>
                              </div>
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

        {/* VIEW 2: EMBEDDED GOOGLE SPREADSHEET LIVE */}
        {viewMode === "google_sheet" && (
          <div className="space-y-4">
            <div className="flex items-center justify-between bg-[#0a0a0c] p-3 rounded-xl border border-white/10">
              <div className="flex items-center gap-2 text-xs text-slate-300">
                <FileSpreadsheet size={16} className="text-emerald-400" />
                <span>Foglio Google Ufficiale: <strong>Gerarchia EMS (docs.google.com)</strong></span>
              </div>
              <a
                href={GOOGLE_SHEET_GERARCHIA_URL}
                target="_blank"
                rel="noopener noreferrer"
                className="px-3 py-1.5 bg-emerald-600/30 hover:bg-emerald-600/50 border border-emerald-500/40 text-emerald-300 text-xs font-bold rounded-lg flex items-center gap-1.5 transition-colors"
              >
                <ExternalLink size={13} />
                <span>Apri a schermo intero</span>
              </a>
            </div>

            <div className="w-full h-[700px] rounded-2xl overflow-hidden border border-emerald-500/30 bg-[#0a0a0c] shadow-2xl relative">
              <iframe
                src="https://docs.google.com/spreadsheets/d/1dBCewK_cvU1HeBLrCtH1-HbnsIWW1050DU0332Bd258/edit?gid=0#gid=0"
                title="Google Sheet Gerarchia EMS"
                className="w-full h-full border-0"
                allowFullScreen
              />
            </div>
          </div>
        )}
      </div>

      {/* MODAL: COLUMN MANAGER (Gestione Colonne) */}
      {isColumnManagerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#161618] border border-emerald-500/30 rounded-2xl p-6 max-w-2xl w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5 text-emerald-400 font-black text-sm">
                <SlidersHorizontal size={18} />
                <span>Gestione Colonne del Foglio Excel</span>
              </div>
              <button
                type="button"
                onClick={() => setIsColumnManagerOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <p className="text-xs text-slate-300 leading-relaxed">
              Modifica, riordina, visualizza/nascondi ed elimina le colonne del foglio. Le modifiche vengono salvate istantaneamente per tutti gli amministratori.
            </p>

            {/* List of current columns */}
            <div className="space-y-2 border border-white/10 rounded-xl p-3 bg-[#0A0A0B]">
              {columns.map((col, index) => (
                <div
                  key={col.id}
                  className="flex items-center justify-between gap-3 p-2.5 rounded-lg bg-[#161618] border border-white/5 hover:border-white/10 transition-colors"
                >
                  <div className="flex items-center gap-3">
                    {/* Move up / down buttons */}
                    <div className="flex flex-col gap-0.5">
                      <button
                        type="button"
                        disabled={index === 0}
                        onClick={() => handleMoveColumn(index, "left")}
                        className="text-slate-500 hover:text-emerald-400 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        title="Sposta prima"
                      >
                        <ChevronUp size={14} />
                      </button>
                      <button
                        type="button"
                        disabled={index === columns.length - 1}
                        onClick={() => handleMoveColumn(index, "right")}
                        className="text-slate-500 hover:text-emerald-400 disabled:opacity-20 cursor-pointer disabled:cursor-not-allowed"
                        title="Sposta dopo"
                      >
                        <ChevronDown size={14} />
                      </button>
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-white text-xs">{col.label}</span>
                        {col.isCustom && (
                          <span className="text-[10px] bg-emerald-500/20 text-emerald-300 px-1.5 py-0.2 rounded border border-emerald-500/30">
                            Personalizzata
                          </span>
                        )}
                      </div>
                      <span className="text-2xs text-slate-500 font-mono block">
                        Chiave: {col.key} | Tipo: {col.type}
                      </span>
                    </div>
                  </div>

                  {/* Actions for this column */}
                  <div className="flex items-center gap-2">
                    {/* Visibility Toggle */}
                    <button
                      type="button"
                      onClick={() => handleToggleColumnVisibility(col.id)}
                      className={`p-1.5 rounded-lg text-xs font-bold flex items-center gap-1 transition-colors cursor-pointer ${
                        col.visible
                          ? "bg-emerald-500/20 text-emerald-300 border border-emerald-500/30"
                          : "bg-white/5 text-slate-500 border border-white/10"
                      }`}
                      title={col.visible ? "Visibile (clicca per nascondere)" : "Nascosta (clicca per mostrare)"}
                    >
                      {col.visible ? <Eye size={13} /> : <EyeOff size={13} />}
                      <span>{col.visible ? "Visibile" : "Nascosta"}</span>
                    </button>

                    {/* Rename Button */}
                    <button
                      type="button"
                      onClick={() => {
                        setColumnToRename(col);
                        setRenameLabelValue(col.label);
                      }}
                      className="p-1.5 text-slate-400 hover:text-emerald-300 hover:bg-emerald-500/10 rounded-lg transition-colors cursor-pointer"
                      title="Rinomina colonna"
                    >
                      <Edit2 size={14} />
                    </button>

                    {/* Delete Button */}
                    {col.isRemovable ? (
                      <button
                        type="button"
                        onClick={() => setColumnToDelete(col)}
                        className="p-1.5 text-slate-400 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                        title="Elimina colonna"
                      >
                        <Trash2 size={14} />
                      </button>
                    ) : (
                      <span className="p-1.5 text-slate-600" title="Colonna fissa di sistema">
                        <Lock size={13} />
                      </span>
                    )}
                  </div>
                </div>
              ))}
            </div>

            {/* Bottom Actions in Column Manager */}
            <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={handleResetColumns}
                disabled={isSavingColumns}
                className="px-3.5 py-2 bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
              >
                <RotateCcw size={13} />
                <span>Ripristina Colonne Predefinite</span>
              </button>

              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setIsAddColumnModalOpen(true)}
                  className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl flex items-center gap-1.5 cursor-pointer shadow-md"
                >
                  <Plus size={14} />
                  <span>Nuova Colonna</span>
                </button>
                <button
                  type="button"
                  onClick={() => setIsColumnManagerOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Chiudi
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD NEW COLUMN */}
      {isAddColumnModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#161618] border border-emerald-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Plus size={18} />
                <span>Crea Nuova Colonna</span>
              </div>
              <button
                type="button"
                onClick={() => setIsAddColumnModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddColumn} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                  Titolo della Colonna *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={newColumnLabel}
                  onChange={(e) => setNewColumnLabel(e.target.value)}
                  placeholder="Es. Numero Matricola, Reparto, Turno, Email..."
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                  Tipo di Dati della Colonna
                </label>
                <select
                  value={newColumnType}
                  onChange={(e) => setNewColumnType(e.target.value as any)}
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                >
                  <option value="text">Testo Libero / Generale</option>
                  <option value="role">Grado / Ruolo Ospedaliero</option>
                  <option value="badge">Badge Organizzativo (CDA / DGS)</option>
                  <option value="leave">Stato Ferie / Assenza</option>
                  <option value="date">Data / Scadenza</option>
                </select>
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setIsAddColumnModalOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isSavingColumns}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSavingColumns ? "Creazione..." : "Aggiungi Colonna"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: RENAME COLUMN */}
      {columnToRename && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#161618] border border-emerald-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2 text-emerald-400 font-bold text-sm">
                <Edit2 size={18} />
                <span>Rinomina Colonna: {columnToRename.label}</span>
              </div>
              <button
                type="button"
                onClick={() => setColumnToRename(null)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveColumnRename} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                  Nuovo Nome della Colonna *
                </label>
                <input
                  type="text"
                  required
                  autoFocus
                  value={renameLabelValue}
                  onChange={(e) => setRenameLabelValue(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="flex justify-end gap-3 pt-2">
                <button
                  type="button"
                  onClick={() => setColumnToRename(null)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isSavingColumns}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl cursor-pointer shadow-md disabled:opacity-50"
                >
                  {isSavingColumns ? "Salvataggio..." : "Salva Nuovo Nome"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: DELETE COLUMN CONFIRMATION */}
      {columnToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#161618] border border-rose-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400 font-bold text-sm">
              <Trash2 size={18} />
              <span>Conferma Eliminazione Colonna</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Sei sicuro di voler eliminare definitivamente la colonna <strong>"{columnToDelete.label}"</strong> dalla visualizzazione del foglio Excel?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setColumnToDelete(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={isSavingColumns}
                onClick={handleDeleteColumn}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md disabled:opacity-50"
              >
                {isSavingColumns ? "Eliminazione..." : "Elimina Colonna"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: ADD / EDIT ROW (Membro) */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#161618] border border-emerald-500/30 rounded-2xl p-6 max-w-xl w-full shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2.5 text-emerald-400 font-black text-sm">
                <FileSpreadsheet size={18} />
                <span>{editingEntry ? "Modifica Membro nel Registro Excel" : "Aggiungi Membro al Registro Excel"}</span>
              </div>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-white cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleSaveEntry} className="space-y-4">
              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                  Membro del NOSTRO EMS (Nome e Cognome) *
                </label>
                <input
                  type="text"
                  required
                  value={formFullName}
                  onChange={(e) => setFormFullName(e.target.value)}
                  placeholder="Es. Theo Smith"
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white placeholder-slate-600 focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                    Ruolo Attuale *
                  </label>
                  <input
                    type="text"
                    required
                    list="current-roles-list"
                    value={formCurrentRole}
                    onChange={(e) => setFormCurrentRole(e.target.value)}
                    placeholder="Es. Direttore generale / Primario"
                    className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                  />
                  <datalist id="current-roles-list">
                    {COMMON_ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-emerald-400 mb-1.5 flex items-center gap-1">
                    <Sparkles size={12} />
                    <span>Nuovo Grado (o LICENZIAMENTO)</span>
                  </label>
                  <input
                    type="text"
                    list="new-roles-list"
                    value={formNewRole}
                    onChange={(e) => setFormNewRole(e.target.value)}
                    placeholder="Es. Responsabile Del Presidio o LICENZIAMENTO"
                    className="w-full bg-[#0A0A0B] border border-emerald-500/40 rounded-xl px-4 py-2.5 text-xs text-emerald-200 focus:outline-hidden focus:border-emerald-400"
                  />
                  <datalist id="new-roles-list">
                    {COMMON_ROLE_OPTIONS.map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-amber-300 mb-1.5">
                    Ruolo CDA
                  </label>
                  <input
                    type="text"
                    list="cda-roles-list"
                    value={formCdaRole}
                    onChange={(e) => setFormCdaRole(e.target.value)}
                    placeholder="Es. Presidente CDA, Segretario CDA, CDA..."
                    className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-amber-200 focus:outline-hidden focus:border-amber-500"
                  />
                  <datalist id="cda-roles-list">
                    {COMMON_CDA_OPTIONS.filter(Boolean).map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-rose-300 mb-1.5">
                    Ruolo DGS
                  </label>
                  <input
                    type="text"
                    list="dgs-roles-list"
                    value={formDgsRole}
                    onChange={(e) => setFormDgsRole(e.target.value)}
                    placeholder="Es. Responsabile DGS, Supervisore DGS..."
                    className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-rose-200 focus:outline-hidden focus:border-rose-500"
                  />
                  <datalist id="dgs-roles-list">
                    {COMMON_DGS_OPTIONS.filter(Boolean).map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div>
                  <label className="block text-xs font-bold uppercase text-pink-300 mb-1.5">
                    Assenze / Ferie / Aspettativa
                  </label>
                  <input
                    type="text"
                    list="leave-roles-list"
                    value={formLeaveStatus}
                    onChange={(e) => setFormLeaveStatus(e.target.value)}
                    placeholder="Es. FERIE, ASSENTE DA TEMPO, ASPETTATIVA..."
                    className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-pink-200 focus:outline-hidden focus:border-pink-500"
                  />
                  <datalist id="leave-roles-list">
                    {COMMON_LEAVE_OPTIONS.filter(Boolean).map((r) => (
                      <option key={r} value={r} />
                    ))}
                  </datalist>
                </div>

                <div>
                  <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                    Stato Voce
                  </label>
                  <select
                    value={formStatus}
                    onChange={(e) => setFormStatus(e.target.value as any)}
                    className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-hidden focus:border-emerald-500 cursor-pointer"
                  >
                    <option value="CONFERMATO">Confermato / Ufficiale</option>
                    <option value="IN_VOTAZIONE_CDA">In Votazione CDA</option>
                    <option value="IN_VALUTAZIONE">In Valutazione</option>
                    <option value="ARCHIVIATO">Archiviato</option>
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold uppercase text-slate-300 mb-1.5">
                  Note / Date Ferie / Scadenze Aspettativa
                </label>
                <input
                  type="text"
                  value={formNotes}
                  onChange={(e) => setFormNotes(e.target.value)}
                  placeholder="Es. 15/08 - 24/08 oppure L'aspettativa scade il 18/08/2026"
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-4 py-2.5 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                />
              </div>

              {/* Custom Dynamic Columns Inputs */}
              {columns.filter((c) => c.isCustom).length > 0 && (
                <div className="space-y-3 pt-3 border-t border-white/10">
                  <h5 className="text-xs font-bold text-emerald-400 uppercase">Campi Colonne Personalizzate</h5>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    {columns.filter((c) => c.isCustom).map((customCol) => (
                      <div key={customCol.id}>
                        <label className="block text-xs font-medium text-slate-300 mb-1">
                          {customCol.label}
                        </label>
                        <input
                          type="text"
                          value={formCustomFields[customCol.key] || ""}
                          onChange={(e) =>
                            setFormCustomFields({
                              ...formCustomFields,
                              [customCol.key]: e.target.value,
                            })
                          }
                          placeholder={`Valore per ${customCol.label}`}
                          className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-3 py-2 text-xs text-white focus:outline-hidden focus:border-emerald-500"
                        />
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="flex justify-end gap-3 pt-3 border-t border-white/10">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
                >
                  Annulla
                </button>
                <button
                  type="submit"
                  disabled={isSaving}
                  className="px-5 py-2 bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold rounded-xl transition-all shadow-md flex items-center gap-1.5 cursor-pointer disabled:opacity-50"
                >
                  {isSaving ? "Salvataggio..." : editingEntry ? "Salva Modifiche" : "Aggiungi al Registro"}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* MODAL: CONFIRM DELETE ROW */}
      {entryToDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#161618] border border-rose-500/30 rounded-2xl p-6 max-w-md w-full shadow-2xl space-y-4">
            <div className="flex items-center gap-2.5 text-rose-400 font-bold text-sm">
              <Trash2 size={18} />
              <span>Conferma Eliminazione Membro</span>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Sei sicuro di voler rimuovere <strong>{entryToDelete.fullName}</strong> dal foglio Excel Gerarchia?
            </p>
            <div className="flex justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setEntryToDelete(null)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Annulla
              </button>
              <button
                type="button"
                disabled={isDeleting}
                onClick={handleDeleteEntry}
                className="px-4 py-2 bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold rounded-xl transition-all cursor-pointer shadow-md"
              >
                {isDeleting ? "Eliminazione..." : "Conferma Eliminazione"}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* MODAL: GOOGLE SHEETS SYNC SETTINGS */}
      {isGoogleSyncModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm animate-fadeIn">
          <div className="bg-[#161618] border border-emerald-500/40 rounded-3xl p-6 max-w-lg w-full shadow-2xl space-y-5">
            <div className="flex items-center justify-between border-b border-white/10 pb-4">
              <div className="flex items-center gap-2.5 text-white font-bold text-base">
                <CloudUpload className="text-emerald-400" size={20} />
                <span>Sincronizzazione Live con Google Sheets</span>
              </div>
              <button
                type="button"
                onClick={() => setIsGoogleSyncModalOpen(false)}
                className="text-slate-400 hover:text-white p-1 rounded-lg transition-colors cursor-pointer"
              >
                <X size={18} />
              </button>
            </div>

            <div className="space-y-4 text-xs text-slate-300">
              <p className="leading-relaxed">
                Collegando il tuo account Google, ogni cambiamento effettuato sul sito (modifiche rapide con doppio clic, spostamento righe, promozioni) verrà scritto direttamente e in tempo reale sul tuo foglio <strong>Google Drive / Sheets</strong>.
              </p>

              {/* Connection Status Box */}
              <div className="p-4 bg-[#0d2a1d] border border-emerald-500/30 rounded-2xl space-y-3">
                <div className="flex items-center justify-between">
                  <span className="font-bold text-slate-200">Stato Collegamento Google:</span>
                  {googleAccessToken ? (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-emerald-500/20 text-emerald-300 border border-emerald-400/40 rounded-full font-bold text-2xs">
                      <CheckCircle2 size={12} /> Collegato & Attivo
                    </span>
                  ) : (
                    <span className="inline-flex items-center gap-1 px-2.5 py-1 bg-amber-500/20 text-amber-300 border border-amber-400/40 rounded-full font-bold text-2xs">
                      Non Autorizzato
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap gap-2 pt-1">
                  <button
                    type="button"
                    onClick={handleConnectGoogle}
                    className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-bold text-xs rounded-xl flex items-center gap-2 shadow-md transition-all cursor-pointer"
                  >
                    <Shield size={14} />
                    <span>{googleAccessToken ? "Rinnova Accesso Google" : "Accedi con Google"}</span>
                  </button>

                  {googleAccessToken && (
                    <button
                      type="button"
                      onClick={async () => {
                        await googleLogout();
                        setGoogleAccessToken("");
                        setSuccessMessage("Account Google disconnesso.");
                        setTimeout(() => setSuccessMessage(null), 3000);
                      }}
                      className="px-3 py-2 bg-white/5 hover:bg-white/10 text-slate-400 hover:text-rose-300 text-xs rounded-xl transition-colors cursor-pointer"
                    >
                      Disconnetti
                    </button>
                  )}
                </div>
              </div>

              {/* Auto-Sync Toggle */}
              <div className="p-4 bg-white/5 border border-white/10 rounded-2xl flex items-center justify-between gap-4">
                <div>
                  <div className="font-bold text-white flex items-center gap-1.5">
                    <Radio size={14} className={autoSyncToGoogle ? "text-emerald-400 animate-pulse" : "text-slate-500"} />
                    <span>Sincronizzazione Automatica (Auto-Sync)</span>
                  </div>
                  <p className="text-2xs text-slate-400 mt-0.5">
                    Invia le modifiche a Google Sheets istantaneamente ogni volta che cambi una cella o sposti una riga.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={handleToggleAutoSync}
                  className={`w-12 h-6 flex items-center rounded-full p-1 transition-colors cursor-pointer shrink-0 ${
                    autoSyncToGoogle ? "bg-emerald-600 justify-end" : "bg-slate-700 justify-start"
                  }`}
                >
                  <div className="bg-white w-4 h-4 rounded-full shadow-md transform transition-transform" />
                </button>
              </div>

              {/* Sheet Configuration */}
              <div className="space-y-2 pt-2 border-t border-white/10">
                <label className="block font-bold text-slate-200">ID Foglio Google (Spreadsheet ID):</label>
                <input
                  type="text"
                  value={spreadsheetIdToSync}
                  onChange={(e) => setSpreadsheetIdToSync(e.target.value)}
                  className="w-full bg-[#0A0A0B] border border-white/10 rounded-xl px-3.5 py-2 text-xs font-mono text-emerald-300 focus:outline-hidden focus:border-emerald-500"
                />
                <div className="flex items-center justify-between text-2xs text-slate-400">
                  <span>Tab foglio di lavoro:</span>
                  <input
                    type="text"
                    value={sheetNameToSync}
                    onChange={(e) => setSheetNameToSync(e.target.value)}
                    className="w-28 bg-[#0A0A0B] border border-white/10 rounded-lg px-2 py-1 text-xs text-slate-200 text-right focus:outline-hidden focus:border-emerald-500"
                  />
                </div>
                <div className="pt-1">
                  <a
                    href={`https://docs.google.com/spreadsheets/d/${spreadsheetIdToSync}/edit`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-2xs text-emerald-400 hover:underline flex items-center gap-1"
                  >
                    <ExternalLink size={11} />
                    <span>Apri il foglio Google in una nuova scheda ↗</span>
                  </a>
                </div>
              </div>

              {lastGoogleSyncTime && (
                <div className="text-2xs text-slate-400 text-right">
                  Ultima sincronizzazione: <strong className="text-emerald-300">{lastGoogleSyncTime}</strong>
                </div>
              )}
            </div>

            <div className="flex justify-between items-center pt-3 border-t border-white/10">
              <button
                type="button"
                onClick={() => setIsGoogleSyncModalOpen(false)}
                className="px-4 py-2 bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold rounded-xl transition-colors cursor-pointer"
              >
                Chiudi
              </button>

              <button
                type="button"
                disabled={isPushingToGoogle}
                onClick={() => executePushToGoogle()}
                className="px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-500 hover:to-teal-500 text-white text-xs font-bold rounded-xl transition-all shadow-lg flex items-center gap-2 cursor-pointer disabled:opacity-50"
              >
                <CloudUpload size={14} className={isPushingToGoogle ? "animate-bounce" : ""} />
                <span>{isPushingToGoogle ? "Invio in corso..." : "Invia Dati al Foglio Google"}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
