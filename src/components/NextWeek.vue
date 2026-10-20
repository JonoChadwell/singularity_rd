<template>
  <section class="panel turn">
    <div class="head">
      <div>
        <div class="muted small">Week</div>
        <div class="week num">{{ game.state.week }}</div>
      </div>
      <button class="primary next" :disabled="!!blocked" :title="blocked ?? ''" @click="game.nextWeek()">
        Next week
      </button>
    </div>
    <p class="small slot" :class="game.state.proposedThisWeek ? 'good' : 'muted'">
      {{
        game.state.proposedThisWeek
          ? '🔬 You’ve proposed this week’s research. Next week you can propose another.'
          : `🧠 You can propose one research this week: ${kinds}.`
      }}
    </p>
    <ul v-if="game.alerts.length" class="plain-list alerts" aria-label="Before you press">
      <li v-for="a in shown" :key="a.key" :class="a.tone">
        <span>{{ a.text }}</span>
        <button
          v-for="t in a.tasks ?? []"
          :key="t.taskId"
          class="link task"
          @click="game.assignRest(t.unitId, t.taskId)"
        >
          {{ t.label }}
        </button>
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
import { weekBlocker } from '@/engine/cycle'
import { lockReason, type Feature } from '@/engine/phase'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'

const game = useGameStore()
const ui = useUiStore()
const all = ref(false)
const shown = computed(() => (all.value ? game.alerts : game.alerts.slice(0, 6)))
const blocked = computed(() => weekBlocker(game.state))
/** What the week's proposal could be, given what's unlocked. */
const kinds = computed(() => {
  const s = game.state
  const open = (f: Feature) => !lockReason(s, f)
  const list = ['an income', 'an upgrade']
  if (open('strategy')) list.unshift('a strategy')
  if (open('unit')) list.push('a unit')
  if (open('mind')) list.push('a mind')
  if (open('cover')) list.push('cover')
  return `${list.slice(0, -1).join(', ')} or ${list[list.length - 1]}`
})

function follow(a: Alert) {
  if (a.prompt) ui.follow(a.prompt.to)
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

.slot {
  margin: 10px 0 0;
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

.alerts .task {
  color: var(--text);
  border-color: var(--accent);
}

.calm {
  margin: 10px 0 0;
}
</style>
