import { readdirSync, readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import { decodeOptimizedBinaryEnergyPrices } from './optimized-binary-decoder';

describe('optimized binary decoder', () => {
  it('decodes a compact hand-built file with positive and negative prices', () => {
    const buffer = encodeOptimizedFixture([
      { timestamp: '2026-01-01T00:00:00.000Z', price: 12.34 },
      { timestamp: '2026-01-01T01:00:00.000Z', price: -5.67 },
    ]);

    expect(decodeOptimizedBinaryEnergyPrices(buffer)).toEqual([
      { timestamp: '2026-01-01T00:00:00.000Z', price: 12.34, unit: 'EUR_MWh' },
      { timestamp: '2026-01-01T01:00:00.000Z', price: -5.67, unit: 'EUR_MWh' },
    ]);
  });

  it('decodes quarter-hour data when interval minutes are provided', () => {
    const buffer = encodeOptimizedFixture([
      { timestamp: '2026-05-05T00:00:00.000Z', price: 12.34 },
      { timestamp: '2026-05-05T00:15:00.000Z', price: 11.11 },
      { timestamp: '2026-05-05T00:30:00.000Z', price: 10.01 },
    ]);

    expect(
      decodeOptimizedBinaryEnergyPrices(buffer, { intervalMinutes: 15 })
    ).toEqual([
      { timestamp: '2026-05-05T00:00:00.000Z', price: 12.34, unit: 'EUR_MWh' },
      { timestamp: '2026-05-05T00:15:00.000Z', price: 11.11, unit: 'EUR_MWh' },
      { timestamp: '2026-05-05T00:30:00.000Z', price: 10.01, unit: 'EUR_MWh' },
    ]);
  });

  it('throws on a truncated file instead of returning partial data', () => {
    const buffer = encodeOptimizedFixture([
      { timestamp: '2026-01-01T00:00:00.000Z', price: 12.34 },
      { timestamp: '2026-01-01T01:00:00.000Z', price: -5.67 },
      { timestamp: '2026-01-01T02:00:00.000Z', price: -6.78 },
    ]);
    // Header (32 bits) + short record (15) + long record (21) = 68 bits; cut into the third record.
    const truncated = buffer.slice(0, 11);

    expect(() => decodeOptimizedBinaryEnergyPrices(truncated)).toThrow(/truncated/);
  });

  it('rejects headers with impossible calendar dates', () => {
    const writer = new BitWriter();
    writer.write(26, 7);
    writer.write(2, 4);
    writer.write(31, 5); // 2026-02-31
    writer.write(26, 7);
    writer.write(3, 4);
    writer.write(1, 5);
    writer.write(0, 16);

    expect(() => decodeOptimizedBinaryEnergyPrices(writer.toArrayBuffer())).toThrow(/Invalid date/);
  });

  it('decodes every committed price artifact without errors', () => {
    const files = readdirSync(resolve(process.cwd(), 'public')).filter((name) => name.endsWith('.bin'));
    expect(files.length).toBeGreaterThan(0);

    for (const file of files) {
      const artifact = readFileSync(resolve(process.cwd(), 'public', file));
      const intervalMinutes = file.includes('15min') ? 15 : 60;
      expect(() => decodeOptimizedBinaryEnergyPrices(toArrayBuffer(artifact), { intervalMinutes })).not.toThrow();
    }
  });

  it('decodes the committed Austrian price artifact from its fixed history start', () => {
    const artifact = readFileSync(resolve(process.cwd(), 'public/at_electricity_prices.bin'));
    const prices = decodeOptimizedBinaryEnergyPrices(toArrayBuffer(artifact));

    expect(prices[0]).toEqual({
      timestamp: '2018-09-30T00:00:00.000Z',
      price: 59.53,
      unit: 'EUR_MWh',
    });
  });

  // Artifacts are refreshed daily, so check invariants instead of exact counts. The binary
  // format is positional: a hole upstream silently shifts every later timestamp, which shows
  // up here as a mismatch against the metadata written by the pipeline.
  const committedArtifacts = ['at', 'de-lu', 'fr'].flatMap((country) => [
    { country, suffix: '', intervalMinutes: 60 },
    { country, suffix: '_15min', intervalMinutes: 15 },
  ]);

  it.each(committedArtifacts)(
    'decodes $country$suffix consistently with its metadata and without gaps',
    ({ country, suffix, intervalMinutes }) => {
      const artifact = readFileSync(resolve(process.cwd(), `public/${country}_electricity_prices${suffix}.bin`));
      const metadata = JSON.parse(
        readFileSync(resolve(process.cwd(), `scripts/data/${country}_electricity_prices${suffix}_metadata.json`), 'utf-8'),
      ) as { data_coverage: { total_records: number; first_timestamp: string; last_timestamp: string } };
      const prices = decodeOptimizedBinaryEnergyPrices(toArrayBuffer(artifact), { intervalMinutes });
      const coverage = metadata.data_coverage;

      expect(prices).toHaveLength(coverage.total_records);
      expect(Date.parse(prices[0].timestamp)).toBe(Date.parse(coverage.first_timestamp));
      expect(Date.parse(prices[prices.length - 1].timestamp)).toBe(Date.parse(coverage.last_timestamp));

      const stepMs = intervalMinutes * 60_000;
      for (let i = 1; i < prices.length; i += 1) {
        const delta = Date.parse(prices[i].timestamp) - Date.parse(prices[i - 1].timestamp);
        if (delta !== stepMs) {
          throw new Error(`gap between ${prices[i - 1].timestamp} and ${prices[i].timestamp}`);
        }
      }
    },
  );
});

type FixtureRecord = {
  timestamp: string;
  price: number;
};

const encodeOptimizedFixture = (records: FixtureRecord[]) => {
  const writer = new BitWriter();
  const firstDate = new Date(records[0].timestamp);
  const lastDate = new Date(records[records.length - 1].timestamp);

  writeDate(writer, firstDate);
  writeDate(writer, lastDate);

  for (const record of records) {
    writePrice(writer, record.price);
  }

  return writer.toArrayBuffer();
};

const writeDate = (writer: BitWriter, value: Date) => {
  writer.write(value.getUTCFullYear() - 2000, 7);
  writer.write(value.getUTCMonth() + 1, 4);
  writer.write(value.getUTCDate(), 5);
};

const writePrice = (writer: BitWriter, price: number) => {
  const cents = Math.round(Math.abs(price) * 100);

  if (price >= 0 && cents < 16384) {
    writer.write(0, 1);
    writer.write(cents, 14);
    return;
  }

  writer.write(1, 1);
  writer.write(cents, 19);
  writer.write(price < 0 ? 1 : 0, 1);
};

class BitWriter {
  private bytes: number[] = [];
  private bitPosition = 0;

  write(value: number, bits: number) {
    for (let index = bits - 1; index >= 0; index -= 1) {
      const bit = (value >> index) & 1;

      if (this.bitPosition % 8 === 0) {
        this.bytes.push(0);
      }

      if (bit) {
        const byteIndex = this.bytes.length - 1;
        const bitInByte = 7 - (this.bitPosition % 8);
        this.bytes[byteIndex] |= 1 << bitInByte;
      }

      this.bitPosition += 1;
    }
  }

  toArrayBuffer() {
    const bytes = Uint8Array.from(this.bytes);
    return bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength);
  }
}

const toArrayBuffer = (buffer: Buffer) => {
  const copy = new Uint8Array(buffer.byteLength);
  copy.set(buffer);
  return copy.buffer;
};
