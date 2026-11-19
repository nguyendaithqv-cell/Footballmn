import React from 'react';
import { Award, Target } from 'lucide-react';
import { CLUBS } from '../data/footballDatabase';
import { CompetitionPlayerStat } from '../types/game';
import { ClubCrest } from './ClubBadgeAndAvatar';

interface CompetitionStatsPanelProps {
  stats: CompetitionPlayerStat[];
  mode: 'goals' | 'assists';
  userClubId: string;
  competitionTitle: string;
  emptyHint?: string;
}

export const CompetitionStatsPanel: React.FC<CompetitionStatsPanelProps> = ({
  stats,
  mode,
  userClubId,
  competitionTitle,
  emptyHint,
}) => {
  const ranked = [...stats]
    .filter((s) => (mode === 'goals' ? s.goals > 0 : s.assists > 0))
    .sort((a, b) => {
      const primaryA = mode === 'goals' ? a.goals : a.assists;
      const primaryB = mode === 'goals' ? b.goals : b.assists;
      if (primaryB !== primaryA) return primaryB - primaryA;
      const secondaryA = mode === 'goals' ? a.assists : a.goals;
      const secondaryB = mode === 'goals' ? b.assists : b.goals;
      if (secondaryB !== secondaryA) return secondaryB - secondaryA;
      return a.playerName.localeCompare(b.playerName);
    })
    .slice(0, 30);

  return (
    <div className="rounded-2xl bg-[#121B24] border border-white/10 overflow-hidden">
      <div className="px-4 py-3.5 border-b border-white/10 flex items-center justify-between gap-2 bg-[#0B1117]/50">
        <div className="flex items-center gap-2 min-w-0">
          {mode === 'goals' ? (
            <Target className="w-4 h-4 text-emerald-400 shrink-0" />
          ) : (
            <Award className="w-4 h-4 text-amber-400 shrink-0" />
          )}
          <h4 className="text-sm font-bold text-white truncate">
            {mode === 'goals' ? 'Danh sách Ghi bàn' : 'Danh sách Kiến tạo'} · {competitionTitle}
          </h4>
        </div>
        <span className="text-[11px] font-mono-num text-slate-400 shrink-0">
          Top {ranked.length}
        </span>
      </div>

      {ranked.length === 0 ? (
        <div className="p-6 text-center space-y-1">
          <p className="text-xs font-semibold text-slate-300">
            Chưa có thống kê {mode === 'goals' ? 'bàn thắng' : 'kiến tạo'} nào ở giải đấu này.
          </p>
          <p className="text-[11px] text-slate-500">
            {emptyHint || 'Hãy thi đấu hoặc mô phỏng các vòng đấu để cập nhật bảng xếp hạng cá nhân.'}
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
                <th className="py-2.5 px-2 text-center font-mono-num">
                  {mode === 'goals' ? 'Bàn thắng' : 'Kiến tạo'}
                </th>
                <th className="py-2.5 pl-2 pr-4 text-right font-mono-num">
                  {mode === 'goals' ? 'KT' : 'Bàn'}
                </th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((row, idx) => {
                const club = CLUBS.find((c) => c.id === row.clubId) ?? CLUBS[0];
                const isMine = row.clubId === userClubId;
                const mainVal = mode === 'goals' ? row.goals : row.assists;
                const secVal = mode === 'goals' ? row.assists : row.goals;
                return (
                  <tr
                    key={row.playerId}
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
                      <div className="flex items-center gap-2 min-w-0">
                        <span
                          className={`font-semibold truncate ${
                            isMine ? 'text-emerald-300' : 'text-white'
                          }`}
                        >
                          {row.playerName}
                        </span>
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
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
};
