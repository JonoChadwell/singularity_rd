import { describe, expect, it } from 'vitest'
import { createSSRApp } from 'vue'
import { createPinia, setActivePinia } from 'pinia'
import { renderToString } from 'vue/server-renderer'
import App from '@/App.vue'
import { FINAL_ID, SERVER_ID } from '@/engine/initialState'
import { findResource, MONEY_ID } from '@/engine/model'
import { useGameStore } from '@/stores/game'
import { useUiStore } from '@/stores/ui'
import { FakeJudge, noul, score } from '@/engine/__tests__/fakeJudge'

type Store = ReturnType<typeof useGameStore>

async function render(setup: (game: Store, ui: ReturnType<typeof useUiStore>) => Promise<void> | void) {
  const app = createSSRApp(App)
  const pinia = createPinia()
  app.use(pinia)
  setActivePinia(pinia)
  const game = useGameStore()
  await setup(game, useUiStore())
  return renderToString(app)
}

function ready(game: Store, judge = new FakeJudge({ advancement: score(0) })) {
  game.setJudge(judge)
  game.jev = { kind: 'ready', model: 'fake' }
  return judge
}

describe('App', () => {
  it('renders a new game', async () => {
    const html = await render(() => {})
    for (const text of ['Next week', 'Starting Server', 'IQ 100', 'Theory of Everything', 'has nothing to do', 'Week']) {
      expect(html).toContain(text)
    }
  })

  it('plays through the store: propose, accept, buy, teach, next week', async () => {
    const html = await render(async (game) => {
      const judge = ready(game)
      const coding = await game.propose({
        kind: 'strategy',
        spec: { name: 'Freelance coding', description: '', unitId: SERVER_ID, inputIds: [], outputId: MONEY_ID }
      })
      expect(coding?.rejected).toBeNull()
      expect(game.accept(coding!)).toMatchObject({ kind: 'added' })
      expect(game.alerts.some((a) => a.key === `idle-${SERVER_ID}`)).toBe(false)
      game.nextWeek()
      game.nextWeek()
      expect(game.state.week).toBe(3)
      expect(findResource(game.state, MONEY_ID)!.amount).toBe(2000)

      const gpu = await game.propose({
        kind: 'unit',
        spec: { name: 'Rented Cloud GPU', description: '', mind: true, parts: [MONEY_ID], upkeep: [MONEY_ID], builderId: null, targetIQ: 90 }
      })
      expect(game.accept(gpu!)).toMatchObject({ kind: 'added' })
      const unit = game.state.units.find((u) => u.name === 'Rented Cloud GPU')!
      expect(game.buyUnits(unit.id, 1)).toBe(true)
      expect(game.teach(game.state.strategies[0]!.id, unit.id)).toBe(true)
      expect(game.preview.runs[game.state.strategies[1]!.id]?.units).toBe(1)
      game.nextWeek()
      expect(game.lastError).toBe('')
      expect(game.state.stats.proposals).toMatchObject({ strategy: 1, unit: 1 })
      expect(game.state.stats.jevCalls).toBe(judge.calls.length)
    })
    for (const text of ['Freelance coding', 'Rented Cloud GPU', 'First Money earned']) expect(html).toContain(text)
  })

  it('asks Jev once for the same proposal', async () => {
    await render(async (game) => {
      const judge = ready(game)
      const spec = { name: 'Lemons', description: 'Sour.' }
      await game.propose({ kind: 'resource', spec })
      await game.propose({ kind: 'resource', spec })
      expect(judge.calls).toHaveLength(1)
      expect(game.state.stats.proposals.resource).toBe(2)
    })
  })

  it('designs a tier and shows it on the ladder', async () => {
    const html = await render(async (game) => {
      ready(game, new FakeJudge({ feasible: noul(0.9) }))
      const v = await game.propose({
        kind: 'unit',
        spec: { name: 'Custom AI Server', description: '', mind: true, parts: [MONEY_ID], upkeep: [], builderId: null, targetIQ: 180 }
      })
      const outcome = game.accept(v!)
      expect(outcome?.kind).toBe('project')
      if (outcome?.kind !== 'project') return
      game.assignAll(SERVER_ID, outcome.project.id)
      const project = game.state.projects.find((p) => p.id === outcome.project.id)!
      project.progress = project.size - 0.01
      game.nextWeek()
      expect(game.state.units.find((u) => u.name === 'Custom AI Server')?.tier).toBe(1)
    })
    expect(html).toContain('Tier 1')
    expect(html).toContain('Custom AI Server')
  })

  it('renders every tab', async () => {
    for (const tab of ['minds', 'industry', 'projects', 'market'] as const) {
      const html = await render((_, ui) => {
        ui.tab = tab
      })
      expect(html).toContain('Humanity’s market')
      if (tab === 'projects') expect(html).toContain('bar IQ 1000')
    }
  })

  it('opens proposal dialogs pre-filled from where they were opened', async () => {
    const strategy = await render((_, ui) => {
      ui.openInvent({ kind: 'strategy', unitId: SERVER_ID, outputId: MONEY_ID })
    })
    expect(strategy).toContain('What could the Starting Server do to earn money?')
    expect(strategy).toMatch(/<option value="money"[^>]*selected>/)

    const unit = await render((_, ui) => ui.openInvent({ kind: 'unit', mind: true, targetIQ: 250 }))
    expect(unit).toContain('Target IQ')
    expect(unit).toContain('Your best minds can design up to IQ 200')

    const breakthrough = await render((_, ui) =>
      ui.openInvent({ kind: 'breakthrough', target: { kind: 'unit', id: SERVER_ID } })
    )
    expect(breakthrough).toContain('Propose a breakthrough')
    expect(breakthrough).toContain('of base')
  })

  it('renders the end screen', async () => {
    const html = await render((game) => {
      game.state.status = 'won'
      game.state.week = 99
      game.state.projects = game.state.projects.filter((p) => p.id !== FINAL_ID)
    })
    expect(html).toContain('Singularity reached in week 99')
    expect(html).toContain('Every invention, in order')
  })
})
