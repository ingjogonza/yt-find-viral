type RadioOption = {
  value: string;
  label: string;
};

type RadioToggleFieldProps = {
  legend: string;
  name: string;
  options: RadioOption[];
  /** Currently selected value, or null for "any" (the unset/default state). */
  selectedValue: string | null;
  anyLabel?: string;
};

/**
 * A small mutually-exclusive radio group (2-3 options plus an implicit
 * "any"/unset option) — per accessibility guidance, radios beat a <select>
 * when there are only a handful of choices (zero-click scanning). Used for
 * the classification toggles: Calidad, Faces/Faceless, Contenido para
 * niños, Contenido sintético/IA.
 */
export function RadioToggleField({ legend, name, options, selectedValue, anyLabel = "Cualquiera" }: RadioToggleFieldProps) {
  return (
    <fieldset className="rounded-md border border-gray-200 p-3">
      <legend className="px-1 text-sm font-medium text-gray-700">{legend}</legend>
      <div className="mt-1 flex flex-col gap-1.5">
        <label className="flex items-center gap-2 text-sm text-gray-700">
          <input type="radio" name={name} value="" defaultChecked={selectedValue === null} />
          {anyLabel}
        </label>
        {options.map((option) => (
          <label key={option.value} className="flex items-center gap-2 text-sm text-gray-700">
            <input type="radio" name={name} value={option.value} defaultChecked={selectedValue === option.value} />
            {option.label}
          </label>
        ))}
      </div>
    </fieldset>
  );
}
