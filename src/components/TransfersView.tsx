import React, { useMemo, useState } from 'react';
import {
  ArrowLeftRight,
  Check,
  Crown,
  ExternalLink,
  Globe,
  Inbox,
  RefreshCw,
  Search,
  Sparkles,
  TrendingUp,
  Trophy,
  UserPlus,
  X,
} from 'lucide-react';
import { getClubById, getIconShardCost, INITIAL_PLAYERS } from '../data/footballDatabase';
import { applyMarketOverrides, ensureFreeAgentsPool, getLoanInTerms } from '../lib/careerEngine';
import { normalizeInventory } from '../lib/inventoryEngine';
import { CareerSave, MarketOverride, NewsArticle, Player, Position } from '../types/game';
import { ClubCrest, PlayerAvatar } from './ClubBadgeAndAvatar';

interface TransfersViewProps {
  career: CareerSave;
  news: NewsArticle[];
  marketOverrides: Record<string, MarketOverride>;
  onSelectPlayer: (player: Player) => void;
  onSignFreeAgent?: (player: Player, years?: 1 | 2 | 3 | 4) => Promise<{ ok: boolean; message: string }>;
  onLoanInPlayer?: (player: Player) => Promise<{ ok: boolean; message: string }>;
  onBuyOutLoanedInPlayer?: (playerId: string) => Promise<{ ok: boolean; message: string }>;
  onRespondIncomingOffer?: (offerId: string, action: 'accept' | 'reject' | 'counter') => Promise<{ ok: boolean; message: string }>;
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
  onSignFreeAgent,
  onLoanInPlayer,
  onBuyOutLoanedInPlayer,
  onRespondIncomingOffer,
}) => {
  const [tab, setTab] = useState<'market' | 'free' | 'loans' | 'offers' | 'live'>('market');
  const [tierFilter, setTierFilter] = useState<'all' | 'ucl17' | 'icon' | 'global' | 'standard'>('all');
  const [queryText, setQueryText] = useState('');
  const [posFilter, setPosFilter] = useState<'ALL' | Position>('ALL');
  const [onlyListed, setOnlyListed] = useState(false);
  const [showAll, setShowAll] = useState(false);
  const [actionBusy, setActionBusy] = useState<string | null>(null);
  const [actionFeedback, setActionFeedback] = useState<{ ok: boolean; message: string } | null>(null);

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

  const freeAgentsPool = useMemo(
    () => ensureFreeAgentsPool(career, marketOverrides).filter((p) => !ownIds.has(p.id)),
    [career, marketOverrides, ownIds]
  );

  const loanMarketPlayers = useMemo(
    () =>
      mergedMarketBase
        .filter((p) => p.transferStatus === 'loan' && p.cardTier !== 'icon' && p.cardTier !== 'ucl17')
        .sort((a, b) => b.rating - a.rating),
    [mergedMarketBase]
  );

  const activeOffers = useMemo(
    () =>
      (career.incomingTransferOffers ?? []).filter(
        (o) => o.expiresAtMatchweek >= career.matchweek && ownIds.has(o.playerId)
      ),
    [career.incomingTransferOffers, career.matchweek, ownIds]
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

        <div className="flex flex-wrap gap-1 p-1 rounded-xl bg-[#0B1117]">
          {[
            { id: 'market', label: 'Sàn Cầu thủ' },
            { id: 'free', label: `Tự do (${freeAgentsPool.length})` },
            { id: 'loans', label: 'Cho mượn' },
            {
              id: 'offers',
              label: activeOffers.length > 0 ? `Lời mời (${activeOffers.length})` : 'Lời mời mua',
            },
            { id: 'live', label: 'Tin CN' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => {
                setTab(t.id as typeof tab);
                setActionFeedback(null);
              }}
              className={`h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap ${
                tab === t.id
                  ? 'bg-emerald-500 text-slate-950'
                  : t.id === 'offers' && activeOffers.length > 0
                    ? 'text-amber-300 bg-amber-500/10'
                    : 'text-slate-300 hover:text-white'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {actionFeedback && (
        <div
          className={`rounded-xl p-3 text-xs border flex items-center justify-between gap-2 ${
            actionFeedback.ok
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
              : 'bg-red-500/15 border-red-500/35 text-red-200'
          }`}
        >
          <span>{actionFeedback.message}</span>
          <button
            type="button"
            onClick={() => setActionFeedback(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

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

      {tab === 'free' && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-[#121B24] border border-emerald-500/25 p-4 flex items-center justify-between gap-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <UserPlus className="w-4 h-4 text-emerald-400" />
                Thị trường Cầu thủ Tự do (Free Agents · Phí €0M)
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Chiêu mộ trực tiếp không mất phí chuyển nhượng — chỉ trả lương tuần &amp; tiền lót tay ký hợp đồng.
              </p>
            </div>
          </div>

          {freeAgentsPool.length === 0 ? (
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-8 text-center text-xs text-slate-400">
              Hiện chưa có cầu thủ tự do nào khả dụng.
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
              {freeAgentsPool.map((player) => {
                const signBonusM = Number(Math.max(0.2, (player.wageK * 1.5) / 1000 * 3).toFixed(2));
                const freeClub = getClubById('free-agent');
                return (
                  <div
                    key={player.id}
                    className="rounded-2xl bg-[#121B24] border border-white/10 p-3 flex items-center justify-between gap-3"
                  >
                    <button
                      type="button"
                      onClick={() => onSelectPlayer(player)}
                      className="flex items-center gap-3 min-w-0 flex-1 text-left"
                    >
                      <PlayerAvatar player={player} club={freeClub} size={44} />
                      <div className="min-w-0">
                        <p className="font-bold text-sm text-white truncate">{player.name}</p>
                        <p className="text-xs text-slate-400 truncate">
                          {player.position} · {player.age}t · OVR{' '}
                          <strong className="font-mono-num text-emerald-400">{player.rating}</strong> · €{player.wageK}K/tuần
                        </p>
                      </div>
                    </button>
                    {onSignFreeAgent && (
                      <button
                        type="button"
                        disabled={actionBusy !== null || career.transferBudget < signBonusM}
                        onClick={async () => {
                          setActionBusy(`fa-${player.id}`);
                          setActionFeedback(null);
                          try {
                            const res = await onSignFreeAgent(player, 3);
                            setActionFeedback(res);
                          } finally {
                            setActionBusy(null);
                          }
                        }}
                        className="h-9 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs shrink-0 disabled:opacity-45"
                      >
                        {career.transferBudget < signBonusM
                          ? `Thiếu €${signBonusM}M`
                          : `Ký €0M (+€${signBonusM}M)`}
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      {tab === 'loans' && (
        <div className="space-y-4">
          {/* Loaned In */}
          {(career.loanedInPlayers ?? []).length > 0 && (
            <div className="rounded-2xl bg-[#121B24] border border-sky-500/30 p-4 space-y-2.5">
              <h3 className="text-sm font-bold text-sky-300 flex items-center gap-1.5">
                <ArrowLeftRight className="w-4 h-4" />
                Cầu thủ đang Mượn về CLB ({career.loanedInPlayers!.length})
              </h3>
              <div className="space-y-2">
                {career.loanedInPlayers!.map((li) => {
                  const p = career.squad.find((sp) => sp.id === li.playerId);
                  if (!p) return null;
                  const parentClub = getClubById(li.fromClubId);
                  return (
                    <div
                      key={li.playerId}
                      className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <PlayerAvatar player={p} club={parentClub} size={40} isUserCard />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {p.name} ({p.position} · OVR {p.rating})
                          </p>
                          <p className="text-[11px] text-slate-400">
                            Mượn từ {parentClub.shortName} · Điều khoản mua đứt:{' '}
                            <strong className="font-mono-num text-amber-300">€{li.buyOptionM}M</strong>
                          </p>
                        </div>
                      </div>
                      {onBuyOutLoanedInPlayer && (
                        <button
                          type="button"
                          disabled={actionBusy !== null || career.transferBudget < li.buyOptionM}
                          onClick={async () => {
                            setActionBusy(`buyout-${li.playerId}`);
                            setActionFeedback(null);
                            try {
                              const res = await onBuyOutLoanedInPlayer(li.playerId);
                              setActionFeedback(res);
                            } finally {
                              setActionBusy(null);
                            }
                          }}
                          className="h-9 px-3 rounded-lg bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs shrink-0 disabled:opacity-45"
                        >
                          {career.transferBudget < li.buyOptionM
                            ? `Thiếu €${li.buyOptionM}M`
                            : `Mua đứt (-€${li.buyOptionM}M)`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Loaned Out */}
          {(career.loanedOutPlayers ?? []).length > 0 && (
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-2.5">
              <h3 className="text-sm font-bold text-white">
                Cầu thủ đang Cho mượn ({career.loanedOutPlayers!.length} · Trở về đầu mùa tới)
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                {career.loanedOutPlayers!.map((lo) => {
                  const destClub = getClubById(lo.toClubId);
                  return (
                    <div
                      key={lo.player.id}
                      className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {lo.player.name} ({lo.player.position} · OVR {lo.player.rating})
                        </p>
                        <p className="text-[11px] text-slate-400">
                          Đang đá cho {destClub.name} · Dự kiến tăng +{lo.expectedGrowth} OVR
                        </p>
                      </div>
                      <span className="font-mono-num text-xs font-bold text-emerald-400 shrink-0">
                        +€{lo.loanFeeM}M
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Available for Loan In */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
            <div>
              <h3 className="text-sm font-bold text-white">Danh sách Sẵn sàng Cho mượn (1 mùa + Tùy chọn Mua đứt)</h3>
              <p className="text-xs text-slate-400 mt-0.5">
                Mượn ngắn hạn chỉ với ~14% giá trị thị trường. Để cho mượn cầu thủ nhà, bấm vào cầu thủ đó trong tab Đội hình.
              </p>
            </div>
            {loanMarketPlayers.length === 0 ? (
              <p className="text-xs text-slate-400 py-4 text-center">
                Hiện chưa có cầu thủ nào trên thị trường cho mượn.
              </p>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {loanMarketPlayers.slice(0, 24).map((p) => {
                  const club = getClubById(p.clubId);
                  const terms = getLoanInTerms(p);
                  return (
                    <div
                      key={p.id}
                      className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex items-center justify-between gap-2.5"
                    >
                      <button
                        type="button"
                        onClick={() => onSelectPlayer(p)}
                        className="flex items-center gap-2.5 min-w-0 flex-1 text-left"
                      >
                        <PlayerAvatar player={p} club={club} size={42} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{p.name}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {club.shortName} · {p.position} · OVR{' '}
                            <strong className="font-mono-num text-emerald-400">{p.rating}</strong> · Mua đứt €{terms.buyOptionM}M
                          </p>
                        </div>
                      </button>
                      {onLoanInPlayer && (
                        <button
                          type="button"
                          disabled={actionBusy !== null || career.transferBudget < terms.loanFeeM}
                          onClick={async () => {
                            setActionBusy(`loan-in-${p.id}`);
                            setActionFeedback(null);
                            try {
                              const res = await onLoanInPlayer(p);
                              setActionFeedback(res);
                            } finally {
                              setActionBusy(null);
                            }
                          }}
                          className="h-9 px-3 rounded-lg bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs shrink-0 disabled:opacity-45"
                        >
                          {career.transferBudget < terms.loanFeeM
                            ? `Thiếu €${terms.loanFeeM}M`
                            : `Mượn (-€${terms.loanFeeM}M)`}
                        </button>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {tab === 'offers' && (
        <div className="space-y-3">
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <Inbox className="w-4 h-4 text-amber-400" />
              Hộp thư Đề nghị Mua Cầu thủ từ CLB khác ({activeOffers.length})
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Các CLB đối thủ sẽ gửi lời hỏi mua sau mỗi vòng đấu (ưu tiên cầu thủ đang rao bán hoặc dự bị).
            </p>
          </div>

          {activeOffers.length === 0 ? (
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-8 text-center text-xs text-slate-400">
              Chưa có đề nghị hỏi mua mới. Hãy đưa các cầu thủ dư thừa lên sàn chuyển nhượng hoặc thi đấu tiếp các vòng tới.
            </div>
          ) : (
            <div className="space-y-2.5">
              {activeOffers.map((offer) => {
                const buyerClub = getClubById(offer.fromClubId);
                const ownPlayer = career.squad.find((p) => p.id === offer.playerId);
                return (
                  <div
                    key={offer.id}
                    className="rounded-2xl bg-[#121B24] border border-amber-400/35 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-3 min-w-0">
                      <ClubCrest club={buyerClub} size={34} />
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-white truncate">
                          {buyerClub.name} hỏi mua{' '}
                          <span className="text-emerald-300">{offer.playerName}</span> ({offer.position} · OVR {offer.rating})
                        </p>
                        <p className="text-[11px] text-slate-300 mt-0.5">
                          Giá đề nghị:{' '}
                          <strong className="font-mono-num text-amber-300">€{offer.offerM}M</strong>
                          {ownPlayer ? ` (Định giá: €${ownPlayer.marketValueM}M)` : ''} · Hết hạn Vòng {offer.expiresAtMatchweek}
                        </p>
                      </div>
                    </div>

                    {onRespondIncomingOffer && (
                      <div className="flex items-center gap-1.5 shrink-0 flex-wrap">
                        <button
                          type="button"
                          disabled={actionBusy !== null || career.squad.length <= 21}
                          onClick={async () => {
                            setActionBusy(`off-acc-${offer.id}`);
                            setActionFeedback(null);
                            try {
                              const res = await onRespondIncomingOffer(offer.id, 'accept');
                              setActionFeedback(res);
                            } finally {
                              setActionBusy(null);
                            }
                          }}
                          className="h-9 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs inline-flex items-center gap-1 disabled:opacity-45"
                        >
                          <Check className="w-3.5 h-3.5" />
                          {career.squad.length <= 21 ? 'Đội ≥21' : `Bán €${offer.offerM}M`}
                        </button>
                        {!offer.countered && (
                          <button
                            type="button"
                            disabled={actionBusy !== null}
                            onClick={async () => {
                              setActionBusy(`off-cnt-${offer.id}`);
                              setActionFeedback(null);
                              try {
                                const res = await onRespondIncomingOffer(offer.id, 'counter');
                                setActionFeedback(res);
                              } finally {
                                setActionBusy(null);
                              }
                            }}
                            className="h-9 px-3 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 border border-amber-400/40 text-amber-200 font-bold text-xs"
                          >
                            Ép giá +15%
                          </button>
                        )}
                        <button
                          type="button"
                          disabled={actionBusy !== null}
                          onClick={async () => {
                            setActionBusy(`off-rej-${offer.id}`);
                            setActionFeedback(null);
                            try {
                              const res = await onRespondIncomingOffer(offer.id, 'reject');
                              setActionFeedback(res);
                            } finally {
                              setActionBusy(null);
                            }
                          }}
                          className="h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                        >
                          Từ chối
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
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
