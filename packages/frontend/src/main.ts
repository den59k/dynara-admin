import { createApp } from 'vue'
import App from './App.vue'
import './styles/global.css'
import './styles/variables.css'
import './styles/typography.css'
import { router } from './router'
import { createDialogSystem } from './components/VDialogProvider.vue'

createApp(App)
  .use(router)
  .use(createDialogSystem())
  .mount('#app')
