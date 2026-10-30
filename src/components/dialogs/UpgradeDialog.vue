<template>
  <ConsoleDialog :title="`Upgrade ${name}`" title-id="upgrade-title" tag="UPG" @close="ui.closeInvent()">
    <template #help><HelpTip :text="UPGRADE_HELP" /></template>

    <div v-if="game.busy" class="scan">
      <Led tone="warn" blink />
      <span>Jev is looking for ways to improve {{ name }}…</span>
    </div>
    <p v-else-if="error" class="feedback">{{ error }}</p>
    <p v-else-if="game.jev.kind !== 'ready'" class="feedback">Upgrades need Jev: its LED in the top bar is off.</p>

    <p v-if="redo" class="redo">
      ↻ {{ name }} already runs {{ redo.label }}, +{{ redo.iq }} IQ over its {{ redo.hardware }} IQ hardware. A software upgrade here
      <strong>replaces</strong> that +{{ redo.iq }}; it doesn’t add to it. Each option’s IQ is the hardware plus its new size, at full cost.
    </p>

    <div v-if="offer" class="meters">
      <JudgementReport :exchanges="game.reportFor(offer)" />
    </div>
    <div v-if="offer" class="cards">
      <PartSheet v-for="(o, i) in offer.options" :key="o.key" :part="`OPT-${String.fromCharCode(65 + i)}`" :title="o.name">
        <p>
          <span v-if="o.tier !== undefined" class="chip" title="Each upgrade to the same strategy is a tier harder than the last">Tier {{ o.tier }} technology</span>
          <span class="chip" :class="best < o.minIQ ? 'bad' : 'good'">IQ {{ o.minIQ }}</span>
        </p>
        <ul class="changes">
          <li v-for="c in o.changes" :key="JSON.stringify(c)">{{ describeChange(game.state, offer.target, c) }}</li>
        </ul>
        <p class="muted">Uses up {{ describeCost(game.state, o.cost) || 'nothing' }}</p>
        <p v-if="o.risk" class="bad">⚠ {{ riskText(o.risk, 'upgrade') }}</p>
        <div class="likely" :title="`Jev: ${Math.round(o.p * 100)}% the most natural`">
          <span class="lbl">Natural</span>
          <Gauge :value="o.p" :max="1" :segments="10" tone="copper" />
          <span class="num">{{ Math.round(o.p * 100) }}%</span>
        </div>
        <template #actions>
          <ApplyButtons :blocker="blockers[i] ?? null" @apply="choose(i, true)" />
        </template>
      </PartSheet>
    </div>
    <div v-if="offer" class="actions">
      <button type="button" class="primary" :disabled="game.busy" title="Banks every option to the Research tab, for one action" @click="choose()">
        Save For Later
      </button>
    </div>
  </ConsoleDialog>
</template>

<script setup lang="ts">
import { computed, ref, toRaw, watch } from 'vue'
import { upgradeApplyBlocker } from '@/engine/banking'
import { describeCost, findMind, iqFor, softwareLabel } from '@/engine/model'
import { riskText } from '@/engine/risk'
import { describeChange, targetName, type UpgradeOffer } from '@/engine/upgrade'
import { useGameStore } from '@/stores/game'
import { useUiStore, type InventRequest } from '@/stores/ui'
import ConsoleDialog from '../kit/ConsoleDialog.vue'
import Gauge from '../kit/SegGauge.vue'
import Led from '../kit/StatusLed.vue'
import ApplyButtons from './ApplyButtons.vue'
import { UPGRADE_HELP } from './copy'
import HelpTip from './HelpTip.vue'
import JudgementReport from './JudgementReport.vue'
import PartSheet from './PartSheet.vue'

const props = defineProps<{ request: InventRequest }>()
const game = useGameStore()
const ui = useUiStore()

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
.scan {
  display: flex;
  align-items: center;
  gap: 8px;
  padding: 8px 10px;
  font-family: var(--font-mono);
  font-size: 12.5px;
  color: var(--lcd-fg);
  background: var(--lcd-bg);
  border: 1px solid #000;
}

.feedback {
  margin: 0;
  font-size: 13px;
  color: var(--bad);
}

.redo {
  margin: 0;
  padding: 6px 10px;
  border-left: 3px solid var(--led-a);
  font-size: 12.5px;
  color: var(--led-a);
}

.changes {
  margin: 0;
  padding-left: 16px;
}

.likely {
  display: flex;
  align-items: center;
  gap: 6px;
  margin-top: auto;
  font-size: 11px;
}

.likely .lbl {
  color: var(--ink-2);
}

.actions,
.meters {
  display: flex;
  justify-content: flex-end;
}
</style>
