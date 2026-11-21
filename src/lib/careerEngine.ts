import { CLUBS, FORMATION_TEMPLATES, INITIAL_PLAYERS, REAL_MANAGERS } from '../data/footballDatabase';
import {
  CareerSave,
  ChampionsCupState,
  ChampionsGroup,
  CompactMatchReport,
  CompetitionId,
  CompetitionPlayerStat,
  CompetitionsState,
  CupMatch,
  Fixture,
  FormationId,
  LeagueStanding,
  ManOfTheMatch,
  MarketOverride,
  MatchEvent,
  MatchPlayerRating,
  MatchResultSummary,
  NationalCupState,
  Player,
  Position,
  SeasonRecord,
  SuperCupState,
  TacticSettings,
  TacticSlot,
  TrophyItem,
} from '../types/game';
import { createStarterInventory, normalizeInventory } from './inventoryEngine';

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

export function buildAutoLineupSlots(formation: FormationId, clubSquad: Player[]): TacticSlot[] {
  const template = FORMATION_TEMPLATES[formation];
  const usedIds = new Set<string>();
  const sorted = [...clubSquad].sort((a, b) => b.rating - a.rating);

  return template.map((tpl, idx) => {
    const compatOrder = POSITION_COMPATIBILITY[tpl.label];
    let picked: Player | undefined;

    for (const pos of compatOrder) {
      picked = sorted.find((pl) => !usedIds.has(pl.id) && pl.position === pos);
      if (picked) break;
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
  const byId = new Map<string, CompetitionPlayerStat>();
  for (const row of existing ?? []) {
    byId.set(row.playerId, { ...row });
  }

  const playerLookupById = new Map<string, Player>();
  const playerLookupByName = new Map<string, Player>();
  const playerLookupByTeamShort = new Map<string, Player>();

  for (const p of allPlayers) {
    playerLookupById.set(p.id, p);
    playerLookupByName.set(p.name, p);
    playerLookupByTeamShort.set(`${p.clubId}:${p.shortName}`, p);
  }
  for (const p of userSquad) {
    playerLookupById.set(p.id, p);
    playerLookupByName.set(p.name, p);
    playerLookupByTeamShort.set(`${p.clubId}:${p.shortName}`, p);
  }

  const upsertStat = (
    player: Player | undefined,
    fallbackName: string,
    teamId: string,
    goalDelta: number,
    assistDelta: number
  ) => {
    const key = player?.id ?? `${teamId}:${fallbackName}`;
    const cur = byId.get(key) ?? {
      playerId: key,
      playerName: player?.name ?? fallbackName,
      shortName: player?.shortName ?? fallbackName,
      clubId: player?.clubId ?? teamId,
      position: player?.position ?? 'ST',
      goals: 0,
      assists: 0,
    };
    cur.goals += goalDelta;
    cur.assists += assistDelta;
    byId.set(key, cur);
  };

  for (const match of matches) {
    for (const ev of match.events) {
      if (ev.type !== 'goal') continue;
      const scorer =
        (ev.playerId ? playerLookupById.get(ev.playerId) : undefined) ??
        playerLookupByName.get(ev.playerName) ??
        playerLookupByTeamShort.get(`${ev.teamId}:${ev.playerName}`);
      upsertStat(scorer, ev.playerName, ev.teamId, 1, 0);

      if (ev.assistName || ev.assistId) {
        const assister =
          (ev.assistId ? playerLookupById.get(ev.assistId) : undefined) ??
          (ev.assistName
            ? playerLookupByTeamShort.get(`${ev.teamId}:${ev.assistName}`) ??
              playerLookupByName.get(ev.assistName)
            : undefined);
        upsertStat(assister, ev.assistName ?? 'Cầu thủ', ev.teamId, 0, 1);
      }
    }
  }

  return Array.from(byId.values())
    .filter((item) => item.goals > 0 || item.assists > 0)
    .sort((a, b) => b.goals + b.assists - (a.goals + a.assists))
    .slice(0, 200);
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

  const hasInventory = Boolean(
    career.inventory &&
      career.inventory.packs &&
      career.inventory.playerCards &&
      typeof career.inventory.universalShards === 'number'
  );
  const hasAllStars = career.squad.every((p) => typeof p.stars === 'number');

  if (
    hasComps &&
    career.competitions?.leaderboards &&
    career.trophyCabinet &&
    career.seasonHistory &&
    hasInventory &&
    hasAllStars
  ) {
    return career;
  }

  return {
    ...career,
    squad: hasAllStars ? career.squad : career.squad.map((p) => ({ ...p, stars: p.stars ?? 1 })),
    competitions,
    trophyCabinet: career.trophyCabinet ?? [],
    seasonHistory: career.seasonHistory ?? [],
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
  const clubSquad = allPlayers
    .filter((p) => p.clubId === club.id)
    .map((p) => ({ ...p, stars: p.stars ?? 1 }));
  const formation = manager.preferredFormation;

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
    slots: buildAutoLineupSlots(formation, clubSquad),
  };

  const standings: LeagueStanding[] = CLUBS.map((c) => makeEmptyStanding(c.id));
  const fixtures = generateRoundRobinFixtures(CLUBS.map((c) => c.id));
  const competitions = buildCompetitionsForSeason('2026/27', club.id, standings);

  return {
    uid,
    clubId: club.id,
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
    seasonHistory: [],
    inventory: createStarterInventory(),
  };
}

export function calculateTacticalProfile(tactics: TacticSettings, squad: Player[]) {
  const playerMap = new Map(squad.map((p) => [p.id, p]));
  let atkSum = 0;
  let atkCount = 0;
  let midSum = 0;
  let midCount = 0;
  let defSum = 0;
  let defCount = 0;
  let fitMatches = 0;

  for (const slot of tactics.slots) {
    const p = playerMap.get(slot.playerId);
    if (!p) continue;

    const compat = POSITION_COMPATIBILITY[slot.label];
    const penalty = p.position === slot.label ? 0 : compat.includes(p.position) ? 3 : 10;
    if (penalty <= 3) fitMatches += 1;
    const effRating = Math.max(50, p.rating - penalty);

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

  const attack = Math.min(
    99,
    Math.round(
      (atkCount ? atkSum / atkCount : 75) +
        mentalityAtkBonus +
        (tactics.workBallIntoBox ? 0.8 : 0)
    )
  );
  const midfield = Math.min(
    99,
    Math.round(
      (midCount ? midSum / midCount : 75) +
        (tactics.playOutOfDefence ? 1.2 : 0) +
        (tactics.counterPress ? 0.8 : 0) +
        (tactics.passingDirectness <= 2 ? 0.6 : 0)
    )
  );
  const defense = Math.min(
    99,
    Math.round(
      (defCount ? defSum / defCount : 75) +
        mentalityDefBonus +
        (tactics.offsideTrap && tactics.defensiveLine >= 4 ? 0.5 : 0)
    )
  );
  const cohesion = Math.min(100, Math.round((fitMatches / 11) * 85 + (tactics.counterPress ? 8 : 5) + 7));
  const possessionIndex = Math.min(
    75,
    Math.max(
      32,
      Math.round(
        48 +
          (6 - tactics.passingDirectness) * 3.5 +
          (tactics.playOutOfDefence ? 4 : -2) +
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
      if (p && !used.has(p.id)) {
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
      if (p && !used.has(p.id)) {
        used.add(p.id);
        starters.push({ player: p, slotLabel: slot.label });
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

  return Math.max(-4.5, Math.min(3.5, fitMod + moraleMod + formMod + cohesionMod));
}

function computeAITeamProfile(
  clubId: string,
  roster: Player[],
  fallbackRep: number
): { attack: number; midfield: number; defense: number; overall: number } {
  const club = CLUBS.find((c) => c.id === clubId);
  const mgr = REAL_MANAGERS.find((m) => m.id === club?.managerId);
  const formation: FormationId = mgr?.preferredFormation ?? '4-3-3';
  const slots = buildAutoLineupSlots(formation, roster);
  if (slots.length === 0) {
    return { attack: fallbackRep, midfield: fallbackRep, defense: fallbackRep, overall: fallbackRep };
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
  // Subtle manager tactical rating modifier (-0.6 to +1.0) without inflating beyond real XI talent
  const mgrBonus = mgr ? Math.max(-0.6, Math.min(1.0, (mgr.tacticalRating - 85) * 0.12)) : 0;
  return {
    attack: Math.min(99, prof.attack + mgrBonus),
    midfield: Math.min(99, prof.midfield + mgrBonus * 0.8),
    defense: Math.min(99, prof.defense + mgrBonus),
    overall: Math.min(99, prof.overall + mgrBonus),
  };
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
    competition?: CompetitionId;
    roundLabel?: string;
    matchId?: string;
  }
): MatchResultSummary {
  const isUserHome = homeId === userClubId;
  const isUserAway = awayId === userClubId;

  const homeClub = CLUBS.find((c) => c.id === homeId) ?? CLUBS[0];
  const awayClub = CLUBS.find((c) => c.id === awayId) ?? CLUBS[1];

  const homeRoster = isUserHome ? userSquad : allPlayers.filter((p) => p.clubId === homeId);
  const awayRoster = isUserAway ? userSquad : allPlayers.filter((p) => p.clubId === awayId);

  const homeMgr = REAL_MANAGERS.find((m) => m.id === homeClub.managerId) ?? REAL_MANAGERS[0];
  const awayMgr = REAL_MANAGERS.find((m) => m.id === awayClub.managerId) ?? REAL_MANAGERS[1];

  const homeStarters = resolveMatchStarters(
    homeId,
    isUserHome ? userTactics.formation : homeMgr.preferredFormation,
    homeRoster,
    isUserHome ? userTactics : undefined
  );
  const awayStarters = resolveMatchStarters(
    awayId,
    isUserAway ? userTactics.formation : awayMgr.preferredFormation,
    awayRoster,
    isUserAway ? userTactics : undefined
  );
  const homePlayingXI = homeStarters.length > 0 ? homeStarters.map((s) => s.player) : homeRoster;
  const awayPlayingXI = awayStarters.length > 0 ? awayStarters.map((s) => s.player) : awayRoster;

  const userProfile = calculateTacticalProfile(userTactics, userSquad);
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
    : computeAITeamProfile(homeId, homeRoster, homeClub.reputation);

  const awayProfile = isUserAway
    ? {
        attack: userProfile.attack + userCondBonus,
        midfield: userProfile.midfield + userCondBonus * 0.85,
        defense: userProfile.defense + userCondBonus,
        overall: userProfile.overall + userCondBonus,
      }
    : computeAITeamProfile(awayId, awayRoster, awayClub.reputation);

  const homeStrength = homeProfile.overall;
  const awayStrength = awayProfile.overall;

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

  const clampExponent = (val: number) => Math.max(-1.35, Math.min(1.35, val));
  // Neutral realistic home-field boost (~1.38 vs ~1.18) without hidden AI OVR inflation
  const expectedHome = Math.max(
    0.25,
    1.38 * matchPace * Math.exp(clampExponent(homeEdge * 0.068))
  );
  const expectedAway = Math.max(
    0.22,
    1.18 * matchPace * Math.exp(clampExponent(awayEdge * 0.068))
  );

  const homeGoals = samplePoissonGoals(expectedHome);
  const awayGoals = samplePoissonGoals(expectedAway);

  const events: MatchEvent[] = [
    {
      minute: 1,
      type: 'kickoff',
      teamId: homeId,
      playerName: homeClub.shortName,
      description: `Trọng tài thổi còi khai cuộc tại ${homeClub.stadium}.`,
    },
  ];

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

  const pickScorer = (roster: Player[]) => {
    const outfield = roster.filter((p) => p.position !== 'GK');
    const pool = outfield.length > 0 ? outfield : roster;
    return pickWeighted(pool, (p) => {
      const posWeight =
        p.position === 'ST'
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
  };

  const pickAssister = (roster: Player[], scorerId?: string) => {
    const candidates = roster.filter((p) => p.id !== scorerId && p.position !== 'GK');
    if (candidates.length === 0 || Math.random() < 0.14) return undefined;
    return pickWeighted(candidates, (p) => {
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
  };

  const goalContributionByPlayer = new Map<string, { player: Player; teamId: string; score: number }>();
  const addContribution = (pl: Player | undefined, teamId: string, pts: number) => {
    if (!pl) return;
    const cur = goalContributionByPlayer.get(pl.id) ?? { player: pl, teamId, score: 0 };
    cur.score += pts;
    goalContributionByPlayer.set(pl.id, cur);
  };

  for (let i = 0; i < homeGoals; i++) {
    const min = Math.floor(Math.random() * 88) + 2;
    const scorer = pickScorer(homePlayingXI);
    const assist = pickAssister(homePlayingXI, scorer?.id);
    addContribution(scorer, homeId, 3);
    addContribution(assist, homeId, 1.5);
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
    const scorer = pickScorer(awayPlayingXI);
    const assist = pickAssister(awayPlayingXI, scorer?.id);
    addContribution(scorer, awayId, 3);
    addContribution(assist, awayId, 1.5);
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

  let yellowsHome = 0;
  let yellowsAway = 0;
  const highlightCount = 5;
  for (let k = 0; k < highlightCount; k++) {
    const min = Math.floor(Math.random() * 86) + 3;
    const side = Math.random() > 0.5 ? homeId : awayId;
    const roster = side === homeId ? homePlayingXI : awayPlayingXI;
    const club = side === homeId ? homeClub : awayClub;
    const pl = pickScorer(roster);
    const evType = k === 1 || k === 4 ? 'yellow' : k === 2 ? 'save' : 'chance';
    if (evType === 'yellow') {
      if (side === homeId) yellowsHome++;
      else yellowsAway++;
    }
    const ev: MatchEvent = {
      minute: min,
      type: evType,
      teamId: side,
      playerName: pl?.shortName ?? club.shortName,
      description:
        evType === 'yellow'
          ? `Thẻ vàng cho ${pl?.shortName ?? 'cầu thủ'} (${club.shortName}) sau pha phạm lỗi chiến thuật.`
          : evType === 'save'
            ? `Thủ môn bay người cứu thua xuất thần trước cú sút xa của ${pl?.shortName ?? club.shortName}.`
            : `Cơ hội nguy hiểm! ${pl?.shortName ?? club.shortName} dứt điểm chệch cột dọc trong gang tấc.`,
    };
    if (pl?.id) ev.playerId = pl.id;
    events.push(ev);
  }

  let penaltiesHome: number | undefined;
  let penaltiesAway: number | undefined;
  let winnerId: string | undefined;

  if (homeGoals > awayGoals) {
    winnerId = homeId;
  } else if (awayGoals > homeGoals) {
    winnerId = awayId;
  } else if (options?.isKnockout) {
    const homeEdge = homeStrength >= awayStrength ? 0.53 : 0.47;
    const homeWinsPen = Math.random() < homeEdge;
    const baseScore = Math.floor(Math.random() * 2) + 4; // 4 or 5
    if (homeWinsPen) {
      penaltiesHome = baseScore;
      penaltiesAway = baseScore - (Math.random() > 0.4 ? 1 : 2);
      winnerId = homeId;
    } else {
      penaltiesAway = baseScore;
      penaltiesHome = baseScore - (Math.random() > 0.4 ? 1 : 2);
      winnerId = awayId;
    }
    const winnerClub = winnerId === homeId ? homeClub : awayClub;
    events.push({
      minute: 90,
      type: 'penalty',
      teamId: winnerId,
      playerName: winnerClub.shortName,
      description: `LUÂN LƯU 11M! ${winnerClub.name} thắng ${penaltiesHome} - ${penaltiesAway} trên chấm phạt đền!`,
    });
  }

  events.push({
    minute: 90,
    type: 'fulltime',
    teamId: homeId,
    playerName: 'FT',
    description: `Hết giờ! ${homeClub.name} ${homeGoals} - ${awayGoals} ${awayClub.name}.`,
  });

  events.sort((a, b) => a.minute - b.minute);

  const possessionHome = isUserHome
    ? userProfile.possessionIndex
    : isUserAway
      ? 100 - userProfile.possessionIndex
      : Math.min(65, Math.max(35, Math.round(50 + (homeStrength - awayStrength) * 1.4)));

  const shotsHome = homeGoals * 3 + Math.floor(Math.random() * 7) + 4;
  const shotsAway = awayGoals * 3 + Math.floor(Math.random() * 7) + 3;
  const shotsOnTargetHome = Math.min(
    shotsHome,
    homeGoals + Math.max(1, Math.floor(shotsHome * 0.36))
  );
  const shotsOnTargetAway = Math.min(
    shotsAway,
    awayGoals + Math.max(1, Math.floor(shotsAway * 0.34))
  );
  const cornersHome = Math.max(1, Math.round(shotsHome * 0.42 + Math.random() * 2));
  const cornersAway = Math.max(1, Math.round(shotsAway * 0.42 + Math.random() * 2));
  const foulsHome = 6 + yellowsHome * 2 + Math.floor(Math.random() * 5);
  const foulsAway = 6 + yellowsAway * 2 + Math.floor(Math.random() * 5);

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
    xgHome: Number((homeGoals * 0.72 + shotsHome * 0.08).toFixed(2)),
    xgAway: Number((awayGoals * 0.72 + shotsAway * 0.08).toFixed(2)),
    homeFormation: isUserHome ? userTactics.formation : homeMgr.preferredFormation,
    awayFormation: isUserAway ? userTactics.formation : awayMgr.preferredFormation,
    homeManagerName: isUserHome ? 'Bạn (HLV)' : homeMgr.name,
    awayManagerName: isUserAway ? 'Bạn (HLV)' : awayMgr.name,
    venue: homeClub.stadium,
    playerRatings,
    events,
    playedAt: new Date().toISOString(),
  };

  if (motm) summary.manOfTheMatch = motm;
  if (options?.roundLabel) summary.roundLabel = options.roundLabel;
  if (penaltiesHome !== undefined) summary.penaltiesHome = penaltiesHome;
  if (penaltiesAway !== undefined) summary.penaltiesAway = penaltiesAway;
  if (winnerId !== undefined) summary.winnerId = winnerId;

  return summary;
}

export function toCompactMatchReport(
  summary: MatchResultSummary,
  keepAllEvents = false
): CompactMatchReport {
  const filteredEvents = keepAllEvents
    ? summary.events
    : summary.events.filter((e) => e.type === 'goal' || e.type === 'yellow' || e.type === 'penalty');
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
  if (summary.homeFormation) report.homeFormation = summary.homeFormation;
  if (summary.awayFormation) report.awayFormation = summary.awayFormation;
  if (summary.homeManagerName) report.homeManagerName = summary.homeManagerName;
  if (summary.awayManagerName) report.awayManagerName = summary.awayManagerName;
  if (summary.venue) report.venue = summary.venue;
  if (summary.manOfTheMatch) report.manOfTheMatch = summary.manOfTheMatch;
  if (keepAllEvents && summary.playerRatings && summary.playerRatings.length > 0) {
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

export function createNextSeasonCareer(career: CareerSave): {
  nextCareer: CareerSave;
  summary: SeasonRecord;
  prizeM: number;
  newTrophiesCount: number;
} {
  const hydrated = ensureCareerCompetitions(career);
  const sortedPrev = sortStandings(hydrated.standings);
  const leagueRank = Math.max(1, sortedPrev.findIndex((r) => r.clubId === hydrated.clubId) + 1);
  const myRow = sortedPrev.find((r) => r.clubId === hydrated.clubId);
  const championClubId = sortedPrev[0]?.clubId ?? hydrated.clubId;
  const leagueScorers = [...(hydrated.competitions?.leaderboards?.league ?? [])].sort(
    (a, b) => b.goals - a.goals
  );
  const topLeagueScorer = leagueScorers[0];
  const topSquadScorer = [...hydrated.squad].sort((a, b) => b.goals - a.goals)[0];

  const prizeM =
    leagueRank === 1 ? 55 : leagueRank <= 4 ? 35 : leagueRank <= 10 ? 25 : 18;

  const existingCabinet = [...(hydrated.trophyCabinet ?? [])];
  const trophiesWonTitles: string[] = [];
  let newTrophiesCount = 0;

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

  const summary: SeasonRecord = {
    season: hydrated.season,
    clubId: hydrated.clubId,
    leagueRank,
    points: myRow?.points ?? 0,
    championClubId,
    topScorerName: topLeagueScorer?.playerName ?? topSquadScorer?.name ?? 'Chưa có',
    topScorerGoals: topLeagueScorer?.goals ?? topSquadScorer?.goals ?? 0,
    trophiesWon: trophiesWonTitles,
  };
  if (ccWinner) summary.championsCupWinnerId = ccWinner;
  if (ncWinner) summary.nationalCupWinnerId = ncWinner;

  const nextSeason = getNextSeasonString(hydrated.season);
  const seasonStartYear = Number(nextSeason.slice(0, 4)) || 2027;

  // Player progression & aging (+1 year, training boost for young talents, slight dip for 34+; Icons never age-decline)
  const intensityBonus = hydrated.trainingIntensity === 'intense' ? 1 : 0;
  const nextSquad = hydrated.squad.map((p) => {
    const isImmortalLegend =
      p.cardTier === 'icon' || p.clubId === 'icons-fc' || p.cardTier === 'ucl17';
    if (isImmortalLegend) {
      return {
        ...p,
        contractUntil: Math.max(2099, p.contractUntil),
        fitness: 98,
        morale: Math.min(100, Math.max(85, p.morale + 5)),
        goals: 0,
        assists: 0,
        appearances: 0,
      };
    }

    const nextAge = p.age + 1;
    let delta = 0;
    if (nextAge <= 24 && p.rating < p.potential) {
      delta = Math.min(p.potential - p.rating, 1 + intensityBonus);
    } else if (nextAge <= 29 && p.rating < p.potential && Math.random() < 0.55) {
      delta = 1;
    } else if (nextAge >= 34 && p.rating > 70) {
      delta = -1;
    }

    const nextRating = Math.max(66, Math.min(99, p.rating + delta));
    const nextVal = Number(
      Math.max(2, p.marketValueM * (delta > 0 ? 1.12 : delta < 0 ? 0.85 : 1)).toFixed(1)
    );

    return {
      ...p,
      age: nextAge,
      rating: nextRating,
      marketValueM: nextVal,
      contractUntil:
        p.contractUntil <= seasonStartYear ? seasonStartYear + 2 : p.contractUntil,
      fitness: 98,
      morale: Math.min(100, Math.max(75, p.morale + 5)),
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
    };
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
  const nextInventory = {
    ...prevInv,
    packs: {
      ...prevInv.packs,
      legend_pack: prevInv.packs.legend_pack + 1,
      icon_pack: (prevInv.packs.icon_pack ?? 0) + (championClubId === hydrated.clubId ? 1 : 0),
      elite_pack: prevInv.packs.elite_pack + 2,
      trophy_gift_box: prevInv.packs.trophy_gift_box + 1,
    },
    universalShards: prevInv.universalShards + 30,
  };

  const nextCareer: CareerSave = {
    ...hydrated,
    season: nextSeason,
    matchweek: 1,
    transferBudget: Number((hydrated.transferBudget + prizeM).toFixed(1)),
    boardConfidence: Math.min(100, Math.max(70, hydrated.boardConfidence + (leagueRank <= 4 ? 8 : 2))),
    fanSupport: Math.min(100, Math.max(72, hydrated.fanSupport + (leagueRank <= 4 ? 6 : 2))),
    squad: nextSquad,
    standings,
    fixtures,
    recentResults: [],
    competitions,
    trophyCabinet: existingCabinet.slice(0, 60),
    seasonHistory: [summary, ...(hydrated.seasonHistory ?? [])].slice(0, 30),
    inventory: nextInventory,
  };

  return { nextCareer, summary, prizeM, newTrophiesCount };
}

export function getPlayerRecoveryCostM(fitness: number): number {
  const missing = Math.max(0, 100 - fitness);
  if (missing === 0) return 0;
  return Number(Math.max(0.4, Math.min(2.5, missing * 0.05)).toFixed(1));
}

export function getSquadRecoveryCostM(squad: Player[]): number {
  const tiredPlayers = squad.filter((p) => p.fitness < 100);
  if (tiredPlayers.length === 0) return 0;
  const totalMissing = tiredPlayers.reduce((sum, p) => sum + Math.max(0, 100 - p.fitness), 0);
  return Number(Math.max(1.5, Math.min(8.0, totalMissing * 0.025)).toFixed(1));
}

