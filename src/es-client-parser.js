import chalk from 'chalk';
import {
  isValidESFieldName as utilIsValidESFieldName,
  isCommonAPIPattern as utilIsCommonAPIPattern,
} from './utils/field-utils.js';

export class ESClientParser {
  constructor(options = {}) {
    this.verbose = options.verbose || false;
  }

  extractESClientFields(content, filePath) {
    const fields = new Set();
    
    try {
      // Extract fields from different ES client usage patterns
      this.extractFromSearchQueries(content, fields);
      this.extractFromIndexOperations(content, fields);
      this.extractFromAggregations(content, fields);
      this.extractFromMappings(content, fields);
      this.extractFromBulkOperations(content, fields);
      this.extractFromQueryDSL(content, fields);
      
      if (this.verbose && fields.size > 0) {
        console.log(chalk.gray(`    🔍 ES Client fields in ${filePath}: ${fields.size} fields`));
      }
      
    } catch (error) {
      if (this.verbose) {
        console.log(chalk.yellow(`⚠️  Error parsing ES client usage in ${filePath}: ${error.message}`));
      }
    }

    return Array.from(fields);
  }

  extractFromSearchQueries(content, fields) {
    // Pattern for client.search() calls
    const searchPatterns = [
      // client.search({ ... })
      /client\.search\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
      // await client.search({ ... })
      /await\s+client\.search\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
      // esClient.search({ ... })
      /esClient\.search\s*\(\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
    ];

    for (const pattern of searchPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const queryContent = match[1];
        this.extractFieldsFromQueryObject(queryContent, fields);
      }
    }
  }

  extractFromIndexOperations(content, fields) {
    // Pattern for index operations
    const indexPatterns = [
      // client.index({ index: 'name', body: { ... } })
      /client\.index\s*\(\s*\{[^}]*body\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
      // client.create({ ... })
      /client\.create\s*\(\s*\{[^}]*body\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
      // client.update({ ... })
      /client\.update\s*\(\s*\{[^}]*body\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
    ];

    for (const pattern of indexPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const bodyContent = match[1];
        this.extractFieldsFromDocumentBody(bodyContent, fields);
      }
    }
  }

  extractFromAggregations(content, fields) {
    // Pattern for aggregations
    const aggPatterns = [
      // aggs: { ... }
      /aggs\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
      // aggregations: { ... }
      /aggregations\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
      // terms: { field: 'field.name' }
      /terms\s*:\s*\{[^}]*field\s*:\s*['"']([^'"']+)['"']/g,
      // date_histogram: { field: 'field.name' }
      /date_histogram\s*:\s*\{[^}]*field\s*:\s*['"']([^'"']+)['"']/g,
    ];

    for (const pattern of aggPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        if (match[1] && !match[1].includes(':')) {
          // Direct field match from terms/date_histogram patterns
          const fieldName = match[1];
          if (this.isValidFieldName(fieldName)) {
            fields.add(fieldName);
          }
        } else if (match[1]) {
          // Nested aggregation content
          this.extractFieldsFromAggregationObject(match[1], fields);
        }
      }
    }
  }

  extractFromMappings(content, fields) {
    // Pattern for mapping definitions - more robust nested brace handling
    const mappingPatterns = [
      // mappings: { properties: { ... } }
      /mappings\s*:\s*\{[^}]*properties\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/gs,
      // properties: { ... } - use a more comprehensive approach
      /properties\s*:\s*\{/g,
    ];

    // First try the simple patterns
    for (const pattern of mappingPatterns.slice(0, 1)) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const propertiesContent = match[1];
        this.extractFieldsFromMappingProperties(propertiesContent, fields);
      }
    }

    // If that didn't work, try a more manual approach
    const propertiesIndex = content.indexOf('properties');
    if (propertiesIndex !== -1) {
      const startBrace = content.indexOf('{', propertiesIndex);
      if (startBrace !== -1) {
        // Find the matching closing brace
        let braceCount = 1;
        let endIndex = startBrace + 1;
        while (endIndex < content.length && braceCount > 0) {
          if (content[endIndex] === '{') braceCount++;
          else if (content[endIndex] === '}') braceCount--;
          endIndex++;
        }
        
        if (braceCount === 0) {
          const propertiesContent = content.substring(startBrace + 1, endIndex - 1);
          this.extractFieldsFromMappingProperties(propertiesContent, fields);
        }
      }
    }
  }

  extractFromBulkOperations(content, fields) {
    // Pattern for bulk operations
    const bulkPatterns = [
      // client.bulk({ body: [...] })
      /client\.bulk\s*\(\s*\{[^}]*body\s*:\s*\[([^\]]+)\]/g,
      // Bulk document bodies
      /\{[^}]*"_source"\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g,
    ];

    for (const pattern of bulkPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const bulkContent = match[1];
        this.extractFieldsFromBulkBody(bulkContent, fields);
      }
    }
  }

  extractFromQueryDSL(content, fields) {
    // Common Elasticsearch Query DSL patterns
    const queryPatterns = [
      // term: { "field.name": value }
      /term\s*:\s*\{\s*['"']([^'"']+)['"']\s*:/g,
      // terms: { "field.name": [...] }
      /terms\s*:\s*\{\s*['"']([^'"']+)['"']\s*:/g,
      // match: { "field.name": value }
      /match\s*:\s*\{\s*['"']([^'"']+)['"']\s*:/g,
      // range: { "field.name": {...} }
      /range\s*:\s*\{\s*['"']([^'"']+)['"']\s*:/g,
      // exists: { field: "field.name" }
      /exists\s*:\s*\{\s*field\s*:\s*['"']([^'"']+)['"']/g,
      // sort: [{ "field.name": {...} }]
      /sort\s*:\s*\[?\s*\{\s*['"']([^'"']+)['"']\s*:/g,
      // Script field references: doc['field.name']
      /doc\s*\[\s*['"']([^'"']+)['"']\s*\]/g,
      // Painless script field access: params._source['field.name']
      /params\._source\s*\[\s*['"']([^'"']+)['"']\s*\]/g,
    ];

    for (const pattern of queryPatterns) {
      let match;
      while ((match = pattern.exec(content)) !== null) {
        const fieldName = match[1];
        if (utilIsValidESFieldName(fieldName)) {
          fields.add(fieldName);
        }
      }
    }
  }

  extractFieldsFromQueryObject(queryContent, fields) {
    // Extract fields from query object structure
    this.extractFromQueryDSL(queryContent, fields);
    
    // Look for nested bool queries
    const boolPattern = /bool\s*:\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
    let match;
    while ((match = boolPattern.exec(queryContent)) !== null) {
      this.extractFromQueryDSL(match[1], fields);
    }
  }

  extractFieldsFromDocumentBody(bodyContent, fields) {
    // Extract field names from document structure
    const fieldPattern = /['"']([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)['"']\s*:/g;
    let match;
    while ((match = fieldPattern.exec(bodyContent)) !== null) {
      const fieldName = match[1];
      if (this.isValidFieldName(fieldName)) {
        fields.add(fieldName);
      }
    }
  }

  extractFieldsFromAggregationObject(aggContent, fields) {
    // Extract field names from aggregation definitions
    const patterns = [
      // field: "field.name"
      /field\s*:\s*['"']([^'"']+)['"']/g,
      // script: { source: "doc['field.name'].value" }
      /doc\s*\[\s*['"']([^'"']+)['"']\s*\]/g,
    ];

    for (const pattern of patterns) {
      let match;
      while ((match = pattern.exec(aggContent)) !== null) {
        const fieldName = match[1];
        if (utilIsValidESFieldName(fieldName)) {
          fields.add(fieldName);
        }
      }
    }
  }

  extractFieldsFromMappingProperties(propertiesContent, fields) {
    try {
      // Try to parse the properties content as JSON to properly extract field structure
      const wrappedContent = `{${propertiesContent}}`;
      const propertiesObj = JSON.parse(wrappedContent);
      this.extractFieldsFromMappingObject(propertiesObj, fields);
    } catch (error) {
      // If JSON parsing fails, fall back to pattern matching
      this.extractFieldsFromMappingContentPattern(propertiesContent, fields);
    }
  }

  /**
   * Extract field names from a parsed mapping properties object
   * Only extracts actual field paths, not the mapping structure
   */
  extractFieldsFromMappingObject(obj, fields, fieldPath = '') {
    for (const [fieldName, fieldDef] of Object.entries(obj)) {
      const currentFieldPath = fieldPath ? `${fieldPath}.${fieldName}` : fieldName;
      
      // If this field definition has nested properties, recurse
      if (fieldDef && typeof fieldDef === 'object' && fieldDef.properties) {
        this.extractFieldsFromMappingObject(fieldDef.properties, fields, currentFieldPath);
      } else if (fieldDef && typeof fieldDef === 'object' && fieldDef.type) {
        // This is a leaf field definition with a type - add the field path
        if (this.isValidFieldName(currentFieldPath)) {
          fields.add(currentFieldPath);
        }
      } else if (this.isValidFieldName(currentFieldPath)) {
        // Add the field path even if it doesn't have an explicit type
        fields.add(currentFieldPath);
      }
    }
  }

  /**
   * Fallback method for extracting fields from mapping content using patterns
   * when JSON parsing fails
   */
  extractFieldsFromMappingContentPattern(propertiesContent, fields) {
    // Extract field names from mapping properties - more flexible pattern
    const fieldPattern = /['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)['"']\s*:\s*\{[^}]*type\s*:/g;
    let match;
    while ((match = fieldPattern.exec(propertiesContent)) !== null) {
      const fieldName = match[1];
      if (this.isValidFieldName(fieldName)) {
        fields.add(fieldName);
      }
    }
    
    // Also try a simpler pattern for any quoted field-like strings in properties
    const simpleFieldPattern = /['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)+)['"']/g;
    while ((match = simpleFieldPattern.exec(propertiesContent)) !== null) {
      const fieldName = match[1];
      if (this.isValidFieldName(fieldName)) {
        fields.add(fieldName);
      }
    }
  }

  extractFieldsFromBulkBody(bulkContent, fields) {
    // Extract fields from bulk operation bodies
    this.extractFieldsFromDocumentBody(bulkContent, fields);
    
    // Also look for index/update operations
    const actionPattern = /"(index|create|update)"\s*:\s*\{[^}]*"_index"\s*:\s*['"']([^'"']+)['"']/g;
    let match;
    while ((match = actionPattern.exec(bulkContent)) !== null) {
      // Extract any field-like patterns from the bulk operations
      this.extractFromQueryDSL(bulkContent, fields);
    }
  }

  extractFieldsFromTypescriptInterfaces(content, fields) {
    // Extract field names from TypeScript interface definitions
    // More robust approach to handle nested interfaces
    const interfaceStartPattern = /interface\s+\w+\s*\{/g;
    let match;
    
    while ((match = interfaceStartPattern.exec(content)) !== null) {
      const startIndex = match.index + match[0].length;
      
      // Find the matching closing brace
      let braceCount = 1;
      let endIndex = startIndex;
      while (endIndex < content.length && braceCount > 0) {
        if (content[endIndex] === '{') braceCount++;
        else if (content[endIndex] === '}') braceCount--;
        endIndex++;
      }
      
      if (braceCount === 0) {
        const interfaceBody = content.substring(startIndex, endIndex - 1);
        
        // Look for quoted field names like 'user.name': type or 'user.name'?: type  
        const quotedFieldPattern = /['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)['"']\s*\??\s*:/g;
        let fieldMatch;
        while ((fieldMatch = quotedFieldPattern.exec(interfaceBody)) !== null) {
          const fieldName = fieldMatch[1];
          if (this.isValidFieldName(fieldName)) {
            fields.add(fieldName);
          }
        }
        
        // Look for unquoted field names like fieldName: type (only dot-notation)
        const unquotedFieldPattern = /^\s*([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)\s*\??\s*:/gm;
        while ((fieldMatch = unquotedFieldPattern.exec(interfaceBody)) !== null) {
          const fieldName = fieldMatch[1];
          if (this.isValidFieldName(fieldName)) {
            fields.add(fieldName);
          }
        }
      }
    }
  }

  extractFieldsFromTypescriptTypes(content, fields) {
    // Extract field names from TypeScript type definitions
    const typePattern = /type\s+\w+\s*=\s*\{([^}]+(?:\{[^}]*\}[^}]*)*)\}/g;
    let match;
    while ((match = typePattern.exec(content)) !== null) {
      const typeBody = match[1];
      
      // Look for quoted field names like 'user.name': type
      const quotedFieldPattern = /['"']([a-zA-Z@][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)['"']\s*[?:]?\s*:/g;
      let fieldMatch;
      while ((fieldMatch = quotedFieldPattern.exec(typeBody)) !== null) {
        const fieldName = fieldMatch[1];
        if (utilIsValidESFieldName(fieldName)) {
          fields.add(fieldName);
        }
      }
      
      // Look for unquoted dot-notation field names
      const unquotedFieldPattern = /\s*([a-zA-Z][a-zA-Z0-9_]*\.[a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z][a-zA-Z0-9_]*)*)\s*[?:]?\s*:/g;
      while ((fieldMatch = unquotedFieldPattern.exec(typeBody)) !== null) {
        const fieldName = fieldMatch[1];
        if (utilIsValidESFieldName(fieldName)) {
          fields.add(fieldName);
        }
      }
    }
  }

  isValidFieldName(fieldName) {
    return utilIsValidESFieldName(fieldName);
  }

  isCommonAPIPattern(fieldName) {
    return utilIsCommonAPIPattern(fieldName);
  }
}
