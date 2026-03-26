<script setup lang="ts">
import { ref, reactive } from "vue";
import { useRole } from "./hook";
import { getPickerShortcuts } from "../../utils";
import { PureTableBar } from "@/components/RePureTableBar";
import { useRenderIcon } from "@/components/ReIcon/src/hooks";
import { transformI18n, $t } from "@/plugins/i18n";
import { message } from "@/utils/message";
import { getUserList, getLogSizeNotifySetting, saveLogSizeNotifySetting } from "@/api/system";

import Delete from "~icons/ep/delete";
import Refresh from "~icons/ep/refresh";
import Setting from "~icons/ri/settings-3-line";

defineOptions({
  name: "LoginLog"
});

const formRef = ref();
const tableRef = ref();
const notifyDialogVisible = ref(false);
const notifyDialogLoading = ref(false);
const notifySaving = ref(false);
const userOptions = ref([]);
const notifyForm = reactive({
  thresholdCount: 1000,
  userIds: [] as number[]
});

async function openNotifyDialog() {
  notifyDialogVisible.value = true;
  notifyDialogLoading.value = true;
  try {
    const [settingRes, userRes] = await Promise.all([
      getLogSizeNotifySetting({ logType: "login" }),
      getUserList({})
    ]);
    if (settingRes.code === 0 && settingRes.data) {
      notifyForm.thresholdCount = Number(settingRes.data.thresholdCount || settingRes.data.thresholdMb || 1000);
      notifyForm.userIds = Array.isArray(settingRes.data.userIds) ? settingRes.data.userIds.map(Number) : [];
    }
    if (userRes.code === 0 && userRes.data?.list) {
      userOptions.value = userRes.data.list
        .filter(item => Number(item?.status) === 1)
        .map(item => ({
          id: Number(item.id),
          label: item.nickname || item.username || `#${item.id}`
        }));
    }
  } finally {
    notifyDialogLoading.value = false;
  }
}

async function submitNotifySetting() {
  if (!Number.isFinite(Number(notifyForm.thresholdCount)) || Number(notifyForm.thresholdCount) <= 0) {
    message("阈值条数必须大于 0", { type: "warning" });
    return;
  }
  if (!notifyForm.userIds.length) {
    message("请至少选择一个系统用户", { type: "warning" });
    return;
  }
  notifySaving.value = true;
  try {
    const res = await saveLogSizeNotifySetting({
      logType: "login",
      thresholdCount: Number(notifyForm.thresholdCount),
      userIds: notifyForm.userIds,
      enabled: true
    });
    if (res.code === 0) {
      message("设置已保存", { type: "success" });
      notifyDialogVisible.value = false;
    } else {
      message(res.message || "设置失败", { type: "error" });
    }
  } finally {
    notifySaving.value = false;
  }
}

const {
  form,
  loading,
  columns,
  dataList,
  logCount,
  pagination,
  selectedNum,
  onSearch,
  clearAll,
  resetForm,
  onbatchDel,
  handleSizeChange,
  onSelectionCancel,
  handleCurrentChange,
  handleSelectionChange
} = useRole(tableRef);
</script>

<template>
  <div class="main">
    <el-form
      ref="formRef"
      :inline="true"
      :model="form"
      class="search-form bg-bg_color w-full pl-8 pt-[12px] overflow-auto"
    >
      <el-form-item :label="transformI18n($t('monitor.username'))" prop="username">
        <el-input
          v-model="form.username"
          :placeholder="transformI18n($t('monitor.enterUsername'))"
          clearable
          class="w-[150px]!"
        />
      </el-form-item>
      <el-form-item :label="transformI18n($t('monitor.loginStatus'))" prop="status">
        <el-select
          v-model="form.status"
          :placeholder="transformI18n($t('monitor.pleaseSelect'))"
          clearable
          class="w-[150px]!"
        >
          <el-option :label="transformI18n($t('monitor.success'))" value="1" />
          <el-option :label="transformI18n($t('monitor.failed'))" value="0" />
        </el-select>
      </el-form-item>
      <el-form-item :label="transformI18n($t('monitor.loginTime'))" prop="loginTime">
        <el-date-picker
          v-model="form.loginTime"
          :shortcuts="getPickerShortcuts()"
          type="datetimerange"
          :range-separator="transformI18n($t('monitor.to'))"
          :start-placeholder="transformI18n($t('monitor.startDateTime'))"
          :end-placeholder="transformI18n($t('monitor.endDateTime'))"
        />
      </el-form-item>
      <el-form-item>
        <el-button
          type="primary"
          :icon="useRenderIcon('ri:search-line')"
          :loading="loading"
          @click="onSearch"
        >
          {{ transformI18n($t("monitor.search")) }}
        </el-button>
        <el-button :icon="useRenderIcon(Refresh)" @click="resetForm(formRef)">
          {{ transformI18n($t("monitor.reset")) }}
        </el-button>
      </el-form-item>
    </el-form>

    <PureTableBar :title="transformI18n($t('monitor.loginLog'))" :columns="columns" @refresh="onSearch">
      <template #title>
        <div class="flex items-center gap-3">
          <span class="font-bold truncate">{{ transformI18n($t("monitor.loginLog")) }}</span>
          <span class="text-[12px] text-[var(--el-text-color-secondary)] flex items-center gap-1">
            当前日志条数：{{ logCount }} 条
            <el-button link type="primary" :icon="useRenderIcon(Setting)" @click="openNotifyDialog" />
          </span>
        </div>
      </template>
      <template #buttons>
        <el-popconfirm :title="transformI18n($t('monitor.clearAllConfirm'))" @confirm="clearAll">
          <template #reference>
            <el-button type="danger" :icon="useRenderIcon(Delete)">
              {{ transformI18n($t("monitor.clearLogs")) }}
            </el-button>
          </template>
        </el-popconfirm>
      </template>
      <template v-slot="{ size, dynamicColumns }">
        <div
          v-if="selectedNum > 0"
          v-motion-fade
          class="bg-[var(--el-fill-color-light)] w-full h-[46px] mb-2 pl-4 flex items-center"
        >
          <div class="flex-auto">
            <span
              style="font-size: var(--el-font-size-base)"
              class="text-[rgba(42,46,54,0.5)] dark:text-[rgba(220,220,242,0.5)]"
            >
              {{ transformI18n($t("monitor.selected")) }} {{ selectedNum }} {{ transformI18n($t("monitor.items")) }}
            </span>
            <el-button type="primary" text @click="onSelectionCancel">
              {{ transformI18n($t("monitor.cancelSelection")) }}
            </el-button>
          </div>
          <el-popconfirm :title="transformI18n($t('monitor.deleteConfirm'))" @confirm="onbatchDel">
            <template #reference>
              <el-button type="danger" text class="mr-1!"> {{ transformI18n($t("monitor.batchDelete")) }} </el-button>
            </template>
          </el-popconfirm>
        </div>
        <pure-table
          ref="tableRef"
          row-key="id"
          align-whole="center"
          table-layout="auto"
          :loading="loading"
          :size="size"
          adaptive
          :adaptiveConfig="{ offsetBottom: 108 }"
          :data="dataList"
          :columns="dynamicColumns"
          :pagination="{ ...pagination, size }"
          :header-cell-style="{
            background: 'var(--el-fill-color-light)',
            color: 'var(--el-text-color-primary)'
          }"
          @selection-change="handleSelectionChange"
          @page-size-change="handleSizeChange"
          @page-current-change="handleCurrentChange"
        />
      </template>
    </PureTableBar>
    <el-dialog v-model="notifyDialogVisible" title="日志条数告警设置" width="520px">
      <el-form v-loading="notifyDialogLoading" label-width="130px">
        <el-form-item label="阈值（条）">
          <el-input-number
            v-model="notifyForm.thresholdCount"
            :min="1"
            :step="1"
            controls-position="right"
          />
        </el-form-item>
        <el-form-item label="通知系统用户">
          <el-select v-model="notifyForm.userIds" multiple filterable collapse-tags class="w-full" placeholder="请选择系统用户">
            <el-option
              v-for="user in userOptions"
              :key="user.id"
              :label="user.label"
              :value="user.id"
            />
          </el-select>
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="notifyDialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="notifySaving" @click="submitNotifySetting">保存</el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style lang="scss" scoped>
:deep(.el-dropdown-menu__item i) {
  margin: 0;
}

.main-content {
  margin: 24px 24px 0 !important;
}

.search-form {
  :deep(.el-form-item) {
    margin-bottom: 12px;
  }
}
</style>
