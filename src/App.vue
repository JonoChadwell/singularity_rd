<template>
  <header>
    <div class="wrapper">
      <nav>
        <RouterLink to="/">Home</RouterLink>
        <RouterLink to="/about">About</RouterLink>
        <RouterLink to="/singularity-rd">Singularity R&D</RouterLink>
      </nav>
    </div>
  </header>

  <RouterView />
</template>

<style scoped>
header {
  line-height: 1.5;
  width: 100%;
  background: white;
  border-bottom: 1px solid var(--color-border);
  position: sticky;
  top: 0;
  z-index: 100;
}

.wrapper {
  max-width: 1280px;
  margin: 0 auto;
  padding: 0 2rem;
}

nav {
  width: 100%;
  font-size: 1rem;
  text-align: center;
  padding: 1rem 0;
}

nav a.router-link-exact-active {
  color: var(--color-primary);
  font-weight: bold;
}

nav a.router-link-exact-active:hover {
  background-color: transparent;
}

nav a {
  display: inline-block;
  padding: 0.5rem 1rem;
  border-left: 1px solid var(--color-border);
  text-decoration: none;
  color: var(--color-text);
  transition: color 0.3s ease;
}

nav a:first-of-type {
  border: 0;
}

nav a:hover {
  color: var(--color-primary);
}
</style>
