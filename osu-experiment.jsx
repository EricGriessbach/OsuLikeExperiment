import React, { useState, useEffect, useRef, useCallback } from 'react';

// ============================================
// CONFIGURATION - Edit these to customize trials
// ============================================
const TRIAL_CONFIG = {
  // Click sequences: Each sequence is 5 clicks in order
  clickSequences: [
    { 
      id: 'seq_1', 
      type: 'click_sequence',
      positions: [
        { x: 0.2, y: 0.3 },
        { x: 0.4, y: 0.5 },
        { x: 0.6, y: 0.3 },
        { x: 0.8, y: 0.5 },
        { x: 0.5, y: 0.7 },
      ]
    },
    { 
      id: 'seq_2', 
      type: 'click_sequence',
      positions: [
        { x: 0.5, y: 0.2 },
        { x: 0.3, y: 0.4 },
        { x: 0.7, y: 0.4 },
        { x: 0.3, y: 0.7 },
        { x: 0.7, y: 0.7 },
      ]
    },
    { 
      id: 'seq_3', 
      type: 'click_sequence',
      positions: [
        { x: 0.15, y: 0.5 },
        { x: 0.35, y: 0.3 },
        { x: 0.5, y: 0.6 },
        { x: 0.65, y: 0.3 },
        { x: 0.85, y: 0.5 },
      ]
    },
    { 
      id: 'seq_4', 
      type: 'click_sequence',
      positions: [
        { x: 0.8, y: 0.2 },
        { x: 0.6, y: 0.4 },
        { x: 0.4, y: 0.2 },
        { x: 0.2, y: 0.4 },
        { x: 0.5, y: 0.75 },
      ]
    },
    { 
      id: 'seq_5', 
      type: 'click_sequence',
      positions: [
        { x: 0.5, y: 0.15 },
        { x: 0.25, y: 0.35 },
        { x: 0.75, y: 0.35 },
        { x: 0.35, y: 0.65 },
        { x: 0.65, y: 0.65 },
      ]
    },
  ],
  // Track shapes
  trackShapes: [
    { 
      id: 'track_line', 
      type: 'track', 
      shape: 'line', 
      startX: 0.1, 
      startY: 0.5,
      params: { endX: 0.9, endY: 0.5, duration: 3000 }
    },
    { 
      id: 'track_wave', 
      type: 'track', 
      shape: 'wave', 
      startX: 0.1, 
      startY: 0.5,
      params: { amplitude: 0.15, frequency: 2, endX: 0.9, duration: 4000 }
    },
    { 
      id: 'track_circle', 
      type: 'track', 
      shape: 'circle', 
      startX: 0.5, 
      startY: 0.25,
      params: { centerX: 0.5, centerY: 0.5, radius: 0.25, duration: 4000 }
    },
    { 
      id: 'track_blob', 
      type: 'track', 
      shape: 'blob', 
      startX: 0.3, 
      startY: 0.3,
      params: { points: [[0.3, 0.3], [0.7, 0.25], [0.75, 0.7], [0.25, 0.65]], duration: 5000 }
    },
    { 
      id: 'track_zigzag', 
      type: 'track', 
      shape: 'zigzag', 
      startX: 0.1, 
      startY: 0.3,
      params: { points: [[0.1, 0.3], [0.3, 0.7], [0.5, 0.3], [0.7, 0.7], [0.9, 0.3]], duration: 4500 }
    },
  ],
  totalTrials: 20,
  targetRadius: 40, // pixels - max distance for click points
  trackingMaxDistance: 80, // pixels - distance at which tracking gives 0 points
  samplingRate: 16, // ms between position samples during tracking
  
  // Continuous point system configuration
  points: {
    // Click: points = maxClickPoints * accuracyFactor * timeFactor
    // accuracyFactor = max(0, 1 - distance/targetRadius)
    // timeFactor = max(0, 1 - reactionTime/maxReactionTime)
    maxClickPoints: 400,      // Maximum points per click (perfect accuracy + instant reaction)
    maxReactionTime: 1000,    // RT at which time factor becomes 0 (ms)
    
    // Tracking: points per sample = maxPointsPerSample * (1 - distance/trackingMaxDistance)
    // Only awarded if clicking/holding
    maxPointsPerSample: 5,    // Max points per 16ms sample when perfectly on target
    
    // Grade thresholds (for labels only, not points)
    clickPerfectDist: 10,     // Distance threshold for PERFECT label
    clickGreatDist: 25,       // Distance threshold for GREAT label
    clickPerfectTime: 200,    // RT threshold for PERFECT label (ms)
    clickGreatTime: 400,      // RT threshold for GREAT label (ms)
    trackPerfectPct: 0.9,     // Accuracy % for PERFECT label
    trackGreatPct: 0.7,       // Accuracy % for GREAT label
    trackOkPct: 0.5,          // Accuracy % for OK label
  }
};

// ============================================
// SHAPE PATH CALCULATORS
// ============================================
const getPositionOnPath = (shape, params, progress, canvasWidth, canvasHeight) => {
  const t = Math.min(1, Math.max(0, progress));
  
  switch (shape) {
    case 'line': {
      const x = params.startX + (params.endX - params.startX) * t;
      const y = params.startY + (params.endY - params.startY) * t;
      return { x: x * canvasWidth, y: y * canvasHeight };
    }
    
    case 'wave': {
      const x = params.startX + (params.endX - params.startX) * t;
      const baseY = params.startY;
      const y = baseY + Math.sin(t * Math.PI * 2 * params.frequency) * params.amplitude;
      return { x: x * canvasWidth, y: y * canvasHeight };
    }
    
    case 'circle': {
      const angle = t * Math.PI * 2 - Math.PI / 2;
      const x = params.centerX + Math.cos(angle) * params.radius;
      const y = params.centerY + Math.sin(angle) * params.radius;
      return { x: x * canvasWidth, y: y * canvasHeight };
    }
    
    case 'blob':
    case 'zigzag': {
      const points = params.points;
      const totalSegments = points.length - 1;
      const segmentProgress = t * totalSegments;
      const segmentIndex = Math.min(Math.floor(segmentProgress), totalSegments - 1);
      const localT = segmentProgress - segmentIndex;
      
      const p1 = points[segmentIndex];
      const p2 = points[segmentIndex + 1];
      
      if (shape === 'blob' && points.length >= 4) {
        const p0 = points[Math.max(0, segmentIndex - 1)];
        const p3 = points[Math.min(points.length - 1, segmentIndex + 2)];
        const x = catmullRom(p0[0], p1[0], p2[0], p3[0], localT);
        const y = catmullRom(p0[1], p1[1], p2[1], p3[1], localT);
        return { x: x * canvasWidth, y: y * canvasHeight };
      }
      
      const x = p1[0] + (p2[0] - p1[0]) * localT;
      const y = p1[1] + (p2[1] - p1[1]) * localT;
      return { x: x * canvasWidth, y: y * canvasHeight };
    }
    
    default:
      return { x: canvasWidth / 2, y: canvasHeight / 2 };
  }
};

const catmullRom = (p0, p1, p2, p3, t) => {
  const t2 = t * t;
  const t3 = t2 * t;
  return 0.5 * (
    (2 * p1) +
    (-p0 + p2) * t +
    (2 * p0 - 5 * p1 + 4 * p2 - p3) * t2 +
    (-p0 + 3 * p1 - 3 * p2 + p3) * t3
  );
};

// ============================================
// CONTINUOUS POINT CALCULATION
// ============================================
const calculateClickPoints = (distance, reactionTime) => {
  const pts = TRIAL_CONFIG.points;
  const radius = TRIAL_CONFIG.targetRadius;
  
  // If outside target radius, no points
  if (distance > radius) {
    return { points: 0, grade: 'MISS', accuracyFactor: 0, timeFactor: 0 };
  }
  
  // Continuous accuracy factor: 1 at center, 0 at edge
  const accuracyFactor = Math.max(0, 1 - distance / radius);
  
  // Continuous time factor: 1 at instant, 0 at maxReactionTime
  const timeFactor = Math.max(0, 1 - reactionTime / pts.maxReactionTime);
  
  // Combined points (multiplicative)
  const points = Math.round(pts.maxClickPoints * accuracyFactor * timeFactor);
  
  // Determine grade label based on thresholds
  let grade = 'OK';
  if (distance <= pts.clickPerfectDist && reactionTime <= pts.clickPerfectTime) {
    grade = 'PERFECT';
  } else if (distance <= pts.clickGreatDist && reactionTime <= pts.clickGreatTime) {
    grade = 'GREAT';
  }
  
  return { points, grade, accuracyFactor, timeFactor };
};

const calculateTrackingSamplePoints = (distance, isClicking) => {
  const pts = TRIAL_CONFIG.points;
  const maxDist = TRIAL_CONFIG.trackingMaxDistance;
  
  // No points if not clicking
  if (!isClicking) {
    return 0;
  }
  
  // Continuous distance factor: 1 at center, 0 at maxDistance
  const distanceFactor = Math.max(0, 1 - distance / maxDist);
  
  return pts.maxPointsPerSample * distanceFactor;
};

const getTrackingGrade = (accuracy) => {
  const pts = TRIAL_CONFIG.points;
  if (accuracy >= pts.trackPerfectPct) return 'PERFECT';
  if (accuracy >= pts.trackGreatPct) return 'GREAT';
  if (accuracy >= pts.trackOkPct) return 'OK';
  return 'POOR';
};

// ============================================
// FLOATING POINTS COMPONENT
// ============================================
const FloatingPoints = ({ points, grade, position, onComplete }) => {
  const [opacity, setOpacity] = useState(1);
  const [offset, setOffset] = useState(0);
  
  useEffect(() => {
    const startTime = performance.now();
    const duration = 1000;
    
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      if (progress >= 1) {
        onComplete?.();
        return;
      }
      
      setOffset(progress * 50);
      setOpacity(1 - progress * 0.7);
      requestAnimationFrame(animate);
    };
    
    requestAnimationFrame(animate);
  }, []);
  
  const gradeColors = {
    'PERFECT': '#22d3ee',
    'GREAT': '#a855f7',
    'OK': '#facc15',
    'POOR': '#f87171',
    'MISS': '#6b7280'
  };
  
  return (
    <div
      className="absolute pointer-events-none text-center"
      style={{
        left: position.x,
        top: position.y - 60 - offset,
        transform: 'translateX(-50%)',
        opacity,
        fontFamily: 'Orbitron',
        zIndex: 100
      }}
    >
      <div 
        className="text-2xl font-black"
        style={{ color: gradeColors[grade] || '#fff', textShadow: `0 0 20px ${gradeColors[grade]}` }}
      >
        {grade}
      </div>
      <div className="text-xl font-bold text-white">
        +{points}
      </div>
    </div>
  );
};

// ============================================
// MAIN GAME COMPONENT
// ============================================
export default function OsuExperiment() {
  const [gameState, setGameState] = useState('intro');
  const [trials, setTrials] = useState([]);
  const [currentTrialIndex, setCurrentTrialIndex] = useState(0);
  const [trialData, setTrialData] = useState([]);
  const [totalScore, setTotalScore] = useState(0);
  const [countdown, setCountdown] = useState(3);
  
  // Current trial state
  const [targetPosition, setTargetPosition] = useState({ x: 0, y: 0 });
  const [cursorPosition, setCursorPosition] = useState({ x: 0, y: 0 });
  const cursorRef = useRef({ x: 0, y: 0 });
  const [isClicking, setIsClicking] = useState(false);
  const isClickingRef = useRef(false);
  const [trackingStarted, setTrackingStarted] = useState(false);
  const [trialStartTime, setTrialStartTime] = useState(0);
  
  // Click sequence state
  const [currentClickIndex, setCurrentClickIndex] = useState(0);
  const [clickStartTime, setClickStartTime] = useState(0);
  
  // Tracking points display
  const [trackingPoints, setTrackingPoints] = useState(0);
  const trackingPointsRef = useRef(0);
  
  // Floating points
  const [floatingPoints, setFloatingPoints] = useState([]);
  const floatingIdRef = useRef(0);
  
  const canvasRef = useRef(null);
  const animationRef = useRef(null);
  const sampleIntervalRef = useRef(null);
  
  const [canvasSize, setCanvasSize] = useState({ width: 800, height: 600 });

  // Initialize trials
  const initializeTrials = useCallback(() => {
    const allTrialTypes = [
      ...TRIAL_CONFIG.clickSequences,
      ...TRIAL_CONFIG.trackShapes.map(s => ({
        ...s,
        params: { ...s.params, startX: s.startX, startY: s.startY }
      }))
    ];
    
    const selected = [];
    for (let i = 0; i < TRIAL_CONFIG.totalTrials; i++) {
      const randomIndex = Math.floor(Math.random() * allTrialTypes.length);
      selected.push({ ...allTrialTypes[randomIndex], instanceId: i });
    }
    
    setTrials(selected);
    setCurrentTrialIndex(0);
    setTrialData([]);
    setTotalScore(0);
    setFloatingPoints([]);
  }, []);

  // Handle canvas resize
  useEffect(() => {
    const updateSize = () => {
      const container = canvasRef.current?.parentElement;
      if (container) {
        const rect = container.getBoundingClientRect();
        setCanvasSize({ 
          width: Math.min(rect.width - 40, 900), 
          height: Math.min(rect.height - 40, 700) 
        });
      }
    };
    
    updateSize();
    window.addEventListener('resize', updateSize);
    return () => window.removeEventListener('resize', updateSize);
  }, []);

  // Start game
  const startGame = () => {
    initializeTrials();
    setGameState('countdown');
    setCountdown(3);
  };

  // Countdown effect
  useEffect(() => {
    if (gameState === 'countdown' && countdown > 0) {
      const timer = setTimeout(() => setCountdown(countdown - 1), 1000);
      return () => clearTimeout(timer);
    } else if (gameState === 'countdown' && countdown === 0) {
      setGameState('playing');
    }
  }, [gameState, countdown]);

  // Start trial when playing begins or trial changes
  useEffect(() => {
    if (gameState === 'playing' && trials.length > 0) {
      startTrial();
    }
  }, [currentTrialIndex, gameState, trials, canvasSize]);

  // Start a trial
  const startTrial = () => {
    const trial = trials[currentTrialIndex];
    if (!trial) return;
    
    setTrialStartTime(performance.now());
    setTrackingStarted(false);
    setIsClicking(false);
    isClickingRef.current = false;
    setTrackingPoints(0);
    trackingPointsRef.current = 0;
    
    if (trial.type === 'click_sequence') {
      setCurrentClickIndex(0);
      const firstPos = trial.positions[0];
      setTargetPosition({
        x: firstPos.x * canvasSize.width,
        y: firstPos.y * canvasSize.height
      });
      setClickStartTime(performance.now());
    } else {
      const startPos = getPositionOnPath(
        trial.shape, 
        trial.params, 
        0, 
        canvasSize.width, 
        canvasSize.height
      );
      setTargetPosition(startPos);
    }
  };

  // Handle mouse/touch movement
  const handlePointerMove = useCallback((e) => {
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    setCursorPosition({ x, y });
    cursorRef.current = { x, y };
  }, []);

  // Add floating point display
  const showPoints = (points, grade, position) => {
    const id = floatingIdRef.current++;
    setFloatingPoints(prev => [...prev, { id, points, grade, position }]);
  };
  
  const removeFloatingPoint = (id) => {
    setFloatingPoints(prev => prev.filter(fp => fp.id !== id));
  };

  // Move to next trial
  const nextTrial = () => {
    if (currentTrialIndex < trials.length - 1) {
      setCurrentTrialIndex(prev => prev + 1);
    } else {
      setGameState('results');
    }
  };

  // Handle click/touch
  const handlePointerDown = useCallback((e) => {
    if (gameState !== 'playing') return;
    
    const trial = trials[currentTrialIndex];
    if (!trial) return;
    
    const rect = canvasRef.current?.getBoundingClientRect();
    if (!rect) return;
    
    const x = (e.clientX || e.touches?.[0]?.clientX) - rect.left;
    const y = (e.clientY || e.touches?.[0]?.clientY) - rect.top;
    
    // Set clicking state for tracking
    setIsClicking(true);
    isClickingRef.current = true;
    
    if (trial.type === 'click_sequence') {
      const dist = Math.sqrt(
        Math.pow(x - targetPosition.x, 2) + 
        Math.pow(y - targetPosition.y, 2)
      );
      
      const reactionTime = performance.now() - clickStartTime;
      const { points, grade } = calculateClickPoints(dist, reactionTime);
      
      // Show floating points
      showPoints(points, grade, { x: targetPosition.x, y: targetPosition.y });
      setTotalScore(prev => prev + points);
      
      // Record click data
      const clickData = {
        trialId: trial.id,
        instanceId: trial.instanceId,
        type: 'click',
        clickIndex: currentClickIndex,
        reactionTime,
        distance: dist,
        points,
        grade,
        targetX: targetPosition.x,
        targetY: targetPosition.y,
        clickX: x,
        clickY: y,
        timestamp: Date.now()
      };
      setTrialData(prev => [...prev, clickData]);
      
      // Move to next click in sequence or next trial
      if (currentClickIndex < trial.positions.length - 1) {
        const nextIndex = currentClickIndex + 1;
        setCurrentClickIndex(nextIndex);
        const nextPos = trial.positions[nextIndex];
        setTargetPosition({
          x: nextPos.x * canvasSize.width,
          y: nextPos.y * canvasSize.height
        });
        setClickStartTime(performance.now());
      } else {
        setTimeout(nextTrial, 100);
      }
      
    } else if (trial.type === 'track' && !trackingStarted) {
      // Start tracking on first click (anywhere - more forgiving)
      setTrackingStarted(true);
      setTrialStartTime(performance.now());
      startTrackingAnimation(trial);
    }
  }, [gameState, trials, currentTrialIndex, targetPosition, clickStartTime, currentClickIndex, trackingStarted, canvasSize]);

  // Handle pointer up
  const handlePointerUp = useCallback(() => {
    setIsClicking(false);
    isClickingRef.current = false;
  }, []);

  // Start tracking animation
  const startTrackingAnimation = (trial) => {
    const startTime = performance.now();
    const duration = trial.params.duration;
    let samples = [];
    let lastTargetPos = { ...targetPosition };
    let accumulatedPoints = 0;
    
    // Position sampling with continuous point accumulation
    sampleIntervalRef.current = setInterval(() => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      if (progress <= 1) {
        const targetPos = getPositionOnPath(
          trial.shape,
          trial.params,
          progress,
          canvasSize.width,
          canvasSize.height
        );
        
        lastTargetPos = targetPos;
        const cursorPos = { ...cursorRef.current };
        const distance = Math.sqrt(
          Math.pow(cursorPos.x - targetPos.x, 2) +
          Math.pow(cursorPos.y - targetPos.y, 2)
        );
        
        // Calculate points for this sample
        const samplePoints = calculateTrackingSamplePoints(distance, isClickingRef.current);
        accumulatedPoints += samplePoints;
        
        // Update displayed points
        trackingPointsRef.current = Math.round(accumulatedPoints);
        setTrackingPoints(Math.round(accumulatedPoints));
        
        samples.push({
          time: elapsed,
          progress,
          targetX: targetPos.x,
          targetY: targetPos.y,
          cursorX: cursorPos.x,
          cursorY: cursorPos.y,
          distance,
          isClicking: isClickingRef.current,
          samplePoints
        });
      }
    }, TRIAL_CONFIG.samplingRate);
    
    // Animation loop
    const animate = () => {
      const elapsed = performance.now() - startTime;
      const progress = elapsed / duration;
      
      if (progress >= 1) {
        clearInterval(sampleIntervalRef.current);
        
        // Calculate stats
        const clickingSamples = samples.filter(s => s.isClicking);
        const accuracy = samples.length > 0 ? clickingSamples.length / samples.length : 0;
        const avgDistance = samples.length > 0 
          ? samples.reduce((sum, s) => sum + s.distance, 0) / samples.length 
          : 0;
        
        const totalPoints = Math.round(accumulatedPoints);
        const grade = getTrackingGrade(accuracy);
        
        // Show floating points at last position
        showPoints(totalPoints, grade, lastTargetPos);
        setTotalScore(prev => prev + totalPoints);
        
        const data = {
          trialId: trial.id,
          instanceId: trial.instanceId,
          type: 'track',
          shape: trial.shape,
          duration,
          accuracy,
          averageDistance: avgDistance,
          points: totalPoints,
          grade,
          samples,
          timestamp: Date.now()
        };
        
        setTrialData(prev => [...prev, data]);
        setTimeout(nextTrial, 100);
        return;
      }
      
      const newPos = getPositionOnPath(
        trial.shape,
        trial.params,
        progress,
        canvasSize.width,
        canvasSize.height
      );
      setTargetPosition(newPos);
      lastTargetPos = newPos;
      
      animationRef.current = requestAnimationFrame(animate);
    };
    
    animationRef.current = requestAnimationFrame(animate);
  };

  // Cleanup
  useEffect(() => {
    return () => {
      if (animationRef.current) cancelAnimationFrame(animationRef.current);
      if (sampleIntervalRef.current) clearInterval(sampleIntervalRef.current);
    };
  }, []);

  // Calculate current distance for visual feedback
  const currentDistance = Math.sqrt(
    Math.pow(cursorPosition.x - targetPosition.x, 2) +
    Math.pow(cursorPosition.y - targetPosition.y, 2)
  );
  const isOnTarget = currentDistance <= TRIAL_CONFIG.trackingMaxDistance;

  const currentTrial = trials[currentTrialIndex];

  // Export data function
  const exportData = () => {
    const exportObj = {
      totalScore,
      totalTrials: trials.length,
      trials: trialData,
      config: TRIAL_CONFIG,
      exportedAt: new Date().toISOString()
    };
    const dataStr = JSON.stringify(exportObj, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `osu-experiment-${Date.now()}.json`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-gray-950 flex flex-col items-center justify-center p-4 overflow-hidden"
         style={{ fontFamily: "'Orbitron', 'Rajdhani', sans-serif" }}>
      
      <style>{`
        @import url('https://fonts.googleapis.com/css2?family=Orbitron:wght@400;700;900&family=Rajdhani:wght@300;400;500;600;700&display=swap');
        
        @keyframes pulse-glow {
          0%, 100% { filter: drop-shadow(0 0 20px currentColor) drop-shadow(0 0 40px currentColor); }
          50% { filter: drop-shadow(0 0 30px currentColor) drop-shadow(0 0 60px currentColor); }
        }
        
        @keyframes ring-expand {
          0% { transform: scale(1); opacity: 1; }
          100% { transform: scale(2); opacity: 0; }
        }
        
        @keyframes countdown-pop {
          0% { transform: scale(0.5); opacity: 0; }
          50% { transform: scale(1.2); }
          100% { transform: scale(1); opacity: 1; }
        }
        
        @keyframes target-appear {
          0% { transform: scale(0); opacity: 0; }
          70% { transform: scale(1.1); }
          100% { transform: scale(1); opacity: 1; }
        }
        
        .target-circle {
          animation: pulse-glow 1.5s ease-in-out infinite, target-appear 0.15s ease-out;
        }
        
        .approach-ring {
          animation: ring-expand 1s ease-out infinite;
        }
        
        .countdown-number {
          animation: countdown-pop 0.5s ease-out;
        }
      `}</style>
      
      {/* Header with Score */}
      <div className="text-center mb-4">
        <h1 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-purple-500 to-pink-500 tracking-wider">
          TRACK & CLICK
        </h1>
        {gameState === 'playing' && (
          <div className="mt-2 flex items-center justify-center gap-6" style={{ fontFamily: 'Rajdhani' }}>
            <span className="text-gray-500">
              Trial {currentTrialIndex + 1}/{trials.length}
            </span>
            <span className="text-2xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 to-orange-500">
              {totalScore.toLocaleString()} pts
            </span>
          </div>
        )}
      </div>
      
      {/* Game Canvas Container */}
      <div 
        className="relative bg-gray-900 rounded-2xl overflow-hidden"
        style={{
          width: canvasSize.width,
          height: canvasSize.height,
          boxShadow: '0 0 60px rgba(139, 92, 246, 0.15), inset 0 0 100px rgba(0,0,0,0.5)',
          border: '1px solid rgba(139, 92, 246, 0.2)'
        }}
      >
        {/* Grid background */}
        <div 
          className="absolute inset-0 opacity-10"
          style={{
            backgroundImage: `
              linear-gradient(rgba(139, 92, 246, 0.3) 1px, transparent 1px),
              linear-gradient(90deg, rgba(139, 92, 246, 0.3) 1px, transparent 1px)
            `,
            backgroundSize: '40px 40px'
          }}
        />
        
        {/* Canvas for interactions */}
        <div
          ref={canvasRef}
          className="absolute inset-0 cursor-crosshair"
          onMouseMove={handlePointerMove}
          onMouseDown={handlePointerDown}
          onMouseUp={handlePointerUp}
          onMouseLeave={handlePointerUp}
          onTouchMove={handlePointerMove}
          onTouchStart={handlePointerDown}
          onTouchEnd={handlePointerUp}
        >
          {/* Floating Points */}
          {floatingPoints.map(fp => (
            <FloatingPoints
              key={fp.id}
              points={fp.points}
              grade={fp.grade}
              position={fp.position}
              onComplete={() => removeFloatingPoint(fp.id)}
            />
          ))}
          
          {/* INTRO STATE */}
          {gameState === 'intro' && (
            <div className="absolute inset-0 flex flex-col items-center justify-center">
              <div className="text-center space-y-6">
                <div className="space-y-4 text-gray-400" style={{ fontFamily: 'Rajdhani' }}>
                  <div className="flex items-center gap-3 justify-center">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-pink-500 to-rose-600" />
                    <span className="text-lg">Click sequences (5 targets each)</span>
                  </div>
                  <div className="flex items-center gap-3 justify-center">
                    <div className="w-8 h-8 rounded-full bg-gradient-to-br from-cyan-400 to-blue-600" />
                    <span className="text-lg">Click & follow moving targets</span>
                  </div>
                </div>
                <div className="text-gray-500 text-sm mt-4 max-w-xs mx-auto">
                  Points scale continuously with accuracy & speed.<br/>
                  For tracking: closer = more points per moment.
                </div>
                <button
                  onClick={startGame}
                  className="mt-8 px-12 py-4 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white font-bold text-xl tracking-wider hover:from-purple-500 hover:to-pink-500 transition-all hover:scale-105 active:scale-95"
                  style={{ boxShadow: '0 0 30px rgba(168, 85, 247, 0.4)' }}
                >
                  START EXPERIMENT
                </button>
                <p className="text-gray-600 text-sm">20 trials • Continuous scoring</p>
              </div>
            </div>
          )}
          
          {/* COUNTDOWN STATE */}
          {gameState === 'countdown' && (
            <div className="absolute inset-0 flex items-center justify-center">
              <div 
                key={countdown}
                className="countdown-number text-9xl font-black text-transparent bg-clip-text bg-gradient-to-br from-cyan-400 to-purple-600"
                style={{ textShadow: '0 0 60px rgba(139, 92, 246, 0.5)' }}
              >
                {countdown || 'GO!'}
              </div>
            </div>
          )}
          
          {/* PLAYING STATE */}
          {gameState === 'playing' && currentTrial && (
            <>
              {/* Trial type indicator */}
              <div className="absolute top-4 right-4 text-sm font-medium tracking-wider" style={{ fontFamily: 'Rajdhani' }}>
                {currentTrial.type === 'click_sequence' ? (
                  <span className="text-pink-400">
                    CLICK {currentClickIndex + 1}/5
                  </span>
                ) : (
                  <span className="text-cyan-400">
                    {trackingStarted ? `TRACKING: ${currentTrial.shape.toUpperCase()}` : 'CLICK TO START TRACKING'}
                  </span>
                )}
              </div>
              
              {/* Live tracking points */}
              {currentTrial.type === 'track' && trackingStarted && (
                <div className="absolute top-4 left-4 text-lg font-bold" style={{ fontFamily: 'Rajdhani' }}>
                  <span className="text-yellow-400">+{trackingPoints}</span>
                </div>
              )}
              
              {/* Target circle */}
              <div
                key={`${currentTrialIndex}-${currentClickIndex}`}
                className="absolute target-circle pointer-events-none"
                style={{
                  left: targetPosition.x - TRIAL_CONFIG.targetRadius,
                  top: targetPosition.y - TRIAL_CONFIG.targetRadius,
                  width: TRIAL_CONFIG.targetRadius * 2,
                  height: TRIAL_CONFIG.targetRadius * 2,
                  borderRadius: '50%',
                  background: currentTrial.type === 'click_sequence'
                    ? 'linear-gradient(135deg, #ec4899, #f43f5e)'
                    : isClicking && isOnTarget
                      ? 'linear-gradient(135deg, #10b981, #34d399)'
                      : 'linear-gradient(135deg, #06b6d4, #3b82f6)',
                  color: currentTrial.type === 'click_sequence' ? '#ec4899' : '#06b6d4',
                  transition: currentTrial.type === 'track' && trackingStarted ? 'none' : 'all 0.05s'
                }}
              >
                {/* Inner ring */}
                <div 
                  className="absolute inset-2 rounded-full border-2"
                  style={{ 
                    borderColor: 'rgba(255,255,255,0.5)',
                    background: 'radial-gradient(circle, rgba(255,255,255,0.2) 0%, transparent 70%)'
                  }}
                />
                {/* Click sequence number */}
                {currentTrial.type === 'click_sequence' && (
                  <div className="absolute inset-0 flex items-center justify-center text-white font-black text-lg">
                    {currentClickIndex + 1}
                  </div>
                )}
              </div>
              
              {/* Approach ring for click targets */}
              {currentTrial.type === 'click_sequence' && (
                <div
                  key={`ring-${currentTrialIndex}-${currentClickIndex}`}
                  className="absolute approach-ring pointer-events-none"
                  style={{
                    left: targetPosition.x - TRIAL_CONFIG.targetRadius,
                    top: targetPosition.y - TRIAL_CONFIG.targetRadius,
                    width: TRIAL_CONFIG.targetRadius * 2,
                    height: TRIAL_CONFIG.targetRadius * 2,
                    borderRadius: '50%',
                    border: '2px solid rgba(236, 72, 153, 0.5)'
                  }}
                />
              )}
              
              {/* Tracking indicator */}
              {currentTrial.type === 'track' && trackingStarted && (
                <div 
                  className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-3"
                  style={{ fontFamily: 'Rajdhani' }}
                >
                  <div 
                    className="w-3 h-3 rounded-full transition-all"
                    style={{ 
                      background: isClicking 
                        ? (isOnTarget ? '#10b981' : '#f59e0b')
                        : '#ef4444',
                      boxShadow: `0 0 10px ${isClicking ? (isOnTarget ? '#10b981' : '#f59e0b') : '#ef4444'}`
                    }}
                  />
                  <span className={
                    isClicking 
                      ? (isOnTarget ? 'text-green-400' : 'text-amber-400')
                      : 'text-red-400'
                  }>
                    {isClicking 
                      ? (isOnTarget ? 'TRACKING' : 'TOO FAR')
                      : 'NOT CLICKING'
                    }
                  </span>
                  <span className="text-gray-500">
                    {Math.round(currentDistance)}px
                  </span>
                </div>
              )}
            </>
          )}
          
          {/* RESULTS STATE */}
          {gameState === 'results' && (
            <div className="absolute inset-0 flex items-center justify-center p-8">
              <div className="text-center space-y-6 max-w-lg">
                <h2 className="text-4xl font-black text-transparent bg-clip-text bg-gradient-to-r from-green-400 to-cyan-400">
                  COMPLETE!
                </h2>
                
                <div 
                  className="text-6xl font-black text-transparent bg-clip-text bg-gradient-to-r from-yellow-400 via-orange-500 to-pink-500"
                  style={{ textShadow: '0 0 40px rgba(251, 191, 36, 0.3)' }}
                >
                  {totalScore.toLocaleString()}
                </div>
                <div className="text-gray-400 text-lg" style={{ fontFamily: 'Rajdhani' }}>TOTAL POINTS</div>
                
                <div className="grid grid-cols-2 gap-4 text-left mt-6" style={{ fontFamily: 'Rajdhani' }}>
                  {/* Click stats */}
                  <div className="bg-gray-800/50 rounded-xl p-4 border border-pink-500/20">
                    <h3 className="text-pink-400 font-bold mb-2">CLICK SEQUENCES</h3>
                    {(() => {
                      const clickTrials = trialData.filter(t => t.type === 'click');
                      const perfectHits = clickTrials.filter(t => t.grade === 'PERFECT').length;
                      const greatHits = clickTrials.filter(t => t.grade === 'GREAT').length;
                      const avgRT = clickTrials.length > 0
                        ? Math.round(clickTrials.reduce((s, t) => s + t.reactionTime, 0) / clickTrials.length)
                        : 0;
                      const avgDist = clickTrials.length > 0
                        ? Math.round(clickTrials.reduce((s, t) => s + t.distance, 0) / clickTrials.length)
                        : 0;
                      const clickPoints = clickTrials.reduce((s, t) => s + t.points, 0);
                      return (
                        <>
                          <p className="text-gray-400">Perfect: <span className="text-cyan-400">{perfectHits}</span></p>
                          <p className="text-gray-400">Great: <span className="text-purple-400">{greatHits}</span></p>
                          <p className="text-gray-400">Avg RT: <span className="text-white">{avgRT}ms</span></p>
                          <p className="text-gray-400">Avg Dist: <span className="text-white">{avgDist}px</span></p>
                          <p className="text-gray-400">Points: <span className="text-yellow-400">{clickPoints.toLocaleString()}</span></p>
                        </>
                      );
                    })()}
                  </div>
                  
                  {/* Track stats */}
                  <div className="bg-gray-800/50 rounded-xl p-4 border border-cyan-500/20">
                    <h3 className="text-cyan-400 font-bold mb-2">TRACKING</h3>
                    {(() => {
                      const trackTrials = trialData.filter(t => t.type === 'track');
                      const avgAcc = trackTrials.length > 0
                        ? Math.round(trackTrials.reduce((s, t) => s + t.accuracy, 0) / trackTrials.length * 100)
                        : 0;
                      const avgDist = trackTrials.length > 0
                        ? Math.round(trackTrials.reduce((s, t) => s + t.averageDistance, 0) / trackTrials.length)
                        : 0;
                      const perfectTracks = trackTrials.filter(t => t.grade === 'PERFECT').length;
                      const trackPoints = trackTrials.reduce((s, t) => s + t.points, 0);
                      return (
                        <>
                          <p className="text-gray-400">Click Time: <span className="text-white">{avgAcc}%</span></p>
                          <p className="text-gray-400">Avg Dist: <span className="text-white">{avgDist}px</span></p>
                          <p className="text-gray-400">Perfect: <span className="text-cyan-400">{perfectTracks}</span></p>
                          <p className="text-gray-400">Points: <span className="text-yellow-400">{trackPoints.toLocaleString()}</span></p>
                        </>
                      );
                    })()}
                  </div>
                </div>
                
                <div className="flex gap-4 justify-center pt-4">
                  <button
                    onClick={exportData}
                    className="px-6 py-3 bg-gray-800 hover:bg-gray-700 rounded-xl text-gray-300 font-medium tracking-wider transition-all border border-gray-700"
                  >
                    EXPORT DATA
                  </button>
                  <button
                    onClick={() => {
                      setGameState('intro');
                      setTrialData([]);
                      setTotalScore(0);
                    }}
                    className="px-8 py-3 bg-gradient-to-r from-purple-600 to-pink-600 rounded-xl text-white font-bold tracking-wider hover:from-purple-500 hover:to-pink-500 transition-all"
                  >
                    PLAY AGAIN
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
      
      {/* Footer info */}
      <div className="mt-4 text-gray-600 text-xs tracking-wider" style={{ fontFamily: 'Rajdhani' }}>
        Continuous scoring • Export JSON for analysis
      </div>
    </div>
  );
}
