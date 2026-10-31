<template>
  <table class="spec">
    <tbody>
      <tr v-for="(r, i) in rows" :key="i" :class="r.tone" :title="r.title">
        <th scope="row">
          <button v-if="r.open" type="button" class="link" @click="r.open">{{ r.k }}</button>
          <template v-else>{{ r.k }}</template>
        </th>
        <td :class="{ num: r.num }">{{ r.v }}</td>
      </tr>
    </tbody>
  </table>
</template>

<script setup lang="ts">
export interface SpecRow {
  k: string
  v: string
  tone?: 'good' | 'warn' | 'bad'
  num?: boolean
  title?: string
  /** Makes the label a link, e.g. to another datasheet. */
  open?: () => void
}

defineProps<{ rows: SpecRow[] }>()
</script>

<style scoped>
.spec {
  width: 100%;
  border-collapse: collapse;
  font-size: 12px;
}

th {
  width: 38%;
  text-align: left;
  vertical-align: top;
  font-family: var(--font-label);
  font-weight: 600;
  text-transform: uppercase;
  letter-spacing: 0.06em;
  color: var(--ink-2);
  padding: 2px 8px 2px 0;
}

td {
  padding: 2px 0;
}

tr + tr > * {
  border-top: 1px dotted var(--rule);
}

.good td {
  color: #1d6a1a;
}

.warn td {
  color: #8a5300;
}

.bad td {
  color: #a3200f;
}
</style>
