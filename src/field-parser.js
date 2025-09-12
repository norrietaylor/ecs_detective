import { parse } from 'csv-parse/sync';
import chalk from 'chalk';
import { ESClientParser } from './es-client-parser.js';

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
    // For TypeScript files, use enhanced ES client analysis
    const isTypeScript = filePath && (filePath.endsWith('.ts') || filePath.endsWith('.tsx'));
    
    if (isTypeScript) {
      // Deep TypeScript analysis with ES client API introspection
      const esClientFields = this.esClientParser.extractESClientFields(content, filePath);
      esClientFields.forEach(field => {
        if (this.isValidESFieldName(field)) {
          fields.add(field);
        }
      });
      
      // Extract from TypeScript interfaces and types ONLY if they look like ES document types
      this.extractFromESDocumentInterfaces(content, fields);
    }

    // ONLY extract fields from Elasticsearch-specific contexts
    this.extractFromESContexts(content, fields);
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

  extractFromESContexts(content, fields) {
    // Only extract fields from clear Elasticsearch contexts
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
      /['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']\s*:\s*\{\s*[^}]*type\s*:/g,
      // Quoted field names in object properties: field: 'field.name'
      /['"']([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']/g,
      // Unquoted field references that look like ES document fields (dot notation)
      /\b([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)\b/g
    ];

    for (const pattern of esContextPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const fieldName = match[1];
        if (this.isValidESFieldName(fieldName)) {
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
      /^[\s]*([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)\s*:/gm,
      /['"']([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)['"']/g
    ];

    this.extractWithPatterns(content, fields, patterns);
  }

  extractFromText(content, fields) {
    // General text patterns for field-like strings
    const patterns = [
      /['"']([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)['"']/g,
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
      if (this.isValidESFieldName(key)) {
        fields.add(key);
      }
      
      // For nested objects, also check the full path
      if (prefix && this.isValidESFieldName(fullKey)) {
        fields.add(fullKey);
      }

      // If value is a string that looks like an ES field name, add it
      if (typeof value === 'string' && this.isValidESFieldName(value)) {
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
        if (this.isValidESFieldName(currentFieldPath)) {
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
        if (fieldName && this.isValidESFieldName(fieldName)) {
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
    // Note: @ is not allowed at the start for field extraction
    const isValid = /^[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(fieldName) &&
                   fieldName.length > 1; // Minimum length

    // For extraction purposes, we're particularly interested in dot-notation fields
    // but we'll also accept simple field names that are longer than 2 characters
    return isValid && (fieldName.includes('.') || fieldName.length > 2);
  }

  isValidESFieldName(fieldName) {
    if (!this.isValidFieldName(fieldName)) {
      return false;
    }

    // Exclude file extensions and file-like patterns
    const filePatterns = [
      /\.(png|jpg|jpeg|gif|svg|webp|ico|bmp)$/i,  // Image files
      /\.(css|scss|less|sass)$/i,                 // Style files
      /\.(html|htm|xml|xhtml)$/i,                 // Markup files
      /\.(js|ts|jsx|tsx|mjs|cjs)$/i,             // Script files
      /\.(json|yaml|yml|toml|ini|cfg)$/i,        // Config files
      /\.(txt|md|rst|log)$/i,                    // Text/doc files
      /\.(woff|woff2|ttf|eot|otf)$/i,           // Font files
      /\.(mp4|avi|mov|webm|mp3|wav|ogg)$/i,     // Media files
      /\.(zip|tar|gz|rar|7z|dmg|iso)$/i,        // Archive files
      /\.(pdf|doc|docx|xls|xlsx|ppt|pptx)$/i    // Document files
    ];

    if (filePatterns.some(pattern => pattern.test(fieldName))) {
      return false;
    }

    // Exclude URL/domain patterns
    const urlPatterns = [
      /^https?:\/\//i,                           // HTTP URLs
      /^ftp:\/\//i,                             // FTP URLs
      /\.(com|org|net|edu|gov|mil|co|io|ly|me|ai|dev)$/i, // Common TLDs
      /^www\./i,                                // www prefixes
      /github\.com/i,                           // Common domains
      /elastic\.co/i,
      /mitre\.org/i,
      /mozilla\.org/i,
      /stackoverflow\.com/i,
      /malpedia\./i                             // Specific domain patterns
    ];

    if (urlPatterns.some(pattern => pattern.test(fieldName))) {
      return false;
    }

    // Exclude image/asset references
    const assetPatterns = [
      /^image\d*\.(png|jpg|jpeg|gif|svg)$/i,    // image1.png, image2.jpg, etc.
      /^icon\d*\.(png|jpg|jpeg|gif|svg)$/i,     // icon1.png, etc.
      /^logo\d*\.(png|jpg|jpeg|gif|svg)$/i,     // logo.png, etc.
      /^background\d*\.(png|jpg|jpeg|gif|svg)$/i, // background.jpg, etc.
      /^screenshot\d*\.(png|jpg|jpeg|gif|svg)$/i, // screenshot.png, etc.
      /assets\./i,                              // assets.* references
      /static\./i                               // static.* references
    ];

    if (assetPatterns.some(pattern => pattern.test(fieldName))) {
      return false;
    }

    // Exclude common abbreviations and text artifacts
    const textPatterns = [
      /^e\.g$/i,                                // "e.g" abbreviation
      /^i\.e$/i,                                // "i.e" abbreviation
      /^etc$/i,                                 // "etc" abbreviation
      /^vs$/i,                                  // "vs" abbreviation
      /^cmd\.exe$/i,                            // Windows command
      /^powershell\.exe$/i                      // PowerShell executable
    ];

    if (textPatterns.some(pattern => pattern.test(fieldName))) {
      return false;
    }

    // Exclude Windows executables and DLLs (these are process names, not field names)
    const windowsExecutablePatterns = [
      /\.(exe|dll|bat|cmd|msi|scr)$/i,          // Windows executables and libraries
      /^(rundll32|regsvr32|svchost|explorer|winlogon|csrss|lsass|spoolsv|services|smss|wininit|dwm|taskhost|dllhost|msiexec|setup|install)\.exe$/i,
      /^(ntdll|kernel32|user32|gdi32|advapi32|ole32|shell32|comctl32|msvcrt|ws2_32)\.dll$/i
    ];

    if (windowsExecutablePatterns.some(pattern => pattern.test(fieldName))) {
      return false;
    }

    // Exclude UI/Dashboard configuration patterns (these are Kibana configs, not document fields)
    const uiConfigPatterns = [
      /^gridData\./i,                           // Dashboard grid positioning
      /^embeddableConfig\./i,                   // Dashboard embeddable config
      /^panelConfig\./i,                        // Panel configuration
      /^dashboardConfig\./i,                    // Dashboard configuration
      /^visualizationConfig\./i,                // Visualization configuration
      /^layoutConfig\./i,                       // Layout configuration
      /^uiState\./i,                           // UI state data
      /^appState\./i,                          // Application state
      /^globalState\./i,                       // Global state
      /^columns\./i,                           // Table column configuration
      /^dataProviders\./i,                     // Data provider configuration
      /^meta\.anything/i,                      // Template/example fields
      /anything_you_want/i,                    // Example/template content
      /^ui_/i,                                 // UI-related fields
      /^example\./i,                           // Example fields
      /^template\./i                           // Template fields
    ];

    if (uiConfigPatterns.some(pattern => pattern.test(fieldName))) {
      return false;
    }

    // Exclude hash-like identifiers and GUIDs (these are IDs, not field names)
    const hashPatterns = [
      /^[a-f0-9]{32,}$/i,                      // Long hex strings (MD5, SHA, etc.)
      /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i, // GUIDs
      /\.[a-f0-9]{32,}\./i,                    // Embedded long hex strings
      /^(adHocDataViews|indexPatternRefs)\.[a-f0-9]{32,}/i // Specific Kibana patterns
    ];

    if (hashPatterns.some(pattern => pattern.test(fieldName))) {
      return false;
    }

    // Exclude VSCode/IDE extension references and domain fragments
    const idePatterns = [
      /^[a-z]+\.(markdown|extension|plugin)$/i, // Extension patterns like yzhang.markdown
      /^vscode\./i,                            // VSCode references
      /^extensions\./i,                        // Extension references
      /^settings\./i,                          // IDE settings
      /^ela\.st$/i,                           // Specific domain fragments
      /^[a-z]{2,3}\.[a-z]{2,3}$/i            // Simple domain patterns like ela.st
    ];

    if (idePatterns.some(pattern => pattern.test(fieldName))) {
      return false;
    }

    // Additional validation for ES fields - exclude common JS/React artifacts
    const jsArtifacts = [
      'jest.fn', 'jest.mock', 'jest.Mock', 'jest.clearAllMocks', 'jest.resetAllMocks',
      'React.memo', 'React.Component', 'React.useState', 'React.useEffect',
      'i18n.translate', 'console.log', 'console.error', 'console.warn',
      'window.location', 'document.getElementById', 'Object.keys', 'JSON.stringify',
      'Array.from', 'String.prototype', 'Number.prototype', 'Math.random',
      'process.env', 'module.exports', 'require.resolve', 'B.V'
    ];

    // Exclude known JavaScript artifacts
    if (jsArtifacts.some(artifact => fieldName.includes(artifact))) {
      return false;
    }

    // Exclude fields that are clearly JS/React related
    const jsPatterns = [
      /^react\./i,
      /^jest\./i,
      /^enzyme\./i,
      /^lodash\./i,
      /^moment\./i,
      /^rxjs\./i,
      /^angular\./i,
      /^vue\./i,
      /\.prototype\./i,
      /\.constructor\./i,
      /\.toString\./i,
      /\.valueOf\./i
    ];

    if (jsPatterns.some(pattern => pattern.test(fieldName))) {
      return false;
    }

    // Require dot notation for most field names (ES fields are typically namespaced)
    // Exception: allow @timestamp and other known single-word ECS fields
    const singleWordECSFields = ['@timestamp', 'message', 'tags', 'labels', 'error', 'level'];
    if (!fieldName.includes('.') && !singleWordECSFields.includes(fieldName)) {
      return false;
    }

    return true;
  }

  isValidECSFieldName(fieldName) {
    if (!fieldName || typeof fieldName !== 'string') {
      return false;
    }

    // ECS field names should not contain hyphens, only underscores and dots
    return /^[a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*$/.test(fieldName) &&
           fieldName.length > 1;
  }
}