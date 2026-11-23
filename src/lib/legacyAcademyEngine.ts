import { CLUBS } from '../data/footballDatabase';
import {
  CareerSave,
  ClubHeadToHeadRecord,
  ClubPlayerCareerRecord,
  ClubRecordsState,
  MatchEvent,
  MatchPlayerRating,
  Player,
  PlayerAttributes,
  PlayerRole,
  Position,
  YouthAcademyState,
  YouthProspect,
} from '../types/game';

interface NationNamePool {
  nationality: string;
  flagCode: string;
  firstNames: string[];
  lastNames: string[];
  skinTones: string[];
  hairColors: string[];
}

const YOUTH_NATION_POOLS: NationNamePool[] = [
  {
    nationality: 'Việt Nam',
    flagCode: 'VN',
    firstNames: ['Nguyễn', 'Trần', 'Lê', 'Phạm', 'Hoàng', 'Vũ', 'Đặng', 'Bùi'],
    lastNames: ['Minh Khôi', 'Gia Bảo', 'Tuấn Kiệt', 'Quốc Anh', 'Đức Huy', 'Hoàng Nam', 'Bảo Long', 'Nhật Minh'],
    skinTones: ['#e8c39e', '#dfb58c'],
    hairColors: ['#141414', '#1f1b18'],
  },
  {
    nationality: 'Tây Ban Nha',
    flagCode: 'ES',
    firstNames: ['Pablo', 'Marc', 'Iker', 'Hugo', 'Mateo', 'Álvaro', 'Unai', 'Gorka'],
    lastNames: ['Navarro', 'Serrano', 'Mendoza', 'Cuesta', 'Ibáñez', 'Roldán', 'Casado', 'Vidal'],
    skinTones: ['#f0c9a6', '#e3b892'],
    hairColors: ['#1e1916', '#3d2b1f', '#523a28'],
  },
  {
    nationality: 'Anh',
    flagCode: 'GB',
    firstNames: ['Ethan', 'Charlie', 'Alfie', 'Callum', 'Harvey', 'Reece', 'Finley', 'Mason'],
    lastNames: ['Whitaker', 'Bramwell', 'Houghton', 'Redmond', 'Gallagher', 'Prescott', 'Mercer', 'Ainsworth'],
    skinTones: ['#f4d2b8', '#ecc4a4', '#8d5524'],
    hairColors: ['#2a1d17', '#6b4c35', '#b5894c', '#181818'],
  },
  {
    nationality: 'Pháp',
    flagCode: 'FR',
    firstNames: ['Lucas', 'Théo', 'Mathis', 'Enzo', 'Nolan', 'Yanis', 'Sacha', 'Kylian'],
    lastNames: ['Chevalier', 'Delacroix', 'Morel', 'Gauthier', 'Diallo', 'Boucher', 'Mercier', 'Lemaire'],
    skinTones: ['#f1ccb0', '#c68642', '#7d4a26'],
    hairColors: ['#181818', '#33241c', '#4a3525'],
  },
  {
    nationality: 'Brazil',
    flagCode: 'BR',
    firstNames: ['Gabriel', 'Cauã', 'Henrique', 'Davi', 'João', 'Vinícius', 'Matheus', 'Rafael'],
    lastNames: ['Barbosa', 'Teixeira', 'Nascimento', 'Ferreira', 'Monteiro', 'Cavalcanti', 'Cardoso', 'Ribeiro'],
    skinTones: ['#e0ac69', '#c68642', '#8d5524', '#f1c27d'],
    hairColors: ['#141414', '#261c17'],
  },
  {
    nationality: 'Đức',
    flagCode: 'DE',
    firstNames: ['Lukas', 'Jonas', 'Timo', 'Finn', 'Moritz', 'Noah', 'Julian', 'Niklas'],
    lastNames: ['Becker', 'Hoffmann', 'Schäfer', 'Richter', 'Vogel', 'Keller', 'Brandt', 'Lehmann'],
    skinTones: ['#f4d5bc', '#e8c1a0'],
    hairColors: ['#8c6d3f', '#c29b59', '#3b2b20'],
  },
  {
    nationality: 'Argentina',
    flagCode: 'AR',
    firstNames: ['Thiago', 'Valentín', 'Bautista', 'Franco', 'Santino', 'Tomás', 'Ignacio', 'Lautaro'],
    lastNames: ['Giménez', 'Peralta', 'Acuña', 'Benítez', 'Rojas', 'Sosa', 'Bustamante', 'Quiroga'],
    skinTones: ['#ecc4a4', '#dfb28b'],
    hairColors: ['#1a1715', '#36271d'],
  },
  {
    nationality: 'Bồ Đào Nha',
    flagCode: 'PT',
    firstNames: ['Diogo', 'Gonçalo', 'Tiago', 'Rodrigo', 'Afonso', 'Vasco', 'Martim', 'Fábio'],
    lastNames: ['Carvalho', 'Correia', 'Nunes', 'Teixeira', 'Pinto', 'Azevedo', 'Mendes', 'Sousa'],
    skinTones: ['#ecc2a0', '#d8a982'],
    hairColors: ['#1c1816', '#3a2a1e'],
  },
  {
    nationality: 'Hà Lan',
    flagCode: 'NL',
    firstNames: ['Sem', 'Daan', 'Milan', 'Luuk', 'Bram', 'Tijn', 'Stijn', 'Jesse'],
    lastNames: ['Bakker', 'Meijer', 'Vermeer', 'Dekker', 'van Dijk', 'Jansen', 'Visser', 'Smit'],
    skinTones: ['#f3d2b8', '#c68642'],
    hairColors: ['#a68046', '#4a3525', '#171717'],
  },
  {
    nationality: 'Nhật Bản',
    flagCode: 'JP',
    firstNames: ['Haruto', 'Sota', 'Ren', 'Yuto', 'Kaito', 'Riku', 'Takumi', 'Daiki'],
    lastNames: ['Tanaka', 'Sato', 'Kobayashi', 'Watanabe', 'Ito', 'Nakamura', 'Yamamoto', 'Kato'],
    skinTones: ['#f0ccb0', '#e6bd9d'],
    hairColors: ['#141414', '#1d1b1a'],
  },
];

const CLUB_PRIMARY_COUNTRY: Record<string, string> = {
  'real-madrid': 'Tây Ban Nha',
  barcelona: 'Tây Ban Nha',
  'atletico-madrid': 'Tây Ban Nha',
  'man-city': 'Anh',
  arsenal: 'Anh',
  liverpool: 'Anh',
  chelsea: 'Anh',
  'man-utd': 'Anh',
  tottenham: 'Anh',
  newcastle: 'Anh',
  'aston-villa': 'Anh',
  'bayern-munich': 'Đức',
  dortmund: 'Đức',
  leverkusen: 'Đức',
  psg: 'Pháp',
  'inter-milan': 'Argentina',
  'ac-milan': 'Pháp',
  juventus: 'Brazil',
  napoli: 'Bồ Đào Nha',
  'al-nassr': 'Việt Nam',
};

const POSITIONS_POOL: Position[] = ['GK', 'CB', 'CB', 'LB', 'RB', 'CDM', 'CM', 'CAM', 'LW', 'RW', 'ST'];

const ARCHETYPES: Record<Position, string[]> = {
  GK: ['Thủ môn Phản xạ', 'Người gác đền Hiện đại'],
  CB: ['Trung vệ Thép U18', 'Trung vệ Chơi chân'],
  LB: ['Hậu vệ Biên Tấn công', 'Máy chạy Hành lang Trái'],
  RB: ['Hậu vệ Biên Toàn diện', 'Máy chạy Hành lang Phải'],
  CDM: ['Mỏ neo Tuyến giữa', 'Máy quét Phòng ngự'],
  CM: ['Tiền vệ Box-to-Box', 'Nhịp đập Tuyến giữa'],
  CAM: ['Nhạc trưởng U18', 'Số 10 Sáng tạo'],
  LW: ['Cánh trái Bùng nổ', 'Nghệ sĩ Đột phá'],
  RW: ['Mũi khoan Cánh phải', 'Tiền đạo Cánh Hiện đại'],
  ST: ['Thần đồng Săn bàn', 'Sát thủ Vòng cấm'],
};

const SECONDARY_POS: Partial<Record<Position, Position>> = {
  CB: 'CDM',
  LB: 'LW',
  RB: 'RW',
  CDM: 'CM',
  CM: 'CAM',
  CAM: 'RW',
  LW: 'ST',
  RW: 'ST',
  ST: 'LW',
};

const DEFAULT_ROLE_FOR_POS: Record<Position, PlayerRole> = {
  GK: 'Sweeper Keeper',
  CB: 'Ball-Playing Defender',
  LB: 'Complete Wing-Back',
  RB: 'Complete Wing-Back',
  CDM: 'Deep-Lying Playmaker',
  CM: 'Box-to-Box',
  CAM: 'Advanced Playmaker',
  LW: 'Inside Forward',
  RW: 'Inverted Winger',
  ST: 'Advanced Forward',
};

const pick = <T,>(arr: T[]): T => arr[Math.floor(Math.random() * arr.length)];
const randInt = (min: number, max: number): number =>
  Math.floor(Math.random() * (max - min + 1)) + min;

function buildProspectAttributes(position: Position, rating: number): PlayerAttributes {
  const clamp = (n: number) => Math.max(40, Math.min(95, Math.round(n)));
  if (position === 'GK') {
    return {
      pac: clamp(rating - 14),
      sho: clamp(rating - 24),
      pas: clamp(rating - 6),
      dri: clamp(rating - 12),
      def: clamp(rating + 3),
      phy: clamp(rating - 2),
    };
  }
  if (position === 'CB') {
    return {
      pac: clamp(rating - 4),
      sho: clamp(rating - 18),
      pas: clamp(rating - 5),
      dri: clamp(rating - 9),
      def: clamp(rating + 4),
      phy: clamp(rating + 3),
    };
  }
  if (position === 'LB' || position === 'RB') {
    return {
      pac: clamp(rating + 5),
      sho: clamp(rating - 10),
      pas: clamp(rating - 2),
      dri: clamp(rating + 1),
      def: clamp(rating - 1),
      phy: clamp(rating - 2),
    };
  }
  if (position === 'CDM' || position === 'CM') {
    return {
      pac: clamp(rating - 3),
      sho: clamp(rating - 6),
      pas: clamp(rating + 4),
      dri: clamp(rating + 1),
      def: clamp(position === 'CDM' ? rating + 2 : rating - 4),
      phy: clamp(rating),
    };
  }
  if (position === 'CAM' || position === 'LW' || position === 'RW') {
    return {
      pac: clamp(position === 'CAM' ? rating - 1 : rating + 6),
      sho: clamp(rating - 1),
      pas: clamp(position === 'CAM' ? rating + 5 : rating),
      dri: clamp(rating + 5),
      def: clamp(rating - 24),
      phy: clamp(rating - 9),
    };
  }
  return {
    pac: clamp(rating + 4),
    sho: clamp(rating + 5),
    pas: clamp(rating - 6),
    dri: clamp(rating + 2),
    def: clamp(rating - 27),
    phy: clamp(rating - 1),
  };
}

function estimateProspectValueM(rating: number, potential: number, age: number): number {
  let base = 0.05;
  if (rating <= 64) {
    base = 0.05 + Math.max(0, rating - 60) * 0.025; // 60: 0.05, 64: 0.15
  } else if (rating <= 68) {
    base = 0.15 + (rating - 64) * 0.05; // 65: 0.20, 68: 0.35
  } else if (rating <= 72) {
    base = 0.40 + (rating - 68) * 0.10; // 69: 0.50, 72: 0.80
  } else {
    base = 0.90 + (rating - 72) * 0.15; // 73+: 1.05...
  }
  const potBonus = Math.max(0, potential - 82) * 0.02;
  const ageFactor = age <= 16 ? 1.15 : age === 17 ? 1.05 : 1.0;
  const total = (base + potBonus) * ageFactor;
  return Number(Math.max(0.05, Math.min(2.0, total)).toFixed(2));
}

export function generateAcademyProspect(
  clubId: string,
  season: string,
  academyLevel: 1 | 2 | 3,
  preferredPos?: Position
): YouthProspect {
  const position = preferredPos ?? pick(POSITIONS_POOL);
  const homeCountry = CLUB_PRIMARY_COUNTRY[clubId];
  const useHomePool = homeCountry && Math.random() < 0.45;
  const pool =
    (useHomePool
      ? YOUTH_NATION_POOLS.find((n) => n.nationality === homeCountry)
      : undefined) ?? pick(YOUTH_NATION_POOLS);

  const first = pick(pool.firstNames);
  const last = pick(pool.lastNames);
  const fullName = `${first} ${last}`;
  const lastParts = last.split(' ');
  const shortName =
    pool.nationality === 'Việt Nam'
      ? `${first.slice(0, 1)}. ${last}`
      : lastParts[lastParts.length - 1] || last;

  const baseOvrMin = academyLevel === 3 ? 68 : academyLevel === 2 ? 65 : 62;
  const baseOvrMax = academyLevel === 3 ? 73 : academyLevel === 2 ? 70 : 67;
  const rating = randInt(baseOvrMin, baseOvrMax);

  const potMin = academyLevel === 3 ? 88 : academyLevel === 2 ? 85 : 82;
  const potMax = academyLevel === 3 ? 94 : academyLevel === 2 ? 91 : 88;
  const potential = Math.max(rating + 12, randInt(potMin, potMax));
  const age = randInt(16, 18);

  const hairStyles: Player['appearance']['hairStyle'][] = ['short', 'fade', 'curly', 'buzz'];

  return {
    id: `youth-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
    name: fullName,
    shortName,
    position,
    secondaryPos: SECONDARY_POS[position],
    age,
    nationality: pool.nationality,
    flagCode: pool.flagCode,
    rating,
    potential,
    trainingPoints: randInt(10, 35),
    totalTrainedLevels: 0,
    scoutedSeason: season,
    archetype: pick(ARCHETYPES[position]),
    estimatedValueM: estimateProspectValueM(rating, potential, age),
    attributes: buildProspectAttributes(position, rating),
    appearance: {
      skin: pick(pool.skinTones),
      hair: pick(pool.hairColors),
      hairStyle: pick(hairStyles),
    },
  };
}

export function getAcademyUpgradeCostM(currentLevel: 1 | 2 | 3): number {
  if (currentLevel === 1) return 12;
  if (currentLevel === 2) return 24;
  return 0;
}

export function getExtraScoutCostM(level: 1 | 2 | 3): number {
  return Number((3.5 + (level - 1) * 1.5).toFixed(1));
}

export function getProspectIntensiveTrainCostM(prospect: YouthProspect): number {
  return Number((0.3 + Math.max(0, prospect.rating - 64) * 0.05).toFixed(2));
}

export function ensureYouthAcademy(career: CareerSave): YouthAcademyState {
  const existing = career.youthAcademy;
  if (existing && Array.isArray(existing.prospects)) {
    return {
      level: existing.level === 3 ? 3 : existing.level === 2 ? 2 : 1,
      prospects: existing.prospects.slice(0, 8),
      lastIntakeSeason: existing.lastIntakeSeason || career.season,
      extraScoutedSeason: existing.extraScoutedSeason,
      promotedCount: Math.max(0, existing.promotedCount || 0),
      releasedCount: Math.max(0, existing.releasedCount || 0),
    };
  }

  const starters: Position[] = ['ST', 'CM', 'CB'];
  const initialProspects = starters.map((pos) =>
    generateAcademyProspect(career.clubId, career.season, 1, pos)
  );
  return {
    level: 1,
    prospects: initialProspects,
    lastIntakeSeason: career.season,
    promotedCount: 0,
    releasedCount: 0,
  };
}

function applyTrainingPointsToProspect(
  prospect: YouthProspect,
  xpGain: number
): YouthProspect {
  const maxAcademyOvr = Math.min(79, prospect.potential - 7);
  if (prospect.rating >= maxAcademyOvr) {
    return {
      ...prospect,
      trainingPoints: 100,
    };
  }

  let xp = prospect.trainingPoints + xpGain;
  let nextRating = prospect.rating;
  let levelsGained = 0;
  let nextAttrs = { ...prospect.attributes };

  while (xp >= 100 && nextRating < maxAcademyOvr) {
    xp -= 100;
    nextRating += 1;
    levelsGained += 1;
    nextAttrs = buildProspectAttributes(prospect.position, nextRating);
  }

  if (nextRating >= maxAcademyOvr) {
    xp = 100;
  }

  return {
    ...prospect,
    rating: nextRating,
    trainingPoints: xp,
    totalTrainedLevels: prospect.totalTrainedLevels + levelsGained,
    estimatedValueM: estimateProspectValueM(nextRating, prospect.potential, prospect.age),
    attributes: nextAttrs,
  };
}

export function advanceAcademyOnMatch(
  career: CareerSave
): { nextAcademy: YouthAcademyState; leveledUpNames: string[] } {
  const academy = ensureYouthAcademy(career);
  const xpBase = academy.level === 3 ? 28 : academy.level === 2 ? 22 : 16;
  const focusBonus = career.trainingIntensity === 'intense' ? 6 : career.trainingIntensity === 'light' ? -2 : 2;
  const leveledUpNames: string[] = [];

  const nextProspects = academy.prospects.map((p) => {
    const updated = applyTrainingPointsToProspect(p, Math.max(10, xpBase + focusBonus + randInt(0, 6)));
    if (updated.rating > p.rating) {
      leveledUpNames.push(`${updated.shortName} (${updated.rating} OVR)`);
    }
    return updated;
  });

  return {
    nextAcademy: {
      ...academy,
      prospects: nextProspects,
    },
    leveledUpNames,
  };
}

export function trainAcademyProspectIntensive(
  academy: YouthAcademyState,
  prospectId: string
): { nextAcademy: YouthAcademyState; prospect?: YouthProspect; leveledUp: boolean } {
  let targetAfter: YouthProspect | undefined;
  let leveledUp = false;

  const nextProspects = academy.prospects.map((p) => {
    if (p.id !== prospectId) return p;
    const xpGain = academy.level === 3 ? 60 : academy.level === 2 ? 52 : 45;
    const updated = applyTrainingPointsToProspect(p, xpGain);
    leveledUp = updated.rating > p.rating;
    targetAfter = updated;
    return updated;
  });

  return {
    nextAcademy: {
      ...academy,
      prospects: nextProspects,
    },
    prospect: targetAfter,
    leveledUp,
  };
}

export function advanceAcademyOnNewSeason(
  prevAcademy: YouthAcademyState | undefined,
  clubId: string,
  nextSeason: string
): YouthAcademyState {
  const base: YouthAcademyState = prevAcademy
    ? {
        ...prevAcademy,
        prospects: [...prevAcademy.prospects],
      }
    : {
        level: 1,
        prospects: [],
        lastIntakeSeason: nextSeason,
        promotedCount: 0,
        releasedCount: 0,
      };

  // Age existing academy prospects +1 year and give preseason growth; graduates above 19 retire from youth ranks
  const aged = base.prospects
    .map((p) => {
      const nextAge = p.age + 1;
      const grown = applyTrainingPointsToProspect(p, 55);
      return {
        ...grown,
        age: nextAge,
        estimatedValueM: estimateProspectValueM(grown.rating, grown.potential, nextAge),
      };
    })
    .filter((p) => p.age <= 19)
    .slice(0, 4);

  const intakeCount = Math.min(6 - aged.length, base.level >= 2 ? 3 : 2);
  const newIntakes: YouthProspect[] = [];
  for (let i = 0; i < intakeCount; i++) {
    newIntakes.push(generateAcademyProspect(clubId, nextSeason, base.level));
  }

  return {
    ...base,
    prospects: [...newIntakes, ...aged].slice(0, 6),
    lastIntakeSeason: nextSeason,
  };
}

export function buildPromotedPlayerFromProspect(
  prospect: YouthProspect,
  career: CareerSave
): Player {
  const seasonStartYear = Number(career.season.slice(0, 4)) || 2026;
  const usedNumbers = new Set(career.squad.map((p) => p.number));
  let jersey = 30;
  while (usedNumbers.has(jersey) && jersey < 99) {
    jersey++;
  }
  const wageK = Math.max(3, Math.round((prospect.rating - 58) * 1.5));
  return {
    id: `grad-${prospect.id}`,
    name: prospect.name,
    shortName: prospect.shortName,
    clubId: career.clubId,
    position: prospect.position,
    secondaryPos: prospect.secondaryPos,
    number: jersey,
    age: prospect.age,
    nationality: prospect.nationality,
    flagCode: prospect.flagCode,
    rating: prospect.rating,
    baseRating: prospect.rating,
    potential: prospect.potential,
    stars: 1,
    cardTier: 'standard',
    marketValueM: prospect.estimatedValueM,
    wageK,
    contractUntil: seasonStartYear + 4,
    fitness: 98,
    morale: 92,
    form: 7.4,
    goals: 0,
    assists: 0,
    appearances: 0,
    transferStatus: 'available',
    role: DEFAULT_ROLE_FOR_POS[prospect.position],
    isYouthGraduate: true,
    graduatedSeason: career.season,
    attributes: { ...prospect.attributes },
    appearance: { ...prospect.appearance },
  };
}

// ---------- All-Time Club Records & Hall of Fame ----------

export function createEmptyClubRecords(): ClubRecordsState {
  return {
    totalMatches: 0,
    wins: 0,
    draws: 0,
    losses: 0,
    goalsFor: 0,
    goalsAgainst: 0,
    currentUnbeatenStreak: 0,
    longestUnbeatenStreak: 0,
    currentWinStreak: 0,
    longestWinStreak: 0,
    playerLegends: {},
    headToHead: {},
  };
}

export function needsClubRecordsBackfill(career: CareerSave): boolean {
  const cr = career.clubRecords;
  if (!cr || !cr.playerLegends || !cr.headToHead) {
    return true;
  }
  if (cr.headToHead[career.clubId]) {
    return true;
  }
  if (cr.totalMatches > 0) {
    return false;
  }

  const myRow = career.standings?.find((s) => s.clubId === career.clubId);
  if (myRow && myRow.played > 0) return true;
  if (
    career.fixtures?.some(
      (f) => f.played && (f.homeClubId === career.clubId || f.awayClubId === career.clubId)
    )
  ) {
    return true;
  }
  if (
    career.competitions?.championsCup?.matches?.some(
      (m) => m.played && (m.homeClubId === career.clubId || m.awayClubId === career.clubId)
    )
  ) {
    return true;
  }
  if (
    career.competitions?.nationalCup?.matches?.some(
      (m) => m.played && (m.homeClubId === career.clubId || m.awayClubId === career.clubId)
    )
  ) {
    return true;
  }
  const sc = career.competitions?.superCup?.match;
  if (sc?.played && (sc.homeClubId === career.clubId || sc.awayClubId === career.clubId)) {
    return true;
  }
  if (
    (career.recentResults ?? []).some(
      (r) =>
        r.competition !== 'friendly' &&
        (r.homeClubId === career.clubId || r.awayClubId === career.clubId)
    )
  ) {
    return true;
  }
  if (career.squad?.some((p) => p.appearances > 0 || p.goals > 0 || p.assists > 0)) {
    return true;
  }
  if ((career.seasonHistory?.length ?? 0) > 0) {
    return true;
  }
  return false;
}

export function ensureClubRecords(career: CareerSave): ClubRecordsState {
  const existing = career.clubRecords;
  if (
    existing &&
    existing.playerLegends &&
    existing.headToHead &&
    !needsClubRecordsBackfill(career)
  ) {
    return existing;
  }

  // If existing records had real opponent H2H alongside a bogus self-entry, strip only the bogus self-entry
  if (existing && existing.playerLegends && existing.headToHead && existing.headToHead[career.clubId]) {
    const otherOppKeys = Object.keys(existing.headToHead).filter((id) => id !== career.clubId);
    if (otherOppKeys.length > 0 && existing.totalMatches > existing.headToHead[career.clubId].played) {
      const selfEntry = existing.headToHead[career.clubId];
      const cleanedH2H = { ...existing.headToHead };
      delete cleanedH2H[career.clubId];
      return {
        ...existing,
        totalMatches: Math.max(0, existing.totalMatches - selfEntry.played),
        wins: Math.max(0, existing.wins - selfEntry.won),
        draws: Math.max(0, existing.draws - selfEntry.drawn),
        losses: Math.max(0, existing.losses - selfEntry.lost),
        goalsFor: Math.max(0, existing.goalsFor - selfEntry.gf),
        goalsAgainst: Math.max(0, existing.goalsAgainst - selfEntry.ga),
        headToHead: cleanedH2H,
      };
    }
  }

  // Backfill cleanly from current season squad, leaderboards, fixtures, cups, recentResults & standings
  const myRow = career.standings?.find((s) => s.clubId === career.clubId);

  const motmByPlayerId = new Map<string, number>();
  const leaderboards = career.competitions?.leaderboards;
  if (leaderboards) {
    for (const compKey of ['league', 'champions-cup', 'national-cup', 'super-cup'] as const) {
      for (const row of leaderboards[compKey] ?? []) {
        if (row.clubId === career.clubId && (row.motmCount ?? 0) > 0) {
          motmByPlayerId.set(
            row.playerId,
            (motmByPlayerId.get(row.playerId) ?? 0) + (row.motmCount ?? 0)
          );
        }
      }
    }
  }

  const playerLegends: Record<string, ClubPlayerCareerRecord> = {};
  for (const p of career.squad ?? []) {
    const motmCount = motmByPlayerId.get(p.id) ?? 0;
    if (p.appearances > 0 || p.goals > 0 || p.assists > 0 || motmCount > 0) {
      playerLegends[p.id] = {
        playerId: p.id,
        playerName: p.name,
        shortName: p.shortName,
        position: p.position,
        nationality: p.nationality,
        flagCode: p.flagCode,
        isYouthGraduate: p.isYouthGraduate,
        cardTier: p.cardTier,
        seasonsActive: [career.season],
        appearances: p.appearances,
        goals: p.goals,
        assists: p.assists,
        motmCount,
        peakRating: p.rating,
      };
    }
  }

  interface BackfillMatch {
    id: string;
    compKey: string;
    competitionLabel: string;
    matchweek: number;
    sortOrder: number;
    homeClubId: string;
    awayClubId: string;
    oppId: string;
    gf: number;
    ga: number;
    won: boolean;
    drawn: boolean;
  }

  const collected: BackfillMatch[] = [];
  const seenIds = new Set<string>();
  const seenSignatures = new Set<string>();

  const pushMatch = (m: BackfillMatch) => {
    if (!m.oppId || m.oppId === career.clubId) return;
    if (seenIds.has(m.id)) return;
    const sig = `${m.compKey}:${m.homeClubId}:${m.awayClubId}:${m.gf}:${m.ga}`;
    if (m.compKey !== 'league' && seenSignatures.has(sig)) return;
    const leagueSig = `${m.compKey}:${m.matchweek}:${m.homeClubId}:${m.awayClubId}:${m.gf}:${m.ga}`;
    if (m.compKey === 'league' && seenSignatures.has(leagueSig)) return;

    seenIds.add(m.id);
    seenSignatures.add(m.compKey === 'league' ? leagueSig : sig);
    collected.push(m);
  };

  const scMatch = career.competitions?.superCup?.match;
  if (
    scMatch?.played &&
    (scMatch.homeClubId === career.clubId || scMatch.awayClubId === career.clubId) &&
    typeof scMatch.homeGoals === 'number' &&
    typeof scMatch.awayGoals === 'number'
  ) {
    const isHome = scMatch.homeClubId === career.clubId;
    const gf = isHome ? scMatch.homeGoals : scMatch.awayGoals;
    const ga = isHome ? scMatch.awayGoals : scMatch.homeGoals;
    const oppId = isHome ? scMatch.awayClubId : scMatch.homeClubId;
    const won = scMatch.winnerId ? scMatch.winnerId === career.clubId : gf > ga;
    const drawn = !scMatch.winnerId && gf === ga;
    pushMatch({
      id: scMatch.id,
      compKey: 'super-cup',
      competitionLabel: 'Siêu Cúp',
      matchweek: 1,
      sortOrder: 0,
      homeClubId: scMatch.homeClubId,
      awayClubId: scMatch.awayClubId,
      oppId,
      gf,
      ga,
      won,
      drawn,
    });
  }

  for (const f of career.fixtures ?? []) {
    if (!f.played || typeof f.homeGoals !== 'number' || typeof f.awayGoals !== 'number') continue;
    if (f.homeClubId !== career.clubId && f.awayClubId !== career.clubId) continue;
    const isHome = f.homeClubId === career.clubId;
    const gf = isHome ? f.homeGoals : f.awayGoals;
    const ga = isHome ? f.awayGoals : f.homeGoals;
    const oppId = isHome ? f.awayClubId : f.homeClubId;
    pushMatch({
      id: f.id,
      compKey: 'league',
      competitionLabel: 'Super League',
      matchweek: f.matchweek,
      sortOrder: 10 + f.matchweek * 10,
      homeClubId: f.homeClubId,
      awayClubId: f.awayClubId,
      oppId,
      gf,
      ga,
      won: gf > ga,
      drawn: gf === ga,
    });
  }

  for (const m of career.competitions?.championsCup?.matches ?? []) {
    if (!m.played || typeof m.homeGoals !== 'number' || typeof m.awayGoals !== 'number') continue;
    if (m.homeClubId !== career.clubId && m.awayClubId !== career.clubId) continue;
    const isHome = m.homeClubId === career.clubId;
    const gf = isHome ? m.homeGoals : m.awayGoals;
    const ga = isHome ? m.awayGoals : m.homeGoals;
    const oppId = isHome ? m.awayClubId : m.homeClubId;
    const won = m.winnerId ? m.winnerId === career.clubId : gf > ga;
    const drawn = !m.winnerId && gf === ga;
    pushMatch({
      id: m.id,
      compKey: 'champions-cup',
      competitionLabel: 'Champions Cup',
      matchweek: m.round,
      sortOrder: 1000 + m.round * 10,
      homeClubId: m.homeClubId,
      awayClubId: m.awayClubId,
      oppId,
      gf,
      ga,
      won,
      drawn,
    });
  }

  for (const m of career.competitions?.nationalCup?.matches ?? []) {
    if (!m.played || typeof m.homeGoals !== 'number' || typeof m.awayGoals !== 'number') continue;
    if (m.homeClubId !== career.clubId && m.awayClubId !== career.clubId) continue;
    const isHome = m.homeClubId === career.clubId;
    const gf = isHome ? m.homeGoals : m.awayGoals;
    const ga = isHome ? m.awayGoals : m.homeGoals;
    const oppId = isHome ? m.awayClubId : m.homeClubId;
    const won = m.winnerId ? m.winnerId === career.clubId : gf > ga;
    const drawn = !m.winnerId && gf === ga;
    pushMatch({
      id: m.id,
      compKey: 'national-cup',
      competitionLabel: 'Cúp Quốc Gia',
      matchweek: m.round,
      sortOrder: 2000 + m.round * 10,
      homeClubId: m.homeClubId,
      awayClubId: m.awayClubId,
      oppId,
      gf,
      ga,
      won,
      drawn,
    });
  }

  for (const res of [...(career.recentResults ?? [])].reverse()) {
    if (res.competition === 'friendly') continue;
    const isHome = res.homeClubId === career.clubId;
    const isAway = res.awayClubId === career.clubId;
    if (!isHome && !isAway) continue;
    const oppId = isHome ? res.awayClubId : res.homeClubId;
    const gf = isHome ? res.homeGoals : res.awayGoals;
    const ga = isHome ? res.awayGoals : res.homeGoals;
    const won = res.winnerId ? res.winnerId === career.clubId : gf > ga;
    const drawn = !res.winnerId && gf === ga;
    const compKey = res.competition ?? 'league';
    const compLabel =
      res.roundLabel ||
      (compKey === 'champions-cup'
        ? 'Champions Cup'
        : compKey === 'national-cup'
          ? 'Cúp Quốc Gia'
          : compKey === 'super-cup'
            ? 'Siêu Cúp'
            : 'Super League');
    pushMatch({
      id: res.id,
      compKey,
      competitionLabel: compLabel,
      matchweek: res.matchweek,
      sortOrder: 3000 + res.matchweek,
      homeClubId: res.homeClubId,
      awayClubId: res.awayClubId,
      oppId,
      gf,
      ga,
      won,
      drawn,
    });
  }

  collected.sort((a, b) => a.sortOrder - b.sortOrder);

  const headToHead: Record<string, ClubHeadToHeadRecord> = {};
  let biggestWin = createEmptyClubRecords().biggestWin;
  let highestScoringMatch = createEmptyClubRecords().highestScoringMatch;
  let totalMatches = 0;
  let wins = 0;
  let draws = 0;
  let losses = 0;
  let goalsFor = 0;
  let goalsAgainst = 0;
  let currentUnbeatenStreak = 0;
  let longestUnbeatenStreak = 0;
  let currentWinStreak = 0;
  let longestWinStreak = 0;

  for (const m of collected) {
    const lost = !m.won && !m.drawn;
    totalMatches += 1;
    if (m.won) wins += 1;
    else if (m.drawn) draws += 1;
    else losses += 1;
    goalsFor += m.gf;
    goalsAgainst += m.ga;

    currentUnbeatenStreak = lost ? 0 : currentUnbeatenStreak + 1;
    longestUnbeatenStreak = Math.max(longestUnbeatenStreak, currentUnbeatenStreak);
    currentWinStreak = m.won ? currentWinStreak + 1 : 0;
    longestWinStreak = Math.max(longestWinStreak, currentWinStreak);

    const curH2H = headToHead[m.oppId] ?? {
      opponentClubId: m.oppId,
      played: 0,
      won: 0,
      drawn: 0,
      lost: 0,
      gf: 0,
      ga: 0,
    };
    headToHead[m.oppId] = {
      ...curH2H,
      played: curH2H.played + 1,
      won: curH2H.won + (m.won ? 1 : 0),
      drawn: curH2H.drawn + (m.drawn ? 1 : 0),
      lost: curH2H.lost + (lost ? 1 : 0),
      gf: curH2H.gf + m.gf,
      ga: curH2H.ga + m.ga,
    };

    const margin = m.gf - m.ga;
    if (
      m.won &&
      (!biggestWin ||
        margin > biggestWin.margin ||
        (margin === biggestWin.margin &&
          m.gf > Number(biggestWin.scoreText.split('-')[0] || 0)))
    ) {
      biggestWin = {
        matchId: m.id,
        opponentClubId: m.oppId,
        scoreText: `${m.gf}-${m.ga}`,
        margin,
        competitionLabel: m.competitionLabel,
        season: career.season,
        matchweek: m.matchweek,
      };
    }

    if (
      !highestScoringMatch ||
      m.gf + m.ga >
        Number(highestScoringMatch.scoreText.split('-')[0] || 0) +
          Number(highestScoringMatch.scoreText.split('-')[1] || 0)
    ) {
      highestScoringMatch = {
        matchId: m.id,
        opponentClubId: m.oppId,
        scoreText: `${m.gf}-${m.ga}`,
        margin,
        competitionLabel: m.competitionLabel,
        season: career.season,
        matchweek: m.matchweek,
      };
    }
  }

  if (totalMatches === 0 && myRow && myRow.played > 0) {
    totalMatches = myRow.played;
    wins = myRow.won;
    draws = myRow.drawn;
    losses = myRow.lost;
    goalsFor = myRow.gf;
    goalsAgainst = myRow.ga;
    longestUnbeatenStreak = myRow.won ? Math.min(myRow.won + myRow.drawn, 3) : 0;
    longestWinStreak = myRow.won ? Math.min(myRow.won, 2) : 0;
  }

  const squadValueM = Number(
    (career.squad ?? []).reduce((sum, p) => sum + p.marketValueM, 0).toFixed(1)
  );
  const avgOvr = Math.round(
    (career.squad ?? []).reduce((sum, p) => sum + p.rating, 0) /
      Math.max(1, (career.squad ?? []).length)
  );

  return {
    totalMatches,
    wins,
    draws,
    losses,
    goalsFor,
    goalsAgainst,
    currentUnbeatenStreak,
    longestUnbeatenStreak,
    currentWinStreak,
    longestWinStreak,
    ...(biggestWin ? { biggestWin } : {}),
    ...(highestScoringMatch ? { highestScoringMatch } : {}),
    playerLegends,
    headToHead,
    peakSquadValueM: squadValueM,
    peakSquadOvr: avgOvr,
  };
}

export function recordOfficialMatchInClubRecords(
  prevCareer: CareerSave,
  params: {
    matchId: string;
    opponentClubId: string;
    myGoals: number;
    oppGoals: number;
    won: boolean;
    drawn: boolean;
    competitionLabel: string;
    matchweek: number;
    participatedPlayerIds: Set<string>;
    goalEvents: MatchEvent[];
    playerRatings?: MatchPlayerRating[];
    motmPlayerId?: string;
    nextSquad: Player[];
  }
): ClubRecordsState {
  const prev = ensureClubRecords(prevCareer);
  const {
    matchId,
    opponentClubId,
    myGoals,
    oppGoals,
    won,
    drawn,
    competitionLabel,
    matchweek,
    participatedPlayerIds,
    goalEvents,
    playerRatings,
    motmPlayerId,
    nextSquad,
  } = params;

  if (!opponentClubId || opponentClubId === prevCareer.clubId) {
    return prev;
  }

  const lost = !won && !drawn;
  const nextUnbeaten = lost ? 0 : prev.currentUnbeatenStreak + 1;
  const nextWinStreak = won ? prev.currentWinStreak + 1 : 0;

  const margin = myGoals - oppGoals;
  let biggestWin = prev.biggestWin;
  if (won) {
    const prevTopGf = biggestWin ? Number(biggestWin.scoreText.split('-')[0] || 0) : -1;
    if (
      !biggestWin ||
      margin > biggestWin.margin ||
      (margin === biggestWin.margin && myGoals > prevTopGf)
    ) {
      biggestWin = {
        matchId,
        opponentClubId,
        scoreText: `${myGoals}-${oppGoals}`,
        margin,
        competitionLabel,
        season: prevCareer.season,
        matchweek,
      };
    }
  }

  let highestScoringMatch = prev.highestScoringMatch;
  const prevHighestTotal = highestScoringMatch
    ? Number(highestScoringMatch.scoreText.split('-')[0] || 0) +
      Number(highestScoringMatch.scoreText.split('-')[1] || 0)
    : -1;
  if (!highestScoringMatch || myGoals + oppGoals > prevHighestTotal) {
    highestScoringMatch = {
      matchId,
      opponentClubId,
      scoreText: `${myGoals}-${oppGoals}`,
      margin,
      competitionLabel,
      season: prevCareer.season,
      matchweek,
    };
  }

  const nextH2H = { ...prev.headToHead };
  const curOpp = nextH2H[opponentClubId] ?? {
    opponentClubId,
    played: 0,
    won: 0,
    drawn: 0,
    lost: 0,
    gf: 0,
    ga: 0,
  };
  nextH2H[opponentClubId] = {
    ...curOpp,
    played: curOpp.played + 1,
    won: curOpp.won + (won ? 1 : 0),
    drawn: curOpp.drawn + (drawn ? 1 : 0),
    lost: curOpp.lost + (lost ? 1 : 0),
    gf: curOpp.gf + myGoals,
    ga: curOpp.ga + oppGoals,
  };

  const nextLegends: Record<string, ClubPlayerCareerRecord> = { ...prev.playerLegends };
  const ratingMap = new Map(
    (playerRatings ?? [])
      .filter((r) => r.clubId === prevCareer.clubId)
      .map((r) => [r.playerId, r.rating])
  );

  for (const p of nextSquad) {
    const played = participatedPlayerIds.has(p.id);
    const scored = goalEvents.filter((e) =>
      e.playerId ? e.playerId === p.id : e.playerName === p.name
    ).length;
    const assisted = goalEvents.filter((e) =>
      e.assistId ? e.assistId === p.id : e.assistName === p.shortName
    ).length;
    const isMotm = motmPlayerId ? motmPlayerId === p.id : false;

    if (!played && scored === 0 && assisted === 0 && !nextLegends[p.id]) {
      continue;
    }

    const existing = nextLegends[p.id];
    const seasonsSet = new Set(existing?.seasonsActive ?? []);
    if (played || scored > 0 || assisted > 0) {
      seasonsSet.add(prevCareer.season);
    }
    const ratingThisMatch = ratingMap.get(p.id) ?? 0;

    nextLegends[p.id] = {
      playerId: p.id,
      playerName: p.name,
      shortName: p.shortName,
      position: p.position,
      nationality: p.nationality,
      flagCode: p.flagCode,
      isYouthGraduate: p.isYouthGraduate ?? existing?.isYouthGraduate,
      cardTier: p.cardTier ?? existing?.cardTier,
      seasonsActive: Array.from(seasonsSet),
      appearances: (existing?.appearances ?? 0) + (played ? 1 : 0),
      goals: (existing?.goals ?? 0) + scored,
      assists: (existing?.assists ?? 0) + assisted,
      motmCount: (existing?.motmCount ?? 0) + (isMotm ? 1 : 0),
      peakRating: Math.max(existing?.peakRating ?? p.rating, p.rating, ratingThisMatch >= 9.5 ? p.rating : 0),
    };
  }

  const squadValueM = Number(nextSquad.reduce((sum, p) => sum + p.marketValueM, 0).toFixed(1));
  const squadOvr = Math.round(
    nextSquad.reduce((sum, p) => sum + p.rating, 0) / Math.max(1, nextSquad.length)
  );

  return {
    totalMatches: prev.totalMatches + 1,
    wins: prev.wins + (won ? 1 : 0),
    draws: prev.draws + (drawn ? 1 : 0),
    losses: prev.losses + (lost ? 1 : 0),
    goalsFor: prev.goalsFor + myGoals,
    goalsAgainst: prev.goalsAgainst + oppGoals,
    currentUnbeatenStreak: nextUnbeaten,
    longestUnbeatenStreak: Math.max(prev.longestUnbeatenStreak, nextUnbeaten),
    currentWinStreak: nextWinStreak,
    longestWinStreak: Math.max(prev.longestWinStreak, nextWinStreak),
    ...(biggestWin ? { biggestWin } : {}),
    ...(highestScoringMatch ? { highestScoringMatch } : {}),
    playerLegends: nextLegends,
    headToHead: nextH2H,
    peakSquadValueM: Math.max(prev.peakSquadValueM ?? 0, squadValueM),
    peakSquadOvr: Math.max(prev.peakSquadOvr ?? 0, squadOvr),
  };
}

export function getClubShortName(clubId: string): string {
  return CLUBS.find((c) => c.id === clubId)?.shortName ?? clubId;
}
