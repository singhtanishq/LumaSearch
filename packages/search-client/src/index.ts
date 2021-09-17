export { createSearchClient, checkSearchHealth } from './client';
export type { SearchClientConfig } from './client';
export { IndexManager } from './index-manager';
export type { IndexManagerOptions } from './index-manager';
export {
  mappingFor,
  webIndexMapping,
  codeIndexMapping,
  docsIndexMapping,
  verticalIndexName,
} from './mappings';
export type { MappingOptions } from './mappings';
export * from './search';
export type { Client as SearchClient } from '@elastic/elasticsearch';
