import React, { useState, useEffect, useRef } from "react";
import { Camera, Play, Pause, RotateCcw, Award, User, ShieldAlert, Sparkles, Volume2, VolumeX, ArrowUp, ArrowDown, ExternalLink, X, Heart, Activity, Music, Sliders, Key, Lock, Unlock, Upload, FileAudio, Disc, Trash2, SkipForward, SkipBack } from "lucide-react";
import { GameScore } from "../types.js";

import trackMarioDesk from "../assets/images/Mario Jordan Al Desk.mp3";
import trackMario2026 from "../assets/images/mario_jordan_20260522_1654.mp3";
import trackCartellaMario from "../assets/images/Cartella Mario Jordan.mp3";

// PLAYLIST DI 3 BRANI FISSI IMPORTATI TRAMITE VITE PER LA BUILD DI PRODUZIONE
// Quando un brano termina, il minigioco passa automaticamente al successivo!
export const GAME_BGM_PLAYLIST: string[] = [
  trackMarioDesk,
  trackMario2026,
  trackCartellaMario,
];

interface HospitalDinoGameProps {
  onClose?: () => void;
}

export default function HospitalDinoGame({ onClose }: HospitalDinoGameProps) {
  const [playerName, setPlayerName] = useState<string>(() => {
    return localStorage.getItem("ems_game_player_name") || "";
  });
  const [hasStarted, setHasStarted] = useState<boolean>(false);
  const [gameOver, setGameOver] = useState<boolean>(false);
  const [isPaused, setIsPaused] = useState<boolean>(false);
  const isPausedRef = useRef<boolean>(false);
  const [isLeaderboardOpen, setIsLeaderboardOpen] = useState<boolean>(false);
  const [score, setScore] = useState<number>(0);
  const [highScore, setHighScore] = useState<number>(() => {
    return Number(localStorage.getItem("ems_game_high_score") || "0");
  });
  const [level, setLevel] = useState<number>(1);
  const [leaderboard, setLeaderboard] = useState<GameScore[]>([]);
  const [isLoadingLeaderboard, setIsLoadingLeaderboard] = useState<boolean>(false);
  const [soundEnabled, setSoundEnabled] = useState<boolean>(true);
  const [isSubmitting, setIsSubmitting] = useState<boolean>(false);

  // Master Key verification & level selector state (no key strings hardcoded on client)
  const [isMasterUnlocked, setIsMasterUnlocked] = useState<boolean>(() => {
    if (typeof window === "undefined") return false;
    try {
      const rawSession = localStorage.getItem("discordUserSession");
      if (rawSession) {
        const parsed = JSON.parse(rawSession);
        if (
          parsed.isMaster === true ||
          parsed.roleName === "Proprietario" ||
          parsed.roleName === "Vice Proprietario"
        ) {
          return true;
        }
      }
    } catch {}
    return false;
  });

  const [startLevel, setStartLevel] = useState<number>(1);
  const [masterKeyInput, setMasterKeyInput] = useState<string>("");
  const [showMasterUnlockInput, setShowMasterUnlockInput] = useState<boolean>(false);
  const [masterUnlockError, setMasterUnlockError] = useState<string | null>(null);

  // Test Run indicator state (starts from level > 1)
  const [isTestRun, setIsTestRun] = useState<boolean>(false);
  const isTestRunRef = useRef<boolean>(false);

  // Mini Audio Menu & BGM soundtrack playlist state
  const [isAudioMenuOpen, setIsAudioMenuOpen] = useState<boolean>(false);
  const [bgmVolume, setBgmVolume] = useState<number>(0.35);
  const [sfxVolume, setSfxVolume] = useState<number>(0.55);
  const [isMuted, setIsMuted] = useState<boolean>(false);
  const [isMusicPlaying, setIsMusicPlaying] = useState<boolean>(true);
  const [currentTrackIndex, setCurrentTrackIndex] = useState<number>(0);

  // Background Music Ref (3-song playlist configured via GAME_BGM_PLAYLIST)
  const bgmAudioRef = useRef<HTMLAudioElement | null>(null);

  // Playlist Navigation Handlers
  const handleTrackEnded = () => {
    setCurrentTrackIndex((prev) => (prev + 1) % GAME_BGM_PLAYLIST.length);
  };

  const handleNextTrack = () => {
    setCurrentTrackIndex((prev) => (prev + 1) % GAME_BGM_PLAYLIST.length);
  };

  const handlePrevTrack = () => {
    setCurrentTrackIndex((prev) => (prev - 1 + GAME_BGM_PLAYLIST.length) % GAME_BGM_PLAYLIST.length);
  };

  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const touchStartYRef = useRef<number | null>(null);

  // Game state refs for requestAnimationFrame loop
  const gameStateRef = useRef<{
    running: boolean;
    score: number;
    level: number;
    speed: number;
    filippa: {
      x: number;
      y: number;
      width: number;
      height: number;
      vy: number;
      isJumping: boolean;
      isCrouching: boolean;
      groundY: number;
      runFrame: number;
    };
    mario: {
      x: number;
      y: number;
      width: number;
      height: number;
      recBlink: boolean;
    };
    obstacles: Array<{
      id: number;
      x: number;
      y: number;
      width: number;
      height: number;
      type: "barella" | "sedia" | "cartello" | "defibrillatore" | "medikit";
      isHigh: boolean;
      hasOverheadBandage?: boolean;
    }>;
    defibrillatorCount: number;
    bgOffset: number;
    frameCount: number;
  }>({
    running: false,
    score: 0,
    level: 1,
    speed: 6,
    filippa: {
      x: 140,
      y: 200,
      width: 44,
      height: 64,
      vy: 0,
      isJumping: false,
      isCrouching: false,
      groundY: 200,
      runFrame: 0,
    },
    mario: {
      x: 35,
      y: 195,
      width: 48,
      height: 70,
      recBlink: true,
    },
    obstacles: [],
    defibrillatorCount: 0,
    bgOffset: 0,
    frameCount: 0,
  });

  // Fetch Leaderboard
  const fetchLeaderboard = async () => {
    setIsLoadingLeaderboard(true);
    try {
      const res = await fetch("/api/game/leaderboard");
      const data = await res.json();
      if (data.success && Array.isArray(data.scores)) {
        setLeaderboard(data.scores);
      }
    } catch (e) {
      console.error("Leaderboard fetch error:", e);
    } finally {
      setIsLoadingLeaderboard(false);
    }
  };

  useEffect(() => {
    fetchLeaderboard();
  }, []);

  // Master Key verification handler via backend API (keeps key secret on server)
  const handleVerifyMasterKey = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    setMasterUnlockError(null);
    const clean = masterKeyInput.trim();
    if (!clean) {
      setMasterUnlockError("Inserisci la Chiave Master.");
      return;
    }

    try {
      const res = await fetch("/api/game/verify-master-key", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ masterKey: clean }),
      });
      const data = await res.json();
      if (data.success && data.isMaster) {
        setIsMasterUnlocked(true);
        setShowMasterUnlockInput(false);
        setMasterKeyInput("");
      } else {
        setMasterUnlockError("Chiave Master non valida o non autorizzata.");
      }
    } catch {
      setMasterUnlockError("Errore di connessione durante la verifica.");
    }
  };

  // Save Name & Start Game with starting level support
  const handleSaveNameAndStart = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    const clean = playerName.trim() || "Medico EMS";
    setPlayerName(clean);
    localStorage.setItem("ems_game_player_name", clean);

    const initialLvl = isMasterUnlocked ? Math.max(1, startLevel) : 1;
    const isTest = initialLvl > 1;

    setIsTestRun(isTest);
    isTestRunRef.current = isTest;

    const initialScore = (initialLvl - 1) * 200;
    const initialSpeed = Math.min(15.0, 5.2 + (initialLvl - 1) * 0.5);

    setIsPaused(false);
    isPausedRef.current = false;
    setHasStarted(true);
    setGameOver(false);
    setScore(initialScore);
    setLevel(initialLvl);

    // Explicitly start audio inside user gesture handler for mobile & production autoplay rules
    if (bgmAudioRef.current && isMusicPlaying && !isMuted && soundEnabled) {
      bgmAudioRef.current.volume = bgmVolume;
      bgmAudioRef.current.play().catch(() => {});
    }

    // Reset game state ref with target starting level and speed
    gameStateRef.current = {
      running: true,
      score: initialScore,
      level: initialLvl,
      speed: initialSpeed,
      filippa: {
        x: 140,
        y: 200,
        width: 44,
        height: 64,
        vy: 0,
        isJumping: false,
        isCrouching: false,
        groundY: 200,
        runFrame: 0,
      },
      mario: {
        x: 35,
        y: 195,
        width: 48,
        height: 70,
        recBlink: true,
      },
      obstacles: [],
      defibrillatorCount: 0,
      bgOffset: 0,
      frameCount: 0,
    };
  };

  // Synchronize Background Music audio element playback and volume with active playlist track
  useEffect(() => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.volume = isMuted || !isMusicPlaying || !soundEnabled ? 0 : bgmVolume;

      const shouldPlay = hasStarted && !gameOver && !isPaused && isMusicPlaying && !isMuted && soundEnabled;
      if (shouldPlay) {
        bgmAudioRef.current.play().catch(() => {});
      } else {
        bgmAudioRef.current.pause();
      }
    }
  }, [bgmVolume, isMuted, isMusicPlaying, soundEnabled, hasStarted, gameOver, isPaused]);

  // Handle explicit track change loading & autoplay
  useEffect(() => {
    if (bgmAudioRef.current) {
      bgmAudioRef.current.load();
      const shouldPlay = hasStarted && !gameOver && !isPaused && isMusicPlaying && !isMuted && soundEnabled;
      if (shouldPlay) {
        bgmAudioRef.current.play().catch(() => {});
      }
    }
  }, [currentTrackIndex]);

  // Pause toggle
  const togglePause = () => {
    if (!hasStarted || gameOver) return;
    setIsPaused((prev) => {
      const next = !prev;
      isPausedRef.current = next;
      return next;
    });
  };

  // Global ESC key listener for reliably pausing/unpausing
  useEffect(() => {
    if (!hasStarted || gameOver) return;

    const handleEscPause = (e: KeyboardEvent) => {
      if (
        e.key === "Escape" ||
        e.code === "Escape" ||
        e.keyCode === 27 ||
        e.key === "p" ||
        e.key === "P" ||
        e.code === "KeyP"
      ) {
        e.preventDefault();
        e.stopPropagation();
        togglePause();
      }
    };

    window.addEventListener("keydown", handleEscPause, true);
    return () => {
      window.removeEventListener("keydown", handleEscPause, true);
    };
  }, [hasStarted, gameOver]);

  // Sound effects generator via Web Audio API with SFX volume support
  const playSound = (type: "jump" | "duck" | "score" | "hit") => {
    if (!soundEnabled || isMuted || sfxVolume <= 0) return;
    try {
      const ctx = new (window.AudioContext || (window as any).webkitAudioContext)();
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.connect(gain);
      gain.connect(ctx.destination);

      const now = ctx.currentTime;
      const vol = sfxVolume * 0.25;

      if (type === "jump") {
        osc.type = "sine";
        osc.frequency.setValueAtTime(150, now);
        osc.frequency.exponentialRampToValueAtTime(450, now + 0.15);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.15);
        osc.start(now);
        osc.stop(now + 0.15);
      } else if (type === "duck") {
        osc.type = "triangle";
        osc.frequency.setValueAtTime(300, now);
        osc.frequency.exponentialRampToValueAtTime(180, now + 0.12);
        gain.gain.setValueAtTime(vol, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.12);
        osc.start(now);
        osc.stop(now + 0.12);
      } else if (type === "score") {
        osc.type = "square";
        osc.frequency.setValueAtTime(523.25, now);
        osc.frequency.setValueAtTime(659.25, now + 0.08);
        gain.gain.setValueAtTime(vol * 0.8, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.2);
        osc.start(now);
        osc.stop(now + 0.2);
      } else if (type === "hit") {
        osc.type = "sawtooth";
        osc.frequency.setValueAtTime(120, now);
        osc.frequency.linearRampToValueAtTime(40, now + 0.3);
        gain.gain.setValueAtTime(vol * 1.2, now);
        gain.gain.linearRampToValueAtTime(0.01, now + 0.3);
        osc.start(now);
        osc.stop(now + 0.3);
      }
    } catch {
      // Audio not allowed or unsupported
    }
  };

  // Submit high score to server
  const submitScore = async (finalScore: number, finalLevel: number) => {
    if (isTestRunRef.current) {
      console.log("Run di prova dal livello > 1: punteggio non salvato in classifica.");
      return;
    }
    setIsSubmitting(true);
    try {
      const res = await fetch("/api/game/leaderboard", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: playerName.trim() || "Medico EMS",
          score: finalScore,
          level: finalLevel,
        }),
      });
      const data = await res.json();
      if (data.success && Array.isArray(data.scores)) {
        setLeaderboard(data.scores);
      }
    } catch (e) {
      console.error("Score submit error:", e);
    } finally {
      setIsSubmitting(false);
    }
  };

  // Main Canvas Game Loop
  useEffect(() => {
    if (!hasStarted || gameOver) return;

    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    let animId: number;
    let lastTime = performance.now();
    const state = gameStateRef.current;
    state.running = true;

    // Maintain checkpoint state configured in handleSaveNameAndStart (e.g. Level 49 starting at 9600 pts)
    if (!state.level || state.level < 1) {
      state.level = isTestRunRef.current ? Math.max(1, startLevel) : 1;
    }
    if (state.score === undefined || state.score === null) {
      state.score = (state.level - 1) * 200;
    }
    if (!state.speed) {
      state.speed = Math.min(15.0, 5.2 + (state.level - 1) * 0.5);
    }

    state.obstacles = [];
    state.bgOffset = 0;
    state.frameCount = 0;

    // Ground Y position
    const groundY = canvas.height - 75;
    state.filippa.groundY = groundY - state.filippa.height;
    state.filippa.y = state.filippa.groundY;
    state.filippa.vy = 0;
    state.filippa.isJumping = false;
    state.filippa.isCrouching = false;
    state.mario.y = groundY - state.mario.height;

    const spawnObstacle = () => {
      // Filter obstacle types by current level for smooth progression
      let availableTypes: Array<"barella" | "sedia" | "cartello" | "defibrillatore" | "medikit"> = [];

      if (state.level === 1) {
        // Level 1: Ground obstacles & Medikit Verde
        availableTypes = ["cartello", "sedia", "medikit"];
      } else if (state.level === 2) {
        // Level 2: Introduce stretcher
        availableTypes = ["cartello", "sedia", "barella", "medikit"];
      } else {
        // Level 3+: All obstacles including wall-mounted Defibrillator DAE
        availableTypes = ["barella", "sedia", "cartello", "defibrillatore", "medikit"];
      }

      const type = availableTypes[Math.floor(Math.random() * availableTypes.length)];

      let w = 40;
      let h = 42;
      let isHigh = false;
      let hasOverheadBandage = false;

      if (type === "barella") {
        // Lettino Ospedaliero
        w = 56;
        h = 36;
        isHigh = false;
      } else if (type === "sedia") {
        // Sedia a Rotelle (Bassa a terra)
        w = 42;
        h = 36;
        isHigh = false;
      } else if (type === "cartello") {
        // Cono Stradale
        w = 32;
        h = 38;
        isHigh = false;
      } else if (type === "defibrillatore") {
        // Defibrillatore DAE a Parete (Wall-mounted)
        w = 38;
        h = 46;
        isHigh = true; // Hanging from wall -> crouch under
        state.defibrillatorCount = (state.defibrillatorCount || 0) + 1;
        // Overhead medical bandage banner spawned at top above the defibrillator
        // preventing jumping and forcing player to slide/crouch under
        hasOverheadBandage = true;
      } else if (type === "medikit") {
        // Medikit Verde
        w = 38;
        h = 34;
        // Medikit can appear on ground OR slightly elevated so player can jump/slide
        isHigh = Math.random() < 0.35;
      }

      const obstacleY = isHigh ? groundY - 92 : groundY - h;

      const firstObsX = canvas.width + 20;

      state.obstacles.push({
        id: Date.now() + Math.random(),
        x: firstObsX,
        y: obstacleY,
        width: w,
        height: h,
        type,
        isHigh,
        hasOverheadBandage,
      });

      // Level 6+: 40% chance to spawn a second attached ground obstacle (e.g. 2 wheelchairs attached)
      if (state.level >= 6 && !isHigh && Math.random() < 0.40) {
        const secondType = Math.random() < 0.7 ? type : "sedia";
        let w2 = 42;
        let h2 = 36;

        if (secondType === "barella") {
          w2 = 56;
          h2 = 36;
        } else if (secondType === "sedia") {
          w2 = 42;
          h2 = 36;
        } else if (secondType === "cartello") {
          w2 = 32;
          h2 = 38;
        } else if (secondType === "medikit") {
          w2 = 38;
          h2 = 34;
        }

        const obstacleY2 = groundY - h2;

        state.obstacles.push({
          id: Date.now() + Math.random() + 1,
          x: firstObsX + w - 2, // Attached right next to the first obstacle
          y: obstacleY2,
          width: w2,
          height: h2,
          type: secondType,
          isHigh: false,
        });
      }
    };

    let nextSpawnFrame = 110;

    const loop = (timestamp: number) => {
      if (!state.running) return;

      // Delta time normalization based on target 60 FPS (~16.667ms per frame)
      const deltaMs = timestamp ? timestamp - lastTime : 16.667;
      lastTime = timestamp || performance.now();

      let dt = deltaMs / 16.667;
      if (isNaN(dt) || dt <= 0) dt = 1;
      if (dt > 2.5) dt = 2.5; // Cap dt to prevent clipping on tab switch or pause resume

      if (isPausedRef.current) {
        // Render PAUSE state overlay on canvas
        ctx.save();
        ctx.fillStyle = "rgba(15, 23, 42, 0.75)";
        ctx.fillRect(0, 0, canvas.width, canvas.height);

        ctx.fillStyle = "#fbbf24";
        ctx.font = "bold 26px sans-serif";
        ctx.textAlign = "center";
        ctx.fillText("⏸️ GIOCO IN PAUSA", canvas.width / 2, canvas.height / 2 - 12);

        ctx.fillStyle = "#cbd5e1";
        ctx.font = "bold 13px sans-serif";
        ctx.fillText("Premi P / ESC per riprendere la corsa!", canvas.width / 2, canvas.height / 2 + 18);
        ctx.restore();

        animId = requestAnimationFrame(loop);
        return;
      }

      state.frameCount += dt;
      state.score += 0.2 * dt;
      const currentScoreInt = Math.floor(state.score);

      // Level progression (Every 200 points)
      const currentLevel = Math.floor(currentScoreInt / 200) + 1;
      if (currentLevel !== state.level) {
        state.level = currentLevel;
        playSound("score");
        setLevel(currentLevel);
      }

      // Progressive speed scaling for EVERY level (increases continuously per level starting from 5.2)
      state.speed = Math.min(15.0, 5.2 + (state.level - 1) * 0.50);

      setScore(currentScoreInt);

      // Update background offset (Higher frequency & speed multiplier for dynamic background scrolling)
      state.bgOffset = (state.bgOffset + state.speed * 0.85 * dt) % 79200;

      // Update Filippa Physics
      const f = state.filippa;
      if (f.isJumping) {
        // Fast fall / Mid-air crouch: if holding or pressing crouch in mid-air, increase downward gravity significantly
        if (f.isCrouching) {
          if (f.vy < 0) {
            f.vy = 2.5; // Immediately halt upward momentum and start downward fall
          } else {
            f.vy += 2.2 * dt; // Heavy gravity pull for fast fall
          }
        } else {
          f.vy += 0.75 * dt; // Standard Gravity
        }

        f.y += f.vy * dt;

        if (f.y >= f.groundY) {
          f.y = f.groundY;
          f.isJumping = false;
          f.vy = 0;
        }
      }

      // Filippa Crouching dimensions
      const fHeight = f.isCrouching && !f.isJumping ? 38 : 64;
      const fY = f.isCrouching && !f.isJumping ? groundY - 38 : f.y;

      // Update Mario position & REC light
      if (Math.floor(state.frameCount) % 25 === 0) {
        state.mario.recBlink = !state.mario.recBlink;
      }

      // Spawn Obstacles with variable min gap guaranteed to be playable
      if (state.frameCount >= nextSpawnFrame) {
        spawnObstacle();

        // Base gap reduction per level
        let gapReduction = (state.level - 1) * 4.5;
        // After level 15, increase obstacle spawn frequency extra to boost challenge
        if (state.level > 15) {
          gapReduction += (state.level - 15) * 2.8;
        }

        const minGap = Math.max(36, Math.floor(140 - gapReduction));
        const maxRandomGap = Math.max(15, 40 - (state.level > 15 ? Math.min(22, (state.level - 15) * 1.5) : 0));
        const randomGap = Math.floor(Math.random() * maxRandomGap);
        nextSpawnFrame = state.frameCount + minGap + randomGap;
      }

      // Move & filter obstacles
      for (let i = 0; i < state.obstacles.length; i++) {
        state.obstacles[i].x -= state.speed * dt;
      }
      state.obstacles = state.obstacles.filter((obs) => obs.x + obs.width > -50);

      // Collision Detection (AABB)
      let crashed = false;
      const filippaBox = {
        x: f.x + 8,
        y: fY + 6,
        width: f.width - 16,
        height: fHeight - 8,
      };

      for (const obs of state.obstacles) {
        const obsBox = {
          x: obs.x + 4,
          y: obs.y + 4,
          width: obs.width - 8,
          height: obs.height - 8,
        };

        if (
          filippaBox.x < obsBox.x + obsBox.width &&
          filippaBox.x + filippaBox.width > obsBox.x &&
          filippaBox.y < obsBox.y + obsBox.height &&
          filippaBox.y + filippaBox.height > obsBox.y
        ) {
          crashed = true;
          break;
        }

        // Check overhead medical bandage barrier collision for defibrillator
        if (obs.type === "defibrillatore" && obs.hasOverheadBandage) {
          const bandageBox = {
            x: obs.x - 8,
            y: 0,
            width: obs.width + 16,
            height: groundY - 50,
          };

          if (
            filippaBox.x < bandageBox.x + bandageBox.width &&
            filippaBox.x + filippaBox.width > bandageBox.x &&
            filippaBox.y < bandageBox.y + bandageBox.height &&
            filippaBox.y + filippaBox.height > bandageBox.y
          ) {
            crashed = true;
            break;
          }
        }
      }

      if (crashed) {
        state.running = false;
        playSound("hit");
        const finalScoreInt = Math.floor(state.score);
        setGameOver(true);
        if (!isTestRunRef.current) {
          if (finalScoreInt > highScore) {
            setHighScore(finalScoreInt);
            localStorage.setItem("ems_game_high_score", String(finalScoreInt));
          }
          submitScore(finalScoreInt, state.level);
        }
        return;
      }

      // --- RENDER 2D GRAPHICS ---
      ctx.clearRect(0, 0, canvas.width, canvas.height);

      // Mode checks
      const isRainbowMode = state.level >= 50 && state.level <= 52;
      const isMeme67Mode = state.level === 67;
      const isInvertedOrientation = state.level >= 80 && state.level <= 83;
      const isBwMode = !isRainbowMode && !isMeme67Mode && !isInvertedOrientation && state.level >= 15 && state.level % 10 === 5;

      if (isBwMode) {
        ctx.filter = "grayscale(100%) contrast(120%)";
      } else {
        ctx.filter = "none";
      }

      // If level 80-83, invert horizontal orientation (Right to Left running)
      if (isInvertedOrientation) {
        ctx.save();
        ctx.translate(canvas.width, 0);
        ctx.scale(-1, 1);
      }

      // 1. Hospital Background Wall & Lights (Dynamic Palette per level)
      const getLevelBgColors = (lvl: number): [string, string] => {
        // Level 50-52 Rainbow Party Mode
        if (lvl >= 50 && lvl <= 52) {
          const h1 = (state.frameCount * 2.5) % 360;
          const h2 = (h1 + 80) % 360;
          return [`hsl(${h1}, 85%, 16%)`, `hsl(${h2}, 85%, 8%)`];
        }
        // Level 67 Meme Mode (Bright Cartoon White & Slate Sticker Aesthetic)
        if (lvl === 67) {
          return ["#ffffff", "#e2e8f0"];
        }
        // Level 80-83 Inverted Orientation Corridor
        if (lvl >= 80 && lvl <= 83) {
          return ["#083344", "#0f172a"];
        }
        // Coffee break level (Level >= 10 ending in 0: 10, 20, 30, 40...)
        if (lvl >= 10 && lvl % 10 === 0) {
          return ["#3b1808", "#1c0d02"];
        }
        // Black and White level (Level >= 15 ending in 5: 15, 25, 35, 45...)
        if (lvl >= 15 && lvl % 10 === 5) {
          return ["#27272a", "#09090b"];
        }

        const palettes: [string, string][] = [
          ["#0f172a", "#1e293b"], // L1: Notte Ospedaliera (Navy/Slate)
          ["#172554", "#1e1b4b"], // L2: Indigo Reale
          ["#042f2e", "#0f172a"], // L3: Smeraldo Reparto
          ["#31103f", "#0f172a"], // L4: Viola Notturno
          ["#450a0a", "#18181b"], // L5: Allarme Rosso
          ["#1e3a8a", "#0f172a"], // L6: Blu Cobalto
          ["#3f2305", "#18181b"], // L7: Bronzo Warm
          ["#064e3b", "#022c22"], // L8: Menta Intensiva
          ["#581c87", "#1e1b4b"], // L9: Viola Neon
          ["#3b1808", "#1c0d02"], // L10: Coffee Espresso
        ];

        if (lvl <= palettes.length) {
          return palettes[lvl - 1];
        }

        // Dynamic smooth hue shifting for level > 10
        const h1 = (lvl * 43) % 360;
        const h2 = (h1 + 35) % 360;
        return [`hsl(${h1}, 55%, 12%)`, `hsl(${h2}, 45%, 7%)`];
      };

      const [topBg, botBg] = getLevelBgColors(state.level);
      const bgGrad = ctx.createLinearGradient(0, 0, 0, canvas.height);
      bgGrad.addColorStop(0, topBg);
      bgGrad.addColorStop(1, botBg);
      ctx.fillStyle = bgGrad;
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      // Hospital Wall Vertical Stripes (Higher scrolling frequency)
      for (let x = -((state.bgOffset * 1.5) % 120); x < canvas.width + 120; x += 120) {
        if (isRainbowMode) {
          const rHue = (state.frameCount * 3 + x) % 360;
          ctx.fillStyle = `hsla(${rHue}, 100%, 65%, 0.25)`;
          ctx.fillRect(x, 0, 6, groundY);
          ctx.fillStyle = `hsla(${(rHue + 60) % 360}, 100%, 65%, 0.15)`;
          ctx.fillRect(x + 25, 0, 3, groundY);
          ctx.fillRect(x + 55, 0, 3, groundY);
        } else if (isBwMode) {
          // Distinct bright white corridor stripes in B&W mode
          ctx.fillStyle = "rgba(255, 255, 255, 0.4)";
          ctx.fillRect(x, 0, 5, groundY);
          ctx.fillStyle = "rgba(255, 255, 255, 0.22)";
          ctx.fillRect(x + 25, 0, 2, groundY);
          ctx.fillRect(x + 45, 0, 2, groundY);
          ctx.fillRect(x + 65, 0, 2, groundY);
        } else {
          // Subtle wall stripes in normal mode
          ctx.fillStyle = "rgba(255, 255, 255, 0.04)";
          ctx.fillRect(x, 0, 3, groundY);
        }
      }

      // Top Header ECG Line / Hospital Banner
      if (isRainbowMode) {
        const lineGrad = ctx.createLinearGradient(0, 0, canvas.width, 0);
        lineGrad.addColorStop(0, `hsl(${(state.frameCount * 4) % 360}, 100%, 60%)`);
        lineGrad.addColorStop(0.33, `hsl(${(state.frameCount * 4 + 120) % 360}, 100%, 60%)`);
        lineGrad.addColorStop(0.66, `hsl(${(state.frameCount * 4 + 240) % 360}, 100%, 60%)`);
        lineGrad.addColorStop(1, `hsl(${(state.frameCount * 4 + 360) % 360}, 100%, 60%)`);
        ctx.strokeStyle = lineGrad;
        ctx.lineWidth = 3.5;
      } else {
        ctx.strokeStyle = isBwMode ? "rgba(255, 255, 255, 0.75)" : "#10b98133";
        ctx.lineWidth = isBwMode ? 2.5 : 2;
      }

      ctx.beginPath();
      ctx.moveTo(0, 35);
      for (let x = 0; x < canvas.width; x += 40) {
        ctx.lineTo(x + 10, 35);
        ctx.lineTo(x + 15, 20);
        ctx.lineTo(x + 20, 50);
        ctx.lineTo(x + 25, 35);
      }
      ctx.stroke();

      // Hospital Wall Crosses & Windows
      for (let x = -((state.bgOffset * 1.5) % 180); x < canvas.width + 100; x += 180) {
        if (isRainbowMode) {
          const crossHue = (state.frameCount * 5 + x) % 360;
          ctx.fillStyle = `hsla(${crossHue}, 100%, 65%, 0.45)`;
          ctx.fillRect(x + 50, 60, 16, 6);
          ctx.fillRect(x + 55, 55, 6, 16);

          ctx.strokeStyle = `hsla(${(crossHue + 90) % 360}, 100%, 65%, 0.4)`;
          ctx.strokeRect(x + 100, 70, 45, 110);
        } else {
          // Red / White Cross Logo on Wall
          ctx.fillStyle = isBwMode ? "rgba(255, 255, 255, 0.5)" : "rgba(239, 68, 68, 0.15)";
          ctx.fillRect(x + 50, 60, 16, 6);
          ctx.fillRect(x + 55, 55, 6, 16);

          // Door frame
          ctx.strokeStyle = isBwMode ? "rgba(255, 255, 255, 0.4)" : "rgba(255, 255, 255, 0.08)";
          ctx.strokeRect(x + 100, 70, 45, 110);
        }
      }

      // Floating Rainbow Confetti / Sparkles at Level 50+
      if (isRainbowMode) {
        for (let p = 0; p < 22; p++) {
          const px = (p * 36 + state.frameCount * 2.2) % canvas.width;
          const py = (p * 18 + Math.sin(state.frameCount * 0.06 + p) * 20) % (groundY - 20);
          const pHue = (p * 18 + state.frameCount * 5) % 360;
          ctx.fillStyle = `hsl(${pHue}, 100%, 70%)`;
          ctx.beginPath();
          ctx.arc(px, py, (p % 3) + 2, 0, Math.PI * 2);
          ctx.fill();
        }
      }

      // Cappuccino Coffee Break Background Decor at Level 10, 20, 30... (level % 10 === 0, disabled on inverted L80)
      if (state.level % 10 === 0 && !isInvertedOrientation) {
        for (let x = -((state.bgOffset * 1.5) % 220); x < canvas.width + 100; x += 220) {
          const cupX = x + 110;
          const cupY = 115;

          ctx.save();
          // Wooden Shelf
          ctx.fillStyle = "#78350f";
          ctx.fillRect(cupX - 22, cupY + 22, 44, 4);
          ctx.fillStyle = "#451a03";
          ctx.fillRect(cupX - 22, cupY + 26, 44, 2);

          // Ceramic White/Cream Mug Body
          ctx.fillStyle = "#fef3c7";
          ctx.beginPath();
          ctx.moveTo(cupX - 14, cupY);
          ctx.lineTo(cupX + 14, cupY);
          ctx.lineTo(cupX + 11, cupY + 20);
          ctx.lineTo(cupX - 11, cupY + 20);
          ctx.closePath();
          ctx.fill();

          // Handle
          ctx.strokeStyle = "#fef3c7";
          ctx.lineWidth = 3.5;
          ctx.beginPath();
          ctx.arc(cupX + 15, cupY + 10, 7, -Math.PI / 2, Math.PI / 2);
          ctx.stroke();

          // Dark Coffee Top
          ctx.fillStyle = "#78350f";
          ctx.beginPath();
          ctx.ellipse(cupX, cupY + 1, 13, 4.5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Creamy Cappuccino Foam
          ctx.fillStyle = "#fffbeb";
          ctx.beginPath();
          ctx.ellipse(cupX, cupY + 1, 9, 3, 0, 0, Math.PI * 2);
          ctx.fill();

          // Heart Cocoa Art
          ctx.fillStyle = "#78350f";
          ctx.beginPath();
          ctx.arc(cupX - 2, cupY, 2, 0, Math.PI * 2);
          ctx.arc(cupX + 2, cupY, 2, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(cupX - 4, cupY + 0.5);
          ctx.lineTo(cupX, cupY + 4);
          ctx.lineTo(cupX + 4, cupY + 0.5);
          ctx.closePath();
          ctx.fill();

          // Animated Steam rising
          ctx.strokeStyle = "rgba(254, 243, 199, 0.55)";
          ctx.lineWidth = 2;
          const steamShift = Math.sin(state.frameCount * 0.12 + cupX) * 4;
          ctx.beginPath();
          ctx.moveTo(cupX - 5, cupY - 3);
          ctx.quadraticCurveTo(cupX - 5 + steamShift, cupY - 12, cupX - 5, cupY - 22);
          ctx.moveTo(cupX + 5, cupY - 3);
          ctx.quadraticCurveTo(cupX + 5 - steamShift, cupY - 12, cupX + 5, cupY - 22);
          ctx.stroke();

          ctx.restore();
        }
      }

      // Level 67 Special Background Feature: "CARTOON 67 DECAL & CUPPED HANDS MEME"
      if (state.level === 67) {
        const centerX = canvas.width / 2;
        const numberY = 82;

        // Animated Snap Phase:
        // Phase 0 ("6" / "Six"): Left hand UP, Right hand DOWN
        // Phase 1 ("7" / "Seven"): Right hand UP, Left hand DOWN
        const isSixPhase = Math.floor(state.frameCount / 14) % 2 === 0;

        const handYBase = 145;
        const deltaY = 18; // snap displacement distance

        const leftX = centerX - 58;
        const rightX = centerX + 58;

        const leftY = isSixPhase ? handYBase - deltaY : handYBase + deltaY;
        const rightY = isSixPhase ? handYBase + deltaY : handYBase - deltaY;

        ctx.save();

        // 1. GIANT CARTOON "67" NUMBERS (Matching Sticker Image)
        ctx.font = "900 78px 'Arial Black', Impact, sans-serif";
        ctx.textAlign = "center";
        ctx.textBaseline = "middle";

        // Outer Heavy Black Shadow & Outline
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 18;
        ctx.lineJoin = "miter";
        ctx.miterLimit = 2;
        ctx.strokeText("67", centerX, numberY);

        // Middle White Border Padding
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 8;
        ctx.strokeText("67", centerX, numberY);

        // Solid Black Number Fill
        ctx.fillStyle = "#09090b";
        ctx.fillText("67", centerX, numberY);

        // 2. HELPER FUNCTION TO DRAW CARTOON CUPPED HANDS (White fill, thick black strokes, knuckles)
        const drawCartoonHand = (hx: number, hy: number, isRightHand: boolean, isActive: boolean) => {
          ctx.save();
          ctx.translate(hx, hy);
          if (isRightHand) {
            ctx.scale(-1, 1); // Flip horizontally for right hand
          }

          // Thick black cartoon outlines with crisp white glove fill
          ctx.lineWidth = 3.5;
          ctx.strokeStyle = "#000000";
          ctx.fillStyle = isActive ? "#ffffff" : "#f1f5f9";
          ctx.lineCap = "round";
          ctx.lineJoin = "round";

          // Main Cupped Palm Bowl
          ctx.beginPath();
          ctx.moveTo(-22, -2);
          ctx.bezierCurveTo(-24, 18, 18, 20, 24, -2);
          ctx.bezierCurveTo(16, -10, -16, -10, -22, -2);
          ctx.closePath();
          ctx.fill();
          ctx.stroke();

          // 4 Curving Fingers extended upwards (Index, Middle, Ring, Pinky)
          const fingerXs = [-14, -5, 4, 13];
          fingerXs.forEach((fx) => {
            ctx.beginPath();
            ctx.moveTo(fx - 2, -6);
            ctx.bezierCurveTo(fx - 4, -18, fx + 4, -18, fx + 3, -6);
            ctx.fill();
            ctx.stroke();
          });

          // Thumb curving outwards on the left side
          ctx.beginPath();
          ctx.moveTo(-18, 2);
          ctx.bezierCurveTo(-30, -4, -26, -18, -14, -8);
          ctx.fill();
          ctx.stroke();

          // Knuckle and palm crease detail lines inside palm
          ctx.beginPath();
          ctx.moveTo(-12, 4);
          ctx.bezierCurveTo(-6, 12, 8, 12, 14, 4);
          ctx.moveTo(-8, 8);
          ctx.bezierCurveTo(-2, 14, 6, 14, 10, 8);
          ctx.stroke();

          ctx.restore();
        };

        // Draw Left Cartoon Hand
        drawCartoonHand(leftX, leftY, false, isSixPhase);
        // Draw Right Cartoon Hand
        drawCartoonHand(rightX, rightY, true, !isSixPhase);

        // Motion Snap Indicator Lines (Action lines for 67 snap movement)
        ctx.strokeStyle = "#000000";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        // Left hand motion snap lines
        ctx.moveTo(leftX - 35, leftY - 8);
        ctx.lineTo(leftX - 35, leftY + 8);
        ctx.moveTo(leftX - 40, leftY - 4);
        ctx.lineTo(leftX - 40, leftY + 4);

        // Right hand motion snap lines
        ctx.moveTo(rightX + 35, rightY - 8);
        ctx.lineTo(rightX + 35, rightY + 8);
        ctx.moveTo(rightX + 40, rightY - 4);
        ctx.lineTo(rightX + 40, rightY + 4);
        ctx.stroke();

        ctx.restore();
      }

      // 2. Hospital Floor Tile Line & Baseboard
      ctx.fillStyle = "#334155";
      ctx.fillRect(0, groundY, canvas.width, canvas.height - groundY);

      // Floor highlight line
      if (isRainbowMode) {
        const gGrad = ctx.createLinearGradient(0, groundY, canvas.width, groundY);
        gGrad.addColorStop(0, `hsl(${(state.frameCount * 4) % 360}, 100%, 60%)`);
        gGrad.addColorStop(0.5, `hsl(${(state.frameCount * 4 + 180) % 360}, 100%, 60%)`);
        gGrad.addColorStop(1, `hsl(${(state.frameCount * 4 + 360) % 360}, 100%, 60%)`);
        ctx.fillStyle = gGrad;
        ctx.fillRect(0, groundY, canvas.width, 4);
      } else {
        ctx.fillStyle = "#10b981";
        ctx.fillRect(0, groundY, canvas.width, 3);
      }

      // Tile grid lines on floor
      ctx.strokeStyle = "rgba(255, 255, 255, 0.1)";
      ctx.lineWidth = 1;
      for (let x = -((state.bgOffset * 1.5) % 40); x < canvas.width; x += 40) {
        ctx.beginPath();
        ctx.moveTo(x, groundY);
        ctx.lineTo(x - 20, canvas.height);
        ctx.stroke();
      }

      // 3. Render Chaser Character (Mario Jordan normally, Dottoressa at Level 100)
      const isLevel100Swapped = state.level === 100;
      const m = state.mario;

      if (isLevel100Swapped) {
        // --- LEVEL 100 SWAPPED ROLE: Dottoressa Filippa is the CHASER behind! ---
        const fChaserX = m.x;
        const fChaserY = m.y;
        const mLegAnim = Math.sin(state.frameCount * 0.4) * 8;

        // Dottoressa Filippa Chasing Pose
        // Pink Hair
        ctx.fillStyle = "#be185d";
        ctx.beginPath();
        ctx.ellipse(fChaserX + 18, fChaserY + 14, 16, 15, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#ec4899";
        ctx.beginPath();
        ctx.ellipse(fChaserX + 20, fChaserY + 12, 15, 14, 0, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = "#f472b6";
        ctx.beginPath();
        ctx.ellipse(fChaserX + 22, fChaserY + 8, 10, 7, 0, 0, Math.PI * 2);
        ctx.fill();

        // Hairpin & Face
        ctx.fillStyle = "#fbbf24";
        ctx.fillRect(fChaserX + 24, fChaserY + 4, 7, 4);
        ctx.fillStyle = "#fbcfe8";
        ctx.fillRect(fChaserX + 20, fChaserY + 14, 14, 14);
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(fChaserX + 28, fChaserY + 17, 3, 4); // Eye

        // White Lab Coat & Red Shirt
        ctx.fillStyle = "#ffffff";
        ctx.fillRect(fChaserX + 10, fChaserY + 28, 24, 24);
        ctx.fillStyle = "#dc2626";
        ctx.fillRect(fChaserX + 18, fChaserY + 28, 10, 14);

        // Stethoscope & Red Cross
        ctx.strokeStyle = "#1e293b";
        ctx.lineWidth = 2.5;
        ctx.beginPath();
        ctx.arc(fChaserX + 22, fChaserY + 28, 6, 0, Math.PI);
        ctx.stroke();
        ctx.fillStyle = "#ef4444";
        ctx.fillRect(fChaserX + 12, fChaserY + 33, 6, 2);
        ctx.fillRect(fChaserX + 14, fChaserY + 31, 2, 6);

        // Running Legs
        ctx.strokeStyle = "#ffffff";
        ctx.lineWidth = 5;
        ctx.lineCap = "round";
        ctx.beginPath();
        ctx.moveTo(fChaserX + 18, fChaserY + 52);
        ctx.lineTo(fChaserX + 18 + mLegAnim, groundY);
        ctx.moveTo(fChaserX + 26, fChaserY + 52);
        ctx.lineTo(fChaserX + 26 - mLegAnim, groundY);
        ctx.stroke();

        ctx.fillStyle = "#18181b";
        ctx.fillRect(fChaserX + 14 + mLegAnim, groundY - 2, 10, 4);
        ctx.fillRect(fChaserX + 22 - mLegAnim, groundY - 2, 10, 4);

        // Medical Stethoscope Chasing Spotlight Beam towards Mario
        const docBeamGrad = ctx.createLinearGradient(fChaserX + 34, fChaserY + 30, f.x, fChaserY + 30);
        docBeamGrad.addColorStop(0, "rgba(236, 72, 153, 0.45)");
        docBeamGrad.addColorStop(1, "rgba(236, 72, 153, 0.0)");
        ctx.fillStyle = docBeamGrad;
        ctx.beginPath();
        ctx.moveTo(fChaserX + 34, fChaserY + 20);
        ctx.lineTo(f.x + 10, fChaserY - 5);
        ctx.lineTo(f.x + 10, fChaserY + 65);
        ctx.lineTo(fChaserX + 34, fChaserY + 40);
        ctx.fill();

        // Label
        ctx.fillStyle = "#f472b6";
        ctx.font = "bold 10px sans-serif";
        ctx.fillText("👩‍⚕️ RINCORRE!", fChaserX - 5, fChaserY - 6);
      } else {
        // --- STANDARD: Render Mario Jordan (Security Guard with camera) ---
        // Body (Security dark coat)
        ctx.fillStyle = "#1e293b";
        ctx.fillRect(m.x + 10, m.y + 24, 28, 32);

        // Security Cap
        ctx.fillStyle = "#0f172a";
        ctx.fillRect(m.x + 8, m.y + 6, 30, 10);
        ctx.fillRect(m.x + 14, m.y + 2, 22, 6);

        // Head & Face
        ctx.fillStyle = "#f87171";
        ctx.fillRect(m.x + 14, m.y + 12, 18, 14);

        // Security Badge
        ctx.fillStyle = "#eab308";
        ctx.fillRect(m.x + 14, m.y + 28, 6, 8);

        // Running Legs
        ctx.strokeStyle = "#0f172a";
        ctx.lineWidth = 4;
        const mLegAnim = Math.sin(state.frameCount * 0.4) * 8;
        ctx.beginPath();
        ctx.moveTo(m.x + 18, m.y + 56);
        ctx.lineTo(m.x + 18 + mLegAnim, groundY);
        ctx.moveTo(m.x + 30, m.y + 56);
        ctx.lineTo(m.x + 30 - mLegAnim, groundY);
        ctx.stroke();

        // Mario's Camera with Beam & REC Dot
        ctx.fillStyle = "#334155";
        ctx.fillRect(m.x + 34, m.y + 24, 18, 12); // Lens & Camera body
        ctx.fillStyle = "#000";
        ctx.fillRect(m.x + 50, m.y + 26, 6, 8);

        // Camera Flashlight/Recording Cone Beam towards Filippa
        const beamGrad = ctx.createLinearGradient(m.x + 54, m.y + 30, f.x, m.y + 30);
        beamGrad.addColorStop(0, "rgba(239, 68, 68, 0.35)");
        beamGrad.addColorStop(1, "rgba(239, 68, 68, 0.0)");
        ctx.fillStyle = beamGrad;
        ctx.beginPath();
        ctx.moveTo(m.x + 54, m.y + 26);
        ctx.lineTo(f.x + 10, m.y + 5);
        ctx.lineTo(f.x + 10, m.y + 55);
        ctx.lineTo(m.x + 54, m.y + 34);
        ctx.fill();

        // Red Blinking REC Dot
        if (m.recBlink) {
          ctx.fillStyle = "#ef4444";
          ctx.beginPath();
          ctx.arc(m.x + 38, m.y + 20, 3, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 9px sans-serif";
          ctx.fillText("REC", m.x + 44, m.y + 22);
        }
      }

      // 4. Render Main Runner Character (Filippa normally, Mario Jordan at Level 100)
      ctx.save();
      const fX = f.x;

      if (isLevel100Swapped) {
        // --- LEVEL 100 SWAPPED ROLE: Mario Jordan is the RUNNER fleeing in front! ---
        if (f.isJumping) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
          const shadowWidth = Math.max(10, 36 - (f.groundY - fY) * 0.2);
          ctx.beginPath();
          ctx.ellipse(fX + 22, groundY + 2, shadowWidth / 2, 4, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        if (f.isCrouching && !f.isJumping) {
          // Mario Jordan Crouching / Sliding
          ctx.fillStyle = "#1e293b"; // Body
          ctx.fillRect(fX + 4, fY + 16, 32, 16);

          ctx.fillStyle = "#0f172a"; // Cap
          ctx.fillRect(fX + 2, fY + 6, 28, 8);
          ctx.fillRect(fX + 8, fY + 2, 20, 5);

          ctx.fillStyle = "#f87171"; // Face
          ctx.fillRect(fX + 16, fY + 10, 14, 10);

          ctx.fillStyle = "#334155"; // Camera
          ctx.fillRect(fX + 28, fY + 16, 14, 10);

          ctx.fillStyle = "#0f172a"; // Sliding legs
          ctx.fillRect(fX - 4, fY + 26, 32, 6);
        } else {
          // Mario Jordan Running / Jumping
          const legAnim = f.isJumping ? 0 : Math.sin(state.frameCount * 0.45) * 12;

          // Body (Dark coat)
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(fX + 10, fY + 24, 28, 32);

          // Cap
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(fX + 8, fY + 6, 30, 10);
          ctx.fillRect(fX + 14, fY + 2, 22, 6);

          // Face
          ctx.fillStyle = "#f87171";
          ctx.fillRect(fX + 14, fY + 12, 18, 14);

          // Badge
          ctx.fillStyle = "#eab308";
          ctx.fillRect(fX + 14, fY + 28, 6, 8);

          // Camera in hand
          ctx.fillStyle = "#334155";
          ctx.fillRect(fX + 32, fY + 24, 16, 12);

          // Legs
          ctx.strokeStyle = "#0f172a";
          ctx.lineWidth = 5;
          ctx.lineCap = "round";

          if (f.isJumping) {
            ctx.beginPath();
            ctx.moveTo(fX + 18, fY + 52);
            ctx.lineTo(fX + 28, fY + 54);
            ctx.lineTo(fX + 32, fY + 46);
            ctx.moveTo(fX + 28, fY + 52);
            ctx.lineTo(fX + 16, fY + 56);
            ctx.lineTo(fX + 12, fY + 50);
            ctx.stroke();
          } else {
            ctx.beginPath();
            ctx.moveTo(fX + 18, fY + 52);
            ctx.lineTo(fX + 18 + legAnim, groundY);
            ctx.moveTo(fX + 30, fY + 52);
            ctx.lineTo(fX + 30 - legAnim, groundY);
            ctx.stroke();
          }
        }
      } else {
        // --- STANDARD: Render Filippa Cira (Doctor with Pink Hair) ---
        // Drop shadow on floor when jumping
        if (f.isJumping) {
          ctx.fillStyle = "rgba(0, 0, 0, 0.3)";
          const shadowWidth = Math.max(10, 36 - (f.groundY - fY) * 0.2);
          ctx.beginPath();
          ctx.ellipse(fX + 22, groundY + 2, shadowWidth / 2, 4, 0, 0, Math.PI * 2);
          ctx.fill();
        }

        if (f.isCrouching && !f.isJumping) {
          // --- HIGH QUALITY CROUCHING / SLIDING POSE ---
          // Pink Hair (Streaming back horizontally)
          ctx.fillStyle = "#be185d";
          ctx.beginPath();
          ctx.ellipse(fX + 8, fY + 12, 16, 10, 0, 0, Math.PI * 2);
          ctx.fill();

          ctx.fillStyle = "#ec4899";
          ctx.beginPath();
          ctx.ellipse(fX + 10, fY + 11, 15, 9, 0, 0, Math.PI * 2);
          ctx.fill();

          // Shiny Pink Hair Highlight
          ctx.fillStyle = "#f472b6";
          ctx.beginPath();
          ctx.ellipse(fX + 12, fY + 8, 9, 5, 0, 0, Math.PI * 2);
          ctx.fill();

          // Face & Hairpin
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(fX + 22, fY + 4, 6, 3);
          ctx.fillStyle = "#fbcfe8";
          ctx.fillRect(fX + 20, fY + 8, 14, 12);
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(fX + 28, fY + 11, 3, 3); // Eye

          // Flapping White Doctor Lab Coat (Blowing behind in slide)
          ctx.fillStyle = "#ffffff";
          ctx.beginPath();
          ctx.moveTo(fX + 12, fY + 16);
          ctx.lineTo(fX - 8, fY + 18);
          ctx.lineTo(fX + 10, fY + 30);
          ctx.lineTo(fX + 38, fY + 30);
          ctx.lineTo(fX + 34, fY + 16);
          ctx.closePath();
          ctx.fill();

          // Red Shirt (Maglietta Rossa)
          ctx.fillStyle = "#dc2626";
          ctx.fillRect(fX + 18, fY + 16, 12, 10);

          // Stethoscope around neck (Stetoscopio al collo)
          ctx.strokeStyle = "#1e293b";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(fX + 22, fY + 16, 5, 0, Math.PI);
          ctx.stroke();
          ctx.fillStyle = "#cbd5e1";
          ctx.beginPath();
          ctx.arc(fX + 26, fY + 22, 2, 0, Math.PI * 2);
          ctx.fill();

          // White Trousers (Pantaloni Bianchi)
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(fX + 2, fY + 24, 28, 9);
          ctx.fillStyle = "#e2e8f0";
          ctx.fillRect(fX + 2, fY + 31, 28, 2);

          // Black Shoes (Scarpe Nere) sliding on floor
          ctx.fillStyle = "#18181b";
          ctx.fillRect(fX - 4, fY + 28, 12, 6); // Back shoe
          ctx.fillRect(fX + 24, fY + 28, 12, 6); // Front shoe sliding
        } else {
          // --- RUNNING / JUMPING POSE ---
          const legAnim = f.isJumping ? 0 : Math.sin(state.frameCount * 0.45) * 12;

          // VIBRANT MULTI-TONE PINK HAIR (Filippa Cira)
          // Shadow hair layer
          ctx.fillStyle = "#be185d";
          ctx.beginPath();
          ctx.ellipse(fX + 18, fY + 14, 16, 15, 0, 0, Math.PI * 2);
          ctx.fill();

          // Main pink volume
          ctx.fillStyle = "#ec4899";
          ctx.beginPath();
          ctx.ellipse(fX + 20, fY + 12, 15, 14, 0, 0, Math.PI * 2);
          ctx.fill();

          // Shiny Pink Hair Highlight
          ctx.fillStyle = "#f472b6";
          ctx.beginPath();
          ctx.ellipse(fX + 22, fY + 8, 10, 7, 0, 0, Math.PI * 2);
          ctx.fill();

          // Flowing Ponytail / Lock
          ctx.fillStyle = "#db2777";
          ctx.beginPath();
          ctx.moveTo(fX + 10, fY + 8);
          ctx.quadraticCurveTo(fX - 10, fY + 14, fX - 16, fY + 28);
          ctx.quadraticCurveTo(fX + 2, fY + 22, fX + 14, fY + 18);
          ctx.fill();

          // Headband & Hairpin
          ctx.fillStyle = "#fbbf24";
          ctx.fillRect(fX + 24, fY + 4, 7, 4);

          // Face Skin Tone
          ctx.fillStyle = "#fbcfe8";
          ctx.fillRect(fX + 20, fY + 14, 14, 14);

          // Eye & Blush
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(fX + 28, fY + 17, 3, 4);
          ctx.fillStyle = "#f43f5e";
          ctx.fillRect(fX + 26, fY + 22, 4, 2);

          // Doctor's White Lab Coat Body & Shadow Line
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(fX + 10, fY + 28, 24, 24);
          ctx.fillStyle = "#e2e8f0";
          ctx.fillRect(fX + 10, fY + 28, 4, 24); // Coat shadow line

          // Red Shirt (Maglietta Rossa)
          ctx.fillStyle = "#dc2626";
          ctx.fillRect(fX + 18, fY + 28, 10, 14);

          // Stethoscope details (Stetoscopio al collo)
          ctx.strokeStyle = "#1e293b";
          ctx.lineWidth = 2.5;
          ctx.beginPath();
          ctx.arc(fX + 22, fY + 28, 6, 0, Math.PI);
          ctx.stroke();
          ctx.fillStyle = "#cbd5e1";
          ctx.beginPath();
          ctx.arc(fX + 27, fY + 34, 2.5, 0, Math.PI * 2);
          ctx.fill();

          // Red Cross Badge on Sleeve
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(fX + 12, fY + 33, 6, 2);
          ctx.fillRect(fX + 14, fY + 31, 2, 6);

          // White Trousers (Pantaloni Bianchi) & Black Shoes (Scarpe Nere)
          ctx.strokeStyle = "#ffffff"; // White trousers
          ctx.lineWidth = 5;
          ctx.lineCap = "round";

          if (f.isJumping) {
            // --- JUMPING LEGS: White trousers with feet lifted up in air ---
            ctx.beginPath();
            // Front leg bent up
            ctx.moveTo(fX + 16, fY + 50);
            ctx.lineTo(fX + 26, fY + 54);
            ctx.lineTo(fX + 32, fY + 46);
            // Back leg tucked
            ctx.moveTo(fX + 26, fY + 50);
            ctx.lineTo(fX + 14, fY + 56);
            ctx.lineTo(fX + 10, fY + 50);
            ctx.stroke();

            // Black Shoes (Scarpe Nere lifted up in air!)
            ctx.fillStyle = "#18181b";
            ctx.fillRect(fX + 30, fY + 44, 9, 5);
            ctx.fillRect(fX + 6, fY + 48, 9, 5);
          } else {
            // --- RUNNING LEGS: White trousers alternating relative to fY ---
            const leg1Y = fY + 62;
            const leg2Y = fY + 62;

            ctx.beginPath();
            // Left leg
            ctx.moveTo(fX + 18, fY + 50);
            ctx.lineTo(fX + 18 + legAnim, leg1Y);
            // Right leg
            ctx.moveTo(fX + 26, fY + 50);
            ctx.lineTo(fX + 26 - legAnim, leg2Y);
            ctx.stroke();

            // Black Shoes (Scarpe Nere at bottom of legs)
            ctx.fillStyle = "#18181b";
            ctx.fillRect(fX + 14 + legAnim, leg1Y - 2, 10, 4);
            ctx.fillRect(fX + 22 - legAnim, leg2Y - 2, 10, 4);
          }
        }
      }
      ctx.restore();

      // 5. Render Obstacles
      for (const obs of state.obstacles) {
        ctx.save();
        if (obs.type === "barella") {
          // Medical Stretcher
          ctx.fillStyle = "#94a3b8";
          ctx.fillRect(obs.x, obs.y + 16, obs.width, 10); // Frame
          ctx.fillStyle = "#38bdf8";
          ctx.fillRect(obs.x + 2, obs.y + 6, obs.width - 4, 10); // Mattress
          // Wheels
          ctx.fillStyle = "#000";
          ctx.beginPath();
          ctx.arc(obs.x + 8, obs.y + 32, 5, 0, Math.PI * 2);
          ctx.arc(obs.x + obs.width - 8, obs.y + 32, 5, 0, Math.PI * 2);
          ctx.fill();
          // IV Pole on stretcher
          ctx.fillStyle = "#cbd5e1";
          ctx.fillRect(obs.x + 4, obs.y - 10, 3, 26);
          ctx.fillStyle = "#ef4444";
          ctx.fillRect(obs.x + 1, obs.y - 12, 9, 4);
        } else if (obs.type === "sedia") {
          // Low-profile Hospital Wheelchair (Sedia a Rotelle Bassa)
          const sw = obs.width;
          const sh = obs.height;

          // Metallic Frame structure (Silver/Chrome)
          ctx.strokeStyle = "#e2e8f0";
          ctx.lineWidth = 2.5;

          // Backrest frame & Push handles
          ctx.beginPath();
          ctx.moveTo(obs.x + 6, obs.y + sh - 8);
          ctx.lineTo(obs.x + 6, obs.y + 4); // Back pole
          ctx.lineTo(obs.x + 1, obs.y + 4); // Push handle
          ctx.stroke();

          // Black rubber handle grip
          ctx.fillStyle = "#0f172a";
          ctx.fillRect(obs.x - 2, obs.y + 2, 5, 4);

          // Seat Frame bar
          ctx.beginPath();
          ctx.moveTo(obs.x + 6, obs.y + sh - 16);
          ctx.lineTo(obs.x + sw - 6, obs.y + sh - 16); // Seat bar
          ctx.lineTo(obs.x + sw - 4, obs.y + sh - 6);  // Leg rest bar
          ctx.stroke();

          // Footrest plate
          ctx.fillStyle = "#64748b";
          ctx.fillRect(obs.x + sw - 8, obs.y + sh - 5, 8, 3);

          // Blue Padded Cushion (Seat & Backrest)
          ctx.fillStyle = "#0284c7"; // Bright hospital blue
          ctx.fillRect(obs.x + 8, obs.y + sh - 18, sw - 14, 5); // Cushion
          ctx.fillStyle = "#0369a1";
          ctx.fillRect(obs.x + 8, obs.y + 8, 4, sh - 24); // Backrest pad

          // Large Rear Wheel with spokes
          const rearX = obs.x + 14;
          const rearY = obs.y + sh - 12;
          const rearR = 11;

          ctx.strokeStyle = "#f8fafc";
          ctx.lineWidth = 2;
          ctx.beginPath();
          ctx.arc(rearX, rearY, rearR, 0, Math.PI * 2);
          ctx.stroke();

          // Outer Push Rim
          ctx.strokeStyle = "#94a3b8";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.arc(rearX, rearY, rearR + 1.5, 0, Math.PI * 2);
          ctx.stroke();

          // Wheel Hub & Spokes
          ctx.fillStyle = "#cbd5e1";
          ctx.beginPath();
          ctx.arc(rearX, rearY, 3, 0, Math.PI * 2);
          ctx.fill();

          ctx.strokeStyle = "rgba(226, 232, 240, 0.6)";
          ctx.lineWidth = 1;
          ctx.beginPath();
          ctx.moveTo(rearX - rearR + 2, rearY); ctx.lineTo(rearX + rearR - 2, rearY);
          ctx.moveTo(rearX, rearY - rearR + 2); ctx.lineTo(rearX, rearY + rearR - 2);
          ctx.moveTo(rearX - 7, rearY - 7); ctx.lineTo(rearX + 7, rearY + 7);
          ctx.moveTo(rearX - 7, rearY + 7); ctx.lineTo(rearX + 7, rearY - 7);
          ctx.stroke();

          // Front Caster Wheel (Small wheel on floor)
          const frontX = obs.x + sw - 8;
          const frontY = obs.y + sh - 4;
          ctx.fillStyle = "#334155";
          ctx.beginPath();
          ctx.arc(frontX, frontY, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.fillStyle = "#f1f5f9";
          ctx.beginPath();
          ctx.arc(frontX, frontY, 1.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (obs.type === "cartello") {
          // Cono Stradale (Orange Traffic Cone with reflective stripes)
          const coneW = obs.width;
          const coneH = obs.height;

          // Black/Dark slate sturdy base
          ctx.fillStyle = "#1e293b";
          ctx.fillRect(obs.x - 2, obs.y + coneH - 6, coneW + 4, 6);

          // Orange cone body
          ctx.fillStyle = "#ea580c";
          ctx.beginPath();
          ctx.moveTo(obs.x + coneW / 2, obs.y);
          ctx.lineTo(obs.x + coneW + 2, obs.y + coneH - 6);
          ctx.lineTo(obs.x - 2, obs.y + coneH - 6);
          ctx.closePath();
          ctx.fill();

          // Reflective white stripes
          ctx.fillStyle = "#f8fafc";

          // Top reflective band
          ctx.beginPath();
          ctx.moveTo(obs.x + coneW / 2 - 4, obs.y + 10);
          ctx.lineTo(obs.x + coneW / 2 + 4, obs.y + 10);
          ctx.lineTo(obs.x + coneW / 2 + 7, obs.y + 17);
          ctx.lineTo(obs.x + coneW / 2 - 7, obs.y + 17);
          ctx.closePath();
          ctx.fill();

          // Bottom reflective band
          ctx.beginPath();
          ctx.moveTo(obs.x + coneW / 2 - 9, obs.y + 23);
          ctx.lineTo(obs.x + coneW / 2 + 9, obs.y + 23);
          ctx.lineTo(obs.x + coneW / 2 + 12, obs.y + 30);
          ctx.lineTo(obs.x + coneW / 2 - 12, obs.y + 30);
          ctx.closePath();
          ctx.fill();
        } else if (obs.type === "defibrillatore") {
          // Defibrillatore DAE a Parete (Wall-Mounted AED Unit)
          const aedW = obs.width;
          const aedH = obs.height;

          // Render Overhead Medical Gauze Bandage Banner hanging from ceiling (y=0) down to groundY - 50
          if (obs.hasOverheadBandage) {
            const bX = obs.x - 8;
            const bW = aedW + 16;
            const bBottom = groundY - 50;

            // Ceiling Metal Clamps
            ctx.fillStyle = "#64748b";
            ctx.fillRect(bX + 2, 0, 8, 12);
            ctx.fillRect(bX + bW - 10, 0, 8, 12);

            // Gauze Bandage Cloth Fabric
            ctx.fillStyle = "#fef3c7"; // Off-white cream gauze cloth
            ctx.fillRect(bX, 0, bW, bBottom);

            // Gauze Woven Threads / Crosshatch Pattern
            ctx.strokeStyle = "#fde68a";
            ctx.lineWidth = 1;
            for (let gy = 12; gy < bBottom - 14; gy += 12) {
              ctx.beginPath();
              ctx.moveTo(bX, gy);
              ctx.lineTo(bX + bW, gy);
              ctx.stroke();
            }
            for (let gx = bX + 6; gx < bX + bW; gx += 8) {
              ctx.beginPath();
              ctx.moveTo(gx, 0);
              ctx.lineTo(gx, bBottom - 14);
              ctx.stroke();
            }

            // Red Emergency Crosses on Bandage Banner
            ctx.fillStyle = "#ef4444";
            ctx.fillRect(bX + bW / 2 - 3, 20, 6, 16);
            ctx.fillRect(bX + bW / 2 - 8, 25, 16, 6);

            ctx.fillRect(bX + bW / 2 - 3, 65, 6, 16);
            ctx.fillRect(bX + bW / 2 - 8, 70, 16, 6);

            // Red Warning Border Tape at bottom of Bandage ("⬇️ SCIVOLA!")
            ctx.fillStyle = "#dc2626";
            ctx.fillRect(bX, bBottom - 14, bW, 14);

            ctx.fillStyle = "#ffffff";
            ctx.font = "900 8px sans-serif";
            ctx.textAlign = "center";
            ctx.fillText("⬇️ SCIVOLA", bX + bW / 2, bBottom - 3);
          }

          // Wall mounting bracket bar on top
          ctx.fillStyle = "#475569";
          ctx.fillRect(obs.x + aedW / 2 - 3, obs.y - 10, 6, 12);
          ctx.fillStyle = "#334155";
          ctx.fillRect(obs.x + aedW / 2 - 8, obs.y - 12, 16, 4);

          // AED Emergency Yellow/Red Wall Box
          ctx.fillStyle = "#f59e0b"; // Bright AED Yellow
          ctx.fillRect(obs.x, obs.y, aedW, aedH);

          // Red Border Accent
          ctx.fillStyle = "#dc2626";
          ctx.fillRect(obs.x, obs.y, aedW, 4);
          ctx.fillRect(obs.x, obs.y + aedH - 4, aedW, 4);

          // Glass Window displaying Defibrillator inside
          ctx.fillStyle = "#0284c7";
          ctx.fillRect(obs.x + 5, obs.y + 8, aedW - 10, aedH - 20);

          // Heart & Lightning Icon
          ctx.fillStyle = "#ef4444"; // Red Heart
          ctx.beginPath();
          ctx.arc(obs.x + aedW / 2 - 4, obs.y + 18, 4, 0, Math.PI * 2);
          ctx.arc(obs.x + aedW / 2 + 4, obs.y + 18, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.beginPath();
          ctx.moveTo(obs.x + aedW / 2 - 8, obs.y + 19);
          ctx.lineTo(obs.x + aedW / 2, obs.y + 26);
          ctx.lineTo(obs.x + aedW / 2 + 8, obs.y + 19);
          ctx.closePath();
          ctx.fill();

          // DAE / AED White Text label
          ctx.fillStyle = "#ffffff";
          ctx.font = "bold 9px sans-serif";
          ctx.textAlign = "center";
          ctx.fillText("DAE", obs.x + aedW / 2, obs.y + aedH - 7);

          // Status LED Light (Blinking Green)
          ctx.fillStyle = state.frameCount % 30 < 15 ? "#22c55e" : "#15803d";
          ctx.beginPath();
          ctx.arc(obs.x + aedW - 5, obs.y + 6, 2.5, 0, Math.PI * 2);
          ctx.fill();
        } else if (obs.type === "medikit") {
          // Medikit Verde (High-Visibility Green First Aid Kit with Glow)
          const boxW = obs.width;
          const boxH = obs.height;

          // Glowing Green Aura for High Visibility
          ctx.shadowColor = "#22c55e";
          ctx.shadowBlur = 10;

          // Metallic handle on top
          ctx.strokeStyle = "#f8fafc";
          ctx.lineWidth = 3;
          ctx.beginPath();
          ctx.rect(obs.x + boxW / 2 - 8, obs.y, 16, 6);
          ctx.stroke();

          // Main green medical case
          ctx.fillStyle = "#16a34a"; // Vibrant Emergency Green
          ctx.fillRect(obs.x, obs.y + 5, boxW, boxH - 5);

          // Darker green bottom shadow
          ctx.fillStyle = "#15803d";
          ctx.fillRect(obs.x, obs.y + boxH - 4, boxW, 4);

          // Metallic latches
          ctx.shadowBlur = 0; // Reset glow for sharp details
          ctx.fillStyle = "#e2e8f0";
          ctx.fillRect(obs.x + 4, obs.y + 6, 4, 6);
          ctx.fillRect(obs.x + boxW - 8, obs.y + 6, 4, 6);

          // Bold White Emergency Cross (+)
          ctx.fillStyle = "#ffffff";
          ctx.fillRect(obs.x + boxW / 2 - 4, obs.y + 10, 8, 16);
          ctx.fillRect(obs.x + boxW / 2 - 9, obs.y + 14, 18, 8);
        }
        ctx.restore();
      }

      // Restore inverted orientation context if active
      if (isInvertedOrientation) {
        ctx.restore();
      }

      animId = requestAnimationFrame(loop);
    };

    animId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(animId);
      state.running = false;
    };
  }, [hasStarted, gameOver]);

  // Controls handler
  useEffect(() => {
    if (!hasStarted || gameOver) return;

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.code === "Escape" || e.code === "KeyP") {
        e.preventDefault();
        togglePause();
        return;
      }

      const state = gameStateRef.current;
      if (!state.running || isPausedRef.current) return;

      if (e.code === "Space" || e.code === "KeyW" || e.code === "ArrowUp") {
        e.preventDefault();
        if (!state.filippa.isJumping) {
          state.filippa.isJumping = true;
          state.filippa.vy = -14.5;
          playSound("jump");
        }
      } else if (e.code === "KeyS" || e.code === "ArrowDown") {
        e.preventDefault();
        if (!state.filippa.isCrouching) {
          state.filippa.isCrouching = true;
          playSound("duck");
        }
      }
    };

    const handleKeyUp = (e: KeyboardEvent) => {
      const state = gameStateRef.current;
      if (e.code === "KeyS" || e.code === "ArrowDown") {
        state.filippa.isCrouching = false;
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("keyup", handleKeyUp);

    return () => {
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("keyup", handleKeyUp);
    };
  }, [hasStarted, gameOver]);

  // Touch handlers for Mobile / Tablet
  const handleTouchStart = (e: React.TouchEvent) => {
    touchStartYRef.current = e.touches[0].clientY;
  };

  const handleTouchEnd = (e: React.TouchEvent) => {
    if (touchStartYRef.current === null) return;
    const touchEndY = e.changedTouches[0].clientY;
    const diffY = touchEndY - touchStartYRef.current;

    const state = gameStateRef.current;
    if (!state.running) return;

    if (diffY < -25) {
      // Swipe Up -> Jump
      if (!state.filippa.isJumping) {
        state.filippa.isJumping = true;
        state.filippa.vy = -14.5;
        playSound("jump");
      }
    } else if (diffY > 25) {
      // Swipe Down -> Crouch
      state.filippa.isCrouching = true;
      playSound("duck");
      setTimeout(() => {
        state.filippa.isCrouching = false;
      }, 600);
    } else {
      // Tap -> Jump
      if (!state.filippa.isJumping) {
        state.filippa.isJumping = true;
        state.filippa.vy = -14.5;
        playSound("jump");
      }
    }
    touchStartYRef.current = null;
  };

  const triggerMobileJump = () => {
    const state = gameStateRef.current;
    if (state.running && !state.filippa.isJumping) {
      state.filippa.isJumping = true;
      state.filippa.vy = -14.5;
      playSound("jump");
    }
  };

  const triggerMobileCrouch = () => {
    const state = gameStateRef.current;
    if (state.running) {
      state.filippa.isCrouching = true;
      playSound("duck");
      setTimeout(() => {
        state.filippa.isCrouching = false;
      }, 600);
    }
  };

  const isRainbowLevel = level >= 50 && level <= 52;
  const isMeme67Level = level === 67;
  const isInvertedLevel = level >= 80 && level <= 83;
  const isLevel100Swapped = level === 100;
  const isBwLevel = !isRainbowLevel && !isMeme67Level && !isInvertedLevel && !isLevel100Swapped && level >= 15 && level % 10 === 5;
  const isCoffeeLevel = !isRainbowLevel && !isMeme67Level && !isInvertedLevel && !isLevel100Swapped && level >= 10 && level % 10 === 0;

  return (
    <div className="min-h-screen bg-[#090a0f] text-slate-100 flex flex-col justify-between selection:bg-pink-500 selection:text-white font-sans">
      {/* Header Bar */}
      <header className="border-b border-slate-800 bg-[#0f1118]/90 backdrop-blur-md px-2.5 sm:px-8 py-2 sm:py-3.5 flex items-center justify-between sticky top-0 z-50">
        <div className="flex items-center gap-2 sm:gap-3">
          <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-xl bg-gradient-to-tr from-pink-600 to-rose-400 p-0.5 shadow-lg shadow-pink-500/20 flex items-center justify-center shrink-0">
            <div className="w-full h-full bg-[#090a0f] rounded-[10px] flex items-center justify-center">
              <Camera className="w-4 h-4 sm:w-5 sm:h-5 text-pink-400 animate-pulse" />
            </div>
          </div>
          <div>
            <div className="flex items-center gap-1.5 sm:gap-2">
              <h1 className="text-xs sm:text-base font-black tracking-wide text-white uppercase">
                FILIPPA RUNNER 2D
              </h1>
              <span className="hidden xs:inline-block px-1.5 sm:px-2 py-0.5 text-[9px] sm:text-[10px] font-bold rounded-full bg-pink-500/20 text-pink-300 border border-pink-500/30 whitespace-nowrap">
                EMS Easter Egg
              </span>
            </div>
            <p className="text-[10px] sm:text-[11px] text-slate-400 font-medium truncate max-w-[200px] sm:max-w-none">
              Ospedale Emerals RP • Filippa Cira VS Mario Jordan
            </p>
          </div>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3 shrink-0">
          <button
            onClick={() => setIsAudioMenuOpen(true)}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-pink-500/20 hover:bg-pink-500/30 text-pink-300 border border-pink-500/40 font-extrabold text-xs transition-all flex items-center gap-1 sm:gap-1.5 cursor-pointer shadow-sm hover:shadow-pink-500/20"
            title="Apri Mini Menù Audio e Musica"
          >
            <Music size={16} className="text-pink-400 shrink-0 animate-pulse" />
            <span className="hidden sm:inline">Mini-Menù Audio</span>
          </button>

          <button
            onClick={() => {
              fetchLeaderboard();
              setIsLeaderboardOpen(true);
            }}
            className="px-2.5 sm:px-3 py-1.5 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 text-amber-300 border border-amber-500/40 font-extrabold text-xs transition-all flex items-center gap-1 sm:gap-1.5 cursor-pointer shadow-sm hover:shadow-amber-500/20"
            title="Visualizza Classifica Totale"
          >
            <Award size={16} className="text-amber-400 shrink-0" />
            <span className="hidden sm:inline">Classifica Totale</span>
          </button>

          <button
            onClick={() => setSoundEnabled(!soundEnabled)}
            className="p-1.5 sm:p-2 rounded-lg bg-slate-800/80 hover:bg-slate-700 text-slate-300 border border-slate-700 transition-all cursor-pointer"
            title={soundEnabled ? "Disattiva Audio" : "Attiva Audio"}
          >
            {soundEnabled ? <Volume2 size={16} className="text-emerald-400 sm:w-[18px] sm:h-[18px]" /> : <VolumeX size={16} className="text-slate-500 sm:w-[18px] sm:h-[18px]" />}
          </button>

          {onClose && (
            <button
              onClick={onClose}
              className="p-1.5 sm:p-2 rounded-lg bg-red-950/50 hover:bg-red-900/80 text-red-300 border border-red-500/30 transition-all flex items-center gap-1 sm:gap-1.5 text-xs font-bold cursor-pointer"
            >
              <X size={16} className="sm:w-[18px] sm:h-[18px]" />
              <span className="hidden sm:inline">Chiudi</span>
            </button>
          )}
        </div>
      </header>

      {/* Main Game Stage */}
      <main className="flex-1 flex flex-col items-center justify-center p-1.5 sm:p-6 max-w-5xl mx-auto w-full">
        {!hasStarted ? (
          /* PRE-GAME REGISTRATION SCREEN */
          <div className="w-full max-w-xl bg-[#12141f] border border-slate-800 rounded-2xl sm:rounded-3xl p-4 sm:p-8 shadow-2xl relative overflow-hidden backdrop-blur-xl animate-fadeIn">
            <div className="absolute top-0 right-0 w-64 h-64 bg-pink-500/10 rounded-full blur-3xl -z-10 pointer-events-none" />

            <div className="text-center space-y-2 sm:space-y-3 mb-4 sm:mb-6">
              <span className="px-2.5 py-0.5 sm:px-3 sm:py-1 rounded-full text-[10px] sm:text-xs font-bold uppercase tracking-wider bg-pink-500/20 text-pink-300 border border-pink-500/30">
                Dino Runner Edition Ospedaliera
              </span>
              <h2 className="text-xl sm:text-3xl font-black text-white">
                Inserisci il tuo nome per iniziare
              </h2>
              <p className="text-xs sm:text-sm text-slate-400 leading-relaxed">
                Aiuta la Dottoressa <strong className="text-pink-400">Filippa Cira</strong> (capelli rosa, maglietta rossa e camice) a correre tra i corridoi dell'ospedale ed evitare gli ostacoli, mentre viene sorvegliata dal capo security <strong className="text-amber-400">Mario Jordan</strong>!
              </p>
            </div>

            {/* Character Cards */}
            <div className="grid grid-cols-2 gap-2 sm:gap-3 mb-4 sm:mb-6">
              <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-pink-950/30 border border-pink-500/30 flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-pink-500/20 flex items-center justify-center text-pink-300 text-lg sm:text-xl font-bold shrink-0">
                  👩‍⚕️
                </div>
                <div>
                  <div className="text-[11px] sm:text-xs font-black text-pink-300 uppercase">Filippa Cira</div>
                  <div className="text-[9px] sm:text-[10px] text-pink-200/70">Medico Capelli Rosa</div>
                </div>
              </div>

              <div className="p-2.5 sm:p-3.5 rounded-xl sm:rounded-2xl bg-amber-950/30 border border-amber-500/30 flex items-center gap-2 sm:gap-3">
                <div className="w-8 h-8 sm:w-10 sm:h-10 rounded-lg sm:rounded-xl bg-amber-500/20 flex items-center justify-center text-amber-300 text-lg sm:text-xl font-bold shrink-0">
                  📹
                </div>
                <div>
                  <div className="text-[11px] sm:text-xs font-black text-amber-300 uppercase">Mario Jordan</div>
                  <div className="text-[9px] sm:text-[10px] text-amber-200/70">Security Telecamera</div>
                </div>
              </div>
            </div>

            {/* MASTER KEY LEVEL SELECTOR BOX */}
            <div className="mb-4 sm:mb-5">
              {isMasterUnlocked ? (
                <div className="p-3.5 sm:p-4 bg-gradient-to-r from-amber-950/60 to-amber-900/40 border border-amber-500/50 rounded-2xl space-y-2.5 shadow-lg shadow-amber-500/10">
                  <div className="flex items-center justify-between">
                    <span className="text-xs sm:text-sm font-black text-amber-300 flex items-center gap-2">
                      <Key className="w-4 h-4 text-amber-400 shrink-0" />
                      Chiave Master Attiva: Seleziona Livello di Partenza
                    </span>
                    <span className="text-[10px] bg-amber-500/25 text-amber-200 font-extrabold px-2 py-0.5 rounded-full border border-amber-500/40 uppercase">
                      Master Access
                    </span>
                  </div>

                  <div className="space-y-2">
                    <div className="flex items-center gap-3">
                      <label className="text-xs font-bold text-slate-300 shrink-0">
                        Livello Iniziale:
                      </label>
                      <input
                        type="number"
                        min={1}
                        max={100}
                        value={startLevel}
                        onChange={(e) => setStartLevel(Math.max(1, Math.min(100, Number(e.target.value) || 1)))}
                        className="w-20 bg-slate-950 border border-amber-500/60 rounded-xl px-2.5 py-1 text-xs font-black text-amber-300 text-center focus:outline-none focus:ring-2 focus:ring-amber-400"
                      />
                      <span className="text-[11px] font-bold text-amber-400">
                        {startLevel >= 50 && startLevel <= 52 ? "🌈 Modalità Rainbow (L50-52)" : startLevel === 67 ? "🔥 Meme 67" : startLevel >= 80 && startLevel <= 83 ? "🔄 Invertito (Dx ➔ Sx)" : startLevel === 100 ? "🔄 Ruoli Invertiti (Dottoressa Rincorre)" : startLevel >= 15 && startLevel % 10 === 5 ? "📼 Bianco e Nero" : startLevel >= 10 && startLevel % 10 === 0 ? "☕ Cappuccino Break" : `Lvl ${startLevel}`}
                      </span>
                    </div>

                    <div className="flex flex-wrap gap-1.5 pt-1">
                      {[1, 5, 10, 15, 20, 30, 49, 50, 67, 80, 100].map((lvl) => (
                        <button
                          key={lvl}
                          type="button"
                          onClick={() => setStartLevel(lvl)}
                          className={`px-2.5 py-1 rounded-xl text-[10px] font-bold cursor-pointer transition-all ${
                            startLevel === lvl
                              ? "bg-amber-500 text-slate-950 shadow-md font-black scale-105"
                              : "bg-slate-900/80 text-slate-300 hover:bg-slate-800 border border-slate-700/60"
                          }`}
                        >
                          Lvl {lvl} {lvl === 15 ? "📼" : lvl === 49 ? "⚡" : lvl === 50 ? "🌈" : lvl === 67 ? "🔥" : lvl === 80 ? "🔄" : lvl === 100 ? "🔄" : ""}
                        </button>
                      ))}
                    </div>

                    <div className="p-2.5 bg-slate-950/80 rounded-xl border border-amber-500/30 text-[11px] space-y-1">
                      {startLevel === 1 ? (
                        <p className="text-emerald-400 font-bold flex items-center gap-1.5">
                          <span>🏆 Modalità Ufficiale (Livello 1):</span>
                          <span className="text-slate-300 font-normal">Punteggi salvati in classifica pubblica.</span>
                        </p>
                      ) : (
                        <div className="space-y-1">
                          <div className="flex items-center justify-between">
                            <span className="text-amber-300 font-bold flex items-center gap-1">
                              <span>🧪 Run di Prova (Checkpoint Lvl {startLevel}):</span>
                            </span>
                            <button
                              type="button"
                              onClick={() => setStartLevel(1)}
                              className="text-[10px] bg-emerald-500/20 hover:bg-emerald-500/30 text-emerald-300 border border-emerald-500/40 px-2 py-0.5 rounded-lg transition-all font-bold cursor-pointer"
                            >
                              Ripristina Lvl 1 (Classifica)
                            </button>
                          </div>
                          <p className="text-slate-300 font-normal">
                            Parti già con <strong>{(startLevel - 1) * 200} punti</strong>! Trattandosi di una run di prova dal checkpoint, il punteggio non entrerà in classifica.
                          </p>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="space-y-2">
                  <button
                    type="button"
                    onClick={() => setShowMasterUnlockInput(!showMasterUnlockInput)}
                    className="text-xs text-amber-400 hover:text-amber-300 font-bold underline cursor-pointer flex items-center gap-1.5 transition-colors"
                  >
                    <Key size={14} className="text-amber-400" />
                    <span>Hai la Chiave Master? Sblocca la selezione del livello di partenza</span>
                  </button>

                  {showMasterUnlockInput && (
                    <div className="p-3 bg-slate-900 border border-amber-500/40 rounded-2xl space-y-2 animate-fadeIn">
                      <div className="flex items-center gap-2">
                        <input
                          type="password"
                          placeholder="Inserisci Chiave Master"
                          value={masterKeyInput}
                          onChange={(e) => setMasterKeyInput(e.target.value)}
                          className="flex-1 bg-slate-950 border border-slate-700 rounded-xl px-3 py-2 text-xs text-amber-300 font-mono focus:outline-none focus:border-amber-500"
                        />
                        <button
                          type="button"
                          onClick={handleVerifyMasterKey}
                          className="px-3.5 py-2 bg-amber-500 hover:bg-amber-400 text-slate-950 font-black text-xs rounded-xl cursor-pointer transition-all shadow-md"
                        >
                          Sblocca
                        </button>
                      </div>
                      {masterUnlockError && (
                        <p className="text-[11px] text-red-400 font-semibold">{masterUnlockError}</p>
                      )}
                    </div>
                  )}
                </div>
              )}
            </div>

            {/* Form */}
            <form onSubmit={handleSaveNameAndStart} className="space-y-3 sm:space-y-4">
              <div>
                <label className="block text-[11px] sm:text-xs font-bold uppercase tracking-wider text-slate-300 mb-1.5">
                  Nome Giocatore / Operatore EMS
                </label>
                <div className="relative">
                  <User className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-500" size={16} />
                  <input
                    type="text"
                    value={playerName}
                    onChange={(e) => setPlayerName(e.target.value)}
                    placeholder="Es. Dr. Simone, Filippa, Mario..."
                    required
                    maxLength={24}
                    className="w-full bg-[#0a0b10] border border-slate-700 rounded-xl pl-9 pr-3 py-2.5 sm:py-3 text-xs sm:text-sm text-white placeholder-slate-600 focus:outline-none focus:border-pink-500 focus:ring-1 focus:ring-pink-500 transition-all font-semibold"
                  />
                </div>
              </div>

              {/* Controls guide */}
              <div className="p-3 sm:p-4 rounded-xl sm:rounded-2xl bg-slate-900/80 border border-slate-800 space-y-1.5 sm:space-y-2 text-xs">
                <div className="font-bold text-slate-300 flex items-center gap-1.5 text-[11px] sm:text-xs">
                  <Sparkles size={14} className="text-pink-400" />
                  <span>Istruzioni di Gioco:</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-1.5 sm:gap-2 text-[10px] sm:text-[11px] text-slate-400">
                  <div className="flex items-center gap-2 bg-slate-800/50 p-1.5 sm:p-2 rounded-lg">
                    <span className="px-1.5 py-0.5 rounded bg-slate-700 font-mono text-white text-[9px] sm:text-[10px] font-bold">WASD / FRECCE</span>
                    <span>Salta / Scivola (Giù in volo = Caduta)</span>
                  </div>
                  <div className="flex items-center gap-2 bg-slate-800/50 p-1.5 sm:p-2 rounded-lg">
                    <span className="px-1.5 py-0.5 rounded bg-slate-700 font-mono text-white text-[9px] sm:text-[10px] font-bold">TOUCH / PULSANTI</span>
                    <span>Tocca Salta/Scivola</span>
                  </div>
                </div>
              </div>

              <button
                type="submit"
                className="w-full py-3.5 sm:py-4 rounded-xl bg-gradient-to-r from-pink-600 via-rose-500 to-amber-500 text-white font-black text-xs sm:text-sm uppercase tracking-wider shadow-xl shadow-pink-600/25 hover:shadow-pink-600/40 hover:scale-[1.01] active:scale-[0.99] transition-all flex items-center justify-center gap-2 cursor-pointer"
              >
                <Play size={18} className="fill-current" />
                <span>INIZIA CORSA IN OSPEDALE</span>
              </button>
            </form>
          </div>
        ) : (
          /* ACTIVE GAME CANVAS CONTAINER */
          <div className="w-full flex flex-col items-center space-y-2.5 sm:space-y-4">
            {/* Top Stats Bar */}
            <div className="w-full max-w-3xl flex items-center justify-between bg-[#12141f] border border-slate-800 rounded-xl sm:rounded-2xl px-3 py-2 sm:px-5 sm:py-3 shadow-lg">
              <div className="flex items-center gap-2 sm:gap-3">
                <div className="w-7 h-7 sm:w-8 sm:h-8 rounded-lg bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400 font-bold text-xs shrink-0">
                  L{level}
                </div>
                <div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold tracking-wider">Giocatore</div>
                  <div className="text-xs sm:text-sm font-black text-white max-w-[90px] sm:max-w-none truncate">{playerName}</div>
                </div>
              </div>

              {isTestRun ? (
                <div className="hidden sm:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-500/20 text-amber-300 border border-amber-500/40 text-[11px] font-black uppercase tracking-wider animate-pulse shadow-md">
                  🧪 RUN DI PROVA (L{level})
                </div>
              ) : isRainbowLevel ? (
                <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-red-500 via-amber-400 via-emerald-400 via-cyan-400 via-blue-500 to-fuchsia-500 text-white font-black uppercase text-[11px] tracking-wider animate-pulse shadow-lg shadow-pink-500/40 border border-white/50">
                  🌈 RAINBOW LEVEL (L{level})
                </div>
              ) : isMeme67Level ? (
                <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-purple-600 to-pink-600 text-white font-black uppercase text-[11px] tracking-wider animate-bounce shadow-lg shadow-purple-500/40 border border-purple-300">
                  🔥 MEME 67 (L67)
                </div>
              ) : isInvertedLevel ? (
                <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-cyan-600 to-teal-600 text-white font-black uppercase text-[11px] tracking-wider animate-pulse shadow-lg shadow-cyan-500/40 border border-cyan-300">
                  🔄 INVERTITO DX ➔ SX (L{level})
                </div>
              ) : isLevel100Swapped ? (
                <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-gradient-to-r from-pink-600 to-rose-600 text-white font-black uppercase text-[11px] tracking-wider animate-pulse shadow-lg shadow-pink-500/40 border border-pink-300">
                  🔄 RUOLI INVERTITI: DOTTORESSA RINCORRE! (L100)
                </div>
              ) : isBwLevel ? (
                <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-zinc-800 text-zinc-100 border border-zinc-600 text-[11px] font-black uppercase tracking-wider animate-pulse shadow-md">
                  📼 BIANCO E NERO (L{level})
                </div>
              ) : isCoffeeLevel ? (
                <div className="hidden md:flex items-center gap-1.5 px-3 py-1 rounded-full bg-amber-900/80 text-amber-200 border border-amber-500/50 text-[11px] font-black uppercase tracking-wider animate-bounce shadow-md">
                  ☕ CAPPUCCINO BREAK (L{level})
                </div>
              ) : null}

              <div className="flex items-center gap-2 sm:gap-3">
                <button
                  onClick={togglePause}
                  className="px-2 py-1 sm:px-3 sm:py-1.5 rounded-lg sm:rounded-xl bg-slate-800 hover:bg-slate-700 text-amber-300 border border-slate-700 text-xs font-bold transition-all flex items-center gap-1 cursor-pointer"
                  title="Pausa (P)"
                >
                  {isPaused ? <Play size={14} /> : <Pause size={14} />}
                  <span className="hidden sm:inline">{isPaused ? "Riprendi" : "Pausa"}</span>
                </button>

                <div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold tracking-wider text-right">Punti</div>
                  <div className="text-sm sm:text-lg font-black text-pink-400 font-mono tracking-tight">{Math.floor(score)}</div>
                </div>

                <div>
                  <div className="text-[9px] sm:text-[10px] text-slate-400 uppercase font-bold tracking-wider text-right">Record</div>
                  <div className="text-sm sm:text-lg font-black text-amber-400 font-mono tracking-tight">{highScore}</div>
                </div>
              </div>
            </div>

            {/* Canvas Window */}
            <div
              className="relative w-full max-w-3xl bg-slate-950 border sm:border-2 border-slate-800 rounded-2xl sm:rounded-3xl overflow-hidden shadow-2xl select-none touch-none min-h-[180px] sm:min-h-[280px] flex items-center justify-center"
              onTouchStart={handleTouchStart}
              onTouchEnd={handleTouchEnd}
            >
              <canvas
                ref={canvasRef}
                width={720}
                height={280}
                className={`w-full h-auto block bg-slate-950 transition-all duration-700 ${
                  isBwLevel ? "grayscale contrast-125 brightness-90 saturate-0" : ""
                }`}
              />

              {/* PAUSE OVERLAY */}
              {isPaused && (
                <div className="absolute inset-0 bg-slate-950/85 backdrop-blur-md z-30 flex flex-col items-center justify-center p-6 text-center animate-fadeIn">
                  <div className="w-16 h-16 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 mb-3 shadow-xl">
                    <Pause size={32} />
                  </div>
                  <h3 className="text-2xl font-black text-white uppercase tracking-wider mb-1">
                    GIOCO IN PAUSA
                  </h3>
                  <p className="text-xs text-slate-400 max-w-xs mb-6">
                    Premi <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-white font-mono">P</kbd> o <kbd className="px-1.5 py-0.5 rounded bg-slate-800 border border-slate-700 text-white font-mono">ESC</kbd> oppure clicca 'Riprendi' per continuare la corsa.
                  </p>

                  <div className="flex flex-col sm:flex-row gap-3 w-full max-w-xs">
                    <button
                      onClick={togglePause}
                      className="flex-1 py-3 px-4 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-pink-600/30 transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <Play size={16} /> Riprendi (P / ESC)
                    </button>

                    <button
                      onClick={() => {
                        setIsPaused(false);
                        isPausedRef.current = false;
                        handleSaveNameAndStart();
                      }}
                      className="py-3 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 border border-slate-700 font-bold text-xs transition-all flex items-center justify-center gap-2 cursor-pointer"
                    >
                      <RotateCcw size={16} /> Riavvia
                    </button>
                  </div>
                </div>
              )}

              {/* Touch Overlay Buttons for Mobile/Tablet */}
              <div className="absolute inset-x-4 bottom-3 flex items-center justify-between pointer-events-none sm:hidden z-20">
                <button
                  type="button"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    triggerMobileCrouch();
                  }}
                  className="pointer-events-auto px-5 py-3 rounded-2xl bg-indigo-900/80 border border-indigo-400/40 text-indigo-200 text-xs font-black flex items-center gap-1.5 shadow-xl active:scale-95 backdrop-blur-md"
                >
                  <ArrowDown size={16} />
                  <span>SCIVOLA</span>
                </button>

                <button
                  type="button"
                  onTouchStart={(e) => {
                    e.stopPropagation();
                    triggerMobileJump();
                  }}
                  className="pointer-events-auto px-6 py-3.5 rounded-2xl bg-pink-600/90 border border-pink-400/50 text-white text-xs font-black flex items-center gap-1.5 shadow-xl shadow-pink-600/40 active:scale-95 backdrop-blur-md"
                >
                  <ArrowUp size={16} />
                  <span>SALTA</span>
                </button>
              </div>

              {/* GAME OVER MODAL & SCOREBOARD OVERLAY */}
              {gameOver && (
                <div className="absolute inset-0 bg-black/85 backdrop-blur-md flex flex-col items-center justify-center p-4 z-30 animate-fadeIn">
                  <div className="w-full max-w-md bg-[#12141f] border border-pink-500/40 rounded-3xl p-5 shadow-2xl space-y-4 max-h-[92vh] overflow-y-auto dark-scrollbar">
                    {/* Game Over Title */}
                    <div className="text-center space-y-1">
                      <div className="inline-flex items-center gap-1.5 px-3 py-1 rounded-full bg-red-500/20 text-red-400 border border-red-500/30 text-[11px] font-black uppercase">
                        <ShieldAlert size={14} />
                        <span>Filippa Raggiunta da Mario Jordan!</span>
                      </div>
                      <h3 className="text-xl font-black text-white">GAME OVER</h3>
                      <p className="text-xs text-slate-400">
                        Punteggio: <strong className="text-pink-400 font-mono text-base">{Math.floor(score)}</strong> | Livello Raggiunto: <strong className="text-amber-400">{level}</strong>
                      </p>
                    </div>

                    {/* Test Run Notice Banner */}
                    {isTestRun && (
                      <div className="p-3 bg-amber-950/60 border border-amber-500/50 rounded-2xl text-center space-y-1 shadow-lg shadow-amber-500/10">
                        <div className="text-xs font-black text-amber-300 flex items-center justify-center gap-1.5 uppercase tracking-wide">
                          <span>🧪 RUN DI PROVA (CHECKPOINT L{startLevel})</span>
                        </div>
                        <p className="text-[11px] text-amber-200/90 leading-tight font-medium">
                          I punteggi delle run di prova avviate da un livello superiore al 1 non vengono inviati in classifica o salvati tra i record personali.
                        </p>
                      </div>
                    )}

                    {/* Action buttons */}
                    <div className="flex items-center gap-2">
                      <button
                        onClick={handleSaveNameAndStart}
                        className="flex-1 py-3 rounded-xl bg-gradient-to-r from-pink-600 to-rose-500 hover:from-pink-500 hover:to-rose-400 text-white font-black text-xs uppercase tracking-wider shadow-lg flex items-center justify-center gap-1.5 transition-all"
                      >
                        <RotateCcw size={16} />
                        <span>Rigioca</span>
                      </button>

                      <button
                        onClick={() => setHasStarted(false)}
                        className="px-4 py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 font-bold text-xs transition-all"
                      >
                        Cambia Nome
                      </button>
                    </div>

                    {/* SCOREBOARD TABLE */}
                    <div className="space-y-2 pt-2 border-t border-slate-800">
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-1.5 text-xs font-black text-amber-300 uppercase tracking-wider">
                          <Award size={16} className="text-amber-400" />
                          <span>Classifica Punteggi EMS</span>
                        </div>
                        {isSubmitting && <span className="text-[10px] text-pink-400 animate-pulse">Salvataggio...</span>}
                      </div>

                      <div className="bg-[#090a0f] border border-slate-800 rounded-2xl overflow-hidden max-h-48 overflow-y-auto dark-scrollbar">
                        {isLoadingLeaderboard ? (
                          <div className="p-4 text-center text-xs text-slate-500">Caricamento classifica...</div>
                        ) : leaderboard.length === 0 ? (
                          <div className="p-4 text-center text-xs text-slate-500">Nessun punteggio registrato. Sei il primo!</div>
                        ) : (
                          <table className="w-full text-left text-xs">
                            <thead className="bg-slate-900/80 text-[10px] text-slate-400 uppercase tracking-wider border-b border-slate-800">
                              <tr>
                                <th className="py-2 px-3">#</th>
                                <th className="py-2 px-3">Medico</th>
                                <th className="py-2 px-3 text-right">Livello</th>
                                <th className="py-2 px-3 text-right">Punti</th>
                              </tr>
                            </thead>
                            <tbody className="divide-y divide-slate-800/60 font-medium">
                              {leaderboard.map((item, idx) => {
                                const isCurrent = item.name.toLowerCase() === playerName.toLowerCase() && item.score === Math.floor(score);
                                return (
                                  <tr
                                    key={item.id || idx}
                                    className={`${isCurrent ? "bg-pink-950/40 text-pink-300 font-bold" : "text-slate-300 hover:bg-slate-800/40"}`}
                                  >
                                    <td className="py-2 px-3 text-slate-500 font-mono text-[11px]">
                                      {idx === 0 ? "🥇" : idx === 1 ? "🥈" : idx === 2 ? "🥉" : `#${idx + 1}`}
                                    </td>
                                    <td className="py-2 px-3 truncate max-w-[120px]">{item.name}</td>
                                    <td className="py-2 px-3 text-right text-slate-400 text-[11px]">L{item.level || 1}</td>
                                    <td className="py-2 px-3 text-right font-mono font-bold text-amber-300">
                                      {item.score}
                                    </td>
                                  </tr>
                                );
                              })}
                            </tbody>
                          </table>
                        )}
                      </div>
                    </div>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </main>

      {/* MINI MENU AUDIO MODAL */}
      {isAudioMenuOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-sm bg-[#121422] border border-pink-500/40 rounded-3xl p-5 shadow-2xl space-y-4 relative">
            <button
              onClick={() => setIsAudioMenuOpen(false)}
              className="absolute top-4 right-4 p-1.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X size={16} />
            </button>

            <div className="flex items-center gap-2.5 pb-3 border-b border-slate-800">
              <div className="w-9 h-9 rounded-xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400 shrink-0">
                <Music size={18} className="animate-pulse" />
              </div>
              <div>
                <h3 className="text-sm font-black text-white uppercase tracking-wide">
                  Mini-Menù Audio
                </h3>
                <p className="text-[11px] text-slate-400">
                  Regola il volume della musica e degli effetti
                </p>
              </div>
            </div>

            <div className="space-y-3.5">
              {/* Active Playlist Banner */}
              <div className="p-3.5 rounded-2xl bg-slate-900 border border-pink-500/30 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="w-8 h-8 rounded-xl bg-pink-500/20 border border-pink-500/40 flex items-center justify-center text-pink-400 shrink-0">
                      <Disc size={18} className="animate-spin" />
                    </div>
                    <div className="min-w-0">
                      <div className="text-xs font-black text-pink-300">
                        Playlist Sottofondo (Canzone {currentTrackIndex + 1} di {GAME_BGM_PLAYLIST.length})
                      </div>
                      <div className="text-[10px] text-slate-300 font-mono truncate max-w-[200px]">
                        {GAME_BGM_PLAYLIST[currentTrackIndex]}
                      </div>
                    </div>
                  </div>

                  {/* Previous / Next Track Manual Controls */}
                  <div className="flex items-center gap-1 shrink-0">
                    <button
                      type="button"
                      onClick={handlePrevTrack}
                      title="Canzone Precedente"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <SkipBack size={14} />
                    </button>
                    <button
                      type="button"
                      onClick={handleNextTrack}
                      title="Canzone Successiva"
                      className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition-all cursor-pointer"
                    >
                      <SkipForward size={14} />
                    </button>
                  </div>
                </div>

                {/* Playlist Selection Tabs */}
                <div className="grid grid-cols-3 gap-1 p-1 bg-slate-950 rounded-xl border border-slate-800 text-[10px]">
                  {GAME_BGM_PLAYLIST.map((_, idx) => (
                    <button
                      key={idx}
                      type="button"
                      onClick={() => setCurrentTrackIndex(idx)}
                      className={`py-1 px-1.5 rounded-lg font-bold transition-all cursor-pointer truncate ${
                        currentTrackIndex === idx
                          ? "bg-pink-500 text-slate-950 font-black shadow-sm"
                          : "text-slate-400 hover:text-slate-200"
                      }`}
                    >
                      Brano #{idx + 1}
                    </button>
                  ))}
                </div>

                <p className="text-[11px] text-slate-400 leading-tight">
                  Quando un brano finisce, il gioco passa automaticamente al successivo!
                </p>
              </div>

              {/* BGM Volume Slider */}
              <div className="space-y-1.5 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Music size={14} className="text-pink-400" />
                    <span>Volume Musica Sottofondo</span>
                  </span>
                  <span className="text-pink-400 font-mono font-black">{Math.round(bgmVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={bgmVolume}
                  onChange={(e) => setBgmVolume(Number(e.target.value))}
                  className="w-full accent-pink-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* SFX Volume Slider */}
              <div className="space-y-1.5 bg-slate-900/60 p-3 rounded-2xl border border-slate-800">
                <div className="flex items-center justify-between text-xs font-bold text-slate-300">
                  <span className="flex items-center gap-1.5">
                    <Volume2 size={14} className="text-emerald-400" />
                    <span>Volume Effetti Sonori (SFX)</span>
                  </span>
                  <span className="text-emerald-400 font-mono font-black">{Math.round(sfxVolume * 100)}%</span>
                </div>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={sfxVolume}
                  onChange={(e) => setSfxVolume(Number(e.target.value))}
                  className="w-full accent-emerald-500 h-1.5 bg-slate-800 rounded-lg appearance-none cursor-pointer"
                />
              </div>

              {/* Toggle Buttons */}
              <div className="grid grid-cols-2 gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setIsMusicPlaying(!isMusicPlaying)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    isMusicPlaying
                      ? "bg-gradient-to-r from-pink-600 to-rose-500 text-white shadow-lg shadow-pink-600/30"
                      : "bg-slate-800 text-slate-400 hover:bg-slate-700"
                  }`}
                >
                  {isMusicPlaying ? <Pause size={14} /> : <Play size={14} />}
                  <span>{isMusicPlaying ? "Pausa Musica" : "Avvia Musica"}</span>
                </button>

                <button
                  type="button"
                  onClick={() => setIsMuted(!isMuted)}
                  className={`py-2.5 px-3 rounded-xl text-xs font-extrabold flex items-center justify-center gap-1.5 cursor-pointer transition-all ${
                    isMuted
                      ? "bg-red-950 text-red-400 border border-red-500/40"
                      : "bg-slate-800 text-slate-300 hover:bg-slate-700 border border-slate-700"
                  }`}
                >
                  {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
                  <span>{isMuted ? "Muto Attivo" : "Audio Attivo"}</span>
                </button>
              </div>
            </div>

            <button
              onClick={() => setIsAudioMenuOpen(false)}
              className="w-full py-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Chiudi Mini-Menù
            </button>
          </div>
        </div>
      )}

      {/* STANDALONE LEADERBOARD MODAL OVERLAY */}
      {isLeaderboardOpen && (
        <div className="fixed inset-0 bg-black/80 backdrop-blur-md z-50 flex items-center justify-center p-4 animate-fadeIn">
          <div className="w-full max-w-lg bg-[#12141f] border border-amber-500/40 rounded-3xl p-6 shadow-2xl space-y-4 max-h-[90vh] overflow-y-auto dark-scrollbar relative">
            <button
              onClick={() => setIsLeaderboardOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-400 hover:text-white transition-all cursor-pointer"
            >
              <X size={18} />
            </button>

            <div className="flex items-center gap-3 border-b border-slate-800 pb-4">
              <div className="w-12 h-12 rounded-2xl bg-amber-500/20 border border-amber-500/40 flex items-center justify-center text-amber-400 shadow-lg">
                <Award size={26} />
              </div>
              <div>
                <h3 className="text-xl font-black text-white uppercase tracking-wide">
                  Classifica Generale EMS
                </h3>
                <p className="text-xs text-slate-400">
                  I migliori record di fuga dei medici dall'ospedale
                </p>
              </div>
            </div>

            <div className="bg-[#090a0f] border border-slate-800 rounded-2xl overflow-hidden max-h-72 overflow-y-auto dark-scrollbar">
              {isLoadingLeaderboard ? (
                <div className="p-6 text-center text-xs text-slate-500">Caricamento classifica in corso...</div>
              ) : leaderboard.length === 0 ? (
                <div className="p-6 text-center text-xs text-slate-500">Nessun punteggio registrato. Gioca per primo!</div>
              ) : (
                <table className="w-full text-left text-xs">
                  <thead className="bg-slate-900 text-[11px] text-slate-400 uppercase tracking-wider border-b border-slate-800 sticky top-0">
                    <tr>
                      <th className="py-2.5 px-3.5"># Pos</th>
                      <th className="py-2.5 px-3.5">Medico</th>
                      <th className="py-2.5 px-3.5 text-right">Livello</th>
                      <th className="py-2.5 px-3.5 text-right">Record Punti</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-800/60 font-medium">
                    {leaderboard.map((item, idx) => {
                      const isCurrent = item.name.toLowerCase() === playerName.toLowerCase();
                      return (
                        <tr
                          key={item.id || idx}
                          className={`${
                            isCurrent
                              ? "bg-pink-950/40 text-pink-300 font-bold"
                              : "text-slate-300 hover:bg-slate-800/40"
                          }`}
                        >
                          <td className="py-2.5 px-3.5 text-slate-500 font-mono text-xs">
                            {idx === 0 ? "🥇 1°" : idx === 1 ? "🥈 2°" : idx === 2 ? "🥉 3°" : `#${idx + 1}`}
                          </td>
                          <td className="py-2.5 px-3.5 font-bold text-slate-200">{item.name}</td>
                          <td className="py-2.5 px-3.5 text-right text-slate-400 font-mono">L{item.level || 1}</td>
                          <td className="py-2.5 px-3.5 text-right font-mono font-black text-amber-300 text-sm">
                            {item.score} pts
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              )}
            </div>

            <button
              onClick={() => setIsLeaderboardOpen(false)}
              className="w-full py-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-white font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
            >
              Chiudi Classifica
            </button>
          </div>
        </div>
      )}

      {/* Hidden Audio Element for BGM Track Playlist configured in code */}
      <audio
        ref={bgmAudioRef}
        src={GAME_BGM_PLAYLIST[currentTrackIndex] || GAME_BGM_PLAYLIST[0]}
        onEnded={handleTrackEnded}
        preload="auto"
        className="hidden"
      />

      {/* Footer */}
      <footer className="py-3 px-4 border-t border-slate-800 text-center text-xs text-slate-500">
        Emergency Medical Services • Filippa Cira & Mario Jordan • Emerals RP 4.0
      </footer>
    </div>
  );
}
