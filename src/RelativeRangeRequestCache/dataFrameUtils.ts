import { AbsoluteTimeRange, DataFrame } from '@grafana/data';
import { CachedQueryInfo, TIME_SERIES_QUERY_TYPES } from './types';
import { QueryType, SiteWiseTimeOrder } from 'types';
import { trimTimeSeriesDataFrame, trimTimeSeriesDataFrameReversedTime } from 'dataFrameUtils';

export function trimTimeSeriesDataFrames(cachedQueryInfos: CachedQueryInfo[], cacheRange: AbsoluteTimeRange): DataFrame[] {
  return cachedQueryInfos
    .map((cachedQueryInfo) => {
      const { query: { queryType, timeOrdering }, dataFrame } = cachedQueryInfo;
      if (timeOrdering === SiteWiseTimeOrder.DESCENDING) {
        // Descending ordering data frame are added at the end of the request to respect the ordering
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

export function trimTimeSeriesDataFramesEnding(cachedQueryInfos: CachedQueryInfo[], cacheRange: AbsoluteTimeRange): DataFrame[] {
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
