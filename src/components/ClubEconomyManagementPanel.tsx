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
  getActiveCareerManager,
  getActiveManagerAnnualSalaryM,
  getActiveManagerContractUntil,
  getManagerContractExtensionCostM,
} from '../lib/careerEngine';
import {
  ensureClubFacilities,
  getContractRenewalCostK,
  getMedicalUpgradeCostM,
  getStadiumUpgradeCostM,
  SPONSOR_OFFERS,
  SponsorOffer,
} from '../lib/economyEngine';
import { CareerSave, Player } from '../types/game';
import { ManagerAvatar, PlayerAvatar } from './ClubBadgeAndAvatar';

interface ClubEconomyManagementPanelProps {
  career: CareerSave;
  onSelectSponsor: (sponsorId: string) => Promise<{ ok: boolean; message: string }>;
  onUpgradeFacility: (facilityType: 'stadium' | 'medical') => Promise<{ ok: boolean; message: string }>;
  onExtendContract: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onExtendManagerContract?: (years: 1 | 2 | 3) => Promise<{ ok: boolean; message: string }>;
}

export const ClubEconomyManagementPanel: React.FC<ClubEconomyManagementPanelProps> = ({
  career,
  onSelectSponsor,
  onUpgradeFacility,
  onExtendContract,
  onExtendManagerContract,
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
                <p className="text-xs text-slate-400">Giảm chi phí y tế, rủi ro chấn thương và rút ngắn thời gian hồi phục</p>
              </div>
            </div>

            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Cấp độ hiện tại</span>
                <span className="font-bold text-amber-400">Cấp {facilities.medicalLevel} / 3</span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Giảm viện phí &amp; bơm thể lực</span>
                <span className="font-mono-num font-bold text-emerald-400">
                  {facilities.medicalLevel === 3 ? 'Giảm 60%' : facilities.medicalLevel === 2 ? 'Giảm 30%' : 'Tiêu chuẩn'}
                </span>
              </div>
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Giảm rủi ro chấn thương trận đấu</span>
                <span className="font-mono-num font-bold text-sky-400">
                  {facilities.medicalLevel === 3 ? '-50% rủi ro (+25% hồi phục nhanh)' : facilities.medicalLevel === 2 ? '-25% rủi ro' : 'Tiêu chuẩn'}
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
          {(() => {
            const activeMgr = getActiveCareerManager(career);
            const mgrSalaryM = getActiveManagerAnnualSalaryM(career, activeMgr);
            const mgrUntil = getActiveManagerContractUntil(career, activeMgr);
            if (!activeMgr || mgrUntil === null) return null;
            const mgrExpiring = mgrUntil <= currentYear + 1;
            return (
              <div
                className={`rounded-2xl border p-4 space-y-3 ${
                  mgrExpiring
                    ? 'bg-amber-500/10 border-amber-400/40'
                    : 'bg-[#121B24] border-emerald-500/25'
                }`}
              >
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <ManagerAvatar manager={activeMgr} size={46} />
                    <div className="min-w-0">
                      <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
                        Hợp đồng HLV Trưởng
                      </p>
                      <p className="text-sm font-bold text-white truncate">
                        {activeMgr.name} ·{' '}
                        <span className="font-mono-num text-amber-300">€{mgrSalaryM.toFixed(1)}M/năm</span>
                      </p>
                      <p className="text-[11px] text-slate-300">
                        Hạn hợp đồng đến{' '}
                        <strong className={mgrExpiring ? 'text-rose-300' : 'text-emerald-300'}>
                          {mgrUntil}
                        </strong>
                        {mgrExpiring ? ' (Hết hạn cuối mùa — cần gia hạn để giữ HLV)' : ''}
                      </p>
                    </div>
                  </div>
                  {onExtendManagerContract && (
                    <div className="flex flex-wrap items-center gap-1.5 shrink-0">
                      {([1, 2, 3] as const).map((yrs) => {
                        const feeM = getManagerContractExtensionCostM(mgrSalaryM, yrs);
                        const overCap = Math.max(mgrUntil, currentYear) + yrs > currentYear + 6;
                        return (
                          <button
                            key={yrs}
                            type="button"
                            disabled={busyKey !== null || overCap || career.transferBudget < feeM}
                            onClick={() =>
                              runAction(`mgr-ext-${yrs}`, () => onExtendManagerContract(yrs))
                            }
                            className="h-9 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs disabled:opacity-45"
                          >
                            {overCap ? `+${yrs}n (Tối đa)` : `+${yrs} năm (-€${feeM}M)`}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              </div>
            );
          })()}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
            <div className="flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white flex items-center gap-2">
                  <FileText className="w-4 h-4 text-emerald-400" />
                  Quản lý Hợp đồng &amp; Gia hạn Cầu thủ
                </h4>
                <p className="text-xs text-slate-400">
                  Các cầu thủ có hạn hợp đồng ≤ {currentYear + 1} sẽ <strong className="text-amber-300">chính thức ra đi tự do (phí €0M)</strong> khi bước sang mùa giải {currentYear + 1}/{String(currentYear + 2).slice(-2)} nếu chưa được gia hạn!
                </p>
              </div>
              <span className="font-mono-num text-xs font-bold text-amber-400 shrink-0">
                {expiringPlayers.length} hết hạn cuối mùa
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
                    const renewalInfo = getContractRenewalCostK(p);
                    const nextExpiry = Math.max(p.contractUntil, currentYear) + renewalInfo.targetYears;
                    return (
                      <div
                        key={p.id}
                        className={`rounded-xl border p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                          isExpiringSoon
                            ? 'bg-amber-500/10 border-amber-400/35'
                            : 'bg-[#0B1117] border-white/10'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <PlayerAvatar player={p} club={club} size={42} isUserCard />
                          <div className="min-w-0">
                            <p className="text-xs font-bold text-white truncate">
                              {p.name}{' '}
                              <span className="font-mono-num text-emerald-400">({p.rating})</span>
                            </p>
                            <p className="text-[11px] text-slate-400 truncate">
                              {p.position} · {p.age}t · Lương{' '}
                              <span className="font-mono-num text-amber-400">€{p.wageK}K/tuần</span> · Gia hạn đến {nextExpiry} (+€{renewalInfo.wageIncreaseK}K/tuần)
                            </p>
                          </div>
                        </div>

                        <div className="flex items-center justify-between sm:justify-end gap-3">
                          <div className="text-right">
                            <span
                              className={`inline-block px-2 py-0.5 rounded text-[10px] font-bold ${
                                isExpiringSoon
                                  ? 'bg-rose-500/20 border border-rose-500/40 text-rose-200'
                                  : 'bg-emerald-500/20 text-emerald-300'
                              }`}
                            >
                              {isExpiringSoon
                                ? `Hết hạn cuối mùa (${p.contractUntil})`
                                : `HĐ đến ${p.contractUntil}`}
                            </span>
                          </div>

                          <button
                            type="button"
                            disabled={busyKey !== null || career.transferBudget < renewalInfo.bonusM}
                            onClick={() => runAction(`contract-${p.id}`, () => onExtendContract(p.id))}
                            className="h-9 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0 disabled:opacity-50"
                          >
                            {busyKey === `contract-${p.id}`
                              ? 'Đang ký...'
                              : career.transferBudget < renewalInfo.bonusM
                                ? `Thiếu €${renewalInfo.bonusM}M`
                                : `Gia hạn +${renewalInfo.targetYears} năm (-€${renewalInfo.bonusM}M)`}
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
