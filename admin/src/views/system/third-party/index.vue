<script setup lang="ts">
import { computed, onMounted, reactive, ref, watch } from "vue";
import { message } from "@/utils/message";
import {
  createThirdPartyConfig,
  deleteThirdPartyConfig,
  getThirdPartyConfigList,
  getThirdPartyProviderList,
  updateThirdPartyConfig
} from "@/api/system";

defineOptions({
  name: "SystemThirdParty"
});

type ProviderOption = {
  value: string;
  label: string;
};

type ProviderGroup = {
  key: string;
  label: string;
  providers: ProviderOption[];
};

type ThirdPartyConfigRow = {
  id: number;
  provider: string;
  name: string;
  appId?: string;
  appKey?: string;
  appSecret?: string;
  endpoint?: string;
  bucket?: string;
  region?: string;
  callbackUrl?: string;
  isEnabled?: boolean;
  remark?: string;
  extra?: Record<string, unknown>;
};

const loading = ref(false);
const submitLoading = ref(false);
const dialogVisible = ref(false);
const dialogTitle = ref("新增配置");
const isEdit = ref(false);

const providerGroups = ref<ProviderGroup[]>([]);
const activeGroup = ref("");
const activeProvider = ref("");
const dataByProvider = reactive<Record<string, ThirdPartyConfigRow[]>>({});

const form = reactive({
  id: undefined as number | undefined,
  provider: "",
  name: "",
  appId: "",
  appKey: "",
  appSecret: "",
  endpoint: "",
  bucket: "",
  region: "",
  callbackUrl: "",
  isEnabled: true,
  remark: "",
  extraText: ""
});

const currentGroup = computed(() =>
  providerGroups.value.find(item => item.key === activeGroup.value)
);
const providerTabs = computed(() => currentGroup.value?.providers ?? []);
const allProviders = computed(() =>
  providerGroups.value.flatMap(group => group.providers)
);
const dialogProviderOptions = computed(() =>
  isEdit.value ? allProviders.value : providerTabs.value
);
const currentList = computed(() => dataByProvider[activeProvider.value] ?? []);
const providerLabelMap = computed(() => {
  const map = new Map<string, string>();
  providerGroups.value.forEach(group => {
    group.providers.forEach(provider => {
      map.set(provider.value, provider.label);
    });
  });
  return map;
});

const pickProviderLabel = (provider: string) =>
  providerLabelMap.value.get(provider) || provider;

const normalizeProviderGroups = (raw: any): ProviderGroup[] => {
  if (!Array.isArray(raw)) return [];
  return raw
    .map(item => ({
      key: String(item?.key || "").trim(),
      label: String(item?.label || "").trim(),
      providers: Array.isArray(item?.providers)
        ? item.providers
            .map((provider: any) => ({
              value: String(provider?.value || "").trim(),
              label: String(provider?.label || "").trim()
            }))
            .filter((provider: ProviderOption) => provider.value && provider.label)
        : []
    }))
    .filter((item: ProviderGroup) => item.key && item.label && item.providers.length > 0);
};

const resetForm = (provider = activeProvider.value) => {
  form.id = undefined;
  form.provider = provider;
  form.name = "";
  form.appId = "";
  form.appKey = "";
  form.appSecret = "";
  form.endpoint = "";
  form.bucket = "";
  form.region = "";
  form.callbackUrl = "";
  form.isEnabled = true;
  form.remark = "";
  form.extraText = "";
};

const fillFormByRow = (row: ThirdPartyConfigRow) => {
  form.id = row.id;
  form.provider = row.provider;
  form.name = String(row.name || "");
  form.appId = String(row.appId || "");
  form.appKey = String(row.appKey || "");
  form.appSecret = String(row.appSecret || "");
  form.endpoint = String(row.endpoint || "");
  form.bucket = String(row.bucket || "");
  form.region = String(row.region || "");
  form.callbackUrl = String(row.callbackUrl || "");
  form.isEnabled = Boolean(row.isEnabled);
  form.remark = String(row.remark || "");
  form.extraText =
    row.extra && Object.keys(row.extra).length > 0
      ? JSON.stringify(row.extra, null, 2)
      : "";
};

const parseExtraText = () => {
  const text = String(form.extraText || "").trim();
  if (!text) return { ok: true as const, value: {} as Record<string, unknown> };
  try {
    const parsed = JSON.parse(text);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
      return { ok: false as const, message: "扩展字段必须是 JSON 对象" };
    }
    return { ok: true as const, value: parsed as Record<string, unknown> };
  } catch {
    return { ok: false as const, message: "扩展字段 JSON 格式错误" };
  }
};

const validateForm = () => {
  if (!String(form.provider || "").trim()) return "请选择配置类型";
  if (!String(form.name || "").trim()) return "请输入配置名称";
  const extra = parseExtraText();
  if (!extra.ok) return extra.message;
  return "";
};

const fetchProviderGroups = async () => {
  loading.value = true;
  try {
    const res = await getThirdPartyProviderList({});
    if (res.code !== 0) {
      message(res.message || "获取分类失败", { type: "error" });
      return;
    }
    const groups = normalizeProviderGroups(res.data?.list);
    providerGroups.value = groups;
    groups.forEach(group => {
      group.providers.forEach(provider => {
        if (!dataByProvider[provider.value]) dataByProvider[provider.value] = [];
      });
    });

    if (!groups.length) {
      activeGroup.value = "";
      activeProvider.value = "";
      return;
    }

    if (!groups.some(item => item.key === activeGroup.value)) {
      activeGroup.value = groups[0].key;
    }
    const providers = groups.find(item => item.key === activeGroup.value)?.providers ?? [];
    if (!providers.some(item => item.value === activeProvider.value)) {
      activeProvider.value = providers[0]?.value || "";
    }
  } finally {
    loading.value = false;
  }
};

const fetchConfigList = async (provider = activeProvider.value) => {
  if (!provider) return;
  loading.value = true;
  try {
    const res = await getThirdPartyConfigList({
      provider,
      currentPage: 1,
      pageSize: 500
    });
    if (res.code === 0) {
      dataByProvider[provider] = (res.data?.list || []) as ThirdPartyConfigRow[];
      return;
    }
    message(res.message || "获取配置列表失败", { type: "error" });
  } finally {
    loading.value = false;
  }
};

const openCreateDialog = () => {
  resetForm();
  isEdit.value = false;
  dialogTitle.value = `新增${pickProviderLabel(activeProvider.value)}配置`;
  dialogVisible.value = true;
};

const openEditDialog = (row: ThirdPartyConfigRow) => {
  fillFormByRow(row);
  isEdit.value = true;
  dialogTitle.value = `编辑${pickProviderLabel(row.provider)}配置`;
  dialogVisible.value = true;
};

const handleSubmit = async () => {
  const validateError = validateForm();
  if (validateError) {
    message(validateError, { type: "warning" });
    return;
  }

  const extraParsed = parseExtraText();
  if (!extraParsed.ok) {
    message(extraParsed.message, { type: "warning" });
    return;
  }

  const payload = {
    id: form.id,
    provider: String(form.provider || "").trim(),
    name: String(form.name || "").trim(),
    appId: String(form.appId || "").trim(),
    appKey: String(form.appKey || "").trim(),
    appSecret: String(form.appSecret || "").trim(),
    endpoint: String(form.endpoint || "").trim(),
    bucket: String(form.bucket || "").trim(),
    region: String(form.region || "").trim(),
    callbackUrl: String(form.callbackUrl || "").trim(),
    isEnabled: Boolean(form.isEnabled),
    remark: String(form.remark || "").trim(),
    extra: extraParsed.value
  };

  submitLoading.value = true;
  try {
    const res = isEdit.value
      ? await updateThirdPartyConfig(payload)
      : await createThirdPartyConfig(payload);
    if (res.code !== 0) {
      message(res.message || "保存失败", { type: "error" });
      return;
    }
    dialogVisible.value = false;
    message(isEdit.value ? "更新成功" : "新增成功", { type: "success" });
    await fetchConfigList(payload.provider);
  } finally {
    submitLoading.value = false;
  }
};

const handleDelete = async (row: ThirdPartyConfigRow) => {
  const res = await deleteThirdPartyConfig({ id: row.id });
  if (res.code !== 0) {
    message(res.message || "删除失败", { type: "error" });
    return;
  }
  message("删除成功", { type: "success" });
  await fetchConfigList(row.provider);
};

const handleEnabledChange = async (row: ThirdPartyConfigRow, value: boolean) => {
  const payload = {
    id: row.id,
    provider: row.provider,
    name: row.name,
    appId: row.appId || "",
    appKey: row.appKey || "",
    appSecret: row.appSecret || "",
    endpoint: row.endpoint || "",
    bucket: row.bucket || "",
    region: row.region || "",
    callbackUrl: row.callbackUrl || "",
    isEnabled: Boolean(value),
    remark: row.remark || "",
    extra: row.extra || {}
  };
  const res = await updateThirdPartyConfig(payload);
  if (res.code !== 0) {
    message(res.message || "状态更新失败", { type: "error" });
  } else {
    message(value ? "已启用" : "已停用", { type: "success" });
  }
  await fetchConfigList(row.provider);
};

watch(activeGroup, groupKey => {
  const group = providerGroups.value.find(item => item.key === groupKey);
  if (!group) {
    activeProvider.value = "";
    return;
  }
  if (!group.providers.some(item => item.value === activeProvider.value)) {
    activeProvider.value = group.providers[0]?.value || "";
  }
});

watch(activeProvider, provider => {
  if (!provider) return;
  resetForm(provider);
  void fetchConfigList(provider);
});

onMounted(() => {
  void fetchProviderGroups();
});
</script>

<template>
  <div class="main third-party-page">
    <el-card shadow="never" class="third-party-card">
      <template #header>
        <div class="third-party-header">
          <div class="header-title">三方类库接口管理</div>
          <el-button
            type="primary"
            :disabled="!activeProvider"
            @click="openCreateDialog"
          >
            新增配置
          </el-button>
        </div>
      </template>

      <el-tabs v-model="activeGroup" class="group-tabs">
        <el-tab-pane
          v-for="group in providerGroups"
          :key="group.key"
          :label="group.label"
          :name="group.key"
        />
      </el-tabs>

      <el-tabs v-model="activeProvider" class="provider-tabs">
        <el-tab-pane
          v-for="provider in providerTabs"
          :key="provider.value"
          :label="provider.label"
          :name="provider.value"
        />
      </el-tabs>

      <div v-loading="loading" class="config-grid">
        <div v-if="!activeProvider" class="empty-wrap">
          <el-empty description="暂无可用分类" />
        </div>
        <div v-else-if="currentList.length === 0" class="empty-wrap">
          <el-empty description="暂无配置" />
        </div>
        <div v-for="item in currentList" :key="item.id" class="config-item">
          <div class="item-header">
            <div class="item-title">
              <span>{{ item.name }}</span>
              <el-tag size="small" type="info">{{ pickProviderLabel(item.provider) }}</el-tag>
            </div>
            <el-switch
              :model-value="Boolean(item.isEnabled)"
              @change="val => handleEnabledChange(item, Boolean(val))"
            />
          </div>

          <div class="item-meta">
            <div class="meta-row">
              <span class="meta-label">AppId</span>
              <span class="meta-value">{{ item.appId || "-" }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">AppKey</span>
              <span class="meta-value">{{ item.appKey || "-" }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Endpoint</span>
              <span class="meta-value">{{ item.endpoint || "-" }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Bucket</span>
              <span class="meta-value">{{ item.bucket || "-" }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">Region</span>
              <span class="meta-value">{{ item.region || "-" }}</span>
            </div>
            <div class="meta-row">
              <span class="meta-label">回调地址</span>
              <span class="meta-value">{{ item.callbackUrl || "-" }}</span>
            </div>
          </div>

          <div class="item-remark">{{ item.remark || "无备注" }}</div>

          <div class="item-actions">
            <el-button link type="primary" @click="openEditDialog(item)">
              编辑
            </el-button>
            <el-popconfirm
              title="确定删除该配置吗？"
              @confirm="handleDelete(item)"
            >
              <template #reference>
                <el-button link type="danger">删除</el-button>
              </template>
            </el-popconfirm>
          </div>
        </div>
      </div>
    </el-card>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="760px"
      destroy-on-close
    >
      <el-form label-width="110px">
        <el-form-item label="配置类型" required>
          <el-select v-model="form.provider" class="w-full" :disabled="isEdit">
            <el-option
              v-for="provider in dialogProviderOptions"
              :key="provider.value"
              :label="provider.label"
              :value="provider.value"
            />
          </el-select>
        </el-form-item>
        <el-form-item label="配置名称" required>
          <el-input
            v-model="form.name"
            placeholder="请输入配置名称"
            maxlength="120"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="AppId">
          <el-input v-model="form.appId" />
        </el-form-item>
        <el-form-item label="AppKey">
          <el-input v-model="form.appKey" />
        </el-form-item>
        <el-form-item label="AppSecret">
          <el-input v-model="form.appSecret" show-password />
        </el-form-item>
        <el-form-item label="Endpoint">
          <el-input v-model="form.endpoint" />
        </el-form-item>
        <el-form-item label="Bucket">
          <el-input v-model="form.bucket" />
        </el-form-item>
        <el-form-item label="Region">
          <el-input v-model="form.region" />
        </el-form-item>
        <el-form-item label="回调地址">
          <el-input v-model="form.callbackUrl" />
        </el-form-item>
        <el-form-item label="是否启用">
          <el-switch v-model="form.isEnabled" />
        </el-form-item>
        <el-form-item label="扩展字段">
          <el-input
            v-model="form.extraText"
            type="textarea"
            :rows="4"
            placeholder='例如：{"tenantId":"demo"}'
          />
        </el-form-item>
        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="handleSubmit">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.third-party-page {
  min-height: calc(100vh - 140px);
}

.third-party-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.header-title {
  font-size: 16px;
  font-weight: 600;
}

.group-tabs {
  margin-bottom: 6px;
}

.provider-tabs {
  margin-bottom: 12px;
}

.config-grid {
  min-height: 260px;
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
}

.config-item {
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  background: var(--el-bg-color);
  padding: 12px;
}

.item-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  margin-bottom: 10px;
}

.item-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-size: 15px;
  font-weight: 600;
}

.item-meta {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  padding: 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.meta-row {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.meta-label {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.meta-value {
  font-size: 13px;
  color: var(--el-text-color-primary);
  line-height: 1.3;
  word-break: break-all;
}

.item-remark {
  margin-top: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.item-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

.empty-wrap {
  grid-column: 1 / -1;
  min-height: 240px;
  display: flex;
  align-items: center;
  justify-content: center;
}

@media (max-width: 900px) {
  .config-grid {
    grid-template-columns: 1fr;
  }

  .item-meta {
    grid-template-columns: 1fr;
  }
}
</style>
