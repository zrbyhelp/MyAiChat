import { useNav } from "./useNav";
import { useI18n } from "vue-i18n";
import { useRoute } from "vue-router";
import { ref, watch, onBeforeMount, type Ref } from "vue";
import {
  getI18nLanguageOptions,
  loadRemoteI18nMessageByLocale,
  type I18nLanguageOption
} from "@/plugins/i18n";

export function useTranslationLang(menuRef?: Ref) {
  const { $storage, changeTitle, handleResize } = useNav();
  const { locale, t } = useI18n();
  const route = useRoute();
  const languageOptions = ref<I18nLanguageOption[]>(getI18nLanguageOptions());

  const resolveStoredLocale = (value: string) => {
    const normalized = String(value || "").trim();
    if (!normalized) return "zh";
    if (languageOptions.value.some(item => item.locale === normalized)) {
      return normalized;
    }
    if (normalized === "zh") {
      return (
        languageOptions.value.find(item => item.locale.toLowerCase().startsWith("zh"))?.locale ||
        normalized
      );
    }
    if (normalized === "en") {
      return (
        languageOptions.value.find(item => item.locale.toLowerCase().startsWith("en"))?.locale ||
        normalized
      );
    }
    return normalized;
  };

  async function switchLanguage(nextLocale: string, force = true) {
    const targetLocale = String(nextLocale || "").trim();
    if (!targetLocale) return;
    await loadRemoteI18nMessageByLocale(targetLocale, force);
    $storage.locale = { locale: targetLocale };
    locale.value = targetLocale;
    languageOptions.value = getI18nLanguageOptions();
    menuRef && handleResize(menuRef.value);
  }

  function translationCh() {
    void switchLanguage("zh");
  }

  function translationEn() {
    void switchLanguage("en");
  }

  watch(
    () => locale.value,
    () => {
      changeTitle(route.meta);
    }
  );

  onBeforeMount(() => {
    languageOptions.value = getI18nLanguageOptions();
    const initial = resolveStoredLocale(String($storage.locale?.locale ?? "zh"));
    locale.value = initial;
    void switchLanguage(initial, true);
  });

  return {
    t,
    route,
    locale,
    languageOptions,
    switchLanguage,
    translationCh,
    translationEn
  };
}
