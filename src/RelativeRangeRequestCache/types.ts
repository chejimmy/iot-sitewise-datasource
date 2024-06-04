import { DataFrame } from '@grafana/data';
import { QueryType, SitewiseQuery } from 'types';

export const TIME_SERIES_QUERY_TYPES = new Set<QueryType>([
  QueryType.PropertyAggregate,
  QueryType.PropertyInterpolated,
  QueryType.PropertyValue,
  QueryType.PropertyValueHistory,
]);

export interface CachedQueryInfo {
  query: Pick<SitewiseQuery, 'queryType' | 'timeOrdering' | 'lastObservation'>;
  dataFrame: DataFrame;
}
