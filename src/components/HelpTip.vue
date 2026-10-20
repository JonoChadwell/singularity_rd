<template>
  <span class="help">
    <button
      type="button"
      class="mark"
      :aria-expanded="open"
      :aria-controls="id"
      aria-label="How this works"
      :title="text"
      @click="open = !open"
    >
      ?
    </button>
    <span v-if="open" :id="id" class="pop small" role="note">{{ text }}</span>
  </span>
</template>

<script setup lang="ts">
import { ref, useId } from 'vue'

defineProps<{ text: string }>()
const open = ref(false)
const id = useId()
</script>

<style scoped>
.help {
  position: relative;
  display: inline-flex;
}

.mark {
  width: 22px;
  height: 22px;
  padding: 0;
  border-radius: 50%;
  font-size: 12px;
  font-weight: 700;
  line-height: 1;
  color: var(--muted);
}

.mark[aria-expanded='true'] {
  color: var(--text);
  border-color: var(--ai);
}

.pop {
  position: absolute;
  top: 28px;
  left: 0;
  z-index: 5;
  width: min(380px, calc(100vw - 64px));
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--panel-raised);
  color: var(--text);
  box-shadow: 0 6px 20px rgb(0 0 0 / 0.35);
  line-height: 1.45;
}
</style>
