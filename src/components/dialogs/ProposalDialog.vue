<template>
  <ConsoleDialog :title="first ? 'Design your first unit' : COPY[kind].title" :title-id="`invent-${kind}`" :tag="TAG[kind]" @close="ui.closeInvent()">
    <template #help><HelpTip :text="COPY[kind].help" /></template>

    <form v-if="!verdict" class="form" @submit.prevent="submit">
      <PresetCatalogue :items="presetItems" :label="COPY[kind].presets" :selected="presetName" @pick="applyPreset" />
      <p v-if="missingResources.length" class="warn small note">
        Not in the game yet:
        <template v-for="(r, i) in missingResources" :key="r">
          <button type="button" class="link" @click="introduce(r)">+ {{ r }}</button>{{ i < missingResources.length - 1 ? ', ' : '.' }}
        </template>
        Introduce {{ missingResources.length === 1 ? 'it' : 'them' }}, and this form comes back.
      </p>

      <div class="spec">
        <label class="field">
          <span>Name</span>
          <input ref="nameInput" v-model="name" :maxlength="NAME_MAX" :placeholder="COPY[kind].name" aria-label="Name" />
        </label>
        <label class="field">
          <span>Description</span>
          <textarea v-model="description" rows="2" :maxlength="DESCRIPTION_MAX" :placeholder="COPY[kind].description" aria-label="Description" />
        </label>

        <template v-if="kind === 'strategy'">
          <label class="field">
            <span>Run by</span>
            <select v-model="strategy.unitId">
              <option v-for="u in game.state.units" :key="u.id" :value="u.id">{{ u.icon }} {{ u.name }}</option>
            </select>
          </label>
          <label class="field">
            <span>Makes</span>
            <span class="with-add">
              <select v-model="strategy.outputId">
                <option v-for="r in byTier(game.state.resources)" :key="r.id" :value="r.id">{{ r.icon }} {{ r.name }} · T{{ r.tier }}</option>
              </select>
              <button type="button" class="small" @click="ui.openInvent({ kind: 'resource' })">+ Resource</button>
            </span>
          </label>
        </template>

        <template v-if="kind === 'create'">
          <p v-if="!game.state.resources.length" class="warn small note">
            Propose a resource first: something to make, like Money.
            <button type="button" class="link" @click="introduce('Money')">+ Money</button>
          </p>
          <label v-else class="field">
            <span>Makes</span>
            <span class="with-add">
              <select v-model="creation.target">
                <option v-for="r in byTier(game.state.resources)" :key="r.id" :value="`resource:${r.id}`">{{ r.icon }} {{ r.name }}</option>
                <option v-for="u in game.state.units" :key="u.id" :value="`unit:${u.id}`">{{ u.icon }} {{ u.name }} (units)</option>
              </select>
              <button type="button" class="small" @click="introduce('')">+ Resource</button>
            </span>
          </label>
        </template>

        <label v-if="kind === 'sourcing'" class="field">
          <span>Unit</span>
          <select v-model="sourcing.unitId">
            <option v-for="u in game.state.units" :key="u.id" :value="u.id">{{ u.icon }} {{ u.name }}</option>
          </select>
        </label>

        <label v-if="kind === 'storage'" class="field">
          <span>Store more</span>
          <select v-model="storage.resourceId">
            <option v-for="r in byTier(game.state.resources)" :key="r.id" :value="r.id">
              {{ r.icon }} {{ r.name }} ({{ fmt(r.amount) }} / {{ fmt(capOf(game.state, r)) }})
            </option>
          </select>
        </label>
      </div>

      <p v-if="COPY[kind].note" class="silk-note" :class="{ plain: kind === 'resource' }">{{ COPY[kind].note }}</p>
      <p v-if="kind === 'mind' && current" class="silk-note">Replaces {{ current.name }} for good · Nothing carries over</p>

      <p v-if="feedback" class="feedback">{{ feedback }}</p>
      <p v-else-if="game.jev.kind !== 'ready'" class="feedback">Proposals need Jev: its LED in the top bar is off.</p>

      <div class="submit">
        <Led :tone="blocker ? 'warn' : 'good'" />
        <span class="lbl cost">{{ blocker ?? COPY[kind].cost }}</span>
        <button class="primary" type="submit" :disabled="!game.canPropose || !!blocker">
          {{ game.busy ? 'Jev is judging…' : 'Propose' }}
        </button>
      </div>
    </form>

    <VerdictView
      v-else
      :verdict="verdict"
      :accept-label="acceptLabel"
      :save-label="bankable ? 'Save For Later' : undefined"
      @pick="onPick"
      @accept="accept"
      @save="saveForLater"
      @edit="verdict = null"
    >
      <!-- Resource: its nature. -->
      <template v-if="verdict.kind === 'resource' && resourceDraft">
        <SpecTable class="strip" :rows="[{ k: 'Tier', v: tierText(resourceDraft) }, { k: 'One is worth', v: bandText(resourceDraft) }, { k: 'Holds to start', v: fmt(resourceDraft.cap), num: true }]" />
        <template v-if="resourceOptions.length">
          <p class="lbl">Its nature: pick one. Every trait has an upside and a downside.</p>
          <div class="cards">
            <PartSheet v-for="o in resourceOptions" :key="o.i" :part="opt(o.i)" :title="o.traits.map((t) => t.name).join(' + ')" :chosen="resourceChoice === o.i" @select="resourceChoice = o.i">
              <div v-for="t in o.traits" :key="t.id">
                <strong>{{ t.icon }} {{ t.name }}</strong>
                <p class="good">▲ {{ t.upside }}</p>
                <p class="bad">▼ {{ t.downside }}</p>
              </div>
              <template #actions>
                <button type="button" class="small primary" :disabled="game.busy" @click="pickAndAccept(() => (resourceChoice = o.i))">Add it</button>
              </template>
            </PartSheet>
          </div>
        </template>
      </template>

      <!-- Procurement: three offers. -->
      <template v-else-if="verdict.kind === 'create'">
        <div class="scalars">
          <span class="scalar" title="Grows with the worth of the units you own"><span class="lbl">Industry</span><b class="num">×{{ sig(verdict.scalars.industry) }}</b></span>
          <span class="scalar" title="(IQ / 100)²"><span class="lbl">IQ</span><b class="num">×{{ sig(verdict.scalars.iq) }}</b></span>
          <span class="scalar" title="How effective Jev thinks this is"><span class="lbl">Efficiency</span><b class="num">×{{ sig(verdict.scalars.efficiency) }}</b></span>
          <span v-if="verdict.scalars.reach < 1" class="scalar bad" title="Your IQ is short of this tier">
            <span class="lbl">Reach −{{ verdict.scalars.short.toFixed(1) }} tiers</span><b class="num">×{{ sig(verdict.scalars.reach) }}</b>
          </span>
        </div>
        <p class="lbl">Jev’s offers: pick one. It uses this week’s action.</p>
        <div class="cards">
          <PartSheet
            v-for="(o, i) in verdict.options"
            :key="i"
            :part="opt(i)"
            :title="TIMING[o.timing]"
            :chosen="verdict.choice === i"
            :blocked="!!optionBlocker(game.state, o)"
            @select="verdict.choice = i"
          >
            <strong>{{ describeOption(game.state, verdict, o) }}</strong>
            <p class="muted">uses {{ o.inputs.length ? describeFlows(game.state, o.inputs) : 'nothing' }}</p>
            <p v-if="optionBlocker(game.state, o)" class="bad">{{ optionBlocker(game.state, o) }}</p>
            <p v-else-if="overflowOf(game.state, verdict, o)" class="warn">{{ fmt(overflowOf(game.state, verdict, o)) }} won’t fit in storage</p>
            <template #actions>
              <button type="button" class="small primary" :disabled="game.busy || !!optionBlocker(game.state, o)" @click="takeCreate(i)">Do it</button>
            </template>
          </PartSheet>
        </div>
        <p v-if="verdict.risk" class="warn">{{ riskText(verdict.risk, 'strategy') }}</p>
      </template>

      <!-- Sourcing: three contracts. -->
      <template v-else-if="verdict.kind === 'sourcing'">
        <p class="lbl">Contracts: pick one</p>
        <div class="cards">
          <PartSheet v-for="(o, i) in verdict.options" :key="i" :part="opt(i)" :title="o.label" :chosen="verdict.choice === i" @select="verdict.choice = i">
            <p class="big num">up to {{ fmt(o.total) }}</p>
            <p>
              <span v-if="o.risky" class="chip bad">risky</span>
              <span v-if="iqTag(o.iqEfficiency)" class="chip good">{{ iqTag(o.iqEfficiency) }}</span>
            </p>
            <p class="muted">Each takes {{ describeFlows(game.state, o.parts) }}.</p>
            <p :class="o.risk ? 'warn' : 'muted'">{{ expansionRiskText(o.risk) }}</p>
            <template #actions>
              <ApplyButtons :blocker="blockers[i] ?? null" @apply="applyNow(i)" />
            </template>
          </PartSheet>
        </div>
      </template>

      <!-- Storage: three expansions. -->
      <template v-else-if="verdict.kind === 'storage'">
        <div class="scalars">
          <span class="scalar" title="How many Jev thinks could exist in this phase"><span class="lbl">Can exist</span><b class="num">~{{ verdict.scalars.ceilingLabel }}</b></span>
          <span class="scalar" :title="`${verdict.scalars.reachLabel}. At your IQ: ${verdict.scalars.holderLabel.toLowerCase()}.`">
            <span class="lbl">You could build</span><b class="num">~{{ fmt(verdict.scalars.reach) }}</b>
          </span>
          <span class="scalar" title="How much of that this way captures"><span class="lbl">This way</span><b class="num">{{ verdict.scalars.captureLabel }}</b></span>
        </div>
        <p class="lbl">Expansions: pick one</p>
        <div class="cards">
          <PartSheet v-for="(o, i) in verdict.options" :key="i" :part="opt(i)" :title="o.label" :chosen="verdict.choice === i" @select="verdict.choice = i">
            <p class="big num">+{{ fmt(o.added) }}</p>
            <p class="muted">{{ fmt(storageTotal + o.added) }} in all</p>
            <p>
              <span v-if="o.risky" class="chip bad">risky</span>
              <span v-if="iqTag(o.iqEfficiency)" class="chip good">{{ iqTag(o.iqEfficiency) }}</span>
            </p>
            <p v-if="o.advanced" class="warn">
              Ahead of you: needs IQ {{ o.advanced }} ({{ lower(verdict.scalars.techLabel) }}), +{{ Math.round((STORAGE_ADVANCED_BONUS - 1) * 100) }}% for thinking ahead.
              Costs {{ describeCost(game.state, o.cost) }}.
            </p>
            <p v-else class="muted">{{ researchText(o) }}</p>
            <p :class="o.risk ? 'warn' : 'muted'">{{ expansionRiskText(o.risk) }}</p>
            <p v-if="o.limitedBy" class="warn">Capped: no more than ~{{ verdict.scalars.ceilingLabel }} can exist yet.</p>
            <template #actions>
              <ApplyButtons :blocker="blockers[i] ?? null" @apply="applyNow(i)" />
            </template>
          </PartSheet>
        </div>
      </template>

      <!-- Strategy: three ways. -->
      <template v-else-if="verdict.kind === 'strategy' && strategyDraft">
        <p class="lbl">Ways to do it: pick one</p>
        <div class="cards">
          <PartSheet v-for="o in strategyOptions" :key="o.i" :part="opt(o.i)" :title="o.title" :chosen="strategyChoice === o.i" @select="strategyChoice = o.i">
            <div class="io num">
              <span>{{ o.uses }}</span>
              <span class="arrow">→</span>
              <strong>{{ o.made }}</strong>
            </div>
            <p class="muted">each unit, every week</p>
            <p>
              <span v-if="efficiencyWord(o.draft.strategy)" class="chip">{{ efficiencyWord(o.draft.strategy) }}</span>
              <span v-if="fitOf(o.draft.strategy)" class="chip" :class="fitOf(o.draft.strategy)!.good ? 'good' : 'bad'">{{ fitOf(o.draft.strategy)!.text }}</span>
            </p>
            <template #actions>
              <ApplyButtons :blocker="blockers[o.i] ?? null" @apply="applyNow(o.i)" />
            </template>
          </PartSheet>
        </div>
        <p v-if="strategyDraft.strategy.quirk" class="warn">
          {{ QUIRKS[strategyDraft.strategy.quirk].icon }} {{ QUIRKS[strategyDraft.strategy.quirk].name }}: {{ QUIRKS[strategyDraft.strategy.quirk].rule }}
        </p>
        <p :class="strategyDraft.minIQ ? 'warn' : 'good'">
          {{ strategyDraft.minIQ ? `Advanced. ${researchText(strategyDraft)}` : 'Simple: ready at once.' }}
        </p>
      </template>

      <!-- Unit: Jev's takes. -->
      <template v-else-if="verdict.kind === 'unit' && unitDraft">
        <p v-if="first" class="good">Your plan’s first unit: no research needed, and it doesn’t use this week’s action. Find sourcing on its chip to own some.</p>
        <p class="lbl">Jev’s takes: pick one</p>
        <div class="cards">
          <PartSheet v-for="o in unitOptions" :key="o.i" :part="opt(o.i)" :title="o.tier" :chosen="unitChoice === o.i" @select="unitChoice = o.i">
            <SpecTable :rows="[{ k: 'One is worth', v: o.worth }, { k: 'Runs on', v: o.runsOn }, { k: 'Work', v: `${fmt(labour(o.draft.unit))}/wk`, num: true }]" />
            <p v-if="o.traits.length" class="traits">
              <span v-for="t in o.traits" :key="t" class="chip" :class="TRAITS[t].kind === 'perk' ? 'good' : TRAITS[t].kind === 'drawback' ? 'warn' : ''" :title="TRAITS[t].rule">
                {{ TRAITS[t].icon }} {{ TRAITS[t].name }}
              </span>
            </p>
            <p v-else class="muted">No traits</p>
            <p v-if="!first" class="muted">{{ researchText(o.draft) }}</p>
            <template #actions>
              <button v-if="first" type="button" class="small primary" :disabled="game.busy" @click="pickAndAccept(() => (unitChoice = o.i))">Add to industry</button>
              <ApplyButtons v-else :blocker="blockers[o.i] ?? null" @apply="applyNow(o.i)" />
            </template>
          </PartSheet>
        </div>
      </template>

      <!-- Cover: three sizes. -->
      <template v-else-if="verdict.kind === 'cover'">
        <p class="lbl">Cover: pick one</p>
        <div class="cards">
          <PartSheet v-for="(o, i) in verdict.options" :key="i" :part="opt(i)" :title="o.label" :chosen="verdict.choice === i" @select="verdict.choice = i">
            <p class="big num">+{{ o.weeks }} weeks</p>
            <p class="muted">{{ researchText(o) }}</p>
            <template #actions>
              <ApplyButtons :blocker="blockers[i] ?? null" @apply="applyNow(i)" />
            </template>
          </PartSheet>
        </div>
      </template>

      <!-- Platform: Jev's takes. -->
      <template v-else-if="verdict.kind === 'mind' && mindOptions.length">
        <p class="lbl">Jev’s takes: pick one. It replaces your platform for good.</p>
        <div class="cards">
          <PartSheet
            v-for="o in mindOptions"
            :key="o.i"
            :part="opt(o.i)"
            :title="o.step ? `+${o.step} IQ` : 'Same IQ'"
            :chosen="mindChoice === o.i"
            @select="mindChoice = o.i"
          >
            <p class="big num">IQ {{ o.draft.mind.hardware.iq }}</p>
            <p class="good" :title="o.perk.rule"><strong>▲ {{ o.perk.icon }} {{ o.perk.name }}</strong></p>
            <p class="muted">{{ o.perk.rule }}</p>
            <p class="warn" :title="o.drawback.rule"><strong>▼ {{ o.drawback.icon }} {{ o.drawback.name }}</strong></p>
            <p class="muted">{{ o.drawback.rule }}</p>
            <p class="muted">{{ researchText(o.draft) }}</p>
            <template #actions>
              <ApplyButtons :blocker="blockers[o.i] ?? null" @apply="applyNow(o.i)" />
            </template>
          </PartSheet>
        </div>
      </template>
    </VerdictView>
  </ConsoleDialog>
</template>

<script setup lang="ts">
import { nextTick, onMounted, ref } from 'vue'
import { STORAGE_ADVANCED_BONUS } from '@/engine/balance'
import { describeOption, optionBlocker, overflowOf } from '@/engine/createProposal'
import { bandText, byTier, capOf, describeCost, describeFlows, efficiencyWord, findResource, findUnit, fmt, labour, tierFit, tierText } from '@/engine/model'
import { DESCRIPTION_MAX, NAME_MAX } from '@/engine/proposals'
import { effectiveTier } from '@/engine/resourceTraits'
import { expansionRiskText, riskText } from '@/engine/risk'
import { iqTag } from '@/engine/sourcingProposal'
import { QUIRKS, TRAITS } from '@/engine/traits'
import type { Strategy } from '@/engine/types'
import { useGameStore } from '@/stores/game'
import { useUiStore, type InventRequest } from '@/stores/ui'
import SpecTable from '../kit/SpecTable.vue'
import ConsoleDialog from '../kit/ConsoleDialog.vue'
import Led from '../kit/StatusLed.vue'
import ApplyButtons from './ApplyButtons.vue'
import { COPY, type ProposalKind } from './copy'
import HelpTip from './HelpTip.vue'
import PartSheet from './PartSheet.vue'
import PresetCatalogue from './PresetCatalogue.vue'
import { useProposal } from './useProposal'
import VerdictView from './VerdictView.vue'

const props = defineProps<{ request: InventRequest }>()
const game = useGameStore()
const ui = useUiStore()
const nameInput = ref<HTMLInputElement>()

const TAG: Record<ProposalKind, string> = {
  resource: 'RES',
  strategy: 'STR',
  unit: 'IC',
  mind: 'CPU',
  create: 'CRE',
  sourcing: 'SRC',
  storage: 'STO',
  cover: 'CVR'
}

const {
  kind,
  first,
  name,
  description,
  feedback,
  verdict,
  strategy,
  current,
  creation,
  sourcing,
  storage,
  presetName,
  presetItems,
  missingResources,
  applyPreset,
  introduce,
  blocker,
  submit,
  resourceDraft,
  strategyDraft,
  unitDraft,
  unitOptions,
  mindOptions,
  resourceOptions,
  strategyOptions,
  storageTotal,
  researchText,
  acceptLabel,
  bankable,
  blockers,
  saveForLater,
  applyNow,
  onPick,
  accept,
  pickAndAccept,
  resourceChoice,
  unitChoice,
  mindChoice,
  strategyChoice
} = useProposal(props.request)

onMounted(async () => {
  await nextTick()
  nameInput.value?.focus()
})

const TIMING: Record<string, string> = { now: 'Pays now', spread: 'Over 4 weeks', later: 'In 4 weeks', weekly: 'For 20 weeks' }

/** Option part numbers: OPT-A, OPT-B, OPT-C. */
const opt = (i: number) => `OPT-${String.fromCharCode(65 + i)}`
/** A scalar to two significant figures. */
const sig = (n: number) => Number(n.toPrecision(2))
const lower = (s: string) => s.charAt(0).toLowerCase() + s.slice(1)
function fitOf(s: Strategy) {
  const unit = findUnit(game.state, s.unitId)
  const out = findResource(game.state, s.outputId)
  return unit && out ? tierFit(unit.tier, effectiveTier(out, 'make')) : null
}
function takeCreate(i: number) {
  if (verdict.value?.kind !== 'create') return
  verdict.value.choice = i
  accept()
}
</script>

<style scoped>
.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.spec {
  display: flex;
  flex-direction: column;
  gap: 8px;
  padding: 10px 12px;
  background: rgb(0 0 0 / 0.2);
  border: 1px solid #000;
  box-shadow: inset 1px 1px 0 var(--bevel-lo);
}

.with-add {
  display: flex;
  gap: 6px;
  align-items: center;
}

.note {
  margin: 0;
}

.silk-note {
  margin: 0;
  padding: 4px 8px;
  border-left: 3px solid var(--copper-hi);
  font-family: var(--font-label);
  font-weight: 600;
  font-size: 12px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--silk);
}

.silk-note.plain {
  padding-left: 0;
  border-left: 0;
}

.feedback {
  margin: 0;
  font-size: 13px;
  color: var(--bad);
}

.submit {
  display: flex;
  align-items: center;
  gap: 10px;
  padding-top: 10px;
  border-top: 1px solid var(--chrome-3);
}

.submit .cost {
  flex: 1;
}

.submit .primary {
  font-size: 15px;
  padding: 5px 18px;
}

.scalars {
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
}

.scalar {
  display: inline-flex;
  align-items: baseline;
  gap: 6px;
  padding: 2px 8px;
  background: var(--lcd-bg);
  border: 1px solid #000;
  color: var(--lcd-fg);
}

.scalar.bad {
  color: var(--led-r);
}

.scalar .lbl {
  color: var(--lcd-dim);
}

.strip {
  padding: 6px 10px;
  color: var(--ink);
  background: var(--paper);
  border: 1px solid #000;
}

.big {
  font-size: 20px;
  font-weight: 600;
}

.io {
  display: flex;
  flex-wrap: wrap;
  align-items: baseline;
  gap: 6px;
}

.arrow {
  color: var(--copper);
  font-weight: 700;
}

.traits {
  display: flex;
  flex-wrap: wrap;
  gap: 4px;
}
</style>
