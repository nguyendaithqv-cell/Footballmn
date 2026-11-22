import React, { useEffect, useMemo, useState } from 'react';
import {
  Activity,
  BarChart3,
  BellRing,
  CheckCircle2,
  Download,
  Globe,
  Newspaper,
  Send,
  Share,
  ShieldAlert,
  Smartphone,
  Trash2,
  TrendingUp,
  UserCheck,
  Users,
  X,
} from 'lucide-react';
import { ALL_CLUBS, CLUBS, INITIAL_PLAYERS } from '../data/footballDatabase';
import { usePWAInstall } from '../hooks/usePWAInstall';
import { ClubBackupBundle } from '../lib/backupEngine';
import {
  deleteLocalNews,
  deleteLocalNotification,
  listLocalActivityLogs,
  listLocalUsers,
  putLocalMarketOverride,
  putLocalNews,
  putLocalNotification,
  updateLocalUserProfile,
} from '../lib/localDb';
import {
  ActivityLog,
  MarketOverride,
  NewsArticle,
  PushNotificationItem,
  UserProfile,
} from '../types/game';
import { BackupRestoreCard } from './BackupRestoreCard';
import { ClubCrest } from './ClubBadgeAndAvatar';

interface AdminDashboardViewProps {
  currentAdminUid: string;
  news: NewsArticle[];
  notifications: PushNotificationItem[];
  marketOverrides: Record<string, MarketOverride>;
  onNewsAdded?: (items: NewsArticle[]) => void;
  onNewsDeleted?: (id: string) => void;
  onMarketOverrideSaved?: (override: MarketOverride) => void;
  onNotificationAdded?: (item: PushNotificationItem) => void;
  onNotificationDeleted?: (id: string) => void;
  onExportBackup: (includeAdminData: boolean) => Promise<void>;
  onRestoreBackup: (
    bundle: ClubBackupBundle,
    restoreAdminData: boolean
  ) => Promise<{ ok: boolean; message: string }>;
}

export const AdminDashboardView: React.FC<AdminDashboardViewProps> = ({
  currentAdminUid,
  news,
  notifications,
  marketOverrides,
  onNewsAdded,
  onNewsDeleted,
  onMarketOverrideSaved,
  onNotificationAdded,
  onNotificationDeleted,
  onExportBackup,
  onRestoreBackup,
}) => {
  const [adminTab, setAdminTab] = useState<'stats' | 'users' | 'content' | 'push'>('stats');
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [logs, setLogs] = useState<ActivityLog[]>([]);
  const [userSearch, setUserSearch] = useState('');

  // Content: New Article form
  const [newsTitle, setNewsTitle] = useState('');
  const [newsSummary, setNewsSummary] = useState('');
  const [newsCategory, setNewsCategory] = useState<NewsArticle['category']>('transfer');
  const [newsPlayer, setNewsPlayer] = useState('');
  const [newsClubTag, setNewsClubTag] = useState('');
  const [newsFee, setNewsFee] = useState('');
  const [newsBreaking, setNewsBreaking] = useState(true);
  const [publishingNews, setPublishingNews] = useState(false);
  const [syncingWebNews, setSyncingWebNews] = useState(false);

  // Market Override editor
  const [selectedOverridePlayerId, setSelectedOverridePlayerId] = useState(INITIAL_PLAYERS[13].id);
  const targetPlayer = useMemo(
    () => INITIAL_PLAYERS.find((p) => p.id === selectedOverridePlayerId) ?? INITIAL_PLAYERS[0],
    [selectedOverridePlayerId]
  );
  const [ovClubId, setOvClubId] = useState(targetPlayer.clubId);
  const [ovValueM, setOvValueM] = useState(targetPlayer.marketValueM);
  const [ovRating, setOvRating] = useState(targetPlayer.rating);
  const [ovStatus, setOvStatus] = useState<MarketOverride['transferStatus']>(
    targetPlayer.transferStatus
  );

  // Push Notification Broadcast form
  const [pushTitle, setPushTitle] = useState('');
  const [pushBody, setPushBody] = useState('');
  const [pushCategory, setPushCategory] = useState<PushNotificationItem['category']>('transfer');
  const [sendingPush, setSendingPush] = useState(false);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);
  const { isInstallable, isInstalled, isIOS, install } = usePWAInstall();
  const [showInstallGuide, setShowInstallGuide] = useState(false);

  const handleInstallAppClick = async () => {
    if (isInstallable) {
      const accepted = await install();
      if (accepted) {
        setStatusBanner('Đã cài đặt Touchline XI lên màn hình chính thiết bị!');
      }
      return;
    }
    setShowInstallGuide(true);
  };

  const currentOv = marketOverrides[targetPlayer?.id];
  useEffect(() => {
    if (!targetPlayer) return;
    setOvClubId(currentOv?.clubId ?? targetPlayer.clubId);
    setOvValueM(currentOv?.marketValueM ?? targetPlayer.marketValueM);
    setOvRating(currentOv?.rating ?? targetPlayer.rating);
    setOvStatus(currentOv?.transferStatus ?? targetPlayer.transferStatus);
  }, [targetPlayer?.id, currentOv?.clubId, currentOv?.marketValueM, currentOv?.rating, currentOv?.transferStatus]);

  // Load local users & activity logs on mount
  useEffect(() => {
    let cancelled = false;
    const loadAdminData = async () => {
      try {
        const [userList, logList] = await Promise.all([
          listLocalUsers(),
          listLocalActivityLogs(40),
        ]);
        if (cancelled) return;
        setUsers(userList);
        setLogs(logList);
      } catch (err) {
        setStatusBanner(err instanceof Error ? err.message : 'Không thể tải dữ liệu Admin cục bộ.');
      }
    };
    void loadAdminData();
    return () => {
      cancelled = true;
    };
  }, []);

  const stats = useMemo(() => {
    const totalUsers = users.length;
    const activeUsers = users.filter((u) => u.status === 'active').length;
    const totalMatches = users.reduce((s, u) => s + (u.matchesPlayed || 0), 0);
    const totalWins = users.reduce((s, u) => s + (u.wins || 0), 0);
    const transferLogs = logs.filter((l) => l.eventType === 'transfer_completed');
    const transferVolume = transferLogs.reduce((s, l) => s + (l.valueM || 0), 0);

    const clubCountMap = new Map<string, number>();
    users.forEach((u) => {
      clubCountMap.set(u.clubId, (clubCountMap.get(u.clubId) ?? 0) + 1);
    });
    const topClubs = CLUBS.map((c) => ({
      club: c,
      count: clubCountMap.get(c.id) ?? 0,
    }))
      .sort((a, b) => b.count - a.count)
      .slice(0, 6);

    return {
      totalUsers,
      activeUsers,
      totalMatches,
      totalWins,
      transferCount: transferLogs.length,
      transferVolume,
      topClubs,
    };
  }, [users, logs]);

  const handleToggleUserStatus = async (u: UserProfile) => {
    if (u.uid === currentAdminUid) return;
    const nextStatus = u.status === 'active' ? 'suspended' : 'active';
    try {
      await updateLocalUserProfile(u.uid, { status: nextStatus });
      setUsers((prev) =>
        prev.map((item) => (item.uid === u.uid ? { ...item, status: nextStatus } : item))
      );
      setStatusBanner(`Đã chuyển trạng thái ${u.managerName} thành ${nextStatus}.`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Không thể cập nhật trạng thái.');
    }
  };

  const handleToggleUserRole = async (u: UserProfile) => {
    if (u.uid === currentAdminUid) return;
    const nextRole = u.role === 'admin' ? 'manager' : 'admin';
    try {
      await updateLocalUserProfile(u.uid, { role: nextRole });
      setUsers((prev) =>
        prev.map((item) => (item.uid === u.uid ? { ...item, role: nextRole } : item))
      );
      setStatusBanner(`Đã cập nhật quyền của ${u.managerName} thành ${nextRole}.`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Không thể cập nhật quyền tài khoản.');
    }
  };

  const handlePublishNews = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newsTitle.trim() || !newsSummary.trim()) return;
    setPublishingNews(true);
    const id = `news-${Date.now()}`;
    const newItem: NewsArticle = {
      id,
      title: newsTitle.trim().slice(0, 175),
      summary: newsSummary.trim().slice(0, 1150),
      category: newsCategory,
      playerName: newsPlayer.trim().slice(0, 75),
      clubTag: newsClubTag.trim().slice(0, 60),
      feeText: newsFee.trim().slice(0, 40),
      isBreaking: newsBreaking,
      authorUid: currentAdminUid,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };
    try {
      await putLocalNews(newItem);
      onNewsAdded?.([newItem]);
      setNewsTitle('');
      setNewsSummary('');
      setNewsPlayer('');
      setNewsClubTag('');
      setNewsFee('');
      setStatusBanner('Đã lưu bản tin mới vào thiết bị.');
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Không thể đăng bản tin.');
    } finally {
      setPublishingNews(false);
    }
  };

  const handleSyncWebNewsToFirestore = async () => {
    setSyncingWebNews(true);
    setStatusBanner(null);
    try {
      const res = await fetch('/api/transfers/live', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ league: 'Premier League, La Liga, Champions League' }),
      });
      const data = await res.json();
      if (!res.ok || !Array.isArray(data.items)) {
        setStatusBanner(data.error || 'Không lấy được tin chuyển nhượng trực tiếp.');
        return;
      }
      const firstSource = Array.isArray(data.sources) && data.sources[0] ? data.sources[0] : null;
      const addedArticles: NewsArticle[] = [];
      let count = 0;
      for (const item of data.items.slice(0, 3)) {
        const id = `live-${Date.now()}-${count}`;
        const article: NewsArticle = {
          id,
          title: String(item.title || 'Tin chuyển nhượng mới').slice(0, 175),
          summary: String(item.summary || 'Cập nhật thị trường chuyển nhượng quốc tế.').slice(0, 1150),
          category: ['transfer', 'rumor', 'official'].includes(item.category)
            ? item.category
            : 'transfer',
          playerName: String(item.playerName || '').slice(0, 75),
          clubTag: String(item.clubTag || 'Thị trường Quốc tế').slice(0, 60),
          feeText: String(item.feeText || '').slice(0, 40),
          sourceTitle: firstSource?.title ? String(firstSource.title).slice(0, 110) : 'Live Web',
          sourceUrl: firstSource?.uri ? String(firstSource.uri).slice(0, 380) : '',
          isBreaking: Boolean(item.isBreaking),
          authorUid: currentAdminUid,
          createdAt: Date.now(),
          updatedAt: Date.now(),
        };
        await putLocalNews(article);
        addedArticles.push(article);
        count++;
      }
      if (addedArticles.length > 0) {
        onNewsAdded?.(addedArticles);
      }
      setStatusBanner(`Đã đồng bộ và lưu ${count} tin chuyển nhượng thực tế mới nhất vào thiết bị.`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Lỗi đồng bộ tin web (cần kết nối mạng).');
    } finally {
      setSyncingWebNews(false);
    }
  };

  const handleSaveMarketOverride = async (e: React.FormEvent) => {
    e.preventDefault();
    const overrideItem: MarketOverride = {
      playerId: targetPlayer.id,
      clubId: ovClubId,
      marketValueM: Number(ovValueM),
      rating: Math.round(Number(ovRating)),
      transferStatus: ovStatus,
      updatedBy: currentAdminUid,
      updatedAt: Date.now(),
    };
    try {
      await putLocalMarketOverride(overrideItem);
      onMarketOverrideSaved?.(overrideItem);
      setStatusBanner(`Đã cập nhật giá trị thị trường của ${targetPlayer.name} trên thiết bị.`);
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Không thể lưu cập nhật thị trường.');
    }
  };

  const handleSendPushBroadcast = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!pushTitle.trim() || !pushBody.trim()) return;
    setSendingPush(true);
    const id = `push-${Date.now()}`;
    const item: PushNotificationItem = {
      id,
      title: pushTitle.trim().slice(0, 135),
      body: pushBody.trim().slice(0, 480),
      category: pushCategory,
      authorUid: currentAdminUid,
      createdAt: Date.now(),
    };
    try {
      await putLocalNotification(item);
      onNotificationAdded?.(item);
      setPushTitle('');
      setPushBody('');
      setStatusBanner('Đã phát thông báo tới các tài khoản trên thiết bị.');
    } catch (err) {
      setStatusBanner(err instanceof Error ? err.message : 'Không thể gửi thông báo.');
    } finally {
      setSendingPush(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <p className="text-xs text-amber-400 font-semibold">Bảng điều khiển Quản trị viên</p>
          <h2 className="font-display text-2xl font-extrabold text-white">
            Quản lý Hệ thống & Dữ liệu Cục bộ
          </h2>
        </div>

        <div className="grid grid-cols-4 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
          {[
            { id: 'stats', label: 'Thống kê' },
            { id: 'users', label: 'Người dùng' },
            { id: 'content', label: 'Nội dung' },
            { id: 'push', label: 'Thông báo' },
          ].map((t) => (
            <button
              key={t.id}
              type="button"
              onClick={() => setAdminTab(t.id as typeof adminTab)}
              className={`h-10 px-3 rounded-lg text-xs font-semibold ${
                adminTab === t.id ? 'bg-amber-500 text-slate-950' : 'text-slate-300'
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>
      </div>

      {statusBanner && (
        <div className="rounded-xl bg-emerald-500/15 border border-emerald-500/35 px-4 py-3 text-xs text-emerald-200">
          {statusBanner}
        </div>
      )}

      {adminTab === 'stats' && (
        <div className="space-y-4">
          {/* 4 Summary Metrics */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4">
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Users className="w-4 h-4 text-emerald-400" /> Tổng HLV đăng ký
              </p>
              <p className="font-mono-num text-3xl font-extrabold text-white mt-1">
                {stats.totalUsers}
              </p>
              <p className="text-[11px] text-emerald-400 mt-1">
                {stats.activeUsers} tài khoản hoạt động
              </p>
            </div>
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4">
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <Activity className="w-4 h-4 text-sky-400" /> Tổng trận đã đấu
              </p>
              <p className="font-mono-num text-3xl font-extrabold text-white mt-1">
                {stats.totalMatches}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">
                {stats.totalWins} chiến thắng được ghi nhận
              </p>
            </div>
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4">
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <TrendingUp className="w-4 h-4 text-amber-400" /> Giao dịch chuyển nhượng
              </p>
              <p className="font-mono-num text-3xl font-extrabold text-white mt-1">
                {stats.transferCount}
              </p>
              <p className="text-[11px] font-mono-num text-amber-400 mt-1">
                Tổng giá trị €{stats.transferVolume.toFixed(1)}M
              </p>
            </div>
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4">
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <BarChart3 className="w-4 h-4 text-emerald-400" /> Tin tức & Thông báo
              </p>
              <p className="font-mono-num text-3xl font-extrabold text-white mt-1">
                {news.length} / {notifications.length}
              </p>
              <p className="text-[11px] text-slate-400 mt-1">Bản tin / Lệnh đẩy đã phát</p>
            </div>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            {/* Club Popularity Bar Chart */}
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">Câu lạc bộ được lựa chọn nhiều nhất</h3>
              <div className="space-y-2.5">
                {stats.topClubs.map(({ club, count }) => {
                  const pct = stats.totalUsers
                    ? Math.round((count / stats.totalUsers) * 100)
                    : 0;
                  return (
                    <div key={club.id} className="space-y-1">
                      <div className="flex items-center justify-between text-xs">
                        <div className="flex items-center gap-2">
                          <ClubCrest club={club} size={20} />
                          <span className="text-slate-200 font-medium">{club.name}</span>
                        </div>
                        <span className="font-mono-num text-emerald-400 font-bold">
                          {count} ({pct}%)
                        </span>
                      </div>
                      <div className="h-2 rounded-full bg-[#0B1117] overflow-hidden">
                        <div
                          className="h-full bg-emerald-500 rounded-full"
                          style={{ width: `${Math.max(4, pct)}%` }}
                        />
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            {/* Recent Telemetry Activity Logs */}
            <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
              <h3 className="text-sm font-bold text-white">Nhật ký hoạt động gần đây</h3>
              <div className="space-y-2 max-h-[260px] overflow-y-auto">
                {logs.length === 0 ? (
                  <p className="text-xs text-slate-400">Chưa có nhật ký hoạt động.</p>
                ) : (
                  logs.slice(0, 12).map((log) => (
                    <div
                      key={log.id}
                      className="rounded-xl bg-[#0B1117] border border-white/5 px-3 py-2 text-xs flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <p className="font-semibold text-white truncate">
                          {log.eventType} · {log.clubId}
                        </p>
                        <p className="text-[11px] text-slate-400 truncate">
                          {log.detail || log.uid}
                        </p>
                      </div>
                      {typeof log.valueM === 'number' && log.valueM > 0 && (
                        <span className="font-mono-num text-amber-400 font-bold shrink-0">
                          €{log.valueM}M
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {adminTab === 'users' && (
        <div className="space-y-3">
          <input
            type="text"
            value={userSearch}
            onChange={(e) => setUserSearch(e.target.value)}
            placeholder="Tìm theo tên HLV hoặc tên CLB..."
            className="w-full h-11 px-4 rounded-xl bg-[#121B24] border border-white/10 text-sm text-white focus:outline-none focus:border-amber-400"
          />

          <div className="space-y-2.5">
            {users
              .filter(
                (u) =>
                  !userSearch.trim() ||
                  u.managerName.toLowerCase().includes(userSearch.toLowerCase()) ||
                  u.clubName.toLowerCase().includes(userSearch.toLowerCase())
              )
              .map((u) => (
                <div
                  key={u.uid}
                  className="rounded-2xl bg-[#121B24] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                >
                  <div>
                    <div className="flex items-center gap-2">
                      <span className="font-bold text-sm text-white">{u.managerName}</span>
                      <span className="text-xs font-mono-num text-amber-400">
                        {u.role.toUpperCase()} · {u.status.toUpperCase()}
                      </span>
                    </div>
                    <p className="text-xs text-slate-400 mt-0.5">
                      CLB: {u.clubName} · Sơ đồ {u.preferredFormation} · Thành tích{' '}
                      <span className="font-mono-num text-slate-200">
                        {u.wins}T-{u.draws}H-{u.losses}B
                      </span>
                    </p>
                  </div>

                  {u.uid !== currentAdminUid && (
                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() => handleToggleUserRole(u)}
                        className="h-10 px-3 rounded-xl bg-slate-800 hover:bg-slate-700 text-xs font-semibold text-sky-300 flex items-center gap-1"
                      >
                        <UserCheck className="w-3.5 h-3.5" />
                        {u.role === 'admin' ? 'Hạ quyền' : 'Lên Admin'}
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggleUserStatus(u)}
                        className={`h-10 px-3 rounded-xl text-xs font-semibold flex items-center gap-1 ${
                          u.status === 'active'
                            ? 'bg-red-500/15 text-red-300 border border-red-500/30'
                            : 'bg-emerald-500/15 text-emerald-300 border border-emerald-500/30'
                        }`}
                      >
                        <ShieldAlert className="w-3.5 h-3.5" />
                        {u.status === 'active' ? 'Tạm khóa' : 'Mở khóa'}
                      </button>
                    </div>
                  )}
                </div>
              ))}
          </div>
        </div>
      )}

      {adminTab === 'content' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* Publish Transfer News */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
                <Newspaper className="w-4 h-4 text-emerald-400" />
                Đăng bản tin mới
              </h3>
              <button
                type="button"
                disabled={syncingWebNews}
                onClick={handleSyncWebNewsToFirestore}
                className="h-9 px-3 rounded-lg bg-emerald-500/15 border border-emerald-500/30 text-xs font-semibold text-emerald-300 flex items-center gap-1.5"
              >
                <Globe className="w-3.5 h-3.5" />
                {syncingWebNews ? 'Đang đồng bộ...' : 'Lấy tin Web thực tế'}
              </button>
            </div>

            <form onSubmit={handlePublishNews} className="space-y-3">
              <input
                type="text"
                required
                maxLength={175}
                value={newsTitle}
                onChange={(e) => setNewsTitle(e.target.value)}
                placeholder="Tiêu đề bản tin chuyển nhượng..."
                className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white"
              />
              <textarea
                required
                rows={3}
                maxLength={1150}
                value={newsSummary}
                onChange={(e) => setNewsSummary(e.target.value)}
                placeholder="Nội dung chi tiết thương vụ..."
                className="w-full p-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white"
              />
              <div className="grid grid-cols-2 gap-2">
                <select
                  value={newsCategory}
                  onChange={(e) => setNewsCategory(e.target.value as NewsArticle['category'])}
                  className="h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-xs text-white"
                >
                  <option value="transfer">Chuyển nhượng</option>
                  <option value="rumor">Tin đồn</option>
                  <option value="official">Chính thức</option>
                  <option value="matchday">Trận đấu</option>
                  <option value="injury">Chấn thương</option>
                </select>
                <input
                  type="text"
                  maxLength={40}
                  value={newsFee}
                  onChange={(e) => setNewsFee(e.target.value)}
                  placeholder="Phí (VD: €80M)"
                  className="h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-xs text-white"
                />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <input
                  type="text"
                  maxLength={75}
                  value={newsPlayer}
                  onChange={(e) => setNewsPlayer(e.target.value)}
                  placeholder="Tên cầu thủ"
                  className="h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-xs text-white"
                />
                <input
                  type="text"
                  maxLength={60}
                  value={newsClubTag}
                  onChange={(e) => setNewsClubTag(e.target.value)}
                  placeholder="CLB liên quan"
                  className="h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-xs text-white"
                />
              </div>
              <label className="flex items-center gap-2 text-xs text-slate-300">
                <input
                  type="checkbox"
                  checked={newsBreaking}
                  onChange={(e) => setNewsBreaking(e.target.checked)}
                  className="accent-amber-500"
                />
                Đánh dấu Tin Nóng (Breaking)
              </label>
              <button
                type="submit"
                disabled={publishingNews}
                className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm"
              >
                {publishingNews ? 'Đang đăng...' : 'Xuất bản bản tin'}
              </button>
            </form>

            {/* Existing news delete list */}
            <div className="space-y-2 pt-2 border-t border-white/10 max-h-[200px] overflow-y-auto">
              {news.map((n) => (
                <div
                  key={n.id}
                  className="flex items-center justify-between gap-2 rounded-xl bg-[#0B1117] px-3 py-2 text-xs"
                >
                  <span className="text-slate-200 truncate">{n.title}</span>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteLocalNews(n.id);
                        onNewsDeleted?.(n.id);
                      } catch (err) {
                        setStatusBanner(err instanceof Error ? err.message : 'Không thể xóa bản tin.');
                      }
                    }}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center text-red-400 hover:text-red-300"
                    aria-label="Xóa tin"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Market Overrides Editor */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-4">
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <TrendingUp className="w-4 h-4 text-amber-400" />
              Cập nhật Thị trường Cầu thủ Thực tế
            </h3>

            <form onSubmit={handleSaveMarketOverride} className="space-y-3">
              <div className="space-y-1">
                <label className="text-xs text-slate-400">Chọn cầu thủ</label>
                <select
                  value={selectedOverridePlayerId}
                  onChange={(e) => setSelectedOverridePlayerId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white"
                >
                  {INITIAL_PLAYERS.map((p) => (
                    <option key={p.id} value={p.id}>
                      {p.name} ({p.position} · OVR {p.rating})
                    </option>
                  ))}
                </select>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">CLB hiện tại (Cập nhật chuyển nhượng)</label>
                <select
                  value={ovClubId}
                  onChange={(e) => setOvClubId(e.target.value)}
                  className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white"
                >
                  {ALL_CLUBS.map((c) => (
                    <option key={c.id} value={c.id}>
                      {c.name}
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-2.5">
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Giá thị trường (€M)</label>
                  <input
                    type="number"
                    min={1}
                    max={500}
                    step={0.5}
                    value={ovValueM}
                    onChange={(e) => setOvValueM(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm font-mono-num text-white"
                  />
                </div>
                <div className="space-y-1">
                  <label className="text-xs text-slate-400">Chỉ số OVR (45-99)</label>
                  <input
                    type="number"
                    min={45}
                    max={99}
                    value={ovRating}
                    onChange={(e) => setOvRating(Number(e.target.value))}
                    className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm font-mono-num text-white"
                  />
                </div>
              </div>

              <div className="space-y-1">
                <label className="text-xs text-slate-400">Trạng thái chuyển nhượng</label>
                <select
                  value={ovStatus}
                  onChange={(e) =>
                    setOvStatus(e.target.value as MarketOverride['transferStatus'])
                  }
                  className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white"
                >
                  <option value="available">Sẵn sàng đàm phán</option>
                  <option value="listed">Đang rao bán (Giảm giá)</option>
                  <option value="untouchable">Không thể chạm tới</option>
                  <option value="loan">Cho mượn</option>
                </select>
              </div>

              <button
                type="submit"
                className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm"
              >
                Lưu cập nhật Thị trường
              </button>
            </form>
          </div>
        </div>
      )}

      {adminTab === 'push' && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          <form
            onSubmit={handleSendPushBroadcast}
            className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3.5"
          >
            <h3 className="text-sm font-bold text-white flex items-center gap-1.5">
              <BellRing className="w-4 h-4 text-amber-400" />
              Gửi Thông báo Đẩy tới tất cả Người dùng
            </h3>
            <input
              type="text"
              required
              maxLength={135}
              value={pushTitle}
              onChange={(e) => setPushTitle(e.target.value)}
              placeholder="Tiêu đề thông báo (VD: Bom tấn chuyển nhượng vừa nổ!)"
              className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white"
            />
            <textarea
              required
              rows={3}
              maxLength={480}
              value={pushBody}
              onChange={(e) => setPushBody(e.target.value)}
              placeholder="Nội dung thông báo sẽ hiển thị trực tiếp trên thiết bị người chơi..."
              className="w-full p-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white"
            />
            <select
              value={pushCategory}
              onChange={(e) =>
                setPushCategory(e.target.value as PushNotificationItem['category'])
              }
              className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-xs text-white"
            >
              <option value="transfer">Thị trường chuyển nhượng</option>
              <option value="matchday">Lịch thi đấu / Sự kiện</option>
              <option value="urgent">Khẩn cấp</option>
              <option value="system">Thông báo hệ thống</option>
            </select>
            <button
              type="submit"
              disabled={sendingPush}
              className="w-full h-12 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2"
            >
              <Send className="w-4 h-4" />
              {sendingPush ? 'Đang phát thông báo...' : 'Phát Thông báo Đẩy ngay'}
            </button>
          </form>

          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-3">
            <h3 className="text-sm font-bold text-white">Lịch sử Thông báo đã gửi</h3>
            <div className="space-y-2 max-h-[300px] overflow-y-auto">
              {notifications.map((n) => (
                <div
                  key={n.id}
                  className="rounded-xl bg-[#0B1117] border border-white/5 p-3 flex items-start justify-between gap-2"
                >
                  <div className="min-w-0">
                    <p className="text-[11px] text-amber-400 font-semibold uppercase">{n.category}</p>
                    <p className="text-xs font-bold text-white mt-0.5">{n.title}</p>
                    <p className="text-xs text-slate-400 mt-0.5">{n.body}</p>
                  </div>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await deleteLocalNotification(n.id);
                        onNotificationDeleted?.(n.id);
                      } catch (err) {
                        setStatusBanner(err instanceof Error ? err.message : 'Không thể xóa thông báo.');
                      }
                    }}
                    className="min-w-[36px] min-h-[36px] flex items-center justify-center text-red-400"
                    aria-label="Xóa thông báo"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Full Backup & Restore Section */}
      <BackupRestoreCard
        title="Sao lưu & Phục hồi Toàn bộ Dữ liệu (CLB + Hệ thống)"
        description="Xuất toàn bộ sự nghiệp CLB, đội hình, túi đồ, xếp hạng và dữ liệu Admin (Tin tức, Thị trường, Thông báo) ra file .json để chuyển qua tài khoản hoặc bản remix mới."
        isAdmin={true}
        onExportBackup={onExportBackup}
        onRestoreBackup={onRestoreBackup}
      />

      {/* Mobile PWA App Install Section at bottom of Admin */}
      <div className="rounded-2xl bg-[#121B24] border border-emerald-500/25 p-4 space-y-3">
        <div className="flex items-start gap-3">
          <div className="w-10 h-10 rounded-xl bg-emerald-500/15 border border-emerald-500/30 flex items-center justify-center shrink-0">
            <Smartphone className="w-5 h-5 text-emerald-400" />
          </div>
          <div className="min-w-0 flex-1">
            <h3 className="text-sm font-bold text-white">Cài đặt App lên Điện thoại</h3>
            <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">
              Thêm Touchline XI ra màn hình chính để mở toàn màn hình như ứng dụng thật trên Android & iPhone.
            </p>
          </div>
        </div>

        {isInstalled ? (
          <div className="w-full min-h-[44px] px-4 py-2.5 rounded-xl bg-emerald-500/15 border border-emerald-500/30 text-emerald-300 text-xs font-semibold flex items-center justify-center gap-2">
            <CheckCircle2 className="w-4 h-4 shrink-0" />
            <span>Ứng dụng đã được cài đặt trên thiết bị này</span>
          </div>
        ) : (
          <button
            type="button"
            onClick={handleInstallAppClick}
            className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all"
          >
            <Download className="w-4 h-4 shrink-0" />
            <span>
              {isInstallable
                ? 'Cài đặt App ngay lên Điện thoại'
                : 'Cài đặt App lên Điện thoại (Hướng dẫn)'}
            </span>
          </button>
        )}
      </div>

      {showInstallGuide && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/75 backdrop-blur-sm p-4">
          <div className="w-full max-w-md rounded-2xl bg-[#121B24] border border-white/15 p-5 space-y-4">
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2">
                <Smartphone className="w-5 h-5 text-emerald-400" />
                <h3 className="font-display text-lg font-bold text-white">
                  Cài đặt App lên Điện thoại
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowInstallGuide(false)}
                className="min-w-[40px] min-h-[40px] flex items-center justify-center rounded-xl text-slate-400 hover:text-white hover:bg-white/5"
                aria-label="Đóng hướng dẫn cài đặt"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-3 text-xs text-slate-300 leading-relaxed">
              {isIOS ? (
                <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2">
                  <p className="font-bold text-emerald-400 flex items-center gap-1.5">
                    <Share className="w-3.5 h-3.5" />
                    Trên iPhone / iPad (Safari):
                  </p>
                  <p>1. Mở link web bằng trình duyệt <strong className="text-white">Safari</strong>.</p>
                  <p>2. Nhấn nút <strong className="text-white">Chia sẻ (biểu tượng ô vuông có mũi tên lên)</strong> ở thanh dưới.</p>
                  <p>3. Cuộn xuống chọn <strong className="text-emerald-400">Thêm vào MH chính (Add to Home Screen)</strong> rồi bấm <strong className="text-white">Thêm</strong>.</p>
                </div>
              ) : (
                <>
                  <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-1.5">
                    <p className="font-bold text-emerald-400">Trên Android (Google Chrome):</p>
                    <p>1. Mở link web trực tiếp bằng trình duyệt <strong className="text-white">Chrome</strong> (không mở bên trong Zalo/Messenger).</p>
                    <p>2. Nhấn dấu <strong className="text-white">3 chấm (⋮)</strong> góc trên bên phải Chrome.</p>
                    <p>3. Chọn <strong className="text-emerald-400">Thêm vào màn hình chính</strong> hoặc <strong className="text-emerald-400">Cài đặt ứng dụng</strong>.</p>
                  </div>
                  <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-1.5">
                    <p className="font-bold text-amber-400">Trên iPhone / iPad (Safari):</p>
                    <p>Nhấn nút <strong className="text-white">Chia sẻ (Share)</strong> ở Safari &rarr; chọn <strong className="text-emerald-400">Thêm vào MH chính</strong>.</p>
                  </div>
                </>
              )}
            </div>

            <button
              type="button"
              onClick={() => setShowInstallGuide(false)}
              className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm"
            >
              Đã hiểu
            </button>
          </div>
        </div>
      )}
    </div>
  );
};
