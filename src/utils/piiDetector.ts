/**
 * PII and Sensitive Data Detector & Masking Utility
 * Supports pattern matching for passwords, tokens, secrets, personal identifiers,
 * financial credentials, and contact details.
 */

const PASSWORD_SECRET_REGEX = /^(.*_)?(password|passwd|pwd|secret|token|api_?key|access_?token|refresh_?token|auth_?token|private_?key|credential)(_.*)?$/i;
const IDENTIFIER_REGEX = /^(.*_)?(ssn|social_?security(_?number)?|national_?id|citizen_?id|tax_?id|passport(_?number)?)(_.*)?$/i;
const FINANCIAL_REGEX = /^(.*_)?(credit_?card|card_?num(ber)?|cvv|cvc|iban|bank_?account)(_.*)?$/i;
const CONTACT_REGEX = /^(.*_)?(email|phone(_?number)?|telephone|mobile(_?no)?)(_.*)?$/i;

/**
 * Checks whether a column name represents sensitive personal or security data.
 */
export function isSensitiveColumn(columnName: string): boolean {
  if (!columnName) return false;
  const name = columnName.trim();
  return (
    PASSWORD_SECRET_REGEX.test(name) ||
    IDENTIFIER_REGEX.test(name) ||
    FINANCIAL_REGEX.test(name) ||
    CONTACT_REGEX.test(name)
  );
}

/**
 * Returns a list of column names that match sensitive PII / credential patterns.
 */
export function detectSensitiveColumns(columnNames: string[]): string[] {
  return columnNames.filter(isSensitiveColumn);
}

/**
 * Masks a sensitive cell value based on its column classification.
 */
export function maskCellValue(val: unknown, columnName?: string): string {
  if (val === null || val === undefined) {
    return 'NULL';
  }

  const str = String(val);
  if (str === '') return '';

  const col = (columnName || '').trim();

  // 1. Password / Secret / Token: Full Mask
  if (PASSWORD_SECRET_REGEX.test(col)) {
    return '••••••••';
  }

  // 2. Email: Partial Mask (keep first letter and domain, e.g. j•••••••e@example.com)
  if (/email/i.test(col)) {
    const parts = str.split('@');
    if (parts.length === 2 && parts[0] && parts[1]) {
      const [local, domain] = parts;
      if (local.length <= 2) {
        return `•@${domain}`;
      }
      const first = local[0];
      const last = local[local.length - 1];
      const maskedMiddle = '•'.repeat(Math.max(1, local.length - 2));
      return `${first}${maskedMiddle}${last}@${domain}`;
    }
    return '••••••••';
  }

  // 3. Financial: Credit Card / CVV
  if (/cvv|cvc/i.test(col)) {
    return '•'.repeat(str.length);
  }
  if (FINANCIAL_REGEX.test(col)) {
    // If formatted like 1234-5678-9876-5432 or 1234 5678 9876 5432
    if (str.includes('-')) {
      const parts = str.split('-');
      if (parts.length > 1) {
        const masked = parts.slice(0, -1).map(() => '••••').join('-');
        return `${masked}-${parts[parts.length - 1]}`;
      }
    }
    if (str.includes(' ')) {
      const parts = str.split(' ');
      if (parts.length > 1) {
        const masked = parts.slice(0, -1).map(() => '••••').join(' ');
        return `${masked} ${parts[parts.length - 1]}`;
      }
    }
    if (str.length >= 8) {
      const last4 = str.slice(-4);
      return '•'.repeat(str.length - 4) + last4;
    }
    return '••••••••';
  }

  // 4. Personal Identifiers (SSN, Citizen ID)
  if (IDENTIFIER_REGEX.test(col)) {
    if (str.includes('-')) {
      const parts = str.split('-');
      const masked = parts.slice(0, -1).map((p) => '•'.repeat(p.length)).join('-');
      return `${masked}-${parts[parts.length - 1]}`;
    }
    if (str.length > 4) {
      const last4 = str.slice(-4);
      return '•'.repeat(str.length - 4) + last4;
    }
    return '••••••••';
  }

  // 5. Contact (Phone, Mobile)
  if (CONTACT_REGEX.test(col)) {
    if (str.length > 4) {
      const last4 = str.slice(-4);
      return '•'.repeat(str.length - 4) + last4;
    }
    return '••••••••';
  }

  // Fallback for any other sensitive match
  return '••••••••';
}
