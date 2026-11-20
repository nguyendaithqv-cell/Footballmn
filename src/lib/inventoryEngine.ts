import {
  CardTier,
  InventoryState,
  OpenedCardReward,
  PackOpenResult,
  PackTier,
  Player,
} from '../types/game';

export interface PackCatalogItem {
  id: PackTier;
  name: string;
  subtitle: string;
  description: string;
  buyPriceM: number; // 0 means gift-only (not sold in shop)
  cardCount: number;
  badgeText: string;
  theme: 'emerald' | 'sky' | 'amber' | 'violet' | 'gold';
}

export const PACK_CATALOG: PackCatalogItem[] = [
  {
    id: 'starter_pack',
    name: 'Gói Quà Tân Thủ',
    subtitle: 'Quà ra mắt HLV trưởng',
    description: 'Mở 3 thẻ cầu thủ (đảm bảo 1 sao 82+), +15 Mảnh Ngôi Sao, +1 Bình Thể Lực & +€2.0M.',
    buyPriceM: 0,
    cardCount: 3,
    badgeText: 'QUÀ TẶNG',
    theme: 'emerald',
  },
  {
    id: 'scout_pack',
    name: 'Gói Tuyển Trạch',
    subtitle: 'Thưởng trận thắng · Săn phôi nâng sao',
    description: 'Mở 3 thẻ cầu thủ OVR 74+, kèm 8–14 Mảnh Ngôi Sao và cơ hội nhận Bình Thể Lực.',
    buyPriceM: 6,
    cardCount: 3,
    badgeText: 'PHỔ THÔNG',
    theme: 'sky',
  },
  {
    id: 'elite_pack',
    name: 'Gói Tinh Anh 82+',
    subtitle: 'Đảm bảo ít nhất 1 thẻ 82+',
    description: 'Mở 3 thẻ cầu thủ chất lượng cao (1+ sao OVR 82+), kèm 15–24 Mảnh Ngôi Sao.',
    buyPriceM: 14,
    cardCount: 3,
    badgeText: 'TINH ANH',
    theme: 'emerald',
  },
  {
    id: 'legend_pack',
    name: 'Gói Siêu Sao 86+',
    subtitle: 'Đảm bảo 1 siêu sao 86+ · 15% ra ICON',
    description: 'Mở 3 thẻ cầu thủ đỉnh cao (1+ siêu sao OVR 86+ kèm 15% cơ hội nổ Huyền Thoại ICON), +25–40 Mảnh & Bình Thể Lực.',
    buyPriceM: 28,
    cardCount: 3,
    badgeText: 'SIÊU SAO',
    theme: 'violet',
  },
  {
    id: 'icon_pack',
    name: 'Gói Huyền Thoại ICON',
    subtitle: 'Đảm bảo chắc chắn 1 Huyền Thoại 89–96',
    description: 'Triệu hồi 1 Huyền Thoại ICON bất tử (Pelé, Maradona, R9, Zidane...) + 2 thẻ 80–82+, +40–65 Mảnh Ngôi Sao & 2 Bình Thể Lực.',
    buyPriceM: 65,
    cardCount: 3,
    badgeText: 'HUYỀN THOẠI',
    theme: 'gold',
  },
  {
    id: 'trophy_gift_box',
    name: 'Rương Quà Vinh Quang',
    subtitle: 'Tài nguyên & Quỹ phát triển',
    description: '1 thẻ cầu thủ 80+, 22–35 Mảnh Ngôi Sao, 1–2 Bình Thể Lực và thưởng +€2.5M–€5.0M.',
    buyPriceM: 8,
    cardCount: 1,
    badgeText: 'RƯƠNG QUÀ',
    theme: 'amber',
  },
];

export interface StarUpgradeStep {
  fromStars: number;
  toStars: number;
  cardsRequired: number;
  shardEquivPerCard: number;
  totalShardsIfNoCard: number;
  feeM: number;
  ovrGain: number;
  attrGain: number;
  valueMultiplier: number;
}

export const STAR_UPGRADE_STEPS: StarUpgradeStep[] = [
  {
    fromStars: 1,
    toStars: 2,
    cardsRequired: 1,
    shardEquivPerCard: 25,
    totalShardsIfNoCard: 25,
    feeM: 1.0,
    ovrGain: 1,
    attrGain: 2,
    valueMultiplier: 1.12,
  },
  {
    fromStars: 2,
    toStars: 3,
    cardsRequired: 1,
    shardEquivPerCard: 45,
    totalShardsIfNoCard: 45,
    feeM: 2.5,
    ovrGain: 2,
    attrGain: 3,
    valueMultiplier: 1.18,
  },
  {
    fromStars: 3,
    toStars: 4,
    cardsRequired: 2,
    shardEquivPerCard: 38,
    totalShardsIfNoCard: 76,
    feeM: 5.0,
    ovrGain: 2,
    attrGain: 3,
    valueMultiplier: 1.22,
  },
  {
    fromStars: 4,
    toStars: 5,
    cardsRequired: 2,
    shardEquivPerCard: 55,
    totalShardsIfNoCard: 110,
    feeM: 8.0,
    ovrGain: 3,
    attrGain: 4,
    valueMultiplier: 1.28,
  },
];

export interface StarUpgradePlan {
  currentStars: number;
  nextStars: number;
  isMax: boolean;
  step?: StarUpgradeStep;
  ownedDuplicateCards: number;
  cardsToUse: number;
  shardsToUse: number;
  feeM: number;
  canAffordMaterials: boolean;
  canAffordBudget: boolean;
  canUpgrade: boolean;
  previewRating: number;
  previewAttributes: Player['attributes'];
  previewValueM: number;
}

export function createStarterInventory(): InventoryState {
  return {
    packs: {
      starter_pack: 1,
      scout_pack: 2,
      elite_pack: 1,
      legend_pack: 0,
      icon_pack: 0,
      trophy_gift_box: 1,
    },
    playerCards: {},
    universalShards: 30,
    fitnessBoosters: 2,
    totalPacksOpened: 0,
  };
}

export function normalizeInventory(inv?: Partial<InventoryState>): InventoryState {
  const rawPacks = inv?.packs ?? ({} as Partial<Record<PackTier, number>>);
  const rawCards = inv?.playerCards ?? {};
  const cleanCards: Record<string, number> = {};
  for (const [pid, count] of Object.entries(rawCards)) {
    const n = Math.floor(Number(count) || 0);
    if (pid && n > 0) {
      cleanCards[pid] = n;
    }
  }
  return {
    packs: {
      starter_pack: Math.max(0, Math.floor(Number(rawPacks.starter_pack) || 0)),
      scout_pack: Math.max(0, Math.floor(Number(rawPacks.scout_pack) || 0)),
      elite_pack: Math.max(0, Math.floor(Number(rawPacks.elite_pack) || 0)),
      legend_pack: Math.max(0, Math.floor(Number(rawPacks.legend_pack) || 0)),
      icon_pack: Math.max(0, Math.floor(Number(rawPacks.icon_pack) || 0)),
      trophy_gift_box: Math.max(0, Math.floor(Number(rawPacks.trophy_gift_box) || 0)),
    },
    playerCards: cleanCards,
    universalShards: Math.max(0, Math.floor(Number(inv?.universalShards) || 0)),
    fitnessBoosters: Math.max(0, Math.floor(Number(inv?.fitnessBoosters) || 0)),
    totalPacksOpened: Math.max(0, Math.floor(Number(inv?.totalPacksOpened) || 0)),
  };
}

export function getTotalUnopenedPacks(inv?: InventoryState): number {
  if (!inv) return 0;
  return Object.values(inv.packs).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

export function getTotalCardsCount(inv?: InventoryState): number {
  if (!inv) return 0;
  return Object.values(inv.playerCards).reduce((sum, n) => sum + (Number(n) || 0), 0);
}

export function getCardRarityTier(
  rating: number,
  cardTier?: CardTier
): {
  label: string;
  textClass: string;
  borderClass: string;
  bgClass: string;
} {
  if (cardTier === 'icon') {
    return {
      label: 'Huyền Thoại ICON',
      textClass: 'text-amber-300',
      borderClass: 'border-amber-400/75',
      bgClass: 'bg-gradient-to-br from-amber-500/20 via-yellow-500/10 to-[#121B24]',
    };
  }
  if (cardTier === 'global') {
    return {
      label: 'Siêu Sao Quốc Tế',
      textClass: 'text-pink-300',
      borderClass: 'border-pink-400/55',
      bgClass: 'bg-pink-500/10',
    };
  }
  if (rating >= 86) {
    return {
      label: 'Siêu Sao',
      textClass: 'text-amber-300',
      borderClass: 'border-amber-400/50',
      bgClass: 'bg-amber-500/15',
    };
  }
  if (rating >= 81) {
    return {
      label: 'Tinh Anh',
      textClass: 'text-emerald-300',
      borderClass: 'border-emerald-400/45',
      bgClass: 'bg-emerald-500/15',
    };
  }
  return {
    label: 'Tiêu Chuẩn',
    textClass: 'text-sky-300',
    borderClass: 'border-sky-400/35',
    bgClass: 'bg-sky-500/10',
  };
}

export function getCardDismantleShards(rating: number, cardTier?: CardTier): number {
  if (cardTier === 'icon') return 55;
  if (rating >= 86) return 35;
  if (rating >= 81) return 18;
  return 10;
}

export function getStarUpgradePlan(
  player: Player,
  inventory: InventoryState,
  transferBudgetM: number
): StarUpgradePlan {
  const currentStars = Math.max(1, Math.min(5, player.stars ?? 1));
  const step = STAR_UPGRADE_STEPS.find((s) => s.fromStars === currentStars);
  const ownedDuplicateCards = inventory.playerCards[player.id] ?? 0;

  if (!step || currentStars >= 5) {
    return {
      currentStars: 5,
      nextStars: 5,
      isMax: true,
      ownedDuplicateCards,
      cardsToUse: 0,
      shardsToUse: 0,
      feeM: 0,
      canAffordMaterials: false,
      canAffordBudget: false,
      canUpgrade: false,
      previewRating: player.rating,
      previewAttributes: player.attributes,
      previewValueM: player.marketValueM,
    };
  }

  const cardsToUse = Math.min(step.cardsRequired, ownedDuplicateCards);
  const missingCards = step.cardsRequired - cardsToUse;
  const shardsToUse = missingCards * step.shardEquivPerCard;

  const canAffordMaterials = inventory.universalShards >= shardsToUse;
  const canAffordBudget = transferBudgetM >= step.feeM;

  const previewRating = Math.min(99, player.rating + step.ovrGain);
  const previewAttributes: Player['attributes'] = {
    pac: Math.min(99, player.attributes.pac + step.attrGain),
    sho: Math.min(99, player.attributes.sho + step.attrGain),
    pas: Math.min(99, player.attributes.pas + step.attrGain),
    dri: Math.min(99, player.attributes.dri + step.attrGain),
    def: Math.min(99, player.attributes.def + step.attrGain),
    phy: Math.min(99, player.attributes.phy + step.attrGain),
  };
  const previewValueM = Number((player.marketValueM * step.valueMultiplier).toFixed(1));

  return {
    currentStars,
    nextStars: step.toStars,
    isMax: false,
    step,
    ownedDuplicateCards,
    cardsToUse,
    shardsToUse,
    feeM: step.feeM,
    canAffordMaterials,
    canAffordBudget,
    canUpgrade: canAffordMaterials && canAffordBudget,
    previewRating,
    previewAttributes,
    previewValueM,
  };
}

export function applyPlayerStarUpgrade(
  player: Player,
  plan: StarUpgradePlan
): Player {
  if (plan.isMax || !plan.step) return player;
  return {
    ...player,
    stars: plan.nextStars,
    rating: plan.previewRating,
    potential: Math.max(player.potential, plan.previewRating),
    marketValueM: plan.previewValueM,
    morale: Math.min(100, player.morale + 6),
    attributes: plan.previewAttributes,
  };
}

function pickWeightedPlayer(
  pool: Player[],
  squadIds: Set<string>,
  excludeIds: Set<string>
): Player {
  const filtered = pool.filter((p) => !excludeIds.has(p.id));
  const activePool = filtered.length > 0 ? filtered : pool;
  const weights = activePool.map((p) => {
    const inSquadBoost = squadIds.has(p.id) ? 1.55 : 1;
    const ratingWeight = Math.max(0.5, 1.4 - Math.max(0, p.rating - 78) * 0.06);
    return inSquadBoost * ratingWeight;
  });
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < activePool.length; i++) {
    r -= weights[i];
    if (r <= 0) return activePool[i];
  }
  return activePool[activePool.length - 1];
}

export function openPackFromInventory(
  packTier: PackTier,
  inventory: InventoryState,
  squad: Player[],
  allPlayers: Player[]
): { nextInventory: InventoryState; result: PackOpenResult } | null {
  const norm = normalizeInventory(inventory);
  if ((norm.packs[packTier] ?? 0) <= 0) return null;

  const squadIds = new Set(squad.map((p) => p.id));
  const pickedIds = new Set<string>();
  const drawnPlayers: Player[] = [];

  const iconPool = allPlayers.filter((p) => p.cardTier === 'icon' || p.clubId === 'icons-fc');
  const regularPool = allPlayers.filter((p) => p.cardTier !== 'icon' && p.clubId !== 'icons-fc');

  const pool74 = regularPool.filter((p) => p.rating >= 74);
  const pool78 = regularPool.filter((p) => p.rating >= 78);
  const pool80 = regularPool.filter((p) => p.rating >= 80);
  const pool82 = regularPool.filter((p) => p.rating >= 82);
  const pool86 = regularPool.filter((p) => p.rating >= 86);

  const pickFrom = (pool: Player[]) => {
    const active = pool.length > 0 ? pool : regularPool.length > 0 ? regularPool : allPlayers;
    const pl = pickWeightedPlayer(active, squadIds, pickedIds);
    pickedIds.add(pl.id);
    drawnPlayers.push(pl);
  };

  let shardsGained = 0;
  let boostersGained = 0;
  let budgetGainedM = 0;

  if (packTier === 'starter_pack') {
    pickFrom(pool82);
    pickFrom(pool78);
    pickFrom(pool74);
    shardsGained = 15;
    boostersGained = 1;
    budgetGainedM = 2.0;
  } else if (packTier === 'scout_pack') {
    pickFrom(pool78);
    pickFrom(pool74);
    pickFrom(pool74);
    shardsGained = 8 + Math.floor(Math.random() * 7);
    boostersGained = Math.random() < 0.3 ? 1 : 0;
  } else if (packTier === 'elite_pack') {
    if (iconPool.length > 0 && Math.random() < 0.04) {
      pickFrom(iconPool);
    } else {
      pickFrom(pool82);
    }
    pickFrom(pool80);
    pickFrom(pool78);
    shardsGained = 15 + Math.floor(Math.random() * 10);
    boostersGained = Math.random() < 0.5 ? 1 : 0;
  } else if (packTier === 'legend_pack') {
    if (iconPool.length > 0 && Math.random() < 0.15) {
      pickFrom(iconPool);
    } else {
      pickFrom(pool86);
    }
    pickFrom(pool82);
    pickFrom(pool80);
    shardsGained = 25 + Math.floor(Math.random() * 16);
    boostersGained = 1;
  } else if (packTier === 'icon_pack') {
    pickFrom(iconPool.length > 0 ? iconPool : pool86);
    if (iconPool.length > 1 && Math.random() < 0.1) {
      pickFrom(iconPool);
    } else {
      pickFrom(pool82);
    }
    pickFrom(pool80);
    shardsGained = 40 + Math.floor(Math.random() * 26);
    boostersGained = 2;
  } else {
    // trophy_gift_box
    pickFrom(pool80);
    shardsGained = 22 + Math.floor(Math.random() * 14);
    boostersGained = Math.random() < 0.55 ? 2 : 1;
    budgetGainedM = Number((2.5 + Math.random() * 2.5).toFixed(1));
  }

  const nextCards = { ...norm.playerCards };
  const rewards: OpenedCardReward[] = drawnPlayers.map((pl) => {
    const prevCount = nextCards[pl.id] ?? 0;
    nextCards[pl.id] = prevCount + 1;
    return {
      player: pl,
      isOwnedInSquad: squadIds.has(pl.id),
      isNewToBag: prevCount === 0,
    };
  });

  const nextInventory: InventoryState = {
    packs: {
      ...norm.packs,
      [packTier]: Math.max(0, norm.packs[packTier] - 1),
    },
    playerCards: nextCards,
    universalShards: norm.universalShards + shardsGained,
    fitnessBoosters: norm.fitnessBoosters + boostersGained,
    totalPacksOpened: (norm.totalPacksOpened ?? 0) + 1,
  };

  return {
    nextInventory,
    result: {
      packTier,
      cards: rewards,
      shardsGained,
      boostersGained,
      budgetGainedM,
    },
  };
}
