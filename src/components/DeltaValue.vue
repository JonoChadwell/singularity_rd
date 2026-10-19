<template>
  <span v-if="value && Math.abs(value) >= 0.01" class="num delta" :class="cls">
    {{ value > 0 ? '+' : '−' }}{{ fmt(Math.abs(value)) }}
  </span>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { fmt } from '@/engine/model'

const props = defineProps<{ value?: number; invert?: boolean }>()
const cls = computed(() =>
  (props.value ?? 0) > 0 !== Boolean(props.invert) ? 'delta-up' : 'delta-down'
)
</script>

<style scoped>
.delta {
  font-size: 12px;
  margin-left: 4px;
}
</style>
