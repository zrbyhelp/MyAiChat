<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { message } from "@/utils/message";
import {
  createResourceSystemStorage,
  deleteResourceSystemStorage,
  getResourceSystemStorageList,
  updateResourceSystemStorage
} from "@/api/resourceSystem";

defineOptions({
  name: "ResourceSystemStorage"
});

type StorageProvider =
  | "local"
  | "qiniu"
  | "aliyun"
  | "tencent"
  | "minio"
  | "aws";

type StorageRow = {
  id: number;
  provider: StorageProvider;
  providerLabel: string;
  name: string;
  remark?: string;
  isEnabled?: boolean;
  storageUsedMb?: number;
  dailyTrafficUsedMb?: number;
  basePath?: string;
  bucket?: string;
  domain?: string;
  endpoint?: string;
  region?: string;
  zone?: string;
  accessKey?: string;
  secretKey?: string;
  accessKeyId?: string;
  accessKeySecret?: string;
  secretId?: string;
  secretAccessKey?: string;
  port?: number;
  useSSL?: boolean;
};

const providerTabs: Array<{ label: string; value: StorageProvider }> = [
  { label: "本地存储", value: "local" },
  { label: "七牛云", value: "qiniu" },
  { label: "阿里云 OSS", value: "aliyun" },
  { label: "腾讯云 COS", value: "tencent" },
  { label: "MinIO", value: "minio" },
  { label: "Amazon S3", value: "aws" }
];

const activeTab = ref<StorageProvider>("local");
const loading = ref(false);
const dialogVisible = ref(false);
const dialogTitle = ref("新增存储配置");
const submitLoading = ref(false);
const isEdit = ref(false);

const dataByProvider = reactive<Record<StorageProvider, StorageRow[]>>({
  local: [],
  qiniu: [],
  aliyun: [],
  tencent: [],
  minio: [],
  aws: []
});

const form = reactive({
  id: undefined as number | undefined,
  provider: "qiniu" as StorageProvider,
  name: "",
  remark: "",
  isEnabled: true,
  basePath: "",
  bucket: "",
  domain: "",
  endpoint: "",
  region: "",
  zone: "z0",
  accessKey: "",
  secretKey: "",
  accessKeyId: "",
  accessKeySecret: "",
  secretId: "",
  secretAccessKey: "",
  port: 9000,
  useSSL: false
});

const currentList = computed(() => dataByProvider[activeTab.value] || []);
const formProviderLabel = computed(
  () => providerTabs.find(item => item.value === form.provider)?.label || ""
);

const resetForm = () => {
  form.id = undefined;
  form.provider = activeTab.value === "local" ? "local" : activeTab.value;
  form.name = "";
  form.remark = "";
  form.isEnabled = true;
  form.basePath = "";
  form.bucket = "";
  form.domain = "";
  form.endpoint = "";
  form.region = "";
  form.zone = "z0";
  form.accessKey = "";
  form.secretKey = "";
  form.accessKeyId = "";
  form.accessKeySecret = "";
  form.secretId = "";
  form.secretAccessKey = "";
  form.port = 9000;
  form.useSSL = false;
};

const fillFormByRow = (row: StorageRow) => {
  form.id = row.id;
  form.provider = row.provider;
  form.name = row.name || "";
  form.remark = row.remark || "";
  form.isEnabled = row.provider === "local" ? true : Boolean(row.isEnabled);
  form.basePath = row.basePath || "";
  form.bucket = row.bucket || "";
  form.domain = row.domain || "";
  form.endpoint = row.endpoint || "";
  form.region = row.region || "";
  form.zone = row.zone || "z0";
  form.accessKey = row.accessKey || "";
  form.secretKey = row.secretKey || "";
  form.accessKeyId = row.accessKeyId || "";
  form.accessKeySecret = row.accessKeySecret || "";
  form.secretId = row.secretId || "";
  form.secretAccessKey = row.secretAccessKey || "";
  form.port = Number(row.port || 9000);
  form.useSSL = Boolean(row.useSSL);
};

const fetchStorageList = async (provider?: StorageProvider) => {
  loading.value = true;
  try {
    const targetProviders = provider
      ? [provider]
      : providerTabs.map(item => item.value);
    for (const item of targetProviders) {
      const res = await getResourceSystemStorageList({
        provider: item,
        currentPage: 1,
        pageSize: 999
      });
      if (res.code === 0 && res.data) {
        dataByProvider[item] = (res.data.list || []) as StorageRow[];
      }
    }
  } finally {
    loading.value = false;
  }
};

const openAddDialog = () => {
  resetForm();
  isEdit.value = false;
  dialogTitle.value = `新增${formProviderLabel.value}配置`;
  dialogVisible.value = true;
};

const openEditDialog = (row: StorageRow) => {
  fillFormByRow(row);
  isEdit.value = true;
  dialogTitle.value = "编辑存储配置";
  dialogVisible.value = true;
};

const validateForm = () => {
  if (!form.name.trim()) return "请输入配置名称";

  if (form.provider === "local") {
    if (!form.basePath.trim()) return "请输入路径前缀";
    return "";
  }
  if (form.provider === "qiniu") {
    if (!form.bucket.trim()) return "请输入 Bucket";
    if (!form.domain.trim()) return "请输入访问域名";
    if (!form.accessKey.trim()) return "请输入 AccessKey";
    if (!form.secretKey.trim()) return "请输入 SecretKey";
    return "";
  }
  if (form.provider === "aliyun") {
    if (!form.bucket.trim()) return "请输入 Bucket";
    if (!form.region.trim()) return "请输入 Region";
    if (!form.accessKeyId.trim()) return "请输入 AccessKeyId";
    if (!form.accessKeySecret.trim()) return "请输入 AccessKeySecret";
    return "";
  }
  if (form.provider === "tencent") {
    if (!form.bucket.trim()) return "请输入 Bucket";
    if (!form.region.trim()) return "请输入 Region";
    if (!form.secretId.trim()) return "请输入 SecretId";
    if (!form.secretKey.trim()) return "请输入 SecretKey";
    return "";
  }
  if (form.provider === "minio") {
    if (!form.endpoint.trim()) return "请输入 Endpoint";
    if (!form.bucket.trim()) return "请输入 Bucket";
    if (!form.accessKey.trim()) return "请输入 AccessKey";
    if (!form.secretKey.trim()) return "请输入 SecretKey";
    if (!form.basePath.trim()) return "请输入路径前缀";
    return "";
  }
  if (form.provider === "aws") {
    if (!form.bucket.trim()) return "请输入 Bucket";
    if (!form.region.trim()) return "请输入 Region";
    if (!form.accessKeyId.trim()) return "请输入 AccessKeyId";
    if (!form.secretAccessKey.trim()) return "请输入 SecretAccessKey";
    return "";
  }
  return "";
};

const getSubmitPayload = () => {
  const common = {
    id: form.id,
    provider: form.provider,
    name: form.name.trim(),
    remark: form.remark.trim()
  };

  if (form.provider === "local") {
    return {
      ...common,
      basePath: form.basePath.trim() || "resource-system"
    };
  }

  if (form.provider === "qiniu") {
    return {
      ...common,
      bucket: form.bucket.trim(),
      domain: form.domain.trim(),
      accessKey: form.accessKey.trim(),
      secretKey: form.secretKey.trim(),
      zone: form.zone.trim() || "z0",
      isEnabled: Boolean(form.isEnabled)
    };
  }

  if (form.provider === "aliyun") {
    return {
      ...common,
      bucket: form.bucket.trim(),
      region: form.region.trim(),
      endpoint: form.endpoint.trim(),
      domain: form.domain.trim(),
      accessKeyId: form.accessKeyId.trim(),
      accessKeySecret: form.accessKeySecret.trim(),
      isEnabled: Boolean(form.isEnabled)
    };
  }

  if (form.provider === "tencent") {
    return {
      ...common,
      bucket: form.bucket.trim(),
      region: form.region.trim(),
      domain: form.domain.trim(),
      secretId: form.secretId.trim(),
      secretKey: form.secretKey.trim(),
      isEnabled: Boolean(form.isEnabled)
    };
  }

  if (form.provider === "minio") {
    return {
      ...common,
      endpoint: form.endpoint.trim(),
      port: Number(form.port || 9000),
      useSSL: Boolean(form.useSSL),
      bucket: form.bucket.trim(),
      accessKey: form.accessKey.trim(),
      secretKey: form.secretKey.trim(),
      basePath: form.basePath.trim(),
      isEnabled: Boolean(form.isEnabled)
    };
  }

  return {
    ...common,
    bucket: form.bucket.trim(),
    region: form.region.trim(),
    endpoint: form.endpoint.trim(),
    domain: form.domain.trim(),
    accessKeyId: form.accessKeyId.trim(),
    secretAccessKey: form.secretAccessKey.trim(),
    isEnabled: Boolean(form.isEnabled)
  };
};

const onSubmit = async () => {
  const error = validateForm();
  if (error) {
    message(error, { type: "warning" });
    return;
  }

  submitLoading.value = true;
  try {
    const payload = getSubmitPayload();
    const res = isEdit.value
      ? await updateResourceSystemStorage(payload)
      : await createResourceSystemStorage(payload);
    if (res.code === 0) {
      message(isEdit.value ? "更新成功" : "新增成功", { type: "success" });
      dialogVisible.value = false;
      await fetchStorageList(form.provider);
    } else {
      message(res.message || "保存失败", { type: "error" });
    }
  } finally {
    submitLoading.value = false;
  }
};

const onDelete = async (row: StorageRow) => {
  const res = await deleteResourceSystemStorage({
    provider: row.provider,
    id: row.id
  });
  if (res.code === 0) {
    message("删除成功", { type: "success" });
    await fetchStorageList(row.provider);
  } else {
    message(res.message || "删除失败", { type: "error" });
  }
};

const onSwitchChange = async (row: StorageRow, val: boolean) => {
  if (row.provider === "local") return;
  const res = await updateResourceSystemStorage({
    ...row,
    provider: row.provider,
    id: row.id,
    isEnabled: val
  });
  if (res.code === 0) {
    message(val ? "已启用" : "已停用", { type: "success" });
  } else {
    message(res.message || "状态更新失败", { type: "error" });
  }
  await fetchStorageList(row.provider);
};

onMounted(() => {
  fetchStorageList();
});
</script>

<template>
  <div class="storage-page bg-bg_color p-4">
    <el-tabs v-model="activeTab">
      <el-tab-pane
        v-for="tab in providerTabs"
        :key="tab.value"
        :label="tab.label"
        :name="tab.value"
      />
    </el-tabs>

    <div class="storage-toolbar">
      <el-button type="primary" @click="openAddDialog">
        新增配置
      </el-button>
    </div>

    <div v-loading="loading" class="storage-grid">
      <div v-if="currentList.length === 0" class="storage-empty-wrap">
        <el-empty description="暂无配置" />
      </div>
      <div v-for="item in currentList" :key="item.id" class="storage-card">
        <div class="storage-card-header">
          <div class="storage-card-title">
            <el-tag size="small">{{ item.providerLabel }}</el-tag>
            <span>{{ item.name }}</span>
          </div>
          <div class="storage-card-switch">
            <el-switch
              v-if="item.provider !== 'local'"
              :model-value="Boolean(item.isEnabled)"
              @change="val => onSwitchChange(item, Boolean(val))"
            />
            <el-tag v-else type="success" size="small">默认启用</el-tag>
          </div>
        </div>

        <div class="storage-info-grid">
          <div v-if="item.provider !== 'local'" class="storage-info-item">
            <span class="label">Bucket</span>
            <span class="value">{{ item.bucket || "-" }}</span>
          </div>
          <div
            v-if="item.provider === 'qiniu' || item.provider === 'aliyun' || item.provider === 'tencent' || item.provider === 'aws'"
            class="storage-info-item"
          >
            <span class="label">访问域名</span>
            <span class="value">{{ item.domain || "-" }}</span>
          </div>
          <div
            v-if="item.provider === 'aliyun' || item.provider === 'tencent' || item.provider === 'aws'"
            class="storage-info-item"
          >
            <span class="label">Region</span>
            <span class="value">{{ item.region || "-" }}</span>
          </div>
          <div
            v-if="item.provider === 'aliyun' || item.provider === 'minio' || item.provider === 'aws'"
            class="storage-info-item"
          >
            <span class="label">Endpoint</span>
            <span class="value">{{ item.endpoint || "-" }}</span>
          </div>
          <div v-if="item.provider === 'qiniu'" class="storage-info-item">
            <span class="label">Zone</span>
            <span class="value">{{ item.zone || "-" }}</span>
          </div>
          <div
            v-if="item.provider === 'local' || item.provider === 'minio'"
            class="storage-info-item"
          >
            <span class="label">路径前缀</span>
            <span class="value">{{ item.basePath || "-" }}</span>
          </div>
          <div v-if="item.provider === 'minio'" class="storage-info-item">
            <span class="label">端口 / SSL</span>
            <span class="value">
              {{ Number(item.port || 9000) }} / {{ item.useSSL ? "开启" : "关闭" }}
            </span>
          </div>
          <div v-if="item.provider !== 'local'" class="storage-info-item">
            <span class="label">当日流量(MB)</span>
            <span class="value">
              {{ Number(item.dailyTrafficUsedMb || 0).toFixed(2) }}
            </span>
          </div>
          <div class="storage-info-item">
            <span class="label">当前大小(MB)</span>
            <span class="value">{{ Number(item.storageUsedMb || 0).toFixed(2) }}</span>
          </div>
        </div>

        <div class="storage-remark">{{ item.remark || "无备注" }}</div>

        <div class="storage-actions">
          <el-button link type="primary" @click="openEditDialog(item)">
            编辑
          </el-button>
          <el-popconfirm
            v-if="item.provider !== 'local' || currentList.length > 1"
            title="确定删除该配置吗？"
            @confirm="onDelete(item)"
          >
            <template #reference>
              <el-button link type="danger">删除</el-button>
            </template>
          </el-popconfirm>
          <el-button v-else link type="danger" disabled>删除</el-button>
        </div>
      </div>
    </div>

    <el-dialog
      v-model="dialogVisible"
      :title="dialogTitle"
      width="760px"
      destroy-on-close
    >
      <el-form label-width="130px">
        <el-form-item label="存储类型">
          <el-select v-model="form.provider" class="w-full" :disabled="isEdit">
            <el-option
              v-for="tab in providerTabs.filter(item => activeTab === 'local' ? item.value === 'local' : item.value !== 'local')"
              :key="tab.value"
              :label="tab.label"
              :value="tab.value"
            />
          </el-select>
        </el-form-item>

        <el-form-item label="配置名称" required>
          <el-input v-model="form.name" placeholder="请输入配置名称" />
        </el-form-item>

        <el-form-item v-if="form.provider === 'local'" label="路径前缀" required>
          <el-input v-model="form.basePath" placeholder="例如：resource-system" />
        </el-form-item>

        <template v-if="form.provider === 'qiniu'">
          <el-form-item label="Bucket" required>
            <el-input v-model="form.bucket" />
          </el-form-item>
          <el-form-item label="访问域名" required>
            <el-input v-model="form.domain" placeholder="例如：https://cdn.example.com" />
          </el-form-item>
          <el-form-item label="Zone">
            <el-select v-model="form.zone" class="w-full">
              <el-option label="华东(z0)" value="z0" />
              <el-option label="华北(z1)" value="z1" />
              <el-option label="华南(z2)" value="z2" />
              <el-option label="北美(na0)" value="na0" />
              <el-option label="东南亚(as0)" value="as0" />
            </el-select>
          </el-form-item>
          <el-form-item label="AccessKey" required>
            <el-input v-model="form.accessKey" />
          </el-form-item>
          <el-form-item label="SecretKey" required>
            <el-input v-model="form.secretKey" show-password />
          </el-form-item>
        </template>

        <template v-if="form.provider === 'aliyun'">
          <el-form-item label="Bucket" required>
            <el-input v-model="form.bucket" />
          </el-form-item>
          <el-form-item label="Region" required>
            <el-input v-model="form.region" placeholder="例如：oss-cn-hangzhou" />
          </el-form-item>
          <el-form-item label="Endpoint">
            <el-input v-model="form.endpoint" placeholder="例如：oss-cn-hangzhou.aliyuncs.com" />
          </el-form-item>
          <el-form-item label="访问域名">
            <el-input v-model="form.domain" placeholder="例如：https://cdn.example.com" />
          </el-form-item>
          <el-form-item label="AccessKeyId" required>
            <el-input v-model="form.accessKeyId" />
          </el-form-item>
          <el-form-item label="AccessKeySecret" required>
            <el-input v-model="form.accessKeySecret" show-password />
          </el-form-item>
        </template>

        <template v-if="form.provider === 'tencent'">
          <el-form-item label="Bucket" required>
            <el-input v-model="form.bucket" />
          </el-form-item>
          <el-form-item label="Region" required>
            <el-input v-model="form.region" placeholder="例如：ap-guangzhou" />
          </el-form-item>
          <el-form-item label="访问域名">
            <el-input v-model="form.domain" />
          </el-form-item>
          <el-form-item label="SecretId" required>
            <el-input v-model="form.secretId" />
          </el-form-item>
          <el-form-item label="SecretKey" required>
            <el-input v-model="form.secretKey" show-password />
          </el-form-item>
        </template>

        <template v-if="form.provider === 'minio'">
          <el-form-item label="Endpoint" required>
            <el-input v-model="form.endpoint" />
          </el-form-item>
          <el-form-item label="端口">
            <el-input-number v-model="form.port" :min="1" :max="65535" />
          </el-form-item>
          <el-form-item label="SSL">
            <el-switch v-model="form.useSSL" />
          </el-form-item>
          <el-form-item label="Bucket" required>
            <el-input v-model="form.bucket" />
          </el-form-item>
          <el-form-item label="路径前缀" required>
            <el-input v-model="form.basePath" />
          </el-form-item>
          <el-form-item label="AccessKey" required>
            <el-input v-model="form.accessKey" />
          </el-form-item>
          <el-form-item label="SecretKey" required>
            <el-input v-model="form.secretKey" show-password />
          </el-form-item>
        </template>

        <template v-if="form.provider === 'aws'">
          <el-form-item label="Bucket" required>
            <el-input v-model="form.bucket" />
          </el-form-item>
          <el-form-item label="Region" required>
            <el-input v-model="form.region" />
          </el-form-item>
          <el-form-item label="Endpoint">
            <el-input v-model="form.endpoint" />
          </el-form-item>
          <el-form-item label="访问域名">
            <el-input v-model="form.domain" />
          </el-form-item>
          <el-form-item label="AccessKeyId" required>
            <el-input v-model="form.accessKeyId" />
          </el-form-item>
          <el-form-item label="SecretAccessKey" required>
            <el-input v-model="form.secretAccessKey" show-password />
          </el-form-item>
        </template>

        <el-form-item v-if="form.provider !== 'local'" label="是否启用">
          <el-switch v-model="form.isEnabled" />
        </el-form-item>

        <el-form-item label="备注">
          <el-input v-model="form.remark" type="textarea" :rows="2" />
        </el-form-item>
      </el-form>
      <template #footer>
        <el-button @click="dialogVisible = false">取消</el-button>
        <el-button type="primary" :loading="submitLoading" @click="onSubmit">
          保存
        </el-button>
      </template>
    </el-dialog>
  </div>
</template>

<style scoped lang="scss">
.storage-page {
  min-height: calc(100vh - 140px);
}

.storage-toolbar {
  margin-bottom: 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.storage-grid {
  display: grid;
  grid-template-columns: repeat(auto-fill, minmax(360px, 1fr));
  gap: 12px;
}

.storage-empty-wrap {
  grid-column: 1 / -1;
  min-height: 320px;
  display: flex;
  align-items: center;
  justify-content: center;
}

.storage-card {
  border-radius: 10px;
  border: 1px solid var(--el-border-color-light);
  background: var(--el-bg-color);
  padding: 12px;
}

.storage-card-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 10px;
}

.storage-card-title {
  display: inline-flex;
  align-items: center;
  gap: 8px;
  font-weight: 600;
  color: var(--el-text-color-primary);
}

.storage-info-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px 12px;
  padding: 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.storage-info-item {
  display: flex;
  flex-direction: column;
  gap: 2px;
}

.storage-info-item .label {
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.storage-info-item .value {
  color: var(--el-text-color-primary);
  font-size: 13px;
  line-height: 1.3;
  word-break: break-all;
}

.storage-remark {
  margin-top: 10px;
  color: var(--el-text-color-secondary);
  font-size: 12px;
}

.storage-actions {
  margin-top: 8px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 900px) {
  .storage-grid {
    grid-template-columns: 1fr;
  }

  .storage-info-grid {
    grid-template-columns: 1fr;
  }
}
</style>


