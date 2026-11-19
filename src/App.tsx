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
} from 'firebase/firestore';
import {
  ArrowLeftRight,
  Bell,
  Compass,
  Home,
  LogOut,
  Play,
  ShieldCheck,
  Sliders,
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
  applyMatchToStandings,
  createInitialCareer,
  createNextSeasonCareer,
  ensureCareerCompetitions,
  getPlayerRecoveryCostM,
  getSquadRecoveryCostM,
  mergeMatchResultsIntoLeaderboard,
  sortStandings,
  toCompactMatchReport,
} from './lib/careerEngine';
import { auth, db, handleFirestoreError, OperationType } from './lib/firebase';
import {
  getPushPermission,
  requestPushPermission,
  triggerDeviceNotification,
} from './lib/notifications';
import {
  CareerSave,
  ClubNotificationCategory,
  ClubNotificationItem,
  FormationId,
  MarketOverride,
  MatchResultSummary,
  Mentality,
  NewsArticle,
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
const AdminDashboardView = lazy(() =>
  import('./components/AdminDashboardView').then((m) => ({ default: m.AdminDashboardView }))
);

type MainTab = 'home' | 'tactics' | 'match' | 'transfers' | 'admin';

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
  const initialNotifLoadedRef = useRef(false);
  const seenNotifIdsRef = useRef<Set<string>>(new Set());
  const initialClubNotifLoadedRef = useRef(false);
  const seenClubNotifIdsRef = useRef<Set<string>>(new Set());
  const tacticsNotifTimerRef = useRef<number | null>(null);
  const toastTimerRef = useRef<number | null>(null);

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
        setUnreadCount(0);
        initialNotifLoadedRef.current = false;
        initialClubNotifLoadedRef.current = false;
        seenNotifIdsRef.current.clear();
        seenClubNotifIdsRef.current.clear();
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
          setCareer(snap.data() as CareerSave);
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

    return () => {
      unsubCareer();
      unsubProfile();
      unsubNews();
      unsubNotifs();
      unsubClubNotifs();
      unsubOverrides();
    };
  }, [firebaseUser, needsProfile]);

  useEffect(() => {
    return () => {
      if (tacticsNotifTimerRef.current) window.clearTimeout(tacticsNotifTimerRef.current);
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
      initialCareer.tactics.formation = data.preferredFormation;

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
      setCareer(nextCareer);
      try {
        const payload: Record<string, unknown> = {
          clubId: nextCareer.clubId,
          season: nextCareer.season,
          matchweek: nextCareer.matchweek,
          transferBudget: nextCareer.transferBudget,
          wageBudget: nextCareer.wageBudget,
          boardConfidence: nextCareer.boardConfidence,
          fanSupport: nextCareer.fanSupport,
          trainingFocus: nextCareer.trainingFocus,
          trainingIntensity: nextCareer.trainingIntensity,
          tactics: nextCareer.tactics,
          squad: nextCareer.squad,
          standings: nextCareer.standings,
          fixtures: nextCareer.fixtures,
          recentResults: nextCareer.recentResults,
          transferHistory: nextCareer.transferHistory ?? [],
          updatedAt: serverTimestamp(),
        };
        if (nextCareer.competitions) payload.competitions = nextCareer.competitions;
        if (nextCareer.trophyCabinet) payload.trophyCabinet = nextCareer.trophyCabinet;
        if (nextCareer.seasonHistory) payload.seasonHistory = nextCareer.seasonHistory;

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
      saveCareerCloud({ ...hydratedCareer, tactics: nextTactics });
      if (tacticsNotifTimerRef.current) window.clearTimeout(tacticsNotifTimerRef.current);
      tacticsNotifTimerRef.current = window.setTimeout(() => {
        pushClubNotification(
          'tactics',
          `Cập nhật chiến thuật (${nextTactics.formation})`,
          `Áp dụng sơ đồ ${nextTactics.formation}, tâm lý ${nextTactics.mentality}, pressing mức ${nextTactics.pressingIntensity}/5.`
        );
      }, 1500);
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
        recentResults: [
          userMatch,
          ...hydratedCareer.recentResults.filter((r) => r.id !== userMatch.id),
        ].slice(0, 50),
      };

      await saveCareerCloud(nextCareer);

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

      const nextCareer: CareerSave = {
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget + budgetBonus).toFixed(1)),
        boardConfidence: Math.min(100, hydratedCareer.boardConfidence + (trophiesAdded > 0 ? 6 : 0)),
        squad: nextSquad,
        competitions: nextCompsWithStats,
        trophyCabinet: nextCabinet,
        recentResults: userMatch
          ? [userMatch, ...hydratedCareer.recentResults.filter((r) => r.id !== userMatch.id)].slice(
              0,
              50
            )
          : hydratedCareer.recentResults,
      };

      await saveCareerCloud(nextCareer);

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

      const nextCareer: CareerSave = {
        ...hydratedCareer,
        transferBudget: Number((hydratedCareer.transferBudget + (won ? 3.0 : 2.0)).toFixed(1)),
        squad: nextSquad,
        competitions: nextComps,
        recentResults: [
          userMatch,
          ...hydratedCareer.recentResults.filter((r) => r.id !== userMatch.id),
        ].slice(0, 50),
      };

      await saveCareerCloud(nextCareer);

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
      const fallbackId = nextSquad[0]?.id ?? '';
      const nextSlots = hydratedCareer.tactics.slots.map((s) =>
        s.playerId === playerId ? { ...s, playerId: fallbackId } : s
      );
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
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-300">
          {[
            { id: 'home', label: 'Trang chủ' },
            { id: 'tactics', label: 'Chiến thuật' },
            { id: 'match', label: 'Trận đấu' },
            { id: 'transfers', label: 'Chuyển nhượng' },
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
        <div className={`grid ${isAdmin ? 'grid-cols-5' : 'grid-cols-4'} h-[58px] items-center`}>
          <button
            type="button"
            onClick={() => setActiveTab('home')}
            className={`flex flex-col items-center justify-center min-h-[48px] ${
              activeTab === 'home' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            <Home className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-0.5">CLB</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tactics')}
            className={`flex flex-col items-center justify-center min-h-[48px] ${
              activeTab === 'tactics' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            <Sliders className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-0.5">Chiến thuật</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('match')}
            className={`flex flex-col items-center justify-center min-h-[48px] ${
              activeTab === 'match' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            <Play className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-0.5">Trận đấu</span>
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('transfers')}
            className={`flex flex-col items-center justify-center min-h-[48px] ${
              activeTab === 'transfers' ? 'text-emerald-400' : 'text-slate-400'
            }`}
          >
            <ArrowLeftRight className="w-5 h-5" />
            <span className="text-[10px] font-semibold mt-0.5">Chuyển nhượng</span>
          </button>

          {isAdmin && (
            <button
              type="button"
              onClick={() => setActiveTab('admin')}
              className={`flex flex-col items-center justify-center min-h-[48px] ${
                activeTab === 'admin' ? 'text-amber-400' : 'text-slate-400'
              }`}
            >
              <ShieldCheck className="w-5 h-5" />
              <span className="text-[10px] font-semibold mt-0.5">Admin</span>
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
          onClose={() => setSelectedPlayer(null)}
          onToggleTransferList={handleToggleTransferList}
          onRenewContract={handleRenewContract}
          onSellPlayer={handleSellPlayer}
          onRecoverFitness={handleRecoverPlayerFitness}
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
