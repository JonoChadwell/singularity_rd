<template>
  <span class="led" :class="[tone, { blink }]" :title="title" :role="title ? 'img' : undefined" :aria-label="title" />
</template>

<script setup lang="ts">
export type LedTone = 'good' | 'warn' | 'bad' | 'info' | 'off'

withDefaults(defineProps<{ tone?: LedTone; blink?: boolean; title?: string }>(), { tone: 'good' })
</script>

<style scoped>
.led {
  --c: var(--led-g);
  display: inline-block;
  flex: none;
  width: 9px;
  height: 9px;
  border-radius: 50%;
  border: 1px solid rgb(0 0 0 / 0.7);
  background: radial-gradient(circle at 35% 30%, #fff 0 12%, var(--c) 45%, color-mix(in srgb, var(--c), #000 45%) 100%);
  box-shadow: 0 0 6px 1px color-mix(in srgb, var(--c), transparent 40%);
  vertical-align: middle;
}

.warn {
  --c: var(--led-a);
}

.bad {
  --c: var(--led-r);
}

.info {
  --c: var(--led-b);
}

.off {
  background: radial-gradient(circle at 35% 30%, #6a6d60 0 10%, var(--led-off) 50%, #1c1e18 100%);
  box-shadow: none;
}

.blink {
  animation: blink 1s steps(2, start) infinite;
}
</style>
