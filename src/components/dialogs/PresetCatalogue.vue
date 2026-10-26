<template>
  <div class="catalogue">
    <span class="lbl">{{ label }}</span>
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
        <span v-if="item.icon" class="icon">{{ item.icon }}</span>{{ item.name }}
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
.catalogue {
  display: flex;
  flex-direction: column;
  gap: 5px;
}

/* A parts drawer of ready-made ideas. */
.list {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
  max-height: 112px;
  overflow-y: auto;
  padding: 6px;
  background: rgb(0 0 0 / 0.25);
  border: 1px solid #000;
  box-shadow: inset 1px 1px 0 var(--bevel-lo);
}

.preset {
  display: inline-flex;
  gap: 4px;
  align-items: center;
  padding: 2px 7px;
  text-transform: none;
  letter-spacing: 0.02em;
  font-size: 12px;
}

.preset.on {
  color: #2a1a00;
  background: linear-gradient(180deg, #ffc65a, #d98f1c);
}

.icon {
  font-size: 12px;
}
</style>
