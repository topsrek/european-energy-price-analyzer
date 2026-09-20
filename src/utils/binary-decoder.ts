/**
 * Binary Energy Price Decoder
 * 
 * Decodes the legacy custom binary format used to store hourly country price data.
 * Format: 37/43 bits per record depending on price encoding mode.
 * 
 * See docs/binary-encoding-format.md for detailed format specification.
 */

import { EnergyPrice } from "@/types/energy-data";

export class BinaryPriceDecoder {
  private data: Uint8Array;
  private bitPosition: number = 0;
  private readonly BASE_YEAR = 2000;

  constructor(buffer: ArrayBuffer) {
    this.data = new Uint8Array(buffer);
    this.bitPosition = 0;
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
   * Check if there are enough bits remaining for another record
   */
  private hasNextRecord(): boolean {
    // Need at least 22 bits for the header before we can determine mode
    return this.bitPosition + 22 <= this.data.length * 8;
  }

  /**
   * Peek at the encoding mode bit without advancing position
   */
  private peekEncodingMode(): number {
    const savedPosition = this.bitPosition;
    
    try {
      // Skip to mode bit (position 21)
      this.bitPosition += 21;
      const mode = this.readBits(1);
      this.bitPosition = savedPosition;
      return mode;
    } catch {
      this.bitPosition = savedPosition;
      return 0; // Default to short form mode if we can't read
    }
  }

  /**
   * Decode a single price record
   */
  private decodeRecord(): EnergyPrice {
    // Read date/time components
    const year = this.readBits(7) + this.BASE_YEAR;
    const month = this.readBits(4);
    const day = this.readBits(5);
    const hour = this.readBits(5);
    
    // Validate components
    if (month < 1 || month > 12) {
      throw new Error(`Invalid month: ${month}`);
    }
    if (day < 1 || day > 31) {
      throw new Error(`Invalid day: ${day}`);
    }
    if (hour < 0 || hour > 23) {
      throw new Error(`Invalid hour: ${hour}`);
    }

    let price: number;
    
    // Read encoding mode bit at position 21
    const encodingMode = this.readBits(1); // Bit 21
    
    if (encodingMode === 0) {
      // Mode 0: Short form - positive values only, no sign bit
      const priceCents = this.readBits(14);
      price = priceCents / 100; // Convert cents to euros
    } else {
      // Mode 1: Long form - with sign bit after the price value
      const priceCents = this.readBits(19);
      const isNegative = this.readBits(1) === 1; // Sign bit at position 41
      
      price = priceCents / 100; // Convert cents to euros
      
      if (isNegative) {
        price = -price;
      }
    }

    // Create timestamp
    const timestamp = new Date(year, month - 1, day, hour, 0, 0, 0);
    
    return {
      timestamp: timestamp.toISOString(),
      price,
      unit: 'EUR_MWh'
    };
  }

  /**
   * Decode all price records from the buffer
   */
  public decodeAll(): EnergyPrice[] {
    const records: EnergyPrice[] = [];
    
    try {
      while (this.hasNextRecord()) {
        // Check if we have enough bits for the current record type
        const mode = this.peekEncodingMode();
        const bitsNeeded = mode === 0 ? 36 : 42;
        
        if (this.bitPosition + bitsNeeded > this.data.length * 8) {
          break; // Not enough bits for a complete record
        }
        
        const record = this.decodeRecord();
        records.push(record);
      }
    } catch (error) {
      console.warn(`Decoding stopped due to error: ${error}. Decoded ${records.length} records.`);
    }

    return records;
  }

  /**
   * Get current decoding position info
   */
  public getPosition(): { bitPosition: number; bytePosition: number; remainingBits: number } {
    return {
      bitPosition: this.bitPosition,
      bytePosition: Math.floor(this.bitPosition / 8),
      remainingBits: (this.data.length * 8) - this.bitPosition
    };
  }

  /**
   * Reset decoder to beginning
   */
  public reset(): void {
    this.bitPosition = 0;
  }
}

/**
 * Convenience function to decode binary energy price data
 */
export function decodeBinaryEnergyPrices(buffer: ArrayBuffer): EnergyPrice[] {
  const decoder = new BinaryPriceDecoder(buffer);
  return decoder.decodeAll();
}

/**
 * Load and decode binary price data from a file
 */
export async function loadBinaryPriceFile(file: File): Promise<EnergyPrice[]> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    
    reader.onload = () => {
      try {
        const buffer = reader.result as ArrayBuffer;
        const prices = decodeBinaryEnergyPrices(buffer);
        resolve(prices);
      } catch (error) {
        reject(error);
      }
    };
    
    reader.onerror = () => {
      reject(new Error('Failed to read file'));
    };
    
    reader.readAsArrayBuffer(file);
  });
}

/**
 * Fetch and decode binary price data from a URL
 */
export async function fetchBinaryPriceData(url: string): Promise<EnergyPrice[]> {
  try {
    const response = await fetch(url);
    
    if (!response.ok) {
      throw new Error(`HTTP error! status: ${response.status}`);
    }
    
    const buffer = await response.arrayBuffer();
    return decodeBinaryEnergyPrices(buffer);
    
  } catch (error) {
    throw new Error(`Failed to fetch binary price data: ${error}`, { cause: error });
  }
}
