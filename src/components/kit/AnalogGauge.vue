<template>
  <figure class="analog" role="meter" :aria-valuenow="Math.round(value * 100)" aria-valuemin="0" aria-valuemax="100" :aria-label="label">
    <svg viewBox="0 0 160 92" aria-hidden="true">
      <path class="face" d="M8 84 A72 72 0 0 1 152 84 Z" />
      <path v-for="z in bands" :key="`${z.from}-${z.tone}`" class="zone" :class="z.tone" :d="arc(z.from, z.to)" />
      <line v-for="t in ticks" :key="t" class="tick" :class="{ major: t % 0.5 === 0 }" v-bind="tick(t)" />
      <line v-if="bar !== undefined" class="mark" v-bind="tick(bar, 58, 76)" />
      <template v-if="ends">
        <text class="end" x="25" y="79">{{ ends[0] }}</text>
        <text class="end" x="135" y="79" text-anchor="end">{{ ends[1] }}</text>
      </template>
      <g :style="{ transform: `rotate(${angle(shown) - 90}deg)` }" class="needle">
        <line x1="80" y1="84" x2="80" y2="22" />
      </g>
      <circle class="hub" cx="80" cy="84" r="5" />
    </svg>
    <figcaption>
      <slot>
        <span class="num" :class="value >= (bar ?? 0) ? 'good' : 'bad'">{{ Math.round(value * 100) }}%</span>
        <span class="lbl">{{ label }} · bar {{ Math.round((bar ?? 0) * 100) }}%</span>
      </slot>
    </figcaption>
  </figure>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, watch } from 'vue'

export interface GaugeZone {
  from: number
  to: number
  /** A class for its colour: good, bad, or one of the neutral a, b, c. */
  tone: string
}

/**
 * A needle from 0 to 1. With a bar, the face is red below it and green above; with zones, it
 * shows those instead, and `ends` labels the two ends.
 */
const props = defineProps<{ value: number; bar?: number; label: string; zones?: GaugeZone[]; ends?: [string, string] }>()
const bands = computed<GaugeZone[]>(
  () =>
    props.zones ?? [
      { from: 0, to: props.bar ?? 0, tone: 'bad' },
      { from: props.bar ?? 0, to: 1, tone: 'good' }
    ]
)
const ticks = Array.from({ length: 11 }, (_, i) => i / 10)
/** The needle swings up from zero when shown. */
const shown = ref(props.value)
onMounted(() => {
  shown.value = 0
  requestAnimationFrame(() => requestAnimationFrame(() => (shown.value = props.value)))
})
watch(
  () => props.value,
  (v) => (shown.value = v)
)

const angle = (p: number) => 180 * Math.min(1, Math.max(0, p))
const point = (p: number, r: number) => {
  const a = Math.PI * (1 - Math.min(1, Math.max(0, p)))
  return [80 + r * Math.cos(a), 84 - r * Math.sin(a)] as const
}
function arc(from: number, to: number) {
  const [x1, y1] = point(from, 66)
  const [x2, y2] = point(to, 66)
  return `M${x1} ${y1} A66 66 0 0 1 ${x2} ${y2}`
}
function tick(p: number, r1 = 60, r2 = 68) {
  const [x1, y1] = point(p, r1)
  const [x2, y2] = point(p, r2)
  return { x1, y1, x2, y2 }
}
</script>

<style scoped>
.analog {
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  width: 170px;
}

svg {
  width: 160px;
  height: 92px;
  overflow: visible;
}

.face {
  fill: #e5e0c7;
  stroke: #000;
  stroke-width: 1.5;
}

.zone {
  fill: none;
  stroke-width: 7;
}

.zone.bad {
  stroke: #c4432f;
}

.zone.good {
  stroke: #4f9b3a;
}

.zone.a {
  stroke: #3f7fb0;
}

.zone.b {
  stroke: #8a7cae;
}

.zone.c {
  stroke: #b8793a;
}

.end {
  font-family: var(--font-label);
  font-weight: 600;
  font-size: 9px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  fill: #1a1912;
}

.tick {
  stroke: #1a1912;
  stroke-width: 1;
}

.tick.major {
  stroke-width: 2;
}

.mark {
  stroke: #1a1912;
  stroke-width: 3;
}

.needle {
  transform-origin: 80px 84px;
  transition: transform 0.9s cubic-bezier(0.3, 1.5, 0.5, 1);
}

.needle line {
  stroke: #b3261e;
  stroke-width: 2.5;
  stroke-linecap: round;
}

.hub {
  fill: #1a1912;
}

figcaption {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.15;
}

figcaption .num {
  font-size: 20px;
  font-weight: 600;
}
</style>
