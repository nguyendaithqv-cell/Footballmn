import React from 'react';

interface State {
  hasError: boolean;
  errorMessage: string;
}

export class ErrorBoundary extends React.Component<
  { children: React.ReactNode },
  State
> {
  constructor(props: { children: React.ReactNode }) {
    super(props);
    this.state = { hasError: false, errorMessage: '' };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, errorMessage: error.message };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-[#0B1117] text-slate-100 flex items-center justify-center p-4">
          <div className="max-w-md w-full rounded-2xl bg-[#121B24] border border-red-500/30 p-6 space-y-4">
            <h2 className="font-display text-2xl font-bold text-white">
              Sự cố kết nối dữ liệu
            </h2>
            <p className="text-sm text-slate-300 leading-relaxed">
              Hệ thống phát hiện lỗi khi đồng bộ đám mây. Vui lòng thử tải lại trang hoặc đăng nhập lại.
            </p>
            <div className="rounded-lg bg-slate-950/70 border border-white/10 p-3 text-xs font-mono-num text-red-300 break-words max-h-36 overflow-auto">
              {this.state.errorMessage}
            </div>
            <button
              onClick={() => window.location.reload()}
              className="w-full h-11 rounded-xl bg-emerald-500 hover:bg-emerald-400 text-slate-950 font-semibold text-sm transition-colors"
            >
              Tải lại ứng dụng
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
