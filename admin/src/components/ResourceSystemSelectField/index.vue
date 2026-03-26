<script setup lang="ts">
import { computed, ref } from "vue";
import ResourceSystemPicker from "@/components/ResourceSystemPicker/index.vue";

type ImageFit = "fill" | "contain" | "cover" | "none" | "scale-down";

type ResourceSystemPickerItem = {
  id: number;
  image: string;
  fit: ImageFit;
};

const props = withDefaults(
  defineProps<{
    modelValue: string;
    resourceId?: number;
    fit?: ImageFit;
    allowVideo?: boolean;
  }>(),
  {
    modelValue: "",
    resourceId: 0,
    fit: "cover",
    allowVideo: true
  }
);

const emit = defineEmits<{
  (e: "update:modelValue", value: string): void;
  (e: "update:resourceId", value: number): void;
  (e: "update:fit", value: ImageFit): void;
  (e: "select", row: ResourceSystemPickerItem): void;
}>();

const pickerVisible = ref(false);

const isVideoUrl = (url: string) => {
  const clean = String(url || "").split("?")[0].toLowerCase();
  return /\.(mp4|webm|ogg|ogv|mov|avi|mkv|mpeg)$/.test(clean);
};

const resolveMediaType = (url: string) => (isVideoUrl(url) ? "video" : "image");

const previewUrl = computed(() => String(props.modelValue || "").trim());
const currentFit = computed(() => (props.fit || "cover") as ImageFit);

const openPicker = () => {
  pickerVisible.value = true;
};

const clearValue = () => {
  emit("update:modelValue", "");
  emit("update:resourceId", 0);
};

const onSelect = (row: ResourceSystemPickerItem) => {
  emit("update:modelValue", String(row?.image || ""));
  emit("update:resourceId", Number(row?.id || 0));
  emit("update:fit", (row?.fit || "cover") as ImageFit);
  emit("select", row);
};
</script>

<template>
  <div class="resource-select-field">
    <video
      v-if="previewUrl && resolveMediaType(previewUrl) === 'video'"
      :src="previewUrl"
      controls
      preload="metadata"
      class="thumb-video"
    />
    <el-image
      v-else-if="previewUrl"
      :src="previewUrl"
      :preview-src-list="Array.of(previewUrl)"
      :fit="currentFit"
      preview-teleported
      :z-index="4000"
      class="thumb-image"
    />
    <div v-else class="thumb-empty">未选择资源</div>

    <el-button plain @click="openPicker">
      {{ Number(resourceId || 0) > 0 ? "更换资源" : "选择资源" }}
    </el-button>
    <el-button
      v-if="Number(resourceId || 0) > 0"
      link
      type="danger"
      @click="clearValue"
    >
      清空
    </el-button>
    <span class="resource-id-text">
      {{ Number(resourceId || 0) > 0 ? `资源ID: ${Number(resourceId || 0)}` : "未选择资源" }}
    </span>

    <ResourceSystemPicker
      v-model="pickerVisible"
      :current-id="Number(resourceId || 0)"
      :allow-video="allowVideo"
      @select="onSelect"
    />
  </div>
</template>

<style scoped lang="scss">
.resource-select-field {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 12px;
}

.thumb-video,
.thumb-image {
  width: 120px;
  height: 72px;
  border-radius: 4px;
  object-fit: cover;
}

.thumb-empty {
  width: 120px;
  height: 72px;
  border: 1px solid var(--el-border-color-light);
  border-radius: 4px;
  background: var(--el-fill-color-lighter);
  color: var(--el-text-color-secondary);
  font-size: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.resource-id-text {
  font-size: 12px;
  color: var(--el-text-color-secondary);
}
</style>
