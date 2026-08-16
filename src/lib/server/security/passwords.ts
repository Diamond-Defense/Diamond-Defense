import { Buffer } from 'node:buffer';
import { pbkdf2, randomBytes, timingSafeEqual } from 'node:crypto';

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
  iterations = 120000,
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
  const actual = Buffer.from(
    await derivePasswordHash(password, salt, iterations),
    'base64',
  );
  const expected = Buffer.from(expectedHash, 'base64');
  return actual.length === expected.length && timingSafeEqual(actual, expected);
}
