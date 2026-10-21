import { createApp } from 'vue'
import { createPinia } from 'pinia'

import App from './App.vue'
import { installLogging } from './logging'
import './assets/main.css'

const app = createApp(App).use(createPinia())
installLogging(app)
app.mount('#app')
