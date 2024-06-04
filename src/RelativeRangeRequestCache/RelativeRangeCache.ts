import { DataFrame, DataQueryRequest, DataQueryResponse, LoadingState, TimeRange } from '@grafana/data';
import { isTimeRangeCoveringStart } from 'timeRangeUtils';
import { SitewiseQuery } from 'types';
import { RequestCacheId, parseSiteWiseRequestCacheId } from './cacheIdUtils';
import { CachedQueryInfo, TIME_SERIES_QUERY_TYPES } from './types';
import { trimTimeSeriesDataFrames, trimTimeSeriesDataFramesEnding } from './dataFrameUtils';
import { getPaginatingRequestRange, isCacheableTimeRange } from './timeRangeUtils';

interface DataFrameCacheInfo {
  queries: CachedQueryInfo[],
  range: TimeRange;
}

export interface RelativeRangeCacheInfo {
  cachedResponse: {
    start: DataQueryResponse;
    end: DataQueryResponse;
  };
  paginatingRequest: DataQueryRequest<SitewiseQuery>;
}

/**
 * Cache for relative range queries.
 * It caches the start and end of the range for each query.
 */
export class RelativeRangeCache {
  constructor(private responseDataMap: Map<RequestCacheId, DataFrameCacheInfo> = new Map<RequestCacheId, DataFrameCacheInfo>()) {}

  /**
   * Set the cache for the given query and response.
   * @param request The query used to get the response
   * @param response The response to set the cache for
   */
  set(request: DataQueryRequest<SitewiseQuery>, response: DataQueryResponse) {
    const {
      targets,
      range,
    } = request;

    if (!isCacheableTimeRange(range)) {
      return;
    }

    const requestCacheId = parseSiteWiseRequestCacheId(request);
    
    const queryIdMap = new Map(targets.map(q => [q.refId, q]));

    try {
      const queries = response.data.map((dataFrame: DataFrame) => {
        if (dataFrame.refId == null) {
          console.error('Response data frame without a refId, dataFrame: ', dataFrame);
          throw new Error('Response data frame without a refId!');
        }

        const query = queryIdMap.get(dataFrame.refId);
        if (query == null){
          console.error('Response data frame without a corresponding request target, dataFrame: ', dataFrame);
          throw new Error('Response data frame without a corresponding request target!');
        }

        return {
          query,
          dataFrame: dataFrame,
        };
      });

      this.responseDataMap.set(requestCacheId, {
        queries,
        range,
      });
    } catch (error) {
      // NOOP
    }
  }

  /**
   * Get the cached response for the given request.
   * @param request The request to get the cached response for
   * @returns The cached response if found, undefined otherwise
   */
  get(request: DataQueryRequest<SitewiseQuery>): RelativeRangeCacheInfo | undefined {
    const { range: requestRange } = request;

    if (!isCacheableTimeRange(request.range)) {
      return undefined;
    }

    const cachedDataInfo = this.lookupCachedData(request);
    
    if (cachedDataInfo == null || !isTimeRangeCoveringStart(cachedDataInfo.range, requestRange)) {
      return undefined;
    }

    return RelativeRangeCache.parseCacheInfo(cachedDataInfo, request);
  }

  /**
   * Lookup cached data for the given request.
   * @param request DataQueryRequest<SitewiseQuery> request to lookup cached data for
   * @returns Cached data info if found, undefined otherwise
   */
  private lookupCachedData(request: DataQueryRequest<SitewiseQuery>) {
    const requestCacheId = parseSiteWiseRequestCacheId(request);
    const cachedDataInfo = this.responseDataMap.get(requestCacheId);
    
    return cachedDataInfo;
  }

  private static parseCacheInfo(cachedDataInfo: DataFrameCacheInfo, request: DataQueryRequest<SitewiseQuery>) {
    const { range: requestRange, requestId } = request;

    const paginatingRequestRange = getPaginatingRequestRange(requestRange, cachedDataInfo.range);
    const paginatingRequest = RelativeRangeCache.getPaginatingRequest(request, paginatingRequestRange);

    const cacheRange = {
      from: requestRange.from.valueOf(),
      to: paginatingRequestRange.from.valueOf(),
    };
    const cachedDataFrames = trimTimeSeriesDataFrames(cachedDataInfo.queries, cacheRange);
    const cachedDataFramesEnding = trimTimeSeriesDataFramesEnding(cachedDataInfo.queries, cacheRange);

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

  private static getPaginatingRequest(request: DataQueryRequest<SitewiseQuery>, range: TimeRange) {
    const {
      targets,
    } = request;
    
    return {
      ...request,
      range,
      targets: targets.filter(({ queryType }) => TIME_SERIES_QUERY_TYPES.has(queryType)),
    };
  }
}
