<template>
  <main class="title">
    <BoardBackdrop />

    <div class="chip">
      <span class="pins top" aria-hidden="true" />
      <span class="pins bottom" aria-hidden="true" />
      <span class="dot" aria-hidden="true" />
      <h1>Singularity <span>R&amp;D</span></h1>
      <div class="buttons">
        <template v-if="fresh">
          <button type="button" class="primary" @click="ui.leaveTitle('start')">▶ Start</button>
        </template>
        <template v-else>
          <button type="button" class="primary" @click="ui.leaveTitle('continue')">▶ Continue</button>
          <button type="button" @click="startOver">New game</button>
        </template>
      </div>
      <p v-if="!fresh" class="saved num">Saved game · Phase {{ game.state.phase.n }} · Week {{ game.state.week }}</p>
    </div>
  </main>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import BoardBackdrop from './BoardBackdrop.vue'

const game = useGameStore()
const ui = useUiStore()

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
