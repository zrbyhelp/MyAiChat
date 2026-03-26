import axios from "axios";
import type { App } from "vue";

let config: object = {};
const { VITE_PUBLIC_PATH } = import.meta.env;

const setConfig = (cfg?: unknown) => {
  config = Object.assign(config, cfg);
};

const getConfig = (key?: string): PlatformConfigs => {
  if (typeof key === "string") {
    const arr = key.split(".");
    if (arr && arr.length) {
      let data = config;
      arr.forEach(v => {
        if (data && typeof data[v] !== "undefined") {
          data = data[v];
        } else {
          data = null;
        }
      });
      return data;
    }
  }
  return config;
};

const buildRemoteBasicConfig = (raw: any): PlatformConfigs => {
  const patch: PlatformConfigs = {};
  const legacyProjectName = String(raw?.projectName ?? "").trim();
  const longTitleCandidate = String(raw?.longProjectName ?? "").trim();
  const shortTitle =
    String(raw?.shortProjectName ?? "").trim() || legacyProjectName || longTitleCandidate;
  const longTitle = longTitleCandidate || shortTitle;
  const logo = String(raw?.logo ?? "").trim();
  const copyright = String(raw?.copyright ?? "").trim();

  if (shortTitle) {
    patch.Title = shortTitle;
    patch.ShortTitle = shortTitle;
  }
  if (longTitle) patch.LongTitle = longTitle;
  if (logo) patch.Logo = logo;
  if (copyright) patch.Copyright = copyright;
  return patch;
};

export const getPlatformConfig = async (app: App): Promise<PlatformConfigs> => {
  app.config.globalProperties.$config = getConfig();
  let $config = app.config.globalProperties.$config;

  try {
    const { data: platformConfig } = await axios({
      method: "get",
      url: `${VITE_PUBLIC_PATH}platform-config.json`
    });
    if (app && $config && typeof platformConfig === "object") {
      $config = Object.assign($config, platformConfig);
      app.config.globalProperties.$config = $config;
      setConfig($config);
    }
  } catch {
    throw "请在public文件夹下添加platform-config.json配置文件";
  }

  try {
    const { data } = await axios({
      method: "get",
      url: "/api/platform/basic-info"
    });
    if (data?.code === 0 && data?.data && typeof data.data === "object") {
      const remotePatch = buildRemoteBasicConfig(data.data);
      if (Object.keys(remotePatch).length > 0) {
        $config = Object.assign($config, remotePatch);
        app.config.globalProperties.$config = $config;
        setConfig($config);
      }
    }
  } catch {
    // Ignore remote config failures and keep local platform config.
  }

  return $config;
};

const responsiveStorageNameSpace = () => getConfig().ResponsiveStorageNameSpace;

export { getConfig, setConfig, responsiveStorageNameSpace };
