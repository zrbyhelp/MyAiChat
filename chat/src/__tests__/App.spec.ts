import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, shallowRef } from 'vue'

import App from '../App.vue'
import router from '../router'

const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>()
const openSignInMock = vi.fn()
const authLoadedRef = shallowRef(true)
const signedInRef = shallowRef(true)
const userRef = shallowRef<{
  fullName: string
  firstName: string
  lastName: string
  username: string
  primaryEmailAddress: {
    emailAddress: string
  }
} | null>({
  fullName: 'Test User',
  firstName: 'Test',
  lastName: 'User',
  username: 'test-user',
  primaryEmailAddress: {
    emailAddress: 'test@example.com',
  },
})

vi.mock('@antv/x6', () => ({
  Graph: class {},
  Scroller: class {},
  Selection: class {},
  Snapline: class {},
  Shape: {},
}))

vi.mock('@clerk/vue', () => ({
  clerkPlugin: {
    install() {},
  },
  UserButton: {
    template: '<div class="user-button-stub" />',
  },
  useAuth: () => ({
    isLoaded: computed(() => authLoadedRef.value),
    isSignedIn: computed(() => signedInRef.value),
    userId: computed(() => 'user_test'),
    getToken: computed(() => async () => 'token_test'),
  }),
  useClerk: () => shallowRef({
    openSignIn: openSignInMock,
  }),
  useUser: () => ({
    user: computed(() => userRef.value),
  }),
}))

vi.stubGlobal('fetch', fetchMock)

function mountApp() {
  return mount(App, {
    global: {
      plugins: [router],
      stubs: {
        't-chatbot': {
          template: '<div class="chatbot-stub"><slot name="sender-footer-prefix" /></div>',
        },
        TButton: {
          template: '<button><slot name="icon" /><slot /></button>',
        },
        TDialog: true,
        TDrawer: true,
        TDropdown: {
          template: '<div><slot /></div>',
        },
        TForm: true,
        TFormItem: true,
        TInput: true,
        TInputNumber: true,
        TSelect: true,
        TSpace: {
          template: '<div><slot /></div>',
        },
        TTextarea: true,
        SettingIcon: true,
        OrderIcon: true,
        LightbulbIcon: true,
        AiEducationIcon: true,
      },
    },
  })
}

describe('App', () => {
  afterEach(async () => {
    fetchMock.mockReset()
    openSignInMock.mockReset()
    authLoadedRef.value = true
    signedInRef.value = true
    userRef.value = {
      fullName: 'Test User',
      firstName: 'Test',
      lastName: 'User',
      username: 'test-user',
      primaryEmailAddress: {
        emailAddress: 'test@example.com',
      },
    }
    await router.push('/')
  })

  it('renders signed-in user label when Clerk session is ready', async () => {
    await router.push('/')
    await router.isReady()

    const wrapper = mountApp()
    await flushPromises()

    expect(wrapper.text()).toContain('Test User')
    expect(wrapper.find('.user-button-stub').exists()).toBe(true)
    expect(wrapper.text()).not.toContain('登录')
  })

  it('opens Clerk sign-in modal when user clicks login while signed out', async () => {
    signedInRef.value = false
    userRef.value = null

    await router.push('/')
    await router.isReady()

    const wrapper = mountApp()
    await flushPromises()

    await wrapper.get('button').trigger('click')

    expect(openSignInMock).toHaveBeenCalledTimes(1)
  })

  it('falls back to username when Clerk user has no full name', async () => {
    userRef.value = {
      fullName: '',
      firstName: '',
      lastName: '',
      username: 'linuxdo_user',
      primaryEmailAddress: {
        emailAddress: 'linuxdo@example.com',
      },
    }

    await router.push('/')
    await router.isReady()

    const wrapper = mountApp()
    await flushPromises()

    expect(wrapper.text()).toContain('linuxdo_user')
  })
})
