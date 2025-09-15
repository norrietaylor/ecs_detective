#!/usr/bin/env node

import { Command } from 'commander';
import path from 'path';
import { fileURLToPath } from 'url';
import { ECSAnalyzer } from './analyzer.js';
import { Validator } from './validator.js';
import chalk from 'chalk';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const program = new Command();

program
  .name('ecs-detective')
  .description('🕵️ Detect and analyze Elastic Common Schema (ECS) field usage in TypeScript/JavaScript repositories')
  .version('1.0.0');

program
  .option('-d, --directories <dirs>', 'Comma-separated list of directories to scan (relative to repo)', '')
  .option('-f, --fields-csv <path>', 'Path to ECS fields CSV file', 'fields.csv')
  .option('-r, --repo <path>', 'Path to repository directory to analyze', './repo')
  .option('-o, --output <path>', 'Output file for results (optional)')
  .option('--include-tests', 'Include test directories in analysis (excluded by default)', false)
  .option('--include-json', 'Include JSON files in analysis (excluded by default)', false)
  .option('--include-yaml', 'Include YAML/YML files in analysis (excluded by default)', false)
  .option('--include-markdown', 'Include Markdown files in analysis (excluded by default)', false)
  .option('--vendor-fields <path>', 'Path to vendor fields file', 'vendor_fields.txt')
  .option('--verbose', 'Enable verbose logging')
  .action(async (options) => {
    try {
      // Validate inputs
      const { errors, warnings } = await Validator.validateInputs({
        repo: options.repo,
        directories: options.directories ? options.directories.split(',').map(d => d.trim()) : [],
        fieldsCsv: options.fieldsCsv,
        output: options.output
      });

      if (!Validator.displayValidationResults(errors, warnings, options.verbose)) {
        process.exit(1);
      }

      console.log(chalk.blue('🕵️ Starting ECS Detective Analysis...\n'));    
      
      const analyzer = new ECSAnalyzer({
        repoPath: options.repo,
        fieldsCSV: options.fieldsCsv,
        vendorFieldsFile: options.vendorFields,
        targetDirectories: options.directories ? options.directories.split(',').map(d => d.trim()) : [],
        includeTests: options.includeTests,
        includeJson: options.includeJson,
        includeYaml: options.includeYaml,
        includeMarkdown: options.includeMarkdown,
        verbose: options.verbose
      });

      const results = await analyzer.analyze();
      
      // Display results
      displayResults(results);
      
      // Save to file if specified
      if (options.output) {
        await analyzer.saveResults(results, options.output);
        console.log(chalk.green(`\n✅ Results saved to ${options.output}`));
      }

      // Check memory usage
      Validator.validateMemoryUsage();
      
    } catch (error) {
      console.error(chalk.red('❌ Error:'), error.message);
      if (options.verbose) {
        console.error(error.stack);
      }
      process.exit(1);
    }
  });

function displayResults(results) {
  console.log(chalk.yellow('📊 Analysis Results:'));
  console.log(chalk.gray('=' .repeat(50)));
  
  console.log(`\n${chalk.cyan('📁 File Statistics:')}`);
  console.log(`Total files parsed: ${chalk.bold(results.totalFiles)}`);
  console.log(`Files with ONLY core ECS fields: ${chalk.bold(results.filesWithOnlyCoreFields)}`);
  console.log(`Files with vendor fields: ${chalk.bold(results.filesWithVendorFields)}`);
  console.log(`Files with custom fields: ${chalk.bold(results.filesWithCustomFields)}`);
  console.log(`Files skipped: ${chalk.bold(results.skippedFiles)}`);
  
  console.log(`\n${chalk.cyan('📂 File Types Analyzed:')}`);
  if (results.fileTypeCounts) {
    const sortedFileTypes = Object.entries(results.fileTypeCounts)
      .sort(([,a], [,b]) => b - a);
    sortedFileTypes.forEach(([type, count]) => {
      const typeIcon = getFileTypeIcon(type);
      console.log(`  ${typeIcon} ${type}: ${chalk.bold(count)} files`);
    });
  }

  if (results.skippedFilesList && results.skippedFilesList.length > 0) {
    console.log(`\n${chalk.cyan('⚠️  Skipped Files:')}`);
    const maxToShow = 20; // Limit output for readability
    const filesToShow = results.skippedFilesList.slice(0, maxToShow);
    filesToShow.forEach((skipped, index) => {
      console.log(`  ${index + 1}. ${chalk.gray(skipped.path)}`);
      console.log(`     ${chalk.yellow('→')} ${skipped.reason}`);
    });
    
    if (results.skippedFilesList.length > maxToShow) {
      const remaining = results.skippedFilesList.length - maxToShow;
      console.log(`  ${chalk.gray(`... and ${remaining} more files`)}`);
    }
  }
  
  console.log(`\n${chalk.cyan('🎯 Core ECS Field Usage:')}`);
  console.log(`Total core fields referenced: ${chalk.bold(results.totalCoreFieldsReferenced)}`);
  console.log(`\nTop 10 core fields by usage:`);
  results.topCoreFields.slice(0, 10).forEach((field, index) => {
    console.log(`  ${index + 1}. ${chalk.green(field.name)} - ${chalk.bold(field.count)} occurrences`);
  });
  
  console.log(`\n${chalk.cyan('📦 Vendor Field Usage:')}`);
  console.log(`Total vendor fields referenced: ${chalk.bold(results.totalVendorFieldsReferenced)}`);
  console.log(`\nTop 10 vendor fields by usage:`);
  results.topVendorFields.slice(0, 10).forEach((field, index) => {
    console.log(`  ${index + 1}. ${chalk.magenta(field.name)} - ${chalk.bold(field.count)} occurrences`);
  });
  
  console.log(`\n${chalk.cyan('🔧 Custom Field Usage:')}`);
  console.log(`Total custom fields referenced: ${chalk.bold(results.totalCustomFieldsReferenced)}`);
  console.log(`\nTop 10 custom fields by usage:`);
  results.topCustomFields.slice(0, 10).forEach((field, index) => {
    console.log(`  ${index + 1}. ${chalk.yellow(field.name)} - ${chalk.bold(field.count)} occurrences`);
  });
}

function getFileTypeIcon(type) {
  const icons = {
    'typescript': '📘',
    'javascript': '📙', 
    'json': '📄',
    'yaml': '📋',
    'markdown': '📝',
    'text': '📃',
    'unknown': '❓'
  };
  return icons[type] || '📄';
}

program.parse();

