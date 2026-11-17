import { describe, it, expect } from 'vitest';
import { encrypt, decrypt } from '../src/utils/crypto.js';

describe('AES-256-GCM Credential Encryption & Decryption', () => {
  it('encrypts plaintext into iv:authTag:ciphertext format', () => {
    const secret = 'MinecraftSuperPassword123!';
    const encrypted = encrypt(secret);

    expect(encrypted).not.toBe(secret);
    const parts = encrypted.split(':');
    expect(parts.length).toBe(3);
    expect(parts[0]?.length).toBeGreaterThan(0);
    expect(parts[1]?.length).toBeGreaterThan(0);
    expect(parts[2]?.length).toBeGreaterThan(0);
  });

  it('successfully decrypts encrypted ciphertext back to exact original string', () => {
    const original = 'PikaNetworkPlayerAccount_99';
    const encrypted = encrypt(original);
    const decrypted = decrypt(encrypted);

    expect(decrypted).toBe(original);
  });

  it('fails decryption when ciphertext has been tampered with', () => {
    const original = 'SecretCredentials';
    const encrypted = encrypt(original);
    const parts = encrypted.split(':');

    // Tamper with ciphertext
    const tampered = `${parts[0]}:${parts[1]}:AAAAAA==`;
    expect(() => decrypt(tampered)).toThrow();
  });
});
