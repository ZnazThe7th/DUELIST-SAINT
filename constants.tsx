
import { TCGType, GamePreset } from './types';

export const GAME_PRESETS: Record<TCGType, GamePreset> = {
  [TCGType.YUGIOH]: {
    type: TCGType.YUGIOH,
    defaultDeckSize: 40,
    minDeckSize: 40,
    maxDeckSize: 60,
    startingHandSize: 5,
    drawOnTurnOneFirst: false,
    drawOnTurnOneSecond: true,
    mulliganType: 'none',
  },
  [TCGType.MTG]: {
    type: TCGType.MTG,
    defaultDeckSize: 60,
    minDeckSize: 60,
    maxDeckSize: 300,
    startingHandSize: 7,
    drawOnTurnOneFirst: false,
    drawOnTurnOneSecond: true,
    mulliganType: 'mtg',
  },
  [TCGType.POKEMON]: {
    type: TCGType.POKEMON,
    defaultDeckSize: 60,
    minDeckSize: 60,
    maxDeckSize: 60,
    startingHandSize: 7,
    drawOnTurnOneFirst: true,
    drawOnTurnOneSecond: true,
    mulliganType: 'pokemon',
  },
  [TCGType.ONE_PIECE]: {
    type: TCGType.ONE_PIECE,
    defaultDeckSize: 50,
    minDeckSize: 50,
    maxDeckSize: 50,
    startingHandSize: 5,
    drawOnTurnOneFirst: false,
    drawOnTurnOneSecond: true,
    mulliganType: 'one-piece',
  },
  [TCGType.CUSTOM]: {
    type: TCGType.CUSTOM,
    defaultDeckSize: 40,
    minDeckSize: 1,
    maxDeckSize: 1000,
    startingHandSize: 5,
    drawOnTurnOneFirst: false,
    drawOnTurnOneSecond: true,
    mulliganType: 'none',
  },
};

export const DEFAULT_ROLES = ["Starter", "Extender", "Brick", "Defensive", "Utility"];

export const TOURNAMENT_PRESETS = [
  { name: 'Locals', players: 50, rounds: 5, recommendedBrick: 0.15, recommendedPlayable: 0.80 },
  { name: 'Regionals', players: 500, rounds: 9, recommendedBrick: 0.10, recommendedPlayable: 0.85 },
  { name: 'YCS/Pro Tour', players: 1500, rounds: 12, recommendedBrick: 0.05, recommendedPlayable: 0.90 },
];
