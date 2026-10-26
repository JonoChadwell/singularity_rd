<template>
  <span class="readout num" :class="[tone, { blink }]"
    ><span class="ghost" aria-hidden="true">{{ ghost }}</span><span class="val">{{ text }}</span></span
  >
</template>

<script setup lang="ts">
import { computed } from 'vue'

const props = defineProps<{ value: string | number; digits?: number; tone?: 'warn' | 'bad'; blink?: boolean }>()
const text = computed(() => String(props.value))
/** Unlit segments behind the digits, like a real seven-segment display. */
const ghost = computed(() => '8'.repeat(Math.max(props.digits ?? 0, text.value.length)))
</script>

<style scoped>
.readout {
  position: relative;
  display: inline-grid;
  padding: 1px 6px;
  font-size: 22px;
  font-weight: 600;
  line-height: 1.1;
  color: var(--lcd-fg);
  background: var(--lcd-bg);
  border: 1px solid #000;
  box-shadow: inset 1px 1px 0 rgb(0 0 0 / 0.7), inset 0 0 12px rgb(0 0 0 / 0.5);
  text-shadow: 0 0 6px color-mix(in srgb, var(--lcd-fg), transparent 50%);
  text-align: right;
}

.readout > span {
  grid-area: 1 / 1;
}

.ghost {
  color: var(--lcd-fg);
  opacity: 0.07;
  text-shadow: none;
}

.warn {
  --lcd-fg: var(--led-a);
}

.bad {
  --lcd-fg: var(--led-r);
}

.blink .val {
  animation: blink 1s steps(2, start) infinite;
}
</style>
