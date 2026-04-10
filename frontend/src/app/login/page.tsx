"use client";

import { Suspense, useState, useTransition } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Clapperboard, Eye, EyeOff, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { cn } from "@/utils/ui";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const next = searchParams.get("next") ?? "/projects";

  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isPending, startTransition] = useTransition();

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    startTransition(async () => {
      try {
        const res = await fetch("/api/auth-simple/login", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ password }),
        });

        if (res.ok) {
          router.push(next);
          router.refresh();
        } else {
          const data = (await res.json()) as { error?: string };
          setError(data.error ?? "Erro ao autenticar");
        }
      } catch {
        setError("Erro de conexão. Tente novamente.");
      }
    });
  }

  return (
    <div className="bg-background text-foreground flex min-h-screen items-center justify-center px-4">
      {/* Background glow */}
      <div className="pointer-events-none fixed inset-0 overflow-hidden">
        <div className="absolute top-0 left-1/2 h-[28rem] w-[28rem] -translate-x-1/2 rounded-full bg-cyan-500/8 blur-[100px]" />
        <div className="absolute right-0 bottom-0 h-[20rem] w-[20rem] rounded-full bg-fuchsia-500/8 blur-[100px]" />
      </div>

      <div className="relative w-full max-w-sm space-y-8">
        {/* Logo / Brand */}
        <div className="flex flex-col items-center gap-3 text-center">
          <div className="flex size-12 items-center justify-center rounded-2xl border border-white/10 bg-white/[0.04]">
            <Clapperboard className="size-6 text-cyan-300" />
          </div>
          <div>
            <h1 className="text-2xl font-semibold tracking-tight">
              OpenClyp Studio
            </h1>
            <p className="mt-1 text-sm text-muted-foreground">
              Entre para acessar o workspace
            </p>
          </div>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="space-y-4">
          <div className="space-y-2">
            <label
              htmlFor="password"
              className="text-sm font-medium text-foreground/80"
            >
              Senha
            </label>
            <div className="relative">
              <Input
                id="password"
                type={showPassword ? "text" : "password"}
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="••••••••"
                autoComplete="current-password"
                autoFocus
                required
                disabled={isPending}
                className={cn(
                  "pr-10 transition-colors",
                  error && "border-red-500/60 focus-visible:ring-red-500/30",
                )}
              />
              <button
                type="button"
                onClick={() => setShowPassword((v) => !v)}
                className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                tabIndex={-1}
                aria-label={showPassword ? "Ocultar senha" : "Mostrar senha"}
              >
                {showPassword ? (
                  <EyeOff className="size-4" />
                ) : (
                  <Eye className="size-4" />
                )}
              </button>
            </div>

            {error && (
              <p className="text-sm text-red-400">{error}</p>
            )}
          </div>

          <Button
            type="submit"
            className="w-full"
            disabled={isPending || !password}
          >
            {isPending ? (
              <>
                <Loader2 className="size-4 animate-spin" />
                Entrando…
              </>
            ) : (
              "Entrar"
            )}
          </Button>
        </form>

        <p className="text-center text-xs text-muted-foreground/60">
          Acesso restrito ao proprietário
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="bg-background text-foreground flex min-h-screen items-center justify-center px-4">
          <div className="text-sm text-muted-foreground">Carregando...</div>
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
