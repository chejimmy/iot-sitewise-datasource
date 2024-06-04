import { DataQueryRequest } from '@grafana/data';
import { SitewiseQuery } from 'types';

export type RequestCacheId = string;

export function parseSiteWiseRequestCacheId(request: DataQueryRequest<SitewiseQuery>): RequestCacheId {
  const { targets, range: { raw: { from } } } = request;

  return JSON.stringify([from, parseSiteWiseQueriesCacheId(targets)]);
}

type QueryCacheId = string;

export function parseSiteWiseQueriesCacheId(queries: SitewiseQuery[]): QueryCacheId {
  const cacheIds = queries.map(parseSiteWiseQueryCacheId).sort();

  return JSON.stringify(cacheIds);
}

/**
 * Parse query to cache id.
 */
function parseSiteWiseQueryCacheId(query: SitewiseQuery): QueryCacheId {
  const {
    queryType,
    region,
    responseFormat,
    assetId,
    assetIds,
    propertyId,
    propertyAlias,
    quality,
    resolution,
    lastObservation,
    flattenL4e,
    maxPageAggregations,
    datasource,
    timeOrdering,
    loadAllChildren,
    hierarchyId,
    modelId,
    filter,
  } = query;

  /*
   * Stringify to preserve undefined optional properties
   * `Undefined` optional properties are preserved as `null`
   */
  return JSON.stringify([
    queryType,
    region,
    responseFormat,
    assetId,
    assetIds,
    propertyId,
    propertyAlias,
    quality,
    resolution,
    lastObservation,
    flattenL4e,
    maxPageAggregations,
    datasource?.type,
    datasource?.uid,
    timeOrdering,
    loadAllChildren,
    hierarchyId,
    modelId,
    filter,
  ]);
}
