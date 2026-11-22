import React, { useMemo, useState } from 'react';
import {
  ArrowUpRight,
  Coins,
  Dumbbell,
  GraduationCap,
  Search,
  Sparkles,
  TrendingUp,
  UserPlus,
} from 'lucide-react';
import { CLUBS } from '../data/footballDatabase';
import {
  ensureYouthAcademy,
  getAcademyUpgradeCostM,
  getExtraScoutCostM,
  getProspectIntensiveTrainCostM,
} from '../lib/legacyAcademyEngine';
import { CareerSave, Player, YouthProspect } from '../types/game';
import { PlayerAvatar } from './ClubBadgeAndAvatar';

interface YouthAcademyPanelProps {
  career: CareerSave;
  onUpgradeAcademy: () => Promise<{ ok: boolean; message: string }>;
  onExtraScout: () => Promise<{ ok: boolean; message: string }>;
  onTrainProspect: (prospectId: string) => Promise<{ ok: boolean; message: string }>;
  onPromoteProspect: (prospectId: string) => Promise<{ ok: boolean; message: string }>;
  onReleaseProspect: (prospectId: string) => Promise<{ ok: boolean; message: string }>;
}

const ACADEMY_TIER_INFO: Record<
  1 | 2 | 3,
  { title: string; intakeSummary: string; xpPerMatch: string }
> = {
  1: {
    title: 'Học viện Cơ sở (Cấp 1)',
    intakeSummary: 'Ngọc thô OVR 62–67 · Tiềm năng 82–88 · Tuyển 2 tài năng/mùa',
    xpPerMatch: '+16 XP / trận',
  },
  2: {
    title: 'Trung tâm Đào tạo Quốc gia (Cấp 2)',
    intakeSummary: 'Ngọc thô OVR 65–70 · Tiềm năng 85–91 · Tuyển 3 tài năng/mùa',
    xpPerMatch: '+22 XP / trận',
  },
  3: {
    title: 'Học viện La Masia Đỉnh cao (Cấp 3)',
    intakeSummary: 'Ngọc thô OVR 68–73 · Tiềm năng 88–94 · Tuyển 3 tài năng/mùa',
    xpPerMatch: '+28 XP / trận',
  },
};

function toAvatarPlayer(prospect: YouthProspect, clubId: string): Player {
  return {
    id: prospect.id,
    name: prospect.name,
    shortName: prospect.shortName,
    clubId,
    position: prospect.position,
    secondaryPos: prospect.secondaryPos,
    number: 0,
    age: prospect.age,
    nationality: prospect.nationality,
    flagCode: prospect.flagCode,
    rating: prospect.rating,
    potential: prospect.potential,
    marketValueM: prospect.estimatedValueM,
    wageK: 15,
    contractUntil: 2030,
    fitness: 100,
    morale: 90,
    form: 7.2,
    goals: 0,
    assists: 0,
    appearances: 0,
    transferStatus: 'available',
    attributes: prospect.attributes,
    appearance: prospect.appearance,
  };
}

export const YouthAcademyPanel: React.FC<YouthAcademyPanelProps> = ({
  career,
  onUpgradeAcademy,
  onExtraScout,
  onTrainProspect,
  onPromoteProspect,
  onReleaseProspect,
}) => {
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);
  const [posFilter, setPosFilter] = useState<'all' | 'GK' | 'DEF' | 'MID' | 'ATK'>('all');

  const club = useMemo(
    () => CLUBS.find((c) => c.id === career.clubId) ?? CLUBS[0],
    [career.clubId]
  );
  const academy = useMemo(() => ensureYouthAcademy(career), [career]);
  const tierInfo = ACADEMY_TIER_INFO[academy.level];
  const upgradeCostM = getAcademyUpgradeCostM(academy.level);
  const extraScoutCostM = getExtraScoutCostM(academy.level);
  const alreadyExtraScouted = academy.extraScoutedSeason === career.season;
  const squadFull = career.squad.length >= 40;
  const academyFull = academy.prospects.length >= 6;

  const filteredProspects = useMemo(() => {
    return academy.prospects.filter((p) => {
      if (posFilter === 'all') return true;
      if (posFilter === 'GK') return p.position === 'GK';
      if (posFilter === 'DEF') return p.position === 'CB' || p.position === 'LB' || p.position === 'RB';
      if (posFilter === 'MID') return p.position === 'CDM' || p.position === 'CM' || p.position === 'CAM';
      return p.position === 'LW' || p.position === 'RW' || p.position === 'ST';
    });
  }, [academy.prospects, posFilter]);

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
      {/* Header & Academy Tier Controls */}
      <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4">
          <div className="space-y-1">
            <div className="flex items-center gap-2 text-xs text-emerald-400 font-semibold">
              <GraduationCap className="w-4 h-4" />
              <span>Học viện Đào tạo Trẻ · {club.name}</span>
            </div>
            <h3 className="font-display text-xl sm:text-2xl font-extrabold text-white">
              {tierInfo.title}
            </h3>
            <p className="text-xs text-slate-400">
              {tierInfo.intakeSummary} · Phát triển tự động {tierInfo.xpPerMatch}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            <button
              type="button"
              disabled={
                busyKey !== null ||
                alreadyExtraScouted ||
                academyFull ||
                career.transferBudget < extraScoutCostM
              }
              onClick={() => runAction('extra-scout', onExtraScout)}
              className="h-10 px-4 rounded-xl bg-sky-500/15 hover:bg-sky-500/25 border border-sky-400/35 text-sky-200 font-semibold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              {alreadyExtraScouted
                ? `Đã tuyển trạch mùa ${career.season}`
                : academyFull
                  ? 'Học viện đủ 6/6 chỗ'
                  : `Tuyển trạch Đặc biệt (-€${extraScoutCostM}M)`}
            </button>

            {academy.level < 3 ? (
              <button
                type="button"
                disabled={busyKey !== null || career.transferBudget < upgradeCostM}
                onClick={() => runAction('upgrade-academy', onUpgradeAcademy)}
                className="h-10 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0 disabled:opacity-50"
              >
                <ArrowUpRight className="w-4 h-4" />
                {busyKey === 'upgrade-academy'
                  ? 'Đang nâng cấp...'
                  : `Nâng cấp Cấp ${academy.level + 1} (-€${upgradeCostM}M)`}
              </button>
            ) : (
              <div className="h-10 px-4 rounded-xl bg-amber-500/15 border border-amber-400/35 text-amber-300 font-bold text-xs flex items-center gap-1.5 whitespace-nowrap shrink-0">
                <Sparkles className="w-3.5 h-3.5" />
                Đạt chuẩn Tối đa (Cấp 3)
              </div>
            )}
          </div>
        </div>

        {/* 4 Tabular KPI Stats */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5 pt-2 border-t border-white/10">
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
            <p className="text-[11px] text-slate-400">Ngân sách khả dụng</p>
            <p className="font-mono-num text-lg font-extrabold text-white mt-0.5 tabular-nums">
              €{career.transferBudget.toFixed(1)}M
            </p>
          </div>
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
            <p className="text-[11px] text-slate-400">Học viên hiện có</p>
            <p className="font-mono-num text-lg font-extrabold text-emerald-400 mt-0.5 tabular-nums">
              {academy.prospects.length} / 6
            </p>
          </div>
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
            <p className="text-[11px] text-slate-400">Đã đôn lên Đội 1</p>
            <p className="font-mono-num text-lg font-extrabold text-sky-400 mt-0.5 tabular-nums">
              {academy.promotedCount} cầu thủ
            </p>
          </div>
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
            <p className="text-[11px] text-slate-400">Đào tạo xuất ngoại</p>
            <p className="font-mono-num text-lg font-extrabold text-amber-400 mt-0.5 tabular-nums">
              {academy.releasedCount} thương vụ
            </p>
          </div>
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
      </div>

      {/* Filter Bar */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
          {[
            { id: 'all', label: `Tất cả (${academy.prospects.length})` },
            { id: 'GK', label: 'Thủ môn' },
            { id: 'DEF', label: 'Hậu vệ' },
            { id: 'MID', label: 'Tiền vệ' },
            { id: 'ATK', label: 'Tiền đạo' },
          ].map((f) => (
            <button
              key={f.id}
              type="button"
              onClick={() => setPosFilter(f.id as typeof posFilter)}
              className={`h-9 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                posFilter === f.id
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {f.label}
            </button>
          ))}
        </div>
        <p className="text-xs text-slate-400">
          Đội 1 hiện có: <span className="font-mono-num font-bold text-white tabular-nums">{career.squad.length}/40</span> cầu thủ
        </p>
      </div>

      {/* Prospect Cards */}
      {filteredProspects.length === 0 ? (
        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-8 text-center space-y-3">
          <p className="text-sm font-semibold text-white">
            {academy.prospects.length === 0
              ? 'Học viện hiện đang trống lứa học viên mới'
              : 'Không có học viên nào thuộc nhóm vị trí này'}
          </p>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            {academy.prospects.length === 0
              ? 'Lứa tài năng trẻ mới sẽ tự động nhập học khi sang mùa giải tiếp theo, hoặc bạn có thể dùng Tuyển trạch Đặc biệt để tìm ngay một ngọc thô.'
              : 'Chọn "Tất cả" để xem toàn bộ học viên đang rèn luyện tại Học viện.'}
          </p>
          {academy.prospects.length === 0 && !alreadyExtraScouted && (
            <button
              type="button"
              disabled={busyKey !== null || career.transferBudget < extraScoutCostM}
              onClick={() => runAction('extra-scout', onExtraScout)}
              className="h-10 px-4 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs inline-flex items-center gap-1.5 disabled:opacity-50"
            >
              <Search className="w-3.5 h-3.5" />
              Tuyển trạch Đặc biệt (-€{extraScoutCostM}M)
            </button>
          )}
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
          {filteredProspects.map((prospect) => {
            const trainCostM = getProspectIntensiveTrainCostM(prospect);
            const releaseFeeM = Number(Math.max(1, prospect.estimatedValueM * 0.7).toFixed(1));
            const maxAcademyOvr = Math.min(79, prospect.potential - 7);
            const reachedAcademyCap = prospect.rating >= maxAcademyOvr;

            return (
              <div
                key={prospect.id}
                className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3.5"
              >
                {/* Header */}
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar
                      player={toAvatarPlayer(prospect, club.id)}
                      club={club}
                      size={50}
                      showNumber={false}
                      isUserCard
                    />
                    <div className="min-w-0">
                      <h4 className="text-sm font-bold text-white truncate">{prospect.name}</h4>
                      <p className="text-xs text-slate-400 truncate mt-0.5">
                        {prospect.position}
                        {prospect.secondaryPos ? `/${prospect.secondaryPos}` : ''} · {prospect.age} tuổi ·{' '}
                        {prospect.nationality} ({prospect.flagCode})
                      </p>
                      <p className="text-[11px] text-emerald-400 truncate mt-0.5">
                        {prospect.archetype} · Khóa {prospect.scoutedSeason}
                      </p>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <div className="flex items-baseline justify-end gap-1.5">
                      <span className="font-mono-num text-xl font-extrabold text-white tabular-nums">
                        {prospect.rating}
                      </span>
                      <span className="text-xs text-slate-500">/</span>
                      <span className="font-mono-num text-sm font-bold text-amber-400 tabular-nums">
                        {prospect.potential} POT
                      </span>
                    </div>
                    <p className="font-mono-num text-[11px] text-slate-400 tabular-nums">
                      Định giá €{prospect.estimatedValueM}M
                    </p>
                  </div>
                </div>

                {/* Attributes Strip */}
                <div className="grid grid-cols-6 gap-1.5 pt-2.5 border-t border-white/10 text-center">
                  {[
                    { k: 'PAC', v: prospect.attributes.pac },
                    { k: 'SHO', v: prospect.attributes.sho },
                    { k: 'PAS', v: prospect.attributes.pas },
                    { k: 'DRI', v: prospect.attributes.dri },
                    { k: 'DEF', v: prospect.attributes.def },
                    { k: 'PHY', v: prospect.attributes.phy },
                  ].map((st) => (
                    <div key={st.k} className="rounded-lg bg-[#0B1117] py-1.5 px-1">
                      <p className="text-[10px] text-slate-500 font-semibold">{st.k}</p>
                      <p className="font-mono-num text-xs font-bold text-slate-200 tabular-nums">
                        {st.v}
                      </p>
                    </div>
                  ))}
                </div>

                {/* Training Progress */}
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-[11px]">
                    <span className="text-slate-400 flex items-center gap-1">
                      <TrendingUp className="w-3.5 h-3.5 text-emerald-400" />
                      {reachedAcademyCap
                        ? 'Đã đạt trần U19 — Sẵn sàng đôn lên Đội 1'
                        : 'Tiến độ lên +1 OVR tại Học viện'}
                    </span>
                    <span className="font-mono-num font-bold text-emerald-300 tabular-nums">
                      {prospect.trainingPoints}% · +{prospect.totalTrainedLevels} OVR
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-[#0B1117] overflow-hidden">
                    <div
                      className="h-full bg-emerald-500 rounded-full transition-all"
                      style={{ width: `${Math.min(100, prospect.trainingPoints)}%` }}
                    />
                  </div>
                </div>

                {/* Actions */}
                <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 pt-1">
                  <button
                    type="button"
                    disabled={
                      busyKey !== null ||
                      reachedAcademyCap ||
                      career.transferBudget < trainCostM
                    }
                    onClick={() =>
                      runAction(`train-${prospect.id}`, () => onTrainProspect(prospect.id))
                    }
                    className="h-10 px-3 rounded-xl bg-[#0B1117] hover:bg-white/5 border border-white/15 text-slate-200 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-45"
                  >
                    <Dumbbell className="w-3.5 h-3.5 text-sky-400 shrink-0" />
                    {reachedAcademyCap
                      ? 'Max Học viện'
                      : `Tập riêng (-€${trainCostM}M)`}
                  </button>

                  <button
                    type="button"
                    disabled={busyKey !== null || squadFull}
                    onClick={() =>
                      runAction(`promote-${prospect.id}`, () => onPromoteProspect(prospect.id))
                    }
                    className="h-10 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-45"
                  >
                    <UserPlus className="w-3.5 h-3.5 shrink-0" />
                    {squadFull ? 'Đội 1 đầy (40)' : 'Đôn lên Đội 1'}
                  </button>

                  <button
                    type="button"
                    disabled={busyKey !== null}
                    onClick={() =>
                      runAction(`release-${prospect.id}`, () => onReleaseProspect(prospect.id))
                    }
                    className="h-10 px-3 rounded-xl bg-amber-500/15 hover:bg-amber-500/25 border border-amber-400/35 text-amber-200 text-xs font-semibold flex items-center justify-center gap-1.5 whitespace-nowrap disabled:opacity-45"
                  >
                    <Coins className="w-3.5 h-3.5 shrink-0" />
                    {`Bán đào tạo (+€${releaseFeeM}M)`}
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};
