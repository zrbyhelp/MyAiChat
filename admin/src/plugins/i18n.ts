import { type I18n, createI18n } from "vue-i18n";
import type { App, WritableComputedRef } from "vue";
import { responsiveStorageNameSpace } from "@/config";
import { storageLocal } from "@pureadmin/utils";
import enLocale from "element-plus/es/locale/lang/en";
import zhLocale from "element-plus/es/locale/lang/zh-cn";

export type I18nLanguageOption = {
  locale: string;
  label: string;
};

export const normalizeLocale = (value?: string | null) => {
  const normalized = String(value || "").trim().toLowerCase();
  if (!normalized) return "zh";
  if (normalized.startsWith("zh")) return "zh";
  if (normalized.startsWith("en")) return "en";
  return "zh";
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

const LANGUAGE_OPTIONS: I18nLanguageOption[] = [
  { locale: "zh", label: "简体中文" },
  { locale: "en", label: "English" }
];

export const i18n: I18n = createI18n({
  legacy: false,
  locale: normalizeLocale(
    storageLocal().getItem<StorageConfigs>(`${responsiveStorageNameSpace()}locale`)?.locale
  ),
  fallbackLocale: "en",
  messages: localesConfigs
});

export const getI18nLanguageOptions = () => {
  return [...LANGUAGE_OPTIONS];
};

export const initRemoteI18nMessages = async () => {
  return;
};

export const loadRemoteI18nMessageByLocale = async (_locale: string, _force = false) => {
  return;
};

export function transformI18n(message: any = "") {
  if (!message) return "";

  if (typeof message === "object") {
    const locale: string | WritableComputedRef<string> | any = i18n.global.locale;
    return message[normalizeLocale(locale?.value)];
  }

  const translated =
    typeof (i18n.global as any).t === "function"
      ? (i18n.global as any).t(String(message))
      : String(message);
  return translated === String(message) ? message : translated;
}

export const $t = (key: string) => key;

export function useI18n(app: App) {
  app.use(i18n);
}
