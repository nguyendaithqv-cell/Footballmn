import React, { useRef, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Download,
  FileJson,
  HardDriveDownload,
  RotateCcw,
  Upload,
  X,
} from 'lucide-react';
import {
  BackupSummary,
  ClubBackupBundle,
  parseAndValidateBackup,
} from '../lib/backupEngine';

interface BackupRestoreCardProps {
  title?: string;
  description?: string;
  canExport?: boolean;
  isAdmin?: boolean;
  onExportBackup?: (includeAdminData: boolean) => Promise<void> | void;
  onRestoreBackup: (bundle: ClubBackupBundle, restoreAdminData: boolean) => Promise<{ ok: boolean; message: string }>;
}

export const BackupRestoreCard: React.FC<BackupRestoreCardProps> = ({
  title = 'Sao lưu & Phục hồi Dữ liệu',
  description = 'Xuất toàn bộ sự nghiệp CLB, đội hình, cúp, túi đồ và xếp hạng ra file .json để chuyển sang tài khoản hoặc bản remix mới.',
  canExport = true,
  isAdmin = false,
  onExportBackup,
  onRestoreBackup,
}) => {
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [exporting, setExporting] = useState(false);
  const [includeAdminOnExport, setIncludeAdminOnExport] = useState(isAdmin);
  const [pendingBundle, setPendingBundle] = useState<ClubBackupBundle | null>(null);
  const [pendingSummary, setPendingSummary] = useState<BackupSummary | null>(null);
  const [restoreAdminAlso, setRestoreAdminAlso] = useState(true);
  const [restoring, setRestoring] = useState(false);
  const [feedback, setFeedback] = useState<{ ok: boolean; text: string } | null>(null);

  const handleExport = async () => {
    if (!onExportBackup) return;
    setExporting(true);
    setFeedback(null);
    try {
      await onExportBackup(isAdmin && includeAdminOnExport);
      setFeedback({
        ok: true,
        text: 'Đã tải xuống file sao lưu .json. Hãy giữ file này để phục hồi khi chuyển tài khoản hoặc remix!',
      });
    } catch (err) {
      setFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'Không thể xuất file sao lưu.',
      });
    } finally {
      setExporting(false);
    }
  };

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;

    setFeedback(null);
    setPendingBundle(null);
    setPendingSummary(null);

    try {
      const text = await file.text();
      const result = parseAndValidateBackup(text);
      if (!result.ok) {
        setFeedback({ ok: false, text: result.error });
        return;
      }
      setPendingBundle(result.bundle);
      setPendingSummary(result.summary);
      setRestoreAdminAlso(isAdmin && result.summary.adminItemsCount > 0);
    } catch {
      setFeedback({ ok: false, text: 'Không đọc được nội dung file sao lưu đã chọn.' });
    }
  };

  const handleConfirmRestore = async () => {
    if (!pendingBundle) return;
    setRestoring(true);
    setFeedback(null);
    try {
      const res = await onRestoreBackup(pendingBundle, isAdmin && restoreAdminAlso);
      setFeedback({ ok: res.ok, text: res.message });
      if (res.ok) {
        setPendingBundle(null);
        setPendingSummary(null);
      }
    } catch (err) {
      setFeedback({
        ok: false,
        text: err instanceof Error ? err.message : 'Phục hồi dữ liệu thất bại.',
      });
    } finally {
      setRestoring(false);
    }
  };

  return (
    <div className="rounded-2xl bg-[#121B24] border border-sky-500/25 p-4 space-y-3.5">
      <div className="flex items-start gap-3">
        <div className="w-10 h-10 rounded-xl bg-sky-500/15 border border-sky-500/30 flex items-center justify-center shrink-0">
          <HardDriveDownload className="w-5 h-5 text-sky-400" />
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-sm font-bold text-white">{title}</h3>
          <p className="text-xs text-slate-400 mt-0.5 leading-relaxed">{description}</p>
        </div>
      </div>

      {feedback && (
        <div
          className={`rounded-xl p-3 text-xs border flex items-start gap-2 ${
            feedback.ok
              ? 'bg-emerald-500/15 border-emerald-500/30 text-emerald-200'
              : 'bg-red-500/15 border-red-500/30 text-red-200'
          }`}
        >
          {feedback.ok ? (
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
          ) : (
            <AlertTriangle className="w-4 h-4 text-red-400 shrink-0 mt-0.5" />
          )}
          <span className="leading-relaxed">{feedback.text}</span>
        </div>
      )}

      {isAdmin && canExport && (
        <label className="flex items-center gap-2 text-xs text-slate-300 cursor-pointer">
          <input
            type="checkbox"
            checked={includeAdminOnExport}
            onChange={(e) => setIncludeAdminOnExport(e.target.checked)}
            className="accent-sky-400"
          />
          Kèm theo dữ liệu Admin (Tin tức, Market Override, Thông báo đẩy)
        </label>
      )}

      <div className={`grid gap-2 ${canExport ? 'grid-cols-1 sm:grid-cols-2' : 'grid-cols-1'}`}>
        {canExport && onExportBackup && (
          <button
            type="button"
            disabled={exporting}
            onClick={handleExport}
            className="h-11 px-4 rounded-xl bg-sky-500 hover:bg-sky-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
          >
            <Download className="w-4 h-4 shrink-0" />
            {exporting ? 'Đang tạo bản sao lưu...' : 'Tải bản sao lưu (.json)'}
          </button>
        )}

        <button
          type="button"
          disabled={restoring}
          onClick={() => fileInputRef.current?.click()}
          className="h-11 px-4 rounded-xl bg-[#0B1117] hover:bg-white/5 border border-white/15 text-slate-100 font-bold text-xs flex items-center justify-center gap-2 transition-colors disabled:opacity-60"
        >
          <Upload className="w-4 h-4 text-amber-400 shrink-0" />
          Chọn file để Phục hồi (.json)
        </button>

        <input
          ref={fileInputRef}
          type="file"
          accept=".json,application/json"
          onChange={handleFileChange}
          className="hidden"
        />
      </div>

      {pendingSummary && pendingBundle && (
        <div className="rounded-xl bg-[#0B1117] border border-amber-400/35 p-3.5 space-y-3">
          <div className="flex items-start justify-between gap-2">
            <div className="flex items-center gap-2">
              <FileJson className="w-4 h-4 text-amber-400 shrink-0" />
              <div>
                <p className="text-xs font-bold text-white">
                  Xác nhận phục hồi dữ liệu từ bản sao lưu
                </p>
                <p className="text-[11px] text-slate-400">
                  Xuất lúc {new Date(pendingSummary.exportedAt).toLocaleString('vi-VN')}
                </p>
              </div>
            </div>
            <button
              type="button"
              onClick={() => {
                setPendingBundle(null);
                setPendingSummary(null);
              }}
              className="text-slate-400 hover:text-white p-1"
              aria-label="Hủy xem trước sao lưu"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="rounded-lg bg-[#121B24] p-2">
              <p className="text-[10px] text-slate-400">HLV &amp; Câu lạc bộ</p>
              <p className="font-bold text-white truncate">
                {pendingSummary.managerName} · {pendingSummary.clubName}
              </p>
            </div>
            <div className="rounded-lg bg-[#121B24] p-2">
              <p className="text-[10px] text-slate-400">Mùa giải &amp; Vòng</p>
              <p className="font-mono-num font-bold text-emerald-400">
                {pendingSummary.season} · Vòng {pendingSummary.matchweek}
              </p>
            </div>
            <div className="rounded-lg bg-[#121B24] p-2">
              <p className="text-[10px] text-slate-400">Đội hình &amp; Ngân sách</p>
              <p className="font-mono-num font-bold text-amber-400">
                {pendingSummary.squadCount} cầu thủ · €{pendingSummary.transferBudget.toFixed(1)}M
              </p>
            </div>
            <div className="rounded-lg bg-[#121B24] p-2">
              <p className="text-[10px] text-slate-400">Danh hiệu &amp; Rank</p>
              <p className="font-mono-num font-bold text-sky-300">
                {pendingSummary.trophyCount} cúp {pendingSummary.hasArenaRank ? '· Kèm Rank' : ''}
              </p>
            </div>
          </div>

          {isAdmin && pendingSummary.adminItemsCount > 0 && (
            <label className="flex items-center gap-2 text-xs text-amber-200 cursor-pointer">
              <input
                type="checkbox"
                checked={restoreAdminAlso}
                onChange={(e) => setRestoreAdminAlso(e.target.checked)}
                className="accent-amber-400"
              />
              Phục hồi kèm {pendingSummary.adminItemsCount} mục dữ liệu Admin (Tin tức / Thị trường / Thông báo)
            </label>
          )}

          <p className="text-[11px] text-amber-300/90 leading-relaxed">
            Lưu ý: Thao tác này sẽ ghi đè sự nghiệp hiện tại của tài khoản đang đăng nhập bằng dữ liệu từ file sao lưu và lưu trực tiếp trên thiết bị.
          </p>

          <button
            type="button"
            disabled={restoring}
            onClick={handleConfirmRestore}
            className="w-full h-11 rounded-xl bg-amber-500 hover:bg-amber-400 text-slate-950 font-bold text-xs flex items-center justify-center gap-2 disabled:opacity-60"
          >
            <RotateCcw className={`w-4 h-4 ${restoring ? 'animate-spin' : ''}`} />
            {restoring ? 'Đang phục hồi dữ liệu...' : 'Xác nhận Phục hồi Dữ liệu ngay'}
          </button>
        </div>
      )}
    </div>
  );
};
