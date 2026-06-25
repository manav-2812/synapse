import { Skeleton } from "./Skeleton";
import { useCountUp } from "../../hooks/useCountUp";

interface Props {
  value: number | string;
  loading?: boolean;
  /** Format the (already animated) numeric value before rendering. */
  format?: (n: number) => string;
}

/**
 * Render a stat tile's value. Numeric values count up from 0 when they
 * scroll into view; formatted strings are rendered as-is. Falls back to a
 * skeleton while `loading`.
 */
export function StatValue({ value, loading, format }: Props) {
  const isNumeric = typeof value === "number";
  const target = isNumeric ? (value as number) : 0;
  const [animated, ref] = useCountUp(target);

  if (loading) return <Skeleton height="30px" />;
  if (!isNumeric) return <div className="stat-value">{value}</div>;

  return (
    <div className="stat-value" ref={ref}>
      {format ? format(animated) : animated}
    </div>
  );
}
