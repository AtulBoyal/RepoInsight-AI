import HomePage from "./pages/HomePage";
import SharedReportPage from "./pages/SharedReportPage";
import { currentShareId } from "./sharing/shareLinks";

/**
 * Two pages: the analyzer, and shared reports at /r/<shareId>.
 * (Vercel serves index.html for /r/* via vercel.json.)
 */
export default function App() {
  const shareId = currentShareId();

  return shareId ? <SharedReportPage shareId={shareId} /> : <HomePage />;
}
