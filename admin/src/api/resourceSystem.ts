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

export const getResourceSystemCategoryList = (data?: object) => {
  return http.request<ResultTable>(
    "post",
    "/api/resource-system/category/list",
    { data }
  );
};

export const getResourceSystemEnabledStorageList = (data?: object) => {
  return http.request<Result>(
    "post",
    "/api/resource-system/storage/enabled/list",
    { data }
  );
};

export const getResourceSystemStorageList = (data?: object) => {
  return http.request<ResultTable>(
    "post",
    "/api/resource-system/storage/list",
    { data }
  );
};

export const createResourceSystemStorage = (data?: object) => {
  return http.request<Result>("post", "/api/resource-system/storage/create", {
    data
  });
};

export const updateResourceSystemStorage = (data?: object) => {
  return http.request<Result>("post", "/api/resource-system/storage/update", {
    data
  });
};

export const deleteResourceSystemStorage = (data?: object) => {
  return http.request<Result>("post", "/api/resource-system/storage/delete", {
    data
  });
};

export const createResourceSystemCategory = (data?: object) => {
  return http.request<Result>("post", "/api/resource-system/category/create", {
    data
  });
};

export const updateResourceSystemCategory = (data?: object) => {
  return http.request<Result>("post", "/api/resource-system/category/update", {
    data
  });
};

export const deleteResourceSystemCategory = (data?: object) => {
  return http.request<Result>("post", "/api/resource-system/category/delete", {
    data
  });
};

export const getResourceSystemResourceList = (data?: object) => {
  return http.request<ResultTable>(
    "post",
    "/api/resource-system/resource/list",
    { data }
  );
};

export const createResourceSystemResource = (data?: object) => {
  return http.request<Result>("post", "/api/resource-system/resource/create", {
    data
  });
};

export const updateResourceSystemResource = (data?: object) => {
  return http.request<Result>("post", "/api/resource-system/resource/update", {
    data
  });
};

export const deleteResourceSystemResource = (data?: object) => {
  return http.request<Result>("post", "/api/resource-system/resource/delete", {
    data
  });
};

export const uploadResourceSystemResourceImage = (
  file: Blob,
  contentType = "application/octet-stream",
  categoryId?: number
) => {
  return http.request<Result>("post", "/api/resource-system/resource/upload", {
    data: file,
    params: categoryId ? { categoryId } : undefined,
    timeout: 120000,
    headers: {
      "Content-Type": contentType
    }
  });
};
