import { storeToRefs } from "pinia";
import { getConfig } from "@/config";
import { useRouter } from "vue-router";
import { emitter } from "@/utils/mitt";
import Avatar from "@/assets/user.jpg";
import { getTopMenu } from "@/router/utils";
import { useFullscreen } from "@vueuse/core";
import type { routeMetaType } from "../types";
import { transformI18n } from "@/plugins/i18n";
import { router, remainingPaths } from "@/router";
import { computed, reactive, type CSSProperties } from "vue";
import { useAppStoreHook } from "@/store/modules/app";
import { useUserStoreHook } from "@/store/modules/user";
import { useGlobal, isAllEmpty } from "@pureadmin/utils";
import { useEpThemeStoreHook } from "@/store/modules/epTheme";
import { usePermissionStoreHook } from "@/store/modules/permission";
import ExitFullscreen from "~icons/ri/fullscreen-exit-fill";
import Fullscreen from "~icons/ri/fullscreen-fill";

const errorInfo =
  "The current routing configuration is incorrect, please check the configuration";

type BrandPayload = {
  shortTitle?: string;
  longTitle?: string;
  logo?: string;
  copyright?: string;
};

type RuntimeBrand = {
  shortTitle: string;
  longTitle: string;
  logo: string;
  copyright: string;
};

const runtimeBrand = reactive<RuntimeBrand>({
  shortTitle: "",
  longTitle: "",
  logo: "",
  copyright: ""
});

const normalizeLogo = (input: string) => String(input || "").trim();

const buildFallbackCopyright = (shortTitle: string) => {
  const safeTitle = String(shortTitle || "").trim();
  return safeTitle
    ? `Copyright (c) 2020-present ${safeTitle}`
    : "Copyright (c) 2020-present";
};

export const updateRuntimeBrand = (payload: BrandPayload) => {
  const defaultShort = String(getConfig().ShortTitle || getConfig().Title || "PureAdmin").trim();
  const incomingShort = String(payload.shortTitle ?? runtimeBrand.shortTitle).trim();
  const nextShortTitle = incomingShort || defaultShort;

  const defaultLong = String(getConfig().LongTitle || "").trim();
  const incomingLong = String(payload.longTitle ?? runtimeBrand.longTitle).trim();
  const nextLongTitle = incomingLong || defaultLong || nextShortTitle;

  const nextLogo = normalizeLogo(String(payload.logo ?? runtimeBrand.logo));
  const nextCopyright =
    String(payload.copyright ?? runtimeBrand.copyright).trim() ||
    buildFallbackCopyright(nextShortTitle);

  runtimeBrand.shortTitle = nextShortTitle;
  runtimeBrand.longTitle = nextLongTitle;
  runtimeBrand.logo = nextLogo;
  runtimeBrand.copyright = nextCopyright;
};

export function useNav() {
  const pureApp = useAppStoreHook();
  const routers = useRouter().options.routes;
  const { isFullscreen, toggle } = useFullscreen();
  const { wholeMenus } = storeToRefs(usePermissionStoreHook());
  const tooltipEffect = getConfig()?.TooltipEffect ?? "light";

  const { $storage, $config } = useGlobal<GlobalPropertiesApi>();
  if (!runtimeBrand.shortTitle && !runtimeBrand.longTitle && !runtimeBrand.logo && !runtimeBrand.copyright) {
    updateRuntimeBrand({
      shortTitle: String($config?.ShortTitle ?? $config?.Title ?? getConfig().ShortTitle ?? getConfig().Title ?? "").trim(),
      longTitle: String($config?.LongTitle ?? getConfig().LongTitle ?? "").trim(),
      logo: String($config?.Logo ?? getConfig().Logo ?? "").trim(),
      copyright: String($config?.Copyright ?? getConfig().Copyright ?? "").trim()
    });
  }

  const getDivStyle = computed((): CSSProperties => {
    return {
      width: "100%",
      display: "flex",
      alignItems: "center",
      justifyContent: "space-between",
      overflow: "hidden"
    };
  });

  const userAvatar = computed(() => {
    return isAllEmpty(useUserStoreHook()?.avatar)
      ? Avatar
      : useUserStoreHook()?.avatar;
  });

  const username = computed(() => {
    return isAllEmpty(useUserStoreHook()?.nickname)
      ? useUserStoreHook()?.username
      : useUserStoreHook()?.nickname;
  });

  const getDropdownItemStyle = computed(() => {
    return (locale, t) => {
      return {
        background: locale === t ? useEpThemeStoreHook().epThemeColor : "",
        color: locale === t ? "#f4f4f5" : "#000"
      };
    };
  });

  const getDropdownItemClass = computed(() => {
    return (locale, t) => {
      return locale === t ? "" : "dark:hover:text-primary!";
    };
  });

  const avatarsStyle = computed(() => {
    return username.value ? { marginRight: "10px" } : "";
  });

  const isCollapse = computed(() => {
    return !pureApp.getSidebarStatus;
  });

  const device = computed(() => {
    return pureApp.getDevice;
  });

  const layout = computed(() => {
    return $storage?.layout?.layout;
  });

  const title = computed(() => {
    return runtimeBrand.shortTitle || String($config?.ShortTitle ?? $config?.Title ?? getConfig().ShortTitle ?? getConfig().Title ?? "PureAdmin").trim();
  });

  const loginTitle = computed(() => {
    return runtimeBrand.longTitle || String($config?.LongTitle ?? getConfig().LongTitle ?? "").trim() || title.value;
  });

  const copyright = computed(() => {
    return runtimeBrand.copyright || buildFallbackCopyright(title.value);
  });

  function changeTitle(meta: routeMetaType) {
    const currentTitle = String(title.value || "").trim();
    if (currentTitle) document.title = `${transformI18n(meta.title)} | ${currentTitle}`;
    else document.title = transformI18n(meta.title);
  }

  function logout() {
    useUserStoreHook().logOut();
  }

  function backTopMenu() {
    router.push(getTopMenu()?.path);
  }

  function onPanel() {
    emitter.emit("openPanel");
  }

  function toAccountSettings() {
    router.push({ name: "AccountSettings" });
  }

  function toggleSideBar() {
    pureApp.toggleSideBar();
  }

  function handleResize(menuRef) {
    menuRef?.handleResize();
  }

  function resolvePath(route) {
    if (!route.children) return console.error(errorInfo);
    const httpReg = /^http(s?):\/\//;
    const routeChildPath = route.children[0]?.path;
    if (httpReg.test(routeChildPath)) {
      return route.path + "/" + routeChildPath;
    } else {
      return routeChildPath;
    }
  }

  function menuSelect(indexPath: string) {
    if (wholeMenus.value.length === 0 || isRemaining(indexPath)) return;
    emitter.emit("changLayoutRoute", indexPath);
  }

  function isRemaining(path: string) {
    return remainingPaths.includes(path);
  }

  function getLogo() {
    const logo = normalizeLogo(runtimeBrand.logo || String($config?.Logo ?? getConfig().Logo ?? ""));
    if (logo) {
      if (/^https?:\/\//i.test(logo) || /^data:/i.test(logo)) return logo;
      if (logo.startsWith("/")) return logo;
      return `/${logo.replace(/^\/+/, "")}`;
    }
    return new URL("/logo.svg", import.meta.url).href;
  }

  return {
    title,
    loginTitle,
    copyright,
    device,
    layout,
    logout,
    routers,
    $storage,
    isFullscreen,
    Fullscreen,
    ExitFullscreen,
    toggle,
    backTopMenu,
    onPanel,
    getDivStyle,
    changeTitle,
    toggleSideBar,
    menuSelect,
    handleResize,
    resolvePath,
    getLogo,
    isCollapse,
    pureApp,
    username,
    userAvatar,
    avatarsStyle,
    tooltipEffect,
    toAccountSettings,
    getDropdownItemStyle,
    getDropdownItemClass
  };
}
