import React, { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowUpCircle,
  CheckCircle2,
  Coins,
  Gift,
  HeartPulse,
  PackageOpen,
  Search,
  ShoppingBag,
  Sparkles,
  Star,
  Trash2,
  UserPlus,
  X,
} from 'lucide-react';
import { getClubById, INITIAL_PLAYERS } from '../data/footballDatabase';
import {
  FITNESS_BOOSTER_RECOVERY,
  getCardDismantleShards,
  getCardRarityTier,
  getQuickDismantlePlan,
  getStarUpgradePlan,
  getTotalCardsCount,
  getTotalUnopenedPacks,
  hasPurchasedPackToday,
  normalizeInventory,
  PACK_CATALOG,
  resolvePlayerUpgradeTier,
} from '../lib/inventoryEngine';
import {
  CareerSave,
  MarketOverride,
  PackOpenResult,
  PackTier,
  Player,
} from '../types/game';
import { applyMarketOverrides } from '../lib/careerEngine';
import { ClubCrest, PlayerAvatar } from './ClubBadgeAndAvatar';
import { ConfirmActionModal } from './ConfirmActionModal';

interface InventoryViewProps {
  career: CareerSave;
  marketOverrides: Record<string, MarketOverride>;
  onSelectPlayer: (player: Player) => void;
  onOpenPack: (packTier: PackTier) => Promise<{ ok: boolean; message: string; result?: PackOpenResult }>;
  onBuyPack: (packTier: PackTier) => Promise<{ ok: boolean; message: string }>;
  onUpgradePlayerStar: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onRecruitFromCard: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onDismantleCard: (playerId: string, count?: number) => Promise<{ ok: boolean; message: string }>;
  onBulkDismantleCards?: () => Promise<{ ok: boolean; message: string }>;
  onUseFitnessBooster: (playerId: string) => Promise<{ ok: boolean; message: string }>;
}

function renderStarsRow(stars: number, sizeClass = 'w-3.5 h-3.5') {
  return (
    <span className="inline-flex items-center gap-0.5" aria-label={`${stars} sao`}>
      {[1, 2, 3, 4, 5, 6, 7].map((n) => (
        <Star
          key={n}
          className={`${sizeClass} ${
            n <= stars ? 'text-amber-400 fill-amber-400' : 'text-slate-600'
          }`}
        />
      ))}
    </span>
  );
}

export const InventoryView: React.FC<InventoryViewProps> = ({
  career,
  marketOverrides,
  onSelectPlayer,
  onOpenPack,
  onBuyPack,
  onUpgradePlayerStar,
  onRecruitFromCard,
  onDismantleCard,
  onBulkDismantleCards,
  onUseFitnessBooster,
}) => {
  const [subTab, setSubTab] = useState<'packs' | 'cards' | 'upgrade'>('packs');
  const [cardFilter, setCardFilter] = useState<'all' | 'squad' | 'new' | 'excess'>('all');
  const [searchText, setSearchText] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [openingPack, setOpeningPack] = useState<PackTier | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [revealResult, setRevealResult] = useState<PackOpenResult | null>(null);
  const [showBoosterPicker, setShowBoosterPicker] = useState(false);
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: React.ReactNode;
    confirmLabel: string;
    tone: 'emerald' | 'amber' | 'danger';
    action: () => Promise<void>;
  } | null>(null);
  const isMountedRef = useRef(true);

  useEffect(() => {
    isMountedRef.current = true;
    return () => {
      isMountedRef.current = false;
    };
  }, []);

  const inventory = useMemo(() => normalizeInventory(career.inventory), [career.inventory]);
  const totalUnopenedPacks = useMemo(() => getTotalUnopenedPacks(inventory), [inventory]);
  const totalCards = useMemo(() => getTotalCardsCount(inventory), [inventory]);

  const allMergedPlayers = useMemo(
    () => applyMarketOverrides(INITIAL_PLAYERS, marketOverrides),
    [marketOverrides]
  );

  const playerLookup = useMemo(() => {
    const map = new Map<string, Player>();
    for (const p of allMergedPlayers) map.set(p.id, p);
    for (const p of career.squad) map.set(p.id, p);
    return map;
  }, [allMergedPlayers, career.squad]);

  const squadIds = useMemo(() => new Set(career.squad.map((p) => p.id)), [career.squad]);

  const quickDismantlePlan = useMemo(
    () => getQuickDismantlePlan(inventory, career.squad, allMergedPlayers),
    [inventory, career.squad, allMergedPlayers]
  );

  const cardEntries = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    return Object.entries(inventory.playerCards)
      .filter(([, count]) => count > 0)
      .map(([playerId, count]) => {
        const player = playerLookup.get(playerId);
        if (!player) return null;
        const inSquad = squadIds.has(playerId);
        const isExcess =
          (inSquad && (player.stars ?? 1) >= 7) ||
          (!inSquad &&
            player.cardTier !== 'icon' &&
            player.cardTier !== 'ucl17' &&
            player.cardTier !== 'global' &&
            player.rating < 86);
        return { player, count, inSquad, isExcess };
      })
      .filter(
        (item): item is { player: Player; count: number; inSquad: boolean; isExcess: boolean } =>
          Boolean(item)
      )
      .filter((item) => {
        if (cardFilter === 'squad' && !item.inSquad) return false;
        if (cardFilter === 'new' && item.inSquad) return false;
        if (cardFilter === 'excess' && !item.isExcess) return false;
        if (q) {
          const club = getClubById(item.player.clubId);
          return (
            item.player.name.toLowerCase().includes(q) ||
            item.player.position.toLowerCase().includes(q) ||
            club.name.toLowerCase().includes(q)
          );
        }
        return true;
      })
      .sort((a, b) => {
        if (a.inSquad !== b.inSquad) return a.inSquad ? -1 : 1;
        return b.player.rating - a.player.rating;
      });
  }, [inventory.playerCards, playerLookup, squadIds, cardFilter, searchText]);

  const upgradeCandidates = useMemo(() => {
    return career.squad
      .map((player) => ({
        player,
        plan: getStarUpgradePlan(player, inventory, career.transferBudget),
      }))
      .sort((a, b) => {
        if (a.plan.canUpgrade !== b.plan.canUpgrade) return a.plan.canUpgrade ? -1 : 1;
        if (a.plan.isMax !== b.plan.isMax) return a.plan.isMax ? 1 : -1;
        if (b.plan.ownedDuplicateCards !== a.plan.ownedDuplicateCards) {
          return b.plan.ownedDuplicateCards - a.plan.ownedDuplicateCards;
        }
        return b.player.rating - a.player.rating;
      });
  }, [career.squad, inventory, career.transferBudget]);

  const readyUpgradeCount = useMemo(
    () => upgradeCandidates.filter((c) => c.plan.canUpgrade).length,
    [upgradeCandidates]
  );

  const tiredSquadPlayers = useMemo(
    () =>
      [...career.squad]
        .filter((p) => p.fitness < 100)
        .sort((a, b) => a.fitness - b.fitness),
    [career.squad]
  );

  const handleOpenPackAction = async (packTier: PackTier) => {
    if (busyKey) return;
    setBusyKey(`open-${packTier}`);
    setRevealResult(null);
    setOpeningPack(packTier);
    setFeedback(null);
    try {
      const [res] = await Promise.all([
        onOpenPack(packTier),
        new Promise<void>((resolve) => {
          window.setTimeout(resolve, 920);
        }),
      ]);
      if (!isMountedRef.current) return;
      setOpeningPack(null);
      if (res.ok && res.result) {
        setRevealResult(res.result);
      } else {
        setFeedback({ ok: res.ok, text: res.message });
      }
    } finally {
      if (isMountedRef.current) {
        setOpeningPack(null);
        setBusyKey(null);
      }
    }
  };

  const handleBuyPackAction = (packTier: PackTier) => {
    const pack = PACK_CATALOG.find((p) => p.id === packTier);
    if (!pack) return;
    setPendingConfirm({
      title: `Mua ${pack.name}?`,
      description: (
        <p>
          Ngân sách CLB sẽ trừ <strong className="text-amber-300">-€{pack.buyPriceM}M</strong> để thêm 1 {pack.name} vào kho (giới hạn 1 gói/loại mỗi ngày).
        </p>
      ),
      confirmLabel: `Mua gói (-€${pack.buyPriceM}M)`,
      tone: 'amber',
      action: async () => {
        setBusyKey(`buy-${packTier}`);
        setFeedback(null);
        try {
          const res = await onBuyPack(packTier);
          setFeedback({ ok: res.ok, text: res.message });
        } finally {
          setBusyKey(null);
        }
      },
    });
  };

  const handleUpgradeAction = (playerId: string) => {
    const p = playerLookup.get(playerId);
    const plan = p ? getStarUpgradePlan(p, inventory, career.transferBudget) : null;
    setPendingConfirm({
      title: p ? `Nâng sao ${p.shortName} lên ${plan?.nextStars ?? ''}★?` : 'Xác nhận nâng sao?',
      description: p && plan ? (
        <p>
          Tiêu hao <strong className="text-white">{plan.cardsRequired} thẻ trùng</strong>,{' '}
          <strong className="text-amber-300">{plan.shardsRequired} Mảnh Ngôi Sao</strong> và{' '}
          <strong className="text-emerald-300">-€{plan.feeM}M</strong> (OVR {p.rating} → {plan.previewRating}).
        </p>
      ) : (
        <p>Xác nhận tiêu hao thẻ trùng, Mảnh và phí ngân sách để nâng sao cầu thủ này.</p>
      ),
      confirmLabel: 'Xác nhận Nâng sao',
      tone: 'amber',
      action: async () => {
        setBusyKey(`up-${playerId}`);
        setFeedback(null);
        try {
          const res = await onUpgradePlayerStar(playerId);
          setFeedback({ ok: res.ok, text: res.message });
        } finally {
          setBusyKey(null);
        }
      },
    });
  };

  const handleRecruitAction = (playerId: string) => {
    const p = playerLookup.get(playerId);
    const feeM = p?.marketValueM ?? 0;
    setPendingConfirm({
      title: p ? `Chiêu mộ ${p.name} từ Thẻ?` : 'Chiêu mộ cầu thủ từ Thẻ?',
      description: p ? (
        <p>
          Chiêu mộ lần đầu từ Thẻ vào Đội 1 cần chi trả đúng giá thị trường{' '}
          <strong className="text-emerald-300">-€{feeM}M</strong> (OVR {p.rating} · {p.position} · Lương €{p.wageK}K/tuần) và dùng 1 thẻ cầu thủ.
        </p>
      ) : (
        <p>Xác nhận chiêu mộ cầu thủ này vào đội hình theo giá thị trường.</p>
      ),
      confirmLabel: `Chiêu mộ (-€${feeM}M)`,
      tone: 'emerald',
      action: async () => {
        setBusyKey(`rec-${playerId}`);
        setFeedback(null);
        try {
          const res = await onRecruitFromCard(playerId);
          setFeedback({ ok: res.ok, text: res.message });
        } finally {
          setBusyKey(null);
        }
      },
    });
  };

  const handleDismantleAction = (playerId: string) => {
    const p = playerLookup.get(playerId);
    const shards = p ? getCardDismantleShards(p.rating, p.cardTier) : 0;
    setPendingConfirm({
      title: p ? `Tách 1 thẻ ${p.shortName}?` : 'Tách 1 thẻ cầu thủ?',
      description: (
        <p>
          Thẻ cầu thủ sẽ bị <strong className="text-rose-300">tiêu hủy vĩnh viễn</strong> để đổi lấy{' '}
          <strong className="text-amber-300">+{shards} Mảnh Ngôi Sao</strong>.
        </p>
      ),
      confirmLabel: `Tách thẻ (+${shards} Mảnh)`,
      tone: 'danger',
      action: async () => {
        setBusyKey(`dis-${playerId}`);
        setFeedback(null);
        try {
          const res = await onDismantleCard(playerId, 1);
          setFeedback({ ok: res.ok, text: res.message });
        } finally {
          setBusyKey(null);
        }
      },
    });
  };

  const handleBulkDismantleAction = () => {
    if (!onBulkDismantleCards) return;
    setPendingConfirm({
      title: `Tách nhanh ${quickDismantlePlan.totalCards} thẻ dư thừa?`,
      description: (
        <p>
          Toàn bộ <strong className="text-white">{quickDismantlePlan.totalCards} thẻ dư an toàn</strong> (cầu thủ đã 7★ hoặc thẻ thường ngoài đội hình) sẽ bị tách vĩnh viễn để nhận{' '}
          <strong className="text-amber-300">+{quickDismantlePlan.totalShards} Mảnh Ngôi Sao</strong>.
        </p>
      ),
      confirmLabel: `Tách tất cả (+${quickDismantlePlan.totalShards} Mảnh)`,
      tone: 'danger',
      action: async () => {
        setBusyKey('bulk-dis');
        setFeedback(null);
        try {
          const res = await onBulkDismantleCards();
          setFeedback({ ok: res.ok, text: res.message });
        } finally {
          setBusyKey(null);
        }
      },
    });
  };

  const handleUseBoosterAction = async (playerId: string) => {
    setBusyKey(`boost-${playerId}`);
    setFeedback(null);
    try {
      const res = await onUseFitnessBooster(playerId);
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok && inventory.fitnessBoosters <= 1) {
        setShowBoosterPicker(false);
      }
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Resource Summary Bar */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-3.5">
          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            <PackageOpen className="w-3.5 h-3.5 text-emerald-400" />
            Gói &amp; Quà chờ mở
          </p>
          <p className="font-mono-num text-xl font-extrabold text-emerald-400 mt-1">
            {totalUnopenedPacks} gói
          </p>
        </div>

        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-3.5">
          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            <Sparkles className="w-3.5 h-3.5 text-amber-400" />
            Mảnh Ngôi Sao
          </p>
          <p className="font-mono-num text-xl font-extrabold text-amber-400 mt-1">
            {inventory.universalShards}
          </p>
        </div>

        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-3.5 flex items-center justify-between gap-2">
          <div>
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <HeartPulse className="w-3.5 h-3.5 text-sky-400" />
              Bình Thể Lực (+{FITNESS_BOOSTER_RECOVERY}%)
            </p>
            <p className="font-mono-num text-xl font-extrabold text-sky-400 mt-1">
              {inventory.fitnessBoosters}
            </p>
          </div>
          {inventory.fitnessBoosters > 0 && tiredSquadPlayers.length > 0 && (
            <button
              type="button"
              onClick={() => setShowBoosterPicker(true)}
              className="h-9 px-2.5 rounded-lg bg-sky-500/20 border border-sky-400/40 text-sky-300 text-[11px] font-bold shrink-0"
            >
              Dùng
            </button>
          )}
        </div>

        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-3.5">
          <p className="text-[11px] text-slate-400 flex items-center gap-1">
            <Coins className="w-3.5 h-3.5 text-emerald-400" />
            Ngân sách / Thẻ
          </p>
          <p className="font-mono-num text-base font-extrabold text-white mt-1.5">
            €{career.transferBudget.toFixed(1)}M · {totalCards} thẻ
          </p>
        </div>
      </div>

      {/* Sub-Tabs */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
        <button
          type="button"
          onClick={() => setSubTab('packs')}
          className={`h-10 rounded-lg text-xs font-bold transition-colors whitespace-nowrap px-2 ${
            subTab === 'packs' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          Mở Thẻ &amp; Quà ({totalUnopenedPacks})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('cards')}
          className={`h-10 rounded-lg text-xs font-bold transition-colors whitespace-nowrap px-2 ${
            subTab === 'cards' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:text-white'
          }`}
        >
          Kho Thẻ ({totalCards})
        </button>
        <button
          type="button"
          onClick={() => setSubTab('upgrade')}
          className={`h-10 rounded-lg text-xs font-bold transition-colors whitespace-nowrap px-2 ${
            subTab === 'upgrade'
              ? 'bg-emerald-500 text-slate-950'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          Ghép Sao ({readyUpgradeCount})
        </button>
      </div>

      {feedback && (
        <div
          className={`rounded-xl p-3 text-xs flex items-center gap-2 border ${
            feedback.ok
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
              : 'bg-red-500/15 border-red-500/35 text-red-200'
          }`}
        >
          <CheckCircle2 className="w-4 h-4 shrink-0" />
          <span>{feedback.text}</span>
        </div>
      )}

      {/* TAB 1: PACKS & GIFT SHOP */}
      {subTab === 'packs' && (
        <div className="space-y-5">
          {/* Unopened Packs */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <Gift className="w-4 h-4 text-emerald-400" />
                Gói thẻ &amp; Rương quà đang có
              </h3>
              <span className="text-[11px] text-slate-400">
                Thắng trận &amp; vô địch để nhận thêm gói
              </span>
            </div>

            {totalUnopenedPacks === 0 ? (
              <div className="rounded-xl bg-[#0B1117] border border-white/5 p-6 text-center space-y-1.5">
                <p className="text-xs font-semibold text-slate-300">
                  Túi quà hiện tại đang trống.
                </p>
                <p className="text-[11px] text-slate-400">
                  Giành chiến thắng ở các giải đấu để nhận Gói Tuyển Trạch, hoặc mua thêm gói ở cửa hàng bên dưới.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {PACK_CATALOG.filter((p) => (inventory.packs[p.id] ?? 0) > 0).map((pack) => {
                  const count = inventory.packs[pack.id] ?? 0;
                  const borderCls =
                    pack.theme === 'gold'
                      ? 'border-amber-300/75 bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-[#0B1117]'
                      : pack.theme === 'violet'
                        ? 'border-amber-400/45 bg-amber-500/5'
                        : pack.theme === 'amber'
                          ? 'border-amber-400/35 bg-[#0B1117]'
                          : pack.theme === 'emerald'
                            ? 'border-emerald-500/35 bg-[#0B1117]'
                            : 'border-sky-400/35 bg-[#0B1117]';
                  const isShaking = openingPack === pack.id;
                  return (
                    <div
                      key={pack.id}
                      className={`rounded-xl border p-4 flex flex-col justify-between gap-3 transition-transform ${borderCls} ${
                        isShaking ? 'animate-pack-shake ring-2 ring-amber-400/60' : ''
                      }`}
                    >
                      <div className="space-y-1">
                        <div className="flex items-center justify-between gap-2">
                          <span className="text-[11px] font-bold text-amber-400">
                            {pack.badgeText}
                          </span>
                          <span className="font-mono-num text-xs font-extrabold text-emerald-400">
                            Đang có: x{count}
                          </span>
                        </div>
                        <h4 className="text-base font-bold text-white">{pack.name}</h4>
                        <p className="text-xs text-slate-300 leading-relaxed">{pack.description}</p>
                      </div>

                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => handleOpenPackAction(pack.id)}
                        className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60"
                      >
                        <PackageOpen className={`w-4 h-4 ${isShaking ? 'animate-bounce' : ''}`} />
                        {isShaking ? 'Đang xé niêm phong...' : 'Mở 1 gói ngay'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          {/* Pack Shop */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <ShoppingBag className="w-4 h-4 text-amber-400" />
                  Cửa hàng Gói Thẻ &amp; Tiếp tế CLB
                </h3>
                <p className="text-[11px] text-slate-400 mt-0.5">
                  Chống lạm phát: tối đa 1 gói/loại mỗi ngày (làm mới lúc 00:00)
                </p>
              </div>
              <span className="font-mono-num text-xs font-bold text-emerald-400">
                Ngân sách: €{career.transferBudget.toFixed(1)}M
              </span>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {PACK_CATALOG.filter((p) => p.buyPriceM > 0).map((pack) => {
                const canAfford = career.transferBudget >= pack.buyPriceM;
                const boughtToday = hasPurchasedPackToday(inventory, pack.id);
                const owned = inventory.packs[pack.id] ?? 0;
                return (
                  <div
                    key={pack.id}
                    className={`rounded-xl bg-[#0B1117] border p-4 flex flex-col justify-between gap-3 ${
                      boughtToday ? 'border-white/5 opacity-85' : 'border-white/10'
                    }`}
                  >
                    <div className="space-y-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-bold text-slate-400">
                          {pack.badgeText} · {pack.subtitle}
                        </span>
                        <div className="flex items-center gap-2">
                          <span
                            className={`font-mono-num text-[11px] font-bold ${
                              boughtToday ? 'text-amber-400' : 'text-emerald-400'
                            }`}
                          >
                            {boughtToday ? 'Hôm nay: 0/1' : 'Hôm nay: 1/1'}
                          </span>
                          {owned > 0 && (
                            <span className="font-mono-num text-[11px] text-sky-400">
                              · Túi: x{owned}
                            </span>
                          )}
                        </div>
                      </div>
                      <h4 className="text-sm font-bold text-white">{pack.name}</h4>
                      <p className="text-xs text-slate-400 leading-relaxed">{pack.description}</p>
                    </div>

                    <button
                      type="button"
                      disabled={boughtToday || !canAfford || busyKey === `buy-${pack.id}`}
                      onClick={() => handleBuyPackAction(pack.id)}
                      className="w-full h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-white font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-45"
                    >
                      <ShoppingBag className="w-3.5 h-3.5 text-amber-400" />
                      {busyKey === `buy-${pack.id}`
                        ? 'Đang mua...'
                        : boughtToday
                          ? 'Đã mua hôm nay (1/1)'
                          : canAfford
                            ? `Mua gói (-€${pack.buyPriceM}M)`
                            : `Không đủ €${pack.buyPriceM}M`}
                    </button>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* TAB 2: PLAYER CARDS BAG */}
      {subTab === 'cards' && (
        <div className="space-y-3">
          <div className="flex flex-col lg:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={searchText}
                onChange={(e) => setSearchText(e.target.value)}
                placeholder="Tìm thẻ cầu thủ theo tên, vị trí, CLB..."
                className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#121B24] border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10 shrink-0">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'squad', label: 'Phôi ĐH' },
                { id: 'new', label: 'Tân binh' },
                { id: 'excess', label: 'Dư thừa' },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setCardFilter(f.id as typeof cardFilter)}
                  className={`h-9 px-2.5 rounded-lg text-xs font-semibold whitespace-nowrap ${
                    cardFilter === f.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          {onBulkDismantleCards && quickDismantlePlan.totalCards > 0 && (
            <div className="rounded-xl bg-[#121B24] border border-amber-400/25 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2">
              <p className="text-xs text-slate-300">
                Có <strong className="text-white font-mono-num">{quickDismantlePlan.totalCards}</strong> thẻ dư an toàn (cầu thủ ĐH đã 7★ hoặc thẻ thường ngoài ĐH).
              </p>
              <button
                type="button"
                disabled={busyKey === 'bulk-dis'}
                onClick={handleBulkDismantleAction}
                className="h-9 px-3 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 text-xs font-bold flex items-center gap-1.5 disabled:opacity-50 shrink-0"
              >
                <Trash2 className="w-3.5 h-3.5" />
                {busyKey === 'bulk-dis'
                  ? 'Đang tách...'
                  : `Tách nhanh (+${quickDismantlePlan.totalShards} Mảnh)`}
              </button>
            </div>
          )}

          {cardEntries.length === 0 ? (
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-8 text-center space-y-2">
              <p className="text-sm font-bold text-white">Chưa có thẻ cầu thủ nào phù hợp</p>
              <p className="text-xs text-slate-400">
                Mở các gói thẻ trong tab &quot;Mở Thẻ &amp; Quà&quot; để sưu tầm thẻ trùng lặp cho đội hình và tách thẻ dư lấy Mảnh Ngôi Sao.
              </p>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              {cardEntries.map(({ player, count, inSquad }) => {
                const club = getClubById(player.clubId);
                const rarity = getCardRarityTier(player.rating, player.cardTier);
                const upgradeTier = resolvePlayerUpgradeTier(player);
                const dismantleShards = getCardDismantleShards(player.rating, player.cardTier);
                const plan = inSquad
                  ? getStarUpgradePlan(player, inventory, career.transferBudget)
                  : null;

                return (
                  <div
                    key={player.id}
                    className={`rounded-2xl bg-[#121B24] border p-4 space-y-3 ${rarity.borderClass}`}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(player)}
                        className="flex items-center gap-3 min-w-0 text-left"
                      >
                        <PlayerAvatar player={player} club={club} size={50} isUserCard={inSquad} />
                        <div className="min-w-0">
                          <p className={`text-[11px] font-bold ${rarity.textClass}`}>
                            {rarity.label} · {inSquad ? 'Phôi Đội hình' : 'Thẻ Tân binh'}
                          </p>
                          <p className="text-sm font-bold text-white truncate">{player.name}</p>
                          <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                            <ClubCrest club={club} size={14} />
                            <span>
                              {player.position} · OVR {player.rating}
                            </span>
                            {inSquad && renderStarsRow(player.stars ?? 1, 'w-3 h-3')}
                          </div>
                        </div>
                      </button>

                      <div className="text-right shrink-0">
                        <span className="inline-block px-2.5 py-1 rounded-lg bg-[#0B1117] border border-white/10 font-mono-num text-xs font-extrabold text-emerald-400">
                          Lưu trữ: x{count}
                        </span>
                        <p className="text-[10px] text-slate-400 mt-1">
                          Bậc {upgradeTier.label}
                          {!inSquad ? ` · Giá €${player.marketValueM}M` : ''}
                        </p>
                      </div>
                    </div>

                    {inSquad && plan && (
                      <div className="rounded-xl bg-[#0B1117] border border-white/5 px-3 py-1.5 text-[11px] flex items-center justify-between gap-2">
                        {plan.isMax ? (
                          <span className="text-amber-300 font-semibold">
                            Đã đạt tối đa 7★ · Có thể tách thẻ dư lấy +{dismantleShards} Mảnh/thẻ
                          </span>
                        ) : (
                          <>
                            <span className="text-slate-300">
                              Tiến độ lên {plan.nextStars}★:{' '}
                              <strong className={plan.hasEnoughCards ? 'text-emerald-400' : 'text-amber-300'}>
                                {count}/{plan.cardsRequired} thẻ
                              </strong>{' '}
                              ·{' '}
                              <strong className={plan.hasEnoughShards ? 'text-amber-300' : 'text-red-400'}>
                                {plan.shardsRequired} Mảnh
                              </strong>
                            </span>
                            {plan.canUpgrade && (
                              <span className="text-emerald-400 font-bold shrink-0">Sẵn sàng!</span>
                            )}
                          </>
                        )}
                      </div>
                    )}

                    <div className="grid grid-cols-2 gap-2">
                      {inSquad ? (
                        <button
                          type="button"
                          onClick={() => {
                            if (plan?.canUpgrade) {
                              handleUpgradeAction(player.id);
                            } else {
                              onSelectPlayer(player);
                            }
                          }}
                          disabled={busyKey === `up-${player.id}`}
                          className={`h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 ${
                            plan?.canUpgrade
                              ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                              : 'bg-slate-800 hover:bg-slate-700 text-white'
                          }`}
                        >
                          <ArrowUpCircle className="w-3.5 h-3.5" />
                          {plan?.isMax
                            ? 'Đã tối đa 7★'
                            : plan?.canUpgrade
                              ? `Nâng lên ${plan.nextStars}★`
                              : 'Xem điều kiện sao'}
                        </button>
                      ) : (
                        <button
                          type="button"
                          disabled={
                            career.squad.length >= 45 ||
                            career.transferBudget < player.marketValueM ||
                            busyKey === `rec-${player.id}`
                          }
                          onClick={() => handleRecruitAction(player.id)}
                          className="h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-45"
                        >
                          <UserPlus className="w-3.5 h-3.5" />
                          {career.squad.length >= 45
                            ? 'Đội đầy (45)'
                            : career.transferBudget < player.marketValueM
                              ? `Thiếu €${player.marketValueM}M`
                              : `Chiêu mộ (-€${player.marketValueM}M)`}
                        </button>
                      )}

                      <button
                        type="button"
                        disabled={busyKey === `dis-${player.id}`}
                        onClick={() => handleDismantleAction(player.id)}
                        className="h-10 rounded-xl bg-[#0B1117] hover:bg-slate-800 border border-white/10 text-amber-300 text-xs font-semibold flex items-center justify-center gap-1.5 disabled:opacity-50"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                        Tách 1 (+{dismantleShards} Mảnh)
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {/* TAB 3: SQUAD STAR MERGING */}
      {subTab === 'upgrade' && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-1.5">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Star className="w-4 h-4 text-amber-400 fill-amber-400" />
              Đột Phá Sao Đội Hình (1★ → 7★)
            </h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Yêu cầu <strong className="text-white">đủ cả Thẻ Trùng Lặp</strong> của chính cầu thủ đó{' '}
              <strong className="text-amber-300">LẪN Mảnh Ngôi Sao</strong> theo bậc hiếm (Tiêu chuẩn / Tinh anh / Siêu sao / Huyền thoại). Cống hiến ≥20 trận được giảm 20% Mảnh; mốc <strong className="text-sky-300">3★ giảm hao thể lực</strong>, <strong className="text-amber-300">5★ tối ưu phong độ đỉnh cao</strong> và <strong className="text-amber-200">7★ Đỉnh cao Huyền thoại</strong>.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            {upgradeCandidates.map(({ player, plan }) => {
              const club = getClubById(player.clubId);
              return (
                <div
                  key={player.id}
                  className={`rounded-2xl bg-[#121B24] border p-4 space-y-3 ${
                    plan.canUpgrade
                      ? 'border-emerald-500/45'
                      : plan.isMax
                        ? 'border-amber-400/35'
                        : 'border-white/10'
                  }`}
                >
                  <div className="flex items-start justify-between gap-3">
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(player)}
                      className="flex items-center gap-3 min-w-0 text-left"
                    >
                      <PlayerAvatar player={player} club={club} size={48} isUserCard />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <p className="text-sm font-bold text-white truncate">{player.name}</p>
                          <span className="px-1.5 py-0.5 rounded bg-white/5 border border-white/10 text-[9px] font-bold text-slate-300 shrink-0">
                            {plan.tierLabel}
                          </span>
                        </div>
                        <div className="flex items-center gap-2 mt-0.5">
                          {renderStarsRow(plan.currentStars)}
                          <span className="text-xs text-slate-400">· {player.position}</span>
                          {plan.loyaltyDiscountApplied && !plan.isMax && (
                            <span className="text-[10px] font-bold text-emerald-400">
                              -20% Mảnh
                            </span>
                          )}
                        </div>
                      </div>
                    </button>

                    <div className="text-right shrink-0">
                      <p className="font-mono-num text-sm font-extrabold text-emerald-400">
                        OVR {player.rating}
                        {!plan.isMax && (
                          <span className="text-amber-400"> → {plan.previewRating}</span>
                        )}
                      </p>
                      {!plan.isMax && plan.step && (
                        <p className="text-[10px] text-slate-400">
                          +{plan.step.ovrGain} OVR (theo vị trí)
                        </p>
                      )}
                    </div>
                  </div>

                  {plan.isMax ? (
                    <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 px-3 py-2 text-xs font-bold text-amber-300 text-center">
                      7★ Biểu tượng CLB · Đỉnh cao Huyền thoại
                    </div>
                  ) : (
                    <>
                      <div className="rounded-xl bg-[#0B1117] border border-white/5 px-3 py-2 text-[11px] text-slate-300 flex flex-wrap items-center justify-between gap-2">
                        <span>
                          Thẻ trùng:{' '}
                          <strong
                            className={`font-mono-num ${
                              plan.hasEnoughCards ? 'text-emerald-400' : 'text-red-400'
                            }`}
                          >
                            {plan.ownedDuplicateCards}/{plan.cardsRequired}
                          </strong>
                        </span>
                        <span>
                          Mảnh:{' '}
                          <strong
                            className={`font-mono-num ${
                              plan.hasEnoughShards ? 'text-amber-400' : 'text-red-400'
                            }`}
                          >
                            {plan.ownedShards}/{plan.shardsRequired}
                          </strong>
                        </span>
                        <span>
                          Phí:{' '}
                          <strong
                            className={`font-mono-num ${
                              plan.canAffordBudget ? 'text-white' : 'text-red-400'
                            }`}
                          >
                            €{plan.feeM}M
                          </strong>
                        </span>
                      </div>

                      <div className="grid grid-cols-2 gap-2">
                        <button
                          type="button"
                          onClick={() => onSelectPlayer(player)}
                          className="h-10 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 text-xs font-semibold"
                        >
                          Xem chỉ số mới
                        </button>
                        <button
                          type="button"
                          disabled={!plan.canUpgrade || busyKey === `up-${player.id}`}
                          onClick={() => handleUpgradeAction(player.id)}
                          className="h-10 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-40"
                        >
                          <ArrowUpCircle className="w-4 h-4" />
                          {busyKey === `up-${player.id}`
                            ? 'Đang nâng...'
                            : !plan.hasEnoughCards
                              ? `Thiếu ${plan.cardsMissing} thẻ`
                              : !plan.hasEnoughShards
                                ? `Thiếu ${plan.shardsMissing} Mảnh`
                                : !plan.canAffordBudget
                                  ? `Thiếu €${plan.feeM}M`
                                  : `Nâng lên ${plan.nextStars}★`}
                        </button>
                      </div>
                    </>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* Pack Shaking Suspense Modal */}
      {openingPack && (() => {
        const packMeta = PACK_CATALOG.find((p) => p.id === openingPack);
        const auraCls =
          packMeta?.theme === 'gold'
            ? 'from-amber-300/45 via-yellow-500/35 to-amber-600/25 border-amber-300/80'
            : packMeta?.theme === 'violet'
              ? 'from-amber-400/35 via-purple-500/30 to-amber-500/20 border-amber-400/70'
              : packMeta?.theme === 'amber'
                ? 'from-amber-400/35 via-yellow-500/25 to-orange-500/20 border-amber-400/70'
                : packMeta?.theme === 'emerald'
                  ? 'from-emerald-400/35 via-teal-500/25 to-emerald-600/20 border-emerald-400/70'
                  : 'from-sky-400/35 via-cyan-500/25 to-blue-500/20 border-sky-400/70';
        const iconCls =
          packMeta?.theme === 'gold' || packMeta?.theme === 'violet' || packMeta?.theme === 'amber'
            ? 'text-amber-300'
            : packMeta?.theme === 'emerald'
              ? 'text-emerald-300'
              : 'text-sky-300';
        return (
          <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/85 backdrop-blur-md p-6">
            <div className="relative flex flex-col items-center text-center max-w-xs w-full">
              {/* Pulsing Halo */}
              <div
                className={`absolute -inset-6 rounded-full bg-gradient-to-br ${auraCls} blur-2xl animate-aura-pulse pointer-events-none`}
              />

              {/* Shaking Sealed Pack Card */}
              <div
                className={`relative w-52 h-68 rounded-3xl bg-gradient-to-b ${auraCls} bg-[#121B24] border-2 p-5 flex flex-col items-center justify-between shadow-2xl animate-pack-shake`}
              >
                <span className="px-2.5 py-0.5 rounded-md bg-black/50 border border-white/15 text-[10px] font-extrabold tracking-widest uppercase text-amber-300">
                  {packMeta?.badgeText ?? 'GÓI THẺ'}
                </span>

                <div className="relative flex items-center justify-center my-2">
                  <div className="w-20 h-20 rounded-2xl bg-black/40 border border-white/15 flex items-center justify-center">
                    <PackageOpen className={`w-10 h-10 ${iconCls}`} />
                  </div>
                  <Sparkles className="w-5 h-5 text-amber-300 absolute -top-2 -right-2 animate-ping" />
                </div>

                <div className="space-y-1">
                  <h4 className="font-display text-xl font-extrabold text-white leading-tight">
                    {packMeta?.name ?? 'Đang mở gói'}
                  </h4>
                  <p className="text-[11px] font-semibold text-slate-300">
                    Đang xé niêm phong...
                  </p>
                </div>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Pack Opening Reveal Modal */}
      {revealResult && (() => {
        const packMeta = PACK_CATALOG.find((p) => p.id === revealResult.packTier);
        const remainingCount = inventory.packs[revealResult.packTier] ?? 0;
        const delayClasses = ['reveal-delay-0', 'reveal-delay-1', 'reveal-delay-2', 'reveal-delay-3'];
        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm">
            <div className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[#121B24] border border-amber-400/35 p-5 space-y-4 animate-pack-burst">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <Sparkles className="w-3.5 h-3.5" />
                    Mở quà thành công
                  </p>
                  <h3 className="font-display text-xl font-extrabold text-white">
                    {packMeta?.name ?? 'Phần thưởng mở gói'}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setRevealResult(null)}
                  className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#0B1117] border border-white/10 text-slate-300 hover:text-white"
                  aria-label="Đóng kết quả mở gói"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div
                className={`grid gap-3 ${
                  revealResult.cards.length === 1
                    ? 'grid-cols-1 max-w-xs mx-auto'
                    : revealResult.cards.length === 2 || revealResult.cards.length === 4
                      ? 'grid-cols-1 sm:grid-cols-2'
                      : 'grid-cols-1 sm:grid-cols-3'
                }`}
              >
                {revealResult.cards.map(({ player, isOwnedInSquad }, idx) => {
                  const club = getClubById(player.clubId);
                  const rarity = getCardRarityTier(player.rating, player.cardTier);
                  const delayCls = delayClasses[idx] ?? 'reveal-delay-2';
                  return (
                    <div
                      key={`${player.id}-${idx}`}
                      className={`rounded-2xl border p-3.5 text-center space-y-2 animate-card-reveal ${delayCls} ${rarity.bgClass} ${rarity.borderClass} ${
                        player.cardTier === 'icon' || player.rating >= 86
                          ? 'shadow-lg shadow-amber-500/25'
                          : ''
                      }`}
                    >
                      <p className={`text-[10px] font-extrabold uppercase ${rarity.textClass}`}>
                        {rarity.label}
                      </p>
                      <div className="flex justify-center">
                        <PlayerAvatar player={player} club={club} size={58} />
                      </div>
                      <div>
                        <p className="font-mono-num text-2xl font-extrabold text-white leading-none">
                          {player.rating}
                        </p>
                        <p className="text-xs font-bold text-white truncate mt-1">
                          {player.name}
                        </p>
                        <p className="text-[11px] text-slate-300">
                          {player.position} · {club.shortName}
                        </p>
                      </div>
                      <p className="text-[10px] font-semibold text-emerald-300 bg-[#0B1117]/70 rounded-lg px-2 py-1">
                        {isOwnedInSquad ? 'Phôi ghép sao (+1 thẻ)' : 'Thẻ mới vào túi'}
                      </p>
                    </div>
                  );
                })}
              </div>

              {/* Bonus Resources */}
              <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex flex-wrap items-center justify-center gap-4 text-xs animate-card-reveal reveal-delay-3">
                {revealResult.shardsGained > 0 && (
                  <span className="font-bold text-amber-400">
                    +{revealResult.shardsGained} Mảnh Ngôi Sao
                  </span>
                )}
                {revealResult.boostersGained > 0 && (
                  <span className="font-bold text-sky-400">
                    +{revealResult.boostersGained} Bình Thể Lực
                  </span>
                )}
                {revealResult.budgetGainedM > 0 && (
                  <span className="font-bold text-emerald-400">
                    +€{revealResult.budgetGainedM.toFixed(1)}M Ngân sách
                  </span>
                )}
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {remainingCount > 0 && (
                  <button
                    type="button"
                    disabled={Boolean(busyKey)}
                    onClick={() => handleOpenPackAction(revealResult.packTier)}
                    className="h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs"
                  >
                    Mở tiếp 1 gói (Còn {remainingCount})
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setRevealResult(null)}
                  className={`h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs ${
                    remainingCount === 0 ? 'sm:col-span-2' : ''
                  }`}
                >
                  Cất vào Túi đồ
                </button>
              </div>
            </div>
          </div>
        );
      })()}

      {/* Fitness Booster Player Picker Modal */}
      {showBoosterPicker && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[#121B24] border border-white/15 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold text-sky-400 uppercase">
                  Bình Hồi Thể Lực (Còn {inventory.fitnessBoosters} · +{FITNESS_BOOSTER_RECOVERY}%/bình)
                </p>
                <h3 className="font-display text-lg font-extrabold text-white">
                  Chọn cầu thủ cần hồi +{FITNESS_BOOSTER_RECOVERY}% thể lực
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowBoosterPicker(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#0B1117] text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {feedback && (
              <div
                className={`rounded-xl p-2.5 text-xs border ${
                  feedback.ok
                    ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
                    : 'bg-red-500/15 border-red-500/35 text-red-200'
                }`}
              >
                {feedback.text}
              </div>
            )}

            {tiredSquadPlayers.length === 0 || inventory.fitnessBoosters <= 0 ? (
              <div className="rounded-xl bg-[#0B1117] border border-white/10 p-4 text-center text-xs text-slate-300">
                {inventory.fitnessBoosters <= 0
                  ? 'Bạn đã dùng hết Bình Thể Lực.'
                  : 'Tất cả cầu thủ đều đã đạt 100% thể lực!'}
              </div>
            ) : (
              <div className="space-y-2 max-h-[340px] overflow-y-auto">
                {tiredSquadPlayers.map((p) => {
                  const nextFit = Math.min(100, p.fitness + FITNESS_BOOSTER_RECOVERY);
                  const gain = nextFit - p.fitness;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      disabled={busyKey === `boost-${p.id}`}
                      onClick={() => handleUseBoosterAction(p.id)}
                      className="w-full flex items-center justify-between rounded-xl bg-[#0B1117] border border-white/10 hover:border-sky-400/50 px-3 py-2.5 text-left"
                    >
                      <div>
                        <p className="text-sm font-bold text-white">{p.name}</p>
                        <p className="text-xs text-slate-400">
                          {p.position} · Thể lực:{' '}
                          <strong className="text-amber-400">{p.fitness}%</strong> →{' '}
                          <strong className="text-emerald-400">{nextFit}%</strong>
                        </p>
                      </div>
                      <span className="px-3 py-1.5 rounded-lg bg-sky-500 text-slate-950 text-xs font-bold shrink-0">
                        {busyKey === `boost-${p.id}` ? 'Đang dùng...' : `Hồi +${gain}%`}
                      </span>
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}
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
