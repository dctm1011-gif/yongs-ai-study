import AsyncStorage from '@react-native-async-storage/async-storage';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  duplicates: any[];
  checksumMatch: boolean;
}

export interface SchemaRule {
  field: string;
  type: string;
  required: boolean;
  validate?: (value: any) => boolean;
}

const ENGLISH_SCHEMA: SchemaRule[] = [
  { field: 'id', type: 'string', required: true },
  { field: 'word', type: 'string', required: true },
  { field: 'meaning', type: 'string', required: true },
  { field: 'examples', type: 'array', required: false },
  { field: 'timestamp', type: 'number', required: true },
];

const TOEFL_SCHEMA: SchemaRule[] = [
  { field: 'id', type: 'string', required: true },
  { field: 'section', type: 'string', required: true },
  { field: 'score', type: 'number', required: true },
  { field: 'date', type: 'string', required: true },
  { field: 'timestamp', type: 'number', required: true },
];

const PAPERS_SCHEMA: SchemaRule[] = [
  { field: 'id', type: 'string', required: true },
  { field: 'title', type: 'string', required: true },
  { field: 'arxivId', type: 'string', required: true },
  { field: 'status', type: 'string', required: true },
  { field: 'timestamp', type: 'number', required: true },
];

const INVESTMENT_SCHEMA: SchemaRule[] = [
  { field: 'id', type: 'string', required: true },
  { field: 'asset', type: 'string', required: true },
  { field: 'amount', type: 'number', required: true },
  { field: 'date', type: 'string', required: true },
  { field: 'timestamp', type: 'number', required: true },
];

const TRENDS_SCHEMA: SchemaRule[] = [
  { field: 'id', type: 'string', required: true },
  { field: 'title', type: 'string', required: true },
  { field: 'category', type: 'string', required: true },
  { field: 'url', type: 'string', required: false },
  { field: 'timestamp', type: 'number', required: true },
];

export class DataIntegrityValidator {
  private static calculateChecksum(data: any): string {
    try {
      const str = JSON.stringify(data);
      let hash = 0;
      for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash;
      }
      return `chk_${Math.abs(hash).toString(36)}`;
    } catch {
      return 'chk_error';
    }
  }

  private static validateSchema(item: any, schema: SchemaRule[]): string[] {
    const errors: string[] = [];

    for (const rule of schema) {
      const value = item[rule.field];

      if (rule.required && (value === undefined || value === null)) {
        errors.push(`Missing required field: ${rule.field}`);
      }

      if (value !== undefined && value !== null) {
        const actualType = Array.isArray(value) ? 'array' : typeof value;
        if (actualType !== rule.type) {
          errors.push(`Field ${rule.field} has wrong type: expected ${rule.type}, got ${actualType}`);
        }

        if (rule.validate && !rule.validate(value)) {
          errors.push(`Field ${rule.field} failed custom validation`);
        }
      }
    }

    return errors;
  }

  private static findDuplicates(items: any[], idField: string = 'id'): any[] {
    const seen = new Set<string>();
    const duplicates: any[] = [];

    for (const item of items) {
      const id = item[idField];
      if (seen.has(id)) {
        duplicates.push(item);
      } else {
        seen.add(id);
      }
    }

    return duplicates;
  }

  private static validateTimestamps(items: any[]): string[] {
    const errors: string[] = [];
    const now = Date.now();
    const maxAge = 365 * 24 * 60 * 60 * 1000; // 1 year

    for (const item of items) {
      if (item.timestamp) {
        if (item.timestamp > now + 60000) {
          // Allow 1 minute clock skew
          errors.push(`Item ${item.id} has future timestamp: ${new Date(item.timestamp).toISOString()}`);
        }

        if (now - item.timestamp > maxAge) {
          errors.push(`Item ${item.id} is older than 1 year`);
        }
      }
    }

    return errors;
  }

  static async validateEnglish(): Promise<ValidationResult> {
    try {
      const localStr = await AsyncStorage.getItem('sync_english');
      const localData = localStr ? JSON.parse(localStr) : [];

      const errors: string[] = [];
      const warnings: string[] = [];
      const allErrors: string[] = [];

      if (!Array.isArray(localData)) {
        errors.push('English data is not an array');
        return { isValid: false, errors, warnings, duplicates: [], checksumMatch: false };
      }

      // Validate schema
      for (const item of localData) {
        const schemaErrors = this.validateSchema(item, ENGLISH_SCHEMA);
        allErrors.push(...schemaErrors);
      }

      // Check for duplicates
      const duplicates = this.findDuplicates(localData);
      if (duplicates.length > 0) {
        warnings.push(`Found ${duplicates.length} duplicate words`);
      }

      // Validate timestamps
      const timestampErrors = this.validateTimestamps(localData);
      allErrors.push(...timestampErrors);

      // Check checksum against server
      const cachedChecksumStr = await AsyncStorage.getItem('sync_english_checksum');
      const checksumMatch = cachedChecksumStr === this.calculateChecksum(localData);

      return {
        isValid: errors.length === 0 && allErrors.length === 0,
        errors: [...errors, ...allErrors],
        warnings,
        duplicates,
        checksumMatch,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        isValid: false,
        errors: [errorMsg],
        warnings: [],
        duplicates: [],
        checksumMatch: false,
      };
    }
  }

  static async validateTOEFL(): Promise<ValidationResult> {
    try {
      const localStr = await AsyncStorage.getItem('sync_toefl');
      const localData = localStr ? JSON.parse(localStr) : [];

      const errors: string[] = [];
      const warnings: string[] = [];
      const allErrors: string[] = [];

      if (!Array.isArray(localData)) {
        errors.push('TOEFL data is not an array');
        return { isValid: false, errors, warnings, duplicates: [], checksumMatch: false };
      }

      // Validate schema
      for (const item of localData) {
        const schemaErrors = this.validateSchema(item, TOEFL_SCHEMA);
        allErrors.push(...schemaErrors);

        // Validate score range
        if (item.score && (item.score < 0 || item.score > 120)) {
          allErrors.push(`TOEFL score out of range (0-120): ${item.score}`);
        }
      }

      // Check for duplicates
      const duplicates = this.findDuplicates(localData);
      if (duplicates.length > 0) {
        warnings.push(`Found ${duplicates.length} duplicate sections`);
      }

      // Validate timestamps
      const timestampErrors = this.validateTimestamps(localData);
      allErrors.push(...timestampErrors);

      // Check checksum
      const cachedChecksumStr = await AsyncStorage.getItem('sync_toefl_checksum');
      const checksumMatch = cachedChecksumStr === this.calculateChecksum(localData);

      return {
        isValid: errors.length === 0 && allErrors.length === 0,
        errors: [...errors, ...allErrors],
        warnings,
        duplicates,
        checksumMatch,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        isValid: false,
        errors: [errorMsg],
        warnings: [],
        duplicates: [],
        checksumMatch: false,
      };
    }
  }

  static async validatePapers(): Promise<ValidationResult> {
    try {
      const localStr = await AsyncStorage.getItem('sync_papers');
      const localData = localStr ? JSON.parse(localStr) : [];

      const errors: string[] = [];
      const warnings: string[] = [];
      const allErrors: string[] = [];

      if (!Array.isArray(localData)) {
        errors.push('Papers data is not an array');
        return { isValid: false, errors, warnings, duplicates: [], checksumMatch: false };
      }

      // Validate schema
      for (const item of localData) {
        const schemaErrors = this.validateSchema(item, PAPERS_SCHEMA);
        allErrors.push(...schemaErrors);

        // Validate arXiv ID format
        if (item.arxivId && !/^\d{4}\.\d{5}/.test(item.arxivId)) {
          allErrors.push(`Invalid arXiv ID format: ${item.arxivId}`);
        }

        // Validate status
        if (item.status && !['reading', 'archived', 'bookmarked'].includes(item.status)) {
          warnings.push(`Unknown status: ${item.status}`);
        }
      }

      // Check for duplicates
      const duplicates = this.findDuplicates(localData);
      if (duplicates.length > 0) {
        warnings.push(`Found ${duplicates.length} duplicate papers`);
      }

      // Validate timestamps
      const timestampErrors = this.validateTimestamps(localData);
      allErrors.push(...timestampErrors);

      // Check checksum
      const cachedChecksumStr = await AsyncStorage.getItem('sync_papers_checksum');
      const checksumMatch = cachedChecksumStr === this.calculateChecksum(localData);

      return {
        isValid: errors.length === 0 && allErrors.length === 0,
        errors: [...errors, ...allErrors],
        warnings,
        duplicates,
        checksumMatch,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        isValid: false,
        errors: [errorMsg],
        warnings: [],
        duplicates: [],
        checksumMatch: false,
      };
    }
  }

  static async validateInvestment(): Promise<ValidationResult> {
    try {
      const localStr = await AsyncStorage.getItem('sync_investment');
      const localData = localStr ? JSON.parse(localStr) : [];

      const errors: string[] = [];
      const warnings: string[] = [];
      const allErrors: string[] = [];

      if (!Array.isArray(localData)) {
        errors.push('Investment data is not an array');
        return { isValid: false, errors, warnings, duplicates: [], checksumMatch: false };
      }

      // Validate schema
      for (const item of localData) {
        const schemaErrors = this.validateSchema(item, INVESTMENT_SCHEMA);
        allErrors.push(...schemaErrors);

        // Validate amount
        if (item.amount && item.amount < 0) {
          allErrors.push(`Negative investment amount: ${item.amount}`);
        }
      }

      // Check for duplicates
      const duplicates = this.findDuplicates(localData);
      if (duplicates.length > 0) {
        warnings.push(`Found ${duplicates.length} duplicate entries`);
      }

      // Validate timestamps
      const timestampErrors = this.validateTimestamps(localData);
      allErrors.push(...timestampErrors);

      // Check checksum
      const cachedChecksumStr = await AsyncStorage.getItem('sync_investment_checksum');
      const checksumMatch = cachedChecksumStr === this.calculateChecksum(localData);

      return {
        isValid: errors.length === 0 && allErrors.length === 0,
        errors: [...errors, ...allErrors],
        warnings,
        duplicates,
        checksumMatch,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        isValid: false,
        errors: [errorMsg],
        warnings: [],
        duplicates: [],
        checksumMatch: false,
      };
    }
  }

  static async validateTrends(): Promise<ValidationResult> {
    try {
      const localStr = await AsyncStorage.getItem('sync_trends');
      const localData = localStr ? JSON.parse(localStr) : [];

      const errors: string[] = [];
      const warnings: string[] = [];
      const allErrors: string[] = [];

      if (!Array.isArray(localData)) {
        errors.push('Trends data is not an array');
        return { isValid: false, errors, warnings, duplicates: [], checksumMatch: false };
      }

      // Validate schema
      for (const item of localData) {
        const schemaErrors = this.validateSchema(item, TRENDS_SCHEMA);
        allErrors.push(...schemaErrors);

        // Validate URL format if present
        if (item.url) {
          try {
            new URL(item.url);
          } catch {
            warnings.push(`Invalid URL format: ${item.url}`);
          }
        }
      }

      // Check for duplicates
      const duplicates = this.findDuplicates(localData);
      if (duplicates.length > 0) {
        warnings.push(`Found ${duplicates.length} duplicate trends`);
      }

      // Validate timestamps
      const timestampErrors = this.validateTimestamps(localData);
      allErrors.push(...timestampErrors);

      // Check checksum
      const cachedChecksumStr = await AsyncStorage.getItem('sync_trends_checksum');
      const checksumMatch = cachedChecksumStr === this.calculateChecksum(localData);

      return {
        isValid: errors.length === 0 && allErrors.length === 0,
        errors: [...errors, ...allErrors],
        warnings,
        duplicates,
        checksumMatch,
      };
    } catch (error) {
      const errorMsg = error instanceof Error ? error.message : 'Unknown error';
      return {
        isValid: false,
        errors: [errorMsg],
        warnings: [],
        duplicates: [],
        checksumMatch: false,
      };
    }
  }

  static async validateAll(): Promise<Record<string, ValidationResult>> {
    const results = {
      english: await this.validateEnglish(),
      toefl: await this.validateTOEFL(),
      papers: await this.validatePapers(),
      investment: await this.validateInvestment(),
      trends: await this.validateTrends(),
    };

    return results;
  }
}
