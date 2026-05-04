import { Check, ChevronsUpDown } from 'lucide-react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { RegionConfig, regions, saveSelectedRegion } from '@/config/regions';

interface RegionSwitcherProps {
  currentRegion: RegionConfig;
}

const RegionSwitcher = ({ currentRegion }: RegionSwitcherProps) => {
  const navigate = useNavigate();

  const handleRegionSelect = (region: RegionConfig) => {
    saveSelectedRegion(region.code);
    navigate(region.path);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9">
          {currentRegion.appCode}
          <ChevronsUpDown className="h-4 w-4" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel>Region</DropdownMenuLabel>
        <DropdownMenuSeparator />
        {regions.map((region) => (
          <DropdownMenuItem
            key={region.code}
            onSelect={() => handleRegionSelect(region)}
            className="flex items-center justify-between gap-3"
          >
            <span>
              <span className="block font-medium">{region.localName}</span>
              <span className="block text-xs text-muted-foreground">{region.title}</span>
            </span>
            {region.code === currentRegion.code && <Check className="h-4 w-4" />}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

export default RegionSwitcher;
