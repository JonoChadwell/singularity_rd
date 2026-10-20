<template>
  <section class="panel ladder" aria-label="Tier ladder">
    <ol class="plain-list steps">
      <li v-for="s in steps" :key="s.key" class="step" :class="{ ghost: s.ghost, online: s.online }">
        <div class="label muted small">{{ s.label }}</div>
        <div class="name">{{ s.icon }} {{ s.name }}</div>
        <div class="small">
          <span class="ai num">IQ {{ s.iq }}</span>
          <span class="muted"> · {{ s.detail }}</span>
        </div>
      </li>
      <li class="step final" :class="{ online: finalProgress > 0 }">
        <div class="label muted small">Singularity</div>
        <div class="name">✨ {{ final?.name ?? 'Final project' }}</div>
        <div class="small">
          <span class="ai num">bar IQ {{ final?.bar }}</span>
          <span class="muted"> · {{ Math.floor(finalProgress * 100) }}% done</span>
        </div>
        <div class="meter"><div :style="{ width: `${finalProgress * 100}%`, background: 'var(--progress)' }" /></div>
      </li>
    </ol>
    <div class="reach small">
      <div>
        Best effective IQ <strong class="num ai">{{ Math.floor(best) }}</strong>
      </div>
      <div
        class="muted"
        :title="`Designing a mind needs a mind with ${Math.round(LEAP_MIN * 100)}–${Math.round(LEAP_MAX * 100)}% of its target IQ. Jev judges how radical each design is.`"
      >
        Designs within reach: IQ <strong class="num">{{ range[0] }}–{{ range[1] }}</strong>
      </div>
    </div>
  </section>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { FINAL_ID } from '@/engine/initialState'
import { currentIQ, fmtCount } from '@/engine/model'
import { LEAP_MAX, LEAP_MIN } from '@/engine/balance'
import { bestEffectiveIQ, designRange } from '@/engine/research'
import { useGameStore } from '@/stores/game'

const game = useGameStore()

const final = computed(() => game.state.projects.find((p) => p.id === FINAL_ID))
const finalProgress = computed(() =>
  final.value ? final.value.progress / final.value.size : game.state.status === 'won' ? 1 : 0
)
const best = computed(() => bestEffectiveIQ(game.state))
const range = computed(() => designRange(game.state))

const steps = computed(() => {
  const s = game.state
  const online = (key: string) => s.milestones.find((m) => m.key === key)?.week
  const tiers = s.units.filter((u) => u.starting || u.tier).sort((a, b) => a.tier - b.tier)
  const topIQ = Math.max(0, ...s.units.filter((u) => u.mind).map((u) => u.hardware.iq))
  const rows = tiers.map((u) => {
    const week = u.starting ? 1 : online(`tier-${u.tier}`)
    return {
      key: u.id,
      label: u.starting ? 'Lab' : `Tier ${u.tier}`,
      icon: u.icon,
      name: u.name,
      iq: Math.round(currentIQ(u)),
      detail: week ? `×${fmtCount(u.count)}${u.starting ? '' : `, online week ${week}`}` : 'designed, none built yet',
      ghost: false,
      online: u.count > 0
    }
  })
  for (const p of s.projects) {
    if (p.effect.kind !== 'unit' || !p.effect.unit.mind || p.effect.unit.hardware.iq <= topIQ) continue
    rows.push({
      key: p.id,
      label: `Tier ${rows.length}`,
      icon: p.effect.unit.icon,
      name: p.effect.unit.name,
      iq: p.effect.unit.hardware.iq,
      detail: `designing, ${Math.floor((p.progress / p.size) * 100)}%`,
      ghost: true,
      online: false
    })
  }
  return rows
})
</script>

<style scoped>
.ladder {
  display: flex;
  gap: 14px;
  align-items: stretch;
  flex-wrap: wrap;
}

.steps {
  display: flex;
  gap: 8px;
  flex: 1;
  min-width: 0;
  overflow-x: auto;
}

.step {
  flex: 1 0 150px;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  display: flex;
  flex-direction: column;
  gap: 2px;
  position: relative;
}

.step.online {
  border-color: var(--accent-dim);
}

.step.ghost {
  border-style: dashed;
  opacity: 0.75;
}

.step.final {
  border-color: rgb(167 139 250 / 0.35);
}

.step + .step::before {
  content: '→';
  position: absolute;
  left: -8px;
  top: 50%;
  transform: translate(-50%, -50%);
  color: var(--muted);
  font-size: 11px;
}

.name {
  font-weight: 600;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}

.label {
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-size: 10px;
}

.meter {
  margin-top: 4px;
  height: 5px;
}

.reach {
  display: flex;
  flex-direction: column;
  justify-content: center;
  gap: 4px;
  min-width: 190px;
}
</style>
