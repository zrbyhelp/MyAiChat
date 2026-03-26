import Axios, {
  type AxiosInstance,
  type AxiosRequestConfig,
  type CustomParamsSerializer
} from "axios";
import type {
  PureHttpError,
  RequestMethods,
  PureHttpResponse,
  PureHttpRequestConfig
} from "./types.d";
import { stringify } from "qs";
import { message } from "@/utils/message";
import { $t, transformI18n } from "@/plugins/i18n";
import { getToken, formatToken } from "@/utils/auth";
import { useUserStoreHook } from "@/store/modules/user";

// 相关配置请参考: https://www.axios-js.com/zh-cn/docs/#axios-request-config-1
const defaultConfig: AxiosRequestConfig = {
  timeout: 10000,
  headers: {
    Accept: "application/json, text/plain, */*",
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest"
  },
  // 数组格式参数序列化: https://github.com/axios/axios/issues/5142
  paramsSerializer: {
    serialize: stringify as unknown as CustomParamsSerializer
  }
};

class PureHttp {
  constructor() {
    this.httpInterceptorsRequest();
    this.httpInterceptorsResponse();
  }

  /** `token`杩囨湡鍚庯紝鏆傚瓨寰呮墽琛岀殑璇锋眰 */
  private static requests = [];

  /** 闃叉閲嶅鍒锋柊`token` */
  private static isRefreshing = false;
  /** 闃叉401鏃堕噸澶嶈烦杞櫥褰曢〉 */
  private static isRedirectingToLogin = false;
  private static isRedirectingTo403 = false;

  private static redirectTo403() {
    if (PureHttp.isRedirectingTo403) return;
    PureHttp.isRedirectingTo403 = true;
    message("无权限访问", { type: "warning" });
    const targetPath = "/error/403";
    if (window.location.hash.startsWith("#/")) {
      const base = window.location.href.split("#")[0];
      window.location.replace(`${base}#${targetPath}`);
    } else {
      window.location.replace(targetPath);
    }
    setTimeout(() => {
      PureHttp.isRedirectingTo403 = false;
    }, 500);
  }

  /** 鍒濆鍖栭厤缃璞?*/
  private static initConfig: PureHttpRequestConfig = {};

  /** 淇濆瓨褰撳墠`Axios`瀹炰緥瀵硅薄 */
  private static axiosInstance: AxiosInstance = Axios.create(defaultConfig);

  /** 閲嶈繛鍘熷璇锋眰 */
  private static retryOriginalRequest(config: PureHttpRequestConfig) {
    return new Promise(resolve => {
      PureHttp.requests.push((token: string) => {
        config.headers["Authorization"] = formatToken(token);
        resolve(config);
      });
    });
  }

  /** 璇锋眰鎷︽埅 */
  private httpInterceptorsRequest(): void {
    PureHttp.axiosInstance.interceptors.request.use(
      async (config: PureHttpRequestConfig): Promise<any> => {
        // 浼樺厛鍒ゆ柇post/get绛夋柟娉曟槸鍚︿紶鍏ュ洖璋冿紝鍚﹀垯鎵ц鍒濆鍖栬缃瓑鍥炶皟
        if (typeof config.beforeRequestCallback === "function") {
          config.beforeRequestCallback(config);
          return config;
        }
        if (PureHttp.initConfig.beforeRequestCallback) {
          PureHttp.initConfig.beforeRequestCallback(config);
          return config;
        }
        /** 璇锋眰鐧藉悕鍗曪紝鏀剧疆涓€浜涗笉闇€瑕乣token`鐨勬帴鍙ｏ紙閫氳繃璁剧疆璇锋眰鐧藉悕鍗曪紝闃叉`token`杩囨湡鍚庡啀璇锋眰閫犳垚鐨勬寰幆闂锛?*/
        const whiteList = ["/refresh-token", "/login"];
        return whiteList.some(url => config.url.endsWith(url))
          ? config
          : new Promise(resolve => {
              const data = getToken();
              if (data) {
                const now = new Date().getTime();
                const expired = parseInt(data.expires) - now <= 0;
                if (expired) {
                  if (!PureHttp.isRefreshing) {
                    PureHttp.isRefreshing = true;
                    // token杩囨湡鍒锋柊
                    useUserStoreHook()
                      .handRefreshToken({ refreshToken: data.refreshToken })
                      .then(res => {
                        const token = res.data.accessToken;
                        config.headers["Authorization"] = formatToken(token);
                        PureHttp.requests.forEach(cb => cb(token));
                        PureHttp.requests = [];
                      })
                      .catch(_err => {
                        PureHttp.requests = [];
                        useUserStoreHook().logOut();
                        message(transformI18n($t("login.pureLoginExpired")), {
                          type: "warning"
                        });
                      })
                      .finally(() => {
                        PureHttp.isRefreshing = false;
                      });
                  }
                  resolve(PureHttp.retryOriginalRequest(config));
                } else {
                  config.headers["Authorization"] = formatToken(
                    data.accessToken
                  );
                  resolve(config);
                }
              } else {
                resolve(config);
              }
            });
      },
      error => {
        return Promise.reject(error);
      }
    );
  }

  /** 鍝嶅簲鎷︽埅 */
  private httpInterceptorsResponse(): void {
    const instance = PureHttp.axiosInstance;
    instance.interceptors.response.use(
      (response: PureHttpResponse) => {
        const $config = response.config;
        const body = response.data as any;
        const bizCode = body?.bizCode ?? body?.statusCode;
        if ((bizCode === 401 || body?.code === 401) && !PureHttp.isRedirectingToLogin) {
          PureHttp.isRedirectingToLogin = true;
          message(transformI18n($t("login.pureLoginExpired")), {
            type: "warning"
          });
          useUserStoreHook().logOut();
          setTimeout(() => {
            PureHttp.isRedirectingToLogin = false;
          }, 500);
        }
        if (bizCode === 403 || body?.code === 403) {
          PureHttp.redirectTo403();
        }
        // 浼樺厛鍒ゆ柇post/get绛夋柟娉曟槸鍚︿紶鍏ュ洖璋冿紝鍚﹀垯鎵ц鍒濆鍖栬缃瓑鍥炶皟
        if (typeof $config.beforeResponseCallback === "function") {
          $config.beforeResponseCallback(response);
          return response.data;
        }
        if (PureHttp.initConfig.beforeResponseCallback) {
          PureHttp.initConfig.beforeResponseCallback(response);
          return response.data;
        }
        return response.data;
      },
      (error: PureHttpError) => {
        const $error = error;
        $error.isCancelRequest = Axios.isCancel($error);
        const status = $error.response?.status;
        const code = ($error.response?.data as any)?.code;
        const bizCode = ($error.response?.data as any)?.bizCode ?? ($error.response?.data as any)?.statusCode;
        if ((status === 401 || code === 401) && !PureHttp.isRedirectingToLogin) {
          PureHttp.isRedirectingToLogin = true;
          message(transformI18n($t("login.pureLoginExpired")), {
            type: "warning"
          });
          useUserStoreHook().logOut();
          setTimeout(() => {
            PureHttp.isRedirectingToLogin = false;
          }, 500);
        }
        if (status === 403 || code === 403 || bizCode === 403) {
          PureHttp.redirectTo403();
        }
        // 鎵€鏈夌殑鍝嶅簲寮傚父 鍖哄垎鏉ユ簮涓哄彇娑堣姹?闈炲彇娑堣姹?        return Promise.reject($error);
      }
    );
  }

  /** 閫氱敤璇锋眰宸ュ叿鍑芥暟 */
  public request<T>(
    method: RequestMethods,
    url: string,
    param?: AxiosRequestConfig,
    axiosConfig?: PureHttpRequestConfig
  ): Promise<T> {
    const config = {
      method,
      url,
      ...param,
      ...axiosConfig
    } as PureHttpRequestConfig;

    // 鍗曠嫭澶勭悊鑷畾涔夎姹?鍝嶅簲鍥炶皟
    return new Promise((resolve, reject) => {
      PureHttp.axiosInstance
        .request(config)
        .then((response: undefined) => {
          resolve(response);
        })
        .catch(error => {
          reject(error);
        });
    });
  }

  /** 鍗曠嫭鎶界鐨刞post`宸ュ叿鍑芥暟 */
  public post<T, P>(
    url: string,
    params?: AxiosRequestConfig<P>,
    config?: PureHttpRequestConfig
  ): Promise<T> {
    return this.request<T>("post", url, params, config);
  }

  /** 鍗曠嫭鎶界鐨刞get`宸ュ叿鍑芥暟 */
  public get<T, P>(
    url: string,
    params?: AxiosRequestConfig<P>,
    config?: PureHttpRequestConfig
  ): Promise<T> {
    return this.request<T>("get", url, params, config);
  }
}

export const http = new PureHttp();


