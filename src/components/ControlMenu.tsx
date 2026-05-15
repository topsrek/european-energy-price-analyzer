import type { ReactNode } from 'react';
import type { LucideIcon } from 'lucide-react';
import { ChevronDown } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { cn } from '@/lib/utils';

interface ControlMenuProps {
  label: string;
  icon: LucideIcon;
  children: ReactNode;
  contentClassName?: string;
  triggerClassName?: string;
}

const ControlMenu = ({
  label,
  icon: Icon,
  children,
  contentClassName,
  triggerClassName,
}: ControlMenuProps) => {
  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button
          variant="outline"
          size="sm"
          className={cn('h-9 gap-2 px-3', triggerClassName)}
        >
          <Icon className="h-4 w-4" />
          <span>{label}</span>
          <ChevronDown className="h-4 w-4 text-muted-foreground" />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className={cn('w-72 space-y-4 p-3', contentClassName)}>
        {children}
      </PopoverContent>
    </Popover>
  );
};

export default ControlMenu;
