import React, { useMemo, useState } from 'react';
import { ExternalLink, Globe, RefreshCw, Search, TrendingUp } from 'lucide-react';
import { CLUBS, INITIAL_PLAYERS } from '../data/footballDatabase';
import { applyMarketOverrides } from '../lib/careerEngine';
import { CareerSave, MarketOverride, NewsArticle, Player, Position } from '../types/game';
import { ClubCrest, PlayerAvatar } from './ClubBadgeAndAvatar';

interface TransfersViewProps {
  career: CareerSave;
  news: NewsArticle[];
  marketOverrides: Record<string, MarketOverride>;
  onSelectPlayer: (player: Player) => void;
}

interface LiveNewsItem {
  title: string;
  summary: string;
  category: string;
  playerName?: string;
  clubTag?: string;
  feeText?: string;
  isBreaking?: boolean;
}

interface LiveSource {
  uri: string;
  title: string;
}

const POSITIONS: ('ALL' | Position)[] = [
  'ALL',
  'GK',
  'CB',
  'LB',
  'RB',
  'CDM',
  'CM',
  'CAM',
  'LW',
  'RW',
  'ST',
];

export const TransfersView: React.FC<TransfersViewProps> = ({
  career,
  news,
  marketOverrides,
  onSelectPlayer,
}) => {
  const [tab, setTab] = useState<'market' | 'live'>('market');
  const [queryText, setQueryText] = useState('');
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [onlyListed, setOnlyListed] = useState(false);

  // Real-time Web Transfer News State
  const [liveItems, setLiveItems] = useState<LiveNewsItem[]>([]);
  const [liveSources, setLiveSources] = useState<LiveSource[]>([]);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const ownIds = useMemo(() => new Set(career.squad.map((p) => p.id)), [career.squad]);

  const marketPlayers = useMemo(() => {
    const merged = applyMarketOverrides(INITIAL_PLAYERS, marketOverrides);
    return merged
      .filter((p) => !ownIds.has(p.id))
      .filter((p) => (posFilter === 'ALL' ? true : p.position === posFilter))
      .filter((p) => (onlyListed ? p.transferStatus === 'listed' : true))
      .filter((p) => {
        if (!queryText.trim()) return true;
        const q = queryText.toLowerCase();
        const club = CLUBS.find((c) => c.id === p.clubId);
        return (
          p.name.toLowerCase().includes(q) ||
          p.nationality.toLowerCase().includes(q) ||
          (club?.name.toLowerCase().includes(q) ?? false)
        );
      })
      .sort((a, b) => b.rating - a.rating);
  }, [ownIds, posFilter, onlyListed, queryText, marketOverrides]);

  const fetchLiveMarketNews = async () => {
    setLoadingLive(true);
    setLiveError(null);
    try {
      const res = await fetch('/api/transfers/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league: 'Premier League, La Liga, Serie A, Bundesliga, Ligue 1' }),
      });
      const data = await res.json();
      if (!res.ok) {
        setLiveError(data.error || 'Không thể tải dữ liệu thời gian thực.');
      } else {
        setLiveItems(Array.isArray(data.items) ? data.items : []);
        setLiveSources(Array.isArray(data.sources) ? data.sources : []);
        setLiveUpdatedAt(data.updatedAt ?? new Date().toISOString());
      }
    } catch {
      setLiveError('Lỗi kết nối máy chủ tin tức chuyển nhượng.');
    } finally {
      setLoadingLive(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* Top Budget & Tab Strip */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 rounded-2xl bg-[#121B24] border border-white/10 p-4">
        <div>
          <p className="text-xs text-slate-400">Ngân sách khả dụng</p>
          <p className="font-mono-num text-2xl font-extrabold text-emerald-400">
            €{career.transferBudget.toFixed(1)}M
            <span className="text-xs font-normal text-slate-400 ml-2">
              · Quỹ lương €{career.wageBudget}K/tuần
            </span>
          </p>
        </div>

        <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#0B1117]">
          <button
            type="button"
            onClick={() => setTab('market')}
            className={`h-10 px-4 rounded-lg text-xs font-semibold ${
              tab === 'market' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            Sàn Cầu thủ
          </button>
          <button
            type="button"
            onClick={() => setTab('live')}
            className={`h-10 px-4 rounded-lg text-xs font-semibold ${
              tab === 'live' ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
            }`}
          >
            Tin Chuyển nhượng
          </button>
        </div>
      </div>

      {tab === 'market' && (
        <div className="space-y-3">
          {/* Search & Filters */}
          <div className="space-y-2.5">
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
                <input
                  type="text"
                  value={queryText}
                  onChange={(e) => setQueryText(e.target.value)}
                  placeholder="Tìm tên cầu thủ, CLB, quốc tịch..."
                  className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#121B24] border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
              <button
                type="button"
                onClick={() => setOnlyListed(!onlyListed)}
                className={`h-11 px-3.5 rounded-xl text-xs font-semibold border whitespace-nowrap shrink-0 ${
                  onlyListed
                    ? 'bg-amber-500/20 border-amber-400 text-amber-300'
                    : 'bg-[#121B24] border-white/10 text-slate-300'
                }`}
              >
                Đang rao bán
              </button>
            </div>

            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {POSITIONS.map((pos) => (
                <button
                  key={pos}
                  type="button"
                  onClick={() => setPosFilter(pos)}
                  className={`h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 ${
                    posFilter === pos
                      ? 'bg-emerald-500 text-slate-950'
                      : 'bg-[#121B24] border border-white/10 text-slate-300'
                  }`}
                >
                  {pos === 'ALL' ? 'Tất cả' : pos}
                </button>
              ))}
            </div>
          </div>

          {/* Player Cards */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
            {marketPlayers.slice(0, 40).map((player) => {
              const club = CLUBS.find((c) => c.id === player.clubId) ?? CLUBS[0];
              const hasOverride = Boolean(marketOverrides[player.id]);
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => onSelectPlayer(player)}
                  className="w-full text-left rounded-2xl bg-[#121B24] border border-white/10 hover:border-emerald-500/40 p-3 flex items-center justify-between gap-3 transition-colors min-h-[72px]"
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar player={player} club={club} size={46} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        <span className="font-bold text-sm text-white truncate">
                          {player.name}
                        </span>
                        {hasOverride && (
                          <TrendingUp className="w-3.5 h-3.5 text-amber-400 shrink-0" />
                        )}
                      </div>
                      <div className="flex items-center gap-1.5 text-xs text-slate-400 mt-0.5">
                        <ClubCrest club={club} size={15} />
                        <span className="truncate">
                          {club.shortName} · {player.position} · {player.age}t
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p className="font-mono-num text-sm font-extrabold text-emerald-400">
                      OVR {player.rating}
                    </p>
                    <p className="font-mono-num text-xs text-slate-300">€{player.marketValueM}M</p>
                    {player.transferStatus === 'listed' && (
                      <p className="text-[10px] text-amber-400 font-semibold">Đang rao bán</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {tab === 'live' && (
        <div className="space-y-4">
          {/* Real-Time Live Web Sync Card */}
          <div className="rounded-2xl bg-[#121B24] border border-emerald-500/25 p-4 space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                  <Globe className="w-4 h-4 text-emerald-400" />
                  Thị trường Chuyển nhượng Thời gian thực
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  Cập nhật tin đồn & thương vụ thực tế ngoài đời mới nhất qua tìm kiếm trực tiếp.
                </p>
              </div>
              <button
                type="button"
                disabled={loadingLive}
                onClick={fetchLiveMarketNews}
                className="h-10 px-3.5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs flex items-center gap-1.5 shrink-0 disabled:opacity-60"
              >
                <RefreshCw className={`w-3.5 h-3.5 ${loadingLive ? 'animate-spin' : ''}`} />
                {loadingLive ? 'Đang quét...' : 'Cập nhật ngay'}
              </button>
            </div>

            {liveError && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-200">
                {liveError}
              </div>
            )}

            {liveItems.length > 0 && (
              <div className="space-y-2.5 pt-1">
                {liveUpdatedAt && (
                  <p className="text-[11px] font-mono-num text-emerald-400">
                    Đồng bộ lúc {new Date(liveUpdatedAt).toLocaleTimeString('vi-VN')}
                  </p>
                )}
                {liveItems.map((item, idx) => (
                  <div
                    key={idx}
                    className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-1.5"
                  >
                    <p className="text-[11px] text-amber-400 font-medium">
                      {item.isBreaking ? 'TIN NÓNG · ' : ''}
                      {item.clubTag || 'Thị trường Quốc tế'}
                      {item.feeText ? ` · ${item.feeText}` : ''}
                    </p>
                    <h4 className="text-sm font-bold text-white">{item.title}</h4>
                    <p className="text-xs text-slate-300 leading-relaxed">{item.summary}</p>
                  </div>
                ))}

                {liveSources.length > 0 && (
                  <div className="pt-1 space-y-1">
                    <p className="text-[11px] text-slate-400">Nguồn xác thực:</p>
                    <div className="flex flex-wrap gap-2">
                      {liveSources.map((src, i) => (
                        <a
                          key={i}
                          href={src.uri}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="text-[11px] text-emerald-400 hover:underline flex items-center gap-1"
                        >
                          <ExternalLink className="w-3 h-3" />
                          {src.title}
                        </a>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Firestore Official & Admin News Feed */}
          <div className="space-y-2.5">
            <h3 className="text-sm font-bold text-white">Bản tin Hệ thống & Ban Quản trị</h3>
            {news.length === 0 ? (
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-6 text-center text-xs text-slate-400">
                Chưa có bản tin nào được đăng. Nhấn "Cập nhật ngay" ở trên để xem tin chuyển nhượng thực tế mới nhất.
              </div>
            ) : (
              news.map((article) => (
                <article
                  key={article.id}
                  className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-1.5"
                >
                  <div className="flex items-center justify-between gap-2 text-[11px] text-slate-400">
                    <span>
                      {article.isBreaking ? 'NÓNG · ' : ''}
                      {article.category.toUpperCase()}
                      {article.clubTag ? ` · ${article.clubTag}` : ''}
                    </span>
                    {article.feeText && (
                      <span className="font-mono-num font-bold text-emerald-400">
                        {article.feeText}
                      </span>
                    )}
                  </div>
                  <h4 className="text-sm font-bold text-white">{article.title}</h4>
                  <p className="text-xs text-slate-300 leading-relaxed">{article.summary}</p>
                  {article.sourceUrl && (
                    <a
                      href={article.sourceUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:underline pt-1"
                    >
                      <ExternalLink className="w-3 h-3" />
                      {article.sourceTitle || 'Xem nguồn'}
                    </a>
                  )}
                </article>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};
