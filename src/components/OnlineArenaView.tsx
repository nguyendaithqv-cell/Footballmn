import React, { useMemo, useState } from 'react';
import {
  Award,
  Check,
  Crown,
  Flame,
  Loader2,
  Play,
  Search,
  Send,
  Shield,
  Sparkles,
  Star,
  Swords,
  Trophy,
  UserCheck,
  UserMinus,
  UserPlus,
  Users,
  X,
} from 'lucide-react';
import { CLUBS } from '../data/footballDatabase';
import {
  computeOnlineSeasonReward,
  formatRankLabel,
  getCurrentOnlineSeasonInfo,
  getOnlineTournamentEntryFeeM,
  getRankConfig,
  RANK_TIERS,
  RankedOutcomeResult,
} from '../lib/onlineArenaEngine';
import {
  ArenaChallenge,
  ArenaProfile,
  CareerSave,
  Friendship,
  MatchResultSummary,
  OnlineMatchMode,
} from '../types/game';
import { ClubCrest } from './ClubBadgeAndAvatar';
import { MatchDetailModal } from './MatchDetailModal';
import { ConfirmActionModal } from './ConfirmActionModal';

interface OnlineArenaViewProps {
  currentUid: string;
  career: CareerSave;
  userArena: ArenaProfile;
  leaderboard: ArenaProfile[];
  challenges: ArenaChallenge[];
  friendships: Friendship[];
  onPlayRankedMatch: () => Promise<{
    ok: boolean;
    message: string;
    opponent?: ArenaProfile;
    summary?: MatchResultSummary;
    rankedResult?: RankedOutcomeResult;
  }>;
  onPlayInstantMatch: (
    opponent: ArenaProfile,
    mode: 'duel' | 'friendly'
  ) => Promise<{
    ok: boolean;
    message: string;
    summary?: MatchResultSummary;
  }>;
  onSendChallengeInvite: (opponent: ArenaProfile) => Promise<{ ok: boolean; message: string }>;
  onRespondChallengeInvite: (
    challenge: ArenaChallenge,
    accept: boolean
  ) => Promise<{ ok: boolean; message: string; summary?: MatchResultSummary }>;
  onCancelChallengeInvite: (challengeId: string) => Promise<{ ok: boolean; message: string }>;
  onStartTournament: (size: 8 | 16) => Promise<{ ok: boolean; message: string }>;
  onPlayTournamentRound: () => Promise<{
    ok: boolean;
    message: string;
    summary?: MatchResultSummary;
  }>;
  onSendFriendRequest: (target: ArenaProfile) => Promise<{ ok: boolean; message: string }>;
  onRespondFriendRequest: (
    friendship: Friendship,
    accept: boolean
  ) => Promise<{ ok: boolean; message: string }>;
  onRemoveFriendship: (friendshipId: string) => Promise<{ ok: boolean; message: string }>;
  onClaimOnlineSeasonReward?: () => Promise<{ ok: boolean; message: string }>;
}

type ArenaSubTab = 'ranked' | 'duel' | 'tournament' | 'leaderboard' | 'friends';

export const OnlineArenaView: React.FC<OnlineArenaViewProps> = ({
  currentUid,
  career,
  userArena,
  leaderboard,
  challenges,
  friendships,
  onPlayRankedMatch,
  onPlayInstantMatch,
  onSendChallengeInvite,
  onRespondChallengeInvite,
  onCancelChallengeInvite,
  onStartTournament,
  onPlayTournamentRound,
  onSendFriendRequest,
  onRespondFriendRequest,
  onRemoveFriendship,
  onClaimOnlineSeasonReward,
}) => {
  const [subTab, setSubTab] = useState<ArenaSubTab>('ranked');
  const [lbFilter, setLbFilter] = useState<'all' | 'real' | 'bot'>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [busyKey, setBusyKey] = useState<string | null>(null);
  const [matchingStatus, setMatchingStatus] = useState<string | null>(null);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);
  const [showRankLadderModal, setShowRankLadderModal] = useState(false);
  const [detailMatch, setDetailMatch] = useState<MatchResultSummary | null>(null);
  const [lastRankedOutcome, setLastRankedOutcome] = useState<{
    opponent: ArenaProfile;
    summary: MatchResultSummary;
    rankedResult: RankedOutcomeResult;
  } | null>(null);
  const [pendingConfirm, setPendingConfirm] = useState<{
    title: string;
    description: React.ReactNode;
    confirmLabel: string;
    tone: 'emerald' | 'amber' | 'danger';
    action: () => Promise<void>;
  } | null>(null);
  const [confirmBusy, setConfirmBusy] = useState(false);

  const userRankCfg = getRankConfig(userArena.rankTier);
  const userClub = CLUBS.find((c) => c.id === userArena.clubId) ?? CLUBS[0];
  const userBoardPosition =
    leaderboard.findIndex((p) => p.uid === currentUid) + 1 || leaderboard.length;

  const profileMap = useMemo(() => {
    const m = new Map<string, ArenaProfile>();
    for (const p of leaderboard) m.set(p.uid, p);
    return m;
  }, [leaderboard]);

  // Friendships categorization
  const { acceptedFriends, incomingRequests, outgoingRequests, friendshipByOtherUid } =
    useMemo(() => {
      const accepted: { friendship: Friendship; peer: ArenaProfile }[] = [];
      const incoming: Friendship[] = [];
      const outgoing: Friendship[] = [];
      const byPeer = new Map<string, Friendship>();

      for (const f of friendships) {
        const peerUid = f.requesterUid === currentUid ? f.recipientUid : f.requesterUid;
        byPeer.set(peerUid, f);

        if (f.status === 'accepted') {
          const found = profileMap.get(peerUid);
          const peer: ArenaProfile = found ?? {
            uid: peerUid,
            visibility: 'public',
            isBot: f.recipientIsBot,
            managerName:
              f.requesterUid === currentUid ? f.recipientName : f.requesterName,
            nationality: 'Việt Nam',
            clubId:
              f.requesterUid === currentUid ? f.recipientClubId : f.requesterClubId,
            clubName:
              CLUBS.find(
                (c) =>
                  c.id ===
                  (f.requesterUid === currentUid ? f.recipientClubId : f.requesterClubId)
              )?.name ?? 'Club',
            formation: '4-3-3',
            squadOverall: 80,
            attackRating: 80,
            midfieldRating: 80,
            defenseRating: 80,
            rankTier: 'dong',
            rankDivision: 3,
            rankStars: 0,
            bravePoints: 0,
            eloPoints: 1000,
            winStreak: 0,
            highestRankIndex: 0,
            matchesPlayed: 0,
            wins: 0,
            draws: 0,
            losses: 0,
            tournamentTitles: 0,
            starters: [],
          };
          accepted.push({ friendship: f, peer });
        } else if (f.status === 'pending') {
          if (f.recipientUid === currentUid) incoming.push(f);
          else if (f.requesterUid === currentUid) outgoing.push(f);
        }
      }
      return {
        acceptedFriends: accepted,
        incomingRequests: incoming,
        outgoingRequests: outgoing,
        friendshipByOtherUid: byPeer,
      };
    }, [friendships, currentUid, profileMap]);

  // Challenges categorization
  const { incomingChallenges, outgoingChallenges, completedChallenges } = useMemo(() => {
    const inc: ArenaChallenge[] = [];
    const out: ArenaChallenge[] = [];
    const done: ArenaChallenge[] = [];

    for (const c of challenges) {
      if (c.status === 'pending') {
        if (c.toUid === currentUid) inc.push(c);
        else if (c.fromUid === currentUid) out.push(c);
      } else if (c.status === 'completed') {
        done.push(c);
      }
    }
    return { incomingChallenges: inc, outgoingChallenges: out, completedChallenges: done };
  }, [challenges, currentUid]);

  const realPlayerCount = useMemo(
    () => leaderboard.filter((p) => !p.isBot).length,
    [leaderboard]
  );
  const botCount = useMemo(() => leaderboard.filter((p) => p.isBot).length, [leaderboard]);

  const filteredLeaderboard = useMemo(() => {
    const q = searchQuery.trim().toLowerCase();
    return leaderboard.filter((p) => {
      if (lbFilter === 'real' && p.isBot) return false;
      if (lbFilter === 'bot' && !p.isBot) return false;
      if (q) {
        return (
          p.managerName.toLowerCase().includes(q) ||
          p.clubName.toLowerCase().includes(q) ||
          p.uid.toLowerCase().includes(q)
        );
      }
      return true;
    });
  }, [leaderboard, lbFilter, searchQuery]);

  const duelOpponents = useMemo(
    () =>
      leaderboard
        .filter((p) => p.uid !== currentUid)
        .filter((p) => {
          const q = searchQuery.trim().toLowerCase();
          if (!q) return true;
          return (
            p.managerName.toLowerCase().includes(q) ||
            p.clubName.toLowerCase().includes(q)
          );
        }),
    [leaderboard, currentUid, searchQuery]
  );

  const handleRankedPlay = async () => {
    if (busyKey) return;
    setBusyKey('ranked');
    setFeedback(null);
    setMatchingStatus('Đang ghép cặp đối thủ cùng bậc Rank...');
    try {
      await new Promise((r) => window.setTimeout(r, 750));
      setMatchingStatus('Đã tìm thấy đối thủ! Đang mô phỏng trận Đấu Hạng...');
      const res = await onPlayRankedMatch();
      if (res.ok && res.opponent && res.summary && res.rankedResult) {
        setLastRankedOutcome({
          opponent: res.opponent,
          summary: res.summary,
          rankedResult: res.rankedResult,
        });
      }
      setFeedback({ ok: res.ok, text: res.message });
    } finally {
      setMatchingStatus(null);
      setBusyKey(null);
    }
  };

  const handleInstantMatch = async (opponent: ArenaProfile, mode: 'duel' | 'friendly') => {
    if (busyKey) return;
    setBusyKey(`match-${opponent.uid}`);
    setFeedback(null);
    try {
      const res = await onPlayInstantMatch(opponent, mode);
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok && res.summary) {
        setDetailMatch(res.summary);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleChallengeInvite = async (opponent: ArenaProfile) => {
    if (busyKey) return;
    setBusyKey(`inv-${opponent.uid}`);
    setFeedback(null);
    try {
      const res = await onSendChallengeInvite(opponent);
      setFeedback({ ok: res.ok, text: res.message });
    } finally {
      setBusyKey(null);
    }
  };

  const handleRespondChallenge = async (ch: ArenaChallenge, accept: boolean) => {
    if (busyKey) return;
    setBusyKey(`resp-ch-${ch.id}`);
    setFeedback(null);
    try {
      const res = await onRespondChallengeInvite(ch, accept);
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok && res.summary) {
        setDetailMatch(res.summary);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleStartTourney = (size: 8 | 16) => {
    if (busyKey) return;
    const fee = getOnlineTournamentEntryFeeM(size);
    setPendingConfirm({
      title: `Đăng ký Giải Online ${size} HLV?`,
      description: (
        <p>
          Khấu trừ lệ phí tham dự{' '}
          <strong className="text-amber-300">-€{fee}M</strong> từ ngân sách CLB để khởi tạo nhánh đấu {size === 8 ? '8 đội (3 vòng)' : '16 đội (4 vòng)'}.
        </p>
      ),
      confirmLabel: `Tham gia (-€${fee}M)`,
      tone: 'amber',
      action: async () => {
        setBusyKey(`start-tour-${size}`);
        setFeedback(null);
        try {
          const res = await onStartTournament(size);
          setFeedback({ ok: res.ok, text: res.message });
        } finally {
          setBusyKey(null);
        }
      },
    });
  };

  const handlePlayTourneyRound = async () => {
    if (busyKey) return;
    setBusyKey('play-tour-round');
    setFeedback(null);
    try {
      const res = await onPlayTournamentRound();
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok && res.summary) {
        setDetailMatch(res.summary);
      }
    } finally {
      setBusyKey(null);
    }
  };

  const handleAddFriend = async (target: ArenaProfile) => {
    if (busyKey) return;
    setBusyKey(`friend-${target.uid}`);
    setFeedback(null);
    try {
      const res = await onSendFriendRequest(target);
      setFeedback({ ok: res.ok, text: res.message });
    } finally {
      setBusyKey(null);
    }
  };

  const openChallengeReport = (ch: ArenaChallenge) => {
    if (!ch.report) return;
    const summary: MatchResultSummary = {
      id: ch.id,
      matchweek: 1,
      competition: 'friendly',
      roundLabel:
        ch.mode === 'ranked'
          ? 'Đấu Hạng Online'
          : ch.mode === 'friendly'
            ? 'Giao Hữu Bạn Bè'
            : ch.mode === 'tournament'
              ? 'Giải Đấu Online'
              : 'Tỷ Thí 1v1',
      homeClubId: ch.fromClubId,
      awayClubId: ch.toClubId,
      homeGoals: ch.homeGoals ?? 0,
      awayGoals: ch.awayGoals ?? 0,
      penaltiesHome: ch.penaltiesHome,
      penaltiesAway: ch.penaltiesAway,
      possessionHome: ch.report.possessionHome,
      shotsHome: ch.report.shotsHome,
      shotsAway: ch.report.shotsAway,
      xgHome: ch.report.xgHome,
      xgAway: ch.report.xgAway,
      homeFormation: ch.report.homeFormation,
      awayFormation: ch.report.awayFormation,
      homeManagerName: ch.report.homeManagerName ?? ch.fromManagerName,
      awayManagerName: ch.report.awayManagerName ?? ch.toManagerName,
      venue: ch.report.venue,
      manOfTheMatch: ch.report.manOfTheMatch,
      playerRatings: ch.report.playerRatings,
      events: ch.report.events,
      playedAt: ch.report.playedAt ?? new Date().toISOString(),
    };
    setDetailMatch(summary);
  };

  const renderChallengeButtonForUser = (target: ArenaProfile) => {
    const rel = friendshipByOtherUid.get(target.uid);
    if (rel?.status === 'accepted') {
      return (
        <span className="px-2.5 py-1.5 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-[11px] font-bold text-emerald-300 inline-flex items-center gap-1">
          <UserCheck className="w-3.5 h-3.5" />
          Bạn bè
        </span>
      );
    }
    if (rel?.status === 'pending') {
      return (
        <span className="px-2.5 py-1.5 rounded-lg bg-slate-800 border border-white/10 text-[11px] font-semibold text-slate-300">
          Đã gửi lời mời
        </span>
      );
    }
    return (
      <button
        type="button"
        disabled={busyKey === `friend-${target.uid}`}
        onClick={() => handleAddFriend(target)}
        className="h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-white inline-flex items-center gap-1.5 disabled:opacity-50"
      >
        <UserPlus className="w-3.5 h-3.5 text-sky-400" />
        Kết bạn
      </button>
    );
  };

  const tourney = career.onlineTournament;
  const tourneyRounds = useMemo(() => {
    if (!tourney) return [];
    const grouped = new Map<number, typeof tourney.matches>();
    for (const m of tourney.matches) {
      const list = grouped.get(m.round) ?? [];
      list.push(m);
      grouped.set(m.round, list);
    }
    return Array.from(grouped.entries()).sort((a, b) => a[0] - b[0]);
  }, [tourney]);

  const pendingInboxCount = incomingChallenges.length + incomingRequests.length;

  return (
    <div className="space-y-4">
      {/* Top Online Rank Hero Banner */}
      <div
        className={`rounded-2xl bg-[#121B24] border p-4 sm:p-5 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-4 ${userRankCfg.borderClass}`}
      >
        <div className="flex items-center gap-3.5 min-w-0">
          <div
            className={`w-16 h-16 rounded-2xl border flex flex-col items-center justify-center shrink-0 ${userRankCfg.badgeClass} ${userRankCfg.borderClass}`}
          >
            <Crown className={`w-6 h-6 ${userRankCfg.textClass}`} />
            <span className={`font-mono-num text-[11px] font-extrabold mt-0.5 ${userRankCfg.textClass}`}>
              {userArena.rankStars}★
            </span>
          </div>

          <div className="min-w-0 space-y-1">
            <div className="flex items-center gap-2 flex-wrap">
              <span className={`text-sm sm:text-base font-extrabold ${userRankCfg.textClass}`}>
                {formatRankLabel(userArena.rankTier, userArena.rankDivision, userArena.rankStars)}
              </span>
              <span className="px-2 py-0.5 rounded-md bg-[#0B1117] border border-white/10 font-mono-num text-[11px] font-bold text-emerald-400">
                Hạng #{userBoardPosition} Server
              </span>
              {userArena.winStreak >= 2 && (
                <span className="px-2 py-0.5 rounded-md bg-orange-500/20 border border-orange-400/40 text-[11px] font-bold text-orange-300 inline-flex items-center gap-1">
                  <Flame className="w-3 h-3" />
                  Chuỗi {userArena.winStreak} thắng
                </span>
              )}
            </div>

            <div className="flex items-center gap-2 text-xs text-slate-300 flex-wrap">
              <ClubCrest club={userClub} size={18} />
              <span className="font-semibold text-white">{userArena.managerName}</span>
              <span>· {userClub.shortName}</span>
              <span>· OVR {userArena.squadOverall}</span>
              <span>· {userArena.formation}</span>
            </div>

            {/* Brave Points Progress Bar */}
            <div className="flex items-center gap-2 pt-0.5 max-w-sm">
              <Shield className="w-3.5 h-3.5 text-sky-400 shrink-0" />
              <div className="flex-1 h-2 rounded-full bg-[#0B1117] border border-white/10 overflow-hidden">
                <div
                  className="h-full bg-gradient-to-r from-sky-500 to-emerald-400 transition-all"
                  style={{ width: `${userArena.bravePoints}%` }}
                />
              </div>
              <span className="font-mono-num text-[11px] font-bold text-sky-300 shrink-0">
                Bảo vệ: {userArena.bravePoints}/100
              </span>
            </div>
          </div>
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-[#0B1117] border border-white/5 px-3 py-2">
              <p className="text-[10px] text-slate-400">ELO</p>
              <p className="font-mono-num text-sm font-extrabold text-amber-400">
                {userArena.eloPoints}
              </p>
            </div>
            <div className="rounded-xl bg-[#0B1117] border border-white/5 px-3 py-2">
              <p className="text-[10px] text-slate-400">Thắng/Bại</p>
              <p className="font-mono-num text-sm font-extrabold text-white">
                {userArena.wins}/{userArena.losses}
              </p>
            </div>
            <div className="rounded-xl bg-[#0B1117] border border-white/5 px-3 py-2">
              <p className="text-[10px] text-slate-400">Cúp Online</p>
              <p className="font-mono-num text-sm font-extrabold text-emerald-400">
                {userArena.tournamentTitles}
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={() => setShowRankLadderModal(true)}
            className="h-11 px-3.5 rounded-xl bg-[#0B1117] hover:bg-slate-800 border border-white/15 text-xs font-bold text-amber-300 flex items-center gap-1.5"
          >
            <Award className="w-4 h-4" />
            Lộ trình Rank
          </button>
        </div>
      </div>

      {/* Sub-Navigation */}
      <div className="grid grid-cols-2 sm:grid-cols-5 gap-1.5 p-1.5 rounded-2xl bg-[#121B24] border border-white/10">
        {[
          { id: 'ranked', label: 'Đấu Hạng', icon: Crown, badge: 0 },
          { id: 'duel', label: 'Tỷ Thí', icon: Swords, badge: incomingChallenges.length },
          { id: 'tournament', label: 'Đấu Giải', icon: Trophy, badge: 0 },
          { id: 'leaderboard', label: `BXH (${leaderboard.length})`, icon: Sparkles, badge: 0 },
          { id: 'friends', label: `Bạn Bè (${acceptedFriends.length})`, icon: Users, badge: incomingRequests.length },
        ].map((tab) => {
          const Icon = tab.icon;
          const active = subTab === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              onClick={() => setSubTab(tab.id as ArenaSubTab)}
              className={`relative h-10 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 px-2 transition-colors whitespace-nowrap ${
                active
                  ? 'bg-emerald-500 text-slate-950'
                  : 'text-slate-300 hover:text-white hover:bg-white/5'
              }`}
            >
              <Icon className="w-3.5 h-3.5 shrink-0" />
              <span>{tab.label}</span>
              {tab.badge > 0 && (
                <span className="px-1.5 py-0.5 rounded-full bg-amber-400 text-slate-950 font-mono-num text-[10px] font-extrabold leading-none">
                  {tab.badge}
                </span>
              )}
            </button>
          );
        })}
      </div>

      {pendingInboxCount > 0 && subTab !== 'duel' && subTab !== 'friends' && (
        <div className="rounded-xl bg-amber-500/15 border border-amber-400/35 px-3.5 py-2.5 text-xs text-amber-200 flex items-center justify-between gap-2">
          <span>
            Bạn đang có{' '}
            {incomingChallenges.length > 0 ? `${incomingChallenges.length} lời mời Tỷ thí` : ''}
            {incomingChallenges.length > 0 && incomingRequests.length > 0 ? ' và ' : ''}
            {incomingRequests.length > 0 ? `${incomingRequests.length} lời mời Kết bạn` : ''} chờ phản hồi.
          </span>
          <button
            type="button"
            onClick={() => setSubTab(incomingChallenges.length > 0 ? 'duel' : 'friends')}
            className="px-2.5 py-1 rounded-lg bg-amber-400 text-slate-950 font-bold text-[11px] shrink-0"
          >
            Xem ngay
          </button>
        </div>
      )}

      {feedback && (
        <div
          className={`rounded-xl p-3 text-xs border flex items-center justify-between gap-2 ${
            feedback.ok
              ? 'bg-emerald-500/15 border-emerald-500/35 text-emerald-200'
              : 'bg-red-500/15 border-red-500/35 text-red-200'
          }`}
        >
          <span>{feedback.text}</span>
          <button
            type="button"
            onClick={() => setFeedback(null)}
            className="text-slate-400 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* TAB 1: RANKED MODE (LIEN QUAN STYLE) */}
      {subTab === 'ranked' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4">
          <div className="lg:col-span-7 rounded-2xl bg-[#121B24] border border-white/10 p-5 space-y-4">
            <div className="flex items-start justify-between gap-3">
              <div>
                <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                  Mùa Giải Đấu Hạng Liên Server
                </p>
                <h3 className="font-display text-2xl font-extrabold text-white mt-0.5">
                  Đấu Hạng Thăng Cấp (Đồng → Thách Đấu)
                </h3>
              </div>
              <span className={`px-3 py-1 rounded-lg border text-xs font-extrabold ${userRankCfg.badgeClass} ${userRankCfg.borderClass} ${userRankCfg.textClass}`}>
                {userRankCfg.name}
              </span>
            </div>

            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-4 space-y-3">
              <div className="flex items-center justify-between text-xs">
                <span className="text-slate-400">Tiến trình Sao tiểu bậc hiện tại</span>
                <span className={`font-mono-num font-bold ${userRankCfg.textClass}`}>
                  {userRankCfg.order >= 6
                    ? `${userArena.rankStars}★ tích lũy`
                    : `${userArena.rankStars} / ${userRankCfg.starsPerDivision} Sao để lên bậc`}
                </span>
              </div>

              {userRankCfg.order < 6 ? (
                <div className="flex items-center gap-2 flex-wrap">
                  {Array.from({ length: userRankCfg.starsPerDivision }).map((_, idx) => {
                    const filled = idx < userArena.rankStars;
                    return (
                      <div
                        key={idx}
                        className={`w-9 h-9 rounded-xl border flex items-center justify-center ${
                          filled
                            ? 'bg-amber-400/20 border-amber-400 text-amber-300'
                            : 'bg-[#121B24] border-white/10 text-slate-600'
                        }`}
                      >
                        <Star className={`w-5 h-5 ${filled ? 'fill-amber-400' : ''}`} />
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm font-bold text-amber-300">
                  <Crown className="w-5 h-5 fill-amber-400 text-amber-400" />
                  <span>
                    {userArena.rankStars >= 50
                      ? 'Bạn đang đứng ở đỉnh cao Thách Đấu!'
                      : userArena.rankStars >= 25
                        ? `Cần thêm ${50 - userArena.rankStars}★ để chạm mốc Thách Đấu (50★)`
                        : `Cần thêm ${25 - userArena.rankStars}★ để thăng hạng Chiến Tướng (25★)`}
                  </span>
                </div>
              )}

              <ul className="text-xs text-slate-300 space-y-1 pt-2 border-t border-white/5">
                <li>
                  • <strong className="text-emerald-400">Thắng trận:</strong> +1 Sao + 18–32 Điểm Bảo Vệ. Hòa sau 90&apos; sẽ đá <strong>Luân lưu 11m</strong> phân định thắng bại.
                </li>
                <li>
                  • <strong className="text-sky-400">Khiên Bảo Vệ (80 điểm):</strong> Tự động chặn rớt Sao khi thua trận. Đủ <strong>100 điểm</strong> khi thắng sẽ cộng thưởng thêm +1 Sao!
                </li>
                <li>
                  • <strong className="text-amber-300">Thưởng Thăng Hạng:</strong> Đạt bậc mới lần đầu nhận ngay Gói Thẻ, Mảnh Ngôi Sao &amp; €M.
                </li>
              </ul>
            </div>

            <button
              type="button"
              disabled={Boolean(busyKey)}
              onClick={handleRankedPlay}
              className="w-full h-12 rounded-xl bg-gradient-to-r from-emerald-500 to-teal-400 hover:from-emerald-400 hover:to-teal-300 text-slate-950 font-extrabold text-sm flex items-center justify-center gap-2 shadow-lg shadow-emerald-500/20 disabled:opacity-60"
            >
              {busyKey === 'ranked' ? (
                <>
                  <Loader2 className="w-4 h-4 animate-spin" />
                  {matchingStatus || 'Đang ghép trận Đấu Hạng...'}
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-slate-950" />
                  Tìm Trận Đấu Hạng Ngay
                </>
              )}
            </button>

            {(() => {
              const seasonInfo = getCurrentOnlineSeasonInfo();
              const rewardPreview = computeOnlineSeasonReward(userArena.highestRankIndex ?? 0);
              const claimedThisMonth = career.onlineRankSeasonClaimedId === seasonInfo.seasonId;
              return (
                <div className="rounded-xl bg-[#0B1117] border border-amber-400/25 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div className="space-y-0.5">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="text-xs font-extrabold text-amber-300">{seasonInfo.label}</span>
                      <span className="px-2 py-0.5 rounded bg-white/5 font-mono-num text-[10px] text-slate-300">
                        Còn {seasonInfo.daysRemaining} ngày
                      </span>
                    </div>
                    <p className="text-[11px] text-slate-300">
                      Quà mùa Rank ({rewardPreview.tierName}):{' '}
                      <strong className="text-emerald-400">+€{rewardPreview.budgetM}M</strong> ·{' '}
                      <strong className="text-sky-300">+{rewardPreview.shards} Mảnh</strong> ·{' '}
                      <strong className="text-amber-300">
                        +1 Gói {rewardPreview.packTier === 'legend_pack' ? 'Huyền Thoại' : rewardPreview.packTier === 'elite_pack' ? 'Ngôi Sao' : 'Tuyển Trạch'}
                      </strong>
                    </p>
                  </div>
                  {onClaimOnlineSeasonReward && (
                    <button
                      type="button"
                      disabled={Boolean(busyKey) || claimedThisMonth || userArena.matchesPlayed === 0}
                      onClick={async () => {
                        setBusyKey('claim-online-season');
                        setFeedback(null);
                        try {
                          const res = await onClaimOnlineSeasonReward();
                          setFeedback({ ok: res.ok, text: res.message });
                        } finally {
                          setBusyKey(null);
                        }
                      }}
                      className="h-9 px-3.5 rounded-lg bg-amber-400 hover:bg-amber-300 text-slate-950 font-bold text-xs shrink-0 disabled:opacity-45"
                    >
                      {claimedThisMonth
                        ? 'Đã nhận quà mùa'
                        : userArena.matchesPlayed === 0
                          ? 'Đá 1 trận để mở'
                          : 'Nhận Thưởng Mùa Rank'}
                    </button>
                  )}
                </div>
              );
            })()}
          </div>

          {/* Right Panel: Latest Ranked Result */}
          <div className="lg:col-span-5 rounded-2xl bg-[#121B24] border border-white/10 p-5 space-y-4">
            <h4 className="text-sm font-bold text-white flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-amber-400" />
              Kết quả Trận Hạng gần nhất
            </h4>

            {lastRankedOutcome ? (
              <div className="space-y-3">
                <div className="rounded-xl bg-[#0B1117] border border-white/10 p-4 text-center space-y-2">
                  <p className="text-[11px] font-bold uppercase text-slate-400">
                    Đối thủ: {lastRankedOutcome.opponent.managerName} (
                    {formatRankLabel(
                      lastRankedOutcome.opponent.rankTier,
                      lastRankedOutcome.opponent.rankDivision,
                      lastRankedOutcome.opponent.rankStars
                    )}
                    )
                  </p>
                  <div className="font-display text-4xl font-extrabold font-mono-num text-white">
                    {lastRankedOutcome.summary.homeGoals} - {lastRankedOutcome.summary.awayGoals}
                  </div>
                  {lastRankedOutcome.summary.penaltiesHome !== undefined && (
                    <p className="text-xs font-mono-num font-bold text-amber-400">
                      Luân lưu 11m: {lastRankedOutcome.summary.penaltiesHome} -{' '}
                      {lastRankedOutcome.summary.penaltiesAway}
                    </p>
                  )}
                  <div className="flex flex-wrap items-center justify-center gap-2 pt-1">
                    {lastRankedOutcome.rankedResult.starDelta > 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-emerald-500/20 border border-emerald-400/40 text-xs font-extrabold text-emerald-300">
                        +{lastRankedOutcome.rankedResult.starDelta} Sao Hạng
                      </span>
                    )}
                    {lastRankedOutcome.rankedResult.starDelta < 0 && (
                      <span className="px-2.5 py-1 rounded-lg bg-red-500/20 border border-red-400/40 text-xs font-extrabold text-red-300">
                        {lastRankedOutcome.rankedResult.starDelta} Sao Hạng
                      </span>
                    )}
                    {lastRankedOutcome.rankedResult.shieldUsed && (
                      <span className="px-2.5 py-1 rounded-lg bg-sky-500/20 border border-sky-400/40 text-xs font-bold text-sky-300">
                        Khiên Bảo Vệ giữ nguyên Sao!
                      </span>
                    )}
                    {lastRankedOutcome.rankedResult.bonusStarUsed && (
                      <span className="px-2.5 py-1 rounded-lg bg-amber-500/20 border border-amber-400/40 text-xs font-bold text-amber-300">
                        Đầy 100 Bảo Vệ (+1 Sao thưởng)
                      </span>
                    )}
                  </div>
                  {lastRankedOutcome.rankedResult.promotedTier && (
                    <p className="text-xs font-extrabold text-amber-300 pt-1">
                      CHÚC MỪNG THĂNG HẠNG {lastRankedOutcome.rankedResult.promotedTier.name.toUpperCase()}!
                    </p>
                  )}
                </div>

                <button
                  type="button"
                  onClick={() => setDetailMatch(lastRankedOutcome.summary)}
                  className="w-full h-10 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-bold text-white"
                >
                  Xem Thông số &amp; Chấm điểm Cầu thủ
                </button>
              </div>
            ) : (
              <div className="rounded-xl bg-[#0B1117] border border-white/5 p-6 text-center space-y-2">
                <Crown className="w-8 h-8 text-slate-600 mx-auto" />
                <p className="text-xs font-semibold text-slate-300">
                  Chưa có trận Đấu Hạng nào trong phiên này.
                </p>
                <p className="text-[11px] text-slate-400">
                  Bấm &quot;Tìm Trận Đấu Hạng Ngay&quot; để so tài cùng các HLV trên bảng xếp hạng và tích lũy Sao!
                </p>
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2: TỶ THÍ 1v1 */}
      {subTab === 'duel' && (
        <div className="space-y-4">
          {/* Incoming & Outgoing Pending Invitations */}
          {(incomingChallenges.length > 0 || outgoingChallenges.length > 0) && (
            <div className="rounded-2xl bg-[#121B24] border border-amber-400/35 p-4 space-y-3">
              <h3 className="text-sm font-bold text-amber-300 flex items-center gap-2">
                <Swords className="w-4 h-4" />
                Hộp thư Thách Đấu Trực Tiếp
              </h3>

              <div className="space-y-2">
                {incomingChallenges.map((ch) => {
                  const fromClub = CLUBS.find((c) => c.id === ch.fromClubId) ?? CLUBS[0];
                  return (
                    <div
                      key={ch.id}
                      className="rounded-xl bg-[#0B1117] border border-amber-400/30 p-3 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ClubCrest club={fromClub} size={28} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {ch.fromManagerName} mời bạn Tỷ thí 1v1
                          </p>
                          <p className="text-[11px] text-slate-400">
                            {fromClub.name} · {ch.note || 'Giao đấu chiến thuật'}
                          </p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => handleRespondChallenge(ch, true)}
                          className="h-9 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1"
                        >
                          <Check className="w-3.5 h-3.5" />
                          Chấp nhận &amp; Đá
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => handleRespondChallenge(ch, false)}
                          className="h-9 px-3 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold"
                        >
                          Từ chối
                        </button>
                      </div>
                    </div>
                  );
                })}

                {outgoingChallenges.map((ch) => {
                  const toClub = CLUBS.find((c) => c.id === ch.toClubId) ?? CLUBS[0];
                  return (
                    <div
                      key={ch.id}
                      className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ClubCrest club={toClub} size={24} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-slate-200 truncate">
                            Đã gửi lời mời tới {ch.toManagerName}
                          </p>
                          <p className="text-[11px] text-slate-400">Đang chờ đối thủ chấp nhận...</p>
                        </div>
                      </div>
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => onCancelChallengeInvite(ch.id)}
                        className="h-8 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                      >
                        Hủy
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Opponent Picker for Quick Duel / Invite */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white flex items-center gap-2">
                  <Swords className="w-4 h-4 text-emerald-400" />
                  Chọn Đối Thủ Tỷ Thí 1v1
                </h3>
                <p className="text-xs text-slate-400">
                  So tài trực tiếp với đội hình thật của người chơi khác hoặc 10 HLV Bot AI.
                </p>
              </div>

              <div className="relative w-full sm:w-64">
                <Search className="w-4 h-4 text-slate-400 absolute left-3 top-2.5" />
                <input
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Tìm HLV hoặc CLB..."
                  className="w-full h-9 pl-9 pr-3 rounded-xl bg-[#0B1117] border border-white/10 text-xs text-white focus:outline-none focus:border-emerald-500"
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[420px] overflow-y-auto pr-1">
              {duelOpponents.map((opp) => {
                const club = CLUBS.find((c) => c.id === opp.clubId) ?? CLUBS[0];
                const cfg = getRankConfig(opp.rankTier);
                return (
                  <div
                    key={opp.uid}
                    className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex items-center justify-between gap-3"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <ClubCrest club={club} size={32} />
                      <div className="min-w-0">
                        <div className="flex items-center gap-1.5">
                          <p className="text-xs font-bold text-white truncate">{opp.managerName}</p>
                          <span
                            className={`px-1.5 py-0.5 rounded text-[9px] font-bold shrink-0 ${
                              opp.isBot
                                ? 'bg-slate-700 text-slate-300'
                                : 'bg-emerald-500/20 text-emerald-300'
                            }`}
                          >
                            {opp.isBot ? 'BOT' : 'THỰC'}
                          </span>
                        </div>
                        <p className={`text-[11px] font-semibold ${cfg.textClass} truncate`}>
                          {formatRankLabel(opp.rankTier, opp.rankDivision, opp.rankStars)} · OVR {opp.squadOverall}
                        </p>
                      </div>
                    </div>

                    <div className="flex items-center gap-1.5 shrink-0">
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => handleInstantMatch(opp, 'duel')}
                        className="h-9 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1"
                      >
                        <Swords className="w-3.5 h-3.5" />
                        Đá ngay
                      </button>
                      {!opp.isBot && (
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => handleChallengeInvite(opp)}
                          title="Gửi lời mời tỷ thí"
                          className="h-9 px-2.5 rounded-lg bg-slate-800 hover:bg-slate-700 border border-white/10 text-amber-300 text-xs font-semibold inline-flex items-center gap-1"
                        >
                          <Send className="w-3 h-3" />
                          Mời
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>

          {/* Completed Online Match History */}
          {completedChallenges.length > 0 && (
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
              <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                Lịch sử Đấu Online gần đây (Bấm để xem thống kê)
              </h4>
              <div className="space-y-2 max-h-[260px] overflow-y-auto pr-1">
                {completedChallenges.slice(0, 15).map((ch) => {
                  const fClub = CLUBS.find((c) => c.id === ch.fromClubId) ?? CLUBS[0];
                  const tClub = CLUBS.find((c) => c.id === ch.toClubId) ?? CLUBS[1];
                  const modeName: Record<OnlineMatchMode, string> = {
                    ranked: 'Đấu Hạng',
                    duel: 'Tỷ Thí',
                    friendly: 'Bạn Bè',
                    tournament: 'Đấu Giải',
                  };
                  return (
                    <button
                      key={ch.id}
                      type="button"
                      onClick={() => openChallengeReport(ch)}
                      className="w-full rounded-xl bg-[#0B1117] border border-white/10 hover:border-emerald-500/40 px-3 py-2.5 flex items-center justify-between gap-2 text-left"
                    >
                      <div className="flex items-center gap-2 min-w-0 text-xs">
                        <span className="px-1.5 py-0.5 rounded bg-slate-800 text-amber-300 text-[10px] font-bold shrink-0">
                          {modeName[ch.mode]}
                        </span>
                        <ClubCrest club={fClub} size={18} />
                        <span className="font-semibold text-white truncate">{ch.fromManagerName}</span>
                        <span className="font-mono-num font-extrabold text-emerald-400 shrink-0">
                          {ch.homeGoals ?? 0} - {ch.awayGoals ?? 0}
                        </span>
                        <ClubCrest club={tClub} size={18} />
                        <span className="font-semibold text-slate-200 truncate">{ch.toManagerName}</span>
                      </div>
                      <span className="text-[10px] text-slate-400 shrink-0">Chi tiết</span>
                    </button>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 3: ONLINE KNOCKOUT TOURNAMENT */}
      {subTab === 'tournament' && (
        <div className="space-y-4">
          {!tourney ? (
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-5 space-y-4">
              <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-amber-400">
                    Giải Đấu Loại Trực Tiếp Liên Server
                  </p>
                  <h3 className="font-display text-2xl font-extrabold text-white mt-0.5">
                    Thi Đấu Giải Online (Cúp 8 &amp; 16 HLV)
                  </h3>
                  <p className="text-xs text-slate-300 mt-1">
                    Quy tụ các người chơi thực trên server và các HLV Bot AI tinh anh. Thắng các vòng để nâng Cúp Online và nhận Gói Siêu Sao 86+!
                  </p>
                </div>
                <div className="rounded-xl bg-[#0B1117] border border-white/10 px-3 py-2 text-right shrink-0">
                  <p className="text-[10px] text-slate-400">Ngân sách CLB</p>
                  <p className="font-mono-num text-sm font-extrabold text-emerald-400">
                    €{career.transferBudget.toFixed(1)}M
                  </p>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {(() => {
                  const fee8 = getOnlineTournamentEntryFeeM(8);
                  const canAfford8 = career.transferBudget >= fee8;
                  return (
                    <div className="rounded-xl bg-[#0B1117] border border-emerald-500/35 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-emerald-400">
                          THỂ THỨC 8 ĐỘI · PHÍ €{fee8}M
                        </span>
                        <Trophy className="w-5 h-5 text-emerald-400" />
                      </div>
                      <h4 className="text-base font-bold text-white">Cúp Chiến Thuật Online 8 HLV</h4>
                      <p className="text-xs text-slate-400">
                        3 vòng đấu: Tứ kết → Bán kết → Chung kết. Lệ phí tham dự: <strong className="text-amber-300">€{fee8}M</strong>. Thưởng vô địch: +€15M, +1 Gói Tinh Anh 82+, +1 Rương Quà Vinh Quang &amp; +30 Mảnh.
                      </p>
                      <button
                        type="button"
                        disabled={Boolean(busyKey) || !canAfford8}
                        onClick={() => handleStartTourney(8)}
                        className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs disabled:opacity-45"
                      >
                        {canAfford8
                          ? `Khởi tạo Giải 8 HLV (-€${fee8}M)`
                          : `Không đủ ngân sách (Cần €${fee8}M)`}
                      </button>
                    </div>
                  );
                })()}

                {(() => {
                  const fee16 = getOnlineTournamentEntryFeeM(16);
                  const canAfford16 = career.transferBudget >= fee16;
                  return (
                    <div className="rounded-xl bg-[#0B1117] border border-amber-400/40 p-4 space-y-3">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-amber-400">
                          THỂ THỨC 16 ĐỘI · PHÍ €{fee16}M
                        </span>
                        <Crown className="w-5 h-5 text-amber-400" />
                      </div>
                      <h4 className="text-base font-bold text-white">Siêu Cúp Online 16 HLV</h4>
                      <p className="text-xs text-slate-400">
                        4 vòng đấu: Vòng 1/8 → Tứ kết → Bán kết → Chung kết. Lệ phí tham dự: <strong className="text-amber-300">€{fee16}M</strong>. Thưởng vô địch: +€25M, +1 Gói Siêu Sao 86+, +1 Rương Quà Vinh Quang &amp; +50 Mảnh.
                      </p>
                      <button
                        type="button"
                        disabled={Boolean(busyKey) || !canAfford16}
                        onClick={() => handleStartTourney(16)}
                        className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-45"
                      >
                        {canAfford16
                          ? `Khởi tạo Siêu Cúp 16 HLV (-€${fee16}M)`
                          : `Không đủ ngân sách (Cần €${fee16}M)`}
                      </button>
                    </div>
                  );
                })()}
              </div>
            </div>
          ) : (
            <div className="space-y-4">
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                <div>
                  <span className="text-[11px] font-bold uppercase text-amber-400">
                    {tourney.status === 'champion'
                      ? 'NHÀ VÔ ĐỊCH GIẢI ONLINE'
                      : tourney.status === 'eliminated'
                        ? 'ĐÃ DỪNG BƯỚC'
                        : `ĐANG THI ĐẤU · VÒNG ${tourney.currentRound}`}
                  </span>
                  <h3 className="font-display text-xl font-extrabold text-white">
                    {tourney.title}
                  </h3>
                </div>

                <div className="flex items-center gap-2">
                  {tourney.status === 'active' ? (
                    <button
                      type="button"
                      disabled={Boolean(busyKey)}
                      onClick={handlePlayTourneyRound}
                      className="h-11 px-4 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-extrabold text-xs inline-flex items-center gap-1.5"
                    >
                      <Play className="w-4 h-4 fill-slate-950" />
                      {busyKey === 'play-tour-round' ? 'Đang mô phỏng...' : 'Đá Vòng Hiện Tại'}
                    </button>
                  ) : (
                    <>
                      <button
                        type="button"
                        disabled={
                          Boolean(busyKey) ||
                          career.transferBudget < getOnlineTournamentEntryFeeM(8)
                        }
                        onClick={() => handleStartTourney(8)}
                        className="h-10 px-3 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-xs disabled:opacity-45"
                      >
                        Giải mới 8 HLV (-€{getOnlineTournamentEntryFeeM(8)}M)
                      </button>
                      <button
                        type="button"
                        disabled={
                          Boolean(busyKey) ||
                          career.transferBudget < getOnlineTournamentEntryFeeM(16)
                        }
                        onClick={() => handleStartTourney(16)}
                        className="h-10 px-3 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs disabled:opacity-45"
                      >
                        Giải mới 16 HLV (-€{getOnlineTournamentEntryFeeM(16)}M)
                      </button>
                    </>
                  )}
                </div>
              </div>

              {/* Bracket Rounds */}
              <div className="space-y-3">
                {tourneyRounds.map(([roundNum, roundMatches]) => (
                  <div
                    key={roundNum}
                    className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-2.5"
                  >
                    <h4 className="text-xs font-bold uppercase tracking-wider text-emerald-400">
                      {roundMatches[0]?.roundLabel ?? `Vòng ${roundNum}`}
                    </h4>
                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                      {roundMatches.map((m) => {
                        const homeP = tourney.participants.find((p) => p.uid === m.homeUid);
                        const awayP = tourney.participants.find((p) => p.uid === m.awayUid);
                        const hClub = CLUBS.find((c) => c.id === homeP?.clubId) ?? CLUBS[0];
                        const aClub = CLUBS.find((c) => c.id === awayP?.clubId) ?? CLUBS[1];
                        const involvesUser = m.homeUid === currentUid || m.awayUid === currentUid;
                        return (
                          <div
                            key={m.id}
                            className={`rounded-xl bg-[#0B1117] border p-3 flex items-center justify-between gap-2 ${
                              involvesUser ? 'border-emerald-500/45' : 'border-white/10'
                            }`}
                          >
                            <div className="flex items-center gap-2 min-w-0 flex-1">
                              <ClubCrest club={hClub} size={22} />
                              <span
                                className={`text-xs truncate ${
                                  m.winnerUid === m.homeUid
                                    ? 'font-extrabold text-emerald-300'
                                    : 'font-semibold text-white'
                                }`}
                              >
                                {homeP?.managerName ?? m.homeUid}
                              </span>
                            </div>

                            <div className="text-center shrink-0 px-2">
                              {m.played ? (
                                <button
                                  type="button"
                                  onClick={() => {
                                    if (!m.report) return;
                                    setDetailMatch({
                                      id: m.id,
                                      matchweek: m.round,
                                      competition: 'friendly',
                                      roundLabel: `${tourney.title} · ${m.roundLabel}`,
                                      homeClubId: hClub.id,
                                      awayClubId: aClub.id,
                                      homeGoals: m.homeGoals ?? 0,
                                      awayGoals: m.awayGoals ?? 0,
                                      penaltiesHome: m.penaltiesHome,
                                      penaltiesAway: m.penaltiesAway,
                                      possessionHome: m.report.possessionHome,
                                      shotsHome: m.report.shotsHome,
                                      shotsAway: m.report.shotsAway,
                                      xgHome: m.report.xgHome,
                                      xgAway: m.report.xgAway,
                                      homeFormation: m.report.homeFormation,
                                      awayFormation: m.report.awayFormation,
                                      homeManagerName: m.report.homeManagerName,
                                      awayManagerName: m.report.awayManagerName,
                                      venue: m.report.venue,
                                      manOfTheMatch: m.report.manOfTheMatch,
                                      playerRatings: m.report.playerRatings,
                                      events: m.report.events,
                                      playedAt: m.report.playedAt ?? new Date().toISOString(),
                                    });
                                  }}
                                  className="px-2 py-1 rounded bg-slate-800 hover:bg-slate-700 font-mono-num text-xs font-extrabold text-white"
                                >
                                  {m.homeGoals} - {m.awayGoals}
                                  {m.penaltiesHome !== undefined
                                    ? ` (${m.penaltiesHome}-${m.penaltiesAway})`
                                    : ''}
                                </button>
                              ) : (
                                <span className="text-[11px] font-bold text-slate-500">VS</span>
                              )}
                            </div>

                            <div className="flex items-center justify-end gap-2 min-w-0 flex-1">
                              <span
                                className={`text-xs truncate text-right ${
                                  m.winnerUid === m.awayUid
                                    ? 'font-extrabold text-emerald-300'
                                    : 'font-semibold text-white'
                                }`}
                              >
                                {awayP?.managerName ?? m.awayUid}
                              </span>
                              <ClubCrest club={aClub} size={22} />
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}

      {/* TAB 4: SERVER LEADERBOARD (REAL PLAYERS + 10 BOTS) */}
      {subTab === 'leaderboard' && (
        <div className="space-y-3">
          <div className="flex flex-col sm:flex-row gap-2">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-3.5" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Tìm HLV thực hoặc HLV Bot trên bảng xếp hạng..."
                className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#121B24] border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>

            <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10 shrink-0">
              {[
                { id: 'all', label: `Tất cả (${leaderboard.length})` },
                { id: 'real', label: `Thực (${realPlayerCount})` },
                { id: 'bot', label: `Bot (${botCount})` },
              ].map((f) => (
                <button
                  key={f.id}
                  type="button"
                  onClick={() => setLbFilter(f.id as typeof lbFilter)}
                  className={`h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap ${
                    lbFilter === f.id ? 'bg-emerald-500 text-slate-950' : 'text-slate-300'
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>

          <div className="space-y-2">
            {filteredLeaderboard.map((player) => {
              const globalRank = leaderboard.findIndex((x) => x.uid === player.uid) + 1;
              const club = CLUBS.find((c) => c.id === player.clubId) ?? CLUBS[0];
              const cfg = getRankConfig(player.rankTier);
              const isMe = player.uid === currentUid;
              return (
                <div
                  key={player.uid}
                  className={`rounded-2xl bg-[#121B24] border p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 ${
                    isMe
                      ? 'border-emerald-500/60 bg-emerald-500/5'
                      : globalRank <= 3
                        ? 'border-amber-400/35'
                        : 'border-white/10'
                  }`}
                >
                  <div className="flex items-center gap-3 min-w-0">
                    <div
                      className={`w-9 h-9 rounded-xl font-mono-num text-sm font-extrabold flex items-center justify-center shrink-0 ${
                        globalRank === 1
                          ? 'bg-amber-400 text-slate-950'
                          : globalRank === 2
                            ? 'bg-slate-300 text-slate-950'
                            : globalRank === 3
                              ? 'bg-amber-700 text-white'
                              : 'bg-[#0B1117] border border-white/10 text-slate-300'
                      }`}
                    >
                      #{globalRank}
                    </div>

                    <ClubCrest club={club} size={34} />

                    <div className="min-w-0">
                      <div className="flex items-center gap-1.5 flex-wrap">
                        <span className="text-sm font-bold text-white truncate">
                          {player.managerName}
                        </span>
                        {isMe && (
                          <span className="px-1.5 py-0.5 rounded bg-emerald-500 text-slate-950 text-[10px] font-extrabold">
                            BẠN
                          </span>
                        )}
                        <span
                          className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                            player.isBot
                              ? 'bg-slate-800 text-slate-300 border border-white/10'
                              : 'bg-sky-500/20 text-sky-300 border border-sky-400/30'
                          }`}
                        >
                          {player.isBot ? 'BOT AI' : 'NGƯỜI CHƠI'}
                        </span>
                      </div>
                      <div className="flex items-center gap-2 text-xs text-slate-400 mt-0.5 flex-wrap">
                        <span className={`font-bold ${cfg.textClass}`}>
                          {formatRankLabel(player.rankTier, player.rankDivision, player.rankStars)}
                        </span>
                        <span>· {club.shortName}</span>
                        <span className="font-mono-num text-white">OVR {player.squadOverall}</span>
                        <span className="font-mono-num">
                          · {player.wins}T-{player.losses}B ({player.eloPoints} ELO)
                        </span>
                      </div>
                    </div>
                  </div>

                  {!isMe && (
                    <div className="flex items-center gap-2 shrink-0">
                      <button
                        type="button"
                        disabled={Boolean(busyKey)}
                        onClick={() => handleInstantMatch(player, 'duel')}
                        className="h-9 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold inline-flex items-center gap-1.5"
                      >
                        <Swords className="w-3.5 h-3.5" />
                        Tỷ thí
                      </button>
                      {renderChallengeButtonForUser(player)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* TAB 5: FRIENDS MODE */}
      {subTab === 'friends' && (
        <div className="space-y-4">
          {/* Incoming Friend Requests */}
          {incomingRequests.length > 0 && (
            <div className="rounded-2xl bg-[#121B24] border border-sky-400/35 p-4 space-y-3">
              <h3 className="text-sm font-bold text-sky-300 flex items-center gap-2">
                <UserPlus className="w-4 h-4" />
                Lời mời Kết bạn đang chờ ({incomingRequests.length})
              </h3>
              <div className="space-y-2">
                {incomingRequests.map((req) => {
                  const club = CLUBS.find((c) => c.id === req.requesterClubId) ?? CLUBS[0];
                  return (
                    <div
                      key={req.id}
                      className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex items-center justify-between gap-3"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ClubCrest club={club} size={28} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {req.requesterName}
                          </p>
                          <p className="text-[11px] text-slate-400">{club.name}</p>
                        </div>
                      </div>
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => onRespondFriendRequest(req, true)}
                          className="h-9 px-3 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
                        >
                          Chấp nhận
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => onRespondFriendRequest(req, false)}
                          className="h-9 px-3 rounded-lg bg-slate-800 text-slate-300 text-xs font-semibold"
                        >
                          Từ chối
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Accepted Friends List */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
            <h3 className="text-sm font-bold text-white flex items-center gap-2">
              <Users className="w-4 h-4 text-emerald-400" />
              Danh sách Bạn Bè ({acceptedFriends.length})
            </h3>

            {acceptedFriends.length === 0 ? (
              <div className="rounded-xl bg-[#0B1117] border border-white/5 p-6 text-center space-y-1.5">
                <p className="text-xs font-semibold text-slate-300">
                  Bạn chưa có người bạn nào trong danh sách.
                </p>
                <p className="text-[11px] text-slate-400">
                  Kết bạn với các HLV ở bên dưới hoặc trong Bảng Xếp Hạng để đá Giao hữu Bạn bè bất cứ lúc nào.
                </p>
              </div>
            ) : (
              <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5">
                {acceptedFriends.map(({ friendship, peer }) => {
                  const club = CLUBS.find((c) => c.id === peer.clubId) ?? CLUBS[0];
                  const cfg = getRankConfig(peer.rankTier);
                  return (
                    <div
                      key={friendship.id}
                      className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ClubCrest club={club} size={30} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">
                            {peer.managerName}{' '}
                            <span className="text-[10px] text-slate-400">
                              {peer.isBot ? '(Bot)' : ''}
                            </span>
                          </p>
                          <p className={`text-[11px] font-semibold ${cfg.textClass} truncate`}>
                            {formatRankLabel(peer.rankTier, peer.rankDivision, peer.rankStars)} · OVR {peer.squadOverall}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() => handleInstantMatch(peer, 'friendly')}
                          className="h-9 px-2.5 rounded-lg bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
                        >
                          Giao hữu
                        </button>
                        <button
                          type="button"
                          disabled={Boolean(busyKey)}
                          onClick={() =>
                            setPendingConfirm({
                              title: `Xóa ${peer.managerName} khỏi danh sách bạn bè?`,
                              description: (
                                <p>
                                  Bạn sẽ hủy kết bạn với HLV <strong className="text-white">{peer.managerName}</strong> và cần gửi lời mời kết bạn lại nếu muốn giao hữu sau này.
                                </p>
                              ),
                              confirmLabel: 'Xóa bạn bè',
                              tone: 'danger',
                              action: async () => {
                                await onRemoveFriendship(friendship.id);
                              },
                            })
                          }
                          title="Xóa bạn"
                          className="h-9 w-9 rounded-lg bg-slate-800 hover:bg-red-500/20 text-slate-400 hover:text-red-300 flex items-center justify-center"
                        >
                          <UserMinus className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {outgoingRequests.length > 0 && (
              <div className="pt-3 border-t border-white/10 space-y-2">
                <p className="text-[11px] font-bold text-slate-400">
                  Lời mời đã gửi ({outgoingRequests.length})
                </p>
                {outgoingRequests.map((req) => (
                  <div
                    key={req.id}
                    className="rounded-lg bg-[#0B1117] border border-white/5 px-3 py-2 flex items-center justify-between text-xs"
                  >
                    <span className="text-slate-300">
                      Đang chờ <strong>{req.recipientName}</strong> chấp nhận
                    </span>
                    <button
                      type="button"
                      onClick={() =>
                        setPendingConfirm({
                          title: `Hủy lời mời kết bạn đã gửi?`,
                          description: (
                            <p>
                              Thu hồi lời mời kết bạn đang gửi tới <strong className="text-white">{req.recipientName}</strong>.
                            </p>
                          ),
                          confirmLabel: 'Hủy lời mời',
                          tone: 'amber',
                          action: async () => {
                            await onRemoveFriendship(req.id);
                          },
                        })
                      }
                      className="text-slate-400 hover:text-red-300 text-[11px] font-semibold"
                    >
                      Hủy lời mời
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Suggested Players to Add */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
            <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
              Gợi ý Kết Bạn (Người chơi thực &amp; HLV Bot)
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-2.5 max-h-[300px] overflow-y-auto pr-1">
              {leaderboard
                .filter((p) => p.uid !== currentUid && !friendshipByOtherUid.has(p.uid))
                .slice(0, 12)
                .map((p) => {
                  const club = CLUBS.find((c) => c.id === p.clubId) ?? CLUBS[0];
                  return (
                    <div
                      key={p.uid}
                      className="rounded-xl bg-[#0B1117] border border-white/10 p-3 flex items-center justify-between gap-2"
                    >
                      <div className="flex items-center gap-2.5 min-w-0">
                        <ClubCrest club={club} size={26} />
                        <div className="min-w-0">
                          <p className="text-xs font-bold text-white truncate">{p.managerName}</p>
                          <p className="text-[11px] text-slate-400 truncate">
                            {club.shortName} · OVR {p.squadOverall} {p.isBot ? '· Bot AI' : '· Thực'}
                          </p>
                        </div>
                      </div>
                      {renderChallengeButtonForUser(p)}
                    </div>
                  );
                })}
            </div>
          </div>
        </div>
      )}

      {/* Rank Ladder Modal */}
      {showRankLadderModal && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 backdrop-blur-sm">
          <div className="w-full sm:max-w-lg max-h-[88vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[#121B24] border border-white/15 p-5 space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-bold uppercase text-amber-400">
                  Hệ thống Thăng Hạng Online
                </p>
                <h3 className="font-display text-xl font-extrabold text-white">
                  9 Bậc Rank &amp; Quà Mốc Lần Đầu
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowRankLadderModal(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl bg-[#0B1117] text-slate-300"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              {RANK_TIERS.map((tier) => {
                const reached = userArena.highestRankIndex >= tier.order;
                const isCurrent = userArena.rankTier === tier.id;
                return (
                  <div
                    key={tier.id}
                    className={`rounded-xl bg-[#0B1117] border p-3 flex items-center justify-between gap-3 ${
                      isCurrent ? tier.borderClass : 'border-white/10'
                    }`}
                  >
                    <div>
                      <p className={`text-sm font-extrabold ${tier.textClass}`}>
                        {tier.name}{' '}
                        {tier.order < 6
                          ? `(${tier.divisions} tiểu bậc · ${tier.starsPerDivision}★/bậc)`
                          : tier.id === 'cao_thu'
                            ? '(0–24★)'
                            : tier.id === 'chien_tuong'
                              ? '(25–49★)'
                              : '(50★+)'}
                      </p>
                      <p className="text-[11px] text-slate-400">
                        {tier.milestoneShards > 0
                          ? `Thưởng lần đầu: +€${tier.milestoneBudgetM}M, +${tier.milestoneShards} Mảnh${
                              tier.milestonePack ? ' + Gói thẻ' : ''
                            }`
                          : 'Bậc khởi đầu mùa giải'}
                      </p>
                    </div>
                    <span
                      className={`px-2 py-1 rounded-lg text-[10px] font-bold shrink-0 ${
                        isCurrent
                          ? 'bg-emerald-500 text-slate-950'
                          : reached
                            ? 'bg-emerald-500/15 text-emerald-300'
                            : 'bg-slate-800 text-slate-400'
                      }`}
                    >
                      {isCurrent ? 'Hiện tại' : reached ? 'Đã đạt' : 'Chưa đạt'}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Match Detail Modal for any Online Match */}
      <MatchDetailModal
        match={detailMatch}
        userClubId={userArena.clubId}
        onClose={() => setDetailMatch(null)}
      />

      <ConfirmActionModal
        open={Boolean(pendingConfirm)}
        title={pendingConfirm?.title ?? ''}
        description={pendingConfirm?.description}
        confirmLabel={pendingConfirm?.confirmLabel}
        tone={pendingConfirm?.tone ?? 'amber'}
        busy={confirmBusy}
        onConfirm={async () => {
          if (!pendingConfirm) return;
          const fn = pendingConfirm.action;
          setConfirmBusy(true);
          try {
            await fn();
            setPendingConfirm(null);
          } finally {
            setConfirmBusy(false);
          }
        }}
        onCancel={() => setPendingConfirm(null)}
      />
    </div>
  );
};
