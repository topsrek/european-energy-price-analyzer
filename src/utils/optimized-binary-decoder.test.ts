import { readFileSync } from 'node:fs';
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

  it('decodes the committed Austrian price artifact', () => {
    const artifact = readFileSync(resolve(process.cwd(), 'public/at_electricity_prices.bin'));
    const prices = decodeOptimizedBinaryEnergyPrices(toArrayBuffer(artifact));

    expect(prices).toHaveLength(66550);
    expect(prices[0]).toEqual({
      timestamp: '2018-09-30T00:00:00.000Z',
      price: 59.53,
      unit: 'EUR_MWh',
    });
    expect(prices[prices.length - 1]).toEqual({
      timestamp: '2026-05-03T21:00:00.000Z',
      price: 137.2,
      unit: 'EUR_MWh',
    });
  });
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
  return buffer.buffer.slice(buffer.byteOffset, buffer.byteOffset + buffer.byteLength);
};
