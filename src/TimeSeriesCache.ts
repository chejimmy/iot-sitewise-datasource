import { DataFrame, DataQueryRequest, DataQueryResponse, DataQueryResponseData, LoadingState, dateTime } from '@grafana/data';
import { SitewiseQuery } from 'types';

type CacheId = string;
function parseSwQueryCacheId(id: SitewiseQuery): CacheId {
  const {
    // TODO: make queryType accept time series only
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
  } = id;

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
function parseSwQueriesCacheId(queries: SitewiseQuery[]): CacheId {
  const cacheIds = queries.map(parseSwQueryCacheId).sort();

  return JSON.stringify(cacheIds);
}

type CacheTime = string;
type RelativeTimeDataFramesMap = Map<CacheTime, DataFrame[]>;

export interface TimeSeriesCacheInfo {
  cachedResponse: DataQueryResponse;
  paginatingRequest: DataQueryRequest<SitewiseQuery>;
}

/**
 * This class is a time series cache for storing data frames.
 */
export class TimeSeriesCache {
  // private cacheId?: string;
  // private lastBuffer: DataQueryResponse | undefined;
  // private range: TimeRange | undefined;

  // TODO:
  // 1. find correct time chunk
  // 2. find / trim to time range
  // 
  // get(request: DataQueryRequest<SitewiseQuery>) {
  //   this.cacheId = parseSwQueryCacheId(request.targets[0]);
  //   if (this.cacheId !== cacheId) {
  //     return undefined;
  //   }
  //   if (!this.lastBuffer) {
  //     return undefined;
  //   }

  //   return {
  //     lastBuffer: this.lastBuffer,
  //     range: this.range,
  //   };
  // }

  // private prevRequest: DataQueryRequest<SitewiseQuery> | undefined;
  // private prevResponse: DataQueryResponse | undefined;

  private responseDataMap = new Map<CacheId, RelativeTimeDataFramesMap>();

  set({
    targets: queries,
    range: { raw: { from } },
  }: DataQueryRequest<SitewiseQuery>, response: DataQueryResponse) {
    // this.prevRequest = request;
    // this.prevResponse = response;

    // TODO: restrict to relative time from now only
    // Set cache for time series data only
    const queryCacheId = parseSwQueriesCacheId(queries);
    const responseTimeMap = this.responseDataMap.get(queryCacheId) || new Map<CacheTime, DataQueryResponseData>();
    this.responseDataMap.set(queryCacheId, responseTimeMap);
    // restrict to relative time from now
    if (typeof from === 'string') {
      responseTimeMap.set(from, response.data);
    }
  }

  get(request: DataQueryRequest<SitewiseQuery>): TimeSeriesCacheInfo | undefined {
    // if (this.prevResponse == null || this.prevRequest == null) {
    //   return undefined;
    // }

    // // TODO: how to match requests?
    // if (this.matchRequest(this.prevRequest, request)) {
    //   return {
    //     // FIXME: take away 15 min of data or merge them
    //     cachedResponse: this.prevResponse,
    //     paginatingRequest: this.getPaginatingRequest(request),
    //   };
    // }

    const { range: { raw: { from}  }, requestId, targets: queries } = request;

    // TODO: restrict to relative time from now only
    // Set cache for time series data only
    if (typeof from !== 'string') {
      return undefined;
    }

    const queryCacheId = parseSwQueriesCacheId(queries);
    const cachedData = this.responseDataMap.get(queryCacheId)?.get(from);
    
    if (cachedData == null) {
      return undefined;
    }

    // TODO: need to trim the data; be careful about Expand Time Range
    return {
      cachedResponse: {
        data: cachedData,
        key: requestId,
        state: LoadingState.Streaming,
      },
      paginatingRequest: this.getPaginatingRequest(request),
    };
  }

  // private matchRequest(prevRequest: DataQueryRequest<SitewiseQuery>, request: DataQueryRequest<SitewiseQuery>): boolean {
  //   if (prevRequest.panelId !== request.panelId) {
  //     return false;
  //   }

  //   // TODO: match the range - if cache range overlap with request and cache from before/same as request range
  //   // if cache from before/same as request range
  //   if (request.range.from.isBefore(prevRequest.range.from) && !request.range.from.isSame(prevRequest.range.from)) {
  //     return false;
  //   }
  //   // if cache range overlap with request
  //   if (prevRequest.range.to.isBefore(request.range.from)) {
  //     return false;
  //   }

  //   // TODO: match the targets

  //   return true;
  // }

  private getPaginatingRequest(request: DataQueryRequest<SitewiseQuery>) {
    const { range } = request;
    const last15Min = dateTime(range.to).subtract(15, 'minutes');
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
