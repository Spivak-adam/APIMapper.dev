import { X } from "lucide-react";

import type {
  Endpoint,
  ResponseProperty,
} from "../types";

import { MethodBadge } from "./MethodBadge";

interface EndpointDetailsProps {
  endpoint?: Endpoint;
  onClose: () => void;
}

function ResponseSchema({
  schema,
}: {
  schema: ResponseProperty;
}) {
  return (
    <div className="response-schema">
      <div className="schema-row">
        <code>{schema.name}</code>

        <span>{schema.type}</span>

        {schema.nullable && (
          <small>nullable</small>
        )}
      </div>

      {schema.properties &&
        schema.properties.length > 0 && (
          <div className="nested-schema">
            {schema.properties.map(
              (property, index) => (
                <ResponseSchema
                  key={`${property.name}-${index}`}
                  schema={property}
                />
              ),
            )}
          </div>
        )}

      {schema.items &&
        schema.items.length > 0 && (
          <div className="nested-schema">
            {schema.items.map(
              (item, index) => (
                <ResponseSchema
                  key={`${item.name}-${index}`}
                  schema={item}
                />
              ),
            )}
          </div>
        )}
    </div>
  );
}

export function EndpointDetails({
  endpoint,
  onClose,
}: EndpointDetailsProps) {
  if (!endpoint) {
    return (
      <aside className="details-panel empty-details">
        <p>
          Select an endpoint to see its details.
        </p>
      </aside>
    );
  }

  const parameters =
    endpoint.requestParameters ?? [];

  return (
    <aside className="details-panel">
      <div className="details-header">
        <div>
          <MethodBadge
            method={endpoint.method}
          />

          <h2>{endpoint.route}</h2>
        </div>

        <button
          type="button"
          className="close-button"
          onClick={onClose}
          aria-label="Close endpoint details"
        >
          <X size={20} />
        </button>
      </div>

      <dl className="metadata-list">
        <div>
          <dt>Source File</dt>
          <dd>{endpoint.filePath}</dd>
        </div>

        <div>
          <dt>Function</dt>
          <dd>
            {endpoint.functionName ||
              "Anonymous handler"}
          </dd>
        </div>

        <div>
          <dt>Router</dt>
          <dd>{endpoint.routerName}</dd>
        </div>

        <div>
          <dt>Line</dt>
          <dd>{endpoint.line}</dd>
        </div>

        <div>
          <dt>Column</dt>
          <dd>{endpoint.column}</dd>
        </div>

        <div>
          <dt>Confidence</dt>
          <dd>{endpoint.confidence}</dd>
        </div>
      </dl>

      <section className="details-section">
        <h3>Request Parameters</h3>

        {parameters.length === 0 ? (
          <p className="muted">
            No request parameters detected.
          </p>
        ) : (
          <ul className="parameter-list">
            {parameters.map(
              (parameter, index) => (
                <li
                  key={`${parameter.name}-${parameter.source}-${index}`}
                >
                  <div>
                    <code>
                      {parameter.name}
                    </code>

                    {parameter.required && (
                      <small>
                        required
                      </small>
                    )}
                  </div>

                  <div className="parameter-metadata">
                    <span>
                      {
                        parameter.inferredType
                      }
                    </span>

                    <small>
                      {parameter.source}
                    </small>
                  </div>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="details-section">
        <h3>Responses</h3>

        {endpoint.responses.length === 0 ? (
          <p className="muted">
            No responses detected.
          </p>
        ) : (
          <ul className="response-list">
            {endpoint.responses.map(
              (response, index) => (
                <li
                  key={`${response.status}-${response.method}-${index}`}
                >
                  <div className="response-heading">
                    <strong>
                      {response.status}
                    </strong>

                    <span>
                      {response.method}
                    </span>
                  </div>

                  {response.schema ? (
                    <ResponseSchema
                      schema={
                        response.schema
                      }
                    />
                  ) : (
                    <p className="muted">
                      No response schema
                      detected.
                    </p>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="details-section">
        <h3>Middleware</h3>

        {endpoint.middleware.length === 0 ? (
          <p className="muted">
            No middleware detected.
          </p>
        ) : (
          <ul className="middleware-list">
            {endpoint.middleware.map(
              (middleware, index) => (
                <li
                  key={`${middleware.name}-${index}`}
                >
                  <code>
                    {middleware.name}
                  </code>

                  <span>
                    {
                      middleware.expression
                    }
                  </span>
                </li>
              ),
            )}
          </ul>
        )}
      </section>

      <section className="details-section">
        <h3>Database Operations</h3>

        {endpoint.databaseOperations
          .length === 0 ? (
          <p className="muted">
            No database operations detected.
          </p>
        ) : (
          <ul className="database-list">
            {endpoint.databaseOperations.map(
              (operation, index) => (
                <li
                  key={`${operation.operation}-${index}`}
                >
                  <div>
                    <strong>
                      {operation.operation}
                    </strong>

                    <span>
                      {operation.table ??
                        "Unknown table"}
                    </span>
                  </div>

                  <small>
                    Client:{" "}
                    {operation.client}
                  </small>

                  {operation.selectedFields
                    .length > 0 && (
                    <p>
                      Fields:{" "}
                      {operation.selectedFields.join(
                        ", ",
                      )}
                    </p>
                  )}
                </li>
              ),
            )}
          </ul>
        )}
      </section>
    </aside>
  );
}