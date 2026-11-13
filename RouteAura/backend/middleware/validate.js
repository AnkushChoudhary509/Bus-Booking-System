import { AppError } from '../utils/AppError.js';

/** validate({ body: zodSchema, query: zodSchema, params: zodSchema }) */
export const validate = (schemas) => (req, res, next) => {
  for (const key of ['body', 'query', 'params']) {
    if (!schemas[key]) continue;
    const result = schemas[key].safeParse(req[key]);
    if (!result.success) {
      const errors = result.error.issues.map((i) => ({ field: i.path.join('.'), message: i.message }));
      throw new AppError(errors[0] ? `${errors[0].field ? errors[0].field + ': ' : ''}${errors[0].message}` : 'Invalid request', 422, errors);
    }
    if (key === 'query') {
      // Express 5 makes req.query read-only; keep parsed values separately
      req.validatedQuery = result.data;
    } else {
      req[key] = result.data;
    }
  }
  next();
};
