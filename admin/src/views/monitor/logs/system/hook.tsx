import dayjs from "dayjs";
import Detail from "./detail.vue";
import { message } from "@/utils/message";
import { addDialog } from "@/components/ReDialog";
import type { PaginationProps } from "@pureadmin/table";
import { type Ref, reactive, ref, onMounted, toRaw } from "vue";
import { getKeyList } from "@pureadmin/utils";
import {
  getSystemLogsList,
  getSystemLogsDetail,
  batchDeleteSystemLogs,
  clearSystemLogs
} from "@/api/system";
import { transformI18n, $t } from "@/plugins/i18n";

export function useRole(tableRef: Ref) {
  const form = reactive({
    keyword: "",
    requestTime: ""
  });
  const dataList = ref([]);
  const logCount = ref(0);
  const loading = ref(true);
  const selectedNum = ref(0);

  const pagination = reactive<PaginationProps>({
    total: 0,
    pageSize: 10,
    currentPage: 1,
    background: true
  });

  const columns: TableColumnList = [
    { label: transformI18n($t("monitor.selection")), type: "selection", fixed: "left", reserveSelection: true },
    {
      label: transformI18n($t("monitor.time")),
      prop: "requestTime",
      minWidth: 180,
      formatter: ({ requestTime }) => dayjs(requestTime).format("YYYY-MM-DD HH:mm:ss")
    },
    {
      label: transformI18n($t("monitor.description")),
      prop: "message",
      minWidth: 360,
      formatter: ({ source, message }) => `${source || transformI18n($t("monitor.system"))}: ${message || ""}`
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
      await batchDeleteSystemLogs({ ids });
      message(transformI18n($t("monitor.batchDeleteSuccess")), { type: "success" });
      tableRef.value.getTableRef().clearSelection();
      onSearch();
    } catch {
      message(transformI18n($t("monitor.batchDeleteFailed")), { type: "error" });
    }
  }

  async function clearAll() {
    try {
      await clearSystemLogs();
      message(transformI18n($t("monitor.clearSuccess")), { type: "success" });
      tableRef.value.getTableRef().clearSelection();
      onSearch();
    } catch {
      message(transformI18n($t("monitor.clearFailed")), { type: "error" });
    }
  }

  function onDetail(row) {
    getSystemLogsDetail({ id: row.id }).then(res => {
      if (res.code !== 0 || !res.data) {
        message(res.message || transformI18n($t("monitor.fetchSystemDetailFailed")), { type: "error" });
        return;
      }
      addDialog({
        title: transformI18n($t("monitor.systemLogDetail")),
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
      const { code, data } = await getSystemLogsList(toRaw(form));
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
      }, 300);
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

