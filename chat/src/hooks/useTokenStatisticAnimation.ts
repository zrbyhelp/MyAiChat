import { ref, watch, type Ref } from 'vue'

interface AnimationState {
  duration: number
  valueFrom: number
}

export function useTokenStatisticAnimation(
  promptTokens: Ref<number>,
  completionTokens: Ref<number>,
) {
  const promptTokenAnimation = ref<AnimationState>({ duration: 520, valueFrom: 0 })
  const completionTokenAnimation = ref<AnimationState>({ duration: 520, valueFrom: 0 })
  const promptTokenAnimationStart = ref(false)
  const completionTokenAnimationStart = ref(false)

  watch(promptTokens, (next, prev) => {
    if (typeof prev !== 'number' || next === prev) {
      return
    }
    promptTokenAnimation.value = {
      duration: 520,
      valueFrom: prev,
    }
    promptTokenAnimationStart.value = false
    requestAnimationFrame(() => {
      promptTokenAnimationStart.value = true
    })
  })

  watch(completionTokens, (next, prev) => {
    if (typeof prev !== 'number' || next === prev) {
      return
    }
    completionTokenAnimation.value = {
      duration: 520,
      valueFrom: prev,
    }
    completionTokenAnimationStart.value = false
    requestAnimationFrame(() => {
      completionTokenAnimationStart.value = true
    })
  })

  return {
    promptTokenAnimation,
    completionTokenAnimation,
    promptTokenAnimationStart,
    completionTokenAnimationStart,
  }
}

