import express, { NextFunction, Request, Response } from 'express';
import { body, header, param, query } from 'express-validator';
import { getAuth } from 'firebase-admin/auth';
import {
  acceptInvite,
  createInvite,
  getInviteInfo,
  listInvites,
  revokeInvite,
} from '../controllers/invite_controller.js';
import { isAdminEmail } from '../services/firebase/admins.js';
import { decodeUserIdToken } from '../services/firebase/users.js';
import { authBearerCheck } from '../services/validator/auth.js';

const router = express.Router();

const inviteAdminChecker = async (req: Request, res: Response, next: NextFunction) => {
  const idToken = req.headers.authorization?.split('Bearer ')[1];
  const uid = idToken ? await decodeUserIdToken(idToken) : undefined;

  if (!uid) {
    res.status(401).json({ message: 'error_auth_invalid-token' });
    return;
  }

  const user = await getAuth().getUser(uid);
  if (!user.email || !(await isAdminEmail(user.email))) {
    res.status(403).json({ message: 'UNAUTHORIZED_ACCESS' });
    return;
  }

  res.locals.inviteAdminUid = uid;
  next();
};

router.get('/info', query('token').isString().notEmpty(), getInviteInfo);
router.post(
  '/accept',
  [
    body('token').isString().notEmpty(),
    body('firstname').isString().notEmpty(),
    body('lastname').isString().notEmpty(),
    header('Authorization').exists().notEmpty().isString().custom(authBearerCheck),
  ],
  acceptInvite,
);

router.use(inviteAdminChecker);
router.post(
  '/',
  [
    body('email').isEmail().normalizeEmail(),
    body('congregation_id').isString().notEmpty(),
    body('role').isArray({ min: 1 }),
  ],
  createInvite,
);
router.get('/', listInvites);
router.delete('/:id', param('id').isString().notEmpty(), revokeInvite);

export default router;
