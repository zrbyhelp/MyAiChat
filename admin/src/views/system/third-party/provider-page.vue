<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import { useRoute } from "vue-router";
import { message } from "@/utils/message";
import {
  createThirdPartyConfig,
  deleteThirdPartyConfig,
  getThirdPartyConfigList,
  updateThirdPartyConfig
} from "@/api/system";

defineOptions({
  name: "ThirdPartyProviderPage"
});

type ProviderKey =
  | "wechat_open"
  | "wechat_mp"
  | "qq"
  | "aliyun"
  | "qiniu"
  | "tencent"
  | "aws"
  | "custom";

type ProviderMeta = {
  label: string;
  description: string;
};

type ProviderTabItem = {
  value: ProviderKey;
  label: string;
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

const PROVIDER_META: Record<ProviderKey, ProviderMeta> = {
  wechat_open: {
    label: "微信开放平台",
    description: "管理微信开放平台接口配置"
  },
  wechat_mp: {
    label: "微信公众平台",
    description: "管理微信公众平台接口配置"
  },
  qq: {
    label: "QQ 设置",
    description: "管理 QQ 相关第三方接口配置"
  },
  aliyun: {
    label: "阿里云配置",
    description: "管理阿里云相关第三方接口配置"
  },
  qiniu: {
    label: "七牛云配置",
    description: "管理七牛云相关第三方接口配置"
  },
  tencent: {
    label: "腾讯云配置",
    description: "管理腾讯云相关第三方接口配置"
  },
  aws: {
    label: "AWS 配置",
    description: "管理 AWS 相关第三方接口配置"
  },
  custom: {
    label: "自定义配置",
    description: "管理其他第三方接口配置"
  }
};

const PATH_PROVIDER_MAP: Record<string, ProviderKey> = {
  wechat: "wechat_open",
  "wechat-open": "wechat_open",
  "wechat-mp": "wechat_mp",
  qq: "qq",
  aliyun: "aliyun",
  qiniu: "qiniu",
  tencent: "tencent",
  aws: "aws",
  custom: "custom"
};

const route = useRoute();
const loading = ref(false);
const submitLoading = ref(false);
const dialogVisible = ref(false);
const dialogTitle = ref("新增配置");
const isEdit = ref(false);
const list = ref<ThirdPartyConfigRow[]>([]);

const form = reactive({
  id: undefined as number | undefined,
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

const routeKey = computed(() =>
  String(route.path || "")
    .split("/")
    .filter(Boolean)
    .at(-1) || ""
);

const currentProviderOptions = computed<ProviderKey[]>(() => {
  if (["wechat", "wechat-open", "wechat-mp"].includes(routeKey.value)) {
    return ["wechat_open", "wechat_mp"];
  }
  const provider = PATH_PROVIDER_MAP[routeKey.value];
  return provider ? [provider] : [];
});

const activeProvider = ref<ProviderKey | "">("");

const currentProvider = computed<ProviderKey | "">(() => activeProvider.value);

const providerTabs = computed<ProviderTabItem[]>(() =>
  currentProviderOptions.value.map(value => ({
    value,
    label: PROVIDER_META[value].label
  }))
);

const currentProviderLabel = computed(() =>
  currentProvider.value ? PROVIDER_META[currentProvider.value].label : ""
);

const providerMeta = computed(() => {
  if (["wechat", "wechat-open", "wechat-mp"].includes(routeKey.value)) {
    return {
      label: "微信设置",
      description: "管理微信开放平台与公众平台接口配置"
    };
  }
  return currentProvider.value ? PROVIDER_META[currentProvider.value] : null;
});

const resetForm = () => {
  form.id = undefined;
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

const fillForm = (row: ThirdPartyConfigRow) => {
  form.id = row.id;
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

const fetchList = async () => {
  if (!currentProvider.value) return;
  loading.value = true;
  try {
    const res = await getThirdPartyConfigList({
      provider: currentProvider.value,
      currentPage: 1,
      pageSize: 500
    });
    if (res.code === 0) {
      list.value = (res.data?.list || []) as ThirdPartyConfigRow[];
      return;
    }
    message(res.message || "获取配置失败", { type: "error" });
  } finally {
    loading.value = false;
  }
};

const openCreateDialog = () => {
  resetForm();
  isEdit.value = false;
  dialogTitle.value = `新增${currentProviderLabel.value}`;
  dialogVisible.value = true;
};

const openEditDialog = (row: ThirdPartyConfigRow) => {
  fillForm(row);
  isEdit.value = true;
  dialogTitle.value = `编辑${currentProviderLabel.value}`;
  dialogVisible.value = true;
};

const submit = async () => {
  if (!currentProvider.value) {
    message("当前页面配置无效", { type: "error" });
    return;
  }
  if (!String(form.name || "").trim()) {
    message("请输入配置名称", { type: "warning" });
    return;
  }

  const parsed = parseExtraText();
  if (!parsed.ok) {
    message(parsed.message, { type: "warning" });
    return;
  }

  const payload = {
    id: form.id,
    provider: currentProvider.value,
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
    extra: parsed.value
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
    await fetchList();
  } finally {
    submitLoading.value = false;
  }
};

const removeConfig = async (row: ThirdPartyConfigRow) => {
  const res = await deleteThirdPartyConfig({ id: row.id });
  if (res.code !== 0) {
    message(res.message || "删除失败", { type: "error" });
    return;
  }
  message("删除成功", { type: "success" });
  await fetchList();
};

const toggleEnabled = async (row: ThirdPartyConfigRow, enabled: boolean) => {
  if (!currentProvider.value) return;
  const res = await updateThirdPartyConfig({
    id: row.id,
    provider: currentProvider.value,
    name: row.name,
    appId: row.appId || "",
    appKey: row.appKey || "",
    appSecret: row.appSecret || "",
    endpoint: row.endpoint || "",
    bucket: row.bucket || "",
    region: row.region || "",
    callbackUrl: row.callbackUrl || "",
    isEnabled: enabled,
    remark: row.remark || "",
    extra: row.extra || {}
  });
  if (res.code !== 0) {
    message(res.message || "状态更新失败", { type: "error" });
  } else {
    message(enabled ? "已启用" : "已停用", { type: "success" });
  }
  await fetchList();
};

watch(
  () => routeKey.value,
  () => {
    const options = currentProviderOptions.value;
    if (!options.length) {
      activeProvider.value = "";
      list.value = [];
      return;
    }
    if (!options.includes(activeProvider.value as ProviderKey)) {
      activeProvider.value = options[0];
    }
  },
  { immediate: true }
);

watch(
  () => currentProvider.value,
  () => {
    list.value = [];
    resetForm();
    void fetchList();
  },
  { immediate: true }
);
</script>

<template>
  <div class="main third-party-page">
    <el-card shadow="never">
      <template #header>
        <div class="header-wrap">
          <div class="title-wrap">
            <div class="page-title">{{ providerMeta?.label || "三方配置" }}</div>
            <div class="page-desc">{{ providerMeta?.description || "当前页面未匹配配置类型" }}</div>
          </div>
          <el-button
            type="primary"
            :disabled="!currentProvider"
            @click="openCreateDialog"
          >
            新增配置
          </el-button>
        </div>
      </template>

      <el-tabs v-if="providerTabs.length > 1" v-model="activeProvider" class="provider-tabs">
        <el-tab-pane
          v-for="tab in providerTabs"
          :key="tab.value"
          :label="tab.label"
          :name="tab.value"
        />
      </el-tabs>

      <div v-loading="loading" class="config-grid">
        <div v-if="!currentProvider" class="empty-wrap">
          <el-empty description="页面类型无效" />
        </div>
        <div v-else-if="list.length === 0" class="empty-wrap">
          <el-empty description="暂无配置" />
        </div>
        <div v-for="item in list" :key="item.id" class="config-card">
          <div class="card-header">
            <div class="card-title">{{ item.name }}</div>
            <el-switch
              :model-value="Boolean(item.isEnabled)"
              @change="val => toggleEnabled(item, Boolean(val))"
            />
          </div>

          <div class="meta-grid">
            <div class="meta-item">
              <span class="meta-label">AppId</span>
              <span class="meta-value">{{ item.appId || "-" }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">AppKey</span>
              <span class="meta-value">{{ item.appKey || "-" }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Endpoint</span>
              <span class="meta-value">{{ item.endpoint || "-" }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Bucket</span>
              <span class="meta-value">{{ item.bucket || "-" }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">Region</span>
              <span class="meta-value">{{ item.region || "-" }}</span>
            </div>
            <div class="meta-item">
              <span class="meta-label">回调地址</span>
              <span class="meta-value">{{ item.callbackUrl || "-" }}</span>
            </div>
          </div>

          <div class="remark">{{ item.remark || "无备注" }}</div>

          <div class="actions">
            <el-button link type="primary" @click="openEditDialog(item)">
              编辑
            </el-button>
            <el-popconfirm title="确定删除该配置吗？" @confirm="removeConfig(item)">
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
        <el-button type="primary" :loading="submitLoading" @click="submit">
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

.header-wrap {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.title-wrap {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.page-title {
  font-size: 16px;
  font-weight: 600;
}

.page-desc {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.provider-tabs {
  margin-bottom: 12px;
}

.config-grid {
  min-height: 280px;
  display: grid;
  gap: 12px;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
}

.config-card {
  border: 1px solid var(--el-border-color-light);
  border-radius: 10px;
  padding: 12px;
  background: var(--el-bg-color);
}

.card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  margin-bottom: 10px;
}

.card-title {
  font-size: 15px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.meta-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  padding: 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.meta-item {
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

.remark {
  margin-top: 10px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.actions {
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

  .meta-grid {
    grid-template-columns: 1fr;
  }
}
</style>
