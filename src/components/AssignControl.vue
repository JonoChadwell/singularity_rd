<template>
  <span class="assign">
    <input
      class="n"
      type="number"
      min="0"
      :max="max"
      :value="count"
      :disabled="rest || disabled"
      :aria-label="`Machines on ${label}`"
      @change="onChange"
    />
    <button
      type="button"
      class="small rest"
      :class="{ on: rest }"
      :disabled="disabled"
      :aria-pressed="rest"
      title="Takes every machine not counted elsewhere, including new ones"
      @click="emit('rest', !rest)"
    >
      rest
    </button>
  </span>
</template>

<script setup lang="ts">
defineProps<{ count: number; max: number; rest: boolean; label: string; disabled?: boolean }>()
const emit = defineEmits<{ set: [n: number]; rest: [on: boolean] }>()

function onChange(e: Event) {
  const n = Number((e.target as HTMLInputElement).value)
  if (Number.isFinite(n)) emit('set', n)
}
</script>

<style scoped>
.assign {
  display: inline-flex;
  gap: 4px;
  align-items: center;
}

.rest.on {
  border-color: var(--accent);
  color: var(--accent);
}
</style>
