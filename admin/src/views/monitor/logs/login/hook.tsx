import dayjs from "dayjs";
import { message } from "@/utils/message";
import { getKeyList } from "@pureadmin/utils";
import { getLoginLogsList, batchDeleteLoginLogs, clearLoginLogs } from "@/api/system";
import { usePublicHooks } from "@/views/system/hooks";
import type { PaginationProps } from "@pureadmin/table";
import { type Ref, reactive, ref, onMounted, toRaw } from "vue";
import { transformI18n, $t } from "@/plugins/i18n";

export function useRole(tableRef: Ref) {
  const form = reactive({
    username: "",
    status: "",
    loginTime: ""
  });
  const dataList = ref([]);
  const logCount = ref(0);
  const loading = ref(true);
  const selectedNum = ref(0);
  const { tagStyle } = usePublicHooks();

  const pagination = reactive<PaginationProps>({
    total: 0,
    pageSize: 10,
    currentPage: 1,
    background: true
  });

  const columns: TableColumnList = [
    { label: transformI18n($t("monitor.selection")), type: "selection", fixed: "left", reserveSelection: true },
    { label: transformI18n($t("monitor.index")), prop: "id", minWidth: 90 },
    { label: transformI18n($t("monitor.username")), prop: "username", minWidth: 100 },
    { label: transformI18n($t("monitor.loginIp")), prop: "ip", minWidth: 140 },
    { label: transformI18n($t("monitor.loginLocation")), prop: "address", minWidth: 140 },
    { label: transformI18n($t("monitor.os")), prop: "system", minWidth: 100 },
    { label: transformI18n($t("monitor.browser")), prop: "browser", minWidth: 100 },
    {
      label: transformI18n($t("monitor.loginStatus")),
      prop: "status",
      minWidth: 100,
      cellRenderer: ({ row, props }) => (
        <el-tag size={props.size} style={tagStyle.value(row.status)}>
          {row.status === 1 ? transformI18n($t("monitor.success")) : transformI18n($t("monitor.failed"))}
        </el-tag>
      )
    },
    { label: transformI18n($t("monitor.loginBehavior")), prop: "behavior", minWidth: 100 },
    {
      label: transformI18n($t("monitor.loginTime")),
      prop: "loginTime",
      minWidth: 180,
      formatter: ({ loginTime }) => dayjs(loginTime).format("YYYY-MM-DD HH:mm:ss")
    }
  ];

  function handleSizeChange(val: number) {
    console.log(`${val} items per page`);
  }

  function handleCurrentChange(val: number) {
    console.log(`current page: ${val}`);
  }

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
      await batchDeleteLoginLogs({ ids });
      message(transformI18n($t("monitor.batchDeleteSuccess")), { type: "success" });
      tableRef.value.getTableRef().clearSelection();
      onSearch();
    } catch {
      message(transformI18n($t("monitor.batchDeleteFailed")), { type: "error" });
    }
  }

  async function clearAll() {
    try {
      await clearLoginLogs();
      message(transformI18n($t("monitor.clearSuccess")), { type: "success" });
      tableRef.value.getTableRef().clearSelection();
      onSearch();
    } catch {
      message(transformI18n($t("monitor.clearFailed")), { type: "error" });
    }
  }

  async function onSearch() {
    loading.value = true;
    try {
      const { code, data } = await getLoginLogsList(toRaw(form));
      if (code === 0 && data) {
        dataList.value = data.list || [];
        logCount.value = Array.isArray(data.list) ? data.list.length : 0;
        pagination.total = data.total || 0;
        pagination.pageSize = data.pageSize || 10;
        pagination.currentPage = data.currentPage || 1;
      }
    } finally {
      setTimeout(() => {
        loading.value = false;
      }, 200);
    }
  }

  const resetForm = formEl => {
    if (!formEl) return;
    formEl.resetFields();
    onSearch();
  };

  onMounted(() => {
    onSearch();
  });

  return {
    form,
    loading,
    columns,
    dataList,
    logCount,
    pagination,
    selectedNum,
    onSearch,
    clearAll,
    resetForm,
    onbatchDel,
    handleSizeChange,
    onSelectionCancel,
    handleCurrentChange,
    handleSelectionChange
  };
}
