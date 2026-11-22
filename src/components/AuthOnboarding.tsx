import React, { useEffect, useState } from 'react';
import {
  CheckCircle2,
  ChevronRight,
  Eye,
  EyeOff,
  HardDrive,
  Lock,
  LogIn,
  Trophy,
  User as UserIcon,
  UserPlus,
} from 'lucide-react';
import { CLUBS, REAL_MANAGERS } from '../data/footballDatabase';
import { ClubBackupBundle } from '../lib/backupEngine';
import {
  listLocalAccountPreviews,
  LocalAccountPreview,
  LocalUser,
  loginLocalAccount,
  logoutLocalAccount,
  registerLocalAccount,
} from '../lib/localDb';
import { FormationId } from '../types/game';
import { BackupRestoreCard } from './BackupRestoreCard';
import { ClubCrest, ManagerAvatar } from './ClubBadgeAndAvatar';

interface AuthGateProps {
  localUser: LocalUser | null;
  needsProfile: boolean;
  onCompleteOnboarding: (data: {
    managerName: string;
    nationality: string;
    clubId: string;
    preferredFormation: FormationId;
  }) => Promise<void>;
  onRestoreBackup?: (
    bundle: ClubBackupBundle,
    restoreAdminData: boolean
  ) => Promise<{ ok: boolean; message: string }>;
}

const FORMATIONS: FormationId[] = ['4-3-3', '4-2-3-1', '3-4-2-1', '3-5-2', '4-4-2', '5-3-2'];

export const AuthOnboarding: React.FC<AuthGateProps> = ({
  localUser,
  needsProfile,
  onCompleteOnboarding,
  onRestoreBackup,
}) => {
  const [authMode, setAuthMode] = useState<'login' | 'register'>('login');
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [savedAccounts, setSavedAccounts] = useState<LocalAccountPreview[]>([]);

  // Onboarding state
  const [managerName, setManagerName] = useState(
    localUser?.username?.slice(0, 40) || 'HLV Chiến Lược'
  );
  const [nationality, setNationality] = useState('Việt Nam');
  const [preferredFormation, setPreferredFormation] = useState<FormationId>('4-2-3-1');
  const [selectedClubId, setSelectedClubId] = useState<string>('man-city');
  const [leagueFilter, setLeagueFilter] = useState<string>('ALL');
  const [submittingCareer, setSubmittingCareer] = useState(false);

  useEffect(() => {
    if (localUser) {
      setManagerName((prev) =>
        prev === 'HLV Chiến Lược' || !prev.trim() ? localUser.username.slice(0, 40) : prev
      );
      return;
    }
    let cancelled = false;
    void listLocalAccountPreviews().then((list) => {
      if (cancelled) return;
      setSavedAccounts(list);
      if (list.length === 0) {
        setAuthMode('register');
      }
    });
    return () => {
      cancelled = true;
    };
  }, [localUser?.uid, localUser?.username]);

  const handleSubmitAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    const trimmedName = username.trim();
    if (trimmedName.length < 2) {
      setAuthError('Tên tài khoản cần ít nhất 2 ký tự.');
      return;
    }
    if (password.length < 4) {
      setAuthError('Mật khẩu cần ít nhất 4 ký tự.');
      return;
    }

    setLoading(true);
    try {
      if (authMode === 'register') {
        await registerLocalAccount(trimmedName, password);
      } else {
        await loginLocalAccount(trimmedName, password);
      }
    } catch (err: unknown) {
      setAuthError(err instanceof Error ? err.message : 'Lỗi đăng nhập tài khoản.');
    } finally {
      setLoading(false);
    }
  };

  // Screen 1: Local Username + Password Sign-in / Register
  if (!localUser) {
    return (
      <div className="min-h-screen bg-[#0B1117] text-slate-100 flex flex-col lg:grid lg:grid-cols-12">
        {/* Hero Visual Panel */}
        <div className="relative lg:col-span-7 min-h-[240px] lg:min-h-screen overflow-hidden flex flex-col justify-end p-6 sm:p-10">
          <img
            src="/src/assets/images/stadium_pitch_hero_1795100242983.jpg"
            alt="Sân vận động Touchline XI"
            referrerPolicy="no-referrer"
            className="absolute inset-0 w-full h-full object-cover"
          />
          <div className="absolute inset-0 bg-gradient-to-t from-[#0B1117] via-[#0B1117]/75 to-[#0B1117]/30" />
          <div className="relative z-10 max-w-xl space-y-3">
            <div className="flex items-center gap-3">
              <img
                src="/src/assets/images/app_crest_emblem_1795100242365.jpg"
                alt="Touchline XI Emblem"
                referrerPolicy="no-referrer"
                className="w-12 h-12 rounded-xl object-cover border border-amber-400/40"
              />
              <div>
                <p className="text-xs font-medium text-emerald-400 tracking-wide">
                  Mùa giải 2026/27 · Lưu trữ cục bộ trên thiết bị
                </p>
                <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
                  TOUCHLINE XI
                </h1>
              </div>
            </div>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Trải nghiệm quản lý bóng đá chuyên nghiệp: dữ liệu cầu thủ và HLV thực tế, chiến thuật 3 giai đoạn chuyên sâu, mô phỏng trận đấu 2D, chơi mượt ngay trên thiết bị không lo giới hạn quota.
            </p>
          </div>
        </div>

        {/* Auth Form Panel */}
        <div className="lg:col-span-5 flex items-center justify-center p-5 sm:p-10 bg-[#0B1117]">
          <div className="w-full max-w-md space-y-5">
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-bold text-white">
                Trung tâm Đăng nhập HLV
              </h2>
              <p className="text-xs text-slate-400 flex items-center gap-1.5">
                <HardDrive className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
                Lưu trực tiếp trên máy (IndexedDB) · Chỉ cần Tên &amp; Mật khẩu
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setAuthMode('login');
                  setAuthError(null);
                }}
                className={`h-11 rounded-lg text-xs font-semibold transition-colors ${
                  authMode === 'login'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Đăng nhập
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthMode('register');
                  setAuthError(null);
                }}
                className={`h-11 rounded-lg text-xs font-semibold transition-colors ${
                  authMode === 'register'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Tạo tài khoản mới
              </button>
            </div>

            {authError && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-200 leading-relaxed">
                {authError}
              </div>
            )}

            <form
              onSubmit={handleSubmitAuth}
              className="space-y-4 rounded-2xl bg-[#121B24] border border-white/10 p-5"
            >
              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 block">Tên tài khoản</label>
                <div className="relative">
                  <UserIcon className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type="text"
                    required
                    minLength={2}
                    maxLength={40}
                    autoComplete="username"
                    value={username}
                    onChange={(e) => setUsername(e.target.value)}
                    placeholder="VD: hlvdai hoặc admin"
                    className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label className="text-xs text-slate-400 block">Mật khẩu (tối thiểu 4 ký tự)</label>
                <div className="relative">
                  <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    minLength={4}
                    autoComplete={authMode === 'register' ? 'new-password' : 'current-password'}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••"
                    className="w-full h-11 pl-10 pr-10 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-2.5 top-2.5 p-1 text-slate-400 hover:text-white"
                    aria-label={showPassword ? 'Ẩn mật khẩu' : 'Hiện mật khẩu'}
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {authMode === 'register' && (
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  Tài khoản đầu tiên tạo trên máy (hoặc tên <span className="text-amber-300 font-semibold">admin</span>) sẽ tự động có quyền Quản trị viên.
                </p>
              )}

              <button
                type="submit"
                disabled={loading}
                className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
              >
                {authMode === 'register' ? (
                  <UserPlus className="w-4 h-4" />
                ) : (
                  <LogIn className="w-4 h-4" />
                )}
                {loading
                  ? 'Đang xử lý...'
                  : authMode === 'register'
                    ? 'Tạo tài khoản & Vào game'
                    : 'Đăng nhập ngay'}
              </button>
            </form>

            {savedAccounts.length > 0 && (
              <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 space-y-2.5">
                <p className="text-xs font-semibold text-slate-300">
                  Tài khoản đã lưu trên thiết bị này ({savedAccounts.length}):
                </p>
                <div className="flex flex-wrap gap-2">
                  {savedAccounts.map((acc) => (
                    <button
                      key={acc.uid}
                      type="button"
                      onClick={() => {
                        setAuthMode('login');
                        setUsername(acc.username);
                        setAuthError(null);
                      }}
                      className="px-3 py-2 rounded-xl bg-[#0B1117] hover:bg-white/5 border border-white/10 text-left transition-colors"
                    >
                      <p className="text-xs font-bold text-white">
                        {acc.username}
                        {acc.role === 'admin' ? ' · Admin' : ''}
                      </p>
                      {acc.clubName && (
                        <p className="text-[10px] text-emerald-400">{acc.clubName}</p>
                      )}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Screen 2: New Career Onboarding (Select Real Club & Manager Identity)
  if (needsProfile) {
    const chosenClub = CLUBS.find((c) => c.id === selectedClubId) ?? CLUBS[0];
    const currentRealManager = REAL_MANAGERS.find((m) => m.id === chosenClub.managerId) ?? REAL_MANAGERS[0];

    return (
      <div className="min-h-screen bg-[#0B1117] text-slate-100 pb-24">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-emerald-400 font-medium">
                Khởi tạo sự nghiệp trên thiết bị · Tài khoản {localUser.username}
              </p>
              <h1 className="font-display text-3xl font-extrabold text-white">
                Bổ nhiệm Huấn luyện viên
              </h1>
            </div>
            <button
              type="button"
              onClick={() => logoutLocalAccount()}
              className="text-xs text-slate-400 hover:text-white px-3 h-10 rounded-lg border border-white/10"
            >
              Đổi tài khoản
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 rounded-2xl bg-[#121B24] border border-white/10 p-4">
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Tên Huấn luyện viên</label>
              <input
                type="text"
                maxLength={50}
                value={managerName}
                onChange={(e) => setManagerName(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Quốc tịch</label>
              <input
                type="text"
                maxLength={35}
                value={nationality}
                onChange={(e) => setNationality(e.target.value)}
                className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500"
              />
            </div>
            <div className="space-y-1.5">
              <label className="text-xs text-slate-400">Triết lý sơ đồ</label>
              <select
                value={preferredFormation}
                onChange={(e) => setPreferredFormation(e.target.value as FormationId)}
                className="w-full h-11 px-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500"
              >
                {FORMATIONS.map((f) => (
                  <option key={f} value={f}>
                    {f}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h2 className="font-display text-xl font-bold text-white">
                Chọn Câu lạc bộ dẫn dắt ({CLUBS.length} CLB thực tế)
              </h2>
              <span className="text-xs text-slate-400 font-mono-num">
                Ngân sách: €{chosenClub.transferBudgetM}M
              </span>
            </div>

            <div className="flex items-center gap-1.5 overflow-x-auto pb-1">
              {[
                { id: 'ALL', label: 'Tất cả (20)' },
                { id: 'Premier League', label: 'Premier League' },
                { id: 'La Liga', label: 'La Liga' },
                { id: 'Serie A', label: 'Serie A' },
                { id: 'Bundesliga', label: 'Bundesliga' },
                { id: 'OTHER', label: 'Khác' },
              ].map((lf) => (
                <button
                  key={lf.id}
                  type="button"
                  onClick={() => setLeagueFilter(lf.id)}
                  className={`h-9 px-3 rounded-lg text-xs font-semibold whitespace-nowrap shrink-0 border transition-colors ${
                    leagueFilter === lf.id
                      ? 'bg-emerald-500 border-emerald-400 text-slate-950'
                      : 'bg-[#121B24] border-white/10 text-slate-300'
                  }`}
                >
                  {lf.label}
                </button>
              ))}
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
              {CLUBS.filter((club) => {
                if (leagueFilter === 'ALL') return true;
                if (leagueFilter === 'OTHER') {
                  return !['Premier League', 'La Liga', 'Serie A', 'Bundesliga'].includes(club.league);
                }
                return club.league === leagueFilter;
              }).map((club) => {
                const mgr = REAL_MANAGERS.find((m) => m.id === club.managerId);
                const active = club.id === selectedClubId;
                return (
                  <button
                    key={club.id}
                    type="button"
                    onClick={() => {
                      setSelectedClubId(club.id);
                      if (mgr) setPreferredFormation(mgr.preferredFormation);
                    }}
                    className={`text-left rounded-2xl p-3.5 border transition-all flex items-center gap-3 min-h-[76px] ${
                      active
                        ? 'bg-emerald-500/15 border-emerald-400 shadow-lg shadow-emerald-500/10'
                        : 'bg-[#121B24] border-white/10 hover:border-white/25'
                    }`}
                  >
                    <ClubCrest club={club} size={44} />
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center justify-between gap-2">
                        <span className="font-semibold text-sm text-white truncate">{club.name}</span>
                        {active && <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />}
                      </div>
                      <p className="text-xs text-slate-400 truncate">
                        {club.league} · HLV {mgr?.name}
                      </p>
                      <p className="text-[11px] font-mono-num text-emerald-400 mt-0.5">
                        €{club.transferBudgetM}M · Uy tín {club.reputation}
                      </p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Selected Club Summary Card */}
          <div className="rounded-2xl bg-[#121B24] border border-white/10 p-4 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-3.5">
              <ManagerAvatar manager={currentRealManager} size={52} />
              <div>
                <p className="text-xs text-slate-400">
                  Kế thừa triết lý từ HLV thực tế · {chosenClub.stadium}
                </p>
                <p className="text-sm font-semibold text-white">
                  {currentRealManager.name} ({currentRealManager.style})
                </p>
                <p className="text-xs text-amber-400 font-mono-num">
                  Quỹ chuyển nhượng €{chosenClub.transferBudgetM}M · Quỹ lương €{chosenClub.wageBudgetK}K/tuần
                </p>
              </div>
            </div>

            <button
              type="button"
              disabled={submittingCareer || managerName.trim().length < 2}
              onClick={async () => {
                setSubmittingCareer(true);
                try {
                  await onCompleteOnboarding({
                    managerName: managerName.trim(),
                    nationality: nationality.trim() || 'Việt Nam',
                    clubId: selectedClubId,
                    preferredFormation,
                  });
                } finally {
                  setSubmittingCareer(false);
                }
              }}
              className="h-12 px-6 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 shrink-0 disabled:opacity-60"
            >
              <Trophy className="w-4 h-4" />
              {submittingCareer ? 'Đang khởi tạo...' : 'Ký hợp đồng & Bắt đầu'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          {onRestoreBackup && (
            <BackupRestoreCard
              title="Đã có bản sao lưu từ bản cũ?"
              description="Chọn file sao lưu (.json) đã tải từ bản Firebase hoặc máy cũ để khôi phục nguyên vẹn CLB, đội hình, cúp, túi đồ và thứ hạng lên thiết bị này."
              canExport={false}
              onRestoreBackup={onRestoreBackup}
            />
          )}
        </div>
      </div>
    );
  }

  return null;
};
