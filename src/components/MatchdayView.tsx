import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  ChevronRight,
  FastForward,
  Flame,
  Pause,
  Play,
  RefreshCw,
  Shield,
  Trophy,
  Users,
  Volume2,
  VolumeX,
} from 'lucide-react';
import { playSfx, isSoundEnabled, setSoundEnabled } from '../lib/soundFx';
import { CLUBS, FORMATION_TEMPLATES, INITIAL_PLAYERS, REAL_MANAGERS } from '../data/footballDatabase';
import {
  buildEffectiveDatabasePlayers,
  buildMatchSummaryFromStored,
  ensureMatchResultRatings,
  ensureTacticPresets,
  getActiveCareerManager,
  isCompetitionFinished,
  isPlayerInjured,
  isPlayerUnavailable,
  resimulateMatchFromMinute,
  resolveCompetitionAwards,
  simulateMatchFull,
  sortStandings,
} from '../lib/careerEngine';
import {
  CareerSave,
  CompetitionId,
  CupMatch,
  Fixture,
  FormationId,
  MarketOverride,
  MatchEvent,
  MatchResultSummary,
  Mentality,
  Player,
  TacticSlot,
  TacticSlotKey,
} from '../types/game';
import { ClubCrest, ManagerAvatar, PlayerAvatar } from './ClubBadgeAndAvatar';
import { CompetitionStatsPanel } from './CompetitionStatsPanel';
import { ConfirmActionModal } from './ConfirmActionModal';
import { MatchDetailModal, MatchStatsBreakdown } from './MatchDetailModal';
import { SeasonAwardsShowcase } from './SeasonAwardsShowcase';

interface MatchdayViewProps {
  career: CareerSave;
  marketOverrides?: Record<string, MarketOverride>;
  onCompleteMatchweek: (userMatch: MatchResultSummary, allMatches: MatchResultSummary[]) => Promise<void>;
  onCompleteCupMatch: (
    competition: 'champions-cup' | 'national-cup' | 'super-cup',
    userMatch: MatchResultSummary | null,
    roundEntries: { matchId: string; result: MatchResultSummary }[]
  ) => Promise<void>;
  onCompleteFriendly: (userMatch: MatchResultSummary) => Promise<void>;
  onClaimSeasonRewards: () => Promise<{ ok: boolean; message: string }>;
  onStartNextSeason: () => Promise<void>;
  onOpenFinancePayroll?: () => void;
  onQuickMentality: (mentality: Mentality) => void;
  onSelectTacticSlot?: (slot: TacticSlotKey) => void;
  onPrepareBeforeMatch?: () => Promise<CareerSave>;
  onToggleSoundSetting?: (enabled: boolean) => void;
  pauseLiveMatchExternal?: boolean;
  onLiveMatchGuardChange?: (
    active: boolean,
    summary?: { matchTitle: string; scoreLine: string; minuteText: string }
  ) => void;
  forceFinishLiveMatchRef?: React.MutableRefObject<(() => Promise<void>) | null>;
}

type CompetitionViewTab = 'league' | 'champions-cup' | 'national-cup' | 'special';

type ActiveSimContext =
  | { kind: 'league' }
  | {
      kind: 'champions-cup';
      cupMatchId: string;
      roundMatches: CupMatch[];
      isKnockout: boolean;
      isNeutralVenue?: boolean;
      roundLabel: string;
    }
  | {
      kind: 'national-cup';
      cupMatchId: string;
      roundMatches: CupMatch[];
      isNeutralVenue?: boolean;
      roundLabel: string;
    }
  | { kind: 'super-cup'; cupMatchId: string; isNeutralVenue?: boolean }
  | { kind: 'friendly' };

const LIVE_MENTALITY_OPTIONS: { id: Mentality; label: string }[] = [
  { id: 'Cautious', label: 'Thận trọng' },
  { id: 'Balanced', label: 'Cân bằng' },
  { id: 'Positive', label: 'Tích cực' },
  { id: 'Attacking', label: 'Tấn công' },
  { id: 'Very Attacking', label: 'Tổng lực' },
];

const STAGE_LABEL: Record<string, string> = {
  group: 'Vòng bảng',
  r16: 'Vòng 1/8',
  qf: 'Tứ kết',
  sf: 'Bán kết',
  final: 'Chung kết',
  completed: 'Đã hoàn tất',
};

export const MatchdayView: React.FC<MatchdayViewProps> = ({
  career,
  marketOverrides,
  onCompleteMatchweek,
  onCompleteCupMatch,
  onCompleteFriendly,
  onClaimSeasonRewards,
  onStartNextSeason,
  onOpenFinancePayroll,
  onQuickMentality,
  onSelectTacticSlot,
  onPrepareBeforeMatch,
  onToggleSoundSetting,
  pauseLiveMatchExternal = false,
  onLiveMatchGuardChange,
  forceFinishLiveMatchRef,
}) => {
  const [compTab, setCompTab] = useState<CompetitionViewTab>('league');
  const [subTab, setSubTab] = useState<'match' | 'standings' | 'fixtures' | 'scorers' | 'assists' | 'mvp'>(
    'match'
  );
  const [cupSubTab, setCupSubTab] = useState<'overview' | 'history' | 'scorers' | 'assists' | 'mvp'>(
    'overview'
  );
  const [ncSubTab, setNcSubTab] = useState<'bracket' | 'scorers' | 'assists' | 'mvp'>('bracket');
  const [specialSubTab, setSpecialSubTab] = useState<'play' | 'history' | 'scorers' | 'assists' | 'mvp'>(
    'play'
  );
  const [specialStatsTarget, setSpecialStatsTarget] = useState<'friendly' | 'super-cup'>(
    'friendly'
  );
  const [inspectedMatch, setInspectedMatch] = useState<MatchResultSummary | null>(null);
  const [selectedLeagueRound, setSelectedLeagueRound] = useState<number>(() =>
    Math.max(1, career.matchweek - 1)
  );

  // Friendly opponent selector
  const otherClubs = useMemo(
    () => CLUBS.filter((c) => c.id !== career.clubId),
    [career.clubId]
  );
  const [friendlyOppId, setFriendlyOppId] = useState<string>(otherClubs[0]?.id ?? 'real-madrid');
  const [friendlyAtHome, setFriendlyAtHome] = useState<boolean>(true);

  // Live 2D match simulator state
  const [isLive, setIsLive] = useState(false);
  const [minute, setMinute] = useState(0);
  const [speed, setSpeed] = useState<1 | 2 | 4>(() => career.settings?.defaultLiveSpeed ?? 2);
  const [liveResult, setLiveResult] = useState<MatchResultSummary | null>(null);
  const [simContext, setSimContext] = useState<ActiveSimContext | null>(null);
  const [savingMatch, setSavingMatch] = useState(false);
  const [confirmFinishLiveOpen, setConfirmFinishLiveOpen] = useState(false);
  const [pendingQuickSim, setPendingQuickSim] = useState<{
    title: string;
    subtitle: string;
    run: () => void;
  } | null>(null);

  // Sound effects state & triggers (synced with GameSettings modal)
  const [soundOn, setSoundOn] = useState(() =>
    career.settings ? career.settings.soundEnabled : isSoundEnabled()
  );

  useEffect(() => {
    if (career.settings) {
      setSoundOn(career.settings.soundEnabled);
      setSoundEnabled(career.settings.soundEnabled);
    }
  }, [career.settings]);

  useEffect(() => {
    if (!isLive && career.settings?.defaultLiveSpeed) {
      setSpeed(career.settings.defaultLiveSpeed);
    }
  }, [isLive, career.settings?.defaultLiveSpeed]);

  const toggleSound = () => {
    const next = !soundOn;
    setSoundOn(next);
    setSoundEnabled(next);
    onToggleSoundSetting?.(next);
  };

  useEffect(() => {
    if (isLive && minute === 1) {
      playSfx('whistle');
    }
    if (isLive && minute >= 90) {
      playSfx('whistle');
    }
  }, [isLive, minute]);

  useEffect(() => {
    if (!isLive || !liveResult) return;
    const currentEvent = liveResult.events.find((e) => e.minute === minute);
    if (currentEvent) {
      if (currentEvent.type === 'goal') {
        playSfx('goal');
      } else if (currentEvent.type === 'yellow' || currentEvent.type === 'red') {
        playSfx('card');
      } else if (currentEvent.type === 'save') {
        playSfx('save');
      }
    }
  }, [isLive, liveResult, minute]);

  // In-match live substitution, pause & penalty shootout state
  const [isPaused, setIsPaused] = useState(false);
  const [matchSlots, setMatchSlots] = useState<TacticSlot[]>([]);
  const [liveFormation, setLiveFormation] = useState<FormationId>(career.tactics.formation);
  const [subsMade, setSubsMade] = useState(0);
  const [subbedOutIds, setSubbedOutIds] = useState<string[]>([]);
  const [subbedInMinutes, setSubbedInMinutes] = useState<Record<string, number>>({});
  const [participatedIds, setParticipatedIds] = useState<string[]>([]);
  const [subPanelOpen, setSubPanelOpen] = useState(false);
  const [selectedSubOutIdx, setSelectedSubOutIdx] = useState<number | null>(null);
  const [subNotice, setSubNotice] = useState<string | null>(null);
  const [shootoutStep, setShootoutStep] = useState<number>(-1);

  const timerRef = useRef<number | null>(null);
  const shootoutTimerRef = useRef<number | null>(null);
  const finalizedMatchIdRef = useRef<string | null>(null);
  const matchEndTriggeredRef = useRef<string | null>(null);

  const userMatchFixture = useMemo(
    () =>
      career.fixtures.find(
        (f) =>
          f.matchweek === career.matchweek &&
          !f.played &&
          (f.homeClubId === career.clubId || f.awayClubId === career.clubId)
      ),
    [career.fixtures, career.matchweek, career.clubId]
  );

  const sortedStandings = useMemo(() => sortStandings(career.standings), [career.standings]);

  const activeUserManager = useMemo(() => getActiveCareerManager(career), [career]);
  const effectiveAllPlayers = useMemo(
    () => buildEffectiveDatabasePlayers(career.squad, INITIAL_PLAYERS, marketOverrides),
    [career.squad, marketOverrides]
  );
  const userSquadStars = useMemo(
    () => Object.fromEntries(career.squad.map((p) => [p.id, p.stars ?? 1])),
    [career.squad]
  );
  const leagueAwards = useMemo(() => resolveCompetitionAwards(career, 'league'), [career]);
  const ccAwards = useMemo(() => resolveCompetitionAwards(career, 'champions-cup'), [career]);
  const ncAwards = useMemo(() => resolveCompetitionAwards(career, 'national-cup'), [career]);
  const specialAwards = useMemo(
    () => resolveCompetitionAwards(career, specialStatsTarget),
    [career, specialStatsTarget]
  );

  const cc = career.competitions?.championsCup;
  const nc = career.competitions?.nationalCup;
  const sc = career.competitions?.superCup;

  // Find current active round matches for Champions Cup
  const ccCurrentRoundMatches = useMemo(() => {
    if (!cc || cc.stage === 'completed') return [];
    if (cc.stage === 'group') {
      return cc.matches.filter((m) => m.stage === 'group' && m.round === cc.currentRound && !m.played);
    }
    return cc.matches.filter((m) => m.stage === cc.stage && !m.played);
  }, [cc]);

  const userCcMatch = useMemo(
    () =>
      ccCurrentRoundMatches.find(
        (m) => m.homeClubId === career.clubId || m.awayClubId === career.clubId
      ),
    [ccCurrentRoundMatches, career.clubId]
  );

  // Find current active round matches for National Cup
  const ncCurrentRoundMatches = useMemo(() => {
    if (!nc || nc.stage === 'completed') return [];
    return nc.matches.filter((m) => m.stage === nc.stage && !m.played);
  }, [nc]);

  const userNcMatch = useMemo(
    () =>
      ncCurrentRoundMatches.find(
        (m) => m.homeClubId === career.clubId || m.awayClubId === career.clubId
      ),
    [ncCurrentRoundMatches, career.clubId]
  );

  const userScMatch = useMemo(() => {
    if (!sc || sc.match.played) return undefined;
    if (sc.match.homeClubId === career.clubId || sc.match.awayClubId === career.clubId) {
      return sc.match;
    }
    return undefined;
  }, [sc, career.clubId]);

  useEffect(() => {
    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
      if (shootoutTimerRef.current) window.clearInterval(shootoutTimerRef.current);
    };
  }, []);

  const clearLivePitch = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (shootoutTimerRef.current) window.clearInterval(shootoutTimerRef.current);
    finalizedMatchIdRef.current = null;
    matchEndTriggeredRef.current = null;
    setIsLive(false);
    setIsPaused(false);
    setLiveResult(null);
    setSimContext(null);
    setMinute(0);
    setMatchSlots([]);
    setSubsMade(0);
    setSubbedOutIds([]);
    setSubbedInMinutes({});
    setParticipatedIds([]);
    setSubPanelOpen(false);
    setSelectedSubOutIdx(null);
    setSubNotice(null);
    setShootoutStep(-1);
  };

  const finalizeSimulation = useCallback(
    async (userRes: MatchResultSummary, context: ActiveSimContext | null) => {
      if (!context) return;
      if (finalizedMatchIdRef.current === userRes.id) return;
      finalizedMatchIdRef.current = userRes.id;
      matchEndTriggeredRef.current = userRes.id;
      setIsLive(false);
      setSavingMatch(true);
      try {
        if (context.kind === 'league') {
          const mwFixtures = career.fixtures.filter(
            (f) => f.matchweek === career.matchweek && !f.played
          );
          const otherResults = mwFixtures
            .filter((f) => f.id !== userMatchFixture?.id)
            .map((f) =>
              simulateMatchFull(
                f.homeClubId,
                f.awayClubId,
                career.matchweek,
                career.clubId,
                career.tactics,
                career.squad,
                effectiveAllPlayers,
                { userManager: activeUserManager }
              )
            );
          await onCompleteMatchweek(userRes, [userRes, ...otherResults]);
        } else if (context.kind === 'champions-cup') {
          const entries = context.roundMatches.map((m) => ({
            matchId: m.id,
            result:
              m.id === context.cupMatchId
                ? userRes
                : simulateMatchFull(
                    m.homeClubId,
                    m.awayClubId,
                    career.matchweek,
                    career.clubId,
                    career.tactics,
                    career.squad,
                    effectiveAllPlayers,
                    {
                      isKnockout: context.isKnockout,
                      isNeutralVenue: context.isNeutralVenue,
                      competition: 'champions-cup',
                      roundLabel: context.roundLabel,
                      matchId: m.id,
                      userManager: activeUserManager,
                    }
                  ),
          }));
          await onCompleteCupMatch('champions-cup', userRes, entries);
        } else if (context.kind === 'national-cup') {
          const entries = context.roundMatches.map((m) => ({
            matchId: m.id,
            result:
              m.id === context.cupMatchId
                ? userRes
                : simulateMatchFull(
                    m.homeClubId,
                    m.awayClubId,
                    career.matchweek,
                    career.clubId,
                    career.tactics,
                    career.squad,
                    effectiveAllPlayers,
                    {
                      isKnockout: true,
                      isNeutralVenue: context.isNeutralVenue,
                      competition: 'national-cup',
                      roundLabel: context.roundLabel,
                      matchId: m.id,
                      userManager: activeUserManager,
                    }
                  ),
          }));
          await onCompleteCupMatch('national-cup', userRes, entries);
        } else if (context.kind === 'super-cup') {
          await onCompleteCupMatch('super-cup', userRes, [
            { matchId: context.cupMatchId, result: userRes },
          ]);
        } else if (context.kind === 'friendly') {
          await onCompleteFriendly(userRes);
        }
        setIsLive(false);
      } finally {
        setSavingMatch(false);
      }
    },
    [
      career.fixtures,
      career.matchweek,
      career.clubId,
      career.tactics,
      career.squad,
      effectiveAllPlayers,
      activeUserManager,
      userMatchFixture?.id,
      onCompleteMatchweek,
      onCompleteCupMatch,
      onCompleteFriendly,
    ]
  );

  const launchMatch = async (
    homeId: string,
    awayId: string,
    context: ActiveSimContext,
    options: {
      isKnockout?: boolean;
      isNeutralVenue?: boolean;
      competition: MatchResultSummary['competition'];
      roundLabel?: string;
      matchId?: string;
    },
    instant: boolean
  ) => {
    finalizedMatchIdRef.current = null;
    matchEndTriggeredRef.current = null;
    const preparedCareer = onPrepareBeforeMatch ? await onPrepareBeforeMatch() : career;
    const simulated = simulateMatchFull(
      homeId,
      awayId,
      preparedCareer.matchweek,
      preparedCareer.clubId,
      preparedCareer.tactics,
      preparedCareer.squad,
      effectiveAllPlayers,
      { ...options, userManager: activeUserManager }
    );
    const initialMatchSlots = preparedCareer.tactics.slots.map((s) => ({ ...s }));
    const initialParticipated = initialMatchSlots.map((s) => s.playerId).filter(Boolean);
    setSimContext(context);
    if (instant) {
      await finalizeSimulation(simulated, context);
      setLiveResult(null);
      setSimContext(null);
      setMinute(0);
      setInspectedMatch(simulated);
    } else {
      setIsPaused(false);
      setSpeed(preparedCareer.settings?.defaultLiveSpeed ?? 2);
      setMatchSlots(initialMatchSlots);
      setLiveFormation(preparedCareer.tactics.formation);
      setSubsMade(0);
      setSubbedOutIds([]);
      setSubbedInMinutes({});
      setParticipatedIds(initialParticipated);
      setSubPanelOpen(false);
      setSelectedSubOutIdx(null);
      setSubNotice(null);
      setShootoutStep(-1);
      setLiveResult(simulated);
      setMinute(1);
      setIsLive(true);
    }
  };

  const skipActiveLiveToFullTime = useCallback(async () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (shootoutTimerRef.current) window.clearInterval(shootoutTimerRef.current);
    if (liveResultRef.current && simContextRef.current) {
      matchEndTriggeredRef.current = liveResultRef.current.id;
      setIsPaused(false);
      setSubPanelOpen(false);
      setShootoutStep(-1);
      setMinute(90);
      await finalizeSimulation(liveResultRef.current, simContextRef.current);
    }
  }, [finalizeSimulation]);

  const buildInMatchUserTactics = (
    slotsOverride: TacticSlot[],
    mentalityOverride?: Mentality,
    replacedOutId?: string,
    incomingId?: string,
    formationOverride?: FormationId
  ) => {
    const activeIds = new Set(slotsOverride.map((s) => s.playerId));
    const playerMap = new Map(career.squad.map((p) => [p.id, p]));
    const xiSorted = slotsOverride
      .map((s) => playerMap.get(s.playerId))
      .filter((p): p is Player => Boolean(p))
      .sort((a, b) => {
        if (a.position === 'GK' && b.position !== 'GK') return 1;
        if (b.position === 'GK' && a.position !== 'GK') return -1;
        return b.attributes.sho - a.attributes.sho;
      });

    let designatedPen = career.tactics.designatedPenaltyTakerId;
    if (replacedOutId && designatedPen === replacedOutId && incomingId && activeIds.has(incomingId)) {
      designatedPen = incomingId;
    }
    if (!designatedPen || !activeIds.has(designatedPen)) {
      designatedPen = xiSorted[0]?.id;
    }

    const nextList: string[] = [];
    const used = new Set<string>();
    for (const id of career.tactics.penaltyTakerIds ?? []) {
      const mapped = replacedOutId && id === replacedOutId && incomingId ? incomingId : id;
      if (mapped && activeIds.has(mapped) && !used.has(mapped)) {
        nextList.push(mapped);
        used.add(mapped);
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
      ...career.tactics,
      formation: formationOverride ?? liveFormation,
      mentality: mentalityOverride ?? career.tactics.mentality,
      slots: slotsOverride,
      designatedPenaltyTakerId: designatedPen,
      penaltyTakerIds: nextList.slice(0, 10),
    };
  };

  const handleLiveMentalityChange = (nextMentality: Mentality) => {
    onQuickMentality(nextMentality);
    if (!isLive || !liveResult || minute >= 90 || shootoutStep >= 0) return;
    const activeSlots = matchSlots.length > 0 ? matchSlots : career.tactics.slots;
    const nextTactics = buildInMatchUserTactics(activeSlots, nextMentality);
    const isKnockoutCtx =
      simContext?.kind === 'national-cup' ||
      simContext?.kind === 'super-cup' ||
      (simContext?.kind === 'champions-cup' && simContext.isKnockout);
    const isNeutralCtx =
      simContext?.kind === 'super-cup' ||
      (simContext?.kind === 'champions-cup' && Boolean(simContext.isNeutralVenue)) ||
      (simContext?.kind === 'national-cup' && Boolean(simContext.isNeutralVenue));
    const adapted = resimulateMatchFromMinute({
      currentMatch: liveResult,
      fromMinute: minute,
      userClubId: career.clubId,
      nextUserTactics: nextTactics,
      userSquad: career.squad,
      allPlayers: effectiveAllPlayers,
      userManager: activeUserManager,
      isKnockout: isKnockoutCtx,
      isNeutralVenue: isNeutralCtx,
      participatedUserPlayerIds: participatedIds,
    });
    setLiveResult(adapted);
  };

  const handleLiveFormationChange = (nextFormation: FormationId) => {
    if (!isLive || !liveResult || minute >= 90 || shootoutStep >= 0 || nextFormation === liveFormation) {
      return;
    }
    const prevFormation = liveFormation;
    const tpl = FORMATION_TEMPLATES[nextFormation] ?? FORMATION_TEMPLATES['4-3-3'];
    const activeSlots = matchSlots.length > 0 ? matchSlots : career.tactics.slots;
    const currentAssignedPlayerIds = activeSlots.map((s) => s.playerId).filter(Boolean);
    const nextSlots: TacticSlot[] = tpl.map((slot, idx) => ({
      slotIndex: idx,
      label: slot.label,
      x: slot.x,
      y: slot.y,
      playerId: currentAssignedPlayerIds[idx] ?? currentAssignedPlayerIds[0] ?? '',
      role: slot.defaultRole,
    }));

    setMatchSlots(nextSlots);
    setLiveFormation(nextFormation);
    const nextTactics = buildInMatchUserTactics(nextSlots, undefined, undefined, undefined, nextFormation);

    const isKnockoutCtx =
      simContext?.kind === 'national-cup' ||
      simContext?.kind === 'super-cup' ||
      (simContext?.kind === 'champions-cup' && simContext.isKnockout);
    const isNeutralCtx =
      simContext?.kind === 'super-cup' ||
      (simContext?.kind === 'champions-cup' && Boolean(simContext.isNeutralVenue)) ||
      (simContext?.kind === 'national-cup' && Boolean(simContext.isNeutralVenue));

    const formationEvent: MatchEvent = {
      minute,
      type: 'sub',
      teamId: career.clubId,
      playerName: activeUserManager?.name ?? 'HLV',
      description: `Điều chỉnh sơ đồ chiến thuật: Chuyển đội hình từ ${prevFormation} sang ${nextFormation}!`,
    };

    const adapted = resimulateMatchFromMinute({
      currentMatch: liveResult,
      fromMinute: minute,
      userClubId: career.clubId,
      nextUserTactics: nextTactics,
      userSquad: career.squad,
      allPlayers: effectiveAllPlayers,
      userManager: activeUserManager,
      isKnockout: isKnockoutCtx,
      isNeutralVenue: isNeutralCtx,
      subEvent: formationEvent,
      participatedUserPlayerIds: participatedIds,
    });
    setLiveResult(adapted);
  };

  const handleLiveSubstitution = (slotIdx: number, inPlayerId: string) => {
    if (!isLive || !liveResult || minute >= 90 || shootoutStep >= 0 || subsMade >= 5) return;
    const activeSlots = matchSlots.length > 0 ? matchSlots : career.tactics.slots;
    const targetSlot = activeSlots[slotIdx];
    if (!targetSlot) return;
    const outPlayerId = targetSlot.playerId;
    if (!outPlayerId || outPlayerId === inPlayerId) return;

    const outPlayer = career.squad.find((p) => p.id === outPlayerId);
    const inPlayer = career.squad.find((p) => p.id === inPlayerId);
    if (!outPlayer || !inPlayer) return;

    const nextSlots = activeSlots.map((s, idx) =>
      idx === slotIdx ? { ...s, playerId: inPlayerId } : { ...s }
    );
    const nextSubsMade = subsMade + 1;
    const nextSubbedOut = [...subbedOutIds, outPlayerId];
    const nextParticipated = Array.from(new Set([...participatedIds, outPlayerId, inPlayerId]));

    setMatchSlots(nextSlots);
    setSubsMade(nextSubsMade);
    setSubbedOutIds(nextSubbedOut);
    setSubbedInMinutes((prev) => ({ ...prev, [inPlayerId]: minute }));
    setParticipatedIds(nextParticipated);
    setSelectedSubOutIdx(null);
    setSubNotice(
      `Phút ${minute}': ${inPlayer.shortName} đã vào thay ${outPlayer.shortName} (${nextSubsMade}/5).`
    );

    const nextTactics = buildInMatchUserTactics(nextSlots, undefined, outPlayerId, inPlayerId);
    const isKnockoutCtx =
      simContext?.kind === 'national-cup' ||
      simContext?.kind === 'super-cup' ||
      (simContext?.kind === 'champions-cup' && simContext.isKnockout);
    const isNeutralCtx =
      simContext?.kind === 'super-cup' ||
      (simContext?.kind === 'champions-cup' && Boolean(simContext.isNeutralVenue)) ||
      (simContext?.kind === 'national-cup' && Boolean(simContext.isNeutralVenue));

    const subEvent: MatchEvent = {
      minute,
      type: 'sub',
      teamId: career.clubId,
      playerName: inPlayer.shortName,
      playerId: inPlayer.id,
      description: `Thay người (${nextSubsMade}/5): ${inPlayer.shortName} vào sân thay ${outPlayer.shortName}.`,
    };

    const adapted = resimulateMatchFromMinute({
      currentMatch: liveResult,
      fromMinute: minute,
      userClubId: career.clubId,
      nextUserTactics: nextTactics,
      userSquad: career.squad,
      allPlayers: effectiveAllPlayers,
      userManager: activeUserManager,
      isKnockout: isKnockoutCtx,
      isNeutralVenue: isNeutralCtx,
      subEvent,
      participatedUserPlayerIds: nextParticipated,
    });
    setLiveResult(adapted);
  };

  const simulateRemainingCupRound = async (
    competition: 'champions-cup' | 'national-cup' | 'super-cup',
    matches: CupMatch[],
    isKnockout: boolean,
    roundLabel: string,
    isNeutralVenue = false
  ) => {
    if (matches.length === 0) return;
    setSavingMatch(true);
    try {
      const entries = matches.map((m) => ({
        matchId: m.id,
        result: simulateMatchFull(
          m.homeClubId,
          m.awayClubId,
          career.matchweek,
          career.clubId,
          career.tactics,
          career.squad,
          effectiveAllPlayers,
          {
            isKnockout,
            isNeutralVenue,
            competition,
            roundLabel,
            matchId: m.id,
            userManager: activeUserManager,
          }
        ),
      }));
      await onCompleteCupMatch(competition, null, entries);
    } finally {
      setSavingMatch(false);
    }
  };

  const hasLiveResult = Boolean(liveResult);
  const liveMatchId = liveResult?.id ?? null;
  const penaltyEvents = useMemo(
    () => (liveResult ? liveResult.events.filter((e) => e.type === 'penalty') : []),
    [liveResult]
  );

  const finalizeRef = useRef(finalizeSimulation);
  finalizeRef.current = finalizeSimulation;
  const simContextRef = useRef(simContext);
  simContextRef.current = simContext;
  const liveResultRef = useRef(liveResult);
  liveResultRef.current = liveResult;

  const ballPos = useMemo<{ x: number; y: number }>(() => {
    if (!liveResult) return { x: 50, y: 50 };
    if (shootoutStep >= 0) return { x: 88, y: 50 };
    const eventNow = liveResult.events.find((e) => e.minute === minute && e.type !== 'penalty');
    if (eventNow?.type === 'goal') {
      return {
        x: eventNow.teamId === liveResult.homeClubId ? 92 : 8,
        y: 50,
      };
    }
    if (eventNow?.type === 'save' || eventNow?.type === 'chance') {
      return {
        x: eventNow.teamId === liveResult.homeClubId ? 84 : 16,
        y: 35 + Math.round((Math.sin(minute) + 1) * 15),
      };
    }
    const possBias = (liveResult.possessionHome - 50) * 0.35;
    const rawX = 50 + possBias + Math.sin(minute * 0.55) * 24;
    const rawY = 50 + Math.cos(minute * 0.72) * 28;
    return {
      x: Math.max(12, Math.min(88, Math.round(rawX))),
      y: Math.max(14, Math.min(86, Math.round(rawY))),
    };
  }, [liveResult, minute, shootoutStep]);

  const isClockDone = minute >= 90;

  useEffect(() => {
    if (
      !isLive ||
      isPaused ||
      confirmFinishLiveOpen ||
      pauseLiveMatchExternal ||
      !hasLiveResult ||
      shootoutStep >= 0 ||
      isClockDone
    ) {
      return;
    }
    if (timerRef.current) window.clearInterval(timerRef.current);

    const intervalMs = speed === 4 ? 65 : speed === 2 ? 130 : 260;
    timerRef.current = window.setInterval(() => {
      setMinute((prev) => (prev >= 90 ? 90 : prev + 1));
    }, intervalMs);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [
    isLive,
    isPaused,
    confirmFinishLiveOpen,
    pauseLiveMatchExternal,
    speed,
    hasLiveResult,
    shootoutStep,
    isClockDone,
  ]);

  useEffect(() => {
    if (!isLive || !liveMatchId || minute < 90 || shootoutStep >= 0) return;
    if (matchEndTriggeredRef.current === liveMatchId) return;
    matchEndTriggeredRef.current = liveMatchId;

    if (timerRef.current) window.clearInterval(timerRef.current);
    if (penaltyEvents.length > 0) {
      setIsPaused(false);
      setSubPanelOpen(false);
      setShootoutStep(1);
    } else if (liveResultRef.current) {
      void finalizeRef.current(liveResultRef.current, simContextRef.current);
    }
  }, [isLive, liveMatchId, minute, shootoutStep, penaltyEvents.length]);

  // Step through knockout penalty shootout events live
  useEffect(() => {
    if (!isLive || !liveMatchId || shootoutStep < 0) return;
    if (shootoutTimerRef.current) window.clearInterval(shootoutTimerRef.current);

    if (shootoutStep >= penaltyEvents.length) {
      const doneTimer = window.setTimeout(() => {
        setShootoutStep(-1);
        if (liveResultRef.current) {
          void finalizeRef.current(liveResultRef.current, simContextRef.current);
        }
      }, 650);
      return () => window.clearTimeout(doneTimer);
    }

    const stepMs = speed === 4 ? 320 : speed === 2 ? 580 : 900;
    shootoutTimerRef.current = window.setInterval(() => {
      setShootoutStep((prev) => {
        if (prev < 0) return prev;
        return Math.min(penaltyEvents.length, prev + 1);
      });
    }, stepMs);

    return () => {
      if (shootoutTimerRef.current) window.clearInterval(shootoutTimerRef.current);
    };
  }, [isLive, liveMatchId, shootoutStep, penaltyEvents.length, speed]);

  const visibleEvents = useMemo(() => {
    if (!liveResult) return [];
    const regular = liveResult.events.filter(
      (e) => e.minute <= minute && e.type !== 'penalty'
    );
    const revealedPen =
      shootoutStep >= 0
        ? penaltyEvents.slice(0, shootoutStep)
        : !isLive && minute >= 90
          ? penaltyEvents
          : [];
    return [...regular, ...revealedPen].slice().reverse();
  }, [liveResult, minute, shootoutStep, penaltyEvents, isLive]);

  const livePenScore = useMemo(() => {
    if (!liveResult || penaltyEvents.length === 0) return null;
    const shown =
      shootoutStep >= 0
        ? penaltyEvents.slice(0, shootoutStep)
        : !isLive && minute >= 90
          ? penaltyEvents
          : [];
    if (shown.length === 0) return { home: 0, away: 0 };
    let h = 0;
    let a = 0;
    for (const ev of shown) {
      if (!ev.playerId) continue;
      if (ev.description.includes('VÀO!')) {
        if (ev.teamId === liveResult.homeClubId) h++;
        else if (ev.teamId === liveResult.awayClubId) a++;
      }
    }
    return { home: h, away: a };
  }, [liveResult, penaltyEvents, shootoutStep, isLive, minute]);

  const liveHomeGoals = useMemo(() => {
    if (!liveResult) return 0;
    return liveResult.events.filter(
      (e) => e.type === 'goal' && e.minute <= minute && e.teamId === liveResult.homeClubId
    ).length;
  }, [liveResult, minute]);

  const liveAwayGoals = useMemo(() => {
    if (!liveResult) return 0;
    return liveResult.events.filter(
      (e) => e.type === 'goal' && e.minute <= minute && e.teamId === liveResult.awayClubId
    ).length;
  }, [liveResult, minute]);

  // Notify parent App about active unfinished 2D live match & wire browser unload barrier
  const liveMatchActive = Boolean(
    isLive && liveResult && finalizedMatchIdRef.current !== liveResult.id
  );

  useEffect(() => {
    if (forceFinishLiveMatchRef) {
      forceFinishLiveMatchRef.current = liveMatchActive ? skipActiveLiveToFullTime : null;
    }
  }, [liveMatchActive, forceFinishLiveMatchRef, skipActiveLiveToFullTime]);

  useEffect(() => {
    if (!onLiveMatchGuardChange) return;
    if (!liveMatchActive || !liveResult) {
      onLiveMatchGuardChange(false);
      return;
    }
    const hClub = CLUBS.find((c) => c.id === liveResult.homeClubId);
    const aClub = CLUBS.find((c) => c.id === liveResult.awayClubId);
    onLiveMatchGuardChange(true, {
      matchTitle: `${hClub?.shortName ?? liveResult.homeClubId} vs ${aClub?.shortName ?? liveResult.awayClubId}`,
      scoreLine: `${liveHomeGoals} - ${liveAwayGoals}`,
      minuteText: shootoutStep >= 0 ? 'Luân lưu 11m' : `Phút ${minute}'`,
    });
  }, [
    liveMatchActive,
    liveResult,
    liveHomeGoals,
    liveAwayGoals,
    minute,
    shootoutStep,
    onLiveMatchGuardChange,
  ]);

  useEffect(() => {
    if (!onLiveMatchGuardChange) return;
    return () => {
      onLiveMatchGuardChange(false);
      if (forceFinishLiveMatchRef) {
        forceFinishLiveMatchRef.current = null;
      }
    };
  }, [onLiveMatchGuardChange, forceFinishLiveMatchRef]);

  useEffect(() => {
    if (!liveMatchActive) return;
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, [liveMatchActive]);

  const renderLivePitchOverlay = () => {
    if (!liveResult) return null;
    const hClub = CLUBS.find((c) => c.id === liveResult.homeClubId) ?? CLUBS[0];
    const aClub = CLUBS.find((c) => c.id === liveResult.awayClubId) ?? CLUBS[1];
    const opp = hClub.id === career.clubId ? aClub : hClub;
    const oppMgr = REAL_MANAGERS.find((m) => m.id === opp.managerId) ?? REAL_MANAGERS[0];

    if (!isLive && minute >= 90) {
      return (
        <div className="space-y-4">
          <MatchStatsBreakdown match={liveResult} userClubId={career.clubId} />
          <button
            type="button"
            onClick={clearLivePitch}
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm"
          >
            Tiếp tục sự nghiệp
          </button>
        </div>
      );
    }

    const activeUserSlots = matchSlots.length > 0 ? matchSlots : career.tactics.slots;
    const homeTemplate =
      liveResult.homeClubId === career.clubId
        ? activeUserSlots
        : (FORMATION_TEMPLATES[(liveResult.homeFormation as FormationId) || '4-3-3'] ??
          FORMATION_TEMPLATES['4-3-3']);
    const awayTemplate =
      liveResult.awayClubId === career.clubId
        ? activeUserSlots
        : (FORMATION_TEMPLATES[(liveResult.awayFormation as FormationId) || '4-3-3'] ??
          FORMATION_TEMPLATES['4-3-3']);
    const pitchBallShift = (ballPos.x - 50) * 0.34;
    const userClub = CLUBS.find((c) => c.id === career.clubId) ?? CLUBS[0];
    const activeStarterIds = new Set(activeUserSlots.map((s) => s.playerId));
    const subOutSet = new Set(subbedOutIds);
    const availableBenchPlayers = career.squad
      .filter((p) => !activeStarterIds.has(p.id) && !subOutSet.has(p.id) && !isPlayerInjured(p))
      .sort((a, b) => b.rating - a.rating);
    const playerMap = new Map(career.squad.map((p) => [p.id, p]));

    return (
      <div className="space-y-4 lg:grid lg:grid-cols-12 lg:gap-6 lg:space-y-0">
        <div className="lg:col-span-7 space-y-3">
          <div className="rounded-2xl bg-[#121B24] border border-emerald-500/30 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <span>
                {liveResult.roundLabel || `Vòng ${liveResult.matchweek}`} ·{' '}
                {liveResult.venue || hClub.stadium}
              </span>
              <span
                className={`font-mono-num font-bold ${
                  shootoutStep >= 0
                    ? 'text-amber-400'
                    : isLive && isPaused
                      ? 'text-amber-300 animate-pulse'
                      : 'text-emerald-400'
                }`}
              >
                {shootoutStep >= 0
                  ? 'LUÂN LƯU 11M'
                  : isLive
                    ? isPaused
                      ? `TẠM DỪNG · ${minute}'`
                      : `${minute}'`
                    : 'HẾT GIỜ (FT)'}
              </span>
            </div>

            <div className="grid grid-cols-3 items-center gap-2">
              <div className="flex flex-col items-center text-center gap-1.5">
                <ClubCrest club={hClub} size={46} />
                <span className="text-xs font-bold text-white truncate max-w-full">
                  {hClub.name}
                </span>
                <span className="text-[10px] font-mono-num text-slate-400">
                  {liveResult.homeFormation || '4-3-3'} · {liveResult.possessionHome}%
                </span>
              </div>

              <div className="text-center">
                <div className="font-display text-4xl font-extrabold font-mono-num text-white tracking-wider">
                  {liveHomeGoals} - {liveAwayGoals}
                </div>
                {(shootoutStep >= 0 || (minute >= 90 && liveResult.penaltiesHome !== undefined)) && (
                  <p className="text-xs font-mono-num font-bold text-amber-400 mt-1">
                    Luân lưu:{' '}
                    {shootoutStep >= 0 && livePenScore
                      ? `${livePenScore.home} - ${livePenScore.away}`
                      : `${liveResult.penaltiesHome} - ${liveResult.penaltiesAway}`}
                  </p>
                )}
                <p className="text-[11px] font-mono-num text-slate-400 mt-1">
                  xG {liveResult.xgHome} - {liveResult.xgAway}
                </p>
              </div>

              <div className="flex flex-col items-center text-center gap-1.5">
                <ClubCrest club={aClub} size={46} />
                <span className="text-xs font-bold text-white truncate max-w-full">
                  {aClub.name}
                </span>
                <span className="text-[10px] font-mono-num text-slate-400">
                  {100 - liveResult.possessionHome}% · {liveResult.awayFormation || '4-3-3'}
                </span>
              </div>
            </div>
          </div>

          <div className="relative w-full aspect-[4/3] sm:aspect-[16/10] rounded-2xl overflow-hidden border border-white/15 bg-[#0F291E]">
            <svg viewBox="0 0 300 220" className="w-full h-full">
              <rect width="300" height="220" fill="#0F2D1F" />
              <rect x="12" y="12" width="276" height="196" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
              <line x1="150" y1="12" x2="150" y2="208" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
              <circle cx="150" cy="110" r="28" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
              <rect x="12" y="64" width="38" height="92" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
              <rect x="250" y="64" width="38" height="92" fill="none" stroke="rgba(255,255,255,0.35)" strokeWidth="1.5" />
            </svg>

            {homeTemplate.slice(0, 11).map((slot, idx) => {
              const isGk = slot.label === 'GK';
              const baseHx = isGk ? 7 : 10 + ((92 - slot.y) / 80) * 44;
              const px = isGk
                ? 7
                : Math.max(12, Math.min(86, baseHx + pitchBallShift + (isLive && shootoutStep < 0 ? Math.sin(minute * 0.5 + idx) * 2.2 : 0)));
              const py = isGk
                ? 50
                : Math.max(10, Math.min(90, 10 + (slot.x / 100) * 80 + (isLive && shootoutStep < 0 ? Math.cos(minute * 0.4 + idx) * 1.8 : 0)));
              return (
                <div
                  key={`h-${idx}`}
                  title={`${hClub.shortName} · ${slot.label}`}
                  style={{
                    left: `${px}%`,
                    top: `${py}%`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: isGk ? '#0EA5E9' : hClub.primaryColor,
                  }}
                  className="absolute w-3.5 h-3.5 rounded-full border-2 border-white shadow transition-all duration-300"
                />
              );
            })}

            {awayTemplate.slice(0, 11).map((slot, idx) => {
              const isGk = slot.label === 'GK';
              const baseAx = isGk ? 93 : 90 - ((92 - slot.y) / 80) * 44;
              const px = isGk
                ? 93
                : Math.max(14, Math.min(88, baseAx + pitchBallShift + (isLive && shootoutStep < 0 ? Math.sin(minute * 0.55 + idx + 2) * 2.2 : 0)));
              const py = isGk
                ? 50
                : Math.max(10, Math.min(90, 10 + ((100 - slot.x) / 100) * 80 + (isLive && shootoutStep < 0 ? Math.cos(minute * 0.45 + idx + 2) * 1.8 : 0)));
              return (
                <div
                  key={`a-${idx}`}
                  title={`${aClub.shortName} · ${slot.label}`}
                  style={{
                    left: `${px}%`,
                    top: `${py}%`,
                    transform: 'translate(-50%, -50%)',
                    backgroundColor: isGk ? '#F59E0B' : aClub.primaryColor,
                  }}
                  className="absolute w-3.5 h-3.5 rounded-full border-2 border-amber-300 shadow transition-all duration-300"
                />
              );
            })}

            <div
              style={{
                left: `${ballPos.x}%`,
                top: `${ballPos.y}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="absolute w-3.5 h-3.5 rounded-full bg-white ring-2 ring-emerald-400 shadow-lg transition-all duration-200 z-10"
            />
          </div>

          {isLive ? (
            <div className="space-y-2">
              <div className="flex flex-wrap items-center gap-2">
                {shootoutStep < 0 && minute < 90 && (
                  <button
                    type="button"
                    onClick={() => setIsPaused((p) => !p)}
                    className={`h-10 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 shrink-0 ${
                      isPaused
                        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 border-emerald-400'
                        : 'bg-amber-500/15 hover:bg-amber-500/25 text-amber-300 border-amber-400/40'
                    }`}
                  >
                    {isPaused ? (
                      <>
                        <Play className="w-3.5 h-3.5 fill-current" />
                        Tiếp tục ({minute}&apos;)
                      </>
                    ) : (
                      <>
                        <Pause className="w-3.5 h-3.5" />
                        Tạm dừng
                      </>
                    )}
                  </button>
                )}

                <div className="flex items-center gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
                  {([1, 2, 4] as const).map((sp) => (
                    <button
                      key={sp}
                      type="button"
                      onClick={() => setSpeed(sp)}
                      className={`h-10 px-3 rounded-lg font-mono-num text-xs font-bold ${
                        speed === sp ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                      }`}
                    >
                      {sp}x
                    </button>
                  ))}
                </div>
                {shootoutStep < 0 && (
                  <button
                    type="button"
                    disabled={minute >= 90}
                    onClick={() => {
                      const nextOpen = !subPanelOpen;
                      setSubPanelOpen(nextOpen);
                      if (nextOpen) {
                        setIsPaused(true);
                        setSubNotice(null);
                      } else {
                        setSelectedSubOutIdx(null);
                      }
                    }}
                    className={`h-10 px-3.5 rounded-xl border text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 ${
                      subPanelOpen
                        ? 'bg-sky-500 text-slate-950 border-sky-400'
                        : 'bg-sky-500/15 border-sky-400/35 text-sky-300'
                    }`}
                  >
                    <RefreshCw className="w-3.5 h-3.5" />
                    Thay người ({subsMade}/5)
                  </button>
                )}
                <div className="flex-1 min-w-[140px] rounded-xl bg-amber-500/10 border border-amber-400/25 px-3 py-2 flex items-center justify-between gap-2">
                  <span className="text-[11px] font-bold text-amber-300 truncate">
                    Chỉ đạo: {LIVE_MENTALITY_OPTIONS.find((m) => m.id === career.tactics.mentality)?.label ?? career.tactics.mentality} · {liveFormation}
                  </span>
                </div>
                <button
                  type="button"
                  disabled={savingMatch}
                  onClick={() => setConfirmFinishLiveOpen(true)}
                  className="h-10 px-4 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold shrink-0"
                >
                  {shootoutStep >= 0 ? 'Xem nhanh kết quả' : 'Kết thúc'}
                </button>
              </div>

              {shootoutStep < 0 && (
                <div className="space-y-2">
                  <div>
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">Đổi Tâm lý thi đấu:</span>
                    <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
                      {LIVE_MENTALITY_OPTIONS.map((opt) => {
                        const active = career.tactics.mentality === opt.id;
                        return (
                          <button
                            key={opt.id}
                            type="button"
                            onClick={() => handleLiveMentalityChange(opt.id)}
                            className={`h-9 rounded-lg text-[10px] sm:text-xs font-bold transition-colors truncate px-1 ${
                              active
                                ? 'bg-amber-400 text-slate-950'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            {opt.label}
                          </button>
                        );
                      })}
                    </div>
                  </div>

                  <div>
                    <span className="text-[11px] font-bold text-slate-400 block mb-1">Đổi Sơ đồ chiến thuật trực tiếp:</span>
                    <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
                      {(['4-3-3', '4-4-2', '3-5-2', '5-3-2', '4-2-3-1'] as FormationId[]).map((formId) => {
                        const active = liveFormation === formId;
                        return (
                          <button
                            key={formId}
                            type="button"
                            onClick={() => handleLiveFormationChange(formId)}
                            className={`h-9 rounded-lg text-[10px] sm:text-xs font-bold transition-colors truncate px-1 ${
                              active
                                ? 'bg-emerald-500 text-slate-950'
                                : 'text-slate-300 hover:bg-white/5 hover:text-white'
                            }`}
                          >
                            {formId}
                          </button>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}

              {/* Live In-Match Substitution Panel */}
              {subPanelOpen && shootoutStep < 0 && minute < 90 && (
                <div className="rounded-2xl bg-[#121B24] border border-sky-400/45 p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <h4 className="text-xs font-bold text-sky-300 flex items-center gap-2">
                        <span>Thay người trực tiếp ({subsMade}/5 lượt đã dùng)</span>
                        {isPaused && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-400/40 text-amber-300 text-[10px] font-mono-num">
                            Đã tạm dừng ở {minute}&apos;
                          </span>
                        )}
                      </h4>
                      <p className="text-[11px] text-slate-400 mt-0.5">
                        {subsMade >= 5
                          ? 'Đã sử dụng hết 5 quyền thay người.'
                          : selectedSubOutIdx === null
                            ? 'Bước 1: Chọn cầu thủ đang đá trên sân muốn rút ra.'
                            : `Bước 2: Chọn cầu thủ dự bị vào thay ${
                                playerMap.get(activeUserSlots[selectedSubOutIdx]?.playerId ?? '')?.shortName ?? ''
                              }.`}
                      </p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => {
                          setSubPanelOpen(false);
                          setSelectedSubOutIdx(null);
                          setIsPaused(false);
                        }}
                        className="h-8 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center gap-1"
                      >
                        <Play className="w-3 h-3 fill-current" />
                        Tiếp tục trận
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setSubPanelOpen(false);
                          setSelectedSubOutIdx(null);
                        }}
                        className="text-xs text-slate-400 hover:text-white px-2 py-1"
                      >
                        Đóng
                      </button>
                    </div>
                  </div>

                  {subNotice && (
                    <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/35 px-3 py-2 text-xs font-semibold text-emerald-300">
                      {subNotice}
                    </div>
                  )}

                  {subsMade < 5 && (
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-slate-300">
                          Đang thi đấu trên sân (11)
                        </p>
                        <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                          {activeUserSlots.map((slot, idx) => {
                            const p = playerMap.get(slot.playerId);
                            if (!p) return null;
                            const isSelected = selectedSubOutIdx === idx;
                            const enteredAt = subbedInMinutes[p.id] ?? 0;
                            const minsPlayed = Math.max(0, minute - enteredAt);
                            const drainPerMin = (p.stars ?? 1) >= 3 ? 0.28 : 0.35;
                            const liveStamina = Math.max(20, Math.round(p.fitness - minsPlayed * drainPerMin));
                            return (
                              <button
                                key={`${slot.slotIndex}-${p.id}`}
                                type="button"
                                onClick={() => setSelectedSubOutIdx(isSelected ? null : idx)}
                                className={`w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 border text-left text-xs ${
                                  isSelected
                                    ? 'bg-amber-500/20 border-amber-400 text-white'
                                    : 'bg-[#0B1117] border-white/10 text-slate-200 hover:border-white/25'
                                }`}
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <span className="font-mono-num text-[10px] font-bold text-emerald-400 w-7 shrink-0">
                                    {slot.label}
                                  </span>
                                  <span className="truncate font-semibold">{p.shortName}</span>
                                  {enteredAt > 0 && (
                                    <span className="text-[9px] font-mono-num text-sky-400 shrink-0">
                                      (Vào {enteredAt}&apos;)
                                    </span>
                                  )}
                                </div>
                                <div className="flex items-center gap-2 font-mono-num text-[11px] shrink-0">
                                  <span className="text-emerald-400">{p.rating}</span>
                                  <span
                                    className={
                                      liveStamina < 65
                                        ? 'text-rose-400 font-bold'
                                        : liveStamina < 80
                                          ? 'text-amber-400'
                                          : 'text-emerald-400'
                                    }
                                  >
                                    {liveStamina}%
                                  </span>
                                </div>
                              </button>
                            );
                          })}
                        </div>
                      </div>

                      <div className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-slate-300">
                          Ghế dự bị khả dụng ({availableBenchPlayers.length})
                        </p>
                        <div className="space-y-1 max-h-[220px] overflow-y-auto pr-1">
                          {availableBenchPlayers.length === 0 ? (
                            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3 text-[11px] text-slate-400 text-center">
                              Không còn cầu thủ dự bị khả dụng.
                            </div>
                          ) : (
                            availableBenchPlayers.map((bp) => (
                              <button
                                key={bp.id}
                                type="button"
                                disabled={selectedSubOutIdx === null}
                                onClick={() => {
                                  if (selectedSubOutIdx !== null) {
                                    handleLiveSubstitution(selectedSubOutIdx, bp.id);
                                  }
                                }}
                                className="w-full flex items-center justify-between gap-2 rounded-xl px-2.5 py-2 border bg-[#0B1117] border-white/10 hover:border-sky-400/60 disabled:opacity-45 text-left text-xs"
                              >
                                <div className="flex items-center gap-2 min-w-0">
                                  <PlayerAvatar player={bp} club={userClub} size={26} showNumber={false} isUserCard />
                                  <div className="min-w-0">
                                    <p className="font-semibold text-white truncate">{bp.shortName}</p>
                                    <p className="text-[10px] font-mono-num text-slate-400">
                                      {bp.position} · Thể lực {bp.fitness}%
                                    </p>
                                  </div>
                                </div>
                                <span className="font-mono-num text-xs font-bold text-sky-400 shrink-0">
                                  {bp.rating}
                                </span>
                              </button>
                            ))
                          )}
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          ) : (
            <button
              type="button"
              onClick={clearLivePitch}
              className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm"
            >
              Tiếp tục sự nghiệp
            </button>
          )}
        </div>

        <div className="lg:col-span-5 space-y-3">
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 flex items-center gap-3">
            <ManagerAvatar manager={oppMgr} size={48} />
            <div className="min-w-0">
              <p className="text-xs text-slate-400">HLV đối thủ · {opp.name}</p>
              <p className="text-sm font-bold text-white truncate">{oppMgr.name}</p>
              <p className="text-xs text-emerald-400 truncate">
                {oppMgr.preferredFormation} · {oppMgr.style}
              </p>
            </div>
          </div>

          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
            <h3 className="text-sm font-bold text-white">Diễn biến trận đấu</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto pr-1">
              {visibleEvents.map((ev, i) => (
                <div
                  key={`${ev.minute}-${ev.type}-${i}`}
                  className={`rounded-xl p-2.5 text-xs border ${
                    ev.type === 'goal' || ev.type === 'penalty'
                      ? 'bg-emerald-500/15 border-emerald-500/35 text-white'
                      : ev.type === 'injury'
                        ? 'bg-red-500/15 border-red-500/35 text-red-200'
                        : ev.type === 'sub'
                          ? 'bg-sky-500/10 border-sky-400/30 text-sky-200'
                          : 'bg-[#0B1117] border-white/5 text-slate-300'
                  }`}
                >
                  <span className="font-mono-num font-bold text-emerald-400 mr-2">
                    {ev.type === 'penalty' ? 'PEN' : `${ev.minute}'`}
                  </span>
                  <span>{ev.description}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </div>
    );
  };

  // Pre-match card helper
  const renderPreMatchCard = (
    homeId: string,
    awayId: string,
    title: string,
    subtitle: string,
    onPlayLive: () => void,
    onQuickSim: () => void
  ) => {
    const hClub = CLUBS.find((c) => c.id === homeId) ?? CLUBS[0];
    const aClub = CLUBS.find((c) => c.id === awayId) ?? CLUBS[1];
    const opp = hClub.id === career.clubId ? aClub : hClub;
    const oppMgr = REAL_MANAGERS.find((m) => m.id === opp.managerId) ?? REAL_MANAGERS[0];

    return (
      <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-4">
        <div className="flex items-center justify-between text-xs text-slate-400">
          <span className="font-semibold text-emerald-400">{title}</span>
          <span>{subtitle}</span>
        </div>

        <div className="grid grid-cols-3 items-center gap-2 py-2">
          <div className="flex flex-col items-center text-center gap-1.5">
            <ClubCrest club={hClub} size={50} />
            <span className="text-xs font-bold text-white truncate max-w-full">{hClub.name}</span>
          </div>

          <div className="text-center">
            <div className="font-display text-2xl font-extrabold text-amber-400">VS</div>
            <p className="text-[11px] text-slate-400 mt-1">{hClub.stadium}</p>
          </div>

          <div className="flex flex-col items-center text-center gap-1.5">
            <ClubCrest club={aClub} size={50} />
            <span className="text-xs font-bold text-white truncate max-w-full">{aClub.name}</span>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
          <div className="rounded-xl bg-[#0B1117] border border-emerald-500/25 p-3 flex items-center gap-3">
            {activeUserManager ? (
              <ManagerAvatar manager={activeUserManager} size={42} />
            ) : (
              <div className="w-[42px] h-[42px] rounded-full bg-slate-800 border border-white/15 flex items-center justify-center text-xs font-bold text-amber-400 shrink-0">
                TQ
              </div>
            )}
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">HLV đội bạn</p>
              <p className="text-xs font-bold text-white truncate">
                {activeUserManager ? activeUserManager.name : 'HLV Tạm quyền'}
              </p>
              <p className="text-[11px] text-emerald-400 truncate">
                {activeUserManager
                  ? `${career.tactics.formation} · ${activeUserManager.style}`
                  : 'Chưa bổ nhiệm HLV trưởng'}
              </p>
            </div>
          </div>

          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex items-center gap-3">
            <ManagerAvatar manager={oppMgr} size={42} />
            <div className="min-w-0">
              <p className="text-[11px] text-slate-400">HLV đối thủ · {opp.name}</p>
              <p className="text-xs font-bold text-white truncate">{oppMgr.name}</p>
              <p className="text-[11px] text-amber-400 truncate">
                {oppMgr.preferredFormation} · {oppMgr.style}
              </p>
            </div>
          </div>
        </div>

        {career.squad.some(isPlayerInjured) && (
          <div className="rounded-xl bg-red-500/10 border border-red-500/30 px-3 py-2 text-[11px] text-red-200">
            <span className="font-bold text-red-300">🏥 Đang chấn thương (tự động vắng mặt): </span>
            {career.squad
              .filter(isPlayerInjured)
              .map((p) => `${p.shortName} (${p.injury?.matchesRemaining ?? 1} trận)`)
              .join(', ')}
          </div>
        )}

        {(() => {
          const oppPlayers = effectiveAllPlayers.filter((p) => p.clubId === opp.id).sort((a, b) => b.rating - a.rating);
          const dangerMan = oppPlayers[0] ?? { name: 'Ngôi sao chủ lực', rating: 86, position: 'ST' };
          return (
            <div className="rounded-xl bg-[#0B1117] border border-sky-500/30 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between text-xs font-bold text-sky-300">
                <span>🔍 Soi kèo & Phân tích đối thủ ({opp.name})</span>
                <span className="text-[10px] px-2 py-0.5 rounded bg-sky-500/20 text-sky-200">Phong độ: W-W-D-W-L</span>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 text-xs">
                <div className="p-2 rounded-lg bg-slate-900/60 border border-white/5">
                  <span className="text-slate-400 block text-[10px]">Cầu thủ nguy hiểm nhất (Danger Man):</span>
                  <span className="font-bold text-amber-300">{dangerMan.name} ({dangerMan.position} · OVR {dangerMan.rating})</span>
                </div>
                <div className="p-2 rounded-lg bg-slate-900/60 border border-white/5">
                  <span className="text-slate-400 block text-[10px]">Gợi ý chiến thuật khắc chế:</span>
                  <span className="font-bold text-emerald-300">
                    {oppMgr.style === 'Tấn công' ? 'Đá phòng ngự phản công chặt chẽ hoặc pressing' : 'Đẩy cao kiểm soát bóng và khoét cánh'}
                  </span>
                </div>
              </div>
            </div>
          );
        })()}

        {(() => {
          const activeSlot: TacticSlotKey = career.activeTacticSlot ?? 'A';
          const presets = ensureTacticPresets(career.tactics, career.squad, career.tacticPresets);
          const squadMap = new Map(career.squad.map((p) => [p.id, p]));
          return (
            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3 space-y-2">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="font-bold text-emerald-400">
                  Chọn nhanh Đội hình ra sân ({activeSlot})
                </span>
                <span className="text-slate-400 font-mono-num">
                  {presets[activeSlot].tactics.formation} · {presets[activeSlot].tactics.mentality}
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {(['A', 'B', 'C'] as const).map((slotKey) => {
                  const preset =
                    slotKey === activeSlot
                      ? { ...presets[slotKey], tactics: career.tactics }
                      : presets[slotKey];
                  const xiPlayers = preset.tactics.slots
                    .map((s) => squadMap.get(s.playerId))
                    .filter((p): p is Player => Boolean(p));
                  const avgFit =
                    xiPlayers.length > 0
                      ? Math.round(
                          xiPlayers.reduce((sum, p) => sum + p.fitness, 0) / xiPlayers.length
                        )
                      : 100;
                  const unavail = xiPlayers.filter((p) => isPlayerUnavailable(p)).length;
                  const isCur = slotKey === activeSlot;
                  return (
                    <button
                      key={slotKey}
                      type="button"
                      disabled={!onSelectTacticSlot}
                      onClick={() => onSelectTacticSlot?.(slotKey)}
                      className={`rounded-lg px-2.5 py-2 border text-left transition-colors ${
                        isCur
                          ? 'bg-emerald-500/15 border-emerald-400'
                          : 'bg-[#121B24] border-white/10 hover:border-white/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-1">
                        <span
                          className={`px-1.5 py-0.5 rounded font-mono-num text-[10px] font-extrabold ${
                            isCur
                              ? 'bg-emerald-500 text-slate-950'
                              : 'bg-slate-800 text-slate-300'
                          }`}
                        >
                          {slotKey}
                        </span>
                        <span className="font-mono-num text-[10px] font-bold text-slate-300">
                          {preset.tactics.formation}
                        </span>
                      </div>
                      <p className="text-[11px] font-semibold text-white truncate mt-1">
                        {preset.label}
                      </p>
                      <div className="flex items-center justify-between text-[10px] mt-0.5">
                        <span
                          className={`font-mono-num font-bold ${
                            avgFit < 75
                              ? 'text-rose-400'
                              : avgFit < 85
                                ? 'text-amber-400'
                                : 'text-emerald-400'
                          }`}
                        >
                          TL {avgFit}%
                        </span>
                        {unavail > 0 && (
                          <span className="text-rose-400 font-bold">⚠ {unavail}</span>
                        )}
                      </div>
                    </button>
                  );
                })}
              </div>
            </div>
          );
        })()}

        <div className="flex items-center gap-2">
          <button
            type="button"
            disabled={savingMatch}
            onClick={onPlayLive}
            className="flex-1 h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
          >
            <Play className="w-4 h-4 fill-current" />
            Thi đấu Trực tiếp 2D
          </button>
          <button
            type="button"
            disabled={savingMatch}
            onClick={() => {
              if (career.settings?.confirmMode === 'fast') {
                onQuickSim();
                return;
              }
              setPendingQuickSim({
                title: `${hClub.shortName} vs ${aClub.shortName}`,
                subtitle: `${title} · ${subtitle}`,
                run: onQuickSim,
              });
            }}
            className="h-12 px-4 rounded-xl bg-[#0B1117] hover:bg-slate-800 border border-white/15 text-slate-200 font-semibold text-xs flex items-center gap-1.5 disabled:opacity-50"
          >
            <FastForward className="w-4 h-4 text-amber-400" />
            Mô phỏng nhanh
          </button>
        </div>
      </div>
    );
  };

  const openCupMatchReport = (
    m: CupMatch,
    competition: CompetitionId,
    roundLabel: string
  ) => {
    if (!m.played) return;
    setInspectedMatch(
      buildMatchSummaryFromStored(
        m,
        competition,
        roundLabel,
        m.round,
        career.recentResults,
        { clubId: career.clubId, tactics: career.tactics, squad: career.squad }
      )
    );
  };

  const openLeagueFixtureReport = (f: Fixture) => {
    if (!f.played) return;
    setInspectedMatch(
      buildMatchSummaryFromStored(
        f,
        'league',
        `VĐQG · Vòng ${f.matchweek}`,
        f.matchweek,
        career.recentResults,
        { clubId: career.clubId, tactics: career.tactics, squad: career.squad }
      )
    );
  };

  const renderCupMatchRow = (
    m: CupMatch,
    competition: CompetitionId,
    roundLabel: string
  ) => {
    const h = CLUBS.find((c) => c.id === m.homeClubId) ?? CLUBS[0];
    const a = CLUBS.find((c) => c.id === m.awayClubId) ?? CLUBS[1];
    const involvesUser = m.homeClubId === career.clubId || m.awayClubId === career.clubId;
    const baseCls = `w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-xs border text-left transition-colors ${
      involvesUser
        ? 'bg-emerald-500/10 border-emerald-500/35'
        : 'bg-[#0B1117] border-white/5'
    }`;

    const content = (
      <>
        <div className="flex items-center gap-1.5 min-w-0 flex-1">
          <ClubCrest club={h} size={20} />
          <span className={`truncate ${m.winnerId === h.id ? 'font-bold text-emerald-300' : 'text-white'}`}>
            {h.shortName}
          </span>
        </div>

        <div className="text-center shrink-0 font-mono-num flex items-center gap-1">
          {m.played ? (
            <>
              <span className="px-2 py-0.5 rounded bg-slate-800 font-bold text-emerald-400">
                {m.homeGoals} - {m.awayGoals}
                {m.penaltiesHome !== undefined ? ` (${m.penaltiesHome}-${m.penaltiesAway}p)` : ''}
              </span>
              <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
            </>
          ) : (
            <span className="text-slate-500">vs</span>
          )}
        </div>

        <div className="flex items-center justify-end gap-1.5 min-w-0 flex-1">
          <span className={`truncate text-right ${m.winnerId === a.id ? 'font-bold text-emerald-300' : 'text-white'}`}>
            {a.shortName}
          </span>
          <ClubCrest club={a} size={20} />
        </div>
      </>
    );

    if (m.played) {
      return (
        <button
          key={m.id}
          type="button"
          onClick={() => openCupMatchReport(m, competition, roundLabel)}
          className={`${baseCls} hover:border-emerald-400/60 cursor-pointer`}
        >
          {content}
        </button>
      );
    }

    return (
      <div key={m.id} className={baseCls}>
        {content}
      </div>
    );
  };

  const renderMatchConfirmModals = () => (
    <>
      <ConfirmActionModal
        open={confirmFinishLiveOpen}
        title="Chốt kết quả trận đấu ngay?"
        description={
          <>
            <p>
              Trận đấu vẫn đang diễn ra ({shootoutStep >= 0 ? 'Luân lưu 11m' : `Phút ${minute}'`}). Nếu bấm xác nhận, hệ thống sẽ mô phỏng nhanh phần thời gian còn lại và <strong className="text-white">lưu chính thức kết quả</strong> vào BXH / thống kê.
            </p>
          </>
        }
        confirmLabel="Chốt kết quả ngay"
        cancelLabel="Tiếp tục xem 2D"
        tone="amber"
        busy={savingMatch}
        onConfirm={async () => {
          setConfirmFinishLiveOpen(false);
          await skipActiveLiveToFullTime();
        }}
        onCancel={() => setConfirmFinishLiveOpen(false)}
      />

      <ConfirmActionModal
        open={Boolean(pendingQuickSim)}
        title="Mô phỏng nhanh trận đấu?"
        description={
          pendingQuickSim ? (
            <>
              <p>
                Trận <strong className="text-white">{pendingQuickSim.title}</strong> ({pendingQuickSim.subtitle}) sẽ được mô phỏng toàn bộ ngay lập tức và lưu kết quả chính thức (tính điểm, thể lực, thẻ phạt và chấn thương).
              </p>
            </>
          ) : null
        }
        confirmLabel="Mô phỏng & Lưu kết quả"
        cancelLabel="Hủy"
        tone="emerald"
        busy={savingMatch}
        onConfirm={() => {
          const runFn = pendingQuickSim?.run;
          setPendingQuickSim(null);
          runFn?.();
        }}
        onCancel={() => setPendingQuickSim(null)}
      />
    </>
  );

  // If currently watching or just finished a 2D live match, render the pitch view prominently
  if (liveResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <h2 className="font-display text-lg font-bold text-white">
              Trực tiếp Trận đấu
            </h2>
            {liveMatchActive && (
              <span className="px-2 py-0.5 rounded bg-rose-500/20 border border-rose-400/45 text-[10px] font-bold text-rose-200 animate-pulse">
                LIVE · ĐANG ĐẤU
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={toggleSound}
              className="h-8 px-2.5 rounded-lg bg-slate-800 border border-white/15 text-[11px] font-bold text-white flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
            >
              {soundOn ? <Volume2 className="w-3.5 h-3.5 text-emerald-400" /> : <VolumeX className="w-3.5 h-3.5 text-slate-400" />}
              <span>{soundOn ? 'Âm thanh: Bật' : 'Âm thanh: Tắt'}</span>
            </button>
            {!isLive && (
              <button
                type="button"
                onClick={clearLivePitch}
                className="text-xs font-semibold text-emerald-400 hover:underline"
              >
                Quay lại danh sách giải đấu
              </button>
            )}
          </div>
        </div>
        {renderLivePitchOverlay()}
        {renderMatchConfirmModals()}
      </div>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-3 bg-[#121B24] border border-white/10 rounded-2xl p-3">
        <div className="flex items-center gap-2">
          <Trophy className="w-5 h-5 text-amber-400" />
          <h3 className="font-display text-sm font-bold text-white">Trung tâm Quản lý & Lịch đấu</h3>
        </div>
        <button
          type="button"
          onClick={toggleSound}
          className="h-9 px-3 rounded-xl bg-slate-800 border border-white/15 text-xs font-bold text-white flex items-center gap-1.5 hover:bg-slate-700 transition-colors"
        >
          {soundOn ? <Volume2 className="w-4 h-4 text-emerald-400" /> : <VolumeX className="w-4 h-4 text-slate-400" />}
          <span>{soundOn ? 'Âm thanh: Bật' : 'Âm thanh: Tắt'}</span>
        </button>
      </div>

      {/* Competition Selector Tabs */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-1.5 p-1 rounded-xl bg-[#121B24] border border-white/10">
        <button
          type="button"
          onClick={() => setCompTab('league')}
          className={`h-10 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
            compTab === 'league' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
          }`}
        >
          <Trophy className="w-3.5 h-3.5" />
          VĐQG ({career.standings.length} CLB)
        </button>

        <button
          type="button"
          onClick={() => setCompTab('champions-cup')}
          className={`h-10 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
            compTab === 'champions-cup' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
          }`}
        >
          <Award className="w-3.5 h-3.5" />
          Cúp C1
          {userCcMatch && (
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setCompTab('national-cup')}
          className={`h-10 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
            compTab === 'national-cup' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
          }`}
        >
          <Shield className="w-3.5 h-3.5" />
          Cúp QG
          {userNcMatch && (
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0" />
          )}
        </button>

        <button
          type="button"
          onClick={() => setCompTab('special')}
          className={`h-10 rounded-lg text-xs font-semibold flex items-center justify-center gap-1.5 ${
            compTab === 'special' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
          }`}
        >
          <Flame className="w-3.5 h-3.5" />
          Siêu Cúp & Giao hữu
        </button>
      </div>

      {/* 1. SUPER LEAGUE */}
      {compTab === 'league' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 sm:grid-cols-6 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
            {[
              { id: 'match', label: userMatchFixture ? `Vòng ${career.matchweek}` : 'Tổng kết' },
              { id: 'standings', label: 'BXH' },
              { id: 'fixtures', label: 'Lịch & KQ' },
              { id: 'scorers', label: 'Ghi bàn' },
              { id: 'assists', label: 'Kiến tạo' },
              { id: 'mvp', label: 'Xuất sắc' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id as typeof subTab)}
                className={`h-10 rounded-lg text-[11px] sm:text-xs font-semibold px-1 truncate whitespace-nowrap ${
                  subTab === tab.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {subTab === 'match' && (
            <div>
              {!userMatchFixture ? (
                <SeasonAwardsShowcase
                  career={career}
                  effectiveAllPlayers={effectiveAllPlayers}
                  onClaimSeasonRewards={onClaimSeasonRewards}
                  onStartNextSeason={onStartNextSeason}
                  onNavigateCompetition={(tab) => setCompTab(tab)}
                  onOpenFinancePayroll={onOpenFinancePayroll}
                />
              ) : (
                renderPreMatchCard(
                  userMatchFixture.homeClubId,
                  userMatchFixture.awayClubId,
                  `Super League ${career.season}`,
                  `Vòng ${career.matchweek}`,
                  () =>
                    launchMatch(
                      userMatchFixture.homeClubId,
                      userMatchFixture.awayClubId,
                      { kind: 'league' },
                      { competition: 'league', roundLabel: `VĐQG Vòng ${career.matchweek}` },
                      false
                    ),
                  () =>
                    launchMatch(
                      userMatchFixture.homeClubId,
                      userMatchFixture.awayClubId,
                      { kind: 'league' },
                      { competition: 'league', roundLabel: `VĐQG Vòng ${career.matchweek}` },
                      true
                    )
                )
              )}
            </div>
          )}

          {subTab === 'standings' && (
            <div className="rounded-2xl bg-[#121B24] border border-white/10 overflow-hidden">
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse text-xs">
                  <thead>
                    <tr className="border-b border-white/10 text-slate-400 bg-[#0B1117]/60">
                      <th className="py-3 pl-3 pr-2">#</th>
                      <th className="py-3 px-2">Câu lạc bộ</th>
                      <th className="py-3 px-2 text-center font-mono-num">Tr</th>
                      <th className="py-3 px-2 text-center font-mono-num">T</th>
                      <th className="py-3 px-2 text-center font-mono-num">H</th>
                      <th className="py-3 px-2 text-center font-mono-num">B</th>
                      <th className="py-3 px-2 text-center font-mono-num">HS</th>
                      <th className="py-3 pl-2 pr-3 text-right font-mono-num">Đ</th>
                    </tr>
                  </thead>
                  <tbody>
                    {sortedStandings.map((row, idx) => {
                      const club = CLUBS.find((c) => c.id === row.clubId) ?? CLUBS[0];
                      const isMine = row.clubId === career.clubId;
                      return (
                        <tr
                          key={row.clubId}
                          className={`border-b border-white/5 ${
                            isMine ? 'bg-emerald-500/15' : 'hover:bg-white/[0.02]'
                          }`}
                        >
                          <td className="py-3 pl-3 pr-2 font-mono-num font-bold text-slate-300">
                            {idx + 1}
                          </td>
                          <td className="py-3 px-2">
                            <div className="flex items-center gap-2 min-w-[130px]">
                              <ClubCrest club={club} size={22} />
                              <span className={`truncate ${isMine ? 'font-bold text-emerald-300' : 'text-white'}`}>
                                {row.clubName}
                              </span>
                            </div>
                          </td>
                          <td className="py-3 px-2 text-center font-mono-num text-slate-300">{row.played}</td>
                          <td className="py-3 px-2 text-center font-mono-num text-slate-300">{row.won}</td>
                          <td className="py-3 px-2 text-center font-mono-num text-slate-300">{row.drawn}</td>
                          <td className="py-3 px-2 text-center font-mono-num text-slate-300">{row.lost}</td>
                          <td className="py-3 px-2 text-center font-mono-num text-slate-300">
                            {row.gf - row.ga > 0 ? `+${row.gf - row.ga}` : row.gf - row.ga}
                          </td>
                          <td className="py-3 pl-2 pr-3 text-right font-mono-num font-bold text-white">
                            {row.points}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </div>
          )}

          {subTab === 'fixtures' && (() => {
            const playedRounds = Array.from(
              new Set(career.fixtures.filter((f) => f.played).map((f) => f.matchweek))
            ).sort((a, b) => b - a);
            const activeRoundToView = playedRounds.includes(selectedLeagueRound)
              ? selectedLeagueRound
              : playedRounds[0];
            const roundFixtures = activeRoundToView
              ? career.fixtures.filter((f) => f.played && f.matchweek === activeRoundToView)
              : [];
            const leagueRecent = Array.from(
              new Map(
                career.recentResults
                  .filter((r) => (r.competition ?? 'league') === 'league')
                  .map((r) => [r.id, r])
              ).values()
            );

            return (
              <div className="space-y-3">
                {leagueRecent.length > 0 && (
                  <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-2.5">
                    <div className="flex items-center justify-between">
                      <h3 className="text-sm font-bold text-white flex items-center gap-2">
                        <Users className="w-4 h-4 text-emerald-400" />
                        Lịch sử trận đấu VĐQG của bạn
                      </h3>
                      <span className="text-[11px] text-slate-400">Nhấp để xem chi tiết</span>
                    </div>
                    {leagueRecent.map((r, idx) => {
                      const h = CLUBS.find((c) => c.id === r.homeClubId) ?? CLUBS[0];
                      const a = CLUBS.find((c) => c.id === r.awayClubId) ?? CLUBS[1];
                      return (
                        <button
                          key={`${r.id}-${idx}`}
                          type="button"
                          onClick={() =>
                            setInspectedMatch(
                              ensureMatchResultRatings(r, {
                                clubId: career.clubId,
                                tactics: career.tactics,
                                squad: career.squad,
                              })
                            )
                          }
                          className="w-full flex items-center justify-between rounded-xl bg-[#0B1117] border border-white/5 hover:border-emerald-400/50 px-3 py-2.5 text-xs transition-colors"
                        >
                          <span className="text-slate-400 font-mono-num truncate max-w-[90px]">
                            {r.roundLabel || `V${r.matchweek}`}
                          </span>
                          <div className="flex items-center gap-2 font-semibold text-white">
                            <span>{h.shortName}</span>
                            <span className="font-mono-num text-emerald-400 px-2 py-0.5 rounded bg-slate-800">
                              {r.homeGoals} - {r.awayGoals}
                            </span>
                            <span>{a.shortName}</span>
                          </div>
                          <span className="text-slate-400 flex items-center gap-1 font-mono-num">
                            {r.possessionHome}%
                            <ChevronRight className="w-3.5 h-3.5 text-slate-500" />
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}

                {playedRounds.length > 0 && (
                  <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
                    <div className="flex items-center justify-between gap-2">
                      <h3 className="text-sm font-bold text-white">Kết quả các vòng VĐQG</h3>
                      <select
                        value={activeRoundToView}
                        onChange={(e) => setSelectedLeagueRound(Number(e.target.value))}
                        className="h-9 px-2.5 rounded-lg bg-[#0B1117] border border-white/10 text-xs font-mono-num text-white"
                      >
                        {playedRounds.map((mw) => (
                          <option key={mw} value={mw}>
                            Vòng {mw}
                          </option>
                        ))}
                      </select>
                    </div>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {roundFixtures.map((f) => {
                        const h = CLUBS.find((c) => c.id === f.homeClubId) ?? CLUBS[0];
                        const a = CLUBS.find((c) => c.id === f.awayClubId) ?? CLUBS[1];
                        const isMine =
                          f.homeClubId === career.clubId || f.awayClubId === career.clubId;
                        return (
                          <button
                            key={f.id}
                            type="button"
                            onClick={() => openLeagueFixtureReport(f)}
                            className={`w-full flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 text-xs border transition-colors ${
                              isMine
                                ? 'bg-emerald-500/10 border-emerald-500/35 hover:border-emerald-400'
                                : 'bg-[#0B1117] border-white/5 hover:border-emerald-400/50'
                            }`}
                          >
                            <div className="flex items-center gap-1.5 min-w-0 flex-1">
                              <ClubCrest club={h} size={18} />
                              <span className="text-white truncate">{h.shortName}</span>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-slate-800 font-mono-num font-bold text-emerald-400 shrink-0">
                              {f.homeGoals} - {f.awayGoals}
                            </span>
                            <div className="flex items-center justify-end gap-1.5 min-w-0 flex-1">
                              <span className="text-white truncate text-right">{a.shortName}</span>
                              <ClubCrest club={a} size={18} />
                              <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                            </div>
                          </button>
                        );
                      })}
                    </div>
                  </div>
                )}

                <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-2">
                  <h3 className="text-sm font-bold text-white">Lịch thi đấu VĐQG sắp tới của CLB</h3>
                  {career.fixtures
                    .filter(
                      (f) =>
                        !f.played && (f.homeClubId === career.clubId || f.awayClubId === career.clubId)
                    )
                    .slice(0, 8)
                    .map((f) => {
                      const h = CLUBS.find((c) => c.id === f.homeClubId) ?? CLUBS[0];
                      const a = CLUBS.find((c) => c.id === f.awayClubId) ?? CLUBS[1];
                      return (
                        <div
                          key={f.id}
                          className="flex items-center justify-between rounded-xl bg-[#0B1117] px-3 py-2.5 text-xs"
                        >
                          <span className="font-mono-num text-slate-400">Vòng {f.matchweek}</span>
                          <div className="flex items-center gap-2 text-white font-medium">
                            <ClubCrest club={h} size={20} />
                            <span>{h.name}</span>
                            <span className="text-slate-500">vs</span>
                            <span>{a.name}</span>
                            <ClubCrest club={a} size={20} />
                          </div>
                        </div>
                      );
                    })}
                  {career.fixtures.every((f) => f.played) && (
                    <p className="text-xs text-slate-400 py-3 text-center">
                      Tất cả các vòng VĐQG mùa {career.season} đã hoàn tất.
                    </p>
                  )}
                </div>
              </div>
            );
          })()}

          {subTab === 'scorers' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.league ?? []}
              mode="goals"
              userClubId={career.clubId}
              userSquadStars={userSquadStars}
              competitionTitle={`Super League ${career.season}`}
              isFinished={isCompetitionFinished(career, 'league')}
              awards={{ topScorer: leagueAwards.topScorer, mvp: leagueAwards.mvp }}
            />
          )}

          {subTab === 'assists' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.league ?? []}
              mode="assists"
              userClubId={career.clubId}
              userSquadStars={userSquadStars}
              competitionTitle={`Super League ${career.season}`}
              isFinished={isCompetitionFinished(career, 'league')}
              awards={{ topScorer: leagueAwards.topScorer, mvp: leagueAwards.mvp }}
            />
          )}

          {subTab === 'mvp' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.league ?? []}
              mode="mvp"
              userClubId={career.clubId}
              userSquadStars={userSquadStars}
              competitionTitle={`Super League ${career.season}`}
              isFinished={isCompetitionFinished(career, 'league')}
              awards={{ topScorer: leagueAwards.topScorer, mvp: leagueAwards.mvp }}
            />
          )}
        </div>
      )}

      {/* 2. CHAMPIONS CUP */}
      {compTab === 'champions-cup' && cc && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
            {[
              { id: 'overview', label: 'Bảng & Nhánh' },
              { id: 'history', label: 'Kết quả' },
              { id: 'scorers', label: 'Ghi bàn' },
              { id: 'assists', label: 'Kiến tạo' },
              { id: 'mvp', label: 'Xuất sắc' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCupSubTab(tab.id as typeof cupSubTab)}
                className={`h-10 rounded-lg text-xs font-semibold px-1 truncate whitespace-nowrap ${
                  cupSubTab === tab.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {cupSubTab === 'overview' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-amber-400 font-semibold">
                    UEFA-Style Champions Cup · Mùa {career.season}
                  </p>
                  <h3 className="font-display text-xl font-bold text-white">
                    {cc.stage === 'group'
                      ? `Vòng bảng · Lượt ${cc.currentRound}/3`
                      : STAGE_LABEL[cc.stage]}
                  </h3>
                </div>
                {cc.championClubId && (
                  <div className="text-right">
                    <p className="text-[11px] text-amber-400 font-semibold">Nhà vô địch</p>
                    <p className="text-sm font-bold text-white">
                      {CLUBS.find((c) => c.id === cc.championClubId)?.name}
                    </p>
                  </div>
                )}
              </div>

              {userCcMatch ? (
                renderPreMatchCard(
                  userCcMatch.homeClubId,
                  userCcMatch.awayClubId,
                  'Champions Cup',
                  cc.stage === 'group'
                    ? `${userCcMatch.groupName} · Lượt ${cc.currentRound}/3`
                    : STAGE_LABEL[cc.stage],
                  () =>
                    launchMatch(
                      userCcMatch.homeClubId,
                      userCcMatch.awayClubId,
                      {
                        kind: 'champions-cup',
                        cupMatchId: userCcMatch.id,
                        roundMatches: ccCurrentRoundMatches,
                        isKnockout: cc.stage !== 'group',
                        isNeutralVenue: cc.stage === 'final',
                        roundLabel:
                          cc.stage === 'group'
                            ? `Cúp C1 · Lượt ${cc.currentRound}`
                            : `Cúp C1 · ${STAGE_LABEL[cc.stage]}`,
                      },
                      {
                        isKnockout: cc.stage !== 'group',
                        isNeutralVenue: cc.stage === 'final',
                        competition: 'champions-cup',
                        roundLabel:
                          cc.stage === 'group'
                            ? `Cúp C1 · Lượt ${cc.currentRound}`
                            : `Cúp C1 · ${STAGE_LABEL[cc.stage]}`,
                        matchId: userCcMatch.id,
                      },
                      false
                    ),
                  () =>
                    launchMatch(
                      userCcMatch.homeClubId,
                      userCcMatch.awayClubId,
                      {
                        kind: 'champions-cup',
                        cupMatchId: userCcMatch.id,
                        roundMatches: ccCurrentRoundMatches,
                        isKnockout: cc.stage !== 'group',
                        isNeutralVenue: cc.stage === 'final',
                        roundLabel:
                          cc.stage === 'group'
                            ? `Cúp C1 · Lượt ${cc.currentRound}`
                            : `Cúp C1 · ${STAGE_LABEL[cc.stage]}`,
                      },
                      {
                        isKnockout: cc.stage !== 'group',
                        isNeutralVenue: cc.stage === 'final',
                        competition: 'champions-cup',
                        roundLabel:
                          cc.stage === 'group'
                            ? `Cúp C1 · Lượt ${cc.currentRound}`
                            : `Cúp C1 · ${STAGE_LABEL[cc.stage]}`,
                        matchId: userCcMatch.id,
                      },
                      true
                    )
                )
              ) : cc.stage !== 'completed' ? (
                <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-300">
                    CLB của bạn không thi đấu ở lượt {STAGE_LABEL[cc.stage]} này. Mô phỏng để giải đấu tiếp diễn.
                  </p>
                  <button
                    type="button"
                    disabled={savingMatch}
                    onClick={() =>
                      simulateRemainingCupRound(
                        'champions-cup',
                        ccCurrentRoundMatches,
                        cc.stage !== 'group',
                        `Cúp C1 · ${STAGE_LABEL[cc.stage]}`,
                        cc.stage === 'final'
                      )
                    }
                    className="h-10 px-4 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shrink-0"
                  >
                    Mô phỏng vòng
                  </button>
                </div>
              ) : null}

              {/* 4 Groups */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {cc.groups.map((grp) => (
                  <div
                    key={grp.name}
                    className="rounded-2xl bg-[#121B24] border border-white/10 p-3.5 space-y-2"
                  >
                    <p className="text-xs font-bold text-emerald-400">{grp.name} (Top 2 vào Tứ kết)</p>
                    <table className="w-full text-xs">
                      <thead>
                        <tr className="text-slate-400 border-b border-white/10">
                          <th className="py-1.5 text-left">CLB</th>
                          <th className="py-1.5 text-center font-mono-num">Tr</th>
                          <th className="py-1.5 text-center font-mono-num">HS</th>
                          <th className="py-1.5 text-right font-mono-num">Đ</th>
                        </tr>
                      </thead>
                      <tbody>
                        {sortStandings(grp.standings).map((row, idx) => {
                          const club = CLUBS.find((c) => c.id === row.clubId) ?? CLUBS[0];
                          const isMine = row.clubId === career.clubId;
                          return (
                            <tr
                              key={row.clubId}
                              className={`border-b border-white/5 ${
                                isMine ? 'text-emerald-300 font-bold' : idx < 2 ? 'text-white' : 'text-slate-400'
                              }`}
                            >
                              <td className="py-2 flex items-center gap-2">
                                <span className="font-mono-num text-[11px] w-3">{idx + 1}</span>
                                <ClubCrest club={club} size={18} />
                                <span className="truncate">{row.shortName}</span>
                              </td>
                              <td className="py-2 text-center font-mono-num">{row.played}</td>
                              <td className="py-2 text-center font-mono-num">{row.gf - row.ga}</td>
                              <td className="py-2 text-right font-mono-num font-bold">{row.points}</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                ))}
              </div>

              {/* Knockout Matches if unlocked */}
              {cc.matches.some((m) => m.stage !== 'group') && (
                <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white">Vòng Knock-out Champions Cup</h4>
                    <span className="text-[11px] text-slate-400">Nhấp trận đã đấu để xem</span>
                  </div>
                  {(['qf', 'sf', 'final'] as const).map((st) => {
                    const list = cc.matches.filter((m) => m.stage === st);
                    if (list.length === 0) return null;
                    return (
                      <div key={st} className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-amber-400">{STAGE_LABEL[st]}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {list.map((m) =>
                            renderCupMatchRow(m, 'champions-cup', `Cúp C1 · ${STAGE_LABEL[st]}`)
                          )}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
            </div>
          )}

          {cupSubTab === 'history' && (() => {
            const playedCc = cc.matches.filter((m) => m.played);
            return (
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">Lịch sử trận đấu Champions Cup</h4>
                  <span className="text-[11px] text-slate-400">Nhấp để xem thông tin trận</span>
                </div>
                {playedCc.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    Chưa có trận đấu nào hoàn tất tại Champions Cup mùa {career.season}.
                  </p>
                ) : (
                  (['final', 'sf', 'qf', 'group'] as const).map((st) => {
                    const list = playedCc.filter((m) => m.stage === st);
                    if (list.length === 0) return null;
                    return (
                      <div key={st} className="space-y-1.5">
                        <p className="text-[11px] font-semibold text-amber-400">{STAGE_LABEL[st]}</p>
                        <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                          {list.map((m) =>
                            renderCupMatchRow(
                              m,
                              'champions-cup',
                              st === 'group'
                                ? `Cúp C1 · ${m.groupName || 'Vòng bảng'} (Lượt ${m.round})`
                                : `Cúp C1 · ${STAGE_LABEL[st]}`
                            )
                          )}
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            );
          })()}

          {cupSubTab === 'scorers' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.['champions-cup'] ?? []}
              mode="goals"
              userClubId={career.clubId}
              userSquadStars={userSquadStars}
              competitionTitle={`Champions Cup ${career.season}`}
              isFinished={isCompetitionFinished(career, 'champions-cup')}
              awards={{ topScorer: ccAwards.topScorer, mvp: ccAwards.mvp }}
            />
          )}

          {cupSubTab === 'assists' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.['champions-cup'] ?? []}
              mode="assists"
              userClubId={career.clubId}
              userSquadStars={userSquadStars}
              competitionTitle={`Champions Cup ${career.season}`}
              isFinished={isCompetitionFinished(career, 'champions-cup')}
              awards={{ topScorer: ccAwards.topScorer, mvp: ccAwards.mvp }}
            />
          )}

          {cupSubTab === 'mvp' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.['champions-cup'] ?? []}
              mode="mvp"
              userClubId={career.clubId}
              userSquadStars={userSquadStars}
              competitionTitle={`Champions Cup ${career.season}`}
              isFinished={isCompetitionFinished(career, 'champions-cup')}
              awards={{ topScorer: ccAwards.topScorer, mvp: ccAwards.mvp }}
            />
          )}
        </div>
      )}

      {/* 3. NATIONAL CUP */}
      {compTab === 'national-cup' && nc && (
        <div className="space-y-4">
          <div className="grid grid-cols-2 sm:grid-cols-4 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
            {[
              { id: 'bracket', label: 'Nhánh đấu & KQ' },
              { id: 'scorers', label: 'Ghi bàn' },
              { id: 'assists', label: 'Kiến tạo' },
              { id: 'mvp', label: 'Xuất sắc' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setNcSubTab(tab.id as typeof ncSubTab)}
                className={`h-10 rounded-lg text-xs font-semibold px-1 truncate whitespace-nowrap ${
                  ncSubTab === tab.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {ncSubTab === 'bracket' && (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-emerald-400 font-semibold">
                    Cúp Quốc Gia Knock-out · Mùa {career.season}
                  </p>
                  <h3 className="font-display text-xl font-bold text-white">
                    {STAGE_LABEL[nc.stage]}
                  </h3>
                </div>
                {nc.championClubId && (
                  <div className="text-right">
                    <p className="text-[11px] text-amber-400 font-semibold">Vô địch Cúp QG</p>
                    <p className="text-sm font-bold text-white">
                      {CLUBS.find((c) => c.id === nc.championClubId)?.name}
                    </p>
                  </div>
                )}
              </div>

              {userNcMatch ? (
                renderPreMatchCard(
                  userNcMatch.homeClubId,
                  userNcMatch.awayClubId,
                  'Cúp Quốc Gia (Loại trực tiếp)',
                  STAGE_LABEL[nc.stage],
                  () =>
                    launchMatch(
                      userNcMatch.homeClubId,
                      userNcMatch.awayClubId,
                      {
                        kind: 'national-cup',
                        cupMatchId: userNcMatch.id,
                        roundMatches: ncCurrentRoundMatches,
                        isNeutralVenue: nc.stage === 'final',
                        roundLabel: `Cúp QG · ${STAGE_LABEL[nc.stage]}`,
                      },
                      {
                        isKnockout: true,
                        isNeutralVenue: nc.stage === 'final',
                        competition: 'national-cup',
                        roundLabel: `Cúp QG · ${STAGE_LABEL[nc.stage]}`,
                        matchId: userNcMatch.id,
                      },
                      false
                    ),
                  () =>
                    launchMatch(
                      userNcMatch.homeClubId,
                      userNcMatch.awayClubId,
                      {
                        kind: 'national-cup',
                        cupMatchId: userNcMatch.id,
                        roundMatches: ncCurrentRoundMatches,
                        isNeutralVenue: nc.stage === 'final',
                        roundLabel: `Cúp QG · ${STAGE_LABEL[nc.stage]}`,
                      },
                      {
                        isKnockout: true,
                        isNeutralVenue: nc.stage === 'final',
                        competition: 'national-cup',
                        roundLabel: `Cúp QG · ${STAGE_LABEL[nc.stage]}`,
                        matchId: userNcMatch.id,
                      },
                      true
                    )
                )
              ) : nc.stage !== 'completed' ? (
                <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 flex items-center justify-between gap-3">
                  <p className="text-xs text-slate-300">
                    CLB của bạn đã dừng bước ở Cúp Quốc Gia. Mô phỏng vòng {STAGE_LABEL[nc.stage]} để tìm nhà vô địch.
                  </p>
                  <button
                    type="button"
                    disabled={savingMatch}
                    onClick={() =>
                      simulateRemainingCupRound(
                        'national-cup',
                        ncCurrentRoundMatches,
                        true,
                        `Cúp QG · ${STAGE_LABEL[nc.stage]}`,
                        nc.stage === 'final'
                      )
                    }
                    className="h-10 px-4 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs shrink-0"
                  >
                    Mô phỏng vòng
                  </button>
                </div>
              ) : null}

              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-sm font-bold text-white">Cây đấu Cúp Quốc Gia</h4>
                  <span className="text-[11px] text-slate-400">Nhấp trận đã đấu để xem</span>
                </div>
                {(['final', 'sf', 'qf', 'r16'] as const).map((st) => {
                  const list = nc.matches.filter((m) => m.stage === st);
                  if (list.length === 0) return null;
                  return (
                    <div key={st} className="space-y-2">
                      <h4 className="text-xs font-bold text-amber-400">{STAGE_LABEL[st]}</h4>
                      <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                        {list.map((m) =>
                          renderCupMatchRow(m, 'national-cup', `Cúp QG · ${STAGE_LABEL[st]}`)
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {ncSubTab === 'scorers' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.['national-cup'] ?? []}
              mode="goals"
              userClubId={career.clubId}
              userSquadStars={userSquadStars}
              competitionTitle={`Cúp Quốc Gia ${career.season}`}
              isFinished={isCompetitionFinished(career, 'national-cup')}
              awards={{ topScorer: ncAwards.topScorer, mvp: ncAwards.mvp }}
            />
          )}

          {ncSubTab === 'assists' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.['national-cup'] ?? []}
              mode="assists"
              userClubId={career.clubId}
              userSquadStars={userSquadStars}
              competitionTitle={`Cúp Quốc Gia ${career.season}`}
              isFinished={isCompetitionFinished(career, 'national-cup')}
              awards={{ topScorer: ncAwards.topScorer, mvp: ncAwards.mvp }}
            />
          )}

          {ncSubTab === 'mvp' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.['national-cup'] ?? []}
              mode="mvp"
              userClubId={career.clubId}
              userSquadStars={userSquadStars}
              competitionTitle={`Cúp Quốc Gia ${career.season}`}
              isFinished={isCompetitionFinished(career, 'national-cup')}
              awards={{ topScorer: ncAwards.topScorer, mvp: ncAwards.mvp }}
            />
          )}
        </div>
      )}

      {/* 4. SUPER CUP & FRIENDLIES */}
      {compTab === 'special' && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 sm:grid-cols-5 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
            {[
              { id: 'play', label: 'Thi đấu' },
              { id: 'history', label: 'Lịch sử' },
              { id: 'scorers', label: 'Ghi bàn' },
              { id: 'assists', label: 'Kiến tạo' },
              { id: 'mvp', label: 'Xuất sắc' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSpecialSubTab(tab.id as typeof specialSubTab)}
                className={`h-10 rounded-lg text-xs font-semibold px-1 truncate whitespace-nowrap ${
                  specialSubTab === tab.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                }`}
              >
                {tab.label}
              </button>
            ))}
          </div>

          {specialSubTab === 'play' && (
            <div className="space-y-4">
              {/* Super Cup */}
              {sc && (
                <div className="space-y-2">
                  <h3 className="text-sm font-bold text-amber-400 flex items-center gap-2">
                    <Trophy className="w-4 h-4" />
                    Siêu Cúp Mùa giải {career.season}
                  </h3>
                  {sc.match.played ? (
                    <div className="rounded-2xl bg-[#121B24] border border-amber-400/30 p-4 space-y-2">
                      {renderCupMatchRow(sc.match, 'super-cup', `Siêu Cúp ${career.season}`)}
                      <p className="text-xs text-amber-300 font-semibold text-center">
                        Nhà vô địch Siêu Cúp: {CLUBS.find((c) => c.id === sc.championClubId)?.name}
                      </p>
                    </div>
                  ) : userScMatch ? (
                    renderPreMatchCard(
                      userScMatch.homeClubId,
                      userScMatch.awayClubId,
                      `Siêu Cúp ${career.season}`,
                      'Trận tranh Cúp danh dự',
                      () =>
                        launchMatch(
                          userScMatch.homeClubId,
                          userScMatch.awayClubId,
                          { kind: 'super-cup', cupMatchId: userScMatch.id, isNeutralVenue: true },
                          {
                            isKnockout: true,
                            isNeutralVenue: true,
                            competition: 'super-cup',
                            roundLabel: `Siêu Cúp ${career.season}`,
                            matchId: userScMatch.id,
                          },
                          false
                        ),
                      () =>
                        launchMatch(
                          userScMatch.homeClubId,
                          userScMatch.awayClubId,
                          { kind: 'super-cup', cupMatchId: userScMatch.id, isNeutralVenue: true },
                          {
                            isKnockout: true,
                            isNeutralVenue: true,
                            competition: 'super-cup',
                            roundLabel: `Siêu Cúp ${career.season}`,
                            matchId: userScMatch.id,
                          },
                          true
                        )
                    )
                  ) : (
                    <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
                      {renderCupMatchRow(sc.match, 'super-cup', `Siêu Cúp ${career.season}`)}
                      <button
                        type="button"
                        disabled={savingMatch}
                        onClick={() =>
                          simulateRemainingCupRound(
                            'super-cup',
                            [sc.match],
                            true,
                            `Siêu Cúp ${career.season}`,
                            true
                          )
                        }
                        className="w-full h-11 rounded-xl bg-amber-500 text-slate-950 font-bold text-xs"
                      >
                        Mô phỏng trận Siêu Cúp
                      </button>
                    </div>
                  )}
                </div>
              )}

              {/* Unlimited International Friendly Tour */}
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-4">
                <div>
                  <p className="text-xs text-emerald-400 font-semibold">
                    Chế độ Đá ngay · Không giới hạn lượt
                  </p>
                  <h3 className="font-display text-xl font-bold text-white">
                    Tour Giao hữu Quốc tế
                  </h3>
                  <p className="text-xs text-slate-400 mt-0.5">
                    Thử nghiệm chiến thuật mới với bất kỳ đối thủ nào trong 20 CLB thực tế (trận giao hữu không tính tiền thưởng hay mảnh).
                  </p>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">Chọn CLB đối thủ</label>
                    <select
                      value={friendlyOppId}
                      onChange={(e) => setFriendlyOppId(e.target.value)}
                      className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500"
                    >
                      {otherClubs.map((c) => (
                        <option key={c.id} value={c.id}>
                          {c.name} ({c.league} · {c.reputation} OVR)
                        </option>
                      ))}
                    </select>
                  </div>

                  <div className="space-y-1.5">
                    <label className="text-xs text-slate-400">Địa điểm thi đấu</label>
                    <div className="grid grid-cols-2 gap-1.5 p-1 rounded-xl bg-[#0B1117] border border-white/10 h-11">
                      <button
                        type="button"
                        onClick={() => setFriendlyAtHome(true)}
                        className={`rounded-lg text-xs font-semibold ${
                          friendlyAtHome ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                        }`}
                      >
                        Sân nhà
                      </button>
                      <button
                        type="button"
                        onClick={() => setFriendlyAtHome(false)}
                        className={`rounded-lg text-xs font-semibold ${
                          !friendlyAtHome ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                        }`}
                      >
                        Sân khách
                      </button>
                    </div>
                  </div>
                </div>

                {renderPreMatchCard(
                  friendlyAtHome ? career.clubId : friendlyOppId,
                  friendlyAtHome ? friendlyOppId : career.clubId,
                  'Giao hữu Quốc tế',
                  'Thử nghiệm đội hình',
                  () =>
                    launchMatch(
                      friendlyAtHome ? career.clubId : friendlyOppId,
                      friendlyAtHome ? friendlyOppId : career.clubId,
                      { kind: 'friendly' },
                      { competition: 'friendly', roundLabel: 'Giao hữu Quốc tế' },
                      false
                    ),
                  () =>
                    launchMatch(
                      friendlyAtHome ? career.clubId : friendlyOppId,
                      friendlyAtHome ? friendlyOppId : career.clubId,
                      { kind: 'friendly' },
                      { competition: 'friendly', roundLabel: 'Giao hữu Quốc tế' },
                      true
                    )
                )}
              </div>
            </div>
          )}

          {specialSubTab === 'history' && (() => {
            const friendlyHistory = career.recentResults.filter(
              (r) => r.competition === 'friendly'
            );
            return (
              <div className="space-y-3">
                {sc?.match.played && (
                  <div className="rounded-2xl bg-[#121B24] border border-amber-400/25 p-4 space-y-2">
                    <div className="flex items-center justify-between">
                      <h4 className="text-sm font-bold text-amber-400">Siêu Cúp {career.season}</h4>
                      <span className="text-[11px] text-slate-400">Nhấp để xem chi tiết</span>
                    </div>
                    {renderCupMatchRow(sc.match, 'super-cup', `Siêu Cúp ${career.season}`)}
                  </div>
                )}

                <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-2.5">
                  <div className="flex items-center justify-between">
                    <h4 className="text-sm font-bold text-white">Lịch sử Giao hữu Quốc tế</h4>
                    <span className="text-[11px] text-slate-400">Nhấp để xem chi tiết</span>
                  </div>
                  {friendlyHistory.length === 0 ? (
                    <p className="text-xs text-slate-400 py-6 text-center">
                      Chưa có trận giao hữu nào được ghi nhận.
                    </p>
                  ) : (
                    friendlyHistory.map((r, idx) => {
                      const h = CLUBS.find((c) => c.id === r.homeClubId) ?? CLUBS[0];
                      const a = CLUBS.find((c) => c.id === r.awayClubId) ?? CLUBS[1];
                      return (
                        <button
                          key={`${r.id}-${idx}`}
                          type="button"
                          onClick={() =>
                            setInspectedMatch(
                              ensureMatchResultRatings(r, {
                                clubId: career.clubId,
                                tactics: career.tactics,
                                squad: career.squad,
                              })
                            )
                          }
                          className="w-full flex items-center justify-between rounded-xl bg-[#0B1117] border border-white/5 hover:border-emerald-400/50 px-3 py-2.5 text-xs transition-colors"
                        >
                          <div className="flex items-center gap-1.5 min-w-0 flex-1">
                            <ClubCrest club={h} size={18} />
                            <span className="text-white truncate">{h.shortName}</span>
                          </div>
                          <span className="px-2 py-0.5 rounded bg-slate-800 font-mono-num font-bold text-emerald-400 shrink-0">
                            {r.homeGoals} - {r.awayGoals}
                          </span>
                          <div className="flex items-center justify-end gap-1.5 min-w-0 flex-1">
                            <span className="text-white truncate text-right">{a.shortName}</span>
                            <ClubCrest club={a} size={18} />
                            <ChevronRight className="w-3.5 h-3.5 text-slate-500 shrink-0" />
                          </div>
                        </button>
                      );
                    })
                  )}
                </div>
              </div>
            );
          })()}

          {(specialSubTab === 'scorers' || specialSubTab === 'assists' || specialSubTab === 'mvp') && (
            <div className="space-y-3">
              <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0B1117] border border-white/10">
                <button
                  type="button"
                  onClick={() => setSpecialStatsTarget('friendly')}
                  className={`h-9 rounded-lg text-xs font-semibold ${
                    specialStatsTarget === 'friendly'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300'
                  }`}
                >
                  Giao hữu Quốc tế
                </button>
                <button
                  type="button"
                  onClick={() => setSpecialStatsTarget('super-cup')}
                  className={`h-9 rounded-lg text-xs font-semibold ${
                    specialStatsTarget === 'super-cup'
                      ? 'bg-amber-500 text-slate-950'
                      : 'text-slate-300'
                  }`}
                >
                  Siêu Cúp {career.season}
                </button>
              </div>

              <CompetitionStatsPanel
                stats={career.competitions?.leaderboards?.[specialStatsTarget] ?? []}
                mode={
                  specialSubTab === 'scorers'
                    ? 'goals'
                    : specialSubTab === 'assists'
                      ? 'assists'
                      : 'mvp'
                }
                userClubId={career.clubId}
              userSquadStars={userSquadStars}
                competitionTitle={
                  specialStatsTarget === 'friendly'
                    ? 'Giao hữu Quốc tế'
                    : `Siêu Cúp ${career.season}`
                }
                isFinished={
                  specialStatsTarget === 'super-cup' &&
                  isCompetitionFinished(career, 'super-cup')
                }
                awards={{ topScorer: specialAwards.topScorer, mvp: specialAwards.mvp }}
              />
            </div>
          )}
        </div>
      )}

      {/* Match Information & Post-Match Detail Sheet */}
      <MatchDetailModal
        match={inspectedMatch}
        userClubId={career.clubId}
        onClose={() => setInspectedMatch(null)}
      />
      {renderMatchConfirmModals()}
    </div>
  );
};
