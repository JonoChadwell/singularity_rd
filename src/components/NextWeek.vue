<template>
  <section class="panel turn">
    <div class="head">
      <div>
        <div class="muted small">Week</div>
        <div class="week num">{{ game.state.week }}</div>
      </div>
      <button class="primary next" :disabled="!game.playing" @click="game.nextWeek()">Next week</button>
    </div>
    <ul v-if="game.alerts.length" class="plain-list alerts" aria-label="Before you press">
      <li v-for="a in shown" :key="a.key" :class="a.tone">
        <span>{{ a.text }}</span>
        <button v-if="a.prompt" class="link" @click="follow(a)">{{ a.prompt.label }}</button>
      </li>
      <li v-if="game.alerts.length > shown.length" class="info">
        <button class="link" @click="all = !all">
          {{ all ? 'Show fewer' : `${game.alerts.length - shown.length} more` }}
        </button>
      </li>
    </ul>
    <p v-else class="muted small calm">Nothing needs attention. Next week will go as previewed.</p>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Alert } from '@/engine/alerts'
import { findUnit } from '@/engine/model'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const game = useGameStore()
const ui = useUiStore()
const all = ref(false)
const shown = computed(() => (all.value ? game.alerts : game.alerts.slice(0, 6)))

function follow(a: Alert) {
  if (a.prompt) ui.follow(a.prompt.to, (id) => findUnit(game.state, id)?.mind ?? false)
}
</script>

<style scoped>
.turn {
  position: sticky;
  top: 8px;
  z-index: 5;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.week {
  font-size: 26px;
  line-height: 1;
}

.next {
  padding: 10px 22px;
  font-size: 15px;
}

.alerts {
  margin-top: 12px;
  display: flex;
  flex-direction: column;
  gap: 6px;
  font-size: 13px;
}

.alerts li {
  border-left: 3px solid var(--border);
  padding: 2px 0 2px 8px;
  display: flex;
  flex-wrap: wrap;
  gap: 4px 8px;
  align-items: baseline;
}

.alerts li.bad {
  border-color: var(--bad);
}

.alerts li.warn {
  border-color: var(--warn);
}

.alerts li.info {
  color: var(--muted);
}

.calm {
  margin: 10px 0 0;
}
</style>
