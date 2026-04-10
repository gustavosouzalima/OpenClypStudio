"use client";

import { useState, useEffect } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { motion } from "motion/react";
import { Button } from "./ui/button";
import { ArrowRight, LogOut, Cpu, Zap } from "lucide-react";
import Image from "next/image";
import { ThemeToggle } from "./theme-toggle";
import {
  Copy01Icon,
  Download01Icon,
  GithubIcon,
  LinkSquare02Icon,
  Menu02Icon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { cn } from "@/utils/ui";
import { SOCIAL_LINKS } from "@/constants/site-constants";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from "./ui/context-menu";
import { pixelApi } from "@/integrations/pixel/api";

const HEADER_LOGO_URL = "/logos/logo.svg";

function useIsLoggedIn() {
  const [loggedIn, setLoggedIn] = useState(false);
  useEffect(() => {
    setLoggedIn(document.cookie.includes("__session_flag=1"));
  }, []);
  return loggedIn;
}

function useDeviceInfo() {
  const [device, setDevice] = useState<{
    type: "cpu" | "cuda" | string;
    name?: string | null;
  } | null>(null);

  useEffect(() => {
    pixelApi
      .getSystemDeps()
      .then((deps) => setDevice({ type: deps.gpu.device, name: deps.gpu.name }))
      .catch(() => {});
  }, []);

  return device;
}

function DeviceBadge() {
  const device = useDeviceInfo();
  if (!device) return null;

  const isCuda = device.type === "cuda";
  return (
    <div
      className={cn(
        "flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-[11px] font-medium leading-none select-none",
        isCuda
          ? "border-emerald-500/30 bg-emerald-500/10 text-emerald-500"
          : "border-muted-foreground/20 bg-muted/40 text-muted-foreground",
      )}
      title={device.name ?? (isCuda ? "CUDA GPU" : "CPU inference")}
    >
      {isCuda ? <Zap className="size-3" /> : <Cpu className="size-3" />}
      {isCuda ? "GPU" : "CPU"}
    </div>
  );
}

export function Header() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const router = useRouter();
  const isLoggedIn = useIsLoggedIn();

  async function handleLogout() {
    await fetch("/api/auth-simple/logout", { method: "POST" });
    router.push("/login");
    router.refresh();
  }
  const closeMenu = () => setIsMenuOpen(false);

  const links = [
    {
      label: "Projects",
      href: "/projects",
    },
    {
      label: "Audio Recorder",
      href: "/audio-recorder",
    },
    {
      label: "Transcriptions",
      href: "/transcriptions",
    },
    {
      label: "History",
      href: "/history",
    },
    {
      label: "Documents",
      href: "/documents",
    },
    {
      label: "Settings",
      href: "/settings",
    },
  ];

  return (
    <header className="bg-background shadow-background/85 sticky top-0 z-10 shadow-[0_30px_35px_15px_rgba(0,0,0,1)]">
      <div className="relative flex w-full items-center justify-between px-6 pt-4">
        <div className="relative z-10 flex items-center gap-6">
          <ContextMenu>
            <ContextMenuTrigger asChild>
              <Link href="/" className="flex items-center gap-3">
                <Image
                  src={HEADER_LOGO_URL}
                  alt="OpenClyp Studio Logo"
                  className="h-12 w-auto dark:invert"
                  width={160}
                  height={60}
                />
              </Link>
            </ContextMenuTrigger>
            <ContextMenuContent>
              <ContextMenuItem
                onClick={async () => {
                  const res = await fetch(HEADER_LOGO_URL);
                  const svg = await res.text();
                  await navigator.clipboard.writeText(svg);
                }}
              >
                <HugeiconsIcon icon={Copy01Icon} />
                Copy SVG
              </ContextMenuItem>
              <ContextMenuItem
                onClick={() => {
                  const a = document.createElement("a");
                  a.href = HEADER_LOGO_URL;
                  a.download = "logo.svg";
                  a.click();
                }}
              >
                <HugeiconsIcon icon={Download01Icon} />
                Download SVG
              </ContextMenuItem>
              <Link href="/brand">
                <ContextMenuItem>
                  <HugeiconsIcon icon={LinkSquare02Icon} />
                  Brand Assets
                </ContextMenuItem>
              </Link>
            </ContextMenuContent>
          </ContextMenu>

          <nav className="hidden items-center gap-4 md:flex">
            {links.map((link) => (
              <Link key={link.href} href={link.href}>
                <Button variant="text" className="p-0 text-sm">
                  {link.label}
                </Button>
              </Link>
            ))}
          </nav>
        </div>

        <div className="relative z-10">
          <div className="flex items-center gap-3 md:hidden">
            <Button
              variant="text"
              size="icon"
              className="flex items-center justify-center p-0"
              onClick={() => setIsMenuOpen(!isMenuOpen)}
            >
              <HugeiconsIcon icon={Menu02Icon} size={30} />
            </Button>
          </div>
          <div className="hidden items-center gap-3 md:flex">
            <DeviceBadge />
            <Link href={SOCIAL_LINKS.github}>
              <Button className="bg-background text-sm" variant="outline">
                <HugeiconsIcon icon={GithubIcon} className="size-4" />
                GitHub
              </Button>
            </Link>
            <Link href="/projects">
              <Button className="text-sm">
                Projects
                <ArrowRight className="size-4" />
              </Button>
            </Link>
            {isLoggedIn && (
              <Button
                variant="ghost"
                size="icon"
                onClick={handleLogout}
                title="Sair"
                className="text-muted-foreground hover:text-foreground"
              >
                <LogOut className="size-4" />
              </Button>
            )}
            <ThemeToggle />
          </div>
        </div>
        <div
          className={cn(
            "bg-background/20 pointer-events-none fixed inset-0 opacity-0 backdrop-blur-3xl",
            "transition-opacity duration-150",
            isMenuOpen && "pointer-events-auto opacity-100",
          )}
        >
          <div className="relative h-full">
            <button
              type="button"
              aria-label="Close menu"
              className="absolute inset-0"
              onClick={closeMenu}
              onKeyDown={(event) => {
                if (
                  event.key === "Enter" ||
                  event.key === " " ||
                  event.key === "Escape"
                ) {
                  event.preventDefault();
                  closeMenu();
                }
              }}
            />
            <nav className="flex flex-col gap-3 px-6 pt-[5rem]">
              {links.map((link, index) => (
                <motion.div
                  key={link.href}
                  initial={{ scale: 0.98, opacity: 0 }}
                  animate={{
                    scale: isMenuOpen ? 1 : 0.98,
                    opacity: isMenuOpen ? 1 : 0,
                  }}
                  transition={{
                    duration: 0.4,
                    delay: isMenuOpen ? index * 0.1 : 0,
                    ease: [0.25, 0.46, 0.45, 0.94],
                  }}
                >
                  <Link
                    href={link.href}
                    className="text-2xl font-semibold"
                    onClick={() => setIsMenuOpen(false)}
                  >
                    {link.label}
                  </Link>
                </motion.div>
              ))}
            </nav>
            <ThemeToggle
              className="absolute right-8 bottom-8 size-10"
              iconClassName="!size-[1.2rem]"
              onToggle={(e) => {
                e.preventDefault();
                e.stopPropagation();
              }}
            />
          </div>
        </div>
      </div>
    </header>
  );
}
