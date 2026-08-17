import { DecodedIdToken } from 'firebase-admin/auth';

declare global {
  namespace Express {
    interface Request {
      user?: DecodedIdToken & {
        role?: 'public' | 'verified_rescuer' | 'dispatcher' | 'super_admin';
      };
    }
  }
}