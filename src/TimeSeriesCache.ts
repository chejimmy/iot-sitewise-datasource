import { AbsoluteTimeRange, ArrayVector, DataFrame, DataQueryRequest, DataQueryResponse, LoadingState, TimeRange, dateTime } from '@grafana/data';
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

    // TODO: restrict to relative time from now
    if (typeof from !== 'string') {
      return;
    }

    let times = response.data[0].fields[0].values.toArray()
    let prev = Number.MAX_SAFE_INTEGER;
    for (let i = 0; i < times.length; i++) {
      if (times > prev) {
        debugger;
      }
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

  get(request: DataQueryRequest<SitewiseQuery>): TimeSeriesCacheInfo | undefined {
    const { range: requestRange, requestId, targets: queries } = request;
    const { raw: { from: rawFrom }  } = requestRange;

    // TODO: restrict to relative time from now only
    // TODO: restrict to greater than 15 minutes
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
    
    if (cachedDataInfo == null || !TimeSeriesCache.isCacheRequestOverlapping(cachedDataInfo.range, requestRange)) {
      return undefined;
    }

    const paginatingRequestRange = TimeSeriesCache.getPaginatingRequestRange(requestRange, cachedDataInfo.range);
    
    const trimFrom = requestRange.from.valueOf();
    const trimTo = paginatingRequestRange.from.valueOf();
    console.log('trimFrom', new Date(trimFrom));
    console.log('trimTo', new Date(trimTo));

    const cachedDataFrames = TimeSeriesCache.trimTimeSeriesDataFrames(cachedDataInfo.queries, {
      from: requestRange.from.valueOf(),
      to: paginatingRequestRange.from.valueOf(),
    });
    const cachedDataFramesEnding = TimeSeriesCache.trimTimeSeriesDataFramesEnding(cachedDataInfo.queries, {
      from: requestRange.from.valueOf(),
      to: paginatingRequestRange.from.valueOf(),
    });

    const timeVals = cachedDataFramesEnding[0].fields[0].values;
    console.log('first', cachedDataFramesEnding[0].fields[0].values[0])
    console.log('last', cachedDataFramesEnding[0].fields[0].values[timeVals.length -1])

    const paginatingRequest = this.getPaginatingRequest(request, paginatingRequestRange);

    return {
      cachedResponse: {
        start: {
          data: cachedDataFrames,
          key: requestId,
          // FIXME: set state according to paginatingRequest
          state: LoadingState.Streaming,
        },
        end: {
          data: cachedDataFramesEnding,
          key: requestId,
          // FIXME: set state according to paginatingRequest
          state: LoadingState.Streaming,
        },
      },
      paginatingRequest,
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

  static trimTimeSeriesDataFrames(cachedQueryInfos: CachedQueryInfo[], cacheRange: AbsoluteTimeRange): DataFrame[] {
    return cachedQueryInfos
      .map((cachedQueryInfo) => {
        const { query: { queryType, timeOrdering }, dataFrame } = cachedQueryInfo;
        if (timeOrdering === SiteWiseTimeOrder.DESCENDING) {
          return {
            ...dataFrame,
            fields: [],
            length: 0,
          };
        }

        if (queryType === QueryType.PropertyValue) {
          return {
            ...dataFrame,
            fields: [],
            length: 0,
          };
        }

        if (TIME_SERIES_QUERY_TYPES.has(queryType)) {
          return TimeSeriesCache.trimTimeSeriesDataFrame(cachedQueryInfo, cacheRange);
        }

        // No trimming needed
        return dataFrame;
      });
  }

  static trimTimeSeriesDataFramesEnding(cachedQueryInfos: CachedQueryInfo[], cacheRange: AbsoluteTimeRange): DataFrame[] {
    return cachedQueryInfos
      .filter((cachedQueryInfo) => (cachedQueryInfo.query.timeOrdering === SiteWiseTimeOrder.DESCENDING))
      .map((cachedQueryInfo) => {
        return TimeSeriesCache.trimTimeSeriesDataFrame(cachedQueryInfo, cacheRange);
      });
  }

  /**
   * 
   * @param cachedQueryInfo 
   * @param cacheRange the range of cache to include; `cacheRange.from` is exclusive and `cacheRange.to` is inclusive
   * @returns 
   */
  private static trimTimeSeriesDataFrame(cachedQueryInfo: CachedQueryInfo, { from, to }: AbsoluteTimeRange): DataFrame {
    // 1. find the start index of the cache range
    const { dataFrame: { fields }, query: { timeOrdering } } = cachedQueryInfo;
    const timeField = fields.find(field => field.name === 'time')!;

    let timeValues = timeField.values.toArray();
    if (timeOrdering === SiteWiseTimeOrder.DESCENDING) {
      // Clone before reverse in place
      timeValues = [...timeValues];
      timeValues.reverse();
    }

    let fromIndex = timeValues.findIndex(time => time > from);  // from is exclusive
    if (fromIndex === -1) {
      // no time value within range; include not data in the slice
      fromIndex = timeValues.length ;
    }

    let toIndex = timeValues.findIndex(time => time >= to);  // to is inclusive
    if (toIndex === -1) {
      // all time values before `to`
      toIndex = timeValues.length;
    }

    if (timeOrdering === SiteWiseTimeOrder.DESCENDING) {
      // Reverse the indices
      const origFromIndex = fromIndex;
      fromIndex = timeValues.length - 1 - toIndex;
      toIndex = timeValues.length - 1 - origFromIndex;
    }

    const trimmedFields = fields.map(field => ({
      ...field,
      values: new ArrayVector(field.values.toArray().slice(fromIndex, toIndex)),
    }));
    
    // TODO: be careful about Expand Time Range
    return {
      ...cachedQueryInfo.dataFrame,
      fields: trimmedFields,
      length: trimmedFields[0].values.length,
    };
  }

  // FIXME: account for cache end time
  private getPaginatingRequest(request: DataQueryRequest<SitewiseQuery>, range: TimeRange) {
    // FIXME: always request for property value (latest value)
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
    const { to: cacheTo } = cacheRange;
    const defaultRefreshAgo = dateTime(requestRange.to).subtract(DEFAULT_TIME_SERIES_REFRESH_MINUTES, 'minutes');
    const from = defaultRefreshAgo.isBefore(cacheTo) ? defaultRefreshAgo : cacheTo;

    return {
      from,
      to: requestRange.to,
      raw: requestRange.raw,
    };
  }
}
