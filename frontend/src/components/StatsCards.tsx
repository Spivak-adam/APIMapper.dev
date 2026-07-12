import { Braces, Files, Route } from "lucide-react";
import type { Endpoint } from "../types";

interface StatsCardsProps {
  endpoints: Endpoint[];
  filesScanned?: number;
}

export function StatsCards({
  endpoints,
  filesScanned
}: StatsCardsProps) {
  const uniqueFiles = new Set(
    endpoints
      .map((endpoint) => endpoint.filePath)
      .filter(Boolean)
  ).size;

  const uniqueMethods = new Set(
    endpoints.map((endpoint) =>
      endpoint.method.toUpperCase()
    )
  ).size;

  const cards = [
    {
      title: "Endpoints",
      value: endpoints.length,
      icon: Route
    },
    {
      title: "Files Scanned",
      value: filesScanned ?? uniqueFiles,
      icon: Files
    },
    {
      title: "HTTP Methods",
      value: uniqueMethods,
      icon: Braces
    }
  ];

  return (
    <section className="stats-grid">
      {cards.map(({ title, value, icon: Icon }) => (
        <article className="stat-card" key={title}>
          <div>
            <p>{title}</p>
            <strong>{value}</strong>
          </div>

          <Icon size={24} />
        </article>
      ))}
    </section>
  );
}