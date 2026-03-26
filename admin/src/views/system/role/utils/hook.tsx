import dayjs from "dayjs";
import editForm from "../form.vue";
import { handleTree } from "@/utils/tree";
import { message } from "@/utils/message";
import { ElMessageBox } from "element-plus";
import { usePublicHooks } from "../../hooks";
import { transformI18n } from "@/plugins/i18n";
import { addDialog } from "@/components/ReDialog";
import type { FormItemProps } from "../utils/types";
import type { PaginationProps } from "@pureadmin/table";
import { getKeyList, deviceDetection } from "@pureadmin/utils";
import {
  getRoleList,
  getRoleMenu,
  getRoleMenuIds,
  saveRoleMenu,
  createRole,
  updateRole,
  deleteRole,
  updateRoleStatus
} from "@/api/system";
import { type Ref, reactive, ref, onMounted, h, toRaw, watch } from "vue";

export function useRole(treeRef: Ref) {
  const form = reactive({
    name: "",
    code: "",
    status: ""
  });

  const curRow = ref();
  const formRef = ref();
  const dataList = ref([]);
  const treeIds = ref([]);
  const treeData = ref([]);
  const isShow = ref(false);
  const loading = ref(true);
  const isLinkage = ref(false);
  const treeSearchValue = ref();
  const switchLoadMap = ref({});
  const isExpandAll = ref(false);
  const isSelectAll = ref(false);
  const { switchStyle } = usePublicHooks();

  const treeProps = {
    value: "id",
    label: "title",
    children: "children"
  };

  const pagination = reactive<PaginationProps>({
    total: 0,
    pageSize: 10,
    currentPage: 1,
    background: true
  });

  const columns: TableColumnList = [
    { label: "角色编号", prop: "id" },
    { label: "角色名称", prop: "name" },
    { label: "角色标识", prop: "code" },
    {
      label: "状态",
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
      ),
      minWidth: 90
    },
    { label: "备注", prop: "remark", minWidth: 160 },
    {
      label: "创建时间",
      prop: "createTime",
      minWidth: 160,
      formatter: ({ createTime }) => dayjs(createTime).format("YYYY-MM-DD HH:mm:ss")
    },
    { label: "操作", fixed: "right", width: 210, slot: "operation" }
  ];

  async function onChange({ row, index }) {
    const nextStatus = row.status;
    const rollbackStatus = nextStatus === 1 ? 0 : 1;

    ElMessageBox.confirm(
      `确认要${nextStatus === 1 ? "启用" : "停用"}角色 ${row.name} 吗？`,
      "系统提示",
      {
        confirmButtonText: "确定",
        cancelButtonText: "取消",
        type: "warning",
        draggable: true
      }
    )
      .then(async () => {
        switchLoadMap.value[index] = Object.assign({}, switchLoadMap.value[index], {
          loading: true
        });
        try {
          await updateRoleStatus({ id: row.id, status: nextStatus });
          message(`已${nextStatus === 1 ? "启用" : "停用"}${row.name}`, { type: "success" });
        } catch {
          row.status = rollbackStatus;
          message("更新状态失败", { type: "error" });
        } finally {
          switchLoadMap.value[index] = Object.assign({}, switchLoadMap.value[index], {
            loading: false
          });
        }
      })
      .catch(() => {
        row.status = rollbackStatus;
      });
  }

  async function handleDelete(row) {
    try {
      await deleteRole({ id: row.id });
      message(`您删除了角色名称为 ${row.name} 的这条数据`, { type: "success" });
      onSearch();
    } catch {
      message("删除失败", { type: "error" });
    }
  }

  function handleSizeChange(_val: number) {}
  function handleCurrentChange(_val: number) {}
  function handleSelectionChange(_val) {}

  async function onSearch() {
    loading.value = true;
    try {
      const { code, data } = await getRoleList(toRaw(form));
      if (code === 0 && data) {
        dataList.value = data.list || [];
        pagination.total = data.total || 0;
        pagination.pageSize = data.pageSize || 10;
        pagination.currentPage = data.currentPage || 1;
      }
    } finally {
      loading.value = false;
    }
  }

  const resetForm = formEl => {
    if (!formEl) return;
    formEl.resetFields();
    onSearch();
  };

  function openDialog(title = "新增", row?: FormItemProps) {
    addDialog({
      title: `${title}角色`,
      props: {
        formInline: {
          id: row?.id,
          name: row?.name ?? "",
          code: row?.code ?? "",
          remark: row?.remark ?? "",
          status: row?.status ?? 1
        }
      },
      width: "40%",
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
          try {
            if (title === "修改") {
              await updateRole({ id: row?.id ?? curData.id, name: curData.name, code: curData.code, remark: curData.remark });
              message(`您修改了角色名称为 ${curData.name} 的这条数据`, { type: "success" });
            } else {
              await createRole({ name: curData.name, code: curData.code, remark: curData.remark });
              message(`您新增了角色名称为 ${curData.name} 的这条数据`, { type: "success" });
            }
            done();
            onSearch();
          } catch {
            message("角色操作失败", { type: "error" });
          }
        });
      }
    });
  }

  async function handleMenu(row?: any) {
    const { id } = row || {};
    if (id) {
      curRow.value = row;
      isShow.value = true;
      const { code, data } = await getRoleMenuIds({ id });
      if (code === 0) {
        treeRef.value.setCheckedKeys(data || []);
      }
    } else {
      curRow.value = null;
      isShow.value = false;
    }
  }

  function rowStyle({ row: { id } }) {
    return {
      cursor: "pointer",
      background: id === curRow.value?.id ? "var(--el-fill-color-light)" : ""
    };
  }

  async function handleSave() {
    if (!curRow.value?.id) return;
    const id = curRow.value.id;
    const name = curRow.value.name;
    const menuIds = treeRef.value.getCheckedKeys();
    try {
      await saveRoleMenu({ id, menuIds });
      message(`角色名称为 ${name} 的菜单权限修改成功`, { type: "success" });
    } catch {
      message("保存菜单权限失败", { type: "error" });
    }
  }

  const onQueryChanged = (query: string) => {
    treeRef.value?.filter(query);
  };

  const filterMethod = (query: string, node) => {
    return transformI18n(node.title)?.includes(query);
  };

  onMounted(async () => {
    await onSearch();
    const { code, data } = await getRoleMenu();
    if (code === 0) {
      treeIds.value = getKeyList(data, "id");
      treeData.value = handleTree(data);
    }
  });

  watch(isExpandAll, val => {
    val ? treeRef.value.setExpandedKeys(treeIds.value) : treeRef.value.setExpandedKeys([]);
  });

  watch(isSelectAll, val => {
    val ? treeRef.value.setCheckedKeys(treeIds.value) : treeRef.value.setCheckedKeys([]);
  });

  return {
    form,
    isShow,
    curRow,
    loading,
    columns,
    rowStyle,
    dataList,
    treeData,
    treeProps,
    isLinkage,
    pagination,
    isExpandAll,
    isSelectAll,
    treeSearchValue,
    onSearch,
    resetForm,
    openDialog,
    handleMenu,
    handleSave,
    handleDelete,
    filterMethod,
    transformI18n,
    onQueryChanged,
    handleSizeChange,
    handleCurrentChange,
    handleSelectionChange
  };
}
