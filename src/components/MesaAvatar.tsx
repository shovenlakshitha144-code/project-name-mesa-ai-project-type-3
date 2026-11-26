import React, { useEffect, useRef, useState } from 'react';
import type { AvatarExpression } from '../../shared/types';

interface MesaAvatarProps {
  expression: AvatarExpression;
  isSpeaking: boolean;
  isListening: boolean;
  isThinking: boolean;
  speechEnergy: number; // 0..1 real-time amplitude
  micLevel: number; // 0..1 real-time mic input
  compact?: boolean;
}

export const MesaAvatar: React.FC<MesaAvatarProps> = ({
  expression,
  isSpeaking,
  isListening,
  isThinking,
  speechEnergy,
  micLevel,
  compact = false,
}) => {
  const [blinkAmount, setBlinkAmount] = useState(0); // 0 open, 1 closed
  const [gaze, setGaze] = useState({ x: 0, y: 0 });
  const [breathPhase, setBreathPhase] = useState(0);
  const [mouthOpen, setMouthOpen] = useState(0);
  const [mouthWidth, setMouthWidth] = useState(1);

  const containerRef = useRef<HTMLDivElement>(null);
  const pointerGazeRef = useRef({ x: 0, y: 0 });
  const energyRef = useRef(speechEnergy);
  const isSpeakingRef = useRef(isSpeaking);
  const isThinkingRef = useRef(isThinking);
  const isListeningRef = useRef(isListening);

  energyRef.current = speechEnergy;
  isSpeakingRef.current = isSpeaking;
  isThinkingRef.current = isThinking;
  isListeningRef.current = isListening;

  // Track subtle cursor focus for realistic eye contact
  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!containerRef.current) return;
      const rect = containerRef.current.getBoundingClientRect();
      const cx = rect.left + rect.width / 2;
      const cy = rect.top + rect.height / 2;
      const dx = Math.max(-1, Math.min(1, (e.clientX - cx) / 360));
      const dy = Math.max(-1, Math.min(1, (e.clientY - cy) / 360));
      pointerGazeRef.current = { x: dx * 3.2, y: dy * 2.2 };
    };
    window.addEventListener('mousemove', onMove, { passive: true });
    return () => window.removeEventListener('mousemove', onMove);
  }, []);

  // Natural blinking loop
  useEffect(() => {
    let timerId: number;
    let animId: number;
    const scheduleBlink = () => {
      const delay = 2200 + Math.random() * 3200;
      timerId = window.setTimeout(() => {
        const start = performance.now();
        const duration = 175;
        const step = (now: number) => {
          const p = Math.min(1, (now - start) / duration);
          const v = Math.sin(p * Math.PI);
          setBlinkAmount(v);
          if (p < 1) {
            animId = requestAnimationFrame(step);
          } else {
            setBlinkAmount(0);
            scheduleBlink();
          }
        };
        animId = requestAnimationFrame(step);
      }, delay);
    };
    scheduleBlink();
    return () => {
      clearTimeout(timerId);
      cancelAnimationFrame(animId);
    };
  }, []);

  // Continuous lightweight animation loop (breathing, micro-saccades, lip-sync)
  useEffect(() => {
    let rafId: number;
    let lastTime = performance.now();
    let smoothMouth = 0;
    let smoothWidth = 1;
    let smoothGazeX = 0;
    let smoothGazeY = 0;

    const tick = (now: number) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      setBreathPhase(Math.sin(now * 0.0018));

      // Target gaze
      let targetX = pointerGazeRef.current.x + Math.sin(now * 0.0007) * 0.6;
      let targetY = pointerGazeRef.current.y + Math.cos(now * 0.0005) * 0.4;
      if (isThinkingRef.current) {
        targetX = 2.8 + Math.sin(now * 0.002) * 0.7;
        targetY = -2.2;
      } else if (isListeningRef.current) {
        targetX *= 0.4;
        targetY *= 0.4;
      }

      smoothGazeX += (targetX - smoothGazeX) * Math.min(1, dt * 6);
      smoothGazeY += (targetY - smoothGazeY) * Math.min(1, dt * 6);
      setGaze({ x: smoothGazeX, y: smoothGazeY });

      // Lip sync target
      let targetOpen = 0;
      let targetW = 1;
      if (isSpeakingRef.current) {
        const syllableWave =
          0.45 +
          0.35 * Math.sin(now * 0.022) +
          0.2 * Math.sin(now * 0.037 + 1.2);
        const energy = Math.max(0.18, energyRef.current);
        targetOpen = Math.min(1, syllableWave * energy * 1.15);
        targetW = 0.82 + 0.3 * Math.cos(now * 0.017);
      }
      smoothMouth += (targetOpen - smoothMouth) * Math.min(1, dt * 20);
      smoothWidth += (targetW - smoothWidth) * Math.min(1, dt * 14);
      setMouthOpen(smoothMouth);
      setMouthWidth(smoothWidth);

      rafId = requestAnimationFrame(tick);
    };

    rafId = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(rafId);
  }, []);

  const isSmiling = expression === 'happy' || (!isSpeaking && expression === 'neutral');
  const smileCurve = expression === 'happy' ? 6.5 : expression === 'alert' ? -1.5 : 3.2;
  const browLift = isThinking ? -3.5 : isListening ? -2.2 : expression === 'happy' ? -1.5 : 0;
  const headTranslateY = breathPhase * 1.8 + (isListening ? 1.5 : 0);
  const headRotate = isListening ? -1.4 : isThinking ? 1.8 : breathPhase * 0.6;

  const haloColor = isListening
    ? '#22d3ee'
    : isSpeaking
    ? '#38bdf8'
    : isThinking
    ? '#818cf8'
    : expression === 'alert'
    ? '#f59e0b'
    : '#0ea5e9';

  const activePulse = isSpeaking ? speechEnergy : isListening ? Math.max(0.25, micLevel * 1.8) : 0.12;

  const eyeScaleY = Math.max(0.06, 1 - blinkAmount * 0.94);

  return (
    <div
      ref={containerRef}
      className={`relative flex flex-col items-center justify-center select-none ${
        compact ? 'w-36 h-36' : 'w-full max-w-[320px] aspect-square mx-auto'
      }`}
    >
      {/* Ambient holographic glow */}
      <div
        className="absolute inset-4 rounded-full blur-2xl transition-all duration-300 pointer-events-none"
        style={{
          background: `radial-gradient(circle, ${haloColor}44 0%, rgba(14, 165, 233, 0.08) 60%, transparent 75%)`,
          transform: `scale(${1 + activePulse * 0.16})`,
        }}
      />

      {/* Outer orbital HUD rings */}
      <svg
        viewBox="0 0 320 320"
        className="w-full h-full drop-shadow-[0_12px_28px_rgba(6,182,212,0.22)]"
        role="img"
        aria-label="MESA AI Assistant Avatar"
      >
        <defs>
          <radialGradient id="mesaBackdrop" cx="50%" cy="38%" r="65%">
            <stop offset="0%" stopColor="#12264f" />
            <stop offset="65%" stopColor="#081229" />
            <stop offset="100%" stopColor="#040814" />
          </radialGradient>
          <linearGradient id="skinTone" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#f6d2be" />
            <stop offset="55%" stopColor="#eac0aa" />
            <stop offset="100%" stopColor="#d8a38b" />
          </linearGradient>
          <linearGradient id="skinShadow" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="#d9a58d" />
            <stop offset="100%" stopColor="#b87e68" />
          </linearGradient>
          <linearGradient id="hairGrad" x1="15%" y1="0%" x2="85%" y2="100%">
            <stop offset="0%" stopColor="#1e293b" />
            <stop offset="35%" stopColor="#0b1120" />
            <stop offset="100%" stopColor="#030712" />
          </linearGradient>
          <linearGradient id="hairSheen" x1="0%" y1="0%" x2="100%" y2="0%">
            <stop offset="0%" stopColor="#38bdf8" stopOpacity="0.0" />
            <stop offset="50%" stopColor="#38bdf8" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#38bdf8" stopOpacity="0.0" />
          </linearGradient>
          <linearGradient id="blazerGrad" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#15233e" />
            <stop offset="50%" stopColor="#0b1326" />
            <stop offset="100%" stopColor="#060b18" />
          </linearGradient>
          <linearGradient id="glassesFrame" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#67e8f9" />
            <stop offset="50%" stopColor="#38bdf8" />
            <stop offset="100%" stopColor="#1e293b" />
          </linearGradient>
          <linearGradient id="lensGlint" x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="#bae6fd" stopOpacity="0.28" />
            <stop offset="45%" stopColor="#38bdf8" stopOpacity="0.04" />
            <stop offset="100%" stopColor="#0284c7" stopOpacity="0.12" />
          </linearGradient>
          <clipPath id="portraitClip">
            <circle cx="160" cy="160" r="136" />
          </clipPath>
        </defs>

        {/* HUD Rings */}
        <circle
          cx="160"
          cy="160"
          r="152"
          fill="none"
          stroke={haloColor}
          strokeOpacity="0.25"
          strokeWidth="1.5"
          strokeDasharray="10 8"
        />
        <circle
          cx="160"
          cy="160"
          r={143 + activePulse * 4}
          fill="none"
          stroke={haloColor}
          strokeOpacity={0.35 + activePulse * 0.45}
          strokeWidth="2"
        />

        {/* Circular Portrait Frame */}
        <circle cx="160" cy="160" r="136" fill="url(#mesaBackdrop)" stroke="#22d3ee" strokeOpacity="0.35" strokeWidth="1.5" />

        <g clipPath="url(#portraitClip)">
          {/* Studio rim glow behind head */}
          <ellipse cx="160" cy="145" rx="88" ry="96" fill={haloColor} fillOpacity="0.12" />

          {/* Back hair layer (short black bob behind neck/ears) */}
          <path
            d="M92 140 C86 92, 114 52, 160 52 C206 52, 234 92, 228 140 C230 175, 224 202, 208 216 L112 216 C96 202, 90 175, 92 140 Z"
            fill="#050814"
          />

          {/* Shoulders & Professional Blazer */}
          <g transform={`translate(0, ${breathPhase * 1.4})`}>
            <path
              d="M52 315 C58 258, 92 234, 130 226 L160 245 L190 226 C228 234, 262 258, 268 315 Z"
              fill="url(#blazerGrad)"
              stroke="#38bdf8"
              strokeOpacity="0.25"
              strokeWidth="1"
            />
            {/* Crisp inner top / collar */}
            <path d="M134 228 L160 282 L186 228 L173 222 L160 236 L147 222 Z" fill="#e2e8f0" fillOpacity="0.92" />
            {/* Futuristic cyan lapel accent */}
            <path d="M126 230 L153 288 L143 292 L114 242 Z" fill="#0f172a" stroke="#22d3ee" strokeOpacity="0.45" strokeWidth="0.9" />
            <path d="M194 230 L167 288 L177 292 L206 242 Z" fill="#0f172a" stroke="#22d3ee" strokeOpacity="0.45" strokeWidth="0.9" />
            <circle cx="195" cy="260" r="3" fill="#22d3ee" />
          </g>

          {/* Head + Neck group with organic micro-motion */}
          <g transform={`translate(0, ${headTranslateY}) rotate(${headRotate} 160 165)`}>
            {/* Neck */}
            <path d="M140 190 L140 232 C148 242, 172 242, 180 232 L180 190 Z" fill="url(#skinShadow)" />
            {/* Chin shadow on neck */}
            <ellipse cx="160" cy="204" rx="22" ry="11" fill="#8b5a47" fillOpacity="0.32" />

            {/* Ears */}
            <ellipse cx="106" cy="148" rx="7" ry="14" fill="#dfa991" />
            <ellipse cx="214" cy="148" rx="7" ry="14" fill="#dfa991" />
            {/* Subtle glowing cyber-earpiece */}
            <circle cx="215" cy="154" r="2.6" fill="#22d3ee" />

            {/* Face contour */}
            <path
              d="M108 128 C108 86, 128 68, 160 68 C192 68, 212 86, 212 128 C212 168, 188 202, 160 204 C132 202, 108 168, 108 128 Z"
              fill="url(#skinTone)"
            />

            {/* Soft cheek shading / natural blush */}
            <ellipse cx="128" cy="156" rx="13" ry="7" fill="#e58c7c" fillOpacity={isSmiling ? 0.24 : 0.14} />
            <ellipse cx="192" cy="156" rx="13" ry="7" fill="#e58c7c" fillOpacity={isSmiling ? 0.24 : 0.14} />

            {/* Nose shading & bridge */}
            <path d="M159 124 C157 137, 155 147, 153 151 C156 154, 164 154, 167 151 C165 147, 163 137, 161 124" fill="none" stroke="#c78b73" strokeWidth="1.6" strokeLinecap="round" />
            <ellipse cx="160" cy="152" rx="4.5" ry="2.2" fill="#d3967d" fillOpacity="0.35" />

            {/* Eyes */}
            {[
              { cx: 135, cy: 134, side: -1 },
              { cx: 185, cy: 134, side: 1 },
            ].map((eye) => (
              <g key={eye.cx}>
                {/* Upper eye socket shadow */}
                <path
                  d={`M${eye.cx - 15} ${eye.cy - 5} Q${eye.cx} ${eye.cy - 12} ${eye.cx + 15} ${eye.cy - 5}`}
                  fill="none"
                  stroke="#a46e59"
                  strokeOpacity="0.38"
                  strokeWidth="1.4"
                />
                {/* Blinking scale container */}
                <g transform={`translate(${eye.cx}, ${eye.cy}) scale(1, ${eyeScaleY})`}>
                  {/* Sclera */}
                  <path
                    d="M-14 0 Q0 -9 14 0 Q0 8 -14 0 Z"
                    fill="#f8fafc"
                  />
                  {/* Iris & pupil */}
                  <g transform={`translate(${gaze.x}, ${gaze.y})`}>
                    <circle cx="0" cy="0" r="6.4" fill="#2b1b17" />
                    <circle cx="0" cy="0" r="4.8" fill="#3d2720" />
                    <circle cx="0" cy="0" r="2.7" fill="#090d16" />
                    {/* Catchlights */}
                    <circle cx="-2.1" cy="-2.2" r="1.4" fill="#ffffff" fillOpacity="0.92" />
                    <circle cx="2" cy="1.6" r="0.7" fill="#67e8f9" fillOpacity="0.7" />
                  </g>
                  {/* Upper lash line */}
                  <path
                    d="M-15 0 Q0 -10 15 0"
                    fill="none"
                    stroke="#0f172a"
                    strokeWidth="2.4"
                    strokeLinecap="round"
                  />
                </g>
              </g>
            ))}

            {/* Natural Eyebrows */}
            <path
              d={`M119 ${119 + browLift} Q135 ${113 + browLift} 150 ${118 + browLift}`}
              fill="none"
              stroke="#0f172a"
              strokeWidth="2.8"
              strokeLinecap="round"
            />
            <path
              d={`M170 ${118 + browLift} Q185 ${113 + browLift} 201 ${119 + browLift}`}
              fill="none"
              stroke="#0f172a"
              strokeWidth="2.8"
              strokeLinecap="round"
            />

            {/* Mouth & Real-time Lip Sync */}
            <g transform={`translate(160, 173) scale(${mouthWidth}, 1)`}>
              {mouthOpen > 0.08 ? (
                <>
                  {/* Inner mouth cavity */}
                  <path
                    d={`M-14 0 Q0 ${-3 - mouthOpen * 2} 14 0 Q0 ${4 + mouthOpen * 12} -14 0 Z`}
                    fill="#4a1622"
                  />
                  {/* Upper teeth hint */}
                  <path
                    d={`M-9 0 Q0 -1 9 0 L8 ${2 + mouthOpen * 2.2} Q0 ${3 + mouthOpen * 2} -8 ${2 + mouthOpen * 2.2} Z`}
                    fill="#f8fafc"
                    fillOpacity="0.9"
                  />
                  {/* Upper & lower lips */}
                  <path
                    d={`M-15 0 Q-6 -4 0 -2 Q6 -4 15 0`}
                    fill="none"
                    stroke="#b35c63"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                  />
                  <path
                    d={`M-13 1 Q0 ${6 + mouthOpen * 11} 13 1`}
                    fill="none"
                    stroke="#c26b72"
                    strokeWidth="2.5"
                    strokeLinecap="round"
                  />
                </>
              ) : (
                <>
                  {/* Natural closed smile / expression */}
                  <path
                    d={`M-15 ${-smileCurve * 0.25} Q0 ${smileCurve} 15 ${-smileCurve * 0.25}`}
                    fill="none"
                    stroke="#8f4149"
                    strokeWidth="2.1"
                    strokeLinecap="round"
                  />
                  <path
                    d={`M-11 ${1.5 - smileCurve * 0.15} Q0 ${smileCurve * 0.9 + 3} 11 ${1.5 - smileCurve * 0.15}`}
                    fill="none"
                    stroke="#cf7c82"
                    strokeOpacity="0.7"
                    strokeWidth="2"
                    strokeLinecap="round"
                  />
                </>
              )}
            </g>

            {/* Elegant Glasses */}
            <g>
              {/* Left lens */}
              <rect
                x="114"
                y="121"
                width="41"
                height="27"
                rx="8"
                fill="url(#lensGlint)"
                stroke="url(#glassesFrame)"
                strokeWidth="2.2"
              />
              {/* Right lens */}
              <rect
                x="165"
                y="121"
                width="41"
                height="27"
                rx="8"
                fill="url(#lensGlint)"
                stroke="url(#glassesFrame)"
                strokeWidth="2.2"
              />
              {/* Bridge & temples */}
              <path d="M155 131 Q160 128 165 131" fill="none" stroke="#38bdf8" strokeWidth="2.2" />
              <line x1="108" y1="130" x2="114" y2="130" stroke="#38bdf8" strokeWidth="2" />
              <line x1="206" y1="130" x2="212" y2="130" stroke="#38bdf8" strokeWidth="2" />
              {/* Subtle glass highlight streak */}
              <line x1="120" y1="125" x2="128" y2="142" stroke="#e0f2fe" strokeOpacity="0.28" strokeWidth="2" strokeLinecap="round" />
              <line x1="171" y1="125" x2="179" y2="142" stroke="#e0f2fe" strokeOpacity="0.28" strokeWidth="2" strokeLinecap="round" />
            </g>

            {/* Short Black Hair (front & side-swept bangs) */}
            <path
              d="M96 146 C94 86, 122 52, 162 52 C202 52, 224 88, 223 144 C221 122, 212 104, 198 94 C180 82, 152 84, 128 106 C114 118, 106 135, 106 164 C99 162, 96 154, 96 146 Z"
              fill="url(#hairGrad)"
            />
            {/* Side bob lock on right */}
            <path
              d="M210 96 C224 118, 225 160, 210 182 C209 156, 212 126, 204 106 Z"
              fill="url(#hairGrad)"
            />
            {/* Side bob lock on left */}
            <path
              d="M108 100 C95 124, 96 164, 110 184 C112 158, 109 130, 116 108 Z"
              fill="url(#hairGrad)"
            />
            {/* Hair studio sheen */}
            <path
              d="M126 70 Q162 58 196 72"
              fill="none"
              stroke="url(#hairSheen)"
              strokeWidth="4"
              strokeLinecap="round"
            />
          </g>
        </g>

        {/* Subtle status LED badge */}
        <circle cx="256" cy="256" r="10" fill="#040814" stroke="#22d3ee" strokeWidth="1.5" />
        <circle
          cx="256"
          cy="256"
          r="5"
          fill={isListening ? '#22d3ee' : isSpeaking ? '#38bdf8' : isThinking ? '#a78bfa' : '#10b981'}
        />
      </svg>

      {/* Voice waveform footer bar */}
      {!compact && (
        <div className="mt-2 flex items-center gap-1.5 h-6 px-3 rounded-full mesa-glass-soft">
          <span
            className={`w-2 h-2 rounded-full ${
              isListening
                ? 'bg-cyan-400 animate-ping'
                : isSpeaking
                ? 'bg-sky-400 animate-pulse'
                : isThinking
                ? 'bg-indigo-400 animate-pulse'
                : 'bg-emerald-400'
            }`}
          />
          <span className="text-[11px] font-medium tracking-wider uppercase text-cyan-200">
            {isListening
              ? 'Listening...'
              : isSpeaking
              ? 'Speaking'
              : isThinking
              ? 'Thinking'
              : expression === 'happy'
              ? 'Ready • Smiling'
              : 'Online'}
          </span>
          <div className="flex items-end gap-0.5 h-3.5 ml-1">
            {[0.4, 0.75, 1, 0.8, 0.5].map((mult, idx) => {
              const barLevel = isSpeaking
                ? Math.max(0.2, Math.min(1, speechEnergy * mult * 1.2))
                : isListening
                ? Math.max(0.2, Math.min(1, micLevel * mult * 2.2))
                : 0.18;
              return (
                <span
                  key={idx}
                  className="w-1 rounded-full bg-cyan-400 transition-all duration-75"
                  style={{ height: `${Math.round(barLevel * 14)}px` }}
                />
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};
