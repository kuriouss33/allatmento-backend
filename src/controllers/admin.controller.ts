import { Request, Response } from 'express';
import { setUserRoleInSystem, getAllUsersFromSystem, UserRole } from '../services/users.service.js';

export const handleSetUserRole = async (req: Request, res: Response) => {
  const { targetUid, role } = req.body;
  const adminUid = req.user?.uid || 'system_admin';

  if (!targetUid || !role) {
    return res.status(400).json({
      success: false,
      error: 'Hiányzó felhasználói azonosító (targetUid) vagy szerepkör (role).'
    });
  }

  const validRoles: UserRole[] = ['public', 'verified_rescuer', 'dispatcher', 'super_admin'];
  if (!validRoles.includes(role)) {
    return res.status(400).json({
      success: false,
      error: 'Érvénytelen szerepkör formátum.'
    });
  }

  try {
    const result = await setUserRoleInSystem(targetUid, role, adminUid);
    res.json(result);
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Hiba történt a szerepkör beállítása során.'
    });
  }
};

export const listUsersController = async (_req: Request, res: Response) => {
  try {
    const users = await getAllUsersFromSystem();
    res.json({ success: true, users });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: error.message || 'Hiba történt a felhasználók lekérése során.'
    });
  }
};