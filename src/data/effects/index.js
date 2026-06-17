import { RINGS }           from './rings'
import { CC_STATUS }       from './cc'
import { DEBUFFS }         from './debuffs'
import { DEFENSIVES }      from './defensives'
import { CALLOUTS }        from './callouts'
import { ENEMY_EFFECTS }   from './enemy'
import { GROUND_EFFECTS }  from './ground'
import { BEAM_EFFECTS }    from './beams'
import { ORB_EFFECTS }     from './orbs'
import { BOSS_MECHANICS }  from './bossMechanics'

export const EFFECT_GROUPS = [
  { label: 'Rings',          effects: RINGS          },
  { label: 'CC / Status',    effects: CC_STATUS       },
  { label: 'Debuffs',        effects: DEBUFFS         },
  { label: 'Defensives',     effects: DEFENSIVES      },
  { label: 'Callouts',       effects: CALLOUTS        },
  { label: 'Enemy',          effects: ENEMY_EFFECTS   },
  { label: 'Ground',         effects: GROUND_EFFECTS  },
  { label: 'Beams',          effects: BEAM_EFFECTS    },
  { label: 'Orbs',           effects: ORB_EFFECTS     },
  { label: 'Boss Mechanics', effects: BOSS_MECHANICS  },
]

export const EFFECTS = EFFECT_GROUPS.flatMap(g => g.effects)
