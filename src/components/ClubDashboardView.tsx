import React, { useEffect, useMemo, useState } from 'react';
import {
  Award,
  Bell,
  Calendar,
  CheckCircle2,
  ChevronRight,
  Coins,
  Crown,
  Dumbbell,
  Gift,
  HeartPulse,
  History,
  Lock,
  PackageOpen,
  RefreshCw,
  Search,
  Shield,
  Star,
  Target,
  Trophy,
  UserCheck,
  UserMinus,
  UserPlus,
  Wallet,
  X,
  XCircle,
} from 'lucide-react';
import { CLUBS, REAL_MANAGERS } from '../data/footballDatabase';
import {
  calculateTacticalProfile,
  computeSeasonEndRewardBundle,
  evaluateBoardObjectives,
  getActiveCareerManager,
  getManagerHireFeeM,
  getManagerImpactSummary,
  getManagerSeveranceM,
  getNextSeasonString,
  getPlayerRecoveryCostM,
  getSquadRecoveryCostM,
  resolveLeagueTeamOfTheSeason,
  sortStandings,
} from '../lib/careerEngine';
import { getTotalUnopenedPacks } from '../lib/inventoryEngine';
import { ClubBackupBundle } from '../lib/backupEngine';
import { CareerSave, NewsArticle, Player, UserProfile } from '../types/game';
import { BackupRestoreCard } from './BackupRestoreCard';
import { ClubCrest, ManagerAvatar, PlayerAvatar } from './ClubBadgeAndAvatar';
import { ClubFinancePanel } from './ClubFinancePanel';
import { ClubRecordsPanel } from './ClubRecordsPanel';
import { YouthAcademyPanel } from './YouthAcademyPanel';
import { ClubEconomyManagementPanel } from './ClubEconomyManagementPanel';

interface ClubDashboardViewProps {
  profile: UserProfile;
  career: CareerSave;
  news: NewsArticle[];
  isAdmin?: boolean;
  pushPermission: NotificationPermission | 'unsupported';
  onEnablePush: () => Promise<void>;
  onNavigateTab: (tab: 'home' | 'tactics' | 'match' | 'transfers' | 'inventory' | 'club') => void;
  onSelectPlayer: (player: Player) => void;
  onUpdateTraining: (
    focus: CareerSave['trainingFocus'],
    intensity: CareerSave['trainingIntensity']
  ) => void;
  onRecoverPlayerFitness: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onRecoverSquadFitness: () => Promise<{ ok: boolean; message: string }>;
  onFireManager: () => Promise<{ ok: boolean; message: string }>;
  onHireManager: (
    managerId: string,
    applySuggestedTactics: boolean
  ) => Promise<{ ok: boolean; message: string }>;
  onClaimSeasonRewards?: () => Promise<{ ok: boolean; message: string }>;
  onSettleSeasonPayroll: () => Promise<{ ok: boolean; message: string }>;
  onStartNextSeason: () => Promise<void>;
  onUpgradeAcademy: () => Promise<{ ok: boolean; message: string }>;
  onExtraScoutAcademy: () => Promise<{ ok: boolean; message: string }>;
  onTrainAcademyProspect: (prospectId: string) => Promise<{ ok: boolean; message: string }>;
  onPromoteAcademyProspect: (prospectId: string) => Promise<{ ok: boolean; message: string }>;
  onReleaseAcademyProspect: (prospectId: string) => Promise<{ ok: boolean; message: string }>;
  onSelectSponsor: (sponsorId: string) => Promise<{ ok: boolean; message: string }>;
  onUpgradeFacility: (facilityType: 'stadium' | 'medical') => Promise<{ ok: boolean; message: string }>;
  onExtendContract: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  subTabRequest?: {
    tab: 'overview' | 'squad' | 'finance' | 'economy' | 'academy' | 'records' | 'training' | 'managers';
    nonce: number;
  } | null;
  onExportBackup: (includeAdminData: boolean) => Promise<void>;
  onRestoreBackup: (
    bundle: ClubBackupBundle,
    restoreAdminData: boolean
  ) => Promise<{ ok: boolean; message: string }>;
}

export const ClubDashboardView: React.FC<ClubDashboardViewProps> = ({
  profile,
  career,
  news,
  isAdmin = false,
  pushPermission,
  onEnablePush,
  onNavigateTab,
  onSelectPlayer,
  onUpdateTraining,
  onRecoverPlayerFitness,
  onRecoverSquadFitness,
  onFireManager,
  onHireManager,
  onClaimSeasonRewards,
  onSettleSeasonPayroll,
  onStartNextSeason,
  onUpgradeAcademy,
  onExtraScoutAcademy,
  onTrainAcademyProspect,
  onPromoteAcademyProspect,
  onReleaseAcademyProspect,
  onSelectSponsor,
  onUpgradeFacility,
  onExtendContract,
  subTabRequest,
  onExportBackup,
  onRestoreBackup,
}) => {
  const [clubSubTab, setClubSubTab] = useState<
    'overview' | 'squad' | 'finance' | 'economy' | 'academy' | 'records' | 'training' | 'managers'
  >('overview');

  useEffect(() => {
    if (subTabRequest?.tab) {
      setClubSubTab(subTabRequest.tab);
    }
  }, [subTabRequest]);
  const [startingSeason, setStartingSeason] = useState(false);
  const [claimingSeasonRewards, setClaimingSeasonRewards] = useState(false);
  const [seasonClaimFeedback, setSeasonClaimFeedback] = useState<{
    ok: boolean;
    message: string;
  } | null>(null);
  const [recoveringTarget, setRecoveringTarget] = useState<string | null>(null);
  const [recoveryFeedback, setRecoveryFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Manager recruitment / dismissal UI state
  const [managerFilter, setManagerFilter] = useState<'all' | 'free-agent' | 'employed'>('all');
  const [managerQuery, setManagerQuery] = useState('');
  const [confirmFireOpen, setConfirmFireOpen] = useState(false);
  const [selectedRecruitId, setSelectedRecruitId] = useState<string | null>(null);
  const [applyNewTactics, setApplyNewTactics] = useState(true);
  const [managerActionLoading, setManagerActionLoading] = useState(false);
  const [managerFeedback, setManagerFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  // Trophy Museum & Season Archive modal state
  const [showTrophyMuseum, setShowTrophyMuseum] = useState(false);
  const [museumTab, setMuseumTab] = useState<'trophies' | 'seasons' | 'tots'>('trophies');
  const [trophyFilter, setTrophyFilter] = useState<'all' | 'team' | 'individual'>('all');

  const club = CLUBS.find((c) => c.id === career.clubId) ?? CLUBS[0];
  const activeManager = useMemo(() => getActiveCareerManager(career), [career]);
  const managerImpact = useMemo(
    () => getManagerImpactSummary(activeManager, career.tactics),
    [activeManager, career.tactics]
  );
  const tacticalProfile = useMemo(
    () => calculateTacticalProfile(career.tactics, career.squad, activeManager),
    [career.tactics, career.squad, activeManager]
  );

  const sortedTable = useMemo(() => sortStandings(career.standings), [career.standings]);
  const myRank = sortedTable.findIndex((r) => r.clubId === career.clubId) + 1;
  const myRow = sortedTable.find((r) => r.clubId === career.clubId);

  const boardObjectives = useMemo(() => evaluateBoardObjectives(career, false), [career]);
  const projectedTots = useMemo(() => resolveLeagueTeamOfTheSeason(career), [career]);
  const seasonRewardBundle = useMemo(() => computeSeasonEndRewardBundle(career), [career]);

  const nextFixture = useMemo(
    () =>
      career.fixtures.find(
        (f) =>
          !f.played && (f.homeClubId === career.clubId || f.awayClubId === career.clubId)
      ),
    [career.fixtures, career.clubId]
  );
  const opponent = nextFixture
    ? CLUBS.find(
        (c) =>
          c.id ===
          (nextFixture.homeClubId === career.clubId
            ? nextFixture.awayClubId
            : nextFixture.homeClubId)
      )
    : undefined;
  const oppManager = REAL_MANAGERS.find((m) => m.id === opponent?.managerId);

  const totalWeeklyWages = useMemo(
    () => career.squad.reduce((sum, p) => sum + p.wageK, 0),
    [career.squad]
  );

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-8 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
        {[
          { id: 'overview', label: 'Tổng quan' },
          { id: 'squad', label: 'Đội hình' },
          { id: 'finance', label: 'Tài chính' },
          { id: 'economy', label: 'Kinh tế & Sân bãi' },
          { id: 'academy', label: 'Học viện Trẻ' },
          { id: 'records', label: 'Kỷ lục CLB' },
          { id: 'training', label: 'Tập luyện' },
          { id: 'managers', label: 'HLV & BHL' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setClubSubTab(t.id as typeof clubSubTab)}
            className={`h-10 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap px-2 ${
              clubSubTab === t.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {clubSubTab === 'overview' && (
        <div className="space-y-4 lg:grid lg:grid-cols-12 lg:gap-6 lg:space-y-0">
          {/* Hero Matchday & Club Banner */}
          <div className="lg:col-span-7 space-y-4">
            <div className="relative rounded-2xl overflow-hidden border border-white/15 min-h-[210px] flex flex-col justify-end p-5">
              <img
                src="/src/assets/images/stadium_pitch_hero_1795100242983.jpg"
                alt={club.stadium}
                referrerPolicy="no-referrer"
                className="absolute inset-0 w-full h-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-t from-[#0B1117] via-[#0B1117]/75 to-transparent" />

              <div className="relative z-10 space-y-3">
                <div className="flex items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ClubCrest club={club} size={46} />
                    <div className="min-w-0">
                      <p className="text-xs text-emerald-400 font-medium truncate">
                        Mùa {career.season} · Giám đốc {profile.managerName} ·{' '}
                        {activeManager ? `HLV ${activeManager.name}` : 'Chưa có HLV trưởng'}
                      </p>
                      <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white truncate">
                        {club.name}
                      </h2>
                    </div>
                  </div>
                  <div className="text-right">
                    <p className="text-[11px] text-slate-400">Hạng BXH</p>
                    <p className="font-mono-num text-2xl font-extrabold text-amber-400">
                      #{myRank || 1}
                    </p>
                  </div>
                </div>

                {nextFixture && opponent ? (
                  <div className="rounded-xl bg-[#0B1117]/85 backdrop-blur-md border border-white/10 p-3 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ClubCrest club={opponent} size={32} />
                      <div className="min-w-0">
                        <p className="text-[11px] text-slate-400">
                          Vòng {career.matchweek} · Đối đầu HLV {oppManager?.name}
                        </p>
                        <p className="text-sm font-bold text-white truncate">
                          {nextFixture.homeClubId === career.clubId ? 'Sân nhà vs ' : 'Sân khách @ '}
                          {opponent.name}
                        </p>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => onNavigateTab('match')}
                      className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0"
                    >
                      Vào trận
                    </button>
                  </div>
                ) : (
                  <div className="rounded-xl bg-[#0B1117]/90 backdrop-blur-md border border-amber-400/30 p-3 space-y-2.5">
                    <p className="text-xs text-amber-300 font-semibold">
                      Mùa giải VĐQG {career.season} đã khép lại (Hạng #{myRank}). Sẵn sàng nhận thưởng, xem Bảng Vinh Danh hoặc sang mùa mới!
                    </p>
                    {seasonClaimFeedback && (
                      <p
                        className={`text-[11px] font-semibold ${
                          seasonClaimFeedback.ok ? 'text-emerald-300' : 'text-amber-300'
                        }`}
                      >
                        {seasonClaimFeedback.message}
                      </p>
                    )}
                    <div className="flex flex-wrap items-center gap-2">
                      {onClaimSeasonRewards && (
                        <button
                          type="button"
                          disabled={seasonRewardBundle.alreadyClaimed || claimingSeasonRewards}
                          onClick={async () => {
                            setClaimingSeasonRewards(true);
                            setSeasonClaimFeedback(null);
                            try {
                              const res = await onClaimSeasonRewards();
                              setSeasonClaimFeedback(res);
                            } finally {
                              setClaimingSeasonRewards(false);
                            }
                          }}
                          className={`h-10 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 ${
                            seasonRewardBundle.alreadyClaimed
                              ? 'bg-emerald-500/15 border border-emerald-500/40 text-emerald-300'
                              : 'bg-amber-400 hover:bg-amber-300 text-slate-950 disabled:opacity-60'
                          }`}
                        >
                          {seasonRewardBundle.alreadyClaimed ? (
                            <>
                              <CheckCircle2 className="w-3.5 h-3.5" />
                              Đã nhận thưởng mùa
                            </>
                          ) : (
                            <>
                              <Gift className="w-3.5 h-3.5" />
                              {claimingSeasonRewards
                                ? 'Đang nhận...'
                                : `Nhận thưởng (+€${seasonRewardBundle.totalPrizeM}M)`}
                            </>
                          )}
                        </button>
                      )}
                      {career.settledPayrollSeason !== career.season && (
                        <button
                          type="button"
                          onClick={() => setClubSubTab('finance')}
                          className="h-10 px-3.5 rounded-xl bg-amber-500/20 border border-amber-400/50 text-amber-200 font-bold text-xs flex items-center gap-1.5"
                        >
                          <Coins className="w-3.5 h-3.5" />
                          Quyết toán Lương
                        </button>
                      )}
                      <button
                        type="button"
                        disabled={startingSeason || career.settledPayrollSeason !== career.season}
                        onClick={async () => {
                          setStartingSeason(true);
                          try {
                            await onStartNextSeason();
                          } finally {
                            setStartingSeason(false);
                          }
                        }}
                        className={`h-10 px-3.5 rounded-xl font-bold text-xs flex items-center gap-1.5 ${
                          career.settledPayrollSeason === career.season
                            ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950 disabled:opacity-60'
                            : 'bg-[#121B24] border border-white/15 text-slate-400 cursor-not-allowed'
                        }`}
                      >
                        {career.settledPayrollSeason === career.season ? (
                          <RefreshCw className={`w-3.5 h-3.5 ${startingSeason ? 'animate-spin' : ''}`} />
                        ) : (
                          <Lock className="w-3.5 h-3.5 text-amber-400" />
                        )}
                        Bước sang mùa {getNextSeasonString(career.season)} (20 CLB)
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('match')}
                        className="h-10 px-3.5 rounded-xl bg-amber-500/15 border border-amber-400/35 text-amber-300 font-bold text-xs"
                      >
                        Xem Giải Thưởng &amp; Đá Cúp
                      </button>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* 4 Key KPI Tiles */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-3.5">
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Wallet className="w-3.5 h-3.5 text-emerald-400" /> Chuyển nhượng
                </p>
                <p className="font-mono-num text-xl font-bold text-white mt-1">
                  €{career.transferBudget.toFixed(1)}M
                </p>
              </div>
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-3.5">
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Shield className="w-3.5 h-3.5 text-sky-400" /> Sức mạnh ĐH
                </p>
                <p className="font-mono-num text-xl font-bold text-emerald-400 mt-1">
                  {tacticalProfile.overall} OVR
                </p>
              </div>
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-3.5">
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" /> Điểm / Trận
                </p>
                <p className="font-mono-num text-xl font-bold text-white mt-1">
                  {myRow?.points ?? 0}đ / {myRow?.played ?? 0}
                </p>
              </div>
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-3.5">
                <p className="text-[11px] text-slate-400 flex items-center gap-1">
                  <Calendar className="w-3.5 h-3.5 text-emerald-400" /> Niềm tin BHL
                </p>
                <p className="font-mono-num text-xl font-bold text-amber-400 mt-1">
                  {career.boardConfidence}%
                </p>
              </div>
            </div>

            {/* Season Board Objectives Card */}
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between gap-2">
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Target className="w-4 h-4 text-emerald-400" />
                  Mục tiêu Mùa giải {career.season} (Ban Lãnh Đạo)
                </h3>
                <span className="font-mono-num text-[11px] font-bold text-emerald-400">
                  {boardObjectives.filter((o) => o.status === 'completed').length}/
                  {boardObjectives.length} đạt
                </span>
              </div>
              <div className="space-y-2">
                {boardObjectives.map((obj) => (
                  <div
                    key={obj.id}
                    className={`rounded-xl p-3 border flex items-start justify-between gap-3 ${
                      obj.status === 'completed'
                        ? 'bg-emerald-500/10 border-emerald-500/35'
                        : obj.status === 'failed'
                          ? 'bg-red-500/10 border-red-500/30'
                          : 'bg-[#0B1117] border-white/10'
                    }`}
                  >
                    <div className="flex items-start gap-2.5 min-w-0">
                      {obj.status === 'completed' ? (
                        <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
                      ) : obj.status === 'failed' ? (
                        <XCircle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                      ) : (
                        <Target className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
                      )}
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white">{obj.title}</p>
                        <p className="text-[11px] text-slate-400 mt-0.5">
                          {obj.progressText || obj.description}
                        </p>
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <span
                        className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                          obj.status === 'completed'
                            ? 'bg-emerald-500/20 text-emerald-300'
                            : obj.status === 'failed'
                              ? 'bg-red-500/20 text-red-300'
                              : 'bg-amber-500/15 text-amber-300'
                        }`}
                      >
                        {obj.status === 'completed'
                          ? 'Đạt mục tiêu'
                          : obj.status === 'failed'
                            ? 'Chưa đạt'
                            : 'Đang tiến hành'}
                      </span>
                      <p className="font-mono-num text-[10px] text-slate-400 mt-1">
                        +€{obj.rewardBudgetM}M · +{obj.rewardShards} Mảnh
                      </p>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Right Column: Push Alerts Opt-In, News Preview, Quick Tactics */}
          <div className="lg:col-span-5 space-y-4">
            {getTotalUnopenedPacks(career.inventory) > 0 && (
              <div className="rounded-2xl bg-amber-500/10 border border-amber-400/35 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white flex items-center gap-1.5">
                    <PackageOpen className="w-4 h-4 text-amber-400" />
                    Có {getTotalUnopenedPacks(career.inventory)} gói thẻ &amp; quà trong Túi đồ
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Mở thẻ cầu thủ, nhận Mảnh Ngôi Sao và ghép nâng sao cho đội hình!
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => onNavigateTab('inventory')}
                  className="h-10 px-3.5 rounded-xl bg-amber-400 text-slate-950 font-bold text-xs shrink-0"
                >
                  Mở túi đồ
                </button>
              </div>
            )}

            {pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
              <div className="rounded-2xl bg-emerald-500/10 border border-emerald-500/30 p-4 flex items-center justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-bold text-white flex items-center gap-1.5">
                    <Bell className="w-4 h-4 text-emerald-400" />
                    Bật Thông báo Đẩy
                  </p>
                  <p className="text-xs text-slate-300 mt-0.5">
                    Nhận thông báo tức thì khi có tin chuyển nhượng nóng hoặc thông báo mới.
                  </p>
                </div>
                <button
                  type="button"
                  onClick={onEnablePush}
                  className="h-10 px-3.5 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs shrink-0"
                >
                  Kích hoạt
                </button>
              </div>
            )}

            {/* Trophy Cabinet & Finances Card */}
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
              <div className="flex items-center gap-4">
                <img
                  src="/src/assets/images/trophy_showcase_1795100242925.jpg"
                  alt="Cúp vô địch Touchline XI"
                  referrerPolicy="no-referrer"
                  className="w-16 h-16 rounded-xl object-cover border border-white/10 shrink-0"
                />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs text-slate-400">Tài chính &amp; Quỹ lương</p>
                    <button
                      type="button"
                      onClick={() => setClubSubTab('finance')}
                      className="text-[11px] font-bold text-emerald-400 hover:underline flex items-center gap-0.5 shrink-0"
                    >
                      Sổ Thu – Chi <ChevronRight className="w-3 h-3" />
                    </button>
                  </div>
                  <p className="text-sm font-bold text-white">
                    Đang chi €{totalWeeklyWages.toLocaleString()}K / €{career.wageBudget.toLocaleString()}K tuần
                  </p>
                  <div className="h-1.5 rounded-full bg-slate-800 mt-2 overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full"
                      style={{
                        width: `${Math.min(100, Math.round((totalWeeklyWages / Math.max(1, career.wageBudget)) * 100))}%`,
                      }}
                    />
                  </div>
                </div>
              </div>

              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs gap-2">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  Phòng Truyền thống ({career.trophyCabinet?.length ?? 0} Cúp · {career.seasonHistory?.length ?? 0} mùa)
                </span>
                <div className="flex items-center gap-3 shrink-0">
                  <button
                    type="button"
                    onClick={() => setClubSubTab('records')}
                    className="text-xs font-bold text-amber-400 hover:underline flex items-center gap-0.5 shrink-0"
                  >
                    Huyền thoại &amp; Kỷ lục
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setMuseumTab('trophies');
                      setShowTrophyMuseum(true);
                    }}
                    className="text-xs font-bold text-emerald-400 hover:underline flex items-center gap-0.5 shrink-0"
                  >
                    Bảo tàng &amp; ĐHTB <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {career.trophyCabinet && career.trophyCabinet.length > 0 && (
                <div className="space-y-1.5">
                  {career.trophyCabinet.slice(0, 4).map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg bg-[#0B1117] border border-amber-400/20 px-3 py-1.5 text-xs text-amber-200 flex items-center justify-between gap-2"
                    >
                      <span className="truncate font-semibold flex items-center gap-1.5">
                        {t.awardType === 'mvp' ? (
                          <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        ) : t.awardType === 'top-scorer' ? (
                          <Award className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                        ) : (
                          <Trophy className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                        <span className="truncate">{t.title}</span>
                      </span>
                      <span className="font-mono-num text-[11px] text-amber-400 shrink-0">
                        {t.season}
                      </span>
                    </div>
                  ))}
                </div>
              )}

              {career.seasonAwards && career.seasonAwards.length > 0 && (
                <div className="pt-2 border-t border-white/10 space-y-1.5">
                  <p className="text-[11px] font-semibold text-slate-400">
                    Danh hiệu Cá nhân Giải đấu gần nhất
                  </p>
                  {career.seasonAwards.slice(0, 3).map((aw) => (
                    <div
                      key={aw.id}
                      className="rounded-lg bg-[#0B1117] border border-white/10 px-3 py-1.5 text-[11px] flex items-center justify-between gap-2"
                    >
                      <span className="text-slate-200 truncate">
                        <strong className={aw.awardType === 'mvp' ? 'text-amber-400' : 'text-emerald-400'}>
                          {aw.awardTitle}
                        </strong>{' '}
                        {aw.competitionTitle}: {aw.playerName}
                      </span>
                      <span className="font-mono-num text-slate-400 shrink-0">
                        {aw.awardType === 'mvp' ? `${aw.avgRating.toFixed(2)}★` : `${aw.goals} bàn`}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Latest Transfer Headlines */}
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-bold text-white">Tin mới nhất</h3>
                <button
                  type="button"
                  onClick={() => onNavigateTab('transfers')}
                  className="text-xs text-emerald-400 font-semibold flex items-center gap-0.5"
                >
                  Xem thị trường <ChevronRight className="w-3.5 h-3.5" />
                </button>
              </div>
              {news.length === 0 ? (
                <p className="text-xs text-slate-400">
                  Mở mục Chuyển nhượng để cập nhật tin tức thời gian thực mới nhất.
                </p>
              ) : (
                <div className="space-y-2">
                  {news.slice(0, 3).map((n) => (
                    <div key={n.id} className="rounded-xl bg-[#0B1117] p-3 border border-white/5">
                      <p className="text-[11px] text-amber-400">
                        {n.clubTag || n.category} {n.feeText ? `· ${n.feeText}` : ''}
                      </p>
                      <p className="text-xs font-semibold text-white mt-0.5 line-clamp-2">
                        {n.title}
                      </p>
                    </div>
                  ))}
                </div>
              )}
            </div>

            <BackupRestoreCard
              isAdmin={isAdmin}
              onExportBackup={onExportBackup}
              onRestoreBackup={onRestoreBackup}
            />
          </div>
        </div>
      )}

      {clubSubTab === 'finance' && (
        <ClubFinancePanel
          career={career}
          onSettleSeasonPayroll={onSettleSeasonPayroll}
          onClaimSeasonRewards={onClaimSeasonRewards}
          onStartNextSeason={onStartNextSeason}
        />
      )}

      {clubSubTab === 'economy' && (
        <ClubEconomyManagementPanel
          career={career}
          onSelectSponsor={onSelectSponsor}
          onUpgradeFacility={onUpgradeFacility}
          onExtendContract={onExtendContract}
        />
      )}

      {clubSubTab === 'academy' && (
        <YouthAcademyPanel
          career={career}
          onUpgradeAcademy={onUpgradeAcademy}
          onExtraScout={onExtraScoutAcademy}
          onTrainProspect={onTrainAcademyProspect}
          onPromoteProspect={onPromoteAcademyProspect}
          onReleaseProspect={onReleaseAcademyProspect}
        />
      )}

      {clubSubTab === 'records' && <ClubRecordsPanel career={career} />}

      {clubSubTab === 'squad' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
          {[...career.squad]
            .sort((a, b) => b.rating - a.rating)
            .map((p) => (
              <button
                key={p.id}
                type="button"
                onClick={() => onSelectPlayer(p)}
                className="w-full text-left rounded-2xl bg-[#121B24] border border-white/10 hover:border-emerald-500/40 p-3 flex items-center justify-between gap-3 min-h-[70px]"
              >
                <div className="flex items-center gap-3 min-w-0">
                  <PlayerAvatar player={p} club={club} size={46} isUserCard />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{p.name}</p>
                      <span className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded bg-slate-900 border border-white/10 text-[10px] font-mono-num font-bold text-amber-400 shrink-0">
                        <svg width="7" height="7" viewBox="0 0 8 8" aria-hidden="true">
                          <circle cx="4" cy="4" r="3.5" fill={club.primaryColor} stroke={club.accentColor} strokeWidth="1" />
                        </svg>
                        {club.shortName} · {p.stars ?? 1}
                        <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 truncate">
                      {p.position} · {p.age}t · Thể lực{' '}
                      <span className="font-mono-num text-emerald-400">{p.fitness}%</span> · Phong độ{' '}
                      <span
                        className={`font-mono-num font-semibold ${
                          p.form >= 8
                            ? 'text-emerald-400'
                            : p.form >= 6.8
                              ? 'text-sky-400'
                              : 'text-amber-400'
                        }`}
                      >
                        {p.form.toFixed(1)}
                      </span>
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono-num text-sm font-extrabold text-emerald-400">
                    {p.rating}
                  </p>
                  <p className="font-mono-num text-xs text-slate-400">€{p.marketValueM}M</p>
                </div>
              </button>
            ))}
        </div>
      )}

      {clubSubTab === 'training' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-5 space-y-5">
            <div className="flex items-center gap-2.5">
              <Dumbbell className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-base font-bold text-white">Trung tâm Huấn luyện & Thể lực</h3>
                <p className="text-xs text-slate-400">
                  Lựa chọn trọng tâm tập luyện giúp cải thiện phong độ và phục hồi thể lực giữa các vòng đấu.
                </p>
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Giáo án tuần này</label>
              <div className="grid grid-cols-2 sm:grid-cols-5 gap-2">
                {(['Tactical', 'Attacking', 'Defending', 'Physical', 'Recovery'] as const).map(
                  (focus) => (
                    <button
                      key={focus}
                      type="button"
                      onClick={() => onUpdateTraining(focus, career.trainingIntensity)}
                      className={`h-11 rounded-xl text-xs font-semibold border ${
                        career.trainingFocus === focus
                          ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                          : 'bg-[#0B1117] border-white/10 text-slate-300'
                      }`}
                    >
                      {focus === 'Recovery' ? 'Recovery (+Thể lực)' : focus}
                    </button>
                  )
                )}
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-xs font-semibold text-slate-300">Cường độ tập luyện</label>
              <div className="grid grid-cols-3 gap-2">
                {[
                  { id: 'light', label: 'Nhẹ nhàng (+Thể lực)' },
                  { id: 'balanced', label: 'Cân bằng' },
                  { id: 'intense', label: 'Cường độ cao (+OVR)' },
                ].map((item) => (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() =>
                      onUpdateTraining(
                        career.trainingFocus,
                        item.id as CareerSave['trainingIntensity']
                      )
                    }
                    className={`h-11 px-2 rounded-xl text-xs font-semibold border ${
                      career.trainingIntensity === item.id
                        ? 'bg-amber-500 border-amber-400 text-slate-950'
                        : 'bg-[#0B1117] border-white/10 text-slate-300'
                    }`}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>
          </div>

          {/* Paid Medical & Stamina Recovery Center */}
          {(() => {
            const avgFitness = Math.round(
              career.squad.reduce((sum, p) => sum + p.fitness, 0) / Math.max(1, career.squad.length)
            );
            const tiredList = [...career.squad]
              .filter((p) => p.fitness < 98)
              .sort((a, b) => a.fitness - b.fitness);
            const squadCostM = getSquadRecoveryCostM(career.squad);
            const allFull = career.squad.every((p) => p.fitness >= 100);

            return (
              <div className="rounded-2xl bg-[#121B24] border border-emerald-500/25 p-5 space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-start gap-2.5">
                    <HeartPulse className="w-5 h-5 text-emerald-400 shrink-0 mt-0.5" />
                    <div>
                      <h3 className="text-base font-bold text-white">
                        Phòng Y tế & Vật lý trị liệu (Trả phí)
                      </h3>
                      <p className="text-xs text-slate-400">
                        Bơm thể lực tức thì về 100% và tăng tinh thần bằng ngân sách CLB (€{career.transferBudget.toFixed(1)}M).
                      </p>
                    </div>
                  </div>
                  <div className="text-left sm:text-right shrink-0">
                    <p className="text-[11px] text-slate-400">Thể lực TB toàn đội</p>
                    <p className="font-mono-num text-xl font-extrabold text-emerald-400">
                      {avgFitness}%
                    </p>
                  </div>
                </div>

                {recoveryFeedback && (
                  <div
                    className={`rounded-xl p-3 text-xs border ${
                      recoveryFeedback.ok
                        ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                        : 'bg-red-500/15 border-red-500/30 text-red-200'
                    }`}
                  >
                    {recoveryFeedback.text}
                  </div>
                )}

                <button
                  type="button"
                  disabled={
                    recoveringTarget !== null ||
                    allFull ||
                    career.transferBudget < squadCostM
                  }
                  onClick={async () => {
                    setRecoveringTarget('squad');
                    setRecoveryFeedback(null);
                    try {
                      const res = await onRecoverSquadFitness();
                      setRecoveryFeedback({ ok: res.ok, text: res.message });
                    } finally {
                      setRecoveringTarget(null);
                    }
                  }}
                  className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <HeartPulse className="w-4 h-4" />
                  {allFull
                    ? 'Toàn đội đã đạt 100% thể lực'
                    : career.transferBudget < squadCostM
                      ? `Không đủ ngân sách (€${squadCostM}M)`
                      : recoveringTarget === 'squad'
                        ? 'Đang trị liệu toàn đội...'
                        : `Hồi phục toàn đội về 100% (-€${squadCostM}M)`}
                </button>

                {tiredList.length > 0 && (
                  <div className="space-y-2 pt-1">
                    <p className="text-xs font-semibold text-slate-300">
                      Trị liệu riêng từng cầu thủ ({tiredList.length} cầu thủ dưới 98%)
                    </p>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                      {tiredList.slice(0, 8).map((p) => {
                        const pCost = getPlayerRecoveryCostM(p.fitness);
                        return (
                          <div
                            key={p.id}
                            className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex items-center justify-between gap-2.5"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <PlayerAvatar player={p} club={club} size={38} isUserCard />
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{p.name}</p>
                                <p className="text-[11px] text-slate-400">
                                  {p.position} · Thể lực{' '}
                                  <span
                                    className={`font-mono-num font-bold ${
                                      p.fitness < 78
                                        ? 'text-red-400'
                                        : p.fitness < 88
                                          ? 'text-amber-400'
                                          : 'text-emerald-400'
                                    }`}
                                  >
                                    {p.fitness}%
                                  </span>
                                </p>
                              </div>
                            </div>
                            <button
                              type="button"
                              disabled={
                                recoveringTarget !== null ||
                                career.transferBudget < pCost
                              }
                              onClick={async () => {
                                setRecoveringTarget(p.id);
                                setRecoveryFeedback(null);
                                try {
                                  const res = await onRecoverPlayerFitness(p.id);
                                  setRecoveryFeedback({ ok: res.ok, text: res.message });
                                } finally {
                                  setRecoveringTarget(null);
                                }
                              }}
                              className="h-9 px-3 rounded-lg bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/35 text-emerald-300 font-mono-num text-[11px] font-bold shrink-0 disabled:opacity-50"
                            >
                              {recoveringTarget === p.id ? '...' : `+100% (€${pCost}M)`}
                            </button>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                )}
              </div>
            );
          })()}
        </div>
      )}

      {clubSubTab === 'managers' && (() => {
        const freeAgentCount = REAL_MANAGERS.filter((m) => m.clubId === 'free-agent').length;
        const employedCount = REAL_MANAGERS.length - freeAgentCount;
        const normalizedQuery = managerQuery.trim().toLowerCase();
        const filteredManagers = REAL_MANAGERS.filter((m) => {
          if (managerFilter === 'free-agent' && m.clubId !== 'free-agent') return false;
          if (managerFilter === 'employed' && m.clubId === 'free-agent') return false;
          if (!normalizedQuery) return true;
          const clubObj = CLUBS.find((c) => c.id === m.clubId);
          return (
            m.name.toLowerCase().includes(normalizedQuery) ||
            m.nationality.toLowerCase().includes(normalizedQuery) ||
            m.style.toLowerCase().includes(normalizedQuery) ||
            (m.specialty ?? '').toLowerCase().includes(normalizedQuery) ||
            (clubObj?.name ?? '').toLowerCase().includes(normalizedQuery)
          );
        }).sort((a, b) => {
          if (activeManager?.id === a.id) return -1;
          if (activeManager?.id === b.id) return 1;
          return b.tacticalRating - a.tacticalRating;
        });

        const severanceFee = activeManager ? getManagerSeveranceM(activeManager) : 0;

        return (
          <div className="space-y-4">
            {/* Active Head Coach Card */}
            <div
              className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
                activeManager
                  ? 'bg-[#121B24] border-emerald-500/35'
                  : 'bg-amber-500/10 border-amber-400/40'
              }`}
            >
              {activeManager ? (
                <>
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
                    <div className="flex items-center gap-3.5 min-w-0">
                      <ManagerAvatar manager={activeManager} size={60} />
                      <div className="min-w-0 space-y-0.5">
                        <p className="text-[11px] font-bold text-emerald-400 uppercase tracking-wider flex items-center gap-1.5">
                          <UserCheck className="w-3.5 h-3.5" />
                          HLV Trưởng đương nhiệm · {club.name}
                        </p>
                        <h3 className="font-display text-xl font-extrabold text-white truncate">
                          {activeManager.name}
                        </h3>
                        <p className="text-xs text-slate-300 truncate">
                          {activeManager.nationality} · {activeManager.age} tuổi · Sơ đồ sở trường{' '}
                          <span className="font-mono-num font-bold text-emerald-400">
                            {activeManager.preferredFormation}
                          </span>
                        </p>
                        <p className="text-[11px] text-amber-300 truncate">
                          {activeManager.specialty || activeManager.style}
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap sm:flex-col items-end justify-between gap-2 shrink-0">
                      <div className="text-left sm:text-right">
                        <p className="text-[11px] text-slate-400">Ảnh hưởng chiến thuật</p>
                        <p className="font-mono-num text-xs font-bold text-emerald-400">
                          +{managerImpact.atkBonus.toFixed(1)} ATK · +{managerImpact.midBonus.toFixed(1)} MID · +{managerImpact.defBonus.toFixed(1)} DEF
                        </p>
                        <p className="text-[11px] text-slate-400">
                          {managerImpact.formationMatch
                            ? 'Khớp sơ đồ sở trường (+4% Gắn kết)'
                            : `Gợi ý đổi sang ${activeManager.preferredFormation} để +4% Gắn kết`}
                        </p>
                      </div>

                      {!confirmFireOpen ? (
                        <button
                          type="button"
                          disabled={managerActionLoading}
                          onClick={() => {
                            setConfirmFireOpen(true);
                            setManagerFeedback(null);
                          }}
                          className="h-11 px-4 rounded-xl bg-red-500/15 hover:bg-red-500/25 border border-red-500/40 text-red-300 text-xs font-bold flex items-center gap-1.5"
                        >
                          <UserMinus className="w-4 h-4" />
                          Sa thải HLV
                        </button>
                      ) : (
                        <div className="rounded-xl bg-[#0B1117] border border-red-500/40 p-3 space-y-2 max-w-xs">
                          <p className="text-[11px] text-red-200">
                            Bồi thường hợp đồng <strong className="font-mono-num">-€{severanceFee}M</strong>. Đội sẽ tạm dùng HLV Tạm quyền (-1.5 chỉ số tuyến) tới khi bổ nhiệm người mới.
                          </p>
                          <div className="flex items-center gap-2">
                            <button
                              type="button"
                              disabled={managerActionLoading || career.transferBudget < severanceFee}
                              onClick={async () => {
                                setManagerActionLoading(true);
                                try {
                                  const res = await onFireManager();
                                  setManagerFeedback({ ok: res.ok, text: res.message });
                                  if (res.ok) setConfirmFireOpen(false);
                                } finally {
                                  setManagerActionLoading(false);
                                }
                              }}
                              className="flex-1 h-9 rounded-lg bg-red-500 text-white text-xs font-bold disabled:opacity-50"
                            >
                              {managerActionLoading ? 'Đang xử lý...' : 'Xác nhận sa thải'}
                            </button>
                            <button
                              type="button"
                              disabled={managerActionLoading}
                              onClick={() => setConfirmFireOpen(false)}
                              className="h-9 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                            >
                              Hủy
                            </button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>

                  <div className="grid grid-cols-3 gap-2 pt-2 border-t border-white/10 text-center">
                    <div className="rounded-xl bg-[#0B1117] p-2.5">
                      <p className="text-[10px] text-slate-400">Chiến thuật</p>
                      <p className="font-mono-num text-base font-extrabold text-emerald-400">
                        {activeManager.tacticalRating}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#0B1117] p-2.5">
                      <p className="text-[10px] text-slate-400">Quản trị phòng thay đồ</p>
                      <p className="font-mono-num text-base font-extrabold text-amber-400">
                        {activeManager.manManagement}
                      </p>
                    </div>
                    <div className="rounded-xl bg-[#0B1117] p-2.5">
                      <p className="text-[10px] text-slate-400">Hồi phục giữa vòng</p>
                      <p className="font-mono-num text-base font-extrabold text-sky-400">
                        +{managerImpact.recoveryBonus}%
                      </p>
                    </div>
                  </div>
                </>
              ) : (
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-bold text-amber-400 uppercase tracking-wide">
                      Ghế HLV trưởng đang trống · Tạm quyền
                    </p>
                    <h3 className="font-display text-lg font-bold text-white mt-0.5">
                      Hãy chiêu mộ HLV trưởng mới bên dưới
                    </h3>
                    <p className="text-xs text-amber-200/90 mt-1">
                      Khi chưa có HLV chính thức, đội bị giảm nhẹ (-1.5 ATK/MID/DEF, -6% Gắn kết). Ngân sách hiện có: <strong className="font-mono-num text-emerald-300">€{career.transferBudget.toFixed(1)}M</strong>.
                    </p>
                  </div>
                </div>
              )}
            </div>

            {managerFeedback && (
              <div
                className={`rounded-xl p-3 text-xs border ${
                  managerFeedback.ok
                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                    : 'bg-red-500/15 border-red-500/35 text-red-200'
                }`}
              >
                {managerFeedback.text}
              </div>
            )}

            {/* Search & Filter Toolbar */}
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-3.5 space-y-3">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
                <div className="relative flex-1">
                  <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    value={managerQuery}
                    onChange={(e) => setManagerQuery(e.target.value)}
                    placeholder="Tìm tên HLV, quốc tịch, phong cách hoặc CLB..."
                    className="w-full h-11 pl-9 pr-3 rounded-xl bg-[#0B1117] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500"
                  />
                </div>
                <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#0B1117] border border-white/10 shrink-0">
                  {[
                    { id: 'all', label: `Tất cả (${REAL_MANAGERS.length})` },
                    { id: 'free-agent', label: `Tự do (${freeAgentCount})` },
                    { id: 'employed', label: `CLB (${employedCount})` },
                  ].map((tab) => (
                    <button
                      key={tab.id}
                      type="button"
                      onClick={() => setManagerFilter(tab.id as typeof managerFilter)}
                      className={`h-9 px-2.5 rounded-lg text-[11px] font-semibold whitespace-nowrap ${
                        managerFilter === tab.id
                          ? 'bg-emerald-500 text-slate-950'
                          : 'text-slate-300'
                      }`}
                    >
                      {tab.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* Manager Market Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
              {filteredManagers.map((mgr) => {
                const isFreeAgent = mgr.clubId === 'free-agent';
                const mgrClub = !isFreeAgent ? CLUBS.find((c) => c.id === mgr.clubId) : undefined;
                const isCurrent = activeManager?.id === mgr.id;
                const hireFeeM = getManagerHireFeeM(mgr, career.clubId);
                const isRecruitingThis = selectedRecruitId === mgr.id;

                return (
                  <div
                    key={mgr.id}
                    className={`rounded-2xl border p-4 flex flex-col justify-between gap-3 ${
                      isCurrent
                        ? 'bg-emerald-500/10 border-emerald-500/45'
                        : 'bg-[#121B24] border-white/10'
                    }`}
                  >
                    <div className="flex items-start gap-3.5">
                      <ManagerAvatar manager={mgr} size={52} />
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center justify-between gap-1.5">
                          <div className="flex items-center gap-1.5 min-w-0">
                            {mgrClub ? (
                              <>
                                <ClubCrest club={mgrClub} size={16} />
                                <span className="text-[11px] text-sky-400 font-semibold truncate">
                                  {mgrClub.name}
                                </span>
                              </>
                            ) : (
                              <span className="text-[11px] text-emerald-400 font-bold truncate">
                                HLV Tự do · Sẵn sàng ký ngay
                              </span>
                            )}
                          </div>
                          <span className="font-mono-num text-[11px] font-bold text-amber-400 shrink-0">
                            €{hireFeeM}M
                          </span>
                        </div>

                        <p className="text-sm font-bold text-white truncate mt-0.5">{mgr.name}</p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {mgr.nationality} · {mgr.preferredFormation} · {mgr.style}
                        </p>
                        {mgr.specialty && (
                          <p className="text-[11px] text-emerald-300/90 truncate mt-0.5">
                            {mgr.specialty}
                          </p>
                        )}
                        <p className="text-[11px] font-mono-num text-slate-300 mt-1">
                          Chiến thuật <strong className="text-emerald-400">{mgr.tacticalRating}</strong> · Quản trị{' '}
                          <strong className="text-amber-400">{mgr.manManagement}</strong>
                        </p>
                      </div>
                    </div>

                    {isCurrent ? (
                      <div className="h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-1.5">
                        <UserCheck className="w-4 h-4" />
                        Đang dẫn dắt CLB của bạn
                      </div>
                    ) : isRecruitingThis ? (
                      <div className="rounded-xl bg-[#0B1117] border border-emerald-500/40 p-3 space-y-2.5">
                        <label className="flex items-start gap-2 text-[11px] text-slate-200 cursor-pointer">
                          <input
                            type="checkbox"
                            checked={applyNewTactics}
                            onChange={(e) => setApplyNewTactics(e.target.checked)}
                            className="mt-0.5 accent-emerald-500"
                          />
                          <span>
                            Áp dụng sơ đồ <strong className="text-emerald-400">{mgr.preferredFormation}</strong> &amp; triết lý của {mgr.name} cho đội hình
                          </span>
                        </label>
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            disabled={managerActionLoading || career.transferBudget < hireFeeM}
                            onClick={async () => {
                              setManagerActionLoading(true);
                              setManagerFeedback(null);
                              try {
                                const res = await onHireManager(mgr.id, applyNewTactics);
                                setManagerFeedback({ ok: res.ok, text: res.message });
                                if (res.ok) setSelectedRecruitId(null);
                              } finally {
                                setManagerActionLoading(false);
                              }
                            }}
                            className="flex-1 h-9 rounded-lg bg-emerald-500 text-slate-950 text-xs font-bold disabled:opacity-50"
                          >
                            {career.transferBudget < hireFeeM
                              ? `Thiếu €${hireFeeM}M`
                              : managerActionLoading
                                ? 'Đang ký...'
                                : `Bổ nhiệm (-€${hireFeeM}M)`}
                          </button>
                          <button
                            type="button"
                            disabled={managerActionLoading}
                            onClick={() => setSelectedRecruitId(null)}
                            className="h-9 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                          >
                            Hủy
                          </button>
                        </div>
                      </div>
                    ) : (
                      <button
                        type="button"
                        onClick={() => {
                          setSelectedRecruitId(mgr.id);
                          setApplyNewTactics(true);
                          setManagerFeedback(null);
                        }}
                        className="h-10 rounded-xl bg-[#0B1117] hover:bg-emerald-500 hover:text-slate-950 border border-white/15 hover:border-emerald-400 text-emerald-400 text-xs font-bold flex items-center justify-center gap-1.5 transition-colors"
                      >
                        <UserPlus className="w-4 h-4" />
                        Chiêu mộ (€{hireFeeM}M)
                      </button>
                    )}
                  </div>
                );
              })}
            </div>

            {/* Manager Change History */}
            {career.managerHistory && career.managerHistory.length > 0 && (
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-2.5">
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <History className="w-4 h-4 text-amber-400" />
                  Lịch sử Bổ nhiệm &amp; Sa thải HLV
                </h4>
                <div className="space-y-1.5">
                  {career.managerHistory.slice(0, 12).map((h) => (
                    <div
                      key={h.id}
                      className="rounded-xl bg-[#0B1117] border border-white/5 px-3 py-2 text-xs flex items-center justify-between gap-2"
                    >
                      <span className="text-slate-200 truncate">
                        <strong
                          className={
                            h.action === 'hired'
                              ? 'text-emerald-400'
                              : h.action === 'fired'
                                ? 'text-red-400'
                                : 'text-amber-400'
                          }
                        >
                          {h.action === 'hired'
                            ? 'Bổ nhiệm'
                            : h.action === 'fired'
                              ? 'Sa thải'
                              : 'Chấm dứt HĐ'}
                        </strong>{' '}
                        {h.managerName} · Mùa {h.season} (Vòng {h.matchweek})
                      </span>
                      <span className="font-mono-num text-[11px] text-slate-400 shrink-0">
                        -€{h.feeM}M
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        );
      })()}

      {/* Full Trophy Museum, Season History Archive & Team of the Season Modal */}
      {showTrophyMuseum && (() => {
        const allTrophies = career.trophyCabinet ?? [];
        const filteredTrophies = allTrophies.filter((t) => {
          const isIndividual = t.awardType === 'mvp' || t.awardType === 'top-scorer';
          if (trophyFilter === 'team') return !isIndividual;
          if (trophyFilter === 'individual') return isIndividual;
          return true;
        });
        const historyList = career.seasonHistory ?? [];

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="w-full sm:max-w-2xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[#121B24] border border-white/15 p-5 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                    {club.name}
                  </p>
                  <h3 className="font-display text-xl font-extrabold text-white flex items-center gap-2">
                    <Trophy className="w-5 h-5 text-amber-400" />
                    Bảo tàng Danh hiệu &amp; Lịch sử Mùa giải
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setShowTrophyMuseum(false)}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#0B1117] border border-white/10 text-slate-300 hover:text-white"
                  aria-label="Đóng bảo tàng danh hiệu"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1.5 p-1 rounded-xl bg-[#0B1117] border border-white/10">
                {[
                  { id: 'trophies', label: `Phòng Cúp (${allTrophies.length})` },
                  { id: 'seasons', label: `Lịch sử mùa (${historyList.length})` },
                  { id: 'tots', label: `ĐHTB ${career.season}` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setMuseumTab(tab.id as typeof museumTab)}
                    className={`h-10 rounded-lg text-xs font-bold transition-colors ${
                      museumTab === tab.id
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {museumTab === 'trophies' && (
                <div className="space-y-3">
                  <div className="flex items-center gap-2">
                    {[
                      { id: 'all', label: `Tất cả (${allTrophies.length})` },
                      {
                        id: 'team',
                        label: `Danh hiệu CLB (${allTrophies.filter((t) => t.awardType !== 'mvp' && t.awardType !== 'top-scorer').length})`,
                      },
                      {
                        id: 'individual',
                        label: `Cá nhân (${allTrophies.filter((t) => t.awardType === 'mvp' || t.awardType === 'top-scorer').length})`,
                      },
                    ].map((f) => (
                      <button
                        key={f.id}
                        type="button"
                        onClick={() => setTrophyFilter(f.id as typeof trophyFilter)}
                        className={`px-3 h-8 rounded-lg text-xs font-semibold border ${
                          trophyFilter === f.id
                            ? 'bg-amber-400 text-slate-950 border-amber-300'
                            : 'bg-[#0B1117] border-white/10 text-slate-300'
                        }`}
                      >
                        {f.label}
                      </button>
                    ))}
                  </div>

                  {filteredTrophies.length === 0 ? (
                    <div className="rounded-xl bg-[#0B1117] border border-white/10 p-8 text-center text-xs text-slate-400">
                      Chưa có danh hiệu nào trong hạng mục này. Hãy chinh phục Super League, Cúp C1, Cúp Quốc Gia và các giải thưởng cá nhân!
                    </div>
                  ) : (
                    <div className="space-y-2 max-h-[380px] overflow-y-auto pr-1">
                      {filteredTrophies.map((t) => {
                        const isMvp = t.awardType === 'mvp';
                        const isScorer = t.awardType === 'top-scorer';
                        return (
                          <div
                            key={t.id}
                            className="rounded-xl bg-[#0B1117] border border-amber-400/25 px-3.5 py-2.5 flex items-center justify-between gap-3"
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              {isMvp ? (
                                <Crown className="w-4 h-4 text-amber-400 shrink-0" />
                              ) : isScorer ? (
                                <Award className="w-4 h-4 text-emerald-400 shrink-0" />
                              ) : (
                                <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                              )}
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">{t.title}</p>
                                <p className="text-[11px] text-slate-400">
                                  {isMvp
                                    ? 'Danh hiệu Cá nhân · MVP'
                                    : isScorer
                                      ? 'Danh hiệu Cá nhân · Vua phá lưới'
                                      : 'Danh hiệu Tập thể CLB'}
                                </p>
                              </div>
                            </div>
                            <span className="font-mono-num text-xs font-bold text-amber-400 shrink-0">
                              {t.season}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {museumTab === 'seasons' && (
                <div className="space-y-3 max-h-[420px] overflow-y-auto pr-1">
                  {historyList.length === 0 ? (
                    <div className="rounded-xl bg-[#0B1117] border border-white/10 p-8 text-center text-xs text-slate-400">
                      Chưa có mùa giải nào hoàn tất. Lịch sử chi tiết sẽ được lưu khi bạn bước sang mùa giải mới.
                    </div>
                  ) : (
                    historyList.map((rec) => {
                      const champClub = CLUBS.find((c) => c.id === rec.championClubId);
                      const ccChamp = rec.championsCupWinnerId
                        ? CLUBS.find((c) => c.id === rec.championsCupWinnerId)
                        : undefined;
                      const ncChamp = rec.nationalCupWinnerId
                        ? CLUBS.find((c) => c.id === rec.nationalCupWinnerId)
                        : undefined;
                      return (
                        <div
                          key={`${rec.season}-${rec.clubId}`}
                          className="rounded-2xl bg-[#0B1117] border border-white/10 p-4 space-y-2.5"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <div className="flex items-center gap-2">
                              <span className="px-2.5 py-0.5 rounded-lg bg-emerald-500/20 text-emerald-300 font-mono-num text-xs font-extrabold">
                                Mùa {rec.season}
                              </span>
                              <span className="text-xs font-bold text-white">
                                Hạng #{rec.leagueRank} · {rec.points}đ
                              </span>
                            </div>
                            {rec.totalObjectivesCount !== undefined && (
                              <span className="text-[11px] font-mono-num text-amber-400 font-semibold">
                                Mục tiêu: {rec.completedObjectivesCount ?? 0}/{rec.totalObjectivesCount}
                              </span>
                            )}
                          </div>

                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 text-[11px]">
                            <div className="rounded-lg bg-[#121B24] px-2.5 py-1.5">
                              <span className="text-slate-400 block">VĐQG Super League</span>
                              <span className="font-bold text-amber-300">
                                {champClub?.name ?? rec.championClubId}
                              </span>
                            </div>
                            <div className="rounded-lg bg-[#121B24] px-2.5 py-1.5">
                              <span className="text-slate-400 block">Cúp C1</span>
                              <span className="font-bold text-white">
                                {ccChamp?.shortName ?? 'Chưa kết thúc'}
                              </span>
                            </div>
                            <div className="rounded-lg bg-[#121B24] px-2.5 py-1.5">
                              <span className="text-slate-400 block">Cúp Quốc Gia</span>
                              <span className="font-bold text-white">
                                {ncChamp?.shortName ?? 'Chưa kết thúc'}
                              </span>
                            </div>
                          </div>

                          <div className="flex flex-wrap gap-3 text-[11px] text-slate-300">
                            <span>
                              Vua phá lưới: <strong className="text-emerald-400">{rec.topScorerName}</strong> ({rec.topScorerGoals} bàn)
                            </span>
                            {rec.mvpPlayerName && (
                              <span>
                                MVP: <strong className="text-amber-400">{rec.mvpPlayerName}</strong> ({rec.mvpAvgRating?.toFixed(2)}★)
                              </span>
                            )}
                          </div>

                          {rec.trophiesWon.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-1">
                              {rec.trophiesWon.map((tw, idx) => (
                                <span
                                  key={idx}
                                  className="px-2 py-0.5 rounded bg-amber-500/15 border border-amber-400/30 text-[10px] font-semibold text-amber-300"
                                >
                                  🏆 {tw}
                                </span>
                              ))}
                            </div>
                          )}

                          {rec.teamOfTheSeason && rec.teamOfTheSeason.length > 0 && (
                            <div className="pt-2 border-t border-white/10 space-y-1.5">
                              <p className="text-[11px] font-bold text-sky-400">
                                Đội hình Tiêu biểu mùa {rec.season} (4-3-3)
                              </p>
                              <div className="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
                                {rec.teamOfTheSeason.map((tp) => (
                                  <div
                                    key={`${rec.season}-${tp.clubId}-${tp.playerId}`}
                                    className={`rounded-lg px-2 py-1 text-[10px] border flex items-center justify-between gap-1 ${
                                      tp.isUserPlayer
                                        ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                                        : 'bg-[#121B24] border-white/5 text-slate-300'
                                    }`}
                                  >
                                    <span className="truncate">
                                      <strong className="font-mono-num text-amber-400 mr-1">
                                        {tp.slotLabel}
                                      </strong>
                                      {tp.shortName}
                                    </span>
                                    <span className="font-mono-num font-bold shrink-0">
                                      {tp.avgRating.toFixed(1)}★
                                    </span>
                                  </div>
                                ))}
                              </div>
                            </div>
                          )}
                        </div>
                      );
                    })
                  )}
                </div>
              )}

              {museumTab === 'tots' && (
                <div className="space-y-3">
                  <div className="rounded-xl bg-sky-500/10 border border-sky-400/30 p-3 text-xs text-sky-200">
                    <strong>Đội hình Tiêu biểu Dự kiến (4-3-3)</strong> dựa trên thống kê Super League mùa {career.season}. Kết thúc mùa, mỗi cầu thủ CLB của bạn lọt TOTS mang về thêm <strong>+€2M &amp; +10 Mảnh Ngôi Sao</strong>!
                  </div>

                  {projectedTots.length === 0 ? (
                    <div className="rounded-xl bg-[#0B1117] border border-white/10 p-8 text-center text-xs text-slate-400">
                      Hãy thi đấu ít nhất 1 vòng Super League để hệ thống tổng hợp Đội hình Tiêu biểu 4-3-3.
                    </div>
                  ) : (
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-[360px] overflow-y-auto pr-1">
                      {projectedTots.map((tp) => {
                        const tpClub = CLUBS.find((c) => c.id === tp.clubId);
                        return (
                          <div
                            key={`proj-tots-${tp.clubId}-${tp.playerId}`}
                            className={`rounded-xl px-3 py-2.5 border flex items-center justify-between gap-2 ${
                              tp.isUserPlayer
                                ? 'bg-emerald-500/15 border-emerald-500/45'
                                : 'bg-[#0B1117] border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2.5 min-w-0">
                              <span className="w-9 text-center py-0.5 rounded bg-[#121B24] border border-white/10 font-mono-num text-[10px] font-bold text-amber-400 shrink-0">
                                {tp.slotLabel}
                              </span>
                              <div className="min-w-0">
                                <p className="text-xs font-bold text-white truncate">
                                  {tp.playerName}{' '}
                                  {tp.isUserPlayer && (
                                    <span className="text-[10px] text-emerald-400">(CLB bạn)</span>
                                  )}
                                </p>
                                <p className="text-[11px] text-slate-400 truncate">
                                  {tpClub?.shortName ?? tp.clubId} · {tp.goals}B · {tp.assists}KT ({tp.matches} trận)
                                </p>
                              </div>
                            </div>
                            <span className="px-2 py-0.5 rounded bg-amber-400/20 text-amber-300 font-mono-num text-xs font-extrabold shrink-0">
                              {tp.avgRating.toFixed(2)}★
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
};
