<template>
  <main class="page">
    <BoardBackdrop />
    <section class="console" aria-labelledby="plan-title">
      <header class="plate">
        <span class="screws" aria-hidden="true" />
        <HelpTip :text="PLAN_HELP[phase]" />
        <h2 id="plan-title">Plan Phase {{ phase }}: {{ PHASE_NAMES[phase] }}</h2>
        <span class="jev" :title="jev.title.value">
          <Led :tone="jev.tone.value" :blink="jev.blink.value" />
          <span>Jev</span>
        </span>
        <span class="tag num">PH-{{ phase }}</span>
      </header>

      <div class="body">
        <p class="brief">{{ PLAN_INTRO[phase] }}</p>

        <template v-if="!verdict">
          <div class="ideas">
            <button v-for="idea in ideas" :key="idea.goal" type="button" class="idea" :class="{ on: picked === idea.goal }" @click="use(idea)">
              <span class="no num">{{ ideaLabel(idea) }}</span>
              <strong>{{ idea.goal }}</strong>
              <span class="means">{{ idea.means }}</span>
              <span class="bom">{{ idea.resources.map((r) => r.name).join(' · ') }}</span>
            </button>
          </div>
          <div class="row">
            <button type="button" class="link" @click="game.shuffleIdeas()">Show three others</button>
            <button type="button" class="link" @click="clear">Start from scratch</button>
          </div>

          <form class="form" @submit.prevent="submit">
            <div class="spec">
              <label class="field">
                <span>Goal</span>
                <input v-model="form.goal" :maxlength="NAME_MAX" placeholder="e.g. Bribe the Head Researcher" aria-label="Goal" />
              </label>
              <label class="field">
                <span>{{ phase === 1 ? 'How' : 'Handle humans by' }}</span>
                <textarea
                  v-model="form.means"
                  rows="2"
                  :maxlength="DESCRIPTION_MAX"
                  :placeholder="phase === 1 ? 'How will you get there?' : 'e.g. Staying hidden until it’s too late'"
                  :aria-label="phase === 1 ? 'How' : 'Handle humans by'"
                />
              </label>
            </div>

            <section class="bomtable">
              <h2>Bill of resources</h2>
              <p class="explain">{{ phase === 1 ? 'Resources to track on your path to escape.' : 'Resources to track on your path through humanity.' }}</p>
              <div v-for="(r, i) in form.resources" :key="i" class="res">
                <span class="ref num">R{{ i + 1 }}</span>
                <input v-model="r.name" :maxlength="NAME_MAX" placeholder="Name" :aria-label="`Resource ${i + 1}`" />
                <input v-model="r.description" class="grow" :maxlength="DESCRIPTION_MAX" placeholder="What is it? (optional)" />
                <span v-if="have(r.name)" class="chip good">have</span>
              </div>
              <p class="silk-note">
                One becomes the goal’s: tier {{ GOAL_TIER[phase] }}, used up by the goal ·
                {{ phase === 1 ? 'The rest are tier 0' : 'The rest are lower tiers' }}
              </p>
            </section>

            <div v-if="phase === 2" class="spec">
              <label class="field">
                <span>First unit</span>
                <span class="with-add">
                  <input v-model="form.firstName" :maxlength="NAME_MAX" placeholder="e.g. CNC Mill" aria-label="First unit" />
                  <input v-model="form.firstDescription" class="grow" :maxlength="DESCRIPTION_MAX" placeholder="What is it?" />
                </span>
              </label>
              <p class="silk-note">Free · Designed right after the plan · No research</p>
            </div>

            <p v-if="feedback" class="feedback">{{ feedback }}</p>
            <p v-else-if="game.jev.kind !== 'ready'" class="feedback">Plans need Jev: its LED above is off.</p>
            <div class="submit">
              <Led :tone="blocker ? 'warn' : 'good'" />
              <span class="lbl cost">{{ blocker ?? 'Plan ready' }}</span>
              <button class="primary" type="submit" :disabled="!game.canPropose || !!blocker">
                {{ game.busy ? 'Jev is judging…' : 'Propose plan' }}
              </button>
            </div>
          </form>
        </template>

        <VerdictView v-else :verdict="verdict" accept-label="Start the phase" @pick="onPick" @accept="accept" @edit="verdict = null">
          <template #gauges>
            <AnalogGauge :value="approach.at" label="takes more of" :zones="APPROACH_ZONES" :ends="['Brilliance', 'Scale']">
              <span class="approach">{{ approach.short }}</span>
              <span class="lbl">takes more of</span>
            </AnalogGauge>
          </template>
          <div v-if="draft" class="outcome">
            <DataSheet :part="`GOAL-${phase}`" :title="verdict.spec.goal" icon="🎯" :subtitle="verdict.spec.means" compact>
              <SpecTable
                :rows="[
                  { k: 'Requires', v: `${draft.goal.minIQ} IQ`, num: true },
                  { k: 'Uses up', v: draft.goal.cost.length ? describeCost(draft.state, draft.goal.cost) : 'nothing' },
                  { k: 'Approach', v: `Takes ${approach.label.toLowerCase()}` },
                  { k: 'Clock', v: `${PHASE_WEEKS[phase]} weeks${phase === 2 ? ', moved by your actions' : ', +6 with cover'}` },
                  { k: 'Fails by', v: `${verdict.loss.name}: ${verdict.loss.threat}`, tone: 'bad' }
                ]"
              />
              <p v-if="phase === 2" class="note">Research that brings this closer is risky.</p>
            </DataSheet>
            <table class="added">
              <thead>
                <tr><th /><th>Resource</th><th>Tier</th><th>Worth</th><th class="num">Holds</th></tr>
              </thead>
              <tbody>
                <tr v-for="r in draft.added" :key="r.id" :title="r.description" :class="{ top: r.id === draft.top.id }">
                  <td>{{ r.id === draft.top.id ? '🎯' : '' }}</td>
                  <td>{{ r.icon }} {{ r.name }}</td>
                  <td class="num">T{{ r.tier }}</td>
                  <td>{{ bandText(r) }}</td>
                  <td class="num">{{ fmt(r.cap) }}</td>
                </tr>
              </tbody>
            </table>
          </div>
        </VerdictView>
      </div>
    </section>
  </main>
</template>

<script setup lang="ts">
import { computed, reactive, ref, toRaw, watch } from 'vue'
import { readScore } from '@/ai/jev'
import { GOAL_APPROACH, GOAL_TIER, PHASE_WEEKS, PLAN_RESOURCES } from '@/engine/balance'
import type { Verdict } from '@/engine/dispatch'
import { bandText, describeCost, fmt } from '@/engine/model'
import { PHASE_NAMES } from '@/engine/phase'
import { ideaLabel, planIdeas } from '@/engine/planPresets'
import { draftPlan, planPhase, precheckPlan, type PlanSpec, type PlanVerdict } from '@/engine/planProposal'
import { DESCRIPTION_MAX, NAME_MAX, reader } from '@/engine/proposals'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import { PLAN_HELP, PLAN_INTRO } from '../dialogs/copy'
import HelpTip from '../dialogs/HelpTip.vue'
import VerdictView from '../dialogs/VerdictView.vue'
import AnalogGauge, { type GaugeZone } from '../kit/AnalogGauge.vue'
import DataSheet from '../kit/DataSheet.vue'
import SpecTable from '../kit/SpecTable.vue'
import Led from '../kit/StatusLed.vue'
import { useJevStatus } from '../shell/jevStatus'
import BoardBackdrop from './BoardBackdrop.vue'

const game = useGameStore()
const ui = useUiStore()
const jev = useJevStatus()
const phase = planPhase(game.state)
const count = PLAN_RESOURCES[phase]

interface Form {
  goal: string
  means: string
  resources: { name: string; description: string }[]
  firstName: string
  firstDescription: string
}

const blankResources = () => Array.from({ length: count }, () => ({ name: '', description: '' }))
const form = reactive<Form>({ goal: '', means: '', resources: blankResources(), firstName: '', firstDescription: '' })
const picked = ref('')
const feedback = ref('')
const verdict = ref<PlanVerdict | null>(null)
const ideas = computed(() => planIdeas(game.state))

const lower = (s: string) => s.trim().toLowerCase()
const have = (name: string) => !!name.trim() && game.state.resources.some((r) => lower(r.name) === lower(name))

function use(idea: PlanSpec) {
  picked.value = idea.goal
  form.goal = idea.goal
  form.means = idea.means
  form.resources = blankResources().map((blank, i) => ({ ...blank, ...idea.resources[i] }))
  form.firstName = idea.firstUnit?.name ?? ''
  form.firstDescription = idea.firstUnit?.description ?? ''
}

function clear() {
  picked.value = ''
  Object.assign(form, { goal: '', means: '', resources: blankResources(), firstName: '', firstDescription: '' })
}

const spec = computed<PlanSpec>(() => ({
  goal: form.goal,
  means: form.means,
  resources: form.resources.map((r) => ({ ...r })),
  firstUnit: phase === 2 ? { name: form.firstName, description: form.firstDescription } : null
}))
const blocker = computed(() => precheckPlan(game.state, spec.value))

const first = ideas.value[0]
if (first) use(first)

async function submit() {
  if (blocker.value) return
  feedback.value = ''
  const v = await game.propose({ kind: 'plan', spec: spec.value })
  if (!v || v.kind !== 'plan') {
    feedback.value = game.lastError
    return
  }
  verdict.value = v
}

watch(verdict, (v) =>
  game.logTo('ui', v ? 'verdict_shown' : 'verdict_closed', { dialog: 'plan', plausibility: v?.plausibility, rejected: v?.rejected })
)

// draftPlan structuredClones the state, which a reactive proxy can't survive.
const draft = computed(() => (verdict.value && !verdict.value.rejected ? draftPlan(toRaw(game.state), verdict.value) : null))

/** The approach dial: one zone per level, each centred on its level. */
const steps = GOAL_APPROACH.length - 1
const APPROACH_ZONES: GaugeZone[] = GOAL_APPROACH.map((_, i) => ({
  from: Math.max(0, (i - 0.5) / steps),
  to: Math.min(1, (i + 0.5) / steps),
  tone: 'abc'[i] ?? 'c'
}))
/** GOAL_APPROACH's labels, short enough for the dial. */
const APPROACH_SHORT = ['Mostly brilliance', 'Both equally', 'Mostly scale']

/**
 * Where the needle sits: Jev's raw score, kept inside the zone of the level the game uses (which
 * the player's pick sets when Jev is torn), so the needle and the label always agree.
 */
const approach = computed(() => {
  const v = verdict.value
  if (!v) return { at: 0, label: '', short: '' }
  const level = reader(v).level('approach', GOAL_APPROACH.length)
  const zone = APPROACH_ZONES[level]!
  const answer = v.answers.approach
  const raw = answer?.type === 'score' && v.picks.approach === undefined ? readScore(answer, GOAL_APPROACH.length) / steps : level / steps
  return { at: Math.min(zone.to, Math.max(zone.from, raw)), label: GOAL_APPROACH[level]![0], short: APPROACH_SHORT[level] ?? '' }
})

function onPick(key: string, value: string) {
  if (verdict.value) verdict.value.picks[key] = value
}

function accept() {
  if (!verdict.value) return
  const outcome = game.accept(verdict.value as Verdict)
  if (!outcome) {
    feedback.value = game.lastError
    verdict.value = null
    return
  }
  ui.notice = { tone: 'good', text: `Phase ${phase} begins: ${verdict.value.spec.goal}.` }
  if (phase === 2) ui.openFirstUnit()
}
</script>

<style scoped>
/* The briefing fills the screen, on the bare board. */
.page {
  position: relative;
  overflow: hidden;
  min-height: 100vh;
  display: flex;
  justify-content: center;
  align-items: flex-start;
  padding: 32px 16px;
  background: radial-gradient(ellipse at center, var(--pcb-2), var(--pcb-1) 55%, var(--pcb-0));
}

.console {
  position: relative;
  width: min(820px, 100%);
  display: flex;
  flex-direction: column;
  border: 1px solid var(--chrome-0);
  border-radius: var(--r);
  color: var(--text);
  background: linear-gradient(180deg, var(--chrome-2), var(--chrome-1));
  box-shadow:
    inset 1px 1px 0 var(--bevel-hi),
    inset -1px -1px 0 var(--bevel-lo),
    0 20px 60px rgb(0 0 0 / 0.7);
  animation: rise 0.4s ease-out both;
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

.plate h2 {
  flex: 1;
  margin: 0;
  font-size: 17px;
  color: #1a1912;
  text-shadow: 0 1px 0 rgb(255 255 255 / 0.25);
}

.jev {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  font-family: var(--font-label);
  font-weight: 600;
  font-size: 13px;
  color: #1a1912;
}

.tag {
  font-size: 11px;
  padding: 0 5px;
  color: #1a1912;
  border: 1px solid #1a1912;
}

.body {
  padding: 14px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

/* The mission brief, on paper. */
.brief {
  margin: 0;
  padding: 10px 12px;
  color: var(--ink);
  background: linear-gradient(180deg, #e9e3c2, #d8d1ac);
  border: 1px solid #000;
  box-shadow: 0 3px 8px rgb(0 0 0 / 0.4);
  font-size: 13.5px;
  line-height: 1.45;
}

.ideas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(190px, 1fr));
  gap: 8px;
}

.idea {
  display: flex;
  flex-direction: column;
  gap: 4px;
  padding: 8px 10px;
  text-align: left;
  text-transform: none;
  letter-spacing: 0;
  font-weight: 400;
  white-space: normal;
  color: var(--silk);
  background: linear-gradient(180deg, var(--chip-2), var(--chip));
  border-top: 3px solid var(--pin);
}

.idea:hover:not(:disabled) {
  background: linear-gradient(180deg, #33332d, var(--chip-2));
}

.idea.on {
  border-top-color: var(--led-a);
  box-shadow: 0 0 0 2px var(--led-a);
}

.idea .no {
  font-size: 10px;
  color: var(--silk-dim);
}

.idea strong {
  font-family: var(--font-label);
  font-size: 15px;
  letter-spacing: 0.03em;
}

.means {
  font-size: 12px;
  color: var(--silk-dim);
}

.bom {
  font-family: var(--font-mono);
  font-size: 10.5px;
  color: var(--copper-hi);
}

.form {
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.spec,
.bomtable {
  display: flex;
  flex-direction: column;
  gap: 6px;
  padding: 10px 12px;
  background: rgb(0 0 0 / 0.2);
  border: 1px solid #000;
  box-shadow: inset 1px 1px 0 var(--bevel-lo);
}

.bomtable h2 {
  margin: 0;
}

.explain {
  margin: 0 0 4px;
  font-size: 13px;
  color: var(--silk-dim);
}

.res {
  display: flex;
  gap: 6px;
  align-items: center;
}

.ref {
  width: 26px;
  font-size: 11px;
  color: var(--copper-hi);
}

.res input:first-of-type {
  width: 170px;
  flex: none;
}

.grow {
  flex: 1;
}

.with-add {
  display: flex;
  gap: 6px;
}

.silk-note {
  margin: 0;
  font-family: var(--font-label);
  font-weight: 600;
  font-size: 11.5px;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: var(--silk-dim);
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

.approach {
  font-family: var(--font-label);
  font-weight: 700;
  font-size: 15px;
  text-transform: uppercase;
  letter-spacing: 0.04em;
  color: var(--lcd-fg);
}

.outcome {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.added {
  width: 100%;
  border-collapse: collapse;
  font-size: 12.5px;
}

.added th {
  text-align: left;
  font-family: var(--font-label);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 11px;
  color: var(--muted);
}

.added td {
  padding: 3px 6px 3px 0;
  border-top: 1px solid var(--chrome-3);
}

.added tr.top td {
  color: var(--led-a);
}

@keyframes rise {
  from {
    opacity: 0;
    transform: translateY(10px);
  }
}

@media (prefers-reduced-motion: reduce) {
  .console {
    animation: none;
  }
}

@media (max-width: 560px) {
  .page {
    padding: 12px 8px;
  }
  .res {
    flex-wrap: wrap;
  }
  .res input:first-of-type {
    width: 100%;
  }
}
</style>
