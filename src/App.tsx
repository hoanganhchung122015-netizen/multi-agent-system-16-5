
import React, { useState, useRef, useEffect, useCallback, useMemo } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkMath from 'remark-math';
import rehypeKatex from 'rehype-katex';
import { Subject, AgentType } from '../types';
import { Layout } from '../components/Layout';
import { processTask, generateSimilarQuiz, fetchTTSAudio, playStoredAudio, generateSummary } from '../services/geminiService';

interface DiaryEntry {
  date: string;
  subject: Subject;
  agentType: AgentType;
  input: string; 
  image?: string; 
  resultContent: string; 
  casioSteps?: string; 
}

// --- CONTROLLER LAYER: Custom Hook to manage Agent Logic ---
// Tách biệt hoàn toàn logic nghiệp vụ khỏi UI
const useAgentSystem = (selectedSubject: Subject | null) => {
  const [allResults, setAllResults] = useState<Partial<Record<AgentType, string>>>({});
  const [allAudios, setAllAudios] = useState<Partial<Record<AgentType, string>>>({});
  const [parsedSpeedResult, setParsedSpeedResult] = useState<{ finalAnswer: string, casioSteps: string } | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadingStatus, setLoadingStatus] = useState('');
  const [quiz, setQuiz] = useState<any>(null);
  
  const resetResults = useCallback(() => {
    setAllResults({});
    setAllAudios({});
    setParsedSpeedResult(null);
    setQuiz(null);
    setLoading(false);
    setLoadingStatus('');
  }, []);

  const runAgents = useCallback(async (
    primaryAgent: AgentType,
    allAgents: AgentType[],
    voiceText: string,
    image: string | null
  ) => {
    if (!selectedSubject || (!image && !voiceText)) return;

    setLoading(true);
    setLoadingStatus(`Đang gọi chuyên gia ${primaryAgent}...`);

    // Helper function to process single agent
    const processAgent = async (agent: AgentType) => {
      try {
        const res = await processTask(selectedSubject, agent, voiceText, image || undefined);
        setAllResults(prev => ({ ...prev, [agent]: res }));

        // Special handling for SPEED agent
        if (agent === AgentType.SPEED) {
          try {
            const parsed = JSON.parse(res);
            setParsedSpeedResult(parsed);
            // Generate related data asynchronously
            generateSimilarQuiz(parsed.finalAnswer).then(q => q && setQuiz(q));
            generateSummary(parsed.finalAnswer).then(sum => sum && fetchTTSAudio(sum).then(aud => aud && setAllAudios(p => ({...p, [agent]: aud}))));
          } catch (e) {
            console.error("JSON Parse Error", e);
             setAllResults(prev => ({ ...prev, [agent]: "Hãy tải lại dữ liệu cho chuyên gia" }));
          }
        } else {
           // Other agents
           generateSummary(res).then(sum => sum && fetchTTSAudio(sum).then(aud => aud && setAllAudios(p => ({...p, [agent]: aud}))));
        }
      } catch (error) {
        setAllResults(prev => ({ ...prev, [agent]: "Các chuyên gia đang trao đổi, xử lý dữ liệu" }));
      }
    };

    // 1. Run Primary Agent First (Priority)
    await processAgent(primaryAgent);
    setLoading(false); // UI Interactive immediately after primary agent

    // 2. Run Background Agents (Parallel) - "Non-blocking"
    const others = allAgents.filter(a => a !== primaryAgent);
    Promise.allSettled(others.map(processAgent));

  }, [selectedSubject]);

  return {
    allResults,
    allAudios,
    parsedSpeedResult,
    loading,
    loadingStatus,
    quiz,
    resetResults,
    runAgents
  };
};

const AgentLogo = React.memo(({ type, active }: { type: AgentType, active: boolean }) => {
  const cls = `w-3.5 h-3.5 ${active ? 'text-blue-600' : 'text-white'} transition-colors duration-300`;
  switch (type) {
    case AgentType.SPEED: return <svg className={cls} viewBox="0 0 24 24" fill="currentColor"><path d="M13 10V3L4 14H11V21L20 10H13Z" /></svg>;
    case AgentType.SOCRATIC: return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>;
    case AgentType.PERPLEXITY: return <svg className={cls} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><circle cx="11" cy="11" r="8"/><line x1="21" y1="21" x2="16.65" y2="16.65"/></svg>;
    default: return null;
  }
});

// --- VIEW LAYER: Main Component ---
const App: React.FC = () => {
  const [screen, setScreen] = useState<'HOME' | 'INPUT' | 'ANALYSIS' | 'DIARY'>('HOME');
  const [selectedSubject, setSelectedSubject] = useState<Subject | null>(null);
  const [selectedAgent, setSelectedAgent] = useState<AgentType>(AgentType.SPEED);
  
  // Input State
  const [image, setImage] = useState<string | null>(null);
  const [voiceText, setVoiceText] = useState('');
  const [quizAnswered, setQuizAnswered] = useState<string | null>(null);
  const [diaryEntries, setDiaryEntries] = useState<DiaryEntry[]>([]);
  
  // UI Interaction State
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [showSaveSuccess, setShowSaveSuccess] = useState(false);
  const [isCurrentResultSaved, setIsCurrentResultSaved] = useState(false);

  // Camera State
  const [capturedImagePreview, setCapturedImagePreview] = useState<string | null>(null);
  const [isImageCaptured, setIsImageCaptured] = useState<boolean>(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isCounting, setIsCounting] = useState(false);
  const [countdown, setCountdown] = useState(3);
  const [isRecording, setIsRecording] = useState(false);

  // Refs
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const recognitionRef = useRef<any>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const audioSourceRef = useRef<AudioBufferSourceNode | null>(null);

  const agents = useMemo(() => Object.values(AgentType), []);

  // Use the Controller Hook
  const { 
    allResults, allAudios, parsedSpeedResult, loading, loadingStatus, quiz, 
    resetResults, runAgents 
  } = useAgentSystem(selectedSubject);

  useEffect(() => {
    const saved = localStorage.getItem('symbiotic_diary');
    if (saved) setDiaryEntries(JSON.parse(saved));
  }, []);

  useEffect(() => {
    if (showSaveSuccess) {
      const timer = setTimeout(() => setShowSaveSuccess(false), 2000);
      return () => clearTimeout(timer);
    }
  }, [showSaveSuccess]);

  // Audio Cleanup
  useEffect(() => {
    return () => {
      if (audioSourceRef.current) {
        audioSourceRef.current.stop();
        audioSourceRef.current.disconnect();
        audioSourceRef.current = null;
        setIsSpeaking(false);
      }
    };
  }, [screen, selectedAgent]);

  const resetAppState = useCallback(() => {
    resetResults();
    setImage(null);
    setVoiceText('');
    setCapturedImagePreview(null);
    setIsImageCaptured(false);
    setQuizAnswered(null);
    setSelectedAgent(AgentType.SPEED);
    setIsCurrentResultSaved(false);
  }, [resetResults]);

  const handleSubjectSelect = useCallback((sub: Subject) => {
    resetAppState();
    if (sub === Subject.DIARY) {
      setSelectedSubject(null);
      setScreen('DIARY');
    } else {
      setSelectedSubject(sub);
      setScreen('INPUT');
    }
  }, [resetAppState]);

  const startCamera = useCallback(async () => {
    setImage(null);
    setVoiceText('');
    setCapturedImagePreview(null);
    setIsImageCaptured(false);
    setIsCurrentResultSaved(false);
    setShowCamera(true); setIsCounting(true); setCountdown(3);
    try {
      const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
      if (videoRef.current) videoRef.current.srcObject = s;
    } catch { 
      setShowCamera(false); 
      setIsCounting(false);
      alert("Không thể truy cập camera.");
    }
  }, []);

  useEffect(() => {
    if (isCounting && countdown > 0) {
      const timer = setTimeout(() => setCountdown(c => c - 1), 1000);
      return () => clearTimeout(timer);
    } else if (isCounting && countdown === 0) {
      if (videoRef.current && canvasRef.current) {
        canvasRef.current.width = videoRef.current.videoWidth;
        canvasRef.current.height = videoRef.current.videoHeight;
        canvasRef.current.getContext('2d')?.drawImage(videoRef.current, 0, 0);
        setCapturedImagePreview(canvasRef.current.toDataURL('image/jpeg', 0.7)); 
        setIsImageCaptured(true);
        (videoRef.current.srcObject as MediaStream)?.getTracks().forEach(t => t.stop());
        setShowCamera(false); 
        setIsCounting(false);
      }
    }
  }, [isCounting, countdown]);

  const toggleRecording = useCallback(() => {
    setImage(null);
    setCapturedImagePreview(null);
    setIsImageCaptured(false);
    setIsCurrentResultSaved(false);

    if (isRecording) {
      recognitionRef.current?.stop();
    } else {
      const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
      if (!SR) return alert("Không hỗ trợ giọng nói!");
      const r = new SR(); r.lang = 'vi-VN';
      r.onstart = () => setIsRecording(true);
      r.onend = () => setIsRecording(false);
      r.onresult = (e: any) => {
        setVoiceText(e.results[0][0].transcript);
        setImage(null);
        setIsCurrentResultSaved(false);
      };
      recognitionRef.current = r; r.start();
    }
  }, [isRecording]);

  const handleRetakePhoto = useCallback(() => {
    setCapturedImagePreview(null);
    setIsImageCaptured(false);
    startCamera();
  }, [startCamera]);

  const handleSaveCapturedPhoto = useCallback(() => {
    if (capturedImagePreview) {
      setImage(capturedImagePreview);
      setVoiceText('');
      setCapturedImagePreview(null);
      setIsImageCaptured(false);
      setIsCurrentResultSaved(false);
    }
  }, [capturedImagePreview]);

  const handleRunAnalysis = useCallback(() => {
     if (!selectedSubject || (!image && !voiceText) || isImageCaptured) return alert("Vui lòng nhập liệu!");
     setScreen('ANALYSIS');
     setIsCurrentResultSaved(false);
     runAgents(selectedAgent, agents, voiceText, image);
  }, [selectedSubject, image, voiceText, isImageCaptured, selectedAgent, agents, runAgents]);

  const handleSaveToDiary = useCallback(() => {
    if (!selectedSubject || !allResults[selectedAgent] || isCurrentResultSaved) return;

    let resultContentToSave = allResults[selectedAgent]!;
    let casioStepsToSave: string | undefined = undefined;

    if (selectedAgent === AgentType.SPEED && parsedSpeedResult) {
      resultContentToSave = parsedSpeedResult.finalAnswer;
      casioStepsToSave = parsedSpeedResult.casioSteps;
    }

    const newEntry: DiaryEntry = {
      date: new Date().toLocaleDateString('vi-VN', { year: 'numeric', month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit' }),
      subject: selectedSubject,
      agentType: selectedAgent,
      input: voiceText || "Hình ảnh",
      image: image || undefined,
      resultContent: resultContentToSave,
      casioSteps: casioStepsToSave,
    };

    const updatedDiary = [...diaryEntries, newEntry];
    setDiaryEntries(updatedDiary);
    localStorage.setItem('symbiotic_diary', JSON.stringify(updatedDiary));
    setShowSaveSuccess(true);
    setIsCurrentResultSaved(true);
  }, [selectedSubject, allResults, selectedAgent, isCurrentResultSaved, parsedSpeedResult, voiceText, image, diaryEntries]);

  // Optimize Markdown Render Config
  const markdownConfig = useMemo(() => ({
    remarkPlugins: [remarkMath],
    rehypePlugins: [rehypeKatex]
  }), []);

  return (
    <Layout 
      onBack={() => {
        if (screen === 'ANALYSIS') setScreen('INPUT');
        else if (screen === 'INPUT' || screen === 'DIARY') setScreen('HOME');
      }}
      title={screen !== 'HOME' ? (selectedSubject || (screen === 'DIARY' ? 'Nhật ký' : '')) : undefined}
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
              <span className="text-lg font-black mb-2 uppercase tracking-tight">{sub.name}</span>
              <span className="text-5xl">{sub.icon}</span>
            </button>
          ))}
        </div>
      )}

      {screen === 'INPUT' && (
        <div className="space-y-10 animate-in fade-in duration-500">
          <div className="w-full aspect-[16/10] bg-blue-50/70 rounded-[2.5rem] flex items-center justify-center overflow-hidden border-2 border-blue-100 relative shadow-inner">
            {showCamera ? (
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : capturedImagePreview ? (
              <img src={capturedImagePreview} className="p-4 h-full object-contain" alt="Ảnh đã chụp" />
            ) : image ? (
              <img src={image} className="p-4 h-full object-contain" alt="Ảnh đề bài" />
            ) : (
              <div className="p-10 text-center text-blue-900 font-bold text-sm leading-relaxed">{voiceText || "Vui lòng chụp ảnh hoặc ghi âm đề bài..."}</div>
            )}
            {isCounting && <div className="absolute inset-0 flex items-center justify-center text-7xl font-black text-white drop-shadow-lg">{countdown}</div>}
          </div>
          
          <div className="flex justify-between items-end px-4">
            {isImageCaptured ? (
              <>
                <div className="flex flex-col items-center group">
                  <button onClick={handleRetakePhoto} className="w-16 h-16 rounded-3xl bg-red-500 text-white shadow-lg active:scale-90 flex items-center justify-center hover:bg-red-600 transition-colors" aria-label="Chụp lại">
                    <span className="text-2xl">🔄</span>
                  </button>
                  <span className="text-[10px] font-black uppercase mt-3 text-red-500 opacity-60 group-hover:opacity-100">Chụp lại</span>
                </div>
                <div className="flex flex-col items-center group">
                  <button onClick={handleSaveCapturedPhoto} className="w-16 h-16 rounded-3xl bg-emerald-500 text-white shadow-lg active:scale-90 flex items-center justify-center hover:bg-emerald-600 transition-colors" aria-label="Lưu ảnh">
                    <span className="text-2xl">✅</span>
                  </button>
                  <span className="text-[10px] font-black uppercase mt-3 text-emerald-500 opacity-60 group-hover:opacity-100">Lưu</span>
                </div>
              </>
            ) : (
              <>
                {[{ l: 'Camera', i: '📸', a: startCamera }, { l: 'Thư viện', i: '🖼️', a: () => fileInputRef.current?.click() }, { l: isRecording ? 'Dừng' : 'Ghi âm', i: isRecording ? '⏹️' : '🎙️', a: () => toggleRecording() }].map((it) => (
                  <div key={it.l} className="flex flex-col items-center group">
                    <button onClick={it.a} className="w-16 h-16 rounded-3xl bg-blue-600 text-white shadow-lg active:scale-90 flex items-center justify-center hover:bg-blue-700 transition-colors" aria-label={it.l}>
                      <span className="text-2xl">{it.i}</span>
                    </button>
                    <span className="text-[10px] font-black uppercase mt-3 text-blue-600 opacity-60 group-hover:opacity-100">{it.l}</span>
                  </div>
                ))}
                <div className="flex flex-col items-center group">
                  <button onClick={handleRunAnalysis} disabled={(!image && !voiceText) || isImageCaptured} className="w-16 h-16 rounded-3xl bg-blue-600 text-white shadow-lg active:scale-90 flex items-center justify-center hover:bg-blue-700 transition-colors disabled:opacity-30 disabled:pointer-events-none" aria-label="Thực hiện">
                    <span className="text-2xl">🚀</span>
                  </button>
                  <span className="text-[10px] font-black uppercase mt-3 text-blue-600 opacity-60 group-hover:opacity-100">Thực hiện</span>
                </div>
              </>
            )}
          </div>
          <canvas ref={canvasRef} className="hidden" /><input type="file" ref={fileInputRef} onChange={(e) => {
            const f = e.target.files?.[0]; if (f) { const r = new FileReader(); r.onload = (e) => {
              const img = new Image();
              img.onload = () => {
                if (canvasRef.current) {
                  canvasRef.current.width = img.width;
                  canvasRef.current.height = img.height;
                  canvasRef.current.getContext('2d')?.drawImage(img, 0, 0);
                  setImage(canvasRef.current.toDataURL('image/jpeg', 0.7));
                  setVoiceText('');
                  setIsCurrentResultSaved(false);
                  setCapturedImagePreview(null);
                  setIsImageCaptured(false);
                }
              };
              img.src = e.target?.result as string;
            }; r.readAsDataURL(f); }
          }} className="hidden" accept="image/*" />
        </div>
      )}

      {screen === 'ANALYSIS' && (
        <div className="space-y-6 animate-in fade-in duration-500">
          <div className="flex items-center justify-center bg-blue-600 p-2 rounded-2xl shadow-lg text-white">
            <div className="flex flex-grow-0 flex-shrink-0 gap-0.5 justify-center">
              {agents.map((ag) => (
                <button key={ag} onClick={() => setSelectedAgent(ag)} className={`flex flex-col items-center justify-center gap-1.5 p-2 rounded-xl text-[8px] font-black uppercase transition-all whitespace-nowrap ${selectedAgent === ag ? 'bg-white text-blue-600 shadow-sm' : 'text-blue-100 hover:bg-blue-500'}`}>
                  <AgentLogo type={ag} active={selectedAgent === ag} />
                  <span>{ag}</span>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm relative min-h-[500px]">
            {loading && !allResults[selectedAgent] ? (
              <div className="absolute inset-0 flex flex-col items-center justify-center space-y-4">
                <div className="w-10 h-10 border-4 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                <p className="text-[10px] font-black uppercase text-blue-500 tracking-widest">{loadingStatus}</p>
              </div>
            ) : (
              <div className="space-y-8">
                <div className="space-y-4">
                  <div className="flex justify-between items-center relative">
                    <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{selectedAgent} - KẾT QUẢ</span>
                    <div className="flex items-center gap-2">
                      {showSaveSuccess && (
                          <span className="text-[10px] font-bold text-emerald-600 bg-emerald-50 px-3 py-1.5 rounded-full animate-in fade-in">
                              Đã lưu vào Nhật ký!
                          </span>
                      )}
                      <button 
                          onClick={handleSaveToDiary}
                          disabled={!allResults[selectedAgent] || isCurrentResultSaved}
                          className="flex items-center gap-1.5 p-2 bg-blue-50 text-blue-600 rounded-full disabled:opacity-20 transition-all active:scale-90"
                          aria-label="Lưu vào Nhật ký"
                      >
                          {isCurrentResultSaved ? (
                              <>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M20 6 9 17l-5-5"/></svg>
                                  <span className="text-xs font-bold">Đã lưu</span>
                              </>
                          ) : (
                              <>
                                  <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.121 2.121 0 0 1 3 3L7 19l-4 1 1-4L16.5 3.5z"/></svg>
                                  <span className="text-xs font-bold">Lưu nhật ký</span>
                              </>
                          )}
                      </button>
                      <button 
                          onClick={async () => {
                              if (allAudios[selectedAgent]) {
                                  setIsSpeaking(true);
                                  await playStoredAudio(allAudios[selectedAgent]!, audioSourceRef);
                                  setIsSpeaking(false);
                              }
                          }} 
                          disabled={!allAudios[selectedAgent] || isSpeaking} 
                          className="p-2 bg-blue-50 text-blue-600 rounded-full disabled:opacity-20 transition-all active:scale-90"
                          aria-label="Đọc kết quả"
                      >
                          <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3"><path d="M11 5L6 9H2v6h4l5 4V5z"/><path d="M15.54 8.46a5 5 0 0 1 0 7.07"/></svg>
                      </button>
                    </div>
                  </div>
                  <div className="prose prose-slate max-w-none text-sm math-font">
                    <ReactMarkdown
                      remarkPlugins={markdownConfig.remarkPlugins}
                      rehypePlugins={markdownConfig.rehypePlugins}
                    >
                      {selectedAgent === AgentType.SPEED && parsedSpeedResult ? parsedSpeedResult.finalAnswer : allResults[selectedAgent] || "Đang soạn thảo..."}
                    </ReactMarkdown>

                    {selectedAgent === AgentType.SPEED && parsedSpeedResult?.casioSteps && (
                        <div className="bg-emerald-50/50 p-4 mt-4 rounded-2xl border-l-4 border-emerald-500 shadow-sm">
                            <h4 className="text-xs font-black uppercase text-emerald-600 mb-1">Hướng dẫn Casio 580VN X</h4>
                            <div className="prose prose-slate max-w-none text-sm math-font whitespace-pre-wrap">
                                {parsedSpeedResult.casioSteps}
                            </div>
                        </div>
                    )}

                    {selectedAgent === AgentType.SPEED && quiz && (
                        <div className="bg-amber-50/50 p-4 mt-4 rounded-2xl border-l-4 border-amber-500 shadow-sm">
                            <h4 className="text-xs font-black uppercase text-amber-600 mb-1">2. Bài tập tương tự</h4>
                            <p className="font-bold text-slate-800 mb-2">{quiz.question}</p>
                            <div className="grid gap-2">
                            {quiz.options.map((o: string, i: number) => {
                                const l = String.fromCharCode(65 + i);
                                return (
                                <button key={i} onClick={() => setQuizAnswered(l)} disabled={!!quizAnswered} className={`w-full text-left px-4 py-3 rounded-xl border text-xs font-bold transition-all ${quizAnswered === l ? (l === quiz.answer ? 'bg-emerald-50 border-emerald-500 text-emerald-700' : 'bg-rose-50 border-rose-500 text-rose-700') : 'bg-white border-slate-100 hover:border-blue-200'}`}>
                                    <span className="opacity-30 mr-2 font-black">{l}.</span> {o}
                                </button>
                                );
                            })}
                            </div>
                        </div>
                    )}
                  </div>
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {screen === 'DIARY' && (
        <div className="animate-in fade-in slide-in-from-bottom-4 duration-500 space-y-6">
          {diaryEntries.length === 0 ? (
            <div className="py-20 text-center text-slate-400 italic text-sm bg-white rounded-3xl border border-slate-50">
              Lịch sử học tập trống.
            </div>
          ) : (
            diaryEntries.map((entry, index) => (
              <div key={index} className="bg-white rounded-[2rem] p-6 border border-slate-100 shadow-sm">
                <div className="flex justify-between items-center mb-4">
                  <span className="text-[10px] font-black uppercase text-slate-400 tracking-widest">{entry.date} - {entry.subject} - {entry.agentType}</span>
                </div>
                <div className="space-y-4">
                  <div className="bg-blue-50/70 rounded-2xl p-4 border-2 border-blue-100 relative shadow-inner">
                    <h4 className="text-[10px] font-black uppercase text-blue-600 mb-2">Đề bài:</h4>
                    {entry.image ? (
                      <img src={entry.image} alt="Đề bài" className="max-h-40 w-full object-contain rounded-lg" />
                    ) : (
                      <p className="text-sm font-bold text-blue-900">{entry.input}</p>
                    )}
                  </div>
                  <div className="bg-slate-50/70 rounded-2xl p-4 border-2 border-slate-100 shadow-inner">
                    <h4 className="text-[10px] font-black uppercase text-slate-600 mb-2">Kết quả từ chuyên gia {entry.agentType}:</h4>
                    <div className="prose prose-slate max-w-none text-sm math-font">
                      <ReactMarkdown
                        remarkPlugins={markdownConfig.remarkPlugins}
                        rehypePlugins={markdownConfig.rehypePlugins}
                      >
                        {entry.resultContent}
                      </ReactMarkdown>
                    </div>
                    {entry.casioSteps && (
                      <div className="bg-emerald-50/50 p-3 mt-3 rounded-xl border-l-4 border-emerald-500 shadow-sm">
                        <h5 className="text-[9px] font-black uppercase text-emerald-600 mb-1">Hướng dẫn Casio:</h5>
                        <div className="prose prose-slate max-w-none text-xs math-font whitespace-pre-wrap">
                          {entry.casioSteps}
                        </div>
                      </div>
                    )}
                  </div>
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
