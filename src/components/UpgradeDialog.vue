<template>
  <dialog ref="dialog" class="panel" aria-labelledby="upgrade-title" @close="ui.closeInvent()">
    <div class="head">
      <div class="title">
        <HelpTip :text="HELP" />
        <h2 id="upgrade-title">Upgrade {{ name }}</h2>
      </div>
      <button type="button" class="close" aria-label="Close" @click="ui.closeInvent()">✕</button>
    </div>

    <p v-if="game.busy" class="muted small">Jev is looking for ways to improve {{ name }}…</p>
    <p v-else-if="error" class="feedback">{{ error }}</p>
    <p v-else-if="game.jev.kind !== 'ready'" class="feedback">Upgrades need Jev. See the banner at the top.</p>

    <div v-if="offer" class="options">
      <article v-for="(o, i) in offer.options" :key="o.key" class="option">
        <div class="row top">
          <strong>💡 {{ o.name }}</strong>
          <span class="row chips">
            <span v-if="o.tier !== undefined" class="chip tier" title="Each upgrade to the same strategy is a tier harder than the last">
              Tier {{ o.tier }} technology
            </span>
            <span class="chip iq" :class="{ bad: best < o.minIQ }">IQ {{ o.minIQ }}</span>
          </span>
        </div>
        <ul class="plain-list small changes">
          <li v-for="c in o.changes" :key="JSON.stringify(c)">{{ describeChange(game.state, offer.target, sized(o, i, c)) }}</li>
        </ul>
        <fieldset v-if="o.sizes" class="sizes">
          <legend class="small muted">How much smarter</legend>
          <label v-for="s in o.sizes" :key="s.step" class="size small">
            <input v-model="step[i]" type="radio" :name="`size-${i}`" :value="s.step" />
            +{{ s.step }} IQ
            <span class="muted">· uses up {{ describeCost(game.state, s.cost) || 'nothing' }}</span>
          </label>
        </fieldset>
        <div v-else class="small muted">Uses up {{ describeCost(game.state, o.cost) }}</div>
        <div v-if="o.risk" class="small bad">⚠️ {{ riskText(o.risk, 'upgrade') }}</div>
        <div class="row foot">
          <span class="small muted">Jev: {{ Math.round(o.p * 100) }}% the most natural</span>
          <button class="small primary" @click="choose(i)">Add as research</button>
        </div>
      </article>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from 'vue'
import { MAX_IQ_STEP } from '@/engine/balance'
import { describeCost, iqFor } from '@/engine/model'
import { riskText } from '@/engine/risk'
import type { Change } from '@/engine/types'
import { describeChange, targetName, type UpgradeOffer, type UpgradeOption } from '@/engine/upgrade'
import { useGameStore } from '@/stores/game'
import { useUiStore, type InventRequest } from '@/stores/ui'
import HelpTip from './HelpTip.vue'

const props = defineProps<{ request: InventRequest }>()
const game = useGameStore()
const ui = useUiStore()
const dialog = ref<HTMLDialogElement>()

const HELP =
  'Jev looks at what this is and offers its three most natural improvements. Pick one and it becomes research, with a minimum IQ and the resources it will use up. A platform gets one software upgrade, ever: pick its size (bigger adds more IQ and costs more), and it may add a perk or take away a drawback. After that, only a new platform goes further. An industry upgrade is technology of the unit’s own tier the first time, and a tier higher each time after, on the same strategy.'

const target = props.request.target!
const name = computed(() => targetName(game.state, target))
const best = computed(() => iqFor(game.state, target.kind === 'unit' ? 'unit-upgrade' : null))
const offer = ref<UpgradeOffer | null>(null)
/** A platform upgrade's chosen size, by option; the biggest to start. */
const step = reactive<Record<number, number>>({ 0: MAX_IQ_STEP, 1: MAX_IQ_STEP, 2: MAX_IQ_STEP })
/** A change as it will be with the chosen size. */
const sized = (o: UpgradeOption, i: number, c: Change): Change =>
  o.sizes && c.kind === 'software' ? { ...c, iq: step[i] ?? MAX_IQ_STEP } : c
const error = ref('')
watch(offer, (o) => o && game.logTo('ui', 'offer_shown', { dialog: 'upgrade', options: o.options.map((x) => x.key) }))

async function ask() {
  const result = await game.requestUpgrade(target)
  if (result) offer.value = result
  else error.value = game.lastError
}

onMounted(() => dialog.value?.showModal?.())
// Ask as soon as the dialog opens, or as soon as Jev is ready.
watch(
  () => game.jev.kind,
  (kind) => {
    if (kind === 'ready' && !offer.value && !error.value && !game.busy) void ask()
  },
  { immediate: true }
)

function choose(index: number) {
  if (!offer.value) return
  const outcome = game.chooseUpgrade(offer.value, index, offer.value.options[index]?.sizes ? step[index] : undefined)
  if (!outcome) {
    error.value = game.lastError
    return
  }
  ui.closeInvent()
  if (outcome.kind === 'research') {
    ui.notice = { tone: 'good', text: `${outcome.research.name} is research: needs IQ ${outcome.research.minIQ}. See Research.` }
  }
}
</script>

<style scoped>
dialog {
  width: min(560px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  color: var(--text);
  padding: 18px;
}

dialog::backdrop {
  background: rgb(5 7 10 / 0.7);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 8px;
}

.head h2 {
  margin: 0;
  font-size: 15px;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text);
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.close {
  border: none;
  background: transparent;
  padding: 2px 6px;
}

.feedback {
  margin: 0;
  font-size: 13px;
  color: var(--bad);
}

.options {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.option {
  border: 1px solid var(--border);
  border-radius: var(--radius);
  padding: 10px 12px;
  background: var(--panel-raised);
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.top,
.foot {
  justify-content: space-between;
  gap: 8px;
}

.chips {
  gap: 6px;
}

.changes {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.chip.bad,
.bad {
  color: var(--bad);
}

.sizes {
  display: flex;
  flex-direction: column;
  gap: 2px;
  margin: 0;
  padding: 4px 8px 6px;
  border: 1px solid var(--border);
  border-radius: var(--radius);
}

.size {
  display: flex;
  gap: 6px;
  align-items: center;
}

.size input {
  width: auto;
}
</style>
