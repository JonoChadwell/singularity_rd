<template>
  <div class="market">
    <p class="muted small intro">
      Things that exist today, sold for Money up to what humanity can supply. Units arrive at once and work this week.
      Prices climb as supply runs out: the last tenth costs several times the first.
      You have <strong class="num">{{ fmt(money) }}</strong> Money.
    </p>

    <h3 class="sub">Units</h3>
    <p v-if="!units.length" class="empty">
      Nothing for sale yet. Propose a unit that exists today, like a rented cloud server.
    </p>
    <div v-for="u in units" :key="u.id" class="item">
      <span class="icon">{{ u.icon }}</span>
      <div class="what">
        <div>
          <strong>{{ u.name }}</strong>
          <span v-if="u.mind" class="chip iq">IQ {{ Math.round(currentIQ(u)) }}</span>
        </div>
        <div class="small muted">
          {{ fmtCount(marketLeft(u)) }} left of {{ fmtCount(layerSize(u, 'market')) }} · next one {{ fmt(marketPrice(u)) }}
        </div>
        <div class="supply"><div :style="{ width: `${(u.bought / layerSize(u, 'market')) * 100}%` }" /></div>
      </div>
      <div class="row buy">
        <input v-model.number="amounts[u.id]" class="n" type="number" min="1" :aria-label="`How many ${u.name}`" />
        <button
          class="small"
          :disabled="!game.playing || !(amounts[u.id]! >= 1) || unitCost(u) > money"
          @click="game.buyUnits(u.id, amounts[u.id] ?? 1)"
        >
          Buy for {{ fmt(unitCost(u)) }}
        </button>
        <button
          class="link"
          title="The most you can buy while keeping next week’s Money upkeep, theirs included"
          @click="amounts[u.id] = Math.max(1, affordable(u, money, reserve))"
        >
          max {{ fmtCount(affordable(u, money, reserve)) }}
        </button>
      </div>
    </div>

    <h3 class="sub">Batches of stock</h3>
    <p v-if="!stocks.length" class="empty">Humanity sells none of your stocks.</p>
    <div v-for="r in stocks" :key="r.id" class="item">
      <span class="icon">{{ r.icon }}</span>
      <div class="what">
        <strong>{{ r.name }}</strong>
        <div class="small muted">
          {{ fmt(r.market - r.boughtThisWeek) }} left this week · {{ fmt(r.value) }} each · you have {{ fmt(r.amount) }}
        </div>
      </div>
      <div class="row buy">
        <input v-model.number="amounts[r.id]" class="n" type="number" min="1" :aria-label="`How much ${r.name}`" />
        <button
          class="small"
          :disabled="!game.playing || !(amounts[r.id]! > 0) || (amounts[r.id] ?? 0) * r.value > money"
          @click="game.buyResource(r.id, amounts[r.id] ?? 1)"
        >
          Buy for {{ fmt((amounts[r.id] ?? 0) * r.value) }}
        </button>
        <button class="link" @click="amounts[r.id] = maxStock(r)">max</button>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, reactive } from 'vue'
import {
  affordable,
  currentIQ,
  findResource,
  fmt,
  fmtCount,
  layerSize,
  marketCost,
  marketLeft,
  marketPrice,
  MONEY_ID,
  moneyUse
} from '@/engine/model'
import type { Resource, UnitType } from '@/engine/types'
import { useGameStore } from '@/stores/game'

const game = useGameStore()
const amounts = reactive<Record<string, number>>({})
const money = computed(() => findResource(game.state, MONEY_ID)?.amount ?? 0)
const reserve = computed(() => moneyUse(game.preview))
const units = computed(() => game.state.units.filter((u) => marketLeft(u) > 0))
const stocks = computed(() => game.state.resources.filter((r) => r.kind === 'stock' && r.market > 0 && r.id !== MONEY_ID))
const unitCost = (u: UnitType) => marketCost(u, Math.min(amounts[u.id] ?? 1, marketLeft(u)))
const maxStock = (r: Resource) => Math.floor(Math.min(r.market - r.boughtThisWeek, money.value / r.value))
for (const u of game.state.units) amounts[u.id] ??= 1
</script>

<style scoped>
.market {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.intro {
  margin: 0;
}

.sub {
  font-size: 12px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: var(--muted);
  margin-top: 6px;
}

.item {
  display: flex;
  gap: 10px;
  align-items: center;
  border: 1px solid var(--border);
  border-radius: 6px;
  padding: 8px 10px;
  flex-wrap: wrap;
}

.icon {
  font-size: 20px;
}

.what {
  flex: 1;
  min-width: 180px;
}

.supply {
  margin-top: 4px;
  height: 4px;
  background: var(--bg);
  border-radius: 999px;
  overflow: hidden;
}

.supply > div {
  height: 100%;
  background: var(--warn);
}

.buy {
  gap: 6px;
}
</style>
