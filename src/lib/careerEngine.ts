import { CLUBS, FORMATION_TEMPLATES, INITIAL_PLAYERS, REAL_MANAGERS } from '../data/footballDatabase';
import {
  BoardObjective,
  CareerSave,
  ChampionsCupState,
  ChampionsGroup,
  Club,
  CompactMatchReport,
  CompetitionAwardWinner,
  CompetitionId,
  CompetitionPlayerStat,
  CompetitionsState,
  CupMatch,
  FinancialLedgerCategory,
  FinancialLedgerEntry,
  Fixture,
  FormationId,
  FreeDepartureSummary,
  IncomingTransferOffer,
  InjurySeverity,
  LeagueStanding,
  LoanedInPlayer,
  LoanedOutPlayer,
  ManOfTheMatch,
  MarketOverride,
  MatchEvent,
  MatchPlayerRating,
  MatchResultSummary,
  NationalCupState,
  Player,
  PlayerAttributes,
  PlayerInjury,
  PlayerRole,
  Position,
  RealManager,
  RetiredPlayerSummary,
  SeasonPayrollBreakdown,
  SeasonRecord,
  SuperCupState,
  TacticSettings,
  TacticSlot,
  TeamOfTheSeasonPlayer,
  TransferRecord,
  TrophyItem,
} from '../types/game';
import { getMedicalCostMultiplier, getPlayerRemainingSeasonWageM } from './economyEngine';
import { createStarterInventory, normalizeInventory } from './inventoryEngine';
import {
  advanceAcademyOnNewSeason,
  createEmptyClubRecords,
  ensureClubRecords,
  ensureYouthAcademy,
  needsClubRecordsBackfill,
} from './legacyAcademyEngine';
import { ensureQuestsState } from './questEngine';

export const COMPETITION_LABEL_MAP: Record<CompetitionId, string> = {
  league: 'Super League',
  'champions-cup': 'Champions Cup',
  'national-cup': 'Cúp Quốc Gia',
  'super-cup': 'Siêu Cúp',
  friendly: 'Giao hữu Quốc tế',
};

export function createLedgerEntry(params: {
  season: string;
  matchweek: number;
  type: 'income' | 'expense';
  category: FinancialLedgerCategory;
  title: string;
  detail?: string;
  amountM: number;
  date?: string;
  id?: string;
}): FinancialLedgerEntry {
  return {
    id:
      params.id ??
      `fin-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    season: params.season,
    matchweek: params.matchweek,
    type: params.type,
    category: params.category,
    title: params.title,
    ...(params.detail ? { detail: params.detail } : {}),
    amountM: Number(Math.max(0, params.amountM).toFixed(2)),
    date: params.date ?? new Date().toISOString(),
  };
}

export function appendLedgerEntries(
  existing: FinancialLedgerEntry[] | undefined,
  entries: FinancialLedgerEntry[]
): FinancialLedgerEntry[] {
  const valid = entries.filter((e) => e.amountM > 0);
  if (valid.length === 0) return existing ?? [];
  const seen = new Set((existing ?? []).map((e) => e.id));
  const fresh = valid.filter((e) => !seen.has(e.id));
  return [...fresh, ...(existing ?? [])].slice(0, 300);
}

export function backfillLegacyFinancialLedger(career: CareerSave): FinancialLedgerEntry[] {
  const entries: FinancialLedgerEntry[] = [];
  const season = career.season;

  for (const tr of career.transferHistory ?? []) {
    if (tr.feeM <= 0) continue;
    entries.push(
      createLedgerEntry({
        id: `legacy-tr-${tr.id}`,
        season,
        matchweek: tr.matchweek || 1,
        type: tr.type === 'sell' ? 'income' : 'expense',
        category: tr.type === 'sell' ? 'player_sale' : 'player_purchase',
        title:
          tr.type === 'sell'
            ? `Bán cầu thủ: ${tr.playerName}`
            : `Mua cầu thủ: ${tr.playerName}`,
        detail: `Lương €${tr.wageK}K/tuần`,
        amountM: tr.feeM,
        date: tr.date || new Date().toISOString(),
      })
    );
  }

  for (const mh of career.managerHistory ?? []) {
    if (!mh.feeM || mh.feeM <= 0) continue;
    entries.push(
      createLedgerEntry({
        id: `legacy-mh-${mh.id}`,
        season: mh.season || season,
        matchweek: mh.matchweek || 1,
        type: 'expense',
        category: 'contract_compensation',
        title:
          mh.action === 'fired'
            ? `Bồi thường thanh lý HĐ HLV ${mh.managerName}`
            : `Phí ký kết / giải phóng HĐ HLV ${mh.managerName}`,
        detail: mh.action === 'fired' ? 'Bồi thường chấm dứt hợp đồng' : 'Bổ nhiệm HLV trưởng',
        amountM: mh.feeM,
        date: mh.date || new Date().toISOString(),
      })
    );
  }

  for (const r of career.recentResults ?? []) {
    const isHome = r.homeClubId === career.clubId;
    const myG = isHome ? r.homeGoals : r.awayGoals;
    const oppG = isHome ? r.awayGoals : r.homeGoals;
    const won = r.winnerId ? r.winnerId === career.clubId : myG > oppG;
    const drawn = !r.winnerId && myG === oppG;
    const comp = r.competition ?? 'league';
    const prize =
      comp === 'friendly'
        ? 0
        : comp === 'league'
          ? won
            ? 1.8
            : drawn
              ? 0.9
              : 0
          : won
            ? 1.3
            : drawn
              ? 0.6
              : 0;
    const hName = CLUBS.find((c) => c.id === r.homeClubId)?.shortName ?? r.homeClubId;
    const aName = CLUBS.find((c) => c.id === r.awayClubId)?.shortName ?? r.awayClubId;
    entries.push(
      createLedgerEntry({
        id: `legacy-match-${r.id}`,
        season,
        matchweek: r.matchweek || 1,
        type: 'income',
        category: 'match_prize',
        title: `Thưởng trận ${COMPETITION_LABEL_MAP[comp] ?? 'Giải đấu'}: ${hName} ${r.homeGoals}-${r.awayGoals} ${aName}`,
        detail: r.roundLabel || `Vòng ${r.matchweek}`,
        amountM: prize,
        date: r.playedAt || new Date().toISOString(),
      })
    );
  }

  return entries.slice(0, 300);
}

export function getActiveCareerManager(career: CareerSave): RealManager | null {
  if (career.activeManagerId === null) return null;
  if (typeof career.activeManagerId === 'string' && career.activeManagerId.trim()) {
    const found = REAL_MANAGERS.find((m) => m.id === career.activeManagerId);
    if (found) return found;
  }
  const club = CLUBS.find((c) => c.id === career.clubId);
  if (!club) return REAL_MANAGERS[0] ?? null;
  return REAL_MANAGERS.find((m) => m.id === club.managerId) ?? null;
}

export function getBaseManagerAnnualSalaryM(manager: RealManager): number {
  const managerAvgRating = (manager.tacticalRating + manager.manManagement) / 2;
  return Number(
    Math.max(
      1.2,
      manager.weeklyWageK
        ? (manager.weeklyWageK * 10) / 1000
        : (managerAvgRating - 68) * 0.25
    ).toFixed(1)
  );
}

export function getManagerSalaryBoundsM(manager: RealManager): {
  baseM: number;
  minM: number;
  maxM: number;
} {
  const baseM = getBaseManagerAnnualSalaryM(manager);
  const minM = Number(Math.max(0.6, baseM * 0.5).toFixed(1));
  const maxM = Number((baseM * 2.0).toFixed(1));
  return { baseM, minM, maxM };
}

export function getActiveManagerAnnualSalaryM(
  career: CareerSave,
  manager?: RealManager | null
): number {
  const activeMgr = manager === undefined ? getActiveCareerManager(career) : manager;
  if (!activeMgr) return 0.8;
  if (
    typeof career.activeManagerSalaryM === 'number' &&
    Number.isFinite(career.activeManagerSalaryM) &&
    career.activeManagerSalaryM > 0
  ) {
    return Number(career.activeManagerSalaryM.toFixed(1));
  }
  return getBaseManagerAnnualSalaryM(activeMgr);
}

export function getActiveManagerContractUntil(
  career: CareerSave,
  manager?: RealManager | null
): number | null {
  const activeMgr = manager === undefined ? getActiveCareerManager(career) : manager;
  if (!activeMgr) return null;
  if (
    typeof career.activeManagerContractUntil === 'number' &&
    Number.isFinite(career.activeManagerContractUntil) &&
    career.activeManagerContractUntil >= 2026
  ) {
    return career.activeManagerContractUntil;
  }
  const currentYear = Number(career.season.slice(0, 4)) || 2026;
  return currentYear + 2;
}

export function getManagerContractExtensionCostM(
  annualSalaryM: number,
  years: 1 | 2 | 3
): number {
  return Number(Math.max(0.5, annualSalaryM * 0.25 * years).toFixed(1));
}

export function getManagerHireFeeM(manager: RealManager, currentClubId?: string): number {
  if (typeof manager.hireFeeM === 'number' && Number.isFinite(manager.hireFeeM)) {
    return manager.hireFeeM;
  }
  const baseFee = Math.max(6, Math.round((manager.tacticalRating - 78) * 1.15));
  const isEmployedElsewhere =
    manager.clubId !== 'free-agent' && (!currentClubId || manager.clubId !== currentClubId);
  return isEmployedElsewhere ? baseFee + 4 : baseFee;
}

export function getManagerSeveranceM(manager: RealManager, customAnnualSalaryM?: number): number {
  const baseSeverance = getManagerHireFeeM(manager, manager.clubId) * 0.25;
  const salaryFactor =
    typeof customAnnualSalaryM === 'number' && customAnnualSalaryM > 0
      ? Math.max(1.5, customAnnualSalaryM * 0.45)
      : baseSeverance;
  return Math.max(1.5, Number(Math.max(baseSeverance, salaryFactor).toFixed(1)));
}

export function getManagerImpactSummary(
  manager: RealManager | null | undefined,
  tactics?: TacticSettings
): {
  atkBonus: number;
  midBonus: number;
  defBonus: number;
  cohesionBonus: number;
  recoveryBonus: number;
  formationMatch: boolean;
  label: string;
} {
  if (!manager) {
    return {
      atkBonus: -1.5,
      midBonus: -1.5,
      defBonus: -1.5,
      cohesionBonus: -6,
      recoveryBonus: 0,
      formationMatch: false,
      label: 'Tạm quyền (thiếu HLV trưởng: -1.5 chỉ số tuyến, -6 gắn kết)',
    };
  }

  const base = Math.max(-0.4, Math.min(2.0, (manager.tacticalRating - 85) * 0.16));
  const styleAtk =
    manager.pressingStyle === 'High Gegenpress'
      ? 0.7
      : manager.pressingStyle === 'Mid-Block Counter'
        ? 0.5
        : manager.pressingStyle === 'Positional Control'
          ? 0.3
          : 0.0;
  const styleMid =
    manager.pressingStyle === 'Positional Control'
      ? 1.0
      : manager.pressingStyle === 'High Gegenpress'
        ? 0.4
        : 0.2;
  const styleDef =
    manager.pressingStyle === 'Low Compact'
      ? 1.1
      : manager.pressingStyle === 'Mid-Block Counter'
        ? 0.5
        : 0.2;

  const formationMatch = Boolean(tactics && tactics.formation === manager.preferredFormation);
  const cohesionBonus = formationMatch ? 4 : 0;
  const recoveryBonus = manager.manManagement >= 93 ? 2 : manager.manManagement >= 88 ? 1 : 0;

  return {
    atkBonus: Number((base + styleAtk).toFixed(2)),
    midBonus: Number((base + styleMid).toFixed(2)),
    defBonus: Number((base + styleDef).toFixed(2)),
    cohesionBonus,
    recoveryBonus,
    formationMatch,
    label: `${manager.name} (${manager.preferredFormation}${formationMatch ? ' · Khớp sơ đồ +4 Gắn kết' : ''})`,
  };
}

const POSITION_COMPATIBILITY: Record<Position, Position[]> = {
  GK: ['GK'],
  LB: ['LB', 'CB', 'RB', 'LW'],
  RB: ['RB', 'LB', 'CB', 'RW'],
  CB: ['CB', 'CDM', 'LB', 'RB'],
  CDM: ['CDM', 'CM', 'CB'],
  CM: ['CM', 'CDM', 'CAM'],
  CAM: ['CAM', 'CM', 'LW', 'RW', 'ST'],
  LW: ['LW', 'RW', 'CAM', 'ST', 'LB'],
  RW: ['RW', 'LW', 'CAM', 'ST', 'RB'],
  ST: ['ST', 'LW', 'RW', 'CAM'],
};

export function getNextSeasonString(season: string): string {
  const match = season.match(/^(\d{4})\/(\d{2})$/);
  if (!match) return '2027/28';
  const startYear = Number(match[1]) + 1;
  const endShort = String((Number(match[2]) + 1) % 100).padStart(2, '0');
  return `${startYear}/${endShort}`;
}

export function applyMarketOverrides(
  players: Player[],
  overrides: Record<string, MarketOverride>
): Player[] {
  if (!overrides || Object.keys(overrides).length === 0) return players;
  return players.map((p) => {
    const ov = overrides[p.id];
    if (!ov) return p;
    return {
      ...p,
      clubId: ov.clubId,
      marketValueM: ov.marketValueM,
      rating: ov.rating,
      transferStatus: ov.transferStatus,
    };
  });
}

export function applySeasonAgeToPlayers(players: Player[], season: string): Player[] {
  const currentYear = Number(season.slice(0, 4)) || 2026;
  const yearOffset = Math.max(0, currentYear - 2026);
  if (yearOffset === 0) return players;
  return players.map((p) => ({
    ...p,
    age: p.age + yearOffset,
  }));
}

export function buildEffectiveDatabasePlayers(
  _userSquad: Player[],
  basePlayers: Player[] = INITIAL_PLAYERS,
  marketOverrides?: Record<string, MarketOverride>
): Player[] {
  // Hướng A: Giữ nguyên dữ liệu gốc (+ biến động thị trường) cho các CLB AI thi đấu công bằng,
  // tách biệt hoàn toàn với phiên bản thẻ nâng cấp riêng trong đội hình của người chơi.
  return applyMarketOverrides(basePlayers, marketOverrides ?? {});
}

export function isPlayerInjured(player?: Player | null): boolean {
  return Boolean(player?.injury && player.injury.matchesRemaining > 0);
}

export function isPlayerSuspended(player?: Player | null): boolean {
  return Boolean(player?.suspendedMatches && player.suspendedMatches > 0);
}

export function isPlayerUnavailable(player?: Player | null): boolean {
  return isPlayerInjured(player) || isPlayerSuspended(player);
}

export function buildAutoLineupSlots(formation: FormationId, clubSquad: Player[]): TacticSlot[] {
  const template = FORMATION_TEMPLATES[formation];
  const usedIds = new Set<string>();
  const sorted = [...clubSquad].sort((a, b) => {
    const aUnavail = isPlayerUnavailable(a) ? 1 : 0;
    const bUnavail = isPlayerUnavailable(b) ? 1 : 0;
    if (aUnavail !== bUnavail) return aUnavail - bUnavail;
    return b.rating - a.rating;
  });

  return template.map((tpl, idx) => {
    const compatOrder = POSITION_COMPATIBILITY[tpl.label];
    let picked: Player | undefined;

    for (const pos of compatOrder) {
      picked = sorted.find((pl) => !usedIds.has(pl.id) && !isPlayerUnavailable(pl) && pl.position === pos);
      if (picked) break;
    }

    if (!picked) {
      picked = sorted.find((pl) => !usedIds.has(pl.id) && !isPlayerUnavailable(pl));
    }

    if (!picked) {
      for (const pos of compatOrder) {
        picked = sorted.find((pl) => !usedIds.has(pl.id) && pl.position === pos);
        if (picked) break;
      }
    }

    if (!picked) {
      picked = sorted.find((pl) => !usedIds.has(pl.id)) ?? sorted[0];
    }

    if (picked) {
      usedIds.add(picked.id);
    }

    return {
      slotIndex: idx,
      label: tpl.label,
      x: tpl.x,
      y: tpl.y,
      playerId: picked?.id ?? '',
      role: tpl.defaultRole,
    };
  });
}

export function repairTacticsAfterSquadChange(
  tactics: TacticSettings,
  squad: Player[]
): TacticSettings {
  const byId = new Map(squad.map((p) => [p.id, p]));
  const healthyPool = [...squad]
    .filter((p) => !isPlayerUnavailable(p))
    .sort((a, b) => b.rating - a.rating);
  const fallbackPool = [...squad].sort((a, b) => b.rating - a.rating);

  const validSlotIds = new Set<string>();
  for (const s of tactics.slots) {
    const p = byId.get(s.playerId);
    if (p && !isPlayerUnavailable(p) && !validSlotIds.has(p.id)) {
      validSlotIds.add(p.id);
    }
  }

  let changed = false;
  const seenAfter = new Set<string>();
  const nextSlots = tactics.slots.map((s) => {
    const current = byId.get(s.playerId);
    if (current && !isPlayerUnavailable(current) && !seenAfter.has(current.id)) {
      seenAfter.add(current.id);
      return s;
    }
    changed = true;
    const compatOrder = POSITION_COMPATIBILITY[s.label];
    let replacement: Player | undefined;
    for (const pos of compatOrder) {
      replacement = healthyPool.find(
        (p) => !validSlotIds.has(p.id) && !seenAfter.has(p.id) && p.position === pos
      );
      if (replacement) break;
    }
    if (!replacement) {
      replacement = healthyPool.find((p) => !validSlotIds.has(p.id) && !seenAfter.has(p.id));
    }
    if (!replacement) {
      replacement = fallbackPool.find((p) => !validSlotIds.has(p.id) && !seenAfter.has(p.id)) ?? fallbackPool[0];
    }
    if (replacement) {
      validSlotIds.add(replacement.id);
      seenAfter.add(replacement.id);
    }
    return {
      ...s,
      playerId: replacement?.id ?? '',
    };
  });

  const xiIds = new Set(nextSlots.map((s) => s.playerId).filter(Boolean));
  const xiSorted = nextSlots
    .map((s) => byId.get(s.playerId))
    .filter((p): p is Player => Boolean(p))
    .sort((a, b) => {
      if (a.position === 'GK' && b.position !== 'GK') return 1;
      if (b.position === 'GK' && a.position !== 'GK') return -1;
      return b.attributes.sho - a.attributes.sho;
    });

  const nextDesignatedPen =
    tactics.designatedPenaltyTakerId && xiIds.has(tactics.designatedPenaltyTakerId)
      ? tactics.designatedPenaltyTakerId
      : xiSorted[0]?.id;

  const cleanedPenList: string[] = [];
  const seenPen = new Set<string>();
  for (const id of tactics.penaltyTakerIds ?? []) {
    if (id && xiIds.has(id) && !seenPen.has(id)) {
      cleanedPenList.push(id);
      seenPen.add(id);
    }
  }
  for (const p of xiSorted) {
    if (cleanedPenList.length >= 10) break;
    if (!seenPen.has(p.id)) {
      cleanedPenList.push(p.id);
      seenPen.add(p.id);
    }
  }

  if (
    !changed &&
    nextDesignatedPen === tactics.designatedPenaltyTakerId &&
    cleanedPenList.length === (tactics.penaltyTakerIds?.length ?? 0)
  ) {
    return tactics;
  }

  return {
    ...tactics,
    slots: nextSlots,
    designatedPenaltyTakerId: nextDesignatedPen,
    penaltyTakerIds: cleanedPenList,
  };
}

export function generateRoundRobinFixtures(clubIds: string[]): Fixture[] {
  const teams = [...clubIds];
  if (teams.length % 2 !== 0) teams.push('BYE');
  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const fixtures: Fixture[] = [];

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < half; i++) {
      const t1 = teams[i];
      const t2 = teams[n - 1 - i];
      if (t1 !== 'BYE' && t2 !== 'BYE') {
        const isEvenRound = round % 2 === 0;
        const home = isEvenRound ? t1 : t2;
        const away = isEvenRound ? t2 : t1;
        fixtures.push({
          id: `mw-${round + 1}-${home}-${away}`,
          matchweek: round + 1,
          homeClubId: home,
          awayClubId: away,
          played: false,
        });
        fixtures.push({
          id: `mw-${round + 1 + rounds}-${away}-${home}`,
          matchweek: round + 1 + rounds,
          homeClubId: away,
          awayClubId: home,
          played: false,
        });
      }
    }
    const last = teams.pop()!;
    teams.splice(1, 0, last);
  }

  return fixtures.sort((a, b) => a.matchweek - b.matchweek);
}

function makeEmptyStanding(clubId: string): LeagueStanding {
  const club = CLUBS.find((c) => c.id === clubId) ?? CLUBS[0];
  return {
    clubId: club.id,
    clubName: club.name,
    shortName: club.shortName,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
    points: 0,
    form: [],
  };
}

function generateSingleRoundRobinGroupMatches(
  groupClubIds: string[],
  groupName: string
): CupMatch[] {
  const teams = [...groupClubIds];
  const n = teams.length;
  const rounds = n - 1;
  const half = n / 2;
  const matches: CupMatch[] = [];

  for (let round = 0; round < rounds; round++) {
    for (let i = 0; i < half; i++) {
      const home = round % 2 === 0 ? teams[i] : teams[n - 1 - i];
      const away = round % 2 === 0 ? teams[n - 1 - i] : teams[i];
      matches.push({
        id: `cc-g-${groupName.replace(/\s+/g, '')}-r${round + 1}-${home}-${away}`,
        stage: 'group',
        round: round + 1,
        groupName,
        homeClubId: home,
        awayClubId: away,
        played: false,
      });
    }
    const last = teams.pop()!;
    teams.splice(1, 0, last);
  }

  return matches;
}

export function buildCompetitionsForSeason(
  season: string,
  userClubId: string,
  prevStandings?: LeagueStanding[],
  prevCupWinnerId?: string
): CompetitionsState {
  // Choose 16 clubs for Champions Cup: always include userClubId + top ranked / highest reputation clubs
  const rankedPool =
    prevStandings && prevStandings.length > 0
      ? sortStandings(prevStandings).map((s) => s.clubId)
      : [...CLUBS].sort((a, b) => b.reputation - a.reputation).map((c) => c.id);

  const allClubIdsSorted = [...CLUBS]
    .sort((a, b) => b.reputation - a.reputation)
    .map((c) => c.id);

  const combinedOrder = Array.from(new Set([userClubId, ...rankedPool, ...allClubIdsSorted]));
  const ccClubs = combinedOrder.slice(0, 16);

  // Distribute in snake pots across 4 groups (Bảng A, B, C, D) so user has balanced opponents
  const groupNames = ['Bảng A', 'Bảng B', 'Bảng C', 'Bảng D'];
  const buckets: string[][] = [[], [], [], []];
  ccClubs.forEach((cid, idx) => {
    const pot = Math.floor(idx / 4);
    const pos = idx % 4;
    const gIdx = pot % 2 === 0 ? pos : 3 - pos;
    buckets[gIdx].push(cid);
  });

  const groups: ChampionsGroup[] = groupNames.map((name, idx) => ({
    name,
    standings: buckets[idx].map(makeEmptyStanding),
  }));

  const ccMatches: CupMatch[] = groupNames.flatMap((name, idx) =>
    generateSingleRoundRobinGroupMatches(buckets[idx], name)
  );

  const championsCup: ChampionsCupState = {
    stage: 'group',
    currentRound: 1,
    groups,
    matches: ccMatches,
  };

  // National Cup: 16 clubs -> 8 Round-of-16 knockout ties
  const seasonSeed = season.split('').reduce((acc, ch) => acc + ch.charCodeAt(0), 0);
  const rotatedPool = [...allClubIdsSorted];
  const shift = seasonSeed % rotatedPool.length;
  const shifted = [...rotatedPool.slice(shift), ...rotatedPool.slice(0, shift)];
  const ncPool = Array.from(new Set([userClubId, ...shifted])).slice(0, 16);
  const ncMatches: CupMatch[] = [];
  for (let i = 0; i < 8; i++) {
    const home = ncPool[i];
    const away = ncPool[15 - i];
    ncMatches.push({
      id: `nc-r16-${i + 1}-${home}-${away}`,
      stage: 'r16',
      round: 1,
      homeClubId: home,
      awayClubId: away,
      played: false,
    });
  }

  const nationalCup: NationalCupState = {
    stage: 'r16',
    matches: ncMatches,
  };

  // Super Cup: Champion (or User Club if top 2 / first season) vs Cup Winner / Runner-up
  const scTeamA = rankedPool[0] ?? userClubId;
  const scCandidateB =
    prevCupWinnerId && prevCupWinnerId !== scTeamA
      ? prevCupWinnerId
      : rankedPool.find((id) => id !== scTeamA) ?? CLUBS[1].id;

  const superCup: SuperCupState = {
    match: {
      id: `sc-final-${scTeamA}-${scCandidateB}`,
      stage: 'final',
      round: 1,
      homeClubId: scTeamA,
      awayClubId: scCandidateB,
      played: false,
    },
  };

  return {
    championsCup,
    nationalCup,
    superCup,
    leaderboards: {
      league: [],
      'champions-cup': [],
      'national-cup': [],
      'super-cup': [],
      friendly: [],
    },
  };
}

export function mergeMatchResultsIntoLeaderboard(
  existing: CompetitionPlayerStat[] | undefined,
  matches: MatchResultSummary[],
  userSquad: Player[],
  allPlayers: Player[]
): CompetitionPlayerStat[] {
  const byKey = new Map<string, CompetitionPlayerStat>();
  for (const row of existing ?? []) {
    const mapKey = `${row.clubId}:${row.playerId}`;
    byKey.set(mapKey, {
      ...row,
      matches: row.matches ?? 0,
      ratingSum: row.ratingSum ?? 0,
      motmCount: row.motmCount ?? 0,
    });
  }

  const userClubIdSet = new Set(userSquad.map((p) => p.clubId));
  const userById = new Map<string, Player>();
  const userByName = new Map<string, Player>();
  const userByShort = new Map<string, Player>();
  for (const p of userSquad) {
    userById.set(p.id, p);
    userByName.set(p.name, p);
    userByShort.set(p.shortName, p);
  }

  const aiByClubAndId = new Map<string, Player>();
  const aiById = new Map<string, Player>();
  const aiByName = new Map<string, Player>();
  const aiByTeamShort = new Map<string, Player>();
  for (const p of allPlayers) {
    aiByClubAndId.set(`${p.clubId}:${p.id}`, p);
    aiById.set(p.id, p);
    aiByName.set(p.name, p);
    aiByTeamShort.set(`${p.clubId}:${p.shortName}`, p);
  }

  const resolvePlayerForTeam = (
    teamId: string,
    id?: string,
    fullName?: string,
    shortName?: string
  ): Player | undefined => {
    const cleanTeamId = teamId.replace(/-away$/, '');
    if (userClubIdSet.has(cleanTeamId)) {
      return (
        (id ? userById.get(id) : undefined) ??
        (fullName ? userByName.get(fullName) : undefined) ??
        (shortName ? userByShort.get(shortName) : undefined)
      );
    }
    return (
      (id ? aiByClubAndId.get(`${cleanTeamId}:${id}`) : undefined) ??
      (shortName ? aiByTeamShort.get(`${cleanTeamId}:${shortName}`) : undefined) ??
      (id ? aiById.get(id) : undefined) ??
      (fullName ? aiByName.get(fullName) : undefined)
    );
  };

  const upsertStat = (
    player: Player | undefined,
    fallbackId: string | undefined,
    fallbackName: string,
    fallbackShortName: string,
    fallbackPos: Position,
    teamId: string,
    goalDelta: number,
    assistDelta: number,
    matchDelta = 0,
    ratingDelta = 0,
    motmDelta = 0
  ) => {
    const playerId = player?.id ?? fallbackId ?? `${teamId}:${fallbackName}`;
    const resolvedClub = teamId || player?.clubId || '';
    const mapKey = `${resolvedClub}:${playerId}`;
    const cur = byKey.get(mapKey) ?? {
      playerId,
      playerName: player?.name ?? fallbackName,
      shortName: player?.shortName ?? fallbackShortName,
      clubId: resolvedClub,
      position: player?.position ?? fallbackPos,
      goals: 0,
      assists: 0,
      matches: 0,
      ratingSum: 0,
      motmCount: 0,
    };
    if (teamId && (goalDelta > 0 || assistDelta > 0 || matchDelta > 0)) {
      cur.clubId = teamId;
    } else if (player?.clubId && !cur.clubId) {
      cur.clubId = player.clubId;
    }
    cur.goals += goalDelta;
    cur.assists += assistDelta;
    cur.matches = (cur.matches ?? 0) + matchDelta;
    cur.ratingSum = Number(((cur.ratingSum ?? 0) + ratingDelta).toFixed(2));
    cur.motmCount = (cur.motmCount ?? 0) + motmDelta;
    byKey.set(mapKey, cur);
  };

  for (const match of matches) {
    for (const ev of match.events) {
      if (ev.type !== 'goal') continue;
      const scorer = resolvePlayerForTeam(ev.teamId, ev.playerId, ev.playerName, ev.playerName);
      upsertStat(
        scorer,
        ev.playerId,
        ev.playerName,
        scorer?.shortName ?? ev.playerName,
        scorer?.position ?? 'ST',
        ev.teamId,
        1,
        0
      );

      if (ev.assistName || ev.assistId) {
        const assister = resolvePlayerForTeam(
          ev.teamId,
          ev.assistId,
          ev.assistName,
          ev.assistName
        );
        upsertStat(
          assister,
          ev.assistId,
          ev.assistName ?? 'Cầu thủ',
          assister?.shortName ?? ev.assistName ?? 'Cầu thủ',
          assister?.position ?? 'CM',
          ev.teamId,
          0,
          1
        );
      }
    }

    const ratings = match.playerRatings ?? [];
    for (const r of ratings) {
      const resolved = resolvePlayerForTeam(r.clubId, r.playerId, r.playerName, r.shortName);
      const isMotm =
        Boolean(r.isMotm) ||
        Boolean(
          match.manOfTheMatch &&
            match.manOfTheMatch.clubId === r.clubId &&
            ((match.manOfTheMatch.playerId && match.manOfTheMatch.playerId === r.playerId) ||
              match.manOfTheMatch.name === r.playerName)
        );
      upsertStat(
        resolved,
        r.playerId,
        r.playerName,
        r.shortName,
        r.position,
        r.clubId,
        0,
        0,
        1,
        r.rating,
        isMotm ? 1 : 0
      );
    }
  }

  return Array.from(byKey.values())
    .filter((item) => (item.matches ?? 0) > 0 || item.goals > 0 || item.assists > 0)
    .sort((a, b) => {
      const ga = a.goals + a.assists;
      const gb = b.goals + b.assists;
      if (gb !== ga) return gb - ga;
      const avgA = (a.matches ?? 0) > 0 ? (a.ratingSum ?? 0) / (a.matches ?? 1) : 0;
      const avgB = (b.matches ?? 0) > 0 ? (b.ratingSum ?? 0) / (b.matches ?? 1) : 0;
      return avgB - avgA;
    })
    .slice(0, 500);
}

export function computeCompetitionMvpScore(
  stat: CompetitionPlayerStat,
  maxMatchesInComp: number
): number {
  const matches = Math.max(1, stat.matches ?? 1);
  const avgRating =
    typeof stat.ratingSum === 'number' && (stat.matches ?? 0) > 0
      ? stat.ratingSum / matches
      : 6.5 + Math.min(2.2, (stat.goals * 0.25 + stat.assists * 0.18) / matches);
  const motm = stat.motmCount ?? 0;
  const minThreshold = maxMatchesInComp >= 6 ? Math.max(2, Math.floor(maxMatchesInComp * 0.35)) : 1;
  const shortagePenalty = matches < minThreshold ? (minThreshold - matches) * 0.65 : 0;
  return Number(
    (avgRating * 10 + motm * 1.4 + stat.goals * 0.32 + stat.assists * 0.24 - shortagePenalty).toFixed(2)
  );
}

export function resolveCompetitionAwards(
  career: CareerSave,
  competition: CompetitionId
): {
  topScorer: CompetitionAwardWinner | null;
  mvp: CompetitionAwardWinner | null;
  mvpRanking: Array<CompetitionPlayerStat & { avgRating: number; mvpScore: number }>;
} {
  const stats = career.competitions?.leaderboards?.[competition] ?? [];
  const compTitle = COMPETITION_LABEL_MAP[competition] ?? 'Giải đấu';

  const scorerPool = [...stats]
    .filter((s) => s.goals > 0)
    .sort((a, b) => {
      if (b.goals !== a.goals) return b.goals - a.goals;
      if (b.assists !== a.assists) return b.assists - a.assists;
      const avgA = (a.matches ?? 0) > 0 ? (a.ratingSum ?? 0) / (a.matches ?? 1) : 0;
      const avgB = (b.matches ?? 0) > 0 ? (b.ratingSum ?? 0) / (b.matches ?? 1) : 0;
      return avgB - avgA;
    });

  const maxMatches = stats.reduce((mx, s) => Math.max(mx, s.matches ?? 0), 0);

  const mvpRanking = [...stats]
    .filter((s) => (s.matches ?? 0) > 0 || s.goals > 0 || s.assists > 0)
    .map((s) => {
      const m = Math.max(1, s.matches ?? 1);
      const avgRating =
        typeof s.ratingSum === 'number' && (s.matches ?? 0) > 0
          ? Number((s.ratingSum / m).toFixed(2))
          : Number(
              Math.min(9.5, 6.5 + (s.goals * 0.25 + s.assists * 0.18) / m).toFixed(2)
            );
      return {
        ...s,
        avgRating,
        mvpScore: computeCompetitionMvpScore(s, maxMatches),
      };
    })
    .sort((a, b) => {
      if (b.mvpScore !== a.mvpScore) return b.mvpScore - a.mvpScore;
      if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
      return b.goals + b.assists - (a.goals + a.assists);
    });

  const makeWinner = (
    row: CompetitionPlayerStat & { avgRating?: number },
    awardType: 'top-scorer' | 'mvp'
  ): CompetitionAwardWinner => {
    const matches = Math.max(1, row.matches ?? 1);
    const avgRating =
      typeof row.avgRating === 'number'
        ? row.avgRating
        : typeof row.ratingSum === 'number' && (row.matches ?? 0) > 0
          ? Number((row.ratingSum / matches).toFixed(2))
          : 7.0;
    return {
      id: `award-${career.season.replace('/', '-')}-${competition}-${awardType}`,
      competition,
      competitionTitle: compTitle,
      awardType,
      awardTitle: awardType === 'top-scorer' ? 'Vua phá lưới' : 'Cầu thủ xuất sắc nhất',
      season: career.season,
      playerId: row.playerId,
      playerName: row.playerName,
      shortName: row.shortName,
      clubId: row.clubId,
      position: row.position,
      goals: row.goals,
      assists: row.assists,
      avgRating,
      motmCount: row.motmCount ?? 0,
      matches: row.matches ?? 0,
      isUserPlayer: row.clubId === career.clubId,
    };
  };

  const topScorerRow = scorerPool[0];
  const mvpRow = mvpRanking[0];

  return {
    topScorer: topScorerRow ? makeWinner(topScorerRow, 'top-scorer') : null,
    mvp: mvpRow ? makeWinner(mvpRow, 'mvp') : null,
    mvpRanking,
  };
}

export function resolveLeagueTeamOfTheSeason(career: CareerSave): TeamOfTheSeasonPlayer[] {
  const stats = career.competitions?.leaderboards?.league ?? [];
  const activePool = stats.filter((s) => (s.matches ?? 0) > 0 || s.goals > 0 || s.assists > 0);
  if (activePool.length === 0) return [];

  const maxMatches = activePool.reduce((mx, s) => Math.max(mx, s.matches ?? 0), 0);
  const ranked = activePool
    .map((s) => {
      const m = Math.max(1, s.matches ?? 1);
      const avgRating =
        typeof s.ratingSum === 'number' && (s.matches ?? 0) > 0
          ? Number((s.ratingSum / m).toFixed(2))
          : Number(Math.min(9.5, 6.5 + (s.goals * 0.25 + s.assists * 0.18) / m).toFixed(2));
      const score = computeCompetitionMvpScore(s, maxMatches);
      return { stat: s, avgRating, score };
    })
    .sort((a, b) => {
      if (b.score !== a.score) return b.score - a.score;
      return b.avgRating - a.avgRating;
    });

  const usedKeys = new Set<string>();
  const picked: TeamOfTheSeasonPlayer[] = [];
  const rowKey = (s: CompetitionPlayerStat) => `${s.clubId}:${s.playerId}`;

  const takeBest = (slotLabel: Position, allowedPositions: Position[]) => {
    let found = ranked.find(
      (r) => !usedKeys.has(rowKey(r.stat)) && allowedPositions.includes(r.stat.position)
    );
    if (!found) {
      // Fallback theo tuyến tương ứng
      const groupFallbacks: Position[] =
        slotLabel === 'GK'
          ? ['GK']
          : slotLabel === 'LB' || slotLabel === 'RB' || slotLabel === 'CB'
            ? ['CB', 'LB', 'RB', 'CDM']
            : slotLabel === 'CDM' || slotLabel === 'CM' || slotLabel === 'CAM'
              ? ['CM', 'CAM', 'CDM', 'LW', 'RW']
              : ['ST', 'LW', 'RW', 'CAM'];
      found = ranked.find(
        (r) => !usedKeys.has(rowKey(r.stat)) && groupFallbacks.includes(r.stat.position)
      );
    }
    if (!found) {
      found = ranked.find((r) => !usedKeys.has(rowKey(r.stat)));
    }
    if (found) {
      usedKeys.add(rowKey(found.stat));
      picked.push({
        playerId: found.stat.playerId,
        playerName: found.stat.playerName,
        shortName: found.stat.shortName,
        clubId: found.stat.clubId,
        position: found.stat.position,
        slotLabel,
        avgRating: found.avgRating,
        goals: found.stat.goals,
        assists: found.stat.assists,
        matches: found.stat.matches ?? 0,
        isUserPlayer: found.stat.clubId === career.clubId,
      });
    }
  };

  // Sơ đồ tiêu biểu chuẩn 4-3-3
  takeBest('GK', ['GK']);
  takeBest('LB', ['LB']);
  takeBest('CB', ['CB']);
  takeBest('CB', ['CB']);
  takeBest('RB', ['RB']);
  takeBest('CDM', ['CDM', 'CM']);
  takeBest('CM', ['CM', 'CDM']);
  takeBest('CAM', ['CAM', 'CM']);
  takeBest('LW', ['LW', 'ST']);
  takeBest('ST', ['ST']);
  takeBest('RW', ['RW', 'ST']);

  return picked;
}

export function generateSeasonObjectives(
  clubId: string,
  season: string,
  squad: Player[]
): BoardObjective[] {
  const club = CLUBS.find((c) => c.id === clubId) ?? CLUBS[0];
  const rep = club.reputation;
  const maxStars = squad.reduce((mx, p) => Math.max(mx, p.stars ?? 1), 1);
  const seasonKey = season.replace('/', '-');

  const leagueTargetRank = rep >= 90 ? 1 : rep >= 86 ? 2 : rep >= 82 ? 4 : rep >= 78 ? 6 : 8;
  const leagueRewardM = rep >= 89 ? 16 : rep >= 83 ? 12 : 10;

  const cupTarget = rep >= 87 ? 'cup_semi' : 'cup_semi';
  const goalTarget = rep >= 87 ? 18 : rep >= 82 ? 14 : 11;
  const starTarget = Math.min(7, Math.max(3, maxStars + 1));

  return [
    {
      id: `obj-${seasonKey}-league`,
      title:
        leagueTargetRank === 1
          ? 'Vô địch Super League'
          : `Top ${leagueTargetRank} Super League`,
      description: `Kết thúc mùa giải Super League trong Top ${leagueTargetRank} trên bảng xếp hạng.`,
      targetType: 'league_rank',
      targetValue: leagueTargetRank,
      rewardBudgetM: leagueRewardM,
      rewardShards: 25,
      status: 'in_progress',
    },
    {
      id: `obj-${seasonKey}-cup`,
      title: rep >= 87 ? 'Bán kết Champions Cup hoặc Cúp QG' : 'Vào sâu đấu trường Cúp',
      description: 'Đưa CLB lọt tối thiểu vào vòng Bán kết Champions Cup hoặc Cúp Quốc Gia.',
      targetType: cupTarget,
      targetValue: 1,
      rewardBudgetM: 10,
      rewardShards: 20,
      status: 'in_progress',
    },
    starTarget <= 7 && maxStars < 7
      ? {
          id: `obj-${seasonKey}-star`,
          title: `Phát triển cầu thủ lên ${starTarget}★`,
          description: `Nâng cấp sao cho ít nhất 1 cầu thủ trong đội hình đạt mốc ${starTarget}★ trở lên.`,
          targetType: 'star_upgrade',
          targetValue: starTarget,
          rewardBudgetM: 8,
          rewardShards: 20,
          status: 'in_progress',
        }
      : {
          id: `obj-${seasonKey}-scorer`,
          title: `Chân sút chủ lực ghi ${goalTarget}+ bàn`,
          description: `Có ít nhất 1 cầu thủ của CLB ghi từ ${goalTarget} bàn thắng trở lên trên mọi đấu trường.`,
          targetType: 'top_scorer',
          targetValue: goalTarget,
          rewardBudgetM: 9,
          rewardShards: 20,
          status: 'in_progress',
        },
  ];
}

export function evaluateBoardObjectives(
  career: CareerSave,
  isSeasonEnding = false
): BoardObjective[] {
  const objectives =
    career.boardObjectives && career.boardObjectives.length > 0
      ? career.boardObjectives
      : generateSeasonObjectives(career.clubId, career.season, career.squad);

  const sortedTable = sortStandings(career.standings);
  const rankIdx = sortedTable.findIndex((r) => r.clubId === career.clubId);
  const myRank = rankIdx >= 0 ? rankIdx + 1 : 20;
  const leagueFinished = isCompetitionFinished(career, 'league');

  const ccMatches = career.competitions?.championsCup.matches ?? [];
  const ncMatches = career.competitions?.nationalCup.matches ?? [];
  const reachedSemiCup =
    ccMatches.some(
      (m) =>
        (m.stage === 'sf' || m.stage === 'final') &&
        (m.homeClubId === career.clubId || m.awayClubId === career.clubId)
    ) ||
    ncMatches.some(
      (m) =>
        (m.stage === 'sf' || m.stage === 'final') &&
        (m.homeClubId === career.clubId || m.awayClubId === career.clubId)
    ) ||
    career.competitions?.championsCup.championClubId === career.clubId ||
    career.competitions?.nationalCup.championClubId === career.clubId;

  const cupFinishedAll =
    isCompetitionFinished(career, 'champions-cup') &&
    isCompetitionFinished(career, 'national-cup');

  const maxSquadGoals = career.squad.reduce((mx, p) => Math.max(mx, p.goals), 0);
  const maxSquadStars = career.squad.reduce((mx, p) => Math.max(mx, p.stars ?? 1), 1);

  return objectives.map((obj) => {
    if (obj.targetType === 'league_rank') {
      const ok = myRank <= obj.targetValue;
      const status =
        leagueFinished || isSeasonEnding
          ? ok
            ? 'completed'
            : 'failed'
          : ok
            ? 'completed'
            : 'in_progress';
      return {
        ...obj,
        status,
        progressText: `Hạng hiện tại: #${myRank} / Mục tiêu Top ${obj.targetValue}`,
      };
    }

    if (obj.targetType === 'cup_semi' || obj.targetType === 'cup_champion') {
      const ok =
        obj.targetType === 'cup_champion'
          ? career.competitions?.championsCup.championClubId === career.clubId ||
            career.competitions?.nationalCup.championClubId === career.clubId
          : reachedSemiCup;
      const status = ok
        ? 'completed'
        : cupFinishedAll || isSeasonEnding
          ? 'failed'
          : 'in_progress';
      return {
        ...obj,
        status,
        progressText: ok ? 'Đã vượt qua vòng Tứ kết Cúp' : 'Đang thi đấu các vòng Cúp',
      };
    }

    if (obj.targetType === 'star_upgrade') {
      const ok = maxSquadStars >= obj.targetValue;
      return {
        ...obj,
        status: ok ? 'completed' : isSeasonEnding ? 'failed' : 'in_progress',
        progressText: `Cầu thủ cao nhất: ${maxSquadStars}★ / ${obj.targetValue}★`,
      };
    }

    // top_scorer
    const ok = maxSquadGoals >= obj.targetValue;
    return {
      ...obj,
      status: ok ? 'completed' : isSeasonEnding ? 'failed' : 'in_progress',
      progressText: `Ghi bàn cao nhất CLB: ${maxSquadGoals} / ${obj.targetValue} bàn`,
    };
  });
}

export function isCompetitionFinished(career: CareerSave, competition: CompetitionId): boolean {
  if (competition === 'league') {
    return career.fixtures.length > 0 && career.fixtures.every((f) => f.played);
  }
  if (competition === 'champions-cup') {
    return career.competitions?.championsCup.stage === 'completed';
  }
  if (competition === 'national-cup') {
    return career.competitions?.nationalCup.stage === 'completed';
  }
  if (competition === 'super-cup') {
    return Boolean(career.competitions?.superCup.match.played);
  }
  return false;
}

export function finalizeFinishedCompetitionAwards(
  career: CareerSave,
  competition: CompetitionId
): {
  nextCareer: CareerSave;
  newlyAwarded: CompetitionAwardWinner[];
  bonusBudgetM: number;
  bonusShards: number;
  newTrophiesCount: number;
} {
  if (!isCompetitionFinished(career, competition)) {
    return {
      nextCareer: career,
      newlyAwarded: [],
      bonusBudgetM: 0,
      bonusShards: 0,
      newTrophiesCount: 0,
    };
  }

  const existingAwards = [...(career.seasonAwards ?? [])];
  const existingIds = new Set(existingAwards.map((a) => a.id));
  const { topScorer, mvp } = resolveCompetitionAwards(career, competition);

  const candidates = [topScorer, mvp].filter(
    (w): w is CompetitionAwardWinner => Boolean(w && !existingIds.has(w.id))
  );

  if (candidates.length === 0) {
    return {
      nextCareer: career,
      newlyAwarded: [],
      bonusBudgetM: 0,
      bonusShards: 0,
      newTrophiesCount: 0,
    };
  }

  const nextCabinet = [...(career.trophyCabinet ?? [])];
  const inv = normalizeInventory(career.inventory);
  const nextPacks = { ...inv.packs };
  let bonusBudgetM = 0;
  let bonusShards = 0;
  let newTrophiesCount = 0;
  let nextSquad = [...career.squad];
  const isMajorComp = competition === 'league' || competition === 'champions-cup';

  for (const winner of candidates) {
    existingAwards.unshift(winner);
    if (winner.isUserPlayer) {
      const trophyId = `trophy-${winner.id}`;
      if (!nextCabinet.some((t) => t.id === trophyId)) {
        nextCabinet.unshift({
          id: trophyId,
          title: `${winner.awardTitle} ${winner.competitionTitle} (${winner.playerName})`,
          competition,
          season: career.season,
          clubId: career.clubId,
          awardedAt: new Date().toISOString(),
          awardType: winner.awardType,
          playerName: winner.playerName,
          playerId: winner.playerId,
        });
        newTrophiesCount++;
      }

      if (winner.awardType === 'mvp') {
        bonusBudgetM += isMajorComp ? 8 : 4;
        bonusShards += isMajorComp ? 25 : 15;
        if (isMajorComp) {
          nextPacks.legend_pack = (nextPacks.legend_pack ?? 0) + 1;
        } else {
          nextPacks.elite_pack = (nextPacks.elite_pack ?? 0) + 1;
        }
      } else {
        bonusBudgetM += isMajorComp ? 6 : 3;
        bonusShards += isMajorComp ? 20 : 12;
        nextPacks.elite_pack = (nextPacks.elite_pack ?? 0) + 1;
      }

      nextSquad = nextSquad.map((p) =>
        p.id === winner.playerId
          ? {
              ...p,
              morale: 100,
              marketValueM: Number((p.marketValueM * 1.08).toFixed(1)),
            }
          : p
      );
    }
  }

  const userAwardLabels = candidates
    .filter((w) => w.isUserPlayer)
    .map((w) => `${w.awardTitle} (${w.playerName})`)
    .join(', ');

  const nextLedger =
    bonusBudgetM > 0
      ? appendLedgerEntries(career.financialLedger, [
          createLedgerEntry({
            season: career.season,
            matchweek: career.matchweek,
            type: 'income',
            category: 'competition_bonus',
            title: `Thưởng danh hiệu Cá nhân ${COMPETITION_LABEL_MAP[competition] ?? 'Giải đấu'}`,
            detail: userAwardLabels || undefined,
            amountM: bonusBudgetM,
          }),
        ])
      : career.financialLedger;

  const nextCareer: CareerSave = {
    ...career,
    transferBudget: Number((career.transferBudget + bonusBudgetM).toFixed(1)),
    squad: nextSquad,
    trophyCabinet: nextCabinet.slice(0, 120),
    seasonAwards: existingAwards.slice(0, 120),
    ...(nextLedger ? { financialLedger: nextLedger } : {}),
    inventory: normalizeInventory({
      ...inv,
      packs: nextPacks,
      universalShards: inv.universalShards + bonusShards,
    }),
  };

  return {
    nextCareer,
    newlyAwarded: candidates,
    bonusBudgetM,
    bonusShards,
    newTrophiesCount,
  };
}

export function ensureCareerCompetitions(career: CareerSave): CareerSave {
  const hasComps =
    career.competitions &&
    career.competitions.championsCup &&
    career.competitions.nationalCup &&
    career.competitions.superCup;

  let competitions: CompetitionsState = hasComps
    ? career.competitions!
    : buildCompetitionsForSeason(career.season, career.clubId, career.standings);

  if (!competitions.leaderboards) {
    const seeded: Partial<Record<CompetitionId, CompetitionPlayerStat[]>> = {
      league: [],
      'champions-cup': [],
      'national-cup': [],
      'super-cup': [],
      friendly: [],
    };
    for (const res of career.recentResults ?? []) {
      const compId: CompetitionId = res.competition ?? 'league';
      seeded[compId] = mergeMatchResultsIntoLeaderboard(
        seeded[compId],
        [res],
        career.squad,
        INITIAL_PLAYERS
      );
    }
    competitions = {
      ...competitions,
      leaderboards: seeded,
    };
  }

  // Repair legacy leaderboard entries where a bought/recruited bench player with 0 appearances
  // had AI-club goals misattributed to the user's clubId.
  const squadById = new Map(career.squad.map((p) => [p.id, p]));
  const baseById = new Map(INITIAL_PLAYERS.map((p) => [p.id, p]));
  let repairedLeaderboards = false;
  if (competitions.leaderboards) {
    const nextLeaderboards = { ...competitions.leaderboards };
    for (const compKey of ['league', 'champions-cup', 'national-cup', 'super-cup'] as const) {
      const list = nextLeaderboards[compKey];
      if (!list || list.length === 0) continue;
      let changedList = false;
      const updatedList = list.map((row) => {
        if (row.clubId !== career.clubId) return row;
        const sq = squadById.get(row.playerId);
        const orig = baseById.get(row.playerId);
        if (
          sq &&
          sq.appearances === 0 &&
          sq.goals === 0 &&
          sq.assists === 0 &&
          orig &&
          orig.clubId !== career.clubId
        ) {
          changedList = true;
          return { ...row, clubId: orig.clubId };
        }
        return row;
      });
      if (changedList) {
        nextLeaderboards[compKey] = updatedList;
        repairedLeaderboards = true;
      }
    }
    if (repairedLeaderboards) {
      competitions = {
        ...competitions,
        leaderboards: nextLeaderboards,
      };
    }
  }

  const hasInventory = Boolean(
    career.inventory &&
      career.inventory.packs &&
      career.inventory.playerCards &&
      typeof career.inventory.universalShards === 'number'
  );
  const hasAllStars = career.squad.every((p) => typeof p.stars === 'number');
  const hasLegacy2099Contracts = career.squad.some((p) => p.contractUntil >= 2090);
  const clubDefaultMgr = CLUBS.find((c) => c.id === career.clubId)?.managerId ?? REAL_MANAGERS[0].id;
  const resolvedActiveMgrId =
    career.activeManagerId === undefined ? clubDefaultMgr : career.activeManagerId;
  const resolvedMgrObj =
    resolvedActiveMgrId !== null
      ? REAL_MANAGERS.find((m) => m.id === resolvedActiveMgrId) ?? null
      : null;
  const hasManagerFields =
    career.activeManagerId !== undefined &&
    (resolvedMgrObj === null ||
      (typeof career.activeManagerSalaryM === 'number' &&
        career.activeManagerSalaryM > 0 &&
        typeof career.activeManagerContractUntil === 'number' &&
        career.activeManagerContractUntil >= 2026)) &&
    Array.isArray(career.managerHistory) &&
    Array.isArray(career.seasonAwards);
  const needsSquadPadding = career.squad.length < 21;
  const hasBoardObjectives = Array.isArray(career.boardObjectives) && career.boardObjectives.length > 0;
  const hasFinancialLedger = Array.isArray(career.financialLedger);
  const hasPayrollHistory = Array.isArray(career.payrollHistory);
  const hasYouthAcademy = Boolean(
    career.youthAcademy && Array.isArray(career.youthAcademy.prospects)
  );
  const hasClubRecords = !needsClubRecordsBackfill(career);
  const hasFreeAgents = Array.isArray(career.freeAgents) && career.freeAgents.length > 0;
  const hasQuests = Boolean(career.quests && Array.isArray(career.quests.items) && career.quests.items.length > 0);
  const questsState = ensureQuestsState(career.quests);
  const questsChanged =
    !hasQuests ||
    questsState.dailyKey !== career.quests?.dailyKey ||
    questsState.weeklyKey !== career.quests?.weeklyKey;

  if (
    hasComps &&
    career.competitions?.leaderboards &&
    !repairedLeaderboards &&
    career.trophyCabinet &&
    career.seasonHistory &&
    hasInventory &&
    hasAllStars &&
    !hasLegacy2099Contracts &&
    hasManagerFields &&
    !needsSquadPadding &&
    hasBoardObjectives &&
    hasFinancialLedger &&
    hasPayrollHistory &&
    hasYouthAcademy &&
    hasClubRecords &&
    hasFreeAgents &&
    !questsChanged
  ) {
    return career;
  }

  const currentYear = Number(career.season.slice(0, 4)) || 2026;
  let paddedSquad: Player[] = career.squad.map((p) => ({
    ...p,
    stars: p.stars ?? 1,
    contractUntil:
      p.contractUntil >= 2090 ? currentYear + 2 + (p.number % 3) : p.contractUntil,
  }));

  if (paddedSquad.length < 21) {
    const positions: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST'];
    const existingIds = new Set(paddedSquad.map((p) => p.id));
    let acadIdx = paddedSquad.length;
    let posCursor = 0;
    while (paddedSquad.length < 21) {
      const pos = positions[posCursor % positions.length];
      posCursor++;
      let candidate = createAcademyFillPlayer(career.clubId, pos, acadIdx++);
      while (existingIds.has(candidate.id)) {
        candidate = createAcademyFillPlayer(career.clubId, pos, acadIdx++);
      }
      existingIds.add(candidate.id);
      paddedSquad.push(candidate);
    }
  }

  const nextObjectives = hasBoardObjectives
    ? career.boardObjectives!
    : generateSeasonObjectives(career.clubId, career.season, paddedSquad);

  const freeAgentsPool = hasFreeAgents
    ? career.freeAgents!
    : buildInitialFreeAgentsPool(paddedSquad, career.season);

  const nowDate = new Date();
  const defaultOnlineSeasonId = `${nowDate.getFullYear()}-${String(nowDate.getMonth() + 1).padStart(2, '0')}`;

  return {
    ...career,
    activeManagerId: resolvedActiveMgrId,
    ...(resolvedMgrObj
      ? {
          activeManagerSalaryM:
            typeof career.activeManagerSalaryM === 'number' &&
            Number.isFinite(career.activeManagerSalaryM) &&
            career.activeManagerSalaryM > 0
              ? Number(career.activeManagerSalaryM.toFixed(1))
              : getBaseManagerAnnualSalaryM(resolvedMgrObj),
          activeManagerContractUntil:
            typeof career.activeManagerContractUntil === 'number' &&
            Number.isFinite(career.activeManagerContractUntil) &&
            career.activeManagerContractUntil >= 2026
              ? career.activeManagerContractUntil
              : currentYear + 2,
        }
      : {}),
    managerHistory: career.managerHistory ?? [],
    seasonAwards: career.seasonAwards ?? [],
    boardObjectives: nextObjectives,
    squad: paddedSquad,
    tactics: repairTacticsAfterSquadChange(career.tactics, paddedSquad),
    competitions,
    trophyCabinet: career.trophyCabinet ?? [],
    seasonHistory: career.seasonHistory ?? [],
    financialLedger: hasFinancialLedger
      ? career.financialLedger!
      : backfillLegacyFinancialLedger(career),
    payrollHistory: career.payrollHistory ?? [],
    youthAcademy: hasYouthAcademy ? career.youthAcademy : ensureYouthAcademy(career),
    clubRecords: hasClubRecords ? career.clubRecords : ensureClubRecords(career),
    freeAgents: freeAgentsPool,
    quests: questsState,
    onlineRankSeasonId: career.onlineRankSeasonId ?? defaultOnlineSeasonId,
    inventory: career.inventory
      ? normalizeInventory(career.inventory)
      : createStarterInventory(),
  };
}

export function createInitialCareer(
  uid: string,
  clubId: string,
  overrides: Record<string, MarketOverride> = {}
): CareerSave {
  const club = CLUBS.find((c) => c.id === clubId) ?? CLUBS[0];
  const manager = REAL_MANAGERS.find((m) => m.id === club.managerId) ?? REAL_MANAGERS[0];
  const allPlayers = applyMarketOverrides(INITIAL_PLAYERS, overrides);
  let clubSquad: Player[] = allPlayers
    .filter((p) => p.clubId === club.id)
    .map((p) => ({ ...p, stars: p.stars ?? 1 }));

  if (clubSquad.length < 21) {
    const positions: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST'];
    const existingIds = new Set(clubSquad.map((p) => p.id));
    let acadIdx = clubSquad.length;
    let posCursor = 0;
    while (clubSquad.length < 21) {
      const pos = positions[posCursor % positions.length];
      posCursor++;
      let candidate = createAcademyFillPlayer(club.id, pos, acadIdx++);
      while (existingIds.has(candidate.id)) {
        candidate = createAcademyFillPlayer(club.id, pos, acadIdx++);
      }
      existingIds.add(candidate.id);
      clubSquad.push(candidate);
    }
  }
  const formation = manager.preferredFormation;
  const initialSlots = buildAutoLineupSlots(formation, clubSquad);
  const starterById = new Map(clubSquad.map((p) => [p.id, p]));
  const starterPlayers = initialSlots
    .map((s) => starterById.get(s.playerId))
    .filter((p): p is Player => Boolean(p))
    .sort((a, b) => {
      if (a.position === 'GK' && b.position !== 'GK') return 1;
      if (b.position === 'GK' && a.position !== 'GK') return -1;
      return b.attributes.sho - a.attributes.sho;
    });

  const tactics: TacticSettings = {
    formation,
    mentality: manager.pressingStyle === 'Low Compact' ? 'Cautious' : 'Positive',
    passingDirectness: manager.pressingStyle === 'Positional Control' ? 2 : 3,
    tempo: manager.pressingStyle === 'High Gegenpress' ? 4 : 3,
    width: 3,
    pressingIntensity: manager.pressingStyle === 'Low Compact' ? 2 : 4,
    defensiveLine: manager.pressingStyle === 'Low Compact' ? 2 : 4,
    counterPress: manager.pressingStyle !== 'Low Compact',
    playOutOfDefence: manager.pressingStyle !== 'Low Compact',
    workBallIntoBox: manager.pressingStyle === 'Positional Control',
    offsideTrap: manager.pressingStyle === 'High Gegenpress',
    slots: initialSlots,
    designatedPenaltyTakerId: starterPlayers[0]?.id,
    penaltyTakerIds: starterPlayers.slice(0, 10).map((p) => p.id),
  };

  const standings: LeagueStanding[] = CLUBS.map((c) => makeEmptyStanding(c.id));
  const fixtures = generateRoundRobinFixtures(CLUBS.map((c) => c.id));
  const competitions = buildCompetitionsForSeason('2026/27', club.id, standings);

  return {
    uid,
    clubId: club.id,
    activeManagerId: manager.id,
    activeManagerSalaryM: getBaseManagerAnnualSalaryM(manager),
    activeManagerContractUntil: 2028,
    managerHistory: [],
    season: '2026/27',
    matchweek: 1,
    transferBudget: club.transferBudgetM,
    wageBudget: club.wageBudgetK,
    boardConfidence: 82,
    fanSupport: 85,
    trainingFocus: 'Tactical',
    trainingIntensity: 'balanced',
    tactics,
    squad: clubSquad,
    standings,
    fixtures,
    recentResults: [],
    transferHistory: [],
    competitions,
    trophyCabinet: [],
    seasonAwards: [],
    seasonHistory: [],
    boardObjectives: generateSeasonObjectives(club.id, '2026/27', clubSquad),
    financialLedger: [],
    payrollHistory: [],
    youthAcademy: ensureYouthAcademy({
      uid,
      clubId: club.id,
      season: '2026/27',
    } as CareerSave),
    clubRecords: createEmptyClubRecords(),
    freeAgents: buildInitialFreeAgentsPool(clubSquad, '2026/27'),
    loanedOutPlayers: [],
    loanedInPlayers: [],
    incomingTransferOffers: [],
    quests: ensureQuestsState(undefined),
    aiClubStrengthBoosts: {},
    onlineRankSeasonId: `${new Date().getFullYear()}-${String(new Date().getMonth() + 1).padStart(2, '0')}`,
    inventory: createStarterInventory(),
  };
}

const ROLE_TACTICAL_EFFECTS: Record<
  PlayerRole,
  { atk: number; mid: number; def: number; poss: number }
> = {
  'Sweeper Keeper': { atk: 0.1, mid: 0.25, def: 0.35, poss: 0.45 },
  'Ball-Playing Defender': { atk: 0.15, mid: 0.35, def: 0.25, poss: 0.55 },
  Stopper: { atk: 0.0, mid: 0.05, def: 0.65, poss: -0.2 },
  'Inverted Wing-Back': { atk: 0.2, mid: 0.45, def: 0.2, poss: 0.5 },
  'Complete Wing-Back': { atk: 0.45, mid: 0.25, def: 0.1, poss: 0.2 },
  'Deep-Lying Playmaker': { atk: 0.15, mid: 0.55, def: 0.2, poss: 0.7 },
  'Box-to-Box': { atk: 0.3, mid: 0.4, def: 0.3, poss: 0.1 },
  Mezzala: { atk: 0.45, mid: 0.4, def: 0.05, poss: 0.3 },
  'Advanced Playmaker': { atk: 0.55, mid: 0.45, def: -0.1, poss: 0.55 },
  'Inside Forward': { atk: 0.6, mid: 0.1, def: 0.0, poss: 0.1 },
  'Inverted Winger': { atk: 0.45, mid: 0.3, def: 0.05, poss: 0.4 },
  'Advanced Forward': { atk: 0.65, mid: 0.0, def: 0.0, poss: -0.1 },
  'Complete Forward': { atk: 0.55, mid: 0.2, def: 0.05, poss: 0.2 },
  'Target Forward': { atk: 0.5, mid: 0.15, def: 0.1, poss: -0.2 },
};

export interface TrainingFocusEffect {
  atkBonus: number;
  midBonus: number;
  defBonus: number;
  cohesionBonus: number;
  staminaDrainMult: number;
  injuryRiskMult: number;
  targetAttrs: (keyof PlayerAttributes)[];
  xpPerMatch: number;
  label: string;
  description: string;
}

export function getTrainingFocusModifiers(
  focus: CareerSave['trainingFocus'] = 'Tactical',
  intensity: CareerSave['trainingIntensity'] = 'balanced'
): TrainingFocusEffect {
  const xpPerMatch = intensity === 'intense' ? 26 : intensity === 'light' ? 12 : 18;
  switch (focus) {
    case 'Attacking':
      return {
        atkBonus: 1.4,
        midBonus: 0.2,
        defBonus: -0.3,
        cohesionBonus: 1,
        staminaDrainMult: 1.04,
        injuryRiskMult: 1.05,
        targetAttrs: ['sho', 'pac', 'dri'],
        xpPerMatch,
        label: 'Tấn công (+1.4 ATK)',
        description: 'Tăng +1.4 Tấn công & ưu tiên phát triển SHO / PAC / DRI sau trận.',
      };
    case 'Defending':
      return {
        atkBonus: -0.3,
        midBonus: 0.3,
        defBonus: 1.5,
        cohesionBonus: 2,
        staminaDrainMult: 1.02,
        injuryRiskMult: 1.04,
        targetAttrs: ['def', 'phy', 'pas'],
        xpPerMatch,
        label: 'Phòng ngự (+1.5 DEF)',
        description: 'Tăng +1.5 Phòng ngự, +2 Gắn kết & ưu tiên phát triển DEF / PHY / PAS.',
      };
    case 'Physical':
      return {
        atkBonus: 0.4,
        midBonus: 0.4,
        defBonus: 0.5,
        cohesionBonus: 0,
        staminaDrainMult: 0.88,
        injuryRiskMult: 1.1,
        targetAttrs: ['phy', 'pac'],
        xpPerMatch,
        label: 'Thể lực (-12% hao sức)',
        description: 'Giảm 12% hao hụt thể lực trong trận, tăng PHY / PAC (+10% rủi ro quá tải).',
      };
    case 'Recovery':
      return {
        atkBonus: -0.4,
        midBonus: 0,
        defBonus: 0,
        cohesionBonus: 2,
        staminaDrainMult: 0.76,
        injuryRiskMult: 0.75,
        targetAttrs: ['pas', 'phy'],
        xpPerMatch: Math.max(10, xpPerMatch - 4),
        label: 'Hồi phục (-25% chấn thương)',
        description: 'Giảm 24% hao sức & 25% nguy cơ chấn thương, giữ phong độ ổn định.',
      };
    case 'Tactical':
    default:
      return {
        atkBonus: 0.4,
        midBonus: 0.8,
        defBonus: 0.4,
        cohesionBonus: 4,
        staminaDrainMult: 1.0,
        injuryRiskMult: 1.0,
        targetAttrs: ['pas', 'dri'],
        xpPerMatch,
        label: 'Chiến thuật (+4 Gắn kết)',
        description: 'Tăng +4 Gắn kết đội hình, +0.8 Tuyến giữa & ưu tiên phát triển PAS / DRI.',
      };
  }
}

export function getMatchStaminaDrain(
  tactics: TacticSettings,
  isCup: boolean,
  trainingFocus?: CareerSave['trainingFocus']
): number {
  const base = isCup ? 7.5 : 9.0;
  const pressMod = (tactics.pressingIntensity - 3) * 1.1;
  const tempoMod = (tactics.tempo - 3) * 0.8;
  const counterMod = tactics.counterPress ? 1.0 : 0;
  const mentalityMod =
    tactics.mentality === 'Very Attacking'
      ? 1.2
      : tactics.mentality === 'Attacking'
        ? 0.6
        : tactics.mentality === 'Cautious'
          ? -1.0
          : 0;
  const focusMult = trainingFocus ? getTrainingFocusModifiers(trainingFocus).staminaDrainMult : 1.0;
  return Math.max(
    4,
    Math.min(15, Math.round((base + pressMod + tempoMod + counterMod + mentalityMod) * focusMult))
  );
}

export function calculateTacticalProfile(
  tactics: TacticSettings,
  squad: Player[],
  activeManager?: RealManager | null,
  trainingFocus?: CareerSave['trainingFocus']
) {
  const playerMap = new Map(squad.map((p) => [p.id, p]));
  let atkSum = 0;
  let atkCount = 0;
  let midSum = 0;
  let midCount = 0;
  let defSum = 0;
  let defCount = 0;
  let fitMatches = 0;
  let roleAtkSum = 0;
  let roleMidSum = 0;
  let roleDefSum = 0;
  let rolePossSum = 0;

  for (const slot of tactics.slots) {
    const p = playerMap.get(slot.playerId);
    if (!p) continue;

    const compat = POSITION_COMPATIBILITY[slot.label];
    const penalty = p.position === slot.label ? 0 : compat.includes(p.position) ? 3 : 10;
    if (penalty <= 3) fitMatches += 1;
    const effRating = Math.max(50, p.rating - penalty);

    const roleEffect = ROLE_TACTICAL_EFFECTS[slot.role];
    if (roleEffect) {
      roleAtkSum += roleEffect.atk;
      roleMidSum += roleEffect.mid;
      roleDefSum += roleEffect.def;
      rolePossSum += roleEffect.poss;
    }

    if (['ST', 'LW', 'RW', 'CAM'].includes(slot.label)) {
      atkSum += effRating * 0.72 + (p.attributes.sho + p.attributes.dri) * 0.14;
      atkCount++;
    } else if (['CM', 'CDM'].includes(slot.label)) {
      midSum += effRating * 0.72 + (p.attributes.pas + p.attributes.dri) * 0.14;
      midCount++;
    } else if (slot.label === 'GK') {
      // Goalkeepers use true GK rating + distribution/physicality instead of outfield tackling (def)
      defSum += effRating * 0.86 + p.attributes.pas * 0.06 + p.attributes.phy * 0.08;
      defCount++;
    } else {
      defSum += effRating * 0.72 + (p.attributes.def + p.attributes.phy) * 0.14;
      defCount++;
    }
  }

  const mentalityAtkBonus =
    tactics.mentality === 'Very Attacking'
      ? 4.5
      : tactics.mentality === 'Attacking'
        ? 3.0
        : tactics.mentality === 'Positive'
          ? 1.5
          : tactics.mentality === 'Cautious'
            ? -1.5
            : 0.5;

  const mentalityDefBonus =
    tactics.mentality === 'Cautious'
      ? 3.5
      : tactics.mentality === 'Balanced'
        ? 1.5
        : tactics.mentality === 'Positive'
          ? 0.5
          : tactics.mentality === 'Very Attacking'
            ? -2.5
            : -1.0;

  // Width, pressing intensity & defensive line tactical sliders
  const widthAtkBonus = (tactics.width - 3) * 0.45;
  const widthMidBonus = (3 - tactics.width) * 0.35;
  const pressingAtkBonus = (tactics.pressingIntensity - 3) * 0.35;
  const pressingMidBonus = (tactics.pressingIntensity - 3) * 0.55;
  const pressingPossBonus = (tactics.pressingIntensity - 3) * 0.85;
  const lineMidBonus = (tactics.defensiveLine - 3) * 0.45;
  const lineDefBonus =
    tactics.defensiveLine < 3
      ? (3 - tactics.defensiveLine) * 0.65
      : -(tactics.defensiveLine - 3) * 0.4;
  const linePossBonus = (tactics.defensiveLine - 3) * 0.55;

  const mgrImpact =
    activeManager !== undefined
      ? getManagerImpactSummary(activeManager, tactics)
      : { atkBonus: 0, midBonus: 0, defBonus: 0, cohesionBonus: 0 };

  const focusBonus = trainingFocus
    ? getTrainingFocusModifiers(trainingFocus)
    : { atkBonus: 0, midBonus: 0, defBonus: 0, cohesionBonus: 0 };

  const attack = Math.min(
    99,
    Math.round(
      (atkCount ? atkSum / atkCount : 75) +
        mentalityAtkBonus +
        widthAtkBonus +
        pressingAtkBonus +
        roleAtkSum * 0.42 +
        (tactics.workBallIntoBox ? 0.8 : 0) +
        mgrImpact.atkBonus +
        focusBonus.atkBonus
    )
  );
  const midfield = Math.min(
    99,
    Math.round(
      (midCount ? midSum / midCount : 75) +
        widthMidBonus +
        pressingMidBonus +
        lineMidBonus +
        roleMidSum * 0.42 +
        (tactics.playOutOfDefence ? 1.2 : 0) +
        (tactics.counterPress ? 0.8 : 0) +
        (tactics.passingDirectness <= 2 ? 0.6 : 0) +
        mgrImpact.midBonus +
        focusBonus.midBonus
    )
  );
  const defense = Math.min(
    99,
    Math.round(
      (defCount ? defSum / defCount : 75) +
        mentalityDefBonus +
        lineDefBonus +
        roleDefSum * 0.42 +
        (tactics.offsideTrap && tactics.defensiveLine >= 4 ? 0.6 : 0) +
        mgrImpact.defBonus +
        focusBonus.defBonus
    )
  );
  const cohesion = Math.max(
    45,
    Math.min(
      100,
      Math.round(
        (fitMatches / 11) * 85 +
          (tactics.counterPress ? 8 : 5) +
          7 +
          mgrImpact.cohesionBonus +
          focusBonus.cohesionBonus
      )
    )
  );
  const possessionIndex = Math.min(
    75,
    Math.max(
      32,
      Math.round(
        48 +
          (6 - tactics.passingDirectness) * 3.5 +
          (tactics.playOutOfDefence ? 4 : -2) +
          pressingPossBonus +
          linePossBonus +
          rolePossSum * 0.65 +
          (midfield - 80) * 0.4
      )
    )
  );

  return {
    attack,
    midfield,
    defense,
    cohesion,
    possessionIndex,
    overall: Math.round((attack + midfield + defense) / 3),
  };
}

export function sortStandings(standings: LeagueStanding[]): LeagueStanding[] {
  return [...standings].sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const gdA = a.gf - a.ga;
    const gdB = b.gf - b.ga;
    if (gdB !== gdA) return gdB - gdA;
    if (b.gf !== a.gf) return b.gf - a.gf;
    return a.clubName.localeCompare(b.clubName);
  });
}

export function applyMatchToStandings(
  standings: LeagueStanding[],
  homeId: string,
  awayId: string,
  homeGoals: number,
  awayGoals: number
): LeagueStanding[] {
  const updated = standings.map((row) => {
    if (row.clubId !== homeId && row.clubId !== awayId) return row;
    const isHome = row.clubId === homeId;
    const gf = isHome ? homeGoals : awayGoals;
    const ga = isHome ? awayGoals : homeGoals;
    const won = gf > ga ? 1 : 0;
    const drawn = gf === ga ? 1 : 0;
    const lost = gf < ga ? 1 : 0;
    const pts = won * 3 + drawn;
    const tag = won ? 'W' : drawn ? 'D' : 'L';
    return {
      ...row,
      played: row.played + 1,
      won: row.won + won,
      drawn: row.drawn + drawn,
      lost: row.lost + lost,
      gf: row.gf + gf,
      ga: row.ga + ga,
      points: row.points + pts,
      form: [...row.form, tag].slice(-5),
    };
  });
  return sortStandings(updated);
}

interface StarterEntry {
  player: Player;
  slotLabel: Position;
}

const ACADEMY_PLAYER_NAMES = [
  { name: 'Nguyễn Hoàng Minh', shortName: 'Hoàng Minh', nat: 'Việt Nam' },
  { name: 'Trần Quang Huy', shortName: 'Quang Huy', nat: 'Việt Nam' },
  { name: 'Lê Gia Bảo', shortName: 'Gia Bảo', nat: 'Việt Nam' },
  { name: 'Lucas Fernandez', shortName: 'Fernandez', nat: 'Tây Ban Nha' },
  { name: 'Mateo Silva', shortName: 'M. Silva', nat: 'Brazil' },
  { name: 'Noah Lindqvist', shortName: 'Lindqvist', nat: 'Thụy Điển' },
  { name: 'Ethan Gallagher', shortName: 'Gallagher', nat: 'Anh' },
  { name: 'Julian Brandtner', shortName: 'Brandtner', nat: 'Đức' },
  { name: 'Marco Bellini', shortName: 'Bellini', nat: 'Ý' },
  { name: 'Enzo Chevalier', shortName: 'Chevalier', nat: 'Pháp' },
  { name: 'Kaito Takahashi', shortName: 'Takahashi', nat: 'Nhật Bản' },
  { name: 'Phạm Đức Anh', shortName: 'Đức Anh', nat: 'Việt Nam' },
];

function createAcademyFillPlayer(clubId: string, position: Position, index: number): Player {
  const isGk = position === 'GK';
  let seed = index * 37;
  for (let i = 0; i < clubId.length; i++) seed += clubId.charCodeAt(i) * (i + 3);
  const picked = ACADEMY_PLAYER_NAMES[Math.abs(seed) % ACADEMY_PLAYER_NAMES.length];
  const baseStat = 71 + (Math.abs(seed) % 5); // 71..75
  const potStat = Math.min(86, baseStat + 6 + (Math.abs(seed) % 5));
  const shirtNum = 35 + (index % 60);
  const isAtk = position === 'ST' || position === 'LW' || position === 'RW' || position === 'CAM';
  const isDef = position === 'CB' || position === 'LB' || position === 'RB' || position === 'CDM';
  return {
    id: `acad-${clubId}-${index}`,
    name: picked.name,
    shortName: picked.shortName,
    clubId,
    position,
    number: shirtNum,
    age: 18 + (Math.abs(seed) % 4),
    nationality: picked.nat,
    flagCode: 'UN',
    rating: baseStat,
    potential: potStat,
    marketValueM: Number(
      (baseStat <= 72
        ? 0.45 + (baseStat - 71) * 0.25
        : 1.0 + (baseStat - 73) * 0.45
      ).toFixed(2)
    ),
    wageK: Math.max(6, 6 + (baseStat - 70) * 2),
    contractUntil: 2030,
    fitness: 96,
    morale: 82,
    form: 6.9,
    goals: 0,
    assists: 0,
    appearances: 0,
    transferStatus: 'available',
    attributes: {
      pac: isGk ? 56 : Math.min(86, baseStat + (isAtk ? 4 : 1)),
      sho: isGk ? 42 : Math.min(85, baseStat + (isAtk ? 4 : isDef ? -8 : 0)),
      pas: Math.min(84, baseStat + (isDef ? -2 : 2)),
      dri: isGk ? 52 : Math.min(85, baseStat + (isAtk ? 3 : -1)),
      def: isGk ? 64 : Math.min(84, baseStat + (isDef ? 5 : -14)),
      phy: baseStat + (isDef ? 3 : 0),
    },
    appearance: {
      skin: '#E0AC8B',
      hair: '#1E293B',
      hairStyle: (['short', 'fade', 'curly'] as const)[Math.abs(seed) % 3],
    },
    stars: 1,
  };
}

function resolveMatchStarters(
  clubId: string,
  formation: FormationId,
  roster: Player[],
  userTactics?: TacticSettings
): StarterEntry[] {
  const byId = new Map(roster.map((p) => [p.id, p]));
  const used = new Set<string>();
  const starters: StarterEntry[] = [];

  if (userTactics) {
    for (const slot of userTactics.slots) {
      const p = byId.get(slot.playerId);
      if (p && !isPlayerUnavailable(p) && !used.has(p.id)) {
        used.add(p.id);
        starters.push({ player: p, slotLabel: slot.label });
      }
    }
  }

  if (starters.length < 11) {
    const autoSlots = buildAutoLineupSlots(formation, roster);
    for (const slot of autoSlots) {
      if (starters.length >= 11) break;
      const p = byId.get(slot.playerId);
      if (p && !isPlayerUnavailable(p) && !used.has(p.id)) {
        used.add(p.id);
        starters.push({ player: p, slotLabel: slot.label });
      }
    }
  }

  if (starters.length < 11) {
    for (const p of [...roster].sort((a, b) => b.rating - a.rating)) {
      if (starters.length >= 11) break;
      if (!used.has(p.id) && p.clubId === clubId && !isPlayerUnavailable(p)) {
        used.add(p.id);
        starters.push({ player: p, slotLabel: p.position });
      }
    }
  }

  if (starters.length < 11) {
    for (const p of [...roster].sort((a, b) => b.rating - a.rating)) {
      if (starters.length >= 11) break;
      if (!used.has(p.id) && p.clubId === clubId) {
        used.add(p.id);
        starters.push({ player: p, slotLabel: p.position });
      }
    }
  }

  // Synthesize Youth Academy prospects for depleted AI clubs so every match runs 11v11
  if (!userTactics && starters.length < 11) {
    const tpl = FORMATION_TEMPLATES[formation] ?? FORMATION_TEMPLATES['4-3-3'];
    let acadIdx = 0;
    while (starters.length < 11) {
      const pos = tpl[starters.length]?.label ?? 'CM';
      const fill = createAcademyFillPlayer(clubId, pos, acadIdx++);
      starters.push({ player: fill, slotLabel: pos });
    }
  }

  return starters.slice(0, 11);
}

function deterministicJitter(seedStr: string): number {
  let h = 2166136261;
  for (let i = 0; i < seedStr.length; i++) {
    h ^= seedStr.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  const normalized = ((h >>> 0) % 1000) / 1000;
  return (normalized - 0.45) * 0.45;
}

function computeMatchPlayerRatings(params: {
  homeId: string;
  awayId: string;
  homeGoals: number;
  awayGoals: number;
  winnerId?: string;
  events: MatchEvent[];
  homeStarters: StarterEntry[];
  awayStarters: StarterEntry[];
  deterministic?: boolean;
}): { playerRatings: MatchPlayerRating[]; motm?: ManOfTheMatch } {
  const {
    homeId,
    awayId,
    homeGoals,
    awayGoals,
    winnerId,
    events,
    homeStarters,
    awayStarters,
    deterministic = false,
  } = params;

  const rateSide = (
    clubId: string,
    starters: StarterEntry[],
    goalsFor: number,
    goalsAgainst: number
  ): MatchPlayerRating[] => {
    const won = winnerId ? winnerId === clubId : goalsFor > goalsAgainst;
    const lost = winnerId ? winnerId !== clubId : goalsFor < goalsAgainst;
    const resultAdj = won ? 0.45 : lost ? -0.35 : 0.05;

    return starters.map(({ player, slotLabel }) => {
      const goals = events.filter(
        (e) =>
          e.type === 'goal' &&
          e.teamId === clubId &&
          (e.playerId ? e.playerId === player.id : e.playerName === player.name || e.playerName === player.shortName)
      ).length;

      const assists = events.filter(
        (e) =>
          e.type === 'goal' &&
          e.teamId === clubId &&
          (e.assistId
            ? e.assistId === player.id
            : Boolean(e.assistName && (e.assistName === player.shortName || e.assistName === player.name)))
      ).length;

      const yellows = events.filter(
        (e) =>
          e.type === 'yellow' &&
          e.teamId === clubId &&
          (e.playerId
            ? e.playerId === player.id
            : e.playerName === player.shortName || e.playerName === player.name)
      ).length;

      const reds = events.filter(
        (e) =>
          e.type === 'red' &&
          e.teamId === clubId &&
          (e.playerId
            ? e.playerId === player.id
            : e.playerName === player.shortName || e.playerName === player.name)
      ).length;

      let score = 6.4 + (player.rating - 78) * 0.015 + resultAdj;

      if (goals > 0) {
        score += goals === 1 ? 1.15 : goals === 2 ? 2.1 : 2.1 + (goals - 2) * 0.8;
      }
      if (assists > 0) {
        score += assists * 0.72;
      }
      if (yellows > 0) {
        score -= yellows * 0.35;
      }
      if (reds > 0) {
        score -= 1.4;
      }

      const isGk = slotLabel === 'GK';
      const isDef = slotLabel === 'CB' || slotLabel === 'LB' || slotLabel === 'RB';
      const isCdm = slotLabel === 'CDM';
      if (goalsAgainst === 0) {
        if (isGk) score += 0.8;
        else if (isDef) score += 0.65;
        else if (isCdm) score += 0.35;
      } else if (goalsAgainst >= 2 && (isGk || isDef)) {
        score -= Math.min(0.9, (goalsAgainst - 1) * 0.24);
      }

      const compat = POSITION_COMPATIBILITY[slotLabel];
      if (player.position !== slotLabel) {
        score -= compat.includes(player.position) ? 0.1 : 0.35;
      }
      if (player.fitness < 75) {
        score -= 0.25;
      }

      const variance = deterministic
        ? deterministicJitter(`${player.id}-${goalsFor}-${goalsAgainst}`)
        : (Math.random() - 0.45) * 0.55;
      score += variance;

      const clamped = Number(Math.max(4.5, Math.min(10.0, score)).toFixed(1));
      const entry: MatchPlayerRating = {
        playerId: player.id,
        playerName: player.name,
        shortName: player.shortName,
        clubId,
        position: slotLabel,
        rating: clamped,
        goals,
        assists,
      };
      if (yellows > 0) entry.yellowCard = true;
      if (reds > 0) entry.redCard = true;
      return entry;
    });
  };

  const all = [
    ...rateSide(homeId, homeStarters, homeGoals, awayGoals),
    ...rateSide(awayId, awayStarters, awayGoals, homeGoals),
  ];

  let motm: ManOfTheMatch | undefined;
  if (all.length > 0) {
    const ranked = [...all].sort((a, b) => {
      if (b.rating !== a.rating) return b.rating - a.rating;
      const contribA = a.goals * 2 + a.assists + (winnerId && a.clubId === winnerId ? 0.5 : 0);
      const contribB = b.goals * 2 + b.assists + (winnerId && b.clubId === winnerId ? 0.5 : 0);
      return contribB - contribA;
    });
    const best = ranked[0];
    best.isMotm = true;
    motm = {
      playerId: best.playerId,
      name: best.playerName,
      clubId: best.clubId,
      rating: best.rating,
    };
  }

  return { playerRatings: all, motm };
}

function samplePoissonGoals(lambda: number, maxGoals = 9): number {
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

function computeUserConditionBonus(starters: StarterEntry[], cohesion: number): number {
  if (starters.length === 0) return 0;
  const avgFit = starters.reduce((s, e) => s + e.player.fitness, 0) / starters.length;
  const avgMorale = starters.reduce((s, e) => s + e.player.morale, 0) / starters.length;
  const avgForm = starters.reduce((s, e) => s + e.player.form, 0) / starters.length;

  // Fitness below 85 hurts sharpness; fit squad >= 92 gets slight sharpness bonus
  const fitMod =
    avgFit >= 92 ? (avgFit - 92) * 0.08 : avgFit >= 84 ? 0 : (avgFit - 84) * 0.18;
  const moraleMod = (avgMorale - 80) * 0.05;
  const formMod = (avgForm - 7.1) * 0.45;
  const cohesionMod = cohesion >= 88 ? (cohesion - 88) * 0.06 : (cohesion - 88) * 0.14;
  const starPerkBonus = starters.reduce((sum, e) => {
    const st = Math.max(1, Math.min(7, e.player.stars ?? 1));
    if (st >= 7) return sum + 0.24;
    if (st >= 5) return sum + 0.16;
    if (st >= 3) return sum + 0.06;
    return sum;
  }, 0);

  return Math.max(-4.5, Math.min(4.5, fitMod + moraleMod + formMod + cohesionMod + Math.min(2.0, starPerkBonus)));
}

export function computeAITeamProfile(
  clubId: string,
  roster: Player[],
  fallbackRep: number,
  aiClubBoost = 0
): { attack: number; midfield: number; defense: number; overall: number; formation: FormationId } {
  const club = CLUBS.find((c) => c.id === clubId);
  const mgr = REAL_MANAGERS.find((m) => m.id === club?.managerId);
  const formation: FormationId = mgr?.preferredFormation ?? '4-3-3';
  const slots = buildAutoLineupSlots(formation, roster);
  if (slots.length === 0) {
    const base = Math.max(60, Math.min(99, fallbackRep + aiClubBoost));
    return { attack: base, midfield: base, defense: base, overall: base, formation };
  }
  const aiTactics: TacticSettings = {
    formation,
    mentality: mgr?.pressingStyle === 'Low Compact' ? 'Cautious' : 'Positive',
    passingDirectness: mgr?.pressingStyle === 'Positional Control' ? 2 : 3,
    tempo: mgr?.pressingStyle === 'High Gegenpress' ? 4 : 3,
    width: 3,
    pressingIntensity: mgr?.pressingStyle === 'Low Compact' ? 2 : 4,
    defensiveLine: mgr?.pressingStyle === 'Low Compact' ? 2 : 4,
    counterPress: mgr?.pressingStyle !== 'Low Compact',
    playOutOfDefence: mgr?.pressingStyle !== 'Low Compact',
    workBallIntoBox: mgr?.pressingStyle === 'Positional Control',
    offsideTrap: false,
    slots,
  };
  const prof = calculateTacticalProfile(aiTactics, roster);
  // Subtle manager tactical rating modifier (-0.6 to +1.0) + seasonal AI club evolution
  const mgrBonus = mgr ? Math.max(-0.6, Math.min(1.0, (mgr.tacticalRating - 85) * 0.12)) : 0;
  const totalMod = mgrBonus + aiClubBoost;
  return {
    attack: Math.max(55, Math.min(99, prof.attack + totalMod)),
    midfield: Math.max(55, Math.min(99, prof.midfield + totalMod * 0.8)),
    defense: Math.max(55, Math.min(99, prof.defense + totalMod)),
    overall: Math.max(55, Math.min(99, prof.overall + totalMod)),
    formation,
  };
}

function pickWeightedItem<T>(items: T[], weightFn: (item: T) => number): T | undefined {
  if (items.length === 0) return undefined;
  const weights = items.map((it) => Math.max(0.1, weightFn(it)));
  const total = weights.reduce((s, w) => s + w, 0);
  let r = Math.random() * total;
  for (let i = 0; i < items.length; i++) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

function pickScorerFromXI(roster: Player[], designatedPenaltyId?: string): Player | undefined {
  if (designatedPenaltyId && Math.random() < 0.22) {
    const designated = roster.find((p) => p.id === designatedPenaltyId);
    if (designated) return designated;
  }
  const outfield = roster.filter((p) => p.position !== 'GK');
  const pool = outfield.length > 0 ? outfield : roster;
  return pickWeightedItem(pool, (p) => {
    const posWeight =
      p.id === designatedPenaltyId
        ? 7.5
        : p.position === 'ST'
          ? 5.5
          : p.position === 'LW' || p.position === 'RW'
            ? 3.6
            : p.position === 'CAM'
              ? 2.8
              : p.position === 'CM'
                ? 1.5
                : 0.45;
    return posWeight * (0.6 + p.attributes.sho / 100);
  });
}

function pickAssisterFromXI(roster: Player[], scorerId?: string): Player | undefined {
  const candidates = roster.filter((p) => p.id !== scorerId && p.position !== 'GK');
  if (candidates.length === 0 || Math.random() < 0.14) return undefined;
  return pickWeightedItem(candidates, (p) => {
    const posWeight =
      p.position === 'CAM'
        ? 4.2
        : p.position === 'LW' || p.position === 'RW'
          ? 3.4
          : p.position === 'CM'
            ? 3.0
            : p.position === 'LB' || p.position === 'RB'
              ? 2.0
              : p.position === 'ST'
                ? 1.6
                : 0.6;
    return posWeight * (0.6 + p.attributes.pas / 100);
  });
}

function pickYellowCardPlayer(roster: Player[]): Player | undefined {
  const outfield = roster.filter((p) => p.position !== 'GK');
  const pool = outfield.length > 0 ? outfield : roster;
  return pickWeightedItem(pool, (p) => {
    const posWeight =
      p.position === 'CB'
        ? 4.2
        : p.position === 'CDM'
          ? 3.9
          : p.position === 'LB' || p.position === 'RB'
            ? 3.2
            : p.position === 'CM'
              ? 2.6
              : p.position === 'CAM'
                ? 1.4
                : p.position === 'LW' || p.position === 'RW'
                  ? 1.1
                  : 0.9;
    return posWeight * (0.65 + (p.attributes.phy * 0.7 + p.attributes.def * 0.3) / 140);
  });
}

function pickChancePlayer(roster: Player[]): Player | undefined {
  const outfield = roster.filter((p) => p.position !== 'GK');
  const pool = outfield.length > 0 ? outfield : roster;
  return pickWeightedItem(pool, (p) => {
    const posWeight =
      p.position === 'ST'
        ? 4.5
        : p.position === 'LW' || p.position === 'RW'
          ? 3.4
          : p.position === 'CAM'
            ? 2.9
            : p.position === 'CM'
              ? 1.8
              : p.position === 'LB' || p.position === 'RB'
                ? 0.9
                : 0.5;
    return posWeight * (0.55 + (p.attributes.sho * 0.7 + p.attributes.pac * 0.3) / 120);
  });
}

function computeShotsAndXg(params: {
  attack: number;
  oppDefense: number;
  possession: number;
  goals: number;
  tempoMod?: number;
}): { shots: number; shotsOnTarget: number; xg: number; corners: number } {
  const { attack, oppDefense, possession, goals, tempoMod = 0 } = params;
  const attIntensity = (attack - oppDefense) * 0.28 + (possession - 50) * 0.22 + tempoMod;
  const rawShots = Math.round(10.5 + attIntensity + (Math.random() - 0.45) * 6);
  const shots = Math.max(goals > 0 ? goals : 2, Math.min(28, rawShots));
  const shotsOnTarget = Math.min(
    shots,
    Math.max(goals, Math.round(goals * 0.45 + shots * (0.26 + Math.random() * 0.12)))
  );
  const perShotQuality = 0.088 + Math.max(-0.03, Math.min(0.04, (attack - oppDefense) * 0.0025));
  const rawXg = shots * perShotQuality + goals * 0.26;
  const xg = Number(
    Math.max(goals > 0 ? Math.max(0.45, goals * 0.42) : 0.15, rawXg).toFixed(2)
  );
  const corners = Math.max(1, Math.round(shots * 0.38 + (possession - 50) * 0.05 + Math.random() * 2));
  return { shots, shotsOnTarget, xg, corners };
}

function computePressingYellowCount(pressingAggression: number): number {
  const baseProb = Math.max(0.4, Math.min(2.8, 1.05 + pressingAggression));
  const whole = Math.floor(baseProb);
  const extra = Math.random() < baseProb - whole ? 1 : 0;
  return Math.min(4, whole + extra);
}

function simulatePenaltyShootout(params: {
  homeId: string;
  awayId: string;
  homeClub: Club;
  awayClub: Club;
  homeStarters: StarterEntry[];
  awayStarters: StarterEntry[];
  isUserHome: boolean;
  isUserAway: boolean;
  userTactics?: TacticSettings;
  events: MatchEvent[];
}): { penaltiesHome: number; penaltiesAway: number; winnerId: string } {
  const {
    homeId,
    awayId,
    homeClub,
    awayClub,
    homeStarters,
    awayStarters,
    isUserHome,
    isUserAway,
    userTactics,
    events,
  } = params;

  const getShootoutTakers = (
    starters: StarterEntry[],
    isUserTeam: boolean,
    tactics?: TacticSettings
  ) => {
    const roster = starters.map((s) => s.player);
    const designatedList = isUserTeam ? tactics?.penaltyTakerIds : undefined;

    const ordered: Player[] = [];
    const used = new Set<string>();

    if (designatedList) {
      for (const id of designatedList) {
        if (!id || used.has(id)) continue;
        const p = roster.find((x) => x.id === id);
        if (p) {
          ordered.push(p);
          used.add(p.id);
        }
      }
    }

    const rest = [...roster].sort((a, b) => {
      if (a.position === 'GK' && b.position !== 'GK') return 1;
      if (b.position === 'GK' && a.position !== 'GK') return -1;
      return b.attributes.sho * 0.7 + b.rating * 0.3 - (a.attributes.sho * 0.7 + a.rating * 0.3);
    });
    for (const p of rest) {
      if (!used.has(p.id)) {
        used.add(p.id);
        ordered.push(p);
      }
    }
    return ordered.slice(0, 11);
  };

  const homeTakers = getShootoutTakers(
    homeStarters,
    isUserHome,
    isUserHome ? userTactics : undefined
  );
  const awayTakers = getShootoutTakers(
    awayStarters,
    isUserAway,
    isUserAway ? userTactics : undefined
  );

  let hScore = 0;
  let aScore = 0;
  events.push({
    minute: 90,
    type: 'penalty',
    teamId: homeId,
    playerName: 'Loạt luân lưu',
    description: `LUÂN LƯU 11M BẮT ĐẦU! Hai đội bước vào loạt sút penalty phân định thắng thua tại ${homeClub.stadium}.`,
  });

  for (let round = 0; round < 5; round++) {
    const hPlayer = homeTakers[round] ?? homeTakers[round % Math.max(1, homeTakers.length)];
    const aPlayer = awayTakers[round] ?? awayTakers[round % Math.max(1, awayTakers.length)];

    const hSuccess =
      Math.random() <
      Math.min(0.93, Math.max(0.66, 0.76 + (hPlayer.attributes.sho - 75) * 0.005));
    if (hSuccess) hScore++;
    events.push({
      minute: 90,
      type: 'penalty',
      teamId: homeId,
      playerName: hPlayer.name,
      description: `Loạt luân lưu [Lượt ${round + 1}] - ${homeClub.shortName}: ${hPlayer.shortName} bước lên sút... ${hSuccess ? 'VÀO! Cú sút hiểm hóc đánh bại thủ môn.' : 'KHÔNG VÀO! Cú sút bị thủ môn cản phá xuất thần.'}`,
      playerId: hPlayer.id,
    });

    const remHAfterH = 4 - round;
    const remAAfterH = 5 - round;
    if (hScore > aScore + remAAfterH || aScore > hScore + remHAfterH) {
      break;
    }

    const aSuccess =
      Math.random() <
      Math.min(0.93, Math.max(0.66, 0.76 + (aPlayer.attributes.sho - 75) * 0.005));
    if (aSuccess) aScore++;
    events.push({
      minute: 90,
      type: 'penalty',
      teamId: awayId,
      playerName: aPlayer.name,
      description: `Loạt luân lưu [Lượt ${round + 1}] - ${awayClub.shortName}: ${aPlayer.shortName} sút... ${aSuccess ? 'VÀO! Khúc cua hoàn hảo làm rung lưới.' : 'HỎNG ĂN! Áp lực quá lớn khiến cú sút đi ra ngoài.'}`,
      playerId: aPlayer.id,
    });

    const remBoth = 4 - round;
    if (hScore > aScore + remBoth || aScore > hScore + remBoth) {
      break;
    }
  }

  // Sudden death rounds if tied after 5 rounds
  let suddenDeathRound = 0;
  while (hScore === aScore && suddenDeathRound < 6) {
    const rIdx = 5 + suddenDeathRound;
    const hPlayer = homeTakers[rIdx] ?? homeTakers[suddenDeathRound % homeTakers.length];
    const aPlayer = awayTakers[rIdx] ?? awayTakers[suddenDeathRound % awayTakers.length];

    events.push({
      minute: 90,
      type: 'penalty',
      teamId: homeId,
      playerName: 'Loạt đột tử',
      description: `Loạt luân lưu [Loạt đột tử #${suddenDeathRound + 1}] - Căng thẳng tuyệt đỉnh!`,
    });

    const hSuccess =
      Math.random() <
      Math.min(0.93, Math.max(0.66, 0.76 + (hPlayer.attributes.sho - 75) * 0.005));
    if (hSuccess) hScore++;
    events.push({
      minute: 90,
      type: 'penalty',
      teamId: homeId,
      playerName: hPlayer.name,
      description: `Loạt luân lưu [Đột tử #${suddenDeathRound + 1}] - ${homeClub.shortName}: ${hPlayer.shortName} sút... ${hSuccess ? 'VÀO! Bản lĩnh thép.' : 'HỎNG! Áp lực đè nặng.'}`,
      playerId: hPlayer.id,
    });

    const aSuccess =
      Math.random() <
      Math.min(0.93, Math.max(0.66, 0.76 + (aPlayer.attributes.sho - 75) * 0.005));
    if (aSuccess) aScore++;
    events.push({
      minute: 90,
      type: 'penalty',
      teamId: awayId,
      playerName: aPlayer.name,
      description: `Loạt luân lưu [Đột tử #${suddenDeathRound + 1}] - ${awayClub.shortName}: ${aPlayer.shortName} sút... ${aSuccess ? 'VÀO! Tuyệt vời.' : 'HỎNG! Không chiến thắng được áp lực.'}`,
      playerId: aPlayer.id,
    });

    suddenDeathRound++;
  }

  if (hScore === aScore) {
    hScore += Math.random() > 0.5 ? 1 : 0;
    if (hScore === aScore) aScore += 1;
  }

  const winnerId = hScore > aScore ? homeId : awayId;
  const winnerClub = winnerId === homeId ? homeClub : awayClub;
  events.push({
    minute: 90,
    type: 'penalty',
    teamId: winnerId,
    playerName: winnerClub.shortName,
    description: `KẾT QUẢ LUÂN LƯU: ${homeClub.shortName} ${hScore} - ${aScore} ${awayClub.shortName}! ${winnerClub.name} giành chiến thắng chung cuộc!`,
  });

  return { penaltiesHome: hScore, penaltiesAway: aScore, winnerId };
}

export function simulateMatchFull(
  homeId: string,
  awayId: string,
  matchweek: number,
  userClubId: string,
  userTactics: TacticSettings,
  userSquad: Player[],
  allPlayers: Player[],
  options?: {
    isKnockout?: boolean;
    isNeutralVenue?: boolean;
    competition?: CompetitionId;
    roundLabel?: string;
    matchId?: string;
    userManager?: RealManager | null;
    trainingFocus?: CareerSave['trainingFocus'];
    aiClubStrengthBoosts?: Record<string, number>;
  }
): MatchResultSummary {
  const isUserHome = homeId === userClubId;
  const isUserAway = awayId === userClubId;

  const homeClub = CLUBS.find((c) => c.id === homeId) ?? CLUBS[0];
  const awayClub = CLUBS.find((c) => c.id === awayId) ?? CLUBS[1];

  const homeRoster = isUserHome
    ? userSquad
    : allPlayers.filter((p) => p.clubId === homeId);
  const awayRoster = isUserAway
    ? userSquad
    : allPlayers.filter((p) => p.clubId === awayId);

  const defaultHomeMgr = REAL_MANAGERS.find((m) => m.id === homeClub.managerId) ?? REAL_MANAGERS[0];
  const defaultAwayMgr = REAL_MANAGERS.find((m) => m.id === awayClub.managerId) ?? REAL_MANAGERS[1];
  const hasExplicitUserMgr = Boolean(options && 'userManager' in options);
  const userMgrResolved = hasExplicitUserMgr
    ? options?.userManager ?? null
    : isUserHome
      ? defaultHomeMgr
      : isUserAway
        ? defaultAwayMgr
        : null;

  const homeMgr = isUserHome ? userMgrResolved : defaultHomeMgr;
  const awayMgr = isUserAway ? userMgrResolved : defaultAwayMgr;

  const homeStarters = resolveMatchStarters(
    homeId,
    isUserHome ? userTactics.formation : (homeMgr?.preferredFormation ?? '4-3-3'),
    homeRoster,
    isUserHome ? userTactics : undefined
  );
  const awayStarters = resolveMatchStarters(
    awayId,
    isUserAway ? userTactics.formation : (awayMgr?.preferredFormation ?? '4-3-3'),
    awayRoster,
    isUserAway ? userTactics : undefined
  );
  const homePlayingXI = homeStarters.length > 0 ? homeStarters.map((s) => s.player) : homeRoster;
  const awayPlayingXI = awayStarters.length > 0 ? awayStarters.map((s) => s.player) : awayRoster;

  const userProfile = calculateTacticalProfile(
    userTactics,
    userSquad,
    userMgrResolved,
    options?.trainingFocus
  );
  const userCondBonus = isUserHome
    ? computeUserConditionBonus(homeStarters, userProfile.cohesion)
    : isUserAway
      ? computeUserConditionBonus(awayStarters, userProfile.cohesion)
      : 0;

  const homeProfile = isUserHome
    ? {
        attack: userProfile.attack + userCondBonus,
        midfield: userProfile.midfield + userCondBonus * 0.85,
        defense: userProfile.defense + userCondBonus,
        overall: userProfile.overall + userCondBonus,
      }
    : computeAITeamProfile(
        homeId,
        homeRoster,
        homeClub.reputation,
        options?.aiClubStrengthBoosts?.[homeId] ?? 0
      );

  const awayProfile = isUserAway
    ? {
        attack: userProfile.attack + userCondBonus,
        midfield: userProfile.midfield + userCondBonus * 0.85,
        defense: userProfile.defense + userCondBonus,
        overall: userProfile.overall + userCondBonus,
      }
    : computeAITeamProfile(
        awayId,
        awayRoster,
        awayClub.reputation,
        options?.aiClubStrengthBoosts?.[awayId] ?? 0
      );

  // Match pace adjustment from user tempo/mentality applies symmetrically to openness while keeping edge fair
  const userActive = isUserHome || isUserAway;
  const tempoPace = userActive ? 1 + (userTactics.tempo - 3) * 0.05 : 1;
  const mentalityPace =
    userActive && userTactics.mentality === 'Very Attacking'
      ? 1.08
      : userActive && userTactics.mentality === 'Cautious'
        ? 0.9
        : 1.0;
  const matchPace = tempoPace * mentalityPace;

  // Attack vs Opponent Defense + Midfield control + Overall quality delta
  const homeEdge =
    (homeProfile.attack - awayProfile.defense) * 0.55 +
    (homeProfile.midfield - awayProfile.midfield) * 0.25 +
    (homeProfile.overall - awayProfile.overall) * 0.2;
  const awayEdge =
    (awayProfile.attack - homeProfile.defense) * 0.55 +
    (awayProfile.midfield - homeProfile.midfield) * 0.25 +
    (awayProfile.overall - homeProfile.overall) * 0.2;

  const isNeutralVenue = Boolean(
    options?.isNeutralVenue ||
      options?.competition === 'super-cup' ||
      (options?.roundLabel && /chung kết/i.test(options.roundLabel))
  );
  const baseHomeXg = isNeutralVenue ? 1.28 : 1.38;
  const baseAwayXg = isNeutralVenue ? 1.28 : 1.18;

  const clampExponent = (val: number) => Math.max(-1.35, Math.min(1.35, val));
  const expectedHome = Math.max(
    0.25,
    baseHomeXg * matchPace * Math.exp(clampExponent(homeEdge * 0.068))
  );
  const expectedAway = Math.max(
    0.22,
    baseAwayXg * matchPace * Math.exp(clampExponent(awayEdge * 0.068))
  );

  const homeGoals = samplePoissonGoals(expectedHome);
  const awayGoals = samplePoissonGoals(expectedAway);
  const venueLabel = isNeutralVenue ? 'Sân vận động Trung lập' : homeClub.stadium;

  const events: MatchEvent[] = [
    {
      minute: 1,
      type: 'kickoff',
      teamId: homeId,
      playerName: homeClub.shortName,
      description: `Trọng tài thổi còi khai cuộc tại ${venueLabel}.`,
    },
  ];

  const homePenId = isUserHome ? userTactics.designatedPenaltyTakerId : undefined;
  const awayPenId = isUserAway ? userTactics.designatedPenaltyTakerId : undefined;

  for (let i = 0; i < homeGoals; i++) {
    const min = Math.floor(Math.random() * 88) + 2;
    const scorer = pickScorerFromXI(homePlayingXI, homePenId);
    const assist = pickAssisterFromXI(homePlayingXI, scorer?.id);
    const ev: MatchEvent = {
      minute: min,
      type: 'goal',
      teamId: homeId,
      playerName: scorer?.name ?? homeClub.shortName,
      description: `VÀO! ${scorer?.name ?? 'Tiền đạo'} dứt điểm lạnh lùng cho ${homeClub.shortName}${assist ? ` (kiến tạo: ${assist.shortName})` : ''}.`,
    };
    if (scorer?.id) ev.playerId = scorer.id;
    if (assist?.id) ev.assistId = assist.id;
    if (assist?.shortName) ev.assistName = assist.shortName;
    events.push(ev);
  }

  for (let i = 0; i < awayGoals; i++) {
    const min = Math.floor(Math.random() * 88) + 2;
    const scorer = pickScorerFromXI(awayPlayingXI, awayPenId);
    const assist = pickAssisterFromXI(awayPlayingXI, scorer?.id);
    const ev: MatchEvent = {
      minute: min,
      type: 'goal',
      teamId: awayId,
      playerName: scorer?.name ?? awayClub.shortName,
      description: `BÀN THẮNG! ${scorer?.name ?? 'Tiền đạo'} lập công cho ${awayClub.shortName}${assist ? ` (kiến tạo: ${assist.shortName})` : ''}.`,
    };
    if (scorer?.id) ev.playerId = scorer.id;
    if (assist?.id) ev.assistId = assist.id;
    if (assist?.shortName) ev.assistName = assist.shortName;
    events.push(ev);
  }

  const homePressAggression = isUserHome
    ? (userTactics.pressingIntensity - 3) * 0.28 + (userTactics.counterPress ? 0.35 : 0)
    : homeMgr?.pressingStyle === 'High Gegenpress'
      ? 0.3
      : homeMgr?.pressingStyle === 'Low Compact'
        ? -0.2
        : 0.05;
  const awayPressAggression = isUserAway
    ? (userTactics.pressingIntensity - 3) * 0.28 + (userTactics.counterPress ? 0.35 : 0)
    : awayMgr?.pressingStyle === 'High Gegenpress'
      ? 0.3
      : awayMgr?.pressingStyle === 'Low Compact'
        ? -0.2
        : 0.05;

  const yellowsHome = computePressingYellowCount(homePressAggression);
  const yellowsAway = computePressingYellowCount(awayPressAggression);

  for (let i = 0; i < yellowsHome; i++) {
    const min = Math.floor(Math.random() * 86) + 3;
    const pl = pickYellowCardPlayer(homePlayingXI);
    const ev: MatchEvent = {
      minute: min,
      type: 'yellow',
      teamId: homeId,
      playerName: pl?.shortName ?? homeClub.shortName,
      description: `Thẻ vàng cho ${pl?.shortName ?? 'cầu thủ'} (${homeClub.shortName}) sau pha phạm lỗi chiến thuật.`,
    };
    if (pl?.id) ev.playerId = pl.id;
    events.push(ev);
  }
  for (let i = 0; i < yellowsAway; i++) {
    const min = Math.floor(Math.random() * 86) + 3;
    const pl = pickYellowCardPlayer(awayPlayingXI);
    const ev: MatchEvent = {
      minute: min,
      type: 'yellow',
      teamId: awayId,
      playerName: pl?.shortName ?? awayClub.shortName,
      description: `Thẻ vàng cho ${pl?.shortName ?? 'cầu thủ'} (${awayClub.shortName}) sau pha phạm lỗi chiến thuật.`,
    };
    if (pl?.id) ev.playerId = pl.id;
    events.push(ev);
  }

  let redsHome = 0;
  let redsAway = 0;
  const redChanceHome = Math.max(0.03, 0.055 + homePressAggression * 0.03);
  const redChanceAway = Math.max(0.03, 0.055 + awayPressAggression * 0.03);
  if (options?.competition !== 'friendly' && Math.random() < redChanceHome) {
    const min = Math.floor(Math.random() * 68) + 20;
    const pl = pickYellowCardPlayer(homePlayingXI);
    if (pl) {
      redsHome = 1;
      events.push({
        minute: min,
        type: 'red',
        teamId: homeId,
        playerId: pl.id,
        playerName: pl.shortName,
        description: `THẺ ĐỎ TRỰC TIẾP! ${pl.shortName} (${homeClub.shortName}) bị truất quyền thi đấu sau pha vào bóng nguy hiểm!`,
      });
    }
  }
  if (options?.competition !== 'friendly' && Math.random() < redChanceAway) {
    const min = Math.floor(Math.random() * 68) + 20;
    const pl = pickYellowCardPlayer(awayPlayingXI);
    if (pl) {
      redsAway = 1;
      events.push({
        minute: min,
        type: 'red',
        teamId: awayId,
        playerId: pl.id,
        playerName: pl.shortName,
        description: `THẺ ĐỎ TRỰC TIẾP! ${pl.shortName} (${awayClub.shortName}) rời sân sớm vì lỗi ngăn cản cơ hội rõ rệt!`,
      });
    }
  }

  const chanceCount = 4;
  for (let k = 0; k < chanceCount; k++) {
    const min = Math.floor(Math.random() * 85) + 4;
    const side = Math.random() > 0.48 ? homeId : awayId;
    const roster = side === homeId ? homePlayingXI : awayPlayingXI;
    const club = side === homeId ? homeClub : awayClub;
    const pl = pickChancePlayer(roster);
    const evType = k % 2 === 0 ? 'chance' : 'save';
    const ev: MatchEvent = {
      minute: min,
      type: evType,
      teamId: side,
      playerName: pl?.shortName ?? club.shortName,
      description:
        evType === 'save'
          ? `Thủ môn bay người cứu thua xuất thần trước cú sút của ${pl?.shortName ?? club.shortName}.`
          : `Cơ hội nguy hiểm! ${pl?.shortName ?? club.shortName} dứt điểm chệch cột dọc trong gang tấc.`,
    };
    if (pl?.id) ev.playerId = pl.id;
    events.push(ev);
  }

  // Sort 1' - 89' match events chronologically before 90' FT and shootout
  events.sort((a, b) => a.minute - b.minute);

  events.push({
    minute: 90,
    type: 'fulltime',
    teamId: homeId,
    playerName: 'FT',
    description: `Hết giờ! ${homeClub.name} ${homeGoals} - ${awayGoals} ${awayClub.name}.`,
  });

  let penaltiesHome: number | undefined;
  let penaltiesAway: number | undefined;
  let winnerId: string | undefined;

  if (homeGoals > awayGoals) {
    winnerId = homeId;
  } else if (awayGoals > homeGoals) {
    winnerId = awayId;
  } else if (options?.isKnockout) {
    const shootoutRes = simulatePenaltyShootout({
      homeId,
      awayId,
      homeClub,
      awayClub,
      homeStarters,
      awayStarters,
      isUserHome,
      isUserAway,
      userTactics,
      events,
    });
    penaltiesHome = shootoutRes.penaltiesHome;
    penaltiesAway = shootoutRes.penaltiesAway;
    winnerId = shootoutRes.winnerId;
  }

  // Dynamic possession comparing both teams' midfield + tactical style bias
  const midDiffPoss = (homeProfile.midfield - awayProfile.midfield) * 1.15;
  const userPossBias = isUserHome
    ? (userProfile.possessionIndex - 50) * 0.45
    : isUserAway
      ? -(userProfile.possessionIndex - 50) * 0.45
      : 0;
  const venuePossBias = isNeutralVenue ? 0 : 1.5;
  const possessionHome = Math.min(
    72,
    Math.max(28, Math.round(50 + midDiffPoss + userPossBias + venuePossBias))
  );

  const userTempoMod = (userTactics.tempo - 3) * 0.9;
  const homeShotStats = computeShotsAndXg({
    attack: homeProfile.attack,
    oppDefense: awayProfile.defense,
    possession: possessionHome,
    goals: homeGoals,
    tempoMod: isUserHome ? userTempoMod : 0,
  });
  const awayShotStats = computeShotsAndXg({
    attack: awayProfile.attack,
    oppDefense: homeProfile.defense,
    possession: 100 - possessionHome,
    goals: awayGoals,
    tempoMod: isUserAway ? userTempoMod : 0,
  });

  const shotsHome = homeShotStats.shots;
  const shotsAway = awayShotStats.shots;
  const shotsOnTargetHome = homeShotStats.shotsOnTarget;
  const shotsOnTargetAway = awayShotStats.shotsOnTarget;
  const cornersHome = homeShotStats.corners;
  const cornersAway = awayShotStats.corners;
  const foulsHome = 5 + yellowsHome * 2 + Math.floor(Math.random() * 4);
  const foulsAway = 5 + yellowsAway * 2 + Math.floor(Math.random() * 4);

  const { playerRatings, motm: computedMotm } = computeMatchPlayerRatings({
    homeId,
    awayId,
    homeGoals,
    awayGoals,
    winnerId,
    events,
    homeStarters,
    awayStarters,
    deterministic: false,
  });
  const motm = computedMotm;

  const comp = options?.competition ?? 'league';
  const uniqueSuffix = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;

  const summary: MatchResultSummary = {
    id: options?.matchId
      ? `res-${options.matchId}-${uniqueSuffix}`
      : `res-${comp}-mw${matchweek}-${homeId}-${awayId}-${uniqueSuffix}`,
    matchweek,
    competition: comp,
    homeClubId: homeId,
    awayClubId: awayId,
    homeGoals,
    awayGoals,
    possessionHome,
    shotsHome,
    shotsAway,
    shotsOnTargetHome,
    shotsOnTargetAway,
    cornersHome,
    cornersAway,
    foulsHome,
    foulsAway,
    yellowsHome,
    yellowsAway,
    redsHome,
    redsAway,
    xgHome: homeShotStats.xg,
    xgAway: awayShotStats.xg,
    homeFormation: isUserHome ? userTactics.formation : (homeMgr?.preferredFormation ?? '4-3-3'),
    awayFormation: isUserAway ? userTactics.formation : (awayMgr?.preferredFormation ?? '4-3-3'),
    homeManagerName: isUserHome
      ? homeMgr
        ? `${homeMgr.name} (HLV)`
        : 'HLV Tạm quyền'
      : (homeMgr?.name ?? 'HLV CLB'),
    awayManagerName: isUserAway
      ? awayMgr
        ? `${awayMgr.name} (HLV)`
        : 'HLV Tạm quyền'
      : (awayMgr?.name ?? 'HLV CLB'),
    venue: venueLabel,
    playerRatings,
    events,
    playedAt: new Date().toISOString(),
  };

  if (motm) summary.manOfTheMatch = motm;
  if (options?.roundLabel) summary.roundLabel = options.roundLabel;
  if (penaltiesHome !== undefined) summary.penaltiesHome = penaltiesHome;
  if (penaltiesAway !== undefined) summary.penaltiesAway = penaltiesAway;
  if (winnerId !== undefined) summary.winnerId = winnerId;
  if (isUserHome) summary.participatedUserPlayerIds = homeStarters.map((s) => s.player.id);
  else if (isUserAway) summary.participatedUserPlayerIds = awayStarters.map((s) => s.player.id);

  return summary;
}

export function resimulateMatchFromMinute(params: {
  currentMatch: MatchResultSummary;
  fromMinute: number;
  userClubId: string;
  nextUserTactics: TacticSettings;
  userSquad: Player[];
  allPlayers: Player[];
  userManager?: RealManager | null;
  trainingFocus?: CareerSave['trainingFocus'];
  aiClubStrengthBoosts?: Record<string, number>;
  isKnockout?: boolean;
  isNeutralVenue?: boolean;
  subEvent?: MatchEvent;
  participatedUserPlayerIds?: string[];
}): MatchResultSummary {
  const {
    currentMatch,
    fromMinute,
    userClubId,
    nextUserTactics,
    userSquad,
    allPlayers,
    userManager,
    trainingFocus,
    aiClubStrengthBoosts,
    isKnockout = false,
    isNeutralVenue: explicitNeutral,
    subEvent,
    participatedUserPlayerIds,
  } = params;

  const homeId = currentMatch.homeClubId;
  const awayId = currentMatch.awayClubId;
  const isUserHome = homeId === userClubId;
  const isUserAway = awayId === userClubId;

  const homeClub = CLUBS.find((c) => c.id === homeId) ?? CLUBS[0];
  const awayClub = CLUBS.find((c) => c.id === awayId) ?? CLUBS[1];

  const homeRoster = isUserHome
    ? userSquad
    : allPlayers.filter((p) => p.clubId === homeId);
  const awayRoster = isUserAway
    ? userSquad
    : allPlayers.filter((p) => p.clubId === awayId);

  const defaultHomeMgr = REAL_MANAGERS.find((m) => m.id === homeClub.managerId) ?? REAL_MANAGERS[0];
  const defaultAwayMgr = REAL_MANAGERS.find((m) => m.id === awayClub.managerId) ?? REAL_MANAGERS[1];
  const userMgrResolved =
    userManager !== undefined
      ? userManager
      : isUserHome
        ? defaultHomeMgr
        : isUserAway
          ? defaultAwayMgr
          : null;
  const homeMgr = isUserHome ? userMgrResolved : defaultHomeMgr;
  const awayMgr = isUserAway ? userMgrResolved : defaultAwayMgr;

  const homeStarters = resolveMatchStarters(
    homeId,
    isUserHome ? nextUserTactics.formation : (homeMgr?.preferredFormation ?? '4-3-3'),
    homeRoster,
    isUserHome ? nextUserTactics : undefined
  );
  const awayStarters = resolveMatchStarters(
    awayId,
    isUserAway ? nextUserTactics.formation : (awayMgr?.preferredFormation ?? '4-3-3'),
    awayRoster,
    isUserAway ? nextUserTactics : undefined
  );
  const homePlayingXI = homeStarters.length > 0 ? homeStarters.map((s) => s.player) : homeRoster;
  const awayPlayingXI = awayStarters.length > 0 ? awayStarters.map((s) => s.player) : awayRoster;

  const keptEvents = currentMatch.events.filter(
    (e) => e.minute <= fromMinute && e.type !== 'fulltime' && e.type !== 'penalty'
  );
  const baseHomeGoals = keptEvents.filter((e) => e.type === 'goal' && e.teamId === homeId).length;
  const baseAwayGoals = keptEvents.filter((e) => e.type === 'goal' && e.teamId === awayId).length;
  const baseYellowsHome = keptEvents.filter((e) => e.type === 'yellow' && e.teamId === homeId).length;
  const baseYellowsAway = keptEvents.filter((e) => e.type === 'yellow' && e.teamId === awayId).length;
  const baseRedsHome = keptEvents.filter((e) => e.type === 'red' && e.teamId === homeId).length;
  const baseRedsAway = keptEvents.filter((e) => e.type === 'red' && e.teamId === awayId).length;

  const userProfile = calculateTacticalProfile(nextUserTactics, userSquad, userMgrResolved, trainingFocus);
  const userCondBonus = isUserHome
    ? computeUserConditionBonus(homeStarters, userProfile.cohesion)
    : isUserAway
      ? computeUserConditionBonus(awayStarters, userProfile.cohesion)
      : 0;

  const homeRedPenalty = baseRedsHome * 3.5;
  const awayRedPenalty = baseRedsAway * 3.5;

  const rawHomeProf = isUserHome
    ? {
        attack: userProfile.attack + userCondBonus,
        midfield: userProfile.midfield + userCondBonus * 0.85,
        defense: userProfile.defense + userCondBonus,
        overall: userProfile.overall + userCondBonus,
      }
    : computeAITeamProfile(homeId, homeRoster, homeClub.reputation, aiClubStrengthBoosts?.[homeId] ?? 0);

  const rawAwayProf = isUserAway
    ? {
        attack: userProfile.attack + userCondBonus,
        midfield: userProfile.midfield + userCondBonus * 0.85,
        defense: userProfile.defense + userCondBonus,
        overall: userProfile.overall + userCondBonus,
      }
    : computeAITeamProfile(awayId, awayRoster, awayClub.reputation, aiClubStrengthBoosts?.[awayId] ?? 0);

  const homeProfile = {
    attack: rawHomeProf.attack - homeRedPenalty,
    midfield: rawHomeProf.midfield - homeRedPenalty,
    defense: rawHomeProf.defense - homeRedPenalty,
    overall: rawHomeProf.overall - homeRedPenalty,
  };
  const awayProfile = {
    attack: rawAwayProf.attack - awayRedPenalty,
    midfield: rawAwayProf.midfield - awayRedPenalty,
    defense: rawAwayProf.defense - awayRedPenalty,
    overall: rawAwayProf.overall - awayRedPenalty,
  };

  const isNeutralVenue = Boolean(
    explicitNeutral ||
      currentMatch.competition === 'super-cup' ||
      currentMatch.venue === 'Sân vận động Trung lập' ||
      (currentMatch.roundLabel && /chung kết/i.test(currentMatch.roundLabel))
  );

  const userActive = isUserHome || isUserAway;
  const tempoPace = userActive ? 1 + (nextUserTactics.tempo - 3) * 0.05 : 1;
  const mentalityPace =
    userActive && nextUserTactics.mentality === 'Very Attacking'
      ? 1.08
      : userActive && nextUserTactics.mentality === 'Cautious'
        ? 0.9
        : 1.0;
  const matchPace = tempoPace * mentalityPace;

  const homeEdge =
    (homeProfile.attack - awayProfile.defense) * 0.55 +
    (homeProfile.midfield - awayProfile.midfield) * 0.25 +
    (homeProfile.overall - awayProfile.overall) * 0.2;
  const awayEdge =
    (awayProfile.attack - homeProfile.defense) * 0.55 +
    (awayProfile.midfield - homeProfile.midfield) * 0.25 +
    (awayProfile.overall - homeProfile.overall) * 0.2;

  const baseHomeXg = isNeutralVenue ? 1.28 : 1.38;
  const baseAwayXg = isNeutralVenue ? 1.28 : 1.18;
  const clampExponent = (val: number) => Math.max(-1.35, Math.min(1.35, val));
  const expectedHome = Math.max(
    0.25,
    baseHomeXg * matchPace * Math.exp(clampExponent(homeEdge * 0.068))
  );
  const expectedAway = Math.max(
    0.22,
    baseAwayXg * matchPace * Math.exp(clampExponent(awayEdge * 0.068))
  );

  const remFrac = Math.max(0.04, (90 - fromMinute) / 90);
  const minFloor = Math.min(89, Math.max(2, fromMinute + 1));
  const span = Math.max(1, 90 - minFloor);

  const remHomeGoals = samplePoissonGoals(
    expectedHome * remFrac,
    Math.max(0, 9 - baseHomeGoals)
  );
  const remAwayGoals = samplePoissonGoals(
    expectedAway * remFrac,
    Math.max(0, 9 - baseAwayGoals)
  );

  const newEvents: MatchEvent[] = [...keptEvents];
  if (subEvent) {
    newEvents.push(subEvent);
  } else {
    const tacticalLabelMap: Record<TacticSettings['mentality'], string> = {
      Cautious: 'Thận trọng',
      Balanced: 'Cân bằng',
      Positive: 'Tích cực',
      Attacking: 'Tấn công',
      'Very Attacking': 'Tổng lực',
    };
    newEvents.push({
      minute: fromMinute,
      type: 'sub',
      teamId: userClubId,
      playerName: userMgrResolved?.name ?? 'HLV',
      description: `Chỉ đạo từ đường biên: Chuyển sang thế trận ${tacticalLabelMap[nextUserTactics.mentality]}!`,
    });
  }

  const homePenId = isUserHome ? nextUserTactics.designatedPenaltyTakerId : undefined;
  const awayPenId = isUserAway ? nextUserTactics.designatedPenaltyTakerId : undefined;

  for (let i = 0; i < remHomeGoals; i++) {
    const min = minFloor + Math.floor(Math.random() * span);
    const scorer = pickScorerFromXI(homePlayingXI, homePenId);
    const assist = pickAssisterFromXI(homePlayingXI, scorer?.id);
    const ev: MatchEvent = {
      minute: min,
      type: 'goal',
      teamId: homeId,
      playerName: scorer?.name ?? homeClub.shortName,
      description: `VÀO! ${scorer?.name ?? 'Tiền đạo'} dứt điểm lạnh lùng cho ${homeClub.shortName}${assist ? ` (kiến tạo: ${assist.shortName})` : ''}.`,
    };
    if (scorer?.id) ev.playerId = scorer.id;
    if (assist?.id) ev.assistId = assist.id;
    if (assist?.shortName) ev.assistName = assist.shortName;
    newEvents.push(ev);
  }

  for (let i = 0; i < remAwayGoals; i++) {
    const min = minFloor + Math.floor(Math.random() * span);
    const scorer = pickScorerFromXI(awayPlayingXI, awayPenId);
    const assist = pickAssisterFromXI(awayPlayingXI, scorer?.id);
    const ev: MatchEvent = {
      minute: min,
      type: 'goal',
      teamId: awayId,
      playerName: scorer?.name ?? awayClub.shortName,
      description: `BÀN THẮNG! ${scorer?.name ?? 'Tiền đạo'} lập công cho ${awayClub.shortName}${assist ? ` (kiến tạo: ${assist.shortName})` : ''}.`,
    };
    if (scorer?.id) ev.playerId = scorer.id;
    if (assist?.id) ev.assistId = assist.id;
    if (assist?.shortName) ev.assistName = assist.shortName;
    newEvents.push(ev);
  }

  const remYellowsHome = Math.min(
    Math.max(0, 3 - baseYellowsHome),
    Math.random() < remFrac * (isUserHome && nextUserTactics.pressingIntensity >= 4 ? 1.5 : 0.9)
      ? 1
      : 0
  );
  const remYellowsAway = Math.min(
    Math.max(0, 3 - baseYellowsAway),
    Math.random() < remFrac * (isUserAway && nextUserTactics.pressingIntensity >= 4 ? 1.5 : 0.9)
      ? 1
      : 0
  );

  for (let i = 0; i < remYellowsHome; i++) {
    const min = minFloor + Math.floor(Math.random() * span);
    const pl = pickYellowCardPlayer(homePlayingXI);
    const ev: MatchEvent = {
      minute: min,
      type: 'yellow',
      teamId: homeId,
      playerName: pl?.shortName ?? homeClub.shortName,
      description: `Thẻ vàng cho ${pl?.shortName ?? 'cầu thủ'} (${homeClub.shortName}) sau pha phạm lỗi chiến thuật.`,
    };
    if (pl?.id) ev.playerId = pl.id;
    newEvents.push(ev);
  }
  for (let i = 0; i < remYellowsAway; i++) {
    const min = minFloor + Math.floor(Math.random() * span);
    const pl = pickYellowCardPlayer(awayPlayingXI);
    const ev: MatchEvent = {
      minute: min,
      type: 'yellow',
      teamId: awayId,
      playerName: pl?.shortName ?? awayClub.shortName,
      description: `Thẻ vàng cho ${pl?.shortName ?? 'cầu thủ'} (${awayClub.shortName}) sau pha phạm lỗi chiến thuật.`,
    };
    if (pl?.id) ev.playerId = pl.id;
    newEvents.push(ev);
  }

  const remChances = Math.max(1, Math.round(3 * remFrac));
  for (let k = 0; k < remChances; k++) {
    const min = minFloor + Math.floor(Math.random() * span);
    const side = Math.random() > 0.48 ? homeId : awayId;
    const roster = side === homeId ? homePlayingXI : awayPlayingXI;
    const club = side === homeId ? homeClub : awayClub;
    const pl = pickChancePlayer(roster);
    const evType = k % 2 === 0 ? 'chance' : 'save';
    const ev: MatchEvent = {
      minute: min,
      type: evType,
      teamId: side,
      playerName: pl?.shortName ?? club.shortName,
      description:
        evType === 'save'
          ? `Thủ môn bay người cứu thua xuất thần trước cú sút của ${pl?.shortName ?? club.shortName}.`
          : `Cơ hội nguy hiểm! ${pl?.shortName ?? club.shortName} dứt điểm chệch cột dọc trong gang tấc.`,
    };
    if (pl?.id) ev.playerId = pl.id;
    newEvents.push(ev);
  }

  const homeGoals = baseHomeGoals + remHomeGoals;
  const awayGoals = baseAwayGoals + remAwayGoals;
  const yellowsHome = baseYellowsHome + remYellowsHome;
  const yellowsAway = baseYellowsAway + remYellowsAway;

  // Sort 1' - 89' events first so FT and penalty shootout stay in sequence
  newEvents.sort((a, b) => a.minute - b.minute);
  newEvents.push({
    minute: 90,
    type: 'fulltime',
    teamId: homeId,
    playerName: 'FT',
    description: `Hết giờ! ${homeClub.name} ${homeGoals} - ${awayGoals} ${awayClub.name}.`,
  });

  let penaltiesHome: number | undefined;
  let penaltiesAway: number | undefined;
  let winnerId: string | undefined;

  if (homeGoals > awayGoals) {
    winnerId = homeId;
  } else if (awayGoals > homeGoals) {
    winnerId = awayId;
  } else if (isKnockout) {
    const shootoutRes = simulatePenaltyShootout({
      homeId,
      awayId,
      homeClub,
      awayClub,
      homeStarters,
      awayStarters,
      isUserHome,
      isUserAway,
      userTactics: nextUserTactics,
      events: newEvents,
    });
    penaltiesHome = shootoutRes.penaltiesHome;
    penaltiesAway = shootoutRes.penaltiesAway;
    winnerId = shootoutRes.winnerId;
  }

  const midDiffPoss = (homeProfile.midfield - awayProfile.midfield) * 1.15;
  const userPossBias = isUserHome
    ? (userProfile.possessionIndex - 50) * 0.45
    : isUserAway
      ? -(userProfile.possessionIndex - 50) * 0.45
      : 0;
  const newPossTarget = Math.min(
    72,
    Math.max(28, Math.round(50 + midDiffPoss + userPossBias + (isNeutralVenue ? 0 : 1.5)))
  );
  const possessionHome = Math.round(
    currentMatch.possessionHome * (1 - remFrac) + newPossTarget * remFrac
  );

  const userTempoMod = (nextUserTactics.tempo - 3) * 0.9;
  const homeShotStats = computeShotsAndXg({
    attack: homeProfile.attack,
    oppDefense: awayProfile.defense,
    possession: possessionHome,
    goals: homeGoals,
    tempoMod: isUserHome ? userTempoMod : 0,
  });
  const awayShotStats = computeShotsAndXg({
    attack: awayProfile.attack,
    oppDefense: homeProfile.defense,
    possession: 100 - possessionHome,
    goals: awayGoals,
    tempoMod: isUserAway ? userTempoMod : 0,
  });

  const { playerRatings, motm } = computeMatchPlayerRatings({
    homeId,
    awayId,
    homeGoals,
    awayGoals,
    winnerId,
    events: newEvents,
    homeStarters,
    awayStarters,
    deterministic: false,
  });

  // Preserve or compute ratings for subbed-off user players who played earlier in the match
  const mergedParticipatedIds = Array.from(
    new Set([
      ...(currentMatch.participatedUserPlayerIds ?? []),
      ...(participatedUserPlayerIds ?? []),
      ...(isUserHome
        ? homeStarters.map((s) => s.player.id)
        : isUserAway
          ? awayStarters.map((s) => s.player.id)
          : []),
    ])
  );

  const finalRatings = [...playerRatings];
  if (isUserHome || isUserAway) {
    const ratedSet = new Set(
      finalRatings.filter((r) => r.clubId === userClubId).map((r) => r.playerId)
    );
    const userById = new Map(userSquad.map((p) => [p.id, p]));
    const prevRatingsMap = new Map(
      (currentMatch.playerRatings ?? [])
        .filter((r) => r.clubId === userClubId)
        .map((r) => [r.playerId, r])
    );
    for (const pid of mergedParticipatedIds) {
      if (ratedSet.has(pid)) continue;
      const p = userById.get(pid);
      if (!p) continue;
      const prev = prevRatingsMap.get(pid);
      const pGoals = newEvents.filter(
        (e) => e.type === 'goal' && e.teamId === userClubId && e.playerId === pid
      ).length;
      const pAssists = newEvents.filter(
        (e) => e.type === 'goal' && e.teamId === userClubId && e.assistId === pid
      ).length;
      const pYellow = newEvents.some(
        (e) => e.type === 'yellow' && e.teamId === userClubId && e.playerId === pid
      );
      const baseRating = prev ? prev.rating : Number(Math.max(5.8, Math.min(8.5, 6.4 + pGoals * 1.0 + pAssists * 0.6)).toFixed(1));
      finalRatings.push({
        playerId: p.id,
        playerName: p.name,
        shortName: p.shortName,
        clubId: userClubId,
        position: p.position,
        rating: baseRating,
        goals: pGoals,
        assists: pAssists,
        ...(pYellow ? { yellowCard: true } : {}),
      });
    }
  }

  const updated: MatchResultSummary = {
    ...currentMatch,
    homeGoals,
    awayGoals,
    possessionHome,
    shotsHome: homeShotStats.shots,
    shotsAway: awayShotStats.shots,
    shotsOnTargetHome: homeShotStats.shotsOnTarget,
    shotsOnTargetAway: awayShotStats.shotsOnTarget,
    cornersHome: homeShotStats.corners,
    cornersAway: awayShotStats.corners,
    foulsHome: 5 + yellowsHome * 2 + Math.floor(Math.random() * 4),
    foulsAway: 5 + yellowsAway * 2 + Math.floor(Math.random() * 4),
    yellowsHome,
    yellowsAway,
    redsHome: baseRedsHome,
    redsAway: baseRedsAway,
    xgHome: homeShotStats.xg,
    xgAway: awayShotStats.xg,
    homeFormation: isUserHome ? nextUserTactics.formation : currentMatch.homeFormation,
    awayFormation: isUserAway ? nextUserTactics.formation : currentMatch.awayFormation,
    playerRatings: finalRatings,
    events: newEvents,
    playedAt: new Date().toISOString(),
  };

  if (mergedParticipatedIds.length > 0 && (isUserHome || isUserAway)) {
    updated.participatedUserPlayerIds = mergedParticipatedIds;
  }

  if (motm) updated.manOfTheMatch = motm;
  if (penaltiesHome !== undefined) updated.penaltiesHome = penaltiesHome;
  else delete updated.penaltiesHome;
  if (penaltiesAway !== undefined) updated.penaltiesAway = penaltiesAway;
  else delete updated.penaltiesAway;
  if (winnerId !== undefined) updated.winnerId = winnerId;
  else delete updated.winnerId;

  return updated;
}

export function toCompactMatchReport(
  summary: MatchResultSummary,
  keepAllEvents = true
): CompactMatchReport {
  const filteredEvents = keepAllEvents
    ? summary.events
    : summary.events.filter(
        (e) => e.type === 'goal' || e.type === 'yellow' || e.type === 'red' || e.type === 'penalty'
      );
  const report: CompactMatchReport = {
    possessionHome: summary.possessionHome,
    shotsHome: summary.shotsHome,
    shotsAway: summary.shotsAway,
    xgHome: summary.xgHome,
    xgAway: summary.xgAway,
    events: filteredEvents,
    playedAt: summary.playedAt,
  };
  if (summary.shotsOnTargetHome !== undefined) report.shotsOnTargetHome = summary.shotsOnTargetHome;
  if (summary.shotsOnTargetAway !== undefined) report.shotsOnTargetAway = summary.shotsOnTargetAway;
  if (summary.cornersHome !== undefined) report.cornersHome = summary.cornersHome;
  if (summary.cornersAway !== undefined) report.cornersAway = summary.cornersAway;
  if (summary.foulsHome !== undefined) report.foulsHome = summary.foulsHome;
  if (summary.foulsAway !== undefined) report.foulsAway = summary.foulsAway;
  if (summary.yellowsHome !== undefined) report.yellowsHome = summary.yellowsHome;
  if (summary.yellowsAway !== undefined) report.yellowsAway = summary.yellowsAway;
  if (summary.redsHome !== undefined) report.redsHome = summary.redsHome;
  if (summary.redsAway !== undefined) report.redsAway = summary.redsAway;
  if (summary.homeFormation) report.homeFormation = summary.homeFormation;
  if (summary.awayFormation) report.awayFormation = summary.awayFormation;
  if (summary.homeManagerName) report.homeManagerName = summary.homeManagerName;
  if (summary.awayManagerName) report.awayManagerName = summary.awayManagerName;
  if (summary.venue) report.venue = summary.venue;
  if (summary.manOfTheMatch) report.manOfTheMatch = summary.manOfTheMatch;
  if (summary.playerRatings && summary.playerRatings.length > 0) {
    report.playerRatings = summary.playerRatings;
  }
  return report;
}

export function ensureMatchResultRatings(
  summary: MatchResultSummary,
  userContext?: { clubId: string; tactics: TacticSettings; squad: Player[] }
): MatchResultSummary {
  if (summary.playerRatings && summary.playerRatings.length > 0) {
    return summary;
  }
  const hClub = CLUBS.find((c) => c.id === summary.homeClubId) ?? CLUBS[0];
  const aClub = CLUBS.find((c) => c.id === summary.awayClubId) ?? CLUBS[1];
  const hMgr = REAL_MANAGERS.find((m) => m.id === hClub.managerId) ?? REAL_MANAGERS[0];
  const aMgr = REAL_MANAGERS.find((m) => m.id === aClub.managerId) ?? REAL_MANAGERS[1];

  const isUserHome = userContext?.clubId === summary.homeClubId;
  const isUserAway = userContext?.clubId === summary.awayClubId;
  const hRoster = isUserHome
    ? userContext!.squad
    : INITIAL_PLAYERS.filter((p) => p.clubId === summary.homeClubId);
  const aRoster = isUserAway
    ? userContext!.squad
    : INITIAL_PLAYERS.filter((p) => p.clubId === summary.awayClubId);
  const hStarters = resolveMatchStarters(
    summary.homeClubId,
    (summary.homeFormation as FormationId) || hMgr.preferredFormation,
    hRoster,
    isUserHome ? userContext!.tactics : undefined
  );
  const aStarters = resolveMatchStarters(
    summary.awayClubId,
    (summary.awayFormation as FormationId) || aMgr.preferredFormation,
    aRoster,
    isUserAway ? userContext!.tactics : undefined
  );
  const { playerRatings, motm } = computeMatchPlayerRatings({
    homeId: summary.homeClubId,
    awayId: summary.awayClubId,
    homeGoals: summary.homeGoals,
    awayGoals: summary.awayGoals,
    winnerId: summary.winnerId,
    events: summary.events,
    homeStarters: hStarters,
    awayStarters: aStarters,
    deterministic: true,
  });
  return {
    ...summary,
    playerRatings,
    manOfTheMatch: summary.manOfTheMatch ?? motm,
  };
}

export function buildMatchSummaryFromStored(
  match: {
    id: string;
    homeClubId: string;
    awayClubId: string;
    homeGoals?: number;
    awayGoals?: number;
    penaltiesHome?: number;
    penaltiesAway?: number;
    winnerId?: string;
    report?: CompactMatchReport;
  },
  competition: CompetitionId,
  roundLabel: string,
  matchweek: number,
  recentResults: MatchResultSummary[],
  userContext?: { clubId: string; tactics: TacticSettings; squad: Player[] }
): MatchResultSummary {
  const hClub = CLUBS.find((c) => c.id === match.homeClubId) ?? CLUBS[0];
  const aClub = CLUBS.find((c) => c.id === match.awayClubId) ?? CLUBS[1];
  const hMgr = REAL_MANAGERS.find((m) => m.id === hClub.managerId) ?? REAL_MANAGERS[0];
  const aMgr = REAL_MANAGERS.find((m) => m.id === aClub.managerId) ?? REAL_MANAGERS[1];

  const ensureRatings = (summary: MatchResultSummary): MatchResultSummary =>
    ensureMatchResultRatings(summary, userContext);

  const fromRecent = recentResults.find(
    (r) =>
      r.homeClubId === match.homeClubId &&
      r.awayClubId === match.awayClubId &&
      (r.competition ?? 'league') === competition &&
      (competition !== 'league' || r.matchweek === matchweek) &&
      r.homeGoals === (match.homeGoals ?? 0) &&
      r.awayGoals === (match.awayGoals ?? 0)
  );
  if (fromRecent) return ensureRatings(fromRecent);

  const hg = match.homeGoals ?? 0;
  const ag = match.awayGoals ?? 0;

  if (match.report) {
    return ensureRatings({
      id: match.id,
      matchweek,
      competition,
      roundLabel,
      homeClubId: match.homeClubId,
      awayClubId: match.awayClubId,
      homeGoals: hg,
      awayGoals: ag,
      penaltiesHome: match.penaltiesHome,
      penaltiesAway: match.penaltiesAway,
      winnerId: match.winnerId,
      possessionHome: match.report.possessionHome,
      shotsHome: match.report.shotsHome,
      shotsAway: match.report.shotsAway,
      shotsOnTargetHome: match.report.shotsOnTargetHome,
      shotsOnTargetAway: match.report.shotsOnTargetAway,
      cornersHome: match.report.cornersHome,
      cornersAway: match.report.cornersAway,
      foulsHome: match.report.foulsHome,
      foulsAway: match.report.foulsAway,
      yellowsHome: match.report.yellowsHome,
      yellowsAway: match.report.yellowsAway,
      xgHome: match.report.xgHome,
      xgAway: match.report.xgAway,
      homeFormation: match.report.homeFormation ?? hMgr.preferredFormation,
      awayFormation: match.report.awayFormation ?? aMgr.preferredFormation,
      homeManagerName: match.report.homeManagerName ?? hMgr.name,
      awayManagerName: match.report.awayManagerName ?? aMgr.name,
      venue: match.report.venue ?? hClub.stadium,
      manOfTheMatch: match.report.manOfTheMatch,
      playerRatings: match.report.playerRatings,
      events: match.report.events,
      playedAt: match.report.playedAt ?? new Date().toISOString(),
    });
  }

  // Fallback deterministic reconstruction for older saved matches without stored report
  const shotsH = hg * 3 + 6;
  const shotsA = ag * 3 + 5;
  const fallbackEvents: MatchEvent[] = [
    {
      minute: 1,
      type: 'kickoff',
      teamId: hClub.id,
      playerName: hClub.shortName,
      description: `Khai cuộc tại ${hClub.stadium}.`,
    },
    {
      minute: 90,
      type: 'fulltime',
      teamId: hClub.id,
      playerName: 'FT',
      description: `Hết giờ! ${hClub.name} ${hg} - ${ag} ${aClub.name}.`,
    },
  ];
  return ensureRatings({
    id: match.id,
    matchweek,
    competition,
    roundLabel,
    homeClubId: match.homeClubId,
    awayClubId: match.awayClubId,
    homeGoals: hg,
    awayGoals: ag,
    penaltiesHome: match.penaltiesHome,
    penaltiesAway: match.penaltiesAway,
    winnerId: match.winnerId,
    possessionHome: 50,
    shotsHome: shotsH,
    shotsAway: shotsA,
    shotsOnTargetHome: Math.max(hg, Math.round(shotsH * 0.4)),
    shotsOnTargetAway: Math.max(ag, Math.round(shotsA * 0.4)),
    cornersHome: 4,
    cornersAway: 4,
    foulsHome: 9,
    foulsAway: 10,
    yellowsHome: 1,
    yellowsAway: 1,
    xgHome: Number((hg * 0.72 + shotsH * 0.08).toFixed(2)),
    xgAway: Number((ag * 0.72 + shotsA * 0.08).toFixed(2)),
    homeFormation: hMgr.preferredFormation,
    awayFormation: aMgr.preferredFormation,
    homeManagerName: hMgr.name,
    awayManagerName: aMgr.name,
    venue: hClub.stadium,
    events: fallbackEvents,
    playedAt: new Date().toISOString(),
  });
}

function updateCupMatchRecord(m: CupMatch, res: MatchResultSummary): CupMatch {
  const updated: CupMatch = {
    ...m,
    played: true,
    homeGoals: res.homeGoals,
    awayGoals: res.awayGoals,
    report: toCompactMatchReport(res, true),
  };
  if (res.penaltiesHome !== undefined) updated.penaltiesHome = res.penaltiesHome;
  if (res.penaltiesAway !== undefined) updated.penaltiesAway = res.penaltiesAway;
  if (res.winnerId !== undefined) updated.winnerId = res.winnerId;
  return updated;
}

export function applyCupMatchResults(
  competitions: CompetitionsState,
  competition: 'champions-cup' | 'national-cup' | 'super-cup',
  resultsByMatchId: Map<string, MatchResultSummary>
): CompetitionsState {
  if (competition === 'champions-cup') {
    const cc = competitions.championsCup;
    let nextGroups = cc.groups.map((g) => ({
      ...g,
      standings: [...g.standings],
    }));

    const nextMatches = cc.matches.map((m) => {
      const res = resultsByMatchId.get(m.id);
      if (!res || m.played) return m;
      if (m.stage === 'group' && m.groupName) {
        nextGroups = nextGroups.map((g) =>
          g.name === m.groupName
            ? {
                ...g,
                standings: applyMatchToStandings(
                  g.standings,
                  m.homeClubId,
                  m.awayClubId,
                  res.homeGoals,
                  res.awayGoals
                ),
              }
            : g
        );
      }
      return updateCupMatchRecord(m, res);
    });

    let nextStage = cc.stage;
    let nextRound = cc.currentRound;
    let championClubId = cc.championClubId;
    const appended: CupMatch[] = [];

    if (cc.stage === 'group') {
      const currentRoundMatches = nextMatches.filter(
        (m) => m.stage === 'group' && m.round === cc.currentRound
      );
      if (currentRoundMatches.every((m) => m.played)) {
        if (cc.currentRound < 3) {
          nextRound = cc.currentRound + 1;
        } else {
          // Group stage finished -> generate Quarter-Finals from top 2 of each group
          const sortedGroups = nextGroups.map((g) => sortStandings(g.standings));
          const [gA, gB, gC, gD] = sortedGroups;
          const qfPairs: [string, string][] = [
            [gA[0].clubId, gB[1].clubId],
            [gC[0].clubId, gD[1].clubId],
            [gB[0].clubId, gA[1].clubId],
            [gD[0].clubId, gC[1].clubId],
          ];
          qfPairs.forEach(([home, away], idx) => {
            appended.push({
              id: `cc-qf-${idx + 1}-${home}-${away}`,
              stage: 'qf',
              round: 4,
              homeClubId: home,
              awayClubId: away,
              played: false,
            });
          });
          nextStage = 'qf';
          nextRound = 4;
        }
      }
    } else if (cc.stage === 'qf') {
      const qfMatches = nextMatches.filter((m) => m.stage === 'qf');
      if (qfMatches.length === 4 && qfMatches.every((m) => m.played)) {
        const w = qfMatches.map((m) => m.winnerId ?? m.homeClubId);
        appended.push(
          {
            id: `cc-sf-1-${w[0]}-${w[1]}`,
            stage: 'sf',
            round: 5,
            homeClubId: w[0],
            awayClubId: w[1],
            played: false,
          },
          {
            id: `cc-sf-2-${w[2]}-${w[3]}`,
            stage: 'sf',
            round: 5,
            homeClubId: w[2],
            awayClubId: w[3],
            played: false,
          }
        );
        nextStage = 'sf';
        nextRound = 5;
      }
    } else if (cc.stage === 'sf') {
      const sfMatches = nextMatches.filter((m) => m.stage === 'sf');
      if (sfMatches.length === 2 && sfMatches.every((m) => m.played)) {
        const w0 = sfMatches[0].winnerId ?? sfMatches[0].homeClubId;
        const w1 = sfMatches[1].winnerId ?? sfMatches[1].homeClubId;
        appended.push({
          id: `cc-final-${w0}-${w1}`,
          stage: 'final',
          round: 6,
          homeClubId: w0,
          awayClubId: w1,
          played: false,
        });
        nextStage = 'final';
        nextRound = 6;
      }
    } else if (cc.stage === 'final') {
      const finalMatch = nextMatches.find((m) => m.stage === 'final');
      if (finalMatch?.played) {
        nextStage = 'completed';
        championClubId = finalMatch.winnerId ?? finalMatch.homeClubId;
      }
    }

    const updatedCc: ChampionsCupState = {
      stage: nextStage,
      currentRound: nextRound,
      groups: nextGroups,
      matches: [...nextMatches, ...appended],
    };
    if (championClubId) updatedCc.championClubId = championClubId;

    return {
      ...competitions,
      championsCup: updatedCc,
    };
  }

  if (competition === 'national-cup') {
    const nc = competitions.nationalCup;
    const nextMatches = nc.matches.map((m) => {
      const res = resultsByMatchId.get(m.id);
      return res && !m.played ? updateCupMatchRecord(m, res) : m;
    });

    let nextStage = nc.stage;
    let championClubId = nc.championClubId;
    const appended: CupMatch[] = [];

    if (nc.stage === 'r16') {
      const r16 = nextMatches.filter((m) => m.stage === 'r16');
      if (r16.every((m) => m.played)) {
        for (let i = 0; i < r16.length; i += 2) {
          const w1 = r16[i].winnerId ?? r16[i].homeClubId;
          const w2 = r16[i + 1].winnerId ?? r16[i + 1].homeClubId;
          appended.push({
            id: `nc-qf-${i / 2 + 1}-${w1}-${w2}`,
            stage: 'qf',
            round: 2,
            homeClubId: w1,
            awayClubId: w2,
            played: false,
          });
        }
        nextStage = 'qf';
      }
    } else if (nc.stage === 'qf') {
      const qf = nextMatches.filter((m) => m.stage === 'qf');
      if (qf.every((m) => m.played)) {
        for (let i = 0; i < qf.length; i += 2) {
          const w1 = qf[i].winnerId ?? qf[i].homeClubId;
          const w2 = qf[i + 1].winnerId ?? qf[i + 1].homeClubId;
          appended.push({
            id: `nc-sf-${i / 2 + 1}-${w1}-${w2}`,
            stage: 'sf',
            round: 3,
            homeClubId: w1,
            awayClubId: w2,
            played: false,
          });
        }
        nextStage = 'sf';
      }
    } else if (nc.stage === 'sf') {
      const sf = nextMatches.filter((m) => m.stage === 'sf');
      if (sf.every((m) => m.played)) {
        const w1 = sf[0].winnerId ?? sf[0].homeClubId;
        const w2 = sf[1].winnerId ?? sf[1].homeClubId;
        appended.push({
          id: `nc-final-${w1}-${w2}`,
          stage: 'final',
          round: 4,
          homeClubId: w1,
          awayClubId: w2,
          played: false,
        });
        nextStage = 'final';
      }
    } else if (nc.stage === 'final') {
      const fin = nextMatches.find((m) => m.stage === 'final');
      if (fin?.played) {
        nextStage = 'completed';
        championClubId = fin.winnerId ?? fin.homeClubId;
      }
    }

    const updatedNc: NationalCupState = {
      stage: nextStage,
      matches: [...nextMatches, ...appended],
    };
    if (championClubId) updatedNc.championClubId = championClubId;

    return {
      ...competitions,
      nationalCup: updatedNc,
    };
  }

  // Super Cup
  const sc = competitions.superCup;
  const res = resultsByMatchId.get(sc.match.id);
  if (!res || sc.match.played) return competitions;
  const updatedMatch = updateCupMatchRecord(sc.match, res);
  return {
    ...competitions,
    superCup: {
      match: updatedMatch,
      championClubId: updatedMatch.winnerId ?? updatedMatch.homeClubId,
    },
  };
}

export interface SeasonEndRewardBundle {
  season: string;
  alreadyClaimed: boolean;
  leagueRank: number;
  championClubId: string;
  isLeagueChampion: boolean;
  basePrizeM: number;
  evaluatedObjectives: BoardObjective[];
  completedObjectivesCount: number;
  objBonusM: number;
  objShards: number;
  objConfidenceDelta: number;
  teamOfTheSeason: TeamOfTheSeasonPlayer[];
  userTotsPlayers: TeamOfTheSeasonPlayer[];
  totsBonusM: number;
  totsShards: number;
  totalPrizeM: number;
  baseSeasonShards: number;
  totalShards: number;
  packs: {
    legend_pack: number;
    icon_pack: number;
    elite_pack: number;
    trophy_gift_box: number;
  };
}

export function computeSeasonEndRewardBundle(career: CareerSave): SeasonEndRewardBundle {
  const sortedPrev = sortStandings(career.standings);
  const leagueRank = Math.max(1, sortedPrev.findIndex((r) => r.clubId === career.clubId) + 1);
  const championClubId = sortedPrev[0]?.clubId ?? career.clubId;
  const isLeagueChampion = championClubId === career.clubId;

  const teamOfTheSeason = resolveLeagueTeamOfTheSeason(career);
  const userTotsPlayers = teamOfTheSeason.filter((t) => t.isUserPlayer);
  const totsBonusM = userTotsPlayers.length * 2;
  const totsShards = userTotsPlayers.length * 10;

  const evaluatedObjectives = evaluateBoardObjectives(career, true);
  const completedObjs = evaluatedObjectives.filter((o) => o.status === 'completed');
  const objBonusM = completedObjs.reduce((s, o) => s + o.rewardBudgetM, 0);
  const objShards = completedObjs.reduce((s, o) => s + o.rewardShards, 0);
  const objConfidenceDelta =
    completedObjs.length >= 2 ? 8 : completedObjs.length === 1 ? 2 : -6;

  const basePrizeM =
    leagueRank === 1 ? 55 : leagueRank <= 4 ? 35 : leagueRank <= 10 ? 25 : 18;
  const totalPrizeM = basePrizeM + objBonusM + totsBonusM;
  const baseSeasonShards = 30;
  const totalShards = baseSeasonShards + objShards + totsShards;

  return {
    season: career.season,
    alreadyClaimed: career.claimedSeasonRewardSeason === career.season,
    leagueRank,
    championClubId,
    isLeagueChampion,
    basePrizeM,
    evaluatedObjectives,
    completedObjectivesCount: completedObjs.length,
    objBonusM,
    objShards,
    objConfidenceDelta,
    teamOfTheSeason,
    userTotsPlayers,
    totsBonusM,
    totsShards,
    totalPrizeM,
    baseSeasonShards,
    totalShards,
    packs: {
      legend_pack: 1,
      icon_pack: isLeagueChampion ? 1 : 0,
      elite_pack: 2,
      trophy_gift_box: 1,
    },
  };
}

export function resolveLeagueIndividualSpotlights(career: CareerSave): {
  topAssister: (CompetitionPlayerStat & { avgRating: number }) | null;
  bestGoalkeeper: (CompetitionPlayerStat & { avgRating: number; mvpScore: number }) | null;
  clubMvp: (CompetitionPlayerStat & { avgRating: number; mvpScore: number }) | null;
  clubTopScorer: (CompetitionPlayerStat & { avgRating: number }) | null;
} {
  const stats = career.competitions?.leaderboards?.league ?? [];
  const activePool = stats.filter((s) => (s.matches ?? 0) > 0 || s.goals > 0 || s.assists > 0);
  const maxMatches = activePool.reduce((mx, s) => Math.max(mx, s.matches ?? 0), 0);

  const enriched = activePool.map((s) => {
    const m = Math.max(1, s.matches ?? 1);
    const avgRating =
      typeof s.ratingSum === 'number' && (s.matches ?? 0) > 0
        ? Number((s.ratingSum / m).toFixed(2))
        : Number(Math.min(9.5, 6.5 + (s.goals * 0.25 + s.assists * 0.18) / m).toFixed(2));
    return {
      ...s,
      avgRating,
      mvpScore: computeCompetitionMvpScore(s, maxMatches),
    };
  });

  const topAssister =
    [...enriched]
      .filter((s) => s.assists > 0)
      .sort((a, b) => {
        if (b.assists !== a.assists) return b.assists - a.assists;
        if (b.goals !== a.goals) return b.goals - a.goals;
        return b.avgRating - a.avgRating;
      })[0] ?? null;

  const bestGoalkeeper =
    [...enriched]
      .filter((s) => s.position === 'GK')
      .sort((a, b) => {
        if (b.mvpScore !== a.mvpScore) return b.mvpScore - a.mvpScore;
        return b.avgRating - a.avgRating;
      })[0] ?? null;

  const userRows = enriched.filter((s) => s.clubId === career.clubId);
  const clubMvp =
    [...userRows].sort((a, b) => {
      if (b.mvpScore !== a.mvpScore) return b.mvpScore - a.mvpScore;
      return b.avgRating - a.avgRating;
    })[0] ?? null;

  const clubTopScorer =
    [...userRows]
      .filter((s) => s.goals > 0)
      .sort((a, b) => {
        if (b.goals !== a.goals) return b.goals - a.goals;
        if (b.assists !== a.assists) return b.assists - a.assists;
        return b.avgRating - a.avgRating;
      })[0] ?? null;

  return {
    topAssister,
    bestGoalkeeper,
    clubMvp,
    clubTopScorer,
  };
}

export function claimSeasonEndRewards(career: CareerSave): {
  nextCareer: CareerSave;
  alreadyClaimed: boolean;
  bundle: SeasonEndRewardBundle;
  creditedBudgetM: number;
  creditedShards: number;
  newTrophiesCount: number;
  newlyAwarded: CompetitionAwardWinner[];
} {
  let hydrated = ensureCareerCompetitions(career);
  const newlyAwarded: CompetitionAwardWinner[] = [];
  let awardTrophiesAdded = 0;

  for (const comp of ['league', 'champions-cup', 'national-cup', 'super-cup'] as const) {
    const settled = finalizeFinishedCompetitionAwards(hydrated, comp);
    hydrated = settled.nextCareer;
    newlyAwarded.push(...settled.newlyAwarded);
    awardTrophiesAdded += settled.newTrophiesCount;
  }

  const bundle = computeSeasonEndRewardBundle(hydrated);
  if (hydrated.claimedSeasonRewardSeason === hydrated.season) {
    return {
      nextCareer: hydrated,
      alreadyClaimed: true,
      bundle,
      creditedBudgetM: 0,
      creditedShards: 0,
      newTrophiesCount: awardTrophiesAdded,
      newlyAwarded,
    };
  }

  const existingCabinet = [...(hydrated.trophyCabinet ?? [])];
  let newTrophiesCount = awardTrophiesAdded;

  if (bundle.isLeagueChampion) {
    const id = `trophy-league-${hydrated.season.replace('/', '-')}`;
    if (!existingCabinet.some((t) => t.id === id)) {
      existingCabinet.unshift({
        id,
        title: `Vô địch Super League ${hydrated.season}`,
        competition: 'league',
        season: hydrated.season,
        clubId: hydrated.clubId,
        awardedAt: new Date().toISOString(),
        awardType: 'team',
      });
      newTrophiesCount++;
    }
  }

  const prevInv = normalizeInventory(hydrated.inventory);
  const nextInventory = normalizeInventory({
    ...prevInv,
    packs: {
      ...prevInv.packs,
      legend_pack: prevInv.packs.legend_pack + bundle.packs.legend_pack,
      icon_pack: (prevInv.packs.icon_pack ?? 0) + bundle.packs.icon_pack,
      elite_pack: prevInv.packs.elite_pack + bundle.packs.elite_pack,
      trophy_gift_box: prevInv.packs.trophy_gift_box + bundle.packs.trophy_gift_box,
    },
    universalShards: prevInv.universalShards + bundle.totalShards,
  });

  const nextLedger =
    bundle.totalPrizeM > 0
      ? appendLedgerEntries(hydrated.financialLedger, [
          createLedgerEntry({
            season: hydrated.season,
            matchweek: hydrated.matchweek,
            type: 'income',
            category: 'season_reward',
            title: `Thưởng Tổng kết Mùa giải ${hydrated.season} (Hạng #${bundle.leagueRank})`,
            detail: `Thứ hạng €${bundle.basePrizeM}M · Mục tiêu BLĐ €${bundle.objBonusM}M · ĐHTB €${bundle.totsBonusM}M`,
            amountM: bundle.totalPrizeM,
          }),
        ])
      : hydrated.financialLedger;

  const nextCareer: CareerSave = {
    ...hydrated,
    transferBudget: Number((hydrated.transferBudget + bundle.totalPrizeM).toFixed(1)),
    boardConfidence: Math.min(
      100,
      Math.max(45, hydrated.boardConfidence + (bundle.leagueRank <= 4 ? 6 : 1) + bundle.objConfidenceDelta)
    ),
    fanSupport: Math.min(100, Math.max(72, hydrated.fanSupport + (bundle.leagueRank <= 4 ? 6 : 2))),
    trophyCabinet: existingCabinet.slice(0, 120),
    boardObjectives: bundle.evaluatedObjectives,
    claimedSeasonRewardSeason: hydrated.season,
    ...(nextLedger ? { financialLedger: nextLedger } : {}),
    inventory: nextInventory,
  };

  return {
    nextCareer,
    alreadyClaimed: false,
    bundle,
    creditedBudgetM: bundle.totalPrizeM,
    creditedShards: bundle.totalShards,
    newTrophiesCount,
    newlyAwarded,
  };
}

export function computeSeasonPayrollBreakdown(career: CareerSave): SeasonPayrollBreakdown {
  const club = CLUBS.find((c) => c.id === career.clubId) ?? CLUBS[0];
  const squadWeeklyWageK = career.squad.reduce((sum, p) => sum + (p.wageK || 0), 0);
  // Quy đổi quyết toán lương cầu thủ còn lại chưa tất toán trong mùa (10 kỳ lương thi đấu chính thức)
  const squadSeasonWageM = Number(
    career.squad.reduce((sum, p) => sum + getPlayerRemainingSeasonWageM(p, career), 0).toFixed(1)
  );

  const activeMgr = getActiveCareerManager(career);
  const managerName = activeMgr ? activeMgr.name : 'HLV Tạm quyền';
  const managerAnnualSalaryM = getActiveManagerAnnualSalaryM(career, activeMgr);

  const scale = Math.max(0, club.reputation - 70);
  const medicalM = Number((0.9 + scale * 0.06).toFixed(1));
  const scoutingAcademyM = Number((1.1 + scale * 0.07).toFixed(1));
  const stadiumOpsM = Number((0.9 + scale * 0.06).toFixed(1));
  const travelAdminM = Number((0.7 + scale * 0.04).toFixed(1));
  const logisticsAndStaffM = Number(
    (medicalM + scoutingAcademyM + stadiumOpsM + travelAdminM).toFixed(1)
  );

  const totalPayrollM = Number(
    (squadSeasonWageM + managerAnnualSalaryM + logisticsAndStaffM).toFixed(1)
  );

  return {
    season: career.season,
    squadWeeklyWageK,
    squadSeasonWageM,
    squadCount: career.squad.length,
    managerName,
    managerAnnualSalaryM,
    logisticsAndStaffM,
    logisticsDetails: {
      medicalM,
      scoutingAcademyM,
      stadiumOpsM,
      travelAdminM,
    },
    totalPayrollM,
  };
}

export function settleSeasonPayroll(career: CareerSave): {
  nextCareer: CareerSave;
  alreadySettled: boolean;
  insufficientBudget: boolean;
  shortfallM: number;
  breakdown: SeasonPayrollBreakdown;
  deductedBudgetM: number;
} {
  const hydrated = ensureCareerCompetitions(career);
  const breakdown = computeSeasonPayrollBreakdown(hydrated);

  if (hydrated.settledPayrollSeason === hydrated.season) {
    return {
      nextCareer: hydrated,
      alreadySettled: true,
      insufficientBudget: false,
      shortfallM: 0,
      breakdown,
      deductedBudgetM: 0,
    };
  }

  const shortfallM = Number(
    Math.max(0, breakdown.totalPayrollM - hydrated.transferBudget).toFixed(1)
  );
  if (hydrated.transferBudget < breakdown.totalPayrollM) {
    return {
      nextCareer: hydrated,
      alreadySettled: false,
      insufficientBudget: true,
      shortfallM,
      breakdown,
      deductedBudgetM: 0,
    };
  }

  const deductedBudgetM = Number(breakdown.totalPayrollM.toFixed(1));
  const nextBudget = Number((hydrated.transferBudget - deductedBudgetM).toFixed(1));
  const nowIso = new Date().toISOString();

  const settledRecord: SeasonPayrollBreakdown = {
    ...breakdown,
    settledAt: nowIso,
  };

  const nextPayrollHistory = [
    settledRecord,
    ...(hydrated.payrollHistory ?? []).filter((r) => r.season !== hydrated.season),
  ].slice(0, 50);

  const nextLedger = appendLedgerEntries(hydrated.financialLedger, [
    createLedgerEntry({
      season: hydrated.season,
      matchweek: hydrated.matchweek,
      type: 'expense',
      category: 'payroll_settlement',
      title: `Quyết toán Quỹ lương Toàn CLB mùa ${hydrated.season}`,
      detail: `Cầu thủ (${breakdown.squadCount} người) €${breakdown.squadSeasonWageM}M · HLV (${breakdown.managerName}) €${breakdown.managerAnnualSalaryM}M · Hậu cần €${breakdown.logisticsAndStaffM}M`,
      amountM: deductedBudgetM,
      date: nowIso,
    }),
  ]);

  const nextCareer: CareerSave = {
    ...hydrated,
    transferBudget: nextBudget,
    boardConfidence: Math.min(100, hydrated.boardConfidence + 2),
    settledPayrollSeason: hydrated.season,
    payrollHistory: nextPayrollHistory,
    financialLedger: nextLedger,
  };

  return {
    nextCareer,
    alreadySettled: false,
    insufficientBudget: false,
    shortfallM: 0,
    breakdown: settledRecord,
    deductedBudgetM,
  };
}

export function createNextSeasonCareer(career: CareerSave): {
  nextCareer: CareerSave;
  summary: SeasonRecord;
  prizeM: number;
  totalSeasonPrizeM: number;
  alreadyClaimed: boolean;
  newTrophiesCount: number;
  newlyAwarded: CompetitionAwardWinner[];
  departedFreeAgents: Player[];
  emergencyPromotedCount: number;
  expiredManagerName?: string;
  retiredPlayers: {
    playerId: string;
    playerName: string;
    position: string;
    age: number;
    rating: number;
    appearances: number;
    goals: number;
    legacyShards: number;
  }[];
  returnedLoanCount: number;
  boardUltimatumTriggered: boolean;
} {
  let hydrated = ensureCareerCompetitions(career);
  const newlyAwarded: CompetitionAwardWinner[] = [];
  let awardTrophiesAdded = 0;

  for (const comp of ['league', 'champions-cup', 'national-cup', 'super-cup'] as const) {
    const settled = finalizeFinishedCompetitionAwards(hydrated, comp);
    hydrated = settled.nextCareer;
    newlyAwarded.push(...settled.newlyAwarded);
    awardTrophiesAdded += settled.newTrophiesCount;
  }

  const sortedPrev = sortStandings(hydrated.standings);
  const myRow = sortedPrev.find((r) => r.clubId === hydrated.clubId);
  const bundle = computeSeasonEndRewardBundle(hydrated);
  const alreadyClaimed = hydrated.claimedSeasonRewardSeason === hydrated.season;
  const leagueRank = bundle.leagueRank;
  const championClubId = bundle.championClubId;
  const leagueAwards = resolveCompetitionAwards(hydrated, 'league');
  const topLeagueScorer = leagueAwards.topScorer;
  const leagueMvp = leagueAwards.mvp;
  const topSquadScorer = [...hydrated.squad].sort((a, b) => b.goals - a.goals)[0];
  const teamOfTheSeason = bundle.teamOfTheSeason;
  const userTotsPlayers = bundle.userTotsPlayers;
  const evaluatedObjectives = bundle.evaluatedObjectives;

  const totalSeasonPrizeM = bundle.totalPrizeM;
  const prizeM = alreadyClaimed ? 0 : totalSeasonPrizeM;

  const existingCabinet = [...(hydrated.trophyCabinet ?? [])];
  const trophiesWonTitles: string[] = [];
  let newTrophiesCount = awardTrophiesAdded;

  if (championClubId === hydrated.clubId) {
    const title = `Vô địch Super League ${hydrated.season}`;
    trophiesWonTitles.push(title);
    const id = `trophy-league-${hydrated.season.replace('/', '-')}`;
    if (!existingCabinet.some((t) => t.id === id)) {
      existingCabinet.unshift({
        id,
        title,
        competition: 'league',
        season: hydrated.season,
        clubId: hydrated.clubId,
        awardedAt: new Date().toISOString(),
        awardType: 'team',
      });
      newTrophiesCount++;
    }
  }

  const ccWinner = hydrated.competitions?.championsCup.championClubId;
  if (ccWinner === hydrated.clubId) {
    trophiesWonTitles.push(`Vô địch Champions Cup ${hydrated.season}`);
  }
  const ncWinner = hydrated.competitions?.nationalCup.championClubId;
  if (ncWinner === hydrated.clubId) {
    trophiesWonTitles.push(`Vô địch Cúp Quốc Gia ${hydrated.season}`);
  }
  const scWinner = hydrated.competitions?.superCup.championClubId;
  if (scWinner === hydrated.clubId) {
    trophiesWonTitles.push(`Siêu Cúp ${hydrated.season}`);
  }
  for (const aw of newlyAwarded) {
    if (aw.isUserPlayer) {
      trophiesWonTitles.push(`${aw.awardTitle} ${aw.competitionTitle}: ${aw.playerName}`);
    }
  }

  const summary: SeasonRecord = {
    season: hydrated.season,
    clubId: hydrated.clubId,
    leagueRank,
    points: myRow?.points ?? 0,
    championClubId,
    topScorerName: topLeagueScorer?.playerName ?? topSquadScorer?.name ?? 'Chưa có',
    topScorerGoals: topLeagueScorer?.goals ?? topSquadScorer?.goals ?? 0,
    trophiesWon: trophiesWonTitles,
    teamOfTheSeason,
    completedObjectivesCount: bundle.completedObjectivesCount,
    totalObjectivesCount: evaluatedObjectives.length,
  };
  if (topLeagueScorer?.clubId) summary.topScorerClubId = topLeagueScorer.clubId;
  if (leagueMvp) {
    summary.mvpPlayerName = leagueMvp.playerName;
    summary.mvpPlayerClubId = leagueMvp.clubId;
    summary.mvpAvgRating = leagueMvp.avgRating;
  }
  if (ccWinner) summary.championsCupWinnerId = ccWinner;
  if (ncWinner) summary.nationalCupWinnerId = ncWinner;

  const nextSeason = getNextSeasonString(hydrated.season);
  const seasonStartYear = Number(nextSeason.slice(0, 4)) || 2027;

  // Loaned-in players whose loan expires return to parent clubs
  const loanedInIds = new Set((hydrated.loanedInPlayers ?? []).map((li) => li.playerId));
  const afterLoanInSquad = hydrated.squad.filter((p) => !loanedInIds.has(p.id));

  // Expired contracts (contractUntil <= seasonStartYear) depart as Free Agents!
  const departedFreeAgents = afterLoanInSquad.filter((p) => p.contractUntil <= seasonStartYear);
  const retainedSquad = afterLoanInSquad.filter((p) => p.contractUntil > seasonStartYear);

  // Player progression, aging & retirement (+1 year for ALL players; no immortality)
  const activeMgr = getActiveCareerManager(hydrated);
  const mgrDevBonus = activeMgr && activeMgr.manManagement >= 93 ? 1 : 0;
  const intensityBonus = hydrated.trainingIntensity === 'intense' ? 1 : 0;
  const totsUserIds = new Set(userTotsPlayers.map((t) => t.playerId));
  const retiredSummaries: RetiredPlayerSummary[] = [];
  let legacyRetirementShards = 0;

  let nextSquad: Player[] = [];
  for (const p of retainedSquad) {
    const totsMoraleBonus = totsUserIds.has(p.id) ? 5 : 0;
    const nextAge = p.age + 1;

    // Roll retirement for aged veterans (>= 36) across all players including ICON/UCL17
    let retireChance = 0;
    if (nextAge === 36) retireChance = 0.2;
    else if (nextAge === 37) retireChance = 0.42;
    else if (nextAge === 38) retireChance = 0.72;
    else if (nextAge >= 39) retireChance = 1.0;
    if (retireChance > 0 && (p.stars ?? 1) >= 5) {
      retireChance = Math.min(0.85, retireChance * 0.75);
    }

    if (retireChance > 0 && Math.random() < retireChance) {
      const legacyShards = Math.max(8, Math.round((p.rating - 68) * 1.5 + (p.stars ?? 1) * 4));
      legacyRetirementShards += legacyShards;
      retiredSummaries.push({
        playerId: p.id,
        playerName: p.name,
        position: p.position,
        age: nextAge,
        rating: p.rating,
        appearances: p.appearances,
        goals: p.goals,
        legacyShards,
      });
      continue;
    }

    let delta = 0;
    if (nextAge <= 24 && p.rating < p.potential) {
      delta = Math.min(p.potential - p.rating, 1 + intensityBonus + mgrDevBonus);
    } else if (nextAge <= 29 && p.rating < p.potential && Math.random() < 0.55 + mgrDevBonus * 0.15) {
      delta = 1;
    } else if (nextAge >= 34 && p.rating > 70 && ((p.stars ?? 1) < 5 || Math.random() < 0.6)) {
      delta = -1;
    }

    const nextRating = Math.max(66, Math.min(99, p.rating + delta));
    const nextVal = Number(
      Math.max(0.1, p.marketValueM * (delta > 0 ? 1.12 : delta < 0 ? 0.85 : 1) * (totsUserIds.has(p.id) ? 1.05 : 1)).toFixed(2)
    );

    const {
      injury: _clearedInjury,
      wageSettledSeason: _clearedSettledSeason,
      wageSettledMatchweek: _clearedSettledMw,
      ...cleanPlayer
    } = p;
    nextSquad.push({
      ...cleanPlayer,
      age: nextAge,
      rating: nextRating,
      marketValueM: nextVal,
      yellowCardsSeason: 0,
      suspendedMatches: 0,
      fitness: 98,
      morale: Math.min(100, Math.max(75, p.morale + 5 + mgrDevBonus * 2 + totsMoraleBonus)),
      goals: 0,
      assists: 0,
      appearances: 0,
      attributes: {
        pac: Math.max(45, Math.min(99, p.attributes.pac + (nextAge >= 33 ? -1 : delta > 0 ? 1 : 0))),
        sho: Math.max(45, Math.min(99, p.attributes.sho + (delta > 0 ? 1 : 0))),
        pas: Math.max(45, Math.min(99, p.attributes.pas + (delta > 0 ? 1 : 0))),
        dri: Math.max(45, Math.min(99, p.attributes.dri + (delta > 0 ? 1 : 0))),
        def: Math.max(45, Math.min(99, p.attributes.def + (delta > 0 ? 1 : 0))),
        phy: Math.max(45, Math.min(99, p.attributes.phy + (nextAge >= 34 ? -1 : delta > 0 ? 1 : 0))),
      },
    });
  }

  // Return loaned-out players with development boost!
  const returningLoans: Player[] = (hydrated.loanedOutPlayers ?? [])
    .filter((lo) => lo.player.contractUntil > seasonStartYear)
    .map((lo) => {
      const p = lo.player;
      const growth = Math.max(1, lo.expectedGrowth);
      const maxCap = Math.min(99, Math.max(p.potential, p.rating + 2));
      const nextRating = Math.min(maxCap, p.rating + growth);
      const realDelta = Math.max(0, nextRating - p.rating);
      const {
        injury: _clearedInjury,
        wageSettledSeason: _clearedSettledSeason,
        wageSettledMatchweek: _clearedSettledMw,
        ...cleanP
      } = p;
      return {
        ...cleanP,
        age: p.age + 1,
        rating: nextRating,
        marketValueM: Number(Math.max(0.2, p.marketValueM * (1 + realDelta * 0.14)).toFixed(2)),
        fitness: 98,
        morale: Math.min(100, p.morale + 8),
        goals: 0,
        assists: 0,
        appearances: 0,
        yellowCardsSeason: 0,
        suspendedMatches: 0,
        attributes: {
          pac: Math.min(99, p.attributes.pac + realDelta),
          sho: Math.min(99, p.attributes.sho + realDelta),
          pas: Math.min(99, p.attributes.pas + realDelta),
          dri: Math.min(99, p.attributes.dri + realDelta),
          def: Math.min(99, p.attributes.def + realDelta),
          phy: Math.min(99, p.attributes.phy + realDelta),
        },
      };
    });

  const existingAfterRetain = new Set(nextSquad.map((p) => p.id));
  for (const ret of returningLoans) {
    if (!existingAfterRetain.has(ret.id)) {
      nextSquad.push(ret);
      existingAfterRetain.add(ret.id);
    }
  }

  // Safety minimum 21 players: call up emergency Academy Reserves if free departures/retirements reduced squad below 21
  let emergencyPromotedCount = 0;
  if (nextSquad.length < 21) {
    const positions: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CM', 'CM', 'CAM', 'LW', 'RW', 'ST'];
    const existingIds = new Set(nextSquad.map((p) => p.id));
    let acadIdx = nextSquad.length + departedFreeAgents.length + Math.floor(Math.random() * 50);
    let posCursor = 0;
    while (nextSquad.length < 21) {
      const pos = positions[posCursor % positions.length];
      posCursor++;
      let candidate = createAcademyFillPlayer(hydrated.clubId, pos, acadIdx++);
      while (existingIds.has(candidate.id)) {
        candidate = createAcademyFillPlayer(hydrated.clubId, pos, acadIdx++);
      }
      candidate = {
        ...candidate,
        id: `acad-emg-${seasonStartYear}-${acadIdx}-${Math.random().toString(36).slice(2, 5)}`,
        contractUntil: seasonStartYear + 3,
        isYouthGraduate: true,
        graduatedSeason: nextSeason,
      };
      existingIds.add(candidate.id);
      nextSquad = [...nextSquad, candidate];
      emergencyPromotedCount++;
    }
  }

  const repairedTactics = repairTacticsAfterSquadChange(hydrated.tactics, nextSquad);

  const freeTransferRecords: TransferRecord[] = [
    ...departedFreeAgents.map((p, idx) => ({
      id: `tr-free-${Date.now()}-${idx}`,
      playerId: p.id,
      playerName: p.name,
      fromClubId: hydrated.clubId,
      toClubId: 'free-agent',
      feeM: 0,
      wageK: p.wageK,
      type: 'free_out' as const,
      matchweek: hydrated.matchweek,
      date: new Date().toISOString(),
    })),
    ...retiredSummaries.map((r, idx) => ({
      id: `tr-ret-${Date.now()}-${idx}`,
      playerId: r.playerId,
      playerName: r.playerName,
      fromClubId: hydrated.clubId,
      toClubId: 'retired',
      feeM: 0,
      wageK: 0,
      type: 'retire' as const,
      matchweek: hydrated.matchweek,
      date: new Date().toISOString(),
    })),
  ];

  const freeDepartureSummaries: FreeDepartureSummary[] = departedFreeAgents.map((p) => ({
    playerId: p.id,
    playerName: p.name,
    position: p.position,
    rating: p.rating,
    marketValueM: p.marketValueM,
    contractUntil: p.contractUntil,
  }));

  // Refresh free agents pool (unrecruited free agents do NOT age across seasons; departed players already aged +1 on exit)
  const squadIdSet = new Set(nextSquad.map((p) => p.id));
  const existingFreePool = (hydrated.freeAgents ?? [])
    .filter((p) => !squadIdSet.has(p.id) && p.age < 40)
    .map((p) => ({
      ...p,
      wageSettledSeason: undefined,
      wageSettledMatchweek: undefined,
    }));
  const newlyFreedPool = departedFreeAgents.map((p) => ({
    ...p,
    age: p.age + 1,
    clubId: 'free-agent',
    marketValueM: 0,
    goals: 0,
    assists: 0,
    appearances: 0,
    yellowCardsSeason: 0,
    suspendedMatches: 0,
    wageSettledSeason: undefined,
    wageSettledMatchweek: undefined,
  }));
  const combinedFree = [...newlyFreedPool, ...existingFreePool].slice(0, 32);
  const nextFreeAgents =
    combinedFree.length >= 10
      ? combinedFree
      : buildInitialFreeAgentsPool(nextSquad, nextSeason).slice(0, 20);

  // Subtle AI rival evolution across seasons (-1 to +2, bounded [-3, +5])
  const nextAiBoosts: Record<string, number> = { ...(hydrated.aiClubStrengthBoosts ?? {}) };
  sortedPrev.forEach((row, idx) => {
    if (row.clubId === hydrated.clubId) return;
    const prevBoost = nextAiBoosts[row.clubId] ?? 0;
    const shift = idx < 4 ? (Math.random() < 0.65 ? 1 : 0) : idx > 14 ? (Math.random() < 0.6 ? -1 : 0) : Math.random() < 0.35 ? 1 : 0;
    nextAiBoosts[row.clubId] = Math.max(-3, Math.min(5, prevBoost + shift));
  });

  // Upgrade league to all 20 clubs (38 rounds)
  const standings = CLUBS.map((c) => makeEmptyStanding(c.id));
  const fixtures = generateRoundRobinFixtures(CLUBS.map((c) => c.id));
  const competitions = buildCompetitionsForSeason(
    nextSeason,
    hydrated.clubId,
    sortedPrev,
    ncWinner
  );

  const prevInv = normalizeInventory(hydrated.inventory);
  const nextInventory = alreadyClaimed
    ? {
        ...prevInv,
        universalShards: prevInv.universalShards + legacyRetirementShards,
      }
    : {
        ...prevInv,
        packs: {
          ...prevInv.packs,
          legend_pack: prevInv.packs.legend_pack + bundle.packs.legend_pack,
          icon_pack: (prevInv.packs.icon_pack ?? 0) + bundle.packs.icon_pack,
          elite_pack: prevInv.packs.elite_pack + bundle.packs.elite_pack,
          trophy_gift_box: prevInv.packs.trophy_gift_box + bundle.packs.trophy_gift_box,
        },
        universalShards: prevInv.universalShards + bundle.totalShards + legacyRetirementShards,
      };

  const nextLedger =
    !alreadyClaimed && prizeM > 0
      ? appendLedgerEntries(hydrated.financialLedger, [
          createLedgerEntry({
            season: hydrated.season,
            matchweek: hydrated.matchweek,
            type: 'income',
            category: 'season_reward',
            title: `Thưởng Tổng kết Mùa giải ${hydrated.season} (Hạng #${bundle.leagueRank})`,
            detail: `Thứ hạng €${bundle.basePrizeM}M · Mục tiêu BLĐ €${bundle.objBonusM}M · ĐHTB €${bundle.totsBonusM}M`,
            amountM: prizeM,
          }),
        ])
      : hydrated.financialLedger;

  const mgrContractUntil = getActiveManagerContractUntil(hydrated, activeMgr);
  const boardUltimatumTriggered = hydrated.boardConfidence < 25;
  const isManagerExpired = Boolean(
    activeMgr && ((mgrContractUntil !== null && mgrContractUntil <= seasonStartYear) || boardUltimatumTriggered)
  );
  const expiredManagerName = isManagerExpired && activeMgr ? activeMgr.name : undefined;
  const nextManagerHistory =
    isManagerExpired && activeMgr
      ? [
          {
            id: `mh-exp-${Date.now().toString(36)}`,
            managerId: activeMgr.id,
            managerName: activeMgr.name,
            action: (boardUltimatumTriggered ? 'fired' : 'replaced') as 'fired' | 'replaced',
            season: hydrated.season,
            matchweek: hydrated.matchweek,
            feeM: 0,
            date: new Date().toISOString(),
          },
          ...(hydrated.managerHistory ?? []),
        ].slice(0, 100)
      : hydrated.managerHistory;

  const computedConfidence = alreadyClaimed
    ? hydrated.boardConfidence
    : Math.min(
        100,
        Math.max(45, hydrated.boardConfidence + (leagueRank <= 4 ? 6 : 1) + bundle.objConfidenceDelta)
      );

  const nextCareer: CareerSave = {
    ...hydrated,
    activeManagerId: isManagerExpired ? null : hydrated.activeManagerId,
    activeManagerSalaryM: isManagerExpired ? undefined : hydrated.activeManagerSalaryM,
    activeManagerContractUntil: isManagerExpired ? undefined : hydrated.activeManagerContractUntil,
    managerLastPerkSeason: undefined,
    ...(nextManagerHistory ? { managerHistory: nextManagerHistory } : {}),
    season: nextSeason,
    matchweek: 1,
    transferBudget: Number((hydrated.transferBudget + prizeM).toFixed(1)),
    boardConfidence: boardUltimatumTriggered ? 58 : computedConfidence,
    fanSupport: alreadyClaimed
      ? hydrated.fanSupport
      : Math.min(100, Math.max(60, hydrated.fanSupport + (leagueRank <= 4 ? 6 : 2))),
    tactics: repairedTactics,
    squad: nextSquad,
    standings,
    fixtures,
    recentResults: [],
    transferHistory: [...freeTransferRecords, ...(hydrated.transferHistory ?? [])].slice(0, 80),
    competitions,
    trophyCabinet: existingCabinet.slice(0, 120),
    seasonHistory: [summary, ...(hydrated.seasonHistory ?? [])].slice(0, 50),
    boardObjectives: generateSeasonObjectives(hydrated.clubId, nextSeason, nextSquad),
    claimedSeasonRewardSeason: undefined,
    settledPayrollSeason: undefined,
    youthAcademy: advanceAcademyOnNewSeason(hydrated.youthAcademy, hydrated.clubId, nextSeason),
    clubRecords: ensureClubRecords(hydrated),
    ...(nextLedger ? { financialLedger: nextLedger } : {}),
    inventory: nextInventory,
    freeAgents: nextFreeAgents,
    loanedOutPlayers: [],
    loanedInPlayers: [],
    incomingTransferOffers: [],
    aiClubStrengthBoosts: nextAiBoosts,
    lastSeasonFreeDepartures: freeDepartureSummaries.length > 0 ? freeDepartureSummaries : undefined,
    lastSeasonDepartureSeason: freeDepartureSummaries.length > 0 ? hydrated.season : undefined,
    lastSeasonEmergencyPromoted: freeDepartureSummaries.length > 0 ? emergencyPromotedCount : undefined,
    lastSeasonRetiredPlayers: retiredSummaries.length > 0 ? retiredSummaries : undefined,
    lastSeasonRetiredSeason: retiredSummaries.length > 0 ? hydrated.season : undefined,
  };

  return {
    nextCareer,
    summary,
    prizeM,
    totalSeasonPrizeM,
    alreadyClaimed,
    newTrophiesCount,
    newlyAwarded,
    departedFreeAgents,
    emergencyPromotedCount,
    ...(expiredManagerName ? { expiredManagerName } : {}),
    retiredPlayers: retiredSummaries,
    returnedLoanCount: returningLoans.length,
    boardUltimatumTriggered,
  };
}

export function getPlayerRecoveryCostM(fitness: number, medicalLevel: 1 | 2 | 3 = 1): number {
  const missing = Math.max(0, 100 - fitness);
  if (missing === 0) return 0;
  const raw = Math.max(0.4, Math.min(2.5, missing * 0.05));
  return Number(Math.max(0.2, raw * getMedicalCostMultiplier(medicalLevel)).toFixed(1));
}

export function getSquadRecoveryCostM(squad: Player[], medicalLevel: 1 | 2 | 3 = 1): number {
  const tiredPlayers = squad.filter((p) => p.fitness < 100);
  if (tiredPlayers.length === 0) return 0;
  const totalMissing = tiredPlayers.reduce((sum, p) => sum + Math.max(0, 100 - p.fitness), 0);
  const raw = Math.max(1.5, Math.min(8.0, totalMissing * 0.025));
  return Number(Math.max(0.6, raw * getMedicalCostMultiplier(medicalLevel)).toFixed(1));
}

export function getInjurySeverityLabel(severity: InjurySeverity): string {
  if (severity === 'severe') return 'Nặng';
  if (severity === 'moderate') return 'Trung bình';
  return 'Nhẹ';
}

export function getInjuryTreatmentCostM(
  player: Player,
  medicalLevel: 1 | 2 | 3 = 1
): number {
  if (!player.injury || player.injury.matchesRemaining <= 0) return 0;
  const sevMult =
    player.injury.severity === 'severe'
      ? 1.35
      : player.injury.severity === 'moderate'
        ? 1.1
        : 0.85;
  const perMatchBase = 0.42 + Math.min(1.4, player.marketValueM * 0.014);
  const raw = Math.max(0.5, Math.min(6.0, player.injury.matchesRemaining * perMatchBase * sevMult));
  return Number(Math.max(0.3, raw * getMedicalCostMultiplier(medicalLevel)).toFixed(1));
}

const INJURY_CATALOG: Record<InjurySeverity, { types: string[]; minMatches: number; maxMatches: number }> = {
  minor: {
    types: ['Căng cơ nhẹ', 'Bầm phần mềm cổ chân', 'Quá tải cơ bắp chân', 'Đau khớp gối nhẹ'],
    minMatches: 1,
    maxMatches: 2,
  },
  moderate: {
    types: ['Lật cổ chân', 'Căng cơ gân kheo', 'Rách nhẹ cơ háng', 'Viêm gân gót Achilles'],
    minMatches: 2,
    maxMatches: 3,
  },
  severe: {
    types: ['Rách cơ đùi sau', 'Giãn dây chằng đầu gối', 'Chấn thương sụn chêm', 'Nứt xương bàn chân'],
    minMatches: 4,
    maxMatches: 5,
  },
};

export function rollMatchInjuriesAndTickRecovery(params: {
  squad: Player[];
  participatedIds: Set<string>;
  tactics: TacticSettings;
  trainingIntensity: CareerSave['trainingIntensity'];
  trainingFocus?: CareerSave['trainingFocus'];
  medicalLevel: 1 | 2 | 3;
  matchweek: number;
  competitionLabel: string;
  allowNewInjuries: boolean;
}): {
  nextSquad: Player[];
  newlyInjured: Player[];
  recoveredPlayers: Player[];
} {
  const {
    squad,
    participatedIds,
    tactics,
    trainingIntensity,
    trainingFocus,
    medicalLevel,
    matchweek,
    competitionLabel,
    allowNewInjuries,
  } = params;

  const recoveredPlayers: Player[] = [];
  const newlyInjured: Player[] = [];

  // Step 1: Tick down existing injuries by 1 match (medicalLevel 3 has 25% chance for an extra -1 recovery)
  let nextSquad = squad.map((p) => {
    if (!p.injury || p.injury.matchesRemaining <= 0) return p;
    const bonusRecovery = medicalLevel === 3 && Math.random() < 0.25 ? 1 : 0;
    const rem = p.injury.matchesRemaining - 1 - bonusRecovery;
    if (rem <= 0) {
      const { injury: _removed, ...rest } = p;
      const healed: Player = {
        ...rest,
        fitness: Math.max(88, p.fitness),
        morale: Math.min(100, p.morale + 3),
      };
      recoveredPlayers.push(healed);
      return healed;
    }
    return {
      ...p,
      injury: {
        ...p.injury,
        matchesRemaining: rem,
      },
    };
  });

  if (!allowNewInjuries) {
    return { nextSquad, newlyInjured, recoveredPlayers };
  }

  // Step 2: Check if squad is healthy enough to sustain a new injury (keep >= 13 healthy players)
  const healthyCount = nextSquad.filter((p) => !isPlayerInjured(p)).length;
  if (healthyCount <= 13) {
    return { nextSquad, newlyInjured, recoveredPlayers };
  }

  const healthyGkCount = nextSquad.filter((p) => p.position === 'GK' && !isPlayerInjured(p)).length;
  const medicalRiskMult = medicalLevel === 3 ? 0.5 : medicalLevel === 2 ? 0.75 : 1.0;
  const focusRiskMult = trainingFocus ? getTrainingFocusModifiers(trainingFocus).injuryRiskMult : 1.0;
  const tacticRiskMult =
    (1 +
      Math.max(0, tactics.pressingIntensity - 3) * 0.12 +
      (tactics.counterPress ? 0.1 : 0) +
      (trainingIntensity === 'intense' ? 0.15 : trainingIntensity === 'light' ? -0.15 : 0)) *
    focusRiskMult;

  const candidates = nextSquad.filter(
    (p) =>
      participatedIds.has(p.id) &&
      !isPlayerInjured(p) &&
      !(p.position === 'GK' && healthyGkCount <= 1)
  );

  // Roll at most 1 new injury per match for balanced gameplay
  for (const p of candidates) {
    const baseRisk =
      p.fitness < 68
        ? 0.085
        : p.fitness < 78
          ? 0.038
          : p.fitness < 88
            ? 0.016
            : 0.008;
    const starResilience = (p.stars ?? 1) >= 5 ? 0.8 : 1.0;
    const gkFactor = p.position === 'GK' ? 0.45 : 1.0;
    const finalChance = Math.min(0.16, baseRisk * medicalRiskMult * tacticRiskMult * starResilience * gkFactor);

    if (Math.random() < finalChance) {
      const sevRoll = Math.random();
      const severity: InjurySeverity =
        p.fitness < 72
          ? sevRoll < 0.25
            ? 'severe'
            : sevRoll < 0.72
              ? 'moderate'
              : 'minor'
          : sevRoll < 0.12
            ? 'severe'
            : sevRoll < 0.48
              ? 'moderate'
              : 'minor';
      const catalog = INJURY_CATALOG[severity];
      const injuryType = catalog.types[Math.floor(Math.random() * catalog.types.length)];
      const matches =
        catalog.minMatches +
        Math.floor(Math.random() * (catalog.maxMatches - catalog.minMatches + 1));

      const injuryObj: PlayerInjury = {
        type: injuryType,
        severity,
        matchesRemaining: matches,
        totalMatches: matches,
        injuredAtMatchweek: matchweek,
        occurredIn: competitionLabel,
      };
      const updatedPlayer: Player = {
        ...p,
        injury: injuryObj,
        fitness: Math.max(45, p.fitness - 15),
        morale: Math.max(40, p.morale - 4),
      };
      newlyInjured.push(updatedPlayer);
      nextSquad = nextSquad.map((sp) => (sp.id === p.id ? updatedPlayer : sp));
      break;
    }
  }

  return { nextSquad, newlyInjured, recoveredPlayers };
}

export function applyDisciplineAndTickSuspensions(params: {
  squad: Player[];
  matchSummary: MatchResultSummary;
  clubId: string;
  isOfficial: boolean;
}): {
  nextSquad: Player[];
  newlySuspended: Array<{ player: Player; reason: 'red' | 'five_yellows' }>;
  returnedFromBan: Player[];
} {
  const { squad, matchSummary, clubId, isOfficial } = params;
  if (!isOfficial) {
    return { nextSquad: squad, newlySuspended: [], returnedFromBan: [] };
  }

  const newlySuspended: Array<{ player: Player; reason: 'red' | 'five_yellows' }> = [];
  const returnedFromBan: Player[] = [];

  const yellowCounts = new Map<string, number>();
  const redCounts = new Map<string, number>();

  for (const ev of matchSummary.events) {
    if (ev.teamId !== clubId || !ev.playerId) continue;
    if (ev.type === 'yellow') {
      yellowCounts.set(ev.playerId, (yellowCounts.get(ev.playerId) ?? 0) + 1);
    } else if (ev.type === 'red') {
      redCounts.set(ev.playerId, (redCounts.get(ev.playerId) ?? 0) + 1);
    }
  }

  const nextSquad = squad.map((p) => {
    const wasBanned = (p.suspendedMatches ?? 0) > 0;
    let nextSuspended = wasBanned ? Math.max(0, (p.suspendedMatches ?? 0) - 1) : 0;
    if (wasBanned && nextSuspended === 0) {
      returnedFromBan.push({ ...p, suspendedMatches: 0 });
    }

    const addedYellows = yellowCounts.get(p.id) ?? 0;
    const addedReds = redCounts.get(p.id) ?? 0;
    const prevYellows = p.yellowCardsSeason ?? 0;
    const nextYellows = prevYellows + addedYellows;

    let banReason: 'red' | 'five_yellows' | null = null;
    if (addedReds > 0) {
      nextSuspended += addedReds;
      banReason = 'red';
    }
    if (addedYellows > 0 && Math.floor(nextYellows / 5) > Math.floor(prevYellows / 5)) {
      nextSuspended += 1;
      if (!banReason) banReason = 'five_yellows';
    }

    const updated: Player = {
      ...p,
      yellowCardsSeason: nextYellows,
      suspendedMatches: nextSuspended,
    };
    if (banReason) {
      newlySuspended.push({ player: updated, reason: banReason });
    }
    return updated;
  });

  return { nextSquad, newlySuspended, returnedFromBan };
}

const ATTR_VIET_LABEL: Record<keyof PlayerAttributes, string> = {
  pac: 'Tốc độ (PAC)',
  sho: 'Dứt điểm (SHO)',
  pas: 'Chuyền bóng (PAS)',
  dri: 'Rê bóng (DRI)',
  def: 'Phòng ngự (DEF)',
  phy: 'Thể chất (PHY)',
};

export function applyTrainingProgressOnMatch(params: {
  squad: Player[];
  participatedIds: Set<string>;
  focus: CareerSave['trainingFocus'];
  intensity: CareerSave['trainingIntensity'];
}): {
  nextSquad: Player[];
  leveledUpPlayers: Array<{ player: Player; attrLabel: string; ovrIncreased: boolean }>;
} {
  const { squad, participatedIds, focus, intensity } = params;
  const mod = getTrainingFocusModifiers(focus, intensity);
  const leveledUpPlayers: Array<{ player: Player; attrLabel: string; ovrIncreased: boolean }> = [];

  const nextSquad = squad.map((p) => {
    if (isPlayerInjured(p)) return p;
    const played = participatedIds.has(p.id);
    const gain = played ? mod.xpPerMatch : Math.round(mod.xpPerMatch * 0.45);
    const totalXp = (p.trainingXp ?? 0) + gain;
    if (totalXp < 100) {
      return { ...p, trainingXp: totalXp };
    }

    const isLegendTier =
      p.cardTier === 'icon' || p.clubId === 'icons-fc' || p.cardTier === 'ucl17';
    const attrCap = isLegendTier ? 99 : Math.min(99, Math.max(p.potential + 3, p.rating + 2));

    // Pick attribute from focus targets based on position relevance
    const candidates = mod.targetAttrs.filter((k) => {
      if (p.position === 'GK' && (k === 'sho' || k === 'dri')) return false;
      return p.attributes[k] < attrCap;
    });
    const fallbackAttr: keyof PlayerAttributes =
      p.position === 'GK' ? 'phy' : candidates[0] ?? mod.targetAttrs[0];
    const pickedAttr =
      candidates.length > 0
        ? candidates[Math.floor(Math.random() * candidates.length)]
        : fallbackAttr;

    const currentAttrVal = p.attributes[pickedAttr];
    const nextAttrVal = Math.min(99, currentAttrVal + 1);
    const nextAttrs: PlayerAttributes = {
      ...p.attributes,
      [pickedAttr]: nextAttrVal,
    };

    const avgAttr = Math.round(
      (nextAttrs.pac + nextAttrs.sho + nextAttrs.pas + nextAttrs.dri + nextAttrs.def + nextAttrs.phy) / 6
    );
    const ovrCap = isLegendTier ? 99 : Math.min(99, Math.max(p.potential, p.rating));
    const canBumpOvr = p.rating < ovrCap && avgAttr >= p.rating && Math.random() < 0.45;
    const nextRating = canBumpOvr ? Math.min(ovrCap, p.rating + 1) : p.rating;

    const updated: Player = {
      ...p,
      rating: nextRating,
      trainingXp: totalXp - 100,
      attributes: nextAttrs,
      ...(canBumpOvr
        ? { marketValueM: Number((p.marketValueM * 1.06).toFixed(2)) }
        : {}),
    };
    leveledUpPlayers.push({
      player: updated,
      attrLabel: ATTR_VIET_LABEL[pickedAttr],
      ovrIncreased: nextRating > p.rating,
    });
    return updated;
  });

  return { nextSquad, leveledUpPlayers };
}

export function buildInitialFreeAgentsPool(
  userSquad: Player[],
  season = '2026/27',
  marketOverrides?: Record<string, MarketOverride>
): Player[] {
  const ownedIds = new Set(userSquad.map((p) => p.id));
  const currentYear = Number(season.slice(0, 4)) || 2026;
  const baseAll = applyMarketOverrides(INITIAL_PLAYERS, marketOverrides ?? {});

  const directFree = baseAll.filter(
    (p) =>
      !ownedIds.has(p.id) &&
      p.cardTier !== 'icon' &&
      p.cardTier !== 'ucl17' &&
      p.clubId !== 'icons-fc' &&
      p.clubId === 'free-agent'
  );

  // Also curate realistic veteran/reserve free agents from database (rating 72..83, age >= 27 or listed)
  const veterans = baseAll
    .filter(
      (p) =>
        !ownedIds.has(p.id) &&
        p.cardTier !== 'icon' &&
        p.cardTier !== 'ucl17' &&
        p.clubId !== 'icons-fc' &&
        p.clubId !== 'free-agent' &&
        p.rating <= 84 &&
        (p.age >= 29 || p.transferStatus === 'listed')
    )
    .sort((a, b) => b.age - a.age || b.rating - a.rating)
    .slice(0, 16)
    .map((p, idx) => ({
      ...p,
      id: `fa-${p.id}`,
      clubId: 'free-agent',
      marketValueM: 0,
      wageK: Math.max(8, Math.round(p.wageK * 0.85)),
      contractUntil: currentYear,
      transferStatus: 'available' as const,
      stars: p.stars ?? 1,
      number: 30 + (idx % 40),
    }));

  const combined = [...directFree.map((p) => ({ ...p, marketValueM: 0 })), ...veterans];
  const seen = new Set<string>();
  const result: Player[] = [];
  for (const pl of combined) {
    if (seen.has(pl.id)) continue;
    seen.add(pl.id);
    result.push(pl);
    if (result.length >= 20) break;
  }
  return result;
}

export function ensureFreeAgentsPool(
  career: CareerSave,
  marketOverrides?: Record<string, MarketOverride>
): Player[] {
  if (Array.isArray(career.freeAgents) && career.freeAgents.length > 0) {
    return career.freeAgents;
  }
  return buildInitialFreeAgentsPool(career.squad, career.season, marketOverrides);
}

export function getLoanOutTerms(player: Player): {
  loanFeeM: number;
  expectedGrowth: number;
  targetClubId: string;
} {
  const loanFeeM = Number(Math.max(0.4, Math.min(8.5, player.marketValueM * 0.12)).toFixed(2));
  const headRoom = Math.max(0, player.potential - player.rating);
  const expectedGrowth =
    player.age <= 22 && headRoom >= 2
      ? Math.min(4, Math.max(2, Math.round(headRoom * 0.55)))
      : player.age <= 25 && headRoom >= 1
        ? Math.min(2, headRoom)
        : 1;
  const candidateClubs = CLUBS.filter(
    (c) => c.id !== player.clubId && c.id !== 'icons-fc' && c.reputation >= 74 && c.reputation <= 87
  );
  const targetClub =
    candidateClubs[Math.floor(Math.random() * candidateClubs.length)] ?? CLUBS[0];
  return { loanFeeM, expectedGrowth, targetClubId: targetClub.id };
}

export function getLoanInTerms(player: Player): {
  loanFeeM: number;
  buyOptionM: number;
} {
  const loanFeeM = Number(Math.max(0.5, Math.min(12, player.marketValueM * 0.14)).toFixed(2));
  const buyOptionM = Number(Math.max(1.0, player.marketValueM * 0.92).toFixed(2));
  return { loanFeeM, buyOptionM };
}

export function generateIncomingTransferOffer(
  career: CareerSave,
  _allPlayers: Player[]
): IncomingTransferOffer | null {
  const activeOffers = (career.incomingTransferOffers ?? []).filter(
    (o) => o.expiresAtMatchweek >= career.matchweek
  );
  if (activeOffers.length >= 3) return null;

  const gkCount = career.squad.filter((p) => p.position === 'GK').length;
  const listedPool = career.squad.filter(
    (p) =>
      p.transferStatus === 'listed' &&
      !activeOffers.some((o) => o.playerId === p.id) &&
      !(p.position === 'GK' && gkCount <= 2)
  );
  const triggerChance = listedPool.length > 0 ? 0.48 : career.squad.length > 23 ? 0.28 : 0.16;
  if (Math.random() > triggerChance) return null;

  const candidates =
    listedPool.length > 0
      ? listedPool
      : career.squad.filter(
          (p) =>
            p.transferStatus !== 'untouchable' &&
            !activeOffers.some((o) => o.playerId === p.id) &&
            !(p.position === 'GK' && gkCount <= 2) &&
            p.rating >= 76
        );
  if (candidates.length === 0 || career.squad.length <= 21) return null;

  const picked = candidates[Math.floor(Math.random() * candidates.length)];
  const buyers = CLUBS.filter(
    (c) => c.id !== career.clubId && c.id !== 'icons-fc' && c.reputation >= 78
  );
  const buyer = buyers[Math.floor(Math.random() * buyers.length)] ?? CLUBS[0];
  const mult = 0.96 + Math.random() * 0.28;
  const hasCustomAsking =
    picked.transferStatus === 'listed' &&
    typeof picked.askingPriceM === 'number' &&
    picked.askingPriceM > 0;
  const rawOffer = hasCustomAsking
    ? picked.askingPriceM! <= picked.marketValueM * 1.45
      ? picked.askingPriceM! * (0.92 + Math.random() * 0.14)
      : Math.min(picked.askingPriceM!, picked.marketValueM * (1.05 + Math.random() * 0.28))
    : picked.marketValueM * mult;
  const offerM = Number(Math.max(0.5, rawOffer).toFixed(2));

  return {
    id: `offer-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
    playerId: picked.id,
    playerName: picked.name,
    position: picked.position,
    rating: picked.rating,
    fromClubId: buyer.id,
    offerM,
    expiresAtMatchweek: career.matchweek + 4,
    createdAt: new Date().toISOString(),
  };
}


