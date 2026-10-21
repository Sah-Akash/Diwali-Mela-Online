/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useRef, useState } from 'react';
import {
  Volume2,
  VolumeX,
  ShoppingBag,
  Camera,
  Compass,
  ChevronDown,
  ChevronUp,
  HelpCircle,
  X,
  Store,
  Flame,
  Share2,
  Music,
  Play,
  Pause,
  Heart,
} from 'lucide-react';
import {
  MelaInteractableSpec,
  PartnerStallData,
  loadCustomPartnerStalls,
  saveCustomPartnerStall,
} from './data/melaData';
import { DIWALI_RADIO_TRACKS } from './audio/melaAudio';
import {
  CinematicBanner,
  GameHudState,
  MelaEngine,
  MelaMode,
  PlayerStats,
} from './three/MelaEngine';
import { PostcardModal } from './components/PostcardModal';
import { StallBuilderModal } from './components/StallBuilderModal';
import { DaanPetiModal } from './components/DaanPetiModal';

export default function App() {
  const canvasHostRef = useRef<HTMLDivElement | null>(null);
  const engineRef = useRef<MelaEngine | null>(null);

  const [mode, setMode] = useState<MelaMode>('welcome');
  const [activeSpec, setActiveSpec] = useState<MelaInteractableSpec | null>(null);
  const [nearSpec, setNearSpec] = useState<MelaInteractableSpec | null>(null);
  const [talkSpec, setTalkSpec] = useState<MelaInteractableSpec | null>(null);
  const [talkReply, setTalkReply] = useState<string>('');
  const [bargainStage, setBargainStage] = useState<number>(0);

  const [gameHud, setGameHud] = useState<GameHudState | null>(null);
  const [rideProgress, setRideProgress] = useState<{ progress: number; name: string } | null>(null);
  const [cinematic, setCinematic] = useState<CinematicBanner | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [partners, setPartners] = useState<PartnerStallData[]>(() => loadCustomPartnerStalls());
  const [stats, setStats] = useState<PlayerStats>({
    balloonsPopped: 0,
    ringsLanded: 0,
    diyasLit: 2,
    ridesTaken: [],
    foodTasted: [],
    items: ['Shubh Deepavali Entry Pass'],
    finaleWatched: false,
    sparklerActive: true,
  });

  // UI Overlays & Dock State
  const [dockCollapsed, setDockCollapsed] = useState(false);
  const [mapOpen, setMapOpen] = useState(false);
  const [bagOpen, setBagOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const [supportOpen, setSupportOpen] = useState(false);
  const [radioOpen, setRadioOpen] = useState(false);
  const [radioPlaying, setRadioPlaying] = useState(true);
  const [radioTrackIdx, setRadioTrackIdx] = useState(0);
  const [radioVolume, setRadioVolume] = useState(0.75);

  const [communityDiyas, setCommunityDiyas] = useState(1084);
  const [blessingsList, setBlessingsList] = useState<string[]>([
    'Ghar mein sukh, shanti aur samriddhi bani rahe! — Sharma Family',
    'Bachpan wale mele ki yaadein taaza ho gayin! Happy Diwali! — Aayan',
    'May every home glow with warmth and kindness this Deepavali. — Meera',
  ]);

  const [stallModal, setStallModal] = useState<'create' | 'directory' | null>(null);
  const [postcardSnapshot, setPostcardSnapshot] = useState<string | null>(null);
  const [audioEnabled, setAudioEnabled] = useState(true);
  const [isRunning, setIsRunning] = useState(false);

  // Virtual Joystick state
  const [joyKnob, setJoyKnob] = useState({ x: 0, y: 0 });
  const joyOriginRef = useRef<{ x: number; y: number } | null>(null);

  // Player position synced at low frequency for Mini-Map arrow & Location HUD
  const [playerMapPos, setPlayerMapPos] = useState({ x: 0, z: 48, yaw: 0 });

  const showToast = (msg: string) => {
    setToast(msg);
  };

  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(null), 3400);
    return () => window.clearTimeout(timer);
  }, [toast]);

  // Initialize Three.js MelaEngine once inside dedicated ref container
  useEffect(() => {
    if (!canvasHostRef.current) return;

    const engine = new MelaEngine(canvasHostRef.current, partners, {
      onModeChange: (newMode, spec) => {
        setMode(newMode);
        setActiveSpec(spec);
        if (newMode !== 'ride' && newMode !== 'firework-show' && newMode !== 'stage') {
          setRideProgress(null);
        }
      },
      onNearChange: (near) => {
        setNearSpec(near);
      },
      onTalk: (spec) => {
        openConversation(spec);
      },
      onGameUpdate: (state) => {
        setGameHud(state);
      },
      onRideProgress: (progress, name) => {
        setRideProgress({ progress, name });
      },
      onCinematic: (banner) => {
        setCinematic(banner);
      },
      onStatsChange: (newStats) => {
        setStats(newStats);
      },
      onToast: (msg) => {
        showToast(msg);
      },
      onOpenPhotoCard: (dataUrl) => {
        setPostcardSnapshot(dataUrl);
      },
      onOpenDaanPeti: () => {
        setSupportOpen(true);
      },
    });

    engineRef.current = engine;

    const mapSyncTimer = window.setInterval(() => {
      if (engineRef.current) {
        setPlayerMapPos({
          x: engineRef.current.player.x,
          z: engineRef.current.player.z,
          yaw: engineRef.current.player.yaw,
        });
      }
    }, 180);

    const onKeyToggleDock = (e: KeyboardEvent) => {
      if (
        e.key.toLowerCase() === 'h' &&
        document.activeElement?.tagName !== 'INPUT' &&
        document.activeElement?.tagName !== 'SELECT'
      ) {
        setDockCollapsed((prev) => !prev);
      }
    };
    window.addEventListener('keydown', onKeyToggleDock);

    return () => {
      window.clearInterval(mapSyncTimer);
      window.removeEventListener('keydown', onKeyToggleDock);
      engine.dispose();
      engineRef.current = null;
    };
  }, []);

  const openConversation = (spec: MelaInteractableSpec) => {
    if (spec.type === 'daan-peti') {
      engineRef.current?.audio.effect('bell');
      engineRef.current?.audio.speak(spec.greeting);
      setSupportOpen(true);
      return;
    }
    setTalkSpec(spec);
    setTalkReply(spec.greeting);
    setBargainStage(0);
    engineRef.current?.audio.speak(spec.greeting);
  };

  const handleSaveCustomStall = (newStall: PartnerStallData) => {
    const updated = saveCustomPartnerStall(newStall);
    setPartners(updated);
    engineRef.current?.updatePartnerStalls(updated);
    showToast(`"${newStall.name}" is now live in the 3D Diwali Bazaar!`);
  };

  const handleSnapPostcard = () => {
    if (!engineRef.current) return;
    const url = engineRef.current.captureSnapshotDataUrl();
    setPostcardSnapshot(url);
    engineRef.current.collectItem('Diwali Mela Selfie Postcard');
  };

  const handleToggleAudio = () => {
    if (!engineRef.current) return;
    const enabled = engineRef.current.audio.toggleMute();
    setAudioEnabled(enabled);
  };

  const handleToggleRadioPlay = () => {
    if (!engineRef.current) return;
    const next = !radioPlaying;
    setRadioPlaying(next);
    engineRef.current.audio.setRadioPlaying(next);
  };

  const handleChangeRadioTrack = (idx: number) => {
    if (!engineRef.current) return;
    setRadioTrackIdx(idx);
    engineRef.current.audio.setTrackIndex(idx);
  };

  const handleVolumeChange = (val: number) => {
    setRadioVolume(val);
    engineRef.current?.audio.setVolume(val);
  };

  const handleToggleRun = () => {
    if (!engineRef.current) return;
    const next = !isRunning;
    setIsRunning(next);
    engineRef.current.isRunning = next;
  };

  const handleToggleSparkler = () => {
    if (!engineRef.current) return;
    engineRef.current.toggleSparkler();
  };

  const handleDonateComplete = (amount: number, donorName: string, wish: string) => {
    setCommunityDiyas((c) => c + 1);
    const formattedWish = wish.trim()
      ? `${wish.trim()} — ${donorName.trim() || 'A Seva Donor'}`
      : `Donated ₹${amount} for Diwali Seva — ${donorName.trim() || 'A Seva Donor'}`;
    setBlessingsList((prev) => [formattedWish, ...prev.slice(0, 6)]);
    engineRef.current?.celebrateDaanPeti();
    showToast(`Shubh Deepavali! Thank you for your ₹${amount} Seva Daan for families in need!`);
  };

  // Touch / Mouse Joystick handlers
  const handleJoyStart = (e: React.PointerEvent<HTMLDivElement>) => {
    e.currentTarget.setPointerCapture(e.pointerId);
    const rect = e.currentTarget.getBoundingClientRect();
    joyOriginRef.current = {
      x: rect.left + rect.width / 2,
      y: rect.top + rect.height / 2,
    };
  };

  const handleJoyMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!joyOriginRef.current || !engineRef.current) return;
    const dx = (e.clientX - joyOriginRef.current.x) / 36;
    const dy = (e.clientY - joyOriginRef.current.y) / 36;
    const len = Math.hypot(dx, dy);
    const clampedX = len > 1 ? dx / len : dx;
    const clampedY = len > 1 ? dy / len : dy;
    setJoyKnob({ x: clampedX, y: clampedY });
    engineRef.current.joystick = { x: clampedX, y: clampedY };
  };

  const handleJoyEnd = () => {
    joyOriginRef.current = null;
    setJoyKnob({ x: 0, y: 0 });
    if (engineRef.current) {
      engineRef.current.joystick = { x: 0, y: 0 };
    }
  };

  const allInteractables = engineRef.current?.interactables || [];

  const currentZoneLabel = nearSpec
    ? nearSpec.name
    : playerMapPos.z > 20
    ? 'Shubh Deepavali Entrance & Toran'
    : playerMapPos.z > 0
    ? 'Mithai & Chaat Bazaar Gali'
    : playerMapPos.z > -24
    ? 'Deepotsav Mandap & Jhoolon Ki Roshni'
    : 'Ram Leela, Maut Ka Kuan & 1008 Akashdeep Maidan';

  return (
    <div className="relative w-screen h-screen overflow-hidden select-none bg-[#0e1525]">
      {/* Dedicated Empty WebGL Canvas Mount Container (Zero Viewport Occlusion) */}
      <div ref={canvasHostRef} className="fixed inset-0 w-full h-full z-0" />

      {/* Top Bar Contract: 3 Zones Separated by gap-8 */}
      <header className="fixed top-0 left-0 right-0 z-20 flex items-center justify-between gap-8 px-5 py-3 bg-[#0d1322]/90 border-b border-[#f1aa49]/25">
        {/* Zone 1: Single text element wordmark */}
        <button
          onClick={() => {
            if (mode === 'welcome') {
              engineRef.current?.enterMela();
            } else {
              engineRef.current?.teleportTo('photo-booth');
            }
          }}
          className="text-lg font-display font-bold tracking-tight text-[#fff5de] whitespace-nowrap shrink-0 cursor-pointer text-left"
        >
          Diwali Mela Online
        </button>

        {/* Zone 2: 5 concise single-line navigation links */}
        <nav className="hidden md:flex items-center gap-6 text-sm font-medium text-[#d8c39e]">
          <button
            onClick={() => {
              if (mode === 'welcome') engineRef.current?.enterMela();
              setMapOpen((prev) => !prev);
            }}
            className="hover:text-[#fff5de] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Mela Map
          </button>
          <button
            onClick={() => setRadioOpen((prev) => !prev)}
            className="hover:text-[#fff5de] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Bhajans & Radio
          </button>
          <button
            onClick={() => setBagOpen(true)}
            className="hover:text-[#fff5de] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Mela Bag ({stats.items.length})
          </button>
          <button
            onClick={() => setStallModal('create')}
            className="hover:text-[#fff5de] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Promote Your Shop
          </button>
          <button
            onClick={() => setSupportOpen(true)}
            className="hover:text-[#fff5de] hover:underline underline-offset-4 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            Daan Peti QR
          </button>
        </nav>

        {/* Zone 3: 1 Primary Action CTA */}
        <div className="flex items-center gap-3 shrink-0">
          {mode === 'welcome' ? (
            <button
              onClick={() => engineRef.current?.enterMela()}
              className="px-4 py-2 text-xs font-semibold text-[#121726] bg-[#f1aa49] rounded-lg hover:bg-[#ffbe61] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              Enter Diwali Mela →
            </button>
          ) : (
            <button
              onClick={() => engineRef.current?.startGrandFinale()}
              className="px-4 py-2 text-xs font-semibold text-[#121726] bg-[#f1aa49] rounded-lg hover:bg-[#ffbe61] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              1008 Akashdeep Finale ✦
            </button>
          )}
        </div>
      </header>

      {/* WELCOME / ENTRY SCREEN (Matches mela-chaloge.vercel.app layout & poetry for Diwali) */}
      {mode === 'welcome' && (
        <main
          className="fixed inset-0 z-10 flex flex-col justify-between pt-20 pb-8 px-6 sm:px-14 pointer-events-none"
          style={{
            background:
              'linear-gradient(90deg, rgba(11, 20, 35, 0.90) 0%, rgba(11, 20, 35, 0.62) 52%, rgba(11, 20, 35, 0.08) 85%), linear-gradient(0deg, rgba(11, 18, 32, 0.82) 0%, transparent 38%)',
          }}
        >
          {/* Welcome Top Strip */}
          <div className="flex items-center justify-between text-xs tracking-widest text-[#e2c395]">
            <span className="text-sm sm:text-base font-medium tracking-wide text-[#f6dec0]">
              एक शाम, बचपन के नाम
            </span>
            <span>DIWALI 2026 · शुभ दीपावली</span>
          </div>

          {/* Left Editorial Hero Copy */}
          <div className="max-w-xl my-auto pointer-events-auto">
            <div className="text-[11px] font-semibold tracking-[0.24em] text-[#f0c27e] mb-3">
              THE DIWALI MELA IS OPEN · EVERY GAME IS FREE
            </div>

            <h1
              className="font-display font-medium text-[#fff6e0] leading-[1.08] tracking-tight mb-4"
              style={{ fontSize: 'clamp(2.75rem, 5.2vw, 4.75rem)', textWrap: 'balance' }}
            >
              मेरा
              <br />
              <em className="font-normal text-[#f1c17d]">Diwali Mela.</em>
            </h1>

            <p className="font-display italic text-xl sm:text-2xl text-[#eed9b9] mb-6">
              Mela chaloge mere sath? <span className="text-[#e87a70]">♥</span>
            </p>

            {/* Primary Enter Button */}
            <div className="flex flex-wrap items-center gap-3 mb-5">
              <button
                onClick={() => engineRef.current?.enterMela()}
                className="flex items-center justify-between gap-8 min-w-[240px] px-6 py-4 rounded-lg bg-[#f1c17d] text-[#1d2625] font-semibold text-xs tracking-widest hover:bg-[#ffd99d] transition-colors shadow-xl cursor-pointer"
              >
                <span>ENTER DIWALI MELA</span>
                <span>→</span>
              </button>

              <button
                onClick={() => engineRef.current?.enterMela('partner-meera')}
                className="px-4 py-4 rounded-lg bg-[#152438]/90 border border-[#f1c17d]/40 text-xs font-semibold text-[#f8e6c7] hover:bg-[#1e324d] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                VISIT DEMO STALL ↗
              </button>
            </div>

            <div className="text-[10px] tracking-[0.2em] text-[#d4cfba] mb-4">
              WALK FREELY · PLAY · GET A LITTLE LOST
            </div>

            {/* Welcome Community Action Buttons */}
            <div className="flex flex-wrap items-center gap-2.5 mb-4">
              <button
                onClick={handleSnapPostcard}
                className="px-3.5 py-2.5 rounded-lg bg-[#eac58a] text-[#1b302f] text-xs font-bold hover:bg-[#ffd99d] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                ↗ Doston ko bulao · Invite
              </button>
              <button
                onClick={() => setStallModal('create')}
                className="px-3.5 py-2.5 rounded-lg bg-[#142336]/90 border border-[#e3bf79]/45 text-xs font-medium text-[#ffe0a7] hover:bg-[#1d324d] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Promote your shop · Setup 3D Stall
              </button>
              <button
                onClick={() => setStallModal('directory')}
                className="px-3.5 py-2.5 rounded-lg bg-[#142336]/90 border border-[#e3bf79]/35 text-xs font-medium text-[#ffe0a7] hover:bg-[#1d324d] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Explore Mela Partners ({partners.length}) ↗
              </button>
            </div>

            {/* Quick Teleport Pills */}
            <div className="flex flex-wrap items-center gap-1.5 pt-2">
              {[
                { id: 'food-jalebi', label: 'Garam Jalebi & Chaat' },
                { id: 'game-balloon', label: 'Balloon Shoot' },
                { id: 'game-ring', label: 'Golden Ring Toss' },
                { id: 'game-diya', label: 'Light 7 Diyas' },
                { id: 'daan-peti', label: '🪔 Charity Daan Peti' },
                { id: 'ride-wheel', label: 'Chand Wala Jhoola' },
                { id: 'stage-ramleela', label: 'Ram Leela Stage' },
                { id: 'ride-well', label: 'Maut Ka Kuan' },
              ].map((spot) => (
                <button
                  key={spot.id}
                  onClick={() => engineRef.current?.enterMela(spot.id)}
                  className="px-2.5 py-1 rounded bg-[#121d30]/90 border border-[#f1aa49]/25 text-[11px] text-[#dfcba8] hover:border-[#f1aa49] hover:text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                >
                  {spot.label}
                </button>
              ))}
            </div>

            <p className="text-[11px] text-[#b5c1bb] mt-3">
              Sound begins when you enter. Every game and virtual souvenir is free.
            </p>
          </div>

          {/* Welcome Footer */}
          <div className="flex flex-wrap items-center justify-between gap-4 text-[11px] tracking-wider text-[#d8c39e]">
            <span>A little chaos. A little magic. Our kind of Diwali evening.</span>
            <button
              onClick={() => setSupportOpen(true)}
              className="pointer-events-auto text-[#f1c17d] hover:underline cursor-pointer"
            >
              🪔 Daan Patra & Community Blessings ({communityDiyas} Diyas Lit) ↗
            </button>
          </div>
        </main>
      )}

      {/* IN-MELA LOCATION INDICATOR & MINI-MAP (Top-Left below header) */}
      {(mode === 'walk' || mode === 'entering') && (
        <div className="fixed top-16 left-4 z-20 flex flex-col gap-2 pointer-events-auto">
          {/* Current Zone Indicator */}
          <div className="px-3.5 py-1.5 rounded-lg bg-[#10182b]/95 border border-[#f1aa49]/30 text-xs font-medium text-[#f5e4c3] shadow-lg">
            Location: <strong className="text-[#f1aa49]">{currentZoneLabel}</strong>
          </div>

          {/* Collapsible Interactive Mini-Map */}
          <div className="rounded-xl bg-[#10182b]/95 border border-[#f1aa49]/35 overflow-hidden shadow-xl w-56">
            <button
              onClick={() => setMapOpen((prev) => !prev)}
              className="flex items-center justify-between gap-4 w-full px-3.5 py-2 text-xs font-semibold text-[#f7e7c4] hover:bg-white/5 transition-colors cursor-pointer"
              aria-expanded={mapOpen}
            >
              <span className="flex items-center gap-1.5">
                <Compass className="w-3.5 h-3.5 text-[#f1aa49]" />
                MELA MAP
              </span>
              <span className="text-[#f1aa49] font-mono-num">{mapOpen ? '−' : '+'}</span>
            </button>

            {mapOpen && (
              <div className="p-3 pt-1 border-t border-[#f1aa49]/20">
                <svg
                  viewBox="0 0 100 120"
                  role="img"
                  aria-label="Mela map showing your current location—click any dot to teleport"
                  className="w-full h-48 rounded-lg bg-[#0a101d] border border-[#f1aa49]/20"
                >
                  {/* Main Bazaar Roads */}
                  <path
                    d="M50 112 L50 14 M14 34 L86 34 M14 66 L86 66 M18 86 L82 86"
                    stroke="#967948"
                    strokeWidth="4"
                    opacity="0.55"
                    fill="none"
                  />

                  <text x="50" y="10" textAnchor="middle" fill="#f1aa49" fontSize="5" fontWeight="bold">
                    1008 AKASHDEEP
                  </text>
                  <text x="50" y="117" textAnchor="middle" fill="#d8c39e" fontSize="4.5">
                    ENTRANCE
                  </text>

                  {/* Interactable Stalls & Rides Dots */}
                  {allInteractables.map((item) => {
                    const cx = 50 + item.x * 1.1;
                    const cy = 68 + item.z * 0.82;
                    const dotColor =
                      item.type === 'finale'
                        ? '#e87552'
                        : item.type === 'partner'
                        ? '#ffce70'
                        : item.type === 'wheel' ||
                          item.type === 'carousel' ||
                          item.type === 'pirate-ship' ||
                          item.type === 'well' ||
                          item.type === 'stage'
                        ? '#4cc9f0'
                        : item.type === 'balloon' || item.type === 'ring' || item.type === 'diya-game'
                        ? '#ff4d6d'
                        : item.type === 'daan-peti'
                        ? '#ffd700'
                        : '#b3c2a6';
                    return (
                      <g
                        key={item.id}
                        onClick={() => engineRef.current?.teleportTo(item.id)}
                        className="cursor-pointer hover:opacity-80"
                      >
                        <title>{`${item.name} (Click to teleport)`}</title>
                        <circle
                          cx={cx}
                          cy={cy}
                          r={item.type === 'finale' || item.type === 'partner' ? 3.4 : 2.4}
                          fill={dotColor}
                          stroke="#0e1525"
                          strokeWidth="0.6"
                        />
                      </g>
                    );
                  })}

                  {/* Player Position & Direction Arrow */}
                  <path
                    d="M0 -4.5 L3.4 3.6 L0 1.9 L-3.4 3.6 Z"
                    fill="#fff2cd"
                    stroke="#f1aa49"
                    strokeWidth="0.8"
                    transform={`translate(${50 + playerMapPos.x * 1.1} ${68 + playerMapPos.z * 0.82}) rotate(${
                      (-playerMapPos.yaw * 180) / Math.PI
                    })`}
                  />
                </svg>
                <div className="text-[11px] text-[#b8a17d] mt-2 text-center">
                  Follow the lights or click any dot to teleport.
                </div>
              </div>
            )}
          </div>

          {/* DIWALI BHAJANS & RADIO PLAYER WIDGET */}
          {radioOpen && (
            <div className="p-3.5 rounded-xl bg-[#10182b]/95 border border-[#f1aa49]/40 shadow-xl w-64">
              <div className="flex items-center justify-between text-[10px] font-semibold tracking-wider text-[#f1aa49] mb-2">
                <span>♫ DIWALI MELA RADIO</span>
                <button
                  onClick={() => setRadioOpen(false)}
                  className="text-[#d8c39e] hover:text-white cursor-pointer"
                >
                  ×
                </button>
              </div>

              <select
                value={radioTrackIdx}
                onChange={(e) => handleChangeRadioTrack(Number(e.target.value))}
                aria-label="Select Diwali Mela music track"
                className="w-full px-2.5 py-1.5 rounded-lg bg-[#0b101d] border border-[#f1aa49]/30 text-xs font-medium text-[#ffe0a6] mb-2.5 focus:outline-none focus:border-[#f1aa49]"
              >
                {DIWALI_RADIO_TRACKS.map((t, idx) => (
                  <option key={t.id} value={idx}>
                    {t.title}
                  </option>
                ))}
              </select>

              <div className="text-[11px] text-[#b8a17d] mb-2.5">
                {DIWALI_RADIO_TRACKS[radioTrackIdx].subtitle}
              </div>

              <div className="flex items-center justify-between gap-3">
                <button
                  onClick={handleToggleRadioPlay}
                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f1aa49] text-[#121726] text-xs font-semibold hover:bg-[#ffbe61] cursor-pointer"
                >
                  {radioPlaying ? <Pause className="w-3.5 h-3.5" /> : <Play className="w-3.5 h-3.5" />}
                  {radioPlaying ? 'Pause' : 'Play'}
                </button>

                <div className="flex items-center gap-2 flex-1">
                  <Volume2 className="w-3.5 h-3.5 text-[#f1aa49] shrink-0" />
                  <input
                    type="range"
                    min="0.05"
                    max="1"
                    step="0.05"
                    value={radioVolume}
                    onChange={(e) => handleVolumeChange(Number(e.target.value))}
                    aria-label="Music volume"
                    className="w-full accent-[#f1aa49] cursor-pointer"
                  />
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* CENTER CROSSHAIR & WALK TIP (During walk mode) */}
      {mode === 'walk' && !talkSpec && (
        <>
          <div
            aria-hidden="true"
            className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1.5 h-1.5 rounded-full bg-[#ffe8b8]/60 pointer-events-none z-10"
          />
          {!nearSpec && (
            <div className="fixed bottom-24 left-1/2 -translate-x-1/2 z-10 px-3.5 py-1 rounded-full bg-[#0e1525]/80 border border-[#f1aa49]/20 text-[10px] tracking-widest text-[#d8c39e] whitespace-nowrap pointer-events-none hidden sm:block">
              WASD / ARROWS TO WALK · DRAG TO LOOK · E TO TALK
            </div>
          )}
        </>
      )}

      {/* PROXIMITY INTERACTION PROMPT (When walking near a stall, game, stage, or ride) */}
      {mode === 'walk' && nearSpec && !talkSpec && (
        <div className="fixed bottom-28 left-1/2 -translate-x-1/2 z-20 pointer-events-auto">
          <button
            onClick={() => openConversation(nearSpec)}
            className="flex items-center gap-3 px-5 py-3 rounded-xl bg-[#121a2d]/95 border-2 border-[#f1aa49] text-[#fff5de] shadow-2xl hover:bg-[#19243d] transition-transform active:scale-95 cursor-pointer"
          >
            <kbd className="px-2 py-0.5 rounded bg-[#f1aa49] text-[#121726] font-mono-num text-xs font-bold">
              E
            </kbd>
            <div className="text-left">
              <div className="text-[10px] font-semibold tracking-wider text-[#f1aa49]">
                {nearSpec.type === 'daan-peti'
                  ? 'CLICK BOX OR PRESS E · SCAN CHARITY QR'
                  : nearSpec.type === 'stage'
                  ? 'WATCH RAM LEELA & DEEPOTSAV'
                  : nearSpec.type === 'wheel' ||
                    nearSpec.type === 'carousel' ||
                    nearSpec.type === 'pirate-ship' ||
                    nearSpec.type === 'well'
                  ? 'RIDE'
                  : nearSpec.type === 'finale' || nearSpec.type === 'fireworks'
                  ? 'CELEBRATE'
                  : 'TALK'}
              </div>
              <div className="text-sm font-display font-semibold whitespace-nowrap">
                {nearSpec.name}
              </div>
            </div>
            <span className="text-xs text-[#f1aa49] font-semibold ml-1">↗</span>
          </button>
        </div>
      )}

      {/* VIRTUAL TOUCH JOYSTICK (Bottom-Left during walk mode on mobile/touch) */}
      {mode === 'walk' && (
        <div className="fixed bottom-24 left-5 z-20 flex items-center gap-3 pointer-events-auto md:hidden">
          <div
            onPointerDown={handleJoyStart}
            onPointerMove={handleJoyMove}
            onPointerUp={handleJoyEnd}
            onPointerCancel={handleJoyEnd}
            aria-label="Movement joystick"
            role="group"
            className="w-24 h-24 rounded-full bg-[#10182b]/90 border-2 border-[#f1aa49]/45 flex items-center justify-center touch-none"
          >
            <div
              className="w-10 h-10 rounded-full bg-[#f1aa49] shadow-md pointer-events-none"
              style={{
                transform: `translate(${joyKnob.x * 26}px, ${joyKnob.y * 26}px)`,
              }}
            />
          </div>
        </div>
      )}

      {/* ACTIVE MINI-GAME HUD (Balloon Shoot, Ring Toss, Light 7 Diyas, Well of Death) */}
      {gameHud && (mode === 'balloon' || mode === 'ring' || mode === 'diya-game' || mode === 'well') && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-20 w-[92vw] max-w-lg pointer-events-auto">
          <div className="rounded-2xl bg-[#10182b]/95 border border-[#f1aa49]/50 p-4 shadow-2xl text-center">
            <div className="flex items-center justify-between text-xs font-semibold text-[#f1aa49] mb-1">
              <span>
                {gameHud.mode === 'balloon'
                  ? 'NISHANA LAGAO · FREE TO PLAY'
                  : gameHud.mode === 'ring'
                  ? 'RING TOSS · FREE TO PLAY'
                  : gameHud.mode === 'diya-game'
                  ? 'DEEPOTSAV MANDAP · LIGHT 7 DIYAS'
                  : 'MAUT KA KUAN · WELL OF DEATH'}
              </span>
              <span className="font-mono-num text-[#fff5de]">
                {gameHud.mode === 'well'
                  ? `${gameHud.shotsLeft}s left · Rings: ${gameHud.score}/8`
                  : gameHud.mode === 'diya-game'
                  ? `Diyas Lit: ${gameHud.score}/7`
                  : `${gameHud.shotsLeft} ${gameHud.mode === 'balloon' ? 'shots' : 'rings'} left · Score: ${gameHud.score}`}
              </span>
            </div>

            <p className="text-sm text-[#fff3d6] mb-3">{gameHud.message}</p>

            {/* Well of Death Rider Steering Buttons */}
            {gameHud.mode === 'well' && !gameHud.spectator && !gameHud.done && (
              <div className="flex items-center justify-center gap-2 mb-3">
                <button
                  onPointerDown={() => engineRef.current?.setWellControl(1, false)}
                  onPointerUp={() => engineRef.current?.setWellControl(0, false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#1d2842] border border-[#f1aa49]/40 text-xs font-semibold text-[#fff5de] cursor-pointer"
                >
                  Steer Higher ▲ (W)
                </button>
                <button
                  onPointerDown={() => engineRef.current?.setWellControl(-1, false)}
                  onPointerUp={() => engineRef.current?.setWellControl(0, false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#1d2842] border border-[#f1aa49]/40 text-xs font-semibold text-[#fff5de] cursor-pointer"
                >
                  Steer Lower ▼ (S)
                </button>
                <button
                  onPointerDown={() => engineRef.current?.setWellControl(0, true)}
                  onPointerUp={() => engineRef.current?.setWellControl(0, false)}
                  className="px-3.5 py-1.5 rounded-lg bg-[#f1aa49] text-[#121726] text-xs font-bold cursor-pointer"
                >
                  Turbo Boost ⚡ (Space)
                </button>
              </div>
            )}

            <div className="flex items-center justify-center gap-3">
              {gameHud.done && activeSpec && (
                <button
                  onClick={() => {
                    if (gameHud.mode === 'well') {
                      engineRef.current?.startWellOfDeath(false, activeSpec);
                    } else {
                      engineRef.current?.startMiniGame(gameHud.mode, activeSpec);
                    }
                  }}
                  className="px-4 py-2 rounded-lg bg-[#f1aa49] text-[#121726] text-xs font-semibold hover:bg-[#ffbe61] transition-colors cursor-pointer"
                >
                  Play Again Free ↻
                </button>
              )}

              <button
                onClick={() => engineRef.current?.leaveActivity()}
                className="px-4 py-2 rounded-lg bg-[#1d2842] border border-[#f1aa49]/35 text-xs font-medium text-[#fff5de] hover:bg-[#273659] transition-colors cursor-pointer"
              >
                Back to Mela ×
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ACTIVE RIDE / STAGE / FIREWORKS SHOW PROGRESS BAR */}
      {(mode === 'ride' || mode === 'firework-show' || mode === 'stage') && rideProgress && (
        <div className="fixed top-16 left-1/2 -translate-x-1/2 z-20 w-[90vw] max-w-md pointer-events-auto">
          <div className="rounded-2xl bg-[#10182b]/95 border border-[#f1aa49]/45 p-4 shadow-2xl text-center">
            <div className="text-xs font-semibold tracking-wider text-[#f1aa49] mb-1">
              {mode === 'stage'
                ? 'AYODHYA DEEPOTSAV & RAM LEELA STAGE'
                : 'ENJOY THE VIEW · DRAG TO LOOK AROUND'}
            </div>
            <div className="text-base font-display font-semibold text-[#fff5de] mb-2">
              {rideProgress.name}
            </div>
            <div className="w-full h-2 rounded-full bg-[#090e1a] overflow-hidden mb-3">
              <div
                className="h-full bg-[#f1aa49] transition-all duration-150"
                style={{ width: `${Math.round(rideProgress.progress * 100)}%` }}
              />
            </div>
            <button
              onClick={() => engineRef.current?.leaveActivity()}
              className="px-4 py-1.5 rounded-lg bg-[#1d2842] border border-[#f1aa49]/30 text-xs font-medium text-[#fff5de] hover:bg-[#273659] transition-colors cursor-pointer"
            >
              Back to Mela ×
            </button>
          </div>
        </div>
      )}

      {/* GRAND AKASHDEEP FINALE CINEMATIC BANNER */}
      {cinematic && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-20 w-[92vw] max-w-xl pointer-events-auto">
          <div className="rounded-2xl bg-[#12182b]/95 border-2 border-[#f1aa49] p-5 shadow-2xl text-center">
            <div className="text-xs font-semibold tracking-widest text-[#f1aa49] mb-1">
              MAHA DEEPOTSAV · GRAND DIWALI FINALE
            </div>
            <h2 className="text-xl sm:text-2xl font-display font-bold text-[#fff5de] mb-1">
              {cinematic.title}
            </h2>
            <p className="text-sm text-[#e5c99b] mb-3">{cinematic.text}</p>
            <button
              onClick={() => engineRef.current?.leaveActivity()}
              className="px-3.5 py-1.5 rounded-lg bg-[#1d2842] text-xs font-medium text-[#d8c39e] hover:text-white cursor-pointer"
            >
              Skip Finale ×
            </button>
          </div>
        </div>
      )}

      {/* SHOPKEEPER CONVERSATION & INTERACTION MODAL */}
      {talkSpec && (
        <div
          className="fixed inset-0 z-40 flex items-end sm:items-center justify-center p-4 bg-[#080c16]/75 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label={talkSpec.name}
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-[#131b2e] border border-[#f1aa49]/45 p-6 text-[#f7e7c4] shadow-2xl">
            <button
              onClick={() => setTalkSpec(null)}
              className="absolute top-4 right-4 p-2 rounded-lg text-[#d8c39e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close conversation"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-xs font-semibold tracking-wider text-[#f1aa49] mb-1">
              {talkSpec.hindiSub}
            </div>
            <h2 className="text-2xl font-display font-bold text-[#fff5de] mb-2">
              {talkSpec.name}
            </h2>

            {/* Shopkeeper Speech Bubble */}
            <div className="p-4 rounded-xl bg-[#0c1220] border border-[#f1aa49]/30 text-sm text-[#fff3d6] leading-relaxed mb-4">
              “{talkReply}”
            </div>

            {/* Dynamic Action Choices by Stall Type */}
            <div className="space-y-2.5">
              {/* Food & Mithai Stalls */}
              {talkSpec.type === 'food' &&
                talkSpec.choices?.map((c) => (
                  <button
                    key={c.label}
                    onClick={() => {
                      setTalkReply(c.reply);
                      if (c.item) {
                        engineRef.current?.collectFoodOrItem(c.item, true, c.reply);
                      }
                    }}
                    className="w-full text-left px-4 py-2.5 rounded-xl bg-[#1b2640] border border-[#f1aa49]/35 text-sm font-medium text-[#fff5de] hover:bg-[#f1aa49] hover:text-[#121726] transition-colors cursor-pointer"
                  >
                    {c.label}
                  </button>
                ))}

              {/* Toy & Terracotta Diya Stalls with Bargaining Fun! */}
              {(talkSpec.type === 'toy' || talkSpec.type === 'diya-craft') && (
                <>
                  <div className="flex flex-wrap gap-2">
                    <button
                      onClick={() => {
                        setBargainStage(1);
                        const msg = 'Bhaiya ₹50 ka hai! Ekdum chamakta Diwali special item hai!';
                        setTalkReply(msg);
                        engineRef.current?.audio.speak('Bhaiya pachaas ka hai!');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#1b2640] border border-[#f1aa49]/30 text-xs font-semibold text-[#f1aa49] hover:bg-[#253457] cursor-pointer"
                    >
                      Ye kitne ka hai?
                    </button>

                    <button
                      onClick={() => {
                        setBargainStage(2);
                        const msg =
                          'Arre bhai, tum bhi na! Achha chalo, tumhare liye ₹20 😄 (All virtual souvenirs are free!)';
                        setTalkReply(msg);
                        engineRef.current?.audio.speak('Achha chalo, tumhare liye bees!');
                      }}
                      className="px-3.5 py-2 rounded-xl bg-[#1b2640] border border-[#f1aa49]/30 text-xs font-semibold text-[#ff9ebb] hover:bg-[#253457] cursor-pointer"
                    >
                      Bargain 😭
                    </button>
                  </div>

                  {talkSpec.choices?.map((c) => (
                    <button
                      key={c.label}
                      onClick={() => {
                        setTalkReply(c.reply);
                        if (c.item) {
                          engineRef.current?.collectFoodOrItem(c.item, false, c.reply);
                        }
                      }}
                      className="w-full text-left px-4 py-2.5 rounded-xl bg-[#1b2640] border border-[#f1aa49]/35 text-sm font-medium text-[#fff5de] hover:bg-[#f1aa49] hover:text-[#121726] transition-colors cursor-pointer"
                    >
                      {c.label}
                    </button>
                  ))}
                </>
              )}

              {/* Partner Brand Stall */}
              {talkSpec.type === 'partner' && talkSpec.partner && (
                <>
                  <button
                    onClick={() => {
                      const ans = talkSpec.partner!.answer;
                      setTalkReply(ans);
                      engineRef.current?.audio.speak(ans);
                      engineRef.current?.collectItem(`${talkSpec.name} Card`);
                    }}
                    className="w-full text-left px-4 py-2.5 rounded-xl bg-[#1b2640] border border-[#f1aa49]/35 text-sm font-medium text-[#fff5de] hover:bg-[#253457] transition-colors cursor-pointer"
                  >
                    Ask: “{talkSpec.partner.question}”
                  </button>

                  <div className="flex flex-wrap gap-2 pt-1">
                    {talkSpec.partner.productUrl && (
                      <a
                        href={talkSpec.partner.productUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="px-4 py-2.5 rounded-xl bg-[#f1aa49] text-[#121726] text-xs font-semibold hover:bg-[#ffbe61] transition-colors"
                      >
                        Visit Brand Shop ↗
                      </a>
                    )}
                    <button
                      onClick={() => {
                        setTalkSpec(null);
                        setStallModal('create');
                      }}
                      className="px-4 py-2.5 rounded-xl bg-[#1b2640] border border-[#f1aa49]/30 text-xs font-medium text-[#f7e7c4] hover:text-white cursor-pointer"
                    >
                      Create My Stall →
                    </button>
                    <button
                      onClick={() => {
                        setTalkSpec(null);
                        setStallModal('directory');
                      }}
                      className="px-4 py-2.5 rounded-xl bg-[#1b2640] border border-[#f1aa49]/30 text-xs font-medium text-[#f7e7c4] hover:text-white cursor-pointer"
                    >
                      Explore All Partners →
                    </button>
                  </div>
                </>
              )}

              {/* Mini-Games */}
              {talkSpec.type === 'balloon' && (
                <button
                  onClick={() => {
                    const s = talkSpec;
                    setTalkSpec(null);
                    engineRef.current?.startMiniGame('balloon', s);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#f1aa49] text-[#121726] font-semibold text-sm hover:bg-[#ffbe61] transition-colors cursor-pointer"
                >
                  3 shot ₹20 ke? PLAY FREE →
                </button>
              )}

              {talkSpec.type === 'ring' && (
                <button
                  onClick={() => {
                    const s = talkSpec;
                    setTalkSpec(null);
                    engineRef.current?.startMiniGame('ring', s);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#f1aa49] text-[#121726] font-semibold text-sm hover:bg-[#ffbe61] transition-colors cursor-pointer"
                >
                  5 ring ₹20 ke? PLAY FREE →
                </button>
              )}

              {talkSpec.type === 'diya-game' && (
                <button
                  onClick={() => {
                    const s = talkSpec;
                    setTalkSpec(null);
                    engineRef.current?.startMiniGame('diya-game', s);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#f1aa49] text-[#121726] font-semibold text-sm hover:bg-[#ffbe61] transition-colors cursor-pointer"
                >
                  Light All 7 Deepotsav Mandap Diyas · FREE →
                </button>
              )}

              {/* Rides */}
              {(talkSpec.type === 'wheel' ||
                talkSpec.type === 'carousel' ||
                talkSpec.type === 'pirate-ship') && (
                <button
                  onClick={() => {
                    const s = talkSpec;
                    setTalkSpec(null);
                    engineRef.current?.startRide(s);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#f1aa49] text-[#121726] font-semibold text-sm hover:bg-[#ffbe61] transition-colors cursor-pointer"
                >
                  Jhoola chalega? RIDE FREE →
                </button>
              )}

              {/* Stage Show */}
              {talkSpec.type === 'stage' && (
                <button
                  onClick={() => {
                    const s = talkSpec;
                    setTalkSpec(null);
                    engineRef.current?.startStageShow(s);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#f1aa49] text-[#121726] font-semibold text-sm hover:bg-[#ffbe61] transition-colors cursor-pointer"
                >
                  Baith ke Ram Leela & Deepotsav dekhein →
                </button>
              )}

              {/* Well of Death (Maut Ka Kuan) */}
              {talkSpec.type === 'well' && (
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                  <button
                    onClick={() => {
                      const s = talkSpec;
                      setTalkSpec(null);
                      engineRef.current?.startWellOfDeath(false, s);
                    }}
                    className="px-4 py-3 rounded-xl bg-[#f1aa49] text-[#121726] font-semibold text-sm hover:bg-[#ffbe61] transition-colors cursor-pointer"
                  >
                    Ride the Wall Yourself (Play Game) →
                  </button>
                  <button
                    onClick={() => {
                      const s = talkSpec;
                      setTalkSpec(null);
                      engineRef.current?.startWellOfDeath(true, s);
                    }}
                    className="px-4 py-3 rounded-xl bg-[#1b2640] border border-[#f1aa49]/40 text-[#fff5de] font-medium text-sm hover:bg-[#253457] transition-colors cursor-pointer"
                  >
                    Watch the Show from Gallery →
                  </button>
                </div>
              )}

              {/* Photo Point */}
              {talkSpec.type === 'photo' && (
                <button
                  onClick={() => {
                    setTalkSpec(null);
                    handleSnapPostcard();
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#f1aa49] text-[#121726] font-semibold text-sm hover:bg-[#ffbe61] transition-colors cursor-pointer"
                >
                  Ek photo ho jaaye →
                </button>
              )}

              {/* Fireworks & Finale */}
              {talkSpec.type === 'fireworks' && (
                <button
                  onClick={() => {
                    const s = talkSpec;
                    setTalkSpec(null);
                    engineRef.current?.startFireworkShow(s);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#f1aa49] text-[#121726] font-semibold text-sm hover:bg-[#ffbe61] transition-colors cursor-pointer"
                >
                  Light up the virtual sky ✦
                </button>
              )}

              {talkSpec.type === 'finale' && (
                <button
                  onClick={() => {
                    const s = talkSpec;
                    setTalkSpec(null);
                    engineRef.current?.startGrandFinale(s);
                  }}
                  className="w-full px-4 py-3 rounded-xl bg-[#f1aa49] text-[#121726] font-semibold text-sm hover:bg-[#ffbe61] transition-colors cursor-pointer"
                >
                  Begin 1008 Akashdeep Finale →
                </button>
              )}

              <button
                onClick={() => setTalkSpec(null)}
                className="w-full px-4 py-2 rounded-xl bg-[#0d1322] text-xs font-medium text-[#b8a17d] hover:text-white transition-colors cursor-pointer"
              >
                Bas dekh raha hoon. Phir milte hain!
              </button>
            </div>

            <div className="mt-4 pt-3 border-t border-[#f1aa49]/15 flex items-center justify-between text-[11px] text-[#9ba79f]">
              <span>Virtual mela items only. All play is free.</span>
              <button
                onClick={() => {
                  setTalkSpec(null);
                  setSupportOpen(true);
                }}
                className="text-[#f1c17d] hover:underline cursor-pointer"
              >
                Optional daan patra ↗
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SEVA DAAN PETI · CHARITY QR CODE MODAL */}
      {supportOpen && (
        <DaanPetiModal
          onClose={() => setSupportOpen(false)}
          onConfirmDonation={handleDonateComplete}
          onToast={showToast}
        />
      )}

      {/* MELA JHOLA (SOUVENIR BAG) MODAL */}
      {bagOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090d18]/85 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Your Diwali Mela Bag"
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-[#131b2e] border border-[#f1aa49]/40 p-6 text-[#f7e7c4] shadow-2xl">
            <button
              onClick={() => setBagOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg text-[#d8c39e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close panel"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-xs font-semibold tracking-wider text-[#f1aa49] mb-1">
              CHHOTI CHHOTI KHUSHIYAAN
            </div>
            <h2 className="text-2xl font-display font-bold text-[#fff5de] mb-2">
              Your mela bag.
            </h2>
            <p className="text-xs text-[#d8c39e] mb-4">
              Digital memories from your Diwali evening. Talk to a toy seller, taste garam jalebi & chaat, or win a game prize.
            </p>

            {/* Tabular Metrics Strip */}
            <div className="grid grid-cols-3 gap-2.5 mb-4">
              <div className="p-3 rounded-xl bg-[#0d1322] border border-[#f1aa49]/25 text-center">
                <div className="text-xl font-mono-num font-bold text-[#f1aa49]">
                  {stats.balloonsPopped}
                </div>
                <div className="text-[11px] text-[#d8c39e]">Balloons popped</div>
              </div>
              <div className="p-3 rounded-xl bg-[#0d1322] border border-[#f1aa49]/25 text-center">
                <div className="text-xl font-mono-num font-bold text-[#f1aa49]">
                  {stats.ringsLanded}
                </div>
                <div className="text-[11px] text-[#d8c39e]">Rings landed</div>
              </div>
              <div className="p-3 rounded-xl bg-[#0d1322] border border-[#f1aa49]/25 text-center">
                <div className="text-xl font-mono-num font-bold text-[#f1aa49]">
                  {stats.diyasLit}/7
                </div>
                <div className="text-[11px] text-[#d8c39e]">Mandap diyas lit</div>
              </div>
            </div>

            <div className="max-h-48 overflow-y-auto space-y-1.5 mb-5 pr-1">
              {stats.items.map((item) => (
                <div
                  key={item}
                  className="px-3.5 py-2 rounded-lg bg-[#0d1322] border border-[#f1aa49]/20 text-xs font-medium text-[#fff5de] flex items-center justify-between"
                >
                  <span>✦ {item}</span>
                  <span className="text-[10px] tracking-wider text-[#b8a17d]">VIRTUAL SOUVENIR</span>
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3">
              <button
                onClick={() => {
                  setBagOpen(false);
                  handleSnapPostcard();
                }}
                className="flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#f1aa49] text-[#121726] text-xs font-semibold hover:bg-[#ffbe61] transition-colors cursor-pointer"
              >
                <Share2 className="w-4 h-4" />
                Share Mela Card →
              </button>

              <button
                onClick={() => setBagOpen(false)}
                className="px-4 py-2.5 rounded-xl bg-[#1d2842] text-xs font-medium text-[#f7e7c4] hover:bg-[#273659] transition-colors cursor-pointer"
              >
                Chalo, aur ghoomein →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CONTROLS & QUICK TELEPORT HELP MODAL */}
      {helpOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-[#090d18]/85 pointer-events-auto"
          role="dialog"
          aria-modal="true"
          aria-label="Mela Controls and Guide"
        >
          <div className="relative w-full max-w-lg rounded-2xl bg-[#131b2e] border border-[#f1aa49]/40 p-6 text-[#f7e7c4] shadow-2xl">
            <button
              onClick={() => setHelpOpen(false)}
              className="absolute top-4 right-4 p-2 rounded-lg text-[#d8c39e] hover:text-white hover:bg-white/10 transition-colors cursor-pointer"
              aria-label="Close panel"
            >
              <X className="w-5 h-5" />
            </button>

            <div className="text-xs font-semibold tracking-wider text-[#f1aa49] mb-1">
              THIS MELA IS YOURS TO EXPLORE
            </div>
            <h2 className="text-2xl font-display font-bold text-[#fff5de] mb-4">
              Thoda ghoom lo.
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 text-xs mb-5">
              <div className="p-3 rounded-xl bg-[#0d1322] border border-[#f1aa49]/20">
                <div className="font-semibold text-[#f1aa49] mb-1">W A S D / Arrows</div>
                <div className="text-[#d8c39e]">Walk through the glowing Diwali bazaar lanes.</div>
              </div>
              <div className="p-3 rounded-xl bg-[#0d1322] border border-[#f1aa49]/20">
                <div className="font-semibold text-[#f1aa49] mb-1">Drag the Scene</div>
                <div className="text-[#d8c39e]">Look around you at the lanterns, rides, and sky.</div>
              </div>
              <div className="p-3 rounded-xl bg-[#0d1322] border border-[#f1aa49]/20">
                <div className="font-semibold text-[#f1aa49] mb-1">E / Talk & Play</div>
                <div className="text-[#d8c39e]">Talk when near a vendor, game stall, or ride.</div>
              </div>
              <div className="p-3 rounded-xl bg-[#0d1322] border border-[#f1aa49]/20">
                <div className="font-semibold text-[#f1aa49] mb-1">Shift / Run</div>
                <div className="text-[#d8c39e]">Move a little faster across the fairgrounds.</div>
              </div>
            </div>

            <div className="space-y-2 mb-4">
              <button
                onClick={() => {
                  setHelpOpen(false);
                  engineRef.current?.startFireworkShow();
                }}
                className="w-full py-2.5 rounded-xl bg-[#f1aa49] text-[#121726] text-xs font-semibold hover:bg-[#ffbe61] cursor-pointer"
              >
                Roshni ka Jashn · Watch Fireworks Show ✦
              </button>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <button
                  onClick={() => {
                    setHelpOpen(false);
                    const wellSpec = engineRef.current?.interactables.find((s) => s.type === 'well');
                    if (wellSpec) engineRef.current?.startWellOfDeath(true, wellSpec);
                  }}
                  className="py-2.5 rounded-xl bg-[#1d2842] border border-[#f1aa49]/35 text-xs font-medium text-[#fff5de] hover:bg-[#273659] cursor-pointer"
                >
                  Maut ka Kuan · Watch Show →
                </button>
                <button
                  onClick={() => {
                    setHelpOpen(false);
                    const wellSpec = engineRef.current?.interactables.find((s) => s.type === 'well');
                    if (wellSpec) engineRef.current?.startWellOfDeath(false, wellSpec);
                  }}
                  className="py-2.5 rounded-xl bg-[#1d2842] border border-[#f1aa49]/35 text-xs font-medium text-[#fff5de] hover:bg-[#273659] cursor-pointer"
                >
                  Maut ka Kuan · Ride the Wall →
                </button>
              </div>
            </div>

            <button
              onClick={() => setHelpOpen(false)}
              className="w-full py-2.5 rounded-xl bg-[#0d1322] border border-[#f1aa49]/25 text-xs font-semibold text-[#f1aa49] hover:bg-[#162038] cursor-pointer"
            >
              Samajh gaye. Chalo! →
            </button>
          </div>
        </div>
      )}

      {/* POSTCARD GENERATOR MODAL */}
      {postcardSnapshot && (
        <PostcardModal
          snapshotUrl={postcardSnapshot}
          stats={stats}
          onClose={() => setPostcardSnapshot(null)}
          onToast={showToast}
        />
      )}

      {/* STALL BUILDER / PARTNER DIRECTORY MODAL */}
      {stallModal && (
        <StallBuilderModal
          mode={stallModal}
          partners={partners}
          onClose={() => setStallModal(null)}
          onSaveStall={handleSaveCustomStall}
          onTeleportToStall={(id) => engineRef.current?.teleportTo(id)}
          onSwitchTab={(tab) => setStallModal(tab)}
        />
      )}

      {/* TOAST NOTIFICATION */}
      {toast && (
        <div
          role="status"
          className="fixed top-16 right-5 z-50 px-4 py-2.5 rounded-xl bg-[#131b2e] border border-[#f1aa49] text-xs font-semibold text-[#fff5de] shadow-2xl"
        >
          {toast}
        </div>
      )}

      {/* UNIFIED COLLAPSIBLE BOTTOM CONTROL DOCK (Zero Viewport Occlusion) */}
      {mode !== 'welcome' && (
        <div
          className="fixed bottom-4 left-1/2 -translate-x-1/2 z-20 flex flex-col items-center pointer-events-auto"
          style={{ maxWidth: 'min(940px, 94vw)' }}
        >
          <button
            onClick={() => setDockCollapsed((prev) => !prev)}
            className="flex items-center gap-1.5 px-3.5 py-1 rounded-t-lg bg-[#10182b]/95 border border-b-0 border-[#f1aa49]/35 text-[11px] font-medium text-[#d8c39e] hover:text-white transition-colors cursor-pointer"
          >
            {dockCollapsed ? (
              <>
                <ChevronUp className="w-3.5 h-3.5 text-[#f1aa49]" />
                Show Mela Controls (H)
              </>
            ) : (
              <>
                <ChevronDown className="w-3.5 h-3.5 text-[#f1aa49]" />
                Hide Controls (H)
              </>
            )}
          </button>

          {!dockCollapsed && (
            <div className="flex flex-wrap items-center justify-center gap-2 px-4 py-2.5 rounded-2xl bg-[#10182b]/95 border border-[#f1aa49]/40 shadow-2xl">
              {/* Invite & Promote Stall Highlight Buttons (Like community-dock in mela-chaloge) */}
              <button
                onClick={handleSnapPostcard}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#f2cf94] text-[#1b302d] text-xs font-bold hover:bg-[#ffe2b0] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Camera className="w-3.5 h-3.5" />
                Invite · Postcard
              </button>

              <button
                onClick={() => setStallModal('create')}
                className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#192f32] border border-[#e7c389]/45 text-xs font-semibold text-[#f1d3a2] hover:bg-[#223f43] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                <Store className="w-3.5 h-3.5 text-[#f1aa49]" />
                Apni Dukaan Lagao
              </button>

              <div className="h-4 w-[1px] bg-[#f1aa49]/25 mx-0.5 hidden sm:block" />

              {/* Quick Teleport Pills */}
              <button
                onClick={() => engineRef.current?.teleportTo('food-mithai')}
                className="px-2.5 py-1.5 rounded-lg bg-[#1a2540] hover:bg-[#243254] text-xs font-medium text-[#fff3d6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Mithai & Chaat
              </button>
              <button
                onClick={() => engineRef.current?.teleportTo('game-balloon')}
                className="px-2.5 py-1.5 rounded-lg bg-[#1a2540] hover:bg-[#243254] text-xs font-medium text-[#fff3d6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Games
              </button>
              <button
                onClick={() => engineRef.current?.teleportTo('game-diya')}
                className="px-2.5 py-1.5 rounded-lg bg-[#1a2540] hover:bg-[#243254] text-xs font-medium text-[#fff3d6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                7 Diyas Mandap
              </button>
              <button
                onClick={() => {
                  engineRef.current?.teleportTo('daan-peti');
                  setSupportOpen(true);
                }}
                className="flex items-center gap-1 px-2.5 py-1.5 rounded-lg bg-[#2a1f14] border border-[#f1aa49]/45 hover:bg-[#3b2b1b] text-xs font-semibold text-[#ffd27d] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Walk to Seva Daan Peti near 7 Diyas Mandap & Scan QR Code"
              >
                <Heart className="w-3.5 h-3.5 text-[#f1aa49]" />
                Daan Peti QR
              </button>
              <button
                onClick={() => engineRef.current?.teleportTo('ride-wheel')}
                className="px-2.5 py-1.5 rounded-lg bg-[#1a2540] hover:bg-[#243254] text-xs font-medium text-[#fff3d6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Giant Wheel
              </button>
              <button
                onClick={() => engineRef.current?.teleportTo('stage-ramleela')}
                className="px-2.5 py-1.5 rounded-lg bg-[#1a2540] hover:bg-[#243254] text-xs font-medium text-[#fff3d6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Ram Leela
              </button>
              <button
                onClick={() => engineRef.current?.teleportTo('ride-well')}
                className="px-2.5 py-1.5 rounded-lg bg-[#1a2540] hover:bg-[#243254] text-xs font-medium text-[#fff3d6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              >
                Maut Ka Kuan
              </button>

              <div className="h-4 w-[1px] bg-[#f1aa49]/25 mx-0.5 hidden sm:block" />

              {/* Handheld Sparkler Toggle */}
              <button
                onClick={handleToggleSparkler}
                aria-pressed={stats.sparklerActive}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  stats.sparklerActive
                    ? 'bg-[#f1aa49] text-[#121726]'
                    : 'bg-[#1a2540] text-[#d8c39e] hover:text-white'
                }`}
              >
                <Flame className="w-3.5 h-3.5" />
                Phuljhari
              </button>

              {/* Walk / Run Toggle */}
              <button
                onClick={handleToggleRun}
                aria-pressed={isRunning}
                className={`px-2.5 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  isRunning
                    ? 'bg-[#f1aa49]/25 border border-[#f1aa49] text-[#fff5de]'
                    : 'bg-[#1a2540] text-[#d8c39e] hover:text-white'
                }`}
              >
                {isRunning ? 'WALK' : 'RUN'}
              </button>

              {/* Mela Jhola Bag */}
              <button
                onClick={() => setBagOpen(true)}
                className="flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#1a2540] hover:bg-[#243254] text-xs font-medium text-[#fff3d6] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                title="Open Mela Bag"
              >
                <ShoppingBag className="w-3.5 h-3.5 text-[#f1aa49]" />
                Bag ({stats.items.length})
              </button>

              {/* Diwali Radio Toggle */}
              <button
                onClick={() => setRadioOpen((prev) => !prev)}
                className={`p-1.5 rounded-lg transition-colors cursor-pointer ${
                  radioOpen
                    ? 'bg-[#f1aa49] text-[#121726]'
                    : 'bg-[#1a2540] hover:bg-[#243254] text-[#f1aa49]'
                }`}
                aria-label="Toggle Diwali Radio"
                title="Diwali Bhajans & Radio"
              >
                <Music className="w-4 h-4" />
              </button>

              {/* Audio Mute/Unmute */}
              <button
                onClick={handleToggleAudio}
                className="p-1.5 rounded-lg bg-[#1a2540] hover:bg-[#243254] text-[#f1aa49] transition-colors cursor-pointer"
                aria-label={audioEnabled ? 'Mute sound' : 'Unmute sound'}
                title={audioEnabled ? 'Mute sound' : 'Unmute sound'}
              >
                {audioEnabled ? <Volume2 className="w-4 h-4" /> : <VolumeX className="w-4 h-4" />}
              </button>

              {/* Help */}
              <button
                onClick={() => setHelpOpen(true)}
                className="p-1.5 rounded-lg bg-[#1a2540] hover:bg-[#243254] text-[#d8c39e] hover:text-white transition-colors cursor-pointer"
                aria-label="Controls help"
                title="Controls help"
              >
                <HelpCircle className="w-4 h-4" />
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
