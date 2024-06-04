import { DataFrame, FieldType, dateTime } from "@grafana/data";
import { TimeSeriesCache, parseSiteWiseQueriesCacheId } from "TimeSeriesCache";
import { QueryType, SiteWiseQuality, SiteWiseResolution, SiteWiseResponseFormat, SiteWiseTimeOrder, SitewiseQuery } from "types";

function createSiteWiseQuery(id: number): SitewiseQuery {
  return {
    queryType: QueryType.PropertyValueHistory,
    region: 'us-west-2',
    responseFormat: SiteWiseResponseFormat.Table,
    assetId: `mock-asset-id-${id}`,
    assetIds: [`mock-asset-id-${id}`],
    propertyId: `mock-property-id-${id}`,
    propertyAlias: `mock-property-alias-${id}`,
    quality: SiteWiseQuality.ANY,
    resolution: SiteWiseResolution.Auto,
    lastObservation: true,
    flattenL4e: true,
    maxPageAggregations: 1000,
    datasource: {
      type: 'grafana-iot-sitewise-datasource',
      uid: 'mock-datasource-uid'
    },
    refId: `A-${id}`,
    timeOrdering: SiteWiseTimeOrder.ASCENDING,
    loadAllChildren: true,
    hierarchyId: `mock-hierarchy-${id}`,
    modelId: `mock-model-${id}`,
    filter: 'ALL',
  };
}

describe('parseSiteWiseQueriesCacheId()', () => {
  it('parses SiteWise Queries into cache Id', () => {
    const actualId = parseSiteWiseQueriesCacheId([createSiteWiseQuery(1), createSiteWiseQuery(2)]);
    const expectedId = JSON.stringify([
      '["PropertyValueHistory","us-west-2","table","mock-asset-id-1",["mock-asset-id-1"],"mock-property-id-1","mock-property-alias-1","ANY","AUTO",true,true,1000,"grafana-iot-sitewise-datasource","mock-datasource-uid","ASCENDING",true,"mock-hierarchy-1","mock-model-1","ALL"]',
      '["PropertyValueHistory","us-west-2","table","mock-asset-id-2",["mock-asset-id-2"],"mock-property-id-2","mock-property-alias-2","ANY","AUTO",true,true,1000,"grafana-iot-sitewise-datasource","mock-datasource-uid","ASCENDING",true,"mock-hierarchy-2","mock-model-2","ALL"]'
    ]);

    expect(actualId).toEqual(expectedId);
  });

  it('parses SiteWise Query properties in a stable fasion (disregard of the order queries and queries\' properties are added)', () => {
    // Reversed order of properties
    const query1: SitewiseQuery = {
      timeOrdering: SiteWiseTimeOrder.ASCENDING,
      refId: "A-1",
      datasource: {
        uid: 'mock-datasource-uid',
        type: 'grafana-iot-sitewise-datasource',
      },
      maxPageAggregations: 1000,
      flattenL4e: true,
      lastObservation: true,
      resolution: SiteWiseResolution.Auto,
      quality: SiteWiseQuality.ANY,
      propertyAlias: "mock-property-alias-1",
      propertyId: "mock-property-id-1",
      assetIds: ["mock-asset-id-1"],
      assetId: "mock-asset-id-1",
      responseFormat: SiteWiseResponseFormat.Table,
      region: 'us-west-2',
      queryType: QueryType.PropertyValueHistory,
    };
    const query2 = {
      ...query1,
      queryType: QueryType.PropertyValue,
    };

    const order1 = parseSiteWiseQueriesCacheId([query2, query1]);
    const order2 = parseSiteWiseQueriesCacheId([query1, query2]);

    expect(order1).toEqual(order2);
  });

  it('parses SiteWise Query with only required properties provided', () => {
    // With only required properties
    const query: SitewiseQuery = {
      refId: "A-1",
      queryType: QueryType.ListAssets,
    };
    const actualId = parseSiteWiseQueriesCacheId([query]);
    const expectedId = JSON.stringify([
      '["ListAssets",null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null,null]',
    ]);

    expect(actualId).toEqual(expectedId);
  });
});

describe('TimeSeriesCache', () => {
  describe('trimTimeSeriesDataFrames()', () => {
    const absolutionRange = {
      from: dateTime('2024-05-28T00:00:00Z').valueOf(),
      to: dateTime('2024-05-28T00:15:00Z').valueOf(),
    };

    const dataFrame: DataFrame = {
      name: 'Demo Turbine Asset 1',
      refId: 'A',
      fields: [
        {
          name: 'time',
          type: FieldType.time,
          config: {},
          values: [
            1716854400000,  // 2024-05-28T00:00:00Z
            1716854400001,  // 2024-05-28T00:15:00Z + 1ms
            1716855300000,  // 2024-05-28T00:15:00Z
            1716855300001,  // 2024-05-28T00:15:00Z + 1ms
          ],
        },
        {
          name: 'RotationsPerSecond',
          type: FieldType.number,
          config: {
            unit: 'RPS'
          },
          values: [
            1,
            2,
            3,
            4,
          ],
        },
      ],
      length: 4
    };

    const dataFrameDescending: DataFrame = {
      name: 'Demo Turbine Asset 1',
      refId: 'A',
      fields: [
        {
          name: 'time',
          type: FieldType.time,
          config: {},
          values: [
            1716855300001,  // 2024-05-28T00:15:00Z + 1ms
            1716855300000,  // 2024-05-28T00:15:00Z
            1716854400001,  // 2024-05-28T00:00:00Z + 1ms
            1716854400000,  // 2024-05-28T00:00:00Z
          ],
        },
        {
          name: 'RotationsPerSecond',
          type: FieldType.number,
          config: {
            unit: 'RPS'
          },
          values: [4,3,2,1],
        },
      ],
      length: 4
    };

    it('excludes data of PropertyValue query', () => {
      const cachedQueryInfo = {
        query: {
          queryType: QueryType.PropertyValue,
          refId: 'A'
        },
        dataFrame,
      };
      const dataFrames = TimeSeriesCache.trimTimeSeriesDataFrames([cachedQueryInfo], absolutionRange);

      expect(dataFrames).toHaveLength(1);
      expect(dataFrames).toContainEqual({
        name: 'Demo Turbine Asset 1',
        refId: 'A',
        fields: [],
        length: 0,
      });
    });

    it.each([
      QueryType.ListAssetModels,
      QueryType.ListAssets,
      QueryType.ListAssociatedAssets,
      QueryType.ListAssetProperties,
      QueryType.DescribeAsset,
    ])('does not modify data of non-time-series type - %s', (queryType: QueryType) => {
      const cachedQueryInfo = {
        query: {
          queryType,
          refId: 'A'
        },
        dataFrame,
      };
      const dataFrames = TimeSeriesCache.trimTimeSeriesDataFrames([cachedQueryInfo], absolutionRange);

      expect(dataFrames).toHaveLength(1);
      expect(dataFrames).toContainEqual(dataFrame);
    });

    it.each([
      QueryType.PropertyAggregate,
      QueryType.PropertyInterpolated,
      QueryType.PropertyValueHistory,
    ])('trims time series data of time-series type - "%s"', (queryType: QueryType) => {
      const cachedQueryInfo = {
        query: {
          queryType,
          refId: 'A'
        },
        dataFrame,
      };
      const expectedDataFrame: DataFrame = {
        name: 'Demo Turbine Asset 1',
        refId: 'A',
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            config: {},
            values: [
              1716854400001,  // +1ms
              1716855300000,  // 2024-05-28T00:15:00Z
            ],
          },
          {
            name: 'RotationsPerSecond',
            type: FieldType.number,
            config: {
              unit: 'RPS'
            },
            values: [
              2,
              3,
            ],
          },
        ],
        length: 2
      };
      const dataFrames = TimeSeriesCache.trimTimeSeriesDataFrames([cachedQueryInfo], absolutionRange);

      expect(dataFrames).toHaveLength(1);
      expect(dataFrames).toContainEqual(expectedDataFrame);
    });

    it.each([
      QueryType.PropertyAggregate,
      QueryType.PropertyInterpolated,
      QueryType.PropertyValueHistory,
    ])('trims descending time series data of time-series type - "%s"', (queryType: QueryType) => {
      const cachedQueryInfo = {
        query: {
          queryType,
          refId: 'A',
          timeOrdering: SiteWiseTimeOrder.DESCENDING,
        },
        dataFrame: dataFrameDescending,
      };
      const expectedDataFrame: DataFrame = {
        name: 'Demo Turbine Asset 1',
        refId: 'A',
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            config: {},
            values: [
              1716855300000,  // 2024-05-28T00:15:00Z
              1716854400001,  // 2024-05-28T00:00:00Z+1ms
            ],
          },
          {
            name: 'RotationsPerSecond',
            type: FieldType.number,
            config: {
              unit: 'RPS'
            },
            values: [3,2],
          },
        ],
        length: 2
      };
      const dataFrames = TimeSeriesCache.trimTimeSeriesDataFramesEnding([cachedQueryInfo], absolutionRange);

      expect(dataFrames).toHaveLength(1);
      expect(dataFrames).toContainEqual(expectedDataFrame);
    });

    it('keeps all data when all time values within range', () => {
      const cachedQueryInfo = {
        query: {
          queryType: QueryType.PropertyValueHistory,
          refId: 'A'
        },
        dataFrame: {
          name: 'Demo Turbine Asset 1',
          refId: 'A',
          fields: [
            {
              name: 'time',
              type: FieldType.time,
              config: {},
              values: [
                1716854400001,  // 2024-05-28T00:00:00Z+1ms
                1716855300000,  // 2024-05-28T00:15:00Z
              ],
            },
            {
              name: 'RotationsPerSecond',
              type: FieldType.number,
              config: {
                unit: 'RPS'
              },
              values: [
                1,
                2,
              ],
            },
          ],
          length: 2
        },
      };
      const dataFrames = TimeSeriesCache.trimTimeSeriesDataFrames([cachedQueryInfo], absolutionRange);

      expect(dataFrames).toHaveLength(1);
      expect(dataFrames).toContainEqual(cachedQueryInfo.dataFrame);
    });

    it('includes no time series data when all time values are before start time', () => {
      const cachedQueryInfo = {
        query: {
          queryType: QueryType.PropertyValueHistory,
          refId: 'A'
        },
        dataFrame: {
          name: 'Demo Turbine Asset 1',
          refId: 'A',
          fields: [
            {
              name: 'time',
              type: FieldType.time,
              config: {},
              values: [
                1716854399999,
                1716854400000,  // 2024-05-28T00:00:00Z
              ],
            },
            {
              name: 'RotationsPerSecond',
              type: FieldType.number,
              config: {
                unit: 'RPS'
              },
              values: [
                1,
                2,
              ],
            },
          ],
          length: 2
        },
      };
      const expectedDataFrame: DataFrame = {
        name: 'Demo Turbine Asset 1',
        refId: 'A',
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            config: {},
            values: [],
          },
          {
            name: 'RotationsPerSecond',
            type: FieldType.number,
            config: {
              unit: 'RPS'
            },
            values: [],
          },
        ],
        length: 0
      };
      const dataFrames = TimeSeriesCache.trimTimeSeriesDataFrames([cachedQueryInfo], absolutionRange);

      expect(dataFrames).toHaveLength(1);
      expect(dataFrames).toContainEqual(expectedDataFrame);
    });

    it('includes no time series data when all time values are after end time', () => {
      const cachedQueryInfo = {
        query: {
          queryType: QueryType.PropertyValueHistory,
          refId: 'A'
        },
        dataFrame: {
          name: 'Demo Turbine Asset 1',
          refId: 'A',
          fields: [
            {
              name: 'time',
              type: FieldType.time,
              config: {},
              values: [
                1716855300001,  // 2024-05-28T00:15:00Z +1ms
                1716855300002,
              ],
            },
            {
              name: 'RotationsPerSecond',
              type: FieldType.number,
              config: {
                unit: 'RPS'
              },
              values: [
                1,
                2,
              ],
            },
          ],
          length: 2
        },
      };
      const expectedDataFrame: DataFrame = {
        name: 'Demo Turbine Asset 1',
        refId: 'A',
        fields: [
          {
            name: 'time',
            type: FieldType.time,
            config: {},
            values: [],
          },
          {
            name: 'RotationsPerSecond',
            type: FieldType.number,
            config: {
              unit: 'RPS'
            },
            values: [],
          },
        ],
        length: 0
      };
      const dataFrames = TimeSeriesCache.trimTimeSeriesDataFrames([cachedQueryInfo], absolutionRange);

      expect(dataFrames).toHaveLength(1);
      expect(dataFrames).toContainEqual(expectedDataFrame);
    });
  });

  describe('getPaginatingRequest()', () => {
    it('returns request with time series queries', () => {
      const request = {
        requestId: 'mock-request-id',
        interval: '5s',
        intervalMs: 5000,
        range: {
          from: dateTime('2024-05-28T00:00:00Z'),
          to: dateTime('2024-05-28T01:00:00Z'),
          raw: {
            from: 'now-15m',
            to: 'now'
          ,}
        },
        scopedVars: {},
        targets: [
          {
            refId: 'A',
            queryType: QueryType.PropertyAggregate,
          },
          {
            refId: 'B',
            queryType: QueryType.PropertyInterpolated,
          },
          {
            refId: 'C',
            queryType: QueryType.PropertyValue,
          },
          {
            refId: 'D',
            queryType: QueryType.PropertyValueHistory,
          },
          {
            refId: 'E',
            queryType: QueryType.ListAssetModels,
          }
        ],
        timezone: 'browser',
        app: 'dashboard',
        startTime: 1716858000000,
      };
    
      const cacheRange = {
        from: dateTime('2024-05-28T00:45:00Z'),
        to: dateTime('2024-05-28T01:00:00Z'),
        raw: {
          from: 'now-15m',
          to: 'now'
        ,}
      }

      const expectedRequest = {
        requestId: 'mock-request-id',
        interval: '5s',
        intervalMs: 5000,
        range: {
          from: dateTime('2024-05-28T00:45:00Z'),
          to: dateTime('2024-05-28T01:00:00Z'),
          raw: {
            from: 'now-15m',
            to: 'now'
          ,}
        },
        scopedVars: {},
        targets: [
          {
            refId: 'A',
            queryType: QueryType.PropertyAggregate,
          },
          {
            refId: 'B',
            queryType: QueryType.PropertyInterpolated,
          },
          {
            refId: 'C',
            queryType: QueryType.PropertyValue,
          },
          {
            refId: 'D',
            queryType: QueryType.PropertyValueHistory,
          },
        ],
        timezone: 'browser',
        app: 'dashboard',
        startTime: 1716858000000,
      };

      expect(TimeSeriesCache.getPaginatingRequest(request, cacheRange)).toEqual(expectedRequest);
    });

    it('returns request with no time series queries', () => {
      const request = {
        requestId: 'mock-request-id',
        interval: '5s',
        intervalMs: 5000,
        range: {
          from: dateTime('2024-05-28T00:00:00Z'),
          to: dateTime('2024-05-28T01:00:00Z'),
          raw: {
            from: 'now-15m',
            to: 'now'
          ,}
        },
        scopedVars: {},
        targets: [
          {
            refId: 'A',
            queryType: QueryType.ListAssetModels,
          },
          {
            refId: 'B',
            queryType: QueryType.ListAssets,
          },
          {
            refId: 'C',
            queryType: QueryType.ListAssociatedAssets,
          },
          {
            refId: 'D',
            queryType: QueryType.ListAssetProperties,
          },
          {
            refId: 'E',
            queryType: QueryType.DescribeAsset,
          }
        ],
        timezone: 'browser',
        app: 'dashboard',
        startTime: 1716858000000,
      };
    
      const range = {
        from: dateTime('2024-05-28T00:45:00Z'),
        to: dateTime('2024-05-28T01:00:00Z'),
        raw: {
          from: 'now-15m',
          to: 'now'
        ,}
      }

      const expectedRequest = {
        requestId: 'mock-request-id',
        interval: '5s',
        intervalMs: 5000,
        range: {
          from: dateTime('2024-05-28T00:45:00Z'),
          to: dateTime('2024-05-28T01:00:00Z'),
          raw: {
            from: 'now-15m',
            to: 'now'
          ,}
        },
        scopedVars: {},
        targets: [],
        timezone: 'browser',
        app: 'dashboard',
        startTime: 1716858000000,
      };

      expect(TimeSeriesCache.getPaginatingRequest(request, range)).toEqual(expectedRequest);
    });
  });

  // TODO: add test to ensure when a new QueryType is added, the developer would update the trim/request logic
});