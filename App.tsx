
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
  BarChart, Bar, ComposedChart, Area, Line
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
  const [activeTab, setActiveTab] = useState<'deck' | 'game' | 'tournament' | 'results' | 'help'>('deck');
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

  // Tournament
  const [winProbs, setWinProbs] = useState({ p1: 0.6, p2: 0.55, p3: 0.55 });
  const [numRounds, setNumRounds] = useState(12);

  // --- Derived ---
  const currentPreset = GAME_PRESETS[selectedTCG];
  const totalAtomCount = atoms.reduce((sum, a) => sum + a.count, 0);
  const remainingCards = deckSize - totalAtomCount;
  
  const allRoles = useMemo(() => {
    const roles = new Set<string>(DEFAULT_ROLES);
    atoms.forEach(a => a.roles.forEach(r => roles.add(r)));
    return Array.from(roles);
  }, [atoms]);

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

  const tournamentResults = useMemo(() => {
    const { p1, p2, p3 } = winProbs;
    const pMatch = (p1 * p2) + (p1 * (1 - p2) * p3) + ((1 - p1) * p2 * p3);
    const roundsDist = [];
    for (let w = 0; w <= numRounds; w++) {
      roundsDist.push({ wins: w, prob: binomProb(numRounds, w, pMatch) });
    }
    return { pMatch, roundsDist };
  }, [winProbs, numRounds]);

  const pSeePlayableInMatch = useMemo(() => {
    if (conditions.length === 0) return 0;
    const q1 = calculateStepProb(startHand, conditions[0]);
    const pNoHitMatch = Math.pow(1 - q1, 2.5);
    return 1 - pNoHitMatch;
  }, [timelineData]);

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
    content += `- Rounds: ${numRounds}\n`;
    content += `- Predicted Match Win Rate: ${(tournamentResults.pMatch * 100).toFixed(2)}%\n`;
    content += `- Expected Match Consistency: ${(pSeePlayableInMatch * 100).toFixed(2)}%\n\n`;

    content += `## 4. MATHEMATICAL APPENDIX\n`;
    content += `Calculated using Multivariate Hypergeometric Engine.\n`;

    return content;
  };

  return (
    <div className="flex flex-col h-screen overflow-hidden text-gray-100 bg-gray-950">
      {/* Navbar */}
      <header className="bg-gray-900 border-b border-gray-800 px-6 py-4 flex flex-col md:flex-row items-center justify-between sticky top-0 z-50 gap-4 shadow-2xl">
        <div className="flex items-center gap-3">
          <div className="bg-amber-500 p-2 rounded-lg shadow-lg shadow-amber-500/20">
            <TrendingUp className="text-gray-950 w-6 h-6" />
          </div>
          <h1 className="text-xl font-extrabold tracking-tight">
            DUELIST <span className="text-amber-500">SAINT</span>
          </h1>
        </div>
        <nav className="flex items-center gap-1 bg-gray-950 p-1 rounded-xl border border-gray-800 overflow-x-auto max-w-full no-scrollbar">
          <TabButton active={activeTab === 'deck'} onClick={() => setActiveTab('deck')} icon={<Database size={18} />} label="Deck" />
          <TabButton active={activeTab === 'game'} onClick={() => setActiveTab('game')} icon={<Settings size={18} />} label="Game" />
          <TabButton active={activeTab === 'tournament'} onClick={() => setActiveTab('tournament')} icon={<Trophy size={18} />} label="Meta" />
          <TabButton active={activeTab === 'results'} onClick={() => setActiveTab('results')} icon={<Play size={18} />} label="Solve" />
          <TabButton active={activeTab === 'help'} onClick={() => setActiveTab('help')} icon={<BookOpen size={18} />} label="Help" />
        </nav>
      </header>

      {/* Main Content Area */}
      <main className="flex-1 overflow-y-auto bg-gray-950 p-4 lg:p-8 no-scrollbar scroll-smooth">
        <div className="max-w-7xl mx-auto space-y-6 pb-20">
          
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
                  <h3 className="font-bold flex items-center gap-2 mb-6 uppercase tracking-widest text-xs">
                    <Activity className="text-amber-500" size={16} />
                    Composition Saturation
                  </h3>
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
                <h3 className="font-bold flex items-center gap-3 text-lg uppercase tracking-tight">
                  <Settings className="text-amber-500" size={24} />
                  Structural Params
                </h3>
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
                  onClick={() => setIsReportOpen(true)}
                  className="bg-indigo-600 hover:bg-indigo-500 text-white px-6 py-2.5 rounded-2xl text-xs font-black uppercase tracking-widest flex items-center gap-2 transition-all shadow-xl active:scale-95"
                 >
                   <FileText size={16} /> Get Stochastic Report
                 </button>
              </div>

              <div className="flex flex-col md:flex-row gap-6">
                <section className="md:w-1/3 bg-gray-900 border border-gray-800 rounded-3xl p-6 shadow-2xl h-fit sticky top-24">
                   <div className="flex items-center justify-between mb-8">
                    <h3 className="font-bold flex items-center gap-2 text-lg">
                      <Target className="text-amber-500" size={24} />
                      Win States
                    </h3>
                    <button onClick={addCondition} className="p-2 bg-amber-500 text-gray-950 rounded-xl hover:bg-amber-400 transition-all active:scale-95">
                      <Plus size={20} />
                    </button>
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
                                   {allRoles.map(r => <option key={r} value={r} className="bg-gray-900">{r}</option>)}
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
                            onClick={() => setConditions(conditions.map(cond => cond.id === c.id ? { ...cond, thresholds: [...cond.thresholds, { role: allRoles[0], minCount: 1, maxCount: deckSize }] } : cond))}
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
                  <section className="bg-gray-900 border border-gray-800 rounded-3xl p-8 shadow-2xl relative overflow-hidden">
                    <div className="flex items-center justify-between mb-10">
                      <div className="flex items-center gap-4">
                         <div className={`p-3 rounded-2xl transition-all ${isQuantumMode ? 'bg-indigo-500 text-gray-950 shadow-xl' : 'bg-gray-800 text-gray-400'}`}>
                           <Cpu size={28} />
                         </div>
                         <div>
                            <h3 className="font-black text-lg uppercase tracking-tight">
                              {isQuantumMode ? 'Quantum Expected Value' : 'Success Projections'}
                            </h3>
                            <p className="text-[10px] font-bold text-gray-500 uppercase tracking-widest">10-Turn Stochastic Horizon</p>
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

                    <div className="h-96 md:h-[500px]">
                      <ResponsiveContainer width="100%" height="100%">
                        <ComposedChart data={timelineData}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#1f2937" vertical={false} />
                          <XAxis dataKey="step" stroke="#4b5563" fontSize={10} fontStyle="bold" axisLine={false} tickLine={false} />
                          <YAxis 
                            stroke="#4b5563" 
                            fontSize={10} 
                            unit={isQuantumMode ? "" : "%"} 
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
                                stroke={i === 0 ? "#f59e0b" : i === 1 ? "#6366f1" : "#10b981"} 
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
              </div>
            </div>
          )}
        </div>
      </main>

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
                    <ReportStat label="Match Win Theory" value={`${(tournamentResults.pMatch * 100).toFixed(1)}%`} desc="Bo3 win expectancy." />
                    <ReportStat label="Hand Consistency" value={`${(pSeePlayableInMatch * 100).toFixed(1)}%`} desc="Prob seeing success in Bo3 set." />
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

function TabButton({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-3 px-6 py-2.5 rounded-2xl text-[11px] font-black uppercase tracking-widest transition-all whitespace-nowrap ${
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
