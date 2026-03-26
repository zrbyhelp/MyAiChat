import { type I18n, createI18n } from "vue-i18n";
import type { App, WritableComputedRef } from "vue";
import { responsiveStorageNameSpace } from "@/config";
import { storageLocal } from "@pureadmin/utils";
import { getToken, formatToken } from "@/utils/auth";
import enLocale from "element-plus/es/locale/lang/en";
import zhLocale from "element-plus/es/locale/lang/zh-cn";

export type I18nLanguageOption = {
  locale: string;
  label: string;
};

const siphonI18n = (() => {
  const cache = Object.fromEntries(
    Object.entries(import.meta.glob("../../locales/*.y(a)?ml", { eager: true })).map(
      ([key, value]: any) => {
        const matched = key.match(/([A-Za-z0-9-_]+)\./i)?.[1] || "";
        return [matched, value.default || {}];
      }
    )
  );
  return (prefix = "zh-CN") => cache[prefix] || {};
})();

export const localesConfigs = {
  zh: {
    ...siphonI18n("zh-CN"),
    ...zhLocale
  },
  en: {
    ...siphonI18n("en"),
    ...enLocale
  }
};

const REMOTE_LOCALE_CATEGORY_KEY = "locale";
const DEFAULT_REMOTE_LOCALE_FILES: Record<string, string> = {
  zh: "zh-CN.yaml",
  en: "en.yaml"
};
const LOCALE_LABELS: Record<string, string> = {
  zh: "简体中文",
  "zh-CN": "简体中文",
  "zh-TW": "繁体中文",
  en: "English",
  "en-US": "English (US)",
  "en-GB": "English (UK)",
  "ko-KR": "Korean",
  ja: "Japanese",
  "ja-JP": "Japanese",
  fr: "Francais",
  "fr-FR": "Francais",
  de: "Deutsch",
  "de-DE": "Deutsch",
  es: "Espanol",
  "es-ES": "Espanol",
  ru: "Russian",
  "ru-RU": "Russian"
};

const loadedRemoteLocales = new Set<string>();
const remoteLocaleFileMap = new Map<string, string>(
  Object.entries(DEFAULT_REMOTE_LOCALE_FILES)
);
let remoteLanguageOptions: I18nLanguageOption[] = [
  { locale: "zh", label: LOCALE_LABELS.zh },
  { locale: "en", label: LOCALE_LABELS.en }
];

const getLocaleLabel = (locale: string) => {
  const key = String(locale || "").trim();
  return LOCALE_LABELS[key] || key;
};

const buildHeaders = () => {
  const token = getToken()?.accessToken;
  const headers: Record<string, string> = {
    "Content-Type": "application/json",
    "X-Requested-With": "XMLHttpRequest"
  };
  if (token) headers.Authorization = formatToken(token);
  return headers;
};

const postJson = async (url: string, body: Record<string, unknown>) => {
  const response = await fetch(url, {
    method: "POST",
    headers: buildHeaders(),
    body: JSON.stringify(body)
  });
  if (!response.ok) return null;
  return response.json();
};

const parseYamlScalar = (raw: string) => {
  const value = String(raw ?? "");
  if (!value) return "";
  if (value.startsWith("'") && value.endsWith("'")) {
    return value.slice(1, -1).replace(/''/g, "'");
  }
  if (value.startsWith('"') && value.endsWith('"')) {
    try {
      return JSON.parse(value);
    } catch {
      return value.slice(1, -1);
    }
  }
  return value;
};

const setObjectByPath = (obj: Record<string, any>, pathValue: string, value: string) => {
  const segments = String(pathValue || "")
    .split(".")
    .map(seg => seg.trim())
    .filter(Boolean);
  if (segments.length === 0) return;

  let cursor = obj;
  for (let i = 0; i < segments.length; i += 1) {
    const seg = segments[i];
    if (i === segments.length - 1) {
      cursor[seg] = value;
      return;
    }
    if (!cursor[seg] || typeof cursor[seg] !== "object" || Array.isArray(cursor[seg])) {
      cursor[seg] = {};
    }
    cursor = cursor[seg];
  }
};

const parseYamlToObject = (content: string) => {
  const lines = String(content || "").split(/\r?\n/);
  const stack: string[] = [];
  const out: Record<string, any> = {};

  for (let i = 0; i < lines.length; i += 1) {
    const rawLine = lines[i];
    if (!rawLine) continue;
    const trimmed = rawLine.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    if (trimmed.startsWith("-")) continue;

    const match = rawLine.match(/^(\s*)([^:\s][^:]*?)\s*:\s*(.*)$/);
    if (!match) continue;

    const indent = match[1].replace(/\t/g, "  ").length;
    const level = Math.floor(indent / 2);
    const currentKey = String(match[2] || "").trim();
    const rest = String(match[3] || "");

    while (stack.length > level) stack.pop();
    if (rest === "") {
      stack[level] = currentKey;
      continue;
    }

    const fullKey = [...stack.slice(0, level), currentKey].join(".");
    setObjectByPath(out, fullKey, parseYamlScalar(rest.trim()));
  }

  return out;
};

const parseDictionaryContent = (filename: string, content: string) => {
  const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
  if (ext === ".json") {
    try {
      const parsed = JSON.parse(String(content || "{}"));
      if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) {
        return parsed as Record<string, unknown>;
      }
    } catch {
      // ignore parse errors and fallback to empty object
    }
    return {};
  }
  if (ext === ".yaml" || ext === ".yml") {
    return parseYamlToObject(content);
  }
  return {};
};

const updateRemoteLocaleCatalog = (filenames: string[]) => {
  const priority: Record<string, number> = {
    ".yaml": 3,
    ".yml": 2,
    ".json": 1
  };
  const nextMap = new Map<string, { filename: string; score: number }>();

  filenames.forEach(name => {
    const filename = String(name || "").trim();
    const ext = filename.slice(filename.lastIndexOf(".")).toLowerCase();
    if (![".yaml", ".yml", ".json"].includes(ext)) return;
    const localeCode = filename.slice(0, filename.length - ext.length).trim();
    if (!localeCode) return;
    const score = priority[ext] || 0;
    const current = nextMap.get(localeCode);
    if (!current || score > current.score) {
      nextMap.set(localeCode, { filename, score });
    }
  });

  if (nextMap.size === 0) return;

  remoteLocaleFileMap.clear();
  for (const [localeCode, info] of nextMap.entries()) {
    remoteLocaleFileMap.set(localeCode, info.filename);
  }

  if (!remoteLocaleFileMap.has("zh") && remoteLocaleFileMap.has("zh-CN")) {
    remoteLocaleFileMap.set("zh", String(remoteLocaleFileMap.get("zh-CN")));
  }
  if (!remoteLocaleFileMap.has("en") && remoteLocaleFileMap.has("en-US")) {
    remoteLocaleFileMap.set("en", String(remoteLocaleFileMap.get("en-US")));
  }

  const canonicalLocales = Array.from(nextMap.keys()).sort((a, b) => a.localeCompare(b));
  remoteLanguageOptions = canonicalLocales.map(locale => ({
    locale,
    label: getLocaleLabel(locale)
  }));
};

const fetchRemoteLocaleCatalog = async () => {
  try {
    const payload = await postJson("/api/system/i18n/list", {
      categoryKey: REMOTE_LOCALE_CATEGORY_KEY
    });
    if (Number(payload?.code) !== 0 || !Array.isArray(payload?.data)) return;
    const filenames = payload.data.map((item: any) => String(item?.filename || "").trim());
    updateRemoteLocaleCatalog(filenames);
  } catch {
    // keep fallback catalog
  }
};

const fetchRemoteLocaleDictionary = async (filename: string) => {
  try {
    const payload = await postJson("/api/system/i18n/get", {
      categoryKey: REMOTE_LOCALE_CATEGORY_KEY,
      filename
    });
    if (Number(payload?.code) !== 0) return {};
    const content = String(payload?.data?.content ?? "");
    return parseDictionaryContent(filename, content);
  } catch {
    return {};
  }
};

const mergeRemoteLocaleMessage = (locale: string, message: Record<string, unknown>) => {
  i18n.global.mergeLocaleMessage(locale, message);
  if (locale === "zh-CN") i18n.global.mergeLocaleMessage("zh", message);
  if (locale === "en-US") i18n.global.mergeLocaleMessage("en", message);
};

export const i18n: I18n = createI18n({
  legacy: false,
  locale:
    storageLocal().getItem<StorageConfigs>(`${responsiveStorageNameSpace()}locale`)?.locale ??
    "zh",
  fallbackLocale: "en",
  messages: localesConfigs
});

export const getI18nLanguageOptions = () => {
  return [...remoteLanguageOptions];
};

export const initRemoteI18nMessages = async () => {
  await fetchRemoteLocaleCatalog();
  const activeLocale =
    String(
      storageLocal().getItem<StorageConfigs>(`${responsiveStorageNameSpace()}locale`)?.locale ??
        "zh"
    ).trim() || "zh";
  const preload = Array.from(new Set(["zh", "en", activeLocale]));
  await Promise.all(preload.map(locale => loadRemoteI18nMessageByLocale(locale, false)));
};

export const loadRemoteI18nMessageByLocale = async (
  locale: string,
  force = false
) => {
  const normalized = String(locale || "").trim();
  if (!normalized) return;
  if (!force && loadedRemoteLocales.has(normalized)) return;

  const filename =
    remoteLocaleFileMap.get(normalized) ||
    DEFAULT_REMOTE_LOCALE_FILES[normalized] ||
    "";
  if (!filename) return;

  const remoteMessage = await fetchRemoteLocaleDictionary(filename);
  if (Object.keys(remoteMessage).length === 0) return;
  mergeRemoteLocaleMessage(normalized, remoteMessage);
  loadedRemoteLocales.add(normalized);
};

export function transformI18n(message: any = "") {
  if (!message) return "";

  if (typeof message === "object") {
    const locale: string | WritableComputedRef<string> | any = i18n.global.locale;
    return message[locale?.value];
  }

  const hasMessageKey =
    typeof (i18n.global as any).te === "function"
      ? Boolean((i18n.global as any).te(message))
      : false;
  if (hasMessageKey) {
    return i18n.global.t.call(i18n.global.locale, message);
  }

  return message;
}

export const $t = (key: string) => key;

export function useI18n(app: App) {
  app.use(i18n);
}
