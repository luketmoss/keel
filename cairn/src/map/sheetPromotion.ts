import { createContext, useContext } from 'react'

/** #313 — the same "promote peek to half" `BottomSheet` already runs for
    #258's `detailOpen` transition, reached here by a second trigger: a map
    gesture that selected something, from anywhere under the shell rather
    than only from `ShellColumn`'s own subtree. `TripDetail`'s markers and
    routes are inside that subtree; the world map's loose markers are not
    (`LooseLayer`/`Cairn3DLayer` render as `MapCanvas`'s siblings in
    `App.tsx`, not as `BottomSheet`'s children) — a context provided from
    the shell's own root is what reaches both without threading the
    function down through every intermediate prop list.

    `AppShell` holds the ref `BottomSheet` registers itself into (via
    `onRegisterPromote`) and provides the stable function below; a caller
    with no sheet mounted (desktop) simply gets whatever no-op default that
    ref started with. */
const SheetPromotionContext = createContext<(() => void) | null>(null)

export const SheetPromotionProvider = SheetPromotionContext.Provider

/** Falls back to a no-op rather than throwing — a component rendered in a
    test with no provider (most of this codebase's component tests) should
    keep working exactly as it did before this promotion existed. */
export function useSheetPromotion(): () => void {
  return useContext(SheetPromotionContext) ?? (() => {})
}
