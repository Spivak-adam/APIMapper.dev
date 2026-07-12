import { ChevronRight } from "lucide-react";

import type { Endpoint } from "../types";
import { MethodBadge } from "./MethodBadge";

interface EndpointTableProps {
  endpoints: Endpoint[];
  selectedEndpoint?: Endpoint;
  onSelectEndpoint: (endpoint: Endpoint) => void;
}

export function EndpointTable({
  endpoints,
  selectedEndpoint,
  onSelectEndpoint
}: EndpointTableProps) {
  if (endpoints.length === 0) {
    return (
      <div className="empty-state">
        <h3>No endpoints found</h3>
        <p>Try changing your search or filters.</p>
      </div>
    );
  }

  return (
    <div className="table-container">
      <table>
        <thead>
          <tr>
            <th>Method</th>
            <th>Route</th>
            <th>Function</th>
            <th>Source File</th>
            <th />
          </tr>
        </thead>

        <tbody>
          {endpoints.map((endpoint) => (
            <tr
              key={endpoint.id}
              className={
                selectedEndpoint?.id === endpoint.id
                  ? "selected-row"
                  : ""
              }
              onClick={() =>
                onSelectEndpoint(endpoint)
              }
            >
              <td>
                <MethodBadge
                  method={endpoint.method}
                />
              </td>

              <td className="route-column">
                {endpoint.route}
              </td>

              <td>
                {endpoint.functionName ?? "Not detected"}
              </td>

              <td className="file-column">
                {endpoint.filePath}
              </td>

              <td>
                <ChevronRight size={18} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}