import { createApp } from 'vue'
import { clerkPlugin } from '@clerk/vue'
import { createPinia } from 'pinia'
import TDesign from 'tdesign-vue-next'
import TDesignChat from '@tdesign-vue-next/chat' // 引入chat组件
// 引入组件库的少量全局样式变量
import 'tdesign-vue-next/es/style/index.css'

import App from './App.vue'
import router from './router'

const app = createApp(App)
const clerkPublishableKey = import.meta.env.VITE_CLERK_PUBLISHABLE_KEY as string

app.use(createPinia())
app.use(router)
app.use(clerkPlugin, {
  publishableKey: clerkPublishableKey,
})
app.use(TDesign)
app.use(TDesignChat)
app.mount('#app')
