<template>
  <div class="verdict">
    <div class="odds">
      <div class="row">
        <strong>Jev</strong>
        <span class="num" :class="verdict.plausibility >= verdict.bar ? 'good' : 'bad'">
          {{ pct(verdict.plausibility) }} plausible
        </span>
        <span class="muted small">· bar {{ pct(verdict.bar) }}</span>
      </div>
      <div class="meter bar-meter">
        <div :style="{ width: pct(verdict.plausibility), background: verdict.plausibility >= verdict.bar ? 'var(--accent)' : 'var(--bad)' }" />
        <span class="mark" :style="{ left: pct(verdict.bar) }" />
      </div>
    </div>

    <p v-if="verdict.rejected" class="bad">✋ Rejected: {{ verdict.rejected }} Reword it, or try another angle.</p>
    <p v-else-if="verdict.duplicateOf" class="ai">🔁 Jev thinks that’s the same as {{ verdict.duplicateOf }}.</p>
    <template v-else>
      <p v-if="riskLine" class="risk small">⚠️ {{ riskLine }}</p>
      <p v-if="verdict.repeatOf" class="warn small">
        🔁 Jev thinks you’ve done this before ({{ verdict.repeatOf }}), so it’s one step less effective.
      </p>
      <fieldset v-for="t in verdict.torn" :key="t.key" class="torn">
        <legend class="small">Jev is torn on {{ t.topic }}.</legend>
        <label v-for="(o, i) in t.options" :key="o.value" class="choice">
          <input
            type="radio"
            :name="`torn-${t.key}`"
            :value="o.value"
            :checked="(verdict.picks[t.key] ?? t.options[0]!.value) === o.value"
            @change="emit('pick', t.key, o.value)"
          />
          <span>
            <strong>{{ o.label }}</strong>
            <template v-if="t.catch && i === 0"><span class="muted">: exactly what you proposed</span></template>
            <template v-else-if="t.catch">
              <span class="muted">, but </span>
              <span class="warn" :title="complicationName(t.catch).rule">
                {{ complicationName(t.catch).icon }} {{ complicationName(t.catch).name }}
              </span>
              <span class="muted small">({{ lower(complicationName(t.catch).rule) }})</span>
            </template>
          </span>
        </label>
      </fieldset>

      <slot />
    </template>

    <div class="actions">
      <button type="button" @click="emit('edit')">← Edit</button>
      <button
        v-if="saveLabel"
        type="button"
        class="primary"
        :disabled="!!verdict.rejected || !!verdict.duplicateOf || game.busy"
        title="Banks every option to the Research tab, for one action"
        @click="emit('save')"
      >
        {{ saveLabel }}
      </button>
      <button
        v-else-if="acceptLabel"
        type="button"
        class="primary"
        :disabled="!!verdict.rejected || !!verdict.duplicateOf || game.busy"
        @click="emit('accept')"
      >
        {{ acceptLabel }}
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { complicationName } from '@/engine/proposals'
import { RISK_BONUS, riskText } from '@/engine/risk'
import { useGameStore, type Verdict } from '@/stores/game'

const props = defineProps<{ verdict: Verdict; acceptLabel?: string | null; saveLabel?: string }>()
const emit = defineEmits<{
  pick: [key: string, value: string]
  accept: []
  save: []
  edit: []
}>()
const game = useGameStore()

const pct = (p: number) => `${Math.round(p * 100)}%`
const riskLine = computed(() => {
  const v = props.verdict
  return v.risk && v.kind in RISK_BONUS ? riskText(v.risk, v.kind as keyof typeof RISK_BONUS) : ''
})
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1).replace(/\.$/, '')
</script>

<style scoped>
.verdict {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.verdict p {
  margin: 0;
}

.bar-meter {
  position: relative;
  margin-top: 4px;
  overflow: visible;
}

.mark {
  position: absolute;
  top: -3px;
  bottom: -3px;
  width: 2px;
  background: var(--text);
}

.risk {
  border: 1px solid var(--bad);
  border-radius: 6px;
  padding: 6px 10px;
  color: var(--bad);
}

.torn {
  border: 1px solid rgb(167 139 250 / 0.4);
  border-radius: 6px;
  padding: 6px 10px 8px;
  margin: 0;
}

.choice {
  display: flex;
  gap: 8px;
  align-items: center;
  font-size: 13px;
  padding: 2px 0;
}

.choice input {
  width: auto;
}

.actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
}
</style>
