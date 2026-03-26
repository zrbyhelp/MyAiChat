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

export const fwTemplateList = (data?: object) =>
  http.request<ResultTable>("post", "/api/form-workflow/template/list", { data });

export const fwTemplateSave = (data?: object) =>
  http.request<Result>("post", "/api/form-workflow/template/save", { data });

export const fwTemplateValidate = (data?: object) =>
  http.request<Result>("post", "/api/form-workflow/template/validate", { data });

export const fwTemplateRemove = (data?: object) =>
  http.request<Result>("post", "/api/form-workflow/template/remove", { data });

export const fwInstanceStart = (data?: object) =>
  http.request<Result>("post", "/api/form-workflow/instance/start", { data });

export const fwInstanceList = (data?: object) =>
  http.request<ResultTable>("post", "/api/form-workflow/instance/list", { data });

export const fwInstanceDetail = (data?: object) =>
  http.request<Result>("post", "/api/form-workflow/instance/detail", { data });

export const fwInstanceAction = (data?: object) =>
  http.request<Result>("post", "/api/form-workflow/instance/action", { data });
