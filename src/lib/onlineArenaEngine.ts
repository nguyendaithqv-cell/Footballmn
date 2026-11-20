import { CLUBS, INITIAL_PLAYERS } from '../data/footballDatabase';
import {
  ArenaProfile,
  ArenaStarterSnapshot,
  CareerSave,
  FormationId,
  MatchEvent,
  MatchPlayerRating,
  MatchResultSummary,
  OnlineMatchMode,
  OnlineTournamentMatch,
  OnlineTournamentParticipant,
  OnlineTournamentState,
  PackTier,
  Player,
  Position,
  RankTierId,
  UserProfile,
} from '../types/game';
import { buildAutoLineupSlots, calculateTacticalProfile } from './careerEngine';

export interface RankTierConfig {
  id: RankTierId;
  order: number;
  name: string;
  divisions: number; // e.g., 3 means III, II, I; 1 for master tiers
  starsPerDivision: number;
  badgeClass: string;
  borderClass: string;
  textClass: string;
  milestonePack?: PackTier;
  milestoneShards: number;
  milestoneBudgetM: number;
}

export const RANK_TIERS: RankTierConfig[] = [
  {
    id: 'dong',
    order: 0,
    name: 'Đồng',
    divisions: 3,
    starsPerDivision: 3,
    badgeClass: 'bg-amber-900/35',
    borderClass: 'border-amber-700/50',
    textClass: 'text-amber-500',
    milestoneShards: 0,
    milestoneBudgetM: 0,
  },
  {
    id: 'bac',
    order: 1,
    name: 'Bạc',
    divisions: 3,
    starsPerDivision: 3,
    badgeClass: 'bg-slate-600/30',
    borderClass: 'border-slate-400/45',
    textClass: 'text-slate-200',
    milestonePack: 'scout_pack',
    milestoneShards: 12,
    milestoneBudgetM: 2.0,
  },
  {
    id: 'vang',
    order: 2,
    name: 'Vàng',
    divisions: 4,
    starsPerDivision: 4,
    badgeClass: 'bg-amber-500/20',
    borderClass: 'border-amber-400/50',
    textClass: 'text-amber-300',
    milestonePack: 'scout_pack',
    milestoneShards: 18,
    milestoneBudgetM: 3.5,
  },
  {
    id: 'bach_kim',
    order: 3,
    name: 'Bạch Kim',
    divisions: 4,
    starsPerDivision: 4,
    badgeClass: 'bg-cyan-500/20',
    borderClass: 'border-cyan-400/50',
    textClass: 'text-cyan-300',
    milestonePack: 'elite_pack',
    milestoneShards: 24,
    milestoneBudgetM: 5.0,
  },
  {
    id: 'kim_cuong',
    order: 4,
    name: 'Kim Cương',
    divisions: 5,
    starsPerDivision: 5,
    badgeClass: 'bg-sky-500/20',
    borderClass: 'border-sky-400/55',
    textClass: 'text-sky-300',
    milestonePack: 'elite_pack',
    milestoneShards: 30,
    milestoneBudgetM: 7.5,
  },
  {
    id: 'tinh_anh',
    order: 5,
    name: 'Tinh Anh',
    divisions: 5,
    starsPerDivision: 5,
    badgeClass: 'bg-purple-500/20',
    borderClass: 'border-purple-400/55',
    textClass: 'text-purple-300',
    milestonePack: 'legend_pack',
    milestoneShards: 40,
    milestoneBudgetM: 10.0,
  },
  {
    id: 'cao_thu',
    order: 6,
    name: 'Cao Thủ',
    divisions: 1,
    starsPerDivision: 25,
    badgeClass: 'bg-emerald-500/20',
    borderClass: 'border-emerald-400/60',
    textClass: 'text-emerald-300',
    milestonePack: 'legend_pack',
    milestoneShards: 50,
    milestoneBudgetM: 15.0,
  },
  {
    id: 'chien_tuong',
    order: 7,
    name: 'Chiến Tướng',
    divisions: 1,
    starsPerDivision: 25,
    badgeClass: 'bg-orange-500/20',
    borderClass: 'border-orange-400/60',
    textClass: 'text-orange-300',
    milestonePack: 'trophy_gift_box',
    milestoneShards: 65,
    milestoneBudgetM: 20.0,
  },
  {
    id: 'thach_dau',
    order: 8,
    name: 'Thách Đấu',
    divisions: 1,
    starsPerDivision: 999,
    badgeClass: 'bg-yellow-400/20',
    borderClass: 'border-yellow-300/70',
    textClass: 'text-yellow-300',
    milestonePack: 'icon_pack',
    milestoneShards: 100,
    milestoneBudgetM: 30.0,
  },
];

const ROMAN_DIV = ['', 'I', 'II', 'III', 'IV', 'V'];

export function getRankConfig(tier: RankTierId): RankTierConfig {
  return RANK_TIERS.find((t) => t.id === tier) ?? RANK_TIERS[0];
}

export function getRankScore(tier: RankTierId, division: number, stars: number): number {
  const cfg = getRankConfig(tier);
  if (cfg.order >= 6) {
    // Master tiers share continuous star count (Cao Thủ 0-24, Chiến Tướng 25-49, Thách Đấu 50+)
    return 600 + stars;
  }
  const divOffset = (cfg.divisions - division) * 20;
  return cfg.order * 100 + divOffset + stars;
}

export function formatRankLabel(tier: RankTierId, division: number, stars: number): string {
  const cfg = getRankConfig(tier);
  if (cfg.order >= 6) {
    return `${cfg.name} · ${stars}★`;
  }
  return `${cfg.name} ${ROMAN_DIV[division] ?? division} · ${stars}★`;
}

export function getFriendshipDocId(uidA: string, uidB: string): string {
  return uidA < uidB ? `${uidA}__${uidB}` : `${uidB}__${uidA}`;
}

function toStarterSnapshot(player: Player, slotLabel?: Position): ArenaStarterSnapshot {
  return {
    id: player.id,
    name: player.name,
    shortName: player.shortName,
    position: slotLabel ?? player.position,
    rating: player.rating,
    stars: Math.max(1, Math.min(5, player.stars ?? 1)),
    pac: player.attributes.pac,
    sho: player.attributes.sho,
    pas: player.attributes.pas,
    dri: player.attributes.dri,
    def: player.attributes.def,
    phy: player.attributes.phy,
  };
}

export function buildArenaProfileFromCareer(
  userProfile: UserProfile,
  career: CareerSave,
  existing?: ArenaProfile | null
): ArenaProfile {
  const club = CLUBS.find((c) => c.id === career.clubId) ?? CLUBS[0];
  const tactical = calculateTacticalProfile(career.tactics, career.squad);
  const byId = new Map(career.squad.map((p) => [p.id, p]));

  const starters: ArenaStarterSnapshot[] = [];
  const used = new Set<string>();
  for (const slot of career.tactics.slots) {
    const pl = byId.get(slot.playerId);
    if (pl && !used.has(pl.id)) {
      used.add(pl.id);
      starters.push(toStarterSnapshot(pl, slot.label));
    }
  }
  if (starters.length < 11) {
    for (const pl of [...career.squad].sort((a, b) => b.rating - a.rating)) {
      if (starters.length >= 11) break;
      if (!used.has(pl.id)) {
        used.add(pl.id);
        starters.push(toStarterSnapshot(pl));
      }
    }
  }

  const tier: RankTierId = existing?.rankTier ?? 'dong';
  const division = existing?.rankDivision ?? 3;
  const stars = existing?.rankStars ?? 0;

  return {
    uid: userProfile.uid,
    visibility: 'public',
    isBot: false,
    managerName: userProfile.managerName,
    nationality: userProfile.nationality || 'Việt Nam',
    clubId: club.id,
    clubName: club.name,
    formation: career.tactics.formation,
    squadOverall: Math.max(40, Math.min(99, Math.round(tactical.overall))),
    attackRating: Math.max(40, Math.min(99, Math.round(tactical.attack))),
    midfieldRating: Math.max(40, Math.min(99, Math.round(tactical.midfield))),
    defenseRating: Math.max(40, Math.min(99, Math.round(tactical.defense))),
    rankTier: tier,
    rankDivision: division,
    rankStars: stars,
    bravePoints: existing?.bravePoints ?? 20,
    eloPoints: existing?.eloPoints ?? 1000,
    winStreak: existing?.winStreak ?? 0,
    highestRankIndex: existing?.highestRankIndex ?? getRankConfig(tier).order,
    matchesPlayed: existing?.matchesPlayed ?? 0,
    wins: existing?.wins ?? 0,
    draws: existing?.draws ?? 0,
    losses: existing?.losses ?? 0,
    tournamentTitles: existing?.tournamentTitles ?? 0,
    starters: starters.slice(0, 11),
  };
}

interface BotSeedDef {
  uid: string;
  managerName: string;
  nationality: string;
  clubId: string;
  formation: FormationId;
  rankTier: RankTierId;
  rankDivision: number;
  rankStars: number;
  eloPoints: number;
  wins: number;
  draws: number;
  losses: number;
  tournamentTitles: number;
  starBoost: number;
}

const BOT_DEFINITIONS: BotSeedDef[] = [
  {
    uid: 'bot-01',
    managerName: 'HLV Minh Quân',
    nationality: 'Việt Nam',
    clubId: 'man-city',
    formation: '4-2-3-1',
    rankTier: 'thach_dau',
    rankDivision: 1,
    rankStars: 64,
    eloPoints: 2340,
    wins: 92,
    draws: 8,
    losses: 19,
    tournamentTitles: 6,
    starBoost: 2,
  },
  {
    uid: 'bot-02',
    managerName: 'Coach Mateo Silva',
    nationality: 'Tây Ban Nha',
    clubId: 'real-madrid',
    formation: '4-3-3',
    rankTier: 'chien_tuong',
    rankDivision: 1,
    rankStars: 38,
    eloPoints: 2110,
    wins: 78,
    draws: 11,
    losses: 24,
    tournamentTitles: 4,
    starBoost: 2,
  },
  {
    uid: 'bot-03',
    managerName: 'HLV Tuấn Kiệt',
    nationality: 'Việt Nam',
    clubId: 'arsenal',
    formation: '4-3-3',
    rankTier: 'cao_thu',
    rankDivision: 1,
    rankStars: 16,
    eloPoints: 1890,
    wins: 61,
    draws: 9,
    losses: 23,
    tournamentTitles: 3,
    starBoost: 1,
  },
  {
    uid: 'bot-04',
    managerName: 'Coach Nakamura',
    nationality: 'Nhật Bản',
    clubId: 'liverpool',
    formation: '4-2-3-1',
    rankTier: 'tinh_anh',
    rankDivision: 2,
    rankStars: 4,
    eloPoints: 1710,
    wins: 52,
    draws: 7,
    losses: 26,
    tournamentTitles: 2,
    starBoost: 1,
  },
  {
    uid: 'bot-05',
    managerName: 'HLV Hoàng Long',
    nationality: 'Việt Nam',
    clubId: 'bayern',
    formation: '4-2-3-1',
    rankTier: 'kim_cuong',
    rankDivision: 1,
    rankStars: 3,
    eloPoints: 1560,
    wins: 44,
    draws: 6,
    losses: 24,
    tournamentTitles: 1,
    starBoost: 1,
  },
  {
    uid: 'bot-06',
    managerName: 'Coach Lindqvist',
    nationality: 'Thụy Điển',
    clubId: 'barcelona',
    formation: '4-3-3',
    rankTier: 'kim_cuong',
    rankDivision: 4,
    rankStars: 2,
    eloPoints: 1475,
    wins: 37,
    draws: 5,
    losses: 21,
    tournamentTitles: 1,
    starBoost: 1,
  },
  {
    uid: 'bot-07',
    managerName: 'HLV Gia Bảo',
    nationality: 'Việt Nam',
    clubId: 'inter',
    formation: '3-5-2',
    rankTier: 'bach_kim',
    rankDivision: 2,
    rankStars: 3,
    eloPoints: 1340,
    wins: 29,
    draws: 6,
    losses: 18,
    tournamentTitles: 1,
    starBoost: 0,
  },
  {
    uid: 'bot-08',
    managerName: 'Coach Moreau',
    nationality: 'Pháp',
    clubId: 'psg',
    formation: '4-3-3',
    rankTier: 'vang',
    rankDivision: 1,
    rankStars: 3,
    eloPoints: 1230,
    wins: 22,
    draws: 4,
    losses: 15,
    tournamentTitles: 0,
    starBoost: 0,
  },
  {
    uid: 'bot-09',
    managerName: 'HLV Quốc Việt',
    nationality: 'Việt Nam',
    clubId: 'chelsea',
    formation: '3-4-2-1',
    rankTier: 'bac',
    rankDivision: 1,
    rankStars: 2,
    eloPoints: 1120,
    wins: 14,
    draws: 3,
    losses: 12,
    tournamentTitles: 0,
    starBoost: 0,
  },
  {
    uid: 'bot-10',
    managerName: 'HLV Hải Đăng',
    nationality: 'Việt Nam',
    clubId: 'dortmund',
    formation: '4-4-2',
    rankTier: 'dong',
    rankDivision: 1,
    rankStars: 2,
    eloPoints: 1045,
    wins: 8,
    draws: 2,
    losses: 9,
    tournamentTitles: 0,
    starBoost: 0,
  },
];

export function createDefaultBotProfiles(): ArenaProfile[] {
  return BOT_DEFINITIONS.map((def) => {
    const club = CLUBS.find((c) => c.id === def.clubId) ?? CLUBS[0];
    const clubPlayers = INITIAL_PLAYERS.filter((p) => p.clubId === club.id).map((p) => ({
      ...p,
      rating: Math.min(95, p.rating + def.starBoost),
      stars: Math.min(5, 1 + def.starBoost),
      attributes: {
        pac: Math.min(96, p.attributes.pac + def.starBoost * 2),
        sho: Math.min(96, p.attributes.sho + def.starBoost * 2),
        pas: Math.min(96, p.attributes.pas + def.starBoost * 2),
        dri: Math.min(96, p.attributes.dri + def.starBoost * 2),
        def: Math.min(96, p.attributes.def + def.starBoost * 2),
        phy: Math.min(96, p.attributes.phy + def.starBoost * 2),
      },
    }));

    const autoSlots = buildAutoLineupSlots(def.formation, clubPlayers);
    const byId = new Map(clubPlayers.map((p) => [p.id, p]));
    const starters = autoSlots
      .map((s) => {
        const pl = byId.get(s.playerId);
        return pl ? toStarterSnapshot(pl, s.label) : null;
      })
      .filter((x): x is ArenaStarterSnapshot => Boolean(x))
      .slice(0, 11);

    const avgAll =
      starters.length > 0
        ? Math.round(starters.reduce((sum, p) => sum + p.rating, 0) / starters.length)
        : club.reputation;
    const atk = starters.filter((p) => ['ST', 'LW', 'RW', 'CAM'].includes(p.position));
    const mid = starters.filter((p) => ['CM', 'CDM', 'CAM'].includes(p.position));
    const defList = starters.filter((p) => ['GK', 'CB', 'LB', 'RB'].includes(p.position));

    const avgGroup = (list: ArenaStarterSnapshot[]) =>
      list.length > 0
        ? Math.round(list.reduce((sum, p) => sum + p.rating, 0) / list.length)
        : avgAll;

    return {
      uid: def.uid,
      visibility: 'public',
      isBot: true,
      managerName: def.managerName,
      nationality: def.nationality,
      clubId: club.id,
      clubName: club.name,
      formation: def.formation,
      squadOverall: Math.max(40, Math.min(99, avgAll)),
      attackRating: Math.max(40, Math.min(99, avgGroup(atk))),
      midfieldRating: Math.max(40, Math.min(99, avgGroup(mid))),
      defenseRating: Math.max(40, Math.min(99, avgGroup(defList))),
      rankTier: def.rankTier,
      rankDivision: def.rankDivision,
      rankStars: def.rankStars,
      bravePoints: 45,
      eloPoints: def.eloPoints,
      winStreak: def.rankTier === 'thach_dau' ? 5 : def.rankTier === 'chien_tuong' ? 3 : 1,
      highestRankIndex: getRankConfig(def.rankTier).order,
      matchesPlayed: def.wins + def.draws + def.losses,
      wins: def.wins,
      draws: def.draws,
      losses: def.losses,
      tournamentTitles: def.tournamentTitles,
      starters,
    };
  });
}

export function mergeLeaderboardWithBots(cloudProfiles: ArenaProfile[]): ArenaProfile[] {
  const byUid = new Map<string, ArenaProfile>();
  for (const bot of createDefaultBotProfiles()) {
    byUid.set(bot.uid, bot);
  }
  for (const p of cloudProfiles) {
    byUid.set(p.uid, p);
  }
  return Array.from(byUid.values()).sort((a, b) => {
    const scoreDiff =
      getRankScore(b.rankTier, b.rankDivision, b.rankStars) -
      getRankScore(a.rankTier, a.rankDivision, a.rankStars);
    if (scoreDiff !== 0) return scoreDiff;
    if (b.eloPoints !== a.eloPoints) return b.eloPoints - a.eloPoints;
    return b.squadOverall - a.squadOverall;
  });
}

export interface RankedOutcomeResult {
  nextProfile: ArenaProfile;
  starDelta: number;
  shieldUsed: boolean;
  bonusStarUsed: boolean;
  promotedTier: RankTierConfig | null;
  milestoneReward: {
    tierName: string;
    packTier?: PackTier;
    shards: number;
    budgetM: number;
  } | null;
}

export function applyRankedMatchOutcome(
  profile: ArenaProfile,
  won: boolean,
  goalDiffAbs: number
): RankedOutcomeResult {
  let tierIdx = getRankConfig(profile.rankTier).order;
  let division = profile.rankDivision;
  let stars = profile.rankStars;
  let brave = profile.bravePoints;
  let elo = profile.eloPoints;
  let streak = won ? profile.winStreak + 1 : 0;

  let starDelta = 0;
  let shieldUsed = false;
  let bonusStarUsed = false;

  const addOneStar = () => {
    const cfg = RANK_TIERS[tierIdx];
    if (cfg.order >= 6) {
      // Master Tiers: Cao Thủ (0..24), Chiến Tướng (25..49), Thách Đấu (50+)
      stars += 1;
      if (stars >= 50) {
        tierIdx = 8; // Thách Đấu
      } else if (stars >= 25) {
        tierIdx = 7; // Chiến Tướng
      } else {
        tierIdx = 6; // Cao Thủ
      }
      division = 1;
      return;
    }

    if (stars < cfg.starsPerDivision) {
      stars += 1;
      return;
    }
    // Promote division or tier
    if (division > 1) {
      division -= 1;
      stars = 1;
    } else {
      tierIdx = Math.min(RANK_TIERS.length - 1, tierIdx + 1);
      const nextCfg = RANK_TIERS[tierIdx];
      if (nextCfg.order >= 6) {
        division = 1;
        stars = 1;
      } else {
        division = nextCfg.divisions;
        stars = 1;
      }
    }
  };

  const subtractOneStar = () => {
    const cfg = RANK_TIERS[tierIdx];
    if (cfg.order >= 6) {
      if (stars > 0) {
        stars -= 1;
        if (stars >= 50) tierIdx = 8;
        else if (stars >= 25) tierIdx = 7;
        else tierIdx = 6;
      } else {
        // Demote to Tinh Anh I with 4 stars
        tierIdx = 5;
        division = 1;
        stars = 4;
      }
      return;
    }

    if (stars > 0) {
      stars -= 1;
      return;
    }

    if (division < cfg.divisions) {
      division += 1;
      stars = Math.max(0, cfg.starsPerDivision - 1);
    } else if (tierIdx > 0) {
      tierIdx -= 1;
      const prevCfg = RANK_TIERS[tierIdx];
      division = 1;
      stars = Math.max(0, prevCfg.starsPerDivision - 1);
    }
  };

  if (won) {
    addOneStar();
    starDelta += 1;
    const braveGain = 18 + (goalDiffAbs >= 2 ? 8 : 0) + (streak >= 2 ? 6 : 0);
    brave += braveGain;
    if (brave >= 100 && tierIdx <= 5) {
      brave -= 100;
      addOneStar();
      starDelta += 1;
      bonusStarUsed = true;
    } else {
      brave = Math.min(100, brave);
    }
    elo += 24 + (goalDiffAbs >= 2 ? 6 : 0) + Math.min(12, streak * 2);
  } else {
    const isBottomFloor = tierIdx === 0 && division === 3 && stars === 0;
    if (!isBottomFloor && brave >= 80) {
      brave -= 80;
      shieldUsed = true;
      starDelta = 0;
    } else if (!isBottomFloor) {
      subtractOneStar();
      starDelta = -1;
      brave = Math.min(100, brave + 6);
    }
    elo = Math.max(800, elo - 16);
  }

  const nextCfg = RANK_TIERS[tierIdx];
  const prevHighest = profile.highestRankIndex ?? 0;
  const reachedNewHighest = nextCfg.order > prevHighest;

  const milestoneReward = reachedNewHighest
    ? {
        tierName: nextCfg.name,
        packTier: nextCfg.milestonePack,
        shards: nextCfg.milestoneShards,
        budgetM: nextCfg.milestoneBudgetM,
      }
    : null;

  return {
    nextProfile: {
      ...profile,
      rankTier: nextCfg.id,
      rankDivision: division,
      rankStars: stars,
      bravePoints: Math.max(0, Math.min(100, brave)),
      eloPoints: Math.min(10000, elo),
      winStreak: streak,
      highestRankIndex: Math.max(prevHighest, nextCfg.order),
      matchesPlayed: profile.matchesPlayed + 1,
      wins: profile.wins + (won ? 1 : 0),
      losses: profile.losses + (won ? 0 : 1),
    },
    starDelta,
    shieldUsed,
    bonusStarUsed,
    promotedTier: nextCfg.order > getRankConfig(profile.rankTier).order ? nextCfg : null,
    milestoneReward,
  };
}

function sampleOnlinePoissonGoals(lambda: number, maxGoals = 9): number {
  const safeLambda = Math.max(0.15, Math.min(6.0, lambda));
  const L = Math.exp(-safeLambda);
  let k = 0;
  let p = 1;
  do {
    k++;
    p *= Math.random();
  } while (p > L && k <= maxGoals);
  return Math.min(maxGoals, k - 1);
}

export function simulateOnlineMatch(
  home: ArenaProfile,
  away: ArenaProfile,
  options: {
    mode: OnlineMatchMode;
    roundLabel?: string;
    isKnockout?: boolean;
  }
): { summary: MatchResultSummary; winnerUid?: string } {
  const homeEdge =
    (home.attackRating - away.defenseRating) * 0.55 +
    (home.midfieldRating - away.midfieldRating) * 0.25 +
    (home.squadOverall - away.squadOverall) * 0.2;
  const awayEdge =
    (away.attackRating - home.defenseRating) * 0.55 +
    (away.midfieldRating - home.midfieldRating) * 0.25 +
    (away.squadOverall - home.squadOverall) * 0.2;

  const clampExp = (v: number) => Math.max(-1.35, Math.min(1.35, v));
  // Subtle neutral pitch advantage (1.36 vs 1.24) so stronger tactical squads reliably prevail
  const expectedHome = Math.max(0.25, 1.36 * Math.exp(clampExp(homeEdge * 0.068)));
  const expectedAway = Math.max(0.22, 1.24 * Math.exp(clampExp(awayEdge * 0.068)));

  const homeGoals = sampleOnlinePoissonGoals(expectedHome);
  const awayGoals = sampleOnlinePoissonGoals(expectedAway);

  const pickWeighted = <T,>(items: T[], weightFn: (item: T) => number): T | undefined => {
    if (items.length === 0) return undefined;
    const weights = items.map((it) => Math.max(0.1, weightFn(it)));
    const total = weights.reduce((s, w) => s + w, 0);
    let r = Math.random() * total;
    for (let i = 0; i < items.length; i++) {
      r -= weights[i];
      if (r <= 0) return items[i];
    }
    return items[items.length - 1];
  };

  const pickScorer = (roster: ArenaStarterSnapshot[]) => {
    const outfield = roster.filter((p) => p.position !== 'GK');
    const pool = outfield.length > 0 ? outfield : roster;
    return pickWeighted(pool, (p) => {
      const posW =
        p.position === 'ST'
          ? 5.5
          : p.position === 'LW' || p.position === 'RW'
            ? 3.6
            : p.position === 'CAM'
              ? 2.8
              : p.position === 'CM'
                ? 1.5
                : 0.45;
      return posW * (0.6 + p.sho / 100);
    });
  };

  const pickAssister = (roster: ArenaStarterSnapshot[], scorerId?: string) => {
    const candidates = roster.filter((p) => p.id !== scorerId && p.position !== 'GK');
    if (candidates.length === 0 || Math.random() < 0.14) return undefined;
    return pickWeighted(candidates, (p) => {
      const posW =
        p.position === 'CAM'
          ? 4.2
          : p.position === 'LW' || p.position === 'RW'
            ? 3.4
            : p.position === 'CM'
              ? 3.0
              : 1.4;
      return posW * (0.6 + p.pas / 100);
    });
  };

  const homeClub = CLUBS.find((c) => c.id === home.clubId) ?? CLUBS[0];
  const awayClub = CLUBS.find((c) => c.id === away.clubId) ?? CLUBS[1];

  const events: MatchEvent[] = [
    {
      minute: 1,
      type: 'kickoff',
      teamId: home.clubId,
      playerName: home.managerName,
      description: `Khai cuộc trận Online: ${home.managerName} (${homeClub.shortName}) vs ${away.managerName} (${awayClub.shortName}).`,
    },
  ];

  for (let i = 0; i < homeGoals; i++) {
    const min = Math.floor(Math.random() * 88) + 2;
    const scorer = pickScorer(home.starters);
    const assist = pickAssister(home.starters, scorer?.id);
    const ev: MatchEvent = {
      minute: min,
      type: 'goal',
      teamId: home.clubId,
      playerName: scorer?.name ?? home.managerName,
      description: `VÀO! ${scorer?.name ?? 'Tiền đạo'} ghi bàn cho đội ${home.managerName}${assist ? ` (kiến tạo: ${assist.shortName})` : ''}.`,
    };
    if (scorer?.id) ev.playerId = scorer.id;
    if (assist?.id) ev.assistId = assist.id;
    if (assist?.shortName) ev.assistName = assist.shortName;
    events.push(ev);
  }

  for (let i = 0; i < awayGoals; i++) {
    const min = Math.floor(Math.random() * 88) + 2;
    const scorer = pickScorer(away.starters);
    const assist = pickAssister(away.starters, scorer?.id);
    const ev: MatchEvent = {
      minute: min,
      type: 'goal',
      teamId: away.clubId,
      playerName: scorer?.name ?? away.managerName,
      description: `BÀN THẮNG! ${scorer?.name ?? 'Tiền đạo'} sút tung lưới cho đội ${away.managerName}${assist ? ` (kiến tạo: ${assist.shortName})` : ''}.`,
    };
    if (scorer?.id) ev.playerId = scorer.id;
    if (assist?.id) ev.assistId = assist.id;
    if (assist?.shortName) ev.assistName = assist.shortName;
    events.push(ev);
  }

  let yellowsHome = 0;
  let yellowsAway = 0;
  for (let k = 0; k < 4; k++) {
    const min = Math.floor(Math.random() * 84) + 4;
    const sideIsHome = Math.random() > 0.5;
    const sideArena = sideIsHome ? home : away;
    const pl = pickScorer(sideArena.starters);
    const evType = k === 1 || k === 3 ? 'yellow' : k === 2 ? 'save' : 'chance';
    if (evType === 'yellow') {
      if (sideIsHome) yellowsHome++;
      else yellowsAway++;
    }
    const ev: MatchEvent = {
      minute: min,
      type: evType,
      teamId: sideArena.clubId,
      playerName: pl?.shortName ?? sideArena.managerName,
      description:
        evType === 'yellow'
          ? `Thẻ vàng dành cho ${pl?.shortName ?? 'cầu thủ'} (${sideArena.managerName}).`
          : evType === 'save'
            ? `Pha cứu thua xuất sắc trước cú dứt điểm của ${pl?.shortName ?? sideArena.managerName}.`
            : `Tình huống nguy hiểm của ${pl?.shortName ?? sideArena.managerName}, bóng đi sạt xà ngang!`,
    };
    if (pl?.id) ev.playerId = pl.id;
    events.push(ev);
  }

  let penaltiesHome: number | undefined;
  let penaltiesAway: number | undefined;
  let winnerClubId: string | undefined;
  let winnerUid: string | undefined;

  if (homeGoals > awayGoals) {
    winnerClubId = home.clubId;
    winnerUid = home.uid;
  } else if (awayGoals > homeGoals) {
    winnerClubId = away.clubId;
    winnerUid = away.uid;
  } else if (options.isKnockout) {
    const homeEdge = home.squadOverall >= away.squadOverall ? 0.53 : 0.47;
    const homeWinsPen = Math.random() < homeEdge;
    const baseScore = Math.floor(Math.random() * 2) + 4;
    if (homeWinsPen) {
      penaltiesHome = baseScore;
      penaltiesAway = baseScore - (Math.random() > 0.4 ? 1 : 2);
      winnerClubId = home.clubId;
      winnerUid = home.uid;
    } else {
      penaltiesAway = baseScore;
      penaltiesHome = baseScore - (Math.random() > 0.4 ? 1 : 2);
      winnerClubId = away.clubId;
      winnerUid = away.uid;
    }
    const winMgr = winnerUid === home.uid ? home.managerName : away.managerName;
    events.push({
      minute: 90,
      type: 'penalty',
      teamId: winnerClubId,
      playerName: winMgr,
      description: `LUÂN LƯU 11M! Đội ${winMgr} thắng ${penaltiesHome} - ${penaltiesAway} trên chấm phạt đền!`,
    });
  }

  events.push({
    minute: 90,
    type: 'fulltime',
    teamId: home.clubId,
    playerName: 'FT',
    description: `Hết giờ! ${home.managerName} ${homeGoals} - ${awayGoals} ${away.managerName}.`,
  });
  events.sort((a, b) => a.minute - b.minute);

  // Player Ratings 4.5 - 10.0 for both sides
  const rateSide = (
    side: ArenaProfile,
    gf: number,
    ga: number
  ): MatchPlayerRating[] => {
    const won = winnerUid ? winnerUid === side.uid : gf > ga;
    const lost = winnerUid ? winnerUid !== side.uid : gf < ga;
    const resAdj = won ? 0.45 : lost ? -0.35 : 0.05;
    return side.starters.map((st) => {
      const goals = events.filter(
        (e) => e.type === 'goal' && e.teamId === side.clubId && e.playerId === st.id
      ).length;
      const assists = events.filter(
        (e) => e.type === 'goal' && e.teamId === side.clubId && e.assistId === st.id
      ).length;
      const yellows = events.filter(
        (e) => e.type === 'yellow' && e.teamId === side.clubId && e.playerId === st.id
      ).length;

      let score = 6.4 + (st.rating - 78) * 0.015 + resAdj;
      if (goals > 0) score += goals === 1 ? 1.15 : 2.1 + (goals - 2) * 0.8;
      if (assists > 0) score += assists * 0.72;
      if (yellows > 0) score -= yellows * 0.35;
      if (ga === 0 && ['GK', 'CB', 'LB', 'RB'].includes(st.position)) score += 0.7;
      score += (Math.random() - 0.45) * 0.5;
      const clamped = Number(Math.max(4.5, Math.min(10.0, score)).toFixed(1));
      const row: MatchPlayerRating = {
        playerId: st.id,
        playerName: st.name,
        shortName: st.shortName,
        clubId: side.clubId,
        position: st.position,
        rating: clamped,
        goals,
        assists,
      };
      if (yellows > 0) row.yellowCard = true;
      return row;
    });
  };

  // Avoid duplicate clubId collision in ratings if both coaches use same clubId by handling same-club cleanly
  const sameClub = home.clubId === away.clubId;
  const homeRatings = rateSide(home, homeGoals, awayGoals);
  const awayRatings = rateSide(
    sameClub ? { ...away, clubId: `${away.clubId}-away` } : away,
    awayGoals,
    homeGoals
  );
  const allRatings = [...homeRatings, ...awayRatings];
  const sortedBest = [...allRatings].sort((a, b) => b.rating - a.rating);
  const best = sortedBest[0];
  if (best) best.isMotm = true;

  const possHome = Math.min(
    65,
    Math.max(35, Math.round(50 + (home.midfieldRating - away.midfieldRating) * 1.2))
  );
  const shotsHome = homeGoals * 3 + Math.floor(Math.random() * 6) + 4;
  const shotsAway = awayGoals * 3 + Math.floor(Math.random() * 6) + 3;

  const summary: MatchResultSummary = {
    id: `online-${options.mode}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`,
    matchweek: 1,
    competition: 'friendly',
    roundLabel:
      options.roundLabel ??
      (options.mode === 'ranked'
        ? 'Đấu Hạng Online'
        : options.mode === 'tournament'
          ? 'Giải Đấu Online'
          : options.mode === 'friendly'
            ? 'Giao Hữu Bạn Bè'
            : 'Tỷ Thí Online'),
    homeClubId: home.clubId,
    awayClubId: away.clubId,
    homeGoals,
    awayGoals,
    possessionHome: possHome,
    shotsHome,
    shotsAway,
    shotsOnTargetHome: Math.min(shotsHome, homeGoals + Math.max(1, Math.floor(shotsHome * 0.36))),
    shotsOnTargetAway: Math.min(shotsAway, awayGoals + Math.max(1, Math.floor(shotsAway * 0.35))),
    cornersHome: Math.max(1, Math.round(shotsHome * 0.4)),
    cornersAway: Math.max(1, Math.round(shotsAway * 0.4)),
    foulsHome: 6 + yellowsHome * 2,
    foulsAway: 6 + yellowsAway * 2,
    yellowsHome,
    yellowsAway,
    xgHome: Number((homeGoals * 0.72 + shotsHome * 0.08).toFixed(2)),
    xgAway: Number((awayGoals * 0.72 + shotsAway * 0.08).toFixed(2)),
    homeFormation: home.formation,
    awayFormation: away.formation,
    homeManagerName: home.managerName,
    awayManagerName: away.managerName,
    venue: `${homeClub.stadium} (Online)`,
    playerRatings: allRatings,
    events,
    playedAt: new Date().toISOString(),
  };

  if (best) {
    summary.manOfTheMatch = {
      playerId: best.playerId,
      name: best.playerName,
      clubId: best.clubId,
      rating: best.rating,
    };
  }
  if (penaltiesHome !== undefined) summary.penaltiesHome = penaltiesHome;
  if (penaltiesAway !== undefined) summary.penaltiesAway = penaltiesAway;
  if (winnerClubId) summary.winnerId = winnerClubId;

  return { summary, winnerUid };
}

function getRoundLabelForSize(size: 8 | 16, round: number): string {
  if (size === 16) {
    if (round === 1) return 'Vòng 1/8';
    if (round === 2) return 'Tứ Kết';
    if (round === 3) return 'Bán Kết';
    return 'Chung Kết';
  }
  if (round === 1) return 'Tứ Kết';
  if (round === 2) return 'Bán Kết';
  return 'Chung Kết';
}

export function createOnlineTournament(
  userArena: ArenaProfile,
  leaderboard: ArenaProfile[],
  size: 8 | 16 = 8
): OnlineTournamentState {
  const realOthers = leaderboard.filter((p) => p.uid !== userArena.uid && !p.isBot);
  const bots = leaderboard.filter((p) => p.uid !== userArena.uid && p.isBot);
  const shuffledReal = [...realOthers].sort(() => Math.random() - 0.5);
  const shuffledBots = [...bots].sort(() => Math.random() - 0.5);

  const selectedOpponents = [...shuffledReal, ...shuffledBots].slice(0, size - 1);
  // If fewer than size - 1 (should never happen with 10 bots, but safe fallback for size 16)
  while (selectedOpponents.length < size - 1) {
    const cloneIdx = selectedOpponents.length;
    const base = bots[cloneIdx % bots.length] ?? userArena;
    selectedOpponents.push({
      ...base,
      uid: `bot-extra-${cloneIdx + 1}`,
      managerName: `${base.managerName} #${cloneIdx + 1}`,
      isBot: true,
    });
  }

  const allEntries: OnlineTournamentParticipant[] = [userArena, ...selectedOpponents].map((p) => ({
    uid: p.uid,
    managerName: p.managerName,
    clubId: p.clubId,
    clubName: p.clubName,
    squadOverall: p.squadOverall,
    isBot: p.isBot,
    rankTier: p.rankTier,
    rankDivision: p.rankDivision,
  }));

  // Shuffle non-user entries while placing user in slot 0 for clear top-bracket visibility
  const restShuffled = allEntries.slice(1).sort(() => Math.random() - 0.5);
  const seeded = [allEntries[0], ...restShuffled];

  const r1Label = getRoundLabelForSize(size, 1);
  const matches: OnlineTournamentMatch[] = [];
  for (let i = 0; i < seeded.length; i += 2) {
    matches.push({
      id: `ot-r1-${i / 2 + 1}`,
      round: 1,
      roundLabel: r1Label,
      homeUid: seeded[i].uid,
      awayUid: seeded[i + 1].uid,
      played: false,
    });
  }

  return {
    id: `ot-${Date.now().toString(36)}`,
    title: size === 16 ? 'Siêu Cúp Online 16 HLV' : 'Cúp Chiến Thuật Online 8 HLV',
    size,
    currentRound: 1,
    status: 'active',
    participants: seeded,
    matches,
    startedAt: new Date().toISOString(),
  };
}

export function playOnlineTournamentRound(
  tournament: OnlineTournamentState,
  userArena: ArenaProfile,
  profileMap: Map<string, ArenaProfile>
): {
  nextTournament: OnlineTournamentState;
  userMatchSummary: MatchResultSummary | null;
  userWon: boolean;
  wonTitle: boolean;
} {
  if (tournament.status !== 'active') {
    return {
      nextTournament: tournament,
      userMatchSummary: null,
      userWon: false,
      wonTitle: false,
    };
  }

  const fallbackBots = createDefaultBotProfiles();
  const resolveArena = (uid: string): ArenaProfile => {
    if (uid === userArena.uid) return userArena;
    const found = profileMap.get(uid);
    if (found) return found;
    const pInfo = tournament.participants.find((pt) => pt.uid === uid);
    const botTpl = fallbackBots[0];
    return {
      ...botTpl,
      uid,
      managerName: pInfo?.managerName ?? botTpl.managerName,
      clubId: pInfo?.clubId ?? botTpl.clubId,
      clubName: pInfo?.clubName ?? botTpl.clubName,
      squadOverall: pInfo?.squadOverall ?? botTpl.squadOverall,
    };
  };

  let userMatchSummary: MatchResultSummary | null = null;
  let userWon = false;
  const roundWinners: string[] = [];

  const updatedMatches = tournament.matches.map((m) => {
    if (m.round !== tournament.currentRound || m.played) return m;
    const home = resolveArena(m.homeUid);
    const away = resolveArena(m.awayUid);
    const { summary, winnerUid } = simulateOnlineMatch(home, away, {
      mode: 'tournament',
      roundLabel: `${tournament.title} · ${m.roundLabel}`,
      isKnockout: true,
    });
    const finalWinner = winnerUid ?? m.homeUid;
    roundWinners.push(finalWinner);

    if (m.homeUid === userArena.uid || m.awayUid === userArena.uid) {
      userMatchSummary = summary;
      userWon = finalWinner === userArena.uid;
    }

    const updated: OnlineTournamentMatch = {
      ...m,
      played: true,
      homeGoals: summary.homeGoals,
      awayGoals: summary.awayGoals,
      winnerUid: finalWinner,
      report: {
        possessionHome: summary.possessionHome,
        shotsHome: summary.shotsHome,
        shotsAway: summary.shotsAway,
        xgHome: summary.xgHome,
        xgAway: summary.xgAway,
        homeFormation: summary.homeFormation,
        awayFormation: summary.awayFormation,
        homeManagerName: summary.homeManagerName,
        awayManagerName: summary.awayManagerName,
        venue: summary.venue,
        manOfTheMatch: summary.manOfTheMatch,
        playerRatings: summary.playerRatings,
        events: summary.events,
        playedAt: summary.playedAt,
      },
    };
    if (summary.penaltiesHome !== undefined) updated.penaltiesHome = summary.penaltiesHome;
    if (summary.penaltiesAway !== undefined) updated.penaltiesAway = summary.penaltiesAway;
    return updated;
  });

  // Was this the Final?
  const currentRoundMatches = updatedMatches.filter((m) => m.round === tournament.currentRound);
  if (currentRoundMatches.length === 1) {
    const championUid = currentRoundMatches[0].winnerUid;
    const wonTitle = championUid === userArena.uid;
    return {
      nextTournament: {
        ...tournament,
        status: wonTitle ? 'champion' : 'eliminated',
        matches: updatedMatches,
        championUid,
      },
      userMatchSummary,
      userWon,
      wonTitle,
    };
  }

  // User eliminated early?
  if (!userWon) {
    return {
      nextTournament: {
        ...tournament,
        status: 'eliminated',
        matches: updatedMatches,
      },
      userMatchSummary,
      userWon: false,
      wonTitle: false,
    };
  }

  // Advance to next round
  const nextRound = tournament.currentRound + 1;
  const nextLabel = getRoundLabelForSize(tournament.size, nextRound);
  const nextMatches: OnlineTournamentMatch[] = [];
  for (let i = 0; i < roundWinners.length; i += 2) {
    if (roundWinners[i] && roundWinners[i + 1]) {
      nextMatches.push({
        id: `ot-r${nextRound}-${i / 2 + 1}`,
        round: nextRound,
        roundLabel: nextLabel,
        homeUid: roundWinners[i],
        awayUid: roundWinners[i + 1],
        played: false,
      });
    }
  }

  return {
    nextTournament: {
      ...tournament,
      currentRound: nextRound,
      matches: [...updatedMatches, ...nextMatches],
    },
    userMatchSummary,
    userWon: true,
    wonTitle: false,
  };
}
