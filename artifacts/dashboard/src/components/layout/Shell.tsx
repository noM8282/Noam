import * as React from "react"
import { Link, useLocation } from "wouter"
import { useGetMe, useLogout } from "@workspace/api-client-react"
import {
  LayoutDashboard,
  Code2,
  LayoutTemplate,
  KeyRound,
  Server,
  Settings,
  LogOut,
  Menu,
  TerminalSquare
} from "lucide-react"
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"

export function Shell({ children }: { children: React.ReactNode }) {
  const [location] = useLocation()
  const { data: user, isLoading, error } = useGetMe()
  const logout = useLogout()
  const [isMobileOpen, setIsMobileOpen] = React.useState(false)

  if (isLoading) {
    return (
      <div className="min-h-[100dvh] flex items-center justify-center bg-background text-muted-foreground">
        Loading workspace...
      </div>
    )
  }

  if (error || !user) {
    return null // Should be handled by App.tsx to show login
  }

  const navItems = [
    { href: "/", label: "Overview", icon: LayoutDashboard },
    { href: "/scripts", label: "Scripts", icon: Code2 },
    { href: "/panels", label: "Panels", icon: LayoutTemplate },
    { href: "/keys", label: "License Keys", icon: KeyRound },
    { href: "/servers", label: "Servers", icon: Server },
    { href: "/settings", label: "Settings", icon: Settings },
  ]

  const handleLogout = () => {
    logout.mutate(undefined, {
      onSuccess: () => {
        window.location.href = "/login"
      }
    })
  }

  return (
    <div className="flex min-h-[100dvh] bg-background text-foreground">
      {/* Sidebar */}
      <aside className={cn(
        "fixed inset-y-0 left-0 z-50 w-64 border-r border-sidebar-border bg-sidebar transition-transform md:translate-x-0",
        isMobileOpen ? "translate-x-0" : "-translate-x-full"
      )}>
        <div className="flex h-14 items-center border-b border-sidebar-border px-6">
          <Link href="/" className="flex items-center gap-2 font-bold tracking-tight text-primary">
            <TerminalSquare className="h-5 w-5" />
            <span>LuaBox</span>
          </Link>
        </div>
        <div className="flex flex-col h-[calc(100vh-3.5rem)] py-4">
          <nav className="flex-1 space-y-1 px-3">
            {navItems.map((item) => {
              const isActive = location === item.href || (item.href !== "/" && location.startsWith(item.href))
              return (
                <Link
                  key={item.href}
                  href={item.href}
                  className={cn(
                    "flex items-center gap-3 rounded-md px-3 py-2 text-sm font-medium transition-colors",
                    isActive 
                      ? "bg-primary/10 text-primary" 
                      : "text-sidebar-foreground/70 hover:bg-sidebar-accent hover:text-sidebar-foreground"
                  )}
                  onClick={() => setIsMobileOpen(false)}
                >
                  <item.icon className="h-4 w-4" />
                  {item.label}
                </Link>
              )
            })}
          </nav>
          <div className="px-3 mt-auto">
            <div className="mb-4 flex items-center gap-3 px-3 py-2 text-sm text-sidebar-foreground">
              <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center text-primary font-bold uppercase shrink-0">
                {user.username.charAt(0)}
              </div>
              <div className="overflow-hidden">
                <p className="truncate font-medium">{user.username}</p>
              </div>
            </div>
            <button
              onClick={handleLogout}
              className="flex w-full items-center gap-3 rounded-md px-3 py-2 text-sm font-medium text-sidebar-foreground/70 transition-colors hover:bg-destructive/10 hover:text-destructive"
            >
              <LogOut className="h-4 w-4" />
              Sign out
            </button>
          </div>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 md:pl-64 flex flex-col min-h-[100dvh]">
        <div className="sticky top-0 z-40 flex h-14 items-center border-b border-border bg-background/95 backdrop-blur px-4 md:hidden">
          <Button variant="ghost" size="icon" onClick={() => setIsMobileOpen(!isMobileOpen)}>
            <Menu className="h-5 w-5" />
          </Button>
          <span className="ml-4 font-bold text-primary">LuaBox</span>
        </div>
        <div className="flex-1 p-6 md:p-8">
          {children}
        </div>
      </main>
    </div>
  )
}
