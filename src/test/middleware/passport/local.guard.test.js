/* eslint-env jest */

const {
  ensureAuthenticated,
  ensureAdmin,
} = require('../../../server/middleware/passport/local');

function createRes() {
  return {
    statusCode: null,
    body: null,
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
  };
}

test('ensureAuthenticated calls next when authenticated, else 401', () => {
  const next = jest.fn();
  const res = createRes();
  const authedReq = { isAuthenticated: () => true };
  ensureAuthenticated(authedReq, res, next);
  expect(next).toHaveBeenCalledTimes(1);

  const res2 = createRes();
  const next2 = jest.fn();
  const unauthReq = { isAuthenticated: () => false };
  ensureAuthenticated(unauthReq, res2, next2);
  expect(next2).not.toHaveBeenCalled();
  expect(res2.statusCode).toBe(401);
  expect(res2.body).toEqual({ error: 'Unauthorized' });
});

test('ensureAdmin enforces auth and admin role', () => {
  const res = createRes();
  const next = jest.fn();
  const unauthReq = { isAuthenticated: () => false, user: null };
  ensureAdmin(unauthReq, res, next);
  expect(next).not.toHaveBeenCalled();
  expect(res.statusCode).toBe(403);

  const res2 = createRes();
  const next2 = jest.fn();
  const nonAdminReq = { isAuthenticated: () => true, user: { type: 'user' } };
  ensureAdmin(nonAdminReq, res2, next2);
  expect(next2).not.toHaveBeenCalled();
  expect(res2.statusCode).toBe(403);

  const res3 = createRes();
  const next3 = jest.fn();
  const adminReq = { isAuthenticated: () => true, user: { type: 'admin' } };
  ensureAdmin(adminReq, res3, next3);
  expect(next3).toHaveBeenCalledTimes(1);
});
