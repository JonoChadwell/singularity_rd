<template>
  <div class="projects">
    <p class="muted small intro">
      Only groups whose effective IQ clears a project’s bar help. Machines of one type pool: +5% IQ for every
      tenfold. Ten times the machines is about three times the speed.
    </p>
    <article v-for="p in projects" :key="p.id" class="project" :class="{ final: p.effect.kind === 'final' }">
      <header class="head">
        <span class="icon">{{ p.icon }}</span>
        <div class="title">
          <strong>{{ p.name }}</strong>
          <div class="muted small">{{ p.description }}</div>
        </div>
        <div class="facts small">
          <span class="chip iq">bar IQ {{ p.bar }}</span>
          <span class="chip">{{ FIELD_LABELS[p.field] }}</span>
        </div>
      </header>
      <div class="meter"><div :style="{ width: `${(p.progress / p.size) * 100}%`, background: 'var(--progress)' }" /></div>
      <div class="small row status">
        <span class="num">{{ fmt(p.progress) }} / {{ fmt(p.size) }}</span>
        <template v-if="speed(p) > 0">
          <span class="muted">· +{{ fmt(speed(p)) }} a week</span>
          <span class="good">· finishes week {{ finishWeek(game.state, p, speed(p)) }}</span>
        </template>
        <span v-else class="muted">· not progressing</span>
      </div>
      <ul v-if="groups(p).length" class="plain-list groups small">
        <li v-for="g in groups(p)" :key="g.unitId" :class="g.clears ? '' : 'bad'">
          {{ fmtCount(g.machines) }} {{ unitName(g.unitId) }}: effective IQ
          <span class="num">{{ Math.floor(g.effectiveIQ) }}</span>
          {{ g.clears ? `· +${fmt(g.speed)}/wk` : '· below the bar, contributes nothing' }}
        </li>
      </ul>
      <p v-else class="empty">Nobody is on it.</p>
      <div class="row small">
        <select class="inline" :aria-label="`Put machines on ${p.name}`" @change="put(p.id, $event)">
          <option value="">Put minds on it…</option>
          <option v-for="m in minds" :key="m.id" :value="m.id">
            {{ m.name }} ×{{ fmtCount(m.count) }}: effective IQ {{ Math.floor(effectiveIQ(m, m.count, p.field)) }}{{
              effectiveIQ(m, m.count, p.field) < p.bar ? ' (below the bar)' : ''
            }}
          </option>
        </select>
        <button
          v-if="best < p.bar && p.effect.kind !== 'final'"
          class="link"
          @click="ui.openInvent({ kind: 'unit', mind: true, targetIQ: p.bar })"
        >
          Nothing you own is smart enough. Design something that is?
        </button>
      </div>
    </article>
    <p v-if="projects.length === 1" class="empty">
      Research comes only from your ideas: design a unit, propose an advanced strategy, or a breakthrough.
    </p>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FIELD_LABELS } from '@/engine/balance'
import { findUnit, fmt, fmtCount } from '@/engine/model'
import { bestEffectiveIQ, effectiveIQ, finishWeek } from '@/engine/research'
import type { Project } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import { allocation } from '@/engine/model'

const game = useGameStore()
const ui = useUiStore()

const projects = computed(() =>
  [...game.state.projects].sort((a, b) => Number(a.effect.kind === 'final') - Number(b.effect.kind === 'final'))
)
const minds = computed(() => game.state.units.filter((u) => u.mind && u.count > 0))
const best = computed(() => bestEffectiveIQ(game.state))
const groups = (p: Project) => game.preview.groups[p.id] ?? []
const speed = (p: Project) => game.preview.progress[p.id] ?? 0
const unitName = (id: string) => findUnit(game.state, id)?.name ?? '?'

function put(projectId: string, e: Event) {
  const select = e.target as HTMLSelectElement
  const unit = findUnit(game.state, select.value)
  select.value = ''
  if (!unit) return
  const free = allocation(game.state, unit).free
  if (unit.count === 1 || free === unit.count) game.assignAll(unit.id, projectId)
  else if (free > 0) game.assign(unit.id, projectId, free)
  else game.assignAll(unit.id, projectId)
}
</script>

<style scoped>
.projects {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.intro {
  margin: 0;
}

.project {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 12px;
  background: var(--panel-raised);
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.project.final {
  border-color: rgb(167 139 250 / 0.4);
}

.head {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.icon {
  font-size: 22px;
}

.title {
  flex: 1;
  min-width: 0;
}

.facts {
  display: flex;
  gap: 4px;
  flex-wrap: wrap;
  justify-content: flex-end;
}

.groups {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.status {
  gap: 4px;
}
</style>
