<template>
  <figure class="dial">
    <AnalogGauge :value="dial.value" :label="dial.label" :zones="dial.zones" :marks="dial.marks" :ends="dial.ends" />
    <figcaption>
      <span class="num" :class="dial.valueTone">{{ Math.round(dial.value * 100) }}%</span>
      <span class="lbl">{{ dial.label }}</span>
    </figcaption>
    <div class="verdict">
      <span class="lbl">Jev’s verdict</span>
      <p class="stamp" :class="dial.verdict.tone">{{ dial.verdict.text }}</p>
    </div>
  </figure>
</template>

<script setup lang="ts">
import AnalogGauge, { type GaugeZone } from './AnalogGauge.vue'

/**
 * One of Jev's 0–1 answers, as a needle in a box: the number, what it measures, and what Jev's
 * verdict on it is. Every dial is the same size, so a row of them lines up.
 */
export interface Dial {
  key: string
  /** 0 to 1: the needle, and the percentage under it. */
  value: number
  /** What the number measures, under it in small capitals. */
  label: string
  /** The percentage's colour. */
  valueTone?: 'good' | 'bad' | 'info'
  zones: GaugeZone[]
  /** Heavy ticks: a pass bar, or where one band ends. */
  marks?: number[]
  ends?: [string, string]
  /** The stamp under the dial. */
  verdict: { text: string; tone: 'good' | 'bad' | 'ai' | 'info' }
}

defineProps<{ dial: Dial }>()
</script>

<style scoped>
.dial {
  box-sizing: border-box;
  flex: none;
  width: 180px;
  height: 188px;
  margin: 0;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 4px;
  padding: 8px 6px;
  background: linear-gradient(180deg, var(--chrome-3), var(--chrome-2));
  border: 1px solid #000;
  box-shadow: inset 1px 1px 0 var(--bevel-hi);
}

figcaption {
  display: flex;
  flex-direction: column;
  align-items: center;
  line-height: 1.15;
}

figcaption .num {
  font-size: 20px;
  font-weight: 600;
  color: var(--lcd-fg);
}

.num.good {
  color: var(--good);
}

.num.bad {
  color: var(--bad);
}

.num.info {
  color: var(--ai);
}

figcaption .lbl {
  max-width: 100%;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.verdict {
  margin-top: auto;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 2px;
}

.verdict .lbl {
  font-size: 10px;
  color: var(--silk-dim);
}

.stamp {
  margin: 0;
  max-width: 164px;
  padding: 0 8px;
  border: 2px solid currentColor;
  font-family: var(--font-label);
  font-weight: 700;
  font-size: 14px;
  line-height: 1.35;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
  transform: rotate(-2deg);
}

.stamp.good {
  color: var(--good);
}

.stamp.bad {
  color: var(--bad);
}

.stamp.ai,
.stamp.info {
  color: var(--ai);
}
</style>
