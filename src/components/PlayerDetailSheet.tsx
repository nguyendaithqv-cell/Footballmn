import React, { useState, useEffect } from 'react';
import {
  AlertTriangle,
  ArrowLeftRight,
  ArrowUpCircle,
  Award,
  Ban,
  CheckCircle2,
  Crown,
  DollarSign,
  HeartPulse,
  Shield,
  Sparkles,
  Star,
  Stethoscope,
  Trophy,
  UserCheck,
  UserX,
  X,
} from 'lucide-react';
import { getClubById, getIconShardCost } from '../data/footballDatabase';
import {
  getInjurySeverityLabel,
  getInjuryTreatmentCostM,
  getLoanInTerms,
  getLoanOutTerms,
  getPlayerRecoveryCostM,
  isPlayerInjured,
  isPlayerSuspended,
} from '../lib/careerEngine';
import {
  getContractRenewalCostK,
  getPlayerAccruedWageM,
  getPlayerContractCompensationM,
} from '../lib/economyEngine';
import {
  FITNESS_BOOSTER_RECOVERY,
  getStarUpgradePlan,
  normalizeInventory,
} from '../lib/inventoryEngine';
import {
  CareerSave,
  CompetitionAwardWinner,
  InventoryState,
  Player,
  SeasonRecord,
  TrophyItem,
} from '../types/game';
import { ClubCrest, PlayerAvatar } from './ClubBadgeAndAvatar';
import { ConfirmActionModal } from './ConfirmActionModal';

interface PlayerDetailSheetProps {
  player: Player;
  isOwnPlayer: boolean;
  isFreeAgent?: boolean;
  isPreviewOnly?: boolean;
  career?: CareerSave;
  transferBudgetM: number;
  currentYear?: number;
  medicalLevel?: 1 | 2 | 3;
  squadLength?: number;
  inventory?: InventoryState;
  trophyCabinet?: TrophyItem[];
  seasonAwards?: CompetitionAwardWinner[];
  seasonHistory?: SeasonRecord[];
  onClose: () => void;
  onToggleTransferList?: (
    playerId: string,
    askingPriceM?: number,
    mode?: 'toggle' | 'update_price'
  ) => Promise<{ ok: boolean; message: string }> | void;
  onSellPlayer?: (playerId: string) => Promise<{ ok: boolean; message: string }> | void;
  onDismissPlayer?: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onRenewContract?: (playerId: string, years?: 1 | 2 | 3 | 4) => void;
  onRecoverFitness?: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onTreatInjury?: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onUseFitnessBooster?: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onUpgradeStar?: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onMakeOffer?: (player: Player, bidM: number, wageK: number) => Promise<{ ok: boolean; message: string }>;
  onSignFreeAgent?: (player: Player, years?: 1 | 2 | 3 | 4) => Promise<{ ok: boolean; message: string }>;
  onLoanInPlayer?: (player: Player) => Promise<{ ok: boolean; message: string }>;
  onLoanOutPlayer?: (playerId: string) => Promise<{ ok: boolean; message: string }>;
}

export const PlayerDetailSheet: React.FC<PlayerDetailSheetProps> = ({
  player,
  isOwnPlayer,
  isFreeAgent = false,
  isPreviewOnly = false,
  career,
  transferBudgetM,
  currentYear = 2026,
  medicalLevel = 1,
  squadLength,
  inventory,
  trophyCabinet,
  seasonAwards,
  seasonHistory,
  onClose,
  onToggleTransferList,
  onSellPlayer,
  onDismissPlayer,
  onRenewContract,
  onRecoverFitness,
  onTreatInjury,
  onUseFitnessBooster,
  onUpgradeStar,
  onMakeOffer,
  onSignFreeAgent,
  onLoanInPlayer,
  onLoanOutPlayer,
}) => {
  const club = getClubById(player.clubId);
  const isIcon = player.cardTier === 'icon' || player.clubId === 'icons-fc';
  const isUcl17 = player.cardTier === 'ucl17' || player.clubId === 'rma-ucl-2017';
  const isGlobal = player.cardTier === 'global';
  const isFreePool = isFreeAgent || player.clubId === 'free-agent';
  const iconShardCost = getIconShardCost(player);
  const rawMinAsk =
    player.transferStatus === 'listed'
      ? Math.max(0.05, player.marketValueM * 0.85)
      : player.transferStatus === 'untouchable'
        ? player.marketValueM * 1.45
        : player.marketValueM * 1.1;
  const minAskM = Number(rawMinAsk.toFixed(rawMinAsk < 5 ? 2 : 1));

  const [bidM, setBidM] = useState<number>(minAskM);
  const [wageK, setWageK] = useState<number>(Math.round(player.wageK * 1.15));
  const [renewYears, setRenewYears] = useState<1 | 2 | 3 | 4>(2);
  const [freeSignYears, setFreeSignYears] = useState<1 | 2 | 3 | 4>(3);
  const [negotiationRejected, setNegotiationRejected] = useState(false);
  const [confirmDismiss, setConfirmDismiss] = useState(false);
  const [listPriceInput, setListPriceInput] = useState<string>(
    String(player.askingPriceM ?? player.marketValueM)
  );

  useEffect(() => {
    setBidM(minAskM);
    setWageK(Math.round(player.wageK * 1.15));
    setRenewYears(2);
    setFreeSignYears(3);
    setNegotiationRejected(false);
    setConfirmDismiss(false);
    setListPriceInput(String(player.askingPriceM ?? player.marketValueM));
  }, [player.id, minAskM, player.wageK, player.askingPriceM, player.marketValueM]);
  const [negotiating, setNegotiating] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: React.ReactNode;
    confirmLabel: string;
    tone: 'emerald' | 'amber' | 'danger';
    action: () => Promise<void>;
  } | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const recoveryCostM = getPlayerRecoveryCostM(player.fitness, medicalLevel);
  const injuryCostM = getInjuryTreatmentCostM(player, medicalLevel);
  const playerInjured = isPlayerInjured(player);
  const playerSuspended = isPlayerSuspended(player);
  const yellowAccum = (player.yellowCardsSeason ?? 0) % 5;
  const isExpiringContract = isOwnPlayer && player.contractUntil <= currentYear + 1;
  const normInventory = normalizeInventory(inventory);
  const upgradePlan = getStarUpgradePlan(player, normInventory, transferBudgetM);
  const hasEnoughIconShards = normInventory.universalShards >= iconShardCost;
  const renewalInfo = getContractRenewalCostK(player, renewYears);
  const accruedWageM = career ? getPlayerAccruedWageM(player, career) : 0;
  const compM = getPlayerContractCompensationM(player, currentYear);

  const attrList = [
    { label: 'Tốc độ (PAC)', val: player.attributes.pac },
    { label: 'Dứt điểm (SHO)', val: player.attributes.sho },
    { label: 'Chuyền bóng (PAS)', val: player.attributes.pas },
    { label: 'Rê bóng (DRI)', val: player.attributes.dri },
    { label: 'Phòng ngự (DEF)', val: player.attributes.def },
    { label: 'Thể lực (PHY)', val: player.attributes.phy },
  ];

  const handleBidSubmit = async (overrideBidM?: number) => {
    if (!onMakeOffer) return;
    const submitBid = overrideBidM ?? bidM;
    setNegotiating(true);
    setFeedback(null);
    try {
      const res = await onMakeOffer(player, submitBid, wageK);
      setFeedback({ ok: res.ok, text: res.message });
      setNegotiationRejected(!res.ok);
    } finally {
      setNegotiating(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm">
      <div className="w-full sm:max-w-lg max-h-[92vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[#121B24] border border-white/10 p-5 space-y-5">
        <div className="w-10 h-1 bg-slate-600 rounded-full mx-auto sm:hidden" />

        {/* Header */}
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3.5 min-w-0">
            <PlayerAvatar player={player} club={club} size={64} isUserCard={isOwnPlayer} />
            <div className="min-w-0">
              <p className="text-xs text-slate-400">
                {player.position} · #{player.number} · {player.nationality} (
                {isIcon ? `ICON · ${player.age} tuổi` : isUcl17 ? `C1 2017 · ${player.age} tuổi` : `${player.age} tuổi`})
              </p>
              <div className="flex items-center gap-1.5 min-w-0">
                {isIcon && <Crown className="w-4 h-4 text-amber-400 shrink-0" />}
                {isUcl17 && <Trophy className="w-4 h-4 text-indigo-300 shrink-0" />}
                <h3 className="font-display text-2xl font-bold text-white truncate">{player.name}</h3>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <ClubCrest club={club} size={20} />
                <span className="text-xs font-medium text-slate-300">{club.name}</span>
                {isOwnPlayer && (
                  <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/50 text-[10px] font-extrabold text-emerald-200 inline-flex items-center gap-1">
                    <svg width="8" height="8" viewBox="0 0 8 8" aria-hidden="true">
                      <circle cx="4" cy="4" r="4" fill={club.primaryColor} stroke={club.accentColor} strokeWidth="1.5" />
                    </svg>
                    THẺ CLB {club.shortName} · {upgradePlan.currentStars}★
                  </span>
                )}
                {isIcon && (
                  <span className="px-1.5 py-0.5 rounded bg-amber-500/20 border border-amber-400/50 text-[10px] font-extrabold text-amber-300">
                    HUYỀN THOẠI
                  </span>
                )}
                {isUcl17 && (
                  <span className="px-1.5 py-0.5 rounded bg-indigo-500/25 border border-indigo-400/60 text-[10px] font-extrabold text-indigo-200">
                    VÔ ĐỊCH C1 2017
                  </span>
                )}
                {isGlobal && (
                  <span className="px-1.5 py-0.5 rounded bg-pink-500/20 border border-pink-400/50 text-[10px] font-extrabold text-pink-300">
                    SIÊU SAO QUỐC TẾ
                  </span>
                )}
                {isOwnPlayer && (
                  <span className="inline-flex items-center gap-0.5 ml-1">
                    {[1, 2, 3, 4, 5, 6, 7].map((n) => (
                      <Star
                        key={n}
                        className={`w-3.5 h-3.5 ${
                          n <= upgradePlan.currentStars
                            ? 'text-amber-400 fill-amber-400'
                            : 'text-slate-600'
                        }`}
                      />
                    ))}
                  </span>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl bg-slate-800/80 text-slate-300 hover:text-white"
            aria-label="Đóng hồ sơ cầu thủ"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Core KPIs */}
        <div className="grid grid-cols-4 gap-2 text-center">
          <div className="rounded-xl bg-[#0B1117] border border-white/5 p-2.5">
            <p className="text-[11px] text-slate-400">OVR / POT</p>
            <p className="font-mono-num text-base font-bold text-emerald-400 mt-0.5">
              {player.rating}/{player.potential}
            </p>
          </div>
          <div className="rounded-xl bg-[#0B1117] border border-white/5 p-2.5">
            <p className="text-[11px] text-slate-400">Định giá</p>
            <p className="font-mono-num text-base font-bold text-white mt-0.5">
              €{player.marketValueM}M
            </p>
          </div>
          <div className="rounded-xl bg-[#0B1117] border border-white/5 p-2.5">
            <p className="text-[11px] text-slate-400">Lương/tuần</p>
            <p className="font-mono-num text-base font-bold text-amber-400 mt-0.5">
              €{player.wageK}K
            </p>
          </div>
          <div
            className={`rounded-xl border p-2.5 ${
              isExpiringContract
                ? 'bg-amber-500/15 border-amber-400/45'
                : 'bg-[#0B1117] border-white/5'
            }`}
          >
            <p className="text-[11px] text-slate-400">Hợp đồng</p>
            <p
              className={`font-mono-num text-base font-bold mt-0.5 ${
                isExpiringContract ? 'text-amber-300' : 'text-slate-200'
              }`}
            >
              {player.contractUntil}
            </p>
            {isExpiringContract && (
              <p className="text-[9px] font-bold text-rose-300 leading-tight mt-0.5">
                Hết hạn cuối mùa!
              </p>
            )}
          </div>
        </div>

        {playerInjured && player.injury && (
          <div className="rounded-xl bg-red-500/12 border border-red-500/40 p-3.5 space-y-2.5">
            <div className="flex items-start justify-between gap-2">
              <div className="flex items-start gap-2 min-w-0">
                <Stethoscope className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
                <div className="min-w-0">
                  <p className="text-xs font-bold text-red-300">
                    Báo cáo Chấn thương: {player.injury.type} (Mức {getInjurySeverityLabel(player.injury.severity)})
                  </p>
                  <p className="text-[11px] text-slate-300 mt-0.5">
                    Không thể ra sân · Dự kiến nghỉ còn{' '}
                    <strong className="font-mono-num text-red-200">
                      {player.injury.matchesRemaining}/{player.injury.totalMatches} trận
                    </strong>
                    {player.injury.occurredIn ? ` (${player.injury.occurredIn})` : ''}.
                  </p>
                </div>
              </div>
            </div>
            {isOwnPlayer && onTreatInjury && (
              <button
                type="button"
                disabled={recovering || transferBudgetM < injuryCostM}
                onClick={async () => {
                  setRecovering(true);
                  setFeedback(null);
                  try {
                    const res = await onTreatInjury(player.id);
                    setFeedback({ ok: res.ok, text: res.message });
                  } finally {
                    setRecovering(false);
                  }
                }}
                className="w-full h-10 rounded-xl bg-red-500 hover:bg-red-400 text-white font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <Stethoscope className="w-4 h-4" />
                {transferBudgetM < injuryCostM
                  ? `Không đủ ngân sách điều trị (€${injuryCostM}M)`
                  : recovering
                    ? 'Đang điều trị...'
                    : `Điều trị dứt điểm (-€${injuryCostM}M)`}
              </button>
            )}
          </div>
        )}

        {playerSuspended && (
          <div className="rounded-xl bg-red-500/15 border border-red-500/45 px-3.5 py-2.5 text-xs text-red-200 flex items-center justify-between gap-2">
            <span className="flex items-center gap-2 font-semibold">
              <Ban className="w-4 h-4 text-red-400 shrink-0" />
              Đang bị Treo giò: Nghỉ thi đấu còn{' '}
              <strong className="font-mono-num text-white">{player.suspendedMatches} trận chính thức</strong>
            </span>
            <span className="font-mono-num text-[11px] text-amber-300 shrink-0">
              Thẻ vàng mùa: {player.yellowCardsSeason ?? 0}
            </span>
          </div>
        )}

        {isOwnPlayer && !playerSuspended && (player.yellowCardsSeason ?? 0) > 0 && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-400/25 px-3.5 py-2 text-[11px] text-amber-200 flex items-center justify-between gap-2">
            <span>Thẻ vàng tích lũy (đủ 5 thẻ vàng bị treo giò 1 trận):</span>
            <span className="font-mono-num font-bold text-amber-300">
              {yellowAccum}/5 thẻ (Tổng mùa: {player.yellowCardsSeason})
            </span>
          </div>
        )}

        {isExpiringContract && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 px-3 py-2 text-[11px] text-amber-200 flex items-center gap-2">
            <AlertTriangle className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              Hợp đồng đến <strong>{player.contractUntil}</strong> sẽ đáo hạn cuối mùa này. Nếu không gia hạn, {player.shortName} sẽ <strong>ra đi tự do</strong>!
            </span>
          </div>
        )}

        {/* Attributes */}
        <div className="space-y-2.5">
          <h4 className="text-xs font-semibold text-slate-300">Chỉ số chuyên môn</h4>
          <div className="grid grid-cols-2 gap-x-4 gap-y-2.5">
            {attrList.map((a) => (
              <div key={a.label} className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">{a.label}</span>
                  <span className="font-mono-num font-bold text-white">{a.val}</span>
                </div>
                <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
                  <div
                    className={`h-full rounded-full ${
                      a.val >= 85 ? 'bg-emerald-400' : a.val >= 75 ? 'bg-sky-400' : 'bg-amber-400'
                    }`}
                    style={{ width: `${a.val}%` }}
                  />
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Season Stats */}
        <div className="grid grid-cols-5 gap-2 rounded-xl bg-[#0B1117] border border-white/5 px-3 py-3 text-xs text-center">
          <div>
            <p className="text-[10px] text-slate-400">Thể lực</p>
            <p className="font-mono-num font-bold text-emerald-400 mt-0.5">{player.fitness}%</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">Phong độ</p>
            <p
              className={`font-mono-num font-bold mt-0.5 ${
                player.form >= 8
                  ? 'text-emerald-400'
                  : player.form >= 6.8
                    ? 'text-sky-400'
                    : 'text-amber-400'
              }`}
            >
              {player.form.toFixed(1)}
            </p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">Trận</p>
            <p className="font-mono-num font-bold text-white mt-0.5">{player.appearances}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">Bàn</p>
            <p className="font-mono-num font-bold text-white mt-0.5">{player.goals}</p>
          </div>
          <div>
            <p className="text-[10px] text-slate-400">KT</p>
            <p className="font-mono-num font-bold text-white mt-0.5">{player.assists}</p>
          </div>
        </div>

        {/* Player Career Honors & TOTS Badges */}
        {(() => {
          const personalAwards = (seasonAwards ?? []).filter(
            (aw) => aw.playerId === player.id && aw.clubId === player.clubId
          );
          const totsHonors = (seasonHistory ?? [])
            .filter((rec) =>
              rec.teamOfTheSeason?.some(
                (t) => t.playerId === player.id && t.clubId === player.clubId
              )
            )
            .map((rec) => ({
              season: rec.season,
              entry: rec.teamOfTheSeason!.find(
                (t) => t.playerId === player.id && t.clubId === player.clubId
              )!,
            }));
          const clubSilverware = isOwnPlayer
            ? (trophyCabinet ?? []).filter(
                (t) => t.clubId === player.clubId && (!t.awardType || t.awardType === 'team')
              )
            : [];
          if (personalAwards.length === 0 && totsHonors.length === 0 && clubSilverware.length === 0) {
            return null;
          }
          return (
            <div className="rounded-xl bg-[#0B1117] border border-amber-400/25 p-3 space-y-2">
              <p className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" />
                Thành tích &amp; Danh hiệu Cá nhân
              </p>
              <div className="flex flex-wrap gap-1.5">
                {personalAwards.map((aw) => (
                  <span
                    key={aw.id}
                    className={`px-2 py-0.5 rounded-lg text-[10px] font-bold border ${
                      aw.awardType === 'mvp'
                        ? 'bg-amber-500/20 border-amber-400/45 text-amber-200'
                        : 'bg-emerald-500/20 border-emerald-400/45 text-emerald-200'
                    }`}
                  >
                    {aw.awardType === 'mvp' ? '👑' : '⚽'} {aw.awardTitle} {aw.competitionTitle} ({aw.season})
                  </span>
                ))}
                {totsHonors.map((th) => (
                  <span
                    key={`tots-${th.season}`}
                    className="px-2 py-0.5 rounded-lg bg-sky-500/20 border border-sky-400/45 text-[10px] font-bold text-sky-200"
                  >
                    ⭐ ĐHTB TOTS {th.season} ({th.entry.avgRating.toFixed(1)}★)
                  </span>
                ))}
                {clubSilverware.slice(0, 6).map((tr) => (
                  <span
                    key={tr.id}
                    className="px-2 py-0.5 rounded-lg bg-white/5 border border-white/15 text-[10px] font-semibold text-slate-200"
                  >
                    🏆 {tr.title}
                  </span>
                ))}
              </div>
            </div>
          );
        })()}

        {feedback && (
          <div
            className={`rounded-xl p-3 text-xs flex items-center gap-2 border ${
              feedback.ok
                ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
                : 'bg-red-500/15 border-red-500/30 text-red-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.text}</span>
          </div>
        )}

        {/* Actions */}
        {isPreviewOnly ? (
          <div className="rounded-2xl bg-[#0B1117] border border-sky-500/30 p-4 text-xs text-slate-300 space-y-1.5">
            <p className="font-bold text-sky-300 flex items-center gap-1.5">
              <Shield className="w-4 h-4 shrink-0" />
              Hồ sơ Xem trước (Chỉ đọc)
            </p>
            <p className="text-slate-400 leading-relaxed">
              Đây là danh sách xem trước chỉ dùng để tra cứu thông tin và chỉ số cầu thủ. Để chiêu mộ, vui lòng tìm cầu thủ đang rao bán ở mục <strong className="text-white">Đang rao bán</strong>, <strong className="text-white">Tự do</strong> hoặc mở thẻ tại <strong className="text-white">Kho Thẻ</strong>.
            </p>
          </div>
        ) : isOwnPlayer ? (
          <div className="space-y-3 pt-1">
            {/* Star Upgrade / Card Merging Panel */}
            {onUpgradeStar && (
              <div className="rounded-2xl bg-[#0B1117] border border-amber-400/30 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-1.5 min-w-0">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    <span className="text-xs font-bold text-white truncate">
                      Nâng Sao ({upgradePlan.tierLabel})
                    </span>
                    {upgradePlan.loyaltyDiscountApplied && !upgradePlan.isMax && (
                      <span className="px-1.5 py-0.5 rounded bg-emerald-500/20 border border-emerald-400/40 text-[9px] font-bold text-emerald-300 shrink-0">
                        -20% Mảnh
                      </span>
                    )}
                  </div>
                  <span className="font-mono-num text-xs font-bold text-amber-400 shrink-0">
                    {upgradePlan.isMax
                      ? '7★ Tối đa'
                      : `${upgradePlan.currentStars}★ → ${upgradePlan.nextStars}★ (OVR ${player.rating} → ${upgradePlan.previewRating})`}
                  </span>
                </div>

                {upgradePlan.isMax ? (
                  <p className="text-[11px] text-amber-300">
                    Cầu thủ đạt cảnh giới tối đa 7★: Đạt đỉnh cao hiệu suất thi đấu trên sân.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-center">
                      <div className="rounded-lg bg-[#121B24] border border-white/5 p-2">
                        <p className="text-slate-400">Thẻ trùng (Bắt buộc)</p>
                        <p
                          className={`font-mono-num font-bold mt-0.5 ${
                            upgradePlan.hasEnoughCards ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          {upgradePlan.ownedDuplicateCards}/{upgradePlan.cardsRequired} thẻ
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#121B24] border border-white/5 p-2">
                        <p className="text-slate-400">Mảnh Ngôi Sao</p>
                        <p
                          className={`font-mono-num font-bold mt-0.5 ${
                            upgradePlan.hasEnoughShards ? 'text-amber-400' : 'text-red-400'
                          }`}
                        >
                          {upgradePlan.ownedShards}/{upgradePlan.shardsRequired}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#121B24] border border-white/5 p-2">
                        <p className="text-slate-400">Phí nâng sao</p>
                        <p
                          className={`font-mono-num font-bold mt-0.5 ${
                            upgradePlan.canAffordBudget ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          €{upgradePlan.feeM}M
                        </p>
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center justify-between gap-1 text-[10px] text-slate-400 px-0.5">
                      <span>
                        Chỉ số +{upgradePlan.step?.ovrGain} OVR ·{' '}
                        <strong className="text-emerald-300">
                          PAC+{upgradePlan.attrGains.pac} SHO+{upgradePlan.attrGains.sho} PAS+{upgradePlan.attrGains.pas} DRI+{upgradePlan.attrGains.dri} DEF+{upgradePlan.attrGains.def} PHY+{upgradePlan.attrGains.phy}
                        </strong>
                      </span>
                      {upgradePlan.nextStars === 3 && (
                        <span className="text-sky-300 font-semibold">Mở khóa 3★: -20% hao thể lực</span>
                      )}
                      {upgradePlan.nextStars === 5 && (
                        <span className="text-amber-300 font-semibold">Mở khóa 5★: Phong độ đỉnh cao</span>
                      )}
                      {upgradePlan.nextStars === 7 && (
                        <span className="text-amber-300 font-semibold">Mở khóa 7★: Đỉnh cao Huyền thoại</span>
                      )}
                    </div>

                    <button
                      type="button"
                      disabled={!upgradePlan.canUpgrade || upgrading}
                      onClick={() =>
                        setPendingConfirm({
                          title: `Nâng sao ${player.shortName} lên ${upgradePlan.nextStars}★?`,
                          description: (
                            <p>
                              Tiêu hao <strong className="text-white">{upgradePlan.cardsRequired} thẻ trùng</strong>,{' '}
                              <strong className="text-amber-300">{upgradePlan.shardsRequired} Mảnh Ngôi Sao</strong> và phí{' '}
                              <strong className="text-emerald-300">€{upgradePlan.feeM}M</strong> để nâng lên {upgradePlan.nextStars}★ (OVR {player.rating} → {upgradePlan.previewRating}).
                            </p>
                          ),
                          confirmLabel: `Nâng lên ${upgradePlan.nextStars}★`,
                          tone: 'amber',
                          action: async () => {
                            setUpgrading(true);
                            setFeedback(null);
                            try {
                              const res = await onUpgradeStar(player.id);
                              setFeedback({ ok: res.ok, text: res.message });
                            } finally {
                              setUpgrading(false);
                            }
                          },
                        })
                      }
                      className="w-full h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <ArrowUpCircle className="w-4 h-4" />
                      {upgrading
                        ? 'Đang nâng sao...'
                        : !upgradePlan.hasEnoughCards
                          ? `Thiếu ${upgradePlan.cardsMissing} thẻ trùng của ${player.shortName}`
                          : !upgradePlan.hasEnoughShards
                            ? `Thiếu ${upgradePlan.shardsMissing} Mảnh Ngôi Sao`
                            : !upgradePlan.canAffordBudget
                              ? `Không đủ ngân sách (€${upgradePlan.feeM}M)`
                              : `Nâng lên ${upgradePlan.nextStars}★ (+${upgradePlan.step?.ovrGain} OVR)`}
                    </button>
                  </>
                )}
              </div>
            )}

            {onUseFitnessBooster && normInventory.fitnessBoosters > 0 && (player.fitness < 100 || playerInjured) && (() => {
              const targetFitness = Math.min(100, player.fitness + FITNESS_BOOSTER_RECOVERY);
              const gain = targetFitness - player.fitness;
              return (
                <button
                  type="button"
                  disabled={recovering}
                  onClick={async () => {
                    setRecovering(true);
                    setFeedback(null);
                    try {
                      const res = await onUseFitnessBooster(player.id);
                      setFeedback({ ok: res.ok, text: res.message });
                    } finally {
                      setRecovering(false);
                    }
                  }}
                  className="w-full h-11 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/45 text-sky-300 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <HeartPulse className="w-4 h-4 text-sky-400" />
                  {playerInjured
                    ? `Dùng Bình Thể Lực (Rút ngắn 2 trận nghỉ + tăng TL · Còn ${normInventory.fitnessBoosters})`
                    : `Dùng Bình Thể Lực (+${gain}% → ${targetFitness}% · Còn ${normInventory.fitnessBoosters})`}
                </button>
              );
            })()}

            {onRecoverFitness && (
              <button
                type="button"
                disabled={recovering || player.fitness >= 100 || transferBudgetM < recoveryCostM}
                onClick={() =>
                  setPendingConfirm({
                    title: `Trị liệu hồi phục ${player.shortName} về 100%?`,
                    description: (
                      <p>
                        Chi phí y tế <strong className="text-emerald-300">-€{recoveryCostM}M</strong> để phục hồi thể lực từ {player.fitness}% lên 100%.
                      </p>
                    ),
                    confirmLabel: `Trị liệu (-€${recoveryCostM}M)`,
                    tone: 'emerald',
                    action: async () => {
                      setRecovering(true);
                      setFeedback(null);
                      try {
                        const res = await onRecoverFitness(player.id);
                        setFeedback({ ok: res.ok, text: res.message });
                      } finally {
                        setRecovering(false);
                      }
                    },
                  })
                }
                className="w-full h-11 rounded-xl bg-emerald-500/15 hover:bg-emerald-500/25 border border-emerald-500/40 text-emerald-300 text-xs font-bold flex items-center justify-center gap-2 disabled:opacity-50"
              >
                <HeartPulse className="w-4 h-4 text-emerald-400" />
                {player.fitness >= 100
                  ? 'Thể lực đã đạt 100%'
                  : transferBudgetM < recoveryCostM
                    ? `Không đủ ngân sách (Cần €${recoveryCostM}M)`
                    : recovering
                      ? 'Đang trị liệu hồi phục...'
                      : `Trị liệu hồi phục về 100% (-€${recoveryCostM}M)`}
              </button>
            )}
            {onRenewContract && (
              <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3 space-y-2">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-white">Gia hạn Hợp đồng ({player.contractUntil})</span>
                  <div className="flex items-center gap-1">
                    {([1, 2, 3, 4] as const).map((yrs) => (
                      <button
                        key={yrs}
                        type="button"
                        onClick={() => setRenewYears(yrs)}
                        className={`px-2 py-0.5 rounded text-[11px] font-mono-num font-bold ${
                          renewYears === yrs
                            ? 'bg-emerald-500 text-slate-950'
                            : 'bg-[#121B24] text-slate-300 border border-white/10'
                        }`}
                      >
                        +{yrs}n
                      </button>
                    ))}
                  </div>
                </div>
                <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                  <span>
                    Đến {Math.max(player.contractUntil, currentYear) + renewYears} · Lương +{renewalInfo.wageIncreaseK}K/tuần
                  </span>
                  <button
                    type="button"
                    disabled={transferBudgetM < renewalInfo.bonusM}
                    onClick={() => {
                      const nextContract = Math.max(player.contractUntil, currentYear) + renewYears;
                      setPendingConfirm({
                        title: `Gia hạn hợp đồng ${player.shortName} (+${renewYears} năm)?`,
                        description: (
                          <p>
                            Hạn hợp đồng mới đến <strong className="text-white">{nextContract}</strong>, lương tuần tăng thêm{' '}
                            <strong className="text-amber-300">+€{renewalInfo.wageIncreaseK}K/tuần</strong>. Phí lót tay trừ ngay: <strong className="text-emerald-300">-€{renewalInfo.bonusM}M</strong>.
                          </p>
                        ),
                        confirmLabel: `Ký +${renewYears} năm (-€${renewalInfo.bonusM}M)`,
                        tone: 'emerald',
                        action: async () => {
                          onRenewContract(player.id, renewYears);
                          setFeedback({
                            ok: true,
                            text: `Đã gia hạn hợp đồng với ${player.shortName} thêm ${renewYears} năm (đến ${nextContract}).`,
                          });
                        },
                      });
                    }}
                    className="h-9 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 disabled:opacity-45"
                  >
                    <Shield className="w-3.5 h-3.5" />
                    {transferBudgetM < renewalInfo.bonusM
                      ? `Thiếu €${renewalInfo.bonusM}M`
                      : `Ký +${renewYears} năm (-€${renewalInfo.bonusM}M)`}
                  </button>
                </div>
              </div>
            )}

            {/* Settlement & Contract Compensation Overview */}
            {(() => {
              const salePriceM = Number((Math.max(0.05, player.marketValueM * 0.92)).toFixed(player.marketValueM < 5 ? 2 : 1));
              const netSaleM = Number((salePriceM - accruedWageM - compM).toFixed(2));
              const dismissCostM = Number((accruedWageM + compM).toFixed(2));
              const blockedMinSquad = typeof squadLength === 'number' && squadLength <= 21;
              const cannotAffordList = player.transferStatus !== 'listed' && transferBudgetM < accruedWageM;
              const cannotAffordNetSale = netSaleM < 0 && transferBudgetM + netSaleM < 0;
              const cannotAffordDismiss = transferBudgetM < dismissCostM;
              const rawParsedList = Number(listPriceInput);
              const validListPriceM =
                Number.isFinite(rawParsedList) && rawParsedList >= 0.1
                  ? Number(rawParsedList.toFixed(2))
                  : player.marketValueM;
              const currentListedPriceM = player.askingPriceM ?? player.marketValueM;
              const isPriceModified = Math.abs(validListPriceM - currentListedPriceM) >= 0.01;

              return (
                <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3 space-y-2.5">
                  <div className="text-[11px] space-y-1">
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Lương lũy kế chưa quyết toán:</span>
                      <span className="font-mono-num font-bold text-amber-300">
                        {accruedWageM > 0 ? `€${accruedWageM}M` : 'Đã quyết toán (€0M)'}
                      </span>
                    </div>
                    <div className="flex items-center justify-between">
                      <span className="text-slate-400">Đền bù phá vỡ hợp đồng:</span>
                      <span className="font-mono-num font-bold text-rose-300">€{compM}M</span>
                    </div>
                    <p className="text-[10px] text-slate-500 pt-0.5 leading-relaxed">
                      • <strong className="text-slate-300">Đưa lên sàn:</strong> Phải quyết toán trước €{accruedWageM}M lương; bên mua trả giá rao bán + €{compM}M bồi thường.
                      <br />• <strong className="text-slate-300">Bán ngay / Sa thải:</strong> Trừ €{accruedWageM}M lương + €{compM}M đền bù hợp đồng.
                    </p>
                  </div>

                  {onToggleTransferList && (
                    <div className="rounded-lg bg-[#121B24] border border-white/10 p-2.5 space-y-2">
                      <div className="flex items-center justify-between gap-2 text-xs">
                        <label
                          htmlFor={`list-price-${player.id}`}
                          className="font-semibold text-white"
                        >
                          Giá đưa lên sàn (€M)
                        </label>
                        <span className="text-[10px] text-slate-400 font-mono-num">
                          Thị trường: €{player.marketValueM}M · Tổng bên mua: €{(validListPriceM + compM).toFixed(2)}M
                        </span>
                      </div>
                      <div className="flex items-center gap-2">
                        <input
                          id={`list-price-${player.id}`}
                          type="number"
                          min={0.1}
                          max={999}
                          step={player.marketValueM < 5 ? 0.1 : 0.5}
                          value={listPriceInput}
                          onChange={(e) => setListPriceInput(e.target.value)}
                          className="w-28 h-9 px-2.5 rounded-lg bg-[#0B1117] border border-emerald-500/40 font-mono-num text-sm font-bold text-emerald-300 focus:outline-none focus:border-emerald-400"
                        />
                        <div className="flex flex-wrap gap-1 flex-1 justify-end">
                          {[
                            { label: '-10%', mult: 0.9 },
                            { label: 'Giá TT', mult: 1.0 },
                            { label: '+15%', mult: 1.15 },
                            { label: '+30%', mult: 1.3 },
                          ].map((preset) => {
                            const val = Number(
                              Math.max(0.1, player.marketValueM * preset.mult).toFixed(
                                player.marketValueM < 5 ? 2 : 1
                              )
                            );
                            return (
                              <button
                                key={preset.label}
                                type="button"
                                onClick={() => setListPriceInput(String(val))}
                                className="px-2 py-1 rounded bg-[#0B1117] hover:bg-slate-800 border border-white/10 text-[10px] font-semibold text-slate-300"
                              >
                                {preset.label}
                              </button>
                            );
                          })}
                        </div>
                      </div>
                      {player.transferStatus === 'listed' && (
                        <div className="flex items-center justify-between gap-2 text-[11px] pt-0.5">
                          <span className="text-emerald-300 font-semibold">
                            Đang rao trên sàn: €{currentListedPriceM}M
                          </span>
                          {isPriceModified && (
                            <button
                              type="button"
                              disabled={negotiating}
                              onClick={async () => {
                                setNegotiating(true);
                                setFeedback(null);
                                try {
                                  const res = await onToggleTransferList(
                                    player.id,
                                    validListPriceM,
                                    'update_price'
                                  );
                                  if (res) {
                                    setFeedback({ ok: res.ok, text: res.message });
                                  }
                                } finally {
                                  setNegotiating(false);
                                }
                              }}
                              className="px-2.5 py-1 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-[11px] disabled:opacity-45"
                            >
                              Cập nhật €{validListPriceM}M
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    {onLoanOutPlayer && !isIcon && !isUcl17 && (() => {
                      const terms = getLoanOutTerms(player);
                      return (
                        <button
                          type="button"
                          disabled={blockedMinSquad || negotiating}
                          onClick={() =>
                            setPendingConfirm({
                              title: `Cho mượn ${player.shortName} 1 mùa?`,
                              description: (
                                <p>
                                  Cầu thủ sẽ rời đội hình tạm thời đến hết mùa giải để tu nghiệp (+{terms.expectedGrowth} OVR dự kiến) và bạn nhận phí cho mượn <strong className="text-emerald-300">+€{terms.loanFeeM}M</strong>.
                                </p>
                              ),
                              confirmLabel: `Xác nhận cho mượn`,
                              tone: 'emerald',
                              action: async () => {
                                setNegotiating(true);
                                setFeedback(null);
                                try {
                                  const res = await onLoanOutPlayer(player.id);
                                  setFeedback({ ok: res.ok, text: res.message });
                                  if (res.ok) onClose();
                                } finally {
                                  setNegotiating(false);
                                }
                              },
                            })
                          }
                          className="h-11 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-sky-200 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-45"
                        >
                          {blockedMinSquad ? 'Mượn (≥22 cầu thủ)' : `Cho mượn (+€${terms.loanFeeM}M)`}
                        </button>
                      );
                    })()}

                    {onToggleTransferList && (
                      <button
                        type="button"
                        disabled={negotiating || cannotAffordList}
                        onClick={() => {
                          const isRemoving = player.transferStatus === 'listed';
                          setPendingConfirm({
                            title: isRemoving
                              ? `Gỡ ${player.shortName} khỏi sàn chuyển nhượng?`
                              : `Đưa ${player.shortName} lên sàn với giá €${validListPriceM}M?`,
                            description: isRemoving ? (
                              <p>
                                Cầu thủ sẽ trở lại trạng thái bình thường trong đội và không còn hiển thị ở mục Đang rao bán.
                              </p>
                            ) : (
                              <p>
                                Phải quyết toán ngay{' '}
                                <strong className="text-amber-300">€{accruedWageM}M</strong> tiền lương lũy kế để mở bán cầu thủ lên thị trường. Bên mua sẽ trả giá rao €{validListPriceM}M + €{compM}M bồi thường hợp đồng.
                              </p>
                            ),
                            confirmLabel: isRemoving
                              ? 'Gỡ khỏi sàn'
                              : accruedWageM > 0
                                ? `Quyết toán €${accruedWageM}M & Lên sàn`
                                : `Đưa lên sàn €${validListPriceM}M`,
                            tone: isRemoving ? 'amber' : 'emerald',
                            action: async () => {
                              setNegotiating(true);
                              setFeedback(null);
                              try {
                                const res = await onToggleTransferList(
                                  player.id,
                                  isRemoving ? undefined : validListPriceM,
                                  'toggle'
                                );
                                if (res) {
                                  setFeedback({ ok: res.ok, text: res.message });
                                }
                              } finally {
                                setNegotiating(false);
                              }
                            },
                          });
                        }}
                        className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5 px-2 disabled:opacity-45"
                      >
                        <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        {player.transferStatus === 'listed'
                          ? 'Gỡ khỏi sàn'
                          : cannotAffordList
                            ? `Thiếu €${accruedWageM}M quyết toán`
                            : accruedWageM > 0
                              ? `Lên sàn €${validListPriceM}M (-€${accruedWageM}M lương)`
                              : `Đưa lên sàn (€${validListPriceM}M)`}
                      </button>
                    )}

                    {onSellPlayer && (
                      <button
                        type="button"
                        disabled={blockedMinSquad || negotiating || cannotAffordNetSale}
                        onClick={() => {
                          if (blockedMinSquad) return;
                          setPendingConfirm({
                            title: `Bán vĩnh viễn ${player.name}?`,
                            description: (
                              <>
                                <p>
                                  Giá bán ngay: <strong className="text-white">€{salePriceM}M</strong> · Quyết toán lương: <strong className="text-amber-300">-€{accruedWageM}M</strong> · Đền bù HĐ: <strong className="text-rose-300">-€{compM}M</strong>.
                                </p>
                                <p>
                                  Thực nhận sau quyết toán:{' '}
                                  <strong className={netSaleM >= 0 ? 'text-emerald-300' : 'text-rose-300'}>
                                    {netSaleM >= 0 ? `+€${netSaleM}M` : `-€${Math.abs(netSaleM)}M`}
                                  </strong>. Hành động này không thể hoàn tác!
                                </p>
                              </>
                            ),
                            confirmLabel: 'Xác nhận Bán ngay',
                            tone: 'amber',
                            action: async () => {
                              setNegotiating(true);
                              setFeedback(null);
                              try {
                                const res = await onSellPlayer(player.id);
                                if (res && !res.ok) {
                                  setFeedback({ ok: false, text: res.message });
                                  return;
                                }
                                onClose();
                              } finally {
                                setNegotiating(false);
                              }
                            },
                          });
                        }}
                        title={blockedMinSquad ? 'Đội hình cần tối thiểu 21 cầu thủ (11 đá chính + 10 dự bị)' : undefined}
                        className="h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 px-2 disabled:opacity-45"
                      >
                        <DollarSign className="w-3.5 h-3.5 shrink-0" />
                        {blockedMinSquad
                          ? 'Tối thiểu 21 người'
                          : cannotAffordNetSale
                            ? 'Không đủ bù thanh lý'
                            : `Bán (Thực nhận ${netSaleM >= 0 ? `+€${netSaleM}M` : `-€${Math.abs(netSaleM)}M`})`}
                      </button>
                    )}

                    {onDismissPlayer && (
                      !confirmDismiss ? (
                        <button
                          type="button"
                          disabled={blockedMinSquad || negotiating || cannotAffordDismiss}
                          onClick={() => setConfirmDismiss(true)}
                          title={blockedMinSquad ? 'Đội hình cần tối thiểu 21 cầu thủ' : undefined}
                          className="h-11 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-bold flex items-center justify-center gap-1.5 px-2 disabled:opacity-45"
                        >
                          <UserX className="w-3.5 h-3.5 shrink-0" />
                          {blockedMinSquad
                            ? 'Tối thiểu 21 người'
                            : cannotAffordDismiss
                              ? `Thiếu €${dismissCostM}M sa thải`
                              : `Sa thải (-€${dismissCostM}M)`}
                        </button>
                      ) : (
                        <div className="flex items-center gap-1.5">
                          <button
                            type="button"
                            disabled={negotiating}
                            onClick={async () => {
                              setNegotiating(true);
                              setFeedback(null);
                              try {
                                const res = await onDismissPlayer(player.id);
                                if (res.ok) {
                                  onClose();
                                } else {
                                  setFeedback({ ok: false, text: res.message });
                                  setConfirmDismiss(false);
                                }
                              } finally {
                                setNegotiating(false);
                              }
                            }}
                            className="flex-1 h-11 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold flex items-center justify-center gap-1 disabled:opacity-45"
                          >
                            <AlertTriangle className="w-3.5 h-3.5 shrink-0" />
                            Xác nhận (-€{dismissCostM}M)
                          </button>
                          <button
                            type="button"
                            disabled={negotiating}
                            onClick={() => setConfirmDismiss(false)}
                            className="h-11 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                          >
                            Hủy
                          </button>
                        </div>
                      )
                    )}
                  </div>
                </div>
              );
            })()}
          </div>
        ) : isFreePool && onSignFreeAgent ? (
          <div className="rounded-2xl bg-[#0B1117] border border-emerald-500/35 p-4 space-y-3">
            <div className="flex items-center justify-between text-xs">
              <span className="font-bold text-emerald-400 flex items-center gap-1.5">
                <UserCheck className="w-4 h-4" />
                Chiêu mộ Cầu thủ Tự do (Phí €0M)
              </span>
              <span className="font-mono-num text-slate-300">
                Lương: €{player.wageK}K/tuần
              </span>
            </div>
            <div className="flex items-center justify-between text-xs">
              <span className="text-slate-400">Thời hạn hợp đồng đề xuất</span>
              <div className="flex items-center gap-1">
                {([1, 2, 3, 4] as const).map((yrs) => (
                  <button
                    key={yrs}
                    type="button"
                    onClick={() => setFreeSignYears(yrs)}
                    className={`px-2.5 py-1 rounded text-[11px] font-mono-num font-bold ${
                      freeSignYears === yrs
                        ? 'bg-emerald-500 text-slate-950'
                        : 'bg-[#121B24] text-slate-300 border border-white/10'
                    }`}
                  >
                    {yrs} năm
                  </button>
                ))}
              </div>
            </div>
            {(() => {
              const signBonusM = Number(Math.max(0.2, (player.wageK * 1.5) / 1000 * freeSignYears).toFixed(2));
              return (
                <button
                  type="button"
                  disabled={negotiating || transferBudgetM < signBonusM}
                  onClick={() =>
                    setPendingConfirm({
                      title: `Ký Cầu thủ Tự do ${player.name}?`,
                      description: (
                        <p>
                          Hợp đồng <strong className="text-white">{freeSignYears} năm</strong> · Lương{' '}
                          <strong className="text-amber-300">€{player.wageK}K/tuần</strong> · Tiền lót tay ký hợp đồng{' '}
                          <strong className="text-emerald-300">-€{signBonusM}M</strong>.
                        </p>
                      ),
                      confirmLabel: `Ký hợp đồng (-€${signBonusM}M)`,
                      tone: 'emerald',
                      action: async () => {
                        setNegotiating(true);
                        setFeedback(null);
                        try {
                          const res = await onSignFreeAgent(player, freeSignYears);
                          setFeedback({ ok: res.ok, text: res.message });
                        } finally {
                          setNegotiating(false);
                        }
                      },
                    })
                  }
                  className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs disabled:opacity-45"
                >
                  {transferBudgetM < signBonusM
                    ? `Không đủ lót tay (€${signBonusM}M)`
                    : negotiating
                      ? 'Đang ký hợp đồng...'
                      : `Ký Cầu thủ Tự do ${freeSignYears} năm (Lót tay €${signBonusM}M)`}
                </button>
              );
            })()}
          </div>
        ) : (
          onMakeOffer && (
            <div className="rounded-2xl bg-[#0B1117] border border-white/10 p-4 space-y-3.5">
              <div className="flex items-center justify-between text-xs gap-2 flex-wrap">
                <div className="flex items-center gap-2">
                  <span className="font-semibold text-white">Đàm phán Chuyển nhượng</span>
                  <span
                    className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                      player.transferStatus === 'listed'
                        ? 'bg-emerald-500/20 text-emerald-300'
                        : player.transferStatus === 'untouchable'
                          ? 'bg-red-500/20 text-red-300'
                          : 'bg-sky-500/20 text-sky-300'
                    }`}
                  >
                    {player.transferStatus === 'listed'
                      ? 'Sẵn sàng bán'
                      : player.transferStatus === 'untouchable'
                        ? 'Trụ cột (giá cao)'
                        : player.transferStatus === 'loan'
                          ? 'Cho mượn / Bán'
                          : 'Thương lượng'}
                  </span>
                </div>
                <span className="font-mono-num text-emerald-400">
                  Ngân sách: €{transferBudgetM.toFixed(1)}M
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Phí chuyển nhượng đề xuất</span>
                  <span className="font-mono-num font-bold text-white">€{bidM.toFixed(bidM < 10 ? 2 : 1)}M</span>
                </div>
                <input
                  type="range"
                  min={Number(Math.max(0.05, player.marketValueM * 0.6).toFixed(2))}
                  max={Number(Math.max(0.2, player.marketValueM * 1.9).toFixed(2))}
                  step={player.marketValueM < 2 ? 0.05 : player.marketValueM < 10 ? 0.2 : 0.5}
                  value={bidM}
                  onChange={(e) => {
                    setBidM(Number(Number(e.target.value).toFixed(2)));
                    setNegotiationRejected(false);
                  }}
                  className="w-full accent-emerald-500"
                />
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Mức lương đề nghị</span>
                  <span className="font-mono-num font-bold text-amber-400">€{wageK}K/tuần</span>
                </div>
                <input
                  type="range"
                  min={Math.max(20, Math.round(player.wageK * 0.8))}
                  max={Math.max(100, Math.round(player.wageK * 1.8))}
                  step={5}
                  value={wageK}
                  onChange={(e) => setWageK(Number(e.target.value))}
                  className="w-full accent-amber-400"
                />
              </div>

              {iconShardCost > 0 && (
                <div
                  className={`rounded-xl border px-3 py-2.5 text-xs flex items-center justify-between gap-2 ${
                    hasEnoughIconShards
                      ? 'bg-amber-500/10 border-amber-400/40 text-amber-200'
                      : 'bg-red-500/10 border-red-500/35 text-red-200'
                  }`}
                >
                  <span className="flex items-center gap-1.5 font-semibold">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                    Mảnh Ngôi Sao triệu hồi ICON
                  </span>
                  <span className="font-mono-num font-bold shrink-0">
                    {normInventory.universalShards} / {iconShardCost} Mảnh
                  </span>
                </div>
              )}

              <div className="rounded-xl bg-[#121B24] border border-white/10 p-3 text-xs space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-400">Giá đàm phán đề xuất:</span>
                  <span className="font-mono-num text-white font-semibold">€{bidM.toFixed(bidM < 10 ? 2 : 1)}M</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-400">Khoản bồi thường hợp đồng (bên mua trả):</span>
                  <span className="font-mono-num text-amber-300 font-semibold">+€{compM}M</span>
                </div>
                <div className="flex justify-between border-t border-white/10 pt-1">
                  <span className="text-slate-200 font-bold">Tổng thanh toán:</span>
                  <span className="font-mono-num text-emerald-400 font-extrabold">
                    €{(bidM + compM).toFixed(2)}M
                  </span>
                </div>
              </div>

              {(() => {
                const totalOfferCostM = Number((bidM + compM).toFixed(2));
                const totalMinCostM = Number((minAskM + compM).toFixed(2));
                return (
                  <>
                    {negotiationRejected && bidM < minAskM && (
                      <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 p-2.5 flex items-center justify-between gap-2 text-xs">
                        <span className="text-amber-200">
                          Chốt tối thiểu <strong className="font-mono-num">€{minAskM}M</strong> (+€{compM}M HĐ = €{totalMinCostM}M)
                        </span>
                        <button
                          type="button"
                          disabled={negotiating || totalMinCostM > transferBudgetM || !hasEnoughIconShards}
                          onClick={() => {
                            setBidM(minAskM);
                            void handleBidSubmit(minAskM);
                          }}
                          className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-bold text-[11px] shrink-0 disabled:opacity-45"
                        >
                          Chốt Tổng €{totalMinCostM}M
                        </button>
                      </div>
                    )}

                    <div className="flex flex-col sm:flex-row gap-2">
                      <button
                        type="button"
                        disabled={negotiating || totalOfferCostM > transferBudgetM || !hasEnoughIconShards}
                        onClick={() =>
                          setPendingConfirm({
                            title: `Xác nhận gửi đề nghị mua ${player.name}?`,
                            description: (
                              <>
                                <p>
                                  Giá đàm phán: <strong className="text-white">€{bidM.toFixed(bidM < 10 ? 2 : 1)}M</strong> + Bồi thường HĐ:{' '}
                                  <strong className="text-amber-300">€{compM}M</strong> = Tổng chi{' '}
                                  <strong className="text-emerald-300">€{totalOfferCostM}M</strong>
                                  {iconShardCost > 0 ? ` và ${iconShardCost} Mảnh Ngôi Sao` : ''}.
                                </p>
                                <p className="text-slate-400">
                                  Mức lương đề nghị: €{wageK}K/tuần.
                                </p>
                              </>
                            ),
                            confirmLabel: `Chốt đề nghị (-€${totalOfferCostM}M)`,
                            tone: iconShardCost > 0 ? 'amber' : 'emerald',
                            action: () => handleBidSubmit(),
                          })
                        }
                        className={`flex-1 h-12 rounded-xl font-bold text-sm disabled:opacity-50 ${
                          isIcon
                            ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                            : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                        }`}
                      >
                        {totalOfferCostM > transferBudgetM
                          ? `Thiếu ngân sách (Tổng €${totalOfferCostM}M)`
                          : !hasEnoughIconShards
                            ? `Cần ${iconShardCost} Mảnh Ngôi Sao (Thiếu ${iconShardCost - normInventory.universalShards})`
                            : negotiating
                              ? 'Đang đàm phán...'
                              : iconShardCost > 0
                                ? `Chiêu mộ ICON (-€${totalOfferCostM}M & ${iconShardCost} Mảnh)`
                                : `Gửi đề nghị (Tổng -€${totalOfferCostM}M)`}
                      </button>

                {onLoanInPlayer && player.transferStatus === 'loan' && !isIcon && !isUcl17 && (() => {
                  const loanTerms = getLoanInTerms(player);
                  return (
                    <button
                      type="button"
                      disabled={negotiating || transferBudgetM < loanTerms.loanFeeM}
                      onClick={() =>
                        setPendingConfirm({
                          title: `Mượn ${player.name} trong 1 mùa?`,
                          description: (
                            <p>
                              Phí mượn trừ ngay: <strong className="text-emerald-300">-€{loanTerms.loanFeeM}M</strong> · Điều khoản tùy chọn mua đứt: <strong className="text-amber-300">€{loanTerms.buyOptionM}M</strong>.
                            </p>
                          ),
                          confirmLabel: `Mượn (-€${loanTerms.loanFeeM}M)`,
                          tone: 'emerald',
                          action: async () => {
                            setNegotiating(true);
                            setFeedback(null);
                            try {
                              const res = await onLoanInPlayer(player);
                              setFeedback({ ok: res.ok, text: res.message });
                            } finally {
                              setNegotiating(false);
                            }
                          },
                        })
                      }
                      className="h-12 px-4 rounded-xl bg-sky-500/20 hover:bg-sky-500/30 border border-sky-400/45 text-sky-200 font-bold text-xs shrink-0 disabled:opacity-45"
                    >
                      {`Mượn 1 mùa (-€${loanTerms.loanFeeM}M)`}
                    </button>
                  );
                })()}
                    </div>
                  </>
                );
              })()}
            </div>
          )
        )}
      </div>

      <ConfirmActionModal
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title ?? ''}
        description={pendingConfirm?.description}
        confirmLabel={pendingConfirm?.confirmLabel}
        tone={pendingConfirm?.tone ?? 'amber'}
        busy={confirmBusy}
        onConfirm={async () => {
          if (!pendingConfirm) return;
          const fn = pendingConfirm.action;
          setConfirmBusy(true);
          try {
            await fn();
            setPendingConfirm(null);
          } finally {
            setConfirmBusy(false);
          }
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
};
