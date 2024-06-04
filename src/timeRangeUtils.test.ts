import { dateTime } from "@grafana/data";
import { isTimeRangeCoveringStart, minDateTime } from "timeRangeUtils";

describe('isTimeRangeCoveringStart()', () => {
  it('returns true when subject and object both starting at the same time.', () => {
    const range = {
      from: dateTime('2024-05-28T20:59:49.659Z'),
      to: dateTime('2024-05-28T21:29:49.659Z'),
      raw: { from: 'now-1h', to: 'now' },
    };
    const actual = isTimeRangeCoveringStart(range, range);

    expect(actual).toBe(true);
  });

  it('returns true when object is before subject and overlaps the subject start time', () => {
    const objectRange = {
      from: dateTime('2024-05-28T20:00:00Z'),
      to: dateTime('2024-05-28T22:00:00Z'),
      raw: { from: 'now-1h', to: 'now' },
    };
    const subjectRange = {
      from: dateTime('2024-05-28T21:00:00Z'),
      to: dateTime('2024-05-28T25:00:00Z'),
      raw: { from: 'now-1h', to: 'now' },
    };
    const actual = isTimeRangeCoveringStart(objectRange, subjectRange);

    expect(actual).toBe(true);
  });

  it('returns false when object is before subject but ends before the subject start time', () => {
    const objectRange = {
      from: dateTime('2024-05-28T20:00:00Z'),
      to: dateTime('2024-05-28T21:00:00Z'),
      raw: { from: 'now-1h', to: 'now' },
    };
    const subjectRange = {
      from: dateTime('2024-05-28T22:00:00Z'),
      to: dateTime('2024-05-28T25:00:00Z'),
      raw: { from: 'now-1h', to: 'now' },
    };
    const actual = isTimeRangeCoveringStart(objectRange, subjectRange);

    expect(actual).toBe(false);
  });

  it('returns false when object is before subject but ends at subject start time', () => {
    const objectRange = {
      from: dateTime('2024-05-28T20:00:00Z'),
      to: dateTime('2024-05-28T22:00:00Z'),
      raw: { from: 'now-1h', to: 'now' },
    };
    const subjectRange = {
      from: dateTime('2024-05-28T22:00:00Z'),
      to: dateTime('2024-05-28T25:00:00Z'),
      raw: { from: 'now-1h', to: 'now' },
    };
    const actual = isTimeRangeCoveringStart(objectRange, subjectRange);

    expect(actual).toBe(false);
  });
});

describe('minDateTime()', () => {
  it('returns the mininum DateTime', () => {
    expect(minDateTime(
      dateTime(0),
      dateTime(1),
      dateTime(2),
    )).toEqual(dateTime(0));
  });
});
