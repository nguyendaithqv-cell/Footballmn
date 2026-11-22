import React, { useMemo, useState } from 'react';
import { Brain, Check, RefreshCw, Sparkles, Target } from 'lucide-react';
import {
  CLUBS,
  FORMATION_TEMPLATES,
  REAL_MANAGERS,
  ROLES_BY_POSITION,
} from '../data/footballDatabase';
import {
  buildAutoLineupSlots,
  calculateTacticalProfile,
  getActiveCareerManager,
  getManagerImpactSummary,
} from '../lib/careerEngine';
import {
  CareerSave,
  FormationId,
  Mentality,
  Player,
  PlayerRole,
  TacticSettings,
} from '../types/game';
import { PlayerAvatar } from './ClubBadgeAndAvatar';

interface TacticsViewProps {
  career: CareerSave;
  onUpdateTactics: (nextTactics: TacticSettings) => void;
  onSelectPlayer: (player: Player) => void;
}

const FORMATIONS: FormationId[] = ['4-3-3', '4-2-3-1', '3-4-2-1', '3-5-2', '4-4-2', '5-3-2'];
const MENTALITIES: { id: Mentality; label: string }[] = [
  { id: 'Cautious', label: 'Thận trọng' },
  { id: 'Balanced', label: 'Cân bằng' },
  { id: 'Positive', label: 'Tích cực' },
  { id: 'Attacking', label: 'Tấn công' },
  { id: 'Very Attacking', label: 'Tổng lực' },
];

export const TacticsView: React.FC<TacticsViewProps> = ({
  career,
  onUpdateTactics,
  onSelectPlayer,
}) => {
  const [selectedSlotIdx, setSelectedSlotIdx] = useState<number | null>(null);
  const [instructionPhase, setInstructionPhase] = useState<'possession' | 'transition' | 'defense'>(
    'possession'
  );
  const [scoutReport, setScoutReport] = useState<string | null>(null);
  const [scouting, setScouting] = useState(false);

  const club = CLUBS.find((c) => c.id === career.clubId) ?? CLUBS[0];
  const playerMap = useMemo(() => new Map(career.squad.map((p) => [p.id, p])), [career.squad]);
  const starterIds = useMemo(
    () => new Set(career.tactics.slots.map((s) => s.playerId)),
    [career.tactics.slots]
  );
  const benchPlayers = useMemo(
    () => career.squad.filter((p) => !starterIds.has(p.id)).sort((a, b) => b.rating - a.rating),
    [career.squad, starterIds]
  );

  const activeManager = useMemo(() => getActiveCareerManager(career), [career]);
  const managerImpact = useMemo(
    () => getManagerImpactSummary(activeManager, career.tactics),
    [activeManager, career.tactics]
  );

  const tacticalProfile = useMemo(
    () => calculateTacticalProfile(career.tactics, career.squad, activeManager),
    [career.tactics, career.squad, activeManager]
  );

  const nextFixture = useMemo(
    () =>
      career.fixtures.find(
        (f) =>
          !f.played && (f.homeClubId === career.clubId || f.awayClubId === career.clubId)
      ),
    [career.fixtures, career.clubId]
  );
  const opponentClub = useMemo(() => {
    if (!nextFixture) return null;
    const oppId =
      nextFixture.homeClubId === career.clubId ? nextFixture.awayClubId : nextFixture.homeClubId;
    return CLUBS.find((c) => c.id === oppId) ?? null;
  }, [nextFixture, career.clubId]);
  const opponentManager = useMemo(
    () => REAL_MANAGERS.find((m) => m.id === opponentClub?.managerId) ?? null,
    [opponentClub]
  );

  const startingXIPlayers = useMemo(() => {
    const seen = new Set<string>();
    const list: Player[] = [];
    for (const s of career.tactics.slots) {
      const p = playerMap.get(s.playerId);
      if (p && !seen.has(p.id)) {
        seen.add(p.id);
        list.push(p);
      }
    }
    return list;
  }, [career.tactics.slots, playerMap]);

  const sortedXIBySho = useMemo(
    () =>
      [...startingXIPlayers].sort((a, b) => {
        if (a.position === 'GK' && b.position !== 'GK') return 1;
        if (b.position === 'GK' && a.position !== 'GK') return -1;
        return b.attributes.sho - a.attributes.sho;
      }),
    [startingXIPlayers]
  );

  const sanitizedShootoutTakers = useMemo(() => {
    const xiIds = new Set(startingXIPlayers.map((p) => p.id));
    const ordered: string[] = [];
    const used = new Set<string>();
    for (const id of career.tactics.penaltyTakerIds ?? []) {
      if (id && xiIds.has(id) && !used.has(id)) {
        ordered.push(id);
        used.add(id);
      }
    }
    for (const p of sortedXIBySho) {
      if (ordered.length >= 10) break;
      if (!used.has(p.id)) {
        ordered.push(p.id);
        used.add(p.id);
      }
    }
    return ordered.slice(0, 10);
  }, [career.tactics.penaltyTakerIds, startingXIPlayers, sortedXIBySho]);

  const sanitizedDesignatedPenaltyId = useMemo(() => {
    const cur = career.tactics.designatedPenaltyTakerId;
    if (cur && starterIds.has(cur)) return cur;
    return sortedXIBySho[0]?.id ?? '';
  }, [career.tactics.designatedPenaltyTakerId, starterIds, sortedXIBySho]);

  const syncPenaltyTakersForSlots = (
    slots: TacticSettings['slots'],
    prevTactics: TacticSettings,
    replacedOutId?: string,
    incomingId?: string
  ) => {
    const xiSet = new Set(slots.map((s) => s.playerId));
    const xiSorted = slots
      .map((s) => playerMap.get(s.playerId))
      .filter((p): p is Player => Boolean(p))
      .sort((a, b) => {
        if (a.position === 'GK' && b.position !== 'GK') return 1;
        if (b.position === 'GK' && a.position !== 'GK') return -1;
        return b.attributes.sho - a.attributes.sho;
      });

    let nextPenId = prevTactics.designatedPenaltyTakerId;
    if (replacedOutId && nextPenId === replacedOutId && incomingId && xiSet.has(incomingId)) {
      nextPenId = incomingId;
    }
    if (!nextPenId || !xiSet.has(nextPenId)) {
      nextPenId = xiSorted[0]?.id;
    }

    const nextList: string[] = [];
    const used = new Set<string>();
    for (const id of prevTactics.penaltyTakerIds ?? []) {
      const mappedId = replacedOutId && id === replacedOutId && incomingId ? incomingId : id;
      if (mappedId && xiSet.has(mappedId) && !used.has(mappedId)) {
        nextList.push(mappedId);
        used.add(mappedId);
      }
    }
    for (const p of xiSorted) {
      if (nextList.length >= 10) break;
      if (!used.has(p.id)) {
        nextList.push(p.id);
        used.add(p.id);
      }
    }

    return {
      designatedPenaltyTakerId: nextPenId,
      penaltyTakerIds: nextList.slice(0, 10),
    };
  };

  const handleFormationChange = (formation: FormationId) => {
    const template = FORMATION_TEMPLATES[formation];
    const validSquadIds = new Set(career.squad.map((p) => p.id));
    const seenIds = new Set<string>();
    const uniqueStarters: string[] = [];

    for (const slot of career.tactics.slots) {
      if (slot.playerId && validSquadIds.has(slot.playerId) && !seenIds.has(slot.playerId)) {
        seenIds.add(slot.playerId);
        uniqueStarters.push(slot.playerId);
      }
    }
    for (const p of career.squad) {
      if (uniqueStarters.length >= 11) break;
      if (!seenIds.has(p.id)) {
        seenIds.add(p.id);
        uniqueStarters.push(p.id);
      }
    }

    const newSlots = template.map((tpl, i) => ({
      slotIndex: i,
      label: tpl.label,
      x: tpl.x,
      y: tpl.y,
      playerId: uniqueStarters[i] ?? '',
      role: tpl.defaultRole,
    }));
    const penSync = syncPenaltyTakersForSlots(newSlots, career.tactics);
    onUpdateTactics({ ...career.tactics, formation, slots: newSlots, ...penSync });
    setSelectedSlotIdx(null);
  };

  const handleAutoPick = () => {
    const autoSlots = buildAutoLineupSlots(career.tactics.formation, career.squad);
    const penSync = syncPenaltyTakersForSlots(autoSlots, career.tactics);
    onUpdateTactics({ ...career.tactics, slots: autoSlots, ...penSync });
    setSelectedSlotIdx(null);
  };

  const handleTapPitchSlot = (slotIdx: number) => {
    if (selectedSlotIdx === null) {
      setSelectedSlotIdx(slotIdx);
      return;
    }
    if (selectedSlotIdx === slotIdx) {
      setSelectedSlotIdx(null);
      return;
    }
    // Swap two starters
    const nextSlots = career.tactics.slots.map((s) => ({ ...s }));
    const a = nextSlots[selectedSlotIdx];
    const b = nextSlots[slotIdx];
    const tmp = a.playerId;
    a.playerId = b.playerId;
    b.playerId = tmp;
    onUpdateTactics({ ...career.tactics, slots: nextSlots });
    setSelectedSlotIdx(null);
  };

  const handleSwapWithBench = (benchPlayerId: string) => {
    if (selectedSlotIdx === null) {
      const p = playerMap.get(benchPlayerId);
      if (p) onSelectPlayer(p);
      return;
    }
    const outgoingId = career.tactics.slots[selectedSlotIdx]?.playerId;
    const nextSlots = career.tactics.slots.map((s, idx) =>
      idx === selectedSlotIdx ? { ...s, playerId: benchPlayerId } : s
    );
    const penSync = syncPenaltyTakersForSlots(nextSlots, career.tactics, outgoingId, benchPlayerId);
    onUpdateTactics({ ...career.tactics, slots: nextSlots, ...penSync });
    setSelectedSlotIdx(null);
  };

  const handleRoleChange = (slotIdx: number, role: PlayerRole) => {
    const nextSlots = career.tactics.slots.map((s, idx) =>
      idx === slotIdx ? { ...s, role } : s
    );
    onUpdateTactics({ ...career.tactics, slots: nextSlots });
  };

  const handleScoutAnalyze = async () => {
    setScouting(true);
    setScoutReport(null);
    try {
      const res = await fetch('/api/tactics/scout', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          clubName: club.name,
          formation: career.tactics.formation,
          mentality: career.tactics.mentality,
          opponentName: opponentClub?.name ?? 'Real Madrid',
          opponentManager: opponentManager?.name ?? 'Carlo Ancelotti',
          opponentFormation: opponentManager?.preferredFormation ?? '4-3-3',
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setScoutReport(data.error || 'Chưa thể phân tích lúc này.');
      } else {
        setScoutReport(data.report);
      }
    } catch {
      setScoutReport('Không thể kết nối máy chủ phân tích chiến thuật.');
    } finally {
      setScouting(false);
    }
  };

  const selectedSlot = selectedSlotIdx !== null ? career.tactics.slots[selectedSlotIdx] : null;
  const selectedPlayer = selectedSlot ? playerMap.get(selectedSlot.playerId) : undefined;

  return (
    <div className="space-y-5 lg:grid lg:grid-cols-12 lg:gap-6 lg:space-y-0">
      {/* Left/Top: Vertical Interactive Pitch */}
      <div className="lg:col-span-6 space-y-3">
        {/* Formation & Auto-Pick Bar */}
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-1.5 overflow-x-auto pb-1 no-scrollbar">
            {FORMATIONS.map((f) => (
              <button
                key={f}
                type="button"
                onClick={() => handleFormationChange(f)}
                className={`min-h-[40px] px-3 rounded-xl font-mono-num text-xs font-bold transition-colors whitespace-nowrap shrink-0 ${
                  career.tactics.formation === f
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#121B24] border border-white/10 text-slate-300 hover:text-white'
                }`}
              >
                {f}
              </button>
            ))}
          </div>

          <button
            type="button"
            onClick={handleAutoPick}
            className="min-h-[40px] px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-emerald-300 flex items-center gap-1.5 shrink-0"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Tối ưu
          </button>
        </div>

        {/* Vertical 2D Pitch */}
        <div className="relative w-full aspect-[3/4] max-h-[540px] rounded-2xl overflow-hidden border border-white/15 bg-[#0F291E] select-none">
          <img
            src="/src/assets/images/tactical_board_bg_1795100242751.jpg"
            alt="Sơ đồ chiến thuật sân dọc"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover opacity-55 rotate-90 scale-125 pointer-events-none"
          />
          <div className="absolute inset-0 bg-gradient-to-b from-emerald-950/55 via-emerald-950/35 to-emerald-950/75" />

          {/* Crisp SVG Vertical Pitch Markings */}
          <svg
            viewBox="0 0 300 400"
            preserveAspectRatio="none"
            className="absolute inset-0 w-full h-full pointer-events-none opacity-45"
          >
            <rect x="14" y="14" width="272" height="372" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
            <line x1="14" y1="200" x2="286" y2="200" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx="150" cy="200" r="38" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
            <circle cx="150" cy="200" r="2.5" fill="#FFFFFF" />
            <rect x="78" y="14" width="144" height="54" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
            <rect x="78" y="332" width="144" height="54" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
            <rect x="114" y="14" width="72" height="20" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
            <rect x="114" y="366" width="72" height="20" fill="none" stroke="#FFFFFF" strokeWidth="1.5" />
          </svg>

          {/* Tactical hint banner */}
          <div className="absolute top-2.5 left-3 right-3 flex items-center justify-between text-[11px] text-slate-200/90 pointer-events-none">
            <span>
              {selectedSlotIdx !== null
                ? 'Chạm cầu thủ khác hoặc dự bị để hoán đổi'
                : 'Chạm cầu thủ trên sân để đổi vị trí / vai trò'}
            </span>
            <span className="font-mono-num font-bold text-emerald-300">
              OVR {tacticalProfile.overall}
            </span>
          </div>

          {/* 11 Player Nodes */}
          {career.tactics.slots.map((slot, idx) => {
            const p = playerMap.get(slot.playerId);
            const isSelected = selectedSlotIdx === idx;
            const isOutOfPos = p && p.position !== slot.label;
            return (
              <button
                key={`${slot.slotIndex}-${slot.label}`}
                type="button"
                onClick={() => handleTapPitchSlot(idx)}
                style={{
                  left: `${slot.x}%`,
                  top: `${slot.y}%`,
                  transform: 'translate(-50%, -50%)',
                }}
                className={`absolute z-10 flex flex-col items-center min-w-[54px] min-h-[54px] justify-center transition-transform ${
                  isSelected ? 'scale-110' : 'active:scale-95'
                }`}
              >
                <div
                  className={`relative rounded-full p-0.5 ${
                    isSelected
                      ? 'ring-2 ring-amber-400 shadow-lg shadow-amber-400/30'
                      : isOutOfPos
                        ? 'ring-2 ring-amber-500/70'
                        : 'ring-1 ring-white/30'
                  }`}
                >
                  {p ? (
                    <PlayerAvatar player={p} club={club} size={40} showNumber={false} isUserCard />
                  ) : (
                    <div className="w-10 h-10 rounded-full bg-slate-800" />
                  )}
                  <span className="absolute -top-1 -right-1.5 bg-slate-950 text-emerald-400 font-mono-num text-[10px] font-bold px-1 rounded border border-white/15">
                    {p?.rating ?? '--'}
                  </span>
                </div>
                <span className="mt-1 px-1.5 py-0.5 rounded bg-slate-950/90 text-[10px] font-semibold text-white max-w-[78px] truncate border border-white/10">
                  {p?.shortName ?? slot.label}
                </span>
                <span className="text-[9px] font-mono-num text-emerald-300/90 leading-none mt-0.5">
                  {slot.label}
                </span>
              </button>
            );
          })}
        </div>

        {/* Selected Slot Role & Info Bar */}
        {selectedSlot && selectedPlayer && (
          <div className="rounded-2xl bg-[#121B24] border border-amber-400/40 p-3.5 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2.5 min-w-0">
                <PlayerAvatar player={selectedPlayer} club={club} size={40} isUserCard />
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white truncate">{selectedPlayer.name}</p>
                  <p className="text-xs text-slate-400">
                    Vị trí sân: {selectedSlot.label} · Sở trường: {selectedPlayer.position}
                  </p>
                </div>
              </div>
              <button
                type="button"
                onClick={() => onSelectPlayer(selectedPlayer)}
                className="px-3 h-9 rounded-lg bg-slate-800 text-xs font-medium text-emerald-300 shrink-0"
              >
                Chi tiết
              </button>
            </div>

            <div className="flex items-center gap-2 overflow-x-auto">
              <span className="text-xs text-slate-400 shrink-0">Vai trò:</span>
              {ROLES_BY_POSITION[selectedSlot.label].map((role) => (
                <button
                  key={role}
                  type="button"
                  onClick={() => handleRoleChange(selectedSlot.slotIndex, role)}
                  className={`h-9 px-3 rounded-lg text-xs font-medium whitespace-nowrap shrink-0 ${
                    selectedSlot.role === role
                      ? 'bg-emerald-500 text-slate-950 font-bold'
                      : 'bg-[#0B1117] text-slate-300 border border-white/10'
                  }`}
                >
                  {role}
                </button>
              ))}
            </div>
          </div>
        )}

        {/* Bench Strip */}
        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-2.5">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Ghế dự bị ({benchPlayers.length})</h3>
            <span className="text-[11px] text-slate-400">
              {selectedSlotIdx !== null ? 'Chạm cầu thủ dự bị để thay vào sân' : 'Chạm để xem chỉ số'}
            </span>
          </div>
          <div className="flex gap-2 overflow-x-auto pb-1">
            {benchPlayers.map((bp) => (
              <button
                key={bp.id}
                type="button"
                onClick={() => handleSwapWithBench(bp.id)}
                className={`min-w-[116px] rounded-xl p-2.5 border text-left transition-colors shrink-0 ${
                  selectedSlotIdx !== null
                    ? 'bg-emerald-500/10 border-emerald-500/40 hover:bg-emerald-500/20'
                    : 'bg-[#0B1117] border-white/10 hover:border-white/25'
                }`}
              >
                <div className="flex items-center gap-2">
                  <PlayerAvatar player={bp} club={club} size={32} isUserCard />
                  <div className="min-w-0">
                    <p className="text-xs font-semibold text-white truncate">{bp.shortName}</p>
                    <p className="text-[11px] font-mono-num text-emerald-400">
                      {bp.position} · {bp.rating}
                    </p>
                  </div>
                </div>
              </button>
            ))}
          </div>
        </div>
      </div>

      {/* Right/Bottom: Tactical Controls, Bench & Tactical Scout */}
      <div className="lg:col-span-6 space-y-4">
        {/* Tactical Rating Summary */}
        <div
          className={`rounded-xl px-3.5 py-2.5 border text-xs flex items-center justify-between gap-2 ${
            activeManager
              ? 'bg-[#121B24] border-emerald-500/25 text-slate-200'
              : 'bg-amber-500/10 border-amber-400/35 text-amber-200'
          }`}
        >
          <span className="truncate font-semibold">{managerImpact.label}</span>
          {activeManager && (
            <span className="font-mono-num text-[11px] text-emerald-400 shrink-0">
              +{managerImpact.atkBonus.toFixed(1)}ATK / +{managerImpact.defBonus.toFixed(1)}DEF
            </span>
          )}
        </div>

        <div className="grid grid-cols-4 gap-2">
          <div className="rounded-xl bg-[#121B24] border border-white/10 p-3 text-center">
            <p className="text-[11px] text-slate-400">Tấn công</p>
            <p className="font-mono-num text-xl font-bold text-rose-400">{tacticalProfile.attack}</p>
          </div>
          <div className="rounded-xl bg-[#121B24] border border-white/10 p-3 text-center">
            <p className="text-[11px] text-slate-400">Trung tuyến</p>
            <p className="font-mono-num text-xl font-bold text-sky-400">{tacticalProfile.midfield}</p>
          </div>
          <div className="rounded-xl bg-[#121B24] border border-white/10 p-3 text-center">
            <p className="text-[11px] text-slate-400">Phòng ngự</p>
            <p className="font-mono-num text-xl font-bold text-emerald-400">{tacticalProfile.defense}</p>
          </div>
          <div className="rounded-xl bg-[#121B24] border border-white/10 p-3 text-center">
            <p className="text-[11px] text-slate-400">Gắn kết</p>
            <p className="font-mono-num text-xl font-bold text-amber-400">{tacticalProfile.cohesion}%</p>
          </div>
        </div>

        {/* Mentality Selector */}
        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-bold text-white">Tâm lý thi đấu</h3>
            <span className="text-xs font-mono-num text-emerald-400">
              Kiểm soát bóng dự kiến ~{tacticalProfile.possessionIndex}%
            </span>
          </div>
          <div className="grid grid-cols-5 gap-1">
            {MENTALITIES.map((m) => (
              <button
                key={m.id}
                type="button"
                onClick={() => onUpdateTactics({ ...career.tactics, mentality: m.id })}
                className={`min-h-[42px] px-1 rounded-lg text-[11px] font-semibold transition-colors ${
                  career.tactics.mentality === m.id
                    ? 'bg-emerald-500 text-slate-950'
                    : 'bg-[#0B1117] text-slate-300 border border-white/5 hover:border-white/20'
                }`}
              >
                {m.label}
              </button>
            ))}
          </div>
        </div>

        {/* 3-Phase Tactical Instructions */}
        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-4">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#0B1117]">
            <button
              type="button"
              onClick={() => setInstructionPhase('possession')}
              className={`h-10 rounded-lg text-xs font-semibold ${
                instructionPhase === 'possession'
                  ? 'bg-slate-800 text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              Khi có bóng
            </button>
            <button
              type="button"
              onClick={() => setInstructionPhase('transition')}
              className={`h-10 rounded-lg text-xs font-semibold ${
                instructionPhase === 'transition'
                  ? 'bg-slate-800 text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              Chuyển trạng thái
            </button>
            <button
              type="button"
              onClick={() => setInstructionPhase('defense')}
              className={`h-10 rounded-lg text-xs font-semibold ${
                instructionPhase === 'defense'
                  ? 'bg-slate-800 text-emerald-400'
                  : 'text-slate-400'
              }`}
            >
              Khi mất bóng
            </button>
          </div>

          {instructionPhase === 'possession' && (
            <div className="space-y-3.5">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Cự ly chuyền bóng</span>
                  <span className="font-mono-num text-emerald-400">
                    {career.tactics.passingDirectness <= 2
                      ? 'Ngắn (Tiki-Taka)'
                      : career.tactics.passingDirectness === 3
                        ? 'Cân bằng'
                        : 'Trực diện'}
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={career.tactics.passingDirectness}
                  onChange={(e) =>
                    onUpdateTactics({
                      ...career.tactics,
                      passingDirectness: Number(e.target.value),
                    })
                  }
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Nhịp độ triển khai</span>
                  <span className="font-mono-num text-emerald-400">
                    Mức {career.tactics.tempo}/5
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={career.tactics.tempo}
                  onChange={(e) =>
                    onUpdateTactics({ ...career.tactics, tempo: Number(e.target.value) })
                  }
                  className="w-full accent-emerald-500"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Độ rộng đội hình</span>
                  <span className="font-mono-num text-emerald-400">
                    Mức {career.tactics.width}/5
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={career.tactics.width}
                  onChange={(e) =>
                    onUpdateTactics({ ...career.tactics, width: Number(e.target.value) })
                  }
                  className="w-full accent-emerald-500"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  onUpdateTactics({
                    ...career.tactics,
                    workBallIntoBox: !career.tactics.workBallIntoBox,
                  })
                }
                className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 flex items-center justify-between text-xs"
              >
                <span className="text-slate-200">Phối hợp vào vòng cấm (Work Ball Into Box)</span>
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center ${
                    career.tactics.workBallIntoBox ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800'
                  }`}
                >
                  {career.tactics.workBallIntoBox && <Check className="w-3.5 h-3.5" />}
                </span>
              </button>
            </div>
          )}

          {instructionPhase === 'transition' && (
            <div className="space-y-2.5">
              <button
                type="button"
                onClick={() =>
                  onUpdateTactics({
                    ...career.tactics,
                    counterPress: !career.tactics.counterPress,
                  })
                }
                className="w-full h-12 px-3.5 rounded-xl bg-[#0B1117] border border-white/10 flex items-center justify-between text-xs"
              >
                <div className="text-left">
                  <p className="text-white font-semibold">Counter-Press (Gegenpressing)</p>
                  <p className="text-[11px] text-slate-400">Lập tức vây ráp ngay khi vừa mất bóng</p>
                </div>
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center ${
                    career.tactics.counterPress ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800'
                  }`}
                >
                  {career.tactics.counterPress && <Check className="w-3.5 h-3.5" />}
                </span>
              </button>

              <button
                type="button"
                onClick={() =>
                  onUpdateTactics({
                    ...career.tactics,
                    playOutOfDefence: !career.tactics.playOutOfDefence,
                  })
                }
                className="w-full h-12 px-3.5 rounded-xl bg-[#0B1117] border border-white/10 flex items-center justify-between text-xs"
              >
                <div className="text-left">
                  <p className="text-white font-semibold">Triển khai bóng từ tuyến dưới</p>
                  <p className="text-[11px] text-slate-400">Thủ môn & trung vệ phối hợp ngắn phát động</p>
                </div>
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center ${
                    career.tactics.playOutOfDefence ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800'
                  }`}
                >
                  {career.tactics.playOutOfDefence && <Check className="w-3.5 h-3.5" />}
                </span>
              </button>
            </div>
          )}

          {instructionPhase === 'defense' && (
            <div className="space-y-3.5">
              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Cường độ Pressing</span>
                  <span className="font-mono-num text-amber-400">
                    Mức {career.tactics.pressingIntensity}/5
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={career.tactics.pressingIntensity}
                  onChange={(e) =>
                    onUpdateTactics({
                      ...career.tactics,
                      pressingIntensity: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400"
                />
              </div>

              <div>
                <div className="flex justify-between text-xs mb-1">
                  <span className="text-slate-300">Độ cao hàng phòng ngự</span>
                  <span className="font-mono-num text-amber-400">
                    Mức {career.tactics.defensiveLine}/5
                  </span>
                </div>
                <input
                  type="range"
                  min={1}
                  max={5}
                  value={career.tactics.defensiveLine}
                  onChange={(e) =>
                    onUpdateTactics({
                      ...career.tactics,
                      defensiveLine: Number(e.target.value),
                    })
                  }
                  className="w-full accent-amber-400"
                />
              </div>

              <button
                type="button"
                onClick={() =>
                  onUpdateTactics({
                    ...career.tactics,
                    offsideTrap: !career.tactics.offsideTrap,
                  })
                }
                className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 flex items-center justify-between text-xs"
              >
                <span className="text-slate-200">Kích hoạt Bẫy việt vị (Offside Trap)</span>
                <span
                  className={`w-5 h-5 rounded flex items-center justify-center ${
                    career.tactics.offsideTrap ? 'bg-emerald-500 text-slate-950' : 'bg-slate-800'
                  }`}
                >
                  {career.tactics.offsideTrap && <Check className="w-3.5 h-3.5" />}
                </span>
              </button>
            </div>
          )}
        </div>

        {/* Penalty & Shootout Takers Management */}
        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Target className="w-4 h-4 text-emerald-400" />
                Sút phạt đền &amp; Luân lưu (Penalties)
              </h3>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Chỉ chọn từ 11 cầu thủ đang đá chính trên sân (theo đúng luật).
              </p>
            </div>
            <button
              type="button"
              onClick={() => {
                onUpdateTactics({
                  ...career.tactics,
                  designatedPenaltyTakerId: sortedXIBySho[0]?.id,
                  penaltyTakerIds: sortedXIBySho.slice(0, 10).map((p) => p.id),
                });
              }}
              className="h-8 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-[11px] font-semibold text-emerald-300 shrink-0"
            >
              Xếp theo Sút
            </button>
          </div>
          <div className="space-y-3">
            <div>
              <label className="text-xs text-slate-400 block mb-1">Cầu thủ sút Penalty chính (trong trận)</label>
              <select
                value={sanitizedDesignatedPenaltyId}
                onChange={(e) =>
                  onUpdateTactics({
                    ...career.tactics,
                    designatedPenaltyTakerId: e.target.value,
                  })
                }
                className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500"
              >
                {sortedXIBySho.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.name} ({p.position} · Sút {p.attributes.sho} · OVR {p.rating})
                  </option>
                ))}
              </select>
            </div>

            <div>
              <label className="text-xs text-slate-400 block mb-1">
                Thứ tự sút luân lưu (5 Lượt chính thức &amp; 5 Lượt dự bị Sudden Death)
              </label>

              <div className="mb-2 text-[11px] font-semibold text-emerald-400">
                5 Lượt chính thức (Main Takers)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2 mb-3">
                {[0, 1, 2, 3, 4].map((slotIdx) => {
                  const selectedId = sanitizedShootoutTakers[slotIdx] ?? '';
                  return (
                    <div key={slotIdx} className="space-y-1">
                      <span className="text-[10px] font-mono-num text-emerald-400 font-bold">
                        Lượt #{slotIdx + 1}
                      </span>
                      <select
                        value={selectedId}
                        onChange={(e) => {
                          const next = [...sanitizedShootoutTakers];
                          const newVal = e.target.value;
                          const prevIdx = next.findIndex((id, idx) => idx !== slotIdx && id === newVal);
                          if (prevIdx !== -1) {
                            next[prevIdx] = selectedId;
                          }
                          next[slotIdx] = newVal;
                          onUpdateTactics({
                            ...career.tactics,
                            penaltyTakerIds: next,
                          });
                        }}
                        className="w-full h-10 px-2 rounded-xl bg-[#0B1117] border border-white/10 text-[11px] text-white focus:outline-none focus:border-emerald-500"
                      >
                        {sortedXIBySho
                          .filter((p) => {
                            const isUsedElsewhere = sanitizedShootoutTakers.some(
                              (id, idx) => idx !== slotIdx && id === p.id
                            );
                            return !isUsedElsewhere || p.id === selectedId;
                          })
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.shortName} ({p.position} · {p.attributes.sho})
                            </option>
                          ))}
                      </select>
                    </div>
                  );
                })}
              </div>

              <div className="mb-2 text-[11px] font-semibold text-cyan-400">
                5 Lượt tiếp theo (Sudden Death)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-5 gap-2">
                {[5, 6, 7, 8, 9].map((slotIdx) => {
                  const selectedId = sanitizedShootoutTakers[slotIdx] ?? '';
                  return (
                    <div key={slotIdx} className="space-y-1">
                      <span className="text-[10px] font-mono-num text-cyan-400 font-bold">
                        Lượt #{slotIdx + 1}
                      </span>
                      <select
                        value={selectedId}
                        onChange={(e) => {
                          const next = [...sanitizedShootoutTakers];
                          const newVal = e.target.value;
                          const prevIdx = next.findIndex((id, idx) => idx !== slotIdx && id === newVal);
                          if (prevIdx !== -1) {
                            next[prevIdx] = selectedId;
                          }
                          next[slotIdx] = newVal;
                          onUpdateTactics({
                            ...career.tactics,
                            penaltyTakerIds: next,
                          });
                        }}
                        className="w-full h-10 px-2 rounded-xl bg-[#0B1117] border border-white/10 text-[11px] text-white focus:outline-none focus:border-emerald-500"
                      >
                        {sortedXIBySho
                          .filter((p) => {
                            const isUsedElsewhere = sanitizedShootoutTakers.some(
                              (id, idx) => idx !== slotIdx && id === p.id
                            );
                            return !isUsedElsewhere || p.id === selectedId;
                          })
                          .map((p) => (
                            <option key={p.id} value={p.id}>
                              {p.shortName} ({p.position} · {p.attributes.sho})
                            </option>
                          ))}
                      </select>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>



        {/* Tactical Assistant Analysis */}
        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Brain className="w-4 h-4 text-emerald-400" />
                Phân tích đối thủ vòng tới
              </h3>
              <p className="text-xs text-slate-400">
                {opponentClub
                  ? `Gặp ${opponentClub.name} (HLV ${opponentManager?.name})`
                  : 'Hoàn tất mùa giải'}
              </p>
            </div>
            <button
              type="button"
              disabled={scouting || !opponentClub}
              onClick={handleScoutAnalyze}
              className="h-10 px-3.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300 hover:bg-emerald-500/25 flex items-center gap-1.5 shrink-0 disabled:opacity-50"
            >
              <Sparkles className="w-3.5 h-3.5" />
              {scouting ? 'Đang phân tích...' : 'Phân tích'}
            </button>
          </div>
          {scoutReport && (
            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 text-xs text-slate-200 leading-relaxed whitespace-pre-line">
              {scoutReport}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
