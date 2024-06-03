import { AbsoluteTimeRange, DataFrame } from "@grafana/data";

interface trimParams {
  dataFrame: DataFrame;
  timeRange: AbsoluteTimeRange;
  lastObservation?: boolean;
};

export function trimTimeSeriesDataFrame({
  dataFrame,
  timeRange: { from, to },
  lastObservation,
}: trimParams): DataFrame {
  const { fields } = dataFrame;
  if (fields == null || fields.length === 0) {
    return {
      ...dataFrame,
      fields: [],
      length: 0,
    }
  }

  const timeField = fields.find(field => field.name === 'time')!;

  let timeValues = timeField.values.toArray();

  let fromIndex = timeValues.findIndex(time => time > from);  // from is exclusive
  if (fromIndex === -1) {
    // no time value within range; include no data in the slice
    fromIndex = timeValues.length ;
  } else if (lastObservation) {
    // Keeps 1 extra data point before the range
    fromIndex = Math.max(fromIndex - 1, 0);
  }

  let toIndex = timeValues.findIndex(time => time > to);  // to is inclusive
  if (toIndex === -1) {
    // all time values before `to`
    toIndex = timeValues.length;
  }

  const trimmedFields = fields.map(field => ({
    ...field,
    values: field.values.toArray().slice(fromIndex, toIndex),
  }));
  
  // TODO: be careful about Expand Time Range
  return {
    ...dataFrame,
    fields: trimmedFields,
    length: trimmedFields[0].values.length,
  };
}

export function trimTimeSeriesDataFrameReversed({
  dataFrame,
  timeRange: { from, to },
  lastObservation,
}: trimParams): DataFrame {
  const { fields } = dataFrame;
  if (fields == null || fields.length === 0) {
    return {
      ...dataFrame,
      fields: [],
      length: 0,
    }
  }

  const timeField = fields.find(field => field.name === 'time')!;

  // Copy before reverse in place
  let timeValues = [...timeField.values.toArray()].reverse();
  
  let fromIndex = timeValues.findIndex(time => time > from);  // from is exclusive
  if (fromIndex === -1) {
    // no time value within range; include no data in the slice
    fromIndex = timeValues.length ;
  } else if (lastObservation) {
    // Keeps 1 extra data point before the range
    fromIndex = Math.max(fromIndex - 1, 0);
  }

  let toIndex = timeValues.findIndex(time => time > to);  // to is inclusive
  if (toIndex === -1) {
    // all time values before `to`
    toIndex = timeValues.length;
  }

  const trimmedFields = fields.map(field => {
    const dataValues = [...field.values.toArray()].reverse().slice(fromIndex, toIndex);

    return {
      ...field,
      values: dataValues.reverse(),
    };
  });
  
  // TODO: be careful about Expand Time Range
  return {
    ...dataFrame,
    fields: trimmedFields,
    length: trimmedFields[0].values.length,
  };
}