<script setup lang="ts">
import { computed, onMounted, reactive, ref } from "vue";
import { message } from "@/utils/message";
import { setConfig } from "@/config";
import { useGlobal } from "@pureadmin/utils";
import { getSystemBasicInfo, saveSystemBasicInfo } from "@/api/system";
import { updateRuntimeBrand } from "@/layout/hooks/useNav";
import ResourceSystemSelectField from "@/components/ResourceSystemSelectField/index.vue";

defineOptions({
  name: "SystemBasic"
});

type BasicInfoForm = {
  logo: string;
  longProjectName: string;
  shortProjectName: string;
  copyright: string;
};

const loading = ref(false);
const saving = ref(false);
const logoError = ref(false);
const logoResourceId = ref(0);
const snapshot = ref<BasicInfoForm | null>(null);
const { $config } = useGlobal<GlobalPropertiesApi>();

const form = reactive<BasicInfoForm>({
  logo: "/logo.svg",
  longProjectName: "",
  shortProjectName: "",
  copyright: ""
});

const previewLogo = computed(() => {
  if (logoError.value) return "/logo.svg";
  const value = String(form.logo || "").trim();
  return value || "/logo.svg";
});

const logoModel = computed({
  get: () => String(form.logo || ""),
  set: value => {
    form.logo = String(value || "");
    logoError.value = false;
  }
});

const applyData = (data: any) => {
  const legacyProjectName = String(data?.projectName ?? "").trim();
  form.logo = String(data?.logo ?? "/logo.svg").trim() || "/logo.svg";
  form.shortProjectName = String(data?.shortProjectName ?? "").trim() || legacyProjectName;
  form.longProjectName = String(data?.longProjectName ?? "").trim() || form.shortProjectName;
  form.copyright = String(data?.copyright ?? "").trim();
  logoError.value = false;
};

const loadData = async () => {
  loading.value = true;
  try {
    const res = await getSystemBasicInfo({});
    if (res.code === 0) {
      applyData(res.data || {});
      snapshot.value = { ...form };
      return;
    }
    message(res.message || "获取基本信息失败", { type: "error" });
  } finally {
    loading.value = false;
  }
};

const resetForm = () => {
  if (!snapshot.value) return;
  Object.assign(form, snapshot.value);
  logoResourceId.value = 0;
  logoError.value = false;
};

const validate = (): boolean => {
  const shortProjectName = String(form.shortProjectName || "").trim();
  const longProjectName = String(form.longProjectName || "").trim();
  const logo = String(form.logo || "").trim();
  const copyright = String(form.copyright || "").trim();

  if (!shortProjectName) {
    message("项目短名称不能为空", { type: "warning" });
    return false;
  }
  if (shortProjectName.length > 60) {
    message("项目短名称最多 60 个字符", { type: "warning" });
    return false;
  }
  if (!longProjectName) {
    message("项目长名称不能为空", { type: "warning" });
    return false;
  }
  if (longProjectName.length > 120) {
    message("项目长名称最多 120 个字符", { type: "warning" });
    return false;
  }
  if (logo.length > 500) {
    message("Logo 地址最多 500 个字符", { type: "warning" });
    return false;
  }
  if (copyright.length > 200) {
    message("版权声明最多 200 个字符", { type: "warning" });
    return false;
  }
  return true;
};

const onSave = async () => {
  if (!validate()) return;
  saving.value = true;
  try {
    const payload = {
      logo: String(form.logo || "").trim(),
      longProjectName: String(form.longProjectName || "").trim(),
      shortProjectName: String(form.shortProjectName || "").trim(),
      copyright: String(form.copyright || "").trim()
    };
    const res = await saveSystemBasicInfo(payload);
    if (res.code === 0) {
      const nextData = res.data || payload;
      applyData(nextData);
      snapshot.value = { ...form };

      const runtimePatch: PlatformConfigs = {
        Title: form.shortProjectName,
        ShortTitle: form.shortProjectName,
        LongTitle: form.longProjectName,
        Logo: form.logo,
        Copyright: form.copyright
      };
      setConfig(runtimePatch);
      Object.assign($config, runtimePatch);
      updateRuntimeBrand({
        shortTitle: form.shortProjectName,
        longTitle: form.longProjectName,
        logo: form.logo,
        copyright: form.copyright
      });

      message("保存成功", { type: "success" });
      return;
    }
    message(res.message || "保存失败", { type: "error" });
  } finally {
    saving.value = false;
  }
};

onMounted(() => {
  void loadData();
});
</script>

<template>
  <div class="main">
    <el-card v-loading="loading" shadow="never">
      <template #header>
        <div class="card-title">基本信息管理</div>
      </template>

      <el-form label-width="120px" class="max-w-[760px]">
        <el-form-item label="项目长名称">
          <el-input
            v-model="form.longProjectName"
            placeholder="登录页显示的项目名称"
            maxlength="120"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="项目短名称">
          <el-input
            v-model="form.shortProjectName"
            placeholder="系统内其他位置显示的名称"
            maxlength="60"
            show-word-limit
          />
        </el-form-item>
        <el-form-item label="Logo 地址">
          <ResourceSystemSelectField
            v-model="logoModel"
            v-model:resource-id="logoResourceId"
            :allow-video="false"
          />
        </el-form-item>
        <el-form-item label="版权声明">
          <el-input
            v-model="form.copyright"
            type="textarea"
            :rows="3"
            placeholder="请输入版权声明"
            maxlength="200"
            show-word-limit
          />
        </el-form-item>
      </el-form>

      <div class="action-row">
        <el-button type="primary" :loading="saving" @click="onSave">保存</el-button>
        <el-button @click="resetForm">重置</el-button>
      </div>

      <el-divider />

      <div class="preview">
        <div class="preview-logo-wrap">
          <img :src="previewLogo" alt="logo" class="preview-logo" @error="logoError = true" />
        </div>
        <div class="preview-text">
          <div class="preview-title">登录页：{{ form.longProjectName || "项目长名称预览" }}</div>
          <div class="preview-sub-title">系统内：{{ form.shortProjectName || "项目短名称预览" }}</div>
          <div class="preview-copyright">
            {{ form.copyright || "Copyright (c) 2020-present" }}
          </div>
        </div>
      </div>
    </el-card>

  </div>
</template>

<style scoped lang="scss">
.card-title {
  font-size: 16px;
  font-weight: 600;
}

.action-row {
  display: flex;
  gap: 12px;
}

.preview {
  display: flex;
  align-items: center;
  gap: 16px;
  min-height: 72px;
}

.preview-logo-wrap {
  width: 56px;
  height: 56px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid var(--el-border-color);
  border-radius: 10px;
  background: var(--el-fill-color-lighter);
}

.preview-logo {
  width: 38px;
  height: 38px;
  object-fit: contain;
}

.preview-text {
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.preview-title {
  font-size: 16px;
  font-weight: 600;
  line-height: 1.2;
}

.preview-sub-title {
  font-size: 14px;
  color: var(--el-text-color-primary);
}

.preview-copyright {
  font-size: 13px;
  color: var(--el-text-color-secondary);
}
</style>
