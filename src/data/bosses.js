export const IMMERSEUS_IMG = '/bosses/immerseus-cutout.png'

export const BOSS_IMAGES = {
  immerseus:           '/bosses/immerseus-cutout.png',
  'rook-stonetoe':     '/bosses/rook-stonetoe-cutout.png',
  'he-softfoot':       '/bosses/he-softfoot-cutout.png',
  'sun-tenderheart':   '/bosses/sun-tenderheart-cutout.png',
  'default-add':       '/bosses/default-add-cutout.png',
  norushen:            '/bosses/norushen-cutout.png',
  'sha-of-pride':      '/bosses/shaboss_pride_1.png',
  'sha-of-violence':   '/bosses/ShaofViolence.png',
  'foul-manifestation':'/bosses/FoulManifestation.png',
  'dragonmaw-guard':   '/bosses/DragonmawGuard.png',
  galakras:              '/bosses/korkronprotodrake.png?v=2',
  'beachhead-demolisher':  '/bosses/BeachheadDemolisher.png',
  'siegecrafter-blackfuse':'/bosses/SiegecrafterBlackfuse.png',
  'orc-impaled':           '/bosses/orcmaleimpaled03.png',
  'iron-juggernaut':       '/bosses/IronJuggy.png',
  'crawler-mine':          '/bosses/crawlermine.png',
  'iron-hunter':           '/bosses/hunta.png',
  'iron-mage':             '/bosses/mages.png',
  'garrosh-hellscream':    '/bosses/GarroshHellscream_1.png',
  'general-nazgrim':       '/bosses/General Nazgrim.png',
  'naz-mage':              '/bosses/Nazmage.png',
  'naz-common':            '/bosses/Nazcommon.png',
  'naz-rogue':             '/bosses/Nazrogue.png',
  'naz-shaman':            '/bosses/Nazshaman.png',
  'naz-sniper':            '/bosses/Nazsniper.png',
  'naz-banner':            '/bosses/Nazbanner.png',
  'naz-htt':               '/bosses/HealingTide.png',
  thok:                    '/bosses/thok.png?v=2',
}

const s = (svg) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svg)}`

export const IMMERSEUS_SVG = s(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 200 240" width="200" height="240">
  <defs>
    <radialGradient id="bodyg" cx="38%" cy="35%" r="62%">
      <stop offset="0%" stop-color="#3090e8"/>
      <stop offset="55%" stop-color="#0050b0"/>
      <stop offset="100%" stop-color="#001e60"/>
    </radialGradient>
    <radialGradient id="headg" cx="40%" cy="36%" r="60%">
      <stop offset="0%" stop-color="#40a0f8"/>
      <stop offset="50%" stop-color="#0060c0"/>
      <stop offset="100%" stop-color="#002080"/>
    </radialGradient>
    <radialGradient id="poolg" cx="40%" cy="40%" r="60%">
      <stop offset="0%" stop-color="#0068d0"/>
      <stop offset="100%" stop-color="#001848"/>
    </radialGradient>
    <radialGradient id="gauntg" cx="35%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#6a6878"/>
      <stop offset="100%" stop-color="#2a2838"/>
    </radialGradient>
    <linearGradient id="armg" x1="0%" y1="0%" x2="100%" y2="100%">
      <stop offset="0%" stop-color="#1a60b0"/>
      <stop offset="100%" stop-color="#001840"/>
    </linearGradient>
  </defs>

  <!-- Water pool base -->
  <ellipse cx="100" cy="218" rx="42" ry="10" fill="url(#poolg)" opacity="0.92"/>
  <ellipse cx="100" cy="216" rx="30" ry="6" fill="#0068d8" opacity="0.55"/>
  <ellipse cx="100" cy="214" rx="18" ry="4" fill="#40a8ff" opacity="0.30"/>

  <!-- Body water column lower -->
  <path d="M58 210 Q46 168 52 126 Q55 108 66 100 Q82 93 100 91 Q118 93 134 100 Q145 108 148 126 Q154 168 142 210 Z" fill="url(#bodyg)"/>

  <!-- LEFT ARM -->
  <path d="M68 150 Q52 138 34 142 Q20 148 16 162" stroke="#0a4898" stroke-width="18" stroke-linecap="round" fill="none"/>
  <path d="M68 150 Q52 138 34 142 Q20 148 16 162" stroke="#1a68c8" stroke-width="8" stroke-linecap="round" fill="none"/>
  <!-- Left gauntlet (stone) -->
  <rect x="4" y="153" width="32" height="26" rx="5" fill="url(#gauntg)" stroke="#4a4858" stroke-width="2"/>
  <rect x="8" y="156" width="24" height="4" rx="2" fill="#5a5870" opacity="0.7"/>
  <rect x="8" y="162" width="24" height="4" rx="2" fill="#5a5870" opacity="0.5"/>
  <rect x="8" y="168" width="24" height="4" rx="2" fill="#5a5870" opacity="0.4"/>
  <!-- Left claws -->
  <line x1="8"  y1="178" x2="2"  y2="196" stroke="#8888a0" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="15" y1="179" x2="11" y2="198" stroke="#8888a0" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="22" y1="179" x2="20" y2="198" stroke="#8888a0" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="29" y1="178" x2="30" y2="196" stroke="#8888a0" stroke-width="3.5" stroke-linecap="round"/>

  <!-- RIGHT ARM -->
  <path d="M132 150 Q148 138 166 142 Q180 148 184 162" stroke="#0a4898" stroke-width="18" stroke-linecap="round" fill="none"/>
  <path d="M132 150 Q148 138 166 142 Q180 148 184 162" stroke="#1a68c8" stroke-width="8" stroke-linecap="round" fill="none"/>
  <!-- Right gauntlet (stone) -->
  <rect x="164" y="153" width="32" height="26" rx="5" fill="url(#gauntg)" stroke="#4a4858" stroke-width="2"/>
  <rect x="168" y="156" width="24" height="4" rx="2" fill="#5a5870" opacity="0.7"/>
  <rect x="168" y="162" width="24" height="4" rx="2" fill="#5a5870" opacity="0.5"/>
  <rect x="168" y="168" width="24" height="4" rx="2" fill="#5a5870" opacity="0.4"/>
  <!-- Right claws -->
  <line x1="170" y1="178" x2="164" y2="196" stroke="#8888a0" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="177" y1="179" x2="173" y2="198" stroke="#8888a0" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="184" y1="179" x2="182" y2="198" stroke="#8888a0" stroke-width="3.5" stroke-linecap="round"/>
  <line x1="191" y1="178" x2="194" y2="196" stroke="#8888a0" stroke-width="3.5" stroke-linecap="round"/>

  <!-- Main torso (brighter, on top of column) -->
  <path d="M62 185 Q58 140 66 108 Q76 82 100 76 Q124 82 134 108 Q142 140 138 185 Z" fill="url(#bodyg)"/>

  <!-- Body water sheen streaks -->
  <path d="M78 178 Q74 136 80 110 Q87 90 100 84" stroke="#70c0ff" stroke-width="2.5" fill="none" opacity="0.55"/>
  <path d="M113 175 Q120 134 116 110 Q112 94 104 86" stroke="#70c0ff" stroke-width="1.8" fill="none" opacity="0.38"/>
  <path d="M90 182 Q86 148 88 122" stroke="#a0d8ff" stroke-width="1.2" fill="none" opacity="0.28"/>

  <!-- HEAD -->
  <ellipse cx="100" cy="80" rx="38" ry="34" fill="url(#headg)"/>

  <!-- Head crests / spikes -->
  <polygon points="75,54 79,26 86,50" fill="#003888" stroke="#0060b0" stroke-width="1.2"/>
  <polygon points="97,47 100,16 103,47" fill="#003888" stroke="#0060b0" stroke-width="1.2"/>
  <polygon points="114,54 121,26 125,50" fill="#003888" stroke="#0060b0" stroke-width="1.2"/>
  <!-- Crest highlights -->
  <line x1="80" y1="48" x2="78" y2="28" stroke="#3080d0" stroke-width="1" opacity="0.5"/>
  <line x1="100" y1="45" x2="100" y2="20" stroke="#3080d0" stroke-width="1" opacity="0.5"/>
  <line x1="120" y1="48" x2="122" y2="28" stroke="#3080d0" stroke-width="1" opacity="0.5"/>

  <!-- Head water sheen -->
  <ellipse cx="86" cy="67" rx="18" ry="13" fill="rgba(80,150,255,0.32)"/>

  <!-- Eye sockets -->
  <ellipse cx="84" cy="78" rx="10" ry="12" fill="#001228"/>
  <ellipse cx="116" cy="78" rx="10" ry="12" fill="#001228"/>
  <!-- Eye glow -->
  <circle cx="84" cy="76" r="5" fill="#4090ff" opacity="0.98"/>
  <circle cx="116" cy="76" r="5" fill="#4090ff" opacity="0.98"/>
  <!-- Eye highlight -->
  <circle cx="82" cy="73" r="2" fill="rgba(180,220,255,0.82)"/>
  <circle cx="114" cy="73" r="2" fill="rgba(180,220,255,0.82)"/>

  <!-- Nasal cavity hint -->
  <path d="M96 90 L100 85 L104 90 L102 96 L98 96 Z" fill="#001228" opacity="0.7"/>

  <!-- Outer body edge glow -->
  <path d="M62 185 Q58 140 66 108 Q76 82 100 76 Q124 82 134 108 Q142 140 138 185 Z" fill="none" stroke="#3090ff" stroke-width="2.5" opacity="0.45"/>
  <ellipse cx="100" cy="80" rx="38" ry="34" fill="none" stroke="#4098ff" stroke-width="1.5" opacity="0.5"/>

  <!-- Pool shimmer -->
  <ellipse cx="100" cy="214" rx="36" ry="8" fill="none" stroke="#40a0ff" stroke-width="1.5" opacity="0.38"/>
</svg>`)
