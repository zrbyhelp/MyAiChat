import dayjs from "dayjs";
import editForm from "../form.vue";
import { handleTree } from "@/utils/tree";
import { message } from "@/utils/message";
import { getDeptList, createDept, updateDept, deleteDept } from "@/api/system";
import { usePublicHooks } from "../../hooks";
import { addDialog } from "@/components/ReDialog";
import { reactive, ref, onMounted, h } from "vue";
import type { FormItemProps } from "../utils/types";
import { cloneDeep, isAllEmpty, deviceDetection } from "@pureadmin/utils";

export function useDept() {
  const form = reactive({
    name: "",
    status: null
  });

  const formRef = ref();
  const dataList = ref([]);
  const loading = ref(true);
  const { tagStyle } = usePublicHooks();

  const columns: TableColumnList = [
    { label: "部门名称", prop: "name", width: 180, align: "left" },
    { label: "排序", prop: "sort", minWidth: 70 },
    {
      label: "状态",
      prop: "status",
      minWidth: 100,
      cellRenderer: ({ row, props }) => (
        <el-tag size={props.size} style={tagStyle.value(row.status)}>
          {row.status === 1 ? "启用" : "停用"}
        </el-tag>
      )
    },
    {
      label: "创建时间",
      minWidth: 200,
      prop: "createTime",
      formatter: ({ createTime }) => dayjs(createTime).format("YYYY-MM-DD HH:mm:ss")
    },
    { label: "备注", prop: "remark", minWidth: 320 },
    { label: "操作", fixed: "right", width: 210, slot: "operation" }
  ];

  function handleSelectionChange(_val) {}

  function resetForm(formEl) {
    if (!formEl) return;
    formEl.resetFields();
    onSearch();
  }

  async function onSearch() {
    loading.value = true;
    try {
      const { code, data } = await getDeptList({ name: form.name, status: form.status });
      if (code === 0) {
        dataList.value = handleTree(Array.isArray(data) ? data : []);
      }
    } finally {
      setTimeout(() => {
        loading.value = false;
      }, 300);
    }
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
      title: `${title}部门`,
      props: {
        formInline: {
          id: row?.id,
          higherDeptOptions: formatHigherDeptOptions(cloneDeep(dataList.value)),
          parentId: row?.parentId ?? 0,
          name: row?.name ?? "",
          principal: row?.principal ?? "",
          phone: row?.phone ?? "",
          email: row?.email ?? "",
          sort: row?.sort ?? 0,
          status: row?.status ?? 1,
          remark: row?.remark ?? ""
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
            const payload = {
              parentId: curData.parentId,
              name: curData.name,
              principal: curData.principal,
              phone: String(curData.phone ?? ""),
              email: curData.email,
              sort: curData.sort,
              status: curData.status,
              remark: curData.remark
            };

            if (title === "修改") {
              await updateDept({ ...payload, id: row?.id ?? curData.id });
              message(`您修改了部门名称为 ${curData.name} 的这条数据`, { type: "success" });
            } else {
              await createDept(payload);
              message(`您新增了部门名称为 ${curData.name} 的这条数据`, { type: "success" });
            }

            done();
            onSearch();
          } catch {
            message("部门操作失败", { type: "error" });
          }
        });
      }
    });
  }

  async function handleDelete(row) {
    try {
      await deleteDept({ id: row.id });
      message(`您删除了部门名称为 ${row.name} 的这条数据`, { type: "success" });
      onSearch();
    } catch {
      message("删除失败", { type: "error" });
    }
  }

  onMounted(() => {
    onSearch();
  });

  return {
    form,
    loading,
    columns,
    dataList,
    onSearch,
    resetForm,
    openDialog,
    handleDelete,
    handleSelectionChange
  };
}
