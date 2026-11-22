import React, { useMemo, useState } from 'react';
import { Award, Crown, Flame, History, Search, Shield, Swords, Trophy } from 'lucide-react';
import { CLUBS } from '../data/footballDatabase';
import { ensureClubRecords } from '../lib/legacyAcademyEngine';
import { CareerSave, ClubPlayerCareerRecord } from '../types/game';
import { ClubCrest } from './ClubBadgeAndAvatar';

interface ClubRecordsPanelProps {
  career: CareerSave;
}

type LegendSortKey = 'goals' | 'assists' | 'appearances' | 'ga' | 'motm';

export const ClubRecordsPanel: React.FC<ClubRecordsPanelProps> = ({ career }) => {
  const [subSection, setSubSection] = useState<'legends' | 'h2h' | 'history'>('legends');
  const [legendSort, setLegendSort] = useState<LegendSortKey>('goals');
  const [legendQuery, setLegendQuery] = useState('');
  const [h2hQuery, setH2hQuery] = useState('');

  const club = useMemo(
    () => CLUBS.find((c) => c.id === career.clubId) ?? CLUBS[0],
    [career.clubId]
  );
  const records = useMemo(() => ensureClubRecords(career), [career]);

  const legendsList = useMemo(() => {
    const raw = Object.values(records.playerLegends) as ClubPlayerCareerRecord[];
    const q = legendQuery.trim().toLowerCase();
    const filtered = q
      ? raw.filter(
          (p) =>
            p.playerName.toLowerCase().includes(q) ||
            p.position.toLowerCase().includes(q) ||
            p.nationality.toLowerCase().includes(q)
        )
      : raw;

    return [...filtered].sort((a, b) => {
      if (legendSort === 'goals') {
        return b.goals - a.goals || b.assists - a.assists || b.appearances - a.appearances;
      }
      if (legendSort === 'assists') {
        return b.assists - a.assists || b.goals - a.goals || b.appearances - a.appearances;
      }
      if (legendSort === 'appearances') {
        return b.appearances - a.appearances || b.goals - a.goals;
      }
      if (legendSort === 'motm') {
        return b.motmCount - a.motmCount || b.goals + b.assists - (a.goals + a.assists);
      }
      return b.goals + b.assists - (a.goals + a.assists) || b.appearances - a.appearances;
    });
  }, [records.playerLegends, legendQuery, legendSort]);

  const topScorer = useMemo(
    () =>
      [...(Object.values(records.playerLegends) as ClubPlayerCareerRecord[])].sort(
        (a, b) => b.goals - a.goals || b.appearances - a.appearances
      )[0],
    [records.playerLegends]
  );
  const topAssister = useMemo(
    () =>
      [...(Object.values(records.playerLegends) as ClubPlayerCareerRecord[])].sort(
        (a, b) => b.assists - a.assists || b.appearances - a.appearances
      )[0],
    [records.playerLegends]
  );
  const mostCapped = useMemo(
    () =>
      [...(Object.values(records.playerLegends) as ClubPlayerCareerRecord[])].sort(
        (a, b) => b.appearances - a.appearances || b.goals - a.goals
      )[0],
    [records.playerLegends]
  );
  const mostMotm = useMemo(
    () =>
      [...(Object.values(records.playerLegends) as ClubPlayerCareerRecord[])].sort(
        (a, b) => b.motmCount - a.motmCount || b.goals + b.assists - (a.goals + a.assists)
      )[0],
    [records.playerLegends]
  );

  const h2hRows = useMemo(() => {
    const q = h2hQuery.trim().toLowerCase();
    return CLUBS.filter((c) => c.id !== career.clubId)
      .map((opp) => {
        const stat = records.headToHead[opp.id] ?? {
          opponentClubId: opp.id,
          played: 0,
          won: 0,
          drawn: 0,
          lost: 0,
          gf: 0,
          ga: 0,
        };
        const winRate = stat.played > 0 ? Math.round((stat.won / stat.played) * 100) : 0;
        return { opp, stat, winRate };
      })
      .filter(({ opp }) => !q || opp.name.toLowerCase().includes(q) || opp.shortName.toLowerCase().includes(q))
      .sort((a, b) => b.stat.played - a.stat.played || b.winRate - a.winRate || a.opp.name.localeCompare(b.opp.name));
  }, [career.clubId, records.headToHead, h2hQuery]);

  const winRateAllTime =
    records.totalMatches > 0 ? ((records.wins / records.totalMatches) * 100).toFixed(1) : '0.0';

  const biggestWinOpp = records.biggestWin
    ? CLUBS.find((c) => c.id === records.biggestWin?.opponentClubId)
    : undefined;
  const highestMatchOpp = records.highestScoringMatch
    ? CLUBS.find((c) => c.id === records.highestScoringMatch?.opponentClubId)
    : undefined;

  const allTrophies = career.trophyCabinet ?? [];
  const teamTrophiesCount = allTrophies.filter(
    (t) => t.awardType !== 'mvp' && t.awardType !== 'top-scorer'
  ).length;
  const individualTrophiesCount = allTrophies.length - teamTrophiesCount;

  return (
    <div className="space-y-4">
      {/* Club Legacy Header & 4 All-Time KPI Tiles */}
      <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 sm:p-5 space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="flex items-center gap-3">
            <ClubCrest club={club} size={42} />
            <div>
              <p className="text-xs text-amber-400 font-semibold">
                Di sản Lịch sử · {club.name}
              </p>
              <h3 className="font-display text-xl sm:text-2xl font-extrabold text-white">
                Ngôi đền Huyền thoại &amp; Kỷ lục Mọi Thời Đại
              </h3>
            </div>
          </div>
          <div className="text-left sm:text-right text-xs text-slate-400">
            <p>
              Danh hiệu CLB: <strong className="font-mono-num text-amber-400 tabular-nums">{teamTrophiesCount}</strong> · Cá nhân:{' '}
              <strong className="font-mono-num text-emerald-400 tabular-nums">{individualTrophiesCount}</strong>
            </p>
            <p>
              Số mùa đã qua: <strong className="font-mono-num text-white tabular-nums">{career.seasonHistory?.length ?? 0}</strong> mùa hoàn tất
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5">
            <p className="text-[11px] text-slate-400">Thành tích chính thức</p>
            <p className="font-mono-num text-lg font-extrabold text-white mt-1 tabular-nums">
              {records.wins}T · {records.draws}H · {records.losses}B
            </p>
            <p className="text-[11px] text-emerald-400 font-mono-num mt-0.5 tabular-nums">
              {records.totalMatches} trận · Tỷ lệ thắng {winRateAllTime}% · {records.goalsFor}:{records.goalsAgainst}
            </p>
          </div>

          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5">
            <p className="text-[11px] text-slate-400">Chuỗi Bất bại / Toàn thắng</p>
            <p className="font-mono-num text-lg font-extrabold text-amber-400 mt-1 tabular-nums">
              {records.longestUnbeatenStreak} bất bại · {records.longestWinStreak} thắng
            </p>
            <p className="text-[11px] text-slate-400 font-mono-num mt-0.5 tabular-nums">
              Hiện tại: {records.currentUnbeatenStreak} bất bại · {records.currentWinStreak} thắng
            </p>
          </div>

          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5">
            <p className="text-[11px] text-slate-400">Chiến thắng Đậm nhất</p>
            {records.biggestWin ? (
              <>
                <p className="font-mono-num text-lg font-extrabold text-emerald-400 mt-1 tabular-nums">
                  {records.biggestWin.scoreText} vs {biggestWinOpp?.shortName ?? records.biggestWin.opponentClubId}
                </p>
                <p className="text-[11px] text-slate-400 truncate mt-0.5">
                  {records.biggestWin.competitionLabel} · Mùa {records.biggestWin.season}
                </p>
              </>
            ) : (
              <p className="text-xs text-slate-500 mt-1.5">Chưa có chiến thắng chính thức</p>
            )}
          </div>

          <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5">
            <p className="text-[11px] text-slate-400">Trận nhiều bàn &amp; Đỉnh ĐH</p>
            <p className="font-mono-num text-lg font-extrabold text-sky-400 mt-1 tabular-nums">
              {records.highestScoringMatch
                ? `${records.highestScoringMatch.scoreText} vs ${highestMatchOpp?.shortName ?? records.highestScoringMatch.opponentClubId}`
                : 'Chưa có dữ liệu'}
            </p>
            <p className="text-[11px] text-slate-400 font-mono-num mt-0.5 tabular-nums">
              Đỉnh giá trị €{(records.peakSquadValueM ?? 0).toFixed(1)}M · {records.peakSquadOvr ?? 0} OVR
            </p>
          </div>
        </div>
      </div>

      {/* Sub-navigation */}
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
          {[
            { id: 'legends', label: `Ngôi đền Huyền thoại (${legendsList.length})` },
            { id: 'h2h', label: 'Đối đầu Super League (19 CLB)' },
            { id: 'history', label: `Lịch sử các mùa (${career.seasonHistory?.length ?? 0})` },
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubSection(tab.id as typeof subSection)}
              className={`h-9 px-3 rounded-lg text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                subSection === tab.id
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {subSection === 'legends' && (
        <div className="space-y-4">
          {/* 4 Iconic Club Record Holders */}
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2.5">
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-1">
              <p className="text-[11px] text-emerald-400 font-semibold flex items-center gap-1.5">
                <Flame className="w-3.5 h-3.5" /> Chân sút Vĩ đại nhất
              </p>
              <p className="text-sm font-bold text-white truncate">
                {topScorer ? topScorer.playerName : 'Chưa có dữ liệu'}
              </p>
              <p className="font-mono-num text-xl font-extrabold text-white tabular-nums">
                {topScorer ? `${topScorer.goals} bàn` : '0 bàn'}
              </p>
              <p className="text-[11px] text-slate-400 font-mono-num tabular-nums">
                {topScorer ? `${topScorer.appearances} trận · ${topScorer.position}` : 'Đá để ghi danh'}
              </p>
            </div>

            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-1">
              <p className="text-[11px] text-sky-400 font-semibold flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5" /> Vua Kiến tạo Lịch sử
              </p>
              <p className="text-sm font-bold text-white truncate">
                {topAssister ? topAssister.playerName : 'Chưa có dữ liệu'}
              </p>
              <p className="font-mono-num text-xl font-extrabold text-white tabular-nums">
                {topAssister ? `${topAssister.assists} KT` : '0 KT'}
              </p>
              <p className="text-[11px] text-slate-400 font-mono-num tabular-nums">
                {topAssister ? `${topAssister.appearances} trận · ${topAssister.position}` : 'Đá để ghi danh'}
              </p>
            </div>

            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-1">
              <p className="text-[11px] text-amber-400 font-semibold flex items-center gap-1.5">
                <Shield className="w-3.5 h-3.5" /> Ra sân nhiều nhất
              </p>
              <p className="text-sm font-bold text-white truncate">
                {mostCapped ? mostCapped.playerName : 'Chưa có dữ liệu'}
              </p>
              <p className="font-mono-num text-xl font-extrabold text-white tabular-nums">
                {mostCapped ? `${mostCapped.appearances} trận` : '0 trận'}
              </p>
              <p className="text-[11px] text-slate-400 font-mono-num tabular-nums">
                {mostCapped ? `${mostCapped.seasonsActive.length} mùa gắn bó` : 'Đá để ghi danh'}
              </p>
            </div>

            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-1">
              <p className="text-[11px] text-amber-300 font-semibold flex items-center gap-1.5">
                <Crown className="w-3.5 h-3.5" /> Cầu thủ Xuất sắc trận
              </p>
              <p className="text-sm font-bold text-white truncate">
                {mostMotm ? mostMotm.playerName : 'Chưa có dữ liệu'}
              </p>
              <p className="font-mono-num text-xl font-extrabold text-white tabular-nums">
                {mostMotm ? `${mostMotm.motmCount} MOTM` : '0 MOTM'}
              </p>
              <p className="text-[11px] text-slate-400 font-mono-num tabular-nums">
                {mostMotm ? `Đỉnh ${mostMotm.peakRating} OVR` : 'Đá để ghi danh'}
              </p>
            </div>
          </div>

          {/* Search & Sort Controls + Full Table */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
              <div className="relative flex-1 max-w-xs">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={legendQuery}
                  onChange={(e) => setLegendQuery(e.target.value)}
                  placeholder="Tìm huyền thoại, vị trí, quốc tịch..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#0B1117] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
                />
              </div>

              <div className="flex flex-wrap items-center gap-1">
                {[
                  { id: 'goals', label: 'Bàn thắng' },
                  { id: 'assists', label: 'Kiến tạo' },
                  { id: 'ga', label: 'G + A' },
                  { id: 'appearances', label: 'Số trận' },
                  { id: 'motm', label: 'MOTM' },
                ].map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setLegendSort(s.id as LegendSortKey)}
                    className={`h-8 px-2.5 rounded-lg text-[11px] font-semibold border whitespace-nowrap shrink-0 ${
                      legendSort === s.id
                        ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                        : 'bg-[#0B1117] border-white/10 text-slate-300'
                    }`}
                  >
                    {s.label}
                  </button>
                ))}
              </div>
            </div>

            {legendsList.length === 0 ? (
              <div className="rounded-xl bg-[#0B1117] border border-white/10 p-8 text-center text-xs text-slate-400">
                Hãy thi đấu các trận chính thức tại Super League, Cúp C1 hoặc Cúp Quốc Gia để các cầu thủ bắt đầu ghi danh vào Ngôi đền Huyền thoại CLB.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-white/10 text-[11px] text-slate-400">
                      <th className="py-2.5 px-2 font-semibold">#</th>
                      <th className="py-2.5 px-2 font-semibold">Cầu thủ</th>
                      <th className="py-2.5 px-2 font-semibold">Vị trí</th>
                      <th className="py-2.5 px-2 font-semibold text-right">Trận</th>
                      <th className="py-2.5 px-2 font-semibold text-right">Bàn</th>
                      <th className="py-2.5 px-2 font-semibold text-right">KT</th>
                      <th className="py-2.5 px-2 font-semibold text-right">G+A</th>
                      <th className="py-2.5 px-2 font-semibold text-right">MOTM</th>
                      <th className="py-2.5 px-2 font-semibold text-right">Đỉnh OVR</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-white/5 text-xs">
                    {legendsList.slice(0, 40).map((pl, idx) => (
                      <tr key={pl.playerId} className="hover:bg-white/[0.03] transition-colors">
                        <td className="py-2.5 px-2 font-mono-num text-slate-400 tabular-nums">
                          {idx + 1}
                        </td>
                        <td className="py-2.5 px-2">
                          <p className="font-bold text-white">{pl.playerName}</p>
                          <p className="text-[11px] text-slate-400">
                            {pl.nationality} · {pl.seasonsActive.length} mùa
                            {pl.isYouthGraduate ? ' · Trưởng thành từ Học viện' : ''}
                          </p>
                        </td>
                        <td className="py-2.5 px-2 font-mono-num text-slate-300">{pl.position}</td>
                        <td className="py-2.5 px-2 font-mono-num text-right text-slate-200 tabular-nums">
                          {pl.appearances}
                        </td>
                        <td className="py-2.5 px-2 font-mono-num text-right font-bold text-emerald-400 tabular-nums">
                          {pl.goals}
                        </td>
                        <td className="py-2.5 px-2 font-mono-num text-right font-bold text-sky-400 tabular-nums">
                          {pl.assists}
                        </td>
                        <td className="py-2.5 px-2 font-mono-num text-right font-bold text-white tabular-nums">
                          {pl.goals + pl.assists}
                        </td>
                        <td className="py-2.5 px-2 font-mono-num text-right text-amber-400 tabular-nums">
                          {pl.motmCount}
                        </td>
                        <td className="py-2.5 px-2 font-mono-num text-right text-slate-300 tabular-nums">
                          {pl.peakRating}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        </div>
      )}

      {subSection === 'h2h' && (
        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h4 className="text-sm font-bold text-white flex items-center gap-2">
                <Swords className="w-4 h-4 text-emerald-400" />
                Lịch sử Đối đầu Toàn thời gian (Head-to-Head)
              </h4>
              <p className="text-xs text-slate-400">
                Tổng hợp toàn bộ các trận chính thức giữa {club.shortName} và 19 CLB Super League qua các mùa.
              </p>
            </div>
            <div className="relative w-full sm:w-56">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={h2hQuery}
                onChange={(e) => setH2hQuery(e.target.value)}
                placeholder="Lọc đối thủ..."
                className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#0B1117] border border-white/10 text-xs text-white placeholder:text-slate-500 focus:outline-none focus:border-emerald-500/50"
              />
            </div>
          </div>

          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-white/10 text-[11px] text-slate-400">
                  <th className="py-2.5 px-2 font-semibold">Đối thủ</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Trận</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Thắng</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Hòa</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Bại</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Bàn thắng/Bại</th>
                  <th className="py-2.5 px-2 font-semibold text-right">Tỷ lệ thắng</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-white/5 text-xs">
                {h2hRows.map(({ opp, stat, winRate }) => (
                  <tr key={opp.id} className="hover:bg-white/[0.03] transition-colors">
                    <td className="py-2.5 px-2">
                      <div className="flex items-center gap-2.5">
                        <ClubCrest club={opp} size={26} />
                        <div>
                          <p className="font-bold text-white">{opp.name}</p>
                          <p className="text-[11px] text-slate-400">{opp.league}</p>
                        </div>
                      </div>
                    </td>
                    <td className="py-2.5 px-2 font-mono-num text-right text-slate-200 tabular-nums">
                      {stat.played}
                    </td>
                    <td className="py-2.5 px-2 font-mono-num text-right font-bold text-emerald-400 tabular-nums">
                      {stat.won}
                    </td>
                    <td className="py-2.5 px-2 font-mono-num text-right text-slate-300 tabular-nums">
                      {stat.drawn}
                    </td>
                    <td className="py-2.5 px-2 font-mono-num text-right text-red-400 tabular-nums">
                      {stat.lost}
                    </td>
                    <td className="py-2.5 px-2 font-mono-num text-right text-slate-300 tabular-nums">
                      {stat.gf} : {stat.ga}
                    </td>
                    <td className="py-2.5 px-2 font-mono-num text-right font-bold text-amber-400 tabular-nums">
                      {stat.played > 0 ? `${winRate}%` : '—'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {subSection === 'history' && (
        <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
          <div className="flex items-center justify-between gap-2">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <History className="w-4 h-4 text-amber-400" />
              Dòng thời gian Các Mùa giải &amp; Danh hiệu
            </h4>
            <span className="font-mono-num text-xs text-slate-400 tabular-nums">
              {allTrophies.length} danh hiệu
            </span>
          </div>

          {!career.seasonHistory || career.seasonHistory.length === 0 ? (
            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-8 text-center text-xs text-slate-400">
              Hoàn tất mùa giải {career.season} và bước sang mùa mới để lưu mốc lịch sử đầu tiên vào biên niên sử CLB.
            </div>
          ) : (
            <div className="space-y-2.5">
              {career.seasonHistory.map((rec) => {
                const champ = CLUBS.find((c) => c.id === rec.championClubId);
                return (
                  <div
                    key={`${rec.season}-${rec.clubId}`}
                    className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <div className="flex items-center gap-2 text-xs">
                        <span className="font-mono-num font-extrabold text-emerald-400">
                          Mùa {rec.season}
                        </span>
                        <span className="text-slate-500">·</span>
                        <span className="font-bold text-white tabular-nums">
                          Hạng #{rec.leagueRank} ({rec.points} điểm)
                        </span>
                      </div>
                      <span className="text-xs text-slate-400">
                        VĐQG: <strong className="text-amber-300">{champ?.shortName ?? rec.championClubId}</strong>
                      </span>
                    </div>
                    <p className="text-xs text-slate-300">
                      Vua phá lưới: <strong className="text-white">{rec.topScorerName}</strong> ({rec.topScorerGoals} bàn)
                      {rec.mvpPlayerName ? ` · MVP: ${rec.mvpPlayerName}` : ''}
                    </p>
                    {rec.trophiesWon.length > 0 && (
                      <p className="text-xs text-amber-300 flex items-center gap-1.5">
                        <Trophy className="w-3.5 h-3.5 shrink-0" />
                        <span>{rec.trophiesWon.join(' · ')}</span>
                      </p>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
};
