<template>
  <div
    class="plate"
    :class="{ hot }"
    :data-bus="r.id"
    :title="`${r.name}: open its datasheet`"
    @mouseenter="ui.hover = r.id"
    @mouseleave="ui.hover = null"
    @click="ui.openSheet({ kind: 'resource', id: r.id })"
  >
    <div class="line1">
      <button type="button" class="name" :title="`${r.name}: open its datasheet`">
        <span class="icon">{{ r.icon }}</span>
        <span class="tier num">T{{ r.tier }}</span>
        <span class="label">{{ r.name }}</span>
      </button>
      <span class="amount num">{{ fmt(r.amount) }}<span class="cap"> / {{ fmt(cap) }}</span></span>
    </div>
    <div class="line2">
      <Gauge :value="r.amount" :max="cap" :segments="14" :tone="full ? 'warn' : 'good'" class="gauge" :title="`${fmt(r.amount)} of ${fmt(cap)} storage`" />
      <span class="delta num" :class="net > 0.005 ? 'delta-up' : net < -0.005 ? 'delta-down' : 'muted'">{{ net > 0.005 || net < -0.005 ? signed(net) : '±0' }}</span>
      <Led v-if="wasted > 0" tone="bad" :title="`Next week, ${fmt(wasted)} won’t fit in storage and is lost`" />
      <Led v-else-if="short < 0.999" tone="bad" blink :title="`Short: everyone who needs it runs at ${Math.round(short * 100)}%`" />
      <span class="buttons">
        <button
          class="link small"
          :disabled="!!lockReason(game.state, 'create')"
          :title="`Have the mind make ${r.name} directly`"
          @click.stop="ui.openInvent({ kind: 'create', outputId: r.id })"
        >
          + Procure
        </button>
        <button
          class="link small"
          :disabled="!!lockReason(game.state, 'storage')"
          :title="`Research more storage for ${r.name}`"
          @click.stop="ui.openInvent({ kind: 'storage', resourceId: r.id })"
        >
          + Store
        </button>
      </span>
    </div>

    <BusProbe :resource="r" class="probe" />
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { netFlow } from '@/engine/economy'
import { capOf, fmt } from '@/engine/model'
import { lockReason } from '@/engine/phase'
import type { Resource } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import Gauge from '../kit/SegGauge.vue'
import Led from '../kit/StatusLed.vue'
import BusProbe from './BusProbe.vue'

const props = defineProps<{ r: Resource; hot?: boolean }>()
const game = useGameStore()
const ui = useUiStore()
const cap = computed(() => capOf(game.state, props.r))
const full = computed(() => props.r.amount >= cap.value * 0.999)
const net = computed(() => netFlow(game.preview, props.r.id))
const wasted = computed(() => game.preview.wasted[props.r.id] ?? 0)
const short = computed(() => game.preview.shares[props.r.id] ?? 1)
const signed = (n: number) => `${n >= 0 ? '+' : '−'}${fmt(Math.abs(n))}`
</script>

<style scoped>
.plate {
  position: relative;
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 3px;
  padding: 3px 8px 3px 6px;
  background: linear-gradient(180deg, var(--chrome-2), var(--chrome-1));
  border: 1px solid #000;
  border-right: 0;
  box-shadow: inset 1px 1px 0 var(--bevel-hi);
  outline: none;
  cursor: pointer;
}

/* The pad where the plate meets its bus. */
.plate::after {
  content: '';
  position: absolute;
  right: -1px;
  top: 50%;
  width: 8px;
  height: 14px;
  margin-top: -7px;
  background: linear-gradient(180deg, var(--copper-hi), var(--copper));
  border: 1px solid #000;
  border-right: 0;
}

.plate.hot {
  background: linear-gradient(180deg, var(--chrome-3), var(--chrome-2));
}

.line1,
.line2 {
  display: flex;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.name {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  min-width: 0;
  flex: 1;
  padding: 0;
  background: none;
  border: 0;
  box-shadow: none;
  color: var(--silk);
  font-size: 13.5px;
  text-align: left;
}

.name:hover:not(:disabled) {
  background: none;
  color: var(--copper-hi);
}

.icon {
  font-size: 14px;
}

.label {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.tier {
  font-size: 10px;
  color: var(--copper-hi);
  font-weight: 400;
  letter-spacing: 0;
}

.amount {
  font-size: 12px;
  color: var(--lcd-fg);
  white-space: nowrap;
}

.cap {
  color: var(--muted);
}

.gauge {
  flex: 0 0 92px;
}

.delta {
  font-size: 11px;
  min-width: 44px;
}

.buttons {
  margin-left: auto;
  display: flex;
  gap: 2px;
}

.buttons button {
  padding: 0 4px;
  font-size: 10px;
}

.probe {
  display: none;
}

.plate:hover .probe {
  display: block;
}
</style>
