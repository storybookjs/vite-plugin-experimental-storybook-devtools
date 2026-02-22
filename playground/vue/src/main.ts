import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

import 'vite-plugin-experimental-storybook-devtools/client/listeners'
import 'vite-plugin-experimental-storybook-devtools/client/overlay'

createApp(App).mount('#app')
