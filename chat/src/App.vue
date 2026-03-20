<template>
  <router-view />
</template>

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
</style>
