<script setup lang="tsx">
import { ref } from "vue";
import ReCropper from "@/components/ReCropper";
import { formatBytes } from "@pureadmin/utils";

defineOptions({
  name: "ReCropperPreview"
});

const emit = defineEmits(["cropper", "readied"]);

const infos = ref();
const popoverRef = ref();
const refCropper = ref();
const cropperInstance = ref();
const showPopover = ref(false);
const cropperImg = ref<string>("");
const props = defineProps({
  imgSrc: String,
  defaultCircled: {
    type: Boolean,
    default: true
  },
  cropperOptions: {
    type: Object,
    default: () => ({})
  },
  outputType: {
    type: String,
    default: ""
  },
  outputQuality: {
    type: Number,
    default: 0.92
  },
  height: {
    type: [String, Number],
    default: "360px"
  },
  showPopoverPreview: {
    type: Boolean,
    default: true
  }
});

function onCropper({ base64, blob, info }) {
  infos.value = info;
  cropperImg.value = base64;
  emit("cropper", { base64, blob, info });
}

function hidePopover() {
  popoverRef.value?.hide?.();
}

function onReadied(instance) {
  cropperInstance.value = instance;
  showPopover.value = true;
  emit("readied", instance);
}

function refresh() {
  refCropper.value?.croppered?.();
}

function setCropData(data: { x?: number; y?: number; width?: number; height?: number }) {
  if (!cropperInstance.value) return;
  const current = cropperInstance.value.getData?.() || {};
  cropperInstance.value.setData?.({
    ...current,
    ...data
  });
  refresh();
}

function setAspectRatio(ratio: number) {
  if (!cropperInstance.value) return;
  cropperInstance.value.setAspectRatio?.(ratio);
  refresh();
}

defineExpose({ hidePopover, refresh, setCropData, setAspectRatio });
</script>

<template>
  <div v-loading="!showPopover" element-loading-background="transparent">
    <el-popover
      v-if="props.showPopoverPreview"
      ref="popoverRef"
      :visible="showPopover"
      placement="right"
      width="18vw"
    >
      <template #reference>
        <div class="w-[18vw]">
          <ReCropper
            ref="refCropper"
            :src="props.imgSrc"
            :circled="props.defaultCircled"
            :height="props.height"
            :options="props.cropperOptions"
            :outputType="props.outputType"
            :outputQuality="props.outputQuality"
            @cropper="onCropper"
            @readied="onReadied"
          />
          <p v-show="showPopover" class="mt-1 text-center">
            温馨提示：右键上方裁剪区可开启功能菜单
          </p>
        </div>
      </template>
      <div class="flex flex-wrap justify-center items-center text-center">
        <el-image
          v-if="cropperImg"
          :src="cropperImg"
          :preview-src-list="Array.of(cropperImg)"
          fit="cover"
        />
        <div v-if="infos" class="mt-1">
          <p>
            图像大小：{{ parseInt(infos.width) }} ×
            {{ parseInt(infos.height) }}像素
          </p>
          <p>
            文件大小：{{ formatBytes(infos.size) }}（{{ infos.size }} 字节）
          </p>
        </div>
      </div>
    </el-popover>
    <ReCropper
      v-else
      ref="refCropper"
      :src="props.imgSrc"
      :circled="props.defaultCircled"
      :height="props.height"
      :options="props.cropperOptions"
      :outputType="props.outputType"
      :outputQuality="props.outputQuality"
      @cropper="onCropper"
      @readied="onReadied"
    />
  </div>
</template>
