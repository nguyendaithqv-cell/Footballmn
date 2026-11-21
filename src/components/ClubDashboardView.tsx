import React, { useMemo, useState } from 'react';
import { Bell, Calendar, ChevronRight, Dumbbell, HeartPulse, PackageOpen, RefreshCw, Shield, Star, Trophy, Wallet } from 'lucide-react';
import { CLUBS, REAL_MANAGERS } from '../data/footballDatabase';
import {
  calculateTacticalProfile,
  getNextSeasonString,
  getPlayerRecoveryCostM,
  getSquadRecoveryCostM,
  sortStandings,
} from '../lib/careerEngine';
import { getTotalUnopenedPacks } from '../lib/inventoryEngine';
import { ClubBackupBundle } from '../lib/backupEngine';
import { CareerSave, NewsArticle, Player, UserProfile } from '../types/game';
import { BackupRestoreCard } from './BackupRestoreCard';
import { ClubCrest, ManagerAvatar, PlayerAvatar } from './ClubBadgeAndAvatar';

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
  onStartNextSeason: () => Promise<void>;
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
  onStartNextSeason,
  onExportBackup,
  onRestoreBackup,
}) => {
  const [clubSubTab, setClubSubTab] = useState<'overview' | 'squad' | 'training' | 'managers'>(
    'overview'
  );
  const [startingSeason, setStartingSeason] = useState(false);
  const [recoveringTarget, setRecoveringTarget] = useState<string | null>(null);
  const [recoveryFeedback, setRecoveryFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const club = CLUBS.find((c) => c.id === career.clubId) ?? CLUBS[0];
  const tacticalProfile = useMemo(
    () => calculateTacticalProfile(career.tactics, career.squad),
    [career.tactics, career.squad]
  );

  const sortedTable = useMemo(() => sortStandings(career.standings), [career.standings]);
  const myRank = sortedTable.findIndex((r) => r.clubId === career.clubId) + 1;
  const myRow = sortedTable.find((r) => r.clubId === career.clubId);

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
      <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
        {[
          { id: 'overview', label: 'Tổng quan' },
          { id: 'squad', label: 'Đội hình' },
          { id: 'training', label: 'Tập luyện' },
          { id: 'managers', label: 'HLV Thực' },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setClubSubTab(t.id as typeof clubSubTab)}
            className={`h-10 rounded-lg text-xs font-semibold transition-colors ${
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
                  <div className="flex items-center gap-3">
                    <ClubCrest club={club} size={46} />
                    <div>
                      <p className="text-xs text-emerald-400 font-medium">
                        Mùa {career.season} · HLV {profile.managerName} · {club.stadium}
                      </p>
                      <h2 className="font-display text-2xl sm:text-3xl font-extrabold text-white">
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
                      Mùa giải VĐQG {career.season} đã khép lại (Hạng #{myRank}). Sẵn sàng sang mùa mới hoặc chinh phục các giải Cúp!
                    </p>
                    <div className="flex flex-wrap items-center gap-2">
                      <button
                        type="button"
                        disabled={startingSeason}
                        onClick={async () => {
                          setStartingSeason(true);
                          try {
                            await onStartNextSeason();
                          } finally {
                            setStartingSeason(false);
                          }
                        }}
                        className="h-10 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 disabled:opacity-60"
                      >
                        <RefreshCw className={`w-3.5 h-3.5 ${startingSeason ? 'animate-spin' : ''}`} />
                        Bước sang mùa {getNextSeasonString(career.season)} (20 CLB)
                      </button>
                      <button
                        type="button"
                        onClick={() => onNavigateTab('match')}
                        className="h-10 px-3.5 rounded-xl bg-amber-500/15 border border-amber-400/35 text-amber-300 font-bold text-xs"
                      >
                        Đá Cúp & Giao hữu
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
                  <p className="text-xs text-slate-400">Tài chính & Quỹ lương</p>
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

              <div className="pt-2 border-t border-white/10 flex items-center justify-between text-xs">
                <span className="text-slate-400 flex items-center gap-1.5">
                  <Trophy className="w-3.5 h-3.5 text-amber-400" />
                  Phòng Truyền thống
                </span>
                <span className="font-mono-num font-bold text-amber-400">
                  {career.trophyCabinet?.length ?? 0} Cúp · {career.seasonHistory?.length ?? 0} mùa đã đấu
                </span>
              </div>

              {career.trophyCabinet && career.trophyCabinet.length > 0 && (
                <div className="space-y-1.5">
                  {career.trophyCabinet.slice(0, 3).map((t) => (
                    <div
                      key={t.id}
                      className="rounded-lg bg-[#0B1117] border border-amber-400/20 px-3 py-1.5 text-xs text-amber-200 flex items-center justify-between"
                    >
                      <span className="truncate font-semibold">{t.title}</span>
                      <span className="font-mono-num text-[11px] text-amber-400 shrink-0 ml-2">
                        {t.season}
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
                  <PlayerAvatar player={p} club={club} size={46} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-1.5 min-w-0">
                      <p className="text-sm font-bold text-white truncate">{p.name}</p>
                      <span className="inline-flex items-center gap-0.5 text-[11px] font-mono-num font-bold text-amber-400 shrink-0">
                        {p.stars ?? 1}
                        <Star className="w-3 h-3 fill-amber-400 text-amber-400" />
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
                              <PlayerAvatar player={p} club={club} size={38} />
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

      {clubSubTab === 'managers' && (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {REAL_MANAGERS.map((mgr) => {
            const mgrClub = CLUBS.find((c) => c.id === mgr.clubId) ?? CLUBS[0];
            return (
              <div
                key={mgr.id}
                className="rounded-2xl bg-[#121B24] border border-white/10 p-4 flex items-center gap-3.5"
              >
                <ManagerAvatar manager={mgr} size={52} />
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <ClubCrest club={mgrClub} size={18} />
                    <span className="text-xs text-emerald-400 font-semibold truncate">
                      {mgrClub.name}
                    </span>
                  </div>
                  <p className="text-sm font-bold text-white truncate mt-0.5">{mgr.name}</p>
                  <p className="text-[11px] text-slate-400 truncate">
                    {mgr.preferredFormation} · {mgr.style}
                  </p>
                  <p className="text-[11px] font-mono-num text-amber-400 mt-0.5">
                    Chiến thuật {mgr.tacticalRating} · Quản trị {mgr.manManagement}
                  </p>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
