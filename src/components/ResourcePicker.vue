<template>
  <span class="picker">
    <span v-for="id in modelValue" :key="id" class="chip pick">
      {{ res(id)?.icon }} {{ res(id)?.name ?? '?' }}
      <button type="button" class="x" :aria-label="`Remove ${res(id)?.name}`" @click="remove(id)">✕</button>
    </span>
    <span v-if="!modelValue.length && empty" class="muted small">{{ empty }}</span>
    <select v-if="modelValue.length < max && options.length" class="inline" :aria-label="label" @change="add">
      <option value="">{{ label }}…</option>
      <option v-for="r in options" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }} ({{ r.kind }})</option>
    </select>
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { findResource } from '@/engine/model'
import { useGameStore } from '@/stores/game'

const props = defineProps<{ modelValue: string[]; max: number; label: string; empty?: string }>()
const emit = defineEmits<{ 'update:modelValue': [ids: string[]] }>()
const game = useGameStore()

const res = (id: string) => findResource(game.state, id)
const options = computed(() => game.state.resources.filter((r) => !props.modelValue.includes(r.id)))

function add(e: Event) {
  const select = e.target as HTMLSelectElement
  if (select.value) emit('update:modelValue', [...props.modelValue, select.value])
  select.value = ''
}

function remove(id: string) {
  emit(
    'update:modelValue',
    props.modelValue.filter((x) => x !== id)
  )
}
</script>

<style scoped>
.picker {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  align-items: center;
}

.pick {
  color: var(--text);
  display: inline-flex;
  align-items: center;
  gap: 4px;
}

.x {
  border: none;
  background: transparent;
  padding: 0 2px;
  font-size: 10px;
  color: var(--muted);
}
</style>
