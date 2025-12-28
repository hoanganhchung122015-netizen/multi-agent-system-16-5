
import React from 'react';

interface LayoutProps {
  children: React.ReactNode;
  onBack?: () => void;
  title?: string;
}

export const Layout: React.FC<LayoutProps> = React.memo(({ children, onBack, title }) => {
  return (
    <div className="min-h-screen flex flex-col bg-white text-slate-900">
      {/* Header liền mạch */}
      <header className="pt-8 pb-4 px-6 text-center relative">
        {onBack && (
          <button 
            onClick={onBack}
            className="absolute left-6 top-8 flex items-center justify-center text-blue-600 hover:text-blue-700 transition-all duration-300 group p-2.5 rounded-2xl bg-blue-50/50 hover:bg-blue-100 active:scale-90 shadow-sm border border-blue-100/20"
            aria-label="Quay lại"
          >
            <svg 
              xmlns="http://www.w3.org/2000/svg" 
              width="22" 
              height="22" 
              viewBox="0 0 24 24" 
              fill="none" 
              stroke="currentColor" 
              strokeWidth="2.5" 
              strokeLinecap="round" 
              strokeLinejoin="round"
              className="group-hover:-translate-x-0.5 transition-transform"
            >
              <path d="M19 12H5"/>
              <path d="m12 19-7-7 7-7"/>
            </svg>
          </button>
        )}
        <div className="space-y-1">
          <h1 className="text-2xl font-black tracking-tighter text-slate-900 uppercase">Symbiotic AI</h1>
          <h2 className="text-sm font-bold text-slate-400 tracking-widest uppercase">Multi Agent Systems</h2>
          <p className="text-xs font-medium text-indigo-600 mt-1 italic">Gia sư ảo thông minh của mọi thế hệ học sinh</p>
          {title && (
            <div className="pt-4 flex justify-center">
              <span className="px-4 py-1 bg-indigo-50 text-indigo-700 rounded-full text-sm font-bold tracking-wide uppercase">
                {title}
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Nội dung chính không chia khối rời rạc */}
      <main className="flex-1 max-w-2xl mx-auto w-full px-6 py-4">
        {children}
      </main>

      {/* Footer mượt mà */}
      <footer className="py-12 px-6 text-center mt-12">
        <div className="space-y-1 opacity-80">
          <div className="text-lg font-black text-slate-800 uppercase tracking-tight">Dự án KHKT 2025</div>
          <div className="text-xs font-semibold text-slate-500 uppercase tracking-widest">Thiết kế bởi nhóm AI Trường THPT Mai Sơn</div>
        </div>
      </footer>
    </div>
  );
});