import {
  Navigate,
  Route,
  Routes,
} from "react-router-dom";

import EndpointExplorerPage from "./pages/EndpointExplorerPage";
import ArchitectureMapPage from "./pages/ArchitectureMapPage";

export default function App() {
  return (
    <Routes>
      <Route
        path="/"
        element={<EndpointExplorerPage />}
      />

      <Route
        path="/map"
        element={<ArchitectureMapPage />}
      />

      <Route
        path="*"
        element={<Navigate to="/" replace />}
      />
    </Routes>
  );
}