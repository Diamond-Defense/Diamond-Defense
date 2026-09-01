import { Buffer } from 'node:buffer';
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';

export const MAX_PASSWORD_ITERATIONS = 100000;
export const MINIMUM_ACCOUNT_PASSWORD_LENGTH = 8;
export const MAXIMUM_ACCOUNT_PASSWORD_LENGTH = 1024;

export function validateAccountPassword(passwordValue: unknown): string {
  const password = String(passwordValue || '');
  if (password.length < MINIMUM_ACCOUNT_PASSWORD_LENGTH) {
    throw new Error(
      `Passwords must contain at least ${MINIMUM_ACCOUNT_PASSWORD_LENGTH} characters.`,
    );
  }
  if (password.length > MAXIMUM_ACCOUNT_PASSWORD_LENGTH) {
    throw new Error('Passwords must contain 1024 characters or fewer.');
  }
  return password;
}

function derivePasswordBytes(
  password: string,
  salt: Buffer,
  iterations: number,
): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    pbkdf2(password, salt, iterations, 32, 'sha256', (error, derivedKey) => {
      if (error) reject(error);
      else resolve(derivedKey);
    });
  });
}

export async function derivePasswordHash(
  password: string,
  saltBase64: string,
  iterations: number,
): Promise<string> {
  const derivedKey = await derivePasswordBytes(
    password,
    Buffer.from(saltBase64, 'base64'),
    iterations,
  );
  return derivedKey.toString('base64');
}

export async function createPasswordHash(
  password: string,
  iterations = MAX_PASSWORD_ITERATIONS,
): Promise<{ hash: string; salt: string; iterations: number }> {
  const salt = randomBytes(16).toString('base64');
  return {
    hash: await derivePasswordHash(password, salt, iterations),
    salt,
    iterations,
  };
}

export async function verifyPassword(
  password: string,
  expectedHash: string,
  salt: string,
  iterations: number,
): Promise<boolean> {
  if (!Number.isInteger(iterations) || iterations < 1 || iterations > MAX_PASSWORD_ITERATIONS) {
    throw new Error(
      `Unsupported password record: PBKDF2 iterations must be between 1 and ${MAX_PASSWORD_ITERATIONS}.`,
    );
  }
  const actual = Buffer.from(
    await derivePasswordHash(password, salt, iterations),
    'base64',
  );
  const expected = Buffer.from(expectedHash, 'base64');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
