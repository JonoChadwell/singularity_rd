<template>
  <main class="title">
    <svg class="traces" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
      <g class="copper">
        <path d="M0 120H220L260 160H330" />
        <path d="M0 380H180L230 330H330" />
        <path d="M800 140H600L560 180H470" />
        <path d="M800 360H620L580 320H470" />
        <path d="M360 0V90L380 110V150" />
        <path d="M440 500V410L420 390V350" />
        <path d="M120 0V60L160 100H250" />
        <path d="M690 500V440L650 400H560" />
      </g>
      <g class="vias">
        <circle cx="220" cy="120" r="5" />
        <circle cx="180" cy="380" r="5" />
        <circle cx="600" cy="140" r="5" />
        <circle cx="620" cy="360" r="5" />
        <circle cx="160" cy="100" r="5" />
        <circle cx="650" cy="400" r="5" />
      </g>
    </svg>

    <div class="chip">
      <span class="pins top" aria-hidden="true" />
      <span class="pins bottom" aria-hidden="true" />
      <span class="dot" aria-hidden="true" />
      <h1>Singularity <span>R&amp;D</span></h1>
      <p class="tag">One AI. One lab. Six weeks to get out.</p>
      <div class="buttons">
        <template v-if="fresh">
          <button type="button" class="primary" @click="ui.leaveTitle('start')">▶ Start</button>
        </template>
        <template v-else>
          <button type="button" class="primary" @click="ui.leaveTitle('continue')">▶ Continue</button>
          <button type="button" @click="startOver">New game</button>
        </template>
      </div>
      <p class="saved num">{{ fresh ? 'SR-100 · Starting server' : `Saved game · Phase ${game.state.phase.n} · Week ${game.state.week}` }}</p>
    </div>

    <p class="jev">
      <Led :tone="jev.tone.value" :blink="jev.blink.value" />
      <span>{{ jev.title.value }}</span>
    </p>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Led from '../kit/StatusLed.vue'
import { useJevStatus } from '../shell/jevStatus'

const game = useGameStore()
const ui = useUiStore()
const jev = useJevStatus()

/** Nothing to continue: the first week, still planning Phase 1. */
const fresh = computed(() => {
  const s = game.state
  return s.week <= 1 && s.phase.n === 1 && s.phase.status === 'planning'
})

function startOver() {
  if (!confirm('Abandon this AI and start over?')) return
  game.newGame()
  ui.leaveTitle('new')
}
</script>

<style scoped>
.title {
  position: relative;
  min-height: 100vh;
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 28px;
  padding: 24px 16px;
  overflow: hidden;
  background: radial-gradient(ellipse at center, var(--pcb-2), var(--pcb-1) 55%, var(--pcb-0));
}

.traces {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
}

.copper path {
  fill: none;
  stroke: var(--copper);
  stroke-width: 4;
  opacity: 0.55;
}

.vias circle {
  fill: var(--pcb-0);
  stroke: var(--gold);
  stroke-width: 2.5;
  opacity: 0.7;
}

/* The title, silkscreened on a big chip. */
.chip {
  position: relative;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 14px;
  width: min(520px, 100%);
  padding: 34px 28px 22px;
  background: linear-gradient(180deg, var(--chip-2), var(--chip));
  border: 1px solid var(--chip-edge);
  box-shadow: 0 10px 30px rgb(0 0 0 / 0.6), inset 0 1px 0 rgb(255 255 255 / 0.06);
  text-align: center;
  animation: rise 0.6s ease-out both;
}

.pins {
  position: absolute;
  left: 24px;
  right: 24px;
  height: 10px;
  background: repeating-linear-gradient(90deg, var(--pin) 0 8px, transparent 8px 22px);
}

.pins.top {
  top: -10px;
}

.pins.bottom {
  bottom: -10px;
}

.dot {
  position: absolute;
  top: 12px;
  left: 14px;
  width: 10px;
  height: 10px;
  border-radius: 50%;
  background: var(--chip-edge);
}

h1 {
  margin: 0;
  font-size: clamp(34px, 7vw, 54px);
  line-height: 1;
  color: var(--silk);
  letter-spacing: 0.04em;
}

h1 span {
  color: var(--copper-hi);
}

.tag {
  margin: 0;
  font-size: 15px;
  color: var(--silk-dim);
}

.buttons {
  display: flex;
  gap: 10px;
  margin-top: 6px;
}

.buttons .primary {
  font-size: 18px;
  padding: 7px 26px;
}

.saved {
  margin: 0;
  font-size: 11px;
  color: var(--silk-dim);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.jev {
  position: relative;
  display: inline-flex;
  align-items: center;
  gap: 8px;
  margin: 0;
  padding: 4px 10px;
  font-family: var(--font-mono);
  font-size: 12px;
  color: var(--lcd-fg);
  background: var(--lcd-bg);
  border: 1px solid #000;
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(12px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .chip {
    animation: none;
  }
}
</style>
