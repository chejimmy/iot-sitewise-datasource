import { DataFrame, DataQueryRequest, DataQueryResponse, LoadingState, TimeRange, dateTime } from '@grafana/data';
import { QueryType, SitewiseQuery } from 'types';

// The time range (in minutes) to always request for regardless of cache.
const ALWAYS_REFRESH_LAST_X_MINUTES = 15;
const TIME_SERIES_QUERY_TYPES = new Set<QueryType>([
  QueryType.PropertyValueHistory,
  QueryType.PropertyInterpolated,
  QueryType.PropertyAggregate,
]);

type QueryCacheId = string;
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
  ]);
}
export function parseSiteWiseQueriesCacheId(queries: SitewiseQuery[]): QueryCacheId {
  const cacheIds = queries.map(parseSiteWiseQueryCacheId).sort();

  return JSON.stringify(cacheIds);
}

type CacheTime = string;
interface CachedQueryInfo {
  query: SitewiseQuery;
  dataFrame: DataFrame;
}
interface DataFrameCacheInfo {
  queries: CachedQueryInfo[],
  range: TimeRange;
}
type RelativeTimeDataFramesMap = Map<CacheTime, DataFrameCacheInfo>;

export interface TimeSeriesCacheInfo {
  cachedResponse: DataQueryResponse;
  paginatingRequest: DataQueryRequest<SitewiseQuery>;
}

/**
 * This class is a time series cache for storing data frames.
 */
export class TimeSeriesCache {
  private responseDataMap = new Map<QueryCacheId, RelativeTimeDataFramesMap>();

  // FIXME: do not cache property value (latest value)
  set(request: DataQueryRequest<SitewiseQuery>, response: DataQueryResponse) {
    // this.prevRequest = request;
    // this.prevResponse = response;

    // TODO: restrict to relative time from now only
    // Set cache for time series data only
    const {
      targets: queries,
      range,
    } = request;
    const { raw: { from } } = range;
    const queryIdMap = new Map(queries.map(q => [q.refId, q]));

    const queryCacheId = parseSiteWiseQueriesCacheId(queries);
    const responseTimeMap = this.responseDataMap.get(queryCacheId) || new Map<CacheTime, DataFrameCacheInfo>();
    this.responseDataMap.set(queryCacheId, responseTimeMap);

    // TODO: restrict to relative time from now
    if (typeof from === 'string') {
      responseTimeMap.set(from, {
        queries: response.data.map((dataFrame: DataFrame) => {
          // FIXME: remove usages of non-null
          const query = queryIdMap.get(dataFrame.refId!)!;
          return {
            query,
            dataFrame: dataFrame,
          };
        }),
        // dataFrames: response.data,
        range: range,
      });
    }
  }

  get(request: DataQueryRequest<SitewiseQuery>): TimeSeriesCacheInfo | undefined {
    const { range: requestRange, requestId, targets: queries } = request;
    const { raw: { from}  } = requestRange;

    // TODO: restrict to relative time from now only
    // Set cache for time series data only
    if (typeof from !== 'string') {
      return undefined;
    }

    const queryCacheId = parseSiteWiseQueriesCacheId(queries);
    const cachedDataInfo = this.responseDataMap.get(queryCacheId)?.get(from);
    
    if (cachedDataInfo == null || !TimeSeriesCache.isCacheRequestOverlapping(cachedDataInfo.range, requestRange)) {
      return undefined;
    }

    // TODO: match the range - if cache range overlap with request and cache from before/same as request range
    // see matchRequest
    // const queryIdTypeMap = new Map<string, QueryType>(queries.map(q => [q.refId, q.queryType]));
    const cachedDataFrames = TimeSeriesCache.trimTimeSeriesDataFrames(cachedDataInfo.queries, requestRange);

    // TODO: need to trim the data; be careful about Expand Time Range
    return {
      cachedResponse: {
        data: cachedDataFrames,
        key: requestId,
        state: LoadingState.Streaming,
      },
      paginatingRequest: this.getPaginatingRequest(request),
    };
  }

  /**
   * Check whether the cached time range is overlapping with the request and covers the start of the request.
   */
  static isCacheRequestOverlapping(cacheRange: TimeRange, requestRange: TimeRange): boolean {
    const { from: cacheFrom, to: cacheTo } = cacheRange;
    const { from: requestFrom } = requestRange;

    /*
     * True if both request and cache start at the same time.
     *
     * Positive example (same from time):
     *   cache:   <from>...
     *   request: <from>...
     */
    if (requestFrom.isSame(cacheFrom)) {
      return true;
    }

    /*
     * True if cache starts before request starts and overlaps the request start time
     *
     * Positive example (cache from and to wrap around request from):
     *   cache:   <from>......<to>
     *   request: ......<from>....(disregard to)
     *
     * Negative example (cache from and to both before request):
     *   cache:   <from>.<to>.......
     *   request: ...........<from>.(disregard to)
     */
    if (cacheFrom.isBefore(requestFrom) && requestFrom.isBefore(cacheTo)) {
      return true;
    }

    return false;
  }

  static trimTimeSeriesDataFrames(cachedQueryInfos: CachedQueryInfo[], requestRange: TimeRange): DataFrame[] {
    return cachedQueryInfos
      .map((cachedQueryInfo) => {
        const { query: { queryType }, dataFrame } = cachedQueryInfo;
        if (queryType === QueryType.PropertyValue) {
          return {
            fields: [],
            length: 0,
          };
        }

        if (TIME_SERIES_QUERY_TYPES.has(queryType)) {
          return TimeSeriesCache.trimTimeSeriesDataFrame(dataFrame, requestRange);
        }

        // No trimming needed
        return dataFrame;
      });
  }

  private static trimTimeSeriesDataFrame(dataFrame: DataFrame, requestRange: TimeRange): DataFrame {
    return {
      ...dataFrame,
    };
  }

  // FIXME: account for cache end time
  private getPaginatingRequest(request: DataQueryRequest<SitewiseQuery>) {
    // FIXME: always request for property value (latest value)

    const { range } = request;
    const last15Min = dateTime(range.to).subtract(ALWAYS_REFRESH_LAST_X_MINUTES, 'minutes');
    // range from the last 15 min if the last 15 min is between the time range [from, to]
    const rangeFrom = last15Min.isBefore(range.from) ? range.from : last15Min;
    
    return {
      ...request,
      range: {
        ...range,
        // FIXME: might not always 15
        from: rangeFrom,
      },
    };
  }
}
