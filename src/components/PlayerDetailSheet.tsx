import React, { useState } from 'react';
import {
  ArrowLeftRight,
  ArrowUpCircle,
  CheckCircle2,
  Crown,
  DollarSign,
  HeartPulse,
  Shield,
  Sparkles,
  Star,
  Trophy,
  X,
} from 'lucide-react';
import { getClubById, getIconShardCost } from '../data/footballDatabase';
import { getPlayerRecoveryCostM } from '../lib/careerEngine';
import { getStarUpgradePlan, normalizeInventory } from '../lib/inventoryEngine';
import { InventoryState, Player } from '../types/game';
import { ClubCrest, PlayerAvatar } from './ClubBadgeAndAvatar';

interface PlayerDetailSheetProps {
  player: Player;
  isOwnPlayer: boolean;
  transferBudgetM: number;
  inventory?: InventoryState;
  onClose: () => void;
  onToggleTransferList?: (playerId: string) => void;
  onSellPlayer?: (playerId: string) => void;
  onRenewContract?: (playerId: string) => void;
  onRecoverFitness?: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onUseFitnessBooster?: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onUpgradeStar?: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onMakeOffer?: (player: Player, bidM: number, wageK: number) => Promise<{ ok: boolean; message: string }>;
}

export const PlayerDetailSheet: React.FC<PlayerDetailSheetProps> = ({
  player,
  isOwnPlayer,
  transferBudgetM,
  inventory,
  onClose,
  onToggleTransferList,
  onSellPlayer,
  onRenewContract,
  onRecoverFitness,
  onUseFitnessBooster,
  onUpgradeStar,
  onMakeOffer,
}) => {
  const club = getClubById(player.clubId);
  const isIcon = player.cardTier === 'icon' || player.clubId === 'icons-fc';
  const isUcl17 = player.cardTier === 'ucl17' || player.clubId === 'rma-ucl-2017';
  const isGlobal = player.cardTier === 'global';
  const iconShardCost = getIconShardCost(player);
  const minAskM =
    player.transferStatus === 'listed'
      ? Math.max(1, Math.round(player.marketValueM * 0.85))
      : player.transferStatus === 'untouchable'
        ? Math.round(player.marketValueM * 1.45)
        : Math.round(player.marketValueM * 1.1);

  const [bidM, setBidM] = useState<number>(minAskM);
  const [wageK, setWageK] = useState<number>(Math.round(player.wageK * 1.15));
  const [negotiating, setNegotiating] = useState(false);
  const [recovering, setRecovering] = useState(false);
  const [upgrading, setUpgrading] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const recoveryCostM = getPlayerRecoveryCostM(player.fitness);
  const normInventory = normalizeInventory(inventory);
  const upgradePlan = getStarUpgradePlan(player, normInventory, transferBudgetM);
  const hasEnoughIconShards = normInventory.universalShards >= iconShardCost;

  const attrList = [
    { label: 'Tốc độ (PAC)', val: player.attributes.pac },
    { label: 'Dứt điểm (SHO)', val: player.attributes.sho },
    { label: 'Chuyền bóng (PAS)', val: player.attributes.pas },
    { label: 'Rê bóng (DRI)', val: player.attributes.dri },
    { label: 'Phòng ngự (DEF)', val: player.attributes.def },
    { label: 'Thể lực (PHY)', val: player.attributes.phy },
  ];

  const handleBidSubmit = async () => {
    if (!onMakeOffer) return;
    setNegotiating(true);
    setFeedback(null);
    try {
      const res = await onMakeOffer(player, bidM, wageK);
      setFeedback({ ok: res.ok, text: res.message });
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
            <PlayerAvatar player={player} club={club} size={64} />
            <div className="min-w-0">
              <p className="text-xs text-slate-400">
                {player.position} · #{player.number} · {player.nationality} (
                {isIcon ? 'Bất tử ICON' : isUcl17 ? `C1 2017 · ${player.age} tuổi` : `${player.age} tuổi`})
              </p>
              <div className="flex items-center gap-1.5 min-w-0">
                {isIcon && <Crown className="w-4 h-4 text-amber-400 shrink-0" />}
                {isUcl17 && <Trophy className="w-4 h-4 text-indigo-300 shrink-0" />}
                <h3 className="font-display text-2xl font-bold text-white truncate">{player.name}</h3>
              </div>
              <div className="flex items-center gap-2 mt-1 flex-wrap">
                <ClubCrest club={club} size={20} />
                <span className="text-xs font-medium text-slate-300">{club.name}</span>
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
                    {[1, 2, 3, 4, 5].map((n) => (
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
          <div className="rounded-xl bg-[#0B1117] border border-white/5 p-2.5">
            <p className="text-[11px] text-slate-400">Hợp đồng</p>
            <p className="font-mono-num text-base font-bold text-slate-200 mt-0.5">
              {player.contractUntil}
            </p>
          </div>
        </div>

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
        {isOwnPlayer ? (
          <div className="space-y-3 pt-1">
            {/* Star Upgrade / Card Merging Panel */}
            {onUpgradeStar && (
              <div className="rounded-2xl bg-[#0B1117] border border-amber-400/30 p-3.5 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <span className="text-xs font-bold text-white flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5 text-amber-400" />
                    Ghép Thẻ Nâng Sao
                  </span>
                  <span className="font-mono-num text-xs font-bold text-amber-400">
                    {upgradePlan.isMax
                      ? '5★ Tối đa'
                      : `${upgradePlan.currentStars}★ → ${upgradePlan.nextStars}★ (OVR ${player.rating} → ${upgradePlan.previewRating})`}
                  </span>
                </div>

                {upgradePlan.isMax ? (
                  <p className="text-[11px] text-amber-300">
                    Cầu thủ đã đạt cấp tối đa 5★ Siêu Sao Đột Phá.
                  </p>
                ) : (
                  <>
                    <div className="grid grid-cols-3 gap-2 text-[11px] text-center">
                      <div className="rounded-lg bg-[#121B24] border border-white/5 p-2">
                        <p className="text-slate-400">Thẻ bản sao</p>
                        <p className="font-mono-num font-bold text-white mt-0.5">
                          {upgradePlan.cardsToUse}/{upgradePlan.step?.cardsRequired} (Có {upgradePlan.ownedDuplicateCards})
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#121B24] border border-white/5 p-2">
                        <p className="text-slate-400">Mảnh bù</p>
                        <p
                          className={`font-mono-num font-bold mt-0.5 ${
                            upgradePlan.canAffordMaterials ? 'text-amber-400' : 'text-red-400'
                          }`}
                        >
                          {upgradePlan.shardsToUse} / {normInventory.universalShards}
                        </p>
                      </div>
                      <div className="rounded-lg bg-[#121B24] border border-white/5 p-2">
                        <p className="text-slate-400">Phí ghép</p>
                        <p
                          className={`font-mono-num font-bold mt-0.5 ${
                            upgradePlan.canAffordBudget ? 'text-emerald-400' : 'text-red-400'
                          }`}
                        >
                          €{upgradePlan.feeM}M
                        </p>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={!upgradePlan.canUpgrade || upgrading}
                      onClick={async () => {
                        setUpgrading(true);
                        setFeedback(null);
                        try {
                          const res = await onUpgradeStar(player.id);
                          setFeedback({ ok: res.ok, text: res.message });
                        } finally {
                          setUpgrading(false);
                        }
                      }}
                      className="w-full h-10 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-40"
                    >
                      <ArrowUpCircle className="w-4 h-4" />
                      {upgrading
                        ? 'Đang ghép nâng sao...'
                        : `Ghép lên ${upgradePlan.nextStars}★ (+${upgradePlan.step?.ovrGain} OVR, +${upgradePlan.step?.attrGain} tất cả chỉ số)`}
                    </button>
                  </>
                )}
              </div>
            )}

            {onUseFitnessBooster && normInventory.fitnessBoosters > 0 && player.fitness < 100 && (
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
                Dùng Bình Thể Lực trong túi (Miễn phí · Còn {normInventory.fitnessBoosters})
              </button>
            )}

            {onRecoverFitness && (
              <button
                type="button"
                disabled={recovering || player.fitness >= 100 || transferBudgetM < recoveryCostM}
                onClick={async () => {
                  setRecovering(true);
                  setFeedback(null);
                  try {
                    const res = await onRecoverFitness(player.id);
                    setFeedback({ ok: res.ok, text: res.message });
                  } finally {
                    setRecovering(false);
                  }
                }}
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
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5">
              {onRenewContract && (
                <button
                  type="button"
                  onClick={() => {
                    onRenewContract(player.id);
                    setFeedback({ ok: true, text: `Đã gia hạn hợp đồng với ${player.shortName} đến ${player.contractUntil + 2}.` });
                  }}
                  className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <Shield className="w-3.5 h-3.5 text-emerald-400" />
                  Gia hạn (+2 năm)
                </button>
              )}
              {onToggleTransferList && (
                <button
                  type="button"
                  onClick={() => onToggleTransferList(player.id)}
                  className="h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-white text-xs font-semibold flex items-center justify-center gap-1.5"
                >
                  <ArrowLeftRight className="w-3.5 h-3.5 text-amber-400" />
                  {player.transferStatus === 'listed' ? 'Gỡ rao bán' : 'Đưa lên sàn'}
                </button>
              )}
              {onSellPlayer && (
                <button
                  type="button"
                  onClick={() => {
                    onSellPlayer(player.id);
                    onClose();
                  }}
                  className="h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5"
                >
                  <DollarSign className="w-3.5 h-3.5" />
                  Bán (€{Math.round(player.marketValueM * 0.92)}M)
                </button>
              )}
            </div>
          </div>
        ) : (
          onMakeOffer && (
            <div className="rounded-2xl bg-[#0B1117] border border-white/10 p-4 space-y-3.5">
              <div className="flex items-center justify-between text-xs">
                <span className="font-semibold text-white">Đàm phán Chuyển nhượng</span>
                <span className="font-mono-num text-emerald-400">
                  Ngân sách: €{transferBudgetM.toFixed(1)}M
                </span>
              </div>

              <div className="space-y-1">
                <div className="flex justify-between text-xs">
                  <span className="text-slate-400">Phí chuyển nhượng đề xuất</span>
                  <span className="font-mono-num font-bold text-white">€{bidM}M</span>
                </div>
                <input
                  type="range"
                  min={Math.max(1, Math.round(player.marketValueM * 0.6))}
                  max={Math.max(20, Math.round(player.marketValueM * 1.9))}
                  value={bidM}
                  onChange={(e) => setBidM(Number(e.target.value))}
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

              <button
                type="button"
                disabled={negotiating || bidM > transferBudgetM || !hasEnoughIconShards}
                onClick={handleBidSubmit}
                className={`w-full h-12 rounded-xl font-bold text-sm disabled:opacity-50 ${
                  isIcon
                    ? 'bg-amber-500 hover:bg-amber-400 text-slate-950'
                    : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                }`}
              >
                {bidM > transferBudgetM
                  ? 'Vượt quá ngân sách chuyển nhượng'
                  : !hasEnoughIconShards
                    ? `Cần ${iconShardCost} Mảnh Ngôi Sao (Thiếu ${iconShardCost - normInventory.universalShards})`
                    : negotiating
                      ? 'Đang đàm phán...'
                      : iconShardCost > 0
                        ? `Chiêu mộ ICON (-€${bidM}M & ${iconShardCost} Mảnh)`
                        : `Gửi đề nghị €${bidM}M`}
              </button>
            </div>
          )
        )}
      </div>
    </div>
  );
};
