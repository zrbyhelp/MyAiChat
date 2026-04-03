<template>
  <div class="app-shell">
    <div class="auth-entry">
      <div v-if="isLoaded && isSignedIn" class="auth-entry-signed-in">
        <span class="auth-entry-name">{{ currentUserLabel }}</span>
        <UserButton after-sign-out-url="/" />
      </div>
      <TButton v-else theme="primary" shape="round" @click="openSignInModal">登录</TButton>
    </div>
    <router-view />
  </div>
</template>

<script setup lang="ts">
import { computed, watchEffect } from 'vue'
import { UserButton, useAuth, useClerk, useUser } from '@clerk/vue'
import { Button as TButton } from 'tdesign-vue-next'

import { configureAuthBridge } from '@/lib/auth'

const clerk = useClerk()
const { getToken, isLoaded, isSignedIn } = useAuth()
const { user } = useUser()

function buildCurrentUserLabel() {
  const current = user.value
  if (!current) {
    return '已登录'
  }

  const fullName = String(current.fullName || '').trim()
  if (fullName) {
    return fullName
  }

  const nameFromParts = [current.firstName, current.lastName]
    .map((item) => String(item || '').trim())
    .filter(Boolean)
    .join(' ')
  if (nameFromParts) {
    return nameFromParts
  }

  const username = String(current.username || '').trim()
  if (username) {
    return username
  }

  const email = String(current.primaryEmailAddress?.emailAddress || '').trim()
  if (email) {
    return email
  }

  return '已登录'
}

const currentUserLabel = computed(() => buildCurrentUserLabel())

function openSignInModal() {
  clerk.value?.openSignIn?.()
}

watchEffect(() => {
  configureAuthBridge({
    getToken: async () => {
      if (!isSignedIn.value) {
        return null
      }
      return getToken.value()
    },
    isLoaded: () => Boolean(isLoaded.value),
    isSignedIn: () => Boolean(isSignedIn.value),
    openSignIn: openSignInModal,
    onUnauthorized: openSignInModal,
  })
})
</script>

<style>
* {
  margin: 0;
  padding: 0;
  box-sizing: border-box;
}

html,
body,
#app {
  height: 100%;
}

html {
  scrollbar-width: none;
}

body {
  -ms-overflow-style: none;
  scrollbar-width: none;
}

body::-webkit-scrollbar,
*::-webkit-scrollbar {
  width: 0;
  height: 0;
  display: none;
}

* {
  scrollbar-width: none;
  -ms-overflow-style: none;
}

.app-shell {
  min-height: 100%;
}

.auth-entry {
  position: fixed;
  top: 16px;
  right: 16px;
  z-index: 1200;
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 10px 12px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.94);
  box-shadow: 0 12px 30px rgba(15, 23, 42, 0.12);
  backdrop-filter: blur(10px);
}

.auth-entry-signed-in {
  display: flex;
  align-items: center;
  gap: 10px;
}

.auth-entry-name {
  max-width: 200px;
  overflow: hidden;
  color: #334155;
  font-size: 13px;
  font-weight: 600;
  text-overflow: ellipsis;
  white-space: nowrap;
}

@media (max-width: 768px) {
  .auth-entry {
    top: 12px;
    right: 12px;
    padding: 8px 10px;
  }

  .auth-entry-name {
    max-width: 120px;
  }
}
</style>
