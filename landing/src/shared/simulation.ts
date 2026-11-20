export const PROFILES = [
  { id: 'a', name: 'Perfil exemplo A', handle: '@exemplo.estudio', monogram: 'EA', available: true, description: 'Estúdio · conteúdo editorial' },
  { id: 'b', name: 'Perfil exemplo B', handle: '@exemplo.loja', monogram: 'EB', available: true, description: 'Loja · bastidores e processos' },
  { id: 'c', name: 'Perfil exemplo C', handle: '@exemplo.criativo', monogram: 'EC', available: false, description: 'Revisar conexão para programar' },
] as const;

export const MEDIA = [
  { id: 'studio', title: 'Bastidores do estúdio', collection: 'Editorial da semana', time: '09:30', caption: 'Por trás de cada ideia, um processo. Um olhar para os bastidores do nosso estúdio.', crop: 'camera' },
  { id: 'process', title: 'O processo criativo', collection: 'Editorial da semana', time: '11:00', caption: 'Da primeira referência aos detalhes finais. Um pouco de como as ideias tomam forma.', crop: 'desk' },
] as const;

export const SCHEDULE = { date: '2026-11-19', label: '19 nov 2026', longLabel: 'Quinta-feira, 19 de novembro de 2026', timezone: 'America/Sao_Paulo', offset: 'UTC−03:00' } as const;
export type ProfileId = typeof PROFILES[number]['id'];
export type MediaId = typeof MEDIA[number]['id'];
export type Step = 1 | 2 | 3;
export type Variant = 'A' | 'B';
export type SimulationState = { profiles: ProfileId[]; media: MediaId[]; step: Step; confirmed: boolean; attempt: number };
export type Action = { type: 'profile'; id: ProfileId } | { type: 'media'; id: MediaId } | { type: 'next' } | { type: 'back' } | { type: 'step'; step: Step } | { type: 'simulate' } | { type: 'reset' };

export function initialState(attempt = 1): SimulationState {
  return { profiles: [], media: ['studio'], step: 1, confirmed: false, attempt };
}

export function simulationReducer(state: SimulationState, action: Action): SimulationState {
  if (action.type === 'reset') return initialState(state.attempt + 1);
  if (action.type === 'profile') {
    if (!PROFILES.some(profile => profile.id === action.id && profile.available)) return state;
    const selected = state.profiles.includes(action.id) ? state.profiles.filter(id => id !== action.id) : [...state.profiles, action.id];
    return { ...state, profiles: PROFILES.filter(profile => selected.includes(profile.id)).map(profile => profile.id), confirmed: false };
  }
  if (action.type === 'media') {
    const selected = state.media.includes(action.id) ? state.media.filter(id => id !== action.id) : [...state.media, action.id];
    return { ...state, media: MEDIA.filter(media => selected.includes(media.id)).map(media => media.id), confirmed: false };
  }
  if (action.type === 'next') {
    if (state.step === 1 && state.profiles.length) return { ...state, step: 2 };
    if (state.step === 2 && state.media.length && state.profiles.length) return { ...state, step: 3 };
    return state;
  }
  if (action.type === 'back') return { ...state, step: state.step === 3 ? 2 : 1, confirmed: false };
  if (action.type === 'step') {
    if (action.step > state.step) return state;
    return { ...state, step: action.step, confirmed: action.step === state.step && state.confirmed };
  }
  if (action.type === 'simulate' && state.step === 3 && state.profiles.length && state.media.length && !state.confirmed) return { ...state, confirmed: true };
  return state;
}

export function queueFor(state: SimulationState) {
  return MEDIA.filter(media => state.media.includes(media.id)).flatMap(media =>
    PROFILES.filter(profile => profile.available && state.profiles.includes(profile.id)).map(profile => ({ id: `${media.id}:${profile.id}`, media, profile, time: media.time })),
  );
}

export function plural(count: number, singular: string, multiple: string) { return `${count} ${count === 1 ? singular : multiple}`; }
