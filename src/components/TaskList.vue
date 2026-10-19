<template>
  <div class="tasks">
    <p v-if="!rows.length" class="empty">
      {{ unit.mind ? 'No strategies or projects yet.' : 'No strategies yet.' }}
      <button class="link" @click="ui.openInvent({ kind: 'strategy', unitId: unit.id })">+ strategy</button>
    </p>
    <div v-for="row in rows" :key="row.id" class="task" :class="{ off: !row.count && !row.rest }">
      <AssignControl
        v-if="unit.count > 1 || row.count === 0 || !row.rest"
        :count="row.count"
        :max="unit.count"
        :rest="row.rest"
        :label="row.name"
        :disabled="!game.playing"
        @set="(n) => game.assign(unit.id, row.id, n)"
        @rest="(on) => game.assignRest(unit.id, on ? row.id : null)"
      />
      <span v-else class="chip on-it">on it</span>
      <div class="what">
        <div class="name">
          {{ row.icon }} {{ row.name }}
          <button
            v-if="unit.count > 1 && row.count < unit.count"
            class="link"
            title="Move every machine of this type here"
            @click="game.assignAll(unit.id, row.id)"
          >
            all
          </button>
          <button v-else-if="unit.count === 1 && !row.count" class="link" @click="game.assignAll(unit.id, row.id)">
            do this
          </button>
        </div>
        <div class="detail small muted">
          <template v-if="row.strategy?.kind === 'make'">
            {{ perUnit(row.strategy) }} each a week
            <span v-if="run(row.id)" :class="{ warn: run(row.id)!.fraction < 0.999 }">
              · {{ fmtCount(run(row.id)!.units) }} running
              <template v-if="run(row.id)!.fraction < 0.999">
                at {{ Math.round(run(row.id)!.fraction * 100) }}%<template v-if="run(row.id)!.limitedBy">, short of {{ resName(run(row.id)!.limitedBy!) }}</template>
              </template>
            </span>
            <select
              v-if="unit.mind && teachable(row.strategy).length"
              class="inline teach"
              aria-label="Teach this strategy to another mind"
              @change="teach(row.strategy!.id, $event)"
            >
              <option value="">Teach to…</option>
              <option v-for="m in teachable(row.strategy)" :key="m.id" :value="m.id">{{ m.name }}</option>
            </select>
          </template>
          <template v-else-if="row.strategy?.kind === 'build'">
            <label class="row target">
              Build until I own
              <input
                class="n"
                type="number"
                min="0"
                :value="row.strategy.target ?? 0"
                aria-label="Build target"
                @change="setTarget(row.strategy!.id, $event)"
              />
              <span>of {{ fmtCount(limitOf(row.strategy.outputId)) }} possible</span>
            </label>
            <div>
              From {{ partsText(row.strategy) }} each · ~{{ fmt(rateOf(row.strategy)) }} a week per builder
              <span v-if="run(row.id)"> · {{ fmtCount(run(row.id)!.units) }} building</span>
            </div>
          </template>
          <template v-else-if="row.strategy?.kind === 'crew'">
            Each crews {{ fmt(row.strategy.amount) }} {{ unitName(row.strategy.outputId) }}
          </template>
          <template v-else-if="row.project">
            <template v-if="group(row.id)">
              Effective IQ
              <span class="num" :class="group(row.id)!.clears ? 'good' : 'bad'">{{ Math.floor(group(row.id)!.effectiveIQ) }}</span>
              vs bar {{ row.project.bar }}
              <template v-if="group(row.id)!.clears">· +{{ fmt(group(row.id)!.speed) }}/wk</template>
              <template v-else> · can’t help</template>
            </template>
            <template v-else>Bar {{ row.project.bar }} · effective IQ here {{ Math.floor(wouldBe(row.project, row.count || unit.count)) }}</template>
            <span v-if="finish(row.project)"> · finishes week {{ finish(row.project) }}</span>
          </template>
        </div>
      </div>
    </div>
    <div v-if="unit.mind && otherProjects.length" class="row more">
      <select class="inline" aria-label="Put machines on a project" @change="startProject">
        <option value="">Put machines on a project…</option>
        <option v-for="p in otherProjects" :key="p.id" :value="p.id">
          {{ p.icon }} {{ p.name }} (bar {{ p.bar }}{{ wouldBe(p, unit.count) < p.bar ? ', can’t help' : '' }})
        </option>
      </select>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import {
  allocation,
  describeFlows,
  findResource,
  findUnit,
  fmt,
  fmtCount,
  runsOn,
  unitLimit
} from '@/engine/model'
import { effectiveIQ, finishWeek, strategyRate } from '@/engine/research'
import type { Project, Strategy, UnitType } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import AssignControl from './AssignControl.vue'

const props = defineProps<{ unit: UnitType }>()
const game = useGameStore()
const ui = useUiStore()

const alloc = computed(() => allocation(game.state, props.unit))

interface Row {
  id: string
  name: string
  icon: string
  count: number
  rest: boolean
  strategy?: Strategy
  project?: Project
}

const rows = computed<Row[]>(() => {
  const u = props.unit
  const byTask = alloc.value.byTask
  const strategies: Row[] = game.state.strategies
    .filter((s) => s.unitId === u.id)
    .map((s) => ({
      id: s.id,
      name: s.name,
      icon: s.kind === 'build' ? '🔨' : s.kind === 'crew' ? '👷' : '',
      count: byTask[s.id] ?? 0,
      rest: u.rest === s.id,
      strategy: s
    }))
  const projects: Row[] = u.mind
    ? game.state.projects
        .filter((p) => byTask[p.id] || u.rest === p.id || p.id in u.assign)
        .map((p) => ({ id: p.id, name: p.name, icon: p.icon, count: byTask[p.id] ?? 0, rest: u.rest === p.id, project: p }))
    : []
  return [...projects, ...strategies]
})

const otherProjects = computed(() => {
  const shown = new Set(rows.value.map((r) => r.id))
  return game.state.projects.filter((p) => !shown.has(p.id))
})

const run = (id: string) => game.preview.runs[id]
const group = (projectId: string) => game.preview.groups[projectId]?.find((g) => g.unitId === props.unit.id)
const resName = (id: string) => findResource(game.state, id)?.name ?? '?'
const unitName = (id: string) => findUnit(game.state, id)?.name ?? '?'
const limitOf = (unitId: string) => {
  const u = findUnit(game.state, unitId)
  return u ? unitLimit(u) : 0
}
const wouldBe = (p: Project, machines: number) => effectiveIQ(props.unit, machines, p.field)
const finish = (p: Project) => finishWeek(game.state, p, game.preview.progress[p.id] ?? 0)

function perUnit(s: Strategy) {
  const rate = strategyRate(game.state, s)
  const output = findResource(game.state, s.outputId)
  const made = `${fmt(rate.amount)} ${output?.icon ?? ''} ${output?.name ?? '?'}`
  return rate.inputs.length ? `${describeFlows(game.state, rate.inputs)} → ${made}` : made
}

const rateOf = (s: Strategy) => strategyRate(game.state, s).amount
function partsText(s: Strategy) {
  const target = findUnit(game.state, s.outputId)
  return target ? describeFlows(game.state, target.parts) : '?'
}

const teachable = (s: Strategy) =>
  game.state.units.filter(
    (u) =>
      u.mind &&
      u.id !== props.unit.id &&
      !runsOn(u, s.outputId) &&
      !game.state.strategies.some((x) => x.unitId === u.id && x.name === s.name)
  )

function teach(strategyId: string, e: Event) {
  const select = e.target as HTMLSelectElement
  if (select.value) game.teach(strategyId, select.value)
  select.value = ''
}

function setTarget(strategyId: string, e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(n)) game.setBuildTarget(strategyId, n)
}

function startProject(e: Event) {
  const select = e.target as HTMLSelectElement
  const id = select.value
  select.value = ''
  if (!id) return
  const u = props.unit
  // A lone machine, or a type with nothing else to do, moves wholesale.
  if (u.count === 1 || alloc.value.free === u.count) game.assignAll(u.id, id)
  else if (alloc.value.free > 0) game.assign(u.id, id, alloc.value.free)
  else game.assign(u.id, id, Math.max(1, Math.floor(u.count / 2)))
}
</script>

<style scoped>
.tasks {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.task {
  display: flex;
  gap: 10px;
  align-items: flex-start;
}

.task.off {
  opacity: 0.7;
}

.what {
  flex: 1;
  min-width: 0;
}

.name {
  display: flex;
  gap: 6px;
  align-items: center;
  flex-wrap: wrap;
}

.detail {
  margin-top: 2px;
}

.on-it {
  color: var(--accent);
  border-color: var(--accent-dim);
  margin-top: 3px;
}

.teach {
  margin-left: 6px;
  font-size: 11px;
}

.target {
  gap: 6px;
  margin-bottom: 2px;
}

.more {
  margin-top: 2px;
}
</style>
