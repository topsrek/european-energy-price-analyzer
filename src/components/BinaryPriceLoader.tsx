/**
 * Binary Price Data Loader Component
 * 
 * Component for testing and loading binary encoded energy price files.
 * Useful for development and validation of the binary encoding system.
 */

import React, { useState, useCallback } from 'react';
import { Button } from './ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from './ui/card';
import { Alert, AlertDescription } from './ui/alert';
import { Upload, FileText, Clock, Euro } from 'lucide-react';
import { loadBinaryPriceFile, fetchBinaryPriceData } from '@/utils/binary-decoder';
import { EnergyPrice } from '@/types/energy-data';

interface BinaryPriceLoaderProps {
  onDataLoaded?: (data: EnergyPrice[]) => void;
}

export function BinaryPriceLoader({ onDataLoaded }: BinaryPriceLoaderProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [loadedData, setLoadedData] = useState<EnergyPrice[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [stats, setStats] = useState<{
    recordCount: number;
    dateRange: string;
    avgPrice: number;
  } | null>(null);

  const handleFileUpload = useCallback(async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsLoading(true);
    setError(null);

    try {
      const data = await loadBinaryPriceFile(file);
      setLoadedData(data);
      onDataLoaded?.(data);

      // Calculate statistics
      if (data.length > 0) {
        const prices = data.map(d => d.price);
        const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        
        const dates = data.map(d => new Date(d.timestamp));
        const minDate = new Date(Math.min(...dates.map(d => d.getTime())));
        const maxDate = new Date(Math.max(...dates.map(d => d.getTime())));
        
        setStats({
          recordCount: data.length,
          dateRange: data.length > 1 
            ? `${minDate.toLocaleDateString()} - ${maxDate.toLocaleDateString()}`
            : minDate.toLocaleDateString(),
          avgPrice: Math.round(avgPrice * 100) / 100
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load binary price file');
    } finally {
      setIsLoading(false);
    }
  }, [onDataLoaded]);

  const handleTestLoad = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      // Try to load a test file from the public directory
      const data = await fetchBinaryPriceData('/test_energy_prices_20230818.bin');
      setLoadedData(data);
      onDataLoaded?.(data);

      if (data.length > 0) {
        const prices = data.map(d => d.price);
        const avgPrice = prices.reduce((sum, price) => sum + price, 0) / prices.length;
        
        setStats({
          recordCount: data.length,
          dateRange: 'Test data (2023-08-18)',
          avgPrice: Math.round(avgPrice * 100) / 100
        });
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load test binary file');
    } finally {
      setIsLoading(false);
    }
  }, [onDataLoaded]);

  return (
    <Card className="w-full max-w-2xl">
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <FileText className="h-5 w-5" />
          Binary Price Data Loader
        </CardTitle>
        <CardDescription>
          Load and test binary encoded energy price files
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Upload Binary File
            </label>
            <div className="relative">
              <input
                type="file"
                accept=".bin"
                onChange={handleFileUpload}
                disabled={isLoading}
                className="block w-full text-sm text-gray-500 file:mr-4 file:py-2 file:px-4 file:rounded-md file:border-0 file:text-sm file:font-medium file:bg-primary file:text-primary-foreground hover:file:bg-primary/90 disabled:opacity-50"
              />
            </div>
          </div>
          
          <div className="space-y-2">
            <label className="block text-sm font-medium">
              Load Test Data
            </label>
            <Button
              onClick={handleTestLoad}
              disabled={isLoading}
              variant="outline"
              className="w-full"
            >
              <Upload className="h-4 w-4 mr-2" />
              Load Test File
            </Button>
          </div>
        </div>

        {isLoading && (
          <Alert>
            <Clock className="h-4 w-4" />
            <AlertDescription>
              Loading and decoding binary price data...
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {stats && (
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 p-4 bg-muted rounded-lg">
            <div className="text-center">
              <div className="text-2xl font-bold">{stats.recordCount}</div>
              <div className="text-sm text-muted-foreground">Records</div>
            </div>
            <div className="text-center">
              <div className="text-2xl font-bold flex items-center justify-center">
                <Euro className="h-5 w-5 mr-1" />
                {stats.avgPrice}
              </div>
              <div className="text-sm text-muted-foreground">Avg Price/MWh</div>
            </div>
            <div className="text-center">
              <div className="text-sm font-medium">{stats.dateRange}</div>
              <div className="text-sm text-muted-foreground">Date Range</div>
            </div>
          </div>
        )}

        {loadedData && loadedData.length > 0 && (
          <div className="space-y-2">
            <h4 className="font-medium">Sample Data (First 5 Records)</h4>
            <div className="max-h-48 overflow-y-auto border rounded-md">
              <table className="w-full text-sm">
                <thead className="bg-muted">
                  <tr>
                    <th className="p-2 text-left">Timestamp</th>
                    <th className="p-2 text-right">Price (EUR/MWh)</th>
                  </tr>
                </thead>
                <tbody>
                  {loadedData.slice(0, 5).map((record, index) => (
                    <tr key={index} className="border-t">
                      <td className="p-2">
                        {new Date(record.timestamp).toLocaleString()}
                      </td>
                      <td className="p-2 text-right font-mono">
                        {record.price.toFixed(2)}
                      </td>
                    </tr>
                  ))}
                  {loadedData.length > 5 && (
                    <tr className="border-t">
                      <td colSpan={2} className="p-2 text-center text-muted-foreground">
                        ... and {loadedData.length - 5} more records
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
