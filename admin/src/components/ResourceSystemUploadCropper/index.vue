<script setup lang="ts">
import { computed, nextTick, reactive, ref, watch } from "vue";
import { formatBytes } from "@pureadmin/utils";
import { message } from "@/utils/message";
import ReCropperPreview from "@/components/ReCropperPreview";
import { uploadResourceSystemResourceImage } from "@/api/resourceSystem";

type StorageProvider =
  | "local"
  | "qiniu"
  | "aliyun"
  | "tencent"
  | "minio"
  | "aws";

type UploadResult = {
  imageUrl: string;
  mediaUrl: string;
  storageProvider: StorageProvider;
  storageConfigId: number;
  fileSize: number;
  storageObjectKey: string;
  fileName: string;
  contentType: string;
};

const props = withDefaults(
  defineProps<{
    categoryId?: number;
    accept?: string;
    allowVideo?: boolean;
    buttonText?: string;
    disabled?: boolean;
  }>(),
  {
    categoryId: 0,
    accept: "image/*,video/*,audio/*,text/*",
    allowVideo: true,
    buttonText: "上传资源",
    disabled: false
  }
);

const emit = defineEmits<{
  (e: "uploaded", payload: UploadResult): void;
  (e: "failed", msg: string): void;
}>();

const uploadRef = ref();
const uploading = ref(false);

const cropRef = ref();
const cropDialogVisible = ref(false);
const cropImageSrc = ref("");
const croppedBase64 = ref("");
const croppedBlob = ref<Blob | null>(null);
const uploadContentType = ref("application/octet-stream");
const cropUploadLoading = ref(false);
const uploadSourceName = ref("");
const cropperOptions = {
  aspectRatio: Number.NaN,
  autoCropArea: 1
};
const cropOutputQuality = ref(0.92);
const cropAspectRatioLocked = ref(false);
const cropAspectRatio = ref("16:9");
const cropData = reactive({
  x: 0,
  y: 0,
  width: 0,
  height: 0
});
const cropInfo = reactive({
  width: 0,
  height: 0,
  size: 0
});
const cropDataSyncing = ref(false);
const cropRatioOptions: Array<{ label: string; value: string }> = [
  { label: "1:1", value: "1:1" },
  { label: "4:3", value: "4:3" },
  { label: "16:9", value: "16:9" },
  { label: "9:16", value: "9:16" }
];

const isBusy = computed(() => uploading.value || cropUploadLoading.value);

const resetCropState = () => {
  cropImageSrc.value = "";
  croppedBase64.value = "";
  croppedBlob.value = null;
  uploadContentType.value = "application/octet-stream";
  cropOutputQuality.value = 0.92;
  cropAspectRatioLocked.value = false;
  cropAspectRatio.value = "16:9";
  cropData.x = 0;
  cropData.y = 0;
  cropData.width = 0;
  cropData.height = 0;
  cropInfo.width = 0;
  cropInfo.height = 0;
  cropInfo.size = 0;
};

const clearSelectedFile = () => {
  uploadRef.value?.clearFiles?.();
};

const normalizeCategoryId = () => {
  const value = Number(props.categoryId || 0);
  if (Number.isFinite(value) && value > 0) return value;
  return undefined;
};

const isSvgContentType = (contentType: string) =>
  String(contentType || "").toLowerCase().includes("image/svg+xml");

const inferContentType = (file: File) => {
  const ext = String(file.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  const type = String(file.type || "").toLowerCase();
  if (type) return type;
  if (!ext) return "application/octet-stream";
  if (["jpg", "jpeg"].includes(ext)) return "image/jpeg";
  if (ext === "png") return "image/png";
  if (ext === "webp") return "image/webp";
  if (ext === "gif") return "image/gif";
  if (ext === "bmp") return "image/bmp";
  if (ext === "svg") return "image/svg+xml";
  if (ext === "mp4") return "video/mp4";
  if (ext === "webm") return "video/webm";
  if (ext === "ogg") return "video/ogg";
  return "application/octet-stream";
};

const isRasterImage = (file: File, contentType: string) => {
  const lowerType = String(contentType || "").toLowerCase();
  if (lowerType.startsWith("image/") && !isSvgContentType(lowerType)) return true;
  const ext = String(file.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  return ["png", "jpg", "jpeg", "webp", "gif", "bmp"].includes(String(ext || ""));
};

const isVideo = (file: File, contentType: string) => {
  const lowerType = String(contentType || "").toLowerCase();
  if (lowerType.startsWith("video/")) return true;
  const ext = String(file.name || "")
    .split(".")
    .pop()
    ?.toLowerCase();
  return ["mp4", "webm", "ogg", "ogv", "mov", "avi", "mkv", "mpeg"].includes(String(ext || ""));
};

const emitUploaded = (resData: any) => {
  const payload: UploadResult = {
    imageUrl: String(resData?.imageUrl || ""),
    mediaUrl: String(resData?.mediaUrl || resData?.imageUrl || ""),
    storageProvider: String(resData?.storageProvider || "local") as StorageProvider,
    storageConfigId: Number(resData?.storageConfigId || 0),
    fileSize: Number(resData?.fileSize || 0),
    storageObjectKey: String(resData?.storageObjectKey || ""),
    fileName: String(uploadSourceName.value || ""),
    contentType: String(uploadContentType.value || "application/octet-stream")
  };
  emit("uploaded", payload);
};

const uploadFileToStorage = async (
  file: Blob,
  loadingRef: { value: boolean }
) => {
  loadingRef.value = true;
  try {
    const res = await uploadResourceSystemResourceImage(
      file,
      uploadContentType.value,
      normalizeCategoryId()
    );
    if (res.code === 0 && res.data?.imageUrl) {
      message("上传成功", { type: "success" });
      emitUploaded(res.data);
      return true;
    }
    const errorMsg = String(res.message || "上传资源失败");
    message(errorMsg, { type: "error" });
    emit("failed", errorMsg);
    return false;
  } finally {
    loadingRef.value = false;
  }
};

const onUploadChange = async uploadFile => {
  if (!uploadFile?.raw || props.disabled || isBusy.value) return;

  const rawFile = uploadFile.raw as File;
  uploadSourceName.value = String(rawFile.name || "");
  uploadContentType.value = inferContentType(rawFile);

  if (!props.allowVideo && isVideo(rawFile, uploadContentType.value)) {
    message("当前仅可上传图片资源", { type: "warning" });
    clearSelectedFile();
    return;
  }

  if (isRasterImage(rawFile, uploadContentType.value)) {
    resetCropState();
    const reader = new FileReader();
    reader.onload = e => {
      cropImageSrc.value = String(e.target?.result || "");
      cropDialogVisible.value = true;
    };
    reader.readAsDataURL(rawFile);
    clearSelectedFile();
    return;
  }

  await uploadFileToStorage(rawFile, uploading);
  clearSelectedFile();
};

const onCropperWithInfo = ({ base64, blob, info }) => {
  croppedBase64.value = base64 || "";
  croppedBlob.value = blob || null;
  if (!info) return;
  cropInfo.width = Number(info.width || 0);
  cropInfo.height = Number(info.height || 0);
  cropInfo.size = Number(info.size || 0);
  cropDataSyncing.value = true;
  cropData.x = Number(info.x || 0);
  cropData.y = Number(info.y || 0);
  cropData.width = Number(info.width || 0);
  cropData.height = Number(info.height || 0);
  nextTick(() => {
    cropDataSyncing.value = false;
  });
};

const applyCropRect = () => {
  if (cropDataSyncing.value) return;
  if (cropData.width <= 0 || cropData.height <= 0) return;
  cropRef.value?.setCropData?.({
    x: Number(cropData.x || 0),
    y: Number(cropData.y || 0),
    width: Number(cropData.width || 0),
    height: Number(cropData.height || 0)
  });
};

const onQualityChange = () => {
  cropRef.value?.refresh?.();
};

const parseAspectRatio = (value: string): number => {
  const [w, h] = String(value || "").split(":").map(Number);
  if (!Number.isFinite(w) || !Number.isFinite(h) || w <= 0 || h <= 0) return Number.NaN;
  return w / h;
};

const applyAspectRatio = () => {
  if (!cropRef.value?.setAspectRatio) return;
  if (!cropAspectRatioLocked.value) {
    cropRef.value.setAspectRatio(Number.NaN);
    return;
  }
  cropRef.value.setAspectRatio(parseAspectRatio(cropAspectRatio.value));
};

const onCropperReadied = () => {
  applyAspectRatio();
};

const setAspectRatioPreset = (value: string) => {
  if (cropAspectRatioLocked.value && cropAspectRatio.value === value) {
    cropAspectRatioLocked.value = false;
    applyAspectRatio();
    return;
  }
  cropAspectRatioLocked.value = true;
  cropAspectRatio.value = value;
  applyAspectRatio();
};

const closeCropDialogInternal = (force = false) => {
  if (!force && cropUploadLoading.value) return;
  cropRef.value?.hidePopover?.();
  cropDialogVisible.value = false;
  croppedBlob.value = null;
};

const closeCropDialog = () => {
  closeCropDialogInternal(false);
};

const onCropDialogBeforeClose = done => {
  if (cropUploadLoading.value) return;
  closeCropDialogInternal(false);
  done();
};

const confirmCrop = async () => {
  if (!croppedBlob.value) {
    message("请先裁剪图片", { type: "warning" });
    return;
  }
  const success = await uploadFileToStorage(croppedBlob.value, cropUploadLoading);
  if (success) closeCropDialogInternal(true);
};

watch(
  () => [cropData.x, cropData.y, cropData.width, cropData.height],
  () => {
    applyCropRect();
  }
);

defineExpose({
  clearFiles: clearSelectedFile
});
</script>

<template>
  <el-upload
    ref="uploadRef"
    action="#"
    :accept="accept"
    :limit="1"
    :auto-upload="false"
    :show-file-list="false"
    :disabled="disabled || isBusy"
    :on-change="onUploadChange"
  >
    <slot name="trigger" :loading="isBusy">
      <el-button plain :loading="isBusy" :disabled="disabled || isBusy">
        {{ buttonText }}
      </el-button>
    </slot>
  </el-upload>

  <el-dialog
    v-model="cropDialogVisible"
    width="700px"
    title="裁剪图片"
    destroy-on-close
    :close-on-click-modal="false"
    :before-close="onCropDialogBeforeClose"
  >
    <div class="crop-layout">
      <div class="crop-stage-panel">
        <ReCropperPreview
          ref="cropRef"
          :imgSrc="cropImageSrc"
          :defaultCircled="false"
          :cropperOptions="cropperOptions"
          :outputType="uploadContentType"
          :outputQuality="cropOutputQuality"
          :height="'54vh'"
          :showPopoverPreview="false"
          @cropper="onCropperWithInfo"
          @readied="onCropperReadied"
        />
      </div>

      <div class="crop-right-panel">
        <div class="crop-preview-panel">
          <el-image
            v-if="croppedBase64"
            :src="croppedBase64"
            :preview-src-list="Array.of(croppedBase64)"
            fit="contain"
            preview-teleported
            :z-index="4000"
            class="crop-preview-image"
          />
          <div v-if="cropInfo.width > 0 && cropInfo.height > 0" class="crop-meta">
            <div>{{ Math.round(cropInfo.width) }} x {{ Math.round(cropInfo.height) }} px</div>
            <div>{{ formatBytes(cropInfo.size) }}（{{ cropInfo.size }} 字节）</div>
          </div>
        </div>

        <div class="crop-control-panel">
          <div class="crop-grid">
            <div class="crop-field">
              <span class="crop-field-label">X</span>
              <el-input-number v-model="cropData.x" :step="1" :controls="false" />
            </div>
            <div class="crop-field">
              <span class="crop-field-label">Y</span>
              <el-input-number v-model="cropData.y" :step="1" :controls="false" />
            </div>
            <div class="crop-field">
              <span class="crop-field-label">W</span>
              <el-input-number v-model="cropData.width" :min="1" :step="1" :controls="false" />
            </div>
            <div class="crop-field">
              <span class="crop-field-label">H</span>
              <el-input-number v-model="cropData.height" :min="1" :step="1" :controls="false" />
            </div>
            <div class="crop-field crop-field-wide">
              <span class="crop-field-label">质量</span>
              <el-input-number
                v-model="cropOutputQuality"
                :min="0.1"
                :max="1"
                :step="0.05"
                :precision="2"
                :controls="false"
                @change="onQualityChange"
              />
            </div>
          </div>

          <div class="crop-ratio-row">
            <el-button
              v-for="item in cropRatioOptions"
              :key="item.value"
              class="crop-ratio-btn"
              :class="{ 'crop-ratio-btn-active': cropAspectRatioLocked && cropAspectRatio === item.value }"
              @click="setAspectRatioPreset(item.value)"
            >
              {{ item.label }}
            </el-button>
          </div>
        </div>
        <div class="crop-actions">
          <el-button :disabled="cropUploadLoading" @click="closeCropDialog">取消</el-button>
          <el-button type="primary" :loading="cropUploadLoading" @click="confirmCrop">确定</el-button>
        </div>
      </div>
    </div>
  </el-dialog>
</template>

<style scoped lang="scss">
.crop-layout {
  display: flex;
  gap: 12px;
  align-items: stretch;
  justify-content: center;
  min-height: 56vh;
}

.crop-stage-panel {
  width: 360px;
  flex: 0 0 360px;
  min-width: 0;
  padding: 8px;
  border-radius: 8px;
  background: var(--el-bg-color-page);
}

.crop-right-panel {
  width: 300px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.crop-preview-panel {
  padding: 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
}

.crop-preview-image {
  width: 100%;
  height: 190px;
  border-radius: 6px;
  background: var(--el-bg-color);
}

.crop-meta {
  margin-top: 8px;
  font-size: 12px;
  color: var(--el-text-color-secondary);
}

.crop-control-panel {
  padding: 10px;
  border-radius: 8px;
  background: var(--el-fill-color-light);
  display: flex;
  flex-direction: column;
}

.crop-grid {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 8px;
}

.crop-field {
  height: 36px;
  border-radius: 8px;
  background: var(--el-fill-color);
  display: flex;
  align-items: center;
  padding: 0 8px;
  gap: 8px;
}

.crop-field-label {
  min-width: 26px;
  font-size: 13px;
  color: var(--el-text-color-secondary);
}

.crop-field-wide {
  grid-column: 1 / span 2;
}

.crop-ratio-row {
  margin-top: 10px;
  display: flex;
  flex-wrap: nowrap;
  gap: 8px;
  align-items: center;
}

.crop-ratio-btn {
  flex: 1;
  min-width: 0;
  height: 34px;
  padding: 0 8px;
  border-radius: 8px;
  border: 1px solid transparent;
  background: var(--el-fill-color);
  color: var(--el-text-color-regular);
}

.crop-ratio-btn:hover {
  border-color: var(--el-border-color);
  color: var(--el-text-color-primary);
}

.crop-ratio-btn-active {
  background: var(--el-color-primary-light-9);
  border-color: var(--el-color-primary-light-5);
  color: var(--el-color-primary);
  font-weight: 600;
}

.crop-field :deep(.el-input-number) {
  width: 100%;
}

.crop-field :deep(.el-input__wrapper) {
  box-shadow: none !important;
  background: transparent !important;
  padding: 0 !important;
}

.crop-actions {
  margin-top: auto;
  padding-top: 4px;
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}

@media (max-width: 1100px) {
  .crop-layout {
    flex-direction: column;
    min-height: auto;
  }

  .crop-right-panel {
    width: 100%;
  }
}
</style>
