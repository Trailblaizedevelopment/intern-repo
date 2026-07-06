export type SkyPhase = 'night' | 'dawn' | 'day' | 'dusk';

export interface DayNightState {
  phase: SkyPhase;
  /** 0–1 over the 24h clock (noon ≈ 0.5). */
  cycle: number;
  hour: number;
  lampOn: boolean;
  starsVisible: boolean;
  sunVisible: boolean;
  moonVisible: boolean;
  birdsActive: boolean;
}

export interface SkyColors {
  top: string;
  mid: string;
  horizon: string;
  ground: string;
  glow: string;
}

const SKY: Record<SkyPhase, SkyColors> = {
  day: {
    top: '#0284C7',
    mid: '#38BDF8',
    horizon: '#BAE6FD',
    ground: '#15803D',
    glow: 'rgba(255, 220, 160, 0.28)',
  },
  dawn: {
    top: '#7C2D12',
    mid: '#F97316',
    horizon: '#FDE68A',
    ground: '#166534',
    glow: 'rgba(255, 200, 140, 0.32)',
  },
  dusk: {
    top: '#7C2D12',
    mid: '#EA580C',
    horizon: '#FDBA74',
    ground: '#14532D',
    glow: 'rgba(255, 180, 120, 0.3)',
  },
  night: {
    top: '#020617',
    mid: '#0F172A',
    horizon: '#1E293B',
    ground: '#0B1120',
    glow: 'rgba(255, 200, 150, 0.15)',
  },
};

export function resolveSkyPhase(hourFloat: number): SkyPhase {
  if (hourFloat >= 6 && hourFloat < 8) return 'dawn';
  if (hourFloat >= 8 && hourFloat < 17) return 'day';
  if (hourFloat >= 17 && hourFloat < 20) return 'dusk';
  return 'night';
}

export function getDayNightState(now = new Date()): DayNightState {
  const hourFloat = now.getHours() + now.getMinutes() / 60 + now.getSeconds() / 3600;
  const phase = resolveSkyPhase(hourFloat);
  const cycle = hourFloat / 24;

  return {
    phase,
    cycle,
    hour: now.getHours(),
    lampOn: phase === 'night' || phase === 'dusk',
    starsVisible: phase === 'night' || phase === 'dusk',
    sunVisible: phase === 'day' || phase === 'dawn' || phase === 'dusk',
    moonVisible: phase === 'night' || phase === 'dawn' || phase === 'dusk',
    birdsActive: phase === 'day' || phase === 'dawn',
  };
}

export function skyColorsForPhase(phase: SkyPhase): SkyColors {
  return SKY[phase];
}

/** Sun vertical position in window (0 = top, 100 = horizon). */
export function sunPosition(cycle: number, phase: SkyPhase): number {
  if (phase === 'night') return -20;
  if (phase === 'dawn') return 55 + (cycle * 24 - 6) / 2 * 15;
  if (phase === 'dusk') return 30 - ((cycle * 24 - 17) / 3) * 25;
  const dayProgress = (cycle * 24 - 8) / 9;
  return 18 + dayProgress * 35;
}

/** Moon vertical position. */
export function moonPosition(cycle: number, phase: SkyPhase): number {
  if (phase === 'day') return -20;
  if (phase === 'dawn') return 65;
  if (phase === 'dusk') return 25;
  const nightProgress = cycle * 24 >= 20 ? (cycle * 24 - 20) / 10 : (cycle * 24 + 4) / 10;
  return 15 + nightProgress * 40;
}
