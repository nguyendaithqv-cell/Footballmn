import React, { useEffect, useMemo, useState } from 'react';
import { Award, BarChart3, MapPin, Shield, Star, Users, X } from 'lucide-react';
import { CLUBS, REAL_MANAGERS } from '../data/footballDatabase';
import { MatchEvent, MatchPlayerRating, MatchResultSummary, Position } from '../types/game';
import { ClubCrest } from './ClubBadgeAndAvatar';

interface MatchStatsBreakdownProps {
  match: MatchResultSummary;
  userClubId: string;
}

const POSITION_ORDER: Record<Position, number> = {
  GK: 0,
  LB: 1,
  CB: 2,
  RB: 3,
  CDM: 4,
  CM: 5,
  CAM: 6,
  LW: 7,
  RW: 8,
  ST: 9,
};

function getRatingBadgeClass(rating: number): string {
  if (rating >= 8.0) return 'bg-emerald-500/20 text-emerald-300 border-emerald-400/40';
  if (rating >= 7.0) return 'bg-sky-500/20 text-sky-300 border-sky-400/40';
  if (rating >= 6.0) return 'bg-amber-500/20 text-amber-300 border-amber-400/40';
  return 'bg-red-500/20 text-red-300 border-red-400/40';
}

function getPerformanceLabel(rating: number): string {
  if (rating >= 8.5) return 'Rực sáng';
  if (rating >= 8.0) return 'Xuất sắc';
  if (rating >= 7.0) return 'Tốt';
  if (rating >= 6.0) return 'Tròn vai';
  return 'Dưới sức';
}

export const MatchStatsBreakdown: React.FC<MatchStatsBreakdownProps> = ({
  match,
  userClubId,
}) => {
  const hClub = CLUBS.find((c) => c.id === match.homeClubId) ?? CLUBS[0];
  const aClub = CLUBS.find((c) => c.id === match.awayClubId) ?? CLUBS[1];
  const hMgr = REAL_MANAGERS.find((m) => m.id === hClub.managerId);
  const aMgr = REAL_MANAGERS.find((m) => m.id === aClub.managerId);

  const isSameClub = match.homeClubId === match.awayClubId;
  const defaultSide: 'home' | 'away' =
    userClubId === match.awayClubId && userClubId !== match.homeClubId ? 'away' : 'home';

  const [activeTab, setActiveTab] = useState<'stats' | 'ratings'>('stats');
  const [selectedSide, setSelectedSide] = useState<'home' | 'away'>(defaultSide);

  useEffect(() => {
    setActiveTab('stats');
    setSelectedSide(
      userClubId === match.awayClubId && userClubId !== match.homeClubId ? 'away' : 'home'
    );
  }, [match.id, match.homeClubId, match.awayClubId, userClubId]);

  const possHome = match.possessionHome;
  const possAway = 100 - possHome;
  const shotsOnTargetHome =
    match.shotsOnTargetHome ?? Math.max(match.homeGoals, Math.round(match.shotsHome * 0.4));
  const shotsOnTargetAway =
    match.shotsOnTargetAway ?? Math.max(match.awayGoals, Math.round(match.shotsAway * 0.4));
  const cornersHome = match.cornersHome ?? Math.max(1, Math.round(match.shotsHome * 0.4));
  const cornersAway = match.cornersAway ?? Math.max(1, Math.round(match.shotsAway * 0.4));
  const foulsHome = match.foulsHome ?? 8;
  const foulsAway = match.foulsAway ?? 9;
  const matchesHomeEvent = (e: MatchEvent) =>
    isSameClub && match.homeManagerName
      ? e.description.includes(match.homeManagerName)
      : e.teamId === match.homeClubId;
  const matchesAwayEvent = (e: MatchEvent) =>
    isSameClub && match.awayManagerName
      ? e.description.includes(match.awayManagerName)
      : e.teamId === match.awayClubId;

  const yellowsHome =
    match.yellowsHome ??
    match.events.filter((e) => e.type === 'yellow' && matchesHomeEvent(e)).length;
  const yellowsAway =
    match.yellowsAway ??
    match.events.filter((e) => e.type === 'yellow' && matchesAwayEvent(e)).length;

  const homeGoalsEvents = match.events
    .filter((e) => e.type === 'goal' && matchesHomeEvent(e))
    .sort((a, b) => a.minute - b.minute);
  const awayGoalsEvents = match.events
    .filter((e) => e.type === 'goal' && matchesAwayEvent(e))
    .sort((a, b) => a.minute - b.minute);

  const statRows = [
    { label: 'Kiểm soát bóng', h: `${possHome}%`, a: `${possAway}%`, hv: possHome, av: possAway },
    { label: 'Tổng cú sút', h: match.shotsHome, a: match.shotsAway, hv: match.shotsHome, av: match.shotsAway },
    { label: 'Sút trúng đích', h: shotsOnTargetHome, a: shotsOnTargetAway, hv: shotsOnTargetHome, av: shotsOnTargetAway },
    { label: 'Bàn thắng kỳ vọng (xG)', h: match.xgHome.toFixed(2), a: match.xgAway.toFixed(2), hv: match.xgHome, av: match.xgAway },
    { label: 'Phạt góc', h: cornersHome, a: cornersAway, hv: cornersHome, av: cornersAway },
    { label: 'Phạm lỗi', h: foulsHome, a: foulsAway, hv: foulsHome, av: foulsAway },
    { label: 'Thẻ vàng', h: yellowsHome, a: yellowsAway, hv: yellowsHome, av: yellowsAway },
  ];

  const motmRawClubId = match.manOfTheMatch?.clubId;
  const motmBaseClubId = motmRawClubId?.replace(/-away$/, '');
  const motmClub = motmBaseClubId ? CLUBS.find((c) => c.id === motmBaseClubId) : undefined;
  const motmSideManager =
    isSameClub && motmRawClubId
      ? motmRawClubId.endsWith('-away')
        ? match.awayManagerName
        : match.homeManagerName
      : undefined;

  const allRatings = match.playerRatings ?? [];

  const { homeRatings, awayRatings, homeAvg, awayAvg } = useMemo(() => {
    const sortLineup = (list: MatchPlayerRating[]) =>
      [...list].sort((a, b) => {
        const diffPos = POSITION_ORDER[a.position] - POSITION_ORDER[b.position];
        if (diffPos !== 0) return diffPos;
        return b.rating - a.rating;
      });
    const awayRatingKey = isSameClub ? `${match.awayClubId}-away` : match.awayClubId;
    const hList = sortLineup(allRatings.filter((r) => r.clubId === match.homeClubId));
    const aList = sortLineup(allRatings.filter((r) => r.clubId === awayRatingKey));
    const avg = (list: MatchPlayerRating[]) =>
      list.length > 0
        ? (list.reduce((sum, item) => sum + item.rating, 0) / list.length).toFixed(1)
        : '—';
    return {
      homeRatings: hList,
      awayRatings: aList,
      homeAvg: avg(hList),
      awayAvg: avg(aList),
    };
  }, [allRatings, match.homeClubId, match.awayClubId, isSameClub]);

  const displayedRatings = selectedSide === 'home' ? homeRatings : awayRatings;
  const displayedAvg = selectedSide === 'home' ? homeAvg : awayAvg;
  const selectedIsUserClub =
    (selectedSide === 'home' ? match.homeClubId : match.awayClubId) === userClubId;

  return (
    <div className="space-y-4">
      {/* Scoreboard Header */}
      <div className="rounded-2xl bg-[#0B1117] border border-white/10 p-4 space-y-3">
        <div className="flex items-center justify-between text-[11px] text-slate-400 gap-2">
          <span className="font-semibold text-emerald-400 truncate">
            {match.roundLabel || `Vòng ${match.matchweek}`}
          </span>
          <span className="flex items-center gap-1 truncate">
            <MapPin className="w-3 h-3 text-slate-500 shrink-0" />
            {match.venue || hClub.stadium}
          </span>
        </div>

        <div className="grid grid-cols-3 items-center gap-2 py-1">
          <div className="flex flex-col items-center text-center gap-1.5">
            <ClubCrest club={hClub} size={46} />
            <span
              className={`text-xs font-bold truncate max-w-full ${
                hClub.id === userClubId ? 'text-emerald-300' : 'text-white'
              }`}
            >
              {hClub.name}
            </span>
            <span className="text-[10px] text-slate-400">
              {match.homeFormation || hMgr?.preferredFormation || '4-3-3'} ·{' '}
              {match.homeManagerName || hMgr?.name || 'HLV'}
            </span>
          </div>

          <div className="text-center">
            <div className="font-display text-4xl font-extrabold font-mono-num text-white tracking-wider">
              {match.homeGoals} - {match.awayGoals}
            </div>
            {match.penaltiesHome !== undefined && (
              <p className="text-xs font-mono-num font-bold text-amber-400 mt-1">
                Luân lưu: {match.penaltiesHome} - {match.penaltiesAway}
              </p>
            )}
            <span className="inline-block mt-1 px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 font-mono-num text-[10px] font-bold">
              HẾT GIỜ (FT)
            </span>
          </div>

          <div className="flex flex-col items-center text-center gap-1.5">
            <ClubCrest club={aClub} size={46} />
            <span
              className={`text-xs font-bold truncate max-w-full ${
                aClub.id === userClubId ? 'text-emerald-300' : 'text-white'
              }`}
            >
              {aClub.name}
            </span>
            <span className="text-[10px] text-slate-400">
              {match.awayFormation || aMgr?.preferredFormation || '4-3-3'} ·{' '}
              {match.awayManagerName || aMgr?.name || 'HLV'}
            </span>
          </div>
        </div>

        {/* Scorers & Assisters Summary */}
        {(homeGoalsEvents.length > 0 || awayGoalsEvents.length > 0) && (
          <div className="pt-3 border-t border-white/10 grid grid-cols-2 gap-3 text-[11px]">
            <div className="space-y-1">
              {homeGoalsEvents.map((ev, idx) => (
                <p key={`hg-${idx}`} className="text-slate-200 leading-snug">
                  <span className="font-mono-num font-bold text-emerald-400 mr-1">
                    {ev.minute}&apos;
                  </span>
                  <span className="font-semibold">{ev.playerName}</span>
                  {ev.assistName && (
                    <span className="text-slate-400"> (KT: {ev.assistName})</span>
                  )}
                </p>
              ))}
            </div>
            <div className="space-y-1 text-right">
              {awayGoalsEvents.map((ev, idx) => (
                <p key={`ag-${idx}`} className="text-slate-200 leading-snug">
                  <span className="font-semibold">{ev.playerName}</span>
                  {ev.assistName && (
                    <span className="text-slate-400"> (KT: {ev.assistName})</span>
                  )}
                  <span className="font-mono-num font-bold text-emerald-400 ml-1">
                    {ev.minute}&apos;
                  </span>
                </p>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Man of the Match */}
      {match.manOfTheMatch && (
        <div className="rounded-xl bg-amber-500/10 border border-amber-400/30 px-4 py-3 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <Star className="w-5 h-5 text-amber-400 fill-amber-400 shrink-0" />
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-amber-400">
                Cầu thủ xuất sắc nhất trận
              </p>
              <p className="text-sm font-bold text-white truncate">
                {match.manOfTheMatch.name}{' '}
                <span className="text-xs font-normal text-slate-300">
                  ({motmClub?.shortName}{motmSideManager ? ` · ${motmSideManager}` : ''})
                </span>
              </p>
            </div>
          </div>
          <span className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-mono-num text-xs font-extrabold shrink-0">
            {match.manOfTheMatch.rating.toFixed(1)}
          </span>
        </div>
      )}

      {/* Report View Switcher */}
      <div className="grid grid-cols-2 gap-2 p-1 rounded-xl bg-[#0B1117] border border-white/10">
        <button
          type="button"
          onClick={() => setActiveTab('stats')}
          className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'stats'
              ? 'bg-emerald-500 text-slate-950'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <BarChart3 className="w-3.5 h-3.5" />
          Thông số &amp; Diễn biến
        </button>
        <button
          type="button"
          onClick={() => setActiveTab('ratings')}
          className={`h-10 rounded-lg text-xs font-bold flex items-center justify-center gap-1.5 transition-colors ${
            activeTab === 'ratings'
              ? 'bg-emerald-500 text-slate-950'
              : 'text-slate-300 hover:text-white'
          }`}
        >
          <Users className="w-3.5 h-3.5" />
          Chấm điểm cầu thủ
        </button>
      </div>

      {activeTab === 'stats' ? (
        <>
          {/* Match Stats Comparison Bars */}
          <div className="rounded-2xl bg-[#0B1117] border border-white/10 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
              <Shield className="w-3.5 h-3.5 text-emerald-400" />
              Thống kê trận đấu
            </h4>
            <div className="space-y-2.5">
              {statRows.map((row) => {
                const total = Math.max(0.01, row.hv + row.av);
                const leftPct = Math.round((row.hv / total) * 100);
                return (
                  <div key={row.label} className="space-y-1">
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-mono-num font-bold text-white w-12 text-left">
                        {row.h}
                      </span>
                      <span className="text-[11px] text-slate-400">{row.label}</span>
                      <span className="font-mono-num font-bold text-white w-12 text-right">
                        {row.a}
                      </span>
                    </div>
                    <div className="h-1.5 rounded-full bg-slate-800 overflow-hidden flex">
                      <div
                        className="h-full bg-emerald-500 transition-all"
                        style={{ width: `${leftPct}%` }}
                      />
                      <div
                        className="h-full bg-amber-400/80 transition-all"
                        style={{ width: `${100 - leftPct}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Match Timeline */}
          {match.events.length > 0 && (
            <div className="rounded-2xl bg-[#0B1117] border border-white/10 p-4 space-y-2.5">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                <Award className="w-3.5 h-3.5 text-amber-400" />
                Diễn biến chi tiết ({match.events.length} sự kiện)
              </h4>
              <div className="space-y-1.5 max-h-[240px] overflow-y-auto pr-1">
                {match.events.map((ev, i) => (
                  <div
                    key={`${ev.minute}-${ev.type}-${i}`}
                    className={`rounded-xl px-3 py-2 text-xs border ${
                      ev.type === 'goal' || ev.type === 'penalty'
                        ? 'bg-emerald-500/15 border-emerald-500/35 text-white'
                        : ev.type === 'yellow'
                          ? 'bg-amber-500/10 border-amber-400/30 text-amber-200'
                          : 'bg-[#121B24] border-white/5 text-slate-300'
                    }`}
                  >
                    <span className="font-mono-num font-bold text-emerald-400 mr-2">
                      {ev.minute}&apos;
                    </span>
                    <span>{ev.description}</span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </>
      ) : (
        <div className="rounded-2xl bg-[#0B1117] border border-white/10 p-4 space-y-3">
          {/* Team Selector */}
          <div className="grid grid-cols-2 gap-2">
            {[
              { side: 'home' as const, club: hClub, avg: homeAvg, mgrName: match.homeManagerName },
              { side: 'away' as const, club: aClub, avg: awayAvg, mgrName: match.awayManagerName },
            ].map(({ side, club, avg, mgrName }) => {
              const active = selectedSide === side;
              return (
                <button
                  key={`${side}-${club.id}`}
                  type="button"
                  onClick={() => setSelectedSide(side)}
                  className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2.5 border text-left transition-colors ${
                    active
                      ? 'bg-emerald-500/15 border-emerald-500/45 text-white'
                      : 'bg-[#121B24] border-white/5 text-slate-300 hover:border-white/20'
                  }`}
                >
                  <div className="flex items-center gap-2 min-w-0">
                    <ClubCrest club={club} size={24} />
                    <div className="min-w-0">
                      <p className="text-xs font-bold truncate">
                        {club.shortName}
                        {isSameClub && mgrName
                          ? ` (${mgrName})`
                          : club.id === userClubId
                            ? ' (Bạn)'
                            : ''}
                      </p>
                      <p className="text-[10px] text-slate-400">
                        {side === 'home' ? 'Đội nhà' : 'Đội khách'} · ĐTB trận
                      </p>
                    </div>
                  </div>
                  <span className="px-2 py-0.5 rounded-md bg-white/10 font-mono-num text-xs font-extrabold text-emerald-300 shrink-0">
                    {avg}
                  </span>
                </button>
              );
            })}
          </div>

          <div className="flex items-center justify-between text-[11px] text-slate-400 px-1">
            <span>Đội hình xuất phát ({displayedRatings.length} cầu thủ)</span>
            <span className="font-mono-num">
              Trung bình đội: <strong className="text-white">{displayedAvg}</strong>
            </span>
          </div>

          {displayedRatings.length === 0 ? (
            <p className="text-xs text-slate-400 text-center py-6">
              Chưa có dữ liệu chấm điểm cho trận đấu này.
            </p>
          ) : (
            <div className="space-y-1.5 max-h-[340px] overflow-y-auto pr-1">
              {displayedRatings.map((item) => (
                <div
                  key={`${item.clubId}-${item.playerId}`}
                  className={`flex items-center justify-between gap-2 rounded-xl px-3 py-2 border ${
                    item.isMotm
                      ? 'bg-amber-500/10 border-amber-400/35'
                      : 'bg-[#121B24] border-white/5'
                  }`}
                >
                  <div className="flex items-center gap-2.5 min-w-0">
                    <span className="w-9 text-center py-0.5 rounded-md bg-[#0B1117] border border-white/10 font-mono-num text-[10px] font-bold text-slate-300 shrink-0">
                      {item.position}
                    </span>
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-xs font-bold text-white truncate">
                          {item.playerName}
                        </span>
                        {item.isMotm && (
                          <span className="inline-flex items-center gap-0.5 px-1.5 py-0.5 rounded bg-amber-400/20 text-amber-300 text-[10px] font-bold shrink-0">
                            <Star className="w-2.5 h-2.5 fill-amber-400 text-amber-400" />
                            MOTM
                          </span>
                        )}
                      </div>
                      <div className="flex items-center gap-2 text-[10px] text-slate-400 mt-0.5">
                        <span>{getPerformanceLabel(item.rating)}</span>
                        {item.goals > 0 && (
                          <span className="text-emerald-400 font-semibold">
                            ⚽ {item.goals > 1 ? `${item.goals} bàn` : '1 bàn'}
                          </span>
                        )}
                        {item.assists > 0 && (
                          <span className="text-sky-400 font-semibold">
                            🎯 {item.assists > 1 ? `${item.assists} KT` : '1 KT'}
                          </span>
                        )}
                        {item.yellowCard && (
                          <span className="inline-flex items-center gap-1 text-amber-300 font-semibold">
                            <span className="inline-block w-2 h-2.5 rounded-[2px] bg-amber-400" />
                            Thẻ vàng
                          </span>
                        )}
                      </div>
                    </div>
                  </div>

                  <span
                    className={`min-w-[44px] text-center px-2 py-1 rounded-lg border font-mono-num text-xs font-extrabold shrink-0 ${getRatingBadgeClass(
                      item.rating
                    )}`}
                  >
                    {item.rating.toFixed(1)}
                  </span>
                </div>
              ))}
            </div>
          )}

          <p className="text-[11px] text-slate-400 leading-relaxed pt-1 border-t border-white/5">
            Thang điểm 4.5–10.0 dựa trên kết quả trận đấu, bàn thắng, kiến tạo, giữ sạch lưới, thẻ phạt và mức độ hợp vị trí.{' '}
            {selectedIsUserClub
              ? 'Điểm trận này được cập nhật trực tiếp vào chỉ số Phong độ của cầu thủ trong đội hình.'
              : ''}
          </p>
        </div>
      )}
    </div>
  );
};

interface MatchDetailModalProps {
  match: MatchResultSummary | null;
  userClubId: string;
  onClose: () => void;
}

export const MatchDetailModal: React.FC<MatchDetailModalProps> = ({
  match,
  userClubId,
  onClose,
}) => {
  if (!match) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm">
      <div className="w-full sm:max-w-xl max-h-[90vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[#121B24] border border-white/15 p-5 space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-[11px] font-bold uppercase tracking-wider text-emerald-400">
              Báo cáo trận đấu
            </p>
            <h3 className="font-display text-lg font-extrabold text-white">
              Bảng thông tin &amp; Chấm điểm
            </h3>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#0B1117] border border-white/10 text-slate-300 hover:text-white"
            aria-label="Đóng bảng thông tin trận đấu"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        <MatchStatsBreakdown match={match} userClubId={userClubId} />

        <button
          type="button"
          onClick={onClose}
          className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm"
        >
          Đóng
        </button>
      </div>
    </div>
  );
};
