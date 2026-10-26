<template>
  <dialog ref="el" class="console" :class="size" :aria-labelledby="titleId" @cancel="onCancel" @close="emit('close')">
    <header class="plate">
      <span class="screws" aria-hidden="true" />
      <slot name="help" />
      <h2 :id="titleId">{{ title }}</h2>
      <span v-if="tag" class="tag num">{{ tag }}</span>
      <button v-if="closable" type="button" class="close" aria-label="Close" @click="emit('close')">✕</button>
    </header>
    <div class="body">
      <slot />
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { onMounted, ref } from 'vue'

const props = withDefaults(
  defineProps<{ title: string; titleId: string; tag?: string; closable?: boolean; size?: 'md' | 'lg' }>(),
  { closable: true, size: 'lg' }
)
const emit = defineEmits<{ close: [] }>()
const el = ref<HTMLDialogElement>()

onMounted(() => el.value?.showModal?.())

function onCancel(e: Event) {
  if (!props.closable) e.preventDefault()
}

defineExpose({ close: () => el.value?.close?.() })
</script>

<style scoped>
.console.md {
  width: min(720px, calc(100vw - 24px));
}

.console.lg {
  width: min(980px, calc(100vw - 24px));
}

.plate {
  position: relative;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 8px 26px;
  background: linear-gradient(180deg, var(--chrome-4), var(--chrome-3));
  border-bottom: 1px solid #000;
  box-shadow: inset 0 1px 0 rgb(255 255 255 / 0.25);
}

/* Two screws holding the plate on. */
.screws::before,
.screws::after {
  content: '';
  position: absolute;
  top: 50%;
  width: 8px;
  height: 8px;
  margin-top: -4px;
  border-radius: 50%;
  background: radial-gradient(circle at 35% 35%, #d8d2b0, #6c684f);
  box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.5);
}

.screws::before {
  left: 9px;
}

.screws::after {
  right: 9px;
}

h2 {
  flex: 1;
  margin: 0;
  font-size: 17px;
  color: #1a1912;
  text-shadow: 0 1px 0 rgb(255 255 255 / 0.25);
}

.tag {
  font-size: 11px;
  padding: 0 5px;
  color: #1a1912;
  border: 1px solid #1a1912;
}

.close {
  padding: 1px 7px;
}

.body {
  overflow-y: auto;
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
</style>
