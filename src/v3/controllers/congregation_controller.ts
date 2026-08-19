import fetch from 'node-fetch';
import { Request, Response } from 'express';
import { validationResult } from 'express-validator';
import { CongregationsList } from '../classes/Congregations.js';
import { formatError } from '../utils/format_log.js';
import { StandardRecord } from '../definition/app.js';
import { MailClient } from '../config/mail_config.js';

const MAIL_ENABLED = process.env.MAIL_ENABLED === 'true';

const CREATION_COUNTRY_CODE = 'BRA';
const CREATION_COUNTRY_GUID = 'a752410b-295d-43d6-9aa0-5b3fa0ba7ec3';

export const getCountries = async (req: Request, res: Response) => {
	const errors = validationResult(req);

	if (!errors.isEmpty()) {
		const msg = formatError(errors);

		res.locals.type = 'warn';
		res.locals.message = `invalid input: ${msg}`;

		res.status(400).json({ message: 'error_api_bad-request' });

		return;
	}

	const language = (req.query.language as string) || 'E';

	const url = process.env.APP_COUNTRY_API! + new URLSearchParams({ language });

	const response = await fetch(url);

	if (!response.ok) {
		res.locals.type = 'warn';
		res.locals.message = 'an error occured while getting list of all countries';
		res.status(response.status).json({ message: 'FETCH_FAILED' });
		return;
	}

	const countriesList = await response.json();
	res.locals.type = 'info';
	res.locals.message = 'user fetched all countries';
	res.status(200).json(countriesList);
};

export const getCongregations = async (req: Request, res: Response) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		const msg = formatError(errors);

		res.locals.type = 'warn';
		res.locals.message = `invalid input: ${msg}`;

		res.status(400).json({ message: 'error_api_bad-request' });

		return;
	}

	const language = (req.query.language as string) || 'E';
	const name = req.query.name as string;
	let country = req.query.country as string;

	if (name.length < 2 || country?.length === 0) {
		res.locals.type = 'warn';
		res.locals.message = `country or name is invalid`;

		res.status(400).json({
			message: 'error_api_bad-request',
		});

		return;
	}

	country = country.toUpperCase();

	const url = process.env.APP_CONGREGATION_API! + new URLSearchParams({ country, language, name });

	const response = await fetch(url);

	if (!response.ok) {
		res.locals.type = 'warn';
		res.locals.message = 'an error occured while getting congregations list';
		res.status(response.status).json({ message: 'FETCH_FAILED' });
		return;
	}

	const congsList = await response.json();

	res.locals.type = 'info';
	res.locals.message = 'user fetched congregations';
	res.status(200).json(congsList);
};

export const createCongregation = async (req: Request, res: Response) => {
	const errors = validationResult(req);
	if (!errors.isEmpty()) {
		const msg = formatError(errors);

		res.locals.type = 'warn';
		res.locals.message = `invalid input: ${msg}`;

		res.status(400).json({ message: 'error_api_bad-request' });

		return;
	}

	const { firstname, lastname } = req.body as Record<string, string>;
	const cong_name = String(req.body.cong_name ?? '').trim();

	if (cong_name.length === 0) {
		res.locals.type = 'warn';
		res.locals.message = 'invalid input: congregation name is empty';
		res.status(400).json({ message: 'error_api_bad-request' });
		return;
	}

	// find congregation
	const cong = CongregationsList.findByCountryAndName(
		CREATION_COUNTRY_GUID,
		cong_name,
		CREATION_COUNTRY_CODE
	);

	if (cong) {
		res.locals.type = 'warn';
		res.locals.message = 'the congregation requested already exists';
		res.status(404).json({ message: 'CONG_EXISTS' });

		return;
	}

	// language header is still consumed below by the welcome-email i18n change
	const language = (req.headers.language as string) || 'eng';

	// update user details
	const user = res.locals.currentUser;

	const profile = structuredClone(user.profile);
	profile.firstname = { value: firstname, updatedAt: new Date().toISOString() };
	profile.lastname = { value: lastname, updatedAt: new Date().toISOString() };

	await user.updateProfile(profile);

	// create congregation with empty/default meeting fields — filled later in Congregation Settings (D-01)
	const congId = await CongregationsList.create({
		cong_name,
		country_guid: CREATION_COUNTRY_GUID,
		country_code: CREATION_COUNTRY_CODE,
		cong_guid: '',
		cong_circuit: '',
		cong_location: { address: '', lat: 0, lng: 0 },
		midweek_meeting: { time: '', weekday: 0 },
		weekend_meeting: { time: '', weekday: 0 },
	});

	// add user to congregation
	const userCong = await user.assignCongregation({ congId: congId, role: ['admin'] });

	if (MAIL_ENABLED) {
		req.i18n.changeLanguage(language);

		const options = {
			to: user.email,
			subject: req.t('tr_welcomeTitle'),
			template: 'welcome',
			context: {
				welcomeTitle: req.t('tr_welcomeTitle'),
				welcomeDesc: req.t('tr_welcomeDesc'),
				watchVideoLabel: req.t('tr_watchVideoLabel'),
				moreInfoTitle: req.t('tr_moreInfoTitle'),
				moreInfoGuideLabel: req.t('tr_moreInfoGuideLabel'),
				moreInfoBlogLabel: req.t('tr_moreInfoBlogLabel'),
				moreInfoSupportLabel: req.t('tr_moreInfoSupportLabel'),
				copyright: new Date().getFullYear(),
			},
		};

		MailClient.sendEmail(options, 'Welcome message sent to user');
	}

	const finalResult = {
		user_id: user.id,
		cong_id: userCong.id,
		firstname: user.profile.firstname.value,
		lastname: user.profile.lastname.value,
		cong_settings: userCong.settings,
	};

	res.locals.type = 'info';
	res.locals.message = 'congregation created successfully';
	res.status(200).json(finalResult);
};

export const updateApplicationApproval = async (req: Request, res: Response) => {
	const { id, request } = req.params;

	if (!id || id === 'undefined') {
		res.locals.type = 'warn';
		res.locals.message = 'the congregation request id params is undefined';
		res.status(400).json({ message: 'REQUEST_ID_INVALID' });
		return;
	}

	if (!request) {
		res.locals.type = 'warn';
		res.locals.message = 'the application request id params is undefined';
		res.status(400).json({ message: 'REQUEST_ID_INVALID' });
		return;
	}

	const cong = CongregationsList.findById(id);

	if (!cong) {
		res.locals.type = 'warn';
		res.locals.message = 'no congregation could not be found with the provided id';
		res.status(404).json({ message: 'error_app_congregation_not-found' });
		return;
	}

	const isValid = cong.hasMember(res.locals.currentUser.id);

	if (!isValid) {
		res.locals.type = 'warn';
		res.locals.message = 'user not authorized to access the provided congregation';
		res.status(403).json({ message: 'error_api_unauthorized-request' });
		return;
	}

	const user = res.locals.currentUser;

	const roles = user.profile.congregation!.cong_role;

	const adminRole = roles.includes('admin');
	const coordinatorRole = roles.includes('coordinator');
	const secretaryRole = roles.includes('secretary');
	const serviceRole = roles.includes('service_overseer');

	const committeeRole = adminRole || coordinatorRole || secretaryRole || serviceRole;

	if (!committeeRole) {
		res.locals.type = 'warn';
		res.locals.message = 'user not authorized to process this application';
		res.status(403).json({ message: 'error_api_unauthorized-request' });
		return;
	}

	const application = req.body.application as StandardRecord;

	await cong.saveApplication(application);

	const result = cong.ap_applications;

	res.locals.type = 'info';
	res.locals.message = 'user updated application approval';
	res.status(200).json(result);
};

export const deleteApplication = async (req: Request, res: Response) => {
	const { id, request } = req.params;

	if (!id || id === 'undefined') {
		res.locals.type = 'warn';
		res.locals.message = 'the congregation request id params is undefined';
		res.status(400).json({ message: 'REQUEST_ID_INVALID' });
		return;
	}

	if (!request) {
		res.locals.type = 'warn';
		res.locals.message = 'the application request id params is undefined';
		res.status(400).json({ message: 'REQUEST_ID_INVALID' });
		return;
	}

	const cong = CongregationsList.findById(id);

	if (!cong) {
		res.locals.type = 'warn';
		res.locals.message = 'no congregation could not be found with the provided id';
		res.status(404).json({ message: 'error_app_congregation_not-found' });
		return;
	}

	const isValid = cong.hasMember(res.locals.currentUser.id);

	if (!isValid) {
		res.locals.type = 'warn';
		res.locals.message = 'user not authorized to access the provided congregation';
		res.status(403).json({ message: 'error_api_unauthorized-request' });
		return;
	}

	const user = res.locals.currentUser;

	const roles = user.profile.congregation!.cong_role;

	const adminRole = roles.includes('admin');
	const coordinatorRole = roles.includes('coordinator');
	const secretaryRole = roles.includes('secretary');
	const serviceRole = roles.includes('service_overseer');

	const committeeRole = adminRole || coordinatorRole || secretaryRole || serviceRole;

	if (!committeeRole) {
		res.locals.type = 'warn';
		res.locals.message = 'user not authorized to process this application';
		res.status(403).json({ message: 'error_api_unauthorized-request' });
		return;
	}

	const result = await cong.deleteApplication(request);

	res.locals.type = 'info';
	res.locals.message = 'user deleted application';
	res.status(200).json(result);
};
