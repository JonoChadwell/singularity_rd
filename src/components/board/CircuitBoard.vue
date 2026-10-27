<template>
  <section class="board" aria-label="Circuit board">
    <div class="strip">
      <span class="silk">Board · rev {{ game.state.phase.n }}.{{ game.state.week }}</span>
      <span class="legend">
        <span><i class="sw ok" /> running</span>
        <span><i class="sw warn" /> limited</span>
        <span><i class="sw bad" /> starved</span>
        <span><i class="via in" /> uses</span>
        <span><i class="via out" /> makes</span>
      </span>
      <span class="zoom">
        <button type="button" class="small" aria-label="Zoom out" @click="ui.setZoom(ui.zoom - 0.1)">−</button>
        <span class="num">{{ Math.round(ui.zoom * 100) }}%</span>
        <button type="button" class="small" aria-label="Zoom in" @click="ui.setZoom(ui.zoom + 0.1)">+</button>
      </span>
    </div>

    <div class="frame" :style="{ zoom: ui.zoom }">
      <div class="gutter" :style="{ height: `${L.height}px` }">
        <BusPlate
          v-for="b in L.buses"
          :key="b.id"
          :r="resources.get(b.id)!"
          :hot="hot.buses.has(b.id)"
          class="plate"
          :style="{ top: `${b.y - ROW / 2 + 3}px`, height: `${ROW - 6}px` }"
        />
        <div class="gutter-foot" :style="{ top: `${TOP + L.buses.length * ROW + 8}px` }">
          <button type="button" class="small" @click="ui.openInvent({ kind: 'resource' })">+ Resource</button>        </div>
      </div>

      <div class="scroller">
        <div class="canvas" :style="{ width: `${L.width}px` }">
          <svg class="traces" :width="L.width" :height="L.height" :viewBox="`0 0 ${L.width} ${L.height}`" aria-hidden="true">
            <!-- Buses. -->
            <g v-for="b in L.buses" :key="b.id" class="bus" :class="[busTone(b.id), { hot: hot.buses.has(b.id) }]">
              <line class="rail-shadow" x1="0" :x2="L.width" :y1="b.y + 1.5" :y2="b.y + 1.5" />
              <line class="rail" x1="0" :x2="L.width" :y1="b.y" :y2="b.y" />
              <text v-for="x in labelXs" :key="x" class="bus-label" :x="x" :y="b.y - 7">{{ resources.get(b.id)?.name }}</text>
            </g>
            <!-- Lanes: each a trace from a chip pin up to the buses it touches. -->
            <g
              v-for="lane in lanes"
              :key="lane.id"
              class="lane"
              :class="[lane.kind, lane.tone, { hot: hot.lanes.has(lane.id) }]"
              :data-lane="lane.id"
            >
              <path class="wire-shadow" :d="`M${lane.x + 1.5} ${lane.top} V${L.height}`" />
              <path class="wire" :d="`M${lane.x} ${lane.top} V${L.height}`" />
              <g v-for="t in lane.taps" :key="t.busId + t.dir">
                <circle
                  class="via"
                  :class="[t.dir, { limiting: t.limiting }]"
                  :cx="lane.x"
                  :cy="busYs.get(t.busId)"
                  :r="t.dir === 'out' ? 5.5 : 4.5"
                />
                <path v-if="t.dir === 'out'" class="arrow" :d="`M${lane.x - 3} ${busYs.get(t.busId)! + 2} l3 -4 l3 4 z`" />
              </g>
              <g v-if="lane.kind === 'cap'" class="capacitor">
                <line :x1="lane.x - 7" :x2="lane.x + 7" :y1="L.height - 20" :y2="L.height - 20" />
                <line :x1="lane.x - 7" :x2="lane.x + 7" :y1="L.height - 15" :y2="L.height - 15" />
              </g>
              <text class="lane-label" :transform="`translate(${lane.x + 4.5} ${L.height - (lane.kind === 'cap' ? 26 : 8)}) rotate(-90)`">
                {{ lane.label }}
              </text>
              <rect class="pin" :x="lane.x - 4" :y="L.height - 5" width="8" height="5" />
              <!-- A wide, invisible hit area. -->
              <path
                class="hit"
                :d="`M${lane.x} ${lane.top} V${L.height}`"
                @mouseenter="ui.hover = lane.id"
                @mouseleave="ui.hover = null"
                @click="openLane(lane)"
              >
                <title>{{ lane.title }}: {{ lane.label }}</title>
              </path>
            </g>
          </svg>

          <div class="chips">
            <template v-for="c in L.cols" :key="c.id">
              <CpuChip v-if="c.kind === 'cpu'" :mind="minds.get(c.id)!" :width="c.w" />
              <UnitChip v-else-if="c.kind === 'unit'" :unit="units.get(c.id)!" :width="c.w" :column="c" />
              <div v-else class="socket" :style="{ width: `${c.w}px` }">
                <span class="silk">Empty socket</span>
                <template v-if="unitLock">
                  <p class="lock">🔒 Industry: {{ unitLock }}</p>
                </template>
                <template v-else-if="game.state.phase.firstUnit">
                  <p class="lock">Your plan’s first unit, {{ game.state.phase.firstUnit.name }}, is waiting.</p>
                  <button class="primary small" @click="ui.openFirstUnit()">Design it (free)</button>
                </template>
                <button v-else class="small" @click="ui.openInvent({ kind: 'unit' })">+ Unit</button>
              </div>
            </template>
          </div>
        </div>
      </div>
    </div>
    <p v-if="!game.state.resources.length" class="empty-board silk">No buses yet. Propose a resource: Money, Power, Training Data…</p>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { capOf } from '@/engine/model'
import { lockReason } from '@/engine/phase'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import BusPlate from './BusPlate.vue'
import CpuChip from './CpuChip.vue'
import { boardLayout, ROW, TOP, type Lane } from './layout'
import UnitChip from './UnitChip.vue'

const game = useGameStore()
const ui = useUiStore()

const L = computed(() => boardLayout(game.state, game.preview))
const resources = computed(() => new Map(game.state.resources.map((r) => [r.id, r])))
const units = computed(() => new Map(game.state.units.map((u) => [u.id, u])))
const minds = computed(() => new Map(game.state.minds.map((m) => [m.id, m])))
const busYs = computed(() => new Map(L.value.buses.map((b) => [b.id, b.y])))
const lanes = computed(() => L.value.cols.flatMap((c) => c.lanes.map((l) => ({ ...l, col: c.id }))))
const unitLock = computed(() => lockReason(game.state, 'unit'))
/** Where the buses' names repeat along the board, so they can be read when scrolled. */
const labelXs = computed(() => {
  const xs: number[] = []
  for (let x = 8; x < L.value.width - 80; x += 620) xs.push(x)
  return xs
})

/** Everything wired to whatever is under the pointer. */
const hot = computed(() => {
  const h = ui.hover
  const buses = new Set<string>()
  const hotLanes = new Set<string>()
  if (!h) return { buses, lanes: hotLanes }
  for (const lane of lanes.value) {
    if (lane.id === h || lane.col === h || lane.taps.some((t) => t.busId === h)) {
      hotLanes.add(lane.id)
      for (const t of lane.taps) buses.add(t.busId)
    }
  }
  if (resources.value.has(h)) buses.add(h)
  return { buses, lanes: hotLanes }
})

function busTone(id: string) {
  const p = game.preview
  if ((p.wasted[id] ?? 0) > 0 || (p.shares[id] ?? 1) < 0.999) return 'bad'
  const r = resources.value.get(id)
  return r && r.amount >= capOf(game.state, r) * 0.999 ? 'warn' : ''
}

function openLane(lane: Lane) {
  if (lane.kind === 'make') return ui.openSheet({ kind: 'strategy', id: lane.id })
  const bus = lane.taps[0]?.busId
  if (bus) ui.openSheet({ kind: 'resource', id: bus })
}
</script>

<style scoped>
.board {
  display: flex;
  flex-direction: column;
  min-width: 0;
}

.strip {
  display: flex;
  align-items: center;
  gap: 14px;
  flex-wrap: wrap;
  padding: 4px 8px;
  background: var(--pcb-0);
  border: 1px solid #000;
  border-bottom: 0;
}

.legend {
  display: flex;
  gap: 12px;
  flex-wrap: wrap;
  font-family: var(--font-label);
  font-size: 10.5px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  color: var(--silk-dim);
}

.legend span {
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.sw {
  display: inline-block;
  width: 16px;
  height: 3px;
  background: var(--copper-hi);
}

.sw.warn {
  background: var(--led-a);
}

.sw.bad {
  background: repeating-linear-gradient(90deg, var(--led-r) 0 4px, transparent 4px 7px);
}

.via {
  display: inline-block;
  width: 9px;
  height: 9px;
  border-radius: 50%;
}

.legend .via.in {
  border: 2px solid var(--copper-hi);
  background: var(--pcb-1);
}

.legend .via.out {
  background: var(--gold);
  border: 1px solid #000;
}

.zoom {
  margin-left: auto;
  display: inline-flex;
  align-items: center;
  gap: 4px;
  font-size: 11px;
  color: var(--silk-dim);
}

.frame {
  display: flex;
  align-items: flex-start;
  background:
    radial-gradient(circle, rgb(255 255 255 / 0.045) 1px, transparent 1.5px) 0 0 / 20px 20px,
    linear-gradient(180deg, var(--pcb-2), var(--pcb-1));
  border: 1px solid #000;
  box-shadow: inset 0 0 40px rgb(0 0 0 / 0.45);
}

.gutter {
  position: relative;
  flex: 0 0 280px;
  z-index: 2;
  background: rgb(0 0 0 / 0.18);
  border-right: 1px solid rgb(0 0 0 / 0.4);
}

.plate {
  position: absolute;
  left: 6px;
  right: 0;
}

.gutter-foot {
  position: absolute;
  left: 8px;
  right: 8px;
  display: flex;
  flex-direction: column;
  gap: 4px;
  align-items: flex-start;
}

.gutter-foot .lbl {
  color: var(--silk-dim);
}

.scroller {
  flex: 1;
  min-width: 0;
  overflow-x: auto;
  overflow-y: hidden;
  padding-bottom: 18px;
}

.canvas {
  position: relative;
}

.traces {
  display: block;
  overflow: visible;
}

/* Buses: wide copper rails. */
.rail {
  stroke: var(--copper);
  stroke-width: 5;
}

.rail-shadow {
  stroke: rgb(0 0 0 / 0.45);
  stroke-width: 5;
}

.bus.warn .rail {
  stroke: #c98a1e;
}

.bus.bad .rail {
  stroke: #b33a26;
}

.bus.hot .rail {
  stroke: var(--copper-hi);
  filter: drop-shadow(0 0 4px var(--copper-hi));
}

.bus-label {
  font-family: var(--font-label);
  font-weight: 600;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  fill: var(--silk-dim);
  opacity: 0.7;
}

/* Lanes. */
.wire {
  fill: none;
  stroke: var(--copper);
  stroke-width: 2.5;
}

.wire-shadow {
  fill: none;
  stroke: rgb(0 0 0 / 0.45);
  stroke-width: 2.5;
}

.lane.vcc .wire {
  stroke: var(--via);
  stroke-width: 1.5;
}

.lane.cap .wire {
  stroke-dasharray: 2 3;
}

.lane.drain .wire {
  stroke: var(--led-a);
  stroke-dasharray: 6 3;
}

.lane.ok .wire {
  stroke: var(--copper-hi);
}

.lane.warn .wire {
  stroke: var(--led-a);
}

.lane.bad .wire {
  stroke: var(--led-r);
  stroke-dasharray: 5 4;
}

.lane.off .wire {
  stroke: #3f5a46;
}

.lane.ok:not(.vcc):not(.cap) .wire {
  stroke-dasharray: 10 6;
  animation: flow 1.2s linear infinite;
}

@keyframes flow {
  to {
    stroke-dashoffset: -16;
  }
}

.lane.hot .wire {
  stroke-width: 4;
  filter: drop-shadow(0 0 4px currentColor);
}

.via.in {
  fill: var(--pcb-1);
  stroke: var(--copper-hi);
  stroke-width: 2;
}

.via.out {
  fill: var(--gold);
  stroke: #000;
  stroke-width: 1;
}

.via.limiting {
  stroke: var(--led-r);
  stroke-width: 3;
}

.arrow {
  fill: #2a1a00;
}

.capacitor line {
  stroke: var(--silk);
  stroke-width: 2.5;
}

.lane-label {
  font-family: var(--font-mono);
  font-size: 9.5px;
  fill: var(--silk);
}

.lane.off .lane-label {
  fill: var(--silk-dim);
  opacity: 0.6;
}

.lane.bad .lane-label {
  fill: var(--led-r);
}

.lane.warn .lane-label {
  fill: var(--led-a);
}

.pin {
  fill: var(--pin);
}

.hit {
  stroke: transparent;
  stroke-width: 14;
  fill: none;
  cursor: pointer;
  pointer-events: stroke;
}

/* Chips sit right under the bus field, at the x the layout gave them. */
.chips {
  display: flex;
  align-items: flex-start;
  gap: 30px;
  padding: 0 28px;
}

.chips > * {
  flex: none;
}

.socket {
  display: flex;
  flex-direction: column;
  gap: 8px;
  align-items: flex-start;
  padding: 12px;
  min-height: 120px;
  border: 2px dashed rgb(230 225 196 / 0.3);
  border-radius: 3px;
}

.socket .lock {
  margin: 0;
  font-size: 12px;
  color: var(--silk-dim);
}

.empty-board {
  margin: 8px 0 0;
}
</style>
