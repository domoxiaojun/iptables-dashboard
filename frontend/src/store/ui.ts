import { create } from 'zustand';
import type { Family } from '@/types/api';

interface UiState {
  family: Family | 'both';
  setFamily: (f: Family | 'both') => void;
  table: string;
  setTable: (t: string) => void;
  density: 'compact' | 'comfortable';
  setDensity: (d: 'compact' | 'comfortable') => void;
}

export const useUiStore = create<UiState>((set) => ({
  family: (localStorage.getItem('iptd.family') as Family | 'both' | null) ?? 'v4',
  setFamily: (family) => {
    localStorage.setItem('iptd.family', family);
    set({ family });
  },
  table: localStorage.getItem('iptd.table') ?? 'filter',
  setTable: (table) => {
    localStorage.setItem('iptd.table', table);
    set({ table });
  },
  density:
    (localStorage.getItem('iptd.density') as 'compact' | 'comfortable' | null) ??
    'comfortable',
  setDensity: (density) => {
    localStorage.setItem('iptd.density', density);
    set({ density });
  },
}));
