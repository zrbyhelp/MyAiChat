<script setup lang="ts">
import { useI18n } from "vue-i18n";
import { useRouter } from "vue-router";
import { ref, computed, onMounted } from "vue";
import dayjs from "dayjs";
import { noticesData, type ListItem } from "./data";
import NoticeList from "./components/NoticeList.vue";
import { getLayNoticeList, readLayNotice } from "@/api/system";

import BellIcon from "~icons/lucide/bell";
import ArrowRightIcon from "~icons/ri/arrow-right-s-line";

const { t } = useI18n();
const router = useRouter();
const dropdownRef = ref();
const notices = ref(
  noticesData.map(item => ({
    ...item,
    list: []
  }))
);
const activeKey = ref(noticesData[0]?.key);

const getLabel = computed(
  () => item =>
    t(item.name) + (item.list.length > 0 ? `(${item.list.length})` : "")
);

const currentNoticeHasData = computed(() => {
  const currentNotice = notices.value.find(
    item => item.key === activeKey.value
  );
  return currentNotice && currentNotice.list.length > 0;
});

const hasAnyNoticeData = computed(() => {
  return notices.value.some(
    item => Array.isArray(item.list) && item.list.length > 0
  );
});

const onWatchMore = () => {
  dropdownRef.value.handleClose();
};

const loadNotices = async () => {
  const res = await getLayNoticeList({});
  if (res.code !== 0 || !Array.isArray(res.data)) return;
  const list: ListItem[] = res.data.map(item => ({
    id: Number(item.id),
    avatar: "",
    title: item.title || "系统通知",
    description: item.description || "",
    datetime: dayjs(Number(item.datetime)).format("YYYY-MM-DD HH:mm:ss"),
    type: "2",
    routePath: item.routePath || "",
    read: Boolean(item.read)
  }));
  const firstTab = notices.value.find(item => item.key === noticesData[0]?.key);
  if (firstTab) firstTab.list = list.filter(item => !item.read);
};

const onMarkAsRead = async () => {
  const currentNotice = notices.value.find(
    item => item.key === activeKey.value
  );
  if (currentNotice) {
    if (currentNotice.key === noticesData[0]?.key) {
      await readLayNotice({});
    }
    currentNotice.list = [];
  }
};

const onNoticeItemClick = async (item: ListItem) => {
  if (item.id) {
    await readLayNotice({ id: item.id });
  }
  if (item.routePath) {
    await router.push(item.routePath);
  }
  dropdownRef.value?.handleClose?.();
};

const onVisibleChange = (visible: boolean) => {
  if (visible) void loadNotices();
};

onMounted(() => {
  void loadNotices();
});
</script>

<template>
  <el-dropdown ref="dropdownRef" trigger="click" placement="bottom-end" @visible-change="onVisibleChange">
    <span
      :class="['dropdown-badge', 'navbar-bg-hover', 'select-none', 'mr-[7px]']"
    >
      <el-badge is-dot :hidden="!hasAnyNoticeData">
        <span class="header-notice-icon">
          <IconifyIconOffline :icon="BellIcon" />
        </span>
      </el-badge>
    </span>
    <template #dropdown>
      <el-dropdown-menu>
        <el-tabs
          v-model="activeKey"
          :stretch="true"
          class="dropdown-tabs"
          :style="{ width: notices.length === 0 ? '200px' : '330px' }"
        >
          <el-empty
            v-if="notices.length === 0"
            :description="t('status.pureNoMessage')"
            :image-size="60"
          />
          <span v-else>
            <template v-for="item in notices" :key="item.key">
              <el-tab-pane :label="getLabel(item)" :name="`${item.key}`">
                <el-scrollbar max-height="345px">
                  <div class="noticeList-container">
                    <NoticeList :list="item.list" :emptyText="item.emptyText" @item-click="onNoticeItemClick" />
                  </div>
                </el-scrollbar>
              </el-tab-pane>
            </template>
          </span>
        </el-tabs>
        <div
          v-if="currentNoticeHasData"
          class="border-t border-t-(--el-border-color-light) text-sm"
        >
          <div class="flex-bc m-1">
            <el-button type="primary" size="small" text @click="onWatchMore">
              {{ t("buttons.pureWatchMore") }}
              <IconifyIconOffline :icon="ArrowRightIcon" />
            </el-button>
            <el-button type="primary" size="small" text @click="onMarkAsRead">
              {{ t("buttons.pureMarkAsRead") }}
            </el-button>
          </div>
        </div>
      </el-dropdown-menu>
    </template>
  </el-dropdown>
</template>

<style lang="scss" scoped>
/* ”铃铛“摇晃衰减动画 */
@keyframes pure-bell-ring {
  0%,
  100% {
    transform-origin: top;
  }

  15% {
    transform: rotateZ(10deg);
  }

  30% {
    transform: rotateZ(-10deg);
  }

  45% {
    transform: rotateZ(5deg);
  }

  60% {
    transform: rotateZ(-5deg);
  }

  75% {
    transform: rotateZ(2deg);
  }
}

.dropdown-badge {
  display: flex;
  align-items: center;
  justify-content: center;
  width: 40px;
  height: 48px;
  cursor: pointer;

  .header-notice-icon {
    font-size: 16px;
  }

  &:hover {
    .header-notice-icon svg {
      animation: pure-bell-ring 1s both;
    }
  }
}

.dropdown-tabs {
  .noticeList-container {
    padding: 15px 24px 0;
  }

  :deep(.el-tabs__header) {
    margin: 0;
  }

  :deep(.el-tabs__nav-wrap)::after {
    height: 1px;
  }

  :deep(.el-tabs__nav-wrap) {
    padding: 0 36px;
  }
}
</style>
