import dayjs from "dayjs";
import { message } from "@/utils/message";
import { getOnlineLogsList, offlineOnlineUser } from "@/api/system";
import { reactive, ref, onMounted, toRaw } from "vue";
import type { PaginationProps } from "@pureadmin/table";
import { transformI18n, $t } from "@/plugins/i18n";

export function useRole() {
  const form = reactive({
    username: ""
  });
  const dataList = ref([]);
  const loading = ref(true);
  const pagination = reactive<PaginationProps>({
    total: 0,
    pageSize: 10,
    currentPage: 1,
    background: true
  });
  const columns: TableColumnList = [
    {
      label: transformI18n($t("monitor.index")),
      prop: "id",
      minWidth: 60
    },
    {
      label: transformI18n($t("monitor.username")),
      prop: "username",
      minWidth: 100
    },
    {
      label: transformI18n($t("monitor.loginIp")),
      prop: "ip",
      minWidth: 140
    },
    {
      label: transformI18n($t("monitor.loginLocation")),
      prop: "address",
      minWidth: 140
    },
    {
      label: transformI18n($t("monitor.os")),
      prop: "system",
      minWidth: 100
    },
    {
      label: transformI18n($t("monitor.browser")),
      prop: "browser",
      minWidth: 100
    },
    {
      label: transformI18n($t("monitor.loginTime")),
      prop: "loginTime",
      minWidth: 180,
      formatter: ({ loginTime }) => dayjs(loginTime).format("YYYY-MM-DD HH:mm:ss")
    },
    {
      label: transformI18n($t("monitor.action")),
      fixed: "right",
      slot: "operation"
    }
  ];

  function handleSizeChange(val: number) {
    console.log(`${val} items per page`);
  }

  function handleCurrentChange(val: number) {
    console.log(`current page: ${val}`);
  }

  function handleSelectionChange(val) {
    console.log("handleSelectionChange", val);
  }

  async function handleOffline(row) {
    try {
      await offlineOnlineUser({ id: row.id });
      message(`${row.username} ${transformI18n($t("monitor.forceOfflineSuccess"))}`, { type: "success" });
      onSearch();
    } catch {
      message(transformI18n($t("monitor.forceOfflineFailed")), { type: "error" });
    }
  }

  async function onSearch() {
    loading.value = true;
    try {
      const { code, data } = await getOnlineLogsList(toRaw(form));
      if (code === 0 && data) {
        dataList.value = data.list || [];
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
    pagination,
    onSearch,
    resetForm,
    handleOffline,
    handleSizeChange,
    handleCurrentChange,
    handleSelectionChange
  };
}
