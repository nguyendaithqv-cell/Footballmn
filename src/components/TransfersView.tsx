import React, { useMemo, useState } from 'react';
import { Crown, ExternalLink, Globe, RefreshCw, Search, Sparkles, TrendingUp, Trophy } from 'lucide-react';
import { getClubById, getIconShardCost, INITIAL_PLAYERS } from '../data/footballDatabase';
import { applyMarketOverrides } from '../lib/careerEngine';
import { normalizeInventory } from '../lib/inventoryEngine';
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
  const [tierFilter, setTierFilter] = useState<'all' | 'ucl17' | 'icon' | 'global' | 'standard'>('all');
  const [queryText, setQueryText] = useState('');
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [onlyListed, setOnlyListed] = useState(false);
  const [showAll, setShowAll] = useState(false);

  // Real-time Web Transfer News State
  const [liveItems, setLiveItems] = useState<LiveNewsItem[]>([]);
  const [liveSources, setLiveSources] = useState<LiveSource[]>([]);
  const [liveUpdatedAt, setLiveUpdatedAt] = useState<string | null>(null);
  const [loadingLive, setLoadingLive] = useState(false);
  const [liveError, setLiveError] = useState<string | null>(null);

  const ownIds = useMemo(() => new Set(career.squad.map((p) => p.id)), [career.squad]);
  const normInventory = useMemo(() => normalizeInventory(career.inventory), [career.inventory]);

  const mergedMarketBase = useMemo(
    () => applyMarketOverrides(INITIAL_PLAYERS, marketOverrides).filter((p) => !ownIds.has(p.id)),
    [marketOverrides, ownIds]
  );

  const tierCounts = useMemo(() => {
    let ucl17 = 0;
    let icon = 0;
    let global = 0;
    let standard = 0;
    for (const p of mergedMarketBase) {
      const t = p.cardTier ?? 'standard';
      if (t === 'ucl17' || p.clubId === 'rma-ucl-2017') ucl17++;
      else if (t === 'icon' || p.clubId === 'icons-fc') icon++;
      else if (t === 'global') global++;
      else standard++;
    }
    return { all: mergedMarketBase.length, ucl17, icon, global, standard };
  }, [mergedMarketBase]);

  const marketPlayers = useMemo(() => {
    return mergedMarketBase
      .filter((p) => {
        if (tierFilter === 'all') return true;
        const isUcl17 = p.cardTier === 'ucl17' || p.clubId === 'rma-ucl-2017';
        const isIcon = p.cardTier === 'icon' || p.clubId === 'icons-fc';
        if (tierFilter === 'ucl17') return isUcl17;
        if (tierFilter === 'icon') return isIcon;
        if (tierFilter === 'global') return p.cardTier === 'global';
        return !isIcon && !isUcl17 && p.cardTier !== 'global';
      })
      .filter((p) => (posFilter === 'ALL' ? true : p.position === posFilter))
      .filter((p) => (onlyListed ? p.transferStatus === 'listed' : true))
      .filter((p) => {
        if (!queryText.trim()) return true;
        const q = queryText.toLowerCase();
        const club = getClubById(p.clubId);
        return (
          p.name.toLowerCase().includes(q) ||
          p.nationality.toLowerCase().includes(q) ||
          club.name.toLowerCase().includes(q) ||
          club.shortName.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => b.rating - a.rating);
  }, [mergedMarketBase, tierFilter, posFilter, onlyListed, queryText]);

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

            {/* Tier Filter Tabs */}
            <div className="flex gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'all', label: `Tất cả (${tierCounts.all})`, badge: 'none' },
                { id: 'ucl17', label: `Real C1 '17 (${tierCounts.ucl17})`, badge: 'ucl17' },
                { id: 'icon', label: `Sảnh Huyền Thoại (${tierCounts.icon})`, badge: 'icon' },
                { id: 'global', label: `Ngoài Âu / Tự do (${tierCounts.global})`, badge: 'none' },
                { id: 'standard', label: `Giải Châu Âu (${tierCounts.standard})`, badge: 'none' },
              ].map((t) => (
                <button
                  key={t.id}
                  type="button"
                  onClick={() => {
                    setTierFilter(t.id as typeof tierFilter);
                    setShowAll(t.id === 'icon' || t.id === 'global' || t.id === 'ucl17');
                  }}
                  className={`h-9 px-3 rounded-lg text-xs font-bold whitespace-nowrap shrink-0 flex items-center gap-1.5 border ${
                    tierFilter === t.id
                      ? t.badge === 'icon'
                        ? 'bg-amber-500 border-amber-400 text-slate-950'
                        : t.badge === 'ucl17'
                          ? 'bg-indigo-500 border-indigo-400 text-white'
                          : 'bg-emerald-500 border-emerald-400 text-slate-950'
                      : t.badge === 'icon'
                        ? 'bg-amber-500/10 border-amber-400/35 text-amber-300'
                        : t.badge === 'ucl17'
                          ? 'bg-indigo-500/15 border-indigo-400/40 text-indigo-200'
                          : 'bg-[#121B24] border-white/10 text-slate-300'
                  }`}
                >
                  {t.badge === 'icon' && <Crown className="w-3.5 h-3.5" />}
                  {t.badge === 'ucl17' && <Trophy className="w-3.5 h-3.5" />}
                  {t.label}
                </button>
              ))}
            </div>

            {tierFilter === 'ucl17' && (
              <div className="rounded-xl bg-indigo-500/15 border border-indigo-400/40 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
                <span className="text-indigo-100 flex items-center gap-1.5">
                  <Trophy className="w-4 h-4 text-amber-400 shrink-0" />
                  Đội hình <strong className="text-amber-300">La Duodécima Real Madrid C1 2017</strong> — Chiêu mộ trực tiếp bằng Ngân sách, Hợp đồng thông thường &amp; không suy giảm tuổi tác!
                </span>
              </div>
            )}

            {tierFilter === 'icon' && (
              <div className="rounded-xl bg-amber-500/10 border border-amber-400/35 px-3.5 py-2.5 flex items-center justify-between gap-3 text-xs">
                <span className="text-amber-200 flex items-center gap-1.5">
                  <Sparkles className="w-4 h-4 text-amber-400 shrink-0" />
                  Chiêu mộ trực tiếp bằng Ngân sách + 500 Mảnh Ngôi Sao, hoặc săn trong{' '}
                  <strong className="text-amber-300">Gói Huyền Thoại ICON</strong>.
                </span>
                <span className="font-mono-num font-bold text-amber-300 shrink-0">
                  Mảnh: {normInventory.universalShards}
                </span>
              </div>
            )}

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
            {(showAll ? marketPlayers : marketPlayers.slice(0, 60)).map((player) => {
              const club = getClubById(player.clubId);
              const isIcon = player.cardTier === 'icon' || player.clubId === 'icons-fc';
              const isUcl17 = player.cardTier === 'ucl17' || player.clubId === 'rma-ucl-2017';
              const isGlobal = player.cardTier === 'global';
              const shardCost = getIconShardCost(player);
              const hasOverride = Boolean(marketOverrides[player.id]);
              return (
                <button
                  key={player.id}
                  type="button"
                  onClick={() => onSelectPlayer(player)}
                  className={`w-full text-left rounded-2xl border p-3 flex items-center justify-between gap-3 transition-colors min-h-[74px] ${
                    isIcon
                      ? 'bg-gradient-to-r from-amber-500/12 via-[#121B24] to-[#121B24] border-amber-400/45 hover:border-amber-300'
                      : isUcl17
                        ? 'bg-gradient-to-r from-indigo-500/18 via-[#121B24] to-[#121B24] border-indigo-400/50 hover:border-indigo-300'
                        : isGlobal
                          ? 'bg-[#121B24] border-pink-400/30 hover:border-pink-400/60'
                          : 'bg-[#121B24] border-white/10 hover:border-emerald-500/40'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <PlayerAvatar player={player} club={club} size={46} />
                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5">
                        {isIcon && <Crown className="w-3.5 h-3.5 text-amber-400 shrink-0" />}
                        {isUcl17 && <Trophy className="w-3.5 h-3.5 text-indigo-300 shrink-0" />}
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
                          {club.shortName} · {player.position} · {isIcon ? 'ICON' : `${player.age}t`}
                        </span>
                      </div>
                    </div>
                  </div>

                  <div className="text-right shrink-0">
                    <p
                      className={`font-mono-num text-sm font-extrabold ${
                        isIcon ? 'text-amber-300' : isUcl17 ? 'text-indigo-300' : 'text-emerald-400'
                      }`}
                    >
                      OVR {player.rating}
                    </p>
                    <p className="font-mono-num text-xs text-slate-300">€{player.marketValueM}M</p>
                    {shardCost > 0 ? (
                      <p className="text-[10px] text-amber-400 font-bold">
                        +{shardCost} Mảnh
                      </p>
                    ) : isUcl17 ? (
                      <p className="text-[10px] text-amber-300 font-bold">Vô Địch C1 &apos;17</p>
                    ) : isGlobal ? (
                      <p className="text-[10px] text-pink-300 font-semibold">Quốc tế</p>
                    ) : player.transferStatus === 'listed' ? (
                      <p className="text-[10px] text-amber-400 font-semibold">Đang rao bán</p>
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>

          {!showAll && marketPlayers.length > 60 && (
            <button
              type="button"
              onClick={() => setShowAll(true)}
              className="w-full h-11 rounded-xl bg-[#121B24] hover:bg-slate-800 border border-white/10 text-xs font-bold text-emerald-400"
            >
              Hiển thị tất cả {marketPlayers.length} cầu thủ
            </button>
          )}
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
