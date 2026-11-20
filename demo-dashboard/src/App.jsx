import React, { useState, useEffect } from 'react';
import {
  Activity,
  ShieldAlert,
  ShieldCheck,
  Server,
  Zap,
  TrendingUp,
  AlertTriangle,
  RotateCcw,
  Play,
  Layers,
  Key,
  CheckCircle2,
  Clock
} from 'lucide-react';

export default function App() {
  const [isRunning, setIsRunning] = useState(false);
  const [isFailsafe, setIsFailsafe] = useState(false);
  const [currentRps, setCurrentRps] = useState(5);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Reactive Autoscaler Stats (Before)
  const [reactiveStats, setReactiveStats] = useState({
    instances: 1,
    latencyMs: 195,
    error503s: 0,
    oversoldItems: 0,
    status: 'OPTIMAL'
  });

  // PulseGuard Stats (After)
  const [pulseStats, setPulseStats] = useState({
    instances: 1,
    latencyMs: 180,
    error503s: 0,
    lockedStock: 0,
    oversoldItems: 0,
    confidenceScore: 0.94,
    predictedRps: 5,
    idempotencyKey: null,
    lockedChannels: [],
    status: 'ACTIVE'
  });

  // Simulation Tick Loop
  useEffect(() => {
    let timer;
    if (isRunning) {
      timer = setInterval(() => {
        setElapsedSec((prev) => {
          const nextSec = prev + 1;

          // Traffic curve:
          // 0 - 5s: Baseline (5 RPS)
          // 6 - 20s: Flash Sale Surge (180 RPS)
          // 21s+: Cooldown (15 RPS)
          let rps = 5;
          if (nextSec >= 6 && nextSec <= 20) {
            rps = 180;
          } else if (nextSec > 20) {
            rps = 15;
          }
          setCurrentRps(rps);

          // Update Reactive state (lagging response)
          setReactiveStats((prevR) => {
            if (nextSec >= 6 && nextSec <= 15) {
              // 2-5 min scale-up lag! Instances stuck at 1 or 2
              return {
                instances: nextSec > 12 ? 2 : 1,
                latencyMs: Math.min(3200, prevR.latencyMs + 380),
                error503s: prevR.error503s + (rps > 50 ? 35 : 0),
                oversoldItems: prevR.oversoldItems + (rps > 50 ? 4 : 0),
                status: 'CRITICAL_LAG'
              };
            } else if (nextSec > 15 && nextSec <= 20) {
              return {
                instances: 4,
                latencyMs: 850,
                error503s: prevR.error503s + 12,
                oversoldItems: prevR.oversoldItems + 1,
                status: 'RECOVERING'
              };
            } else {
              return {
                instances: Math.max(1, prevR.instances - (nextSec > 25 ? 1 : 0)),
                latencyMs: Math.max(200, prevR.latencyMs - 150),
                error503s: prevR.error503s,
                oversoldItems: prevR.oversoldItems,
                status: 'STABILIZED'
              };
            }
          });

          // Update PulseGuard state (proactive pre-warming & inventory lock)
          setPulseStats((prevP) => {
            if (isFailsafe) {
              // Failsafe mode engaged: acts like reactive native scaler
              return {
                ...prevP,
                status: 'FAILSAFE_ENGAGED: Native Autoscaler Active'
              };
            }

            if (nextSec >= 4 && nextSec <= 5) {
              // Agent predicts spike at sec 4 from telemetry slope! Pre-warms Cloud Run
              return {
                ...prevP,
                instances: 8, // Pre-warmed ahead of the spike!
                predictedRps: 185,
                lockedStock: 50,
                idempotencyKey: 'e4b1c872-9b93-4a18-b2ef-3701a2b9e601',
                lockedChannels: ['amazon', 'flipkart'],
                status: 'PRE_WARM_ACTIVE'
              };
            } else if (nextSec >= 6 && nextSec <= 20) {
              return {
                ...prevP,
                instances: 10,
                latencyMs: Math.floor(180 + Math.random() * 25),
                error503s: 0, // No 503s due to pre-warmed capacity!
                lockedStock: 50,
                oversoldItems: 0,
                idempotencyKey: 'e4b1c872-9b93-4a18-b2ef-3701a2b9e601',
                lockedChannels: ['amazon', 'flipkart'],
                status: 'GUARDRAILS_ENGAGED'
              };
            } else {
              return {
                ...prevP,
                instances: Math.max(1, prevP.instances - (nextSec > 25 ? 2 : 0)),
                latencyMs: 180,
                lockedStock: 0,
                idempotencyKey: null,
                lockedChannels: [],
                status: 'STANDBY'
              };
            }
          });

          return nextSec;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRunning, isFailsafe]);

  const handleStartSimulation = () => {
    setIsRunning(true);
  };

  const handleReset = () => {
    setIsRunning(false);
    setElapsedSec(0);
    setCurrentRps(5);
    setIsFailsafe(false);
    setReactiveStats({
      instances: 1,
      latencyMs: 195,
      error503s: 0,
      oversoldItems: 0,
      status: 'OPTIMAL'
    });
    setPulseStats({
      instances: 1,
      latencyMs: 180,
      error503s: 0,
      lockedStock: 0,
      oversoldItems: 0,
      confidenceScore: 0.94,
      predictedRps: 5,
      idempotencyKey: null,
      lockedChannels: [],
      status: 'ACTIVE'
    });
  };

  const handleToggleFailsafe = () => {
    setIsFailsafe(!isFailsafe);
  };

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6">
      {/* Top Header */}
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-800 pb-5">
        <div>
          <div className="flex items-center gap-3">
            <span className="p-2 rounded-lg bg-indigo-500/10 border border-indigo-500/30 text-indigo-400">
              <Zap className="w-6 h-6" />
            </span>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-white flex items-center gap-2">
                PulseGuard
                <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-900/60 text-indigo-300 border border-indigo-700/50">
                  ApexScale
                </span>
                <span className="text-xs font-mono font-medium px-2 py-0.5 rounded bg-slate-800 text-slate-300 border border-slate-700">
                  SKU: PROD-FLASH-001
                </span>
              </h1>
              <p className="text-sm text-slate-400">
                Autonomous Multi-Cloud Resilience & Marketplace Inventory Guardrail Agent
              </p>
            </div>
          </div>
        </div>

        {/* Global Status Banner */}
        <div className="flex items-center gap-3">
          <div
            className={`px-3 py-1.5 rounded-full text-xs font-mono font-medium flex items-center gap-2 border ${
              isFailsafe
                ? 'bg-amber-950/60 text-amber-300 border-amber-600/50'
                : 'bg-emerald-950/60 text-emerald-300 border-emerald-600/50'
            }`}
          >
            <span className="w-2 h-2 rounded-full animate-ping bg-current" />
            {isFailsafe
              ? 'FAILSAFE_ENGAGED: Native Autoscaler Active'
              : 'AGENTIC_CORE: Autonomous Pre-Warm & Inventory Guard Active'}
          </div>
        </div>
      </header>

      {/* Control Strip */}
      <div className="bg-slate-900/80 border border-slate-800 rounded-xl p-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs uppercase text-slate-400 font-semibold tracking-wider">Live Traffic</div>
            <div className="text-2xl font-bold text-white flex items-center gap-2">
              {currentRps} <span className="text-sm font-normal text-slate-400">RPS</span>
            </div>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <div className="text-xs uppercase text-slate-400 font-semibold tracking-wider">Elapsed Time</div>
            <div className="text-2xl font-bold text-white font-mono">{elapsedSec}s</div>
          </div>
          <div className="h-8 w-px bg-slate-800" />
          <div>
            <div className="text-xs uppercase text-slate-400 font-semibold tracking-wider">Flash-Sale Phase</div>
            <div className="text-sm font-medium mt-1">
              {elapsedSec === 0 && <span className="text-slate-400">Ready</span>}
              {elapsedSec > 0 && elapsedSec <= 5 && <span className="text-blue-400">Normal Baseline (5 RPS)</span>}
              {elapsedSec > 5 && elapsedSec <= 20 && (
                <span className="text-amber-400 font-bold animate-pulse">🔥 Flash-Sale Burst (180 RPS)</span>
              )}
              {elapsedSec > 20 && <span className="text-emerald-400">Traffic Cooldown</span>}
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="flex items-center gap-3">
          <button
            onClick={handleStartSimulation}
            disabled={isRunning}
            className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg font-medium text-sm transition shadow-lg shadow-indigo-600/20"
          >
            <Play className="w-4 h-4" />
            Trigger Flash Sale Surge
          </button>

          <button
            onClick={handleToggleFailsafe}
            className={`flex items-center gap-2 px-4 py-2 border rounded-lg font-medium text-sm transition ${
              isFailsafe
                ? 'bg-amber-600/20 border-amber-500 text-amber-200'
                : 'border-slate-700 hover:bg-slate-800 text-slate-300'
            }`}
          >
            <AlertTriangle className="w-4 h-4 text-amber-400" />
            {isFailsafe ? 'Disable Fail-Safe' : 'Test 2000ms Watchdog'}
          </button>

          <button
            onClick={handleReset}
            className="p-2 border border-slate-700 hover:bg-slate-800 text-slate-300 rounded-lg transition"
            title="Reset Simulation"
          >
            <RotateCcw className="w-4 h-4" />
          </button>
        </div>
      </div>

      {/* Side-by-Side Comparison Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* BEFORE: Reactive Autoscaling Card */}
        <div className="bg-slate-900/50 border border-rose-900/30 rounded-2xl p-6 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 px-3 py-1 bg-rose-500/10 border-b border-l border-rose-500/30 text-rose-400 text-xs font-semibold rounded-bl-lg">
            BEFORE (Traditional Reactive)
          </div>

          <div>
            <h2 className="text-lg font-bold text-rose-200 flex items-center gap-2">
              <ShieldAlert className="w-5 h-5 text-rose-500" />
              Native Cloud Autoscaling
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Scales only after CPU breaches 80% (2–5 min container provisioning lag window)
            </p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Active Compute Instances</span>
                <Server className="w-4 h-4 text-slate-500" />
              </div>
              <div className="text-3xl font-bold text-white mt-2 font-mono">
                {reactiveStats.instances}
                <span className="text-xs font-normal text-rose-400 ml-2">
                  {reactiveStats.instances <= 2 && elapsedSec > 6 ? '(Lagging behind spike!)' : ''}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>P95 Response Latency</span>
                <Activity className="w-4 h-4 text-slate-500" />
              </div>
              <div
                className={`text-3xl font-bold mt-2 font-mono ${
                  reactiveStats.latencyMs > 500 ? 'text-rose-400' : 'text-white'
                }`}
              >
                {reactiveStats.latencyMs} <span className="text-sm font-normal text-slate-400">ms</span>
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>503 Service Unavailable Crashes</span>
                <AlertTriangle className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-3xl font-bold text-rose-400 mt-2 font-mono">
                {reactiveStats.error503s}
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Marketplace Oversold Orders</span>
                <Layers className="w-4 h-4 text-rose-500" />
              </div>
              <div className="text-3xl font-bold text-rose-400 mt-2 font-mono">
                {reactiveStats.oversoldItems}
                <span className="text-xs block text-rose-500/80 font-normal mt-0.5">
                  Amazon & Flipkart SLA penalties triggered
                </span>
              </div>
            </div>
          </div>

          <div className="p-3 rounded-lg bg-rose-950/30 border border-rose-900/50 text-xs text-rose-300">
            <strong>Reactive Failure Mode:</strong> Cloud autoscaler waited for CPU threshold breach. Requests queued in the gateway, causing cascading 503 timeouts and webhook inventory desync across Amazon & Flipkart.
          </div>
        </div>

        {/* AFTER: PulseGuard Autonomous Agent Card */}
        <div className="bg-slate-900/50 border border-emerald-900/40 rounded-2xl p-6 space-y-6 relative overflow-hidden">
          <div className="absolute top-0 right-0 px-3 py-1 bg-emerald-500/10 border-b border-l border-emerald-500/30 text-emerald-400 text-xs font-semibold rounded-bl-lg">
            AFTER (PulseGuard Agentic)
          </div>

          <div>
            <h2 className="text-lg font-bold text-emerald-200 flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-emerald-400" />
              PulseGuard Autonomous Resilience
            </h2>
            <p className="text-xs text-slate-400 mt-1">
              Correlates API telemetry slopes via Gemini to proactively pre-warm Cloud Run & lock safety buffers
            </p>
          </div>

          {/* Metrics Grid */}
          <div className="grid grid-cols-2 gap-4">
            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Active Compute Instances</span>
                <Server className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold text-emerald-400 mt-2 font-mono">
                {pulseStats.instances}
                <span className="text-xs font-normal text-emerald-300 ml-2">
                  {pulseStats.instances >= 8 ? '(Pre-warmed ahead of surge!)' : ''}
                </span>
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>P95 Response Latency</span>
                <Activity className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold text-emerald-300 mt-2 font-mono">
                {pulseStats.latencyMs} <span className="text-sm font-normal text-slate-400">ms</span>
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>503 Service Unavailable Crashes</span>
                <TrendingUp className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold text-emerald-400 mt-2 font-mono">
                {pulseStats.error503s}
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Marketplace Safety Stock Buffer</span>
                <Layers className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold text-emerald-300 mt-2 font-mono">
                {pulseStats.lockedStock} <span className="text-xs text-slate-400 font-normal">units locked</span>
                <span className="text-xs block text-emerald-400/80 font-normal mt-0.5">
                  0 Oversold | 100% Marketplace SLA Kept
                </span>
              </div>
            </div>
          </div>

          {/* Idempotency & Channel Lock Banner */}
          {pulseStats.idempotencyKey && (
            <div className="p-3 rounded-lg bg-emerald-950/40 border border-emerald-800/60 text-xs text-emerald-200 space-y-1">
              <div className="flex items-center justify-between">
                <span className="flex items-center gap-1.5 font-semibold text-emerald-300">
                  <Key className="w-3.5 h-3.5 text-emerald-400" />
                  Idempotent Lock Active:
                </span>
                <span className="font-mono text-[11px] text-slate-300">{pulseStats.idempotencyKey}</span>
              </div>
              <div className="flex items-center justify-between text-[11px] text-slate-400">
                <span>Channels Locked: <span className="text-emerald-300 font-mono">[{pulseStats.lockedChannels.join(', ')}]</span></span>
                <span>Guardrail Decision Latency: <strong className="text-emerald-300 font-mono">480ms</strong> (&lt; 2000ms SLA)</span>
              </div>
            </div>
          )}

          <div className="p-3 rounded-lg bg-emerald-950/30 border border-emerald-900/50 text-xs text-emerald-300 flex items-center justify-between">
            <div>
              <strong>Gemini Reasoning Engine:</strong> Detected &Delta;RPS &gt; 4.5&times; slope. Invoked Cloud Run scaling skill to 10 instances (confidence 94%) and locked 50 safety units.
            </div>
            <div className="text-right font-mono text-[11px] text-emerald-400 shrink-0 ml-2">
              Scale Decision: 480ms
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
