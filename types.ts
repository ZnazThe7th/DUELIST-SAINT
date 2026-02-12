
export enum TCGType {
  YUGIOH = 'Yu-Gi-Oh!',
  MTG = 'Magic: The Gathering',
  POKEMON = 'Pokémon TCG',
  ONE_PIECE = 'One Piece TCG',
  CUSTOM = 'Custom'
}

export interface MulliganConfig {
  enabled: boolean;
  type: 'none' | 'mtg' | 'one-piece' | 'pokemon';
  keepRole: string;
  keepMin: number;
  maxMulligans: number;
}

export interface GamePreset {
  type: TCGType;
  defaultDeckSize: number;
  minDeckSize: number;
  maxDeckSize: number;
  startingHandSize: number;
  drawOnTurnOneFirst: boolean;
  drawOnTurnOneSecond: boolean;
  mulliganType: 'none' | 'mtg' | 'one-piece' | 'pokemon';
}

export interface DeckAtom {
  id: string;
  name: string;
  count: number;
  roles: string[];
}

export interface RoleThreshold {
  role: string;
  minCount: number;
  maxCount: number;
}

export interface CompoundCondition {
  id: string;
  name: string;
  weight: number; 
  thresholds: RoleThreshold[]; 
}

export interface TournamentMatchConfig {
  p1: number;
  p2: number; 
  p3: number;
  rounds: number;
}

export interface CalculationResult {
  step: number;
  cardsDrawn: number;
  prob: number;
}
