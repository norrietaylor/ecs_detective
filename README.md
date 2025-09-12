# ECS Detective 🕵️

A comprehensive tool to analyze Elastic Common Schema (ECS) field usage in TypeScript and JavaScript repositories. This detective tool scans through code files to identify and categorize field references as either core ECS fields or custom/vendor fields.

## Features

- 🔍 **Comprehensive Scanning**: Analyzes JavaScript, TypeScript, JSON, YAML, and other file types
- 🚀 **Deep TypeScript Analysis**: Advanced Elasticsearch client API introspection for TypeScript files
- 📊 **Detailed Statistics**: Provides comprehensive usage statistics and rankings
- 🎯 **ECS Field Detection**: Automatically downloads and parses core ECS field definitions
- 🔧 **Configurable**: Flexible options for directories, field definitions, and output
- 📈 **Rich Reporting**: Detailed console output and optional JSON export
- 🔬 **ES Client API Parsing**: Detects field usage in search queries, aggregations, mappings, and bulk operations

## Installation

1. Clone this repository:
```bash
git clone <repository-url>
cd kibana-ecs-analyzer
```

2. Install dependencies:
```bash
npm install
```

## Usage

### Basic Usage

Analyze a repository (assumes `./repo` directory exists):
```bash
npm start
```

### Advanced Usage

```bash
# Analyze specific directories
npm start -- --directories "src/plugins,x-pack/plugins"

# Include test directories in analysis (excluded by default)
npm start -- --include-tests

# Use custom ECS fields file
npm start -- --fields-csv ./my-ecs-fields.csv

# Specify custom repository path  
npm start -- --repo /path/to/your-repo

# Save results to file
npm start -- --output results.json

# Enable verbose logging
npm start -- --verbose
```

### Command Line Options

| Option | Description | Default |
|--------|-------------|---------|
| `-d, --directories <dirs>` | Comma-separated list of directories to scan (relative to repo) | Entire repository |
| `-f, --fields-csv <path>` | Path to ECS fields CSV file | `fields.csv` |
| `-r, --repo <path>` | Path to repository directory to analyze | `./repo` |
| `-o, --output <path>` | Output file for results (JSON format) | Console only |
| `--include-tests` | Include test directories in analysis | Excluded by default |
| `--verbose` | Enable verbose logging | Disabled |

### Test Directory Exclusion

By default, ECS Detective excludes test-related directories and files to focus on production code:

**Excluded patterns:**
- `**/test/**` - Test directories
- `**/tests/**` - Tests directories  
- `**/__tests__/**` - Jest test directories
- `**/*.test.*` - Test files (e.g., `*.test.js`, `*.test.ts`)
- `**/*.spec.*` - Spec files (e.g., `*.spec.js`, `*.spec.ts`)

Use `--include-tests` to analyze test code and verify ECS field usage in test fixtures, mocks, and test utilities.

## Output

The tool provides comprehensive statistics including:

### File Statistics
- Total number of files parsed
- Files containing only core ECS fields
- Files containing custom/vendor fields
- **File type breakdown** (TypeScript, JavaScript, JSON, YAML, etc.)
- **Skipped files list** with reasons (file type not supported, empty files, etc.)

### Core ECS Field Analysis
- Total number of unique core fields referenced
- Top core fields by usage count (descending order)
- Total occurrences of core field references

### Custom/Vendor Field Analysis
- Total number of unique custom/vendor fields referenced
- Top custom/vendor fields by usage count (descending order)
- Total occurrences of custom/vendor field references

### Example Output

```
📊 Analysis Results:
==================================================

📁 File Statistics:
Total files parsed: 15,432
Files with ONLY core ECS fields: 1,234
Files with custom/vendor fields: 2,345
Files skipped: 23

📂 File Types Analyzed:
  📘 typescript: 8,901 files
  📄 json: 3,210 files
  📙 javascript: 2,456 files
  📝 markdown: 654 files
  📋 yaml: 211 files

⚠️  Skipped Files:
  1. /path/to/large_graph.json
     → File type not supported or excluded by patterns
  2. /path/to/empty_file.js
     → Empty file or failed to read content
  ... and 21 more files

🎯 Core ECS Field Usage:
Total core fields referenced: 156

Top 10 core fields by usage:
  1. @timestamp - 1,234 occurrences
  2. message - 987 occurrences
  3. host.name - 756 occurrences
  4. user.name - 543 occurrences
  5. event.category - 432 occurrences
  ...

🔧 Custom/Vendor Field Usage:
Total custom/vendor fields referenced: 89

Top 10 custom/vendor fields by usage:
  1. kibana.space.id - 234 occurrences
  2. custom.field.name - 123 occurrences
  3. vendor.specific.field - 98 occurrences
  ...
```

## How ECS Detective Works

1. **🔍 ECS Field Loading**: Downloads the latest ECS field definitions from the official GitHub repository
2. **📁 Repository Scanning**: Recursively scans specified directories for relevant file types
3. **🧠 Enhanced TypeScript Analysis**: 
   - Detects Elasticsearch client method calls (`client.search`, `client.index`, etc.)
   - Extracts fields from query DSL, aggregations, and mappings
   - Parses TypeScript interfaces and type definitions
   - Analyzes script fields and bulk operations
4. **⚡ Field Extraction**: Uses advanced pattern matching to extract field references from various file formats
5. **🎯 Classification**: Compares extracted fields against core ECS definitions to categorize them
6. **🧹 Artifact Filtering**: Applies comprehensive filtering to exclude development artifacts, UI configurations, and non-field references
7. **📊 Report Generation**: Produces detailed statistics and optionally exports results to JSON

## File Type Support

The analyzer supports the following file types:

- **JavaScript/TypeScript**: `.js`, `.jsx`, `.ts`, `.tsx`
- **Configuration**: `.json`, `.yml`, `.yaml`
- **Documentation**: `.md`
- **Text files**: `.txt`

## Field Detection Patterns

The tool uses sophisticated pattern matching to detect field references:

### General Patterns
- String literals: `'field.name'`, `"field.name"`
- Object property access: `obj.field.name`
- Template literals: `` `${field.name}` ``
- JSON keys and values
- YAML field definitions

### TypeScript-Specific Patterns
- **Elasticsearch Client Queries**: `client.search({ query: { term: { 'user.name': value } } })`
- **Aggregations**: `{ aggs: { by_user: { terms: { field: 'user.id' } } } }`
- **Index Operations**: `client.index({ body: { 'event.category': 'security' } })`
- **Mapping Definitions**: `{ properties: { 'host.ip': { type: 'ip' } } }`
- **Script Fields**: `doc['field.name'].value`, `params._source['field.name']`
- **Bulk Operations**: Field extraction from bulk document bodies
- **TypeScript Interfaces**: `interface Log { 'user.name': string }`
- **Type Definitions**: `type Fields = { 'event.action': string }`

## Configuration

### ECS Fields Source

By default, the tool downloads the latest ECS field definitions from:
```
https://raw.githubusercontent.com/elastic/ecs/master/generated/csv/fields.csv
```

You can provide a custom CSV file using the `--fields-csv` option.

### Excluded Patterns

The scanner automatically excludes:
- `node_modules` directories
- Build artifacts (`dist`, `build`, `target`)
- Test files and directories
- Minified files (`.min.js`, `.bundle.js`)
- Source maps (`.map` files)
- Documentation directories

## Troubleshooting

### Common Issues

1. **Repository not found**: Ensure the Kibana repository path is correct
2. **No fields detected**: Check that the ECS fields CSV is accessible and properly formatted
3. **Memory issues**: For very large repositories, consider scanning specific directories instead of the entire repo

### Verbose Mode

Use `--verbose` flag to get detailed logging for debugging:
```bash
npm start -- --verbose
```

## Development

### Running Tests

```bash
npm test
```

### Project Structure

```
src/
├── index.js          # CLI interface and main entry point
├── analyzer.js       # Main analysis orchestrator
├── ecs-fetcher.js    # ECS field definitions fetcher
├── field-parser.js   # Field extraction and parsing logic
└── file-scanner.js   # Repository file scanning
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Add tests if applicable
5. Submit a pull request

## License

MIT License - see LICENSE file for details.
