import { TimeRange, dateTime } from '@grafana/data';
import { isRelativeFromNow, minDateTime } from 'timeRangeUtils';
import { DEFAULT_TIME_SERIES_REFRESH_MINUTES } from './constants';

/**
 * Check if the given TimeRange is cacheable. A TimeRange is cacheable if it is relative and has data 15 minutes ago.
 * @param TimeRange to check
 * @returns true if the TimeRange is cacheable, false otherwise
 */
export function isCacheableTimeRange(timeRange: TimeRange): boolean {
  const { from, to, raw } = timeRange;

  if (!isRelativeFromNow(raw)) {
    return false;
  }

  const defaultRefreshAgo = dateTime(to).subtract(DEFAULT_TIME_SERIES_REFRESH_MINUTES, 'minutes');
  if (!from.isBefore(defaultRefreshAgo)) {
    return false;
  }

  return true;
}

/**
 * Get the paginating request range. The paginating request range is the range of the request that is needed to
 * retrieve the data for the current request. If the cache ranges to older than the default refresh time, then the
 * paginating request range will be the default refresh time ago to the current time. Otherwise, the paginating
 * request range will be the cache range to the current time.
 * @param requestRange the current request time range
 * @param cacheRange the cache time range
 * @returns the paginating request range
 */
export function getPaginatingRequestRange(requestRange: TimeRange, cacheRange: TimeRange): TimeRange {
  const defaultRefreshAgo = dateTime(requestRange.to).subtract(DEFAULT_TIME_SERIES_REFRESH_MINUTES, 'minutes');
  const from = minDateTime(cacheRange.to, defaultRefreshAgo);

  return {
    from,
    to: requestRange.to,
    raw: requestRange.raw,
  };
}
