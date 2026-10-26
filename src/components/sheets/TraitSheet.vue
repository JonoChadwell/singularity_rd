<template>
  <DataSheet :part="partNo(prefix, id)" :title="info.name" :icon="info.icon" :subtitle="info.kind">
    <section v-if="info.rule">
      <h4>Rule</h4>
      <p>{{ info.rule }}</p>
    </section>
    <template v-else>
      <section>
        <h4>Upside</h4>
        <p class="good">▲ {{ info.upside }}</p>
      </section>
      <section>
        <h4>Downside</h4>
        <p class="bad">▼ {{ info.downside }}</p>
      </section>
    </template>
    <section>
      <h4>Notes</h4>
      <p class="note">{{ NOTES[kind] }}</p>
    </section>
  </DataSheet>
</template>

<script setup lang="ts">
import { computed } from 'vue'
import { computeTrait } from '@/engine/computeTraits'
import { resourceTrait, type ResourceTraitId } from '@/engine/resourceTraits'
import { TRAITS, type TraitId } from '@/engine/traits'
import DataSheet from '../kit/DataSheet.vue'
import { partNo } from './text'

const props = defineProps<{ kind: 'trait' | 'rtrait' | 'ctrait'; id: string }>()

const NOTES = {
  trait: 'A unit trait. A unit has up to three, from a fixed list of 14.',
  rtrait: 'A resource’s nature. Each of the 20 has an upside and a downside; a resource has one or two.',
  ctrait: 'A platform’s compute trait. Each new platform comes with a perk and a drawback.'
}
const prefix = computed(() => ({ trait: 'TR', rtrait: 'NAT', ctrait: 'CT' })[props.kind])

const info = computed(() => {
  if (props.kind === 'trait') {
    const t = TRAITS[props.id as TraitId]
    return { name: t.name, icon: t.icon, kind: t.kind, rule: t.rule, upside: '', downside: '' }
  }
  if (props.kind === 'rtrait') {
    const t = resourceTrait(props.id as ResourceTraitId)
    return { name: t.name, icon: t.icon, kind: 'nature', rule: '', upside: t.upside, downside: t.downside }
  }
  const t = computeTrait(props.id)
  return { name: t.name, icon: t.icon, kind: t.kind, rule: t.rule, upside: '', downside: '' }
})
</script>
