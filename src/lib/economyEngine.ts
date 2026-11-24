import { CareerSave, Player } from '../types/game';

export interface SponsorOffer {
  id: string;
  name: string;
  tier: 'conservative' | 'balanced' | 'ambitious';
  upfrontM: number;
  matchBonusM: number;
  targetRank?: number;
  titleBonusM?: number;
  description: string;
}

export const SPONSOR_OFFERS: SponsorOffer[] = [
  {
    id: 'sponsor_fly_emirates',
    name: 'Fly Emirates Global',
    tier: 'conservative',
    upfrontM: 4.5,
    matchBonusM: 0.25,
    description: 'Hợp đồng tài trợ an toàn, tiền lót tay cao và thưởng đều đặn mỗi trận đấu.',
  },
  {
    id: 'sponsor_nike_sport',
    name: 'Nike Football Partner',
    tier: 'balanced',
    upfrontM: 3.0,
    matchBonusM: 0.15,
    targetRank: 6,
    titleBonusM: 6.0,
    description: 'Thưởng lớn nếu CLB kết thúc mùa giải trong Top 6 đội dẫn đầu Super League.',
  },
  {
    id: 'sponsor_adidas_elite',
    name: 'Adidas Elite Crown',
    tier: 'ambitious',
    upfrontM: 1.5,
    matchBonusM: 0.1,
    targetRank: 2,
    titleBonusM: 14.0,
    description: 'Đại gia tài trợ cho ứng viên vô địch. Tiền lót tay khiêm tốn nhưng thưởng vô địch cực khủng!',
  },
];

export interface ClubFacilities {
  stadiumLevel: 1 | 2 | 3;
  medicalLevel: 1 | 2 | 3;
}

export function ensureClubFacilities(career: CareerSave): ClubFacilities {
  if (career.clubFacilities) {
    return {
      stadiumLevel: career.clubFacilities.stadiumLevel === 3 ? 3 : career.clubFacilities.stadiumLevel === 2 ? 2 : 1,
      medicalLevel: career.clubFacilities.medicalLevel === 3 ? 3 : career.clubFacilities.medicalLevel === 2 ? 2 : 1,
    };
  }
  return { stadiumLevel: 1, medicalLevel: 1 };
}

export function getStadiumUpgradeCostM(level: 1 | 2): number {
  return level === 1 ? 16 : 32;
}

export function getMedicalUpgradeCostM(level: 1 | 2): number {
  return level === 1 ? 12 : 24;
}

export function getStadiumTicketMultiplier(level: 1 | 2 | 3): number {
  if (level === 3) return 1.50; // +50% ticket revenue
  if (level === 2) return 1.25; // +25% ticket revenue
  return 1.0;
}

export function getMedicalCostMultiplier(level: 1 | 2 | 3): number {
  if (level === 3) return 0.40; // 60% discount on recovery cost
  if (level === 2) return 0.70; // 30% discount on recovery cost
  return 1.0;
}

export function getContractRenewalCostK(
  player: Player,
  years: 1 | 2 | 3 | 4 = 3
): { wageIncreaseK: number; bonusM: number; targetYears: 1 | 2 | 3 | 4 } {
  const targetYears = years;
  const wageRate = years === 1 ? 0.08 : years === 2 ? 0.12 : years === 3 ? 0.15 : 0.2;
  const bonusRate = years === 1 ? 0.04 : years === 2 ? 0.06 : years === 3 ? 0.08 : 0.11;
  const wageIncreaseK = Math.max(1, Math.round(player.wageK * wageRate));
  const bonusM = Number(Math.max(0.02, player.marketValueM * bonusRate).toFixed(2));
  return { wageIncreaseK, bonusM, targetYears };
}

export interface BoardStatusSummary {
  level: 'strong' | 'stable' | 'warning' | 'ultimatum';
  label: string;
  ticketMultiplier: number;
  sponsorMultiplier: number;
  homeMoraleBonus: number;
  description: string;
}

export function getBoardStatusSummary(
  boardConfidence: number,
  fanSupport: number
): BoardStatusSummary {
  let fanTicketMult = 1.0;
  let homeMoraleBonus = 0;
  if (fanSupport >= 85) {
    fanTicketMult = 1.1;
    homeMoraleBonus = 2;
  } else if (fanSupport < 40) {
    fanTicketMult = 0.85;
    homeMoraleBonus = -1;
  }

  if (boardConfidence < 30) {
    return {
      level: 'ultimatum',
      label: 'Tối hậu thư BLĐ',
      ticketMultiplier: Number((fanTicketMult * 0.9).toFixed(2)),
      sponsorMultiplier: 0.7,
      homeMoraleBonus,
      description: 'BLĐ mất kiên nhẫn: thưởng tài trợ bị siết 30%. Kết thúc mùa dưới 25% sẽ bị thay HLV & tái cơ cấu.',
    };
  }
  if (boardConfidence < 50) {
    return {
      level: 'warning',
      label: 'Áp lực sa thải',
      ticketMultiplier: fanTicketMult,
      sponsorMultiplier: 0.85,
      homeMoraleBonus,
      description: 'BLĐ đang theo dõi sát: thưởng tài trợ giảm 15% cho đến khi thành tích khởi sắc.',
    };
  }
  if (boardConfidence >= 85) {
    return {
      level: 'strong',
      label: 'Tín nhiệm tuyệt đối',
      ticketMultiplier: Number((fanTicketMult * 1.05).toFixed(2)),
      sponsorMultiplier: 1.1,
      homeMoraleBonus,
      description: 'BLĐ & CĐV đồng lòng: thưởng tài trợ +10%' + (fanSupport >= 85 ? ' & chảo lửa sân nhà +10% vé.' : '.'),
    };
  }
  return {
    level: 'stable',
    label: 'Ổn định',
    ticketMultiplier: fanTicketMult,
    sponsorMultiplier: 1.0,
    homeMoraleBonus,
    description:
      fanSupport >= 85
        ? 'CĐV cực kỳ cuồng nhiệt (+10% doanh thu vé sân nhà).'
        : fanSupport < 40
          ? 'Khán đài vắng khách (-15% doanh thu vé sân nhà).'
          : 'Mối quan hệ BLĐ & CĐV ổn định.',
  };
}

export function getSeasonTotalRounds(career?: Pick<CareerSave, 'fixtures'> | null): number {
  const maxMw = (career?.fixtures ?? []).reduce((m, f) => Math.max(m, f.matchweek || 0), 0);
  return Math.max(38, maxMw);
}

export function getPlayerSeasonWageM(player: Player): number {
  return Number((((player.wageK || 0) * 10) / 1000).toFixed(2));
}

export function getPlayerAccruedWageM(
  player: Player,
  career: Pick<CareerSave, 'season' | 'matchweek' | 'settledPayrollSeason' | 'fixtures'>
): number {
  if (career.settledPayrollSeason === career.season) return 0;
  const totalRounds = getSeasonTotalRounds(career);
  const settledFrom =
    player.wageSettledSeason === career.season && typeof player.wageSettledMatchweek === 'number'
      ? Math.max(0, Math.min(totalRounds, player.wageSettledMatchweek))
      : 0;
  const currentRound = Math.max(1, Math.min(totalRounds, career.matchweek || 1));
  const unpaidRounds = Math.max(0, currentRound - settledFrom);
  if (unpaidRounds === 0) return 0;
  const seasonWageM = ((player.wageK || 0) * 10) / 1000;
  if (seasonWageM <= 0) return 0;
  return Number(Math.max(0.02, (seasonWageM * unpaidRounds) / totalRounds).toFixed(2));
}

export function getPlayerRemainingSeasonWageM(
  player: Player,
  career: Pick<CareerSave, 'season' | 'fixtures'>
): number {
  const totalRounds = getSeasonTotalRounds(career);
  const settledFrom =
    player.wageSettledSeason === career.season && typeof player.wageSettledMatchweek === 'number'
      ? Math.max(0, Math.min(totalRounds, player.wageSettledMatchweek))
      : 0;
  const remainingRounds = Math.max(0, totalRounds - settledFrom);
  if (remainingRounds === 0) return 0;
  const seasonWageM = ((player.wageK || 0) * 10) / 1000;
  return Number(((seasonWageM * remainingRounds) / totalRounds).toFixed(2));
}

export function getPlayerContractCompensationM(player: Player, currentYear: number): number {
  const remainingYears = Math.max(1, (player.contractUntil || currentYear + 1) - currentYear);
  const annualWageM = ((player.wageK || 20) * 10) / 1000;
  const raw = remainingYears * annualWageM * 0.45 + Math.max(0, player.marketValueM) * 0.08;
  return Number(Math.max(0.15, raw).toFixed(2));
}

