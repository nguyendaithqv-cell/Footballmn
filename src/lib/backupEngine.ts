import { CLUBS } from '../data/footballDatabase';
import {
  ArenaProfile,
  CareerSave,
  FormationId,
  MarketOverride,
  NewsArticle,
  PushNotificationItem,
  RankTierId,
  UserProfile,
} from '../types/game';
import { ensureCareerCompetitions } from './careerEngine';
import { normalizeInventory } from './inventoryEngine';

export const BACKUP_FORMAT = 'touchline-xi-backup' as const;
export const BACKUP_VERSION = 1 as const;

const VALID_FORMATIONS: FormationId[] = ['4-3-3', '4-2-3-1', '3-4-2-1', '3-5-2', '4-4-2', '5-3-2'];
const VALID_RANK_TIERS: RankTierId[] = [
  'dong',
  'bac',
  'vang',
  'bach_kim',
  'kim_cuong',
  'tinh_anh',
  'cao_thu',
  'chien_tuong',
  'thach_dau',
];
const VALID_INTENSITIES: CareerSave['trainingIntensity'][] = ['light', 'balanced', 'intense'];
const VALID_FOCUSES: CareerSave['trainingFocus'][] = [
  'Tactical',
  'Attacking',
  'Defending',
  'Physical',
  'Recovery',
];

export interface BackupProfileData {
  managerName: string;
  nationality: string;
  clubId: string;
  clubName: string;
  preferredFormation: FormationId;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  trophies: number;
}

export interface BackupArenaRankData {
  rankTier: RankTierId;
  rankDivision: number;
  rankStars: number;
  bravePoints: number;
  eloPoints: number;
  winStreak: number;
  highestRankIndex: number;
  matchesPlayed: number;
  wins: number;
  draws: number;
  losses: number;
  tournamentTitles: number;
}

export interface BackupAdminData {
  news?: NewsArticle[];
  marketOverrides?: MarketOverride[];
  notifications?: PushNotificationItem[];
}

export interface ClubBackupBundle {
  format: typeof BACKUP_FORMAT;
  version: number;
  exportedAt: string;
  sourceUid?: string;
  profile: BackupProfileData;
  career: CareerSave;
  arenaRank?: BackupArenaRankData;
  adminData?: BackupAdminData;
}

export interface BackupSummary {
  managerName: string;
  clubName: string;
  clubId: string;
  season: string;
  matchweek: number;
  transferBudget: number;
  squadCount: number;
  trophyCount: number;
  exportedAt: string;
  hasArenaRank: boolean;
  adminItemsCount: number;
}

export function sanitizeForFirestore(val: unknown): unknown {
  if (val === null || typeof val !== 'object') return val;
  if (Array.isArray(val)) return val.map((item) => sanitizeForFirestore(item));
  const proto = Object.getPrototypeOf(val);
  if (proto !== Object.prototype && proto !== null) {
    // Preserve Firestore FieldValue sentinels (e.g. serverTimestamp) and Date instances
    return val;
  }
  const clean: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    if (v !== undefined) {
      clean[k] = sanitizeForFirestore(v);
    }
  }
  return clean;
}

function serializeForJson(val: unknown): unknown {
  if (val === null || val === undefined) return undefined;
  if (typeof val !== 'object') return val;
  if (Array.isArray(val)) {
    return val.map((item) => serializeForJson(item)).filter((item) => item !== undefined);
  }
  const maybeTs = val as { toMillis?: () => number; seconds?: number; nanoseconds?: number };
  if (typeof maybeTs.toMillis === 'function') {
    return maybeTs.toMillis();
  }
  if (
    typeof maybeTs.seconds === 'number' &&
    typeof maybeTs.nanoseconds === 'number' &&
    Object.keys(val).length <= 2
  ) {
    return maybeTs.seconds * 1000 + Math.floor(maybeTs.nanoseconds / 1_000_000);
  }
  const proto = Object.getPrototypeOf(val);
  if (proto !== Object.prototype && proto !== null) {
    return undefined;
  }
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
    const serialized = serializeForJson(v);
    if (serialized !== undefined) {
      out[k] = serialized;
    }
  }
  return out;
}

const clampInt = (n: unknown, min: number, max: number, fallback: number): number => {
  const num = typeof n === 'number' && Number.isFinite(n) ? Math.round(n) : fallback;
  return Math.max(min, Math.min(max, num));
};

const clampNum = (n: unknown, min: number, max: number, fallback: number): number => {
  const num = typeof n === 'number' && Number.isFinite(n) ? n : fallback;
  return Math.max(min, Math.min(max, Number(num.toFixed(2))));
};

export function buildCompactCareerForStorage(rawCareer: CareerSave, targetUid: string): CareerSave {
  const hydrated = ensureCareerCompetitions(rawCareer);
  const safeClubId =
    typeof hydrated.clubId === 'string' && hydrated.clubId.trim()
      ? hydrated.clubId.trim().slice(0, 64)
      : CLUBS[0].id;

  const compactFixtures = (Array.isArray(hydrated.fixtures) ? hydrated.fixtures : []).slice(0, 450);

  const compactRecentResults = (Array.isArray(hydrated.recentResults) ? hydrated.recentResults : [])
    .slice(0, 60);

  const safeFormation = VALID_FORMATIONS.includes(hydrated.tactics?.formation)
    ? hydrated.tactics.formation
    : '4-2-3-1';

  const safeSquad = (Array.isArray(hydrated.squad) ? hydrated.squad : []).slice(0, 45);
  const safeStandings = (Array.isArray(hydrated.standings) ? hydrated.standings : []).slice(0, 30);

  return {
    ...hydrated,
    uid: targetUid,
    clubId: safeClubId,
    season: String(hydrated.season || '2026/27').slice(0, 16),
    matchweek: clampInt(hydrated.matchweek, 1, 80, 1),
    transferBudget: clampNum(hydrated.transferBudget, 0, 5000, 50),
    wageBudget: clampNum(hydrated.wageBudget, 0, 50000, 1500),
    boardConfidence: clampInt(hydrated.boardConfidence, 0, 100, 75),
    fanSupport: clampInt(hydrated.fanSupport, 0, 100, 75),
    trainingFocus: VALID_FOCUSES.includes(hydrated.trainingFocus)
      ? hydrated.trainingFocus
      : 'Tactical',
    trainingIntensity: VALID_INTENSITIES.includes(hydrated.trainingIntensity)
      ? hydrated.trainingIntensity
      : 'balanced',
    tactics: {
      ...hydrated.tactics,
      formation: safeFormation,
    },
    squad: safeSquad,
    standings: safeStandings,
    fixtures: compactFixtures,
    recentResults: compactRecentResults,
    transferHistory: (hydrated.transferHistory ?? []).slice(0, 200),
    managerHistory: (hydrated.managerHistory ?? []).slice(0, 100),
    seasonAwards: (hydrated.seasonAwards ?? []).slice(0, 120),
    trophyCabinet: (hydrated.trophyCabinet ?? []).slice(0, 120),
    seasonHistory: (hydrated.seasonHistory ?? []).slice(0, 50),
    boardObjectives: (hydrated.boardObjectives ?? []).slice(0, 10),
    ...(hydrated.claimedSeasonRewardSeason
      ? { claimedSeasonRewardSeason: String(hydrated.claimedSeasonRewardSeason).slice(0, 16) }
      : {}),
    ...(hydrated.settledPayrollSeason
      ? { settledPayrollSeason: String(hydrated.settledPayrollSeason).slice(0, 16) }
      : {}),
    financialLedger: (hydrated.financialLedger ?? []).slice(0, 300),
    payrollHistory: (hydrated.payrollHistory ?? []).slice(0, 50),
    inventory: normalizeInventory(hydrated.inventory),
  };
}

export function createClubBackupBundle(params: {
  profile: UserProfile;
  career: CareerSave;
  arena?: ArenaProfile | null;
  adminData?: BackupAdminData;
}): ClubBackupBundle {
  const { profile, career, arena, adminData } = params;
  const cleanCareer = serializeForJson(
    buildCompactCareerForStorage(career, profile.uid)
  ) as CareerSave;
  delete (cleanCareer as { updatedAt?: unknown }).updatedAt;

  const safeClub = CLUBS.find((c) => c.id === cleanCareer.clubId);
  const cleanProfile: BackupProfileData = {
    managerName: String(profile.managerName || 'HLV Chiến Lược').trim().slice(0, 60) || 'HLV Chiến Lược',
    nationality: String(profile.nationality || 'Việt Nam').trim().slice(0, 40) || 'Việt Nam',
    clubId: cleanCareer.clubId,
    clubName: String(profile.clubName || safeClub?.name || cleanCareer.clubId).trim().slice(0, 80),
    preferredFormation: VALID_FORMATIONS.includes(profile.preferredFormation)
      ? profile.preferredFormation
      : cleanCareer.tactics.formation,
    matchesPlayed: clampInt(profile.matchesPlayed, 0, 10000, 0),
    wins: clampInt(profile.wins, 0, 10000, 0),
    draws: clampInt(profile.draws, 0, 10000, 0),
    losses: clampInt(profile.losses, 0, 10000, 0),
    trophies: clampInt(profile.trophies, 0, 1000, cleanCareer.trophyCabinet?.length ?? 0),
  };

  const bundle: ClubBackupBundle = {
    format: BACKUP_FORMAT,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    sourceUid: profile.uid,
    profile: cleanProfile,
    career: cleanCareer,
  };

  if (arena) {
    bundle.arenaRank = {
      rankTier: VALID_RANK_TIERS.includes(arena.rankTier) ? arena.rankTier : 'dong',
      rankDivision: clampInt(arena.rankDivision, 1, 5, 3),
      rankStars: clampInt(arena.rankStars, 0, 999, 0),
      bravePoints: clampInt(arena.bravePoints, 0, 100, 20),
      eloPoints: clampInt(arena.eloPoints, 0, 10000, 1000),
      winStreak: clampInt(arena.winStreak, 0, 500, 0),
      highestRankIndex: clampInt(arena.highestRankIndex, 0, 50, 0),
      matchesPlayed: clampInt(arena.matchesPlayed, 0, 50000, 0),
      wins: clampInt(arena.wins, 0, 50000, 0),
      draws: clampInt(arena.draws, 0, 50000, 0),
      losses: clampInt(arena.losses, 0, 50000, 0),
      tournamentTitles: clampInt(arena.tournamentTitles, 0, 5000, 0),
    };
  }

  if (adminData) {
    const cleanNews = (adminData.news ?? []).map((n) => serializeForJson(n) as NewsArticle);
    const cleanOverrides = (adminData.marketOverrides ?? []).map(
      (o) => serializeForJson(o) as MarketOverride
    );
    const cleanNotifs = (adminData.notifications ?? []).map(
      (n) => serializeForJson(n) as PushNotificationItem
    );
    if (cleanNews.length > 0 || cleanOverrides.length > 0 || cleanNotifs.length > 0) {
      bundle.adminData = {
        ...(cleanNews.length > 0 ? { news: cleanNews } : {}),
        ...(cleanOverrides.length > 0 ? { marketOverrides: cleanOverrides } : {}),
        ...(cleanNotifs.length > 0 ? { notifications: cleanNotifs } : {}),
      };
    }
  }

  return bundle;
}

export function downloadBackupFile(bundle: ClubBackupBundle, filenamePrefix = 'touchline-xi-backup'): void {
  const datePart = new Date().toISOString().slice(0, 10);
  const clubPart = bundle.profile.clubId.replace(/[^a-zA-Z0-9_-]/g, '');
  const filename = `${filenamePrefix}-${clubPart}-${datePart}.json`;
  const jsonText = JSON.stringify(bundle, null, 2);
  const blob = new Blob([jsonText], { type: 'application/json;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function summarizeBackupBundle(bundle: ClubBackupBundle): BackupSummary {
  const adminItemsCount =
    (bundle.adminData?.news?.length ?? 0) +
    (bundle.adminData?.marketOverrides?.length ?? 0) +
    (bundle.adminData?.notifications?.length ?? 0);
  return {
    managerName: bundle.profile.managerName,
    clubName: bundle.profile.clubName,
    clubId: bundle.profile.clubId,
    season: bundle.career.season,
    matchweek: bundle.career.matchweek,
    transferBudget: bundle.career.transferBudget,
    squadCount: bundle.career.squad.length,
    trophyCount: bundle.career.trophyCabinet?.length ?? 0,
    exportedAt: bundle.exportedAt,
    hasArenaRank: Boolean(bundle.arenaRank),
    adminItemsCount,
  };
}

export function parseAndValidateBackup(
  rawText: string
): { ok: true; bundle: ClubBackupBundle; summary: BackupSummary } | { ok: false; error: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(rawText);
  } catch {
    return { ok: false, error: 'File không đúng định dạng JSON hợp lệ.' };
  }

  if (!parsed || typeof parsed !== 'object') {
    return { ok: false, error: 'Nội dung file sao lưu không hợp lệ.' };
  }

  const obj = parsed as Partial<ClubBackupBundle>;
  if (obj.format !== BACKUP_FORMAT) {
    return {
      ok: false,
      error: 'Đây không phải file sao lưu của Touchline XI.',
    };
  }

  if (!obj.career || typeof obj.career !== 'object' || !obj.profile || typeof obj.profile !== 'object') {
    return {
      ok: false,
      error: 'File sao lưu bị thiếu dữ liệu Hồ sơ HLV hoặc Sự nghiệp CLB.',
    };
  }

  const rawCareer = obj.career;
  if (!Array.isArray(rawCareer.squad) || rawCareer.squad.length < 11) {
    return {
      ok: false,
      error: 'Đội hình trong file sao lưu không đủ tối thiểu 11 cầu thủ.',
    };
  }
  if (!Array.isArray(rawCareer.standings) || rawCareer.standings.length < 2) {
    return {
      ok: false,
      error: 'Bảng xếp hạng trong file sao lưu bị thiếu dữ liệu.',
    };
  }

  const normalizedCareer = buildCompactCareerForStorage(rawCareer, obj.sourceUid || 'restored');
  const safeClub = CLUBS.find((c) => c.id === normalizedCareer.clubId);

  const normalizedProfile: BackupProfileData = {
    managerName:
      String(obj.profile.managerName || 'HLV Chiến Lược').trim().slice(0, 60) || 'HLV Chiến Lược',
    nationality: String(obj.profile.nationality || 'Việt Nam').trim().slice(0, 40) || 'Việt Nam',
    clubId: normalizedCareer.clubId,
    clubName: String(obj.profile.clubName || safeClub?.name || normalizedCareer.clubId)
      .trim()
      .slice(0, 80),
    preferredFormation: VALID_FORMATIONS.includes(obj.profile.preferredFormation)
      ? obj.profile.preferredFormation
      : normalizedCareer.tactics.formation,
    matchesPlayed: clampInt(obj.profile.matchesPlayed, 0, 10000, 0),
    wins: clampInt(obj.profile.wins, 0, 10000, 0),
    draws: clampInt(obj.profile.draws, 0, 10000, 0),
    losses: clampInt(obj.profile.losses, 0, 10000, 0),
    trophies: clampInt(obj.profile.trophies, 0, 1000, normalizedCareer.trophyCabinet?.length ?? 0),
  };

  if (normalizedProfile.managerName.length < 2) {
    normalizedProfile.managerName = `${normalizedProfile.managerName} XI`;
  }
  if (normalizedProfile.nationality.length < 2) {
    normalizedProfile.nationality = 'Việt Nam';
  }
  if (normalizedProfile.clubName.length < 2) {
    normalizedProfile.clubName = `${normalizedProfile.clubName} FC`;
  }

  let normalizedArena: BackupArenaRankData | undefined;
  if (obj.arenaRank && typeof obj.arenaRank === 'object') {
    normalizedArena = {
      rankTier: VALID_RANK_TIERS.includes(obj.arenaRank.rankTier) ? obj.arenaRank.rankTier : 'dong',
      rankDivision: clampInt(obj.arenaRank.rankDivision, 1, 5, 3),
      rankStars: clampInt(obj.arenaRank.rankStars, 0, 999, 0),
      bravePoints: clampInt(obj.arenaRank.bravePoints, 0, 100, 20),
      eloPoints: clampInt(obj.arenaRank.eloPoints, 0, 10000, 1000),
      winStreak: clampInt(obj.arenaRank.winStreak, 0, 500, 0),
      highestRankIndex: clampInt(obj.arenaRank.highestRankIndex, 0, 50, 0),
      matchesPlayed: clampInt(obj.arenaRank.matchesPlayed, 0, 50000, 0),
      wins: clampInt(obj.arenaRank.wins, 0, 50000, 0),
      draws: clampInt(obj.arenaRank.draws, 0, 50000, 0),
      losses: clampInt(obj.arenaRank.losses, 0, 50000, 0),
      tournamentTitles: clampInt(obj.arenaRank.tournamentTitles, 0, 5000, 0),
    };
  }

  const normalizedBundle: ClubBackupBundle = {
    format: BACKUP_FORMAT,
    version: typeof obj.version === 'number' ? obj.version : BACKUP_VERSION,
    exportedAt: typeof obj.exportedAt === 'string' ? obj.exportedAt : new Date().toISOString(),
    sourceUid: typeof obj.sourceUid === 'string' ? obj.sourceUid : undefined,
    profile: normalizedProfile,
    career: normalizedCareer,
    ...(normalizedArena ? { arenaRank: normalizedArena } : {}),
    ...(obj.adminData && typeof obj.adminData === 'object' ? { adminData: obj.adminData } : {}),
  };

  return {
    ok: true,
    bundle: normalizedBundle,
    summary: summarizeBackupBundle(normalizedBundle),
  };
}
