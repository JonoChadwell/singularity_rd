<template>
  <div class="home">
    <img alt="Vue logo" class="logo" src="@/assets/logo.svg" width="125" height="125" />
    <HelloWorld msg="You did it!" />

    <div class="counter-section">
      <h2>Counter Example with Pinia</h2>
      <p>Count: {{ counter.count }}</p>
      <button @click="counter.increment">Increment</button>
      <button @click="counter.decrement">Decrement</button>
    </div>
  </div>
</template>

<script setup lang="ts">
import HelloWorld from '@/components/HelloWorld.vue'
import { useCounterStore } from '@/stores/counter'

const counter = useCounterStore()
</script>

<style scoped>
.home {
  text-align: center;
  padding: 2rem;
}

.logo {
  margin-bottom: 2rem;
}

.counter-section {
  margin-top: 2rem;
  padding: 1rem;
  border: 1px solid #ddd;
  border-radius: 8px;
  background-color: #f9f9f9;
}

.counter-section button {
  margin: 0 0.5rem;
  padding: 0.5rem 1rem;
  background-color: #42b883;
  color: white;
  border: none;
  border-radius: 4px;
  cursor: pointer;
}

.counter-section button:hover {
  background-color: #369870;
}
</style>
