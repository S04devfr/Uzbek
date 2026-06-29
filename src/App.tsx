import React, { useState, useEffect, useRef } from "react";
import { 
  Volume2, 
  Sparkles, 
  Download, 
  Play, 
  Pause, 
  RefreshCw, 
  Clock, 
  Trash2, 
  FileText, 
  Sliders, 
  Type, 
  Disc, 
  Info, 
  Check, 
  AlertCircle 
} from "lucide-react";

declare global {
  interface Window {
    lamejs?: any;
  }
}

interface HistoryItem {
  id: string;
  text: string;
  voiceName: string;
  style: string;
  speed: number;
  audio: string; // Base64 Raw PCM
  timestamp: string;
}

const PRESETS = [
  {
    id: "salom",
    label: "Salomlashish",
    text: "Assalomu alaykum! O'zbek ovoz sun'iy intellekt xizmatiga xush kelibsiz. Biz bilan istalgan matnni tabiiy va ravon ovozga sintez qilishingiz mumkin."
  },
  {
    id: "yangilik",
    label: "Yangiliklar",
    text: "Xayrli kun, hurmatli tinglovchilar! Bugun poytaxtimizda eng so'nggi texnologiyalar haftaligi boshlandi. Ko'plab xalqaro mutaxassislar ishtirok etmoqda."
  },
  {
    id: "sherin",
    label: "She'riyat",
    text: "O'zbekiston, ey ona vatan, sening tuprog'ing muqaddas, sening tabiating go'zal. Har bir go'shangda mehr va sadoqat barq uradi."
  },
  {
    id: "ilmiy",
    label: "Ilmiy ma'ruzalar",
    text: "Inson miyasi neyronlari faoliyati va ularning matematik modellari bugungi kunda neyron tarmoqlarining asosiy fundamenti hisoblanadi."
  }
];

const VOICES = [
  { name: "Dilnoza", gender: "Ayol", desc: "Mayin va ifodali ovoz (Tavsiya etiladi!)", system: "Zephyr" },
  { name: "Madina", gender: "Ayol", desc: "Aniq va ravon ma'ruzachi ovozi.", system: "Kore" },
  { name: "Sardor", gender: "Erkak", desc: "Yoqimli, samimiy va do'stona ovoz.", system: "Puck" },
  { name: "Jasur", gender: "Erkak", desc: "Shiddatli, chuqur va vazmin ovoz.", system: "Charon" },
  { name: "Farrux", gender: "Erkak", desc: "Muloyim va iliq nutq ohangi.", system: "Fenrir" }
];

const STYLES = [
  { id: "natural", name: "Tabiiy / Oddiy", value: "Tabiiy / Oddiy" },
  { id: "cheerful", name: "Xushchaqchaq", value: "Xushchaqchaq" },
  { id: "calm", name: "Sokin va muloyim", value: "Sokin va muloyim" },
  { id: "serious", name: "Jiddiy / Rasmiy", value: "Jiddiy / Rasmiy" },
  { id: "dramatic", name: "Hayajonli / Dramatik", value: "Hayajonli / Dramatik" }
];

export default function App() {
  // Input parameters
  const [text, setText] = useState<string>("Assalomu alaykum! O'zbek ovoz sun'iy intellekt xizmatiga xush kelibsiz.");
  const [selectedVoice, setSelectedVoice] = useState<string>("Dilnoza");
  const [selectedStyle, setSelectedStyle] = useState<string>("Tabiiy / Oddiy");
  const [speed, setSpeed] = useState<number>(1.0);

  // States
  const [isEnhancing, setIsEnhancing] = useState<boolean>(false);
  const [isSynthesizing, setIsSynthesizing] = useState<boolean>(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Active audio state
  const [activeAudio, setActiveAudio] = useState<string | null>(null); // Base64 raw PCM
  const [isPlaying, setIsPlaying] = useState<boolean>(false);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [waveformBars, setWaveformBars] = useState<number[]>([]);
  const [mp3BlobUrl, setMp3BlobUrl] = useState<string | null>(null);
  const [wavBlobUrl, setWavBlobUrl] = useState<string | null>(null);

  // History state
  const [history, setHistory] = useState<HistoryItem[]>([]);

  // Refs
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animationFrameRef = useRef<number | null>(null);

  // 1. Load History on Mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem("uzbek_tts_history");
      if (stored) {
        setHistory(JSON.parse(stored));
      }
    } catch (e) {
      console.error("Fayl tarixini yuklashda xatolik:", e);
    }
  }, []);

  // 2. Save History helper
  const saveHistory = (items: HistoryItem[]) => {
    try {
      setHistory(items);
      localStorage.setItem("uzbek_tts_history", JSON.stringify(items));
    } catch (e) {
      console.error("Fayl tarixini saqlashda xatolik:", e);
    }
  };

  // 3. Setup or update Audio Object source
  useEffect(() => {
    if (!activeAudio) return;

    // Build standard 44-byte WAV header for the raw 24kHz 16-bit Mono PCM
    const wavBlob = pcmToWav(activeAudio);
    const wavUrl = URL.createObjectURL(wavBlob);
    setWavBlobUrl(wavUrl);

    // Convert raw PCM to MP3 using lamejs
    const mp3Blob = encodePcmToMp3(activeAudio);
    if (mp3Blob) {
      const mp3Url = URL.createObjectURL(mp3Blob);
      setMp3BlobUrl(mp3Url);
    } else {
      setMp3BlobUrl(null);
    }

    // Generate dynamic waveform bars from raw bytes
    const bars = getPcmAmplitudes(activeAudio, 45);
    setWaveformBars(bars);

    // Set src to stable audio element
    if (audioRef.current) {
      audioRef.current.src = wavUrl;
      audioRef.current.playbackRate = speed;
      setCurrentTime(0);
      setIsPlaying(false);
    }

    // Cleanup Blob URLs
    return () => {
      URL.revokeObjectURL(wavUrl);
    };
  }, [activeAudio]);

  // Bind playbackRate to speed state in real time
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.playbackRate = speed;
    }
  }, [speed]);

  // Setup Visualizer on user interaction play
  const startVisualizer = () => {
    const canvas = canvasRef.current;
    const audioEl = audioRef.current;
    if (!canvas || !audioEl) return;

    try {
      if (!audioContextRef.current) {
        const AudioContextClass = window.AudioContext || (window as any).webkitAudioContext;
        const ctx = new AudioContextClass();
        const analyser = ctx.createAnalyser();
        analyser.fftSize = 64; // Gives 32 frequency bins

        const source = ctx.createMediaElementSource(audioEl);
        source.connect(analyser);
        analyser.connect(ctx.destination);

        audioContextRef.current = ctx;
        analyserRef.current = analyser;
      }

      // Resume context if suspended
      if (audioContextRef.current.state === "suspended") {
        audioContextRef.current.resume();
      }

      const draw = () => {
        animationFrameRef.current = requestAnimationFrame(draw);
        const analyser = analyserRef.current;
        const canvasCtx = canvas.getContext("2d");
        if (!analyser || !canvasCtx) return;

        const bufferLength = analyser.frequencyBinCount;
        const dataArray = new Uint8Array(bufferLength);
        analyser.getByteFrequencyData(dataArray);

        const width = canvas.width;
        const height = canvas.height;
        canvasCtx.fillStyle = "#0f172a"; // Deep Slate slate-900 background
        canvasCtx.fillRect(0, 0, width, height);

        const barWidth = (width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;

        for (let i = 0; i < bufferLength; i++) {
          barHeight = dataArray[i];

          // Vibrant teal to cyan gradient
          const gradient = canvasCtx.createLinearGradient(0, height, 0, 0);
          gradient.addColorStop(0, "#14b8a6"); // teal-500
          gradient.addColorStop(0.5, "#06b6d4"); // cyan-500
          gradient.addColorStop(1, "#22d3ee"); // cyan-400

          canvasCtx.fillStyle = gradient;
          const drawHeight = (barHeight / 255) * height * 0.9;
          
          canvasCtx.beginPath();
          const radius = Math.min(barWidth / 2, 4);
          if (canvasCtx.roundRect) {
            canvasCtx.roundRect(x, height - drawHeight, barWidth - 2, drawHeight, radius);
          } else {
            canvasCtx.rect(x, height - drawHeight, barWidth - 2, drawHeight);
          }
          canvasCtx.fill();

          x += barWidth;
        }
      };

      if (animationFrameRef.current) {
        cancelAnimationFrame(animationFrameRef.current);
      }
      draw();
    } catch (err) {
      console.error("Audio Context setup failed:", err);
    }
  };

  const stopVisualizer = () => {
    if (animationFrameRef.current) {
      cancelAnimationFrame(animationFrameRef.current);
      animationFrameRef.current = null;
    }
  };

  // Play / Pause toggler
  const togglePlay = () => {
    const audioEl = audioRef.current;
    if (!audioEl) return;

    if (isPlaying) {
      audioEl.pause();
      setIsPlaying(false);
      stopVisualizer();
    } else {
      audioEl.play().then(() => {
        setIsPlaying(true);
        startVisualizer();
      }).catch(err => {
        console.error("Play block:", err);
      });
    }
  };

  // Waveform click seek calculations
  const handleWaveformClick = (e: React.MouseEvent<HTMLDivElement>) => {
    const audioEl = audioRef.current;
    if (!audioEl || duration === 0) return;

    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const pct = x / rect.width;
    const seekTime = pct * duration;
    audioEl.currentTime = seekTime;
    setCurrentTime(seekTime);
  };

  // Enhance Text API
  const handleEnhanceText = async () => {
    if (text.trim() === "") return;
    setIsEnhancing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const response = await fetch("/api/enhance-text", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Matnni imlo tekshirishda xatolik yuz berdi.");
      }

      setText(data.correctedText);
      setSuccessMsg("Matn muvaffaqiyatli tahrirlandi va imlo xatolari to'g'rilandi!");
    } catch (err: any) {
      setErrorMsg(err.message || "Tahrirlovchi bilan aloqa o'rnatishda xatolik.");
    } finally {
      setIsEnhancing(false);
    }
  };

  // Speech Synthesis API
  const handleSynthesis = async () => {
    if (text.trim() === "") {
      setErrorMsg("Iltimos, sintez qilish uchun matn kiriting.");
      return;
    }
    if (text.length > 1200) {
      setErrorMsg("Kechirasiz, matn hajmi 1200 belgidan oshmasligi kerak.");
      return;
    }

    setIsSynthesizing(true);
    setErrorMsg(null);
    setSuccessMsg(null);

    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          text,
          voiceName: selectedVoice,
          style: selectedStyle,
          speed
        })
      });
      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || "Ovoz sintez qilishda xatolik yuz berdi.");
      }

      const rawPcm = data.audio;
      setActiveAudio(rawPcm);

      // Create new history record
      const newHistoryItem: HistoryItem = {
        id: Math.random().toString(36).substring(2, 11),
        text: text,
        voiceName: selectedVoice,
        style: selectedStyle,
        speed: speed,
        audio: rawPcm,
        timestamp: new Date().toLocaleTimeString("uz-UZ", { hour: '2-digit', minute: '2-digit', second: '2-digit' })
      };

      const updatedHistory = [newHistoryItem, ...history.filter(h => h.text !== text)].slice(0, 6);
      saveHistory(updatedHistory);
      setSuccessMsg("Ovoz muvaffaqiyatli sintez qilindi! O'ng tomondagi pleer orqali tinglashingiz va yuklab olishingiz mumkin.");

      // Auto start playing
      setTimeout(() => {
        if (audioRef.current) {
          audioRef.current.play().then(() => {
            setIsPlaying(true);
            startVisualizer();
          }).catch(e => console.log("Avtomatik ijro to'xtatildi:", e));
        }
      }, 300);

    } catch (err: any) {
      setErrorMsg(err.message || "Server bilan bog'lanishda xatolik yuz berdi.");
    } finally {
      setIsSynthesizing(false);
    }
  };

  // Preset Chips Loader
  const handleLoadPreset = (presetText: string) => {
    setText(presetText);
    setSuccessMsg("Tayyor andoza matni yuklandi.");
  };

  // History Row selection loader
  const handleLoadHistory = (item: HistoryItem) => {
    setText(item.text);
    setSelectedVoice(item.voiceName);
    setSelectedStyle(item.style);
    setSpeed(item.speed);
    setActiveAudio(item.audio);
    setSuccessMsg("Tarixdan saqlangan ovoz va sozlamalar yuklandi.");
  };

  // Delete individual history item
  const handleDeleteHistoryItem = (id: string, e: React.MouseEvent) => {
    e.stopPropagation();
    const updated = history.filter(item => item.id !== id);
    saveHistory(updated);
  };

  // Clear all history
  const handleClearHistory = () => {
    saveHistory([]);
    setSuccessMsg("Sintez tarixi butunlay tozalandi.");
  };

  // Format time util
  const formatTime = (time: number) => {
    if (isNaN(time)) return "00:00";
    const mins = Math.floor(time / 60);
    const secs = Math.floor(time % 60);
    return `${mins.toString().padStart(2, "0")}:${secs.toString().padStart(2, "0")}`;
  };

  // helper WAV writer
  const pcmToWav = (rawPcmBase64: string): Blob => {
    const binary = atob(rawPcmBase64);
    const len = binary.length;
    const buffer = new ArrayBuffer(44 + len);
    const view = new DataView(buffer);

    const writeString = (view: DataView, offset: number, str: string) => {
      for (let i = 0; i < str.length; i++) {
        view.setUint8(offset + i, str.charCodeAt(i));
      }
    };

    writeString(view, 0, "RIFF");
    view.setUint32(4, 36 + len, true);
    writeString(view, 8, "WAVE");
    writeString(view, 12, "fmt ");
    view.setUint32(16, 16, true);
    view.setUint16(20, 1, true); // PCM Format
    view.setUint16(22, 1, true); // Mono
    view.setUint32(24, 24000, true); // 24000Hz Sample rate
    view.setUint32(28, 24000 * 2, true); // Byte rate
    view.setUint16(32, 2, true); // Block align
    view.setUint16(34, 16, true); // 16 bit depth
    writeString(view, 36, "data");
    view.setUint32(40, len, true);

    for (let i = 0; i < len; i++) {
      view.setUint8(44 + i, binary.charCodeAt(i));
    }

    return new Blob([buffer], { type: "audio/wav" });
  };

  // helper MP3 encoder via lamejs loaded from index.html
  const encodePcmToMp3 = (rawPcmBase64: string): Blob | null => {
    if (!window.lamejs) {
      console.warn("LameJS topilmadi, MP3 konvertatsiya qilib bo'lmaydi.");
      return null;
    }

    try {
      const binary = atob(rawPcmBase64);
      const len = binary.length;
      const numSamples = Math.floor(len / 2);
      const samples = new Int16Array(numSamples);

      for (let i = 0; i < numSamples; i++) {
        const low = binary.charCodeAt(i * 2);
        const high = binary.charCodeAt(i * 2 + 1);
        let val = low | (high << 8);
        if (val & 0x8000) val |= ~0xffff;
        samples[i] = val;
      }

      const mp3encoder = new window.lamejs.Mp3Encoder(1, 24000, 128);
      const mp3Data: any[] = [];
      const sampleBlockSize = 576;

      for (let i = 0; i < numSamples; i += sampleBlockSize) {
        const sampleChunk = samples.subarray(i, i + sampleBlockSize);
        const mp3buf = mp3encoder.encodeBuffer(sampleChunk);
        if (mp3buf.length > 0) {
          mp3Data.push(mp3buf);
        }
      }

      const mp3buf = mp3encoder.flush();
      if (mp3buf.length > 0) {
        mp3Data.push(mp3buf);
      }

      return new Blob(mp3Data, { type: "audio/mp3" });
    } catch (e) {
      console.error("LameJS converting error:", e);
      return null;
    }
  };

  // Map amplitudes
  const getPcmAmplitudes = (rawPcmBase64: string, numBars: number = 45): number[] => {
    const binary = atob(rawPcmBase64);
    const len = binary.length;
    const numSamples = Math.floor(len / 2);
    const samples = new Int16Array(numSamples);

    for (let i = 0; i < numSamples; i++) {
      const low = binary.charCodeAt(i * 2);
      const high = binary.charCodeAt(i * 2 + 1);
      let val = low | (high << 8);
      if (val & 0x8000) val |= ~0xffff;
      samples[i] = val;
    }

    const blockSize = Math.floor(numSamples / numBars) || 1;
    const result: number[] = [];

    for (let i = 0; i < numBars; i++) {
      const start = i * blockSize;
      const end = Math.min(start + blockSize, numSamples);
      let sum = 0;
      for (let j = start; j < end; j++) {
        sum += Math.abs(samples[j]);
      }
      const avg = sum / (end - start || 1);
      result.push(avg);
    }

    const max = Math.max(...result) || 1;
    return result.map(v => Math.max(8, Math.round((v / max) * 100)));
  };

  return (
    <div className="flex flex-col h-screen w-full bg-slate-50 font-sans text-slate-900 overflow-hidden" id="app_root">
      
      {/* Hidden stable audio node */}
      <audio 
        ref={audioRef}
        onTimeUpdate={() => {
          if (audioRef.current) setCurrentTime(audioRef.current.currentTime);
        }}
        onDurationChange={() => {
          if (audioRef.current) setDuration(audioRef.current.duration || 0);
        }}
        onEnded={() => {
          setIsPlaying(false);
          stopVisualizer();
        }}
      />

      {/* Main Header */}
      <header className="h-16 flex items-center justify-between px-6 bg-white border-b border-slate-200 shrink-0 shadow-sm" id="app_header">
        <div className="flex items-center gap-3">
          <div className="h-10 w-10 bg-gradient-to-br from-teal-500 to-cyan-500 rounded-xl flex items-center justify-center shadow-lg shadow-teal-100">
            <Volume2 className="h-5.5 w-5.5 text-white" />
          </div>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-xl font-bold tracking-tight text-slate-800">O'zbek Ovoz AI</h1>
              <span className="px-2 py-0.5 bg-teal-500 text-white text-[10px] font-bold rounded-full uppercase tracking-widest">
                AI Speech
              </span>
            </div>
            <p className="text-xs text-slate-500">Eng ilg'or ovoz sintezlovchi platformasi</p>
          </div>
        </div>
        <div className="flex items-center gap-4">
          <div className="bg-slate-100 px-3 py-1.5 rounded-lg border border-slate-200 text-xs font-medium text-slate-600">
            Model: <span className="text-teal-600">gemini-3.1-flash-tts-preview</span>
          </div>
        </div>
      </header>

      {/* Main Container Dashboard */}
      <main className="flex-1 grid grid-cols-12 gap-0 overflow-hidden" id="app_main">
        
        {/* Left Panel (Col-span-7) */}
        <div className="col-span-7 flex flex-col p-6 space-y-4 overflow-y-auto border-r border-slate-200">
          
          {/* Error and Success notifications if active */}
          {errorMsg && (
            <div className="p-3 bg-red-50 border-l-4 border-red-500 text-red-800 rounded-lg flex items-start gap-3 shadow-2xs shrink-0" id="error_alert">
              <AlertCircle className="h-4.5 w-4.5 text-red-500 shrink-0 mt-0.5" />
              <div className="text-xs font-medium">
                <p>{errorMsg}</p>
              </div>
            </div>
          )}

          {successMsg && (
            <div className="p-3 bg-teal-50 border-l-4 border-teal-500 text-teal-800 rounded-lg flex items-start gap-3 shadow-2xs shrink-0" id="success_alert">
              <Check className="h-4.5 w-4.5 text-teal-600 shrink-0 mt-0.5" />
              <div className="text-xs font-medium">
                <p>{successMsg}</p>
              </div>
            </div>
          )}

          {/* Matn Kiritish Card */}
          <div className="bg-white rounded-xl border border-slate-200 shadow-sm overflow-hidden flex flex-col" id="input_card">
            
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50/50">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4 text-teal-600" />
                <h2 className="text-sm font-semibold text-slate-700">O'zbekcha matn kiritish</h2>
              </div>
              <span className="text-[11px] font-mono text-slate-400 bg-white px-2 py-0.5 rounded border border-slate-200">
                {text.length} / 1200 belgi
              </span>
            </div>

            {/* Textarea */}
            <textarea
              value={text}
              onChange={(e) => setText(e.target.value.slice(0, 1200))}
              placeholder="Matnni shu yerga yozing... (o' va g' harflariga e'tibor bering)"
              className="p-4 text-sm text-slate-800 placeholder-slate-400 focus:outline-none resize-none h-40 leading-relaxed bg-white border-0"
            />

            {/* Presets Chips wrapper */}
            <div className="p-3 bg-white border-t border-slate-100 flex flex-wrap gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.id}
                  onClick={() => handleLoadPreset(preset.text)}
                  type="button"
                  className="px-3 py-1.5 rounded-lg border border-slate-200 text-[11px] font-medium text-slate-600 hover:border-teal-500 hover:text-teal-600 bg-slate-50 transition-all cursor-pointer"
                >
                  💬 {preset.label}
                </button>
              ))}
            </div>

            {/* Orthography AI section */}
            <div className="px-4 py-3 bg-slate-50 border-t border-slate-100 flex items-center justify-between gap-4">
              <p className="text-[10px] text-slate-400 italic">
                Imlo to'g'rilash o' va g' harflarini, tinish belgilarini chiroyli tekshiradi.
              </p>
              <button
                onClick={handleEnhanceText}
                disabled={isEnhancing || text.trim() === ""}
                type="button"
                className="flex items-center gap-2 px-4 py-2 bg-white border border-teal-200 text-teal-700 rounded-lg text-xs font-semibold shadow-sm hover:bg-teal-50 transition-all cursor-pointer disabled:opacity-50"
              >
                {isEnhancing ? (
                  <RefreshCw className="h-3.5 w-3.5 animate-spin text-teal-600" />
                ) : (
                  <Sparkles className="h-3.5 w-3.5 text-teal-600" />
                )}
                Tahrirlash va Imlo to‘g‘rilash
              </button>
            </div>

          </div>

          {/* Settings Grid */}
          <div className="grid grid-cols-2 gap-4 flex-none" id="settings_card">
            
            {/* Ovoz va Personajlar Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col h-64">
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 flex items-center gap-2 border-b border-slate-100 pb-2 shrink-0">
                <Volume2 className="h-3.5 w-3.5 text-teal-600" />
                Ovoz va Personajlar
              </h3>
              <div className="space-y-2 overflow-y-auto pr-1 flex-1">
                {VOICES.map((v) => {
                  const isSelected = selectedVoice === v.name;
                  return (
                    <button
                      key={v.name}
                      onClick={() => setSelectedVoice(v.name)}
                      type="button"
                      className={`w-full flex items-center justify-between p-2 rounded-lg text-left transition-all cursor-pointer border ${
                        isSelected 
                          ? 'bg-teal-50 border-teal-200' 
                          : 'hover:bg-slate-50 border-transparent'
                      }`}
                    >
                      <div className="min-w-0 pr-2">
                        <p className={`text-xs font-bold ${isSelected ? 'text-teal-900' : 'text-slate-700'}`}>
                          {v.name} ({v.gender})
                        </p>
                        <p className={`text-[10px] truncate ${isSelected ? 'text-teal-600' : 'text-slate-500'}`}>
                          {v.desc}
                        </p>
                      </div>
                      {isSelected && (
                        <div className="h-2 w-2 rounded-full bg-teal-500 shrink-0"></div>
                      )}
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Nutq uslubi va Tempo Card */}
            <div className="bg-white rounded-xl border border-slate-200 p-4 shadow-sm flex flex-col justify-between h-64">
              
              <div>
                <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-3 border-b border-slate-100 pb-2">
                  Nutq Uslubi
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  {STYLES.map((st) => {
                    const isSelected = selectedStyle === st.value;
                    return (
                      <button
                        key={st.id}
                        onClick={() => setSelectedStyle(st.value)}
                        type="button"
                        className={`px-2 py-1.5 rounded-md text-[10px] font-bold transition-all cursor-pointer text-center border truncate ${
                          isSelected 
                            ? 'bg-slate-50 border-slate-200 text-slate-800' 
                            : 'border-transparent text-slate-500 hover:text-slate-700'
                        }`}
                        title={st.name}
                      >
                        {st.name.toUpperCase()}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Speed Tempo control */}
              <div className="pt-2 border-t border-slate-50">
                <div className="flex justify-between items-center mb-2">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500">Tempo</h3>
                  <span className="text-[10px] font-mono text-teal-600 font-bold">{speed.toFixed(1)}x ({speed === 1.0 ? 'Normal' : speed < 1.0 ? 'Sekin' : 'Tez'})</span>
                </div>
                
                <input
                  type="range"
                  min="0.5"
                  max="2.0"
                  step="0.1"
                  value={speed}
                  onChange={(e) => setSpeed(parseFloat(e.target.value))}
                  className="w-full h-1.5 bg-slate-100 rounded-full appearance-none cursor-pointer accent-teal-500"
                />

                <div className="flex justify-between mt-2 text-[9px] text-slate-400 font-medium">
                  <span>Sekin (0.5x)</span>
                  <span>Tez (2.0x)</span>
                </div>
              </div>

            </div>

          </div>

          {/* Main Synthesis Trigger Button */}
          <button
            onClick={handleSynthesis}
            disabled={isSynthesizing || text.trim() === ""}
            type="button"
            className="w-full h-14 bg-gradient-to-r from-teal-500 to-cyan-500 hover:from-teal-600 hover:to-cyan-600 text-white font-bold rounded-xl shadow-lg shadow-teal-200 flex items-center justify-center gap-3 transition-transform active:scale-[0.98] cursor-pointer disabled:opacity-50 shrink-0 uppercase tracking-wider"
          >
            {isSynthesizing ? (
              <>
                <RefreshCw className="h-5 w-5 animate-spin text-white" />
                <span>Ovoz sintez qilinmoqda...</span>
              </>
            ) : (
              <>
                <Volume2 className="h-5.5 w-5.5" />
                <span>MATNNI OVOZGA SINTEZ QILISH</span>
              </>
            )}
          </button>

        </div>

        {/* Right Preview Panel (Col-span-5) */}
        <div className="col-span-5 bg-slate-900 text-white flex flex-col overflow-hidden" id="player_capsule">
          
          {/* Player section container */}
          <div className="p-6 flex-1 flex flex-col overflow-y-auto min-h-0">
            
            <div className="flex items-center justify-between mb-6 shrink-0">
              <div className="flex items-center gap-2">
                <div className={`h-2 w-2 rounded-full bg-teal-400 ${isPlaying ? 'animate-ping' : 'animate-pulse'}`}></div>
                <h2 className="text-xs font-bold tracking-widest uppercase text-teal-400">
                  {!activeAudio ? "Kutish Rejimi" : "Tayyor Ovoz"}
                </h2>
              </div>
              <div className="text-[10px] text-slate-400 uppercase font-medium bg-white/5 px-2 py-1 rounded">
                Mono 24kHz • MP3 128kbps
              </div>
            </div>

            {/* Waveform / Player Card */}
            <div className="bg-slate-800/50 border border-slate-700/50 rounded-2xl p-6 flex flex-col justify-between flex-1 min-h-[220px]">
              
              {!activeAudio ? (
                <div className="flex flex-col items-center justify-center text-center space-y-4 my-auto" id="wait_state">
                  <div className="relative">
                    <div className="absolute -inset-4 bg-teal-500/20 rounded-full blur-xl animate-pulse"></div>
                    <Disc className="h-14 w-14 text-teal-400 animate-spin-slow relative opacity-50" />
                  </div>
                  <div className="space-y-1">
                    <p className="text-sm font-semibold">Hozircha hech qanday ovoz yo'q</p>
                    <p className="text-xs text-slate-400 max-w-[240px] leading-relaxed">
                      Sintez qilish tugmasini bosing yoki tayyor andozalardan birini tanlab ovoz hosil qiling.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="flex flex-col justify-between h-full w-full gap-4" id="active_playback_state">
                  
                  {/* Speaker Details */}
                  <div className="flex items-center justify-between border-b border-slate-800 pb-2">
                    <div className="text-left">
                      <p className="text-xs font-bold text-teal-400">{selectedVoice} ovozi</p>
                      <p className="text-[10px] text-slate-400">Ohang: {selectedStyle} • {speed}x</p>
                    </div>
                  </div>

                  {/* HTML5 Spectral Visualizer */}
                  <div className="bg-slate-950 rounded-lg overflow-hidden border border-slate-800 h-12 relative shrink-0">
                    <canvas 
                      ref={canvasRef} 
                      width={380} 
                      height={48} 
                      className="w-full h-full block opacity-75"
                    />
                  </div>

                  {/* Progressive Waveform Scrubber */}
                  <div 
                    onClick={handleWaveformClick}
                    className="flex items-end gap-[2px] h-14 w-full cursor-pointer select-none px-1 rounded hover:bg-slate-800/35 transition-colors"
                    title="Yo'lakni boshqarish uchun bosing"
                  >
                    {waveformBars.map((barHeight, idx) => {
                      const progressPercent = duration > 0 ? (currentTime / duration) : 0;
                      const isPlayed = (idx / waveformBars.length) < progressPercent;
                      return (
                        <div
                          key={idx}
                          style={{ height: `${barHeight}%` }}
                          className={`w-full rounded-t transition-all ${
                            isPlayed 
                              ? 'bg-teal-400 shadow-[0_0_8px_rgba(45,212,191,0.55)]' 
                              : 'bg-slate-700'
                          }`}
                        />
                      );
                    })}
                  </div>

                  {/* Player timeline and Play triggers */}
                  <div className="flex justify-between items-center mt-2 shrink-0">
                    <span className="text-[10px] font-mono text-slate-500">{formatTime(currentTime)}</span>
                    <button
                      onClick={togglePlay}
                      type="button"
                      className="h-12 w-12 rounded-full bg-teal-500 hover:bg-teal-400 text-slate-950 flex items-center justify-center shadow-lg hover:shadow-teal-500/20 transition-all cursor-pointer transform active:scale-90"
                    >
                      {isPlaying ? (
                        <Pause className="h-5.5 w-5.5 stroke-[2.5px]" />
                      ) : (
                        <Play className="h-5.5 w-5.5 stroke-[2.5px] ml-1 fill-current text-slate-950" />
                      )}
                    </button>
                    <span className="text-[10px] font-mono text-slate-500">{formatTime(duration)}</span>
                  </div>

                </div>
              )}

            </div>

            {/* Export MP3 Card Section */}
            {mp3BlobUrl && (
              <div className="mt-6 p-4 rounded-xl border border-dashed border-slate-700 bg-white/5 shrink-0" id="mp3_download_card">
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="h-8 w-8 rounded-lg bg-slate-800 flex items-center justify-center">
                      <Download className="h-4.5 w-4.5 text-teal-400" />
                    </div>
                    <div className="text-left">
                      <p className="text-[11px] font-bold text-slate-200">MP3 Audio (HD 128kbps)</p>
                      <p className="text-[10px] text-slate-500">LameJS yordamida o'tkazish tayyor</p>
                    </div>
                  </div>
                  <a
                    href={mp3BlobUrl}
                    download={`ozbek-ovoz-${selectedVoice.toLowerCase()}-${Date.now()}.mp3`}
                    className="px-3 py-1.5 bg-teal-500/10 border border-teal-500/50 text-teal-400 rounded-lg text-[10px] font-bold hover:bg-teal-500 hover:text-white transition-all cursor-pointer inline-block"
                  >
                    TAYYOR MP3 YUKLASH
                  </a>
                </div>
              </div>
            )}

          </div>

          {/* History Panel (LocalStorage Backed) */}
          <div className="mt-auto p-6 bg-slate-950/50 border-t border-slate-800 shrink-0" id="history_panel">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-xs font-bold uppercase tracking-widest text-slate-500">Sintez Tarixi</h3>
              {history.length > 0 && (
                <button
                  onClick={handleClearHistory}
                  type="button"
                  className="text-[10px] text-slate-600 hover:text-red-400 uppercase font-bold tracking-tighter cursor-pointer transition-colors"
                >
                  Tarixni tozalash
                </button>
              )}
            </div>

            {/* History rows list mapping */}
            <div className="space-y-3 max-h-32 overflow-y-auto pr-1">
              {history.length === 0 ? (
                <div className="flex items-center justify-center p-4 border border-dashed border-slate-800 rounded-lg">
                  <p className="text-[10px] text-slate-600 italic">Hali ovozlar sintez qilinmadi</p>
                </div>
              ) : (
                history.map((item) => {
                  const isActive = activeAudio === item.audio;
                  return (
                    <div
                      key={item.id}
                      onClick={() => handleLoadHistory(item)}
                      className={`flex items-center justify-between p-2 rounded-lg border cursor-pointer transition-all ${
                        isActive 
                          ? 'bg-teal-500/10 border-teal-500/40' 
                          : 'bg-white/5 border-white/5 hover:bg-white/10'
                      }`}
                    >
                      <div className="flex items-center gap-3 min-w-0">
                        <div className="h-5 w-5 bg-slate-800 rounded flex items-center justify-center shrink-0">
                          {isActive && isPlaying ? (
                            <Pause className="h-3 w-3 text-teal-400" />
                          ) : (
                            <Play className="h-3 w-3 text-slate-400" />
                          )}
                        </div>
                        <p className="text-[11px] text-slate-300 truncate w-40">
                          "{item.text}"
                        </p>
                      </div>
                      <span className="text-[9px] text-slate-500 shrink-0">
                        {item.voiceName} • {item.timestamp}
                      </span>
                    </div>
                  );
                })
              )}
            </div>

          </div>

        </div>

      </main>

      {/* Footer copyright bar */}
      <footer className="h-8 px-6 bg-white border-t border-slate-200 flex items-center justify-between shrink-0" id="app_footer">
        <p className="text-[10px] text-slate-400 font-medium tracking-tight">
          © 2026 O'zbek Ovoz AI. Barcha huquqlar himoyalangan.
        </p>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1">
            <div className="h-1.5 w-1.5 rounded-full bg-emerald-500"></div>
            <span className="text-[10px] text-slate-500">Server Holati: Faol</span>
          </div>
          <span className="text-slate-300">|</span>
          <p className="text-[10px] text-slate-400 italic">
            Sintez va audio vizualizatsiya to'liq browserda va serverda xavfsiz boshqariladi.
          </p>
        </div>
      </footer>

    </div>
  );
}
