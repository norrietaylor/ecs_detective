import { test, describe } from 'node:test';
import assert from 'node:assert';
import { FieldParser } from '../field-parser.js';

describe('FieldParser', () => {
  const parser = new FieldParser();

  describe('isValidFieldName', () => {
    test('should validate correct field names', () => {
      assert.strictEqual(parser.isValidFieldName('user.name'), true);
      assert.strictEqual(parser.isValidFieldName('host.ip'), true);
      assert.strictEqual(parser.isValidFieldName('@timestamp'), false); // @ not allowed at start
      assert.strictEqual(parser.isValidFieldName('event.category'), true);
      assert.strictEqual(parser.isValidFieldName('process.parent.pid'), true);
    });

    test('should reject invalid field names', () => {
      assert.strictEqual(parser.isValidFieldName(''), false);
      assert.strictEqual(parser.isValidFieldName('a'), false); // too short
      assert.strictEqual(parser.isValidFieldName('ab'), false); // too short without dot
      assert.strictEqual(parser.isValidFieldName('user.'), false); // trailing dot
      assert.strictEqual(parser.isValidFieldName('.user'), false); // leading dot
      assert.strictEqual(parser.isValidFieldName('user..name'), false); // double dot
      assert.strictEqual(parser.isValidFieldName('user-name'), false); // hyphen not allowed
    });
  });

  describe('isECSField', () => {
    test('should correctly identify ECS fields', () => {
      const coreFields = new Set(['user.name', 'host.ip', 'event.category']);
      
      assert.strictEqual(parser.isECSField('user.name', coreFields), true);
      assert.strictEqual(parser.isECSField('host.ip', coreFields), true);
      assert.strictEqual(parser.isECSField('custom.field', coreFields), false);
    });

    test('should handle sub-fields of ECS fields', () => {
      const coreFields = new Set(['user.name', 'host.ip']);
      
      // Sub-fields should be considered ECS if parent is ECS
      assert.strictEqual(parser.isECSField('user.name.keyword', coreFields), true);
      assert.strictEqual(parser.isECSField('host.ip.raw', coreFields), true);
      assert.strictEqual(parser.isECSField('custom.field.keyword', coreFields), false);
    });
  });

  describe('extractFieldsFromContent', () => {
    test('should extract fields from JavaScript content - quoted only', () => {
      const jsContent = `
        const query = {
          field: 'user.name',
          value: 'user.email',
          timestamp: '@timestamp'
        };
        // This should NOT be detected (unquoted property access)
        console.log(process.parent.pid);
        // This should be detected (quoted field reference)
        const field = 'process.parent.pid';
      `;

      const fields = parser.extractFieldsFromContent(jsContent, 'test.js');
      assert.ok(fields.includes('user.name'));
      assert.ok(fields.includes('user.email'));
      assert.ok(fields.includes('@timestamp'));
      assert.ok(fields.includes('process.parent.pid'));
      // Verify that unquoted property access is NOT detected
      const processParentPidCount = fields.filter(f => f === 'process.parent.pid').length;
      assert.strictEqual(processParentPidCount, 1, 'Only quoted process.parent.pid should be detected');
    });

    test('should extract fields from JSON content', () => {
      const jsonContent = `{
        "mappings": {
          "properties": {
            "user.name": { "type": "keyword" },
            "event.category": { "type": "keyword" },
            "custom.field": { "type": "text" }
          }
        }
      }`;
      
      const fields = parser.extractFieldsFromContent(jsonContent, 'test.json');
      assert.ok(fields.includes('user.name'));
      assert.ok(fields.includes('event.category'));
      assert.ok(fields.includes('custom.field'));
    });

    test('should NOT extract JavaScript API calls and internals', () => {
      const jsContent = `
        // These should NOT be detected as they are JavaScript API calls
        router.versioned('/api', handler);
        logger.error('Something failed');
        z.infer<MyType>();
        Array.isArray(value);
        console.log(message);
        Object.keys(obj);
        Math.random();

        // These SHOULD be detected as they are quoted field references
        const query = { field: 'user.name' };
        const anotherField = 'event.category';
        const timestamp = '@timestamp';
      `;

      const fields = parser.extractFieldsFromContent(jsContent, 'test.js');

      // Should detect quoted field references
      assert.ok(fields.includes('user.name'));
      assert.ok(fields.includes('event.category'));
      assert.ok(fields.includes('@timestamp'));

      // Should NOT detect JavaScript API calls
      assert.ok(!fields.includes('router.versioned'));
      assert.ok(!fields.includes('logger.error'));
      assert.ok(!fields.includes('z.infer'));
      assert.ok(!fields.includes('Array.isArray'));
      assert.ok(!fields.includes('console.log'));
      assert.ok(!fields.includes('Object.keys'));
      assert.ok(!fields.includes('Math.random'));
    });

    test('should handle empty or invalid content gracefully', () => {
      assert.doesNotThrow(() => {
        parser.extractFieldsFromContent('', 'test.js');
        parser.extractFieldsFromContent(null, 'test.js');
        parser.extractFieldsFromContent(undefined, 'test.js');
      });
    });
  });

  describe('parseECSFields', () => {
    test('should parse valid CSV content', () => {
      const csvContent = `field,type,description
user.name,keyword,User name
host.ip,ip,Host IP address
event.category,keyword,Event category`;
      
      const fields = parser.parseECSFields(csvContent);
      assert.strictEqual(fields.size, 3);
      assert.ok(fields.has('user.name'));
      assert.ok(fields.has('host.ip'));
      assert.ok(fields.has('event.category'));
    });

    test('should handle CSV with different column order', () => {
      const csvContent = `type,field,description
keyword,user.name,User name
ip,host.ip,Host IP address`;
      
      const fields = parser.parseECSFields(csvContent);
      assert.strictEqual(fields.size, 2);
      assert.ok(fields.has('user.name'));
      assert.ok(fields.has('host.ip'));
    });

    test('should skip empty or invalid rows', () => {
      const csvContent = `field,type,description
user.name,keyword,User name
,keyword,Empty field
invalid-field,keyword,Invalid field name
host.ip,ip,Host IP address`;
      
      const fields = parser.parseECSFields(csvContent);
      assert.ok(fields.has('user.name'));
      assert.ok(fields.has('host.ip'));
      assert.ok(!fields.has(''));
      assert.ok(!fields.has('invalid-field'));
    });
  });
});
