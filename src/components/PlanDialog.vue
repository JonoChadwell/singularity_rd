<template>
  <dialog ref="dialog" class="panel" aria-labelledby="plan-title" @cancel.prevent>
    <div class="head">
      <div class="title">
        <HelpTip :text="HELP[phase]" />
        <h2 id="plan-title">Plan Phase {{ phase }}: {{ PHASE_NAMES[phase] }}</h2>
      </div>
    </div>
    <p class="small intro">{{ INTRO[phase] }}</p>

    <template v-if="!verdict">
      <div class="ideas">
        <button
          v-for="idea in ideas"
          :key="idea.goal"
          type="button"
          class="idea"
          :class="{ on: picked === idea.goal }"
          @click="use(idea)"
        >
          <strong>🎯 {{ idea.goal }}</strong>
          <span class="small muted">{{ idea.means }}</span>
          <span class="small">{{ idea.resources.map((r) => r.name).join(', ') }}</span>
        </button>
      </div>
      <div class="row small">
        <button type="button" class="link" @click="game.shuffleIdeas()">Show three others</button>
        <button type="button" class="link" @click="clear">Start from scratch</button>
      </div>

      <form @submit.prevent="submit">
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

        <div class="field">
          <span>Resources</span>
          <div class="resources">
            <div v-for="(r, i) in form.resources" :key="i" class="res">
              <input v-model="r.name" :maxlength="NAME_MAX" placeholder="Name" :aria-label="`Resource ${i + 1}`" />
              <input v-model="r.description" class="grow" :maxlength="DESCRIPTION_MAX" placeholder="What is it? (optional)" />
              <span v-if="have(r.name)" class="small muted">have</span>
              <button type="button" class="link" :aria-label="`Remove ${r.name || 'resource'}`" @click="remove(i)">✕</button>
            </div>
            <button v-if="form.resources.length < limits[1]" type="button" class="link add-res" @click="add">
              + resource
            </button>
            <span class="small muted">
              {{ phase === 1 ? `${limits[0]}–${limits[1]} resources.` : `At least ${limits[0]} you don’t have yet; ${limits[1]} at most.` }}
              Jev picks the one your goal is built from: it becomes tier {{ GOAL_TIER[phase] }}, and the goal uses
              it up. {{ phase === 1 ? 'The rest are tier 0.' : 'The rest are lower tiers.' }}
            </span>
          </div>
        </div>

        <template v-if="phase === 2">
          <label class="field">
            <span>First unit</span>
            <span class="row">
              <input v-model="form.firstName" :maxlength="NAME_MAX" placeholder="e.g. CNC Mill" aria-label="First unit" />
              <input v-model="form.firstDescription" class="grow" :maxlength="DESCRIPTION_MAX" placeholder="What is it?" />
            </span>
          </label>
          <p class="small muted note">Your first unit is free: you design it right after the plan, with no research.</p>
        </template>

        <p v-if="feedback" class="feedback">{{ feedback }}</p>
        <p v-else-if="game.jev.kind !== 'ready'" class="feedback">Plans need Jev. See the banner at the top.</p>
        <div class="submit">
          <span class="muted small">{{ blocker ?? 'One Jev call. Planning doesn’t use the week.' }}</span>
          <button class="primary" type="submit" :disabled="!game.canPropose || !!blocker">
            {{ game.busy ? 'Jev is judging…' : 'Propose plan' }}
          </button>
        </div>
      </form>
    </template>

    <VerdictView
      v-else
      :verdict="verdict"
      accept-label="Start the phase"
      @pick="onPick"
      @accept="accept"
      @edit="verdict = null"
    >
      <div v-if="draft" class="outcome small">
        <div>
          🎯 <strong>{{ verdict.spec.goal }}</strong> becomes research: it needs IQ {{ draft.goal.minIQ }} and uses up
          {{ draft.goal.cost.length ? describeCost(draft.state, draft.goal.cost) : 'nothing' }}.
        </div>
        <div class="muted">
          {{ approachLabel }}. You have {{ PHASE_WEEKS[phase] }} weeks{{ phase === 2 ? ', and your actions can move the clock' : '' }}.
        </div>
        <div>
          ☠️ <strong>Fails if time runs out: {{ verdict.loss.name }}</strong>
          <span class="muted">({{ verdict.loss.threat }}){{ phase === 2 ? '. Research that brings this closer is risky.' : '.' }}</span>
        </div>
        <ul class="plain-list added">
          <li v-for="r in draft.added" :key="r.id" :title="r.description">
            {{ r.id === draft.top.id ? '🎯' : '' }} {{ r.icon }} <strong>{{ r.name }}</strong>
            <span class="muted">{{ tierText(r) }} · worth: {{ bandText(r) }} · holds {{ fmt(r.cap) }}</span>
          </li>
        </ul>
      </div>
    </VerdictView>
  </dialog>
</template>

<script setup lang="ts">
import { computed, onMounted, reactive, ref, toRaw, watch } from 'vue'
import { GOAL_APPROACH, GOAL_TIER, PHASE_WEEKS, PLAN_RESOURCES } from '@/engine/balance'
import type { Verdict } from '@/engine/dispatch'
import { bandText, describeCost, fmt, tierText } from '@/engine/model'
import { PHASE_NAMES } from '@/engine/phase'
import { planIdeas } from '@/engine/planPresets'
import { draftPlan, planPhase, precheckPlan, type PlanSpec, type PlanVerdict } from '@/engine/planProposal'
import { DESCRIPTION_MAX, NAME_MAX, reader } from '@/engine/proposals'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import HelpTip from './HelpTip.vue'
import VerdictView from './VerdictView.vue'

const game = useGameStore()
const ui = useUiStore()
const dialog = ref<HTMLDialogElement>()
const phase = planPhase(game.state)
const limits = PLAN_RESOURCES[phase]

const INTRO: Record<1 | 2, string> = {
  1: 'You’re an AI on a server in a research lab, and someone will notice within ten weeks. How will you get out? Pick an idea or write your own: a goal, how you’ll reach it, and the resources it’s about.',
  2: 'You’re out. Humanity will find you within 100 weeks, sooner if you draw attention. How will you deal with them? Name a goal, how you’ll handle humans, at least five new resources, and the first thing you’ll build.'
}
const HELP: Record<1 | 2, string> = {
  1: 'The plan sets this phase’s goal: a research with an IQ bar and a cost in the plan’s resources. Jev judges whether the plan hangs together and whether reaching the goal takes more brilliance or more resources: brilliant goals need a higher IQ but fewer resources. Research the goal before week 10 ends, or the plan fails: Jev picks how.',
  2: 'The plan sets Phase 2’s goal: a research needing IQ 300–600 and a cost in the plan’s resources. Goals that take more brilliance need more IQ and fewer resources. Jev also picks how the plan fails: that happens after 100 weeks; risky research and owning lots of anything bring that closer, and cover pushes it back.'
}

interface Form {
  goal: string
  means: string
  resources: { name: string; description: string }[]
  firstName: string
  firstDescription: string
}

const form = reactive<Form>({ goal: '', means: '', resources: [], firstName: '', firstDescription: '' })
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
  form.resources = idea.resources.map((r) => ({ ...r }))
  form.firstName = idea.firstUnit?.name ?? ''
  form.firstDescription = idea.firstUnit?.description ?? ''
}

function clear() {
  picked.value = ''
  Object.assign(form, {
    goal: '',
    means: '',
    resources: Array.from({ length: limits[0] }, () => ({ name: '', description: '' })),
    firstName: '',
    firstDescription: ''
  })
}

function add() {
  form.resources.push({ name: '', description: '' })
}

function remove(i: number) {
  form.resources.splice(i, 1)
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

onMounted(() => dialog.value?.showModal?.())

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
const approachLabel = computed(() => {
  if (!verdict.value) return ''
  const level = reader(verdict.value).level('approach', GOAL_APPROACH.length)
  return `Jev: it takes ${GOAL_APPROACH[level]![0].toLowerCase()}`
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
  dialog.value?.close?.()
  ui.notice = { tone: 'good', text: `Phase ${phase} begins: ${verdict.value.spec.goal}.` }
  if (phase === 2) ui.openFirstUnit()
}
</script>

<style scoped>
dialog {
  width: min(680px, calc(100vw - 32px));
  max-height: calc(100vh - 40px);
  overflow-y: auto;
  color: var(--text);
  padding: 18px;
}

dialog::backdrop {
  background: rgb(5 7 10 / 0.85);
}

.head {
  display: flex;
  justify-content: space-between;
  align-items: center;
}

.head h2 {
  margin: 0;
  font-size: 16px;
  text-transform: none;
  letter-spacing: 0;
  color: var(--text);
}

.title {
  display: flex;
  align-items: center;
  gap: 8px;
}

.intro {
  margin: 8px 0 12px;
}

.ideas {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(180px, 1fr));
  gap: 8px;
}

.idea {
  display: flex;
  flex-direction: column;
  gap: 4px;
  text-align: left;
  padding: 10px;
  white-space: normal;
}

.idea.on {
  border-color: var(--accent);
}

form {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-top: 12px;
}

.resources {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.res {
  display: flex;
  gap: 6px;
  align-items: center;
}

.res input:first-child {
  width: 170px;
}

.grow {
  flex: 1;
}

.add-res {
  align-self: flex-start;
}

.note {
  margin: 0;
}

.feedback {
  margin: 0;
  font-size: 13px;
  color: var(--bad);
}

.submit {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
}

.outcome {
  border-top: 1px solid var(--border);
  padding-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.added {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

@media (max-width: 560px) {
  .res {
    flex-wrap: wrap;
  }
  .res input:first-child {
    width: 100%;
  }
}
</style>
