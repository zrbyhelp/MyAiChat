import dayjs from "dayjs";
import Detail from "./detail.vue";
import { message } from "@/utils/message";
import { addDialog } from "@/components/ReDialog";
import { getKeyList } from "@pureadmin/utils";
import {
  getOperationLogsList,
  getOperationLogsDetail,
  batchDeleteOperationLogs,
  clearOperationLogs
} from "@/api/system";
import { usePublicHooks } from "@/views/system/hooks";
import type { PaginationProps } from "@pureadmin/table";
import { type Ref, reactive, ref, onMounted, toRaw } from "vue";
import { transformI18n, $t } from "@/plugins/i18n";

export function useRole(tableRef: Ref) {
  const form = reactive({
    status: "",
    operatingTime: ""
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
    { label: transformI18n($t("monitor.operator")), prop: "username", minWidth: 100 },
    {
      label: transformI18n($t("monitor.operationTime")),
      prop: "operatingTime",
      minWidth: 180,
      formatter: ({ operatingTime }) => dayjs(operatingTime).format("YYYY-MM-DD HH:mm:ss")
    },
    { label: transformI18n($t("monitor.summary")), prop: "summary", minWidth: 260 },
    { label: transformI18n($t("monitor.operationIp")), prop: "ip", minWidth: 120 },
    {
      label: transformI18n($t("monitor.operationStatus")),
      prop: "status",
      minWidth: 100,
      cellRenderer: ({ row, props }) => (
        <el-tag size={props.size} style={tagStyle.value(row.status)}>
          {row.status === 1 ? transformI18n($t("monitor.success")) : transformI18n($t("monitor.failed"))}
        </el-tag>
      )
    },
    { label: transformI18n($t("monitor.action")), fixed: "right", slot: "operation" }
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
      await batchDeleteOperationLogs({ ids });
      message(transformI18n($t("monitor.batchDeleteSuccess")), { type: "success" });
      tableRef.value.getTableRef().clearSelection();
      onSearch();
    } catch {
      message(transformI18n($t("monitor.batchDeleteFailed")), { type: "error" });
    }
  }

  async function clearAll() {
    try {
      await clearOperationLogs();
      message(transformI18n($t("monitor.clearSuccess")), { type: "success" });
      tableRef.value.getTableRef().clearSelection();
      onSearch();
    } catch {
      message(transformI18n($t("monitor.clearFailed")), { type: "error" });
    }
  }

  function onDetail(row) {
    getOperationLogsDetail({ id: row.id }).then(res => {
      if (res.code !== 0 || !res.data) {
        message(res.message || transformI18n($t("monitor.fetchOperationDetailFailed")), { type: "error" });
        return;
      }
      addDialog({
        title: transformI18n($t("monitor.operationLogDetail")),
        width: "min(920px, 94vw)",
        draggable: true,
        fullscreen: false,
        closeOnClickModal: false,
        hideFooter: true,
        contentRenderer: () => Detail,
        props: {
          data: [res.data]
        }
      });
    });
  }

  async function onSearch() {
    loading.value = true;
    try {
      const { code, data } = await getOperationLogsList(toRaw(form));
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
    onDetail,
    clearAll,
    resetForm,
    onbatchDel,
    handleSizeChange,
    onSelectionCancel,
    handleCurrentChange,
    handleSelectionChange
  };
}

