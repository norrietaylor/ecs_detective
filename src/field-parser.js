import { parse } from 'csv-parse/sync';
import chalk from 'chalk';
import { ESClientParser } from './es-client-parser.js';
import {
  isValidESFieldName as utilIsValidESFieldName,
  isCommonAPIPattern as utilIsCommonAPIPattern,
  isValidExtractedFieldName as utilIsValidExtractedFieldName,
  isECSFieldKeyFormat as utilIsECSFieldKeyFormat,
  isValidGeneralFieldName as utilIsValidGeneralFieldName,
} from './utils/field-utils.js';

export class FieldParser {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
    this.esClientParser = new ESClientParser({ verbose: this.verbose });
  }

  parseECSFields(csvContent) {
    try {
      if (this.verbose) {
        console.log(chalk.blue('📋 Parsing ECS fields CSV...'));
      }

      const records = parse(csvContent, {
        columns: true,
        skip_empty_lines: true,
        trim: true
      });

      // Extract field names from the CSV
      // ECS CSV structure typically has a 'field' column with dot-notation field names
      const coreFields = new Set();
      
      for (const record of records) {
        // The field name can be in 'field', 'Field', or other similar columns
        const fieldValue = record.field || record.Field || record.FIELD;
        if (fieldValue && fieldValue.trim()) {
          const fieldName = fieldValue.trim();
          // Only add valid ECS field names
          if (this.isValidECSFieldName(fieldName)) {
            coreFields.add(fieldName);
          }
        }
      }

      if (this.verbose) {
        console.log(chalk.green(`✅ Parsed ${coreFields.size} core ECS fields`));
        if (this.verbose && coreFields.size > 0) {
          console.log(chalk.gray(`Sample fields: ${Array.from(coreFields).slice(0, 5).join(', ')}...`));
        }
      }

      return coreFields;
    } catch (error) {
      throw new Error(`Failed to parse ECS fields CSV: ${error.message}`);
    }
  }

  isECSField(fieldName, coreFields) {
    if (!fieldName || typeof fieldName !== 'string') {
      return false;
    }

    // Direct match
    if (coreFields.has(fieldName)) {
      return true;
    }

    // Check for partial matches - field might be a sub-field
    // For example, if we have "user.name" in core fields and find "user.name.keyword"
    for (const coreField of coreFields) {
      if (fieldName.startsWith(coreField + '.')) {
        return true;
      }
    }

    return false;
  }

  extractFieldsFromContent(content, filePath) {
    const fields = new Set();
    const fileExt = filePath.split('.').pop().toLowerCase();

    try {
      switch (fileExt) {
        case 'js':
        case 'ts':
        case 'tsx':
        case 'jsx':
          this.extractFromJavaScript(content, fields, filePath);
          break;
        case 'json':
          this.extractFromJSON(content, fields);
          break;
        case 'yml':
        case 'yaml':
          this.extractFromYAML(content, fields);
          break;
        default:
          // For other file types, try general text extraction
          this.extractFromText(content, fields);
      }
    } catch (error) {
      if (this.verbose) {
        console.log(chalk.yellow(`⚠️  Error parsing ${filePath}: ${error.message}`));
      }
    }

    return Array.from(fields);
  }

  extractFromJavaScript(content, fields, filePath) {
    // Use ES client analysis for ALL JavaScript and TypeScript files
    const esClientFields = this.esClientParser.extractESClientFields(content, filePath);
    esClientFields.forEach(field => {
      if (utilIsValidESFieldName(field)) {
        fields.add(field);
      }
    });
    
    // For TypeScript files, also extract from ES document interfaces
    const isTypeScript = filePath && (filePath.endsWith('.ts') || filePath.endsWith('.tsx'));
    if (isTypeScript) {
      // Extract from TypeScript interfaces and types ONLY if they look like ES document types
      this.extractFromESDocumentInterfaces(content, fields);
    }

    // Extract fields from explicit Elasticsearch contexts
    this.extractFromExplicitESContexts(content, fields);
    
    // Extract field patterns with improved filtering to avoid JS API calls
    const fieldPatterns = [
      // Quoted strings (keep original pattern but exclude @timestamp from validation)
      /['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)['"']/g,
      // Property access - but more restrictive to avoid JS API calls
      // Only match patterns that look like ECS fields (at least one dot, not starting with common API prefixes)
      /\b([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)\b/g
    ];

    this.extractWithPatterns(content, fields, fieldPatterns);
  }

  extractFromESDocumentInterfaces(content, fields) {
    // Only extract from interfaces that clearly represent ES documents
    const esDocumentPatterns = [
      // Interfaces with ES-like names
      /interface\s+(\w*(?:Document|Doc|Event|Log|Alert|Finding|Hit|Source)\w*)\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gi,
      // Types with ES-like names  
      /type\s+(\w*(?:Document|Doc|Event|Log|Alert|Finding|Hit|Source)\w*)\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gi
    ];

    for (const pattern of esDocumentPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const interfaceBody = match[2];
        this.esClientParser.extractFieldsFromTypescriptInterfaces(`interface ${match[1]} {${interfaceBody}}`, fields);
      }
    }
  }

  extractFromExplicitESContexts(content, fields) {
    // ONLY extract fields from explicit, unambiguous Elasticsearch contexts
    // Removed overly broad patterns that catch general JavaScript property access
    const esContextPatterns = [
      // ES query contexts: { term: { 'field.name': value } }
      /\bterm\s*:\s*\{\s*['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']\s*:/g,
      // ES query contexts: { match: { 'field.name': value } }
      /\bmatch\s*:\s*\{\s*['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']\s*:/g,
      // ES query contexts: { range: { 'field.name': {...} } }
      /\brange\s*:\s*\{\s*['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']\s*:/g,
      // ES aggregation contexts: { field: 'field.name' }
      /\bfield\s*:\s*['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']/g,
      // ES sort contexts: { 'field.name': { order: 'asc' } }
      /\bsort\s*:\s*\[?\s*\{\s*['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']\s*:/g,
      // ES script field access: doc['field.name'].value
      /\bdoc\s*\[\s*['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']\s*\]/g,
      // ES _source field access: _source['field.name']
      /\b_source\s*\[\s*['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']\s*\]/g,
      // ES exists query: { exists: { field: 'field.name' } }
      /\bexists\s*:\s*\{\s*field\s*:\s*['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']/g,
      // ES mapping contexts: 'field.name': { type: 'keyword' }
      /['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']\s*:\s*\{\s*[^}]*(?:type|properties)\s*:/g
      // REMOVED: Overly broad patterns that match general JavaScript property access
      // REMOVED: /['"']([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']/g
      // REMOVED: /\b([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)\b/g
    ];

    for (const pattern of esContextPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const fieldName = match[1];
        if (utilIsValidESFieldName(fieldName) && !utilIsCommonAPIPattern(fieldName)) {
          fields.add(fieldName);
        }
      }
    }
  }

  extractFromJSON(content, fields) {
    try {
      const obj = JSON.parse(content);
      this.extractFromObject(obj, fields);
    } catch (error) {
      // If JSON parsing fails, fall back to text extraction
      this.extractFromText(content, fields);
    }
  }

  extractFromYAML(content, fields) {
    // Simple YAML field extraction - look for key: value patterns
    const patterns = [
      /^[\s]*([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)\s*:/gm,
      /['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)['"']/g
    ];

    this.extractWithPatterns(content, fields, patterns);
  }

  extractFromText(content, fields) {
    // General text patterns for field-like strings
    const patterns = [
      /['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)['"']/g,
      /\b([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)\b/g
    ];

    this.extractWithPatterns(content, fields, patterns);
  }

  extractFromObject(obj, fields, prefix = '') {
    if (typeof obj !== 'object' || obj === null) {
      return;
    }

    if (Array.isArray(obj)) {
      obj.forEach(item => this.extractFromObject(item, fields, prefix));
      return;
    }

    // Check if this is an Elasticsearch mapping definition
    if (this.isMappingDefinition(obj, prefix)) {
      this.extractFromMappingDefinition(obj, fields);
      return;
    }

    for (const [key, value] of Object.entries(obj)) {
      const fullKey = prefix ? `${prefix}.${key}` : key;
      
      // Only consider keys as ES fields if they have ES-like structure
      if (utilIsValidESFieldName(key)) {
        fields.add(key);
      }
      
      // For nested objects, also check the full path
      if (prefix && utilIsValidESFieldName(fullKey)) {
        fields.add(fullKey);
      }

      // If value is a string that looks like an ES field name, add it
      if (typeof value === 'string' && utilIsValidESFieldName(value)) {
        fields.add(value);
      }

      // Recurse into nested objects
      if (typeof value === 'object' && value !== null) {
        this.extractFromObject(value, fields, fullKey);
      }
    }
  }

  /**
   * Check if an object represents an Elasticsearch mapping definition
   */
  isMappingDefinition(obj, prefix = '') {
    // Check if we're at the root level with a "mappings" key
    if (obj.mappings && obj.mappings.properties) {
      return true;
    }
    
    // Check if we're already inside a mappings structure
    if (prefix.includes('mappings') && obj.properties) {
      return true;
    }
    
    return false;
  }

  /**
   * Extract field names from Elasticsearch mapping definitions
   * This method extracts only the actual field paths, not the mapping structure
   */
  extractFromMappingDefinition(obj, fields, fieldPath = '') {
    // Start from mappings.properties if at root level
    if (obj.mappings && obj.mappings.properties) {
      this.extractFromMappingDefinition(obj.mappings.properties, fields, '');
      return;
    }

    // If this object has properties, it's a field definition container
    if (obj.properties) {
      this.extractFromMappingDefinition(obj.properties, fields, fieldPath);
      return;
    }

    // Process each field in the current level
    for (const [fieldName, fieldDef] of Object.entries(obj)) {
      const currentFieldPath = fieldPath ? `${fieldPath}.${fieldName}` : fieldName;
      
      // If this field definition has nested properties, recurse
      if (fieldDef && typeof fieldDef === 'object' && fieldDef.properties) {
        this.extractFromMappingDefinition(fieldDef.properties, fields, currentFieldPath);
      } else if (fieldDef && typeof fieldDef === 'object' && fieldDef.type) {
        // This is a leaf field definition with a type - add the field path
        if (utilIsValidESFieldName(currentFieldPath)) {
          fields.add(currentFieldPath);
        }
      } else if (this.isValidESFieldName(currentFieldPath)) {
        // Add the field path even if it doesn't have an explicit type
        fields.add(currentFieldPath);
      }
    }
  }

  extractWithPatterns(content, fields, patterns) {
    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const fieldName = match[1];
        if (fieldName && utilIsValidESFieldName(fieldName)) {
          fields.add(fieldName);
        }
      }
    }
  }

  isValidFieldName(fieldName) {
    if (!fieldName || typeof fieldName !== 'string') {
      return false;
    }

    // Basic validation for field names - allow both simple names and dot-notation
    // ECS fields can be simple like "message" or complex like "user.name"
    // Note: @ and leading dots are not allowed in basic validation
    const isValid = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(fieldName) &&
                   fieldName.length > 1; // Minimum length

    // For extraction purposes, we're particularly interested in dot-notation fields
    // but we'll also accept simple field names that are longer than 2 characters
    return isValid && (fieldName.includes('.') || fieldName.length > 2);
  }

  // Separate validation for extracted field names that allows vendor fields
  isValidExtractedFieldName(fieldName) {
    return utilIsValidExtractedFieldName(fieldName);
  }

  isValidESFieldName(fieldName) {
    return utilIsValidESFieldName(fieldName);
  }

  isCommonAPIPattern(fieldName) {
    return utilIsCommonAPIPattern(fieldName);
  }

  isValidECSFieldName(fieldName) {
    return utilIsECSFieldKeyFormat(fieldName);
  }
}