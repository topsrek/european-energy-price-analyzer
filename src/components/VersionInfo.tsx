
import React from 'react';
import datesConfig from '@/config/dates.json';
import { Info } from 'lucide-react';
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from '@/components/ui/tooltip';

const VersionInfo = () => {
  return (
    <div className="flex items-center gap-1 text-sm text-muted-foreground">
      <span>Version {datesConfig.version}</span>
      <TooltipProvider>
        <Tooltip>
          <TooltipTrigger asChild>
            <button className="inline-flex items-center">
              <Info className="h-4 w-4" />
            </button>
          </TooltipTrigger>
          <TooltipContent side="bottom">
            <p>Zuletzt aktualisiert: {datesConfig.lastUpdated}</p>
          </TooltipContent>
        </Tooltip>
      </TooltipProvider>
    </div>
  );
};

export default VersionInfo;
