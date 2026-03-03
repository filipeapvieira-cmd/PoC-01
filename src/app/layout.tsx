import type { Metadata } from "next";
import "./globals.css";
import Link from "next/link";

export const metadata: Metadata = {
  title: "CSP – Community Sustainability Platform",
  description: "API integration discovery and validation for sustainability data sources across Scotland",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <nav className="nav">
          <div className="nav-inner">
            <Link href="/" className="nav-brand">
              <span className="nav-brand-icon">🌿</span>
              <span>CSP</span>
            </Link>
            <ul className="nav-links">
              <li><Link href="/integrations" className="nav-link">Integrations</Link></li>
              <li><Link href="/metrics" className="nav-link">Metrics</Link></li>
              <li><Link href="/admin/run" className="nav-link">Admin</Link></li>
            </ul>
          </div>
        </nav>
        {children}
      </body>
    </html>
  );
}
