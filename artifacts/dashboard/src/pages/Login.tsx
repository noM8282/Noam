import * as React from "react"
import { Button } from "@/components/ui/button"
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card"
import { TerminalSquare, Copy, Check, AlertTriangle } from "lucide-react"

export function Login() {
  const [redirectUri, setRedirectUri] = React.useState<string | null>(null)
  const [copied, setCopied] = React.useState(false)

  React.useEffect(() => {
    fetch("/api/auth/redirect-uri")
      .then((r) => r.json())
      .then((d) => setRedirectUri(d.redirectUri))
      .catch(() => {})
  }, [])

  function copy() {
    if (!redirectUri) return
    navigator.clipboard.writeText(redirectUri).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }

  return (
    <div className="min-h-[100dvh] flex items-center justify-center bg-background p-4">
      <div className="w-full max-w-md space-y-3">
        <Card className="shadow-xl border-border">
          <CardHeader className="space-y-4 items-center text-center">
            <div className="h-12 w-12 rounded-lg bg-primary/10 flex items-center justify-center">
              <TerminalSquare className="h-6 w-6 text-primary" />
            </div>
            <div className="space-y-2">
              <CardTitle className="text-2xl font-bold tracking-tight">Welcome to LuaBox</CardTitle>
              <CardDescription className="text-base">
                The professional control panel for script developers.
              </CardDescription>
            </div>
          </CardHeader>
          <CardContent className="flex flex-col space-y-4 pt-4">
            <Button
              size="lg"
              className="w-full font-medium"
              onClick={() => { window.location.href = "/api/auth/discord" }}
            >
              Log in with Discord
            </Button>
            <p className="text-xs text-center text-muted-foreground">
              By logging in, you agree to our Terms of Service and Privacy Policy.
            </p>
          </CardContent>
        </Card>

        {/* Discord OAuth setup helper */}
        {redirectUri && (
          <Card className="border-yellow-500/30 bg-yellow-500/5">
            <CardContent className="pt-4 pb-4 space-y-2">
              <div className="flex items-center gap-2 text-yellow-400 text-sm font-medium">
                <AlertTriangle className="h-4 w-4 shrink-0" />
                Discord OAuth setup required
              </div>
              <p className="text-xs text-muted-foreground">
                In your Discord app → <strong>OAuth2 → Redirects</strong>, add this exact URL:
              </p>
              <div className="flex items-center gap-2 bg-background rounded border border-border px-3 py-2">
                <code className="text-xs text-primary flex-1 break-all">{redirectUri}</code>
                <Button variant="ghost" size="icon" className="h-6 w-6 shrink-0" onClick={copy}>
                  {copied ? <Check className="h-3 w-3 text-green-400" /> : <Copy className="h-3 w-3" />}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground">
                Save it in Discord's portal, then click "Log in with Discord" above.
              </p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  )
}
