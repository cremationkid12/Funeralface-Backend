/**
 * Numeric email OTP length for password reset. Matches Supabase hosted GoTrue
 * default (8 digits). GoTrue supports 6–10; change this constant if your project differs.
 */
export const PASSWORD_RESET_MAILER_OTP_DIGITS = 8;

export function mailerOtpDigits(): number {
  return PASSWORD_RESET_MAILER_OTP_DIGITS;
}

export function isValidNumericMailerOtp(token: string): boolean {
  const len = mailerOtpDigits();
  if (token.length !== len) return false;
  return /^\d+$/.test(token);
}
