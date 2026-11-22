import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowLeftRight,
  Bell,
  Compass,
  Home,
  LogOut,
  PackageOpen,
  Play,
  ShieldCheck,
  Sliders,
  Swords,
  Trash2,
  X,
} from 'lucide-react';
import { AuthOnboarding } from './components/AuthOnboarding';
import { ClubCrest } from './components/ClubBadgeAndAvatar';
import { ClubDashboardView } from './components/ClubDashboardView';
import { PlayerDetailSheet } from './components/PlayerDetailSheet';
import { PWAInstallButton } from './components/PWAInstallButton';
import { TacticsView } from './components/TacticsView';
import { CLUBS, getIconShardCost, INITIAL_PLAYERS, REAL_MANAGERS } from './data/footballDatabase';
import {
  applyCupMatchResults,
  applyMarketOverrides,
  applyMatchToStandings,
  buildAutoLineupSlots,
  createInitialCareer,
  createNextSeasonCareer,
  ensureCareerCompetitions,
  finalizeFinishedCompetitionAwards,
  getActiveCareerManager,
  getManagerHireFeeM,
  getManagerImpactSummary,
  getManagerSeveranceM,
  getMatchStaminaDrain,
  getPlayerRecoveryCostM,
  getSquadRecoveryCostM,
  mergeMatchResultsIntoLeaderboard,
  sortStandings,
  toCompactMatchReport,
} from './lib/careerEngine';
import {
  applyPlayerStarUpgrade,
  getCardDismantleShards,
  getQuickDismantlePlan,
  getStarUpgradePlan,
  getTodayPurchaseDateKey,
  getTotalUnopenedPacks,
  hasPurchasedPackToday,
  normalizeInventory,
  openPackFromInventory,
  PACK_CATALOG,
} from './lib/inventoryEngine';
import {
  buildCompactCareerForStorage,
  ClubBackupBundle,
  createClubBackupBundle,
  downloadBackupFile,
} from './lib/backupEngine';
import {
  deleteLocalClubNotification,
  deleteLocalFriendship,
  getLocalArenaProfile,
  getLocalCareer,
  getLocalUserProfile,
  listLocalArenaChallenges,
  listLocalArenaProfiles,
  listLocalClubNotifications,
  listLocalFriendships,
  listLocalMarketOverrides,
  listLocalNews,
  listLocalNotifications,
  LocalUser,
  logoutLocalAccount,
  putLocalActivityLog,
  putLocalArenaChallenge,
  putLocalArenaProfile,
  putLocalCareer,
  putLocalClubNotification,
  putLocalFriendship,
  putLocalMarketOverride,
  putLocalNews,
  putLocalNotification,
  putLocalUserProfile,
  shouldBeInitialAdmin,
  subscribeLocalAuth,
  updateLocalArenaChallenge,
  updateLocalFriendship,
  updateLocalUserProfile,
} from './lib/localDb';
import {
  getPushPermission,
  requestPushPermission,
  triggerDeviceNotification,
} from './lib/notifications';
import {
  applyRankedMatchOutcome,
  buildArenaProfileFromCareer,
  createDefaultBotProfiles,
  createOnlineTournament,
  formatRankLabel,
  getFriendshipDocId,
  getRankScore,
  mergeLeaderboardWithBots,
  playOnlineTournamentRound,
  RankedOutcomeResult,
  simulateOnlineMatch,
} from './lib/onlineArenaEngine';
import {
  ArenaChallenge,
  ArenaProfile,
  CareerSave,
  ClubNotificationCategory,
  ClubNotificationItem,
  FormationId,
  Friendship,
  MarketOverride,
  MatchResultSummary,
  Mentality,
  NewsArticle,
  OnlineMatchMode,
  PackOpenResult,
  PackTier,
  Player,
  PushNotificationItem,
  TacticSettings,
  TrophyItem,
  UserProfile,
} from './types/game';

const MatchdayView = lazy(() =>
  import('./components/MatchdayView').then((m) => ({ default: m.MatchdayView }))
);
const TransfersView = lazy(() =>
  import('./components/TransfersView').then((m) => ({ default: m.TransfersView }))
);
const InventoryView = lazy(() =>
  import('./components/InventoryView').then((m) => ({ default: m.InventoryView }))
);
const OnlineArenaView = lazy(() =>
  import('./components/OnlineArenaView').then((m) => ({ default: m.OnlineArenaView }))
);
const AdminDashboardView = lazy(() =>
  import('./components/AdminDashboardView').then((m) => ({ default: m.AdminDashboardView }))
);

type MainTab = 'home' | 'tactics' | 'match' | 'transfers' | 'inventory' | 'online' | 'admin';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [localUser, setLocalUser] = useState<LocalUser | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [career, setCareer] = useState<CareerSave | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);

  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Local device feeds (IndexedDB)
  const [news, setNews] = useState<NewsArticle[]>([]);
  const [notifications, setNotifications] = useState<PushNotificationItem[]>([]);
  const [clubNotifications, setClubNotifications] = useState<ClubNotificationItem[]>([]);
  const [marketOverrides, setMarketOverrides] = useState<Record<string, MarketOverride>>({});
  const [cloudArenaProfiles, setCloudArenaProfiles] = useState<ArenaProfile[]>([]);
  const [arenaChallenges, setArenaChallenges] = useState<ArenaChallenge[]>([]);
  const [friendships, setFriendships] = useState<Friendship[]>([]);

  // Push Notification & Drawer State
  const [pushPermission, setPushPermission] = useState<NotificationPermission | 'unsupported'>(() =>
    getPushPermission()
  );
  const [showNotifDrawer, setShowNotifDrawer] = useState(false);
  const [notifFilter, setNotifFilter] = useState<'all' | 'club' | 'system'>('all');
  const [liveToast, setLiveToast] = useState<{ title: string; body: string; tag?: string } | null>(
    null
  );
  const [unreadCount, setUnreadCount] = useState(0);
  const tacticsNotifTimerRef = useRef<number | null>(null);
  const tacticsSaveTimerRef = useRef<number | null>(null);
  const arenaSyncTimerRef = useRef<number | null>(null);
  const arenaLoadedRef = useRef(false);
  const lastSyncedArenaSigRef = useRef('');
  const prevCareerRef = useRef<CareerSave | null>(null);

  const isAdmin = useMemo(() => {
    if (!localUser) return false;
    return profile?.role === 'admin' || localUser.username.trim().toLowerCase() === 'admin';
  }, [localUser, profile]);

  const hydratedCareer = useMemo(
    () => (career ? ensureCareerCompetitions(career) : null),
    [career]
  );

  // 1. Local Auth State Listener
  useEffect(() => {
    const unsub = subscribeLocalAuth(async (user) => {
      setLocalUser(user);
      if (!user) {
        setProfile(null);
        setCareer(null);
        prevCareerRef.current = null;
        setClubNotifications([]);
        setNotifications([]);
        setCloudArenaProfiles([]);
        setArenaChallenges([]);
        setFriendships([]);
        setUnreadCount(0);
        arenaLoadedRef.current = false;
        lastSyncedArenaSigRef.current = '';
        setNeedsProfile(false);
        setActiveTab('home');
        setAuthReady(true);
        return;
      }

      try {
        const userProfile = await getLocalUserProfile(user.uid);
        if (!userProfile) {
          setProfile(null);
          setNeedsProfile(true);
        } else {
          setProfile(userProfile);
          setNeedsProfile(false);
        }
      } catch (err) {
        console.error('Lỗi tải hồ sơ cục bộ:', err);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  // 2. Load local career + session feeds from IndexedDB
  useEffect(() => {
    if (!localUser || needsProfile) return;

    const uid = localUser.uid;
    let cancelled = false;

    const loadSessionData = async () => {
      try {
        const [savedCareer, newsList, notifList, clubNotifList, overrideMap] = await Promise.all([
          getLocalCareer(uid),
          listLocalNews(60),
          listLocalNotifications(50),
          listLocalClubNotifications(uid, 60),
          listLocalMarketOverrides(),
        ]);
        if (cancelled) return;

        if (savedCareer) {
          prevCareerRef.current = savedCareer;
          setCareer(savedCareer);
        }
        setNews(newsList);
        setNotifications(notifList);
        setClubNotifications(clubNotifList);
        setMarketOverrides(overrideMap);
      } catch (err) {
        console.error('Lỗi tải dữ liệu phiên chơi cục bộ:', err);
      }
    };

    void loadSessionData();

    return () => {
      cancelled = true;
    };
  }, [localUser, needsProfile]);

  // 3. Load Online Arena profiles/challenges/friends from local storage when viewing Online tab
  useEffect(() => {
    if (activeTab !== 'online' || !localUser || needsProfile) return;

    const uid = localUser.uid;
    let cancelled = false;

    const loadArenaData = async () => {
      try {
        const [profilesList, challengesList, friendshipsList] = await Promise.all([
          listLocalArenaProfiles(),
          listLocalArenaChallenges(uid),
          listLocalFriendships(uid),
        ]);
        if (cancelled) return;
        arenaLoadedRef.current = true;
        setCloudArenaProfiles(profilesList);
        setArenaChallenges(challengesList);
        setFriendships(friendshipsList);
      } catch (err) {
        console.error('Lỗi tải dữ liệu Đấu trường:', err);
      }
    };

    void loadArenaData();

    return () => {
      cancelled = true;
    };
  }, [activeTab, localUser, needsProfile]);

  useEffect(() => {
    return () => {
      if (tacticsNotifTimerRef.current) window.clearTimeout(tacticsNotifTimerRef.current);
      if (tacticsSaveTimerRef.current) window.clearTimeout(tacticsSaveTimerRef.current);
      if (arenaSyncTimerRef.current) window.clearTimeout(arenaSyncTimerRef.current);
    };
  }, []);

  const pushClubNotification = useCallback(
    async (
      category: ClubNotificationCategory,
      title: string,
      body: string,
      targetUid?: string
    ) => {
      const uid = targetUid ?? localUser?.uid;
      if (!uid) return;
      const safeTitle = (title.trim() || 'Cập nhật CLB').slice(0, 140);
      const safeBody = (body.trim() || 'Dữ liệu câu lạc bộ đã được lưu trên thiết bị.').slice(0, 400);
      const normalizedTitle = safeTitle.length < 2 ? `${safeTitle}.` : safeTitle;
      const normalizedBody = safeBody.length < 2 ? `${safeBody}.` : safeBody;
      const notifId = `cn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;

      const localItem: ClubNotificationItem = {
        id: notifId,
        uid,
        category,
        title: normalizedTitle,
        body: normalizedBody,
        createdAt: Date.now(),
      };
      setClubNotifications((prev) => [localItem, ...prev].slice(0, 60));
      setUnreadCount((c) => Math.min(99, c + 1));

      try {
        await putLocalClubNotification(localItem);
      } catch (err) {
        console.error('Lỗi lưu thông báo CLB cục bộ:', err);
      }
    },
    [localUser]
  );

  const handleDeleteClubNotification = useCallback(
    async (notifId: string) => {
      setClubNotifications((prev) => prev.filter((n) => n.id !== notifId));
      if (!localUser) return;
      try {
        await deleteLocalClubNotification(notifId);
      } catch (err) {
        console.error('Lỗi xóa thông báo CLB cục bộ:', err);
      }
    },
    [localUser]
  );

  const handleCompleteOnboarding = useCallback(
    async (data: {
      managerName: string;
      nationality: string;
      clubId: string;
      preferredFormation: FormationId;
    }) => {
      if (!localUser) return;
      const uid = localUser.uid;
      const club = CLUBS.find((c) => c.id === data.clubId) ?? CLUBS[0];
      const adminRole = await shouldBeInitialAdmin(localUser.username);
      const now = Date.now();

      const newProfile: UserProfile = {
        uid,
        managerName: data.managerName,
        nationality: data.nationality,
        clubId: club.id,
        clubName: club.name,
        preferredFormation: data.preferredFormation,
        role: adminRole ? 'admin' : 'manager',
        status: 'active',
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        trophies: 0,
        createdAt: now,
        updatedAt: now,
        lastActiveAt: now,
      };

      const initialCareer = createInitialCareer(uid, club.id, marketOverrides);
      if (initialCareer.tactics.formation !== data.preferredFormation) {
        initialCareer.tactics = {
          ...initialCareer.tactics,
          formation: data.preferredFormation,
          slots: buildAutoLineupSlots(data.preferredFormation, initialCareer.squad),
        };
      }

      try {
        await putLocalUserProfile(newProfile);
        await putLocalCareer({
          ...initialCareer,
          updatedAt: now,
        });
        const logId = `start-${uid}-${now}`;
        await putLocalActivityLog({
          id: logId,
          uid,
          eventType: 'career_started',
          clubId: club.id,
          detail: `${data.managerName} tiếp quản ${club.name}`,
          createdAt: now,
        });
        await pushClubNotification(
          'season',
          `Nhậm chức HLV trưởng ${club.shortName}`,
          `${data.managerName} chính thức tiếp quản ${club.name} ở mùa giải 2026/27 (${data.preferredFormation}).`,
          uid
        );
        prevCareerRef.current = initialCareer;
        setCareer(initialCareer);
        setProfile(newProfile);
        setNeedsProfile(false);
      } catch (err) {
        console.error('Lỗi khởi tạo sự nghiệp cục bộ:', err);
      }
    },
    [localUser, marketOverrides, pushClubNotification]
  );

  const saveCareerCloud = useCallback(
    async (nextCareer: CareerSave) => {
      if (!localUser) return;
      const normalizedCareer: CareerSave = {
        ...nextCareer,
        uid: localUser.uid,
        ...(nextCareer.inventory ? { inventory: normalizeInventory(nextCareer.inventory) } : {}),
      };
      prevCareerRef.current = normalizedCareer;
      setCareer(normalizedCareer);
      try {
        await putLocalCareer(normalizedCareer);
      } catch (err) {
        console.error('Lỗi lưu tiến trình CLB cục bộ:', err);
      }
    },
    [localUser]
  );

  const handleUpdateTactics = useCallback(
    (nextTactics: TacticSettings) => {
      if (!hydratedCareer) return;
      const updatedCareer: CareerSave = { ...hydratedCareer, tactics: nextTactics };
      setCareer(updatedCareer);
      if (tacticsSaveTimerRef.current) window.clearTimeout(tacticsSaveTimerRef.current);
      tacticsSaveTimerRef.current = window.setTimeout(() => {
        void saveCareerCloud(updatedCareer);
      }, 850);
      if (tacticsNotifTimerRef.current) window.clearTimeout(tacticsNotifTimerRef.current);
      tacticsNotifTimerRef.current = window.setTimeout(() => {
        void pushClubNotification(
          'tactics',
          `Cập nhật chiến thuật (${nextTactics.formation})`,
          `Áp dụng sơ đồ ${nextTactics.formation}, tâm lý ${nextTactics.mentality}, pressing mức ${nextTactics.pressingIntensity}/5.`
        );
      }, 1800);
    },
    [hydratedCareer, saveCareerCloud, pushClubNotification]
  );

  const handleQuickMentality = useCallback(
    (mentality: Mentality) => {
      if (!hydratedCareer) return;
      saveCareerCloud({
        ...hydratedCareer,
        tactics: { ...hydratedCareer.tactics, mentality },
      });
      pushClubNotification(
        'tactics',
        'Chỉ đạo chiến thuật trên sân',
        `Điều chỉnh nhanh tâm lý thi đấu sang trạng thái ${mentality}.`
      );
    },
    [hydratedCareer, saveCareerCloud, pushClubNotification]
  );

  const handleCompleteMatchweek = useCallback(
    async (userMatch: MatchResultSummary, allMatches: MatchResultSummary[]) => {
      if (!hydratedCareer || !localUser || !profile) return;
      if (hydratedCareer.recentResults.some((r) => r.id === userMatch.id)) return;

      let nextStandings = [...hydratedCareer.standings];
      const resultMap = new Map<string, MatchResultSummary>();
      for (const m of allMatches) {
        nextStandings = applyMatchToStandings(
          nextStandings,
          m.homeClubId,
          m.awayClubId,
          m.homeGoals,
          m.awayGoals
        );
        resultMap.set(`${m.homeClubId}-${m.awayClubId}`, m);
      }

      const nextFixtures = hydratedCareer.fixtures.map((f) => {
        if (f.matchweek !== hydratedCareer.matchweek) return f;
        const m = resultMap.get(`${f.homeClubId}-${f.awayClubId}`);
        if (!m) return f;
        return {
          ...f,
          played: true,
          homeGoals: m.homeGoals,
          awayGoals: m.awayGoals,
          report: toCompactMatchReport(m, true),
        };
      });

      const isUserHome = userMatch.homeClubId === hydratedCareer.clubId;
      const myGoals = isUserHome ? userMatch.homeGoals : userMatch.awayGoals;
      const oppGoals = isUserHome ? userMatch.awayGoals : userMatch.homeGoals;
      const won = myGoals > oppGoals;
      const drawn = myGoals === oppGoals;

      const activeMgr = getActiveCareerManager(hydratedCareer);
      const mgrImpact = getManagerImpactSummary(activeMgr, hydratedCareer.tactics);
      const starterSet = new Set(
        userMatch.participatedUserPlayerIds && userMatch.participatedUserPlayerIds.length > 0
          ? userMatch.participatedUserPlayerIds
          : hydratedCareer.tactics.slots.map((s) => s.playerId)
      );
      const focusRecoveryBonus = hydratedCareer.trainingFocus === 'Recovery' ? 2 : 0;
      const recoveryBoost =
        (hydratedCareer.trainingIntensity === 'light'
          ? 7
          : hydratedCareer.trainingIntensity === 'balanced'
            ? 3
            : -2) +
        focusRecoveryBonus +
        mgrImpact.recoveryBonus;

      const goalEvents = userMatch.events.filter(
        (e) => e.type === 'goal' && e.teamId === hydratedCareer.clubId
      );

      const ratingByPlayerId = new Map(
        (userMatch.playerRatings ?? [])
          .filter((r) => r.clubId === hydratedCareer.clubId)
          .map((r) => [r.playerId, r.rating])
      );

      const leagueDrain = getMatchStaminaDrain(hydratedCareer.tactics, false);
      const nextSquad = hydratedCareer.squad.map((p) => {
        const played = starterSet.has(p.id);
        const scored = goalEvents.filter((e) =>
          e.playerId ? e.playerId === p.id : e.playerName === p.name
        ).length;
        const assisted = goalEvents.filter((e) =>
          e.assistId ? e.assistId === p.id : e.assistName === p.shortName
        ).length;
        const playerDrain = (p.stars ?? 1) >= 3 ? Math.round(leagueDrain * 0.8) : leagueDrain;
        const nextFit = played
          ? Math.max(60, Math.min(100, p.fitness - playerDrain + recoveryBoost))
          : Math.min(100, p.fitness + 8 + Math.max(0, mgrImpact.recoveryBonus));
        const matchRating = ratingByPlayerId.get(p.id);
        const nextForm =
          matchRating !== undefined
            ? Number(Math.max(1, Math.min(10, p.form * 0.4 + matchRating * 0.6)).toFixed(1))
            : p.form;
        return {
          ...p,
          appearances: p.appearances + (played ? 1 : 0),
          goals: p.goals + scored,
          assists: p.assists + assisted,
          fitness: nextFit,
          form: nextForm,
          morale: Math.max(40, Math.min(100, p.morale + (won ? 4 : drawn ? 1 : -3))),
        };
      });

      const leagueFinishedNow = nextFixtures.every((f) => f.played);
      const sortedEnd = sortStandings(nextStandings);
      let nextCabinet = [...(hydratedCareer.trophyCabinet ?? [])];
      let awardedLeagueTrophy = 0;

      if (leagueFinishedNow && sortedEnd[0]?.clubId === hydratedCareer.clubId) {
        const trophyId = `trophy-league-${hydratedCareer.season.replace('/', '-')}`;
        if (!nextCabinet.some((t) => t.id === trophyId)) {
          const leagueTrophy: TrophyItem = {
            id: trophyId,
            title: `Vô địch Super League ${hydratedCareer.season}`,
            competition: 'league',
            season: hydratedCareer.season,
            clubId: hydratedCareer.clubId,
            awardedAt: new Date().toISOString(),
          };
          nextCabinet = [leagueTrophy, ...nextCabinet].slice(0, 120);
          awardedLeagueTrophy = 1;
        }
      }

      const prevComps = hydratedCareer.competitions;
      const nextComps = prevComps
        ? {
            ...prevComps,
            leaderboards: {
              ...(prevComps.leaderboards ?? {}),
              league: mergeMatchResultsIntoLeaderboard(
                prevComps.leaderboards?.league,
                allMatches,
                nextSquad,
                applyMarketOverrides(INITIAL_PLAYERS, marketOverrides)
              ),
            },
          }
        : undefined;

      const inv = normalizeInventory(hydratedCareer.inventory);
      const nextPacks = { ...inv.packs };
      let shardsEarned = won ? 5 : drawn ? 2 : 1;
      if (won) {
        if (myGoals - oppGoals >= 3) {
          nextPacks.elite_pack = (nextPacks.elite_pack ?? 0) + 1;
        } else {
          nextPacks.scout_pack = (nextPacks.scout_pack ?? 0) + 1;
        }
      }
      if (awardedLeagueTrophy > 0) {
        nextPacks.legend_pack = (nextPacks.legend_pack ?? 0) + 1;
        nextPacks.trophy_gift_box = (nextPacks.trophy_gift_box ?? 0) + 1;
        shardsEarned += 25;
      }
      const nextInv = normalizeInventory({
        ...inv,
        packs: nextPacks,
        universalShards: inv.universalShards + shardsEarned,
      });

      const preAwardCareer: CareerSave = {
        ...hydratedCareer,
        matchweek: hydratedCareer.matchweek + 1,
        transferBudget: Number(
          (hydratedCareer.transferBudget + (won ? 3.5 : drawn ? 1.8 : 1.0)).toFixed(1)
        ),
        boardConfidence: Math.max(
          25,
          Math.min(100, hydratedCareer.boardConfidence + (won ? 3 : drawn ? 0 : -4))
        ),
        squad: nextSquad,
        standings: nextStandings,
        fixtures: nextFixtures,
        competitions: nextComps,
        trophyCabinet: nextCabinet,
        inventory: nextInv,
        recentResults: [
          userMatch,
          ...hydratedCareer.recentResults.filter((r) => r.id !== userMatch.id),
        ].slice(0, 50),
      };

      const awardResult = finalizeFinishedCompetitionAwards(preAwardCareer, 'league');
      const nextCareer = awardResult.nextCareer;

      await saveCareerCloud(nextCareer);

      try {
        const nextProfileStats = {
          matchesPlayed: (profile.matchesPlayed || 0) + 1,
          wins: (profile.wins || 0) + (won ? 1 : 0),
          draws: (profile.draws || 0) + (drawn ? 1 : 0),
          losses: (profile.losses || 0) + (!won && !drawn ? 1 : 0),
          trophies: (profile.trophies || 0) + awardedLeagueTrophy + awardResult.newTrophiesCount,
        };
        setProfile((prev) => (prev ? { ...prev, ...nextProfileStats } : prev));
        await updateLocalUserProfile(localUser.uid, {
          ...nextProfileStats,
          lastActiveAt: Date.now(),
        });

        const hName = CLUBS.find((c) => c.id === userMatch.homeClubId)?.shortName ?? userMatch.homeClubId;
        const aName = CLUBS.find((c) => c.id === userMatch.awayClubId)?.shortName ?? userMatch.awayClubId;
        const prizeBonus = won ? 3.5 : drawn ? 1.8 : 1.0;
        await pushClubNotification(
          'match',
          `VĐQG Vòng ${hydratedCareer.matchweek}: ${hName} ${userMatch.homeGoals}-${userMatch.awayGoals} ${aName}`,
          `${won ? 'Chiến thắng!' : drawn ? 'Chia điểm!' : 'Thất bại.'} Thưởng trận đấu +€${prizeBonus}M vào ngân sách CLB.`
        );
        if (awardedLeagueTrophy > 0) {
          const myClubName = CLUBS.find((c) => c.id === hydratedCareer.clubId)?.name ?? hydratedCareer.clubId;
          await pushClubNotification(
            'trophy',
            `Vô địch Super League ${hydratedCareer.season}!`,
            `Chúc mừng ${myClubName} chính thức nâng cúp vô địch quốc gia mùa giải ${hydratedCareer.season}!`
          );
        }
        for (const aw of awardResult.newlyAwarded) {
          await pushClubNotification(
            'trophy',
            `${aw.awardTitle} ${aw.competitionTitle}: ${aw.playerName}`,
            aw.isUserPlayer
              ? `Cầu thủ của bạn đoạt danh hiệu ${aw.awardTitle} (${aw.awardType === 'mvp' ? `${aw.avgRating.toFixed(2)}★` : `${aw.goals} bàn`})! CLB nhận thưởng tiền mặt, Mảnh Ngôi Sao & Gói thẻ.`
              : `${aw.playerName} (${CLUBS.find((c) => c.id === aw.clubId)?.shortName ?? aw.clubId}) giành danh hiệu ${aw.awardTitle} mùa ${aw.season}.`
          );
        }
      } catch (err) {
        console.error('Lỗi cập nhật thống kê vòng đấu:', err);
      }
    },
    [hydratedCareer, localUser, profile, marketOverrides, saveCareerCloud, pushClubNotification]
  );

  const handleCompleteCupMatch = useCallback(
    async (
      competition: 'champions-cup' | 'national-cup' | 'super-cup',
      userMatch: MatchResultSummary | null,
      roundEntries: { matchId: string; result: MatchResultSummary }[]
    ) => {
      if (!hydratedCareer || !hydratedCareer.competitions || !localUser || !profile) return;
      if (roundEntries.length === 0) return;

      const resultsMap = new Map(roundEntries.map((e) => [e.matchId, e.result]));
      const prevComps = hydratedCareer.competitions;
      const nextComps = applyCupMatchResults(prevComps, competition, resultsMap);

      let nextSquad = hydratedCareer.squad;
      let budgetBonus = 0;
      let wonMatch = false;
      let drawnMatch = false;

      if (userMatch) {
        const isUserHome = userMatch.homeClubId === hydratedCareer.clubId;
        const myGoals = isUserHome ? userMatch.homeGoals : userMatch.awayGoals;
        const oppGoals = isUserHome ? userMatch.awayGoals : userMatch.homeGoals;
        wonMatch = userMatch.winnerId
          ? userMatch.winnerId === hydratedCareer.clubId
          : myGoals > oppGoals;
        drawnMatch = !userMatch.winnerId && myGoals === oppGoals;
        budgetBonus += wonMatch ? 2.5 : drawnMatch ? 1.2 : 0.6;

        const activeMgr = getActiveCareerManager(hydratedCareer);
        const mgrImpact = getManagerImpactSummary(activeMgr, hydratedCareer.tactics);
        const focusRecoveryBonus = hydratedCareer.trainingFocus === 'Recovery' ? 2 : 0;
        const cupRecoveryBoost =
          (hydratedCareer.trainingIntensity === 'light'
            ? 5
            : hydratedCareer.trainingIntensity === 'balanced'
              ? 2
              : -2) +
          focusRecoveryBonus +
          mgrImpact.recoveryBonus;
        const cupDrain = getMatchStaminaDrain(hydratedCareer.tactics, true);

        const starterSet = new Set(
          userMatch.participatedUserPlayerIds && userMatch.participatedUserPlayerIds.length > 0
            ? userMatch.participatedUserPlayerIds
            : hydratedCareer.tactics.slots.map((s) => s.playerId)
        );
        const goalEvents = userMatch.events.filter(
          (e) => e.type === 'goal' && e.teamId === hydratedCareer.clubId
        );
        const ratingByPlayerId = new Map(
          (userMatch.playerRatings ?? [])
            .filter((r) => r.clubId === hydratedCareer.clubId)
            .map((r) => [r.playerId, r.rating])
        );
        nextSquad = hydratedCareer.squad.map((p) => {
          const played = starterSet.has(p.id);
          const scored = goalEvents.filter((e) =>
            e.playerId ? e.playerId === p.id : e.playerName === p.name
          ).length;
          const assisted = goalEvents.filter((e) =>
            e.assistId ? e.assistId === p.id : e.assistName === p.shortName
          ).length;
          const matchRating = ratingByPlayerId.get(p.id);
          const nextForm =
            matchRating !== undefined
              ? Number(Math.max(1, Math.min(10, p.form * 0.4 + matchRating * 0.6)).toFixed(1))
              : p.form;
          const playerCupDrain = (p.stars ?? 1) >= 3 ? Math.round(cupDrain * 0.8) : cupDrain;
          return {
            ...p,
            appearances: p.appearances + (played ? 1 : 0),
            goals: p.goals + scored,
            assists: p.assists + assisted,
            fitness: played
              ? Math.max(62, Math.min(100, p.fitness - playerCupDrain + cupRecoveryBoost))
              : Math.min(100, p.fitness + 6 + Math.max(0, mgrImpact.recoveryBonus)),
            form: nextForm,
            morale: Math.max(45, Math.min(100, p.morale + (wonMatch ? 4 : drawnMatch ? 1 : -2))),
          };
        });
      }

      let nextCabinet = [...(hydratedCareer.trophyCabinet ?? [])];
      let trophiesAdded = 0;

      const checkAndAwardTrophy = (
        id: string,
        title: string,
        compId: 'champions-cup' | 'national-cup' | 'super-cup',
        prize: number
      ) => {
        if (!nextCabinet.some((t) => t.id === id)) {
          const item: TrophyItem = {
            id,
            title,
            competition: compId,
            season: hydratedCareer.season,
            clubId: hydratedCareer.clubId,
            awardedAt: new Date().toISOString(),
          };
          nextCabinet = [item, ...nextCabinet].slice(0, 120);
          trophiesAdded += 1;
          budgetBonus += prize;
        }
      };

      if (
        competition === 'champions-cup' &&
        !prevComps.championsCup.championClubId &&
        nextComps.championsCup.championClubId === hydratedCareer.clubId
      ) {
        checkAndAwardTrophy(
          `trophy-cc-${hydratedCareer.season.replace('/', '-')}`,
          `Vô địch Champions Cup ${hydratedCareer.season}`,
          'champions-cup',
          18
        );
      } else if (
        competition === 'national-cup' &&
        !prevComps.nationalCup.championClubId &&
        nextComps.nationalCup.championClubId === hydratedCareer.clubId
      ) {
        checkAndAwardTrophy(
          `trophy-nc-${hydratedCareer.season.replace('/', '-')}`,
          `Vô địch Cúp Quốc Gia ${hydratedCareer.season}`,
          'national-cup',
          10
        );
      } else if (
        competition === 'super-cup' &&
        !prevComps.superCup.championClubId &&
        nextComps.superCup.championClubId === hydratedCareer.clubId
      ) {
        checkAndAwardTrophy(
          `trophy-sc-${hydratedCareer.season.replace('/', '-')}`,
          `Siêu Cúp ${hydratedCareer.season}`,
          'super-cup',
          6
        );
      }

      const nextCompsWithStats = {
        ...nextComps,
        leaderboards: {
          ...(nextComps.leaderboards ?? {}),
          [competition]: mergeMatchResultsIntoLeaderboard(
            nextComps.leaderboards?.[competition],
            roundEntries.map((e) => e.result),
            nextSquad,
            applyMarketOverrides(INITIAL_PLAYERS, marketOverrides)
          ),
        },
      };

      let nextInv = normalizeInventory(hydratedCareer.inventory);
      if (userMatch || trophiesAdded > 0) {
        const nextPacks = { ...nextInv.packs };
        let shardsEarned = 0;
        if (userMatch) {
          const isUserHome = userMatch.homeClubId === hydratedCareer.clubId;
          const myGoals = isUserHome ? userMatch.homeGoals : userMatch.awayGoals;
          const oppGoals = isUserHome ? userMatch.awayGoals : userMatch.homeGoals;
          const isKnockout =
            competition === 'national-cup' ||
            competition === 'super-cup' ||
            (userMatch.roundLabel?.toLowerCase().includes('chung kết') ?? false) ||
            (userMatch.roundLabel?.toLowerCase().includes('bán kết') ?? false) ||
            (userMatch.roundLabel?.toLowerCase().includes('tứ kết') ?? false);
          if (wonMatch) {
            shardsEarned += 6;
            if (isKnockout || myGoals - oppGoals >= 3) {
              nextPacks.elite_pack = (nextPacks.elite_pack ?? 0) + 1;
            } else {
              nextPacks.scout_pack = (nextPacks.scout_pack ?? 0) + 1;
            }
          } else if (drawnMatch) {
            shardsEarned += 3;
          } else {
            shardsEarned += 1;
          }
        }
        if (trophiesAdded > 0) {
          nextPacks.legend_pack = (nextPacks.legend_pack ?? 0) + trophiesAdded;
          if (competition === 'champions-cup') {
            nextPacks.icon_pack = (nextPacks.icon_pack ?? 0) + 1;
          }
          nextPacks.trophy_gift_box = (nextPacks.trophy_gift_box ?? 0) + trophiesAdded;
          shardsEarned += 25 * trophiesAdded;
        }
        nextInv = normalizeInventory({
          ...nextInv,
          packs: nextPacks,
          universalShards: nextInv.universalShards + shardsEarned,
        });
      }

      const preAwardCareer: CareerSave = {
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget + budgetBonus).toFixed(1)),
        boardConfidence: Math.min(100, hydratedCareer.boardConfidence + (trophiesAdded > 0 ? 6 : 0)),
        squad: nextSquad,
        competitions: nextCompsWithStats,
        trophyCabinet: nextCabinet,
        inventory: nextInv,
        recentResults: userMatch
          ? [
              userMatch,
              ...hydratedCareer.recentResults.filter((r) => r.id !== userMatch.id),
            ].slice(0, 50)
          : hydratedCareer.recentResults,
      };

      const awardResult = finalizeFinishedCompetitionAwards(preAwardCareer, competition);
      const nextCareer = awardResult.nextCareer;

      await saveCareerCloud(nextCareer);

      try {
        if (userMatch || trophiesAdded > 0 || awardResult.newTrophiesCount > 0) {
          const nextProfileStats = {
            matchesPlayed: (profile.matchesPlayed || 0) + (userMatch ? 1 : 0),
            wins: (profile.wins || 0) + (userMatch && wonMatch ? 1 : 0),
            draws: (profile.draws || 0) + (userMatch && drawnMatch ? 1 : 0),
            losses: (profile.losses || 0) + (userMatch && !wonMatch && !drawnMatch ? 1 : 0),
            trophies: (profile.trophies || 0) + trophiesAdded + awardResult.newTrophiesCount,
          };
          setProfile((prev) => (prev ? { ...prev, ...nextProfileStats } : prev));
          await updateLocalUserProfile(localUser.uid, {
            ...nextProfileStats,
            lastActiveAt: Date.now(),
          });
        }

        if (userMatch) {
          const compLabel =
            competition === 'champions-cup'
              ? 'Cúp C1'
              : competition === 'national-cup'
                ? 'Cúp QG'
                : 'Siêu Cúp';

          const hName = CLUBS.find((c) => c.id === userMatch.homeClubId)?.shortName ?? userMatch.homeClubId;
          const aName = CLUBS.find((c) => c.id === userMatch.awayClubId)?.shortName ?? userMatch.awayClubId;
          const penLabel =
            userMatch.penaltiesHome !== undefined
              ? ` (Pen ${userMatch.penaltiesHome}-${userMatch.penaltiesAway})`
              : '';
          await pushClubNotification(
            'match',
            `${compLabel}: ${hName} ${userMatch.homeGoals}-${userMatch.awayGoals} ${aName}${penLabel}`,
            `${userMatch.roundLabel || compLabel} · Ngân sách CLB cộng thêm +€${budgetBonus.toFixed(1)}M.`
          );
          if (trophiesAdded > 0) {
            const myClubName = CLUBS.find((c) => c.id === hydratedCareer.clubId)?.name ?? hydratedCareer.clubId;
            await pushClubNotification(
              'trophy',
              `Vô địch ${compLabel} ${hydratedCareer.season}!`,
              `${myClubName} đăng quang ${compLabel} và nhận thưởng lớn vào ngân sách.`
            );
          }
        } else {
          const compLabel =
            competition === 'champions-cup'
              ? 'Cúp C1'
              : competition === 'national-cup'
                ? 'Cúp QG'
                : 'Siêu Cúp';
          await pushClubNotification(
            'match',
            `Cập nhật lịch đấu ${compLabel}`,
            `Đã mô phỏng xong các trận thuộc vòng hiện tại của ${compLabel}.`
          );
        }

        for (const aw of awardResult.newlyAwarded) {
          await pushClubNotification(
            'trophy',
            `${aw.awardTitle} ${aw.competitionTitle}: ${aw.playerName}`,
            aw.isUserPlayer
              ? `Cầu thủ của bạn đoạt danh hiệu ${aw.awardTitle} (${aw.awardType === 'mvp' ? `${aw.avgRating.toFixed(2)}★` : `${aw.goals} bàn`})! CLB nhận thưởng tiền mặt, Mảnh Ngôi Sao & Gói thẻ.`
              : `${aw.playerName} (${CLUBS.find((c) => c.id === aw.clubId)?.shortName ?? aw.clubId}) giành danh hiệu ${aw.awardTitle}.`
          );
        }
      } catch (err) {
        console.error('Lỗi cập nhật thống kê cúp:', err);
      }
    },
    [hydratedCareer, localUser, profile, marketOverrides, saveCareerCloud, pushClubNotification]
  );

  const handleCompleteFriendly = useCallback(
    async (userMatch: MatchResultSummary) => {
      if (!hydratedCareer || !localUser || !profile) return;
      if (hydratedCareer.recentResults.some((r) => r.id === userMatch.id)) return;
      const isUserHome = userMatch.homeClubId === hydratedCareer.clubId;
      const myGoals = isUserHome ? userMatch.homeGoals : userMatch.awayGoals;
      const oppGoals = isUserHome ? userMatch.awayGoals : userMatch.homeGoals;
      const won = myGoals > oppGoals;
      const drawn = myGoals === oppGoals;

      const starterSet = new Set(
        userMatch.participatedUserPlayerIds && userMatch.participatedUserPlayerIds.length > 0
          ? userMatch.participatedUserPlayerIds
          : hydratedCareer.tactics.slots.map((s) => s.playerId)
      );
      const ratingByPlayerId = new Map(
        (userMatch.playerRatings ?? [])
          .filter((r) => r.clubId === hydratedCareer.clubId)
          .map((r) => [r.playerId, r.rating])
      );
      const nextSquad = hydratedCareer.squad.map((p) => {
        const matchRating = ratingByPlayerId.get(p.id);
        const nextForm =
          matchRating !== undefined
            ? Number(Math.max(1, Math.min(10, p.form * 0.4 + matchRating * 0.6)).toFixed(1))
            : p.form;
        return {
          ...p,
          fitness: starterSet.has(p.id) ? Math.max(70, p.fitness - 4) : Math.min(100, p.fitness + 5),
          form: nextForm,
          morale: Math.min(100, p.morale + (won ? 4 : 2)),
        };
      });

      const prevComps = hydratedCareer.competitions;
      const nextComps = prevComps
        ? {
            ...prevComps,
            leaderboards: {
              ...(prevComps.leaderboards ?? {}),
              friendly: mergeMatchResultsIntoLeaderboard(
                prevComps.leaderboards?.friendly,
                [userMatch],
                nextSquad,
                applyMarketOverrides(INITIAL_PLAYERS, marketOverrides)
              ),
            },
          }
        : undefined;

      const inv = normalizeInventory(hydratedCareer.inventory);
      const nextInv = normalizeInventory({
        ...inv,
        universalShards: inv.universalShards + (won ? 3 : 1),
      });

      const nextCareer: CareerSave = {
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget + (won ? 3.0 : 2.0)).toFixed(1)),
        squad: nextSquad,
        competitions: nextComps,
        inventory: nextInv,
        recentResults: [
          userMatch,
          ...hydratedCareer.recentResults.filter((r) => r.id !== userMatch.id),
        ].slice(0, 50),
      };

      await saveCareerCloud(nextCareer);

      try {
        const nextProfileStats = {
          matchesPlayed: (profile.matchesPlayed || 0) + 1,
          wins: (profile.wins || 0) + (won ? 1 : 0),
          draws: (profile.draws || 0) + (drawn ? 1 : 0),
          losses: (profile.losses || 0) + (!won && !drawn ? 1 : 0),
        };
        setProfile((prev) => (prev ? { ...prev, ...nextProfileStats } : prev));
        await updateLocalUserProfile(localUser.uid, {
          ...nextProfileStats,
          lastActiveAt: Date.now(),
        });

        const hName = CLUBS.find((c) => c.id === userMatch.homeClubId)?.shortName ?? userMatch.homeClubId;
        const aName = CLUBS.find((c) => c.id === userMatch.awayClubId)?.shortName ?? userMatch.awayClubId;
        await pushClubNotification(
          'match',
          `Giao hữu: ${hName} ${userMatch.homeGoals}-${userMatch.awayGoals} ${aName}`,
          `Hoàn tất trận giao hữu quốc tế · Doanh thu +€${won ? '3.0' : '2.0'}M và tăng tinh thần đội bóng.`
        );
      } catch (err) {
        console.error('Lỗi cập nhật giao hữu:', err);
      }
    },
    [hydratedCareer, localUser, profile, marketOverrides, saveCareerCloud, pushClubNotification]
  );

  const handleStartNextSeason = useCallback(async () => {
    if (!hydratedCareer || !localUser || !profile) return;
    const { nextCareer, summary, prizeM, newTrophiesCount } = createNextSeasonCareer(hydratedCareer);
    await saveCareerCloud(nextCareer);

    try {
      const nextTrophies = (profile.trophies || 0) + newTrophiesCount;
      setProfile((prev) => (prev ? { ...prev, trophies: nextTrophies } : prev));
      await updateLocalUserProfile(localUser.uid, {
        trophies: nextTrophies,
        lastActiveAt: Date.now(),
      });

      const logId = `season-${localUser.uid}-${Date.now()}`;
      await putLocalActivityLog({
        id: logId,
        uid: localUser.uid,
        eventType: 'season_completed',
        clubId: hydratedCareer.clubId,
        detail: `Kết thúc mùa ${summary.season} hạng #${summary.leagueRank}, sang mùa ${nextCareer.season}`,
        valueM: prizeM,
        createdAt: Date.now(),
      });

      const objDone = summary.completedObjectivesCount ?? 0;
      const objTotal = summary.totalObjectivesCount ?? 0;
      const totsMine = summary.teamOfTheSeason?.filter((t) => t.isUserPlayer).length ?? 0;
      await pushClubNotification(
        'season',
        `Khởi tranh mùa giải mới ${nextCareer.season}`,
        `Tổng kết mùa ${summary.season} ở hạng #${summary.leagueRank}. Đạt ${objDone}/${objTotal} mục tiêu BLĐ${totsMine > 0 ? `, có ${totsMine} cầu thủ lọt ĐHTB` : ''}. Nhận tổng thưởng +€${prizeM}M và sang mùa 20 CLB.`
      );
    } catch (err) {
      console.error('Lỗi chuyển mùa giải mới:', err);
    }
  }, [hydratedCareer, localUser, profile, saveCareerCloud, pushClubNotification]);

  const handleMakeOffer = useCallback(
    async (
      player: Player,
      bidM: number,
      wageK: number
    ): Promise<{ ok: boolean; message: string }> => {
      if (!hydratedCareer || !localUser) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu câu lạc bộ.' };
      }
      if (hydratedCareer.squad.length >= 45) {
        return { ok: false, message: 'Đội hình đã đạt giới hạn tối đa 45 cầu thủ.' };
      }
      if (bidM > hydratedCareer.transferBudget) {
        return { ok: false, message: 'Ngân sách chuyển nhượng không đủ.' };
      }

      const iconShardCost = getIconShardCost(player);
      const inv = normalizeInventory(hydratedCareer.inventory);
      if (iconShardCost > 0 && inv.universalShards < iconShardCost) {
        return {
          ok: false,
          message: `Triệu hồi Huyền Thoại ${player.name} cần ${iconShardCost} Mảnh Ngôi Sao (hiện có ${inv.universalShards} Mảnh).`,
        };
      }

      const threshold =
        player.transferStatus === 'listed'
          ? player.marketValueM * 0.85
          : player.transferStatus === 'untouchable'
            ? player.marketValueM * 1.4
            : player.marketValueM * 1.05;

      if (bidM < threshold || wageK < player.wageK * 0.95) {
        return {
          ok: false,
          message: `CLB chủ quản từ chối €${bidM}M. Hãy đề nghị ít nhất €${Math.ceil(threshold)}M và lương €${player.wageK}K/tuần.`,
        };
      }

      const signedPlayer: Player = {
        ...player,
        clubId: hydratedCareer.clubId,
        baseRating: player.baseRating ?? player.rating,
        wageK,
        stars: 1,
        fitness: 95,
        appearances: 0,
        goals: 0,
        assists: 0,
        transferStatus: 'available',
        morale: 92,
      };

      const nextInv =
        iconShardCost > 0
          ? normalizeInventory({
              ...inv,
              universalShards: inv.universalShards - iconShardCost,
            })
          : hydratedCareer.inventory;

      const nextCareer: CareerSave = {
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget - bidM).toFixed(1)),
        squad: [...hydratedCareer.squad, signedPlayer],
        ...(nextInv ? { inventory: nextInv } : {}),
        transferHistory: [
          {
            id: `tr-${Date.now()}`,
            playerId: player.id,
            playerName: player.name,
            fromClubId: player.clubId,
            toClubId: hydratedCareer.clubId,
            feeM: bidM,
            wageK,
            type: 'buy' as const,
            matchweek: hydratedCareer.matchweek,
            date: new Date().toISOString(),
          },
          ...(hydratedCareer.transferHistory ?? []),
        ].slice(0, 50),
      };

      await saveCareerCloud(nextCareer);

      try {
        const logId = `tr-${localUser.uid}-${Date.now()}`;
        await putLocalActivityLog({
          id: logId,
          uid: localUser.uid,
          eventType: 'transfer_completed',
          clubId: hydratedCareer.clubId,
          detail: `Chiêu mộ ${player.name}`,
          valueM: bidM,
          createdAt: Date.now(),
        });

        await pushClubNotification(
          'transfer',
          `Tân binh gia nhập: ${player.name}`,
          `Chiêu mộ thành công ${player.name} (${player.position}, ${player.rating} OVR) với phí €${bidM}M, lương €${wageK}K/tuần.`
        );
      } catch (err) {
        console.error('Lỗi ghi nhật ký chuyển nhượng:', err);
      }

      return {
        ok: true,
        message: `Chúc mừng! ${player.name} đã chính thức gia nhập đội bóng với mức phí €${bidM}M.`,
      };
    },
    [hydratedCareer, localUser, saveCareerCloud, pushClubNotification]
  );

  const handleToggleTransferList = useCallback(
    (playerId: string) => {
      if (!hydratedCareer) return;
      const target = hydratedCareer.squad.find((p) => p.id === playerId);
      const nextStatus = target?.transferStatus === 'listed' ? 'available' : 'listed';
      const nextSquad = hydratedCareer.squad.map((p) =>
        p.id === playerId
          ? {
              ...p,
              transferStatus:
                p.transferStatus === 'listed' ? ('available' as const) : ('listed' as const),
            }
          : p
      );
      saveCareerCloud({ ...hydratedCareer, squad: nextSquad });
      setSelectedPlayer((prev) =>
        prev && prev.id === playerId
          ? {
              ...prev,
              transferStatus:
                prev.transferStatus === 'listed' ? 'available' : 'listed',
            }
          : prev
      );
      if (target) {
        pushClubNotification(
          'transfer',
          `Sàn chuyển nhượng: ${target.name}`,
          nextStatus === 'listed'
            ? `Đã đưa ${target.name} vào danh sách rao bán (€${target.marketValueM}M).`
            : `Đã gỡ ${target.name} khỏi danh sách rao bán.`
        );
      }
    },
    [hydratedCareer, saveCareerCloud, pushClubNotification]
  );

  const handleRenewContract = useCallback(
    (playerId: string) => {
      if (!hydratedCareer) return;
      const target = hydratedCareer.squad.find((p) => p.id === playerId);
      const nextSquad = hydratedCareer.squad.map((p) =>
        p.id === playerId
          ? {
              ...p,
              contractUntil: p.contractUntil + 2,
              wageK: Math.round(p.wageK * 1.1),
              morale: Math.min(100, p.morale + 8),
            }
          : p
      );
      saveCareerCloud({ ...hydratedCareer, squad: nextSquad });
      if (target) {
        pushClubNotification(
          'contract',
          `Gia hạn hợp đồng: ${target.name}`,
          `Gia hạn thêm 2 năm đến ${target.contractUntil + 2} (Lương mới €${Math.round(target.wageK * 1.1)}K/tuần).`
        );
      }
    },
    [hydratedCareer, saveCareerCloud, pushClubNotification]
  );

  const handleSellPlayer = useCallback(
    (playerId: string) => {
      if (!hydratedCareer || hydratedCareer.squad.length <= 21) return;
      const target = hydratedCareer.squad.find((p) => p.id === playerId);
      if (!target) return;
      const feeM = Math.round(target.marketValueM * 0.92);
      const nextSquad = hydratedCareer.squad.filter((p) => p.id !== playerId);
      const occupiedIds = new Set(
        hydratedCareer.tactics.slots
          .filter((s) => s.playerId !== playerId)
          .map((s) => s.playerId)
      );
      const benchPool = nextSquad
        .filter((p) => !occupiedIds.has(p.id))
        .sort((a, b) => b.rating - a.rating);
      const nextSlots = hydratedCareer.tactics.slots.map((s) => {
        if (s.playerId !== playerId) return s;
        const posMatch = benchPool.find((p) => p.position === s.label) ?? benchPool[0] ?? nextSquad[0];
        if (posMatch) occupiedIds.add(posMatch.id);
        return { ...s, playerId: posMatch?.id ?? '' };
      });
      const xiIds = new Set(nextSlots.map((s) => s.playerId));
      const xiSorted = nextSlots
        .map((s) => nextSquad.find((p) => p.id === s.playerId))
        .filter((p): p is Player => Boolean(p))
        .sort((a, b) => {
          if (a.position === 'GK' && b.position !== 'GK') return 1;
          if (b.position === 'GK' && a.position !== 'GK') return -1;
          return b.attributes.sho - a.attributes.sho;
        });
      const nextPenId =
        hydratedCareer.tactics.designatedPenaltyTakerId &&
        hydratedCareer.tactics.designatedPenaltyTakerId !== playerId &&
        xiIds.has(hydratedCareer.tactics.designatedPenaltyTakerId)
          ? hydratedCareer.tactics.designatedPenaltyTakerId
          : xiSorted[0]?.id;
      const cleanedPenList: string[] = [];
      const seenPen = new Set<string>();
      for (const id of hydratedCareer.tactics.penaltyTakerIds ?? []) {
        if (id && id !== playerId && xiIds.has(id) && !seenPen.has(id)) {
          cleanedPenList.push(id);
          seenPen.add(id);
        }
      }
      for (const p of xiSorted) {
        if (cleanedPenList.length >= 10) break;
        if (!seenPen.has(p.id)) {
          cleanedPenList.push(p.id);
          seenPen.add(p.id);
        }
      }

      saveCareerCloud({
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget + feeM).toFixed(1)),
        squad: nextSquad,
        tactics: {
          ...hydratedCareer.tactics,
          slots: nextSlots,
          designatedPenaltyTakerId: nextPenId,
          penaltyTakerIds: cleanedPenList,
        },
      });
      pushClubNotification(
        'transfer',
        `Bán cầu thủ: ${target.name}`,
        `Hoàn tất chuyển nhượng ${target.name}, thu về +€${feeM}M vào ngân sách CLB.`
      );
    },
    [hydratedCareer, saveCareerCloud, pushClubNotification]
  );

  const handleUpdateTraining = useCallback(
    (
      focus: CareerSave['trainingFocus'],
      intensity: CareerSave['trainingIntensity']
    ) => {
      if (!hydratedCareer) return;
      saveCareerCloud({ ...hydratedCareer, trainingFocus: focus, trainingIntensity: intensity });
      const intLabel =
        intensity === 'light'
          ? 'Nhẹ nhàng (+Thể lực)'
          : intensity === 'balanced'
            ? 'Cân bằng'
            : 'Cường độ cao (+OVR)';
      pushClubNotification(
        'training',
        'Thay đổi giáo án tập luyện',
        `Trọng tâm: ${focus} · Cường độ: ${intLabel}.`
      );
    },
    [hydratedCareer, saveCareerCloud, pushClubNotification]
  );

  const handleRecoverPlayerFitness = useCallback(
    async (playerId: string): Promise<{ ok: boolean; message: string }> => {
      if (!hydratedCareer) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu đám mây.' };
      }
      const target = hydratedCareer.squad.find((p) => p.id === playerId);
      if (!target) {
        return { ok: false, message: 'Không tìm thấy cầu thủ trong đội hình.' };
      }
      if (target.fitness >= 100) {
        return { ok: false, message: `${target.name} đã đạt 100% thể lực.` };
      }
      const costM = getPlayerRecoveryCostM(target.fitness);
      if (hydratedCareer.transferBudget < costM) {
        return {
          ok: false,
          message: `Ngân sách không đủ (cần €${costM}M, hiện có €${hydratedCareer.transferBudget.toFixed(1)}M).`,
        };
      }

      const nextSquad = hydratedCareer.squad.map((p) =>
        p.id === playerId
          ? { ...p, fitness: 100, morale: Math.min(100, p.morale + 3) }
          : p
      );
      await saveCareerCloud({
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget - costM).toFixed(1)),
        squad: nextSquad,
      });

      setSelectedPlayer((prev) =>
        prev && prev.id === playerId
          ? { ...prev, fitness: 100, morale: Math.min(100, prev.morale + 3) }
          : prev
      );

      await pushClubNotification(
        'medical',
        `Trị liệu hồi phục: ${target.name}`,
        `Đã bơm thể lực ${target.name} từ ${target.fitness}% lên 100% (-€${costM}M).`
      );

      return {
        ok: true,
        message: `Đã trị liệu xong cho ${target.name}: Thể lực 100% (-€${costM}M).`,
      };
    },
    [hydratedCareer, saveCareerCloud, pushClubNotification]
  );

  const handleRecoverSquadFitness = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    if (!hydratedCareer) {
      return { ok: false, message: 'Chưa sẵn sàng dữ liệu đám mây.' };
    }
    const costM = getSquadRecoveryCostM(hydratedCareer.squad);
    if (costM === 0) {
      return { ok: false, message: 'Toàn đội đã đạt 100% thể lực.' };
    }
    if (hydratedCareer.transferBudget < costM) {
      return {
        ok: false,
        message: `Ngân sách không đủ (cần €${costM}M, hiện có €${hydratedCareer.transferBudget.toFixed(1)}M).`,
      };
    }

    const nextSquad = hydratedCareer.squad.map((p) => ({
      ...p,
      fitness: 100,
      morale: Math.min(100, p.morale + 2),
    }));

    await saveCareerCloud({
      ...hydratedCareer,
      transferBudget: Number((hydratedCareer.transferBudget - costM).toFixed(1)),
      squad: nextSquad,
    });

    setSelectedPlayer((prev) =>
      prev && nextSquad.some((p) => p.id === prev.id)
        ? { ...prev, fitness: 100, morale: Math.min(100, prev.morale + 2) }
        : prev
    );

    await pushClubNotification(
      'medical',
      'Trị liệu toàn đội hoàn tất',
      `Phục hồi 100% thể lực cho toàn bộ ${nextSquad.length} cầu thủ (-€${costM}M).`
    );

    return {
      ok: true,
      message: `Đã hồi phục toàn đội lên 100% thể lực (-€${costM}M).`,
    };
  }, [hydratedCareer, saveCareerCloud, pushClubNotification]);

  const handleFireManager = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    if (!hydratedCareer) {
      return { ok: false, message: 'Chưa sẵn sàng dữ liệu câu lạc bộ.' };
    }
    const activeMgr = getActiveCareerManager(hydratedCareer);
    if (!activeMgr) {
      return { ok: false, message: 'CLB hiện đang trống ghế HLV trưởng.' };
    }
    const severanceM = getManagerSeveranceM(activeMgr);
    if (hydratedCareer.transferBudget < severanceM) {
      return {
        ok: false,
        message: `Ngân sách không đủ để bồi thường hợp đồng €${severanceM}M cho ${activeMgr.name}.`,
      };
    }

    const historyEntry = {
      id: `mh-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 5)}`,
      managerId: activeMgr.id,
      managerName: activeMgr.name,
      action: 'fired' as const,
      season: hydratedCareer.season,
      matchweek: hydratedCareer.matchweek,
      feeM: severanceM,
      date: new Date().toISOString(),
    };

    const nextCareer: CareerSave = {
      ...hydratedCareer,
      activeManagerId: null,
      transferBudget: Number((hydratedCareer.transferBudget - severanceM).toFixed(1)),
      boardConfidence: Math.max(30, hydratedCareer.boardConfidence - 3),
      managerHistory: [historyEntry, ...(hydratedCareer.managerHistory ?? [])].slice(0, 100),
    };

    await saveCareerCloud(nextCareer);
    await pushClubNotification(
      'tactics',
      `Sa thải HLV ${activeMgr.name}`,
      `CLB đã thanh lý hợp đồng với ${activeMgr.name} (-€${severanceM}M). Đội bóng tạm thời do HLV Tạm quyền chỉ đạo.`
    );

    return {
      ok: true,
      message: `Đã sa thải ${activeMgr.name} (bồi thường €${severanceM}M). Hãy chiêu mộ HLV trưởng mới!`,
    };
  }, [hydratedCareer, saveCareerCloud, pushClubNotification]);

  const handleHireManager = useCallback(
    async (
      managerId: string,
      applySuggestedTactics: boolean
    ): Promise<{ ok: boolean; message: string }> => {
      if (!hydratedCareer) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu câu lạc bộ.' };
      }
      const newMgr = REAL_MANAGERS.find((m) => m.id === managerId);
      if (!newMgr) {
        return { ok: false, message: 'Không tìm thấy huấn luyện viên được chọn.' };
      }
      const prevMgr = getActiveCareerManager(hydratedCareer);
      if (prevMgr?.id === newMgr.id) {
        return { ok: false, message: `${newMgr.name} hiện đang dẫn dắt CLB của bạn.` };
      }

      const hireFeeM = getManagerHireFeeM(newMgr, hydratedCareer.clubId);
      if (hydratedCareer.transferBudget < hireFeeM) {
        return {
          ok: false,
          message: `Ngân sách không đủ để chiêu mộ ${newMgr.name} (cần €${hireFeeM}M, hiện có €${hydratedCareer.transferBudget.toFixed(1)}M).`,
        };
      }

      const newHistoryEntries = [
        {
          id: `mh-${Date.now().toString(36)}-hire`,
          managerId: newMgr.id,
          managerName: newMgr.name,
          action: 'hired' as const,
          season: hydratedCareer.season,
          matchweek: hydratedCareer.matchweek,
          feeM: hireFeeM,
          date: new Date().toISOString(),
        },
        ...(prevMgr
          ? [
              {
                id: `mh-${Date.now().toString(36)}-rep`,
                managerId: prevMgr.id,
                managerName: prevMgr.name,
                action: 'replaced' as const,
                season: hydratedCareer.season,
                matchweek: hydratedCareer.matchweek,
                feeM: 0,
                date: new Date().toISOString(),
              },
            ]
          : []),
      ];

      const nextTactics = applySuggestedTactics
        ? {
            ...hydratedCareer.tactics,
            formation: newMgr.preferredFormation,
            mentality:
              newMgr.pressingStyle === 'Low Compact'
                ? ('Cautious' as const)
                : ('Positive' as const),
            passingDirectness: newMgr.pressingStyle === 'Positional Control' ? 2 : 3,
            tempo: newMgr.pressingStyle === 'High Gegenpress' ? 4 : 3,
            pressingIntensity: newMgr.pressingStyle === 'Low Compact' ? 2 : 4,
            defensiveLine: newMgr.pressingStyle === 'Low Compact' ? 2 : 4,
            counterPress: newMgr.pressingStyle !== 'Low Compact',
            playOutOfDefence: newMgr.pressingStyle !== 'Low Compact',
            workBallIntoBox: newMgr.pressingStyle === 'Positional Control',
            offsideTrap: newMgr.pressingStyle === 'High Gegenpress',
            slots: buildAutoLineupSlots(newMgr.preferredFormation, hydratedCareer.squad),
          }
        : hydratedCareer.tactics;

      const moraleLift = newMgr.manManagement >= 90 ? 4 : 2;
      const nextSquad = hydratedCareer.squad.map((p) => ({
        ...p,
        morale: Math.min(100, p.morale + moraleLift),
      }));

      const nextCareer: CareerSave = {
        ...hydratedCareer,
        activeManagerId: newMgr.id,
        transferBudget: Number((hydratedCareer.transferBudget - hireFeeM).toFixed(1)),
        boardConfidence: Math.min(100, hydratedCareer.boardConfidence + 4),
        tactics: nextTactics,
        squad: nextSquad,
        managerHistory: [...newHistoryEntries, ...(hydratedCareer.managerHistory ?? [])].slice(0, 100),
      };

      await saveCareerCloud(nextCareer);
      await pushClubNotification(
        'tactics',
        `Bổ nhiệm HLV trưởng: ${newMgr.name}`,
        `CLB chính thức ký hợp đồng với ${newMgr.name} (-€${hireFeeM}M · Sơ đồ ${newMgr.preferredFormation}${applySuggestedTactics ? ' · Đã áp dụng triết lý mới' : ''}).`
      );

      return {
        ok: true,
        message: `Chào mừng ${newMgr.name} gia nhập ban huấn luyện (-€${hireFeeM}M)!`,
      };
    },
    [hydratedCareer, saveCareerCloud, pushClubNotification]
  );

  const handleOpenPack = useCallback(
    async (
      packTier: PackTier
    ): Promise<{ ok: boolean; message: string; result?: PackOpenResult }> => {
      if (!hydratedCareer) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu đám mây.' };
      }
      const inv = normalizeInventory(hydratedCareer.inventory);
      const mergedPlayers = applyMarketOverrides(INITIAL_PLAYERS, marketOverrides);
      const opened = openPackFromInventory(packTier, inv, hydratedCareer.squad, mergedPlayers);
      if (!opened) {
        return { ok: false, message: 'Bạn không còn gói này trong túi đồ.' };
      }

      const packMeta = PACK_CATALOG.find((p) => p.id === packTier);
      const nextBudget = Number(
        (hydratedCareer.transferBudget + opened.result.budgetGainedM).toFixed(1)
      );

      await saveCareerCloud({
        ...hydratedCareer,
        transferBudget: nextBudget,
        inventory: opened.nextInventory,
      });

      const cardNames = opened.result.cards.map((c) => `${c.player.shortName} (${c.player.rating})`).join(', ');
      await pushClubNotification(
        'inventory',
        `Mở ${packMeta?.name ?? 'Gói thẻ'}`,
        `Nhận ${cardNames}${opened.result.shardsGained > 0 ? `, +${opened.result.shardsGained} Mảnh Ngôi Sao` : ''}${opened.result.boostersGained > 0 ? `, +${opened.result.boostersGained} Bình Thể Lực` : ''}${opened.result.budgetGainedM > 0 ? `, +€${opened.result.budgetGainedM}M` : ''}.`
      );

      return {
        ok: true,
        message: `Đã mở ${packMeta?.name ?? 'gói quà'} thành công!`,
        result: opened.result,
      };
    },
    [hydratedCareer, marketOverrides, saveCareerCloud, pushClubNotification]
  );

  const handleBuyPack = useCallback(
    async (packTier: PackTier): Promise<{ ok: boolean; message: string }> => {
      if (!hydratedCareer) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu đám mây.' };
      }
      const pack = PACK_CATALOG.find((p) => p.id === packTier);
      if (!pack || pack.buyPriceM <= 0) {
        return { ok: false, message: 'Gói quà này không được bán trong cửa hàng.' };
      }
      const inv = normalizeInventory(hydratedCareer.inventory);
      if (hasPurchasedPackToday(inv, packTier)) {
        return {
          ok: false,
          message: `Hôm nay bạn đã mua ${pack.name} rồi (giới hạn tối đa 1 gói/loại mỗi ngày để chống lạm phát).`,
        };
      }
      if (hydratedCareer.transferBudget < pack.buyPriceM) {
        return {
          ok: false,
          message: `Ngân sách không đủ (Cần €${pack.buyPriceM}M, hiện có €${hydratedCareer.transferBudget.toFixed(1)}M).`,
        };
      }

      const todayKey = getTodayPurchaseDateKey();
      const nextInv = normalizeInventory({
        ...inv,
        packs: {
          ...inv.packs,
          [packTier]: (inv.packs[packTier] ?? 0) + 1,
        },
        dailyPackPurchases: {
          ...(inv.dailyPackPurchases ?? {}),
          [packTier]: todayKey,
        },
      });

      await saveCareerCloud({
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget - pack.buyPriceM).toFixed(1)),
        inventory: nextInv,
      });

      await pushClubNotification(
        'inventory',
        `Mua ${pack.name}`,
        `Đã mua thêm 1 ${pack.name} vào túi đồ (-€${pack.buyPriceM}M).`
      );

      return {
        ok: true,
        message: `Đã mua 1 ${pack.name} (-€${pack.buyPriceM}M). Hãy mở ngay trong Túi đồ!`,
      };
    },
    [hydratedCareer, saveCareerCloud, pushClubNotification]
  );

  const handleUpgradePlayerStar = useCallback(
    async (playerId: string): Promise<{ ok: boolean; message: string }> => {
      if (!hydratedCareer) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu đám mây.' };
      }
      const target = hydratedCareer.squad.find((p) => p.id === playerId);
      if (!target) {
        return { ok: false, message: 'Cầu thủ không có trong đội hình CLB.' };
      }

      const inv = normalizeInventory(hydratedCareer.inventory);
      const plan = getStarUpgradePlan(target, inv, hydratedCareer.transferBudget);
      if (plan.isMax) {
        return { ok: false, message: `${target.name} đã đạt tối đa 5★.` };
      }
      if (!plan.hasEnoughCards) {
        return {
          ok: false,
          message: `Thiếu thẻ trùng lặp! Cần thêm ${plan.cardsMissing} thẻ bản sao của ${target.shortName} (không thể dùng Mảnh bù thẻ).`,
        };
      }
      if (!plan.hasEnoughShards) {
        return {
          ok: false,
          message: `Thiếu Mảnh Ngôi Sao! Cần thêm ${plan.shardsMissing} Mảnh Ngôi Sao (${plan.tierLabel}).`,
        };
      }
      if (!plan.canAffordBudget) {
        return {
          ok: false,
          message: `Không đủ ngân sách ghép sao (Cần €${plan.feeM}M).`,
        };
      }

      const upgraded = applyPlayerStarUpgrade(target, plan);
      const nextSquad = hydratedCareer.squad.map((p) => (p.id === playerId ? upgraded : p));
      const nextCards = { ...inv.playerCards };
      const remCards = (nextCards[playerId] ?? 0) - plan.cardsToUse;
      if (remCards > 0) {
        nextCards[playerId] = remCards;
      } else {
        delete nextCards[playerId];
      }

      const nextInv = normalizeInventory({
        ...inv,
        playerCards: nextCards,
        universalShards: inv.universalShards - plan.shardsToUse,
      });

      await saveCareerCloud({
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget - plan.feeM).toFixed(1)),
        squad: nextSquad,
        inventory: nextInv,
      });

      setSelectedPlayer((prev) => (prev && prev.id === playerId ? upgraded : prev));

      await pushClubNotification(
        'upgrade',
        `Đột phá ${plan.nextStars}★ (${plan.tierLabel}): ${target.name}`,
        `Tiêu thụ ${plan.cardsToUse} thẻ trùng & ${plan.shardsToUse} Mảnh: ${target.name} đạt ${plan.nextStars}★ · OVR ${target.rating} → ${upgraded.rating}.`
      );

      return {
        ok: true,
        message: `Đột phá thành công! ${target.name} lên ${plan.nextStars}★ (OVR ${upgraded.rating}).`,
      };
    },
    [hydratedCareer, saveCareerCloud, pushClubNotification]
  );

  const handleRecruitFromCard = useCallback(
    async (playerId: string): Promise<{ ok: boolean; message: string }> => {
      if (!hydratedCareer) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu đám mây.' };
      }
      if (hydratedCareer.squad.some((p) => p.id === playerId)) {
        return { ok: false, message: 'Cầu thủ này đã nằm trong đội hình chính.' };
      }
      if (hydratedCareer.squad.length >= 45) {
        return { ok: false, message: 'Đội hình đã đạt giới hạn tối đa 45 cầu thủ.' };
      }

      const inv = normalizeInventory(hydratedCareer.inventory);
      const cardCount = inv.playerCards[playerId] ?? 0;
      if (cardCount < 1) {
        return { ok: false, message: 'Không tìm thấy thẻ cầu thủ này trong túi đồ.' };
      }

      const mergedPlayers = applyMarketOverrides(INITIAL_PLAYERS, marketOverrides);
      const sourcePlayer = mergedPlayers.find((p) => p.id === playerId);
      if (!sourcePlayer) {
        return { ok: false, message: 'Không tìm thấy dữ liệu gốc của cầu thủ.' };
      }

      const nextCards = { ...inv.playerCards };
      if (cardCount - 1 > 0) {
        nextCards[playerId] = cardCount - 1;
      } else {
        delete nextCards[playerId];
      }

      const recruitedPlayer: Player = {
        ...sourcePlayer,
        clubId: hydratedCareer.clubId,
        baseRating: sourcePlayer.baseRating ?? sourcePlayer.rating,
        stars: 1,
        transferStatus: 'available',
        morale: 92,
        fitness: 100,
        appearances: 0,
        goals: 0,
        assists: 0,
      };

      const nextInv = normalizeInventory({
        ...inv,
        playerCards: nextCards,
      });

      await saveCareerCloud({
        ...hydratedCareer,
        squad: [...hydratedCareer.squad, recruitedPlayer],
        inventory: nextInv,
      });

      await pushClubNotification(
        'transfer',
        `Chiêu mộ từ Thẻ: ${recruitedPlayer.name}`,
        `Kích hoạt thẻ cầu thủ ${recruitedPlayer.name} (${recruitedPlayer.position}, OVR ${recruitedPlayer.rating}) gia nhập đội hình miễn phí.`
      );

      return {
        ok: true,
        message: `Đã chiêu mộ ${recruitedPlayer.name} (OVR ${recruitedPlayer.rating}) từ túi thẻ vào đội hình!`,
      };
    },
    [hydratedCareer, marketOverrides, saveCareerCloud, pushClubNotification]
  );

  const handleDismantleCard = useCallback(
    async (playerId: string, count = 1): Promise<{ ok: boolean; message: string }> => {
      if (!hydratedCareer) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu đám mây.' };
      }
      const inv = normalizeInventory(hydratedCareer.inventory);
      const owned = inv.playerCards[playerId] ?? 0;
      if (owned < count || count <= 0) {
        return { ok: false, message: 'Số lượng thẻ trong túi không đủ để phân giải.' };
      }

      const mergedPlayers = applyMarketOverrides(INITIAL_PLAYERS, marketOverrides);
      const sourcePlayer =
        hydratedCareer.squad.find((p) => p.id === playerId) ??
        mergedPlayers.find((p) => p.id === playerId);
      const shardsPerCard = getCardDismantleShards(
        sourcePlayer?.rating ?? 78,
        sourcePlayer?.cardTier
      );
      const gainedShards = shardsPerCard * count;

      const nextCards = { ...inv.playerCards };
      const rem = owned - count;
      if (rem > 0) {
        nextCards[playerId] = rem;
      } else {
        delete nextCards[playerId];
      }

      const nextInv = normalizeInventory({
        ...inv,
        playerCards: nextCards,
        universalShards: inv.universalShards + gainedShards,
      });

      await saveCareerCloud({
        ...hydratedCareer,
        inventory: nextInv,
      });

      await pushClubNotification(
        'inventory',
        `Phân giải thẻ ${sourcePlayer?.shortName ?? 'cầu thủ'}`,
        `Thu về +${gainedShards} Mảnh Ngôi Sao dùng để nâng sao đội hình.`
      );

      return {
        ok: true,
        message: `Đã tách ${count} thẻ ${sourcePlayer?.shortName ?? ''}, nhận +${gainedShards} Mảnh Ngôi Sao.`,
      };
    },
    [hydratedCareer, marketOverrides, saveCareerCloud, pushClubNotification]
  );

  const handleBulkDismantleCards = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
  }> => {
    if (!hydratedCareer) {
      return { ok: false, message: 'Chưa sẵn sàng dữ liệu đám mây.' };
    }
    const inv = normalizeInventory(hydratedCareer.inventory);
    const mergedPlayers = applyMarketOverrides(INITIAL_PLAYERS, marketOverrides);
    const quickPlan = getQuickDismantlePlan(inv, hydratedCareer.squad, mergedPlayers);
    if (quickPlan.totalCards === 0) {
      return {
        ok: false,
        message: 'Không có thẻ dư thừa an toàn (5★ tối đa hoặc thẻ thường ngoài ĐH) để tách.',
      };
    }

    const nextCards = { ...inv.playerCards };
    for (const item of quickPlan.entries) {
      delete nextCards[item.playerId];
    }

    const nextInv = normalizeInventory({
      ...inv,
      playerCards: nextCards,
      universalShards: inv.universalShards + quickPlan.totalShards,
    });

    await saveCareerCloud({
      ...hydratedCareer,
      inventory: nextInv,
    });

    await pushClubNotification(
      'inventory',
      `Tách nhanh ${quickPlan.totalCards} thẻ dư thừa`,
      `Quy đổi thành công +${quickPlan.totalShards} Mảnh Ngôi Sao (vẫn giữ nguyên các thẻ Siêu Sao/ICON).`
    );

    return {
      ok: true,
      message: `Đã tách ${quickPlan.totalCards} thẻ dư thừa, nhận +${quickPlan.totalShards} Mảnh Ngôi Sao!`,
    };
  }, [hydratedCareer, marketOverrides, saveCareerCloud, pushClubNotification]);

  const handleUseFitnessBooster = useCallback(
    async (playerId: string): Promise<{ ok: boolean; message: string }> => {
      if (!hydratedCareer) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu đám mây.' };
      }
      const inv = normalizeInventory(hydratedCareer.inventory);
      if (inv.fitnessBoosters <= 0) {
        return { ok: false, message: 'Túi đồ đã hết Bình Thể Lực.' };
      }
      const target = hydratedCareer.squad.find((p) => p.id === playerId);
      if (!target) {
        return { ok: false, message: 'Không tìm thấy cầu thủ trong đội hình.' };
      }
      if (target.fitness >= 100) {
        return { ok: false, message: `${target.name} đã đạt 100% thể lực.` };
      }

      const nextSquad = hydratedCareer.squad.map((p) =>
        p.id === playerId
          ? { ...p, fitness: 100, morale: Math.min(100, p.morale + 3) }
          : p
      );
      const nextInv = normalizeInventory({
        ...inv,
        fitnessBoosters: inv.fitnessBoosters - 1,
      });

      await saveCareerCloud({
        ...hydratedCareer,
        squad: nextSquad,
        inventory: nextInv,
      });

      setSelectedPlayer((prev) =>
        prev && prev.id === playerId
          ? { ...prev, fitness: 100, morale: Math.min(100, prev.morale + 3) }
          : prev
      );

      await pushClubNotification(
        'medical',
        `Dùng Bình Thể Lực: ${target.name}`,
        `Hồi phục miễn phí ${target.name} từ ${target.fitness}% lên 100% bằng vật phẩm Túi đồ.`
      );

      return {
        ok: true,
        message: `Đã dùng 1 Bình Thể Lực cho ${target.name}: Thể lực 100% (Miễn phí)!`,
      };
    },
    [hydratedCareer, saveCareerCloud, pushClubNotification]
  );

  const handleEnablePush = useCallback(async () => {
    const res = await requestPushPermission();
    setPushPermission(res);
    if (res === 'granted' && localUser) {
      triggerDeviceNotification(
        'Touchline XI đã bật thông báo',
        'Bạn sẽ nhận thông báo tức thì khi có tin chuyển nhượng nóng.'
      );
    }
  }, [localUser]);

  // --- ONLINE ARENA STATE & HANDLERS ---
  const existingUserArena = useMemo(
    () => (localUser ? cloudArenaProfiles.find((p) => p.uid === localUser.uid) ?? null : null),
    [cloudArenaProfiles, localUser]
  );

  const userArena = useMemo(() => {
    if (!profile || !hydratedCareer) return null;
    return buildArenaProfileFromCareer(profile, hydratedCareer, existingUserArena);
  }, [profile, hydratedCareer, existingUserArena]);

  const leaderboard = useMemo(
    () => mergeLeaderboardWithBots(cloudArenaProfiles),
    [cloudArenaProfiles]
  );

  const handleExportBackup = useCallback(
    async (includeAdminData: boolean) => {
      if (!localUser || !profile || !hydratedCareer) return;

      let arenaSnapshot: ArenaProfile | null = existingUserArena;
      if (!arenaSnapshot) {
        try {
          arenaSnapshot = await getLocalArenaProfile(localUser.uid);
        } catch {
          // Fallback to computed userArena
        }
      }

      const bundle = createClubBackupBundle({
        profile,
        career: hydratedCareer,
        arena:
          arenaSnapshot ??
          buildArenaProfileFromCareer(profile, hydratedCareer, existingUserArena),
        adminData:
          includeAdminData && isAdmin
            ? {
                news,
                marketOverrides: Object.values(marketOverrides),
                notifications,
              }
            : undefined,
      });

      downloadBackupFile(bundle);
    },
    [
      localUser,
      profile,
      hydratedCareer,
      existingUserArena,
      isAdmin,
      news,
      marketOverrides,
      notifications,
    ]
  );

  const handleRestoreBackup = useCallback(
    async (
      bundle: ClubBackupBundle,
      restoreAdminData: boolean
    ): Promise<{ ok: boolean; message: string }> => {
      if (!localUser) {
        return { ok: false, message: 'Vui lòng đăng nhập trước khi phục hồi dữ liệu.' };
      }

      const uid = localUser.uid;
      const restoredCareer = buildCompactCareerForStorage(bundle.career, uid);
      const now = Date.now();

      try {
        const existingProfile = await getLocalUserProfile(uid);
        const initialAdmin = await shouldBeInitialAdmin(localUser.username);
        const resolvedRole: 'admin' | 'manager' =
          existingProfile?.role === 'admin' || isAdmin || initialAdmin ? 'admin' : 'manager';

        const nextProfile: UserProfile = {
          ...(existingProfile ?? {}),
          uid,
          managerName: bundle.profile.managerName,
          nationality: bundle.profile.nationality,
          clubId: bundle.profile.clubId,
          clubName: bundle.profile.clubName,
          preferredFormation: bundle.profile.preferredFormation,
          role: resolvedRole,
          status: existingProfile?.status ?? 'active',
          matchesPlayed: bundle.profile.matchesPlayed,
          wins: bundle.profile.wins,
          draws: bundle.profile.draws,
          losses: bundle.profile.losses,
          trophies: bundle.profile.trophies,
          createdAt: existingProfile?.createdAt ?? now,
          updatedAt: now,
          lastActiveAt: now,
        };

        await putLocalUserProfile(nextProfile);
        await putLocalCareer({
          ...restoredCareer,
          uid,
          updatedAt: now,
        });

        if (bundle.arenaRank) {
          const mergedArena = buildArenaProfileFromCareer(nextProfile, restoredCareer, {
            ...bundle.arenaRank,
          } as ArenaProfile);
          await putLocalArenaProfile({
            ...mergedArena,
            visibility: 'public',
            isBot: false,
            updatedAt: now,
          });
          setCloudArenaProfiles((prev) => {
            const others = prev.filter((item) => item.uid !== uid);
            return [mergedArena, ...others];
          });
        }

        if (restoreAdminData && resolvedRole === 'admin' && bundle.adminData) {
          const addedNews: NewsArticle[] = [];
          for (const article of (bundle.adminData.news ?? []).slice(0, 20)) {
            const safeId = String(article.id || `news-${Date.now()}`)
              .replace(/[^a-zA-Z0-9_-]/g, '')
              .slice(0, 120);
            if (!safeId) continue;
            const newsItem: NewsArticle = {
              id: safeId,
              title: String(article.title || 'Tin tức').slice(0, 175),
              summary: String(article.summary || 'Cập nhật thị trường.').slice(0, 1150),
              category: ['transfer', 'rumor', 'matchday', 'injury', 'official'].includes(
                article.category
              )
                ? article.category
                : 'transfer',
              playerName: String(article.playerName || '').slice(0, 75),
              clubTag: String(article.clubTag || '').slice(0, 60),
              feeText: String(article.feeText || '').slice(0, 40),
              sourceTitle: String(article.sourceTitle || '').slice(0, 110),
              sourceUrl: String(article.sourceUrl || '').slice(0, 380),
              isBreaking: Boolean(article.isBreaking),
              authorUid: uid,
              createdAt: article.createdAt ?? now,
              updatedAt: now,
            };
            await putLocalNews(newsItem);
            addedNews.push(newsItem);
          }
          if (addedNews.length > 0) {
            setNews(addedNews);
          }

          const restoredOverrides: Record<string, MarketOverride> = {};
          for (const ov of (bundle.adminData.marketOverrides ?? []).slice(0, 40)) {
            const safePlayerId = String(ov.playerId || '')
              .replace(/[^a-zA-Z0-9_-]/g, '')
              .slice(0, 120);
            const safeClubId = String(ov.clubId || '')
              .replace(/[^a-zA-Z0-9_-]/g, '')
              .slice(0, 120);
            if (!safePlayerId || !safeClubId) continue;
            const ovPayload: MarketOverride = {
              playerId: safePlayerId,
              clubId: safeClubId,
              marketValueM: Math.max(0.5, Math.min(500, Number(ov.marketValueM) || 10)),
              rating: Math.max(45, Math.min(99, Math.round(Number(ov.rating) || 75))),
              transferStatus: ['available', 'listed', 'untouchable', 'loan'].includes(
                ov.transferStatus
              )
                ? ov.transferStatus
                : 'available',
              updatedBy: uid,
              updatedAt: now,
            };
            await putLocalMarketOverride(ovPayload);
            restoredOverrides[safePlayerId] = ovPayload;
          }
          if (Object.keys(restoredOverrides).length > 0) {
            setMarketOverrides((prev) => ({ ...prev, ...restoredOverrides }));
          }

          const restoredNotifs: PushNotificationItem[] = [];
          for (const n of (bundle.adminData.notifications ?? []).slice(0, 15)) {
            const safeNotifId = String(n.id || `push-${Date.now()}`)
              .replace(/[^a-zA-Z0-9_-]/g, '')
              .slice(0, 120);
            if (!safeNotifId) continue;
            const notifItem: PushNotificationItem = {
              id: safeNotifId,
              title: String(n.title || 'Thông báo').slice(0, 135),
              body: String(n.body || 'Cập nhật hệ thống.').slice(0, 480),
              category: ['transfer', 'matchday', 'system', 'urgent'].includes(n.category)
                ? n.category
                : 'system',
              authorUid: uid,
              createdAt: n.createdAt ?? now,
            };
            await putLocalNotification(notifItem);
            restoredNotifs.push(notifItem);
          }
          if (restoredNotifs.length > 0) {
            setNotifications(restoredNotifs);
          }
        }

        prevCareerRef.current = restoredCareer;
        setCareer(restoredCareer);
        setProfile(nextProfile);
        setNeedsProfile(false);
        setActiveTab('home');

        return {
          ok: true,
          message: `Phục hồi thành công ${bundle.profile.clubName} (${restoredCareer.season} · Vòng ${restoredCareer.matchweek}) vào thiết bị!`,
        };
      } catch (err) {
        console.error('Lỗi phục hồi dữ liệu cục bộ:', err);
        return {
          ok: false,
          message:
            err instanceof Error ? err.message : 'Lỗi khi ghi dữ liệu phục hồi vào bộ nhớ cục bộ.',
        };
      }
    },
    [localUser, isAdmin]
  );

  const saveArenaProfileCloud = useCallback(async (nextArena: ArenaProfile) => {
    const payload: ArenaProfile = {
      ...nextArena,
      visibility: 'public',
      updatedAt: Date.now(),
    };
    setCloudArenaProfiles((prev) => [payload, ...prev.filter((p) => p.uid !== payload.uid)]);
    try {
      await putLocalArenaProfile(payload);
    } catch (err) {
      console.error('Lỗi lưu hồ sơ Đấu trường cục bộ:', err);
    }
  }, []);

  // Sync user's tactical squad snapshot when viewing Online Arena
  useEffect(() => {
    if (
      activeTab !== 'online' ||
      !localUser ||
      !arenaLoadedRef.current ||
      !userArena
    ) {
      return;
    }
    const buildSig = (a: ArenaProfile) =>
      `${a.uid}|${a.managerName}|${a.clubId}|${a.formation}|${a.squadOverall}|${a.attackRating}|${a.midfieldRating}|${a.defenseRating}|${a.starters.map((s) => `${s.id}:${s.rating}:${s.stars}`).join(',')}`;

    const desiredSig = buildSig(userArena);
    if (existingUserArena && buildSig(existingUserArena) === desiredSig) {
      lastSyncedArenaSigRef.current = desiredSig;
      return;
    }
    if (lastSyncedArenaSigRef.current === desiredSig) return;

    if (arenaSyncTimerRef.current) window.clearTimeout(arenaSyncTimerRef.current);
    arenaSyncTimerRef.current = window.setTimeout(() => {
      lastSyncedArenaSigRef.current = desiredSig;
      void saveArenaProfileCloud(userArena);
    }, 600);
  }, [activeTab, localUser, userArena, existingUserArena, saveArenaProfileCloud]);

  const recordCompletedArenaMatch = useCallback(
    async (
      from: ArenaProfile,
      to: ArenaProfile,
      mode: OnlineMatchMode,
      summary: MatchResultSummary,
      winnerUid?: string,
      note?: string
    ) => {
      if (!localUser) return;
      const chId = `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const safeName = (n: string) => {
        const s = (n || 'HLV').trim().slice(0, 60);
        return s.length < 2 ? `${s} XI` : s;
      };
      const now = Date.now();
      const challengeDoc: ArenaChallenge = {
        id: chId,
        participants: [from.uid, to.uid],
        fromUid: from.uid,
        fromManagerName: safeName(from.managerName),
        fromClubId: from.clubId,
        toUid: to.uid,
        toManagerName: safeName(to.managerName),
        toClubId: to.clubId,
        mode,
        status: 'completed',
        homeGoals: summary.homeGoals,
        awayGoals: summary.awayGoals,
        report: toCompactMatchReport(summary, true),
        createdAt: now,
        updatedAt: now,
        ...(summary.penaltiesHome !== undefined ? { penaltiesHome: summary.penaltiesHome } : {}),
        ...(summary.penaltiesAway !== undefined ? { penaltiesAway: summary.penaltiesAway } : {}),
        ...(winnerUid ? { winnerUid: winnerUid.slice(0, 128) } : {}),
        ...(note ? { note: note.slice(0, 160) } : {}),
      };

      setArenaChallenges((prev) => [challengeDoc, ...prev].slice(0, 50));
      try {
        await putLocalArenaChallenge(challengeDoc);
      } catch (err) {
        console.error('Lỗi lưu lịch sử trận Đấu trường:', err);
      }
    },
    [localUser]
  );

  const handlePlayRankedMatch = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
    opponent?: ArenaProfile;
    summary?: MatchResultSummary;
    rankedResult?: RankedOutcomeResult;
  }> => {
    if (!localUser || !hydratedCareer || !userArena) {
      return { ok: false, message: 'Chưa sẵn sàng dữ liệu Đấu Hạng.' };
    }
    const candidates = leaderboard.filter((p) => p.uid !== userArena.uid);
    if (candidates.length === 0) {
      return { ok: false, message: 'Chưa tìm thấy đối thủ phù hợp.' };
    }
    const myRankScore = getRankScore(
      userArena.rankTier,
      userArena.rankDivision,
      userArena.rankStars
    );
    const closestPool = [...candidates]
      .sort(
        (a, b) =>
          Math.abs(getRankScore(a.rankTier, a.rankDivision, a.rankStars) - myRankScore) -
          Math.abs(getRankScore(b.rankTier, b.rankDivision, b.rankStars) - myRankScore)
      )
      .slice(0, 5);
    const opponent = closestPool[Math.floor(Math.random() * closestPool.length)] ?? candidates[0];

    const { summary, winnerUid } = simulateOnlineMatch(userArena, opponent, {
      mode: 'ranked',
      roundLabel: `Đấu Hạng · ${formatRankLabel(userArena.rankTier, userArena.rankDivision, userArena.rankStars)}`,
      isKnockout: true,
    });
    const userWon = winnerUid === userArena.uid;
    const goalDiffAbs = Math.abs(summary.homeGoals - summary.awayGoals);
    const rankedResult = applyRankedMatchOutcome(userArena, userWon, goalDiffAbs);

    await saveArenaProfileCloud(rankedResult.nextProfile);
    await recordCompletedArenaMatch(
      userArena,
      opponent,
      'ranked',
      summary,
      winnerUid,
      `Đấu Hạng vs ${opponent.managerName}`
    );

    // Career rewards from ranked match + first-time promotion milestone
    const inv = normalizeInventory(hydratedCareer.inventory);
    const nextPacks = { ...inv.packs };
    let shardsBonus = userWon ? 4 : 1;
    let budgetBonusM = userWon ? 0.8 : 0.2;

    const milestone = rankedResult.milestoneReward;
    if (milestone) {
      shardsBonus += milestone.shards;
      budgetBonusM += milestone.budgetM;
      if (milestone.packTier) {
        nextPacks[milestone.packTier] = (nextPacks[milestone.packTier] ?? 0) + 1;
      }
    }

    const nextInv = normalizeInventory({
      ...inv,
      packs: nextPacks,
      universalShards: inv.universalShards + shardsBonus,
    });

    await saveCareerCloud({
      ...hydratedCareer,
      transferBudget: Number((hydratedCareer.transferBudget + budgetBonusM).toFixed(2)),
      inventory: nextInv,
    });

    const rankSummaryText = `${formatRankLabel(
      rankedResult.nextProfile.rankTier,
      rankedResult.nextProfile.rankDivision,
      rankedResult.nextProfile.rankStars
    )}`;

    await pushClubNotification(
      'online',
      userWon
        ? `Thắng Đấu Hạng vs ${opponent.managerName} (${summary.homeGoals}-${summary.awayGoals})`
        : `Thua Đấu Hạng vs ${opponent.managerName} (${summary.homeGoals}-${summary.awayGoals})`,
      milestone
        ? `Thăng hạng ${milestone.tierName}! Nhận thưởng mốc lần đầu: +€${milestone.budgetM}M, +${milestone.shards} Mảnh${milestone.packTier ? ` & +1 ${PACK_CATALOG.find((pk) => pk.id === milestone.packTier)?.name ?? milestone.packTier}` : ''}.`
        : `${
            rankedResult.starDelta > 0
              ? `+${rankedResult.starDelta}★`
              : rankedResult.shieldUsed
                ? 'Khiên Bảo Vệ giữ nguyên Sao'
                : `${rankedResult.starDelta}★`
          } · Rank hiện tại: ${rankSummaryText}.`
    );

    return {
      ok: true,
      message: milestone
        ? `Chúc mừng đạt bậc ${milestone.tierName} lần đầu! Rank: ${rankSummaryText}.`
        : userWon
          ? `Chiến thắng ${summary.homeGoals}-${summary.awayGoals}! Rank hiện tại: ${rankSummaryText}.`
          : rankedResult.shieldUsed
            ? `Thất bại ${summary.homeGoals}-${summary.awayGoals} nhưng Khiên Bảo Vệ đã giữ nguyên Sao!`
            : `Thất bại ${summary.homeGoals}-${summary.awayGoals}. Rank hiện tại: ${rankSummaryText}.`,
      opponent,
      summary,
      rankedResult,
    };
  }, [
    localUser,
    hydratedCareer,
    userArena,
    leaderboard,
    saveArenaProfileCloud,
    recordCompletedArenaMatch,
    saveCareerCloud,
    pushClubNotification,
  ]);

  const handlePlayInstantMatch = useCallback(
    async (
      opponent: ArenaProfile,
      mode: 'duel' | 'friendly'
    ): Promise<{ ok: boolean; message: string; summary?: MatchResultSummary }> => {
      if (!localUser || !hydratedCareer || !userArena) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu Đấu Online.' };
      }
      const { summary, winnerUid } = simulateOnlineMatch(userArena, opponent, {
        mode,
        roundLabel: mode === 'friendly' ? 'Giao Hữu Bạn Bè' : 'Tỷ Thí 1v1',
        isKnockout: false,
      });

      const won = summary.homeGoals > summary.awayGoals;
      const drawn = summary.homeGoals === summary.awayGoals;
      const nextArena: ArenaProfile = {
        ...userArena,
        eloPoints: Math.max(
          800,
          Math.min(10000, userArena.eloPoints + (won ? 14 : drawn ? 2 : -10))
        ),
        matchesPlayed: userArena.matchesPlayed + 1,
        wins: userArena.wins + (won ? 1 : 0),
        draws: userArena.draws + (drawn ? 1 : 0),
        losses: userArena.losses + (!won && !drawn ? 1 : 0),
      };
      await saveArenaProfileCloud(nextArena);
      await recordCompletedArenaMatch(
        userArena,
        opponent,
        mode,
        summary,
        winnerUid,
        mode === 'friendly' ? 'Giao hữu bạn bè' : 'Tỷ thí chiến thuật 1v1'
      );

      const inv = normalizeInventory(hydratedCareer.inventory);
      const shardsGain = won ? 3 : drawn ? 2 : 1;
      await saveCareerCloud({
        ...hydratedCareer,
        inventory: normalizeInventory({
          ...inv,
          universalShards: inv.universalShards + shardsGain,
        }),
      });

      const modeLabel = mode === 'friendly' ? 'Giao hữu' : 'Tỷ thí';
      await pushClubNotification(
        'online',
        `${modeLabel}: ${userArena.managerName} ${summary.homeGoals}-${summary.awayGoals} ${opponent.managerName}`,
        `Nhận +${shardsGain} Mảnh Ngôi Sao từ trận ${modeLabel.toLowerCase()} Online.`
      );

      return {
        ok: true,
        message: `${modeLabel} hoàn tất: ${summary.homeGoals} - ${summary.awayGoals} (+${shardsGain} Mảnh Ngôi Sao).`,
        summary,
      };
    },
    [
      localUser,
      hydratedCareer,
      userArena,
      saveArenaProfileCloud,
      recordCompletedArenaMatch,
      saveCareerCloud,
      pushClubNotification,
    ]
  );

  const handleSendChallengeInvite = useCallback(
    async (opponent: ArenaProfile): Promise<{ ok: boolean; message: string }> => {
      if (!localUser || !userArena) {
        return { ok: false, message: 'Cần đăng nhập để gửi lời mời.' };
      }
      if (opponent.isBot) {
        return { ok: false, message: 'Hãy bấm "Đá ngay" để tỷ thí trực tiếp với Bot AI.' };
      }
      const chId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const now = Date.now();
      const challengeDoc: ArenaChallenge = {
        id: chId,
        participants: [userArena.uid, opponent.uid],
        fromUid: userArena.uid,
        fromManagerName: userArena.managerName.slice(0, 60),
        fromClubId: userArena.clubId,
        toUid: opponent.uid,
        toManagerName: opponent.managerName.slice(0, 60),
        toClubId: opponent.clubId,
        mode: 'duel',
        status: 'pending',
        note: `Tỷ thí chiến thuật (${userArena.formation} · OVR ${userArena.squadOverall})`,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await putLocalArenaChallenge(challengeDoc);
        setArenaChallenges((prev) => [challengeDoc, ...prev].slice(0, 30));
        await pushClubNotification(
          'online',
          `Đã gửi lời mời tỷ thí tới ${opponent.managerName}`,
          `Khi đăng nhập tài khoản ${opponent.managerName} trên thiết bị này, bạn có thể chấp nhận lời mời trong mục Đấu Online.`
        );
        return { ok: true, message: `Đã gửi lời mời tỷ thí tới ${opponent.managerName}!` };
      } catch (err) {
        console.error('Lỗi gửi lời mời tỷ thí:', err);
        return { ok: false, message: 'Không thể gửi lời mời tỷ thí lúc này.' };
      }
    },
    [localUser, userArena, pushClubNotification]
  );

  const handleRespondChallengeInvite = useCallback(
    async (
      ch: ArenaChallenge,
      accept: boolean
    ): Promise<{ ok: boolean; message: string; summary?: MatchResultSummary }> => {
      if (!localUser || !userArena || !hydratedCareer) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu.' };
      }
      if (!accept) {
        try {
          const updated = await updateLocalArenaChallenge(ch.id, { status: 'declined' });
          if (updated) {
            setArenaChallenges((prev) => prev.map((item) => (item.id === ch.id ? updated : item)));
          }
          return { ok: true, message: `Đã từ chối lời mời từ ${ch.fromManagerName}.` };
        } catch (err) {
          console.error('Lỗi từ chối lời mời:', err);
          return { ok: false, message: 'Không thể cập nhật lời mời.' };
        }
      }

      const challenger =
        leaderboard.find((p) => p.uid === ch.fromUid) ?? createDefaultBotProfiles()[0];
      const challengerProfile: ArenaProfile = {
        ...challenger,
        uid: ch.fromUid,
        managerName: ch.fromManagerName,
        clubId: ch.fromClubId,
      };
      const { summary, winnerUid } = simulateOnlineMatch(challengerProfile, userArena, {
        mode: 'duel',
        roundLabel: 'Tỷ Thí Trực Tiếp 1v1',
        isKnockout: false,
      });

      const patch: Partial<ArenaChallenge> = {
        status: 'completed',
        homeGoals: summary.homeGoals,
        awayGoals: summary.awayGoals,
        report: toCompactMatchReport(summary, true),
        ...(summary.penaltiesHome !== undefined ? { penaltiesHome: summary.penaltiesHome } : {}),
        ...(summary.penaltiesAway !== undefined ? { penaltiesAway: summary.penaltiesAway } : {}),
        ...(winnerUid ? { winnerUid } : {}),
      };

      try {
        const updated = await updateLocalArenaChallenge(ch.id, patch);
        if (updated) {
          setArenaChallenges((prev) => prev.map((item) => (item.id === ch.id ? updated : item)));
        }
      } catch (err) {
        console.error('Lỗi lưu kết quả tỷ thí:', err);
        return { ok: false, message: 'Lỗi khi lưu kết quả trận tỷ thí.' };
      }

      // Note: userArena is AWAY in challenger -> userArena simulation
      const userWon = summary.awayGoals > summary.homeGoals;
      const drawn = summary.awayGoals === summary.homeGoals;
      await saveArenaProfileCloud({
        ...userArena,
        eloPoints: Math.max(
          800,
          Math.min(10000, userArena.eloPoints + (userWon ? 16 : drawn ? 3 : -10))
        ),
        matchesPlayed: userArena.matchesPlayed + 1,
        wins: userArena.wins + (userWon ? 1 : 0),
        draws: userArena.draws + (drawn ? 1 : 0),
        losses: userArena.losses + (!userWon && !drawn ? 1 : 0),
      });

      await pushClubNotification(
        'online',
        `Kết quả Tỷ thí: ${ch.fromManagerName} ${summary.homeGoals}-${summary.awayGoals} ${userArena.managerName}`,
        `Đã hoàn thành trận thách đấu với ${ch.fromManagerName}.`
      );

      return {
        ok: true,
        message: `Trận tỷ thí kết thúc: ${ch.fromManagerName} ${summary.homeGoals} - ${summary.awayGoals} ${userArena.managerName}!`,
        summary,
      };
    },
    [
      localUser,
      userArena,
      hydratedCareer,
      leaderboard,
      saveArenaProfileCloud,
      pushClubNotification,
    ]
  );

  const handleCancelChallengeInvite = useCallback(
    async (challengeId: string): Promise<{ ok: boolean; message: string }> => {
      try {
        const updated = await updateLocalArenaChallenge(challengeId, { status: 'cancelled' });
        if (updated) {
          setArenaChallenges((prev) =>
            prev.map((item) => (item.id === challengeId ? updated : item))
          );
        }
        return { ok: true, message: 'Đã hủy lời mời tỷ thí.' };
      } catch (err) {
        console.error('Lỗi hủy lời mời tỷ thí:', err);
        return { ok: false, message: 'Không thể hủy lời mời.' };
      }
    },
    []
  );

  const handleStartOnlineTournament = useCallback(
    async (size: 8 | 16): Promise<{ ok: boolean; message: string }> => {
      if (!hydratedCareer || !userArena) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu giải đấu.' };
      }
      const nextTournament = createOnlineTournament(userArena, leaderboard, size);
      await saveCareerCloud({
        ...hydratedCareer,
        onlineTournament: nextTournament,
      });
      await pushClubNotification(
        'online',
        `Khởi tranh ${nextTournament.title}`,
        `Giải đấu loại trực tiếp ${size} HLV đã bốc thăm nhánh đấu. Sẵn sàng cho vòng đầu tiên!`
      );
      return {
        ok: true,
        message: `Đã bốc thăm ${nextTournament.title} gồm ${size} HLV!`,
      };
    },
    [hydratedCareer, userArena, leaderboard, saveCareerCloud, pushClubNotification]
  );

  const handlePlayOnlineTournamentRound = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
    summary?: MatchResultSummary;
  }> => {
    if (!hydratedCareer || !userArena || !hydratedCareer.onlineTournament) {
      return { ok: false, message: 'Không có giải đấu Online đang diễn ra.' };
    }
    const profileMap = new Map(leaderboard.map((p) => [p.uid, p]));
    const { nextTournament, userMatchSummary, userWon, wonTitle } = playOnlineTournamentRound(
      hydratedCareer.onlineTournament,
      userArena,
      profileMap
    );

    const inv = normalizeInventory(hydratedCareer.inventory);
    const nextPacks = { ...inv.packs };
    let budgetBonusM = userWon ? 2.5 : 0.8;
    let shardsBonus = userWon ? 8 : 3;
    let nextCabinet = [...(hydratedCareer.trophyCabinet ?? [])];

    if (wonTitle) {
      const is16 = nextTournament.size === 16;
      budgetBonusM += is16 ? 25 : 15;
      shardsBonus += is16 ? 50 : 30;
      if (is16) {
        nextPacks.legend_pack = (nextPacks.legend_pack ?? 0) + 1;
      } else {
        nextPacks.elite_pack = (nextPacks.elite_pack ?? 0) + 1;
      }
      nextPacks.trophy_gift_box = (nextPacks.trophy_gift_box ?? 0) + 1;

      const trophy: TrophyItem = {
        id: `trophy-online-${nextTournament.id}`,
        title: `Vô địch ${nextTournament.title}`,
        competition: 'super-cup',
        season: hydratedCareer.season,
        clubId: hydratedCareer.clubId,
        awardedAt: new Date().toISOString(),
      };
      nextCabinet = [trophy, ...nextCabinet].slice(0, 60);
    }

    const nextInv = normalizeInventory({
      ...inv,
      packs: nextPacks,
      universalShards: inv.universalShards + shardsBonus,
    });

    await saveCareerCloud({
      ...hydratedCareer,
      onlineTournament: nextTournament,
      transferBudget: Number((hydratedCareer.transferBudget + budgetBonusM).toFixed(2)),
      inventory: nextInv,
      trophyCabinet: nextCabinet,
    });

    await saveArenaProfileCloud({
      ...userArena,
      eloPoints: Math.min(10000, userArena.eloPoints + (wonTitle ? 45 : userWon ? 18 : 2)),
      matchesPlayed: userArena.matchesPlayed + 1,
      wins: userArena.wins + (userWon ? 1 : 0),
      losses: userArena.losses + (userWon ? 0 : 1),
      tournamentTitles: userArena.tournamentTitles + (wonTitle ? 1 : 0),
    });

    if (wonTitle) {
      await pushClubNotification(
        'trophy',
        `VÔ ĐỊCH ${nextTournament.title.toUpperCase()}!`,
        `Nâng cúp giải đấu Online ${nextTournament.size} HLV! Nhận +€${budgetBonusM}M, +${shardsBonus} Mảnh, Gói Thẻ Cao Cấp & Rương Quà Vinh Quang.`
      );
    } else {
      await pushClubNotification(
        'online',
        userWon
          ? `Vượt qua vòng ${hydratedCareer.onlineTournament.currentRound} · ${nextTournament.title}`
          : `Dừng bước tại ${nextTournament.title}`,
        userWon
          ? `Thắng trận và tiến vào vòng tiếp theo (+€${budgetBonusM}M, +${shardsBonus} Mảnh).`
          : `Đội bóng đã bị loại ở vòng ${hydratedCareer.onlineTournament.currentRound} (+€${budgetBonusM}M, +${shardsBonus} Mảnh an ủi).`
      );
    }

    return {
      ok: true,
      message: wonTitle
        ? `CHÚC MỪNG VÔ ĐỊCH ${nextTournament.title}! (+€${budgetBonusM}M, +${shardsBonus} Mảnh & Gói Cao Cấp)`
        : userWon
          ? `Chiến thắng vòng ${hydratedCareer.onlineTournament.currentRound}! Tiến vào vòng tiếp theo.`
          : `Rất tiếc, bạn đã dừng bước ở vòng ${hydratedCareer.onlineTournament.currentRound}.`,
      summary: userMatchSummary ?? undefined,
    };
  }, [
    hydratedCareer,
    userArena,
    leaderboard,
    saveCareerCloud,
    saveArenaProfileCloud,
    pushClubNotification,
  ]);

  const handleSendFriendRequest = useCallback(
    async (target: ArenaProfile): Promise<{ ok: boolean; message: string }> => {
      if (!localUser || !userArena) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu tài khoản.' };
      }
      if (target.uid === userArena.uid) {
        return { ok: false, message: 'Không thể kết bạn với chính mình.' };
      }
      const fId = getFriendshipDocId(userArena.uid, target.uid);
      const status = target.isBot ? 'accepted' : 'pending';
      const now = Date.now();
      const fDoc: Friendship = {
        id: fId,
        participants: [userArena.uid, target.uid],
        requesterUid: userArena.uid,
        recipientUid: target.uid,
        requesterName: userArena.managerName.slice(0, 60),
        requesterClubId: userArena.clubId,
        recipientName: target.managerName.slice(0, 60),
        recipientClubId: target.clubId,
        recipientIsBot: Boolean(target.isBot),
        status,
        createdAt: now,
        updatedAt: now,
      };
      try {
        await putLocalFriendship(fDoc);
        setFriendships((prev) => [fDoc, ...prev.filter((item) => item.id !== fDoc.id)]);
        await pushClubNotification(
          'online',
          target.isBot
            ? `Đã kết bạn với ${target.managerName}`
            : `Đã gửi lời mời kết bạn tới ${target.managerName}`,
          target.isBot
            ? `HLV Bot ${target.managerName} đã trở thành bạn bè Online của bạn.`
            : `Đang chờ ${target.managerName} phản hồi lời mời kết bạn.`
        );
        return {
          ok: true,
          message: target.isBot
            ? `Đã thêm ${target.managerName} vào danh sách bạn bè!`
            : `Đã gửi lời mời kết bạn tới ${target.managerName}!`,
        };
      } catch (err) {
        console.error('Lỗi gửi lời mời kết bạn:', err);
        return { ok: false, message: 'Không thể gửi lời mời kết bạn lúc này.' };
      }
    },
    [localUser, userArena, pushClubNotification]
  );

  const handleRespondFriendRequest = useCallback(
    async (friendship: Friendship, accept: boolean): Promise<{ ok: boolean; message: string }> => {
      try {
        const updated = await updateLocalFriendship(friendship.id, {
          status: accept ? 'accepted' : 'declined',
        });
        if (updated) {
          setFriendships((prev) =>
            prev.map((item) => (item.id === friendship.id ? updated : item))
          );
        }
        if (accept) {
          await pushClubNotification(
            'online',
            `Kết bạn thành công với ${friendship.requesterName}`,
            `Hai bạn đã có thể mời nhau đá giao hữu trong tab Bạn Bè.`
          );
        }
        return {
          ok: true,
          message: accept
            ? `Đã đồng ý kết bạn với ${friendship.requesterName}!`
            : `Đã từ chối lời mời kết bạn từ ${friendship.requesterName}.`,
        };
      } catch (err) {
        console.error('Lỗi phản hồi lời mời kết bạn:', err);
        return { ok: false, message: 'Không thể phản hồi lời mời kết bạn.' };
      }
    },
    [pushClubNotification]
  );

  const handleRemoveFriendship = useCallback(
    async (friendshipId: string): Promise<{ ok: boolean; message: string }> => {
      try {
        await deleteLocalFriendship(friendshipId);
        setFriendships((prev) => prev.filter((item) => item.id !== friendshipId));
        return { ok: true, message: 'Đã cập nhật danh sách bạn bè.' };
      } catch (err) {
        console.error('Lỗi xóa kết nối bạn bè:', err);
        return { ok: false, message: 'Không thể xóa kết nối bạn bè.' };
      }
    },
    []
  );

  if (!authReady) {
    return (
      <div className="min-h-screen bg-[#0B1117] text-slate-200 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Đang khởi tạo dữ liệu cục bộ...</p>
        </div>
      </div>
    );
  }

  if (!localUser || needsProfile) {
    return (
      <AuthOnboarding
        localUser={localUser}
        needsProfile={needsProfile}
        onCompleteOnboarding={handleCompleteOnboarding}
        onRestoreBackup={handleRestoreBackup}
      />
    );
  }

  if (profile?.status === 'suspended') {
    return (
      <div className="min-h-screen bg-[#0B1117] text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-[#121B24] border border-red-500/30 p-6 space-y-4 text-center">
          <h2 className="font-display text-2xl font-bold text-red-400">Tài khoản bị tạm khóa</h2>
          <p className="text-sm text-slate-300">
            Quản trị viên đã tạm khóa quyền truy cập của tài khoản này.
          </p>
          <button
            type="button"
            onClick={() => logoutLocalAccount()}
            className="w-full h-11 rounded-xl bg-slate-800 text-white text-sm font-semibold"
          >
            Đăng xuất
          </button>
        </div>
      </div>
    );
  }

  if (!hydratedCareer || !profile) {
    return (
      <div className="min-h-screen bg-[#0B1117] text-slate-200 flex items-center justify-center">
        <div className="text-center space-y-2">
          <div className="w-8 h-8 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto" />
          <p className="text-xs text-slate-400">Đang tải câu lạc bộ từ bộ nhớ thiết bị...</p>
        </div>
      </div>
    );
  }

  const currentClub = CLUBS.find((c) => c.id === hydratedCareer.clubId) ?? CLUBS[0];
  const unopenedPackCount = getTotalUnopenedPacks(hydratedCareer.inventory);
  const onlineBadgeCount =
    arenaChallenges.filter(
      (c) => c.toUid === localUser.uid && c.status === 'pending'
    ).length +
    friendships.filter(
      (f) => f.recipientUid === localUser.uid && f.status === 'pending'
    ).length;

  return (
    <div className="min-h-screen bg-[#0B1117] text-[#F1F5F9] flex flex-col">
      {/* Compact Sticky Top App Bar (52px, strictly <= 15% combined mobile height) */}
      <header className="sticky top-0 z-30 h-[52px] bg-[#0B1117]/90 backdrop-blur-md border-b border-white/10 px-4 flex items-center justify-between gap-4">
        <div className="flex items-center gap-2.5 min-w-0">
          <ClubCrest club={currentClub} size={28} />
          <span className="font-display text-lg font-extrabold tracking-tight text-white whitespace-nowrap truncate">
            Touchline XI
          </span>
        </div>

        {/* Desktop Nav Links */}
        <nav className="hidden lg:flex items-center gap-5 text-sm font-medium text-slate-300">
          {[
            { id: 'home', label: 'Trang chủ' },
            { id: 'tactics', label: 'Chiến thuật' },
            { id: 'match', label: 'Trận đấu' },
            {
              id: 'online',
              label: onlineBadgeCount > 0 ? `Đấu Online (${onlineBadgeCount})` : 'Đấu Online',
            },
            { id: 'transfers', label: 'Chuyển nhượng' },
            {
              id: 'inventory',
              label: unopenedPackCount > 0 ? `Túi đồ (${unopenedPackCount})` : 'Túi đồ',
            },
            ...(isAdmin ? [{ id: 'admin', label: 'Quản trị' }] : []),
          ].map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id as MainTab)}
              className={`whitespace-nowrap shrink-0 py-1 border-b-2 transition-colors ${
                activeTab === item.id
                  ? 'text-emerald-400 border-emerald-400 font-semibold'
                  : 'border-transparent hover:text-white'
              }`}
            >
              {item.label}
            </button>
          ))}
        </nav>

        {/* Right Utility Actions */}
        <div className="flex items-center gap-1.5 shrink-0">
          <PWAInstallButton />

          <button
            type="button"
            onClick={() => {
              setShowNotifDrawer(true);
              setUnreadCount(0);
            }}
            className="relative min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-300 hover:text-white hover:bg-white/5"
            aria-label="Thông báo"
          >
            <Bell className="w-4 h-4" />
            {unreadCount > 0 && (
              <span className="absolute top-1.5 right-1.5 min-w-[16px] h-4 px-1 rounded-full bg-amber-500 text-slate-950 font-mono-num text-[10px] font-bold flex items-center justify-center">
                {unreadCount}
              </span>
            )}
          </button>

          <button
            type="button"
            onClick={() => logoutLocalAccount()}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
            title="Đăng xuất"
            aria-label="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 w-full max-w-7xl mx-auto px-4 pt-4 pb-24 lg:pb-10">
        <Suspense
          fallback={
            <div className="py-12 text-center text-xs text-slate-400">
              Đang tải phân hệ...
            </div>
          }
        >
          {activeTab === 'home' && (
            <ClubDashboardView
              profile={profile}
              career={hydratedCareer}
              news={news}
              isAdmin={isAdmin}
              pushPermission={pushPermission}
              onEnablePush={handleEnablePush}
              onNavigateTab={(t) => setActiveTab(t === 'club' ? 'home' : t)}
              onSelectPlayer={setSelectedPlayer}
              onUpdateTraining={handleUpdateTraining}
              onRecoverPlayerFitness={handleRecoverPlayerFitness}
              onRecoverSquadFitness={handleRecoverSquadFitness}
              onFireManager={handleFireManager}
              onHireManager={handleHireManager}
              onStartNextSeason={handleStartNextSeason}
              onExportBackup={handleExportBackup}
              onRestoreBackup={handleRestoreBackup}
            />
          )}

          {activeTab === 'tactics' && (
            <TacticsView
              career={hydratedCareer}
              onUpdateTactics={handleUpdateTactics}
              onSelectPlayer={setSelectedPlayer}
            />
          )}

          {activeTab === 'match' && (
            <MatchdayView
              career={hydratedCareer}
              marketOverrides={marketOverrides}
              onCompleteMatchweek={handleCompleteMatchweek}
              onCompleteCupMatch={handleCompleteCupMatch}
              onCompleteFriendly={handleCompleteFriendly}
              onStartNextSeason={handleStartNextSeason}
              onQuickMentality={handleQuickMentality}
            />
          )}

          {activeTab === 'transfers' && (
            <TransfersView
              career={hydratedCareer}
              news={news}
              marketOverrides={marketOverrides}
              onSelectPlayer={setSelectedPlayer}
            />
          )}

          {activeTab === 'inventory' && (
            <InventoryView
              career={hydratedCareer}
              marketOverrides={marketOverrides}
              onSelectPlayer={setSelectedPlayer}
              onOpenPack={handleOpenPack}
              onBuyPack={handleBuyPack}
              onUpgradePlayerStar={handleUpgradePlayerStar}
              onRecruitFromCard={handleRecruitFromCard}
              onDismantleCard={handleDismantleCard}
              onBulkDismantleCards={handleBulkDismantleCards}
              onUseFitnessBooster={handleUseFitnessBooster}
            />
          )}

          {activeTab === 'online' && userArena && (
            <OnlineArenaView
              currentUid={localUser.uid}
              career={hydratedCareer}
              userArena={userArena}
              leaderboard={leaderboard}
              challenges={arenaChallenges}
              friendships={friendships}
              onPlayRankedMatch={handlePlayRankedMatch}
              onPlayInstantMatch={handlePlayInstantMatch}
              onSendChallengeInvite={handleSendChallengeInvite}
              onRespondChallengeInvite={handleRespondChallengeInvite}
              onCancelChallengeInvite={handleCancelChallengeInvite}
              onStartTournament={handleStartOnlineTournament}
              onPlayTournamentRound={handlePlayOnlineTournamentRound}
              onSendFriendRequest={handleSendFriendRequest}
              onRespondFriendRequest={handleRespondFriendRequest}
              onRemoveFriendship={handleRemoveFriendship}
            />
          )}

          {activeTab === 'admin' && isAdmin && (
            <AdminDashboardView
              currentAdminUid={localUser.uid}
              news={news}
              notifications={notifications}
              marketOverrides={marketOverrides}
              onNewsAdded={(items) =>
                setNews((prev) => [...items, ...prev].slice(0, 25))
              }
              onNewsDeleted={(id) =>
                setNews((prev) => prev.filter((item) => item.id !== id))
              }
              onMarketOverrideSaved={(override) =>
                setMarketOverrides((prev) => ({
                  ...prev,
                  [override.playerId]: override,
                }))
              }
              onNotificationAdded={(item) =>
                setNotifications((prev) => [item, ...prev].slice(0, 20))
              }
              onNotificationDeleted={(id) =>
                setNotifications((prev) => prev.filter((item) => item.id !== id))
              }
              onExportBackup={handleExportBackup}
              onRestoreBackup={handleRestoreBackup}
            />
          )}
        </Suspense>
      </main>

      {/* Mobile Bottom Thumb-Zone Navigation (58px height) */}
      <nav className="lg:hidden fixed bottom-0 left-0 right-0 z-40 bg-[#0B1117]/95 backdrop-blur-md border-t border-white/10 pb-safe">
        <div className={`grid ${isAdmin ? 'grid-cols-7' : 'grid-cols-6'} h-[58px] items-center`}>
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center min-h-[48px] ${
              activeTab === 'home' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            <Home className="w-4 h-4" />
            <span className="text-[9px] font-semibold mt-0.5">CLB</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tactics')}
            className={`flex flex-col items-center justify-center min-h-[48px] ${
              activeTab === 'tactics' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            <Sliders className="w-4 h-4" />
            <span className="text-[9px] font-semibold mt-0.5">Chiến thuật</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('match')}
            className={`flex flex-col items-center justify-center min-h-[48px] ${
              activeTab === 'match' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            <Play className="w-4 h-4" />
            <span className="text-[9px] font-semibold mt-0.5">Trận đấu</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('online')}
            className={`relative flex flex-col items-center justify-center min-h-[48px] ${
              activeTab === 'online' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            <Swords className="w-4 h-4" />
            {onlineBadgeCount > 0 && (
              <span className="absolute top-1 right-1.5 min-w-[15px] h-3.5 px-1 rounded-full bg-amber-400 text-slate-950 font-mono-num text-[9px] font-extrabold flex items-center justify-center">
                {onlineBadgeCount}
              </span>
            )}
            <span className="text-[9px] font-semibold mt-0.5">Online</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('transfers')}
            className={`flex flex-col items-center justify-center min-h-[48px] ${
              activeTab === 'transfers' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            <ArrowLeftRight className="w-4 h-4" />
            <span className="text-[9px] font-semibold mt-0.5">Chuyển nhượng</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('inventory')}
            className={`relative flex flex-col items-center justify-center min-h-[48px] ${
              activeTab === 'inventory' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            <PackageOpen className="w-4 h-4" />
            {unopenedPackCount > 0 && (
              <span className="absolute top-1 right-1.5 min-w-[15px] h-3.5 px-1 rounded-full bg-emerald-500 text-slate-950 font-mono-num text-[9px] font-extrabold flex items-center justify-center">
                {unopenedPackCount}
              </span>
            )}
            <span className="text-[9px] font-semibold mt-0.5">Túi đồ</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`flex flex-col items-center justify-center min-h-[48px] ${
                activeTab === 'admin' ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              <ShieldCheck className="w-4 h-4" />
              <span className="text-[9px] font-semibold mt-0.5">Admin</span>
            </button>
          )}
        </div>
      </nav>

      {/* Player Detail & Negotiation Sheet */}
      {selectedPlayer && (
        <PlayerDetailSheet
          player={selectedPlayer}
          isOwnPlayer={hydratedCareer.squad.some((p) => p.id === selectedPlayer.id)}
          transferBudgetM={hydratedCareer.transferBudget}
          squadLength={hydratedCareer.squad.length}
          inventory={hydratedCareer.inventory}
          trophyCabinet={hydratedCareer.trophyCabinet}
          seasonAwards={hydratedCareer.seasonAwards}
          seasonHistory={hydratedCareer.seasonHistory}
          onClose={() => setSelectedPlayer(null)}
          onToggleTransferList={handleToggleTransferList}
          onRenewContract={handleRenewContract}
          onSellPlayer={handleSellPlayer}
          onRecoverFitness={handleRecoverPlayerFitness}
          onUseFitnessBooster={handleUseFitnessBooster}
          onUpgradeStar={handleUpgradePlayerStar}
          onMakeOffer={handleMakeOffer}
        />
      )}

      {/* Real-Time Push Toast */}
      {liveToast && (
        <div className="fixed top-16 left-4 right-4 sm:left-auto sm:right-6 sm:w-96 z-50 rounded-2xl bg-[#121B24] border border-amber-400/50 p-4 shadow-2xl flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-amber-400">
              {liveToast.tag || 'THÔNG BÁO MỚI'}
            </p>
            <p className="text-sm font-bold text-white mt-0.5">{liveToast.title}</p>
            <p className="text-xs text-slate-300 mt-0.5 line-clamp-2">{liveToast.body}</p>
          </div>
          <button
            type="button"
            onClick={() => setLiveToast(null)}
            className="text-slate-400 hover:text-white"
            aria-label="Đóng thông báo"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Notification Center Drawer */}
      {showNotifDrawer && (() => {
        const toMs = (ts: unknown): number => {
          if (typeof ts === 'number' && Number.isFinite(ts)) return ts;
          if (ts && typeof (ts as { toMillis?: () => number }).toMillis === 'function') {
            return (ts as { toMillis: () => number }).toMillis();
          }
          return 0;
        };
        const formatTime = (ts: unknown): string => {
          const ms = toMs(ts);
          if (!ms) return 'Vừa xong';
          const diffMin = Math.floor((Date.now() - ms) / 60000);
          if (diffMin < 1) return 'Vừa xong';
          if (diffMin < 60) return `${diffMin} phút trước`;
          const d = new Date(ms);
          return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')} · ${String(d.getDate()).padStart(2, '0')}/${String(d.getMonth() + 1).padStart(2, '0')}`;
        };
        const categoryLabels: Record<string, string> = {
          match: 'Trận đấu',
          transfer: 'Chuyển nhượng',
          tactics: 'Chiến thuật',
          medical: 'Y tế & Thể lực',
          training: 'Tập luyện',
          season: 'Mùa giải',
          trophy: 'Danh hiệu',
          contract: 'Hợp đồng',
          inventory: 'Túi đồ',
          upgrade: 'Ghép sao',
          online: 'Đấu Online',
          matchday: 'Lịch đấu',
          system: 'Hệ thống',
          urgent: 'Khẩn cấp',
        };

        type UnifiedNotif = {
          id: string;
          source: 'club' | 'system';
          category: string;
          title: string;
          body: string;
          createdAt?: unknown;
        };

        const unified: UnifiedNotif[] = [
          ...clubNotifications.map((c) => ({
            id: c.id,
            source: 'club' as const,
            category: c.category,
            title: c.title,
            body: c.body,
            createdAt: c.createdAt,
          })),
          ...notifications.map((s) => ({
            id: s.id,
            source: 'system' as const,
            category: s.category,
            title: s.title,
            body: s.body,
            createdAt: s.createdAt,
          })),
        ]
          .filter((item) => (notifFilter === 'all' ? true : item.source === notifFilter))
          .sort((a, b) => toMs(b.createdAt) - toMs(a.createdAt));

        return (
          <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm">
            <div className="w-full sm:max-w-md max-h-[85vh] overflow-y-auto rounded-t-3xl sm:rounded-2xl bg-[#121B24] border border-white/10 p-5 space-y-4">
              <div className="flex items-center justify-between">
                <h3 className="font-display text-xl font-bold text-white flex items-center gap-2">
                  <Compass className="w-5 h-5 text-emerald-400" />
                  Trung tâm Thông báo
                </h3>
                <button
                  type="button"
                  onClick={() => setShowNotifDrawer(false)}
                  className="min-w-[44px] min-h-[44px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white"
                  aria-label="Đóng trung tâm thông báo"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="grid grid-cols-3 gap-1 p-1 rounded-xl bg-[#0B1117] border border-white/10">
                {[
                  { id: 'all', label: `Tất cả (${clubNotifications.length + notifications.length})` },
                  { id: 'club', label: `CLB (${clubNotifications.length})` },
                  { id: 'system', label: `Hệ thống (${notifications.length})` },
                ].map((tab) => (
                  <button
                    key={tab.id}
                    type="button"
                    onClick={() => setNotifFilter(tab.id as typeof notifFilter)}
                    className={`h-9 rounded-lg text-xs font-semibold transition-colors ${
                      notifFilter === tab.id
                        ? 'bg-emerald-500 text-slate-950'
                        : 'text-slate-300 hover:text-white'
                    }`}
                  >
                    {tab.label}
                  </button>
                ))}
              </div>

              {pushPermission !== 'granted' && pushPermission !== 'unsupported' && (
                <button
                  type="button"
                  onClick={handleEnablePush}
                  className="w-full h-11 rounded-xl bg-emerald-500 text-slate-950 font-bold text-xs"
                >
                  Bật thông báo đẩy trên thiết bị này
                </button>
              )}

              <div className="space-y-2.5">
                {unified.length === 0 ? (
                  <p className="text-xs text-slate-400 py-6 text-center">
                    {notifFilter === 'club'
                      ? 'Chưa có biến động câu lạc bộ nào được ghi nhận.'
                      : notifFilter === 'system'
                        ? 'Chưa có thông báo đẩy nào từ hệ thống.'
                        : 'Chưa có thông báo nào.'}
                  </p>
                ) : (
                  unified.map((n) => (
                    <div
                      key={`${n.source}-${n.id}`}
                      className={`rounded-xl bg-[#0B1117] border p-3.5 space-y-1 ${
                        n.source === 'club' ? 'border-emerald-500/20' : 'border-amber-400/25'
                      }`}
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span
                          className={`text-[11px] font-semibold uppercase ${
                            n.source === 'club' ? 'text-emerald-400' : 'text-amber-400'
                          }`}
                        >
                          {n.source === 'club' ? 'CLB · ' : 'HỆ THỐNG · '}
                          {categoryLabels[n.category] || n.category}
                        </span>
                        <div className="flex items-center gap-2 shrink-0">
                          <span className="text-[10px] font-mono-num text-slate-500">
                            {formatTime(n.createdAt)}
                          </span>
                          {n.source === 'club' && (
                            <button
                              type="button"
                              onClick={() => handleDeleteClubNotification(n.id)}
                              className="text-slate-500 hover:text-red-400 p-0.5"
                              aria-label="Xóa thông báo"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      <p className="text-sm font-bold text-white">{n.title}</p>
                      <p className="text-xs text-slate-300 leading-relaxed">{n.body}</p>
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        );
      })()}
    </div>
  );
}
