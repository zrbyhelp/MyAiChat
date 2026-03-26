import "./reset.css";
import dayjs from "dayjs";
import roleForm from "../form/role.vue";
import editForm from "../form/index.vue";
import { zxcvbn } from "@zxcvbn-ts/core";
import { handleTree } from "@/utils/tree";
import { message } from "@/utils/message";
import userAvatar from "@/assets/user.jpg";
import { usePublicHooks } from "../../hooks";
import { addDialog } from "@/components/ReDialog";
import type { PaginationProps } from "@pureadmin/table";
import ReCropperPreview from "@/components/ReCropperPreview";
import type { FormItemProps, RoleFormItemProps } from "../utils/types";
import { getKeyList, isAllEmpty, hideTextAtIndex, deviceDetection } from "@pureadmin/utils";
import {
  getRoleIds,
  getDeptList,
  getUserList,
  getAllRoleList,
  createUser,
  updateUser,
  deleteUser,
  batchDeleteUser,
  updateUserStatus,
  resetUserPassword,
  saveUserRoles
} from "@/api/system";
import { ElForm, ElInput, ElFormItem, ElProgress, ElMessageBox } from "element-plus";
import { type Ref, h, ref, toRaw, watch, computed, reactive, onMounted } from "vue";

export function useUser(tableRef: Ref, treeRef: Ref) {
  const form = reactive({
    deptId: "",
    username: "",
    phone: "",
    status: ""
  });

  const formRef = ref();
  const ruleFormRef = ref();
  const dataList = ref([]);
  const loading = ref(true);
  const avatarInfo = ref();
  const switchLoadMap = ref({});
  const { switchStyle } = usePublicHooks();
  const higherDeptOptions = ref();
  const treeData = ref([]);
  const treeLoading = ref(true);
  const selectedNum = ref(0);
  const pagination = reactive<PaginationProps>({
    total: 0,
    pageSize: 10,
    currentPage: 1,
    background: true
  });

  const columns: TableColumnList = [
    { label: "勾选列", type: "selection", fixed: "left", reserveSelection: true },
    { label: "用户编号", prop: "id", width: 90 },
    {
      label: "用户头像",
      prop: "avatar",
      cellRenderer: ({ row }) => (
        <el-image
          fit="cover"
          preview-teleported={true}
          src={row.avatar || userAvatar}
          preview-src-list={Array.of(row.avatar || userAvatar)}
          class="w-[24px] h-[24px] rounded-full align-middle"
        />
      ),
      width: 90
    },
    { label: "用户名称", prop: "username", minWidth: 130 },
    { label: "用户昵称", prop: "nickname", minWidth: 130 },
    {
      label: "性别",
      prop: "sex",
      minWidth: 90,
      cellRenderer: ({ row, props }) => (
        <el-tag size={props.size} type={row.sex === 1 ? "danger" : null} effect="plain">
          {row.sex === 1 ? "女" : "男"}
        </el-tag>
      )
    },
    { label: "部门", prop: "dept.name", minWidth: 90 },
    {
      label: "手机号码",
      prop: "phone",
      minWidth: 90,
      formatter: ({ phone }) => hideTextAtIndex(phone, { start: 3, end: 6 })
    },
    {
      label: "状态",
      prop: "status",
      minWidth: 90,
      cellRenderer: scope => (
        <el-switch
          size={scope.props.size === "small" ? "small" : "default"}
          loading={switchLoadMap.value[scope.index]?.loading}
          v-model={scope.row.status}
          active-value={1}
          inactive-value={0}
          active-text="已启用"
          inactive-text="已停用"
          inline-prompt
          style={switchStyle.value}
          onChange={() => onChange(scope as any)}
        />
      )
    },
    {
      label: "创建时间",
      minWidth: 90,
      prop: "createTime",
      formatter: ({ createTime }) => dayjs(createTime).format("YYYY-MM-DD HH:mm:ss")
    },
    { label: "操作", fixed: "right", width: 180, slot: "operation" }
  ];

  const buttonClass = computed(() => [
    "h-[20px]!",
    "reset-margin",
    "text-gray-500!",
    "dark:text-white!",
    "dark:hover:text-primary!"
  ]);

  const pwdForm = reactive({ newPwd: "" });
  const USER_PASSWORD_REGEXP =
    /^[\S]{6,18}$/;
  const pwdProgress = [
    { color: "#e74242", text: "非常弱" },
    { color: "#EFBD47", text: "弱" },
    { color: "#ffa500", text: "一般" },
    { color: "#1bbf1b", text: "强" },
    { color: "#008000", text: "非常强" }
  ];
  const curScore = ref();
  const roleOptions = ref([]);

  function onChange({ row, index }) {
    const nextStatus = row.status;
    const rollback = nextStatus === 1 ? 0 : 1;

    ElMessageBox.confirm(
      `确认要${nextStatus === 1 ? "启用" : "停用"}用户 ${row.username} 吗？`,
      "系统提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        draggable: true
      }
    )
      .then(async () => {
        switchLoadMap.value[index] = Object.assign({}, switchLoadMap.value[index], { loading: true });
        try {
          await updateUserStatus({ id: row.id, status: nextStatus });
          message("已成功修改用户状态", { type: "success" });
        } catch {
          row.status = rollback;
          message("修改用户状态失败", { type: "error" });
        } finally {
          switchLoadMap.value[index] = Object.assign({}, switchLoadMap.value[index], { loading: false });
        }
      })
      .catch(() => {
        row.status = rollback;
      });
  }

  function handleUpdate(row) {
    console.log(row);
  }

  async function handleDelete(row) {
    try {
      await deleteUser({ id: row.id });
      message(`您删除了用户编号为 ${row.id} 的这条数据`, { type: "success" });
      onSearch();
    } catch {
      message("删除失败", { type: "error" });
    }
  }

  function handleSizeChange(_val: number) {}
  function handleCurrentChange(_val: number) {}

  function handleSelectionChange(val) {
    selectedNum.value = val.length;
    tableRef.value.setAdaptive();
  }

  function onSelectionCancel() {
    selectedNum.value = 0;
    tableRef.value.getTableRef().clearSelection();
  }

  async function onbatchDel() {
    const curSelected = tableRef.value.getTableRef().getSelectionRows();
    const ids = getKeyList(curSelected, "id");
    if (!ids?.length) return;

    try {
      await batchDeleteUser({ ids });
      message(`已删除用户编号为 ${ids} 的数据`, { type: "success" });
      tableRef.value.getTableRef().clearSelection();
      onSearch();
    } catch {
      message("批量删除失败", { type: "error" });
    }
  }

  async function onSearch() {
    loading.value = true;
    try {
      const { code, data } = await getUserList(toRaw(form));
      if (code === 0) {
        dataList.value = data.list;
        pagination.total = data.total;
        pagination.pageSize = data.pageSize;
        pagination.currentPage = data.currentPage;
      }
    } finally {
      loading.value = false;
    }
  }

  const resetForm = formEl => {
    if (!formEl) return;
    formEl.resetFields();
    form.deptId = "";
    treeRef.value.onTreeReset();
    onSearch();
  };

  function onTreeSelect({ id, selected }) {
    form.deptId = selected ? id : "";
    onSearch();
  }

  function formatHigherDeptOptions(treeList) {
    if (!treeList || !treeList.length) return [];
    const newTreeList = [];
    for (let i = 0; i < treeList.length; i++) {
      treeList[i].disabled = treeList[i].status === 0;
      treeList[i].children = formatHigherDeptOptions(treeList[i].children);
      newTreeList.push(treeList[i]);
    }
    return newTreeList;
  }

  function openDialog(title = "新增", row?: FormItemProps) {
    addDialog({
      title: `${title}用户`,
      props: {
        formInline: {
          id: row?.id,
          title,
          higherDeptOptions: formatHigherDeptOptions(higherDeptOptions.value),
          parentId: row?.dept?.id ?? 0,
          nickname: row?.nickname ?? "",
          username: row?.username ?? "",
          password: row?.password ?? "",
          phone: row?.phone ?? "",
          email: row?.email ?? "",
          sex: row?.sex ?? "",
          status: row?.status ?? 1,
          remark: row?.remark ?? ""
        }
      },
      width: "46%",
      draggable: true,
      fullscreen: deviceDetection(),
      fullscreenIcon: true,
      closeOnClickModal: false,
      contentRenderer: () => h(editForm, { ref: formRef, formInline: null }),
      beforeSure: (done, { options }) => {
        const FormRef = formRef.value.getRef();
        const curData = options.props.formInline as FormItemProps;

        FormRef.validate(async valid => {
          if (!valid) return;

          const payload = {
            parentId: curData.parentId,
            nickname: curData.nickname,
            username: curData.username,
            password: curData.password,
            phone: String(curData.phone ?? ""),
            email: curData.email,
            sex: Number(curData.sex || 0),
            status: curData.status,
            remark: curData.remark,
            avatar: row?.avatar || ""
          };

          try {
            if (title === "新增") {
              await createUser(payload);
              message(`您新增了用户名称为 ${curData.username} 的这条数据`, { type: "success" });
            } else {
              await updateUser({ ...payload, id: row?.id ?? curData.id });
              message(`您修改了用户名称为 ${curData.username} 的这条数据`, { type: "success" });
            }
            done();
            onSearch();
          } catch {
            message("用户操作失败", { type: "error" });
          }
        });
      }
    });
  }

  const cropRef = ref();
  function handleUpload(row) {
    addDialog({
      title: "裁剪、上传头像",
      width: "40%",
      closeOnClickModal: false,
      fullscreen: deviceDetection(),
      contentRenderer: () =>
        h(ReCropperPreview, {
          ref: cropRef,
          imgSrc: row.avatar || userAvatar,
          onCropper: info => (avatarInfo.value = info)
        }),
      beforeSure: done => {
        console.log("裁剪后的图片信息：", avatarInfo.value);
        done();
        onSearch();
      },
      closeCallBack: () => cropRef.value.hidePopover()
    });
  }

  watch(pwdForm, ({ newPwd }) => (curScore.value = isAllEmpty(newPwd) ? -1 : zxcvbn(newPwd).score));

  function handleReset(row) {
    addDialog({
      title: `重置 ${row.username} 用户的密码`,
      width: "30%",
      draggable: true,
      closeOnClickModal: false,
      fullscreen: deviceDetection(),
      contentRenderer: () => (
        <>
          <ElForm ref={ruleFormRef} model={pwdForm}>
            <ElFormItem
              prop="newPwd"
              rules={[
                {
                  required: true,
                  message: "请输入新密码",
                  trigger: "blur"
                },
                {
                  validator: (_rule, value, callback) => {
                    if (!value) {
                      callback();
                    } else if (!USER_PASSWORD_REGEXP.test(value)) {
                      callback(new Error("密码长度应为6-18位"));
                    } else {
                      callback();
                    }
                  },
                  trigger: "blur"
                }
              ]}
            >
              <ElInput clearable show-password type="password" v-model={pwdForm.newPwd} placeholder="请输入新密码" />
            </ElFormItem>
          </ElForm>
          <div class="my-4 flex">
            {pwdProgress.map(({ color, text }, idx) => (
              <div class="w-[19vw]" style={{ marginLeft: idx !== 0 ? "4px" : 0 }}>
                <ElProgress
                  striped
                  striped-flow
                  duration={curScore.value === idx ? 6 : 0}
                  percentage={curScore.value >= idx ? 100 : 0}
                  color={color}
                  stroke-width={10}
                  show-text={false}
                />
                <p class="text-center" style={{ color: curScore.value === idx ? color : "" }}>
                  {text}
                </p>
              </div>
            ))}
          </div>
        </>
      ),
      closeCallBack: () => (pwdForm.newPwd = ""),
      beforeSure: done => {
        ruleFormRef.value.validate(async valid => {
          if (valid) {
            try {
              await resetUserPassword({ id: row.id, newPwd: pwdForm.newPwd });
              message(`已成功重置 ${row.username} 用户的密码`, { type: "success" });
              done();
              onSearch();
            } catch {
              message("重置密码失败", { type: "error" });
            }
          }
        });
      }
    });
  }

  async function handleRole(row) {
    const ids = (await getRoleIds({ userId: row.id })).data ?? [];
    addDialog({
      title: `分配 ${row.username} 用户的角色`,
      props: {
        formInline: {
          username: row?.username ?? "",
          nickname: row?.nickname ?? "",
          roleOptions: roleOptions.value ?? [],
          ids
        }
      },
      width: "400px",
      draggable: true,
      fullscreen: deviceDetection(),
      fullscreenIcon: true,
      closeOnClickModal: false,
      contentRenderer: () => h(roleForm),
      beforeSure: async (done, { options }) => {
        const curData = options.props.formInline as RoleFormItemProps;
        try {
          await saveUserRoles({ userId: row.id, roleIds: curData.ids });
          message("用户角色分配成功", { type: "success" });
          done();
        } catch {
          message("用户角色分配失败", { type: "error" });
        }
      }
    });
  }

  onMounted(async () => {
    treeLoading.value = true;
    await onSearch();

    const { code, data } = await getDeptList();
    if (code === 0) {
      higherDeptOptions.value = handleTree(data);
      treeData.value = handleTree(data);
    }

    treeLoading.value = false;
    roleOptions.value = (await getAllRoleList()).data ?? [];
  });

  return {
    form,
    loading,
    columns,
    dataList,
    treeData,
    treeLoading,
    selectedNum,
    pagination,
    buttonClass,
    deviceDetection,
    onSearch,
    resetForm,
    onbatchDel,
    openDialog,
    onTreeSelect,
    handleUpdate,
    handleDelete,
    handleUpload,
    handleReset,
    handleRole,
    handleSizeChange,
    onSelectionCancel,
    handleCurrentChange,
    handleSelectionChange
  };
}
