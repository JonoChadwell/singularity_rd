<template>
  <span class="gauge" :class="tone" role="meter" :aria-valuenow="value" aria-valuemin="0" :aria-valuemax="max" :title="title">
    <span v-for="i in segments" :key="i" class="seg" :class="{ lit: i <= lit, edge: i === lit && partial }" />
    <span v-if="mark !== undefined" class="mark" :style="{ left: `${Math.min(100, Math.max(0, (100 * mark) / Math.max(1e-9, max)))}%` }" />
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = withDefaults(
  defineProps<{ value: number; max: number; segments?: number; tone?: 'good' | 'warn' | 'bad' | 'copper'; mark?: number; title?: string }>(),
  { segments: 12, tone: 'good' }
)
const share = computed(() => Math.min(1, Math.max(0, props.value / Math.max(1e-9, props.max))))
/** Segments lit: any stock at all lights the first. */
const lit = computed(() => (share.value > 0 ? Math.max(1, Math.ceil(share.value * props.segments - 1e-9)) : 0))
const partial = computed(() => share.value > 0 && share.value < 1 && (share.value * props.segments) % 1 > 1e-6)
</script>

<style scoped>
.gauge {
  --c: var(--led-g);
  position: relative;
  display: inline-flex;
  gap: 1px;
  padding: 2px;
  height: 10px;
  background: var(--lcd-bg);
  border: 1px solid #000;
  box-shadow: inset 1px 1px 0 rgb(0 0 0 / 0.6);
  vertical-align: middle;
}

.warn {
  --c: var(--led-a);
}

.bad {
  --c: var(--led-r);
}

.copper {
  --c: var(--copper-hi);
}

.seg {
  flex: 1;
  min-width: 3px;
  background: color-mix(in srgb, var(--c), #000 82%);
}

.seg.lit {
  background: var(--c);
  box-shadow: 0 0 3px color-mix(in srgb, var(--c), transparent 50%);
}

.seg.edge {
  opacity: 0.65;
}

.mark {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  margin-left: -1px;
  background: var(--silk);
}
</style>
