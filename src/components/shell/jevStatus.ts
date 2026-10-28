import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import type { LedTone } from '../kit/StatusLed.vue'

/** Jev's LED: its tone, whether it blinks, and what it means in words. */
export function useJevStatus() {
  const game = useGameStore()
  const tone = computed<LedTone>(() => {
    const k = game.jev.kind
    return k === 'ready' ? 'good' : k === 'checking' ? 'warn' : 'bad'
  })
  const blink = computed(() => game.jev.kind === 'checking' || game.busy)
  const title = computed(() => {
    const j = game.jev
    if (j.kind === 'ready') return `Jev is online (${j.model})${game.busy ? ', judging…' : ''}`
    if (j.kind === 'checking') return 'Connecting to Jev…'
    if (j.kind === 'unconfigured') return 'Jev isn’t configured'
    return `Can’t reach Jev: ${j.message}`
  })
  return { tone, blink, title }
}
