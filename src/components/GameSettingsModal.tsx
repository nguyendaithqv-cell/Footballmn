import React from 'react';
import {
  Activity,
  FileSignature,
  HeartPulse,
  RotateCcw,
  Settings,
  ShieldCheck,
  Sliders,
  Stethoscope,
  Users,
  Volume2,
  VolumeX,
  X,
  Zap,
} from 'lucide-react';
import { DEFAULT_GAME_SETTINGS } from '../lib/careerEngine';
import {
  AutoRecoverScope,
  AutoRecoverSource,
  AutoRecoverThreshold,
  ConfirmMode,
  GameSettings,
} from '../types/game';

interface GameSettingsModalProps {
  open: boolean;
  settings: GameSettings;
  fitnessBoostersCount: number;
  transferBudgetM: number;
  onChange: (nextSettings: GameSettings) => void;
  onClose: () => void;
}

interface ToggleRowProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  checked: boolean;
  badgeText?: string;
  onToggle: (next: boolean) => void;
}

const ToggleRow: React.FC<ToggleRowProps> = ({
  icon,
  title,
  description,
  checked,
  badgeText,
  onToggle,
}) => (
  <div className="flex items-start justify-between gap-3 rounded-xl bg-[#0B1117] border border-white/10 p-3.5">
    <div className="flex items-start gap-3 min-w-0">
      <div className="w-8 h-8 rounded-lg bg-slate-800/90 border border-white/10 flex items-center justify-center shrink-0 mt-0.5">
        {icon}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <p className="text-xs sm:text-sm font-bold text-white">{title}</p>
          {badgeText && (
            <span
              className={`px-1.5 py-0.5 rounded text-[10px] font-bold ${
                checked
                  ? 'bg-emerald-500/20 text-emerald-300 border border-emerald-500/35'
                  : 'bg-slate-800 text-slate-400 border border-white/10'
              }`}
            >
              {badgeText}
            </span>
          )}
        </div>
        <p className="text-[11px] text-slate-400 mt-1 leading-relaxed">{description}</p>
      </div>
    </div>

    <button
      type="button"
      role="switch"
      aria-checked={checked}
      onClick={() => onToggle(!checked)}
      className={`relative inline-flex h-7 w-12 shrink-0 cursor-pointer rounded-full border transition-colors ${
        checked
          ? 'bg-emerald-500 border-emerald-400'
          : 'bg-slate-700/80 border-white/15'
      }`}
    >
      <span
        className={`pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow transition-transform mt-0.5 ${
          checked ? 'translate-x-6' : 'translate-x-1'
        }`}
      />
    </button>
  </div>
);

export const GameSettingsModal: React.FC<GameSettingsModalProps> = ({
  open,
  settings,
  fitnessBoostersCount,
  transferBudgetM,
  onChange,
  onClose,
}) => {
  if (!open) return null;

  const update = <K extends keyof GameSettings>(key: K, value: GameSettings[K]) => {
    onChange({
      ...settings,
      [key]: value,
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/75 backdrop-blur-sm flex items-end sm:items-center justify-center p-0 sm:p-4"
      role="dialog"
      aria-modal="true"
      aria-labelledby="game-settings-title"
      onClick={onClose}
    >
      <div
        className="w-full sm:max-w-2xl max-h-[90vh] flex flex-col rounded-t-2xl sm:rounded-2xl bg-[#121B24] border border-white/15 shadow-2xl overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-5 py-4 border-b border-white/10 bg-[#0B1117]/80 shrink-0">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-emerald-500/15 border border-emerald-500/35 flex items-center justify-center text-emerald-400">
              <Settings className="w-5 h-5" />
            </div>
            <div>
              <h2 id="game-settings-title" className="font-display text-base sm:text-lg font-bold text-white">
                Cài đặt Hệ thống & Tự động hóa
              </h2>
              <p className="text-[11px] text-slate-400">
                Mọi thay đổi được lưu tự động cho sự nghiệp hiện tại
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="w-9 h-9 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white flex items-center justify-center"
            aria-label="Đóng cài đặt"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="flex-1 overflow-y-auto p-5 space-y-5">
          {/* Group 1: Audio & Match Experience */}
          <section className="space-y-2.5">
            <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
              <Sliders className="w-3.5 h-3.5" />
              Âm thanh & Trải nghiệm Trận đấu
            </h3>

            <ToggleRow
              icon={
                settings.soundEnabled ? (
                  <Volume2 className="w-4 h-4 text-emerald-400" />
                ) : (
                  <VolumeX className="w-4 h-4 text-slate-400" />
                )
              }
              title="Âm thanh hiệu ứng (SFX)"
              badgeText={settings.soundEnabled ? 'Đang Bật' : 'Đang Tắt'}
              description="Tiếng còi khai cuộc/mãn cuộc, reo hò ghi bàn, thẻ phạt, mở thẻ và âm thanh nút bấm (đồng bộ với nút loa trong trận Live 2D)."
              checked={settings.soundEnabled}
              onToggle={(v) => update('soundEnabled', v)}
            />

            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <div className="flex items-center gap-2">
                  <Zap className="w-4 h-4 text-amber-400" />
                  <p className="text-xs sm:text-sm font-bold text-white">
                    Tốc độ mặc định khi vào Trực tiếp 2D
                  </p>
                </div>
                <span className="font-mono-num text-xs font-bold text-amber-300">
                  {settings.defaultLiveSpeed}x
                </span>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([1, 2, 4] as const).map((sp) => (
                  <button
                    key={sp}
                    type="button"
                    onClick={() => update('defaultLiveSpeed', sp)}
                    className={`h-9 rounded-lg font-mono-num text-xs font-bold border transition-colors ${
                      settings.defaultLiveSpeed === sp
                        ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                        : 'bg-slate-800/80 text-slate-300 border-white/10 hover:text-white'
                    }`}
                  >
                    {sp}x {sp === 1 ? '(Chậm)' : sp === 2 ? '(Chuẩn)' : '(Nhanh)'}
                  </button>
                ))}
              </div>
            </div>

            <div className="rounded-xl bg-[#0B1117] border border-white/10 p-3.5 space-y-2.5">
              <div className="flex items-center gap-2">
                <ShieldCheck className="w-4 h-4 text-sky-400" />
                <p className="text-xs sm:text-sm font-bold text-white">
                  Chế độ hộp thoại xác nhận thao tác
                </p>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                {(
                  [
                    {
                      id: 'strict' as ConfirmMode,
                      label: 'Chặt chẽ (Mặc định)',
                      sub: 'Hỏi xác nhận đầy đủ kể cả Mô phỏng nhanh & hồi phục đội.',
                    },
                    {
                      id: 'fast' as ConfirmMode,
                      label: 'Nhanh gọn',
                      sub: 'Bỏ qua hỏi lại các thao tác thường ngày; vẫn giữ rào chắn rời trận 2D, bán/sa thải & sang mùa.',
                    },
                  ] as const
                ).map((mode) => (
                  <button
                    key={mode.id}
                    type="button"
                    onClick={() => update('confirmMode', mode.id)}
                    className={`rounded-xl p-2.5 border text-left transition-colors ${
                      settings.confirmMode === mode.id
                        ? 'bg-sky-500/15 border-sky-400/50 text-white'
                        : 'bg-slate-900/60 border-white/10 text-slate-300 hover:border-white/25'
                    }`}
                  >
                    <p className="text-xs font-bold">{mode.label}</p>
                    <p className="text-[10px] text-slate-400 mt-0.5 leading-snug">{mode.sub}</p>
                  </button>
                ))}
              </div>
            </div>
          </section>

          {/* Group 2: Contract Auto-Renewal */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                <FileSignature className="w-3.5 h-3.5" />
                Tự động hóa Hợp đồng cuối mùa
              </h3>
              <span className="text-[11px] font-mono-num text-slate-400">
                Ngân sách: €{transferBudgetM.toFixed(1)}M
              </span>
            </div>

            <ToggleRow
              icon={<FileSignature className="w-4 h-4 text-amber-400" />}
              title="Tự động gia hạn hợp đồng cầu thủ"
              badgeText={settings.autoRenewContracts ? 'Đang Bật' : 'Mặc định: Tắt'}
              description="Trước khi chuyển sang mùa giải mới, tự động gia hạn +2 năm cho cầu thủ sắp hết hạn nếu đủ ngân sách. Tự động bỏ qua cầu thủ bạn đang treo bán trên thị trường."
              checked={settings.autoRenewContracts}
              onToggle={(v) => update('autoRenewContracts', v)}
            />

            <ToggleRow
              icon={<Users className="w-4 h-4 text-amber-300" />}
              title="Tự động gia hạn hợp đồng HLV trưởng"
              badgeText={settings.autoRenewManagerContract ? 'Đang Bật' : 'Mặc định: Tắt'}
              description="Nếu HLV trưởng sắp hết hạn hợp đồng vào cuối mùa, tự động gia hạn thêm 1–2 năm khi ngân sách CLB đủ chi trả phí thưởng ký."
              checked={settings.autoRenewManagerContract}
              onToggle={(v) => update('autoRenewManagerContract', v)}
            />
          </section>

          {/* Group 3: Medical, Stamina & Lineup Prep */}
          <section className="space-y-2.5">
            <div className="flex items-center justify-between">
              <h3 className="text-xs font-bold uppercase tracking-wider text-rose-400 flex items-center gap-1.5">
                <HeartPulse className="w-3.5 h-3.5" />
                Tự động bơm máu & Chuẩn bị đội hình trước trận
              </h3>
              <span className="text-[11px] font-mono-num text-sky-300">
                Bình Thể Lực: {fitnessBoostersCount}
              </span>
            </div>

            <ToggleRow
              icon={<HeartPulse className="w-4 h-4 text-rose-400" />}
              title="Tự động bơm máu hồi phục thể lực"
              badgeText={settings.autoRecoverStamina ? 'Đang Bật' : 'Mặc định: Tắt'}
              description="Trước khi đá trận (Trực tiếp 2D hoặc Mô phỏng nhanh), tự động hồi phục những cầu thủ có thể lực thấp hơn ngưỡng đã chọn."
              checked={settings.autoRecoverStamina}
              onToggle={(v) => update('autoRecoverStamina', v)}
            />

            {settings.autoRecoverStamina && (
              <div className="rounded-xl bg-[#0B1117] border border-emerald-500/25 p-3.5 space-y-3">
                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-300">
                    Ngưỡng thể lực kích hoạt bơm máu:
                  </p>
                  <div className="grid grid-cols-3 gap-2">
                    {([75, 80, 85] as AutoRecoverThreshold[]).map((th) => (
                      <button
                        key={th}
                        type="button"
                        onClick={() => update('autoRecoverThreshold', th)}
                        className={`h-8 rounded-lg font-mono-num text-xs font-bold border ${
                          settings.autoRecoverThreshold === th
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-slate-800/80 text-slate-300 border-white/10'
                        }`}
                      >
                        Dưới {th}%
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-300">Phạm vi áp dụng:</p>
                  <div className="grid grid-cols-2 gap-2">
                    {(
                      [
                        { id: 'starters' as AutoRecoverScope, label: '11 cầu thủ đá chính' },
                        { id: 'squad' as AutoRecoverScope, label: 'Toàn đội hình' },
                      ] as const
                    ).map((sc) => (
                      <button
                        key={sc.id}
                        type="button"
                        onClick={() => update('autoRecoverScope', sc.id)}
                        className={`h-8 rounded-lg text-xs font-bold border ${
                          settings.autoRecoverScope === sc.id
                            ? 'bg-emerald-500 text-slate-950 border-emerald-400'
                            : 'bg-slate-800/80 text-slate-300 border-white/10'
                        }`}
                      >
                        {sc.label}
                      </button>
                    ))}
                  </div>
                </div>

                <div className="space-y-1.5">
                  <p className="text-[11px] font-bold text-slate-300">Nguồn hồi phục ưu tiên:</p>
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                    {(
                      [
                        { id: 'booster_then_budget' as AutoRecoverSource, label: 'Bình TL → Tiền CLB' },
                        { id: 'booster_only' as AutoRecoverSource, label: 'Chỉ dùng Bình TL' },
                        { id: 'budget_only' as AutoRecoverSource, label: 'Chỉ dùng Tiền CLB' },
                      ] as const
                    ).map((src) => (
                      <button
                        key={src.id}
                        type="button"
                        onClick={() => update('autoRecoverSource', src.id)}
                        className={`h-8 rounded-lg text-[11px] font-bold border ${
                          settings.autoRecoverSource === src.id
                            ? 'bg-sky-500 text-slate-950 border-sky-400'
                            : 'bg-slate-800/80 text-slate-300 border-white/10'
                        }`}
                      >
                        {src.label}
                      </button>
                    ))}
                  </div>
                </div>
              </div>
            )}

            <ToggleRow
              icon={<Stethoscope className="w-4 h-4 text-sky-400" />}
              title="Tự động chữa chấn thương nhẹ (≤ 2 trận)"
              badgeText={settings.autoTreatMinorInjuries ? 'Đang Bật' : 'Mặc định: Tắt'}
              description="Trước giờ bóng lăn, tự động chi ngân sách điều trị dứt điểm các ca chấn thương nhẹ còn tối đa 2 trận (ưu tiên đội hình chính)."
              checked={settings.autoTreatMinorInjuries}
              onToggle={(v) => update('autoTreatMinorInjuries', v)}
            />

            <ToggleRow
              icon={<Activity className="w-4 h-4 text-emerald-400" />}
              title="Tự động thay cầu thủ chấn thương / treo giò"
              badgeText={settings.autoReplaceUnavailableStarters ? 'Đang Bật' : 'Mặc định: Tắt'}
              description="Trước trận đấu, nếu đội hình ra sân có cầu thủ dính chấn thương hoặc bị treo giò, tự động đưa dự bị phù hợp & khỏe mạnh nhất vào thay."
              checked={settings.autoReplaceUnavailableStarters}
              onToggle={(v) => update('autoReplaceUnavailableStarters', v)}
            />
          </section>
        </div>

        {/* Footer */}
        <div className="px-5 py-3.5 border-t border-white/10 bg-[#0B1117]/90 flex flex-wrap items-center justify-between gap-2 shrink-0">
          <button
            type="button"
            onClick={() => onChange({ ...DEFAULT_GAME_SETTINGS })}
            className="h-10 px-3.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/10 text-xs font-semibold text-slate-300 flex items-center gap-1.5"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            Khôi phục mặc định
          </button>
          <button
            type="button"
            onClick={onClose}
            className="h-10 px-5 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 text-xs font-bold"
          >
            Xong
          </button>
        </div>
      </div>
    </div>
  );
};
