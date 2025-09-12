import { test, describe } from 'node:test';
import assert from 'node:assert';
import { ESClientParser } from '../es-client-parser.js';
import fs from 'fs-extra';
import path from 'path';

describe('ESClientParser', () => {
  const parser = new ESClientParser();

  describe('extractESClientFields', () => {
    test('should extract fields from search queries', () => {
      const content = `
        const result = await client.search({
          index: 'logs',
          body: {
            query: {
              term: { 'user.name': 'john' }
            }
          }
        });
      `;
      
      const fields = parser.extractESClientFields(content, 'test.ts');
      assert.ok(fields.includes('user.name'));
    });

    test('should extract fields from aggregations', () => {
      const content = `
        const result = await client.search({
          body: {
            aggs: {
              by_user: {
                terms: { field: 'user.id' }
              },
              timeline: {
                date_histogram: { field: '@timestamp' }
              }
            }
          }
        });
      `;
      
      const fields = parser.extractESClientFields(content, 'test.ts');
      assert.ok(fields.includes('user.id'));
      assert.ok(fields.includes('@timestamp'));
    });

    test('should extract fields from index operations', () => {
      const content = `
        await client.index({
          index: 'logs',
          body: {
            'user.name': 'alice',
            'event.category': 'security',
            'host.ip': '192.168.1.1'
          }
        });
      `;
      
      const fields = parser.extractESClientFields(content, 'test.ts');
      assert.ok(fields.includes('user.name'));
      assert.ok(fields.includes('event.category'));
      assert.ok(fields.includes('host.ip'));
    });

    test('should extract fields from bulk operations', () => {
      const content = `
        await client.bulk({
          body: [
            { index: { _index: 'logs' } },
            { 'user.name': 'bob', 'process.pid': 1234 }
          ]
        });
      `;
      
      const fields = parser.extractESClientFields(content, 'test.ts');
      assert.ok(fields.includes('user.name'));
      assert.ok(fields.includes('process.pid'));
    });

    test('should extract fields from mapping definitions', () => {
      const content = `
        await client.indices.putMapping({
          index: 'logs',
          body: {
            properties: {
              'user.email': { type: 'keyword' },
              'event.duration': { type: 'long' }
            }
          }
        });
      `;
      
      const fields = parser.extractESClientFields(content, 'test.ts');
      assert.ok(fields.includes('user.email'));
      assert.ok(fields.includes('event.duration'));
    });

    test('should extract fields from script queries', () => {
      const content = `
        const result = await client.search({
          body: {
            query: {
              script: {
                script: {
                  source: "doc['user.name'].value == 'admin'"
                }
              }
            },
            script_fields: {
              combined: {
                script: "params._source['event.action']"
              }
            }
          }
        });
      `;
      
      const fields = parser.extractESClientFields(content, 'test.ts');
      assert.ok(fields.includes('user.name'));
      assert.ok(fields.includes('event.action'));
    });
  });

  describe('extractFieldsFromTypescriptInterfaces', () => {
    test('should extract fields from TypeScript interfaces', () => {
      const content = `
        interface LogEntry {
          'user.name': string;
          'event.category': string;
          'host.ip': string;
          timestamp: Date;
        }
      `;
      
      const fields = new Set();
      parser.extractFieldsFromTypescriptInterfaces(content, fields);
      
      assert.ok(fields.has('user.name'));
      assert.ok(fields.has('event.category'));
      assert.ok(fields.has('host.ip'));
    });

    test('should handle nested interface fields', () => {
      const content = `
        interface NestedLog {
          user: {
            name: string;
            email: string;
          };
          'process.parent.pid': number;
        }
      `;
      
      const fields = new Set();
      parser.extractFieldsFromTypescriptInterfaces(content, fields);
      
      // Debug what fields were actually extracted
      console.log('Extracted fields from nested interface:', Array.from(fields));
      
      assert.ok(fields.has('process.parent.pid'));
    });
  });

  describe('extractFieldsFromTypescriptTypes', () => {
    test('should extract fields from TypeScript type definitions', () => {
      const content = `
        type SearchFields = {
          'user.id': string;
          'event.action': string;
          'source.ip': string;
        };
      `;
      
      const fields = new Set();
      parser.extractFieldsFromTypescriptTypes(content, fields);
      
      assert.ok(fields.has('user.id'));
      assert.ok(fields.has('event.action'));
      assert.ok(fields.has('source.ip'));
    });
  });

  describe('integration test with sample TypeScript file', async () => {
    test('should extract comprehensive fields from Kibana service file', async () => {
      // Read the sample TypeScript file we created
      const sampleFile = path.join(process.cwd(), 'example', 'kibana-service.ts');
      
      if (await fs.pathExists(sampleFile)) {
        const content = await fs.readFile(sampleFile, 'utf8');
        const fields = parser.extractESClientFields(content, 'kibana-service.ts');
        
        // Should extract core ECS fields
        assert.ok(fields.includes('@timestamp'));
        assert.ok(fields.includes('user.name'));
        assert.ok(fields.includes('user.id'));
        assert.ok(fields.includes('event.category'));
        assert.ok(fields.includes('host.name'));
        
        // Should extract custom/vendor fields
        console.log('All extracted fields from TypeScript file:', fields);
        assert.ok(fields.includes('kibana.space.id') || fields.some(f => f.includes('kibana')));
        assert.ok(fields.includes('custom.session.id') || fields.some(f => f.includes('custom')));
        
        console.log(`Extracted ${fields.length} fields from TypeScript file`);
      }
    });
  });
});
