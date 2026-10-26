<template>
  <div class="status" :class="tone">
    <Led :tone="tone === 'idle' ? 'off' : tone" :blink="game.busy" />
    <p v-if="game.lastError && !ui.invent" class="msg" role="alert">{{ game.lastError }}</p>
    <p v-else-if="ui.notice" class="msg" role="status">{{ ui.notice.text }}</p>
    <p v-else class="msg idle">{{ game.busy ? 'Jev is judging…' : `Week ${game.state.week} · ready` }}</p>
    <button v-if="ui.notice && !(game.lastError && !ui.invent)" class="close link" aria-label="Dismiss" @click="ui.notice = null">✕</button>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Led from '../kit/StatusLed.vue'

const game = useGameStore()
const ui = useUiStore()
const tone = computed(() => {
  if (game.lastError && !ui.invent) return 'bad'
  if (ui.notice) return ui.notice.tone === 'good' ? 'good' : 'bad'
  return 'idle'
})
</script>

<style scoped>
.status {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 4px 10px;
  margin: 0 12px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--lcd-fg);
  background: var(--lcd-bg);
  border: 1px solid #000;
  box-shadow: inset 1px 1px 0 rgb(0 0 0 / 0.7), inset 0 0 14px rgb(0 0 0 / 0.5);
  text-shadow: 0 0 5px color-mix(in srgb, var(--lcd-fg), transparent 55%);
}

.status.bad {
  --lcd-fg: var(--led-r);
}

.msg {
  flex: 1;
  margin: 0;
  min-width: 0;
}

.msg.idle {
  opacity: 0.55;
}

.close {
  color: inherit;
  border: 0;
}
</style>
