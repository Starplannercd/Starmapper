const CDN = 'https://wow.zamimg.com/images/wow/icons/large/'
const i = (name) => `${CDN}${name}.jpg`
const svg = (s) => `data:image/svg+xml;charset=utf-8,${encodeURIComponent(s)}`

export const ROLE_ICONS = [
  {
    key: 'tank', label: 'Tank', color: '#4488ff', specs: [],
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#0d1f3c"/><path d="M20 8 L30 12 L30 22 C30 28 20 33 20 33 C20 33 10 28 10 22 L10 12 Z" fill="white"/></svg>'),
  },
  {
    key: 'healer', label: 'Healer', color: '#00cc77', specs: [],
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="20" fill="#0a3520"/><rect x="15" y="8" width="10" height="24" rx="2" fill="white"/><rect x="8" y="15" width="24" height="10" rx="2" fill="white"/></svg>'),
  },
  {
    key: 'melee', label: 'Melee', color: '#111111', specs: [],
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#111111" stroke="black" stroke-width="4"/><line x1="9" y1="9" x2="31" y2="31" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="14" y1="20" x2="20" y2="14" stroke="white" stroke-width="2.5" stroke-linecap="round"/><circle cx="9" cy="9" r="2.8" fill="white"/><line x1="31" y1="9" x2="9" y2="31" stroke="white" stroke-width="2.5" stroke-linecap="round"/><line x1="20" y1="14" x2="26" y2="20" stroke="white" stroke-width="2.5" stroke-linecap="round"/><circle cx="31" cy="9" r="2.8" fill="white"/></svg>'),
  },
  {
    key: 'ranged', label: 'Caster', color: '#111111', specs: [],
    icon: svg('<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 40 40"><circle cx="20" cy="20" r="18" fill="#111111" stroke="black" stroke-width="4"/><path d="M22 6 C10 12 10 28 22 34" fill="none" stroke="white" stroke-width="2.8" stroke-linecap="round"/><line x1="22" y1="6" x2="22" y2="34" stroke="white" stroke-width="1.2"/><line x1="7" y1="20" x2="33" y2="20" stroke="white" stroke-width="2" stroke-linecap="round"/><path d="M33 20 L28 17 L28 23 Z" fill="white"/><line x1="9" y1="18" x2="12" y2="20" stroke="white" stroke-width="1.5" stroke-linecap="round"/><line x1="9" y1="22" x2="12" y2="20" stroke="white" stroke-width="1.5" stroke-linecap="round"/></svg>'),
  },
]

export const ENEMY_TYPES = [
  { key: 'add', label: 'Add', color: '#9955ee', isEnemy: true, specs: [], icon: '/icons/add.webp' },
  { key: 'contaminated-puddle', label: 'C. Puddle', color: '#44aa44', isEnemy: true, specs: [], icon: '/icons/contaminated-puddle.png' },
  { key: 'mark-of-anguish', label: 'Mark of Anguish', color: '#cc6622', isEnemy: true, specs: [], icon: '/icons/mark-of-anguish.jpg' },
]

export const WOW_CLASSES = [
  {
    key: 'deathknight', label: 'DK', color: '#C41E3A',
    icon: i('classicon_deathknight'),
    specs: [
      { key: 'blood',  label: 'Blood',  icon: i('spell_deathknight_bloodpresence') },
      { key: 'frost',  label: 'Frost',  icon: i('spell_deathknight_frostpresence') },
      { key: 'unholy', label: 'Unholy', icon: i('spell_deathknight_unholypresence') },
    ],
  },
  {
    key: 'druid', label: 'Druid', color: '#FF7C0A',
    icon: i('classicon_druid'),
    specs: [
      { key: 'balance',     label: 'Balance',  icon: i('spell_nature_starfall') },
      { key: 'feral',       label: 'Feral',    icon: i('ability_druid_catform') },
      { key: 'guardian',    label: 'Guardian', icon: i('ability_racial_bearform') },
      { key: 'restoration', label: 'Resto',    icon: i('spell_nature_healingtouch') },
    ],
  },
  {
    key: 'hunter', label: 'Hunter', color: '#AAD372',
    icon: i('classicon_hunter'),
    specs: [
      { key: 'beastmastery', label: 'BM',       icon: i('ability_hunter_bestialdiscipline') },
      { key: 'marksmanship', label: 'MM',        icon: i('ability_hunter_focusedaim') },
      { key: 'survival',     label: 'Survival',  icon: i('ability_hunter_camouflage') },
    ],
  },
  {
    key: 'mage', label: 'Mage', color: '#3FC7EB',
    icon: i('classicon_mage'),
    specs: [
      { key: 'arcane', label: 'Arcane', icon: i('spell_holy_magicalsentry') },
      { key: 'fire',   label: 'Fire',   icon: i('spell_fire_firebolt02') },
      { key: 'frost',  label: 'Frost',  icon: i('spell_frost_frostbolt02') },
    ],
  },
  {
    key: 'monk', label: 'Monk', color: '#00FF98',
    icon: i('classicon_monk'),
    specs: [
      { key: 'brewmaster',  label: 'Brew',  icon: i('monk_stance_drunkenox') },
      { key: 'mistweaver',  label: 'MW',    icon: i('monk_stance_wiseserpent') },
      { key: 'windwalker',  label: 'WW',    icon: i('monk_stance_whitetiger') },
    ],
  },
  {
    key: 'paladin', label: 'Paladin', color: '#F48CBA',
    icon: i('classicon_paladin'),
    specs: [
      { key: 'holy',       label: 'Holy', icon: i('spell_holy_holybolt') },
      { key: 'protection', label: 'Prot', icon: i('ability_paladin_shieldofthetemplar') },
      { key: 'retribution',label: 'Ret',  icon: i('spell_holy_auraoflight') },
    ],
  },
  {
    key: 'priest', label: 'Priest', color: '#EEEEEE',
    icon: i('classicon_priest'),
    specs: [
      { key: 'discipline', label: 'Disc',   icon: i('spell_holy_powerwordshield') },
      { key: 'holy',       label: 'Holy',   icon: i('spell_holy_guardianspirit') },
      { key: 'shadow',     label: 'Shadow', icon: i('spell_shadow_shadowwordpain') },
    ],
  },
  {
    key: 'rogue', label: 'Rogue', color: '#FFF468',
    icon: i('classicon_rogue'),
    specs: [
      { key: 'assassination', label: 'Sin',      icon: i('ability_rogue_deadlybrew') },
      { key: 'outlaw',        label: 'Outlaw',   icon: i('ability_rogue_waylay') },
      { key: 'subtlety',      label: 'Sub',      icon: i('ability_stealth') },
    ],
  },
  {
    key: 'shaman', label: 'Shaman', color: '#0070DD',
    icon: i('classicon_shaman'),
    specs: [
      { key: 'elemental',   label: 'Ele',  icon: i('spell_nature_lightning') },
      { key: 'enhancement', label: 'Enh',  icon: i('spell_shaman_improvedstormstrike') },
      { key: 'restoration', label: 'Resto',icon: i('spell_nature_magicimmunity') },
    ],
  },
  {
    key: 'warlock', label: 'Warlock', color: '#8788EE',
    icon: i('classicon_warlock'),
    specs: [
      { key: 'affliction',  label: 'Aff',   icon: i('spell_shadow_deathcoil') },
      { key: 'demonology',  label: 'Demo',  icon: i('spell_shadow_metamorphosis') },
      { key: 'destruction', label: 'Dest',  icon: i('spell_shadow_rainoffire') },
    ],
  },
  {
    key: 'warrior', label: 'Warrior', color: '#C69B3A',
    icon: i('classicon_warrior'),
    specs: [
      { key: 'arms',       label: 'Arms', icon: i('ability_warrior_savageblow') },
      { key: 'fury',       label: 'Fury', icon: i('ability_warrior_innerrage') },
      { key: 'protection', label: 'Prot', icon: i('ability_warrior_defensivestance') },
    ],
  },
]
