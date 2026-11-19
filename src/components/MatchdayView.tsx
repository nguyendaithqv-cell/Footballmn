import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Award,
  ChevronRight,
  FastForward,
  Flame,
  Play,
  RefreshCw,
  Shield,
  Sparkles,
  Trophy,
  Users,
} from 'lucide-react';
import { CLUBS, INITIAL_PLAYERS, REAL_MANAGERS } from '../data/footballDatabase';
import {
  buildMatchSummaryFromStored,
  ensureMatchResultRatings,
  getNextSeasonString,
  simulateMatchFull,
  sortStandings,
} from '../lib/careerEngine';
import {
  CareerSave,
  CompetitionId,
  CupMatch,
  Fixture,
  MatchResultSummary,
  Mentality,
} from '../types/game';
import { ClubCrest, ManagerAvatar } from './ClubBadgeAndAvatar';
import { CompetitionStatsPanel } from './CompetitionStatsPanel';
import { MatchDetailModal, MatchStatsBreakdown } from './MatchDetailModal';

interface MatchdayViewProps {
  career: CareerSave;
  onCompleteMatchweek: (userMatch: MatchResultSummary, allMatches: MatchResultSummary[]) => Promise<void>;
  onCompleteCupMatch: (
    competition: 'champions-cup' | 'national-cup' | 'super-cup',
    userMatch: MatchResultSummary | null,
    roundEntries: { matchId: string; result: MatchResultSummary }[]
  ) => Promise<void>;
  onCompleteFriendly: (userMatch: MatchResultSummary) => Promise<void>;
  onStartNextSeason: () => Promise<void>;
  onQuickMentality: (mentality: Mentality) => void;
}

type CompetitionViewTab = 'league' | 'champions-cup' | 'national-cup' | 'special';

type ActiveSimContext =
  | { kind: 'league' }
  | { kind: 'champions-cup'; cupMatchId: string; roundMatches: CupMatch[]; isKnockout: boolean; roundLabel: string }
  | { kind: 'national-cup'; cupMatchId: string; roundMatches: CupMatch[]; roundLabel: string }
  | { kind: 'super-cup'; cupMatchId: string }
  | { kind: 'friendly' };

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
  onCompleteMatchweek,
  onCompleteCupMatch,
  onCompleteFriendly,
  onStartNextSeason,
  onQuickMentality,
}) => {
  const [compTab, setCompTab] = useState<CompetitionViewTab>('league');
  const [subTab, setSubTab] = useState<'match' | 'standings' | 'fixtures' | 'scorers' | 'assists'>(
    'match'
  );
  const [cupSubTab, setCupSubTab] = useState<'overview' | 'history' | 'scorers' | 'assists'>(
    'overview'
  );
  const [ncSubTab, setNcSubTab] = useState<'bracket' | 'scorers' | 'assists'>('bracket');
  const [specialSubTab, setSpecialSubTab] = useState<'play' | 'history' | 'scorers' | 'assists'>(
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
  const [speed, setSpeed] = useState<1 | 2 | 4>(2);
  const [liveResult, setLiveResult] = useState<MatchResultSummary | null>(null);
  const [simContext, setSimContext] = useState<ActiveSimContext | null>(null);
  const [ballPos, setBallPos] = useState<{ x: number; y: number }>({ x: 50, y: 50 });
  const [savingMatch, setSavingMatch] = useState(false);
  const [startingNextSeason, setStartingNextSeason] = useState(false);
  const timerRef = useRef<number | null>(null);
  const finalizedMatchIdRef = useRef<string | null>(null);

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
  const myLeagueRank = Math.max(
    1,
    sortedStandings.findIndex((r) => r.clubId === career.clubId) + 1
  );
  const myStandingRow = sortedStandings.find((r) => r.clubId === career.clubId);
  const leagueChampionClub =
    CLUBS.find((c) => c.id === sortedStandings[0]?.clubId) ?? CLUBS[0];
  const nextSeasonLabel = getNextSeasonString(career.season);
  const endSeasonPrizeM =
    myLeagueRank === 1 ? 55 : myLeagueRank <= 4 ? 35 : myLeagueRank <= 10 ? 25 : 18;

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
    };
  }, []);

  const clearLivePitch = () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    setIsLive(false);
    setLiveResult(null);
    setSimContext(null);
    setMinute(0);
  };

  const finalizeSimulation = useCallback(
    async (userRes: MatchResultSummary, context: ActiveSimContext | null) => {
      if (!context) return;
      if (finalizedMatchIdRef.current === userRes.id) return;
      finalizedMatchIdRef.current = userRes.id;
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
                INITIAL_PLAYERS
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
                    INITIAL_PLAYERS,
                    {
                      isKnockout: context.isKnockout,
                      competition: 'champions-cup',
                      roundLabel: context.roundLabel,
                      matchId: m.id,
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
                    INITIAL_PLAYERS,
                    {
                      isKnockout: true,
                      competition: 'national-cup',
                      roundLabel: context.roundLabel,
                      matchId: m.id,
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
    options: { isKnockout?: boolean; competition: MatchResultSummary['competition']; roundLabel?: string; matchId?: string },
    instant: boolean
  ) => {
    finalizedMatchIdRef.current = null;
    const simulated = simulateMatchFull(
      homeId,
      awayId,
      career.matchweek,
      career.clubId,
      career.tactics,
      career.squad,
      INITIAL_PLAYERS,
      options
    );
    setSimContext(context);
    if (instant) {
      await finalizeSimulation(simulated, context);
      setLiveResult(null);
      setSimContext(null);
      setMinute(0);
      setInspectedMatch(simulated);
    } else {
      setLiveResult(simulated);
      setMinute(1);
      setIsLive(true);
    }
  };

  const skipActiveLiveToFullTime = async () => {
    if (timerRef.current) window.clearInterval(timerRef.current);
    if (liveResult && simContext) {
      setMinute(90);
      await finalizeSimulation(liveResult, simContext);
    }
  };

  const simulateRemainingCupRound = async (
    competition: 'champions-cup' | 'national-cup' | 'super-cup',
    matches: CupMatch[],
    isKnockout: boolean,
    roundLabel: string
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
          INITIAL_PLAYERS,
          { isKnockout, competition, roundLabel, matchId: m.id }
        ),
      }));
      await onCompleteCupMatch(competition, null, entries);
    } finally {
      setSavingMatch(false);
    }
  };

  useEffect(() => {
    if (!isLive || !liveResult) return;
    if (timerRef.current) window.clearInterval(timerRef.current);

    const intervalMs = speed === 4 ? 65 : speed === 2 ? 130 : 260;
    timerRef.current = window.setInterval(() => {
      setMinute((prev) => (prev >= 90 ? 90 : prev + 1));
    }, intervalMs);

    return () => {
      if (timerRef.current) window.clearInterval(timerRef.current);
    };
  }, [isLive, speed, liveResult]);

  useEffect(() => {
    if (!isLive || !liveResult) return;
    const eventNow = liveResult.events.find((e) => e.minute === minute);
    if (eventNow?.type === 'goal') {
      setBallPos({
        x: 50,
        y: eventNow.teamId === liveResult.homeClubId ? 10 : 90,
      });
    } else {
      setBallPos({
        x: 20 + Math.round(Math.sin(minute * 0.7) * 28 + 30),
        y: 22 + Math.round(Math.cos(minute * 0.45) * 28 + 28),
      });
    }

    if (minute >= 90) {
      if (timerRef.current) window.clearInterval(timerRef.current);
      finalizeSimulation(liveResult, simContext);
    }
  }, [minute, isLive, liveResult, simContext, finalizeSimulation]);

  const visibleEvents = useMemo(() => {
    if (!liveResult) return [];
    return liveResult.events.filter((e) => e.minute <= minute).slice().reverse();
  }, [liveResult, minute]);

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

    return (
      <div className="space-y-4 lg:grid lg:grid-cols-12 lg:gap-6 lg:space-y-0">
        <div className="lg:col-span-7 space-y-3">
          <div className="rounded-2xl bg-[#121B24] border border-emerald-500/30 p-4">
            <div className="flex items-center justify-between text-xs text-slate-400 mb-3">
              <span>
                {liveResult.roundLabel || `Vòng ${liveResult.matchweek}`} · {hClub.stadium}
              </span>
              <span className="font-mono-num font-bold text-emerald-400">
                {isLive ? `${minute}'` : 'HẾT GIỜ (FT)'}
              </span>
            </div>

            <div className="grid grid-cols-3 items-center gap-2">
              <div className="flex flex-col items-center text-center gap-1.5">
                <ClubCrest club={hClub} size={46} />
                <span className="text-xs font-bold text-white truncate max-w-full">
                  {hClub.name}
                </span>
              </div>

              <div className="text-center">
                <div className="font-display text-4xl font-extrabold font-mono-num text-white tracking-wider">
                  {liveHomeGoals} - {liveAwayGoals}
                </div>
                {minute >= 90 && liveResult.penaltiesHome !== undefined && (
                  <p className="text-xs font-mono-num font-bold text-amber-400 mt-1">
                    Pen: {liveResult.penaltiesHome} - {liveResult.penaltiesAway}
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

            {[1, 2, 3, 4, 5, 6].map((n) => {
              const px = 14 + n * 10 + (isLive ? ((minute * n) % 12) - 6 : 0);
              const py = 20 + ((n * 27) % 65);
              return (
                <div
                  key={`h-${n}`}
                  style={{
                    transform: `translate(${px * 2.5}px, ${py * 1.8}px)`,
                    backgroundColor: hClub.primaryColor,
                  }}
                  className="absolute top-0 left-0 w-3.5 h-3.5 rounded-full border border-white shadow transition-transform duration-300"
                />
              );
            })}

            {[1, 2, 3, 4, 5, 6].map((n) => {
              const px = 86 - n * 10 + (isLive ? ((minute * (n + 2)) % 10) - 5 : 0);
              const py = 18 + ((n * 31) % 65);
              return (
                <div
                  key={`a-${n}`}
                  style={{
                    transform: `translate(${px * 2.5}px, ${py * 1.8}px)`,
                    backgroundColor: aClub.primaryColor,
                  }}
                  className="absolute top-0 left-0 w-3.5 h-3.5 rounded-full border border-amber-300 shadow transition-transform duration-300"
                />
              );
            })}

            <div
              style={{
                left: `${ballPos.y}%`,
                top: `${ballPos.x}%`,
                transform: 'translate(-50%, -50%)',
              }}
              className="absolute w-3.5 h-3.5 rounded-full bg-white ring-2 ring-emerald-400 shadow-lg transition-all duration-200"
            />
          </div>

          <div className="flex items-center gap-2">
            {isLive ? (
              <>
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
                <button
                  type="button"
                  onClick={() =>
                    onQuickMentality(
                      career.tactics.mentality === 'Attacking' ? 'Balanced' : 'Attacking'
                    )
                  }
                  className="flex-1 h-12 rounded-xl bg-amber-500/15 border border-amber-400/30 text-amber-300 text-xs font-bold"
                >
                  Chỉ đạo: {career.tactics.mentality}
                </button>
                <button
                  type="button"
                  disabled={savingMatch}
                  onClick={skipActiveLiveToFullTime}
                  className="h-12 px-4 rounded-xl bg-slate-800 text-white text-xs font-semibold"
                >
                  Kết thúc
                </button>
              </>
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
                      : 'bg-[#0B1117] border-white/5 text-slate-300'
                  }`}
                >
                  <span className="font-mono-num font-bold text-emerald-400 mr-2">
                    {ev.minute}&apos;
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

        <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex items-center gap-3">
          <ManagerAvatar manager={oppMgr} size={42} />
          <div className="min-w-0">
            <p className="text-[11px] text-slate-400">HLV đối thủ · {opp.name}</p>
            <p className="text-xs font-bold text-white truncate">{oppMgr.name}</p>
            <p className="text-[11px] text-emerald-400 truncate">
              {oppMgr.preferredFormation} · {oppMgr.style}
            </p>
          </div>
        </div>

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
            onClick={onQuickSim}
            className="h-12 px-4 rounded-xl bg-[#0B1117] border border-white/15 text-slate-200 font-semibold text-xs flex items-center gap-1.5 disabled:opacity-50"
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

  // If currently watching or just finished a 2D live match, render the pitch view prominently
  if (liveResult) {
    return (
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="font-display text-lg font-bold text-white">
            Trực tiếp Trận đấu
          </h2>
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
        {renderLivePitchOverlay()}
      </div>
    );
  }

  return (
    <div className="space-y-4">
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
          <div className="grid grid-cols-5 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
            {[
              { id: 'match', label: userMatchFixture ? `Vòng ${career.matchweek}` : 'Tổng kết' },
              { id: 'standings', label: 'BXH' },
              { id: 'fixtures', label: 'Lịch & KQ' },
              { id: 'scorers', label: 'Ghi bàn' },
              { id: 'assists', label: 'Kiến tạo' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSubTab(tab.id as typeof subTab)}
                className={`h-10 rounded-lg text-[11px] sm:text-xs font-semibold px-1 truncate ${
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
                <div className="rounded-2xl bg-[#121B24] border border-amber-400/30 p-5 sm:p-6 space-y-5">
                  <div className="flex items-start justify-between gap-4">
                    <div className="space-y-1">
                      <span className="text-xs font-bold text-amber-400 uppercase tracking-wider">
                        Hoàn tất mùa giải VĐQG
                      </span>
                      <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
                        Tổng kết Mùa giải {career.season}
                      </h3>
                      <p className="text-xs text-slate-400">
                        Khởi tranh ngay mùa giải {nextSeasonLabel} với đầy đủ 20 CLB (38 vòng) hoặc chinh phục các giải Cúp & Giao hữu!
                      </p>
                    </div>
                    <Trophy className="w-10 h-10 text-amber-400 shrink-0" />
                  </div>

                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                    <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
                      <p className="text-[11px] text-slate-400">Vị trí của bạn</p>
                      <p className="font-mono-num text-xl font-extrabold text-emerald-400 mt-0.5">
                        #{myLeagueRank}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
                      <p className="text-[11px] text-slate-400">Điểm số</p>
                      <p className="font-mono-num text-xl font-extrabold text-white mt-0.5">
                        {myStandingRow?.points ?? 0}đ
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
                      <p className="text-[11px] text-slate-400">Nhà vô địch</p>
                      <p className="text-sm font-bold text-amber-400 truncate mt-1">
                        {leagueChampionClub.name}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
                      <p className="text-[11px] text-slate-400">Thưởng mùa giải</p>
                      <p className="font-mono-num text-xl font-extrabold text-emerald-400 mt-0.5">
                        +€{endSeasonPrizeM}M
                      </p>
                    </div>
                  </div>

                  <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3.5 text-xs text-emerald-200 space-y-1">
                    <p className="font-bold text-emerald-300 flex items-center gap-1.5">
                      <Sparkles className="w-4 h-4" />
                      Đặc quyền khi bước sang mùa {nextSeasonLabel}:
                    </p>
                    <p>
                      • Giải VĐQG mở rộng lên 20 CLB (38 vòng) · Làm mới lịch đấu Champions Cup, Cúp Quốc Gia & Siêu Cúp.
                    </p>
                    <p>
                      • Cầu thủ trẻ tăng chỉ số OVR theo giáo án tập luyện, tự động gia hạn hợp đồng sắp hết & nhận thưởng €{endSeasonPrizeM}M.
                    </p>
                  </div>

                  <div className="space-y-2.5">
                    <button
                      type="button"
                      disabled={startingNextSeason}
                      onClick={async () => {
                        setStartingNextSeason(true);
                        try {
                          await onStartNextSeason();
                        } finally {
                          setStartingNextSeason(false);
                        }
                      }}
                      className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-60"
                    >
                      <RefreshCw className={`w-4 h-4 ${startingNextSeason ? 'animate-spin' : ''}`} />
                      {startingNextSeason
                        ? `Đang khởi tạo mùa giải ${nextSeasonLabel}...`
                        : `Khởi tranh Mùa giải Mới (${nextSeasonLabel}) · 20 CLB`}
                    </button>

                    <div className="grid grid-cols-3 gap-2">
                      <button
                        type="button"
                        onClick={() => setCompTab('champions-cup')}
                        className="h-11 rounded-xl bg-[#0B1117] border border-white/15 text-xs font-semibold text-white hover:border-emerald-400"
                      >
                        Đá Cúp C1
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompTab('national-cup')}
                        className="h-11 rounded-xl bg-[#0B1117] border border-white/15 text-xs font-semibold text-white hover:border-emerald-400"
                      >
                        Đá Cúp QG
                      </button>
                      <button
                        type="button"
                        onClick={() => setCompTab('special')}
                        className="h-11 rounded-xl bg-[#0B1117] border border-white/15 text-xs font-semibold text-amber-300 hover:border-amber-400"
                      >
                        Giao hữu ngay
                      </button>
                    </div>
                  </div>
                </div>
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
              competitionTitle={`Super League ${career.season}`}
            />
          )}

          {subTab === 'assists' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.league ?? []}
              mode="assists"
              userClubId={career.clubId}
              competitionTitle={`Super League ${career.season}`}
            />
          )}
        </div>
      )}

      {/* 2. CHAMPIONS CUP */}
      {compTab === 'champions-cup' && cc && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
            {[
              { id: 'overview', label: 'Bảng & Nhánh' },
              { id: 'history', label: 'Kết quả' },
              { id: 'scorers', label: 'Ghi bàn' },
              { id: 'assists', label: 'Kiến tạo' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setCupSubTab(tab.id as typeof cupSubTab)}
                className={`h-10 rounded-lg text-xs font-semibold px-1 truncate ${
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
                        roundLabel:
                          cc.stage === 'group'
                            ? `Cúp C1 · Lượt ${cc.currentRound}`
                            : `Cúp C1 · ${STAGE_LABEL[cc.stage]}`,
                      },
                      {
                        isKnockout: cc.stage !== 'group',
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
                        roundLabel:
                          cc.stage === 'group'
                            ? `Cúp C1 · Lượt ${cc.currentRound}`
                            : `Cúp C1 · ${STAGE_LABEL[cc.stage]}`,
                      },
                      {
                        isKnockout: cc.stage !== 'group',
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
                        `Cúp C1 · ${STAGE_LABEL[cc.stage]}`
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
              competitionTitle={`Champions Cup ${career.season}`}
            />
          )}

          {cupSubTab === 'assists' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.['champions-cup'] ?? []}
              mode="assists"
              userClubId={career.clubId}
              competitionTitle={`Champions Cup ${career.season}`}
            />
          )}
        </div>
      )}

      {/* 3. NATIONAL CUP */}
      {compTab === 'national-cup' && nc && (
        <div className="space-y-4">
          <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
            {[
              { id: 'bracket', label: 'Nhánh đấu & KQ' },
              { id: 'scorers', label: 'Ghi bàn' },
              { id: 'assists', label: 'Kiến tạo' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setNcSubTab(tab.id as typeof ncSubTab)}
                className={`h-10 rounded-lg text-xs font-semibold px-1 truncate ${
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
                        roundLabel: `Cúp QG · ${STAGE_LABEL[nc.stage]}`,
                      },
                      {
                        isKnockout: true,
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
                        roundLabel: `Cúp QG · ${STAGE_LABEL[nc.stage]}`,
                      },
                      {
                        isKnockout: true,
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
                        `Cúp QG · ${STAGE_LABEL[nc.stage]}`
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
              competitionTitle={`Cúp Quốc Gia ${career.season}`}
            />
          )}

          {ncSubTab === 'assists' && (
            <CompetitionStatsPanel
              stats={career.competitions?.leaderboards?.['national-cup'] ?? []}
              mode="assists"
              userClubId={career.clubId}
              competitionTitle={`Cúp Quốc Gia ${career.season}`}
            />
          )}
        </div>
      )}

      {/* 4. SUPER CUP & FRIENDLIES */}
      {compTab === 'special' && (
        <div className="space-y-4">
          <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
            {[
              { id: 'play', label: 'Thi đấu' },
              { id: 'history', label: 'Lịch sử' },
              { id: 'scorers', label: 'Ghi bàn' },
              { id: 'assists', label: 'Kiến tạo' },
            ].map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => setSpecialSubTab(tab.id as typeof specialSubTab)}
                className={`h-10 rounded-lg text-xs font-semibold px-1 truncate ${
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
                          { kind: 'super-cup', cupMatchId: userScMatch.id },
                          {
                            isKnockout: true,
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
                          { kind: 'super-cup', cupMatchId: userScMatch.id },
                          {
                            isKnockout: true,
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
                            `Siêu Cúp ${career.season}`
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
                    Thử nghiệm chiến thuật mới với bất kỳ đối thủ nào trong 20 CLB thực tế và nhận thưởng +€2–3M mỗi trận.
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

          {(specialSubTab === 'scorers' || specialSubTab === 'assists') && (
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
                mode={specialSubTab === 'scorers' ? 'goals' : 'assists'}
                userClubId={career.clubId}
                competitionTitle={
                  specialStatsTarget === 'friendly'
                    ? 'Giao hữu Quốc tế'
                    : `Siêu Cúp ${career.season}`
                }
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
    </div>
  );
};
