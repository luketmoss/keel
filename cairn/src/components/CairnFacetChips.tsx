import type { CairnFacet } from '../store/cairnRules'
import { CAIRN_ICON_LABEL, type CairnIcon } from '../store/looseStore'
import { CairnIconGlyph } from './CairnIcon'
import './CairnFacetChips.css'

/* `159-cairn-facets.md`'s facet row — `Any`, `Photo`, then one chip per
   place icon, in `CAIRN_ICON_LABEL`'s order rather than restated, the same
   reasoning `IconPicker.tsx` already gives for deriving its own set from
   the model. */
const ICONS = Object.keys(CAIRN_ICON_LABEL) as CairnIcon[]

interface CairnFacetChipsProps {
  facet: CairnFacet
  onChange: (facet: CairnFacet) => void
}

/** The facet row beneath the main chip row, shown only while `Cairns` is
    the active top-level chip. A facet answers *which of these*, not *what
    is this* — so a photographed campsite is findable under both `Photo`
    and `Campsite`, and neither is a claim about what the marker draws as. */
export function CairnFacetChips({ facet, onChange }: CairnFacetChipsProps) {
  return (
    <div className="cairn-facet-chips" role="group" aria-label="Filter cairns">
      <button
        type="button"
        className={`cairn-facet-chips__chip${facet === 'any' ? ' cairn-facet-chips__chip--selected' : ''}`}
        aria-pressed={facet === 'any'}
        onClick={() => onChange('any')}
      >
        Any
      </button>
      <button
        type="button"
        className={`cairn-facet-chips__chip${facet === 'photo' ? ' cairn-facet-chips__chip--selected' : ''}`}
        aria-pressed={facet === 'photo'}
        onClick={() => onChange('photo')}
      >
        Photo
      </button>
      {/* Icon-only: labelled throughout wraps to three rows and costs 96px
          of panel height at --panel-width, against two rows and 60px —
          see the design note's "Layout" measurement. */}
      {ICONS.map((icon) => (
        <button
          key={icon}
          type="button"
          className={`cairn-facet-chips__chip cairn-facet-chips__chip--icon${facet === icon ? ' cairn-facet-chips__chip--selected' : ''}`}
          aria-label={CAIRN_ICON_LABEL[icon]}
          aria-pressed={facet === icon}
          onClick={() => onChange(icon)}
        >
          <CairnIconGlyph icon={icon} />
        </button>
      ))}
    </div>
  )
}
