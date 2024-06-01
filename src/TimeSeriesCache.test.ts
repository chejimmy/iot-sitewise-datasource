import { DataFrame, FieldType, dateTime } from "@grafana/data";
import { TimeSeriesCache, parseSiteWiseQueriesCacheId } from "TimeSeriesCache";
import { QueryType, SiteWiseQuality, SiteWiseResolution, SiteWiseResponseFormat, SitewiseQuery } from "types";

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
  };
}

describe('parseSiteWiseQueriesCacheId', () => {
  it('parses SiteWise Queries into cache Id', () => {
    const actualId = parseSiteWiseQueriesCacheId([createSiteWiseQuery(1), createSiteWiseQuery(2)]);
    const expectedId = JSON.stringify([
      '["PropertyValueHistory","us-west-2","table","mock-asset-id-1",["mock-asset-id-1"],"mock-property-id-1","mock-property-alias-1","ANY","AUTO",true,true,1000,"grafana-iot-sitewise-datasource","mock-datasource-uid"]',
      '["PropertyValueHistory","us-west-2","table","mock-asset-id-2",["mock-asset-id-2"],"mock-property-id-2","mock-property-alias-2","ANY","AUTO",true,true,1000,"grafana-iot-sitewise-datasource","mock-datasource-uid"]'
    ]);

    expect(actualId).toEqual(expectedId);
  });

  it('parses SiteWise Query properties in a stable fasion (disregard of the order queries and queries\' properties are added)', () => {
    // Reversed order of properties
    const query1: SitewiseQuery = {
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
      '["ListAssets",null,null,null,null,null,null,null,null,null,null,null,null,null]',
    ]);

    expect(actualId).toEqual(expectedId);
  });
});

describe('TimeSeriesCache', () => {
  describe('isCacheRequestOverlapping()', () => {
    it('returns true when request and cache both starting at the same time.', () => {
      const range = {
        from: dateTime('2024-05-28T20:59:49.659Z'),
        to: dateTime('2024-05-28T21:29:49.659Z'),
        raw: { from: 'now-1h', to: 'now' },
      };
      const actual = TimeSeriesCache.isCacheRequestOverlapping(range, range);

      expect(actual).toBe(true);
    });

    it('returns true when cache is before request and overlaps the request start time', () => {
      const cacheRange = {
        from: dateTime('2024-05-28T20:00:00Z'),
        to: dateTime('2024-05-28T22:00:00Z'),
        raw: { from: 'now-1h', to: 'now' },
      };
      const requestRange = {
        from: dateTime('2024-05-28T21:00:00Z'),
        to: dateTime('2024-05-28T25:00:00Z'),
        raw: { from: 'now-1h', to: 'now' },
      };
      const actual = TimeSeriesCache.isCacheRequestOverlapping(cacheRange, requestRange);

      expect(actual).toBe(true);
    });

    it('returns false when cache is before request but ends before the request start time', () => {
      const cacheRange = {
        from: dateTime('2024-05-28T20:00:00Z'),
        to: dateTime('2024-05-28T21:00:00Z'),
        raw: { from: 'now-1h', to: 'now' },
      };
      const requestRange = {
        from: dateTime('2024-05-28T22:00:00Z'),
        to: dateTime('2024-05-28T25:00:00Z'),
        raw: { from: 'now-1h', to: 'now' },
      };
      const actual = TimeSeriesCache.isCacheRequestOverlapping(cacheRange, requestRange);

      expect(actual).toBe(false);
    });

    it('returns false when cache is before request but ends at request start time', () => {
      const cacheRange = {
        from: dateTime('2024-05-28T20:00:00Z'),
        to: dateTime('2024-05-28T22:00:00Z'),
        raw: { from: 'now-1h', to: 'now' },
      };
      const requestRange = {
        from: dateTime('2024-05-28T22:00:00Z'),
        to: dateTime('2024-05-28T25:00:00Z'),
        raw: { from: 'now-1h', to: 'now' },
      };
      const actual = TimeSeriesCache.isCacheRequestOverlapping(cacheRange, requestRange);

      expect(actual).toBe(false);
    });
  });

  describe('trimTimeSeriesDataFrames()', () => {
    const range = {
      from: dateTime('2024-05-28T20:59:49.659Z'),
      to: dateTime('2024-05-28T21:29:49.659Z'),
      raw: { from: 'now-1h', to: 'now' },
    };

    const dataFrame: DataFrame =
    {
      name: 'Demo Turbine Asset 1',
      refId: 'A',
      fields: [
        {
          name: 'time',
          type: FieldType.time,
          config: {},
          values: [
            1716931550000
          ],
        },
        {
          name: 'RotationsPerSecond',
          type: FieldType.number,
          config: {
            unit: 'RPS'
          },
          values: [
            0.45253960150485795
          ],
        },
        {
          name: 'quality',
          type: FieldType.string,
          config: {},
          values: [
            'GOOD'
          ],
        }
      ],
      length: 1
    };

    it('excludes data of PropertyValue query', () => {
      const cachedQueryInfo = {
        query: {
          queryType: QueryType.PropertyValue,
          refId: 'A'
        },
        dataFrame,
      };
      const dataFrames = TimeSeriesCache.trimTimeSeriesDataFrames([cachedQueryInfo], range);

      expect(dataFrames).toHaveLength(1);
      expect(dataFrames).toContainEqual({
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
      const dataFrames = TimeSeriesCache.trimTimeSeriesDataFrames([cachedQueryInfo], range);

      expect(dataFrames).toHaveLength(1);
      expect(dataFrames).toContainEqual(dataFrame);
    });
  });
});