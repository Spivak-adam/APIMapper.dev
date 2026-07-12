import { Search } from "lucide-react";

interface FiltersProps {
  search: string;
  selectedMethod: string;
  methods: string[];
  onSearchChange: (value: string) => void;
  onMethodChange: (value: string) => void;
}

export function Filters({
  search,
  selectedMethod,
  methods,
  onSearchChange,
  onMethodChange
}: FiltersProps) {
  return (
    <section className="filters">
      <label className="search-box">
        <Search size={18} />

        <input
          type="text"
          placeholder="Search route, file, or function..."
          value={search}
          onChange={(event) =>
            onSearchChange(event.target.value)
          }
        />
      </label>

      <select
        value={selectedMethod}
        onChange={(event) =>
          onMethodChange(event.target.value)
        }
      >
        <option value="ALL">All methods</option>

        {methods.map((method) => (
          <option value={method} key={method}>
            {method}
          </option>
        ))}
      </select>
    </section>
  );
}