import React, { useMemo } from 'react';
import { Award, Crown, Star, Target } from 'lucide-react';
import { CLUBS } from '../data/footballDatabase';
import { computeCompetitionMvpScore } from '../lib/careerEngine';
import { CompetitionAwardWinner, CompetitionPlayerStat } from '../types/game';
import { ClubCrest } from './ClubBadgeAndAvatar';

interface CompetitionStatsPanelProps {
  stats: CompetitionPlayerStat[];
  mode: 'goals' | 'assists' | 'mvp';
  userClubId: string;
  userSquadStars?: Record<string, number>;
  competitionTitle: string;
  emptyHint?: string;
  isFinished?: boolean;
  awards?: {
    topScorer: CompetitionAwardWinner | null;
    mvp: CompetitionAwardWinner | null;
  };
}

export const CompetitionStatsPanel: React.FC<CompetitionStatsPanelProps> = ({
  stats,
  mode,
  userClubId,
  userSquadStars,
  competitionTitle,
  emptyHint,
  isFinished = false,
  awards,
}) => {
  const maxMatches = useMemo(
    () => stats.reduce((mx, s) => Math.max(mx, s.matches ?? 0), 0),
    [stats]
  );

  const ranked = useMemo(() => {
    if (mode === 'mvp') {
      return [...stats]
        .filter((s) => (s.matches ?? 0) > 0 || s.goals > 0 || s.assists > 0)
        .map((s) => {
          const matches = Math.max(1, s.matches ?? 1);
          const avgRating =
            typeof s.ratingSum === 'number' && (s.matches ?? 0) > 0
              ? Number((s.ratingSum / matches).toFixed(2))
              : Number(
                  Math.min(9.5, 6.5 + (s.goals * 0.25 + s.assists * 0.18) / matches).toFixed(2)
                );
          return {
            ...s,
            avgRating,
            mvpScore: computeCompetitionMvpScore(s, maxMatches),
          };
        })
        .sort((a, b) => {
          if (b.mvpScore !== a.mvpScore) return b.mvpScore - a.mvpScore;
          if (b.avgRating !== a.avgRating) return b.avgRating - a.avgRating;
          return b.goals + b.assists - (a.goals + a.assists);
        })
        .slice(0, 35);
    }

    return [...stats]
      .filter((s) => (mode === 'goals' ? s.goals > 0 : s.assists > 0))
      .map((s) => {
        const matches = Math.max(1, s.matches ?? 1);
        const avgRating =
          typeof s.ratingSum === 'number' && (s.matches ?? 0) > 0
            ? Number((s.ratingSum / matches).toFixed(2))
            : 0;
        return { ...s, avgRating, mvpScore: 0 };
      })
      .sort((a, b) => {
        const primaryA = mode === 'goals' ? a.goals : a.assists;
        const primaryB = mode === 'goals' ? b.goals : b.assists;
        if (primaryB !== primaryA) return primaryB - primaryA;
        const secondaryA = mode === 'goals' ? a.assists : a.goals;
        const secondaryB = mode === 'goals' ? b.assists : a.goals;
        if (secondaryB !== secondaryA) return secondaryB - secondaryA;
        return a.playerName.localeCompare(b.playerName);
      })
      .slice(0, 35);
  }, [stats, mode, maxMatches]);

  const topScorerLeader = awards?.topScorer ?? null;
  const mvpLeader = awards?.mvp ?? null;
  const showSpotlight = Boolean(topScorerLeader || mvpLeader);

  return (
    <div className="space-y-3">
      {showSpotlight && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
          {mvpLeader && (
            <div
              className={`rounded-2xl p-4 border ${
                mvpLeader.isUserPlayer
                  ? 'bg-amber-500/15 border-amber-400/45'
                  : 'bg-[#121B24] border-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold text-amber-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <Crown className="w-3.5 h-3.5" />
                  {isFinished ? 'Cầu thủ Xuất sắc Nhất giải' : 'Ứng viên Xuất sắc Nhất'}
                </span>
                {mvpLeader.isUserPlayer && (
                  <span className="text-[10px] font-bold text-emerald-300">CLB của bạn</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ClubCrest
                    club={CLUBS.find((c) => c.id === mvpLeader.clubId) ?? CLUBS[0]}
                    size={32}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-white truncate">
                      {mvpLeader.playerName}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {mvpLeader.position} · {(CLUBS.find((c) => c.id === mvpLeader.clubId) ?? CLUBS[0]).name} · {mvpLeader.motmCount} MOTM
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono-num text-lg font-extrabold text-amber-400">
                    {mvpLeader.avgRating.toFixed(2)}★
                  </p>
                  <p className="font-mono-num text-[11px] text-slate-400">
                    {mvpLeader.goals}B · {mvpLeader.assists}KT
                  </p>
                </div>
              </div>
            </div>
          )}

          {topScorerLeader && (
            <div
              className={`rounded-2xl p-4 border ${
                topScorerLeader.isUserPlayer
                  ? 'bg-emerald-500/15 border-emerald-400/45'
                  : 'bg-[#121B24] border-white/10'
              }`}
            >
              <div className="flex items-center justify-between gap-2 mb-2">
                <span className="text-[11px] font-bold text-emerald-400 flex items-center gap-1.5 uppercase tracking-wide">
                  <Target className="w-3.5 h-3.5" />
                  {isFinished ? 'Vua Phá Lưới Chính Thức' : 'Dẫn đầu Vua Phá Lưới'}
                </span>
                {topScorerLeader.isUserPlayer && (
                  <span className="text-[10px] font-bold text-emerald-300">CLB của bạn</span>
                )}
              </div>
              <div className="flex items-center justify-between gap-3">
                <div className="flex items-center gap-2.5 min-w-0">
                  <ClubCrest
                    club={CLUBS.find((c) => c.id === topScorerLeader.clubId) ?? CLUBS[0]}
                    size={32}
                  />
                  <div className="min-w-0">
                    <p className="text-sm font-extrabold text-white truncate">
                      {topScorerLeader.playerName}
                    </p>
                    <p className="text-[11px] text-slate-400 truncate">
                      {topScorerLeader.position} · {(CLUBS.find((c) => c.id === topScorerLeader.clubId) ?? CLUBS[0]).name}
                    </p>
                  </div>
                </div>
                <div className="text-right shrink-0">
                  <p className="font-mono-num text-lg font-extrabold text-emerald-400">
                    {topScorerLeader.goals} bàn
                  </p>
                  <p className="font-mono-num text-[11px] text-slate-400">
                    {topScorerLeader.assists} kiến tạo
                  </p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      <div className="rounded-2xl bg-[#121B24] border border-white/10 overflow-hidden">
        <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between gap-2 bg-[#0B1117]/50">
          <div className="flex items-center gap-2 min-w-0">
            {mode === 'mvp' ? (
              <Star className="w-4 h-4 text-amber-400 shrink-0" />
            ) : mode === 'goals' ? (
              <Target className="w-4 h-4 text-emerald-400 shrink-0" />
            ) : (
              <Award className="w-4 h-4 text-amber-400 shrink-0" />
            )}
            <h4 className="text-sm font-bold text-white truncate">
              {mode === 'mvp'
                ? 'Bảng xếp hạng Cầu thủ Xuất sắc nhất'
                : mode === 'goals'
                  ? 'Danh sách Vua phá lưới'
                  : 'Danh sách Kiến tạo'}{' '}
              · {competitionTitle}
            </h4>
          </div>
          <span className="text-[11px] font-mono-num text-slate-400 shrink-0">
            Top {ranked.length}
          </span>
        </div>

        {ranked.length === 0 ? (
          <div className="p-6 text-center space-y-1">
            <p className="text-xs font-semibold text-slate-300">
              Chưa có thống kê{' '}
              {mode === 'mvp' ? 'điểm chấm trận' : mode === 'goals' ? 'bàn thắng' : 'kiến tạo'} nào
              ở giải đấu này.
            </p>
            <p className="text-[11px] text-slate-500">
              {emptyHint ||
                'Hãy thi đấu hoặc mô phỏng các vòng đấu để cập nhật bảng xếp hạng cá nhân.'}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-white/10 text-slate-400 bg-[#0B1117]/60">
                  <th className="py-2.5 pl-4 pr-2 w-10">#</th>
                  <th className="py-2.5 px-2">Cầu thủ</th>
                  <th className="py-2.5 px-2">CLB</th>
                  {mode === 'mvp' ? (
                    <>
                      <th className="py-2.5 px-2 text-center font-mono-num">Trận</th>
                      <th className="py-2.5 px-2 text-center font-mono-num">MOTM</th>
                      <th className="py-2.5 px-2 text-center font-mono-num">G+A</th>
                      <th className="py-2.5 pl-2 pr-4 text-right font-mono-num">Điểm TB</th>
                    </>
                  ) : (
                    <>
                      <th className="py-2.5 px-2 text-center font-mono-num">
                        {mode === 'goals' ? 'Bàn thắng' : 'Kiến tạo'}
                      </th>
                      <th className="py-2.5 pl-2 pr-4 text-right font-mono-num">
                        {mode === 'goals' ? 'KT' : 'Bàn'}
                      </th>
                    </>
                  )}
                </tr>
              </thead>
              <tbody>
                {ranked.map((row, idx) => {
                  const club = CLUBS.find((c) => c.id === row.clubId) ?? CLUBS[0];
                  const isMine = row.clubId === userClubId;
                  const mainVal = mode === 'goals' ? row.goals : row.assists;
                  const secVal = mode === 'goals' ? row.assists : row.goals;
                  const userStars = isMine ? userSquadStars?.[row.playerId] : undefined;
                  return (
                    <tr
                      key={`${row.clubId}-${row.playerId}`}
                      className={`border-b border-white/5 ${
                        isMine ? 'bg-emerald-500/15' : 'hover:bg-white/[0.02]'
                      }`}
                    >
                      <td className="py-2.5 pl-4 pr-2 font-mono-num font-bold">
                        <span
                          className={
                            idx === 0
                              ? 'text-amber-400'
                              : idx === 1
                                ? 'text-slate-200'
                                : idx === 2
                                  ? 'text-amber-600'
                                  : 'text-slate-500'
                          }
                        >
                          {idx + 1}
                        </span>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1.5 min-w-0">
                          <span
                            className={`font-semibold truncate ${
                              isMine ? 'text-emerald-300' : 'text-white'
                            }`}
                          >
                            {row.playerName}
                          </span>
                          {userStars !== undefined && (
                            <span className="px-1 py-0.5 rounded bg-amber-400/20 border border-amber-400/40 text-[10px] font-mono-num font-bold text-amber-300 shrink-0">
                              {userStars}★
                            </span>
                          )}
                          <span className="px-1.5 py-0.5 rounded bg-white/5 text-[10px] font-mono-num text-slate-400 shrink-0">
                            {row.position}
                          </span>
                        </div>
                      </td>
                      <td className="py-2.5 px-2">
                        <div className="flex items-center gap-1.5">
                          <ClubCrest club={club} size={18} />
                          <span className="text-slate-300 truncate">{club.shortName}</span>
                        </div>
                      </td>
                      {mode === 'mvp' ? (
                        <>
                          <td className="py-2.5 px-2 text-center font-mono-num text-slate-400">
                            {row.matches ?? 0}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono-num text-amber-300">
                            {row.motmCount ?? 0}
                          </td>
                          <td className="py-2.5 px-2 text-center font-mono-num text-slate-300">
                            {row.goals}+{row.assists}
                          </td>
                          <td className="py-2.5 pl-2 pr-4 text-right font-mono-num text-sm font-extrabold text-amber-400">
                            {row.avgRating.toFixed(2)}
                          </td>
                        </>
                      ) : (
                        <>
                          <td
                            className={`py-2.5 px-2 text-center font-mono-num text-sm font-extrabold ${
                              mode === 'goals' ? 'text-emerald-400' : 'text-amber-400'
                            }`}
                          >
                            {mainVal}
                          </td>
                          <td className="py-2.5 pl-2 pr-4 text-right font-mono-num text-slate-400">
                            {secVal}
                          </td>
                        </>
                      )}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};
