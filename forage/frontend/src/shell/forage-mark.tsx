/** Forage's mark (#702). Decorative: it always sits beside the word "Forage". */
export function ForageMark({ size }: { size: number }) {
  return (
    <img
      class="forage-mark"
      src={`${import.meta.env.BASE_URL}forage-mark.svg`}
      width={size}
      height={size}
      alt=""
      data-testid="forage-mark"
    />
  );
}
