import { Observable, of } from 'rxjs';
import { map } from 'rxjs/operators';
import { assign } from 'lodash';
import { ListAssetsQuery, QueryType, SitewiseQuery } from './types';
import { DataSource } from './SitewiseDataSource';
import { DataQueryRequest, DataQueryResponse, CustomVariableSupport, DataFrameView } from '@grafana/data';
import { QueryEditor } from './components/query/QueryEditor';
import { AssetModelSummary } from 'queryResponseTypes';

export class SitewiseVariableSupport extends CustomVariableSupport<DataSource, SitewiseQuery, SitewiseQuery> {
  constructor(private readonly datasource: DataSource) {
    super();
    this.datasource = datasource;
    this.query = this.query.bind(this);
  }

  editor = QueryEditor;

  query(request: DataQueryRequest<SitewiseQuery>): Observable<DataQueryResponse> {
    if (this.isValidQuery(request.targets[0])) {
      assign(request.targets, [{ ...request.targets[0], refId: 'A' }]);
      const response = this.datasource.query(request);
      switch (request.targets[0].queryType) {
        case QueryType.ListAssetModels:
        case QueryType.ListAssets:
        case QueryType.ListAssociatedAssets:
          return this.parseOptions(response);
        default:
          return response;
      }
    } else {
      return of({ data: [], error: { message: 'Invalid query' } });
    }
  }

  parseOptions(response: Observable<DataQueryResponse>): Observable<DataQueryResponse> {
    return response.pipe(
      map((res) => {
        let data = [];
        if (res.data.length) {
          data = res.data[0];
        }
        return { data: new DataFrameView<AssetModelSummary>(data) };
      }),
      map((res) => {
        const newData = res.data.map((m) => {
          return {
            value: m.id,
            text: m.name,
          };
        });
        return { data: newData };
      })
    );
  }

  private isValidQuery(query: SitewiseQuery): boolean {
    switch (query.queryType) {
      case QueryType.PropertyValue:
      case QueryType.PropertyValueHistory:
      case QueryType.PropertyInterpolated:
      case QueryType.PropertyAggregate:
        return Boolean((query.assetIds?.length || query.assetId) && query.propertyId);
      case QueryType.ListAssets:
        const listAssetsQuery = query as ListAssetsQuery;
        return Boolean(
          (listAssetsQuery.filter === 'ALL' && listAssetsQuery.modelId) || listAssetsQuery.filter === 'TOP_LEVEL'
        );
      case QueryType.ListAssociatedAssets:
        return Boolean(query.assetIds?.length);
      case QueryType.ListAssetModels:
      case QueryType.ListTimeSeries:
      case QueryType.DescribeAsset:
      case QueryType.ListAssetProperties:
      default:
        return true;
    }
  }
}
