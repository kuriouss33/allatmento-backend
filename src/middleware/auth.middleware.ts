import { Request, Response, NextFunction } from 'express';
import { adminAuth } from '../config/firebase.js';

export const verifyAuthToken = async (req: Request, res: Response, next: NextFunction) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return res.status(401).json({
      success: false,
      error: 'Hiányzó vagy érvénytelen hitelesítési token.'
    });
  }

  const token = authHeader.split('Bearer ')[1];

  try {
    const decodedToken = await adminAuth.verifyIdToken(token);
    req.user = decodedToken as any;
    next();
  } catch (error) {
    return res.status(403).json({
      success: false,
      error: 'Érvénytelen vagy lejárt munkamenet.'
    });
  }
};