var { z } = require('zod');

var email = z.string()
  .trim()
  .toLowerCase()
  .max(255, 'Email must be at most 255 characters')
  .email('Enter a valid email address');

var username = z.string()
  .trim()
  .min(1, 'Enter a display name')
  .max(100, 'Display name must be at most 100 characters');

var newPassword = z.string()
  .min(8, 'Password must be at least 8 characters')
  .refine(function (value) {
    return Buffer.byteLength(value, 'utf8') <= 72;
  }, 'Password must be at most 72 bytes');

var signupSchema = z.object({ username: username, email: email, password: newPassword });
var loginSchema = z.object({ email: email, password: z.string().min(1, 'Enter your password') });
var googleSchema = z.object({ idToken: z.string().min(1, 'idToken is required') });
var refreshSchema = z.object({ refreshToken: z.string().min(1, 'refreshToken is required') });
var updateMeSchema = z.object({ username: username });

module.exports = { signupSchema, loginSchema, googleSchema, refreshSchema, updateMeSchema };
