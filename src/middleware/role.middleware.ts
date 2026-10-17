import { Request, Response, NextFunction } from 'express';
import '../types/express.js';

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = (req as any).user?.role || 'public';

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Nincs megfelelő jogosultságod ehhez a művelethez.'
      });
    }

    next();
  };
};