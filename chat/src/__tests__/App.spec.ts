import { flushPromises, mount } from '@vue/test-utils'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { computed, shallowRef } from 'vue'

import App from '../App.vue'
import router from '../router'

const fetchMock = vi.fn<(input: RequestInfo | URL) => Promise<Response>>()

vi.mock('@clerk/vue', () => ({
  clerkPlugin: {
    install() {},
  },
  UserButton: {
    template: '<div class="user-button-stub" />',
  },
  useAuth: () => ({
    isLoaded: computed(() => true),
    isSignedIn: computed(() => true),
    userId: computed(() => 'user_test'),
    getToken: computed(() => async () => 'token_test'),
  }),
  useClerk: () => shallowRef({
    openSignIn: vi.fn(),
  }),
  useUser: () => ({
    user: computed(() => ({
      fullName: 'Test User',
      primaryEmailAddress: {
        emailAddress: 'test@example.com',
      },
    })),
  }),
}))

vi.stubGlobal('fetch', fetchMock)

function createResponse(payload: unknown) {
  return Promise.resolve(
    new Response(JSON.stringify(payload), {
      status: 200,
      headers: {
        'Content-Type': 'application/json',
      },
    }),
  )
}

describe('App', () => {
  afterEach(() => {
    fetchMock.mockReset()
    router.push('/')
  })

  it('loads chat page with configured model list and current selection', async () => {
    fetchMock.mockImplementation((input) => {
      const url = String(input)

      if (url === '/api/model-configs') {
        return createResponse({
          configs: [
            {
              id: 'cfg-1',
              name: 'DeepSeek 线上',
              provider: 'openai',
              baseUrl: 'https://api.deepseek.com/v1',
              apiKey: 'sk-demo',
              model: 'deepseek-chat',
              temperature: 0.7,
            },
            {
              id: 'cfg-2',
              name: '本地 Ollama',
              provider: 'ollama',
              baseUrl: 'http://127.0.0.1:11434',
              apiKey: '',
              model: 'qwen3:latest',
              temperature: 0.7,
            },
          ],
          activeModelConfigId: 'cfg-1',
        })
      }

      if (url.startsWith('/api/capabilities?')) {
        return createResponse({
          capabilities: {
            supportsStreaming: true,
            supportsReasoning: true,
          },
        })
      }

      if (url === '/api/sessions') {
        return createResponse({
          sessions: [
            {
              id: 'session-1',
              title: '测试会话',
              preview: '你好',
              createdAt: '2026-03-18T08:00:00.000Z',
              updatedAt: '2026-03-18T08:00:00.000Z',
              robotName: '当前机器人',
              modelConfigId: 'cfg-1',
              modelLabel: 'DeepSeek 线上',
            },
          ],
        })
      }

      if (url === '/api/robots') {
        return createResponse({
          robots: [
            {
              id: 'robot-1',
              name: '销售顾问',
              description: '用于售前咨询',
              avatar: '',
              systemPrompt: '你是一名销售顾问',
            },
          ],
        })
      }

      if (url === '/api/sessions/session-1') {
        return createResponse({
          session: {
            id: 'session-1',
            title: '测试会话',
            preview: '你好',
            createdAt: '2026-03-18T08:00:00.000Z',
            updatedAt: '2026-03-18T08:00:00.000Z',
            robotName: '当前机器人',
            modelConfigId: 'cfg-1',
            modelLabel: 'DeepSeek 线上',
            robot: {
              name: '当前机器人',
              avatar: '',
              systemPrompt: '',
            },
            messages: [],
          },
        })
      }

      throw new Error(`Unhandled request: ${url}`)
    })

    router.push('/')
    await router.isReady()

    const wrapper = mount(App, {
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

    await flushPromises()

    expect(fetchMock).toHaveBeenCalledTimes(5)
    expect(wrapper.text()).toContain('当前机器人')
    expect(wrapper.text()).toContain('DeepSeek 线上')
    expect(wrapper.text()).toContain('设置机器人')
    expect(wrapper.text()).toContain('测试会话')
  })
})
