// The demo layer's sample data. Only the user for now: each feature issue adds
// its own sample rows here.
import type { AuthUser } from '@keel/auth';

export const DEMO_USER: AuthUser = {
  name: 'Demo User',
  email: 'demo@forage.local',
  picture: '',
};
