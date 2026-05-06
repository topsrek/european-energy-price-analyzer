import type { ReactNode } from 'react';
import { ChevronDown } from 'lucide-react';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

interface ControlDisclosureProps {
  title: string;
  summary: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  children: ReactNode;
}

const ControlDisclosure = ({
  title,
  summary,
  open,
  onOpenChange,
  children,
}: ControlDisclosureProps) => {
  return (
    <Collapsible open={open} onOpenChange={onOpenChange} className="border-t border-border">
      <CollapsibleTrigger asChild>
        <button
          type="button"
          className="flex w-full items-center justify-between gap-3 px-2 py-3 text-left transition-colors hover:bg-muted/40"
        >
          <span className="min-w-0">
            <span className="block text-sm font-medium text-foreground">{title}</span>
            <span className="block truncate text-xs text-muted-foreground">{summary}</span>
          </span>
          <ChevronDown
            className={cn('h-4 w-4 shrink-0 text-muted-foreground transition-transform', open && 'rotate-180')}
          />
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="px-2 pb-3 pt-1">{children}</div>
      </CollapsibleContent>
    </Collapsible>
  );
};

export default ControlDisclosure;
