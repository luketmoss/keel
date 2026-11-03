import type { Food } from '../api/types';

/**
 * A food as a row title (#781): the brand in secondary text at regular weight, then the name in the row's own style.
 * The two spans are separated by a plain space, so the accessible name is still `displayName()`'s `brand name`.
 */
export function FoodName({ food }: { food: Pick<Food, 'brand' | 'name'> }) {
  const brand = (food.brand ?? '').trim();
  const name = (food.name ?? '').trim();
  if (!brand) return <>{name}</>;
  return (
    <>
      <span class="food-brand">{brand}</span> {name}
    </>
  );
}
