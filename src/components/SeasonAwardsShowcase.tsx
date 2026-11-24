import React, { useMemo, useState } from 'react';
import {
  Award,
  CheckCircle2,
  Coins,
  Crown,
  Gift,
  Lock,
  Medal,
  RefreshCw,
  Shield,
  Sparkles,
  Target,
  Trophy,
  Users,
  XCircle,
} from 'lucide-react';
import { CLUBS } from '../data/footballDatabase';
import {
  computeSeasonEndRewardBundle,
  computeSeasonPayrollBreakdown,
  getNextSeasonString,
  isCompetitionFinished,
  resolveCompetitionAwards,
  resolveLeagueIndividualSpotlights,
  sortStandings,
} from '../lib/careerEngine';
import { CareerSave, Club, Player } from '../types/game';
import { ClubCrest, PlayerAvatar } from './ClubBadgeAndAvatar';
import { ConfirmActionModal } from './ConfirmActionModal';

interface SeasonAwardsShowcaseProps {
  career: CareerSave;
  effectiveAllPlayers: Player[];
  onClaimSeasonRewards: () => Promise<{ ok: boolean; message: string }>;
  onStartNextSeason: () => Promise<void>;
  onNavigateCompetition: (tab: 'champions-cup' | 'national-cup' | 'special') => void;
  onOpenFinancePayroll?: () => void;
}

const STAGE_LABEL_MAP: Record<string, string> = {
  group: 'Vòng bảng',
  r16: 'Vòng 1/8',
  qf: 'Tứ kết',
  sf: 'Bán kết',
  final: 'Chung kết',
  completed: 'Đã hoàn tất',
};

export const SeasonAwardsShowcase: React.FC<SeasonAwardsShowcaseProps> = ({
  career,
  effectiveAllPlayers,
  onClaimSeasonRewards,
  onStartNextSeason,
  onNavigateCompetition,
  onOpenFinancePayroll,
}) => {
  const [claimingRewards, setClaimingRewards] = useState(false);
  const [startingNextSeason, setStartingNextSeason] = useState(false);
  const [confirmNextSeasonOpen, setConfirmNextSeasonOpen] = useState(false);
  const [claimFeedback, setClaimFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const playerLookup = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of effectiveAllPlayers) {
      map.set(p.id, p);
    }
    return map;
  }, [effectiveAllPlayers]);

  const clubLookup = useMemo(() => {
    const map = new Map<string, Club>();
    for (const c of CLUBS) {
      map.set(c.id, c);
    }
    return map;
  }, []);

  const sortedStandings = useMemo(() => sortStandings(career.standings), [career.standings]);
  const myStandingRow = useMemo(
    () => sortedStandings.find((r) => r.clubId === career.clubId),
    [sortedStandings, career.clubId]
  );
  const myClub = clubLookup.get(career.clubId) ?? CLUBS[0];
  const leagueChampionClub = clubLookup.get(sortedStandings[0]?.clubId ?? '') ?? CLUBS[0];
  const leagueRunnerUpClub = sortedStandings[1]
    ? clubLookup.get(sortedStandings[1].clubId)
    : undefined;

  const bundle = useMemo(() => computeSeasonEndRewardBundle(career), [career]);
  const payroll = useMemo(() => computeSeasonPayrollBreakdown(career), [career]);
  const isPayrollSettled = career.settledPayrollSeason === career.season;
  const leagueAwards = useMemo(() => resolveCompetitionAwards(career, 'league'), [career]);
  const ccAwards = useMemo(() => resolveCompetitionAwards(career, 'champions-cup'), [career]);
  const ncAwards = useMemo(() => resolveCompetitionAwards(career, 'national-cup'), [career]);
  const spotlights = useMemo(() => resolveLeagueIndividualSpotlights(career), [career]);

  const cc = career.competitions?.championsCup;
  const nc = career.competitions?.nationalCup;
  const sc = career.competitions?.superCup;
  const ccFinished = isCompetitionFinished(career, 'champions-cup');
  const ncFinished = isCompetitionFinished(career, 'national-cup');
  const scFinished = isCompetitionFinished(career, 'super-cup');

  const ccChamp = cc?.championClubId ? clubLookup.get(cc.championClubId) : undefined;
  const ncChamp = nc?.championClubId ? clubLookup.get(nc.championClubId) : undefined;
  const scChamp = sc?.championClubId ? clubLookup.get(sc.championClubId) : undefined;

  const nextSeasonLabel = getNextSeasonString(career.season);
  const totalPackCount =
    bundle.packs.legend_pack +
    bundle.packs.icon_pack +
    bundle.packs.elite_pack +
    bundle.packs.trophy_gift_box;

  const handleClaimClick = async () => {
    if (claimingRewards || bundle.alreadyClaimed) return;
    setClaimingRewards(true);
    setClaimFeedback(null);
    try {
      const res = await onClaimSeasonRewards();
      setClaimFeedback(res);
    } finally {
      setClaimingRewards(false);
    }
  };

  const currentYear = Number(career.season.slice(0, 4)) || 2026;
  const expiringCount = career.squad.filter((p) => p.contractUntil <= currentYear + 1).length;

  const handleNextSeasonClick = () => {
    if (startingNextSeason || !isPayrollSettled) return;
    setConfirmNextSeasonOpen(true);
  };

  const executeStartNextSeason = async () => {
    if (startingNextSeason) return;
    setStartingNextSeason(true);
    try {
      await onStartNextSeason();
      setConfirmNextSeasonOpen(false);
    } finally {
      setStartingNextSeason(false);
    }
  };

  const renderAwardPortrait = (
    playerId: string,
    clubId: string,
    fallbackName: string,
    size = 44
  ) => {
    const foundPlayer = playerLookup.get(playerId);
    const club = clubLookup.get(clubId) ?? CLUBS[0];
    if (foundPlayer) {
      return (
        <PlayerAvatar
          player={foundPlayer}
          club={club}
          size={size}
          showNumber={false}
          isUserCard={clubId === career.clubId}
        />
      );
    }
    return <ClubCrest club={club} size={size} aria-label={fallbackName} />;
  };

  const individualCards = [
    leagueAwards.mvp
      ? {
          key: 'mvp',
          awardTitle: 'Quả Bóng Vàng · MVP Mùa Giải',
          accentCls: 'border-amber-400/45 bg-gradient-to-br from-amber-500/15 via-[#121B24] to-[#0B1117]',
          titleCls: 'text-amber-300',
          icon: <Crown className="w-4 h-4 text-amber-400 shrink-0" />,
          playerId: leagueAwards.mvp.playerId,
          playerName: leagueAwards.mvp.playerName,
          clubId: leagueAwards.mvp.clubId,
          primaryMetric: `${leagueAwards.mvp.avgRating.toFixed(2)}★`,
          secondaryMetric: `${leagueAwards.mvp.motmCount} MOTM · ${leagueAwards.mvp.goals}B · ${leagueAwards.mvp.assists}KT`,
          isUser: leagueAwards.mvp.isUserPlayer,
        }
      : null,
    leagueAwards.topScorer
      ? {
          key: 'scorer',
          awardTitle: 'Chiếc Giày Vàng · Vua Phá Lưới',
          accentCls: 'border-emerald-400/40 bg-gradient-to-br from-emerald-500/15 via-[#121B24] to-[#0B1117]',
          titleCls: 'text-emerald-300',
          icon: <Award className="w-4 h-4 text-emerald-400 shrink-0" />,
          playerId: leagueAwards.topScorer.playerId,
          playerName: leagueAwards.topScorer.playerName,
          clubId: leagueAwards.topScorer.clubId,
          primaryMetric: `${leagueAwards.topScorer.goals} Bàn`,
          secondaryMetric: `${leagueAwards.topScorer.assists} KT · ${leagueAwards.topScorer.matches} trận`,
          isUser: leagueAwards.topScorer.isUserPlayer,
        }
      : null,
    spotlights.topAssister
      ? {
          key: 'assister',
          awardTitle: 'Vua Kiến Tạo · Playmaker',
          accentCls: 'border-sky-400/35 bg-gradient-to-br from-sky-500/12 via-[#121B24] to-[#0B1117]',
          titleCls: 'text-sky-300',
          icon: <Sparkles className="w-4 h-4 text-sky-400 shrink-0" />,
          playerId: spotlights.topAssister.playerId,
          playerName: spotlights.topAssister.playerName,
          clubId: spotlights.topAssister.clubId,
          primaryMetric: `${spotlights.topAssister.assists} Kiến tạo`,
          secondaryMetric: `${spotlights.topAssister.goals} bàn · ${spotlights.topAssister.avgRating.toFixed(2)}★`,
          isUser: spotlights.topAssister.clubId === career.clubId,
        }
      : null,
    spotlights.bestGoalkeeper
      ? {
          key: 'gk',
          awardTitle: 'Găng Tay Vàng · Thủ Môn Xuất Sắc',
          accentCls: 'border-violet-400/35 bg-gradient-to-br from-violet-500/12 via-[#121B24] to-[#0B1117]',
          titleCls: 'text-violet-300',
          icon: <Shield className="w-4 h-4 text-violet-400 shrink-0" />,
          playerId: spotlights.bestGoalkeeper.playerId,
          playerName: spotlights.bestGoalkeeper.playerName,
          clubId: spotlights.bestGoalkeeper.clubId,
          primaryMetric: `${spotlights.bestGoalkeeper.avgRating.toFixed(2)}★`,
          secondaryMetric: `${spotlights.bestGoalkeeper.motmCount ?? 0} MOTM · ${spotlights.bestGoalkeeper.matches ?? 0} trận`,
          isUser: spotlights.bestGoalkeeper.clubId === career.clubId,
        }
      : null,
  ].filter((x): x is NonNullable<typeof x> => Boolean(x));

  return (
    <div className="space-y-5">
      {/* 1. Gala Hero & Instant Season Reward Claim Hub */}
      <div className="rounded-2xl bg-gradient-to-br from-[#162230] via-[#121B24] to-[#0E161F] border border-amber-400/35 p-5 sm:p-6 space-y-5">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="flex items-start gap-3.5 min-w-0">
            <ClubCrest club={myClub} size={52} />
            <div className="min-w-0 space-y-1">
              <div className="flex flex-wrap items-center gap-2 text-xs text-amber-300 font-bold">
                <span>Lễ Tổng Kết Mùa Giải {career.season}</span>
                <span aria-hidden="true">·</span>
                <span className="text-emerald-300">
                  {bundle.isLeagueChampion ? 'Đương Kim Vô Địch' : `Hạng #${bundle.leagueRank} Super League`}
                </span>
              </div>
              <h3 className="font-display text-2xl sm:text-3xl font-extrabold text-white tracking-tight">
                {myClub.name} · Bảng Vàng &amp; Phần Thưởng
              </h3>
              <p className="text-xs text-slate-400">
                Nhận ngay gói thưởng kết thúc mùa giải vào ngân sách &amp; kho CLB, sau đó tiếp tục đá Cúp hoặc bước sang mùa {nextSeasonLabel}.
              </p>
            </div>
          </div>
          <Trophy className="w-11 h-11 text-amber-400 shrink-0 hidden sm:block" />
        </div>

        {/* 4 Primary Season KPI Tiles */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="rounded-xl bg-[#0B1117]/90 border border-white/10 p-3">
            <p className="text-[11px] text-slate-400">Thứ hạng CLB</p>
            <p className="font-mono-num tabular-nums text-xl font-extrabold text-emerald-400 mt-0.5">
              #{bundle.leagueRank}
            </p>
          </div>
          <div className="rounded-xl bg-[#0B1117]/90 border border-white/10 p-3">
            <p className="text-[11px] text-slate-400">Thành tích</p>
            <p className="font-mono-num tabular-nums text-base sm:text-lg font-extrabold text-white mt-0.5">
              {myStandingRow?.points ?? 0}đ ({myStandingRow?.won ?? 0}T-{myStandingRow?.drawn ?? 0}H-{myStandingRow?.lost ?? 0}B)
            </p>
          </div>
          <div className="rounded-xl bg-[#0B1117]/90 border border-white/10 p-3">
            <p className="text-[11px] text-slate-400">Ngân sách thưởng</p>
            <p className="font-mono-num tabular-nums text-xl font-extrabold text-amber-400 mt-0.5">
              +€{bundle.totalPrizeM}M
            </p>
          </div>
          <div className="rounded-xl bg-[#0B1117]/90 border border-white/10 p-3">
            <p className="text-[11px] text-slate-400">Mảnh &amp; Gói thẻ</p>
            <p className="font-mono-num tabular-nums text-lg font-extrabold text-sky-300 mt-0.5">
              +{bundle.totalShards} Mảnh · {totalPackCount} Gói
            </p>
          </div>
        </div>

        {/* Reward Vault Breakdown + Immediate Claim Button */}
        <div className="rounded-xl bg-[#0B1117] border border-emerald-500/30 p-4 space-y-3.5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-white/10 pb-3">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Gift className="w-4 h-4 text-amber-400" />
                Gói Phần Thưởng Tổng Kết Mùa {career.season}
              </h4>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Tiền mặt, Mảnh Ngôi Sao &amp; Gói thẻ cầu thủ được cộng trực tiếp ngay khi bấm nhận.
              </p>
            </div>
            <span
              className={`text-xs font-bold shrink-0 ${
                bundle.alreadyClaimed ? 'text-emerald-400' : 'text-amber-300'
              }`}
            >
              {bundle.alreadyClaimed ? 'Đã cộng vào kho CLB ✓' : 'Sẵn sàng nhận ngay'}
            </span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 text-xs">
            <div className="rounded-lg bg-[#121B24] border border-white/10 px-3 py-2.5 space-y-1">
              <p className="text-[11px] text-slate-400">Ngân sách Chuyển nhượng</p>
              <p className="font-mono-num tabular-nums text-base font-extrabold text-emerald-400">
                +€{bundle.totalPrizeM}M
              </p>
              <p className="text-[11px] text-slate-400">
                Hạng #{bundle.leagueRank}: €{bundle.basePrizeM}M · BLĐ: €{bundle.objBonusM}M · ĐHTB: €{bundle.totsBonusM}M
              </p>
            </div>
            <div className="rounded-lg bg-[#121B24] border border-white/10 px-3 py-2.5 space-y-1">
              <p className="text-[11px] text-slate-400">Mảnh Ngôi Sao (Nâng sao)</p>
              <p className="font-mono-num tabular-nums text-base font-extrabold text-amber-300">
                +{bundle.totalShards} Mảnh
              </p>
              <p className="text-[11px] text-slate-400">
                Cơ bản: {bundle.baseSeasonShards} · BLĐ: {bundle.objShards} · ĐHTB: {bundle.totsShards}
              </p>
            </div>
            <div className="rounded-lg bg-[#121B24] border border-white/10 px-3 py-2.5 space-y-1">
              <p className="text-[11px] text-slate-400">Gói thẻ &amp; Quà Danh hiệu</p>
              <p className="font-mono-num tabular-nums text-base font-extrabold text-sky-300">
                {totalPackCount} Gói thẻ Cao cấp
              </p>
              <p className="text-[11px] text-slate-300">
                {bundle.packs.legend_pack}× Legend · {bundle.packs.elite_pack}× Elite · {bundle.packs.trophy_gift_box}× Hộp Quà
                {bundle.packs.icon_pack > 0 ? ` · ${bundle.packs.icon_pack}× ICON (Vô địch)` : ''}
              </p>
            </div>
          </div>

          {claimFeedback && (
            <div
              className={`rounded-lg px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2 border ${
                claimFeedback.ok
                  ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                  : 'bg-amber-500/15 border-amber-400/40 text-amber-200'
              }`}
            >
              <CheckCircle2 className="w-4 h-4 shrink-0" />
              <span>{claimFeedback.message}</span>
            </div>
          )}

          {!isPayrollSettled && (
            <div className="rounded-lg bg-amber-500/10 border border-amber-400/35 px-3.5 py-2.5 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
              <div className="flex items-start gap-2 text-amber-200">
                <Coins className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                <span>
                  Bắt buộc <strong>Quyết toán Quỹ lương toàn CLB</strong> (€{payroll.totalPayrollM.toFixed(1)}M cho cầu thủ, HLV &amp; hậu cần) trước khi khởi tranh mùa {nextSeasonLabel}.
                </span>
              </div>
              {onOpenFinancePayroll && (
                <button
                  type="button"
                  onClick={onOpenFinancePayroll}
                  className="h-9 px-3.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shrink-0 whitespace-nowrap"
                >
                  Đi tới Quyết toán Lương
                </button>
              )}
            </div>
          )}

          <div className="flex flex-col sm:flex-row gap-2.5 pt-1">
            <button
              type="button"
              disabled={bundle.alreadyClaimed || claimingRewards}
              onClick={handleClaimClick}
              className={`flex-1 h-12 rounded-xl font-bold text-sm px-5 flex items-center justify-center gap-2 transition-colors whitespace-nowrap ${
                bundle.alreadyClaimed
                  ? 'bg-emerald-500/15 border border-emerald-500/45 text-emerald-300 cursor-default'
                  : 'bg-amber-400 hover:bg-amber-300 text-slate-950 shadow-lg shadow-amber-500/15 disabled:opacity-60'
              }`}
            >
              {bundle.alreadyClaimed ? (
                <>
                  <CheckCircle2 className="w-4 h-4 shrink-0" />
                  Đã Nhận Thưởng Mùa Giải {career.season}
                </>
              ) : (
                <>
                  <Gift className="w-4 h-4 shrink-0" />
                  {claimingRewards
                    ? 'Đang chuyển thưởng về CLB...'
                    : `Nhận Thưởng Mùa Giải Ngay (+€${bundle.totalPrizeM}M)`}
                </>
              )}
            </button>

            <button
              type="button"
              disabled={startingNextSeason || !isPayrollSettled}
              onClick={handleNextSeasonClick}
              className={`flex-1 h-12 rounded-xl font-bold text-sm px-5 flex items-center justify-center gap-2 whitespace-nowrap ${
                isPayrollSettled
                  ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-60'
                  : 'bg-[#121B24] border border-white/15 text-slate-400 cursor-not-allowed'
              }`}
            >
              {isPayrollSettled ? (
                <RefreshCw className={`w-4 h-4 shrink-0 ${startingNextSeason ? 'animate-spin' : ''}`} />
              ) : (
                <Lock className="w-4 h-4 shrink-0 text-amber-400" />
              )}
              {startingNextSeason
                ? `Đang khởi tạo mùa ${nextSeasonLabel}...`
                : isPayrollSettled
                  ? `Khởi Tranh Mùa ${nextSeasonLabel} (20 CLB)`
                  : `Cần Quyết Toán Lương Để Sang Mùa ${nextSeasonLabel}`}
            </button>
          </div>

          <p className="text-[11px] text-slate-400">
            {isPayrollSettled
              ? `Lương và thưởng mùa ${career.season} đã quyết toán xong. Bạn có thể đá nốt các giải Cúp hoặc khởi tranh mùa ${nextSeasonLabel} ngay.`
              : `Mẹo: Bấm "Nhận Thưởng Mùa Giải Ngay" để cộng ngân sách thưởng, sau đó vào Trang chủ → Tài chính để quyết toán lương toàn CLB trước khi sang mùa ${nextSeasonLabel}.`}
          </p>
        </div>
      </div>

      {/* 2. Collective Honors Gala (Danh hiệu Tập thể Mùa giải) */}
      <div className="rounded-2xl bg-[#121B24] border border-white/10 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-amber-400">Vinh Danh Tập Thể · Mùa {career.season}</p>
            <h4 className="font-display text-lg sm:text-xl font-extrabold text-white">
              Bảng Danh Hiệu Tập Thể &amp; Mục Tiêu CLB
            </h4>
          </div>
          <Trophy className="w-5 h-5 text-amber-400 shrink-0" />
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {/* Super League */}
          <div
            className={`rounded-xl p-3.5 border flex items-center justify-between gap-3 ${
              leagueChampionClub.id === career.clubId
                ? 'bg-amber-500/12 border-amber-400/45'
                : 'bg-[#0B1117] border-white/10'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              <ClubCrest club={leagueChampionClub} size={40} />
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-amber-400">Vô địch Super League</p>
                <p className="text-sm font-extrabold text-white truncate">
                  {leagueChampionClub.name}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {leagueRunnerUpClub ? `Á quân: ${leagueRunnerUpClub.shortName}` : ''} · Bạn: #{bundle.leagueRank} ({myStandingRow?.points ?? 0}đ)
                </p>
              </div>
            </div>
            <span className="font-mono-num text-xs font-bold text-amber-300 shrink-0">
              {leagueChampionClub.id === career.clubId ? 'Của bạn' : `${sortedStandings[0]?.points ?? 0}đ`}
            </span>
          </div>

          {/* Champions Cup */}
          <div
            className={`rounded-xl p-3.5 border flex items-center justify-between gap-3 ${
              ccChamp?.id === career.clubId
                ? 'bg-amber-500/12 border-amber-400/45'
                : 'bg-[#0B1117] border-white/10'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {ccChamp ? (
                <ClubCrest club={ccChamp} size={40} />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-[#121B24] border border-white/10 flex items-center justify-center shrink-0">
                  <Trophy className="w-5 h-5 text-sky-400" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-sky-400">Champions Cup (Cúp C1)</p>
                <p className="text-sm font-extrabold text-white truncate">
                  {ccChamp ? ccChamp.name : `Đang ở ${STAGE_LABEL_MAP[cc?.stage ?? 'group'] ?? 'Vòng bảng'}`}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {ccChamp
                    ? ccChamp.id === career.clubId
                      ? 'CLB bạn đăng quang ngôi vương châu lục'
                      : 'Nhà vô địch Cúp C1 mùa giải này'
                    : 'Chưa kết thúc vòng chung kết Cúp C1'}
                </p>
              </div>
            </div>
            {!ccFinished ? (
              <button
                type="button"
                onClick={() => onNavigateCompetition('champions-cup')}
                className="px-3 py-1.5 rounded-lg bg-sky-500/15 border border-sky-400/35 text-sky-300 text-xs font-bold shrink-0 hover:bg-sky-500/25"
              >
                Đá Cúp C1
              </button>
            ) : (
              <span className="text-xs font-bold text-emerald-400 shrink-0">Hoàn tất</span>
            )}
          </div>

          {/* National Cup */}
          <div
            className={`rounded-xl p-3.5 border flex items-center justify-between gap-3 ${
              ncChamp?.id === career.clubId
                ? 'bg-amber-500/12 border-amber-400/45'
                : 'bg-[#0B1117] border-white/10'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {ncChamp ? (
                <ClubCrest club={ncChamp} size={40} />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-[#121B24] border border-white/10 flex items-center justify-center shrink-0">
                  <Medal className="w-5 h-5 text-emerald-400" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-emerald-400">Cúp Quốc Gia</p>
                <p className="text-sm font-extrabold text-white truncate">
                  {ncChamp ? ncChamp.name : `Đang ở ${STAGE_LABEL_MAP[nc?.stage ?? 'r16'] ?? 'Vòng loại'}`}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {ncChamp
                    ? ncChamp.id === career.clubId
                      ? 'CLB bạn đoạt Cúp Quốc Gia'
                      : 'Nhà vô địch Cúp Quốc Gia'
                    : 'Chưa kết thúc giải Cúp Quốc Gia'}
                </p>
              </div>
            </div>
            {!ncFinished ? (
              <button
                type="button"
                onClick={() => onNavigateCompetition('national-cup')}
                className="px-3 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-400/35 text-emerald-300 text-xs font-bold shrink-0 hover:bg-emerald-500/25"
              >
                Đá Cúp QG
              </button>
            ) : (
              <span className="text-xs font-bold text-emerald-400 shrink-0">Hoàn tất</span>
            )}
          </div>

          {/* Super Cup */}
          <div
            className={`rounded-xl p-3.5 border flex items-center justify-between gap-3 ${
              scChamp?.id === career.clubId
                ? 'bg-amber-500/12 border-amber-400/45'
                : 'bg-[#0B1117] border-white/10'
            }`}
          >
            <div className="flex items-center gap-3 min-w-0">
              {scChamp ? (
                <ClubCrest club={scChamp} size={40} />
              ) : (
                <div className="w-10 h-10 rounded-xl bg-[#121B24] border border-white/10 flex items-center justify-center shrink-0">
                  <Award className="w-5 h-5 text-amber-400" />
                </div>
              )}
              <div className="min-w-0">
                <p className="text-[11px] font-bold text-amber-300">Siêu Cúp</p>
                <p className="text-sm font-extrabold text-white truncate">
                  {scChamp ? scChamp.name : 'Chưa thi đấu'}
                </p>
                <p className="text-[11px] text-slate-400 truncate">
                  {sc?.match.played
                    ? `Tỷ số: ${sc.match.homeGoals ?? 0}-${sc.match.awayGoals ?? 0}${
                        sc.match.penaltiesHome !== undefined
                          ? ` (Pen ${sc.match.penaltiesHome}-${sc.match.penaltiesAway})`
                          : ''
                      }`
                    : 'Trận tranh Siêu Cúp mở màn mùa'}
                </p>
              </div>
            </div>
            {!scFinished ? (
              <button
                type="button"
                onClick={() => onNavigateCompetition('special')}
                className="px-3 py-1.5 rounded-lg bg-amber-500/15 border border-amber-400/35 text-amber-300 text-xs font-bold shrink-0 hover:bg-amber-500/25"
              >
                Đấu ngay
              </button>
            ) : (
              <span className="text-xs font-bold text-emerald-400 shrink-0">Hoàn tất</span>
            )}
          </div>
        </div>

        {/* Board Objectives Final Summary */}
        <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2">
          <div className="flex items-center justify-between gap-2">
            <p className="text-xs font-bold text-white flex items-center gap-1.5">
              <Target className="w-4 h-4 text-emerald-400" />
              Tổng kết Mục tiêu Ban Lãnh Đạo
            </p>
            <span className="font-mono-num text-xs font-bold text-emerald-400">
              {bundle.completedObjectivesCount}/{bundle.evaluatedObjectives.length} hoàn thành
            </span>
          </div>
          <div className="divide-y divide-white/10">
            {bundle.evaluatedObjectives.map((obj) => {
              const ok = obj.status === 'completed';
              return (
                <div key={obj.id} className="py-2 first:pt-1 last:pb-0 flex items-center justify-between gap-3 text-xs">
                  <div className="flex items-center gap-2 min-w-0">
                    {ok ? (
                      <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                    ) : (
                      <XCircle className="w-4 h-4 text-rose-400 shrink-0" />
                    )}
                    <div className="min-w-0">
                      <p className={`font-semibold truncate ${ok ? 'text-white' : 'text-slate-300'}`}>
                        {obj.title}
                      </p>
                      <p className="text-[11px] text-slate-400 truncate">{obj.progressText}</p>
                    </div>
                  </div>
                  <span
                    className={`font-mono-num text-[11px] font-bold shrink-0 ${
                      ok ? 'text-emerald-400' : 'text-slate-500'
                    }`}
                  >
                    {ok ? `+€${obj.rewardBudgetM}M · +${obj.rewardShards} Mảnh` : 'Chưa đạt'}
                  </span>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* 3. Individual Awards Gala & Team of the Season */}
      <div className="rounded-2xl bg-[#121B24] border border-white/10 p-5 space-y-4">
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-emerald-400">Giải Thưởng Cá Nhân · Gala {career.season}</p>
            <h4 className="font-display text-lg sm:text-xl font-extrabold text-white">
              Bảng Vinh Danh Ngôi Sao &amp; Đội Hình Tiêu Biểu
            </h4>
          </div>
          <Crown className="w-5 h-5 text-amber-400 shrink-0" />
        </div>

        {/* Top 4 Major League Individual Awards */}
        {individualCards.length > 0 ? (
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {individualCards.map((item) => {
              const club = clubLookup.get(item.clubId) ?? CLUBS[0];
              return (
                <div
                  key={item.key}
                  className={`rounded-xl border p-3.5 flex items-center justify-between gap-3 ${item.accentCls}`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    {renderAwardPortrait(item.playerId, item.clubId, item.playerName, 46)}
                    <div className="min-w-0">
                      <p className={`text-[11px] font-bold flex items-center gap-1.5 ${item.titleCls}`}>
                        {item.icon}
                        <span className="truncate">{item.awardTitle}</span>
                      </p>
                      <p className="text-sm font-extrabold text-white truncate mt-0.5">
                        {item.playerName}
                        {item.isUser && <span className="text-[11px] text-emerald-400 ml-1">(CLB bạn)</span>}
                      </p>
                      <p className="text-[11px] text-slate-300 truncate">{club.name}</p>
                    </div>
                  </div>
                  <div className="text-right shrink-0">
                    <p className={`font-mono-num tabular-nums text-base font-extrabold ${item.titleCls}`}>
                      {item.primaryMetric}
                    </p>
                    <p className="font-mono-num tabular-nums text-[11px] text-slate-400">
                      {item.secondaryMetric}
                    </p>
                  </div>
                </div>
              );
            })}
          </div>
        ) : (
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-4 text-xs text-slate-400 text-center">
            Chưa có đủ dữ liệu thống kê cá nhân Super League trong mùa giải này.
          </div>
        )}

        {/* Cup Individual Honors + Club Internal MVP Row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3 space-y-1.5">
            <p className="text-[11px] font-bold text-sky-400">
              Cúp C1 · {ccFinished ? 'Danh hiệu Chính thức' : 'Dẫn đầu Hiện tại'}
            </p>
            <p className="text-xs text-slate-300 truncate">
              MVP:{' '}
              <strong className="text-white">
                {ccAwards.mvp ? `${ccAwards.mvp.playerName} (${ccAwards.mvp.avgRating.toFixed(2)}★)` : 'Chưa có'}
              </strong>
            </p>
            <p className="text-xs text-slate-300 truncate">
              Vua phá lưới:{' '}
              <strong className="text-emerald-400">
                {ccAwards.topScorer
                  ? `${ccAwards.topScorer.playerName} (${ccAwards.topScorer.goals}B)`
                  : 'Chưa có'}
              </strong>
            </p>
          </div>

          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3 space-y-1.5">
            <p className="text-[11px] font-bold text-emerald-400">
              Cúp QG · {ncFinished ? 'Danh hiệu Chính thức' : 'Dẫn đầu Hiện tại'}
            </p>
            <p className="text-xs text-slate-300 truncate">
              MVP:{' '}
              <strong className="text-white">
                {ncAwards.mvp ? `${ncAwards.mvp.playerName} (${ncAwards.mvp.avgRating.toFixed(2)}★)` : 'Chưa có'}
              </strong>
            </p>
            <p className="text-xs text-slate-300 truncate">
              Vua phá lưới:{' '}
              <strong className="text-emerald-400">
                {ncAwards.topScorer
                  ? `${ncAwards.topScorer.playerName} (${ncAwards.topScorer.goals}B)`
                  : 'Chưa có'}
              </strong>
            </p>
          </div>

          <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 space-y-1.5">
            <p className="text-[11px] font-bold text-emerald-300">
              Ngôi sao Nội bộ · {myClub.shortName}
            </p>
            <p className="text-xs text-slate-200 truncate">
              MVP CLB:{' '}
              <strong className="text-white">
                {spotlights.clubMvp
                  ? `${spotlights.clubMvp.playerName} (${spotlights.clubMvp.avgRating.toFixed(2)}★)`
                  : 'Chưa có'}
              </strong>
            </p>
            <p className="text-xs text-slate-200 truncate">
              Ghi bàn số 1:{' '}
              <strong className="text-amber-300">
                {spotlights.clubTopScorer
                  ? `${spotlights.clubTopScorer.playerName} (${spotlights.clubTopScorer.goals}B)`
                  : 'Chưa có'}
              </strong>
            </p>
          </div>
        </div>

        {/* Team of the Season (4-3-3) */}
        {bundle.teamOfTheSeason.length > 0 && (
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs font-bold text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-sky-400" />
                Đội Hình Tiêu Biểu Super League {career.season} (4-3-3)
              </p>
              <span className="text-[11px] font-semibold text-emerald-400">
                {bundle.userTotsPlayers.length > 0
                  ? `${bundle.userTotsPlayers.length} cầu thủ CLB bạn lọt ĐHTB (+€${bundle.totsBonusM}M · +${bundle.totsShards} Mảnh)`
                  : 'Mỗi cầu thủ CLB lọt ĐHTB thưởng +€2M & +10 Mảnh'}
              </span>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
              {bundle.teamOfTheSeason.map((tp) => {
                const tpClub = clubLookup.get(tp.clubId) ?? CLUBS[0];
                return (
                  <div
                    key={`season-tots-${tp.slotLabel}-${tp.clubId}-${tp.playerId}`}
                    className={`rounded-lg px-2.5 py-2 border flex items-center justify-between gap-2 ${
                      tp.isUserPlayer
                        ? 'bg-emerald-500/12 border-emerald-400/45'
                        : 'bg-[#121B24] border-white/10'
                    }`}
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      <span className="w-8 text-center py-0.5 rounded bg-[#0B1117] border border-white/10 font-mono-num text-[10px] font-bold text-amber-400 shrink-0">
                        {tp.slotLabel}
                      </span>
                      {renderAwardPortrait(tp.playerId, tp.clubId, tp.playerName, 30)}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {tp.shortName}
                          {tp.isUserPlayer && <span className="text-[10px] text-emerald-400 ml-1">★</span>}
                        </p>
                        <p className="text-[10px] text-slate-400 truncate">
                          {tpClub.shortName} · {tp.goals}B · {tp.assists}KT
                        </p>
                      </div>
                    </div>
                    <span className="font-mono-num tabular-nums text-xs font-extrabold text-amber-300 shrink-0">
                      {tp.avgRating.toFixed(2)}★
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>

      {/* 4. Quick Navigation to Remaining Cups & Friendly */}
      <div className="grid grid-cols-3 gap-2">
        <button
          type="button"
          onClick={() => onNavigateCompetition('champions-cup')}
          className="h-11 rounded-xl bg-[#121B24] border border-white/15 text-xs font-semibold text-white hover:border-emerald-400"
        >
          Đá Cúp C1
        </button>
        <button
          type="button"
          onClick={() => onNavigateCompetition('national-cup')}
          className="h-11 rounded-xl bg-[#121B24] border border-white/15 text-xs font-semibold text-white hover:border-emerald-400"
        >
          Đá Cúp QG
        </button>
        <button
          type="button"
          onClick={() => onNavigateCompetition('special')}
          className="h-11 rounded-xl bg-[#121B24] border border-white/15 text-xs font-semibold text-amber-300 hover:border-amber-400"
        >
          Giao hữu ngay
        </button>
      </div>
      <ConfirmActionModal
        open={confirmNextSeasonOpen}
        title={`Khởi tranh Mùa giải ${nextSeasonLabel}?`}
        description={
          <>
            <p>
              Bước sang mùa {nextSeasonLabel} sẽ tổng kết mùa {career.season}, tăng +1 tuổi cho các cầu thủ thuộc CLB và khởi tạo lịch thi đấu 20 đội mới.
            </p>
            {expiringCount > 0 && (
              <p className="text-rose-300 font-semibold">
                Lưu ý: Có {expiringCount} cầu thủ sắp hết hạn hợp đồng sẽ ra đi tự do nếu bạn chưa gia hạn!
              </p>
            )}
          </>
        }
        confirmLabel={`Khởi tranh Mùa ${nextSeasonLabel}`}
        tone={expiringCount > 0 ? 'amber' : 'emerald'}
        busy={startingNextSeason}
        onConfirm={executeStartNextSeason}
        onCancel={() => setConfirmNextSeasonOpen(false)}
      />
    </div>
  );
};
