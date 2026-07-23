import React, { useState, useEffect, useMemo, useRef, useCallback } from 'react';
import { ComparisonSeries, ContractOption, DataResolution, EnergyPrice, SmartMeterData } from '@/types/energy-data';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ReferenceLine,
  ReferenceArea
} from 'recharts';
import { format, parseISO, getDay, differenceInDays, differenceInMonths, getHours, getISOWeek, getQuarter } from 'date-fns';
import { de } from 'date-fns/locale';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { CheckedState } from "@radix-ui/react-checkbox";
import { Button } from '@/components/ui/button';
import { CalendarRange, Copy, RotateCcw, Table2 } from 'lucide-react';
import ControlMenu from '@/components/ControlMenu';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

// Define the structure for individual data points used in the chart
interface ExtendedChartDataPoint {
  timestamp: string;
  date: Date; // Parsed date object for easier manipulation
  price: number;
  unit: 'EUR_MWh' | 'cent_kWh';
  isFirstDataPointOfDay?: boolean;
  isFirstDataPointOfWeek?: boolean;
  isFirstDataPointOfMonth?: boolean;
  consumption?: number;
  cost?: number;
  contractEnergyPrice?: number;
  contractNetworkCosts?: number;
  contractTotalPrice?: number;
  contractTotalPriceTaxed?: number;
  fixedCosts?: number; // New property for fixed costs
  // Allow other dynamic properties if necessary, though specific props are preferred
  [key: string]: unknown;
}

interface EnergyChartProps {
  energyPrices?: EnergyPrice[];
  averageEnergyPrices?: EnergyPrice[];
  comparisonSeries?: ComparisonSeries[];
  smartMeterData?: SmartMeterData[];
  showSmartMeterData: boolean;
  showTotalCost: boolean;
  selectedContract?: ContractOption;
  averaging: string;
  showZeroLine: boolean;
  showAverageLine: boolean;
  dataResolution?: DataResolution;
  yMin?: number | null;
  yMax?: number | null;
  cutoffEnabled?: boolean;
  cutoffValue?: number | null;
  onCutoffValueChange?: (value: number | null) => void;
  activeRangePreset?: string | null;
  showSpotPriceWithTax?: boolean;
}

type ZoomRange = {
  start: number;
  end: number;
};

const MIN_VISIBLE_POINTS = 2;
const Y_DOMAIN_MARGIN_RATIO = 0.08;
const COMPARISON_COLORS = ['#e11d48', '#2563eb', '#0f766e', '#d97706', '#7c3aed', '#475569'];

const EnergyChart: React.FC<EnergyChartProps> = ({
  energyPrices = [],
  averageEnergyPrices = energyPrices,
  comparisonSeries = [],
  smartMeterData,
  showSmartMeterData,
  showTotalCost,
  selectedContract,
  averaging,
  showZeroLine,
  showAverageLine,
  dataResolution = 'hourly',
  yMin = null,
  yMax = null,
  cutoffEnabled = false,
  cutoffValue = null,
  onCutoffValueChange,
  activeRangePreset = null,
  showSpotPriceWithTax: controlledShowSpotPriceWithTax,
}) => {
  const isComparisonChart = comparisonSeries.length > 0;
  const plotSeries = useMemo(() => (isComparisonChart ? comparisonSeries : []), [comparisonSeries, isComparisonChart]);
  const referenceEnergyPrices = isComparisonChart ? comparisonSeries[0]?.energyPrices ?? [] : energyPrices;
  const chartWrapperRef = useRef<HTMLDivElement | null>(null);
  // State for toggling visibility of various lines
  const [showBasePrice, setShowBasePrice] = useState(true);
  const [showNetworkCosts, setShowNetworkCosts] = useState(true);
  const [showWithTaxes, setShowWithTaxes] = useState(true);
  const [showConsumption, setShowConsumption] = useState(true);
  const [showCost, setShowCost] = useState(true);
  const [showWeekSeparators, setShowWeekSeparators] = useState(true);
  const [showMonthSeparators, setShowMonthSeparators] = useState(true);
  const [showDaySeparators, setShowDaySeparators] = useState(false);
  const [showQuarterSeparators, setShowQuarterSeparators] = useState(false);
  const [isPriceListOpen, setIsPriceListOpen] = useState(false);
  const [copiedFormat, setCopiedFormat] = useState<'excel' | 'markdown' | null>(null);
  const [tooltipPosition, setTooltipPosition] = useState<{ x: number; y: number } | undefined>(undefined);
  const [isDraggingCutoff, setIsDraggingCutoff] = useState(false);
  const [zoomRange, setZoomRange] = useState<ZoomRange | null>(null);
  const [isPanning, setIsPanning] = useState(false);
  const zoomRangeRef = useRef<ZoomRange | null>(null);
  const isZoomedRef = useRef(false);
  const pendingWheelRef = useRef<{ clientX: number; deltaY: number } | null>(null);
  const wheelFrameRef = useRef<number | null>(null);
  const showSpotPriceWithTax = controlledShowSpotPriceWithTax ?? false;
  const priceUnitLabel = referenceEnergyPrices[0]?.unit === 'EUR_MWh' ? '€/MWh' : 'c/kWh';

  const reduceDataPoints = useCallback((data: ExtendedChartDataPoint[]) => {
    if (data.length === 0) return data;

    const totalDataPoints = data.length;
    const intervalFactor = dataResolution === 'interval' ? 4 : 1;
    const threeMonthsInHours = 90 * 24 * intervalFactor;
    const oneYearInHours = 365 * 24 * intervalFactor;
    const fiveYearsInHours = 5 * oneYearInHours;
    const tenYearsInHours = 10 * oneYearInHours;

    let step = 1;

    if (totalDataPoints > tenYearsInHours) {
      step = 24 * intervalFactor;
    } else if (totalDataPoints > fiveYearsInHours) {
      step = 12 * intervalFactor;
    } else if (totalDataPoints > oneYearInHours) {
      step = 3 * intervalFactor;
    } else if (totalDataPoints > threeMonthsInHours) {
      step = Math.max(2, intervalFactor);
    }

    if (step === 1) return data;

    const reducedData = [data[0]];
    for (let i = step; i < data.length; i += step) {
      reducedData.push(data[i]);
    }

    const lastIndex = data.length - 1;
    if (lastIndex > 0 && lastIndex % step !== 0) {
      reducedData.push(data[lastIndex]);
    }

    return reducedData;
  }, [dataResolution]);

  // Prepare chart data, memoized
  const chartData = useMemo(() => {
    if (isComparisonChart) {
      const rowMap = new Map<string, ExtendedChartDataPoint>();

      plotSeries.forEach((series) => {
        series.energyPrices.forEach((item) => {
          const existing = rowMap.get(item.timestamp);
          const date = parseISO(item.timestamp);
          if (existing) {
            existing[series.id] = item.price;
            return;
          }

          rowMap.set(item.timestamp, {
            timestamp: item.timestamp,
            date,
            price: item.price,
            unit: item.unit,
            [series.id]: item.price,
          });
        });
      });

      const internalChartData = Array.from(rowMap.values()).sort(
        (left, right) => left.date.getTime() - right.date.getTime()
      );

      const dayProcessed = new Map<string, boolean>();
      const weekProcessed = new Map<string, boolean>();
      const monthProcessed = new Map<string, boolean>();

      internalChartData.forEach((item) => {
        const date = item.date;
        const dayKey = format(date, 'yyyy-MM-dd');
        item.isFirstDataPointOfDay = !dayProcessed.has(dayKey);
        dayProcessed.set(dayKey, true);

        const weekOfYearKey = format(date, 'yyyy-II');
        item.isFirstDataPointOfWeek = getDay(date) === 1 && !weekProcessed.has(weekOfYearKey);
        if (item.isFirstDataPointOfWeek) {
          weekProcessed.set(weekOfYearKey, true);
        }

        const monthKey = format(date, 'yyyy-MM');
        item.isFirstDataPointOfMonth = !monthProcessed.has(monthKey);
        monthProcessed.set(monthKey, true);
      });

      return reduceDataPoints(internalChartData);
    }

    const internalChartData: ExtendedChartDataPoint[] = energyPrices.map(item => {
      const date = parseISO(item.timestamp);
      let processedPrice = item.price;

      // Add tax to spot price if enabled
      if (showSpotPriceWithTax) {
        processedPrice = item.price * 1.2; // Add 20% VAT
      }

      return {
        timestamp: item.timestamp,
        date: date,
        price: processedPrice,
        originalPrice: item.price, // Keep original for reference
        unit: item.unit,
      };
    });

    const dayProcessed = new Map<string, boolean>();
    const weekProcessed = new Map<string, boolean>();
    const monthProcessed = new Map<string, boolean>();

    internalChartData.forEach(item => {
      const date = item.date;
      const dayKey = format(date, 'yyyy-MM-dd');
      if (!dayProcessed.has(dayKey)) {
        item.isFirstDataPointOfDay = true;
        dayProcessed.set(dayKey, true);
      } else {
        item.isFirstDataPointOfDay = false;
      }

      const weekOfYearKey = format(date, 'yyyy-II');
      if (getDay(date) === 1) {
        if (!weekProcessed.has(weekOfYearKey)) {
          item.isFirstDataPointOfWeek = true;
          weekProcessed.set(weekOfYearKey, true);
        } else {
          item.isFirstDataPointOfWeek = false;
        }
      } else {
        item.isFirstDataPointOfWeek = false;
      }

      const monthKey = format(date, 'yyyy-MM');
      if (!monthProcessed.has(monthKey)) {
        item.isFirstDataPointOfMonth = true;
        monthProcessed.set(monthKey, true);
      } else {
        item.isFirstDataPointOfMonth = false;
      }
    });

    if (showSmartMeterData && smartMeterData && smartMeterData.length > 0) {
      const consumptionMap = new Map<string, number>();
      smartMeterData.forEach(item => {
        consumptionMap.set(item.timestamp, item.consumption);
      });

      internalChartData.forEach(item => {
        const consumption = consumptionMap.get(item.timestamp);
        if (consumption !== undefined) {
          item.consumption = consumption;
          if (showTotalCost) {
            const price = item.price;
            const pricePerKWh = item.unit === 'EUR_MWh' ? price / 1000 : price / 100;
            item.cost = consumption * pricePerKWh;
          }
        }
      });
    }

    if (selectedContract) {
      const energyPriceInCents = selectedContract.energyPrice;
      const annualConsumption = showSmartMeterData && smartMeterData
        ? smartMeterData.reduce((sum, data) => sum + data.consumption, 0) * (365 / (smartMeterData.length / 24))
        : 3500;

      const networkCostsPerYear = selectedContract.networkCosts(annualConsumption);
      const networkCostsPerKwh = networkCostsPerYear / annualConsumption;

      internalChartData.forEach(item => {
        // Contract energy price (Nettostromkosten)
        if (item.unit === 'EUR_MWh') {
          item.contractEnergyPrice = energyPriceInCents * 10;
          item.contractNetworkCosts = (energyPriceInCents + networkCostsPerKwh * 100) * 10;
          item.contractTotalPriceTaxed = (energyPriceInCents + networkCostsPerKwh * 100) * 10 * 1.2;
        } else {
          item.contractEnergyPrice = energyPriceInCents;
          item.contractNetworkCosts = energyPriceInCents + (networkCostsPerKwh * 100);
          item.contractTotalPriceTaxed = (energyPriceInCents + (networkCostsPerKwh * 100)) * 1.2;
        }
      });
    }

    return reduceDataPoints(internalChartData);
  }, [
    energyPrices,
    isComparisonChart,
    plotSeries,
    reduceDataPoints,
    selectedContract,
    showSmartMeterData,
    showSpotPriceWithTax,
    showTotalCost,
    smartMeterData,
  ]);

  const fullDataEndIndex = Math.max(0, chartData.length - 1);
  const minVisiblePoints = Math.min(MIN_VISIBLE_POINTS, chartData.length);
  const firstChartTimestamp = chartData[0]?.timestamp;
  const lastChartTimestamp = chartData[chartData.length - 1]?.timestamp;

  const normalizeZoomRange = useCallback((range: ZoomRange | null): ZoomRange | null => {
    if (!range || chartData.length <= minVisiblePoints) {
      return null;
    }

    const rawStart = Math.round(Math.min(range.start, range.end));
    const rawEnd = Math.round(Math.max(range.start, range.end));
    const requestedCount = rawEnd - rawStart + 1;

    if (requestedCount >= chartData.length) {
      return null;
    }

    const nextCount = Math.max(minVisiblePoints, Math.min(chartData.length, requestedCount));
    let nextStart = Math.max(0, Math.min(rawStart, chartData.length - nextCount));
    let nextEnd = nextStart + nextCount - 1;

    if (nextEnd > fullDataEndIndex) {
      nextEnd = fullDataEndIndex;
      nextStart = Math.max(0, nextEnd - nextCount + 1);
    }

    if (nextStart === 0 && nextEnd === fullDataEndIndex) {
      return null;
    }

    return { start: nextStart, end: nextEnd };
  }, [chartData.length, fullDataEndIndex, minVisiblePoints]);

  const setNormalizedZoomRange = useCallback((range: ZoomRange | null) => {
    setZoomRange(normalizeZoomRange(range));
  }, [normalizeZoomRange]);

  useEffect(() => {
    zoomRangeRef.current = zoomRange;
    isZoomedRef.current = zoomRange !== null;
  }, [zoomRange]);

  useEffect(() => {
    setZoomRange(null);
  }, [averaging, chartData.length, firstChartTimestamp, lastChartTimestamp]);

  const visibleRange = normalizeZoomRange(zoomRange) ?? { start: 0, end: fullDataEndIndex };
  const visibleChartData = useMemo(() => {
    if (chartData.length === 0) {
      return [];
    }

    return chartData.slice(visibleRange.start, visibleRange.end + 1);
  }, [chartData, visibleRange.end, visibleRange.start]);

  const isZoomed = zoomRange !== null;
  const visiblePointCount = visibleRange.end - visibleRange.start + 1;

  const zoomFromRange = useCallback((
    baseRange: ZoomRange,
    centerRatio: number,
    scaleFactor: number,
  ) => {
    if (chartData.length <= minVisiblePoints) {
      return;
    }

    const currentCount = baseRange.end - baseRange.start + 1;
    const safeCenterRatio = Math.max(0, Math.min(1, centerRatio));
    const centerIndex = baseRange.start + safeCenterRatio * Math.max(1, currentCount - 1);
    const nextCount = Math.max(
      minVisiblePoints,
      Math.min(chartData.length, Math.round(currentCount * scaleFactor))
    );

    const nextStart = centerIndex - safeCenterRatio * Math.max(1, nextCount - 1);
    setNormalizedZoomRange({
      start: nextStart,
      end: nextStart + nextCount - 1,
    });
  }, [chartData.length, minVisiblePoints, setNormalizedZoomRange]);

  const zoomAtClientX = useCallback((clientX: number, scaleFactor: number) => {
    const wrapper = chartWrapperRef.current;
    if (!wrapper || chartData.length <= minVisiblePoints) {
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    const centerRatio = rect.width > 0 ? (clientX - rect.left) / rect.width : 0.5;
    const baseRange = zoomRangeRef.current ?? { start: 0, end: fullDataEndIndex };
    zoomFromRange(baseRange, centerRatio, scaleFactor);
  }, [chartData.length, fullDataEndIndex, minVisiblePoints, zoomFromRange]);

  const panFromClientDelta = useCallback((startRange: ZoomRange, startClientX: number, currentClientX: number) => {
    const wrapper = chartWrapperRef.current;
    if (!wrapper || chartData.length <= minVisiblePoints) {
      return;
    }

    const rect = wrapper.getBoundingClientRect();
    const visibleCount = startRange.end - startRange.start + 1;
    const pointDelta = rect.width > 0
      ? ((startClientX - currentClientX) / rect.width) * Math.max(1, visibleCount - 1)
      : 0;

    const nextStart = startRange.start + Math.round(pointDelta);
    setNormalizedZoomRange({
      start: nextStart,
      end: nextStart + visibleCount - 1,
    });
  }, [chartData.length, minVisiblePoints, setNormalizedZoomRange]);

  const resetZoom = useCallback(() => {
    setZoomRange(null);
  }, []);

  useEffect(() => {
    const wrapper = chartWrapperRef.current;
    if (!wrapper) {
      return;
    }

    const handleWheel = (event: WheelEvent) => {
      if (chartData.length <= minVisiblePoints) {
        return;
      }

      event.preventDefault();
      // ponytail: only the latest wheel input matters before the next paint.
      pendingWheelRef.current = { clientX: event.clientX, deltaY: event.deltaY };
      if (wheelFrameRef.current !== null) {
        return;
      }

      wheelFrameRef.current = requestAnimationFrame(() => {
        wheelFrameRef.current = null;
        const latestWheel = pendingWheelRef.current;
        pendingWheelRef.current = null;
        if (latestWheel) {
          zoomAtClientX(latestWheel.clientX, latestWheel.deltaY > 0 ? 1.22 : 0.82);
        }
      });
    };

    wrapper.addEventListener('wheel', handleWheel, { passive: false });

    return () => {
      wrapper.removeEventListener('wheel', handleWheel);
      if (wheelFrameRef.current !== null) {
        cancelAnimationFrame(wheelFrameRef.current);
        wheelFrameRef.current = null;
      }
      pendingWheelRef.current = null;
    };
  }, [chartData.length, minVisiblePoints, zoomAtClientX]);

  useEffect(() => {
    const wrapper = chartWrapperRef.current;
    if (!wrapper) {
      return;
    }

    let startRange: ZoomRange | null = null;
    let startClientX = 0;

    const handleMouseDown = (event: MouseEvent) => {
      if (
        event.button !== 0 ||
        !isZoomedRef.current ||
        chartData.length <= minVisiblePoints
      ) {
        return;
      }

      startRange = zoomRangeRef.current;
      if (!startRange) {
        return;
      }

      event.preventDefault();
      startClientX = event.clientX;
      setIsPanning(true);
    };

    const handleMouseMove = (event: MouseEvent) => {
      if (!startRange) {
        return;
      }

      event.preventDefault();
      panFromClientDelta(startRange, startClientX, event.clientX);
    };

    const stopMousePan = () => {
      if (!startRange) {
        return;
      }

      startRange = null;
      setIsPanning(false);
    };

    wrapper.addEventListener('mousedown', handleMouseDown);
    window.addEventListener('mousemove', handleMouseMove);
    window.addEventListener('mouseup', stopMousePan);
    window.addEventListener('blur', stopMousePan);

    return () => {
      wrapper.removeEventListener('mousedown', handleMouseDown);
      window.removeEventListener('mousemove', handleMouseMove);
      window.removeEventListener('mouseup', stopMousePan);
      window.removeEventListener('blur', stopMousePan);
    };
  }, [chartData.length, minVisiblePoints, panFromClientDelta]);

  useEffect(() => {
    const wrapper = chartWrapperRef.current;
    if (!wrapper) {
      return;
    }

    let pinchStartDistance = 0;
    let pinchStartRange: ZoomRange | null = null;
    let pinchCenterRatio = 0.5;
    let touchPanStartRange: ZoomRange | null = null;
    let touchPanStartX = 0;

    const getTouchDistance = (touches: TouchList) => {
      if (touches.length < 2) {
        return 0;
      }

      const first = touches[0];
      const second = touches[1];
      return Math.hypot(first.clientX - second.clientX, first.clientY - second.clientY);
    };

    const getTouchCenterRatio = (touches: TouchList) => {
      const rect = wrapper.getBoundingClientRect();
      if (touches.length < 2 || rect.width <= 0) {
        return 0.5;
      }

      const centerX = (touches[0].clientX + touches[1].clientX) / 2;
      return (centerX - rect.left) / rect.width;
    };

    const handleTouchStart = (event: TouchEvent) => {
      if (chartData.length <= minVisiblePoints) {
        return;
      }

      if (event.touches.length === 2) {
        pinchStartDistance = getTouchDistance(event.touches);
        pinchStartRange = zoomRangeRef.current ?? { start: 0, end: fullDataEndIndex };
        pinchCenterRatio = getTouchCenterRatio(event.touches);
        touchPanStartRange = null;
      } else if (event.touches.length === 1 && isZoomedRef.current) {
        touchPanStartRange = zoomRangeRef.current;
        touchPanStartX = event.touches[0].clientX;
        pinchStartRange = null;
      }
    };

    const handleTouchMove = (event: TouchEvent) => {
      if (event.touches.length === 2 && pinchStartRange && pinchStartDistance > 0) {
        event.preventDefault();
        const nextDistance = getTouchDistance(event.touches);
        if (nextDistance <= 0) {
          return;
        }

        zoomFromRange(pinchStartRange, pinchCenterRatio, pinchStartDistance / nextDistance);
      } else if (event.touches.length === 1 && touchPanStartRange) {
        event.preventDefault();
        panFromClientDelta(touchPanStartRange, touchPanStartX, event.touches[0].clientX);
      }
    };

    const handleTouchEnd = () => {
      if (pinchStartRange) {
        const currentRange = zoomRangeRef.current;
        pinchStartRange = currentRange ?? { start: 0, end: fullDataEndIndex };
        pinchStartDistance = 0;
      }

      if (!isZoomedRef.current) {
        touchPanStartRange = null;
      }
    };

    wrapper.addEventListener('touchstart', handleTouchStart, { passive: true });
    wrapper.addEventListener('touchmove', handleTouchMove, { passive: false });
    wrapper.addEventListener('touchend', handleTouchEnd);
    wrapper.addEventListener('touchcancel', handleTouchEnd);

    return () => {
      wrapper.removeEventListener('touchstart', handleTouchStart);
      wrapper.removeEventListener('touchmove', handleTouchMove);
      wrapper.removeEventListener('touchend', handleTouchEnd);
      wrapper.removeEventListener('touchcancel', handleTouchEnd);
    };
  }, [chartData.length, fullDataEndIndex, minVisiblePoints, panFromClientDelta, zoomFromRange]);

  // Calculate data timespan in days and months
  const dataTimeSpanDays = visibleChartData.length > 0
    ? differenceInDays(visibleChartData[visibleChartData.length - 1].date, visibleChartData[0].date)
    : 0;

  const dataTimeSpanMonths = visibleChartData.length > 0
    ? differenceInMonths(visibleChartData[visibleChartData.length - 1].date, visibleChartData[0].date)
    : 0;

  const visibleStart = visibleChartData[0]?.date.getTime() ?? Number.NEGATIVE_INFINITY;
  const visibleEnd = visibleChartData[visibleChartData.length - 1]?.date.getTime() ?? Number.POSITIVE_INFINITY;
  const getAveragingBucketKey = useCallback((date: Date) => {
    if (averaging === 'monthly') return `${date.getFullYear()}-${date.getMonth() + 1}`;
    if (averaging === 'daily') return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`;
    if (averaging === 'weekly') {
      const weekStart = new Date(date);
      weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
      weekStart.setHours(0, 0, 0, 0);
      return weekStart.toISOString().slice(0, 10);
    }
    if (averaging === 'hourly') return `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}-${date.getHours()}`;
    return date.toISOString();
  }, [averaging]);
  const visibleBucketKeys = useMemo(
    () => new Set(visibleChartData.map((item) => getAveragingBucketKey(item.date))),
    [getAveragingBucketKey, visibleChartData]
  );
  const isInVisibleRange = useCallback((timestamp: string) => {
    if (averaging === 'daily-cycle') return true;
    if (averaging === 'none') {
      const time = parseISO(timestamp).getTime();
      return time >= visibleStart && time <= visibleEnd;
    }
    return visibleBucketKeys.has(getAveragingBucketKey(parseISO(timestamp)));
  }, [averaging, getAveragingBucketKey, visibleBucketKeys, visibleEnd, visibleStart]);

  const averageSummaries = useMemo(() => {
    // ponytail: display point reduction never changes aggregate calculations.
    if (isComparisonChart) {
      return plotSeries
        .map((series, index) => {
          const values = series.energyPrices
            .filter((item) => isInVisibleRange(item.timestamp))
            .map((item) => item.price);

          if (!values.length) return null;

          return {
            id: series.id,
            label: series.shortLabel ?? series.label,
            color: series.color || COMPARISON_COLORS[index % COMPARISON_COLORS.length],
            value: values.reduce((sum, value) => sum + value, 0) / values.length,
          };
        })
        .filter((item): item is NonNullable<typeof item> => item !== null);
    }

    const values = averageEnergyPrices
      .filter((item) => isInVisibleRange(item.timestamp))
      .map((item) => showSpotPriceWithTax ? item.price * 1.2 : item.price);

    if (!values.length) return [];

    return [{
      id: 'price',
      label: showSpotPriceWithTax ? 'Strompreis inkl. USt.' : 'Strompreis',
      color: '#8E512C',
      value: values.reduce((sum, value) => sum + value, 0) / values.length,
    }];
  }, [averageEnergyPrices, isComparisonChart, isInVisibleRange, plotSeries, showSpotPriceWithTax]);

  const averagePrice = useMemo(() => {
    const values = averageSummaries.map((item) => item.value);
    if (!values.length) {
      return null;
    }

    return values.reduce((sum, value) => sum + value, 0) / values.length;
  }, [averageSummaries]);

  const canShowDaySeparators = averaging === 'none' && dataTimeSpanMonths < 3;
  const canShowWeekSeparators = (averaging === 'none' || averaging === 'daily') && dataTimeSpanMonths < 6;
  const canShowMonthSeparators = averaging !== 'monthly' && averaging !== 'daily-cycle';
  const shouldShowDaySeparators = showDaySeparators && canShowDaySeparators;
  const shouldShowWeekSeparators = showWeekSeparators && canShowWeekSeparators;
  const shouldShowMonthSeparators = showMonthSeparators && canShowMonthSeparators;
  const hasMultipleQuarters = useMemo(() => {
    const quarterKeys = new Set(
      visibleChartData.map((item) => `${item.date.getFullYear()}-Q${getQuarter(item.date)}`)
    );
    return quarterKeys.size > 1;
  }, [visibleChartData]);
  const canShowQuarterSeparators = averaging !== 'daily-cycle' && hasMultipleQuarters;
  const shouldShowQuarterSeparators = showQuarterSeparators && canShowQuarterSeparators;

  useEffect(() => {
    if (activeRangePreset === '1w' && canShowDaySeparators) setShowDaySeparators(true);
  }, [activeRangePreset, canShowDaySeparators]);

  // Generate dynamic ticks for XAxis
  const getXAxisTicks = (axisData: ExtendedChartDataPoint[]) => {
    if (!axisData || axisData.length === 0) {
      return [];
    }

    const ticks: string[] = [];
    const firstDate = axisData[0].date;
    const lastDate = axisData[axisData.length - 1].date;
    const daysDiff = differenceInDays(lastDate, firstDate);

    // Handle cases based on 'averaging' prop first
    if (averaging === 'daily-cycle') {
      // For daily-cycle, show specific hours if data covers them
      const uniqueHours = new Set(axisData.map(d => getHours(d.date)));
      const tickHours = [0, 6, 12, 18]; // Default hours to show
      tickHours.forEach(hour => {
        if (uniqueHours.has(hour)) {
           const firstMatch = axisData.find(d => getHours(d.date) === hour);
           if (firstMatch) ticks.push(firstMatch.timestamp);
        }
      });
      // Ensure at least first and last points are there if no specific hours match
      if (ticks.length === 0) {
        ticks.push(axisData[0].timestamp);
        if (axisData.length > 1) ticks.push(axisData[axisData.length - 1].timestamp);
      }
      return ticks.filter((t, i, arr) => arr.indexOf(t) === i); // Unique ticks
    }

    if (averaging === 'hourly') {
        // For hourly, show a tick every 6 or 12 hours if the span is large enough
        let step = 1; // Show every hour by default
        if (axisData.length > 24 * 3) step = 6; // Every 6 hours if more than 3 days of hourly data
        if (axisData.length > 24 * 7) step = 12; // Every 12 hours if more than 7 days

        axisData.forEach((item, index) => {
            if (index % step === 0) {
                ticks.push(item.timestamp);
            }
        });
        if (ticks.length === 0 && axisData.length > 0) ticks.push(axisData[0].timestamp);
        if (axisData.length > 1 && !ticks.includes(axisData[axisData.length - 1].timestamp)) {
            ticks.push(axisData[axisData.length -1].timestamp);
        }
        return ticks.filter((t, i, arr) => arr.indexOf(t) === i);
    }


    if (averaging === 'daily') {
      // Show every Nth day
      let step = 1;
      if (daysDiff > 10) step = 2;
      if (daysDiff > 30) step = 3;
      if (daysDiff > 90) step = 7; // Every week

      let lastPushedDate: Date | null = null;
      axisData.forEach(item => {
        if (!lastPushedDate || differenceInDays(item.date, lastPushedDate) >= step) {
          ticks.push(item.timestamp);
          lastPushedDate = item.date;
        }
      });
       if (ticks.length === 0 && axisData.length > 0) ticks.push(axisData[0].timestamp);
       if (axisData.length > 1 && !ticks.includes(axisData[axisData.length - 1].timestamp)) {
            ticks.push(axisData[axisData.length -1].timestamp);
        }
      return ticks.filter((t, i, arr) => arr.indexOf(t) === i);
    }

    if (averaging === 'weekly') {
      axisData.forEach((item) => {
        ticks.push(item.timestamp);
      });
      return ticks.filter((t, i, arr) => arr.indexOf(t) === i);
    }

    if (averaging === 'monthly') {
      const monthTicks = axisData
        .filter((item) => item.isFirstDataPointOfMonth)
        .map((item) => item.timestamp);
      if (monthTicks.length < 2 && axisData.length > 0) {
        monthTicks.push(axisData[0].timestamp, axisData[axisData.length - 1].timestamp);
      }
      const uniqueTicks = monthTicks.filter((tick, index, ticks) => ticks.indexOf(tick) === index);
      const step = Math.max(1, Math.ceil(uniqueTicks.length / 12));
      return uniqueTicks.filter((_, index) => index % step === 0 || index === uniqueTicks.length - 1);
    }


    // Default dynamic ticks if no specific averaging mode dictates them
    if (daysDiff < 3) { // Less than 3 days: potentially more ticks
      axisData.forEach(item => {
        const hour = getHours(item.date);
        if (hour % 6 === 0) { // Ticks at 00:00, 06:00, 12:00, 18:00
          ticks.push(item.timestamp);
        }
      });
      // Ensure first and last points are ticks
      if (axisData.length > 0 && !ticks.includes(axisData[0].timestamp)) {
        ticks.unshift(axisData[0].timestamp);
      }
      if (axisData.length > 1 && !ticks.includes(axisData[axisData.length - 1].timestamp)) {
        ticks.push(axisData[axisData.length - 1].timestamp);
      }
    } else if (daysDiff <= 10) { // 3-10 days: a tick per day (midnight or first data point of day)
      const dailyTicks = new Map<string, string>();
      axisData.forEach(item => {
        const dayKey = format(item.date, 'yyyy-MM-dd');
        if (!dailyTicks.has(dayKey) || getHours(item.date) === 0) {
          dailyTicks.set(dayKey, item.timestamp);
        }
      });
      ticks.push(...Array.from(dailyTicks.values()));
    } else if (daysDiff <= 30) { // 10-30 days: every 2nd day
      let lastPushedDate: Date | null = null;
      axisData.forEach(item => {
        if (!lastPushedDate || differenceInDays(item.date, lastPushedDate) >= 2) {
          ticks.push(item.timestamp);
          lastPushedDate = item.date;
        }
      });
    } else { // More than 30 days: every Nth day (e.g. 3rd, 7th)
      let step = 3;
      if (daysDiff > 90) step = 7; // weekly for very long ranges
      let lastPushedDate: Date | null = null;
      axisData.forEach(item => {
        if (!lastPushedDate || differenceInDays(item.date, lastPushedDate) >= step) {
          ticks.push(item.timestamp);
          lastPushedDate = item.date;
        }
      });
    }

    // Ensure there's at least one tick if axisData is not empty
    if (ticks.length === 0 && axisData.length > 0) {
        ticks.push(axisData[0].timestamp);
    }
    // Ensure the last data point is a tick if there's more than one point
    if (axisData.length > 1 && ticks[ticks.length -1] !== axisData[axisData.length -1].timestamp) {
        const lastTimestamp = axisData[axisData.length -1].timestamp;
        if (!ticks.includes(lastTimestamp)) {
             ticks.push(lastTimestamp);
        }
    }

    return ticks.filter((t, i, arr) => arr.indexOf(t) === i); // Return unique ticks
  };

  const xAxisTicks = getXAxisTicks(visibleChartData);

  // Calculate time unit based on data length and averaging option
  const getTimeUnit = () => {
    if (averaging === 'monthly') return 'month';
    if (averaging === 'weekly') return 'week';
    if (averaging === 'daily') return 'day';
    if (averaging === 'daily-cycle') return 'hour';
    if (averaging === 'hourly') return 'hour';

    // Default based on data length
    if (referenceEnergyPrices.length > 720) return 'month';
    if (referenceEnergyPrices.length > 168) return 'week';
    if (referenceEnergyPrices.length > 24) return 'day';
    return 'hour';
  };

  const timeUnit = getTimeUnit();

  // Format date tick based on selected time unit and averaging
  const formatXAxis = (timestamp: string) => {
    const date = parseISO(timestamp);
    const firstDate = visibleChartData.length > 0 ? visibleChartData[0].date : new Date();
    const lastDate = visibleChartData.length > 0 ? visibleChartData[visibleChartData.length - 1].date : new Date();
    const daysDiff = visibleChartData.length > 0 ? differenceInDays(lastDate, firstDate) : 0;

    switch (averaging) {
      case 'monthly':
        return format(date, 'MMM yy', { locale: de });
      case 'daily':
        // If many days, only show month for first tick of a new month
        if (daysDiff > 30 && date.getDate() === 1) return format(date, 'MMM', { locale: de });
        return format(date, 'dd.MM.', { locale: de });
      case 'weekly':
        return `KW ${getISOWeek(date)}`;
      case 'daily-cycle':
        return format(date, 'HH:00', { locale: de });
      case 'hourly':
         if (daysDiff > 2) return format(date, 'dd.MM. HH:00', { locale: de });
        return format(date, 'HH:00', { locale: de });
      default: // Auto mode based on daysDiff (not specific averaging)
        if (daysDiff < 1) { // Less than a day
            return format(date, 'HH:mm', { locale: de });
        } else if (daysDiff < 3) { // Less than 3 days
            return format(date, 'dd.MM. HH:00', { locale: de });
        } else if (daysDiff <= 10) {
            return format(date, 'dd.MM.', { locale: de });
        } else if (daysDiff <= 90) { // Up to ~3 months
            if (date.getDate() === 1 || xAxisTicks.find(t => parseISO(t).valueOf() === date.valueOf() && differenceInDays(date, visibleChartData[0].date) < 7 )) { // First day of month or first tick
                 return format(date, 'dd.MM.', { locale: de }); // Show day and month for first few/month starts
            }
            return format(date, 'dd.MM.', { locale: de }); // Otherwise just day for denser ticks
        } else { // More than 3 months
            return format(date, 'MMM yy', { locale: de });
        }
    }
  };

  // Get axis label based on averaging
  const getXAxisLabel = () => {
    switch (averaging) {
      case 'monthly':
        return 'Monatsdurchschnitt';
      case 'daily':
        return 'Tagesdurchschnitt';
      case 'weekly':
        return 'Wochendurchschnitt';
      case 'daily-cycle':
        return 'Stunde des Tages';
      case 'hourly':
        return 'Stundendurchschnitt';
      default:
        return 'Datum';
    }
  };

  const getCutoffBucketLabel = () => {
    if (averaging === 'monthly') return 'Monate';
    if (averaging === 'weekly') return 'Wochen';
    if (averaging === 'daily') return 'Tage';
    if (averaging === 'daily-cycle') return 'Stundenfenster';
    return dataResolution === 'interval' ? 'Viertelstunden' : 'Stunden';
  };

  const cutoffStats = useMemo(() => {
    if (!cutoffEnabled || cutoffValue === null) {
      return [];
    }

    const buildStats = (label: string, values: number[], color?: string) => {
      if (!values.length) return null;
      const above = values.filter((value) => value > cutoffValue).length;
      const below = values.filter((value) => value < cutoffValue).length;
      const equal = values.length - above - below;
      return {
        label,
        color,
        total: values.length,
        above,
        below,
        equal,
        abovePercent: (above / values.length) * 100,
        belowPercent: (below / values.length) * 100,
      };
    };

    if (isComparisonChart) {
      return comparisonSeries
        .map((series) =>
          buildStats(
            series.shortLabel ?? series.label,
            visibleChartData
              .map((item) => item[series.id])
              .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
            series.color
          )
        )
        .filter((item): item is NonNullable<typeof item> => item !== null);
    }

    const singleStats = buildStats(
      'Strompreis',
      visibleChartData
        .map((item) => item.price)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value))
    );

    return singleStats ? [singleStats] : [];
  }, [comparisonSeries, cutoffEnabled, cutoffValue, isComparisonChart, visibleChartData]);

  const buildPaddedDomain = useCallback((values: number[], fallback: [number | 'auto', number | 'auto'] = ['auto', 'auto']) => {
    const finiteValues = values.filter((value) => Number.isFinite(value));
    if (!finiteValues.length) {
      return fallback;
    }

    const min = Math.min(...finiteValues);
    const max = Math.max(...finiteValues);
    const span = max - min;
    const minimumPadding = priceUnitLabel === '€/MWh' ? 5 : 0.5;
    const padding = span > 0
      ? Math.max(span * Y_DOMAIN_MARGIN_RATIO, minimumPadding)
      : Math.max(Math.abs(max) * 0.08, minimumPadding);

    return [min - padding, max + padding] as [number, number];
  }, [priceUnitLabel]);

  const priceAxisDomain = useMemo(() => {
    const values: number[] = [];

    visibleChartData.forEach((item) => {
      if (isComparisonChart) {
        plotSeries.forEach((series) => {
          const value = item[series.id];
          if (typeof value === 'number' && Number.isFinite(value)) {
            values.push(value);
          }
        });
      } else {
        if (typeof item.price === 'number' && Number.isFinite(item.price)) {
          values.push(item.price);
        }

        if (selectedContract) {
          if (showBasePrice && typeof item.contractEnergyPrice === 'number') {
            values.push(item.contractEnergyPrice);
          }
          if (showNetworkCosts && typeof item.contractNetworkCosts === 'number') {
            values.push(item.contractNetworkCosts);
          }
          if (showWithTaxes && typeof item.contractTotalPriceTaxed === 'number') {
            values.push(item.contractTotalPriceTaxed);
          }
        }
      }
    });

    if (showZeroLine) {
      values.push(0);
    }
    if (cutoffEnabled && cutoffValue !== null) {
      values.push(cutoffValue);
    }

    const [autoMin, autoMax] = buildPaddedDomain(values);
    return [yMin ?? autoMin, yMax ?? autoMax] as [number | 'auto', number | 'auto'];
  }, [
    buildPaddedDomain,
    cutoffEnabled,
    cutoffValue,
    isComparisonChart,
    plotSeries,
    selectedContract,
    showBasePrice,
    showNetworkCosts,
    showWithTaxes,
    showZeroLine,
    visibleChartData,
    yMax,
    yMin,
  ]);

  const consumptionAxisDomain = useMemo(() => {
    return buildPaddedDomain(
      visibleChartData
        .map((item) => item.consumption)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      ['auto', 'auto']
    );
  }, [buildPaddedDomain, visibleChartData]);

  const costAxisDomain = useMemo(() => {
    return buildPaddedDomain(
      visibleChartData
        .map((item) => item.cost)
        .filter((value): value is number => typeof value === 'number' && Number.isFinite(value)),
      ['auto', 'auto']
    );
  }, [buildPaddedDomain, visibleChartData]);

  const clampTooltipPosition = (state: {
    chartX?: number;
    chartY?: number;
    chartWidth?: number;
    chartHeight?: number;
  }) => {
    const wrapperWidth = chartWrapperRef.current?.clientWidth ?? state.chartWidth ?? 0;
    const wrapperHeight = chartWrapperRef.current?.clientHeight ?? state.chartHeight ?? 0;
    const nextX = Math.max(16, Math.min((state.chartX ?? 0) + 16, Math.max(16, wrapperWidth - 180)));
    const nextY = Math.max(16, Math.min((state.chartY ?? 0) - 12, Math.max(16, wrapperHeight - 96)));
    return { x: nextX, y: nextY };
  };

  const getPriceAxis = (state: Record<string, unknown>) => {
    const axisMap = state.yAxisMap as Record<string, { yAxisId?: string; scale?: ((value: number) => number) & { invert?: (value: number) => number } }> | undefined;
    if (!axisMap) return null;
    return Object.values(axisMap).find((value) => value?.yAxisId === 'price') ?? Object.values(axisMap)[0] ?? null;
  };

  const extractPriceAxisValue = (state: Record<string, unknown>) => {
    const axis = getPriceAxis(state);
    const chartY = typeof state.chartY === 'number' ? state.chartY : null;
    if (!axis?.scale || typeof axis.scale.invert !== 'function' || chartY === null) {
      return null;
    }

    const nextValue = axis.scale.invert(chartY);
    return Number.isFinite(nextValue) ? nextValue : null;
  };

  const updateCutoffFromPointer = (state: Record<string, unknown>) => {
    if (!cutoffEnabled || !onCutoffValueChange) {
      return;
    }

    const nextValue = extractPriceAxisValue(state);
    if (nextValue === null) {
      return;
    }

    onCutoffValueChange(Number(nextValue.toFixed(2)));
  };

  const handleChartMouseMove = (state: Record<string, unknown>) => {
    const chartX = typeof state.chartX === 'number' ? state.chartX : null;
    const chartY = typeof state.chartY === 'number' ? state.chartY : null;

    if (chartX !== null && chartY !== null) {
      setTooltipPosition(clampTooltipPosition(state as { chartX?: number; chartY?: number; chartWidth?: number; chartHeight?: number }));
    }

    if (isDraggingCutoff) updateCutoffFromPointer(state);
  };

  // Custom tooltip formatter
  interface TooltipProps {
    active?: boolean;
    payload?: Array<{
      value: number;
      name: string;
      color: string;
      dataKey: string;
    }>;
    label?: string;
  }

  const CustomTooltip = ({ active, payload, label }: TooltipProps) => {
    if (active && payload && payload.length && label) {
      const date = parseISO(label);

      // Format date based on averaging
      let formattedDate;
      switch (averaging) {
        case 'monthly':
          formattedDate = format(date, 'MMMM yyyy', { locale: de });
          break;
        case 'daily':
          formattedDate = format(date, 'dd.MM.yyyy', { locale: de });
          break;
        case 'weekly':
          formattedDate = `KW ${getISOWeek(date)} ${format(date, 'yyyy', { locale: de })}`;
          break;
        case 'daily-cycle':
          formattedDate = format(date, 'HH:00 \'Uhr\'', { locale: de });
          break;
        case 'hourly':
          formattedDate = format(date, 'dd.MM.yyyy HH:00 \'Uhr\'', { locale: de });
          break;
        default:
          formattedDate = format(date, 'dd.MM.yyyy HH:mm', { locale: de });
      }

      return (
        <div className="bg-card p-3 border border-border rounded-md shadow-md">
          <p className="font-medium text-sm mb-2">{formattedDate}</p>
          {payload.map((entry, index: number) => {
            if (entry.value === null || entry.value === undefined) return null;

            const value = entry.value;
            let unit = '';
            let name = entry.name;

            if (isComparisonChart) {
              unit = priceUnitLabel;
              name = entry.name;
            } else if (entry.dataKey === 'price') {
              unit = priceUnitLabel;
              name = showSpotPriceWithTax ? 'Strompreis (inkl. USt.)' : 'Strompreis';
            } else if (entry.dataKey === 'consumption') {
              unit = 'kWh';
              name = 'Verbrauch';
            } else if (entry.dataKey === 'cost') {
              unit = '€';
              name = 'Kosten';
            } else if (entry.dataKey === 'contractEnergyPrice') {
              unit = priceUnitLabel;
              name = `${selectedContract?.provider} ${selectedContract?.name}: Nettostromkosten`;
            } else if (entry.dataKey === 'contractNetworkCosts') {
              unit = priceUnitLabel;
              name = `${selectedContract?.provider} ${selectedContract?.name}: inkl. Netzkosten`;
            } else if (entry.dataKey === 'contractTotalPriceTaxed') {
              unit = priceUnitLabel;
              name = `${selectedContract?.provider} ${selectedContract?.name}: inkl. Steuern`;
            }

            return (
              <p key={`tooltip-${index}`} className="text-sm" style={{ color: entry.color }}>
                <span className="font-medium">{name}: </span>
                {value.toFixed(2)} {unit}
              </p>
            );
          })}
        </div>
      );
    }
    return null;
  };

  // Handler for checkbox changes
  const handleCheckedChange = (setter: React.Dispatch<React.SetStateAction<boolean>>) => {
    return (checked: CheckedState) => {
      setter(checked === true);
    };
  };

  const formatPriceListDate = (date: Date) => {
    if (averaging === 'monthly') return format(date, 'MMMM yyyy', { locale: de });
    if (averaging === 'weekly') return `KW ${getISOWeek(date)} ${format(date, 'yyyy')}`;
    if (averaging === 'daily-cycle') return format(date, 'HH:00');
    return format(date, averaging === 'daily' ? 'dd.MM.yyyy' : 'dd.MM.yyyy HH:mm');
  };

  const priceListRows = visibleChartData.map((item) => ({
    date: formatPriceListDate(item.date),
    price: item.price.toFixed(2),
  }));
  const priceListHeader = `Preis (${priceUnitLabel})`;
  const priceListExcel = ['Zeitraum\t' + priceListHeader, ...priceListRows.map((row) => `${row.date}\t${row.price}`)].join('\n');
  const priceListMarkdown = ['| Zeitraum | ' + priceListHeader + ' |', '| --- | ---: |', ...priceListRows.map((row) => `| ${row.date} | ${row.price} |`)].join('\n');

  const copyPriceList = async (copyFormat: 'excel' | 'markdown') => {
    const text = copyFormat === 'excel' ? priceListExcel : priceListMarkdown;
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
    } else {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.append(textarea);
      textarea.select();
      document.execCommand('copy');
      textarea.remove();
    }
    setCopiedFormat(copyFormat);
  };

  // Simplified renderMonthBands function - avoiding NaN errors
  const renderMonthBands = () => {
    if (!shouldShowMonthSeparators || visibleChartData.length === 0) {
      return null;
    }

    const monthElements: React.JSX.Element[] = [];
    const processedMonths = new Set<string>();

    // Group all data points by month - don't rely on isFirstDataPointOfMonth flag
    const monthGroups = new Map<string, ExtendedChartDataPoint[]>();
    visibleChartData.forEach(dataPoint => {
      const monthKey = format(dataPoint.date, 'yyyy-MM');
      if (!monthGroups.has(monthKey)) {
        monthGroups.set(monthKey, []);
      }
      monthGroups.get(monthKey)!.push(dataPoint);
    });

    // Sort months chronologically and process each one
    const sortedMonthKeys = Array.from(monthGroups.keys()).sort();

    sortedMonthKeys.forEach((monthKey, index) => {
      if (processedMonths.has(monthKey)) return;
      processedMonths.add(monthKey);

      const monthDataPoints = monthGroups.get(monthKey)!;
      if (monthDataPoints.length === 0) return;

      const monthName = format(monthDataPoints[0].date, sortedMonthKeys.length > 12 ? 'MMM yy' : 'MMMM', { locale: de });
      const firstTimestamp = monthDataPoints[0].timestamp;
      const lastTimestamp = monthDataPoints[monthDataPoints.length - 1].timestamp;

      // Add month marker line at the beginning
      monthElements.push(
        <ReferenceLine
          key={`month-marker-${monthKey}`}
          x={firstTimestamp}
          yAxisId="price"
          stroke="var(--month-label-color)"
          strokeWidth={2}
          strokeOpacity={0.6}
          ifOverflow="hidden"
          style={{ pointerEvents: 'none' }}
        />
      );

      // Add background area for alternating months
      if (index % 2 === 0) {
        monthElements.push(
          <ReferenceArea
            key={`month-area-${monthKey}`}
            x1={firstTimestamp}
            x2={lastTimestamp}
            yAxisId="price"
            fill="var(--month-band-fill-color)"
            fillOpacity={0.3}
            ifOverflow="hidden"
          style={{ pointerEvents: 'none' }}
          />
        );
      }

      const monthLabelStep = Math.max(1, Math.ceil(sortedMonthKeys.length / 12));
      if (index % monthLabelStep === 0 || index === sortedMonthKeys.length - 1) {
        const middleDataPoint = monthDataPoints[Math.floor(monthDataPoints.length / 2)];
        monthElements.push(
          <ReferenceLine
            key={`month-label-${monthKey}`}
            x={middleDataPoint.timestamp}
            yAxisId="price"
            stroke="transparent"
            strokeWidth={0}
            ifOverflow="hidden"
          style={{ pointerEvents: 'none' }}
            label={{
              value: monthName,
              position: 'insideTop',
              fill: 'var(--month-label-color)',
              fontSize: 12,
              fontWeight: 'bold',
              offset: 10,
              textAnchor: 'middle'
            }}
          />
        );
      }
    });

    return <>{monthElements}</>;
  };

  const renderQuarterBands = () => {
    if (!shouldShowQuarterSeparators || visibleChartData.length === 0) {
      return null;
    }

    const quarterElements: React.JSX.Element[] = [];
    const quarterGroups = new Map<string, ExtendedChartDataPoint[]>();

    visibleChartData.forEach((dataPoint) => {
      const quarterKey = `${format(dataPoint.date, 'yyyy')}-Q${getQuarter(dataPoint.date)}`;
      if (!quarterGroups.has(quarterKey)) {
        quarterGroups.set(quarterKey, []);
      }
      quarterGroups.get(quarterKey)!.push(dataPoint);
    });

    const sortedQuarterKeys = Array.from(quarterGroups.keys()).sort();

    sortedQuarterKeys.forEach((quarterKey, index) => {
      const quarterDataPoints = quarterGroups.get(quarterKey);
      if (!quarterDataPoints?.length) {
        return;
      }

      const firstPoint = quarterDataPoints[0];
      const lastPoint = quarterDataPoints[quarterDataPoints.length - 1];
      const quarterLabel = `Q${getQuarter(firstPoint.date)} ${format(firstPoint.date, 'yyyy')}`;
      const middlePoint = quarterDataPoints[Math.floor(quarterDataPoints.length / 2)];

      quarterElements.push(
        <ReferenceLine
          key={`quarter-marker-${quarterKey}`}
          x={firstPoint.timestamp}
          yAxisId="price"
          stroke="var(--week-marker-color)"
          strokeWidth={2}
          strokeOpacity={0.35}
          ifOverflow="hidden"
          style={{ pointerEvents: 'none' }}
        />
      );

      if (index % 2 === 0) {
        quarterElements.push(
          <ReferenceArea
            key={`quarter-area-${quarterKey}`}
            x1={firstPoint.timestamp}
            x2={lastPoint.timestamp}
            yAxisId="price"
            fill="var(--day-band-fill-color)"
            fillOpacity={0.08}
            ifOverflow="hidden"
          style={{ pointerEvents: 'none' }}
          />
        );
      }

      quarterElements.push(
        <ReferenceLine
          key={`quarter-label-${quarterKey}`}
          x={middlePoint.timestamp}
          yAxisId="price"
          stroke="transparent"
          strokeWidth={0}
          ifOverflow="hidden"
          style={{ pointerEvents: 'none' }}
          label={{
            value: quarterLabel,
            position: 'insideTop',
            fill: 'var(--month-label-color)',
            fontSize: 11,
            fontWeight: 'bold',
            offset: 26,
            textAnchor: 'middle',
          }}
        />
      );
    });

    return <>{quarterElements}</>;
  };

  // Renamed from renderWeekBands and uses ReferenceLine for week markers
  const renderWeekMarkers = () => {
    if (!shouldShowWeekSeparators || visibleChartData.length === 0) {
      return null;
    }
    const weekMarkers: React.JSX.Element[] = [];
    visibleChartData.forEach((item) => { // No index needed as we use item.timestamp
        if (item.isFirstDataPointOfWeek) {
            weekMarkers.push(
                <ReferenceLine
                    key={`week-marker-${item.timestamp}`}
                    x={item.timestamp}
                    yAxisId="price"
                    stroke="var(--week-marker-color)"
                    strokeWidth={1.5}
                    strokeDasharray="4 4"
                    strokeOpacity={0.75}
                    ifOverflow="hidden"
          style={{ pointerEvents: 'none' }}
                    label={{
                        value: `KW ${getISOWeek(item.date)}`,
                        position: 'insideTop',
                        fill: 'var(--week-label-color)',
                        fontSize: 10,
                        textAnchor: 'middle', /* Ensure centering if not default for ReferenceLine label */
                    }}
                />
            );
        }
    });
    return <>{weekMarkers}</>;
  };

  // Updated renderDayBands function using ReferenceArea like months
  const renderDayBands = () => {
    if (!shouldShowDaySeparators || visibleChartData.length <= 1) {
      return null;
    }
    const dayReferenceAreas: React.JSX.Element[] = [];
    let isGray = true; // For alternating fill
    const processedDays = new Set<string>(); // Tracks yyyy-MM-dd to ensure each day gets one band

    for (let i = 0; i < visibleChartData.length; i++) {
        const currentDataPointDate = visibleChartData[i].date;
        const dayKey = format(currentDataPointDate, 'yyyy-MM-dd');

        if (!processedDays.has(dayKey)) {
            // First time encountering this day in the loop
            processedDays.add(dayKey);

            // Find all data points actually belonging to this specific day (yyyy-MM-dd)
            const pointsInThisExactDay = visibleChartData.filter(dp => format(dp.date, 'yyyy-MM-dd') === dayKey);

            if (pointsInThisExactDay.length > 0) {
                const firstTimestampInDay = pointsInThisExactDay[0].timestamp;
                const lastTimestamp = new Date(pointsInThisExactDay[pointsInThisExactDay.length - 1].timestamp);
                // Add one hour because we want to include the last hour in the timeframe
                lastTimestamp.setHours(lastTimestamp.getHours() + 1);
                const lastTimestampInDay = lastTimestamp.toISOString();

                // Create ReferenceArea for alternating days
                if (isGray) {
                    dayReferenceAreas.push(
                        <ReferenceArea
                            key={`day-area-${dayKey}`}
                            x1={firstTimestampInDay}
                            x2={lastTimestampInDay}
                            yAxisId="price"
                            fill="var(--day-band-fill-color)"
                            fillOpacity={0.15}
                            ifOverflow="hidden"
          style={{ pointerEvents: 'none' }}
                        />
                    );
                }
                // Toggle for the next distinct day
                isGray = !isGray;
            }
        }
    }
    // The returned elements are directly used by Recharts
    return <>{dayReferenceAreas}</>;
  };

  return (
    <div className="min-w-0 space-y-2 md:space-y-4">
      <div
        ref={chartWrapperRef}
        className={`relative h-[400px] min-h-[400px] min-w-0 w-full md:h-[500px] ${isDraggingCutoff ? 'cursor-grabbing' : isZoomed ? (isPanning ? 'cursor-grabbing' : 'cursor-grab') : ''}`}
        style={{ touchAction: isZoomed ? 'none' : 'pan-y' }}
      >
        {cutoffEnabled && cutoffValue !== null && cutoffStats.length > 0 && (
          <div className="absolute right-2 top-2 z-10 max-w-[240px] rounded-md border bg-background/95 px-3 py-2 text-xs shadow-sm backdrop-blur-sm">
            <div className="mb-2 font-medium">
              Lineal bei {cutoffValue.toFixed(2)} {priceUnitLabel}
            </div>
            <div className="space-y-1.5 text-muted-foreground">
              {cutoffStats.map((stat) => (
                <div key={stat.label}>
                  <div className="font-medium" style={{ color: stat.color }}>{stat.label}</div>
                  <div>
                    {stat.above} {getCutoffBucketLabel()} darüber ({stat.abovePercent.toFixed(1)}%)
                  </div>
                  <div>
                    {stat.below} {getCutoffBucketLabel()} darunter ({stat.belowPercent.toFixed(1)}%)
                  </div>
                  {stat.equal > 0 && <div>{stat.equal} genau auf dem Lineal</div>}
                </div>
              ))}
            </div>
          </div>
        )}
        <ResponsiveContainer width="100%" height="100%">
          <LineChart
            data={visibleChartData}
            margin={{
              top: 20,
              right: window.innerWidth < 768 ? 3 : 10,
              left: window.innerWidth < 768 ? 3 : 10,
              bottom: 20
            }}
            className="bg-card md:border border-none"
            onMouseMove={handleChartMouseMove}
            onMouseUp={() => setIsDraggingCutoff(false)}
            onMouseLeave={() => setIsDraggingCutoff(false)}
          >
            <defs>
              <style type="text/css">
                {`
                  .recharts-cartesian-grid-horizontal line,
                  .recharts-cartesian-grid-vertical line {
                    stroke: var(--border);
                    opacity: 0.3;
                  }
                  .recharts-legend-wrapper {
                    bottom: 5px !important;
                  }
                  .recharts-xaxis .recharts-label {
                    transform: translateY(5px);
                  }
                  .recharts-month-label {
                    font-size: 12px;
                    fill: var(--month-label-color);
                    font-weight: bold;
                  }
                  .recharts-week-label {
                    font-size: 10px;
                    fill: var(--week-label-color);
                    text-anchor: middle; /* Ensure centering if not default for ReferenceLine label */
                  }
                  .recharts-month-refarea-label {
                    font-size: 12px;
                    fill: var(--month-label-color);
                    font-weight: bold;
                  }
                `}
              </style>
            </defs>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.3} />
            <Legend
              verticalAlign="bottom"
              height={36}
              wrapperStyle={{ paddingTop: '0px', paddingBottom: '10px' }}
            />

            {/* Zeitraum-Highlights sind rein visuell und fangen keine Mausereignisse ab. */}
            {renderQuarterBands()}
            {renderMonthBands()}
            {renderWeekMarkers()}
            {renderDayBands()}

            <XAxis
              dataKey="timestamp"
              ticks={xAxisTicks}
              tickFormatter={formatXAxis}
              label={{ value: averaging === 'daily-cycle' ? 'Stunde des Tages' : getXAxisLabel(), position: 'bottom', offset: 0 }}
              minTickGap={ averaging === 'daily-cycle' ? 15 : 30} // Smaller gap for hourly view
              height={30}
              tick={{ fontSize: 12 }}
            />

            <YAxis
              yAxisId="price"
              domain={priceAxisDomain}
              width={54}
              tickFormatter={(value) => Number(value).toFixed(2)}
              label={{
                value: priceUnitLabel,
                angle: -90,
                position: 'left',
                offset: -5,
              }}
            />
            {showSmartMeterData && smartMeterData && smartMeterData.length > 0 && (
              <YAxis
                yAxisId="consumption"
                orientation="right"
                domain={consumptionAxisDomain}
                label={{ value: 'kWh', angle: 90, position: 'right' }}
              />
            )}
            {showSmartMeterData && showTotalCost && smartMeterData && smartMeterData.length > 0 && showCost && (
              <YAxis
                yAxisId="cost"
                orientation="right"
                domain={costAxisDomain}
                label={{ value: '€', angle: 90, position: 'right', offset: 40 }}
              />
            )}
            <Tooltip
              content={<CustomTooltip />}
              position={tooltipPosition}
              isAnimationActive={false}
              cursor={{ stroke: 'hsl(var(--border))', strokeOpacity: 0.35 }}
            />
            {showZeroLine && (
              <ReferenceLine
                y={0}
                yAxisId="price"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="4 4"
                strokeOpacity={0.45}
                ifOverflow="extendDomain"
              />
            )}
            {showAverageLine && averagePrice !== null && Number.isFinite(averagePrice) && (
              <ReferenceLine
                y={averagePrice}
                yAxisId="price"
                stroke="hsl(var(--muted-foreground))"
                strokeWidth={1}
                strokeDasharray="4 4"
                strokeOpacity={0.35}
              />
            )}
            {cutoffEnabled && cutoffValue !== null && (
              <ReferenceLine
                y={cutoffValue}
                yAxisId="price"
                stroke="hsl(var(--foreground))"
                strokeWidth={1}
                strokeDasharray="6 4"
                strokeOpacity={0.55}
                ifOverflow="extendDomain"
                style={{ pointerEvents: 'none' }}
              />
            )}

            {isComparisonChart ? (
              plotSeries.map((series, index) => (
                <Line
                  key={`${series.id}-line`}
                  type="monotone"
                  dataKey={series.id}
                  name={series.label}
                  yAxisId="price"
                  stroke={series.color || COMPARISON_COLORS[index % COMPARISON_COLORS.length]}
                  strokeWidth={2}
                  dot={series.energyPrices.length > 100 ? false : {}}
                  activeDot={{ r: 4 }}
                  animationDuration={200}
                  connectNulls
                />
              ))
            ) : (
              <Line
                key="price-line"
                type="monotone"
                dataKey="price"
                name={showSpotPriceWithTax ? "Strompreis (inkl. USt.)" : "Strompreis"}
                yAxisId="price"
                stroke="#8E512C"
                strokeWidth={2}
                dot={energyPrices.length > 100 ? false : {}}
                activeDot={{ r: 5 }}
                animationDuration={200}
              />
            )}
            {!isComparisonChart && showSmartMeterData && smartMeterData && smartMeterData.length > 0 && (
              <Line
                key="consumption-line"
                type="monotone"
                dataKey="consumption"
                name="Verbrauch"
                yAxisId="consumption"
                stroke="#7A8370"
                strokeWidth={2}
                dot={smartMeterData.length > 100 ? false : {}}
                animationDuration={200}
                hide={!showConsumption}
              />
            )}
            {!isComparisonChart && showSmartMeterData && showTotalCost && smartMeterData && smartMeterData.length > 0 && (
              <Line
                key="cost-line"
                type="monotone"
                dataKey="cost"
                name="Kosten"
                yAxisId="cost"
                stroke="#B8733A"
                strokeWidth={2}
                dot={smartMeterData.length > 100 ? false : {}}
                animationDuration={200}
                hide={!showCost}
              />
            )}
            {!isComparisonChart && selectedContract && (
              <Line
                key="contractEnergyPrice-line"
                type="monotone"
                dataKey="contractEnergyPrice"
                name={`${selectedContract.provider} ${selectedContract.name} - Nettostromkosten`}
                yAxisId="price"
                stroke="#4F5A45"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={200}
                hide={!showBasePrice}
              />
            )}
            {!isComparisonChart && selectedContract && (
              <Line
                key="contractNetworkCosts-line"
                type="monotone"
                dataKey="contractNetworkCosts"
                name={`${selectedContract.provider} ${selectedContract.name} - inkl. Netzkosten`}
                yAxisId="price"
                stroke="#B8733A"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={200}
                hide={!showNetworkCosts}
              />
            )}
            {!isComparisonChart && selectedContract && (
              <Line
                key="contractTotalPriceTaxed-line"
                type="monotone"
                dataKey="contractTotalPriceTaxed"
                name={`${selectedContract.provider} ${selectedContract.name} - inkl. Steuern`}
                yAxisId="price"
                stroke="#6F6252"
                strokeWidth={3}
                strokeDasharray="5 5"
                dot={false}
                animationDuration={200}
                hide={!showWithTaxes}
              />
            )}
            {cutoffEnabled && cutoffValue !== null && !isZoomed && (
              <ReferenceLine
                y={cutoffValue}
                yAxisId="price"
                stroke="transparent"
                strokeWidth={18}
                ifOverflow="extendDomain"
                zIndex={500}
                style={{ cursor: isDraggingCutoff ? 'grabbing' : 'grab' }}
                onMouseDown={(event) => {
                  event.stopPropagation();
                  setIsDraggingCutoff(true);
                }}
              />
            )}
          </LineChart>
        </ResponsiveContainer>
      </div>

      {chartData.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 px-2">
          {isZoomed && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="h-9 gap-2 px-3"
              onClick={resetZoom}
            >
              <RotateCcw className="h-4 w-4" />
              <span>Zoom zurücksetzen</span>
            </Button>
          )}
          {averageSummaries.length > 0 && (
            <div className="flex min-w-0 flex-1 flex-wrap items-center gap-1.5 text-xs text-muted-foreground">
              <span className="mr-1 shrink-0 font-medium text-foreground">
                Ø {isZoomed ? 'sichtbar' : 'Zeitraum'}
              </span>
              {averageSummaries.map((summary) => (
                <span
                  key={`average-${summary.id}`}
                  className="inline-flex max-w-full items-center gap-1 rounded-md border bg-background px-2 py-1"
                  title={`${summary.label}: ${summary.value.toFixed(2)} ${priceUnitLabel}`}
                >
                  <span
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ backgroundColor: summary.color }}
                  />
                  <span className="truncate">{summary.label}</span>
                  <span className="font-medium text-foreground">
                    {summary.value.toFixed(2)} {priceUnitLabel}
                  </span>
                </span>
              ))}
              {isZoomed && (
                <span className="shrink-0 px-1">
                  {visiblePointCount} / {chartData.length} Punkte
                </span>
              )}
            </div>
          )}
          {!isComparisonChart && (
            <>
              <Button type="button" variant="outline" size="sm" className="h-9 gap-2 px-3" onClick={() => { setCopiedFormat(null); setIsPriceListOpen(true); }}>
                <Table2 className="h-4 w-4" />
                <span>Preisliste</span>
              </Button>
              <Dialog open={isPriceListOpen} onOpenChange={setIsPriceListOpen}>
                <DialogContent className="max-h-[85vh] max-w-lg overflow-hidden">
                  <DialogHeader>
                    <DialogTitle>Sichtbare Preise</DialogTitle>
                    <DialogDescription>Die Liste folgt dem sichtbaren Diagrammausschnitt und kann als Excel- oder Markdown-Tabelle kopiert werden.</DialogDescription>
                  </DialogHeader>
                  <div className="max-h-[52vh] overflow-auto rounded-md border">
                    <table className="w-auto min-w-[22rem] text-sm">
                      <thead className="sticky top-0 bg-background"><tr><th className="p-2 text-left">Zeitraum</th><th className="px-2 py-2 pl-6 text-left">{priceListHeader}</th></tr></thead>
                      <tbody>{priceListRows.map((row, index) => <tr key={`price-row-${index}`} className="border-t"><td className="p-2">{row.date}</td><td className="px-2 py-2 pl-6 text-left tabular-nums">{row.price}</td></tr>)}</tbody>
                    </table>
                  </div>
                  <DialogFooter>
                    <Button type="button" variant="outline" onClick={() => void copyPriceList('excel')}><Copy className="h-4 w-4" />{copiedFormat === 'excel' ? 'Kopiert' : 'Für Excel kopieren'}</Button>
                    <Button type="button" onClick={() => void copyPriceList('markdown')}><Copy className="h-4 w-4" />{copiedFormat === 'markdown' ? 'Kopiert' : 'Markdown kopieren'}</Button>
                  </DialogFooter>
                </DialogContent>
              </Dialog>
            </>
          )}
          <ControlMenu
            label="Zeitraum-Highlights"
            icon={CalendarRange}
            contentClassName="w-72"
          >
            <div className="space-y-3">
              <div className="space-y-2">
                <div className="text-sm font-medium">Markierungen</div>
                <div className="space-y-2">
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-day-separators"
                      checked={shouldShowDaySeparators}
                      disabled={!canShowDaySeparators}
                      onCheckedChange={handleCheckedChange(setShowDaySeparators)}
                    />
                    <Label htmlFor="show-day-separators" className={!canShowDaySeparators ? 'text-sm text-muted-foreground' : 'text-sm'}>Tage</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-week-separators"
                      checked={shouldShowWeekSeparators}
                      disabled={!canShowWeekSeparators}
                      onCheckedChange={handleCheckedChange(setShowWeekSeparators)}
                    />
                    <Label htmlFor="show-week-separators" className={!canShowWeekSeparators ? 'text-sm text-muted-foreground' : 'text-sm'}>Wochen</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-month-separators"
                      checked={shouldShowMonthSeparators}
                      disabled={!canShowMonthSeparators}
                      onCheckedChange={handleCheckedChange(setShowMonthSeparators)}
                    />
                    <Label htmlFor="show-month-separators" className={!canShowMonthSeparators ? 'text-sm text-muted-foreground' : 'text-sm'}>Monate</Label>
                  </div>
                  <div className="flex items-center space-x-2">
                    <Checkbox
                      id="show-quarter-separators"
                      checked={shouldShowQuarterSeparators}
                      disabled={!canShowQuarterSeparators}
                      onCheckedChange={handleCheckedChange(setShowQuarterSeparators)}
                    />
                    <Label htmlFor="show-quarter-separators" className={!canShowQuarterSeparators ? 'text-sm text-muted-foreground' : 'text-sm'}>Quartale</Label>
                  </div>
                </div>
              </div>
              {!hasMultipleQuarters && (
                <p className="text-xs text-muted-foreground">
                  Quartalsmarkierungen sind erst sinnvoll, wenn der Zeitraum mehr als ein Quartal umfasst.
                </p>
              )}
            </div>
          </ControlMenu>
        </div>
      )}

      {!isComparisonChart && selectedContract && (
        <div className="flex flex-wrap items-center gap-4 p-2 border rounded-md bg-accent/10">
          <div className="text-sm font-medium">{selectedContract.provider} - {selectedContract.name}: </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-base-price"
              checked={showBasePrice}
              onCheckedChange={handleCheckedChange(setShowBasePrice)}
            />
            <Label htmlFor="show-base-price" className="text-sm">Nettostromkosten</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-network-costs"
              checked={showNetworkCosts}
              onCheckedChange={handleCheckedChange(setShowNetworkCosts)}
            />
            <Label htmlFor="show-network-costs" className="text-sm">Inkl. Netzkosten</Label>
          </div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-with-taxes"
              checked={showWithTaxes}
              onCheckedChange={handleCheckedChange(setShowWithTaxes)}
            />
            <Label htmlFor="show-with-taxes" className="text-sm">Inkl. Steuern</Label>
          </div>
        </div>
      )}

      {!isComparisonChart && showSmartMeterData && smartMeterData && smartMeterData.length > 0 && (
        <div className="flex flex-wrap items-center gap-4 p-2 border rounded-md bg-accent/10">
          <div className="text-sm font-medium">Verbrauchsdaten anzeigen:</div>
          <div className="flex items-center space-x-2">
            <Checkbox
              id="show-consumption"
              checked={showConsumption}
              onCheckedChange={handleCheckedChange(setShowConsumption)}
            />
            <Label htmlFor="show-consumption" className="text-sm">Verbrauch</Label>
          </div>
          {showTotalCost && (
            <div className="flex items-center space-x-2">
              <Checkbox
                id="show-cost"
                checked={showCost}
                onCheckedChange={handleCheckedChange(setShowCost)}
              />
              <Label htmlFor="show-cost" className="text-sm">Kosten</Label>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default EnergyChart;
