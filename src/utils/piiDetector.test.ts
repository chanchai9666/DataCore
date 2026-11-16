import { describe, it, expect } from 'vitest';
import { isSensitiveColumn, maskCellValue, detectSensitiveColumns } from './piiDetector';

describe('piiDetector', () => {
  describe('isSensitiveColumn', () => {
    it('detects password and secret columns', () => {
      expect(isSensitiveColumn('password')).toBe(true);
      expect(isSensitiveColumn('user_password')).toBe(true);
      expect(isSensitiveColumn('passwd')).toBe(true);
      expect(isSensitiveColumn('client_secret')).toBe(true);
      expect(isSensitiveColumn('api_token')).toBe(true);
      expect(isSensitiveColumn('access_token')).toBe(true);
      expect(isSensitiveColumn('auth_token')).toBe(true);
      expect(isSensitiveColumn('private_key')).toBe(true);
      expect(isSensitiveColumn('apiKey')).toBe(true);
    });

    it('detects government & personal identification columns', () => {
      expect(isSensitiveColumn('ssn')).toBe(true);
      expect(isSensitiveColumn('social_security_number')).toBe(true);
      expect(isSensitiveColumn('national_id')).toBe(true);
      expect(isSensitiveColumn('citizen_id')).toBe(true);
      expect(isSensitiveColumn('tax_id')).toBe(true);
      expect(isSensitiveColumn('passport_number')).toBe(true);
    });

    it('detects financial sensitive columns', () => {
      expect(isSensitiveColumn('credit_card')).toBe(true);
      expect(isSensitiveColumn('card_number')).toBe(true);
      expect(isSensitiveColumn('cvv')).toBe(true);
      expect(isSensitiveColumn('cvc')).toBe(true);
      expect(isSensitiveColumn('iban')).toBe(true);
      expect(isSensitiveColumn('bank_account')).toBe(true);
    });

    it('detects contact PII columns', () => {
      expect(isSensitiveColumn('email')).toBe(true);
      expect(isSensitiveColumn('user_email')).toBe(true);
      expect(isSensitiveColumn('phone_number')).toBe(true);
      expect(isSensitiveColumn('telephone')).toBe(true);
      expect(isSensitiveColumn('mobile_no')).toBe(true);
    });

    it('returns false for normal business columns', () => {
      expect(isSensitiveColumn('id')).toBe(false);
      expect(isSensitiveColumn('name')).toBe(false);
      expect(isSensitiveColumn('title')).toBe(false);
      expect(isSensitiveColumn('created_at')).toBe(false);
      expect(isSensitiveColumn('price')).toBe(false);
      expect(isSensitiveColumn('status')).toBe(false);
      expect(isSensitiveColumn('description')).toBe(false);
    });
  });

  describe('maskCellValue', () => {
    it('masks password and token values completely', () => {
      expect(maskCellValue('supersecret123', 'password')).toBe('••••••••');
      expect(maskCellValue('ghp_abcdef123456', 'api_token')).toBe('••••••••');
      expect(maskCellValue('some_secret', 'secret')).toBe('••••••••');
    });

    it('masks email partially preserving structure', () => {
      expect(maskCellValue('john.doe@example.com', 'email')).toBe('j••••••e@example.com');
      expect(maskCellValue('a@b.com', 'email')).toBe('•@b.com');
      expect(maskCellValue('not-an-email', 'email')).toBe('••••••••');
    });

    it('masks credit card preserving last 4 digits if available', () => {
      expect(maskCellValue('1234-5678-9876-5432', 'credit_card')).toBe('••••-••••-••••-5432');
      expect(maskCellValue('1234 5678 9876 5432', 'credit_card')).toBe('•••• •••• •••• 5432');
      expect(maskCellValue('1234567898765432', 'card_number')).toBe('••••••••••••5432');
      expect(maskCellValue('123', 'cvv')).toBe('•••');
    });

    it('masks phone numbers preserving last 4 digits', () => {
      expect(maskCellValue('+66812345678', 'phone')).toBe('••••••••5678');
      expect(maskCellValue('0812345678', 'mobile')).toBe('••••••5678');
    });

    it('masks national ID / SSN preserving last 4 digits', () => {
      expect(maskCellValue('123-45-6789', 'ssn')).toBe('•••-••-6789');
      expect(maskCellValue('1234567890123', 'citizen_id')).toBe('•••••••••0123');
    });

    it('handles null, undefined or empty strings safely', () => {
      expect(maskCellValue(null, 'password')).toBe('NULL');
      expect(maskCellValue(undefined, 'password')).toBe('NULL');
      expect(maskCellValue('', 'password')).toBe('');
    });
  });

  describe('detectSensitiveColumns', () => {
    it('identifies sensitive columns in a column list', () => {
      const cols = [
        { name: 'id' },
        { name: 'username' },
        { name: 'password_hash' },
        { name: 'email' },
        { name: 'created_at' },
      ];
      const sensitive = detectSensitiveColumns(cols.map((c) => c.name));
      expect(sensitive).toEqual(['password_hash', 'email']);
    });
  });
});
