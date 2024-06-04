import { AbsoluteTimeRange, DataFrame, DataQueryRequest, DataQueryResponse, LoadingState, TimeRange, dateTime } from '@grafana/data';
import { trimTimeSeriesDataFrame, trimTimeSeriesDataFrameReversedTime } from 'dataFrameUtils';
import { isTimeRangeCoveringStart, minDateTime } from 'timeRangeUtils';
import { QueryType, SiteWiseTimeOrder, SitewiseQuery } from 'types';

// The time range (in minutes) to always request for regardless of cache.
const DEFAULT_TIME_SERIES_REFRESH_MINUTES = 15;
const TIME_SERIES_QUERY_TYPES = new Set<QueryType>([
  QueryType.PropertyAggregate,
  QueryType.PropertyInterpolated,
  QueryType.PropertyValue,
  QueryType.PropertyValueHistory,
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
  cachedResponse: {
    start?: DataQueryResponse;
    end?: DataQueryResponse;
  };
  paginatingRequest: DataQueryRequest<SitewiseQuery>;
}

/**
 * This class is a time series cache for storing data frames.
 */
export class TimeSeriesCache {
  private responseDataMap = new Map<QueryCacheId, RelativeTimeDataFramesMap>();

  /**
   * Set the cache for the given query and response.
   * @param request The query used to get the response
   * @param response The response to set the cache for
   */
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

    // TODO: restrict to relative time from now
    if (typeof from !== 'string') {
      return;
    }

    const queryIdMap = new Map(queries.map(q => [q.refId, q]));

    const queryCacheId = parseSiteWiseQueriesCacheId(queries);
    const responseTimeMap = this.responseDataMap.get(queryCacheId) || new Map<CacheTime, DataFrameCacheInfo>();
    this.responseDataMap.set(queryCacheId, responseTimeMap);

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

  /**
   * Get the cached response for the given request.
   * @param request The request to get the cached response for
   * @returns The cached response if found, undefined otherwise
   */
  get(request: DataQueryRequest<SitewiseQuery>): TimeSeriesCacheInfo | undefined {
    const { range: requestRange } = request;

    if (!this.isCacheableTimeRange(request.range)) {
      return undefined;
    }

    const cachedDataInfo = this.lookupCachedData(request);
    
    if (cachedDataInfo == null || !isTimeRangeCoveringStart(cachedDataInfo.range, requestRange)) {
      return undefined;
    }

    return this.parseCacheInfo(cachedDataInfo, request);
  }

  /**
   * Check if the given TimeRange is cacheable. A TimeRange is cacheable if it is relative and has data 15 minutes ago.
   * @param TimeRange to check
   * @returns true if the TimeRange is cacheable, false otherwise
   */
  private isCacheableTimeRange({ from, raw: { from: rawFrom }, to }: TimeRange) {
    // TODO: restrict to relative time from now only
    // Set cache for time series data only
    if (typeof rawFrom !== 'string') {
      return false;
    }

    const defaultRefreshAgo = dateTime(to).subtract(DEFAULT_TIME_SERIES_REFRESH_MINUTES, 'minutes');
    if (!from.isBefore(defaultRefreshAgo)) {
      return false;
    }

    return true;
  }

  /**
   * Lookup cached data for the given request.
   * @param request DataQueryRequest<SitewiseQuery> request to lookup cached data for
   * @returns Cached data info if found, undefined otherwise
   */
  private lookupCachedData(request: DataQueryRequest<SitewiseQuery>) {
    const { range: requestRange, targets: queries } = request;
    const { raw: { from: rawFrom }  } = requestRange;

    // TODO: restrict to relative time from now only
    // Set cache for time series data only
    if (typeof rawFrom !== 'string') {
      return undefined;
    }

    const defaultRefreshAgo = dateTime(requestRange.to).subtract(DEFAULT_TIME_SERIES_REFRESH_MINUTES, 'minutes');
    if (!requestRange.from.isBefore(defaultRefreshAgo)) {
      return undefined;
    }

    const queryCacheId = parseSiteWiseQueriesCacheId(queries);
    const cachedDataInfo = this.responseDataMap.get(queryCacheId)?.get(rawFrom);
    return cachedDataInfo;
  }

  private parseCacheInfo(cachedDataInfo: DataFrameCacheInfo, request: DataQueryRequest<SitewiseQuery>) {
    const { range: requestRange, requestId } = request;

    const paginatingRequestRange = TimeSeriesCache.getPaginatingRequestRange(requestRange, cachedDataInfo.range);

    const cachedDataFrames = TimeSeriesCache.trimTimeSeriesDataFrames(cachedDataInfo.queries, {
      from: requestRange.from.valueOf(),
      to: paginatingRequestRange.from.valueOf(),
    });
    const cachedDataFramesEnding = TimeSeriesCache.trimTimeSeriesDataFramesEnding(cachedDataInfo.queries, {
      from: requestRange.from.valueOf(),
      to: paginatingRequestRange.from.valueOf(),
    });

    const paginatingRequest = TimeSeriesCache.getPaginatingRequest(request, paginatingRequestRange);

    return {
      cachedResponse: {
        start: {
          data: cachedDataFrames,
          key: requestId,
          state: LoadingState.Streaming,
        },
        end: {
          data: cachedDataFramesEnding,
          key: requestId,
          state: LoadingState.Streaming,
        },
      },
      paginatingRequest,
    };
  }

  static trimTimeSeriesDataFrames(cachedQueryInfos: CachedQueryInfo[], cacheRange: AbsoluteTimeRange): DataFrame[] {
    return cachedQueryInfos
      .map((cachedQueryInfo) => {
        const { query: { queryType, timeOrdering }, dataFrame } = cachedQueryInfo;
        if (timeOrdering === SiteWiseTimeOrder.DESCENDING) {
          // Decending ordering data frame are added at the end of the request to respect the ordering
          // See related function - trimTimeSeriesDataFramesEnding()
          return {
            ...dataFrame,
            fields: [],
            length: 0,
          };
        }

        // Always refresh PropertyValue
        if (queryType === QueryType.PropertyValue) {
          return {
            ...dataFrame,
            fields: [],
            length: 0,
          };
        }

        if (TIME_SERIES_QUERY_TYPES.has(queryType)) {
          return trimTimeSeriesDataFrame({
            dataFrame: cachedQueryInfo.dataFrame,
            timeRange: cacheRange,
            lastObservation: cachedQueryInfo.query.lastObservation,
          });
        }

        // No trimming needed
        return dataFrame;
      });
  }

  static trimTimeSeriesDataFramesEnding(cachedQueryInfos: CachedQueryInfo[], cacheRange: AbsoluteTimeRange): DataFrame[] {
    return cachedQueryInfos
      .filter((cachedQueryInfo) => (cachedQueryInfo.query.timeOrdering === SiteWiseTimeOrder.DESCENDING))
      .map((cachedQueryInfo) => {
        return trimTimeSeriesDataFrameReversedTime({
          dataFrame: cachedQueryInfo.dataFrame,
          lastObservation: cachedQueryInfo.query.lastObservation,
          timeRange: cacheRange,
        });
      });
  }

  static getPaginatingRequest(request: DataQueryRequest<SitewiseQuery>, range: TimeRange) {
    const {
      targets,
    } = request;
    
    return {
      ...request,
      range,
      targets: targets.filter(({ queryType }) => TIME_SERIES_QUERY_TYPES.has(queryType)),
    };
  }

  private static getPaginatingRequestRange(requestRange: TimeRange, cacheRange: TimeRange) {
    const defaultRefreshAgo = dateTime(requestRange.to).subtract(DEFAULT_TIME_SERIES_REFRESH_MINUTES, 'minutes');
    const from = minDateTime(cacheRange.to, defaultRefreshAgo);

    return {
      from,
      to: requestRange.to,
      raw: requestRange.raw,
    };
  }
}
