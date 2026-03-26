import { defineStore } from "pinia";
import {
  type userType,
  store,
  router,
  resetRouter,
  routerArrays,
  storageLocal
} from "../utils";
import {
  type UserResult,
  type RefreshTokenResult,
  getLogin,
  refreshTokenApi
} from "@/api/user";
import { useMultiTagsStoreHook } from "./multiTags";
import { type DataInfo, setToken, removeToken, userKey } from "@/utils/auth";

const parseHttpErrorMessage = (error: any) =>
  error?.response?.data?.message ||
  error?.response?.data?.mess ||
  error?.response?.data?.error ||
  error?.data?.message ||
  error?.data?.mess ||
  error?.data?.error ||
  error?.message ||
  (typeof error === "string" ? error : "请求失败");

export const useUserStore = defineStore("pure-user", {
  state: (): userType => ({
    // 澶村儚
    avatar: storageLocal().getItem<DataInfo<number>>(userKey)?.avatar ?? "",
    // 鐢ㄦ埛鍚?    username: storageLocal().getItem<DataInfo<number>>(userKey)?.username ?? "",
    // 鏄电О
    nickname: storageLocal().getItem<DataInfo<number>>(userKey)?.nickname ?? "",
    // 椤甸潰绾у埆鏉冮檺
    roles: storageLocal().getItem<DataInfo<number>>(userKey)?.roles ?? [],
    // 鎸夐挳绾у埆鏉冮檺
    permissions:
      storageLocal().getItem<DataInfo<number>>(userKey)?.permissions ?? [],
    // 鍓嶇鐢熸垚鐨勯獙璇佺爜锛堟寜瀹為檯闇€姹傛浛鎹級
    verifyCode: "",
    // 鍒ゆ柇鐧诲綍椤甸潰鏄剧ず鍝釜缁勪欢锛?锛氱櫥褰曪紙榛樿锛夈€?锛氭墜鏈虹櫥褰曘€?锛氫簩缁寸爜鐧诲綍銆?锛氭敞鍐屻€?锛氬繕璁板瘑鐮侊級
    currentPage: 0
    // 鏄惁鍕鹃€変簡鐧诲綍椤电殑鍏嶇櫥褰?    isRemembered: false,
    // 鐧诲綍椤电殑鍏嶇櫥褰曞瓨鍌ㄥ嚑澶╋紝榛樿7澶?    loginDay: 7
  }),
  actions: {
    /** 瀛樺偍澶村儚 */
    SET_AVATAR(avatar: string) {
      this.avatar = avatar;
    },
    /** 瀛樺偍鐢ㄦ埛鍚?*/
    SET_USERNAME(username: string) {
      this.username = username;
    },
    /** 瀛樺偍鏄电О */
    SET_NICKNAME(nickname: string) {
      this.nickname = nickname;
    },
    /** 瀛樺偍瑙掕壊 */
    SET_ROLES(roles: Array<string>) {
      this.roles = roles;
    },
    /** 瀛樺偍鎸夐挳绾у埆鏉冮檺 */
    SET_PERMS(permissions: Array<string>) {
      this.permissions = permissions;
    },
    /** 瀛樺偍鍓嶇鐢熸垚鐨勯獙璇佺爜 */
    SET_VERIFYCODE(verifyCode: string) {
      this.verifyCode = verifyCode;
    },
    /** 瀛樺偍鐧诲綍椤甸潰鏄剧ず鍝釜缁勪欢 */
    SET_CURRENTPAGE(value: number) {
      this.currentPage = value;
    },
    /** 瀛樺偍鏄惁鍕鹃€変簡鐧诲綍椤电殑鍏嶇櫥褰?*/
    SET_ISREMEMBERED(bool: boolean) {
      this.isRemembered = bool;
    },
    /** 璁剧疆鐧诲綍椤电殑鍏嶇櫥褰曞瓨鍌ㄥ嚑澶?*/
    SET_LOGINDAY(value: number) {
      this.loginDay = Number(value);
    },
    /** 鐧诲叆 */
    async loginByUsername(data) {
      return new Promise<UserResult>((resolve, reject) => {
        getLogin(data)
          .then(result => {
            if (!result || typeof (result as any).code === "undefined") {
              reject("登录响应异常");
              return;
            }

            if (result.code === 0) {
              setToken(result.data);
              resolve(result);
            } else {
              reject(result.message || (result as any).mess || "登录失败");
            }
          })
          .catch(error => {
            reject(parseHttpErrorMessage(error));
          });
      });
    },
    /** 鍓嶇鐧诲嚭锛堜笉璋冪敤鎺ュ彛锛?*/
    logOut() {
      this.username = "";
      this.roles = [];
      this.permissions = [];
      removeToken();
      useMultiTagsStoreHook().handleTags("equal", [...routerArrays]);
      resetRouter();
      router.push("/login");
    },
    /** 鍒锋柊`token` */
    async handRefreshToken(data) {
      return new Promise<RefreshTokenResult>((resolve, reject) => {
        refreshTokenApi(data)
          .then(result => {
            if (!result || typeof (result as any).code === "undefined") {
              reject("刷新登录态响应异常");
              return;
            }

            if (result.code === 0) {
              setToken(result.data);
              resolve(result);
            } else {
              reject(result.message || (result as any).mess || "登录失败");
            }
          })
          .catch(error => {
            reject(parseHttpErrorMessage(error));
          });
      });
    }
  }
});

export function useUserStoreHook() {
  return useUserStore(store);
}
