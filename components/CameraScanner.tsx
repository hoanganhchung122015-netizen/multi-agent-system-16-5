
import React, { useRef, useEffect, useState } from 'react';
import { Camera, RotateCcw, Check, X, AlertCircle } from 'lucide-react';

interface CameraScannerProps {
  onCapture: (base64Data: string) => void;
  onClose: () => void;
}

const CameraScanner: React.FC<CameraScannerProps> = ({ onCapture, onClose }) => {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [countdown, setCountdown] = useState<number | null>(3);
  const [capturedImage, setCapturedImage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const streamRef = useRef<MediaStream | null>(null);

  const startCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1920 }, height: { ideal: 1080 } },
        audio: false
      });
      streamRef.current = stream;
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
        setCountdown(3);
        setCapturedImage(null);
        setError(null);
      }
    } catch (err) {
      console.error("Camera access error:", err);
      setError("Không thể truy cập camera. Vui lòng cấp quyền.");
    }
  };

  const stopCamera = () => {
    if (streamRef.current) {
      streamRef.current.getTracks().forEach(track => track.stop());
      streamRef.current = null;
    }
  };

  useEffect(() => {
    startCamera();
    return () => stopCamera();
  }, []);

  useEffect(() => {
    let timer: number;
    if (countdown !== null && countdown > 0 && !capturedImage && !error) {
      timer = window.setTimeout(() => setCountdown(countdown - 1), 1000);
    } else if (countdown === 0 && !capturedImage) {
      captureImage();
    }
    return () => clearTimeout(timer);
  }, [countdown, capturedImage, error]);

  const captureImage = () => {
    if (videoRef.current && canvasRef.current) {
      const video = videoRef.current;
      const canvas = canvasRef.current;
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext('2d');
      if (ctx) {
        ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
        const base64 = canvas.toDataURL('image/jpeg', 0.8);
        setCapturedImage(base64);
        setCountdown(null);
        stopCamera();
      }
    }
  };

  const handleRetry = () => {
    setCapturedImage(null);
    startCamera();
  };

  const handleConfirm = () => {
    if (capturedImage) {
      onCapture(capturedImage);
    }
  };

  return (
    <div className="fixed inset-0 z-[100] bg-black flex flex-col items-center justify-center animate-in fade-in duration-300">
      {!capturedImage ? (
        <div className="relative w-full h-full flex flex-col items-center justify-center">
          <video
            ref={videoRef}
            autoPlay
            playsInline
            className="w-full h-full object-cover"
          />
          
          {/* Overlay Rectangular Frame */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="w-[85%] h-[30%] md:w-[60%] md:h-[40%] border-[4px] border-emerald-400 rounded-[2rem] shadow-[0_0_0_9999px_rgba(0,0,0,0.6)] relative">
              {/* Corner Accents */}
              <div className="absolute -top-2 -left-2 w-8 h-8 border-t-4 border-l-4 border-white rounded-tl-xl"></div>
              <div className="absolute -top-2 -right-2 w-8 h-8 border-t-4 border-r-4 border-white rounded-tr-xl"></div>
              <div className="absolute -bottom-2 -left-2 w-8 h-8 border-b-4 border-l-4 border-white rounded-bl-xl"></div>
              <div className="absolute -bottom-2 -right-2 w-8 h-8 border-b-4 border-r-4 border-white rounded-br-xl"></div>
              
              {/* Scanning Line Animation */}
              {!error && (
                <div className="absolute top-0 left-0 w-full h-1 bg-emerald-400/50 shadow-[0_0_15px_rgba(52,211,153,1)] animate-[scan_2s_ease-in-out_infinite]"></div>
              )}
            </div>
          </div>

          {/* Countdown Display */}
          {countdown !== null && countdown > 0 && (
            <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
              <span className="text-[12rem] font-black text-white/90 drop-shadow-2xl animate-pulse">
                {countdown}
              </span>
            </div>
          )}

          {error && (
            <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 bg-white p-8 rounded-[2rem] text-center max-w-xs shadow-2xl">
              <AlertCircle className="w-12 h-12 text-rose-500 mx-auto mb-4" />
              <p className="font-bold text-slate-800 mb-6">{error}</p>
              <button onClick={startCamera} className="bg-indigo-600 text-white px-6 py-3 rounded-xl font-bold uppercase text-xs tracking-widest">Thử lại</button>
            </div>
          )}

          <div className="absolute bottom-12 left-0 right-0 px-10 flex justify-between items-center text-white">
            <button onClick={onClose} className="p-4 bg-white/10 backdrop-blur-md rounded-full hover:bg-white/20 transition-all">
              <X className="w-6 h-6" />
            </button>
            <div className="text-center">
              <p className="text-[10px] font-black uppercase tracking-[0.3em] mb-1 opacity-70">Auto Scan Mode</p>
              <p className="text-sm font-bold">Soi đề bài vào khung xanh</p>
            </div>
            <div className="w-14 h-14" /> {/* Spacer */}
          </div>
        </div>
      ) : (
        <div className="w-full h-full flex flex-col bg-slate-950 p-6 md:p-12 animate-in zoom-in-95 duration-500">
          <div className="flex-1 flex flex-col items-center justify-center gap-8">
            <div className="relative group max-w-2xl w-full">
              <img src={capturedImage} className="w-full rounded-[3rem] border-4 border-white/10 shadow-2xl" alt="Captured" />
              <div className="absolute inset-0 rounded-[3rem] bg-indigo-600/10 mix-blend-overlay"></div>
            </div>
            
            <div className="text-center text-white">
              <h3 className="text-2xl font-black tracking-tight mb-2">Đã nhận diện đề bài</h3>
              <p className="text-slate-400 text-sm font-medium">Bấm "Gửi AI" để bắt đầu giải bài tập</p>
            </div>
          </div>

          <div className="flex gap-4 max-w-md mx-auto w-full pb-10">
            <button 
              onClick={handleRetry} 
              className="flex-1 py-5 bg-white/10 text-white rounded-[1.5rem] font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 hover:bg-white/20 transition-all border border-white/5"
            >
              <RotateCcw className="w-5 h-5" />
              Chụp lại
            </button>
            <button 
              onClick={handleConfirm} 
              className="flex-[1.5] py-5 bg-indigo-600 text-white rounded-[1.5rem] font-black uppercase text-xs tracking-widest flex items-center justify-center gap-3 hover:scale-105 shadow-2xl shadow-indigo-500/30 transition-all"
            >
              <Check className="w-6 h-6" />
              Gửi AI
            </button>
          </div>
        </div>
      )}
      <canvas ref={canvasRef} className="hidden" />
      <style>{`
        @keyframes scan {
          0%, 100% { top: 0%; }
          50% { top: 100%; }
        }
      `}</style>
    </div>
  );
};

export default CameraScanner;
