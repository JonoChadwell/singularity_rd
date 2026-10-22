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
      <fieldset v-if="payChoices.length > 1" class="torn pay">
        <legend class="small">Pay for it with</legend>
        <label v-for="(p, i) in payChoices" :key="p.resourceId" class="choice">
          <input
            type="radio"
            name="pay"
            :value="p.resourceId"
            :checked="(verdict.picks.pay ?? payChoices[0]!.resourceId) === p.resourceId"
            @change="emit('pick', 'pay', p.resourceId)"
          />
          <span>
            {{ resourceLabel(p.resourceId) }}
            <span class="muted small">{{ i === 0 ? '(Jev’s pick)' : `(Jev: ${pct(p.p)})` }}</span>
          </span>
        </label>
      </fieldset>
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

      <div v-if="verdict.kind === 'unit'" class="traits small">
        <div class="row">
          <span class="muted">Traits:</span>
          <TraitChips v-if="keptList.length" :traits="keptList" />
          <span v-else class="muted">none</span>
        </div>
        <div v-if="optional.length" class="row">
          <span class="muted" title="Jev wasn’t sure. Perks raise the price; drawbacks lower it.">Your call:</span>
          <label v-for="t in optional" :key="t.trait" class="choice" :title="TRAITS[t.trait].rule">
            <input
              type="checkbox"
              :checked="kept.has(t.trait)"
              :disabled="!kept.has(t.trait) && kept.size >= MAX_TRAITS"
              @change="emit('trait', t.trait, !kept.has(t.trait))"
            />
            {{ TRAITS[t.trait].icon }} {{ TRAITS[t.trait].name }}
          </label>
        </div>
      </div>

      <slot />
    </template>

    <div class="actions">
      <button type="button" @click="emit('edit')">← Edit</button>
      <button
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
import { MAX_TRAITS } from '@/engine/balance'
import { findResource } from '@/engine/model'
import { complicationName, payOptions } from '@/engine/proposals'
import { RISK_BONUS, riskText } from '@/engine/risk'
import TraitChips from './TraitChips.vue'
import { TRAITS } from '@/engine/traits'
import { chosenTraits, nearLine } from '@/engine/unitProposal'
import { useGameStore, type Verdict } from '@/stores/game'

const props = defineProps<{ verdict: Verdict; acceptLabel: string }>()
const emit = defineEmits<{
  pick: [key: string, value: string]
  trait: [trait: keyof typeof TRAITS, on: boolean]
  accept: []
  edit: []
}>()
const game = useGameStore()

const pct = (p: number) => `${Math.round(p * 100)}%`
/** Jev's favourite stocks to pay with; the player may choose among them. */
const payChoices = computed(() => (props.verdict.kind === 'plan' ? [] : payOptions(props.verdict).filter((p) => p.p > 0)))
const resourceLabel = (id: string) => {
  const r = findResource(game.state, id)
  return r ? `${r.icon} ${r.name}` : id
}
const riskLine = computed(() => {
  const v = props.verdict
  return v.risk && v.kind in RISK_BONUS ? riskText(v.risk, v.kind as keyof typeof RISK_BONUS) : ''
})
const keptList = computed(() => (props.verdict.kind === 'unit' ? chosenTraits(props.verdict).map((t) => t.trait) : []))
const kept = computed(() => new Set<string>(keptList.value))
/** Traits near the line that the player decides. A few at most, so the list stays readable. */
const optional = computed(() => (props.verdict.kind === 'unit' ? props.verdict.traitOdds.filter(nearLine).slice(0, 4) : []))
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

.traits {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.actions {
  display: flex;
  justify-content: space-between;
  gap: 10px;
  margin-top: 4px;
}
</style>
