import React, { useState } from 'react';
import {
  User,
  createUserWithEmailAndPassword,
  sendEmailVerification,
  signInWithEmailAndPassword,
  signInWithPopup,
  signOut,
} from 'firebase/auth';
import {
  CheckCircle2,
  ChevronRight,
  Lock,
  Mail,
  RefreshCw,
  ShieldCheck,
  Trophy,
  UserPlus,
} from 'lucide-react';
import { auth, googleProvider } from '../lib/firebase';
import { CLUBS, REAL_MANAGERS } from '../data/footballDatabase';
import { FormationId } from '../types/game';
import { ClubCrest, ManagerAvatar } from './ClubBadgeAndAvatar';

interface AuthGateProps {
  firebaseUser: User | null;
  needsProfile: boolean;
  onCompleteOnboarding: (data: {
    managerName: string;
    nationality: string;
    clubId: string;
    preferredFormation: FormationId;
  }) => Promise<void>;
  onEmailVerifiedRefresh: () => Promise<void>;
}

const FORMATIONS: FormationId[] = ['4-3-3', '4-2-3-1', '3-4-2-1', '3-5-2', '4-4-2', '5-3-2'];

export const AuthOnboarding: React.FC<AuthGateProps> = ({
  firebaseUser,
  needsProfile,
  onCompleteOnboarding,
  onEmailVerifiedRefresh,
}) => {
  const [authTab, setAuthTab] = useState<'google' | 'email'>('google');
  const [emailMode, setEmailMode] = useState<'login' | 'register'>('register');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [authError, setAuthError] = useState<string | null>(null);
  const [authInfo, setAuthInfo] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  // Onboarding state
  const [managerName, setManagerName] = useState(
    firebaseUser?.displayName?.slice(0, 40) || 'HLV Chiến Lược'
  );
  const [nationality, setNationality] = useState('Việt Nam');
  const [preferredFormation, setPreferredFormation] = useState<FormationId>('4-2-3-1');
  const [selectedClubId, setSelectedClubId] = useState<string>('man-city');
  const [leagueFilter, setLeagueFilter] = useState<string>('ALL');
  const [submittingCareer, setSubmittingCareer] = useState(false);

  const handleGoogleLogin = async () => {
    setAuthError(null);
    setAuthInfo(null);
    setLoading(true);
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Đăng nhập Google thất bại.';
      setAuthError(message);
    } finally {
      setLoading(false);
    }
  };

  const handleEmailAuth = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError(null);
    setAuthInfo(null);
    if (!email.trim() || password.length < 6) {
      setAuthError('Vui lòng nhập email hợp lệ và mật khẩu tối thiểu 6 ký tự.');
      return;
    }

    setLoading(true);
    try {
      if (emailMode === 'register') {
        const cred = await createUserWithEmailAndPassword(auth, email.trim(), password);
        await sendEmailVerification(cred.user);
        setAuthInfo('Tạo tài khoản thành công! Vui lòng kiểm tra hộp thư để xác thực email trước khi đồng bộ đám mây.');
      } else {
        await signInWithEmailAndPassword(auth, email.trim(), password);
      }
    } catch (err: unknown) {
      const code = (err as { code?: string })?.code ?? '';
      if (code === 'auth/operation-not-allowed') {
        setAuthError(
          'Phương thức Email/Password chưa được bật trên Firebase Console (Authentication > Sign-in method > Email/Password). Bạn có thể bật trong Console hoặc dùng Đăng nhập Google 1 chạm.'
        );
      } else if (code === 'auth/email-already-in-use') {
        setAuthError('Email này đã được đăng ký. Hãy chuyển sang tab Đăng nhập.');
      } else if (code === 'auth/invalid-credential') {
        setAuthError('Email hoặc mật khẩu không chính xác.');
      } else {
        setAuthError(err instanceof Error ? err.message : 'Lỗi xác thực tài khoản.');
      }
    } finally {
      setLoading(false);
    }
  };

  // Screen 1: Sign-in / Register
  if (!firebaseUser) {
    return (
      <div className="min-h-screen bg-[#0B1117] text-slate-100 flex flex-col lg:grid lg:grid-cols-12">
        {/* Hero Visual Panel */}
        <div className="relative lg:col-span-7 min-h-[260px] lg:min-h-screen overflow-hidden flex flex-col justify-end p-6 sm:p-10">
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
                  Mùa giải 2026/27 · Đồng bộ Firebase
                </p>
                <h1 className="font-display text-3xl sm:text-5xl font-extrabold tracking-tight text-white">
                  TOUCHLINE XI
                </h1>
              </div>
            </div>
            <p className="text-sm sm:text-base text-slate-300 leading-relaxed">
              Trải nghiệm quản lý bóng đá chuyên nghiệp trên màn hình dọc: dữ liệu cầu thủ và HLV thực tế, chiến thuật 3 giai đoạn chuyên sâu, mô phỏng trận đấu 2D và thị trường chuyển nhượng cập nhật theo thời gian thực.
            </p>
          </div>
        </div>

        {/* Auth Form Panel */}
        <div className="lg:col-span-5 flex items-center justify-center p-5 sm:p-10 bg-[#0B1117]">
          <div className="w-full max-w-md space-y-6">
            <div className="space-y-1.5">
              <h2 className="font-display text-2xl font-bold text-white">
                Trung tâm Đăng nhập HLV
              </h2>
              <p className="text-xs text-slate-400">
                Thiết bị chỉ lưu trạng thái đăng nhập. Toàn bộ sự nghiệp được lưu an toàn trên đám mây.
              </p>
            </div>

            <div className="grid grid-cols-2 gap-1 p-1 rounded-xl bg-[#121B24] border border-white/10">
              <button
                type="button"
                onClick={() => {
                  setAuthTab('google');
                  setAuthError(null);
                }}
                className={`h-11 rounded-lg text-xs font-semibold transition-colors ${
                  authTab === 'google'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Google 1-Chạm
              </button>
              <button
                type="button"
                onClick={() => {
                  setAuthTab('email');
                  setAuthError(null);
                }}
                className={`h-11 rounded-lg text-xs font-semibold transition-colors ${
                  authTab === 'email'
                    ? 'bg-emerald-500 text-slate-950'
                    : 'text-slate-300 hover:text-white'
                }`}
              >
                Tạo / Nhập Email
              </button>
            </div>

            {authError && (
              <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-3 text-xs text-red-200 leading-relaxed">
                {authError}
              </div>
            )}

            {authInfo && (
              <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-200 leading-relaxed">
                {authInfo}
              </div>
            )}

            {authTab === 'google' ? (
              <div className="space-y-4 rounded-2xl bg-[#121B24] border border-white/10 p-5">
                <p className="text-sm text-slate-300 leading-relaxed">
                  Đăng nhập bằng tài khoản Google để tạo hồ sơ HLV tức thì và đồng bộ tự động trên mọi thiết bị.
                </p>
                <button
                  type="button"
                  disabled={loading}
                  onClick={handleGoogleLogin}
                  className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 active:scale-[0.99] text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-all disabled:opacity-60"
                >
                  <ShieldCheck className="w-4 h-4" />
                  {loading ? 'Đang kết nối...' : 'Tiếp tục với Google'}
                </button>
              </div>
            ) : (
              <form
                onSubmit={handleEmailAuth}
                className="space-y-4 rounded-2xl bg-[#121B24] border border-white/10 p-5"
              >
                <div className="flex items-center justify-between">
                  <span className="text-sm font-semibold text-white">
                    {emailMode === 'register' ? 'Tạo tài khoản mới' : 'Đăng nhập bằng Email'}
                  </span>
                  <button
                    type="button"
                    onClick={() => setEmailMode(emailMode === 'register' ? 'login' : 'register')}
                    className="text-xs font-medium text-emerald-400 hover:underline min-h-[36px]"
                  >
                    {emailMode === 'register' ? 'Đã có tài khoản?' : 'Tạo tài khoản mới'}
                  </button>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 block">Địa chỉ Email</label>
                  <div className="relative">
                    <Mail className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="email"
                      required
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="hlv@touchlinexi.com"
                      className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <div className="space-y-1.5">
                  <label className="text-xs text-slate-400 block">Mật khẩu (tối thiểu 6 ký tự)</label>
                  <div className="relative">
                    <Lock className="w-4 h-4 text-slate-500 absolute left-3.5 top-3.5" />
                    <input
                      type="password"
                      required
                      minLength={6}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="••••••••"
                      className="w-full h-11 pl-10 pr-3 rounded-xl bg-[#0B1117] border border-white/10 text-sm text-white focus:outline-none focus:border-emerald-500"
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full h-12 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
                >
                  <UserPlus className="w-4 h-4" />
                  {loading
                    ? 'Đang xử lý...'
                    : emailMode === 'register'
                      ? 'Đăng ký tài khoản'
                      : 'Đăng nhập'}
                </button>
              </form>
            )}
          </div>
        </div>
      </div>
    );
  }

  // Screen 2: Unverified Email Guard
  if (!firebaseUser.emailVerified) {
    return (
      <div className="min-h-screen bg-[#0B1117] text-slate-100 flex items-center justify-center p-4">
        <div className="max-w-md w-full rounded-2xl bg-[#121B24] border border-white/10 p-6 space-y-5">
          <div className="space-y-1">
            <h2 className="font-display text-2xl font-bold text-white">Xác thực Email tài khoản</h2>
            <p className="text-xs text-slate-400">
              Email <span className="text-white font-medium">{firebaseUser.email}</span> cần được xác thực để bảo vệ dữ liệu đám mây của bạn.
            </p>
          </div>
          {authInfo && (
            <div className="rounded-xl bg-emerald-500/10 border border-emerald-500/30 p-3 text-xs text-emerald-200">
              {authInfo}
            </div>
          )}
          <div className="space-y-2.5">
            <button
              type="button"
              onClick={async () => {
                setLoading(true);
                await onEmailVerifiedRefresh();
                setLoading(false);
              }}
              className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-bold text-sm flex items-center justify-center gap-2"
            >
              <RefreshCw className="w-4 h-4" />
              {loading ? 'Đang kiểm tra...' : 'Tôi đã xác thực · Tiếp tục'}
            </button>
            <button
              type="button"
              onClick={async () => {
                await sendEmailVerification(firebaseUser);
                setAuthInfo('Đã gửi lại liên kết xác thực vào hộp thư của bạn.');
              }}
              className="w-full h-11 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-200 font-medium text-xs"
            >
              Gửi lại email xác thực
            </button>
            <button
              type="button"
              onClick={() => signOut(auth)}
              className="w-full h-10 text-xs text-slate-400 hover:text-white"
            >
              Đăng xuất / Dùng tài khoản Google
            </button>
          </div>
        </div>
      </div>
    );
  }

  // Screen 3: New Career Onboarding (Select Real Club & Manager Identity)
  if (needsProfile) {
    const chosenClub = CLUBS.find((c) => c.id === selectedClubId) ?? CLUBS[0];
    const currentRealManager = REAL_MANAGERS.find((m) => m.id === chosenClub.managerId) ?? REAL_MANAGERS[0];

    return (
      <div className="min-h-screen bg-[#0B1117] text-slate-100 pb-24">
        <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
          <div className="flex items-center justify-between gap-4">
            <div>
              <p className="text-xs text-emerald-400 font-medium">Khởi tạo sự nghiệp đám mây</p>
              <h1 className="font-display text-3xl font-extrabold text-white">
                Bổ nhiệm Huấn luyện viên
              </h1>
            </div>
            <button
              type="button"
              onClick={() => signOut(auth)}
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
              {submittingCareer ? 'Đang đồng bộ Cloud...' : 'Ký hợp đồng & Bắt đầu'}
              <ChevronRight className="w-4 h-4" />
            </button>
          </div>
        </div>
      </div>
    );
  }

  return null;
};
