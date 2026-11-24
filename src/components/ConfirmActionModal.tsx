import React from 'react';
import { AlertTriangle, CheckCircle2, ShieldAlert, X } from 'lucide-react';

export interface ConfirmActionModalProps {
  open: boolean;
  title: string;
  description: React.ReactNode;
  confirmLabel?: string;
  cancelLabel?: string;
  tone?: 'emerald' | 'amber' | 'danger';
  busy?: boolean;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}

export const ConfirmActionModal: React.FC<ConfirmActionModalProps> = ({
  open,
  title,
  description,
  confirmLabel = 'Xác nhận',
  cancelLabel = 'Quay lại',
  tone = 'amber',
  busy = false,
  onConfirm,
  onCancel,
}) => {
  if (!open) return null;

  const borderCls =
    tone === 'danger'
      ? 'border-rose-500/45'
      : tone === 'emerald'
        ? 'border-emerald-500/45'
        : 'border-amber-400/45';

  const iconBoxCls =
    tone === 'danger'
      ? 'bg-rose-500/15 text-rose-400 border-rose-500/35'
      : tone === 'emerald'
        ? 'bg-emerald-500/15 text-emerald-400 border-emerald-500/35'
        : 'bg-amber-500/15 text-amber-400 border-amber-400/35';

  const confirmBtnCls =
    tone === 'danger'
      ? 'bg-rose-600 hover:bg-rose-500 text-white'
      : tone === 'emerald'
        ? 'bg-emerald-500 hover:bg-emerald-400 text-slate-950'
        : 'bg-amber-400 hover:bg-amber-300 text-slate-950';

  const Icon =
    tone === 'danger'
      ? ShieldAlert
      : tone === 'emerald'
        ? CheckCircle2
        : AlertTriangle;

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/75 backdrop-blur-sm p-4"
      role="dialog"
      aria-modal="true"
    >
      <div
        className={`w-full max-w-md rounded-2xl bg-[#121B24] border ${borderCls} shadow-2xl p-5 space-y-4`}
      >
        <div className="flex items-start justify-between gap-3">
          <div className="flex items-center gap-3 min-w-0">
            <div
              className={`w-10 h-10 rounded-xl border flex items-center justify-center shrink-0 ${iconBoxCls}`}
            >
              <Icon className="w-5 h-5" />
            </div>
            <h3 className="font-display text-lg font-bold text-white leading-snug">
              {title}
            </h3>
          </div>
          {!busy && (
            <button
              type="button"
              onClick={onCancel}
              className="w-8 h-8 rounded-lg bg-slate-800/80 text-slate-400 hover:text-white flex items-center justify-center shrink-0"
              aria-label="Đóng"
            >
              <X className="w-4 h-4" />
            </button>
          )}
        </div>

        <div className="text-xs sm:text-sm text-slate-300 leading-relaxed space-y-1.5">
          {description}
        </div>

        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-end gap-2 pt-1">
          <button
            type="button"
            disabled={busy}
            onClick={onCancel}
            className="h-10 px-4 rounded-xl bg-[#0B1117] hover:bg-slate-800 border border-white/15 text-slate-200 text-xs font-semibold disabled:opacity-50"
          >
            {cancelLabel}
          </button>
          <button
            type="button"
            disabled={busy}
            onClick={() => void onConfirm()}
            className={`h-10 px-4 rounded-xl text-xs font-bold flex items-center justify-center gap-1.5 disabled:opacity-50 ${confirmBtnCls}`}
          >
            {busy ? 'Đang xử lý...' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
};
