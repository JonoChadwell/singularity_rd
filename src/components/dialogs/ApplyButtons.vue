<template>
  <button type="button" class="small primary" :disabled="!!blocker || game.busy" :title="blocker ?? undefined" @click="emit('apply')">
    Apply now
  </button>
  <span v-if="blocker" class="bad small">{{ blocker }}</span>
</template>

<script setup lang="ts">
import { useGameStore } from '@/stores/game'

defineProps<{ blocker: string | null }>()
const emit = defineEmits<{ apply: [] }>()
const game = useGameStore()
</script>
