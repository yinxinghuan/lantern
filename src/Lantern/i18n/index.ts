type Locale = 'zh' | 'en';

function detectLocale(): Locale {
  const override = localStorage.getItem('game_locale');
  if (override === 'en' || override === 'zh') return override;
  return 'en';
}

const dict: Record<Locale, Record<string, string>> = {
  zh: {
    title: 'Lantern',
    subtitle: '黑暗里举灯探险，怪物在光外伸暗手',
    tap_to_start: '点亮灯笼',
    again: '再下一趟',
    score: '得分',
    high: '最高',
    leaderboard: '排行榜',
    loading: '加载中…',
    rule_explore: '走得越远分越高',
    rule_crystals: '红：永久 +光圈 / 绿：5s 强光 / 蓝：临时挡墙 / 金：纯加分',
    rule_dark:   '别离开光圈太久 — 暗手会突袭',
  },
  en: {
    title: 'Lantern',
    subtitle: 'EXPLORE THE DARK · BEWARE THE HANDS',
    tap_to_start: 'Light the lantern',
    again: 'One more run',
    score: 'Score',
    high: 'Best',
    leaderboard: 'Leaderboard',
    loading: 'Loading…',
    rule_explore: 'Score grows with how far you go',
    rule_crystals: 'Red +halo · Green 5s flood · Blue wall · Gold pure score',
    rule_dark:    "Don't linger out of the light — they reach for you",
  },
};

let cur: Locale = detectLocale();
export function setLocale(l: Locale) { cur = l; localStorage.setItem('game_locale', l); }
export function t(key: string, vars?: { n?: number | string }): string {
  const raw = dict[cur][key] ?? dict.en[key] ?? key;
  if (!vars) return raw;
  return raw.replace(/\{(\w+)\}/g, (_, k) => String((vars as any)[k] ?? ''));
}
export function getLocale(): Locale { return cur; }
