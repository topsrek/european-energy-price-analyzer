/**
 * Min/max-preserving downsampling for line charts.
 *
 * The data is split into equally sized index buckets. From every bucket the points holding
 * the minimum and maximum of each value key are kept (in time order), so peaks and troughs
 * survive regardless of the time of day they occur. Every bucket (except possibly the last)
 * emits the same number of points to keep the spacing on a categorical x-axis even.
 */
export const downsampleMinMax = <T>(
  data: T[],
  maxPoints: number,
  getValues: (item: T) => Array<number | null | undefined>,
): T[] => {
  if (data.length <= maxPoints || data.length <= 2) {
    return data;
  }

  const sample = getValues(data[0]);
  const pointsPerBucket = Math.max(2, 2 * Math.max(1, sample.length));
  const bucketCount = Math.max(1, Math.floor(maxPoints / pointsPerBucket));
  const bucketSize = Math.ceil(data.length / bucketCount);

  if (bucketSize <= pointsPerBucket) {
    return data;
  }

  const result: T[] = [];

  for (let start = 0; start < data.length; start += bucketSize) {
    const end = Math.min(data.length, start + bucketSize);
    const size = end - start;
    const keep = new Set<number>();
    const minValue: number[] = [];
    const maxValue: number[] = [];
    const minIndex: number[] = [];
    const maxIndex: number[] = [];

    for (let index = start; index < end; index++) {
      const values = getValues(data[index]);
      for (let key = 0; key < values.length; key++) {
        const value = values[key];
        if (typeof value !== 'number' || !Number.isFinite(value)) continue;
        if (minIndex[key] === undefined || value < minValue[key]) {
          minValue[key] = value;
          minIndex[key] = index;
        }
        if (maxIndex[key] === undefined || value > maxValue[key]) {
          maxValue[key] = value;
          maxIndex[key] = index;
        }
      }
    }

    minIndex.forEach((index) => index !== undefined && keep.add(index));
    maxIndex.forEach((index) => index !== undefined && keep.add(index));

    // Pad with evenly spread points so each bucket occupies the same width on the axis.
    const target = Math.min(size, pointsPerBucket);
    for (let slot = 0; keep.size < target && slot < target; slot++) {
      keep.add(start + Math.floor(((slot + 0.5) * size) / target));
    }
    for (let index = start; keep.size < target && index < end; index++) {
      keep.add(index);
    }

    Array.from(keep)
      .sort((left, right) => left - right)
      .forEach((index) => result.push(data[index]));
  }

  // Always keep the exact range endpoints so the visible span is unchanged.
  if (result[0] !== data[0]) result.unshift(data[0]);
  if (result[result.length - 1] !== data[data.length - 1]) result.push(data[data.length - 1]);

  return result;
};
