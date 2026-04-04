// Merkezi kasa tema sistemi — Boltify-inspired design tokens

export type KasaId = 'wildpark' | 'sinema' | 'face2face' | 'genel';

interface KasaTheme {
  accent: string;          // text-green-400
  gradient: string;        // from-green-600 to-emerald-700
  activeTab: string;       // sidebar active tab class
  activeIcon: string;      // sidebar active icon color
  scrollbar: string;       // scrollbar-thumb rgba
  badgeBg: string;         // badge background
  badgeBorder: string;     // badge border
  badgeText: string;       // badge text
}

const themes: Record<KasaId, KasaTheme> = {
  wildpark: {
    accent: 'text-emerald-400',
    gradient: 'from-emerald-600 to-emerald-700',
    activeTab: 'bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 shadow-boltify-card',
    activeIcon: 'text-emerald-400',
    scrollbar: 'rgba(52, 211, 153, 0.4)',
    badgeBg: 'bg-emerald-500/10',
    badgeBorder: 'border-emerald-500/20',
    badgeText: 'text-emerald-400',
  },
  sinema: {
    accent: 'text-violet-400',
    gradient: 'from-violet-600 to-violet-700',
    activeTab: 'bg-violet-500/10 text-violet-400 border border-violet-500/20 shadow-boltify-card',
    activeIcon: 'text-violet-400',
    scrollbar: 'rgba(167, 139, 250, 0.4)',
    badgeBg: 'bg-violet-500/10',
    badgeBorder: 'border-violet-500/20',
    badgeText: 'text-violet-400',
  },
  face2face: {
    accent: 'text-sky-400',
    gradient: 'from-sky-600 to-sky-700',
    activeTab: 'bg-sky-500/10 text-sky-400 border border-sky-500/20 shadow-boltify-card',
    activeIcon: 'text-sky-400',
    scrollbar: 'rgba(56, 189, 248, 0.4)',
    badgeBg: 'bg-sky-500/10',
    badgeBorder: 'border-sky-500/20',
    badgeText: 'text-sky-400',
  },
  genel: {
    accent: 'text-amber-400',
    gradient: 'from-amber-600 to-amber-700',
    activeTab: 'bg-amber-500/10 text-amber-400 border border-amber-500/20 shadow-boltify-card',
    activeIcon: 'text-amber-400',
    scrollbar: 'rgba(251, 191, 36, 0.4)',
    badgeBg: 'bg-amber-500/10',
    badgeBorder: 'border-amber-500/20',
    badgeText: 'text-amber-400',
  },
};

export function getKasaTheme(kasaId: KasaId): KasaTheme {
  return themes[kasaId] || themes.sinema;
}
