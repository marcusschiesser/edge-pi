"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const navigation = [
	{
		title: "Getting Started",
		links: [
			{ href: "/", label: "Introduction" },
			{ href: "/getting-started", label: "Quick Start" },
		],
	},
	{
		title: "SDK",
		links: [
			{ href: "/sdk", label: "Overview" },
			{ href: "/sdk/tools", label: "Tools" },
			{ href: "/sdk/system-prompt", label: "System Prompt" },
			{ href: "/sdk/sessions", label: "Sessions" },
			{ href: "/sdk/compaction", label: "Compaction" },
		],
	},
	{
		title: "CLI",
		links: [
			{ href: "/cli", label: "Overview" },
			{ href: "/cli/modes", label: "Modes" },
			{ href: "/cli/providers", label: "Providers & Auth" },
			{ href: "/cli/skills", label: "Skills" },
			{ href: "/cli/sessions", label: "Sessions" },
		],
	},
];

export function Sidebar() {
	const pathname = usePathname();

	return (
		<aside className="sidebar">
			<div className="sidebar-header">
				<h2>edge-pi</h2>
				<p>SDK & CLI Documentation</p>
			</div>
			<nav>
				{navigation.map((section) => (
					<div key={section.title} className="nav-section">
						<div className="nav-section-title">{section.title}</div>
						{section.links.map((link) => (
							<Link
								key={link.href}
								href={link.href}
								className={`nav-link ${pathname === link.href ? "active" : ""}`}
							>
								{link.label}
							</Link>
						))}
					</div>
				))}
			</nav>
		</aside>
	);
}
