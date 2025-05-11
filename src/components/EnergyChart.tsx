
import React from 'react';
import { ChartData, EnergyPrice, SmartMeterData } from '@/types/energy-data';
import { 
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale,
  ChartOptions
} from 'chart.js';
import { Line } from 'react-chartjs-2';
import 'chartjs-adapter-date-fns';
import { de } from 'date-fns/locale';

// Register ChartJS components
ChartJS.register(
  CategoryScale,
  LinearScale,
  PointElement,
  LineElement,
  Title,
  Tooltip,
  Legend,
  TimeScale
);

interface EnergyChartProps {
  energyPrices: EnergyPrice[];
  smartMeterData?: SmartMeterData[];
  showSmartMeterData: boolean;
  showTotalCost: boolean;
}

const EnergyChart: React.FC<EnergyChartProps> = ({ 
  energyPrices, 
  smartMeterData, 
  showSmartMeterData,
  showTotalCost 
}) => {
  // Prepare chart data
  const prepareChartData = (): ChartData => {
    const labels = energyPrices.map(item => item.timestamp);
    
    const datasets = [
      {
        label: 'Strompreis',
        data: energyPrices.map(item => item.price),
        borderColor: '#e53935',
        backgroundColor: 'rgba(229, 57, 53, 0.1)',
        yAxisID: 'y',
        borderWidth: 2,
        pointRadius: energyPrices.length > 100 ? 0 : 2,
        fill: false
      }
    ];
    
    if (showSmartMeterData && smartMeterData && smartMeterData.length > 0) {
      datasets.push({
        label: 'Verbrauch',
        data: smartMeterData.map(item => item.consumption),
        borderColor: '#4285f4',
        backgroundColor: 'rgba(66, 133, 244, 0.1)',
        yAxisID: 'y1',
        borderWidth: 2,
        pointRadius: smartMeterData.length > 100 ? 0 : 2,
        fill: false
      });
      
      if (showTotalCost) {
        // Create a map of timestamps to prices
        const priceMap = new Map<string, number>();
        energyPrices.forEach(price => {
          priceMap.set(price.timestamp, price.price);
        });
        
        // Calculate costs
        const costData = smartMeterData.map(item => {
          const matchingPrice = priceMap.get(item.timestamp);
          if (!matchingPrice) return null;
          
          // Convert price from €/MWh to €/kWh if needed
          const pricePerKWh = energyPrices[0].unit === 'EUR_MWh' ? matchingPrice / 1000 : matchingPrice / 100;
          return item.consumption * pricePerKWh;
        }).filter(Boolean) as number[];
        
        datasets.push({
          label: 'Kosten',
          data: costData,
          borderColor: '#34a853',
          backgroundColor: 'rgba(52, 168, 83, 0.1)',
          yAxisID: 'y2',
          borderWidth: 2,
          pointRadius: costData.length > 100 ? 0 : 2,
          fill: false
        });
      }
    }
    
    return { labels, datasets };
  };
  
  const chartData = prepareChartData();
  
  const options: ChartOptions<'line'> = {
    responsive: true,
    interaction: {
      mode: 'index' as const,
      intersect: false,
    },
    plugins: {
      title: {
        display: true,
        text: 'Strompreis und Verbrauch',
      },
      tooltip: {
        callbacks: {
          label: function(context) {
            const label = context.dataset.label || '';
            const value = context.parsed.y;
            if (label === 'Strompreis') {
              return `${label}: ${value.toFixed(2)} ${energyPrices[0].unit === 'EUR_MWh' ? '€/MWh' : 'cent/kWh'}`;
            } else if (label === 'Verbrauch') {
              return `${label}: ${value.toFixed(2)} kWh`;
            } else if (label === 'Kosten') {
              return `${label}: ${value.toFixed(2)} €`;
            }
            return `${label}: ${value}`;
          }
        }
      }
    },
    scales: {
      x: {
        type: 'time',
        time: {
          unit: energyPrices.length > 720 ? 'month' :
                energyPrices.length > 168 ? 'week' :
                energyPrices.length > 24 ? 'day' : 'hour',
          displayFormats: {
            hour: 'HH:mm',
            day: 'dd.MM',
            week: 'dd.MM',
            month: 'MMM yy'
          },
          tooltipFormat: 'dd.MM.yyyy HH:mm'
        },
        adapters: {
          date: {
            locale: de
          }
        },
        title: {
          display: true,
          text: 'Datum'
        }
      },
      y: {
        type: 'linear' as const,
        display: true,
        position: 'left' as const,
        title: {
          display: true,
          text: energyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'cent/kWh'
        }
      },
      y1: {
        type: 'linear' as const,
        display: showSmartMeterData && !!smartMeterData?.length,
        position: 'right' as const,
        grid: {
          drawOnChartArea: false,
        },
        title: {
          display: true,
          text: 'kWh'
        }
      },
      y2: {
        type: 'linear' as const,
        display: showSmartMeterData && showTotalCost && !!smartMeterData?.length,
        position: 'right' as const,
        grid: {
          drawOnChartArea: false,
        },
        title: {
          display: true,
          text: '€'
        }
      },
    },
  };
  
  return (
    <div className="w-full h-[500px]">
      <Line data={chartData} options={options} />
    </div>
  );
};

export default EnergyChart;
