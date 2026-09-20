import { BarChart3, Check, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuSeparator,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RegionConfig, regions, saveSelectedRegion } from '@/config/regions';
import RegionFlag from './RegionFlag';

interface RegionSwitcherProps {
  currentRegion?: RegionConfig;
  isComparison?: boolean;
}

const displayCountryName = (region: RegionConfig) => {
  return region.localName;
};

const secondaryCountryName = (region: RegionConfig, primaryName: string) => {
  const names = [region.countryName, region.localName].filter((name) => name !== primaryName);
  return names[0] ?? region.countryName;
};

const RegionSwitcher = ({ currentRegion, isComparison = false }: RegionSwitcherProps) => {
  const navigate = useNavigate();
  const sortedRegions = [...regions].sort((a, b) =>
    displayCountryName(a).localeCompare(displayCountryName(b), currentRegion?.language ?? 'de')
  );
  const currentName = currentRegion ? displayCountryName(currentRegion) : 'Regionenvergleich';

  const handleRegionSelect = (region: RegionConfig) => {
    saveSelectedRegion(region.code);
    navigate(region.path);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className="h-9 gap-1.5 px-2.5"
          aria-label={isComparison ? currentName : `Region: ${currentName}`}
        >
          {currentRegion ? (
            <RegionFlag flagCodes={currentRegion.flagCodes} />
          ) : (
            <BarChart3 className="h-4 w-4 shrink-0" />
          )}
          <span className="hidden sm:inline">{currentName}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuItem
          onSelect={() => navigate('/compare')}
          className="flex items-center justify-between gap-3"
        >
          <span className="flex min-w-0 items-center gap-2">
            <BarChart3 className="h-4 w-4 shrink-0" />
            <span className="min-w-0">
              <span className="block truncate font-medium">Regionenvergleich</span>
              <span className="block truncate text-[10px] leading-3 text-muted-foreground">
                Mehrere Regionen direkt vergleichen
              </span>
            </span>
          </span>
          {isComparison && <Check className="h-4 w-4 shrink-0" />}
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {sortedRegions.map((region) => {
          const primaryName = displayCountryName(region);
          const secondaryName = secondaryCountryName(region, primaryName);

          return (
            <DropdownMenuItem
              key={region.code}
              onSelect={() => handleRegionSelect(region)}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2">
                <RegionFlag flagCodes={region.flagCodes} />
                <span className="min-w-0">
                  <span className="block truncate font-medium">{primaryName}</span>
                  <span className="block truncate text-[10px] leading-3 text-muted-foreground">{secondaryName}</span>
                </span>
              </span>
              {region.code === currentRegion?.code && <Check className="h-4 w-4 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RegionSwitcher;
