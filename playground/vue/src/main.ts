import { createApp } from 'vue'
import App from './App.vue'
import './style.css'

import '@storybook/experimental-devtools/client/listeners'
import '@storybook/experimental-devtools/client/overlay'

createApp(App).mount('#app')
