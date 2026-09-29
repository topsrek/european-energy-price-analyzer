/**
 * Optimized Binary Energy Price Decoder v2.0
 * 
 * Decodes ultra-efficient binary format with date range header and consecutive prices.
 * Provides ~60% additional compression over v1.0 format.
 */

import { EnergyPrice } from "@/types/energy-data";

export class OptimizedBinaryPriceDecoder {
  private data: Uint8Array;
  private bitPosition: number = 0;
  private readonly BASE_YEAR = 2000;
  private readonly intervalMinutes: number;

  constructor(buffer: ArrayBuffer, intervalMinutes: number = 60) {
    this.data = new Uint8Array(buffer);
    this.bitPosition = 0;
    this.intervalMinutes = intervalMinutes;
  }

  /**
   * Read a specified number of bits from the buffer
   */
  private readBits(numBits: number): number {
    let result = 0;
    
    for (let i = 0; i < numBits; i++) {
      const byteIndex = Math.floor(this.bitPosition / 8);
      const bitInByte = 7 - (this.bitPosition % 8);
      
      if (byteIndex >= this.data.length) {
        throw new Error(`Attempting to read beyond buffer bounds at bit position ${this.bitPosition}`);
      }
      
      const bit = (this.data[byteIndex] >> bitInByte) & 1;
      result = (result << 1) | bit;
      this.bitPosition++;
    }
    
    return result;
  }

  /**
   * Read a date from the buffer (16 bits)
   */
  private readDate(): Date {
    const year = this.readBits(7) + this.BASE_YEAR;
    const month = this.readBits(4);
    const day = this.readBits(5);
    
    if (month < 1 || month > 12) {
      throw new Error(`Invalid month: ${month}`);
    }
    if (day < 1 || day > 31) {
      throw new Error(`Invalid day: ${day}`);
    }
    
    const date = new Date(year, month - 1, day); // Note: JS months are 0-based
    if (date.getMonth() !== month - 1 || date.getDate() !== day) {
      throw new Error(`Invalid date: ${year}-${month}-${day}`);
    }

    return date;
  }

  /**
   * Read a single price record (15-21 bits)
   */
  private readPriceRecord(): number {
    const mode = this.readBits(1);
    
    if (mode === 0) {
      // Mode 0: Short form - positive values only (14 bits)
      const priceCents = this.readBits(14);
      return priceCents / 100;
    } else {
      // Mode 1: Long form - with sign bit (19 + 1 bits)
      const priceCents = this.readBits(19);
      const isNegative = this.readBits(1) === 1;
      
      const price = priceCents / 100;
      return isNegative ? -price : price;
    }
  }

  /**
   * Calculate consecutive hour count from position
   * No need to generate timestamps - they're calculated on demand
   */
  private getTimestampForRecord(startDate: Date, recordOffset: number): Date {
    // Start at midnight UTC of start date, add consecutive intervals.
    const timestamp = new Date(Date.UTC(
      startDate.getFullYear(), 
      startDate.getMonth(), 
      startDate.getDate(), 
      0, 0, 0
    ));
    
    timestamp.setUTCMinutes(timestamp.getUTCMinutes() + (recordOffset * this.intervalMinutes));
    return timestamp;
  }

  /**
   * Decode all price records from the optimized format
   */
  public decodeAll(): EnergyPrice[] {
    this.bitPosition = 0;
    
    if (this.data.length < 4) {
      throw new Error("File too small - missing header (need at least 32 bits)");
    }

    // Read header (32 bits)
    const startDate = this.readDate();
    const endDate = this.readDate();
    if (endDate < startDate) {
      throw new Error("Corrupt price file: header end date precedes start date");
    }
    
    console.log(`Decoding optimized format: ${startDate.toLocaleDateString()} to ${endDate.toLocaleDateString()}`);
    
    // Read consecutive price records (actual count, no expectations)
    const records: EnergyPrice[] = [];
    let recordOffset = 0;
    
    while (true) {
      // Check if we have enough bits remaining. Anything shorter than the
      // minimum record size is byte-alignment padding at the end of the file.
      const remainingBits = (this.data.length * 8) - this.bitPosition;
      if (remainingBits < 15) {
        break;
      }

      let price: number;
      try {
        price = this.readPriceRecord();
      } catch (error) {
        // A record was cut off mid-way: the file is truncated or corrupt.
        // Fail loudly instead of silently returning partial data.
        throw new Error(
          `Corrupt or truncated price file: decoding failed at record ${recordOffset}: ${error instanceof Error ? error.message : String(error)}`,
          { cause: error }
        );
      }

      // Calculate UTC timestamp for this hour offset
      const timestamp = this.getTimestampForRecord(startDate, recordOffset);

      // Stop if we've passed the end date
      if (timestamp.getUTCFullYear() > endDate.getFullYear() ||
         (timestamp.getUTCFullYear() === endDate.getFullYear() &&
          timestamp.getUTCMonth() > endDate.getMonth()) ||
         (timestamp.getUTCFullYear() === endDate.getFullYear() &&
          timestamp.getUTCMonth() === endDate.getMonth() &&
          timestamp.getUTCDate() > endDate.getDate())) {
        break;
      }

      records.push({
        timestamp: timestamp.toISOString(),
        price,
        unit: 'EUR_MWh'
      });

      recordOffset++;
    }

    console.log(`Successfully decoded ${records.length} actual records (UTC timestamps, no placeholders)`);
    
    return records;
  }
}

/**
 * Convenience function to decode optimized binary energy price data
 */
export function decodeOptimizedBinaryEnergyPrices(
  buffer: ArrayBuffer,
  options?: { intervalMinutes?: number }
): EnergyPrice[] {
  const decoder = new OptimizedBinaryPriceDecoder(buffer, options?.intervalMinutes ?? 60);
  return decoder.decodeAll();
}

/**
 * Fetch and decode optimized binary price data from a URL
 */
export async function fetchOptimizedBinaryPriceData(
  url: string,
  options?: { intervalMinutes?: number }
): Promise<EnergyPrice[]> {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    // An SPA fallback page would otherwise be decoded as (garbage) price data.
    if (response.headers.get('content-type')?.includes('text/html')) {
      throw new Error(`Expected binary price data but got HTML from ${url}`);
    }
    
    const buffer = await response.arrayBuffer();
    return decodeOptimizedBinaryEnergyPrices(buffer, options);
    
  } catch (error) {
    throw new Error(`Failed to fetch optimized binary price data: ${error}`, { cause: error });
  }
}
