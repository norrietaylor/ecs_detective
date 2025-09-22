import path from 'path';
import fs from 'fs-extra';
import chalk from 'chalk';
import { ECSFetcher } from './ecs-fetcher.js';
import { FieldParser } from './field-parser.js';
import { FileScanner } from './file-scanner.js';

export class ECSAnalyzer {
  constructor(options = {}) {
    this.repoPath = options.repoPath || './repo';
    this.fieldsCSV = options.fieldsCSV || 'fields.csv';
    this.vendorFieldsFile = options.vendorFieldsFile || 'vendor_fields.txt';
    this.targetDirectories = options.targetDirectories || [];
    this.includeTests = options.includeTests || false;
    this.includeJson = options.includeJson || false;
    this.includeYaml = options.includeYaml || false;
    this.includeMarkdown = options.includeMarkdown || false;
    this.verbose = options.verbose || false;

    this.fetcher = new ECSFetcher({ verbose: this.verbose });
    this.parser = new FieldParser({ verbose: this.verbose });
    this.scanner = new FileScanner({ 
      verbose: this.verbose,
      includeTests: this.includeTests,
      includeJson: this.includeJson,
      includeYaml: this.includeYaml,
      includeMarkdown: this.includeMarkdown
    });

    // Statistics tracking
    this.stats = {
      totalFiles: 0,
      filesWithOnlyCoreFields: 0,
      filesWithVendorFields: 0,
      filesWithCustomFields: 0,
      coreFieldCounts: new Map(),
      vendorFieldCounts: new Map(),
      customFieldCounts: new Map(),
      processedFiles: 0,
      skippedFiles: 0,
      skippedFilesList: [],
      fileTypeCounts: new Map()
    };
  }

  async analyze() {
    try {
      console.log(chalk.blue('🚀 Starting ECS field analysis...\n'));

      // Step 1: Fetch and parse ECS fields
      console.log(chalk.cyan('📥 Step 1: Loading ECS field definitions...'));
      await this.fetcher.downloadIfMissing(this.fieldsCSV);
      const csvContent = await this.fetcher.fetchECSFields(this.fieldsCSV);
      const coreFields = this.parser.parseECSFields(csvContent);

      if (coreFields.size === 0) {
        throw new Error('No core ECS fields found in CSV file');
      }

      // Step 1.5: Load vendor fields
      console.log(chalk.cyan('📦 Loading vendor field definitions...'));
      const vendorFields = await this.loadVendorFields();
      console.log(chalk.green(`✅ Loaded ${vendorFields.size} vendor field patterns`));

      // Step 2: Scan repository for files
      console.log(chalk.cyan('\n🔍 Step 2: Scanning repository files...'));
      const filePaths = await this.scanner.scanDirectory(this.repoPath, this.targetDirectories);
      
      this.stats.totalFiles = filePaths.length;

      // Step 3: Analyze each file
      console.log(chalk.cyan(`\n📊 Step 3: Analyzing ${filePaths.length} files...`));
      
      let progress = 0;
      const progressInterval = Math.max(1, Math.floor(filePaths.length / 20)); // Show progress every 5%

      for (const filePath of filePaths) {
        progress++;
        
        if (this.verbose || progress % progressInterval === 0) {
          const percentage = Math.round((progress / filePaths.length) * 100);
          console.log(chalk.gray(`  📄 Processing: ${percentage}% (${progress}/${filePaths.length})`));
        }

        await this.analyzeFile(filePath, coreFields, vendorFields);
      }

      // Step 4: Generate results
      console.log(chalk.cyan('\n📈 Step 4: Generating analysis results...'));
      const results = this.generateResults(coreFields);

      console.log(chalk.green('\n✅ Analysis complete!\n'));
      return results;

    } catch (error) {
      console.error(chalk.red('❌ Analysis failed:'), error.message);
      throw error;
    }
  }

  async analyzeFile(filePath, coreFields, vendorFields) {
    try {
      // Skip files that should be ignored
      if (this.scanner.shouldSkipFile(filePath)) {
        this.stats.skippedFiles++;
        this.stats.skippedFilesList.push({
          path: filePath,
          reason: 'File type not supported or excluded by patterns'
        });
        return;
      }

      // Track file type
      const fileType = this.scanner.getFileType(filePath);
      const currentCount = this.stats.fileTypeCounts.get(fileType) || 0;
      this.stats.fileTypeCounts.set(fileType, currentCount + 1);

      // Read file content
      const content = await this.scanner.readFileContent(filePath);
      if (!content) {
        this.stats.skippedFiles++;
        this.stats.skippedFilesList.push({
          path: filePath,
          reason: 'Empty file or failed to read content'
        });
        return;
      }

      // Extract field references from content
      const extractedFields = this.parser.extractFieldsFromContent(content, filePath);
      
      if (extractedFields.length === 0) {
        this.stats.processedFiles++;
        return;
      }

      // Categorize fields as core vs vendor vs custom
      const { coreFieldsInFile, vendorFieldsInFile, customFieldsInFile } = this.categorizeFields(extractedFields, coreFields, vendorFields);

      // Update statistics
      this.updateFileStatistics(coreFieldsInFile, vendorFieldsInFile, customFieldsInFile);
      this.updateFieldCounts(coreFieldsInFile, vendorFieldsInFile, customFieldsInFile);

      this.stats.processedFiles++;

      if (this.verbose && (coreFieldsInFile.length > 0 || vendorFieldsInFile.length > 0 || customFieldsInFile.length > 0)) {
        console.log(chalk.gray(`    📁 ${path.relative(this.repoPath, filePath)}: ${coreFieldsInFile.length} core, ${vendorFieldsInFile.length} vendor, ${customFieldsInFile.length} custom`));
      }

    } catch (error) {
      if (this.verbose) {
        console.log(chalk.yellow(`⚠️  Error analyzing ${filePath}: ${error.message}`));
      }
      this.stats.skippedFiles++;
    }
  }

  categorizeFields(extractedFields, coreFields, vendorFields) {
    const coreFieldsInFile = [];
    const vendorFieldsInFile = [];
    const customFieldsInFile = [];

    for (const field of extractedFields) {
      // First check if field is directly a core ECS field
      if (this.parser.isECSField(field, coreFields)) {
        coreFieldsInFile.push(field);
      } else {
        // Try to normalize the field and check if it maps to a core field
        const normalizedField = this.normalizeFieldName(field, coreFields);
        if (normalizedField && coreFields.has(normalizedField)) {
          coreFieldsInFile.push(field);  // Keep original field name but classify as core
        } else if (field.startsWith('kibana.')) {
          // All kibana.* fields should be classified as vendor fields
          vendorFieldsInFile.push(field);
        } else if (this.isVendorField(field, vendorFields)) {
          vendorFieldsInFile.push(field);
        } else {
          customFieldsInFile.push(field);
        }
      }
    }

    return { coreFieldsInFile, vendorFieldsInFile, customFieldsInFile };
  }

  updateFileStatistics(coreFieldsInFile, vendorFieldsInFile, customFieldsInFile) {
    const hasCore = coreFieldsInFile.length > 0;
    const hasVendor = vendorFieldsInFile.length > 0;
    const hasCustom = customFieldsInFile.length > 0;

    if (hasCore && !hasVendor && !hasCustom) {
      this.stats.filesWithOnlyCoreFields++;
    }

    if (hasVendor) {
      this.stats.filesWithVendorFields++;
    }

    if (hasCustom) {
      this.stats.filesWithCustomFields++;
    }
  }

  updateFieldCounts(coreFieldsInFile, vendorFieldsInFile, customFieldsInFile) {
    // Count core field occurrences
    for (const field of coreFieldsInFile) {
      const count = this.stats.coreFieldCounts.get(field) || 0;
      this.stats.coreFieldCounts.set(field, count + 1);
    }

    // Count vendor field occurrences
    for (const field of vendorFieldsInFile) {
      const count = this.stats.vendorFieldCounts.get(field) || 0;
      this.stats.vendorFieldCounts.set(field, count + 1);
    }

    // Count custom field occurrences
    for (const field of customFieldsInFile) {
      const count = this.stats.customFieldCounts.get(field) || 0;
      this.stats.customFieldCounts.set(field, count + 1);
    }
  }

  generateResults(coreFields) {
    // Sort fields by usage count
    const sortedCoreFields = Array.from(this.stats.coreFieldCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const sortedVendorFields = Array.from(this.stats.vendorFieldCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    const sortedCustomFields = Array.from(this.stats.customFieldCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      // File statistics
      totalFiles: this.stats.totalFiles,
      filesWithOnlyCoreFields: this.stats.filesWithOnlyCoreFields,
      filesWithVendorFields: this.stats.filesWithVendorFields,
      filesWithCustomFields: this.stats.filesWithCustomFields,
      processedFiles: this.stats.processedFiles,
      skippedFiles: this.stats.skippedFiles,
      skippedFilesList: this.stats.skippedFilesList,
      fileTypeCounts: Object.fromEntries(this.stats.fileTypeCounts),

      // Core ECS field statistics
      totalCoreFieldsReferenced: this.stats.coreFieldCounts.size,
      topCoreFields: sortedCoreFields,
      totalCoreFieldOccurrences: Array.from(this.stats.coreFieldCounts.values()).reduce((a, b) => a + b, 0),

      // Vendor field statistics
      totalVendorFieldsReferenced: this.stats.vendorFieldCounts.size,
      topVendorFields: sortedVendorFields,
      totalVendorFieldOccurrences: Array.from(this.stats.vendorFieldCounts.values()).reduce((a, b) => a + b, 0),

      // Custom field statistics
      totalCustomFieldsReferenced: this.stats.customFieldCounts.size,
      topCustomFields: sortedCustomFields,
      totalCustomFieldOccurrences: Array.from(this.stats.customFieldCounts.values()).reduce((a, b) => a + b, 0),

      // Additional metadata
      coreFieldsAvailable: coreFields.size,
      analysisDate: new Date().toISOString(),
      repoPath: this.repoPath,
      targetDirectories: this.targetDirectories
    };
  }

  async saveResults(results, outputPath) {
    try {
      const output = {
        summary: {
          totalFiles: results.totalFiles,
          filesWithOnlyCoreFields: results.filesWithOnlyCoreFields,
          filesWithVendorFields: results.filesWithVendorFields,
          filesWithCustomFields: results.filesWithCustomFields,
          totalCoreFieldsReferenced: results.totalCoreFieldsReferenced,
          totalVendorFieldsReferenced: results.totalVendorFieldsReferenced,
          totalCustomFieldsReferenced: results.totalCustomFieldsReferenced,
          analysisDate: results.analysisDate
        },
        coreFields: {
          total: results.totalCoreFieldsReferenced,
          totalOccurrences: results.totalCoreFieldOccurrences,
          topFields: results.topCoreFields
        },
        vendorFields: {
          total: results.totalVendorFieldsReferenced,
          totalOccurrences: results.totalVendorFieldOccurrences,
          topFields: results.topVendorFields
        },
        customFields: {
          total: results.totalCustomFieldsReferenced,
          totalOccurrences: results.totalCustomFieldOccurrences,
          topFields: results.topCustomFields
        },
        metadata: {
          coreFieldsAvailable: results.coreFieldsAvailable,
          repoPath: results.repoPath,
          targetDirectories: results.targetDirectories,
          processedFiles: results.processedFiles,
          skippedFiles: results.skippedFiles,
          skippedFilesList: results.skippedFilesList,
          fileTypeCounts: results.fileTypeCounts
        }
      };

      await fs.writeFile(outputPath, JSON.stringify(output, null, 2), 'utf8');
    } catch (error) {
      throw new Error(`Failed to save results: ${error.message}`);
    }
  }

  /**
   * Normalize field names to detect core ECS fields with prefixes/suffixes
   * @param {string} fieldName - The field name to normalize
   * @param {Set} coreFieldsSet - Set of core ECS field names
   * @returns {string|null} - Normalized field name if it maps to a core field, null otherwise
   */
  normalizeFieldName(fieldName, coreFieldsSet) {
    // Handle Kibana alert fields: kibana.alert.* -> check for corresponding core ECS fields
    if (fieldName.startsWith('kibana.alert.')) {
      // Remove kibana.alert. prefix and check if it's a core field
      const withoutPrefix = fieldName.replace(/^kibana\.alert\./, '');
      if (coreFieldsSet.has(withoutPrefix)) {
        return withoutPrefix;
      }

      // Handle kibana.alert.original_event.* -> event.*
      const originalEventMatch = withoutPrefix.match(/^original_event\.(.+)$/);
      if (originalEventMatch) {
        const eventField = `event.${originalEventMatch[1]}`;
        if (coreFieldsSet.has(eventField)) {
          return eventField;
        }
      }

      // Check for common ECS patterns for the field without prefix
      // Try adding common ECS namespaces like event.*, log.*, etc.
      const commonNamespaces = ['event', 'log', 'user', 'host', 'process', 'source', 'destination'];
      for (const namespace of commonNamespaces) {
        const namespacedField = `${namespace}.${withoutPrefix}`;
        if (coreFieldsSet.has(namespacedField)) {
          return namespacedField;
        }
      }

      // Handle kibana.alert.rule.* -> try without rule prefix
      const ruleMatch = withoutPrefix.match(/^rule\.(.+)$/);
      if (ruleMatch) {
        const withoutRule = ruleMatch[1];
        if (coreFieldsSet.has(withoutRule)) {
          return withoutRule;
        }
        
        // Also try common namespaces for rule fields
        for (const namespace of commonNamespaces) {
          const namespacedRuleField = `${namespace}.${withoutRule}`;
          if (coreFieldsSet.has(namespacedRuleField)) {
            return namespacedRuleField;
          }
        }
      }

      // Handle nested kibana.alert.rule.parameters.* -> try without rule.parameters prefix
      const parametersMatch = withoutPrefix.match(/^rule\.parameters\.(.+)$/);
      if (parametersMatch) {
        const withoutParameters = parametersMatch[1];
        if (coreFieldsSet.has(withoutParameters)) {
          return withoutParameters;
        }
        
        // Also try common namespaces for parameter fields
        for (const namespace of commonNamespaces) {
          const namespacedParamField = `${namespace}.${withoutParameters}`;
          if (coreFieldsSet.has(namespacedParamField)) {
            return namespacedParamField;
          }
        }
      }
    }

    // Handle complex mapping definitions with nested fields:
    // mappings.properties.host.properties.os.properties.name.fields.text.type -> host.os.name
    const complexMappingMatch = fieldName.match(/^mappings\.properties\.(.+?)(?:\.fields\..*)?$/);
    if (complexMappingMatch) {
      const normalizedMapping = complexMappingMatch[1]
        .replace(/\.properties\./g, '.')
        .replace(/\.properties$/, '');
      if (coreFieldsSet.has(normalizedMapping)) {
        return normalizedMapping;
      }
    }

    // Handle ECS field metadata: event.fields.event.action -> event.action
    const metadataMatch = fieldName.match(/^([^.]+)\.fields\.(.+?)(?:\.|$)/);
    if (metadataMatch) {
      const potentialField = metadataMatch[2];
      if (coreFieldsSet.has(potentialField)) {
        return potentialField;
      }
    }

    // Handle nested field definitions: source.fields.source.ip.aggregatable -> source.ip
    const nestedMatch = fieldName.match(/^(.+)\.fields\.\1\.(.+?)(?:\.|$)/);
    if (nestedMatch) {
      const normalizedNested = `${nestedMatch[1]}.${nestedMatch[2]}`;
      if (coreFieldsSet.has(normalizedNested)) {
        return normalizedNested;
      }
    }

    // Handle field definition patterns: host.properties.name.something -> host.name
    const propMatch = fieldName.match(/^([^.]+)\.properties\.(.+?)(?:\.|$)/);
    if (propMatch) {
      const normalizedProp = `${propMatch[1]}.${propMatch[2]}`;
      if (coreFieldsSet.has(normalizedProp)) {
        return normalizedProp;
      }
    }

    // Handle ECS field schema definitions: agent.fields.agent.ephemeral_id.category -> agent.ephemeral_id
    const schemaMatch = fieldName.match(/^([^.]+)\.fields\.\1\.([^.]+)\.(?:aggregatable|category|description|example|format|type)$/);
    if (schemaMatch) {
      const normalizedSchema = `${schemaMatch[1]}.${schemaMatch[2]}`;
      if (coreFieldsSet.has(normalizedSchema)) {
        return normalizedSchema;
      }
    }

    return null;
  }

  async loadVendorFields() {
    try {
      const vendorFields = new Set();
      
      if (!(await fs.pathExists(this.vendorFieldsFile))) {
        if (this.verbose) {
          console.log(chalk.yellow(`⚠️  Vendor fields file not found: ${this.vendorFieldsFile}`));
        }
        return vendorFields;
      }

      const content = await fs.readFile(this.vendorFieldsFile, 'utf8');
      const lines = content.split('\n')
        .map(line => line.trim())
        .filter(line => line.length > 0 && !line.startsWith('#')); // Filter out empty lines and comments

      for (const line of lines) {
        vendorFields.add(line);
      }

      return vendorFields;
    } catch (error) {
      if (this.verbose) {
        console.log(chalk.yellow(`⚠️  Error loading vendor fields: ${error.message}`));
      }
      return new Set();
    }
  }

  isVendorField(fieldName, vendorFields) {
    if (!fieldName || !vendorFields || vendorFields.size === 0) {
      return false;
    }

    // Direct match
    if (vendorFields.has(fieldName)) {
      return true;
    }

    // Check with leading dot (some vendor fields might be stored with leading dots)
    const withDot = fieldName.startsWith('.') ? fieldName : `.${fieldName}`;
    const withoutDot = fieldName.startsWith('.') ? fieldName.substring(1) : fieldName;
    
    if (vendorFields.has(withDot) || vendorFields.has(withoutDot)) {
      return true;
    }

    // Check for pattern matches (prefix matching)
    for (const vendorPattern of vendorFields) {
      // Remove leading dot for comparison if present
      const pattern = vendorPattern.startsWith('.') ? vendorPattern.substring(1) : vendorPattern;
      const field = fieldName.startsWith('.') ? fieldName.substring(1) : fieldName;
      
      // Check if field starts with vendor pattern
      if (field.startsWith(pattern)) {
        return true;
      }
    }

    return false;
  }
}
