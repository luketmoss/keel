/** What each "Add a section" pill starts, with the lowest free superset (#640); no Superset once all three exist. */
export function sectionPills(present: ReadonlySet<string>): { label: string; section: string }[] {
  const pills: { label: string; section: string }[] = [];
  if (!present.has('warmup')) pills.push({ label: 'Warm-up', section: 'warmup' });
  if (!present.has('primary')) pills.push({ label: 'Primary', section: 'primary' });
  const free = ['SS1', 'SS2', 'SS3'].find((s) => !present.has(s));
  if (free) pills.push({ label: 'Superset', section: free });
  if (!present.has('burnout')) pills.push({ label: 'Burnout', section: 'burnout' });
  if (!present.has('cooldown')) pills.push({ label: 'Cool-down', section: 'cooldown' });
  return pills;
}
