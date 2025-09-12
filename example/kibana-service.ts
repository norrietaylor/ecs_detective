import { ElasticsearchClient } from '@elastic/elasticsearch';

interface UserSearchParams {
  userId: string;
  timeRange: {
    from: string;
    to: string;
  };
}

interface LogDocument {
  '@timestamp': string;
  'user.name': string;
  'user.id': string;
  'event.category': string;
  'event.action': string;
  'host.name': string;
  'process.pid': number;
  'kibana.space.id'?: string;
  'custom.session.id': string;
}

export class KibanaSearchService {
  constructor(private esClient: ElasticsearchClient) {}

  async searchUserActivity(params: UserSearchParams) {
    const query = {
      bool: {
        must: [
          {
            term: {
              'user.id': params.userId
            }
          },
          {
            range: {
              '@timestamp': {
                gte: params.timeRange.from,
                lte: params.timeRange.to
              }
            }
          }
        ],
        filter: [
          {
            terms: {
              'event.category': ['authentication', 'process', 'network']
            }
          }
        ]
      }
    };

    return await this.esClient.search({
      index: 'kibana-logs-*',
      body: {
        query,
        aggs: {
          events_by_category: {
            terms: {
              field: 'event.category'
            }
          },
          timeline: {
            date_histogram: {
              field: '@timestamp',
              calendar_interval: '1h'
            },
            aggs: {
              unique_users: {
                cardinality: {
                  field: 'user.name.keyword'
                }
              }
            }
          },
          top_hosts: {
            terms: {
              field: 'host.name',
              size: 10
            }
          }
        },
        sort: [
          {
            '@timestamp': {
              order: 'desc'
            }
          }
        ]
      }
    });
  }

  async indexUserEvent(event: LogDocument) {
    return await this.esClient.index({
      index: 'kibana-logs',
      body: {
        '@timestamp': event['@timestamp'],
        'user.name': event['user.name'],
        'user.id': event['user.id'],
        'event.category': event['event.category'],
        'event.action': event['event.action'],
        'host.name': event['host.name'],
        'process.pid': event['process.pid'],
        'source.ip': '192.168.1.100',
        'destination.port': 443,
        'kibana.space.id': event['kibana.space.id'] || 'default',
        'custom.session.id': event['custom.session.id']
      }
    });
  }

  async bulkIndexEvents(events: LogDocument[]) {
    const body = events.flatMap(event => [
      { index: { _index: 'kibana-logs' } },
      {
        '@timestamp': event['@timestamp'],
        'user.name': event['user.name'],
        'event.category': event['event.category'],
        'host.ip': '10.0.0.1',
        'process.name': 'kibana',
        'url.path': '/api/search'
      }
    ]);

    return await this.esClient.bulk({ body });
  }

  async updateMapping() {
    return await this.esClient.indices.putMapping({
      index: 'kibana-logs',
      body: {
        properties: {
          '@timestamp': { type: 'date' },
          'user.name': { type: 'keyword' },
          'user.email': { type: 'keyword' },
          'event.category': { type: 'keyword' },
          'event.duration': { type: 'long' },
          'host.name': { type: 'keyword' },
          'host.ip': { type: 'ip' },
          'process.pid': { type: 'long' },
          'kibana.version': { type: 'keyword' },
          'custom.dashboard.name': { type: 'text' }
        }
      }
    });
  }

  async searchWithScript() {
    return await this.esClient.search({
      index: 'kibana-logs',
      body: {
        query: {
          bool: {
            must: [
              {
                script: {
                  script: {
                    source: "doc['user.name'].value == params.username",
                    params: {
                      username: 'admin'
                    }
                  }
                }
              }
            ]
          }
        },
        script_fields: {
          user_session: {
            script: {
              source: "params._source['user.name'] + '-' + params._source['event.action']"
            }
          }
        }
      }
    });
  }
}
