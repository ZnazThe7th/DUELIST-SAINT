
import React, { useState, useMemo, useEffect } from 'react';
import { 
  TCGType, 
  DeckAtom, 
  CompoundCondition, 
  MulliganConfig
} from './types';
import { GAME_PRESETS, DEFAULT_ROLES } from './constants';
import { 
  multivariateHypergeometricPMF, 
  getValidDrawVectors, 
  binomProb 
} from './mathUtils';
import { 
  XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend,
  BarChart, Bar, Cell, ComposedChart, Area, Line
} from 'recharts';
import { 
  Settings, Database, Play, Trophy, ChevronRight, Plus, Trash2, 
  Info, AlertTriangle, CheckCircle2, TrendingUp, HelpCircle, BookOpen, ExternalLink,
  Target, Layers, Zap, Cpu, Sliders, ListFilter, Activity, Box, FileText, Download, X, RefreshCw, Filter
} from 'lucide-react';

/**
 * Enhanced Numeric Input to handle empty states better.
 */
function NumericInput({ value, onChange, className, placeholder }: { 
  value: number, 
  onChange: (val: number) => void, 
  className?: string,
  placeholder?: string
}) {
  const [localValue, setLocalValue] = useState<string>(value.toString());

  useEffect(() => {
    if (value.toString() !== localValue && document.activeElement !== null) {
    } else if (value.toString() !== localValue) {
      setLocalValue(value.toString());
    }
  }, [value]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = e.target.value;
    if (val === '' || /^\d+$/.test(val)) {
      setLocalValue(val);
      onChange(val === '' ? 0 : parseInt(val, 10));
    }
  };

  const handleBlur = () => {
    if (localValue === '') {
      setLocalValue('0');
      onChange(0);
    } else {
      setLocalValue(value.toString());
    }
  };

  return (
    <input
      type="text"
      inputMode="numeric"
      value={localValue}
      onChange={handleChange}
      onBlur={handleBlur}
      placeholder={placeholder || "0"}
      className={className}
    />
  );
}

export default function App() {
  // --- State ---
  const [activeTab, setActiveTab] = useState<'deck' | 'game' | 'results' | 'tournament'>('tournament');
  const [showTutorial, setShowTutorial] = useState(false);
  const [simpleMode, setSimpleMode] = useState(true);
  const [showComplexMath, setShowComplexMath] = useState(false);
  const [isSolveChartOpen, setIsSolveChartOpen] = useState(false);
  const [isDayMode, setIsDayMode] = useState(false);
  const [selectedTCG, setSelectedTCG] = useState<TCGType>(TCGType.YUGIOH);
  const [deckSize, setDeckSize] = useState(40);
  const [startHand, setStartHand] = useState(5);
  const [isGoingSecond, setIsGoingSecond] = useState(false);
  const [isQuantumMode, setIsQuantumMode] = useState(false);
  const [isReportOpen, setIsReportOpen] = useState(false);
  
  // Mulligan
  const [mulligan, setMulligan] = useState<MulliganConfig>({
    enabled: false,
    type: 'none',
    keepRole: 'Starter',
    keepMin: 1,
    maxMulligans: 1
  });

  // Deck Atoms
  const [atoms, setAtoms] = useState<DeckAtom[]>([
    { id: '1', name: 'Starter + Extender', count: 12, roles: ['Starter', 'Extender'] },
    { id: '2', name: 'Defensive Non-Engine', count: 9, roles: ['Defensive'] },
    { id: '3', name: 'Pure Extender', count: 15, roles: ['Extender'] },
    { id: '4', name: 'High-Impact Brick', count: 3, roles: ['Brick'] },
  ]);

  // Win conditions
  const [conditions, setConditions] = useState<CompoundCondition[]>([
    { 
      id: 'c1', 
      name: 'Playable Hand', 
      weight: 1.0,
      thresholds: [
        { role: 'Starter', minCount: 1, maxCount: 40 },
        { role: 'Brick', minCount: 0, maxCount: 0 }
      ] 
    },
    {
      id: 'c2', 
      name: 'Full Combo + Defense', 
      weight: 2.5,
      thresholds: [
        { role: 'Starter', minCount: 1, maxCount: 40 },
        { role: 'Extender', minCount: 1, maxCount: 40 },
        { role: 'Defensive', minCount: 1, maxCount: 40 }
      ]
    }
  ]);

  // Tournament Mode
  const [tournamentRounds, setTournamentRounds] = useState(8);
  const [sideboardVariance, setSideboardVariance] = useState(0.12);
  const [g1GoingFirst, setG1GoingFirst] = useState(true);
  const [topCutThreshold, setTopCutThreshold] = useState(6);

  // Side Deck & Post-Sideboard
  const [sideDeckAtoms, setSideDeckAtoms] = useState<DeckAtom[]>([]);
  const [sideOuts, setSideOuts] = useState<Record<string, number>>({});
  const [isPostSideboard, setIsPostSideboard] = useState(false);
  const [brickSensitivity, setBrickSensitivity] = useState(true);
  const [staminaFactor, setStaminaFactor] = useState(false);

  useEffect(() => {
    const savedTheme = localStorage.getItem('duelist-saint-theme');
    if (savedTheme === 'day') setIsDayMode(true);
  }, []);

  useEffect(() => {
    localStorage.setItem('duelist-saint-theme', isDayMode ? 'day' : 'night');
  }, [isDayMode]);

  // --- Derived ---
  const currentPreset = GAME_PRESETS[selectedTCG];
  const totalAtomCount = atoms.reduce((sum, a) => sum + a.count, 0);
  const remainingCards = deckSize - totalAtomCount;
  
  const allRoles = useMemo(() => {
    const roles = new Set<string>(DEFAULT_ROLES);
    atoms.forEach(a => a.roles.forEach(r => roles.add(r)));
    return Array.from(roles);
  }, [atoms]);

  const deckTabRoleOptions = useMemo(() => {
    const roles = new Set<string>();
    atoms.forEach(a => a.roles.forEach(r => roles.add(r)));
    const roleList = Array.from(roles);
    return roleList.length > 0 ? roleList : allRoles;
  }, [atoms, allRoles]);

  const globalRoleCounts = useMemo(() => {
    const counts: Record<string, number> = {};
    allRoles.forEach(r => counts[r] = 0);
    atoms.forEach(atom => {
      atom.roles.forEach(role => {
        counts[role] += atom.count;
      });
    });
    return counts;
  }, [atoms, allRoles]);

  const deckValidation = useMemo(() => {
    if (totalAtomCount > deckSize) return { valid: false, msg: `Exceeds deck size (${totalAtomCount}/${deckSize}).` };
    if (totalAtomCount < deckSize) return { valid: true, msg: `Filling ${remainingCards} cards as "Generic".` };
    return { valid: true, msg: "Deck sum is perfect." };
  }, [totalAtomCount, deckSize, remainingCards]);

  // Post-Sideboard deck composition
  const totalSidedOut = (Object.values(sideOuts) as number[]).reduce<number>((s, v) => s + v, 0);
  const totalSidedIn = sideDeckAtoms.reduce<number>((s, a) => s + a.count, 0);

  const postSideAtoms = useMemo(() => {
    const modified = atoms.map(a => ({
      ...a,
      count: Math.max(0, a.count - (sideOuts[a.id] || 0)),
    })).filter(a => a.count > 0);
    return [...modified, ...sideDeckAtoms.filter(a => a.count > 0)];
  }, [atoms, sideDeckAtoms, sideOuts]);

  const postSideDeckSize = deckSize - totalSidedOut + totalSidedIn;

  const postSideAllRoles = useMemo(() => {
    const roles = new Set<string>(DEFAULT_ROLES);
    postSideAtoms.forEach(a => a.roles.forEach(r => roles.add(r)));
    return Array.from(roles);
  }, [postSideAtoms]);

  // Quantum Weight Distribution (based on role coverage)
  const quantumWeightData = useMemo(() => {
    const activeAtoms = isPostSideboard ? postSideAtoms : atoms;
    const tiers = [
      { name: 'Ultimate (6.0)', weight: 6.0, count: 0, color: '#f59e0b' },
      { name: 'Omni-Role (4.0)', weight: 4.0, count: 0, color: '#6366f1' },
      { name: 'Pure Role (2.0)', weight: 2.0, count: 0, color: '#10b981' },
      { name: 'Brick (0.0)', weight: 0.0, count: 0, color: '#ef4444' },
    ];

    activeAtoms.forEach(atom => {
      const isBrick = atom.roles.includes('Brick');
      const functionalRoles = atom.roles.filter(r => r !== 'Brick').length;

      if (isBrick && functionalRoles === 0) {
        tiers[3].count += atom.count;
      } else if (functionalRoles >= 3) {
        tiers[0].count += atom.count;
      } else if (functionalRoles === 2) {
        tiers[1].count += atom.count;
      } else {
        tiers[2].count += atom.count;
      }
    });

    return tiers;
  }, [atoms, postSideAtoms, isPostSideboard]);

  // --- Engine ---
  const calculateStepProb = (drawCount: number, condition: CompoundCondition, forceMulligan?: boolean): number => {
    if (drawCount <= 0 || deckSize <= 0) return 0;
    const populationCounts = [...atoms.map(a => a.count)];
    if (remainingCards > 0) populationCounts.push(remainingCards);
    
    const atomToRoles = [...atoms.map(a => a.roles)];
    if (remainingCards > 0) atomToRoles.push([]);

    const thresholds: { [role: string]: { min: number; max: number } } = {};
    condition.thresholds.forEach(t => {
      thresholds[t.role] = { min: t.minCount, max: t.maxCount };
    });

    const baseProb = () => {
      const validVectors = getValidDrawVectors(populationCounts, drawCount, allRoles, atomToRoles, thresholds);
      let totalProb = 0;
      validVectors.forEach(v => {
        totalProb += multivariateHypergeometricPMF(populationCounts, v, deckSize, drawCount);
      });
      return totalProb;
    };

    const rawProb = baseProb();

    // Mulligan adjustment only for turn 1 (opening hand)
    const isOpeningHand = drawCount === (startHand + (isGoingSecond && currentPreset.drawOnTurnOneSecond ? 1 : 0));
    if (mulligan.enabled && isOpeningHand && !forceMulligan) {
      // Logic: P(success) = P(init success) + P(init fail) * P(success in mulligan)
      // For simplicity, we assume one mulligan attempt with the keep criteria
      const keepThresholds = { [mulligan.keepRole]: { min: mulligan.keepMin, max: deckSize } };
      const validKeepVectors = getValidDrawVectors(populationCounts, drawCount, allRoles, atomToRoles, keepThresholds);
      let probKeep = 0;
      validKeepVectors.forEach(v => {
        probKeep += multivariateHypergeometricPMF(populationCounts, v, deckSize, drawCount);
      });

      // Prob success in opening = rawProb
      // Prob success with mulligan = rawProb + (1 - probKeep) * rawProb
      // (Simplified: if we don't keep, we try again)
      return rawProb + (1 - probKeep) * rawProb;
    }

    return rawProb;
  };

  // Generalized probability calculator for any deck composition (used for post-sideboard)
  const calcProbForDeck = (
    deckAtoms: DeckAtom[],
    totalDeck: number,
    drawCount: number,
    condition: CompoundCondition,
    rolesList: string[],
    maxBricks?: number // Dead draw penalty: max bricks allowed in hand
  ): number => {
    if (drawCount <= 0 || totalDeck <= 0) return 0;

    const populationCounts = [...deckAtoms.map(a => a.count)];
    const atomTotal = deckAtoms.reduce((s, a) => s + a.count, 0);
    const rem = totalDeck - atomTotal;
    if (rem > 0) populationCounts.push(rem);

    const atomToRoles = [...deckAtoms.map(a => a.roles)];
    if (rem > 0) atomToRoles.push([]);

    const thresholds: { [role: string]: { min: number; max: number } } = {};
    condition.thresholds.forEach(t => {
      thresholds[t.role] = { min: t.minCount, max: t.maxCount };
    });

    // Apply dead draw penalty: cap brick count in hand
    if (maxBricks !== undefined) {
      if (thresholds['Brick']) {
        thresholds['Brick'].max = Math.min(thresholds['Brick'].max, maxBricks);
      } else {
        thresholds['Brick'] = { min: 0, max: maxBricks };
      }
    }

    const validVectors = getValidDrawVectors(populationCounts, drawCount, rolesList, atomToRoles, thresholds);
    let totalProb = 0;
    validVectors.forEach(v => {
      totalProb += multivariateHypergeometricPMF(populationCounts, v, totalDeck, drawCount);
    });

    return totalProb;
  };

  const timelineData = useMemo(() => {
    const steps: any[] = [];
    const baseDraws = startHand + (isGoingSecond && currentPreset.drawOnTurnOneSecond ? 1 : 0);
    
    for (let d = 0; d <= 10; d++) {
      const currentDraws = baseDraws + d;
      const stepData: any = { step: d, draws: currentDraws };
      let totalEV = 0;
      conditions.forEach(c => {
        const prob = calculateStepProb(currentDraws, c);
        stepData[c.name] = (prob * 100).toFixed(2);
        totalEV += prob * c.weight;
      });
      stepData['EV'] = totalEV.toFixed(3);
      steps.push(stepData);
    }
    return steps;
  }, [atoms, conditions, deckSize, startHand, isGoingSecond, currentPreset, mulligan]);

  const tournamentAnalysis = useMemo(() => {
    if (conditions.length === 0) return null;

    const drawCountFirst = startHand + (currentPreset.drawOnTurnOneFirst ? 1 : 0);
    const drawCountSecond = startHand + (currentPreset.drawOnTurnOneSecond ? 1 : 0);

    // --- G1: Main Deck probabilities ---
    const g1ConditionData = conditions.map(c => ({
      name: c.name,
      weight: c.weight,
      probFirst: calculateStepProb(drawCountFirst, c),
      probSecond: calculateStepProb(drawCountSecond, c),
    }));

    // --- G2/G3: Post-Sideboard probabilities (if enabled) ---
    const usePostSide = isPostSideboard && sideDeckAtoms.length > 0;
    const g23Atoms = usePostSide ? postSideAtoms : atoms;
    const g23DeckSize = usePostSide ? postSideDeckSize : deckSize;
    const g23Roles = usePostSide ? postSideAllRoles : allRoles;
    const deadDrawMax = brickSensitivity ? 1 : undefined; // Max 1 brick; 2+ = dead draw

    const g23ConditionData = conditions.map(c => ({
      name: c.name,
      weight: c.weight,
      probFirst: calcProbForDeck(g23Atoms, g23DeckSize, drawCountFirst, c, g23Roles, deadDrawMax),
      probSecond: calcProbForDeck(g23Atoms, g23DeckSize, drawCountSecond, c, g23Roles, deadDrawMax),
    }));

    const maxWeight = Math.max(...conditions.map(c => c.weight), 1);

    // Single-game win probability as weighted average of condition probabilities
    const calcGameWinProb = (
      goingFirst: boolean,
      condData: typeof g1ConditionData,
      withSideboard: boolean
    ): number => {
      let weightedProb = 0;
      let totalWeight = 0;

      condData.forEach(cd => {
        const baseProb = goingFirst ? cd.probFirst : cd.probSecond;
        let effectiveWeight = cd.weight;

        if (withSideboard && sideboardVariance > 0) {
          // Ultimate Starters (high weight) retain 90% of weight
          // Pure Starters (low weight) lose up to 30% → scaled by resilience
          const resilience = cd.weight / maxWeight; // 1.0 = max, 0 = min
          // High resilience → keeps 90%; Low resilience → drops by up to 30%
          const keepFactor = resilience >= 0.8 ? 0.90 : (1 - 0.30 * (1 - resilience));
          effectiveWeight = cd.weight * Math.max(0, keepFactor);
        }

        weightedProb += baseProb * effectiveWeight;
        totalWeight += effectiveWeight;
      });

      return totalWeight > 0 ? weightedProb / totalWeight : 0;
    };

    // --- Bo3 Game Structure ---
    // Game 1: Main deck, no sideboard variance, user-chosen position
    const P_g1 = calcGameWinProb(g1GoingFirst, g1ConditionData, false);

    // Game 2: Post-side deck + sideboard variance. Loser of G1 chooses position.
    const P_g2_afterWin = calcGameWinProb(false, g23ConditionData, true);   // opponent picks → you go 2nd
    const P_g2_afterLoss = calcGameWinProb(true, g23ConditionData, true);   // you pick → you go 1st

    // Game 3: Post-side deck + sideboard variance. 50/50 position.
    const P_g3 = (calcGameWinProb(true, g23ConditionData, true) + calcGameWinProb(false, g23ConditionData, true)) / 2;

    // Bo3 Match Win: P(WW) + P(WLW) + P(LWW)
    const P_match =
      (P_g1 * P_g2_afterWin) +
      (P_g1 * (1 - P_g2_afterWin) * P_g3) +
      ((1 - P_g1) * P_g2_afterLoss * P_g3);

    // 99.7% Match Consistency Floor
    const playableG1 = (g1ConditionData[0].probFirst + g1ConditionData[0].probSecond) / 2;
    const playableG23 = (g23ConditionData[0].probFirst + g23ConditionData[0].probSecond) / 2;
    const matchConsistency = 1 - ((1 - playableG1) * Math.pow(1 - playableG23, 2));
    const meetsConsistencyFloor = matchConsistency >= 0.997;

    // Engine Integrity Check: warn if post-side consistency drops below 90%
    const postSideConsistency = playableG23;
    const consistencyWarning = usePostSide && postSideConsistency < 0.90;

    // Brick Alert: velocity drop > 2%
    const g1Velocity = P_g1;
    const g23Velocity = (P_g2_afterWin + P_g2_afterLoss + P_g3) / 3;
    const velocityDrop = g1Velocity > 0 ? (g1Velocity - g23Velocity) / g1Velocity : 0;
    const brickAlert = velocityDrop > 0.02;
    const brickAlertSeverity = velocityDrop > 0.05 ? 'critical' : 'warning';

    // --- Swiss tournament round distribution with optional Stamina Factor ---
    // Stamina: DP-based when enabled (fatigue in late rounds), binomial otherwise
    const getStaminaPenalty = (roundNum: number): number => {
      if (!staminaFactor) return 0;
      if (roundNum >= tournamentRounds) return 0.03;     // Last round: 3% fatigue
      if (roundNum >= tournamentRounds - 1) return 0.02; // 2nd to last: 2%
      return 0;
    };

    let roundsDist: { wins: number; losses: number; record: string; prob: number }[];

    if (staminaFactor) {
      // DP approach: non-uniform round probabilities
      const dp: number[][] = Array.from({ length: tournamentRounds + 1 }, () =>
        new Array(tournamentRounds + 1).fill(0)
      );
      dp[0][0] = 1;
      for (let r = 1; r <= tournamentRounds; r++) {
        const p = Math.max(0, P_match - getStaminaPenalty(r));
        for (let w = 0; w <= r; w++) {
          if (w > 0) dp[r][w] += dp[r - 1][w - 1] * p;
          dp[r][w] += dp[r - 1][w] * (1 - p);
        }
      }
      roundsDist = [];
      for (let w = 0; w <= tournamentRounds; w++) {
        roundsDist.push({
          wins: w,
          losses: tournamentRounds - w,
          record: `${w}-${tournamentRounds - w}`,
          prob: dp[tournamentRounds][w],
        });
      }
    } else {
      roundsDist = [];
      for (let w = 0; w <= tournamentRounds; w++) {
        roundsDist.push({
          wins: w,
          losses: tournamentRounds - w,
          record: `${w}-${tournamentRounds - w}`,
          prob: binomProb(tournamentRounds, w, P_match),
        });
      }
    }

    // Top cut probability (>= threshold wins)
    let topCutProb = 0;
    for (let w = topCutThreshold; w <= tournamentRounds; w++) {
      topCutProb += roundsDist[w]?.prob ?? 0;
    }

    const expectedWins = roundsDist.reduce((s, r) => s + r.wins * r.prob, 0);
    const expectedLosses = tournamentRounds - expectedWins;

    return {
      P_g1, P_g2_afterWin, P_g2_afterLoss, P_g3,
      P_match, matchConsistency, meetsConsistencyFloor,
      postSideConsistency, consistencyWarning,
      g1Velocity, g23Velocity, velocityDrop,
      brickAlert, brickAlertSeverity,
      topCutProb, roundsDist,
      expectedWins, expectedLosses,
    };
  }, [conditions, atoms, deckSize, startHand, currentPreset, sideboardVariance, g1GoingFirst, 
      tournamentRounds, topCutThreshold, mulligan, isPostSideboard, postSideAtoms, postSideDeckSize,
      postSideAllRoles, brickSensitivity, staminaFactor, sideDeckAtoms]);

  // --- Handlers ---
  const handleTCGChange = (type: TCGType) => {
    const p = GAME_PRESETS[type];
    setSelectedTCG(type);
    setDeckSize(p.defaultDeckSize);
    setStartHand(p.startingHandSize);
    setMulligan(prev => ({ ...prev, type: p.mulliganType as any, enabled: p.mulliganType !== 'none' }));
  };

  const toggleRoleInAtom = (atomId: string, role: string) => {
    setAtoms(atoms.map(a => {
      if (a.id !== atomId) return a;
      const newRoles = a.roles.includes(role) 
        ? a.roles.filter(r => r !== role)
        : [...a.roles, role];
      return { ...a, roles: newRoles };
    }));
  };

  const addCondition = () => {
    setConditions([...conditions, { 
      id: Math.random().toString(), 
      name: 'New Event', 
      weight: 1.0, 
      thresholds: [{ role: allRoles[0] || 'Starter', minCount: 1, maxCount: 40 }] 
    }]);
  };

  const updateThreshold = (condId: string, roleIndex: number, updates: Partial<{ role: string, minCount: number, maxCount: number }>) => {
    setConditions(conditions.map(c => {
      if (c.id !== condId) return c;
      const newThresholds = [...c.thresholds];
      newThresholds[roleIndex] = { ...newThresholds[roleIndex], ...updates };
      return { ...c, thresholds: newThresholds };
    }));
  };

  const removeThreshold = (condId: string, roleIndex: number) => {
    setConditions(conditions.map(c => {
      if (c.id !== condId) return c;
      return { ...c, thresholds: c.thresholds.filter((_, i) => i !== roleIndex) };
    }));
  };

  // --- Report Logic ---
  const downloadReport = () => {
    const reportText = generateReportMarkdown();
    const blob = new Blob([reportText], { type: 'text/markdown' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Duelist_Saint_Stochastic_Report_${new Date().toISOString().slice(0,10)}.md`;
    link.click();
  };

  const generateReportMarkdown = () => {
    const firstDraws = startHand + (currentPreset.drawOnTurnOneFirst ? 1 : 0);
    const secondDraws = startHand + (currentPreset.drawOnTurnOneSecond ? 1 : 0);
    
    let content = `# DUELIST SAINT: STOCHASTIC INTELLIGENCE REPORT\n`;
    content += `Generated: ${new Date().toLocaleString()}\n`;
    content += `TCG Format: ${selectedTCG} | Deck Size: ${deckSize}\n\n`;
    
    content += `## 1. COMPOSITION SUMMARY\n`;
    atoms.forEach(a => {
      content += `- ${a.name}: ${a.count} cards [${a.roles.join(', ')}]\n`;
    });
    content += `\n## 2. HAND DYNAMICS (1ST VS 2ND)\n`;
    if (mulligan.enabled) content += `*Mulligan Applied: Keep if ${mulligan.keepMin}+ ${mulligan.keepRole}*\n\n`;
    
    conditions.forEach(c => {
      const p1 = (calculateStepProb(firstDraws, c) * 100).toFixed(2);
      const p2 = (calculateStepProb(secondDraws, c) * 100).toFixed(2);
      content += `### Event: ${c.name}\n`;
      content += `- Probability Going First (${firstDraws} cards): ${p1}%\n`;
      content += `- Probability Going Second (${secondDraws} cards): ${p2}%\n`;
      content += `- Velocity Shift: ${(+p2 - +p1).toFixed(2)}%\n\n`;
    });

    content += `## 3. TOURNAMENT SCALE RESILIENCE\n`;
    content += `- Rounds: ${tournamentRounds}\n`;
    content += `- Predicted Match Win Rate: ${((tournamentAnalysis?.P_match ?? 0) * 100).toFixed(2)}%\n`;
    content += `- Match Consistency (Bo3): ${((tournamentAnalysis?.matchConsistency ?? 0) * 100).toFixed(2)}%\n`;
    content += `- Top Cut Probability (${topCutThreshold}-${tournamentRounds - topCutThreshold}+): ${((tournamentAnalysis?.topCutProb ?? 0) * 100).toFixed(2)}%\n`;
    content += `- G1 Velocity: ${((tournamentAnalysis?.g1Velocity ?? 0) * 100).toFixed(2)}%\n`;
    content += `- G2/G3 Resilience: ${((tournamentAnalysis?.g23Velocity ?? 0) * 100).toFixed(2)}%\n`;
    if (tournamentAnalysis?.brickAlert) content += `- **VELOCITY WARNING**: Brick Tax of ${((tournamentAnalysis?.velocityDrop ?? 0) * 100).toFixed(1)}% exceeds 2% threshold\n`;
    if (tournamentAnalysis?.consistencyWarning) content += `- **ENGINE INTEGRITY WARNING**: Post-sideboard consistency below 90% floor\n`;
    content += `\n`;

    if (isPostSideboard && sideDeckAtoms.length > 0) {
      content += `## 4. SIDEBOARD CONFIGURATION\n`;
      content += `Post-Sideboard Mode: Active | Brick Sensitivity: ${brickSensitivity ? 'On (2+ bricks = dead draw)' : 'Off'}\n`;
      content += `Stamina Factor: ${staminaFactor ? 'On (+2-3% late-round variance)' : 'Off'}\n\n`;
      content += `### Side Deck (In):\n`;
      sideDeckAtoms.forEach(a => { content += `- ${a.name}: ${a.count} cards [${a.roles.join(', ')}]\n`; });
      content += `\n### Sided Out:\n`;
      atoms.forEach(a => {
        const out = sideOuts[a.id] || 0;
        if (out > 0) content += `- ${a.name}: -${out} (${a.count} → ${a.count - out})\n`;
      });
      content += `\n`;
    }

    content += `## ${isPostSideboard ? '5' : '4'}. QUANTUM WEIGHT DISTRIBUTION\n`;
    quantumWeightData.forEach(tier => {
      content += `- ${tier.name}: ${tier.count} cards\n`;
    });
    content += `\n`;

    content += `## ${isPostSideboard ? '6' : '5'}. MATHEMATICAL APPENDIX\n`;
    content += `Calculated using Multivariate Hypergeometric Engine.\n`;
    content += `Dead Draw Penalty: ${brickSensitivity ? 'Active (max 1 brick per hand in G2/G3)' : 'Disabled'}\n`;
    content += `Stamina Factor: ${staminaFactor ? 'Active (DP-based non-uniform Swiss distribution)' : 'Disabled (standard binomial)'}\n`;

    return content;
  };

  return (
    <div
      className={`flex flex-col h-screen overflow-hidden text-gray-100 bg-gray-950 transition-all ${isDayMode ? 'theme-day' : 'theme-night'}`}
      style={isDayMode ? { filter: 'invert(1) hue-rotate(180deg)' } : undefined}
    >
      {/* Navbar */}
      <header className="bg-gray-900 border-b border-gray-800 px-4 md:px-6 py-4 flex flex-col items-stretch md:items-center justify-between sticky top-0 z-50 gap-3 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2 rounded-lg shadow-lg shadow-amber-500/20">
            <TrendingUp className="text-gray-950 w-6 h-6" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">
            DUELIST <span className="text-amber-500">SAINT</span>
          </h1>
        </div>
        <div className="flex flex-col lg:flex-row lg:items-center gap-3 w-full">
          <nav className="flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800 overflow-x-auto max-w-full no-scrollbar w-full lg:w-auto">
            <TabButton active={activeTab === 'deck'} onClick={() => setActiveTab('deck')} icon={<Database size={18} />} label="Deck" />
            <TabButton active={activeTab === 'game'} onClick={() => setActiveTab('game')} icon={<Settings size={18} />} label="Game" />
            <TabButton active={activeTab === 'results'} onClick={() => setActiveTab('results')} icon={<Play size={18} />} label="Solve" />
            <TabButton active={activeTab === 'tournament'} onClick={() => setActiveTab('tournament')} icon={<Trophy size={18} />} label="Tournament" />
          </nav>
          <div className="flex items-center gap-2 md:gap-3 flex-wrap">
            <button
              onClick={() => setShowTutorial(true)}
              className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-400 hover:text-white hover:bg-gray-800 border border-gray-800 transition-all"
            >
              Tutorial
            </button>
            <button
              onClick={() => setIsDayMode(prev => !prev)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                isDayMode
                  ? 'bg-sky-500/10 text-sky-300 border-sky-500/30'
                  : 'bg-gray-950 text-gray-500 border-gray-800 hover:text-white'
              }`}
            >
              {isDayMode ? 'Night Mode' : 'Day Mode'}
            </button>
            <button
              onClick={() => setSimpleMode(prev => !prev)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                simpleMode
                  ? 'bg-green-500/10 text-green-400 border-green-500/30'
                  : 'bg-gray-950 text-gray-500 border-gray-800 hover:text-white'
              }`}
            >
              {simpleMode ? 'Simple Mode On' : 'Simple Mode Off'}
            </button>
            <button
              onClick={() => setShowComplexMath(prev => !prev)}
              className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest border transition-all ${
                showComplexMath
                  ? 'bg-indigo-500/10 text-indigo-300 border-indigo-500/30'
                  : 'bg-gray-950 text-gray-500 border-gray-800 hover:text-white'
              }`}
            >
              {showComplexMath ? 'Hide Complex Math' : 'Show Complex Math'}
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-gray-950 p-4 lg:p-8 no-scrollbar scroll-smooth">
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
          {simpleMode && (
            <section className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-2xl">
              <div className="flex items-start gap-3">
                <HelpCircle className="text-amber-500 mt-0.5 shrink-0" size={18} />
                <div>
                  <h2 className="text-sm font-black uppercase tracking-widest text-amber-500">Simple Guide</h2>
                  <p className="text-xs text-gray-400 mt-1 leading-relaxed">
                    Start with <strong className="text-gray-200">Deck</strong> (enter your card groups), then go to <strong className="text-gray-200">Solve</strong> (define a good hand),
                    then open <strong className="text-gray-200">Tournament</strong> to see your match chances. You do not need to do manual math.
                  </p>
                </div>
              </div>
            </section>
          )}
          
          {activeTab === 'deck' && (
             <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="lg:col-span-2 space-y-6">
                <section className="bg-gray-900 border border-gray-800 rounded-3xl overflow-hidden shadow-2xl">
                  <div className="px-6 py-5 border-b border-gray-800 flex items-center justify-between bg-gray-900/50 backdrop-blur-sm">
                    <div className="flex items-center gap-3">
                      <Box className="text-amber-500" size={24} />
                      <h3 className="font-bold text-lg tracking-tight">Card Architecture</h3>
                    </div>
                    <button 
                      onClick={() => setAtoms([...atoms, { id: Math.random().toString(), name: 'New Atom', count: 0, roles: [] }])}
                      className="bg-amber-600 hover:bg-amber-500 text-white px-4 py-2 rounded-xl text-sm font-bold flex items-center gap-2 transition-all active:scale-95 shadow-lg"
                    >
                      <Plus size={18} /> Add Atom
                    </button>
                  </div>
                  
                  <div className="px-6 pt-5 pb-2">
                    <div className="flex items-start gap-3 bg-gray-950/60 border border-gray-800/50 rounded-2xl p-4">
                      <Info size={16} className="text-amber-500 mt-0.5 shrink-0" />
                      <p className="text-xs text-gray-400 leading-relaxed">
                        Break your deck into <strong className="text-gray-300">Atoms</strong> — groups of cards that share a functional purpose. 
                        Give each atom a name, set how many copies it contains, then tag it with one or more <strong className="text-gray-300">Roles</strong> (Starter, Extender, Defensive, Brick). 
                        A single card can fill multiple roles. Any cards not assigned to an atom are treated as generic filler.
                      </p>
                    </div>
                  </div>

                  <div className="p-6 space-y-4">
                    <div className="space-y-4">
                      {atoms.map(atom => (
                        <div key={atom.id} className="bg-gray-950 border border-gray-800 rounded-3xl p-5 space-y-4 group hover:border-amber-500/30 transition-all shadow-inner">
                          <div className="flex flex-col md:flex-row gap-4 items-start md:items-center">
                            <div className="flex-1 w-full">
                              <input 
                                value={atom.name}
                                onChange={(e) => setAtoms(atoms.map(a => a.id === atom.id ? { ...a, name: e.target.value } : a))}
                                className="bg-transparent border-b border-gray-800 focus:border-amber-500 outline-none text-base font-bold w-full py-1"
                                placeholder="Cluster name..."
                              />
                            </div>
                            <div className="flex items-center gap-3 bg-gray-900 px-4 py-2 rounded-2xl border border-gray-800 shrink-0">
                              <label className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">Qty:</label>
                              <NumericInput 
                                value={atom.count}
                                onChange={(val) => setAtoms(atoms.map(a => a.id === atom.id ? { ...a, count: val } : a))}
                                className="bg-transparent text-lg font-black text-amber-500 w-12 text-center outline-none font-mono"
                              />
                            </div>
                            <button 
                              onClick={() => setAtoms(atoms.filter(a => a.id !== atom.id))}
                              className="text-gray-700 hover:text-red-500 p-2 transition-colors rounded-xl"
                            >
                              <Trash2 size={20} />
                            </button>
                          </div>

                          {/* Role Tagging System */}
                          <div className="bg-gray-900/40 rounded-2xl p-4 border border-gray-800/50 space-y-4">
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <Filter size={14} className="text-gray-500" />
                                <span className="text-[11px] font-black text-gray-500 uppercase tracking-widest">Assign Functional Roles</span>
                              </div>
                              <span className="text-[10px] font-bold text-gray-500 uppercase">Impact: <span className="text-amber-500">{((atom.count / deckSize) * 100).toFixed(1)}%</span></span>
                            </div>

                            <div className="flex flex-wrap gap-2">
                              {allRoles.map(role => {
                                const isActive = atom.roles.includes(role);
                                return (
                                  <button
                                    key={role}
                                    onClick={() => toggleRoleInAtom(atom.id, role)}
                                    className={`px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest transition-all border flex items-center gap-2 ${
                                      isActive 
                                        ? 'bg-amber-500 border-amber-400 text-gray-950' 
                                        : 'bg-gray-950 border-gray-800 text-gray-500 hover:border-gray-600'
                                    }`}
                                  >
                                    {isActive ? <CheckCircle2 size={12} /> : <div className="w-3 h-3 rounded-full border border-gray-700" />}
                                    <span>{role}</span>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </section>
              </div>

              <div className="space-y-6">
                <section className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl">
                  <h3 className="font-bold flex items-center gap-2 mb-3 uppercase tracking-widest text-xs">
                    <Activity className="text-amber-500" size={16} />
                    Composition Saturation
                  </h3>
                  <p className="text-[11px] text-gray-500 leading-relaxed mb-6">
                    Shows what percentage of your deck each role occupies. Higher saturation means you're more likely to draw that role in your opening hand.
                  </p>
                  <div className="space-y-6">
                    {allRoles.map(role => {
                      const count = globalRoleCounts[role];
                      const perc = deckSize > 0 ? (count / deckSize) * 100 : 0;
                      return (
                        <div key={role} className="space-y-2">
                          <div className="flex justify-between items-end">
                            <span className="text-xs font-black text-gray-300 uppercase tracking-widest">{role}</span>
                            <div className="text-right text-xs font-mono font-bold text-amber-500">{count} ({perc.toFixed(1)}%)</div>
                          </div>
                          <div className="h-2 bg-gray-950 rounded-full border border-gray-800 p-0.5 overflow-hidden">
                            <div className="h-full bg-amber-500 rounded-full transition-all duration-1000" style={{ width: `${perc}%` }} />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </section>
                
                <div className={`p-6 rounded-3xl border transition-all ${deckValidation.valid ? 'bg-green-500/5 border-green-500/20 text-green-400' : 'bg-red-500/5 border-red-500/20 text-red-400'}`}>
                  <div className="flex items-center gap-3 mb-2 font-black uppercase tracking-widest text-xs">
                    {deckValidation.valid ? <CheckCircle2 size={16} /> : <AlertTriangle size={16} />}
                    System Validation
                  </div>
                  <p className="text-sm font-medium leading-relaxed opacity-80">{deckValidation.msg}</p>
                </div>
              </div>
            </div>
          )}

          {activeTab === 'game' && (
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <section className="bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl space-y-8">
                <div>
                  <h3 className="font-bold flex items-center gap-3 text-lg uppercase tracking-tight">
                    <Settings className="text-amber-500" size={24} />
                    Structural Params
                  </h3>
                  <p className="text-xs text-gray-500 leading-relaxed mt-3">
                    Select your TCG to auto-fill the correct deck size, starting hand, and draw rules. 
                    You can also override deck size and starting hand manually for custom formats.
                  </p>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  {Object.values(TCGType).map(t => (
                    <button
                      key={t}
                      onClick={() => handleTCGChange(t)}
                      className={`px-5 py-4 rounded-2xl border text-left transition-all ${
                        selectedTCG === t 
                          ? 'bg-amber-500 text-gray-950 border-amber-400' 
                          : 'bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-900'
                      }`}
                    >
                      <div className="font-black text-sm uppercase">{t}</div>
                    </button>
                  ))}
                </div>
                <div className="grid grid-cols-2 gap-6 pt-4 border-t border-gray-800/50">
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Deck Size</label>
                    <NumericInput value={deckSize} onChange={setDeckSize} className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 font-mono text-lg font-bold text-amber-500 shadow-inner outline-none" />
                  </div>
                  <div>
                    <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Start Hand</label>
                    <NumericInput value={startHand} onChange={setStartHand} className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-5 py-4 font-mono text-lg font-bold text-amber-500 shadow-inner outline-none" />
                  </div>
                </div>
              </section>

              <section className="bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl space-y-8">
                <div>
                  <div className="flex items-center justify-between">
                    <h3 className="font-bold flex items-center gap-3 text-lg uppercase tracking-tight">
                      <RefreshCw className="text-amber-500" size={24} />
                      Mulligan Logic
                    </h3>
                    <button 
                      onClick={() => setMulligan(prev => ({ ...prev, enabled: !prev.enabled }))}
                      className={`w-14 h-7 rounded-full p-1 transition-all ${mulligan.enabled ? 'bg-amber-500' : 'bg-gray-800'}`}
                    >
                      <div className={`w-5 h-5 rounded-full bg-white shadow-lg transition-all ${mulligan.enabled ? 'translate-x-7' : 'translate-x-0'}`} />
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 leading-relaxed mt-3">
                    Enable mulligan simulation to model redraw rules. Choose a mulligan type, then set a <strong className="text-gray-400">keep condition</strong> — 
                    the hand is kept if it contains at least N cards of the chosen role. If the condition fails, 
                    the engine assumes you mulligan and recalculates your odds with a fresh draw.
                  </p>
                </div>

                <div className={`space-y-6 transition-all ${mulligan.enabled ? 'opacity-100' : 'opacity-40 pointer-events-none'}`}>
                   <div className="grid grid-cols-2 gap-4">
                      {['none', 'mtg', 'one-piece', 'pokemon'].map(type => (
                        <button
                          key={type}
                          onClick={() => setMulligan({ ...mulligan, type: type as any })}
                          className={`px-4 py-3 rounded-xl border text-xs font-black uppercase tracking-widest ${
                            mulligan.type === type ? 'bg-amber-500 text-gray-950 border-amber-400' : 'bg-gray-950 border-gray-800 text-gray-500'
                          }`}
                        >
                          {type.replace('-', ' ')}
                        </button>
                      ))}
                   </div>

                   <div className="bg-gray-950 p-6 rounded-3xl border border-gray-800 space-y-4">
                      <p className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Keep Hand Condition (Keep if...)</p>
                      <div className="flex items-center gap-4">
                        <select 
                          value={mulligan.keepRole}
                          onChange={(e) => setMulligan({ ...mulligan, keepRole: e.target.value })}
                          className="bg-gray-900 border border-gray-800 text-xs font-bold p-3 rounded-xl flex-1 outline-none"
                        >
                          {allRoles.map(r => <option key={r} value={r}>{r}</option>)}
                        </select>
                        <div className="flex items-center gap-2">
                          <span className="text-xs text-gray-500 font-bold">≥</span>
                          <NumericInput value={mulligan.keepMin} onChange={(v) => setMulligan({ ...mulligan, keepMin: v })} className="w-12 bg-gray-900 border border-gray-800 text-amber-500 font-bold p-3 rounded-xl text-center" />
                        </div>
                      </div>
                   </div>
                </div>
              </section>
            </div>
          )}

          {activeTab === 'results' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">
              <div className="flex justify-end gap-3">
                 <button
                  onClick={() => setIsSolveChartOpen(true)}
                  className="bg-amber-600 hover:bg-amber-500 text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-xl active:scale-95 hover:shadow-amber-500/30"
                 >
                   <Activity size={16} /> Open Chart
                 </button>
                 <button
                  onClick={() => setActiveTab('tournament')}
                  className="bg-gray-800 hover:bg-gray-700 text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-xl active:scale-95"
                 >
                   <Trophy size={16} /> Tournament Analysis
                 </button>
                 <button 
                  onClick={() => setIsReportOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-xl active:scale-95"
                 >
                   <FileText size={16} /> Get Stochastic Report
                 </button>
              </div>

              <div className="flex flex-col md:flex-row gap-6">
                <section className="md:w-1/3 bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl h-fit sticky top-24">
                   <div className="flex items-center justify-between mb-4">
                    <h3 className="font-bold flex items-center gap-2 text-lg">
                      <Target className="text-amber-500" size={24} />
                      Win States
                    </h3>
                    <button onClick={addCondition} className="p-2 bg-amber-500 text-gray-950 rounded-xl hover:bg-amber-400 transition-all active:scale-95">
                      <Plus size={20} />
                    </button>
                  </div>

                  <div className="flex items-start gap-2.5 bg-gray-950/60 border border-gray-800/50 rounded-2xl p-3.5 mb-6">
                    <Info size={14} className="text-amber-500 mt-0.5 shrink-0" />
                    <p className="text-[11px] text-gray-500 leading-relaxed">
                      Define what a <strong className="text-gray-400">"good hand"</strong> looks like. Each win state has <strong className="text-gray-400">role constraints</strong> (min/max cards of a role you need) and a <strong className="text-gray-400">Quantum Weight</strong> that scores how valuable that hand type is for the EV chart.
                    </p>
                  </div>

                  <div className="space-y-4 max-h-[60vh] overflow-y-auto no-scrollbar pr-2">
                    {conditions.map((c) => (
                      <div key={c.id} className="bg-gray-950 border border-gray-800 rounded-2xl p-5 space-y-4 relative group hover:border-amber-500/20 transition-all">
                        <div className="flex items-center justify-between gap-4">
                          <input 
                            value={c.name}
                            onChange={(e) => setConditions(conditions.map(cond => cond.id === c.id ? { ...cond, name: e.target.value } : cond))}
                            className="bg-transparent border-b border-gray-800 focus:border-amber-500 outline-none text-sm font-black uppercase tracking-tight w-full"
                          />
                          <button onClick={() => setConditions(conditions.filter(cond => cond.id !== c.id))} className="text-gray-700 hover:text-red-500 p-1">
                            <Trash2 size={16} />
                          </button>
                        </div>
                        
                        <div className="flex items-center gap-3">
                          <label className="text-[10px] font-black text-gray-500 uppercase tracking-widest">Quantum Weight:</label>
                          <input 
                            type="number" 
                            step="0.1" 
                            value={c.weight}
                            onChange={(e) => setConditions(conditions.map(cond => cond.id === c.id ? { ...cond, weight: parseFloat(e.target.value) || 0 } : cond))}
                            className="bg-gray-900 border border-gray-800 px-3 py-1 rounded-xl text-xs w-20 text-amber-500 font-mono font-bold"
                          />
                        </div>

                        <div className="space-y-3 border-t border-gray-800 pt-4">
                           {c.thresholds.map((t, ti) => (
                             <div key={ti} className="flex flex-col gap-2 bg-gray-900/50 p-3 rounded-xl border border-gray-800/30">
                               <div className="flex justify-between items-center">
                                 <select 
                                   value={t.role}
                                   onChange={(e) => updateThreshold(c.id, ti, { role: e.target.value })}
                                   className="bg-transparent text-[10px] font-black uppercase tracking-widest text-gray-300 outline-none"
                                 >
                                  {deckTabRoleOptions.map(r => <option key={r} value={r} className="bg-gray-900">{r}</option>)}
                                 </select>
                                 <button onClick={() => removeThreshold(c.id, ti)} className="text-gray-600 hover:text-red-500">
                                   <X size={12} />
                                 </button>
                               </div>
                               <div className="flex items-center gap-2">
                                  <div className="flex-1 space-y-1">
                                    <p className="text-[8px] font-black text-gray-600 uppercase">Min</p>
                                    <NumericInput value={t.minCount} onChange={(v) => updateThreshold(c.id, ti, { minCount: v })} className="w-full bg-gray-950 rounded p-1 text-center text-xs font-mono" />
                                  </div>
                                  <div className="flex-1 space-y-1">
                                    <p className="text-[8px] font-black text-gray-600 uppercase">Max</p>
                                    <NumericInput value={t.maxCount} onChange={(v) => updateThreshold(c.id, ti, { maxCount: v })} className="w-full bg-gray-950 rounded p-1 text-center text-xs font-mono" />
                                  </div>
                               </div>
                             </div>
                           ))}
                           <button 
                            onClick={() => setConditions(conditions.map(cond => cond.id === c.id ? { ...cond, thresholds: [...cond.thresholds, { role: deckTabRoleOptions[0], minCount: 1, maxCount: deckSize }] } : cond))}
                            className="w-full py-2 border border-dashed border-gray-800 rounded-xl text-[10px] font-black uppercase tracking-widest text-gray-500 hover:text-amber-500 transition-all flex items-center justify-center gap-2"
                           >
                             <Plus size={14} /> Role Constraint
                           </button>
                        </div>
                      </div>
                    ))}
                  </div>
                </section>

                <div className="flex-1 space-y-6">
                  <section className="bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden hover:border-amber-500/40 transition-all">
                    <div className="flex items-start gap-3">
                      <Activity className="text-amber-500 mt-0.5 shrink-0" size={20} />
                      <div className="space-y-2">
                        <h3 className="font-black text-lg uppercase tracking-tight">Projection Chart Panel</h3>
                        <p className="text-xs text-gray-400 leading-relaxed">
                          The Solve chart now opens in a separate floating panel so the Win State editor stays focused and easier to use.
                          Use the <strong className="text-gray-200">Open Chart</strong> button above.
                        </p>
                      </div>
                    </div>
                  </section>
                </div>
              </div>

              {isSolveChartOpen && (
                <div className="fixed inset-0 z-[90] bg-black/60 backdrop-blur-sm p-4 md:p-8 flex items-end md:items-center justify-center">
                  <section className="w-full max-w-6xl bg-gray-900 border border-gray-800 rounded-3xl p-5 md:p-8 shadow-2xl relative overflow-hidden hover:-translate-y-0.5 transition-all">
                    <button
                      onClick={() => setIsSolveChartOpen(false)}
                      className="absolute top-4 right-4 p-2 rounded-xl text-gray-500 hover:text-white hover:bg-gray-800"
                    >
                      <X size={18} />
                    </button>

                    <div className="flex flex-col md:flex-row md:items-center md:justify-between mb-8 gap-4 pr-10">
                      <div className="flex items-center gap-4">
                        <div className={`p-3 rounded-2xl transition-all ${isQuantumMode ? 'bg-indigo-500 text-gray-950 shadow-xl' : 'bg-gray-800 text-gray-400'}`}>
                          <Cpu size={28} />
                        </div>
                        <div>
                          <h3 className="font-black text-lg uppercase tracking-tight">
                            {isQuantumMode ? 'Quantum Expected Value' : 'Success Projections'}
                          </h3>
                          <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest mt-1">
                            {isQuantumMode
                              ? 'Weighted EV score combining all win states over 10 draw steps'
                              : 'Probability of hitting each win state as you draw more cards'}
                          </p>
                        </div>
                      </div>

                      <div className="flex items-center gap-4 bg-gray-950 p-2 rounded-2xl border border-gray-800 shadow-inner">
                        <span className={`text-[10px] font-black uppercase tracking-widest px-3 transition-colors ${!isQuantumMode ? 'text-amber-500' : 'text-gray-600'}`}>Classical</span>
                        <button
                          onClick={() => setIsQuantumMode(!isQuantumMode)}
                          className={`w-14 h-7 rounded-full p-1 transition-all ${isQuantumMode ? 'bg-indigo-500' : 'bg-amber-600'}`}
                        >
                          <div className={`w-5 h-5 rounded-full bg-white transition-all ${isQuantumMode ? 'translate-x-7' : 'translate-x-0'}`} />
                        </button>
                        <span className={`text-[10px] font-black uppercase tracking-widest px-3 transition-colors ${isQuantumMode ? 'text-indigo-400' : 'text-gray-600'}`}>Quantum</span>
                      </div>
                    </div>

                    {showComplexMath && (
                      <div className="bg-indigo-500/5 border border-indigo-500/20 rounded-2xl p-4 mb-6">
                        <p className="text-[10px] font-black text-indigo-300 uppercase tracking-widest mb-2">Complex Arithmetic</p>
                        <p className="text-[11px] text-gray-400 leading-relaxed">
                          Hypergeometric core:{' '}
                          <code className="bg-gray-900 px-2 py-0.5 rounded">P(X = x) = [C(K, x) * C(N-K, n-x)] / C(N, n)</code>.
                          {' '}For your weighted curve:{' '}
                          <code className="bg-gray-900 px-2 py-0.5 rounded">EV(step) = Σ [P(conditionᵢ) × weightᵢ]</code>.
                        </p>
                      </div>
                    )}

                    <div className="h-[52vh] min-h-[320px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={timelineData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                          <XAxis dataKey="step" stroke="#4b5563" fontSize={10} fontStyle="bold" axisLine={false} tickLine={false} />
                          <YAxis
                            stroke="#4b5563"
                            fontSize={10}
                            unit={isQuantumMode ? '' : '%'}
                            domain={isQuantumMode ? ['auto', 'auto'] : [0, 100]}
                            axisLine={false}
                            tickLine={false}
                          />
                          <Tooltip
                            contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '20px' }}
                            itemStyle={{ fontSize: '12px', fontWeight: '900', textTransform: 'uppercase' }}
                            formatter={(value: string) => [value, isQuantumMode ? 'EV Score' : '% Success']}
                          />
                          <Legend verticalAlign="top" height={40} iconType="circle" />
                          {isQuantumMode ? (
                            <Area type="monotone" dataKey="EV" fill="#6366f1" stroke="#6366f1" fillOpacity={0.15} strokeWidth={5} />
                          ) : (
                            conditions.map((c, i) => (
                              <Line
                                key={c.id}
                                type="monotone"
                                dataKey={c.name}
                                stroke={i === 0 ? '#f59e0b' : i === 1 ? '#6366f1' : '#10b981'}
                                strokeWidth={4}
                                dot={{ r: 6, strokeWidth: 2, stroke: '#111827' }}
                                animationDuration={800 + i * 200}
                              />
                            ))
                          )}
                        </ComposedChart>
                      </ResponsiveContainer>
                    </div>
                  </section>
                </div>
              )}
            </div>
          )}

          {activeTab === 'tournament' && (
            <div className="space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-500">

              {/* === THE BIG THREE METRICS HEADER === */}
              {tournamentAnalysis && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl text-center">
                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-2">Hand Consistency (Floor)</p>
                    <p className={`text-5xl font-black font-mono ${tournamentAnalysis.meetsConsistencyFloor ? 'text-green-500' : 'text-red-500'}`}>
                      {(tournamentAnalysis.matchConsistency * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-gray-600 mt-2">P(1+ Playable Hand in Bo3 Match)</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl text-center">
                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-2">Full Combo Velocity (Ceiling)</p>
                    <p className="text-5xl font-black font-mono text-amber-500">
                      {(tournamentAnalysis.g1Velocity * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-gray-600 mt-2">G1 Weighted Win Probability</p>
                  </div>
                  <div className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl text-center">
                    <p className="text-[10px] font-black uppercase text-gray-500 tracking-widest mb-2">Match Win Theory</p>
                    <p className="text-5xl font-black font-mono text-indigo-500">
                      {(tournamentAnalysis.P_match * 100).toFixed(1)}%
                    </p>
                    <p className="text-[10px] text-gray-600 mt-2">Best-of-3 Cumulative Win Rate</p>
                  </div>
                </div>
              )}

              {/* === BRICK ALERT BANNER === */}
              {tournamentAnalysis?.brickAlert && (
                <div className={`flex items-center gap-4 rounded-3xl p-5 border shadow-2xl ${
                  tournamentAnalysis.brickAlertSeverity === 'critical'
                    ? 'bg-red-500/10 border-red-500/40 text-red-400'
                    : 'bg-amber-500/10 border-amber-500/40 text-amber-400'
                }`}>
                  <AlertTriangle size={24} className="shrink-0" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest">
                      Velocity Warning: High-Impact Brick Tax {tournamentAnalysis.brickAlertSeverity === 'critical' ? 'Critical' : 'Exceeded'}
                    </p>
                    <p className="text-[10px] opacity-80 mt-1">
                      G2/G3 velocity dropped {(tournamentAnalysis.velocityDrop * 100).toFixed(1)}% from Game 1 ({(tournamentAnalysis.g1Velocity * 100).toFixed(1)}% → {(tournamentAnalysis.g23Velocity * 100).toFixed(1)}%). 
                      {tournamentAnalysis.brickAlertSeverity === 'critical' ? ' Consider reducing bricks or strengthening your side deck strategy.' : ' Review sideboard swaps for over-siding risk.'}
                    </p>
                  </div>
                </div>
              )}

              {/* === CONSISTENCY WARNING === */}
              {tournamentAnalysis?.consistencyWarning && (
                <div className="flex items-center gap-4 rounded-3xl p-5 border shadow-2xl bg-red-500/10 border-red-500/40 text-red-400">
                  <AlertTriangle size={24} className="shrink-0" />
                  <div>
                    <p className="text-xs font-black uppercase tracking-widest">Engine Integrity Warning</p>
                    <p className="text-[10px] opacity-80 mt-1">
                      Post-sideboard single-game consistency dropped to {((tournamentAnalysis.postSideConsistency ?? 0) * 100).toFixed(1)}% — below the 90% safety floor. 
                      You may have sided out too many Starters for defensive cards.
                    </p>
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
                {/* ======= LEFT COLUMN: CONFIGURATION ======= */}
                <div className="space-y-6">

                  {/* Tournament Structure */}
                  <section className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl space-y-6">
                    <h3 className="font-bold flex items-center gap-2 uppercase tracking-widest text-xs">
                      <Layers className="text-amber-500" size={16} />
                      Tournament Structure
                    </h3>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Event Preset</label>
                      <div className="grid grid-cols-1 gap-2">
                        {[
                          { name: 'Locals', rounds: 5, cut: 4, desc: '~32 players' },
                          { name: 'Regionals', rounds: 8, cut: 6, desc: '~256 players' },
                          { name: 'YCS', rounds: 11, cut: 9, desc: '~1000+ players' },
                        ].map(preset => (
                          <button
                            key={preset.name}
                            onClick={() => { setTournamentRounds(preset.rounds); setTopCutThreshold(preset.cut); }}
                            className={`px-4 py-3 rounded-2xl border text-left transition-all ${
                              tournamentRounds === preset.rounds ? 'bg-amber-500 text-gray-950 border-amber-400' : 'bg-gray-950 border-gray-800 text-gray-400 hover:bg-gray-900'
                            }`}
                          >
                            <div className="flex justify-between items-center">
                              <span className="font-black text-sm uppercase">{preset.name}</span>
                              <span className="text-[10px] font-bold opacity-70">{preset.rounds}R · {preset.desc}</span>
                            </div>
                          </button>
                        ))}
                      </div>
                    </div>
                    <div className="grid grid-cols-2 gap-4">
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Rounds</label>
                        <NumericInput value={tournamentRounds} onChange={setTournamentRounds} className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-4 py-3 font-mono text-lg font-bold text-amber-500 shadow-inner outline-none" />
                      </div>
                      <div>
                        <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-2">Top Cut Wins</label>
                        <NumericInput value={topCutThreshold} onChange={setTopCutThreshold} className="w-full bg-gray-950 border border-gray-800 rounded-2xl px-4 py-3 font-mono text-lg font-bold text-amber-500 shadow-inner outline-none" />
                      </div>
                    </div>
                  </section>

                  {/* Match Variables */}
                  <section className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl space-y-6">
                    <h3 className="font-bold flex items-center gap-2 uppercase tracking-widest text-xs">
                      <Sliders className="text-amber-500" size={16} />
                      Match Variables
                    </h3>
                    <div>
                      <label className="block text-[10px] font-black text-gray-500 uppercase tracking-widest mb-3">Game 1 Position</label>
                      <div className="grid grid-cols-2 gap-2">
                        <button onClick={() => setG1GoingFirst(true)} className={`px-4 py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${g1GoingFirst ? 'bg-amber-500 text-gray-950 border-amber-400' : 'bg-gray-950 border-gray-800 text-gray-500'}`}>Going 1st</button>
                        <button onClick={() => setG1GoingFirst(false)} className={`px-4 py-3 rounded-xl border text-xs font-black uppercase tracking-widest transition-all ${!g1GoingFirst ? 'bg-amber-500 text-gray-950 border-amber-400' : 'bg-gray-950 border-gray-800 text-gray-500'}`}>Going 2nd</button>
                      </div>
                      <p className="text-[10px] text-gray-600 mt-2">G2: Loser picks · G3: Random 50/50</p>
                    </div>
                    <div>
                      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em] mb-3">
                        <label className="text-gray-500">Sideboard Variance</label>
                        <span className="font-mono text-amber-500 bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20 shadow-inner">{(sideboardVariance * 100).toFixed(0)}%</span>
                      </div>
                      <input type="range" min="0" max="0.4" step="0.01" value={sideboardVariance} onChange={(e) => setSideboardVariance(parseFloat(e.target.value))} className="w-full h-2 bg-gray-950 rounded-full appearance-none cursor-pointer accent-amber-500" />
                      <p className="text-[10px] text-gray-600 mt-2">
                        Ultimate Starters retain 90% weight; Pure Starters drop up to 30% in G2/G3.
                      </p>
                    </div>
                    {/* Stamina Factor */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Stamina Factor</p>
                        <p className="text-[9px] text-gray-600">+2-3% variance in late rounds</p>
                      </div>
                      <button onClick={() => setStaminaFactor(!staminaFactor)} className={`w-12 h-6 rounded-full p-0.5 transition-all ${staminaFactor ? 'bg-amber-500' : 'bg-gray-800'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white shadow transition-all ${staminaFactor ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </section>

                  {/* ======= SIDE DECK CONFIGURATION ======= */}
                  <section className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl space-y-5">
                    <div className="flex items-center justify-between">
                      <h3 className="font-bold flex items-center gap-2 uppercase tracking-widest text-xs">
                        <ListFilter className="text-amber-500" size={16} />
                        Side Deck
                      </h3>
                      <div className="flex items-center gap-3">
                        <span className={`text-[10px] font-black font-mono ${totalSidedIn > 15 ? 'text-red-500' : 'text-gray-500'}`}>{totalSidedIn}/15</span>
                        <button
                          onClick={() => setSideDeckAtoms([...sideDeckAtoms, { id: `sd-${Date.now()}`, name: 'Silver Bullet', count: 0, roles: ['Defensive'] }])}
                          className="p-1.5 bg-amber-500 text-gray-950 rounded-lg hover:bg-amber-400 transition-all active:scale-95"
                        >
                          <Plus size={14} />
                        </button>
                      </div>
                    </div>

                    <div className="space-y-2 max-h-44 overflow-y-auto no-scrollbar">
                      {sideDeckAtoms.length === 0 && (
                        <p className="text-[10px] text-gray-600 text-center py-4">Add cards to your side deck to simulate G2/G3 swaps.</p>
                      )}
                      {sideDeckAtoms.map(atom => (
                        <div key={atom.id} className="flex items-center gap-2 bg-gray-950 rounded-xl p-2.5 border border-gray-800">
                          <input
                            value={atom.name}
                            onChange={(e) => setSideDeckAtoms(sideDeckAtoms.map(a => a.id === atom.id ? { ...a, name: e.target.value } : a))}
                            className="bg-transparent text-[11px] font-bold flex-1 outline-none border-b border-transparent focus:border-amber-500 min-w-0"
                            placeholder="Card name..."
                          />
                          <NumericInput
                            value={atom.count}
                            onChange={(val) => setSideDeckAtoms(sideDeckAtoms.map(a => a.id === atom.id ? { ...a, count: val } : a))}
                            className="w-8 bg-gray-900 text-amber-500 font-mono font-bold text-center text-xs rounded p-1 outline-none"
                          />
                          <div className="flex gap-0.5 shrink-0">
                            {allRoles.map(role => (
                              <button
                                key={role}
                                onClick={() => setSideDeckAtoms(sideDeckAtoms.map(a => {
                                  if (a.id !== atom.id) return a;
                                  const nr = a.roles.includes(role) ? a.roles.filter(r => r !== role) : [...a.roles, role];
                                  return { ...a, roles: nr };
                                }))}
                                className={`px-1 py-0.5 rounded text-[7px] font-black uppercase leading-none ${
                                  atom.roles.includes(role) ? 'bg-amber-500 text-gray-950' : 'bg-gray-800 text-gray-600'
                                }`}
                                title={role}
                              >
                                {role.slice(0, 2)}
                              </button>
                            ))}
                          </div>
                          <button onClick={() => setSideDeckAtoms(sideDeckAtoms.filter(a => a.id !== atom.id))} className="text-gray-700 hover:text-red-500 p-0.5 shrink-0">
                            <X size={12} />
                          </button>
                        </div>
                      ))}
                    </div>

                    {/* Post-Sideboard Toggle */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Post-Sideboard Mode</p>
                        <p className="text-[9px] text-gray-600">Apply swaps to G2/G3 engine</p>
                      </div>
                      <button onClick={() => setIsPostSideboard(!isPostSideboard)} className={`w-12 h-6 rounded-full p-0.5 transition-all ${isPostSideboard ? 'bg-amber-500' : 'bg-gray-800'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white shadow transition-all ${isPostSideboard ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>

                    {/* Side Out Config */}
                    {isPostSideboard && (
                      <div className="space-y-2 pt-3 border-t border-gray-800">
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500 mb-2">Side Out (per atom)</p>
                        {atoms.map(atom => (
                          <div key={atom.id} className="flex items-center justify-between bg-gray-950 rounded-lg px-3 py-1.5 border border-gray-800">
                            <span className="text-[10px] font-bold text-gray-400 truncate flex-1 mr-2">{atom.name}</span>
                            <div className="flex items-center gap-1.5 shrink-0">
                              <span className="text-[9px] text-gray-600 font-mono">{atom.count}→{Math.max(0, atom.count - (sideOuts[atom.id] || 0))}</span>
                              <NumericInput
                                value={sideOuts[atom.id] || 0}
                                onChange={(val) => setSideOuts({ ...sideOuts, [atom.id]: Math.min(val, atom.count) })}
                                className="w-7 bg-gray-900 text-red-400 font-mono font-bold text-center text-[10px] rounded p-0.5 outline-none"
                              />
                            </div>
                          </div>
                        ))}
                        <div className="flex justify-between text-[9px] font-bold pt-1">
                          <span className="text-red-400">Out: {totalSidedOut}</span>
                          <span className="text-green-400">In: {totalSidedIn}</span>
                          <span className={totalSidedOut === totalSidedIn ? 'text-green-400' : 'text-amber-400'}>
                            {totalSidedOut === totalSidedIn ? '✓ Balanced' : `Δ ${Math.abs(totalSidedIn - totalSidedOut)}`}
                          </span>
                        </div>
                      </div>
                    )}

                    {/* Brick Sensitivity */}
                    <div className="flex items-center justify-between pt-3 border-t border-gray-800">
                      <div>
                        <p className="text-[10px] font-black uppercase tracking-widest text-gray-500">Brick Sensitivity</p>
                        <p className="text-[9px] text-gray-600">Dead draw if 2+ bricks in hand</p>
                      </div>
                      <button onClick={() => setBrickSensitivity(!brickSensitivity)} className={`w-12 h-6 rounded-full p-0.5 transition-all ${brickSensitivity ? 'bg-red-500' : 'bg-gray-800'}`}>
                        <div className={`w-5 h-5 rounded-full bg-white shadow transition-all ${brickSensitivity ? 'translate-x-6' : 'translate-x-0'}`} />
                      </button>
                    </div>
                  </section>
                </div>

                {/* ======= RIGHT COLUMN: RESULTS ======= */}
                <div className="lg:col-span-2 space-y-6">
                  {tournamentAnalysis ? (
                    <>
                      {/* Secondary Metrics */}
                      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-2xl">
                          <p className="text-[10px] font-black uppercase text-gray-500 mb-1">Top Cut Prob</p>
                          <p className="text-3xl font-black text-indigo-500 font-mono">{(tournamentAnalysis.topCutProb * 100).toFixed(1)}%</p>
                          <p className="text-[10px] text-gray-600 mt-1">{topCutThreshold}-{tournamentRounds - topCutThreshold} or better</p>
                        </div>
                        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-2xl">
                          <p className="text-[10px] font-black uppercase text-gray-500 mb-1">Expected Record</p>
                          <p className="text-3xl font-black text-green-500 font-mono">{tournamentAnalysis.expectedWins.toFixed(1)}-{tournamentAnalysis.expectedLosses.toFixed(1)}</p>
                          <p className="text-[10px] text-gray-600 mt-1">Projected finish</p>
                        </div>
                        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-2xl">
                          <p className="text-[10px] font-black uppercase text-gray-500 mb-1">G1 Velocity</p>
                          <p className="text-3xl font-black text-amber-500 font-mono">{(tournamentAnalysis.g1Velocity * 100).toFixed(1)}%</p>
                          <p className="text-[10px] text-gray-600 mt-1">Main deck only</p>
                        </div>
                        <div className="bg-gray-900 border border-gray-800 rounded-3xl p-5 shadow-2xl">
                          <p className="text-[10px] font-black uppercase text-gray-500 mb-1">G2/G3 Resilience</p>
                          <p className="text-3xl font-black text-indigo-500 font-mono">{(tournamentAnalysis.g23Velocity * 100).toFixed(1)}%</p>
                          <p className="text-[10px] text-gray-600 mt-1">Post-sideboard avg</p>
                        </div>
                      </div>

                      {/* Bo3 Game Breakdown */}
                      <section className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl">
                        <h3 className="font-bold flex items-center gap-2 mb-2 uppercase tracking-widest text-xs">
                          <Zap className="text-amber-500" size={16} />
                          Bo3 Game Breakdown
                        </h3>
                        <p className="text-[11px] text-gray-500 mb-6">
                          G1 uses main deck probabilities. G2/G3 use {isPostSideboard ? 'post-sideboard composition' : 'main deck'} with sideboard variance applied.
                          {brickSensitivity && ' Dead draw penalty active: hands with 2+ bricks are treated as failures.'}
                        </p>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-5 space-y-3">
                            <div>
                              <p className="text-xs font-black uppercase tracking-widest">Game 1</p>
                              <p className="text-[10px] text-gray-600">{g1GoingFirst ? 'Going First' : 'Going Second'} · Pre-Side</p>
                            </div>
                            <p className="text-2xl font-black font-mono text-amber-500">{(tournamentAnalysis.P_g1 * 100).toFixed(1)}%</p>
                            <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                              <div className="h-full bg-amber-500 rounded-full transition-all duration-1000" style={{ width: `${tournamentAnalysis.P_g1 * 100}%` }} />
                            </div>
                          </div>
                          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-5 space-y-3">
                            <div>
                              <p className="text-xs font-black uppercase tracking-widest">Game 2</p>
                              <p className="text-[10px] text-gray-600">Post-Side · Avg</p>
                            </div>
                            <p className="text-2xl font-black font-mono text-indigo-500">{(((tournamentAnalysis.P_g2_afterWin + tournamentAnalysis.P_g2_afterLoss) / 2) * 100).toFixed(1)}%</p>
                            <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                              <div className="h-full bg-indigo-500 rounded-full transition-all duration-1000" style={{ width: `${((tournamentAnalysis.P_g2_afterWin + tournamentAnalysis.P_g2_afterLoss) / 2) * 100}%` }} />
                            </div>
                            <div className="flex justify-between text-[9px] font-bold text-gray-600">
                              <span>After W: {(tournamentAnalysis.P_g2_afterWin * 100).toFixed(1)}%</span>
                              <span>After L: {(tournamentAnalysis.P_g2_afterLoss * 100).toFixed(1)}%</span>
                            </div>
                          </div>
                          <div className="bg-gray-950 border border-gray-800 rounded-2xl p-5 space-y-3">
                            <div>
                              <p className="text-xs font-black uppercase tracking-widest">Game 3</p>
                              <p className="text-[10px] text-gray-600">Post-Side · Random 50/50</p>
                            </div>
                            <p className="text-2xl font-black font-mono text-emerald-500">{(tournamentAnalysis.P_g3 * 100).toFixed(1)}%</p>
                            <div className="h-1.5 bg-gray-900 rounded-full overflow-hidden">
                              <div className="h-full bg-emerald-500 rounded-full transition-all duration-1000" style={{ width: `${tournamentAnalysis.P_g3 * 100}%` }} />
                            </div>
                          </div>
                        </div>
                        <div className="mt-6 bg-gray-950 border border-gray-800 rounded-2xl p-4">
                          {simpleMode ? (
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                              Match win rate means your chance to win a best-of-3. The app automatically combines your Game 1 and post-side Game 2/3 chances.
                            </p>
                          ) : (
                            <p className="text-[11px] text-gray-500 leading-relaxed">
                              <strong className="text-gray-400">Bo3 Formula:</strong>{' '}
                              P<sub>match</sub> = P(WW) + P(WLW) + P(LWW) = P₁·P₂ + P₁·(1−P₂)·P₃ + (1−P₁)·P₂·P₃ → simplifies to <strong className="text-amber-500/80">P²(3 − 2P)</strong> when uniform.
                            </p>
                          )}
                        </div>
                      </section>

                      {/* Quantum Weight Distribution */}
                      <section className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl">
                        <h3 className="font-bold flex items-center gap-2 mb-2 uppercase tracking-widest text-xs">
                          <Cpu className="text-amber-500" size={16} />
                          Quantum Weight Distribution
                        </h3>
                        <p className="text-[11px] text-gray-500 mb-6">
                          Card quality tiers based on functional role coverage. {isPostSideboard ? 'Showing post-sideboard composition.' : 'Showing main deck composition.'}
                        </p>
                        <div className="h-48">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={quantumWeightData} layout="vertical">
                              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" horizontal={false} />
                              <XAxis type="number" stroke="#4b5563" fontSize={10} axisLine={false} tickLine={false} />
                              <YAxis type="category" dataKey="name" stroke="#4b5563" fontSize={9} width={110} axisLine={false} tickLine={false} />
                              <Tooltip
                                contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '20px' }}
                                formatter={(value: number) => [`${value} cards`, 'Count']}
                              />
                              <Bar dataKey="count" radius={[0, 8, 8, 0]}>
                                {quantumWeightData.map((entry, index) => (
                                  <Cell key={index} fill={entry.color} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                        <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-4">
                          {quantumWeightData.map(tier => (
                            <div key={tier.name} className="text-center">
                              <p className="text-lg font-black font-mono" style={{ color: tier.color }}>{tier.count}</p>
                              <p className="text-[8px] font-bold text-gray-600 uppercase">{tier.name}</p>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Match Win Paths */}
                      <section className="bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl">
                        <h3 className="font-bold flex items-center gap-2 mb-6 uppercase tracking-widest text-xs">
                          <Target className="text-amber-500" size={16} />
                          Match Win Paths
                        </h3>
                        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                          {[
                            { path: 'W → W', desc: '2-0 Sweep', prob: tournamentAnalysis.P_g1 * tournamentAnalysis.P_g2_afterWin },
                            { path: 'W → L → W', desc: '2-1 Comeback', prob: tournamentAnalysis.P_g1 * (1 - tournamentAnalysis.P_g2_afterWin) * tournamentAnalysis.P_g3 },
                            { path: 'L → W → W', desc: '2-1 Reverse', prob: (1 - tournamentAnalysis.P_g1) * tournamentAnalysis.P_g2_afterLoss * tournamentAnalysis.P_g3 },
                          ].map(s => (
                            <div key={s.path} className="bg-gray-950 border border-gray-800 rounded-2xl p-5 space-y-2">
                              <p className="text-lg font-black font-mono text-amber-500">{s.path}</p>
                              <p className="text-[10px] text-gray-600">{s.desc}</p>
                              <p className="text-2xl font-black font-mono text-gray-300">{(s.prob * 100).toFixed(2)}%</p>
                            </div>
                          ))}
                        </div>
                      </section>

                      {/* Swiss Distribution Chart */}
                      <section className="bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl">
                        <div className="flex items-center justify-between mb-2">
                          <h3 className="font-bold flex items-center gap-2 uppercase tracking-widest text-xs">
                            <Activity className="text-amber-500" size={16} />
                            Swiss Round Distribution
                          </h3>
                          {staminaFactor && (
                            <span className="text-[9px] font-black uppercase tracking-widest text-amber-500 bg-amber-500/10 px-3 py-1 rounded-full border border-amber-500/20">
                              Stamina Active
                            </span>
                          )}
                        </div>
                        <p className="text-[11px] text-gray-500 mb-8">
                          Probability of each final record across {tournamentRounds} rounds.
                          {staminaFactor && ' Late-round fatigue (2-3% variance penalty) applied to final rounds.'}
                        </p>
                        <div className="h-72">
                          <ResponsiveContainer width="100%" height="100%">
                            <BarChart data={tournamentAnalysis.roundsDist}>
                              <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                              <XAxis dataKey="record" stroke="#4b5563" fontSize={10} axisLine={false} tickLine={false} />
                              <YAxis stroke="#4b5563" fontSize={10} tickFormatter={(v: number) => `${(v * 100).toFixed(0)}%`} axisLine={false} tickLine={false} />
                              <Tooltip contentStyle={{ backgroundColor: '#111827', border: '1px solid #374151', borderRadius: '20px' }} formatter={(value: number) => [`${(value * 100).toFixed(2)}%`, 'Probability']} labelStyle={{ fontWeight: 900, textTransform: 'uppercase', fontSize: '12px' }} />
                              <Bar dataKey="prob" radius={[8, 8, 0, 0]}>
                                {tournamentAnalysis.roundsDist.map((entry, index) => (
                                  <Cell key={index} fill={entry.wins >= topCutThreshold ? '#f59e0b' : '#374151'} />
                                ))}
                              </Bar>
                            </BarChart>
                          </ResponsiveContainer>
                        </div>
                      </section>
                    </>
                  ) : (
                    <div className="bg-gray-900 border border-gray-800 rounded-3xl p-12 shadow-2xl text-center">
                      <AlertTriangle className="text-amber-500 mx-auto mb-4" size={48} />
                      <h3 className="text-lg font-black uppercase tracking-tight mb-2">No Win Conditions Defined</h3>
                      <p className="text-sm text-gray-500">Head to the <strong className="text-gray-300">Solve</strong> tab and create at least one Win State before running tournament analysis.</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}
        </div>
      </main>

      {showTutorial && (
        <TutorialModal
          onClose={() => setShowTutorial(false)}
          onJump={(tab) => {
            setActiveTab(tab);
            setShowTutorial(false);
          }}
        />
      )}

      {/* Report Modal */}
      {isReportOpen && (
        <div className="fixed inset-0 z-[100] bg-black/80 backdrop-blur-xl flex items-center justify-center p-4 lg:p-12 animate-in fade-in duration-300">
          <div className="bg-gray-900 border border-gray-800 w-full max-w-5xl max-h-full overflow-hidden rounded-[2.5rem] shadow-2xl flex flex-col">
            <header className="p-8 border-b border-gray-800 flex justify-between items-center">
              <div className="flex items-center gap-4">
                <FileText className="text-amber-500" size={28} />
                <div>
                  <h2 className="text-2xl font-black uppercase tracking-tighter">Stochastic Intel</h2>
                  <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">Engine Version 2.5</p>
                </div>
              </div>
              <button onClick={() => setIsReportOpen(false)} className="p-3 text-gray-400 hover:text-white rounded-2xl transition-all">
                <X size={24} />
              </button>
            </header>
            
            <div className="flex-1 overflow-y-auto p-8 space-y-12 no-scrollbar">
              <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
                <div className="space-y-4">
                  <h3 className="text-sm font-black text-amber-500 uppercase tracking-widest flex items-center gap-2">
                    <Zap size={16} /> Velocity Analysis
                  </h3>
                  <div className="bg-gray-950 rounded-3xl border border-gray-800 overflow-hidden">
                    <table className="w-full text-left text-sm">
                      <thead className="bg-gray-900 border-b border-gray-800 text-[10px] font-black uppercase text-gray-500">
                        <tr>
                          <th className="px-6 py-3">Event</th>
                          <th className="px-6 py-3 text-right">Go 1st</th>
                          <th className="px-6 py-3 text-right">Go 2nd</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-gray-800">
                        {conditions.map(c => {
                          const d1 = startHand + (currentPreset.drawOnTurnOneFirst ? 1 : 0);
                          const d2 = startHand + (currentPreset.drawOnTurnOneSecond ? 1 : 0);
                          return (
                            <tr key={c.id}>
                              <td className="px-6 py-4 font-bold uppercase text-[11px]">{c.name}</td>
                              <td className="px-6 py-4 text-right font-mono text-amber-500">{(calculateStepProb(d1, c) * 100).toFixed(1)}%</td>
                              <td className="px-6 py-4 text-right font-mono text-amber-500">{(calculateStepProb(d2, c) * 100).toFixed(1)}%</td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="space-y-4">
                  <h3 className="text-sm font-black text-blue-500 uppercase tracking-widest flex items-center gap-2">
                    <Trophy size={16} /> Match Resilience
                  </h3>
                  <div className="grid grid-cols-1 gap-4">
                    <ReportStat label="Match Win Theory" value={`${((tournamentAnalysis?.P_match ?? 0) * 100).toFixed(1)}%`} desc="Bo3 win expectancy." />
                    <ReportStat label="Match Consistency" value={`${((tournamentAnalysis?.matchConsistency ?? 0) * 100).toFixed(1)}%`} desc="Prob of playable hand across Bo3 match." />
                  </div>
                </div>
              </section>

              <section className="bg-gray-950 rounded-3xl border border-gray-800 p-8 space-y-4">
                <h3 className="text-sm font-black text-indigo-500 uppercase tracking-widest flex items-center gap-2">
                  <Cpu size={16} /> Mathematics of Strategy
                </h3>
                <p className="text-sm text-gray-500 leading-relaxed">
                  The solver utilizes the <strong>Multivariate Hypergeometric Distribution</strong>, calculating the probability of drawing specific role-counts from a non-replacing population. 
                  Mulligan adjustments are modeled as a joint probability shift: 
                  <code className="bg-gray-900 px-2 py-1 rounded ml-1">P(S_adj) = P(S_0) + (1 - P(K_0)) * P(S_1)</code>, 
                  where <code className="bg-gray-900 px-1 rounded">K_0</code> represents the keep criteria.
                </p>
              </section>
            </div>

            <footer className="p-8 border-t border-gray-800 flex justify-end bg-gray-900/50">
              <button onClick={downloadReport} className="bg-amber-500 hover:bg-amber-400 text-gray-950 px-8 py-3 rounded-2xl font-black uppercase text-xs tracking-widest flex items-center gap-2 shadow-xl">
                <Download size={18} /> Export Intel (.md)
              </button>
            </footer>
          </div>
        </div>
      )}

      {/* Footer */}
      <footer className="bg-gray-900 border-t border-gray-800 px-8 py-4 flex flex-col md:flex-row items-center justify-between text-[10px] text-gray-600 uppercase tracking-widest font-black z-10 shadow-2xl">
        <div className="flex gap-8 items-center">
          <div className="flex items-center gap-3">
            <div className="w-2.5 h-2.5 rounded-full bg-green-500 shadow-[0_0_10px_#22c55e]"></div>
            <span>Exact Multivar Solution</span>
          </div>
          <span className="hidden sm:inline">V2.5 STOCHASTIC_CORE</span>
        </div>
        <span>© {new Date().getFullYear()} DUELIST SAINT LABS</span>
      </footer>
    </div>
  );
}

// --- Helper Components ---

function TutorialModal({
  onClose,
  onJump,
}: {
  onClose: () => void;
  onJump: (tab: 'deck' | 'game' | 'results' | 'tournament') => void;
}) {
  return (
    <div className="fixed inset-0 z-[120] bg-black/70 backdrop-blur-sm p-4 flex items-center justify-center">
      <div className="w-full max-w-3xl max-h-[90vh] overflow-y-auto no-scrollbar bg-gray-900 border border-gray-800 rounded-3xl shadow-2xl p-6 md:p-8 space-y-5">
        <div className="flex items-center justify-between">
          <h3 className="text-sm md:text-base font-black uppercase tracking-widest text-amber-500">Quick Tutorial</h3>
          <button onClick={onClose} className="p-2 rounded-xl text-gray-500 hover:text-white hover:bg-gray-800">
            <X size={16} />
          </button>
        </div>

        <p className="text-sm text-gray-400 leading-relaxed">
          You can use this tool without doing manual math. Fill in your deck parts, define what a good hand means, then read percentages.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <TutorialStep
            step="1"
            title="Build Deck"
            text="In Deck tab, add card groups (Atoms), set quantities, and assign roles like Starter/Brick."
            actionLabel="Go to Deck"
            onAction={() => onJump('deck')}
          />
          <TutorialStep
            step="2"
            title="Set Rules"
            text="In Game tab, choose format, deck size, starting hand, and optional mulligan behavior."
            actionLabel="Go to Game"
            onAction={() => onJump('game')}
          />
          <TutorialStep
            step="3"
            title="Define Good Hand"
            text="In Solve tab, set the conditions that count as playable or full combo."
            actionLabel="Go to Solve"
            onAction={() => onJump('results')}
          />
          <TutorialStep
            step="4"
            title="Read Tournament Odds"
            text="In Tournament tab, compare Game 1 vs post-sideboard and track expected match performance."
            actionLabel="Go to Tournament"
            onAction={() => onJump('tournament')}
          />
        </div>
      </div>
    </div>
  );
}

function TutorialStep({
  step,
  title,
  text,
  actionLabel,
  onAction,
}: {
  step: string;
  title: string;
  text: string;
  actionLabel: string;
  onAction: () => void;
}) {
  return (
    <div className="bg-gray-950 border border-gray-800 rounded-2xl p-4 space-y-3">
      <div className="flex items-center gap-2">
        <span className="w-6 h-6 rounded-full bg-amber-500 text-gray-950 text-xs font-black flex items-center justify-center">{step}</span>
        <h4 className="text-xs font-black uppercase tracking-widest">{title}</h4>
      </div>
      <p className="text-xs text-gray-400 leading-relaxed">{text}</p>
      <button
        onClick={onAction}
        className="px-3 py-2 rounded-xl text-[10px] font-black uppercase tracking-widest bg-gray-900 border border-gray-700 text-gray-300 hover:border-amber-500 hover:text-amber-400"
      >
        {actionLabel}
      </button>
    </div>
  );
}

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 px-3 md:px-6 py-2.5 rounded-2xl text-[10px] md:text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
        active 
          ? 'bg-amber-500 text-gray-950 shadow-2xl scale-105' 
          : 'text-gray-500 hover:text-white hover:bg-gray-800 active:scale-95'
      }`}
    >
      {icon}
      <span>{label}</span>
    </button>
  );
}

function ContextButton({ active, onClick, title, subtitle, icon }: { active: boolean, onClick: () => void, title: string, subtitle: string, icon: React.ReactNode }) {
  return (
    <button 
      onClick={onClick}
      className={`px-6 py-5 rounded-[2rem] border-2 flex items-center justify-between transition-all group ${
        active 
          ? 'bg-amber-500/5 border-amber-500 shadow-2xl' 
          : 'bg-gray-950 border-gray-800 opacity-40 hover:opacity-100'
      }`}
    >
      <div className="flex items-center gap-5">
        <div className={`p-3 rounded-2xl transition-all ${active ? 'bg-amber-500 text-gray-950 shadow-lg' : 'bg-gray-800'}`}>
          {icon}
        </div>
        <div className="text-left">
          <div className="font-black text-lg uppercase tracking-tight">{title}</div>
          <div className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">{subtitle}</div>
        </div>
      </div>
      <CheckCircle2 className={`transition-all duration-500 ${active ? 'text-amber-500 scale-125' : 'text-transparent'}`} />
    </button>
  );
}

function TutorialCard({ icon, title, description }: { icon: React.ReactNode, title: string, description: string }) {
  return (
    <div className="bg-gray-900 border border-gray-800 p-8 rounded-[2.5rem] space-y-6 hover:border-amber-500/50 transition-all group shadow-2xl">
      <div className="bg-gray-950 p-5 rounded-2xl w-fit group-hover:bg-amber-500 group-hover:text-gray-950 transition-all">
        {icon}
      </div>
      <h3 className="text-2xl font-black text-gray-100 uppercase tracking-tighter">{title}</h3>
      <p className="text-sm text-gray-400 leading-relaxed font-medium">{description}</p>
    </div>
  );
}

function ProbabilitySlider({ label, value, onChange }: { label: string, value: number, onChange: (v: number) => void }) {
  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center text-[10px] font-black uppercase tracking-[0.2em]">
        <label className="text-gray-500">{label}</label>
        <span className="font-mono text-amber-500 bg-amber-500/10 px-3 py-1 rounded-xl border border-amber-500/20 shadow-inner">{(value * 100).toFixed(0)}%</span>
      </div>
      <input 
        type="range" 
        min="0" 
        max="1" 
        step="0.01" 
        value={value}
        onChange={(e) => onChange(parseFloat(e.target.value))}
        className="w-full h-2 bg-gray-950 rounded-full appearance-none cursor-pointer accent-amber-500 hover:accent-amber-400 transition-all"
      />
    </div>
  );
}

function ReportStat({ label, value, desc }: { label: string, value: string, desc: string }) {
  return (
    <div className="bg-gray-900/50 p-6 rounded-3xl border border-gray-800">
      <p className="text-[10px] font-black uppercase text-gray-500 mb-1">{label}</p>
      <p className="text-3xl font-black text-blue-500 font-mono mb-2">{value}</p>
      <p className="text-[10px] text-gray-600 italic leading-snug">{desc}</p>
    </div>
  );
}
