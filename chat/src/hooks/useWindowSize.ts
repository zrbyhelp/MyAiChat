import { onMounted, onUnmounted, ref } from 'vue'

export function useWindowSize() {
  const width = ref(0)
  const height = ref(0)

  function updateWindowSize() {
    if (typeof window === 'undefined') {
      return
    }
    width.value = window.innerWidth
    height.value = window.innerHeight
  }

  onMounted(() => {
    updateWindowSize()
    window.addEventListener('resize', updateWindowSize)
  })

  onUnmounted(() => {
    if (typeof window === 'undefined') {
      return
    }
    window.removeEventListener('resize', updateWindowSize)
  })

  return {
    width,
    height,
  }
}
