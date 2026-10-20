interface ThriveLogoProps {
  size?: number;
  class?: string;
}

// The mark is an <img> of the public asset, not inline SVG: it carries a
// document-global <filter id>, and public/ already holds it for the favicon (#397).
// alt="": the sign-in card's <h1>Thrive</h1> names it, so this is decorative.
export function ThriveLogo({ size = 24, class: className }: ThriveLogoProps) {
  return <img src={`${import.meta.env.BASE_URL}thrive-mark.svg`} width={size} height={size} alt="" class={className} />;
}
