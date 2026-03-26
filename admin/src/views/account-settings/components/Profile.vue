<script setup lang="ts">
import { message } from "@/utils/message";
import { computed, onMounted, reactive, ref } from "vue";
import { type UserInfo, getMine, updateMine } from "@/api/user";
import type { FormInstance, FormRules } from "element-plus";
import ReCropperPreview from "@/components/ReCropperPreview";
import { deviceDetection, isEmail, storageLocal } from "@pureadmin/utils";
import { useUserStoreHook } from "@/store/modules/user";
import { userKey, type DataInfo } from "@/utils/auth";
import defaultAvatar from "@/assets/user.jpg";
import uploadLine from "~icons/ri/upload-line";

defineOptions({
  name: "Profile"
});

const imgSrc = ref("");
const cropperBlob = ref<Blob>();
const cropRef = ref();
const uploadRef = ref();
const isShow = ref(false);
const userInfoFormRef = ref<FormInstance>();
const userStore = useUserStoreHook();

const userInfos = reactive<UserInfo>({
  avatar: "",
  username: "",
  nickname: "",
  email: "",
  phone: "",
  description: ""
});

const rules = reactive<FormRules<UserInfo>>({
  nickname: [{ required: true, message: "昵称必填", trigger: "blur" }],
  email: [
    {
      validator: (_rule, value, callback) => {
        if (!value) {
          callback();
        } else if (!isEmail(value)) {
          callback(new Error("请输入正确的邮箱格式"));
        } else {
          callback();
        }
      },
      trigger: "blur"
    }
  ]
});

const resolveAvatarUrl = (value?: string) => {
  const avatar = (value || "").trim();
  if (!avatar) return defaultAvatar;
  if (/^(https?:)?\/\//i.test(avatar) || avatar.startsWith("data:") || avatar.startsWith("blob:")) return avatar;
  return avatar.startsWith("/") ? avatar : `/${avatar}`;
};

const profileAvatar = computed(() => resolveAvatarUrl(userInfos.avatar));

function syncGlobalUserInfo(payload: Partial<UserInfo>) {
  if (payload.avatar !== undefined) userStore.SET_AVATAR(payload.avatar);
  if (payload.username !== undefined) userStore.SET_USERNAME(payload.username);
  if (payload.nickname !== undefined) userStore.SET_NICKNAME(payload.nickname);

  const cache = storageLocal().getItem<DataInfo<number>>(userKey) ?? ({} as DataInfo<number>);
  storageLocal().setItem(userKey, {
    ...cache,
    avatar: payload.avatar ?? userStore.avatar,
    username: payload.username ?? userStore.username,
    nickname: payload.nickname ?? userStore.nickname
  });
}

function queryEmail(queryString, callback) {
  const emailList = [{ value: "@qq.com" }, { value: "@126.com" }, { value: "@163.com" }];
  const queryList = emailList.map(item => ({
    value: `${queryString.split("@")[0]}${item.value}`
  }));
  const results = queryString
    ? queryList.filter(item => item.value.toLowerCase().indexOf(queryString.toLowerCase()) === 0)
    : queryList;
  callback(results);
}

const onChange = uploadFile => {
  const reader = new FileReader();
  reader.onload = e => {
    imgSrc.value = e.target?.result as string;
    isShow.value = true;
  };
  reader.readAsDataURL(uploadFile.raw);
};

const handleClose = () => {
  cropRef.value?.hidePopover?.();
  uploadRef.value?.clearFiles?.();
  isShow.value = false;
};

const onCropper = ({ blob }) => {
  cropperBlob.value = blob;
};

const handleSubmitImage = async () => {
  if (!cropperBlob.value) {
    message("请先选择图片", { type: "warning" });
    return;
  }

  const reader = new FileReader();
  reader.onload = async e => {
    const avatar = (e.target?.result ?? "").toString();
    if (!avatar) {
      message("头像处理失败", { type: "error" });
      return;
    }

    try {
      const { code, message: msg, data } = await updateMine({ avatar });
      if (code === 0) {
        userInfos.avatar = data?.avatar ?? avatar;
        syncGlobalUserInfo(data ?? { avatar: userInfos.avatar, nickname: userInfos.nickname, username: userInfos.username });
        message("更新头像成功", { type: "success" });
        handleClose();
      } else {
        message(msg || "更新头像失败", { type: "error" });
      }
    } catch (error) {
      message(`提交异常 ${error}`, { type: "error" });
    }
  };
  reader.readAsDataURL(cropperBlob.value);
};

const onSubmit = async (formEl?: FormInstance) => {
  if (!formEl) return;
  await formEl.validate(async (valid, fields) => {
    if (valid) {
      try {
        const { code, message: msg, data } = await updateMine(userInfos);
        if (code === 0) {
          Object.assign(userInfos, data);
          syncGlobalUserInfo(data);
          message("更新信息成功", { type: "success" });
        } else {
          message(msg || "更新信息失败", { type: "error" });
        }
      } catch (error) {
        message(`提交异常 ${error}`, { type: "error" });
      }
    } else {
      console.log("error submit!", fields);
    }
  });
};

onMounted(async () => {
  const { code, data } = await getMine();
  if (code === 0) {
    Object.assign(userInfos, data);
    syncGlobalUserInfo(data);
  }
});
</script>

<template>
  <div :class="['min-w-[180px]', deviceDetection() ? 'max-w-[100%]' : 'max-w-[70%]']">
    <h3 class="my-8!">个人信息</h3>
    <el-form ref="userInfoFormRef" label-position="top" :rules="rules" :model="userInfos">
      <el-form-item label="头像">
        <el-avatar :size="80" :src="profileAvatar" />
        <el-upload
          ref="uploadRef"
          accept="image/*"
          action="#"
          :limit="1"
          :auto-upload="false"
          :show-file-list="false"
          :on-change="onChange"
        >
          <el-button plain class="ml-4!">
            <IconifyIconOffline :icon="uploadLine" />
            <span class="ml-2">更新头像</span>
          </el-button>
        </el-upload>
      </el-form-item>
      <el-form-item label="昵称" prop="nickname">
        <el-input v-model="userInfos.nickname" placeholder="请输入昵称" />
      </el-form-item>
      <el-form-item label="邮箱" prop="email">
        <el-autocomplete
          v-model="userInfos.email"
          :fetch-suggestions="queryEmail"
          :trigger-on-focus="false"
          placeholder="请输入邮箱"
          clearable
          class="w-full"
        />
      </el-form-item>
      <el-form-item label="联系电话">
        <el-input v-model="userInfos.phone" placeholder="请输入联系电话" clearable />
      </el-form-item>
      <el-form-item label="简介">
        <el-input
          v-model="userInfos.description"
          placeholder="请输入简介"
          type="textarea"
          :autosize="{ minRows: 6, maxRows: 8 }"
          maxlength="56"
          show-word-limit
        />
      </el-form-item>
      <el-button type="primary" @click="onSubmit(userInfoFormRef)">更新信息</el-button>
    </el-form>

    <el-dialog
      v-model="isShow"
      width="40%"
      title="编辑头像"
      destroy-on-close
      :closeOnClickModal="false"
      :before-close="handleClose"
      :fullscreen="deviceDetection()"
    >
      <ReCropperPreview ref="cropRef" :imgSrc="imgSrc" @cropper="onCropper" />
      <template #footer>
        <div class="dialog-footer">
          <el-button bg text @click="handleClose">取消</el-button>
          <el-button bg text type="primary" @click="handleSubmitImage">确定</el-button>
        </div>
      </template>
    </el-dialog>
  </div>
</template>
