import React from 'react';
import {
  Drawer,
  DrawerContent,
  DrawerDescription,
  DrawerHeader,
  DrawerTitle,
  DrawerTrigger,
} from '@/components/ui/drawer';

interface DateRangeDrawerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  trigger: React.ReactElement;
  children: React.ReactNode;
}

/** Mobile date range drawer, in its own chunk so desktop visitors never download vaul. */
const DateRangeDrawer: React.FC<DateRangeDrawerProps> = ({ open, onOpenChange, trigger, children }) => (
  <Drawer open={open} onOpenChange={onOpenChange}>
    <DrawerTrigger asChild>{trigger}</DrawerTrigger>
    <DrawerContent>
      <DrawerHeader>
        <DrawerTitle>Zeitraum wählen</DrawerTitle>
        <DrawerDescription className="sr-only">Start- und Enddatum für die Preisanzeige auswählen.</DrawerDescription>
      </DrawerHeader>
      <div className="mx-auto pb-4">{children}</div>
    </DrawerContent>
  </Drawer>
);

export default DateRangeDrawer;
