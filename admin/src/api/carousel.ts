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

export const getCarouselCategoryList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/carousel/category/list", { data });
};

export const createCarouselCategory = (data?: object) => {
  return http.request<Result>("post", "/api/carousel/category/create", { data });
};

export const updateCarouselCategory = (data?: object) => {
  return http.request<Result>("post", "/api/carousel/category/update", { data });
};

export const deleteCarouselCategory = (data?: object) => {
  return http.request<Result>("post", "/api/carousel/category/delete", { data });
};

export const getCarouselResourceList = (data?: object) => {
  return http.request<ResultTable>("post", "/api/carousel/resource/list", { data });
};

export const createCarouselResource = (data?: object) => {
  return http.request<Result>("post", "/api/carousel/resource/create", { data });
};

export const updateCarouselResource = (data?: object) => {
  return http.request<Result>("post", "/api/carousel/resource/update", { data });
};

export const deleteCarouselResource = (data?: object) => {
  return http.request<Result>("post", "/api/carousel/resource/delete", { data });
};

export const uploadCarouselResourceImage = (file: Blob, contentType = "application/octet-stream") => {
  return http.request<Result>("post", "/api/carousel/resource/upload", {
    data: file,
    timeout: 120000,
    headers: {
      "Content-Type": contentType
    }
  });
};
