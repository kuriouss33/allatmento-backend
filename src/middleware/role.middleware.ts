import { Request, Response, NextFunction } from 'express';

export const requireRole = (allowedRoles: string[]) => {
  return (req: Request, res: Response, next: NextFunction) => {
    const userRole = req.user?.role || 'public';

    if (!allowedRoles.includes(userRole)) {
      return res.status(403).json({
        success: false,
        error: 'Nincs megfelelő jogosultságod ehhez a művelethez.'
      });
    }

    next();
  };
};