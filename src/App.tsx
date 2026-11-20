import React, { Suspense, lazy, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged, signOut, User } from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  limit,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  setDoc,
  updateDoc,
  where,
} from 'firebase/firestore';
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
import { CLUBS, INITIAL_PLAYERS } from './data/footballDatabase';
import {
  applyCupMatchResults,
  applyMarketOverrides,
  applyMatchToStandings,
  buildAutoLineupSlots,
  createInitialCareer,
  createNextSeasonCareer,
  ensureCareerCompetitions,
  getPlayerRecoveryCostM,
  getSquadRecoveryCostM,
  mergeMatchResultsIntoLeaderboard,
  sortStandings,
  toCompactMatchReport,
} from './lib/careerEngine';
import {
  applyPlayerStarUpgrade,
  getCardDismantleShards,
  getStarUpgradePlan,
  getTotalUnopenedPacks,
  normalizeInventory,
  openPackFromInventory,
  PACK_CATALOG,
} from './lib/inventoryEngine';
import {
  auth,
  db,
  FIRESTORE_QUOTA_UPGRADE_URL,
  handleFirestoreError,
  hasFirestoreQuotaExceeded,
  OperationType,
  subscribeFirestoreQuota,
} from './lib/firebase';
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

const ADMIN_EMAIL = 'nguyendai.thqv@gmail.com';

export default function App() {
  const [authReady, setAuthReady] = useState(false);
  const [firebaseUser, setFirebaseUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [career, setCareer] = useState<CareerSave | null>(null);
  const [needsProfile, setNeedsProfile] = useState(false);

  const [activeTab, setActiveTab] = useState<MainTab>('home');
  const [selectedPlayer, setSelectedPlayer] = useState<Player | null>(null);

  // Real-time cloud feeds
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
  const [quotaExceeded, setQuotaExceeded] = useState<boolean>(() => hasFirestoreQuotaExceeded());
  const [quotaBannerDismissed, setQuotaBannerDismissed] = useState(false);
  const initialNotifLoadedRef = useRef(false);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const initialClubNotifLoadedRef = useRef(false);
  const seenClubNotifIdsRef = useRef<Set<string>>(new Set());
  const tacticsNotifTimerRef = useRef<number | null>(null);
  const tacticsSaveTimerRef = useRef<number | null>(null);
  const arenaSyncTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);
  const arenaLoadedRef = useRef(false);
  const lastSyncedArenaSigRef = useRef('');
  const prevCareerRef = useRef<CareerSave | null>(null);

  useEffect(() => subscribeFirestoreQuota(setQuotaExceeded), []);

  const isAdmin = useMemo(() => {
    if (!firebaseUser?.emailVerified) return false;
    return firebaseUser.email === ADMIN_EMAIL || profile?.role === 'admin';
  }, [firebaseUser, profile]);

  const hydratedCareer = useMemo(
    () => (career ? ensureCareerCompetitions(career) : null),
    [career]
  );

  // 1. Auth State Listener
  useEffect(() => {
    const unsub = onAuthStateChanged(auth, async (user) => {
      setFirebaseUser(user);
      if (!user) {
        setProfile(null);
        setCareer(null);
        setClubNotifications([]);
        setNotifications([]);
        setCloudArenaProfiles([]);
        setArenaChallenges([]);
        setFriendships([]);
        setUnreadCount(0);
        initialNotifLoadedRef.current = false;
        initialClubNotifLoadedRef.current = false;
        seenNotifIdsRef.current.clear();
        seenClubNotifIdsRef.current.clear();
        arenaLoadedRef.current = false;
        lastSyncedArenaSigRef.current = '';
        setNeedsProfile(false);
        setAuthReady(true);
        return;
      }

      if (!user.emailVerified) {
        setAuthReady(true);
        return;
      }

      try {
        const userRef = doc(db, 'users', user.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          setNeedsProfile(true);
          setAuthReady(true);
          return;
        }
        setProfile(userSnap.data() as UserProfile);
        setNeedsProfile(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.GET, `users/${user.uid}`);
      } finally {
        setAuthReady(true);
      }
    });
    return () => unsub();
  }, []);

  // 2. Real-time Firestore Listeners when authenticated & verified
  useEffect(() => {
    if (!firebaseUser?.emailVerified || needsProfile) return;

    const uid = firebaseUser.uid;
    const unsubCareer = onSnapshot(
      doc(db, 'careers', uid),
      (snap) => {
        if (snap.exists()) {
          const data = snap.data() as CareerSave;
          prevCareerRef.current = data;
          setCareer(data);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `careers/${uid}`)
    );

    const unsubProfile = onSnapshot(
      doc(db, 'users', uid),
      (snap) => {
        if (snap.exists()) {
          setProfile(snap.data() as UserProfile);
        }
      },
      (err) => handleFirestoreError(err, OperationType.GET, `users/${uid}`)
    );

    const newsQuery = query(collection(db, 'news'), orderBy('createdAt', 'desc'), limit(25));
    const unsubNews = onSnapshot(
      newsQuery,
      (snap) => {
        const list: NewsArticle[] = [];
        snap.forEach((d) => list.push(d.data() as NewsArticle));
        setNews(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'news')
    );

    const notifQuery = query(
      collection(db, 'notifications'),
      orderBy('createdAt', 'desc'),
      limit(20)
    );
    const unsubNotifs = onSnapshot(
      notifQuery,
      (snap) => {
        const list: PushNotificationItem[] = [];
        snap.forEach((d) => list.push(d.data() as PushNotificationItem));
        setNotifications(list);

        if (!initialNotifLoadedRef.current) {
          list.forEach((n) => seenNotifIdsRef.current.add(n.id));
          initialNotifLoadedRef.current = true;
          return;
        }

        // Dispatch Push + In-App Toast for newly arrived notifications
        for (const item of list) {
          if (!seenNotifIdsRef.current.has(item.id)) {
            seenNotifIdsRef.current.add(item.id);
            setUnreadCount((c) => c + 1);
            setLiveToast({ title: item.title, body: item.body, tag: 'HỆ THỐNG' });
            triggerDeviceNotification(item.title, item.body, item.id);
            if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = window.setTimeout(() => setLiveToast(null), 6500);
            break;
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'notifications')
    );

    const clubNotifQuery = query(
      collection(db, 'users', uid, 'clubNotifications'),
      orderBy('createdAt', 'desc'),
      limit(40)
    );
    const unsubClubNotifs = onSnapshot(
      clubNotifQuery,
      (snap) => {
        const list: ClubNotificationItem[] = [];
        snap.forEach((d) => list.push(d.data() as ClubNotificationItem));
        setClubNotifications(list);

        if (!initialClubNotifLoadedRef.current) {
          list.forEach((n) => seenClubNotifIdsRef.current.add(n.id));
          initialClubNotifLoadedRef.current = true;
          return;
        }

        for (const item of list) {
          if (!seenClubNotifIdsRef.current.has(item.id)) {
            seenClubNotifIdsRef.current.add(item.id);
            setUnreadCount((c) => c + 1);
            setLiveToast({ title: item.title, body: item.body, tag: 'CẬP NHẬT CLB' });
            triggerDeviceNotification(item.title, item.body, item.id);
            if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
            toastTimerRef.current = window.setTimeout(() => setLiveToast(null), 5500);
            break;
          }
        }
      },
      (err) => handleFirestoreError(err, OperationType.LIST, `users/${uid}/clubNotifications`)
    );

    const unsubOverrides = onSnapshot(
      collection(db, 'marketOverrides'),
      (snap) => {
        const map: Record<string, MarketOverride> = {};
        snap.forEach((d) => {
          const data = d.data() as MarketOverride;
          map[data.playerId] = data;
        });
        setMarketOverrides(map);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'marketOverrides')
    );

    const arenaProfilesQuery = query(
      collection(db, 'arenaProfiles'),
      where('visibility', '==', 'public'),
      limit(100)
    );
    const unsubArenaProfiles = onSnapshot(
      arenaProfilesQuery,
      (snap) => {
        const list: ArenaProfile[] = [];
        snap.forEach((d) => list.push(d.data() as ArenaProfile));
        arenaLoadedRef.current = true;
        setCloudArenaProfiles(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'arenaProfiles')
    );

    const toTimeMs = (ts: unknown): number => {
      if (ts && typeof (ts as { toMillis?: () => number }).toMillis === 'function') {
        return (ts as { toMillis: () => number }).toMillis();
      }
      return 0;
    };

    const challengesQuery = query(
      collection(db, 'arenaChallenges'),
      where('participants', 'array-contains', uid),
      limit(60)
    );
    const unsubChallenges = onSnapshot(
      challengesQuery,
      (snap) => {
        const list: ArenaChallenge[] = [];
        snap.forEach((d) => list.push(d.data() as ArenaChallenge));
        list.sort(
          (a, b) =>
            (toTimeMs(b.updatedAt) || toTimeMs(b.createdAt)) -
            (toTimeMs(a.updatedAt) || toTimeMs(a.createdAt))
        );
        setArenaChallenges(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'arenaChallenges')
    );

    const friendshipsQuery = query(
      collection(db, 'friendships'),
      where('participants', 'array-contains', uid),
      limit(80)
    );
    const unsubFriendships = onSnapshot(
      friendshipsQuery,
      (snap) => {
        const list: Friendship[] = [];
        snap.forEach((d) => list.push(d.data() as Friendship));
        list.sort(
          (a, b) =>
            (toTimeMs(b.updatedAt) || toTimeMs(b.createdAt)) -
            (toTimeMs(a.updatedAt) || toTimeMs(a.createdAt))
        );
        setFriendships(list);
      },
      (err) => handleFirestoreError(err, OperationType.LIST, 'friendships')
    );

    return () => {
      unsubCareer();
      unsubProfile();
      unsubNews();
      unsubNotifs();
      unsubClubNotifs();
      unsubOverrides();
      unsubArenaProfiles();
      unsubChallenges();
      unsubFriendships();
    };
  }, [firebaseUser, needsProfile]);

  useEffect(() => {
    return () => {
      if (tacticsNotifTimerRef.current) window.clearTimeout(tacticsNotifTimerRef.current);
      if (tacticsSaveTimerRef.current) window.clearTimeout(tacticsSaveTimerRef.current);
      if (arenaSyncTimerRef.current) window.clearTimeout(arenaSyncTimerRef.current);
      if (toastTimerRef.current) window.clearTimeout(toastTimerRef.current);
    };
  }, []);

  const pushClubNotification = useCallback(
    async (
      category: ClubNotificationCategory,
      title: string,
      body: string,
      targetUid?: string
    ) => {
      const uid = targetUid ?? firebaseUser?.uid;
      if (!uid) return;
      if (hasFirestoreQuotaExceeded()) return;
      const safeTitle = (title.trim() || 'Cập nhật CLB').slice(0, 140);
      const safeBody = (body.trim() || 'Dữ liệu câu lạc bộ đã được đồng bộ.').slice(0, 400);
      const notifId = `cn-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        await setDoc(doc(db, 'users', uid, 'clubNotifications', notifId), {
          id: notifId,
          uid,
          category,
          title: safeTitle.length < 2 ? `${safeTitle}.` : safeTitle,
          body: safeBody.length < 2 ? `${safeBody}.` : safeBody,
          createdAt: serverTimestamp(),
        });
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}/clubNotifications/${notifId}`);
      }
    },
    [firebaseUser]
  );

  const handleDeleteClubNotification = useCallback(
    async (notifId: string) => {
      if (!firebaseUser) return;
      try {
        await deleteDoc(doc(db, 'users', firebaseUser.uid, 'clubNotifications', notifId));
      } catch (err) {
        handleFirestoreError(
          err,
          OperationType.DELETE,
          `users/${firebaseUser.uid}/clubNotifications/${notifId}`
        );
      }
    },
    [firebaseUser]
  );

  const handleCompleteOnboarding = useCallback(
    async (data: {
      managerName: string;
      nationality: string;
      clubId: string;
      preferredFormation: FormationId;
    }) => {
      if (!firebaseUser) return;
      const uid = firebaseUser.uid;
      const club = CLUBS.find((c) => c.id === data.clubId) ?? CLUBS[0];

      const newProfile: Record<string, unknown> = {
        uid,
        managerName: data.managerName,
        nationality: data.nationality,
        clubId: club.id,
        clubName: club.name,
        preferredFormation: data.preferredFormation,
        role: 'manager',
        status: 'active',
        matchesPlayed: 0,
        wins: 0,
        draws: 0,
        losses: 0,
        trophies: 0,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
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
        await setDoc(doc(db, 'users', uid), newProfile);
        await setDoc(doc(db, 'users', uid, 'private', 'account'), {
          uid,
          email: firebaseUser.email || 'manager@touchlinexi.com',
          pushEnabled: pushPermission === 'granted',
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await setDoc(doc(db, 'careers', uid), {
          ...initialCareer,
          updatedAt: serverTimestamp(),
        });
        const logId = `start-${uid}-${Date.now()}`;
        await setDoc(doc(db, 'activityLogs', logId), {
          id: logId,
          uid,
          eventType: 'career_started',
          clubId: club.id,
          detail: `${data.managerName} tiếp quản ${club.name}`,
          createdAt: serverTimestamp(),
        });
        await pushClubNotification(
          'season',
          `Nhậm chức HLV trưởng ${club.shortName}`,
          `${data.managerName} chính thức tiếp quản ${club.name} ở mùa giải 2026/27 (${data.preferredFormation}).`,
          uid
        );
        setNeedsProfile(false);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `users/${uid}`);
      }
    },
    [firebaseUser, marketOverrides, pushPermission, pushClubNotification]
  );

  const sanitizeForFirestore = (val: unknown): unknown => {
    if (val === null || typeof val !== 'object') return val;
    if (Array.isArray(val)) return val.map((item) => sanitizeForFirestore(item));
    const proto = Object.getPrototypeOf(val);
    if (proto !== Object.prototype && proto !== null) {
      // Preserve Firestore FieldValue sentinels (e.g. serverTimestamp) and Date instances
      return val;
    }
    const clean: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(val as Record<string, unknown>)) {
      if (v !== undefined) {
        clean[k] = sanitizeForFirestore(v);
      }
    }
    return clean;
  };

  const saveCareerCloud = useCallback(
    async (nextCareer: CareerSave) => {
      if (!firebaseUser) return;
      const prev = prevCareerRef.current;
      prevCareerRef.current = nextCareer;
      setCareer(nextCareer);
      if (hasFirestoreQuotaExceeded()) return;
      try {
        const normalizedInv = nextCareer.inventory
          ? normalizeInventory(nextCareer.inventory)
          : undefined;
        const candidateFields: Array<[string, unknown, unknown]> = [
          ['clubId', nextCareer.clubId, prev?.clubId],
          ['season', nextCareer.season, prev?.season],
          ['matchweek', nextCareer.matchweek, prev?.matchweek],
          ['transferBudget', nextCareer.transferBudget, prev?.transferBudget],
          ['wageBudget', nextCareer.wageBudget, prev?.wageBudget],
          ['boardConfidence', nextCareer.boardConfidence, prev?.boardConfidence],
          ['fanSupport', nextCareer.fanSupport, prev?.fanSupport],
          ['trainingFocus', nextCareer.trainingFocus, prev?.trainingFocus],
          ['trainingIntensity', nextCareer.trainingIntensity, prev?.trainingIntensity],
          ['tactics', nextCareer.tactics, prev?.tactics],
          ['squad', nextCareer.squad, prev?.squad],
          ['standings', nextCareer.standings, prev?.standings],
          ['fixtures', nextCareer.fixtures, prev?.fixtures],
          ['recentResults', nextCareer.recentResults, prev?.recentResults],
          ['transferHistory', nextCareer.transferHistory ?? [], prev?.transferHistory ?? []],
          ['competitions', nextCareer.competitions, prev?.competitions],
          ['trophyCabinet', nextCareer.trophyCabinet, prev?.trophyCabinet],
          ['seasonHistory', nextCareer.seasonHistory, prev?.seasonHistory],
          ['inventory', normalizedInv, prev?.inventory ? normalizeInventory(prev.inventory) : undefined],
          ['onlineTournament', nextCareer.onlineTournament, prev?.onlineTournament],
        ];

        const payload: Record<string, unknown> = {};
        let changedCount = 0;
        for (const [key, nextVal, prevVal] of candidateFields) {
          if (nextVal === undefined) continue;
          if (!prev || nextVal !== prevVal) {
            // Confirm serialized change for non-primitive fields to skip massive unchanged blobs
            if (
              prev &&
              prevVal !== undefined &&
              typeof nextVal === 'object' &&
              JSON.stringify(nextVal) === JSON.stringify(prevVal)
            ) {
              continue;
            }
            payload[key] = nextVal;
            changedCount++;
          }
        }
        if (changedCount === 0) return;
        payload.updatedAt = serverTimestamp();

        await updateDoc(
          doc(db, 'careers', firebaseUser.uid),
          sanitizeForFirestore(payload) as Record<string, unknown>
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `careers/${firebaseUser.uid}`);
      }
    },
    [firebaseUser]
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
      if (!hydratedCareer || !firebaseUser || !profile) return;
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
        const involvesUser =
          m.homeClubId === hydratedCareer.clubId || m.awayClubId === hydratedCareer.clubId;
        return {
          ...f,
          played: true,
          homeGoals: m.homeGoals,
          awayGoals: m.awayGoals,
          report: toCompactMatchReport(m, involvesUser),
        };
      });

      const isUserHome = userMatch.homeClubId === hydratedCareer.clubId;
      const myGoals = isUserHome ? userMatch.homeGoals : userMatch.awayGoals;
      const oppGoals = isUserHome ? userMatch.awayGoals : userMatch.homeGoals;
      const won = myGoals > oppGoals;
      const drawn = myGoals === oppGoals;

      const starterSet = new Set(hydratedCareer.tactics.slots.map((s) => s.playerId));
      const focusRecoveryBonus = hydratedCareer.trainingFocus === 'Recovery' ? 2 : 0;
      const recoveryBoost =
        (hydratedCareer.trainingIntensity === 'light'
          ? 7
          : hydratedCareer.trainingIntensity === 'balanced'
            ? 3
            : -2) + focusRecoveryBonus;

      const goalEvents = userMatch.events.filter(
        (e) => e.type === 'goal' && e.teamId === hydratedCareer.clubId
      );

      const ratingByPlayerId = new Map(
        (userMatch.playerRatings ?? [])
          .filter((r) => r.clubId === hydratedCareer.clubId)
          .map((r) => [r.playerId, r.rating])
      );

      const nextSquad = hydratedCareer.squad.map((p) => {
        const played = starterSet.has(p.id);
        const scored = goalEvents.filter((e) =>
          e.playerId ? e.playerId === p.id : e.playerName === p.name
        ).length;
        const assisted = goalEvents.filter((e) =>
          e.assistId ? e.assistId === p.id : e.assistName === p.shortName
        ).length;
        const nextFit = played
          ? Math.max(62, Math.min(100, p.fitness - 9 + recoveryBoost))
          : Math.min(100, p.fitness + 8);
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
          nextCabinet = [leagueTrophy, ...nextCabinet].slice(0, 60);
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
                INITIAL_PLAYERS
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

      const nextCareer: CareerSave = {
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

      await saveCareerCloud(nextCareer);
      if (hasFirestoreQuotaExceeded()) return;

      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          matchesPlayed: (profile.matchesPlayed || 0) + 1,
          wins: (profile.wins || 0) + (won ? 1 : 0),
          draws: (profile.draws || 0) + (drawn ? 1 : 0),
          losses: (profile.losses || 0) + (!won && !drawn ? 1 : 0),
          trophies: (profile.trophies || 0) + awardedLeagueTrophy,
          lastActiveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const logId = `match-${firebaseUser.uid}-${Date.now()}`;
        await setDoc(doc(db, 'activityLogs', logId), {
          id: logId,
          uid: firebaseUser.uid,
          eventType: 'match_played',
          clubId: hydratedCareer.clubId,
          detail: `VĐQG V${hydratedCareer.matchweek}: ${userMatch.homeGoals}-${userMatch.awayGoals}`,
          createdAt: serverTimestamp(),
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
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
      }
    },
    [hydratedCareer, firebaseUser, profile, saveCareerCloud, pushClubNotification]
  );

  const handleCompleteCupMatch = useCallback(
    async (
      competition: 'champions-cup' | 'national-cup' | 'super-cup',
      userMatch: MatchResultSummary | null,
      roundEntries: { matchId: string; result: MatchResultSummary }[]
    ) => {
      if (!hydratedCareer || !hydratedCareer.competitions || !firebaseUser || !profile) return;
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

        const starterSet = new Set(hydratedCareer.tactics.slots.map((s) => s.playerId));
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
          return {
            ...p,
            appearances: p.appearances + (played ? 1 : 0),
            goals: p.goals + scored,
            assists: p.assists + assisted,
            fitness: played ? Math.max(64, p.fitness - 7) : Math.min(100, p.fitness + 6),
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
          nextCabinet = [item, ...nextCabinet].slice(0, 60);
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
            INITIAL_PLAYERS
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
          nextPacks.trophy_gift_box = (nextPacks.trophy_gift_box ?? 0) + trophiesAdded;
          shardsEarned += 25 * trophiesAdded;
        }
        nextInv = normalizeInventory({
          ...nextInv,
          packs: nextPacks,
          universalShards: nextInv.universalShards + shardsEarned,
        });
      }

      const nextCareer: CareerSave = {
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget + budgetBonus).toFixed(1)),
        boardConfidence: Math.min(100, hydratedCareer.boardConfidence + (trophiesAdded > 0 ? 6 : 0)),
        squad: nextSquad,
        competitions: nextCompsWithStats,
        trophyCabinet: nextCabinet,
        inventory: nextInv,
        recentResults: userMatch
          ? [userMatch, ...hydratedCareer.recentResults.filter((r) => r.id !== userMatch.id)].slice(
              0,
              50
            )
          : hydratedCareer.recentResults,
      };

      await saveCareerCloud(nextCareer);
      if (hasFirestoreQuotaExceeded()) return;

      try {
        if (userMatch || trophiesAdded > 0) {
          await updateDoc(doc(db, 'users', firebaseUser.uid), {
            matchesPlayed: (profile.matchesPlayed || 0) + (userMatch ? 1 : 0),
            wins: (profile.wins || 0) + (userMatch && wonMatch ? 1 : 0),
            draws: (profile.draws || 0) + (userMatch && drawnMatch ? 1 : 0),
            losses: (profile.losses || 0) + (userMatch && !wonMatch && !drawnMatch ? 1 : 0),
            trophies: (profile.trophies || 0) + trophiesAdded,
            lastActiveAt: serverTimestamp(),
            updatedAt: serverTimestamp(),
          });
        }

        if (userMatch) {
          const logId = `cup-${firebaseUser.uid}-${Date.now()}`;
          const compLabel =
            competition === 'champions-cup'
              ? 'Cúp C1'
              : competition === 'national-cup'
                ? 'Cúp QG'
                : 'Siêu Cúp';
          await setDoc(doc(db, 'activityLogs', logId), {
            id: logId,
            uid: firebaseUser.uid,
            eventType: 'match_played',
            clubId: hydratedCareer.clubId,
            detail: `${compLabel}: ${userMatch.homeGoals}-${userMatch.awayGoals}`.slice(0, 180),
            createdAt: serverTimestamp(),
          });

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
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
      }
    },
    [hydratedCareer, firebaseUser, profile, saveCareerCloud, pushClubNotification]
  );

  const handleCompleteFriendly = useCallback(
    async (userMatch: MatchResultSummary) => {
      if (!hydratedCareer || !firebaseUser || !profile) return;
      const isUserHome = userMatch.homeClubId === hydratedCareer.clubId;
      const myGoals = isUserHome ? userMatch.homeGoals : userMatch.awayGoals;
      const oppGoals = isUserHome ? userMatch.awayGoals : userMatch.homeGoals;
      const won = myGoals > oppGoals;
      const drawn = myGoals === oppGoals;

      const starterSet = new Set(hydratedCareer.tactics.slots.map((s) => s.playerId));
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
                INITIAL_PLAYERS
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
      if (hasFirestoreQuotaExceeded()) return;

      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid), {
          matchesPlayed: (profile.matchesPlayed || 0) + 1,
          wins: (profile.wins || 0) + (won ? 1 : 0),
          draws: (profile.draws || 0) + (drawn ? 1 : 0),
          losses: (profile.losses || 0) + (!won && !drawn ? 1 : 0),
          lastActiveAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });

        const hName = CLUBS.find((c) => c.id === userMatch.homeClubId)?.shortName ?? userMatch.homeClubId;
        const aName = CLUBS.find((c) => c.id === userMatch.awayClubId)?.shortName ?? userMatch.awayClubId;
        await pushClubNotification(
          'match',
          `Giao hữu: ${hName} ${userMatch.homeGoals}-${userMatch.awayGoals} ${aName}`,
          `Hoàn tất trận giao hữu quốc tế · Doanh thu +€${won ? '3.0' : '2.0'}M và tăng tinh thần đội bóng.`
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
      }
    },
    [hydratedCareer, firebaseUser, profile, saveCareerCloud, pushClubNotification]
  );

  const handleStartNextSeason = useCallback(async () => {
    if (!hydratedCareer || !firebaseUser || !profile) return;
    const { nextCareer, summary, prizeM, newTrophiesCount } = createNextSeasonCareer(hydratedCareer);
    await saveCareerCloud(nextCareer);
    if (hasFirestoreQuotaExceeded()) return;

    try {
      await updateDoc(doc(db, 'users', firebaseUser.uid), {
        trophies: (profile.trophies || 0) + newTrophiesCount,
        lastActiveAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });

      const logId = `season-${firebaseUser.uid}-${Date.now()}`;
      await setDoc(doc(db, 'activityLogs', logId), {
        id: logId,
        uid: firebaseUser.uid,
        eventType: 'season_completed',
        clubId: hydratedCareer.clubId,
        detail: `Kết thúc mùa ${summary.season} hạng #${summary.leagueRank}, sang mùa ${nextCareer.season}`,
        valueM: prizeM,
        createdAt: serverTimestamp(),
      });

      await pushClubNotification(
        'season',
        `Khởi tranh mùa giải mới ${nextCareer.season}`,
        `Tổng kết mùa ${summary.season} ở hạng #${summary.leagueRank}. Nhận thưởng +€${prizeM}M, cập nhật chỉ số cầu thủ và mở rộng 20 CLB (38 vòng).`
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.UPDATE, `users/${firebaseUser.uid}`);
    }
  }, [hydratedCareer, firebaseUser, profile, saveCareerCloud, pushClubNotification]);

  const handleMakeOffer = useCallback(
    async (
      player: Player,
      bidM: number,
      wageK: number
    ): Promise<{ ok: boolean; message: string }> => {
      if (!hydratedCareer || !firebaseUser) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu đám mây.' };
      }
      if (hydratedCareer.squad.length >= 45) {
        return { ok: false, message: 'Đội hình đã đạt giới hạn tối đa 45 cầu thủ.' };
      }
      if (bidM > hydratedCareer.transferBudget) {
        return { ok: false, message: 'Ngân sách chuyển nhượng không đủ.' };
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
        wageK,
        stars: 1,
        fitness: 95,
        appearances: 0,
        goals: 0,
        assists: 0,
        transferStatus: 'available',
        morale: 92,
      };

      const nextCareer: CareerSave = {
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget - bidM).toFixed(1)),
        squad: [...hydratedCareer.squad, signedPlayer],
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
      if (hasFirestoreQuotaExceeded()) {
        return { ok: true, message: `Đã chiêu mộ ${player.name} (chế độ cục bộ do hết quota Firestore).` };
      }

      try {
        const logId = `tr-${firebaseUser.uid}-${Date.now()}`;
        await setDoc(doc(db, 'activityLogs', logId), {
          id: logId,
          uid: firebaseUser.uid,
          eventType: 'transfer_completed',
          clubId: hydratedCareer.clubId,
          detail: `Chiêu mộ ${player.name}`,
          valueM: bidM,
          createdAt: serverTimestamp(),
        });

        await pushClubNotification(
          'transfer',
          `Tân binh gia nhập: ${player.name}`,
          `Chiêu mộ thành công ${player.name} (${player.position}, ${player.rating} OVR) với phí €${bidM}M, lương €${wageK}K/tuần.`
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `activityLogs/${firebaseUser.uid}`);
      }

      return {
        ok: true,
        message: `Chúc mừng! ${player.name} đã chính thức gia nhập đội bóng với mức phí €${bidM}M.`,
      };
    },
    [hydratedCareer, firebaseUser, saveCareerCloud, pushClubNotification]
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
      if (!hydratedCareer || hydratedCareer.squad.length <= 13) return;
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
      saveCareerCloud({
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget + feeM).toFixed(1)),
        squad: nextSquad,
        tactics: { ...hydratedCareer.tactics, slots: nextSlots },
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
      if (hydratedCareer.transferBudget < pack.buyPriceM) {
        return {
          ok: false,
          message: `Ngân sách không đủ (Cần €${pack.buyPriceM}M, hiện có €${hydratedCareer.transferBudget.toFixed(1)}M).`,
        };
      }

      const inv = normalizeInventory(hydratedCareer.inventory);
      const nextInv = normalizeInventory({
        ...inv,
        packs: {
          ...inv.packs,
          [packTier]: (inv.packs[packTier] ?? 0) + 1,
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
      if (!plan.canAffordMaterials) {
        return {
          ok: false,
          message: `Thiếu phôi nâng sao (Cần thêm ${plan.shardsToUse - inv.universalShards} Mảnh Ngôi Sao hoặc thẻ bản sao của ${target.shortName}).`,
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
        `Đột phá ${plan.nextStars}★: ${target.name}`,
        `Ghép thẻ thành công ${target.name} lên ${plan.nextStars}★ · OVR ${target.rating} → ${upgraded.rating} (+${plan.step?.attrGain} toàn bộ chỉ số).`
      );

      return {
        ok: true,
        message: `Ghép sao thành công! ${target.name} đạt ${plan.nextStars}★ (OVR ${upgraded.rating}).`,
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
      const shardsPerCard = getCardDismantleShards(sourcePlayer?.rating ?? 78);
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
        `Thu về +${gainedShards} Mảnh Ngôi Sao dùng để bù phôi ghép sao đội hình.`
      );

      return {
        ok: true,
        message: `Đã tách ${count} thẻ ${sourcePlayer?.shortName ?? ''}, nhận +${gainedShards} Mảnh Ngôi Sao.`,
      };
    },
    [hydratedCareer, marketOverrides, saveCareerCloud, pushClubNotification]
  );

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
    if (res === 'granted' && firebaseUser) {
      triggerDeviceNotification(
        'Touchline XI đã bật thông báo',
        'Bạn sẽ nhận thông báo tức thì khi có tin chuyển nhượng nóng.'
      );
      try {
        await updateDoc(doc(db, 'users', firebaseUser.uid, 'private', 'account'), {
          pushEnabled: true,
          updatedAt: serverTimestamp(),
        });
      } catch {
        // Ignore if private doc not created yet
      }
    }
  }, [firebaseUser]);

  // --- ONLINE ARENA STATE & HANDLERS ---
  const existingUserArena = useMemo(
    () => (firebaseUser ? cloudArenaProfiles.find((p) => p.uid === firebaseUser.uid) ?? null : null),
    [cloudArenaProfiles, firebaseUser]
  );

  const userArena = useMemo(() => {
    if (!profile || !hydratedCareer) return null;
    return buildArenaProfileFromCareer(profile, hydratedCareer, existingUserArena);
  }, [profile, hydratedCareer, existingUserArena]);

  const leaderboard = useMemo(
    () => mergeLeaderboardWithBots(cloudArenaProfiles),
    [cloudArenaProfiles]
  );

  const saveArenaProfileCloud = useCallback(async (nextArena: ArenaProfile) => {
    if (hasFirestoreQuotaExceeded()) return;
    const { updatedAt: _omitUpdatedAt, ...rest } = nextArena;
    try {
      await setDoc(
        doc(db, 'arenaProfiles', nextArena.uid),
        sanitizeForFirestore({
          ...rest,
          visibility: 'public',
          updatedAt: serverTimestamp(),
        }) as Record<string, unknown>
      );
    } catch (err) {
      handleFirestoreError(err, OperationType.WRITE, `arenaProfiles/${nextArena.uid}`);
    }
  }, []);

  // Sync user's tactical squad snapshot only when viewing Online Arena and squad differs from cloud
  useEffect(() => {
    if (
      activeTab !== 'online' ||
      !firebaseUser?.emailVerified ||
      !arenaLoadedRef.current ||
      !userArena ||
      hasFirestoreQuotaExceeded()
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
      if (hasFirestoreQuotaExceeded()) return;
      lastSyncedArenaSigRef.current = desiredSig;
      if (existingUserArena) {
        void updateDoc(
          doc(db, 'arenaProfiles', userArena.uid),
          sanitizeForFirestore({
            managerName: userArena.managerName,
            nationality: userArena.nationality,
            clubId: userArena.clubId,
            clubName: userArena.clubName,
            formation: userArena.formation,
            squadOverall: userArena.squadOverall,
            attackRating: userArena.attackRating,
            midfieldRating: userArena.midfieldRating,
            defenseRating: userArena.defenseRating,
            starters: userArena.starters,
            updatedAt: serverTimestamp(),
          }) as Record<string, unknown>
        ).catch((err) => {
          handleFirestoreError(err, OperationType.UPDATE, `arenaProfiles/${userArena.uid}`);
        });
      } else {
        void saveArenaProfileCloud(userArena);
      }
    }, 1500);
  }, [activeTab, firebaseUser, userArena, existingUserArena, saveArenaProfileCloud]);

  const recordCompletedArenaMatch = useCallback(
    async (
      from: ArenaProfile,
      to: ArenaProfile,
      mode: OnlineMatchMode,
      summary: MatchResultSummary,
      winnerUid?: string,
      note?: string
    ) => {
      if (!firebaseUser || hasFirestoreQuotaExceeded()) return;
      const chId = `ch-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      const safeName = (n: string) => {
        const s = (n || 'HLV').trim().slice(0, 60);
        return s.length < 2 ? `${s} XI` : s;
      };
      const docData: Record<string, unknown> = {
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
        report: toCompactMatchReport(summary),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      };
      if (summary.penaltiesHome !== undefined) docData.penaltiesHome = summary.penaltiesHome;
      if (summary.penaltiesAway !== undefined) docData.penaltiesAway = summary.penaltiesAway;
      if (winnerUid) docData.winnerUid = winnerUid.slice(0, 128);
      if (note) docData.note = note.slice(0, 160);

      try {
        await setDoc(doc(db, 'arenaChallenges', chId), sanitizeForFirestore(docData) as Record<string, unknown>);
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `arenaChallenges/${chId}`);
      }
    },
    [firebaseUser]
  );

  const handlePlayRankedMatch = useCallback(async (): Promise<{
    ok: boolean;
    message: string;
    opponent?: ArenaProfile;
    summary?: MatchResultSummary;
    rankedResult?: RankedOutcomeResult;
  }> => {
    if (!firebaseUser || !hydratedCareer || !userArena) {
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
    firebaseUser,
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
      if (!firebaseUser || !hydratedCareer || !userArena) {
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
      firebaseUser,
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
      if (!firebaseUser || !userArena) {
        return { ok: false, message: 'Cần đăng nhập để gửi lời mời.' };
      }
      if (opponent.isBot) {
        return { ok: false, message: 'Hãy bấm "Đá ngay" để tỷ thí trực tiếp với Bot AI.' };
      }
      if (hasFirestoreQuotaExceeded()) {
        return {
          ok: false,
          message: 'Đã hết hạn mức ghi dữ liệu miễn phí hôm nay của Firestore. Hạn mức sẽ tự đặt lại vào ngày mai.',
        };
      }
      const chId = `inv-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 6)}`;
      try {
        await setDoc(doc(db, 'arenaChallenges', chId), {
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
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
        await pushClubNotification(
          'online',
          `Đã gửi lời mời tỷ thí tới ${opponent.managerName}`,
          `Khi ${opponent.managerName} chấp nhận lời mời trong mục Đấu Online, kết quả trận đấu sẽ được cập nhật.`
        );
        return { ok: true, message: `Đã gửi lời mời tỷ thí tới ${opponent.managerName}!` };
      } catch (err) {
        handleFirestoreError(err, OperationType.CREATE, `arenaChallenges/${chId}`);
        return { ok: false, message: 'Không thể gửi lời mời tỷ thí lúc này.' };
      }
    },
    [firebaseUser, userArena, pushClubNotification]
  );

  const handleRespondChallengeInvite = useCallback(
    async (
      ch: ArenaChallenge,
      accept: boolean
    ): Promise<{ ok: boolean; message: string; summary?: MatchResultSummary }> => {
      if (!firebaseUser || !userArena || !hydratedCareer) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu.' };
      }
      if (hasFirestoreQuotaExceeded()) {
        return {
          ok: false,
          message: 'Đã hết hạn mức ghi dữ liệu miễn phí hôm nay của Firestore. Hạn mức sẽ tự đặt lại vào ngày mai.',
        };
      }
      if (!accept) {
        try {
          await updateDoc(doc(db, 'arenaChallenges', ch.id), {
            status: 'declined',
            updatedAt: serverTimestamp(),
          });
          return { ok: true, message: `Đã từ chối lời mời từ ${ch.fromManagerName}.` };
        } catch (err) {
          handleFirestoreError(err, OperationType.UPDATE, `arenaChallenges/${ch.id}`);
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

      const updatePayload: Record<string, unknown> = {
        status: 'completed',
        homeGoals: summary.homeGoals,
        awayGoals: summary.awayGoals,
        report: toCompactMatchReport(summary),
        updatedAt: serverTimestamp(),
      };
      if (summary.penaltiesHome !== undefined) updatePayload.penaltiesHome = summary.penaltiesHome;
      if (summary.penaltiesAway !== undefined) updatePayload.penaltiesAway = summary.penaltiesAway;
      if (winnerUid) updatePayload.winnerUid = winnerUid;

      try {
        await updateDoc(
          doc(db, 'arenaChallenges', ch.id),
          sanitizeForFirestore(updatePayload) as Record<string, unknown>
        );
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `arenaChallenges/${ch.id}`);
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
      firebaseUser,
      userArena,
      hydratedCareer,
      leaderboard,
      saveArenaProfileCloud,
      pushClubNotification,
    ]
  );

  const handleCancelChallengeInvite = useCallback(
    async (challengeId: string): Promise<{ ok: boolean; message: string }> => {
      if (hasFirestoreQuotaExceeded()) {
        return {
          ok: false,
          message: 'Đã hết hạn mức ghi dữ liệu miễn phí hôm nay của Firestore.',
        };
      }
      try {
        await updateDoc(doc(db, 'arenaChallenges', challengeId), {
          status: 'cancelled',
          updatedAt: serverTimestamp(),
        });
        return { ok: true, message: 'Đã hủy lời mời tỷ thí.' };
      } catch (err) {
        handleFirestoreError(err, OperationType.UPDATE, `arenaChallenges/${challengeId}`);
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
      if (!firebaseUser || !userArena) {
        return { ok: false, message: 'Chưa sẵn sàng dữ liệu tài khoản.' };
      }
      if (target.uid === userArena.uid) {
        return { ok: false, message: 'Không thể kết bạn với chính mình.' };
      }
      if (hasFirestoreQuotaExceeded()) {
        return {
          ok: false,
          message: 'Đã hết hạn mức ghi dữ liệu miễn phí hôm nay của Firestore. Hạn mức sẽ tự đặt lại vào ngày mai.',
        };
      }
      const fId = getFriendshipDocId(userArena.uid, target.uid);
      const status = target.isBot ? 'accepted' : 'pending';
      try {
        await setDoc(doc(db, 'friendships', fId), {
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
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
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
        handleFirestoreError(err, OperationType.CREATE, `friendships/${fId}`);
        return { ok: false, message: 'Không thể gửi lời mời kết bạn lúc này.' };
      }
    },
    [firebaseUser, userArena, pushClubNotification]
  );

  const handleRespondFriendRequest = useCallback(
    async (friendship: Friendship, accept: boolean): Promise<{ ok: boolean; message: string }> => {
      try {
        await updateDoc(doc(db, 'friendships', friendship.id), {
          status: accept ? 'accepted' : 'declined',
          updatedAt: serverTimestamp(),
        });
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
        handleFirestoreError(err, OperationType.UPDATE, `friendships/${friendship.id}`);
        return { ok: false, message: 'Không thể phản hồi lời mời kết bạn.' };
      }
    },
    [pushClubNotification]
  );

  const handleRemoveFriendship = useCallback(
    async (friendshipId: string): Promise<{ ok: boolean; message: string }> => {
      try {
        await deleteDoc(doc(db, 'friendships', friendshipId));
        return { ok: true, message: 'Đã cập nhật danh sách bạn bè.' };
      } catch (err) {
        handleFirestoreError(err, OperationType.DELETE, `friendships/${friendshipId}`);
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
          <p className="text-xs text-slate-400">Đang đồng bộ dữ liệu đám mây...</p>
        </div>
      </div>
    );
  }

  if (!firebaseUser || !firebaseUser.emailVerified || needsProfile) {
    return (
      <AuthOnboarding
        firebaseUser={firebaseUser}
        needsProfile={needsProfile}
        onCompleteOnboarding={handleCompleteOnboarding}
        onEmailVerifiedRefresh={async () => {
          if (auth.currentUser) {
            await auth.currentUser.reload();
            const refreshed = auth.currentUser;
            setFirebaseUser({ ...refreshed } as User);
            if (refreshed.emailVerified) {
              const snap = await getDoc(doc(db, 'users', refreshed.uid));
              if (!snap.exists()) {
                setNeedsProfile(true);
              } else {
                setProfile(snap.data() as UserProfile);
                setNeedsProfile(false);
              }
            }
          }
        }}
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
            onClick={() => signOut(auth)}
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
          <p className="text-xs text-slate-400">Đang tải câu lạc bộ từ Firebase...</p>
        </div>
      </div>
    );
  }

  const currentClub = CLUBS.find((c) => c.id === hydratedCareer.clubId) ?? CLUBS[0];
  const unopenedPackCount = getTotalUnopenedPacks(hydratedCareer.inventory);
  const onlineBadgeCount =
    arenaChallenges.filter(
      (c) => c.toUid === firebaseUser.uid && c.status === 'pending'
    ).length +
    friendships.filter(
      (f) => f.recipientUid === firebaseUser.uid && f.status === 'pending'
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
            onClick={() => signOut(auth)}
            className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
            title="Đăng xuất"
            aria-label="Đăng xuất"
          >
            <LogOut className="w-4 h-4" />
          </button>
        </div>
      </header>

      {/* Firestore Daily Write Quota Notice Banner */}
      {quotaExceeded && !quotaBannerDismissed && (
        <div className="bg-amber-500/15 border-b border-amber-400/40 px-4 py-2.5 text-xs text-amber-100">
          <div className="max-w-7xl mx-auto flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div className="space-y-0.5">
              <p className="font-bold text-amber-300">
                Đã chạm hạn mức ghi dữ liệu miễn phí hằng ngày của Firestore (Free daily write units).
              </p>
              <p className="text-[11px] text-amber-100/90">
                Hạn mức sẽ tự động đặt lại vào ngày hôm sau. Bạn vẫn có thể chơi cục bộ trong phiên hiện tại (thay đổi mới tạm chưa lưu lên đám mây). Xem chi tiết gói{' '}
                <a
                  href="https://firebase.google.com/pricing#cloud-firestore"
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-semibold text-white"
                >
                  Spark / Enterprise tại đây
                </a>{' '}
                hoặc mở{' '}
                <a
                  href={FIRESTORE_QUOTA_UPGRADE_URL}
                  target="_blank"
                  rel="noreferrer"
                  className="underline font-semibold text-white"
                >
                  Firebase Console
                </a>
                .
              </p>
            </div>
            <button
              type="button"
              onClick={() => setQuotaBannerDismissed(true)}
              className="self-start sm:self-center px-2.5 py-1 rounded-lg bg-amber-400/20 hover:bg-amber-400/30 text-amber-200 font-semibold shrink-0"
            >
              Ẩn thông báo
            </button>
          </div>
        </div>
      )}

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
              pushPermission={pushPermission}
              onEnablePush={handleEnablePush}
              onNavigateTab={(t) => setActiveTab(t === 'club' ? 'home' : t)}
              onSelectPlayer={setSelectedPlayer}
              onUpdateTraining={handleUpdateTraining}
              onRecoverPlayerFitness={handleRecoverPlayerFitness}
              onRecoverSquadFitness={handleRecoverSquadFitness}
              onStartNextSeason={handleStartNextSeason}
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
              onUseFitnessBooster={handleUseFitnessBooster}
            />
          )}

          {activeTab === 'online' && userArena && (
            <OnlineArenaView
              currentUid={firebaseUser.uid}
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
              currentAdminUid={firebaseUser.uid}
              news={news}
              notifications={notifications}
              marketOverrides={marketOverrides}
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
          inventory={hydratedCareer.inventory}
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
