"use client";

import { useCallback, useEffect, useRef, useState } from "react";

type Difficulty = "easy" | "normal" | "hard";

const DIFFICULTY: Record<Difficulty, { label: string; ai: number; ball: number }> = {
  easy: { label: "Fácil", ai: 0.055, ball: 4.8 },
  normal: { label: "Normal", ai: 0.082, ball: 5.8 },
  hard: { label: "Difícil", ai: 0.12, ball: 6.8 },
};

const WIDTH = 820;
const HEIGHT = 500;
const PADDLE_W = 14;
const PADDLE_H = 86;
const BALL = 12;
const WIN_SCORE = 7;

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

export default function Home() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const keys = useRef(new Set<string>());
  const pointerY = useRef<number | null>(null);
  const frame = useRef<number | null>(null);
  const [difficulty, setDifficulty] = useState<Difficulty>("normal");
  const [running, setRunning] = useState(false);
  const [score, setScore] = useState({ player: 0, cpu: 0 });
  const [message, setMessage] = useState("Elige dificultad y presiona iniciar");

  const game = useRef({
    playerY: HEIGHT / 2 - PADDLE_H / 2,
    cpuY: HEIGHT / 2 - PADDLE_H / 2,
    ballX: WIDTH / 2,
    ballY: HEIGHT / 2,
    vx: DIFFICULTY.normal.ball,
    vy: 3.2,
  });

  const serve = useCallback((towardsPlayer = Math.random() > 0.5) => {
    const speed = DIFFICULTY[difficulty].ball;
    game.current.ballX = WIDTH / 2;
    game.current.ballY = HEIGHT / 2;
    game.current.vx = (towardsPlayer ? -1 : 1) * speed;
    game.current.vy = (Math.random() * 4 - 2) || 2.5;
  }, [difficulty]);

  const draw = useCallback((ctx: CanvasRenderingContext2D) => {
    const g = game.current;
    ctx.fillStyle = "#07110e";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    const gradient = ctx.createRadialGradient(WIDTH / 2, HEIGHT / 2, 20, WIDTH / 2, HEIGHT / 2, WIDTH / 1.2);
    gradient.addColorStop(0, "rgba(62,255,150,0.09)");
    gradient.addColorStop(1, "rgba(62,255,150,0.01)");
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);

    ctx.strokeStyle = "rgba(97,255,169,0.20)";
    ctx.lineWidth = 2;
    for (let y = 12; y < HEIGHT; y += 32) {
      ctx.beginPath();
      ctx.moveTo(WIDTH / 2, y);
      ctx.lineTo(WIDTH / 2, y + 17);
      ctx.stroke();
    }

    ctx.shadowColor = "#67ffaf";
    ctx.shadowBlur = 15;
    ctx.fillStyle = "#b8ffd6";
    ctx.fillRect(34, g.playerY, PADDLE_W, PADDLE_H);
    ctx.fillRect(WIDTH - 48, g.cpuY, PADDLE_W, PADDLE_H);
    ctx.fillRect(g.ballX - BALL / 2, g.ballY - BALL / 2, BALL, BALL);
    ctx.shadowBlur = 0;

    ctx.font = "28px monospace";
    ctx.fillStyle = "rgba(184,255,214,0.72)";
    ctx.fillText(String(score.player).padStart(2, "0"), WIDTH / 2 - 92, 44);
    ctx.fillText(String(score.cpu).padStart(2, "0"), WIDTH / 2 + 54, 44);

    ctx.fillStyle = "rgba(184,255,214,0.35)";
    for (let y = 0; y < HEIGHT; y += 4) ctx.fillRect(0, y, WIDTH, 1);
  }, [score]);

  useEffect(() => {
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) draw(ctx);
  }, [draw]);

  useEffect(() => {
    const down = (e: KeyboardEvent) => keys.current.add(e.key.toLowerCase());
    const up = (e: KeyboardEvent) => keys.current.delete(e.key.toLowerCase());
    window.addEventListener("keydown", down);
    window.addEventListener("keyup", up);
    return () => {
      window.removeEventListener("keydown", down);
      window.removeEventListener("keyup", up);
    };
  }, []);

  useEffect(() => {
    if (!running) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;

    const tick = () => {
      const g = game.current;
      const speed = DIFFICULTY[difficulty].ball;
      if (keys.current.has("arrowup") || keys.current.has("w")) g.playerY -= 8;
      if (keys.current.has("arrowdown") || keys.current.has("s")) g.playerY += 8;
      if (pointerY.current !== null) g.playerY += (pointerY.current - PADDLE_H / 2 - g.playerY) * 0.2;
      g.playerY = clamp(g.playerY, 0, HEIGHT - PADDLE_H);

      const cpuTarget = g.ballY - PADDLE_H / 2;
      g.cpuY += (cpuTarget - g.cpuY) * DIFFICULTY[difficulty].ai;
      g.cpuY = clamp(g.cpuY, 0, HEIGHT - PADDLE_H);

      g.ballX += g.vx;
      g.ballY += g.vy;
      if (g.ballY <= BALL / 2 || g.ballY >= HEIGHT - BALL / 2) g.vy *= -1;

      const hitPlayer = g.ballX - BALL / 2 <= 48 && g.ballX > 30 && g.ballY >= g.playerY && g.ballY <= g.playerY + PADDLE_H;
      const hitCpu = g.ballX + BALL / 2 >= WIDTH - 48 && g.ballX < WIDTH - 30 && g.ballY >= g.cpuY && g.ballY <= g.cpuY + PADDLE_H;
      if (hitPlayer || hitCpu) {
        const paddleY = hitPlayer ? g.playerY : g.cpuY;
        const offset = (g.ballY - (paddleY + PADDLE_H / 2)) / (PADDLE_H / 2);
        g.vx = (hitPlayer ? 1 : -1) * Math.min(Math.abs(g.vx) + 0.25, speed + 3.2);
        g.vy = offset * 5.5;
      }

      if (g.ballX < -20 || g.ballX > WIDTH + 20) {
        const playerPoint = g.ballX > WIDTH;
        setScore((prev) => {
          const next = { player: prev.player + (playerPoint ? 1 : 0), cpu: prev.cpu + (playerPoint ? 0 : 1) };
          if (next.player >= WIN_SCORE || next.cpu >= WIN_SCORE) {
            setRunning(false);
            setMessage(next.player > next.cpu ? "Ganaste el match. La máquina pide revancha." : "La máquina ganó. Súbele al reflejo.");
          } else {
            setMessage(playerPoint ? "Punto para Angel" : "Punto para la máquina");
            setTimeout(() => setMessage(""), 700);
          }
          return next;
        });
        serve(!playerPoint);
      }

      draw(ctx);
      frame.current = requestAnimationFrame(tick);
    };

    frame.current = requestAnimationFrame(tick);
    return () => {
      if (frame.current) cancelAnimationFrame(frame.current);
    };
  }, [difficulty, draw, running, serve]);

  const start = () => {
    setScore({ player: 0, cpu: 0 });
    setMessage("");
    serve(false);
    setRunning(true);
  };

  return (
    <main className="page">
      <section className="hero">
        <p className="eyebrow">AngelApps / primer experimento</p>
        <h1>Telebolito Retro Pong</h1>
        <p className="subtitle">Juega contra la máquina dentro de una TV retro con glow CRT. Gana quien llegue a {WIN_SCORE} puntos.</p>
      </section>

      <section className="arcade">
        <div className="tv">
          <div className="screen-wrap">
            <canvas
              ref={canvasRef}
              width={WIDTH}
              height={HEIGHT}
              onPointerMove={(e) => {
                const rect = e.currentTarget.getBoundingClientRect();
                pointerY.current = ((e.clientY - rect.top) / rect.height) * HEIGHT;
              }}
              onPointerLeave={() => { pointerY.current = null; }}
              aria-label="Juego Pong retro"
            />
            {message && <div className="overlay">{message}</div>}
          </div>
          <div className="speaker" />
          <div className="knobs"><span /><span /></div>
        </div>

        <aside className="panel">
          <div>
            <p className="label">Dificultad</p>
            <div className="buttons">
              {(Object.keys(DIFFICULTY) as Difficulty[]).map((level) => (
                <button key={level} className={difficulty === level ? "active" : ""} onClick={() => { setDifficulty(level); setRunning(false); setMessage(`Dificultad: ${DIFFICULTY[level].label}`); }}>
                  {DIFFICULTY[level].label}
                </button>
              ))}
            </div>
          </div>
          <button className="start" onClick={start}>{running ? "Reiniciar" : "Iniciar partida"}</button>
          <div className="scorecard">
            <span>Angel</span><strong>{score.player}</strong>
            <span>Máquina</span><strong>{score.cpu}</strong>
          </div>
          <p className="help">Controles: ↑/↓, W/S o mueve el dedo/mouse sobre la pantalla.</p>
        </aside>
      </section>
    </main>
  );
}
