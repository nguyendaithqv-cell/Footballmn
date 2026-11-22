import React, { useMemo, useState } from 'react';
import {
  ArrowDownLeft,
  ArrowUpRight,
  Building2,
  CheckCircle2,
  ChevronDown,
  ChevronUp,
  Coins,
  FileSpreadsheet,
  Gift,
  Lock,
  Receipt,
  RefreshCw,
  ShieldAlert,
  Users,
  Wallet,
} from 'lucide-react';
import {
  computeSeasonEndRewardBundle,
  computeSeasonPayrollBreakdown,
  getNextSeasonString,
  isCompetitionFinished,
} from '../lib/careerEngine';
import { CareerSave, FinancialLedgerCategory, FinancialLedgerEntry } from '../types/game';

interface ClubFinancePanelProps {
  career: CareerSave;
  onSettleSeasonPayroll: () => Promise<{ ok: boolean; message: string }>;
  onClaimSeasonRewards?: () => Promise<{ ok: boolean; message: string }>;
  onStartNextSeason?: () => Promise<void>;
}

const CATEGORY_LABELS: Record<FinancialLedgerCategory, string> = {
  match_prize: 'Thưởng trận đấu',
  competition_bonus: 'Thưởng giải đấu',
  season_reward: 'Thưởng cuối mùa',
  player_sale: 'Bán cầu thủ',
  pack_refund: 'Thu từ gói thẻ',
  player_purchase: 'Mua cầu thủ',
  contract_compensation: 'Bồi thường & HĐ HLV',
  payroll_settlement: 'Quyết toán lương CLB',
  pack_purchase: 'Mua gói thẻ',
  star_upgrade: 'Phí nâng sao',
  medical_recovery: 'Chi phí y tế',
  academy: 'Học viện & Tài năng trẻ',
};

export const ClubFinancePanel: React.FC<ClubFinancePanelProps> = ({
  career,
  onSettleSeasonPayroll,
  onClaimSeasonRewards,
  onStartNextSeason,
}) => {
  const allSeasons = useMemo(() => {
    const set = new Set<string>([career.season]);
    for (const s of career.seasonHistory ?? []) set.add(s.season);
    for (const e of career.financialLedger ?? []) set.add(e.season);
    for (const p of career.payrollHistory ?? []) set.add(p.season);
    return Array.from(set);
  }, [career.season, career.seasonHistory, career.financialLedger, career.payrollHistory]);

  const [selectedSeason, setSelectedSeason] = useState<string>(career.season);
  const [ledgerFilter, setLedgerFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [categoryFilter, setCategoryFilter] = useState<'all' | FinancialLedgerCategory>('all');
  const [showPlayerWages, setShowPlayerWages] = useState(false);
  const [settlingPayroll, setSettlingPayroll] = useState(false);
  const [claimingRewards, setClaimingRewards] = useState(false);
  const [startingNext, setStartingNext] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; message: string } | null>(null);

  const activeSeason = allSeasons.includes(selectedSeason) ? selectedSeason : career.season;
  const leagueFinished = isCompetitionFinished(career, 'league');
  const isPayrollSettled = career.settledPayrollSeason === career.season;
  const currentPayroll = useMemo(() => computeSeasonPayrollBreakdown(career), [career]);
  const rewardBundle = useMemo(() => computeSeasonEndRewardBundle(career), [career]);

  const seasonEntries = useMemo<FinancialLedgerEntry[]>(() => {
    const entries = (career.financialLedger ?? []).filter((e) => e.season === activeSeason);
    return [...entries].sort((a, b) => {
      const tA = new Date(a.date).getTime() || 0;
      const tB = new Date(b.date).getTime() || 0;
      if (tB !== tA) return tB - tA;
      return b.matchweek - a.matchweek;
    });
  }, [career.financialLedger, activeSeason]);

  const filteredEntries = useMemo(
    () =>
      seasonEntries.filter((e) => {
        if (ledgerFilter !== 'all' && e.type !== ledgerFilter) return false;
        if (categoryFilter !== 'all' && e.category !== categoryFilter) return false;
        return true;
      }),
    [seasonEntries, ledgerFilter, categoryFilter]
  );

  const incomeEntries = useMemo(
    () => filteredEntries.filter((e) => e.type === 'income'),
    [filteredEntries]
  );
  const expenseEntries = useMemo(
    () => filteredEntries.filter((e) => e.type === 'expense'),
    [filteredEntries]
  );

  const totals = useMemo(() => {
    let totalIncome = 0;
    let totalExpense = 0;
    const byCategory: Partial<Record<FinancialLedgerCategory, number>> = {};
    for (const e of seasonEntries) {
      if (e.type === 'income') totalIncome += e.amountM;
      else totalExpense += e.amountM;
      byCategory[e.category] = Number(((byCategory[e.category] ?? 0) + e.amountM).toFixed(2));
    }
    return {
      totalIncome: Number(totalIncome.toFixed(1)),
      totalExpense: Number(totalExpense.toFixed(1)),
      net: Number((totalIncome - totalExpense).toFixed(1)),
      byCategory,
    };
  }, [seasonEntries]);

  const sortedSquadByWage = useMemo(
    () => [...career.squad].sort((a, b) => b.wageK - a.wageK),
    [career.squad]
  );

  const wageUsagePct = Math.min(
    100,
    Math.round((currentPayroll.squadWeeklyWageK / Math.max(1, career.wageBudget)) * 100)
  );
  const shortfallM = Number(Math.max(0, currentPayroll.totalPayrollM - career.transferBudget).toFixed(1));
  const nextSeasonLabel = getNextSeasonString(career.season);

  const handleSettle = async () => {
    if (settlingPayroll || isPayrollSettled) return;
    setSettlingPayroll(true);
    setFeedback(null);
    try {
      const res = await onSettleSeasonPayroll();
      setFeedback(res);
    } finally {
      setSettlingPayroll(false);
    }
  };

  const handleClaim = async () => {
    if (!onClaimSeasonRewards || claimingRewards || rewardBundle.alreadyClaimed) return;
    setClaimingRewards(true);
    setFeedback(null);
    try {
      const res = await onClaimSeasonRewards();
      setFeedback(res);
    } finally {
      setClaimingRewards(false);
    }
  };

  const handleNextSeason = async () => {
    if (!onStartNextSeason || startingNext || !isPayrollSettled) return;
    setStartingNext(true);
    try {
      await onStartNextSeason();
    } finally {
      setStartingNext(false);
    }
  };

  const formatEntryDate = (iso: string) => {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return '';
    return d.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' });
  };

  return (
    <div className="space-y-4">
      {/* 1. Season Selector + 4 Financial KPI Cards */}
      <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <p className="text-xs font-bold text-emerald-400">Phòng Tài Chính &amp; Kế Toán CLB</p>
            <h3 className="font-display text-xl sm:text-2xl font-extrabold text-white flex items-center gap-2">
              <FileSpreadsheet className="w-5 h-5 text-amber-400" />
              Sổ Thu – Chi &amp; Quyết Toán Quỹ Lương
            </h3>
          </div>
          <div className="flex items-center gap-1.5 flex-wrap">
            {allSeasons.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSelectedSeason(s)}
                className={`h-9 px-3 rounded-lg text-xs font-bold border transition-colors whitespace-nowrap ${
                  activeSeason === s
                    ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                    : 'bg-[#0B1117] text-slate-300 border-white/10 hover:text-white'
                }`}
              >
                Mùa {s}
              </button>
            ))}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <Wallet className="w-3.5 h-3.5 text-amber-400" /> Ngân sách khả dụng
            </p>
            <p className="font-mono-num tabular-nums text-xl font-extrabold text-white mt-1">
              €{career.transferBudget.toFixed(1)}M
            </p>
          </div>
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <ArrowDownLeft className="w-3.5 h-3.5 text-emerald-400" /> Tổng Thu ({activeSeason})
            </p>
            <p className="font-mono-num tabular-nums text-xl font-extrabold text-emerald-400 mt-1">
              +€{totals.totalIncome.toFixed(1)}M
            </p>
          </div>
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <ArrowUpRight className="w-3.5 h-3.5 text-rose-400" /> Tổng Chi ({activeSeason})
            </p>
            <p className="font-mono-num tabular-nums text-xl font-extrabold text-rose-400 mt-1">
              -€{totals.totalExpense.toFixed(1)}M
            </p>
          </div>
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3">
            <p className="text-[11px] text-slate-400 flex items-center gap-1">
              <Coins className="w-3.5 h-3.5 text-sky-400" /> Cân đối Thu – Chi
            </p>
            <p
              className={`font-mono-num tabular-nums text-xl font-extrabold mt-1 ${
                totals.net >= 0 ? 'text-emerald-400' : 'text-rose-400'
              }`}
            >
              {totals.net >= 0 ? `+€${totals.net.toFixed(1)}M` : `-€${Math.abs(totals.net).toFixed(1)}M`}
            </p>
            <p className="text-[10px] text-slate-400">
              {totals.net >= 0 ? 'Thặng dư ngân sách' : 'Thâm hụt dòng tiền'}
            </p>
          </div>
        </div>
      </div>

      {/* 2. End-of-Season Full Club Payroll Settlement */}
      <div
        className={`rounded-2xl border p-4 sm:p-5 space-y-4 ${
          isPayrollSettled
            ? 'bg-[#121B24] border-emerald-500/40'
            : leagueFinished
              ? 'bg-gradient-to-br from-[#1A2029] via-[#121B24] to-[#0E151C] border-amber-400/45'
              : 'bg-[#121B24] border-white/10'
        }`}
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-white/10 pb-3">
          <div>
            <div className="flex items-center gap-2 text-xs font-bold">
              <span className={isPayrollSettled ? 'text-emerald-400' : 'text-amber-400'}>
                Quyết Toán Lương Cuối Mùa {career.season}
              </span>
              <span aria-hidden="true" className="text-slate-600">
                ·
              </span>
              <span className="text-slate-300">
                {isPayrollSettled
                  ? 'Đã hoàn tất'
                  : leagueFinished
                    ? 'Bắt buộc trước khi sang mùa mới'
                    : 'Đang tạm tính'}
              </span>
            </div>
            <h4 className="font-display text-lg font-extrabold text-white mt-0.5">
              Bảng Quyết Toán Toàn Bộ Câu Lạc Bộ
            </h4>
          </div>
          <div className="text-left sm:text-right shrink-0">
            <p className="text-[11px] text-slate-400">Tổng chi phí quyết toán</p>
            <p className="font-mono-num tabular-nums text-2xl font-extrabold text-amber-400">
              €{currentPayroll.totalPayrollM.toFixed(1)}M
            </p>
          </div>
        </div>

        {/* 3 Payroll Pillars */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
          {/* Players */}
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" />
                Tổng Cầu Thủ ({currentPayroll.squadCount})
              </span>
              <span className="font-mono-num tabular-nums text-sm font-extrabold text-emerald-400">
                €{currentPayroll.squadSeasonWageM.toFixed(1)}M
              </span>
            </div>
            <p className="text-[11px] text-slate-400">
              Quỹ tuần: €{currentPayroll.squadWeeklyWageK.toLocaleString()}K / €
              {career.wageBudget.toLocaleString()}K ({wageUsagePct}%)
            </p>
            <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden">
              <div
                className={`h-full rounded-full ${
                  wageUsagePct >= 95 ? 'bg-rose-400' : 'bg-emerald-500'
                }`}
                style={{ width: `${wageUsagePct}%` }}
              />
            </div>
            <p className="text-[10px] text-slate-500">
              Quy đổi 10 kỳ lương thi đấu chính thức của toàn đội.
            </p>
          </div>

          {/* Manager */}
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Receipt className="w-4 h-4 text-amber-400" />
                Huấn Luyện Viên
              </span>
              <span className="font-mono-num tabular-nums text-sm font-extrabold text-amber-300">
                €{currentPayroll.managerAnnualSalaryM.toFixed(1)}M
              </span>
            </div>
            <p className="text-xs font-semibold text-slate-200 truncate">
              {currentPayroll.managerName}
            </p>
            <p className="text-[11px] text-slate-400">
              Bao gồm lương cơ bản mùa giải và phụ cấp ban huấn luyện trưởng.
            </p>
          </div>

          {/* Logistics & Staff */}
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2">
            <div className="flex items-center justify-between gap-2">
              <span className="text-xs font-bold text-white flex items-center gap-1.5">
                <Building2 className="w-4 h-4 text-sky-400" />
                Bộ Phận Hậu Cần (Ước lượng)
              </span>
              <span className="font-mono-num tabular-nums text-sm font-extrabold text-sky-300">
                €{currentPayroll.logisticsAndStaffM.toFixed(1)}M
              </span>
            </div>
            <div className="grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] text-slate-300">
              <span>Y tế &amp; Phục hồi:</span>
              <span className="font-mono-num text-right text-slate-200">
                €{currentPayroll.logisticsDetails.medicalM.toFixed(1)}M
              </span>
              <span>Tuyển trạch &amp; Trẻ:</span>
              <span className="font-mono-num text-right text-slate-200">
                €{currentPayroll.logisticsDetails.scoutingAcademyM.toFixed(1)}M
              </span>
              <span>Sân bãi &amp; An ninh:</span>
              <span className="font-mono-num text-right text-slate-200">
                €{currentPayroll.logisticsDetails.stadiumOpsM.toFixed(1)}M
              </span>
              <span>Di chuyển &amp; Hậu cần:</span>
              <span className="font-mono-num text-right text-slate-200">
                €{currentPayroll.logisticsDetails.travelAdminM.toFixed(1)}M
              </span>
            </div>
          </div>
        </div>

        {/* Toggle Player Wage Roster */}
        <div>
          <button
            type="button"
            onClick={() => setShowPlayerWages((v) => !v)}
            className="text-xs font-semibold text-sky-300 hover:text-sky-200 flex items-center gap-1"
          >
            {showPlayerWages ? (
              <>
                <ChevronUp className="w-4 h-4" /> Thu gọn bảng lương từng cầu thủ
              </>
            ) : (
              <>
                <ChevronDown className="w-4 h-4" /> Xem chi tiết lương từng cầu thủ ({sortedSquadByWage.length})
              </>
            )}
          </button>

          {showPlayerWages && (
            <div className="mt-2.5 rounded-xl bg-[#0B1117] border border-white/10 overflow-hidden">
              <div className="max-h-60 overflow-y-auto divide-y divide-white/5">
                {sortedSquadByWage.map((p) => {
                  const seasonShareM = Number(((p.wageK * 10) / 1000).toFixed(2));
                  return (
                    <div
                      key={p.id}
                      className="px-3.5 py-2 flex items-center justify-between gap-2 text-xs"
                    >
                      <div className="flex items-center gap-2 min-w-0">
                        <span className="w-8 text-center py-0.5 rounded bg-[#121B24] border border-white/10 font-mono-num text-[10px] font-bold text-amber-400 shrink-0">
                          {p.position}
                        </span>
                        <span className="font-semibold text-white truncate">{p.name}</span>
                        <span className="text-[11px] text-slate-400 shrink-0">
                          HĐ {p.contractUntil}
                        </span>
                      </div>
                      <div className="text-right shrink-0 font-mono-num tabular-nums">
                        <span className="text-slate-300 mr-2">€{p.wageK}K/tuần</span>
                        <span className="font-bold text-amber-300">€{seasonShareM}M/mùa</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>

        {feedback && (
          <div
            className={`rounded-xl px-3.5 py-2.5 text-xs font-semibold flex items-center gap-2 border ${
              feedback.ok
                ? 'bg-emerald-500/15 border-emerald-500/40 text-emerald-200'
                : 'bg-rose-500/15 border-rose-500/40 text-rose-200'
            }`}
          >
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>{feedback.message}</span>
          </div>
        )}

        {/* Settlement Action Area */}
        {!isPayrollSettled && leagueFinished && shortfallM > 0 && (
          <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 p-3 text-xs text-amber-200 flex items-start gap-2">
            <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0 mt-0.5" />
            <div>
              <p className="font-bold">
                Ngân sách hiện thiếu €{shortfallM.toFixed(1)}M để thanh toán đủ €
                {currentPayroll.totalPayrollM.toFixed(1)}M.
              </p>
              <p className="text-[11px] text-amber-200/85 mt-0.5">
                {!rewardBundle.alreadyClaimed
                  ? `Bạn nên bấm "Nhận Thưởng Mùa Giải (+€${rewardBundle.totalPrizeM}M)" trước để đủ ngân sách quyết toán!`
                  : 'Nếu quyết toán ngay, Ban Lãnh Đạo sẽ tạm ứng quỹ dự phòng bù phần thiếu (uy tín BHL -5%).'}
              </p>
            </div>
          </div>
        )}

        <div className="flex flex-col sm:flex-row gap-2.5">
          {isPayrollSettled ? (
            <>
              <div className="flex-1 h-11 rounded-xl bg-emerald-500/15 border border-emerald-500/45 text-emerald-300 font-bold text-xs px-4 flex items-center justify-center gap-2">
                <CheckCircle2 className="w-4 h-4 shrink-0" />
                Đã Quyết Toán Đầy Đủ Lương Mùa {career.season} · Đủ Điều Kiện Sang Mùa Mới
              </div>
              {leagueFinished && onStartNextSeason && (
                <button
                  type="button"
                  disabled={startingNext}
                  onClick={handleNextSeason}
                  className="h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60 whitespace-nowrap"
                >
                  <RefreshCw className={`w-4 h-4 ${startingNext ? 'animate-spin' : ''}`} />
                  {startingNext
                    ? `Đang sang mùa ${nextSeasonLabel}...`
                    : `Khởi Tranh Mùa ${nextSeasonLabel}`}
                </button>
              )}
            </>
          ) : !leagueFinished ? (
            <div className="w-full h-11 rounded-xl bg-[#0B1117] border border-white/10 text-slate-400 font-semibold text-xs px-4 flex items-center justify-center gap-2">
              <Lock className="w-4 h-4 text-slate-500 shrink-0" />
              Hoàn thành vòng đấu cuối Super League để mở khóa Quyết toán Lương Mùa {career.season}
            </div>
          ) : (
            <>
              {!rewardBundle.alreadyClaimed && onClaimSeasonRewards && (
                <button
                  type="button"
                  disabled={claimingRewards}
                  onClick={handleClaim}
                  className="h-11 px-4 rounded-xl bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs flex items-center justify-center gap-1.5 disabled:opacity-60 whitespace-nowrap"
                >
                  <Gift className="w-4 h-4 shrink-0" />
                  {claimingRewards
                    ? 'Đang nhận...'
                    : `Nhận Thưởng Mùa Giải (+€${rewardBundle.totalPrizeM}M)`}
                </button>
              )}
              <button
                type="button"
                disabled={settlingPayroll}
                onClick={handleSettle}
                className="flex-1 h-11 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs sm:text-sm flex items-center justify-center gap-2 disabled:opacity-60 whitespace-nowrap"
              >
                <Coins className="w-4 h-4 shrink-0" />
                {settlingPayroll
                  ? 'Đang thực hiện quyết toán...'
                  : shortfallM > 0
                    ? `Quyết Toán Lương Toàn CLB (BHL Bù €${shortfallM}M)`
                    : `Quyết Toán Quỹ Lương Toàn CLB (-€${currentPayroll.totalPayrollM.toFixed(1)}M)`}
              </button>
            </>
          )}
        </div>
      </div>

      {/* 3. Season Income & Expense Breakdown Ledger */}
      <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div>
            <h4 className="text-sm font-bold text-white">
              Chi Tiết Thu – Chi Mùa Giải {activeSeason}
            </h4>
            <p className="text-[11px] text-slate-400">
              Liệt kê toàn bộ nguồn thu và khoản chi thực tế phát sinh trong mùa {activeSeason}.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-1 p-1 rounded-lg bg-[#0B1117] border border-white/10">
              {[
                { id: 'all', label: 'Tất cả' },
                { id: 'income', label: 'Khoản Thu' },
                { id: 'expense', label: 'Khoản Chi' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => setLedgerFilter(t.id as typeof ledgerFilter)}
                  className={`px-2.5 py-1 rounded text-xs font-semibold transition-colors whitespace-nowrap ${
                    ledgerFilter === t.id
                      ? 'bg-emerald-500 text-slate-950'
                      : 'text-slate-300 hover:text-white'
                  }`}
                >
                  {t.label}
                </button>
              ))}
            </div>
            <select
              value={categoryFilter}
              onChange={(e) => setCategoryFilter(e.target.value as typeof categoryFilter)}
              className="h-8 rounded-lg bg-[#0B1117] border border-white/10 px-2.5 text-xs text-slate-200 focus:outline-none focus:border-emerald-400"
              aria-label="Lọc theo hạng mục tài chính"
            >
              <option value="all">Tất cả hạng mục</option>
              {(Object.keys(CATEGORY_LABELS) as FinancialLedgerCategory[]).map((cat) => (
                <option key={cat} value={cat}>
                  {CATEGORY_LABELS[cat]}
                </option>
              ))}
            </select>
          </div>
        </div>

        {/* Category Totals Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3 text-xs">
          <div className="rounded-xl bg-[#0B1117] border border-emerald-500/25 p-3.5 space-y-2">
            <p className="font-bold text-emerald-400 flex items-center justify-between">
              <span>Cơ Cấu Các Khoản Thu</span>
              <span className="font-mono-num">+€{totals.totalIncome.toFixed(1)}M</span>
            </p>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-300">
                <span>Thưởng trận đấu (VĐQG, Cúp, Giao hữu, Online)</span>
                <span className="font-mono-num font-bold text-emerald-300">
                  +€{(totals.byCategory.match_prize ?? 0).toFixed(1)}M
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Thưởng danh hiệu &amp; Tổng kết mùa giải</span>
                <span className="font-mono-num font-bold text-emerald-300">
                  +€
                  {(
                    (totals.byCategory.competition_bonus ?? 0) +
                    (totals.byCategory.season_reward ?? 0)
                  ).toFixed(1)}
                  M
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Thu chuyển nhượng bán cầu thủ</span>
                <span className="font-mono-num font-bold text-emerald-300">
                  +€{(totals.byCategory.player_sale ?? 0).toFixed(1)}M
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Hoàn tiền / Quà mở gói thẻ</span>
                <span className="font-mono-num font-bold text-emerald-300">
                  +€{(totals.byCategory.pack_refund ?? 0).toFixed(1)}M
                </span>
              </div>
            </div>
          </div>

          <div className="rounded-xl bg-[#0B1117] border border-rose-500/25 p-3.5 space-y-2">
            <p className="font-bold text-rose-400 flex items-center justify-between">
              <span>Cơ Cấu Các Khoản Chi</span>
              <span className="font-mono-num">-€{totals.totalExpense.toFixed(1)}M</span>
            </p>
            <div className="space-y-1 text-[11px]">
              <div className="flex justify-between text-slate-300">
                <span>Mua cầu thủ trên thị trường chuyển nhượng</span>
                <span className="font-mono-num font-bold text-rose-300">
                  -€{(totals.byCategory.player_purchase ?? 0).toFixed(1)}M
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Chi phí bồi thường &amp; giải phóng hợp đồng</span>
                <span className="font-mono-num font-bold text-rose-300">
                  -€{(totals.byCategory.contract_compensation ?? 0).toFixed(1)}M
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Quyết toán quỹ lương cuối mùa toàn CLB</span>
                <span className="font-mono-num font-bold text-rose-300">
                  -€{(totals.byCategory.payroll_settlement ?? 0).toFixed(1)}M
                </span>
              </div>
              <div className="flex justify-between text-slate-300">
                <span>Mua gói thẻ, nâng sao &amp; chi phí y tế</span>
                <span className="font-mono-num font-bold text-rose-300">
                  -€
                  {(
                    (totals.byCategory.pack_purchase ?? 0) +
                    (totals.byCategory.star_upgrade ?? 0) +
                    (totals.byCategory.medical_recovery ?? 0)
                  ).toFixed(1)}
                  M
                </span>
              </div>
            </div>
          </div>
        </div>

        {/* Itemized Lists */}
        <div
          className={`grid grid-cols-1 ${
            ledgerFilter === 'all' ? 'lg:grid-cols-2' : ''
          } gap-4`}
        >
          {(ledgerFilter === 'all' || ledgerFilter === 'income') && (
            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-emerald-400">
                  Danh Sách Các Khoản Thu ({incomeEntries.length})
                </span>
                <span className="font-mono-num text-xs font-bold text-emerald-300">
                  +€{incomeEntries.reduce((s, e) => s + e.amountM, 0).toFixed(1)}M
                </span>
              </div>
              {incomeEntries.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Chưa có khoản thu nào khớp bộ lọc trong mùa {activeSeason}.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-white/5 pr-1">
                  {incomeEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="py-2.5 first:pt-1 last:pb-1 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{entry.title}</p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {CATEGORY_LABELS[entry.category]} · Vòng {entry.matchweek}
                          {entry.date ? ` · ${formatEntryDate(entry.date)}` : ''}
                          {entry.detail ? ` · ${entry.detail}` : ''}
                        </p>
                      </div>
                      <span className="font-mono-num tabular-nums text-xs font-extrabold text-emerald-400 shrink-0">
                        +€{entry.amountM.toFixed(1)}M
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {(ledgerFilter === 'all' || ledgerFilter === 'expense') && (
            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between border-b border-white/10 pb-2">
                <span className="text-xs font-bold text-rose-400">
                  Danh Sách Các Khoản Chi ({expenseEntries.length})
                </span>
                <span className="font-mono-num text-xs font-bold text-rose-300">
                  -€{expenseEntries.reduce((s, e) => s + e.amountM, 0).toFixed(1)}M
                </span>
              </div>
              {expenseEntries.length === 0 ? (
                <p className="text-xs text-slate-400 py-6 text-center">
                  Chưa có khoản chi nào khớp bộ lọc trong mùa {activeSeason}.
                </p>
              ) : (
                <div className="max-h-80 overflow-y-auto divide-y divide-white/5 pr-1">
                  {expenseEntries.map((entry) => (
                    <div
                      key={entry.id}
                      className="py-2.5 first:pt-1 last:pb-1 flex items-start justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-semibold text-white truncate">{entry.title}</p>
                        <p className="text-[11px] text-slate-400 truncate mt-0.5">
                          {CATEGORY_LABELS[entry.category]} · Vòng {entry.matchweek}
                          {entry.date ? ` · ${formatEntryDate(entry.date)}` : ''}
                          {entry.detail ? ` · ${entry.detail}` : ''}
                        </p>
                      </div>
                      <span className="font-mono-num tabular-nums text-xs font-extrabold text-rose-400 shrink-0">
                        -€{entry.amountM.toFixed(1)}M
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}
        </div>
      </div>

      {/* 4. Historical Season Payroll Settlements */}
      {(career.payrollHistory ?? []).length > 0 && (
        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 sm:p-5 space-y-3">
          <h4 className="text-sm font-bold text-white">Lịch Sử Quyết Toán Quỹ Lương Các Mùa</h4>
          <div className="divide-y divide-white/10">
            {(career.payrollHistory ?? []).map((rec) => (
              <div
                key={`payroll-hist-${rec.season}`}
                className="py-2.5 first:pt-1 last:pb-0 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs"
              >
                <div className="min-w-0">
                  <p className="font-bold text-white">
                    Mùa {rec.season} · HLV {rec.managerName}
                  </p>
                  <p className="text-[11px] text-slate-400">
                    Cầu thủ ({rec.squadCount}): €{rec.squadSeasonWageM.toFixed(1)}M · HLV: €
                    {rec.managerAnnualSalaryM.toFixed(1)}M · Hậu cần: €
                    {rec.logisticsAndStaffM.toFixed(1)}M
                    {rec.bailoutUsedM && rec.bailoutUsedM > 0
                      ? ` · BHL bù €${rec.bailoutUsedM.toFixed(1)}M`
                      : ''}
                  </p>
                </div>
                <span className="font-mono-num tabular-nums font-extrabold text-amber-400 shrink-0">
                  Tổng: €{rec.totalPayrollM.toFixed(1)}M
                </span>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
};
