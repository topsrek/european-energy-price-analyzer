import { cn } from '@/lib/utils';

interface RegionFlagProps {
  flagCodes: string[];
  className?: string;
}

const flagUrl = (countryCode: string) => `/flags/${countryCode.toLowerCase()}.svg`;

const RegionFlag = ({ flagCodes, className }: RegionFlagProps) => {
  const normalizedCodes = [...new Set(flagCodes.map((code) => code.toUpperCase()))];

  if (normalizedCodes.length === 1) {
    return (
      <img
        src={flagUrl(normalizedCodes[0])}
        alt=""
        aria-hidden="true"
        className={cn('h-4 w-6 shrink-0 rounded-[1px] object-cover', className)}
        loading="eager"
        decoding="async"
      />
    );
  }

  return (
    <span className={cn('flex shrink-0 items-center -space-x-1', className)} aria-hidden="true">
      {normalizedCodes.map((countryCode) => (
        <img
          key={countryCode}
          src={flagUrl(countryCode)}
          alt=""
          className="h-4 w-6 rounded-[1px] border border-background object-cover shadow-sm"
          loading="eager"
          decoding="async"
        />
      ))}
    </span>
  );
};

export default RegionFlag;
