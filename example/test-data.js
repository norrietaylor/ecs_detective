// Sample Kibana code with ECS field usage examples

const searchQuery = {
  query: {
    bool: {
      must: [
        { term: { 'user.name': 'john' } },
        { term: { 'host.ip': '192.168.1.1' } },
        { range: { '@timestamp': { gte: 'now-1d' } } }
      ]
    }
  },
  aggs: {
    by_event_category: {
      terms: { field: 'event.category' }
    },
    by_process_name: {
      terms: { field: 'process.name' }
    }
  }
};

// Custom Kibana fields (not in core ECS)
const kibanaFields = {
  'kibana.space.id': 'default',
  'kibana.version': '8.0.0',
  'custom.dashboard.id': 'dashboard-123'
};

// More ECS fields
const logEntry = {
  message: 'User login attempt',
  'event.action': 'user-login',
  'event.outcome': 'success',
  'source.ip': '10.0.0.1',
  'destination.port': 443,
  'user.id': 'user-456',
  'url.path': '/api/login'
};
