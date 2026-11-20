import type { SimulationState } from './simulation';
import type { LandingId } from '../types';
export type EventName = 'demo_open' | 'profiles_change' | 'media_change' | 'step_view' | 'queue_simulated' | 'demo_reset' | 'demo_skip' | 'offer_view';
export type SyntheticEvent = { synthetic: true; schema: 1; sequence: number; name: EventName; landing: LandingId; attempt: number; step: number; profileCount: number; mediaCount: number; itemCount: number };
export type Emit = (name: EventName, state?: SimulationState) => void;
export function createEventRecorder(landing: LandingId, onEvent?: (event: SyntheticEvent) => void) {
  let sequence = 0;
  return { emit(name: EventName, state?: SimulationState) {
    onEvent?.({ synthetic: true, schema: 1, sequence: ++sequence, name, landing, attempt: state?.attempt ?? 0, step: state?.step ?? 0, profileCount: state?.profiles.length ?? 0, mediaCount: state?.media.length ?? 0, itemCount: state ? state.profiles.length * state.media.length : 0 });
  } };
}
