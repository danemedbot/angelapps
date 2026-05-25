"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { RealtimeChannel } from "@supabase/supabase-js";
import { supabase } from "../lib/supabase";

type Difficulty = "easy" | "normal" | "hard";
type Mode = "cpu" | "online";
type Role = "host" | "guest";
type Phase = "lobby" | "playing" | "finished";
type RoomState = { code: string; hostY: number; guestY: number; ballX: number; ballY: number; vx: number; vy: number; hostScore: number; guestScore: number; phase: Phase; winner?: Role };

const DIFFICULTY: Record<Difficulty, { label: string; ai: number; ball: number }> = {
  easy: { label: "Fácil", ai: 0.055, ball: 4.8 },
  normal: { label: "Normal", ai: 0.082, ball: 5.8 },
  hard: { label: "Difícil", ai: 0.12, ball: 6.8 },
};
const WIDTH = 820, HEIGHT = 500, PADDLE_W = 14, PADDLE_H = 86, BALL = 12, WIN_SCORE = 7;
const clamp = (value: number, min: number, max: number) => Math.max(min, Math.min(max, value));
const roomCode = () => Math.random().toString(36).slice(2, 6).toUpperCase();
const blankState = (code: string): RoomState => ({ code, hostY: HEIGHT / 2 - PADDLE_H / 2, guestY: HEIGHT / 2 - PADDLE_H / 2, ballX: WIDTH / 2, ballY: HEIGHT / 2, vx: 5.8, vy: 3.1, hostScore: 0, guestScore: 0, phase: "lobby" });

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const channelRef = useRef<RealtimeChannel | null>(null);
  const keys = useRef(new Set<string>());
  const pointerY = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const remoteY = useRef(HEIGHT / 2 - PADDLE_H / 2);
  const lastSent = useRef(0);
  const latestScore = useRef({ player: 0, cpu: 0 });

  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [mode, setMode] = useState<Mode>("cpu");
  const [running, setRunning] = useState(false);
  const [score, setScoreState] = useState({ player: 0, cpu: 0 });
  const [message, setMessage] = useState("Inicia solo o crea una sala para jugar con alguien");
  const [role, setRole] = useState<Role>("host");
  const [room, setRoom] = useState("");
  const [joinCode, setJoinCode] = useState("");
  const [connected, setConnected] = useState(false);
  const [copied, setCopied] = useState(false);

  const setScore = useCallback((next: { player: number; cpu: number }) => { latestScore.current = next; setScoreState(next); }, []);
  const game = useRef({ playerY: HEIGHT / 2 - PADDLE_H / 2, cpuY: HEIGHT / 2 - PADDLE_H / 2, ballX: WIDTH / 2, ballY: HEIGHT / 2, vx: DIFFICULTY.normal.ball, vy: 3.2 });
  const inviteUrl = useMemo(() => room && typeof window !== "undefined" ? `${window.location.origin}?room=${room}` : "", [room]);

  useEffect(() => { const incoming = new URLSearchParams(window.location.search).get("room")?.toUpperCase(); if (incoming) { setMode("online"); setJoinCode(incoming); } }, []);

  const localPaddleY = useCallback(() => {
    const g = game.current;
    if (keys.current.has("arrowup") || keys.current.has("w")) g.playerY -= 8;
    if (keys.current.has("arrowdown") || keys.current.has("s")) g.playerY += 8;
    if (pointerY.current !== null) g.playerY += (pointerY.current - PADDLE_H / 2 - g.playerY) * 0.22;
    g.playerY = clamp(g.playerY, 0, HEIGHT - PADDLE_H);
    return g.playerY;
  }, []);

  const publishPaddle = useCallback((y: number) => {
    if (!channelRef.current || !room) return;
    const now = performance.now(); if (now - lastSent.current < 45) return; lastSent.current = now;
    channelRef.current.send({ type: "broadcast", event: "paddle", payload: { role, y } });
  }, [role, room]);
  const publishState = useCallback((state: RoomState) => { channelRef.current?.send({ type: "broadcast", event: "state", payload: state }); }, []);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const g = game.current;
    const leftY = mode === "online" && role === "guest" ? g.cpuY : g.playerY;
    const rightY = mode === "online" && role === "guest" ? g.playerY : g.cpuY;
    ctx.fillStyle = "#07110e"; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 20, WIDTH / 2, HEIGHT / 2, WIDTH / 1.2);
    gradient.addColorStop(0, "rgba(62,255,150,0.09)"); gradient.addColorStop(1, "rgba(62,255,150,0.01)"); ctx.fillStyle = gradient; ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.strokeStyle = "rgba(97,255,169,0.20)"; ctx.lineWidth = 2; for (let y = 12; y < HEIGHT; y += 32) { ctx.beginPath(); ctx.moveTo(WIDTH / 2, y); ctx.lineTo(WIDTH / 2, y + 17); ctx.stroke(); }
    ctx.shadowColor = "#67ffaf"; ctx.shadowBlur = 15; ctx.fillStyle = "#b8ffd6"; ctx.fillRect(34, leftY, PADDLE_W, PADDLE_H); ctx.fillRect(WIDTH - 48, rightY, PADDLE_W, PADDLE_H); ctx.fillRect(g.ballX - BALL / 2, g.ballY - BALL / 2, BALL, BALL); ctx.shadowBlur = 0;
    ctx.font = "28px monospace"; ctx.fillStyle = "rgba(184,255,214,0.72)";
    const leftScore = mode === "online" ? (role === "guest" ? score.cpu : score.player) : score.player;
    const rightScore = mode === "online" ? (role === "guest" ? score.player : score.cpu) : score.cpu;
    ctx.fillText(String(leftScore).padStart(2, "0"), WIDTH / 2 - 92, 44); ctx.fillText(String(rightScore).padStart(2, "0"), WIDTH / 2 + 54, 44);
    ctx.fillStyle = "rgba(184,255,214,0.35)"; for (let y = 0; y < HEIGHT; y += 4) ctx.fillRect(0, y, WIDTH, 1);
  }, [mode, role, score]);

  useEffect(() => { const ctx = canvasRef.current?.getContext("2d"); if (ctx) draw(ctx); }, [draw]);
  useEffect(() => { const down = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase()); const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase()); window.addEventListener("keydown", down); window.addEventListener("keyup", up); return () => { window.removeEventListener("keydown", down); window.removeEventListener("keyup", up); }; }, []);
  useEffect(() => () => { channelRef.current?.unsubscribe(); }, []);

  const connectRoom = useCallback((code: string, nextRole: Role) => {
    if (!supabase) { setMessage("Falta configurar Supabase Realtime en Vercel"); return; }
    channelRef.current?.unsubscribe(); setConnected(false);
    const channel = supabase.channel(`pong-${code}`, { config: { broadcast: { self: false }, presence: { key: nextRole } } });
    channel.on("broadcast", { event: "paddle" }, ({ payload }) => { if (payload.role !== nextRole) remoteY.current = payload.y; });
    channel.on("broadcast", { event: "state" }, ({ payload }) => {
      const state = payload as RoomState;
      if (nextRole === "guest") { game.current.playerY = state.guestY; game.current.cpuY = state.hostY; game.current.ballX = WIDTH - state.ballX; game.current.ballY = state.ballY; game.current.vx = -state.vx; game.current.vy = state.vy; setScore({ player: state.guestScore, cpu: state.hostScore }); }
      else { game.current.playerY = state.hostY; game.current.cpuY = state.guestY; game.current.ballX = state.ballX; game.current.ballY = state.ballY; game.current.vx = state.vx; game.current.vy = state.vy; setScore({ player: state.hostScore, cpu: state.guestScore }); }
      setRunning(state.phase === "playing");
      if (state.phase === "lobby") setMessage(nextRole === "host" ? "Sala lista. Comparte el link y presiona iniciar." : "Conectado. Espera a que el host inicie.");
      if (state.phase === "finished") setMessage(state.winner === nextRole ? "Ganaste la partida online." : "Tu rival ganó la partida.");
    });
    channel.subscribe((status) => { setConnected(status === "SUBSCRIBED"); if (status === "SUBSCRIBED") setMessage(nextRole === "host" ? "Sala creada. Comparte el link." : "Entraste a la sala. Esperando al host."); });
    channelRef.current = channel; setRoom(code); setRole(nextRole); setMode("online");
  }, [setScore]);

  const createRoom = () => connectRoom(roomCode(), "host");
  const joinRoom = () => { const code = joinCode.trim().toUpperCase(); if (code.length >= 4) connectRoom(code, "guest"); };
  const serve = useCallback((towardsPlayer = Math.random() > 0.5) => { const speed = DIFFICULTY[difficulty].ball; game.current.ballX = WIDTH / 2; game.current.ballY = HEIGHT / 2; game.current.vx = (towardsPlayer ? -1 : 1) * speed; game.current.vy = (Math.random() * 4 - 2) || 2.5; }, [difficulty]);

  useEffect(() => {
    if (!running) return; const ctx = canvasRef.current?.getContext("2d"); if (!ctx) return;
    const tick = () => {
      const g = game.current;
      if (mode === "online") {
        const y = localPaddleY(); publishPaddle(y);
        if (role === "host") {
          g.cpuY = clamp(remoteY.current, 0, HEIGHT - PADDLE_H); g.ballX += g.vx; g.ballY += g.vy; if (g.ballY <= BALL / 2 || g.ballY >= HEIGHT - BALL / 2) g.vy *= -1;
          const hitHost = g.ballX - BALL / 2 <= 48 && g.ballX > 30 && g.ballY >= g.playerY && g.ballY <= g.playerY + PADDLE_H;
          const hitGuest = g.ballX + BALL / 2 >= WIDTH - 48 && g.ballX < WIDTH - 30 && g.ballY >= g.cpuY && g.ballY <= g.cpuY + PADDLE_H;
          if (hitHost || hitGuest) { const paddleY = hitHost ? g.playerY : g.cpuY; const offset = (g.ballY - (paddleY + PADDLE_H / 2)) / (PADDLE_H / 2); g.vx = (hitHost ? 1 : -1) * Math.min(Math.abs(g.vx) + 0.2, 9); g.vy = offset * 5.5; }
          let hostScore = latestScore.current.player, guestScore = latestScore.current.cpu, phase: Phase = "playing", winner: Role | undefined;
          if (g.ballX < -20 || g.ballX > WIDTH + 20) { const hostPoint = g.ballX > WIDTH; hostScore += hostPoint ? 1 : 0; guestScore += hostPoint ? 0 : 1; if (hostScore >= WIN_SCORE || guestScore >= WIN_SCORE) { phase = "finished"; winner = hostScore > guestScore ? "host" : "guest"; setRunning(false); } g.ballX = WIDTH / 2; g.ballY = HEIGHT / 2; g.vx = (hostPoint ? -1 : 1) * 5.8; g.vy = (Math.random() * 4 - 2) || 2.5; setScore({ player: hostScore, cpu: guestScore }); }
          publishState({ code: room, hostY: g.playerY, guestY: g.cpuY, ballX: g.ballX, ballY: g.ballY, vx: g.vx, vy: g.vy, hostScore, guestScore, phase, winner });
        }
        draw(ctx); frame.current = requestAnimationFrame(tick); return;
      }
      const speed = DIFFICULTY[difficulty].ball; localPaddleY(); const cpuTarget = g.ballY - PADDLE_H / 2; g.cpuY += (cpuTarget - g.cpuY) * DIFFICULTY[difficulty].ai; g.cpuY = clamp(g.cpuY, 0, HEIGHT - PADDLE_H); g.ballX += g.vx; g.ballY += g.vy;
      if (g.ballY <= BALL / 2 || g.ballY >= HEIGHT - BALL / 2) g.vy *= -1;
      const hitPlayer = g.ballX - BALL / 2 <= 48 && g.ballX > 30 && g.ballY >= g.playerY && g.ballY <= g.playerY + PADDLE_H; const hitCpu = g.ballX + BALL / 2 >= WIDTH - 48 && g.ballX < WIDTH - 30 && g.ballY >= g.cpuY && g.ballY <= g.cpuY + PADDLE_H;
      if (hitPlayer || hitCpu) { const paddleY = hitPlayer ? g.playerY : g.cpuY; const offset = (g.ballY - (paddleY + PADDLE_H / 2)) / (PADDLE_H / 2); g.vx = (hitPlayer ? 1 : -1) * Math.min(Math.abs(g.vx) + 0.25, speed + 3.2); g.vy = offset * 5.5; }
      if (g.ballX < -20 || g.ballX > WIDTH + 20) { const playerPoint = g.ballX > WIDTH; const next = { player: latestScore.current.player + (playerPoint ? 1 : 0), cpu: latestScore.current.cpu + (playerPoint ? 0 : 1) }; setScore(next); if (next.player >= WIN_SCORE || next.cpu >= WIN_SCORE) { setRunning(false); setMessage(next.player > next.cpu ? "Ganaste el match." : "La máquina ganó."); } serve(!playerPoint); }
      draw(ctx); frame.current = requestAnimationFrame(tick);
    };
    frame.current = requestAnimationFrame(tick); return () => { if (frame.current) cancelAnimationFrame(frame.current); };
  }, [difficulty, draw, localPaddleY, mode, publishPaddle, publishState, role, room, running, serve, setScore]);

  const start = () => {
    if (mode === "online") { if (role !== "host") { setMessage("Solo quien creó la sala puede iniciar."); return; } const state = blankState(room || roomCode()); state.phase = "playing"; setScore({ player: 0, cpu: 0 }); setMessage(""); setRunning(true); publishState(state); return; }
    setScore({ player: 0, cpu: 0 }); setMessage(""); serve(false); setRunning(true);
  };

  return <main className="page"><section className="hero"><p className="eyebrow">AngelApps / web app móvil</p><h1>Telebolito Retro Pong</h1><p className="subtitle">Juega contra la máquina o crea una sala para retar a otra persona desde el celular.</p></section><section className="arcade"><div className="tv"><div className="screen-wrap"><canvas ref={canvasRef} width={WIDTH} height={HEIGHT} onPointerMove={(e) => { const rect = e.currentTarget.getBoundingClientRect(); pointerY.current = ((e.clientY - rect.top) / rect.height) * HEIGHT; }} onPointerLeave={() => { pointerY.current = null; }} aria-label="Juego Pong retro" />{message && <div className="overlay">{message}</div>}</div><div className="speaker" /><div className="knobs"><span /><span /></div></div><aside className="panel"><div className="tabs"><button className={mode === "cpu" ? "active" : ""} onClick={() => { setMode("cpu"); setRunning(false); }}>Solo</button><button className={mode === "online" ? "active" : ""} onClick={() => setMode("online")}>2 jugadores</button></div>{mode === "cpu" ? <><p className="label">Dificultad</p><div className="buttons">{(Object.keys(DIFFICULTY) as Difficulty[]).map((level) => <button key={level} className={difficulty === level ? "active" : ""} onClick={() => { setDifficulty(level); setRunning(false); setMessage(`Dificultad: ${DIFFICULTY[level].label}`); }} type="button">{DIFFICULTY[level].label}</button>)}</div></> : <div className="online"><button type="button" onClick={createRoom}>Crear sala</button><div className="join"><input value={joinCode} onChange={(e) => setJoinCode(e.target.value.toUpperCase())} placeholder="Código" maxLength={6} /><button type="button" onClick={joinRoom}>Entrar</button></div>{room && <div className="invite"><span>Sala {room} · {connected ? "online" : "conectando"}</span><button type="button" onClick={async () => { await navigator.clipboard.writeText(inviteUrl); setCopied(true); setTimeout(() => setCopied(false), 1200); }}>{copied ? "Copiado" : "Copiar link"}</button><small>{inviteUrl}</small></div>}</div>}<button className="start" type="button" onClick={start}>{running ? "Reiniciar" : "Iniciar partida"}</button><div className="scorecard"><span>{mode === "online" ? "Tú" : "Angel"}</span><strong>{score.player}</strong><span>{mode === "online" ? "Rival" : "Máquina"}</span><strong>{score.cpu}</strong></div><p className="help">Móvil: arrastra el dedo en la pantalla. Teclado: ↑/↓ o W/S. Online: crea sala, copia link y el otro entra.</p></aside></section></main>;
}
