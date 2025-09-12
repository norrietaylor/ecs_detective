# TypeScript Analysis Features

ECS Detective provides enhanced analysis capabilities specifically for TypeScript files, with deep introspection of Elasticsearch client API usage.

## Enhanced TypeScript Analysis

When the tool encounters TypeScript files (`.ts`, `.tsx`), it automatically activates enhanced analysis mode that goes beyond basic pattern matching to understand Elasticsearch client usage patterns.

### Elasticsearch Client API Detection

The tool detects and analyzes the following ES client patterns:

#### 1. Search Operations
```typescript
const result = await client.search({
  index: 'logs',
  body: {
    query: {
      bool: {
        must: [
          { term: { 'user.name': 'admin' } },
          { range: { '@timestamp': { gte: 'now-1d' } } }
        ]
      }
    },
    aggs: {
      by_category: {
        terms: { field: 'event.category' }
      }
    }
  }
});
```
**Extracted fields**: `user.name`, `@timestamp`, `event.category`

#### 2. Index Operations
```typescript
await client.index({
  index: 'kibana-logs',
  body: {
    '@timestamp': new Date(),
    'user.id': userId,
    'event.action': 'login',
    'host.ip': remoteIP
  }
});
```
**Extracted fields**: `@timestamp`, `user.id`, `event.action`, `host.ip`

#### 3. Aggregation Queries
```typescript
const aggs = {
  timeline: {
    date_histogram: {
      field: '@timestamp',
      calendar_interval: '1h'
    },
    aggs: {
      unique_users: {
        cardinality: { field: 'user.name.keyword' }
      }
    }
  }
};
```
**Extracted fields**: `@timestamp`, `user.name.keyword`

#### 4. Mapping Definitions
```typescript
await client.indices.putMapping({
  index: 'logs',
  body: {
    properties: {
      'user.email': { type: 'keyword' },
      'event.duration': { type: 'long' },
      'process.pid': { type: 'integer' }
    }
  }
});
```
**Extracted fields**: `user.email`, `event.duration`, `process.pid`

#### 5. Bulk Operations
```typescript
await client.bulk({
  body: [
    { index: { _index: 'logs' } },
    {
      'user.name': 'alice',
      'event.category': 'authentication',
      'source.ip': '192.168.1.1'
    }
  ]
});
```
**Extracted fields**: `user.name`, `event.category`, `source.ip`

#### 6. Script Fields
```typescript
const scriptQuery = {
  script_fields: {
    user_info: {
      script: {
        source: "doc['user.name'].value + '-' + doc['user.id'].value"
      }
    }
  }
};
```
**Extracted fields**: `user.name`, `user.id`

### TypeScript Interface Analysis

The tool also extracts field definitions from TypeScript interfaces and types:

```typescript
interface LogDocument {
  '@timestamp': string;
  'user.name': string;
  'user.id': string;
  'event.category': string;
  'host.name': string;
  'kibana.space.id'?: string;
  'custom.session.id': string;
}

type SearchFields = {
  'event.action': string;
  'source.ip': string;
  'destination.port': number;
};
```
**Extracted fields**: `@timestamp`, `user.name`, `user.id`, `event.category`, `host.name`, `kibana.space.id`, `custom.session.id`, `event.action`, `source.ip`, `destination.port`

## Advanced Query Analysis

The TypeScript analyzer can handle complex nested queries and extract fields from:

- **Boolean queries**: `must`, `should`, `filter`, `must_not` clauses
- **Term-level queries**: `term`, `terms`, `range`, `exists`
- **Full-text queries**: `match`, `multi_match`, `query_string`
- **Compound queries**: Nested boolean logic
- **Script queries**: Field references in Painless scripts
- **Sort clauses**: Field-based sorting
- **Aggregation pipelines**: Complex aggregation hierarchies

## Performance Benefits

The enhanced TypeScript analysis provides:

1. **Higher Accuracy**: Understands context of field usage in ES operations
2. **Better Coverage**: Captures fields that simple pattern matching might miss
3. **Semantic Understanding**: Distinguishes between field names and other strings
4. **Contextual Analysis**: Understands the role of fields in different ES operations

## Example Analysis Results

For a typical Kibana TypeScript service file, the enhanced analysis might extract:

### Core ECS Fields (15 fields)
- `@timestamp` (3 occurrences)
- `user.name` (3 occurrences) 
- `event.category` (3 occurrences)
- `host.ip` (2 occurrences)
- `process.pid` (2 occurrences)

### Custom/Vendor Fields (24 fields)
- `kibana.space.id` (3 occurrences)
- `custom.dashboard.name` (2 occurrences)
- `kibana.version` (1 occurrence)

This level of detail helps identify both ECS adoption patterns and opportunities for field standardization in Kibana codebases.

## Usage

The enhanced TypeScript analysis is automatically activated for all `.ts` and `.tsx` files. No special configuration is required:

```bash
# Analyze TypeScript files with enhanced ES client detection
npm start -- --directories "x-pack/plugins" --verbose

# Focus on specific TypeScript services
npm start -- --directories "src/plugins/data" --output ts-analysis.json
```
