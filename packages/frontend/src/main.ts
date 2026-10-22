import { createApp } from 'vue'
import App from './App.vue'
import './styles/global.css'
import './styles/variables.css'
import './styles/typography.css'
import { router } from './router'
import { createDialogSystem } from './components/VDialogProvider.vue'
import { createToastSystem } from './components/VToastProvider.vue'

// iOS Safari zooms into any focused field whose font-size is below 16px.
// `maximum-scale=1` stops that while iOS still lets the user pinch-zoom; on
// Android it would disable pinch-zoom, hence iOS only (iPadOS poses as a Mac,
// but has touch points).
const isIOS = /iPhone|iPad|iPod/.test(navigator.userAgent)
  || (/Macintosh/.test(navigator.userAgent) && navigator.maxTouchPoints > 1)
if (isIOS) {
  document.querySelector('meta[name="viewport"]')
    ?.setAttribute('content', 'width=device-width, initial-scale=1.0, maximum-scale=1')
}

createApp(App)
  .use(router)
  .use(createDialogSystem())
  .use(createToastSystem())
  .mount('#app')
