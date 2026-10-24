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

    <p v-if="redo" class="feedback small">
      🔁 {{ name }} already runs {{ redo.label }}, +{{ redo.iq }} IQ over its {{ redo.hardware }} IQ hardware. A software upgrade
      here <strong>replaces</strong> that +{{ redo.iq }}; it doesn’t add to it. Each option’s IQ is the hardware plus its new size, at full cost.
    </p>

    <div v-if="offer" class="cards">
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
          <li v-for="c in o.changes" :key="JSON.stringify(c)">{{ describeChange(game.state, offer.target, c) }}</li>
        </ul>
        <div class="small muted">Uses up {{ describeCost(game.state, o.cost) || 'nothing' }}</div>
        <div v-if="o.risk" class="small bad">⚠️ {{ riskText(o.risk, 'upgrade') }}</div>
        <div class="grow" />
        <div class="small muted">Jev: {{ Math.round(o.p * 100) }}% the most natural</div>
        <ApplyButtons :blocker="blockers[i] ?? null" @apply="choose(i, true)" />
      </article>
    </div>
    <div v-if="offer" class="actions">
      <button type="button" class="primary" :disabled="game.busy" title="Banks every option to the Research tab, for one action" @click="choose()">
        Save For Later
      </button>
    </div>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, ref, toRaw, watch } from 'vue'
import { describeCost, findMind, iqFor, softwareLabel } from '@/engine/model'
import { riskText } from '@/engine/risk'
import { describeChange, targetName, type UpgradeOffer } from '@/engine/upgrade'
import { useGameStore } from '@/stores/game'
import { useUiStore, type InventRequest } from '@/stores/ui'
import { upgradeApplyBlocker } from '@/engine/banking'
import ApplyButtons from './ApplyButtons.vue'
import HelpTip from './HelpTip.vue'

const props = defineProps<{ request: InventRequest }>()
const game = useGameStore()
const ui = useUiStore()
const dialog = ref<HTMLDialogElement>()

const HELP =
  'Jev looks at what this is and offers its three most natural improvements. Pick one and it becomes research, with a minimum IQ and the resources it will use up. A platform’s software upgrade adds IQ over its bare hardware: each option has its own size (bigger adds more IQ and costs more; the sizes on offer change each week), and it may add a perk or take away a drawback. It can be redone, but a redo replaces the last upgrade instead of adding to it, and costs in full; only a new platform goes further. An industry upgrade is technology of the unit’s own tier the first time, and a tier higher each time after, on the same strategy.'

const target = props.request.target!
const name = computed(() => targetName(game.state, target))
/** The platform's current software upgrade, which any new one replaces. */
const redo = computed(() => {
  if (target.kind !== 'mind') return null
  const m = findMind(game.state, target.id)
  return m?.software.upgraded ? { label: softwareLabel(m), iq: m.software.iq, hardware: m.hardware.iq } : null
})
const best = computed(() => iqFor(game.state, target.kind === 'unit' ? 'unit-upgrade' : null))
const offer = ref<UpgradeOffer | null>(null)
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

/** Why each option can't be applied now, or null: the buttons grey out on it. */
const blockers = computed<(string | null)[]>(() => {
  if (!offer.value) return []
  const plain = JSON.parse(JSON.stringify(offer.value)) as UpgradeOffer
  return plain.options.map((_, i) => upgradeApplyBlocker(toRaw(game.state), plain, i))
})

/** Saves every option to Research, or with `now`, researches just that one at once. */
function choose(index?: number, now = false) {
  if (!offer.value) return
  const outcome = game.bankOffer(offer.value, index, now)
  if (!outcome) {
    error.value = game.lastError
    return
  }
  ui.closeInvent()
  const n = offer.value.options.length
  ui.notice = {
    tone: 'good',
    text: now ? `${targetName(game.state, target)} upgraded.` : `Saved ${n} option${n === 1 ? '' : 's'} to Research.`
  }
}
</script>

<style scoped>
dialog {
  width: min(900px, calc(100vw - 32px));
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

.actions {
  display: flex;
  justify-content: flex-end;
  margin-top: 10px;
}

.grow {
  flex: 1;
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
</style>
