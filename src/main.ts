import { createApp } from 'vue'
import { createPinia } from 'pinia'
import '@fontsource/barlow-condensed/500.css'
import '@fontsource/barlow-condensed/600.css'
import '@fontsource/barlow-condensed/700.css'
import '@fontsource/ibm-plex-mono/400.css'
import '@fontsource/ibm-plex-mono/600.css'
import '@fontsource/ibm-plex-sans-condensed/400.css'
import '@fontsource/ibm-plex-sans-condensed/600.css'

import App from './App.vue'
import { installLogging } from './logging'
import './assets/main.css'

const app = createApp(App).use(createPinia())
installLogging(app)
app.mount('#app')
