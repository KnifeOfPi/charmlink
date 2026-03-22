"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";

export function AdminNav() {
  const pathname = usePathname();
  const router = useRouter();

  function logout() {
    localStorage.removeItem("charmlink_admin_key");
    router.push("/admin");
  }

  const links = [
    { href: "/admin/dashboard", label: "Dashboard", icon: "📊" },
    { href: "/admin/creators", label: "Creators", icon: "👤" },
    { href: "/admin/analytics", label: "Analytics", icon: "📈" },
    { href: "/admin/domains", label: "Domains", icon: "🌐" },
  ];

  return (
    <nav className="bg-[#111] border-b border-[#222] sticky top-0 z-50">
      <div className="max-w-7xl mx-auto px-4 flex items-center justify-between h-14">
        <div className="flex items-center gap-6">
          <Link href="/admin/dashboard" className="text-white font-bold text-lg">
            🔗 CharmLink
          </Link>
          <div className="hidden sm:flex items-center gap-1">
            {links.map((link) => (
              <Link
                key={link.href}
                href={link.href}
                className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-sm transition-colors ${
                  pathname?.startsWith(link.href)
                    ? "bg-[#e91e8a] text-white"
                    : "text-gray-400 hover:text-white hover:bg-[#1a1a1a]"
                }`}
              >
                <span>{link.icon}</span>
                <span>{link.label}</span>
              </Link>
            ))}
          </div>
        </div>
        <button
          onClick={logout}
          className="text-gray-500 hover:text-white text-sm transition-colors"
        >
          Logout
        </button>
      </div>

      {/* Mobile nav */}
      <div className="sm:hidden flex border-t border-[#222] overflow-x-auto">
        {links.map((link) => (
          <Link
            key={link.href}
            href={link.href}
            className={`flex-1 flex flex-col items-center py-2 text-xs transition-colors min-w-0 ${
              pathname?.startsWith(link.href)
                ? "text-[#e91e8a]"
                : "text-gray-500"
            }`}
          >
            <span className="text-base">{link.icon}</span>
            <span className="truncate">{link.label}</span>
          </Link>
        ))}
      </div>
    </nav>
  );
}
