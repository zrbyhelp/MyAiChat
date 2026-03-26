import { http } from "@/utils/http";

export type UserResult = {
  code: number;
  message: string;
  data: {
    avatar: string;
    username: string;
    nickname: string;
    roles: Array<string>;
    permissions: Array<string>;
    accessToken: string;
    refreshToken: string;
    expires: Date;
  };
};

export type RefreshTokenResult = {
  code: number;
  message: string;
  data: {
    accessToken: string;
    refreshToken: string;
    expires: Date;
  };
};

export type UserInfo = {
  avatar: string;
  username: string;
  nickname: string;
  email: string;
  phone: string;
  description: string;
};

export type UserInfoResult = {
  code: number;
  message: string;
  data: UserInfo;
};

export type Result = {
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

export const getLogin = (data?: object) => {
  return http.request<UserResult>("post", "/api/login", { data });
};

export const refreshTokenApi = (data?: object) => {
  return http.request<RefreshTokenResult>("post", "/api/refresh-token", { data });
};

export const getMine = (data?: object) => {
  return http.request<UserInfoResult>("get", "/api/account/mine", { data });
};

export const getMineLogs = (data?: object) => {
  return http.request<ResultTable>("get", "/api/account/mine-logs", { data });
};

export const updateMine = (data?: object) => {
  return http.request<Result>("post", "/api/account/mine/update", { data });
};
