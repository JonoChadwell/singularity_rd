<template>
  <div class="presets">
    <div class="small muted label">{{ label }}</div>
    <div class="list" role="list">
      <button
        v-for="item in items"
        :key="item.name"
        type="button"
        role="listitem"
        class="preset small"
        :class="{ on: item.name === selected }"
        :disabled="!!item.blocked"
        :title="item.blocked || item.description"
        @click="emit('pick', item.name)"
      >
        {{ item.icon ? `${item.icon} ` : '' }}{{ item.name }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
export interface PresetItem {
  name: string
  description: string
  icon?: string
  /** Why it can't be picked now, if it can't. */
  blocked?: string | null
}

defineProps<{ items: PresetItem[]; label: string; selected?: string }>()
const emit = defineEmits<{ pick: [name: string] }>()
</script>

<style scoped>
.presets {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 104px;
  overflow-y: auto;
  padding: 2px;
}

.preset {
  padding: 3px 8px;
  border-radius: 12px;
  font-size: 12px;
}

.preset.on {
  border-color: var(--ai);
  color: var(--text);
}

.preset:disabled {
  opacity: 0.45;
}
</style>
