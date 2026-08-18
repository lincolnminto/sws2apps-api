import express from 'express';
import { body, header } from 'express-validator';
import { adminEmailPasswordSignin, loginUser } from '../controllers/auth_controller.js';
import { authBearerCheck } from '../services/validator/auth.js';

const router = express.Router();

router.get('/user-login', header('Authorization').exists().notEmpty().isString().custom(authBearerCheck), loginUser);

router.post(
	'/admin-email-password-signin',
	[
		body('email').isEmail().normalizeEmail(),
		body('password').isString().isLength({ min: 8 }),
		header('Authorization').exists().notEmpty().isString().custom(authBearerCheck),
	],
	adminEmailPasswordSignin
);

export default router;
