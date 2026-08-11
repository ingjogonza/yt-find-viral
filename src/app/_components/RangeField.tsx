type RangeFieldProps = {
  legend: string;
  minName: string;
  maxName: string;
  minValue: number | null;
  maxValue: number | null;
  step?: number;
  min?: number;
};

/**
 * A labeled min/max numeric range input pair, grouped in a <fieldset> with
 * a visible <legend>, and a visible (small) label per input — per
 * accessibility guidance, placeholders alone are not an acceptable label.
 * Pure presentational Server Component: no client JS, relies on the parent
 * <form> (native GET submit) to carry these values.
 */
export function RangeField({ legend, minName, maxName, minValue, maxValue, step = 1, min = 0 }: RangeFieldProps) {
  return (
    <fieldset className="rounded-md border border-gray-200 p-3">
      <legend className="px-1 text-sm font-medium text-gray-700">{legend}</legend>
      <div className="flex gap-2">
        <div className="flex-1">
          <label htmlFor={minName} className="block text-xs text-gray-500">
            Mín.
          </label>
          <input
            type="number"
            id={minName}
            name={minName}
            min={min}
            step={step}
            defaultValue={minValue ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
        <div className="flex-1">
          <label htmlFor={maxName} className="block text-xs text-gray-500">
            Máx.
          </label>
          <input
            type="number"
            id={maxName}
            name={maxName}
            min={min}
            step={step}
            defaultValue={maxValue ?? ""}
            className="mt-1 block w-full rounded-md border border-gray-300 px-2 py-1.5 text-sm"
          />
        </div>
      </div>
    </fieldset>
  );
}
