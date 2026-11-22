import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Briefcase,
  CheckCircle2,
  Coins,
  FileText,
  HeartPulse,
  Shield,
  Stethoscope,
  TrendingUp,
  Users,
} from 'lucide-react';
import { CLUBS } from '../data/footballDatabase';
import {
  ensureClubFacilities,
  getMedicalUpgradeCostM,
  getStadiumUpgradeCostM,
  SPONSOR_OFFERS,
  SponsorOffer,
} from '../lib/economyEngine';
import { CareerSave, Player } from '../types/game';
import { PlayerAvatar } from './ClubBadgeAndAvatar';

interface ClubEconomyManagementPanelProps {
  career: CareerSave;
  onSelectSponsor: (sponsorId: string) => Promise<{ ok: boolean; message: string }>;
  onUpgradeFacility: (facilityType: 'stadium' | 'medical') => Promise<{ ok: boolean; message: string }>;
  onExtendContract: (playerId: string) => Promise<{ ok: boolean; message: string }>;
}

export const ClubEconomyManagementPanel: React.FC<ClubEconomyManagementPanelProps> = ({
  career,
  onSelectSponsor,
  onUpgradeFacility,
  onExtendContract,
}) => {
  const [subTab, setSubTab] = useState<'sponsors' | 'facilities' | 'contracts'>('sponsors');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const club = useMemo(
    () => CLUBS.find((c) => c.id === career.clubId) ?? CLUBS[0],
    [career.clubId]
  );
  const facilities = useMemo(() => ensureClubFacilities(career), [career]);
  const activeSponsor = SPONSOR_OFFERS.find((s) => s.id === career.activeSponsorId) ?? SPONSOR_OFFERS[0];
  const isSponsorClaimedThisSeason = career.sponsorClaimedSeason === career.season;

  const currentYear = Number(career.season.slice(0, 4)) || 2026;
  const expiringPlayers = useMemo(() => {
    return [...career.squad]
      .filter((p) => p.contractUntil <= currentYear + 1)
      .sort((a, b) => a.contractUntil - b.contractUntil || b.rating - a.rating);
  }, [career.squad, currentYear]);

  const runAction = async (key: string, fn: () => Promise<{ ok: boolean; message: string }>) => {
    setBusyKey(key);
    setFeedback(null);
    try {
      const res = await fn();
      setFeedback(res);
    } finally {
      setBusyKey(null);
    }
  };

  return (
    <div className="space-y-4">
      {/* Sub-navigation */}
      <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
        {[
          { id: 'sponsors', label: 'Nhà tài trợ chính' },
          { id: 'facilities', label: 'Cơ sở vật chất & Sân bãi' },
          { id: 'contracts', label: `Gia hạn Hợp đồng (${expiringPlayers.length} sắp hết)` },
        ].map((t) => (
          <button
            key={t.id}
            type="button"
            onClick={() => setSubTab(t.id as typeof subTab)}
            className={`h-10 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap px-2 ${
              subTab === t.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:text-white'
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {feedback && (
        <div
          className={`rounded-xl p-3 text-xs border ${
            feedback.ok
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
              : 'bg-red-500/15 border-red-500/35 text-red-200'
          }`}
        >
          {feedback.message}
        </div>
      )}

      {/* 1. Sponsors Sub-Tab */}
      {subTab === 'sponsors' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Briefcase className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-base font-bold text-white">Đối tác &amp; Nhà tài trợ Áo đấu Mùa giải {career.season}</h3>
                <p className="text-xs text-slate-400">
                  Lựa chọn hợp đồng tài trợ chính thức mang về nguồn tiền lót tay upfront và tiền thưởng thành tích mỗi vòng đấu.
                </p>
              </div>
            </div>

            <div className="rounded-xl bg-[#0B1117] border border-emerald-500/30 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-emerald-500/20 border border-emerald-500/40 flex items-center justify-center text-emerald-300 font-bold">
                  ★
                </div>
                <div>
                  <p className="text-xs text-slate-400">Đang tài trợ mùa {career.season}</p>
                  <p className="text-sm font-bold text-white">{activeSponsor.name}</p>
                  <p className="text-[11px] text-emerald-400 mt-0.5">
                    Lót tay +€{activeSponsor.upfrontM}M · Thưởng trận +€{activeSponsor.matchBonusM}M
                    {isSponsorClaimedThisSeason ? ' · Đã nhận lót tay mùa này' : ' · Sẵn sàng ký kết'}
                  </p>
                </div>
              </div>
              <span
                className={`px-3 py-1 rounded-lg text-xs font-bold ${
                  isSponsorClaimedThisSeason
                    ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/40'
                    : 'bg-amber-500/20 text-amber-300 border border-amber-400/40'
                }`}
              >
                {isSponsorClaimedThisSeason ? 'Đã ký hợp đồng' : 'Chọn gói tài trợ'}
              </span>
            </div>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {SPONSOR_OFFERS.map((sponsor) => {
              const isSelected = career.activeSponsorId === sponsor.id;
              return (
                <div
                  key={sponsor.id}
                  className={`rounded-2xl border p-4 space-y-4 flex flex-col justify-between ${
                    isSelected
                      ? 'bg-[#121B24] border-emerald-500/50 shadow-lg shadow-emerald-500/10'
                      : 'bg-[#121B24] border-white/10'
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-center justify-between gap-2">
                      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-[#0B1117] border border-white/10 text-amber-400">
                        {sponsor.tier === 'conservative' ? 'An toàn' : sponsor.tier === 'balanced' ? 'Cân bằng' : 'Mạo hiểm / Lớn'}
                      </span>
                      {isSelected && (
                        <span className="text-xs font-bold text-emerald-400 flex items-center gap-1">
                          <CheckCircle2 className="w-3.5 h-3.5" /> Đang chọn
                        </span>
                      )}
                    </div>
                    <h4 className="text-base font-bold text-white">{sponsor.name}</h4>
                    <p className="text-xs text-slate-400 leading-relaxed">{sponsor.description}</p>
                  </div>

                  <div className="space-y-3 pt-3 border-t border-white/10">
                    <div className="grid grid-cols-2 gap-2 text-xs font-mono-num">
                      <div className="rounded-xl bg-[#0B1117] p-2.5">
                        <span className="text-[10px] text-slate-400 block">Tiền lót tay upfront</span>
                        <strong className="text-emerald-400 text-sm">+€{sponsor.upfrontM}M</strong>
                      </div>
                      <div className="rounded-xl bg-[#0B1117] p-2.5">
                        <span className="text-[10px] text-slate-400 block">Thưởng mỗi trận</span>
                        <strong className="text-sky-400 text-sm">+€{sponsor.matchBonusM}M</strong>
                      </div>
                    </div>

                    <button
                      type="button"
                      disabled={busyKey !== null || isSelected}
                      onClick={() => runAction(`sponsor-${sponsor.id}`, () => onSelectSponsor(sponsor.id))}
                      className={`w-full h-11 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 transition-colors disabled:opacity-50 ${
                        isSelected
                          ? 'bg-emerald-500/20 border border-emerald-500/40 text-emerald-300'
                          : 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
                      }`}
                    >
                      {isSelected ? 'Đang áp dụng hợp đồng' : `Ký hợp đồng (+€{sponsor.upfrontM}M)`}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* 2. Facilities Sub-Tab */}
      {subTab === 'facilities' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {/* Stadium Upgrade Card */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Shield className="w-5 h-5 text-emerald-400" />
              <div>
                <h3 className="text-base font-bold text-white">Sân vận động {club.stadium}</h3>
                <p className="text-xs text-slate-400">Sức chứa: {club.capacity.toLocaleString()} khán giả</p>
              </div>
            </div>

            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Cấp độ hiện tại</span>
                <span className="font-bold text-amber-400">Cấp {facilities.stadiumLevel} / 3</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Hệ số doanh thu vé</span>
                <span className="font-mono-num font-bold text-emerald-400">
                  {facilities.stadiumLevel === 3 ? '+50% vé sân nhà' : facilities.stadiumLevel === 2 ? '+25% vé sân nhà' : 'Tiêu chuẩn'}
                </span>
              </div>
            </div>

            {facilities.stadiumLevel < 3 ? (
              <button
                type="button"
                disabled={busyKey !== null || career.transferBudget < getStadiumUpgradeCostM(facilities.stadiumLevel as 1 | 2)}
                onClick={() => runAction('stadium-up', () => onUpgradeFacility('stadium'))}
                className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <ArrowUpRight className="w-4 h-4" />
                {`Nâng cấp Sân vận động Cấp ${facilities.stadiumLevel + 1} (-€${getStadiumUpgradeCostM(facilities.stadiumLevel as 1 | 2)}M)`}
              </button>
            ) : (
              <div className="h-11 rounded-xl bg-amber-500/15 border border-amber-400/35 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5">
                Đã đạt chuẩn Siêu Sân Vận Động (Cấp 3)
              </div>
            )}
          </div>

          {/* Medical Center Upgrade Card */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-5 space-y-4">
            <div className="flex items-center gap-3">
              <Stethoscope className="w-5 h-5 text-sky-400" />
              <div>
                <h3 className="text-base font-bold text-white">Trung tâm Y tế &amp; Phục hồi CLB</h3>
                <p className="text-xs text-slate-400">Giảm chi phí bơm thể lực cầu thủ</p>
              </div>
            </div>

            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Cấp độ hiện tại</span>
                <span className="font-bold text-amber-400">Cấp {facilities.medicalLevel} / 3</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Giảm chi phí y tế</span>
                <span className="font-mono-num font-bold text-emerald-400">
                  {facilities.medicalLevel === 3 ? 'Giảm 60% chi phí y tế' : facilities.medicalLevel === 2 ? 'Giảm 30% chi phí y tế' : 'Tiêu chuẩn'}
                </span>
              </div>
            </div>

            {facilities.medicalLevel < 3 ? (
              <button
                type="button"
                disabled={busyKey !== null || career.transferBudget < getMedicalUpgradeCostM(facilities.medicalLevel as 1 | 2)}
                onClick={() => runAction('medical-up', () => onUpgradeFacility('medical'))}
                className="w-full h-11 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-50"
              >
                <ArrowUpRight className="w-4 h-4" />
                {`Nâng cấp Y tế Cấp ${facilities.medicalLevel + 1} (-€${getMedicalUpgradeCostM(facilities.medicalLevel as 1 | 2)}M)`}
              </button>
            ) : (
              <div className="h-11 rounded-xl bg-amber-500/15 border border-amber-400/35 text-amber-300 font-bold text-xs flex items-center justify-center gap-1.5">
                Đã đạt chuẩn Phòng thí nghiệm Sinh học (Cấp 3)
              </div>
            )}
          </div>
        </div>
      )}

      {/* 3. Contracts Sub-Tab */}
      {subTab === 'contracts' && (
        <div className="space-y-4">
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  Danh sách Cầu thủ sắp hết hạn hợp đồng (hoặc toàn đội)
                </h4>
                <p className="text-xs text-slate-400">
                  Gia hạn hợp đồng sớm giúp giữ chân trụ cột, tăng tinh thần và ngăn cầu thủ ra đi tự do.
                </p>
              </div>
              <span className="font-mono-num text-xs font-bold text-amber-400">
                {expiringPlayers.length} cầu thủ sắp hết hạn
              </span>
            </div>

            {career.squad.length === 0 ? (
              <div className="rounded-xl bg-[#0B1117] border border-white/10 p-8 text-center text-xs text-slate-400">
                Đội hình hiện trống.
              </div>
            ) : (
              <div className="space-y-2">
                {[...career.squad]
                  .sort((a, b) => a.contractUntil - b.contractUntil || b.rating - a.rating)
                  .map((p) => {
                    const isExpiringSoon = p.contractUntil <= currentYear + 1;
                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isExpiringSoon
                            ? 'bg-amber-500/10 border-amber-400/30'
                            : 'bg-[#0B1117] border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar player={p} club={club} size={42} isUserCard />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">{p.name}</p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {p.position} · {p.age}t · Lương hiện tại{' '}
                              <span className="font-mono-num text-amber-400">€{p.wageK}K/tuần</span>
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <div className="text-right">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                isExpiringSoon
                                  ? 'bg-amber-500/20 text-amber-300'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              Hợp đồng đến {p.contractUntil}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={busyKey !== null}
                            onClick={() => runAction(`contract-${p.id}`, () => onExtendContract(p.id))}
                            className="h-9 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0 disabled:opacity-50"
                          >
                            {busyKey === `contract-${p.id}` ? 'Đang đàm phán...' : 'Gia hạn (+3 năm)'}
                          </button>
                        </div>
                      </div>
                    );
                  })}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
