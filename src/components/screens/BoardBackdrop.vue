<template>
  <!-- Copper traces and vias on bare board, behind a full-page screen. Its parent is position: relative. -->
  <svg class="traces" viewBox="0 0 800 500" preserveAspectRatio="xMidYMid slice" aria-hidden="true">
    <g class="copper">
      <path d="M0 120H220L260 160H330" />
      <path d="M0 380H180L230 330H330" />
      <path d="M800 140H600L560 180H470" />
      <path d="M800 360H620L580 320H470" />
      <path d="M360 0V90L380 110V150" />
      <path d="M440 500V410L420 390V350" />
      <path d="M120 0V60L160 100H250" />
      <path d="M690 500V440L650 400H560" />
    </g>
    <g class="vias">
      <circle cx="220" cy="120" r="5" />
      <circle cx="180" cy="380" r="5" />
      <circle cx="600" cy="140" r="5" />
      <circle cx="620" cy="360" r="5" />
      <circle cx="160" cy="100" r="5" />
      <circle cx="650" cy="400" r="5" />
    </g>
  </svg>
</template>

<style scoped>
.traces {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}

.copper path {
  fill: none;
  stroke: var(--copper);
  stroke-width: 4;
  opacity: 0.55;
}

.vias circle {
  fill: var(--pcb-0);
  stroke: var(--gold);
  stroke-width: 2.5;
  opacity: 0.7;
}
</style>
