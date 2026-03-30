import { createRouter, createWebHistory } from 'vue-router'
import ChatView from '@/views/ChatView.vue'
import WorldGraphView from '@/views/WorldGraphView.vue'
import { isAuthLoadedNow, isSignedInNow, promptSignIn } from '@/lib/auth'

const router = createRouter({
  history: createWebHistory(import.meta.env.BASE_URL),
  routes: [
    {
      path: '/',
      redirect: { name: 'discover' },
    },
    {
      path: '/messages',
      name: 'agent',
      component: ChatView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/discover',
      name: 'discover',
      component: ChatView,
    },
    {
      path: '/mine',
      name: 'mine',
      component: ChatView,
      meta: {
        requiresAuth: true,
      },
    },
    {
      path: '/robots/:robotId/world-graph',
      name: 'robot-world-graph',
      component: WorldGraphView,
      meta: {
        requiresAuth: true,
      },
    },
  ],
})

router.beforeEach((to, from) => {
  if (!to.meta.requiresAuth || !isAuthLoadedNow() || isSignedInNow()) {
    return true
  }

  promptSignIn()
  return from.name ? false : { name: 'discover' }
})

export default router
