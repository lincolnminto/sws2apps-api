import { NextFunction, Request, Response } from 'express';

/**
 * Firebase Hosting only forwards a request cookie named `__session` to a
 * rewritten Cloud Run / Cloud Functions backend — every other cookie is
 * stripped by the Hosting CDN, and `Set-Cookie` for other names is dropped on
 * the way back. See https://firebase.google.com/docs/hosting/manage-cache#using_cookies
 *
 * The app tracks device sessions with a signed `visitorid` cookie. To keep all
 * of that code unchanged while surviving the Hosting rewrite, this shim bridges
 * the two names:
 *   • inbound : expose the verified `__session` value as `visitorid`
 *   • outbound: any res.cookie('visitorid', …) / res.clearCookie('visitorid')
 *               is written to the wire as `__session`
 *
 * Safe in every environment: locally and behind a custom domain the session
 * cookie is simply named `__session` on the wire; nothing else depends on the
 * wire name (the value is still the visitorid UUID).
 */
export const firebaseSessionCookie = () => {
	return (req: Request, res: Response, next: NextFunction) => {
		const signed = req.signedCookies as Record<string, string | undefined>;

		// inbound: __session (forwarded by Hosting) → visitorid (read by the app)
		if (signed && signed.__session && !signed.visitorid) {
			signed.visitorid = signed.__session;
		}

		// outbound: rewrite the visitorid cookie to __session (kept by Hosting)
		const setCookie = res.cookie.bind(res);
		res.cookie = function (name: string, value: any, options?: any): Response {
			return name === 'visitorid' ? setCookie('__session', value, options) : setCookie(name, value, options);
		} as typeof res.cookie;

		const clearCookie = res.clearCookie.bind(res);
		res.clearCookie = function (name: string, options?: any): Response {
			return name === 'visitorid' ? clearCookie('__session', options) : clearCookie(name, options);
		} as typeof res.clearCookie;

		next();
	};
};
