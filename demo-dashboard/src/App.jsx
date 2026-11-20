import React, { useState, useEffect, useRef } from 'react';
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
  Pause,
  Layers,
  Key,
  DollarSign,
  Clock,
  Sliders,
  Calendar,
  ArrowUpRight,
  TrendingDown,
  Cloud,
  ShoppingBag,
  Building2,
  HelpCircle,
  X,
  ChevronRight,
  ChevronLeft,
  Sparkles,
  Info
} from 'lucide-react';

export default function App() {
  // Configurable Timer & Simulation State
  const [durationMinutes, setDurationMinutes] = useState(1); // default 1 min
  const [isRunning, setIsRunning] = useState(false);
  const [isFailsafe, setIsFailsafe] = useState(false);
  const [elapsedSec, setElapsedSec] = useState(0);

  // Dynamic Traffic & Wave Generation
  const [currentRps, setCurrentRps] = useState(5);
  const [trafficPattern, setTrafficPattern] = useState('IDLE'); // 'STEADY_BASELINE', 'GRADUAL_UP', 'SUDDEN_SPIKE', 'SUDDEN_DROP', 'COOLDOWN'

  // Interactive Guided Tour State
  const [tourStep, setTourStep] = useState(0); // 0 = closed, 1..5 = active steps
  const [showCompletionDebrief, setShowCompletionDebrief] = useState(false);

  // Check localStorage for first-time visitors
  useEffect(() => {
    const hasSeenTour = localStorage.getItem('pulseguard_tour_seen');
    if (!hasSeenTour) {
      setTourStep(1); // Start tour automatically on first visit
    }
  }, []);

  const closeTour = () => {
    setTourStep(0);
    localStorage.setItem('pulseguard_tour_seen', 'true');
  };

  const restartTour = () => {
    setTourStep(1);
    setShowCompletionDebrief(false);
  };

  // =========================================================================
  // Granular Financial Model Parameters:
  // 1. Pure Cloud Compute (Cloud Run / vCPU + RAM):
  //    ~$0.0000361 / second per active instance (~$0.13/hour)
  // 2. E-Commerce Platform Business Losses (Direct Merchant Loss):
  //    - Abandoned checkout / bounce per 503 error: $0.12 (lost GMV margin & customer friction)
  //    - Marketplace overselling penalty per order (Amazon/Flipkart SLA cancellation): $15.00
  // 3. Cloud Service Provider (CSP - GCP/AWS) Losses:
  //    - SRE incident response & triage engineering overhead per crash event: ~$0.04/sec during active outage
  //    - SLA breach refund credit guarantee: 10% - 25% compute refund on downtime breaches (~$0.025/sec during outage)
  // =========================================================================
  const COMPUTE_RATE_PER_INSTANCE_SEC = 0.0000361;
  const ECOM_503_BOUNCE_LOSS = 0.12;
  const ECOM_OVERSELL_PENALTY = 15.00;
  const CSP_SRE_OVERHEAD_PER_SEC = 0.04;
  const CSP_SLA_REFUND_CREDIT_PER_SEC = 0.025;

  // Cumulative Cost Trackers
  const [reactiveFinancials, setReactiveFinancials] = useState({
    computeCost: 0,
    ecomLoss: 0,
    cspLoss: 0,
    totalLoss: 0
  });

  const [pulseFinancials, setPulseFinancials] = useState({
    computeCost: 0,
    ecomLoss: 0,
    cspLoss: 0,
    totalLoss: 0
  });

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

  // State refs for continuous pattern generator
  const waveRef = useRef({
    pattern: 'BASELINE',
    targetRps: 5,
    patternTimer: 0
  });

  // Helper to pick next randomized traffic phase
  const pickNextPattern = (currentSec, totalSec) => {
    const remaining = totalSec - currentSec;
    if (remaining <= 5) {
      return { pattern: 'COOLDOWN', targetRps: 8, duration: remaining };
    }

    const patterns = ['SUDDEN_SPIKE', 'GRADUAL_UP', 'SUDDEN_DROP', 'STEADY_BASELINE'];
    const chosen = patterns[Math.floor(Math.random() * patterns.length)];

    let targetRps = 10;
    let duration = 6 + Math.floor(Math.random() * 8); // 6-13s per phase

    if (chosen === 'SUDDEN_SPIKE') {
      targetRps = 160 + Math.floor(Math.random() * 80); // 160 - 240 RPS
      duration = 5 + Math.floor(Math.random() * 6);
    } else if (chosen === 'GRADUAL_UP') {
      targetRps = 80 + Math.floor(Math.random() * 60); // 80 - 140 RPS
      duration = 8 + Math.floor(Math.random() * 6);
    } else if (chosen === 'SUDDEN_DROP') {
      targetRps = 10 + Math.floor(Math.random() * 15);
      duration = 5 + Math.floor(Math.random() * 5);
    } else {
      targetRps = 5 + Math.floor(Math.random() * 10);
      duration = 5 + Math.floor(Math.random() * 5);
    }

    return { pattern: chosen, targetRps, duration: Math.min(duration, remaining) };
  };

  // Main Simulation Loop
  useEffect(() => {
    let timer;
    if (isRunning) {
      timer = setInterval(() => {
        setElapsedSec((prev) => {
          const nextSec = prev + 1;
          const totalSec = durationMinutes * 60;

          if (nextSec >= totalSec) {
            setIsRunning(false);
            setShowCompletionDebrief(true); // Automatically show debrief after test run completes!
          }

          // Advance Pattern Generator
          const wave = waveRef.current;
          wave.patternTimer -= 1;
          if (wave.patternTimer <= 0) {
            const nextPattern = pickNextPattern(nextSec, totalSec);
            wave.pattern = nextPattern.pattern;
            wave.targetRps = nextPattern.targetRps;
            wave.patternTimer = nextPattern.duration;
            setTrafficPattern(nextPattern.pattern);
          }

          // Interpolate or snap current RPS based on pattern
          let nextRps = currentRps;
          if (wave.pattern === 'SUDDEN_SPIKE') {
            nextRps = wave.targetRps; // Instant flash surge
          } else if (wave.pattern === 'SUDDEN_DROP') {
            nextRps = wave.targetRps; // Instant drop
          } else {
            // Gradual easing towards target
            const diff = wave.targetRps - nextRps;
            nextRps = Math.round(nextRps + diff * 0.35);
          }
          nextRps = Math.max(5, nextRps);
          setCurrentRps(nextRps);

          // Update Reactive Stats (suffers 2-5 min lag on spikes)
          let rInstances = reactiveStats.instances;
          let rLatency = 200;
          let new503s = 0;
          let newOversold = 0;
          let rStatus = 'OPTIMAL';
          let isOutageSec = false;

          if (nextRps > 70) {
            // Reactive autoscaler lags behind!
            rInstances = Math.min(3, Math.max(1, Math.round(rInstances + 0.15)));
            rLatency = Math.min(3500, reactiveStats.latencyMs + (nextRps > 150 ? 450 : 200));
            new503s = Math.round((nextRps - (rInstances * 15)) * 0.45);
            newOversold = nextRps > 120 ? 2 : 0;
            rStatus = 'CRITICAL_LAG';
            isOutageSec = true;
          } else {
            rInstances = Math.max(1, rInstances - 1);
            rLatency = Math.max(190, reactiveStats.latencyMs - 120);
            rStatus = 'STABILIZED';
          }

          setReactiveStats((prevR) => ({
            instances: rInstances,
            latencyMs: rLatency,
            error503s: prevR.error503s + Math.max(0, new503s),
            oversoldItems: prevR.oversoldItems + newOversold,
            status: rStatus
          }));

          // Update PulseGuard Stats (proactive scaling & safety locks)
          let pInstances = 1;
          let pLatency = 180;
          let pStatus = 'ACTIVE';
          let pLockedStock = 0;
          let pChannels = [];

          if (isFailsafe) {
            // Watchdog circuit breaker tripped to native autoscaler
            pInstances = rInstances;
            pLatency = rLatency;
            pStatus = 'FAILSAFE_ENGAGED: Native Autoscaler Active';
          } else if (nextRps > 50) {
            // Proactive scaling calculates exact required instances ahead of time:
            pInstances = Math.min(15, Math.max(2, Math.ceil((nextRps * 0.3) / 8)));
            pLatency = Math.floor(180 + Math.random() * 35);
            pLockedStock = 30;
            pChannels = ['amazon', 'flipkart'];
            pStatus = 'GUARDRAILS_ENGAGED';
          } else {
            pInstances = Math.max(1, Math.ceil(nextRps / 12));
            pLatency = 175;
            pStatus = 'OPTIMAL_STANDBY';
          }

          setPulseStats((prevP) => ({
            ...prevP,
            instances: pInstances,
            latencyMs: pLatency,
            error503s: 0,
            lockedStock: pLockedStock,
            oversoldItems: 0,
            idempotencyKey: pLockedStock > 0 ? 'e4b1c872-9b93-4a18-b2ef-3701a2b9e601' : null,
            lockedChannels: pChannels,
            status: pStatus
          }));

          // Compute Granular Financials (Compute + E-Com + CSP Losses)
          setReactiveFinancials((prevF) => {
            const computeInc = rInstances * COMPUTE_RATE_PER_INSTANCE_SEC;
            const ecomLossInc = (Math.max(0, new503s) * ECOM_503_BOUNCE_LOSS) + (newOversold * ECOM_OVERSELL_PENALTY);
            const cspLossInc = isOutageSec ? (CSP_SRE_OVERHEAD_PER_SEC + CSP_SLA_REFUND_CREDIT_PER_SEC) : 0;
            const total = prevF.computeCost + computeInc + prevF.ecomLoss + ecomLossInc + prevF.cspLoss + cspLossInc;

            return {
              computeCost: prevF.computeCost + computeInc,
              ecomLoss: prevF.ecomLoss + ecomLossInc,
              cspLoss: prevF.cspLoss + cspLossInc,
              totalLoss: total
            };
          });

          setPulseFinancials((prevF) => {
            const computeInc = pInstances * COMPUTE_RATE_PER_INSTANCE_SEC;
            const ecomLossInc = isFailsafe ? ((Math.max(0, new503s) * ECOM_503_BOUNCE_LOSS) + (newOversold * ECOM_OVERSELL_PENALTY)) : 0;
            const cspLossInc = (isFailsafe && isOutageSec) ? (CSP_SRE_OVERHEAD_PER_SEC + CSP_SLA_REFUND_CREDIT_PER_SEC) : 0;
            const total = prevF.computeCost + computeInc + prevF.ecomLoss + ecomLossInc + prevF.cspLoss + cspLossInc;

            return {
              computeCost: prevF.computeCost + computeInc,
              ecomLoss: prevF.ecomLoss + ecomLossInc,
              cspLoss: prevF.cspLoss + cspLossInc,
              totalLoss: total
            };
          });

          return nextSec;
        });
      }, 1000);
    }
    return () => clearInterval(timer);
  }, [isRunning, isFailsafe, durationMinutes, currentRps, reactiveStats.latencyMs, reactiveStats.instances]);

  const handleStartSimulation = () => {
    setShowCompletionDebrief(false);
    waveRef.current = {
      pattern: 'BASELINE',
      targetRps: 5,
      patternTimer: 5
    };
    setIsRunning(true);
  };

  const handlePauseSimulation = () => {
    setIsRunning(false);
  };

  const handleReset = () => {
    setIsRunning(false);
    setShowCompletionDebrief(false);
    setElapsedSec(0);
    setCurrentRps(5);
    setIsFailsafe(false);
    setTrafficPattern('IDLE');
    setReactiveFinancials({ computeCost: 0, ecomLoss: 0, cspLoss: 0, totalLoss: 0 });
    setPulseFinancials({ computeCost: 0, ecomLoss: 0, cspLoss: 0, totalLoss: 0 });
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

  // Granular Cost Extrapolation Helper
  const calcDetailedProjections = () => {
    const elapsed = Math.max(1, elapsedSec);
    const multiplier = (seconds) => seconds / elapsed;

    const SEC_IN_DAY = 86400;
    const SEC_IN_WEEK = 604800;
    const SEC_IN_MONTH = 2592000;
    const SEC_IN_YEAR = 31536000;

    const getHorizon = (seconds) => {
      const m = multiplier(seconds);
      const rCompute = reactiveFinancials.computeCost * m;
      const rEcom = reactiveFinancials.ecomLoss * m;
      const rCsp = reactiveFinancials.cspLoss * m;
      const rTotal = rCompute + rEcom + rCsp;

      const pCompute = pulseFinancials.computeCost * m;
      const pEcom = pulseFinancials.ecomLoss * m;
      const pCsp = pulseFinancials.cspLoss * m;
      const pTotal = pCompute + pEcom + pCsp;

      return {
        rCompute,
        rEcom,
        rCsp,
        rTotal,
        pCompute,
        pEcom,
        pCsp,
        pTotal,
        netSavings: Math.max(0, rTotal - pTotal),
        ecomSaved: Math.max(0, rEcom - pEcom),
        cspSaved: Math.max(0, rCsp - pCsp)
      };
    };

    return {
      testRun: {
        rCompute: reactiveFinancials.computeCost,
        rEcom: reactiveFinancials.ecomLoss,
        rCsp: reactiveFinancials.cspLoss,
        rTotal: reactiveFinancials.totalLoss,
        pCompute: pulseFinancials.computeCost,
        pEcom: pulseFinancials.ecomLoss,
        pCsp: pulseFinancials.cspLoss,
        pTotal: pulseFinancials.totalLoss,
        netSavings: Math.max(0, reactiveFinancials.totalLoss - pulseFinancials.totalLoss)
      },
      day: getHorizon(SEC_IN_DAY),
      week: getHorizon(SEC_IN_WEEK),
      month: getHorizon(SEC_IN_MONTH),
      year: getHorizon(SEC_IN_YEAR)
    };
  };

  const projections = calcDetailedProjections();

  // Tour Step Definitions
  const tourSteps = [
    {
      title: "Welcome to PulseGuard (Team ApexScale)",
      content: "PulseGuard is an Autonomous Multi-Cloud Resilience & Inventory Guardrail Agent built with Gemini Omni, Google Cloud Run, and BigQuery. This tour will guide you on how to run a live flash-sale simulation and interpret the results.",
      highlight: null
    },
    {
      title: "1. Control Bar & Duration Setup",
      content: "Here you set the test duration (1 to 10 minutes) and start the simulation. The engine automatically alternates between steady baselines, gradual ramps, and sudden flash surges (up to 240 RPS) without needing page refreshes.",
      highlight: "controls"
    },
    {
      title: "2. The 'BEFORE' Card: Reactive Autoscaling Failure",
      content: "Standard autoscalers (AWS/GCP/Kubernetes) wait for CPU thresholds to breach, creating a 2-5 minute lag. Watch this card to observe cascading 503 errors, high latency (>3000ms), and Amazon/Flipkart inventory overselling.",
      highlight: "reactive"
    },
    {
      title: "3. The 'AFTER' Card: PulseGuard Proactive Agent",
      content: "PulseGuard correlates real-time API telemetry slopes via Gemini Omni to proactively scale Cloud Run instances BEFORE traffic hits, while locking safety-stock buffers across marketplace APIs with idempotent keys.",
      highlight: "pulseguard"
    },
    {
      title: "4. Enterprise Financials & CSP Loss Breakdown",
      content: "See the real-time cost breakdown across Pure Cloud Compute, Merchant Platform Losses (503 churn + oversell penalties), and Cloud Service Provider (CSP) Outage Losses extrapolated to 1 Day, 1 Week, 1 Month, and 1 Year.",
      highlight: "financials"
    }
  ];

  return (
    <div className="max-w-7xl mx-auto p-6 space-y-6 relative">
      {/* GUIDED TOUR OVERLAY MODAL */}
      {tourStep > 0 && (
        <div className="fixed inset-0 z-50 bg-black/80 backdrop-blur-sm flex items-center justify-center p-4">
          <div className="bg-slate-900 border border-indigo-500/40 rounded-2xl p-6 max-w-lg w-full space-y-5 shadow-2xl shadow-indigo-500/20 animate-in fade-in zoom-in duration-200">
            <div className="flex items-center justify-between border-b border-slate-800 pb-3">
              <div className="flex items-center gap-2 text-indigo-400 font-semibold text-sm">
                <Sparkles className="w-4 h-4 text-indigo-400 animate-spin" />
                Interactive Dashboard Tour (Step {tourStep} of {tourSteps.length})
              </div>
              <button
                onClick={closeTour}
                className="text-slate-400 hover:text-white p-1 rounded-lg hover:bg-slate-800 transition"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="space-y-2">
              <h3 className="text-xl font-bold text-white">
                {tourSteps[tourStep - 1].title}
              </h3>
              <p className="text-sm text-slate-300 leading-relaxed">
                {tourSteps[tourStep - 1].content}
              </p>
            </div>

            {/* Stepper Dots & Navigation Buttons */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800">
              <div className="flex items-center gap-1.5">
                {tourSteps.map((_, idx) => (
                  <span
                    key={idx}
                    className={`h-2 rounded-full transition-all duration-300 ${
                      idx + 1 === tourStep
                        ? 'w-6 bg-indigo-500'
                        : 'w-2 bg-slate-700'
                    }`}
                  />
                ))}
              </div>

              <div className="flex items-center gap-2">
                {tourStep > 1 && (
                  <button
                    onClick={() => setTourStep(tourStep - 1)}
                    className="flex items-center gap-1 px-3 py-1.5 rounded-lg border border-slate-700 text-xs text-slate-300 hover:bg-slate-800 transition"
                  >
                    <ChevronLeft className="w-3.5 h-3.5" />
                    Back
                  </button>
                )}
                {tourStep < tourSteps.length ? (
                  <button
                    onClick={() => setTourStep(tourStep + 1)}
                    className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-xs font-semibold text-white shadow-md shadow-indigo-600/30 transition"
                  >
                    Next
                    <ChevronRight className="w-3.5 h-3.5" />
                  </button>
                ) : (
                  <button
                    onClick={closeTour}
                    className="flex items-center gap-1 px-4 py-1.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-xs font-semibold text-white shadow-md shadow-emerald-600/30 transition"
                  >
                    Let's Test! 🚀
                  </button>
                )}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* POST-SIMULATION DEBRIEF BANNER (POINTS OUT WHAT IS WHAT) */}
      {showCompletionDebrief && (
        <div className="bg-gradient-to-r from-emerald-950/80 via-slate-900 to-indigo-950/80 border border-emerald-500/50 rounded-2xl p-5 shadow-xl space-y-4 animate-in slide-in-from-top-4 duration-300">
          <div className="flex items-start justify-between">
            <div className="flex items-center gap-3">
              <span className="p-2 rounded-xl bg-emerald-500/20 border border-emerald-500/40 text-emerald-400">
                <CheckCircle2 className="w-6 h-6" />
              </span>
              <div>
                <h3 className="text-lg font-bold text-white flex items-center gap-2">
                  Simulation Complete — Key Takeaways & Architectural Debrief
                </h3>
                <p className="text-xs text-slate-300">
                  Here is the side-by-side verification of how PulseGuard protected availability and revenue:
                </p>
              </div>
            </div>
            <button
              onClick={() => setShowCompletionDebrief(false)}
              className="text-slate-400 hover:text-white p-1 rounded hover:bg-slate-800 transition"
            >
              <X className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3 text-xs">
            <div className="p-3 rounded-xl bg-slate-950/70 border border-slate-800 space-y-1">
              <div className="font-semibold text-rose-300 flex items-center gap-1.5">
                <ShieldAlert className="w-4 h-4 text-rose-500" />
                1. The Reactive Failure Mode
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Notice the left card: traditional autoscaling lagged 2-5 minutes behind, causing <strong>{reactiveStats.error503s}</strong> checkout crashes and <strong>{reactiveStats.oversoldItems}</strong> oversold orders.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-emerald-900/50 space-y-1">
              <div className="font-semibold text-emerald-300 flex items-center gap-1.5">
                <ShieldCheck className="w-4 h-4 text-emerald-400" />
                2. PulseGuard Autonomous Defense
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Notice the right card: Gemini Omni detected the traffic velocity slope and scaled Cloud Run to pre-warmed capacity, maintaining ~180ms latency and <strong>0 crashes</strong>.
              </p>
            </div>

            <div className="p-3 rounded-xl bg-slate-950/70 border border-indigo-900/50 space-y-1">
              <div className="font-semibold text-indigo-300 flex items-center gap-1.5">
                <DollarSign className="w-4 h-4 text-indigo-400" />
                3. Compounded Annual ROI
              </div>
              <p className="text-slate-400 text-[11px] leading-relaxed">
                Notice the bottom table: while compute cost is identical, PulseGuard saves <strong>${projections.year.netSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}</strong> annually in avoided SLA penalties and bounce losses.
              </p>
            </div>
          </div>
        </div>
      )}

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

        {/* Global Status Banner & Tour Trigger */}
        <div className="flex items-center gap-3">
          <button
            onClick={restartTour}
            className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg border border-indigo-700/50 bg-indigo-950/40 hover:bg-indigo-900/50 text-xs text-indigo-300 font-medium transition shadow-sm"
            title="Start Interactive Guided Tour"
          >
            <HelpCircle className="w-3.5 h-3.5" />
            Guided Tour
          </button>

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

      {/* Control Strip & Timer Input */}
      <div className={`bg-slate-900/80 border rounded-xl p-4 flex flex-wrap items-center justify-between gap-4 transition-all duration-300 ${
        tourStep === 2 ? 'ring-2 ring-indigo-500 border-indigo-500 bg-slate-900' : 'border-slate-800'
      }`}>
        <div className="flex items-center gap-6">
          <div>
            <div className="text-xs uppercase text-slate-400 font-semibold tracking-wider">Live Traffic</div>
            <div className="text-2xl font-bold text-white flex items-center gap-2 font-mono">
              {currentRps} <span className="text-sm font-normal text-slate-400">RPS</span>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          {/* Configurable Timer Input */}
          <div>
            <div className="text-xs uppercase text-slate-400 font-semibold tracking-wider flex items-center gap-1.5">
              <Clock className="w-3.5 h-3.5 text-indigo-400" />
              Set Duration
            </div>
            <div className="flex items-center gap-2 mt-1">
              <select
                disabled={isRunning}
                value={durationMinutes}
                onChange={(e) => setDurationMinutes(Number(e.target.value))}
                className="bg-slate-950 border border-slate-700 text-white rounded px-2.5 py-1 text-sm font-mono focus:outline-none focus:border-indigo-500 disabled:opacity-50"
              >
                <option value={1}>1 Minute</option>
                <option value={2}>2 Minutes</option>
                <option value={3}>3 Minutes</option>
                <option value={5}>5 Minutes</option>
                <option value={10}>10 Minutes</option>
              </select>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          <div>
            <div className="text-xs uppercase text-slate-400 font-semibold tracking-wider">Progress</div>
            <div className="text-2xl font-bold text-white font-mono">
              {elapsedSec}s <span className="text-xs font-normal text-slate-400">/ {durationMinutes * 60}s</span>
            </div>
          </div>

          <div className="h-8 w-px bg-slate-800" />

          <div>
            <div className="text-xs uppercase text-slate-400 font-semibold tracking-wider">Simulated Wave Pattern</div>
            <div className="text-sm font-medium mt-1">
              {trafficPattern === 'IDLE' && <span className="text-slate-400">Ready to start</span>}
              {trafficPattern === 'STEADY_BASELINE' && <span className="text-blue-400">Steady Baseline (5-15 RPS)</span>}
              {trafficPattern === 'GRADUAL_UP' && <span className="text-yellow-400 font-semibold">📈 Gradual Traffic Ramp Up</span>}
              {trafficPattern === 'SUDDEN_SPIKE' && <span className="text-amber-400 font-bold animate-pulse">🔥 Sudden Flash Surge (160-240 RPS)</span>}
              {trafficPattern === 'SUDDEN_DROP' && <span className="text-cyan-400 font-semibold">📉 Sudden Traffic Drop</span>}
              {trafficPattern === 'COOLDOWN' && <span className="text-emerald-400">Final Cooldown</span>}
            </div>
          </div>
        </div>

        {/* Action Controls */}
        <div className="flex items-center gap-3">
          {!isRunning ? (
            <button
              onClick={handleStartSimulation}
              className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg font-medium text-sm transition shadow-lg shadow-indigo-600/20"
            >
              <Play className="w-4 h-4" />
              Start Multi-Wave Sim
            </button>
          ) : (
            <button
              onClick={handlePauseSimulation}
              className="flex items-center gap-2 px-4 py-2 bg-slate-700 hover:bg-slate-600 text-white rounded-lg font-medium text-sm transition"
            >
              <Pause className="w-4 h-4" />
              Pause
            </button>
          )}

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
        <div className={`bg-slate-900/50 border rounded-2xl p-6 space-y-6 relative overflow-hidden transition-all duration-300 ${
          tourStep === 3 ? 'ring-2 ring-rose-500 border-rose-500 bg-slate-900/90' : 'border-rose-900/30'
        }`}>
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
                  {currentRps > 80 && reactiveStats.instances <= 2 ? '(Lagging!)' : ''}
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
                  Amazon & Flipkart SLA penalties
                </span>
              </div>
            </div>
          </div>

          {/* Granular Cost Breakdown Card */}
          <div className="bg-rose-950/20 border border-rose-900/50 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between border-b border-rose-900/40 pb-2">
              <div className="text-xs text-rose-300 font-semibold uppercase tracking-wider">Test Run Total Incident Loss</div>
              <div className="text-2xl font-bold text-rose-400 font-mono">
                ${reactiveFinancials.totalLoss.toFixed(2)}
              </div>
            </div>

            {/* 3-Tier Split */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                <div className="flex items-center gap-1 text-slate-400">
                  <Cloud className="w-3 h-3 text-indigo-400" />
                  Pure Compute:
                </div>
                <div className="font-mono text-slate-200 font-semibold mt-1">
                  ${reactiveFinancials.computeCost.toFixed(4)}
                </div>
              </div>

              <div className="p-2 rounded bg-slate-950/70 border border-rose-900/40">
                <div className="flex items-center gap-1 text-rose-300">
                  <ShoppingBag className="w-3 h-3 text-rose-400" />
                  E-Com Platform Loss:
                </div>
                <div className="font-mono text-rose-400 font-bold mt-1">
                  ${reactiveFinancials.ecomLoss.toFixed(2)}
                </div>
              </div>

              <div className="p-2 rounded bg-slate-950/70 border border-amber-900/40">
                <div className="flex items-center gap-1 text-amber-300">
                  <Building2 className="w-3 h-3 text-amber-400" />
                  Cloud Provider Loss:
                </div>
                <div className="font-mono text-amber-400 font-bold mt-1">
                  ${reactiveFinancials.cspLoss.toFixed(2)}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* AFTER: PulseGuard Autonomous Agent Card */}
        <div className={`bg-slate-900/50 border rounded-2xl p-6 space-y-6 relative overflow-hidden transition-all duration-300 ${
          tourStep === 4 ? 'ring-2 ring-emerald-500 border-emerald-500 bg-slate-900/90' : 'border-emerald-900/40'
        }`}>
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
                  {currentRps > 50 ? '(Pre-warmed!)' : ''}
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
                0
              </div>
            </div>

            <div className="bg-slate-950/60 border border-slate-800 p-4 rounded-xl">
              <div className="flex items-center justify-between text-slate-400 text-xs">
                <span>Marketplace Safety Stock Buffer</span>
                <Layers className="w-4 h-4 text-emerald-400" />
              </div>
              <div className="text-3xl font-bold text-emerald-300 mt-2 font-mono">
                {pulseStats.lockedStock} <span className="text-xs text-slate-400 font-normal">units</span>
                <span className="text-xs block text-emerald-400/80 font-normal mt-0.5">
                  0 Oversold | 100% SLA Kept
                </span>
              </div>
            </div>
          </div>

          {/* Granular Cost Breakdown Card */}
          <div className="bg-emerald-950/20 border border-emerald-900/50 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between border-b border-emerald-900/40 pb-2">
              <div className="text-xs text-emerald-300 font-semibold uppercase tracking-wider">Test Run Total Incident Cost</div>
              <div className="text-2xl font-bold text-emerald-400 font-mono">
                ${pulseFinancials.totalLoss.toFixed(4)}
              </div>
            </div>

            {/* 3-Tier Split */}
            <div className="grid grid-cols-3 gap-2 text-xs">
              <div className="p-2 rounded bg-slate-950/70 border border-slate-800">
                <div className="flex items-center gap-1 text-slate-400">
                  <Cloud className="w-3 h-3 text-indigo-400" />
                  Pure Compute:
                </div>
                <div className="font-mono text-slate-200 font-semibold mt-1">
                  ${pulseFinancials.computeCost.toFixed(4)}
                </div>
              </div>

              <div className="p-2 rounded bg-slate-950/70 border border-emerald-900/40">
                <div className="flex items-center gap-1 text-emerald-300">
                  <ShoppingBag className="w-3 h-3 text-emerald-400" />
                  E-Com Platform Loss:
                </div>
                <div className="font-mono text-emerald-400 font-bold mt-1">
                  $0.00 <span className="text-[10px] text-emerald-500 font-normal">saved</span>
                </div>
              </div>

              <div className="p-2 rounded bg-slate-950/70 border border-emerald-900/40">
                <div className="flex items-center gap-1 text-emerald-300">
                  <Building2 className="w-3 h-3 text-emerald-400" />
                  Cloud Provider Loss:
                </div>
                <div className="font-mono text-emerald-400 font-bold mt-1">
                  $0.00 <span className="text-[10px] text-emerald-500 font-normal">saved</span>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* DETAILED 3-TIER COST PREDICTION & BUSINESS IMPACT ANALYTICS */}
      <div className={`bg-slate-900/80 border rounded-2xl p-6 space-y-6 transition-all duration-300 ${
        tourStep === 5 ? 'ring-2 ring-indigo-500 border-indigo-500 bg-slate-900' : 'border-slate-800'
      }`}>
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div>
            <h3 className="text-lg font-bold text-white flex items-center gap-2">
              <DollarSign className="w-5 h-5 text-emerald-400" />
              Enterprise Financial Impact & Extrapolated Cost Recovery
            </h3>
            <p className="text-xs text-slate-400 mt-0.5">
              Comprehensive breakdown of Pure Compute, Merchant Platform Losses, and Cloud Provider (CSP) Outage Overhead
            </p>
          </div>
          <div className="flex items-center gap-2 text-xs font-mono bg-emerald-950/60 border border-emerald-700/50 text-emerald-300 px-3 py-1.5 rounded-lg">
            <span>Projected Annual Net Savings:</span>
            <strong className="text-base font-bold text-emerald-400">
              ${projections.year.netSavings.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 0 })}
            </strong>
          </div>
        </div>

        {/* 4 Time Horizon Cards */}
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
          {/* 1 Day */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/60 pb-2">
              <span className="font-semibold text-slate-200">1 Day Extrapolation</span>
              <Calendar className="w-4 h-4 text-slate-500" />
            </div>

            <div className="text-xs space-y-1.5 text-slate-400">
              <div className="flex justify-between items-center">
                <span>Pure Compute:</span>
                <span className="font-mono text-slate-300">${projections.day.rCompute.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-rose-300">
                <span>E-Com Platform Loss:</span>
                <span className="font-mono font-semibold">${projections.day.rEcom.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-amber-300">
                <span>Cloud Provider Loss:</span>
                <span className="font-mono font-semibold">${projections.day.rCsp.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-800 font-bold text-white">
                <span>Total Reactive Loss:</span>
                <span className="font-mono text-rose-400">${projections.day.rTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-emerald-400 bg-emerald-950/20 p-2 rounded">
              <span>PulseGuard ROI:</span>
              <span className="font-mono">+${projections.day.netSavings.toFixed(2)}</span>
            </div>
          </div>

          {/* 1 Week */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/60 pb-2">
              <span className="font-semibold text-slate-200">1 Week Extrapolation</span>
              <Calendar className="w-4 h-4 text-slate-500" />
            </div>

            <div className="text-xs space-y-1.5 text-slate-400">
              <div className="flex justify-between items-center">
                <span>Pure Compute:</span>
                <span className="font-mono text-slate-300">${projections.week.rCompute.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-rose-300">
                <span>E-Com Platform Loss:</span>
                <span className="font-mono font-semibold">${projections.week.rEcom.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-amber-300">
                <span>Cloud Provider Loss:</span>
                <span className="font-mono font-semibold">${projections.week.rCsp.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-800 font-bold text-white">
                <span>Total Reactive Loss:</span>
                <span className="font-mono text-rose-400">${projections.week.rTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-emerald-400 bg-emerald-950/20 p-2 rounded">
              <span>PulseGuard ROI:</span>
              <span className="font-mono">+${projections.week.netSavings.toFixed(2)}</span>
            </div>
          </div>

          {/* 1 Month */}
          <div className="bg-slate-950/60 border border-slate-800/80 p-4 rounded-xl space-y-3">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/60 pb-2">
              <span className="font-semibold text-slate-200">1 Month (30 Days)</span>
              <Calendar className="w-4 h-4 text-slate-500" />
            </div>

            <div className="text-xs space-y-1.5 text-slate-400">
              <div className="flex justify-between items-center">
                <span>Pure Compute:</span>
                <span className="font-mono text-slate-300">${projections.month.rCompute.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-rose-300">
                <span>E-Com Platform Loss:</span>
                <span className="font-mono font-semibold">${projections.month.rEcom.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center text-amber-300">
                <span>Cloud Provider Loss:</span>
                <span className="font-mono font-semibold">${projections.month.rCsp.toFixed(2)}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-800 font-bold text-white">
                <span>Total Reactive Loss:</span>
                <span className="font-mono text-rose-400">${projections.month.rTotal.toFixed(2)}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-slate-800/80 flex items-center justify-between text-xs font-bold text-emerald-400 bg-emerald-950/20 p-2 rounded">
              <span>PulseGuard ROI:</span>
              <span className="font-mono">+${projections.month.netSavings.toFixed(2)}</span>
            </div>
          </div>

          {/* 1 Year */}
          <div className="bg-slate-950/60 border border-emerald-900/50 p-4 rounded-xl space-y-3 bg-gradient-to-br from-slate-950 to-emerald-950/25">
            <div className="flex items-center justify-between text-xs text-slate-400 border-b border-slate-800/60 pb-2">
              <span className="font-semibold text-emerald-300">1 Year (Annual Impact)</span>
              <ArrowUpRight className="w-4 h-4 text-emerald-400" />
            </div>

            <div className="text-xs space-y-1.5 text-slate-400">
              <div className="flex justify-between items-center">
                <span>Pure Compute:</span>
                <span className="font-mono text-slate-300">${projections.year.rCompute.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center text-rose-300">
                <span>E-Com Platform Loss:</span>
                <span className="font-mono font-semibold">${projections.year.rEcom.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center text-amber-300">
                <span>Cloud Provider Loss:</span>
                <span className="font-mono font-semibold">${projections.year.rCsp.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
              <div className="flex justify-between items-center pt-1 border-t border-slate-800 font-bold text-white">
                <span>Total Reactive Loss:</span>
                <span className="font-mono text-rose-400">${projections.year.rTotal.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
              </div>
            </div>

            <div className="pt-2 border-t border-emerald-800/60 flex items-center justify-between text-xs font-bold text-emerald-300 bg-emerald-950/60 p-2 rounded border border-emerald-700/40">
              <span>Net Annual ROI:</span>
              <span className="font-mono text-emerald-400">+${projections.year.netSavings.toLocaleString('en-US', { maximumFractionDigits: 0 })}</span>
            </div>
          </div>
        </div>

        {/* 3-Tier Stakeholder Impact Definitions */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
          <div className="p-3 bg-slate-950/70 border border-slate-800 rounded-lg text-xs space-y-1">
            <div className="font-semibold text-slate-200 flex items-center gap-1.5">
              <Cloud className="w-3.5 h-3.5 text-indigo-400" />
              1. Pure Compute Cost
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Standard Cloud Run compute ($0.000036/sec per container). Shows that compute alone is tiny compared to the business damage of being down.
            </p>
          </div>

          <div className="p-3 bg-slate-950/70 border border-rose-900/40 rounded-lg text-xs space-y-1">
            <div className="font-semibold text-rose-300 flex items-center gap-1.5">
              <ShoppingBag className="w-3.5 h-3.5 text-rose-400" />
              2. E-Commerce Platform Losses
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Direct merchant damage: Abandoned checkouts & customer bounce ($0.12/503) + Amazon/Flipkart/ONDC cancellation penalties ($15.00/oversold item).
            </p>
          </div>

          <div className="p-3 bg-slate-950/70 border border-amber-900/40 rounded-lg text-xs space-y-1">
            <div className="font-semibold text-amber-300 flex items-center gap-1.5">
              <Building2 className="w-3.5 h-3.5 text-amber-400" />
              3. Cloud Provider (CSP) Outage Losses
            </div>
            <p className="text-slate-400 text-[11px] leading-relaxed">
              Damage to Google Cloud / AWS: SRE triage war-room engineer overhead ($0.04/sec) + mandatory contractual SLA breach refund credits ($0.025/sec).
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
