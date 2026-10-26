<template>
  <section class="faults" aria-label="Before you press">
    <header class="head">
      <h2>Faults</h2>
      <span class="num count" :class="worst">{{ total }}</span>
    </header>
    <ul class="plain-list">
      <li v-if="game.jev.kind !== 'ready'" :class="game.jev.kind === 'checking' ? 'info' : 'bad'">
        <Led :tone="game.jev.kind === 'checking' ? 'warn' : 'bad'" :blink="game.jev.kind === 'checking'" />
        <span class="text">
          <template v-if="game.jev.kind === 'checking'">Connecting to Jev…</template>
          <template v-else-if="game.jev.kind === 'unconfigured'">Jev isn’t configured. Weeks still run, but proposals need Jev.</template>
          <template v-else>Can’t reach Jev. {{ game.jev.message }}</template>
        </span>
        <span v-if="game.jev.kind !== 'checking'" class="fixes">
          <button class="link" @click="ui.openSheet({ kind: 'jev' })">Setup</button>
          <button class="link" @click="game.checkJev()">Retry</button>
        </span>
      </li>
      <li v-for="a in shown" :key="a.key" :class="a.tone">
        <Led :tone="a.tone === 'info' ? 'info' : a.tone" />
        <span class="text">{{ a.text }}</span>
        <span v-if="a.tasks?.length || a.prompt" class="fixes">
          <button v-for="t in a.tasks ?? []" :key="t.taskId" class="link task" @click="game.assignRest(t.unitId, t.taskId)">
            {{ t.label }}
          </button>
          <button v-if="a.prompt" class="link" @click="follow(a)">{{ a.prompt.label }}</button>
        </span>
      </li>
      <li v-if="game.alerts.length > LIMIT" class="info more">
        <button class="link" @click="all = !all">
          {{ all ? 'Show fewer' : `${game.alerts.length - shown.length} more` }}
        </button>
      </li>
      <li v-if="!game.alerts.length" class="calm">
        <Led tone="good" />
        <span class="text muted">All clear. Next week will go as previewed.</span>
      </li>
    </ul>
  </section>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { Alert } from '@/engine/alerts'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Led from '../kit/StatusLed.vue'

const LIMIT = 6
const game = useGameStore()
const ui = useUiStore()
const all = ref(false)
const shown = computed(() => (all.value ? game.alerts : game.alerts.slice(0, LIMIT)))
const total = computed(() => game.alerts.length + (game.jev.kind === 'ready' ? 0 : 1))
const worst = computed(() => {
  if (game.jev.kind === 'error' || game.jev.kind === 'unconfigured') return 'bad'
  return game.alerts[0]?.tone ?? 'good'
})

function follow(a: Alert) {
  if (a.prompt) ui.follow(a.prompt.to)
}
</script>

<style scoped>
.faults {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.count {
  font-size: 12px;
  min-width: 22px;
  text-align: center;
  padding: 0 4px;
  background: var(--lcd-bg);
  border: 1px solid #000;
  color: var(--lcd-fg);
}

.count.bad {
  color: var(--led-r);
}

.count.warn {
  color: var(--led-a);
}

ul {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

li {
  display: grid;
  grid-template-columns: 12px minmax(0, 1fr);
  gap: 2px 7px;
  align-items: baseline;
  padding: 5px 7px;
  font-size: 12.5px;
  line-height: 1.3;
  background: rgb(0 0 0 / 0.22);
  border-left: 2px solid var(--chrome-3);
}

li.bad {
  border-left-color: var(--led-r);
}

li.warn {
  border-left-color: var(--led-a);
}

li.info {
  border-left-color: var(--led-b);
}

li.more,
li.calm {
  background: none;
}

li.more {
  display: block;
  padding: 0;
  border: 0;
}

li :deep(.led) {
  align-self: center;
}

.fixes {
  grid-column: 2;
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}

.task {
  color: var(--silk);
}
</style>
