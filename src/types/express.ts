import { Request } from 'express';
import { DecodedIdToken } from 'firebase-admin/auth';

export type UserRole = 'public' | 'verified_rescuer' | 'dispatcher' | 'super_admin';

declare global {
  namespace Express {
    interface Request {
      user?: DecodedIdToken & {
        role?: UserRole;
      };
    }
  }
}

export interface AuthenticatedRequest extends Request {
  user?: DecodedIdToken & {
    role?: UserRole;
  };
}
