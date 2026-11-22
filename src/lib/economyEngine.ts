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

export function getContractRenewalCostK(player: Player): { wageIncreaseK: number; bonusM: number; targetYears: number } {
  const targetYears = 3;
  const wageIncreaseK = Math.max(2, Math.round(player.wageK * 0.15));
  const bonusM = Number(Math.max(0.02, player.marketValueM * 0.08).toFixed(2));
  return { wageIncreaseK, bonusM, targetYears };
}
