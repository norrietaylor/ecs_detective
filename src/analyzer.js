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
    this.targetDirectories = options.targetDirectories || [];
    this.includeTests = options.includeTests || false;
    this.verbose = options.verbose || false;

    this.fetcher = new ECSFetcher({ verbose: this.verbose });
    this.parser = new FieldParser({ verbose: this.verbose });
    this.scanner = new FileScanner({ 
      verbose: this.verbose,
      includeTests: this.includeTests
    });

    // Statistics tracking
    this.stats = {
      totalFiles: 0,
      filesWithOnlyCoreFields: 0,
      filesWithCustomFields: 0,
      coreFieldCounts: new Map(),
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

        await this.analyzeFile(filePath, coreFields);
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

  async analyzeFile(filePath, coreFields) {
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

      // Categorize fields as core vs custom
      const { coreFieldsInFile, customFieldsInFile } = this.categorizeFields(extractedFields, coreFields);

      // Update statistics
      this.updateFileStatistics(coreFieldsInFile, customFieldsInFile);
      this.updateFieldCounts(coreFieldsInFile, customFieldsInFile);

      this.stats.processedFiles++;

      if (this.verbose && (coreFieldsInFile.length > 0 || customFieldsInFile.length > 0)) {
        console.log(chalk.gray(`    📁 ${path.relative(this.repoPath, filePath)}: ${coreFieldsInFile.length} core, ${customFieldsInFile.length} custom`));
      }

    } catch (error) {
      if (this.verbose) {
        console.log(chalk.yellow(`⚠️  Error analyzing ${filePath}: ${error.message}`));
      }
      this.stats.skippedFiles++;
    }
  }

  categorizeFields(extractedFields, coreFields) {
    const coreFieldsInFile = [];
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
        } else {
          customFieldsInFile.push(field);
        }
      }
    }

    return { coreFieldsInFile, customFieldsInFile };
  }

  updateFileStatistics(coreFieldsInFile, customFieldsInFile) {
    const hasCore = coreFieldsInFile.length > 0;
    const hasCustom = customFieldsInFile.length > 0;

    if (hasCore && !hasCustom) {
      this.stats.filesWithOnlyCoreFields++;
    }

    if (hasCustom) {
      this.stats.filesWithCustomFields++;
    }
  }

  updateFieldCounts(coreFieldsInFile, customFieldsInFile) {
    // Count core field occurrences
    for (const field of coreFieldsInFile) {
      const count = this.stats.coreFieldCounts.get(field) || 0;
      this.stats.coreFieldCounts.set(field, count + 1);
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

    const sortedCustomFields = Array.from(this.stats.customFieldCounts.entries())
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);

    return {
      // File statistics
      totalFiles: this.stats.totalFiles,
      filesWithOnlyCoreFields: this.stats.filesWithOnlyCoreFields,
      filesWithCustomFields: this.stats.filesWithCustomFields,
      processedFiles: this.stats.processedFiles,
      skippedFiles: this.stats.skippedFiles,
      skippedFilesList: this.stats.skippedFilesList,
      fileTypeCounts: Object.fromEntries(this.stats.fileTypeCounts),

      // Core ECS field statistics
      totalCoreFieldsReferenced: this.stats.coreFieldCounts.size,
      topCoreFields: sortedCoreFields,
      totalCoreFieldOccurrences: Array.from(this.stats.coreFieldCounts.values()).reduce((a, b) => a + b, 0),

      // Custom/vendor field statistics
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
          filesWithCustomFields: results.filesWithCustomFields,
          totalCoreFieldsReferenced: results.totalCoreFieldsReferenced,
          totalCustomFieldsReferenced: results.totalCustomFieldsReferenced,
          analysisDate: results.analysisDate
        },
        coreFields: {
          total: results.totalCoreFieldsReferenced,
          totalOccurrences: results.totalCoreFieldOccurrences,
          topFields: results.topCoreFields
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
}
