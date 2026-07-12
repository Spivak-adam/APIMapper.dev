import {
  FileCode2,
  FolderOpen
} from "lucide-react";

import type { Endpoint } from "../types";

interface FileExplorerProps {
  endpoints: Endpoint[];
  selectedFile: string;
  onSelectFile: (file: string) => void;
}

export function FileExplorer({
  endpoints,
  selectedFile,
  onSelectFile
}: FileExplorerProps) {
  const files = Array.from(
    new Set(
      endpoints
        .map((endpoint) => endpoint.filePath)
        .filter((file): file is string => Boolean(file))
    )
  ).sort();

  return (
    <aside className="file-explorer">
      <div className="panel-title">
        <FolderOpen size={18} />
        <h2>Project Files</h2>
      </div>

      <button
        type="button"
        className={
          selectedFile === "ALL"
            ? "file-button active"
            : "file-button"
        }
        onClick={() => onSelectFile("ALL")}
      >
        <FolderOpen size={16} />

        <span>All files</span>

        <strong>{endpoints.length}</strong>
      </button>

      {files.map((file) => {
        const endpointCount = endpoints.filter(
          (endpoint) => endpoint.filePath === file
        ).length;

        return (
          <button
            type="button"
            className={
              selectedFile === file
                ? "file-button active"
                : "file-button"
            }
            onClick={() => onSelectFile(file)}
            key={file}
            title={file}
          >
            <FileCode2 size={16} />

            <span className="file-name">{file}</span>

            <strong>{endpointCount}</strong>
          </button>
        );
      })}
    </aside>
  );
}