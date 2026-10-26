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
    <span v-if="open" :id="id" class="pop" role="note">
      <span class="lbl">Application note</span>
      {{ text }}
    </span>
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
  font-family: var(--font-mono);
  font-size: 13px;
  line-height: 1;
}

/* A slip of datasheet paper. */
.pop {
  position: absolute;
  top: 30px;
  left: -10px;
  z-index: 5;
  display: flex;
  flex-direction: column;
  gap: 4px;
  width: min(440px, calc(100vw - 48px));
  padding: 10px 12px;
  color: var(--ink);
  background: linear-gradient(180deg, var(--paper), var(--paper-2));
  border: 1px solid #000;
  border-top: 4px solid var(--paper-head);
  box-shadow: 0 8px 22px rgb(0 0 0 / 0.55);
  font-family: var(--font-paper);
  font-size: 12.5px;
  line-height: 1.45;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
}

.pop .lbl {
  color: var(--ink-2);
}
</style>
