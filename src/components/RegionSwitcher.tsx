import { Check, ChevronDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RegionConfig, regions, saveSelectedRegion } from '@/config/regions';

interface RegionSwitcherProps {
  currentRegion: RegionConfig;
}

const countryFlag = (countryCode: string) =>
  countryCode
    .toUpperCase()
    .replace(/./g, (char) => String.fromCodePoint(127397 + char.charCodeAt(0)));

const displayCountryName = (region: RegionConfig) => {
  try {
    return new Intl.DisplayNames([region.language], { type: 'region' }).of(region.countryCode) ?? region.localName;
  } catch {
    return region.localName;
  }
};

const secondaryCountryName = (region: RegionConfig, primaryName: string) => {
  const names = [region.countryName, region.localName].filter((name) => name !== primaryName);
  return names[0] ?? region.countryName;
};

const RegionSwitcher = ({ currentRegion }: RegionSwitcherProps) => {
  const navigate = useNavigate();
  const sortedRegions = [...regions].sort((a, b) =>
    displayCountryName(a).localeCompare(displayCountryName(b), currentRegion.language)
  );
  const currentName = displayCountryName(currentRegion);

  const handleRegionSelect = (region: RegionConfig) => {
    saveSelectedRegion(region.code);
    navigate(region.path);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 gap-1.5 px-2.5">
          <span aria-hidden="true">{countryFlag(currentRegion.countryCode)}</span>
          <span className="hidden sm:inline">{currentName}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
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
                <span aria-hidden="true">{countryFlag(region.countryCode)}</span>
                <span className="min-w-0">
                  <span className="block truncate font-medium">{primaryName}</span>
                  <span className="block truncate text-[10px] leading-3 text-muted-foreground">{secondaryName}</span>
                </span>
              </span>
              {region.code === currentRegion.code && <Check className="h-4 w-4 shrink-0" />}
            </DropdownMenuItem>
          );
        })}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RegionSwitcher;
