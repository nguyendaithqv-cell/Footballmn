import { INITIAL_PLAYERS } from '../data/footballDatabase';
import {
  CardTier,
  InventoryState,
  OpenedCardReward,
  PackOpenResult,
  PackTier,
  Player,
  Position,
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

export type PlayerUpgradeTier = 'standard' | 'elite' | 'superstar' | 'legend';

export const MAX_PLAYER_STARS = 7;

export const FITNESS_BOOSTER_RECOVERY = 25;

export const PACK_CATALOG: PackCatalogItem[] = [
  {
    id: 'starter_pack',
    name: 'Gói Quà Tân Thủ',
    subtitle: 'Quà ra mắt HLV trưởng',
    description:
      'Mở 4 thẻ ngẫu nhiên công bằng (đảm bảo 1 thẻ 82+ · 2% ICON · 4% UCL \'17), +20 Mảnh Ngôi Sao, +1 Bình Thể Lực & +€2.0M.',
    buyPriceM: 0,
    cardCount: 4,
    badgeText: 'QUÀ TẶNG',
    theme: 'emerald',
  },
  {
    id: 'scout_pack',
    name: 'Gói Tuyển Trạch',
    subtitle: 'Thưởng trận thắng · Đủ 401 cầu thủ hệ thống',
    description:
      'Mở 4 thẻ ngẫu nhiên công bằng toàn hệ thống (1% ICON · 2% UCL \'17 · 10% 86+ ở lượt chính), kèm 10–16 Mảnh Ngôi Sao.',
    buyPriceM: 6,
    cardCount: 4,
    badgeText: 'PHỔ THÔNG',
    theme: 'sky',
  },
  {
    id: 'elite_pack',
    name: 'Gói Tinh Anh 82+',
    subtitle: 'Đảm bảo ít nhất 1 thẻ 82+',
    description:
      'Mở 4 thẻ chất lượng cao (lượt chính 5% ICON · 5% UCL \'17 · 25% 86+ · 65% 82–85), kèm 18–28 Mảnh Ngôi Sao.',
    buyPriceM: 14,
    cardCount: 4,
    badgeText: 'TINH ANH',
    theme: 'emerald',
  },
  {
    id: 'legend_pack',
    name: 'Gói Siêu Sao 86+',
    subtitle: 'Đảm bảo 1 Siêu Sao 86+ hoặc Huyền Thoại',
    description:
      'Mở 4 thẻ đỉnh cao (lượt chính 16% ICON · 14% UCL \'17 · 70% Siêu Sao 86+), kèm 28–45 Mảnh Ngôi Sao & 1 Bình Thể Lực.',
    buyPriceM: 28,
    cardCount: 4,
    badgeText: 'SIÊU SAO',
    theme: 'violet',
  },
  {
    id: 'icon_pack',
    name: 'Gói Huyền Thoại ICON',
    subtitle: 'Mở 1 thẻ duy nhất · 95% Huyền Thoại 89–96',
    description:
      'Mở duy nhất 1 thẻ đỉnh cao (95% nổ Huyền Thoại ICON · 3% UCL \'17 · 2% Siêu Sao 86+), +45–70 Mảnh Ngôi Sao & 2 Bình Thể Lực.',
    buyPriceM: 65,
    cardCount: 1,
    badgeText: 'HUYỀN THOẠI',
    theme: 'gold',
  },
  {
    id: 'trophy_gift_box',
    name: 'Rương Quà Vinh Quang',
    subtitle: 'Tài nguyên & Thẻ thưởng 80+',
    description:
      'Mở 2 thẻ 78+/80+ (4% ICON · 5% UCL \'17 · 21% 86+ ở lượt chính), 25–38 Mảnh Ngôi Sao, 1–2 Bình Thể Lực & +€2.5M–€5.0M.',
    buyPriceM: 8,
    cardCount: 2,
    badgeText: 'RƯƠNG QUÀ',
    theme: 'amber',
  },
];

export interface StarUpgradeStep {
  fromStars: number;
  toStars: number;
  cardsRequired: number;
  ovrGain: number;
  valueMultiplier: number;
  shardsByTier: Record<PlayerUpgradeTier, number>;
  feeByTier: Record<PlayerUpgradeTier, number>;
}

export const STAR_UPGRADE_STEPS: StarUpgradeStep[] = [
  {
    fromStars: 1,
    toStars: 2,
    cardsRequired: 1,
    ovrGain: 1,
    valueMultiplier: 1.06,
    shardsByTier: { standard: 50, elite: 75, superstar: 125, legend: 200 },
    feeByTier: { standard: 1.0, elite: 1.5, superstar: 3.0, legend: 5.0 },
  },
  {
    fromStars: 2,
    toStars: 3,
    cardsRequired: 1,
    ovrGain: 1,
    valueMultiplier: 1.08,
    shardsByTier: { standard: 75, elite: 125, superstar: 200, legend: 300 },
    feeByTier: { standard: 2.0, elite: 3.5, superstar: 6.0, legend: 10.0 },
  },
  {
    fromStars: 3,
    toStars: 4,
    cardsRequired: 2,
    ovrGain: 2,
    valueMultiplier: 1.1,
    shardsByTier: { standard: 125, elite: 175, superstar: 300, legend: 450 },
    feeByTier: { standard: 4.0, elite: 6.0, superstar: 10.0, legend: 16.0 },
  },
  {
    fromStars: 4,
    toStars: 5,
    cardsRequired: 2,
    ovrGain: 2,
    valueMultiplier: 1.12,
    shardsByTier: { standard: 175, elite: 250, superstar: 425, legend: 625 },
    feeByTier: { standard: 6.0, elite: 10.0, superstar: 16.0, legend: 24.0 },
  },
  {
    fromStars: 5,
    toStars: 6,
    cardsRequired: 3,
    ovrGain: 2,
    valueMultiplier: 1.14,
    shardsByTier: { standard: 250, elite: 350, superstar: 575, legend: 850 },
    feeByTier: { standard: 9.0, elite: 15.0, superstar: 24.0, legend: 35.0 },
  },
  {
    fromStars: 6,
    toStars: 7,
    cardsRequired: 3,
    ovrGain: 2,
    valueMultiplier: 1.16,
    shardsByTier: { standard: 350, elite: 500, superstar: 800, legend: 1150 },
    feeByTier: { standard: 14.0, elite: 22.0, superstar: 35.0, legend: 50.0 },
  },
];

export const UPGRADE_TIER_LABELS: Record<PlayerUpgradeTier, string> = {
  standard: 'Tiêu Chuẩn',
  elite: 'Tinh Anh',
  superstar: 'Siêu Sao',
  legend: 'Huyền Thoại',
};

const BASE_PLAYER_MAP = new Map<string, Player>(INITIAL_PLAYERS.map((p) => [p.id, p]));

function getAccumulatedOvrUpToStars(stars: number): number {
  let sum = 0;
  for (const s of STAR_UPGRADE_STEPS) {
    if (s.toStars <= stars) sum += s.ovrGain;
  }
  return sum;
}

export function resolvePlayerUpgradeTier(player: Player): {
  tier: PlayerUpgradeTier;
  label: string;
  baseRating: number;
} {
  const baseSource = BASE_PLAYER_MAP.get(player.id);
  const currentStars = Math.max(1, Math.min(MAX_PLAYER_STARS, player.stars ?? 1));
  const baseRating =
    typeof player.baseRating === 'number' && player.baseRating > 0
      ? player.baseRating
      : baseSource
        ? baseSource.rating
        : Math.max(65, player.rating - getAccumulatedOvrUpToStars(currentStars));
  const effectiveCardTier = player.cardTier ?? baseSource?.cardTier;

  let tier: PlayerUpgradeTier = 'standard';
  if (effectiveCardTier === 'icon' || effectiveCardTier === 'ucl17') {
    tier = 'legend';
  } else if (effectiveCardTier === 'global' || baseRating >= 86) {
    tier = 'superstar';
  } else if (baseRating >= 81) {
    tier = 'elite';
  }

  return {
    tier,
    label: UPGRADE_TIER_LABELS[tier],
    baseRating,
  };
}

export function computeStarAttrDelta(
  position: Position,
  fromStars: number
): Player['attributes'] {
  // Primary / Secondary / Tertiary growth across steps (1->2, 2->3, 3->4, 4->5, 5->6, 6->7)
  const idx = Math.max(0, Math.min(5, fromStars - 1));
  const pri = [2, 3, 3, 4, 4, 5][idx];
  const sec = [1, 2, 2, 3, 3, 4][idx];
  const low = [0, 1, 1, 1, 2, 2][idx];
  const min = [0, 0, 1, 1, 1, 2][idx];

  switch (position) {
    case 'GK':
      return { pac: sec, sho: min, pas: sec, dri: low, def: pri, phy: pri };
    case 'CB':
      return { pac: sec, sho: min, pas: sec, dri: low, def: pri, phy: pri };
    case 'LB':
    case 'RB':
      return { pac: pri, sho: low, pas: sec, dri: sec, def: pri, phy: sec };
    case 'CDM':
      return { pac: low, sho: low, pas: pri, dri: sec, def: pri, phy: pri };
    case 'CM':
      return { pac: low, sho: sec, pas: pri, dri: pri, def: sec, phy: sec };
    case 'CAM':
      return { pac: sec, sho: pri, pas: pri, dri: pri, def: min, phy: low };
    case 'LW':
    case 'RW':
      return { pac: pri, sho: pri, pas: sec, dri: pri, def: min, phy: low };
    case 'ST':
    default:
      return { pac: pri, sho: pri, pas: low, dri: pri, def: min, phy: sec };
  }
}

export interface StarUpgradePlan {
  currentStars: number;
  nextStars: number;
  isMax: boolean;
  tier: PlayerUpgradeTier;
  tierLabel: string;
  baseRating: number;
  step?: StarUpgradeStep;
  ownedDuplicateCards: number;
  cardsRequired: number;
  cardsToUse: number;
  cardsMissing: number;
  shardsRequired: number;
  ownedShards: number;
  shardsMissing: number;
  shardsToUse: number; // Alias matching shardsRequired for upgrade subtraction
  loyaltyDiscountApplied: boolean;
  feeM: number;
  hasEnoughCards: boolean;
  hasEnoughShards: boolean;
  canAffordMaterials: boolean;
  canAffordBudget: boolean;
  canUpgrade: boolean;
  attrGains: Player['attributes'];
  previewRating: number;
  previewAttributes: Player['attributes'];
  previewValueM: number;
}

const VALID_PACK_TIERS: PackTier[] = [
  'starter_pack',
  'scout_pack',
  'elite_pack',
  'legend_pack',
  'icon_pack',
  'trophy_gift_box',
];

export function getTodayPurchaseDateKey(now = new Date()): string {
  const y = now.getFullYear();
  const m = String(now.getMonth() + 1).padStart(2, '0');
  const d = String(now.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function hasPurchasedPackToday(
  inv: InventoryState | undefined,
  packTier: PackTier,
  now = new Date()
): boolean {
  const today = getTodayPurchaseDateKey(now);
  return inv?.dailyPackPurchases?.[packTier] === today;
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
    universalShards: 35,
    fitnessBoosters: 2,
    totalPacksOpened: 0,
    dailyPackPurchases: {},
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
  const cleanDailyPurchases: Partial<Record<PackTier, string>> = {};
  const rawDaily = inv?.dailyPackPurchases ?? {};
  for (const tier of VALID_PACK_TIERS) {
    const val = rawDaily[tier];
    if (typeof val === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(val)) {
      cleanDailyPurchases[tier] = val;
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
    dailyPackPurchases: cleanDailyPurchases,
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
  if (cardTier === 'ucl17') {
    return {
      label: "Vô Địch C1 '17",
      textClass: 'text-indigo-200',
      borderClass: 'border-indigo-400/75',
      bgClass: 'bg-gradient-to-br from-indigo-500/20 via-amber-500/10 to-[#121B24]',
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
  if (cardTier === 'icon') return 60;
  if (cardTier === 'ucl17') return 45;
  if (rating >= 86 || cardTier === 'global') return 35;
  if (rating >= 81) return 18;
  return 10;
}

export function getStarUpgradePlan(
  player: Player,
  inventory: InventoryState,
  transferBudgetM: number
): StarUpgradePlan {
  const currentStars = Math.max(1, Math.min(MAX_PLAYER_STARS, player.stars ?? 1));
  const step = STAR_UPGRADE_STEPS.find((s) => s.fromStars === currentStars);
  const ownedDuplicateCards = inventory.playerCards[player.id] ?? 0;
  const { tier, label: tierLabel, baseRating } = resolvePlayerUpgradeTier(player);
  const zeroGains: Player['attributes'] = { pac: 0, sho: 0, pas: 0, dri: 0, def: 0, phy: 0 };

  if (!step || currentStars >= MAX_PLAYER_STARS) {
    return {
      currentStars: MAX_PLAYER_STARS,
      nextStars: MAX_PLAYER_STARS,
      isMax: true,
      tier,
      tierLabel,
      baseRating,
      ownedDuplicateCards,
      cardsRequired: 0,
      cardsToUse: 0,
      cardsMissing: 0,
      shardsRequired: 0,
      ownedShards: inventory.universalShards,
      shardsMissing: 0,
      shardsToUse: 0,
      loyaltyDiscountApplied: false,
      feeM: 0,
      hasEnoughCards: false,
      hasEnoughShards: false,
      canAffordMaterials: false,
      canAffordBudget: false,
      canUpgrade: false,
      attrGains: zeroGains,
      previewRating: player.rating,
      previewAttributes: player.attributes,
      previewValueM: player.marketValueM,
    };
  }

  // Bắt buộc tiêu thụ CẢ thẻ bản sao trùng lặp LẪN Mảnh Ngôi Sao (không dùng mảnh bù thẻ)
  const cardsRequired = step.cardsRequired;
  const cardsToUse = Math.min(cardsRequired, ownedDuplicateCards);
  const cardsMissing = Math.max(0, cardsRequired - ownedDuplicateCards);

  const rawShards = step.shardsByTier[tier];
  const loyaltyDiscountApplied = (player.appearances ?? 0) >= 20;
  const shardsRequired = loyaltyDiscountApplied
    ? Math.max(5, Math.round(rawShards * 0.8))
    : rawShards;
  const shardsMissing = Math.max(0, shardsRequired - inventory.universalShards);
  const feeM = step.feeByTier[tier];

  const hasEnoughCards = ownedDuplicateCards >= cardsRequired;
  const hasEnoughShards = inventory.universalShards >= shardsRequired;
  const canAffordMaterials = hasEnoughCards && hasEnoughShards;
  const canAffordBudget = transferBudgetM >= feeM;

  const attrGains = computeStarAttrDelta(player.position, currentStars);
  const previewRating = Math.min(99, player.rating + step.ovrGain);
  const previewAttributes: Player['attributes'] = {
    pac: Math.min(99, player.attributes.pac + attrGains.pac),
    sho: Math.min(99, player.attributes.sho + attrGains.sho),
    pas: Math.min(99, player.attributes.pas + attrGains.pas),
    dri: Math.min(99, player.attributes.dri + attrGains.dri),
    def: Math.min(99, player.attributes.def + attrGains.def),
    phy: Math.min(99, player.attributes.phy + attrGains.phy),
  };
  const previewValueM = Number((player.marketValueM * step.valueMultiplier).toFixed(1));

  return {
    currentStars,
    nextStars: step.toStars,
    isMax: false,
    tier,
    tierLabel,
    baseRating,
    step,
    ownedDuplicateCards,
    cardsRequired,
    cardsToUse,
    cardsMissing,
    shardsRequired,
    ownedShards: inventory.universalShards,
    shardsMissing,
    shardsToUse: shardsRequired,
    loyaltyDiscountApplied,
    feeM,
    hasEnoughCards,
    hasEnoughShards,
    canAffordMaterials,
    canAffordBudget,
    canUpgrade: canAffordMaterials && canAffordBudget,
    attrGains,
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
    baseRating: plan.baseRating,
    stars: plan.nextStars,
    rating: plan.previewRating,
    potential: Math.max(player.potential, plan.previewRating),
    marketValueM: plan.previewValueM,
    morale: Math.min(100, player.morale + 6),
    attributes: plan.previewAttributes,
  };
}

export interface QuickDismantleSummary {
  entries: Array<{ playerId: string; count: number; shards: number }>;
  totalCards: number;
  totalShards: number;
}

export function getQuickDismantlePlan(
  inventory: InventoryState,
  squad: Player[],
  allPlayers: Player[]
): QuickDismantleSummary {
  const norm = normalizeInventory(inventory);
  const squadMap = new Map(squad.map((p) => [p.id, p]));
  const dbMap = new Map(allPlayers.map((p) => [p.id, p]));

  const entries: Array<{ playerId: string; count: number; shards: number }> = [];
  let totalCards = 0;
  let totalShards = 0;

  for (const [playerId, count] of Object.entries(norm.playerCards)) {
    if (count <= 0) continue;
    const squadPlayer = squadMap.get(playerId);
    const dbPlayer = dbMap.get(playerId) ?? BASE_PLAYER_MAP.get(playerId);
    const refPlayer = squadPlayer ?? dbPlayer;
    if (!refPlayer) continue;

    // An toàn: chỉ gom tách thẻ của cầu thủ ĐH đã max 7★, hoặc thẻ Tiêu chuẩn/Tinh Anh ngoài ĐH (<86 OVR & không phải ICON/UCL17/Global)
    const isMaxedSquadCard = Boolean(squadPlayer && (squadPlayer.stars ?? 1) >= MAX_PLAYER_STARS);
    const isSafeExcessNonSquad =
      !squadPlayer &&
      refPlayer.cardTier !== 'icon' &&
      refPlayer.cardTier !== 'ucl17' &&
      refPlayer.cardTier !== 'global' &&
      refPlayer.rating < 86;

    if (isMaxedSquadCard || isSafeExcessNonSquad) {
      const shardsPerCard = getCardDismantleShards(refPlayer.rating, refPlayer.cardTier);
      const gained = shardsPerCard * count;
      entries.push({ playerId, count, shards: gained });
      totalCards += count;
      totalShards += gained;
    }
  }

  return { entries, totalCards, totalShards };
}

function pickFairWeightedPlayer(
  pool: Player[],
  excludeIds: Set<string>
): Player {
  const filtered = pool.filter((p) => !excludeIds.has(p.id));
  const activePool = filtered.length > 0 ? filtered : pool;

  let minRating = Infinity;
  for (const p of activePool) {
    if (p.rating < minRating) minRating = p.rating;
  }

  // Công bằng tuyệt đối theo bậc hiếm & OVR (không ưu tiên/bóp tỷ lệ theo đội hình đang sở hữu)
  const weights = activePool.map((p) =>
    Math.max(0.45, 1.15 - Math.max(0, p.rating - minRating) * 0.08)
  );

  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < activePool.length; i++) {
    r -= weights[i];
    if (r <= 0) return activePool[i];
  }
  return activePool[activePool.length - 1];
}

function rollPoolByOdds(
  tiers: Array<{ pool: Player[]; chance: number }>,
  fallbackPool: Player[]
): Player[] {
  const validTiers = tiers.filter((t) => t.pool.length > 0 && t.chance > 0);
  if (validTiers.length === 0) return fallbackPool;
  const totalChance = validTiers.reduce((s, t) => s + t.chance, 0);
  let r = Math.random() * totalChance;
  for (const tier of validTiers) {
    r -= tier.chance;
    if (r <= 0) return tier.pool;
  }
  return validTiers[validTiers.length - 1].pool;
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

  // Phân chia đầy đủ 100% toàn bộ cầu thủ trên hệ thống (không bỏ sót bất kỳ ai):
  // iconPool (ICON) + ucl17Pool (UCL '17) + superstarPool (86+) + elitePool (82-85) + commonPool (<82)
  const iconPool = allPlayers.filter((p) => p.cardTier === 'icon' || p.clubId === 'icons-fc');
  const regularPool = allPlayers.filter((p) => p.cardTier !== 'icon' && p.clubId !== 'icons-fc');
  const ucl17Pool = regularPool.filter((p) => p.cardTier === 'ucl17');
  const nonUclRegular = regularPool.filter((p) => p.cardTier !== 'ucl17');

  const superstarPool = nonUclRegular.filter((p) => p.rating >= 86);
  const elitePool = nonUclRegular.filter((p) => p.rating >= 82 && p.rating <= 85);
  const commonPool = nonUclRegular.filter((p) => p.rating < 82);
  const common80_81 = commonPool.filter((p) => p.rating >= 80);
  const common78_81 = commonPool.filter((p) => p.rating >= 78);

  const fallbackPool = regularPool.length > 0 ? regularPool : allPlayers;

  const drawFromTiers = (tiers: Array<{ pool: Player[]; chance: number }>) => {
    const selectedPool = rollPoolByOdds(tiers, fallbackPool);
    const active = selectedPool.length > 0 ? selectedPool : fallbackPool;
    const pl = pickFairWeightedPlayer(active, pickedIds);
    pickedIds.add(pl.id);
    drawnPlayers.push(pl);
  };

  let shardsGained = 0;
  let boostersGained = 0;
  let budgetGainedM = 0;

  if (packTier === 'starter_pack') {
    // Slot 1 đảm bảo 82+
    drawFromTiers([
      { pool: iconPool, chance: 0.02 },
      { pool: ucl17Pool, chance: 0.04 },
      { pool: superstarPool, chance: 0.22 },
      { pool: elitePool, chance: 0.72 },
    ]);
    // Slot 2–4: Mở rộng toàn bộ regularPool
    for (let i = 0; i < 3; i++) {
      drawFromTiers([
        { pool: ucl17Pool, chance: 0.01 },
        { pool: superstarPool, chance: 0.08 },
        { pool: elitePool, chance: 0.48 },
        { pool: commonPool, chance: 0.43 },
      ]);
    }
    shardsGained = 20;
    boostersGained = 1;
    budgetGainedM = 2.0;
  } else if (packTier === 'scout_pack') {
    // Slot 1: 78+ trở lên
    drawFromTiers([
      { pool: iconPool, chance: 0.01 },
      { pool: ucl17Pool, chance: 0.02 },
      { pool: superstarPool, chance: 0.1 },
      { pool: elitePool, chance: 0.45 },
      { pool: common78_81, chance: 0.42 },
    ]);
    // Slot 2–4: Bao gồm toàn bộ cầu thủ 74–81 đến siêu sao
    for (let i = 0; i < 3; i++) {
      drawFromTiers([
        { pool: ucl17Pool, chance: 0.005 },
        { pool: superstarPool, chance: 0.055 },
        { pool: elitePool, chance: 0.44 },
        { pool: commonPool, chance: 0.5 },
      ]);
    }
    shardsGained = 10 + Math.floor(Math.random() * 7);
    boostersGained = Math.random() < 0.35 ? 1 : 0;
  } else if (packTier === 'elite_pack') {
    // Slot 1 đảm bảo 82+
    drawFromTiers([
      { pool: iconPool, chance: 0.05 },
      { pool: ucl17Pool, chance: 0.05 },
      { pool: superstarPool, chance: 0.25 },
      { pool: elitePool, chance: 0.65 },
    ]);
    // Slot 2: 80+
    drawFromTiers([
      { pool: iconPool, chance: 0.01 },
      { pool: ucl17Pool, chance: 0.03 },
      { pool: superstarPool, chance: 0.15 },
      { pool: elitePool, chance: 0.56 },
      { pool: common80_81, chance: 0.25 },
    ]);
    // Slot 3–4: Toàn bộ
    for (let i = 0; i < 2; i++) {
      drawFromTiers([
        { pool: ucl17Pool, chance: 0.015 },
        { pool: superstarPool, chance: 0.095 },
        { pool: elitePool, chance: 0.52 },
        { pool: commonPool, chance: 0.37 },
      ]);
    }
    shardsGained = 18 + Math.floor(Math.random() * 11);
    boostersGained = Math.random() < 0.55 ? 1 : 0;
  } else if (packTier === 'legend_pack') {
    // Slot 1 đảm bảo 86+ / UCL '17 / ICON
    drawFromTiers([
      { pool: iconPool, chance: 0.16 },
      { pool: ucl17Pool, chance: 0.14 },
      { pool: superstarPool, chance: 0.7 },
    ]);
    // Slot 2: 82+
    drawFromTiers([
      { pool: iconPool, chance: 0.04 },
      { pool: ucl17Pool, chance: 0.06 },
      { pool: superstarPool, chance: 0.25 },
      { pool: elitePool, chance: 0.65 },
    ]);
    // Slot 3–4: 80+
    for (let i = 0; i < 2; i++) {
      drawFromTiers([
        { pool: ucl17Pool, chance: 0.025 },
        { pool: superstarPool, chance: 0.145 },
        { pool: elitePool, chance: 0.6 },
        { pool: common80_81, chance: 0.23 },
      ]);
    }
    shardsGained = 28 + Math.floor(Math.random() * 18);
    boostersGained = 1;
  } else if (packTier === 'icon_pack') {
    // Mở duy nhất 1 thẻ: 95% ICON, 3% UCL '17, 2% Siêu Sao 86+
    drawFromTiers([
      { pool: iconPool, chance: 0.95 },
      { pool: ucl17Pool, chance: 0.03 },
      { pool: superstarPool, chance: 0.02 },
    ]);
    shardsGained = 45 + Math.floor(Math.random() * 26);
    boostersGained = 2;
  } else {
    // trophy_gift_box: 2 thẻ (Slot 1: 80+, Slot 2: 78+)
    drawFromTiers([
      { pool: iconPool, chance: 0.04 },
      { pool: ucl17Pool, chance: 0.05 },
      { pool: superstarPool, chance: 0.21 },
      { pool: elitePool, chance: 0.52 },
      { pool: common80_81, chance: 0.18 },
    ]);
    drawFromTiers([
      { pool: ucl17Pool, chance: 0.02 },
      { pool: superstarPool, chance: 0.1 },
      { pool: elitePool, chance: 0.5 },
      { pool: common78_81, chance: 0.38 },
    ]);
    shardsGained = 25 + Math.floor(Math.random() * 14);
    boostersGained = Math.random() < 0.6 ? 2 : 1;
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
    dailyPackPurchases: norm.dailyPackPurchases ?? {},
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
