import { http } from "@/utils/http";

type Result = {
  code: number;
  message: string;
  data?: any;
};

type ResultTable = {
  code: number;
  message: string;
  data?: {
    list: Array<any>;
    total?: number;
    pageSize?: number;
    currentPage?: number;
  };
};

export type LogType = "login" | "operation" | "system";

export type LogSizeNotifySetting = {
  logType: LogType;
  enabled: boolean;
  thresholdCount: number;
  userIds: number[];
};

export type AgentMonitorStatus = {
  enabled: boolean;
  startedAt: string;
  stoppedAt: string;
  targetUserId: string;
  targetUserLabel: string;
  targetSessionId: string;
  targetSessionTitle: string;
  stats: {
    userCount: number;
    sessionCount: number;
    replyCount: number;
    stepCount: number;
  };
};

export const getUserList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/user", { data });
};

export const createUser = (data?: object) => {
  return http.request<Result>("post", "/api/user/create", { data });
};

export const updateUser = (data?: object) => {
  return http.request<Result>("post", "/api/user/update", { data });
};

export const deleteUser = (data?: object) => {
  return http.request<Result>("post", "/api/user/delete", { data });
};

export const batchDeleteUser = (data?: object) => {
  return http.request<Result>("post", "/api/user/batch-delete", { data });
};

export const updateUserStatus = (data?: object) => {
  return http.request<Result>("post", "/api/user/status", { data });
};

export const resetUserPassword = (data?: object) => {
  return http.request<Result>("post", "/api/user/reset-password", { data });
};

export const getAllRoleList = () => {
  return http.request<Result>("get", "/api/user/list-all-role");
};

export const getRoleIds = (data?: object) => {
  return http.request<Result>("post", "/api/user/list-role-ids", { data });
};

export const saveUserRoles = (data?: object) => {
  return http.request<Result>("post", "/api/user/save-roles", { data });
};

export const getRoleList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/role", { data });
};

export const createRole = (data?: object) => {
  return http.request<Result>("post", "/api/role/create", { data });
};

export const updateRole = (data?: object) => {
  return http.request<Result>("post", "/api/role/update", { data });
};

export const deleteRole = (data?: object) => {
  return http.request<Result>("post", "/api/role/delete", { data });
};

export const updateRoleStatus = (data?: object) => {
  return http.request<Result>("post", "/api/role/status", { data });
};

export const getMenuList = (data?: object) => {
  return http.request<Result>("post", "/api/menu", { data });
};

export const createMenu = (data?: object) => {
  return http.request<Result>("post", "/api/menu/create", { data });
};

export const updateMenu = (data?: object) => {
  return http.request<Result>("post", "/api/menu/update", { data });
};

export const deleteMenu = (data?: object) => {
  return http.request<Result>("post", "/api/menu/delete", { data });
};

export const getDeptList = (data?: object) => {
  return http.request<Result>("post", "/api/dept", { data });
};

export const createDept = (data?: object) => {
  return http.request<Result>("post", "/api/dept/create", { data });
};

export const updateDept = (data?: object) => {
  return http.request<Result>("post", "/api/dept/update", { data });
};

export const deleteDept = (data?: object) => {
  return http.request<Result>("post", "/api/dept/delete", { data });
};

export const getSystemBasicInfo = (data?: object) => {
  return http.request<Result>("post", "/api/system/basic-info/get", { data });
};

export const saveSystemBasicInfo = (data?: object) => {
  return http.request<Result>("post", "/api/system/basic-info/save", { data });
};

export const getThirdPartyProviderList = (data?: object) => {
  return http.request<Result>("post", "/api/system/third-party/provider/list", { data });
};

export const getThirdPartyConfigList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/system/third-party/config/list", { data });
};

export const createThirdPartyConfig = (data?: object) => {
  return http.request<Result>("post", "/api/system/third-party/config/create", { data });
};

export const updateThirdPartyConfig = (data?: object) => {
  return http.request<Result>("post", "/api/system/third-party/config/update", { data });
};

export const deleteThirdPartyConfig = (data?: object) => {
  return http.request<Result>("post", "/api/system/third-party/config/delete", { data });
};

export const getOnlineLogsList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/monitor/online-logs", { data });
};

export const offlineOnlineUser = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/offline", { data });
};

export const getLoginLogsList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/monitor/login-logs", { data });
};

export const getOperationLogsList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/monitor/operation-logs", { data });
};

export const getOperationLogsDetail = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/operation-logs-detail", { data });
};

export const getSystemLogsList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/monitor/system-logs", { data });
};

export const getSystemLogsDetail = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/system-logs-detail", { data });
};

export const batchDeleteLoginLogs = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/login-logs/batch-delete", { data });
};

export const clearLoginLogs = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/login-logs/clear", { data });
};

export const batchDeleteOperationLogs = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/operation-logs/batch-delete", { data });
};

export const clearOperationLogs = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/operation-logs/clear", { data });
};

export const batchDeleteSystemLogs = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/system-logs/batch-delete", { data });
};

export const clearSystemLogs = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/system-logs/clear", { data });
};

export const getLogSizeNotifySetting = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/log-count-notify-setting/get", { data });
};

export const saveLogSizeNotifySetting = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/log-count-notify-setting/save", { data });
};

export const getLayNoticeList = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/lay-notice/list", { data });
};

export const readLayNotice = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/lay-notice/read", { data });
};

export const getAgentMonitorStatus = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/agent-monitor/status", { data });
};

export const startAgentMonitor = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/agent-monitor/start", { data });
};

export const stopAgentMonitor = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/agent-monitor/stop", { data });
};

export const clearAgentMonitor = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/agent-monitor/clear", { data });
};

export const getAgentMonitorUsers = (data?: object) => {
  return http.request<ResultTable>("post", "/api/monitor/agent-monitor/users", { data });
};

export const getAgentMonitorChatUsers = (data?: object) => {
  return http.request<ResultTable>("post", "/api/monitor/agent-monitor/chat-users", { data });
};

export const getAgentMonitorChatSessions = (data?: object) => {
  return http.request<ResultTable>("post", "/api/monitor/agent-monitor/chat-sessions", { data });
};

export const getAgentMonitorSessions = (data?: object) => {
  return http.request<ResultTable>("post", "/api/monitor/agent-monitor/sessions", { data });
};

export const getAgentMonitorReplies = (data?: object) => {
  return http.request<ResultTable>("post", "/api/monitor/agent-monitor/replies", { data });
};

export const getAgentMonitorReplyDetail = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/agent-monitor/reply-detail", { data });
};

export const getAgentMonitorStepDetail = (data?: object) => {
  return http.request<Result>("post", "/api/monitor/agent-monitor/step-detail", { data });
};

export const getRoleMenu = (data?: object) => {
  return http.request<Result>("post", "/api/role/menu", { data });
};

export const getRoleMenuIds = (data?: object) => {
  return http.request<Result>("post", "/api/role/menu-ids", { data });
};

export const saveRoleMenu = (data?: object) => {
  return http.request<Result>("post", "/api/role/menu-save", { data });
};
