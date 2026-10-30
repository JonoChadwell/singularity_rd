<template>
  <span class="report">
    <button
      type="button"
      class="small"
      :disabled="!exchanges.length"
      :title="exchanges.length ? 'Everything Jev read and answered for this' : 'No record: judged before the page was loaded'"
      @click="show"
    >
      Report
    </button>
    <dialog ref="el" class="judgement" aria-label="Judgement Report" @click.self="el?.close()">
      <DataSheet part="JEV-RPT" title="Judgement Report" icon="📋" :subtitle="subtitle">
        <template #head><button type="button" class="small close" aria-label="Close report" @click="el?.close()">✕</button></template>

        <template v-for="(x, n) in exchanges" :key="n">
          <section>
            <h4>{{ exchanges.length > 1 ? `Call ${n + 1}: ` : '' }}The world, as Jev read it</h4>
            <p class="note">{{ x.purpose || 'unlabelled' }} · {{ x.cached ? 'answered from the save’s cache' : 'answered live' }}</p>
            <pre class="world">{{ x.state }}</pre>
          </section>

          <section v-for="q in questionsOf(x)" :key="q.key">
            <h4>
              <span class="num">{{ q.key }}</span>
              <span class="type">{{ q.type }}</span>
            </h4>
            <p class="ask">{{ q.instructions }}</p>
            <table class="odds">
              <tbody>
                <tr v-for="r in q.rows" :key="r.key" :class="{ top: r.top }">
                  <td class="mark">{{ r.top ? '▸' : '' }}</td>
                  <td class="ref num">{{ r.key }}</td>
                  <td class="label">{{ r.label }}</td>
                  <td class="bar"><span :style="{ width: `${Math.round((r.p ?? 0) * 100)}%` }" /></td>
                  <td class="pct num">{{ r.p === null ? '–' : `${Math.round(r.p * 100)}%` }}</td>
                </tr>
              </tbody>
            </table>
            <p v-if="q.summary" class="note num">{{ q.summary }}</p>
          </section>
        </template>

        <template #foot>
          <button type="button" class="small" @click="copy">Copy as JSON</button>
          <span class="note">{{ copied }}</span>
        </template>
      </DataSheet>
    </dialog>
  </span>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import type { JevAnswer, JevExchange, JevQuestion } from '@/ai/jev'
import DataSheet from '../kit/DataSheet.vue'

/** Everything Jev was asked and answered for one verdict or offer, as a datasheet over the dialog. */
const props = defineProps<{ exchanges: JevExchange[] }>()

const el = ref<HTMLDialogElement>()
const copied = ref('')

function show() {
  copied.value = ''
  el.value?.showModal()
}

const subtitle = computed(() => {
  const n = props.exchanges.reduce((sum, x) => sum + Object.keys(x.questions).length, 0)
  const calls = props.exchanges.length
  return `${calls === 1 ? 'One call' : `${calls} calls`} to Jev, ${n} question${n === 1 ? '' : 's'}: every input in full, and the odds Jev gave each answer.`
})

interface Row {
  key: string
  label: string
  p: number | null
  top: boolean
}

/** One question's options, each with Jev's odds, the one it picked marked. */
function rowsFor(q: JevQuestion, a: JevAnswer | undefined): Row[] {
  if (q.type === 'noul') {
    const p = a?.type === 'noul' ? a.noul : null
    return [
      { key: 'yes', label: 'Yes', p, top: p !== null && p >= 0.5 },
      { key: 'no', label: 'No', p: p === null ? null : 1 - p, top: p !== null && p < 0.5 }
    ]
  }
  const odds = a && a.type !== 'noul' ? a.probabilities : undefined
  if (q.type === 'choice') {
    const picked = a?.type === 'choice' ? a.choice : null
    return Object.entries(q.criteria).map(([key, label]) => ({
      key,
      label: label ?? '',
      p: odds?.[key] ?? (picked === null ? null : picked === key ? 1 : 0),
      top: picked === key
    }))
  }
  const best = odds ? Object.entries(odds).sort((x, y) => y[1] - x[1])[0]?.[0] : a?.type === 'score' ? String(Math.round(a.score)) : null
  return q.criteria.map((label, i) => ({ key: String(i), label, p: odds?.[String(i)] ?? null, top: best === String(i) }))
}

/** Jev's own figures beside the odds: a score's mean, and how sure it was. */
function summaryOf(a: JevAnswer | undefined): string {
  if (!a) return 'No answer.'
  if (a.type === 'noul') return ''
  const parts = a.type === 'score' ? [`Score ${a.score.toFixed(2)}`] : []
  if (a.confidence !== undefined) parts.push(`Confidence ${a.confidence.toFixed(2)}`)
  return parts.join(' · ')
}

const questionsOf = (x: JevExchange) =>
  Object.entries(x.questions).map(([key, q]) => ({
    key,
    type: q.type,
    instructions: q.instructions,
    rows: rowsFor(q, x.answers[key]),
    summary: summaryOf(x.answers[key])
  }))

async function copy() {
  try {
    await navigator.clipboard.writeText(JSON.stringify(props.exchanges, null, 2))
    copied.value = 'Copied.'
  } catch {
    copied.value = 'The clipboard is blocked.'
  }
}
</script>

<style scoped>
.report {
  margin-left: auto;
}

.judgement {
  width: min(860px, calc(100vw - 24px));
  max-height: calc(100vh - 32px);
  padding: 0;
  border: 0;
  background: transparent;
  overflow: hidden;
}

.judgement[open] {
  display: flex;
  flex-direction: column;
}

.judgement::backdrop {
  background: rgb(8 10 6 / 0.6);
}

.judgement > :deep(.sheet) {
  min-height: 0;
  overflow-y: auto;
}

.close {
  padding: 1px 7px;
}

h4 {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.type {
  margin-left: auto;
  font-weight: 400;
  letter-spacing: 0.04em;
  color: var(--ink-2);
}

.ask {
  margin-bottom: 4px !important;
}

.world {
  margin: 4px 0 0;
  max-height: 260px;
  overflow: auto;
  padding: 6px 8px;
  white-space: pre-wrap;
  font-family: var(--font-mono);
  font-size: 11.5px;
  background: rgb(0 0 0 / 0.05);
  border: 1px dashed var(--rule);
}

.odds {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

.odds td {
  padding: 1px 4px;
  vertical-align: middle;
  border-bottom: 1px dotted var(--paper-3);
}

.odds .mark {
  width: 1em;
  color: #6a3d00;
}

.odds .ref {
  width: 1%;
  white-space: nowrap;
  color: var(--ink-2);
}

.odds .bar {
  width: 22%;
}

.odds .bar span {
  display: block;
  height: 8px;
  background: var(--copper);
}

.odds .pct {
  width: 3.5em;
  text-align: right;
}

.odds tr.top {
  font-weight: 700;
  background: rgb(184 122 53 / 0.12);
}
</style>
