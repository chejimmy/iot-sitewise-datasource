import { DataFrame, formatLabels, MutableDataFrame } from '@grafana/data';

export function getSchemaKey(frame: DataFrame): string {
  let key = frame.refId + '/' + frame.fields.length + '/' + frame.name;
  for (const f of frame.fields) {
    key += '|' + f.name + ':' + f.type;
    if (f.labels) {
      key += formatLabels(f.labels);
    }
  }
  return key;
}

// TODO: this could likely use the builtin merge transformer, however it was behaving weirdly
// with arrow time fields ;(
export function appendMatchingFrames(prev: DataFrame[], b: DataFrame[]): DataFrame[] {
  const byKey = new Map<string, MutableDataFrame>();
  const out: DataFrame[] = [];
  for (const f of prev) {
    if (!f.length) {
      continue;
    }

    const key = getSchemaKey(f);
    if (f instanceof MutableDataFrame) {
      byKey.set(key, f);
      out.push(f);
    } else {
      const frame = new MutableDataFrame();
      frame.meta = f.meta;
      frame.name = f.name;
      frame.refId = f.refId;

      // Arrow frames are not appending properly ???
      for (const field of f.fields) {
        const buffer: any[] = [];
        for (let i = 0; i < f.length; i++) {
          buffer.push(field.values[i]);
        }
        frame.addField({
          ...field,
          values: buffer,
        });
      }

      byKey.set(key, frame);
      out.push(frame);
    }
  }

  for (const f of b) {
    if (!f.length) {
      continue;
    }
    const key = getSchemaKey(f);
    const old = byKey.get(key);
    if (old) {
      for (let i = 0; i < f.length; i++) {
        for (let idx = 0; idx < old.fields.length; idx++) {
          old.fields[idx].values.push(f.fields[idx].values[i]);
        }
      }
    } else {
      out.push(f);
    }
  }
  return out;
}
