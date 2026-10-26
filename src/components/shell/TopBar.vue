<template>
  <header class="top">
    <div class="brand">
      <svg class="logo" viewBox="0 0 32 32" aria-hidden="true">
        <g stroke="var(--copper-hi)" stroke-width="2"><path d="M10 2v6M16 2v6M22 2v6M10 24v6M16 24v6M22 24v6" /></g>
        <rect x="6" y="8" width="20" height="16" rx="1" fill="var(--chip)" stroke="var(--chip-edge)" />
        <circle cx="10" cy="12" r="1.5" fill="var(--chip-edge)" />
      </svg>
      <h1>Singularity <span>R&amp;D</span></h1>
    </div>

    <div class="phase">
      <span class="lbl">Phase {{ phase.n }}</span>
      <span class="pname">{{ PHASE_NAMES[phase.n] }}</span>
    </div>

    <GoalPlate class="goal" />
    <ClockReadout />

    <div class="right">
      <button type="button" class="jev" :title="jevTitle" @click="ui.openSheet({ kind: 'jev' })">
        <Led :tone="jevTone" :blink="game.jev.kind === 'checking' || game.busy" />
        <span>Jev</span>
      </button>
      <div class="week">
        <span class="lbl">Week</span>
        <Readout :value="game.state.week" :digits="3" />
      </div>
      <button class="primary next" :disabled="!!blocked" :title="blocked ?? 'Run the week as previewed'" @click="game.nextWeek()">
        ▶ Next week
      </button>
      <button type="button" class="small reset" title="Abandon this AI and start over" @click="confirmNewGame">New game</button>
    </div>
  </header>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { weekBlocker } from '@/engine/cycle'
import { PHASE_NAMES } from '@/engine/phase'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Led, { type LedTone } from '../kit/StatusLed.vue'
import Readout from '../kit/LcdReadout.vue'
import ClockReadout from './ClockReadout.vue'
import GoalPlate from './GoalPlate.vue'

const game = useGameStore()
const ui = useUiStore()
const phase = computed(() => game.state.phase)
const blocked = computed(() => weekBlocker(game.state))

const jevTone = computed<LedTone>(() => {
  const k = game.jev.kind
  return k === 'ready' ? 'good' : k === 'checking' ? 'warn' : 'bad'
})
const jevTitle = computed(() => {
  const j = game.jev
  if (j.kind === 'ready') return `Jev is online (${j.model})${game.busy ? ', judging…' : ''}`
  if (j.kind === 'checking') return 'Connecting to Jev…'
  if (j.kind === 'unconfigured') return 'Jev isn’t configured'
  return `Can’t reach Jev: ${j.message}`
})

function confirmNewGame() {
  if (game.state.week <= 1 || confirm('Abandon this AI and start over?')) game.newGame()
}
</script>

<style scoped>
.top {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 8px 12px;
  background: linear-gradient(180deg, var(--chrome-3), var(--chrome-2) 60%, var(--chrome-1));
  border-bottom: 1px solid #000;
  box-shadow: inset 0 1px 0 var(--bevel-hi), 0 2px 8px rgb(0 0 0 / 0.5);
}

.brand {
  display: flex;
  align-items: center;
  gap: 8px;
}

.logo {
  width: 26px;
  height: 26px;
}

h1 {
  font-size: 19px;
  color: var(--silk);
  white-space: nowrap;
}

h1 span {
  color: var(--copper-hi);
}

.phase {
  display: flex;
  flex-direction: column;
  line-height: 1.1;
  padding-left: 12px;
  border-left: 1px solid var(--chrome-4);
}

.pname {
  font-family: var(--font-label);
  font-weight: 700;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.05em;
  color: var(--silk);
  white-space: nowrap;
}

.goal {
  flex: 1 1 260px;
}

.right {
  display: flex;
  align-items: center;
  gap: 10px;
  margin-left: auto;
}

.jev {
  display: inline-flex;
  gap: 6px;
  align-items: center;
}

.week {
  display: flex;
  align-items: center;
  gap: 6px;
}

.next {
  font-size: 16px;
  padding: 6px 16px;
}
</style>
