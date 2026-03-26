<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { useDark, useECharts } from "@pureadmin/utils";

type OptionItem = { label: string; value: string; count: number };
type TimeItem = { date: string; count: number };
type TimePair = { start: string; end: string };

const props = withDefaults(
  defineProps<{
    mode: "pie" | "time" | "timeRange" | "timeSegments";
    options?: OptionItem[];
    series?: TimeItem[];
    rangeStart?: TimeItem[];
    rangeEnd?: TimeItem[];
    pairs?: TimePair[];
  }>(),
  {
    options: () => [],
    series: () => [],
    rangeStart: () => [],
    rangeEnd: () => [],
    pairs: () => []
  }
);

const chartRef = ref();
const { isDark } = useDark();
const theme = computed(() => (isDark.value ? "dark" : "light"));
const { setOptions } = useECharts(chartRef, { theme });

const buildPieOption = () => ({
  tooltip: { trigger: "item" as const, confine: true },
  legend: { bottom: 0, left: "center" },
  series: [
    {
      type: "pie",
      radius: ["38%", "68%"],
      center: ["50%", "45%"],
      label: { formatter: "{b}: {c}" },
      data: (props.options || []).map(item => ({ name: item.label, value: Number(item.count || 0) }))
    }
  ]
});

const buildTimeOption = () => ({
  tooltip: { trigger: "axis" as const, confine: true },
  xAxis: { type: "category", data: (props.series || []).map(item => item.date) },
  yAxis: { type: "value", minInterval: 1 },
  grid: { left: 40, right: 14, top: 18, bottom: 32 },
  series: [
    {
      type: "line",
      smooth: true,
      symbolSize: 8,
      areaStyle: { opacity: 0.12 },
      data: (props.series || []).map(item => Number(item.count || 0))
    }
  ]
});

const buildTimeRangeOption = () => {
  const dates = [...new Set([...(props.rangeStart || []).map(i => i.date), ...(props.rangeEnd || []).map(i => i.date)])].sort(
    (a, b) => a.localeCompare(b)
  );
  const startMap = new Map((props.rangeStart || []).map(i => [i.date, Number(i.count || 0)]));
  const endMap = new Map((props.rangeEnd || []).map(i => [i.date, Number(i.count || 0)]));
  return {
    tooltip: { trigger: "axis" as const, confine: true },
    legend: { top: 0, right: 8, data: ["区间开始", "区间结束"] },
    xAxis: { type: "category", data: dates },
    yAxis: { type: "value", minInterval: 1 },
    grid: { left: 40, right: 14, top: 36, bottom: 32 },
    series: [
      {
        name: "区间开始",
        type: "line",
        smooth: true,
        symbolSize: 7,
        data: dates.map(d => Number(startMap.get(d) || 0))
      },
      {
        name: "区间结束",
        type: "line",
        smooth: true,
        symbolSize: 7,
        data: dates.map(d => Number(endMap.get(d) || 0))
      }
    ]
  };
};

const buildTimeSegmentsOption = () => {
  const toTimestamp = (input: string) => {
    const text = String(input || "").trim();
    if (!text) return Number.NaN;
    const direct = Date.parse(text);
    if (Number.isFinite(direct)) return direct;
    // Support time-only values like "13:20" / "13:20:30" for time-range components.
    const timeMatch = text.match(/^(\d{1,2}):(\d{2})(?::(\d{2}))?$/);
    if (timeMatch) {
      const hh = Number(timeMatch[1] || 0);
      const mm = Number(timeMatch[2] || 0);
      const ss = Number(timeMatch[3] || 0);
      if (hh >= 0 && hh <= 23 && mm >= 0 && mm <= 59 && ss >= 0 && ss <= 59) {
        const now = new Date();
        now.setHours(hh, mm, ss, 0);
        return now.getTime();
      }
    }
    return Number.NaN;
  };

  const pairList = (props.pairs || [])
    .map(item => ({
      start: String(item?.start || "").trim(),
      end: String(item?.end || "").trim()
    }))
    .filter(item => item.start && item.end)
    .map(item => ({
      ...item,
      startTs: toTimestamp(item.start),
      endTs: toTimestamp(item.end)
    }))
    .filter(item => Number.isFinite(item.startTs) && Number.isFinite(item.endTs))
    .map(item => ({
      ...item,
      from: Math.min(item.startTs, item.endTs),
      to: Math.max(item.startTs, item.endTs)
    }));

  return {
    tooltip: {
      trigger: "axis" as const,
      confine: true,
      formatter: (params: any) => {
        const points = Array.isArray(params) ? params : [params];
        const lines = points
          .filter(item => item?.seriesName)
          .map(item => `${item.seriesName}: ${item.data?.start || "-"} ~ ${item.data?.end || "-"}`);
        return lines.join("<br/>");
      }
    },
    xAxis: { type: "time" as const },
    yAxis: { type: "value" as const, min: 0, max: Math.max(2, pairList.length + 1), minInterval: 1 },
    grid: { left: 48, right: 18, top: 24, bottom: 32 },
    series: pairList.map((item, idx) => ({
      name: `区间${idx + 1}`,
      type: "line",
      smooth: false,
      symbol: "circle",
      symbolSize: 7,
      lineStyle: { width: 3 },
      data: [
        { value: [item.from, idx + 1], start: item.start, end: item.end },
        { value: [item.to, idx + 1], start: item.start, end: item.end }
      ]
    }))
  };
};

watch(
  () => [props.mode, props.options, props.series, props.rangeStart, props.rangeEnd, props.pairs],
  () => {
    const option =
      props.mode === "pie"
        ? buildPieOption()
        : props.mode === "timeSegments"
          ? buildTimeSegmentsOption()
        : props.mode === "timeRange"
          ? buildTimeRangeOption()
          : buildTimeOption();
    setOptions(option as any);
  },
  { deep: true, immediate: true }
);
</script>

<template>
  <div ref="chartRef" class="question-stat-chart" />
</template>

<style scoped lang="scss">
.question-stat-chart {
  width: 100%;
  height: 220px;
}
</style>
