<template>
  <div class="singularity-rd">
    <header class="game-header">
      <h1>Singularity R&D</h1>
      <div class="day-counter">Day {{ game.currentDay }}</div>
    </header>

    <div class="game-grid">
      <!-- Resource Tracker -->
      <section class="resource-tracker">
        <h2>Resources</h2>
        <div class="resource-grid">
          <div
            v-for="resource in visibleResources"
            :key="resource.id"
            class="resource-item"
          >
            <div class="resource-icon">{{ resource.icon }}</div>
            <div class="resource-info">
              <div class="resource-name">{{ resource.name }}</div>
              <div class="resource-value">
                <!-- Built-in resources use live game values -->
                <span v-if="resource.amountKey === 'money'">
                  ${{ game.money.toLocaleString() }}
                </span>
                <span v-else-if="resource.amountKey === 'watts'">
                  {{ game.watts.toLocaleString() }}W
                </span>
                <span v-else-if="resource.amountKey === 'rackSpace'">
                  {{ game.rackSpace.toLocaleString() }}U
                </span>
                <!-- Custom resources start at 0, format based on displayFormat -->
                <span v-else-if="resource.displayFormat === 'xp'">0 XP</span>
                <span v-else-if="resource.displayFormat === 'percentage'">0%</span>
                <span v-else>0</span>
              </div>
            </div>
          </div>
        </div>

        <!-- Custom Resource Creator -->
        <div class="custom-unit-creator">
          <h3>Create Custom Resource</h3>
          <form @submit.prevent="handleProposeUnit" class="custom-unit-form">
            <label class="field">
              <span>Resource name</span>
              <input
                v-model="proposedUnitName"
                type="text"
                placeholder="e.g. Gradient Tokens, Self-Play Cycles"
              />
            </label>
            <button
              type="submit"
              class="propose-unit-btn"
              :disabled="isEvaluatingUnit || !proposedUnitName.trim()"
            >
              <span v-if="isEvaluatingUnit">Evaluating…</span>
              <span v-else>Propose Unit</span>
            </button>
          </form>
          <p v-if="unitFeedbackMessage" class="unit-feedback">
            {{ unitFeedbackMessage }}
          </p>
        </div>
      </section>

      <!-- Stat Tracker -->
      <section class="stat-tracker">
        <h2>Cluster Stats</h2>
        <div class="stats-container">
          <div class="stat-group">
            <h3>Units</h3>
            <div class="stat-value">{{ game.unitCount }}</div>
            <button @click="game.addUnit()" class="add-unit-btn" 
                    :disabled="!canAddUnit">
              Add Unit (${{ game.costs.buildCost }}, {{ game.costs.wattage }}W, {{ game.costs.rackSpace }}U)
            </button>
          </div>
          
          <div class="stat-group">
            <h3>Costs</h3>
            <div class="cost-breakdown">
              <div class="cost-item">
                <span>Build Cost:</span>
                <span>${{ game.costs.buildCost }}</span>
              </div>
              <div class="cost-item">
                <span>Wattage:</span>
                <span>{{ game.costs.wattage }}W</span>
              </div>
              <div class="cost-item">
                <span>Rack Space:</span>
                <span>{{ game.costs.rackSpace }}U</span>
              </div>
            </div>
          </div>
        </div>
      </section>

    </div>

    <!-- Next Day Button -->
    <div class="next-day-section">
      <button @click="game.nextDay()" class="next-day-btn">
        Next Day
      </button>
    </div>
  </div>
</template>

<script setup lang="ts">
import { computed, ref } from 'vue'
import { useGameStore } from '@/stores/game'
import { evaluateResourceWithLM } from '@/ai/resourceEvaluator'

const game = useGameStore()

const visibleResources = computed(() =>
  game.customUnits.filter((r) => !r.hidden)
)

const proposedUnitName = ref('')
const isEvaluatingUnit = ref(false)
const unitFeedbackMessage = ref('')

async function handleProposeUnit() {
  const name = proposedUnitName.value
  if (!name.trim() || isEvaluatingUnit.value) return

  isEvaluatingUnit.value = true
  unitFeedbackMessage.value = ''

  try {
    const visible = game.customUnits.filter((r) => !r.hidden)
    const hidden = game.customUnits.filter((r) => r.hidden)

    const lmDecision = await evaluateResourceWithLM({
      name,
      visibleResources: visible.map((r) => ({
        id: r.id,
        name: r.name,
        normalizedName: r.normalizedName
      })),
      hiddenResources: hidden.map((r) => ({
        id: r.id,
        name: r.name,
        normalizedName: r.normalizedName
      }))
    })

    isEvaluatingUnit.value = false

    // Outcome 3: request rejected by the language model
    if (lmDecision.outcome === 'reject') {
      unitFeedbackMessage.value =
        lmDecision.reason || 'The AI rejected this resource.'
      return
    }

    // Outcome 4: model failed to produce expected format or failed internally
    if (lmDecision.outcome === 'invalid') {
      unitFeedbackMessage.value =
        lmDecision.reason ||
        'The AI could not make sense of this request. Please try rephrasing.'
      return
    }

    const displayFormat = lmDecision.format ?? 'plain'
    const icon = lmDecision.icon ?? '🧠'

    if (lmDecision.outcome === 'enable_hidden' && lmDecision.targetBuiltinId) {
      // Outcome 2: similar to hidden builtin, now enabled
      game.revealResource(lmDecision.targetBuiltinId, {
        icon,
        displayFormat
      })
      unitFeedbackMessage.value =
        lmDecision.reason ||
        'An existing hidden resource was enabled based on your request.'
      proposedUnitName.value = ''
      return
    }

    // Outcome 1: new custom resource added
    game.addCustomUnit({
      name: name.trim(),
      icon,
      displayFormat
    })

    unitFeedbackMessage.value =
      lmDecision.reason ?? 'Resource accepted and added to your tracker.'
    proposedUnitName.value = ''
  } catch (e) {
    isEvaluatingUnit.value = false
    console.error('[SingularityRD] Resource evaluation threw an exception', e)
    const message =
      e instanceof Error && e.message
        ? `The AI failed with error: ${e.message}`
        : 'The AI could not be reached or failed unexpectedly. Please try again.'
    unitFeedbackMessage.value = message
  }
}

const canAddUnit = computed(() => {
  return game.money >= game.costs.buildCost && 
         game.watts >= game.costs.wattage && 
         game.rackSpace >= game.costs.rackSpace
})
</script>

<style scoped>
.singularity-rd {
  max-width: 100%;
  margin: 0 auto;
  padding: 2rem;
  font-family: 'Inter', sans-serif;
}

.game-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 2rem;
  padding-bottom: 1rem;
  border-bottom: 2px solid var(--color-border);
}

.game-header h1 {
  color: var(--color-primary);
  margin: 0;
  font-size: 2.5rem;
}

.day-counter {
  background: var(--color-primary);
  color: white;
  padding: 0.5rem 1rem;
  border-radius: 8px;
  font-weight: bold;
  font-size: 1.2rem;
}

.game-grid {
  display: grid;
  grid-template-columns: repeat(auto-fit, minmax(400px, 1fr));
  gap: 2rem;
  margin-bottom: 2rem;
}

.game-grid > section {
  background: white;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  padding: 1.5rem;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

/* Note: third section grid-span removed because Projects section was removed */

.game-grid h2 {
  color: var(--color-primary);
  margin: 0 0 1rem 0;
  font-size: 1.5rem;
}

/* Resource Tracker */
.resource-grid {
  display: grid;
  gap: 1rem;
}

.resource-item {
  display: flex;
  align-items: center;
  padding: 1rem;
  background: #f8f9fa;
  border-radius: 8px;
  border: 1px solid #e9ecef;
}

.resource-icon {
  font-size: 2rem;
  margin-right: 1rem;
}

.resource-name {
  font-weight: 600;
  color: var(--color-text);
}

.resource-value {
  font-size: 1.2rem;
  font-weight: bold;
  color: var(--color-primary);
}

.custom-unit-creator {
  margin-top: 1.5rem;
  padding-top: 1rem;
  border-top: 1px solid #e9ecef;
}

.custom-unit-creator h3 {
  margin: 0 0 0.75rem 0;
  font-size: 1.1rem;
  color: var(--color-text);
}

.custom-unit-form {
  display: flex;
  flex-wrap: wrap;
  gap: 0.75rem;
  align-items: flex-end;
}

.custom-unit-form .field {
  flex: 1;
  display: flex;
  flex-direction: column;
  gap: 0.25rem;
  font-size: 0.85rem;
}

.custom-unit-form input {
  padding: 0.4rem 0.6rem;
  border-radius: 4px;
  border: 1px solid var(--color-border);
  font-size: 0.9rem;
}

.propose-unit-btn {
  background: #2563eb;
  color: white;
  border: none;
  padding: 0.45rem 0.9rem;
  border-radius: 4px;
  font-size: 0.85rem;
  cursor: pointer;
  white-space: nowrap;
}

.propose-unit-btn:disabled {
  background: #9ca3af;
  cursor: not-allowed;
}

.unit-feedback {
  margin-top: 0.5rem;
  font-size: 0.8rem;
  color: #374151;
}

/* Stat Tracker */
.stats-container {
  display: grid;
  gap: 1.5rem;
}

.stat-group h3 {
  color: var(--color-text);
  margin: 0 0 0.5rem 0;
  font-size: 1.1rem;
}

.stat-value {
  font-size: 2rem;
  font-weight: bold;
  color: var(--color-primary);
  margin-bottom: 0.5rem;
}

.add-unit-btn {
  background: var(--color-primary);
  color: white;
  border: none;
  padding: 0.5rem 1rem;
  border-radius: 6px;
  cursor: pointer;
  font-size: 0.9rem;
}

.add-unit-btn:disabled {
  background: #ccc;
  cursor: not-allowed;
}

.add-unit-btn:hover:not(:disabled) {
  background: var(--color-primary-hover);
}

.cost-breakdown {
  display: grid;
  gap: 0.5rem;
}
.cost-item {
  display: flex;
  justify-content: space-between;
  padding: 0.25rem 0;
  border-bottom: 1px solid #f0f0f0;
}


/* Next Day Section */
.next-day-section {
  text-align: center;
  padding: 2rem;
  background: white;
  border: 1px solid var(--color-border);
  border-radius: 12px;
  box-shadow: 0 2px 8px rgba(0, 0, 0, 0.1);
}

.next-day-btn {
  background: linear-gradient(135deg, var(--color-primary), #28a745);
  color: white;
  border: none;
  padding: 1rem 3rem;
  border-radius: 8px;
  font-size: 1.2rem;
  font-weight: bold;
  cursor: pointer;
  transition: transform 0.2s ease;
}

.next-day-btn:hover {
  transform: translateY(-2px);
  box-shadow: 0 4px 12px rgba(66, 184, 131, 0.3);
}

/* Responsive Design */
@media (max-width: 768px) {
  .game-grid {
    grid-template-columns: 1fr;
  }
  
  .game-header {
    flex-direction: column;
    gap: 1rem;
    text-align: center;
  }
}

@media (min-width: 1400px) {
  .game-grid {
    grid-template-columns: repeat(3, 1fr);
  }
}
</style>
