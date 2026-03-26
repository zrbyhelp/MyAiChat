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
    total: number;
    pageSize: number;
    currentPage: number;
  };
};

export const getSurveyList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/survey/list", { data });
};

export const createSurvey = (data?: object) => {
  return http.request<Result>("post", "/api/survey/create", { data });
};

export const updateSurvey = (data?: object) => {
  return http.request<Result>("post", "/api/survey/update", { data });
};

export const deleteSurvey = (data?: object) => {
  return http.request<Result>("post", "/api/survey/delete", { data });
};

export const getSurveyStats = (data?: object) => {
  return http.request<Result>("post", "/api/survey/stats", { data });
};

export const submitSurvey = (data?: object) => {
  return http.request<Result>("post", "/api/survey/submit", { data });
};

export const getSurveyStatsDetail = (data?: object) => {
  return http.request<Result>("post", "/api/survey/stats/detail", { data });
};

export const getSurveyTextAnswers = (data?: object) => {
  return http.request<ResultTable>("post", "/api/survey/stats/textAnswers", { data });
};

export const getSurveySubmissionsList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/survey/submissions/list", { data });
};

export const exportSurveySubmissionsPdf = (data?: object) => {
  return http.request<Result>("post", "/api/survey/submissions/exportPdf", { data });
};

export const exportSurveySubmissionsZip = (data?: object) => {
  return http.request<Result>("post", "/api/survey/submissions/exportZip", { data });
};

export const getWorkflowTemplateList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/survey/workflow/template/list", { data });
};

export const createWorkflowTemplate = (data?: object) => {
  return http.request<Result>("post", "/api/survey/workflow/template/create", { data });
};

export const updateWorkflowTemplate = (data?: object) => {
  return http.request<Result>("post", "/api/survey/workflow/template/update", { data });
};

export const deleteWorkflowTemplate = (data?: object) => {
  return http.request<Result>("post", "/api/survey/workflow/template/delete", { data });
};

export const getWorkflowInstanceList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/survey/workflow/instance/list", { data });
};

export const createWorkflowInstance = (data?: object) => {
  return http.request<Result>("post", "/api/survey/workflow/instance/create", { data });
};

export const getWorkflowInstanceDetail = (data?: object) => {
  return http.request<Result>("post", "/api/survey/workflow/instance/detail", { data });
};

export const actionWorkflowInstance = (data?: object) => {
  return http.request<Result>("post", "/api/survey/workflow/instance/action", { data });
};
