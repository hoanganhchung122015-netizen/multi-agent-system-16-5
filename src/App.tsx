import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Subject, AgentType } from '../types';
import { Layout } from '../components/Layout';
import { optimizeImage, callSMASStream } from '../services/geminiService';

// --- TYPES & INTERFACES ---
interface DiaryEntry {
  date: string;
  subject: Subject;
  agentType: AgentType;
  input: string; 
  image?: string; 
  resultContent: string; 
  casioSteps?: string; 
}

// --- CONTROLLER: Xử lý luồng Stream "Siêu Tốc" ---
const useAgentSystem = (selectedSubject: Subject | null) => {
  const [allResults, setAllResults] = useState<Partial<Record<AgentType, string>>>({});
  const [parsedSpeedResult, setParsedSpeedResult] = useState<{ finalAnswer: string, casioSteps: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [quiz, setQuiz] = useState<any>(null);
  
  const runAgents = useCallback(async (voiceText: string, image: string | null) => {
    if (!selectedSubject) return;

    setLoading(true);
    setLoadingStatus("Đang gọi tổ chuyên gia...");
    setAllResults({});
    setQuiz(null);
    setParsedSpeedResult(null);

    try {
      // 1. Nén ảnh siêu tốc trước khi gửi
      let finalImage = image;
      if (image && image.startsWith('data:image')) {
        finalImage = await optimizeImage(image);
      }

      // 2. Gọi luồng Stream từ API
      const stream = await callSMASStream(selectedSubject, finalImage || undefined, voiceText);
      if (!stream) throw new Error("Không thể kết nối đến máy chủ.");

      const reader = stream.getReader();
      const decoder = new TextDecoder();
      let fullText = "";

      // 3. Đọc dữ liệu chảy về theo thời gian thực (Fix lỗi Unexpected end of JSON)
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;

        const chunk = decoder.decode(value, { stream: true });
        const lines = chunk.split("\n");

        for (const line of lines) {
          if (line.startsWith("data: ")) {
            try {
              const rawData = line.replace("data: ", "").trim();
              if (!rawData) continue;

              const data = JSON.parse(rawData);
              const textChunk = data.candidates[0].content.parts[0].text;
              fullText += textChunk;

              setLoadingStatus("Chuyên gia đang phân tích...");
              setAllResults(prev => ({ 
                ...prev, 
                [AgentType.SPEED]: "Đang nhận dữ liệu lời giải..." 
              }));
            } catch (e) { 
              // Bỏ qua lỗi parse từng mảnh lẻ để đợi mảnh cuối hoàn thiện JSON
              continue; 
            }
          }
        }
      }

      // 4. Xử lý dữ liệu cuối cùng sau khi Stream xong
      try {
        const finalData = JSON.parse(fullText);
        
        setParsedSpeedResult({
          finalAnswer: finalData.solution.ans,
          casioSteps: (finalData.solution.steps || []).join("\n\n")
        });
        
        setAllResults({
          [AgentType.SPEED]: finalData.solution.ans,
          [AgentType.SOCRATIC]: "### Phân tích mấu chốt:\n" + (finalData.solution.steps || []).join("\n\n"),
          [AgentType.PERPLEXITY]: "Hệ thống đã chuẩn bị bài tập tương tự bên dưới."
        });

        setQuiz(finalData.quiz);
      } catch (e) {
        console.error("JSON Error:", fullText);
        throw new Error("AI trả về định dạng không đúng. Hãy thử lại.");
      }

    } catch (error: any) {
      console.error("Lỗi:", error);
      setAllResults(prev => ({ 
        ...prev, 
        [AgentType.SPEED]: `⚠️ Lỗi: ${error.message || "Kết nối thất bại"}. Hãy kiểm tra API Key!` 
      }));
    } finally {
      setLoading(false);
      setLoadingStatus("");
    }
  }, [selectedSubject]);

  return { allResults, parsedSpeedResult, loading, loadingStatus, quiz, setAllResults, setQuiz, setParsedSpeedResult, runAgents };
};

// --- COMPONENT LOGO (Đã sửa lỗi SVG path) ---
const AgentLogo = React.memo(({ type, active }: { type: AgentType, active: boolean }) => {
  const cls = `w-3.5 h-3.5 ${active ? 'text-blue-600' : 'text-white'} transition-colors duration-300`;
  switch (type) {
    case AgentType.SPEED: 
      return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M13 10V3L4 14H11V21L20 10H13Z" /></svg>;
    case AgentType.SOCRATIC: 
      return (
        <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
          <circle cx="12" cy="12" r="10"/>
          <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/>
          <line x1="12" y1="17" x2="12.01" y2="17"/>
        </svg>
      );
    case AgentType.PERPLEXITY: 
      return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    default: return null;
  }
});

// --- MAIN VIEW ---
const App: React.FC = () => {
  const [screen, setScreen] = useState<'HOME' | 'INPUT' | 'ANALYSIS' | 'DIARY'>('HOME');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentType>(AgentType.SPEED);
  const [image, setImage] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState('');
  const [quizAnswered, setQuizAnswered] = useState<string | null>(null);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);

  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [showCamera, setShowCamera] = useState(false);
  const [isCounting, setIsCounting] = useState(false);
  const [countdown, setCountdown] = useState(3);

  const { allResults, parsedSpeedResult, loading, loadingStatus, quiz, runAgents, setAllResults, setQuiz, setParsedSpeedResult } = useAgentSystem(selectedSubject);

  const agents = useMemo(() => Object.values(AgentType), []);

  useEffect(() => {
    const saved = localStorage.getItem('symbiotic_diary');
    if (saved) setDiaryEntries(JSON.parse(saved));
  }, []);

  const handleSubjectSelect = (sub: Subject) => {
    setImage(null); setVoiceText(''); setQuiz(null); setAllResults({}); setParsedSpeedResult(null);
    setQuizAnswered(null);
    if (sub === Subject.DIARY) { setScreen('DIARY'); }
    else { setSelectedSubject(sub); setScreen('INPUT'); }
  };

  const startCamera = async () => {
    setShowCamera(true); setIsCounting(true); setCountdown(3);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch { setShowCamera(false); alert("Hãy cấp quyền camera!"); }
  };

  useEffect(() => {
    if (isCounting && countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else if (isCounting && countdown === 0) {
      capturePhoto();
    }
  }, [isCounting, countdown]);

  const capturePhoto = () => {
    if (videoRef.current && canvasRef.current) {
      const ctx = canvasRef.current.getContext('2d');
      canvasRef.current.width = videoRef.current.videoWidth;
      canvasRef.current.height = videoRef.current.videoHeight;
      ctx?.drawImage(videoRef.current, 0, 0);
      setImage(canvasRef.current.toDataURL('image/jpeg', 0.8));
      (videoRef.current.srcObject as MediaStream)?.getTracks().forEach(t => t.stop());
      setShowCamera(false); setIsCounting(false);
    }
  };

  const handleRunAnalysis = () => {
    if (!image && !voiceText) return alert("Vui lòng nhập đề bài hoặc chụp ảnh!");
    setScreen('ANALYSIS');
    runAgents(voiceText, image);
  };

  const handleSaveDiary = () => {
    if (!selectedSubject || !allResults[selectedAgent]) return;
    const newEntry: DiaryEntry = {
      date: new Date().toLocaleString('vi-VN'),
      subject: selectedSubject,
      agentType: selectedAgent,
      input: voiceText || "Hình ảnh",
      image: image || undefined,
      resultContent: allResults[selectedAgent] || "",
      casioSteps: parsedSpeedResult?.casioSteps
    };
    const updated = [...diaryEntries, newEntry];
    setDiaryEntries(updated);
    localStorage.setItem('symbiotic_diary', JSON.stringify(updated));
    setShowSaveSuccess(true);
    setTimeout(() => setShowSaveSuccess(false), 2000);
  };

  return (
    <Layout 
      onBack={() => setScreen(screen === 'ANALYSIS' ? 'INPUT' : 'HOME')} 
      title={selectedSubject || (screen === 'DIARY' ? 'Nhật ký' : 'SM-AS')}
    >
      {screen === 'HOME' && (
        <div className="grid grid-cols-2 gap-4 mt-4 animate-in fade-in duration-500">
          {[
            { name: Subject.MATH, color: 'bg-indigo-600', icon: '📐' },
            { name: Subject.PHYSICS, color: 'bg-violet-600', icon: '⚛️' },
            { name: Subject.CHEMISTRY, color: 'bg-emerald-600', icon: '🧪' },
            { name: Subject.DIARY, color: 'bg-amber-600', icon: '📔' },
          ].map((sub) => (
            <button key={sub.name} onClick={() => handleSubjectSelect(sub.name as Subject)} className={`${sub.color} aspect-square rounded-[2rem] flex flex-col items-center justify-center text-white shadow-xl active:scale-95 transition-all`}>
              <span className="text-lg font-black mb-2 uppercase">{sub.name}</span>
              <span className="text-5xl">{sub.icon}</span>
            </button>
          ))}
        </div>
      )}

      {screen === 'INPUT' && (
        <div className="space-y-8 animate-in fade-in duration-500">
          <div className="w-full aspect-[16/10] bg-blue-50/70 rounded-[2.5rem] flex items-center justify-center overflow-hidden border-2 border-blue-100 relative shadow-inner">
            {showCamera ? (
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : image ? (
              <img src={image} className="p-4 h-full object-contain" alt="Preview" />
            ) : (
              <div className="p-10 text-center text-blue-900 font-bold">{voiceText || "Đang chờ đề bài..."}</div>
            )}
            {isCounting && <div className="absolute inset-0 flex items-center justify-center text-7xl font-black text-white drop-shadow-lg">{countdown}</div>}
          </div>
          
          <div className="flex justify-around items-center px-4">
            <button onClick={startCamera} className="w-16 h-16 rounded-3xl bg-blue-600 text-white shadow-lg flex items-center justify-center active:scale-90 transition-all">📸</button>
            <button onClick={() => fileInputRef.current?.click()} className="w-16 h-16 rounded-3xl bg-blue-600 text-white shadow-lg flex items-center justify-center active:scale-90 transition-all">🖼️</button>
            <button onClick={handleRunAnalysis} className="w-20 h-20 rounded-[2rem] bg-indigo-700 text-white shadow-2xl flex items-center justify-center active:scale-90 transition-all text-3xl">🚀</button>
          </div>
          <input type="file" ref={fileInputRef} hidden accept="image/*" onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) { const r = new FileReader(); r.onload = (ev) => setImage(ev.target?.result as string); r.readAsDataURL(f); }
          }} />
          <canvas ref={canvasRef} hidden />
        </div>
      )}

      {screen === 'ANALYSIS' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex items-center justify-center bg-blue-600 p-2 rounded-2xl shadow-lg text-white">
            <div className="flex gap-1 justify-center overflow-x-auto">
              {agents.map((ag) => (
                <button key={ag} onClick={() => setSelectedAgent(ag)} className={`flex flex-col items-center p-2 rounded-xl text-[8px] font-black uppercase transition-all ${selectedAgent === ag ? 'bg-white text-blue-600 shadow-sm' : 'text-blue-100'}`}>
                  <AgentLogo type={ag} active={selectedAgent === ag} />
                  <span className="mt-1">{ag}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm relative min-h-[400px]">
            {loading ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black uppercase text-blue-500">{loadingStatus}</p>
              </div>
            ) : (
              <div className="animate-in fade-in slide-in-from-top-4 duration-700">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black uppercase text-slate-400">TRÌNH BÀY CHI TIẾT</span>
                  <button onClick={handleSaveDiary} className="p-2 bg-blue-50 text-blue-600 rounded-full active:scale-90 transition-all">
                    {showSaveSuccess ? "✅ Đã lưu" : "💾 Lưu"}
                  </button>
                </div>
                
                <div className="prose prose-slate max-w-none text-sm leading-relaxed">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>
                    {allResults[selectedAgent] || "Đang chuẩn bị nội dung..."}
                  </ReactMarkdown>
                </div>

                {selectedAgent === AgentType.SPEED && parsedSpeedResult?.casioSteps && (
                  <div className="mt-6 bg-emerald-50 p-4 rounded-2xl border-l-4 border-emerald-500">
                    <h4 className="text-[10px] font-black text-emerald-600 uppercase mb-2">Casio 580VN X:</h4>
                    <p className="text-sm whitespace-pre-wrap text-emerald-900">{parsedSpeedResult.casioSteps}</p>
                  </div>
                )}

                {quiz && (
                  <div className="mt-8 pt-8 border-t border-slate-100">
                    <h4 className="text-[10px] font-black text-amber-600 uppercase mb-4">Tự luyện tập:</h4>
                    <div className="bg-amber-50/50 p-5 rounded-[2rem]">
                      <p className="font-bold mb-4">{quiz.q}</p>
                      <div className="grid gap-2">
                        {(quiz.opt || []).map((o: string, i: number) => {
                          const char = String.fromCharCode(65+i);
                          const isCorrect = i === quiz.correct;
                          return (
                            <button key={i} onClick={() => setQuizAnswered(char)} className={`w-full text-left p-4 rounded-2xl border transition-all font-bold text-xs ${quizAnswered === char ? (isCorrect ? 'bg-emerald-500 border-emerald-500 text-white' : 'bg-red-500 border-red-500 text-white') : 'bg-white border-slate-100'}`}>
                              {char}. {o}
                            </button>
                          );
                        })}
                      </div>
                      {quizAnswered && <p className="mt-4 text-xs italic text-slate-500 font-medium">💡 Giải thích: {quiz.reason}</p>}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {screen === 'DIARY' && (
        <div className="space-y-4 animate-in fade-in duration-500">
          {diaryEntries.length === 0 ? (
            <p className="text-center py-10 text-slate-400 font-bold uppercase text-xs">Chưa có dữ liệu nhật ký</p>
          ) : (
            diaryEntries.slice().reverse().map((entry, idx) => (
              <div key={idx} className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black text-slate-400 uppercase">{entry.date} - {entry.subject}</span>
                </div>
                <p className="text-sm font-bold mb-3">Đề bài: {entry.input.substring(0, 50)}...</p>
                <div className="prose prose-slate text-xs border-t pt-4">
                  <ReactMarkdown remarkPlugins={[remarkMath]} rehypePlugins={[rehypeKatex]}>{entry.resultContent}</ReactMarkdown>
                </div>
              </div>
            ))
          )}
        </div>
      )}
    </Layout>
  );
};

export default App;
