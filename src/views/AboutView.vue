<template>
  <div class="about">
    <h1>This is an about page</h1>
    <p>This Vue 3 application includes:</p>
    <ul>
      <li>Vue 3 with Composition API</li>
      <li>TypeScript support</li>
      <li>Vue Router for navigation</li>
      <li>Pinia for state management</li>
      <li>Vite for fast development</li>
      <li>ESLint and Prettier for code quality</li>
      <li>Vitest for unit testing</li>
      <li>Cypress for end-to-end testing</li>
    </ul>
  </div>
</template>

<style scoped>
.about {
  max-width: 800px;
  margin: 0 auto;
  padding: 2rem;
}

.about h1 {
  color: #42b883;
  margin-bottom: 1rem;
}

.about ul {
  text-align: left;
  margin-top: 1rem;
}

.about li {
  margin: 0.5rem 0;
  padding: 0.5rem;
  background-color: #f9f9f9;
  border-radius: 4px;
}
</style>
