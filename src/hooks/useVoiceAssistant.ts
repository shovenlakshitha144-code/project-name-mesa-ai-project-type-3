import { useCallback, useEffect, useRef, useState } from 'react';
import type { LanguageMode } from '../../shared/types';

interface SpeechRecognitionAlternative {
  transcript: string;
  confidence: number;
}
interface SpeechRecognitionResult {
  isFinal: boolean;
  length: number;
  [index: number]: SpeechRecognitionAlternative;
}
interface SpeechRecognitionEvent extends Event {
  resultIndex: number;
  results: {
    length: number;
    [index: number]: SpeechRecognitionResult;
  };
}
interface SpeechRecognitionInstance extends EventTarget {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: Event & { error?: string }) => void) | null;
  onend: (() => void) | null;
  start(): void;
  stop(): void;
  abort(): void;
}

declare global {
  interface Window {
    SpeechRecognition?: new () => SpeechRecognitionInstance;
    webkitSpeechRecognition?: new () => SpeechRecognitionInstance;
  }
}

function detectSinhalaChars(text: string): boolean {
  return /[\u0D80-\u0DFF]/.test(text);
}

function cleanTextForSpeech(text: string): string {
  return text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/[*_`#>~|]/g, ' ')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/\s+/g, ' ')
    .trim();
}

export function playActivationChime(): void {
  try {
    const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    const ctx = new AudioCtx();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();
    osc.type = 'sine';
    osc.frequency.setValueAtTime(587.33, ctx.currentTime);
    osc.frequency.exponentialRampToValueAtTime(880, ctx.currentTime + 0.14);
    gain.gain.setValueAtTime(0.08, ctx.currentTime);
    gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.22);
    osc.connect(gain);
    gain.connect(ctx.destination);
    osc.start();
    osc.stop(ctx.currentTime + 0.23);
    setTimeout(() => ctx.close().catch(() => {}), 350);
  } catch {
    // AudioContext blocked or unavailable
  }
}

export interface UseVoiceAssistantOptions {
  language: LanguageMode;
  onTranscriptReady: (text: string) => void;
}

export function useVoiceAssistant({ language, onTranscriptReady }: UseVoiceAssistantOptions) {
  const RecognitionCtor =
    typeof window !== 'undefined' ? window.SpeechRecognition || window.webkitSpeechRecognition : undefined;
  const speechRecognitionSupported = Boolean(RecognitionCtor);
  const speechSynthesisSupported = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const [isListening, setIsListening] = useState(false);
  const [wakeWordEnabled, setWakeWordEnabled] = useState(false);
  const [continuousMode, setContinuousMode] = useState(false);
  const [voiceOutputEnabled, setVoiceOutputEnabled] = useState(true);
  const [isSpeaking, setIsSpeaking] = useState(false);
  const [speechEnergy, setSpeechEnergy] = useState(0);
  const [micLevel, setMicLevel] = useState(0);
  const [interimTranscript, setInterimTranscript] = useState('');
  const [voiceStatusNote, setVoiceStatusNote] = useState<string | null>(null);
  const [availableVoices, setAvailableVoices] = useState<SpeechSynthesisVoice[]>([]);
  const [selectedVoiceURI, setSelectedVoiceURI] = useState<string>('');

  const activeRecRef = useRef<SpeechRecognitionInstance | null>(null);
  const wakeRecRef = useRef<SpeechRecognitionInstance | null>(null);
  const continuousRef = useRef(continuousMode);
  const wakeEnabledRef = useRef(wakeWordEnabled);
  const onTranscriptRef = useRef(onTranscriptReady);
  const micStreamRef = useRef<MediaStream | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);
  const vadRafRef = useRef<number>(0);
  const energyTimerRef = useRef<number>(0);

  continuousRef.current = continuousMode;
  wakeEnabledRef.current = wakeWordEnabled;
  onTranscriptRef.current = onTranscriptReady;

  // Load TTS voices
  useEffect(() => {
    if (!speechSynthesisSupported) return;
    const load = () => {
      const voices = window.speechSynthesis.getVoices();
      setAvailableVoices(voices);
    };
    load();
    window.speechSynthesis.onvoiceschanged = load;
    return () => {
      window.speechSynthesis.onvoiceschanged = null;
    };
  }, [speechSynthesisSupported]);

  // Real-time Microphone VAD meter
  const stopVadMeter = useCallback(() => {
    cancelAnimationFrame(vadRafRef.current);
    setMicLevel(0);
    if (micStreamRef.current) {
      micStreamRef.current.getTracks().forEach((t) => t.stop());
      micStreamRef.current = null;
    }
    if (audioCtxRef.current) {
      audioCtxRef.current.close().catch(() => {});
      audioCtxRef.current = null;
    }
  }, []);

  const startVadMeter = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      micStreamRef.current = stream;
      const AudioCtx = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      const ctx = new AudioCtx();
      audioCtxRef.current = ctx;
      const src = ctx.createMediaStreamSource(stream);
      const analyser = ctx.createAnalyser();
      analyser.fftSize = 256;
      src.connect(analyser);
      const data = new Uint8Array(analyser.frequencyBinCount);

      const loop = () => {
        analyser.getByteTimeDomainData(data);
        let sum = 0;
        for (let i = 0; i < data.length; i++) {
          const v = (data[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / data.length);
        setMicLevel(Math.min(1, rms * 4.5));
        vadRafRef.current = requestAnimationFrame(loop);
      };
      loop();
    } catch {
      // Mic permission denied or unavailable; SpeechRecognition handles its own error
    }
  }, []);

  const interruptSpeech = useCallback(() => {
    if (speechSynthesisSupported) {
      window.speechSynthesis.cancel();
    }
    window.clearInterval(energyTimerRef.current);
    setIsSpeaking(false);
    setSpeechEnergy(0);
  }, [speechSynthesisSupported]);

  const stopListening = useCallback(() => {
    if (activeRecRef.current) {
      try {
        activeRecRef.current.stop();
      } catch {
        // ignore
      }
      activeRecRef.current = null;
    }
    stopVadMeter();
    setIsListening(false);
    setInterimTranscript('');
  }, [stopVadMeter]);

  const getRecognitionLang = useCallback(() => {
    if (language === 'si') return 'si-LK';
    if (language === 'en') return 'en-US';
    return 'en-US';
  }, [language]);

  const startListening = useCallback(() => {
    if (!RecognitionCtor) {
      setVoiceStatusNote('Speech-to-text is not supported by this browser. Try Chrome, Edge, or Android Chrome.');
      return;
    }

    interruptSpeech();
    if (wakeRecRef.current) {
      try {
        wakeRecRef.current.abort();
      } catch {
        // ignore
      }
      wakeRecRef.current = null;
    }

    setVoiceStatusNote(null);
    const rec = new RecognitionCtor();
    rec.lang = getRecognitionLang();
    rec.interimResults = true;
    rec.continuous = false;
    activeRecRef.current = rec;

    let finalBuffer = '';

    rec.onresult = (event) => {
      let interim = '';
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const res = event.results[i];
        const transcript = res[0]?.transcript || '';
        if (res.isFinal) {
          finalBuffer += `${transcript} `;
        } else {
          interim += transcript;
        }
      }
      setInterimTranscript((finalBuffer + interim).trim());
    };

    rec.onerror = (event) => {
      if (event.error && event.error !== 'aborted' && event.error !== 'no-speech') {
        setVoiceStatusNote(`Microphone/Speech notice: ${event.error}`);
      }
    };

    rec.onend = () => {
      stopVadMeter();
      setIsListening(false);
      const committed = finalBuffer.trim();
      setInterimTranscript('');
      activeRecRef.current = null;
      if (committed) {
        onTranscriptRef.current(committed);
      }
    };

    try {
      rec.start();
      setIsListening(true);
      void startVadMeter();
    } catch {
      setIsListening(false);
      setVoiceStatusNote('Could not start microphone listening.');
    }
  }, [RecognitionCtor, getRecognitionLang, interruptSpeech, startVadMeter, stopVadMeter]);

  // Passive "Hey Mesa" wake-phrase listener
  useEffect(() => {
    if (!wakeWordEnabled || !RecognitionCtor || isListening || isSpeaking) {
      if (wakeRecRef.current) {
        try {
          wakeRecRef.current.abort();
        } catch {
          // ignore
        }
        wakeRecRef.current = null;
      }
      return;
    }

    let cancelled = false;
    const startWakeLoop = () => {
      if (cancelled || !wakeEnabledRef.current) return;
      const rec = new RecognitionCtor();
      rec.lang = 'en-US';
      rec.continuous = true;
      rec.interimResults = true;
      wakeRecRef.current = rec;

      rec.onresult = (event) => {
        for (let i = event.resultIndex; i < event.results.length; i++) {
          const text = (event.results[i]?.[0]?.transcript || '').toLowerCase();
          if (text.includes('hey mesa') || text.includes('hi mesa') || text.includes('ok mesa')) {
            try {
              rec.abort();
            } catch {
              // ignore
            }
            wakeRecRef.current = null;
            playActivationChime();
            const afterWake = text.split(/hey mesa|hi mesa|ok mesa/i)[1]?.trim();
            if (afterWake && event.results[i].isFinal && afterWake.length > 3) {
              onTranscriptRef.current(afterWake);
            } else {
              startListening();
            }
            return;
          }
        }
      };

      rec.onerror = (ev) => {
        if (ev.error === 'not-allowed' || ev.error === 'service-not-allowed') {
          setWakeWordEnabled(false);
          setVoiceStatusNote('Microphone permission denied for "Hey Mesa" wake listener.');
        }
      };

      rec.onend = () => {
        if (!cancelled && wakeEnabledRef.current && !activeRecRef.current) {
          setTimeout(startWakeLoop, 450);
        }
      };

      try {
        rec.start();
      } catch {
        // ignore restart overlap
      }
    };

    startWakeLoop();
    return () => {
      cancelled = true;
      if (wakeRecRef.current) {
        try {
          wakeRecRef.current.abort();
        } catch {
          // ignore
        }
        wakeRecRef.current = null;
      }
    };
  }, [RecognitionCtor, isListening, isSpeaking, startListening, wakeWordEnabled]);

  // Speak response aloud with natural voice selection & lip-sync energy
  const speakText = useCallback(
    (rawText: string) => {
      if (!voiceOutputEnabled || !speechSynthesisSupported) return;
      const text = cleanTextForSpeech(rawText);
      if (!text) return;

      interruptSpeech();

      const utter = new SpeechSynthesisUtterance(text);
      const isSinhala = language === 'si' || detectSinhalaChars(text);
      utter.lang = isSinhala ? 'si-LK' : 'en-US';
      utter.rate = isSinhala ? 0.96 : 1.02;
      utter.pitch = 1.06;

      const voices = window.speechSynthesis.getVoices();
      const chosen =
        voices.find((v) => v.voiceURI === selectedVoiceURI) ||
        (isSinhala
          ? voices.find((v) => v.lang.toLowerCase().startsWith('si'))
          : voices.find(
              (v) =>
                v.lang.toLowerCase().startsWith('en') &&
                /natural|neural|google|samantha|aria|jenny|female/i.test(v.name)
            ) || voices.find((v) => v.lang.toLowerCase().startsWith('en')));

      if (chosen) {
        utter.voice = chosen;
      }

      utter.onstart = () => {
        setIsSpeaking(true);
        setSpeechEnergy(0.65);
        window.clearInterval(energyTimerRef.current);
        energyTimerRef.current = window.setInterval(() => {
          setSpeechEnergy(0.35 + Math.random() * 0.55);
        }, 110);
      };

      utter.onboundary = () => {
        setSpeechEnergy(0.75 + Math.random() * 0.25);
      };

      const finish = () => {
        window.clearInterval(energyTimerRef.current);
        setIsSpeaking(false);
        setSpeechEnergy(0);
        if (continuousRef.current) {
          setTimeout(() => {
            startListening();
          }, 260);
        }
      };

      utter.onend = finish;
      utter.onerror = finish;

      window.speechSynthesis.speak(utter);
    },
    [
      interruptSpeech,
      language,
      selectedVoiceURI,
      speechSynthesisSupported,
      startListening,
      voiceOutputEnabled,
    ]
  );

  useEffect(() => {
    return () => {
      interruptSpeech();
      stopListening();
    };
  }, [interruptSpeech, stopListening]);

  return {
    speechRecognitionSupported,
    speechSynthesisSupported,
    isListening,
    isSpeaking,
    speechEnergy,
    micLevel,
    interimTranscript,
    wakeWordEnabled,
    setWakeWordEnabled,
    continuousMode,
    setContinuousMode,
    voiceOutputEnabled,
    setVoiceOutputEnabled,
    voiceStatusNote,
    setVoiceStatusNote,
    availableVoices,
    selectedVoiceURI,
    setSelectedVoiceURI,
    startListening,
    stopListening,
    speakText,
    interruptSpeech,
  };
}
